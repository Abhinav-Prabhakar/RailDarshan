import * as THREE from 'three';
import { MeshBatch, cylinderGeo, roundedBox, tubeGeo } from '../core/util.js';

export const TRACK = {
  gauge: 1.676,
  ballastTop: 0,
  railTop: 0.2,
  sleeperTop: 0.07,
};

export function buildBallastBed(batch, mats, { x = 0, z0 = -180, z1 = 180, width = 4.3, y = -0.02, track = null }) {
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  const ballast = track === 'narrow'
    ? mats.photo('ballast', { repeat: [1.4, 70], color: 0xb0a392 })
    : mats.ballast([2, 52]);
  const top = new THREE.PlaneGeometry(width, len);
  batch.add(top, ballast, { pos: [x, y + 0.04, cz], rot: [-Math.PI / 2, 0, 0], castShadow: false });
  // sloped shoulders
  const sideW = 0.8;
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(sideW, len);
    batch.add(geo, ballast, {
      pos: [x + s * (width / 2 + sideW / 2), y - 0.08, cz],
      rot: [-Math.PI / 2, 0, s * 0.30],
      castShadow: false,
    });
  }
  // dark shadow under sleepers
  const dirt = new THREE.PlaneGeometry(width - 0.7, len);
  batch.add(dirt, mats.photo('concrete', { repeat: [4, 80], color: 0x403b34 }), {
    pos: [x, y + 0.045, cz], rot: [-Math.PI / 2, 0, 0], castShadow: false,
  });
}

export function buildSleepers(scene, mats, { x = 0, z0 = -180, z1 = 180, spacing = 0.62, narrow = false }) {
  const count = Math.floor((z1 - z0) / spacing);
  const w = narrow ? 1.5 : 2.55;
  const geo = roundedBox(w, 0.16, 0.26, 0.02, 1);
  const mat = mats.photo('concrete', { repeat: [1, 1], color: 0x8b857a });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.castShadow = true;
  inst.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const z = z0 + i * spacing + (Math.sin(i * 3.7) * 0.012);
    const rotY = (Math.sin(i * 1.7)) * 0.006;
    m.compose(
      new THREE.Vector3(x + Math.sin(i * 2.1) * 0.007, 0.07, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  scene.add(inst);
  return inst;
}

export function buildRails(batch, mats, { x = 0, z0 = -180, z1 = 180, narrow = false }) {
  const gauge = narrow ? 0.762 : TRACK.gauge;
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  const railSteel = mats.metal(0xb8b5ae, 0.16, 1.0);
  const railRust = mats.photo('rust', { repeat: [1, 10], color: 0x6d655d, normalScale: 0.35 });
  for (const s of [-1, 1]) {
    const rx = x + s * gauge / 2;
    // base, web, head
    batch.box(0.16, 0.035, len, railRust, { pos: [rx, 0.125, cz], radius: 0.004 });
    batch.box(0.038, 0.10, len, railRust, { pos: [rx, 0.19, cz], radius: 0.002 });
    batch.box(0.085, 0.045, len, railSteel, { pos: [rx, 0.248, cz], radius: 0.012 });
    // bright worn running surface
    batch.box(0.062, 0.006, len, mats.metal(0xe7e2d8, 0.08, 1.0), { pos: [rx, 0.272, cz], radius: 0.002, castShadow: false });
    // base plates
    const clips = new THREE.InstancedMesh(
      roundedBox(0.2, 0.04, 0.12, 0.008, 1),
      mats.blackMetal,
      Math.floor(len / 0.62),
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < clips.count; i++) {
      m.makeTranslation(rx, 0.11, z0 + 0.3 + i * 0.62);
      clips.setMatrixAt(i, m);
    }
    clips.castShadow = false;
    clips.frustumCulled = false;
    clips.userData.kind = 'railclips';
    (batch._pending = batch._pending || []).push(clips);
  }
}

export function buildTrack(scene, mats, opts = {}) {
  const x = opts.x ?? 0;
  const z0 = opts.z0 ?? -190, z1 = opts.z1 ?? 190;
  const narrow = !!opts.narrow;
  const batch = new MeshBatch('track');
  buildBallastBed(batch, mats, { x, z0, z1, width: narrow ? 2.4 : 4.3, track: narrow ? 'narrow' : null });
  buildRails(batch, mats, { x, z0, z1, narrow });
  const group = batch.build(scene, 'track');
  if (batch._pending) for (const p of batch._pending) group.add(p);
  buildSleepers(group, mats, { x, z0, z1, narrow });
  return group;
}

export function buildCatenary(scene, mats, { z0 = -190, z1 = 190, spacing = 36, tracks = [0, -7.2, -14.4] } = {}) {
  const batch = new MeshBatch('catenary');
  const steel = mats.painted(0x66706e, { roughness: 0.65, metalness: 0.4, clearcoat: 0.1, seed: 24, variation: 1.3 });
  const insulator = mats.painted(0x8c5a3c, { roughness: 0.55, metalness: 0.0, clearcoat: 0.2, seed: 5 });
  const wire = mats.metal(0x4a4d4e, 0.55, 0.75);

  const masts = [];
  for (let z = z0; z <= z1; z += spacing) masts.push(z);

  for (const z of masts) {
    // portal over the main tracks
    for (const px of [-19.6, 2.15]) {
      // lattice post: 2 channels + zigzag braces
      batch.box(0.22, 8.6, 0.22, steel, { pos: [px - 0.18, 4.3, z], radius: 0.02 });
      batch.box(0.22, 8.6, 0.22, steel, { pos: [px + 0.18, 4.3, z], radius: 0.02 });
      for (let y = 0.7; y < 8.3; y += 0.55) {
        batch.box(0.5, 0.035, 0.035, steel, { pos: [px, y, z], rot: [0, 0, 0.8], castShadow: false });
      }
      // base plinth
      batch.box(0.9, 0.35, 0.7, mats.concrete([1, 1], 0x958e82), { pos: [px, 0.18, z], radius: 0.03 });
    }
    // cross truss
    const beamLen = 21.75, cx = (-19.6 + 2.15) / 2;
    for (const dx of [-0.45, 0.45]) {
      batch.box(beamLen, 0.16, 0.16, steel, { pos: [cx, 8.45 + dx * 0.3, z], radius: 0.02 });
    }
    for (let x = -19; x < 2.4; x += 1.35) {
      batch.box(0.04, 1.1, 0.04, steel, { pos: [x, 8.2, z], rot: [0, 0, (x % 2.7 === 0) ? 0.7 : -0.7], castShadow: false });
    }
    // insulator droppers and cantilever tubes over each track
    for (const tx of tracks) {
      // registration arm
      batch.tube([[tx + 1.25, 8.1, z], [tx + 0.9, 7.3, z], [tx, 6.45, z]], 0.025, steel, { tubularSegments: 8 });
      batch.box(0.18, 0.25, 0.18, insulator, { pos: [tx + 0.8, 7.35, z], radius: 0.025 });
      // ribbed ceramic insulator stack
      for (let i = 0; i < 4; i++) {
        batch.cyl(0.09, 0.09, 0.045, insulator, { pos: [tx + 1.25, 8.02 - i * 0.075, z], seg: 10 });
      }
      batch.box(0.16, 0.07, 0.16, steel, { pos: [tx, 6.42, z] });
    }
    // numbering plate
    batch.box(0.38, 0.22, 0.02, mats.painted(0xd7b444, { seed: 33 }), { pos: [-19.6, 3.5, z + 0.13] });
  }

  // longitudinal wires, sagging between masts
  const makeSag = (tx, y, sag, offX = 0, radius = 0.014) => {
    for (let i = 0; i < masts.length - 1; i++) {
      const za = masts[i], zb = masts[i + 1];
      const pts = [];
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        const z = za + (zb - za) * t;
        const yy = y - Math.sin(t * Math.PI) * sag;
        pts.push([tx + offX, yy, z]);
      }
      batch.add(tubeGeo(pts, radius, 14, 3), wire, { castShadow: false, receiveShadow: false });
    }
  };
  for (const tx of tracks) {
    makeSag(tx, 6.38, 0.28, 0, 0.016); // messenger
    makeSag(tx, 5.62, 0.04, 0, 0.013); // contact wire
    // droppers
    for (let i = 0; i < masts.length - 1; i++) {
      const za = masts[i], zb = masts[i + 1];
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        const z = za + (zb - za) * t;
        const sag = Math.sin(t * Math.PI) * 0.28;
        const yTop = 6.38 - sag;
        const yBot = 5.62 - Math.sin(t * Math.PI) * 0.04;
        batch.add(tubeGeo([[tx, yTop, z], [tx, yBot, z]], 0.006, 2, 3), wire, { castShadow: false });
      }
    }
  }
  return batch.build(scene, 'catenary');
}

export function buildSignalGantry(scene, mats, { z = -135, x = -3, height = 7.2 } = {}) {
  const batch = new MeshBatch('signal');
  const steel = mats.metal(0x53595a, 0.5, 0.7);
  const black = mats.painted(0x111313, { roughness: 0.6, seed: 4 });
  batch.box(0.35, height, 0.35, steel, { pos: [x - 10, height / 2, z] });
  batch.box(0.35, height, 0.35, steel, { pos: [x + 8, height / 2, z] });
  batch.box(18.5, 0.28, 0.35, steel, { pos: [x - 1, height, z] });
  batch.box(18.5, 0.16, 0.35, steel, { pos: [x - 1, height - 1.0, z] });
  for (let xx = -9.5; xx < 8.5; xx += 1.15) {
    batch.box(0.05, 1.0, 0.05, steel, { pos: [x + xx, height - 0.55, z], rot: [0, 0, xx % 2.3 < 1 ? 0.65 : -0.65], castShadow: false });
  }
  const heads = [0, -7.2, -14.4].map((tx, i) => ({ tx, state: i === 0 ? 'green' : 'red' }));
  for (const h of heads) {
    batch.box(0.5, 1.55, 0.42, black, { pos: [h.tx, height - 1.4, z], radius: 0.03 });
    // hooded lenses
    for (let i = 0; i < 3; i++) {
      batch.cyl(0.16, 0.16, 0.12, black, { pos: [h.tx, height - 0.98 - i * 0.5, z + 0.26], rot: [Math.PI / 2, 0, 0], seg: 12 });
      const color = i === 1 ? (h.state === 'green' ? 0x38ff70 : 0xff2f2f) : 0x111111;
      const mat = i === 1 ? mats.emissive(color, 7, 0x101010) : mats.blackMetal;
      batch.cyl(0.105, 0.105, 0.035, mat, { pos: [h.tx, height - 0.98 - i * 0.5, z + 0.33], rot: [Math.PI / 2, 0, 0], seg: 14, castShadow: false });
    }
    // number plate
    batch.box(0.34, 0.15, 0.02, mats.painted(0xe4dbc6, { seed: 8 }), { pos: [h.tx, height - 2.2, z + 0.31] });
  }
  batch.box(0.65, 0.4, 0.5, mats.painted(0xd8d3c6, { seed: 12 }), { pos: [x - 10, 2.4, z + 0.3] });
  const group = batch.build(scene, 'signal');
  // signal light halo
  const glowGeo = new THREE.PlaneGeometry(0.5, 0.5);
  const glowMat = new THREE.MeshBasicMaterial({
    map: makeGlowSprite(), color: 0x52ff7a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, height - 1.48, z + 0.5);
  group.add(glow);
  glow.userData.billboard = true;
  return group;
}

let _glowTex = null;
export function makeGlowSprite() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}
