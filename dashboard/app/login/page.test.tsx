import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, test } from 'vitest';

import { EXPIRED_PARAM } from '@/lib/auth/login-view';

import LoginPage, { dynamic } from './page';

/**
 * `/login` (§5.2) — the route, its one decision, and the styling that has to survive React's
 * escaping.
 */

const render = async (params: Record<string, string | string[] | undefined>): Promise<string> =>
  renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }));

describe('the login route', () => {
  test('⚠ it is dynamic — the one route that must work when everything else is refusing', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  test('renders the card, the disclosure and the identity block', async () => {
    const html = await render({});

    expect(html).toContain('ai-server');
    expect(html).toContain('192.168.4.71:8090');
    expect(html).toContain('Unlock');
    expect(html).toContain('Plain HTTP on the LAN — this password crosses the wire in the clear.');
  });

  /*
   * ⚠ The one decision this page makes: §5.2's *Session expired* state is the only one the
   * form cannot reach on its own, and `proxy.ts` hands it over in the query string.
   */
  test('⚠ ?expired puts the screen in §5.2’s session-expired state', async () => {
    expect(await render({ [EXPIRED_PARAM]: '1' })).toContain('Session expired — sign in again.');
    expect(await render({ [EXPIRED_PARAM]: '' })).toContain('Session expired — sign in again.');
    expect(await render({})).not.toContain('Session expired');
    expect(await render({ other: '1' })).not.toContain('Session expired');
  });

  /*
   * ⚠ The stylesheet ships with the page, and it is written in a **markup-safe subset**.
   *
   * Measured on React 19.2 under `renderToStaticMarkup`: `style` is a raw-text element and
   * its children are emitted **unescaped** — `<style>{'.a > i{}'}</style>` comes out with a
   * literal `>`, while the same string inside a `div` becomes `&gt;`. So the CSS is *not*
   * mangled today, and the constraint below is deliberate rather than compensatory: a block
   * containing `<`, `>` or `&` is one renderer change away from being escaped into selectors
   * that quietly match nothing, and a literal `</style>` would end the element early. Keeping
   * the subset costs nothing — a descendant combinator is a space — and removes the whole
   * question.
   *
   * The styles live in the page rather than in a stylesheet because this project has no CSS
   * pipeline yet and `/login` must not be the thing that chooses one; steps 9 and 10 own that.
   */
  test('⚠ the inline stylesheet is present and uses no character an escaper would rewrite', async () => {
    const html = await render({});
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';

    expect(css).not.toBe('');
    expect(css).not.toMatch(/[<>&]/);
    expect(css).toContain('.login__go[disabled]');
    expect(css).toContain('.login__msg[data-sev="crit"]');
  });

  /*
   * §2.5: `--read-only` means no `next/image`. There are no raster images on this screen and
   * there must not be — `lib/guardrails.test.ts` enforces the import ban project-wide, and
   * this is the same rule observed in the markup of the one page step 7 renders.
   */
  test('the screen carries no raster images', async () => {
    expect(await render({})).not.toContain('<img');
  });
});
