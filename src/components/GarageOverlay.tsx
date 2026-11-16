import { useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Flag,
  LogOut,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  BACKGROUND_PRESETS,
  CAR_SPECS,
  PAINT_SWATCHES,
  TRACK_CONFIGS,
} from '../game/catalog';
import {
  BackgroundPreset,
  CarSpec,
  Difficulty,
  PlayMode,
  RoomSnapshot,
  TrackConfig,
} from '../game/types';

interface GarageOverlayProps {
  playMode: PlayMode;
  selectedTrack: TrackConfig;
  selectedCar: CarSpec;
  selectedCarP2: CarSpec;
  selectedBackground: BackgroundPreset;
  paintHex: string;
  difficulty: Difficulty;
  totalLaps: number;
  muted: boolean;
  // Online multiplayer props
  driverName: string;
  joinCode: string;
  onlineRoom: RoomSnapshot | null;
  localPlayerId: string | null;
  onlineError: string | null;
  includeAi: boolean;
  onChangePlayMode: (mode: PlayMode) => void;
  onSelectTrack: (track: TrackConfig) => void;
  onSelectCar: (car: CarSpec) => void;
  onSelectCarP2: (car: CarSpec) => void;
  onSelectBackground: (bg: BackgroundPreset) => void;
  onSelectPaint: (hex: string) => void;
  onChangeDifficulty: (diff: Difficulty) => void;
  onChangeLaps: (laps: number) => void;
  onToggleMute: () => void;
  onOrbitDrag: (deltaRadians: number) => void;
  onStartRace: () => void;
  onChangeDriverName: (name: string) => void;
  onChangeJoinCode: (code: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onLeaveRoom: () => void;
  onToggleIncludeAi: (include: boolean) => void;
}

export function GarageOverlay({
  playMode,
  selectedTrack,
  selectedCar,
  selectedCarP2,
  selectedBackground,
  paintHex,
  difficulty,
  totalLaps,
  muted,
  driverName,
  joinCode,
  onlineRoom,
  localPlayerId,
  onlineError,
  includeAi,
  onChangePlayMode,
  onSelectTrack,
  onSelectCar,
  onSelectCarP2,
  onSelectBackground,
  onSelectPaint,
  onChangeDifficulty,
  onChangeLaps,
  onToggleMute,
  onOrbitDrag,
  onStartRace,
  onChangeDriverName,
  onChangeJoinCode,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleIncludeAi,
}: GarageOverlayProps) {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  const activePaint = paintHex || selectedCar.primaryColor;
  const isHost = !onlineRoom || onlineRoom.hostId === localPlayerId;
  const canEditTrackSettings = playMode !== 'online' || isHost;

  const handleCopyInvite = () => {
    if (!onlineRoom) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${onlineRoom.code}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
      {/* Transparent drag-to-orbit layer behind HUD buttons */}
      <div
        className="pointer-events-auto fixed inset-0 z-0 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          draggingRef.current = true;
          lastXRef.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const dx = e.clientX - lastXRef.current;
          lastXRef.current = e.clientX;
          onOrbitDrag(-dx * 0.008);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      />

      {/* Top Bar: Minimal Brand & Mute toggle */}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#0B0E14]/90 px-4 py-3">
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
            Apex Circuit
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            {selectedCar.name} · {selectedTrack.name} · {selectedBackground.name}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#0B0E14]/90 text-slate-200 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Bottom Collapsible Control Dock leaving 3D car showcase unobstructed */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1080px] flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-2 flex items-center gap-1.5 rounded-md border border-white/10 bg-[#0B0E14]/90 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show Setup
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Hide Setup
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full rounded-xl border border-white/10 bg-[#0B0E14]/94 p-4 shadow-2xl">
            {/* Play Mode Tabs + Online Room Strip */}
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                {(
                  [
                    { id: 'solo', label: 'Solo vs AI' },
                    { id: 'splitscreen', label: '2P Split-Screen' },
                    { id: 'online', label: 'Online Friends' },
                  ] as { id: PlayMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onChangePlayMode(m.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      playMode === m.id
                        ? 'bg-white text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {playMode === 'splitscreen' && (
                <div className="text-xs text-slate-300">
                  P1: WASD + Space / L-Shift · P2: Arrows + Enter / R-Shift
                </div>
              )}

              {playMode === 'online' && !onlineRoom && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => onChangeDriverName(e.target.value)}
                    placeholder="Your name"
                    maxLength={18}
                    className="h-8 w-32 rounded-md border border-white/15 bg-white/[0.05] px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={onCreateRoom}
                    className="h-8 rounded-md bg-cyan-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap shrink-0"
                  >
                    Create Room
                  </button>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => onChangeJoinCode(e.target.value.toUpperCase())}
                      placeholder="Code"
                      maxLength={6}
                      className="h-8 w-20 rounded-md border border-white/15 bg-white/[0.05] px-2 font-mono-num text-xs uppercase text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={onJoinRoom}
                      className="h-8 rounded-md border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20 whitespace-nowrap shrink-0"
                    >
                      Join
                    </button>
                  </div>
                </div>
              )}

              {playMode === 'online' && onlineRoom && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs">
                    <Users className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-slate-300">Room</span>
                    <span className="font-mono-num font-bold text-white">{onlineRoom.code}</span>
                    <span className="text-slate-400">· {onlineRoom.players.length}/5</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.05] px-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Copied Link
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Invite Link
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="flex h-8 items-center gap-1 rounded-md border border-white/15 bg-white/[0.05] px-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-red-500/40 hover:text-red-300 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Leave
                  </button>
                </div>
              )}
            </div>

            {playMode === 'online' && onlineError && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/60 px-3 py-2 text-xs text-red-200">
                {onlineError}
              </div>
            )}

            {/* Connected Friends Roster when inside an Online Room */}
            {playMode === 'online' && onlineRoom && (
              <div className="mb-3.5 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <span className="text-xs font-medium text-slate-400 mr-1">Drivers:</span>
                {onlineRoom.players.map((p) => {
                  const car = CAR_SPECS.find((c) => c.id === p.carId) ?? CAR_SPECS[0];
                  const color = p.paintHex || car.primaryColor;
                  const isSelf = p.id === localPlayerId;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm border border-white/20"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-semibold text-white">
                        {p.name}
                        {isSelf ? ' (You)' : ''}
                      </span>
                      <span className="text-slate-400">· {car.brand}</span>
                      {p.id === onlineRoom.hostId && (
                        <span className="text-[10px] font-semibold text-amber-400">· Host</span>
                      )}
                    </div>
                  );
                })}
                {isHost && (
                  <button
                    type="button"
                    onClick={() => onToggleIncludeAi(!includeAi)}
                    className={`ml-auto rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      includeAi
                        ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                    }`}
                  >
                    AI Fill: {includeAi ? 'On' : 'Off'}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
              {/* Car Brand & Paint Selector */}
              <div className="lg:col-span-5">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-400">
                    {playMode === 'splitscreen' ? 'Player 1 Car' : 'Car & Brand'}
                  </span>
                  <span className="font-mono-num text-[11px] text-slate-400">
                    SPD {selectedCar.stats.speed} · ACC {selectedCar.stats.accel} · GRP{' '}
                    {selectedCar.stats.grip}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {CAR_SPECS.map((car) => {
                    const active = car.id === selectedCar.id;
                    return (
                      <button
                        key={car.id}
                        type="button"
                        onClick={() => onSelectCar(car)}
                        className={`flex flex-col rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? 'border-cyan-400 bg-cyan-500/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-white/20"
                            style={{ backgroundColor: car.primaryColor }}
                          />
                          <span className="truncate text-xs font-semibold">{car.brand}</span>
                        </div>
                        <span className="mt-0.5 truncate text-[11px] text-slate-400">
                          {car.name.replace(`${car.brand} `, '')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Paint Swatches OR Player 2 Car Picker in Split-Screen */}
                {playMode === 'splitscreen' ? (
                  <div className="mt-2.5">
                    <div className="mb-1 text-[11px] font-medium text-slate-400">
                      Player 2 Car ({selectedCarP2.name})
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {CAR_SPECS.map((car) => {
                        const active = car.id === selectedCarP2.id;
                        return (
                          <button
                            key={car.id}
                            type="button"
                            onClick={() => onSelectCarP2(car)}
                            className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors truncate ${
                              active
                                ? 'border-amber-400 bg-amber-500/15 text-white'
                                : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                            }`}
                          >
                            {car.brand}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-400">Paint</span>
                    <div className="flex items-center gap-1.5">
                      {PAINT_SWATCHES.map((swatch) => {
                        const swatchColor = swatch.hex || selectedCar.primaryColor;
                        const isSelected =
                          (swatch.hex === '' && paintHex === '') ||
                          (swatch.hex !== '' && paintHex === swatch.hex);
                        return (
                          <button
                            key={swatch.id}
                            type="button"
                            title={swatch.name}
                            aria-label={`Paint ${swatch.name}`}
                            onClick={() => onSelectPaint(swatch.hex)}
                            className={`h-5 w-5 rounded-md border transition-transform ${
                              isSelected
                                ? 'scale-110 border-white ring-2 ring-cyan-400/70'
                                : 'border-white/25 hover:scale-105'
                            }`}
                            style={{
                              backgroundColor: swatchColor,
                              boxShadow:
                                isSelected && activePaint ? '0 0 0 1px rgba(0,0,0,0.4)' : undefined,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Circuit & Sky Background Selector */}
              <div className="lg:col-span-4">
                <div className="mb-2 text-xs font-medium text-slate-400">Circuit</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {TRACK_CONFIGS.map((track) => {
                    const active = track.id === selectedTrack.id;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        disabled={!canEditTrackSettings}
                        onClick={() => onSelectTrack(track)}
                        className={`rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-60 ${
                          active
                            ? 'border-red-500 bg-red-500/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <div className="truncate text-xs font-semibold">{track.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-400">
                          {track.location}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Sky / Background Selector */}
                <div className="mt-2.5">
                  <div className="mb-1 text-[11px] font-medium text-slate-400">Background</div>
                  <div className="grid grid-cols-5 gap-1">
                    {BACKGROUND_PRESETS.map((bg) => {
                      const active = bg.id === selectedBackground.id;
                      return (
                        <button
                          key={bg.id}
                          type="button"
                          disabled={!canEditTrackSettings}
                          onClick={() => onSelectBackground(bg)}
                          title={bg.name}
                          className={`flex items-center justify-center gap-1 rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap disabled:opacity-60 ${
                            active
                              ? 'border-amber-400 bg-amber-500/15 text-white'
                              : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{
                              background: `linear-gradient(180deg, ${bg.skyTop} 0%, ${bg.skyHorizon} 100%)`,
                            }}
                          />
                          <span className="truncate">{bg.name.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Race Rules & Start CTA */}
              <div className="flex flex-col gap-2.5 lg:col-span-3">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="mb-1 text-[11px] text-slate-400">AI Pace</div>
                    <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                      {(['rookie', 'pro', 'ace'] as Difficulty[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          disabled={!canEditTrackSettings}
                          onClick={() => onChangeDifficulty(d)}
                          className={`flex-1 rounded-md py-1 text-[11px] font-medium capitalize transition-colors whitespace-nowrap disabled:opacity-60 ${
                            difficulty === d
                              ? 'bg-white text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] text-slate-400">Laps</div>
                    <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                      {[2, 3, 5].map((l) => (
                        <button
                          key={l}
                          type="button"
                          disabled={!canEditTrackSettings}
                          onClick={() => onChangeLaps(l)}
                          className={`flex-1 rounded-md py-1 font-mono-num text-[11px] font-medium transition-colors disabled:opacity-60 ${
                            totalLaps === l
                              ? 'bg-white text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {playMode === 'online' && !onlineRoom ? (
                  <button
                    type="button"
                    onClick={onCreateRoom}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 font-display text-sm font-bold tracking-wide text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap shrink-0"
                  >
                    <Users className="h-4 w-4" />
                    Create Friend Room
                  </button>
                ) : playMode === 'online' && !isHost ? (
                  <div className="flex h-10 w-full items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 whitespace-nowrap">
                    Waiting for host to start
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onStartRace}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 font-display text-sm font-bold tracking-wide text-white transition-colors hover:bg-red-500 active:bg-red-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                  >
                    <Flag className="h-4 w-4" />
                    Start Race
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
