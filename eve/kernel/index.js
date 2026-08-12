/* eve/kernel — the spine every other part of EVE hangs from.
 *
 * boot() assembles config, vault, logging, audit and permissions into one
 * object and hands it back. Nothing else in EVE should construct these
 * individually, so there is exactly one place where policy is decided.
 *
 * Deliberately additive: the existing card grader, trainer, skill generator and
 * discovery all still run without a kernel. Booting one turns the safety rails
 * on for every path that asks for them.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const config = require("./config.js");
const { Vault } = require("./vault.js");
const { Logger } = require("./log.js");
const { Ledger } = require("./audit.js");
const { Permissions, PermissionDenied, CAPABILITIES } = require("./permissions.js");
const { HealthMonitor } = require("./health.js");

function boot({ configFile = null, env = process.env, overrides = {}, confirm = null } = {}) {
  const cfg = config.load({ file: configFile, env, overrides });
  fs.mkdirSync(cfg.dataDir, { recursive: true });

  const vault = new Vault({ file: cfg.secretsFile, env });
  const log = new Logger({
    file: cfg.logFile,
    level: cfg.logLevel,
    flushMs: cfg.logFlushMs,
    vault,                     // everything is redacted on the way to disk
  });
  const audit = new Ledger({ log });
  const permissions = new Permissions({ policy: cfg.permissions, confirm, log, audit });
  const health = new HealthMonitor({ config: cfg, log });

  log.info("kernel started", {
    dataDir: cfg.dataDir,
    secrets: vault.names(),     // names only, never values
    policy: permissions.describe().filter((p) => p.setting !== "deny").map((p) => `${p.capability}:${p.setting}`),
    model: cfg.model.provider || "none configured — deterministic generation only",
  });

  return {
    config: cfg, vault, log, audit, permissions, health,
    /** Run guarded work: permission first, then recorded in the ledger. */
    guard: (capability, spec, work, verify) => permissions.guard(capability, spec, work, verify),
    shutdown() {
      health.stop();
      log.info("kernel stopped", audit.summary());
      log.close();
    },
  };
}

module.exports = { boot, config, Vault, Logger, Ledger, Permissions, PermissionDenied, HealthMonitor, CAPABILITIES };
