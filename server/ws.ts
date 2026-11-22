import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyAuthToken, type UserRole } from './auth.ts';
import { db } from './db.ts';
import { createLiveGeminiSession, type AiPersona } from './gemini.ts';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  role: UserRole;
}

const clients = new Set<ConnectedClient>();

export function attachWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const liveWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (url.pathname === '/live') {
      liveWss.handleUpgrade(req, socket, head, (ws) => {
        liveWss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token ? verifyAuthToken(token) : null;

    if (!payload) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const client: ConnectedClient = {
      ws,
      userId: payload.sub,
      role: payload.role,
    };
    clients.add(client);

    ws.send(JSON.stringify({ event: 'ws:connected', data: { userId: payload.sub, role: payload.role } }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event?: string; data?: Record<string, unknown> };
        if (msg.event === 'partner:location' && client.role === 'partner' && msg.data) {
          const lat = Number(msg.data.lat);
          const lng = Number(msg.data.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const partner = db
              .prepare('SELECT verification_status, is_online FROM partner_profiles WHERE user_id = ?')
              .get(client.userId) as { verification_status: string; is_online: number } | undefined;
            if (partner && partner.verification_status === 'approved') {
              db.prepare(
                'UPDATE partner_profiles SET current_lat = ?, current_lng = ?, last_location_at = datetime(\'now\') WHERE user_id = ?'
              ).run(lat, lng, client.userId);

              const activeTrips = db
                .prepare(
                  `SELECT id, passenger_id FROM bookings WHERE partner_id = ? AND status IN ('confirmed', 'on_the_way', 'arrived', 'started')`
                )
                .all(client.userId) as Array<{ id: string; passenger_id: string }>;

              for (const trip of activeTrips) {
                emitToUser(trip.passenger_id, 'passenger', 'partner:location', {
                  bookingId: trip.id,
                  partnerId: client.userId,
                  lat,
                  lng,
                  timestamp: new Date().toISOString(),
                });
              }
              emitToRole('admin', 'partner:location', {
                partnerId: client.userId,
                lat,
                lng,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      } catch {
        // ignore malformed WS frames
      }
    });

    ws.on('close', () => {
      clients.delete(client);
    });
  });

  // ===========================================================================
  // GEMINI LIVE API BIDIRECTIONAL VOICE BRIDGE (/live)
  // ===========================================================================
  liveWss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '/live', 'http://localhost');
    const rawPersona = url.searchParams.get('persona');
    const persona: AiPersona =
      rawPersona === 'partner' ? 'partner' : rawPersona === 'passenger' ? 'passenger' : 'general';
    const lang = url.searchParams.get('lang') === 'ur' ? 'ur' : 'en';

    let session: any = null;
    let closed = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (!closed && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    try {
      session = await createLiveGeminiSession({
        persona,
        lang,
        onAudio: (data) => safeSend({ type: 'audio', data }),
        onInputTranscript: (text) => safeSend({ type: 'inputTranscript', text }),
        onOutputTranscript: (text) => safeSend({ type: 'outputTranscript', text }),
        onTurnComplete: () => safeSend({ type: 'turnComplete' }),
        onInterrupted: () => safeSend({ type: 'interrupted' }),
        onError: (message) => safeSend({ type: 'error', message }),
        onClose: () => safeSend({ type: 'closed' }),
      });
      safeSend({ type: 'ready' });
    } catch (err: any) {
      safeSend({ type: 'error', message: err?.message || 'Unable to connect Gemini Live voice session' });
      ws.close();
      return;
    }

    ws.on('message', (raw) => {
      if (!session || closed) return;
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; data?: string; text?: string };
        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          session.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text.trim() }] }],
            turnComplete: true,
          });
        }
      } catch {
        // ignore malformed audio frame
      }
    });

    ws.on('close', () => {
      closed = true;
      try {
        session?.close();
      } catch {
        // ignore
      }
    });
  });

  return wss;
}

export function emitToUser(userId: string, role: UserRole, event: string, data: unknown) {
  const payload = JSON.stringify({ event, data });
  for (const c of clients) {
    if (c.userId === userId && c.role === role && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

export function emitToRole(role: UserRole, event: string, data: unknown) {
  const payload = JSON.stringify({ event, data });
  for (const c of clients) {
    if (c.role === role && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

export function emitToApprovedOnlinePartners(event: string, data: unknown) {
  const approvedOnline = db
    .prepare(
      `SELECT user_id FROM partner_profiles WHERE verification_status = 'approved' AND is_online = 1`
    )
    .all() as Array<{ user_id: string }>;
  const allowedIds = new Set(approvedOnline.map((r) => r.user_id));
  const payload = JSON.stringify({ event, data });
  for (const c of clients) {
    if (c.role === 'partner' && allowedIds.has(c.userId) && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

export function emitToAll(event: string, data: unknown) {
  const payload = JSON.stringify({ event, data });
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}
