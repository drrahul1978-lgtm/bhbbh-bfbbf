# EVE — kernel

Phase 1 of the EVE architecture: the spine everything else hangs from. Five
pieces, each independently replaceable and independently tested.

```
eve/kernel/
├── config.js       layered settings — defaults, file, environment
├── vault.js        secrets, and keeping them out of everything else
├── log.js          structured JSONL, buffered, redacted
├── audit.js        the PLANNED → ATTEMPTED → SUCCEEDED → VERIFIED ledger
├── permissions.js  least privilege for a system that writes and runs code
├── health.js       CPU, memory, disk, temperature, Pi throttling
└── storage.js      writes that survive the power being cut
```

```js
const kernel = require("./eve/kernel");

const eve = kernel.boot({ confirm: askTheHuman });

await eve.guard("HOME_AUTOMATION",
  { action: "unlock the front door", why: "you asked me to" },
  async () => adapter.act("turn_on", door),          // the work
  async () => (await adapter.act("query_state", door)).state === "unlocked"
);                                                    // the proof
```

Nothing runs until the capability is granted, and nothing is recorded as
verified until something independently confirmed it.

## Why the audit ledger enforces its states

The brief requires that EVE never claim something succeeded when it did not.
That cannot be a habit — it has to be structural, so `audit.js` makes the
illegal states unreachable:

- an entry cannot reach `SUCCEEDED` without having been `ATTEMPTED`
- an entry cannot reach `VERIFIED` without evidence being passed in
- `ledger.run(spec, work, verify)` marks work `FAILED` when verification cannot
  confirm the intended effect — not `SUCCEEDED` with a caveat
- every entry must record *why*, not only *what*

`SUCCEEDED` means "the call returned without error". `VERIFIED` means "something
looked afterwards and the world had actually changed". Those are different
claims and EVE is not able to conflate them.

## Permissions

Capabilities follow the brief. Defaults are least-privilege:

| Setting | Capabilities |
|---|---|
| allow | `FILE_READ`, `NETWORK_ACCESS` |
| ask | `FILE_WRITE`, `CODE_EXECUTION`, `HOME_AUTOMATION`, `CAMERA`, `MICROPHONE`, `GPIO` |
| deny | `COMMAND_EXECUTION`, `PACKAGE_INSTALLATION`, `SELF_MODIFICATION`, `SYSTEM_ADMIN` |

Three rules that matter more than the table:

1. **Refusal is an exception, not a return value** — a caller cannot ignore a
   denial by forgetting to check.
2. **No human present means no.** A background task at 3am cannot promote
   itself by virtue of nobody watching.
3. **High-risk capabilities re-ask every time**, even when the policy says
   allow, and a remembered "always" never applies to them.

## Built for this exact Pi

Raspberry Pi 4 Model B, 4 GB, 32 GB EVO Plus, actively cooled, inline power switch.

**The power switch drives the storage design.** An inline switch cuts power with
no clean shutdown, and a `writeFileSync` interrupted halfway leaves a truncated
file. `storage.js` writes to a temporary file, fsyncs it to the card, then
renames over the target — atomic on ext4, so the model is either entirely the
old version or entirely the new one, never a fragment. Model weights are also
versioned: a corrupted current copy falls back to the previous generation rather
than refusing to start.

**Undervoltage detection**, because it is the most misdiagnosed Pi fault there
is. `health.js` reads `vcgencmd get_throttled` and reports both current and
since-boot flags with what to do about each. A sagging supply looks exactly like
random software bugs — freezes, dropouts, corrupted writes — and this turns that
into a plain sentence.

**Logs are buffered** and flushed on a timer rather than written per line, with
rotation at 2 MB. Per-line writes are how SD cards die.

**4 GB and a fan** raise the defaults: the `balanced` training preset rather than
the minimum, and a 1 GB free-disk floor because a 32 GB card fills faster than
people expect.

### One hardware note

A plain inline switch cuts power mid-write. The atomic writes above mean EVE's
own files survive that, but the operating system's files are not protected by
her. Prefer `sudo shutdown -h now` before flipping it, or wire the switch to a
GPIO pin and trigger a clean shutdown.

## What this is not, yet

Phase 1 only. The skill sandbox, versioning and rollback (Phase 2), code
self-improvement (Phase 3) and the scheduler (Phase 4) are not built.

The honest note on Phase 3: EVE's own networks classify, they do not write novel
code. `config.model` is the seam where a language model plugs in for the
generative steps, left empty deliberately — with nothing configured she uses
deterministic template generation and says so, rather than pretending to reason.

---

## Phase 2 — the skill system

```
eve/skills/
├── sandbox.js        static inspection, isolated context, separate-process runner
├── isolate-runner.js the far side of the process boundary
├── registry.js       versions, install gating, rollback, performance, A/B
└── pipeline.js       generate → inspect → test → verify → install → remember
```

### Three rules the registry enforces

**A version cannot be installed until it has passed a test.** "It compiled" is
not evidence that it works, and `install()` refuses anything still in `draft` or
`failed`.

**The last known-good version is never destroyed.** Installing supersedes; it
does not delete. There is always something to roll back to, and rollback records
why it happened.

**A replacement must earn its place.** `compare()` refuses to decide on fewer
than 20 runs each, adopts only on a meaningful gain in success rate, and lets
speed decide only when reliability is level. Newer is not a reason.

### Integrity

Each version's source is hashed when registered and checked before loading. A
file damaged by a power cut, a failing card, or an edit no longer matches what
was tested — `loadCurrent()` refuses it and says to roll back or re-test rather
than running code that was never verified.

### What "verified" means in the pipeline

The pipeline will not install an adapter that connects but finds nothing. A
working integration has to have listed something real from your actual service.
`connected and listed 9 things in 240ms` is evidence; `the code compiled` is not,
and the audit ledger will not accept the latter as verification.

Untrusted code is exercised in a **separate process** first — empty environment,
hard timeout, killed on overrun — because a brand-new adapter has never run
before and the first run is exactly when it might do something stupid.

---

## Serving the site with no setup for anyone

`node eve-proxy.js` — the machine holds the key, the browser never sees it.

```
🧠 EVE is serving on http://localhost:8080
   Running on a Raspberry Pi 4 Model B — 4 cores, 3.7GB memory, arm64.
   cloud grading: on — the key stays on this machine
   background reviewer: on, and invisible to visitors

   Visitors need no key, no account and no settings.
```

A visitor opens the page, uploads a card, gets a grade. There is no settings
panel to find, nothing to paste, no account. The page asks `/api/health` whether
this host grades; if it does it uses it silently, and if it does not — a plain
static host, or the file opened directly — Eve handles it locally instead.
Either way the page works on arrival.

### Why the key is not in the page

It used to be, split across two strings so scanners would not catch it. That
hides a secret from automated tooling, not from people: anything in client-side
JavaScript is readable by anyone who opens the page, and published keys get
found and drained within days. Then it works for nobody, including you.

Here the key is attached by the server on the way out. `test/proxy.test.js`
asserts it is in the outbound request and in nothing the browser downloads.

`eve-data/` sits inside the directory being served, so the deny-list is checked
*before* the filesystem — and answers 403 whether or not the file exists, so the
refusal itself discloses nothing.

### The reviewer is invisible

Grading answers the visitor first; the reviewer runs afterwards, on a separate
tick. It cannot delay the answer, cannot change it, and cannot fail in a way the
visitor sees. Nothing in the response mentions it — tested.

What it finds is filed for you in `eve-data/cases.json`, under the
`disputed_exchange_only` privacy scope: the grade and the question, **never the
photograph**.
