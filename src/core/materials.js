import * as THREE from 'three';

export class Materials {
  constructor(tex) {
    this.tex = tex;
    this.cache = new Map();
    this.photoCache = new Map();
    this.repeatCache = new Map();
    // Anisotropy above 4 buys almost nothing at the grazing angles this scene
    // uses, but costs a lot of texture bandwidth on every sample.
    this.aniso = Math.min(4, tex.maxAniso || 4);
    this.params = { anisotropy: this.aniso };
  }

  cloneRepeat(texture, rx, ry, rotation = 0) {
    if (!texture) return null;
    const key = `${texture.uuid}|${rx}|${ry}|${rotation}`;
    const hit = this.repeatCache.get(key);
    if (hit) return hit;
    const t = texture.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.rotation = rotation;
    t.anisotropy = this.aniso;
    this.repeatCache.set(key, t);
    return t;
  }

  photo(key, { repeat = [1, 1], rotation = 0, color = 0xffffff, roughness = 1, metalness = 0, normalScale = 0.7, ao = true, side = THREE.FrontSide } = {}) {
    const cacheKey = `${key}|${repeat}|${rotation}|${color}|${roughness}|${metalness}|${normalScale}|${side}`;
    if (this.photoCache.has(cacheKey)) return this.photoCache.get(cacheKey);
    const p = this.tex.photos[key];
    if (!p) return new THREE.MeshStandardMaterial({ color: 0x888888 });
    const mat = new THREE.MeshStandardMaterial({
      map: this.cloneRepeat(p.map, repeat[0], repeat[1], rotation),
      normalMap: this.cloneRepeat(p.normal, repeat[0], repeat[1], rotation),
      roughnessMap: this.cloneRepeat(p.rough, repeat[0], repeat[1], rotation),
      color, roughness, metalness, side,
    });
    mat.normalScale.set(normalScale, normalScale);
    this.photoCache.set(cacheKey, mat);
    return mat;
  }

  painted(color, {
    roughness = 0.5, metalness = 0.1, clearcoat = 0.4, clearcoatRoughness = 0.35,
    seed = 4, variation = 0.8, side = THREE.FrontSide, transparent = false, opacity = 1,
  } = {}) {
    // Quantise the albedo so near-identical paints share one material. A platform
    // full of one-off shades means one extra draw call (and one extra canvas
    // texture) for every tiny prop; 4 bits per channel is well below what the
    // eye can separate under this lighting.
    const num = parseInt(new THREE.Color(color).getHexString(), 16);
    const q = (v) => Math.min(255, Math.round(v / 16) * 16);
    const hex = ((q((num >> 16) & 255) << 16) | (q((num >> 8) & 255) << 8) | q(num & 255))
      .toString(16).padStart(6, '0');
    const key = `paint|${hex}|${roughness}|${metalness}|${side}|${transparent}|${opacity}`;
    if (this.cache.has(key)) return this.cache.get(key);
    // Flat albedo. The static merge folds all painted parts into a single
    // vertex-coloured material, so per-part paint textures were pure overhead:
    // ~90 canvas texture sets and one draw call per shade.
    const tint = new THREE.Color(`#${hex}`);
    const m = new THREE.MeshStandardMaterial({
      color: tint,
      roughness,
      metalness,
      envMapIntensity: 0.34,
      side,
      transparent,
      opacity,
    });
    m.userData.paintTint = tint;
    this.cache.set(key, m);
    return m;
  }

  roofMetal(color = 0x8e9196) {
    return this.painted(color, { roughness: 0.68, metalness: 0.45, clearcoat: 0.1, seed: 13, variation: 1.2 });
  }

  // Side skins for rolling stock: the livery colour with a painted-in service
  // history (skirt dust, roof soot, rain runnels, panel seams). Returns a
  // mapped material, so it skips the palette collapse — one extra draw call
  // per livery instead of one per coach.
  weathered(color, { roughness = 0.58, metalness = 0.05, seed = 11 } = {}) {
    const hex = new THREE.Color(color).getHexString();
    const key = `weather|${hex}|${roughness}|${metalness}|${seed}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      map: this.tex.weathering(color, seed),
      roughness,
      metalness,
      envMapIntensity: 0.34,
    });
    this.cache.set(key, m);
    return m;
  }

  metal(color = 0x8f9198, roughness = 0.32, metalness = 0.9) {
    const key = `metal|${color}|${roughness}|${metalness}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.userData.metalTint = new THREE.Color(color);
    this.cache.set(key, m);
    return m;
  }

  rust() {
    if (this.cache.has('rust')) return this.cache.get('rust');
    const p = this.tex.photos.rust;
    const m = new THREE.MeshStandardMaterial({
      map: this.cloneRepeat(p.map, 2, 1),
      normalMap: this.cloneRepeat(p.normal, 2, 1),
      roughnessMap: this.cloneRepeat(p.rough, 2, 1),
      roughness: 1, metalness: 0.55,
    });
    this.cache.set('rust', m);
    return m;
  }

  concrete(repeat = [4, 16], color = 0xb0a795) {
    return this.photo('concrete', { repeat, color, normalScale: 0.5, roughness: 1 });
  }

  ballast(repeat = [2, 28]) {
    return this.photo('ballast', { repeat, normalScale: 0.9, color: 0xa39a8d });
  }

  wood(repeat = [1, 1], color = 0xffffff) {
    const key = `wood|${repeat}|${color}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this.tex.photos.wood;
    const m = new THREE.MeshStandardMaterial({
      map: this.cloneRepeat(p.map, repeat[0], repeat[1]),
      normalMap: this.cloneRepeat(p.normal, repeat[0], repeat[1]),
      roughnessMap: this.cloneRepeat(p.rough, repeat[0], repeat[1]),
      color, roughness: 0.8, metalness: 0.0,
    });
    this.cache.set(key, m);
    return m;
  }

  leather(color = 0xb9a58b, repeat = [1, 1]) {
    const key = `leather|${color}|${repeat}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this.tex.photos.leather;
    const m = new THREE.MeshStandardMaterial({
      map: this.cloneRepeat(p.map, repeat[0], repeat[1]),
      normalMap: this.cloneRepeat(p.normal, repeat[0], repeat[1]),
      roughnessMap: this.cloneRepeat(p.rough, repeat[0], repeat[1]),
      color, roughness: 0.7, metalness: 0.0,
    });
    this.cache.set(key, m);
    return m;
  }

  glass(tint = 0x0a141c, opacity = 0.9, roughness = 0.055) {
    const key = `glass|${tint}|${opacity}|${roughness}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshPhysicalMaterial({
      color: tint, metalness: 0.04, roughness,
      transparent: true, opacity,
      envMapIntensity: 0.55,
      clearcoat: 0.5, clearcoatRoughness: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    m.userData.noShadow = true;
    this.cache.set(key, m);
    return m;
  }

  led(color = 0xfff1cf, intensity = 4) {
    const key = `led|${color}|${intensity}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = new THREE.Color(color);
    const m = new THREE.MeshStandardMaterial({
      color: c.clone().multiplyScalar(0.35),
      emissive: c,
      emissiveIntensity: intensity,
      roughness: 0.25,
      metalness: 0.0,
    });
    this.cache.set(key, m);
    return m;
  }

  emissive(color, intensity = 2, base = 0x000000) {
    const key = `emissive|${color}|${intensity}|${base}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
    this.cache.set(key, m);
    return m;
  }

  get rubber() {
    if (this.cache.has('rubber')) return this.cache.get('rubber');
    const m = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.95, metalness: 0.0 });
    this.cache.set('rubber', m);
    return m;
  }

  get blackMetal() {
    if (this.cache.has('blackMetal')) return this.cache.get('blackMetal');
    const m = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.55, metalness: 0.7 });
    this.cache.set('blackMetal', m);
    return m;
  }

  get chrome() { return this.metal(0xd8dde3, 0.12, 1.0); }
  get brass() { return this.metal(0xb99552, 0.28, 0.95); }
  get copper() { return this.metal(0x8a5738, 0.35, 0.95); }
  get aluminium() { return this.metal(0xb5b8bb, 0.4, 0.85); }
  get darkGlass() { return this.glass(0x050d12, 0.94); }
  get mirror() { return this.metal(0xffffff, 0.03, 1.0); }

  get creamWall() {
    if (this.cache.has('creamWall')) return this.cache.get('creamWall');
    const m = new THREE.MeshStandardMaterial({ color: 0xd8d0bd, roughness: 0.85, metalness: 0.0 });
    this.cache.set('creamWall', m);
    return m;
  }

  get ceiling() {
    if (this.cache.has('ceiling')) return this.cache.get('ceiling');
    const m = new THREE.MeshStandardMaterial({ color: 0xe4e0d3, roughness: 0.7, metalness: 0.0 });
    this.cache.set('ceiling', m);
    return m;
  }

  get darkPlastic() {
    if (this.cache.has('darkPlastic')) return this.cache.get('darkPlastic');
    const m = new THREE.MeshStandardMaterial({ color: 0x232526, roughness: 0.55, metalness: 0.15 });
    this.cache.set('darkPlastic', m);
    return m;
  }

  get greyPlastic() {
    if (this.cache.has('greyPlastic')) return this.cache.get('greyPlastic');
    const m = new THREE.MeshStandardMaterial({ color: 0x6e7274, roughness: 0.6, metalness: 0.2 });
    this.cache.set('greyPlastic', m);
    return m;
  }

  get ivoryPlastic() {
    if (this.cache.has('ivoryPlastic')) return this.cache.get('ivoryPlastic');
    const m = new THREE.MeshStandardMaterial({ color: 0xded8c8, roughness: 0.48, metalness: 0.05 });
    this.cache.set('ivoryPlastic', m);
    return m;
  }

  fabric(color = 0x354a63, repeat = [4, 4]) {
    const key = `fabric|${color}|${repeat}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const base = new THREE.Color(color);
    ctx.fillStyle = `#${base.getHexString()}`; ctx.fillRect(0, 0, 256, 256);
    ctx.globalAlpha = 0.085;
    for (let i = 0; i < 256; i += 2) {
      ctx.fillStyle = i % 4 ? '#ffffff' : '#000000';
      ctx.fillRect(i, 0, 1, 256);
      ctx.fillRect(0, i, 256, 1);
    }
    ctx.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    // the weave texture already carries the base colour — tinting it again
    // would square the albedo and turn every seat almost black
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.94, metalness: 0.0 });
    this.cache.set(key, m);
    return m;
  }

  carpet(color = 0x2c3034, repeat = [4, 12]) {
    const key = `carpet|${color}|${repeat}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const rng = (() => { let s = 913; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
    ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${rng() > .5 ? '255,255,255' : '0,0,0'},${rng() * .07})`;
      ctx.fillRect(rng() * 256, rng() * 256, 1.4, 1.4);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    const m = new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, roughness: 0.98 });
    this.cache.set(key, m);
    return m;
  }

  skyEnvIntensity(scene) {
    if (scene) scene.environmentIntensity = 1.0;
  }
}
