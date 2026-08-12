/* audit.js — the ledger that stops EVE claiming things she did not do.
 *
 * Every consequential action opens an entry and walks a fixed path:
 *
 *     PLANNED → ATTEMPTED → SUCCEEDED → VERIFIED
 *                        ↘ FAILED
 *
 * The states are enforced, not advisory. An entry cannot reach SUCCEEDED
 * without having been ATTEMPTED, and cannot reach VERIFIED without evidence
 * that something independently checked the result. "I ran the command" and
 * "the thing I wanted actually happened" are different claims, and this file
 * exists so EVE can never quietly merge them.
 */
"use strict";

const STATES = ["PLANNED", "ATTEMPTED", "SUCCEEDED", "FAILED", "VERIFIED"];

// Which states may follow which. Deliberately narrow.
const ALLOWED = {
  PLANNED: ["ATTEMPTED", "FAILED"],
  ATTEMPTED: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: ["VERIFIED", "FAILED"], // verification can still find it broken
  FAILED: [],
  VERIFIED: [],
};

let counter = 0;

class Entry {
  constructor(ledger, { action, why, version, actor, details }) {
    if (!action) throw new Error("An audit entry needs an action.");
    if (!why) throw new Error("An audit entry needs a reason — 'why' is not optional.");
    this.id = `${Date.now().toString(36)}-${(++counter).toString(36)}`;
    this.action = action;
    this.why = why;
    this.version = version || null;
    this.actor = actor || "eve";
    this.details = details || {};
    this.state = "PLANNED";
    this.history = [{ state: "PLANNED", at: new Date().toISOString() }];
    this.evidence = null;
    this.error = null;
    this.ledger = ledger;
    ledger._write(this);
  }

  _to(state, extra = {}) {
    if (!ALLOWED[this.state].includes(state)) {
      throw new Error(`Cannot go from ${this.state} to ${state} (${this.action}).`);
    }
    this.state = state;
    Object.assign(this, extra);
    this.history.push({ state, at: new Date().toISOString() });
    this.ledger._write(this);
    return this;
  }

  attempted(details) {
    if (details) Object.assign(this.details, details);
    return this._to("ATTEMPTED");
  }

  /** The action ran without error. NOT a claim that it had the intended effect. */
  succeeded(result) {
    return this._to("SUCCEEDED", { result: result ?? null });
  }

  /**
   * Something independent confirmed the intended effect. Evidence is required:
   * a test result, a re-read of the device state, a checksum — anything that
   * was actually observed rather than assumed.
   */
  verified(evidence) {
    if (evidence == null) throw new Error("VERIFIED requires evidence of what was checked.");
    return this._to("VERIFIED", { evidence });
  }

  failed(error) {
    return this._to("FAILED", { error: error instanceof Error ? error.message : String(error) });
  }

  toJSON() {
    return {
      id: this.id, action: this.action, why: this.why, version: this.version,
      actor: this.actor, state: this.state, details: this.details,
      result: this.result ?? null, evidence: this.evidence ?? null,
      error: this.error, history: this.history,
    };
  }
}

class Ledger {
  constructor({ log } = {}) {
    this.log = log || null;
    this.entries = new Map();
  }

  /** Open an entry. Nothing consequential should happen without one. */
  begin(spec) {
    const entry = new Entry(this, spec);
    this.entries.set(entry.id, entry);
    return entry;
  }

  _write(entry) {
    if (this.log) this.log.event("audit", entry.toJSON());
  }

  /**
   * Run something inside an entry, so the states cannot be forgotten.
   * `verify` is optional; when given, its truthy return becomes the evidence.
   */
  async run(spec, work, verify) {
    const entry = this.begin(spec);
    entry.attempted();
    let result;
    try {
      result = await work(entry);
      entry.succeeded(result);
    } catch (err) {
      entry.failed(err);
      throw err;
    }
    if (verify) {
      try {
        const evidence = await verify(result, entry);
        if (evidence) entry.verified(evidence);
        else entry.failed("verification could not confirm the intended effect");
      } catch (err) {
        entry.failed(`verification failed: ${err.message}`);
        throw err;
      }
    }
    return result;
  }

  /** Everything recorded, newest last. */
  all() {
    return [...this.entries.values()].map((e) => e.toJSON());
  }

  /** A plain-language summary that cannot overstate what happened. */
  summary() {
    const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
    for (const entry of this.entries.values()) counts[entry.state]++;
    return counts;
  }
}

module.exports = { Ledger, Entry, STATES, ALLOWED };
