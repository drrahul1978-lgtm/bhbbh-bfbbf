#!/usr/bin/env node
/* eve-learn.js — EVE getting better at understanding you, on the machine itself.
 *
 *   node eve-learn.js                 one round
 *   node eve-learn.js --rounds 50
 *   node eve-learn.js --watch         keep going until you stop it
 *
 * What is actually being measured: a quarter of her sentence shapes are held
 * back and never trained on. Every round practises on the rest, then sits the
 * same fixed exam. New weights are kept only if the score improves.
 *
 * A round that gets rejected is not a failure. It is the only reason the number
 * means anything — without the gate she would keep whatever she last did and
 * call it progress.
 *
 * Meant for a Raspberry Pi overnight: writes are batched through the kernel's
 * atomic storage, so pulling the power leaves the previous generation intact
 * rather than a half-written file.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Intent = require("./intent.js");
const Learn = require("./learn.js");
const platform = require("./eve/platform/detect.js");
const storage = require("./eve/kernel/storage.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const WATCH = args.includes("--watch");
const ROUNDS = parseInt(flag("rounds", WATCH ? "0" : "1"), 10);
/* Only set when you ask for it. Defaulting this to a number would override
 * whatever the machine can actually take, which is the entire point of
 * detecting the machine. */
const EPOCHS = args.includes("--epochs") ? parseInt(flag("epochs", "25"), 10) : null;
const MODEL = path.resolve(flag("model", "eve-intent.json"));
const STATS = path.resolve(flag("stats", "eve-intent-stats.json"));

/* On a Pi every write costs SD-card life, so only write when something was
 * actually kept — and at most this often even then. */
const SAVE_EVERY_MS = 60000;
let lastSave = 0;

function load() {
  if (fs.existsSync(MODEL)) {
    try {
      const net = Intent.fromJSON(JSON.parse(fs.readFileSync(MODEL, "utf8")));
      if (net) {
        const stats = fs.existsSync(STATS) ? JSON.parse(fs.readFileSync(STATS, "utf8")) : {};
        return { net, stats, from: "the model on disk" };
      }
      console.log("  The model on disk is from an older set of intents — starting fresh.");
    } catch {
      console.log("  The model on disk could not be read — starting fresh.");
    }
  }
  return { net: Learn.trainBaseline().net, stats: {}, from: "a fresh baseline" };
}

function save(trainer) {
  storage.writeJsonVersioned(MODEL, Intent.toJSON(trainer.net));
  storage.writeJsonVersioned(STATS, trainer.stats());
  lastSave = Date.now();
}

const pct = (v) => (v == null ? "  –  " : `${(v * 100).toFixed(1)}%`);

function main() {
  const { net, stats, from } = load();

  /* She sizes the work to the machine before doing any of it. The same code
   * on a Pi Zero and on a workstation should not do the same amount of work —
   * one would be unusable and the other would be lazy. */
  const info = platform.detect();
  const effort = Learn.effortFor(info);
  const trainer = new Learn.Trainer(net, stats, [], effort);
  if (trainer.best == null) trainer.best = Learn.assess(net);

  const cores = info.resources && info.resources.cores;
  const memMb = info.resources && info.resources.memoryMb;

  console.log(`
  EVE is learning to understand you — from ${from}.

    this machine        ${platform.describe(info)}
                        ${cores || "?"} core${cores === 1 ? "" : "s"}, ${memMb ? `${(memMb / 1024).toFixed(1)}GB` : "unknown memory"} — ${effort.label}
    so each round       ${EPOCHS || effort.epochs} epochs${EPOCHS ? " (you asked for that)" : ""} · ${effort.fills} device names per phrasing · ${effort.variations} reworded ${effort.variations === 1 ? "copy" : "copies"}

    held back and never trained on   ${Learn.heldOutShapes()} sentence shapes (${Learn.heldOutRows().length} test sentences)
    starting score on those          ${pct(trainer.best)}
    ${WATCH ? "running until you stop it (Ctrl-C)" : `running ${ROUNDS} round${ROUNDS === 1 ? "" : "s"}`}
`);

  let round = 0;
  let dirty = false;

  const tick = () => {
    const r = trainer.round(EPOCHS ? { epochs: EPOCHS } : {});
    round++;
    if (r.kept) dirty = true;

    console.log(
      `  gen ${String(r.generation).padStart(4)}   ${pct(r.accuracy)}   ` +
      (r.kept ? `kept — new best ${pct(r.best)}` : `rejected (best stands at ${pct(r.best)})`)
    );

    if (dirty && Date.now() - lastSave > SAVE_EVERY_MS) { save(trainer); dirty = false; }

    if (!WATCH && round >= ROUNDS) {
      if (dirty) save(trainer);
      const s = trainer.stats();
      console.log(`
  Done. ${s.keptRounds} kept, ${s.rejectedRounds} rejected, best ${pct(s.accuracy)}.
  Her mind is ${MODEL} — copy it wherever you want her.
`);
      return;
    }
    setImmediate(tick);
  };

  const finish = () => {
    if (dirty) save(trainer);
    const s = trainer.stats();
    console.log(`\n\n  Stopped. ${s.keptRounds} kept, ${s.rejectedRounds} rejected, best ${pct(s.accuracy)}.\n`);
    process.exit(0);
  };
  process.on("SIGINT", finish);

  tick();
}

main();
