#!/usr/bin/env node
/* eve-pi.js — EVE on the Raspberry Pi, with her status light.
 *
 *   node eve-pi.js                    watch her health and drive the LEDs
 *   node eve-pi.js --test             walk through red, yellow and green
 *   node eve-pi.js --pins 17,27,22    red,yellow,green as BCM numbers
 *   node eve-pi.js --serve            also serve her pages on port 8080
 *
 * What the light means:
 *
 *   RED     something is wrong with her — too hot, no disk space, her mind
 *           file unreadable, the card being throttled
 *   YELLOW  she needs you — she has seen something she cannot name, or been
 *           asked something she could not work out, and will not guess
 *   GREEN   she is running and knows what she is doing
 *
 * The yellow light is the interesting one. She refuses to guess at an object
 * she was never taught, which on a screen is an honest message and on a
 * breadboard is a light telling you to come over and tell her what it is.
 *
 * Wiring is in PI.md. Nothing to install — no GPIO library, no compiler.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const health = require("./eve/kernel/health.js");
const platform = require("./eve/platform/detect.js");
const { StatusLight, DEFAULT_PINS } = require("./eve/platform/gpio.js");
const { Status } = require("./eve/status.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const CHECK_EVERY_MS = parseInt(flag("every", "5000"), 10);
const PORT = parseInt(flag("port", "8099"), 10);

/** Pins as red,yellow,green — BCM numbers, the ones every Pi pinout uses. */
function pins() {
  const given = flag("pins", null);
  if (!given) return { ...DEFAULT_PINS };
  const [red, yellow, green] = given.split(",").map((n) => parseInt(n.trim(), 10));
  if ([red, yellow, green].some((n) => !Number.isInteger(n) || n < 0 || n > 27)) {
    console.error(`  --pins wants three BCM numbers 0-27, like --pins 17,27,22`);
    process.exit(1);
  }
  return { red, yellow, green };
}

const light = new StatusLight({ pins: pins() });
const status = new Status({ light });

const say = (...m) => console.log(...m);

function banner() {
  const info = platform.detect();
  const mem = info.resources?.memoryMb;
  say(`
  EVE on ${platform.describe(info)}

    ${light.describe()}
    ${mem ? `${(mem / 1024).toFixed(1)}GB memory` : "memory unknown"}, ${info.resources?.cores || "?"} cores
`);
  if (!light.wired) {
    say(`  No GPIO here, so the light is tracked but not lit. On the Pi it will be.`);
    say(`  If this IS the Pi and the light is not lit, she needs one of the two`);
    say(`  tools she drives pins with:\n`);
    say(`      sudo apt install raspi-utils     gives her 'pinctrl' (Pi OS Bookworm and later)`);
    say(`      sudo apt install libgpiod-bin    gives her 'gpioset' (works on any Pi OS)\n`);
  }
}

/** Walk the three colours so you can check the wiring before trusting it. */
async function selfTest() {
  say(`  Testing the wiring. Each light should come on for two seconds.\n`);
  for (const colour of ["red", "yellow", "green"]) {
    const result = light.show(colour);
    say(`    ${{ red: "🔴", yellow: "🟡", green: "🟢" }[colour]} ${colour}` +
        `${result.failed ? `  ✗ ${result.failed.join("; ")}` : ""}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  light.off();
  say(`\n  All three off. If one never lit, check that leg and its resistor — and`);
  say(`  that the LED is the right way round; the long leg goes to the pin.\n`);
}

/**
 * A small endpoint so her page can tell the light what is happening.
 *
 * The browser is where she sees and hears; the light lives out here. Rather
 * than moving the camera into Node, the page posts what it found and this
 * turns it into a colour. One line of state, nothing else.
 */
function serve() {
  const server = http.createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        /* Her page is served from a different port, so it is a different
         * origin. This endpoint only accepts a colour and a reason — there is
         * nothing here worth defending with CORS. */
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") return send(204, {});

    if (req.url === "/status" && req.method === "GET") {
      return send(200, { colour: status.colour, reason: status.reason, wired: light.wired, mode: light.mode });
    }

    if (req.url === "/saw-unknown" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on("end", () => {
        let detail = "an object I do not recognise";
        try { detail = JSON.parse(body || "{}").detail || detail; } catch { /* use the default */ }
        const state = status.sawSomethingUnknown(String(detail).slice(0, 120));
        say(`  ${status.describe()}`);
        send(200, { colour: state.colour, reason: state.reason });
      });
      return;
    }

    if (req.url === "/taught" && req.method === "POST") {
      const state = status.resolved("unknown_object");
      say(`  ${status.describe()}`);
      return send(200, { colour: state.colour, reason: state.reason });
    }

    send(404, { error: "she answers /status, /saw-unknown and /taught" });
  });

  server.listen(PORT, () => {
    say(`  Her light is listening on http://localhost:${PORT} — /status, /saw-unknown, /taught\n`);
  });
  return server;
}

/** Read her health, and check the things that are hers rather than the system's. */
function checkHealth() {
  const tuning = platform.tuning();
  const assessment = health.assess(health.snapshot("."), {
    maxTemperatureC: 75,
    minFreeDiskMb: tuning?.health?.minFreeDiskMb || 1000,
    maxMemoryPercent: 85,
  });
  status.observeHealth(assessment);

  /* Her mind is a file, and a Pi that lost power mid-write is exactly the case
   * the versioned storage exists for. If it cannot be read at all, that is red:
   * nothing she does afterwards would mean anything. */
  const mind = path.join(__dirname, "eve-intent.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(mind, "utf8"));
    if (!parsed || !parsed.net) throw new Error("no weights in it");
    status.clearFault("mind");
  } catch (err) {
    status.fault("mind", `I cannot read my own mind file (${err.message})`);
  }

  const throttled = assessment.snapshot?.throttling;
  if (throttled && (throttled.underVoltage || throttled.throttled)) {
    status.fault("power", "the Pi is being throttled — check the power supply and the fan");
  } else {
    status.clearFault("power");
  }
}

async function main() {
  banner();

  if (has("test")) {
    await selfTest();
    light.release();
    return;
  }

  const server = has("serve") ? serve() : null;

  checkHealth();
  say(`  ${status.describe()}\n`);

  const timer = setInterval(() => {
    const before = status.colour;
    checkHealth();
    if (status.colour !== before) say(`  ${status.describe()}`);
  }, CHECK_EVERY_MS);

  const stop = () => {
    clearInterval(timer);
    server?.close();
    /* Leave no colour lit. A light left on after she stops says she is running
     * when she is not, which is the one thing it must never say. */
    light.release();
    say(`\n  Stopped, lights off.\n`);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main();
