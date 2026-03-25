/**
 * ClaudeAdapter - Claude Code implementation of the generic provider adapter contract.
 *
 * This service owns Claude runtime / SDK semantics and emits Claude provider events.
 * It does not perform cross-provider routing or orchestration concerns.
 *
 * @module ClaudeAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface ClaudeAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "claudeCode";
}

export class ClaudeAdapter extends ServiceMap.Service<ClaudeAdapter, ClaudeAdapterShape>()(
  "@studio/server/provider/Services/ClaudeAdapter",
) {}
