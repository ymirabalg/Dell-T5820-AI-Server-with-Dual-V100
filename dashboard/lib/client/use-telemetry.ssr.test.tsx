import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { useTelemetry } from './use-telemetry';

/**
 * D6, half one — the half that needs NO jsdom at all, and is cheaper for it. This file runs in
 * Vitest's default `node` environment — deliberately carrying no per-file environment override
 * comment — where `window` is genuinely undefined, so it exercises the actual server-render
 * branch `use-telemetry.ts`'s own doc calls out rather than a jsdom stand-in for it.
 *
 * ⚠ **Do not write this file's own environment-override marker as a literal string in this
 * comment.** Vitest's docblock scanner matches it anywhere in the file's text, not only in an
 * actual pragma position — an early draft of this sentence named the mount/unmount sibling
 * file by quoting its override marker verbatim and silently pulled THIS file into jsdom too,
 * which defeated the entire point of splitting the two. The mount/unmount half — which needs a
 * real DOM to run an effect at all — lives in `use-telemetry.test.tsx`, one directory listing
 * away; describe it by name, never by pasting its marker comment.
 */

describe('⚠ on the server — no window — both state and runtime are null', () => {
  // ⚠ Deliberately UNMARKED, same reasoning as `purity.test.ts`'s "the component directory
  // actually has files to check": this guards the test FILE's own premise, not a line of
  // application code, so no mutation to `use-telemetry.ts` could ever redden it. It stays in
  // the suite to catch a `jsdom` global leaking into the default `node` environment (a config
  // change, a stray setup file) before that would silently turn the test below into a false
  // pass exercising the wrong branch — but the red-test ledger correctly expects no mutation
  // to cover it.
  test('the test file premise: typeof window is genuinely undefined here, not merely unread', () => {
    expect(typeof window).toBe('undefined');
  });

  test('⚠ useTelemetry returns { state: null, runtime: null } — never constructs a runtime', () => {
    let captured: unknown;
    function Probe() {
      captured = useTelemetry();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    expect(captured).toEqual({ state: null, runtime: null });
  });
});
