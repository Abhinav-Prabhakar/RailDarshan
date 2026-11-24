import * as THREE from 'three';
import {
  MeshBatch, sweepBody, roundedBox, mulberry32, rr, clamp, TAU, smoothstep, makeCanvas, canvasTexture, tubeGeo,
} from '../core/util.js';
import {
  buildBogie, addWindow, addDoor, addTextDecal, addEndDetail, addBufferBeam,
  addPantograph, addLouvres, addRivetLine, wheelGeometry,
} from './parts.js';
import { makeGlowSprite } from '../world/tracks.js';
import { interiorGlowTexture } from './coaches.js';

const col = (s) => (typeof s === 'number' ? s : new THREE.Color(s).getHex());

function paint(mats, color, opts = {}) {
  return mats.painted(col(color), { roughness: 0.44, metalness: 0.07, clearcoat: 0.4, clearcoatRoughness: 0.36, seed: 9, variation: 0.85, ...opts });
}

function addGlowSprite(parent, x, y, z, color = 0xffe6b0, size = 0.9, opacity = 0.42) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowSprite(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  }));
  sprite.scale.setScalar(size);
  sprite.position.set(x, y, z);
  parent.add(sprite);
  return sprite;
}

// A cab windscreen: deep blue glass catching a band of sky and a warm low sun,
// with a soft diagonal sheen. Used as a map so the panes read even face-on.
function windscreenTexture() {
  const c = makeCanvas(256, 160);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, '#22384e');
  g.addColorStop(0.42, '#16283a');
  g.addColorStop(0.72, '#3e3a3a');
  g.addColorStop(1, '#8a5c37');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 160);
  // reflected horizon glow
  const hz = ctx.createLinearGradient(0, 88, 0, 128);
  hz.addColorStop(0, 'rgba(255,196,132,0)');
  hz.addColorStop(0.55, 'rgba(255,196,132,.35)');
  hz.addColorStop(1, 'rgba(255,160,92,0)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, 88, 256, 40);
  // diagonal sky sheen
  ctx.save();
  ctx.translate(150, 40);
  ctx.rotate(-0.42);
  const sheen = ctx.createLinearGradient(-90, 0, 90, 0);
  sheen.addColorStop(0, 'rgba(190,220,245,0)');
  sheen.addColorStop(0.48, 'rgba(208,231,250,.38)');
  sheen.addColorStop(0.62, 'rgba(232,244,255,.2)');
  sheen.addColorStop(1, 'rgba(190,220,245,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-100, -20, 200, 34);
  ctx.restore();
  // subtle vignette at the edges
  const v = ctx.createRadialGradient(128, 80, 30, 128, 80, 150);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(4,8,12,.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 256, 160);
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// A thin livery ribbon that hugs the tapered nose shell, from its base to the tip.
function noseBandGeometry({ dir, side, off, hh, noseLen, len, halfW, floorY, tipScale, topScale, lift }) {
  const segs = 12;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = dir < 0 ? t : 1 - t;
    const k = 1 - smoothstep(0, 1, u);
    const sx = 1 - (1 - tipScale) * k;
    const sy = 1 - (1 - topScale) * k;
    const z = dir * (len / 2 - t * noseLen);
    const x = side * (halfW * sx + 0.014);
    const yc = floorY + off * sy + lift * k;
    const half = (hh * sy) / 2;
    positions.push(x, yc - half, z, x, yc + half, z);
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ WAP-7 / WAP-5
export function buildWap7(tex, mats, cfg, { windowMat, variant = 'wap7' } = {}) {
  const b = new MeshBatch('wap7');
  const overlays = [];
  const len = variant === 'wap5' ? 18.2 : 19.4;
  const halfW = 1.53;
  const floorY = 1.18;
  const h = 3.02;
  const topY = floorY + h;
  const eave = topY - 0.44;
  const bodyMat = paint(mats, cfg.body || '#e8dfc9');
  const roofMat = paint(mats, cfg.roof || '#85898b', { roughness: 0.6, metalness: 0.34, variation: 1.2, seed: 14 });
  const darkMat = mats.painted(0x1c1d1b, { roughness: 0.7, metalness: 0.4, seed: 4 });
  const bandMat = paint(mats, cfg.band || '#7e1b1c', { roughness: 0.3, clearcoat: 0.85, side: THREE.DoubleSide });
  const accentMat = paint(mats, cfg.accent || '#d98a2b', { roughness: 0.3, clearcoat: 0.8, side: THREE.DoubleSide });
  const wsMap = windscreenTexture();
  const wsMat = new THREE.MeshStandardMaterial({
    map: wsMap, color: 0xffffff, roughness: 0.12, metalness: 0.5,
    envMapIntensity: 1.25, emissive: 0x5d7894, emissiveMap: wsMap, emissiveIntensity: 0.16,
  });
  const chromeMat = mats.metal(0xc8cdd0, 0.24, 0.92);

  // A tapered nose at each end: the classic WAP-7 rounded cab rather than a flat slab.
  const noseLen = 2.05;
  const bodyLen = len - noseLen * 2;
  const noseTipScale = 0.7;
  const noseTopScale = 0.84;
  const noseLift = 0.02;
  const tipH = h * noseTopScale + noseLift;
  const yOf = (off) => floorY + off * noseTopScale + noseLift;
  const bandCenters = [
    { off: 1.62, hh: 0.5, mat: bandMat },
    { off: 1.3, hh: 0.11, mat: accentMat },
    { off: 1.17, hh: 0.04, mat: bandMat },
  ];
  const noseTaper = (tipAtStart) => (t) => {
    const u = tipAtStart ? t : 1 - t;
    const k = 1 - smoothstep(0, 1, u);
    return {
      sx: 1 - (1 - noseTipScale) * k,
      sy: 1 - (1 - noseTopScale) * k,
      dy: noseLift * k,
    };
  };

  b.add(sweepBody({
    length: bodyLen, width: halfW * 2, height: h, bottom: floorY,
    rBottom: 0.14, rTop: 0.42, roofRise: 0.05, sections: 30, loopSegments: 24,
  }), roofMat, { castShadow: true, receiveShadow: true });
  for (const dir of [-1, 1]) {
    b.add(sweepBody({
      length: noseLen, width: halfW * 2, height: h, bottom: floorY,
      rBottom: 0.14, rTop: 0.42, roofRise: 0.05, sections: 16, loopSegments: 24,
      profile: noseTaper(dir < 0),
    }), bodyMat, {
      pos: [0, 0, dir * (len / 2 - noseLen / 2)], castShadow: true, receiveShadow: true,
    });
    // grey roof fairing over the cream nose
    b.box(halfW * 2 * noseTipScale - 0.06, 0.07, noseLen * 0.6, roofMat, {
      pos: [0, yOf(h) - 0.015, dir * (len / 2 - noseLen * 0.58)], castShadow: false,
    });
  }
  // cream side skins over the straight centre section
  for (const s of [-1, 1]) {
    b.add(new THREE.PlaneGeometry(bodyLen - 0.04, eave - floorY - 0.05), bodyMat, {
      pos: [s * (halfW + 0.002), (eave + floorY + 0.05) / 2, 0],
      rot: [0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
    });
  }
  // livery bands: straight centre, then wrapped around each nose
  for (const s of [-1, 1]) {
    for (const { off, hh, mat } of bandCenters) {
      b.box(0.03, hh, bodyLen - 0.05, mat, { pos: [s * (halfW + 0.013), floorY + off, 0], castShadow: false });
    }
    for (const dir of [-1, 1]) {
      for (const { off, hh, mat } of bandCenters) {
        b.add(noseBandGeometry({
          dir, side: s, off, hh, noseLen, len, halfW, floorY,
          tipScale: noseTipScale, topScale: noseTopScale, lift: noseLift,
        }), mat, { castShadow: false });
      }
    }
  }
  // cab faces
  for (const dir of [-1, 1]) {
    const z = dir * (len / 2 + 0.012);
    const capW = halfW * 2 * noseTipScale;
    // livery bands across the face
    for (const { off, hh, mat } of bandCenters) {
      b.box(capW - 0.04, hh * noseTopScale, 0.02, mat, { pos: [0, yOf(off), z + dir * 0.008], castShadow: false });
    }
    // dark windscreen surround, two clear panes, chrome trim
    const wsY = yOf(2.46);
    const flip = dir > 0 ? 0 : Math.PI;
    b.box(capW - 0.08, 0.8, 0.05, mats.painted(0x101413, { roughness: 0.32, metalness: 0.3, seed: 3 }), {
      pos: [0, wsY, z + dir * 0.018], radius: 0.07, castShadow: false,
    });
    for (const s of [-1, 1]) {
      b.add(new THREE.PlaneGeometry(0.82, 0.58), wsMat, {
        pos: [s * 0.44, wsY + 0.015, z + dir * 0.057], rot: [0, flip, 0], castShadow: false,
      });
      // chrome outer edge of each pane
      b.box(0.022, 0.62, 0.026, chromeMat, {
        pos: [s * (0.44 + 0.42), wsY + 0.015, z + dir * 0.062], castShadow: false,
      });
      b.box(0.84, 0.022, 0.026, chromeMat, {
        pos: [s * 0.44, wsY + 0.31, z + dir * 0.062], castShadow: false,
      });
      // wiper resting across the lower glass
      b.box(0.018, 0.34, 0.02, mats.blackMetal, {
        pos: [s * 0.44 - 0.18, wsY - 0.08, z + dir * 0.078], rot: [0, 0, 0.5], castShadow: false,
      });
    }
    // centre pillar between the panes
    b.box(0.09, 0.66, 0.035, mats.painted(0x0d1110, { roughness: 0.3, metalness: 0.35, seed: 4 }), {
      pos: [0, wsY + 0.01, z + dir * 0.062], castShadow: false,
    });
    // visor / brow, projecting forward over the glass
    b.box(capW - 0.02, 0.11, 0.24, darkMat, {
      pos: [0, wsY + 0.47, z + dir * 0.1], radius: 0.03, rot: [dir * -0.12, 0, 0], castShadow: false,
    });

    // twin headlights in their own housing below the livery band
    const beamY = yOf(0.98);
    b.box(1.3, 0.35, 0.15, darkMat, {
      pos: [0, beamY, z + dir * 0.04], radius: 0.055, castShadow: false,
    });
    for (const s of [-1, 1]) {
      b.cyl(0.128, 0.128, 0.05, chromeMat, {
        pos: [s * 0.3, beamY, z + dir * 0.115], rot: [Math.PI / 2, 0, 0], seg: 20, castShadow: false,
      });
      b.cyl(0.102, 0.102, 0.035, mats.emissive(0xfff2ce, 3.1, 0x201d17), {
        pos: [s * 0.3, beamY, z + dir * 0.145], rot: [Math.PI / 2, 0, 0], seg: 18, castShadow: false,
      });
      // round marker lamp at the outer corner
      b.cyl(0.07, 0.07, 0.04, mats.emissive(0xff6a3c, 2.6, 0x1a0806), {
        pos: [s * 0.72, beamY, z + dir * 0.105], rot: [Math.PI / 2, 0, 0], seg: 14, castShadow: false,
      });
    }
    // loco number and class lettering on the band
    const plate = tex.label({
      w: 560, h: 180, text: cfg.number || '30271', bg: 'transparent',
      color: '#f0e6cf', size: 104, weight: 700, letterSpacing: 2,
    });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.135), new THREE.MeshStandardMaterial({
      map: plate, transparent: true, roughness: 0.55, depthWrite: false, side: THREE.DoubleSide,
    }));
    pm.position.set(0.72, yOf(1.62), z + dir * 0.045);
    pm.rotation.y = dir > 0 ? 0 : Math.PI;
    overlays.push(pm);
    const cls = tex.label({ w: 420, h: 160, text: 'WAP-7', bg: 'transparent', color: '#f0e6cf', size: 92, weight: 700, letterSpacing: 1.5 });
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.14), new THREE.MeshStandardMaterial({
      map: cls, transparent: true, roughness: 0.55, depthWrite: false, side: THREE.DoubleSide,
    }));
    cm.position.set(-0.72, yOf(1.62), z + dir * 0.045);
    cm.rotation.y = dir > 0 ? 0 : Math.PI;
    overlays.push(cm);
    // tricolour on a short staff at the leading cab only
    if (dir < 0) {
      b.cyl(0.018, 0.018, 0.5, mats.chrome, { pos: [-0.42, yOf(h) + 0.22, z + 0.06], seg: 6, castShadow: false });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshStandardMaterial({
        map: tex.flag(), roughness: 0.7, side: THREE.DoubleSide,
      }));
      flag.position.set(-0.24, yOf(h) + 0.32, z + 0.09);
      flag.rotation.y = Math.PI;
      overlays.push(flag);
    }
    // buffer beam + coupler
    const beam = addBufferBeam(b, mats, { z: z + dir * 0.12, dir, width: halfW * 2 - 0.06 });
    if (beam) overlays.push(beam);
  }

  // machine room windows + louvres
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -4.6 + i * 2.3;
      addWindow(b, mats, { x: halfW - 0.015, y: floorY + 2.34, z, w: 0.78, h: 0.52, side: s, glassMat: windowMat });
    }
    for (const [z, w] of [[-3.2, 2.0], [0.2, 2.2], [3.4, 1.9]]) {
      addLouvres(b, mats, { x: halfW - 0.03, y: floorY + 1.06, z, w, h: 0.78, side: s, count: 9 });
    }
    // cab doors
    for (const dz of [-len / 2 + 1.85, len / 2 - 1.85]) {
      addDoor(b, mats, {
        x: halfW - 0.02, y: floorY + 0.04, z: dz, w: 0.85, h: 1.95, side: s, livery: bodyMat, glassMat: windowMat, steps: true,
      });
    }
    // cab side windows
    for (const dz of [-len / 2 + 1.95, len / 2 - 1.95]) {
      addWindow(b, mats, { x: halfW - 0.015, y: floorY + 2.25, z: dz, w: 0.8, h: 0.56, side: s, glassMat: windowMat });
    }
    // handrails along the body
    for (const dz of [-len / 2 + 2.6, len / 2 - 2.6]) {
      b.tube([[s * (halfW + 0.04), floorY + 2.2, dz], [s * (halfW + 0.04), floorY + 3.2, dz]], 0.02, mats.chrome);
    }
    // side number
    const numTex = tex.label({
      w: 640, h: 200, text: cfg.number || '30271', sub: cfg.name || 'WAP-7', bg: 'transparent',
      color: '#2b2720', size: 100, subSize: 44, weight: 700, letterSpacing: 2,
    });
    overlays.push(addTextDecal(numTex, 1.1, 0.34, { x: halfW + 0.016, y: floorY + 2.72, z: -len * 0.27, side: s }));
    // "INDIAN RAILWAYS" small
    const ir = tex.label({
      w: 1100, h: 140, text: 'INDIAN RAILWAYS', bg: 'transparent', color: '#3a3227', size: 58, weight: 700, letterSpacing: 3.6,
    });
    overlays.push(addTextDecal(ir, 2.4, 0.3, { x: halfW + 0.016, y: floorY + 0.86, z: 0.0, side: s }));
  }

  // roof equipment
  const roofY = topY + 0.02;
  for (let i = 0; i < 3; i++) {
    const z = -5.4 + i * 4.1;
    b.box(2.3, 0.16, 2.5, roofMat, { pos: [0, roofY + 0.06, z], radius: 0.04 });
    b.box(1.9, 0.1, 2.1, mats.painted(0x6c6f6b, { seed: 4 }), { pos: [0, roofY + 0.17, z], radius: 0.03 });
  }
  // insulators + busbar
  for (const s of [-1, 1]) {
    for (const dz of [-2.2, 2.2]) {
      for (let k = 0; k < 3; k++) b.cyl(0.1, 0.1, 0.07, mats.painted(0x7c4b33, { roughness: 0.5, seed: 3 }), { pos: [s * 0.9, roofY + 0.12 + k * 0.1, dz], seg: 10 });
    }
  }
  // pantograph
  const panto = addPantograph(b, mats, { x: 0, y: roofY + 0.22, z: 2.6, raised: true, height: 1.25 });
  b.cyl(0.06, 0.06, 0.9, mats.metal(0x5c5e58, 0.4, 0.8), { pos: [0, roofY + 0.9, 1.2], seg: 8 });
  // horn
  for (const s of [-1, 1]) {
    b.cyl(0.05, 0.09, 0.22, mats.brass, { pos: [s * 0.45, roofY + 0.2, -len / 2 + 1.5], rot: [1.2, 0, s * 0.2], seg: 10 });
  }
  // roof rail
  for (const s of [-1, 1]) b.box(0.05, 0.05, len - 1.2, mats.metal(0x5c5e58, 0.5, 0.7), { pos: [s * 1.35, roofY + 0.09, 0], castShadow: false });

  // underframe
  b.box(halfW * 2 - 0.1, 0.3, len - 1.2, darkMat, { pos: [0, floorY - 0.12, 0], radius: 0.03 });
  // fuel tank between bogies
  b.box(2.3, 0.72, 4.6, mats.painted(0x2c2e2a, { roughness: 0.72, metalness: 0.5, seed: 3 }), { pos: [0, 0.82, 0.2], radius: 0.08 });
  b.box(2.34, 0.1, 4.64, mats.painted(0x1c1d1b, { seed: 3 }), { pos: [0, 1.16, 0.2] });
  // sandboxes, control boxes
  for (const dz of [-2.2, 2.8]) {
    b.box(1.0, 0.5, 1.4, darkMat, { pos: [0, 0.86, dz], radius: 0.04 });
  }

  // bogies
  for (const dz of [-1, 1]) {
    buildBogie(b, mats, {
      z: dz * (len / 2 - 4.3), axles: 3, axleSpacing: 1.9, r: 0.55, frameW: 2.28, loco: true,
    });
  }

  const group = b.build(new THREE.Group(), 'wap7');
  for (const o of overlays) group.add(o);

  // headlight glows
  for (const dir of [-1, 1]) {
    const z = dir * (len / 2 + 0.3);
    addGlowSprite(group, 0, floorY + 1.66, z, 0xffe9bb, 0.62, 0.24);
    for (const s of [-1, 1]) addGlowSprite(group, s * 0.98, floorY + 1.68, z, 0xff6a44, 0.2, 0.22);
  }
  return {
    group, len, halfW, pantograph: panto, windowMat, kind: variant,
    headlights: [[0, floorY + 1.66, -len / 2 - 0.1]],
  };
}

// ------------------------------------------------------------------ WDM-3A diesel
export function buildWdm3a(tex, mats, cfg, { windowMat } = {}) {
  const b = new MeshBatch('wdm3a');
  const overlays = [];
  const len = 17.6, halfW = 1.55, floorY = 1.14, h = 3.02;
  const topY = floorY + h;
  const eave = topY - 0.38;
  const bodyMat = paint(mats, cfg.body || '#b34329', { roughness: 0.34 });
  const roofMat = paint(mats, cfg.roof || '#b9b3a5', { roughness: 0.72, metalness: 0.2, seed: 16 });
  const bandMat = paint(mats, cfg.band || '#e3c06a', { roughness: 0.32, clearcoat: 0.8 });
  const creamMat = paint(mats, cfg.accent || '#f3e6c4', { roughness: 0.34 });
  const darkMat = mats.painted(0x1b1c1a, { roughness: 0.7, metalness: 0.42, seed: 4 });

  b.add(sweepBody({
    length: len, width: halfW * 2, height: h, bottom: floorY,
    rBottom: 0.16, rTop: 0.46, roofRise: 0.04, sections: 30, loopSegments: 22,
  }), roofMat, { castShadow: true, receiveShadow: true });
  for (const s of [-1, 1]) {
    b.add(new THREE.PlaneGeometry(len - 0.3, eave - floorY - 0.05), bodyMat, {
      pos: [s * (halfW + 0.002), (eave + floorY + 0.05) / 2, 0],
      rot: [0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
    });
    // broad cream belly panel
    b.box(0.03, 0.62, len - 0.4, creamMat, { pos: [s * (halfW + 0.012), floorY + 0.4, 0], castShadow: false });
    b.box(0.03, 0.16, len - 0.4, bandMat, { pos: [s * (halfW + 0.012), floorY + 0.78, 0], castShadow: false });
    b.box(0.03, 0.08, len - 0.4, bandMat, { pos: [s * (halfW + 0.012), floorY + 1.85, 0], castShadow: false });
  }

  // rounded nose at both ends
  for (const dir of [-1, 1]) {
    const z = dir * (len / 2 + 0.06);
    b.box(halfW * 1.8, 2.3, 0.5, bodyMat, { pos: [0, floorY + 1.25, z], radius: 0.2, castShadow: false });
    b.box(halfW * 1.82, 0.5, 0.1, creamMat, { pos: [0, floorY + 0.42, z - dir * -0.25], castShadow: false });
    b.box(halfW * 1.82, 0.16, 0.1, bandMat, { pos: [0, floorY + 0.76, z - dir * -0.25], castShadow: false });
    // single wide windscreen with a central split
    b.box(2.35, 0.8, 0.08, mats.painted(0x121a1c, { roughness: 0.16, metalness: 0.2, clearcoat: 1, seed: 3 }), { pos: [0, floorY + 2.2, z + dir * 0.06], castShadow: false });
    b.box(0.06, 0.8, 0.1, darkMat, { pos: [0, floorY + 2.2, z + dir * 0.1], castShadow: false });
    for (const s of [-1, 1]) {
      b.box(0.06, 0.82, 0.12, darkMat, { pos: [s * 1.17, floorY + 2.2, z + dir * 0.09], castShadow: false });
      // wiper
      b.box(0.03, 0.5, 0.03, darkMat, { pos: [s * 0.45, floorY + 2.08, z + dir * 0.17], rot: [0, 0, s * 0.5], castShadow: false });
    }
    // headlights
    for (const s of [-1, 1]) {
      b.cyl(0.14, 0.14, 0.08, mats.emissive(0xfff0cc, 5, 0x1a1a18), { pos: [s * 0.82, floorY + 1.56, z + dir * 0.14], rot: [Math.PI / 2, 0, 0], seg: 14, castShadow: false });
    }
    // number plate
    const plate = tex.label({
      w: 660, h: 200, text: cfg.number || '16360', sub: cfg.shed || 'BWN', bg: 'transparent',
      color: '#f2e8d2', size: 104, subSize: 40, weight: 700, letterSpacing: 2,
    });
    const pm = addTextDecal(plate, 0.9, 0.28, { x: 0, y: floorY + 1.32, z: z + dir * 0.14, side: 1 });
    pm.rotation.y = dir < 0 ? Math.PI : 0;
    pm.position.set(0.62, floorY + 1.32, z + dir * 0.15);
    overlays.push(pm);
    addBufferBeam(b, mats, { z: z + dir * 0.2, dir, width: halfW * 1.9 });
  }

  for (const s of [-1, 1]) {
    addWindow(b, mats, { x: halfW - 0.015, y: floorY + 2.18, z: -len / 2 + 1.7, w: 0.85, h: 0.58, side: s, glassMat: windowMat });
    addWindow(b, mats, { x: halfW - 0.015, y: floorY + 2.18, z: len / 2 - 1.7, w: 0.85, h: 0.58, side: s, glassMat: windowMat });
    // radiator grilles at the rear
    addLouvres(b, mats, { x: halfW - 0.03, y: floorY + 1.55, z: -len / 2 + 4.0, w: 1.5, h: 1.5, side: s, count: 14 });
    addLouvres(b, mats, { x: halfW - 0.03, y: floorY + 1.55, z: len / 2 - 4.0, w: 1.5, h: 1.5, side: s, count: 14 });
    // cab doors
    addDoor(b, mats, { x: halfW - 0.02, y: floorY + 0.02, z: -len / 2 + 2.2, w: 0.82, h: 1.9, side: s, livery: bodyMat, glassMat: windowMat });
    addDoor(b, mats, { x: halfW - 0.02, y: floorY + 0.02, z: len / 2 - 2.2, w: 0.82, h: 1.9, side: s, livery: bodyMat, glassMat: windowMat });
    const numTex = tex.label({
      w: 640, h: 190, text: cfg.number || '16360', sub: 'WDM-3A', bg: 'transparent',
      color: '#f3e7cc', size: 98, subSize: 40, weight: 700, letterSpacing: 2,
    });
    overlays.push(addTextDecal(numTex, 1.2, 0.36, { x: halfW + 0.014, y: floorY + 1.22, z: -len * 0.12, side: s }));
    const nameTex = tex.label({ w: 1200, h: 160, text: 'INDIAN RAILWAYS', bg: 'transparent', color: '#f3e6c4', size: 62, weight: 700, letterSpacing: 3 });
    overlays.push(addTextDecal(nameTex, 2.4, 0.32, { x: halfW + 0.014, y: floorY + 2.72, z: 0, side: s }));
  }

  // roof: exhaust stack, cooling fan, horn
  const roofY = topY + 0.01;
  b.box(1.2, 0.55, 1.4, mats.painted(0x2a2c28, { roughness: 0.8, metalness: 0.35, seed: 3 }), { pos: [0, roofY + 0.24, -2.2], radius: 0.06 });
  b.cyl(0.32, 0.32, 0.22, mats.painted(0x1a1b19, { seed: 3 }), { pos: [0, roofY + 0.56, -2.2], seg: 14 });
  for (let i = 0; i < 3; i++) {
    b.cyl(0.5, 0.5, 0.08, mats.metal(0x6a6c66, 0.5, 0.6), { pos: [0, roofY + 0.12, 2.2 + i * 1.2], seg: 16 });
    b.box(1.0, 0.05, 0.08, mats.metal(0x4a4c47, 0.5, 0.6), { pos: [0, roofY + 0.2, 2.2 + i * 1.2] });
  }
  b.box(1.8, 0.16, 3.6, roofMat, { pos: [0, roofY + 0.06, 4.4], radius: 0.04 });
  for (const s of [-1, 1]) b.cyl(0.05, 0.08, 0.24, mats.brass, { pos: [s * 0.4, roofY + 0.2, -len / 2 + 1.6], rot: [1.2, 0, 0], seg: 10 });

  b.box(halfW * 2 - 0.1, 0.3, len - 1.2, darkMat, { pos: [0, floorY - 0.12, 0], radius: 0.03 });
  b.box(2.4, 0.75, 4.2, mats.painted(0x333530, { roughness: 0.72, metalness: 0.45, seed: 3 }), { pos: [0, 0.82, 0], radius: 0.09 });
  for (const dz of [-2.6, 2.6]) b.box(1.1, 0.55, 1.5, darkMat, { pos: [0, 0.92, dz], radius: 0.05 });
  for (const dz of [-1, 1]) {
    buildBogie(b, mats, { z: dz * (len / 2 - 3.9), axles: 3, axleSpacing: 1.85, r: 0.54, frameW: 2.3, loco: true });
  }

  const group = b.build(new THREE.Group(), 'wdm3a');
  for (const o of overlays) group.add(o);
  for (const dir of [-1, 1]) {
    for (const s of [-1, 1]) addGlowSprite(group, s * 0.82, floorY + 1.56, dir * (len / 2 + 0.2), 0xffeec2, 0.55, 0.32);
  }
  return { group, len, halfW, windowMat, kind: 'wdm3a' };
}

// ------------------------------------------------------------------ steam
function spokedWheelGeometry(radius = 0.9, width = 0.17, spokes = 16) {
  const parts = [];
  const rim = new THREE.TorusGeometry(radius * 0.92, radius * 0.075, 8, 40);
  rim.rotateY(Math.PI / 2);
  parts.push(rim);
  const inner = new THREE.TorusGeometry(radius * 0.84, radius * 0.022, 5, 34);
  inner.rotateY(Math.PI / 2);
  parts.push(inner);
  const hub = new THREE.CylinderGeometry(radius * 0.12, radius * 0.14, width * 1.4, 12);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    const g = new THREE.BoxGeometry(width * 0.55, radius * 0.8, radius * 0.05);
    g.translate(0, radius * 0.44, 0);
    g.rotateX(a);
    parts.push(g);
  }
  // counterweight
  const cw = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width * 0.8, 18, 1, false, 0, Math.PI * 0.7);
  cw.rotateZ(Math.PI / 2);
  cw.rotateX(Math.PI * 0.2);
  cw.translate(0, -radius * 0.22, 0);
  parts.push(cw);
  let merged = null;
  try { merged = mergeGeos(parts); } catch (e) { merged = parts[0]; }
  return merged;
}

function mergeGeos(parts) {
  // local import to avoid a hard dependency at module eval time
  return mergeGeometriesLocal(parts);
}

let _mergeFn = null;
function mergeGeometriesLocal(parts) {
  if (!_mergeFn) {
    // BufferGeometryUtils is imported lazily through a dynamic import is async; instead duplicate tiny merge:
    _mergeFn = (geos) => {
      const nonIndexed = geos.map(g => (g.index ? g.toNonIndexed() : g));
      const attrs = Object.keys(nonIndexed[0].attributes);
      const out = new THREE.BufferGeometry();
      for (const name of attrs) {
        const itemSize = nonIndexed[0].attributes[name].itemSize;
        let total = 0;
        for (const g of nonIndexed) total += g.attributes[name].count * itemSize;
        const arr = new Float32Array(total);
        let off = 0;
        for (const g of nonIndexed) {
          const a = g.attributes[name];
          arr.set(a.array, off);
          off += a.array.length;
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
      }
      return out;
    };
  }
  return _mergeFn(parts);
}

export function buildSteam(tex, mats, cfg, { narrow = false, windowMat } = {}) {
  const b = new MeshBatch('steam');
  const overlays = [];
  const s = narrow ? 0.66 : 1;
  const len = 12.2;
  const halfW = 0.72;
  const dark = mats.painted(0x111211, { roughness: 0.46, metalness: 0.55, seed: 5, clearcoat: 0.7 });
  const black = mats.painted(0x181918, { roughness: 0.4, metalness: 0.6, seed: 3, clearcoat: 0.8 });
  const red = paint(mats, cfg.band || '#7c1f1b', { roughness: 0.32, clearcoat: 0.85 });
  const brass = mats.brass;
  const wheelMat = mats.painted(0x2a2420, { roughness: 0.5, metalness: 0.55, seed: 3 });
  const steel = mats.metal(0x5f605a, 0.36, 0.85);
  const frame = mats.painted(0x232423, { roughness: 0.55, metalness: 0.5, seed: 2 });

  const bodyY = 2.32, boilerR = 0.8;
  // frames
  for (const sx of [-1, 1]) {
    b.box(0.09, 0.72, 9.4, frame, { pos: [sx * 0.66, 1.5, -1.0], radius: 0.02 });
  }
  // boiler + smokebox
  b.add(new THREE.CylinderGeometry(boilerR, boilerR, 7.2, 30), black, { pos: [0, bodyY, -0.6], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) {
    b.cyl(boilerR + 0.02, boilerR + 0.02, 0.055, brass, { pos: [0, bodyY, -3.6 + i * 1.9], rot: [Math.PI / 2, 0, 0], seg: 30 });
  }
  b.add(new THREE.CylinderGeometry(0.86, 0.8, 1.7, 30), black, { pos: [0, bodyY, -5.05], rot: [Math.PI / 2, 0, 0] });
  // smokebox door
  b.cyl(0.78, 0.82, 0.12, mats.painted(0x2b2b28, { roughness: 0.5, metalness: 0.4, seed: 2 }), { pos: [0, bodyY, -5.94], rot: [Math.PI / 2, 0, 0], seg: 30 });
  b.cyl(0.12, 0.12, 0.08, brass, { pos: [0, bodyY, -6.01], rot: [Math.PI / 2, 0, 0], seg: 14 });
  for (const a of [0.5, 2.2, 4.6]) {
    b.box(0.05, 0.05, 0.06, brass, { pos: [Math.cos(a) * 0.6, bodyY + Math.sin(a) * 0.6, -6.0] });
  }
  // funnel
  b.cyl(0.32, 0.44, 0.75, black, { pos: [0, bodyY + 0.9, -4.7], seg: 20 });
  b.cyl(0.38, 0.36, 0.13, brass, { pos: [0, bodyY + 1.32, -4.7], seg: 20 });
  b.cyl(0.3, 0.3, 0.1, mats.painted(0x0b0b0a, { seed: 2 }), { pos: [0, bodyY + 1.4, -4.7], seg: 18 });
  // steam dome & safety valve
  b.cyl(0.34, 0.46, 0.45, black, { pos: [0, bodyY + 0.84, -1.2], seg: 20 });
  b.cyl(0.38, 0.38, 0.1, brass, { pos: [0, bodyY + 1.09, -1.2], seg: 20 });
  b.cyl(0.13, 0.16, 0.32, brass, { pos: [0, bodyY + 0.88, 1.4], seg: 12 });
  for (const dz of [-0.1, 0.1]) b.cyl(0.11, 0.11, 0.06, brass, { pos: [0, bodyY + 1.08, 1.4 + dz], seg: 10 });
  // handrails
  for (const sx of [-1, 1]) {
    b.tube([[sx * (boilerR + 0.06), bodyY + 0.3, -5.7], [sx * (boilerR + 0.06), bodyY + 0.3, 2.3]], 0.018, brass);
  }
  // running boards
  for (const sx of [-1, 1]) {
    b.box(0.42, 0.06, 8.4, black, { pos: [sx * 1.06, 1.86, -1.1], radius: 0.02 });
    b.box(0.03, 0.3, 8.4, frame, { pos: [sx * 1.26, 1.72, -1.1], castShadow: false });
  }
  // cylinders + slide bars
  for (const sx of [-1, 1]) {
    b.cyl(0.3, 0.3, 0.85, black, { pos: [sx * 1.17, 1.24, -4.15], rot: [Math.PI / 2, 0, 0], seg: 18 });
    b.cyl(0.32, 0.32, 0.08, brass, { pos: [sx * 1.17, 1.24, -4.58], rot: [Math.PI / 2, 0, 0], seg: 18 });
    b.box(0.1, 0.1, 2.0, steel, { pos: [sx * 1.17, 1.24, -2.8] });
    b.cyl(0.045, 0.045, 1.9, mats.chrome, { pos: [sx * 1.17, 1.24, -1.9], rot: [Math.PI / 2, 0, 0], seg: 10 });
  }
  // driving wheels (3 each side) + pony truck
  const drivers = [-2.6, 0.0, 2.6];
  const wheelGeo = spokedWheelGeometry(0.92, 0.17, 16);
  for (const sx of [-1, 1]) {
    for (const dz of drivers) {
      b.add(wheelGeo, wheelMat, { pos: [sx * 0.86, 0.92, dz], castShadow: true });
      b.cyl(0.2, 0.2, 0.2, brass, { pos: [sx * 0.86, 0.92, dz], rot: [0, 0, Math.PI / 2], seg: 14 });
    }
    // coupling rods
    b.box(0.07, 0.11, 5.4, steel, { pos: [sx * 1.02, 0.6, 0] });
    b.box(0.09, 0.09, 0.14, brass, { pos: [sx * 1.02, 0.6, -2.6] });
    b.box(0.09, 0.09, 0.14, brass, { pos: [sx * 1.02, 0.6, 0] });
    b.box(0.09, 0.09, 0.14, brass, { pos: [sx * 1.02, 0.6, 2.6] });
    // leading and trailing wheels
    for (const [dz, r] of [[-4.4, 0.42], [4.3, 0.46]]) {
      b.add(wheelGeometry(r, 0.14), wheelMat, { pos: [sx * 0.86, r, dz], castShadow: true });
    }
    // cylinder exhaust pipe
    b.tube([[sx * 1.2, 1.55, -3.9], [sx * 1.34, 2.3, -4.1], [sx * 1.15, 2.9, -4.4]], 0.07, black, { tubularSegments: 8 });
    // steps
    b.box(0.3, 0.05, 0.5, steel, { pos: [sx * 1.15, 0.6, 3.5] });
  }
  // pony truck frames
  b.box(1.9, 0.16, 1.8, frame, { pos: [0, 1.05, -4.4] });
  b.box(1.9, 0.16, 1.8, frame, { pos: [0, 1.05, 4.3] });

  // cab
  const cabZ = 3.55;
  b.box(2.5, 1.9, 2.6, black, { pos: [0, 1.94, cabZ], radius: 0.05 });
  b.box(2.7, 0.14, 2.9, black, { pos: [0, 2.93, cabZ], radius: 0.04 });
  b.box(2.6, 0.1, 2.8, brass, { pos: [0, 2.86, cabZ] });
  for (const sx of [-1, 1]) {
    // side window opening
    b.box(0.03, 0.66, 0.9, mats.painted(0x070a0a, { seed: 3 }), { pos: [sx * 1.255, 2.34, cabZ - 0.3], castShadow: false });
    b.box(0.04, 0.72, 0.1, brass, { pos: [sx * 1.27, 2.34, cabZ - 0.78], castShadow: false });
    b.box(0.04, 0.72, 0.1, brass, { pos: [sx * 1.27, 2.34, cabZ + 0.18], castShadow: false });
    b.box(0.04, 0.08, 0.98, brass, { pos: [sx * 1.27, 2.7, cabZ - 0.3], castShadow: false });
    b.box(0.04, 0.08, 0.98, brass, { pos: [sx * 1.27, 2.0, cabZ - 0.3], castShadow: false });
    // door line
    b.box(0.02, 1.8, 0.03, brass, { pos: [sx * 1.26, 1.9, cabZ + 1.2], castShadow: false });
    // rear sandbox
    b.box(0.3, 0.6, 0.5, frame, { pos: [sx * 1.18, 1.3, cabZ + 1.3] });
  }
  // rear cab window
  b.box(1.4, 0.55, 0.04, mats.painted(0x080b0c, { seed: 3 }), { pos: [0, 2.34, cabZ + 1.31], castShadow: false });
  // front spectacle plates / cab windows
  for (const sx of [-1, 1]) {
    b.cyl(0.22, 0.22, 0.03, mats.emissive(0xffc37a, 0.2, 0x14100b), { pos: [sx * 0.5, 2.32, cabZ - 1.31], rot: [Math.PI / 2, 0, 0], seg: 16 });
    b.cyl(0.25, 0.25, 0.03, brass, { pos: [sx * 0.5, 2.32, cabZ - 1.33], rot: [Math.PI / 2, 0, 0], seg: 16, open: true });
  }
  // number plates + name
  const plate = tex.label({
    w: 700, h: 200, text: cfg.number || '7200', sub: 'WP', bg: '#111110', color: '#e8d9b6',
    size: 100, subSize: 40, weight: 700, letterSpacing: 3,
  });
  for (const sx of [-1, 1]) {
    const m = addTextDecal(plate, 0.9, 0.26, { x: 1.34, y: 2.0, z: cabZ - 0.9, side: sx });
    overlays.push(m);
  }
  // front number plate
  const front = tex.label({
    w: 620, h: 160, text: cfg.number || '7200', bg: 'transparent', color: '#f0e2c2', size: 92, weight: 700, letterSpacing: 2,
  });
  const fm = addTextDecal(front, 0.62, 0.16, { x: 0, y: bodyY + 0.48, z: -5.95, side: 1 });
  fm.rotation.y = Math.PI * 0.0;
  fm.position.set(0, bodyY + 0.5, -6.03);
  overlays.push(fm);

  // headlamp
  b.cyl(0.17, 0.2, 0.3, black, { pos: [0, 2.94, -5.9], rot: [Math.PI / 2, 0, 0], seg: 14 });
  b.cyl(0.14, 0.14, 0.05, mats.emissive(0xffd79a, 6, 0x1a140c), { pos: [0, 2.94, -6.06], rot: [Math.PI / 2, 0, 0], seg: 14, castShadow: false });
  // buffer beam
  b.box(2.1, 0.32, 0.24, black, { pos: [0, 1.18, -6.08] });
  for (const sx of [-1, 1]) {
    b.cyl(0.2, 0.16, 0.36, steel, { pos: [sx * 0.7, 1.05, -6.24], rot: [Math.PI / 2, 0, 0], seg: 16 });
    b.cyl(0.22, 0.22, 0.07, mats.painted(0x2b2c29, { seed: 3 }), { pos: [sx * 0.7, 1.05, -6.4], rot: [Math.PI / 2, 0, 0], seg: 16 });
  }
  b.box(0.26, 0.28, 0.6, steel, { pos: [0, 1.03, -6.3] });
  b.cyl(0.13, 0.1, 0.16, steel, { pos: [0, 1.0, -6.62], rot: [Math.PI / 2, 0, 0], seg: 12 });
  // coupling hoses
  for (const sx of [-1, 1]) b.tube([[sx * 0.3, 1.3, -6.1], [sx * 0.42, 0.9, -6.3], [sx * 0.3, 0.8, -6.45]], 0.03, mats.rubber, { tubularSegments: 5 });

  // tender
  const tZ = cabZ + 1.3 + 3.4;
  b.box(2.55, 1.9, 6.5, black, { pos: [0, 1.95, tZ], radius: 0.05 });
  b.box(2.6, 0.12, 6.6, brass, { pos: [0, 2.86, tZ] });
  b.box(2.3, 0.55, 5.9, mats.painted(cfg.band || 0x7c1f1b, { roughness: 0.36, clearcoat: 0.7, seed: 4 }), { pos: [0, 1.55, tZ], radius: 0.04 });
  for (const sx of [-1, 1]) {
    b.box(0.03, 0.06, 6.2, brass, { pos: [sx * 1.28, 2.02, tZ], castShadow: false });
    b.box(0.03, 0.06, 6.2, brass, { pos: [sx * 1.28, 1.15, tZ], castShadow: false });
    for (const dz of [-1.8, 1.8]) b.box(0.04, 0.9, 0.08, brass, { pos: [sx * 1.29, 1.6, tZ + dz], castShadow: false });
  }
  // coal
  for (let i = 0; i < 16; i++) {
    const rng = mulberry32(100 + i);
    b.box(rr(rng, 0.4, 0.9), rr(rng, 0.15, 0.35), rr(rng, 0.4, 0.9), mats.painted(0x0d0d0c, { roughness: 0.9, seed: i }), {
      pos: [rr(rng, -0.8, 0.8), 2.92 + rr(rng, 0, 0.3), tZ - 2.2 + rr(rng, 0, 3.0)], rot: [rr(rng, -0.4, 0.4), rr(rng, 0, 3), 0], radius: 0.02,
    });
  }
  // tender bogies
  for (const dz of [-2.1, 2.1]) {
    buildBogie(b, mats, { z: tZ + dz, axles: 2, axleSpacing: 1.9, r: 0.44, frameW: 1.9 });
  }
  // ladder at rear of tender
  for (const sx of [-1, 1]) {
    b.cyl(0.02, 0.02, 1.6, steel, { pos: [sx * 0.9, 1.7, tZ + 3.26], seg: 6 });
  }
  for (let i = 0; i < 4; i++) b.box(1.8, 0.03, 0.05, steel, { pos: [0, 1.1 + i * 0.4, tZ + 3.26], castShadow: false });

  // scale for narrow gauge and recenter
  const group = b.build(new THREE.Group(), 'steam');
  for (const o of overlays) group.add(o);
  group.scale.setScalar(s * (narrow ? 1.0 : 1.0));
  addGlowSprite(group, 0, 2.94, -6.12, 0xffdba5, 1.2, 0.42);
  return {
    group, len: len, halfW, windowMat, kind: 'steam',
    tenderZ: tZ,
    smoke: [0, bodyY + 1.55, -4.7],
    totalLen: tZ + 3.4,
    gauge: narrow ? 0.762 : 1.676,
    wheelRadius: 0.92,
    narrow,
  };
}
