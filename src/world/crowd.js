import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, rr, pick, makeCanvas, canvasTexture } from '../core/util.js';

function coloured(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.getAttribute('position').count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function part(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  coloured(geo, color);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  geo.applyMatrix4(m);
  return geo;
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// Bake a cheap object-space occlusion term into the cloth colours: torso
// hems and ankles sink into shadow, and every downward-facing surface loses
// a little light. It costs nothing at render time and stops figures reading
// as flat cut-outs at mid distance.
function bakeShade(geo, { floor, top, base = 0.16, dir = 0.22 } = {}) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
  if (!col) return geo;
  const span = Math.max(0.001, top - floor);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - floor) / span));
    const down = Math.max(0, -nrm.getY(i));
    const occl = base * (1 - t) * (1 - t) + dir * down * down;
    const k = 1 - Math.min(0.52, occl);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return geo;
}

const SKIN = [0x6e4a32, 0x8c5e3d, 0xa97552, 0x5b3c28, 0xc08c65];
const SHIRT = [0xdad4c4, 0xc7d0d4, 0x9fb3c8, 0xd2c6ad, 0x8f3c30, 0x3c546b, 0x758066, 0xc6a268, 0x934554, 0xd0c8b3];
const PANTS = [0x2b2d31, 0x40392f, 0x202326, 0x584b38, 0x1d2a38, 0x4d5560, 0x7d735f];
const SAREE = [0x9c3b44, 0xc08234, 0x74304a, 0x40665f, 0xc9a24a, 0x7a3f41, 0x47707f, 0xa05a62, 0xd6ccb6, 0x6d7c8a];

let _shadowMat = null;
function contactMaterial() {
  if (_shadowMat) return _shadowMat;
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,.95)');
  g.addColorStop(0.42, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  _shadowMat = new THREE.MeshBasicMaterial({
    map: t, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1,
  });
  return _shadowMat;
}

function addGroundShadow(group, width = 0.68) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.8), contactMaterial());
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.012, 0.02);
  m.renderOrder = 1;
  group.add(m);
  return m;
}

export function buildCrowd(scene, mats, { platformY = 0.98, zMin = -88, zMax = 60, seed = 3, walkers = 14, standers = 18, seatedCount = 8 } = {}) {
  const root = new THREE.Group();
  root.name = 'crowd';
  const rng = mulberry32(seed);
  const weaveCanvas = makeCanvas(256, 256);
  const wctx = weaveCanvas.getContext('2d');
  wctx.fillStyle = '#ffffff'; wctx.fillRect(0, 0, 256, 256);
  // soft vertical drape folds, then a much finer weave on top; the map stays
  // neutral so the per-vertex cloth colours still read
  for (let i = 0; i < 34; i++) {
    const x = rng() * 256, w = rr(rng, 3, 20), a = rr(rng, 0.025, 0.085);
    const grad = wctx.createLinearGradient(x - w, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, `rgba(0,0,0,${a.toFixed(3)})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    wctx.fillStyle = grad;
    wctx.fillRect(x - w, 0, w * 2, 256);
  }
  for (let i = 0; i < 14; i++) {
    const x = rng() * 256, w = rr(rng, 2, 12), a = rr(rng, 0.02, 0.06);
    const grad = wctx.createLinearGradient(x - w, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    wctx.fillStyle = grad;
    wctx.fillRect(x - w, 0, w * 2, 256);
  }
  for (let i = 0; i < 256; i += 2) {
    wctx.fillStyle = i % 4 ? 'rgba(0,0,0,.038)' : 'rgba(255,255,255,.03)';
    wctx.fillRect(i, 0, 1, 256);
    wctx.fillRect(0, i, 256, 1);
  }
  for (let i = 0; i < 320; i++) {
    wctx.fillStyle = rng() > 0.5 ? 'rgba(30,24,16,.03)' : 'rgba(255,255,255,.04)';
    wctx.fillRect(rng() * 256, rng() * 256, rr(rng, 1, 6), rr(rng, 1, 3));
  }
  const weaveTex = canvasTexture(weaveCanvas, { repeat: [2, 2] });
  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: weaveTex, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.45,
  });

  function createFigure({ female = false, turban = false, cap = false, carry = false, seated = false, child = false, saree = false, shirt: shirtOverride = null, pants: pantsOverride = null } = {}) {
    const g = new THREE.Group();
    const skin = pick(rng, SKIN);
    const shirt = shirtOverride ?? (saree || female ? pick(rng, SAREE) : pick(rng, SHIRT));
    const pants = pantsOverride ?? pick(rng, PANTS);
    const height = child ? rr(rng, 1.15, 1.32) : rr(rng, 1.55, 1.82);
    const scale = height / 1.72;
    const build = rr(rng, 0.93, 1.07);
    g.scale.set(scale * build, scale, scale * build);

    const upperParts = [];
    // torso
    if (saree) {
      // blouse + draped skirt. A single cone reads as a traffic cone at
      // distance, so the skirt is a straight column that only flares at the
      // hem, and the blouse is a shade apart from it.
      const blouse = new THREE.Color(shirt).multiplyScalar(1.16).getHex();
      upperParts.push(part(new THREE.CylinderGeometry(0.146, 0.168, 0.32, 8), blouse, { pos: [0, 1.26, 0] }));
      upperParts.push(part(new THREE.CylinderGeometry(0.18, 0.196, 0.6, 10), shirt, { pos: [0, 0.8, 0] }));
      upperParts.push(part(new THREE.CylinderGeometry(0.196, 0.262, 0.42, 10), shirt, { pos: [0, 0.29, 0] }));
      for (let k = -2; k <= 2; k++) {
        upperParts.push(part(new THREE.BoxGeometry(0.03, 0.84, 0.024), new THREE.Color(shirt).multiplyScalar(k % 2 ? 0.84 : 1.1).getHex(), {
          pos: [k * 0.048, 0.44, 0.2 - Math.abs(k) * 0.018], rot: [0.03, 0, k * 0.03],
        }));
      }
      upperParts.push(part(new THREE.BoxGeometry(0.19, 0.6, 0.034), new THREE.Color(shirt).multiplyScalar(1.1).getHex(), { pos: [-0.075, 1.24, 0.115], rot: [0.05, 0, 0.2] }));
      upperParts.push(part(new THREE.BoxGeometry(0.17, 0.46, 0.028), new THREE.Color(shirt).multiplyScalar(0.9).getHex(), { pos: [-0.165, 0.95, -0.125], rot: [0, 0, 0.08] }));
      // sandals peeking under the hem
      for (const side of [-1, 1]) upperParts.push(part(new THREE.BoxGeometry(0.075, 0.045, 0.17), 0x2f2a22, { pos: [side * 0.08, 0.03, 0.03] }));
    } else if (female) {
      // kurta over churidar with a dupatta
      upperParts.push(part(new THREE.CylinderGeometry(0.176, 0.246, 0.8, 9), shirt, { pos: [0, 1.0, 0] }));
      upperParts.push(part(new THREE.CapsuleGeometry(0.176, 0.1, 3, 8), shirt, { pos: [0, 1.4, 0] }));
      upperParts.push(part(new THREE.BoxGeometry(0.2, 0.06, 0.22), new THREE.Color(shirt).multiplyScalar(0.72).getHex(), { pos: [0, 1.43, 0.02] }));
      upperParts.push(part(new THREE.BoxGeometry(0.145, 0.66, 0.026), new THREE.Color(shirt).multiplyScalar(1.14).getHex(), { pos: [0.1, 1.18, 0.15], rot: [0.04, 0, -0.16] }));
    } else {
      upperParts.push(part(new THREE.CylinderGeometry(0.198, 0.158, 0.6, 8), shirt, { pos: [0, 1.12, 0] }));
      upperParts.push(part(new THREE.CapsuleGeometry(0.188, 0.115, 3, 8), shirt, { pos: [0, 1.4, 0] }));
      // sleeve seams, collar, placket and belt
      for (const side of [-1, 1]) upperParts.push(part(new THREE.SphereGeometry(0.068, 7, 5), new THREE.Color(shirt).multiplyScalar(0.78).getHex(), { pos: [side * 0.175, 1.39, 0] }));
      upperParts.push(part(new THREE.TorusGeometry(0.072, 0.011, 4, 10), new THREE.Color(shirt).multiplyScalar(0.55).getHex(), { pos: [0, 1.44, 0], rot: [Math.PI / 2, 0, 0] }));
      upperParts.push(part(new THREE.BoxGeometry(0.026, 0.26, 0.014), new THREE.Color(shirt).multiplyScalar(1.35).getHex(), { pos: [0, 1.28, 0.178] }));
      upperParts.push(part(new THREE.BoxGeometry(0.288, 0.05, 0.2), new THREE.Color(pants).multiplyScalar(0.62).getHex(), { pos: [0, 0.838, 0.004] }));
      // seat/hip block: closes the slit between shirt hem and trousers that
      // otherwise shows the platform straight through the figure
      upperParts.push(part(new THREE.CylinderGeometry(0.162, 0.172, 0.17, 9), pants, { pos: [0, 0.79, 0] }));
      upperParts.push(part(new THREE.CylinderGeometry(0.172, 0.158, 0.18, 8), pants, { pos: [0, 0.8, 0] }));
      // untucked shirt hem for some
      if (rng() > 0.55) upperParts.push(part(new THREE.CylinderGeometry(0.166, 0.178, 0.1, 8), shirt, { pos: [0, 0.79, 0] }));
    }
    if (saree) {
      const border = rng() > 0.4 ? 0xd9c18a : new THREE.Color(shirt).multiplyScalar(0.5).getHex();
      upperParts.push(part(new THREE.CylinderGeometry(0.266, 0.266, 0.05, 10), border, { pos: [0, 0.045, 0] }));
      upperParts.push(part(new THREE.CylinderGeometry(0.153, 0.165, 0.03, 8), border, { pos: [0, 1.11, 0] }));
      // pallu falling off the left shoulder, with its own border
      upperParts.push(part(new THREE.BoxGeometry(0.15, 0.5, 0.026), border, { pos: [-0.14, 1.2, 0.135], rot: [0.04, 0, 0.14] }));
    }
    // neck + head
    upperParts.push(part(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 6), skin, { pos: [0, 1.46, 0] }));
    upperParts.push(part(new THREE.SphereGeometry(0.108, 10, 8), skin, { pos: [0, 1.57, 0], scale: [0.92, 1.08, 0.95] }));
    // hair
    if (!turban && !cap) {
      const hair = female ? 0x241c17 : 0x241d16;
      upperParts.push(part(new THREE.SphereGeometry(0.112, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), hair, { pos: [0, 1.59, -0.008], scale: [1, 1.02, 1.03] }));
      if (female) {
        upperParts.push(part(new THREE.CapsuleGeometry(0.06, 0.26, 3, 6), hair, { pos: [0, 1.4, -0.12] }));
        upperParts.push(part(new THREE.SphereGeometry(0.055, 8, 6), hair, { pos: [0, 1.57, -0.11], scale: [1, 0.9, 0.8] }));
      }
    }
    // face
    const eyeMat = 0x241b16;
    for (const side of [-1, 1]) {
      upperParts.push(part(new THREE.SphereGeometry(0.0125, 5, 4), eyeMat, { pos: [side * 0.034, 1.586, 0.099] }));
    }
    upperParts.push(part(new THREE.ConeGeometry(0.014, 0.03, 5), skin, { pos: [0, 1.553, 0.108], rot: [Math.PI / 2, 0, 0] }));
    upperParts.push(part(new THREE.BoxGeometry(0.038, 0.006, 0.008), 0x6d3b31, { pos: [0, 1.517, 0.104] }));
    if (female) upperParts.push(part(new THREE.SphereGeometry(0.009, 5, 4), 0x8f1f28, { pos: [0, 1.638, 0.101] }));
    if (turban) {
      upperParts.push(part(new THREE.CylinderGeometry(0.11, 0.13, 0.13, 9), 0xe9dcc2, { pos: [0, 1.69, 0], rot: [0.04, 0, 0.05] }));
      upperParts.push(part(new THREE.CylinderGeometry(0.04, 0.12, 0.08, 7), 0xe9dcc2, { pos: [0.03, 1.76, 0], rot: [0, 0, -0.4] }));
    }
    if (cap) {
      upperParts.push(part(new THREE.CylinderGeometry(0.104, 0.113, 0.055, 10), 0x2a3446, { pos: [0, 1.676, 0] }));
      upperParts.push(part(new THREE.CylinderGeometry(0.114, 0.114, 0.022, 10), 0x14171c, { pos: [0, 1.648, 0] }));
      upperParts.push(part(new THREE.BoxGeometry(0.17, 0.018, 0.10), 0x1d222c, { pos: [0, 1.651, 0.10] }));
      upperParts.push(part(new THREE.BoxGeometry(0.055, 0.012, 0.02), 0xc7b47a, { pos: [0, 1.69, 0.104] }));
    }
    // arms
    const armLen = seated ? 0.34 : 0.58;
    for (const side of [-1, 1]) {
      const arm = new THREE.CapsuleGeometry(0.048, armLen, 3, 6);
      coloured(arm, shirt);
      const swing = seated ? 0 : rr(rng, -0.2, 0.14);
      const shoulder = new THREE.Vector3(side * (female ? 0.21 : 0.256), 1.35, 0.0);
      const aa = new THREE.Matrix4().compose(
        shoulder.clone().add(new THREE.Vector3(side * 0.02, -armLen * 0.5, 0)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(swing, 0, side * (seated ? 1.1 : 0.11))),
        new THREE.Vector3(1, 1, 1),
      );
      arm.applyMatrix4(aa);
      upperParts.push(arm);
      // hand, hung off the true sleeve end so it never floats free
      arm.computeBoundingBox();
      const bb = arm.boundingBox;
      const hand = new THREE.SphereGeometry(0.045, 6, 5);
      coloured(hand, skin);
      hand.translate(
        (bb.min.x + bb.max.x) * 0.5,
        bb.min.y + 0.012,
        (bb.min.z + bb.max.z) * 0.5 + 0.01,
      );
      upperParts.push(hand);
    }
    // bag / bedding on head
    if (carry) {
      upperParts.push(part(new THREE.CylinderGeometry(0.172, 0.138, 0.3, 7), 0x6f5e42, { pos: [0, 1.99, 0], rot: [0.02, 0.2, 0.01] }));
      upperParts.push(part(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 5), 0x8a3130, { pos: [0, 1.7, 0.115] }));
    }
    if (rng() > 0.75) {
      // shoulder bag
      upperParts.push(part(new THREE.BoxGeometry(0.2, 0.26, 0.09), 0x3c3428, { pos: [0.22, 1.02, -0.02], rot: [0, 0, 0.12] }));
    }

    const upperGeo = mergeParts(upperParts);
    bakeShade(upperGeo, { floor: 0.82, top: 1.85, base: 0.20, dir: 0.26 });
    const upper = new THREE.Mesh(upperGeo, bodyMat);
    upper.castShadow = true;
    upper.receiveShadow = true;
    g.add(upper);

    const legs = [];
    if (!saree) {
      for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.122, 0.87, 0);
        const legParts = [];
        legParts.push(part(new THREE.SphereGeometry(0.09, 7, 5), pants, { pos: [0, -0.02, 0] }));
        // thighs are thicker than ankles; a straight tube reads as a peg leg
        legParts.push(part(new THREE.CylinderGeometry(0.088, 0.062, 0.8, 7), pants, { pos: [0, -0.41, 0] }));
        legParts.push(part(new THREE.BoxGeometry(0.112, 0.055, 0.24), 0x2b241c, { pos: [0, -0.842, 0.045] }));
        legParts.push(part(new THREE.BoxGeometry(0.104, 0.045, 0.13), 0x211c17, { pos: [0, -0.85, 0.145], rot: [0.12, 0, 0] }));
        const geo = bakeShade(mergeParts(legParts), { floor: -0.9, top: 0.0, base: 0.2, dir: 0.2 });
        const mesh = new THREE.Mesh(geo, bodyMat);
        mesh.castShadow = true;
        hip.add(mesh);
        if (seated) hip.rotation.x = -1.35;
        g.add(hip);
        legs.push(hip);
      }
    }
    return { group: g, legs, upper, height, seated };
  }

  const people = [];
  // mid-platform walkers
  for (let i = 0; i < walkers; i++) {
    const opts = {
      female: rng() > 0.68,
      saree: rng() > 0.52,
      turban: rng() > 0.86,
      cap: rng() > 0.92,
      carry: i % 9 === 2,
      child: i % 12 === 7,
    };
    const f = createFigure(opts);
    const z = rr(rng, zMin + 10, zMax - 12);
    const x = rr(rng, 4.6, 14.8);
    f.group.position.set(x, platformY, z);
    f.group.rotation.y = rng() > 0.5 ? 0 : Math.PI;
    f.dir = rng() > 0.5 ? 1 : -1;
    f.speed = rr(rng, 0.35, 0.8);
    f.phase = rng() * Math.PI * 2;
    f.zMin = zMin + 5; f.zMax = zMax - 5;
    f.group.userData.dynamic = true;
    root.add(f.group);
    people.push(f);
  }
  // small standing groups: waiting, chatting, queueing
  const standSpots = [
    [6.4, -65.0, 1.6], [7.2, -64.2, -2.4], [12.6, -66.2, 0.5],
    [7.0, -57.5, 0.4], [7.6, -56.9, -2.6], [9.2, -53.4, 1.7],
    [10.6, -49.4, -0.4], [11.2, -48.7, 2.2], [9.6, -44.8, 1.1],
    [5.7, -41.2, -0.9], [6.4, -40.6, 0.7], [8.7, -36.2, 2.5], [9.4, -35.5, -1.3],
    [10.9, -26.4, 0.2], [5.8, -22.3, 1.8], [6.5, -21.6, -1.9],
    [8.0, -19.4, 0.5], [8.7, -18.7, 2.7], [9.0, -2.2, -0.6], [9.7, -1.5, 1.4],
    [12.7, 6.2, 2.1], [13.4, 6.8, -0.7], [7.0, 14.4, 0.9], [7.7, 15.0, -2.4],
    [10.0, 22.3, 1.2], [10.7, 22.9, -1.6], [13.0, 30.2, 0.3],
    [5.8, 37.4, 1.9], [6.5, 38.0, -0.8],
  ];
  for (let i = 0; i < Math.min(standers, standSpots.length); i++) {
    const [x, z, ry] = standSpots[i];
    const f = createFigure({
      female: rng() > 0.64, saree: rng() > 0.56, turban: rng() > 0.88,
      child: i === 10, carry: i === 3,
    });
    f.group.position.set(x, platformY, z);
    f.group.rotation.y = ry;
    f.idle = rng() * Math.PI * 2;
    root.add(f.group);
    people.push(f);
  }
  // porters in red shirts with bedding rolls
  for (const [x, z, ry] of [[8.4, -57.4, 0.6], [4.9, -21.8, -1.2], [12.1, 10.4, 2.4]]) {
    const f = createFigure({ carry: true, shirt: 0x8f3a31, pants: 0xc6bda8, turban: rng() > 0.5 });
    f.group.position.set(x, platformY, z);
    f.group.rotation.y = ry;
    root.add(f.group);
    people.push(f);
  }
  // seated figures on the real benches
  const benchSpots = [
    [12.35, -56.6, -Math.PI / 2], [12.35, -42.6, -Math.PI / 2],
    [12.35, -14.6, -Math.PI / 2], [12.35, 13.6, -Math.PI / 2],
    [12.35, 27.6, -Math.PI / 2], [6.05, -49.5, Math.PI / 2],
    [6.05, -7.5, Math.PI / 2], [6.05, 20.5, Math.PI / 2],
  ];
  for (let i = 0; i < Math.min(seatedCount, benchSpots.length); i++) {
    const [x, z, ry] = benchSpots[i];
    const f = createFigure({ seated: true, female: i % 3 === 1, turban: i === 4 });
    f.group.position.set(x, platformY - 0.36, z);
    f.group.rotation.y = ry;
    root.add(f.group);
    people.push(f);
  }
  // chaiwala at the stall and a couple of figures at the platform edge
  const chai = createFigure({ turban: true });
  chai.group.position.set(13.0, platformY, -56.5);
  chai.group.rotation.y = -0.8;
  root.add(chai.group);
  people.push(chai);

  // near-camera life: a porter with a head load and a waiting family
  {
    const porter = createFigure({ carry: true, turban: true, shirt: 0x8f3a31, pants: 0xc6bda8 });
    porter.group.position.set(8.6, platformY, -66.8);
    porter.group.rotation.y = Math.PI + 0.35;
    porter.idle = 0.4;
    root.add(porter.group);
    people.push(porter);

    const a = createFigure({ turban: true, pants: 0x2b2d31 });
    a.group.position.set(6.9, platformY, -70.6);
    a.group.rotation.y = Math.PI;
    a.idle = 1.8;
    root.add(a.group);
    people.push(a);

    const b = createFigure({ female: true, saree: true });
    b.group.position.set(7.6, platformY, -69.6);
    b.group.rotation.y = -1.1;
    b.idle = 3.1;
    root.add(b.group);
    people.push(b);

    const kid = createFigure({ child: true });
    kid.group.position.set(8.1, platformY, -70.3);
    kid.group.rotation.y = 2.6;
    kid.idle = 4.2;
    root.add(kid.group);
    people.push(kid);

    // the snacks-stall vendor, facing the camera along the counter end
    const vendor = createFigure({ shirt: 0xb9b09a, pants: 0x3a3a38, cap: true });
    vendor.group.position.set(14.24, platformY, -70.4);
    vendor.group.rotation.y = Math.PI - 0.35;
    vendor.idle = 2.3;
    root.add(vendor.group);
    people.push(vendor);

    // a customer at the counter, between the camera and the stall
    const buyer = createFigure({ female: true, saree: true, shirt: 0x6d7f86 });
    buyer.group.position.set(12.15, platformY, -68.7);
    buyer.group.rotation.y = -Math.PI / 2 + 0.25;
    buyer.idle = 5.1;
    root.add(buyer.group);
    people.push(buyer);
  }

  for (const [x, z, ry] of [[3.7, -50, -Math.PI / 2], [3.8, -29, -Math.PI / 2], [4.0, -78, 0.9]]) {
    const f = createFigure({ female: rng() > 0.5, saree: rng() > 0.5 });
    f.group.position.set(x, platformY, z);
    f.group.rotation.y = ry;
    root.add(f.group);
    people.push(f);
  }

  // silhouette figures across the tracks
  for (let i = 0; i < 4; i++) {
    const f = createFigure({ female: i === 2 });
    f.group.position.set(-23 - rng() * 3, 0.98, rr(rng, -50, 40));
    f.group.rotation.y = rr(rng, -1, 1);
    root.add(f.group);
    people.push(f);
  }

  // Ground the static figures with a soft blob; walkers carry their own
  // moving shadow implicitly through the sun, and keeping their draw count
  // down matters more than a blob that slides along the floor.
  for (const p of people) {
    if (p.speed === undefined && !p.seated) addGroundShadow(p.group, 0.7 * (p.height / 1.72));
  }

  scene.add(root);
  let t = 0;
  return {
    root,
    update(dt, time) {
      t += dt;
      for (const p of people) {
        if (p.seated || p.speed === undefined) {
          if (p.idle !== undefined) p.group.rotation.z = Math.sin(time * 0.55 + p.idle) * 0.012;
          continue;
        }
        const g = p.group;
        g.position.z += p.dir * p.speed * dt;
        if (g.position.z > p.zMax) { p.dir = -1; g.rotation.y = Math.PI; }
        if (g.position.z < p.zMin) { p.dir = 1; g.rotation.y = 0; }
        if (p.legs.length) {
          const amp = 0.28 * Math.min(1, p.speed * 1.4);
          p.phase += dt * p.speed * 6.2;
          p.legs[0].rotation.x = Math.sin(p.phase) * amp;
          p.legs[1].rotation.x = -Math.sin(p.phase) * amp;
          p.upper.position.y = Math.abs(Math.sin(p.phase)) * 0.018;
          g.rotation.z = Math.sin(p.phase) * 0.014;
        }
      }
    },
  };
}
