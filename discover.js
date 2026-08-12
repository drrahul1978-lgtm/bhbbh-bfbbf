/* discover.js — how Eve works out an API nobody has described to her.
 *
 * Until now a human had to translate an API into the spec format in skills.js.
 * This file removes that step where it can, in three escalating tiers:
 *
 *   1. ASK THE API ITSELF. Most modern REST services publish a machine-readable
 *      OpenAPI/Swagger document at a predictable path. If one is there, Eve
 *      reads it and derives everything — endpoints, auth, field names — with no
 *      human involved. This is the tier that does the real work.
 *
 *   2. LOOK AT WHAT COMES BACK. No spec document? Then call the endpoint and
 *      study the actual JSON: which field looks like an id, which reads like a
 *      name, which holds the state — including values buried in nested objects.
 *      Heuristics, so: often right, not always.
 *
 *   3. SEARCH THE WEB. Only when the first two fail and there is a connection.
 *      Looks for a published spec document for the service by name.
 *
 * Offline is a first-class state, not an error. Everything Eve learns is cached
 * to disk, so a Raspberry Pi that discovered an API once keeps working with no
 * WiFi forever after. When she is offline and has no cache, she says so plainly
 * rather than hanging on a lookup that cannot succeed.
 *
 * What this is not: reading prose documentation. If an API only describes itself
 * in English, tier 1 finds nothing and tier 2 is guessing from shapes. Eve
 * reports which fields she could not work out instead of pretending. */
(function (root) {
  "use strict";

  const Skills = root.Skills || (typeof require !== "undefined" ? require("./skills.js") : null);

  /** Where APIs commonly publish their own description. */
  const WELL_KNOWN_SPEC_PATHS = [
    "/openapi.json", "/swagger.json", "/openapi.yaml",
    "/v3/api-docs", "/api-docs", "/api/openapi.json", "/api/swagger.json",
    "/.well-known/openapi.json", "/docs/openapi.json", "/api/v1/openapi.json",
    "/swagger/v1/swagger.json",
  ];

  /** Endpoints worth trying when looking for "the list of things". */
  const COMMON_LIST_PATHS = [
    "/", "/api", "/devices", "/api/devices", "/lights", "/api/lights",
    "/things", "/api/things", "/items", "/api/items", "/entities",
    "/api/states", "/v1/devices", "/api/v1/devices",
  ];

  // Field names that usually mean what they say.
  const ID_HINTS = ["id", "entity_id", "uniqueid", "unique_id", "uuid", "device_id", "deviceid", "name", "key", "identifier", "_key"];
  // Keys that mean "the name a human reads" rather than "the name the machine
  // uses". The distinction matters: Google-style APIs put a resource path in
  // `name` and the actual label in a nested `customName`.
  const STRONG_NAME_HINTS = ["friendly_name", "friendlyname", "display_name", "displayname", "customname", "custom_name", "label", "title", "alias", "nickname"];
  const NAME_HINTS = STRONG_NAME_HINTS.concat(["name", "description"]);
  const STATE_HINTS = ["state", "status", "on", "power", "value", "is_on", "ison", "mode", "level", "brightness"];

  const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

  /**
   * Every leaf in an object, with its path as an *array of segments*.
   *
   * Not a dotted string: real keys contain dots — Google's device traits are
   * literally named "sdm.devices.traits.Info" — so joining with "." would make
   * the path ambiguous and unresolvable.
   */
  function leafPaths(obj, prefix = [], depth = 0, out = []) {
    if (depth > 3 || !isPlainObject(obj)) return out;
    for (const key of Object.keys(obj)) {
      const segments = prefix.concat(key);
      const value = obj[key];
      if (isPlainObject(value)) leafPaths(value, segments, depth + 1, out);
      else if (!Array.isArray(value)) out.push({ segments, path: segments.join(" › "), key, value });
    }
    return out;
  }

  /**
   * Score how well a field matches what we are looking for. Exact name matches
   * win; the right *type* of value breaks ties (an id should be a short string,
   * a name should read like words, a state should be short or boolean).
   */
  function scoreField(leaf, hints, kind) {
    const key = leaf.key.toLowerCase();
    let score = 0;
    const index = hints.indexOf(key);
    if (index >= 0) score += 100 - index * 4;
    else if (hints.some((h) => key.includes(h))) score += 30;
    // An unambiguous display-name key beats a generic one wherever it sits.
    if (kind === "name" && STRONG_NAME_HINTS.some((h) => key.includes(h))) score += 70;

    const value = leaf.value;
    if (kind === "id") {
      if (typeof value === "string" && value.length <= 80) score += 12;
      if (typeof value === "number") score += 8;
      if (typeof value === "boolean") score -= 60;
    } else if (kind === "name") {
      if (typeof value !== "string") score -= 70;
      else {
        if (/[ ]/.test(value)) score += 18;               // reads like a label
        if (/^[a-z0-9]{16,}$/i.test(value)) score -= 30;  // an opaque id
        // A resource path or a dotted namespace is an identifier, not a label —
        // this is exactly the trap in Google-shaped APIs.
        if (value.includes("/")) score -= 60;
        if (/^[a-z]+\.[a-z]+\./i.test(value)) score -= 40;
        if (value.length > 90) score -= 20;
      }
    } else if (kind === "state") {
      if (typeof value === "boolean") score += 25;
      if (typeof value === "string" && value.length <= 24) score += 10;
      if (typeof value === "number") score += 6;
      if (isPlainObject(value)) score -= 40;
    }
    // Shallow fields are likelier to be the primary ones — but only mildly so
    // for names, which are routinely nested one or two objects down.
    score -= (leaf.segments.length - 1) * (kind === "name" ? 3 : 6);
    return score;
  }

  const bestField = (leaves, hints, kind) => {
    let best = null, bestScore = -Infinity;
    for (const leaf of leaves) {
      const score = scoreField(leaf, hints, kind);
      if (score > bestScore) { bestScore = score; best = leaf; }
    }
    return bestScore > 0 ? { path: best.segments, label: best.path, score: bestScore } : null;
  };

  /** Find the collection inside a payload, wherever it is hiding. */
  function findCollection(payload) {
    if (Array.isArray(payload) && payload.length) return { itemsKey: null, sample: payload[0], count: payload.length };
    if (!isPlainObject(payload)) return null;

    // A key holding an array of objects — "devices", "results", "data"…
    let best = null;
    for (const key of Object.keys(payload)) {
      const value = payload[key];
      if (Array.isArray(value) && value.length && isPlainObject(value[0])) {
        const priority = ["devices", "results", "data", "items", "things", "lights", "entities"].indexOf(key.toLowerCase());
        const score = (priority >= 0 ? 100 - priority : 10) + Math.min(20, value.length);
        if (!best || score > best.score) best = { itemsKey: key, sample: value[0], count: value.length, score };
      }
    }
    if (best) return best;

    // Or an object keyed by id, where every value is a similar object.
    const values = Object.values(payload);
    if (values.length && values.every(isPlainObject)) {
      return { itemsKey: null, sample: values[0], count: values.length, keyed: true };
    }
    return null;
  }

  /**
   * Tier 2: infer a spec from a real response body.
   * Returns the spec fields plus what could not be worked out, so the caller can
   * ask a human about exactly the missing piece rather than the whole API.
   */
  function inferFromSample(payload, { baseUrl, listPath, name, id, auth } = {}) {
    const collection = findCollection(payload);
    if (!collection) {
      return { ok: false, reason: "that response does not look like a list of things", unknown: ["items"] };
    }
    const leaves = leafPaths(collection.sample);
    if (!leaves.length) return { ok: false, reason: "the items in that list have no readable fields", unknown: ["fields"] };

    const idField = bestField(leaves, ID_HINTS, "id");
    const nameField = bestField(leaves, NAME_HINTS, "name");
    const stateField = bestField(leaves, STATE_HINTS, "state");

    const unknown = [];
    if (!idField) unknown.push("id");
    if (!stateField) unknown.push("state");

    // A paging link, if the payload offers one.
    const nextKey = [["next"], ["next_page"], ["nextPageToken"], ["links", "next"]]
      .find((segments) => segments.reduce((a, k) => (a == null ? undefined : a[k]), payload) != null) || null;

    return {
      ok: !!idField,
      unknown,
      confidence: Math.min(1, ((idField?.score || 0) + (nameField?.score || 0) + (stateField?.score || 0)) / 300),
      itemCount: collection.count,
      spec: Skills.restSpec({
        id: id || "discovered_api",
        name: name || "Discovered API",
        baseUrl,
        auth,
        listPath,
        itemsKey: collection.itemsKey,
        idKey: idField ? idField.path : ["_key"],
        nameKey: nameField ? nameField.path : (idField ? idField.path : ["_key"]),
        stateKey: stateField ? stateField.path : null,
        nextKey,
        actions: {},
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Tier 1 — read the API's own description
  // ---------------------------------------------------------------------------

  /** Auth scheme from an OpenAPI document → the shape skills.js understands. */
  function authFromOpenAPI(doc) {
    const schemes = doc.components?.securitySchemes || doc.securityDefinitions || {};
    for (const scheme of Object.values(schemes)) {
      if (!scheme || typeof scheme !== "object") continue;
      const type = String(scheme.type || "").toLowerCase();
      if (type === "oauth2") {
        const flows = scheme.flows || {};
        const flow = flows.authorizationCode || flows.clientCredentials || flows.password || {};
        return { type: "oauth2", tokenUrl: flow.tokenUrl || scheme.tokenUrl || null, authUrl: flow.authorizationUrl || null };
      }
      if (type === "http" && String(scheme.scheme).toLowerCase() === "bearer") return { type: "bearer" };
      if (type === "http" && String(scheme.scheme).toLowerCase() === "basic") return { type: "basic" };
      if (type === "apikey" || type === "apiKey") {
        if (scheme.in === "query") return { type: "query", param: scheme.name || "key" };
        return { type: "header", header: scheme.name || "X-API-Key" };
      }
    }
    return { type: "bearer" }; // the commonest case when nothing is declared
  }

  /**
   * Pick the endpoint that lists things, and the ones that act on them.
   * A listing endpoint is a GET with no path parameters; an action is a
   * POST/PUT/PATCH on a path that takes an id.
   */
  function endpointsFromOpenAPI(doc) {
    const paths = doc.paths || {};
    const lists = [];
    const actions = [];
    for (const [path, methods] of Object.entries(paths)) {
      const hasParam = /\{[^}]+\}/.test(path);
      for (const [method, op] of Object.entries(methods || {})) {
        const verb = method.toLowerCase();
        if (!["get", "post", "put", "patch"].includes(verb)) continue;
        const text = `${path} ${op?.summary || ""} ${op?.operationId || ""}`.toLowerCase();
        if (verb === "get" && !hasParam) {
          // Prefer paths that sound like collections of controllable things.
          const bonus = /device|light|thing|entity|item|switch|state/.test(text) ? 40 : 0;
          const depth = path.split("/").filter(Boolean).length;
          lists.push({ path, score: bonus + Math.max(0, 20 - depth * 4) });
        } else if (verb !== "get" && hasParam) {
          let action = null;
          if (/\bon\b|turn_?on|enable|activate|start|open/.test(text)) action = "turn_on";
          else if (/\boff\b|turn_?off|disable|deactivate|stop|close/.test(text)) action = "turn_off";
          else if (/toggle|flip/.test(text)) action = "toggle";
          else if (/brightness|level|dim|temperature|volume|set/.test(text)) action = "set_level";
          if (action) actions.push({ action, path, method: verb.toUpperCase(), text });
        }
      }
    }
    lists.sort((a, b) => b.score - a.score);
    return { lists, actions };
  }

  /** OpenAPI document → an Eve spec, as far as it can be taken without a sample. */
  function fromOpenAPI(doc, { baseUrl, id, name } = {}) {
    if (!doc || (!doc.openapi && !doc.swagger)) return null;
    const { lists, actions } = endpointsFromOpenAPI(doc);
    if (!lists.length) return null;

    const serverUrl = doc.servers?.[0]?.url;
    const resolvedBase = baseUrl || (serverUrl && serverUrl.startsWith("http") ? serverUrl.replace(/\/+$/, "") : "");

    const actionMap = {};
    for (const a of actions) {
      // Rewrite OpenAPI's {petId} style into Eve's {id} placeholder.
      if (!actionMap[a.action]) actionMap[a.action] = { method: a.method, path: a.path.replace(/\{[^}]+\}/, "{id}") };
    }

    return {
      spec: Skills.restSpec({
        id: id || (doc.info?.title || "discovered_api").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 32),
        name: name || doc.info?.title || "Discovered API",
        baseUrl: resolvedBase,
        auth: authFromOpenAPI(doc),
        listPath: lists[0].path,
        actions: actionMap,
      }),
      candidateLists: lists.slice(0, 5).map((l) => l.path),
      title: doc.info?.title,
      version: doc.info?.version,
    };
  }

  // ---------------------------------------------------------------------------
  // Network state & the web
  // ---------------------------------------------------------------------------

  /**
   * Is there a way out to the internet right now?
   *
   * A Pi on a LAN with no WiFi uplink can still reach Home Assistant perfectly
   * well, so this asks specifically about the *internet*, and is only ever used
   * to decide whether a web search is worth attempting.
   */
  async function isOnline(fetchImpl, timeoutMs = 2500) {
    const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    for (const url of ["https://duckduckgo.com/", "https://example.com/"]) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        await doFetch(url, { method: "GET", signal: controller.signal, mode: "no-cors" });
        clearTimeout(timer);
        return true;
      } catch { /* try the next one */ }
    }
    return false;
  }

  /**
   * Tier 3: search the web for a published description of an API.
   *
   * Deliberately modest: this looks for a spec *document*, not for prose to
   * interpret. Results are candidate URLs which are then fetched and validated
   * as OpenAPI — so a wrong search result fails safely instead of producing a
   * confidently wrong adapter.
   *
   * No search API key is assumed. If `opts.searchUrl` is given (a template with
   * {q}), that is used; otherwise DuckDuckGo's HTML endpoint is scraped, which
   * works often but not always, and is treated as best-effort.
   */
  async function searchWeb(query, fetchImpl, opts = {}) {
    const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch) return [];
    const url = opts.searchUrl
      ? opts.searchUrl.replace("{q}", encodeURIComponent(query))
      : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const res = await doFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Eve/1.0)" } });
      if (!res.ok) return [];
      const html = await res.text();
      const found = [];
      const re = /https?:\/\/[^\s"'<>]+/g;
      let match;
      while ((match = re.exec(html)) && found.length < 40) {
        let link = match[0].replace(/&amp;/g, "&");
        // DuckDuckGo wraps results in a redirect carrying the real URL.
        const wrapped = link.match(/uddg=([^&]+)/);
        if (wrapped) link = decodeURIComponent(wrapped[1]);
        if (/\.(json|yaml|yml)(\?|$)/i.test(link) || /openapi|swagger|api-docs/i.test(link)) found.push(link);
      }
      return [...new Set(found)].slice(0, 12);
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // The whole thing
  // ---------------------------------------------------------------------------

  const withTimeout = async (doFetch, url, options, ms) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await doFetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * Point Eve at an API and let her work it out.
   *
   * Returns { spec, source, tier, confidence, unknown, log } — `tier` says how
   * she got there, `unknown` names any field she could not infer, and `log` is
   * the trail so you can see what she tried.
   */
  async function discover({ baseUrl, token, name, id, fetchImpl, allowNetwork = true, timeoutMs = 6000, searchUrl, cached } = {}) {
    const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch) throw new Error("No way to make requests here.");
    const base = String(baseUrl || "").replace(/\/+$/, "");
    const log = [];

    const get = async (url, auth) => {
      const headers = {};
      if (token) {
        if (!auth || auth.type === "bearer" || auth.type === "oauth2") headers.Authorization = `Bearer ${token}`;
        else if (auth.type === "header") headers[auth.header || "X-API-Key"] = token;
      }
      const res = await withTimeout(doFetch, url, { headers }, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try { return JSON.parse(text); } catch { return null; }
    };

    // --- Tier 0: something we already learned, which is all an offline Pi has.
    if (cached) {
      log.push("using the description cached from an earlier discovery");
      return { spec: cached, tier: "cache", confidence: 1, unknown: [], log };
    }

    // --- Tier 1: ask the API to describe itself.
    for (const path of WELL_KNOWN_SPEC_PATHS) {
      let doc;
      try {
        doc = await get(base + path);
      } catch {
        continue;
      }
      if (!doc) continue;
      const derived = fromOpenAPI(doc, { baseUrl: base, id, name });
      if (derived) {
        log.push(`found the API's own description at ${path}${derived.title ? ` (${derived.title})` : ""}`);
        // Fetch a real page from the chosen endpoint to pin down field names.
        for (const candidate of [derived.spec.listPath, ...derived.candidateLists]) {
          try {
            const sample = await get(base + candidate, derived.spec.auth);
            const inferred = inferFromSample(sample, {
              baseUrl: base, listPath: candidate, name: derived.spec.name, id: derived.spec.id, auth: derived.spec.auth,
            });
            if (inferred.ok) {
              inferred.spec.actions = derived.spec.actions;
              inferred.spec.capabilities = ["list", ...Object.keys(derived.spec.actions)];
              log.push(`read ${inferred.itemCount} things from ${candidate} and worked out its fields`);
              return { spec: inferred.spec, tier: "openapi", confidence: Math.max(0.75, inferred.confidence), unknown: inferred.unknown, log };
            }
          } catch { /* try the next candidate endpoint */ }
        }
        log.push("the description parsed, but no endpoint returned a usable list");
        return { spec: derived.spec, tier: "openapi-partial", confidence: 0.5, unknown: ["fields"], log };
      }
    }
    log.push("no machine-readable description published at the usual paths");

    // --- Tier 2: look at what the endpoints actually return.
    for (const path of COMMON_LIST_PATHS) {
      let sample;
      try {
        sample = await get(base + path);
      } catch {
        continue;
      }
      if (!sample) continue;
      const inferred = inferFromSample(sample, { baseUrl: base, listPath: path, name, id, auth: { type: "bearer" } });
      if (inferred.ok) {
        log.push(`worked out the shape by reading ${inferred.itemCount} things from ${path}`);
        return { spec: inferred.spec, tier: "inferred", confidence: inferred.confidence, unknown: inferred.unknown.concat("actions"), log };
      }
    }
    log.push("no endpoint returned anything that looked like a list of things");

    // --- Tier 3: the web, but only if there is one.
    if (!allowNetwork) {
      log.push("web search skipped — running offline by request");
      return { spec: null, tier: "offline", confidence: 0, unknown: ["everything"], log };
    }
    const online = await isOnline(doFetch);
    if (!online) {
      log.push("no internet connection, so nothing to search — everything above ran on the local network alone");
      return { spec: null, tier: "offline", confidence: 0, unknown: ["everything"], log };
    }

    const query = `${name || base} openapi specification json`;
    log.push(`searching the web for a published description: "${query}"`);
    const candidates = await searchWeb(query, doFetch, { searchUrl });
    for (const url of candidates) {
      let doc;
      try {
        doc = await get(url);
      } catch {
        continue;
      }
      const derived = doc && fromOpenAPI(doc, { baseUrl: base, id, name });
      if (derived) {
        log.push(`found a published description at ${url}`);
        return { spec: derived.spec, tier: "web", confidence: 0.45, unknown: ["fields"], log };
      }
    }

    log.push(candidates.length ? "nothing the search turned up was a usable description" : "the search returned nothing usable");
    return { spec: null, tier: "failed", confidence: 0, unknown: ["everything"], log };
  }

  const Discover = {
    WELL_KNOWN_SPEC_PATHS, COMMON_LIST_PATHS,
    leafPaths, findCollection, inferFromSample,
    fromOpenAPI, authFromOpenAPI, endpointsFromOpenAPI,
    isOnline, searchWeb, discover,
  };
  root.Discover = Discover;
  if (typeof module !== "undefined" && module.exports) module.exports = Discover;
})(typeof self !== "undefined" ? self : globalThis);
