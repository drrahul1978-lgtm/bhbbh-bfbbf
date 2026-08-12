/* skills.js — how Eve gains a capability she did not ship with.
 *
 * When she meets an API she has never spoken to, she writes the adapter for it:
 * this file turns a description of an API into real JavaScript source, saves it,
 * compiles it, and runs it. The generated code is plain and readable, and the
 * studio shows it to you before anything is executed.
 *
 * Where the line is, honestly: this is code *generation from a description*, not
 * a language model inventing programs. She can write an adapter for an API whose
 * shape she has been told (base URL, auth, which endpoint lists things, which
 * endpoints act on them) — which covers Home Assistant and most REST services.
 * She cannot read prose documentation and work it out unaided.
 *
 * Secrets are never written into the generated source. Tokens are supplied when
 * the code is compiled, so an adapter can be displayed, exported or committed
 * without leaking credentials.
 *
 * On Node, compiled adapters run inside eve/skills/sandbox.js — a context with
 * no process, no require and a network function that enforces a host allowlist.
 * In the browser they run with the page's authority, which is why the studio
 * shows you the source before anything executes. */
(function (root) {
  "use strict";

  const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

  // ---------------------------------------------------------------------------
  // Descriptions of APIs Eve knows how to write an adapter for
  // ---------------------------------------------------------------------------

  /**
   * Home Assistant's REST API.
   * Entities look like "light.kitchen" — the part before the dot is the domain,
   * which is also the service namespace used to control it.
   */
  function homeAssistantSpec(baseUrl) {
    return {
      id: "home_assistant",
      name: "Home Assistant",
      style: "home_assistant",
      baseUrl: String(baseUrl || "").replace(/\/+$/, ""),
      auth: { type: "bearer" },
      docs: "https://developers.home-assistant.io/docs/api/rest/",
      capabilities: ["list", "turn_on", "turn_off", "toggle", "set_level", "query_state"],
    };
  }

  /**
   * A generic REST service. Give it the endpoint that lists things and the
   * endpoints that act on them, and Eve writes the rest.
   */
  function restSpec({ id, name, baseUrl, auth, listPath, itemsKey, idKey, nameKey, stateKey, actions, nextKey }) {
    return {
      id: id || "custom_api",
      name: name || "Custom API",
      style: "rest",
      baseUrl: String(baseUrl || "").replace(/\/+$/, ""),
      auth: auth || { type: "none" },
      listPath: listPath || "/",
      // Any of these may be a dotted path ("traits.OnOff.on"), because plenty of
      // APIs bury the interesting value several objects deep.
      itemsKey: itemsKey || null,
      idKey: idKey || "id",
      nameKey: nameKey || "name",
      stateKey: stateKey || "state",
      nextKey: nextKey || null,   // key holding the "next page" URL, if paged
      actions: actions || {},
      capabilities: ["list", ...Object.keys(actions || {})],
    };
  }

  // ---------------------------------------------------------------------------
  // The code generator
  // ---------------------------------------------------------------------------

  const authHeaderCode = (auth) => {
    if (!auth || auth.type === "none") return "";
    if (auth.type === "bearer" || auth.type === "oauth2") return `    headers.Authorization = "Bearer " + config.token;\n`;
    if (auth.type === "header") return `    headers[${JSON.stringify(auth.header || "X-API-Key")}] = config.token;\n`;
    if (auth.type === "basic") return `    headers.Authorization = "Basic " + config.token;\n`;
    return "";
  };

  /** Some APIs want the key in the query string rather than a header. */
  const authQueryCode = (auth) =>
    auth && auth.type === "query"
      ? `    url += (url.indexOf("?") >= 0 ? "&" : "?") + ${JSON.stringify(auth.param || "key")} + "=" + encodeURIComponent(config.token);\n`
      : "";

  /**
   * OAuth tokens expire, usually within the hour. If a refresh token and token
   * endpoint were supplied, the adapter renews its own access token on the first
   * 401 and retries once, so a Pi left running for days keeps working.
   */
  const refreshCode = (auth) =>
    auth && auth.type === "oauth2"
      ? `
  let accessToken = config.token;

  async function refreshAccessToken() {
    if (!config.refreshToken || !config.tokenUrl) return false;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
      client_id: config.clientId || "",
      client_secret: config.clientSecret || "",
    });
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const json = await res.json();
    if (!json.access_token) return false;
    accessToken = json.access_token;
    return true;
  }
`
      : "";

  /** Shared HTTP helper, written into every adapter Eve generates. */
  const requestCode = (spec) => `
  const BASE = ${JSON.stringify(spec.baseUrl)};
${refreshCode(spec.auth)}
  async function request(path, options) {
    options = options || {};
    let url = path.indexOf("http") === 0 ? path : BASE + path;
    const headers = { "Content-Type": "application/json" };
${authHeaderCode(spec.auth)}${authQueryCode(spec.auth)}    let res = await fetch(url, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
${spec.auth && spec.auth.type === "oauth2" ? `    // Access token expired? Renew it once and try again.
    if (res.status === 401 && await refreshAccessToken()) {
      headers.Authorization = "Bearer " + accessToken;
      res = await fetch(url, {
        method: options.method || "GET",
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }
` : ""}    if (!res.ok) {
      throw new Error(${JSON.stringify(spec.name)} + " replied " + res.status + " " + res.statusText);
    }
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return text; }
  }
`;

  /**
   * Helpers written into every generic adapter.
   *
   * `pick` walks a dotted path, because interesting values are often buried
   * ("traits.OnOff.on"). `fill` substitutes {id} and {value} through a request
   * body, so an action can put your number where the API expects it rather than
   * only in the URL.
   */
  const helpersCode = `
  function pick(obj, path) {
    if (!path) return undefined;
    // A path is a list of keys. Real-world keys contain dots of their own
    // ("sdm.devices.traits.Info"), so a plain string is only ever one key.
    const segments = Array.isArray(path) ? path : [path];
    return segments.reduce(function (acc, key) {
      return acc == null ? undefined : acc[key];
    }, obj);
  }

  function fill(template, ctx) {
    if (typeof template === "string") {
      return template.replace(/\{(id|value)\}/g, function (_, key) { return ctx[key]; });
    }
    if (Array.isArray(template)) return template.map(function (t) { return fill(t, ctx); });
    if (template && typeof template === "object") {
      const out = {};
      for (const key of Object.keys(template)) out[key] = fill(template[key], ctx);
      return out;
    }
    // A bare {value} placeholder keeps the caller's real type (number/boolean).
    return template;
  }
`;

  function generateHomeAssistant(spec) {
    return `/* ${spec.name} adapter — written by Eve, ${nowStamp()}.
 *
 * Generated from the API description, not hand-written and not downloaded.
 * The access token is NOT in this file: it arrives as config.token when the
 * adapter is compiled, so this source is safe to read, export or commit.
 *
 * ${spec.docs}
 */
${requestCode(spec)}
  /** Confirm we can actually reach it, and say what version answered. */
  async function probe() {
    const info = await request("/api/config");
    return {
      ok: true,
      detail: (info && info.location_name ? info.location_name : "Home Assistant") +
              (info && info.version ? " " + info.version : ""),
    };
  }

  /** Every entity, flattened into the shape Eve's skills expect. */
  async function list() {
    const states = await request("/api/states");
    return states.map(function (entity) {
      const domain = String(entity.entity_id).split(".")[0];
      const attrs = entity.attributes || {};
      return {
        id: entity.entity_id,
        name: attrs.friendly_name || entity.entity_id.split(".")[1].replace(/_/g, " "),
        domain: domain,
        state: entity.state,
        controllable: ["light", "switch", "fan", "input_boolean", "climate", "media_player", "cover", "script"].indexOf(domain) >= 0,
        attributes: attrs,
      };
    });
  }

  /** Call a Home Assistant service against one entity. */
  async function callService(domain, service, data) {
    return request("/api/services/" + domain + "/" + service, {
      method: "POST",
      body: Object.assign({ entity_id: data.entity_id }, data.extra || {}),
    });
  }

  /**
   * Do the thing. Covers on/off/toggle, brightness and temperature, and
   * reading a single entity's current state.
   */
  async function act(action, thing, value) {
    if (!thing) throw new Error("Which device? I could not match that to anything on your system.");
    const domain = thing.domain;

    if (action === "turn_on" || action === "turn_off" || action === "toggle") {
      const service = action === "toggle" ? "toggle" : action;
      // Covers open and close rather than power on and off.
      const mapped = domain === "cover"
        ? (action === "turn_on" ? "open_cover" : action === "turn_off" ? "close_cover" : "toggle")
        : service;
      await callService(domain, mapped, { entity_id: thing.id });
      return { done: action, thing: thing.name };
    }

    if (action === "set_level") {
      if (value == null) throw new Error("Set it to what? Give me a number.");
      if (domain === "climate") {
        await callService("climate", "set_temperature", { entity_id: thing.id, extra: { temperature: value } });
        return { done: "set_temperature", thing: thing.name, value: value };
      }
      if (domain === "media_player") {
        await callService("media_player", "volume_set", { entity_id: thing.id, extra: { volume_level: Math.max(0, Math.min(1, value / 100)) } });
        return { done: "set_volume", thing: thing.name, value: value };
      }
      await callService(domain === "light" ? "light" : domain, "turn_on", {
        entity_id: thing.id,
        extra: { brightness_pct: Math.max(0, Math.min(100, value)) },
      });
      return { done: "set_brightness", thing: thing.name, value: value };
    }

    if (action === "query_state") {
      const entity = await request("/api/states/" + thing.id);
      return { done: "query_state", thing: thing.name, state: entity.state, attributes: entity.attributes };
    }

    throw new Error("I do not know how to '" + action + "' yet.");
  }

  return { name: ${JSON.stringify(spec.name)}, id: ${JSON.stringify(spec.id)}, probe: probe, list: list, act: act };
`;
  }

  function generateRest(spec) {
    const actionCases = Object.entries(spec.actions)
      .map(([action, def]) => `
    if (action === ${JSON.stringify(action)}) {
      const ctx = { id: thing.id, value: value };
      await request(fill(${JSON.stringify(def.path)}, { id: encodeURIComponent(thing.id), value: encodeURIComponent(value) }), {
        method: ${JSON.stringify(def.method || "POST")},
        body: ${def.body ? `fill(${JSON.stringify(def.body)}, ctx)` : "undefined"},
      });
      return { done: ${JSON.stringify(action)}, thing: thing.name, value: value };
    }`)
      .join("");

    return `/* ${spec.name} adapter — written by Eve, ${nowStamp()}.
 *
 * Generated from the API's own description. Credentials are supplied at compile
 * time as config.token and are never written into this source.
 */
${requestCode(spec)}${helpersCode}
  async function probe() {
    await request(${JSON.stringify(spec.listPath)});
    return { ok: true, detail: ${JSON.stringify(spec.name)} + " answered" };
  }

  /** Pull one page of things out of whatever shape the payload arrives in. */
  function itemsFrom(payload) {
    const raw = ${spec.itemsKey ? `pick(payload, ${JSON.stringify(spec.itemsKey)})` : "payload"};
    if (Array.isArray(raw)) return raw;
    // Some APIs key their collection by id instead of returning an array.
    if (raw && typeof raw === "object") {
      return Object.keys(raw).map(function (key) {
        const item = raw[key];
        return (item && typeof item === "object") ? Object.assign({ _key: key }, item) : { _key: key, value: item };
      });
    }
    return [];
  }

  function normalise(item) {
    const id = pick(item, ${JSON.stringify(spec.idKey)});
    const name = pick(item, ${JSON.stringify(spec.nameKey)});
    return {
      id: id != null ? id : item._key,
      name: String(name != null ? name : (id != null ? id : item._key)),
      domain: ${JSON.stringify(spec.id)},
      state: pick(item, ${JSON.stringify(spec.stateKey)}),
      controllable: true,
      attributes: item,
    };
  }

  async function list() {
    let payload = await request(${JSON.stringify(spec.listPath)});
    let things = itemsFrom(payload).map(normalise);
${spec.nextKey ? `
    // Follow pagination links, with a hard stop so a broken API cannot spin.
    let next = pick(payload, ${JSON.stringify(spec.nextKey)});
    let pages = 0;
    while (next && pages++ < 20) {
      payload = await request(next);
      things = things.concat(itemsFrom(payload).map(normalise));
      next = pick(payload, ${JSON.stringify(spec.nextKey)});
    }
` : ""}    return things;
  }

  async function act(action, thing, value) {
    if (!thing) throw new Error("Which one? I could not match that to anything.");
${actionCases}
    if (action === "query_state") {
      const current = (await list()).filter(function (t) { return t.id === thing.id; })[0];
      return { done: "query_state", thing: thing.name, state: current ? current.state : "unknown" };
    }
    throw new Error("This adapter cannot '" + action + "'.");
  }

  return { name: ${JSON.stringify(spec.name)}, id: ${JSON.stringify(spec.id)}, probe: probe, list: list, act: act };
`;
  }

  /** Description of an API → JavaScript source for an adapter. */
  function generateAdapter(spec) {
    if (!spec || !spec.baseUrl) throw new Error("An adapter needs at least a base URL.");
    return spec.style === "home_assistant" ? generateHomeAssistant(spec) : generateRest(spec);
  }

  /**
   * Turn generated source into a live object.
   *
   * This runs code, so treat it the way you would treat any script you are about
   * to run: it comes from generateAdapter() above or from a file you saved, and
   * the studio shows it to you first. `config` carries the secrets so they stay
   * out of the source.
   */
  function compile(source, config, fetchImpl, options = {}) {
    // Node: run it in a sandbox with no host globals, so an adapter cannot
    // reach process.env and read the token that opens your front door.
    // The browser has no equivalent, and falls back below.
    const Sandbox = root.EveSandbox || (typeof require !== "undefined" ? require("./eve/skills/sandbox.js") : null);
    if (Sandbox) {
      return Sandbox.compile(source, {
        config: config || {},
        fetchImpl,
        allowedHosts: options.allowedHosts || [],
        timeoutMs: options.timeoutMs || 10000,
        onRequest: options.onRequest || null,
      });
    }

    // Browser fallback. There is no vm module here, so this is the old
    // behaviour: the adapter runs with the page's own authority. Acceptable
    // because a page has no filesystem and no environment variables — but it
    // is why the studio shows you the code before running it.
    const factory = new Function("config", "fetch", source);
    const adapter = factory(config || {}, fetchImpl || (typeof fetch !== "undefined" ? fetch : null));
    for (const method of ["probe", "list", "act"]) {
      if (typeof adapter[method] !== "function") {
        throw new Error(`The generated adapter is missing ${method}().`);
      }
    }
    return adapter;
  }

  /** Write the adapter and remember it, so the skill survives a reload. */
  function buildSkill(spec, config, fetchImpl) {
    const source = generateAdapter(spec);
    const adapter = compile(source, config, fetchImpl);
    return { spec, source, adapter, writtenAt: new Date().toISOString(), lines: source.trim().split("\n").length };
  }

  // ---------------------------------------------------------------------------
  // Registry — skills she has written, kept between sessions
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = "eve_skills";
  const storageAvailable = () => {
    try { return typeof localStorage !== "undefined"; } catch { return false; }
  };

  /** Saved without credentials — only the API description and the source. */
  function saveSkill(skill) {
    if (!storageAvailable()) return false;
    const all = loadSkills();
    const next = all.filter((s) => s.spec.id !== skill.spec.id);
    next.push({ spec: skill.spec, source: skill.source, writtenAt: skill.writtenAt, lines: skill.lines });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  function loadSkills() {
    if (!storageAvailable()) return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  }

  function forgetSkill(id) {
    if (!storageAvailable()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadSkills().filter((s) => s.spec.id !== id)));
  }

  const Skills = {
    homeAssistantSpec, restSpec,
    generateAdapter, compile, buildSkill,
    saveSkill, loadSkills, forgetSkill,
    STORAGE_KEY,
  };
  root.Skills = Skills;
  if (typeof module !== "undefined" && module.exports) module.exports = Skills;
})(typeof self !== "undefined" ? self : globalThis);
