#!/usr/bin/env python3
"""Produce a `PASSWORD_HASH` for /etc/ai-dashboard.env, on a host with no Node.

SPEC.md §5.1. `dashboard.sh set-password` pipes the password in on **stdin** and writes the
one line this prints. Never an argument: an argument lands in shell history and in `ps`, which
is the same reasoning behind `--api-key-file` rather than `--api-key` in serve-llm.sh.

⚠ THIS IS A SECOND PRODUCER OF A FORMAT WHOSE ONLY FAILURE MODE IS A SILENT 401.

`lib/auth/scrypt.ts` is the consumer, and `parseScryptHash` returns `null` for anything it does
not recognise — including a hash that is correct but spelled differently. `null` is not an
error: §5 deliberately logs nothing about authentication, so the whole symptom is a clean empty
401 on every login attempt and *a dashboard that will not open and will not say why*.

Nothing about that risk is managed by this comment. It is managed by
`lib/auth/hash-password-script.test.ts`, which runs **this file** and asserts the server's own
`verifyPassword` accepts what it produced. Divergence is a red test, not a support call.

The alternative was to run `hashPassword()` inside the container image, which needs a CLI entry
kept in `.next/standalone` by `outputFileTracingIncludes` and forces set-password to happen
after the image is built. The box has python3 and no Node; this removes the ordering constraint
and the build-time tracing dependency, at the price of the cross-check below.

Exit codes:  0 ok  ·  2 the password fails §5.1's policy  ·  1 anything else
"""

import base64
import hashlib
import os
import sys

# ⚠ These five must equal `DEFAULT_SCRYPT_PARAMS`, `KEY_BYTES` and `SALT_BYTES` in
# `lib/auth/scrypt.ts`. The cross-check test is what holds them equal.
LOG_N = 15
R = 8
P = 1
KEY_BYTES = 32
SALT_BYTES = 16

# ⚠ Not a tuning knob. At these parameters the allocation is 128 · 2^15 · 8 = 32 MiB EXACTLY,
# and OpenSSL's default ceiling is also 32 MiB — under which `hashlib.scrypt` raises. Node hit
# this first and `SCRYPT_MAXMEM` in `scrypt.ts` exists for the same reason; the two must agree
# for the same reason, and 64 MiB leaves headroom for one step up in LOG_N.
MAXMEM = 64 * 1024 * 1024

MIN_LENGTH = 6


def policy_failure(password: str) -> str | None:
    """§5.1's policy, or `None` if the password passes.

    ⚠ Enforced HERE and nowhere else, because it is the only moment anyone sees the password.
    The server is handed a hash and can never afterwards tell whether the policy was met —
    `dashboard.sh check` verifies the hash *parses*, not that the password behind it is long
    enough. A policy applied at set time is unverifiable at every later time.
    """
    if len(password) < MIN_LENGTH:
        return f"at least {MIN_LENGTH} characters (got {len(password)})"
    if not any(c.isalpha() for c in password):
        return "at least one letter"
    if not any(c.isdigit() for c in password):
        return "at least one digit"
    return None


def b64(raw: bytes) -> str:
    """Node's `Buffer.toString('base64url')`: URL alphabet, and **unpadded**."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def hash_password(password: str, salt: bytes) -> str:
    key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=1 << LOG_N,
        r=R,
        p=P,
        maxmem=MAXMEM,
        dklen=KEY_BYTES,
    )
    return f"scrypt.{LOG_N}.{R}.{P}.{b64(salt)}.{b64(key)}"


def main() -> int:
    # Read bytes, not `input()`: a password may legitimately contain anything, and one
    # trailing newline is the shell's, not the operator's.
    raw = sys.stdin.buffer.read()
    if raw.endswith(b"\n"):
        raw = raw[:-1]
    password = raw.decode("utf-8")

    failure = policy_failure(password)
    if failure is not None:
        print(f"password rejected: needs {failure}", file=sys.stderr)
        return 2

    print(hash_password(password, os.urandom(SALT_BYTES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
