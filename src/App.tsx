import { useCallback, useEffect, useRef, useState } from 'react';
import { GarageOverlay } from './components/GarageOverlay';
import { RaceHUD } from './components/RaceHUD';
import { ResultsOverlay } from './components/ResultsOverlay';
import { BACKGROUND_PRESETS, CAR_SPECS, TRACK_CONFIGS } from './game/catalog';
import { MultiplayerClient } from './game/multiplayerClient';
import { RaceEngine } from './game/RaceEngine';
import {
  BackgroundPreset,
  CarSpec,
  ControlInput,
  Difficulty,
  PlayMode,
  RoomSnapshot,
  TelemetryState,
  TrackConfig,
} from './game/types';

const INITIAL_TELEMETRY: TelemetryState = {
  phase: 'garage',
  playMode: 'solo',
  countdownValue: 3,
  speedKmh: 0,
  gear: 1,
  rpmNormalized: 0.2,
  boostCharge: 65,
  isBoosting: false,
  isDrifting: false,
  isOffTrack: false,
  wrongWay: false,
  position: 5,
  totalCars: 5,
  currentLap: 1,
  totalLaps: 3,
  currentLapMs: 0,
  bestLapMs: null,
  lastLapMs: null,
  totalRaceMs: 0,
  lapTimes: [],
  cameraMode: 'chase',
  minimapPath: '',
  minimapCars: [],
  standings: [],
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const mpRef = useRef<MultiplayerClient | null>(null);

  const [playMode, setPlayMode] = useState<PlayMode>('solo');
  const [selectedTrack, setSelectedTrack] = useState<TrackConfig>(TRACK_CONFIGS[0]);
  const [selectedCar, setSelectedCar] = useState<CarSpec>(CAR_SPECS[0]);
  const [selectedCarP2, setSelectedCarP2] = useState<CarSpec>(CAR_SPECS[1]);
  const [selectedBackground, setSelectedBackground] = useState<BackgroundPreset>(
    BACKGROUND_PRESETS[0]
  );
  const [paintHex, setPaintHex] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty>('pro');
  const [totalLaps, setTotalLaps] = useState<number>(3);
  const [muted, setMuted] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<TelemetryState>(INITIAL_TELEMETRY);
  const [webglError, setWebglError] = useState<boolean>(false);

  // Online multiplayer state
  const [driverName, setDriverName] = useState<string>('Driver');
  const [joinCode, setJoinCode] = useState<string>('');
  const [onlineRoom, setOnlineRoom] = useState<RoomSnapshot | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [includeAi, setIncludeAi] = useState<boolean>(true);

  const playModeRef = useRef<PlayMode>(playMode);
  playModeRef.current = playMode;

  const onlineRoomRef = useRef<RoomSnapshot | null>(onlineRoom);
  onlineRoomRef.current = onlineRoom;

  const localPlayerIdRef = useRef<string | null>(localPlayerId);
  localPlayerIdRef.current = localPlayerId;

  // Initialize Three.js RaceEngine & WebSocket MultiplayerClient once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const mp = new MultiplayerClient({
      onConnectedChange: () => {},
      onRoomJoined: (playerId, room) => {
        setOnlineError(null);
        setLocalPlayerId(playerId);
        setOnlineRoom(room);
        setIncludeAi(room.includeAi);
        const track = TRACK_CONFIGS.find((t) => t.id === room.trackId) ?? TRACK_CONFIGS[0];
        const bg =
          BACKGROUND_PRESETS.find((b) => b.id === room.backgroundId) ?? BACKGROUND_PRESETS[0];
        setSelectedTrack(track);
        setSelectedBackground(bg);
        setDifficulty(room.difficulty);
        setTotalLaps(room.totalLaps);
        engineRef.current?.setOnlineRoom(room, playerId);
      },
      onRoomState: (room) => {
        setOnlineError(null);
        setOnlineRoom(room);
        setIncludeAi(room.includeAi);
        const track = TRACK_CONFIGS.find((t) => t.id === room.trackId) ?? TRACK_CONFIGS[0];
        const bg =
          BACKGROUND_PRESETS.find((b) => b.id === room.backgroundId) ?? BACKGROUND_PRESETS[0];
        setSelectedTrack(track);
        setSelectedBackground(bg);
        setDifficulty(room.difficulty);
        setTotalLaps(room.totalLaps);
        engineRef.current?.setOnlineRoom(room, localPlayerIdRef.current);
        if (room.phase === 'lobby') {
          engineRef.current?.returnToGarage();
        }
      },
      onPeerLeft: (_peerId, room) => {
        setOnlineRoom(room);
        engineRef.current?.setOnlineRoom(room, localPlayerIdRef.current);
      },
      onRaceStart: (room, countdownMs) => {
        setOnlineError(null);
        setOnlineRoom(room);
        if (localPlayerIdRef.current) {
          engineRef.current?.startOnlineRace(room, localPlayerIdRef.current, countdownMs);
        }
      },
      onPeerTelemetry: (peerId, packet) => {
        engineRef.current?.applyPeerTelemetry(peerId, packet);
      },
      onError: (msg) => {
        setOnlineError(msg);
      },
    });
    mpRef.current = mp;

    let engine: RaceEngine | null = null;
    try {
      engine = new RaceEngine(
        container,
        (next) => setTelemetry(next),
        (lost) => setWebglError(lost),
        (packet) => mpRef.current?.sendTelemetry(packet)
      );
      engineRef.current = engine;
    } catch {
      setWebglError(true);
    }

    // Check URL ?room=CODE invite link
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('room')?.trim().toUpperCase();
    if (inviteCode) {
      setPlayMode('online');
      setJoinCode(inviteCode);
      mp.connect();
      mp.joinRoom({
        code: inviteCode,
        name: `Driver ${Math.floor(10 + Math.random() * 89)}`,
        carId: CAR_SPECS[0].id,
        paintHex: '',
      });
    }

    return () => {
      mp.dispose();
      mpRef.current = null;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard driving & shortcut handlers (supports Solo, Online, and 2P Split-Screen)
  useEffect(() => {
    const updateKey = (code: string, pressed: boolean, repeat: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;

      // Skip driving keys if typing in an input box
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      const isSplit = playModeRef.current === 'splitscreen';

      if (isSplit) {
        // Player 1: WASD + Space (Drift) + LeftShift (Nitro)
        switch (code) {
          case 'KeyW':
            engine.setInput({ throttle: pressed });
            break;
          case 'KeyS':
            engine.setInput({ brake: pressed });
            break;
          case 'KeyA':
            engine.setInput({ steerLeft: pressed });
            break;
          case 'KeyD':
            engine.setInput({ steerRight: pressed });
            break;
          case 'Space':
            engine.setInput({ drift: pressed });
            break;
          case 'ShiftLeft':
            engine.setInput({ boost: pressed });
            break;
          // Player 2: Arrow Keys + Enter/Slash (Drift) + RightShift (Nitro)
          case 'ArrowUp':
            engine.setInputP2({ throttle: pressed });
            break;
          case 'ArrowDown':
            engine.setInputP2({ brake: pressed });
            break;
          case 'ArrowLeft':
            engine.setInputP2({ steerLeft: pressed });
            break;
          case 'ArrowRight':
            engine.setInputP2({ steerRight: pressed });
            break;
          case 'Enter':
          case 'Slash':
            engine.setInputP2({ drift: pressed });
            break;
          case 'ShiftRight':
            engine.setInputP2({ boost: pressed });
            break;
        }
      } else {
        // Solo & Online: Both WASD and Arrow keys drive P1
        switch (code) {
          case 'KeyW':
          case 'ArrowUp':
            engine.setInput({ throttle: pressed });
            break;
          case 'KeyS':
          case 'ArrowDown':
            engine.setInput({ brake: pressed });
            break;
          case 'KeyA':
          case 'ArrowLeft':
            engine.setInput({ steerLeft: pressed });
            break;
          case 'KeyD':
          case 'ArrowRight':
            engine.setInput({ steerRight: pressed });
            break;
          case 'Space':
            engine.setInput({ drift: pressed });
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
          case 'KeyB':
          case 'KeyN':
            engine.setInput({ boost: pressed });
            break;
        }
      }

      // Global shortcuts
      if (code === 'KeyC' && pressed && !repeat) {
        engine.cycleCamera();
      } else if ((code === 'Escape' || code === 'KeyP') && pressed && !repeat) {
        engine.togglePause();
      } else if (code === 'KeyM' && pressed && !repeat) {
        setMuted((prev) => {
          const next = !prev;
          engine.setMuted(next);
          return next;
        });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (
        activeTag !== 'INPUT' &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)
      ) {
        e.preventDefault();
      }
      updateKey(e.code, true, e.repeat);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      updateKey(e.code, false, false);
    };

    const onBlur = () => {
      const reset = {
        throttle: false,
        brake: false,
        steerLeft: false,
        steerRight: false,
        drift: false,
        boost: false,
      };
      engineRef.current?.setInput(reset);
      engineRef.current?.setInputP2(reset);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const syncScenario = useCallback(
    (
      track: TrackConfig,
      car: CarSpec,
      diff: Difficulty,
      laps: number,
      bg: BackgroundPreset,
      paint: string,
      mode: PlayMode,
      car2: CarSpec
    ) => {
      engineRef.current?.loadScenario(track, car, diff, laps, bg, paint, mode, car2);
    },
    []
  );

  const handleChangePlayMode = useCallback(
    (mode: PlayMode) => {
      if (mode !== 'online' && onlineRoomRef.current) {
        mpRef.current?.leaveRoom();
        setOnlineRoom(null);
        setLocalPlayerId(null);
        engineRef.current?.setOnlineRoom(null, null);
      }
      if (mode === 'online') {
        mpRef.current?.connect();
      }
      setPlayMode(mode);
      setOnlineError(null);
      syncScenario(
        selectedTrack,
        selectedCar,
        difficulty,
        totalLaps,
        selectedBackground,
        paintHex,
        mode,
        selectedCarP2
      );
    },
    [selectedTrack, selectedCar, difficulty, totalLaps, selectedBackground, paintHex, selectedCarP2, syncScenario]
  );

  const handleSelectTrack = useCallback(
    (track: TrackConfig) => {
      const defaultBg =
        BACKGROUND_PRESETS.find((b) => b.id === track.defaultBackgroundId) ?? selectedBackground;
      setSelectedTrack(track);
      setSelectedBackground(defaultBg);
      if (playMode === 'online' && onlineRoom) {
        mpRef.current?.updateSettings({ trackId: track.id, backgroundId: defaultBg.id });
      } else {
        syncScenario(
          track,
          selectedCar,
          difficulty,
          totalLaps,
          defaultBg,
          paintHex,
          playMode,
          selectedCarP2
        );
      }
    },
    [
      selectedCar,
      selectedCarP2,
      difficulty,
      totalLaps,
      selectedBackground,
      paintHex,
      playMode,
      onlineRoom,
      syncScenario,
    ]
  );

  const handleSelectCar = useCallback(
    (car: CarSpec) => {
      setSelectedCar(car);
      setPaintHex('');
      if (playMode === 'online' && onlineRoom) {
        mpRef.current?.updatePlayer({ carId: car.id, paintHex: '' });
      }
      syncScenario(
        selectedTrack,
        car,
        difficulty,
        totalLaps,
        selectedBackground,
        '',
        playMode,
        selectedCarP2
      );
    },
    [
      selectedTrack,
      selectedCarP2,
      difficulty,
      totalLaps,
      selectedBackground,
      playMode,
      onlineRoom,
      syncScenario,
    ]
  );

  const handleSelectCarP2 = useCallback(
    (car: CarSpec) => {
      setSelectedCarP2(car);
      syncScenario(
        selectedTrack,
        selectedCar,
        difficulty,
        totalLaps,
        selectedBackground,
        paintHex,
        playMode,
        car
      );
    },
    [selectedTrack, selectedCar, difficulty, totalLaps, selectedBackground, paintHex, playMode, syncScenario]
  );

  const handleSelectPaint = useCallback(
    (hex: string) => {
      setPaintHex(hex);
      if (playMode === 'online' && onlineRoom) {
        mpRef.current?.updatePlayer({ paintHex: hex });
      }
      syncScenario(
        selectedTrack,
        selectedCar,
        difficulty,
        totalLaps,
        selectedBackground,
        hex,
        playMode,
        selectedCarP2
      );
    },
    [
      selectedTrack,
      selectedCar,
      selectedCarP2,
      difficulty,
      totalLaps,
      selectedBackground,
      playMode,
      onlineRoom,
      syncScenario,
    ]
  );

  const handleSelectBackground = useCallback(
    (bg: BackgroundPreset) => {
      setSelectedBackground(bg);
      engineRef.current?.setBackgroundPreset(bg);
      if (playMode === 'online' && onlineRoom) {
        mpRef.current?.updateSettings({ backgroundId: bg.id });
      }
    },
    [playMode, onlineRoom]
  );

  const handleChangeDifficulty = useCallback(
    (diff: Difficulty) => {
      setDifficulty(diff);
      if (playMode === 'online' && onlineRoom) {
        mpRef.current?.updateSettings({ difficulty: diff });
      } else {
        syncScenario(
          selectedTrack,
          selectedCar,
          diff,
          totalLaps,
          selectedBackground,
          paintHex,
          playMode,
          selectedCarP2
        );
      }
    },
    [
      selectedTrack,
      selectedCar,
      selectedCarP2,
      totalLaps,
      selectedBackground,
      paintHex,
      playMode,
      onlineRoom,
      syncScenario,
    ]
  );

  const handleChangeLaps = useCallback(
    (laps: number) => {
      setTotalLaps(laps);
      if (playMode === 'online' && onlineRoom) {
        mpRef.current?.updateSettings({ totalLaps: laps });
      } else {
        syncScenario(
          selectedTrack,
          selectedCar,
          difficulty,
          laps,
          selectedBackground,
          paintHex,
          playMode,
          selectedCarP2
        );
      }
    },
    [
      selectedTrack,
      selectedCar,
      selectedCarP2,
      difficulty,
      selectedBackground,
      paintHex,
      playMode,
      onlineRoom,
      syncScenario,
    ]
  );

  const handleCreateRoom = useCallback(() => {
    setOnlineError(null);
    mpRef.current?.connect();
    mpRef.current?.createRoom({
      name: driverName.trim() || 'Driver 1',
      carId: selectedCar.id,
      paintHex,
      trackId: selectedTrack.id,
      backgroundId: selectedBackground.id,
      totalLaps,
      difficulty,
      includeAi,
    });
  }, [
    driverName,
    selectedCar,
    paintHex,
    selectedTrack,
    selectedBackground,
    totalLaps,
    difficulty,
    includeAi,
  ]);

  const handleJoinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setOnlineError('Enter a room code to join.');
      return;
    }
    setOnlineError(null);
    mpRef.current?.connect();
    mpRef.current?.joinRoom({
      code,
      name: driverName.trim() || 'Driver',
      carId: selectedCar.id,
      paintHex,
    });
  }, [joinCode, driverName, selectedCar, paintHex]);

  const handleLeaveRoom = useCallback(() => {
    mpRef.current?.leaveRoom();
    setOnlineRoom(null);
    setLocalPlayerId(null);
    setOnlineError(null);
    engineRef.current?.setOnlineRoom(null, null);
  }, []);

  const handleToggleIncludeAi = useCallback((nextInclude: boolean) => {
    setIncludeAi(nextInclude);
    mpRef.current?.updateSettings({ includeAi: nextInclude });
  }, []);

  const handleChangeDriverName = useCallback(
    (name: string) => {
      setDriverName(name);
      if (playMode === 'online' && onlineRoom) {
        mpRef.current?.updatePlayer({ name });
      }
    },
    [playMode, onlineRoom]
  );

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleOrbitDrag = useCallback((deltaRadians: number) => {
    engineRef.current?.orbitGarage(deltaRadians);
  }, []);

  const handleStartRace = useCallback(() => {
    if (playMode === 'online' && onlineRoom) {
      mpRef.current?.startRace();
    } else {
      engineRef.current?.startRace();
    }
  }, [playMode, onlineRoom]);

  const handleCycleCamera = useCallback(() => {
    engineRef.current?.cycleCamera();
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleBackToGarage = useCallback(() => {
    if (playMode === 'online' && onlineRoom) {
      if (onlineRoom.hostId === localPlayerId) {
        mpRef.current?.returnToLobby();
      } else {
        engineRef.current?.returnToGarage();
      }
    } else {
      engineRef.current?.returnToGarage();
    }
  }, [playMode, onlineRoom, localPlayerId]);

  const handleTouchInput = useCallback((partial: Partial<ControlInput>) => {
    engineRef.current?.setInput(partial);
  }, []);

  const isOnlineHost = Boolean(onlineRoom && onlineRoom.hostId === localPlayerId);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#080A0F]">
      {/* Dedicated Isolated WebGL Container */}
      <div ref={mountRef} className="fixed inset-0 h-full w-full" />

      {/* Graceful WebGL Fallback */}
      {webglError && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#080A0F] p-6">
          <div className="max-w-md rounded-xl border border-white/15 bg-[#0B0E14] p-6 text-center">
            <h2 className="font-display text-xl font-bold text-white">
              3D Graphics Unavailable
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Your browser suspended or could not initialize WebGL rendering. Reload the page to restore the 3D racing viewport.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {/* Pre-Race Garage Setup Dock */}
      {telemetry.phase === 'garage' && !webglError && (
        <GarageOverlay
          playMode={playMode}
          selectedTrack={selectedTrack}
          selectedCar={selectedCar}
          selectedCarP2={selectedCarP2}
          selectedBackground={selectedBackground}
          paintHex={paintHex}
          difficulty={difficulty}
          totalLaps={totalLaps}
          muted={muted}
          driverName={driverName}
          joinCode={joinCode}
          onlineRoom={onlineRoom}
          localPlayerId={localPlayerId}
          onlineError={onlineError}
          includeAi={includeAi}
          onChangePlayMode={handleChangePlayMode}
          onSelectTrack={handleSelectTrack}
          onSelectCar={handleSelectCar}
          onSelectCarP2={handleSelectCarP2}
          onSelectBackground={handleSelectBackground}
          onSelectPaint={handleSelectPaint}
          onChangeDifficulty={handleChangeDifficulty}
          onChangeLaps={handleChangeLaps}
          onToggleMute={handleToggleMute}
          onOrbitDrag={handleOrbitDrag}
          onStartRace={handleStartRace}
          onChangeDriverName={handleChangeDriverName}
          onChangeJoinCode={setJoinCode}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onLeaveRoom={handleLeaveRoom}
          onToggleIncludeAi={handleToggleIncludeAi}
        />
      )}

      {/* Active Race & Countdown HUD */}
      {(telemetry.phase === 'countdown' || telemetry.phase === 'racing') && !webglError && (
        <RaceHUD
          telemetry={telemetry}
          muted={muted}
          onCycleCamera={handleCycleCamera}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onTouchInput={handleTouchInput}
        />
      )}

      {/* Pause & Post-Race Results Overlay */}
      {(telemetry.phase === 'paused' || telemetry.phase === 'finished') && !webglError && (
        <ResultsOverlay
          telemetry={telemetry}
          trackName={selectedTrack.name}
          isOnlineHost={isOnlineHost}
          onResume={handleTogglePause}
          onRestart={handleStartRace}
          onBackToGarage={handleBackToGarage}
        />
      )}
    </div>
  );
}
