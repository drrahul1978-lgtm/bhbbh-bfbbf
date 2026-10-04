/* gpio.js — her status light.
 *
 * Three LEDs on a breadboard, so she can tell you how she is without a screen:
 *
 *   RED     something is wrong with her
 *   YELLOW  she needs you
 *   GREEN   she is fine
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY SHELLING OUT RATHER THAN A LIBRARY
 *
 * Driving a Pi's pins from Node normally means a native module (onoff, rpio,
 * pigpio) — which means a compiler on the Pi, a build step that can fail on
 * ARM, and the end of this project's one-line promise that there is nothing to
 * install. Every one of those libraries is itself a wrapper around a kernel
 * interface that Raspberry Pi OS already exposes through a command.
 *
 * So this finds whichever interface the machine actually has and uses it. The
 * cost is a process per LED change, which for something that changes a few
 * times a minute is irrelevant. The gain is that it works on a fresh Pi with
 * nothing installed.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Pins are BCM numbers, which is what every Pi tool and pinout diagram uses —
 * not the physical position on the header. See PI.md for which hole is which.
 */
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

/* Defaults chosen because they have no second job. Many pins carry I2C, SPI or
 * serial, and lighting an LED on one of those fights whatever else wants it. */
const DEFAULT_PINS = { red: 17, yellow: 27, green: 22 };

const SYSFS = "/sys/class/gpio";

/** Is this command present and usable? */
function canRun(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore", timeout: 3000 });
    return true;
  } catch (err) {
    // A command that exists but refused the arguments still proves it exists.
    return !(err && (err.code === "ENOENT" || err.code === "EACCES"));
  }
}

/**
 * The four ways to set a pin, in the order worth trying.
 *
 * pinctrl first because it ships with current Raspberry Pi OS and needs no
 * setup. libgpiod next because it is the kernel's supported interface. sysfs
 * last because it is deprecated and being removed, but is still the only one
 * present on older images.
 */
const BACKENDS = [
  {
    name: "pinctrl",
    detect: () => canRun("pinctrl", ["get", "17"]),
    write: (pin, high) => execFileSync("pinctrl", ["set", String(pin), "op", high ? "dh" : "dl"],
      { stdio: "ignore", timeout: 3000 }),
    release: () => {},
  },
  {
    name: "gpioset",
    detect: () => canRun("gpioset", ["--help"]),
    write: (pin, high) => {
      /* libgpiod changed its arguments between v1 and v2 and both are in the
       * wild. Try the v2 form, fall back to v1, rather than parsing a version. */
      const value = high ? "1" : "0";
      try {
        execFileSync("gpioset", ["-t0", "-c", "gpiochip0", `${pin}=${value}`],
          { stdio: "ignore", timeout: 3000 });
      } catch {
        execFileSync("gpioset", ["gpiochip0", `${pin}=${value}`],
          { stdio: "ignore", timeout: 3000 });
      }
    },
    release: () => {},
  },
  {
    name: "sysfs",
    detect: () => {
      try { return fs.existsSync(`${SYSFS}/export`); } catch { return false; }
    },
    write: (pin, high) => {
      const dir = `${SYSFS}/gpio${pin}`;
      if (!fs.existsSync(dir)) {
        fs.writeFileSync(`${SYSFS}/export`, String(pin));
        /* The kernel creates the directory asynchronously, so writing to it
         * immediately can land before it exists. */
        for (let i = 0; i < 50 && !fs.existsSync(dir); i++) {
          try { execFileSync("sleep", ["0.01"], { stdio: "ignore" }); } catch { /* ignore */ }
        }
      }
      fs.writeFileSync(`${dir}/direction`, "out");
      fs.writeFileSync(`${dir}/value`, high ? "1" : "0");
    },
    release: (pin) => {
      try { fs.writeFileSync(`${SYSFS}/unexport`, String(pin)); } catch { /* already gone */ }
    },
  },
];

/**
 * Her status light.
 *
 * On a machine with no pins at all — a laptop, this container, a test — it runs
 * in `simulated` mode: every change is recorded and readable, nothing is
 * written anywhere. That is deliberate rather than a stub, because the logic
 * deciding the colour is the part worth testing, and it should be testable
 * without a Raspberry Pi on the desk.
 */
class StatusLight {
  constructor({ pins = DEFAULT_PINS, backend = null, log = null } = {}) {
    this.pins = { ...pins };
    this.log = log;
    this.history = [];
    this.colour = null;
    this.failures = 0;

    this.backend = backend === "simulated"
      ? null
      : (backend
        ? BACKENDS.find((b) => b.name === backend) || null
        : BACKENDS.find((b) => { try { return b.detect(); } catch { return false; } }) || null);

    this.mode = this.backend ? this.backend.name : "simulated";
  }

  /** Whether a real pin is being driven, or this is only being recorded. */
  get wired() { return !!this.backend; }

  /**
   * Show one colour, and only that colour.
   *
   * Every LED is set on every change rather than only the ones that differ. A
   * light left on by a crash or a missed update is worse than a redundant
   * write: two lit at once means nothing, and someone across the room reads it
   * as whichever they notice first.
   */
  show(colour) {
    if (!Object.prototype.hasOwnProperty.call(this.pins, colour)) {
      throw new Error(`EVE has no ${colour} light — she has ${Object.keys(this.pins).join(", ")}`);
    }

    this.colour = colour;
    this.history.push({ colour, at: new Date().toISOString() });
    if (this.history.length > 200) this.history = this.history.slice(-200);

    if (!this.backend) return { colour, mode: "simulated" };

    const failed = [];
    for (const [name, pin] of Object.entries(this.pins)) {
      try {
        this.backend.write(pin, name === colour);
      } catch (err) {
        failed.push(`${name} (pin ${pin}): ${err.message}`);
      }
    }

    /* A light that cannot be driven is reported, never thrown. She is in the
     * middle of doing something useful when this runs, and losing her because
     * an LED is miswired would be the wrong trade. */
    if (failed.length) {
      this.failures++;
      this.log?.warn?.("could not drive the status light", { failed });
      return { colour, mode: this.mode, failed };
    }
    return { colour, mode: this.mode };
  }

  red() { return this.show("red"); }
  yellow() { return this.show("yellow"); }
  green() { return this.show("green"); }

  /** All three off — for shutting down, so a stale colour is not left lit. */
  off() {
    this.colour = null;
    if (!this.backend) return { colour: null, mode: "simulated" };
    for (const pin of Object.values(this.pins)) {
      try { this.backend.write(pin, false); } catch { /* nothing to be done */ }
    }
    return { colour: null, mode: this.mode };
  }

  /** Hand the pins back to the system. */
  release() {
    this.off();
    if (!this.backend) return;
    for (const pin of Object.values(this.pins)) {
      try { this.backend.release(pin); } catch { /* ignore */ }
    }
  }

  describe() {
    if (!this.backend) {
      return "No GPIO on this machine — the status light is being tracked but not lit.";
    }
    const wiring = Object.entries(this.pins).map(([n, p]) => `${n}=GPIO${p}`).join(", ");
    return `Status light on ${this.mode}: ${wiring}.`;
  }
}

module.exports = { StatusLight, DEFAULT_PINS, BACKENDS, canRun };
