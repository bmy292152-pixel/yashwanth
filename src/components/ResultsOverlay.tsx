import { Play, RotateCcw, Trophy, Wrench } from 'lucide-react';
import { formatLapTime, formatOrdinal } from '../game/formatTime';
import { TelemetryState } from '../game/types';

interface ResultsOverlayProps {
  telemetry: TelemetryState;
  trackName: string;
  isOnlineHost: boolean;
  onResume: () => void;
  onRestart: () => void;
  onBackToGarage: () => void;
}

export function ResultsOverlay({
  telemetry,
  trackName,
  isOnlineHost,
  onResume,
  onRestart,
  onBackToGarage,
}: ResultsOverlayProps) {
  const isOnline = telemetry.playMode === 'online';

  if (telemetry.phase === 'paused') {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/65 p-4">
        <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0B0E14] p-6 shadow-2xl">
          <h2 className="font-display text-2xl font-bold text-white">
            {isOnline ? 'Menu' : 'Race Paused'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {trackName} · Lap {telemetry.currentLap} of {telemetry.totalLaps}
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 font-display text-sm font-bold text-white transition-colors hover:bg-red-500"
            >
              <Play className="h-4 w-4" />
              Resume Race
            </button>
            {(!isOnline || isOnlineHost) && (
              <button
                type="button"
                onClick={onRestart}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" />
                Restart Race
              </button>
            )}
            <button
              type="button"
              onClick={onBackToGarage}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              <Wrench className="h-4 w-4" />
              {isOnline ? 'Return to Room Lobby' : 'Return to Garage'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (telemetry.phase === 'finished') {
    const playerStanding = telemetry.standings.find((s) => s.id === 'player' || s.isPlayer);
    const rank = playerStanding?.position ?? telemetry.position;

    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-xl rounded-xl border border-white/15 bg-[#0B0E14] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-400">
                {trackName} · {telemetry.totalLaps} Laps Complete
              </div>
              <h2 className="mt-1 font-display text-3xl font-bold text-white">
                Finished {formatOrdinal(rank)}
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/15 text-amber-400">
              <Trophy className="h-5 w-5" />
            </div>
          </div>

          {/* Summary Metrics */}
          <div className="mt-5 grid grid-cols-3 gap-3 border-y border-white/10 py-3.5">
            <div>
              <div className="text-xs text-slate-400">Total Time</div>
              <div className="mt-0.5 font-mono-num text-base font-bold text-white">
                {formatLapTime(playerStanding?.totalTimeMs)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Best Lap</div>
              <div className="mt-0.5 font-mono-num text-base font-bold text-cyan-400">
                {formatLapTime(telemetry.bestLapMs)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Last Lap</div>
              <div className="mt-0.5 font-mono-num text-base font-bold text-slate-200">
                {formatLapTime(telemetry.lastLapMs)}
              </div>
            </div>
          </div>

          {/* Standings Table */}
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-slate-400">Final Standings</div>
            <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.02]">
              {telemetry.standings.map((row) => (
                <div
                  key={row.id}
                  className={`flex items-center justify-between px-3.5 py-2.5 text-sm ${
                    row.isPlayer ? 'bg-red-500/10 text-white font-semibold' : 'text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono-num w-6 text-xs text-slate-400">
                      P{row.position}
                    </span>
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: row.color }}
                    />
                    <span>{row.name}</span>
                    <span className="hidden sm:inline text-xs text-slate-400">
                      · {row.carName}
                    </span>
                  </div>
                  <div className="font-mono-num text-xs text-slate-300">
                    {row.finished ? formatLapTime(row.totalTimeMs) : `Lap ${row.lap}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            {(!isOnline || isOnlineHost) && (
              <button
                type="button"
                onClick={onRestart}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 font-display text-sm font-bold text-white transition-colors hover:bg-red-500"
              >
                <RotateCcw className="h-4 w-4" />
                Race Again
              </button>
            )}
            <button
              type="button"
              onClick={onBackToGarage}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              <Wrench className="h-4 w-4" />
              {isOnline ? 'Room Lobby' : 'Garage'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
