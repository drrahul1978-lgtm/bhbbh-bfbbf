# Installing EVE

Everything below runs entirely on your machine. No account, no key, no upload —
not as a policy, but because there is no code in it that could send anything
anywhere.

---

## Windows — the installer

**You do not build this yourself.** GitHub builds it on a Windows machine and
gives you an `.exe`.

1. Go to the repository's **Actions** tab → **Build the desktop app** → **Run workflow**.
2. Wait about ten minutes.
3. Download the **eve-Windows** artifact at the bottom of the run.
4. Unzip it, run the `.exe`, and EVE appears in the Start Menu.

Or tag a release — `git tag v1.0.0 && git push --tags` — and the installers are
attached to a draft release instead.

> **SmartScreen will warn you.** "Windows protected your PC — unknown
> publisher." That is not a virus warning; it means the installer is not signed
> with a paid code-signing certificate (they cost a few hundred pounds a year).
> Choose **More info → Run anyway**. If that bothers you, the alternative below
> avoids installers entirely.

### What you get

A real desktop application: its own window, its own icon, a Start Menu entry,
and an uninstaller. It opens on **her eye** — the camera trainer — with the card
grader and her studio one click away.

The camera works with no certificate and no warnings, which is the main reason
the app exists: a browser refuses a camera to any page that is not on a secure
origin, and a Raspberry Pi on your network is not one.

---

## Windows — without installing anything

If you would rather not run an unsigned installer:

1. Install [Node.js](https://nodejs.org) (the LTS installer).
2. Copy this folder to the PC.
3. `node eve-proxy.js`
4. Open `http://localhost:8080/eye.html`

`localhost` counts as a secure origin, so the camera works here too. Chrome and
Edge will also offer **⋮ → Install**, which gives you a Start Menu entry without
an installer ever being involved.

---

## Linux — the installer

Linux is the one platform that can build its own installer, because the `.deb`
bundler runs anywhere. From this folder:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev patchelf
npm install
npm run app
sudo dpkg -i src-tauri/target/release/bundle/deb/EVE_1.0.0_amd64.deb
```

`EVE` then appears in your applications menu. The package is about 1.6 MB and
depends only on the system webview (`libwebkit2gtk-4.1-0`, `libgtk-3-0`).

The same build on the GitHub runner also produces an `.AppImage`, which needs no
installation at all — `chmod +x` it and run it.

---

## Raspberry Pi

```bash
node eve-proxy.js              # serve everything on port 8080
node eve-proxy.js --https      # needed if another machine wants the camera
node eve-train.js --watch      # keep training, overnight, forever
node eve-connect.js --chat     # talk to Home Assistant
```

Nothing to compile — no dependencies at all, so nothing can fail to build on
ARM. See **[WINDOWS.md](WINDOWS.md)** for which machine should do what.

---

## Trying every part of her

Once she is open:

| What | Where | What to try |
|---|---|---|
| **Her eye** | opens first | Turn the camera on. Hold something up, name it, press *Take 8*. Then show her the same thing again — and something else entirely, to watch her say she does not recognise it. |
| **Card grading** | 🃏 in the header | Drop in a photo of a card. She reads centering, corners, edges and surface, and tells you what she measured. |
| **Her studio** | 🧠 in the header | Watch her train: every round is scored against cards she never sees, and kept only if it beats her best. Correct a grade and she learns from it. |
| **Writing her own code** | studio, section 4 | Ask her to *connect to home assistant*. She writes the adapter herself and shows you the code before running it. |

### What is worth checking, because it is where systems usually lie

- Show her something she was **never taught**. She should say she does not
  recognise it, not name her nearest guess.
- Cover the lens. She should say she cannot see, not grade the darkness.
- In the studio, hit **Keep improving** and watch rounds get **rejected**. Being
  rolled back is the mechanism working, not failing.
- Turn off your WiFi and use all of it. Nothing should change.
