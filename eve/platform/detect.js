/* detect.js — EVE working out what she has woken up on.
 *
 * The same code runs on a Raspberry Pi, a laptop, a server or inside a
 * container, and those are not the same machine. A Pi has GPIO pins, a camera
 * connector, a thermal sensor and a quarter of the memory; a laptop has none of
 * the first three and plenty of the last. Guessing wrong in either direction is
 * bad: assuming a Pi makes her needlessly slow on a desktop, and assuming a
 * desktop makes her fall over on a Pi.
 *
 * So she looks, rather than being told. Everything here is a read — device tree
 * files, /proc, os module. Nothing is installed, nothing is modified, and
 * nothing is contacted. Detection that fails returns "unknown" rather than
 * throwing, because a machine she does not recognise should still run her.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const readFile = (file) => {
  try { return fs.readFileSync(file, "utf8").replace(/\0/g, "").trim(); } catch { return null; }
};
const exists = (file) => { try { return fs.existsSync(file); } catch { return false; } };
const canRun = (cmd, args = ["--version"]) => {
  try { execFileSync(cmd, args, { stdio: "ignore", timeout: 2000 }); return true; } catch { return false; }
};

/** Raspberry Pi models, by the revision code the board reports. */
const PI_HINTS = [
  [/Raspberry Pi 5/i, { family: "raspberry_pi", generation: 5 }],
  [/Raspberry Pi 4/i, { family: "raspberry_pi", generation: 4 }],
  [/Raspberry Pi 3/i, { family: "raspberry_pi", generation: 3 }],
  [/Raspberry Pi Zero/i, { family: "raspberry_pi", generation: 0 }],
  [/Raspberry Pi/i, { family: "raspberry_pi", generation: null }],
];

/** What board is this, if it is a board at all? */
function board() {
  const model = readFile("/proc/device-tree/model") || readFile("/sys/firmware/devicetree/base/model");
  if (model) {
    for (const [pattern, info] of PI_HINTS) {
      if (pattern.test(model)) return { ...info, model, source: "device tree" };
    }
    return { family: "single_board", generation: null, model, source: "device tree" };
  }
  // Some images expose it only through cpuinfo.
  const cpuinfo = readFile("/proc/cpuinfo") || "";
  const modelLine = cpuinfo.match(/^Model\s*:\s*(.+)$/m)?.[1];
  if (modelLine && /raspberry/i.test(modelLine)) {
    return { family: "raspberry_pi", generation: Number(modelLine.match(/Pi (\d)/)?.[1]) || null, model: modelLine, source: "cpuinfo" };
  }
  return { family: null, generation: null, model: null, source: null };
}

/** Is this a container? It changes what "the disk" and "the CPU" even mean. */
function containerised() {
  if (exists("/.dockerenv")) return "docker";
  const cgroup = readFile("/proc/1/cgroup") || "";
  if (/docker|containerd|kubepods/i.test(cgroup)) return "container";
  if (/lxc/i.test(cgroup)) return "lxc";
  if (readFile("/proc/1/sched")?.startsWith("systemd")) return null;
  return null;
}

/**
 * Which physical interfaces actually exist here.
 *
 * Presence is checked, not assumed from the platform: a Pi with the camera
 * disabled in config.txt has no camera, and saying otherwise leads to a
 * confident failure later.
 */
function interfaces() {
  const gpioChips = (() => {
    try { return fs.readdirSync("/dev").filter((f) => /^gpiochip\d+$/.test(f)); } catch { return []; }
  })();
  const i2c = (() => {
    try { return fs.readdirSync("/dev").filter((f) => /^i2c-\d+$/.test(f)); } catch { return []; }
  })();
  const spi = (() => {
    try { return fs.readdirSync("/dev").filter((f) => /^spidev/.test(f)); } catch { return []; }
  })();
  const video = (() => {
    try { return fs.readdirSync("/dev").filter((f) => /^video\d+$/.test(f)); } catch { return []; }
  })();
  const sound = exists("/dev/snd");

  return {
    gpio: gpioChips.length > 0,
    gpioChips,
    i2c: i2c.length > 0,
    spi: spi.length > 0,
    camera: video.length > 0,
    videoDevices: video,
    audio: sound,
    bluetooth: exists("/sys/class/bluetooth"),
    thermal: exists("/sys/class/thermal/thermal_zone0/temp"),
    // The Pi's own health and throttling reporter.
    vcgencmd: canRun("vcgencmd", ["version"]),
  };
}

/** How much machine there is to work with. */
function resources() {
  const totalMb = Math.round(os.totalmem() / (1024 * 1024));
  let diskFreeMb = null;
  try {
    if (fs.statfsSync) {
      const s = fs.statfsSync(process.cwd());
      diskFreeMb = Math.round((s.bavail * s.bsize) / (1024 * 1024));
    }
  } catch { /* not readable everywhere */ }

  return {
    cores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model?.trim() || "unknown",
    memoryMb: totalMb,
    memoryFreeMb: Math.round(os.freemem() / (1024 * 1024)),
    diskFreeMb,
    arch: os.arch(),
    // 64-bit ARM on a Pi behaves quite differently from 32-bit, and both exist.
    arm: /^arm/.test(os.arch()),
  };
}

/**
 * Everything, in one call.
 *
 * `class` is the practical answer to "how hard can I work here" — it is what
 * the tuning below keys off, and it is deliberately coarse.
 */
function detect() {
  const b = board();
  const res = resources();
  const container = containerised();
  const platform = os.platform();

  let host;
  if (b.family === "raspberry_pi") host = `raspberry_pi_${b.generation ?? "unknown"}`;
  else if (b.family === "single_board") host = "single_board_computer";
  else if (platform === "darwin") host = "mac";
  else if (platform === "win32") host = "windows";
  else if (platform === "linux") host = "linux";
  else host = platform || "unknown";

  // Coarse on purpose: constrained machines get careful defaults, roomy ones
  // get to work harder, and anything unrecognised is treated as constrained
  // because being needlessly slow is a much cheaper mistake than falling over.
  const klass =
    b.family === "raspberry_pi" || res.memoryMb < 2048 ? "constrained" :
    res.memoryMb < 8192 || res.cores <= 4 ? "modest" :
    "roomy";

  return {
    host,
    class: klass,
    isPi: b.family === "raspberry_pi",
    board: b,
    platform,
    release: os.release(),
    container,
    resources: res,
    interfaces: interfaces(),
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Settings that suit this machine.
 *
 * Not a rewrite of the config — a set of suggestions the kernel merges under
 * anything you set explicitly, so detection never overrides a deliberate choice.
 */
function tuning(info = detect()) {
  const base = {
    constrained: {
      trainingPreset: "pi",
      maxImageSize: 640,
      maxConcurrentRequests: 2,
      logFlushMs: 5000,        // fewer touches on an SD card
      memoryCapacity: 3000,
      atomicWrites: true,
      health: { checkIntervalMs: 60000, minFreeDiskMb: 1000 },
    },
    modest: {
      trainingPreset: "balanced",
      maxImageSize: 900,
      maxConcurrentRequests: 4,
      logFlushMs: 2000,
      memoryCapacity: 10000,
      atomicWrites: true,
      health: { checkIntervalMs: 60000, minFreeDiskMb: 2000 },
    },
    roomy: {
      trainingPreset: "desktop",
      maxImageSize: 1200,
      maxConcurrentRequests: 8,
      logFlushMs: 1000,
      memoryCapacity: 50000,
      atomicWrites: true,       // cheap, and still right on a laptop that sleeps
      health: { checkIntervalMs: 120000, minFreeDiskMb: 5000 },
    },
  }[info.class];

  // A Pi 4 with 4GB is more capable than the "constrained" default assumes.
  if (info.isPi && info.resources.memoryMb >= 3500) {
    base.trainingPreset = "balanced";
    base.maxImageSize = 700;
  }
  return base;
}

/** What she can physically do here, as opposed to what she knows how to do. */
function hostCapabilities(info = detect()) {
  const i = info.interfaces;
  return {
    GPIO: i.gpio ? "available" : "absent on this machine",
    CAMERA: i.camera ? "available" : "no video device present",
    MICROPHONE: i.audio ? "available" : "no sound device present",
    BLUETOOTH: i.bluetooth ? "available" : "absent on this machine",
    I2C: i.i2c ? "available" : "not enabled",
    SPI: i.spi ? "available" : "not enabled",
    // Read from the passed-in machine, never from the live filesystem — this
    // has to give the same answer for a described host as for the real one.
    THERMAL_READINGS: i.vcgencmd || i.thermal ? "available" : "not readable here",
  };
}

/** One line, for a greeting or a log. */
function describe(info = detect()) {
  const r = info.resources;
  const where = info.isPi
    ? `a ${info.board.model || "Raspberry Pi"}`
    : info.host === "mac" ? "a Mac"
    : info.host === "windows" ? "a Windows machine"
    : info.host === "linux" ? "a Linux machine"
    : `a ${info.host}`;
  const present = Object.entries(hostCapabilities(info)).filter(([, v]) => v === "available").map(([k]) => k.toLowerCase());
  return `Running on ${where}${info.container ? ` inside ${info.container}` : ""} — ` +
    `${r.cores} core${r.cores === 1 ? "" : "s"}, ${(r.memoryMb / 1024).toFixed(1)}GB memory, ${r.arch}. ` +
    (present.length ? `Hardware I can reach: ${present.join(", ")}.` : "No special hardware here.");
}

module.exports = { detect, tuning, hostCapabilities, describe, board, interfaces, resources, containerised };
