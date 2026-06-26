// ─────────────────────────────────────────────────────────────────────────────
// Kilo Code agent handler
// Handles OpenAI-compatible API requests from the Kilo Code VSCode extension
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest } from 'fastify';
import type { AgentHandler, UpstreamTarget, TokenUsage } from './types.js';
import { filterHeaders } from './utils.js';
import { getAgentConfig } from '../config.js';

export class KiloHandler implements AgentHandler {
  readonly name = 'kilo';

  resolveUpstream(req: FastifyRequest): UpstreamTarget {
    const rawUrl = req.raw.url ?? '/';
    const config = getAgentConfig('kilo');
    const upstreamHost = config?.upstream.default ?? 'mkp-api.fptcloud.com';

    return {
      url: new URL(`https://${upstreamHost}${rawUrl}`),
      isCodeCompletion: false,
    };
  }

  buildUpstreamHeaders(req: FastifyRequest, targetUrl: URL): Record<string, string> {
    const headers = filterHeaders(req.headers as Record<string, string | string[] | undefined>);
    headers['host'] = targetUrl.host;
    // Authorization, Content-Type, etc. forwarded as-is — no injection needed
    return headers;
  }

  extractTokenUsage(responseBody: string, isStreaming: boolean): TokenUsage {
    const result: TokenUsage = {
      prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
      cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0,
    };
    if (!responseBody) return result;

    const parseUsage = (obj: any): void => {
      if (!obj?.usage) return;
      const u = obj.usage;
      result.prompt_tokens = Number(u.prompt_tokens || 0);
      result.completion_tokens = Number(u.completion_tokens || 0);
      result.total_tokens = Number(u.total_tokens || 0);
      // Optional extended fields
      if (u.prompt_tokens_details?.cached_tokens) {
        result.cache_read_tokens = Number(u.prompt_tokens_details.cached_tokens);
      }
      if (u.completion_tokens_details?.reasoning_tokens) {
        result.reasoning_tokens = Number(u.completion_tokens_details.reasoning_tokens);
      }
    };

    if (isStreaming) {
      const lines = responseBody.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const obj = JSON.parse(jsonStr);
          if (obj?.usage) { parseUsage(obj); break; }
        } catch { /* ignore */ }
      }
    } else {
      try { parseUsage(JSON.parse(responseBody)); } catch { /* ignore */ }
    }

    return result;
  }
}
