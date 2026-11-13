import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { dispatchSmashPointApi } from './src/shared/apiHandlers.ts';
import { loadDatabase, saveDatabase } from './server/store.ts';

const PORT = Number(process.env.PORT) || 3000;

interface WsClientMeta {
  tournamentId: string;
}

const clientSubscriptions = new Map<WebSocket, WsClientMeta>();

function broadcastTournamentUpdate(
  tournamentId: string,
  eventType = 'tournament:updated',
  matchId?: string
) {
  const payload = JSON.stringify({
    type: eventType,
    tournamentId,
    matchId,
    timestamp: new Date().toISOString(),
  });

  for (const [client, meta] of clientSubscriptions.entries()) {
    if (client.readyState === WebSocket.OPEN) {
      if (meta.tournamentId === 'all' || meta.tournamentId === tournamentId) {
        client.send(payload);
      }
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clientSubscriptions.set(ws, { tournamentId: 'all' });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; tournamentId?: string };
        if (msg.type === 'subscribe' && msg.tournamentId) {
          clientSubscriptions.set(ws, { tournamentId: msg.tournamentId });
        }
      } catch {
        // Ignore malformed ws messages
      }
    });

    ws.on('close', () => {
      clientSubscriptions.delete(ws);
    });

    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  });

  // Delegate all /api/* routes to isomorphic SmashPoint API dispatcher
  app.use('/api', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, x-referee-pin, x-smashpoint-role'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('X-SmashPoint-API', '1');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const result = dispatchSmashPointApi(
      req.method,
      req.originalUrl,
      req.body,
      req.headers,
      {
        load: loadDatabase,
        save: saveDatabase,
        broadcast: broadcastTournamentUpdate,
      }
    );
    res.status(result.status).json(result.data);
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SmashPoint server running at http://localhost:${PORT}`);
  });
}

startServer();
