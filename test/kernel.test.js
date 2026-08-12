/* The kernel's promises, tested as promises rather than intentions:
 * that EVE cannot claim success she did not have, that a capability cannot be
 * used without being granted, and that a secret cannot reach the disk.
 * Run with:  node test/kernel.test.js  */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { Ledger } = require("../eve/kernel/audit.js");
const { Vault } = require("../eve/kernel/vault.js");
const { Logger } = require("../eve/kernel/log.js");
const { Permissions, PermissionDenied } = require("../eve/kernel/permissions.js");
const { assess } = require("../eve/kernel/health.js");
const config = require("../eve/kernel/config.js");
const kernel = require("../eve/kernel/index.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-kernel-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

// ---------------------------------------------------------------- audit
(function auditTests() {
  const ledger = new Ledger();

  const entry = ledger.begin({ action: "install skill", why: "user asked for Spotify" });
  assert.strictEqual(entry.state, "PLANNED");
  // The whole point: you cannot skip straight to success.
  assert.throws(() => entry.succeeded("done"), /Cannot go from PLANNED to SUCCEEDED/);
  entry.attempted();
  entry.succeeded({ file: "spotify.js" });
  assert.throws(() => entry.verified(null), /requires evidence/);
  entry.verified({ test: "adapter listed 12 playlists" });
  assert.strictEqual(entry.state, "VERIFIED");
  ok("an action cannot reach SUCCEEDED without being ATTEMPTED, or VERIFIED without evidence");

  assert.throws(() => ledger.begin({ action: "do a thing" }), /needs a reason/);
  ok("every entry must record why, not just what");

  // Success and verification are different claims.
  const unverified = ledger.begin({ action: "turn on lamp", why: "user asked" });
  unverified.attempted();
  unverified.succeeded({ http: 200 });
  assert.strictEqual(unverified.state, "SUCCEEDED");
  assert.notStrictEqual(unverified.state, "VERIFIED");
  ok("'the call returned 200' stays SUCCEEDED, not VERIFIED");

  // A failing verification must not leave a success on the record.
  return ledger;
})();

(async function auditRunTests() {
  const ledger = new Ledger();
  await ledger.run(
    { action: "write file", why: "skill needs it" },
    async () => ({ bytes: 10 }),
    async (result) => (result.bytes > 0 ? { checked: "file is non-empty" } : null)
  );
  assert.strictEqual(ledger.summary().VERIFIED, 1);

  // Work that runs but cannot be confirmed must not read as verified.
  await ledger.run({ action: "set thermostat", why: "user asked" }, async () => ({ sent: true }), async () => null);
  const unconfirmed = ledger.all().find((e) => e.action === "set thermostat");
  assert.strictEqual(unconfirmed.state, "FAILED");
  assert.match(unconfirmed.error, /could not confirm/);
  ok("work that cannot be confirmed is recorded as FAILED, never as success");

  await assert.rejects(() => ledger.run({ action: "explode", why: "test" }, async () => { throw new Error("boom"); }));
  assert.strictEqual(ledger.all().find((e) => e.action === "explode").state, "FAILED");
  ok("a thrown error is recorded as FAILED and re-thrown, not swallowed");
})();

// ------------------------------------------------------------ permissions
(async function permissionTests() {
  const denied = new Permissions();
  await assert.rejects(() => denied.request("SELF_MODIFICATION"), PermissionDenied);
  await assert.rejects(() => denied.request("SYSTEM_ADMIN"), PermissionDenied);
  await assert.rejects(() => denied.request("PACKAGE_INSTALLATION"), PermissionDenied);
  ok("the capabilities that could end the machine are denied by default");

  // No confirm function = nobody present = no.
  const nobodyHome = new Permissions({ policy: { HOME_AUTOMATION: "ask" } });
  await assert.rejects(() => nobodyHome.request("HOME_AUTOMATION"), /nobody is present/);
  ok("an 'ask' with no human present fails closed rather than open");

  const asked = [];
  const withHuman = new Permissions({
    policy: { HOME_AUTOMATION: "ask", CODE_EXECUTION: "ask" },
    confirm: async (cap) => { asked.push(cap); return cap !== "CODE_EXECUTION"; },
  });
  assert.strictEqual(await withHuman.request("HOME_AUTOMATION", { device: "front door" }), true);
  await assert.rejects(() => withHuman.request("CODE_EXECUTION"), /you said no/);
  assert.deepStrictEqual(asked, ["HOME_AUTOMATION", "CODE_EXECUTION"]);
  ok("a human's yes is honoured and a human's no is enforced");

  // "Always" must never apply to the dangerous set.
  const always = new Permissions({
    policy: { COMMAND_EXECUTION: "allow", FILE_WRITE: "ask" },
    confirm: async () => "always",
  });
  let commandAsks = 0;
  always.confirm = async (cap) => { if (cap === "COMMAND_EXECUTION") commandAsks++; return "always"; };
  await always.request("COMMAND_EXECUTION");
  await always.request("COMMAND_EXECUTION");
  assert.strictEqual(commandAsks, 2, "high-risk capabilities must ask every single time");
  await always.request("FILE_WRITE");
  await always.request("FILE_WRITE");
  ok("high-risk capabilities re-ask every time, even when set to allow");

  // A guarded action that is refused must never run the work.
  let ran = false;
  const guarded = new Permissions({ policy: { GPIO: "deny" }, audit: new Ledger() });
  await assert.rejects(() => guarded.guard("GPIO", { action: "pulse pin 17", why: "test" }, async () => { ran = true; }));
  assert.strictEqual(ran, false, "refused work must not execute");
  ok("refusing a capability prevents the work from running at all");

  assert.throws(() => new Permissions({ policy: { TELEPATHY: "allow" } }), /Unknown capability/);
  ok("an unknown capability in a policy is rejected rather than ignored");
})();

// ----------------------------------------------------------------- vault
(function vaultTests() {
  const vault = new Vault({ env: { EVE_SECRET_HA_TOKEN: "super-secret-value-123", HOME: "/root" } });
  assert.strictEqual(vault.get("ha_token"), "super-secret-value-123");
  assert.deepStrictEqual(vault.names(), ["ha_token"]);
  assert.throws(() => vault.get("nope"), /No secret named/);
  ok("secrets load from the environment and a missing one fails loudly");

  const redacted = vault.redact({
    message: "calling with super-secret-value-123",
    headers: { Authorization: "Bearer super-secret-value-123" },
    nested: [{ api_key: "another-thing" }],
  });
  assert.ok(!JSON.stringify(redacted).includes("super-secret-value-123"), "the secret value must be gone");
  assert.strictEqual(redacted.headers.Authorization, "«redacted»");
  assert.strictEqual(redacted.nested[0].api_key, "«redacted»", "credential-shaped keys are masked even if unknown");
  ok("known secret values and credential-shaped fields are both redacted");

  assert.strictEqual(vault.wouldLeak("const t = 'super-secret-value-123'"), true);
  assert.strictEqual(vault.wouldLeak("const t = config.token"), false);
  ok("generated code can be vetted for leaked secrets before it is saved");

  // A world-readable secrets file is a finding, not a shrug.
  const loose = path.join(tmp, "loose-secrets.json");
  fs.writeFileSync(loose, JSON.stringify({ k: "v" }), { mode: 0o644 });
  fs.chmodSync(loose, 0o644);
  assert.throws(() => new Vault({ file: loose, env: {} }), /readable by other users/);
  ok("a secrets file other users can read is refused, with the chmod to fix it");
})();

// ------------------------------------------------------------------- log
(function logTests() {
  const file = path.join(tmp, "test.log");
  const vault = new Vault({ env: { EVE_SECRET_TOK: "leaky-token-abcdef" } });
  const log = new Logger({ file, vault, console: false, flushMs: 10000 });

  log.info("connecting", { token: "leaky-token-abcdef", url: "http://pi.local" });
  log.event("permission", { capability: "GPIO", outcome: "granted" });
  assert.ok(!fs.existsSync(file) || fs.readFileSync(file, "utf8") === "", "writes should be buffered, not per-line");
  log.flush();

  const written = fs.readFileSync(file, "utf8");
  assert.ok(!written.includes("leaky-token-abcdef"), "a secret must never reach the disk");
  assert.ok(written.includes("«redacted»"));
  assert.strictEqual(written.trim().split("\n").length, 2);
  for (const line of written.trim().split("\n")) JSON.parse(line); // valid JSONL
  ok("logs buffer before writing, redact secrets, and stay machine-readable");
})();

// ---------------------------------------------------------------- health
(function healthTests() {
  const thresholds = { maxTemperatureC: 75, minFreeDiskMb: 200, maxMemoryPercent: 85 };
  const healthy = assess({ temperatureC: 45, freeDiskMb: 5000, memoryUsedPercent: 40, load1: 0.5, cpuCount: 4 }, thresholds);
  assert.strictEqual(healthy.ok, true);

  const sick = assess({ temperatureC: 82, freeDiskMb: 50, memoryUsedPercent: 95, load1: 9, cpuCount: 4 }, thresholds);
  assert.strictEqual(sick.ok, false);
  assert.strictEqual(sick.problems.length, 4);
  assert.ok(sick.problems.every((p) => p.suggestion), "every problem must say what to do about it");
  assert.ok(sick.problems.find((p) => p.what === "running hot").suggestion.includes("throttles"));
  ok("health problems are detected with a suggested fix for each");

  // Missing readings must not be reported as problems.
  const partial = assess({ temperatureC: null, freeDiskMb: null, memoryUsedPercent: 30, load1: 0.2, cpuCount: 4 }, thresholds);
  assert.strictEqual(partial.ok, true);
  ok("unreadable sensors are reported as unknown, not as failures");
})();

// ---------------------------------------------------------------- config
(function configTests() {
  const defaults = config.load({ file: path.join(tmp, "nope.json"), env: {} });
  // Sized for a 4GB Pi 4 with active cooling — see eve/kernel/config.js.
  assert.strictEqual(defaults.trainingPreset, "balanced");
  assert.strictEqual(defaults.atomicWrites, true, "the power switch makes this non-optional");
  assert.strictEqual(defaults.health.minFreeDiskMb, 1000, "a 32GB card fills faster than people expect");
  assert.strictEqual(defaults.model.provider, null, "no reasoning model should be assumed");
  assert.deepStrictEqual(defaults.allowedHosts, [], "discovery must not roam by default");

  const file = path.join(tmp, "eve.config.json");
  fs.writeFileSync(file, JSON.stringify({ logLevel: "debug", health: { maxTemperatureC: 70 } }));
  const merged = config.load({ file, env: { EVE_MODEL_PROVIDER: "local-llm", EVE_ALLOWED_HOSTS: "pi.local, ha.local" } });
  assert.strictEqual(merged.logLevel, "debug");
  assert.strictEqual(merged.health.maxTemperatureC, 70);
  assert.strictEqual(merged.health.minFreeDiskMb, 1000, "unset nested values keep their defaults");
  assert.strictEqual(merged.model.provider, "local-llm", "the environment overrides the file");
  assert.deepStrictEqual(merged.allowedHosts, ["pi.local", "ha.local"]);
  ok("config layers defaults, file and environment without losing nested defaults");
})();

// ---------------------------------------------------------------- kernel
(async function kernelTests() {
  const dir = path.join(tmp, "boot");
  const eve = kernel.boot({
    configFile: path.join(tmp, "absent.json"),
    env: { EVE_SECRET_HA_TOKEN: "boot-secret-xyz" },
    overrides: { dataDir: dir, logFile: path.join(dir, "eve.log"), secretsFile: path.join(dir, "s.json"), logFlushMs: 10000 },
    confirm: async () => true,
  });

  assert.ok(fs.existsSync(dir), "the data directory should be created");
  const result = await eve.guard("HOME_AUTOMATION",
    { action: "turn on the lamp", why: "asked in a test" },
    async () => ({ http: 200 }),
    async () => ({ observed: "lamp reports on" }));
  assert.deepStrictEqual(result, { http: 200 });
  assert.strictEqual(eve.audit.summary().VERIFIED, 1);

  await assert.rejects(() => eve.guard("SELF_MODIFICATION", { action: "rewrite myself", why: "test" }, async () => "nope"));
  eve.shutdown();

  const written = fs.readFileSync(path.join(dir, "eve.log"), "utf8");
  assert.ok(!written.includes("boot-secret-xyz"), "the boot secret must not be in the log");
  assert.ok(written.includes("turn on the lamp"), "the audited action should be in the log");
  ok("boot() wires config, vault, log, audit and permissions into one guarded path");
})();

process.on("exit", () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/kernel: ${passed} tests passed`);
});

// --------------------------------------------------------------- storage
(function storageTests() {
  const storage = require("../eve/kernel/storage.js");
  const file = path.join(tmp, "atomic", "model.json");

  storage.writeJsonAtomic(file, { generation: 1 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, "utf8")), { generation: 1 });
  // No temporary files left lying around on the card.
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ["model.json"]);
  ok("atomic writes land the whole file and leave no temporary debris");

  // What a power cut mid-write actually looks like on disk.
  fs.writeFileSync(file, '{"generation": 2, "ne');
  const damaged = storage.readJsonSafe(file, null);
  assert.strictEqual(damaged.ok, false);
  assert.match(damaged.reason, /unreadable/);
  assert.strictEqual(damaged.value, null, "a truncated file must not be returned as data");
  ok("a half-written file is detected rather than parsed into nonsense");

  // Versioned writes keep a survivor.
  const versioned = path.join(tmp, "atomic", "v.json");
  storage.writeJsonVersioned(versioned, { generation: 10 });
  storage.writeJsonVersioned(versioned, { generation: 11 });
  fs.writeFileSync(versioned, "{ truncated");           // simulate the power cut
  const recovered = storage.readWithFallback(versioned);
  assert.strictEqual(recovered.ok, true);
  assert.strictEqual(recovered.value.generation, 10, "should fall back to the previous good copy");
  assert.match(recovered.reason, /recovered from/);
  ok("a corrupted model falls back to the previous generation instead of failing to start");

  const empty = path.join(tmp, "atomic", "empty.json");
  fs.writeFileSync(empty, "");
  assert.match(storage.readJsonSafe(empty).reason, /interrupted write/);
  ok("an empty file is reported as an interrupted write, not as valid emptiness");
})();

// ------------------------------------------------- Raspberry Pi specifics
(function piTests() {
  const { assess, THROTTLE_BITS } = require("../eve/kernel/health.js");
  const thresholds = { maxTemperatureC: 75, minFreeDiskMb: 1000, maxMemoryPercent: 85 };

  const undervolted = assess({
    temperatureC: 48, freeDiskMb: 20000, memoryUsedPercent: 30, load1: 0.4, cpuCount: 4,
    throttling: { raw: "0x50005", flags: [
      { bit: 0, what: "under-voltage right now", advice: "use the official 5V/3A supply", current: true },
      { bit: 16, what: "under-voltage has happened since boot", advice: "thin cable", current: false },
    ] },
  }, thresholds);

  assert.strictEqual(undervolted.ok, false, "undervoltage must be a problem even when nothing else is");
  assert.ok(undervolted.problems.every((p) => p.severity === "error"), "undervoltage is an error, not a warning");
  ok("undervoltage is caught even when temperature, disk and memory all look fine");

  // vcgencmd is absent on anything that is not a Pi — that must not be a failure.
  const notAPi = assess({ temperatureC: null, freeDiskMb: 5000, memoryUsedPercent: 20, load1: 0.1, cpuCount: 8, throttling: null }, thresholds);
  assert.strictEqual(notAPi.ok, true);
  ok("a machine without vcgencmd reports healthy rather than erroring");

  assert.ok(THROTTLE_BITS.every(([, what, advice]) => what && advice), "every throttle flag needs advice");
  ok("every Pi throttle flag carries an explanation of what to do");
})();
