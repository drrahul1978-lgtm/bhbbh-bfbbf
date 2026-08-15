# Teaching her objects

One folder per object. Drop photos in, push, and run:

```bash
node tools/train-eye.js
```

`.jpg` or `.png`, any filename. Folder names become the names she says, so
`game-controller` becomes "game controller".

## How many

| | per object |
|---|---|
| Minimum worth shipping | 20 |
| Sweet spot | **30–40** |
| Past 60 | no further gain from this method |

A quarter of them are held back and never trained on, so the score she reports
is measured rather than assumed.

## What makes a good photo, in order of importance

1. **Varied backgrounds** — desk, table, carpet, in a hand. This matters more
   than everything else put together. She measures colour and edge layout, so a
   studio photo on white teaches her "object on white", and she then fails on
   your desk.
2. **Varied angles** — above, side, tilted, upside down.
3. **Varied distance** — filling the frame, and small in it.
4. **Varied light** — daylight, lamp, dim.
5. **Different examples** where you have them — two different cups beats one cup
   photographed thirty times.

Thirty phone snaps in real rooms beat a hundred stock images. If stock is all
you have, send 40 and expect her to be at her best against a plain background —
the measured number will say which, either way.

## Adding an object of your own

Make a folder, drop photos in, run the tool. Nothing else needs changing.
