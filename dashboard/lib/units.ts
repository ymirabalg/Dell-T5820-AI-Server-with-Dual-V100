/**
 * The two systemd unit names this project has to spell — **defined once, here.**
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

/** §6.4: "the join key between a serving instance and its unit is `llama-server@<i>.service`". */
export const servingUnitName = (instance: number): string => `llama-server@${instance}.service`;
