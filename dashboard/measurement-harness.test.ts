/**
 * ⚠⚠ 12a/RECONCILE — **the browser measurement harnesses, and the one file in the tree that
 * can see them.** (`12a-A9`, and `12a-A1`/`A3`/`A4`'s fixes.)
 *
 * The adversarial's coverage finding, in one sentence: *"`measure-breakpoints.mjs`,
 * `mocks/measure-arrangements.mjs` and `secret-file-shim.cjs` appear in NO harness's
 * `LEDGER_FILES` and in no mutation in any of the ten `regressions.py` — so every browser
 * record can be weakened at will."* Seven of its eleven one-line reverts live in those three
 * files, including deleting the shim's loud refusal and turning measurement 16's bound
 * assertion vacuous (`>= 1` → `>= 0`), and every one of them stayed green.
 *
 * ### Why a SOURCE-TEXT guard is the right shape here, and what it cannot do
 *
 * The same argument `packaging.test.ts` makes for `dashboard.sh`: these files are not
 * TypeScript, nothing else in the suite imports them, and running them takes a real Chrome,
 * a spawned `next dev` and four minutes — which is why they are run by hand, once a loop, and
 * why a weakening inside them survives `pnpm verify` indefinitely. A text assertion cannot
 * prove a record measures the right thing; what it CAN do is make the removal of a named
 * conjunct a red test instead of a silent loss, and the step-10 harness's mutations are the
 * evidence that it does (`12a-MH1`…`12a-MH11` and `12a-CSS1` — each deletes one term and this file reddens).
 *
 * The shim's own properties are tested BEHAVIOURALLY rather than by text — it is a plain
 * `.cjs` preload, so a real `node --require` answers the question directly and there is no
 * reason to accept a proxy for it.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const STEP10 = join(projectRoot, 'pipeline/steps/10-panels-assembly');
const read = (abs: string): string => readFileSync(abs, 'utf8');

const BREAKPOINTS = join(STEP10, 'measure-breakpoints.mjs');
const ARRANGEMENTS = join(STEP10, 'mocks/measure-arrangements.mjs');
const SHIM = join(STEP10, 'secret-file-shim.cjs');
const SERVER_LOG = join(STEP10, 'server-log.mjs');

// ---------------------------------------------------------------------------------------
// The shim — behaviourally, in a real node process
// ---------------------------------------------------------------------------------------

/** Run `node --require <shim> -e <code>` and return `{ status, out }`. */
const withShim = (
  code: string,
  env: Readonly<Record<string, string>>,
): { status: number; out: string } => {
  try {
    const out = execFileSync(process.execPath, ['--require', SHIM, '-e', code], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

const CREDENTIALS = {
  MEASURE_PASSWORD_HASH: 'scrypt.15.8.1.aabb.ccdd',
  MEASURE_SESSION_SECRET: 'deadbeef'.repeat(8),
};

describe('⚠⚠ 12a — the harness credential shim refuses loudly rather than falling through', () => {
  test('⚠ with neither variable set the preload THROWS, and names both variables', () => {
    // ⚠ `12a-A9` #1, and the one that matters most on that list: this is the property the
    // shim's header spends a paragraph on, and it was guarded by nothing. A shim that
    // silently did nothing would leave the spawned server answering 401 to the harness's own
    // password — the exact failure that went unnoticed for four days, because `pnpm verify`
    // does not run the browser harnesses.
    const { status, out } = withShim('console.log("REACHED")', {
      MEASURE_PASSWORD_HASH: '',
      MEASURE_SESSION_SECRET: '',
    });
    expect(status).not.toBe(0);
    expect(out).not.toContain('REACHED');
    expect(out).toContain('MEASURE_PASSWORD_HASH and MEASURE_SESSION_SECRET must both be set');
  });

  test('⚠ ONE variable is as fatal as none — a half-configured harness cannot log in either', () => {
    const { status } = withShim('console.log("REACHED")', {
      ...CREDENTIALS,
      MEASURE_SESSION_SECRET: '',
    });
    expect(status).not.toBe(0);
  });

  test('⚠ with both set it fakes exactly the two calls §5.1’s reader makes, and nothing else', () => {
    // The bound the shim's header claims, measured rather than asserted: the secrets file
    // reads back as the two lines `dashboard.sh configure` writes, an unrelated read still
    // reaches the real filesystem, and a missing path still throws ENOENT.
    const { status, out } = withShim(
      [
        'const fs = require("node:fs");',
        'const file = fs.readFileSync("/etc/ai-dashboard.env", "utf8");',
        'const stat = fs.statSync("/etc/ai-dashboard.env");',
        'let enoent = "no";',
        'try { fs.readFileSync("/etc/definitely-not-here"); } catch (e) { enoent = e.code; }',
        'console.log(JSON.stringify({',
        '  file, isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size,',
        '  real: fs.readFileSync("package.json", "utf8").includes("ai-dashboard"), enoent,',
        '}));',
      ].join('\n'),
      CREDENTIALS,
    );
    expect(status).toBe(0);
    const seen = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(seen['file']).toBe(
      `PASSWORD_HASH=${CREDENTIALS.MEASURE_PASSWORD_HASH}\nSESSION_SECRET=${CREDENTIALS.MEASURE_SESSION_SECRET}\n`,
    );
    expect(seen['isFile']).toBe(true);
    // ⚠ `12a-A9` #2: every `fakeStat` field but `isFile` could be deleted and nothing noticed,
    // because `secrets.ts` calls only `.isFile()`. The fake stands in for a real `Stats` — a
    // caller that asks it anything else must get an answer, not `undefined is not a function`.
    expect(seen['isDirectory']).toBe(false);
    expect(seen['size']).toBeGreaterThan(0);
    // The two halves of "an INPUT is faked, not the filesystem".
    expect(seen['real']).toBe(true);
    expect(seen['enoent']).toBe('ENOENT');
  });

  test('⚠ the path it fakes is TIED to lib/auth/secret-file.ts, not retyped beside it', () => {
    // ⚠ `12a-A4`. Three files carry this literal — `secret-file.ts` (the server's own),
    // `dashboard.sh`'s `ENV_FILE`, and the shim — and nothing tied them: `packaging.test.ts`
    // overrides `ENV_FILE` with a temp path in every one of its cases. If §5.1's path moves,
    // the shim stops intercepting and every browser measurement dies with `12a-A3`'s
    // misleading timeout — the drift reproduces the outage the shim exists to end.
    const server = read(join(projectRoot, 'lib/auth/secret-file.ts'));
    const declared = /export const SECRET_ENV_FILE = '([^']+)'/.exec(server);
    expect(declared, 'lib/auth/secret-file.ts no longer declares SECRET_ENV_FILE').not.toBeNull();
    const path = (declared as RegExpExecArray)[1];
    expect(read(SHIM)).toContain(`const SECRET_ENV_FILE = '${path}';`);
    // dashboard.sh's third copy, while all three are in one place to compare.
    expect(read(join(projectRoot, 'dashboard.sh'))).toContain(`ENV_FILE="\${ENV_FILE:-${path}}"`);
    // And the shim refuses to start at all if that agreement ever stops holding.
    expect(read(SHIM)).toContain('no longer assigns');
  });
});

// ---------------------------------------------------------------------------------------
// The harness terms — each one a conjunct whose removal is silent
// ---------------------------------------------------------------------------------------

interface Term {
  /** The file the term lives in. */
  readonly file: string;
  /** Exact source text that must be present. */
  readonly text: string;
  /** What is lost if it goes — this is the sentence a FAIL line should send you to read. */
  readonly why: string;
  /**
   * ⚠⚠ HOW MANY TIMES, and this field exists because the guard was MEASURED FAILING without
   * it. `12a-A9`'s sweep was re-run against this file the moment it was written: items 6 and 7
   * — the roomy-well term going vacuous, and dropping `gpu1Takeover` — **still survived**,
   * because measurements 16 and 18 assert the identical six conjuncts and a whole-file
   * `toContain` found the surviving copy. A guard that reads a file rather than a record
   * cannot see one of two identical lines removed. Default 1; state it wherever a term is
   * carried by more than one record.
   */
  readonly count?: number;
}

const TERMS: readonly Term[] = [
  // ---- 12a-A1's fix: a PASS prints what it measured ------------------------------------
  {
    file: BREAKPOINTS,
    text: 'if (!printed && detail !== null && detail !== undefined) {',
    why: "the printer goes back to a WHITELIST of detail shapes, and any record whose detail is not one of the eight prints a bare PASS — which is how 12a's own standing figures came to exist only in a failing run",
  },
  // ---- 12a-A3's fix: the spawned server's own words -------------------------------------
  {
    file: BREAKPOINTS,
    text: "import { attachServerLog, waitWithServerOutput } from './server-log.mjs';",
    why: "the spawned `next dev`'s stdout/stderr go back to being piped and never read: a startup failure names the PORT again instead of the cause, and a chatty server can fill the pipe and hang the run",
  },
  {
    file: ARRANGEMENTS,
    text: "import { attachServerLog, waitWithServerOutput } from '../server-log.mjs';",
    why: 'the same, in the density/arrangement harness — the two scripts failed identically and must be diagnosed identically',
  },
  {
    file: SERVER_LOG,
    text: 'if (lines.length > MAX_LINES) lines.shift();',
    why: 'the drain becomes unbounded, which trades a hang for a leak on a server that logs forever',
  },
  // ---- record 15d (12a-A9 #3, #4, #5) ----------------------------------------------------
  {
    file: BREAKPOINTS,
    text: 'oneRow: rects.length > 1 &&',
    why: 'the one-row metric passes on a header with a single painting child — `max(top) < min(bottom)` over one rect is trivially true, so the record would certify a header it could not see',
  },
  {
    file: BREAKPOINTS,
    text: "statusLine.dotSeverity === 'alarm' &&",
    why: "record 15 silently drops 12a-Q2's painted half: a red dashboard could grey its dot out under eighteen unread sources and nothing in a browser would notice",
  },
  {
    file: BREAKPOINTS,
    text: 'calibration.headerHeight > statusLine.headerHeight',
    why: 'the in-run calibration keeps only its one-sided term, so a header that can no longer wrap AT ALL (a `max-width`, a truncation) still reports PASS — the record stops being able to go red for the reason it exists',
  },
  // ---- measurement 16 and 17 (12a-A9 #6, #7, and 12a-A7) ---------------------------------
  {
    file: BREAKPOINTS,
    text: 'present.gpu0RoomyWells === 1 &&',
    count: 2, // measurements 16 and 18 — both takeover branches
    why: 'the bound assertion becomes vacuous: `>= 0` passes on a page with no bounded well at all, and `>= 1` passes on one with a second unbounded block beside it',
  },
  {
    file: BREAKPOINTS,
    text: 'present.gpu1Takeover &&',
    count: 3, // measurements 16, 17 and 18 — every takeover branch
    why: 'measurement 16 stops being a claim about BOTH cards — a page where only gpu0 took the branch would pass it',
  },
  {
    file: BREAKPOINTS,
    text: "fabrication.mode = 'no-gpus';",
    why: 'the `gpus: null` takeover goes back to being rendered by no fixture in either harness — the last branch of GpuPanel no browser has seen',
  },
  {
    file: BREAKPOINTS,
    text: 'present.gpu1ReasonInWell &&',
    count: 3, // measurements 16, 17 and 18 — every takeover branch
    why: 'measurement 16 stops being a claim about BOTH cards, and stops being a claim about CONTAINMENT — co-presence of a message and a well anywhere in the slot is the 10f/Q1 defect this branch exists to close',
  },
  {
    file: BREAKPOINTS,
    text: 'takeoverNoTallerThanCard',
    count: 4, // declared, both halves of the conjunction, and carried into the record's detail
    why: "measurement 17 stops measuring the only thing the `roomy` bound's own comment argues — that the takeover fits inside the row the enumerated card sets",
  },
  {
    file: BREAKPOINTS,
    text: "fabrication.mode = 'retired-mixed';",
    why: 'the mixed page is never rendered, and measurement 17 grades the retired page twice — the branch `gpu-panel.tsx` argues about goes back to being unmeasured',
  },
  // ---- measurements 19 and 20 (12b) -------------------------------------------------------
  {
    file: BREAKPOINTS,
    text: "fabrication.mode = 'declared';",
    why: 'the page the box becomes on its NEXT REBUILD is never rendered — every other fixture here sends no `gpus` at all, so the whole harness would go back to grading only the pre-12b rendering',
  },
  {
    file: BREAKPOINTS,
    text: "fabrication.mode = 'split';",
    why: 'SPLIT MODE goes back to being drawn by no fixture in either harness — the arrangement §6.2 inverted the join FOR, and the one carrying the longest served-by label on the row that sets §6.1’s first term',
  },
  {
    file: BREAKPOINTS,
    text: 'present.gpu0NotBlank && present.gpu1NotBlank',
    why: '§6.2’s "an em dash there would be a lie" stops being measured — and it is the failure a fit measurement cannot see, because a blank strip makes the page SHORTER rather than taller',
  },
  {
    file: BREAKPOINTS,
    text: "gpu0Says: textOf('gpu0').includes(gpu0Phrase),",
    why: 'measurements 19 and 20 lose their precondition: a fixture that failed to take renders §3.4’s fallback, and every remaining term would then grade the page this loop did NOT change',
  },
  {
    file: BREAKPOINTS,
    text: "servingSays: textOf('serving').includes(servingPhrase),",
    why: 'the SERVING half of §6.2’s ruling — "one row per process, naming the cards it spans" — stops being graded, leaving only the GPU cards measured',
  },
  // ---- measurement 21 (12b-RECONCILE) -----------------------------------------------------
  {
    file: BREAKPOINTS,
    text: "fabrication.mode = 'cross-pinned';",
    why: 'the one browser page whose rendering can tell the two joins APART is never drawn — measurement 19 is the box\u2019s own arrangement, where naming a card from `gpus`, from the instance number or from the row\u2019s position all render the same page, so the browser record would go back to grading the coincidence 12b replaced',
  },
  {
    file: BREAKPOINTS,
    text: 'present.gpu0Lacks && present.gpu1Lacks',
    why: 'measurement 21 stops checking that each card carries the model of the instance that LISTS it — the right label with the WRONG model beside it is \u00a76.2\u2019s own complaint, and asserting that the label is present does not exclude it',
  },
  // ---- the login itself (12a-A9 #11) ------------------------------------------------------
  {
    file: BREAKPOINTS,
    text: "NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require ${SECRET_FILE_SHIM}`]",
    why: "an operator's own NODE_OPTIONS is discarded rather than preserved, which is invisible on a machine that has none set and breaks the run on one that does",
  },
];

describe('⚠⚠ 12a — the browser harnesses’ load-bearing terms, which nothing else in the suite can see', () => {
  test('every file this guard reads exists and is non-trivial — the population, before the terms', () => {
    // Anti-vacuity: a renamed harness would otherwise make every `toContain` below fail for
    // one reason while reading as twelve separate findings.
    for (const file of [BREAKPOINTS, ARRANGEMENTS, SHIM, SERVER_LOG]) {
      expect(read(file).length, file).toBeGreaterThan(500);
    }
    expect(TERMS.length).toBeGreaterThanOrEqual(12);
  });

  // ⚠ The `%s` is LAST: a leading placeholder leaves this mark's ledger key as the marker alone,
  // which matches every ⚠ FAIL line and scores itself covered (10g-A7). ⚠⚠ And the comment is
  // ABOVE the call rather than between `(` and the name — the ⚠-scanner reads the first string
  // literal after the argument list and does not skip comments, so a comment there makes the
  // mark invisible to the ledger entirely.
  test.each(TERMS.map((t) => [t.file.slice(projectRoot.length + 1), t] as const))(
    '⚠ the harness keeps the term it is graded on — %s',
    (_label, term) => {
      // ⚠ EXACTLY, not "at least". Measured: with `>=` and a count one short, `12a-A9`'s item
      // 7 still survived — three records carry that conjunct, the sweep removed one, and two
      // remained. An exact count is the only form in which this guard can see one of several
      // identical lines go, and it makes adding a fourth takeover record a deliberate edit
      // here rather than a silent loosening.
      const want = term.count ?? 1;
      const found = read(term.file).split(term.text).length - 1;
      expect(found, `${term.text}\n  ${term.why}`).toBe(want);
    },
  );

  test('⚠ the shim is reachable from no production module', () => {
    // The shim's bound, stated as a property of the TREE rather than of the shim: if anything
    // under `lib/`, `app/`, `components/` or `proxy.ts` ever names it, it has stopped being
    // harness-only and the reasoning in `12a-Q4`'s candidate (a) no longer holds.
    //
    // ⚠ `grep` exits 1 on no match, which is the PASSING case here — so the status is read
    // rather than allowed to throw, and a grep that failed for any other reason is a failure
    // of this test rather than a silent empty list.
    const found = spawnSync(
      'grep',
      ['-rl', 'secret-file-shim', 'lib', 'app', 'components', 'proxy.ts'],
      { cwd: projectRoot, encoding: 'utf8' },
    );
    expect([0, 1], `grep failed: ${found.stderr}`).toContain(found.status);
    const offenders = (found.stdout ?? '').split('\n').filter((l) => l !== '');
    expect(offenders).toEqual([]);
  });
});
