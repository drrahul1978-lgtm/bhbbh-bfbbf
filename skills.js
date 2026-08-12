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
 * without leaking credentials. */
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
  function restSpec({ id, name, baseUrl, auth, listPath, itemsKey, idKey, nameKey, stateKey, actions }) {
    return {
      id: id || "custom_api",
      name: name || "Custom API",
      style: "rest",
      baseUrl: String(baseUrl || "").replace(/\/+$/, ""),
      auth: auth || { type: "none" },
      listPath: listPath || "/",
      itemsKey: itemsKey || null,
      idKey: idKey || "id",
      nameKey: nameKey || "name",
      stateKey: stateKey || "state",
      actions: actions || {},
      capabilities: ["list", ...Object.keys(actions || {})],
    };
  }

  // ---------------------------------------------------------------------------
  // The code generator
  // ---------------------------------------------------------------------------

  const authHeaderCode = (auth) => {
    if (!auth || auth.type === "none") return "";
    if (auth.type === "bearer") return `    headers.Authorization = "Bearer " + config.token;\n`;
    if (auth.type === "header") return `    headers[${JSON.stringify(auth.header || "X-API-Key")}] = config.token;\n`;
    return "";
  };

  /** Shared HTTP helper, written into every adapter Eve generates. */
  const requestCode = (spec) => `
  const BASE = ${JSON.stringify(spec.baseUrl)};

  async function request(path, options) {
    options = options || {};
    const headers = { "Content-Type": "application/json" };
${authHeaderCode(spec.auth)}    const res = await fetch(BASE + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(${JSON.stringify(spec.name)} + " replied " + res.status + " " + res.statusText);
    }
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return text; }
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
      await request(${JSON.stringify(def.path)}.replace("{id}", encodeURIComponent(thing.id)).replace("{value}", encodeURIComponent(value)), {
        method: ${JSON.stringify(def.method || "POST")},
        body: ${def.body ? JSON.stringify(def.body) : "undefined"},
      });
      return { done: ${JSON.stringify(action)}, thing: thing.name, value: value };
    }`)
      .join("");

    return `/* ${spec.name} adapter — written by Eve, ${nowStamp()}.
 *
 * Generated from the API description you gave her. Credentials are supplied at
 * compile time as config.token and never written into this source.
 */
${requestCode(spec)}
  async function probe() {
    await request(${JSON.stringify(spec.listPath)});
    return { ok: true, detail: ${JSON.stringify(spec.name)} + " answered" };
  }

  async function list() {
    const payload = await request(${JSON.stringify(spec.listPath)});
    const items = ${spec.itemsKey ? `payload[${JSON.stringify(spec.itemsKey)}] || []` : `Array.isArray(payload) ? payload : []`};
    return items.map(function (item) {
      return {
        id: item[${JSON.stringify(spec.idKey)}],
        name: item[${JSON.stringify(spec.nameKey)}] || String(item[${JSON.stringify(spec.idKey)}]),
        domain: ${JSON.stringify(spec.id)},
        state: item[${JSON.stringify(spec.stateKey)}],
        controllable: true,
        attributes: item,
      };
    });
  }

  async function act(action, thing, value) {
    if (!thing) throw new Error("Which one? I could not match that to anything.");
${actionCases}
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
  function compile(source, config, fetchImpl) {
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
