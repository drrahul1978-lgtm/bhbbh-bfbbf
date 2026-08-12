# EVE — capability map & platform

## What she can do (`capabilities/map.js`)

```
Writing adapters       → Strong (41 runs)
API integration        → Moderate (18 runs)
Understanding requests → Limited (6 runs)
Web research           → Unsupported
Changing her own code  → Unsupported
```

**Ratings are never stored.** They are recomputed from evidence every time they
are read, because a stored rating outlives the thing it was based on — a skill
can rot while a number written down last month keeps saying "strong".

Four rules, each enforced in code and tested:

**No evidence means unsupported.** Not "unknown", never a flattering default. If
she has never done it, the map says so.

**A rating is capped by its evidence.** Four successes out of four is *limited,
on four runs* — thirty runs are needed before anything reads as strong.
Confidence measures the amount of evidence, separately from the success rate.

**Corrections count against.** Being told she was wrong is evidence about the
capability, not just about that one answer. A 90% run rate with a dozen
corrections against it does not read as strong.

**A gap comes with a route or a reason.** `assess()` answers three ways:

| | |
|---|---|
| *"connect to my sprinkler REST API"* | can learn it — here is how, and what I need |
| *"read a GPIO pin"* | depends on the machine — see below |
| *"write me an essay"* | cannot learn it: needs a language model, and training longer will not change that |

Matching is by words, so an unrecognised request says exactly that rather than
guessing quietly.

## Where she is (`platform/detect.js`)

The same code runs on a Pi, a laptop, a server or in a container, and those are
not the same machine. She looks rather than being told — device tree, `/proc`,
`/dev`, `os` — and every probe returns "unknown" instead of throwing, because a
machine she does not recognise should still run her.

```
Running on a Raspberry Pi 4 Model B Rev 1.4 — 4 cores, 3.7GB memory, arm64.
Hardware I can reach: gpio, camera, microphone, bluetooth, i2c.
```

Detection sets defaults; **it never overrides a setting you chose.** Platform
tuning is merged above the built-ins and below your config file.

| | Raspberry Pi | Roomy machine |
|---|---|---|
| training preset | pi / balanced | desktop |
| image cap | 640–700px | 1200px |
| memory capacity | 3,000 | 50,000 |
| log flush | every 5s | every 1s |
| concurrent requests | 2 | 8 |

A 4 GB Pi is tuned up from the constrained floor; a 1 GB Pi Zero is not.
Anything unrecognised is treated as constrained — being needlessly slow is a far
cheaper mistake than falling over.

**Hardware answers follow the actual machine.** The same question gets different
honest answers:

- on a Pi: *"this machine does have gpio, so it is physically possible here — but I have no driver. A bridge exposing it over HTTP is the route I could take."*
- on a laptop: *"not on this machine — there is no such hardware here at all. On a Raspberry Pi the answer might be different."*

And it checks the hardware the request actually needs: a laptop having a
microphone says nothing about whether it can drive a GPIO pin.

## On portability

EVE runs anywhere Node runs, adapts to the host, and carries her own state in
one directory. What she does **not** do is install or copy herself anywhere. She
runs where you put her, and every action that touches the machine goes through
the permission broker. Portable and self-adapting, not self-spreading — the
first is useful, the second is malware regardless of intent.
