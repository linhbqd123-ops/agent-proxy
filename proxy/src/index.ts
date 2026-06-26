import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const HOST = process.env.HOST ?? '127.0.0.1';

async function main() {
  const app = await buildServer();

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────┐');
    console.log('  │           Agent Traffic Proxy                    │');
    console.log('  ├─────────────────────────────────────────────────┤');
    console.log(`  │  Proxy   →  http://${HOST}:${PORT}             │`);
    console.log(`  │  API     →  http://${HOST}:${PORT}/api/logs    │`);
    console.log(`  │  WS      →  ws://${HOST}:${PORT}/ws           │`);
    console.log('  ├─────────────────────────────────────────────────┤');
    console.log('  │  GitHub Copilot (settings.json):                 │');
    console.log('  │    "debug.overrideProxyUrl":                     │');
    console.log(`  │    "http://${HOST}:${PORT}"                │`);
    console.log('  ├─────────────────────────────────────────────────┤');
    console.log('  │  Kilo Code: set Base URL to                      │');
    console.log(`  │    "http://${HOST}:${PORT}/v1"           │`);
    console.log('  └─────────────────────────────────────────────────┘');
    console.log('');
    console.log(`[proxy] Listening on ${address}`);
  } catch (err) {
    console.error('[proxy] Failed to start:', err);
    process.exit(1);
  }
}

main();
