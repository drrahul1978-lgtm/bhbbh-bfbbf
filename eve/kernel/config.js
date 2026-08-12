/* config.js — one place to change how EVE behaves, with Pi-shaped defaults.
 *
 * Layered, lowest to highest: built-in defaults, then a config file, then
 * EVE_* environment variables. Secrets are deliberately NOT part of this —
 * they live in the vault.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  // Where state lives. Kept together so a backup is one directory.
  dataDir: "eve-data",
  logFile: "eve-data/eve.log",
  secretsFile: "eve-data/secrets.json",

  logLevel: "info",
  logFlushMs: 2000,          // batch writes — SD cards do not enjoy per-line IO

  // Least privilege by default; loosen deliberately, in your own config file.
  permissions: {},

  // Raspberry Pi 4 Model B, 4GB, actively cooled, on a 32GB card.
  maxImageSize: 700,         // photos are downscaled before any vision work
  trainingPreset: "balanced", // 4GB and a fan can afford more than the minimum
  maxConcurrentRequests: 2,
  requestTimeoutMs: 6000,
  atomicWrites: true,        // survive the power switch being flipped mid-write

  // Health thresholds — what counts as "EVE is unwell".
  health: {
    // A Pi 4 begins throttling at 80-85°C. With a fan it should sit far below
    // this, so crossing it means the fan has stopped, not that the load is high.
    maxTemperatureC: 75,
    minFreeDiskMb: 1000,     // a 32GB card fills faster than people expect
    maxMemoryPercent: 85,    // of 4GB
    checkIntervalMs: 60000,
  },

  // The seam for the reasoning EVE's own small networks cannot do. Left empty
  // on purpose: with nothing configured she uses deterministic code generation
  // and says so, rather than pretending to reason.
  model: { provider: null, endpoint: null, name: null },

  allowWebSearch: true,
  // Discovery will only ever talk to hosts matching these. Empty means "the
  // host you named, and nothing else" — a fetched API description must not be
  // able to redirect EVE at a server of its choosing.
  allowedHosts: [],
};

const deepMerge = (base, extra) => {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    out[key] = value && typeof value === "object" && !Array.isArray(value) && typeof base[key] === "object"
      ? deepMerge(base[key], value)
      : value;
  }
  return out;
};

/** EVE_LOG_LEVEL → logLevel, EVE_DATA_DIR → dataDir, and so on. */
function fromEnv(env) {
  const out = {};
  const map = {
    EVE_DATA_DIR: "dataDir", EVE_LOG_FILE: "logFile", EVE_LOG_LEVEL: "logLevel",
    EVE_SECRETS_FILE: "secretsFile", EVE_TRAINING_PRESET: "trainingPreset",
    EVE_MODEL_PROVIDER: ["model", "provider"], EVE_MODEL_ENDPOINT: ["model", "endpoint"],
    EVE_MODEL_NAME: ["model", "name"],
  };
  for (const [key, target] of Object.entries(map)) {
    if (!env[key]) continue;
    if (Array.isArray(target)) {
      out[target[0]] = out[target[0]] || {};
      out[target[0]][target[1]] = env[key];
    } else out[target] = env[key];
  }
  if (env.EVE_ALLOW_WEB_SEARCH) out.allowWebSearch = env.EVE_ALLOW_WEB_SEARCH !== "0";
  if (env.EVE_ALLOWED_HOSTS) out.allowedHosts = env.EVE_ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean);
  return out;
}

function load({ file = null, env = process.env, overrides = {} } = {}) {
  let config = { ...DEFAULTS };
  const configFile = file || env.EVE_CONFIG || "eve.config.json";
  if (fs.existsSync(configFile)) {
    try {
      config = deepMerge(config, JSON.parse(fs.readFileSync(configFile, "utf8")));
      config.loadedFrom = configFile;
    } catch (err) {
      throw new Error(`${configFile} is not valid JSON: ${err.message}`);
    }
  }
  config = deepMerge(config, fromEnv(env));
  config = deepMerge(config, overrides);

  // Paths inside dataDir follow it if it moved and they were left at default.
  if (config.dataDir !== DEFAULTS.dataDir) {
    if (config.logFile === DEFAULTS.logFile) config.logFile = path.join(config.dataDir, "eve.log");
    if (config.secretsFile === DEFAULTS.secretsFile) config.secretsFile = path.join(config.dataDir, "secrets.json");
  }
  return config;
}

module.exports = { load, DEFAULTS, deepMerge, fromEnv };
