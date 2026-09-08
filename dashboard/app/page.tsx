import { DashboardShell } from './dashboard-shell';

/**
 * §6.1's page. This file itself stays free of telemetry and secrets (HANDOVER rule 16,
 * §3.3): it renders exactly one client component and carries no props of its own, so a
 * revoked cookie that can still fetch this HTML shell (§3.3's documented asymmetry) receives
 * nothing more than `DashboardShell`'s own "connecting…" state until its first
 * `/api/telemetry` call 401s and sends it to `/login`.
 */
export default function Page() {
  return <DashboardShell />;
}
