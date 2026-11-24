import * as THREE from 'three';
import {
  MeshBatch, sweepBody, roundedBox, mulberry32, rr, clamp, TAU, smoothstep, makeCanvas, canvasTexture,
} from '../core/util.js';
import { buildBogie, addWindow, addDoor, addTextDecal, addGrime, addRibLines, addEndDetail } from './parts.js';

const col = (s) => (typeof s === 'number' ? s : new THREE.Color(s).getHex());

// A livery ribbon that follows the aerofoil taper of a Vande/Namo cab end.
function aeroBandGeometry({ dir, side, len, halfW, y, h, floorY = 1.02 }) {
  const segs = 12;
  const noseLen = 0.19;
  const off = y - floorY;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const k = smoothstep(0, 1, u);
    const sx = 0.55 + 0.45 * k;
    const sy = 0.7 + 0.3 * k;
    const z = dir * (len / 2 - u * noseLen * len);
    const x = side * (halfW * sx + 0.012);
    const yc = floorY + off * sy;
    const hh = (h * sy) / 2;
    pos.push(x, yc - hh, z, x, yc + hh, z);
    uv.push(0, u, 1, u);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

let _interiorGlow = null;
export function interiorGlowTexture() {
  if (_interiorGlow) return _interiorGlow;
  const c = makeCanvas(512, 320);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#3a2413');
  g.addColorStop(0.35, '#a5733d');
  g.addColorStop(0.75, '#c9975c');
  g.addColorStop(1, '#5a3a20');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 320);
  // ceiling tubes
  for (let i = 0; i < 3; i++) {
    const lg = ctx.createLinearGradient(0, 20 + i * 30, 0, 70 + i * 30);
    lg.addColorStop(0, 'rgba(255,244,214,0)');
    lg.addColorStop(0.5, 'rgba(255,244,214,.55)');
    lg.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 20 + i * 30, 512, 40);
  }
  // seat backs and heads
  const rng = mulberry32(14);
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 72;
    ctx.fillStyle = 'rgba(40,26,18,.55)';
    ctx.beginPath();
    ctx.roundRect(x, 150, 54, 170, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,20,14,.75)';
    ctx.beginPath(); ctx.ellipse(x + 27, 135, 17, 22, 0, 0, TAU); ctx.fill();
  }
  // curtains
  for (const x of [0, 470]) {
    const cg = ctx.createLinearGradient(x, 0, x + 42, 0);
    cg.addColorStop(0, 'rgba(70,40,22,.9)'); cg.addColorStop(1, 'rgba(70,40,22,0)');
    ctx.fillStyle = cg; ctx.fillRect(x, 0, 42, 320);
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,230,190,${rr(rng, .01, .06)})`;
    ctx.fillRect(rng() * 512, rng() * 320, 1, 1);
  }
  _interiorGlow = canvasTexture(c);
  _interiorGlow.wrapS = _interiorGlow.wrapT = THREE.ClampToEdgeWrapping;
  return _interiorGlow;
}

function bodySkin(b, mats, cfg, { len, halfW, bottom, top, roofMat }) {
  const livery = cfg.livery;
  const bodyMat = mats.painted(col(livery.body), { roughness: 0.55, metalness: 0.03, clearcoat: 0.06, clearcoatRoughness: 0.5, seed: 11, variation: 0.45 });
  const skinH = top - bottom;
  const skinY = (top + bottom) / 2;
  const inset = cfg.type === 'aero' ? 3.9 : 0.02;
  for (const s of [-1, 1]) {
    b.add(new THREE.PlaneGeometry(len - inset * 2, skinH), bodyMat, {
      pos: [s * (halfW + 0.002), skinY, 0],
      rot: [0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
      castShadow: true, receiveShadow: true,
    });
  }
  return bodyMat;
}

function addBand(b, mats, { len, halfW, y, h = 0.12, color, inset = 0.02, emissive = null }) {
  const mat = mats.painted(col(color), { roughness: 0.52, metalness: 0.05, clearcoat: 0.08, seed: 18, variation: 0.5 });
  for (const s of [-1, 1]) {
    b.box(0.028, h, len - inset * 2, mat, {
      pos: [s * (halfW + 0.012), y, 0], castShadow: false, receiveShadow: true,
    });
  }
  return mat;
}

function roofGear(b, mats, { len, y, seed = 1 }) {
  const grey = mats.painted(0x999b98, { roughness: 0.62, metalness: 0.35, clearcoat: 0.1, seed });
  const dark = mats.painted(0x4c4f4e, { roughness: 0.7, metalness: 0.4, seed });
  const rng = mulberry32(seed * 31 + 7);
  for (let i = 0; i < 3; i++) {
    const z = -len * 0.3 + i * len * 0.3 + rr(rng, -0.6, 0.6);
    b.box(1.7, 0.22, 2.3, grey, { pos: [0, y + 0.1, z], radius: 0.05 });
    b.box(1.5, 0.12, 2.0, dark, { pos: [0, y + 0.24, z], radius: 0.04 });
    for (const dx of [-0.55, 0.55]) {
      b.box(0.08, 0.05, 1.8, dark, { pos: [dx, y + 0.3, z], castShadow: false });
    }
  }
  // vents
  for (let i = 0; i < 4; i++) {
    const z = -len / 2 + 2.2 + i * (len - 4.4) / 3;
    b.cyl(0.2, 0.24, 0.12, grey, { pos: [rr(rng, -0.6, 0.6), y + 0.05, z], seg: 12 });
    b.cyl(0.16, 0.16, 0.04, dark, { pos: [rr(rng, -0.6, 0.6), y + 0.12, z], seg: 12 });
  }
  // cable run
  for (const dx of [-0.9, 0.9]) {
    b.box(0.05, 0.05, len - 2, dark, { pos: [dx, y + 0.03, 0], castShadow: false });
  }
}

function underframe(b, mats, { len, halfW, floorY }) {
  const dark = mats.painted(0x1b1c1a, { roughness: 0.72, metalness: 0.45, seed: 9, variation: 1.1 });
  const rust = mats.photo('rust', { repeat: [2, 2], color: 0x4a453e, normalScale: 0.5 });
  b.box(halfW * 2 - 0.16, 0.26, len - 0.5, dark, { pos: [0, floorY - 0.13, 0], radius: 0.03 });
  b.box(halfW * 2 - 0.5, 0.34, len - 1.2, rust, { pos: [0, floorY - 0.4, 0], castShadow: false });
  for (let i = 0; i < 4; i++) {
    const z = -len / 2 + 2.0 + i * (len - 4) / 3;
    b.box(0.8, 0.55, 1.3, rust, { pos: [rr(mulberry32(i + 9), -0.55, 0.55), floorY - 0.5, z], radius: 0.035 });
    b.box(0.82, 0.08, 1.32, dark, { pos: [0, floorY - 0.78, z] });
  }
  // battery boxes, control boxes
  b.box(1.1, 0.62, 2.2, mats.painted(0x30322f, { roughness: 0.75, seed: 4 }), { pos: [0, floorY - 0.48, len * 0.18], radius: 0.03 });
  b.box(1.0, 0.5, 1.7, mats.painted(0x3a3c38, { roughness: 0.75, seed: 5 }), { pos: [0, floorY - 0.45, -len * 0.22], radius: 0.03 });
  // drain pipes
  for (const dz of [-len * 0.32, len * 0.28]) {
    b.cyl(0.035, 0.035, 1.2, mats.metal(0x5c5e58, 0.5, 0.7), { pos: [halfW - 0.35, floorY - 0.5, dz], rot: [0.2, 0, 0], seg: 6 });
  }
}

function endWalls(b, mats, { len, halfW, floorY, topY, dark = 0x17181a, skipFront = false, skipRear = false }) {
  const mat = mats.painted(dark, { roughness: 0.7, metalness: 0.1, seed: 4 });
  for (const dz of [-1, 1]) {
    if (dz < 0 && skipFront) continue;
    if (dz > 0 && skipRear) continue;
    const z = dz * (len / 2 - 0.02);
    b.box(halfW * 2 - 0.06, topY - floorY, 0.09, mat, { pos: [0, (topY + floorY) / 2, z], radius: 0.03, castShadow: false });
    // gangway
    b.box(1.9, 2.05, 0.3, mats.rubber, { pos: [0, floorY + 1.28, z + dz * 0.12] });
    b.box(1.75, 0.1, 0.36, mats.metal(0x6d6f6a, 0.5, 0.6), { pos: [0, floorY + 2.34, z + dz * 0.12] });
    // small window in end door
    b.add(new THREE.PlaneGeometry(0.55, 0.5), mats.glass(0x111c20, 0.8, 0.15), {
      pos: [0, floorY + 1.7, z + dz * 0.06], rot: [0, dz > 0 ? 0 : Math.PI, 0], castShadow: false, receiveShadow: false,
    });
    // grab rails
    b.tube([[0.7, floorY + 0.4, z + dz * 0.16], [0.7, floorY + 2.2, z + dz * 0.16]], 0.018, mats.metal(0xb9bab3, 0.35, 0.85));
  }
}

export function buildCoach(tex, mats, cfg, { index = 0, windowMat = null, isTail = false } = {}) {
  const type = cfg.type || 'lhb';
  const livery = cfg.livery || {};
  const b = new MeshBatch(`coach-${type}`);
  const overlays = [];
  const geo = {};

  if (type === 'lhb' || type === 'icf' || type === 'maharaja' || type === 'heritage') {
    const dims = {
      lhb: { len: 23.5, halfW: 1.505, floorY: 1.06, h: 2.95, rTop: 0.44, doors: 2 },
      icf: { len: 22.2, halfW: 1.52, floorY: 1.02, h: 2.86, rTop: 0.4, doors: 2 },
      maharaja: { len: 23.0, halfW: 1.5, floorY: 1.06, h: 2.95, rTop: 0.46, doors: 2 },
      heritage: { len: 21.4, halfW: 1.46, floorY: 1.08, h: 2.78, rTop: 0.5, doors: 2 },
    }[type];
    const { len, halfW, floorY, h, rTop } = dims;
    const topY = floorY + h;
    const wallTop = topY - rTop - 0.02;
    geo.len = len; geo.halfW = halfW; geo.topY = topY; geo.floorY = floorY;
    const roofColor = col(livery.roof || '#8a8d8e');
    const roofMat = mats.painted(roofColor, { roughness: 0.62, metalness: 0.35, clearcoat: 0.2, seed: 14, variation: 1.1 });
    b.add(sweepBody({
      length: len, width: halfW * 2, height: h, bottom: floorY,
      rBottom: 0.12, rTop, roofRise: 0.07, sections: 30, loopSegments: 22,
    }), roofMat, { castShadow: true, receiveShadow: true });
    bodySkin(b, mats, cfg, { len, halfW, bottom: floorY + 0.06, top: wallTop, roofMat });

    // The lower silver / steel skirt band
    const lowerBand = type === 'maharaja' ? 0x2a1c18 : type === 'heritage' ? 0x2a4c66 : 0x9b9b94;
    addBand(b, mats, { len, halfW, y: floorY + 0.72, h: 0.63, color: lowerBand, inset: 0.3 });

    // window + door layout
    const win = {
      lhb: { y: floorY + 1.86, w: 1.16, h: 0.72, gap: 1.08, doorAt: len / 2 - 1.35 },
      icf: { y: floorY + 1.82, w: 0.92, h: 0.66, gap: 0.95, doorAt: len / 2 - 1.3 },
      maharaja: { y: floorY + 1.88, w: 1.4, h: 0.92, gap: 1.16, doorAt: len / 2 - 1.5 },
      heritage: { y: floorY + 1.78, w: 1.16, h: 0.9, gap: 1.22, doorAt: len / 2 - 1.4 },
    }[type];
    const doorZ = [-win.doorAt, win.doorAt];
    const usable = len - 3.6;
    const count = Math.max(5, Math.floor(usable / (win.w + win.gap)));
    const startZ = -(count - 1) * (win.w + win.gap) / 2;
    const doorMat = mats.painted(col(livery.door || livery.body || '#555'), { roughness: 0.4, metalness: 0.1, clearcoat: 0.5, seed: 7 });

    for (const s of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const z = startZ + i * (win.w + win.gap);
        if (Math.abs(z) > len / 2 - 2.6) continue;
        addWindow(b, mats, {
          x: halfW - 0.012, y: win.y, z, w: win.w, h: win.h, side: s, glassMat: windowMat,
          frameMat: type === 'maharaja' ? mats.brass : undefined,
        });
        if (type === 'maharaja') {
          // gold surround
          b.box(0.03, win.h + 0.2, win.w + 0.22, mats.brass, { pos: [s * (halfW + 0.026), win.y, z], castShadow: false });
        }
      }
      for (const dz of doorZ) {
        addDoor(b, mats, {
          x: halfW - 0.02, y: floorY + 0.35, z: dz, w: 0.92, h: 1.95, side: s,
          livery: doorMat, glassMat: windowMat,
        });
      }
      // riveted panel line
      if (type === 'icf') {
        addRibLines(b, mats, { x: halfW + 0.006, z0: -len / 2 + 1.4, z1: len / 2 - 1.4, side: s, count: 30, y: floorY + 1.25, h: 1.9 });
      }
      // roof rain strip
      b.box(0.05, 0.05, len - 1.2, mats.metal(0xb4b4a8, 0.4, 0.6), { pos: [s * (halfW - 0.2), wallTop + 0.03, 0], castShadow: false });
      // footstep below each door
      for (const dz of doorZ) {
        b.box(0.6, 0.05, 0.34, mats.metal(0x44463f, 0.55, 0.65), { pos: [s * (halfW + 0.1), floorY - 0.02, dz], castShadow: false });
      }
      // grab rails beside doors
      for (const dz of doorZ) {
        for (const off of [-0.62, 0.62]) {
          b.tube([[s * (halfW + 0.03), floorY + 0.5, dz + off], [s * (halfW + 0.03), floorY + 2.15, dz + off]], 0.018, mats.metal(0xb9bab3, 0.35, 0.8));
        }
      }
    }

    roofGear(b, mats, { len, y: topY + 0.015, seed: index + 3 });
    underframe(b, mats, { len, halfW, floorY });
    endWalls(b, mats, { len, halfW, floorY, topY });

    // bogies
    for (const dz of [-1, 1]) {
      buildBogie(b, mats, { z: dz * (len / 2 - 3.4), axles: 2, axleSpacing: 2.45, r: 0.46, frameW: 2.15 });
    }
    addEndDetail(b, mats, { z: -len / 2 + 0.02, dir: -1, width: halfW * 2 });
    addEndDetail(b, mats, { z: len / 2 - 0.02, dir: 1, width: halfW * 2 });

    // livery pinstripes
    const bandY = floorY + 2.42;
    addBand(b, mats, { len, halfW, y: bandY, h: 0.07, color: livery.band || '#c9ab72', inset: 0.15 });
    addBand(b, mats, { len, halfW, y: bandY + 0.14, h: 0.035, color: livery.accent || '#e3bd77', inset: 0.15 });
    if (type === 'maharaja') {
      addBand(b, mats, { len, halfW, y: topY - 0.2, h: 0.1, color: livery.band || '#b9924e', inset: 0.1 });
    }
    if (type === 'heritage') {
      // truss rods under the solebar
      for (const s of [-1, 1]) {
        b.tube([[s * halfW * 0.75, floorY - 0.2, -len / 2 + 1.4], [s * halfW * 0.75, floorY - 0.72, 0], [s * halfW * 0.75, floorY - 0.2, len / 2 - 1.4]], 0.028, mats.brass, { tubularSegments: 12 });
      }
      // balcony rail at each end
      for (const dz of [-1, 1]) {
        const z = dz * (len / 2 - 0.55);
        for (const s of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            b.cyl(0.015, 0.015, 0.75, mats.metal(0xc5b78d, 0.3, 0.9), { pos: [s * (halfW - 0.05), floorY + 0.4, z - 0.5 + i * 0.33], seg: 6, castShadow: false });
          }
          b.box(0.04, 0.04, 1.6, mats.metal(0xc5b78d, 0.3, 0.9), { pos: [s * (halfW - 0.05), floorY + 0.78, z], castShadow: false });
        }
      }
    }

    // side lettering
    const nameTex = tex.label({
      w: 1600, h: 260, text: livery.name || cfg.name || 'INDIAN RAILWAYS', bg: 'transparent',
      color: livery.text || '#f1e4c8', font: '"Manrope", sans-serif', weight: 800, size: 132, letterSpacing: 3,
    });
    const nameW = clamp((livery.name || 'INDIAN RAILWAYS').length * 0.3, 2.0, 5.2);
    overlays.push(addTextDecal(nameTex, nameW, nameW * 0.1625, { x: halfW + 0.034, y: floorY + 1.3, z: -len * 0.18, side: 1 }));
    overlays.push(addTextDecal(nameTex, nameW, nameW * 0.1625, { x: halfW + 0.034, y: floorY + 1.3, z: -len * 0.18, side: -1 }));

    const typeTex = tex.label({
      w: 1200, h: 150, text: livery.typeLabel || '', bg: 'transparent',
      color: livery.text || '#e8dcc0', font: '"Manrope", sans-serif', weight: 500, size: 58, letterSpacing: 2.4,
    });
    if (livery.typeLabel) {
      overlays.push(addTextDecal(typeTex, 3.4, 0.425, { x: halfW + 0.034, y: floorY + 0.86, z: -len * 0.18, side: 1 }));
      overlays.push(addTextDecal(typeTex, 3.4, 0.425, { x: halfW + 0.034, y: floorY + 0.86, z: -len * 0.18, side: -1 }));
    }
    // coach number near doors
    const num = `${String(12000 + index * 137).slice(0, 5)}`;
    const numTex = tex.label({
      w: 512, h: 220, text: num, sub: 'IR', bg: 'transparent', color: livery.text || '#eee0c0',
      size: 108, subSize: 42, weight: 700, letterSpacing: 1,
    });
    overlays.push(addTextDecal(numTex, 0.55, 0.24, { x: halfW + 0.034, y: floorY + 2.13, z: len / 2 - 2.02, side: 1 }));
    overlays.push(addTextDecal(numTex, 0.55, 0.24, { x: halfW + 0.034, y: floorY + 2.13, z: len / 2 - 2.02, side: -1 }));

    // enamel type plates at the roofline
    if (type !== 'maharaja') {
      const plates = ['RAIL DARSHAN', 'AIR CONDITIONED'];
      for (const s of [-1, 1]) {
        let z = -len / 2 + 3.4;
        for (const p of plates) {
          const t = tex.label({
            w: 640, h: 128, text: p, bg: '#e9e2d0', color: '#1f242a', size: 46, weight: 600,
            font: '"Manrope", sans-serif', letterSpacing: 0.5,
          });
          const m = new THREE.Mesh(new THREE.PlaneGeometry(p.length * 0.028 + 0.3, 0.13), new THREE.MeshStandardMaterial({
            map: t, roughness: 0.5, metalness: 0.05,
          }));
          m.position.set(s * (halfW + 0.017), wallTop - 0.18, z);
          m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
          m.castShadow = false;
          overlays.push(m);
          z += p.length * 0.028 + 0.55;
        }
      }
    }
  } else if (type === 'double') {
    const len = 23.0, halfW = 1.5, floorY = 0.98, h = 3.9, rTop = 0.4;
    const topY = floorY + h;
    geo.len = len; geo.halfW = halfW; geo.topY = topY; geo.floorY = floorY;
    const roofMat = mats.painted(col(livery.roof || '#858a8b'), { roughness: 0.62, metalness: 0.35, clearcoat: 0.2, seed: 15 });
    b.add(sweepBody({
      length: len, width: halfW * 2, height: h, bottom: floorY,
      rBottom: 0.1, rTop, roofRise: 0.06, sections: 30, loopSegments: 22,
    }), roofMat, { castShadow: true, receiveShadow: true });
    bodySkin(b, mats, cfg, { len, halfW, bottom: floorY + 0.05, top: topY - rTop - 0.02, roofMat });
    addBand(b, mats, { len, halfW, y: floorY + 0.42, h: 0.4, color: 0x9fa19b, inset: 0.18 });
    const doorMat = mats.painted(col(livery.door || '#1d4d7e'), { roughness: 0.4, metalness: 0.1, clearcoat: 0.5, seed: 8 });
    for (const s of [-1, 1]) {
      // two rows of windows
      for (const [wy, hh] of [[floorY + 1.62, 0.66], [floorY + 3.02, 0.62]]) {
        const count = 9;
        for (let i = 0; i < count; i++) {
          const z = -len / 2 + 3.0 + i * (len - 6) / (count - 1);
          addWindow(b, mats, { x: halfW - 0.012, y: wy, z, w: 1.02, h: hh, side: s, glassMat: windowMat });
        }
      }
      // low doors on the centre
      for (const dz of [-5.2, 5.2]) {
        addDoor(b, mats, { x: halfW - 0.02, y: floorY + 0.02, z: dz, w: 1.25, h: 1.72, side: s, livery: doorMat, glassMat: windowMat });
      }
      // stair hint / livery stripe between decks
      b.box(0.03, 0.14, len - 0.5, mats.painted(col(livery.band || '#e4bd45'), { seed: 4 }), { pos: [s * (halfW + 0.014), floorY + 2.36, 0], castShadow: false });
    }
    roofGear(b, mats, { len, y: topY + 0.02, seed: 6 });
    underframe(b, mats, { len, halfW, floorY });
    endWalls(b, mats, { len, halfW, floorY, topY });
    for (const dz of [-1, 1]) buildBogie(b, mats, { z: dz * (len / 2 - 3.5), axles: 2, axleSpacing: 2.5, r: 0.46, frameW: 2.15 });
    addEndDetail(b, mats, { z: -len / 2 + 0.02, dir: -1, width: halfW * 2 });
    addEndDetail(b, mats, { z: len / 2 - 0.02, dir: 1, width: halfW * 2 });
    const nameTex = tex.label({
      w: 1600, h: 260, text: livery.name || 'DOUBLE DECKER', bg: 'transparent', color: livery.text || '#f0dea7',
      size: 116, weight: 800, letterSpacing: 3,
    });
    overlays.push(addTextDecal(nameTex, 4.6, 0.75, { x: halfW + 0.034, y: floorY + 2.82, z: -len * 0.19, side: 1 }));
    overlays.push(addTextDecal(nameTex, 4.6, 0.75, { x: halfW + 0.034, y: floorY + 2.82, z: -len * 0.19, side: -1 }));
  } else if (type === 'aero') {
    const len = 20.0, halfW = 1.58, floorY = 1.02, h = 3.0, rTop = 0.52;
    const topY = floorY + h;
    geo.len = len; geo.halfW = halfW; geo.topY = topY; geo.floorY = floorY;
    const bodyMat = mats.painted(col(livery.body || '#f1f0e9'), { roughness: 0.4, metalness: 0.08, clearcoat: 0.42, clearcoatRoughness: 0.34, seed: 12, variation: 0.55 });
    const isFront = cfg._noseFront, isRear = cfg._noseRear;
    const profile = (t) => {
      const nose = isFront ? smoothstep(0, 0.19, t) : 1;
      const tail = isRear ? smoothstep(0, 0.19, 1 - t) : 1;
      const k = Math.min(nose, tail);
      return { sx: 0.55 + 0.45 * k, sy: 0.7 + 0.3 * k, dy: 0 };
    };
    b.add(sweepBody({
      length: len, width: halfW * 2, height: h, bottom: floorY,
      rBottom: 0.14, rTop, roofRise: 0.04, sections: 52, loopSegments: 26,
      profile: (isFront || isRear) ? profile : null,
    }), bodyMat, { castShadow: true, receiveShadow: true });
    // navy window band along the sides
    const bandMat = mats.painted(col(livery.band || '#0c2f5c'), { roughness: 0.38, metalness: 0.16, clearcoat: 0.38, clearcoatRoughness: 0.32, seed: 9, side: THREE.DoubleSide });
    const accentBandMat = mats.painted(col(livery.accent || '#2b63a6'), { seed: 5, side: THREE.DoubleSide });
    const bandInset = 3.9;
    for (const s of [-1, 1]) {
      b.box(0.03, 0.92, len - bandInset * 2, bandMat, { pos: [s * (halfW + 0.01), floorY + 1.98, 0], castShadow: false });
      // accent line
      b.box(0.03, 0.05, len - bandInset * 2, accentBandMat, { pos: [s * (halfW + 0.02), floorY + 1.45, 0], castShadow: false });
      // band follows the aero taper into each cab
      if (isFront || isRear) {
        for (const dir of [-1, 1]) {
          if (dir < 0 && !isFront) continue;
          if (dir > 0 && !isRear) continue;
          b.add(aeroBandGeometry({ dir, side: s, len, halfW, y: floorY + 1.98, h: 0.92, floorY }), bandMat, { castShadow: false });
          b.add(aeroBandGeometry({ dir, side: s, len, halfW, y: floorY + 1.45, h: 0.05, floorY }), accentBandMat, { castShadow: false });
        }
      }
    }
    const doorMat = mats.painted(col(livery.door || '#e7e8e2'), { roughness: 0.35, metalness: 0.1, clearcoat: 0.6, seed: 6 });
    for (const s of [-1, 1]) {
      for (const dz of [-6.7, 6.7]) {
        addDoor(b, mats, { x: halfW - 0.02, y: floorY + 0.18, z: dz, w: 1.12, h: 2.0, side: s, livery: doorMat, glassMat: windowMat });
      }
      for (let i = 0; i < 5; i++) {
        const z = -4.9 + i * 2.45;
        addWindow(b, mats, { x: halfW - 0.012, y: floorY + 2.0, z, w: 1.5, h: 0.68, side: s, glassMat: windowMat, frameMat: mats.painted(0x0a1a2b, { seed: 2 }) });
      }
    }
    // roof
    b.box(halfW * 1.7, 0.14, len - 2.2, mats.painted(col(livery.roof || '#c8ccca'), { roughness: 0.55, metalness: 0.3, seed: 4 }), { pos: [0, topY + 0.02, 0], radius: 0.06 });
    roofGear(b, mats, { len: len - 4, y: topY + 0.1, seed: 8 });
    underframe(b, mats, { len, halfW, floorY });
    endWalls(b, mats, { len, halfW, floorY, topY, dark: 0x1d2124, skipFront: isFront, skipRear: isRear });
    for (const dz of [-1, 1]) buildBogie(b, mats, { z: dz * (len / 2 - 3.2), axles: 2, axleSpacing: 2.5, r: 0.44, frameW: 2.2 });
    if (!isFront) addEndDetail(b, mats, { z: -len / 2 + 0.02, dir: -1, width: halfW * 2 });
    if (!isRear) addEndDetail(b, mats, { z: len / 2 - 0.02, dir: 1, width: halfW * 2 });

    if (isFront || isRear) {
      const dir = isFront ? -1 : 1;
      const zCap = dir * (len / 2 + 0.015);
      const faceTop = floorY + h * 0.7;
      const wsMat = mats.painted(0x0a1117, { roughness: 0.24, metalness: 0.22, clearcoat: 1, seed: 3 });
      const navyMat = mats.painted(col(livery.band || '#0c2f5c'), { roughness: 0.3, metalness: 0.2, seed: 9 });
      const glassMat = mats.glass(0x050d12, 0.96, 0.04);
      // black cab mask on the blunt, tapered nose
      b.box(1.56, 1.02, 0.05, wsMat, { pos: [0, floorY + 1.5, zCap], radius: 0.06, castShadow: false });
      b.add(new THREE.PlaneGeometry(1.38, 0.84), glassMat, {
        pos: [0, floorY + 1.52, zCap + dir * 0.038], rot: [0, dir > 0 ? 0 : Math.PI, 0], castShadow: false,
      });
      // navy brow and visor
      b.box(1.66, 0.1, 0.16, navyMat, { pos: [0, faceTop - 0.04, zCap + dir * 0.04], castShadow: false });
      b.box(1.5, 0.06, 0.1, mats.painted(0x14191c, { seed: 3 }), { pos: [0, faceTop - 0.12, zCap + dir * 0.07], castShadow: false });
      // two headlight clusters
      b.box(1.12, 0.23, 0.1, mats.painted(0x14181b, { seed: 4 }), { pos: [0, floorY + 0.72, zCap + dir * 0.01], radius: 0.04, castShadow: false });
      const lightMat = mats.emissive(0xf5f0dc, 4.2, 0x101010);
      for (const dx of [-0.42, 0.42]) {
        b.box(0.34, 0.13, 0.04, lightMat, { pos: [dx, floorY + 0.73, zCap + dir * 0.075], castShadow: false });
      }
      // tricolour on the cab face
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.27), new THREE.MeshStandardMaterial({
        map: tex.flag(), roughness: 0.62, side: THREE.DoubleSide,
      }));
      fm.position.set(0, faceTop - 0.28, zCap + dir * 0.075);
      fm.rotation.y = dir < 0 ? Math.PI : 0;
      overlays.push(fm);
      // coupler cover peeking below the face
      b.box(0.56, 0.34, 0.42, mats.metal(0x4b4d48, 0.5, 0.7), { pos: [0, 0.92, zCap - dir * 0.12], radius: 0.05 });
    }
    const nameTex = tex.label({
      w: 1600, h: 240, text: livery.name || 'VANDE BHARAT', bg: 'transparent', color: livery.text || '#eef1f2',
      size: 104, weight: 700, letterSpacing: 4.5,
    });
    overlays.push(addTextDecal(nameTex, 4.2, 0.63, { x: halfW + 0.034, y: floorY + 1.08, z: -len * 0.12, side: 1 }));
    overlays.push(addTextDecal(nameTex, 4.2, 0.63, { x: halfW + 0.034, y: floorY + 1.08, z: -len * 0.12, side: -1 }));
    const typeTex = tex.label({
      w: 1200, h: 150, text: livery.typeLabel || '', bg: 'transparent', color: livery.text || '#cfdced',
      size: 52, weight: 500, letterSpacing: 2.5,
    });
    if (livery.typeLabel) {
      overlays.push(addTextDecal(typeTex, 3.0, 0.375, { x: halfW + 0.034, y: floorY + 0.72, z: -len * 0.12, side: 1 }));
      overlays.push(addTextDecal(typeTex, 3.0, 0.375, { x: halfW + 0.034, y: floorY + 0.72, z: -len * 0.12, side: -1 }));
    }
  } else if (type === 'emu') {
    const len = 21.8, halfW = 1.56, floorY = 1.0, h = 3.0, rTop = 0.4;
    const topY = floorY + h;
    geo.len = len; geo.halfW = halfW; geo.topY = topY; geo.floorY = floorY;
    const roofMat = mats.painted(col(livery.roof || '#9b9d9d'), { roughness: 0.66, metalness: 0.3, seed: 17 });
    b.add(sweepBody({
      length: len, width: halfW * 2, height: h, bottom: floorY,
      rBottom: 0.1, rTop, roofRise: 0.03, sections: 30, loopSegments: 22,
    }), roofMat, { castShadow: true, receiveShadow: true });
    bodySkin(b, mats, cfg, { len, halfW, bottom: floorY + 0.05, top: topY - rTop - 0.02, roofMat });
    addBand(b, mats, { len, halfW, y: floorY + 0.5, h: 0.5, color: livery.band || '#5f3a7a', inset: 0.2 });
    addBand(b, mats, { len, halfW, y: floorY + 1.15, h: 0.07, color: livery.band || '#5f3a7a', inset: 0.1 });

    const doorMat = mats.painted(col(livery.door || '#ddd9d0'), { roughness: 0.45, metalness: 0.15, seed: 5 });
    const doorZ = [-6.9, 0, 6.9];
    for (const s of [-1, 1]) {
      for (const dz of doorZ) {
        // wide sliding door pair
        for (const off of [-0.62, 0.62]) {
          addDoor(b, mats, {
            x: halfW - 0.02, y: floorY + 0.15, z: dz + off, w: 1.16, h: 2.02, side: s,
            livery: doorMat, glassMat: windowMat, steps: false,
          });
        }
      }
      for (let i = 0; i < 6; i++) {
        const z = -8.9 + i * 3.55;
        if (doorZ.some(d => Math.abs(z - d) < 2.3)) continue;
        addWindow(b, mats, { x: halfW - 0.012, y: floorY + 1.95, z, w: 1.5, h: 0.72, side: s, glassMat: windowMat });
      }
      // handrails between doors
      for (let i = 0; i < 8; i++) {
        const z = -9.4 + i * 2.7;
        b.tube([[s * (halfW + 0.03), floorY + 0.4, z], [s * (halfW + 0.03), floorY + 2.1, z]], 0.02, mats.chrome);
      }
    }
    roofGear(b, mats, { len, y: topY + 0.02, seed: 4 });
    underframe(b, mats, { len, halfW, floorY });
    endWalls(b, mats, { len, halfW, floorY, topY });
    for (const dz of [-1, 1]) buildBogie(b, mats, { z: dz * (len / 2 - 3.3), axles: 2, axleSpacing: 2.5, r: 0.45, frameW: 2.2 });
    addEndDetail(b, mats, { z: -len / 2 + 0.02, dir: -1, width: halfW * 2 });
    addEndDetail(b, mats, { z: len / 2 - 0.02, dir: 1, width: halfW * 2 });
    const nameTex = tex.label({
      w: 1420, h: 190, text: 'MUMBAI LOCAL', bg: 'transparent', color: livery.text || '#4c3264',
      size: 96, weight: 800, letterSpacing: 3,
    });
    overlays.push(addTextDecal(nameTex, 3.4, 0.46, { x: halfW + 0.034, y: floorY + 1.55, z: -len * 0.26, side: 1 }));
    overlays.push(addTextDecal(nameTex, 3.4, 0.46, { x: halfW + 0.034, y: floorY + 1.55, z: -len * 0.26, side: -1 }));
  } else if (type === 'heritage_small') {
    const len = 9.2, halfW = 1.0, floorY = 0.62, h = 1.95, rTop = 0.36;
    const topY = floorY + h;
    geo.len = len; geo.halfW = halfW; geo.topY = topY; geo.floorY = floorY;
    const roofMat = mats.painted(col(livery.roof || '#6f756f'), { roughness: 0.7, metalness: 0.2, seed: 17 });
    b.add(sweepBody({ length: len, width: halfW * 2, height: h, bottom: floorY, rBottom: 0.08, rTop, roofRise: 0.05, sections: 22, loopSegments: 20 }), roofMat, { castShadow: true, receiveShadow: true });
    bodySkin(b, mats, cfg, { len, halfW, bottom: floorY + 0.04, top: topY - rTop - 0.02, roofMat });
    addBand(b, mats, { len, halfW, y: floorY + 0.94, h: 0.09, color: livery.band || '#2c5364', inset: 0.08 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        addWindow(b, mats, { x: halfW - 0.01, y: floorY + 1.26, z: -3.1 + i * 2.05, w: 0.9, h: 0.66, side: s, glassMat: windowMat });
      }
      for (const dz of [-3.75, 3.75]) {
        addDoor(b, mats, { x: halfW - 0.02, y: floorY + 0.05, z: dz, w: 0.7, h: 1.45, side: s, glassMat: windowMat, steps: false });
      }
    }
    underframe(b, mats, { len, halfW, floorY });
    endWalls(b, mats, { len, halfW, floorY, topY });
    for (const dz of [-1, 1]) buildBogie(b, mats, { z: dz * (len / 2 - 2.0), axles: 2, axleSpacing: 1.5, r: 0.3, frameW: 1.35 });
    const nameTex = tex.label({ w: 1100, h: 200, text: 'KALKA–SHIMLA', bg: 'transparent', color: livery.text || '#2c5364', size: 92, weight: 700, letterSpacing: 2 });
    overlays.push(addTextDecal(nameTex, 2.2, 0.4, { x: halfW + 0.03, y: floorY + 0.72, z: -0.3, side: 1 }));
    overlays.push(addTextDecal(nameTex, 2.2, 0.4, { x: halfW + 0.03, y: floorY + 0.72, z: -0.3, side: -1 }));
  }

  const group = b.build(new THREE.Group(), `coach-${index}`);
  for (const o of overlays) group.add(o);
  group.userData.length = geo.len || 22;
  group.userData.topY = geo.topY || 4;
  group.userData.floorY = geo.floorY || 1;
  group.userData.halfW = geo.halfW || 1.5;
  return { group, length: geo.len || 22, halfW: geo.halfW || 1.5, windowMat, topY: geo.topY || 4 };
}
