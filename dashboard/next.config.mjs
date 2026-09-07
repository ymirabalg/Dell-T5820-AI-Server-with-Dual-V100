/**
 * SPEC.md §2.5 — runtime contract.
 *
 * `output: 'standalone'` is required: the container copies `.next/standalone` and runs
 * `node server.js` with no node_modules tree of its own.
 *
 * There is deliberately NO `images` configuration, because there is deliberately no
 * `next/image` in this project. The container runs `--read-only`; Next's image optimiser
 * writes to a runtime cache directory and would fail. Every graphic in this UI is inline
 * SVG. `lib/contract.test.ts` fails the suite if `next/image` ever appears in the source.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
