# Handoff — 12a, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-15.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12a-test.md` and `steps/12-deploy/12a-build.md` (**your subjects**),
`handoffs/12a-visible-failure.md`, **`SPEC.md` §6.2's ⚠⚠ 2026-09-14 ruling, §9's aggregate, §6.1**,
`INSTALL-SPEC.md` §11.4, `HANDOVER.md` §0.14, §5, §8, `ANCHOR.md` §4/§5/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 12a's test phase, on `4a2f47a`.
⚠ **The box is LIVE** — serving inference on 8080/8081 and the dashboard on 8090. Read it if you
must; **write nothing to it**.

## 1. Verified by the parent

`pnpm verify` exit 0, **106 files, 3455 tests**. `shellcheck` clean. The `serve-llm.sh`
dry-run-restarts-a-live-dashboard fix is real and in the tree, with its reasoning.

## 2. ⚠ Your best target is the thing that made this phase possible

**The test phase fixed the browser harness with a preload shim** — `secret-file-shim.cjs`, injected
via `NODE_OPTIONS=--require` into the spawned dev server only, faking one `statSync`/`readFileSync`
of the credentials path. It ran the measurements for the first time since 2026-09-10 and added two
records (15d and 16).

**A test harness that fakes the thing under test is exactly how a measurement starts lying**, and
this project has now had two measurements pass vacuously. So:

1. **Can the shim make something pass that should fail?** Does it leak into the *production* code
   path, into `pnpm verify`, into a build, or into any process other than the spawned server? Does
   its absence actually fail loudly, or does the harness quietly fall back to something weaker?
2. **Are 15d and 16 falsifiable?** Break each deliberately and confirm it goes red — a takeover
   branch that renders nothing, a header that wraps, a `gpus: []` page that scrolls.
3. **Measurement 16 grades the first takeover branch ever measured in a browser.** What does it
   NOT cover — `gpus: null`, a card absent with siblings present, a takeover with a long message?

## 3. The rest, in order

4. **`check_container_gpu_access` has had an eighth arm found** (a marker with no exit status
   scored a green tick). **Find the ninth.** Try: the marker printed twice; a marker from a
   *different* container; `docker` present but the daemon down; a container whose name is a prefix
   of another's; `nvidia-smi` succeeding while listing zero GPUs.
5. ⚠ **`12a-Q10` — `.status[data-mode=…]` in `header.module.css` can never match, so §6.2's
   paused/stale hatch has NEVER painted.** Confirm it independently and find how long it has been
   so. **Then look for siblings**: any other selector in any module that cannot match what the
   component emits. `dangling-css-class.test.ts` sees a class with no rule; this is the mirror —
   a rule no element can satisfy — and nothing looks for it.
6. **§9 row 1 defines the dot as one reduction over each condition's `displaySeverity`**, which the
   painted dot no longer is. The test phase says the choice is right and the *wording* is the
   parent's. **Check whether anything else in the tree still relies on the old definition.**
7. **`aggregateStatus`'s recovery path** was a structural blind spot (every fixture held a
   one-sample ring). Find the other structural blind spots in the new sweeps — what can a
   `0…18 × 4 × 4` crossing not express?
8. **One-line reverts of the 12a diff that keep everything green.** The last four loops found 6, 3,
   8 and 49. Include the shim, both new measurements, and the guard rows.

## 4. Rules

- **Fix nothing.** Findings `12a-A1…`, most severe first, each with a scenario, severity, file:line
  and how proven ("measured" / "reasoned, not run"). Scratch work in
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness. No `.env`; never print a secret.
- Do not edit `SPEC.md`, `MOCK.html` or `INSTALL-SPEC.md`. Do not deploy.

## 5. Deliverable

`steps/12-deploy/12a-adversarial.md`: findings first; then what held; then what you could not
verify and why. Short summary back. The parent will not read your transcript.
