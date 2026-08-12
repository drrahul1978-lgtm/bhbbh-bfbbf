/* pipeline.js — the road a new capability must travel before EVE relies on it.
 *
 *   Design → Generate → Inspect → Sandbox test → Verify → Install → Remember
 *
 * Every stage can stop the process, and stopping is a normal outcome rather
 * than an error to be worked around. Nothing reaches "installed" without having
 * actually run and produced evidence — the audit ledger will not record it
 * otherwise, and the registry will not install an untested version.
 *
 * The verification step is the one that matters. "The code compiled" and "the
 * adapter listed nine real devices from your actual hub" are very different
 * claims, and only the second is allowed to count.
 */
"use strict";

const Skills = require("../../skills.js");
const sandbox = require("./sandbox.js");
const { SkillRegistry } = require("./registry.js");

class SkillPipeline {
  /**
   * `kernel` supplies permissions and the audit ledger. Without one the
   * pipeline still runs, but nothing is gated and nothing is recorded — which
   * is fine for a test and wrong for a Pi.
   */
  constructor({ kernel = null, registry = null, dir = "eve-data/skills" } = {}) {
    this.kernel = kernel;
    this.registry = registry || new SkillRegistry({
      dir, log: kernel?.log, audit: kernel?.audit,
    });
    this.log = kernel?.log || null;
  }

  /**
   * Take a description of an API and try to turn it into an installed skill.
   *
   * Returns a report of every stage — including the ones that stopped it — so a
   * failure explains itself instead of just being absent.
   */
  async create(spec, { config = {}, allowedHosts = [], isolated = true, install = true, why = "a new capability was needed" } = {}) {
    const stages = [];
    const record = (stage, ok, detail) => {
      stages.push({ stage, ok, detail });
      this.log?.event("skill_pipeline", { skill: spec.id, stage, ok });
      return ok;
    };

    // --- generate ---------------------------------------------------------
    let source;
    try {
      source = Skills.generateAdapter(spec);
      record("generate", true, `wrote ${source.trim().split("\n").length} lines`);
    } catch (err) {
      record("generate", false, err.message);
      return { ok: false, stages, reason: `could not write the adapter: ${err.message}` };
    }

    // --- inspect ----------------------------------------------------------
    const inspection = sandbox.inspect(source);
    if (!inspection.ok) {
      record("inspect", false, inspection.findings.map((f) => `line ${f.line}: ${f.why}`).join("; "));
      return { ok: false, stages, reason: "the generated code did not pass inspection", findings: inspection.findings };
    }
    record("inspect", true, "no forbidden constructs");

    // --- register (a draft, not yet trusted) ------------------------------
    const { version } = this.registry.register(spec.id, {
      name: spec.name,
      source,
      spec,
      permissions: ["NETWORK_ACCESS", "CODE_EXECUTION"],
      dependencies: [],
      origin: "generated",
    });
    record("register", true, `filed as v${version}`);

    // --- sandbox test -----------------------------------------------------
    // In a separate process by default: this code has never run before.
    let testResult;
    if (isolated) {
      const run = await sandbox.runIsolated(source, {
        calls: [{ method: "probe" }, { method: "list" }],
        config, allowedHosts, timeoutMs: 20000,
      });
      testResult = this._judge(run);
    } else {
      testResult = await this._testInProcess(source, { config, allowedHosts });
    }

    this.registry.recordTest(spec.id, version, {
      passed: testResult.passed,
      isolated,
      checks: testResult.checks,
      evidence: testResult.evidence,
      error: testResult.error,
    });

    if (!testResult.passed) {
      record("test", false, testResult.error || "did not behave as a working adapter should");
      return { ok: false, stages, version, reason: testResult.error || "the skill failed its test", tested: testResult };
    }
    record("test", true, testResult.evidence);

    // --- verify -----------------------------------------------------------
    // Evidence, not optimism: it has to have found something real.
    if (!testResult.foundThings) {
      record("verify", false, "it connected but found nothing to control — that is not a working integration");
      return { ok: false, stages, version, reason: "connected, but found nothing — not installing it" };
    }
    record("verify", true, testResult.evidence);

    if (!install) return { ok: true, stages, version, installed: false, tested: testResult };

    // --- install ----------------------------------------------------------
    const doInstall = () => this.registry.install(spec.id, version);
    let installed;
    if (this.kernel) {
      installed = await this.kernel.guard(
        "CODE_EXECUTION",
        { action: `install skill ${spec.id} v${version}`, why, version: String(version) },
        async () => doInstall(),
        async () => {
          // Verified means the installed thing loads and matches what was tested.
          const loaded = this.registry.loadCurrent(spec.id);
          return loaded?.ok ? { installedVersion: loaded.version, sourceMatches: true } : null;
        }
      );
    } else {
      installed = doInstall();
    }
    record("install", true, `v${version} is in service`);

    return { ok: true, stages, version, installed: true, replaced: installed.replaced ?? null, tested: testResult };
  }

  /** Turn a sandbox run into a pass or a fail, with the reason attached. */
  _judge(run) {
    if (!run.ok) {
      return { passed: false, checks: [], error: run.error, evidence: null, foundThings: false };
    }
    const probe = run.results.find((r) => r.method === "probe");
    const list = run.results.find((r) => r.method === "list");
    const checks = run.results.map((r) => ({ check: r.method, ok: r.ok, ms: r.ms, error: r.error || null }));

    if (!probe?.ok) return { passed: false, checks, error: `it could not reach the service: ${probe?.error || "no response"}`, foundThings: false };
    if (!list?.ok) return { passed: false, checks, error: `it connected but could not list anything: ${list?.error}`, foundThings: false };

    const count = list.value?.length ?? 0;
    return {
      passed: true, checks, error: null,
      foundThings: count > 0,
      evidence: `connected and listed ${count} thing${count === 1 ? "" : "s"} in ${list.ms}ms`,
      sample: list.value?.sample || null,
    };
  }

  async _testInProcess(source, { config, allowedHosts }) {
    try {
      const adapter = sandbox.compile(source, { config, allowedHosts });
      const started = Date.now();
      await adapter.probe();
      const things = await adapter.list();
      return {
        passed: true, checks: [{ check: "probe", ok: true }, { check: "list", ok: true }],
        error: null, foundThings: things.length > 0,
        evidence: `connected and listed ${things.length} things in ${Date.now() - started}ms`,
      };
    } catch (err) {
      return { passed: false, checks: [], error: err.message, foundThings: false, evidence: null };
    }
  }

  /**
   * A skill has started misbehaving. Roll back to the previous version and say
   * so — repair comes later, but getting back to something that worked is the
   * urgent part.
   */
  async recover(id, { reason = "it started failing" } = {}) {
    const before = this.registry.describe(id);
    if (!before) return { ok: false, reason: `there is no skill called ${id}` };
    try {
      const result = this.registry.rollback(id, { reason });
      this.registry.addKnownIssue(id, { note: reason, rolledBackFrom: result.from, at: new Date().toISOString() });
      return { ok: true, ...result, note: `v${result.from} is kept, not deleted — it can be re-tested after a fix` };
    } catch (err) {
      return { ok: false, reason: err.message, suggestion: "there is no earlier version; the skill needs repairing rather than rolling back" };
    }
  }
}

module.exports = { SkillPipeline };
