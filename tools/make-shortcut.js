/* Put EVE on the desktop.
 *
 *   node tools/make-shortcut.js
 *
 * Makes a real shortcut with her icon, pointing at the launcher in this folder,
 * so she starts from a double-click like any other application. Nothing is
 * installed and nothing is copied — the shortcut points here, so moving this
 * folder later breaks it, and running this again fixes it.
 *
 * Windows gets a .lnk on the desktop and one in the Start Menu.
 * Linux and the Pi get a .desktop entry, on the desktop and in the app menu.
 * macOS gets a double-clickable .command on the desktop.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ICO = path.join(ROOT, "src-tauri", "icons", "icon.ico");
const PNG = path.join(ROOT, "src-tauri", "icons", "icon.png");
const DESCRIPTION = "EVE — runs entirely on this machine. No account, no key, nothing uploaded.";

const made = [];

/**
 * Where the desktop actually is.
 *
 * Not always ~/Desktop: Windows redirects it into OneDrive, and a Linux desktop
 * can be renamed or translated. Guessing wrong writes the shortcut somewhere
 * the user will never look, so ask the system before falling back.
 */
function desktopDir() {
  if (process.platform === "linux") {
    try {
      const dir = execFileSync("xdg-user-dir", ["DESKTOP"], { encoding: "utf8" }).trim();
      if (dir && fs.existsSync(dir)) return dir;
    } catch { /* xdg-user-dirs not installed — fall through */ }
  }
  const guess = path.join(os.homedir(), "Desktop");
  return fs.existsSync(guess) ? guess : null;
}

// ---------- Windows ----------
function windows() {
  const target = path.join(ROOT, "EVE.cmd");
  if (!fs.existsSync(target)) throw new Error(`EVE.cmd is missing from ${ROOT}`);

  /* Paths go through the environment rather than the command line: a folder
   * called "Rahul's stuff" would otherwise end the PowerShell string early. */
  const script = `
    $ErrorActionPreference = 'Stop'
    $shell = New-Object -ComObject WScript.Shell
    foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('StartMenu'))) {
      if (-not $dir) { continue }
      $link = $shell.CreateShortcut((Join-Path $dir 'EVE.lnk'))
      $link.TargetPath       = $env:EVE_TARGET
      $link.WorkingDirectory = $env:EVE_DIR
      $link.Description      = $env:EVE_DESC
      if (Test-Path $env:EVE_ICON) { $link.IconLocation = $env:EVE_ICON }
      $link.Save()
      Write-Output (Join-Path $dir 'EVE.lnk')
    }`;

  const out = execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: "utf8",
      env: { ...process.env, EVE_TARGET: target, EVE_DIR: ROOT, EVE_ICON: ICO, EVE_DESC: DESCRIPTION },
    }
  );
  for (const line of out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) made.push(line);
}

// ---------- Linux & Raspberry Pi ----------
function linux() {
  const target = path.join(ROOT, "eve.sh");
  if (!fs.existsSync(target)) throw new Error(`eve.sh is missing from ${ROOT}`);
  fs.chmodSync(target, 0o755);

  /* Terminal=true on purpose: she is a server that keeps running, and the
   * window is how you see what she is doing and how you stop her. */
  const entry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=EVE",
    `Comment=${DESCRIPTION}`,
    `Exec=${target}`,
    `Path=${ROOT}`,
    `Icon=${PNG}`,
    "Terminal=true",
    "Categories=Utility;Education;",
    "",
  ].join("\n");

  const targets = [];
  const desktop = desktopDir();
  if (desktop) targets.push(path.join(desktop, "EVE.desktop"));
  const menu = path.join(os.homedir(), ".local", "share", "applications");
  fs.mkdirSync(menu, { recursive: true });
  targets.push(path.join(menu, "EVE.desktop"));

  for (const file of targets) {
    fs.writeFileSync(file, entry);
    fs.chmodSync(file, 0o755);            // GNOME and the Pi's desktop both
    made.push(file);                       // refuse to launch a non-executable entry
  }

  /* Newer GNOME additionally wants the file marked trusted, or it shows the
   * raw filename and does nothing when clicked. Absent elsewhere; ignorable. */
  const onDesktop = targets.find((f) => desktop && f.startsWith(desktop));
  if (onDesktop) {
    try {
      execFileSync("gio", ["set", onDesktop, "metadata::trusted", "true"], { stdio: "ignore" });
    } catch { /* not GNOME, or gio absent — the entry still works */ }
  }
}

// ---------- macOS ----------
function macos() {
  const target = path.join(ROOT, "eve.sh");
  if (!fs.existsSync(target)) throw new Error(`eve.sh is missing from ${ROOT}`);
  fs.chmodSync(target, 0o755);

  const desktop = desktopDir();
  if (!desktop) throw new Error("Could not find your Desktop folder.");
  const file = path.join(desktop, "EVE.command");
  fs.writeFileSync(file, `#!/bin/sh\nexec ${JSON.stringify(target)}\n`);
  fs.chmodSync(file, 0o755);
  made.push(file);
}

// ---------- run ----------
try {
  if (process.platform === "win32") windows();
  else if (process.platform === "darwin") macos();
  else linux();

  console.log("\n  EVE is on your desktop.\n");
  for (const file of made) console.log(`    ${file}`);
  console.log("\n  Double-click it to start her. The shortcut points at this folder,");
  console.log("  so if you move the folder, run this again.\n");
  if (process.platform === "darwin") {
    console.log("  macOS will ask once whether you trust it — right-click → Open the");
    console.log("  first time, and it opens normally after that.\n");
  }
} catch (err) {
  console.error(`\n  Could not make the shortcut: ${err.message}\n`);
  console.error(`  You can still start her by double-clicking ${process.platform === "win32" ? "EVE.cmd" : "eve.sh"} in this folder.\n`);
  process.exit(1);
}
