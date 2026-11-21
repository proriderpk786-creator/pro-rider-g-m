import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { initDatabase } from './server/db.ts';
import { registerAppRoutes } from './server/routes.ts';
import { registerAdminRoutes } from './server/adminRoutes.ts';
import { attachWebSocketServer } from './server/ws.ts';

async function startServer() {
  initDatabase();

  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true }));

  registerAppRoutes(app);
  registerAdminRoutes(app);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'PRO RIDER AI' });
  });

  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: {
          server: httpServer,
          path: '/__vite_ws',
        },
      },
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

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`PRO RIDER AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PRO RIDER AI server:', err);
  process.exit(1);
});
