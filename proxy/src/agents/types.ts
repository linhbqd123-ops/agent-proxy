// ─────────────────────────────────────────────────────────────────────────────
// Agent handler interface — each supported agent implements this
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest } from 'fastify';

/**
 * Resolved upstream target info returned by an agent handler.
 */
export interface UpstreamTarget {
  /** Full upstream URL to forward to */
  url: URL;
  /** Whether this is a code completion request (vs chat/other) */
  isCodeCompletion: boolean;
}

/**
 * Token usage extracted from a response body.
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
}

/**
 * Each supported agent (Copilot, Kilo, etc.) implements this interface.
 * The proxy core calls these methods to resolve routing and extract metrics.
 */
export interface AgentHandler {
  /** Unique agent identifier (e.g. 'copilot', 'kilo') */
  readonly name: string;

  /** Resolve the upstream URL for a given request */
  resolveUpstream(req: FastifyRequest): UpstreamTarget;

  /** Build clean headers for the upstream request */
  buildUpstreamHeaders(req: FastifyRequest, targetUrl: URL): Record<string, string>;

  /** Extract token usage from a response body */
  extractTokenUsage(responseBody: string, isStreaming: boolean): TokenUsage;
}
