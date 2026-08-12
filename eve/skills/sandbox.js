/* sandbox.js — running code EVE wrote without handing it the keys.
 *
 * Generated adapters used to run via new Function(), which gives them every
 * global the host process has: `process`, and therefore `process.env`, and
 * therefore the token that opens your front door. This file takes that away.
 *
 * THREE LAYERS, AND AN HONEST NOTE ABOUT EACH
 *
 *   1. Static inspection. Source is scanned before it is ever run, and code
 *      reaching for process, require, child_process or the Function
 *      constructor is refused outright. Catches mistakes and casual mischief;
 *      a determined attacker can obfuscate around it.
 *
 *   2. A fresh V8 context (node:vm) with no host globals. The code cannot see
 *      `process`, `require` or the filesystem, and gets a network function that
 *      enforces an allowlist rather than raw fetch. This is a real barrier to
 *      accidental damage.
 *
 *      It is NOT a security boundary against deliberately hostile code. Node's
 *      vm module is explicit about this, and it is true: any host function
 *      passed in is a potential route back out via its constructor. Do not
 *      believe otherwise, and do not run a stranger's adapter this way.
 *
 *   3. A separate process, for code EVE did not write herself. Different OS
 *      process, empty environment, hard timeout, killed on overrun. This one
 *      IS a boundary — nothing in it can touch the parent's memory or secrets.
 *
 * The normal path (an adapter EVE generated for an API you named) uses layers
 * 1 and 2. Anything imported from elsewhere should go through layer 3 first.
 */
"use strict";

const vm = require("vm");
const path = require("path");
const { execFile } = require("child_process");

/** Patterns that have no business in a generated REST adapter. */
const FORBIDDEN = [
  [/\bprocess\b/, "touches `process` — that is where the environment and your secrets live"],
  [/\brequire\s*\(/, "calls require() — adapters get no modules"],
  [/\bchild_process\b/, "reaches for child_process"],
  [/\bglobalThis\b/, "reaches for globalThis"],
  [/\beval\s*\(/, "calls eval()"],
  [/\bnew\s+Function\b/, "builds code at runtime with new Function"],
  [/\bconstructor\s*\.\s*constructor\b/, "walks constructor.constructor — the classic sandbox escape"],
  [/\b__proto__\b/, "manipulates __proto__"],
  [/\bimport\s*\(/, "uses dynamic import()"],
  [/\bmodule\s*\.\s*exports\b/, "expects a module system it does not have"],
  [/\bBuffer\b/, "reaches for Buffer"],
];

/**
 * Read the source before running it. Returns { ok, findings[] } — never throws,
 * because the caller usually wants to show the findings to a human.
 */
function inspect(source) {
  const findings = [];
  const text = String(source);
  for (const [pattern, why] of FORBIDDEN) {
    const match = text.match(pattern);
    if (match) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ pattern: String(pattern), why, line });
    }
  }
  return { ok: findings.length === 0, findings };
}

class SandboxViolation extends Error {
  constructor(message, findings) {
    super(message);
    this.name = "SandboxViolation";
    this.findings = findings || [];
  }
}

/**
 * A network function the adapter gets instead of raw fetch.
 *
 * Enforces the host allowlist, which closes a real hole: a discovered API
 * description is a document from the network, and its `servers[0].url` could
 * otherwise point EVE's generated adapter at an attacker's machine.
 */
function makeGuardedFetch({ fetchImpl, allowedHosts = [], timeoutMs = 10000, onRequest = null }) {
  const doFetch = fetchImpl || globalThis.fetch;
  const allowed = allowedHosts.map((h) => String(h).toLowerCase());

  return async function guardedFetch(url, options = {}) {
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch {
      throw new Error(`That is not a usable URL: ${url}`);
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error(`Blocked ${parsed.protocol} — adapters may only speak http and https`);
    }
    if (allowed.length && !allowed.includes(parsed.hostname.toLowerCase())) {
      throw new Error(
        `Blocked a request to ${parsed.hostname}: not in the allowed hosts (${allowed.join(", ")}). ` +
        `If this is expected, add it to allowedHosts in your config.`
      );
    }
    if (onRequest) onRequest({ url: parsed.href, method: options.method || "GET" });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(parsed.href, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Compile adapter source inside a fresh context.
 *
 * `config` carries secrets, so it is only ever handed to code that passed
 * inspection — and it never appears in the source itself.
 */
function compile(source, { config = {}, fetchImpl, allowedHosts = [], timeoutMs = 10000,
                           skipInspection = false, onRequest = null } = {}) {
  const report = inspect(source);
  if (!report.ok && !skipInspection) {
    throw new SandboxViolation(
      `This adapter was refused before it ran: ${report.findings.map((f) => `line ${f.line} ${f.why}`).join("; ")}`,
      report.findings
    );
  }

  const logs = [];
  const context = vm.createContext({
    config,
    fetch: makeGuardedFetch({ fetchImpl, allowedHosts, timeoutMs, onRequest }),
    URLSearchParams,
    URL,
    console: {
      log: (...args) => logs.push(args.join(" ")),
      error: (...args) => logs.push(args.join(" ")),
      warn: (...args) => logs.push(args.join(" ")),
    },
  });

  // The adapter body is wrapped in a function that returns its interface. Note
  // there is no `process`, no `require` and no `module` in this context at all.
  const wrapped = `(function () {\n${source}\n})()`;
  let adapter;
  try {
    adapter = vm.runInContext(wrapped, context, { timeout: timeoutMs, filename: "adapter.js" });
  } catch (err) {
    throw new Error(`The adapter would not compile: ${err.message}`);
  }

  for (const method of ["probe", "list", "act"]) {
    if (typeof adapter?.[method] !== "function") {
      throw new Error(`The adapter is missing ${method}().`);
    }
  }

  // Copy results out of the sandbox rather than handing back live objects.
  //
  // Two reasons. Objects born in another context carry that context's
  // prototypes, so the host sees an Array that is not its own Array and
  // comparisons behave strangely. And more importantly, a live sandbox object
  // could carry a getter or proxy that runs sandbox code the moment host code
  // touches the property — which would undo the isolation from the inside.
  // Plain data crosses the boundary; nothing executable does.
  const host = {
    __logs: logs,
    __sandboxed: true,
  };
  for (const method of ["probe", "list", "act"]) {
    host[method] = async (...args) => toHostData(await adapter[method](...args));
  }
  return host;
}

/** Deep-copy a value into ordinary host data, dropping anything callable. */
function toHostData(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === "function") return undefined;
  if (typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value); // circular or otherwise unserialisable
  }
}

const RUNNER = path.join(__dirname, "isolate-runner.js");

/**
 * Run an adapter in a separate OS process — the boundary that actually holds.
 *
 * Used to test code EVE did not write herself before it is allowed anywhere
 * near the real system. The child gets an empty environment (so none of the
 * parent's secrets exist for it to find), a hard timeout, and is killed if it
 * overruns.
 */
function runIsolated(source, { calls = [], config = {}, allowedHosts = [], timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [RUNNER],
      {
        // Deliberately empty: the child must not inherit HA_TOKEN or anything else.
        env: { PATH: "/usr/bin:/bin" },
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        killSignal: "SIGKILL",
      },
      (err, stdout, stderr) => {
        if (err && err.killed) {
          return resolve({ ok: false, error: `timed out after ${timeoutMs}ms and was killed`, timedOut: true });
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ ok: false, error: `the isolated run produced nothing usable: ${(stderr || stdout || err?.message || "").slice(0, 400)}` });
        }
      }
    );
    child.stdin.end(JSON.stringify({ source, calls, config, allowedHosts, timeoutMs }));
  });
}

module.exports = { compile, inspect, runIsolated, makeGuardedFetch, toHostData, SandboxViolation, FORBIDDEN };
