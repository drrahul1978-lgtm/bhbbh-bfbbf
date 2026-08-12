# EVE — the debate

Two Eves grade the same card. Where they agree, the answer is sound. Where they
argue, the card is genuinely hard — and saying so is more useful than a
confident number.

```
centering: Eve One 6.4, Eve Two 7.5 — near enough. Taking both: 7.0.
corners:   Eve One 8.9, Eve Two 4.2, roughness at the four corners measured
           1.84, which does not settle it, and neither has a better record
           here. I am not going to pick a winner — it is somewhere between
           4.2 and 8.9, and I would rather you decided.
```

## Who the debaters are

| | |
|---|---|
| **Eve One** | 199-64-32-4 network, one draw of training cards |
| **Eve Two** | 199-48-24-4 network, different starting weights, different cards |

Different shapes and different data, so they make *different* mistakes. That is
the whole requirement — two models failing in the same places would agree
confidently and wrongly.

## How a winner is decided

1. **They agree** → take both. Averaging two models that agree is slightly
   better than either alone.
2. **One has been demonstrably better here** → hers wins. Evidence about the
   debaters, from corrections you actually made, and it needs at least ten
   before it counts.
3. **Neither** → their average, the range reported, confidence low, filed for
   you. A system that always produces a winner is lying about the hard cases.

## What the measurements showed

Everything here was measured rather than assumed, and two versions were thrown
away for failing.

**The first Eve Two was a rule-based grader** reading grades straight off the
measurements. Its disagreement with Eve One correlated **−0.018** with error —
nothing at all — and the ensemble graded **2.4** points off against Eve One's
**1.0** alone. Replaced, not shipped.

**With two networks**, disagreement correlates **0.225** with Eve One being
wrong, and the cards they argue over really are harder:

| | they disagree | they agree |
|---|---|---|
| centering | 1.22 off | 0.68 off |
| corners | 1.29 | 0.93 |
| edges | 1.60 | 1.05 |
| surface | 1.48 | 0.95 |

**A step that was removed.** There was a rule: when the measurement is
unambiguous, whoever matches it wins. It reads well. Over 139 contested
categories it scored **1.463** grade points off, against **1.357** for plain
averaging and 1.454 for always taking Eve One. The clever step lost to the
obvious one, so it is gone. The analyst still explains what was measured; it
does not get to rule on it.

**The cost.** Debating does not grade better — 1.011 against Eve One's 0.999,
which is parity. What it buys is knowing which answers to doubt: 0.96 points off
on the cards it settles, 1.09 on the ones it flags.

## Speed

Measured, then estimated for a Pi 4 at 8× slower:

| | here | Pi 4 |
|---|---|---|
| reading the photo | 4.0ms | ~32ms |
| one Eve deciding | 3.3ms | ~26ms |
| both Eves + the judge | 3.5ms | ~28ms |

The second Eve is nearly free — reading the photo dominates, and that happens
once for both. Add the browser decoding a 700px photo, 60–150ms on a Pi, and it
is **about 180ms from pressing the button**.

No key, no request, no provider. It runs in the visitor's browser.
