/**
 * ⚠ A DIAGNOSTIC against the live box, not a test. Run it deliberately:
 *
 *     pnpm probe
 *
 * It fetches `/api/telemetry` from `ai-server` over SSH, validates the payload with **the
 * client's own `parseSnapshot`**, and renders every panel with **the real formatters, the real
 * throttle decoder and the real condition projection**. So what it prints is what the UI will
 * print, produced by the same code — there is no second implementation of §6.6 here, which is
 * exactly what a hand-rolled probe would have been.
 *
 * Two things it is for:
 *
 * 1. **Wire compatibility.** `parseSnapshot` is what the browser runs. If the server's payload
 *    does not validate here, the dashboard shows a failed poll and no field says why.
 * 2. **Seeing the machine.** Every reading with its rendered string and its §6.3 band, against
 *    a box whose thermal and serving state is documented in `CLAUDE.md` — so a wrong number is
 *    recognisable rather than merely plausible.
 *
 * ⚠ It is allowed to fail because the box is off, and it **never runs under `pnpm test`**:
 * `vitest.probe.mts` is a separate config precisely so a network probe cannot be swept into the
 * suite. Read-only — one `curl` per poll and nothing else (invariant 2).
 */

import { execFileSync } from 'node:child_process';

import { describe, expect, test } from 'vitest';

import { conditionsFrom } from '@/lib/client/observations';
import { parseSnapshot } from '@/lib/client/wire';
import {
  EM_DASH,
  formatAge,
  formatBytesPerSecond,
  formatCelsius,
  formatCh5Pwm,
  formatCpuModel,
  formatGB,
  formatGiB,
  formatLoadAverage,
  formatMHz,
  formatMiBPair,
  formatPercent,
  formatPort,
  formatRpm,
  formatSwapGiB,
  formatText,
  formatTokens,
  formatUptime,
  formatWatts,
} from '@/lib/format';
import { decodeThrottleMask } from '@/lib/throttle';
import type { TelemetrySnapshot } from '@/lib/types';

const HOST = process.env['PROBE_HOST'] ?? 'ai-server';
const URL = process.env['PROBE_URL'] ?? 'http://127.0.0.1:8090/api/telemetry';
const COOKIES = process.env['PROBE_COOKIES'] ?? '~/aid.cookies';

/** One poll, over SSH. The box serves on loopback, so nothing is exposed to the LAN. */
const poll = (): { raw: unknown; text: string } => {
  const text = execFileSync('ssh', [HOST, `curl -s -b ${COOKIES} ${URL}`], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { raw: JSON.parse(text) as unknown, text };
};

const row = (label: string, value: string, extra = ''): void => {
  console.log(`  ${label.padEnd(20)} ${value.padEnd(28)} ${extra}`);
};

/** §6.2's panel head: title · subtitle. */
const head = (title: string, subtitle: string): void => {
  console.log(`\n${title.toUpperCase()}  ·  ${subtitle}`);
};

describe('the live API', () => {
  test('the payload validates with the client’s own parseSnapshot', () => {
    const { raw, text } = poll();
    console.log(`\n${text.length} bytes from ${HOST} ${URL}`);

    const wire = parseSnapshot(raw);
    // ⚠ If this is null the browser shows a failed poll and names no field, so it is the
    // single most important assertion in this file.
    expect(wire, 'the server produced something the client cannot read').not.toBeNull();
    if (wire === null) return;
    const s: TelemetrySnapshot = wire.snapshot;

    console.log(`ts ${s.ts}   age ${formatAge(Date.now() - wire.tsMs)}   host ${formatText(s.hostname)}   ${formatUptime(s.host.uptimeSec)}`);
    // ⚠ `formatUptime` already carries the word "up" (§3.2's four forms are `up 2 d 02:01`,
    // `up 02:01`, `up 14 min`, `up <1 min`). §6.2's header must not add its own, or it reads
    // `up up 1 d 21:45` — which is what this probe printed on its first live run.

    for (const g of s.gpus ?? []) {
      head(`gpu ${g.index}`, `${formatText(g.name)} · ${formatText(g.bus)}`);
      row('temp', formatCelsius(g.tempC));
      row('power', `${formatWatts(g.powerW)} / ${formatWatts(g.powerCapW)}`);
      row('vram', formatMiBPair(g.memUsedMiB, g.memTotalMiB));
      row('util', formatPercent(g.utilPct));
      row('sm clock', formatMHz(g.smClockMHz));
      const t = decodeThrottleMask(g.throttleReasons);
      row(
        'throttle',
        t === null ? EM_DASH : (t.reasons.map((r) => `${r.code} ${r.name}`).join(' | ') || '0x0'),
        t?.note ?? `severity ${t?.severity ?? EM_DASH}`,
      );
    }
    if (s.gpus === null) console.log('\nGPU: not enumerated (gpus: null) — see errors[]');

    head('cpu', `${formatCpuModel(s.host.cpuModel)} · ${s.host.cores}C / ${s.host.threads}T`);
    row('package temp', formatCelsius(s.host.cpuTempC));
    row(
      'utilisation',
      formatPercent(s.host.cpuPct),
      s.host.cpuPct === null ? '← §6.7: a delta needs two samples' : '',
    );
    row('load average', formatLoadAverage(s.host.loadAvg));

    head('memory', '/proc/meminfo');
    row('ram', `${formatGiB(s.host.memUsedGiB)} / ${formatGiB(s.host.memTotalGiB)}`);
    row('swap', `${formatSwapGiB(s.host.swapUsedGiB)} / ${formatSwapGiB(s.host.swapTotalGiB)}`);

    head('cooling', 'dell_smm · channel 5 = FAN_HDD (PCIe/GPU)');
    row('fan 5', formatRpm(s.cooling.fan5Rpm), formatCh5Pwm(s.cooling));
    row(
      'fan 1·2·3·4',
      [s.cooling.fan1Rpm, s.cooling.fan2Rpm, s.cooling.fan3Rpm, s.cooling.fan4Rpm]
        .map(formatRpm)
        .join('   '),
    );
    row('gpu-fan-control', formatText(s.cooling.serviceState));

    head('serving', 'one instance per GPU · /health + /v1/models');
    for (const i of s.serving ?? []) {
      row(
        `llama-server@${i.instance}`,
        `:${formatPort(i.port)}  ${formatText(i.unitState)}`,
        `${formatText(i.model)}   ctx ${formatTokens(i.ctx)}   health ${formatText(i.health)}`,
      );
    }
    if (s.serving === null) console.log('  instances could not be enumerated (serving: null)');

    head('storage & network', 'statvfs · eno1');
    row('/', `${formatGB(s.storage.root.usedGB)} / ${formatGB(s.storage.root.totalGB)}`);
    row('/home', `${formatGB(s.storage.home.usedGB)} / ${formatGB(s.storage.home.totalGB)}`);
    row(
      'eno1',
      `rx ${formatBytesPerSecond(s.storage.net.rxBytesPerSec)}  tx ${formatBytesPerSecond(s.storage.net.txBytesPerSec)}`,
      `link ${formatText(s.storage.net.link)}`,
    );

    head('safety', 'silent failures');
    row('ufw enforcing', String(s.safety.ufwEnforcing));
    row('pwm5 present', String(s.safety.pwm5Present));
    row('dkms for kernel', String(s.safety.dkmsForRunningKernel));
    row('fan service', formatText(s.safety.fanServiceState));

    // §6.3's bands, through the same projection the client uses. `conditionsFrom` is
    // deliberately un-deduped (`unit:gpu-fan-control.service` appears twice) — that is why it
    // is not a panel surface, and seeing it here is a feature of the probe, not a defect.
    const conditions = conditionsFrom(s);
    const notable = conditions.filter((c) => c.rawSeverity !== 'normal');
    head('§6.3 bands', `${conditions.length} conditions projected from this snapshot`);
    if (notable.length === 0) console.log('  every condition bands normal');
    for (const c of notable) row(c.id, c.rawSeverity, c.value);

    head('errors[]', `${s.errors.length} entries`);
    for (const e of s.errors) row(e.source, '', e.message);
    console.log('');
  });

  test('§4’s 2 s cache: three rapid polls are one sample', () => {
    const stamps = [poll(), poll(), poll()].map((p) => (p.raw as { ts: string }).ts);
    console.log(`\n  cache: ${stamps.join('   ')}\n`);
    expect(new Set(stamps).size, 'three polls inside the 2 s window should share one ts').toBe(1);
  });
});
