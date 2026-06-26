// ─────────────────────────────────────────────────────────────────────────────
// Agent factory — detects which agent sent the request and returns its handler
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest } from 'fastify';
import type { AgentHandler } from './types.js';
import { CopilotHandler } from './copilot.js';
import { KiloHandler } from './kilo.js';
import { log } from '../logger.js';

// ── Singleton handler instances ─────────────────────────────────────────────
const handlers: Map<string, AgentHandler> = new Map();

function ensureHandlers(): void {
  if (handlers.size > 0) return;
  const copilot = new CopilotHandler();
  const kilo = new KiloHandler();
  handlers.set(copilot.name, copilot);
  handlers.set(kilo.name, kilo);
}

// ── Detection logic ─────────────────────────────────────────────────────────
// Order matters: more specific checks first.

function detectAgent(req: FastifyRequest): string {
  // Priority 1: explicit opt-in header (most reliable)
  // Set this in Kilo Code's "Headers (optional)": X-Proxy-Agent: kilo
  const explicitAgent = req.headers['x-proxy-agent'] as string | undefined;
  if (explicitAgent) return explicitAgent.toLowerCase().trim();

  // Priority 2: Kilo Code extension user-agent (set by extension process)
  const ua = ((req.headers['user-agent'] ?? '') as string).toLowerCase();
  if (ua.includes('kilo-code') || ua.includes('kilocode')) return 'kilo';

  // Priority 3: x-kilocode-version header
  if (req.headers['x-kilocode-version']) return 'kilo';

  // Default: GitHub Copilot (backward compatible)
  return 'copilot';
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the agent handler for a given request.
 * Returns the handler instance and the detected agent name.
 */
export function resolveAgentHandler(req: FastifyRequest): { handler: AgentHandler; agentName: string } {
  ensureHandlers();

  const agentName = detectAgent(req);
  const handler = handlers.get(agentName);

  if (!handler) {
    // Should never happen — detectAgent always returns a valid key
    log('warn', 'factory', `Unknown agent "${agentName}", falling back to copilot`);
    return { handler: handlers.get('copilot')!, agentName: 'copilot' };
  }

  log('debug', 'factory', `Detected agent: ${agentName}`);
  return { handler, agentName };
}

/**
 * Get a handler by name directly (useful for testing).
 */
export function getHandler(name: string): AgentHandler | undefined {
  ensureHandlers();
  return handlers.get(name);
}
