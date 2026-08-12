# Getting the Windows app

**There is nothing to download.** No installer, no `.exe`, no app store. The
browser fetches the page from wherever you serve it and turns it into an
installed app — own window, own icon, Start Menu entry, no browser chrome.

Which means the real question is *where is it served from*, and that has two
answers depending on whether you want the camera.

---

## The catch, stated first

Chrome and Edge refuse to hand over a camera unless the page is on a **secure
origin**. `localhost` counts. `http://192.168.1.40:8080` does not.

So a Windows PC pointed at the Pi over plain HTTP gets **no camera at all**, and
the eye trainer is useless. That is a browser rule, not something the code can
work around.

Two ways round it.

---

## Option A — run it on the Windows machine (simplest, recommended)

Everything here is plain Node and static files. There is nothing to compile and
no dependency to install, so it runs on Windows exactly as it does on the Pi.

1. Install [Node.js](https://nodejs.org) — the LTS installer, next-next-finish.
2. Copy this folder to the PC, or `git clone` it.
3. In that folder:
   ```
   node eve-proxy.js
   ```
4. Open `http://localhost:8080/eye.html`
5. **⋮ → Install Eve's Eye** (or the ⊞ icon in the address bar).

It now has a Start Menu entry and launches in its own window. `localhost` is a
secure origin, so the camera works and installation is offered — no certificate,
no warnings, nothing to accept.

**The Pi still does the long-running work.** Train there overnight, export
`eve-model.json` and `eve-eye.json`, and drop them in the Windows folder — or
put them on a USB stick, which she finds by herself
(see `eve/platform/README-external.md`).

## Option B — serve from the Pi, reach it from Windows

For when the Pi should be the one machine holding everything.

On the Pi:
```
node eve-proxy.js --https
```

It makes a self-signed certificate on first run, covering `localhost`, the Pi's
hostname and every address it answers on. The private key is written `0600`.

On the PC, open `https://your-pi:8080/eye.html`, and **accept the certificate
warning once**. The camera then works, because the origin counts as secure.

Installing as an app may still be refused — browsers want a certificate they
*trust* before they will install a page, and a self-signed one is not that. You
get a working camera in a browser tab rather than a Start Menu entry. If you
want both, use Option A.

---

## What runs where

| | Windows PC | Raspberry Pi |
|---|---|---|
| Teaching her objects (camera) | ✅ the natural home | only with a camera attached |
| Grading cards | ✅ | ✅ |
| Training overnight | possible | ✅ leave it running |
| Talking to Home Assistant | ✅ | ✅ no CORS issues |
| Holding the data | ✅ | ✅ and it can serve it to the PC |

Both run the same code. Nothing here is Pi-only or Windows-only — she detects
which machine she woke up on and tunes herself accordingly
(`eve/platform/detect.js`).

## If you want a real installer later

Wrapping this in [Tauri](https://tauri.app) or Electron would produce a genuine
signed `.exe` with an installer. That is a packaging job, not a code change —
the app is already just these files. It is worth doing only if you plan to hand
this to people who will not clone a folder; for one machine, Option A is less
work and less to go wrong.
