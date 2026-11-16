export type RacePhase = 'garage' | 'countdown' | 'racing' | 'paused' | 'finished';

export type PlayMode = 'solo' | 'splitscreen' | 'online';

export type Difficulty = 'rookie' | 'pro' | 'ace';

export type CameraMode = 'chase' | 'far' | 'hood';

export type CarBodyStyle =
  | 'bmw-gt3'
  | 'porsche-gt3'
  | 'ferrari-gt3'
  | 'amg-gt3'
  | 'lambo-gt3';

export interface CarSpec {
  id: string;
  brand: string;
  name: string;
  category: string;
  bodyStyle: CarBodyStyle;
  number: string;
  primaryColor: string;
  accentColor: string;
  maxSpeedKmh: number;
  acceleration: number;
  handling: number;
  driftGrip: number;
  stats: {
    speed: number; // 1-100
    accel: number; // 1-100
    grip: number; // 1-100
  };
}

export interface PaintSwatch {
  id: string;
  name: string;
  hex: string; // empty string = factory brand color
}

export interface BackgroundPreset {
  id: string;
  name: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  fogColor: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  sunElevation: number; // 0..1
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  isNight: boolean;
}

export interface TrackConfig {
  id: string;
  name: string;
  location: string;
  lengthLabel: string;
  roadWidth: number;
  shoulderWidth: number;
  biome: 'alpine' | 'desert' | 'night';
  defaultBackgroundId: string;
  curbPrimary: string;
  curbSecondary: string;
  controlPoints: [number, number, number][];
}

export interface MinimapCarPoint {
  id: string;
  x: number; // normalized 0..100
  y: number; // normalized 0..100
  isPlayer: boolean;
  color: string;
}

export interface RaceStanding {
  id: string;
  name: string;
  carName: string;
  color: string;
  isPlayer: boolean;
  position: number;
  lap: number;
  totalTimeMs: number;
  bestLapMs: number | null;
  finished: boolean;
}

export interface PlayerHudTelemetry {
  speedKmh: number;
  gear: number;
  rpmNormalized: number;
  boostCharge: number;
  isBoosting: boolean;
  isDrifting: boolean;
  wrongWay: boolean;
  position: number;
  currentLap: number;
  currentLapMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  finished: boolean;
}

export interface TelemetryState {
  phase: RacePhase;
  playMode: PlayMode;
  countdownValue: number; // 3, 2, 1, 0 (GO)
  speedKmh: number;
  gear: number;
  rpmNormalized: number; // 0..1
  boostCharge: number; // 0..100
  isBoosting: boolean;
  isDrifting: boolean;
  isOffTrack: boolean;
  wrongWay: boolean;
  position: number;
  totalCars: number;
  currentLap: number;
  totalLaps: number;
  currentLapMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  totalRaceMs: number;
  lapTimes: number[];
  cameraMode: CameraMode;
  minimapPath: string;
  minimapCars: MinimapCarPoint[];
  standings: RaceStanding[];
  p2?: PlayerHudTelemetry;
}

export interface ControlInput {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  drift: boolean;
  boost: boolean;
}

export interface RoomPlayerInfo {
  id: string;
  name: string;
  carId: string;
  paintHex: string;
  ready: boolean;
  gridSlot: number;
  finished: boolean;
  finishTimeMs: number;
  bestLapMs: number | null;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  trackId: string;
  backgroundId: string;
  totalLaps: number;
  difficulty: Difficulty;
  includeAi: boolean;
  phase: 'lobby' | 'countdown' | 'racing' | 'finished';
  players: RoomPlayerInfo[];
}

export interface PeerTelemetryPacket {
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
