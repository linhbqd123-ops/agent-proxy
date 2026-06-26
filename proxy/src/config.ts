// ─────────────────────────────────────────────────────────────────────────────
// Agent proxy configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Display name for logs */
  name: string;
  /** Whether this agent is enabled */
  enabled: boolean;
  /** Upstream base URL(s) — agent handlers interpret these */
  upstream: Record<string, string>;
}

export interface ProxyConfig {
  agents: Record<string, AgentConfig>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default configuration — can be extended with a config file later
// ─────────────────────────────────────────────────────────────────────────────

const config: ProxyConfig = {
  agents: {
    copilot: {
      name: 'GitHub Copilot',
      enabled: true,
      upstream: {
        chat: 'api.githubcopilot.com',
        completion: 'proxy.individual.githubcopilot.com',
      },
    },
    kilo: {
      name: 'Kilo Code',
      enabled: true,
      upstream: {
        default: 'mkp-api.fptcloud.com',
      },
    },
  },
};

export function getConfig(): ProxyConfig {
  return config;
}

export function getAgentConfig(agentName: string): AgentConfig | undefined {
  return config.agents[agentName];
}
