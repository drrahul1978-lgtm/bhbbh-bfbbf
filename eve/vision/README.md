# Eve's Eye

Point a camera at something and she tells you what she can. Open `eye.html`.

## What she can do, and what she cannot

**She cannot name an object she has never seen.** "That's a mug" needs a model
trained on a million labelled photographs — a pretrained network we do not have
and cannot train from scratch here. No amount of work on a Pi changes that.

**She can learn the things you show her.** Hold up your keys, name them eight
times from different angles, and she knows them afterwards. That is few-shot
recognition, and it works.

**She can describe any frame without being taught anything**: how bright it is,
where the detail sits, whether something is moving, whether the camera can see
well enough to be believed at all.

## Teaching her

Type a name, then either take single shots or use the burst — eight shots a
second apart, moving the object between each. *Different angles and distances
teach her what matters; the same pose eight times teaches her very little.*

Five views is enough to start. She says which it is.

## How recognition works, and why not a network

Nearest-centroid against the average of what you showed her — not a neural
network, deliberately. A network needs hundreds of examples per class before it
beats guessing, and nobody photographs their keys three hundred times. With
eight examples, comparing against the average is both more accurate and, more
importantly, **degrades honestly**: the distance to the nearest match is a real
measure of how sure she can be, where a half-trained network returns a
confident-looking number that means nothing.

Two tests decide the answer, and both must pass:

- **Absolute distance** — is it close to anything she knows?
- **Relative to that object's own spread** — is it as close as her examples of
  that thing typically are to each other? A consistent object has a tight
  spread; one photographed from every side has a loose one. This is why being
  equally far from two known objects reads as *unknown* rather than *ambiguous*
  — it is neither of them, not a hard choice between them.

## Three answers, and the one that matters most

| | |
|---|---|
| **"red mug · 84%"** | close to one thing she knows, and clearly closer than the runner-up |
| **"either red mug or red bowl"** | a good match, but two of them are too alike to separate |
| **"I do not recognise that"** | too far from everything she knows |

The third is the important one. **A recogniser that names its closest guess for
an object it has never seen is worse than useless** — it is confidently wrong,
which is the failure that erodes trust in everything else she says. Anything she
was not taught comes back as unknown. Always.

She also refuses to *learn* from a frame she cannot see — a dark lens or a blank
wall is rejected rather than quietly absorbed as an example of your keys.

## Installing it as a Windows app

`eye.html` ships a web manifest, so Chrome or Edge will install it: open it, then
**⋮ → Install**. It gets its own window, its own icon and no browser chrome —
a desktop app in every way that matters, with nothing to package and no
dependencies to break.

Point it at the Pi (`http://your-pi:8080/eye.html`) and the app runs on Windows
while everything it learns stays wherever you opened it.

## On a Pi

Frames are measured at 96px and read twice a second rather than thirty times —
a human cannot read a faster readout anyway, and a Pi has better uses for its
cores. What she learns is bounded at 40 views per object.
