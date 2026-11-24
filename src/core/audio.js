/**
 * Synthesised soundscape: no audio files, everything is generated in Web Audio.
 * Two beds (platform / carriage), rain, rail joints, a two-tone horn and the
 * station chime. Created lazily so browsers never block autoplay.
 */
export class Soundscape {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.mode = 'platform';
    this.mood = 'golden';
    this.time = 0;
    this._clack = 1.2;
    this._distant = 24;
    this._ready = false;
  }

  get available() { return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); }

  async enable() {
    if (!this.available) return false;
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.enabled = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.9, now, 0.7);
    return true;
  }

  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.25);
  }

  async toggle() {
    if (this.enabled) { this.disable(); return false; }
    return this.enable();
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.9, 2.4);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.24;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);

    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.9;
    this.ambience.connect(this.master);

    const noise = this._noise(3);

    const loop = (filterType, frequency, q) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = q || 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(filter); filter.connect(gain); gain.connect(this.ambience);
      src.start();
      return { src, filter, gain };
    };

    this.crowd = loop('bandpass', 720, 0.55);
    this.wind = loop('lowpass', 380, 0.5);
    this.rumble = loop('lowpass', 110, 0.8);
    this.rain = loop('highpass', 1100, 0.35);
    this.rain2 = loop('bandpass', 2400, 0.4);

    // carriage air-conditioning hum
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.0001;
    this.humGain.connect(this.master);
    for (const [f, g] of [[62, 0.5], [100, 0.28], [197, 0.06]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og); og.connect(this.humGain);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.28;
    lfo.connect(lfoGain); lfoGain.connect(this.humGain.gain);
    lfo.start();

    this._ready = true;
    this.setMode(this.mode, true);
    this.setMood(this.mood, true);
  }

  _noise(seconds = 2) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        // gentle pink-ish tilt
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
      }
    }
    return buf;
  }

  _impulse(seconds = 2, decay = 2.5) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _ramp(node, value, time = 0.9) {
    if (!this.ctx || !node) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(Math.max(0.0001, value), now, time / 3);
  }

  setMode(mode, instant = false) {
    this.mode = mode;
    if (!this._ready) return;
    const t = instant ? 0.02 : 0.9;
    const isCar = mode === 'interior';
    this._ramp(this.crowd.gain, isCar ? 0.008 : 0.048, t);
    this._ramp(this.wind.gain, isCar ? 0.014 : 0.028, t);
    this._ramp(this.rumble.gain, isCar ? 0.085 : 0.022, t);
    this._ramp(this.humGain, isCar ? 0.07 : 0.006, t);
  }

  setMood(mood, instant = false) {
    this.mood = mood;
    if (!this._ready) return;
    const t = instant ? 0.02 : 2.2;
    const wet = { golden: 0.06, noon: 0, blue: 0.15, night: 0.1, monsoon: 1 }[mood] ?? 0;
    const crowd = { golden: 1, noon: 1.1, blue: 0.85, night: 0.5, monsoon: 0.7 }[mood] ?? 1;
    this._ramp(this.rain.gain, wet * 0.11, t);
    this._ramp(this.rain2.gain, wet * 0.05, t);
    this._ramp(this.ambience, 0.65 + crowd * 0.3, t);
    this._crowdMood = crowd;
  }

  /* ---------------------------------------------------------------- events */
  horn() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const bus = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.8;
    const dist = ctx.createWaveShaper();
    dist.curve = this._saturation(1.8);
    bus.connect(lp); lp.connect(dist); dist.connect(this.master);
    const send = ctx.createGain(); send.gain.value = 0.32; dist.connect(send); send.connect(this.reverb);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.17, now + 0.055);
    env.gain.setValueAtTime(0.17, now + 0.48);
    env.gain.exponentialRampToValueAtTime(0.12, now + 0.62);
    env.gain.setValueAtTime(0.12, now + 0.82);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
    env.connect(bus);

    for (const [freq, level, type] of [[311, 0.5, 'sawtooth'], [370, 0.42, 'sawtooth'], [622, 0.09, 'square']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * 1.012, now);
      o.frequency.exponentialRampToValueAtTime(freq, now + 0.8);
      o.detune.value = (Math.random() - 0.5) * 9;
      const g = ctx.createGain(); g.gain.value = level;
      o.connect(g); g.connect(env);
      o.start(now); o.stop(now + 1.75);
    }
  }

  chime(big = false) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const notes = big ? [659.25, 523.25, 392.0] : [783.99, 659.25];
    notes.forEach((f, i) => {
      const t = now + i * 0.26;
      for (const [mult, amp] of [[1, 0.06], [2.01, 0.017], [3.99, 0.008]]) {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        o.connect(g); g.connect(this.master);
        const send = ctx.createGain(); send.gain.value = 0.55;
        g.connect(send); send.connect(this.reverb);
        o.start(t); o.stop(t + 1.55);
      }
    });
  }

  clack(volume = 0.12) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for (const [dt, amp] of [[0, volume], [0.11, volume * 0.72]]) {
      const src = ctx.createBufferSource();
      src.buffer = this._clackBuffer();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1350 + Math.random() * 500; bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.value = amp;
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t0 + dt);
    }
  }

  _clackBuffer() {
    if (this._clackBuf) return this._clackBuf;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-k * 26) * (0.35 + 0.65 * Math.sin(k * 55));
    }
    this._clackBuf = buf;
    return buf;
  }

  _saturation(amount) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    return curve;
  }

  update(dt) {
    if (!this.enabled || !this.ctx) return;
    this.time += dt;
    if (this.mode === 'interior') {
      this._clack -= dt;
      if (this._clack <= 0) {
        this.clack(this.mood === 'night' ? 0.055 : 0.075);
        this._clack = 1.05 + Math.random() * 0.5;
      }
    } else {
      this._distant -= dt;
      if (this._distant <= 0) {
        // a far-off train, felt more than heard
        this._distant = 26 + Math.random() * 34;
        if (this.ctx) {
          const ctx = this.ctx, now = ctx.currentTime;
          const src = ctx.createBufferSource();
          src.buffer = this._noise(2);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.03, now + 1.8);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 5);
          src.connect(lp); lp.connect(g); g.connect(this.master);
          src.start(now); src.stop(now + 5.2);
        }
      }
    }
  }
}
