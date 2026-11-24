import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Static-geometry batching.
 *
 * The scene is authored as hundreds of small, readable meshes. That is lovely
 * to write and terrible to draw: every mesh is a draw call in the beauty pass
 * and another in the shadow pass. This pass bakes everything that never moves
 * into one mesh per material, in world space, and removes the originals.
 *
 * It also collapses the paint palette. Every `mats.painted()` part carries a
 * flat tint, so instead of one material and one draw call per shade we bake the
 * tint into vertex colours and use a single shared material for the lot. This
 * is what takes the platform from ~300 draw calls to well under a hundred.
 *
 * Objects that are animated (flags, fans, clock hands, walking passengers) must
 * be marked `userData.dynamic = true` before this runs, or their ancestor group
 * must be. Sprites, points, lines, instanced meshes and custom shaders are left
 * alone.
 */

const KEEP = new Set(['position', 'normal', 'uv', 'color']);

let paintMaterial = null;
let metalMaterial = null;
function sharedPaint() {
  if (!paintMaterial) {
    paintMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.58, metalness: 0.16, envMapIntensity: 0.38,
    });
    paintMaterial.name = 'paint-palette';
  }
  return paintMaterial;
}
function sharedMetal() {
  if (!metalMaterial) {
    metalMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.42, metalness: 0.72, envMapIntensity: 0.5,
    });
    metalMaterial.name = 'metal-palette';
  }
  return metalMaterial;
}

function isDynamic(o) {
  let n = o;
  while (n) {
    if (n.userData && n.userData.dynamic) return true;
    if (n.userData && n.userData.noMerge) return true;
    n = n.parent;
  }
  return false;
}

function normalise(geo, { keepColor = false, tint = null } = {}) {
  const g = geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name === 'color') continue;
    if (!KEEP.has(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.normal && g.attributes.position) g.computeVertexNormals();
  if (!g.attributes.uv && g.attributes.position) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (tint) {
    const count = g.attributes.position.count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = tint.r; arr[i * 3 + 1] = tint.g; arr[i * 3 + 2] = tint.b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  } else if (keepColor) {
    if (!g.attributes.color) {
      const count = g.attributes.position.count;
      const arr = new Float32Array(count * 3).fill(1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
  } else {
    g.deleteAttribute('color');
  }
  return g;
}

/**
 * Merge every static mesh under `root` into one mesh per material.
 * Returns the group holding the baked meshes.
 */
export function mergeStatic(root, {
  name = 'baked-static',
  target = null,
  maxGroupTris = Infinity,
  include = null,
} = {}) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const candidates = [];

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (o.isSprite || o.isPoints || o.isLine) return;
    if (!o.visible) return;
    if (isDynamic(o)) return;
    if (!o.geometry || !o.geometry.attributes.position) return;
    if (!o.material || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.isShaderMaterial) return;
    if (m.blending !== THREE.NormalBlending && m.blending !== THREE.AdditiveBlending) return;
    if (m.blending === THREE.AdditiveBlending && m.depthWrite) return;
    if (include && !include(o)) return;
    candidates.push(o);
  });

  for (const o of candidates) {
    const g = o.geometry;
    const m = o.material;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const indexed = g.index ? 1 : 0;

    // Palette collapse: paint and plain metal parts share one material each.
    const tint = !m.transparent && !m.map && !m.vertexColors && !m.emissiveMap
      ? (m.userData.paintTint || m.userData.metalTint || null) : null;
    const kind = tint ? (m.userData.metalTint ? 'metal' : 'paint') : null;
    const palMat = kind === 'metal' ? sharedMetal() : kind === 'paint' ? sharedPaint() : m;

    const key = tint
      ? `palette|${kind}|${m.side}|${indexed}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder | 0}`
      : [
        m.uuid,
        o.castShadow ? 1 : 0,
        o.receiveShadow ? 1 : 0,
        o.renderOrder | 0,
        indexed,
        m.vertexColors ? 1 : 0,
      ].join('|');

    let entry = groups.get(key);
    if (!entry) {
      entry = {
        material: palMat,
        tint: null,
        castShadow: o.castShadow,
        receiveShadow: o.receiveShadow,
        renderOrder: o.renderOrder | 0,
        keepColor: !!m.vertexColors,
        items: [],
        tris: 0,
      };
      groups.set(key, entry);
    }
    // Keep individual batches bounded so one huge merged mesh does not defeat
    // frustum culling for the whole platform.
    if (entry.tris + tris > maxGroupTris && entry.items.length) {
      entry = { ...entry, items: [], tris: 0 };
      groups.set(`${key}#${Math.random()}`, entry);
    }
    entry.items.push({ o, tint });
    entry.tris += tris;
  }

  const holder = target || new THREE.Group();
  if (!target) holder.name = name;

  let mergedCount = 0;
  let bakedTris = 0;
  for (const entry of groups.values()) {
    if (!entry.items.length) continue;
    const geos = [];
    for (const { o, tint } of entry.items) {
      const g = normalise(o.geometry, { keepColor: entry.keepColor, tint });
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
    }
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
    if (merged) {
      const mesh = new THREE.Mesh(merged, entry.material);
      mesh.castShadow = entry.castShadow;
      mesh.receiveShadow = entry.receiveShadow;
      mesh.renderOrder = entry.renderOrder;
      mesh.name = `baked:${entry.material.name || entry.material.type}`;
      holder.add(mesh);
      mergedCount += 1;
      bakedTris += (merged.index ? merged.index.count : merged.attributes.position.count) / 3;
    }
    for (const g of geos) g.dispose();
    for (const { o } of entry.items) {
      if (o.parent) o.parent.remove(o);
      o.geometry.dispose();
    }
  }

  if (!target) root.add(holder);
  return { group: holder, mergedCount, bakedTris };
}

export function markDynamic(o) {
  if (!o) return o;
  o.userData.dynamic = true;
  return o;
}
