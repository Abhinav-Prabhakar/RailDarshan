import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import {
  makeCanvas, canvasTexture, fbm, noise2, mulberry32, clamp, lerp, rr, pick, TAU,
} from './util.js';

// Relative to the document so the build also runs from a project-page
// subpath (github.io/<repo>/) without a rewrite step.
const BASE = import.meta.env.BASE_URL;
const asset = (p) => `${BASE}${p}`;

const ASSETS = {
  golden: asset('assets/hdri/qwantani_sunset_puresky_2k.hdr'),
  noon: asset('assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr'),
  blue: asset('assets/hdri/qwantani_dusk_2_puresky_2k.hdr'),
  night: asset('assets/hdri/satara_night_no_lamps_2k.hdr'),
  monsoon: asset('assets/hdri/kloofendal_overcast_puresky_2k.hdr'),
};

const PHOTO = {
  concrete: {
    dir: asset('assets/textures/concrete_floor_worn_001'),
    map: 'diffuse.jpg', normal: 'nor_gl.jpg', rough: 'rough.jpg', ao: 'ao.jpg',
  },
  ballast: {
    dir: asset('assets/textures/gravel_stones'),
    map: 'diffuse.jpg', normal: 'nor_gl.jpg', rough: 'rough.jpg',
  },
  rust: {
    dir: asset('assets/textures/rusty_painted_metal'),
    map: 'diffuse.jpg', normal: 'nor_gl.jpg', rough: 'rough.jpg', ao: 'ao.jpg',
  },
  wood: {
    dir: asset('assets/textures/wood_planks'),
    map: 'diffuse.jpg', normal: 'nor_gl.jpg', rough: 'rough.jpg',
  },
  leather: {
    dir: asset('assets/textures/brown_leather'),
    map: 'diffuse.jpg', normal: 'nor_gl.jpg', rough: 'rough.jpg',
  },
  shutter: {
    dir: asset('assets/textures/painted_metal_shutter'),
    map: 'diffuse.jpg', normal: 'nor_gl.jpg', rough: 'rough.jpg',
  },
};

const FONT_SANS = '"Manrope", "Helvetica Neue", Arial, sans-serif';
const FONT_SERIF = '"Fraunces", Georgia, serif';
const FONT_MONO = '"IBM Plex Mono", "SFMono-Regular", monospace';
const FONT_DEV = '"Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif';

function drawSoftEllipse(ctx, x, y, rx, ry, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function grimeCanvas(w, h, seed, richness = 1) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = mulberry32(seed);
  ctx.clearRect(0, 0, w, h);
  // soft broad stains
  for (let i = 0; i < 70; i++) {
    const x = rng() * w, y = rng() * h;
    drawSoftEllipse(ctx, x, y, rr(rng, 8, 55), rr(rng, 4, 24), rng() > 0.45 ? '#3a2a1b' : '#17130f', rr(rng, 0.015, 0.07));
  }
  // vertical water / rust streaks from above
  for (let i = 0; i < 90 * richness; i++) {
    const x = rng() * w;
    const len = rr(rng, 30, h * 0.9);
    const grad = ctx.createLinearGradient(0, 0, 0, len);
    const brown = rng() > 0.55;
    grad.addColorStop(0, brown ? 'rgba(83,45,22,0.20)' : 'rgba(22,19,15,0.20)');
    grad.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.save();
    ctx.translate(x, rr(rng, 0, h * 0.2));
    ctx.fillStyle = grad;
    ctx.fillRect(-rr(rng, 0.5, 2.4), 0, rr(rng, 1, 5), len);
    ctx.restore();
  }
  // dirt accumulating at the bottom and around the skirt
  const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
  g.addColorStop(0, 'rgba(24,20,16,0)');
  g.addColorStop(1, 'rgba(24,20,16,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  // scuffs and chips
  for (let i = 0; i < 160; i++) {
    const x = rng() * w, y = rng() * h;
    ctx.strokeStyle = `rgba(${rng() > .5 ? '210,200,180' : '35,28,20'},${rr(rng, .04, .18)})`;
    ctx.lineWidth = rr(rng, .4, 1.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rr(rng, -16, 16), y + rr(rng, -3, 3));
    ctx.stroke();
  }
  // rain speckle
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(44,34,24,${rr(rng, .02, .12)})`;
    ctx.fillRect(rng() * w, rng() * h, rr(rng, .5, 2), rr(rng, .5, 3));
  }
  return c;
}

export class TextureLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.hdri = new Map();
    this.hdriLoader = new RGBELoader();
    this.photos = {};
    this.paintCache = new Map();
    this.decalCache = new Map();
    this.textCache = new Map();
    this.ready = false;
  }

  async preload(report = () => {}) {
    await document.fonts.ready.catch(() => {});
    const texLoader = new THREE.TextureLoader();
    const entries = Object.entries(PHOTO);
    let done = 0;
    for (const [key, cfg] of entries) {
      report(`Developing the ${key === 'concrete' ? 'platform concrete' : key === 'ballast' ? 'track ballast' : key === 'wood' ? 'teak and walnut' : key === 'leather' ? 'upholstery' : 'weathered steel'}…`, done / entries.length);
      const load = (file, srgb) => new Promise((res) => {
        texLoader.load(`${cfg.dir}/${file}`, (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = this.maxAniso;
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          res(t);
        }, undefined, () => res(null));
      });
      const [map, normal, rough, ao] = await Promise.all([
        load(cfg.map, true), load(cfg.normal, false), load(cfg.rough, false), cfg.ao ? load(cfg.ao, false) : Promise.resolve(null),
      ]);
      this.photos[key] = { map, normal, rough, ao };
      done++;
    }
    // generated surfaces
    this.gen = {
      tactile: this.makeTactile(),
      edgeStripe: this.makeEdgeStripe(),
      grime: this.makeGrime(11),
      rustGrime: this.makeGrime(73, 1.4),
    };
    report('Setting the light…', 0.92);
    this.ready = true;
  }

  async loadHDRI(key) {
    if (this.hdri.has(key)) return this.hdri.get(key);
    const url = ASSETS[key] || ASSETS.golden;
    const tex = await new Promise((res, rej) => {
      this.hdriLoader.load(url, res, undefined, rej);
    });
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    this.hdri.set(key, tex);
    return tex;
  }

  makeGrime(seed = 7, richness = 1) {
    const c = grimeCanvas(1024, 512, seed, richness);
    const t = canvasTexture(c, { srgb: true });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  getGrime(seed = 7) {
    const key = `grime-${seed}`;
    if (!this.decalCache.has(key)) this.decalCache.set(key, this.makeGrime(seed));
    return this.decalCache.get(key);
  }

  makeTactile() {
    const c = makeCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#b48a2d';
    ctx.fillRect(0, 0, 512, 512);
    const rng = mulberry32(5);
    // dirty yellow plates
    for (let i = 0; i < 250; i++) {
      drawSoftEllipse(ctx, rng() * 512, rng() * 512, rr(rng, 3, 30), rr(rng, 3, 18), '#6b5221', rr(rng, .01, .08));
    }
    // dome grid
    for (let y = 24; y < 512; y += 64) {
      for (let x = 24; x < 512; x += 64) {
        const rad = 14;
        const g = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, rad);
        g.addColorStop(0, '#f2d074');
        g.addColorStop(0.55, '#cfa43d');
        g.addColorStop(1, '#7d6024');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
    }
    // panel seams
    ctx.strokeStyle = 'rgba(60,45,18,.4)';
    ctx.lineWidth = 3;
    for (let y = 0; y <= 512; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    return canvasTexture(c, { repeat: [24, 1] });
  }

  makeEdgeStripe() {
    const c = makeCanvas(512, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e7e0cf';
    ctx.fillRect(0, 0, 512, 128);
    // red hazard blocks fading with age
    for (let x = -40; x < 560; x += 120) {
      ctx.fillStyle = '#a8342b';
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 58, 0); ctx.lineTo(x + 38, 128); ctx.lineTo(x - 20, 128);
      ctx.closePath(); ctx.fill();
    }
    const rng = mulberry32(9);
    const grime = grimeCanvas(512, 128, 12, .6);
    ctx.globalAlpha = .35;
    ctx.drawImage(grime, 0, 0, 512, 128);
    ctx.globalAlpha = 1;
    // wear on the blocks
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${rr(rng, 40, 110)},${rr(rng, 35, 70)},${rr(rng, 25, 50)},${rr(rng, .02, .15)})`;
      ctx.fillRect(rng() * 512, rng() * 128, rr(rng, 1, 5), rr(rng, 1, 4));
    }
    return canvasTexture(c, { repeat: [1, 1] });
  }

  paint(hex, { variation = 1, roughness = 0.46, seed = 1 } = {}) {
    const key = `${hex}-${variation}-${roughness}-${seed}`;
    if (this.paintCache.has(key)) return this.paintCache.get(key);
    const S = 256;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    const rc = makeCanvas(S, S);
    const rctx = rc.getContext('2d');
    ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
    rctx.fillStyle = `rgb(${Math.round(roughness * 255)},${Math.round(roughness * 255)},${Math.round(roughness * 255)})`;
    rctx.fillRect(0, 0, S, S);
    const rng = mulberry32(seed);
    // very subtle tonal patches from years of sun
    for (let i = 0; i < 14; i++) {
      drawSoftEllipse(ctx, rng() * S, rng() * S, rr(rng, 10, 65), rr(rng, 4, 32),
        rng() > .45 ? 'rgba(255,250,238,.035)' : 'rgba(28,22,15,.03)', rr(rng, .3, 1) * variation);
    }
    // fine orange peel / dust
    const img = ctx.getImageData(0, 0, S, S);
    const rimg = rctx.getImageData(0, 0, S, S);
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        const i = (y * S + x) * 4;
        const n = fbm(x * 0.036, y * 0.036, 4, seed) - 0.5;
        const fine = noise2(x * 1.0, y * 1.0, seed + 3) - 0.5;
        const d = n * 6 * variation + fine * 2.4;
        img.data[i] = clamp(img.data[i] + d, 0, 255);
        img.data[i + 1] = clamp(img.data[i + 1] + d, 0, 255);
        img.data[i + 2] = clamp(img.data[i + 2] + d, 0, 255);
        const rv = noise2(x * 0.66, y * 0.66, seed + 9) * 16 + n * 9;
        rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = clamp(roughness * 255 + rv, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    rctx.putImageData(rimg, 0, 0);
    // scratches and small chips
    for (let i = 0; i < 18 * variation; i++) {
      ctx.strokeStyle = `rgba(${rng() > .6 ? '225,220,205' : '40,32,22'},${rr(rng, .02, .06)})`;
      ctx.lineWidth = rr(rng, .3, 1);
      const x = rng() * S, y = rng() * S;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rr(rng, -13, 13), y + rr(rng, -1.5, 1.5)); ctx.stroke();
    }
    const map = canvasTexture(c, { repeat: [1, 1] });
    const rough = canvasTexture(rc, { srgb: false, repeat: [1, 1] });
    for (const t of [map, rough]) t.anisotropy = Math.min(4, this.maxAniso);
    const out = { map, rough };
    this.paintCache.set(key, out);
    return out;
  }

  label({
    w = 1024, h = 256, text = '', sub = '', hi = '', bg = 'transparent', color = '#f4e8d0',
    font = FONT_SANS, weight = 700, size = 120, subSize = 34, subColor = null, align = 'center',
    pad = 20, letterSpacing = 0, yOffset = 0, icon = null, lines = null,
  }) {
    const key = JSON.stringify([w, h, text, sub, hi, bg, color, font, weight, size, subSize, align, letterSpacing, yOffset, lines]);
    if (this.textCache.has(key)) return this.textCache.get(key);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    if (bg !== 'transparent') {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    }
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${letterSpacing}px`;
    const x = align === 'left' ? pad : align === 'right' ? w - pad : w / 2;
    if (lines) {
      let y = h * 0.16;
      for (const line of lines) {
        ctx.fillStyle = line.color || color;
        ctx.font = `${line.weight || weight} ${line.size || size}px ${line.font || font}`;
        ctx.fillText(line.text, x, y + (line.dy || 0));
        y += line.gap || size * 1.1;
      }
    } else {
      // Stack the three lines by their real heights. The old fixed offsets
      // overlapped the transliteration and the subtitle whenever a board had
      // all three (which is most of the station signage).
      const gap = Math.max(5, size * 0.07);
      const hiSize = subSize * 1.15;
      const blockH = size
        + (hi ? gap + hiSize : 0)
        + (sub ? gap * 0.8 + subSize : 0);
      let yTop = h / 2 + yOffset - blockH / 2;
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${font}`;
      ctx.fillText(text, x, yTop + size * 0.54);
      yTop += size + gap;
      if (hi) {
        ctx.fillStyle = subColor || color;
        ctx.font = `500 ${hiSize}px ${FONT_DEV}`;
        ctx.fillText(hi, x, yTop + hiSize * 0.52);
        yTop += hiSize + gap * 0.8;
      }
      if (sub) {
        ctx.fillStyle = subColor || color;
        ctx.font = `500 ${subSize}px ${FONT_SANS}`;
        ctx.fillText(sub, x, yTop + subSize * 0.54);
      }
    }
    if (icon === 'wheel') {
      ctx.strokeStyle = color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.3, 0, TAU); ctx.stroke();
    }
    const tex = canvasTexture(c, { srgb: true });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.textCache.set(key, tex);
    return tex;
  }

  signBoard(en, hi, sub = '') {
    const w = 1600, h = 600;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    // aged yellow enamel
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f0bb2e'); g.addColorStop(.5, '#dca51e'); g.addColorStop(1, '#c7901b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rng = mulberry32(41);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(${rr(rng, 40, 100)},${rr(rng, 30, 70)},10,${rr(rng, .01, .08)})`;
      ctx.fillRect(rng() * w, rng() * h, rr(rng, 1, 8), rr(rng, 1, 5));
    }
    ctx.fillStyle = '#17140c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${hi && en ? 152 : 220}px ${FONT_DEV}`;
    ctx.fillText(hi, w / 2, hi && en ? h * 0.25 : h * 0.5);
    if (en) {
      ctx.font = `800 ${sub ? 160 : 200}px ${FONT_SANS}`;
      ctx.letterSpacing = '8px';
      ctx.fillText(en, w / 2, h * 0.66);
      if (sub) {
        ctx.font = `500 42px ${FONT_SANS}`;
        ctx.letterSpacing = '6px';
        ctx.fillStyle = '#4d3c12';
        ctx.fillText(sub, w / 2, h * 0.88);
      }
    }
    // bevel + border
    ctx.strokeStyle = 'rgba(255,235,180,.6)'; ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeStyle = 'rgba(40,30,10,.5)'; ctx.strokeRect(18, 18, w - 36, h - 36);
    const tex = canvasTexture(c, { srgb: true });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  platformNumber(n) {
    const c = makeCanvas(256, 320);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e9dfc8'; ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = '#1c2b4a'; ctx.fillRect(10, 10, 236, 300);
    ctx.fillStyle = '#f5efdf';
    ctx.font = `600 38px ${FONT_SANS}`; ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText('PLATFORM', 128, 70);
    ctx.font = `800 150px ${FONT_SERIF}`;
    ctx.fillText(String(n), 128, 198);
    ctx.font = `500 28px ${FONT_DEV}`;
    ctx.fillText('प्लेटफार्म', 128, 262);
    const tex = canvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  flag() {
    const c = makeCanvas(600, 400);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2a326'; ctx.fillRect(0, 0, 600, 133);
    ctx.fillStyle = '#f7f4ec'; ctx.fillRect(0, 133, 600, 134);
    ctx.fillStyle = '#1a6b3c'; ctx.fillRect(0, 267, 600, 133);
    // chakra
    ctx.strokeStyle = '#22366b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(300, 200, 48, 0, TAU); ctx.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      ctx.beginPath(); ctx.moveTo(300, 200);
      ctx.lineTo(300 + Math.cos(a) * 46, 200 + Math.sin(a) * 46); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(300, 200, 8, 0, TAU); ctx.fillStyle = '#22366b'; ctx.fill();
    // fabric shading
    const rng = mulberry32(4);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rr(rng, .005, .03)})`;
      ctx.fillRect(rng() * 600, 0, rr(rng, 1, 4), 400);
    }
    return canvasTexture(c);
  }

  displayBoard(lines, { w = 1024, h = 320, bg = '#06110e', color = '#ffb646' } = {}) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // dot matrix
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(h * 0.17)}px ${FONT_SANS}`;
    let y = h * 0.2;
    for (const line of lines) {
      ctx.fillText(line, w / 2, y);
      y += h * 0.25;
    }
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(0, y, w, 1.5);
    }
    for (let x = 0; x < w; x += 4) {
      ctx.fillStyle = 'rgba(0,0,0,.13)';
      ctx.fillRect(x, 0, 1.2, h);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    return canvasTexture(c);
  }

  poster(seed = 1) {
    const c = makeCanvas(700, 1000);
    const ctx = c.getContext('2d');
    const rng = mulberry32(seed);
    const variants = [
      { sky: ['#f7d89a', '#e8924b', '#7d3b2e'], land: '#5b3a2a', accent: '#f4e3ba', title: 'THE DECCAN', sub: 'QUEEN', hi: 'दक्कन की रानी' },
      { sky: ['#cfe3e1', '#7faeaa', '#2b5051'], land: '#1e3b32', accent: '#f4e6c3', title: 'GO BY TRAIN', sub: 'SEE INDIA SLOWLY', hi: 'रेल से भारत देखें' },
      { sky: ['#f3d7b3', '#d8897a', '#594a6a'], land: '#3b2d3a', accent: '#f7e7c8', title: 'MONSOON', sub: 'WESTERN GHATS', hi: 'मानसून' },
    ];
    const v = variants[seed % variants.length];
    const g = ctx.createLinearGradient(0, 0, 0, 1000);
    g.addColorStop(0, v.sky[0]); g.addColorStop(.52, v.sky[1]); g.addColorStop(1, v.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 700, 1000);
    // papery print texture
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = `rgba(${rr(rng, 20, 255)},${rr(rng, 20, 230)},${rr(rng, 20, 210)},${rr(rng, .01, .05)})`;
      ctx.fillRect(rng() * 700, rng() * 1000, rr(rng, 1, 5), rr(rng, 1, 5));
    }
    // sun
    ctx.fillStyle = v.accent;
    ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.arc(500, 310, 90, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // layered hills
    for (let layer = 0; layer < 4; layer++) {
      ctx.fillStyle = ['#88604b', '#6b4a3c', '#4f3a30', '#342822'][layer];
      ctx.beginPath();
      ctx.moveTo(0, 1000);
      for (let x = 0; x <= 700; x += 35) {
        const y = 590 + layer * 70 + Math.sin(x * 0.013 + layer * 2.1 + seed) * (50 - layer * 8);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(700, 1000); ctx.closePath(); ctx.fill();
    }
    // railway line and steam plume
    ctx.strokeStyle = 'rgba(30,24,20,.65)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(330, 1000); ctx.bezierCurveTo(340, 850, 380, 760, 470, 650); ctx.stroke();
    ctx.fillStyle = 'rgba(245,237,218,.7)';
    for (let i = 0; i < 14; i++) {
      drawSoftEllipse(ctx, 470 + rr(rng, 0, 160), 600 - i * 18 + rr(rng, -20, 20), 20 + i * 6, 10 + i * 3, '#f6e8ca', .11);
    }
    // borders + title
    ctx.strokeStyle = v.accent; ctx.lineWidth = 3; ctx.strokeRect(26, 26, 648, 948);
    ctx.fillStyle = v.accent;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `800 86px ${FONT_SANS}`;
    ctx.letterSpacing = '-1px';
    ctx.fillText(v.title, 54, 720);
    ctx.font = `600 30px ${FONT_SANS}`;
    ctx.letterSpacing = '7px';
    ctx.fillText(v.sub, 58, 820);
    ctx.font = `500 34px ${FONT_DEV}`;
    ctx.letterSpacing = '1px';
    ctx.fillText(v.hi, 58, 885);
    ctx.font = `500 19px ${FONT_MONO}`;
    ctx.letterSpacing = '3px';
    ctx.fillStyle = 'rgba(244,230,195,.7)';
    ctx.fillText('RAIL DARSHAN · IR', 58, 940);
    const tex = canvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  notice() {
    const c = makeCanvas(512, 720);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ece3d0'; ctx.fillRect(0, 0, 512, 720);
    ctx.fillStyle = '#a82b24'; ctx.fillRect(0, 0, 512, 100);
    ctx.fillStyle = '#f7efdd';
    ctx.font = `700 40px ${FONT_DEV}`; ctx.textAlign = 'center';
    ctx.fillText('यात्री सूचना', 256, 44);
    ctx.font = `600 20px ${FONT_SANS}`; ctx.letterSpacing = '3px';
    ctx.fillText('PASSENGER NOTICE', 256, 78);
    ctx.fillStyle = '#2b261e'; ctx.textAlign = 'left';
    ctx.font = `500 20px ${FONT_SANS}`;
    const notices = [
      '1. Passengers are requested to',
      '   keep the platform clean.',
      '2. Do not cross the yellow line.',
      '3. Carrying inflammable goods is',
      '   strictly prohibited.',
      '4. Report abandoned luggage to',
      '   the nearest RPF officer.',
      '',
      'यात्रियों से निवेदन है कि',
      'स्वच्छता बनाए रखें।',
      'पीली रेखा का उल्लंघन न करें।',
    ];
    let y = 150;
    for (const line of notices) {
      ctx.fillText(line, 34, y); y += 36;
    }
    ctx.fillStyle = 'rgba(60,50,35,.12)';
    for (let y2 = 110; y2 < 720; y2 += 4) ctx.fillRect(0, y2, 512, 1);
    const tex = canvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  chaiBoard() {
    const c = makeCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#203a30'; ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#e5d8ae'; ctx.lineWidth = 5; ctx.strokeRect(18, 18, 476, 476);
    ctx.fillStyle = '#f0e3bd'; ctx.textAlign = 'center';
    ctx.font = `700 80px ${FONT_DEV}`; ctx.fillText('चाय', 256, 135);
    ctx.font = `600 32px ${FONT_SANS}`; ctx.letterSpacing = '8px'; ctx.fillText('CHAI', 256, 180);
    ctx.font = `500 34px ${FONT_SANS}`; ctx.letterSpacing = '1px';
    const items = ['CHAI  ·  ₹10', 'KAPI  ·  ₹12', 'SAMOSA  ·  ₹15', 'BISCUIT  ·  ₹10'];
    let y = 260;
    for (const item of items) { ctx.fillText(item, 256, y); y += 55; }
    ctx.font = `500 22px ${FONT_SANS}`; ctx.fillStyle = '#c6b88e';
    ctx.fillText('SINCE 1997 · PLATFORM 1', 256, 480);
    // chalk dust
    const rng = mulberry32(17);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(240,227,189,${rr(rng, .01, .08)})`;
      ctx.fillRect(rng() * 512, rng() * 512, rr(rng, 1, 3), 1);
    }
    return canvasTexture(c);
  }

  nameplate(en, hi, cls = '') {
    return this.label({
      w: 1024, h: 280, text: en.toUpperCase(), sub: cls, hi,
      bg: '#101010', color: '#f3e7cf', font: FONT_SANS, weight: 800, size: 110, subSize: 28,
      letterSpacing: 3, pad: 40,
    });
  }

  routeScreen(from = 'NEW DELHI', to = 'HOWRAH', progress = 0.42) {
    const w = 1024, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#050c14'; ctx.fillRect(0, 0, w, h);
    // subtle map grid
    ctx.strokeStyle = 'rgba(70,140,160,.09)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#5fc8d8';
    ctx.font = `500 30px ${FONT_SANS}`; ctx.letterSpacing = '6px';
    ctx.fillText('RAIL DARSHAN · LIVE ROUTE', 48, 62);
    // route
    const pts = [[70, 380], [200, 330], [330, 345], [470, 270], [620, 300], [760, 215], [950, 250]];
    ctx.strokeStyle = 'rgba(120,230,240,.22)'; ctx.lineWidth = 8; ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.strokeStyle = '#67d8e4'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]); ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
    // completed route
    ctx.strokeStyle = '#f0a53e'; ctx.lineWidth = 5; ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      ctx.fillStyle = i / (pts.length - 1) <= progress ? '#f0a53e' : '#5fc8d8';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
    }
    const [tx, ty] = pts[Math.floor(progress * (pts.length - 1))];
    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath(); ctx.arc(tx, ty, 9, 0, TAU); ctx.fill();
    ctx.font = `600 24px ${FONT_SANS}`; ctx.fillStyle = '#e8cfa8';
    ctx.fillText(from, 48, 100);
    ctx.textAlign = 'right'; ctx.fillText(to, w - 48, 100);
    ctx.textAlign = 'left'; ctx.fillStyle = '#6b7e84'; ctx.font = `400 22px ${FONT_SANS}`;
    ctx.fillText(`NEXT: ${['KANPUR CENTRAL', 'ALLAHABAD JN', 'MUGHALSARAI', 'GAYA JN'][Math.floor(progress * 4)]}`, 48, h - 48);
    ctx.fillStyle = '#5fc8d8'; ctx.textAlign = 'right';
    ctx.fillText('126 km/h · ON TIME', w - 48, h - 48);
    return canvasTexture(c);
  }

  windowView(mood = 'golden') {
    // A moving panorama for the coach windows: layered hills, patchwork
    // fields, a village skyline, palms and the telegraph line.
    const w = 2048, h = 640;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const palettes = {
      golden: {
        sky0: '#6d8db3', sky1: '#f0bd83', sun: '#ffe0a8', haze: '#e6ae7b',
        hillFar: '#9a907a', hillMid: '#7d7f5f', hillNear: '#5d6443',
        fieldA: '#c9a251', fieldB: '#8a9a4e', fieldC: '#66793f', soil: '#9c7d45',
        tree: '#38401f', treeFar: '#616849', water: '#d8c39c',
      },
      noon: {
        sky0: '#5a9fd6', sky1: '#dcece4', sun: '#ffffff', haze: '#d5e1d2',
        hillFar: '#a9b6a0', hillMid: '#8da287', hillNear: '#65815f',
        fieldA: '#c5cc79', fieldB: '#82a253', fieldC: '#5c7f42', soil: '#a2966d',
        tree: '#2f4a2c', treeFar: '#5a7354', water: '#a9c8c4',
      },
      blue: {
        sky0: '#20344f', sky1: '#c08575', sun: '#ffd7a8', haze: '#9c776e',
        hillFar: '#5b5657', hillMid: '#494a44', hillNear: '#353b32',
        fieldA: '#6f6540', fieldB: '#4b5232', fieldC: '#363f28', soil: '#5d4f3a',
        tree: '#1d241a', treeFar: '#333a2c', water: '#9b8070',
      },
      night: {
        sky0: '#061020', sky1: '#1b304c', sun: '#e6eeff', haze: '#2a3d55',
        hillFar: '#1d2a39', hillMid: '#141f2b', hillNear: '#0d161f',
        fieldA: '#202a22', fieldB: '#18231b', fieldC: '#111a14', soil: '#211d16',
        tree: '#080f0a', treeFar: '#101a12', water: '#334a63',
      },
      monsoon: {
        sky0: '#5c6870', sky1: '#b3bdb8', sun: '#eae6dc', haze: '#aab4ae',
        hillFar: '#8e9c92', hillMid: '#748478', hillNear: '#57685a',
        fieldA: '#7f8c60', fieldB: '#5f7750', fieldC: '#46613f', soil: '#7b7057',
        tree: '#2c3b2c', treeFar: '#495a49', water: '#9fada6',
      },
    };
    const p = palettes[mood] || palettes.golden;
    const rng = mulberry32(31);
    const horizon = h * 0.555;
    const wrap = (x, fn) => { fn(x); fn(x - w); fn(x + w); };

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, p.sky0);
    sky.addColorStop(0.68, p.sky1);
    sky.addColorStop(1, p.haze);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon + 2);
    // sun / moon glow
    const sunX = w * 0.61;
    const sunY = mood === 'night' ? horizon - 52 : horizon * 0.62;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 260);
    glow.addColorStop(0, p.sun);
    glow.addColorStop(0.08, p.sun);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = mood === 'night' ? 0.6 : 0.85;
    ctx.fillStyle = glow; ctx.fillRect(sunX - 260, sunY - 260, 520, 520);
    ctx.globalAlpha = 1;
    if (mood === 'night') {
      ctx.fillStyle = '#e8efff';
      ctx.beginPath(); ctx.arc(sunX, sunY, 12, 0, TAU); ctx.fill();
    }
    // stars, only where a night window can see them
    if (mood === 'night') {
      for (let i = 0; i < 140; i++) {
        const x = rng() * w;
        const y = rr(rng, 30, horizon - 8);
        ctx.fillStyle = `rgba(226,236,255,${rr(rng, 0.15, 0.8)})`;
        ctx.fillRect(x, y, rr(rng, 0.7, 1.8), rr(rng, 0.7, 1.8));
      }
    }

    // soft, streaky clouds
    for (let i = 0; i < 40; i++) {
      const x = rng() * w;
      const y = rr(rng, 30, horizon * 0.75);
      const rx = rr(rng, 60, 230), ry = rr(rng, 5, 18);
      drawSoftEllipse(ctx, x, y, rx, ry, p.sun, rr(rng, 0.03, 0.09));
      drawSoftEllipse(ctx, x + rx * 0.2, y + ry, rx * 0.7, ry * 0.8, p.haze, rr(rng, 0.03, 0.07));
    }
    // low streaks of cloud lying along the horizon, in the band a window sees
    for (let i = 0; i < 30; i++) {
      const x = rng() * w;
      const y = rr(rng, horizon - 62, horizon - 6);
      drawSoftEllipse(ctx, x, y, rr(rng, 70, 240), rr(rng, 2, 6), p.sky1, rr(rng, 0.06, 0.15));
    }

    // layered hills with atmospheric fade
    const hillLayers = [
      { color: p.hillFar, base: horizon - 42, amp: 48, freq: 0.0032, alpha: 0.72 },
      { color: p.hillMid, base: horizon - 16, amp: 30, freq: 0.0051, alpha: 0.88 },
      { color: p.hillNear, base: horizon + 4, amp: 16, freq: 0.0074, alpha: 0.96 },
    ];
    for (const l of hillLayers) {
      ctx.globalAlpha = l.alpha;
      ctx.fillStyle = l.color;
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 12) {
        const y = l.base + Math.sin(x * l.freq + l.base) * l.amp * 0.5
          + (noise2(x * 0.006, l.base * 0.1, 7) - 0.5) * l.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // haze lying on the fields
    const haze = ctx.createLinearGradient(0, horizon - 30, 0, horizon + 90);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.5, p.haze);
    haze.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.26; ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 30, w, 120); ctx.globalAlpha = 1;

    // fields: base, then soft patchwork strips receding to the horizon
    ctx.fillStyle = p.fieldC;
    ctx.fillRect(0, horizon, w, h - horizon);
    const bands = [
      { c: p.fieldA, y: 0.08, hh: 0.16, a: 0.7 },
      { c: p.fieldB, y: 0.22, hh: 0.2, a: 0.55 },
      { c: p.fieldA, y: 0.44, hh: 0.18, a: 0.4 },
      { c: p.fieldB, y: 0.62, hh: 0.22, a: 0.36 },
      { c: p.fieldC, y: 0.78, hh: 0.3, a: 0.4 },
    ];
    for (const bd of bands) {
      ctx.globalAlpha = bd.a;
      ctx.fillStyle = bd.c;
      ctx.beginPath();
      ctx.moveTo(0, horizon + (h - horizon) * bd.y);
      ctx.lineTo(w, horizon + (h - horizon) * (bd.y - 0.02));
      ctx.lineTo(w, horizon + (h - horizon) * (bd.y + bd.hh));
      ctx.lineTo(0, horizon + (h - horizon) * (bd.y + bd.hh + 0.02));
      ctx.closePath(); ctx.fill();
    }
    // crop furrows converging toward the horizon
    for (let i = 0; i < 160; i++) {
      const t = i / 160;
      const y = horizon + Math.pow(t, 1.55) * (h - horizon);
      const a = 0.05 + t * 0.09;
      ctx.globalAlpha = a;
      ctx.strokeStyle = i % 3 ? p.soil : p.fieldC;
      ctx.lineWidth = 1 + t * 2.4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + rr(rng, -2, 2)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // irrigation canal
    const canalY = horizon + (h - horizon) * 0.56;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = p.water;
    ctx.beginPath();
    ctx.moveTo(0, canalY);
    for (let x = 0; x <= w; x += 24) ctx.lineTo(x, canalY + Math.sin(x * 0.012) * 3 + noise2(x * 0.02, 8, 4) * 4);
    ctx.lineTo(w, canalY + 11);
    for (let x = w; x >= 0; x -= 24) ctx.lineTo(x, canalY + 11 + Math.sin(x * 0.012) * 3);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // tree line along the horizon
    for (let i = 0; i < 90; i++) {
      const x = rng() * w;
      const y = horizon + rr(rng, 2, 26);
      const s = rr(rng, 5, 17);
      const far = rng() > 0.55;
      ctx.globalAlpha = far ? 0.5 : 0.82;
      ctx.fillStyle = far ? p.treeFar : p.tree;
      wrap(x, (xx) => {
        ctx.beginPath(); ctx.ellipse(xx, y - s, s * rr(rng, 0.8, 1.25), s * rr(rng, 0.9, 1.35), 0, 0, TAU); ctx.fill();
        if (s > 11) {
          ctx.beginPath(); ctx.ellipse(xx - s * 0.7, y - s * 0.6, s * 0.7, s * 0.8, 0, 0, TAU); ctx.fill();
        }
      });
    }
    ctx.globalAlpha = 1;
    // palms
    for (let i = 0; i < 16; i++) {
      const x = rng() * w, base = horizon + rr(rng, 18, 42);
      const ht = rr(rng, 26, 48);
      ctx.strokeStyle = p.tree; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
      wrap(x, (xx) => {
        ctx.beginPath(); ctx.moveTo(xx, base); ctx.quadraticCurveTo(xx + 2, base - ht * 0.6, xx + rr(rng, -4, 4), base - ht); ctx.stroke();
        for (let f = 0; f < 7; f++) {
          const a = -Math.PI / 2 + (f - 3) * 0.46 + rr(rng, -0.08, 0.08);
          ctx.beginPath(); ctx.moveTo(xx, base - ht);
          ctx.quadraticCurveTo(xx + Math.cos(a) * 12, base - ht + Math.sin(a) * 12,
            xx + Math.cos(a) * rr(rng, 16, 26), base - ht + Math.sin(a) * rr(rng, 12, 24) + 5);
          ctx.stroke();
        }
      });
    }

    // village: whitewashed houses, a temple spire and a water tank
    const houses = 8;
    for (let i = 0; i < houses; i++) {
      const x = (i + rr(rng, 0.15, 0.85)) * (w / houses);
      const ww = rr(rng, 22, 44), hh = rr(rng, 10, 22);
      const y = horizon + rr(rng, 6, 22);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = mood === 'night' ? '#26303a' : '#e2d6bd';
      wrap(x, (xx) => ctx.fillRect(xx - ww / 2, y - hh, ww, hh));
      ctx.fillStyle = mood === 'night' ? '#1a222a' : '#a35a3c';
      wrap(x, (xx) => {
        ctx.beginPath();
        ctx.moveTo(xx - ww / 2 - 3, y - hh);
        ctx.lineTo(xx, y - hh - rr(rng, 5, 9));
        ctx.lineTo(xx + ww / 2 + 3, y - hh);
        ctx.closePath(); ctx.fill();
      });
      if (rng() > 0.5) {
        ctx.fillStyle = mood === 'night' ? '#ffbf72' : '#3a3026';
        ctx.globalAlpha = 0.9;
        wrap(x, (xx) => ctx.fillRect(xx + ww * 0.18, y - hh * 0.66, 3, 4));
      }
    }
    // village lamps and signal lights strung along the horizon at night
    if (mood === 'night') {
      for (let i = 0; i < 34; i++) {
        const x = rng() * w;
        const y = horizon + rr(rng, -6, 30);
        const r = rr(rng, 1.1, 2.6);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
        g.addColorStop(0, 'rgba(255,201,120,0.95)');
        g.addColorStop(0.35, 'rgba(255,170,80,0.5)');
        g.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      }
      // a couple of green signal lamps on the line
      for (const x of [w * 0.2, w * 0.73]) {
        const g = ctx.createRadialGradient(x, horizon + 6, 0, x, horizon + 6, 16);
        g.addColorStop(0, 'rgba(150,255,180,0.9)');
        g.addColorStop(1, 'rgba(80,255,150,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 16, horizon - 10, 32, 32);
      }
    }
    // temple spire
    const tx = w * 0.36;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = mood === 'night' ? '#1d2530' : '#d8cbb0';
    ctx.beginPath();
    ctx.moveTo(tx - 10, horizon + 12);
    ctx.lineTo(tx, horizon - 28);
    ctx.lineTo(tx + 10, horizon + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = mood === 'night' ? '#161c24' : '#b6573b';
    ctx.beginPath(); ctx.arc(tx, horizon - 31, 3, 0, TAU); ctx.fill();
    // water tank on stilts
    const wx = w * 0.82;
    ctx.strokeStyle = 'rgba(40,35,27,.65)'; ctx.lineWidth = 2;
    for (const dx of [-5, 5]) { ctx.beginPath(); ctx.moveTo(wx + dx, horizon + 20); ctx.lineTo(wx + dx * 0.5, horizon - 10); ctx.stroke(); }
    ctx.fillStyle = 'rgba(55,50,40,.8)';
    ctx.beginPath(); ctx.ellipse(wx, horizon - 13, 11, 6, 0, 0, TAU); ctx.fill();

    // telegraph poles and sagging wires (subtle, they read as a railway)
    ctx.globalAlpha = mood === 'night' ? 0.5 : 0.55;
    ctx.strokeStyle = 'rgba(38,34,27,.9)';
    ctx.lineWidth = 1.6;
    const poleGap = 300;
    for (let x = 40; x < w + poleGap; x += poleGap) {
      const px = x + rr(rng, -18, 18);
      const top = horizon - 72;
      wrap(px, (xx) => {
        ctx.beginPath(); ctx.moveTo(xx, horizon + 16); ctx.lineTo(xx, top); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx - 15, top + 6); ctx.lineTo(xx + 15, top + 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx - 11, top + 18); ctx.lineTo(xx + 11, top + 18); ctx.stroke();
      });
    }
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    for (let x = 40; x < w + poleGap; x += poleGap) {
      for (const dy of [6, 18]) {
        const y0 = horizon - 72 + dy;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.quadraticCurveTo(x + poleGap / 2, y0 + 13, x + poleGap, y0);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // birds
    ctx.strokeStyle = 'rgba(30,30,28,.55)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const x = rng() * w, y = rr(rng, 40, horizon * 0.5), s = rr(rng, 3, 6);
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s / 2, y - s * 0.7, x, y);
      ctx.quadraticCurveTo(x + s / 2, y - s * 0.7, x + s, y); ctx.stroke();
    }

    // grain + warm bloom
    // soften the whole panorama: a window at speed never looks sharp
    const soft = makeCanvas(w, h);
    const sctx = soft.getContext('2d');
    sctx.filter = 'blur(0.65px)';
    sctx.drawImage(c, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(soft, 0, 0);
    // warm haze wash to sit the landscape into the coach lighting
    const wash = ctx.createLinearGradient(0, horizon - 140, 0, h);
    wash.addColorStop(0, 'rgba(255,214,158,0.04)');
    wash.addColorStop(0.45, 'rgba(255,198,138,0.06)');
    wash.addColorStop(1, 'rgba(120,96,64,0.05)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rr(rng, .002, .018)})`;
      ctx.fillRect(rng() * w, rng() * h, 1, 1);
    }
    const tex = canvasTexture(c, { wrap: THREE.RepeatWrapping });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  windowForeground(mood = 'golden') {
    // Transparent near-field layer: hedges, palms and a fence, for parallax
    // just outside the glass.
    const w = 1024, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = mulberry32(77);
    const dark = mood === 'night' ? '#050a07' : mood === 'blue' ? '#141a14' : '#26301d';
    const mid = mood === 'night' ? '#081009' : mood === 'blue' ? '#1d2419' : '#3a4928';
    // low bank / grass along the bottom
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h - 26 - Math.sin(x * 0.02) * 5 - noise2(x * 0.03, 4, 6) * 10);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // grass blades
    for (let i = 0; i < 260; i++) {
      const x = rng() * w, y = h - rr(rng, 4, 34);
      ctx.strokeStyle = i % 3 ? mid : dark;
      ctx.lineWidth = rr(rng, 0.8, 2.2);
      ctx.beginPath(); ctx.moveTo(x, h); ctx.quadraticCurveTo(x + rr(rng, -4, 4), y + 8, x + rr(rng, -9, 9), y); ctx.stroke();
    }
    // hedge clumps
    for (let i = 0; i < 7; i++) {
      const x = (i + 0.5) * (w / 7) + rr(rng, -26, 26);
      const base = h - rr(rng, 12, 24);
      const s = rr(rng, 20, 40);
      ctx.fillStyle = i % 2 ? dark : mid;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(x + rr(rng, -s, s), base - rr(rng, 0, s * 0.8), s * rr(rng, 0.5, 0.9), s * rr(rng, 0.4, 0.75), 0, 0, TAU);
        ctx.fill();
      }
    }
    // palms
    for (const x of [w * 0.17, w * 0.58, w * 0.9]) {
      const base = h - 18, ht = rr(rng, 60, 88);
      ctx.strokeStyle = dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 6, base - ht * 0.55, x + 3, base - ht); ctx.stroke();
      ctx.lineWidth = 2;
      for (let f = 0; f < 8; f++) {
        const a = -Math.PI / 2 + (f - 3.5) * 0.4;
        ctx.beginPath(); ctx.moveTo(x + 3, base - ht);
        ctx.quadraticCurveTo(x + 3 + Math.cos(a) * 18, base - ht + Math.sin(a) * 18,
          x + 3 + Math.cos(a) * rr(rng, 30, 46), base - ht + Math.sin(a) * rr(rng, 20, 36) + 8);
        ctx.stroke();
      }
    }
    // fence posts and two wires
    ctx.globalAlpha = 0.8; ctx.strokeStyle = dark; ctx.lineWidth = 2;
    for (let x = 20; x < w; x += 92) {
      ctx.beginPath(); ctx.moveTo(x, h - 10); ctx.lineTo(x + 1, h - 54); ctx.stroke();
    }
    ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
    for (const y of [h - 46, h - 30]) {
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 92) ctx.quadraticCurveTo(x + 46, y + 4, x + 92, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return canvasTexture(c);
  }
}
