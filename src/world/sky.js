import * as THREE from 'three';
import { DEG, clamp, lerp, makeCanvas, mulberry32, rr, TAU } from '../core/util.js';

const SKY_PALETTES = {
  golden: {
    zenith: '#1f4d7c', mid: '#7fa0bf', horizon: '#efb27c', haze: '#fbd0a0',
    ground: '#8a6c51', cloud: '#ffe9c9', cloudShade: '#6d687c',
    sun: '#ffe4b5', sunGlow: 'rgba(255,188,110,',
    stars: 0, clouds: 0.5,
  },
  noon: {
    zenith: '#1d5f9e', mid: '#5f9fce', horizon: '#c9dce2', haze: '#e2ecec',
    ground: '#9b907c', cloud: '#ffffff', cloudShade: '#7d8fa2',
    sun: '#fff8e8', sunGlow: 'rgba(255,244,214,',
    stars: 0, clouds: 0.3,
  },
  blue: {
    zenith: '#0b1830', mid: '#27405d', horizon: '#9b6257', haze: '#b87c62',
    ground: '#24262a', cloud: '#6e6070', cloudShade: '#2a3244',
    sun: '#ffb27a', sunGlow: 'rgba(255,140,84,',
    stars: 0.25, clouds: 0.4,
  },
  night: {
    zenith: '#02050c', mid: '#071120', horizon: '#111b2a', haze: '#1a2534',
    ground: '#050709', cloud: '#1c2738', cloudShade: '#080c14',
    sun: '#cfe0f7', sunGlow: 'rgba(176,200,232,',
    stars: 1, clouds: 0.18,
  },
  monsoon: {
    zenith: '#35444e', mid: '#66787f', horizon: '#98a4a1', haze: '#aab3ae',
    ground: '#4a4f49', cloud: '#d2d8d4', cloudShade: '#3c4a52',
    sun: '#e8ece6', sunGlow: 'rgba(214,224,218,',
    stars: 0, clouds: 1,
  },
};

function softEllipse(ctx, x, y, rx, ry, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, Math.max(0.05, ry / rx));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, color.replace('ALPHA', alpha.toFixed(3)));
  g.addColorStop(0.55, color.replace('ALPHA', (alpha * 0.55).toFixed(3)));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function makeSkyTexture(mood) {
  const pal = SKY_PALETTES[mood] || SKY_PALETTES.golden;
  const w = 2048, h = 1024;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');

  // vertical gradient: zenith (top) to horizon (middle) to ground haze
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, pal.zenith);
  grad.addColorStop(0.3, pal.zenith);
  grad.addColorStop(0.44, pal.mid);
  grad.addColorStop(0.485, pal.haze);
  grad.addColorStop(0.505, pal.horizon);
  // Below the horizon the real ground plane hides the sky; keep this half a
  // safe continuation of the horizon so equirect sampling never shows a band.
  grad.addColorStop(0.53, pal.horizon);
  grad.addColorStop(1, pal.horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(57 + mood.length * 13);
  // stars live above the horizon only
  if (pal.stars > 0) {
    for (let i = 0; i < 900; i++) {
      const x = rng() * w;
      const y = Math.pow(rng(), 1.4) * h * 0.47;
      const a = rr(rng, 0.12, 0.85) * pal.stars;
      const r = rng() < 0.94 ? rr(rng, 0.4, 1.1) : rr(rng, 1.2, 2.0);
      ctx.fillStyle = `rgba(226,236,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  // clouds: flattened soft blobs gathered near the horizon band that the
  // platform camera actually sees
  const cloudCount = Math.round(60 + pal.clouds * 70);
  const bandTop = h * 0.24, bandBottom = h * 0.496;
  for (let i = 0; i < cloudCount; i++) {
    const u = rng();
    const x = u * w;
    const y = bandTop + Math.pow(rng(), 1.25) * (bandBottom - bandTop);
    const rx = rr(rng, 55, 230) * (0.7 + (y / bandBottom) * 0.65);
    const ry = rx * rr(rng, 0.1, 0.34);
    const shadeA = rr(rng, 0.1, 0.22) * pal.clouds;
    const lightA = rr(rng, 0.12, 0.4) * pal.clouds;
    softEllipse(ctx, x + rx * 0.1, y - ry * 0.9, rx * 0.96, ry * 0.72,
      `rgba(${parseInt(pal.cloudShade.slice(1, 3), 16)},${parseInt(pal.cloudShade.slice(3, 5), 16)},${parseInt(pal.cloudShade.slice(5, 7), 16)},ALPHA)`, shadeA);
    softEllipse(ctx, x, y, rx, ry,
      `rgba(${parseInt(pal.cloud.slice(1, 3), 16)},${parseInt(pal.cloud.slice(3, 5), 16)},${parseInt(pal.cloud.slice(5, 7), 16)},ALPHA)`, lightA);
  }
  // low band of cloud: the platform camera only sees roughly 0-18 degrees of
  // sky, so the texture has to live there to be visible at all
  // high wispy streaks / cirrus
  if (mood === 'golden' || mood === 'noon' || mood === 'blue') {
    for (let i = 0; i < 22; i++) {
      const x = rng() * w;
      const y = h * (0.16 + rng() * 0.26);
      const rx = rr(rng, 120, 380);
      const ry = rr(rng, 3, 12);
      softEllipse(ctx, x, y, rx, ry,
        `rgba(${parseInt(pal.cloud.slice(1, 3), 16)},${parseInt(pal.cloud.slice(3, 5), 16)},${parseInt(pal.cloud.slice(5, 7), 16)},ALPHA)`,
        rr(rng, 0.04, 0.12) * (mood === 'blue' ? 0.6 : 1));
    }
  }

  // thin haze layer right on the horizon
  const haze = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.53);
  haze.addColorStop(0, 'rgba(255,255,255,0)');
  haze.addColorStop(0.7, pal.haze + '2e');
  haze.addColorStop(1, pal.haze + '00');
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * 0.42, w, h * 0.12);

  // Low cloud bank sitting just above the horizon: this is the only part of
  // the sky the platform camera sees, so give it real contrast.
  if (mood !== 'night') {
    const lowCount = mood === 'monsoon' ? 48 : 34;
    for (let i = 0; i < lowCount; i++) {
      const x = rng() * w;
      const y = h * (0.442 + rng() * 0.052);
      const rx = rr(rng, 90, 360);
      const ry = rr(rng, 8, 28);
      const shade = mood === 'monsoon' ? '74,82,88' : mood === 'blue' ? '30,28,44' : mood === 'noon' ? '100,114,128' : '84,70,84';
      const light = mood === 'monsoon' ? '236,242,240' : mood === 'blue' ? '128,104,116' : mood === 'noon' ? '255,255,255' : '255,231,199';
      softEllipse(ctx, x, y + 5, rx * 0.96, ry * 0.72,
        `rgba(${shade},ALPHA)`, rr(rng, 0.18, 0.4));
      softEllipse(ctx, x, y - 1, rx, ry,
        `rgba(${light},ALPHA)`, rr(rng, 0.22, 0.52));
    }
    // long thin streaks
    for (let i = 0; i < 10; i++) {
      const x = rng() * w;
      const y = h * (0.452 + rng() * 0.04);
      softEllipse(ctx, x, y, rr(rng, 260, 620), rr(rng, 2.5, 6),
        mood === 'blue' ? 'rgba(150,108,110,ALPHA)' : 'rgba(255,238,210,ALPHA)',
        rr(rng, 0.12, 0.3));
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.flipY = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export const MOODS = {
  golden: {
    label: 'Golden hour', time: '17:42', hindi: 'सुनहरी शाम',
    hdri: 'golden', background: 0.55, env: 0.44, exposure: 0.66,
    sun: { elevation: 14, azimuth: 118, color: 0xffa263, intensity: 4.4 },
    hemi: { sky: 0x8ea7c2, ground: 0x8a6c4c, intensity: 0.88 },
    fog: { color: 0xc4a98d, density: 0.0016 },
    rotation: 0.0,
    bloom: { strength: 0.14, radius: 0.62, threshold: 1.28 },
    lamps: 0.2, city: 0.15, wet: 0.15, rain: 0, grade: { warm: 1.0, contrast: 1.26, saturation: 1.12 },
    windowGlow: 0.22,
  },
  noon: {
    label: 'High noon', time: '12:20', hindi: 'दोपहर',
    hdri: 'noon', background: 0.6, env: 0.42, exposure: 0.54,
    sun: { elevation: 62, azimuth: 142, color: 0xfff3df, intensity: 4.6 },
    hemi: { sky: 0xa5c2d8, ground: 0x7a654e, intensity: 0.46 },
    fog: { color: 0xb9c3c4, density: 0.0012 },
    rotation: 1.3,
    bloom: { strength: 0.1, radius: 0.4, threshold: 1.35 },
    lamps: 0.0, city: 0.0, wet: 0, rain: 0, grade: { warm: 0.9, contrast: 1.14, saturation: 1.08 },
    windowGlow: 0.04,
  },
  blue: {
    label: 'Blue hour', time: '18:54', hindi: 'नीला घंटा',
    hdri: 'blue', background: 0.4, env: 0.3, exposure: 1.0,
    sun: { elevation: 2, azimuth: 238, color: 0xff9468, intensity: 0.5 },
    hemi: { sky: 0x3b5a7e, ground: 0x1e2024, intensity: 0.4 },
    fog: { color: 0x44506a, density: 0.0034 },
    rotation: 2.6,
    bloom: { strength: 0.34, radius: 0.72, threshold: 0.78 },
    lamps: 0.9, city: 0.75, wet: 0.3, rain: 0, grade: { warm: 0.68, contrast: 1.12, saturation: 0.94 },
    windowGlow: 0.9,
  },
  night: {
    label: 'Night', time: '22:16', hindi: 'रात',
    hdri: 'night', background: 0.22, env: 0.22, exposure: 1.4,
    sun: { elevation: 34, azimuth: 250, color: 0xbcd6ff, intensity: 0.35 },
    hemi: { sky: 0x2a4468, ground: 0x0a0c10, intensity: 0.36 },
    fog: { color: 0x101a28, density: 0.0026 },
    rotation: 0.5,
    bloom: { strength: 0.34, radius: 0.75, threshold: 0.68 },
    lamps: 1.0, city: 1.0, wet: 0.4, rain: 0, grade: { warm: 0.58, contrast: 1.16, saturation: 0.9 },
    windowGlow: 1.0,
  },
  monsoon: {
    label: 'Monsoon', time: '16:05', hindi: 'मानसून',
    hdri: 'monsoon', background: 0.45, env: 0.4, exposure: 0.8,
    sun: { elevation: 34, azimuth: 110, color: 0xc9d2cb, intensity: 1.35 },
    hemi: { sky: 0x6e808c, ground: 0x363a34, intensity: 0.58 },
    fog: { color: 0x6e7c7e, density: 0.012 },
    rotation: 1.8,
    bloom: { strength: 0.28, radius: 0.8, threshold: 0.8 },
    lamps: 0.6, city: 0.22, wet: 1.0, rain: 1.0, grade: { warm: 0.72, contrast: 1.08, saturation: 0.82 },
    windowGlow: 0.78,
  },
};

function makeGlowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.08, 'rgba(255,255,255,.92)');
  g.addColorStop(0.22, 'rgba(255,255,255,.34)');
  g.addColorStop(0.5, 'rgba(255,255,255,.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uZenith, uMid, uHorizon, uGround, uSunDir, uSunColor, uCloudColor, uCloudShade, uHaze;
  uniform float uCloudCover, uTime, uStars;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float up = clamp(h, 0.0, 1.0);
    vec3 low = mix(uHorizon, uMid, smoothstep(0.0, 0.2, up));
    vec3 sky = mix(low, uZenith, smoothstep(0.16, 0.72, up));
    sky = mix(uHaze, sky, smoothstep(-0.04, 0.09, h));
    if (h < 0.0) sky = mix(uHorizon, uGround, smoothstep(0.0, -0.25, h));

    vec3 sd = normalize(uSunDir);
    float sun = max(dot(d, sd), 0.0);
    sky += uSunColor * (pow(sun, 6.0) * 0.12 + pow(sun, 64.0) * 0.42 + pow(sun, 900.0) * 2.4);

    // Cloud deck: two scales of stretched fBm projected on the dome, with a
    // darker underside and a bright windward edge. The near-horizon band is
    // where a platform camera spends most of its sky, so it gets the detail.
    if (h > 0.003) {
      vec2 uv = d.xz / (h + 0.12);
      uv.x *= 0.62;
      uv = uv * 1.55 + vec2(uTime * 0.0035, uTime * 0.0014);
      float n = fbm(uv);
      float detail = fbm(uv * 3.1 + 11.7);
      float mask = smoothstep(0.008, 0.055, h) * smoothstep(0.58, 0.18, h);
      float cover = smoothstep(0.55 - uCloudCover * 0.1, 0.84, n + detail * 0.3);
      float lit = smoothstep(0.35, 0.85, detail * 0.55 + n * 0.5);
      vec3 cloud = mix(uCloudShade, uCloudColor, lit);
      // light the top of each bank from the sun side
      cloud = mix(cloud, uCloudColor, smoothstep(0.5, 0.95, sun) * 0.55);
      sky = mix(sky, cloud, cover * mask * 0.82);

      // thin high cirrus
      float c2 = fbm(uv * 0.42 + 31.0);
      float m2 = smoothstep(0.07, 0.2, h) * smoothstep(0.75, 0.3, h);
      sky = mix(sky, uCloudColor, smoothstep(0.58, 0.8, c2) * m2 * 0.25 * uCloudCover);
    }

    // A quiet field of stars, only for the darker moods.
    if (uStars > 0.001 && h > 0.01) {
      vec2 sp = vec2(atan(d.z, d.x) * 185.0, d.y * 340.0);
      vec2 cell = floor(sp);
      vec2 fp = fract(sp) - 0.5;
      float hs = hash21(cell);
      float star = step(0.985, hs) * smoothstep(0.18, 0.02, length(fp));
      float twinkle = 0.7 + 0.3 * sin(uTime * 1.7 + hs * 44.0);
      sky += vec3(0.82, 0.9, 1.0) * star * uStars * (0.3 + 0.5 * fract(hs * 13.0)) * twinkle * smoothstep(0.02, 0.2, h);
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

function makeSkyDome() {
  const uniforms = {
    uZenith: { value: new THREE.Color('#3c6c9c') },
    uMid: { value: new THREE.Color('#7d9fc0') },
    uHorizon: { value: new THREE.Color('#efb77c') },
    uGround: { value: new THREE.Color('#8f7a64') },
    uSunDir: { value: new THREE.Vector3(0, 0.3, -1) },
    uSunColor: { value: new THREE.Color('#ffd7a0') },
    uCloudColor: { value: new THREE.Color('#ffd9b0') },
    uCloudShade: { value: new THREE.Color('#7e6a6f') },
    uCloudCover: { value: 0.9 },
    uHaze: { value: new THREE.Color('#ffd5a2') },
    uTime: { value: 0 },
    uStars: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(720, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky-dome';
  return mesh;
}

export class SkyLighting {
  constructor(renderer, scene, tex) {
    this.renderer = renderer;
    this.scene = scene;
    this.tex = tex;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.envCache = new Map();
    this.skyCache = new Map();
    this.mood = 'golden';

    this.sun = new THREE.DirectionalLight(0xffd2a1, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3.5;
    this.sun.shadow.intensity = 0.68;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 260;
    const s = 62;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s * 0.72;
    this.sun.shadow.camera.bottom = -s * 0.72;
    // focused on the platform / train
    this.sun.target.position.set(0, 0, 0);
    this.sun.position.set(60, 35, -30);
    this.sun.userData.offset = new THREE.Vector3(60, 35, -30);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x9bb5d2, 0x6d5842, 0.7);
    scene.add(this.hemi);

    this.fill = new THREE.DirectionalLight(0xbfd3e8, 0.35);
    this.fill.position.set(-35, 20, 60);
    scene.add(this.fill);

    this.ambient = new THREE.AmbientLight(0xffe0bc, 0.1);
    scene.add(this.ambient);

    // warm bounce from the platform, as if sunlight had scattered off concrete
    this.bounce = new THREE.PointLight(0xffc28a, 0, 28, 2);
    this.bounce.position.set(10.0, 3.6, -45);
    scene.add(this.bounce);
    // A second point light here used to double the per-pixel lighting cost for
    // a barely visible fill. Emissive practicals cover the same job for free.
    this.bounceNear = null;

    // painted sun: a warm core plus a wide halo, placed exactly along the key
    // light so shadows and sky agree
    const glowTex = makeGlowCanvas();
    const mkGlow = (scale, opacity, color) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
      }));
      s.scale.setScalar(scale);
      s.renderOrder = -8;
      scene.add(s);
      return s;
    };
    this.sunHalo = mkGlow(300, 0.5, 0xffb36b);
    this.sunCore = mkGlow(74, 0.95, 0xfff0cf);

    // A live shader sky dome replaces the painted equirect background: the
    // clouds sit in world space, catch the key light and never show a seam at
    // the horizon. The equirect HDRI is still used for image-based lighting.
    this.dome = makeSkyDome();
    scene.add(this.dome);
    this.skyTime = 0;

    scene.fog = new THREE.FogExp2(0xc8a88a, 0.0032);
  }

  async setMood(name, { instant = false } = {}) {
    const cfg = MOODS[name] || MOODS.golden;
    this.mood = name;
    const hdri = await this.tex.loadHDRI(cfg.hdri);
    let envTex = this.envCache.get(cfg.hdri);
    if (!envTex) {
      const rt = this.pmrem.fromEquirectangular(hdri);
      envTex = rt.texture;
      this.envCache.set(cfg.hdri, envTex);
    }
    const sc = this.scene;
    // The dome is the visible sky; scene.background stays null so the equirect
    // texture cannot paint a banded horizon behind it.
    sc.background = null;
    sc.environment = envTex;
    sc.environmentIntensity = cfg.env;
    sc.environmentRotation = new THREE.Euler(0, cfg.rotation, 0);

    const el = cfg.sun.elevation * DEG;
    const az = cfg.sun.azimuth * DEG;
    const dist = 110;
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    );
    const sunDir = dir.clone();
    this.sunDir = sunDir.clone();
    this.sun.position.copy(dir).multiplyScalar(dist);
    this.sun.target.position.set(0, 1.2, -6);

    // Repaint the live sky for this mood.
    const pal = SKY_PALETTES[name] || SKY_PALETTES.golden;
    const u = this.dome.material.uniforms;
    u.uZenith.value.set(pal.zenith);
    u.uMid.value.set(pal.mid);
    u.uHorizon.value.set(pal.horizon);
    u.uHaze.value.set(pal.haze);
    u.uGround.value.set(pal.ground);
    u.uCloudColor.value.set(pal.cloud);
    u.uCloudShade.value.set(pal.cloudShade);
    u.uCloudCover.value = pal.clouds;
    u.uStars.value = pal.stars || 0;
    u.uSunColor.value.set(pal.sun);
    u.uSunDir.value.copy(sunDir).normalize();
    u.uTime.value = this.skyTime;

    // sun / moon glow locked to the key light
    const sunUp = cfg.sun.elevation > -3 && name !== 'monsoon';
    this.sunHalo.visible = sunUp;
    this.sunCore.visible = sunUp;
    if (sunUp) {
      const glowDist = 640;
      this.sunHalo.position.copy(sunDir).multiplyScalar(glowDist);
      this.sunCore.position.copy(this.sunHalo.position);
      const warm = name === 'golden' || name === 'blue';
      this.sunHalo.material.color.set(warm ? cfg.sun.color : 0xfffaf0);
      this.sunCore.material.color.set(warm ? 0xfff0d4 : 0xfffaf0);
      const nearHorizon = clamp(1.15 - cfg.sun.elevation / 40, 0.35, 1);
      this.sunHalo.scale.setScalar(300 * nearHorizon);
      this.sunCore.scale.setScalar(82 * nearHorizon);
      this.sunHalo.material.opacity = name === 'noon' ? 0.24 : name === 'blue' ? 0.5 : name === 'night' ? 0.28 : 0.46;
      this.sunCore.material.opacity = name === 'noon' ? 0.7 : name === 'night' ? 0.95 : 0.9;
    }
    this.sun.color.set(cfg.sun.color);
    this.sun.intensity = cfg.sun.intensity;
    this.fill.color.set(cfg.hemi.sky);
    this.fill.intensity = cfg.hemi.intensity * 0.75 + 0.26;
    this.hemi.color.set(cfg.hemi.sky);
    this.hemi.groundColor.set(cfg.hemi.ground);
    this.hemi.intensity = cfg.hemi.intensity;
    this.ambient.intensity = name === 'night' ? 0.22 : 0.09 + cfg.hemi.intensity * 0.12;
    this.bounce.intensity = name === 'golden' ? 15 : name === 'noon' ? 5 : name === 'blue' ? 9 : name === 'night' ? 11 : 6;
    this.bounce.color.set(name === 'blue' ? 0xff9f6a : name === 'night' ? 0xffb270 : 0xffc28a);
    sc.fog.color.set(cfg.fog.color);
    sc.fog.density = cfg.fog.density;
    this.renderer.toneMappingExposure = cfg.exposure;
    this.cfg = cfg;
    // notify platform props
    if (this.onMood) this.onMood(name, cfg);
    return cfg;
  }

  rotateSun(deg) {
    this.sun.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG);
  }

  update(dt) {
    this.skyTime += dt;
    this.dome.material.uniforms.uTime.value = this.skyTime;
  }

  anchor(camera) {
    this.dome.position.copy(camera.position);
    if (this.sunHalo.visible) {
      this.sunHalo.position.copy(camera.position).addScaledVector(this.sunDir, 640);
      this.sunCore.position.copy(this.sunHalo.position);
    }
  }
}
