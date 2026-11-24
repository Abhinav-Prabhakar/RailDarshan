import * as THREE from 'three';
import {
  MeshBatch, roundedBox, tubeGeo, cylinderGeo, mulberry32, rr, pick, makeCanvas,
  canvasTexture, TAU, DEG, clamp,
} from '../core/util.js';
import { buildTrack, buildCatenary, buildSignalGantry, makeGlowSprite } from './tracks.js';
import { buildProps } from './props.js';
import { buildCrowd } from './crowd.js';

export const PLATFORM = {
  y: 0.98,
  x0: 2.5,
  x1: 17.0,
  z0: -150,
  z1: 80,
  trackX: 0,
};

// ------------------------------------------------------------------ textures
function makePlatformTiles() {
  // Large-format polished stone slabs in a running bond, the way Indian
  // platform floors actually look: slabs roughly 1 m x 1.3 m, a wide spread of
  // values from charcoal replacements to cream repairs, and thin dark joints.
  // One 1024 map covers 7.2 m x 5.8 m of floor, so the stone grain still holds
  // up under the hero camera while the repeat itself is far less obvious than
  // the old small-tile grid.
  const S = 1024, ROWS = 6, ROW_H = S / ROWS, JOINT = 3.4;
  const rng = mulberry32(806);

  // Lay out a running bond once and reuse the same slabs for all three maps.
  const baseW = S / 5.35;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const slabs = [];
    let x = r % 2 ? -ROW_H * rr(rng, 0.45, 1.05) - rr(rng, 0, 30) : -rr(rng, 0, 46);
    while (x < S) {
      const w = baseW * rr(rng, 0.68, 1.36);
      slabs.push({ x, w, y: r * ROW_H, h: ROW_H });
      x += w;
    }
    // a stray half slab ends the row, clipped at the texture edge
    rows.push(slabs);
  }

  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#34322c'; ctx.fillRect(0, 0, S, S);

  const tone = () => {
    const r = rng();
    if (r < 0.05) return rr(rng, 92, 112);    // charcoal replacement
    if (r < 0.22) return rr(rng, 124, 147);   // dark mid grey
    if (r < 0.35) return rr(rng, 176, 198);   // cream / fresh slab
    return rr(rng, 144, 172);                 // the usual pale stone
  };

  // Draw a slab, repeating it across the seam so the texture tiles cleanly.
  const drawSlab = (s, fn) => {
    for (const off of [-S, 0, S]) {
      const x = s.x + off;
      if (x + s.w < 0 || x > S) continue;
      fn(x, s.y, s.w, s.h);
    }
  };

  for (const slabs of rows) {
    for (const s of slabs) {
      const lum = tone();
      const wr = rr(rng, 0.985, 1.045), wg = rr(rng, 0.985, 1.02), wb = rr(rng, 0.90, 0.975);
      const base = `rgb(${Math.round(lum * wr)},${Math.round(lum * wg)},${Math.round(lum * wb)})`;
      drawSlab(s, (x, y, w, h) => {
        const ix = x + JOINT / 2, iy = y + JOINT / 2, iw = w - JOINT, ih = h - JOINT;
        ctx.save();
        ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
        ctx.fillStyle = base; ctx.fillRect(ix, iy, iw, ih);
        // cloudy mineral variation
        for (let i = 0; i < 16; i++) {
          const gx = ix + rng() * iw, gy = iy + rng() * ih;
          const rad = rr(rng, 26, 92);
          const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
          const dark = rng() > 0.42;
          g.addColorStop(0, dark ? `rgba(48,52,44,${rr(rng, .03, .12)})` : `rgba(228,224,206,${rr(rng, .02, .09)})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(gx, gy, rad, 0, TAU); ctx.fill();
        }
        // a couple of pale veins
        if (rng() > 0.55) {
          ctx.strokeStyle = `rgba(220,216,200,${rr(rng, .05, .16)})`;
          ctx.lineWidth = rr(rng, 0.7, 2.2);
          ctx.beginPath();
          const vy = iy + rng() * ih;
          ctx.moveTo(ix, vy);
          ctx.bezierCurveTo(ix + iw * .3, vy + rr(rng, -18, 18), ix + iw * .7, vy + rr(rng, -18, 18), ix + iw, vy + rr(rng, -10, 10));
          ctx.stroke();
        }
        // fine speckle and pitting
        for (let i = 0; i < 46; i++) {
          ctx.fillStyle = rng() > 0.5 ? `rgba(58,58,50,${rr(rng, .08, .2)})` : `rgba(212,208,192,${rr(rng, .06, .16)})`;
          ctx.fillRect(ix + rng() * iw, iy + rng() * ih, rr(rng, .6, 2.6), rr(rng, .6, 2.2));
        }
        // occasional repair patch / half-resurfaced slab
        if (rng() > 0.86) {
          const pw = iw * rr(rng, 0.35, 0.7), ph = ih * rr(rng, 0.35, 0.8);
          ctx.fillStyle = `rgba(${Math.round(lum * 1.08)},${Math.round(lum * 1.07)},${Math.round(lum * 1.0)},.5)`;
          ctx.fillRect(ix + rng() * (iw - pw), iy + rng() * (ih - ph), pw, ph);
          ctx.strokeStyle = 'rgba(46,44,38,.25)'; ctx.lineWidth = 1.2;
          ctx.strokeRect(ix + 2, iy + 2, iw - 4, ih - 4);
        }
        // worn, slightly chipped edge
        if (rng() > 0.72) {
          ctx.fillStyle = 'rgba(50,47,40,.45)';
          ctx.beginPath();
          const cx = rng() > .5 ? ix : ix + iw, cy = rng() > .5 ? iy : iy + ih;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + rr(rng, -16, 16), cy);
          ctx.lineTo(cx, cy + rr(rng, -16, 16));
          ctx.fill();
        }
        // polished bevel: catch light top-left, shade bottom-right
        ctx.strokeStyle = 'rgba(236,232,216,.16)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(ix, iy + ih); ctx.lineTo(ix, iy); ctx.lineTo(ix + iw, iy); ctx.stroke();
        ctx.strokeStyle = 'rgba(26,25,21,.32)'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(ix + iw, iy); ctx.lineTo(ix + iw, iy + ih); ctx.lineTo(ix, iy + ih); ctx.stroke();
        ctx.restore();
      });
    }
  }
  // broad traffic grime and sweeping marks across the whole sheet
  for (let i = 0; i < 22; i++) {
    const g = ctx.createLinearGradient(0, rr(rng, 0, S), S, rr(rng, 0, S));
    g.addColorStop(0, 'rgba(40,38,32,0)');
    g.addColorStop(.5, `rgba(40,38,32,${rr(rng, .02, .07)})`);
    g.addColorStop(1, 'rgba(40,38,32,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }

  const rc = makeCanvas(S, S);
  const rx = rc.getContext('2d');
  rx.fillStyle = '#dadada'; rx.fillRect(0, 0, S, S);
  for (const slabs of rows) {
    for (const s of slabs) {
      const v = Math.round(rr(rng, 88, 142));
      const wear = rr(rng, 0, 1);
      drawSlab(s, (x, y, w, h) => {
        const ix = x + JOINT / 2, iy = y + JOINT / 2, iw = w - JOINT, ih = h - JOINT;
        rx.save();
        rx.beginPath(); rx.rect(ix, iy, iw, ih); rx.clip();
        rx.fillStyle = `rgb(${v},${v},${v})`; rx.fillRect(ix, iy, iw, ih);
        // dull, scuffed centre of the walking line
        if (wear > 0.62) {
          const g = rx.createRadialGradient(ix + iw * .5, iy + ih * .5, 0, ix + iw * .5, iy + ih * .5, Math.max(iw, ih) * .62);
          g.addColorStop(0, `rgba(205,205,205,${rr(rng, .18, .5)})`);
          g.addColorStop(1, 'rgba(205,205,205,0)');
          rx.fillStyle = g; rx.fillRect(ix, iy, iw, ih);
        }
        for (let i = 0; i < 16; i++) {
          const gx = ix + rng() * iw, gy = iy + rng() * ih, rad = rr(rng, 14, 60);
          const g = rx.createRadialGradient(gx, gy, 0, gx, gy, rad);
          g.addColorStop(0, `rgba(${rr(rng, 150, 235) | 0},${rr(rng, 150, 235) | 0},${rr(rng, 150, 235) | 0},.12)`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          rx.fillStyle = g; rx.beginPath(); rx.arc(gx, gy, rad, 0, TAU); rx.fill();
        }
        rx.restore();
      });
    }
  }

  const bc = makeCanvas(S, S);
  const bx = bc.getContext('2d');
  bx.fillStyle = '#4a4a4a'; bx.fillRect(0, 0, S, S);
  for (const slabs of rows) {
    for (const s of slabs) {
      const v = Math.round(rr(rng, 118, 146));
      drawSlab(s, (x, y, w, h) => {
        const ix = x + JOINT / 2, iy = y + JOINT / 2, iw = w - JOINT, ih = h - JOINT;
        bx.save();
        bx.beginPath(); bx.rect(ix, iy, iw, ih); bx.clip();
        bx.fillStyle = `rgb(${v},${v},${v})`; bx.fillRect(ix, iy, iw, ih);
        for (let i = 0; i < 26; i++) {
          bx.fillStyle = `rgba(0,0,0,${rr(rng, .02, .14)})`;
          bx.fillRect(ix + rng() * iw, iy + rng() * ih, rr(rng, 1, 5), rr(rng, 1, 3));
        }
        bx.restore();
      });
    }
  }

  const repeat = [2, 40];
  const map = canvasTexture(c, { repeat, anisotropy: 8 });
  const rough = canvasTexture(rc, { srgb: false, repeat, anisotropy: 8 });
  const bump = canvasTexture(bc, { srgb: false, repeat, anisotropy: 8 });
  return { map, rough, bump };
}

// Large-scale dirt that would be lost in a repeating tile texture: the worn
// walking line, oil drips, rust runs and puddle rims. One transparent overlay
// over the whole platform is cheaper than making every tile unique and reads
// far better than a perfectly uniform floor.
function makePlatformGrime() {
  const W = 1024, H = 1024;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(4471);
  // a long, soft dark band where feet actually walk
  const band = (cx, half, alpha) => {
    const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    g.addColorStop(0, 'rgba(40,34,26,0)');
    g.addColorStop(0.45, `rgba(40,34,26,${alpha})`);
    g.addColorStop(0.55, `rgba(40,34,26,${alpha})`);
    g.addColorStop(1, 'rgba(40,34,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - half, 0, half * 2, H);
  };
  band(W * 0.38, W * 0.16, 0.16);
  band(W * 0.78, W * 0.1, 0.1);
  band(W * 0.08, W * 0.05, 0.12);
  // stains, each squashed to stay round under the 1:2 UV aspect
  for (let i = 0; i < 340; i++) {
    const x = rng() * W, y = rng() * H;
    const rx = rr(rng, 2, 26);
    const dark = rng() > 0.22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    const col = dark ? '46,38,28' : '122,96,58';
    g.addColorStop(0, `rgba(${col},${rr(rng, .05, .24)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, rr(rng, 1.4, 2.6));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // oil / paint splashes near the edge and under the benches
  for (let i = 0; i < 60; i++) {
    const x = rr(rng, W * 0.1, W * 0.95), y = rng() * H;
    ctx.fillStyle = `rgba(28,26,22,${rr(rng, .06, .3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rr(rng, 1.5, 5), rr(rng, 3, 11), rr(rng, 0, 3), 0, TAU);
    ctx.fill();
  }
  // vertical rain streaks / drip lines off the canopy
  for (let i = 0; i < 70; i++) {
    const x = rng() * W;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(34,30,24,0)');
    g.addColorStop(0.4, `rgba(34,30,24,${rr(rng, .02, .08)})`);
    g.addColorStop(1, 'rgba(34,30,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, rr(rng, .6, 2.2), H);
  }
  // old faded paint scuffs
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(214,190,132,${rr(rng, .02, .06)})`;
    ctx.fillRect(rng() * W, rng() * H, rr(rng, 20, 90), rr(rng, 1, 3));
  }
  const tex = canvasTexture(c, { srgb: true, repeat: [1, 8] });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeDrainGrate() {
  const w = 96, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#30302b'; ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#181816'); g.addColorStop(.35, '#4b4b42'); g.addColorStop(.6, '#22221e'); g.addColorStop(1, '#101110');
  ctx.fillStyle = g; ctx.fillRect(6, 0, w - 12, h);
  for (let y = 0; y < h; y += 22) {
    ctx.fillStyle = '#6d6e64';
    ctx.fillRect(8, y, w - 16, 9);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(8, y + 9, w - 16, 3);
  }
  const tex = canvasTexture(c, { srgb: true, repeat: [1, 90] });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeCircleMark() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(91);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(242,240,230,.92)';
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, 196, 0, TAU); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, 222, 0, TAU); ctx.stroke();
  // worn away patches
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const a = rng() * TAU;
    const r = rr(rng, 180, 230);
    ctx.fillStyle = `rgba(0,0,0,${rr(rng, .25, .95)})`;
    ctx.beginPath();
    ctx.ellipse(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rr(rng, 3, 26), rr(rng, 2, 10), a, 0, TAU);
    ctx.fill();
  }
  // yellow number 1 inside
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(212,178,72,.62)';
  ctx.font = '700 150px "Manrope", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('1', S / 2, S / 2 + 6);
  return canvasTexture(c, { srgb: true });
}

function makeRedWall() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(304);
  const base = ctx.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, '#9d3f30'); base.addColorStop(.55, '#943827'); base.addColorStop(1, '#873124');
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1200; i++) {
    const r = rr(rng, 20, 90);
    ctx.fillStyle = `rgba(${r + 30},${r * .45},${r * .35},${rr(rng, .01, .06)})`;
    ctx.fillRect(rng() * S, rng() * S, rr(rng, 1, 9), rr(rng, 1, 7));
  }
  // lime bloom / plaster patches
  for (let i = 0; i < 30; i++) {
    const x = rng() * S, y = rng() * S, r = rr(rng, 12, 80);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(190,150,132,${rr(rng, .02, .10)})`);
    g.addColorStop(1, 'rgba(190,150,132,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // rain streaks
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, len = rr(rng, 30, S * .85);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(35,20,15,${rr(rng, .03, .13)})`);
    g.addColorStop(1, 'rgba(35,20,15,0)');
    ctx.save(); ctx.translate(x, rr(rng, 0, S * .25)); ctx.fillStyle = g;
    ctx.fillRect(-rr(rng, .4, 1.8), 0, rr(rng, .8, 3), len); ctx.restore();
  }
  // dirt at base
  const g = ctx.createLinearGradient(0, S * .7, 0, S);
  g.addColorStop(0, 'rgba(28,22,16,0)'); g.addColorStop(1, 'rgba(28,22,16,.28)');
  ctx.fillStyle = g; ctx.fillRect(0, S * .7, S, S * .3);
  return canvasTexture(c, { repeat: [4, 2] });
}

function makeGranite() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(77);
  ctx.fillStyle = '#1e2224'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4200; i++) {
    const g = rr(rng, 30, 130);
    ctx.fillStyle = `rgba(${g},${g + 3},${g + 5},${rr(rng, .08, .4)})`;
    ctx.fillRect(rng() * S, rng() * S, rr(rng, .6, 2.6), rr(rng, .6, 2.2));
  }
  const rc = makeCanvas(S, S);
  const rx = rc.getContext('2d');
  rx.fillStyle = '#2f2f2f'; rx.fillRect(0, 0, S, S);
  return { map: canvasTexture(c, { repeat: [2, 6] }), rough: canvasTexture(rc, { srgb: false, repeat: [2, 6] }) };
}

function makeCorrugated() {
  const w = 512, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = mulberry32(72);
  ctx.fillStyle = '#6b787a'; ctx.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) {
    const g = ctx.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, '#3f5257'); g.addColorStop(.42, '#93a3a3'); g.addColorStop(1, '#33464b');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 8, h);
  }
  for (let i = 0; i < 130; i++) {
    ctx.fillStyle = `rgba(${rr(rng, 35, 105)},${rr(rng, 26, 70)},${rr(rng, 16, 40)},${rr(rng, .02, .08)})`;
    ctx.fillRect(rng() * w, rng() * h, rr(rng, 2, 24), rr(rng, 1, 5));
  }
  for (let i = 0; i < 45; i++) {
    const x = rng() * w;
    const g = ctx.createLinearGradient(0, 0, 0, rr(rng, 60, 300));
    g.addColorStop(0, 'rgba(74,42,22,.18)'); g.addColorStop(1, 'rgba(74,42,22,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, rr(rng, 1, 3), h);
  }
  const map = canvasTexture(c, { repeat: [1, 20] });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const b = makeCanvas(w, h);
  const bx = b.getContext('2d');
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) {
    const g = bx.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, '#4a4a4a'); g.addColorStop(.5, '#bdbdbd'); g.addColorStop(1, '#444');
    bx.fillStyle = g; bx.fillRect(x, 0, 8, h);
  }
  const bump = canvasTexture(b, { srgb: false, repeat: [1, 20] });
  return { map, bump };
}

function makeCityFacade() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const rng = mulberry32(17);
  ctx.fillStyle = '#7b7566'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(${rr(rng, 20, 80)},${rr(rng, 18, 70)},${rr(rng, 10, 50)},${rr(rng, .01, .08)})`;
    ctx.fillRect(rng() * 512, rng() * 512, rr(rng, 2, 14), rr(rng, 2, 10));
  }
  for (let y = 26; y < 512; y += 64) {
    for (let x = 20; x < 512; x += 52) {
      ctx.fillStyle = rng() > 0.82 ? '#d8b46a' : '#30383b';
      ctx.fillRect(x, y, 24, 32);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(x, y + 30, 24, 4);
    }
  }
  return canvasTexture(c, { repeat: [2, 2] });
}

function makeLeafTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const rng = mulberry32(21);
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    const x = 256 + (rng() - .5) * 420;
    const y = 256 + (rng() - .5) * 420;
    if (Math.hypot(x - 256, y - 256) > 250) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * TAU);
    const g = 60 + rng() * 55;
    ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.38},${rr(rng, .5, .95)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, rr(rng, 5, 16), rr(rng, 2, 7), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return canvasTexture(c);
}

function makeClockFace() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(5);
  ctx.fillStyle = '#f0e7d2'; ctx.beginPath(); ctx.arc(256, 256, 252, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(256, 256, 100, 256, 256, 252);
  g.addColorStop(0, 'rgba(255,255,245,.35)'); g.addColorStop(1, 'rgba(120,108,86,.2)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(256, 256, 252, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1e2426'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(256, 256, 232, 0, TAU); ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const big = i % 5 === 0;
    ctx.strokeStyle = '#20242a'; ctx.lineWidth = big ? 9 : 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * (big ? 180 : 202), 256 + Math.sin(a) * (big ? 180 : 202));
    ctx.lineTo(256 + Math.cos(a) * 220, 256 + Math.sin(a) * 220);
    ctx.stroke();
  }
  ctx.fillStyle = '#1a1d20'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 48px Georgia, serif';
  const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  nums.forEach((n, i) => {
    const a = (i / 12) * TAU - Math.PI / 2;
    ctx.fillText(n, 256 + Math.cos(a) * 146, 256 + Math.sin(a) * 146);
  });
  ctx.font = '600 19px "Manrope", sans-serif';
  ctx.fillStyle = '#5b5344';
  ctx.fillText('BHARAT NAGAR · JUNCTION', 256, 326);
  // hands at 4:10
  const drawHand = (angle, len, width) => {
    ctx.strokeStyle = '#15181a'; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(angle) * len, 256 + Math.sin(angle) * len);
    ctx.stroke();
  };
  drawHand((-Math.PI / 2) + (4 + 10 / 60) / 12 * TAU, 116, 11);
  drawHand((-Math.PI / 2) + (10 / 60) * TAU, 178, 7);
  ctx.fillStyle = '#15181a'; ctx.beginPath(); ctx.arc(256, 256, 10, 0, TAU); ctx.fill();
  // weather wear
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU, r = rr(rng, 200, 250);
    ctx.fillStyle = `rgba(0,0,0,${rr(rng, .1, .4)})`;
    ctx.beginPath(); ctx.arc(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, rr(rng, 1, 8), 0, TAU); ctx.fill();
  }
  return canvasTexture(c, { srgb: true });
}

function makeEnamelSign(en, hi, sub) {
  const w = 1600, h = 560;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = mulberry32(61);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#132c34'); g.addColorStop(.5, '#0d232a'); g.addColorStop(1, '#091a20');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(210,225,225,${rr(rng, .01, .05)})`;
    ctx.fillRect(rng() * w, rng() * h, rr(rng, 1, 8), rr(rng, 1, 3));
  }
  ctx.strokeStyle = '#e9dfc8'; ctx.lineWidth = 12;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.strokeStyle = 'rgba(233,223,200,.35)'; ctx.lineWidth = 3;
  ctx.strokeRect(44, 44, w - 88, h - 88);
  ctx.fillStyle = '#f4ecda'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '500 92px "Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif';
  ctx.fillText(hi, w / 2, 138);
  ctx.font = '800 132px "Manrope", sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText(en, w / 2, 292);
  ctx.font = '500 42px "Manrope", sans-serif';
  ctx.letterSpacing = '7px';
  ctx.fillStyle = '#b9c9cc';
  ctx.fillText(sub, w / 2, 430);
  ctx.fillStyle = '#d8b45e';
  ctx.fillRect(w * .31, 365, w * .38, 3);
  // enamel chips
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(245,240,228,${rr(rng, .08, .3)})`;
    ctx.beginPath();
    ctx.ellipse(rng() * w, rng() * h, rr(rng, 1, 5), rr(rng, 1, 3), rng() * TAU, 0, TAU);
    ctx.fill();
  }
  return canvasTexture(c, { srgb: true });
}

function archPaneGeo(w, h) {
  const r = w / 2;
  const spring = h - r;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, spring);
  s.absarc(0, spring, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s, 24);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + r) / w, pos.getY(i) / h);
  return geo;
}

function makeArcadeInteriorTex() {
  const W = 256, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(83);
  ctx.fillStyle = '#16120e'; ctx.fillRect(0, 0, W, H);
  // warm interior wash, brightest under the ceiling
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f6d8a4');
  g.addColorStop(0.22, '#d9ac6d');
  g.addColorStop(0.5, '#8d6238');
  g.addColorStop(0.78, '#5a3f27');
  g.addColorStop(1, '#2c2118');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // ceiling lights
  for (let i = 0; i < 3; i++) {
    const x = W * (0.22 + i * 0.28), y = 46 + (i % 2) * 10;
    const r = ctx.createRadialGradient(x, y, 2, x, y, 64);
    r.addColorStop(0, 'rgba(255,244,214,0.95)');
    r.addColorStop(0.35, 'rgba(255,224,168,0.4)');
    r.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = r; ctx.fillRect(x - 70, y - 70, 140, 140);
  }
  // concourse silhouettes: counter, columns, a few passengers
  ctx.fillStyle = 'rgba(30,23,16,0.82)';
  ctx.fillRect(0, H * 0.6, W, H * 0.055);
  for (let i = 0; i < 4; i++) {
    const x = 24 + i * 58 + rng() * 14;
    ctx.fillRect(x, H * 0.47, 13, H * 0.13);
    ctx.beginPath(); ctx.arc(x + 6.5, H * 0.455, 6.5, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(30,23,16,0.5)';
  for (const x of [W * 0.34, W * 0.68]) ctx.fillRect(x, H * 0.12, 10, H * 0.72);
  // grime and mullion falloff
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(20,15,10,${rr(rng, 0.04, 0.16)})`;
    ctx.fillRect(rng() * W, rng() * H, rr(rng, 2, 12), rr(rng, 2, 18));
  }
  return canvasTexture(c, { srgb: true });
}

function archRingGeo(w, h, thickness, depth) {
  const r = w / 2;
  const spring = h - r;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, spring);
  s.absarc(0, spring, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(r - thickness, 0);
  s.lineTo(r - thickness, spring);
  s.absarc(0, spring, r - thickness, 0, Math.PI, false);
  s.lineTo(-r + thickness, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 18 });
  geo.computeVertexNormals();
  return geo;
}

function makePuddleMask() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const rng = mulberry32(4);
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 22; i++) {
    const x = rng() * 512, y = rng() * 512, r = rr(rng, 20, 90);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * rr(rng, .25, .75), rng() * TAU, 0, TAU); ctx.fill();
  }
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// -------------------------------------------------------------------- station
export function buildStation(scene, mats, tex) {
  const root = new THREE.Group();
  root.name = 'station';
  scene.add(root);
  const P = PLATFORM.y;
  const glow = makeGlowSprite();
  const corrugated = makeCorrugated();
  const cityFacade = makeCityFacade();
  const leafTex = makeLeafTexture();
  const tiles = makePlatformTiles();
  const granite = makeGranite();
  const redWallMap = makeRedWall();
  const clockTex = makeClockFace();
  const circleTex = makeCircleMark();
  const lights = { practicals: [], lampBulbs: [], warm: [], arcade: null };
  const animated = { flags: [], waves: [], lampGlow: [] };
  const moodRefs = {};

  const b = new MeshBatch('station');

  // ---------------------------------------------------------------- ground
  const earth = mats.photo('concrete', { repeat: [80, 80], color: 0x5d584a, normalScale: 0.45 });
  b.add(new THREE.PlaneGeometry(1600, 1600), earth, { pos: [0, -0.08, 0], rot: [-Math.PI / 2, 0, 0], castShadow: false });

  // tracks
  for (const x of [0, -7.2, -14.4]) buildTrack(scene, mats, { x, z0: -220, z1: 220 });
  buildCatenary(scene, mats, { z0: -200, z1: 200, spacing: 38, tracks: [0, -7.2, -14.4] });
  const signal = buildSignalGantry(scene, mats, { z: -146 });
  buildSignalGantry(scene, mats, { z: 155, x: -2 });

  // ------------------------------------------------------------ platform slab
  const pw = PLATFORM.x1 - PLATFORM.x0, pl = PLATFORM.z1 - PLATFORM.z0;
  const pcx = (PLATFORM.x0 + PLATFORM.x1) / 2, pcz = (PLATFORM.z0 + PLATFORM.z1) / 2;

  const tileMat = new THREE.MeshStandardMaterial({
    map: tiles.map, roughnessMap: tiles.rough, bumpMap: tiles.bump, bumpScale: 0.014,
    color: 0xf7eee2, roughness: 0.62, metalness: 0.04,
    envMapIntensity: 0.9,
  });
  moodRefs.tileMat = tileMat;

  // slab body and edge face
  b.box(pw, 0.32, pl, mats.concrete([7, 48], 0x8e8575), { pos: [pcx, P - 0.16, pcz], castShadow: false });
  b.box(0.46, 1.02, pl, mats.painted(0x241f1b, { roughness: 0.55, metalness: 0.1, seed: 3 }), { pos: [PLATFORM.x0 + 0.23, P - 0.5, pcz], castShadow: false });
  b.box(0.5, 0.09, pl, mats.painted(0xe6dfcf, { roughness: 0.6, seed: 9 }), { pos: [PLATFORM.x0 + 0.23, P - 0.015, pcz], castShadow: false });
  // tiled surface
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(pw, pl), tileMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(pcx, P + 0.004, pcz);
  floor.receiveShadow = true;
  root.add(floor);

  // dirt, wear and drips, painted over the whole platform in one draw
  const grime = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.04, pl), new THREE.MeshStandardMaterial({
    map: makePlatformGrime(), transparent: true, opacity: 0.92,
    roughness: 0.74, metalness: 0.02, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }));
  grime.rotation.x = -Math.PI / 2;
  grime.position.set(pcx, P + 0.0065, pcz);
  grime.renderOrder = 1;
  root.add(grime);

  // coping stone along the platform edge, with a shadow gap on its inner side
  b.box(0.5, 0.03, pl, mats.concrete([1, 60], 0xd2cbb9), { pos: [PLATFORM.x0 + 0.26, P - 0.002, pcz], radius: 0.012, castShadow: false });
  b.box(0.035, 0.012, pl, mats.painted(0x4b463c, { roughness: 0.95, seed: 5 }), { pos: [PLATFORM.x0 + 0.525, P + 0.009, pcz], castShadow: false });

  // drainage channel with cast-iron grating near the wall
  const grateTex = makeDrainGrate();
  const grate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, pl - 2), new THREE.MeshStandardMaterial({
    map: grateTex, roughness: 0.72, metalness: 0.35, color: 0xffffff,
  }));
  grate.rotation.x = -Math.PI / 2;
  grate.position.set(15.55, P + 0.010, pcz);
  grate.receiveShadow = true;
  root.add(grate);
  for (const dx of [-0.21, 0.21]) {
    b.box(0.06, 0.028, pl - 2, mats.painted(0x6b6659, { roughness: 0.85, seed: 4 }), { pos: [15.55 + dx, P + 0.012, pcz], castShadow: false });
  }
  // hairline cracks and patch repairs
  {
    const crng = mulberry32(551);
    const crack = mats.painted(0x5f5a4d, { roughness: 0.95, seed: 4 });
    for (let i = 0; i < 16; i++) {
      const z = rr(crng, -140, 70);
      const x = rr(crng, 4.0, 15.0);
      b.box(rr(crng, 0.02, 0.05), 0.003, rr(crng, 0.6, 2.4), crack, {
        pos: [x, P + 0.0095, z], rot: [0, rr(crng, -0.5, 0.5), 0], castShadow: false,
      });
    }
    for (let i = 0; i < 5; i++) {
      b.box(rr(crng, 0.4, 0.9), 0.004, rr(crng, 0.5, 1.2), mats.painted(0x8a8273, { roughness: 0.9, seed: 6 }), {
        pos: [rr(crng, 5, 14), P + 0.0078, rr(crng, -120, 60)], rot: [0, rr(crng, -1, 1), 0], castShadow: false,
      });
    }
  }

  // safety line + tactile strip
  const yellowPaint = new THREE.MeshStandardMaterial({
    map: tex.gen.edgeStripe, roughness: 0.55, metalness: 0.0, color: 0xf2d07c,
  });
  const yline = new THREE.Mesh(new THREE.PlaneGeometry(0.42, pl), yellowPaint);
  yline.rotation.x = -Math.PI / 2;
  yline.position.set(PLATFORM.x0 + 0.78, P + 0.012, pcz);
  root.add(yline);
  // raised tactile paving with real edges instead of a flat decal
  b.box(0.58, 0.018, pl, new THREE.MeshStandardMaterial({
    map: tex.gen.tactile, bumpMap: tex.gen.tactile, bumpScale: 0.02, roughness: 0.68, color: 0xefc75c,
  }), { pos: [PLATFORM.x0 + 1.24, P + 0.017, pcz], radius: 0.006, castShadow: false });
  // yellow edge lip
  b.box(0.12, 0.02, pl, mats.painted(0xe6c268, { roughness: 0.55, seed: 2 }), { pos: [PLATFORM.x0 + 0.05, P + 0.005, pcz], castShadow: false });

  // expansion joints
  const seam = mats.painted(0x514e46, { roughness: 0.95, seed: 12 });
  for (let z = PLATFORM.z0 + 6; z < PLATFORM.z1; z += 7.5) {
    b.box(pw - 0.4, 0.009, 0.035, seam, { pos: [pcx, P + 0.008, z], castShadow: false });
  }

  // white standing circles
  const circleMat = new THREE.MeshBasicMaterial({
    map: circleTex, transparent: true, depthWrite: false, opacity: 1,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  for (let i = 0; i < 26; i++) {
    const z = -92 + i * 6.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), circleMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = i % 2 ? 0.4 : 0;
    m.position.set(i % 3 === 0 ? 7.2 : i % 3 === 1 ? 10.4 : 12.3, P + 0.011, z);
    m.renderOrder = 1;
    root.add(m);
  }

  // oil and pan stains
  const stainMat = new THREE.MeshStandardMaterial({ color: 0x2f2a22, roughness: 0.52, transparent: true, opacity: 0.2, depthWrite: false });
  for (let i = 0; i < 20; i++) {
    const rng = mulberry32(i * 11 + 5);
    const geo = new THREE.CircleGeometry(rr(rng, .2, .9), 16);
    geo.scale(1, rr(rng, .5, 1.4), 1);
    const m = new THREE.Mesh(geo, stainMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rng() * TAU;
    m.position.set(rr(rng, 3, 16.5), P + 0.006, rr(rng, -120, 60));
    root.add(m);
  }

  // wet sheen layer
  const wetMat = new THREE.MeshPhysicalMaterial({
    color: 0x172026, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0,
    envMapIntensity: 1.8, depthWrite: false,
  });
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 250), wetMat);
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(9.8, P + 0.02, -20);
  root.add(wet);
  moodRefs.wetMat = wetMat;

  // puddles
  const puddleTex = makePuddleMask();
  const puddleMat = new THREE.MeshPhysicalMaterial({
    map: puddleTex, transparent: true, roughness: 0.055, metalness: 0.55, color: 0x0f171b,
    envMapIntensity: 2.2, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 10), puddleMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = i * 1.7;
    m.position.set(5.2 + (i % 2) * 6.5, P + 0.022, -50 + i * 22);
    root.add(m);
  }
  moodRefs.puddleMat = puddleMat;

  // ---------------------------------------------------------- station building
  const wallMat = new THREE.MeshStandardMaterial({
    map: redWallMap, bumpMap: redWallMap, bumpScale: 0.006, roughness: 0.82, metalness: 0.02,
    color: 0xffffff,
  });
  const cream = mats.painted(0xe8dfc9, { roughness: 0.74, metalness: 0.0, seed: 5, clearcoat: 0.08 });
  const white = mats.painted(0xf1ead8, { roughness: 0.7, metalness: 0.0, seed: 6, clearcoat: 0.06 });
  const graniteMat = new THREE.MeshPhysicalMaterial({
    map: granite.map, roughnessMap: granite.rough, color: 0xffffff,
    roughness: 0.35, metalness: 0.15, clearcoat: 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.8,
  });
  const darkTrim = mats.painted(0x26282a, { roughness: 0.6, metalness: 0.25, seed: 8 });
  const windowGlass = mats.glass(0x122126, 0.84, 0.16);
  const arcadeTex = makeArcadeInteriorTex();
  const archLitMat = new THREE.MeshStandardMaterial({
    map: arcadeTex, roughness: 0.62, metalness: 0.03,
    emissive: 0xffffff, emissiveMap: arcadeTex, emissiveIntensity: 0.2,
  });
  lights.arcade = archLitMat;

  const facadeX = 17.0;
  const xBack = 29.6;
  const bz0 = -102, bz1 = 62;
  const blen = bz1 - bz0, bzc = (bz0 + bz1) / 2;

  // main mass
  b.box(xBack - facadeX, 9.7, blen, wallMat, { pos: [(facadeX + xBack) / 2, P + 4.85, bzc], radius: 0.04 });

  // black granite plinth
  b.box(0.5, 1.55, blen, graniteMat, { pos: [facadeX - 0.08, P + 0.775, bzc] });
  b.box(0.58, 0.12, blen, white, { pos: [facadeX - 0.08, P + 1.61, bzc] });
  // white string courses
  b.box(0.42, 0.24, blen, white, { pos: [facadeX - 0.04, P + 5.42, bzc] });
  b.box(0.48, 0.34, blen, white, { pos: [facadeX - 0.04, P + 9.2, bzc] });
  b.box(0.4, 0.16, blen, cream, { pos: [facadeX - 0.02, P + 9.55, bzc] });
  // parapet
  b.box(0.55, 0.95, blen, wallMat, { pos: [facadeX + 0.1, P + 10.15, bzc] });
  b.box(0.75, 0.16, blen, white, { pos: [facadeX + 0.1, P + 10.7, bzc] });
  // balustrade posts along the parapet
  for (let z = bz0 + 1.2; z < bz1; z += 2.5) {
    b.box(0.2, 0.42, 0.2, cream, { pos: [facadeX - 0.12, P + 10.3, z], castShadow: false });
  }
  // rooftop
  b.box(xBack - facadeX - 0.4, 0.18, blen - 0.4, mats.concrete([4, 30], 0x8d8677), { pos: [(facadeX + xBack) / 2, P + 9.78, bzc], castShadow: false });

  const bayPitch = 5.2;
  const bayCentres = [];
  for (let z = bz0 + bayPitch / 2; z < bz1; z += bayPitch) bayCentres.push(z);

  // opaque, slightly reflective panes set behind the arch rings
  const archGlass = new THREE.MeshStandardMaterial({
    color: 0x2b3c40, roughness: 0.18, metalness: 0.2,
    envMapIntensity: 1.05, side: THREE.DoubleSide,
  });
  const archWindow = ({ x, z, baseY, springY, halfW, mat, mullions = 3 }) => {
    const paneH = (springY - baseY) + halfW;
    b.add(archPaneGeo(halfW * 2, paneH), mat, {
      pos: [x, baseY, z], rot: [0, -Math.PI / 2, 0], castShadow: false, receiveShadow: false,
    });
    for (let k = 1; k <= mullions; k++) {
      const dx = -halfW + (k / (mullions + 1)) * halfW * 2;
      const top = springY + Math.sqrt(Math.max(0, halfW * halfW - dx * dx));
      b.box(0.04, top - baseY, 0.028, darkTrim, { pos: [x - 0.025, (top + baseY) / 2, z + dx], castShadow: false });
    }
    b.box(0.04, 0.045, halfW * 2, darkTrim, { pos: [x - 0.025, springY, z], castShadow: false });
  };

  // facade bays
  for (const z of bayCentres) {
    // pilasters
    b.box(0.34, 3.75, 0.62, white, { pos: [facadeX - 0.15, P + 3.58, z - bayPitch / 2] });
    b.box(0.46, 0.22, 0.82, cream, { pos: [facadeX - 0.17, P + 5.36, z - bayPitch / 2] });
    b.box(0.4, 0.2, 0.7, cream, { pos: [facadeX - 0.17, P + 1.86, z - bayPitch / 2] });
    // upper pilaster
    b.box(0.26, 3.1, 0.5, cream, { pos: [facadeX - 0.12, P + 7.28, z] });

    // ground arch: white ring + arched glazing set into the wall
    const aw = 3.0, ah = 3.05;
    const bayIndex = Math.round((z - bz0) / bayPitch);
    const ring = new THREE.Mesh(archRingGeo(aw, ah, 0.17, 0.2), white);
    ring.position.set(facadeX + 0.14, P + 1.72, z);
    ring.rotation.y = -Math.PI / 2;
    ring.castShadow = true; ring.receiveShadow = true;
    root.add(ring);
    const lit = bayIndex % 3 === 1;
    const springY = P + 1.72 + (ah - aw / 2);
    archWindow({
      x: facadeX - 0.02, z, baseY: P + 1.84, springY, halfW: aw / 2 - 0.22,
      mat: lit ? archLitMat : archGlass, mullions: 3,
    });
    // security grille on some bays
    if (!lit && bayIndex % 7 === 3) {
      const gh = springY - P - 1.95;
      for (let i = 0; i < 11; i++) {
        b.box(0.03, gh, 0.022, darkTrim, { pos: [facadeX - 0.11, P + 1.95 + gh / 2, z - 1.1 + i * 0.22], castShadow: false });
      }
    }

    // upper arched window
    const uw = 1.75, uh = 2.5;
    archWindow({
      x: facadeX - 0.02, z, baseY: P + 6.08, springY: P + 6.0 + (uh - uw / 2),
      halfW: uw / 2 - 0.13, mat: archGlass, mullions: 2,
    });
    const uring = new THREE.Mesh(archRingGeo(uw, uh, 0.12, 0.16), white);
    uring.position.set(facadeX + 0.12, P + 6.0, z);
    uring.rotation.y = -Math.PI / 2;
    uring.castShadow = true;
    root.add(uring);
    // sill
    b.box(0.3, 0.12, uw + 0.36, cream, { pos: [facadeX - 0.08, P + 5.94, z] });
    // little balcony rail on alternating bays
    if (Math.round((z - bz0) / bayPitch) % 3 === 1) {
      b.box(0.34, 0.06, uw + 0.55, cream, { pos: [facadeX - 0.3, P + 5.88, z] });
      for (let k = 0; k < 7; k++) {
        b.box(0.025, 0.5, 0.025, darkTrim, { pos: [facadeX - 0.42, P + 6.12, z - uw / 2 + k * (uw / 6)], castShadow: false });
      }
      b.box(0.03, 0.03, uw + 0.4, darkTrim, { pos: [facadeX - 0.42, P + 6.37, z], castShadow: false });
    }
  }

  // dentils under the cornice
  for (let z = bz0 + 0.9; z < bz1; z += 0.62) {
    b.box(0.28, 0.26, 0.24, white, { pos: [facadeX - 0.05, P + 8.92, z], castShadow: false });
  }
  // cornice brackets
  for (let z = bz0 + 2.2; z < bz1; z += 2.6) {
    b.box(0.5, 0.4, 0.18, cream, { pos: [facadeX - 0.16, P + 9.5, z], rot: [0, 0, 0.12], castShadow: false });
  }

  // ground-floor signage over selected arches
  const arcadeSigns = [
    ['BOOKING OFFICE', 'आरक्षण कार्यालय', -18], ['ENQUIRY', 'पूछताछ', -28.4],
    ['WAITING ROOM', 'प्रतीक्षा कक्ष', 5.6], ['RESTAURANT', 'भोजनालय', 21.2],
    ['PARCEL OFFICE', 'पार्सल कार्यालय', 37.6], ['RETIRING ROOM', 'विश्राम कक्ष', -49.2],
    ['TOILETS', 'शौचालय', 48],
  ];
  for (const [en, hi, z] of arcadeSigns) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.54), new THREE.MeshStandardMaterial({
      map: tex.label({ w: 1200, h: 200, text: en, hi, bg: '#0f2a31', color: '#f4ecd9', subColor: '#c9d9d7', size: 68, subSize: 30, weight: 700, letterSpacing: 2 }),
      roughness: 0.62, emissive: 0xffffff,
      emissiveMap: tex.label({ w: 1200, h: 200, text: en, hi, bg: '#0f2a31', color: '#f4ecd9', subColor: '#c9d9d7', size: 68, subSize: 30, weight: 700, letterSpacing: 2 }),
      emissiveIntensity: 0.07, side: THREE.DoubleSide,
    }));
    sign.position.set(facadeX - 0.32, P + 5.02, z);
    sign.rotation.y = -Math.PI / 2;
    root.add(sign);
  }

  // main enamel sign on the facade
  const mainSignTex = makeEnamelSign('BHARAT NAGAR', 'भारत नगर', 'JUNCTION · WESTERN RAILWAY');
  const mainSign = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.64), new THREE.MeshStandardMaterial({
    map: mainSignTex, roughness: 0.55, emissive: 0xffffff, emissiveMap: mainSignTex,
    emissiveIntensity: 0.14, side: THREE.DoubleSide,
  }));
  mainSign.position.set(facadeX - 0.38, P + 7.98, -16.8);
  mainSign.rotation.y = -Math.PI / 2;
  root.add(mainSign);
  // sign frame
  b.box(0.14, 3.9, 10.7, cream, { pos: [facadeX - 0.18, P + 7.98, -16.8] });

  // running boards further along
  for (const z of [-62, 33, 54]) {
    const t = makeEnamelSign('BHARAT NAGAR', 'भारत नगर', 'PLATFORM 1 · प्लेटफार्म १');
    const s = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.82), new THREE.MeshStandardMaterial({
      map: t, roughness: 0.55, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1, side: THREE.DoubleSide,
    }));
    s.position.set(facadeX - 0.36, P + 7.3, z);
    s.rotation.y = -Math.PI / 2;
    root.add(s);
  }

  // ----------------------------------------------------------- clock tower
  {
    const tz = -17.5;
    const tw = 7.6, td = 6.5;
    const tx = 17.4 + td / 2;
    const base = P + 9.4;
    // body
    b.box(td, 9.6, tw, wallMat, { pos: [tx, base + 4.8, tz], radius: 0.03 });
    // white corner pilasters
    for (const dz of [-tw / 2 + 0.28, tw / 2 - 0.28]) {
      b.box(0.4, 9.5, 0.55, white, { pos: [17.16, base + 4.75, tz + dz] });
      b.box(0.7, 0.24, 0.8, cream, { pos: [17.12, base + 9.34, tz + dz] });
    }
    // long arched openings on the platform face
    for (const dz of [-1.85, 1.85]) {
      const ring = new THREE.Mesh(archRingGeo(1.7, 2.9, 0.14, 0.18), white);
      ring.position.set(17.2, base + 3.0, tz + dz);
      ring.rotation.y = -Math.PI / 2;
      ring.castShadow = true;
      root.add(ring);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.65), windowGlass);
      pane.position.set(17.12, base + 3.0 + 1.32, tz + dz);
      pane.rotation.y = -Math.PI / 2;
      root.add(pane);
    }
    // white band under clock stage
    b.box(td + 0.5, 0.34, tw + 0.5, white, { pos: [tx, base + 9.7, tz] });
    // clock stage
    const stageBase = base + 9.9;
    b.box(td + 0.2, 2.9, tw + 0.2, wallMat, { pos: [tx, stageBase + 1.45, tz], radius: 0.02 });
    b.box(td + 0.55, 0.24, tw + 0.55, white, { pos: [tx, stageBase + 2.95, tz] });
    // clocks on three faces
    const addClock = (x, y, z, ry) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.1, 8, 40), cream);
      ring.position.set(x, y, z); ring.rotation.y = ry;
      root.add(ring);
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.28, 40), new THREE.MeshStandardMaterial({
        map: clockTex, roughness: 0.55, metalness: 0.02, emissive: 0xffffff, emissiveMap: clockTex, emissiveIntensity: 0.16,
      }));
      face.position.set(x + (ry === -Math.PI / 2 ? -0.04 : 0), y, z + (ry === 0 ? 0.04 : ry === Math.PI ? -0.04 : 0));
      face.rotation.y = ry;
      root.add(face);
    };
    addClock(17.2, stageBase + 1.5, tz, -Math.PI / 2);
    addClock(tx, stageBase + 1.5, tz + tw / 2 + 0.12, 0);
    addClock(tx, stageBase + 1.5, tz - tw / 2 - 0.12, Math.PI);
    // louvred stage above
    b.box(td - 0.3, 1.1, tw - 0.3, cream, { pos: [tx, stageBase + 3.7, tz] });
    for (let i = 0; i < 8; i++) {
      b.box(td - 0.1, 0.05, 0.03, darkTrim, { pos: [tx, stageBase + 3.35 + i * 0.1, tz + tw / 2 - 0.14] });
    }
    // pyramid roof and finial
    const roof = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.78, 4.3, 4), mats.painted(0xe8e3d6, { roughness: 0.5, metalness: 0.1, seed: 7 }));
    roof.position.set(tx, stageBase + 6.4, tz);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    root.add(roof);
    b.cyl(0.06, 0.09, 2.2, mats.metal(0x6f7472, 0.4, 0.8), { pos: [tx, stageBase + 9.6, tz], seg: 8 });
    b.sphere(0.16, mats.brass, { pos: [tx, stageBase + 10.7, tz], seg: 10 });
    // lightning conductor
    b.cyl(0.02, 0.02, 1.4, mats.metal(0x3d4242, 0.5, 0.8), { pos: [tx, stageBase + 11.5, tz], seg: 6 });
  }

  // end pavilions
  for (const z of [-97, 56]) {
    b.box(6.2, 3.4, 5.2, wallMat, { pos: [19.6, P + 11.55, z], radius: 0.03 });
    b.box(6.8, 0.28, 5.8, white, { pos: [19.6, P + 13.35, z] });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 10, 0, TAU, 0, Math.PI / 2), cream);
    dome.position.set(19.6, P + 13.5, z);
    dome.castShadow = true;
    root.add(dome);
    b.cyl(0.05, 0.07, 1.3, mats.brass, { pos: [19.6, P + 16.1, z], seg: 8 });
  }

  // clerestory / rooftop vents
  for (let z = -86; z < 54; z += 20) {
    b.box(5.2, 1.0, 3.2, cream, { pos: [24, P + 10.3, z] });
    b.box(4.8, 0.6, 2.8, windowGlass, { pos: [24, P + 10.3, z + 0.001], castShadow: false });
  }

  // rooftop water tanks and dishes
  for (let i = 0; i < 5; i++) {
    const x = 21 + (i % 2) * 4;
    const z = -80 + i * 28;
    b.cyl(1.1, 1.1, 1.7, mats.painted(0x34393a, { seed: 3 }), { pos: [x, P + 11.4, z], seg: 20 });
    b.cyl(1.14, 1.14, 0.1, mats.painted(0x1f2323, { seed: 2 }), { pos: [x, P + 12.3, z], seg: 20 });
    for (let k = 0; k < 4; k++) b.box(0.12, 0.8, 0.12, mats.metal(0x555b5b, 0.5, 0.6), { pos: [x - 0.7 + (k % 2) * 1.4, P + 10.7, z - 0.7 + Math.floor(k / 2) * 1.4] });
  }
  for (let i = 0; i < 3; i++) {
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 6, 0, TAU, 0, Math.PI / 2), mats.painted(0xd6d2c4, { seed: 2 }));
    dish.scale.set(1, 0.35, 1);
    dish.position.set(24, P + 11.8, -44 + i * 30);
    dish.rotation.set(0.7, 0, 0.9);
    root.add(dish);
  }

  // station flagpole
  {
    const poleX = 15.95, poleZ = -78;
    b.cyl(0.06, 0.12, 9.5, mats.metal(0x787f7e, 0.4, 0.8), { pos: [poleX, P + 4.75, poleZ], seg: 10 });
    b.sphere(0.12, mats.brass, { pos: [poleX, P + 9.52, poleZ], seg: 10 });
    const flagGeo = new THREE.PlaneGeometry(1.9, 1.25, 24, 10);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
      map: tex.flag(), side: THREE.DoubleSide, roughness: 0.85,
    }));
    flag.position.set(poleX - 0.95, P + 8.55, poleZ);
    flag.userData.dynamic = true;
    root.add(flag);
    animated.flags.push({ mesh: flag, base: flagGeo.attributes.position.array.slice(), phase: 1.2 });
  }

  // pipes and cables along the facade
  for (const y of [P + 4.55, P + 5.1]) {
    b.box(0.07, 0.07, blen - 6, mats.painted(0x22201c, { roughness: 0.7, seed: 4 }), { pos: [facadeX - 0.22, y, bzc], castShadow: false });
  }
  for (let z = bz0 + 4; z < bz1; z += 7.8) {
    b.box(0.09, 5.2, 0.07, mats.painted(0x22201c, { roughness: 0.7, seed: 4 }), { pos: [facadeX - 0.23, P + 6.9, z], castShadow: false });
    b.box(0.36, 0.5, 0.3, mats.painted(0xb8b1a0, { seed: 3 }), { pos: [facadeX - 0.36, P + 6.3, z], castShadow: false });
  }

  // --------------------------------------------------------------- canopy
  {
    const roofMat = new THREE.MeshStandardMaterial({
      map: corrugated.map, bumpMap: corrugated.bump, bumpScale: 0.02,
      roughness: 0.62, metalness: 0.26, color: 0xb3bcb4, envMapIntensity: 0.9, side: THREE.DoubleSide,
      emissive: 0x404640, emissiveIntensity: 0.1,
    });
    // Pale insulated lining seen from the platform. Keep it a warm mid-grey:
    // when it gets too bright the whole ceiling blows out and reads as sky,
    // which was the single biggest reason the platform looked unfinished.
    const roofLiner = new THREE.MeshStandardMaterial({
      color: 0xc9bfa9, roughness: 0.94, metalness: 0.02,
      emissive: 0xd6c7a9, emissiveIntensity: 0.62, side: THREE.DoubleSide,
    });
    const colMat = mats.painted(0x405449, { roughness: 0.56, metalness: 0.28, seed: 28, variation: 1.2 });
    const beamMat = mats.painted(0x8c938d, { roughness: 0.52, metalness: 0.42, seed: 18, variation: 1.1 });
    const fasciaMat = mats.painted(0x3e5a4c, { roughness: 0.62, metalness: 0.18, seed: 7 });
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x33332c, emissive: 0xfff0cf, emissiveIntensity: 0.9, roughness: 0.4,
    });
    lights.practicals.push(tubeMat);
    const glassSky = new THREE.MeshPhysicalMaterial({
      color: 0xd7e2dd, roughness: 0.24, metalness: 0.0, transparent: true, opacity: 0.46,
      side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.8,
    });
    const zStart = -96, zEnd = 66;
    const xLeft = 4.7, xRight = 16.5, ridgeX = 10.6;
    const eaveY = P + 7.05, ridgeY = P + 8.6;
    const bay = 5.9, colBay = 11.8;
    const roofAt = (t) => eaveY + (ridgeY - eaveY) * (t <= 0.5 ? t * 2 : (1 - t) * 2);

    // columns every second bay
    for (let z = zStart; z <= zEnd; z += colBay) {
      for (const x of [xLeft, xRight]) {
        b.box(0.95, 0.44, 0.95, mats.concrete([1, 1], 0x8e8679), { pos: [x, P + 0.22, z] });
        b.cyl(0.28, 0.4, 0.18, colMat, { pos: [x, P + 0.53, z], seg: 16 });
        b.cyl(0.16, 0.24, 6.18, colMat, { pos: [x, P + 3.74, z], seg: 18 });
        for (const hy of [1.02, 3.46, 6.58]) b.cyl(0.235, 0.235, 0.13, colMat, { pos: [x, P + hy, z], seg: 18 });
        b.box(0.6, 0.22, 0.6, colMat, { pos: [x, P + 6.9, z] });
        b.box(0.74, 0.16, 0.74, beamMat, { pos: [x, P + 7.03, z] });
        // capital scrolls
        for (const sx of [-1, 1]) {
          b.tube([[x + sx * 0.06, P + 6.55, z], [x + sx * 0.4, P + 6.73, z], [x + sx * 0.31, P + 6.98, z]], 0.028, colMat);
        }
      }
    }

    // gable trusses every bay
    for (let z = zStart; z <= zEnd; z += bay) {
      const zt = z;
      // top chords following the roof pitch
      b.tube([[xLeft, roofAt(0) - 0.11, zt], [ridgeX, roofAt(0.5) - 0.11, zt], [xRight, roofAt(1) - 0.11, zt]], 0.08, beamMat, { tubularSegments: 2, radialSegments: 5 });
      // cambered bottom chord
      b.tube([[xLeft, eaveY - 1.18, zt], [ridgeX, eaveY - 0.78, zt], [xRight, eaveY - 1.18, zt]], 0.055, beamMat, { tubularSegments: 2, radialSegments: 4 });
      for (let k = 1; k < 12; k++) {
        const t = k / 12;
        const xx = xLeft + (xRight - xLeft) * t;
        const yTop = roofAt(t) - 0.12;
        const yBot = eaveY - 1.18 + Math.sin(t * Math.PI) * 0.4;
        b.box(0.03, Math.max(0.05, yTop - yBot), 0.03, beamMat, { pos: [xx, (yTop + yBot) / 2, zt], castShadow: false });
        if (k < 11) {
          const t2 = (k + 1) / 12;
          const x2 = xLeft + (xRight - xLeft) * t2;
          const yTop2 = roofAt(t2) - 0.12;
          b.tube([[xx, yBot, zt], [x2, yTop2 - 0.05, zt]], 0.018, beamMat, { tubularSegments: 1, radialSegments: 3, castShadow: false });
        }
      }
      // two rows of fluorescent battens per bay
      for (const bx of [7.5, 13.7]) {
        b.tube([[bx, P + 7.62, zt], [bx, P + 7.18, zt]], 0.012, mats.blackMetal, { castShadow: false });
        b.box(0.16, 0.08, 1.62, mats.painted(0x4a4f4a, { roughness: 0.5, seed: 2 }), { pos: [bx, P + 7.13, zt], castShadow: false });
        b.box(0.1, 0.035, 1.5, tubeMat, { pos: [bx, P + 7.06, zt], castShadow: false });
        lights.lampBulbs.push({ x: bx, y: P + 7.06, z: zt });
      }
      // hanging sign every 4th bay, kept clear of the arrival camera
      if (zt > -42 && Math.abs(((zt - zStart) / bay) % 4) < 0.2) {
        const label = zt < -30
          ? tex.label({ w: 1400, h: 300, text: 'PLATFORM 1', hi: 'प्लेटफार्म १', bg: '#0e2a30', color: '#f4ecd8', subColor: '#c9d6d4', size: 104, subSize: 40, weight: 800, letterSpacing: 3 })
          : tex.label({ w: 1400, h: 300, text: 'WAY OUT  →', hi: 'बाहर जाने का रास्ता', bg: '#0e2a30', color: '#f4ecd8', subColor: '#c9d6d4', size: 100, subSize: 38, weight: 800, letterSpacing: 2 });
        const hangMat = new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 });
        const hanging = new THREE.Group();
        for (const face of [0, Math.PI]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.54), hangMat);
          m.rotation.y = face;
          m.position.z = face ? -0.008 : 0.008;
          hanging.add(m);
        }
        hanging.position.set(ridgeX, P + 5.25, zt);
        root.add(hanging);
        for (const dx of [-1.0, 1.0]) {
          b.cyl(0.012, 0.012, 3.0, mats.blackMetal, { pos: [ridgeX + dx, P + 6.95, zt], seg: 4, castShadow: false });
        }
      }
    }

    // continuous purlins and eave beams
    for (const t of [0.15, 0.3, 0.5, 0.7, 0.85]) {
      const xx = xLeft + (xRight - xLeft) * t;
      b.box(0.08, 0.1, zEnd - zStart, beamMat, { pos: [xx, roofAt(t) - 0.2, (zStart + zEnd) / 2], castShadow: false });
    }
    for (const x of [xLeft, xRight]) {
      b.box(0.24, 0.26, zEnd - zStart, beamMat, { pos: [x, eaveY, (zStart + zEnd) / 2] });
    }
    // sway bracing between trusses
    for (let z = zStart; z < zEnd; z += bay) {
      for (const t of [0.24, 0.76]) {
        const x1 = xLeft + (xRight - xLeft) * t;
        const y1 = roofAt(t) - 0.28;
        const x2 = xLeft + (xRight - xLeft) * (t + 0.12);
        const y2 = roofAt(t + 0.12) - 0.28;
        b.tube([[x1, y1, z], [x2, y2, z + bay]], 0.015, beamMat, { tubularSegments: 2, radialSegments: 3, castShadow: false });
        b.tube([[x1, y1, z + bay], [x2, y2, z]], 0.015, beamMat, { tubularSegments: 2, radialSegments: 3, castShadow: false });
      }
    }

    // roof slopes: opaque panels with a continuous glazed ridge band
    const halfSpan = ridgeX - xLeft;
    const slopeAngle = Math.atan2(ridgeY - eaveY, halfSpan);
    const slopeLen = Math.hypot(halfSpan, ridgeY - eaveY);
    const addRoofStrip = (t0, t1, z, mat) => {
      const tMid = (t0 + t1) / 2;
      const xx = xLeft + (xRight - xLeft) * tMid;
      const yy = (roofAt(t0) + roofAt(t1)) / 2;
      const len = slopeLen * 2 * Math.abs(t1 - t0);
      const ang = tMid <= 0.5 ? slopeAngle : -slopeAngle;
      b.add(new THREE.BoxGeometry(len, 0.06, bay + 0.06), mat, {
        pos: [xx, yy, z + bay / 2],
        rot: [0, 0, ang],
        castShadow: mat !== glassSky,
        receiveShadow: mat !== glassSky,
      });
      if (mat !== glassSky) {
        b.add(new THREE.BoxGeometry(len - 0.02, 0.014, bay + 0.02), roofLiner, {
          pos: [xx, yy - 0.05, z + bay / 2],
          rot: [0, 0, ang],
          castShadow: false,
          receiveShadow: false,
        });
      }
    };
    let seg = 0;
    for (let z = zStart; z < zEnd; z += bay, seg++) {
      const isSky = seg % 6 === 3;
      if (isSky) {
        addRoofStrip(0, 0.5, z, glassSky);
        addRoofStrip(0.5, 1, z, glassSky);
      } else {
        addRoofStrip(0, 0.42, z, roofMat);
        addRoofStrip(0.42, 0.56, z, glassSky);
        addRoofStrip(0.56, 1, z, roofMat);
      }
      // cross ribs at the bay boundaries
      for (const t of [0.18, 0.34, 0.66, 0.82]) {
        const xx = xLeft + (xRight - xLeft) * t;
        b.box(0.06, 0.07, bay - 0.05, beamMat, { pos: [xx, roofAt(t) - 0.1, z + bay / 2], castShadow: false });
      }
    }
    // slim ridge cap and gutters
    b.box(0.18, 0.2, zEnd - zStart, beamMat, { pos: [ridgeX, ridgeY + 0.04, (zStart + zEnd) / 2] });
    for (const x of [xLeft, xRight]) {
      b.box(0.26, 0.2, zEnd - zStart, mats.metal(0x6b7170, 0.5, 0.7), { pos: [x, eaveY + 0.02, (zStart + zEnd) / 2] });
      b.box(0.16, 0.62, zEnd - zStart, fasciaMat, { pos: [x, eaveY - 0.33, (zStart + zEnd) / 2] });
      for (let z = zStart + 3; z < zEnd; z += 17) {
        b.cyl(0.06, 0.06, 6.0, mats.metal(0x5a6160, 0.45, 0.6), { pos: [x - 0.02, P + 3.9, z], seg: 8, castShadow: false });
      }
    }

    // running station name boards on both faces of the fascia
    for (let z = zStart + 7; z < zEnd; z += 21) {
      const t = makeEnamelSign('BHARAT NAGAR', 'भारत नगर', 'PLATFORM 1');
      const boardMat = new THREE.MeshStandardMaterial({
        map: t, roughness: 0.55, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1,
      });
      for (const [bx, ry] of [[xLeft + 0.13, Math.PI / 2], [xLeft - 0.13, -Math.PI / 2]]) {
        const board = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.12), boardMat);
        board.position.set(bx, P + 6.48, z);
        board.rotation.y = ry;
        root.add(board);
      }
      for (const dz of [-1.4, 1.4]) b.box(0.05, 0.06, 0.05, beamMat, { pos: [xLeft - 0.06, P + 7.1, z + dz], castShadow: false });
    }

    // column-mounted speakers, cameras and lamps
    for (let z = zStart + 5; z <= zEnd; z += colBay) {
      for (const x of [xLeft, xRight]) {
        const inward = x === xLeft ? 1 : -1;
        // horn speaker
        b.box(0.18, 0.24, 0.18, mats.painted(0x8f928b, { seed: 5 }), { pos: [x + inward * 0.25, P + 5.15, z] });
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 10, 1, true), mats.painted(0xc9c8bb, { roughness: 0.6, seed: 3 }));
        horn.rotation.z = inward * Math.PI / 2;
        horn.position.set(x + inward * 0.48, P + 5.15, z);
        root.add(horn);
        // CCTV
        b.box(0.12, 0.16, 0.12, mats.painted(0xd8d5c9, { seed: 2 }), { pos: [x + inward * 0.25, P + 5.55, z], castShadow: false });
        b.cyl(0.06, 0.075, 0.26, mats.painted(0x24282a, { seed: 2 }), { pos: [x + inward * 0.32, P + 5.53, z], rot: [Math.PI / 2, 0, 0], seg: 10, castShadow: false });
        // small wall lamp
        b.box(0.22, 0.08, 0.22, mats.painted(0x30413a, { seed: 2 }), { pos: [x + inward * 0.2, P + 3.8, z] });
        b.sphere(0.09, mats.emissive(0xffc37a, 0.9, 0x1a120a), { pos: [x + inward * 0.2, P + 3.71, z], seg: 8, castShadow: false });
      }
      // cables sagging between columns
      const x = xRight - 0.1;
      b.tube([[x, P + 5.1, z], [x, P + 4.85, z + colBay / 2], [x, P + 5.1, z + colBay]], 0.012, mats.blackMetal, { tubularSegments: 8, radialSegments: 3, castShadow: false });
    }
  }

  // ---------------------------------------------------------- second platform
  {
    const x0 = -31.5, x1 = -20.6;
    const cx = (x0 + x1) / 2;
    const len = 230, cz = -20;
    b.box(x1 - x0, 0.32, len, mats.concrete([5, 42], 0x8e8575), { pos: [cx, P - 0.16, cz], castShadow: false });
    b.box(x1 - x0, 1.02, len, mats.painted(0x2a2521, { roughness: 0.6, seed: 3 }), { pos: [cx, P - 0.51, cz] });
    b.box(x1 - x0, 0.09, len, mats.painted(0xe6dfcf, { roughness: 0.6, seed: 9 }), { pos: [cx, P - 0.02, cz] });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, len), tileMat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(cx, P + 0.004, cz);
    top.receiveShadow = true;
    root.add(top);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.36, len), yellowPaint);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x1 - 0.62, P + 0.012, cz);
    root.add(line);
    const tt = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len), new THREE.MeshStandardMaterial({
      map: tex.gen.tactile, bumpMap: tex.gen.tactile, bumpScale: 0.02, roughness: 0.75, color: 0xe0c176,
    }));
    tt.rotation.x = -Math.PI / 2;
    tt.position.set(x1 - 1.1, P + 0.014, cz);
    root.add(tt);

    // canopy
    const blueRoof = new THREE.MeshStandardMaterial({ map: corrugated.map, bumpMap: corrugated.bump, bumpScale: 0.02, color: 0x8fb9c2, roughness: 0.58, metalness: 0.32, side: THREE.DoubleSide });
    const steel = mats.painted(0x5b6a64, { roughness: 0.55, metalness: 0.4, seed: 22 });
    const xa = -30.3, xb = -21.7, ridge = -26;
    for (let z = -100; z <= 62; z += 10.5) {
      for (const x of [xa, xb]) {
        b.box(0.65, 0.3, 0.65, mats.concrete([1, 1], 0x8e8679), { pos: [x, P + 0.15, z] });
        b.cyl(0.12, 0.17, 4.6, steel, { pos: [x, P + 2.45, z], seg: 14 });
        b.box(0.34, 0.15, 0.34, steel, { pos: [x, P + 4.8, z] });
      }
      b.tube([[xa, P + 4.9, z], [ridge, P + 5.5, z], [xb, P + 4.9, z]], 0.07, steel, { tubularSegments: 12, radialSegments: 5 });
      b.box(8.6, 0.09, 0.12, steel, { pos: [ridge, P + 4.95, z] });
      // hanging lamp
      b.tube([[ridge, P + 5.2, z], [ridge, P + 4.75, z]], 0.01, mats.blackMetal, { castShadow: false });
      b.cyl(0.09, 0.26, 0.16, mats.painted(0x3b4640, { seed: 3 }), { pos: [ridge, P + 4.68, z], seg: 14 });
      b.sphere(0.075, mats.emissive(0xffc98a, 0.8, 0x181008), { pos: [ridge, P + 4.58, z], seg: 8, castShadow: false });
    }
    // curved roof panels
    for (let z = -100; z < 62; z += 5.25) {
      for (const side of [-1, 1]) {
        b.add(new THREE.BoxGeometry(4.55, 0.05, 5.3), blueRoof, {
          pos: [ridge + side * 2.15, P + 5.2, z + 2.62],
          rot: [0, 0, -side * 0.12], castShadow: true,
        });
      }
    }
    b.box(0.4, 0.12, 162, steel, { pos: [ridge, P + 5.55, -19] });

    // running name board and platform number
    const t = makeEnamelSign('BHARAT NAGAR', 'भारत नगर', 'PLATFORM 2 · प्लेटफार्म २');
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.54), new THREE.MeshStandardMaterial({
      map: t, roughness: 0.55, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.08,
    }));
    board.position.set(-25.9, P + 3.2, 6.0);
    root.add(board);
    for (const dz of [-2.0, 2.0]) b.box(0.08, 2.7, 0.08, steel, { pos: [-25.9, P + 1.7, 6.0 + dz] });

    // benches and bins
    for (const z of [-58, -20, 18, 52]) {
      b.box(0.55, 0.08, 2.2, mats.wood([2, 2], 0x7a5836), { pos: [-28.4, P + 0.45, z] });
      b.box(0.09, 0.45, 0.5, mats.metal(0x3a3e3d, 0.5, 0.6), { pos: [-28.4, P + 0.24, z - 0.75] });
      b.box(0.09, 0.45, 0.5, mats.metal(0x3a3e3d, 0.5, 0.6), { pos: [-28.4, P + 0.24, z + 0.75] });
      b.cyl(0.26, 0.24, 0.72, mats.painted(0x2e5547, { seed: 4 }), { pos: [-24.6, P + 0.36, z + 1.5], seg: 12 });
    }
  }

  // ---------------------------------------------------------- foot overbridge
  {
    const x0 = -32, x1 = 18.5, z = 44;
    const deckY = P + 7.35;
    const steel = mats.painted(0x77817d, { roughness: 0.55, metalness: 0.4, seed: 22, variation: 1.1 });
    const green = mats.painted(0x2f5344, { roughness: 0.7, seed: 19 });
    const blue = mats.painted(0x3d7e9a, { roughness: 0.5, metalness: 0.2, seed: 12 });
    b.box(x1 - x0, 0.3, 2.9, steel, { pos: [(x0 + x1) / 2, deckY, z] });
    // arched roof ribs
    for (let x = x0 + 1; x < x1; x += 2.2) {
      b.tube([[x, deckY + 1.2, z + 1.55], [x, deckY + 2.55, z + 0.7], [x, deckY + 2.85, z], [x, deckY + 2.55, z - 0.7], [x, deckY + 1.2, z - 1.55]], 0.045, steel, { tubularSegments: 10, radialSegments: 4 });
    }
    // blue and white canopy
    for (let x = x0 + 1; x < x1 - 2; x += 1.1) {
      const col = Math.round((x - x0) / 1.1) % 2 ? blue : mats.painted(0xd8ddd6, { roughness: 0.55, seed: 4 });
      b.add(new THREE.BoxGeometry(1.15, 0.035, 3.5), col, { pos: [x + 0.55, deckY + 2.95, z], rot: [0, 0, 0], castShadow: false });
    }
    for (const dz of [-1.45, 1.45]) {
      b.box(x1 - x0, 0.09, 0.09, steel, { pos: [(x0 + x1) / 2, deckY + 1.15, z + dz] });
      for (let x = x0; x < x1; x += 2.4) {
        b.box(0.055, 1.15, 0.055, green, { pos: [x, deckY + 0.6, z + dz] });
      }
    }
    // lattice side panels
    for (let x = x0; x < x1; x += 3.0) {
      b.box(3.0, 0.035, 0.035, green, { pos: [x + 1.5, deckY + 0.6, z + 1.46], rot: [0, 0, 0.5], castShadow: false });
      b.box(3.0, 0.035, 0.035, green, { pos: [x + 1.5, deckY + 0.6, z + 1.46], rot: [0, 0, -0.5], castShadow: false });
    }
    // supports
    for (const x of [-14, 7]) {
      for (const dz of [-1, 1]) b.box(0.28, 7.3, 0.28, steel, { pos: [x, P + 3.7, z + dz] });
      b.box(0.4, 0.3, 2.4, steel, { pos: [x, deckY - 0.2, z] });
    }
    // stairs down on platform 1, along z
    const steps = 17;
    for (let i = 0; i < steps; i++) {
      b.box(2.2, 0.16, 0.33, steel, { pos: [13.4, deckY - 0.22 - i * 0.31, z + 1.7 + i * 0.31] });
    }
    // stair roof
    for (const dx of [-1.05, 1.05]) {
      b.box(0.06, 0.9, steps * 0.31, green, { pos: [13.4 + dx, deckY - 2.25, z + 4.3], rot: [-Math.atan2(1, 1), 0, 0] });
      for (let i = 0; i < 5; i++) {
        b.box(0.06, 0.85, 0.06, steel, { pos: [13.4 + dx, deckY - 1.2 - i * 1.05, z + 1.9 + i * 1.18] });
      }
    }
    const bridgeLabel = tex.label({ w: 1400, h: 240, text: 'FOOT OVERBRIDGE  ↗', hi: 'पैदल पुल', bg: '#15333b', color: '#f0e6d2', size: 82, subSize: 28, weight: 700, letterSpacing: 2 });
    const bridgeMat = new THREE.MeshStandardMaterial({ map: bridgeLabel, roughness: 0.65 });
    const sign = new THREE.Group();
    for (const face of [0, Math.PI]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.6), bridgeMat);
      m.rotation.y = face;
      m.position.z = face ? -0.008 : 0.008;
      sign.add(m);
    }
    sign.position.set(9.0, deckY + 2.35, z + 1.5);
    root.add(sign);
    // a few silhouettes crossing
    for (let i = 0; i < 4; i++) {
      b.cyl(0.08, 0.1, 1.2, mats.painted(0x191b1b, { seed: 4 }), { pos: [-7 + i * 4.2, deckY + 1.75, z + 0.2], seg: 8 });
      b.sphere(0.12, mats.painted(0x191b1b, { seed: 4 }), { pos: [-7 + i * 4.2, deckY + 2.45, z + 0.2], seg: 8 });
    }
  }

  // ---------------------------------------------- far side wall & small hall
  {
    const wallMat2 = mats.painted(0xd9c9a7, { roughness: 0.82, metalness: 0.02, seed: 41, variation: 1.1 });
    const trim = mats.painted(0xbd6a3e, { roughness: 0.75, seed: 9 });
    b.box(0.4, 6.2, 128, wallMat2, { pos: [-37.2, P + 3.1, -20] });
    b.box(0.5, 2.2, 128, trim, { pos: [-37.15, P + 1.1, -20] });
    b.box(0.55, 0.3, 128, white, { pos: [-37.1, P + 6.3, -20] });
    for (let z = -78; z < 40; z += 7.4) {
      b.box(0.5, 2.4, 0.12, white, { pos: [-37.0, P + 4.5, z] });
      b.box(0.12, 2.0, 2.2, windowGlass, { pos: [-37.0, P + 4.0, z + 3.7], castShadow: false });
    }
    // small two-storey hall at the north end
    b.box(7.0, 7.4, 15, wallMat2, { pos: [-39.4, P + 3.7, -58] });
    b.box(7.3, 0.35, 15.4, trim, { pos: [-39.4, P + 7.5, -58] });
    for (let i = 0; i < 4; i++) {
      const z = -63 + i * 3.4;
      b.box(0.15, 1.7, 1.2, windowGlass, { pos: [-35.85, P + 4.9, z], castShadow: false });
      b.box(0.15, 1.5, 1.1, windowGlass, { pos: [-35.85, P + 2.0, z], castShadow: false });
    }
  }

  // ---------------------------------------------- trackside / ground details
  {
    // cable troughs
    for (const x of [4.4, -19.0, -12.0]) {
      b.box(0.34, 0.2, 250, mats.concrete([1, 40], 0x756e63), { pos: [x, 0.06, -20], castShadow: false });
    }
    // relay boxes and signal cabinets
    for (let i = 0; i < 7; i++) {
      b.box(0.9, 1.3, 0.8, mats.painted(0x879089, { seed: 8 }), { pos: [-2.1, 0.65, -95 + i * 30] });
      b.box(0.85, 0.1, 0.85, mats.painted(0x6e756e, { seed: 8 }), { pos: [-2.1, 1.35, -95 + i * 30] });
    }
    // boundary fence behind platform 2
    for (let z = -120; z < 70; z += 3.0) {
      b.box(0.06, 0.9, 0.06, mats.painted(0x3e4a44, { seed: 4 }), { pos: [-34.2, 0.45, z] });
    }
    // water tower
    const tx = -51, tz = -112;
    for (const dx of [-2.2, 2.2]) for (const dz of [-2.2, 2.2]) {
      b.box(0.28, 10.5, 0.28, mats.painted(0x6b6f69, { seed: 4 }), { pos: [tx + dx, 5.25, tz + dz] });
    }
    for (let i = 0; i < 3; i++) {
      b.box(5.6, 0.1, 0.12, mats.painted(0x51564f, { seed: 4 }), { pos: [tx, 3 + i * 2.3, tz + 2.2] });
      b.box(0.12, 0.1, 5.6, mats.painted(0x51564f, { seed: 4 }), { pos: [tx + 2.2, 3 + i * 2.3, tz] });
    }
    b.cyl(3.4, 3.4, 3.0, mats.painted(0x8f968c, { seed: 5 }), { pos: [tx, 12.2, tz], seg: 24 });
    b.cyl(3.5, 3.4, 0.6, mats.painted(0x6c736a, { seed: 5 }), { pos: [tx, 10.4, tz], seg: 24 });
    b.cyl(0.12, 0.12, 0.5, mats.metal(0x777d7a), { pos: [tx, 14.5, tz], seg: 8 });
    // utility poles / wires along the back
    for (let i = 0; i < 9; i++) {
      const z = -120 + i * 26;
      b.cyl(0.12, 0.16, 8.5, mats.painted(0x7a7568, { seed: 12 }), { pos: [18.9, P + 4.25, z], seg: 8 });
      b.box(1.5, 0.08, 0.08, mats.painted(0x5f594d, { seed: 8 }), { pos: [18.9, P + 8.1, z] });
      b.cyl(0.1, 0.1, 0.15, mats.glass(0xd7d1c2, .7, .2), { pos: [18.3, P + 8.25, z], seg: 8 });
      b.cyl(0.1, 0.1, 0.15, mats.glass(0xd7d1c2, .7, .2), { pos: [19.5, P + 8.25, z], seg: 8 });
    }
    // low grass tufts and weeds along the ballast
    for (let i = 0; i < 90; i++) {
      const rng = mulberry32(500 + i);
      b.box(rr(rng, .18, .5), rr(rng, .1, .3), rr(rng, .18, .5), mats.painted(pick(rng, [0x4f5c35, 0x5c6a3d, 0x3f4c2c]), { roughness: 0.95, seed: 4 }), {
        pos: [rr(rng, -18, 2), 0.06, rr(rng, -150, 70)], rot: [0, rng() * TAU, 0], castShadow: false,
      });
    }
  }

  // ---------------------------------------------------------- distant city + trees
  buildCity(root, b, mats, cityFacade);
  buildTrees(root, mats, leafTex);

  const stationRoot = new THREE.Group();
  stationRoot.name = 'station-architecture';
  const merged = b.build(scene, 'station-batch');
  stationRoot.add(merged);
  root.add(stationRoot);

  // ----------------------------------------------------------- platform lights
  // Real point lights are the most expensive thing in a forward renderer: every
  // one of them is evaluated for every lit fragment. The platform used to carry
  // 23 of them. Keep three key lights for the shape of the illumination and
  // paint the rest of the pools onto the floor with additive quads.
  const lampLights = [];
  const lampBulbs = [];
  const poolSpots = [];
  const totalBulbs = lights.lampBulbs.length;
  for (let i = 0; i < 14; i++) {
    const idx = Math.round(i * (totalBulbs - 1) / 13);
    lampBulbs.push(lights.lampBulbs[idx]);
  }
  // One Points cloud draws every bulb glow in a single call.
  const bulbGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(lampBulbs.length * 3);
    for (let i = 0; i < lampBulbs.length; i++) {
      const bulb = lampBulbs[i];
      pos[i * 3] = bulb.x; pos[i * 3 + 1] = bulb.y; pos[i * 3 + 2] = bulb.z;
      poolSpots.push([bulb.x, bulb.z, 2.4, 3.6]);
    }
    bulbGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  // Three practical lights spaced along the platform, low enough to actually
  // reach the floor and the wall. Putting them at the real 8 m bulb height made
  // them almost invisible once inverse-square falloff was applied.
  for (const z of [-66, -22, 24]) {
    const l = new THREE.PointLight(0xffc08a, 0, 26, 2);
    l.position.set(9.4, P + 4.15, z);
    scene.add(l);
    lampLights.push(l);
  }
  const bulbMat = new THREE.PointsMaterial({
    map: glow, color: 0xffd3a0, size: 0.62, sizeAttenuation: true,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.06,
  });
  const bulbGlow = new THREE.Points(bulbGeo, bulbMat);
  bulbGlow.frustumCulled = false;
  scene.add(bulbGlow);
  moodRefs.bulbMat = bulbMat;
  for (const pos of [[12.5, P + 4.4, -86], [12.5, P + 4.4, -62], [12.5, P + 4.4, -38], [12.5, P + 4.4, -14], [12.5, P + 4.4, 10], [12.5, P + 4.4, 34], [12.5, P + 4.4, 58]]) {
    poolSpots.push([pos[0], pos[2], 3.0, 4.2]);
  }
  const entranceLight = new THREE.PointLight(0xffa45c, 0, 18, 2);
  entranceLight.position.set(14.4, P + 3.0, -17.5);
  scene.add(entranceLight);
  const teaLight = new THREE.PointLight(0xffad63, 0, 12, 2);
  teaLight.position.set(13.4, P + 1.9, -55.4);
  scene.add(teaLight);
  poolSpots.push([14.4, -17.5, 3.4, 3.4], [13.4, -55.4, 2.6, 2.8], [15.2, -28, 2.2, 2.2], [15.2, 6, 2.2, 2.2]);
  // warm spill from the lit entrances along the arcade
  for (const z of [-49.2, -28.4, -18, 5.6, 21.2, 37.6, 48]) poolSpots.push([15.35, z, 3.4, 2.6]);

  // One merged additive mesh paints every lamp pool on the concrete.
  const poolCanvas = makeCanvas(256, 256);
  const pctx = poolCanvas.getContext('2d');
  const pg = pctx.createRadialGradient(128, 128, 4, 128, 128, 126);
  pg.addColorStop(0, 'rgba(255,214,160,0.95)');
  pg.addColorStop(0.35, 'rgba(255,188,120,0.42)');
  pg.addColorStop(0.72, 'rgba(255,158,86,0.1)');
  pg.addColorStop(1, 'rgba(255,150,80,0)');
  pctx.fillStyle = pg;
  pctx.fillRect(0, 0, 256, 256);
  // a little breakup so the pools do not read as perfect circles
  const prng = mulberry32(311);
  pctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 80; i++) {
    pctx.fillStyle = `rgba(0,0,0,${rr(prng, .05, .3)})`;
    pctx.beginPath();
    pctx.arc(rr(prng, 0, 256), rr(prng, 0, 256), rr(prng, 2, 18), 0, TAU);
    pctx.fill();
  }
  const poolTex = canvasTexture(poolCanvas, { srgb: true });
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  moodRefs.poolMat = poolMat;
  const poolBatch = new MeshBatch('lamp-pools');
  for (const [x, z, w, h] of poolSpots) {
    poolBatch.add(new THREE.PlaneGeometry(w, h), poolMat, {
      pos: [x, P + 0.024, z], rot: [-Math.PI / 2, 0, 0], castShadow: false, receiveShadow: false,
    });
  }
  const pools = poolBatch.build(scene, 'lamp-pools');
  pools.renderOrder = 2;

  lights.lampLights = lampLights;
  lights.entranceLight = entranceLight;
  lights.teaLight = teaLight;
  lights.arcadeLights = [];

  // props & crowd
  const props = buildProps(scene, mats, tex);
  const crowd = buildCrowd(scene, mats, { platformY: P, zMin: -64, zMax: 62, seed: 3, walkers: 12, standers: 20 });
  const crowd2 = buildCrowd(scene, mats, { platformY: P, zMin: -55, zMax: 45, seed: 17, walkers: 4, standers: 8, seatedCount: 0 });
  crowd2.root.position.x = -38.5;
  crowd2.root.scale.setScalar(0.95);

  // dust motes
  const dust = buildDust(scene, { count: 700, area: [30, 9, 130], center: [8, 4, -30] });

  // god rays under the canopy
  const rays = buildRays(scene, mats);

  // rain
  const rain = buildRain(scene);

  const setMood = (mood, cfg) => {
    const night = mood === 'night';
    const blue = mood === 'blue';
    const monsoon = mood === 'monsoon';
    wetMat.opacity = monsoon ? 0.3 : night ? 0.1 : 0;
    puddleMat.opacity = monsoon ? 0.62 : night ? 0.25 : blue ? 0.22 : 0;
    tileMat.roughness = monsoon ? 0.5 : night ? 0.6 : 0.72;
    tileMat.envMapIntensity = monsoon ? 1.45 : night ? 1.25 : 1.1;
    for (const l of lampLights) l.intensity = night ? 70 : blue ? 42 : monsoon ? 22 : 12;
    for (const l of lights.arcadeLights) l.intensity = night ? 46 : blue ? 34 : monsoon ? 12 : 5;
    entranceLight.intensity = night ? 64 : blue ? 42 : monsoon ? 14 : 8;
    teaLight.intensity = night ? 28 : blue ? 20 : monsoon ? 7 : 4;
    poolMat.opacity = night ? 0.5 : blue ? 0.32 : monsoon ? 0.14 : mood === 'noon' ? 0.015 : 0.045;
    for (const lit of lights.practicals) lit.emissiveIntensity = night ? 2.4 : blue ? 1.6 : monsoon ? 0.35 : 0.04;
    archLitMat.emissiveIntensity = night ? 1.7 : blue ? 1.15 : monsoon ? 0.62 : 0.85;
    bulbMat.opacity = night ? 0.34 : blue ? 0.2 : monsoon ? 0.06 : 0.035;
    rain.setActive(monsoon, cfg?.rain ?? 0);
    rays.setVisible(mood === 'golden' || mood === 'noon');
    dust.setVisible(mood !== 'night');
    if (signal?.userData?.glow) signal.userData.glow.material.opacity = night || blue ? 0.9 : 0.2;
  };
  setMood('golden', { wet: 0.15, rain: 0 });

  let t = 0;
  let clockTick = 0;
  let clockParts = null;
  const update = (dt, time, camera, mood) => {
    t += dt;
    crowd.update(dt, time);
    crowd2.update(dt, time);
    for (const f of props.animated.fans) f.rotation.y += dt * (3.6 + Math.sin(f.position.z) * 1.2);
    for (const fl of animated.flags) {
      const pos = fl.mesh.geometry.attributes.position;
      const base = fl.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const k = (x + 0.95) / 1.9;
        pos.setZ(i, Math.sin(x * 4.5 + t * 3.4 + y) * 0.09 * k + Math.sin(x * 9 + t * 5) * 0.025 * k);
        pos.setY(i, y + Math.sin(x * 3 + t * 2.2) * 0.04 * k);
      }
      pos.needsUpdate = true;
    }
    // Clock hands only need the wall time once a second, not two Date objects
    // and sixty timezone lookups per frame.
    clockTick += dt;
    if (clockTick > 1 || !clockParts) {
      clockTick = 0;
      const now = new Date();
      clockParts = {
        h: (now.getHours() % 12) + now.getMinutes() / 60,
        m: now.getMinutes() + now.getSeconds() / 60,
      };
    }
    for (const c of props.animated.clocks) {
      c.hour.rotation.z = -clockParts.h / 12 * TAU;
      c.minute.rotation.z = -clockParts.m / 60 * TAU;
    }
    props.update && props.update(dt, time);
    dust.update(dt, time);
    rain.update(dt);
    rays.update(t);
  };

  return {
    root: stationRoot,
    merged,
    props,
    crowd,
    crowd2,
    lights,
    animated,
    dust,
    rain,
    rays,
    setMood,
    update,
    signal,
    wetMat,
  };
}

// ---------------------------------------------------------------- city & trees
function buildCity(root, b, mats, facade) {
  const rng = mulberry32(101);
  const cityMat = new THREE.MeshStandardMaterial({
    map: facade, color: 0x6f695e, roughness: 0.9, metalness: 0.0,
  });
  const roofMat = mats.painted(0x5e5c53, { roughness: 0.92, seed: 14 });
  const litMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c1c, emissive: 0xffc46e, emissiveIntensity: 0.0, roughness: 0.8,
  });
  for (let i = 0; i < 34; i++) {
    const side = i % 3 === 0 ? 1 : -1;
    const x = side > 0 ? 36 + rng() * 45 : -46 - rng() * 80;
    const z = -180 + rng() * 360;
    const w = 6 + rng() * 12, d = 6 + rng() * 12, h = 4 + rng() * 18;
    b.box(w, h, d, cityMat, { pos: [x, h / 2, z], radius: 0.05, castShadow: false, receiveShadow: false });
    b.box(w + 0.2, 0.35, d + 0.2, roofMat, { pos: [x, h + 0.15, z], castShadow: false });
    if (rng() > 0.45) {
      b.cyl(0.8, 0.8, 1.4, roofMat, { pos: [x - 1, h + 0.9, z + 1], seg: 10, castShadow: false });
    }
    if (rng() > 0.35) {
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, Math.min(4, h * 0.35)), litMat);
      lit.position.set(x, h * 0.55, z + (side > 0 ? d / 2 + 0.02 : -d / 2 - 0.02));
      lit.rotation.y = side > 0 ? 0 : Math.PI;
      root.add(lit);
    }
    if (rng() > 0.72) {
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.box(0.12, 2.2, 0.12, roofMat, { pos: [x + dx, h + 1.1, z + dz], castShadow: false });
      b.cyl(1.25, 1.25, 1.6, mats.painted(0x6b7580, { seed: 2 }), { pos: [x, h + 3.1, z], seg: 14, castShadow: false });
    }
  }
  const far = mats.painted(0x565148, { seed: 6 });
  for (let i = 0; i < 3; i++) {
    const x = -118 - i * 25, z = -40 + i * 90;
    b.cyl(6, 8, 10, far, { pos: [x, 5, z], seg: 18, castShadow: false });
    b.sphere(6, far, { pos: [x, 10, z], scale: [1, .7, 1], seg: 16, castShadow: false });
    b.cyl(0.7, 0.9, 16, far, { pos: [x + 9, 8, z - 4], seg: 10, castShadow: false });
    b.sphere(1.1, far, { pos: [x + 9, 16, z - 4], seg: 10, castShadow: false });
  }
  // goods rake on the far track
  for (let i = 0; i < 5; i++) {
    const z = -160 + i * 12.6;
    const body = mats.painted(0x4b5b68, { roughness: 0.8, seed: 4 });
    b.box(3.0, 2.4, 12.0, body, { pos: [-14.4, 2.1, z], radius: 0.05, castShadow: true });
    b.box(3.05, 0.2, 12.07, mats.painted(0x3e474e, { seed: 4 }), { pos: [-14.4, 3.35, z] });
    for (let k = 0; k < 3; k++) {
      b.box(0.12, 2.4, 0.08, mats.painted(0x2a3034, { seed: 5 }), { pos: [-14.4 + 1.53, 2.1, z - 4 + k * 4] });
    }
    for (const dz of [-4, 4]) {
      for (const dx of [-1, 1]) b.cyl(0.42, 0.42, 0.2, mats.metal(0x4a4d4c, 0.55, 0.7), { pos: [-14.4 + dx * 1, 0.6, z + dz], rot: [0, 0, Math.PI / 2], seg: 12 });
    }
  }
}

function buildTrees(root, mats, leafTex) {
  const rng = mulberry32(88);
  const trunkMat = mats.painted(0x4b3a2b, { roughness: 0.95, metalness: 0, seed: 9 });
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    roughness: 0.9, metalness: 0.0, color: 0xdce8ce,
  });
  const makeTree = (x, z, scale = 1, kind = 'banyan') => {
    const g = new THREE.Group();
    const h = (kind === 'palm' ? 8 : 6) * scale;
    if (kind === 'palm') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.28 * scale, h, 7), trunkMat);
      trunk.position.y = h / 2;
      g.add(trunk);
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * TAU;
        const geo = new THREE.PlaneGeometry(3.3 * scale, 1.0 * scale, 4, 1);
        const mesh = new THREE.Mesh(geo, leafMat);
        mesh.position.set(Math.cos(angle) * 1.2 * scale, h - 0.2, Math.sin(angle) * 1.2 * scale);
        mesh.rotation.set(-0.35, angle, 0);
        g.add(mesh);
      }
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.7 * scale, h * 0.65, 8), trunkMat);
      trunk.position.y = h * 0.32;
      g.add(trunk);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.2 * scale, 3.2 * scale, 6), trunkMat);
        br.position.set(Math.cos(a) * 1.1 * scale, h * 0.58, Math.sin(a) * 1.1 * scale);
        br.rotation.z = Math.cos(a) * 0.7;
        br.rotation.x = Math.sin(a) * 0.7;
        g.add(br);
      }
      for (let i = 0; i < 13; i++) {
        const a = rng() * TAU, rad = rng() * 2.8 * scale;
        const geo = new THREE.PlaneGeometry(3.2 * scale, 3.2 * scale);
        const m = new THREE.Mesh(geo, leafMat);
        m.position.set(Math.cos(a) * rad, h * 0.8 + rng() * 2 * scale, Math.sin(a) * rad);
        m.rotation.set(0, rng() * TAU, 0);
        g.add(m);
      }
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    g.position.set(x, 0, z);
    root.add(g);
    return g;
  };
  makeTree(34, -92, 1.25, 'banyan');
  makeTree(40, -62, 1.0, 'banyan');
  makeTree(38, -116, 1.4, 'banyan');
  makeTree(32, 55, 1.2, 'palm');
  makeTree(36, 66, 1.3, 'palm');
  makeTree(-46, -125, 1.2, 'banyan');
  makeTree(-49, 8, 1.4, 'banyan');
  makeTree(-42, 79, 1.1, 'banyan');
  makeTree(-40, -70, 1.15, 'palm');
  for (let i = 0; i < 14; i++) {
    const x = -54 - rng() * 60, z = -170 + i * 25;
    const geo = new THREE.PlaneGeometry(7 + rng() * 6, 6 + rng() * 4);
    const m = new THREE.Mesh(geo, leafMat);
    m.position.set(x, 4 + rng() * 2, z);
    m.rotation.y = rng() * TAU;
    m.castShadow = false;
    root.add(m);
  }
}

// ---------------------------------------------------------------- atmosphere
function buildDust(scene, { count = 500, area = [30, 8, 120], center = [0, 4, 0] } = {}) {
  const positions = new Float32Array(count * 3);
  const rng = mulberry32(3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center[0] + (rng() - .5) * area[0];
    positions[i * 3 + 1] = center[1] + (rng() - .5) * area[1];
    positions[i * 3 + 2] = center[2] + (rng() - .5) * area[2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,232,190,1)');
  g.addColorStop(.35, 'rgba(255,215,160,.45)');
  g.addColorStop(1, 'rgba(255,200,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({
    size: 0.075, map: sprite, transparent: true, opacity: 0.4,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, color: 0xffd6a0,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return {
    points,
    update(dt, time) {
      const pos = geo.attributes.position;
      for (let i = 0; i < count; i++) {
        let y = pos.getY(i) + dt * (0.03 + (i % 7) * 0.005);
        if (y > center[1] + area[1] / 2) y = center[1] - area[1] / 2;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(time * 0.1 + i) * dt * 0.012);
        pos.setZ(i, pos.getZ(i) + Math.cos(time * 0.13 + i * 1.7) * dt * 0.012);
      }
      pos.needsUpdate = true;
    },
    setVisible(v) { points.visible = v; },
  };
}

function buildRays(scene, mats) {
  const group = new THREE.Group();
  const c = makeCanvas(128, 512);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, 'rgba(255,219,165,.3)');
  g.addColorStop(0.35, 'rgba(255,204,146,.14)');
  g.addColorStop(1, 'rgba(255,196,140,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 512);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, opacity: 0,
  });
  const positions = [
    [9.4, -62, 0.17], [12.8, -38, 0.13], [8.3, -14, 0.16], [13.4, 16, 0.12], [9.8, 40, 0.15],
  ];
  for (const [x, z, op] of positions) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 8.4), mat.clone());
    plane.material.opacity = op;
    plane.position.set(x, 2.9, z);
    plane.rotation.set(-0.24, 0.48, 0.13);
    group.add(plane);
  }
  scene.add(group);
  return {
    group,
    setVisible(v) { group.visible = v; },
    update(t) {
      group.children.forEach((m, i) => {
        m.material.opacity = (0.11 + 0.05 * Math.sin(t * 0.2 + i));
      });
    },
  };
}

function buildRain(scene) {
  const count = 4200;
  const positions = new Float32Array(count * 6);
  const rng = mulberry32(9);
  const range = 70;
  for (let i = 0; i < count; i++) {
    const x = (rng() - .5) * range, z = (rng() - .5) * range;
    const y = rng() * 30;
    positions[i * 6] = x; positions[i * 6 + 1] = y; positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x + 0.02; positions[i * 6 + 4] = y + rr(rng, 0.3, 0.7); positions[i * 6 + 5] = z + 0.01;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xa9bdc2, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.NormalBlending,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  let active = false;
  return {
    lines,
    setActive(v, intensity = 1) { active = v; mat.opacity = v ? 0.34 * intensity : 0; lines.visible = v; },
    update(dt) {
      if (!active) return;
      const pos = geo.attributes.position;
      const fall = dt * 26;
      for (let i = 0; i < count; i++) {
        let y = pos.getY(i * 2) - fall;
        if (y < 0) y += 30;
        const x = pos.getX(i * 2) + dt * 1.1;
        const z = pos.getZ(i * 2);
        pos.setXYZ(i * 2, x, y, z);
        pos.setXYZ(i * 2 + 1, x + 0.02, y + 0.55, z + 0.01);
      }
      pos.needsUpdate = true;
    },
  };
}
