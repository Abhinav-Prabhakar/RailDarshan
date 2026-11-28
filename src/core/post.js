import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uVignette: { value: 0.36 },
    uGrain: { value: 0.055 },
    uAberration: { value: 0.0016 },
    uWarm: { value: 1.0 },
    uContrast: { value: 1.03 },
    uSaturation: { value: 1.02 },
    uLift: { value: new THREE.Color(0.012, 0.015, 0.022) },
    uFade: { value: 0.0 },
    uAA: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uWarm, uContrast, uSaturation, uFade, uAA;
    uniform vec2 uResolution;
    uniform vec3 uLift;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    // Compact FXAA: five taps plus a directional blend. The default preset
    // renders without MSAA (a 2x half-float resolve costs ~5 ms here), so this
    // takes its place for the price of one full-screen shader.
    vec3 fxaa(sampler2D tex, vec2 uv, vec2 inv) {
      vec3 nw = texture2D(tex, uv + vec2(-1.0, -1.0) * inv).rgb;
      vec3 ne = texture2D(tex, uv + vec2( 1.0, -1.0) * inv).rgb;
      vec3 sw = texture2D(tex, uv + vec2(-1.0,  1.0) * inv).rgb;
      vec3 se = texture2D(tex, uv + vec2( 1.0,  1.0) * inv).rgb;
      vec3 m  = texture2D(tex, uv).rgb;
      float lm = luma(m);
      float lMin = min(lm, min(min(luma(nw), luma(ne)), min(luma(sw), luma(se))));
      float lMax = max(lm, max(max(luma(nw), luma(ne)), max(luma(sw), luma(se))));
      vec2 dir = vec2(
        -((luma(nw) + luma(ne)) - (luma(sw) + luma(se))),
         ((luma(nw) + luma(sw)) - (luma(ne) + luma(se)))
      );
      float reduce = max((luma(nw) + luma(ne) + luma(sw) + luma(se)) * 0.03125, 0.0078125);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * inv;
      vec3 a = 0.5 * (texture2D(tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
                      texture2D(tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tex, uv + dir * -0.5).rgb +
                                 texture2D(tex, uv + dir *  0.5).rgb);
      float lb = luma(b);
      return (lb < lMin || lb > lMax) ? a : b;
    }

    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      vec3 col = uAA > 0.5 ? fxaa(tDiffuse, uv, 1.0 / uResolution) : texture2D(tDiffuse, uv).rgb;
      float r2 = dot(d, d);
      col *= 1.0 - r2 * 0.012;

      // gentle filmic split tone: cooler shadows, warmer highlights
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.94, 0.975, 1.04);
      vec3 highTint = mix(vec3(1.0), vec3(1.045, 1.01, 0.965), clamp(uWarm, 0.0, 1.4) * 0.7);
      col *= mix(shadowTint, highTint, smoothstep(0.08, 0.85, lum));

      col = (col - 0.5) * uContrast + 0.5;
      lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSaturation);
      col += uLift * (1.0 - smoothstep(0.0, 0.5, lum));

      // vignette
      float vig = smoothstep(0.95, 0.18, length(d) * (1.0 + uVignette));
      col *= mix(1.0, vig, uVignette * 0.55);

      // soft print grain, strongest in midtones
      float n = hash(uv * uResolution + vec2(uTime * 37.0, uTime * 17.0)) - 0.5;
      col += n * uGrain * smoothstep(0.0, 0.25, lum) * smoothstep(1.1, 0.55, lum);

      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, width, height, quality = 'high') {
    this.renderer = renderer;
    this.quality = quality;
    this.scene = null;
    this.camera = null;
    this.time = 0;
    this.aoEnabled = quality === 'cinematic';
    this.aoScale = 0.5;

    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: quality === 'cinematic' ? 4 : 0,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(renderer.getPixelRatio());

    this.renderPass = new RenderPass(null, null);
    this.composer.addPass(this.renderPass);

    try {
      const bootCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      this.gtao = new GTAOPass(null, bootCamera, width, height);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.86;
      this.gtao.updateGtaoMaterial({
        radius: 0.9,
        distanceExponent: 1.2,
        thickness: 0.8,
        scale: 1.0,
        samples: 12,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1.0, rings: 2, samples: 8 });
      this.composer.addPass(this.gtao);
    } catch (e) {
      console.warn('GTAO unavailable', e);
      this.gtao = null;
    }

    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.3, 0.65, 0.9);
    // Bloom is a blur; rendering its mips at half resolution is invisible in
    // motion and roughly quarters the bandwidth it consumes.
    const bloomSetSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h, pr) => bloomSetSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)), pr);
    this.composer.addPass(this.bloom);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uAA.value = quality === 'cinematic' ? 0 : 1;
    this.composer.addPass(this.grade);
    this.grade.uniforms.uResolution.value.set(width, height);

    this.setAOScale();
    // The AO prepass runs at half resolution; apply that size now so the
    // first frames do not pay for a full-resolution depth/normal target.
    if (this.gtao) {
      const pr = renderer.getPixelRatio();
      this.gtao.setSize(Math.round(width * pr * this.aoScale), Math.round(height * pr * this.aoScale));
    }
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.gtao) {
      this.gtao.scene = scene;
      this.gtao.camera = camera;
    }
  }

  setMood(cfg) {
    if (!cfg) return;
    this.sceneCfg = cfg;
    this.bloom.strength = cfg.bloom.strength;
    this.bloom.radius = cfg.bloom.radius;
    this.bloom.threshold = cfg.bloom.threshold;
    const g = cfg.grade || {};
    this.grade.uniforms.uWarm.value = g.warm ?? 1;
    this.grade.uniforms.uContrast.value = g.contrast ?? 1.03;
    this.grade.uniforms.uSaturation.value = g.saturation ?? 1.02;
    this.grade.uniforms.uGrain.value = cfg.rain > 0.5 ? 0.075 : 0.045;
    this.grade.uniforms.uVignette.value = cfg.rain > 0.5 ? 0.4 : 0.36;
  }

  setBloom({ strength = 0.24, radius = 0.58, threshold = 0.92 } = {}) {
    this.bloom.strength = strength;
    this.bloom.radius = radius;
    this.bloom.threshold = threshold;
  }

  setAOScale() {
    if (!this.gtao) return;
    this.gtao.enabled = this.aoEnabled;
  }

  setAO(on) {
    this.aoEnabled = !!on;
    this.setAOScale();
  }

  setSize(width, height) {
    this.size = { width, height };
    this.composer.setSize(width, height);
    const pr = this.renderer.getPixelRatio();
    this.grade.uniforms.uResolution.value.set(width * pr, height * pr);
    if (this.gtao) {
      this.gtao.setSize(Math.round(width * pr * this.aoScale), Math.round(height * pr * this.aoScale));
    }
  }

  render(dt) {
    this.time += dt;
    this.grade.uniforms.uTime.value = this.time;
    this.composer.render(dt);
  }

  setFade(v) {
    this.grade.uniforms.uFade.value = v;
  }
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance',
    stencil: false, alpha: false, logarithmicDepthBuffer: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = true;
  return renderer;
}
