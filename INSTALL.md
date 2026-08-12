# Installing EVE

Everything below runs entirely on your machine. No account, no key, no upload —
not as a policy, but because there is no code in it that could send anything
anywhere.

---

## Windows — the installer

**You do not build this yourself.** GitHub builds it on a Windows machine and
gives you an `.exe`, because the NSIS and MSI bundlers exist only on Windows and
cannot be cross-compiled from anything else.

A tag is what starts it:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

1. Open the repository's **Actions** tab — **Build the desktop app** is running.
2. Wait about ten minutes.
3. Download the **eve-Windows** artifact at the bottom of the run.
4. Unzip it, run the `.exe`, and EVE appears in the Start Menu.

The same run also attaches the installers to a **draft** release, which only you
can see until you choose to publish it.

> **The "Run workflow" button may not be there.** GitHub only offers it for
> workflows that exist on the repository's *default* branch. While this work
> lives on a feature branch, use the tag above — tags trigger the build from
> whatever branch they point at. Merging the branch makes the button appear.

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

## Windows — right now, without waiting for a build

This needs no installer, no CI and no unsigned `.exe`, and it reaches every
feature the desktop app does.

1. Install [Node.js](https://nodejs.org) — the LTS installer, click through it.
2. Copy this folder to the PC.
3. **Double-click `EVE.cmd`.**

She starts and your browser opens on her eye. Leave the black window open;
closing it stops her. If Node is missing, `EVE.cmd` says so and opens the
download page rather than failing with a stack trace.

`localhost` counts as a secure origin, so the camera works here — which is the
whole reason the desktop app exists. Chrome and Edge will also offer
**⋮ → Cast, save and share → Install page as app**, giving you a Start Menu
entry and its own window without an installer ever being involved.

On Linux, a Pi or a Mac, `./eve.sh` does the same thing.

---

## Putting her on your desktop

Double-click **`Add EVE to my desktop.cmd`** once. You get an EVE icon on the
desktop and an entry in the Start Menu, both starting her from a double-click
like any other application.

Elsewhere — Linux, a Raspberry Pi, a Mac — run:

```bash
npm run shortcut
```

The shortcut *points at this folder* rather than copying anything into it, so
nothing is installed and nothing is duplicated. Move the folder later and the
shortcut breaks; run it again and it is fixed.

---

## Putting her on a phone's home screen

Her eye is a proper web app, so a phone can hold it like an installed one:

1. On the Pi (or the PC), start her with the camera-capable address:
   `node eve-proxy.js --https`
2. On the phone, open `https://<the machine's address>:8080/eye.html` and accept
   the certificate warning once.
3. **iPhone:** Share → *Add to Home Screen*. **Android:** ⋮ → *Add to Home
   screen* / *Install app*.

She then opens full-screen from the home screen, with no browser bar.

> The `--https` matters. A phone's browser will not hand over the camera to a
> plain `http://` address that is not `localhost`, so without it she opens but
> cannot see. That is the browser's rule, not hers.

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
