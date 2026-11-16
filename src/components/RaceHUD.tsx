import { Camera, Pause, Volume2, VolumeX } from 'lucide-react';
import { formatLapTime, formatOrdinal } from '../game/formatTime';
import { ControlInput, TelemetryState } from '../game/types';

interface RaceHUDProps {
  telemetry: TelemetryState;
  muted: boolean;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onTouchInput: (partial: Partial<ControlInput>) => void;
}

export function RaceHUD({
  telemetry,
  muted,
  onCycleCamera,
  onToggleMute,
  onTogglePause,
  onTouchInput,
}: RaceHUDProps) {
  const isSplit = telemetry.playMode === 'splitscreen' && Boolean(telemetry.p2);
  const rpmPct = Math.round(telemetry.rpmNormalized * 100);
  const boostPct = Math.round(telemetry.boostCharge);

  const cameraLabel =
    telemetry.cameraMode === 'chase'
      ? 'Chase'
      : telemetry.cameraMode === 'far'
        ? 'Wide'
        : 'Hood';

  if (isSplit && telemetry.p2) {
    const p2 = telemetry.p2;
    const p2RpmPct = Math.round(p2.rpmNormalized * 100);
    const p2BoostPct = Math.round(p2.boostCharge);

    return (
      <div className="pointer-events-none fixed inset-0 z-10">
        {/* Center Split Divider */}
        <div className="fixed inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/25" />

        {/* Top-Center Shared Controls */}
        <div className="pointer-events-auto fixed top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
          <button
            type="button"
            onClick={onCycleCamera}
            title="Switch camera (C)"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0E14]/90 px-2.5 text-xs font-medium text-slate-200 hover:text-white"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>{cameraLabel}</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0B0E14]/90 text-slate-200 hover:text-white"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            aria-label="Pause race"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0B0E14]/90 text-slate-200 hover:text-white"
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>

        {/* Center Countdown */}
        {telemetry.phase === 'countdown' && (
          <div className="fixed top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-[#0B0E14]/92 px-8 py-4 text-center">
            <div className="text-xs font-medium text-slate-400">2P Grid Start</div>
            <div className="mt-1 font-display text-6xl font-bold text-red-500 font-mono-num">
              {telemetry.countdownValue > 0 ? telemetry.countdownValue : 'GO'}
            </div>
          </div>
        )}

        {/* Left Half: Player 1 HUD */}
        <div className="fixed inset-y-0 left-0 flex w-1/2 flex-col justify-between p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <div className="rounded-lg border border-cyan-400/30 bg-[#0B0E14]/88 px-3 py-2">
              <div className="text-[10px] font-semibold text-cyan-400">Player 1</div>
              <div className="mt-0.5 flex items-baseline gap-2 font-display">
                <span className="font-mono-num text-xl font-bold text-white">
                  {formatOrdinal(telemetry.position)}
                </span>
                <span className="font-mono-num text-xs text-slate-400">
                  Lap {telemetry.currentLap}/{telemetry.totalLaps}
                </span>
              </div>
            </div>
          </div>

          {telemetry.wrongWay && telemetry.phase === 'racing' && (
            <div className="mx-auto rounded-lg border border-red-500/60 bg-red-950/90 px-4 py-1.5 font-display text-sm font-bold text-red-200">
              Wrong Way
            </div>
          )}

          <div className="flex items-end justify-between">
            <div className="hidden lg:block rounded-md border border-white/10 bg-[#0B0E14]/85 px-2.5 py-1.5 text-[11px] text-slate-300">
              WASD · Space Drift · L-Shift Nitro
            </div>
            <div className="w-44 rounded-lg border border-white/10 bg-[#0B0E14]/90 p-3">
              <div className="flex items-end justify-between">
                <div>
                  <span className="font-mono-num font-display text-2xl font-bold text-white">
                    {telemetry.speedKmh}
                  </span>
                  <span className="ml-1 text-[10px] text-slate-400">km/h</span>
                </div>
                <span className="font-mono-num font-display text-lg font-bold text-amber-400">
                  G{telemetry.gear}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-slate-200 transition-all duration-75"
                  style={{ width: `${rpmPct}%` }}
                />
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${boostPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Half: Player 2 HUD */}
        <div className="fixed inset-y-0 right-0 flex w-1/2 flex-col justify-between p-3 sm:p-4">
          <div className="flex items-start justify-end gap-2">
            <div className="rounded-lg border border-amber-400/30 bg-[#0B0E14]/88 px-3 py-2 text-right">
              <div className="text-[10px] font-semibold text-amber-400">Player 2</div>
              <div className="mt-0.5 flex items-baseline gap-2 font-display">
                <span className="font-mono-num text-xl font-bold text-white">
                  {formatOrdinal(p2.position)}
                </span>
                <span className="font-mono-num text-xs text-slate-400">
                  Lap {p2.currentLap}/{telemetry.totalLaps}
                </span>
              </div>
            </div>
          </div>

          {p2.wrongWay && telemetry.phase === 'racing' && (
            <div className="mx-auto rounded-lg border border-red-500/60 bg-red-950/90 px-4 py-1.5 font-display text-sm font-bold text-red-200">
              Wrong Way
            </div>
          )}

          <div className="flex items-end justify-between">
            <div className="w-44 rounded-lg border border-white/10 bg-[#0B0E14]/90 p-3">
              <div className="flex items-end justify-between">
                <div>
                  <span className="font-mono-num font-display text-2xl font-bold text-white">
                    {p2.speedKmh}
                  </span>
                  <span className="ml-1 text-[10px] text-slate-400">km/h</span>
                </div>
                <span className="font-mono-num font-display text-lg font-bold text-amber-400">
                  G{p2.gear}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-slate-200 transition-all duration-75"
                  style={{ width: `${p2RpmPct}%` }}
                />
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${p2BoostPct}%` }}
                />
              </div>
            </div>
            <div className="hidden lg:block rounded-md border border-white/10 bg-[#0B0E14]/85 px-2.5 py-1.5 text-[11px] text-slate-300">
              Arrows · Enter Drift · R-Shift Nitro
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Row: Position/Lap/Timing (left) + Minimap & Controls (right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Race Telemetry */}
        <div className="flex items-stretch gap-2.5">
          <div className="rounded-lg border border-white/10 bg-[#0B0E14]/88 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-400">Position</div>
            <div className="mt-0.5 flex items-baseline gap-1 font-display">
              <span className="font-mono-num text-2xl sm:text-3xl font-bold text-white">
                {formatOrdinal(telemetry.position)}
              </span>
              <span className="font-mono-num text-xs text-slate-400">
                / {telemetry.totalCars}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B0E14]/88 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-400">Lap</div>
            <div className="mt-0.5 flex items-baseline gap-1 font-display">
              <span className="font-mono-num text-2xl sm:text-3xl font-bold text-white">
                {telemetry.currentLap}
              </span>
              <span className="font-mono-num text-xs text-slate-400">
                / {telemetry.totalLaps}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex flex-col justify-center rounded-lg border border-white/10 bg-[#0B0E14]/88 px-4 py-2">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-slate-400">Lap Time</span>
              <span className="font-mono-num font-bold text-white">
                {formatLapTime(telemetry.currentLapMs)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4 text-xs">
              <span className="text-slate-400">Best Lap</span>
              <span className="font-mono-num font-medium text-cyan-400">
                {formatLapTime(telemetry.bestLapMs)}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Right Minimap & Action Controls */}
        <div className="flex items-start gap-2">
          <div className="hidden sm:block h-24 w-24 rounded-lg border border-white/10 bg-[#0B0E14]/88 p-1.5">
            <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
              <path
                d={telemetry.minimapPath}
                fill="none"
                stroke="#334155"
                strokeWidth="5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={telemetry.minimapPath}
                fill="none"
                stroke="#64748B"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {telemetry.minimapCars.map((car) => (
                <circle
                  key={car.id}
                  cx={car.x}
                  cy={car.y}
                  r={car.isPlayer ? 4.2 : 3.0}
                  fill={car.isPlayer ? '#EF4444' : car.color}
                  stroke={car.isPlayer ? '#FFFFFF' : '#0B0E14'}
                  strokeWidth={car.isPlayer ? 1.4 : 0.8}
                />
              ))}
            </svg>
          </div>

          <div className="pointer-events-auto flex flex-col gap-1.5 sm:flex-row">
            <button
              type="button"
              onClick={onCycleCamera}
              title="Switch camera (C)"
              className="flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0E14]/88 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{cameraLabel}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#0B0E14]/88 text-slate-200 transition-colors hover:border-white/25 hover:text-white"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={onTogglePause}
              aria-label="Pause race"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#0B0E14]/88 text-slate-200 transition-colors hover:border-white/25 hover:text-white"
            >
              <Pause className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Center Status Banner */}
      <div className="flex flex-col items-center justify-center">
        {telemetry.phase === 'countdown' && (
          <div className="rounded-xl border border-white/15 bg-[#0B0E14]/90 px-8 py-4 text-center">
            <div className="text-xs font-medium text-slate-400">Starting Grid</div>
            <div className="mt-1 font-display text-6xl font-bold tracking-tight text-red-500 font-mono-num">
              {telemetry.countdownValue > 0 ? telemetry.countdownValue : 'GO'}
            </div>
          </div>
        )}

        {telemetry.phase === 'racing' && telemetry.wrongWay && (
          <div className="rounded-lg border border-red-500/60 bg-red-950/90 px-5 py-2 font-display text-lg font-bold tracking-wide text-red-200">
            Wrong Way — Turn Around
          </div>
        )}
      </div>

      {/* Bottom Row: Controls Help / Touch Controls (left) + Speedometer Cluster (right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Desktop Controls Hint */}
        <div className="hidden md:flex items-center gap-3 rounded-lg border border-white/10 bg-[#0B0E14]/85 px-3.5 py-2 text-xs text-slate-300">
          <span>WASD / Arrows Drive</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>Space Drift</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>Shift Nitro</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>C Camera</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>Esc Pause</span>
        </div>

        {/* Mobile / Touch Controls */}
        <div className="pointer-events-auto flex md:hidden items-center gap-2">
          <button
            type="button"
            onPointerDown={() => onTouchInput({ steerLeft: true })}
            onPointerUp={() => onTouchInput({ steerLeft: false })}
            onPointerLeave={() => onTouchInput({ steerLeft: false })}
            onPointerCancel={() => onTouchInput({ steerLeft: false })}
            className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-[#0B0E14]/85 font-display text-lg font-bold text-white active:bg-white/20"
          >
            ◀
          </button>
          <button
            type="button"
            onPointerDown={() => onTouchInput({ steerRight: true })}
            onPointerUp={() => onTouchInput({ steerRight: false })}
            onPointerLeave={() => onTouchInput({ steerRight: false })}
            onPointerCancel={() => onTouchInput({ steerRight: false })}
            className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-[#0B0E14]/85 font-display text-lg font-bold text-white active:bg-white/20"
          >
            ▶
          </button>
        </div>

        {/* Speedometer, Gear, RPM & Nitro Cluster */}
        <div className="flex items-end gap-2">
          {/* Mobile Pedals */}
          <div className="pointer-events-auto flex md:hidden items-center gap-1.5 mr-1">
            <button
              type="button"
              onPointerDown={() => onTouchInput({ brake: true })}
              onPointerUp={() => onTouchInput({ brake: false })}
              onPointerLeave={() => onTouchInput({ brake: false })}
              onPointerCancel={() => onTouchInput({ brake: false })}
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-red-500/40 bg-[#0B0E14]/85 text-xs font-semibold text-red-300 active:bg-red-500/30"
            >
              Brake
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput({ boost: true, throttle: true })}
              onPointerUp={() => onTouchInput({ boost: false })}
              onPointerLeave={() => onTouchInput({ boost: false })}
              onPointerCancel={() => onTouchInput({ boost: false })}
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-400/40 bg-[#0B0E14]/85 text-xs font-semibold text-cyan-300 active:bg-cyan-500/30"
            >
              Nitro
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput({ throttle: true })}
              onPointerUp={() => onTouchInput({ throttle: false })}
              onPointerLeave={() => onTouchInput({ throttle: false })}
              onPointerCancel={() => onTouchInput({ throttle: false })}
              className="flex h-14 w-16 items-center justify-center rounded-xl border border-emerald-400/40 bg-[#0B0E14]/85 text-xs font-semibold text-emerald-300 active:bg-emerald-500/30"
            >
              Gas
            </button>
          </div>

          <div className="w-52 sm:w-60 rounded-xl border border-white/10 bg-[#0B0E14]/90 p-3.5">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono-num font-display text-3xl sm:text-4xl font-bold leading-none text-white">
                  {telemetry.speedKmh}
                </div>
                <div className="mt-1 text-[11px] font-medium text-slate-400">
                  km/h
                  {telemetry.isDrifting ? ' · Drift' : ''}
                  {telemetry.isBoosting ? ' · Nitro' : ''}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] font-medium text-slate-400">Gear</div>
                <div className="font-mono-num font-display text-2xl font-bold leading-none text-amber-400">
                  {telemetry.gear}
                </div>
              </div>
            </div>

            {/* RPM Gauge */}
            <div className="mt-2.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full transition-all duration-75 ${
                    rpmPct > 86 ? 'bg-red-500' : rpmPct > 65 ? 'bg-amber-400' : 'bg-slate-200'
                  }`}
                  style={{ width: `${rpmPct}%` }}
                />
              </div>
            </div>

            {/* Nitro Boost Gauge */}
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Nitro</span>
                <span className="font-mono-num text-cyan-400">{boostPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${boostPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
