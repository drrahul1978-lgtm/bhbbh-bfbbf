# EVE — the correction system

Groq lives here and nowhere else.

## The boundary

The external reviewer looks at work EVE has **already finished**. It never
participates in producing an answer, and there is no route from a review back
into a reply. By the time the reviewer runs, the answer has been given.

This is enforced three ways rather than promised:

1. **`groq.js` is the only file that knows Groq exists.** `test/review.test.js`
   walks the whole repository and fails the build if any other file mentions it.
2. **The evaluator's input is a finished case** — question, the answer already
   given, the sources and tools used. There is no code path that hands it a
   pending request.
3. **Every review is marked `advisory`.** It is filed on a case and waits. It
   installs nothing, rewrites nothing, and outranks nobody.

The practical effect: the worst case is *"the reviewer is unavailable"*, never
*"the answer came from somewhere else"*. Everything EVE actually does still runs
on your own hardware.

## The key

Read from the vault at the moment of use, never stored in a closure, a config
object, a prompt, a log line or a skill file. `EVE_SECRET_GROQ_API_KEY=…` in the
environment, or in a 0600 secrets file.

With no key configured, `makeGroqTransport` returns `null`, the evaluator
reports `available: false`, and EVE carries on unchanged. **A reviewer is
optional. Local-only is a supported mode, not a degraded one.**

> The old key committed at `app.js:8` must be revoked at console.groq.com —
> deleting the line does not help, the git history keeps it. Use a new key here.

## The human wins

| | |
|---|---|
| External reviewer | advisory — an opinion, filed and waiting |
| You | authoritative — settles the case |

Four verdicts: `correct`, `incorrect`, `partially_correct`, `needs_more_research`.
When you rule, the case is settled and the reviewer's opinion is kept only as a
record of whether it was right. `reviewerReliability()` reports how often it
agreed with you — so a reviewer that is often wrong can be weighted down instead
of trusted by default.

## Privacy

Review material can include your conversation, so what leaves the machine is an
explicit setting:

| Scope | Sends |
|---|---|
| `full_conversation` | everything, conversation included |
| `relevant_conversation` | the question, answer, sources, tools, code |
| `disputed_exchange_only` | just the question and the answer |
| `do_not_send` | nothing at all — `applyPrivacy` returns `null` |

## Patterns, not facts

`findPatterns()` counts error types across reviews. Three
`OUTDATED_INFORMATION` mistakes are not three answers to memorise — they are one
research strategy to change, and that is what the lesson says.

Ten error types: `FACTUAL_ERROR`, `OUTDATED_INFORMATION`, `BAD_SOURCE`,
`INSUFFICIENT_RESEARCH`, `REASONING_ERROR`, `CODING_ERROR`, `TOOL_ERROR`,
`INTEGRATION_ERROR`, `MEMORY_ERROR`, `MISUNDERSTANDING`. A type the reviewer
invents is recorded as `UNCLASSIFIED` rather than added to the taxonomy, so the
counts stay meaningful.

## Not yet verified against the live API

Every test here runs against a stand-in reviewer. The Groq request shape —
endpoint, auth header, `response_format: json_object` — is written from the
documented API but **has not been exercised against the real service**, because
this machine has no key. First real call is the thing to watch.

---

## What a correction leaves behind

A correction that only fixes one answer is worth very little. Settling a case
produces two different things, and keeping them separate is the whole point.

### A regression test — for the fact

`eve/learn/regression.js` turns a settled correction into a test that checks
**both directions**: the right answer must appear, *and* the wrong one must not.
An answer that hedges — "it might be 8321, or possibly 8123" — has not been
fixed, and is failed.

Rephrasings of the question are generated and replayed too, so a fix that only
works for the exact original wording is reported as **`passed_narrowly`** rather
than as passing. That distinction is the difference between learning something
and memorising a string.

Only human-settled corrections become tests. A correct answer has nothing to
guard against; a case marked wrong with no correct answer stated cannot be
tested against; and an unconfirmed machine opinion is not a fact.

### A lesson — for the habit

When the same error type recurs, `LessonBook` records a change of **method**,
not a fact. The scope field is literally `"method"`, and the wording follows:
*"Check the version on a documentation page before trusting it"* survives as a
lesson; *"Home Assistant uses port 8123"* is a fact and belongs in a regression
test instead.

A lesson is only marked applied when you name what actually changed. Agreeing
with a lesson is not applying it, and `markApplied()` refuses an empty note.

### The honest limit

EVE has no language model of her own, so the "related tests" she generates are
rephrasings — real, and worth having, but not new concepts. Genuinely related
questions need you or a model to write, and every related test records
`writtenBy` so the distinction never quietly blurs.
