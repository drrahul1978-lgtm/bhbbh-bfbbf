/* status.js — deciding which light is on.
 *
 * Three states, and the whole value of them is that they mean different things:
 *
 *   RED     something is wrong with her. She cannot do her job until it is
 *           fixed: too hot, no disk, her mind file corrupt, a skill crashing.
 *
 *   YELLOW  she needs you. Nothing is broken — she has hit something she
 *           cannot settle alone and is waiting. Seeing a thing she does not
 *           recognise is the main one: she will not guess, so she asks.
 *
 *   GREEN   she is fine and knows what she is doing.
 *
 * The ordering is deliberate and is the only interesting decision in this file.
 * Red outranks yellow, and yellow outranks green, so a light is never
 * reassuring while something worse is true. The most serious condition wins,
 * every time.
 *
 * A reason always travels with the colour. A yellow light that cannot say WHY
 * it is yellow is a light you learn to ignore.
 *
 * Every method that records something takes an optional `now`. Half of them
 * reading the real clock while expiry used an injected one made the hold time
 * untestable — and an untested expiry is how a light ends up stuck on yellow
 * for an hour after you have dealt with the thing.
 */
"use strict";

const COLOURS = ["green", "yellow", "red"];
const RANK = { green: 0, yellow: 1, red: 2 };

/* How long an unknown object keeps her yellow after she stops seeing it. If
 * the light dropped the instant the object left the frame, the one thing it
 * exists to tell you would be the thing you miss by looking away. */
const NEEDS_YOU_MS = 30000;

class Status {
  constructor({ light = null, log = null, needsYouMs = NEEDS_YOU_MS } = {}) {
    this.light = light;
    this.log = log;
    this.needsYouMs = needsYouMs;

    this.health = { ok: true, problems: [] };
    this.asks = new Map();          // what she is waiting on → when it started
    this.faults = new Map();        // what is broken → why
    this.colour = null;
    this.reason = "starting up";
  }

  // ------------------------------------------------------------------
  // Things that make her RED
  // ------------------------------------------------------------------

  /** A health reading, straight from eve/kernel/health.js assess(). */
  observeHealth(assessment, now = Date.now()) {
    this.health = assessment || { ok: true, problems: [] };
    return this.update(now);
  }

  /** Something is broken in a way that needs fixing, not answering. */
  fault(key, why, now = Date.now()) {
    this.faults.set(key, { why, at: now });
    return this.update(now);
  }

  /** It got fixed. */
  clearFault(key, now = Date.now()) {
    this.faults.delete(key);
    return this.update(now);
  }

  // ------------------------------------------------------------------
  // Things that make her YELLOW
  // ------------------------------------------------------------------

  /**
   * She needs you for something, and will keep needing you until told.
   *
   * `key` is what she is waiting on, so the same thing happening twice does not
   * queue up two asks — she is waiting on one unknown object, not on the fact
   * that she saw it eleven times.
   */
  needsYou(key, why, now = Date.now()) {
    const existing = this.asks.get(key);
    this.asks.set(key, { why, at: existing ? existing.at : now, seen: now });
    return this.update(now);
  }

  /** You dealt with it. */
  resolved(key, now = Date.now()) {
    this.asks.delete(key);
    return this.update(now);
  }

  /**
   * She saw something and could not tell what it was.
   *
   * This is the case the yellow light was asked for: a device appears on the
   * breadboard, she has never been taught it, and rather than guessing she
   * lights yellow so you know to come and tell her.
   */
  sawSomethingUnknown(detail = "an object I do not recognise", now = Date.now()) {
    return this.needsYou(
      "unknown_object",
      `I can see ${detail}, and I do not know what to do with it. Teach me and I will remember.`,
      now,
    );
  }

  /** She could not work out what you asked for. */
  didNotUnderstand(text, now = Date.now()) {
    return this.needsYou("unknown_request",
      `I did not understand "${String(text).slice(0, 60)}". Tell me what it should mean.`, now);
  }

  // ------------------------------------------------------------------
  // Working out the colour
  // ------------------------------------------------------------------

  /** Forget asks she has been sitting on with nothing new happening. */
  expire(now = Date.now()) {
    for (const [key, ask] of this.asks) {
      if (now - (ask.seen || ask.at) > this.needsYouMs) this.asks.delete(key);
    }
  }

  /** The most serious thing currently true, with the reason for it. */
  assess(now = Date.now()) {
    this.expire(now);

    if (this.faults.size) {
      const [key, fault] = [...this.faults][0];
      return { colour: "red", reason: fault.why, key, count: this.faults.size };
    }
    if (!this.health.ok) {
      const problems = this.health.problems || [];
      return {
        colour: "red",
        reason: problems.length ? problems.join("; ") : "a health check failed",
        key: "health",
        count: problems.length,
      };
    }
    if (this.asks.size) {
      const [key, ask] = [...this.asks][0];
      return { colour: "yellow", reason: ask.why, key, count: this.asks.size };
    }
    return { colour: "green", reason: "everything is working and I know what I am doing", key: null, count: 0 };
  }

  /**
   * Work out the colour and show it.
   *
   * The light is only written when the colour actually changes, which keeps a
   * once-a-second health loop from spawning a process every second. The reason
   * is kept up to date regardless, because what is wrong can change without
   * the colour changing.
   */
  update(now = Date.now()) {
    const next = this.assess(now);
    const changed = next.colour !== this.colour;
    const previous = this.colour;

    this.colour = next.colour;
    this.reason = next.reason;

    if (changed && this.light) {
      this.light.show(next.colour);
      this.log?.info?.("status light changed", { from: previous, to: next.colour, why: next.reason });
    }
    return { ...next, changed, previous };
  }

  /** One line a person can read. */
  describe() {
    const face = { red: "🔴", yellow: "🟡", green: "🟢" }[this.colour] || "⚫";
    return `${face} ${this.colour || "unknown"} — ${this.reason}`;
  }
}

module.exports = { Status, COLOURS, RANK, NEEDS_YOU_MS };
