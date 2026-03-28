/**
 * ProviderHealth - Provider readiness snapshot service.
 *
 * Owns startup-time provider health checks (install/auth reachability) and
 * exposes the cached results to transport layers.
 *
 * @module ProviderHealth
 */
import type { ServerProviderStatus, ServerToolStatus } from "@studio/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface ProviderHealthShape {
  /**
   * Read provider health statuses computed at server startup.
   */
  readonly getStatuses: Effect.Effect<ReadonlyArray<ServerProviderStatus>>;

  /**
   * Read editing-tool health statuses computed at server startup.
   */
  readonly getToolStatuses: Effect.Effect<ReadonlyArray<ServerToolStatus>>;
}

export class ProviderHealth extends ServiceMap.Service<ProviderHealth, ProviderHealthShape>()(
  "@studio/server/provider/Services/ProviderHealth",
) {}
