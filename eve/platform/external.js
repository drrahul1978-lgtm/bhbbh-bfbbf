/* external.js — data you plugged in, found without being told where.
 *
 * A Pi with no internet is not a broken Pi. Everything EVE needs can arrive on
 * a USB drive or a second SD card: her weights, the skills she has written, her
 * memory, the API descriptions she worked out somewhere else. This looks for
 * that data wherever the operating system happened to mount it, so opening the
 * app on a machine with no connection still finds everything.
 *
 * It reads. It does not write, does not mount, does not unmount, and does not
 * touch anything outside a directory that identifies itself as EVE's.
 *
 * A drive is only used if it says it is EVE's data — either a directory called
 * eve-data, or a file called eve.json marking the folder. A stranger's USB
 * stick is left alone.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

/** Where removable media turns up, by platform. */
function mountRoots() {
  const platform = os.platform();
  if (platform === "win32") {
    // Drive letters, which is where a Windows app would look.
    return "DEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `${letter}:\\`);
  }
  if (platform === "darwin") return ["/Volumes"];
  // Linux, including Raspberry Pi OS: the usual automount locations.
  return ["/media", `/media/${os.userInfo().username}`, "/mnt", "/run/media", `/run/media/${os.userInfo().username}`];
}

const MARKERS = ["eve-data", "eve.json", "eve-model.json"];

const readable = (p) => { try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** Does this directory hold EVE's data? */
function inspect(dir) {
  if (!isDir(dir) || !readable(dir)) return null;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }

  const marker = MARKERS.find((m) => entries.includes(m));
  if (!marker) return null;

  const root = marker === "eve-data" ? path.join(dir, "eve-data") : dir;
  const has = (name) => { try { return fs.existsSync(path.join(root, name)); } catch { return false; } };

  const found = {
    path: root,
    volume: dir,
    markedBy: marker,
    weights: has("eve-model.json") || fs.existsSync(path.join(dir, "eve-model.json")),
    language: has("eve-intent.json") || fs.existsSync(path.join(dir, "eve-intent.json")),
    memory: has("memory") || has("memories.json"),
    skills: has("skills") || isDir(path.join(dir, "eve-skills")),
    apiDescriptions: has(path.join("skills", "specs")) || isDir(path.join(dir, "eve-skills", "specs")),
    cases: has("cases.json"),
    writable: (() => { try { fs.accessSync(root, fs.constants.W_OK); return true; } catch { return false; } })(),
  };
  found.holds = Object.entries(found).filter(([k, v]) => v === true && !["writable"].includes(k)).map(([k]) => k);
  return found.holds.length ? found : null;
}

/**
 * Every plugged-in volume carrying EVE's data.
 *
 * Deliberately shallow: mount points and one level inside them. A full search
 * of an unknown drive on a Pi could take minutes and is not worth it.
 */
function scan({ extraPaths = [] } = {}) {
  const found = [];
  const seen = new Set();

  const consider = (dir) => {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    const hit = inspect(resolved);
    if (hit) found.push(hit);
  };

  for (const root of [...mountRoots(), ...extraPaths]) {
    if (!isDir(root)) continue;
    consider(root);                       // the mount point itself
    let children = [];
    try { children = fs.readdirSync(root); } catch { continue; }
    for (const child of children.slice(0, 40)) consider(path.join(root, child));
  }
  return found;
}

/**
 * What EVE should actually load, given what is plugged in and what is local.
 *
 * Local data wins by default: a drive is a source, not an authority, and
 * silently preferring whatever someone plugged in would be a poor idea. Where
 * she has nothing locally, the drive fills the gap — which is the case that
 * matters on a Pi that has never been online.
 */
function resolveSources({ localDir = "eve-data", volumes = scan() } = {}) {
  // Only ever asks about the directory it was given. An earlier version also
  // checked a bare relative path, which made the answer depend on where the
  // process happened to be started from.
  const localHas = (name) => fs.existsSync(path.join(localDir, name));
  const sources = {};
  const notes = [];

  const pick = (what, localName, volumeKey) => {
    if (localHas(localName)) {
      sources[what] = { from: "local", path: localName };
      return;
    }
    const volume = volumes.find((v) => v[volumeKey]);
    if (volume) {
      const candidate = fs.existsSync(path.join(volume.path, localName))
        ? path.join(volume.path, localName)
        : path.join(volume.volume, localName);
      sources[what] = { from: "external", path: candidate, volume: volume.volume };
      notes.push(`${what} came from ${volume.volume} — nothing local, so the drive filled the gap`);
    } else {
      sources[what] = null;
    }
  };

  pick("weights", "eve-model.json", "weights");
  pick("language", "eve-intent.json", "language");
  pick("memory", "memories.json", "memory");
  pick("skills", "skills", "skills");

  return { sources, volumes, notes, offlineCapable: !!sources.weights };
}

/** One line for a greeting or a log. */
function describe(volumes = scan()) {
  if (!volumes.length) return "No plugged-in drive is carrying my data.";
  return volumes
    .map((v) => `${v.volume} has ${v.holds.join(", ")}${v.writable ? "" : " (read-only)"}`)
    .join("; ");
}

module.exports = { scan, inspect, resolveSources, describe, mountRoots, MARKERS };
