# Step 8 — client runtime · **review**

Nothing was fixed. No source, test, config or spec file was edited. No probe file was written;
every finding below was verified by reading the code against `SPEC.md`, because all nine of the
adversarial's headline findings are visible in the source and none needed an experiment to
confirm.

**Evidence.**

| check | result |
|---|---|
| md5 manifest of all 119 files under `lib/`, `app/`, `proxy.ts`, before and after | `TREE IDENTICAL TO BASELINE` |
| `SPEC.md` md5 | `9147765904754001d3716a960fdc3e38`, unchanged |
| `pipeline/HANDOVER.md` md5 | `1920ddf70fe808b151721c4a00c07b04`, unchanged |
| `pnpm verify` (Node v24.16.0, nvm-first PATH) | `Test Files 55 · Tests 1865 · Type Errors no errors`, `VERIFY_EXIT=0` |

`verify` was run once, alone; no harness ran beside it. The 128-mutation harness was **not**
re-run — the adversarial ran it, reported `128/128` with a clean ledger, and re-verified the
manifest afterwards. Re-running it would have bought a second copy of a result already
established and would have put a mutating process on disk for no new information.

**Verdict on the build: strong, and the strongest parts are the ones HANDOVER warned about.**
The `ts` dedupe is right, is expressed as object identity, and is tested from six directions
plus five mutations. The decimation proof is correct and its fixture asserts `tMs` as well as
`v`. The `RuntimeEnv` seam is the right call and the jsdom refusal is argued rather than
assumed. The ledger found seven inert mutations and twelve uncovered ⚠ tests and the build
fixed them instead of lowering the bar, and it dropped five ⚠ marks with reasons rather than
inventing mutations to cover them — which is HANDOVER §5.2 rule 1 applied correctly, and the
adversarial's Part E adjudication of all five is right.

**Verdict on the adversarial: the most valuable phase this pipeline has run.** Nine findings,
nine real. F3 is a product defect of the first order. F1/F2/F7 are one defect seen three ways.
F4/F5/F8 are one defect seen three ways. I reject none of the thirteen. I sharpen F6, narrow
F10, and I disagree with the adversarial on exactly one adjudication (S32 — it is **closed** by
the current spec, not open).

---

# Part 1 — the load-bearing calls

## 1.1 F3 — a condition whose subject disappears

### The ruling

**An unobservable alarm is UNKNOWN, not resolved — and the spec has already made this
distinction twice, in two other places, and must now make it a third time.**

The finding is real and I rate it above the adversarial's own ranking: it is not merely a §9
violation, it is the failure mode this entire dashboard exists to prevent. A box with two
passively-cooled 250 W cards on an EC curve measured to ignore GPU temperature has exactly one
instrument that matters at a glance, and F3 makes that instrument read *green* at the moment it
loses the ability to see. §6.5's `nvidia-smi` row ends "nothing else is affected", and that
sentence was written about **panels** — it is the presentation column of a table of
presentations. It is currently being read as a statement about §9's aggregate, and that reading
turns the header green while a card cooks.

**The fix is not to hold the alarm forever.** The mirror failure is as bad and the review brief
is right to name it: a dashboard that latches an alarm about a card somebody deliberately pulled
is a dashboard nobody trusts, and it is un-clearable without a reload, which §6.4's session log
is explicitly designed around.

**What makes both answers available at once is already in the contract, and the project has
already paid for it.** A condition disappears for exactly two reasons, and the snapshot tells
you which:

- the **enumeration could not be read** — `gpus: null`, `serving: null`. §4's contract, HANDOVER
  §7's first decision, and O10's `W2`/`W11` mutations all exist to keep `null` from becoming
  `[]`. That distinction was fought for in steps 1, 2 and 8. **This is what it is for.** Nothing
  was learned about the subject; the condition is **stale**.
- the **enumeration was read and the subject is not in it** — `gpus: [{index: 0}]` and no index
  1; `serving: []`. That is a positive observation that the subject has left the machine, and it
  is a legitimate basis for taking an alarm down. The condition is **retired**.

So the ruling reduces to a sentence in the spec's own idiom, extending a rule §6.7 already
carries: *a skipped call and a failed call must not read alike* becomes **a subject that was not
read and a subject that is not there must not read alike.**

### Answers to the four questions asked

**Is an unobservable alarm resolved, or unknown?** Unknown. Always. There is no reading behind
"resolved" and minting one is exactly what O12 forbids.

**Does the dot show the last known severity, a distinct "stale" state, or nothing?** **The last
confirmed severity, unchanged, with staleness carried by the MODE rather than by the severity.**
Three reasons, and the third is decisive:

1. Retaining is not inventing. O12 forbids *minting a band from a reading that does not exist*.
   Continuing to report the last band **actually measured**, labelled as such, asserts nothing
   about now — it asserts what was last seen, which is true.
2. §6.5's very first row already specifies this behaviour for the whole page: a failed poll
   freezes the charts, greys the dot and counts the age up. It does **not** say the alarm count
   goes to zero. A single collector failing is that same event at a smaller scale, and the spec
   should not treat the small case as the opposite of the large one.
3. **§6.2 already contains the answer, written for a different subject:** *"The severity glyph
   answers 'how is the machine', the mode answers 'how current is this'; collapsing the two
   loses one of them."* Downgrading a stale alarm to green collapses them. Inventing a fourth
   severity collapses them the other way. The severity keeps saying what the machine last was;
   the mode and the age say how old that is.

**Staleness therefore preserves severity: it never raises it and never lowers it.** In
particular a stale `normal` stays `normal` — do **not** promote it to `watch`. Every collector
hiccup raising the dot to amber would devalue amber, and §6.5's "nothing else is affected" is
right *about that case*: a subject we could not read, that was fine when we last read it, is not
evidence of harm. What tells the operator the reading stopped is the panel's own "no GPUs
enumerated" line (§6.5), the `errors[]` entry, and the event log.

**What does the event log record, and when?** Three lines, all debounced by §6.4's existing ten
seconds, all reusing the machinery `events.ts` already has for `errors[]` sources:

| edge | tone | when |
|---|---|---|
| a condition goes **stale** | `watch` | after 10 s of **sampled** wall time in which it did not appear |
| a stale condition is **read again** | its new band's tone | on confirmation, as any band change |
| a condition is **retired** | `normal` | after 10 s of sampled wall time in which its enumeration was read and it was absent |

The 10 s is not a new mechanism: it is the same `stepBandHold` over a two-valued band that
`events.ts` already runs for collector presence, and it is seeded the same way — *present*,
because a condition that has been observed is present until it stops being. The debounce is what
stops a single-poll enumeration flicker from logging a retirement, and it is why retirement
cannot be triggered by one bad poll.

**How does it interact with §6.4's debounce?** A poll in which a condition does not appear must
**step nothing**. Its `BandHold` is frozen, so `confirmedSinceMs` is preserved and the banner's
"when it started" stays true, and no un-sampled interval can confirm or reject a band on the
condition's behalf. This is already the code's behaviour — `observePoll` only touches holds for
ids present in the poll — but it must be **stated**, because it is what makes the stale rule
consistent with the gap rule in §1.2 rather than accidentally aligned with it.

**How does it interact with §9's dedupe?** Not at all, and that is worth one sentence so nobody
builds a mechanism for it. Staleness is *defined by absence from the poll*, so a live condition
and a stale record of the same id can never both be in the reduction; the live one always wins
because the stale set is only consulted for ids this poll did not carry.

**Is staleness bounded?** **No, deliberately.** An expiry would be a timer that silently turns
an alarm green — the bug being fixed, reintroduced with a clock. §6.4's banner is already
explicitly sticky across hours ("a 03:00 excursion is still on screen at 09:00 even though
nothing is stored"). What bounds it instead is *visibility*: the banner and the row must show
the age of the reading, so a stale alarm can never be mistaken for a live one.

### Exact wording

**§9 — Resolved defaults. New row, placed immediately after "One reading shown in two panels":**

> | A condition whose subject stops being reported | **The reduction runs over every condition the session has confirmed, not only over the ones in this poll.** A condition absent from a poll is **stale**: it keeps its last confirmed `displaySeverity`, keeps its "since", keeps counting toward the dot and the count, and shows the age of the reading behind it. It leaves the reduction only when it is **retired** — the collection that would have contained it was read successfully and it was not in it (`gpus: [ {index: 0} ]` for GPU 1, `serving: []` for every instance). A collection that could **not** be read (`gpus: null`, `serving: null`) retires nothing. Staleness never raises a severity and never lowers one | An unobservable alarm is **unknown**, not resolved. Without this a card at 90 °C whose `nvidia-smi` then fails takes the header from `● 1 alarm` to `● all healthy` with no log line — the dashboard turns green at the moment it loses the ability to look. §6.5's *"nothing else is affected"* governs the GPU **panels**; it was never a statement about this reduction. The `null` ≠ `[]` distinction §3.1 and §3.4 already carry is exactly what separates *not read* from *not there*, and this is what it is for |

**§6.5 — replace the `nvidia-smi` absent row:**

> | `nvidia-smi` absent | GPU panels show "no GPUs enumerated" with an explanatory line, and **no other panel is affected**. §9's dot and count **are** affected, and must be: every GPU condition this session had confirmed becomes **stale** (§9) — it keeps its last severity and its place in the count until a reading replaces it or the card is observed gone. A dashboard that goes green because it stopped being able to look is the one failure this row must never cause |

**§6.5 — two new rows, after the "single sensor read fails" row:**

> | A condition's subject stops being reported, and the collection it belongs to could not be read | **Stale.** It keeps its last confirmed band and its "since", still counts (§9), and its row and the banner name the age of the reading. One `watch`-toned event-log entry when it goes stale — after the same ten seconds of **sampled** wall time §6.4 requires — and one when a reading returns. Never a silent removal |
> | A condition's subject is absent from a collection that **was** read | **Retired.** The subject has left the machine, and that is an answer: the condition leaves the ledger, the dot and the count, and one `normal`-toned entry records it. Confirmed over the same ten seconds, so one flickering enumeration cannot retire a card |

**§6.5 — new paragraph, immediately after "Zero and unknown must never look alike":**

> **A reading that stopped and a subject that left must never look alike either.** *We stopped
> being able to look* is not *it got better*. Every rule in this section blanks **the figure it
> names**; none of them may quietly lower §9's aggregate, because the aggregate is the one thing
> on this page an operator reads from across the room.

**§6.4 — new paragraph, after "What the debounce gates, and what it does not":**

> **A poll in which a condition does not appear steps nothing.** Its hold is frozen rather than
> advanced: the confirmed band and its "since" are preserved, and no interval in which the
> condition was not read may confirm or reject a band on its behalf. §6.5 governs what such a
> condition displays.

**Consequence for `lib/conditions.ts`, not for the spec:** `observePoll` already *keeps* holds
and ledger entries for vanished ids ("a GPU that drops out of enumeration has not returned to
health") — that intent is right, and it is the reduction over `displayed` that contradicts it.
The fix belongs in `observePoll`'s result (a `displayed` that carries the retained conditions,
marked), not in `runtime.ts` reducing over two lists. Putting it anywhere else re-creates the
"two halves the caller has to wire together" mistake `conditions.ts`'s own header records.

---

## 1.2 F1, F2, F7 — what a gap means

### The ruling

All three are one defect. **A gap is a span during which the client was not sampling. It is not
an interval between two adjacent recorded events, and it must not be closed by the mere arrival
of a sample.**

Three consequences, and they settle all three findings:

**(a) A gap stays open while any reason to have one is still in force, and closes at the first
reading taken while none is.** Not "until a sample arrives". The predicate is
`!hidden && !paused && consecutiveFailures === 0`, evaluated at the moment the sample is
accepted.

I state it as *any* reason rather than *the reason that opened it*, and that is not pedantry —
it is a correctness fix for a case neither the build nor the adversarial reached. `openGap`
returns the existing gaps whenever the last one is open, so `pause()` → hide → `resume()`
leaves a gap whose recorded `reason` is `paused` while the reason actually in force is `hidden`.
A rule phrased as "the reason that opened it" would close that gap on resume, on a tab that is
still hidden. One predicate over all three reasons is total and has no such seam. `reason` stays
what it is — *why the gap began* — which is all a hatch legend needs; note that a gap beginning
`paused` and continuing `hidden` is labelled `paused`, and accept it.

**(b) A reading may land INSIDE a gap, and does not split it.** This falls out of (a) and has to
be said, or step 9 will guess. Three paths produce one: a poll in flight when the tab is hidden
(F1), a poll in flight when the operator pauses (F2), and `refreshNow()` while paused (F2, and
S37's blessed behaviour). The reading is real and belongs in the ring. It does not make the hour
around it observed. So the chart draws a point sitting inside a hatched band — which is not a
lie but the exact truth, and is more honest than either alternative (dropping a real reading, or
claiming an hour was sampled because one point in it was).

**(c) §6.4's ten seconds are ten seconds the client was SAMPLING.** §6.4 argues for wall time
over poll counts because "the same written rule would behave completely differently depending on
a dropdown", and it justifies the length with "comfortably inside the ~39 s thermal time
constant, so nothing real is missed at any cadence". Both arguments assume *readings across
those ten seconds*. A gap is neither wall time with polls nor a poll count — it is wall time
with **no** readings, which §6.4 never contemplated, and two samples an hour apart confirm
nothing.

Ruling: **a gap ends any pending run.** A band that has not yet confirmed restarts its ten
seconds at the first reading after the gap. A band that **had** confirmed is not disturbed — it
is the last thing actually measured, and §1.1's stale rule governs it from there.

I considered preserving the pre-gap accrued time and rejected it. Preserving lets 8 s of
evidence from an hour ago plus 2 s now confirm a band and — worse — date it to an hour ago,
which is F7's own complaint in miniature. Restarting costs at most one further hold period, is
one rule instead of two, and errs in the only safe direction: it can never confirm or date a
band across ground nobody measured.

And the corollary that is the user-visible half: **the banner's "when it started" may never name
an instant on the far side of a gap.**

### Exact wording

**§6.7 — replace the "Background tab" bullet:**

> - **Background tab:** pause polling on `document.hidden`, resume on visibility. The un-sampled
>   span is drawn with the same hatched "no reading" treatment a lost channel gets — the data
>   genuinely is absent, and it must not be interpolated across.
>   **A gap is a span the client was not sampling, and it stays open while any reason to have
>   one is still in force** — hidden, paused, or a run of failed polls — **not until the next
>   sample arrives.** It closes at the `ts` of the first reading taken while none of them is.
>   A poll already in flight when the tab is hidden, a poll already in flight when the operator
>   pauses, and a *refresh now* taken while paused all land **inside** the gap: the reading is
>   kept, and the gap is neither closed nor split, because one reading does not make the hour
>   around it observed. Without this an hour of hidden time is recorded as the five seconds
>   before the in-flight poll landed, and the chart draws a straight line across 3 600 s of
>   ground nobody measured — precisely what this bullet forbids.

**§6.4 — new paragraph, immediately after the "Debouncing" paragraph:**

> **⚠ Ten seconds of wall time means ten seconds the client was sampling.** A hidden tab, a
> paused dashboard and a run of failed polls are wall time with no readings behind them, and
> they must not advance a hold: one sample either side of an hour-long gap has confirmed
> nothing, and dating the band to the first of the two puts the banner's *when it started* an
> hour before the only other evidence for it. The mirror case is worse — a band that the
> intervening readings would have **rejected** is confirmed instead, because there were no
> intervening readings. **A gap (§6.7) therefore ends any pending run:** a band that has not yet
> confirmed restarts its ten seconds at the first reading after the gap, and **the banner's
> "when it started" may never name an instant on the far side of a gap.** A band that had
> already confirmed is not disturbed; §6.5's stale rule governs it from there.

---

## 1.3 F4, F5, F8, F11 — which clock governs what

Two clocks, and HANDOVER already has the sentence for this in another context: *"Wall clock for
the cookie, monotonic clock for the limiter, and they are not interchangeable."* Here they are
the **server's `ts`** (stamped once per poll at the poll's start, §4 — the only timestamp any
reading carries) and the **browser's `now`**. Five rules.

### R1 — everything that positions a reading in time uses the server's `ts`, and nothing else

The ring key, the x-axis, the **bounds of the rendering window**, the endpoints of a gap, and
the pruning horizon. These are all statements about *readings*, and a reading has only server
time. Mixing a browser clock in makes the window's extent depend on a quantity the data does not
carry.

**So the rendering window is anchored on the newest sample's `ts`, not on the browser's now:**
`[newestTs − windowMs, newestTs]`. This is F8's fix, and the argument for it is stronger than
"it degrades gracefully":

- **§6.5 already requires it.** Row 1: a failed poll must make "charts freeze rather than
  plotting zeros". Anchored on the browser's now, a stalled server scrolls the whole trace off
  the left edge into an empty chart — the "plotting nothing" failure of the same row. Anchored
  on `ts`, the trace freezes, which is what the row asks for, and the age indicator and `stale`
  mode do the job §6.2 built them for.
- It also fixes the small live case nobody has hit yet: a poll that legitimately takes longer
  than the cadence (§6.7 blesses a 6 s poll against a 5 s cadence) can put the newest sample a
  second outside a window that ought to contain it.

`closeGap`'s prune is the same bug and takes the same fix: the horizon is `newestTs −
LONGEST_WINDOW_MS`, not `nowMs − LONGEST_WINDOW_MS`. As written, a server two hours behind
prunes **every** closed gap on the first successful poll and all hatching disappears.

**One further clock mix I found that the adversarial did not:** `openGap` falls back to
`this.env.nowMs()` for `fromMs` when the ring is empty. A gap endpoint is a `ts`, and before the
first sample there is no `ts` — and nothing has been drawn, so there is nothing to hatch.
**No gap is opened before the first accepted sample.** That removes the fallback and the mix
together.

### R2 — everything that measures how current the page is compares the two

The age indicator, and it is the **only** legitimate mixing point, because comparing the two
clocks is its entire job. §4 already blesses the direction of its error.

It follows that the age indicator is where skew becomes visible, so it must not be allowed to
hide it: **a negative age must never render as a negative number.** That is F11's damaging half
and it is a one-line §6.6 rendering rule.

### R3 — everything that measures the duration of the SESSION uses the browser's `now`

§6.4's debounce, the event log's `atMs`, the banner's "since", and the bookkeeping about which
gap reason is in force. These are facts about the client, not about a reading. This is **S47's
answer**: a log line's timestamp and the reading it describes can differ by the skew, and that
is correct rather than a defect — the log records *transitions observed since page load* (§6.4),
which is an observation, not a measurement of the box.

Noted and not required: §6.4's ten seconds is exactly the kind of interval HANDOVER says wants a
monotonic clock, and `performance.now()` is not in the seam. A backward wall step only *delays*
a confirmation, and `stepBandHold` already restarts a pending run when `nowMs < pendingSinceMs`
— the safe direction. Record it; do not build it.

### R4 — `stale` is a function of AGE, not of the failure counter

This is F4's fix, and the formulation matters because a narrow one (count consecutive repeats)
covers one cause where a broad one covers three.

§6.7's dedupe rule — *"ignores a snapshot whose `ts` it already holds"* — is **correct** and must
not be weakened; it exists for §4's 2 s cache and the build implements it exactly. What §6.7 has
no rule for is a **run** of repeats. The two are distinguishable and the difference is the whole
of F4:

| | length of the run | what it is |
|---|---|---|
| §4's cache | bounded by the contract — "two or three times in a row" at 1 s, occasionally at 2 s, never at 5 s or slower | normal |
| a backwards server clock | unbounded, until real time catches up | a wedged or re-stamped server |

Rather than encode §4's cache constant in the client, use the number the page already computes:

> **`stale` is entered when the newest reading is older than the dashboard's own cadence can
> explain**, whatever the cause — the server is not answering, the server is answering with a
> `ts` the client already holds, or the server's clock is ahead of the browser's. Concretely:
> `consecutiveFailures > 0`, **or** the age exceeds three cadences (floored at 10 s), **or** the
> age is negative.

One rule, four causes, and it is a function of one number. It also covers F11's other half — a
`ts` in the future gives a negative age, which is not `live` by any reading.

**This partly unfreezes the page in F4's scenario**: `mode` moving `live → stale` is a state
change, so `patch()` notifies and the dashboard re-renders once at the crossing. It does not
make S41 go away — see §3.

And it earns one event-log line, on the same terms §6.7 already gives to a wedged collector
(*"a run of `skipped` entries is what a reader needs to see before reaching for the container"*):
one entry when the age crosses into `stale`, one when a fresh `ts` finally arrives.

### R5 — `latestSample()` is newest by `ts`, not newest by arrival

F5, and the argument is §6.4's own: *"a colour that disagreed with its own figure would be a
worse lie than a colour that flickers."* The build's §10 tells step 10 to colour every cell from
`latestSample`. If that returns the older of two samples while the chart's last point is the
newer, the figure and the trace disagree — which is the same defect as F6, arrived at from a
third direction. Every other consumer of the ring is already `ts`-ordered.

Under R4 the page is simultaneously in `stale`, so the operator is told the reading is not
current — but the **value** must still be the newest one measured. Cost: track the max `ts` on
append, so `newestSample` stays O(1). Not a spec matter.

**S36's eviction assumption should say what breaks**, which neither the build nor the
adversarial spelled out completely: arrival order = time order is what makes "oldest-first
eviction drops the temporally oldest sample" true. A backwards step breaks it, so an
evicted-then-repeated `ts` is re-appended out of order and eviction can drop a sample that is
not the oldest. `samplesWithin`'s sort keeps the *rendered* result correct, so the residue is
bounded and cosmetic at 8192 samples. Record it; do not fix it.

### Exact wording

**§6.7 — new bullet, immediately after the `ts`-dedupe bullet:**

> - **⚠ A repeated `ts` is normal; a RUN of them is not.** §4's cache produces two or three
>   repeats in a row at the 1 s cadence and occasionally at 2 s, and never at 5 s or slower — a
>   run bounded by the contract. A server whose wall clock steps backwards produces an unbounded
>   one, and every snapshot in it is a *different* reading wearing a timestamp the client
>   already holds, so each is correctly dropped and the page learns nothing while remaining, as
>   written today, green. **The mode is therefore a function of the age of the newest reading,
>   not of the failure counter:** the dashboard is `stale` when a poll has failed, **or** when
>   the newest reading is older than three cadences (at least 10 s), **or** when its `ts` is
>   ahead of the browser's clock. One event-log entry marks the crossing and one marks the
>   recovery. This is the same signal §6.7 already asks for from a run of *skipped* collector
>   entries: the only evidence a source is wedged rather than merely broken.

**§6.7 — new bullet, after the buffer bullet:**

> - **⚠ Which clock governs what.** A reading carries exactly one timestamp — the server's `ts`
>   (§4). **Everything that positions a reading in time uses it and nothing else:** the ring's
>   key, the x-axis, the bounds of the rendering window, a gap's endpoints, and the horizon past
>   which a gap is pruned. **Everything that measures the session uses the browser's clock:**
>   §6.4's ten-second hold, an event-log line's time, the banner's "since". **The age indicator
>   is the one place the two are compared, and that is its whole job.** Mixing them anywhere
>   else makes a rendering depend on a quantity the data does not carry: a rendering window
>   anchored on the browser's clock blanks every trace once the server's clock is behind by more
>   than the window, while the ring is full of good data and the header still reads `live`, and
>   a prune horizon anchored the same way deletes every hatched gap the moment the server is
>   two hours behind. **The rendering window is anchored on the newest sample's `ts`**, which is
>   also what makes §6.5's *"charts freeze rather than plotting zeros"* true: anchored on the
>   browser's clock, a stalled server scrolls its own trace off the axis into an empty chart.

**§6.6 — append to the `null` / zero rules:**

> - **A negative age never renders as a negative number.** `ts` ahead of the browser's clock is
>   clock skew, not a reading from the future; the age reads `0 s` and §6.7's `stale` mode says
>   the rest.

---

## 1.4 F6 — COOLING and SAFETY disagreeing

**The adversarial's sharper point is the right one and I am adopting it as the ruling.** The
defect is not that the two fields can disagree — it is that the client **asserts** they cannot,
inside the module whose entire existence is the refusal to trust the server. `observations.ts`
says *"O9 makes those two fields one D-Bus read written to both, so they cannot disagree"*, and
that is a value assertion where O10 forbids a type assertion, for the same reason: both are the
client believing something it is in a position to check.

I considered and rejected refusing the snapshot at the wire. A disagreement between two fields
would fail the **whole** poll and blank the entire dashboard over one bad string, which
contradicts §6.5's whole posture that partial truth beats no truth.

**Ruling: §9's dedupe must be severity-safe, and the reduction is the fix.**

> **§9 — amend the "One reading shown in two panels" row's Resolution:**
>
> | One reading shown in two panels | **One condition, counted once.** Deduplicate by condition id — and when two observations share an id, the condition takes the **worst** of their severities, with the value that carries it. "Counted once" fixes the count; it does not license *whichever copy is pushed first*. A dedupe that discarded an `alarm` in favour of a `normal` would put a red cell beside a green dot, which is the disagreement the row below exists to prevent, reached from the one direction it did not consider. **No client may rely on two fields of a snapshot agreeing; it may only reduce them in the safe direction** | `gpu-fan-control.service` appears in both COOLING and SAFETY; it is one fact about the machine and must not inflate the header count to two — nor deflate its severity to the first copy that happened to be projected |

`worstSeverity` already exists in `lib/severity.ts` and `aggregateSeverity` already uses it, so
this is the project's own reduction applied one level down.

Two things fall out and both are improvements. The push order in `conditionsFrom` **stops being
load-bearing**, so the adversarial's "no test pins it" complaint dissolves rather than needing a
test. And the build's justification for emitting twice — *"emitting from both panels is what
proves the dedupe is doing its job"* — becomes true for a stronger reason: the fixture now
proves the dedupe picks correctly, not merely that it counts once.

**Reporting the disagreement: SHOULD, not MUST.** It is a server defect and should be visible,
but there is no slot for it — §4 forbids a nineteenth `ErrorSource` and this is not a collector
error. One event-log line the first time the two disagree in a session fits the log's
facts-not-sentences shape and costs one entry. Not worth failing the step over.

---

## 1.5 F9 — `fetch` escapes all three guards

Real, and confirmed by reading `guardrails.test.ts`: the runtime guard wraps `setTimeout`,
`setInterval`, `setImmediate`, `queueMicrotask` and nothing else, while the text guard's `fetch`
clause is `(?<![.\w$])fetch\s*\(` — a call, not an identifier. `const go = fetch; go(...)` passes
all three, and so does the `/api/telemetry` path guard if the new module imports
`TELEMETRY_PATH`.

This is HANDOVER §5.3 note 4 exactly, and the note's own example list names `fetch` in the same
breath as `setInterval`. **MUST: wrap `globalThis.fetch` in the runtime guard.** Four lines.
**SHOULD: wrap `XMLHttpRequest` too** — it is the one other spelling of the same capability and
it is what a copy-pasted snippet reaches for.

**And the finding underneath the finding, which matters more.** build.md's guard table says the
runtime guard catches "**any spelling at all**" and is blind only to "a path the fixture never
walks". That is a documentation claim that names a property the test does not check — HANDOVER's
do-not-copy #3, in its documentation variant, and the third occurrence in this step's paperwork
(see §3.5). The table must say: *blind to any global it does not wrap, and to a path the fixture
never walks.*

---

# Part 2 — S34

## Confirmed, and the recommended channel is right — with one reason strengthened and one rejected reason corrected

The adversarial's three-way verification is sound and I add nothing to it: `parseSnapshot`
returns nine keys and drops an extra `standing`; §4 has three endpoints and there is no other;
the constructor default is `parseStandingIds(null)` and nothing outside tests overrides it. The
mechanism is fully built, fully fixtured, and unreachable. **It is the safe direction, and it
means §6.4's suppression will not work the day it is next needed** — which, given §6.3's note
that `ufw_enforcing = no` "is not this box's state today", is the day something regresses.

**A field on §4's snapshot: confirmed.** It is the one authenticated, cached, validated,
per-poll payload; the validator already exists; §4's 2 s cache makes it free on the box; and an
operator who edits `/etc/ai-dashboard.env` and restarts sees it without a reload path being
invented.

**The server-shell prop is rejected for a stronger reason than the adversarial gives.** The
adversarial cites the revoked-cookie asymmetry and the reload cost. The sharper objection is
what the value *is*: `STANDING` is the list of alarms the operator has chosen to silence — a
statement about the box's known-bad state. §5 permits a revoked cookie to fetch the HTML shell
**"only while that shell carries no telemetry and no secrets"**, and HANDOVER §6 item 10 makes
keeping it so a step-8 obligation. Putting `STANDING` there does not merely inconvenience the
reload path; it hands operational intelligence to an unauthenticated caller. Rejected on
security, not on ergonomics.

The other two rejections stand as written: a fourth route contradicts §4's "Three endpoints. That
is the whole server", and a build-time constant contradicts §6.4's reason for putting it in the
env file.

**One correction to the adversarial's recommendation.** It proposes treating a missing key
leniently by implication. Do not. `parseSnapshot`'s stated rule — *"a missing key is not a `null`
reading; it is a server that does not implement this contract"* — is worth more than tolerance
for a version skew that cannot occur, because server and client ship in one image. Making
`standing` the one optional key would establish exactly the ambiguity §4's validator was written
to have none of.

**Confirm the mid-session question in the affirmative**, as the adversarial suggests: it rides
the snapshot, so it is per-poll state, not a constructor option. Two consequences neither phase
flagged: §6.4's *"reported as unknown at startup"* must lose the word *startup*, and
`loggedStanding` must **not** be reset when the list changes — a condition that gains standing
mid-session logs its once-per-session line from then on, and one that loses it returns to full
alarm behaviour, which is already §6.4's rule for a standing condition that changes.

## Exact §4 wording

**In the JSON example, after `"hostname"`:**

```jsonc
  "standing": ["ufw_enforcing", "unit:llama-server@1.service"],
```

**New paragraph, immediately after the `errors` paragraph:**

> **`standing` is configuration, not a reading, and it is the only such field.** §6.4 puts the
> list in `/etc/ai-dashboard.env` and applies the suppression in the browser, and the snapshot
> is the only authenticated, validated, per-poll payload that reaches the browser — so the list
> rides it rather than earning a fourth endpoint. It is **echoed verbatim and never parsed
> server-side**: the ids are validated in the client, by the same code that would have read the
> file, so §6.4's *"an id that matches no kind is reported as unknown"* stays a client-side fact
> and one malformed entry cannot fail a poll. Unset `STANDING` sends `[]` — the safe direction,
> since a missing list can only ever make the dashboard **louder**. **The key is required, like
> every other key in this contract**: server and client ship in one image, so there is no
> version skew for an optional key to absorb, and *which keys are optional* is precisely the
> ambiguity this contract has none of. **It is never rendered on the server-side shell** — §5
> leaves `/` reachable with a revoked cookie, and the list of alarms an operator has chosen to
> silence is not something to hand an unauthenticated caller. A change takes effect on the next
> poll; nothing has to be reloaded.

**§6.4 — in the last rule of "Condition ids", strike one word:**

> An id that matches no kind is reported as unknown ~~at startup~~. Silence is not acceptable for
> a mechanism whose whole job is suppressing alarms.

## Ownership — and a warning about it

The adversarial assigns S34 to step 10. That is half right. The field spans two steps and, left
unsplit, it ships dead:

- **step 11** owns the server half — `/etc/ai-dashboard.env`'s `STANDING` reaching the route.
- **step 10** owns the client half — reading it off the snapshot per poll and rendering
  `unknownStanding`, which becomes reachable for the first time.
- **step 12** verifies that an operator edit takes effect on the box.

**And it belongs on HANDOVER §4.1's silent-failure list beside O20/O21.** A standing list that is
configured, looks configured, and is silently ignored is precisely that shape — the same shape as
`ufw`'s `is-active` on a disabled firewall, which is the incident this whole repo is written
around.

---

# Part 3 — adjudication

## 3.1 The four low findings

| # | Verdict | Reasoning |
|---|---|---|
| **F10** — `ch5Pwm` out of range accepted | **Take, narrowed. SHOULD** | `{manual, 999}` and `{manual, 12.7}` are unreachable from this server: `dell-smm.ts` range-checks against `pwmStateName`'s own 0–255 and sends `unreadable` → `ch5Mode: null` → `unavailable`, which matches §6.7. So this is an **O10 posture** defect, not a live bug — and posture is what O10 is entirely about. `manual` asserts *the duty is a reading*; §6.6 says "a duty that is not a reading leaves the **MODE** undetermined". An out-of-range or non-integer duty is not a reading, so `{manual, 999}` is contract-impossible in exactly the way `{manual, null}` already is — the case `wire.ts` calls "the validation a cast could never do". Fix: `Number.isInteger(duty) && 0 ≤ duty ≤ 255` in `coolingOf`, refusing the snapshot as every other field does. Fixture symmetry (§5.1): 0/−1, 255/256, 12/12.7. **The `12.7` row is the one that earns the change** — today it renders `OFF pwm 13`, an integer the machine never reported |
| **F11** — future `ts` | **Take the rendering half (SHOULD); the rest is subsumed** | The negative age is a one-line §6.6 rule (see §1.3). The poisoned dedupe key is covered by R4's third clause: a negative age is not `live`. Nothing on this box produces a future `ts`, but it is the *same* clock event as F4 and F8, and one signal should cover all three |
| **F12** — `refreshNow()` polls while hidden | **Take. SHOULD** | The build documents the `force` bypass, and a hidden tab cannot receive a click — so the only caller is programmatic, which is exactly what step 10 will write. Two costs now that were not costs before: a forced poll that fails while hidden leaves `stale` on a tab nobody is looking at, and under §1.2's ruling it takes a reading **inside a hidden gap**, a state that is now defined but odd. Guard on `hidden` only. **`refreshNow()` while paused must keep working** — that is S37, a real operator action, and it is correct |
| **F13** — `Date.parse` rolls `2026-02-30` forward | **Take, and take the better fix. SHOULD** | The defect as filed is a comment that over-claims (do-not-copy #3 again). But the honest fix is cheaper than correcting the prose: a round-trip check, `new Date(tsMs).toISOString() === ts`, is exact, one line, and rejects every impossible date rather than the two the regex happens to catch. If declined, the comment **must** be corrected — a sample placed two days from where it says it is, on the axis that is the whole point of §6.7's "against time, not index", is not a documentation nit |

## 3.2 S34–S48

| # | Build's answer | My adjudication |
|---|---|---|
| **S34** | reported, defaulted safe | **Confirmed dead. Take the snapshot field.** See Part 2. Owner split 10/11/12, and it belongs on the silent-failure list |
| **S35** | doubling to the cap | **Sound. No change.** The adversarial's measured divergence (from the 4th failure, only below an 8 s cadence, nowhere at 10 s or 30 s) confirms the build's claim exactly. Record the divergence point in HANDOVER so it is not re-litigated |
| **S36** | dedupe is §6.7's rule; sort keeps the axis | **Under-resolved. Rewrite** per R1–R5. It answers one of three consequences and the two it skips are the damaging ones. The eviction assumption must name what breaks (§1.3) |
| **S37** | polls, does not resume | **Sound**, and add the F2 consequence: under §1.2 it no longer closes the paused gap, which is what it always intended |
| **S38** | polls immediately on becoming visible | **Sound**, and add the undocumented case: with a poll already in flight the immediate poll is skipped by the `inFlight` guard. Harmless here — but it is the same code path as F1, so the note must say *why* it is harmless once F1 is fixed |
| **S39** | facts not sentences; `watch` when a source is lost | **Sound.** Keep the tone. F3's ruling means it stops being the *only* signal that a panel's alarms went away, which is the right outcome — a `watch` collector line was never load-bearing enough to carry a lost alarm |
| **S40** | reported; logging appearance is a possible answer | **Real, correctly reported, and only partly answered by F3's ruling.** F3 gives *disappearance* a defined treatment; S40's own case is different — `fan5 EC auto → HIGH` is a *mode* change with no §6.3 row behind it, so no condition exists to hang it on and O12 forbids inventing one. The clean answer is that **§6.4's event log has a third feed**: snapshot state fields that carry no §6.3 band but whose value is drawn from a closed vocabulary. `ch5Mode` is the one §6.4 names by example. The machinery exists (`stepBandHold` over a rendered value, as `VALUE_IS_A_BAND` rows already use). **Take as a spec clarification; defer the code to step 10** |
| **S41** | `ageMs` is pure; step 10 drives its own tick | **Real, and the adversarial sharpens it correctly.** Under R4 the store *does* change once, at the `live → stale` crossing — so a store-driven tick is not entirely dead, which is worse than dead, because it will look like it works. **The tick must be an independent interval**, and the note must say so in those words |
| **S42** | the browser's `now` | **Wrong choice, and its failure mode was missing.** Overruled by R1: anchor on the newest `ts`. The build's justification ("matching the assumption the age indicator already makes") conflates positioning a reading with measuring its age; R2 keeps the age indicator exactly as it is |
| **S43** | decimal integer strings | **Sound.** Nothing outside the browser observes the encoding, the parse is exact, the fallback is silent as §6.7 requires. The `P5` re-aim was the right response to an inert table |
| **S44** | labels follow `MOCK.html`; values through `lib/format.ts` | **Sound**, and routing every value through `lib/format.ts` is the right instinct — it is where invariant 1 is tested |
| **S45** *(adversarial)* | — | **Real. Ruling: per SERIES.** §6.7's justification is about a spike surviving *its own* trace; a per-chart budget would make GPU 0's resolution depend on how many other series happen to be drawn — the same "one written rule behaving differently depending on a dropdown" failure §6.4 rejects for the debounce. §6.2's stacked chart draws up to 1 800 points, which at 1280 px is sub-pixel spacing per series and costs nothing. **One sentence in §6.7: "600 points per series, not per chart."** |
| **S46** *(adversarial)* | — | **Real. Answered** by §1.2's ruling |
| **S47** *(adversarial)* | — | **Real. Answered** by R3: both are the browser's clock, because both timestamp an *observation*, not a reading — §6.4's log is explicitly "transitions observed since page load". The disagreement with the age indicator under skew is a feature, and one more reason the skew must be visible |
| **S48** *(adversarial)* | — | **Real. Answered** by R4 |
| **S32** *(inherited)* | build did not mention it | **The adversarial is right that the build should have said something, and wrong about what.** S32 asks what the login screen does while it cannot reach the dashboard. §5.2's sixth row now says it: *"**The screen never retries on its own**: submit stays enabled and the operator decides, since an automatic retry against a dead container is indistinguishable from a scripted guess and would spend §5's global budget."* That is a complete answer. **S32 is CLOSED by the current `SPEC.md`, not re-owned.** HANDOVER §8 warns its own table "has been stale twice"; this is the third time, and it is worth noting that the staleness is always in the same direction — the spec moved and the table did not |

## 3.3 Part B, C and E

**Part B — attacked and found sound.** I accept all of it. The `ts` dedupe, the ring at the cap
(9000 polls returning 7201 points from a ring that has evicted 808), cadence and window changes
mid-session, decimation across every awkward spike position, the backoff sweep, the timer
analysis, the 401's precedence over a failure state, `parseSnapshot`'s rejection set, `__proto__`,
`-0` end to end, the event log's cap and its 10 s boundary fixtured on both sides. That is a
thorough attack on the right surfaces and it found the build correct.

**Part C.** C1 (a throw after the `await` wedges the client) is a real structural exposure with
no reachable trigger; extending the `try` to the whole poll body is one edit and I would take it
— **SHOULD** — because the failure it prevents is the one §6.2's age indicator provably cannot
describe, which is the build's own argument for the catch it already has. C2 is real and
important; see §3.5. C3 and C4 are correct characterisations that belong in the notes, not
fixes: only a bucket's extremes survive, and bucket boundaries shift on every append so a third
of the polyline moves each poll — step 9 must know both before it decides a spike is a rendering
bug. **C5 is a real composition defect** and I promote it; see §3.4. C6 is narrow but the rule
should be *chosen* rather than inherited from array order; see §3.5.

**Part E — the five dropped ⚠ marks.** All five adjudications are correct. The
`writeOption`/`readOption` argument is the sharpest — with the `null` guard removed,
`null.getItem` throws a `TypeError` **inside the `try`** that §6.7 mandates, which returns the
same fallback, so the two implementations are behaviourally identical and no behavioural
mutation can exist. That is HANDOVER's *"every catch added for a never-throw rule removes a
distinction"* found by the ledger rather than by hindsight, and dropping the ⚠ was right. The
adversarial's closing point is also right: **the property that is unguarded in this step is not
on that list — it is `use-telemetry.ts`.**

---

# Part 4 — my own findings

## 4.1 Eleven modules: weight, not ceremony

The only candidate for ceremony is `backoff.ts` — 54 lines for one pure function. It stays: it
is the sole place §6.7's "1×, 2×, 4×, capped at 30 s" is written, it carries the
`setTimeout`-clamps-`NaN`-to-1 ms reasoning, and it is swept against every cadence × failure
count to `MAX_SAFE_INTEGER`. Folding it into `runtime.ts` would bury a sweepable pure function
inside a class. `ring.ts` and `series.ts` look adjacent and are not — one owns the dedupe and
the cap and is tested by identity assertions, the other owns decimation and is tested by
spike-survival fixtures.

Eleven is the right number for a step that owns eight independent §6.7 bullets, and the
practical test passes: the module boundaries line up with the harness's mutation targets, so a
mutation lands in one file and reddens tests in that file's suite.

## 4.2 `runtime.ts` is holding roughly one module too much — and it is exactly the part the fixes touch

491 lines, one class, eight responsibilities: the store, the lifecycle, four §6.2 controls,
visibility, timers, the poll, the 401, and the gaps.

**The gaps do not belong.** `openGap`/`closeGap` are pure functions of
`(gaps, reason, atMs, nowMs, hidden, paused, failures)` that happen to read `this.state`, and
they are precisely what F1, F2, R1's prune fix and the no-gap-before-the-first-sample fix all
change. A `lib/client/gaps.ts` would give that change a test file with fixture symmetry on "is a
reason still in force", would turn "a sample inside a gap does not close it" into a table test
instead of an end-to-end runtime fixture, and would remove the one place where a mutation has to
travel through the whole poll loop to be observed. **SHOULD, and in the same change as F1/F2** —
the alignment between the refactor and the fix is fortunate and should be spent.

**The mode is the second candidate.** `modeOf(expired, paused, failures)` is called from five
sites and under R4 gains an age term, which means it needs the newest sample. A `modeOf(state,
nowMs)` in its own module makes R4 one testable function rather than five call sites drifting.
**SHOULD.**

Everything else — the store, the lifecycle, the timers, the poll — is genuinely one object's
business and splitting it would add indirection without adding a test.

## 4.3 Will steps 9 and 10 compose without adapters? Mostly — four places where they will not

**(a) `conditionsFrom` is exported un-deduped, and §10 points panels at it.** C5, promoted. The
build's surface note says *"O11 — if a panel needs conditions, it is this one"* with no warning
that it emits `unit:gpu-fan-control.service` twice. A panel that maps it to rows renders the fan
service twice and counts two alarms for one fault — the outcome §9 forbids by name. Under §1.4's
ruling the deduped, worst-wins result is the only sane panel input anyway. **MUST: change the
guidance to say `state.displayed` is the panel surface and `conditionsFrom` is internal.** A
panel does not need pre-debounce conditions at all — §6.4 says a cell's colour comes from
`lib/severity.ts` on the raw reading, not from a condition.

**(b) There is no selector for "the `errors[]` entries that explain this panel's em dashes."**
§6.5's rule, and S11/G5's narrowed case, both need one. `conditionSource` already maps
`ConditionKind → panel`, but the mapping needed is `ErrorSource → panel`, so step 9 or 10 will
write a **second** mapping — and a second mapping of a join that already exists is second on
HANDOVER's do-not-copy list. **Flag it now:** one `errorsForPanel(snapshot, panel)` beside
`conditionSource`, written once, in step 9.

**(c) `samplesWithin` → `seriesFrom` → `decimateSeries` is a three-call incantation each panel
repeats, and the order is silently load-bearing.** Decimating before windowing spends the point
budget on data that is not drawn and produces a chart that is subtly wrong rather than obviously
broken. A single `traceFor(state, pick)` closes it. **SHOULD, step 9.**

**(d) `state` is `null` until the first client render**, correctly documented — but that is nine
`if (state === null)` branches or one wrapper. Write the wrapper once in step 10's assembly.

**One composition fact nobody should over-read:** `patch()` compares only the keys in the patch,
and `observeEvents` returns a fresh object on every accepted poll (`{...state, …}`) even when
nothing was logged. So `accept()` always notifies. That is correct — a new sample *is* a change
— but it means the identity optimisation covers **repeats only**, not steady state. Step 10
should not build memoisation on the assumption that a quiet poll is free.

## 4.4 `unknownStanding` is dead state, conditionally

It is on `RuntimeState`, is always `[]` in production (S34), and nothing renders it. That is
HANDOVER's do-not-copy #9 — *"a parser that is tested, exported and unused"* — in its
state-shaped form. It is justified **if and only if** S34 closes. If step 10 or 11 does not close
it, `unknownStanding` should come off `RuntimeState` rather than sit there implying a mechanism
that cannot fire. Record the condition with the field.

## 4.5 The globals-wrapping guard depends on a Vitest setting the tool itself is advising against

`guardrails.test.ts:112` patches `globalThis.setTimeout` and friends for the duration of a
session and asserts zero calls. It restores in a `finally` — correct — but the **measurement**
is only meaningful if no other test file executes in the same worker while it runs. Vitest's
default is one file per worker, and `vitest.config.mts` sets no `pool` or `isolate`, so it holds
today.

It is not hypothetical that it might not. This run's own reporter says:

```
Isolate  54 workers spawned · ~82ms startup each
         at least ~408ms faster with isolate: false — reuses workers across files
```

`isolate: false` is exactly the setting step 11 will be tempted by when it starts caring about
image and CI time, and it would silently turn this guard from "the runtime reached no scheduler"
into "no file that happened to share this worker reached a scheduler" — a guard that still
passes, still looks green, and no longer measures its own property. **Record it in the test's own
comment and in HANDOVER's toolchain section**, in the same family as "do not run a harness
concurrently with `verify`". Do not fix it; the correct fix is a note, because the failure is a
future configuration change, not present code.

## 4.6 Three documentation claims in `build.md` that must not reach HANDOVER as written

All three are HANDOVER's do-not-copy #3 — *a test that names a property it does not check* — in
its documentation variant, which is a species this project has not yet named and should.

1. **"runtime — catches any spelling at all"** (§7's guard table). It wraps four names; `fetch`
   is not one (F9). Correct to: *any spelling of a global it wraps*.
2. **"The exemptions are `env.ts` … and `fake-env.ts`, both explicit."** The globals text guard
   has a **third**: `use-telemetry.ts` (`guardrails.test.ts:99`). It is real and necessary — the
   hook must reach `window` — but it is undocumented, and it exempts the one file in this step
   with no test. C2, confirmed by reading. Name it in the table and in the guard's own comment,
   the way `env.ts` is named.
3. **"check `git status` and check whether a harness is still alive before believing it"** (§9's
   harness lesson). `git status` cannot do this here; see Part 5.

## 4.7 The `errors[]` message that reaches the log is chosen by array order

C6, promoted from narrow to worth-a-decision. `observeEvents` keeps the **first** message per
source. §6.7 makes the `errors[]` message text carry its single most operationally important
distinction — *skipped* versus *failed*, "the only signal that a source is wedged rather than
merely broken" — and §4 contemplates a collector filing an entry per source *plus* the assembly's
ceiling entry. So the signal an operator needs before "reaching for the container" is currently
selected by whichever entry the assembler happened to append first.

The collectors do not do it today, so this is not a bug. It is a rule nobody chose. **Pick one
and write it down** — I would keep the **last**, since an assembly-level ceiling entry is
appended after a collector's own — or join them. Either is fine; inheriting array order is not.

---

# Part 5 — the process finding

**The adversarial is right, and it is the most useful thing in Part F.** `dashboard/` is
untracked, so `git status --short` collapses the tree to `?? ./` and would not show a mutated
source file at all. A harness killed mid-mutation leaves the file mutated on disk — the `finally`
that restores it never runs — and git says nothing. The build's operational warning is therefore
wrong in this repo, and it is wrong in the exact circumstance it was written for.

**Does this argue for committing before step 9? Yes — and the decision is the owner's, not a
phase's.** `CLAUDE.md` says *"Commit only when asked"*, and that is binding on me. So this is a
recommendation with its reasoning, not an action.

The case for, stated as the owner would want it:

- Steps 9 and 10 are the largest remaining code steps and will run the most harness cycles
  against the most files. The exposure grows from here, not shrinks.
- A commit turns revert integrity from a procedure somebody has to remember into
  `git status --short` — one command, four more times.
- It makes a killed harness recoverable with `git checkout --` rather than "restore from a
  manifest you hopefully remembered to take first".
- HANDOVER already carries *"A commit point before step 11"* as open work with owner "owner".
  Moving it two steps earlier costs nothing and removes a class of corruption that is
  **undetectable**, which is the property that makes it worth more than tidiness.
- This repo's own standing rule has a sibling worth writing down: *writing the config is not
  evidence it took* — and **not being able to see a change is not evidence there was not one.**

**Until then, the pipeline's revert check is a checksum manifest, and it should be written into
HANDOVER as the standing procedure rather than re-derived per phase:**

```bash
cd dashboard
find lib app proxy.ts -type f | sort | xargs md5 > /tmp/manifest-before.txt   # 119 files today
# … run harnesses / probes, strictly serially …
find lib app proxy.ts -type f | sort | xargs md5 | diff /tmp/manifest-before.txt - \
  && echo "TREE IDENTICAL TO BASELINE"
```

**One addition the adversarial did not make: take it before the phase begins and diff after
*every* harness, not only at the end.** A mid-run kill is precisely the moment you cannot tell
which of six harnesses left the file dirty, and a single end-of-phase diff tells you that
something moved without telling you what to restore.

**And a SHOULD for whoever next edits a `regressions.py`:** have the harness assert its own
manifest at exit. It already knows every file it touched.

---

# Part 6 — what must not leak into steps 9 and 10

1. **A cell's colour is not `displayed`.** §6.4 is explicit and it survives every ruling above: a
   cell calls `lib/severity.ts` on the current reading. Nothing debounced is a cell colour.
2. **Do not read `conditionsFrom` in a panel.** It is un-deduped by design (§4.3a). `state.displayed`
   is the panel surface.
3. **Do not infer gaps from holes in a series.** Hatch `state.gaps`; they carry real endpoints and
   survive decimation, and after §1.2 they carry the *right* endpoints.
4. **Do not tick the age off store changes.** S41 plus F4: under R4 the store changes exactly once
   at the `live → stale` crossing, which is worse than never, because a store-driven tick will
   appear to work. The tick is an independent interval.
5. **Do not render `0 alarms`, and do not render a negative age.**
6. **Do not put `standing` — or anything else off the snapshot — on the server-rendered shell.**
   §5's revoked-cookie asymmetry is the standing condition under which the whole gate design was
   accepted.
7. **Do not add a second spelling of `/api/telemetry`, `/login`, `/api/session`, or either unit
   name.** The guards walk the tree, so adding a file does not escape them — that is the point,
   and it is the rule step 6 paid for.
8. **Do not "fix" a red-cell/green-dot disagreement in a panel.** It is fixed once, at the
   reduction (§1.4). A panel that patches it locally makes two places that must agree.
9. **Do not assume `latestSample` and the chart's last point are the same sample** unless R5
   lands — and once it lands, do not re-derive it.
10. **Do not add a per-chart decimation budget.** S45: 600 per series.
11. **Do not read `rawSeverity`, compare severities, or hold a band outside `lib/conditions.ts`.**
    O1, and the build honours it exactly; it is the easiest thing to undo by accident in a panel.
12. **Do not treat `state === null` as missing data.** It is *before the first poll*.

---

# MUST / SHOULD / DEFER / NOT-DOING

## MUST — step 8 is not done until these land

| # | What | Where |
|---|---|---|
| **M1** | **F3.** A condition whose subject disappears is **stale** (kept in the reduction, last severity, frozen hold, logged) or **retired** (dropped, logged), decided by whether its collection was readable. §9's reduction runs over the session's confirmed conditions, not this poll's | spec §9, §6.5, §6.4 — wording in §1.1; code in `lib/conditions.ts` (`observePoll`'s `displayed`), not in `runtime.ts` |
| **M2** | **F1 + F2.** A gap stays open while **any** reason is in force and closes at the first reading taken while none is. A reading may land inside a gap and does not split it | spec §6.7 — wording in §1.2; code in the extracted `gaps.ts` (S1) |
| **M3** | **F7.** §6.4's ten seconds are ten seconds the client was **sampling**. A gap ends any pending run; a confirmed band is undisturbed; "when it started" may never name an instant across a gap | spec §6.4 — wording in §1.2 |
| **M4** | **F8 + S42.** The rendering window and the gap-prune horizon are anchored on the newest sample's **`ts`**, never on the browser's clock. Which clock governs what is written down (R1–R3) | spec §6.7 — wording in §1.3 |
| **M5** | **F4 + S48.** `stale` is a function of the newest reading's **age** (failure, or age > 3 cadences floored at 10 s, or negative age), not of the failure counter alone. One log line at the crossing, one at recovery | spec §6.7 — wording in §1.3 |
| **M6** | **F5.** `latestSample()` is newest by **`ts`** | code; no spec change |
| **M7** | **F6.** §9's id dedupe takes the **worst** severity among colliding observations, not the first. The client may never rely on two snapshot fields agreeing | spec §9 — wording in §1.4 |
| **M8** | **F9.** The runtime guard wraps `globalThis.fetch`. build.md's "any spelling at all" is corrected | `lib/client/guardrails.test.ts`, build notes |
| **M9** | **S34.** `standing: string[]` on §4's snapshot, required, echoed verbatim, never on the shell; `standing` becomes per-poll state; §6.4 loses "at startup". Owner split 10/11/12 and it goes on §4.1's silent-failure list | spec §4, §6.4 — wording in Part 2 |
| **M10** | **Three documentation corrections** so they do not enter HANDOVER as fact: the guard table's "any spelling at all"; the third guard exemption (`use-telemetry.ts`); and the `git status` advice | build.md §7, §9 |
| **M11** | **`conditionsFrom` is not a panel surface.** Change the step-8 surface note to say so | build.md §10 |
| **M12** | **The manifest procedure** written into HANDOVER as the standing revert check, taken before the phase and diffed after **every** harness | HANDOVER |

## SHOULD — take unless something else breaks

| # | What |
|---|---|
| **S1** | Extract `lib/client/gaps.ts` in the same change as M2 — the fix and the refactor are the same code (§4.2) |
| **S2** | Extract `modeOf(state, nowMs)` alongside M5 (§4.2) |
| **S3** | **F10.** `coolingOf` requires an integer duty in 0–255 for `manual`; fixtures at 0/−1, 255/256, 12/12.7 |
| **S4** | **F13.** Round-trip the `ts`: `new Date(tsMs).toISOString() === ts`. If declined, correct the comment |
| **S5** | **F12.** `refreshNow()` is a no-op while `hidden`; it keeps working while `paused` |
| **S6** | **F11 rendering half.** A negative age never renders as a negative number (§6.6 wording in §1.3) |
| **S7** | **C1.** Extend `poll()`'s `try` to the whole body — the wedge it prevents is the failure §6.2's age indicator provably cannot describe |
| **S8** | **S45.** One sentence in §6.7: 600 rendered points **per series**, not per chart |
| **S9** | **F6 reporting half.** One event-log line the first time COOLING and SAFETY disagree in a session |
| **S10** | **§4.5.** Note in `guardrails.test.ts` and HANDOVER that the runtime globals guard assumes file-level worker isolation, and that `isolate: false` — which Vitest's own reporter recommends on every run — would silently void it |
| **S11** | **§4.7 / C6.** Choose and document which `errors[]` message reaches the log when a source files more than one; do not inherit array order |
| **S12** | Record C3 and C4 in the notes: only a bucket's extremes survive, and bucket boundaries shift on every append so ~⅓ of the polyline moves each poll |
| **S13** | Record the ledger's five dropped ⚠ marks, S35's measured divergence point, and R3's monotonic-clock note in HANDOVER so none is re-litigated |
| **S14** | Recommend to the owner a **commit point before step 9** rather than before step 11, with revert integrity as the stated reason (Part 5) |

## DEFER — to a named step

| # | What | Owner |
|---|---|---|
| **D1** | **S40.** §6.4's event log gains a third feed — state fields with a closed vocabulary and no §6.3 band (`ch5Mode`). Spec clarification now; code later | **step 10** |
| **D2** | **S41.** The age tick is an **independent** interval, not driven off store changes | **step 10** |
| **D3** | `unknownStanding` is rendered, or removed from `RuntimeState` if S34's server half does not land | **step 10**, conditional on **step 11** |
| **D4** | `errorsForPanel(snapshot, panel)` written once, beside `conditionSource` (§4.3b) | **step 9** |
| **D5** | `traceFor(state, pick)` so no panel spells the window→series→decimate order itself (§4.3c) | **step 9** |
| **D6** | jsdom, and the first assertion it buys: unmounting `useTelemetry` calls `stop()` (C2 — the one untested, un-text-guarded file in the step) | **step 9 or 10**, whichever first needs an interaction test |
| **D7** | S11/G5, S19, S30 — inherited and untouched by step 8 | **steps 9, 10** |
| **D8** | The `STANDING` env plumbing, and its place on §4.1's silent-failure list | **step 11**, verified **step 12** |

## EXPLICITLY NOT DOING

- **Not weakening §6.7's `ts` dedupe.** It is correct, it exists for §4's cache, and F4 is about
  a *run* of repeats, not about the rule. M5 adds a bound; it changes no dedupe.
- **Not refusing a snapshot whose COOLING and SAFETY unit states disagree.** Blanking the whole
  dashboard over one mismatched string contradicts §6.5's posture that partial truth beats no
  truth. M7 reduces in the safe direction instead.
- **Not expiring a stale condition on a timer.** An expiry is a clock that silently turns an
  alarm green — F3 reintroduced with a `setTimeout`. Visibility of the reading's age is the
  bound.
- **Not preserving pre-gap accrued hold time.** Restarting is one rule instead of two and cannot
  date a band to the far side of ground nobody measured (§1.2).
- **Not adding jsdom in step 8.** The build's three reasons hold and `client.test-d.ts` watches
  the one drift risk. D6 records what would change it.
- **Not adding a fourth endpoint, a build-time constant, or a server-shell prop for `STANDING`.**
  Part 2 gives the reason for each, and the shell rejection is on **security**, not ergonomics.
- **Not committing, staging or touching git.** `CLAUDE.md` says commit only when asked. S14 is a
  recommendation to the owner.
- **Not re-running the 128-mutation harness.** The adversarial ran it, reported `128/128` with a
  clean ledger, and re-verified the manifest. A second copy of that result would buy nothing and
  would put a mutating process on disk.
- **Not editing any source, test, config or spec file.** Manifest verified identical, before and
  after; `SPEC.md` and `HANDOVER.md` md5s unchanged.
