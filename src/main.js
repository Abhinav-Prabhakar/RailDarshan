import * as THREE from 'three';
import { TextureLibrary } from './core/textures.js';
import { Materials } from './core/materials.js';
import { createRenderer, PostFX } from './core/post.js';
import { SkyLighting, MOODS } from './world/sky.js';
import { buildStation } from './world/station.js';
import { buildRake, disposeRake } from './trains/build.js';
import { TRAINS, trainById, INTERIOR_LABELS } from './trains/catalog.js';
import { TRACK } from './world/tracks.js';
import { UI } from './ui.js';
import { Soundscape } from './core/audio.js';
import { buildInterior } from './modes/interior.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraTransition, clamp, easeInOutCubic } from './core/util.js';
import { mergeStatic } from './core/optimize.js';
import './styles.css';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');

const canvas = document.querySelector('#scene');
const renderer = createRenderer(canvas);
const PIXEL_CAP = clamp(Number(params.get('dpr')) || 1.35, 0.75, 2);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const bakedStatic = new THREE.Group();
bakedStatic.name = 'baked-static';
const bakedTrain = new THREE.Group();
bakedTrain.name = 'baked-train';
scene.add(bakedStatic, bakedTrain);

function under(obj, root) {
  let n = obj;
  while (n) {
    if (n === root) return true;
    n = n.parent;
  }
  return false;
}
const camera = new THREE.PerspectiveCamera(37, window.innerWidth / window.innerHeight, 0.06, 900);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.maxPolarAngle = Math.PI * 0.492;
controls.minDistance = 2.2;
controls.maxDistance = 180;
controls.zoomSpeed = 0.8;
controls.rotateSpeed = 0.65;
controls.panSpeed = 0.5;
controls.enablePan = false;

const CAMERAS = {
  arrival: { pos: [12.6, 2.78, -79], target: [2.4, 2.3, -35], fov: 40 },
  broadside: { pos: [15.0, 2.85, -49.5], target: [2.0, 2.3, -22], fov: 47 },
  wheels: { pos: [-3.8, 1.75, -70], target: [0.2, 1.85, -42], fov: 48 },
  cab: { pos: [-2.2, 2.55, -61.5], target: [0.3, 2.3, -56.0], fov: 40 },
  station: { pos: [6.8, 3.35, -70], target: [16.8, 3.8, -42], fov: 44 },
};

const loader = document.querySelector('#loader');
const loaderBar = document.querySelector('.loader-bar i');
const loaderStatus = document.querySelector('.loader-status');
const tex = new TextureLibrary(renderer);
const post = new PostFX(renderer, window.innerWidth, window.innerHeight, 'high');
const audio = new Soundscape();
const cameraMove = new CameraTransition(camera, controls);

let sky;
let station;
let rake;
let mats;
let interior = null;
let mode = 'platform';
let activeTrain = trainById(params.get('train') || 'rajdhani');
let mood = MOODS[params.get('mood')] ? params.get('mood') : 'golden';
let activeCamera = CAMERAS[params.get('camview')] ? params.get('camview') : 'arrival';
let interiorView = 'bay';
let exteriorCamera = null;
let disposed = false;
let lastAnnounce = 0;
let announceIndex = 0;
let lastFps = 0;

const ui = new UI({
  trains: TRAINS,
  moods: Object.entries(MOODS),
  onTrain: (id) => selectTrain(id),
  onMood: (id) => setMood(id),
  onMode: (m) => setMode(m),
  onCamera: (id) => setView(id),
  onSound: () => toggleSound(),
  onHorn: () => { audio.horn(); },
  onAbout: (v) => ui.openModal(v),
});

// ---------------------------------------------------------------- loading
if (SHOT) {
  loader.style.display = 'none';
  ui.reveal();
}

async function init() {
  await tex.preload((msg, p) => {
    if (loaderStatus) loaderStatus.textContent = msg;
    if (loaderBar) loaderBar.style.width = `${Math.round(p * 88)}%`;
  });
  setStatus('Warming the rails…', 91);
  mats = new Materials(tex);
  sky = new SkyLighting(renderer, scene, tex);

  setStatus('Building Bharat Nagar…', 93);
  station = buildStation(scene, mats, tex);

  setStatus('Bringing in the rake…', 96);
  rake = buildRake(scene, tex, mats, activeTrain);
  rake.root.position.set(0, TRACK.railTop, -56);

  setStatus('Welding the platform…', 98);
  // Bake every static mesh into one draw per material. This is the difference
  // between a few thousand draw calls and a few dozen.
  const mergedStatic = mergeStatic(scene, {
    target: bakedStatic,
    maxGroupTris: 220000,
    include: (o) => !under(o, rake.root),
  });
  mergeStatic(rake.root, { target: bakedTrain, maxGroupTris: 220000 });
  renderer.shadowMap.needsUpdate = true;

  await sky.setMood(mood);
  post.setMood(sky.cfg);
  post.setScene(scene, camera);
  station.setMood(mood, sky.cfg);
  applyTrainMood();
  renderer.shadowMap.needsUpdate = true;

  // opening camera
  const preset = CAMERAS[activeCamera];
  camera.position.set(...preset.pos);
  controls.target.set(...preset.target);
  camera.fov = preset.fov || 37;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  controls.update();

  ui.setTrain(activeTrain, TRAINS.indexOf(activeTrain));
  ui.setMood(mood, MOODS[mood]);
  ui.setCamera(activeCamera, 'platform');
  ui.setMode('platform');
  ui.setSound(false);
  ui.reveal();

  setStatus('All aboard.', 100);
  setTimeout(() => loader.classList.add('done'), 260);
  setTimeout(() => { if (!SHOT) loader.style.display = 'none'; }, 1700);

  // optional deep link
  if (params.get('mode') === 'interior') {
    const v = params.get('view');
    if (v && ['bay', 'corridor', 'window'].includes(v)) interiorView = v;
    await setMode('interior', true);
  }
  if (params.has('cam')) {
    const v = params.get('cam').split(',').map(Number);
    if (v.length === 6 && v.every(Number.isFinite)) {
      camera.position.set(v[0], v[1], v[2]);
      controls.target.set(v[3], v[4], v[5]);
      controls.update();
    }
  }
  if (params.has('fov')) {
    camera.fov = clamp(Number(params.get('fov')) || 37, 18, 80);
    camera.updateProjectionMatrix();
  }

  // handy for visual QA in the browser console
  window.__rail = { THREE, scene, camera, renderer, post, controls, get sky() { return sky; }, get rake() { return rake; }, get station() { return station; }, get interior() { return interior; }, get fps() { return lastFps; }, mergedStatic };

  startLoop();
}

function setStatus(msg, pct) {
  if (loaderStatus) loaderStatus.textContent = msg;
  if (loaderBar) loaderBar.style.width = `${pct}%`;
}

function startLoop() {
  const clock = new THREE.Clock();
  let time = 0;
  let frames = 0;
  let emaDt = 1 / 60;
  let sinceQualityCheck = 0;
  let pixelRatio = Math.min(window.devicePixelRatio, PIXEL_CAP);

  const setResolution = (p) => {
    if (Math.abs(p - pixelRatio) < 0.01) return;
    pixelRatio = p;
    renderer.setPixelRatio(p);
    post.composer.setPixelRatio(p);
    post.setSize(window.innerWidth, window.innerHeight);
  };

  function loop() {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    time += dt;

    cameraMove.update(dt);
    controls.update();
    sky.update(dt);
    sky.anchor(camera);

    if (mode === 'platform') {
      station.update(dt, time, camera, mood);
      rake.update(dt, time);
      // far-off platform announcements
      if (time - lastAnnounce > 44) { lastAnnounce = time; ambientAnnouncement(); }
    } else if (interior) {
      interior.update(dt, time);
    }

    audio.update(dt);
    post.render(dt);

    frames += 1;
    // The sun and the rake are both static: pay for the shadow map once.
    if (frames === 3) renderer.shadowMap.autoUpdate = false;

    if (rawDt > 0 && rawDt < 0.2) {
      emaDt += (rawDt - emaDt) * 0.05;
      lastFps = 1 / emaDt;
    }
    sinceQualityCheck += rawDt;
    if (!SHOT && sinceQualityCheck > 1.6 && document.visibilityState === 'visible') {
      sinceQualityCheck = 0;
      // Adaptive resolution: keep the frame inside the 16.6 ms budget before
      // dropping quality knobs. The scene is shading-bound, so pixels are the
      // cheapest thing to trade for a locked frame rate.
      if (emaDt > 0.0185 && pixelRatio > 0.81) setResolution(Math.max(0.8, pixelRatio - 0.12));
      else if (emaDt < 0.0135 && pixelRatio < Math.min(window.devicePixelRatio, PIXEL_CAP) - 0.01) {
        setResolution(Math.min(Math.min(window.devicePixelRatio, PIXEL_CAP), pixelRatio + 0.06));
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

function applyTrainMood() {
  const cfg = MOODS[mood];
  if (!cfg) return;
  if (rake) {
    rake.windowMat.emissiveIntensity = (cfg.windowGlow ?? 0.4) * 1.35;
    if (rake.spot) {
      const head = { golden: 7, noon: 0, blue: 26, night: 46, monsoon: 18 }[mood] ?? 8;
      rake.spot.intensity = head;
    }
  }
  if (interior) interior.setMood(mood, cfg);
}

function clearBaked(group) {
  for (const child of [...group.children]) {
    if (child.geometry) child.geometry.dispose();
    group.remove(child);
  }
}

// ---------------------------------------------------------------- UI actions
async function selectTrain(id) {
  if (!rake || disposed) return;
  const def = trainById(id);
  if (!def || def.id === activeTrain.id) {
    if (def && def.id === activeTrain.id) {
      if (mode === 'interior') ui.announce(`You are already inside the ${def.name}.`, 'आप इसी गाड़ी के भीतर हैं।');
      return;
    }
  }
  await ui.fade(1, 420);
  const prev = activeTrain;
  activeTrain = def;
  disposeRake(scene, rake);
  clearBaked(bakedTrain);
  rake = buildRake(scene, tex, mats, def);
  rake.root.position.set(0, TRACK.railTop, -56);
  mergeStatic(rake.root, { target: bakedTrain, maxGroupTris: 220000 });
  renderer.shadowMap.needsUpdate = true;
  applyTrainMood();
  if (mode === 'interior') {
    disposeInterior();
    await openInterior(true);
  }
  ui.setTrain(def, TRAINS.indexOf(def));
  ui.announce(
    `Now arriving: ${def.name} to ${routeTo(def)}.`,
    `${def.hindi} · ${INTERIOR_LABELS[def.interior]?.[1] || ''}`,
    'Station announcement',
  );
  if (audio.enabled) audio.chime();
  if (prev.id !== def.id) ui.setCamera(mode === 'platform' ? activeCamera : interiorView, mode);
  await ui.fade(0, 850);
}

async function setMood(id) {
  if (!MOODS[id] || id === mood) return;
  mood = id;
  await ui.fade(0.55, 280);
  await sky.setMood(id);
  post.setMood(sky.cfg);
  if (mode === 'interior') applyPostMood();
  station.setMood(id, sky.cfg);
  applyTrainMood();
  renderer.shadowMap.needsUpdate = true;
  ui.setMood(id, MOODS[id]);
  audio.setMood(id);
  const remark = {
    golden: ['The light falls long across Platform 1.', 'प्लेटफ़ॉर्म एक पर सुनहरी धूप।'],
    noon: ['Midday. The steel ticks in the heat.', 'दोपहर। गर्मी में पटरी चटकती है।'],
    blue: ['Blue hour. The platform lamps wake up.', 'नीला घंटा। लैंप जल उठे।'],
    night: ['Night at Bharat Nagar. The city hums.', 'भारत नगर में रात।'],
    monsoon: ['Monsoon. The ballast is dark with rain.', 'मानसून। बारिश में पटरी भीगी है।'],
  }[id];
  if (remark) ui.announce(remark[0], remark[1], 'Bharat Nagar · Platform 1');
  await ui.fade(0, 900);
}

async function setMode(next, instant = false) {
  if (next === mode && !instant) return;
  if (next === 'interior') {
    await ui.fade(1, 480);
    mode = 'interior';
    exteriorCamera = { pos: camera.position.clone(), target: controls.target.clone() };
    // interior camera limits must be in place before the view is applied:
    // the exterior minDistance would push a close window view back through
    // the seats when entering by deep link
    controls.minDistance = 0.5;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.6;
    controls.minPolarAngle = Math.PI * 0.08;
    if (!interior) await openInterior();
    else applyInteriorView(instant);
    post.setScene(interior.scene, camera);
    applyPostMood();
    camera.fov = interior.views[interiorView]?.fov || 46;
    camera.updateProjectionMatrix();
    ui.setMode('interior');
    ui.setCamera(interiorView, 'interior');
    ui.announce(
      `Inside the ${activeTrain.name} · ${INTERIOR_LABELS[activeTrain.interior]?.[0] || 'Saloon'}.`,
      INTERIOR_LABELS[activeTrain.interior]?.[1] || 'स्वागत है',
      'Coach interior',
    );
    audio.setMode('interior');
    if (audio.enabled) audio.clack(0.1);
    await ui.fade(0, 900);
  } else {
    await ui.fade(1, 480);
    mode = 'platform';
    post.setScene(scene, camera);
    applyPostMood();
    camera.fov = 37;
    camera.updateProjectionMatrix();
    controls.minDistance = 2.2;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI * 0.492;
    controls.minPolarAngle = 0;
    if (sky.cfg) renderer.toneMappingExposure = sky.cfg.exposure;
    if (exteriorCamera) {
      camera.position.copy(exteriorCamera.pos);
      controls.target.copy(exteriorCamera.target);
      controls.update();
    } else {
      applyPlatformView(activeCamera, true);
    }
    ui.setMode('platform');
    ui.setCamera(activeCamera, 'platform');
    ui.announce('Back on Platform 1. Mind the gap.', 'प्लेटफ़ॉर्म एक पर वापस। ध्यान रखें।', 'Bharat Nagar');
    audio.setMode('platform');
    await ui.fade(0, 900);
  }
}

function setView(id) {
  if (mode === 'platform') {
    activeCamera = id;
    ui.setCamera(id, 'platform');
    applyPlatformView(id);
  } else {
    interiorView = id;
    ui.setCamera(id, 'interior');
    applyInteriorView();
  }
}

function applyPlatformView(id, instant = false) {
  const p = CAMERAS[id] || CAMERAS.arrival;
  camera.fov = p.fov || 37;
  camera.updateProjectionMatrix();
  if (instant) {
    camera.position.set(...p.pos);
    controls.target.set(...p.target);
    controls.update();
    return;
  }
  cameraMove.to({ position: p.pos, target: p.target, duration: 2.4, onComplete: () => { controls.enabled = true; } });
  controls.enabled = false;
}

// Interior scenes need a tighter bloom: the cabin lamps sit close to walls and
// would otherwise wash the whole saloon out, especially at night.
const INTERIOR_BLOOM = {
  golden: { strength: 0.24, radius: 0.5, threshold: 0.92 },
  noon: { strength: 0.12, radius: 0.4, threshold: 1.08 },
  blue: { strength: 0.3, radius: 0.55, threshold: 0.86 },
  night: { strength: 0.26, radius: 0.48, threshold: 1.0 },
  monsoon: { strength: 0.18, radius: 0.45, threshold: 0.98 },
};

function applyPostMood() {
  if (mode === 'interior') post.setBloom(INTERIOR_BLOOM[mood]);
  else if (sky.cfg) post.setMood(sky.cfg);
}

async function openInterior(instant = false) {
  interior = buildInterior(tex, mats, activeTrain, { mood, envTex: sky.envCache.get(MOODS[mood].hdri), renderer });
  interior.setMood(mood, MOODS[mood]);
  applyInteriorView(true);
  return interior;
}

function applyInteriorView(instant = false) {
  if (!interior) return;
  const v = interior.views[interiorView] || interior.views.bay;
  camera.fov = v.fov || 46;
  camera.updateProjectionMatrix();
  if (instant) {
    camera.position.set(...v.pos);
    controls.target.set(...v.target);
    camera.lookAt(controls.target);
    controls.update();
    return;
  }
  cameraMove.to({ position: v.pos, target: v.target, duration: 1.7, ease: easeInOutCubic, onComplete: () => { controls.enabled = true; } });
  controls.enabled = false;
}

function disposeInterior() {
  if (!interior) return;
  interior.dispose();
  interior = null;
}

async function toggleSound() {
  const on = await audio.toggle();
  ui.setSound(!!on);
  if (on) {
    audio.setMode(mode);
    audio.setMood(mood);
    audio.chime();
    ui.announce('Sound on. The platform comes alive.', 'ध्वनि चालू।', 'Audio');
  } else {
    ui.announce('Sound off.', 'ध्वनि बंद।', 'Audio');
  }
}

function routeTo(def) {
  const r = def.route || '';
  return (r.split(/→|->|—/)[1] || 'Bharat Nagar').trim();
}

const AMBIENT_LINES = [
  ['The Dehradun Shatabdi will arrive shortly on Platform 1.', 'देहरादून शताब्दी कुछ ही देर में प्लेटफ़ॉर्म एक पर आएगी।'],
  ['Bharat Nagar. Passengers for the Rajdhani Express, please proceed to Platform 1.', 'भारत नगर। राजधानी एक्सप्रेस के यात्री कृपया प्लेटफ़ॉर्म एक पर जाएँ।'],
  ['Please do not cross the tracks. Use the foot over-bridge.', 'कृपया पटरी पार न करें। फुट ओवर ब्रिज का प्रयोग करें।'],
  ['Chai, coffee, cold drinks — available at the stall behind you.', 'चाय, कॉफ़ी, ठंडे पेय — पीछे की दुकान पर उपलब्ध।'],
];
function ambientAnnouncement() {
  const line = AMBIENT_LINES[announceIndex++ % AMBIENT_LINES.length];
  ui.announce(line[0], line[1], 'Station announcement');
  if (audio.enabled) audio.chime();
}

// ---------------------------------------------------------------- events
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// keyboard shortcuts handled in UI; expose a tiny debug surface
window.RailDarshan = {
  selectTrain, setMood, setMode, setView,
  get state() { return { train: activeTrain.id, mood, mode, view: mode === 'interior' ? interiorView : activeCamera }; },
  get stats() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, fps: +lastFps.toFixed(1), pixelRatio: renderer.getPixelRatio(), merged: window.__rail?.mergedStatic?.mergedCount ?? 0 }; },
};

init().catch((err) => {
  console.error(err);
  if (loaderStatus) {
    loaderStatus.textContent = 'Something went wrong: ' + (err?.message || err);
    loaderStatus.style.cssText += ';white-space:pre-wrap;font-size:10px;max-width:900px;text-align:left;line-height:1.5;';
  }
});
