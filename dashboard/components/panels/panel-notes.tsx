/**
 * §6.5's *"its `errors` entry is available"* half, for the messages a panel has no single row
 * to hang them on.
 *
 * ### Why this exists (10b-reconcile, adversarial F5)
 *
 * `lib/client/observations.ts` splits §3.7's eighteen sources across panels **by the figure
 * each one blanks** — `coretemp`/`proc-stat`/`proc-loadavg`/`proc-cpuinfo` → CPU,
 * `proc-meminfo` → MEMORY, `statvfs`/`proc-net-dev`/`net-operstate` → STORAGE — and its own doc
 * says `collectHost` files nine sources for one crash *"precisely so this split is possible"*.
 * It was built for a consumer that then did not consume it: 10b's first draft never called
 * `errorsForPanel` from CPU or MEMORY at all, and STORAGE rendered only `net-operstate`. Eight
 * of the eighteen sources had **no rendering path to the screen**: `/proc/meminfo` failing gave
 * `RAM — / —` with nothing beside it anywhere on the page, which is precisely the unexplained
 * em dash §6.5 exists to forbid and §3.7 calls *"not actionable"*.
 *
 * ### Once per source, not once per figure
 *
 * `errorsForPanel`'s own doc settles the granularity: *"a source can blank several figures on
 * one panel — `dell-smm` blanks five channels and the mode — and §3.7's granularity is per
 * source, not per figure."* So a source that blanks exactly one row is rendered **on that
 * row** (`Row`/`StatusRow`'s own `note`/`detail`), and a source that blanks several is rendered
 * **once** here, under the rows it explains — matching COOLING's existing choice to attach its
 * one `dell-smm` entry once rather than repeat it beside five fans. One fact, stated once.
 *
 * Renders nothing at all for an empty list: `[]` from `errorsForPanel` means "no entry explains
 * this panel", which is knowledge, and knowledge renders as silence rather than as an empty
 * element with a stray separator.
 *
 * ### ⚠ 10f/Q1 — the block is a BOUNDED scroll box, and that is what keeps §6.1's promise
 *
 * Owner's ruling 2026-09-09 (`SPEC.md` §6.1, the last ⚠ paragraph): *"the promise is
 * unconditional on telemetry, and each panel's notes block (`PanelNotes`, and a `StatusRow`'s
 * `detail`) becomes a fixed-height scroll box in the same way the session event log is — the
 * messages stay whole and readable by scrolling within the panel, and the grid never grows."*
 * Nothing capped this before, so a page on which every collector had failed missed the fold by
 * **27 px at 1280×1024 and 49 px at 1600×1024** — and with §6.4's banner pinned by **92 and
 * 115 px** (measured, `10f-build.md` §1). The text is the collector's own (S-H), so a long
 * message simply wrapped: this box's documented DKMS failure is 152 characters and costs
 * **65.6 px** in a 285 px column against §2.11's 14.2 px budget.
 *
 * The well is `panel-notes.module.css`'s: `overflow-y: auto` inside a `max-height`,
 * `box-sizing: border-box`, a `--surface-sunken` ground — and **`position: relative`**, which
 * is not decoration: every `Chip` in this tree renders a `position: absolute` `.sr-only` span,
 * and a scroll container clips an absolutely-positioned descendant only when it is in that
 * descendant's containing-block chain (10e-A1, measured — `.panel { position: relative }` does
 * NOT close it). `components/styles.test.ts` now carries both halves as directory-wide rules.
 *
 * ### `bound` — the height is a PER-PANEL decision, and the default is the safe one
 *
 * §6.1's spare height is not shared evenly. A panel's growth costs the page only when its
 * grid row is the tallest, so at 1280 the four cells in rows 2–3 divide as: CPU + SAFETY is
 * the governing column (216.1 + 9 + 160 = 385.1 against COOLING's 384.5 intrinsic), while
 * MEMORY + STORAGE sits 94 px below it and COOLING has 0.6 px of its own. `'tight'` is one
 * message line (18 px); `'roomy'` is 60 px — ⚠ **three message lines and part of a fourth**,
 * not four: a line is 13.77 px and the block's own `gap` is 3 px, so four need 68.1. Measured
 * by 10f's test phase; see `panel-notes.module.css` for why 60 is kept rather than raised.
 * GPU, CPU and SERVING take `'tight'` because each costs the
 * page 1:1 (GPU sets row 1; CPU shares the governing column; SERVING is 26 px under the log
 * that sets row 4). COOLING, MEMORY and STORAGE take `'roomy'` because their growth is
 * absorbed by the governing column and costs the page nothing. The full arithmetic is in
 * `pipeline/steps/10-panels-assembly/10f-build.md` §2.
 *
 * ⚠ The default is `'tight'`, so a call site that forgets the prop is bounded at the SMALLER
 * height. A forgotten prop must never be the one that breaks the promise.
 *
 * ### Why the well is keyboard-reachable
 *
 * A scroll box no one can scroll hides its content, and §3.7's whole reason for the message is
 * that *"an alarm with no explanation beside it is not actionable"*. So the well is a named
 * `role="group"` with `tabIndex={0}` — the same shape the session event log's own bounded well
 * already uses. ⚠ `group`, not a bare `aria-label` on a role-less `<div>`: ARIA prohibits the
 * attribute on the `generic` role, which 10e-A8 found shipped and doing nothing.
 *
 * ### ⚠ `subject` — the name must be DIFFERENT in every well (10f-A6, measured)
 *
 * 10f first shipped a constant `aria-label="collector messages"`. Measured on the
 * all-collectors-failed page at 1280: **seven** wells announced those same three words — GPU 0,
 * GPU 1, COOLING, CPU, MEMORY, SERVING and STORAGE (twice, the panel block and the link block,
 * adjacent in the same panel) — out of 25 tab stops, on the page an operator only reaches
 * *because* something is wrong. `PanelShell` renders a `<section>` with no accessible name of
 * its own, so a `<section>` maps to `generic` and gives the well no surrounding context to
 * disambiguate it: the well's own name is the whole of what is announced.
 *
 * So the name is `` `${subject} messages` `` and `subject` is **required** — a defaulted one
 * would let a new call site re-create the collision silently (HANDOVER §0.8: an optional prop is
 * an untested one). Every caller passes copy that is already on the screen: its `PanelShell`
 * title (`cooling`, `GPU 0`, `cpu`, `memory`, `serving`, `storage & network`) or, for STORAGE's
 * second well, the `Caption` label the block sits under (`link`). ⚠ Nothing here is invented
 * wording beyond the word `messages` itself, which build silence #2 already records as a region
 * name rather than a message: the messages are the collector's own and are never rewritten.
 */

import type { TelemetryError } from '@/lib/types';

import styles from './panel-notes.module.css';

/** How tall the bounded well may grow before it scrolls — see the module doc. */
export type PanelNotesBound = 'tight' | 'roomy';

export interface PanelNotesProps {
  /** Already filtered by `errorsForPanel` and, where a row took one, by source. */
  readonly messages: readonly TelemetryError[];
  /**
   * What this well is the messages OF — the panel's own title, or the caption label a second
   * well in one panel sits under. Announced as `` `${subject} messages` ``. ⚠ Required, not
   * defaulted: see the module doc (10f-A6).
   */
  readonly subject: string;
  /** Q1's per-panel height. Defaults to `'tight'`, the smaller of the two. */
  readonly bound?: PanelNotesBound;
}

export function PanelNotes({ messages, subject, bound = 'tight' }: PanelNotesProps) {
  if (messages.length === 0) return null;
  return (
    <div
      className={styles.notes}
      data-bound={bound}
      role="group"
      tabIndex={0}
      aria-label={`${subject} messages`}
    >
      {messages.map((e) => (
        <p key={`${e.source}:${e.message}`} className={styles.note}>
          {e.message}
        </p>
      ))}
    </div>
  );
}
