/**
 * The systemd unit names this project has to spell, the grammar of an instance identity, and
 * §6.2's ordering rule — **defined once, here.**
 *
 * ⚠⚠ **12c widened this module from two constants to a contract.** `servingUnitName` is no
 * longer a template that always answers: it is a mapping that can MISS, because
 * `serving-mode.sh`'s split mode is served by `llama-split.service` and not by
 * `llama-server@split.service`. And the ORDER instances are listed in is stated here rather
 * than falling out of a numeric sort, because that order is what *first claimant wins* means
 * in §6.2's inverted join.
 *
 * ### Why they are not in `lib/collectors/dbus.ts` any more
 *
 * They were, and that is the natural home: `dbus.ts` is what asks systemd about them. But
 * `dbus.ts` opens a unix socket — `import { connect } from 'node:net'` on its first line —
 * and §6.4's condition ids are built **in the browser**:
 *
 * ```
 * unit:gpu-fan-control.service        unit:llama-server@1.service
 * ```
 *
 * So step 8's `conditionsFrom` needs these two strings on the client, and importing them
 * from `dbus.ts` would drag `node:net` into the browser bundle. The alternative — a second
 * spelling in client code — is the failure HANDOVER puts second on its do-not-copy list,
 * and this one is worse than most: §6.4 makes `llama-server@<i>.service` **the join key**
 * between a serving instance and its unit, so two spellings would silently stop the SERVING
 * panel's rows matching their units.
 *
 * This module therefore has **no imports at all**, exactly like `lib/auth/login-view.ts`,
 * and for exactly the same reason. `dbus.ts` re-exports both names, so every existing
 * server-side import path is unchanged.
 */

/** `gpu-fan-control.service` — §3.3's `serviceState` and §3.6's `fanServiceState` (O9). */
export const FAN_SERVICE_UNIT = 'gpu-fan-control.service';

/**
 * ⚠⚠ **12c — an instance identity is a STRING, and this is the whole grammar of one.**
 *
 * `serving-mode.sh` writes `/etc/llama-server/split.env`, so §3.4's *"enumerate
 * `/etc/llama-server/*.env`"* now yields identities that are not numbers. Four things read an
 * identity — the env filename, the systemd unit name, §6.4's condition subject and a React key
 * — and every one of them needs the map from filename to identity to be **injective**, or two
 * files become one condition and §9's dedupe silently drops an instance from the header count.
 *
 * The grammar is therefore deliberately narrow, and each exclusion closes a specific hole:
 *
 * | excluded | because |
 * |---|---|
 * | `:` | §6.4's ids are `kind:subject`; a subject carrying a colon is a second spelling of another id |
 * | `@`, `.` | `llama-server@<i>.service` — an identity holding either can spell a unit name that is not its own |
 * | `/`, whitespace, empty | a path segment and a systemd unit name are neither |
 * | a LEADING `-` or `_` | `-1.env` read as the identity `-1` is a filename nobody wrote on purpose, and an identity that looks like a negative number invites exactly the `Number()` that 12c removed |
 * | anything non-ASCII | two identities that look identical on a wall panel must not be two rows |
 *
 * ⚠ **This regex is the ONE spelling of the grammar and both sides of the wire use it.** The
 * collector admits a filename with it and `wire.ts` admits a wire value with it, so a server
 * cannot hand a client an identity the client's own discovery would have refused.
 */
export const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Is this identity a bare, canonical decimal — `0`, `1`, `10`, and **not** `01` or `1_0`?
 *
 * ⚠ **Canonicality survives the move to strings, and its reason CHANGES.** While the identity
 * was a number, `01.env` and `1.env` both parsed to `1` and the rule existed to keep the map
 * injective. As strings `'01'` and `'1'` are already distinct, so injectivity no longer needs
 * it — but {@link compareInstances} does: a numeric-looking identity that is not canonical has
 * no defensible place in an ascending-by-value order (is `01` before or after `1`?), and §6.4
 * still fixes an index-shaped subject as *"a bare integer … no padding, no prefix"*. So
 * `01.env` stays refused, and it is refused by {@link isNumericInstance} returning false and
 * the caller demanding one of the two shapes it knows.
 */
export const isNumericInstance = (instance: string): boolean => /^(?:0|[1-9][0-9]*)$/.test(instance);

/** Digits and nothing else — the question {@link isInstanceId} asks BEFORE canonicality. */
const ALL_DIGITS = /^[0-9]+$/;

/**
 * ⚠⚠ **12c — the ONE predicate for "is this a legal instance identity", used on BOTH sides.**
 *
 * `parseInstanceId` asks it of a filename stem and `wire.ts`'s `instanceId` asks it of a wire
 * value, so a server cannot hand a client an identity the client's own discovery would have
 * refused, and a fixture cannot be built from one either. Two rules, and both are stated above:
 * {@link INSTANCE_ID}'s grammar, and — for a stem made only of digits — canonicality.
 *
 * ⚠ **The digits-only case has THREE outcomes and only two are right.** `01` must not fall
 * through to the named branch: it would sort behind `split`, spell no unit name, and sit on the
 * panel beside `1` as though it were a different process. So a digit-only identity is either
 * canonical or refused.
 */
export const isInstanceId = (value: string): boolean => {
  if (!INSTANCE_ID.test(value)) return false;
  return ALL_DIGITS.test(value) ? isNumericInstance(value) : true;
};

/**
 * ⚠⚠ **12c — §6.2's ORDER, specified here rather than inherited from a sort.**
 *
 * The rule, in words: **numbered instances first, ascending by VALUE; then named instances,
 * ascending by code point.** So `0, 1, 2, 10, split, spare` — never `0, 1, 10, 2`.
 *
 * ### Why it has to be written down at all
 *
 * `discoverInstances` used to end in `sort((a, b) => a - b)`, and that sort was carrying two
 * different jobs at once. The first is presentational: §6.2's SERVING panel is *"one row per
 * instance in an order a human reads"*, and a tenth card listed between `0` and `1` is not
 * that. The second is **load-bearing**: `serving[]`'s order is what *first claimant wins*
 * means in §6.2's inverted join, so the order decides which instance a card names when two
 * of them list it. A numeric subtraction has no string equivalent, so replacing it with
 * `localeCompare` or a bare `<` would have silently changed the second job while appearing to
 * preserve the first.
 *
 * ### Why numbers before names, rather than one lexical order over everything
 *
 * The numbered instances are the arrangement this box boots into (`llama-server@N`), and a
 * named one is an addition to it — `serving-mode.sh`'s `split` is the only one that exists
 * today. Sorting `10` before `2` to get `split` into a single lexical run would trade the
 * order a human reads for a uniformity nothing asks for.
 *
 * ⚠ **It is a total order on distinct identities, and that is the property the join needs.**
 * Two different identities never compare equal: {@link INSTANCE_ID} admits no identity that
 * is both numeric and named, two distinct canonical decimals differ in value, and two distinct
 * names differ at some code point. So a set of identities has exactly one ordering under this
 * comparator, **independent of the order they arrived in** — which is what makes
 * `servedBy`'s first claimant a function of the snapshot's CONTENT rather than of its layout.
 *
 * ### ⚠⚠ Why the numbered branch does NOT use `Number()` — 12c/RECONCILE, `12c-A8`
 *
 * It did (`Number(a) - Number(b)`), and the claim in the paragraph above was **false as
 * written**. `isInstanceId` admits a canonical decimal of ANY length, and `parseInstanceId`
 * admits the same filename, so both sides of the wire accept `9007199254740993.env`. Measured:
 *
 * ```
 * compare('9007199254740993', '9007199254740992') = 0    <- two DISTINCT identities, EQUAL
 * compare('111…1' (400 digits), '222…2')          = NaN  <- Infinity - Infinity
 * ```
 *
 * A tie sends the join to array position, so the SAME rows in two orders named two different
 * instances and put the **wrong model** on the card — §6.2's own named failure mode, reached
 * end to end through `parseSnapshot`. A `NaN` is worse: `Array.prototype.sort` with an
 * inconsistent comparator is implementation-defined, which is the non-determinism the ordering
 * rule exists to remove.
 *
 * **Canonical decimals compare exactly by LENGTH, then by code point**, with no arithmetic at
 * all: no leading zeros means the longer string is the larger number, and at equal length the
 * digits `0`–`9` already sort by value. Every identity is now compared as the string it is,
 * and the module's own claim is true for every input the grammar admits rather than for the
 * ones that fit in a double.
 */

/** The one lexical comparison in this file, so the two branches that need it cannot drift. */
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const compareInstances = (a: string, b: string): number => {
  const aNumeric = isNumericInstance(a);
  const bNumeric = isNumericInstance(b);
  if (aNumeric && bNumeric) return a.length !== b.length ? a.length - b.length : byCodePoint(a, b);
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return byCodePoint(a, b);
};

/**
 * ⚠⚠ **12c — the named units, as a TABLE.** `split.env` is served by `llama-split.service`,
 * **not** `llama-server@split.service` (`SERVING-MODES.md` §2: *"not templated, one instance"*).
 *
 * This is the whole reason {@link servingUnitName} stopped being a template. A template can
 * always produce a name; a mapping can fail, and failing is the honest answer for an identity
 * nothing in this table knows.
 */
const NAMED_UNITS: Readonly<Record<string, string>> = {
  split: 'llama-split.service',
};

/**
 * The identities {@link NAMED_UNITS} knows, exported so a test can assert over the TABLE rather
 * than over a list of names retyped beside it.
 *
 * ⚠ It exists because {@link servingUnitLabel} strips a fixed six characters: the invariant
 * *every unit name this mapping can produce ends in `.service`* has to be checked against
 * whatever the table holds on the day, not against `['split']` frozen into a test in 2026.
 */
export const NAMED_INSTANCES: readonly string[] = Object.keys(NAMED_UNITS);

/**
 * ⚠⚠ **12c — §6.4's join key, as a MAPPING that can MISS.** `0` → `llama-server@0.service`;
 * `split` → `llama-split.service`; anything else → **`null`**.
 *
 * ### ⚠ Why the miss is `null` and not a guess
 *
 * *Every wrong answer here is silent.* A unit name that does not exist is not an error on the
 * bus — systemd answers about it perfectly well and reports `inactive`, which reads as *a
 * stopped service* rather than *we asked about the wrong thing*. So a template that produced
 * `llama-server@split.service` for the split identity would render a plausible, wrong, quiet
 * page: the SERVING row would show a dead unit for a process that is up, both GPU cards would
 * carry an em dash for a `gpus` that was never asked for, and nothing anywhere would say why.
 *
 * `null` forces the caller to decide, and {@link collectServing} makes it loud: one `errors[]`
 * entry per poll, attached to that instance's row, naming the identity and the two columns it
 * blanks. **A default here would be a defect, not a convenience.**
 */
export const servingUnitName = (instance: string): string | null => {
  if (isNumericInstance(instance)) return `llama-server@${instance}.service`;
  return Object.hasOwn(NAMED_UNITS, instance) ? (NAMED_UNITS[instance] as string) : null;
};

/** The `.service` suffix, spelled once — {@link servingUnitLabel} is the only thing that strips it. */
const UNIT_SUFFIX = '.service';

/**
 * What the SERVING row and the event log CALL an instance — the unit name without its
 * `.service` suffix, or the bare identity when {@link servingUnitName} misses.
 *
 * ⚠ **Derived from the unit name, never spelled a second time.** The label `llama-server@0` is
 * the string this panel has always shown, and it is now that string because it is
 * `llama-server@0.service` minus six characters — so a change to the mapping moves the label
 * with it, and the two cannot drift into naming different units.
 *
 * ⚠ **A miss renders the identity ALONE**, deliberately: `split` rather than
 * `llama-server@split`. §12c's survey named the cost of the alternative exactly — *"four
 * operator-facing strings would NAME A UNIT THAT DOES NOT EXIST"* — and a label is one of the
 * four.
 *
 * ⚠⚠ **The `endsWith` guard that used to stand here was PROVABLY DEAD, and 12c/RECONCILE
 * replaced it with an asserted invariant** (`12c-A11` #2). Every value {@link servingUnitName}
 * can return ends in `.service` — the numeric template writes it and {@link NAMED_UNITS} is one
 * table — so the `: unit` arm was unreachable and reverting the whole ternary left the suite
 * green. A guard that cannot fail is not protection: it is an unchecked second statement of a
 * rule, and it reads as though a suffix-less unit were handled here when in fact it would be
 * sliced apart. The rule is now a test over the table's own values (`lib/units.test.ts`,
 * ⚠ *every unit name this mapping can produce ends in `.service`*) with a mutation that removes
 * a suffix from the table, so a `llama-split.socket` added later is a RED TEST rather than a
 * label reading `llama-spl`.
 */
export const servingUnitLabel = (instance: string): string => {
  const unit = servingUnitName(instance);
  if (unit === null) return instance;
  return unit.slice(0, -UNIT_SUFFIX.length);
};
