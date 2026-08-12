#!/usr/bin/env node
/* eve-train.js — trains Eve from the command line. Built to run on a Raspberry Pi 4.
 *
 *   node eve-train.js                      one training run, writes eve-model.json
 *   node eve-train.js --watch              keep improving forever (Ctrl-C to stop)
 *   node eve-train.js --cards 3000 --epochs 300
 *   node eve-train.js --corrections my-cards.json
 *
 * Why it can keep improving: the card generator is an endless source of fresh,
 * perfectly-labelled examples, so every round trains on cards Eve has never seen.
 * A round is only kept if it beats the current model on a validation set that is
 * held fixed for the life of the process — so "improving" means measured, not
 * assumed, and a bad round is rolled back rather than saved.
 */
const fs = require("fs");
const path = require("path");
const NN = require("./nn.js");
const Vision = require("./vision.js");
const Synth = require("./synth.js");
const Eve = require("./eve.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const OUT = path.resolve(flag("out", path.join(__dirname, "eve-model.json")));
const CARDS = parseInt(flag("cards", "1200"), 10);
const EPOCHS = parseInt(flag("epochs", "150"), 10);
const LR = parseFloat(flag("lr", "0.006"));
const BATCH = parseInt(flag("batch", "24"), 10);
const VALIDATION = parseInt(flag("validation", "400"), 10);
const WATCH = has("watch");
const ROUNDS = parseInt(flag("rounds", WATCH ? "0" : "1"), 10); // 0 = forever
const QUIET = has("quiet");

const log = (...m) => !QUIET && console.log(...m);
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

/** Draw a batch of cards and turn them into training rows. */
function buildSet(count, seed, label) {
  const t0 = Date.now();
  const rand = NN.mulberry32(seed);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const card = Synth.generateCard(rand, { severity: i / Math.max(1, count - 1) });
    rows.push({
      x: Vision.extract(card.image).features,
      y: Eve.gradesToTarget(card.grades),
      grades: card.grades,
    });
  }
  log(`  ${label}: ${count} cards in ${secs(Date.now() - t0)}`);
  return rows;
}

/** Load hand-graded real cards exported from the browser studio, if given. */
function loadCorrections(file) {
  if (!file) return [];
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const rows = (raw.corrections || raw).map((c) => ({
    x: Float32Array.from(c.features),
    y: Eve.gradesToTarget(c.grades),
    grades: c.grades,
  }));
  log(`  loaded ${rows.length} hand-graded cards from ${file}`);
  return rows;
}

function main() {
  log("Eve — training from scratch, no libraries, no network.\n");

  // The validation set is drawn once and never trained on, so scores across
  // rounds are directly comparable.
  const validation = buildSet(VALIDATION, 424242, "validation set");
  const corrections = loadCorrections(flag("corrections", null));

  let net;
  if (fs.existsSync(OUT) && !has("fresh")) {
    net = NN.Net.fromJSON(JSON.parse(fs.readFileSync(OUT, "utf8")).net);
    log(`  resuming from ${path.basename(OUT)}`);
  } else {
    net = new NN.Net([Vision.FEATURE_COUNT, 64, 32, Eve.KEYS.length], { seed: 20250811 });
    log("  starting from random weights");
  }

  const saved = fs.existsSync(OUT) && !has("fresh") ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
  let best = saved?.stats?.validationMAE ?? Eve.meanAbsoluteError(net, validation);
  let cardsSeen = saved?.stats?.cardsSeen ?? 0;
  let generation = saved?.stats?.generation ?? 0;
  log(`  starting validation error: ${best.toFixed(3)} grade points\n`);

  const trainRand = NN.mulberry32(Date.now() & 0xffff);
  let round = 0;

  const runRound = () => {
    round++;
    generation++;
    log(`Round ${round} (generation ${generation})`);

    // Fresh cards every round — Eve never sees the same card twice.
    const train = buildSet(CARDS, (Date.now() ^ (round * 7919)) >>> 0, "training set");
    // Hand-graded real cards are rarer and more valuable, so they are repeated.
    const rows = train.concat(...Array(corrections.length ? 4 : 0).fill(corrections));

    // Snapshot, so a round that makes things worse can be undone.
    const before = JSON.parse(JSON.stringify(net.toJSON()));
    const xs = rows.map((r) => r.x);
    const ys = rows.map((r) => r.y);

    const t0 = Date.now();
    for (let e = 1; e <= EPOCHS; e++) {
      const loss = net.trainEpoch(xs, ys, { lr: LR, batchSize: BATCH, rand: trainRand });
      if (!QUIET && e % Math.max(1, Math.floor(EPOCHS / 4)) === 0) {
        log(`    epoch ${String(e).padStart(4)}  train MSE ${loss.toFixed(5)}`);
      }
    }
    cardsSeen += rows.length;

    const mae = Eve.meanAbsoluteError(net, validation);
    const improved = mae < best;
    log(`  trained in ${secs(Date.now() - t0)} · validation ${mae.toFixed(3)} vs best ${best.toFixed(3)} → ${improved ? "KEPT" : "rolled back"}`);

    if (improved) {
      best = mae;
      const perKey = Eve.perKeyError(net, validation);
      // Round the weights before writing: full float precision triples the file
      // size for a difference far below one grade point, and this file gets
      // served to every visitor.
      const compact = net.toJSON();
      compact.layers = compact.layers.map((l) => ({
        W: l.W.map((v) => Math.round(v * 1e5) / 1e5),
        b: l.b.map((v) => Math.round(v * 1e5) / 1e5),
      }));
      fs.writeFileSync(OUT, JSON.stringify({
        name: "Eve",
        format: "gmc-net-1",
        trainedAt: new Date().toISOString(),
        featureCount: Vision.FEATURE_COUNT,
        keys: Eve.KEYS,
        stats: { validationMAE: mae, perKey, cardsSeen, generation, validationSize: validation.length },
        net: compact,
      }));
      log(`  saved → ${path.basename(OUT)}  [${Eve.KEYS.map((k, i) => `${k} ${perKey[i].toFixed(2)}`).join(", ")}]`);
    } else {
      // Restore the better weights and carry on from there.
      const restored = NN.Net.fromJSON(before);
      net.layers.forEach((l, i) => {
        l.W.set(restored.layers[i].W);
        l.b.set(restored.layers[i].b);
      });
    }
    log("");

    if (ROUNDS === 0 || round < ROUNDS) setImmediate(runRound);
    else log(`Done. Best validation error: ${best.toFixed(3)} grade points over ${cardsSeen.toLocaleString()} cards.`);
  };

  runRound();
}

main();
