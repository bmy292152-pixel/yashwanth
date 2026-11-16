import * as THREE from 'three';
import { BackgroundPreset, TrackConfig } from './types';
import {
  createAsphaltTexture,
  createCheckeredTexture,
  createCurbTexture,
  createGroundTexture,
} from './textures';

export interface TrackSample {
  t: number; // 0..1
  arcLength: number;
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  curvature: number; // signed horizontal curvature
}

export interface TrackProjection {
  sampleIndex: number;
  t: number;
  lateral: number; // signed meters from centerline (+ is right)
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  curvature: number;
  distSq: number;
}

export interface TrackBuildResult {
  samples: TrackSample[];
  totalLength: number;
  minimapPath: string;
  toMinimapCoords: (x: number, z: number) => { x: number; y: number };
  projectPoint: (x: number, z: number, hintIdx?: number) => TrackProjection;
  sampleAtT: (t: number) => TrackSample;
  startLightMats: THREE.MeshStandardMaterial[];
  applyBackground: (bg: BackgroundPreset) => void;
  dispose: () => void;
}

const SAMPLE_COUNT = 720;

export function buildTrackEnvironment(
  scene: THREE.Scene,
  config: TrackConfig,
  bg: BackgroundPreset,
  maxAnisotropy: number,
  isSoftwareGl: boolean
): TrackBuildResult {
  const disposables: { dispose: () => void }[] = [];
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);

  const pts = config.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const totalLength = curve.getLength();

  // Pre-sample evenly spaced frames along arc length
  const samples: TrackSample[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    samples.push({
      t,
      arcLength: t * totalLength,
      pos,
      tangent,
      right,
      curvature: 0,
    });
  }

  // Compute signed horizontal curvature for AI braking & cornering
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const prev = samples[(i - 4 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const next = samples[(i + 4) % SAMPLE_COUNT];
    const dTan = new THREE.Vector3().subVectors(next.tangent, prev.tangent);
    samples[i].curvature = dTan.dot(samples[i].right);
  }

  // Compute Minimap SVG bounds (0..100 normalized with 10% margin)
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of samples) {
    if (s.pos.x < minX) minX = s.pos.x;
    if (s.pos.x > maxX) maxX = s.pos.x;
    if (s.pos.z < minZ) minZ = s.pos.z;
    if (s.pos.z > maxZ) maxZ = s.pos.z;
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const padX = (span - (maxX - minX)) * 0.5;
  const padZ = (span - (maxZ - minZ)) * 0.5;

  const toMinimapCoords = (wx: number, wz: number) => ({
    x: 10 + ((wx - minX + padX) / span) * 80,
    y: 10 + ((wz - minZ + padZ) / span) * 80,
  });

  const pathParts: string[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 6) {
    const p = toMinimapCoords(samples[i].pos.x, samples[i].pos.z);
    pathParts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  pathParts.push('Z');
  const minimapPath = pathParts.join(' ');

  // 1. Sky Gradient Dome with Sun/Moon Disc, Atmospheric Clouds & Night Stars
  const sunDirVec = new THREE.Vector3(0.45, bg.sunElevation, -0.82).normalize();
  const skyGeo = new THREE.SphereGeometry(1600, 36, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(bg.skyTop) },
      midColor: { value: new THREE.Color(bg.skyMid) },
      horizonColor: { value: new THREE.Color(bg.skyHorizon) },
      sunColor: { value: new THREE.Color(bg.sunColor) },
      sunDir: { value: sunDirVec },
      isNight: { value: bg.isNight ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float isNight;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
        col = mix(col, topColor, smoothstep(0.22, 0.85, h));

        // Soft cloud bands
        float cloudBand = sin(dir.x * 7.0 + dir.z * 4.0) * cos(dir.z * 6.0 - dir.x * 3.0);
        float cloudMask = smoothstep(0.06, 0.45, h) * (1.0 - smoothstep(0.45, 0.85, h));
        col = mix(col, mix(midColor, horizonColor, 0.55) * 1.15, clamp(cloudBand * 0.5 + 0.2, 0.0, 1.0) * cloudMask * 0.24);

        // Solar / Lunar glow & disc
        float sunAmt = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * pow(sunAmt, 14.0) * (isNight > 0.5 ? 0.25 : 0.48);
        col += sunColor * smoothstep(0.9982, 0.9994, sunAmt) * (isNight > 0.5 ? 0.9 : 1.35);

        // Starfield at night
        if (isNight > 0.5 && h > 0.08) {
          vec2 grid = floor(vec2(atan(dir.z, dir.x) * 42.0, dir.y * 95.0));
          float s = hash(grid);
          if (s > 0.986) {
            col += vec3(0.85, 0.92, 1.0) * smoothstep(0.08, 0.35, h) * 0.85;
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  trackGroup.add(skyDome);
  disposables.push(skyGeo, skyMat);

  // Distant 360-degree mountain ridge silhouette ring
  const ridgeSegs = 96;
  const ridgeGeo = new THREE.CylinderGeometry(1180, 1180, 175, ridgeSegs, 1, true);
  const rPos = ridgeGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const ry = rPos.getY(i);
    if (ry > 0) {
      const rx = rPos.getX(i);
      const rz = rPos.getZ(i);
      const ang = Math.atan2(rz, rx);
      const peak =
        Math.sin(ang * 5.0) * 32 +
        Math.cos(ang * 11.0) * 18 +
        Math.sin(ang * 23.0) * 10;
      rPos.setY(i, 42 + Math.max(-28, peak));
    } else {
      rPos.setY(i, -25);
    }
  }
  ridgeGeo.computeVertexNormals();
  const ridgeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(bg.fogColor).lerp(new THREE.Color(bg.skyTop), 0.35),
    side: THREE.BackSide,
    fog: true,
  });
  const ridgeMesh = new THREE.Mesh(ridgeGeo, ridgeMat);
  trackGroup.add(ridgeMesh);
  disposables.push(ridgeGeo, ridgeMat);

  // 2. Ground Terrain Plane (slightly below lowest track point, with gentle outer hills)
  const groundTex = createGroundTexture(config.biome, maxAnisotropy);
  const groundGeo = new THREE.PlaneGeometry(2400, 2400, 48, 48);
  groundGeo.rotateX(-Math.PI / 2);

  // Gently sculpt distant terrain outside track corridor so outdoor perimeter feels natural
  const gPos = groundGeo.attributes.position;
  for (let i = 0; i < gPos.count; i++) {
    const gx = gPos.getX(i);
    const gz = gPos.getZ(i);
    // Find closest sample (coarse step 12)
    let minD2 = Infinity;
    for (let j = 0; j < SAMPLE_COUNT; j += 12) {
      const dx = gx - samples[j].pos.x;
      const dz = gz - samples[j].pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) minD2 = d2;
    }
    const dist = Math.sqrt(minD2);
    let y = -3.2;
    if (dist > 48) {
      const hillFactor = Math.min(1, (dist - 48) / 180);
      const wave =
        Math.sin(gx * 0.015) * Math.cos(gz * 0.015) * 18 +
        Math.sin((gx + gz) * 0.008) * 14;
      y = -3.2 + hillFactor * Math.max(0, wave + 12);
    }
    gPos.setY(i, y);
  }
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.92,
    metalness: 0.04,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  trackGroup.add(groundMesh);
  disposables.push(groundTex, groundGeo, groundMat);

  // 3. Road Ribbon + Shoulders + Curbs + Outer Barriers
  const halfRoad = config.roadWidth / 2;
  const curbWidth = 1.25;
  const barrierOffset = halfRoad + config.shoulderWidth;

  const buildStrip = (
    offsetInner: number,
    offsetOuter: number,
    yOffsetInner: number,
    yOffsetOuter: number,
    uvScaleU: number,
    uvRepeatVPerMeter: number,
    material: THREE.Material,
    receiveShadow: boolean,
    castShadow = false
  ) => {
    const vertCount = (SAMPLE_COUNT + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices: number[] = [];

    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const s = samples[i % SAMPLE_COUNT];
      const arc = i === SAMPLE_COUNT ? totalLength : s.arcLength;
      const v = arc * uvRepeatVPerMeter;

      const pIn = s.pos.clone().addScaledVector(s.right, offsetInner);
      pIn.y += yOffsetInner;

      const pOut = s.pos.clone().addScaledVector(s.right, offsetOuter);
      pOut.y += yOffsetOuter;

      const vi = i * 2;
      positions[vi * 3] = pIn.x;
      positions[vi * 3 + 1] = pIn.y;
      positions[vi * 3 + 2] = pIn.z;
      uvs[vi * 2] = 0;
      uvs[vi * 2 + 1] = v;

      positions[(vi + 1) * 3] = pOut.x;
      positions[(vi + 1) * 3 + 1] = pOut.y;
      positions[(vi + 1) * 3 + 2] = pOut.z;
      uvs[(vi + 1) * 2] = uvScaleU;
      uvs[(vi + 1) * 2 + 1] = v;

      if (i < SAMPLE_COUNT) {
        const a = vi;
        const b = vi + 1;
        const c = vi + 2;
        const d = vi + 3;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = castShadow;
    trackGroup.add(mesh);
    disposables.push(geo);
  };

  // Asphalt surface
  const asphaltTex = createAsphaltTexture(maxAnisotropy, config.biome === 'night');
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: config.biome === 'night' ? 0.42 : 0.72,
    metalness: config.biome === 'night' ? 0.18 : 0.05,
  });
  buildStrip(-halfRoad, halfRoad, 0.02, 0.02, 1, 0.075, asphaltMat, true);
  disposables.push(asphaltTex, asphaltMat);

  // FIA Rumble Curbs (left & right)
  const curbTex = createCurbTexture(config.curbPrimary, config.curbSecondary, maxAnisotropy);
  const curbMat = new THREE.MeshStandardMaterial({
    map: curbTex,
    roughness: 0.78,
    metalness: 0.04,
  });
  buildStrip(-halfRoad - curbWidth, -halfRoad, 0.06, 0.03, 1, 0.14, curbMat, true);
  buildStrip(halfRoad, halfRoad + curbWidth, 0.03, 0.06, 1, 0.14, curbMat, true);
  disposables.push(curbTex, curbMat);

  // Outer Shoulder Apron (bridges curb to guardrail cleanly over terrain)
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: config.biome === 'desert' ? 0x854d2b : config.biome === 'night' ? 0x111827 : 0x2b3e24,
    roughness: 0.94,
    metalness: 0.02,
  });
  buildStrip(-barrierOffset, -halfRoad - curbWidth, -0.05, 0.05, 1, 0.1, shoulderMat, true);
  buildStrip(halfRoad + curbWidth, barrierOffset, 0.05, -0.05, 1, 0.1, shoulderMat, true);
  // Sloped embankment down to ground
  buildStrip(-barrierOffset - 5, -barrierOffset, -4.0, -0.05, 1, 0.1, shoulderMat, false);
  buildStrip(barrierOffset, barrierOffset + 5, -0.05, -4.0, 1, 0.1, shoulderMat, false);
  disposables.push(shoulderMat);

  // Raised Outer Safety Guardrails
  const railMat = new THREE.MeshStandardMaterial({
    color: config.biome === 'night' ? 0x334155 : 0x94a3b8,
    metalness: 0.65,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
  buildStrip(-barrierOffset, -barrierOffset, 0.1, 1.05, 1, 0.2, railMat, true, !isSoftwareGl);
  buildStrip(barrierOffset, barrierOffset, 1.05, 0.1, 1, 0.2, railMat, true, !isSoftwareGl);
  disposables.push(railMat);

  // 4. Start / Finish Checkered Strip + Overhead Gantry with 5 Countdown Light Pods
  const s0 = samples[0];
  const checkerTex = createCheckeredTexture(maxAnisotropy);
  const checkerGeo = new THREE.PlaneGeometry(config.roadWidth, 3.6);
  checkerGeo.rotateX(-Math.PI / 2);
  const checkerMat = new THREE.MeshStandardMaterial({
    map: checkerTex,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const checkerMesh = new THREE.Mesh(checkerGeo, checkerMat);
  checkerMesh.position.copy(s0.pos).add(new THREE.Vector3(0, 0.04, 0));
  checkerMesh.rotation.y = Math.atan2(-s0.tangent.x, -s0.tangent.z);
  checkerMesh.receiveShadow = true;
  trackGroup.add(checkerMesh);
  disposables.push(checkerTex, checkerGeo, checkerMat);

  // Overhead Gantry
  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(s0.pos);
  gantryGroup.rotation.y = Math.atan2(-s0.tangent.x, -s0.tangent.z);
  trackGroup.add(gantryGroup);

  const gantrySteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.75,
    roughness: 0.3,
  });
  const gantryAccentMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    metalness: 0.3,
    roughness: 0.4,
  });
  const pillarGeo = new THREE.BoxGeometry(0.9, 7.6, 0.9);
  const spanBeamGeo = new THREE.BoxGeometry(config.roadWidth + 4.4, 1.25, 1.2);

  const leftPillar = new THREE.Mesh(pillarGeo, gantrySteelMat);
  leftPillar.position.set(-(halfRoad + 1.8), 3.8, 0);
  leftPillar.castShadow = !isSoftwareGl;
  const rightPillar = new THREE.Mesh(pillarGeo, gantrySteelMat);
  rightPillar.position.set(halfRoad + 1.8, 3.8, 0);
  rightPillar.castShadow = !isSoftwareGl;

  const topBeam = new THREE.Mesh(spanBeamGeo, gantrySteelMat);
  topBeam.position.set(0, 7.2, 0);
  topBeam.castShadow = !isSoftwareGl;

  const bannerStripGeo = new THREE.BoxGeometry(config.roadWidth + 1.2, 0.35, 1.28);
  const bannerStrip = new THREE.Mesh(bannerStripGeo, gantryAccentMat);
  bannerStrip.position.set(0, 7.7, 0);

  gantryGroup.add(leftPillar, rightPillar, topBeam, bannerStrip);
  disposables.push(gantrySteelMat, gantryAccentMat, pillarGeo, spanBeamGeo, bannerStripGeo);

  // 5 Countdown Light Pods on the gantry
  const podGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 16);
  podGeo.rotateX(Math.PI / 2);
  const startLightMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.25,
    });
    const pod = new THREE.Mesh(podGeo, mat);
    pod.position.set((i - 2) * 1.4, 6.45, 0.55);
    gantryGroup.add(pod);
    startLightMats.push(mat);
    disposables.push(mat);
  }
  disposables.push(podGeo);

  // 5. Biome Scenery using InstancedMesh (trees / mesas / city lights)
  if (config.biome === 'alpine') {
    const treeCount = 180;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.6, 7);
    trunkGeo.translate(0, 1.8, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.9 });

    const foliageGeo = new THREE.ConeGeometry(2.6, 8.2, 7);
    foliageGeo.translate(0, 6.2, 0);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.85 });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
    foliage.castShadow = !isSoftwareGl;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    for (let i = 0; i < SAMPLE_COUNT && placed < treeCount; i += 4) {
      const s = samples[i];
      const side = placed % 2 === 0 ? 1 : -1;
      const dist = barrierOffset + 8 + ((i * 17) % 36);
      const wx = s.pos.x + s.right.x * side * dist;
      const wz = s.pos.z + s.right.z * side * dist;

      // Ensure not accidentally overlapping another loop section
      let tooClose = false;
      for (let j = 0; j < SAMPLE_COUNT; j += 15) {
        const dx = wx - samples[j].pos.x;
        const dz = wz - samples[j].pos.z;
        if (dx * dx + dz * dz < (barrierOffset + 4) * (barrierOffset + 4)) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const scale = 0.85 + ((placed * 37) % 100) / 220;
      dummy.position.set(wx, -3.0, wz);
      dummy.rotation.y = (placed * 1.7) % (Math.PI * 2);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      foliage.setMatrixAt(placed, dummy.matrix);

      color.setHSL(0.28 + ((placed % 7) - 3) * 0.012, 0.45, 0.24 + (placed % 5) * 0.025);
      foliage.setColorAt(placed, color);
      placed++;
    }
    trunks.count = placed;
    foliage.count = placed;
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    foliage.computeBoundingSphere();
    trackGroup.add(trunks, foliage);
    disposables.push(trunkGeo, trunkMat, foliageGeo, foliageMat);
  } else if (config.biome === 'desert') {
    const rockCount = 110;
    const rockGeo = new THREE.DodecahedronGeometry(4.2, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xa85532, roughness: 0.92, metalness: 0.05 });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.castShadow = !isSoftwareGl;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    for (let i = 0; i < SAMPLE_COUNT && placed < rockCount; i += 6) {
      const s = samples[i];
      const side = placed % 2 === 0 ? 1 : -1;
      const dist = barrierOffset + 12 + ((i * 23) % 45);
      const wx = s.pos.x + s.right.x * side * dist;
      const wz = s.pos.z + s.right.z * side * dist;

      let tooClose = false;
      for (let j = 0; j < SAMPLE_COUNT; j += 15) {
        const dx = wx - samples[j].pos.x;
        const dz = wz - samples[j].pos.z;
        if (dx * dx + dz * dz < (barrierOffset + 6) * (barrierOffset + 6)) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const sx = 0.8 + ((placed * 13) % 10) * 0.14;
      const sy = 0.9 + ((placed * 29) % 12) * 0.22;
      const sz = 0.8 + ((placed * 7) % 10) * 0.14;
      dummy.position.set(wx, -1.2, wz);
      dummy.rotation.set(0.1 * (placed % 3), placed * 0.9, 0.08 * (placed % 2));
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      rocks.setMatrixAt(placed, dummy.matrix);

      color.setHSL(0.05 + (placed % 5) * 0.01, 0.55, 0.36 + (placed % 4) * 0.04);
      rocks.setColorAt(placed, color);
      placed++;
    }
    rocks.count = placed;
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.computeBoundingSphere();
    trackGroup.add(rocks);
    disposables.push(rockGeo, rockMat);
  } else {
    // Midnight Expressway: illuminated trackside light poles + sleek background towers
    const poleCount = 48;
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 8.5, 8);
    poleGeo.translate(0, 4.25, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 });

    const lampGeo = new THREE.BoxGeometry(1.4, 0.22, 0.55);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, poleCount);
    const dummy = new THREE.Object3D();

    let placed = 0;
    for (let i = 0; i < SAMPLE_COUNT && placed < poleCount; i += Math.floor(SAMPLE_COUNT / poleCount)) {
      const s = samples[i];
      const side = placed % 2 === 0 ? 1 : -1;
      const wx = s.pos.x + s.right.x * side * (barrierOffset + 1.2);
      const wz = s.pos.z + s.right.z * side * (barrierOffset + 1.2);
      const yaw = Math.atan2(s.right.x * -side, s.right.z * -side);

      dummy.position.set(wx, s.pos.y, wz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(
        wx - s.right.x * side * 0.65,
        s.pos.y + 8.4,
        wz - s.right.z * side * 0.65
      );
      dummy.updateMatrix();
      lamps.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    poles.count = placed;
    lamps.count = placed;
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    poles.computeBoundingSphere();
    lamps.computeBoundingSphere();
    trackGroup.add(poles, lamps);

    // Skyline monolith towers outside circuit
    const towerCount = 44;
    const towerGeo = new THREE.BoxGeometry(12, 1, 12);
    towerGeo.translate(0, 0.5, 0);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.55,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.35,
    });
    const towers = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
    let tPlaced = 0;
    for (let i = 0; i < SAMPLE_COUNT && tPlaced < towerCount; i += 16) {
      const s = samples[i];
      const side = tPlaced % 2 === 0 ? 1 : -1;
      const dist = barrierOffset + 32 + ((i * 19) % 55);
      const wx = s.pos.x + s.right.x * side * dist;
      const wz = s.pos.z + s.right.z * side * dist;
      let tooClose = false;
      for (let j = 0; j < SAMPLE_COUNT; j += 15) {
        const dx = wx - samples[j].pos.x;
        const dz = wz - samples[j].pos.z;
        if (dx * dx + dz * dz < (barrierOffset + 18) * (barrierOffset + 18)) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      const h = 28 + ((tPlaced * 31) % 65);
      dummy.position.set(wx, -3.0, wz);
      dummy.rotation.set(0, (tPlaced * 0.5) % Math.PI, 0);
      dummy.scale.set(0.8 + (tPlaced % 3) * 0.35, h, 0.8 + ((tPlaced + 1) % 3) * 0.35);
      dummy.updateMatrix();
      towers.setMatrixAt(tPlaced, dummy.matrix);
      tPlaced++;
    }
    towers.count = tPlaced;
    towers.instanceMatrix.needsUpdate = true;
    towers.computeBoundingSphere();
    trackGroup.add(towers);

    disposables.push(poleGeo, poleMat, lampGeo, lampMat, towerGeo, towerMat);
  }

  // Fast projection helper
  const projectPoint = (x: number, z: number, hintIdx?: number): TrackProjection => {
    let bestIdx = 0;
    let bestD2 = Infinity;

    if (hintIdx !== undefined) {
      const windowRadius = 42;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (hintIdx + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
        const p = samples[idx].pos;
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = idx;
        }
      }
    }

    // Fallback global search if hint missing or far away (> 35m)
    if (hintIdx === undefined || bestD2 > 1225) {
      bestD2 = Infinity;
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const p = samples[i].pos;
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
    }

    const s = samples[bestIdx];
    const dx = x - s.pos.x;
    const dz = z - s.pos.z;
    const lateral = dx * s.right.x + dz * s.right.z;

    return {
      sampleIndex: bestIdx,
      t: s.t,
      lateral,
      pos: s.pos,
      tangent: s.tangent,
      right: s.right,
      curvature: s.curvature,
      distSq: bestD2,
    };
  };

  const sampleAtT = (t: number): TrackSample => {
    const norm = ((t % 1) + 1) % 1;
    const idx = Math.floor(norm * SAMPLE_COUNT) % SAMPLE_COUNT;
    return samples[idx];
  };

  const applyBackground = (nextBg: BackgroundPreset) => {
    skyMat.uniforms.topColor.value.set(nextBg.skyTop);
    skyMat.uniforms.midColor.value.set(nextBg.skyMid);
    skyMat.uniforms.horizonColor.value.set(nextBg.skyHorizon);
    skyMat.uniforms.sunColor.value.set(nextBg.sunColor);
    skyMat.uniforms.sunDir.value.set(0.45, nextBg.sunElevation, -0.82).normalize();
    skyMat.uniforms.isNight.value = nextBg.isNight ? 1.0 : 0.0;
    ridgeMat.color
      .set(nextBg.fogColor)
      .lerp(new THREE.Color(nextBg.skyTop), 0.35);
  };

  return {
    samples,
    totalLength,
    minimapPath,
    toMinimapCoords,
    projectPoint,
    sampleAtT,
    startLightMats,
    applyBackground,
    dispose: () => {
      scene.remove(trackGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
