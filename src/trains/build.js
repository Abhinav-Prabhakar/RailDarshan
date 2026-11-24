import * as THREE from 'three';
import { MeshBatch, mulberry32, rr } from '../core/util.js';
import { buildCoach, interiorGlowTexture } from './coaches.js';
import { buildWap7, buildWdm3a, buildSteam } from './loco.js';
import { addPantograph } from './parts.js';
import { makeGlowSprite } from '../world/tracks.js';

function makeWindowMaterial(livery) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(livery.window || '#0a141c'),
    metalness: 0.05,
    roughness: 0.16,
    transparent: true,
    opacity: 0.9,
    envMapIntensity: 0.38,
    clearcoat: 0.45,
    clearcoatRoughness: 0.06,
    emissive: 0xffb469,
    emissiveMap: interiorGlowTexture(),
    emissiveIntensity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.userData.noShadow = true;
  return m;
}

function makeSmoke(scene) {
  // A single Points cloud instead of 90 sprites: one draw call, one material,
  // and the puffs still drift and fade exactly as before.
  const count = 78;
  const group = new THREE.Group();
  const rng = mulberry32(14);
  const puffs = [];
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    puffs.push({
      life: rng(), speed: rr(rng, 0.7, 1.3), drift: rr(rng, -0.35, 0.35), size: rr(rng, 1.2, 2.6),
    });
    positions[i * 3 + 1] = -100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 30);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: makeGlowSprite() },
      uColor: { value: new THREE.Color(0xd8d4cc) },
    },
    vertexShader: /* glsl */`
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(260.0, aSize * (320.0 / max(0.1, -mv.z)));
        vAlpha = aAlpha;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a * vAlpha < 0.003) discard;
        gl_FragColor = vec4(uColor, t.a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);
  group.visible = false;
  return {
    group,
    update(dt, t) {
      if (!group.visible) return;
      for (let i = 0; i < count; i++) {
        const p = puffs[i];
        p.life += dt * 0.22 * p.speed;
        if (p.life > 1) p.life -= 1;
        const k = p.life;
        positions[i * 3] = p.drift * k * 8 + Math.sin(t * 0.6 + p.speed * 4) * 0.5 * k;
        positions[i * 3 + 1] = k * 12 + 0.2;
        positions[i * 3 + 2] = -k * 5 + Math.cos(t * 0.4 + p.speed) * 0.4;
        sizes[i] = p.size + k * 5.5;
        alphas[i] = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.32;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    },
  };
}

export function buildRake(scene, tex, mats, def) {
  const root = new THREE.Group();
  root.name = `train-${def.id}`;
  const windowMat = makeWindowMaterial(def.loco || def.train || def.coach.livery || {});
  const cars = [];
  let cursor = 0;
  let loco = null;
  let smokeLocal = null;
  let panto = null;

  if (def.mode === 'hauled') {
    if (def.loco.type === 'wdm3a') loco = buildWdm3a(tex, mats, def.loco, { windowMat });
    else loco = buildWap7(tex, mats, def.loco, { windowMat, variant: def.loco.type === 'wap5' ? 'wap5' : 'wap7' });
    const frontOffset = loco.len / 2;
    loco.group.position.z = frontOffset;
    root.add(loco.group);
    cursor = frontOffset + loco.len / 2 - 0.6;
    const count = def.coach.count;
    for (let i = 0; i < count; i++) {
      const cfg = { ...def.coach };
      if (i === 0) cfg._pantograph = false;
      const car = buildCoach(tex, mats, cfg, { index: i, windowMat });
      const z = cursor + 0.4 + car.length / 2;
      car.group.position.z = z;
      root.add(car.group);
      cars.push(car);
      cursor = z + car.length / 2;
    }
  } else if (def.mode === 'steam' || def.mode === 'narrow_gauge') {
    const narrow = def.mode === 'narrow_gauge';
    loco = buildSteam(tex, mats, def.loco, { narrow, windowMat });
    const frontOffset = loco.len / 2;
    loco.group.position.z = frontOffset;
    loco.group.scale.setScalar(narrow ? 0.82 : 1);
    root.add(loco.group);
    smokeLocal = new THREE.Vector3(loco.smoke[0], loco.smoke[1] * (narrow ? 0.82 : 1), frontOffset + loco.smoke[2] * (narrow ? 0.82 : 1));
    cursor = frontOffset - loco.len / 2 + loco.totalLen * (narrow ? 0.82 : 1) + 0.5;
    const count = def.coach.count;
    for (let i = 0; i < count; i++) {
      const car = buildCoach(tex, mats, { ...def.coach }, { index: i, windowMat });
      if (narrow) car.group.scale.setScalar(0.82);
      const z = cursor + (car.length * (narrow ? 0.82 : 1)) / 2 + 0.4;
      car.group.position.z = z;
      root.add(car.group);
      cars.push(car);
      cursor = z + (car.length * (narrow ? 0.82 : 1)) / 2;
    }
  } else if (def.mode === 'trainset') {
    const t = def.train;
    const count = t.cars;
    const gap = 0.85;
    for (let i = 0; i < count; i++) {
      const cfg = {
        ...t,
        type: t.type,
        livery: t.livery,
        _noseFront: i === 0,
        _noseRear: i === count - 1,
        _pantograph: t.pantographCar === i,
      };
      const car = buildCoach(tex, mats, cfg, { index: i, windowMat });
      const z = i * (car.length + gap) + car.length / 2;
      car.group.position.z = z;
      if (cfg._pantograph) {
        const pb = new MeshBatch('panto');
        const top = car.group.userData.topY || 4.0;
        const p = addPantograph(pb, mats, { y: top + 0.15, z: 0.6, raised: true, height: 1.15 });
        const pg = pb.build(car.group, 'pantograph');
        panto = p;
      }
      root.add(car.group);
      cars.push(car);
    }
    cursor = count * (cars[0].length + gap);
  }

  // headlight spotlight (intensity managed by mood)
  let spot = null;
  if (def.mode !== 'steam' || true) {
    spot = new THREE.SpotLight(0xffe7bd, 0, 80, 0.46, 0.6, 1.4);
    spot.position.set(0, 2.9, 0.8);
    spot.target.position.set(0, 0.35, -78);
    root.add(spot);
    root.add(spot.target);
  }
  // glow billboards at the front
  if (loco) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowSprite(), color: 0xffe2a8, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.set(0, def.mode === 'steam' ? 2.85 : 2.75, 0.3);
    glow.scale.setScalar(1.8);
    root.add(glow);
  }

  // brake / coupler sound points could be derived
  const smoke = makeSmoke(scene);
  smoke.group.position.copy(smokeLocal || new THREE.Vector3(0, 0, 0));
  root.add(smoke.group);
  if (smokeLocal) smoke.group.visible = true;

  let length = 0;
  for (const c of cars) length += c.length + 0.9;
  length += loco ? (loco.totalLen || loco.len) : 0;

  scene.add(root);
  return {
    root,
    length,
    windowMat,
    spot,
    panto,
    smoke,
    smokeLocal,
    loco,
    update(dt, t) {
      smoke.update(dt, t);
    },
  };
}

export function disposeRake(scene, rake) {
  if (!rake) return;
  rake.root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
  });
  scene.remove(rake.root);
}
