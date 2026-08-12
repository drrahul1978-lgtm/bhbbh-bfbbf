#!/usr/bin/env node
/* isolate-runner.js — the far side of the process boundary.
 *
 * Reads a job from stdin, compiles the adapter in a fresh context, runs the
 * requested calls, and prints JSON. Nothing here is trusted: it exists so that
 * if the code does something awful, it does it over here, in a process with an
 * empty environment and nothing worth stealing.
 */
"use strict";

const sandbox = require("./sandbox.js");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", async () => {
  let job;
  try {
    job = JSON.parse(input);
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: `unreadable job: ${err.message}` }));
    return;
  }

  const results = [];
  try {
    const adapter = sandbox.compile(job.source, {
      config: job.config || {},
      allowedHosts: job.allowedHosts || [],
      timeoutMs: job.timeoutMs || 15000,
    });

    for (const call of job.calls || []) {
      const started = Date.now();
      try {
        const value = await adapter[call.method](...(call.args || []));
        results.push({ method: call.method, ok: true, ms: Date.now() - started, value: summarise(value) });
      } catch (err) {
        results.push({ method: call.method, ok: false, ms: Date.now() - started, error: err.message });
      }
    }
    process.stdout.write(JSON.stringify({ ok: true, results, logs: adapter.__logs || [] }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message, findings: err.findings || [] }));
  }
});

/** Keep the report small — a device list can be enormous. */
function summarise(value) {
  if (Array.isArray(value)) {
    return { type: "array", length: value.length, sample: value.slice(0, 3) };
  }
  if (value && typeof value === "object") return { type: "object", value };
  return { type: typeof value, value };
}
