/* Data on a drive she was never told about: does she find it, use it when
 * there is nothing local, and leave other people's drives alone?
 * Run with:  node test/external.test.js  */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ext = require("../eve/platform/external.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-external-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

/** A pretend mount point, the way an OS would present a plugged-in drive. */
function makeVolume(name, layout) {
  const volume = path.join(tmp, "media", name);
  fs.mkdirSync(volume, { recursive: true });
  for (const [file, contents] of Object.entries(layout)) {
    const full = path.join(volume, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (contents === "dir") fs.mkdirSync(full, { recursive: true });
    else fs.writeFileSync(full, contents);
  }
  return volume;
}

(async () => {
  // A drive carrying a full EVE, the way you would prepare one for an offline Pi.
  makeVolume("EVE_DATA", {
    "eve-data/eve-model.json": JSON.stringify({ format: "gmc-net-1" }),
    "eve-data/eve-intent.json": JSON.stringify({ format: "eve-intent-1" }),
    "eve-data/memories.json": "[]",
    "eve-data/skills/specs": "dir",
    "eve-data/cases.json": "[]",
  });
  // Somebody's holiday photos. Not hers, and none of her business.
  makeVolume("HOLIDAY", { "DCIM/IMG_0001.JPG": "not a card", "notes.txt": "hello" });
  // A drive with just her weights loose at the top, which is how someone would
  // most likely copy them across.
  makeVolume("SPARE", { "eve-model.json": JSON.stringify({ format: "gmc-net-1" }) });

  const volumes = ext.scan({ extraPaths: [path.join(tmp, "media")] });
  const names = volumes.map((v) => path.basename(v.volume)).sort();
  assert.deepStrictEqual(names, ["EVE_DATA", "SPARE"], `found: ${names.join(", ")}`);
  ok("finds the drives carrying her data and ignores the one full of holiday photos");

  const full = volumes.find((v) => v.volume.endsWith("EVE_DATA"));
  assert.strictEqual(full.weights, true);
  assert.strictEqual(full.language, true);
  assert.strictEqual(full.memory, true);
  assert.strictEqual(full.skills, true);
  assert.ok(full.holds.includes("weights") && full.holds.includes("memory"));
  ok("reports what each drive actually holds, rather than assuming");

  const spare = volumes.find((v) => v.volume.endsWith("SPARE"));
  assert.strictEqual(spare.weights, true);
  assert.strictEqual(spare.memory, false, "it should not claim what is not there");
  ok("a drive with only her weights is recognised as exactly that");

  // --- nothing local: the drive fills the gap ---
  const bare = path.join(tmp, "bare-pi");
  fs.mkdirSync(bare, { recursive: true });
  const offline = ext.resolveSources({ localDir: bare, volumes });
  assert.strictEqual(offline.offlineCapable, true, "a Pi with a drive plugged in can work");
  assert.strictEqual(offline.sources.weights.from, "external");
  assert.ok(offline.sources.weights.path.includes("EVE_DATA"));
  assert.ok(offline.notes.some((n) => /filled the gap/.test(n)), "and it should say where it came from");
  ok("with nothing installed locally, she runs from the plugged-in drive");

  // --- local data wins ---
  const settled = path.join(tmp, "settled-pi");
  fs.mkdirSync(settled, { recursive: true });
  fs.writeFileSync(path.join(settled, "eve-model.json"), JSON.stringify({ format: "gmc-net-1" }));
  const local = ext.resolveSources({ localDir: settled, volumes });
  assert.strictEqual(local.sources.weights.from, "local",
    "a drive is a source, not an authority — plugging one in must not silently replace her");
  assert.strictEqual(local.sources.memory.from, "external", "…but it still fills what is genuinely missing");
  ok("what is already installed wins; the drive only fills what is missing");

  // --- nothing at all ---
  const nothing = ext.resolveSources({ localDir: path.join(tmp, "empty-pi"), volumes: [] });
  assert.strictEqual(nothing.offlineCapable, false);
  assert.strictEqual(nothing.sources.weights, null);
  assert.match(ext.describe([]), /No plugged-in drive/);
  ok("with no drive and nothing installed she says so instead of pretending");

  // --- it reads, and only reads ---
  const before = fs.readdirSync(path.join(tmp, "media", "HOLIDAY", "DCIM"));
  ext.scan({ extraPaths: [path.join(tmp, "media")] });
  assert.deepStrictEqual(fs.readdirSync(path.join(tmp, "media", "HOLIDAY", "DCIM")), before,
    "scanning must not modify anything on a drive");
  const source = fs.readFileSync(path.join(__dirname, "..", "eve", "platform", "external.js"), "utf8");
  assert.ok(!/writeFile|mkdir|unlink|rmdir|rename|exec/.test(source),
    "the scanner must not be able to write, mount or delete anything");
  ok("it only ever reads — no writing, no mounting, no deleting, asserted in the source");

  // --- a read-only drive is fine ---
  const readOnly = ext.inspect(path.join(tmp, "media", "EVE_DATA"));
  assert.ok("writable" in readOnly, "it should notice whether it could write back");
  ok("it notices whether a drive is writable, without needing it to be");

  // --- where it looks makes sense for the machine ---
  const roots = ext.mountRoots();
  assert.ok(roots.length > 0);
  if (os.platform() === "linux") {
    assert.ok(roots.some((r) => r.startsWith("/media")), "on a Pi, /media is where drives appear");
    assert.ok(roots.some((r) => r.startsWith("/mnt")));
  }
  ok(`looks where drives actually mount on this platform (${os.platform()})`);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/platform/external: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
