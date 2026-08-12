/* graph.js — what EVE knows about how things relate to each other.
 *
 * Entities are the nouns in her world: you, a device, a skill, a project, an
 * API. Edges are typed and directional, so "the kitchen light IS_IN the
 * kitchen" and "the kitchen CONTAINS the kitchen light" are the same fact
 * stored once and readable from either end.
 *
 * Small on purpose. This is a Pi, not a graph database: a few thousand nodes
 * held in memory, saved as one JSON file, with queries that stop rather than
 * wander. Depth-limited traversal is not a limitation to apologise for — an
 * unbounded search on a 4GB machine is how a background task eats the box.
 */
"use strict";

const storage = require("../kernel/storage.js");

/** Relations get an opposite, so a fact can be read from either direction. */
const INVERSE = {
  CONTAINS: "IS_IN",
  IS_IN: "CONTAINS",
  CONTROLS: "CONTROLLED_BY",
  CONTROLLED_BY: "CONTROLS",
  OWNS: "OWNED_BY",
  OWNED_BY: "OWNS",
  DEPENDS_ON: "REQUIRED_BY",
  REQUIRED_BY: "DEPENDS_ON",
  PART_OF: "HAS_PART",
  HAS_PART: "PART_OF",
  LEARNED_FROM: "TAUGHT",
  TAUGHT: "LEARNED_FROM",
};

class KnowledgeGraph {
  constructor({ file = null, log = null, maxNodes = 5000 } = {}) {
    this.file = file;
    this.log = log;
    this.maxNodes = maxNodes;
    this.nodes = new Map();   // id → { id, type, name, attrs, at }
    this.edges = [];          // { from, rel, to, at, source, confidence }
    this.dirty = false;

    if (file) {
      const loaded = storage.readWithFallback(file, null);
      if (loaded.value) {
        for (const node of loaded.value.nodes || []) this.nodes.set(node.id, node);
        this.edges = loaded.value.edges || [];
      }
      if (loaded.reason && loaded.reason !== "not present") log?.warn(`knowledge graph: ${loaded.reason}`);
    }
  }

  /** Add or update an entity. Attributes merge rather than replace, so knowing
   *  one new thing about a device does not erase everything else. */
  entity(id, { type = "thing", name = null, attrs = {} } = {}) {
    const key = String(id);
    const existing = this.nodes.get(key);
    const node = existing
      ? { ...existing, type: type || existing.type, name: name || existing.name, attrs: { ...existing.attrs, ...attrs } }
      : { id: key, type, name: name || key, attrs, at: new Date().toISOString() };
    this.nodes.set(key, node);
    this.dirty = true;
    if (this.nodes.size > this.maxNodes) this._evict();
    return node;
  }

  /**
   * Record a relationship. Both directions are stored when the relation has a
   * known opposite, so neighbours() answers from either end without a second
   * lookup.
   */
  link(from, rel, to, { source = "observed", confidence = 1, bidirectional = true } = {}) {
    const relation = String(rel).toUpperCase();
    if (!this.nodes.has(String(from))) this.entity(from);
    if (!this.nodes.has(String(to))) this.entity(to);

    const add = (a, r, b) => {
      if (this.edges.some((e) => e.from === a && e.rel === r && e.to === b)) return;
      this.edges.push({ from: String(a), rel: r, to: String(b), at: new Date().toISOString(), source, confidence });
    };
    add(from, relation, to);
    if (bidirectional && INVERSE[relation]) add(to, INVERSE[relation], from);
    this.dirty = true;
    return { from: String(from), rel: relation, to: String(to) };
  }

  get(id) { return this.nodes.get(String(id)) || null; }

  /** Everything one hop away, optionally filtered by relation. */
  neighbours(id, { rel = null } = {}) {
    const key = String(id);
    return this.edges
      .filter((e) => e.from === key && (!rel || e.rel === String(rel).toUpperCase()))
      .map((e) => ({ rel: e.rel, node: this.nodes.get(e.to) || { id: e.to, type: "unknown", name: e.to }, confidence: e.confidence }));
  }

  byType(type) { return [...this.nodes.values()].filter((n) => n.type === type); }

  /**
   * How two things are connected, if they are. Breadth-first and depth-limited:
   * it either finds a short explanation or admits there isn't one, rather than
   * exploring the whole graph looking for a tenuous link.
   */
  path(fromId, toId, { maxDepth = 4 } = {}) {
    const start = String(fromId), goal = String(toId);
    if (!this.nodes.has(start) || !this.nodes.has(goal)) return null;
    if (start === goal) return [];

    const seen = new Set([start]);
    let frontier = [{ id: start, path: [] }];
    for (let depth = 0; depth < maxDepth; depth++) {
      const next = [];
      for (const { id, path } of frontier) {
        for (const edge of this.edges.filter((e) => e.from === id)) {
          if (seen.has(edge.to)) continue;
          const step = [...path, { rel: edge.rel, to: edge.to }];
          if (edge.to === goal) return step;
          seen.add(edge.to);
          next.push({ id: edge.to, path: step });
        }
      }
      if (!next.length) break;
      frontier = next;
    }
    return null;
  }

  /** A short, readable description of one entity and its connections. */
  describe(id) {
    const node = this.get(id);
    if (!node) return null;
    const links = this.neighbours(id);
    return {
      ...node,
      connections: links.length,
      summary: links.length
        ? `${node.name} — ${links.slice(0, 6).map((l) => `${l.rel.toLowerCase().replace(/_/g, " ")} ${l.node.name}`).join(", ")}`
        : `${node.name} — nothing connected to it yet`,
    };
  }

  /** Drop the least-connected, oldest nodes when the graph outgrows the Pi. */
  _evict() {
    const degree = new Map();
    for (const edge of this.edges) {
      degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
    }
    const ranked = [...this.nodes.values()]
      .filter((n) => !n.attrs?.pinned)
      .sort((a, b) => (degree.get(a.id) || 0) - (degree.get(b.id) || 0) || String(a.at).localeCompare(String(b.at)));
    const toDrop = ranked.slice(0, Math.max(1, this.nodes.size - this.maxNodes));
    for (const node of toDrop) {
      this.nodes.delete(node.id);
      this.edges = this.edges.filter((e) => e.from !== node.id && e.to !== node.id);
    }
    this.log?.event("graph_evicted", { dropped: toDrop.length, remaining: this.nodes.size });
  }

  save() {
    if (!this.file || !this.dirty) return false;
    storage.writeJsonVersioned(this.file, { nodes: [...this.nodes.values()], edges: this.edges });
    this.dirty = false;
    return true;
  }

  stats() {
    const types = {};
    for (const node of this.nodes.values()) types[node.type] = (types[node.type] || 0) + 1;
    return { nodes: this.nodes.size, edges: this.edges.length, types };
  }
}

module.exports = { KnowledgeGraph, INVERSE };
