# ai-dashboard — SPEC.md §2.3 and §2.5.
#
# Multi-stage, `node:24-slim` for BOTH stages (§2.5: "matches the dev machine, so tests run
# on the major that serves"). Built ON THE BOX (§2.3): this Mac is arm64 and ai-server is
# x86_64, and `pnpm install` resolves platform-specific binaries — `sharp`'s
# `@img/sharp-linux-x64` here, `@img/sharp-darwin-arm64` on the Mac. A cross-built image
# would fail at runtime, not at build time.
#
# ⚠ Nothing in this file writes at runtime. The container runs `--read-only` with a tmpfs
# `/tmp` (§2.5), which is also why there is no `next/image` anywhere in this project — the
# optimiser writes a cache directory and would fail. `lib/guardrails.test.ts` fails the
# suite if an `next/image` import ever appears.

# ============================================================================== build stage
FROM node:24-slim AS build
WORKDIR /app

# `next build` phones home unless told not to, and this box is not the place to discover
# that. `CI=1` keeps every prompt out of a non-interactive build.
ENV NEXT_TELEMETRY_DISABLED=1 \
    CI=1

# The manifest and the lockfile first, so editing a component does not invalidate the
# dependency layer. ⚠ `--frozen-lockfile`: the lockfile carries every linux/x64 variant the
# box needs (HANDOVER §10), and a build that silently re-resolved it would be a different
# dependency set than the one this project's suite ran against.
#
# ⚠ The build runs as root inside the image, so a plain `corepack enable` works — it writes
# shims into /usr/local/bin. `packageManager` in package.json pins pnpm 12.3.4, and corepack
# fetches exactly that.
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# ⚠ devDependencies are installed deliberately: `next build` runs the TypeScript compiler,
# and `typescript` is a devDependency. None of them reaches the runtime stage — the tracer
# copies only what the app imports, and the runtime stage below copies only the tracer's
# output.
COPY . .
RUN pnpm build

# =========================================================================== runtime stage
FROM node:24-slim AS runtime

# §2.5: "Container user: non-root, uid/gid 10001, no shell."
#
# ⚠ Created here as well as passed to `docker run --user 10001:10001`, for two reasons that
# are not the same reason: the account gives the uid a NAME (so `docker top ai-dashboard`
# and `ps` on the host are readable rather than a bare number, which is what `check`'s
# one-process row is read against), and `--shell /usr/sbin/nologin` is the "no shell" half
# of the spec line — a numeric `--user` alone leaves whatever shell the base image gives
# uid 10001, which is `/bin/sh` via the passwd fallback.
RUN groupadd --system --gid 10001 dashboard \
 && useradd --system --uid 10001 --gid 10001 --no-create-home \
      --home-dir /nonexistent --shell /usr/sbin/nologin dashboard

WORKDIR /app

# ⚠ Everything the container runs, and nothing else. `output: 'standalone'` traces the
# app's imports and emits a self-contained tree — server.js, a minimal node_modules, and
# the compiled server chunks. Measured on this tree, 2026-09-10: 41 MB, and its
# `node_modules/.pnpm` holds fourteen entries, none of which is `vitest`, `jsdom` or
# `playwright-core`. See `pipeline/steps/11-packaging/build.md` §6 for the full listing and
# the method — the honest statement is about package DIRECTORIES, not about the string.
#
# ⚠ Files stay ROOT-OWNED and are not `--chown`ed to 10001. The runtime user must never be
# able to modify the code it executes; it only has to read it, and every file here is
# world-readable. `--read-only` makes this belt-and-braces, which is the point.
COPY --from=build /app/.next/standalone ./

# ⚠ Next does NOT copy these into the standalone output — HANDOVER §10, learned on the
# first deploy. Without this line every stylesheet and client chunk 404s and the page
# renders unstyled with no error anywhere on the server.
COPY --from=build /app/.next/static ./.next/static

# ⚠ There is deliberately no `COPY … /app/public ./public`: this project has no `public/`
# directory (verified 2026-09-10, and `packaging.test.ts` fails if one ever appears without
# this Dockerfile gaining the copy). A `public/` that exists in the repo and not in the
# image is a silent 404, exactly like `.next/static` above.

ENV NODE_ENV=production \
    PORT=8090 \
    HOSTNAME=0.0.0.0

# ⚠ `HOSTNAME` is a BIND ADDRESS to Next's standalone server (`server.js` reads
# `process.env.HOSTNAME || '0.0.0.0'`), not a name. It is set explicitly because Docker
# sets `HOSTNAME` in some configurations, and a server that binds to the literal string
# `ai-server` resolves it through /etc/hosts to 127.0.1.1 and answers nobody on the LAN —
# a container that starts, logs its usual "Ready" line, and is unreachable.
#
# ⚠ This has nothing to do with §3.2's hostname READING, which comes from the
# `/etc/hostname` bind mount and never from `os.hostname()` (`lib/collectors/proc.ts`).

# Documentation only: the container runs `--network host` (§2.1), so nothing is published
# and ufw governs 8090 on the host's INPUT chain like llama-server's 8080/8081.
EXPOSE 8090

USER 10001:10001

# ⚠ §2.5: "No Docker HEALTHCHECK that restarts the container. A dashboard that cannot read
# a sensor must stay up and say so; restarting it would destroy the browser's whole session
# buffer to fix nothing." `NONE` states that rather than relying on the base image never
# adding one. systemd owns restarts, and it is the only thing that does.
HEALTHCHECK NONE

CMD ["node", "server.js"]
