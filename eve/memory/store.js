/* store.js — what EVE remembers, and how she finds the bit that matters.
 *
 * Four tiers, because they are used differently:
 *
 *   SHORT_TERM  the conversation and task in front of her. Bounded, cheap,
 *               and cleared when the task ends.
 *   LONG_TERM   things worth keeping. Carries where it came from and who
 *               established it, because "you told me" and "a website said so"
 *               are not the same kind of fact.
 *   PROCEDURAL  how a task was actually completed — the steps that worked, so
 *               a second attempt does not start from nothing.
 *   Graph       how things relate (see graph.js).
 *
 * RETRIEVAL WITHOUT A MODEL
 *
 * The brief asks for memory that is searched rather than poured into every
 * conversation. Doing that properly usually means embeddings, and there is no
 * model here to make them. So this uses an inverted index with BM25-style
 * scoring — the technique search engines used before neural retrieval, which
 * runs in milliseconds on a Pi and needs nothing but arithmetic.
 *
 * It matches words, not meaning: ask about "lights" and a memory about "lamps"
 * will not be found. That is the honest trade, and `recall()` reports its
 * scores so a weak match looks weak instead of looking authoritative.
 *
 * FORGETTING
 *
 * A 32GB card and 4GB of RAM mean memory has to be bounded, so old and
 * unimportant things are evicted. Two kinds are never evicted: anything you
 * confirmed yourself, and anything marked pinned. EVE may forget what a website
 * told her; she may not forget what you told her.
 */
"use strict";

const storage = require("../kernel/storage.js");

const TIER = { SHORT_TERM: "short_term", LONG_TERM: "long_term", PROCEDURAL: "procedural" };

/** Where a memory came from, ordered by how much weight it deserves. */
const SOURCE_WEIGHT = {
  user_confirmed: 2.0,   // you said it, or you settled a correction
  verified: 1.6,         // EVE checked it and the check passed
  official_docs: 1.4,
  observed: 1.2,         // she saw it happen — a device reported this state
  academic: 1.2,
  community: 0.8,
  unknown: 0.6,
  inferred: 0.7,
};

const STOP = new Set(["the", "a", "an", "is", "are", "was", "were", "to", "of", "and", "or", "in", "on",
  "at", "for", "with", "it", "this", "that", "i", "you", "my", "your", "be", "do", "does", "did", "how", "what"]);

const tokenise = (text) =>
  String(text ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

class Memory {
  constructor({ dir = "eve-data/memory", log = null, capacity = 5000, shortTermSize = 40, saveEveryMs = 5000 } = {}) {
    this.dir = dir;
    this.log = log;
    this.capacity = capacity;
    this.shortTermSize = shortTermSize;
    this.file = `${dir}/memories.json`;

    this.items = [];              // long-term + procedural
    this.shortTerm = [];          // never persisted by default
    this.index = new Map();       // token → Set of memory ids
    this.dirty = false;
    this.saveTimer = null;
    this.saveEveryMs = saveEveryMs;

    const loaded = storage.readWithFallback(this.file, []);
    this.items = Array.isArray(loaded.value) ? loaded.value : [];
    if (loaded.reason && loaded.reason !== "not present") log?.warn(`memory: ${loaded.reason}`);
    for (const item of this.items) this._index(item);
  }

  _index(item) {
    for (const token of new Set(tokenise(`${item.text} ${item.subject || ""} ${(item.tags || []).join(" ")}`))) {
      if (!this.index.has(token)) this.index.set(token, new Set());
      this.index.get(token).add(item.id);
    }
  }

  _unindex(item) {
    for (const [, ids] of this.index) ids.delete(item.id);
  }

  /** Writes are batched — an SD card should not be touched once per memory. */
  _scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.save(), this.saveEveryMs);
    if (this.saveTimer.unref) this.saveTimer.unref();
  }

  save() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!this.dirty) return false;
    storage.writeJsonVersioned(this.file, this.items);
    this.dirty = false;
    return true;
  }

  /**
   * Keep something.
   *
   * `source` decides how much weight it carries later, and `importance` is your
   * thumb on the scale. Anything from you is protected from being forgotten.
   */
  remember({ text, tier = TIER.LONG_TERM, subject = null, source = "unknown", importance = 1,
             tags = [], entities = [], confidence = null, pinned = false, meta = {} }) {
    if (!text) throw new Error("A memory needs something to remember.");

    if (tier === TIER.SHORT_TERM) {
      const note = { at: new Date().toISOString(), text, subject, meta };
      this.shortTerm.push(note);
      if (this.shortTerm.length > this.shortTermSize) this.shortTerm.shift();
      return note;
    }

    const item = {
      id: `mem-${Date.now().toString(36)}-${this.items.length}`,
      at: new Date().toISOString(),
      lastUsedAt: null,
      useCount: 0,
      tier, text: String(text), subject, source, importance,
      tags, entities, confidence,
      // What you established, EVE does not get to forget.
      protected: pinned || source === "user_confirmed",
      meta,
    };
    this.items.push(item);
    this._index(item);
    this._scheduleSave();
    if (this.items.length > this.capacity) this._evict();
    this.log?.event("memory_stored", { id: item.id, tier, source, protected: item.protected });
    return item;
  }

  /** How a task was actually completed, so the next attempt starts further on. */
  rememberProcedure({ task, steps, skill = null, outcome = "succeeded", ms = null, source = "verified" }) {
    return this.remember({
      tier: TIER.PROCEDURAL,
      text: `${task} — ${steps.join(" → ")}`,
      subject: task,
      source,
      importance: outcome === "succeeded" ? 1.5 : 0.8,
      tags: ["procedure", outcome, skill].filter(Boolean),
      meta: { task, steps, skill, outcome, ms },
    });
  }

  /**
   * Find the few memories that bear on a question.
   *
   * Scoring is BM25-style term matching, then adjusted for how much the source
   * deserves to be believed, how important it was marked, and how recent it is.
   * Scores come back with the results so a weak match reads as weak.
   */
  recall(query, { tier = null, limit = 5, minScore = 0.1, tags = null } = {}) {
    const terms = tokenise(query);
    if (!terms.length) return [];

    const pool = tier ? this.items.filter((i) => i.tier === tier) : this.items;
    if (!pool.length) return [];

    const N = pool.length;
    const scores = new Map();
    const k1 = 1.2;

    for (const term of terms) {
      const ids = this.index.get(term);
      if (!ids) continue;
      const matching = pool.filter((i) => ids.has(i.id));
      if (!matching.length) continue;
      const idf = Math.log(1 + (N - matching.length + 0.5) / (matching.length + 0.5));
      for (const item of matching) {
        const text = `${item.text} ${item.subject || ""}`.toLowerCase();
        const tf = (text.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g")) || []).length;
        scores.set(item.id, (scores.get(item.id) || 0) + idf * (tf / (tf + k1)));
      }
    }

    const now = Date.now();
    const results = [];
    for (const [id, base] of scores) {
      const item = pool.find((i) => i.id === id);
      if (tags && !tags.every((t) => item.tags.includes(t))) continue;

      const ageDays = (now - Date.parse(item.at)) / 86400000;
      const recency = 1 + 0.3 * Math.exp(-ageDays / 30);          // fades, never to zero
      const weight = SOURCE_WEIGHT[item.source] ?? SOURCE_WEIGHT.unknown;
      const score = base * weight * (item.importance || 1) * recency;
      if (score >= minScore) results.push({ ...item, score, why: `matched ${terms.filter((t) => this.index.get(t)?.has(id)).join(", ")}` });
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, limit);
    for (const hit of top) {
      const item = this.items.find((i) => i.id === hit.id);
      if (item) { item.useCount++; item.lastUsedAt = new Date().toISOString(); }
    }
    if (top.length) this._scheduleSave();
    return top;
  }

  /** A previous run of a similar task, if there was one. */
  recallProcedure(task, { limit = 3 } = {}) {
    return this.recall(task, { tier: TIER.PROCEDURAL, limit })
      .filter((m) => m.meta?.outcome === "succeeded");
  }

  /**
   * The memory that should accompany this task — and no more than that.
   *
   * This is the answer to "do not load everything into every conversation": a
   * character budget is filled with the highest-scoring memories and the rest
   * are left where they are.
   */
  context(query, { budget = 1200, limit = 8 } = {}) {
    const hits = this.recall(query, { limit });
    const included = [];
    let used = 0;
    for (const hit of hits) {
      const line = `- ${hit.text}${hit.source === "user_confirmed" ? " (you told me this)" : ""}`;
      if (used + line.length > budget) break;
      included.push({ ...hit, line });
      used += line.length;
    }
    return {
      text: included.map((i) => i.line).join("\n"),
      used,
      budget,
      included: included.length,
      considered: hits.length,
      omitted: hits.length - included.length,
    };
  }

  /** End of a task: the working notes go, the conclusions stay. */
  clearShortTerm() {
    const dropped = this.shortTerm.length;
    this.shortTerm = [];
    return dropped;
  }

  forget(id) {
    const index = this.items.findIndex((i) => i.id === id);
    if (index < 0) return false;
    const [item] = this.items.splice(index, 1);
    this._unindex(item);
    this._scheduleSave();
    return true;
  }

  /** Make room, without touching what you established. */
  _evict() {
    const now = Date.now();
    const score = (item) => {
      const ageDays = (now - Date.parse(item.lastUsedAt || item.at)) / 86400000;
      return (item.importance || 1) * (SOURCE_WEIGHT[item.source] ?? 0.6) * (1 + item.useCount) / (1 + ageDays);
    };
    const candidates = this.items.filter((i) => !i.protected).sort((a, b) => score(a) - score(b));
    const toDrop = candidates.slice(0, Math.max(1, this.items.length - this.capacity));
    for (const item of toDrop) this.forget(item.id);
    this.log?.event("memory_evicted", { dropped: toDrop.length, remaining: this.items.length });
    return toDrop.length;
  }

  stats() {
    const byTier = {};
    const bySource = {};
    for (const item of this.items) {
      byTier[item.tier] = (byTier[item.tier] || 0) + 1;
      bySource[item.source] = (bySource[item.source] || 0) + 1;
    }
    return {
      total: this.items.length,
      capacity: this.capacity,
      protected: this.items.filter((i) => i.protected).length,
      shortTerm: this.shortTerm.length,
      indexedTerms: this.index.size,
      byTier, bySource,
    };
  }
}

module.exports = { Memory, TIER, SOURCE_WEIGHT, tokenise };
