import * as THREE from 'three';

export function createAsphaltTexture(maxAnisotropy: number, isNight: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base dark asphalt
  ctx.fillStyle = isNight ? '#161A22' : '#252830';
  ctx.fillRect(0, 0, 512, 512);

  // Aggregate stone speckle
  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = isNight ? 18 + Math.random() * 24 : 30 + Math.random() * 34;
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle racing line rubber wear grooves
  const grooveGrad = ctx.createLinearGradient(0, 0, 512, 0);
  grooveGrad.addColorStop(0, 'rgba(0,0,0,0.0)');
  grooveGrad.addColorStop(0.28, 'rgba(8,10,14,0.28)');
  grooveGrad.addColorStop(0.5, 'rgba(8,10,14,0.08)');
  grooveGrad.addColorStop(0.72, 'rgba(8,10,14,0.28)');
  grooveGrad.addColorStop(1, 'rgba(0,0,0,0.0)');
  ctx.fillStyle = grooveGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Crisp white track edge boundary lines
  ctx.fillStyle = isNight ? '#94A3B8' : '#E2E8F0';
  ctx.fillRect(18, 0, 10, 512);
  ctx.fillRect(484, 0, 10, 512);

  // Center dashed lane line
  ctx.fillStyle = isNight ? 'rgba(56, 189, 248, 0.55)' : 'rgba(241, 245, 249, 0.55)';
  ctx.fillRect(252, 32, 8, 176);
  ctx.fillRect(252, 288, 8, 176);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createCurbTexture(
  primary: string,
  secondary: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const stripes = 8;
  const stripeH = 512 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? primary : secondary;
    ctx.fillRect(0, i * stripeH, 128, stripeH);
  }

  // Subtle grime edge
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 16, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createCheckeredTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const cols = 16;
  const rows = 4;
  const cw = 512 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : '#0F172A';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createGroundTexture(
  biome: 'alpine' | 'desert' | 'night',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (biome === 'alpine') {
    ctx.fillStyle = '#2B4223';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const g = 55 + Math.floor(Math.random() * 35);
      ctx.fillStyle = `rgb(${Math.floor(g * 0.65)}, ${g}, ${Math.floor(g * 0.45)})`;
      ctx.fillRect(x, y, 3, 3);
    }
  } else if (biome === 'desert') {
    ctx.fillStyle = '#9C5B33';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 135 + Math.floor(Math.random() * 45);
      ctx.fillStyle = `rgb(${r}, ${Math.floor(r * 0.58)}, ${Math.floor(r * 0.34)})`;
      ctx.fillRect(x, y, 3, 2);
    }
  } else {
    ctx.fillStyle = '#0D1321';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(30, 58, 138, 0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 42);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 22, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
