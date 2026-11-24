import * as THREE from 'three';
import { MeshBatch, roundedBox, tubeGeo, mulberry32, rr, pick, makeCanvas, canvasTexture, TAU } from '../core/util.js';
import { makeGlowSprite } from './tracks.js';

const P = 0.98; // platform surface height

// A filled jute sack is never an ellipsoid. Start from a soft rounded box,
// let the faces puff, pinch the +Z end into a gathered mouth and settle the
// base flat, then push every vertex along a position-derived noise field so
// seams stay watertight and the silhouette picks up the dents a dropped sack
// gets. Returns the body plus the local Z of its tied mouth.
function sackBody(w, h, d, seed = 1) {
  const g = roundedBox(w, h, d, Math.min(w, h) * 0.3, 4);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const ph = seed * 2.3;
  const floor = -h * 0.47;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = x / (w * 0.5), nz = z / (d * 0.5);
    const puff = 0.03 * (1 - nx * nx * 0.5) * (1 - nz * nz * 0.35);
    // creases run mostly around the girth, not in every direction
    const n = Math.sin(y * 26.0 + z * 9.0 + ph) * 0.44
      + Math.sin(z * 14.3 - x * 21.0 + ph * 1.7) * 0.34
      + Math.sin(x * 38.1 + z * 24.7 - y * 12.3 + ph * 0.7) * 0.22;
    const k = puff + n * 0.014;
    x += nrm.getX(i) * k; y += nrm.getY(i) * k; z += nrm.getZ(i) * k;
    // gathered mouth on +Z
    const t = (z / (d * 0.5) - 0.6) / 0.4;
    if (t > 0) {
      const f = 1 - 0.5 * Math.pow(Math.min(1, t), 1.5);
      x *= f; y = y * f + h * 0.06 * (1 - f);
    }
    // settle it on the platform
    if (y < floor) y = floor + (y - floor) * 0.26;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  g.userData.mouthZ = d * 0.49;
  return g;
}

// Jute sacking: one shared material with a woven map, a crumple bump and a
// stencilled consignment mark, so every sack in the station gains detail
// without another draw state.
let _sackMat = null;
function sackMaterial() {
  if (_sackMat) return _sackMat;
  const S = 512;
  const rng = mulberry32(77);

  // colour: woven jute with damp patches and a faded mill stencil
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8c7c5d'; ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) {
    ctx.fillStyle = (y / 4) % 2 ? 'rgba(246,231,198,.075)' : 'rgba(58,43,24,.085)';
    ctx.fillRect(0, y, S, 2);
  }
  for (let x = 0; x < S; x += 4) {
    ctx.fillStyle = (x / 4) % 2 ? 'rgba(246,231,198,.05)' : 'rgba(58,43,24,.07)';
    ctx.fillRect(x, 0, 2, S);
  }
  for (let i = 0; i < 1100; i++) {
    const x = rng() * S, y = rng() * S, l = rr(rng, 3, 15);
    ctx.strokeStyle = rng() > 0.5 ? 'rgba(242,228,198,.16)' : 'rgba(64,48,28,.17)';
    ctx.lineWidth = rr(rng, 1, 2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + rr(rng, -2, 2)); ctx.stroke();
  }
  for (let i = 0; i < 55; i++) {
    const x = rng() * S, y = rng() * S, r = rr(rng, 24, 110);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${Math.round(rr(rng, 46, 76))},${Math.round(rr(rng, 36, 58))},${Math.round(rr(rng, 20, 38))},.2)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.translate(S * 0.62, S * 0.36);
  ctx.rotate(-0.05);
  ctx.strokeStyle = 'rgba(40,32,22,.34)'; ctx.lineWidth = 3;
  ctx.strokeRect(-46, -26, 92, 52);
  ctx.fillStyle = 'rgba(40,32,22,.4)';
  ctx.font = '700 26px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FCI', 0, -7);
  ctx.font = '600 12px Helvetica, Arial, sans-serif';
  ctx.fillText('NET 50 KG', 0, 16);
  ctx.restore();
  const map = canvasTexture(c, { repeat: [1, 1] });

  // bump: the same weave plus soft crumple, grayscale
  const b = makeCanvas(S, S);
  const bctx = b.getContext('2d');
  bctx.fillStyle = '#7d7d7d'; bctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) {
    bctx.fillStyle = (y / 4) % 2 ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.18)';
    bctx.fillRect(0, y, S, 2);
  }
  for (let x = 0; x < S; x += 4) {
    bctx.fillStyle = (x / 4) % 2 ? 'rgba(255,255,255,.13)' : 'rgba(0,0,0,.12)';
    bctx.fillRect(x, 0, 2, S);
  }
  for (let i = 0; i < 130; i++) {
    const x = rng() * S, y = rng() * S, r = rr(rng, 10, 58);
    const g = bctx.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.round(rr(rng, 70, 190));
    g.addColorStop(0, `rgba(${v},${v},${v},.5)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    bctx.fillStyle = g;
    bctx.beginPath(); bctx.arc(x, y, r, 0, TAU); bctx.fill();
  }
  const bump = canvasTexture(b, { srgb: false, repeat: [1, 1] });

  _sackMat = new THREE.MeshStandardMaterial({
    map, bumpMap: bump, bumpScale: 0.018,
    color: 0xd9d2be, roughness: 0.97, metalness: 0.0, envMapIntensity: 0.16,
  });
  return _sackMat;
}

function boardMesh(texture, w, h, { glow = 0, double = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.7, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: glow,
    side: THREE.DoubleSide, transparent: true, alphaTest: 0.02,
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  g.add(m);
  if (double) {
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m2.rotation.y = Math.PI;
    m2.position.z = -0.008;
    g.add(m2);
  }
  return g;
}

// Soft contact shadow. One shared texture/material so every blob in the
// station bakes into a single extra draw call after the static merge.
let _contactMat = null;
function contactMaterial() {
  if (_contactMat) return _contactMat;
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,.92)');
  g.addColorStop(0.45, 'rgba(255,255,255,.55)');
  g.addColorStop(0.78, 'rgba(255,255,255,.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  _contactMat = new THREE.MeshBasicMaterial({
    map: t, color: 0x000000, transparent: true, opacity: 0.72,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  _contactMat.userData.noShadow = true;
  return _contactMat;
}

function addContact(b, x, z, w, d = w) {
  b.add(new THREE.PlaneGeometry(w, d), contactMaterial(), {
    pos: [x, P + 0.018, z], rot: [-Math.PI / 2, 0, 0],
    castShadow: false, receiveShadow: false,
  });
}

function addBench(b, mats, x, z, rot = 0) {
  const wood = mats.wood([2, 1], 0x8a5a33);
  const iron = mats.painted(0x1d2f27, { roughness: 0.62, metalness: 0.4, seed: 8, variation: 1.4 });
  const rotM = new THREE.Matrix4().makeRotationY(rot);
  const place = (lx, ly, lz) => {
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(rotM);
    return [x + v.x, P + ly, z + v.z];
  };
  // two cast-iron end frames
  for (const dz of [-0.98, 0.98]) {
    b.box(0.64, 0.09, 0.09, iron, { pos: place(0.02, 0.43, dz) });
    b.box(0.09, 0.43, 0.09, iron, { pos: place(-0.27, 0.215, dz) });
    b.box(0.09, 0.43, 0.09, iron, { pos: place(0.31, 0.215, dz) });
    b.box(0.2, 0.022, 0.11, iron, { pos: place(-0.27, 0.011, dz) });
    b.box(0.2, 0.022, 0.11, iron, { pos: place(0.31, 0.011, dz) });
    // back stile, slightly raked
    b.box(0.08, 0.78, 0.08, iron, { pos: place(0.36, 0.72, dz), rot: [0, rot, -0.09] });
    // armrest
    b.box(0.5, 0.06, 0.08, iron, { pos: place(0.1, 0.72, dz) });
    b.box(0.06, 0.3, 0.08, iron, { pos: place(-0.12, 0.57, dz) });
  }
  // centre leg
  b.box(0.09, 0.43, 0.09, iron, { pos: place(-0.02, 0.215, 0) });
  // three seat slats running the length of the bench
  for (let i = 0; i < 3; i++) {
    b.box(0.21, 0.055, 2.16, wood, { pos: place(-0.21 + i * 0.21, 0.47, 0) });
  }
  // three back slats, stacked vertically
  for (let i = 0; i < 3; i++) {
    b.box(0.05, 0.15, 2.16, wood, { pos: place(0.39 - i * 0.014, 0.66 + i * 0.17, 0) });
  }
  addContact(b, x, z, 1.5, 2.7);
}

function addDustbin(b, mats, x, z, color = 0x2c4a3c) {
  const bin = mats.painted(color, { roughness: 0.68, metalness: 0.2, seed: 5 });
  const steel = mats.metal(0x8d9291, 0.45, 0.7);
  b.cyl(0.28, 0.25, 0.75, bin, { pos: [x, P + 0.375, z], seg: 16 });
  b.cyl(0.3, 0.28, 0.08, steel, { pos: [x, P + 0.79, z], seg: 16 });
  b.cyl(0.1, 0.14, 0.07, steel, { pos: [x, P + 0.86, z], seg: 12 });
  b.box(0.22, 0.3, 0.02, mats.painted(0xcfc6b4, { seed: 3 }), { pos: [x, P + 0.5, z + 0.26] });
  addContact(b, x, z, 0.9, 0.9);
}

function addTrolley(b, mats, x, z, rot = 0) {
  const steel = mats.metal(0x7f8483, 0.4, 0.8);
  const wood = mats.wood([2, 1], 0x7a5b3c);
  const t = new THREE.Matrix4().makeRotationY(rot);
  const q = (lx, ly, lz) => {
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(t);
    return [x + v.x, P + ly, z + v.z];
  };
  b.box(1.1, 0.08, 1.8, wood, { pos: q(0, 0.45, 0), rot: [0, rot, 0] });
  for (const sx of [-0.55, 0.55]) {
    for (const sz of [-0.75, 0.75]) {
      b.cyl(0.10, 0.10, 0.08, mats.rubber, { pos: q(sx, 0.22, sz), rot: [0, 0, Math.PI / 2], seg: 12 });
      b.cyl(0.06, 0.06, 0.06, steel, { pos: q(sx, 0.22, sz), rot: [0, 0, Math.PI / 2], seg: 8 });
    }
  }
  b.box(3.0, 0.05, 0.05, steel, { pos: q(-0.65, 1.05, 0), rot: [0, rot, 0] });
  b.box(0.05, 0.6, 0.05, steel, { pos: q(-2.1, 0.75, 0.55) });
  b.box(0.05, 0.6, 0.05, steel, { pos: q(-2.1, 0.75, -0.55) });
  // a couple of cases on the trolley
  const rng = mulberry32(11);
  let stack = 0.5;
  for (let i = 0; i < 3; i++) {
    const h = rr(rng, .24, .34);
    const cw = rr(rng, .45, .7), cd = rr(rng, .3, .48);
    const px = rr(rng, -.25, .25), pz = rr(rng, -.4, .4), ry = rot + rr(rng, -.3, .3);
    b.box(cw, h, cd, mats.leather(pick(rng, [0x8b6544, 0x546e7a, 0x86534a])), {
      pos: q(px, stack + h / 2, pz), rot: [0, ry, 0], radius: 0.03,
    });
    // leather straps over the lid and a buff shipping label
    for (const sx of [-cw * 0.27, cw * 0.27]) {
      b.box(0.038, 0.014, cd + 0.012, mats.painted(0x2b2118, { roughness: 0.8, seed: 5 }), {
        pos: q(px + sx, stack + h + 0.006, pz), rot: [0, ry, 0], castShadow: false,
      });
    }
    b.box(cw * 0.3, h * 0.34, 0.008, mats.painted(0xd8cba8, { roughness: 0.9, seed: 3 }), {
      pos: q(px, stack + h * 0.48, pz + cd * 0.5 + 0.005), rot: [0, ry, 0], castShadow: false,
    });
    stack += h + 0.01;
  }
  addContact(b, x, z, 2.6, 2.4);
}

function addLuggage(b, mats, x, z, seed = 2) {
  const rng = mulberry32(seed);
  const leather = mats.leather(0x936b45);
  const steel = mats.metal(0x85898a, 0.35, 0.8);
  const count = 2 + Math.floor(rng() * 3);
  let stack = 0.0;
  for (let i = 0; i < count; i++) {
    const w = rr(rng, 0.5, 0.8), h = rr(rng, 0.28, 0.42), d = rr(rng, 0.28, 0.42);
    const px = x + rr(rng, -0.22, 0.22), pz = z + rr(rng, -0.28, 0.28);
    b.box(w, h, d, leather, { pos: [px, P + stack + h / 2, pz], rot: [0, rr(rng, -0.3, 0.3), 0], radius: 0.03 });
    b.box(w + 0.012, 0.035, d + 0.012, mats.painted(0x3b2b1f, { seed: 4 }), { pos: [px, P + stack + h * 0.72, pz] });
    b.box(w * 0.16, h * 0.5, 0.02, steel, { pos: [px, P + stack + h * 0.55, pz + d / 2] });
    // handle
    b.tube([[px - 0.07, P + stack + h + 0.02, pz], [px - 0.07, P + stack + h + 0.09, pz], [px + 0.07, P + stack + h + 0.09, pz], [px + 0.07, P + stack + h + 0.02, pz]], 0.012, steel, { tubularSegments: 3, radialSegments: 4 });
    stack += h + 0.015;
  }
  if (rng() > 0.5) {
    b.box(0.58, 0.36, 0.44, mats.painted(0xb89a6d, { roughness: 0.9, seed: 31 }), { pos: [x + 0.5, P + 0.18, z + 0.3], rot: [0, 0.3, 0] });
    b.box(0.6, 0.06, 0.46, mats.painted(0x8f7450, { roughness: 0.85, seed: 6 }), { pos: [x + 0.5, P + 0.38, z + 0.3], rot: [0, 0.3, 0] });
  }
  if (rng() > 0.5) {
    // a rolled bedding bundle, not a beach ball
    const roll = new THREE.CylinderGeometry(0.15, 0.15, 0.78, 10);
    b.add(roll, mats.fabric(0x7a5d46, [2, 2]), { pos: [x - 0.7, P + 0.17, z - 0.4], rot: [0, 0.4, Math.PI / 2] });
    for (const dz of [-0.18, 0.18]) {
      b.torus(0.152, 0.018, mats.painted(0x3a2c1e, { seed: 5 }), { pos: [x - 0.7, P + 0.17, z - 0.4 + dz], rot: [0, Math.PI / 2, 0], radialSegments: 5, tubularSegments: 14 });
    }
  }
  addContact(b, x, z, 1.9, 1.5);
}

function addKettle(b, mats, x, y, z, scale = 1) {
  const steel = mats.metal(0xc7cac8, 0.24, 0.95);
  b.cyl(0.16 * scale, 0.19 * scale, 0.3 * scale, steel, { pos: [x, y, z], seg: 16 });
  b.cyl(0.09 * scale, 0.16 * scale, 0.06 * scale, steel, { pos: [x, y + 0.18 * scale, z], seg: 16 });
  b.cyl(0.035 * scale, 0.045 * scale, 0.08 * scale, steel, { pos: [x, y + 0.25 * scale, z], seg: 10 });
  b.cyl(0.012 * scale, 0.018 * scale, 0.18 * scale, steel, {
    pos: [x + 0.17 * scale, y + 0.12 * scale, z], rot: [0, 0, -0.9], seg: 8,
  });
  b.tube([[x - 0.14 * scale, y + 0.12 * scale, z], [x - 0.27 * scale, y + 0.2 * scale, z], [x - 0.24 * scale, y + 0.05 * scale, z]], 0.012 * scale, steel);
}

function addCups(b, mats, x, y, z, count = 4) {
  const glass = mats.glass(0xdfe6df, 0.28, 0.2);
  const rng = mulberry32(8);
  for (let i = 0; i < count; i++) {
    b.cyl(0.038, 0.03, 0.09, glass, {
      pos: [x + rr(rng, -0.22, 0.22), y, z + rr(rng, -0.16, 0.16)], seg: 10, castShadow: false, receiveShadow: false,
    });
  }
}

// ---- signage -----------------------------------------------------------------
let _depBoard = null;
function departureBoard(tex) {
  if (_depBoard) return _depBoard;
  const w = 1400, h = 760;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = mulberry32(321);
  ctx.fillStyle = '#07100d'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1d3a2e'; ctx.lineWidth = 12; ctx.strokeRect(8, 8, w - 16, h - 16);
  // header
  ctx.fillStyle = '#123028'; ctx.fillRect(20, 20, w - 40, 108);
  ctx.fillStyle = '#d9f3d2'; ctx.font = '700 44px "Manrope", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('DEPARTURES', 48, 76);
  ctx.fillStyle = '#8fd18e'; ctx.font = '500 30px "Noto Sans Devanagari", sans-serif';
  ctx.fillText('गंतव्य / प्रस्थान', 360, 76);
  ctx.fillStyle = '#ffca63'; ctx.font = '600 26px "Manrope", sans-serif';
  ctx.fillText('BHARAT NAGAR  JUNCTION', 960, 72);
  const cols = [48, 300, 760, 990, 1180];
  ctx.fillStyle = '#7d9b8d'; ctx.font = '600 22px "Manrope", sans-serif';
  ctx.fillText('TRAIN', cols[0], 158);
  ctx.fillText('NAME', cols[1], 158);
  ctx.fillText('DEP', cols[2], 158);
  ctx.fillText('PF', cols[3], 158);
  ctx.fillText('STATUS', cols[4], 158);
  const rows = [
    ['12951', 'RAJDHANI EXP', '16:25', '1', 'ON TIME', '#8bf08d'],
    ['22436', 'VANDE BHARAT', '16:40', '1', 'ON TIME', '#8bf08d'],
    ['12626', 'KERALA EXP', '17:05', '1', 'DELAY 10', '#ffcf6a'],
    ['12002', 'SHATABDI EXP', '17:20', '1', 'ON TIME', '#8bf08d'],
    ['12416', 'INTERCITY', '17:45', '1', 'PLATFORM 1', '#8bf08d'],
  ];
  rows.forEach((row, i) => {
    const y = 214 + i * 98;
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(30,64,50,.35)'; ctx.fillRect(24, y - 40, w - 48, 84); }
    ctx.fillStyle = '#a9e8a6'; ctx.font = '600 38px "IBM Plex Mono", monospace';
    ctx.fillText(row[0], cols[0], y);
    ctx.fillStyle = '#e8f4e2'; ctx.font = '600 36px "Manrope", sans-serif';
    ctx.fillText(row[1], cols[1], y);
    ctx.fillStyle = '#ffd46e'; ctx.font = '600 38px "IBM Plex Mono", monospace';
    ctx.fillText(row[2], cols[2], y);
    ctx.fillStyle = '#e8f4e2'; ctx.font = '700 38px "IBM Plex Mono", monospace';
    ctx.fillText(row[3], cols[3], y);
    ctx.fillStyle = row[5]; ctx.font = '600 34px "Manrope", sans-serif';
    ctx.fillText(row[4], cols[4], y);
  });
  // scanlines
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = `rgba(0,0,0,${y % 8 ? 0.06 : 0.14})`;
    ctx.fillRect(0, y, w, 2);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(170,255,170,${rr(rng, .02, .08)})`;
    ctx.fillRect(rng() * w, rng() * h, rr(rng, 1, 4), 1);
  }
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  _depBoard = t;
  return t;
}

function enamel(tex, en, hi, sub, w = 4.3) {
  const geo = new THREE.PlaneGeometry(w, w * 0.35);
  const mat = new THREE.MeshStandardMaterial({
    map: tex.label({ w: 1600, h: 560, text: en, hi, sub, bg: '#0c242b', color: '#f5eeda', subColor: '#b9cdcd', size: 112, subSize: 44, weight: 800, letterSpacing: 3 }),
    roughness: 0.55,
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  const back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI;
  back.position.z = -0.012;
  g.add(back);
  return g;
}

// ---- builder -----------------------------------------------------------------
export function buildProps(scene, mats, tex) {
  const b = new MeshBatch('props');
  const glow = makeGlowSprite();
  const animated = { fans: [], flag: null, clocks: [], lampPositions: [] };

  // ------------------------------------------------------------- seating
  const benches = [
    [12.2, -84], [12.2, -56], [12.2, -42], [12.2, -28], [12.2, -14],
    [12.2, 0], [12.2, 14], [12.2, 28], [12.2, 42], [12.2, 56],
    [6.2, -77, Math.PI], [6.2, -49, Math.PI], [6.2, -7, Math.PI], [6.2, 21, Math.PI], [6.2, 49, Math.PI],
  ];
  for (const [x, z, rot] of benches) addBench(b, mats, x, z, rot || 0);
  animated.benches = benches.map(([x, z]) => [x, z]);

  // bins near benches and stalls
  for (const [x, z] of [[13.0, -88], [13.0, -62], [13.0, -34], [13.0, -6], [13.0, 22], [13.0, 50], [5.5, -70], [5.5, -20], [5.5, 34]]) {
    addDustbin(b, mats, x, z, Math.round(z) % 2 ? 0x2c4a3c : 0x3d4a63);
  }

  addLuggage(b, mats, 12.9, -36.6, 3);
  addLuggage(b, mats, 12.7, 6.8, 14);
  addLuggage(b, mats, 4.9, 26.0, 22);
  addLuggage(b, mats, 13.1, -78.0, 9);
  addTrolley(b, mats, 10.0, -63.5, 0.2);
  addTrolley(b, mats, 7.0, 18.5, -0.2);
  addTrolley(b, mats, 11.4, 47.0, 0.1);

  // ------------------------------------------------------------- water booth
  {
    const x = 14.4, z = -40.2;
    const steel = mats.metal(0xb9bdbd, 0.3, 0.85);
    const blue = mats.painted(0x2a5e86, { roughness: 0.5, metalness: 0.2, seed: 9 });
    b.box(0.9, 1.35, 0.6, steel, { pos: [x, P + 0.675, z], radius: 0.04 });
    b.box(0.94, 0.07, 0.64, blue, { pos: [x, P + 1.36, z] });
    b.box(0.7, 0.04, 0.4, mats.metal(0x838786, 0.5, 0.7), { pos: [x, P + 0.9, z - 0.3], rot: [0.5, 0, 0] });
    for (const dx of [-0.18, 0.18]) {
      b.cyl(0.026, 0.026, 0.13, steel, { pos: [x + dx, P + 0.82, z - 0.36], rot: [Math.PI / 2, 0, 0], seg: 8 });
    }
    b.box(1.0, 0.1, 0.78, mats.concrete([1, 1], 0x8a8479), { pos: [x, P + 0.05, z] });
    const sign = boardMesh(tex.label({
      w: 768, h: 220, text: 'DRINKING WATER', hi: 'पीने का पानी', bg: '#173e5d', color: '#f1eadb',
      size: 64, subSize: 26, weight: 800, letterSpacing: 2,
    }), 1.4, 0.4);
    sign.position.set(x, P + 1.86, z);
    sign.rotation.y = 0.16;
    scene.add(sign);
  }

  // ------------------------------------------------------------- wall notice board + posters
  {
    const board = boardMesh(tex.notice(), 1.5, 2.1);
    board.position.set(16.7, P + 2.1, 6.8);
    board.rotation.y = -Math.PI / 2;
    scene.add(board);
    b.box(0.08, 2.28, 1.65, mats.wood([1, 4], 0x4a3421), { pos: [16.78, P + 2.1, 6.8] });

    for (let i = 0; i < 5; i++) {
      const poster = boardMesh(tex.poster(i + 1), 1.0, 1.42);
      poster.position.set(16.72, P + 2.0, -3.6 + i * 5.2);
      poster.rotation.y = -Math.PI / 2;
      scene.add(poster);
    }
    // vertical advert boards on the arcade pilasters
    for (const z of [-44.4, -23.6, 23.6, 39.6]) {
      const ad = boardMesh(tex.poster(((z + 100) | 0) % 4 + 1), 0.9, 1.5);
      ad.position.set(16.55, P + 3.5, z);
      ad.rotation.y = -Math.PI / 2;
      scene.add(ad);
    }
  }

  // ------------------------------------------------------------- enamel running boards
  const stationBoard = (en, hi, sub, w = 3.5) => enamel(tex, en, hi, sub, w);
  for (const z of [-84, -56, -28, 0, 28, 56]) {
    const board = stationBoard('BHARAT NAGAR', 'भारत नगर', 'PLATFORM 1 · प्लेटफार्म १', 3.7);
    board.position.set(7.0, P + 4.95, z);
    scene.add(board);
    // suspension rods
    b.cyl(0.015, 0.015, 0.55, mats.metal(0x5f6563, 0.4, 0.7), { pos: [5.7, P + 5.35, z], seg: 5, castShadow: false });
    b.cyl(0.015, 0.015, 0.55, mats.metal(0x5f6563, 0.4, 0.7), { pos: [8.3, P + 5.35, z], seg: 5, castShadow: false });
  }

  // platform number boards on twin posts at the edge
  for (const [z, n] of [[-42, 1], [18, 1], [-72, 2], [48, 2]]) {
    const postX = z === -72 || z === 48 ? -21.9 : 4.0;
    const texN = tex.platformNumber(n);
    const g = boardMesh(texN, 0.8, 1.0, { glow: 0.05 });
    g.position.set(postX, P + 2.85, z);
    g.rotation.y = 0.1;
    scene.add(g);
    for (const dz of [-0.5, 0.5]) {
      b.cyl(0.04, 0.05, 2.35, mats.painted(0x34443f, { seed: 3 }), { pos: [postX, P + 1.18, z + dz], seg: 8 });
    }
  }

  // eye-level station board on twin posts, reading down the platform
  {
    const x = 4.1, z = -51.5;
    const board = stationBoard('BHARAT NAGAR', 'भारत नगर', 'PLATFORM 1 · प्लेटफ़ॉर्म १', 2.5);
    board.position.set(x, P + 2.55, z);
    scene.add(board);
    for (const dz of [-1.15, 1.15]) {
      b.cyl(0.045, 0.055, 2.05, mats.metal(0x4c5a54, 0.4, 0.65), { pos: [x, P + 1.02, z + dz], seg: 8 });
      b.cyl(0.09, 0.11, 0.07, mats.metal(0x3c4641, 0.5, 0.6), { pos: [x, P + 2.02, z + dz], seg: 8 });
    }
  }

  // more luggage, parcels and a handcart waiting near the middle of the platform
  addLuggage(b, mats, 6.1, -60.4, 31);
  addLuggage(b, mats, 13.4, -64.8, 12);
  addLuggage(b, mats, 4.6, -44.2, 7);
  addLuggage(b, mats, 12.6, -20.8, 26);
  addLuggage(b, mats, 5.2, 8.2, 18);
  addTrolley(b, mats, 8.9, -58.4, 0.35);
  addTrolley(b, mats, 4.8, -36.0, -0.12);
  {
    // porter's handcart stacked with sacks
    const x = 8.0, z = -66.6;
    const wood = mats.wood([2, 1], 0x6d4f32);
    b.box(0.86, 0.09, 1.5, wood, { pos: [x, P + 0.48, z] });
    b.box(0.06, 0.09, 1.5, mats.metal(0x6f7573, 0.4, 0.7), { pos: [x - 0.44, P + 0.48, z] });
    for (const dz of [-0.55, 0.55]) {
      b.cyl(0.26, 0.26, 0.07, mats.rubber, { pos: [x + 0.36, P + 0.28, z + dz], rot: [0, 0, Math.PI / 2], seg: 12 });
      b.cyl(0.035, 0.035, 0.5, mats.metal(0x6f7573, 0.4, 0.7), { pos: [x - 0.44, P + 0.7, z + dz], rot: [0.5, 0, 0], seg: 6 });
    }
    const sack = sackMaterial();
    const tie = mats.painted(0x7d6a4c, { roughness: 0.95, seed: 16 });
    for (let i = 0; i < 3; i++) {
      const sx = x + (i === 1 ? 0.05 : -0.05);
      const sz = z - 0.42 + (i % 2) * 0.62;
      const sy = P + 0.64 + (i === 2 ? 0.27 : 0);
      const ry = i * 0.5;
      const body = sackBody(0.5, 0.36, 0.7, i + 1);
      b.add(body, sack, { pos: [sx, sy, sz], rot: [0, ry, 0] });
      // gathered neck, tie and stencil
      const mz = body.userData.mouthZ;
      const mx = sx + Math.sin(ry) * mz, mzz = sz + Math.cos(ry) * mz;
      b.cyl(0.075, 0.028, 0.13, sack, { pos: [mx, sy - 0.02, mzz], rot: [Math.PI / 2, 0, ry], seg: 7 });
      b.torus(0.045, 0.011, tie, { pos: [mx - Math.sin(ry) * 0.01, sy - 0.02, mzz - Math.cos(ry) * 0.01], rot: [Math.PI / 2, 0, ry], radialSegments: 4, tubularSegments: 9 });
      b.box(0.13, 0.004, 0.08, mats.painted(0xd6cbb0, { roughness: 0.95, seed: 8 }), {
        pos: [sx - 0.02, sy + 0.118, sz], rot: [0, 0.2, 0], castShadow: false,
      });
    }
  }
  {
    // shoe-shine stand and stool
    const x = 12.55, z = -45.6;
    const wood = mats.wood([1, 1], 0x5c3f28);
    b.box(0.5, 0.34, 0.7, wood, { pos: [x, P + 0.42, z], rot: [0, 0.25, 0] });
    b.box(0.42, 0.06, 0.5, mats.painted(0x7a2f27, { seed: 3 }), { pos: [x - 0.02, P + 0.62, z], rot: [0, 0.25, 0.06] });
    b.box(0.34, 0.28, 0.34, wood, { pos: [x + 0.52, P + 0.16, z + 0.25], rot: [0, -0.15, 0] });
    for (let i = 0; i < 4; i++) {
      b.cyl(0.045, 0.05, 0.1, mats.painted(pick(mulberry32(90 + i), [0x211d18, 0x5a3c23, 0x8a1f1a]), { seed: i }), { pos: [x - 0.12 + i * 0.08, P + 0.69, z + 0.18 - i * 0.04], seg: 8 });
    }
    b.box(0.5, 0.03, 0.3, mats.painted(0xd8cfb8, { seed: 2 }), { pos: [x + 0.2, P + 0.75, z - 0.22], rot: [0.2, 0.2, 0] });
  }

  // ------------------------------------------------------------- foreground clutter
  {
    // sacks of grain waiting to be loaded: long, lumpy, with tied necks
    const sack = sackMaterial();
    const tie = mats.painted(0x7d6a4c, { roughness: 0.95, seed: 16 });
    const x = 5.1, z = -67.2;
    const sackAt = (px, py, pz, ry, s = 1) => {
      const body = sackBody(0.46 * s, 0.3 * s, 0.78 * s, Math.round(pz * 7));
      b.add(body, sack, { pos: [px, P + py, pz], rot: [0, ry, 0] });
      // gathered neck and tie
      const mz = body.userData.mouthZ;
      const mx = px + Math.sin(ry) * mz, mzz = pz + Math.cos(ry) * mz;
      b.cyl(0.072 * s, 0.026 * s, 0.12 * s, sack, {
        pos: [mx, P + py - 0.015, mzz], rot: [Math.PI / 2, 0, ry], seg: 7,
      });
      b.torus(0.043 * s, 0.011 * s, tie, {
        pos: [mx - Math.sin(ry) * 0.01, P + py - 0.015, mzz - Math.cos(ry) * 0.01],
        rot: [Math.PI / 2, 0, ry], radialSegments: 4, tubularSegments: 9,
      });
      // stencilled consignment patch on the shoulder of the sack
      b.box(0.14 * s, 0.004, 0.09 * s, mats.painted(0xd6cbb0, { roughness: 0.95, seed: 8 }), {
        pos: [px - 0.03, P + py + 0.13 * s, pz + 0.05], rot: [0, ry + 0.2, 0],
      });
    };
    sackAt(x - 0.34, 0.15, z + 0.12, 0.5);
    sackAt(x + 0.3, 0.15, z - 0.1, -0.35);
    sackAt(x - 0.02, 0.15, z - 0.42, 0.15);
    sackAt(x - 0.02, 0.4, z - 0.14, 0.7, 0.92);
    addContact(b, x, z - 0.15, 1.7, 1.5);

    // crates and a rolled carpet
    const crate = mats.wood([2, 1], 0x6b4c30);
    b.box(0.52, 0.34, 0.42, crate, { pos: [4.4, P + 0.17, -63.4], rot: [0, 0.2, 0] });
    b.box(0.46, 0.3, 0.38, crate, { pos: [4.45, P + 0.49, -63.35], rot: [0, -0.1, 0] });
    b.add(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8), mats.fabric(0x6f4b3a, [2, 2]), {
      pos: [4.7, P + 0.14, -64.25], rot: [0, 0.4, Math.PI / 2],
    });
    addContact(b, 4.5, -63.8, 1.4, 1.6);
  }
  {
    // a station dog asleep against the wall
    const x = 14.55, z = -61.0;
    const fur = mats.painted(0x8a6a45, { roughness: 0.92, seed: 11 });
    const pale = mats.painted(0xd0b98f, { roughness: 0.92, seed: 12 });
    b.sphere(0.17, fur, { pos: [x, P + 0.17, z], scale: [0.82, 0.78, 1.5] });
    b.sphere(0.13, fur, { pos: [x, P + 0.2, z - 0.33], scale: [0.9, 0.9, 0.9] });
    b.sphere(0.13, pale, { pos: [x, P + 0.16, z + 0.28], scale: [0.8, 0.8, 1.0] });
    b.sphere(0.075, fur, { pos: [x - 0.1, P + 0.1, z - 0.44], scale: [1, 0.7, 1] });
    b.sphere(0.075, fur, { pos: [x + 0.1, P + 0.1, z - 0.44], scale: [1, 0.7, 1] });
    b.cyl(0.012, 0.04, 0.3, fur, { pos: [x + 0.02, P + 0.14, z + 0.44], rot: [0.9, 0, 0], seg: 5 });
    addContact(b, x, z, 1.1, 0.9);
  }

  // ------------------------------------------------------------- departure boards
  {
    const depTex = departureBoard(tex);
    const depMat = new THREE.MeshStandardMaterial({
      map: depTex, roughness: 0.42, metalness: 0.1,
      emissive: 0xffffff, emissiveMap: depTex, emissiveIntensity: 0.55,
      side: THREE.FrontSide,
    });
    for (const [x, z, rot] of [[6.2, -46, 0], [9.4, 10, 0], [16.55, 30, -Math.PI / 2]]) {
      const board = new THREE.Group();
      for (const face of [0, Math.PI]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.95), depMat);
        m.rotation.y = face;
        m.position.z = face ? -0.012 : 0.012;
        board.add(m);
      }
      board.position.set(x, P + 4.35, z);
      board.rotation.y = rot;
      scene.add(board);
      if (rot === 0) {
        b.box(3.9, 0.16, 0.28, mats.painted(0x1a2c28, { seed: 3 }), { pos: [x, P + 5.39, z] });
        b.cyl(0.012, 0.012, 0.7, mats.blackMetal, { pos: [x - 1.5, P + 5.78, z], seg: 4, castShadow: false });
        b.cyl(0.012, 0.012, 0.7, mats.blackMetal, { pos: [x + 1.5, P + 5.78, z], seg: 4, castShadow: false });
      } else {
        b.box(0.16, 2.2, 3.9, mats.painted(0x1a2c28, { seed: 3 }), { pos: [x + 0.12, P + 4.35, z] });
      }
    }
  }

  // ------------------------------------------------------------- wayfinding
  {
    const make = (text, hi, w, x, z, y = 4.9) => {
      const label = tex.label({ w: 1400, h: 300, text, hi, bg: '#12323a', color: '#f4ecd9', subColor: '#c9d9d7', size: 96, subSize: 38, weight: 800, letterSpacing: 2 });
      const m = boardMesh(label, w, w * 0.22);
      m.position.set(x, P + y, z);
      scene.add(m);
      for (const dx of [-w * 0.34, w * 0.34]) {
        b.cyl(0.011, 0.011, 2.9, mats.blackMetal, { pos: [x + dx, P + y + 0.11 * w + 1.45, z], seg: 5, castShadow: false });
      }
      return m;
    };
    make('WAY OUT  →', 'बाहर जाने का रास्ता', 2.6, 8.8, -34);
    make('BOOKING OFFICE  ←', 'आरक्षण कार्यालय', 2.9, 8.8, -20.4);
    make('DRINKING WATER  →', 'पीने का पानी', 2.7, 8.8, -6.8);
    make('FOOT OVERBRIDGE  ↑', 'पैदल पुल', 2.9, 8.8, 32);
    make('TOILETS  →', 'शौचालय', 2.2, 8.8, 44);
  }

  // ------------------------------------------------------------- wall clock
  {
    const x = 15.45, z = 22.0;
    const face = makeClockFace();
    const frame = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 32), mats.painted(0x28332f, { seed: 2 }));
    frame.add(rim);
    const faceMesh = new THREE.Mesh(new THREE.CircleGeometry(0.44, 32), new THREE.MeshStandardMaterial({ map: face, roughness: 0.65 }));
    frame.add(faceMesh);
    const handMat = mats.painted(0x1b1814, { seed: 1 });
    const hour = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.22, 0.01), handMat);
    hour.position.set(0, 0.11, 0.012); hour.geometry.translate(0, 0.11, 0);
    hour.userData.dynamic = true;
    const minute = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.34, 0.01), handMat);
    minute.position.set(0, 0.17, 0.014); minute.geometry.translate(0, 0.17, 0);
    minute.userData.dynamic = true;
    frame.add(hour, minute);
    frame.position.set(x, P + 4.0, z);
    frame.rotation.y = -Math.PI / 2;
    scene.add(frame);
    animated.clocks.push({ hour, minute });
    b.box(0.4, 0.06, 0.4, mats.metal(0x4c5350, 0.4, 0.7), { pos: [x + 0.2, P + 4.5, z] });
    b.box(0.06, 0.5, 0.06, mats.painted(0x2c3a35, { seed: 2 }), { pos: [x + 0.2, P + 4.75, z] });
  }

  // ------------------------------------------------------------- tea stall
  {
    const x = 13.8, z = -58.2;
    const steel = mats.metal(0x9aa09c, 0.52, 0.7);
    const wood = mats.wood([3, 1], 0x6f4d2f);
    const green = mats.painted(0x25493c, { roughness: 0.6, metalness: 0.2, seed: 7 });
    b.box(1.8, 0.95, 3.2, wood, { pos: [x, P + 0.47, z], radius: 0.02 });
    b.box(1.95, 0.06, 3.35, steel, { pos: [x, P + 0.98, z], radius: 0.02 });
    b.box(0.3, 2.2, 3.2, wood, { pos: [x + 0.88, P + 1.1, z] });
    for (let i = 0; i < 3; i++) b.box(0.36, 0.05, 3.1, wood, { pos: [x + 0.72, P + 0.72 + i * 0.55, z] });
    for (let i = 0; i < 6; i++) {
      const jz = z - 1.15 + i * 0.46;
      b.cyl(0.09, 0.09, 0.24, mats.glass(0xe2d6b8, 0.5, 0.12), { pos: [x + 0.67, P + 1.2 + (i % 2) * 0.56, jz], seg: 12, castShadow: false });
      b.cyl(0.07, 0.07, 0.17, mats.painted(i % 2 ? 0xbc8b3f : 0x7b3f28, { seed: 4 }), { pos: [x + 0.67, P + 1.15 + (i % 2) * 0.56, jz], seg: 10 });
    }
    addKettle(b, mats, x - 0.3, P + 1.14, z + 0.2, 1.35);
    addCups(b, mats, x - 0.15, P + 1.08, z - 0.7, 8);
    b.box(0.55, 0.12, 0.55, mats.blackMetal, { pos: [x + 0.1, P + 1.08, z + 1.2] });
    b.cyl(0.2, 0.17, 0.27, steel, { pos: [x + 0.1, P + 1.27, z + 1.2], seg: 14 });
    b.cyl(0.16, 0.16, 0.02, mats.painted(0x4d3322, { seed: 5 }), { pos: [x + 0.1, P + 1.42, z + 1.2], seg: 14 });
    b.cyl(0.16, 0.16, 0.6, mats.painted(0x9f352d, { roughness: 0.5, seed: 9 }), { pos: [x + 0.45, P + 0.3, z + 1.42], seg: 14 });
    b.cyl(0.04, 0.04, 0.08, mats.brass, { pos: [x + 0.45, P + 0.64, z + 1.42], seg: 8 });
    // canopy frame and striped awning
    for (const dz of [-1.6, 1.6]) {
      b.cyl(0.03, 0.03, 2.4, mats.metal(0x6f7472, 0.4, 0.7), { pos: [x - 0.9, P + 1.2, z + dz], seg: 8 });
      b.cyl(0.03, 0.03, 2.4, mats.metal(0x6f7472, 0.4, 0.7), { pos: [x + 0.95, P + 1.2, z + dz], seg: 8 });
    }
    b.box(2.4, 0.06, 3.65, mats.painted(0x2f4b52, { roughness: 0.7, seed: 14 }), { pos: [x + 0.02, P + 2.42, z] });
    for (let i = 0; i < 7; i++) {
      b.box(0.34, 0.05, 3.65, i % 2 ? mats.painted(0xe3dcc8, { seed: 3 }) : mats.painted(0x2f5d69, { seed: 3 }), { pos: [x - 1.05 + i * 0.34, P + 2.47, z], rot: [0, 0, 0.02] });
    }
    const menu = boardMesh(tex.chaiBoard(), 0.86, 0.86);
    menu.position.set(x + 0.9, P + 1.95, z - 0.1);
    menu.rotation.y = -Math.PI / 2;
    scene.add(menu);
    b.tube([[x, P + 2.32, z], [x - 0.2, P + 2.16, z], [x - 0.25, P + 1.98, z]], 0.008, mats.blackMetal);
    b.sphere(0.05, mats.emissive(0xffc37a, 3.0, 0x1a120a), { pos: [x - 0.25, P + 1.95, z], seg: 8, castShadow: false });
    const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc37a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 }));
    bulbGlow.scale.setScalar(0.6);
    bulbGlow.position.set(x - 0.25, P + 1.95, z);
    scene.add(bulbGlow);
    animated.teaSteam = new THREE.Vector3(x - 0.3, P + 1.5, z + 0.2);
    // crates of cups and bottles
    b.box(0.5, 0.35, 0.6, mats.painted(0x9b5a32, { roughness: 0.85, seed: 4 }), { pos: [x - 0.95, P + 0.18, z + 1.0], rot: [0, 0.1, 0] });
  }

  // ------------------------------------------------------------- snacks & fruit stalls
  {
    const x = 13.9, z = -72.2;
    const darkWood = mats.wood([1, 1], 0x4a3220);
    const enamel = mats.painted(0x24463b, { roughness: 0.52, metalness: 0.14, seed: 21, variation: 0.6 });
    const cream = mats.painted(0xd8cdb0, { roughness: 0.62, seed: 4 });
    const rustRed = mats.painted(0x8c3a30, { roughness: 0.78, seed: 5 });

    // counter carcass: framed enamel front, wore timber end, kick plate
    b.box(1.6, 0.92, 2.8, darkWood, { pos: [x, P + 0.46, z] });
    b.box(1.75, 0.06, 2.95, mats.metal(0x9a9e9a, 0.5, 0.7), { pos: [x, P + 0.95, z] });
    b.box(0.03, 0.66, 2.5, enamel, { pos: [x - 0.8, P + 0.49, z], castShadow: false });
    b.box(0.035, 0.09, 2.56, cream, { pos: [x - 0.805, P + 0.8, z], castShadow: false });
    b.box(0.035, 0.05, 2.56, cream, { pos: [x - 0.805, P + 0.3, z], castShadow: false });
    for (const dz of [-1.24, -0.42, 0.42, 1.24]) {
      b.box(0.04, 0.7, 0.07, darkWood, { pos: [x - 0.807, P + 0.49, z + dz], castShadow: false });
    }
    b.box(0.045, 0.12, 2.72, mats.metal(0x4a4f4c, 0.5, 0.4), { pos: [x - 0.81, P + 0.08, z] });
    // near end panel, facing the hero camera
    b.box(1.6, 0.7, 0.03, enamel, { pos: [x, P + 0.48, z - 1.41], castShadow: false });
    b.box(1.66, 0.07, 0.035, cream, { pos: [x, P + 0.79, z - 1.412], castShadow: false });
    const ad = boardMesh(tex.label({ w: 900, h: 380, text: 'CHAI  ·  SAMOSA', hi: 'चाय-समोसा', bg: '#1f3d33', color: '#f2e3c0', subColor: '#d9b98a', size: 64, subSize: 30, weight: 800, letterSpacing: 1.5 }), 1.16, 0.49);
    ad.position.set(x, P + 0.46, z - 1.425);
    ad.rotation.y = Math.PI;
    scene.add(ad);

    // stacked namkeen packets on the counter
    const packetCols = [0xc98a32, 0x9c3a30, 0x2f5e78, 0x4d7040, 0xd7c29a];
    for (let i = 0; i < 9; i++) {
      const pz = z - 1.18 + i * 0.21;
      const px = x - 0.45 + (i % 2) * 0.3;
      b.box(0.09, 0.17, 0.19, mats.painted(pick(mulberry32(500 + i), packetCols), { seed: i }), {
        pos: [px, P + 1.11 + (i % 3) * 0.01, pz], rot: [0, 0.06 * (i % 3), 0.02],
      });
    }

    // dusty canvas awning on two steel poles. The canvas is a solid weathered
    // maroon; only the valance carries the classic stripe, so the canopy reads
    // as fabric instead of a candy-striped tabletop from the arrival camera.
    const awningCream = mats.painted(0xb9ab8c, { roughness: 0.95, seed: 9, variation: 1.1 });
    const awningRed = mats.painted(0x7d352c, { roughness: 0.95, seed: 10, variation: 1.1 });
    const canvas = mats.painted(0x8a4238, { roughness: 0.96, seed: 12, variation: 1.3 });
    b.box(1.9, 0.05, 3.12, canvas, { pos: [x, P + 2.2, z], rot: [0, 0, 0.035] });
    // seams and ribs under the canvas
    for (const dz of [-1.02, 0, 1.02]) {
      b.box(1.92, 0.012, 0.03, mats.painted(0x6b3129, { roughness: 0.95, seed: 5 }), {
        pos: [x, P + 2.222, z + dz], rot: [0, 0, 0.035], castShadow: false,
      });
      b.cyl(0.018, 0.018, 1.94, mats.metal(0x6f7472, 0.4, 0.7), {
        pos: [x, P + 2.168, z + dz], rot: [0, 0, Math.PI / 2 + 0.035], seg: 6, castShadow: false,
      });
    }
    for (let i = 0; i < 24; i++) {
      const sz = z - 1.5 + 0.064 + i * 0.1275;
      const stripe = i % 2 ? awningCream : awningRed;
      b.box(0.018, 0.15, 0.1225, stripe, { pos: [x - 0.95, P + 2.12, sz], castShadow: false });
      b.box(0.018, 0.12, 0.1225, stripe, { pos: [x + 0.95, P + 2.14, sz], castShadow: false });
    }
    for (let i = 0; i < 16; i++) {
      const sx = x - 0.86 + i * 0.115;
      const stripe = i % 2 ? awningCream : awningRed;
      for (const ez of [-1.55, 1.55]) {
        b.box(0.115, 0.14, 0.018, stripe, { pos: [sx, P + 2.125, z + ez], castShadow: false });
      }
    }
    for (const dz of [-1.45, 1.45]) {
      b.cyl(0.024, 0.03, 2.2, mats.metal(0x6f7472, 0.4, 0.7), { pos: [x - 0.86, P + 1.1, z + dz], seg: 8 });
    }
    animated.teaSteam2 = new THREE.Vector3(x, P + 1.4, z);
    // glass snack case, jars and stacked packets on the counter
    b.box(0.5, 0.42, 1.1, mats.glass(0xdfe7e2, 0.28, 0.08), { pos: [x - 0.42, P + 1.24, z - 0.55], castShadow: false });
    b.box(0.54, 0.06, 1.14, mats.metal(0xb9bdbb, 0.35, 0.8), { pos: [x - 0.42, P + 1.03, z - 0.55] });
    for (let i = 0; i < 5; i++) {
      b.box(0.16, 0.1, 0.26, mats.painted(pick(mulberry32(300 + i), [0xd9a13d, 0xc2453a, 0x4f7d4a, 0xe4d8bc]), { seed: i + 1 }), {
        pos: [x - 0.42, P + 1.09, z - 0.95 + i * 0.2], rot: [0, 0.1 * i, 0],
      });
    }
    for (let i = 0; i < 3; i++) {
      const jz = z + 0.65 + i * 0.32;
      b.cyl(0.13, 0.13, 0.3, mats.glass(0xd8c9a6, 0.45, 0.1), { pos: [x - 0.3, P + 1.16, jz], seg: 12, castShadow: false });
      b.cyl(0.135, 0.135, 0.04, mats.metal(0x7d7f7b, 0.5, 0.8), { pos: [x - 0.3, P + 1.33, jz], seg: 12 });
      b.cyl(0.09, 0.09, 0.02, mats.painted(pick(mulberry32(320 + i), [0x8b3a2c, 0xb58b3a, 0x3f6b4a]), { seed: i }), { pos: [x - 0.3, P + 1.33, jz], seg: 10 });
    }
    b.box(0.3, 0.18, 0.42, mats.metal(0x8b8f8c, 0.4, 0.7), { pos: [x + 0.42, P + 1.09, z + 0.1], rot: [0, 0.1, 0] });
    b.box(0.16, 0.05, 0.16, mats.painted(0x2f2b25, { seed: 4 }), { pos: [x + 0.42, P + 1.2, z + 0.1] });
    // snack packets on a hook rail behind the counter
    b.cyl(0.01, 0.01, 2.3, mats.metal(0x6f7472, 0.4, 0.7), { pos: [x + 0.72, P + 2.02, z], rot: [Math.PI / 2, 0, 0], seg: 6, castShadow: false });
    for (let i = 0; i < 8; i++) {
      const pz = z - 1.15 + i * 0.29;
      const top = P + 2.02 - (i % 3) * 0.06;
      const len = 0.14 + (i % 4) * 0.055;
      b.box(0.008, len, 0.008, mats.blackMetal, { pos: [x + 0.72, top - len / 2, pz], castShadow: false });
      b.box(0.035, 0.23, 0.15, mats.painted(pick(mulberry32(340 + i), [0xc9a23f, 0xa8423a, 0x33708c, 0xd9c9a0]), { seed: i }), {
        pos: [x + 0.72, top - len - 0.11, pz], rot: [0, 0.1, 0],
      });
    }
    const sign = boardMesh(tex.label({ w: 900, h: 240, text: 'SNACKS & NAMKEEN', hi: 'नमकीन', bg: '#6e251d', color: '#f7e7c7', subColor: '#e8bfa0', size: 62, subSize: 26, weight: 800, letterSpacing: 1 }), 1.5, 0.4);
    sign.position.set(x - 0.94, P + 1.9, z);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);

    // warm bulb under the awning so the near end of the counter is not a
    // black hole in the foreground
    const bulb = mats.emissive(0xffd7a6, 1.9, 0x2a2118);
    b.tube([[x - 0.55, P + 2.38, z + 1.12], [x - 0.55, P + 2.12, z + 1.12]], 0.007, mats.blackMetal);
    b.sphere(0.055, bulb, { pos: [x - 0.55, P + 2.09, z + 1.12], seg: 8, castShadow: false });
    b.cyl(0.1, 0.13, 0.05, mats.metal(0x5d615d, 0.4, 0.6), { pos: [x - 0.55, P + 2.14, z + 1.12], seg: 10, castShadow: false });
    const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc37a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.24 }));
    bulbGlow.scale.setScalar(0.55);
    bulbGlow.position.set(x - 0.55, P + 2.09, z + 1.12);
    scene.add(bulbGlow);
    animated.snackGlow = bulbGlow;

    // crate stack and empties at the near end of the stall
    const crate = mats.wood([1, 1], 0x8a6339);
    for (let i = 0; i < 3; i++) {
      b.box(0.42, 0.24, 0.34, crate, { pos: [x - 0.14 + (i % 2) * 0.06, P + 0.12 + i * 0.245, z + 1.32], rot: [0, 0.06 * i, 0], radius: 0.01 });
      b.box(0.34, 0.03, 0.03, mats.painted(0x3f2b1a, { seed: 4 }), { pos: [x - 0.14 + (i % 2) * 0.06, P + 0.21 + i * 0.245, z + 1.49] });
    }
    const bottleCols = [0x6d7f3c, 0xb98a3a, 0x6d7f3c, 0x8a5a2e];
    for (let i = 0; i < 7; i++) {
      const bx = x - 0.42 + (i % 4) * 0.085;
      const bz = z + 1.22 + Math.floor(i / 4) * 0.1;
      b.cyl(0.032, 0.034, 0.23, mats.glass(bottleCols[i % 4], 0.24, 0.12), { pos: [bx, P + 0.88, bz], seg: 8, castShadow: false });
      b.cyl(0.012, 0.012, 0.06, mats.glass(bottleCols[i % 4], 0.24, 0.12), { pos: [bx, P + 1.02, bz], seg: 6, castShadow: false });
    }
  }
  {
    // fruit cart
    const x = 12.0, z = -30.4;
    const wood = mats.wood([2, 1], 0x7a5b3c);
    b.box(1.2, 0.1, 2.0, wood, { pos: [x, P + 0.75, z] });
    for (const dz of [-0.8, 0.8]) {
      b.cyl(0.3, 0.3, 0.08, mats.rubber, { pos: [x - 0.5, P + 0.32, z + dz], rot: [0, 0, Math.PI / 2], seg: 12 });
      b.cyl(0.3, 0.3, 0.08, mats.rubber, { pos: [x + 0.5, P + 0.32, z + dz], rot: [0, 0, Math.PI / 2], seg: 12 });
      b.box(0.06, 0.55, 0.06, mats.metal(0x7c8180, 0.4, 0.7), { pos: [x + 0.5, P + 0.42, z + dz] });
    }
    b.box(1.3, 0.05, 2.1, mats.painted(0xd9b23f, { seed: 5 }), { pos: [x, P + 0.83, z], rot: [0, 0, -0.12] });
    const rng = mulberry32(44);
    for (let i = 0; i < 26; i++) {
      b.sphere(0.07, mats.painted(pick(rng, [0xe29a2f, 0xd86a2b, 0xb8b447, 0x8a9d43]), { roughness: 0.55, seed: i }), {
        pos: [x + rr(rng, -0.4, 0.4), P + 0.98 + (i > 16 ? 0.1 : 0), z + rr(rng, -0.8, 0.8)], seg: 8, castShadow: false,
      });
    }
    b.box(0.9, 0.05, 0.4, mats.painted(0x3d2c1d, { seed: 4 }), { pos: [x, P + 1.5, z], rot: [0.2, 0, 0] });
    const sign = boardMesh(tex.label({ w: 700, h: 250, text: 'FRESH FRUIT', hi: 'ताज़ा फल', bg: '#54401d', color: '#f6e7b2', subColor: '#e6c98a', size: 58, subSize: 26, weight: 800, letterSpacing: 1 }), 0.8, 0.28);
    sign.position.set(x, P + 1.7, z);
    scene.add(sign);
  }

  // ------------------------------------------------------------- book stall
  {
    const x = 14.2, z = 8.0;
    const wood = mats.wood([2, 2], 0x6b4d30);
    b.box(0.45, 2.0, 3.2, wood, { pos: [x + 0.65, P + 1.0, z] });
    for (let i = 0; i < 3; i++) {
      b.box(0.5, 0.05, 3.0, wood, { pos: [x + 0.55, P + 0.55 + i * 0.55, z] });
      const rng = mulberry32(50 + i);
      for (let j = 0; j < 12; j++) {
        b.box(0.08, 0.22, rr(rng, 0.16, 0.25), mats.painted(pick(rng, [0xc0392b, 0x2c6f8e, 0xd8b451, 0x527a4d, 0x8e4770]), { seed: j + 1 }), {
          pos: [x + 0.42, P + 0.71 + i * 0.55, z - 1.3 + j * 0.23], rot: [0, 0, 0.05],
        });
      }
    }
    b.box(1.1, 0.05, 3.2, mats.painted(0x3a5d63, { seed: 4 }), { pos: [x + 0.2, P + 2.25, z], rot: [0, 0, 0.06] });
    const sign = boardMesh(tex.label({ w: 900, h: 200, text: 'BOOKS & NEWS', bg: '#2e2118', color: '#e8d6b2', size: 74, weight: 700, letterSpacing: 2 }), 1.4, 0.32);
    sign.position.set(x + 0.25, P + 2.02, z);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);
  }

  // ------------------------------------------------------------- queue barriers at booking office
  {
    const steel = mats.metal(0x9aa09e, 0.35, 0.75);
    for (let i = 0; i < 4; i++) {
      const z = -22.5 + i * 1.35;
      for (const x of [13.4, 15.4]) b.cyl(0.035, 0.05, 1.1, steel, { pos: [x, P + 0.55, z], seg: 8 });
      b.box(2.0, 0.06, 0.06, mats.painted(0x7b2e2e, { roughness: 0.55, seed: 4 }), { pos: [14.4, P + 1.0, z] });
      b.box(2.0, 0.035, 0.035, steel, { pos: [14.4, P + 0.55, z] });
    }
  }

  // ------------------------------------------------------------- ATM / charging kiosk
  {
    const x = 15.0, z = -12.0;
    const blue = mats.painted(0x1d4d75, { roughness: 0.55, metalness: 0.2, seed: 6 });
    b.box(0.95, 2.3, 1.35, blue, { pos: [x + 0.2, P + 1.15, z], radius: 0.03 });
    b.box(0.06, 0.8, 0.8, mats.emissive(0x9fd8ff, 0.35, 0x101820), { pos: [x - 0.3, P + 1.55, z], castShadow: false });
    b.box(0.1, 0.3, 0.6, mats.metal(0x2d3233, 0.4, 0.7), { pos: [x - 0.32, P + 1.05, z] });
    const sign = boardMesh(tex.label({ w: 800, h: 260, text: 'ATM', hi: 'एटीएम', bg: '#173e5d', color: '#f2f0e6', subColor: '#c9d9d7', size: 96, subSize: 30, weight: 800, letterSpacing: 2 }), 0.9, 0.34);
    sign.position.set(x - 0.35, P + 2.45, z);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);
  }

  // ------------------------------------------------------------- fire points / extinguishers
  for (const z of [-62, -8, 36]) {
    b.cyl(0.13, 0.13, 0.55, mats.painted(0xa4322a, { roughness: 0.5, seed: 6 }), { pos: [16.35, P + 0.85, z], seg: 12 });
    b.cyl(0.04, 0.04, 0.15, mats.blackMetal, { pos: [16.35, P + 1.2, z], seg: 8 });
    b.box(0.08, 0.5, 0.5, mats.painted(0xd8d2c4, { seed: 2 }), { pos: [16.45, P + 0.8, z], castShadow: false });
  }

  // ------------------------------------------------------------- ceiling fans under the canopy
  const fanZ = [-86, -68, -50, -32, -14, 4, 22, 40, 58];
  for (let i = 0; i < fanZ.length; i++) {
    const z = fanZ[i];
    const x = i % 2 ? 8.4 : 12.8;
    const fan = new THREE.Group();
    const rodMat = mats.metal(0x626766, 0.5, 0.7);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), rodMat);
    rod.position.y = 0.65; fan.add(rod);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 12), mats.painted(0xddddcf, { seed: 5 }));
    fan.add(hub);
    for (let k = 0; k < 3; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.015, 0.15), mats.painted(0xcfd1c4, { seed: 5, roughness: 0.6 }));
      blade.position.x = 0.38;
      blade.rotation.z = 0.12;
      const pivot = new THREE.Group();
      pivot.rotation.y = (k / 3) * TAU;
      pivot.add(blade);
      fan.add(pivot);
    }
    fan.position.set(x, P + 4.55, z);
    fan.userData.dynamic = true;
    scene.add(fan);
    animated.fans.push(fan);
  }

  // ------------------------------------------------------------- litter
  {
    const rng = mulberry32(66);
    const paper = mats.painted(0xd7cbb2, { roughness: 0.95, seed: 6 });
    const bottle = mats.glass(0x386b87, 0.35, 0.2);
    for (let i = 0; i < 42; i++) {
      const x = rr(rng, 3.0, 15.5), z = rr(rng, -92, 60);
      if (rng() > 0.6) {
        b.box(rr(rng, 0.06, 0.18), 0.006, rr(rng, 0.06, 0.24), paper, { pos: [x, P + 0.005, z], rot: [0, rng() * 3, 0], castShadow: false });
      } else {
        b.cyl(0.025, 0.028, 0.15, bottle, { pos: [x, P + 0.075, z], rot: [0, 0, Math.PI / 2], seg: 8, castShadow: false });
      }
    }
  }

  // ------------------------------------------------------------- pigeons
  {
    const rng = mulberry32(700);
    for (let i = 0; i < 12; i++) {
      const x = rr(rng, 3.4, 15.6), z = rr(rng, -90, 58);
      const body = mats.painted(pick(rng, [0x7c7f82, 0x8a857c, 0x6c6f75]), { roughness: 0.8, seed: i });
      b.sphere(0.07, body, { pos: [x, P + 0.08, z], scale: [1, 0.9, 1.3], seg: 8, castShadow: false });
      b.sphere(0.038, body, { pos: [x, P + 0.14, z + 0.08], seg: 6, castShadow: false });
      b.box(0.02, 0.05, 0.03, mats.painted(0x333638, { seed: 2 }), { pos: [x, P + 0.035, z], castShadow: false });
    }
  }

  const group = b.build(scene, 'props');

  return {
    group,
    animated,
    lampPositions: animated.lampPositions,
    teaSteam: animated.teaSteam,
  };
}

function makeClockFace() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9ddc2'; ctx.beginPath(); ctx.arc(256, 256, 248, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1d1b17'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(256, 256, 230, 0, TAU); ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const big = i % 5 === 0;
    ctx.strokeStyle = '#23201a'; ctx.lineWidth = big ? 7 : 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * (big ? 188 : 204), 256 + Math.sin(a) * (big ? 188 : 204));
    ctx.lineTo(256 + Math.cos(a) * 220, 256 + Math.sin(a) * 220);
    ctx.stroke();
  }
  ctx.fillStyle = '#211d17'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 46px Georgia, serif';
  const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  nums.forEach((n, i) => {
    const a = (i / 12) * TAU - Math.PI / 2;
    ctx.fillText(n, 256 + Math.cos(a) * 160, 256 + Math.sin(a) * 160);
  });
  ctx.font = '500 22px "Manrope", sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('BHARAT NAGAR', 256, 336);
  ctx.font = '400 15px "Manrope", sans-serif';
  ctx.fillStyle = '#675c47';
  ctx.fillText('IR · W.RLY', 256, 366);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
