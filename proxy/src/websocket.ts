import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import type { WsEvent } from './types.js';

let wss: WebSocketServer | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Attach the WebSocket server to an existing HTTP server
// ─────────────────────────────────────────────────────────────────────────────

export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = req.url ?? '';
    if (url === '/ws' || url.startsWith('/ws?')) {
      wss!.handleUpgrade(req, socket, head, (client) => {
        wss!.emit('connection', client, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (client: WebSocket) => {
    console.log('[ws] client connected — total:', wss!.clients.size);

    client.on('close', () => {
      console.log('[ws] client disconnected — total:', wss!.clients.size);
    });

    client.on('error', (err) => {
      console.warn('[ws] client error:', err.message);
    });
  });

  return wss;
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast a typed event to all connected dashboard clients
// ─────────────────────────────────────────────────────────────────────────────

export function broadcast(event: WsEvent): void {
  if (!wss) return;

  const payload = JSON.stringify(event);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload, (err) => {
        if (err) console.warn('[ws] send error:', err.message);
      });
    }
  }
}
