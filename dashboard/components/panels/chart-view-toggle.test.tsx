// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ChartViewToggle } from './chart-view-toggle';

/**
 * The control 10c1 built to discharge Q2-S2's toggle — see `chart-view-toggle.tsx`'s module
 * doc for why it lives beside the chart rather than in the header. This file proves the
 * control's own two facts: it names which view is CURRENT and it calls back on click. Whether
 * a click actually flips a PANEL into table view is each panel's own test's job (the panel
 * decides what `view` means); this component has nothing else to get wrong.
 */

describe('⚠ the button always announces the OTHER view — the one a click switches to', () => {
  test('⚠ in chart view, the button offers the table', () => {
    const html = renderToStaticMarkup(
      <ChartViewToggle view="chart" onToggle={() => undefined} label="GPU 0 temperature" />,
    );
    expect(html).toContain('table view');
    expect(html).not.toContain('>chart view<');
  });

  test('⚠ in table view, the button offers the chart back', () => {
    const html = renderToStaticMarkup(
      <ChartViewToggle view="table" onToggle={() => undefined} label="GPU 0 temperature" />,
    );
    expect(html).toContain('chart view');
    expect(html).not.toContain('>table view<');
  });
});

describe('⚠ the click really reaches onToggle — not merely a button that LOOKS wired', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  test('⚠ clicking the rendered button calls onToggle exactly once', () => {
    const onToggle = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(<ChartViewToggle view="chart" onToggle={onToggle} label="CPU charts" />);
    });
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });
});
