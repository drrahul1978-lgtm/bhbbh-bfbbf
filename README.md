# 👁️ EVE — emergent virtual entity

An AI written from nothing. No libraries, no pretrained weights, no cloud, no
API key — the neural networks, the backpropagation, the optimiser and the
retrieval are all in this repository, in plain JavaScript, with **zero
dependencies**.

She runs on a Raspberry Pi 4 and equally on your own machine. Nothing she sees
or hears leaves it — not as a policy, but because there is no code in her that
could send it anywhere.

## What she does

| | |
|---|---|
| **Writes her own code** | Ask her to connect to something and she works out the API, generates a real JavaScript adapter, shows you the source, and keeps it as a permanent skill. |
| **Works out APIs alone** | Three tiers: read the service's own OpenAPI document, infer from the shape of its responses, or search the web. Offline is a normal state, not an error. |
| **Learns to understand you** | A network that sorts what you say into requests she has a skill for — and gets measurably better at it every round you run. |
| **Sees** | Describes any camera frame, and recognises the objects you personally taught her. Says *unknown* rather than guessing. |
| **Remembers** | Four tiers with ranked retrieval and a budget, so memory is searched rather than poured into everything. |
| **Knows her own limits** | A capability map rated from real runs, including what is unsupported. |

## Start her

```bash
node eve-proxy.js --open      # opens her in your browser
```

Or double-click **Start EVE** on Windows, **eve.sh** elsewhere. See
[INSTALL.md](INSTALL.md).

## Improve her

```bash
node eve-learn.js             # one round
node eve-learn.js --watch     # keep improving, overnight, forever
```

A quarter of her sentence shapes are **held back and never trained on**. Each
round practises on the rest, then sits that same fixed exam. New weights are
kept only if the score improves — otherwise they are thrown away.

Rounds that get rejected are the mechanism working. Without the gate, "she is
improving" would mean nothing at all.

```
gen    1   65.2%   rejected (best stands at 66.1%)
gen    2   59.8%   rejected (best stands at 66.1%)
gen    3   70.5%   kept — new best 70.5%
```

She sizes each round to the machine she is on, so the same command is right
everywhere:

| Machine | Each round |
|---|---|
| A very small board (1 core, under 1GB) | 12 epochs · 4 device names · 1 rewording |
| A Raspberry Pi | 25 epochs · 8 · 2 |
| An ordinary computer | 45 epochs · 12 · 2 |
| A fast machine | 80 epochs · 20 · 3 |

The *architecture* never changes with the machine — only how hard she works.
That is deliberate: a mind trained overnight on a desktop can be copied
straight onto a Pi and used there, which would be impossible if a fast machine
built a network a small one could not load.

Your corrections are replayed four times per round, so she becomes better at
*your* phrasing specifically. They are training data only — she is never
examined on the answers you gave her.

## Talk to her

```bash
node eve-connect.js --chat    # no browser, no CORS
node eve-connect.js --api     # watch her work out an API on her own
```

## The rest

- **[EVE.md](EVE.md)** — every file, and what it is for
- **[INSTALL.md](INSTALL.md)** — getting her onto a PC, a Mac or a Pi
- **[eve/README.md](eve/README.md)** — the kernel: permissions, audit, health, storage
- **[eve/memory/README.md](eve/memory/README.md)** — how memory is stored and searched
- **[eve/vision/README.md](eve/vision/README.md)** — her eye, and what it honestly cannot do

```bash
npm test          # every subsystem
npm run test:pi   # would this survive a Raspberry Pi 4?
npm run whereami  # what machine does she think she is on?
```

## What she is not

There is **no language model in her**. She classifies requests into intents she
has skills for; she cannot hold a conversation or explain herself in prose. She
writes API adapters from machine-readable descriptions, not arbitrary software
from a sentence. She cannot name an object nobody has shown her.

Each of those is stated because it is true, and each one she will admit to
rather than bluff past.
