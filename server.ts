import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Difficulty = 'rookie' | 'pro' | 'ace';
type RoomPhase = 'lobby' | 'countdown' | 'racing' | 'finished';

interface PeerTelemetry {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  steerAngle: number;
  pitchAngle: number;
  rollAngle: number;
  continuousProgress: number;
  completedLaps: number;
  bestLapMs: number | null;
  isBoosting: boolean;
  isBraking: boolean;
  isDrifting: boolean;
  finished: boolean;
  finishTimeMs: number;
}

interface RoomPlayer {
  id: string;
  name: string;
  carId: string;
  paintHex: string;
  ready: boolean;
  gridSlot: number;
  ws: WebSocket;
  telemetry: PeerTelemetry | null;
  finished: boolean;
  finishTimeMs: number;
  bestLapMs: number | null;
}

interface RoomState {
  code: string;
  hostId: string;
  trackId: string;
  backgroundId: string;
  totalLaps: number;
  difficulty: Difficulty;
  includeAi: boolean;
  phase: RoomPhase;
  raceStartAt: number;
  countdownTimer?: ReturnType<typeof setTimeout>;
  players: Map<string, RoomPlayer>;
}

const rooms = new Map<string, RoomState>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function generatePlayerId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

function serializeRoom(room: RoomState) {
  return {
    code: room.code,
    hostId: room.hostId,
    trackId: room.trackId,
    backgroundId: room.backgroundId,
    totalLaps: room.totalLaps,
    difficulty: room.difficulty,
    includeAi: room.includeAi,
    phase: room.phase,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      carId: p.carId,
      paintHex: p.paintHex,
      ready: p.ready,
      gridSlot: p.gridSlot,
      finished: p.finished,
      finishTimeMs: p.finishTimeMs,
      bestLapMs: p.bestLapMs,
    })),
  };
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: RoomState, payload: unknown, excludeId?: string): void {
  const raw = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (excludeId && player.id === excludeId) continue;
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(raw);
    }
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  wss.on('connection', (ws) => {
    const playerId = generatePlayerId();
    let currentRoomCode: string | null = null;

    ws.on('message', (data) => {
      let msg: { type?: string; [key: string]: unknown };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendJson(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'room:create') {
        // Leave previous room if any
        if (currentRoomCode) {
          removePlayerFromRoom(currentRoomCode, playerId);
        }
        const code = generateRoomCode();
        const playerName = String(msg.name || 'Driver 1').trim().slice(0, 18) || 'Driver 1';
        const carId = String(msg.carId || 'bmw-m4-gt3');
        const paintHex = String(msg.paintHex || '');
        const trackId = String(msg.trackId || 'alpine-sunset');
        const backgroundId = String(msg.backgroundId || 'golden-sunset');
        const totalLaps = [2, 3, 5].includes(Number(msg.totalLaps)) ? Number(msg.totalLaps) : 3;
        const difficulty: Difficulty =
          msg.difficulty === 'rookie' || msg.difficulty === 'ace' ? msg.difficulty : 'pro';
        const includeAi = msg.includeAi !== false;

        const room: RoomState = {
          code,
          hostId: playerId,
          trackId,
          backgroundId,
          totalLaps,
          difficulty,
          includeAi,
          phase: 'lobby',
          raceStartAt: 0,
          players: new Map(),
        };

        room.players.set(playerId, {
          id: playerId,
          name: playerName,
          carId,
          paintHex,
          ready: true,
          gridSlot: 0,
          ws,
          telemetry: null,
          finished: false,
          finishTimeMs: 0,
          bestLapMs: null,
        });

        rooms.set(code, room);
        currentRoomCode = code;

        sendJson(ws, {
          type: 'room:joined',
          playerId,
          room: serializeRoom(room),
        });
        return;
      }

      if (msg.type === 'room:join') {
        const code = String(msg.code || '')
          .trim()
          .toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendJson(ws, {
            type: 'room:error',
            message: `Room "${code}" not found. Check the code and try again.`,
          });
          return;
        }
        if (room.players.size >= 5) {
          sendJson(ws, {
            type: 'room:error',
            message: 'Room is full (maximum 5 drivers).',
          });
          return;
        }
        if (room.phase === 'countdown' || room.phase === 'racing') {
          sendJson(ws, {
            type: 'room:error',
            message: 'Race is already in progress. Wait for the next round.',
          });
          return;
        }

        if (currentRoomCode && currentRoomCode !== code) {
          removePlayerFromRoom(currentRoomCode, playerId);
        }

        const fallbackName = `Driver ${room.players.size + 1}`;
        const playerName = String(msg.name || fallbackName).trim().slice(0, 18) || fallbackName;
        const carId = String(msg.carId || 'porsche-911-gt3');
        const paintHex = String(msg.paintHex || '');

        room.players.set(playerId, {
          id: playerId,
          name: playerName,
          carId,
          paintHex,
          ready: true,
          gridSlot: room.players.size,
          ws,
          telemetry: null,
          finished: false,
          finishTimeMs: 0,
          bestLapMs: null,
        });

        currentRoomCode = code;

        sendJson(ws, {
          type: 'room:joined',
          playerId,
          room: serializeRoom(room),
        });
        broadcastRoom(
          room,
          {
            type: 'room:state',
            room: serializeRoom(room),
          },
          playerId
        );
        return;
      }

      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player) return;

      if (msg.type === 'room:update_player') {
        if (typeof msg.name === 'string' && msg.name.trim()) {
          player.name = msg.name.trim().slice(0, 18);
        }
        if (typeof msg.carId === 'string') {
          player.carId = msg.carId;
        }
        if (typeof msg.paintHex === 'string') {
          player.paintHex = msg.paintHex;
        }
        if (typeof msg.ready === 'boolean') {
          player.ready = msg.ready;
        }
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        return;
      }

      if (msg.type === 'room:update_settings') {
        if (room.hostId !== playerId) return;
        if (typeof msg.trackId === 'string') room.trackId = msg.trackId;
        if (typeof msg.backgroundId === 'string') room.backgroundId = msg.backgroundId;
        if (typeof msg.totalLaps === 'number' && [2, 3, 5].includes(msg.totalLaps)) {
          room.totalLaps = msg.totalLaps;
        }
        if (msg.difficulty === 'rookie' || msg.difficulty === 'pro' || msg.difficulty === 'ace') {
          room.difficulty = msg.difficulty;
        }
        if (typeof msg.includeAi === 'boolean') room.includeAi = msg.includeAi;
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        return;
      }

      if (msg.type === 'room:start') {
        if (room.hostId !== playerId) return;
        if (room.countdownTimer) clearTimeout(room.countdownTimer);

        // Assign starting grid slots cleanly
        let slotIdx = 0;
        for (const p of room.players.values()) {
          p.gridSlot = slotIdx++;
          p.finished = false;
          p.finishTimeMs = 0;
          p.bestLapMs = null;
          p.telemetry = null;
        }

        room.phase = 'countdown';
        room.raceStartAt = Date.now() + 3400;
        broadcastRoom(room, {
          type: 'race:start',
          countdownMs: 3400,
          room: serializeRoom(room),
        });

        room.countdownTimer = setTimeout(() => {
          if (!rooms.has(room.code)) return;
          room.phase = 'racing';
        }, 3400);
        return;
      }

      if (msg.type === 'room:return_lobby') {
        if (room.hostId !== playerId) return;
        if (room.countdownTimer) clearTimeout(room.countdownTimer);
        room.phase = 'lobby';
        for (const p of room.players.values()) {
          p.finished = false;
          p.finishTimeMs = 0;
          p.telemetry = null;
        }
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        return;
      }

      if (msg.type === 'room:leave') {
        removePlayerFromRoom(currentRoomCode, playerId);
        currentRoomCode = null;
        return;
      }

      if (msg.type === 'race:telemetry') {
        const t = msg.telemetry as PeerTelemetry | undefined;
        if (!t || typeof t.x !== 'number' || typeof t.z !== 'number') return;

        player.telemetry = t;
        if (t.finished && !player.finished) {
          player.finished = true;
          player.finishTimeMs = t.finishTimeMs;
        }
        if (typeof t.bestLapMs === 'number') {
          player.bestLapMs = t.bestLapMs;
        }

        // Relay compact peer update immediately to other room drivers
        broadcastRoom(
          room,
          {
            type: 'race:peer_update',
            playerId,
            telemetry: t,
          },
          playerId
        );

        // Check if all human drivers finished
        const allFinished = Array.from(room.players.values()).every((p) => p.finished);
        if (allFinished && room.phase === 'racing') {
          room.phase = 'finished';
          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
        }
      }
    });

    ws.on('close', () => {
      if (currentRoomCode) {
        removePlayerFromRoom(currentRoomCode, playerId);
        currentRoomCode = null;
      }
    });
  });

  function removePlayerFromRoom(code: string, playerId: string): void {
    const room = rooms.get(code);
    if (!room) return;
    room.players.delete(playerId);

    if (room.players.size === 0) {
      if (room.countdownTimer) clearTimeout(room.countdownTimer);
      rooms.delete(code);
      return;
    }

    if (room.hostId === playerId) {
      const nextHost = room.players.values().next().value;
      if (nextHost) {
        room.hostId = nextHost.id;
      }
    }

    broadcastRoom(room, {
      type: 'room:peer_left',
      playerId,
      room: serializeRoom(room),
    });
  }

  // Mount Vite in dev or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Apex Circuit server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
