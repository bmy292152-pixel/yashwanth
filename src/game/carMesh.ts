import * as THREE from 'three';
import { CarBodyStyle } from './types';

export interface CarMeshHandle {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  frontLeftSteer: THREE.Group;
  frontRightSteer: THREE.Group;
  wheels: THREE.Group[];
  brakeLightMat: THREE.MeshStandardMaterial;
  boostFlames: THREE.Mesh[];
  dispose: () => void;
}

export function buildRaceCarMesh(
  primaryHex: string,
  accentHex: string,
  shadowTex: THREE.Texture,
  castShadow: boolean,
  bodyStyle: CarBodyStyle = 'bmw-gt3'
): CarMeshHandle {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Materials
  const paintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(primaryHex),
      metalness: 0.55,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(accentHex),
      metalness: 0.35,
      roughness: 0.32,
    })
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161920,
      metalness: 0.2,
      roughness: 0.62,
    })
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.14,
    })
  );

  const canopyMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1220,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    })
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x141518,
      metalness: 0.05,
      roughness: 0.88,
    })
  );

  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.9,
      roughness: 0.18,
    })
  );

  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(primaryHex === '#F1F5F9' ? '#EF4444' : primaryHex),
      metalness: 0.4,
      roughness: 0.35,
    })
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: bodyStyle === 'bmw-gt3' ? 0xfef08a : 0xe0f2fe, // BMW GT3 iconic yellow DRLs!
      emissiveIntensity: 2.3,
      roughness: 0.1,
    })
  );

  const brakeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xef4444,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    })
  );

  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  // 1. Sculpted Main Chassis Hull (tailored silhouette per brand)
  const hullShape = new THREE.Shape();
  if (bodyStyle === 'amg-gt3') {
    // Long muscular front hood
    hullShape.moveTo(-2.22, 0.24);
    hullShape.lineTo(-2.05, 0.52);
    hullShape.lineTo(-0.75, 0.72);
    hullShape.lineTo(-0.25, 0.8);
    hullShape.lineTo(1.0, 0.79);
    hullShape.lineTo(1.9, 0.73);
    hullShape.lineTo(2.12, 0.65);
    hullShape.lineTo(2.15, 0.26);
    hullShape.lineTo(1.55, 0.22);
    hullShape.lineTo(-1.8, 0.22);
  } else if (bodyStyle === 'ferrari-gt3' || bodyStyle === 'lambo-gt3') {
    // Low mid-engine wedge nose
    hullShape.moveTo(-2.22, 0.21);
    hullShape.lineTo(-1.95, 0.39);
    hullShape.lineTo(-1.05, 0.62);
    hullShape.lineTo(-0.45, 0.74);
    hullShape.lineTo(0.9, 0.76);
    hullShape.lineTo(1.95, 0.74);
    hullShape.lineTo(2.14, 0.65);
    hullShape.lineTo(2.14, 0.25);
    hullShape.lineTo(1.55, 0.22);
    hullShape.lineTo(-1.8, 0.21);
  } else {
    // BMW M4 GT3 & Porsche 911 GT3 R aggressive coupe stance
    hullShape.moveTo(-2.18, 0.24);
    hullShape.lineTo(-1.98, 0.5);
    hullShape.lineTo(-1.05, 0.7);
    hullShape.lineTo(-0.45, 0.79);
    hullShape.lineTo(0.88, 0.79);
    hullShape.lineTo(1.88, 0.75);
    hullShape.lineTo(2.12, 0.66);
    hullShape.lineTo(2.15, 0.26);
    hullShape.lineTo(1.55, 0.22);
    hullShape.lineTo(-1.75, 0.22);
  }
  hullShape.closePath();

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
      steps: 1,
    })
  );
  hullGeo.translate(0, 0, -1.72 / 2);
  hullGeo.rotateY(-Math.PI / 2);
  hullGeo.computeVertexNormals();

  const hullMesh = new THREE.Mesh(hullGeo, paintMat);
  hullMesh.castShadow = castShadow;
  hullMesh.receiveShadow = true;
  bodyGroup.add(hullMesh);

  // 2. Sculpted Cockpit Canopy
  const canopyShape = new THREE.Shape();
  if (bodyStyle === 'amg-gt3') {
    canopyShape.moveTo(-0.62, 0.68);
    canopyShape.lineTo(-0.08, 1.13);
    canopyShape.lineTo(0.88, 1.12);
    canopyShape.lineTo(1.52, 0.73);
    canopyShape.lineTo(1.38, 0.65);
    canopyShape.lineTo(-0.55, 0.65);
  } else if (bodyStyle === 'porsche-gt3') {
    canopyShape.moveTo(-0.98, 0.66);
    canopyShape.lineTo(-0.28, 1.15);
    canopyShape.lineTo(0.62, 1.12);
    canopyShape.lineTo(1.55, 0.72);
    canopyShape.lineTo(1.42, 0.64);
    canopyShape.lineTo(-0.9, 0.64);
  } else {
    canopyShape.moveTo(-0.92, 0.66);
    canopyShape.lineTo(-0.32, 1.13);
    canopyShape.lineTo(0.68, 1.13);
    canopyShape.lineTo(1.38, 0.72);
    canopyShape.lineTo(1.25, 0.64);
    canopyShape.lineTo(-0.85, 0.64);
  }
  canopyShape.closePath();

  const canopyGeo = trackGeo(
    new THREE.ExtrudeGeometry(canopyShape, {
      depth: 1.18,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.05,
      bevelSegments: 3,
    })
  );
  canopyGeo.translate(0, 0, -1.18 / 2);
  canopyGeo.rotateY(-Math.PI / 2);
  canopyGeo.computeVertexNormals();

  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.castShadow = castShadow;
  bodyGroup.add(canopyMesh);

  // 3. Lower Carbon Splitter & Side Skirts
  const splitterGeo = trackGeo(new THREE.BoxGeometry(2.02, 0.09, 4.44));
  const splitterMesh = new THREE.Mesh(splitterGeo, carbonMat);
  splitterMesh.position.set(0, 0.21, -0.02);
  splitterMesh.castShadow = castShadow;
  bodyGroup.add(splitterMesh);

  const frontLipGeo = trackGeo(new THREE.BoxGeometry(2.08, 0.06, 0.44));
  const frontLip = new THREE.Mesh(frontLipGeo, accentMat);
  frontLip.position.set(0, 0.2, -2.2);
  bodyGroup.add(frontLip);

  // 4. Brand-Specific Livery Stripes & Fascia Details
  if (bodyStyle === 'bmw-gt3') {
    // Iconic BMW Twin Kidney Grille on front nose
    const grilleSurroundGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.28, 0.08));
    const grilleMeshGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.22, 0.09));
    [-0.25, 0.25].forEach((gx) => {
      const surround = new THREE.Mesh(grilleSurroundGeo, chromeMat);
      surround.position.set(gx, 0.39, -2.23);
      const inner = new THREE.Mesh(grilleMeshGeo, carbonMat);
      inner.position.set(gx, 0.39, -2.24);
      bodyGroup.add(surround, inner);
    });

    // BMW M Motorsport Tricolor Stripes (Light Blue, Dark Blue, Red)
    const mColors = [0x38bdf8, 0x1d4ed8, 0xef4444];
    const mStripeHoodGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.022, 1.32));
    const mStripeRoofGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.026, 0.96));
    mColors.forEach((col, i) => {
      const mMat = trackMat(
        new THREE.MeshStandardMaterial({ color: col, metalness: 0.25, roughness: 0.3 })
      );
      const offsetX = (i - 1) * 0.12 - 0.18;
      const hs = new THREE.Mesh(mStripeHoodGeo, mMat);
      hs.position.set(offsetX, 0.67, -1.42);
      hs.rotation.x = 0.21;
      const rs = new THREE.Mesh(mStripeRoofGeo, mMat);
      rs.position.set(offsetX, 1.185, 0.18);
      bodyGroup.add(hs, rs);
    });
  } else if (bodyStyle === 'amg-gt3') {
    // Wide Panamericana grille with vertical slats
    const amgGrilleGeo = trackGeo(new THREE.BoxGeometry(0.95, 0.22, 0.08));
    const amgGrille = new THREE.Mesh(amgGrilleGeo, carbonMat);
    amgGrille.position.set(0, 0.38, -2.24);
    bodyGroup.add(amgGrille);
    const slatGeo = trackGeo(new THREE.BoxGeometry(0.03, 0.2, 0.1));
    for (let s = -4; s <= 4; s++) {
      const slat = new THREE.Mesh(slatGeo, chromeMat);
      slat.position.set(s * 0.1, 0.38, -2.24);
      bodyGroup.add(slat);
    }
    const hoodStripeGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.02, 1.35));
    const hoodStripe = new THREE.Mesh(hoodStripeGeo, accentMat);
    hoodStripe.position.set(0, 0.68, -1.35);
    hoodStripe.rotation.x = 0.2;
    bodyGroup.add(hoodStripe);
  } else if (bodyStyle === 'lambo-gt3') {
    // Overhead carbon roof scoop + angular center stripe
    const scoopGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.14, 0.68));
    const scoop = new THREE.Mesh(scoopGeo, carbonMat);
    scoop.position.set(0, 1.24, 0.28);
    bodyGroup.add(scoop);

    const hoodStripeGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.02, 1.25));
    const hoodStripe = new THREE.Mesh(hoodStripeGeo, accentMat);
    hoodStripe.position.set(0, 0.61, -1.42);
    hoodStripe.rotation.x = 0.21;
    bodyGroup.add(hoodStripe);
  } else {
    // Classic twin center racing stripe (Porsche / Ferrari)
    const hoodStripeGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.02, 1.28));
    const roofStripeGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.025, 0.95));
    [-0.12, 0.12].forEach((sx) => {
      const hs = new THREE.Mesh(hoodStripeGeo, accentMat);
      hs.position.set(sx, 0.65, -1.42);
      hs.rotation.x = 0.22;
      const rs = new THREE.Mesh(roofStripeGeo, accentMat);
      rs.position.set(sx, 1.18, 0.18);
      bodyGroup.add(hs, rs);
    });
  }

  // 5. Wide Sidepods / Fender Flares
  const sidepodWidth = bodyStyle === 'porsche-gt3' ? 0.22 : 0.18;
  const sidepodGeo = trackGeo(new THREE.BoxGeometry(sidepodWidth, 0.34, 2.2));
  const leftPod = new THREE.Mesh(sidepodGeo, paintMat);
  leftPod.position.set(-0.96, 0.42, 0.05);
  leftPod.castShadow = castShadow;
  const rightPod = new THREE.Mesh(sidepodGeo, paintMat);
  rightPod.position.set(0.96, 0.42, 0.05);
  rightPod.castShadow = castShadow;
  bodyGroup.add(leftPod, rightPod);

  const intakeGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.22, 0.65));
  const leftIntake = new THREE.Mesh(intakeGeo, carbonMat);
  leftIntake.position.set(-1.05, 0.45, 0.25);
  const rightIntake = new THREE.Mesh(intakeGeo, carbonMat);
  rightIntake.position.set(1.05, 0.45, 0.25);
  bodyGroup.add(leftIntake, rightIntake);

  // 6. Side Mirrors
  const mirrorGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.09, 0.14));
  const leftMirror = new THREE.Mesh(mirrorGeo, paintMat);
  leftMirror.position.set(-0.82, 0.85, -0.58);
  const rightMirror = new THREE.Mesh(mirrorGeo, paintMat);
  rightMirror.position.set(0.82, 0.85, -0.58);
  bodyGroup.add(leftMirror, rightMirror);

  // 7. Rear GT Carbon Spoiler Wing + Twin Stanchions + Endplates
  const wingBladeGeo = trackGeo(new THREE.BoxGeometry(2.08, 0.06, 0.4));
  const wingBlade = new THREE.Mesh(wingBladeGeo, carbonMat);
  wingBlade.position.set(0, 1.16, 2.04);
  wingBlade.rotation.x = 0.14;
  wingBlade.castShadow = castShadow;
  bodyGroup.add(wingBlade);

  const pylonGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.44, 0.22));
  const leftPylon = new THREE.Mesh(pylonGeo, carbonMat);
  leftPylon.position.set(-0.56, 0.93, 1.98);
  const rightPylon = new THREE.Mesh(pylonGeo, carbonMat);
  rightPylon.position.set(0.56, 0.93, 1.98);
  bodyGroup.add(leftPylon, rightPylon);

  const endplateGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.25, 0.48));
  const leftEnd = new THREE.Mesh(endplateGeo, accentMat);
  leftEnd.position.set(-1.04, 1.15, 2.04);
  const rightEnd = new THREE.Mesh(endplateGeo, accentMat);
  rightEnd.position.set(1.04, 1.15, 2.04);
  bodyGroup.add(leftEnd, rightEnd);

  // 8. Rear Diffuser + Dual Exhausts + Boost Flames
  const diffuserGeo = trackGeo(new THREE.BoxGeometry(1.5, 0.18, 0.26));
  const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
  diffuser.position.set(0, 0.26, 2.15);
  bodyGroup.add(diffuser);

  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12));
  exhaustGeo.rotateX(Math.PI / 2);
  const flameGeo = trackGeo(new THREE.ConeGeometry(0.09, 0.72, 10));
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.36);

  const boostFlames: THREE.Mesh[] = [];
  [-0.36, 0.36].forEach((exX) => {
    const exMesh = new THREE.Mesh(exhaustGeo, rimMat);
    exMesh.position.set(exX, 0.3, 2.18);
    bodyGroup.add(exMesh);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(exX, 0.3, 2.25);
    flame.visible = false;
    bodyGroup.add(flame);
    boostFlames.push(flame);
  });

  // 9. LED Headlights & Rear Taillight Bar (brand-shaped)
  const hlGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.08, 0.12));
  const hlLeft = new THREE.Mesh(hlGeo, headlightMat);
  hlLeft.position.set(-0.68, 0.46, -2.14);
  hlLeft.rotation.y = 0.2;
  const hlRight = new THREE.Mesh(hlGeo, headlightMat);
  hlRight.position.set(0.68, 0.46, -2.14);
  hlRight.rotation.y = -0.2;
  bodyGroup.add(hlLeft, hlRight);

  if (bodyStyle === 'ferrari-gt3') {
    // Quad circular Ferrari tail lamps
    const lampGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14));
    lampGeo.rotateX(Math.PI / 2);
    [-0.72, -0.48, 0.48, 0.72].forEach((lx) => {
      const lamp = new THREE.Mesh(lampGeo, brakeLightMat);
      lamp.position.set(lx, 0.58, 2.19);
      bodyGroup.add(lamp);
    });
  } else {
    const tailBarGeo = trackGeo(new THREE.BoxGeometry(1.56, 0.08, 0.08));
    const tailBar = new THREE.Mesh(tailBarGeo, brakeLightMat);
    tailBar.position.set(0, 0.58, 2.19);
    bodyGroup.add(tailBar);
  }

  // 10. Four Composite Multi-Part Wheels
  const tireRadius = 0.35;
  const tireWidth = 0.3;
  const tireGeo = trackGeo(new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 24));
  tireGeo.rotateZ(Math.PI / 2);

  const rimGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, tireWidth + 0.02, 16));
  rimGeo.rotateZ(Math.PI / 2);

  const spokeGeo = trackGeo(new THREE.BoxGeometry(tireWidth + 0.03, 0.4, 0.055));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.08, tireWidth + 0.04, 12));
  hubGeo.rotateZ(Math.PI / 2);

  const makeWheel = (): THREE.Group => {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = castShadow;
    wg.add(tire);

    const rim = new THREE.Mesh(rimGeo, carbonMat);
    wg.add(rim);

    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.rotation.x = (s * Math.PI) / 3;
      wg.add(spoke);
    }

    const hub = new THREE.Mesh(hubGeo, caliperMat);
    wg.add(hub);
    return wg;
  };

  const frontLeftSteer = new THREE.Group();
  frontLeftSteer.position.set(-0.98, tireRadius, -1.36);
  const flWheel = makeWheel();
  frontLeftSteer.add(flWheel);
  root.add(frontLeftSteer);

  const frontRightSteer = new THREE.Group();
  frontRightSteer.position.set(0.98, tireRadius, -1.36);
  const frWheel = makeWheel();
  frontRightSteer.add(frWheel);
  root.add(frontRightSteer);

  const rlWheel = makeWheel();
  rlWheel.position.set(-1.0, tireRadius, 1.38);
  root.add(rlWheel);

  const rrWheel = makeWheel();
  rrWheel.position.set(1.0, tireRadius, 1.38);
  root.add(rrWheel);

  // 11. Contact Shadow Grounding Plane
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(3.2, 5.4));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.set(0, 0.03, 0);
  root.add(shadowPlane);

  return {
    group: root,
    bodyGroup,
    frontLeftSteer,
    frontRightSteer,
    wheels: [flWheel, frWheel, rlWheel, rrWheel],
    brakeLightMat,
    boostFlames,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
