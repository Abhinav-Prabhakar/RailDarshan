import * as THREE from 'three';
import {
  MeshBatch, roundedBox, cylinderGeo, tubeGeo, makeCanvas, canvasTexture,
  mulberry32, rr, pick, TAU, DEG, clamp, makeMatrix,
} from '../core/util.js';

export const RAIL_TOP = 0.272;

// --------------------------------------------------------------- wheel & bogie
export function wheelGeometry(radius = 0.46, width = 0.14) {
  const seg = 28;
  const pts = [];
  const r = radius, w = width / 2;
  pts.push(new THREE.Vector2(0.001, w));
  pts.push(new THREE.Vector2(0.06, w));
  pts.push(new THREE.Vector2(0.09, w * 0.86));
  pts.push(new THREE.Vector2(r * 0.7, w * 0.8));
  pts.push(new THREE.Vector2(r * 0.86, w * 0.7));
  pts.push(new THREE.Vector2(r * 0.95, w * 0.5));
  pts.push(new THREE.Vector2(r, w * 0.2));
  pts.push(new THREE.Vector2(r * 1.02, -w * 0.1));
  pts.push(new THREE.Vector2(r * 0.99, -w * 0.42));
  pts.push(new THREE.Vector2(r * 0.93, -w * 0.55));
  pts.push(new THREE.Vector2(r * 0.8, -w * 0.8));
  pts.push(new THREE.Vector2(0.08, -w * 0.9));
  pts.push(new THREE.Vector2(0.001, -w * 0.9));
  const geo = new THREE.LatheGeometry(pts, seg);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

export function buildWheelset(b, mats, {
  x = 0, y = 0.46, z = 0, r = 0.46, width = 0.14, halfGauge = 0.84, wheelMat = null, axleMat = null,
} = {}) {
  const wm = wheelMat || mats.metal(0x3b3a38, 0.42, 0.8);
  const am = axleMat || mats.metal(0x4b4b48, 0.5, 0.8);
  const wg = wheelGeometry(r, width);
  for (const s of [-1, 1]) {
    b.add(wg, wm, { pos: [x + s * halfGauge, y, z], castShadow: true, receiveShadow: true });
    // axle box
    b.box(0.25, 0.3, 0.34, mats.painted(0x2e2f2b, { roughness: 0.8, seed: 4 }), { pos: [x + s * (halfGauge + 0.23), y + 0.02, z] });
    b.box(0.11, 0.16, 0.18, mats.metal(0x6f6d64, 0.45, 0.8), { pos: [x + s * (halfGauge + 0.38), y + 0.02, z] });
  }
  b.cyl(0.055, 0.055, halfGauge * 2 + 0.1, am, { pos: [x, y, z], rot: [0, 0, Math.PI / 2], seg: 10 });
  // brake discs
  for (const s of [-1, 1]) {
    b.cyl(r * 0.58, r * 0.58, 0.035, mats.metal(0x5b5550, 0.42, 0.7), {
      pos: [x + s * 0.43, y, z], rot: [0, 0, Math.PI / 2], seg: 18,
    });
  }
}

export function buildBogie(b, mats, {
  z = 0, axles = 2, axleSpacing = 2.4, r = 0.46, frameW = 2.0, loco = false, plate = false,
} = {}) {
  const dark = mats.painted(0x262724, { roughness: 0.78, metalness: 0.35, seed: 7, variation: 1.4 });
  const rust = mats.photo('rust', { repeat: [1.2, 1.2], color: 0x6b6258, roughness: 1, normalScale: 0.6 });
  const steel = mats.metal(0x5e5f59, 0.46, 0.8);
  const pos = [];
  const off = (axles - 1) * axleSpacing / 2;
  for (let i = 0; i < axles; i++) pos.push(z + off - i * axleSpacing);
  // side frames
  for (const s of [-1, 1]) {
    b.box(0.22, 0.34, (axles - 1) * axleSpacing + 1.55, rust, {
      pos: [s * frameW / 2, 0.74, z], radius: 0.025,
    });
    for (const az of pos) {
      b.box(0.32, 0.22, 0.45, dark, { pos: [s * frameW / 2, 0.88, az], radius: 0.02 });
      b.box(0.36, 0.18, 0.32, steel, { pos: [s * frameW / 2, 0.64, az] });
      // coil springs
      for (const dz of [-0.17, 0.17]) {
        b.cyl(0.07, 0.07, 0.22, steel, { pos: [s * (frameW / 2 + 0.14), 0.78, az + dz], seg: 8 });
        b.cyl(0.09, 0.09, 0.03, dark, { pos: [s * (frameW / 2 + 0.14), 0.9, az + dz], seg: 8 });
      }
      // damper
      b.cyl(0.035, 0.035, 0.32, steel, { pos: [s * (frameW / 2 + 0.24), 0.9, az - 0.3], seg: 8 });
    }
    // sand boxes
    b.box(0.24, 0.3, 0.4, dark, { pos: [s * (frameW / 2 + 0.05), 0.96, z + (loco ? 0.9 : 0.7)] });
    // brake cylinders
    b.cyl(0.12, 0.12, 0.36, dark, { pos: [s * (frameW / 2 - 0.1), 0.72, z], rot: [Math.PI / 2, 0, 0], seg: 12 });
    // steps / lifting lugs
    b.box(0.25, 0.05, 0.35, dark, { pos: [s * (frameW / 2 + 0.2), 0.58, z + 0.2] });
  }
  // transom / bolster
  b.box(frameW + 0.25, 0.32, 0.55, dark, { pos: [0, 0.8, z], radius: 0.03 });
  b.box(frameW - 0.1, 0.18, 1.1, dark, { pos: [0, 0.62, z] });
  for (const az of pos) {
    b.cyl(0.11, 0.11, frameW + 0.05, mats.metal(0x3a3b38, 0.4, 0.85), {
      pos: [0, r + 0.02, az], rot: [0, 0, Math.PI / 2], seg: 12,
    });
    buildWheelset(b, mats, { z: az, y: r + 0.02, r, width: 0.15 });
    // traction motor housing
    b.cyl(0.26, 0.26, frameW * 0.7, mats.painted(0x34352f, { seed: 4 }), {
      pos: [0, r - 0.06, az - 0.55], rot: [0, 0, Math.PI / 2], seg: 12,
    });
    b.box(0.18, 0.16, 0.55, dark, { pos: [0, r + 0.22, az - 0.55] });
  }
  // traction / brake piping
  b.tube([[frameW / 2, 0.58, z - 1.9], [frameW / 2, 0.55, z], [frameW / 2, 0.58, z + 1.9]], 0.025, dark, { tubularSegments: 10 });
  b.tube([[-frameW / 2, 0.58, z - 1.9], [-frameW / 2, 0.55, z], [-frameW / 2, 0.58, z + 1.9]], 0.025, dark, { tubularSegments: 10 });
  if (plate) {
    b.box(1.8, 0.18, 2.4, mats.metal(0x3b3b37, 0.55, 0.7), { pos: [0, 0.52, z] });
  }
}

// --------------------------------------------------------------- windows & doors
export function addWindow(b, mats, {
  x, y, z, w = 1.2, h = 0.75, side = 1, rotY = 0, frameMat = null, glassMat = null, rounded = true,
} = {}) {
  const frame = frameMat || mats.metal(0x26282a, 0.5, 0.5);
  const glass = glassMat || mats.glass(0x0b141a, 0.92, 0.06);
  const nx = side * (x + 0.006);
  // dark recess
  b.box(0.035, h + 0.12, w + 0.12, mats.painted(0x080a0a, { seed: 2 }), { pos: [nx, y, z] });
  // aluminium frame
  const fw = 0.045;
  b.box(0.04, fw, w + 0.09, frame, { pos: [nx + side * 0.012, y + h / 2 + 0.03, z], castShadow: false });
  b.box(0.04, fw, w + 0.09, frame, { pos: [nx + side * 0.012, y - h / 2 - 0.03, z], castShadow: false });
  b.box(0.04, h + 0.06, fw, frame, { pos: [nx + side * 0.012, y, z + w / 2 + 0.03], castShadow: false });
  b.box(0.04, h + 0.06, fw, frame, { pos: [nx + side * 0.012, y, z - w / 2 - 0.03], castShadow: false });
  // glass
  b.add(new THREE.PlaneGeometry(w, h), glass, {
    pos: [nx + side * 0.022, y, z],
    rot: [0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
    castShadow: false, receiveShadow: false,
  });
  // small sill
  b.box(0.06, 0.03, w + 0.11, mats.metal(0x6b6f70, 0.35, 0.7), { pos: [nx + side * 0.02, y - h / 2 - 0.06, z], castShadow: false });
}

export function addDoor(b, mats, {
  x, y, z, w = 1.0, h = 2.0, side = 1, livery = null, glassMat = null, steps = true,
} = {}) {
  const frameMat = livery || mats.metal(0x7e8484, 0.4, 0.6);
  const dark = mats.painted(0x111413, { seed: 3 });
  const nx = side * x;
  // recess
  b.box(0.05, h + 0.12, w + 0.15, dark, { pos: [nx, y + h / 2, z] });
  // door leaf
  b.box(0.045, h, w, frameMat, { pos: [nx + side * 0.018, y + h / 2, z] });
  // window
  addWindow(b, mats, {
    x, y: y + h * 0.73, z, w: w * 0.62, h: 0.66, side, glassMat,
    frameMat: mats.metal(0x2b2d2e, 0.35, 0.6),
  });
  // handle and kick plate
  b.box(0.035, 0.28, 0.035, mats.chrome, { pos: [nx + side * 0.065, y + h * 0.5, z - w / 2 + 0.16], castShadow: false });
  b.box(0.03, 0.22, w * 0.9, mats.painted(0x6d6f6c, { roughness: 0.6, seed: 4 }), { pos: [nx + side * 0.045, y + 0.18, z] });
  // vertical seam
  b.box(0.06, h, 0.02, dark, { pos: [nx + side * 0.04, y + h / 2, z] });
  // steps below
  if (steps) {
    b.box(0.85, 0.04, 0.36, mats.metal(0x4b4c47, 0.6, 0.7), { pos: [nx + side * 0.36, y - 0.16, z] });
    b.box(0.18, 0.16, 0.36, mats.metal(0x3f403b, 0.65, 0.6), { pos: [nx + side * 0.72, y - 0.08, z] });
  }
  // grab rail
  b.tube([[x * side + side * 0.16, y + 0.4, z + w / 2 + 0.1], [x * side + side * 0.18, y + 1.4, z + w / 2 + 0.1]], 0.02, mats.metal(0xb8b9b4, 0.3, 0.9));
}

export function addGrime(b, tex, side, x, y, z, len, h, seed = 1, opacity = 0.5) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f261c, map: null, alphaMap: tex.getGrime(seed), transparent: true, opacity,
    roughness: 1, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
  });
  b.add(new THREE.PlaneGeometry(len, h), mat, {
    pos: [side * (x + 0.012), y, z],
    rot: [0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
    castShadow: false, receiveShadow: false,
  });
}

export function addTextDecal(texture, w, h, { x = 0, y = 0, z = 0, side = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: texture, transparent: true, alphaTest: 0.02, roughness: 0.55, metalness: 0.04,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(side * x, y, z);
  mesh.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  mesh.castShadow = false;
  return mesh;
}

export function addRivetLine(b, mats, { x, y, z0, z1, count = 20, side = 1, r = 0.018, mat = null }) {
  const m = mat || mats.metal(0x4f4e48, 0.6, 0.7);
  for (let i = 0; i < count; i++) {
    const z = z0 + (z1 - z0) * (i / (count - 1));
    b.sphere(r, m, { pos: [x * side, y, z], seg: 6, castShadow: false });
  }
}

export function addLouvres(b, mats, {
  x = 1.5, y = 2.2, z = 0, w = 2.0, h = 0.9, side = 1, count = 11,
} = {}) {
  const dark = mats.painted(0x151716, { seed: 2 });
  const metal = mats.painted(0x6b6f6a, { roughness: 0.55, metalness: 0.4, seed: 6 });
  b.box(0.04, h + 0.1, w + 0.12, dark, { pos: [side * (x + 0.008), y, z] });
  for (let i = 0; i < count; i++) {
    const yy = y - h / 2 + (i / (count - 1)) * h;
    b.box(0.035, h / count * 0.66, w, metal, {
      pos: [side * (x + 0.035), yy, z], rot: [0, 0, side * 0.24], castShadow: false,
    });
  }
}

export function addRibLines(b, mats, { x, z0, z1, side = 1, count = 30, y = 2.1, h = 1.8 }) {
  const mat = mats.painted(0x8c8c80, { roughness: 0.65, metalness: 0.2, seed: 8 });
  for (let i = 0; i < count; i++) {
    const z = z0 + (z1 - z0) * (i / (count - 1));
    b.box(0.022, h, 0.022, mat, { pos: [side * x, y, z], castShadow: false });
  }
}

// --------------------------------------------------------------- air / train ends
export function addEndDetail(b, mats, { z, dir = 1, width = 3.1, coupler = true } = {}) {
  const dark = mats.painted(0x181a19, { seed: 4 });
  const steel = mats.metal(0x6b6c66, 0.45, 0.8);
  b.box(width, 2.8, 0.18, dark, { pos: [0, 2.25, z] });
  // rubber gangway
  b.box(2.1, 2.25, 0.3, mats.rubber, { pos: [0, 2.25, z + dir * 0.15] });
  b.box(2.0, 0.12, 0.4, mats.rubber, { pos: [0, 3.4, z + dir * 0.16] });
  if (coupler) {
    b.box(0.32, 0.3, 0.7, steel, { pos: [0, 1.15, z + dir * 0.38] });
    b.cyl(0.16, 0.12, 0.16, steel, { pos: [0, 1.1, z + dir * 0.8], rot: [Math.PI / 2, 0, 0], seg: 12 });
    // hoses
    for (const s of [-1, 1]) {
      b.tube([[s * 0.6, 1.35, z + dir * 0.05], [s * 0.7, 0.95, z + dir * 0.3], [s * 0.5, 0.85, z + dir * 0.45]], 0.028, mats.rubber, { tubularSegments: 6 });
    }
    // buffers
    for (const s of [-1, 1]) {
      b.cyl(0.18, 0.24, 0.32, steel, { pos: [s * 1.05, 1.25, z + dir * 0.12], rot: [Math.PI / 2, 0, 0], seg: 14 });
      b.cyl(0.28, 0.28, 0.06, mats.painted(0x2b2c29, { seed: 3 }), { pos: [s * 1.05, 1.25, z + dir * 0.3], rot: [Math.PI / 2, 0, 0], seg: 16 });
    }
  }
}

export function addBufferBeam(b, mats, { z, dir = -1, width = 3.1, flagTex = null } = {}) {
  const beamMat = mats.painted(0x1d1e1c, { roughness: 0.55, metalness: 0.5, seed: 9 });
  const steel = mats.metal(0x5e605a, 0.4, 0.85);
  b.box(width, 0.38, 0.24, beamMat, { pos: [0, 1.32, z] });
  for (const s of [-1, 1]) {
    b.cyl(0.31, 0.25, 0.4, steel, { pos: [s * 1.02, 1.16, z + dir * -0.06], rot: [Math.PI / 2, 0, 0], seg: 18 });
    b.cyl(0.34, 0.32, 0.07, mats.metal(0x3d3e3a, 0.55, 0.7), { pos: [s * 1.02, 1.16, z + dir * 0.12], rot: [Math.PI / 2, 0, 0], seg: 18 });
  }
  // coupler
  b.box(0.36, 0.3, 0.7, steel, { pos: [0, 1.18, z + dir * 0.3] });
  b.cyl(0.17, 0.12, 0.2, steel, { pos: [0, 1.12, z + dir * 0.7], rot: [Math.PI / 2, 0, 0], seg: 14 });
  // hoses
  for (const s of [-1, 1]) {
    b.tube([[s * 0.55, 1.35, z], [s * 0.72, 1.03, z + dir * -0.2], [s * 0.52, 0.88, z + dir * -0.35]], 0.032, mats.rubber, { tubularSegments: 6 });
  }
  // plough / guard
  for (const s of [-1, 1]) {
    b.box(1.35, 0.55, 0.08, mats.painted(0x252622, { roughness: 0.62, metalness: 0.6, seed: 6 }), {
      pos: [s * 0.78, 0.72, z + dir * -0.32], rot: [dir * 0.5, s * 0.16, 0],
    });
  }
  b.box(2.4, 0.35, 0.06, mats.blackMetal, { pos: [0, 0.55, z + dir * -0.38], rot: [dir * 0.18, 0, 0] });
  // small flag decal
  if (flagTex) {
    const mat = new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.65, side: THREE.DoubleSide });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), mat);
    f.position.set(0, 2.05, z + dir * 0.02);
    f.rotation.y = dir < 0 ? 0 : Math.PI;
    return f;
  }
  return null;
}

export function addCabWindows(b, mats, { z, dir = -1, y = 3.26, width = 0.9, height = 0.7, spread = 0.62 } = {}) {
  const glass = mats.glass(0x050d12, 0.96, 0.04);
  const frame = mats.painted(0x2b2d2b, { roughness: 0.45, metalness: 0.35, seed: 5 });
  for (const s of [-1, 1]) {
    b.box(spread + 0.2, height + 0.16, 0.06, frame, { pos: [s * spread, y, z + dir * 0.01] });
    b.add(new THREE.PlaneGeometry(width, height), glass, {
      pos: [s * spread, y, z + dir * 0.05], rot: [0, dir < 0 ? Math.PI : 0, 0], castShadow: false, receiveShadow: false,
    });
    // wiper
    b.box(0.025, 0.42, 0.025, mats.blackMetal, { pos: [s * spread - 0.16, y - 0.1, z + dir * 0.08], rot: [0, 0, 0.48], castShadow: false });
  }
}

export function addPantograph(b, mats, { x = 0, y = 3.98, z = 0, raised = true, height = 1.35 } = {}) {
  const metal = mats.metal(0x5d5e58, 0.34, 0.85);
  const dark = mats.painted(0x222421, { seed: 3 });
  const ins = mats.painted(0x6d4a33, { roughness: 0.5, metalness: 0.05, seed: 3 });
  // insulators
  for (const dx of [-0.7, 0.7]) {
    for (const dz of [-0.55, 0.55]) {
      for (let k = 0; k < 4; k++) {
        b.cyl(0.09, 0.09, 0.055, ins, { pos: [x + dx, y + 0.08 + k * 0.09, z + dz], seg: 10 });
      }
    }
  }
  // base frame
  b.box(1.9, 0.1, 1.5, dark, { pos: [x, y + 0.44, z] });
  b.box(1.7, 0.08, 0.2, metal, { pos: [x, y + 0.52, z - 0.5] });
  b.box(1.7, 0.08, 0.2, metal, { pos: [x, y + 0.52, z + 0.5] });
  const headY = y + 0.55 + height;
  if (raised) {
    // lower arm pair
    for (const s of [-1, 1]) {
      b.tube([[x + s * 0.55, y + 0.52, z + 0.35], [x + s * 0.36, y + 0.95, z - 0.45]], 0.035, metal, { tubularSegments: 8 });
      b.tube([[x + s * 0.34, y + 0.88, z - 0.65], [x + s * 0.18, headY - 0.1, z + 0.22]], 0.028, metal, { tubularSegments: 10 });
    }
    // crossbars
    for (const yy of [0.5, 0.72, 0.9]) {
      b.tube([[x - 0.6, y + yy, z + 0.1], [x + 0.6, y + yy, z + 0.1]], 0.015, metal, { tubularSegments: 4 });
    }
    // contact head
    b.box(2.0, 0.055, 0.16, metal, { pos: [x, headY, z + 0.2] });
    b.box(2.1, 0.035, 0.05, mats.metal(0xd2ccc0, 0.18, 1), { pos: [x, headY + 0.05, z + 0.2] });
    for (const s of [-1, 1]) b.box(0.055, 0.16, 0.3, metal, { pos: [x + s * 1.03, headY - 0.05, z + 0.2] });
    // horn-like bow collectors
    b.tube([[x - 0.95, headY + 0.02, z + 0.2], [x - 1.1, headY - 0.14, z + 0.1]], 0.025, metal, { tubularSegments: 4 });
    b.tube([[x + 0.95, headY + 0.02, z + 0.2], [x + 1.1, headY - 0.14, z + 0.1]], 0.025, metal, { tubularSegments: 4 });
  } else {
    for (const s of [-1, 1]) {
      b.tube([[x + s * 0.55, y + 0.52, z + 0.35], [x + s * 0.46, y + 0.78, z - 0.9]], 0.035, metal, { tubularSegments: 8 });
    }
    b.box(1.6, 0.07, 0.22, metal, { pos: [x, y + 0.78, z - 0.9] });
  }
  return { headY: y + 0.55 + height, x, z: z + 0.2 };
}

export function addBogieBolts(b, mats, x, z) {
  const bolt = mats.metal(0x76746b, 0.4, 0.8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.cyl(0.018, 0.018, 0.03, bolt, { pos: [x + Math.cos(a) * 0.2, 0.98, z + Math.sin(a) * 0.2], rot: [Math.PI / 2, 0, 0], seg: 6, castShadow: false });
  }
}

export function makeFlagTexture(tex) { return tex.flag(); }

export function addChromeStrip(b, mats, { x, y, z, len, side = 1, h = 0.035 }) {
  b.box(0.035, h, len, mats.metal(0xd6d2c6, 0.2, 0.95), {
    pos: [side * (x + 0.01), y, z], castShadow: false,
  });
}
