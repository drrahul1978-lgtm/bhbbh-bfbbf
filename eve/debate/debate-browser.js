/* debate-browser.js — the same judge, loaded by a page instead of by Node.
 *
 * eve/debate/debate.js is a CommonJS module so it can be tested in Node. Rather
 * than keep a second copy for the browser — which would drift from the tested
 * one the first time either changed — this fetches that exact file and gives it
 * the `require` it expects, resolved against the globals the page has already
 * loaded. One implementation, one set of tests.
 */
(function (root) {
  "use strict";

  const AVAILABLE = { "../../vision.js": () => root.Vision, "../../synth.js": () => root.Synth, "../../eve.js": () => root.Eve };

  /** Resolves to the debate module, or to null if this site does not ship it. */
  root.debateReady = (async function loadDebate() {
    try {
      const source = await fetch("eve/debate/debate.js", { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      });
      const shimRequire = (name) => {
        const get = AVAILABLE[name];
        if (!get) throw new Error(`the debate asked for ${name}, which this page has not loaded`);
        return get();
      };
      const module = { exports: {} };
      new Function("require", "module", "exports", source)(shimRequire, module, module.exports);
      root.Debate = module.exports;
      return root.Debate;
    } catch {
      // No debate module here. One Eve is a perfectly good Eve.
      return null;
    }
  })();
})(typeof self !== "undefined" ? self : globalThis);
