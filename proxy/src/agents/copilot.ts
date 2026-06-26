// ─────────────────────────────────────────────────────────────────────────────
// GitHub Copilot agent handler
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest } from 'fastify';
import type { AgentHandler, UpstreamTarget, TokenUsage } from './types.js';
import { filterHeaders } from './utils.js';
import { getAgentConfig } from '../config.js';

export class CopilotHandler implements AgentHandler {
  readonly name = 'copilot';

  resolveUpstream(req: FastifyRequest): UpstreamTarget {
    const rawUrl = req.raw.url ?? '/';
    const config = getAgentConfig('copilot');
    const chatHost = config?.upstream.chat ?? 'api.githubcopilot.com';
    const completionHost = config?.upstream.completion ?? 'proxy.individual.githubcopilot.com';

    // Case 1: true HTTP-proxy mode — client sends absolute URL
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      const u = new URL(rawUrl);
      u.protocol = 'https:';
      return { url: u, isCodeCompletion: u.host === completionHost };
    }

    // Case 2: API-base-override mode — path-only URL
    const rawIntegrationId = req.headers['copilot-integration-id'];
    const copilotIntegrationId = rawIntegrationId
      ? (Array.isArray(rawIntegrationId) ? rawIntegrationId[0] : rawIntegrationId)
      : null;

    if (!copilotIntegrationId && /\/completions(?:\?|$)/.test(rawUrl)) {
      // No copilot-integration-id → Code Completion request
      return { url: new URL(`https://${completionHost}${rawUrl}`), isCodeCompletion: true };
    }

    return { url: new URL(`https://${chatHost}${rawUrl}`), isCodeCompletion: false };
  }

  buildUpstreamHeaders(req: FastifyRequest, targetUrl: URL): Record<string, string> {
    const headers = filterHeaders(req.headers as Record<string, string | string[] | undefined>);
    headers['host'] = targetUrl.host;

    // Inject Editor-Version if missing — required by Copilot IDE auth
    if (!headers['editor-version']) headers['Editor-Version'] = 'vscode/1.90.0';
    if (!headers['editor-plugin-version']) headers['Editor-Plugin-Version'] = 'copilot-chat/0.53.0';

    return headers;
  }

  extractTokenUsage(responseBody: string, isStreaming: boolean): TokenUsage {
    const result: TokenUsage = {
      prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
      cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0,
    };
    if (!responseBody) return result;

    const parseTokenDetails = (obj: any): void => {
      if (obj.copilot_usage && Array.isArray(obj.copilot_usage.token_details)) {
        let input = 0, output = 0;
        for (const item of obj.copilot_usage.token_details) {
          const count = Number(item.token_count || 0);
          switch (item.token_type) {
            case 'input':       input += count; break;
            case 'cache_read':  input += count; result.cache_read_tokens += count; break;
            case 'cache_write': input += count; result.cache_write_tokens += count; break;
            case 'output':      output += count; break;
            case 'reasoning':
            case 'thinking':    result.reasoning_tokens += count; output += count; break;
          }
        }
        result.prompt_tokens = input;
        result.completion_tokens = output;
        result.total_tokens = input + output;
      } else if (obj.usage?.prompt_tokens != null) {
        result.prompt_tokens = Number(obj.usage.prompt_tokens);
        result.completion_tokens = Number(obj.usage.completion_tokens || 0);
        result.total_tokens = Number(obj.usage.total_tokens || 0);
      } else if (obj.usage?.input_tokens != null) {
        result.prompt_tokens = Number(obj.usage.input_tokens);
        result.completion_tokens = Number(obj.usage.output_tokens || 0);
        result.total_tokens = result.prompt_tokens + result.completion_tokens;
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
          if (obj?.usage || obj?.copilot_usage) { parseTokenDetails(obj); break; }
        } catch { /* ignore */ }
      }
    } else {
      try {
        const obj = JSON.parse(responseBody);
        if (obj?.usage || obj?.copilot_usage) parseTokenDetails(obj);
      } catch { /* ignore */ }
    }

    return result;
  }
}
