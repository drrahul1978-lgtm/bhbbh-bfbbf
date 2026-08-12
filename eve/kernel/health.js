/* health.js — EVE watching her own vital signs on a Raspberry Pi.
 *
 * Reads what the Pi actually exposes: load, memory, disk, and the SoC
 * temperature from /sys/class/thermal. Everything degrades gracefully — on a
 * machine that is not a Pi the temperature is simply reported as unknown rather
 * than throwing, because a health monitor that crashes is worse than none.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const THERMAL = "/sys/class/thermal/thermal_zone0/temp";

/** SoC temperature in °C, or null where that is not readable. */
function temperature() {
  try {
    if (!fs.existsSync(THERMAL)) return null;
    const raw = parseInt(fs.readFileSync(THERMAL, "utf8").trim(), 10);
    if (!Number.isFinite(raw)) return null;
    return raw > 1000 ? raw / 1000 : raw; // millidegrees on a Pi
  } catch { return null; }
}

/**
 * The Pi's own throttling report, via `vcgencmd get_throttled`.
 *
 * This is the single most useful diagnostic on a Raspberry Pi and it exists
 * nowhere else: it tells you the power supply is sagging *before* the symptoms
 * (random freezes, corrupted writes, USB dropouts) start looking like software
 * bugs. The result is a bitmask — the low bits are happening now, the high bits
 * mean it has happened since boot.
 */
const THROTTLE_BITS = [
  [0, "under-voltage right now", "the power supply is sagging — use the official 5V/3A supply and a short, thick cable"],
  [1, "CPU frequency capped now", "usually heat or power — check the fan is spinning"],
  [2, "throttled right now", "the Pi is slowing itself down to survive"],
  [3, "at the soft temperature limit", "it is hot enough to start backing off"],
  [16, "under-voltage has happened since boot", "an inadequate supply or a thin cable; this corrupts SD cards over time"],
  [17, "CPU frequency has been capped since boot", "check cooling and power"],
  [18, "has been throttled since boot", "sustained load with insufficient cooling or power"],
  [19, "has hit the soft temperature limit since boot", "consider better airflow"],
];

function throttling() {
  try {
    const out = execFileSync("vcgencmd", ["get_throttled"], { encoding: "utf8", timeout: 3000 });
    const match = out.match(/0x([0-9a-fA-F]+)/);
    if (!match) return null;
    const bits = parseInt(match[1], 16);
    return {
      raw: `0x${match[1]}`,
      flags: THROTTLE_BITS.filter(([bit]) => bits & (1 << bit))
        .map(([bit, what, advice]) => ({ bit, what, advice, current: bit < 16 })),
    };
  } catch {
    return null; // not a Pi, or vcgencmd is not installed
  }
}

/** Free space in MB on the filesystem holding `dir`. */
function freeDiskMb(dir) {
  try {
    if (fs.statfsSync) {
      const s = fs.statfsSync(dir);
      return Math.round((s.bavail * s.bsize) / (1024 * 1024));
    }
    const out = execFileSync("df", ["-Pm", dir], { encoding: "utf8", timeout: 3000 });
    return parseInt(out.trim().split("\n").pop().split(/\s+/)[3], 10);
  } catch { return null; }
}

function snapshot(dir = ".") {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    at: new Date().toISOString(),
    uptimeSec: Math.round(os.uptime()),
    load1: os.loadavg()[0],
    cpuCount: os.cpus().length,
    memoryUsedPercent: Math.round(((total - free) / total) * 100),
    memoryFreeMb: Math.round(free / (1024 * 1024)),
    processMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    temperatureC: temperature(),
    freeDiskMb: freeDiskMb(dir),
    throttling: throttling(),
  };
}

/**
 * Compare a snapshot against the thresholds in config and say plainly what is
 * wrong. Returns { ok, problems[] } — problems carry a suggested action,
 * because "disk nearly full" is only useful with "here is what to delete".
 */
function assess(snap, thresholds) {
  const problems = [];
  if (snap.temperatureC != null && snap.temperatureC > thresholds.maxTemperatureC) {
    problems.push({
      what: "running hot", value: `${snap.temperatureC.toFixed(1)}°C`,
      limit: `${thresholds.maxTemperatureC}°C`, severity: "warn",
      suggestion: "a Pi 4 throttles near 80°C — check airflow, or pause training",
    });
  }
  if (snap.freeDiskMb != null && snap.freeDiskMb < thresholds.minFreeDiskMb) {
    problems.push({
      what: "low disk", value: `${snap.freeDiskMb}MB free`,
      limit: `${thresholds.minFreeDiskMb}MB`, severity: "error",
      suggestion: "prune eve-data/eve.log.1 and old generated adapters",
    });
  }
  if (snap.memoryUsedPercent > thresholds.maxMemoryPercent) {
    problems.push({
      what: "memory pressure", value: `${snap.memoryUsedPercent}%`,
      limit: `${thresholds.maxMemoryPercent}%`, severity: "warn",
      suggestion: "use a smaller training preset, or reduce cards per round",
    });
  }
  // Undervoltage deserves its own treatment: it is the most common cause of a
  // Pi behaving strangely, and it damages the SD card rather than just slowing
  // things down. Reported even when it only happened earlier in this boot.
  for (const flag of snap.throttling?.flags || []) {
    problems.push({
      what: flag.what,
      value: snap.throttling.raw,
      limit: "no throttling",
      severity: flag.bit === 0 || flag.bit === 16 ? "error" : "warn",
      suggestion: flag.advice,
    });
  }

  // Sustained load above core count means everything is queueing.
  if (snap.load1 > snap.cpuCount * 1.5) {
    problems.push({
      what: "overloaded", value: snap.load1.toFixed(2),
      limit: `${snap.cpuCount} cores`, severity: "warn",
      suggestion: "something is saturating the CPU — check background training",
    });
  }
  return { ok: problems.length === 0, problems, snapshot: snap };
}

class HealthMonitor {
  constructor({ config, log = null, onProblem = null } = {}) {
    this.thresholds = config?.health || {};
    this.dir = config?.dataDir || ".";
    this.log = log;
    this.onProblem = onProblem;
    this.timer = null;
    this.last = null;
  }

  check() {
    const report = assess(snapshot(this.dir), this.thresholds);
    this.last = report;
    if (this.log) this.log.event("health", report);
    if (!report.ok && this.onProblem) this.onProblem(report);
    return report;
  }

  /** Periodic checks that never keep the process alive on their own. */
  start(intervalMs = this.thresholds.checkIntervalMs || 60000) {
    this.stop();
    this.timer = setInterval(() => this.check(), intervalMs);
    if (this.timer.unref) this.timer.unref();
    return this.check();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

module.exports = { HealthMonitor, snapshot, assess, temperature, freeDiskMb, throttling, THROTTLE_BITS };
