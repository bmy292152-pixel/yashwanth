import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RaceAudioEngine } from './audio';
import { buildRaceCarMesh, CarMeshHandle } from './carMesh';
import { BACKGROUND_PRESETS, CAR_SPECS, RIVAL_PROFILES, TRACK_CONFIGS } from './catalog';
import { createShadowTexture } from './textures';
import { buildTrackEnvironment, TrackBuildResult } from './trackBuilder';
import {
  BackgroundPreset,
  CameraMode,
  CarSpec,
  ControlInput,
  Difficulty,
  MinimapCarPoint,
  PeerTelemetryPacket,
  PlayerHudTelemetry,
  PlayMode,
  RacePhase,
  RaceStanding,
  RoomSnapshot,
  TelemetryState,
  TrackConfig,
} from './types';

type RacerRole = 'p1' | 'p2' | 'ai' | 'remote';

interface RacerEntity {
  id: string;
  name: string;
  carName: string;
  color: string;
  role: RacerRole;
  carSpec: CarSpec;
  mesh: CarMeshHandle;
  nameSprite?: THREE.Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  steerAngle: number;
  wheelSpin: number;
  pitchAngle: number;
  rollAngle: number;
  hintSampleIdx: number;
  lastT: number;
  continuousProgress: number;
  completedLaps: number;
  lapStartTimeMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  lapTimes: number[];
  finished: boolean;
  finishTimeMs: number;
  // Driver telemetry
  boostCharge: number;
  isBoosting: boolean;
  isDrifting: boolean;
  isOffTrack: boolean;
  wrongWay: boolean;
  speedKmh: number;
  gear: number;
  rpmNorm: number;
  // AI properties
  aiTargetLane: number;
  aiLaneTimer: number;
  aiBaseSkill: number;
  // Remote network properties
  hasNetUpdate: boolean;
  netTargetX: number;
  netTargetY: number;
  netTargetZ: number;
  netTargetVx: number;
  netTargetVz: number;
  netTargetHeading: number;
  netSteer: number;
  netPitch: number;
  netRoll: number;
  netBoosting: boolean;
  netBraking: boolean;
  netDrifting: boolean;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _dummy = new THREE.Object3D();

function createNameplateSprite(label: string, accentHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(11, 14, 20, 0.85)';
  ctx.beginPath();
  ctx.roundRect(12, 10, 232, 42, 10);
  ctx.fill();

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 24px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.slice(0, 14), 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.set(0, 2.15, 0);
  return sprite;
}

function emptyInput(): ControlInput {
  return {
    throttle: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    drift: false,
    boost: false,
  };
}

export class RaceEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cameraP2: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private shadowTex: THREE.Texture;

  private trackData: TrackBuildResult | null = null;
  private racers: RacerEntity[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private particleCursor = 0;

  private audio = new RaceAudioEngine();
  private frameId = 0;
  private lastTimestamp = 0;
  private disposed = false;

  private phase: RacePhase = 'garage';
  private playMode: PlayMode = 'solo';
  private difficulty: Difficulty = 'pro';
  private totalLaps = 3;

  private selectedCar: CarSpec = CAR_SPECS[0];
  private paintOverrideHex = '';
  private selectedCarP2: CarSpec = CAR_SPECS[1];
  private paintOverrideHexP2 = '';
  private selectedTrack: TrackConfig = TRACK_CONFIGS[0];
  private selectedBackground: BackgroundPreset = BACKGROUND_PRESETS[0];
  private cameraMode: CameraMode = 'chase';

  // Online room state
  private onlineRoom: RoomSnapshot | null = null;
  private localPlayerId: string | null = null;

  private countdownTimer = 0;
  private lastCountdownBeep = 4;
  private raceElapsedMs = 0;

  private showcaseAngle = 0.6;
  private camPos = new THREE.Vector3(0, 6, 15);
  private camLook = new THREE.Vector3(0, 1, 0);
  private camPosP2 = new THREE.Vector3(0, 6, 15);
  private camLookP2 = new THREE.Vector3(0, 1, 0);
  private telemetryTimer = 0;
  private netSyncTimer = 0;
  private contextLost = false;

  private inputP1: ControlInput = emptyInput();
  private inputP2: ControlInput = emptyInput();

  private onTelemetry: (state: TelemetryState) => void;
  private onContextLostChange?: (lost: boolean) => void;
  private onLocalTelemetrySend?: (packet: PeerTelemetryPacket) => void;

  constructor(
    container: HTMLElement,
    onTelemetry: (state: TelemetryState) => void,
    onContextLostChange?: (lost: boolean) => void,
    onLocalTelemetrySend?: (packet: PeerTelemetryPacket) => void
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.onContextLostChange = onContextLostChange;
    this.onLocalTelemetrySend = onLocalTelemetrySend;

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 2. Renderer
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    // 3. Scene & Studio Environment reflections
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.25, 2200);
    this.cameraP2 = new THREE.PerspectiveCamera(62, width / height, 0.25, 2200);

    // 4. Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x2e4028, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffd599, 2.2);
    this.sunLight.position.set(80, 120, 60);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 0.55);
    this.rimLight.position.set(-70, 50, -90);
    this.scene.add(this.rimLight);

    this.shadowTex = createShadowTexture();

    // 5. Pooled Particle InstancedMesh
    const pGeo = new THREE.IcosahedronGeometry(0.32, 0);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const maxParticles = 120;
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, maxParticles);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: new THREE.Color(0xffffff),
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.scene.add(this.particleMesh);

    this.loadScenario(
      this.selectedTrack,
      this.selectedCar,
      this.difficulty,
      this.totalLaps,
      this.selectedBackground,
      this.paintOverrideHex
    );

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.lastTimestamp = performance.now();
    this.startLoop();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.onContextLostChange?.(true);
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    this.onContextLostChange?.(false);
  };

  private handleResize = () => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.updateCameraAspects();
  };

  private updateCameraAspects(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const isSplit = this.playMode === 'splitscreen' && this.phase !== 'garage';
    if (isSplit) {
      const halfAspect = Math.max(width * 0.5, 1) / height;
      this.camera.aspect = halfAspect;
      this.cameraP2.aspect = halfAspect;
      this.cameraP2.updateProjectionMatrix();
    } else {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();
  }

  public loadScenario(
    track: TrackConfig,
    car: CarSpec,
    difficulty: Difficulty,
    laps: number,
    bg?: BackgroundPreset,
    paintHex?: string,
    playMode?: PlayMode,
    carP2?: CarSpec,
    paintHexP2?: string
  ): void {
    const trackChanged = !this.trackData || this.selectedTrack.id !== track.id;
    this.selectedTrack = track;
    this.selectedCar = car;
    this.difficulty = difficulty;
    this.totalLaps = laps;
    if (bg) this.selectedBackground = bg;
    if (paintHex !== undefined) this.paintOverrideHex = paintHex;
    if (playMode) this.playMode = playMode;
    if (carP2) this.selectedCarP2 = carP2;
    if (paintHexP2 !== undefined) this.paintOverrideHexP2 = paintHexP2;

    if (trackChanged) {
      this.trackData?.dispose();
      this.trackData = buildTrackEnvironment(
        this.scene,
        track,
        this.selectedBackground,
        this.maxAnisotropy,
        this.isSoftwareGl
      );
    }

    this.applyAtmosphere(this.selectedBackground);
    this.spawnGrid();
    this.emitTelemetry();
  }

  public setOnlineRoom(room: RoomSnapshot | null, localPlayerId: string | null): void {
    this.onlineRoom = room;
    this.localPlayerId = localPlayerId;
    if (room && this.phase === 'garage') {
      const track = TRACK_CONFIGS.find((t) => t.id === room.trackId) ?? this.selectedTrack;
      const bg = BACKGROUND_PRESETS.find((b) => b.id === room.backgroundId) ?? this.selectedBackground;
      this.loadScenario(
        track,
        this.selectedCar,
        room.difficulty,
        room.totalLaps,
        bg,
        this.paintOverrideHex,
        'online'
      );
    }
  }

  public startOnlineRace(room: RoomSnapshot, localPlayerId: string, countdownMs: number): void {
    this.onlineRoom = room;
    this.localPlayerId = localPlayerId;
    this.playMode = 'online';

    const track = TRACK_CONFIGS.find((t) => t.id === room.trackId) ?? this.selectedTrack;
    const bg = BACKGROUND_PRESETS.find((b) => b.id === room.backgroundId) ?? this.selectedBackground;
    const localPlayerInfo = room.players.find((p) => p.id === localPlayerId);
    const localCar =
      CAR_SPECS.find((c) => c.id === localPlayerInfo?.carId) ?? this.selectedCar;

    this.loadScenario(
      track,
      localCar,
      room.difficulty,
      room.totalLaps,
      bg,
      localPlayerInfo?.paintHex ?? this.paintOverrideHex,
      'online'
    );

    this.audio.init();
    this.phase = 'countdown';
    this.countdownTimer = countdownMs / 1000;
    this.lastCountdownBeep = 4;
    this.updateCameraAspects();
    this.emitTelemetry();
  }

  public applyPeerTelemetry(playerId: string, packet: PeerTelemetryPacket): void {
    const r = this.racers.find((entity) => entity.id === playerId && entity.role === 'remote');
    if (!r) return;
    r.hasNetUpdate = true;
    r.netTargetX = packet.x;
    r.netTargetY = packet.y;
    r.netTargetZ = packet.z;
    r.netTargetVx = packet.vx;
    r.netTargetVz = packet.vz;
    r.netTargetHeading = packet.heading;
    r.netSteer = packet.steerAngle;
    r.netPitch = packet.pitchAngle;
    r.netRoll = packet.rollAngle;
    r.netBoosting = packet.isBoosting;
    r.netBraking = packet.isBraking;
    r.netDrifting = packet.isDrifting;
    r.continuousProgress = packet.continuousProgress;
    r.completedLaps = packet.completedLaps;
    r.bestLapMs = packet.bestLapMs;
    if (packet.finished && !r.finished) {
      r.finished = true;
      r.finishTimeMs = packet.finishTimeMs;
    }
  }

  public setBackgroundPreset(bg: BackgroundPreset): void {
    this.selectedBackground = bg;
    this.applyAtmosphere(bg);
  }

  public orbitGarage(deltaRadians: number): void {
    if (this.phase === 'garage') {
      this.showcaseAngle += deltaRadians;
    }
  }

  private applyAtmosphere(bg: BackgroundPreset): void {
    this.scene.fog = new THREE.FogExp2(bg.fogColor, bg.fogDensity);
    this.scene.background = new THREE.Color(bg.skyHorizon);

    this.sunLight.color.set(bg.sunColor);
    this.sunLight.intensity = bg.sunIntensity;
    this.hemiLight.color.set(bg.hemiSkyColor);
    this.hemiLight.groundColor.set(bg.hemiGroundColor);
    this.hemiLight.intensity = bg.hemiIntensity;

    this.trackData?.applyBackground(bg);
  }

  private clearRacers(): void {
    for (const r of this.racers) {
      if (r.nameSprite) {
        (r.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
        r.nameSprite.material.dispose();
        r.mesh.group.remove(r.nameSprite);
      }
      this.scene.remove(r.mesh.group);
      r.mesh.dispose();
    }
    this.racers = [];
  }

  private spawnGrid(): void {
    this.clearRacers();
    if (!this.trackData) return;

    // Reset particles
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].active = false;
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    const slots = [
      { t: 0.993, lane: -3.2 },
      { t: 0.987, lane: 3.2 },
      { t: 0.981, lane: -3.2 },
      { t: 0.975, lane: 3.2 },
      { t: 0.969, lane: 0.0 },
    ];

    const diffMultiplier =
      this.difficulty === 'rookie' ? 0.84 : this.difficulty === 'pro' ? 0.94 : 1.02;

    const createEntity = (opts: {
      id: string;
      name: string;
      carSpec: CarSpec;
      color: string;
      accent: string;
      role: RacerRole;
      slotIdx: number;
      aiSkill: number;
      showNameplate?: boolean;
    }): RacerEntity => {
      const slot = slots[Math.min(opts.slotIdx, slots.length - 1)];
      const sample = this.trackData!.sampleAtT(slot.t);
      const pos = sample.pos.clone().addScaledVector(sample.right, slot.lane);
      const heading = Math.atan2(-sample.tangent.x, -sample.tangent.z);

      const mesh = buildRaceCarMesh(
        opts.color,
        opts.accent,
        this.shadowTex,
        !this.isSoftwareGl,
        opts.carSpec.bodyStyle
      );
      mesh.group.position.copy(pos);
      mesh.group.rotation.y = heading;

      let nameSprite: THREE.Sprite | undefined;
      if (opts.showNameplate) {
        nameSprite = createNameplateSprite(opts.name, opts.color);
        mesh.group.add(nameSprite);
      }

      this.scene.add(mesh.group);

      return {
        id: opts.id,
        name: opts.name,
        carName: opts.carSpec.name,
        color: opts.color,
        role: opts.role,
        carSpec: opts.carSpec,
        mesh,
        nameSprite,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: 0,
        vz: 0,
        heading,
        steerAngle: 0,
        wheelSpin: 0,
        pitchAngle: 0,
        rollAngle: 0,
        hintSampleIdx: Math.floor(slot.t * this.trackData!.samples.length),
        lastT: slot.t,
        continuousProgress: slot.t - 1.0,
        completedLaps: 0,
        lapStartTimeMs: 0,
        bestLapMs: null,
        lastLapMs: null,
        lapTimes: [],
        finished: false,
        finishTimeMs: 0,
        boostCharge: 65,
        isBoosting: false,
        isDrifting: false,
        isOffTrack: false,
        wrongWay: false,
        speedKmh: 0,
        gear: 1,
        rpmNorm: 0.2,
        aiTargetLane: slot.lane,
        aiLaneTimer: 1.5 + opts.slotIdx * 0.7,
        aiBaseSkill: opts.aiSkill,
        hasNetUpdate: false,
        netTargetX: pos.x,
        netTargetY: pos.y,
        netTargetZ: pos.z,
        netTargetVx: 0,
        netTargetVz: 0,
        netTargetHeading: heading,
        netSteer: 0,
        netPitch: 0,
        netRoll: 0,
        netBoosting: false,
        netBraking: false,
        netDrifting: false,
      };
    };

    if (this.playMode === 'online' && this.onlineRoom && this.onlineRoom.players.length > 0) {
      const usedSlots = new Set<number>();
      this.onlineRoom.players.forEach((p, idx) => {
        const slotIdx = Math.min(4, Math.max(0, p.gridSlot ?? idx));
        usedSlots.add(slotIdx);
        const isLocal = p.id === this.localPlayerId;
        const spec = CAR_SPECS.find((c) => c.id === p.carId) ?? CAR_SPECS[0];
        const color = (isLocal && this.paintOverrideHex) || p.paintHex || spec.primaryColor;
        this.racers.push(
          createEntity({
            id: p.id,
            name: isLocal ? `${p.name} (You)` : p.name,
            carSpec: spec,
            color,
            accent: spec.accentColor,
            role: isLocal ? 'p1' : 'remote',
            slotIdx,
            aiSkill: 1,
            showNameplate: !isLocal,
          })
        );
      });

      if (this.onlineRoom.includeAi) {
        let rivalIdx = 0;
        for (let s = 0; s < 5 && rivalIdx < RIVAL_PROFILES.length; s++) {
          if (usedSlots.has(s)) continue;
          const rival = RIVAL_PROFILES[rivalIdx++];
          const spec = CAR_SPECS.find((c) => c.bodyStyle === rival.bodyStyle) ?? CAR_SPECS[1];
          this.racers.push(
            createEntity({
              id: rival.id,
              name: rival.name,
              carSpec: spec,
              color: rival.color,
              accent: rival.accent,
              role: 'ai',
              slotIdx: s,
              aiSkill: diffMultiplier * (1.01 - rivalIdx * 0.02),
            })
          );
        }
      }
    } else if (this.playMode === 'splitscreen') {
      // 3 AI rivals in slots 0..2, P1 in slot 3, P2 in slot 4
      for (let i = 0; i < 3; i++) {
        const rival = RIVAL_PROFILES[i];
        const spec = CAR_SPECS.find((c) => c.bodyStyle === rival.bodyStyle) ?? CAR_SPECS[1];
        this.racers.push(
          createEntity({
            id: rival.id,
            name: rival.name,
            carSpec: spec,
            color: rival.color,
            accent: rival.accent,
            role: 'ai',
            slotIdx: i,
            aiSkill: diffMultiplier * (1.02 - i * 0.025),
          })
        );
      }

      const p1Color = this.paintOverrideHex || this.selectedCar.primaryColor;
      this.racers.push(
        createEntity({
          id: 'player',
          name: 'Player 1',
          carSpec: this.selectedCar,
          color: p1Color,
          accent: this.selectedCar.accentColor,
          role: 'p1',
          slotIdx: 3,
          aiSkill: 1,
          showNameplate: true,
        })
      );

      const p2Color = this.paintOverrideHexP2 || this.selectedCarP2.primaryColor;
      this.racers.push(
        createEntity({
          id: 'player2',
          name: 'Player 2',
          carSpec: this.selectedCarP2,
          color: p2Color,
          accent: this.selectedCarP2.accentColor,
          role: 'p2',
          slotIdx: 4,
          aiSkill: 1,
          showNameplate: true,
        })
      );
    } else {
      // Solo vs 4 AI rivals
      RIVAL_PROFILES.forEach((rival, idx) => {
        const spec = CAR_SPECS.find((c) => c.bodyStyle === rival.bodyStyle) ?? CAR_SPECS[1];
        this.racers.push(
          createEntity({
            id: rival.id,
            name: rival.name,
            carSpec: spec,
            color: rival.color,
            accent: rival.accent,
            role: 'ai',
            slotIdx: idx,
            aiSkill: diffMultiplier * (1.03 - idx * 0.025),
          })
        );
      });

      const p1Color = this.paintOverrideHex || this.selectedCar.primaryColor;
      this.racers.push(
        createEntity({
          id: 'player',
          name: 'You',
          carSpec: this.selectedCar,
          color: p1Color,
          accent: this.selectedCar.accentColor,
          role: 'p1',
          slotIdx: 4,
          aiSkill: 1,
        })
      );
    }

    this.raceElapsedMs = 0;
    this.setGantryLights(0);

    const p1 = this.racers.find((r) => r.role === 'p1');
    if (p1) {
      const fwdX = -Math.sin(p1.heading);
      const fwdZ = -Math.cos(p1.heading);
      this.camPos.set(p1.x - fwdX * 8.5, p1.y + 3.4, p1.z - fwdZ * 8.5);
      this.camLook.set(p1.x + fwdX * 6, p1.y + 1.0, p1.z + fwdZ * 6);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }

    const p2 = this.racers.find((r) => r.role === 'p2');
    if (p2) {
      const fwdX = -Math.sin(p2.heading);
      const fwdZ = -Math.cos(p2.heading);
      this.camPosP2.set(p2.x - fwdX * 8.5, p2.y + 3.4, p2.z - fwdZ * 8.5);
      this.camLookP2.set(p2.x + fwdX * 6, p2.y + 1.0, p2.z + fwdZ * 6);
      this.cameraP2.position.copy(this.camPosP2);
      this.cameraP2.lookAt(this.camLookP2);
    }
  }

  public startRace(): void {
    this.audio.init();
    this.spawnGrid();
    this.phase = 'countdown';
    this.countdownTimer = 3.4;
    this.lastCountdownBeep = 4;
    this.updateCameraAspects();
    this.emitTelemetry();
  }

  public returnToGarage(): void {
    this.phase = 'garage';
    this.audio.updateTelemetry(false, 0, 0, 0, false);
    this.updateCameraAspects();
    this.spawnGrid();
    this.emitTelemetry();
  }

  public togglePause(): void {
    if (this.phase === 'racing') {
      this.phase = 'paused';
      this.audio.updateTelemetry(false, 0, 0, 0, false);
      this.emitTelemetry();
    } else if (this.phase === 'paused') {
      this.phase = 'racing';
      this.lastTimestamp = performance.now();
      this.emitTelemetry();
    }
  }

  public cycleCamera(): CameraMode {
    const order: CameraMode[] = ['chase', 'far', 'hood'];
    const idx = (order.indexOf(this.cameraMode) + 1) % order.length;
    this.cameraMode = order[idx];
    this.emitTelemetry();
    return this.cameraMode;
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public setInput(partial: Partial<ControlInput>): void {
    Object.assign(this.inputP1, partial);
  }

  public setInputP2(partial: Partial<ControlInput>): void {
    Object.assign(this.inputP2, partial);
  }

  private setGantryLights(litCount: number, isGo = false): void {
    if (!this.trackData) return;
    this.trackData.startLightMats.forEach((mat, idx) => {
      if (isGo) {
        mat.color.setHex(0x10b981);
        mat.emissive.setHex(0x10b981);
        mat.emissiveIntensity = 2.8;
      } else if (idx < litCount) {
        mat.color.setHex(0xef4444);
        mat.emissive.setHex(0xef4444);
        mat.emissiveIntensity = 2.6;
      } else {
        mat.color.setHex(0x1f2937);
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
  }

  private emitParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    maxLife: number,
    hex: number
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particles.length;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size = size;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.color.setHex(hex);
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const ratio = p.life / p.maxLife;
      const scale = p.size * (0.4 + (1 - ratio) * 0.9) * ratio;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.setScalar(Math.max(0.01, scale));
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));

      if (!this.contextLost) {
        this.step(dt);
        this.renderScene();
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private renderScene(): void {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    const isSplit = this.playMode === 'splitscreen' && this.phase !== 'garage';

    if (isSplit) {
      const halfW = Math.floor(w / 2);
      this.renderer.setScissorTest(true);

      // Left viewport: Player 1
      this.renderer.setViewport(0, 0, halfW, h);
      this.renderer.setScissor(0, 0, halfW, h);
      this.renderer.render(this.scene, this.camera);

      // Right viewport: Player 2
      this.renderer.setViewport(halfW, 0, w - halfW, h);
      this.renderer.setScissor(halfW, 0, w - halfW, h);
      this.renderer.render(this.scene, this.cameraP2);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.render(this.scene, this.camera);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private step(dt: number): void {
    if (!this.trackData) return;
    const p1 = this.racers.find((r) => r.role === 'p1');
    if (!p1) return;
    const p2 = this.racers.find((r) => r.role === 'p2');

    if (this.phase === 'garage') {
      this.showcaseAngle += dt * 0.35;
      const radius = 7.2;
      const targetX = p1.x + Math.sin(this.showcaseAngle) * radius;
      const targetZ = p1.z + Math.cos(this.showcaseAngle) * radius;
      this.camPos.set(targetX, p1.y + 2.55, targetZ);
      this.camLook.set(p1.x, p1.y + 0.72, p1.z);
      this.camera.position.lerp(this.camPos, 1 - Math.exp(-6 * dt));
      this.camera.lookAt(this.camLook);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 48, 5, dt);
      this.camera.updateProjectionMatrix();
      this.updateSunTarget(p1);
      this.audio.updateTelemetry(false, 0, 0, 0, false);
      return;
    }

    // In online mode, pausing opens overlay but keeps remote simulation synced
    if (this.phase === 'paused' && this.playMode !== 'online') {
      return;
    }

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const stepNum = Math.ceil(this.countdownTimer);
      if (stepNum < this.lastCountdownBeep && stepNum >= 1 && stepNum <= 3) {
        this.lastCountdownBeep = stepNum;
        this.audio.playCountdownTone(false);
        this.setGantryLights(5 - stepNum, false);
      }
      if (this.countdownTimer <= 0) {
        this.phase = 'racing';
        this.audio.playCountdownTone(true);
        this.setGantryLights(5, true);
        this.emitTelemetry();
      } else {
        const rev = this.inputP1.throttle ? 0.65 : 0.22;
        p1.rpmNorm = THREE.MathUtils.damp(p1.rpmNorm, rev, 8, dt);
        this.audio.updateTelemetry(true, p1.rpmNorm, 0.1, 0, false);
      }
      this.updateFollowCamera(p1, this.camera, this.camPos, this.camLook, dt);
      if (p2) {
        this.updateFollowCamera(p2, this.cameraP2, this.camPosP2, this.camLookP2, dt);
      }
      this.updateSunTarget(p1);
      this.telemetryTimer += dt;
      if (this.telemetryTimer >= 0.05) {
        this.telemetryTimer = 0;
        this.emitTelemetry();
      }
      return;
    }

    this.raceElapsedMs += dt * 1000;
    if (this.raceElapsedMs > 2200 && this.raceElapsedMs < 2600) {
      this.setGantryLights(0, false);
    }

    // Step P1
    if (this.phase === 'racing' && !p1.finished) {
      this.stepHumanPhysics(p1, this.inputP1, dt, true);
    } else {
      this.stepAiPhysics(p1, dt, 0.72, false);
      if (this.phase === 'finished') {
        this.audio.updateTelemetry(false, 0, 0, 0, false);
      }
    }

    // Step P2 (splitscreen)
    if (p2) {
      if (this.phase === 'racing' && !p2.finished) {
        this.stepHumanPhysics(p2, this.inputP2, dt, false);
      } else {
        this.stepAiPhysics(p2, dt, 0.72, false);
      }
    }

    // Step AI & Remote Friends
    for (const r of this.racers) {
      if (r.role === 'ai') {
        this.stepAiPhysics(r, dt, r.aiBaseSkill, this.playMode === 'online');
      } else if (r.role === 'remote') {
        this.stepRemotePeer(r, dt);
      }
    }

    this.resolveCarCollisions();

    // Update lap progress for local human & AI cars (remote cars report progress via network)
    for (const r of this.racers) {
      if (r.role !== 'remote') {
        this.updateRacerProgress(r);
      }
    }

    // Check finish condition
    if (this.phase === 'racing') {
      const bothFinished =
        this.playMode === 'splitscreen' && p2
          ? p1.finished && p2.finished
          : p1.finished;

      if (bothFinished) {
        this.phase = 'finished';
        this.audio.playLapChime(true);
        this.emitTelemetry();
      }
    }

    // Stream local P1 state to WebSocket room at ~20Hz
    if (this.playMode === 'online' && (this.phase === 'racing' || this.phase === 'paused' || this.phase === 'finished')) {
      this.netSyncTimer += dt;
      if (this.netSyncTimer >= 0.05) {
        this.netSyncTimer = 0;
        this.onLocalTelemetrySend?.({
          x: p1.x,
          y: p1.y,
          z: p1.z,
          vx: p1.vx,
          vz: p1.vz,
          heading: p1.heading,
          steerAngle: p1.steerAngle,
          pitchAngle: p1.pitchAngle,
          rollAngle: p1.rollAngle,
          continuousProgress: p1.continuousProgress,
          completedLaps: p1.completedLaps,
          bestLapMs: p1.bestLapMs,
          isBoosting: p1.isBoosting,
          isBraking: this.inputP1.brake,
          isDrifting: p1.isDrifting,
          finished: p1.finished,
          finishTimeMs: p1.finishTimeMs,
        });
      }
    }

    this.updateParticles(dt);
    this.updateFollowCamera(p1, this.camera, this.camPos, this.camLook, dt);
    if (p2) {
      this.updateFollowCamera(p2, this.cameraP2, this.camPosP2, this.camLookP2, dt);
    }
    this.updateSunTarget(p1);

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.05) {
      this.telemetryTimer = 0;
      this.emitTelemetry();
    }
  }

  private stepHumanPhysics(
    r: RacerEntity,
    input: ControlInput,
    dt: number,
    playAudio: boolean
  ): void {
    const track = this.trackData!;
    const proj = track.projectPoint(r.x, r.z, r.hintSampleIdx);
    r.hintSampleIdx = proj.sampleIndex;

    const halfRoad = this.selectedTrack.roadWidth * 0.5;
    const maxLateral = halfRoad + this.selectedTrack.shoulderWidth - 1.15;
    r.isOffTrack = Math.abs(proj.lateral) > halfRoad + 0.7;

    const fwdX = -Math.sin(r.heading);
    const fwdZ = -Math.cos(r.heading);
    const rightX = Math.cos(r.heading);
    const rightZ = -Math.sin(r.heading);

    let forwardVel = r.vx * fwdX + r.vz * fwdZ;
    let lateralVel = r.vx * rightX + r.vz * rightZ;
    const absSpeed = Math.hypot(r.vx, r.vz);
    const currentKmh = absSpeed * 3.6;

    const canBoost = input.boost && r.boostCharge > 1.5 && (input.throttle || forwardVel > 8);
    r.isBoosting = canBoost;
    if (canBoost) {
      r.boostCharge = Math.max(0, r.boostCharge - 30 * dt);
    } else {
      const passive = currentKmh > 120 ? 3.2 : 1.0;
      r.boostCharge = Math.min(100, r.boostCharge + passive * dt);
    }

    const maxSpeedMs =
      (r.carSpec.maxSpeedKmh / 3.6) *
      (canBoost ? 1.22 : 1.0) *
      (r.isOffTrack ? 0.72 : 1.0);
    const baseAccel = 36 * r.carSpec.acceleration * (canBoost ? 1.48 : 1.0);

    if (input.throttle) {
      const speedRatio = Math.max(0, forwardVel / maxSpeedMs);
      const accelForce = baseAccel * (1.0 - 0.55 * speedRatio);
      forwardVel += accelForce * dt;
    } else if (input.brake) {
      if (forwardVel > 2.5) {
        forwardVel -= 56 * dt;
      } else {
        forwardVel = Math.max(-20, forwardVel - 22 * dt);
      }
    } else {
      forwardVel *= Math.exp(-0.55 * dt);
    }

    if (r.isOffTrack) {
      forwardVel *= Math.exp(-1.25 * dt);
      if (absSpeed > 12 && Math.random() < 0.55) {
        const dustColor = this.selectedTrack.biome === 'desert' ? 0xd97706 : 0x65a30d;
        this.emitParticle(
          r.x - fwdX * 1.6 + (Math.random() - 0.5) * 1.4,
          r.y + 0.18,
          r.z - fwdZ * 1.6 + (Math.random() - 0.5) * 1.4,
          -r.vx * 0.15,
          1.2 + Math.random() * 1.4,
          -r.vz * 0.15,
          0.95,
          0.45,
          dustColor
        );
      }
    }

    const steerInput = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    r.steerAngle = THREE.MathUtils.damp(r.steerAngle, steerInput * 0.42, 11, dt);

    const wantsDrift = input.drift && Math.abs(steerInput) > 0 && currentKmh > 55;
    r.isDrifting = wantsDrift || (Math.abs(lateralVel) > 6.5 && currentKmh > 65);

    if (wantsDrift) {
      r.boostCharge = Math.min(100, r.boostCharge + 24 * dt);
    }

    const speedTurnFactor = Math.min(1, absSpeed / 11);
    const reverseSign = forwardVel >= -0.5 ? 1 : -1;
    const baseTurnRate = 2.05 * r.carSpec.handling * (wantsDrift ? 1.32 : 1.0);
    const highSpeedDamp = 1.0 - 0.24 * Math.min(1, absSpeed / 70);
    r.heading += steerInput * reverseSign * baseTurnRate * speedTurnFactor * highSpeedDamp * dt;

    const gripFactor = wantsDrift ? 2.4 * r.carSpec.driftGrip : 8.8 * r.carSpec.handling;
    lateralVel *= Math.exp(-gripFactor * dt);
    forwardVel = THREE.MathUtils.clamp(forwardVel, -22, maxSpeedMs);

    const newFwdX = -Math.sin(r.heading);
    const newFwdZ = -Math.cos(r.heading);
    const newRightX = Math.cos(r.heading);
    const newRightZ = -Math.sin(r.heading);

    r.vx = newFwdX * forwardVel + newRightX * lateralVel;
    r.vz = newFwdZ * forwardVel + newRightZ * lateralVel;
    r.x += r.vx * dt;
    r.z += r.vz * dt;

    const postProj = track.projectPoint(r.x, r.z, r.hintSampleIdx);
    r.hintSampleIdx = postProj.sampleIndex;
    if (Math.abs(postProj.lateral) > maxLateral) {
      const sign = Math.sign(postProj.lateral);
      const excess = Math.abs(postProj.lateral) - maxLateral;
      r.x -= postProj.right.x * sign * excess;
      r.z -= postProj.right.z * sign * excess;

      const vDotRight = r.vx * postProj.right.x + r.vz * postProj.right.z;
      if (vDotRight * sign > 0) {
        const impact = Math.abs(vDotRight);
        r.vx -= postProj.right.x * vDotRight * 1.32;
        r.vz -= postProj.right.z * vDotRight * 1.32;
        r.vx *= 0.85;
        r.vz *= 0.85;
        if (impact > 4.5) {
          if (playAudio) this.audio.playCollision(Math.min(1, impact / 22));
          for (let s = 0; s < 6; s++) {
            this.emitParticle(
              r.x + postProj.right.x * sign * 0.9,
              r.y + 0.5,
              r.z + postProj.right.z * sign * 0.9,
              (Math.random() - 0.5) * 10,
              2 + Math.random() * 4,
              (Math.random() - 0.5) * 10,
              0.42,
              0.32,
              0xfbbf24
            );
          }
        }
      }
    }

    r.y = THREE.MathUtils.damp(r.y, postProj.pos.y, 18, dt);

    if (r.isDrifting && Math.random() < 0.72) {
      [-0.9, 0.9].forEach((side) => {
        this.emitParticle(
          r.x - newFwdX * 1.45 + newRightX * side,
          r.y + 0.16,
          r.z - newFwdZ * 1.45 + newRightZ * side,
          (Math.random() - 0.5) * 1.2,
          0.6 + Math.random() * 0.8,
          (Math.random() - 0.5) * 1.2,
          0.85,
          0.42,
          0xe2e8f0
        );
      });
    }

    r.mesh.boostFlames.forEach((flame) => {
      flame.visible = r.isBoosting;
      if (r.isBoosting) {
        flame.scale.set(1, 1, 0.85 + Math.random() * 0.55);
      }
    });

    r.mesh.brakeLightMat.emissiveIntensity = input.brake ? 3.8 : 1.1;

    const targetPitch =
      (input.brake ? 0.032 : input.throttle ? -0.022 : 0) + postProj.tangent.y * 0.9;
    const targetRoll = -steerInput * Math.min(1, absSpeed / 35) * 0.048;
    r.pitchAngle = THREE.MathUtils.damp(r.pitchAngle, targetPitch, 10, dt);
    r.rollAngle = THREE.MathUtils.damp(r.rollAngle, targetRoll, 10, dt);
    r.wheelSpin -= (forwardVel / 0.35) * dt;

    this.applyCarVisualTransform(r);

    r.speedKmh = Math.round(Math.abs(forwardVel) * 3.6);
    const maxKmh = r.carSpec.maxSpeedKmh;
    const ratio = Math.min(1.15, r.speedKmh / maxKmh);
    const gearFloat = Math.max(0, ratio * 5.99);
    r.gear = Math.min(6, Math.max(1, Math.floor(gearFloat) + 1));
    r.rpmNorm = Math.min(0.98, Math.max(0.18, (gearFloat % 1) * 0.65 + ratio * 0.35));

    const alignDot = newFwdX * postProj.tangent.x + newFwdZ * postProj.tangent.z;
    r.wrongWay = alignDot < -0.35 && r.speedKmh > 18;

    if (playAudio) {
      const driftVol = r.isDrifting
        ? Math.min(1, Math.abs(lateralVel) / 14 + (wantsDrift ? 0.45 : 0))
        : 0;
      this.audio.updateTelemetry(true, r.rpmNorm, Math.min(1, ratio), driftVol, r.isBoosting);
    }
  }

  private stepRemotePeer(r: RacerEntity, dt: number): void {
    if (!r.hasNetUpdate) return;
    // Extrapolate target slightly using received velocity
    r.netTargetX += r.netTargetVx * dt;
    r.netTargetZ += r.netTargetVz * dt;

    const blend = 1 - Math.exp(-15 * dt);
    r.x = THREE.MathUtils.lerp(r.x, r.netTargetX, blend);
    r.y = THREE.MathUtils.lerp(r.y, r.netTargetY, blend);
    r.z = THREE.MathUtils.lerp(r.z, r.netTargetZ, blend);
    r.vx = r.netTargetVx;
    r.vz = r.netTargetVz;

    // Shortest-angle heading interpolation
    let diff = r.netTargetHeading - r.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    r.heading += diff * blend;

    r.steerAngle = THREE.MathUtils.damp(r.steerAngle, r.netSteer, 12, dt);
    r.pitchAngle = THREE.MathUtils.damp(r.pitchAngle, r.netPitch, 12, dt);
    r.rollAngle = THREE.MathUtils.damp(r.rollAngle, r.netRoll, 12, dt);

    const speed = Math.hypot(r.vx, r.vz);
    r.wheelSpin -= (speed / 0.35) * dt;
    r.isBoosting = r.netBoosting;
    r.isDrifting = r.netDrifting;

    r.mesh.boostFlames.forEach((flame) => {
      flame.visible = r.netBoosting;
      if (r.netBoosting) {
        flame.scale.set(1, 1, 0.85 + Math.random() * 0.55);
      }
    });
    r.mesh.brakeLightMat.emissiveIntensity = r.netBraking ? 3.8 : 1.1;

    this.applyCarVisualTransform(r);
  }

  private stepAiPhysics(
    r: RacerEntity,
    dt: number,
    skillMultiplier: number,
    deterministic: boolean
  ): void {
    const track = this.trackData!;
    const proj = track.projectPoint(r.x, r.z, r.hintSampleIdx);
    r.hintSampleIdx = proj.sampleIndex;

    r.aiLaneTimer -= dt;
    if (r.aiLaneTimer <= 0) {
      r.aiLaneTimer = deterministic ? 2.8 : 2.2 + Math.random() * 2.5;
      const halfSafe = this.selectedTrack.roadWidth * 0.36;
      if (deterministic) {
        const seed = r.id.charCodeAt(r.id.length - 1) + r.completedLaps * 3 + Math.floor(this.raceElapsedMs / 3000);
        r.aiTargetLane = Math.sin(seed * 1.9) * halfSafe;
      } else {
        r.aiTargetLane = (Math.random() * 2 - 1) * halfSafe;
      }
    }

    const lookSamples = 16;
    const lookIdx = (proj.sampleIndex + lookSamples) % track.samples.length;
    const ahead = track.samples[lookIdx];

    const cornerLookIdx = (proj.sampleIndex + 30) % track.samples.length;
    const cornerCurv = Math.abs(track.samples[cornerLookIdx].curvature);

    const targetX = ahead.pos.x + ahead.right.x * r.aiTargetLane;
    const targetZ = ahead.pos.z + ahead.right.z * r.aiTargetLane;

    const dx = targetX - r.x;
    const dz = targetZ - r.z;
    const desiredHeading = Math.atan2(-dx, -dz);

    let angleDiff = desiredHeading - r.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    r.steerAngle = THREE.MathUtils.clamp(angleDiff * 0.8, -0.4, 0.4);
    r.heading += THREE.MathUtils.clamp(angleDiff * 4.5, -2.5, 2.5) * dt;

    const topSpeedMs = (255 / 3.6) * skillMultiplier;
    const cornerPenalty = Math.min(0.45, cornerCurv * 2.2);
    const targetSpeed = topSpeedMs * (1 - cornerPenalty);

    const fwdX = -Math.sin(r.heading);
    const fwdZ = -Math.cos(r.heading);
    let currentSpeed = r.vx * fwdX + r.vz * fwdZ;

    if (currentSpeed < targetSpeed) {
      currentSpeed = Math.min(targetSpeed, currentSpeed + 30 * skillMultiplier * dt);
    } else {
      currentSpeed = Math.max(targetSpeed, currentSpeed - 38 * dt);
    }

    r.vx = fwdX * currentSpeed;
    r.vz = fwdZ * currentSpeed;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    r.y = THREE.MathUtils.damp(r.y, proj.pos.y, 16, dt);

    r.mesh.brakeLightMat.emissiveIntensity = cornerPenalty > 0.22 ? 3.2 : 1.0;
    r.pitchAngle = THREE.MathUtils.damp(r.pitchAngle, proj.tangent.y * 0.85, 10, dt);
    r.rollAngle = THREE.MathUtils.damp(r.rollAngle, -r.steerAngle * 0.08, 10, dt);
    r.wheelSpin -= (currentSpeed / 0.35) * dt;

    this.applyCarVisualTransform(r);
  }

  private applyCarVisualTransform(r: RacerEntity): void {
    r.mesh.group.position.set(r.x, r.y, r.z);
    r.mesh.group.rotation.y = r.heading;
    r.mesh.bodyGroup.rotation.x = r.pitchAngle;
    r.mesh.bodyGroup.rotation.z = r.rollAngle;
    r.mesh.frontLeftSteer.rotation.y = r.steerAngle;
    r.mesh.frontRightSteer.rotation.y = r.steerAngle;
    for (const w of r.mesh.wheels) {
      w.rotation.x = r.wheelSpin;
    }
  }

  private resolveCarCollisions(): void {
    const minDist = 2.55;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.0001 && d2 < minDistSq) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          const overlap = (minDist - d) * 0.5;

          if (a.role !== 'remote') {
            a.x -= nx * overlap;
            a.z -= nz * overlap;
          }
          if (b.role !== 'remote') {
            b.x += nx * overlap;
            b.z += nz * overlap;
          }

          const relVx = b.vx - a.vx;
          const relVz = b.vz - a.vz;
          const sepVel = relVx * nx + relVz * nz;
          if (sepVel < 0) {
            const impulse = -sepVel * 0.65;
            if (a.role !== 'remote') {
              a.vx -= nx * impulse;
              a.vz -= nz * impulse;
            }
            if (b.role !== 'remote') {
              b.vx += nx * impulse;
              b.vz += nz * impulse;
            }

            if ((a.role === 'p1' || b.role === 'p1') && Math.abs(sepVel) > 3.5) {
              this.audio.playCollision(Math.min(1, Math.abs(sepVel) / 18));
              this.emitParticle(
                (a.x + b.x) * 0.5,
                (a.y + b.y) * 0.5 + 0.55,
                (a.z + b.z) * 0.5,
                (Math.random() - 0.5) * 8,
                3 + Math.random() * 3,
                (Math.random() - 0.5) * 8,
                0.45,
                0.28,
                0xfef08a
              );
            }
          }
        }
      }
    }
  }

  private updateRacerProgress(r: RacerEntity): void {
    if (!this.trackData) return;
    const proj = this.trackData.projectPoint(r.x, r.z, r.hintSampleIdx);
    const newT = proj.t;

    let deltaT = newT - r.lastT;
    if (deltaT < -0.5) deltaT += 1.0;
    if (deltaT > 0.5) deltaT -= 1.0;

    r.continuousProgress += deltaT;
    r.lastT = newT;

    const newCompletedLaps = Math.max(0, Math.floor(r.continuousProgress));
    if (newCompletedLaps > r.completedLaps && !r.finished) {
      const lapMs = this.raceElapsedMs - r.lapStartTimeMs;
      r.lastLapMs = lapMs;
      r.lapTimes.push(lapMs);
      if (r.bestLapMs === null || lapMs < r.bestLapMs) {
        r.bestLapMs = lapMs;
      }

      r.completedLaps = newCompletedLaps;
      r.lapStartTimeMs = this.raceElapsedMs;

      if (r.completedLaps >= this.totalLaps) {
        r.finished = true;
        r.finishTimeMs = this.raceElapsedMs;
        if (r.role === 'p1' || r.role === 'p2') {
          this.audio.playLapChime(true);
        }
      } else if (r.role === 'p1' || r.role === 'p2') {
        this.audio.playLapChime(false);
      }
    }
  }

  private updateFollowCamera(
    target: RacerEntity,
    cam: THREE.PerspectiveCamera,
    posVec: THREE.Vector3,
    lookVec: THREE.Vector3,
    dt: number
  ): void {
    const fwdX = -Math.sin(target.heading);
    const fwdZ = -Math.cos(target.heading);
    const speedRatio = Math.min(1, target.speedKmh / 280);

    if (this.cameraMode === 'hood') {
      _vecA.set(target.x + fwdX * 0.35, target.y + 1.32, target.z + fwdZ * 0.35);
      _vecB.set(target.x + fwdX * 22, target.y + 1.05, target.z + fwdZ * 22);
      posVec.lerp(_vecA, 1 - Math.exp(-26 * dt));
      lookVec.lerp(_vecB, 1 - Math.exp(-24 * dt));
      const targetFov = 70 + speedRatio * 14 + (target.isBoosting ? 7 : 0);
      cam.fov = THREE.MathUtils.damp(cam.fov, targetFov, 7, dt);
    } else if (this.cameraMode === 'far') {
      const dist = 11.2 + speedRatio * 1.8;
      const height = 4.6 + speedRatio * 0.6;
      _vecA.set(target.x - fwdX * dist, target.y + height, target.z - fwdZ * dist);
      _vecB.set(target.x + fwdX * 10, target.y + 1.1, target.z + fwdZ * 10);
      posVec.lerp(_vecA, 1 - Math.exp(-9.5 * dt));
      lookVec.lerp(_vecB, 1 - Math.exp(-14 * dt));
      const targetFov = 62 + speedRatio * 11 + (target.isBoosting ? 6 : 0);
      cam.fov = THREE.MathUtils.damp(cam.fov, targetFov, 6, dt);
    } else {
      const dist = 7.4 + speedRatio * 1.4;
      const height = 2.85 + speedRatio * 0.35;
      _vecA.set(target.x - fwdX * dist, target.y + height, target.z - fwdZ * dist);
      _vecB.set(target.x + fwdX * 9, target.y + 1.05, target.z + fwdZ * 9);
      posVec.lerp(_vecA, 1 - Math.exp(-11 * dt));
      lookVec.lerp(_vecB, 1 - Math.exp(-15 * dt));
      const targetFov = 62 + speedRatio * 11 + (target.isBoosting ? 7 : 0);
      cam.fov = THREE.MathUtils.damp(cam.fov, targetFov, 6, dt);
    }

    cam.position.copy(posVec);
    cam.lookAt(lookVec);
    cam.updateProjectionMatrix();
  }

  private updateSunTarget(player: RacerEntity): void {
    this.sunLight.position.set(player.x + 70, player.y + 115, player.z + 55);
    this.sunLight.target.position.set(player.x, player.y, player.z);
    this.sunLight.target.updateMatrixWorld();
  }

  private emitTelemetry(): void {
    if (!this.trackData) return;
    const p1 = this.racers.find((r) => r.role === 'p1');
    if (!p1) return;
    const p2 = this.racers.find((r) => r.role === 'p2');

    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.continuousProgress - a.continuousProgress;
    });

    const p1PosIdx = sorted.findIndex((r) => r.role === 'p1');
    const p2PosIdx = p2 ? sorted.findIndex((r) => r.role === 'p2') : -1;

    const standings: RaceStanding[] = sorted.map((r, i) => ({
      id: r.id,
      name: r.name,
      carName: r.carName,
      color: r.color,
      isPlayer: r.role === 'p1' || r.role === 'p2',
      position: i + 1,
      lap: Math.min(this.totalLaps, Math.max(1, r.completedLaps + 1)),
      totalTimeMs: r.finished ? r.finishTimeMs : this.raceElapsedMs,
      bestLapMs: r.bestLapMs,
      finished: r.finished,
    }));

    const minimapCars: MinimapCarPoint[] = this.racers.map((r) => {
      const pt = this.trackData!.toMinimapCoords(r.x, r.z);
      return {
        id: r.id,
        x: pt.x,
        y: pt.y,
        isPlayer: r.role === 'p1' || r.role === 'p2',
        color: r.color,
      };
    });

    const p2Hud: PlayerHudTelemetry | undefined = p2
      ? {
          speedKmh: p2.speedKmh,
          gear: p2.gear,
          rpmNormalized: p2.rpmNorm,
          boostCharge: Math.round(p2.boostCharge),
          isBoosting: p2.isBoosting,
          isDrifting: p2.isDrifting,
          wrongWay: p2.wrongWay,
          position: p2PosIdx + 1,
          currentLap: Math.min(this.totalLaps, Math.max(1, p2.completedLaps + 1)),
          currentLapMs:
            this.phase === 'racing' ? Math.max(0, this.raceElapsedMs - p2.lapStartTimeMs) : 0,
          bestLapMs: p2.bestLapMs,
          lastLapMs: p2.lastLapMs,
          finished: p2.finished,
        }
      : undefined;

    this.onTelemetry({
      phase: this.phase,
      playMode: this.playMode,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      speedKmh: p1.speedKmh,
      gear: p1.gear,
      rpmNormalized: p1.rpmNorm,
      boostCharge: Math.round(p1.boostCharge),
      isBoosting: p1.isBoosting,
      isDrifting: p1.isDrifting,
      isOffTrack: p1.isOffTrack,
      wrongWay: p1.wrongWay,
      position: p1PosIdx + 1,
      totalCars: this.racers.length,
      currentLap: Math.min(this.totalLaps, Math.max(1, p1.completedLaps + 1)),
      totalLaps: this.totalLaps,
      currentLapMs:
        this.phase === 'racing' ? Math.max(0, this.raceElapsedMs - p1.lapStartTimeMs) : 0,
      bestLapMs: p1.bestLapMs,
      lastLapMs: p1.lastLapMs,
      totalRaceMs: this.raceElapsedMs,
      lapTimes: [...p1.lapTimes],
      cameraMode: this.cameraMode,
      minimapPath: this.trackData.minimapPath,
      minimapCars,
      standings,
      p2: p2Hud,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.audio.dispose();
    this.trackData?.dispose();
    this.clearRacers();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.shadowTex.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
