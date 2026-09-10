# Step 11 — BUILD: packaging

**Written 2026-09-10.** Branch `dashboard-frontend`, on top of `3f152b0`. Nothing committed;
nothing staged.

`pnpm verify` **exit 0 — 102 files, 3085 tests** (was 101 / 3061: this step adds one test
file and 24 tests). `shellcheck dashboard.sh` **clean** at 0.11.0.
`python3 pipeline/steps/11-packaging/regressions.py` **exit 0 — 37 mutations, all bit, 24 of
24 ⚠ tests reddened, zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`.**

## 0. What was written

| file | lines | what it is |
|---|---:|---|
| `dashboard.sh` | 1566 | the install/operate script. 13 subcommands, all with `--dry-run` |
| `Dockerfile` | 105 | two stages, `node:24-slim` both |
| `.dockerignore` | 67 | the build context, measured at 130 files / 1216 KiB |
| `systemd/ai-dashboard.service` | 100 | the unit — copied into place, never generated |
| `README.md` | 116 | build, deploy, credentials, **and the browser-defaults requirement** |
| `packaging.test.ts` | 593 | the cross-checks and the artefact guards — 24 ⚠ tests |
| `pipeline/steps/11-packaging/regressions.py` | 592 | 37 mutations + the shared red-test ledger |

**No dependency was added** (invariant 6). Runtime dependencies are still exactly `next`,
`react`, `react-dom`, and `packaging.test.ts` fails if a fourth ever appears.

---

## 1. `dashboard.sh`

Repo conventions throughout: `set -euo pipefail`, `bold`/`info`/`ok`/`warn`/`die`, `usage()`
re-reading its own header comment through `sed`, `run()` printing `would run:` under
`--dry-run`, one `trap cleanup EXIT INT TERM`.

**Subcommands.** INSTALL-SPEC §1 lists nine; this ships **thirteen**. The four extra —
`configure`, `unit`, `firewall`, `start` — are §0's own named install steps, and §0 says
*"every one of those is refusable"*. A step an operator may refuse is a step they must be
able to run on its own; `install` calls exactly these functions in exactly §0's order, so
there is one implementation of each, not two.

### Things that are deliberate, and would look arbitrary otherwise

- **`SRC` is the script's own directory, not `~/ai-dashboard-src`.** ⚠ `$HOME` is not stable
  across `sudo` — Ubuntu resets it to `/root` — and this repo has already paid for that
  once, when `dell-smm-5fan.sh` reported "no rebuilt module" for a module it had just built.
  `dashboard.sh` ships *inside* the rsync'd tree, so `dirname "$0"` resolves to
  `~/ai-dashboard-src` in the documented flow and to something true in every other one.
  Overridable with `SRC=`, which is what the test suite does.
- **`export LC_ALL=C`.** ⚠ `[[:space:]]` is locale-defined. Measured 2026-09-10: under the
  ambient UTF-8 locale on this Mac, U+00A0 matches it; under glibc it depends on the locale
  data. `trim` decides whether a `STANDING` entry is empty and where its kind ends, so
  without this the same env file is judged differently on the box and on the machine that
  tests it — and the check whose whole job is to notice a mistyped id would be the thing
  that varied. Under `C` it is exactly the ASCII set, everywhere, which makes the script
  **stricter** than JavaScript's `.trim()`. That direction is pinned by a test.
- **`preflight` runs once per invocation.** `install` calls it with the union of every
  step's requirements; the steps it then calls find it done. Without the guard, one
  `install --dry-run` printed the same preflight block five times, which is how a review
  surface becomes something nobody reads to the end.
- **`refuse`, not `die`, in preflight.** Under `--dry-run` a refusal is printed as
  `✗ WOULD REFUSE:` and the run continues, so one review shows *all* the problems rather
  than the first. ⚠ It still **exits non-zero** at the end — a dry run that printed a
  refusal and exited 0 would be a green tick over a failure, the exact shape of
  `systemctl is-active ufw` reading green on a disabled firewall.
- **`ok_done` is silent under `--dry-run`.** A `✓ … written` line after a write that did not
  happen is the one thing a review surface must never print.
- **`check` has three states, not two.** 0 all rows pass · 1 a row FAILED · **2 nothing
  failed but a row could not be evaluated**. INSTALL-SPEC §1 says check needs no root "for
  most" rows, and the rows that do need it (`ufw status`, `docker`, reading a 0600 file) are
  precisely the rows whose silence is dangerous. A row nobody could evaluate is not a row
  that passed. `install` runs as root and therefore has no unknown rows, so its gate is
  unaffected.
- **`restart` proves it restarted.** It compares the container id before and after and fails
  if it did not change. FIRST-DEPLOY §5.1: the standalone server renames its own process to
  `next-server (v16.3.4)`, so a restart matching on `node server.js` silently no-ops — "a
  `dashboard.sh restart` that reports success and changes nothing" is named there as this
  repo's most-repeated failure mode.
- **Nothing is ever printed that a credential could be recovered from.** `set-password`
  prints a length, `status` prints key *names*, `check` prints field positions and lengths.
  A mutation (`11-H8`) proves a rejection message cannot start quoting the field it rejected.

### The pipefail and `set -e` traps this script actively avoids

- ⚠ No `cmd | grep -q`. `report_ordering_cycles` captures `journalctl` output through a
  plain `grep` that reads to the end, so there is no SIGPIPE for `pipefail` to trip over.
- ⚠ `condition_rule` uses a **here-string**, not a pipe: `awk … exit` on the read end of a
  pipe SIGPIPEs the writer and turns a successful lookup into a failed command.
- ⚠ The `EXIT` trap reads only globals (`TMP`, `PW1`, `PW2`). A cleanup registered on `EXIT`
  fires after the enclosing function has returned, so a `local` is out of scope and `set -u`
  kills the handler — turning a successful run into exit 1 (`probe_cleanup`, 2026-08-15).
- ⚠ No `A && B` as the last statement of a function: measured here, an AND-list whose left
  side is false returns 1, the function returns 1, and the caller's `set -e` exits. Two such
  lines were written and both were converted to `if`.
- ⚠ `STANDING` is split by reading lines, not by `for entry in $raw` with `IFS=,`: an
  unquoted expansion is subject to **pathname** expansion, so an entry containing `*` would
  be replaced by whatever files are in the working directory.

---

## 2. How each silent-failure obligation is made loud

The three rules `dashboard.sh` has to judge in bash all have a canonical spelling in
TypeScript, and all three fail silently when the two drift. This project has shipped that
shape once — two base64url decoders, so 1 tag in 16 had four accepted spellings — and the
rule on the do-not-copy list is *never a second implementation of a canonical format*.

**So they are held equal by measurement, exactly as `scripts/hash-password.py` is.**
`packaging.test.ts` **sources the real `dashboard.sh`** (under `DASHBOARD_SH_LIB=1`, the one
hook that stops it running `main`) and asserts its verdict equals the TypeScript's on every
fixture. A test that reimplemented the rules to compare against would be a third
implementation and would prove nothing.

### O20 — the hash format

`scrypt_hash_error` implements `parseScryptHash`'s grammar: six dot-separated fields, the
tag `scrypt`, three decimal integers inside `LIMITS`, and two base64url fields.

⚠ **The trailing character classes are the part that is easy to get wrong and impossible to
notice.** `decodeExact` re-encodes what it decoded and compares, so it accepts only the
**canonical** spelling. An unpadded base64url field whose length is not a multiple of 4 ends
on a character carrying unused low bits: 16 bytes is 21 characters plus one carrying 2
significant bits (`[AQgw]`), 32 bytes is 42 plus one carrying 4 (`[AEIMQUYcgkosw048]`). Four
spellings per salt and sixteen per key decode to the identical bytes and are refused by the
server. A validator that checked only the alphabet and the length would approve a hash the
server then rejects — a `check` that passes on a dashboard that will not open.

The fixture table carries both sides of every bound (`logN` 0/20/21, `r` 32/33, salt and key
one byte short, canonical vs non-canonical tails, the standard alphabet, padding, five
fields, seven fields, an argon2id hash in two spellings) and asserts **agreement**, not a
hand-written expectation. `11-H1`…`11-H8` are eight ways to break it.

`set-password` re-checks the producer's own output before writing it, and an argon2id value
is named as such rather than reported as a shape problem.

### O21 — Docker's `--env-file` grammar

`env_value_error` refuses a value containing a quote, a `$`, a line break, or leading or
trailing whitespace, and `env_set` refuses to *write* one. `check` applies it to **every
line of the file**, including one hazard INSTALL-SPEC does not mention: a line with **no
`=`** is not a syntax error to Docker, it means *take this variable from the host
environment* — which is almost always empty, and denies every login with nothing logged.

⚠ The measurement that says why this check must exist at all is a test:
`readAuthConfig({ SESSION_SECRET: '"…32 a's…"' })` returns a config — the server **cannot**
see the defect, because a quoted 32-character secret is a working 34-character secret until
someone rewrites the file unquoted.

### O22 — one process, one cache

Three mechanisms, failing in different directions on purpose, and then a check that asks:

| | |
|---|---|
| `--name ai-dashboard` | Docker refuses a second container with that name |
| `--network host` on a fixed 8090 | a second listener cannot bind — `EADDRINUSE` |
| `ExecStartPre=-docker rm -f` + `ExecStopPost=` | a stale container cannot block a restart or become the second instance |

`check` counts: containers named `ai-dashboard` (must be 1), **other** containers running
`ai-dashboard:latest` (must be none — this is the case the name does not cover), processes
inside it via `docker top` (must be 1), and listeners on 8090 via `ss` (must be 1).

### D8 — `STANDING`

`configure` writes `STANDING=` when the key is absent and **never** overwrites one that is
present. `check` judges every entry against §6.4's four rules and says loudly that a
change needs a **restart**, not a poll.

⚠ **The vocabulary is read out of `lib/conditions.ts` at check time**, by a `sed` over
`CONDITION_KIND_RULES` — fifteen kinds and two flags each. Retyping them would be a
fifteen-row copy that goes stale the first time a kind is added; a test asserts the script
does not contain the kind names, and `11-S6` proves that test can fail. The `sed` is POSIX
BRE (no `\|` alternation) because the same function is exercised on macOS, whose `sed` is
BSD's.

---

## 3. `systemd/ai-dashboard.service` — the three traps

**It is a file, not a generated string.** `dashboard.sh unit` copies it with
`install -m 0644 -o root -g root`. The `docker run` line is then the only copy of the
container's flags anywhere in this project, so nothing can drift from the file an operator
reads and reviews.

| trap | what the file does | how it was verified |
|---|---|---|
| **1. `StartLimit*` in `[Unit]`** | `StartLimitIntervalSec=300` / `StartLimitBurst=5` are in `[Unit]` | ⚠ A test **parses the sections** and asserts the directive's section is `Unit` — a `toContain` would pass with the key in `[Service]`. `11-U1` moves both and reddens it. And the file is not the evidence: `cmd_unit` runs `systemctl show … -p StartLimitIntervalUSec` and **dies** if it is not `5min`, and `check` repeats the row |
| **2. no ordering cycle** | `After=docker.service sysinit.target`, `WantedBy=multi-user.target` | A test asserts the `After=` line **equals** `docker.service sysinit.target` (not merely that it lacks `multi-user.target` — the two are different assertions once a third target is ever added). `11-U2` reddens it. `cmd_unit` and `check` both run `journalctl -b \| grep "ordering cycle"`. ⚠ **This class of bug only appears on a real boot** — step 12 owns the actual verification |
| **3. nothing depends on it** | no other unit is named anywhere | The dashboard must never be a dependency of anything that serves or cools (§2.3). `check` *reports* `gpu-fan-control` and both `llama-server` instances and touches none of them |

Every flag of the `docker run` line is INSTALL-SPEC §7's table, with each one's reason in a
comment above it. A test joins the line continuations and asserts the flags are present,
that `--restart` is **absent** (systemd owns restarts), that no port is published, and that
there are **exactly 8** `-v` mounts and **all 8** end in `:ro` (invariant 2).

**One addition beyond §7's shape:** `ExecStopPost=-/usr/bin/docker rm -f ai-dashboard`.
`docker run --rm` does not remove a container whose *client* was killed, and the repo
convention is that anything changing state repeats its cleanup in `ExecStopPost` to cover
SIGKILL. It also strengthens O22.

---

## 4. `Dockerfile` and `.dockerignore`

Multi-stage, `node:24-slim` for both, `corepack enable` (the build runs as root inside the
image), `pnpm install --frozen-lockfile`, `pnpm build`. devDependencies are installed
deliberately — `next build` runs `tsc` — and none of them reaches the runtime stage, which
copies only the tracer's output.

Three lines that are load-bearing and would look like boilerplate:

1. **`COPY --from=build /app/.next/static ./.next/static`.** Next does **not** copy it into
   the standalone output (HANDOVER §10, learned on the first deploy). Without it every
   stylesheet and client chunk 404s and the page renders unstyled with nothing in the server
   log.
2. **`ENV HOSTNAME=0.0.0.0`.** ⚠ To Next's standalone server `HOSTNAME` is a **bind
   address** (`process.env.HOSTNAME || '0.0.0.0'`), not a name. A container that inherits
   `HOSTNAME=ai-server` binds 127.0.1.1, logs its usual "Ready" line, and answers nobody on
   the LAN. This has nothing to do with §3.2's hostname *reading*, which comes from the
   `/etc/hostname` bind mount and never from `os.hostname()`.
3. **Files stay root-owned**, not `--chown`ed to 10001. The runtime user must be able to
   read the code it executes and never to modify it.

`useradd … --shell /usr/sbin/nologin` implements §2.5's "no shell" half — a numeric `--user`
alone leaves uid 10001 with whatever the base image's passwd fallback gives it.
`HEALTHCHECK NONE` states §2.5's rule rather than relying on the base image never adding one.

**There is no `public/`,** and a test says so *and* requires the Dockerfile to copy one if
it ever appears — the same silent 404 as `.next/static`, one directory over, guarded at the
only moment it can be (`11-D4`).

---

## 5. ⚠ The one thing in INSTALL-SPEC that could not be done as written

**§9's O20 row asks for the hash to be *"verified by running it through the image, not by a
regex here"*. It cannot be, and this is recorded rather than improvised (invariant 7).**

Three routes were considered and all three are closed:

1. **Call `parseScryptHash` in the image.** It exists only inside Next's bundled server
   chunks (`.next/server/…`), which are webpack-runtime modules and are not `require`-able
   from outside the framework. O23 was closed precisely by *removing* the CLI entry point
   that would have made this possible; re-adding one would reopen it.
2. **Ask the running server.** Measured against `lib/auth/`: an unparseable hash and a wrong
   password are **both** a clean empty 401, by design — `verifyPassword` returns `false` in
   both cases and §5 logs nothing. A missing `SESSION_SECRET` is a 401 too. The HTTP surface
   genuinely cannot distinguish them, and `check` does not know the operator's password.
3. **Run the real TypeScript on the host.** The box has no Node. Node's type-stripping in
   the image would need extension-ful imports, which `lib/auth/scrypt.ts` does not use.

**What replaces it:** the bash grammar check exists, and its equality with `parseScryptHash`
is **measured on every `pnpm verify`** over a 20-row fixture table, with eight mutations
proving the measurement can fail. That is the same instrument that makes
`scripts/hash-password.py` safe as a second producer, pointed at the second judge. It is a
weaker guarantee than executing the canonical code in exactly one place, and it is the
strongest one available; **the owner may want to rule on it.**

---

## 6. The image contents — what was checked, and how

⚠ There is **no Docker on this Mac**, so nothing here is a claim about a built image. What
was measured is `.next/standalone`, which is what the Dockerfile copies, plus the build
context that `.dockerignore` produces.

**Method 1 — the standalone output.** `pnpm build` (exit 0, Next 16.3.4), then walked
`.next/standalone`:

```
.next/standalone           39 MB     .next/static  688 KB
node_modules/.pnpm         14 entries:
  @img+colour, @img+sharp-darwin-arm64, @img+sharp-libvips-darwin-arm64, @next+env,
  @swc+helpers, client-only, detect-libc, next, node_modules, react-dom, react, semver,
  sharp, styled-jsx
find . -name '*.test.*'    (nothing)
```

⚠ **The honest statement about jsdom and playwright-core, in 10c-3's terms.** There is **no
package directory** for either: `node_modules/.pnpm/*jsdom*` and `*playwright*` do not
exist. The **strings** appear in two files — `next`'s own
`dist/lib/server-external-packages.jsonc` and `dist/cli/next-test.js`, and
`.next/standalone/package.json`, which is **byte-identical to ours including
`devDependencies`** (verified with `diff`). Nothing installs from that manifest, but "the
string is absent from the image" would be false.

⚠ `sharp` **is** traced in, by Next's default tracing rather than by anything this project
imports, and on the box it will be `@img/sharp-linux-x64` instead. It is the image
optimiser's dependency and this project has no `next/image`; it is 30-odd MB of the 39.

**Method 2 — the build context.** `.dockerignore` was applied to the tree with Docker's own
matching rules (root-relative, `filepath.Match`, `**/` walking every segment) and the
surviving set copied to a scratch directory:

```
context: 130 files, 1216 KiB
tests in context  : []      secrets in context: []
scripts/ in ctx   : []      pipeline/ in ctx  : []
top level: .node-version .nvmrc next-env.d.ts next.config.mjs package.json
           pnpm-lock.yaml proxy.ts tsconfig.json
dirs:      app  components  lib
```

**Method 3 — the type-check the image will run.** `tsc --noEmit` **inside that scratch
context**, with `node_modules` linked in: **exit 0 over 102 project files.** That is the
actual claim INSTALL-SPEC §4 makes about excluding `*.test.ts` — that `next build`'s
type-check still passes without them — verified rather than asserted. (A full `next build`
there could not be run: Turbopack rejects a `node_modules` symlink pointing outside the
project root, and copying 1 GB to prove a type-check was not worth it.)

---

## 7. What `--dry-run` prints

Every subcommand takes it, prints its intended writes and commands, and changes nothing.
Measured: after running all thirteen with `--dry-run`, `/etc/ai-dashboard.env` and
`/etc/systemd/system/ai-dashboard.service` do not exist and `git status` shows only the new
files (a test asserts both).

`install --dry-run` is 180 lines and is the review surface INSTALL-SPEC §1 asks for:

- the whole preflight, with each finding and each `WOULD REFUSE`;
- `deps`: the key URL and target, **the exact `.sources` body**, `apt-get update`,
  `apt-get install -y nvidia-container-toolkit`, the `daemon.json` before/after, the docker
  restart, and the coupled toolkit/driver warning;
- `build`: the `docker build` line and, with no `--tag`, the loud `notag-<UTC date>` warning;
- `set-password`: that it *would* prompt twice with `read -rs`, pipe the password on stdin,
  and treat exit 2 as a policy refusal — it does **not** prompt;
- `configure`: `would generate 32 random bytes…`, `would write STANDING=…`, and nothing that
  claims a write happened;
- `unit`: **the entire unit file**, indented, plus the two verifications it would run;
- `firewall`: `ufw show added` first, then the `allow` it would add, then `ufw status
  numbered`;
- `start`: the `systemctl start` and the readiness poll;
- `check`: that a real run executes it for real and fails the install on any failed row.

---

## 8. The browser-defaults operating requirement

§6.1's promise is conditioned on **default font size and 100 % zoom** (ruled 2026-09-10).
It is written in three places an operator actually looks:

1. **`README.md`, its own section "Configuring the wall panel"** — with the measurement
   (16 px minimum-font-size → 105.6 px band against a 102 px reserve → 2–3 px over at
   1600×1024 and 27 px of SAFETY hidden at 1280) and the pointer to the ten measurement
   records that fail if it is not honoured;
2. **`dashboard.sh status`**, which is what someone runs while setting the panel up;
3. **the tail of a passing `check`.**

---

## 9. Every spec silence and disagreement found

Recorded, not resolved (invariant 7).

| # | where | what |
|---|---|---|
| **S1** | INSTALL-SPEC §9 (O20) | *"verified by running it through the image, not by a regex here"* — **not implementable.** §5 above has the three closed routes and what replaces it. **Owner's call** |
| **S2** | INSTALL-SPEC §7 | *"the ten `-v … :ro` mounts"* — the sentence then enumerates **eight**, and §2.2 has eight mounts. Built with eight; the count in the spec is wrong, not the list |
| **S3** | INSTALL-SPEC §1 vs §0 | §1 lists nine subcommands; §0's install order names `configure`, `unit`, `firewall` and `start` as steps, and §0 says every step is refusable. Built as thirteen subcommands. Recorded in case §1's list was meant to be exhaustive |
| **S4** | INSTALL-SPEC §2 | *"`~/ai-dashboard-src/package.json` missing"* — the spec does not say how the script locates its own tree, and §12.4 is still asking where that tree should live. Built as `dirname "$0"`, because `$HOME` is not stable across `sudo`. If §12.4 answers `/opt/ai-dashboard-src`, nothing here changes |
| **S5** | INSTALL-SPEC §9 | The spec does not say what `check` should do about a row it **cannot evaluate** (no root, no docker). Built as exit code **2**, distinct from a failure, because a row nobody could evaluate is not a row that passed |
| **S6** | INSTALL-SPEC §6 / §2.5 | Neither says whether `--env-file` **comment and blank lines** are legal. Docker's parser skips both, so `configure` writes a header comment. ⚠ A line with **no `=`** is legal to Docker and means *inherit from the host environment*; `check` refuses it. Not in the spec |
| **S7** | SPEC §2.5 / INSTALL-SPEC §7 | `--gpus all` is unconditional, so **a broken toolkit or driver takes the whole dashboard down**, not just the GPU panels — `docker run` fails and the unit will not start. §7 risk 2 describes the softer failure. Built as specified; `check` and `deps` both say it out loud. **A degraded mode would be a spec change and was not invented** |
| **S8** | INSTALL-SPEC §12.5 | Log retention (`max-size=10m max-file=3` on top of journald's own copy) is still open. Built as specified |
| **S9** | INSTALL-SPEC §12.3 | `--lan-cidr` default `192.168.4.0/22` is still worth confirming at deploy time — the box's address has drifted once. Built as specified, overridable |
| **S10** | HANDOVER §9 | *"Root `CLAUDE.md` gains a pointer to `dashboard/SPEC.md` (§2.4) — step 11"* conflicts with ANCHOR §9's *"nothing outside `dashboard/` should change"*. **Not done**; it is a two-line edit for whoever owns that file |
| **S11** | INSTALL-SPEC §3 | The `.sources` URI is written as a literal `…/stable/deb/amd64`, not apt's `$(ARCH)` substitution, because preflight already refuses anything but x86_64. Recorded because the spec quotes neither form |

## 10. Known limits of what was built

- ⚠ **Nothing here has run on the box.** No image was built, no container started, no unit
  installed, no ufw rule added. The box is read-only to this step and step 12 owns all of it.
  In particular the three systemd verifications (`StartLimitIntervalUSec`, the ordering
  cycle, one process) are *implemented and unexercised* — and the ordering cycle **can only**
  be exercised by a real boot.
- ⚠ **`dashboard.sh` is bash-3.2-compatible on purpose** (no associative arrays, no
  `mapfile`, no `${var^^}`), because `packaging.test.ts` runs it on macOS, whose `/bin/bash`
  is 3.2.57. The box has bash 5; the constraint costs nothing and is unstated in the spec.
- ⚠ **The source-text guards are only as wide as the spellings they enumerate.** The "never
  sources the env file" guard now sees `( . "$ENV_FILE"; … )` because `11-C2` measured that
  it did not; there is no last spelling.
- **`check`'s O20 row cannot validate the password**, only the hash. §5.1's policy is
  enforced once, at `set-password`, and is unverifiable at every later time. `check` says so
  in its own output rather than leaving the natural wrong assumption standing.
