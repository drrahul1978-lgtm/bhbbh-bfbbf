/* Does EVE work out where she is, and adapt without being told?
 * Run with:  node test/platform.test.js  */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const platform = require("../eve/platform/detect.js");
const config = require("../eve/kernel/config.js");
const kernel = require("../eve/kernel/index.js");
const { CapabilityMap } = require("../eve/capabilities/map.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-platform-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

/** Machines she might wake up on, without needing the hardware to test. */
const asPi4 = {
  host: "raspberry_pi_4", class: "constrained", isPi: true,
  board: { family: "raspberry_pi", generation: 4, model: "Raspberry Pi 4 Model B Rev 1.4" },
  platform: "linux", container: null,
  resources: { cores: 4, memoryMb: 3800, arch: "arm64", arm: true, cpuModel: "Cortex-A72" },
  interfaces: { gpio: true, gpioChips: ["gpiochip0"], i2c: true, spi: false, camera: true, videoDevices: ["video0"], audio: true, bluetooth: true, vcgencmd: true },
};
const asLaptop = {
  host: "linux", class: "roomy", isPi: false,
  board: { family: null, generation: null, model: null },
  platform: "linux", container: null,
  resources: { cores: 16, memoryMb: 32000, arch: "x64", arm: false, cpuModel: "Ryzen" },
  interfaces: { gpio: false, gpioChips: [], i2c: false, spi: false, camera: false, videoDevices: [], audio: true, bluetooth: false, vcgencmd: false },
};

(async () => {
  // --- she looks, rather than being told ---
  const here = platform.detect();
  assert.ok(here.host, "she should always reach a conclusion about the host");
  assert.ok(["constrained", "modest", "roomy"].includes(here.class));
  assert.ok(here.resources.cores > 0 && here.resources.memoryMb > 0);
  assert.strictEqual(typeof here.isPi, "boolean");
  ok("detection runs on whatever this machine is and reaches a definite answer");

  assert.match(platform.describe(here), /Running on/);
  assert.match(platform.describe(asPi4), /Raspberry Pi 4 Model B/);
  assert.match(platform.describe(asLaptop), /16 cores/);
  ok("she can say plainly where she is running");

  // --- the same code, different settings ---
  const piTuning = platform.tuning(asPi4);
  const laptopTuning = platform.tuning(asLaptop);
  assert.ok(piTuning.maxImageSize < laptopTuning.maxImageSize, "a Pi should work with smaller images");
  assert.ok(piTuning.memoryCapacity < laptopTuning.memoryCapacity, "and remember less");
  assert.ok(piTuning.logFlushMs > laptopTuning.logFlushMs, "and touch the disk less often");
  assert.ok(piTuning.maxConcurrentRequests < laptopTuning.maxConcurrentRequests);
  ok("a Pi gets careful settings and a roomy machine gets to work harder");

  // A 4GB Pi is more capable than the constrained floor assumes.
  assert.strictEqual(piTuning.trainingPreset, "balanced", "4GB and a fan can do more than the minimum");
  const tinyPi = platform.tuning({ ...asPi4, resources: { ...asPi4.resources, memoryMb: 900 } });
  assert.strictEqual(tinyPi.trainingPreset, "pi", "a 1GB Pi Zero should stay at the minimum");
  ok("tuning reads the actual memory, not just the label on the board");

  // Anything unrecognised is treated cautiously rather than optimistically.
  const unknown = platform.tuning({ ...asLaptop, class: "constrained" });
  assert.strictEqual(unknown.trainingPreset, "pi");
  ok("an unfamiliar machine is treated as constrained — being slow beats falling over");

  // --- detection informs, it never overrules you ---
  const merged = config.load({
    file: path.join(tmp, "absent.json"), env: {},
    platform: platform.tuning(asPi4),
  });
  assert.strictEqual(merged.maxImageSize, 700, "the platform suggestion should apply");

  const configFile = path.join(tmp, "eve.config.json");
  fs.writeFileSync(configFile, JSON.stringify({ maxImageSize: 1600 }));
  const yours = config.load({ file: configFile, env: {}, platform: platform.tuning(asPi4) });
  assert.strictEqual(yours.maxImageSize, 1600, "what you set must win over what she guessed");
  assert.strictEqual(yours.trainingPreset, "balanced", "and everything you did not set still follows the machine");
  ok("detection sets defaults but never overrides a setting you chose");

  // --- hardware answers depend on the machine, not on wishful thinking ---
  const onPi = platform.hostCapabilities(asPi4);
  assert.strictEqual(onPi.GPIO, "available");
  assert.strictEqual(onPi.CAMERA, "available");
  const onLaptop = platform.hostCapabilities(asLaptop);
  assert.match(onLaptop.GPIO, /absent/);
  assert.match(onLaptop.CAMERA, /no video device/);
  ok("hardware is reported from what is actually present, not from the platform name");

  const piMap = new CapabilityMap({ domains: [], platform: asPi4 });
  const piAnswer = piMap.assess("read a sensor on a gpio pin");
  assert.strictEqual(piAnswer.canAcquire, "partly");
  assert.match(piAnswer.answer, /physically possible here/);
  assert.match(piAnswer.answer, /no driver/);

  const laptopMap = new CapabilityMap({ domains: [], platform: asLaptop });
  const laptopAnswer = laptopMap.assess("read a sensor on a gpio pin");
  assert.strictEqual(laptopAnswer.canAcquire, false);
  assert.match(laptopAnswer.answer, /no such hardware here/);
  assert.match(laptopAnswer.answer, /On a Raspberry Pi the answer might be different/);
  ok("the same question gets different honest answers on a Pi and on a laptop");

  // --- the kernel adopts it on boot ---
  const dir = path.join(tmp, "boot");
  const eve = kernel.boot({ configFile: path.join(tmp, "none.json"), env: {}, overrides: { dataDir: dir, logFile: path.join(dir, "e.log"), secretsFile: path.join(dir, "s.json"), logFlushMs: 10000 } });
  assert.ok(eve.platform.host, "the kernel should know where it is");
  assert.match(eve.describe(), /Running on/);
  assert.ok(eve.config.memoryCapacity > 0, "and should have adopted settings for it");
  eve.shutdown();
  const logged = fs.readFileSync(path.join(dir, "e.log"), "utf8");
  assert.match(logged, /Running on/, "and should say where it woke up in the log");
  ok("booting anywhere detects the machine, adopts settings for it and records which");

  // --- detection never throws, wherever it runs ---
  assert.doesNotThrow(() => platform.interfaces());
  assert.doesNotThrow(() => platform.board());
  assert.doesNotThrow(() => platform.containerised());
  ok("every probe degrades to 'unknown' rather than throwing on an unfamiliar system");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/platform: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
