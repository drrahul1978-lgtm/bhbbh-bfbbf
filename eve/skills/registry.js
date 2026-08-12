/* registry.js — every skill EVE has, every version of it, and how well each works.
 *
 * A skill is a generated adapter plus everything you need to decide whether to
 * trust it: where it came from, what it may do, how often it has worked, how
 * fast, what is known to be wrong with it.
 *
 * Three rules are enforced by this file rather than left to good intentions:
 *
 *   A version cannot be installed until it has passed a test. "It compiled" is
 *   not evidence that it works.
 *
 *   The last known-good version is never destroyed. Installing a new version
 *   supersedes the old one; it does not delete it. There is always something to
 *   roll back to.
 *
 *   A replacement must earn its place. A new version is only adopted over an
 *   existing one when it is measurably better on real runs — not because it is
 *   newer, and not on a handful of samples that could be noise.
 *
 * Layout on disk, one directory per skill, written atomically because the Pi
 * can lose power mid-write:
 *
 *   eve-data/skills/<id>/meta.json
 *   eve-data/skills/<id>/v1.js, v2.js, …
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const storage = require("../kernel/storage.js");

/** Where a version is in its life. */
const STATE = {
  DRAFT: "draft",             // written, never tested
  TESTED: "tested",           // passed its checks, eligible to install
  FAILED: "failed",           // tried and did not pass — kept as a record
  INSTALLED: "installed",     // the one in use
  SUPERSEDED: "superseded",   // was installed, replaced by a newer one
  ROLLED_BACK: "rolled_back", // was installed, withdrawn after trouble
};

const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);

class SkillRegistry {
  constructor({ dir = "eve-data/skills", log = null, audit = null } = {}) {
    this.dir = dir;
    this.log = log;
    this.audit = audit;
    fs.mkdirSync(dir, { recursive: true });
  }

  _skillDir(id) { return path.join(this.dir, String(id).replace(/[^a-z0-9_-]/gi, "_")); }
  _metaFile(id) { return path.join(this._skillDir(id), "meta.json"); }
  _sourceFile(id, version) { return path.join(this._skillDir(id), `v${version}.js`); }

  _readMeta(id) {
    const loaded = storage.readWithFallback(this._metaFile(id), null);
    if (!loaded.ok && loaded.reason && loaded.reason !== "not present") {
      this.log?.warn(`skill ${id}: ${loaded.reason}`);
    }
    return loaded.value;
  }

  _writeMeta(id, meta) {
    meta.updatedAt = new Date().toISOString();
    storage.writeJsonVersioned(this._metaFile(id), meta);
  }

  /**
   * File a new version. Always a new version — a skill's source is never
   * overwritten in place, so history stays intact and rollback stays possible.
   */
  register(id, { name, source, spec = null, dependencies = [], permissions = [], origin = "generated" }) {
    if (!id || !source) throw new Error("A skill needs an id and its source.");
    fs.mkdirSync(this._skillDir(id), { recursive: true });

    const meta = this._readMeta(id) || {
      id, name: name || id, createdAt: new Date().toISOString(),
      current: null, versions: [], runs: [], knownIssues: [],
    };
    const version = (meta.versions.at(-1)?.version || 0) + 1;

    storage.writeAtomic(this._sourceFile(id, version), source);
    meta.name = name || meta.name;
    meta.versions.push({
      version,
      state: STATE.DRAFT,
      writtenAt: new Date().toISOString(),
      sourceHash: sha256(source),
      lines: source.trim().split("\n").length,
      spec, dependencies, permissions, origin,
      tests: null,
      installedAt: null,
    });
    this._writeMeta(id, meta);
    this.log?.event("skill_registered", { id, version, origin, lines: meta.versions.at(-1).lines });
    return { id, version };
  }

  /**
   * Record what happened when this version was exercised. Passing tests are the
   * only route to being installable.
   */
  recordTest(id, version, result) {
    const meta = this._readMeta(id);
    const entry = meta?.versions.find((v) => v.version === version);
    if (!entry) throw new Error(`No version ${version} of ${id}`);

    entry.tests = {
      passed: !!result.passed,
      ranAt: new Date().toISOString(),
      isolated: !!result.isolated,
      checks: result.checks || [],
      evidence: result.evidence || null,
      error: result.error || null,
    };
    entry.state = result.passed ? STATE.TESTED : STATE.FAILED;
    this._writeMeta(id, meta);
    this.log?.event("skill_tested", { id, version, passed: entry.tests.passed });
    return entry;
  }

  /**
   * Put a version into service.
   *
   * Refuses anything that has not passed a test, and never removes what it
   * replaced — the previous version becomes superseded and remains on disk as
   * the rollback point.
   */
  install(id, version, { force = false } = {}) {
    const meta = this._readMeta(id);
    const entry = meta?.versions.find((v) => v.version === version);
    if (!entry) throw new Error(`No version ${version} of ${id}`);

    if (entry.state !== STATE.TESTED && !force) {
      throw new Error(
        `Refusing to install ${id} v${version}: it is "${entry.state}", not tested. ` +
        `A skill has to prove it works before it goes into service.`
      );
    }
    if (!fs.existsSync(this._sourceFile(id, version))) {
      throw new Error(`The source for ${id} v${version} is missing from disk.`);
    }

    const previous = meta.current;
    if (previous && previous !== version) {
      const old = meta.versions.find((v) => v.version === previous);
      if (old) old.state = STATE.SUPERSEDED;   // kept, never deleted
    }
    entry.state = STATE.INSTALLED;
    entry.installedAt = new Date().toISOString();
    meta.current = version;
    meta.rollbackTo = previous ?? null;
    this._writeMeta(id, meta);
    this.log?.event("skill_installed", { id, version, replaced: previous ?? null });
    return { id, version, replaced: previous ?? null };
  }

  /** Withdraw the current version and return to the one before it. */
  rollback(id, { reason = "unspecified" } = {}) {
    const meta = this._readMeta(id);
    if (!meta) throw new Error(`No skill ${id}`);
    const target = meta.rollbackTo;
    if (target == null) {
      throw new Error(`${id} has nothing to roll back to — v${meta.current} is the only version ever installed.`);
    }
    const current = meta.versions.find((v) => v.version === meta.current);
    const previous = meta.versions.find((v) => v.version === target);
    if (!previous) throw new Error(`The rollback point for ${id} (v${target}) is missing.`);

    if (current) {
      current.state = STATE.ROLLED_BACK;
      current.rolledBackAt = new Date().toISOString();
      current.rollbackReason = reason;
    }
    previous.state = STATE.INSTALLED;
    meta.current = target;
    // Do not chain further back automatically: one deliberate step at a time.
    meta.rollbackTo = null;
    this._writeMeta(id, meta);
    this.log?.event("skill_rolled_back", { id, from: current?.version, to: target, reason });
    return { id, from: current?.version ?? null, to: target, reason };
  }

  /**
   * Load the source of the version in service, checking it is the same bytes
   * that were registered. A power cut during a write, or a card going bad, can
   * leave a file that parses but is not what EVE tested.
   */
  loadCurrent(id) {
    const meta = this._readMeta(id);
    if (!meta || meta.current == null) return null;
    const entry = meta.versions.find((v) => v.version === meta.current);
    const file = this._sourceFile(id, meta.current);
    if (!fs.existsSync(file)) return { ok: false, reason: `the source for v${meta.current} is missing` };

    const source = fs.readFileSync(file, "utf8");
    if (sha256(source) !== entry.sourceHash) {
      return {
        ok: false, version: meta.current,
        reason: `v${meta.current} on disk does not match what was tested — it may have been damaged or edited. Roll back or re-test before using it.`,
      };
    }
    return { ok: true, id, version: meta.current, source, entry, meta };
  }

  /** Record a real run, which is what the success and error rates are built from. */
  recordRun(id, { version = null, ok, ms = null, error = null, corrected = false }) {
    const meta = this._readMeta(id);
    if (!meta) throw new Error(`No skill ${id}`);
    meta.runs.push({
      at: new Date().toISOString(),
      version: version ?? meta.current,
      ok: !!ok, ms, error: error ? String(error).slice(0, 200) : null,
      corrected: !!corrected,   // a user had to fix the result afterwards
    });
    // A bounded history: enough to measure, small enough for a Pi's card.
    if (meta.runs.length > 500) meta.runs = meta.runs.slice(-500);
    this._writeMeta(id, meta);
    return meta.runs.at(-1);
  }

  /** Performance for one version, or for the skill overall. */
  stats(id, version = null) {
    const meta = this._readMeta(id);
    if (!meta) return null;
    const runs = version == null ? meta.runs : meta.runs.filter((r) => r.version === version);
    const succeeded = runs.filter((r) => r.ok);
    const timed = runs.filter((r) => Number.isFinite(r.ms));
    return {
      id, version,
      runs: runs.length,
      successRate: runs.length ? succeeded.length / runs.length : null,
      errorRate: runs.length ? (runs.length - succeeded.length) / runs.length : null,
      correctionRate: runs.length ? runs.filter((r) => r.corrected).length / runs.length : null,
      averageMs: timed.length ? Math.round(timed.reduce((a, r) => a + r.ms, 0) / timed.length) : null,
      lastRunAt: runs.at(-1)?.at || null,
      lastError: [...runs].reverse().find((r) => r.error)?.error || null,
    };
  }

  /**
   * Should a candidate replace what is installed?
   *
   * Deliberately conservative. Newer is not better, and a handful of runs is
   * not evidence — promoting on noise is how a working system quietly degrades.
   */
  compare(id, currentVersion, candidateVersion, { minSamples = 20, successMargin = 0.05, speedMargin = 0.2 } = {}) {
    const a = this.stats(id, currentVersion);
    const b = this.stats(id, candidateVersion);
    if (!a || !b) throw new Error(`Cannot compare: one of those versions of ${id} does not exist.`);

    if (a.runs < minSamples || b.runs < minSamples) {
      return {
        decision: "insufficient_evidence",
        why: `only ${a.runs} and ${b.runs} runs — ${minSamples} each are needed before this means anything`,
        current: a, candidate: b,
      };
    }

    const successGain = b.successRate - a.successRate;
    if (successGain > successMargin) {
      return { decision: "adopt", why: `succeeds ${(successGain * 100).toFixed(1)}% more often`, current: a, candidate: b };
    }
    if (successGain < -0.01) {
      return { decision: "reject", why: `succeeds ${(-successGain * 100).toFixed(1)}% less often`, current: a, candidate: b };
    }
    // Success is level; speed can still decide it.
    if (a.averageMs && b.averageMs) {
      const speedGain = (a.averageMs - b.averageMs) / a.averageMs;
      if (speedGain > speedMargin) {
        return { decision: "adopt", why: `as reliable but ${(speedGain * 100).toFixed(0)}% faster`, current: a, candidate: b };
      }
    }
    return { decision: "keep_current", why: "no meaningful improvement — newer is not a reason", current: a, candidate: b };
  }

  addKnownIssue(id, issue) {
    const meta = this._readMeta(id);
    if (!meta) throw new Error(`No skill ${id}`);
    meta.knownIssues.push({ at: new Date().toISOString(), ...(typeof issue === "string" ? { note: issue } : issue) });
    this._writeMeta(id, meta);
    return meta.knownIssues;
  }

  /** The full record for one skill, as the brief asks: name, version, deps,
   *  permissions, success and error rates, performance, last updated, issues. */
  describe(id) {
    const meta = this._readMeta(id);
    if (!meta) return null;
    const current = meta.versions.find((v) => v.version === meta.current) || null;
    return {
      id: meta.id,
      name: meta.name,
      version: meta.current,
      state: current?.state || "never installed",
      dependencies: current?.dependencies || [],
      permissions: current?.permissions || [],
      ...this.stats(id, meta.current),
      lastUpdated: meta.updatedAt,
      knownIssues: meta.knownIssues,
      rollbackTo: meta.rollbackTo,
      versionCount: meta.versions.length,
    };
  }

  history(id) { return this._readMeta(id)?.versions || []; }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => this.describe(e.name))
      .filter(Boolean);
  }
}

module.exports = { SkillRegistry, STATE, sha256 };
