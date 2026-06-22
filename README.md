# Copilot Traffic Monitor

A transparent HTTP proxy that sits between **VSCode GitHub Copilot** and the GitHub backend, capturing every request and response for real-time observability — with zero modification to traffic.

---

## What it does

```
VSCode Copilot
     │
     ▼  http://localhost:4000   (plain HTTP from VSCode)
┌──────────────────────────┐
│  Proxy  (Fastify + Undici)│  → forwards to https://api.githubcopilot.com
│  port 4000                │  ← streams response back unchanged
│                           │  ← saves to SQLite
│                           │  ← broadcasts via WebSocket
└────────────┬──────────────┘
             │  ws://localhost:4000/ws
             ▼
┌──────────────────────────┐
│  Dashboard  (React/Vite) │  real-time traffic table
│  port 5173               │  request/response inspector
└──────────────────────────┘
```

### Guarantees
- ✅ All requests forwarded **unchanged** to real GitHub Copilot API
- ✅ All responses forwarded **unchanged** back to VSCode
- ✅ Streaming (`text/event-stream` / SSE) is piped through without buffering delay
- ✅ No prompt modification, no response modification, no routing, no model switching
- ✅ Copilot continues to work exactly as normal

---

## Project structure

```
myLitellm/
├── package.json            root — npm workspaces + concurrently
├── tsconfig.base.json      shared TS config
│
├── proxy/                  Backend (Node.js 22 / Fastify / Undici)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts        entry point, startup banner
│       ├── server.ts       Fastify setup, REST API + catch-all proxy route
│       ├── proxy.ts        transparent proxy handler (Undici)
│       ├── db.ts           SQLite schema + queries (better-sqlite3)
│       ├── websocket.ts    WebSocket broadcast (ws library)
│       └── types.ts        shared TypeScript types
│
└── dashboard/              Frontend (React 18 / Vite / Tailwind)
    ├── package.json
    ├── vite.config.ts      /api proxied → localhost:4000 in dev
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx         root layout, panel split
        ├── types.ts
        ├── hooks/
        │   ├── useWebSocket.ts   auto-reconnecting WS hook
        │   └── useRequests.ts    REST fetch + live WS updates
        └── components/
            ├── Header.tsx        title + live WS status indicator
            ├── StatBar.tsx       total / streaming / errors / avg-duration cards
            ├── RequestTable.tsx  sortable table + filter bar + pagination
            ├── RequestDetail.tsx slide-over panel (req/res headers + body)
            └── StreamViewer.tsx  SSE token parser + assembled-text viewer
```

---

## Prerequisites

- **Node.js 22+**  (`node --version` must show v22.x.x or higher)
- **npm 10+**  (comes with Node 22)

---

## Quick start

### 1. Install dependencies

```powershell
cd e:\myLitellm
npm install
```

### 2. Start proxy + dashboard together

```powershell
npm run dev
```

This runs both workspaces concurrently:
- `proxy` → starts on **http://127.0.0.1:4000**
- `dashboard` → starts on **http://localhost:5173**

> The proxy must be running before the dashboard is useful.

### 3. Configure VSCode

Open your VSCode **settings.json** (`Ctrl+Shift+P` → *Open User Settings (JSON)*) and add:

```json
{
  "github.copilot.advanced": {
    "debug.overrideProxyUrl": "http://localhost:4000",
    "debug.testOverrideProxyUrl": "http://localhost:4000",
    "debug.overrideCapiUrl": "http://localhost:4000"
  }
}
```

Save the file. VSCode will immediately start routing Copilot traffic through the proxy.

### 4. Trigger traffic

- Open any code file in VSCode
- Start typing or use `Ctrl+I` to open inline chat
- Switch to **http://localhost:5173** — you should see requests appear in real time

---

## Dashboard features

| Feature | Description |
|---|---|
| **Stat cards** | Live totals for requests, streaming, errors, avg duration |
| **Live table** | New rows appear instantly via WebSocket (no refresh needed) |
| **Filter bar** | Filter by method, search URL/path, streaming-only toggle |
| **Pagination** | 50 rows per page, navigable |
| **Detail panel** | Click any row → slide-over panel with full headers + body |
| **Request tab** | Request headers + body (pretty-printed JSON) |
| **Response tab** | Response headers + body; SSE responses show assembled text + raw frames |
| **Copy buttons** | One-click copy for headers and body |
| **Clear all** | Wipes SQLite table and resets counters |
| **WS indicator** | Header shows 🟢 Live / connecting / disconnected |

---

## REST API

All endpoints are on the proxy server at `http://localhost:4000`.

### `GET /api/logs`

Returns paginated request logs.

| Query param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Rows per page (max 200) |
| `method` | string | — | Filter by HTTP method (GET, POST, …) |
| `search` | string | — | Substring match on URL/path |
| `streaming` | boolean | — | `true` = SSE only, `false` = non-streaming |
| `from` | number | — | Start timestamp (unix ms) |
| `to` | number | — | End timestamp (unix ms) |

**Response:**
```json
{
  "data": [ ...RequestLog[] ],
  "total": 123
}
```

### `GET /api/logs/:id`

Returns a single log by ID.

### `GET /api/stats`

```json
{
  "total": 42,
  "streaming": 38,
  "errors": 1,
  "avg_duration_ms": 1204
}
```

### `DELETE /api/logs`

Clears all logs from the database. Returns `{ "ok": true }`.

### `GET /ws` (WebSocket)

Connect to receive real-time events:

```jsonc
// request_complete — fired after every proxied request finishes
{
  "type": "request_complete",
  "log": { /* full RequestLog object */ }
}

// stats_update — fired after every request
{
  "type": "stats_update",
  "stats": { "total": 1, "streaming": 1, "errors": 0, "avg_duration_ms": 980 }
}
```

---

## SQLite database

The database is created automatically at **`data/traffic.db`** (relative to the proxy package root, i.e., `e:\myLitellm\data\traffic.db`).

### Schema

```sql
CREATE TABLE request_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp        INTEGER NOT NULL,      -- unix ms
  method           TEXT    NOT NULL,
  url              TEXT    NOT NULL,      -- full upstream URL
  host             TEXT    NOT NULL,
  path             TEXT    NOT NULL,
  request_headers  TEXT    NOT NULL,      -- JSON
  request_body     TEXT,                  -- null if no body
  response_status  INTEGER NOT NULL,
  response_headers TEXT    NOT NULL,      -- JSON
  response_body    TEXT    NOT NULL,      -- accumulated response (utf-8)
  duration_ms      INTEGER NOT NULL,
  is_streaming     INTEGER NOT NULL,      -- 0 or 1
  error            TEXT                   -- null if no error
);
```

---

## How the proxy handles streaming

Copilot completions use **Server-Sent Events** (`Content-Type: text/event-stream`).
The proxy handles them like this:

```
VSCode ← chunk ← proxy ← chunk ← GitHub API
              ↓
          buffer chunk
              ↓
      (after stream ends)
      write full body to SQLite
      broadcast via WebSocket
```

The stream is piped through in real time — no buffering delay for VSCode. The accumulated buffer is only written to the DB after the stream completes.

---

## Running proxy only (without dashboard)

```powershell
cd e:\myLitellm\proxy
npx tsx src/index.ts
```

---

## Running dashboard only (without proxy dev server)

```powershell
cd e:\myLitellm\dashboard
npx vite
```

The dashboard's Vite dev server proxies `/api` calls to `http://127.0.0.1:4000` automatically.

---

## TypeScript type-checking

```powershell
# Both packages
npm run typecheck

# Proxy only
npm run typecheck -w proxy

# Dashboard only
npm run typecheck -w dashboard
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Port the proxy server listens on |
| `HOST` | `127.0.0.1` | Interface to bind (use `0.0.0.0` for LAN access) |

Set them before starting:

```powershell
$env:PORT = "4000"; npm run dev
```

---

## Troubleshooting

### Copilot requests not appearing
1. Verify the VSCode settings are saved correctly
2. Restart VSCode after adding the settings
3. Check the proxy console — it should print each request as `→ POST https://api.githubcopilot.com/...`
4. Make sure port 4000 is not blocked by a firewall

### Dashboard shows "Disconnected"
- The proxy is not running. Start it with `npm run dev`.
- The WebSocket connects to `ws://localhost:4000/ws`. Make sure nothing else is on port 4000.

### `better-sqlite3` build errors on install
`better-sqlite3` is a native addon. If you see build errors, ensure you have:
- **Visual Studio Build Tools** with "Desktop development with C++"  OR
- Run: `npm install --global windows-build-tools`
- Node.js version matches what the prebuilt binary expects (Node 22 has prebuilts available)

### Port 4000 already in use
```powershell
netstat -ano | findstr :4000
# find the PID, then:
taskkill /PID <PID> /F
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Proxy server | Node.js 22, TypeScript, Fastify 4 |
| HTTP forwarding | Undici (built into Node 22, also explicit dep) |
| Streaming | Undici async iterable body |
| WebSocket | `ws` library |
| Storage | SQLite via `better-sqlite3` |
| Frontend | React 18, Vite 5, Tailwind CSS 3 |
| Real-time | WebSocket (native browser API) |
| Icons | Lucide React |
| Date formatting | date-fns |