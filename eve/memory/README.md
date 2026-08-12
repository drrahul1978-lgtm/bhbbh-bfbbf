# EVE — memory

Four tiers, because they get used differently.

| Tier | Holds | Persisted |
|---|---|---|
| `short_term` | the conversation and task in front of her | no — cleared with the task |
| `long_term` | things worth keeping, with where they came from | yes |
| `procedural` | how a task was actually completed, step by step | yes |
| graph | how people, devices, skills and rooms relate | yes |

## Retrieval without an embedding model

The brief asks for memory that is *searched*, not poured into every
conversation. Doing that properly usually means embeddings — and there is no
model on this Pi to make them.

So this uses an inverted index with BM25-style scoring: the technique search
engines used before neural retrieval. It runs in milliseconds on a Pi, needs
nothing but arithmetic, and has no dependencies.

**It matches words, not meaning.** Ask about "luminaire" and a memory about
"lamps" will not be found. That limit is tested rather than hidden, and every
result carries its score so a thin match reads as thin. A task sharing only a
common verb can still surface — it just scores below the task it actually
describes.

Ranking is the term match adjusted by three things: how much the **source**
deserves belief, how **important** it was marked, and how **recent** it is.

```
user_confirmed  2.0     you said it, or you settled a correction
verified        1.6     EVE checked and the check passed
official_docs   1.4
observed        1.2     she watched it happen
community       0.8
unknown         0.6
```

## Not pouring everything in

`context(query, { budget })` is the answer to the brief's requirement. It fills
a character budget with the best matches and reports what it left out:

```js
memory.context("hub network status", { budget: 200 });
// { text: "...", used: 187, included: 3, considered: 12, omitted: 9 }
```

## Forgetting, and the line it will not cross

A 32 GB card and 4 GB of RAM mean memory has to be bounded, so old and
unimportant things are evicted — ranked by importance, source weight, how often
they have been used, and how long ago.

**Two things are never evicted: anything you confirmed, and anything pinned.**
EVE may forget what a website told her. She may not forget what you told her.

Writes are batched on a timer rather than one per memory, because per-write disk
touches are how SD cards die.

## The graph

Entities are the nouns — you, a device, a skill, a room, an API. Edges are typed
and directional, and relations with a known opposite are stored both ways, so
"the kitchen contains the light" reads correctly from the light's end too.

Traversal is breadth-first and depth-limited: it either finds a short
explanation of how two things connect, or admits there isn't one. An unbounded
search on a 4 GB machine is how a background task eats the box.

Learning a new attribute **merges** rather than replaces, so finding out one new
thing about a device never erases everything else known about it.
