# 🧠 Eve — an AI built from scratch

Eve is a neural network written from nothing: no TensorFlow, no PyTorch, no ONNX,
no pretrained weights, no API key, no server. Four plain JavaScript files, about
1,200 lines, running on your own machine — including a Raspberry Pi 4.

She grades trading cards: centering, corners, edges and surface, 1–10 each.

```
┌──────────┐   ┌───────────┐   ┌────────┐   ┌────────────┐
│ synth.js │──▶│ vision.js │──▶│ nn.js  │──▶│  4 grades  │
│  draws   │   │ measures  │   │ learns │   │  1 – 10    │
│  cards   │   │  photos   │   │        │   │            │
└──────────┘   └───────────┘   └────────┘   └────────────┘
```

| File | What it is |
|------|-----------|
| `nn.js` | The network. Dense layers, ReLU, sigmoid, backpropagation, Adam. |
| `vision.js` | Turns a photo into 199 numbers: finds the card, measures its borders, corners, edges and surface. |
| `synth.js` | Draws practice cards with known damage — Eve's endless supply of labelled data. |
| `eve.js` | Eve herself: grading, memory, and the loop that keeps her improving. |
| `eve-train.js` | Command-line trainer. Runs headless on a Pi. |
| `train.html` | The studio: watch her learn, test her, correct her. |

## Is she really mine?

Yes, with one honest caveat spelled out.

- **The code** was written for this project. No library is imported, at build time
  or run time. The only outside ingredient is textbook mathematics —
  backpropagation, the Adam optimiser, the Sobel operator — which is public
  knowledge owned by nobody, like long division.
- **The weights** are produced by training on your machine. Nothing was
  downloaded, distilled, or copied from another model.
- **The data** is drawn by `synth.js` on your machine, plus any real cards you
  grade yourself.
- **The caveat:** the *other* grader on this site (`index.html` with a cloud
  provider selected) calls Meta's Llama 4 through an API. That model is not
  yours. Eve is the alternative that needs none of it — pick
  “🧠 Eve — my own AI” in the settings and the site never touches the network.

## How she keeps improving

"Improving" here is measured, not assumed.

1. **Endless fresh data.** Every round draws new practice cards. Eve never sees
   the same card twice, so there is no fixed dataset to memorise.
2. **A fixed exam.** A validation set is drawn once and never trained on. Every
   round is scored against that same set, so scores are comparable over time.
3. **Only improvements are kept.** If a round scores worse, the weights are
   restored from the snapshot taken before it. Her recorded best can only fall.
4. **She learns your cards.** Grade a real card in the studio, correct her
   answer, and that example is replayed in every future round — weighted four
   times heavier than a practice card.
5. **Her steps shrink as she gets good.** A step size that helps a beginner will
   wreck an expert, so the learning rate follows her current score. A fresh Eve
   takes big strides; a polished one takes careful nudges. Without this, a
   well-trained Eve would fail every round forever.
6. **Rounds overlap.** Each round trains on a rolling window of the last several
   rounds' cards, not just the newest handful — enough data to make a real step,
   while old cards keep dropping out the back.

The chart in the studio shows both: the line is her best-so-far, the dots are
each round's raw score. Grey dots above the line are rounds that were rejected.

**What to expect.** A brand-new Eve improves fast — roughly 2.5 grade points of
error down to about 1.4 within four rounds. The Eve shipped with this site is
already near her ceiling at **0.96**, so most rounds you run will be rejected and
only occasionally will one squeeze out a small gain. That is the mechanism
working, not failing: she is not allowed to get worse, so once she is good,
progress is slow by design.

**Where it stops.** Endless practice cards make her better at *practice cards*.
Real photographs have lighting, angles, backgrounds and printing that `synth.js`
does not imitate, and a 15,000-weight network has a hard ceiling regardless.
Past a point, only your corrections move her on real cards. That limit is real,
and no amount of self-training removes it.

## Running her on a Raspberry Pi 4

Everything is static files and plain Node — no build step, no native modules,
nothing to compile.

**Serve the site** (any Pi, from the repo folder):

```bash
python3 -m http.server 8000
# then browse to http://<pi-address>:8000
```

**Train from the command line**, which is what a headless Pi is good at:

```bash
node eve-train.js                       # one round, writes eve-model.json
node eve-train.js --watch               # keep improving until Ctrl-C
node eve-train.js --cards 2000 --epochs 200
node eve-train.js --corrections eve-corrections.json
```

Useful flags: `--cards`, `--epochs`, `--lr`, `--batch`, `--validation`,
`--rounds N`, `--out FILE`, `--fresh` (ignore the saved model), `--quiet`.

**Leave it running.** `--watch` never stops improving, and only writes the file
when the score actually goes down, so it is safe to leave on a Pi overnight:

```bash
nohup node eve-train.js --watch --cards 800 --epochs 120 > eve.log 2>&1 &
```

### Speed on a Pi 4

A Pi 4 is roughly five to ten times slower than a desktop for this work, and it
is single-threaded JavaScript either way. Sizes were chosen with that in mind:

- **Grading one card:** a few hundred milliseconds. The photo is capped at 700px
  before measuring, and the network itself is only ~15,000 weights.
- **Training:** pick the 🍓 Raspberry Pi preset in the studio (60 cards, 15
  epochs per round) so the browser stays responsive, or use `eve-train.js` on the
  command line, which is faster because it does not have to keep a page alive.
- **Memory:** the model file is a few hundred KB; training a round holds a few
  hundred feature vectors, which is a handful of megabytes.

Training in the browser yields to the page between every epoch, so a Pi driving a
monitor will not lock up while she learns.

## Moving her around

Her brain is a JSON file.

- **Export Eve** in the studio → `eve-model.json`. Drop it next to the site and
  every visitor starts from that version.
- Copy it to a Pi, run `node eve-train.js --watch` to improve it there, and
  **Import Eve** to bring it back.
- **Export my corrections** → `eve-corrections.json`, then train with
  `node eve-train.js --corrections eve-corrections.json`.

## How good is she?

On held-out practice cards she is currently within **about one grade point** per
category, against **~2.0** for guessing the average every time. Per-category
scores are shown live in the studio.

On real photographs she is considerably rougher — she has never seen one unless
you have taught her. The big vision model on the main page is far better at real
cards, and says so. Eve's advantages are different: she is instant, free,
offline, entirely yours, and she can show you exactly what she measured.

## Tests

```bash
npm test          # or: node test/nn.test.js && node test/vision.test.js && …
```

- `test/nn.test.js` — checks backpropagation against finite-difference
  gradients, that mini-batch gradients equal the mean of individual ones, and
  that a saved model reloads bit-for-bit.
- `test/eve.test.js` — checks grading output, and that a losing round is
  genuinely rolled back rather than merely unrecorded.
- `test/pipeline.test.js` — the end-to-end proof: draw cards, train, and beat a
  guess-the-average baseline on cards never seen.
