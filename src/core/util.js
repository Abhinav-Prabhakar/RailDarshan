import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function fade(t) { return t * t * (3 - 2 * t); }

export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, y, octaves = 4, seed = 0, lacunarity = 2, gain = 0.5) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 37);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
export function rr(rng, a, b) { return a + (b - a) * rng(); }
export function rpick(rng, a, b) { return rr(rng, a, b); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, {
  srgb = true, repeat = null, wrap = THREE.RepeatWrapping, anisotropy = 4, flipY = true,
} = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) { t.repeat.set(repeat[0], repeat[1]); }
  t.wrapS = t.wrapT = wrap;
  t.anisotropy = anisotropy;
  t.flipY = flipY;
  t.needsUpdate = true;
  return t;
}

export function makeMatrix(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'));
  m.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale));
  return m;
}

export function roundedBox(w, h, d, radius = 0.04, segments = 3) {
  const r = Math.min(radius, Math.min(w, h, d) * 0.499);
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

/*
 * Sweeps a rounded-rectangle cross-section along Z, with optional end taper.
 * profile(t): { sx, sy, dy }  t=0 is -Z end, t=1 is +Z end.
 */
export function sweepBody({
  length = 20, width = 3, height = 2.9, bottom = 0,
  rBottom = 0.1, rTop = 0.42, roofRise = 0.06,
  sections = 40, loopSegments = 22, caps = true,
  profile = null,
}) {
  const hw = width / 2;
  const pts = [];
  const push = (x, y) => {
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(prev[0] - x, prev[1] - y) > 0.002) pts.push([x, y]);
  };
  // Start at bottom center-left and go around anticlockwise.
  const rB = Math.min(rBottom, hw * 0.6, height * 0.3);
  const rT = Math.min(rTop, hw * 0.75, height * 0.4);
  push(-hw + rB, 0);
  push(hw - rB, 0);
  for (let i = 1; i <= 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2);
    push(hw - rB + Math.cos(a) * rB, rB + Math.sin(a) * rB);
  }
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * 1;
    push(hw, rB + (height - rB - rT) * a);
  }
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    push(hw - rT + Math.cos(a) * rT, height - rT + Math.sin(a) * rT);
  }
  // roof crown
  const roofHalf = hw - rT;
  const roofPts = 12;
  for (let i = 1; i < roofPts; i++) {
    const x = roofHalf - (i / roofPts) * roofHalf * 2;
    const y = height + Math.sin((i / roofPts) * Math.PI) * roofRise;
    push(x, y);
  }
  for (let i = 1; i <= 6; i++) {
    const a = Math.PI / 2 + (i / 6) * (Math.PI / 2);
    push(-hw + rT + Math.cos(a) * rT, height - rT + Math.sin(a) * rT);
  }
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4);
    push(-hw, height - rT - (height - rB - rT) * a);
  }
  for (let i = 1; i <= 5; i++) {
    const a = Math.PI + (i / 5) * (Math.PI / 2);
    push(-hw + rB + Math.cos(a) * rB, rB + Math.sin(a) * rB);
  }
  // resample loop evenly by angle-ish index (keeps all corners)
  const L = pts.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let s = 0; s <= sections; s++) {
    const t = s / sections;
    const z = -length / 2 + t * length;
    const p = profile ? profile(t) : { sx: 1, sy: 1, dy: 0 };
    const sx = p.sx ?? 1, sy = p.sy ?? 1, dy = p.dy ?? 0, dx = p.dx ?? 0;
    for (let i = 0; i < L; i++) {
      const [px, py] = pts[i];
      positions.push(px * sx + dx, bottom + py * sy + dy, z);
      uvs.push(i / (L - 1), t);
    }
  }
  for (let s = 0; s < sections; s++) {
    for (let i = 0; i < L; i++) {
      const a = s * L + i;
      const b = s * L + ((i + 1) % L);
      const c = (s + 1) * L + ((i + 1) % L);
      const d = (s + 1) * L + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  if (caps) {
    // Add simple end caps; keep them as separate non-indexed pieces by extending arrays is fiddly,
    // so end walls are normally supplied by the caller. We still close the ends visually here.
    const capVerts = [];
    for (const end of [0, 1]) {
      const z = end === 0 ? -length / 2 : length / 2;
      const p = profile ? profile(end) : { sx: 1, sy: 1, dy: 0 };
      const sx = p.sx ?? 1, sy = p.sy ?? 1, dy = p.dy ?? 0, dx = p.dx ?? 0;
      const cy = bottom + (height * 0.5) * sy + dy;
      const cx = dx;
      for (let i = 0; i < L; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % L];
        const A = [x1 * sx + cx, bottom + y1 * sy + dy, z];
        const B = [x2 * sx + cx, bottom + y2 * sy + dy, z];
        const C = [cx, cy, z];
        if (end === 0) capVerts.push(...A, ...C, ...B); else capVerts.push(...A, ...B, ...C);
      }
    }
    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capVerts, 3));
    capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((capVerts.length / 3) * 2), 2));
    capGeo.computeVertexNormals();
    geo.computeVertexNormals();
    const merged = mergeGeometries([geo.toNonIndexed(), capGeo], false);
    if (merged) return merged;
  }
  geo.computeVertexNormals();
  return geo;
}

export function cylinderGeo(rTop, rBottom, h, seg = 16, open = false) {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
}

export function sphereGeo(r, seg = 12) { return new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)); }

export function tubeGeo(points, radius = 0.02, tubularSegments = 24, radialSegments = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

export function arcPoints(cx, cy, cz, radius, a0, a1, n, axis = 'xy') {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    if (axis === 'xy') out.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, cz]);
    else if (axis === 'yz') out.push([cx, cy + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
    else out.push([cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius]);
  }
  return out;
}

export class MeshBatch {
  constructor(name = 'batch') {
    this.name = name;
    this.groups = new Map();
  }

  add(geometry, material, {
    pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], matrix = null,
    castShadow = true, receiveShadow = true, uvScale = null, uvOffset = null,
  } = {}) {
    if (!geometry || !material) return;
    const g = geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    else g.applyMatrix4(makeMatrix(pos, rot, scale));
    // Normalise the attribute set so every primitive in a batch can merge.
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (uvScale || uvOffset) {
      const uv = g.getAttribute('uv');
      if (uv) {
        const s = uvScale || [1, 1];
        const o = uvOffset || [0, 0];
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * s[0] + o[0], uv.getY(i) * s[1] + o[1]);
        }
        uv.needsUpdate = true;
      }
    }
    const key = `${material.uuid}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}|${g.index ? 1 : 0}`;
    let entry = this.groups.get(key);
    if (!entry) {
      entry = { material, castShadow, receiveShadow, geos: [] };
      this.groups.set(key, entry);
    }
    entry.geos.push(g);
    return g;
  }

  box(w, h, d, material, opts = {}) {
    const radius = opts.radius ?? Math.min(0.03, Math.min(w, h, d) * 0.15);
    const geo = radius > 0.0015 ? roundedBox(w, h, d, radius, opts.segments ?? 2) : new THREE.BoxGeometry(w, h, d);
    return this.add(geo, material, opts);
  }

  cyl(rTop, rBottom, h, material, opts = {}) {
    return this.add(cylinderGeo(rTop, rBottom, h, opts.seg ?? 16, opts.open ?? false), material, opts);
  }

  sphere(r, material, opts = {}) {
    return this.add(sphereGeo(r, opts.seg ?? 12), material, opts);
  }

  torus(r, tube, material, opts = {}) {
    const geo = new THREE.TorusGeometry(r, tube, opts.radialSegments ?? 6, opts.tubularSegments ?? 20);
    return this.add(geo, material, opts);
  }

  tube(points, radius, material, opts = {}) {
    return this.add(tubeGeo(points, radius, opts.tubularSegments ?? 24, opts.radialSegments ?? 5), material, opts);
  }

  build(parent, name = this.name) {
    const root = new THREE.Group();
    root.name = name;
    for (const { material, castShadow, receiveShadow, geos } of this.groups.values()) {
      if (!geos.length) continue;
      let merged = null;
      try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
      if (!merged) {
        for (const g of geos) {
          const mesh = new THREE.Mesh(g, material);
          mesh.castShadow = castShadow;
          mesh.receiveShadow = receiveShadow;
          root.add(mesh);
        }
      } else {
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        root.add(mesh);
        for (const g of geos) g.dispose();
      }
    }
    this.groups.clear();
    parent.add(root);
    return root;
  }
}

export function disposeObject(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isPoints && o.geometry) o.geometry.dispose();
  });
  if (root.parent) root.parent.remove(root);
}

export class TweenManager {
  constructor() { this.items = []; }
  add({ duration = 1, delay = 0, ease = t => t, onUpdate, onComplete }) {
    const item = { t: -delay, duration, ease, onUpdate, onComplete };
    this.items.push(item);
    return item;
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t < 0) continue;
      const k = clamp(it.t / it.duration, 0, 1);
      if (it.onUpdate) it.onUpdate(it.ease(k), k);
      if (k >= 1) {
        this.items.splice(i, 1);
        if (it.onComplete) it.onComplete();
      }
    }
  }
  clear() { this.items.length = 0; }
}

export const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInCubic = t => t * t * t;
export const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
export const easeInOutQuint = t => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2);

export class CameraTransition {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.active = null;
  }
  to({ position, target, duration = 2.2, ease = easeInOutCubic, onComplete = null }) {
    const p0 = this.camera.position.clone();
    const t0 = this.controls ? this.controls.target.clone() : new THREE.Vector3();
    this.active = {
      p0, t0, p1: new THREE.Vector3(...position), t1: new THREE.Vector3(...target),
      time: 0, duration, ease, onComplete,
    };
  }
  update(dt) {
    const a = this.active;
    if (!a) return false;
    a.time += dt;
    const k = clamp(a.time / a.duration, 0, 1);
    const e = a.ease(k);
    this.camera.position.lerpVectors(a.p0, a.p1, e);
    if (this.controls) {
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      this.controls.update();
    } else {
      this.camera.lookAt(new THREE.Vector3().lerpVectors(a.t0, a.t1, e));
    }
    if (k >= 1) {
      this.active = null;
      if (a.onComplete) a.onComplete();
    }
    return true;
  }
}

export function fitShadowCamera(light, center, radius = 55) {
  const cam = light.shadow.camera;
  cam.left = -radius; cam.right = radius;
  cam.top = radius; cam.bottom = -radius;
  cam.near = 1; cam.far = radius * 4;
  light.position.set(center[0] + light.userData.offset.x, center[1] + light.userData.offset.y, center[2] + light.userData.offset.z);
  light.target.position.set(center[0], center[1], center[2]);
  light.target.updateMatrixWorld();
  cam.updateProjectionMatrix();
}
