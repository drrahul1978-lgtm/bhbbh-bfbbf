# Data on a plugged-in drive

A Pi with no internet is not a broken Pi. Everything EVE needs can arrive on a
USB drive or a second SD card, and she finds it on the way up without being told
where to look.

```
🧠 EVE is serving on http://localhost:8080
   Running on a Raspberry Pi 4 Model B — 4 cores, 3.7GB memory, arm64.
   grading: local — Eve runs in the visitor's browser, no key anywhere
   plugged in: /media/pi/EVE_DATA has weights, language, memory, skills
```

## Where it looks

| Platform | Mount points |
|---|---|
| Raspberry Pi OS / Linux | `/media`, `/media/<user>`, `/mnt`, `/run/media`, `/run/media/<user>` |
| Windows | drive letters `D:` through `Z:` |
| macOS | `/Volumes` |

Mount points and one level inside them. A full search of an unknown drive on a
Pi could take minutes and would not be worth it.

## What counts as hers

A drive is only used if it identifies itself: a directory called `eve-data`, or
`eve.json` / `eve-model.json` at the top. **Someone's holiday photos are left
alone** — there is a test for exactly that.

Prepare a drive by copying any of:

```
eve-data/eve-model.json      her weights
eve-data/eve-intent.json     the language model
eve-data/memories.json       what she knows
eve-data/skills/             adapters she has written
eve-data/skills/specs/       API descriptions she worked out elsewhere
```

## What wins

**Local data wins.** A drive is a source, not an authority — plugging one in
never silently replaces the Eve already installed. Where there is nothing local,
the drive fills the gap, which is the case that matters on a Pi that has never
been online.

The log says which came from where, so it is never a mystery:

```
weights came from /media/pi/EVE_DATA — nothing local, so the drive filled the gap
```

## What it will not do

It **reads**. It does not write, mount, unmount, or delete, and it never touches
anything outside a directory that identifies itself as EVE's. The test asserts
the source contains no write, mount or delete call at all — not as a promise,
but as something checked on every run.

A read-only drive is fine; she notices, and carries on.
