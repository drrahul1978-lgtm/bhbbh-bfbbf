/* permissions.js — least privilege for an assistant that can write and run code.
 *
 * EVE can generate code, execute it, and use it to move things in the physical
 * world. That combination is only safe if every step of it has to ask.
 *
 * Three answers to any request: allow, ask, deny. The default policy denies the
 * capabilities that could end the machine, asks about the ones that touch your
 * house or your disk, and allows only what is genuinely inert. When nobody is
 * present to answer an "ask", the answer is no — a background task at 3am must
 * never be able to promote itself by virtue of nobody watching.
 */
"use strict";

const CAPABILITIES = [
  "FILE_READ", "FILE_WRITE", "COMMAND_EXECUTION", "CODE_EXECUTION",
  "NETWORK_ACCESS", "PACKAGE_INSTALLATION", "HOME_AUTOMATION",
  "CAMERA", "MICROPHONE", "GPIO", "SELF_MODIFICATION", "SYSTEM_ADMIN",
];

/** Capabilities that always need a human, whatever the policy says. */
const HIGH_RISK = new Set([
  "PACKAGE_INSTALLATION", "SELF_MODIFICATION", "SYSTEM_ADMIN", "COMMAND_EXECUTION",
]);

const DEFAULT_POLICY = {
  FILE_READ: "allow",
  NETWORK_ACCESS: "allow",
  FILE_WRITE: "ask",
  CODE_EXECUTION: "ask",
  HOME_AUTOMATION: "ask",
  CAMERA: "ask",
  MICROPHONE: "ask",
  GPIO: "ask",
  COMMAND_EXECUTION: "deny",
  PACKAGE_INSTALLATION: "deny",
  SELF_MODIFICATION: "deny",
  SYSTEM_ADMIN: "deny",
};

class PermissionDenied extends Error {
  constructor(capability, reason) {
    super(`Permission denied: ${capability}${reason ? ` — ${reason}` : ""}`);
    this.name = "PermissionDenied";
    this.capability = capability;
  }
}

class Permissions {
  /**
   * `confirm` is how a human is asked: async (capability, details) => boolean.
   * With no confirm function, every "ask" is refused — fail closed.
   */
  constructor({ policy = {}, confirm = null, log = null, audit = null } = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    for (const name of Object.keys(this.policy)) {
      if (!CAPABILITIES.includes(name)) throw new Error(`Unknown capability in policy: ${name}`);
    }
    this.confirm = confirm;
    this.log = log;
    this.audit = audit;
    this.grants = new Map();   // capability → until when it stays granted
  }

  /** Remember a "yes" for a while, so a user is not asked forty times. */
  _remember(capability, seconds) {
    if (seconds > 0) this.grants.set(capability, Date.now() + seconds * 1000);
  }

  _remembered(capability) {
    const until = this.grants.get(capability);
    if (!until) return false;
    if (Date.now() > until) { this.grants.delete(capability); return false; }
    return true;
  }

  /**
   * Ask for a capability. Resolves to true, or throws PermissionDenied —
   * refusal is an exception rather than a false, so a caller cannot ignore it
   * by forgetting to check a return value.
   */
  async request(capability, details = {}) {
    if (!CAPABILITIES.includes(capability)) throw new Error(`Unknown capability: ${capability}`);
    const setting = this.policy[capability] || "deny";
    const context = { capability, setting, ...details };

    if (setting === "deny") {
      this._record(capability, "denied by policy", context);
      throw new PermissionDenied(capability, "policy denies this; change it deliberately in your config");
    }

    // A remembered yes never covers the capabilities that can end the machine.
    if (setting === "allow" && !HIGH_RISK.has(capability)) {
      this._record(capability, "allowed by policy", context);
      return true;
    }
    if (this._remembered(capability) && !HIGH_RISK.has(capability)) {
      this._record(capability, "previously granted", context);
      return true;
    }

    if (!this.confirm) {
      this._record(capability, "no one available to ask", context);
      throw new PermissionDenied(capability, "this needs a human and nobody is present");
    }

    const answer = await this.confirm(capability, {
      ...details,
      highRisk: HIGH_RISK.has(capability),
    });
    if (!answer) {
      this._record(capability, "refused by user", context);
      throw new PermissionDenied(capability, "you said no");
    }
    if (answer === "always" && !HIGH_RISK.has(capability)) this._remember(capability, 3600);
    this._record(capability, "granted by user", context);
    return true;
  }

  _record(capability, outcome, context) {
    if (this.log) this.log.event("permission", { capability, outcome, ...context });
  }

  /** Guard a piece of work behind a capability, recorded in the audit ledger. */
  async guard(capability, spec, work, verify) {
    await this.request(capability, { action: spec.action, ...spec.details });
    if (!this.audit) return work();
    return this.audit.run({ ...spec, details: { capability, ...(spec.details || {}) } }, work, verify);
  }

  describe() {
    return CAPABILITIES.map((c) => ({
      capability: c,
      setting: this.policy[c] || "deny",
      highRisk: HIGH_RISK.has(c),
    }));
  }
}

module.exports = { Permissions, PermissionDenied, CAPABILITIES, HIGH_RISK, DEFAULT_POLICY };
