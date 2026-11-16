import { Difficulty, PeerTelemetryPacket, RoomSnapshot } from './types';

export interface MultiplayerHandlers {
  onConnectedChange: (connected: boolean) => void;
  onRoomJoined: (playerId: string, room: RoomSnapshot) => void;
  onRoomState: (room: RoomSnapshot) => void;
  onPeerLeft: (playerId: string, room: RoomSnapshot) => void;
  onRaceStart: (room: RoomSnapshot, countdownMs: number) => void;
  onPeerTelemetry: (playerId: string, telemetry: PeerTelemetryPacket) => void;
  onError: (message: string) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private handlers: MultiplayerHandlers;
  private disposed = false;
  private pingTimer: number | null = null;
  private pendingQueue: unknown[] = [];

  constructor(handlers: MultiplayerHandlers) {
    this.handlers = handlers;
  }

  public connect(): void {
    if (this.disposed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.handlers.onConnectedChange(true);
      while (this.pendingQueue.length > 0) {
        const next = this.pendingQueue.shift();
        this.send(next);
      }
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        this.send({ type: 'ping' });
      }, 20000);
    };

    ws.onmessage = (event) => {
      let msg: { type?: string; [key: string]: unknown };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      switch (msg.type) {
        case 'room:joined':
          this.handlers.onRoomJoined(
            String(msg.playerId),
            msg.room as RoomSnapshot
          );
          break;
        case 'room:state':
          this.handlers.onRoomState(msg.room as RoomSnapshot);
          break;
        case 'room:peer_left':
          this.handlers.onPeerLeft(
            String(msg.playerId),
            msg.room as RoomSnapshot
          );
          break;
        case 'race:start':
          this.handlers.onRaceStart(
            msg.room as RoomSnapshot,
            Number(msg.countdownMs || 3400)
          );
          break;
        case 'race:peer_update':
          this.handlers.onPeerTelemetry(
            String(msg.playerId),
            msg.telemetry as PeerTelemetryPacket
          );
          break;
        case 'room:error':
          this.handlers.onError(String(msg.message || 'Multiplayer error'));
          break;
      }
    };

    ws.onclose = () => {
      this.handlers.onConnectedChange(false);
      if (this.pingTimer) {
        window.clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
    };

    ws.onerror = () => {
      this.handlers.onError('Unable to reach multiplayer server.');
    };
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.pendingQueue.push(payload);
      this.connect();
    }
  }

  public createRoom(opts: {
    name: string;
    carId: string;
    paintHex: string;
    trackId: string;
    backgroundId: string;
    totalLaps: number;
    difficulty: Difficulty;
    includeAi: boolean;
  }): void {
    this.send({ type: 'room:create', ...opts });
  }

  public joinRoom(opts: {
    code: string;
    name: string;
    carId: string;
    paintHex: string;
  }): void {
    this.send({ type: 'room:join', ...opts });
  }

  public updatePlayer(opts: {
    name?: string;
    carId?: string;
    paintHex?: string;
    ready?: boolean;
  }): void {
    this.send({ type: 'room:update_player', ...opts });
  }

  public updateSettings(opts: {
    trackId?: string;
    backgroundId?: string;
    totalLaps?: number;
    difficulty?: Difficulty;
    includeAi?: boolean;
  }): void {
    this.send({ type: 'room:update_settings', ...opts });
  }

  public startRace(): void {
    this.send({ type: 'room:start' });
  }

  public returnToLobby(): void {
    this.send({ type: 'room:return_lobby' });
  }

  public leaveRoom(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:leave' }));
    }
  }

  public sendTelemetry(telemetry: PeerTelemetryPacket): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'race:telemetry', telemetry }));
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
