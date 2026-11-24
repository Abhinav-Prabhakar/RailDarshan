import * as THREE from 'three';
import {
  MeshBatch, mulberry32, rr, TAU, clamp, makeCanvas, canvasTexture,
} from '../core/util.js';

const L = 20;
const HW = 1.5;
const CEIL = 2.26;
const FLOOR = 0;
const WINDOW_Y = 1.32;
const WINDOW_H = 0.8;
const WINDOW_W = 1.34;
const PITCH = 1.88;

const col = (s) => (typeof s === 'number' ? s : new THREE.Color(s).getHex());

let _viewTextures = null;
let _foregroundTextures = null;
export function windowViews(tex) {
  if (_viewTextures) return _viewTextures;
  _viewTextures = {};
  _foregroundTextures = {};
  for (const mood of ['golden', 'noon', 'blue', 'night', 'monsoon']) {
    const t = tex.windowView(mood);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(3.2, 1);
    _viewTextures[mood] = t;
    const f = tex.windowForeground(mood);
    f.wrapS = THREE.RepeatWrapping;
    f.wrapT = THREE.ClampToEdgeWrapping;
    f.repeat.set(2.4, 1);
    _foregroundTextures[mood] = f;
  }
  return _viewTextures;
}

function glowTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,247,225,.95)');
  g.addColorStop(0.25, 'rgba(255,228,175,.4)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

let _glow = null;
function dustTexture() {
  if (_glow) return _glow;
  _glow = glowTexture();
  return _glow;
}

function waveGeometry(w, h, amp = 0.035, segs = 14) {
  const geo = new THREE.PlaneGeometry(w, h, segs, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(x * 16) * amp);
  }
  geo.computeVertexNormals();
  return geo;
}

const PALETTES = {
  vande: {
    wall: '#e7e4da', upper: '#dddcd4', ceiling: '#efede5', floor: '#343a41', runner: '#22303f',
    seat: '#3c5a78', seatTrim: '#c9cdc8', head: '#eee9dc', wood: '#5c5140', metal: '#b9b7ad',
    curtain: null, carpet: '#2c3138',
  },
  shatabdi: {
    wall: '#e3ddd0', upper: '#d7d0c2', ceiling: '#ece7da', floor: '#4a443b', runner: '#2c4053',
    seat: '#365a78', seatTrim: '#c4b9a4', head: '#e3dac7', wood: '#5a4a38', metal: '#b7b4a9',
    curtain: '#3f5c72', carpet: '#3b3b34',
  },
  tejas: {
    wall: '#efe4cc', upper: '#e4d5b9', ceiling: '#f1e8d6', floor: '#4b392b', runner: '#6a2c26',
    seat: '#c08a2e', seatTrim: '#3b2c1d', head: '#f0dfb7', wood: '#6a4b2d', metal: '#c9b98f',
    curtain: '#7b3430', carpet: '#443226',
  },
  rajdhani: {
    wall: '#e5dccb', upper: '#d9cfbc', ceiling: '#ece4d6', floor: '#3e2e22', runner: '#6b2322',
    seat: '#2e4766', seatTrim: '#c6b089', head: '#e9ddc6', wood: '#6a432c', metal: '#c2b18e',
    curtain: '#8e2a29', carpet: '#3d2c22',
  },
  duronto: {
    wall: '#dfd8c8', upper: '#d2c9b7', ceiling: '#e9e1d1', floor: '#363b33', runner: '#31573e',
    seat: '#385943', seatTrim: '#d2b45a', head: '#e7ddc3', wood: '#584734', metal: '#b8b3a2',
    curtain: '#3f684b', carpet: '#33382f',
  },
  garib: {
    wall: '#dfe3da', upper: '#d2d8cd', ceiling: '#ecefe7', floor: '#37413a', runner: '#2e5c3a',
    seat: '#2c6b43', seatTrim: '#e2c862', head: '#e8e6d2', wood: '#4e4a36', metal: '#bcc0b4',
    curtain: '#39784e', carpet: '#343d36',
  },
  golden: {
    wall: '#e1d6c2', upper: '#d4c6ae', ceiling: '#e9dfcd', floor: '#3a3128', runner: '#203d5b',
    seat: '#2a4560', seatTrim: '#c2a86e', head: '#e7dcc5', wood: '#5c432c', metal: '#b8ae96',
    curtain: '#264b6e', carpet: '#35322b',
  },
  maharaja: {
    wall: '#ecdfc9', upper: '#dcc9a9', ceiling: '#f0e7d4', floor: '#4c3124', runner: '#6a2530',
    seat: '#7a3543', seatTrim: '#d3b273', head: '#f0e0c2', wood: '#8a5a38', metal: '#d2ab63',
    curtain: '#7d2e39', carpet: '#512a21',
  },
  humsafar: {
    wall: '#ddd8cc', upper: '#cfc9bc', ceiling: '#e8e3d8', floor: '#3b3b37', runner: '#6b6433',
    seat: '#595c53', seatTrim: '#d0b654', head: '#e8e2d1', wood: '#4e4736', metal: '#b6b2a5',
    curtain: '#77713f', carpet: '#363630',
  },
  amrit: {
    wall: '#e6ddd1', upper: '#d8ccbe', ceiling: '#eee5da', floor: '#3d322e', runner: '#7b3425',
    seat: '#7a3027', seatTrim: '#d8cbb5', head: '#e9dfcf', wood: '#543c2d', metal: '#bbb2a2',
    curtain: '#8b3a2c', carpet: '#392d28',
  },
  emu: {
    wall: '#dfdccf', upper: '#d0cdc0', ceiling: '#e9e6dc', floor: '#6c6a61', runner: '#56574f',
    seat: '#4b6d8b', seatTrim: '#b3b0a2', head: '#dbd8ca', wood: '#6d6047', metal: '#aeb0ab',
    curtain: null, carpet: null,
  },
  heritage: {
    wall: '#e4d8bd', upper: '#d2c3a6', ceiling: '#ece2cd', floor: '#443226', runner: '#233f56',
    seat: '#6b3a33', seatTrim: '#c7a25d', head: '#e8d9b9', wood: '#5d3d27', metal: '#c6b184',
    curtain: '#284b68', carpet: '#3b2d22',
  },
  double: {
    wall: '#e8e0d1', upper: '#dad0bd', ceiling: '#f0e9dc', floor: '#3d3a33', runner: '#26445f',
    seat: '#3a5c7c', seatTrim: '#c9b88f', head: '#ece3d1', wood: '#5c4933', metal: '#b8b3a6',
    curtain: '#3a5c79', carpet: '#34342f',
  },
  namo: {
    wall: '#ecebe5', upper: '#e1dfd7', ceiling: '#f4f2ec', floor: '#42474c', runner: '#2c3742',
    seat: '#3b5268', seatTrim: '#c8c2b5', head: '#eae6dc', wood: '#514d42', metal: '#c2c3bd',
    curtain: null, carpet: '#383d42',
  },
};

function paletteFor(key) { return { ...(PALETTES[key] || PALETTES.rajdhani) }; }

export function buildInterior(tex, mats, def, { mood = 'golden', envTex = null, renderer = null } = {}) {
  const scene = new THREE.Scene();
  scene.name = `interior-${def.id}`;
  scene.background = new THREE.Color(0x0a0c0e);
  if (envTex) {
    scene.environment = envTex;
    scene.environmentIntensity = 0.28;
  }

  const layout = def.interior || 'rajdhani';
  const pal = paletteFor(layout);
  const b = new MeshBatch(`interior-${layout}`);
  const rng = mulberry32(42 + def.name.length);
  const group = new THREE.Group();
  const overlays = [];
  const animated = { fans: [], lamps: [], screens: [] };

  // ---------------------------------------------------------------- materials
  const wallMat = mats.painted(col(pal.wall), { roughness: 0.93, metalness: 0, clearcoat: 0.0, seed: 3, variation: 0.5 });
  const upperMat = mats.painted(col(pal.upper), { roughness: 0.9, metalness: 0, clearcoat: 0.0, seed: 4, variation: 0.5 });
  const ceilMat = mats.painted(col(pal.ceiling), { roughness: 0.86, metalness: 0, clearcoat: 0.02, seed: 5, variation: 0.35 });
  ceilMat.emissive = new THREE.Color(0xffeed6);
  ceilMat.emissiveIntensity = 0.16;
  const floorMat = pal.carpet
    ? mats.carpet(col(pal.carpet), [4, 24])
    : mats.photo('concrete', { repeat: [2, 12], color: col(pal.floor), normalScale: 0.25, roughness: 1 });
  const runnerMat = mats.carpet(col(pal.runner), [2, 22]);
  const woodMat = mats.wood([1.5, 6], col(pal.wood));
  const metalMat = mats.metal(col(pal.metal), 0.32, 0.78);
  const darkMetal = mats.painted(0x2f3231, { roughness: 0.48, metalness: 0.55, seed: 6 });
  const seatMat = mats.fabric(col(pal.seat), [4, 4]);
  const trimMat = mats.leather(col(pal.seatTrim), [1.5, 1.5]);
  const headMat = mats.fabric(col(pal.head), [3, 3]);
  const curtainMat = pal.curtain
    ? mats.fabric(col(pal.curtain), [2, 2])
    : null;
  const brassMat = mats.brass;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xc2ced2, metalness: 0.0, roughness: 0.04, transparent: true, opacity: 0.075,
    envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  });
  const screenMat = new THREE.MeshBasicMaterial({ map: tex.routeScreen(routeFrom(def), routeTo(def), 0.44), toneMapped: true });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2d2, emissive: 0xffd9a0, emissiveIntensity: 1.25, roughness: 0.4,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6, emissive: 0xfff0ce, emissiveIntensity: 1.55, roughness: 0.35,
  });

  // ---------------------------------------------------------------- shell
  // floor + runners
  b.box(HW * 2 - 0.04, 0.06, L, floorMat, { pos: [0, FLOOR - 0.03, 0], castShadow: false, receiveShadow: true });
  if (pal.carpet) {
    b.box(0.84, 0.008, L - 1.2, runnerMat, { pos: [0, 0.004, 0], castShadow: false, receiveShadow: true });
  }
  // threshold plates
  for (const z of [-L / 2 + 0.3, L / 2 - 0.3]) {
    b.box(HW * 2 - 0.2, 0.02, 0.18, metalMat, { pos: [0, 0.006, z], castShadow: false });
  }

  // ceiling + covariants
  b.box(1.7, 0.045, L - 0.16, ceilMat, { pos: [0, CEIL, 0], castShadow: false, receiveShadow: true });
  for (const s of [-1, 1]) {
    b.box(0.66, 0.035, L - 0.16, ceilMat, { pos: [s * 1.17, CEIL - 0.055, 0], rot: [0, 0, s * 0.12], castShadow: false, receiveShadow: true });
    // continuous LED strip in the cove
    b.box(0.032, 0.016, L - 2.4, ledMat, { pos: [s * 0.79, CEIL - 0.045, 0], castShadow: false });
    b.box(0.085, 0.038, L - 2.2, mats.painted(0xcdc6b7, { seed: 8 }), { pos: [s * 0.85, CEIL - 0.062, 0], castShadow: false });
  }
  // air-conditioning diffusers
  for (const z of [-7.4, -3.6, 0.2, 4.0, 7.6]) {
    b.box(1.34, 0.05, 0.32, darkMetal, { pos: [0, CEIL - 0.035, z], castShadow: false });
    for (let i = 0; i < 7; i++) b.box(0.08, 0.02, 0.26, mats.painted(0x7d817f, { seed: 3 }), { pos: [-0.54 + i * 0.18, CEIL - 0.062, z], castShadow: false });
  }
  // speaker grilles
  for (const z of [-6.8, 6.8]) {
    b.cyl(0.11, 0.11, 0.02, darkMetal, { pos: [0, CEIL - 0.03, z], seg: 14, castShadow: false });
  }

  // side walls with window openings
  const windows = [];
  for (let z = -8.2; z <= 8.2; z += PITCH) windows.push(z);
  for (const s of [-1, 1]) {
    b.box(0.055, 0.94, L - 0.1, wallMat, { pos: [s * (HW - 0.035), 0.47, 0], castShadow: false, receiveShadow: true });
    b.box(0.055, CEIL - 1.78, L - 0.1, upperMat, { pos: [s * (HW - 0.035), (CEIL + 1.78) / 2, 0], castShadow: false, receiveShadow: true });
    // a painted waist strip
    if (layout !== 'emu') {
      b.box(0.062, 0.055, L - 0.4, woodMat, { pos: [s * (HW - 0.03), 0.955, 0], castShadow: false });
    }
    // window pillars
    const pillars = [];
    for (let i = 0; i < windows.length - 1; i++) pillars.push((windows[i] + windows[i + 1]) / 2);
    pillars.push(-L / 2 + 0.45, L / 2 - 0.45);
    for (const z of pillars) {
      b.box(0.07, WINDOW_H + 0.16, 0.21, upperMat, { pos: [s * (HW - 0.03), WINDOW_Y, z], castShadow: true, receiveShadow: true });
      if (layout !== 'emu') b.box(0.05, WINDOW_H + 0.05, 0.03, woodMat, { pos: [s * (HW - 0.075), WINDOW_Y, z - 0.085], castShadow: false });
    }
    // frames, glass and sills per window
    windows.forEach((z, i) => {
      b.box(0.06, 0.04, WINDOW_W + 0.11, darkMetal, { pos: [s * (HW - 0.03), WINDOW_Y + WINDOW_H / 2 + 0.045, z], castShadow: false });
      b.box(0.06, 0.04, WINDOW_W + 0.11, darkMetal, { pos: [s * (HW - 0.03), WINDOW_Y - WINDOW_H / 2 - 0.045, z], castShadow: false });
      b.box(0.06, WINDOW_H + 0.1, 0.035, darkMetal, { pos: [s * (HW - 0.03), WINDOW_Y, z - WINDOW_W / 2 - 0.015], castShadow: false });
      b.box(0.06, WINDOW_H + 0.1, 0.035, darkMetal, { pos: [s * (HW - 0.03), WINDOW_Y, z + WINDOW_W / 2 + 0.015], castShadow: false });
      // central sash bar
      b.box(0.055, 0.018, WINDOW_W, darkMetal, { pos: [s * (HW - 0.032), WINDOW_Y + 0.03, z], castShadow: false });
      // glass
      b.add(new THREE.PlaneGeometry(WINDOW_W, WINDOW_H), glassMat, {
        pos: [s * (HW + 0.012), WINDOW_Y, z], rot: [0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0], castShadow: false, receiveShadow: false,
      });
      // sill
      b.box(0.16, 0.035, WINDOW_W + 0.22, layout === 'emu' ? metalMat : woodMat, { pos: [s * (HW - 0.1), 0.935, z], castShadow: false });
      if (curtainMat && i % 2 === 0) {
        const cg = waveGeometry(0.36, WINDOW_H + 0.35, 0.028);
        b.add(cg, curtainMat, {
          pos: [s * (HW - 0.115), WINDOW_Y + 0.11, z - WINDOW_W / 2 + 0.18],
          rot: [0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0], castShadow: false, receiveShadow: true,
        });
      }
      // small "do not lean out" enamel near alternate windows
      if (i === 2) {
        const t = tex.label({
          w: 512, h: 128, text: 'DO NOT LEAN OUT', bg: '#ece7d8', color: '#a33128',
          size: 39, weight: 700, letterSpacing: 1.1,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
        m.position.set(s * (HW - 0.09), 0.99, z + WINDOW_W / 2 + 0.2);
        m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        overlays.push(m);
      }
    });
  }

  // luggage racks (chair / heritage / emu)
  if (layout !== 'rajdhani' && layout !== 'duronto' && layout !== 'garib' && layout !== 'golden' && layout !== 'amrit' && layout !== 'humsafar' && layout !== 'maharaja') {
    for (const s of [-1, 1]) {
      b.box(0.48, 0.035, L - 2.6, new THREE.MeshPhysicalMaterial({
        color: 0xd8d8d0, metalness: 0.1, roughness: 0.18, transparent: true, opacity: 0.42,
        envMapIntensity: 0.8, side: THREE.DoubleSide,
      }), { pos: [s * 1.22, 1.94, 0], rot: [0, 0, s * 0.04], castShadow: false });
      for (let z = -8; z <= 8; z += 2) {
        b.box(0.035, 0.16, 0.03, metalMat, { pos: [s * 1.43, 1.87, z], castShadow: false });
        b.box(0.18, 0.03, 0.03, metalMat, { pos: [s * 1.35, 1.95, z], castShadow: false });
      }
      b.box(0.035, 0.035, L - 2.6, metalMat, { pos: [s * 1.46, 1.985, 0], castShadow: false });
    }
  }

  // end bulkheads with vestibule doors and route displays
  for (const dir of [-1, 1]) {
    const z = dir * (L / 2 - 0.02);
    // wall around a central door
    b.box(HW * 2 - 0.06, CEIL - 0.02, 0.07, upperMat, { pos: [0, CEIL / 2, z], castShadow: false, receiveShadow: true });
    b.box(0.09, 2.02, 0.12, darkMetal, { pos: [0, 1.01, z - dir * 0.05] });
    // door
    b.box(0.88, 1.98, 0.04, mats.painted(0x5e6462, { roughness: 0.45, metalness: 0.3, seed: 4 }), { pos: [0, 1.01, z - dir * 0.11] });
    b.box(0.64, 0.62, 0.02, glassMat, { pos: [0, 1.5, z - dir * 0.135] });
    b.box(0.78, 0.16, 0.03, metalMat, { pos: [0, 0.32, z - dir * 0.135], castShadow: false });
    // warm light beyond the door
    b.box(0.86, 1.9, 0.02, new THREE.MeshBasicMaterial({ color: 0x6f4d2b }), { pos: [0, 1.0, z + dir * 0.1], castShadow: false });
    b.add(new THREE.PlaneGeometry(0.62, 0.6), glassMat, { pos: [0, 1.5, z + dir * 0.12], rot: [0, dir > 0 ? Math.PI : 0, 0], castShadow: false });
    // route display above the door
    const pis = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), screenMat);
    pis.position.set(0, 2.09, z - dir * 0.055);
    pis.rotation.y = dir > 0 ? Math.PI : 0;
    overlays.push(pis);
    // coach identity plates
    const plate = tex.label({
      w: 700, h: 220, text: 'RDS 0921', sub: liveryName(layout), bg: '#f0ebdd', color: '#262a2c',
      size: 92, subSize: 31, weight: 700, letterSpacing: 2,
    });
    for (const s of [-1, 1]) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.17), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.6 }));
      pm.position.set(s * 0.94, 1.82, z - dir * 0.05);
      pm.rotation.y = dir > 0 ? Math.PI : 0;
      overlays.push(pm);
    }
  }

  // ---------------------------------------------------------------- layout
  if (layout === 'vande' || layout === 'shatabdi' || layout === 'tejas' || layout === 'double' || layout === 'namo') {
    buildChair(b, mats, { pal, seatMat, trimMat, headMat, woodMat, metalMat, darkMetal, ledMat, screenMat, overlays, layout, tex });
  } else if (layout === 'maharaja') {
    buildSuite(b, mats, { pal, wallMat, woodMat, brassMat, trimMat, seatMat, headMat, metalMat, lampMat, ceilMat, overlays, tex });
  } else if (layout === 'emu') {
    buildEmu(b, mats, { pal, seatMat, trimMat, metalMat, darkMetal, ledMat, ceilMat, animated, overlays, tex });
  } else if (layout === 'heritage') {
    buildHeritage(b, mats, { pal, wallMat, woodMat, brassMat, trimMat, seatMat, headMat, metalMat, lampMat, curtainMat, ceilMat, overlays, tex });
  } else {
    buildSleeper(b, mats, { pal, wallMat, seatMat, trimMat, headMat, woodMat, metalMat, darkMetal, curtainMat, lampMat, overlays, tex, layout });
  }

  // ---------------------------------------------------------------- window panorama
  const views = windowViews(tex);
  const outsideMats = [];
  for (const s of [-1, 1]) {
    const map = views[mood];
    const mat = new THREE.MeshBasicMaterial({
      map, color: 0xffffff, side: THREE.DoubleSide, toneMapped: true, fog: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(34, 4), mat);
    // horizon sits just below the window centre so fields, not sky, fill the view
    plane.position.set(s * (HW + 2.6), 1.54, 0);
    plane.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(plane);
    outsideMats.push(mat);
    // second, closer layer of foreground fields for depth
    const fg = _foregroundTextures[mood];
    const mat2 = new THREE.MeshBasicMaterial({
      map: fg, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: true, fog: false,
      depthWrite: false,
    });
    // hedges and fence sit at the sill, palms rise through the middle of the glass
    const plane2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.0), mat2);
    plane2.position.set(s * (HW + 0.9), 1.73, 0);
    plane2.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(plane2);
    outsideMats.push(mat2);
  }

  // ---------------------------------------------------------------- lighting
  const hemi = new THREE.HemisphereLight(0xbdd0df, 0x4a3a2e, 0.38);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffe9ce, 0.18);
  scene.add(ambient);
  const sleeperLayout = ['rajdhani', 'duronto', 'garib', 'golden', 'amrit', 'humsafar'].includes(layout);
  const sunSide = sleeperLayout ? -1 : 1;
  const sun = new THREE.DirectionalLight(0xffd7a3, 2.5);
  sun.position.set(8 * sunSide, 5.6, -3);
  sun.target.position.set(-0.8 * sunSide, 0.7, 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 30;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.025;
  scene.add(sun); scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xbcd1e2, sleeperLayout ? 0.35 : 0.55);
  fill.position.set(-5 * sunSide, 3.4, 5);
  scene.add(fill);
  // vestibule-side fill: keeps the rear faces of the last seat rows readable
  const rearFill = new THREE.DirectionalLight(0xffdfba, sleeperLayout ? 0.2 : 0.52);
  rearFill.position.set(0.6, 2.2, 9);
  scene.add(rearFill);

  const cabinLights = [];
  const lowCeiling = layout === 'maharaja' || layout === 'heritage';
  const cabinZ = sleeperLayout
    ? [-6.32, -2.56, 1.2, 4.96]
    : [-8.6, -6.4, -2.1, 2.1, 6.4, 8.6];
  for (const z of cabinZ) {
    const l = new THREE.PointLight(0xffdcb0, sleeperLayout ? 3.6 : 4, 8, 2);
    l.position.set(0, CEIL - (lowCeiling ? 0.82 : 0.62), z);
    scene.add(l);
    cabinLights.push(l);
  }
  if (sleeperLayout) {
    // warm bounce in the aisle, lifting the undersides of the berth banks
    for (const z of [-6.8, -2.3, 2.3, 6.8]) {
      const l = new THREE.PointLight(0xffc38a, 1.5, 4.2, 2);
      l.position.set(0.56, 0.46, z);
      scene.add(l);
      cabinLights.push(l);
    }
  }
  // chair cars need a soft aisle bounce so the seat backs do not go black
  const aisleBounce = [];
  if (!sleeperLayout && layout !== 'maharaja' && layout !== 'heritage' && layout !== 'emu') {
    for (const z of [-5.6, 0, 5.6]) {
      const l = new THREE.PointLight(0xffd7ab, 1.25, 5.5, 2);
      l.position.set(0, 0.62, z);
      scene.add(l);
      aisleBounce.push(l);
    }
  }
  // suburban coaches are lit by rows of fluorescent tubes
  const emuLights = [];
  if (layout === 'emu') {
    for (const z of [-5.4, 0, 5.4]) {
      const l = new THREE.PointLight(0xfff1d8, 5.5, 9, 2);
      l.position.set(0, CEIL - 0.18, z);
      scene.add(l);
      emuLights.push(l);
    }
  }
  // reading lamps for sleepers
  const readingLights = [];
  if (['rajdhani', 'duronto', 'garib', 'golden', 'amrit', 'humsafar', 'maharaja', 'heritage'].includes(layout)) {
    const suite = layout === 'maharaja' || layout === 'heritage';
    const suiteZs = layout === 'maharaja' ? [-2.4, 2.4] : [-4.05, 0, 4.05];
    for (const s of [-1, 1]) {
      if (suite) {
        for (const z of suiteZs) {
          const l = new THREE.PointLight(0xffc07a, 1.4, 3.4, 2);
          l.position.set(s * 1.12, 1.56, z);
          scene.add(l);
          readingLights.push(l);
        }
      } else if (s === -1) {
        for (let z = -7; z <= 7; z += 3.5) {
          // keep the lamp off the berth edge: close-range points were
          // clipping the white sheets to pure white
          const l = new THREE.PointLight(0xffb877, 0.38, 2.4, 2);
          l.position.set(0.58, 1.52, z);
          scene.add(l);
          readingLights.push(l);
        }
      }
    }
    if (layout === 'maharaja') {
      // bedside reading light at the headboard
      const l = new THREE.PointLight(0xffd0a0, 1.0, 2.0, 2);
      l.position.set(1.16, 1.36, -0.58);
      scene.add(l);
      readingLights.push(l);
    }
  }

  // dust motes
  const dustCount = 180;
  const dpos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dpos[i * 3] = rr(rng, -1.35, 1.35);
    dpos[i * 3 + 1] = rr(rng, 0.3, 2.1);
    dpos[i * 3 + 2] = rr(rng, -9, 9);
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: dustTexture(), color: 0xffe1b4, size: 0.022, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const dust = new THREE.Points(dgeo, dustMat);
  scene.add(dust);

  // soft light shafts along the sun side
  const shaftMats = [];
  if (layout !== 'emu') {
    const shaftTex = shaftTexture();
    for (const z of windows) {
      const mat = new THREE.MeshBasicMaterial({
        map: shaftTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, color: 0xffe6bc, fog: false,
      });
      const geo = new THREE.BufferGeometry();
      const x0 = sunSide * (HW - 0.02), x1 = sunSide * 0.25;
      const verts = new Float32Array([
        x0, WINDOW_Y + 0.34, z - 0.55, x0, WINDOW_Y + 0.34, z + 0.55,
        x1, 0.15, z + 0.9, x1, 0.15, z - 0.9,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      shaftMats.push(mat);
    }
  }

  const root = b.build(group, `interior-${layout}`);
  for (const o of overlays) group.add(o);
  scene.add(group);

  // ---------------------------------------------------------------- camera views
  const viewsMap = interiorViews(layout);

  // ---------------------------------------------------------------- mood handling
  const moodCfg = {
    golden: { sun: 1.6, sunColor: 0xffc58a, hemi: 0.46, ambient: 0.2, cabin: 2.5, lamp: 0.9, shafts: 0.1, dust: 0.45, exposure: 0.62, bg: 0x141016, outside: 0xf8f1e6 },
    noon: { sun: 2.2, sunColor: 0xfff4e2, hemi: 0.55, ambient: 0.24, cabin: 1.2, lamp: 0.35, shafts: 0.07, dust: 0.28, exposure: 0.58, bg: 0x16191b, outside: 0xffffff },
    blue: { sun: 0.5, sunColor: 0xff9e73, hemi: 0.3, ambient: 0.14, cabin: 3.9, lamp: 1.6, shafts: 0.07, dust: 0.42, exposure: 0.82, bg: 0x14161e, outside: 0xc0c6d8 },
    night: { sun: 0.05, sunColor: 0x8da6c6, hemi: 0.12, ambient: 0.06, cabin: 5.4, lamp: 2.2, shafts: 0, dust: 0.22, exposure: 0.96, bg: 0x070a0e, outside: 0x9aa8c0 },
    monsoon: { sun: 0.5, sunColor: 0xcdd6d2, hemi: 0.42, ambient: 0.2, cabin: 3.2, lamp: 1.3, shafts: 0.04, dust: 0.18, exposure: 0.72, bg: 0x121617, outside: 0xd0d8d4 },
  };

  let currentMood = mood;
  function setMood(name, textCfg) {
    currentMood = name;
    const m = moodCfg[name] || moodCfg.golden;
    const suite = layout === 'maharaja' || layout === 'heritage';
    const lift = layout === 'maharaja' ? 1.55 : layout === 'heritage' ? 1.22 : 1;
    sun.intensity = m.sun;
    sun.color.set(m.sunColor);
    hemi.intensity = m.hemi * lift;
    ambient.intensity = m.ambient * lift;
    const dimSuite = name === 'night' || name === 'blue';
    for (const l of cabinLights) l.intensity = m.cabin * (suite ? (dimSuite ? 0.52 : 0.8) : 1);
    for (const l of aisleBounce) l.intensity = m.cabin * 0.5;
    for (const l of emuLights) l.intensity = m.cabin * 1.35 + 1.2;
    for (const l of readingLights) l.intensity = m.lamp * (suite ? (dimSuite ? 0.9 : 1.15) : 1);
    for (const mat of shaftMats) mat.opacity = m.shafts;
    dustMat.opacity = m.dust;
    scene.background.set(m.bg);
    ledMat.emissiveIntensity = (suite ? 0.55 : 0.8) + (name === 'night' ? 0.55 : name === 'blue' ? 0.4 : 0.1);
    lampMat.emissiveIntensity = 1.0 + (name === 'night' ? 1.2 : name === 'blue' ? 0.7 : 0);
    for (const mat of outsideMats) {
      mat.map = views[name];
      mat.color.set(m.outside);
      mat.needsUpdate = true;
      if (mat.transparent) mat.opacity = name === 'night' ? 0.55 : name === 'blue' ? 0.78 : 0.88;
    }
    if (renderer) renderer.toneMappingExposure = m.exposure * (suite && !dimSuite ? 1.12 : 1) * (sleeperLayout ? 1.06 : 1);
    if (textCfg) {
      sun.intensity *= clamp((textCfg.sun?.intensity ?? 3) / 3.5, 0.5, 1.35);
    }
  }

  setMood(mood);

  // ---------------------------------------------------------------- update
  let time = 0;
  const dustPos = dgeo.attributes.position;
  function update(dt) {
    time += dt;
    // distant landscape slips past
    for (const mat of outsideMats) {
      if (mat.map) mat.map.offset.x = (mat.map.offset.x + dt * (mat.transparent ? 0.018 : 0.009)) % 1;
    }
    // dust drift
    for (let i = 0; i < 24; i++) {
      const idx = Math.floor(rng() * dustCount);
      dustPos.setY(idx, clamp(dustPos.getY(idx) + Math.sin(time * 0.35 + idx) * dt * 0.01, 0.2, 2.15));
    }
    dustPos.needsUpdate = true;
    dustMat.opacity = (currentMood === 'night' ? 0.2 : 0.42) + Math.sin(time * 0.4) * 0.03;
    for (const f of animated.fans) {
      f.rotation.y += dt * (f.userData.speed || 2.2);
    }
  }

  return {
    scene, group, views: viewsMap, setMood, update,
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    },
  };
}

// ================================================================== layouts
function buildChair(b, mats, { pal, seatMat, trimMat, headMat, woodMat, metalMat, darkMetal, ledMat, screenMat, overlays, layout, tex }) {
  const pocketMat = mats.fabric(0x23272b, [2, 2]);
  const rows = [];
  for (let z = -6.75; z <= 6.75; z += 1.5) rows.push(z);
  rows.forEach((z, i) => {
    for (const x of [-1.16, -0.59, 0.59, 1.16]) {
      const aisle = Math.abs(x) < 0.5;
      if (aisle) continue;
      const screen = (layout === 'tejas' || layout === 'vande') && i > 0;
      chairSeat(b, mats, {
        x, z, seatMat, trimMat, headMat, metalMat, darkMetal,
        pocketMat,
        screenMat: screen ? screenMat : null,
      });
    }
  });
  // central aisle carpet stripe subtle
  b.box(0.66, 0.006, L - 2.4, mats.carpet(0x1c252f, [1, 16]), { pos: [0, 0.006, 0], castShadow: false, receiveShadow: true });
  // seat number plates on rack edges
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = tex.label({
        w: 220, h: 120, text: `${i + 1}${s > 0 ? 'A' : 'B'}`, bg: 'transparent', color: '#ede4d1', size: 68, weight: 700,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.076), new THREE.MeshBasicMaterial({ map: t }));
      m.position.set(s * 1.34, 1.995, 5.2 - i * 1.5);
      m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      overlays.push(m);
    }
  }
  // a few passengers, so the car feels occupied
  const riders = [
    { x: -1.16, z: -3.75, palette: 0x8f3a4a, hair: 0x1e1512 },
    { x: 0.59, z: -2.25, palette: 0x35536a, hair: 0x171210 },
    { x: 1.16, z: 3.75, palette: 0xc39947, hair: 0x201712 },
  ];
  for (const r of riders) {
    if (layout === 'tejas') r.z += 0.0;
    seatedRider(b, mats, { ...r, tex });
  }
  // a pair of water bottles and a tray on one table
  b.box(0.38, 0.02, 0.28, woodMat, { pos: [-0.88, 0.63, 2.2], castShadow: false });
  for (const [x, z] of [[-0.96, 2.22], [-0.82, 2.18]]) {
    b.cyl(0.035, 0.04, 0.17, new THREE.MeshPhysicalMaterial({ color: 0xbdd6d2, roughness: 0.1, transparent: true, opacity: 0.65 }), { pos: [x, 0.73, z], seg: 10 });
    b.cyl(0.018, 0.018, 0.05, mats.painted(0x335f78, { seed: 3 }), { pos: [x, 0.845, z], seg: 8 });
  }
}

function seatedRider(b, mats, { x, z, palette, hair }) {
  const cloth = mats.fabric(palette, [1, 1]);
  const trousers = mats.fabric(0x2c3138, [1, 1]);
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5f45, roughness: 0.72 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair || 0x1b1410, roughness: 0.96 });
  const shoe = mats.leather(0x2a211b, [1, 1]);
  // hips on the seat pan
  b.box(0.4, 0.17, 0.42, cloth, { pos: [x, 0.6, z - 0.01], radius: 0.07, castShadow: true });
  // torso, leaning slightly back
  b.box(0.4, 0.54, 0.24, cloth, { pos: [x, 0.9, z + 0.08], rot: [-0.08, 0, 0], radius: 0.09, castShadow: true });
  b.box(0.46, 0.13, 0.23, cloth, { pos: [x, 1.13, z + 0.05], radius: 0.06, castShadow: true });
  // neck + head + hair
  b.cyl(0.045, 0.05, 0.09, skin, { pos: [x, 1.2, z + 0.06], seg: 10, castShadow: false });
  b.sphere(0.104, skin, { pos: [x, 1.285, z + 0.055], seg: 18, castShadow: true });
  b.sphere(0.114, hairMat, { pos: [x, 1.325, z + 0.038], seg: 18, scale: [1.01, 0.7, 1.01], castShadow: false });
  // arms resting on laps
  for (const s of [-1, 1]) {
    b.box(0.09, 0.34, 0.1, cloth, { pos: [x + s * 0.235, 0.86, z - 0.02], rot: [0.12, 0, s * 0.06], radius: 0.035, castShadow: true });
    b.sphere(0.045, skin, { pos: [x + s * 0.245, 0.68, z - 0.09], seg: 8, castShadow: false });
  }
  // thighs and shins
  for (const s of [-1, 1]) {
    b.box(0.15, 0.13, 0.38, trousers, { pos: [x + s * 0.1, 0.56, z - 0.2], radius: 0.04, castShadow: true });
    b.box(0.12, 0.42, 0.13, trousers, { pos: [x + s * 0.1, 0.33, z - 0.37], radius: 0.035, castShadow: true });
    b.box(0.13, 0.07, 0.24, shoe, { pos: [x + s * 0.1, 0.08, z - 0.45], radius: 0.025, castShadow: false });
  }
}

function chairSeat(b, mats, { x, z, seatMat, trimMat, headMat, metalMat, darkMetal, pocketMat, screenMat }) {
  // pedestal + foot
  b.box(0.34, 0.05, 0.36, metalMat, { pos: [x, 0.05, z], castShadow: true });
  b.cyl(0.05, 0.07, 0.34, metalMat, { pos: [x, 0.22, z - 0.02], seg: 8 });
  // seat pan
  b.box(0.5, 0.13, 0.54, seatMat, { pos: [x, 0.47, z - 0.02], radius: 0.06, castShadow: true, receiveShadow: true });
  b.box(0.46, 0.03, 0.5, trimMat, { pos: [x, 0.545, z - 0.02], radius: 0.02, castShadow: false });
  // back
  const back = new THREE.Group();
  b.add(new THREE.BoxGeometry(0.5, 0.68, 0.13), seatMat, {
    pos: [x, 0.92, z + 0.28], rot: [-0.14, 0, 0], radius: 0.06, castShadow: true, receiveShadow: true,
  });
  b.box(0.47, 0.1, 0.14, seatMat, { pos: [x, 1.19, z + 0.37], rot: [-0.14, 0, 0], radius: 0.03, castShadow: false });
  // headrest — a slim antimacassar pad, not a pillow
  b.box(0.34, 0.13, 0.12, headMat, { pos: [x, 1.295, z + 0.4], rot: [-0.14, 0, 0], radius: 0.028, castShadow: true });
  // side wings
  for (const s of [-1, 1]) b.box(0.06, 0.24, 0.16, seatMat, { pos: [x + s * 0.24, 1.24, z + 0.36], rot: [-0.14, 0, 0], radius: 0.025, castShadow: false });
  // armrests
  for (const s of [-1, 1]) {
    b.box(0.055, 0.05, 0.46, darkMetal, { pos: [x + s * 0.25, 0.66, z + 0.03], castShadow: false });
    b.box(0.045, 0.2, 0.05, metalMat, { pos: [x + s * 0.25, 0.57, z + 0.24], castShadow: false });
  }
  // tray table on the back for the passenger behind
  b.box(0.38, 0.025, 0.26, darkMetal, { pos: [x, 0.83, z + 0.37], rot: [0.12, 0, 0], castShadow: false });
  b.box(0.34, 0.01, 0.22, mats.painted(0x5a5d59, { roughness: 0.4, seed: 2 }), { pos: [x, 0.846, z + 0.365], rot: [0.12, 0, 0], castShadow: false });
  // magazine pocket and its bungee cord
  b.box(0.32, 0.18, 0.014, pocketMat, { pos: [x, 0.7, z + 0.348], rot: [-0.14, 0, 0], radius: 0.012, castShadow: false });
  b.box(0.28, 0.014, 0.02, trimMat, { pos: [x, 0.765, z + 0.356], rot: [-0.14, 0, 0], castShadow: false });
  if (screenMat) {
    b.box(0.32, 0.2, 0.02, darkMetal, { pos: [x, 0.99, z + 0.385], rot: [0.1, 0, 0], castShadow: false });
    b.add(new THREE.PlaneGeometry(0.27, 0.15), screenMat, { pos: [x, 0.99, z + 0.4], rot: [0.1, 0, 0], castShadow: false });
  }
}

function buildSleeper(b, mats, { pal, wallMat, seatMat, trimMat, headMat, woodMat, metalMat, darkMetal, curtainMat, lampMat, overlays, tex, layout }) {
  const threeTier = layout !== 'rajdhani';
  // Real side-aisle layout: bays of 6 transverse berths (2 columns x 3 tiers)
  // on the window side, a narrow aisle, then the side lower/upper berths
  // against the opposite window wall.
  const centers = [-8.2, -6.32, -4.44, -2.56, -0.68, 1.2, 3.08, 4.96, 6.84];
  const bounds = [-9.14, -7.26, -5.38, -3.5, -1.62, 0.26, 2.14, 4.02, 5.9, 7.78];
  const levels = threeTier ? [0.55, 1.14, 1.72] : [0.55, 1.74];
  const HEAD = -1.44, FOOT = 0.3;
  const LEN = FOOT - HEAD;
  const BW = 0.72, COL = 0.46;
  const SIDE_X0 = 0.86, SIDE_X1 = 1.4;
  const aisleX = 0.58;
  const frameMat = mats.painted(layout === 'rajdhani' ? 0x44474b : 0x2f4a4a, { roughness: 0.44, metalness: 0.25, seed: 7 });
  const aisleMat = mats.carpet(col(pal.runner || pal.floor), [1, 18]);
  const berthMat = mats.painted((() => {
    const c = new THREE.Color(0xc9d0cf);
    c.lerp(new THREE.Color(col(pal.seat)), 0.3);
    return c.getHex();
  })(), { roughness: 0.58, metalness: 0.04, seed: 9 });
  const accentMat = mats.fabric(col(pal.runner || 0x6b2322), [1, 1]);
  const stripeMat = mats.fabric(
    new THREE.Color(col(pal.seatTrim)).lerp(new THREE.Color(0x2c2b28), 0.46).getHex(),
    [3, 2],
  );
  const mirrorMat = new THREE.MeshStandardMaterial({
    color: 0xb9c9c8, metalness: 0.72, roughness: 0.16, envMapIntensity: 2.6,
  });

  // a runner down the offset aisle
  b.box(0.5, 0.008, L - 2.2, aisleMat, { pos: [aisleX, 0.004, 0], castShadow: false, receiveShadow: true });

  // bay partitions: full-height walls on the window side + side-berth dividers
  let bayNo = 0;
  for (const z of bounds) {
    b.box(LEN + 0.08, 2.14, 0.06, wallMat, { pos: [(HEAD + FOOT) / 2, 1.07, z], castShadow: true, receiveShadow: true });
    b.box(0.035, 2.14, 0.08, trimMat, { pos: [FOOT + 0.01, 1.07, z], castShadow: false });
    b.box(LEN + 0.08, 0.055, 0.09, woodMat, { pos: [(HEAD + FOOT) / 2, 0.03, z], castShadow: false });
    b.box(LEN + 0.04, 0.04, 0.085, trimMat, { pos: [(HEAD + FOOT) / 2, 2.11, z], castShadow: false });
    // padded kick panel at the aisle corner
    b.box(0.04, 0.46, 0.09, seatMat, { pos: [FOOT - 0.012, 0.3, z], castShadow: false });
    // side berth privacy partition
    b.box(SIDE_X1 - SIDE_X0 - 0.04, 2.14, 0.055, wallMat, { pos: [(SIDE_X0 + SIDE_X1) / 2, 1.07, z], castShadow: true, receiveShadow: true });
    b.box(SIDE_X1 - SIDE_X0, 0.055, 0.085, trimMat, { pos: [(SIDE_X0 + SIDE_X1) / 2, 2.11, z], castShadow: false });
    b.box(SIDE_X1 - SIDE_X0, 0.07, 0.09, woodMat, { pos: [(SIDE_X0 + SIDE_X1) / 2, 0.035, z], castShadow: false });
    // ladder at the aisle end of every partition, rungs across the aisle face
    for (const dz of [-0.18, 0.18]) {
      b.cyl(0.015, 0.015, 1.9, frameMat, { pos: [FOOT + 0.028, 1.12, z + dz], seg: 6, castShadow: false });
    }
    for (let y = 0.24; y <= 2.0; y += 0.29) {
      b.cyl(0.012, 0.012, 0.36, frameMat, { pos: [FOOT + 0.028, y, z], rot: [Math.PI / 2, 0, 0], seg: 5, castShadow: false });
    }
    // mirrored panel and hooks on the bay side of the partition
    for (const dir of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.62), mirrorMat);
      m.position.set(-0.66, 1.48, z + dir * 0.033);
      m.rotation.y = dir > 0 ? 0 : Math.PI;
      overlays.push(m);
      b.box(0.47, 0.66, 0.012, frameMat, { pos: [-0.66, 1.48, z + dir * 0.026], castShadow: false });
      for (const hx of [-0.16, 0.0]) {
        b.cyl(0.012, 0.012, 0.05, mats.metal(0xa39a86, 0.4, 0.6), { pos: [hx, 1.12, z + dir * 0.05], rot: [Math.PI / 2, 0, 0], seg: 5, castShadow: false });
      }
    }
    // berth number plate facing each bay (two columns of three)
    for (const dir of [-1, 1]) {
      let bayIdx = dir > 0 ? bayNo : bayNo - 1;
      if (bayIdx < 0) continue;
      bayIdx = Math.min(bayIdx, 8);
      const b0 = bayIdx * (threeTier ? 8 : 6);
      const t = tex.label({
        w: 420, h: 320, bg: '#efe9db', color: '#8c2f28', size: 64, align: 'center',
        lines: threeTier ? [
          { text: `${b0 + 4}L    ${b0 + 1}L`, size: 62, gap: 92, weight: 700 },
          { text: `${b0 + 5}M   ${b0 + 2}M`, size: 62, gap: 92, weight: 700 },
          { text: `${b0 + 6}U   ${b0 + 3}U`, size: 62, gap: 92, weight: 700 },
        ] : [
          { text: `${b0 + 2}L    ${b0 + 1}L`, size: 68, gap: 112, weight: 700 },
          { text: `${b0 + 2}U   ${b0 + 1}U`, size: 68, gap: 112, weight: 700 },
        ],
      });
      b.box(0.318, 0.246, 0.008, frameMat, { pos: [0.09, 1.47, z + dir * 0.03], castShadow: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.228), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      m.position.set(0.09, 1.47, z + dir * 0.044);
      m.rotation.y = dir > 0 ? 0 : Math.PI;
      overlays.push(m);
    }
    bayNo++;
  }

  // six transverse berths + bedding per bay, side berths, details
  for (const z of centers) {
    for (const dz of [-COL, COL]) {
      for (let i = 0; i < levels.length; i++) {
        berthAcross(b, mats, {
          headX: HEAD, len: LEN, z: z + dz, y: levels[i], w: BW,
          berthMat, trimMat, accentMat, stripeMat, lampMat, layout,
          upper: i > 0, thin: i === 1 && threeTier,
          // the near main berth has its middle berth chained up so the window reads
          folded: threeTier && i === 1 && z === 4.96 && dz === COL,
        });
      }
      // reading light above the head end, on the partition
      const lz = z + dz + (dz < 0 ? -0.4 : 0.4);
      b.cyl(0.024, 0.024, 0.06, mats.metal(0x8f8267, 0.35, 0.5), {
        pos: [HEAD + 0.2, 1.95, lz + (dz < 0 ? -0.02 : 0.02)], rot: [dz < 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0], seg: 6, castShadow: false,
      });
      // charging point and bottle holder at the aisle end
      b.box(0.1, 0.16, 0.12, darkMetal, { pos: [FOOT - 0.06, 0.92, z + dz], castShadow: false });
      b.box(0.012, 0.02, 0.02, new THREE.MeshBasicMaterial({ color: 0x7fd6a0 }), { pos: [FOOT - 0.115, 0.95, z + dz], castShadow: false });
      b.cyl(0.05, 0.05, 0.09, frameMat, { pos: [FOOT + 0.05, 0.88, z + dz + 0.24], seg: 8, castShadow: false });
      // support chains from the ceiling to the berth foot corner
      if (threeTier) {
        for (const cdz of [-0.27, 0.27]) {
          b.cyl(0.006, 0.006, 0.42, mats.metal(0x9a9484, 0.4, 0.6), { pos: [FOOT - 0.2, CEIL - 0.23, z + dz + cdz], seg: 4, castShadow: false });
        }
      }
    }
    // personal reading lamp lenses over each lower berth
    for (const dz of [-COL, COL]) {
      b.cyl(0.018, 0.018, 0.014, lampMat, { pos: [HEAD + 0.2, 1.87, z + dz + (dz < 0 ? -0.4 : 0.4)], rot: [dz < 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0], seg: 6, castShadow: false });
    }
    // side lower + side upper, made up against the window
    for (let i = 0; i < levels.length; i++) {
      sideBerth(b, mats, {
        x0: SIDE_X0, x1: SIDE_X1, z, y: levels[i], len: 1.72,
        berthMat, trimMat, accentMat, stripeMat,
        upper: i > 0,
      });
    }
    // small table between the two lower bay berths
    b.box(0.6, 0.035, 0.26, woodMat, { pos: [-1.1, 0.74, z], castShadow: true });
    b.cyl(0.02, 0.02, 0.26, metalMat, { pos: [-1.36, 0.61, z], seg: 6, castShadow: false });
    b.cyl(0.018, 0.018, 0.34, metalMat, { pos: [-1.26, 0.56, z], rot: [0, 0, 0.5], seg: 6, castShadow: false });
    // a bottle and a folded newspaper on the table
    b.cyl(0.032, 0.032, 0.19, new THREE.MeshPhysicalMaterial({
      color: 0x9fd3e0, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.62, transmission: 0.2,
    }), { pos: [-1.2, 0.85, z + 0.03], seg: 10, castShadow: false });
    b.box(0.16, 0.008, 0.21, headMat, { pos: [-0.98, 0.762, z - 0.02], rot: [0, 0.16, 0], castShadow: false });
    // luggage under the lower berths and beneath the side berth
    b.box(0.4, 0.22, 0.5, mats.painted(0x3b3630, { seed: 4 }), { pos: [-0.55, 0.16, z - 0.56], radius: 0.04, castShadow: false });
    b.box(0.34, 0.14, 0.38, mats.painted(0x5c4a33, { seed: 5 }), { pos: [-0.98, 0.14, z + 0.35], radius: 0.03, castShadow: false });
    b.box(0.26, 0.18, 0.34, mats.painted(0x27323a, { seed: 6 }), { pos: [1.08, 0.13, z - 0.45], radius: 0.03, castShadow: false });
    // drawn-back privacy curtains gathered at the bay partitions
    if (!threeTier && curtainMat) {
      for (const dz of [-1, 1]) {
        const cg = waveGeometry(0.16, 1.5, 0.028);
        b.add(cg, curtainMat, {
          pos: [0.34, 1.32, z + dz * 0.86], rot: [0, Math.PI / 2, 0],
          castShadow: false, receiveShadow: true,
        });
        b.box(0.2, 0.045, 0.17, trimMat, { pos: [0.335, 1.06, z + dz * 0.86], radius: 0.008, castShadow: false });
      }
      b.cyl(0.012, 0.012, 1.78, metalMat, { pos: [0.32, 2.12, z], rot: [Math.PI / 2, 0, 0], seg: 5, castShadow: false });
    }
  }

  // overhead grab rail down the aisle
  b.cyl(0.016, 0.016, 15.6, frameMat, { pos: [aisleX, CEIL - 0.13, 0], rot: [Math.PI / 2, 0, 0], seg: 6, castShadow: false });
  for (let z = -7.2; z <= 7.2; z += 2.4) {
    b.cyl(0.011, 0.011, 0.14, frameMat, { pos: [aisleX, CEIL - 0.065, z], seg: 5, castShadow: false });
  }
}

function berthAcross(b, mats, { headX, len, z, y, w, berthMat, trimMat, accentMat, stripeMat, lampMat, layout, upper = false, thin = false, folded = false }) {
  const h = thin ? 0.05 : 0.075;
  const cx = headX + len / 2;
  // berth board
  b.box(len, h, w, berthMat, { pos: [cx, y, z], radius: 0.02, castShadow: true, receiveShadow: true });
  // vinyl edge band along the aisle-facing end
  b.box(0.012, 0.018, w - 0.03, accentMat, { pos: [headX + len + 0.001, y - h / 2 + 0.012, z], radius: 0.004, castShadow: false });
  b.box(len - 0.04, 0.016, w - 0.03, trimMat, { pos: [cx, y + h / 2 + 0.008, z], radius: 0.012, castShadow: false });
  // light painted underside so the berth above doesn't read as a black slab
  if (upper) {
    b.box(len - 0.12, 0.012, w - 0.07, mats.painted(0xd8d0c0, { roughness: 0.82, seed: 11 }), { pos: [cx, y - h / 2 - 0.007, z], radius: 0.004, castShadow: false });
  }
  if (folded) {
    // middle berth chained up flat beneath the upper berth
    b.box(len - 0.1, 0.035, w - 0.06, berthMat, { pos: [cx, y + 0.5, z], radius: 0.015, castShadow: false });
    b.box(len - 0.16, 0.012, w - 0.1, mats.painted(0xd8d0c0, { roughness: 0.82, seed: 11 }), { pos: [cx, y + 0.476, z], radius: 0.004, castShadow: false });
    for (const dz of [-w / 2 + 0.1, w / 2 - 0.1]) {
      b.cyl(0.008, 0.008, 0.48, mats.metal(0x9a9484, 0.4, 0.6), { pos: [headX + 0.3, y + 0.25, z + dz], seg: 5, castShadow: false });
      b.cyl(0.008, 0.008, 0.48, mats.metal(0x9a9484, 0.4, 0.6), { pos: [headX + len - 0.3, y + 0.25, z + dz], seg: 5, castShadow: false });
    }
    return;
  }
  // mattress, pillow at the window end, blanket across the foot
  b.box(len - 0.16, 0.05, w - 0.08, mats.fabric(0xe9e1d1, [3, 1]), { pos: [cx + 0.03, y + h / 2 + 0.036, z], radius: 0.018, castShadow: false });
  b.box(0.3, 0.085, w - 0.2, mats.fabric(0xf2ebdd, [1, 1]), { pos: [headX + 0.28, y + h / 2 + 0.078, z], radius: 0.035, castShadow: false });
  b.box(len * 0.44, 0.028, w - 0.06, stripeMat, {
    pos: [headX + len * 0.73, y + h / 2 + 0.065, z], radius: 0.012, castShadow: false,
  });
  b.box(0.055, 0.01, w - 0.08, accentMat, { pos: [headX + len * 0.56, y + h / 2 + 0.079, z], castShadow: false });
  // blanket draping over the aisle edge of the made-up lower berth
  if (!upper) {
    b.box(0.022, 0.14, w - 0.12, stripeMat, {
      pos: [headX + len + 0.006, y - 0.03, z], rot: [0, 0, -0.06], radius: 0.008, castShadow: false,
    });
    b.box(0.05, 0.022, w - 0.12, stripeMat, {
      pos: [headX + len - 0.012, y + h / 2 + 0.058, z], radius: 0.008, castShadow: false,
    });
  }
  // folded blanket on the upper berths
  if (upper) {
    b.box(0.34, 0.09, w - 0.16, stripeMat, { pos: [headX + len - 0.32, y + h / 2 + 0.07, z], radius: 0.03, castShadow: false });
  }
  // support brackets under the board
  for (const dx of [0.24, len - 0.24]) {
    b.box(0.04, 0.18, 0.04, mats.metal(0x8a8578, 0.5, 0.6), { pos: [headX + dx, y - h / 2 - 0.09, z + w / 2 - 0.05], castShadow: false });
  }
}

function sideBerth(b, mats, { x0, x1, z, y, len, berthMat, trimMat, accentMat, stripeMat, upper = false }) {
  const w = x1 - x0, cx = (x0 + x1) / 2, h = 0.075;
  b.box(w, h, len, berthMat, { pos: [cx, y, z], radius: 0.02, castShadow: true, receiveShadow: true });
  b.box(0.012, 0.018, len - 0.03, accentMat, { pos: [x0 - 0.001, y - h / 2 + 0.012, z], radius: 0.004, castShadow: false });
  b.box(w - 0.03, 0.016, len - 0.04, trimMat, { pos: [cx, y + h / 2 + 0.008, z], radius: 0.012, castShadow: false });
  if (upper) {
    b.box(w - 0.07, 0.012, len - 0.12, mats.painted(0xd8d0c0, { roughness: 0.82, seed: 11 }), { pos: [cx, y - h / 2 - 0.007, z], radius: 0.004, castShadow: false });
  }
  b.box(w - 0.06, 0.05, len - 0.14, mats.fabric(0xe9e1d1, [1, 3]), { pos: [cx, y + h / 2 + 0.036, z - 0.03], radius: 0.018, castShadow: false });
  b.box(w - 0.13, 0.085, 0.3, mats.fabric(0xf2ebdd, [1, 1]), { pos: [cx, y + h / 2 + 0.078, z - len / 2 + 0.26], radius: 0.035, castShadow: false });
  b.box(w - 0.05, 0.028, len * 0.4, stripeMat, {
    pos: [cx, y + h / 2 + 0.065, z + len * 0.24], radius: 0.012, castShadow: false,
  });
  // blanket edge hanging into the aisle
  if (!upper) {
    b.box(0.022, 0.14, len * 0.4, stripeMat, {
      pos: [x0 + 0.004, y - 0.03, z + len * 0.24], rot: [0, 0, 0.06], radius: 0.008, castShadow: false,
    });
  }
  b.cyl(0.022, 0.022, 0.07, mats.metal(0x9b8b6c, 0.35, 0.55), { pos: [x1 + 0.04, y + 0.3, z - len / 2 + 0.12], rot: [0, 0, Math.PI / 2], seg: 6, castShadow: false });
}

function buildSuite(b, mats, { pal, wallMat, woodMat, brassMat, trimMat, seatMat, headMat, metalMat, lampMat, ceilMat, overlays, tex }) {
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xffd49a, emissiveIntensity: 0.8, roughness: 0.65 });
  // wood panelling on the walls
  for (const s of [-1, 1]) {
    b.box(0.02, 1.25, 7.6, woodMat, { pos: [s * (HW - 0.06), 0.66, -0.4], castShadow: false, receiveShadow: true });
    for (const y of [0.18, 0.62, 1.06]) b.box(0.025, 0.018, 7.6, brassMat, { pos: [s * (HW - 0.075), y, -0.4], castShadow: false });
    // brass wall sconces with warm shades
    for (const z of [-2.4, 2.4]) {
      b.box(0.05, 0.22, 0.11, brassMat, { pos: [s * (HW - 0.085), 1.5, z], castShadow: false });
      b.cyl(0.035, 0.035, 0.12, brassMat, { pos: [s * (HW - 0.16), 1.55, z], rot: [0, 0, Math.PI / 2], seg: 8, castShadow: false });
      b.cyl(0.075, 0.11, 0.17, lampMat, { pos: [s * (HW - 0.22), 1.64, z], seg: 14, castShadow: false });
      b.cyl(0.09, 0.07, 0.025, brassMat, { pos: [s * (HW - 0.22), 1.555, z], seg: 12, castShadow: false });
    }
  }
  // partition ends of the suite
  for (const z of [-4.3, 3.5]) {
    b.box(HW * 2 - 0.1, CEIL - 0.15, 0.06, woodMat, { pos: [0, CEIL / 2 - 0.02, z], castShadow: false, receiveShadow: true });
    b.box(0.9, 2.0, 0.1, woodMat, { pos: [0, 1.0, z], castShadow: false });
    b.box(0.7, 1.4, 0.02, mats.painted(0x2b1c14, { seed: 3 }), { pos: [0, 1.2, z + (z > 0 ? -0.06 : 0.06)] });
  }
  // bed against the right wall
  b.box(1.18, 0.35, 2.25, woodMat, { pos: [0.78, 0.26, 0.2], radius: 0.05, castShadow: true });
  b.box(1.08, 0.18, 2.12, mats.fabric(0xefe6d4, [1.4, 2]), { pos: [0.78, 0.5, 0.2], radius: 0.06, castShadow: true });
  b.box(1.12, 0.05, 1.3, mats.fabric(0x8f3f4a, [1.4, 2]), { pos: [0.78, 0.6, 0.55], radius: 0.02, castShadow: false });
  // gold throw across the foot of the bed
  b.box(1.14, 0.028, 0.5, mats.fabric(0xc19a5c, [1.3, 1]), { pos: [0.78, 0.627, 1.02], radius: 0.012, castShadow: false });
  b.box(1.14, 0.012, 0.05, mats.fabric(0x8f3f4a, [2, 1]), { pos: [0.78, 0.64, 0.79], castShadow: false });
  b.box(0.66, 0.15, 0.32, mats.fabric(0xf2eadb, [1, 1]), { pos: [0.78, 0.66, -0.62], radius: 0.06, castShadow: false });
  b.box(0.66, 0.15, 0.32, mats.fabric(0xf2eadb, [1, 1]), { pos: [0.78, 0.66, -0.26], radius: 0.06, castShadow: false });
  // headboard
  b.box(1.2, 1.2, 0.08, woodMat, { pos: [0.78, 1.05, -0.94], radius: 0.04, castShadow: true });
  for (let i = 0; i < 5; i++) b.box(0.02, 0.8, 0.02, brassMat, { pos: [0.34 + i * 0.22, 1.08, -0.985], castShadow: false });
  // sofa along the left wall, facing the bed
  b.box(0.72, 0.28, 1.72, seatMat, { pos: [-1.03, 0.42, -0.9], radius: 0.08, castShadow: true });
  b.box(0.16, 0.55, 1.72, seatMat, { pos: [-1.35, 0.85, -0.9], rot: [0, 0, 0.08], radius: 0.06, castShadow: true });
  for (const s of [-1, 1]) b.box(0.72, 0.4, 0.16, trimMat, { pos: [-1.03, 0.63, -0.9 + s * 0.82], radius: 0.04, castShadow: true });
  for (let i = 0; i < 3; i++) b.box(0.58, 0.12, 0.54, trimMat, { pos: [-0.98, 0.6, -1.32 + i * 0.58], radius: 0.05, castShadow: false });
  b.box(0.38, 0.14, 0.4, mats.fabric(0x77323a, [1, 1]), { pos: [-1.08, 0.66, -0.22], rot: [0, 0.24, 0.1], radius: 0.05, castShadow: false });
  // coffee table in front of the sofa
  b.box(0.52, 0.05, 0.88, woodMat, { pos: [-0.42, 0.43, -0.9], radius: 0.03, castShadow: true });
  b.box(0.46, 0.02, 0.8, brassMat, { pos: [-0.42, 0.46, -0.9], castShadow: false });
  for (const [dx, dz] of [[-0.2, -0.36], [0.2, -0.36], [-0.2, 0.36], [0.2, 0.36]]) b.cyl(0.018, 0.018, 0.4, brassMat, { pos: [-0.42 + dx, 0.22, -0.9 + dz], seg: 6 });
  // lamp on table
  b.cyl(0.07, 0.1, 0.18, brassMat, { pos: [-0.42, 0.57, -1.12], seg: 12, castShadow: false });
  b.cyl(0.16, 0.22, 0.2, new THREE.MeshStandardMaterial({ color: 0xf0dfc2, emissive: 0xffcf95, emissiveIntensity: 0.55, roughness: 0.7 }), { pos: [-0.42, 0.76, -1.12], seg: 16, castShadow: false });
  // writing desk along the left wall, under the windows
  b.box(0.62, 0.05, 1.55, woodMat, { pos: [-1.1, 0.78, 1.55], castShadow: true });
  b.box(0.56, 0.12, 1.45, woodMat, { pos: [-1.1, 0.7, 1.55], castShadow: false });
  b.box(0.6, 0.02, 1.5, brassMat, { pos: [-1.1, 0.812, 1.55], castShadow: false });
  for (const [dx, dz] of [[-0.24, -0.68], [0.24, -0.68], [-0.24, 0.68], [0.24, 0.68]]) {
    b.box(0.05, 0.7, 0.05, brassMat, { pos: [-1.1 + dx, 0.4, 1.55 + dz], castShadow: false });
  }
  // a single brass stool at the desk
  b.cyl(0.24, 0.26, 0.07, trimMat, { pos: [-0.56, 0.55, 1.55], seg: 18, castShadow: true });
  b.cyl(0.05, 0.07, 0.5, brassMat, { pos: [-0.56, 0.28, 1.55], seg: 10 });
  b.cyl(0.2, 0.22, 0.035, brassMat, { pos: [-0.56, 0.04, 1.55], seg: 16 });
  // chandelier
  const ch = new THREE.Group();
  b.cyl(0.44, 0.48, 0.05, brassMat, { pos: [0, CEIL - 0.26, 0.1], seg: 24, castShadow: false });
  b.cyl(0.06, 0.06, 0.16, brassMat, { pos: [0, CEIL - 0.16, 0.1], seg: 10, castShadow: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.sphere(0.04, bulbMat, { pos: [Math.cos(a) * 0.36, CEIL - 0.33, 0.1 + Math.sin(a) * 0.36], seg: 8, castShadow: false });
  }
  // artwork
  const art = tex.label({ w: 800, h: 500, text: 'उत्तर रेलवे', sub: 'RAJASTHAN · 1962', bg: '#5c3423', color: '#e2c48d', size: 70, subSize: 26, weight: 500, letterSpacing: 2 });
  const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshStandardMaterial({ map: art, roughness: 0.8 }));
  artMesh.position.set(0, 1.55, 3.44); artMesh.rotation.y = Math.PI;
  overlays.push(artMesh);
  // fruit bowl / decanter
  b.cyl(0.12, 0.09, 0.07, brassMat, { pos: [-0.48, 0.51, -0.68], seg: 14 });
  b.box(1.5, 0.02, 0.6, mats.carpet(0x4a201d, [1, 2]), { pos: [-0.42, 0.012, -0.4], castShadow: false });
}

function buildHeritage(b, mats, { pal, woodMat, brassMat, trimMat, seatMat, headMat, metalMat, lampMat, curtainMat, ceilMat, overlays, tex }) {
  // colonial lounge: armchair pairs, side tables, potted palm
  const chairs = [[-0.88, -2.0, 1], [-0.88, 0.3, 1], [0.88, -2.0, -1], [0.88, 0.3, -1]];
  for (const [x, z, dir] of chairs) armchair(b, mats, { x, z, dir, seatMat, trimMat, headMat, woodMat, brassMat });
  // side tables
  for (const z of [-2.8, 1.1]) {
    b.box(0.44, 0.05, 0.44, woodMat, { pos: [0, 0.56, z], castShadow: true });
    b.cyl(0.05, 0.07, 0.54, brassMat, { pos: [0, 0.28, z], seg: 8 });
    b.cyl(0.18, 0.2, 0.035, brassMat, { pos: [0, 0.04, z], seg: 12 });
  }
  // table lamps
  for (const z of [-2.8, 1.1]) {
    b.cyl(0.05, 0.07, 0.22, brassMat, { pos: [0, 0.66, z], seg: 10 });
    b.cyl(0.13, 0.17, 0.19, new THREE.MeshStandardMaterial({ color: 0xe6d3ac, emissive: 0xffc88c, emissiveIntensity: 0.28, roughness: 0.85 }), { pos: [0, 0.84, z], seg: 14, castShadow: false });
  }
  // potted palm at the end
  b.cyl(0.18, 0.14, 0.28, brassMat, { pos: [-0.9, 0.14, 3.4], seg: 12 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    b.tube([[-0.9, 0.3, 3.4], [-0.9 + Math.cos(a) * 0.22, 0.86 + (i % 3) * 0.1, 3.4 + Math.sin(a) * 0.22], [-0.9 + Math.cos(a) * 0.42, 1.2, 3.4 + Math.sin(a) * 0.42]], 0.012, mats.painted(0x3c5c34, { roughness: 0.9, seed: 4 }), { tubularSegments: 6 });
  }
  // curtains at alternate windows
  if (curtainMat) {
    for (let i = 0; i < 4; i++) {
      const cg = waveGeometry(0.5, 1.2, 0.035);
      for (const s of [-1, 1]) b.add(cg, curtainMat, { pos: [s * 1.38, 1.42, -5.9 + i * 3.7], rot: [0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0], castShadow: false });
    }
  }
  // wall lamps between windows
  for (const s of [-1, 1]) {
    for (const z of [-4.05, 0, 4.05]) {
      b.cyl(0.06, 0.08, 0.05, brassMat, { pos: [s * 1.43, 1.9, z], rot: [0, 0, Math.PI / 2], seg: 10, castShadow: false });
      b.cyl(0.1, 0.14, 0.18, lampMat, { pos: [s * 1.35, 2.01, z], seg: 14, castShadow: false });
    }
  }
  // luggage rack in brass
  for (const s of [-1, 1]) {
    b.box(0.05, 0.04, L - 4.2, brassMat, { pos: [s * 1.36, 2.02, 0], castShadow: false });
    for (let z = -7; z <= 7; z += 2) b.box(0.05, 0.18, 0.03, brassMat, { pos: [s * 1.36, 1.93, z], castShadow: false });
  }
}

function armchair(b, mats, { x, z, dir, seatMat, trimMat, headMat, woodMat, brassMat }) {
  b.box(0.62, 0.16, 0.6, seatMat, { pos: [x, 0.44, z], radius: 0.06, castShadow: true });
  b.box(0.62, 0.62, 0.14, seatMat, { pos: [x, 0.84, z - dir * 0.24], rot: [dir * -0.08, 0, 0], radius: 0.05, castShadow: true });
  b.box(0.52, 0.16, 0.12, headMat, { pos: [x, 1.18, z - dir * 0.27], rot: [dir * -0.08, 0, 0], radius: 0.04, castShadow: true });
  for (const s of [-1, 1]) {
    b.box(0.1, 0.28, 0.6, trimMat, { pos: [x + s * 0.31, 0.64, z], radius: 0.04, castShadow: true });
    b.box(0.08, 0.04, 0.5, woodMat, { pos: [x + s * 0.31, 0.8, z], castShadow: false });
    for (const dz of [-0.22, 0.22]) b.cyl(0.018, 0.018, 0.34, brassMat, { pos: [x + s * 0.27, 0.2, z + dz], seg: 6 });
  }
  b.box(0.58, 0.03, 0.05, woodMat, { pos: [x, 0.55, z + dir * 0.31], castShadow: false });
}

function buildEmu(b, mats, { pal, seatMat, trimMat, metalMat, darkMetal, ledMat, ceilMat, animated, overlays, tex }) {
  // longitudinal bench seats
  for (const s of [-1, 1]) {
    for (let z = -8.2; z <= 8.2; z += 2.1) {
      b.box(0.62, 0.14, 1.7, seatMat, { pos: [s * 1.12, 0.52, z], radius: 0.05, castShadow: true, receiveShadow: true });
      b.box(0.1, 0.55, 1.7, seatMat, { pos: [s * 1.4, 0.83, z], rot: [0, 0, s * -0.1], radius: 0.04, castShadow: true });
      b.box(0.1, 0.05, 1.7, trimMat, { pos: [s * 1.36, 0.8, z], castShadow: false });
      b.box(0.62, 0.03, 1.7, seatMat, { pos: [s * 1.12, 0.6, z], castShadow: false });
    }
  }
  // central poles and hanging handles
  for (let z = -7; z <= 7; z += 3.5) {
    b.cyl(0.028, 0.028, CEIL - 0.06, metalMat, { pos: [0, (CEIL - 0.06) / 2, z], seg: 10, castShadow: false });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      const hx = Math.cos(a) * 0.3, hz = Math.sin(a) * 0.3;
      // short arm off the pole, then a vertical strap and a hand loop
      b.tube([[0, CEIL - 0.2, z], [hx, CEIL - 0.44, z + hz]], 0.012, metalMat, { tubularSegments: 4, castShadow: false });
      b.tube([[hx, CEIL - 0.44, z + hz], [hx, 1.9, z + hz]], 0.01, metalMat, { tubularSegments: 2, castShadow: false });
      b.torus(0.062, 0.011, metalMat, {
        pos: [hx, 1.84, z + hz], rot: [0, -a, 0], castShadow: false,
      });
    }
  }
  // ceiling fans
  for (const z of [-4.5, 0, 4.5]) {
    b.cyl(0.065, 0.065, 0.26, darkMetal, { pos: [0, CEIL - 0.2, z], seg: 10, castShadow: false });
    // fan built separately so it can spin
    const fan = new THREE.Group();
    const fb = new MeshBatch('fan');
    fb.cyl(0.1, 0.1, 0.08, darkMetal, { pos: [0, 0, 0], seg: 10 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      fb.box(0.54, 0.025, 0.15, mats.painted(0x8b8c84, { roughness: 0.6, metalness: 0.3, seed: 3 }), { pos: [Math.cos(a) * 0.33, 0, Math.sin(a) * 0.33], rot: [0.16, -a, 0], castShadow: false });
    }
    const rotor = fb.build(fan, 'rotor');
    fan.position.set(0, CEIL - 0.37, z);
    rotor.userData.speed = 4.4 + z * 0.05;
    b.box(1.3, 0.02, 0.06, ledMat, { pos: [0, CEIL - 0.02, z], castShadow: false });
    animated.fans.push(rotor);
    overlays.push(fan);
  }
  // doors: leave the shell intact but add bright door light panels with handrails
  for (const s of [-1, 1]) {
    for (const z of [-6.8, 0, 6.8]) {
      b.box(0.02, 1.95, 1.28, mats.painted(0xd5d6cf, { roughness: 0.55, seed: 3 }), { pos: [s * (HW - 0.075), 1.0, z], castShadow: false });
      for (const dz of [-0.32, 0.32]) b.box(0.025, 1.9, 0.03, darkMetal, { pos: [s * (HW - 0.09), 1.0, z + dz], castShadow: false });
      b.box(0.02, 0.7, 1.2, new THREE.MeshBasicMaterial({ color: 0xa9b1ac }), { pos: [s * (HW - 0.095), 1.55, z], castShadow: false });
      for (const dz of [-0.55, 0.55]) b.tube([[s * (HW - 0.12), 0.6, z + dz], [s * (HW - 0.12), 1.7, z + dz]], 0.02, metalMat, { castShadow: false });
    }
  }
  // more standee handles under the racks
  for (const s of [-1, 1]) {
    for (let z = -7.4; z <= 7.4; z += 2.1) {
      b.box(0.05, 0.05, 1.2, metalMat, { pos: [s * 0.72, 2.0, z], castShadow: false });
      for (const dz of [-0.36, 0.36]) b.tube([[s * 0.72, 2.0, z + dz], [s * 0.72, 1.67, z + dz]], 0.012, metalMat, { castShadow: false });
    }
  }
  // floor wear strips
  b.box(0.7, 0.006, L - 2, mats.painted(0x55544d, { roughness: 0.9, seed: 4 }), { pos: [0, 0.007, 0], castShadow: false });
  // destination board
  const board = tex.label({ w: 1600, h: 240, text: 'CHURCHGATE → VIRAR', hi: 'चर्चगेट → विरार', bg: '#101a26', color: '#f1e8d4', size: 86, subSize: 58, weight: 700, letterSpacing: 3 });
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.33), new THREE.MeshBasicMaterial({ map: board }));
  bm.position.set(0, 2.11, -L / 2 + 0.12);
  overlays.push(bm);
}

// ================================================================== views
function routeFrom(def) {
  const r = def.route || '';
  return (r.split(/→|->|—/)[0] || 'NEW DELHI').trim().toUpperCase();
}
function routeTo(def) {
  const r = def.route || '';
  return (r.split(/→|->|—/)[1] || 'MUMBAI CENTRAL').trim().toUpperCase();
}
function liveryName(layout) {
  return {
    vande: 'VANDE BHARAT', shatabdi: 'SHATABDI', tejas: 'TEJAS', rajdhani: 'RAJDHANI',
    duronto: 'DURONTO', garib: 'GARIB RATH', golden: 'GOLDEN TEMPLE', maharaja: 'MAHARAJAS',
    humsafar: 'HUMSAFAR', amrit: 'AMRIT BHARAT', emu: 'MUMBAI LOCAL', heritage: 'HERITAGE',
  }[layout] || 'INDIAN RAILWAYS';
}
function interiorViews(layout) {
  switch (layout) {
    case 'vande':
    case 'shatabdi':
    case 'tejas':
    case 'double':
    case 'namo':
      return {
        bay: { pos: [0.02, 1.64, 7.2], target: [0.02, 1.1, -2.0], fov: 48 },
        corridor: { pos: [0.03, 1.62, -6.8], target: [0.03, 1.5, 6.5] },
        window: { pos: [-0.08, 1.55, 2.35], target: [1.45, 1.3, 0.75], fov: 58 },
      };
    case 'maharaja':
      return {
        bay: { pos: [0.15, 1.66, 3.2], target: [0.55, 0.98, -0.9] },
        corridor: { pos: [-0.72, 1.55, 2.62], target: [0.3, 1.02, -1.4] },
        window: { pos: [0.28, 1.34, 0.4], target: [1.6, 1.35, 0.1] },
      };
    case 'heritage':
      return {
        bay: { pos: [0.0, 1.58, 4.9], target: [-0.1, 1.1, -0.5] },
        corridor: { pos: [0.0, 1.58, -6.4], target: [0.0, 1.25, 4.0] },
        window: { pos: [-0.35, 1.52, 2.0], target: [1.45, 1.3, -0.35], fov: 55 },
      };
    case 'emu':
      return {
        bay: { pos: [0.33, 1.6, 5.9], target: [0.0, 1.3, -2.6], fov: 52 },
        corridor: { pos: [0.0, 1.62, -6.4], target: [0.0, 1.35, 5.6] },
        window: { pos: [0.0, 1.4, 1.1], target: [1.6, 1.42, 0.9] },
      };
    default:
      return {
        // stand in the aisle at the foot of a bay and look across at the
        // two columns of transverse berths, the table and the window
        bay: { pos: [0.55, 1.36, 6.5], target: [-1.15, 1.02, 6.86], fov: 68 },
        corridor: { pos: [0.58, 1.55, -8.55], target: [0.58, 1.38, 7.2] },
        window: { pos: [0.62, 1.5, 3.5], target: [1.5, 1.42, 3.12], fov: 54 },
      };
  }
}

// ================================================================== helpers
let _shaftTex = null;
function shaftTexture() {
  if (_shaftTex) return _shaftTex;
  const c = makeCanvas(256, 512);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, 'rgba(255,238,204,.85)');
  g.addColorStop(0.35, 'rgba(255,231,190,.35)');
  g.addColorStop(1, 'rgba(255,225,180,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 512);
  // feather the sides
  const h = ctx.createLinearGradient(0, 0, 256, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.2, 'rgba(0,0,0,1)');
  h.addColorStop(0.8, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = h; ctx.fillRect(0, 0, 256, 512);
  _shaftTex = canvasTexture(c);
  return _shaftTex;
}
