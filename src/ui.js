const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ICON = {
  wheel: `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <circle cx="20" cy="20" r="15" stroke="currentColor" stroke-width=".9" opacity=".8"/>
    <circle cx="20" cy="20" r="9.5" stroke="currentColor" stroke-width=".7" opacity=".45"/>
    <circle cx="20" cy="20" r="3.1" stroke="currentColor" stroke-width="1"/>
    <path d="M20 5v30M5 20h30M9.4 9.4l21.2 21.2M30.6 9.4L9.4 30.6" stroke="currentColor" stroke-width=".55" opacity=".55"/>
  </svg>`,
  soundOn: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M15.4 9.2a4 4 0 010 5.6M18 6.8a7.4 7.4 0 010 10.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M16 9.5l4.5 5M20.5 9.5L16 14.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  horn: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 10.5v3a1.5 1.5 0 001.5 1.5H8l5 4.2V6.3L8 10.5H4.5A1.5 1.5 0 003 12z" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M16 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" opacity=".7"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18L18 6M9 6h9v9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.1"/><path d="M12 10.7v6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="12" cy="7.7" r=".9" fill="currentColor"/></svg>`,
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class UI {
  constructor({ onTrain, onMood, onMode, onCamera, onSound, onHorn, onAbout, trains, moods }) {
    this.trains = trains;
    this.moods = moods;
    this.onTrain = onTrain;
    this.onMood = onMood;
    this.onMode = onMode;
    this.onCamera = onCamera;
    this.onSound = onSound;
    this.onHorn = onHorn;
    this.onAbout = onAbout;
    this.mode = 'platform';
    this.activeTrain = trains[0].id;
    this.activeMood = 'golden';
    this.camera = 'arrival';
    this.audioOn = false;
    this.visible = false;
    this._build();
    this._bind();
    this._clock();
  }

  _build() {
    const root = $('#ui');
    root.innerHTML = `
      <div class="ui-scrim ui-scrim-top"></div>
      <div class="ui-scrim ui-scrim-bottom"></div>
      <div class="ui-scrim ui-scrim-left"></div>

      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">${ICON.wheel}</span>
          <span class="brand-text">
            <b>Rail Darshan</b>
            <i>भारत दर्शन · INDIAN RAILWAYS IN LIGHT</i>
          </span>
        </div>
        <div class="station-tag">
          <span class="station-hi">भारत नगर</span>
          <span class="station-en">BHARAT NAGAR <em>·</em> PLATFORM 1</span>
          <span class="station-clock" id="station-clock">17:42:00</span>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="horn-btn" title="Sound the horn (H)" aria-label="Sound the horn">${ICON.horn}</button>
          <button class="icon-btn" id="sound-btn" title="Toggle sound" aria-label="Toggle sound">${ICON.soundOff}<span class="icon-label">Sound off</span></button>
          <button class="icon-btn" id="about-btn" title="About this project" aria-label="About this project">${ICON.info}</button>
        </div>
      </header>

      <div class="mode-tabs" role="tablist" aria-label="View mode">
        <button class="mode-tab is-active" data-mode="platform" role="tab">Platform</button>
        <button class="mode-tab" data-mode="interior" role="tab">Interior</button>
        <span class="mode-ink"></span>
      </div>

      <section class="train-card" aria-live="polite">
        <div class="card-rule"></div>
        <div class="card-body" id="card-body"></div>
      </section>

      <section class="mood-rail" aria-label="Time of day">
        <span class="rail-label">Light</span>
        <div class="mood-list" id="mood-list"></div>
        <span class="mood-caption" id="mood-caption">Golden hour · 17:42</span>
      </section>

      <section class="view-rail" aria-label="Camera">
        <span class="rail-label">View</span>
        <div class="view-list" id="view-list"></div>
      </section>

      <footer class="bottom-bar">
        <button class="rail-arrow left" id="rail-prev" aria-label="Previous train">‹</button>
        <div class="train-rail" id="train-rail"></div>
        <button class="rail-arrow right" id="rail-next" aria-label="Next train">›</button>
      </footer>

      <div class="hint" id="hint"><span>Drag to look</span><i></i><span>Scroll to zoom</span><i></i><span>H for horn</span></div>

      <div class="announce" id="announce" aria-live="polite">
        <span class="announce-kicker">Station announcement</span>
        <strong class="announce-en"></strong>
        <span class="announce-hi"></span>
      </div>

      <div class="modal" id="about-modal" aria-hidden="true">
        <div class="modal-panel">
          <button class="modal-close" id="modal-close" aria-label="Close">${ICON.close}</button>
          <p class="eyebrow">About this study</p>
          <h2>Steel, steam and<br><em>the last light.</em></h2>
          <p class="modal-lede">Rail Darshan is a real-time, in-browser portrait of Indian Railways — fifteen trains, fourteen interiors, five kinds of light, and a fictional platform called Bharat Nagar.</p>
          <div class="modal-cols">
            <div>
              <h4>What you are seeing</h4>
              <p>Every locomotive, carriage, bench, fan and figure is built procedurally in Three.js. Paint, grime, ballast and upholstery use photographed PBR textures; the sky is a captured HDRI. The audio is synthesised live in Web Audio.</p>
            </div>
            <div>
              <h4>Keys</h4>
              <ul>
                <li><kbd>←</kbd><kbd>→</kbd> change train</li>
                <li><kbd>1</kbd><kbd>2</kbd> platform / interior</li>
                <li><kbd>M</kbd> cycle the light</li>
                <li><kbd>H</kbd> horn &nbsp; <kbd>S</kbd> sound</li>
              </ul>
            </div>
          </div>
          <p class="modal-foot">A fictional station and a personal study — not affiliated with Indian Railways. HDRIs and textures from Poly Haven (CC0); type under the SIL Open Font License.</p>
        </div>
      </div>

      <div class="fade-veil" id="fade-veil"></div>
    `;

    // trains
    $('#train-rail').innerHTML = trainsMarkup(this.trains, this.activeTrain);
    // moods
    $('#mood-list').innerHTML = this.moods.map(([id, m]) =>
      `<button class="mood-btn${id === 'golden' ? ' is-active' : ''}" data-mood="${id}" title="${esc(m.label)}">
        <span class="mood-dot mood-${id}"></span><span class="mood-name">${esc(m.label)}</span>
      </button>`).join('');
    this._renderViews();
    this._renderCard(this.trains[0], 0);
  }

  _renderViews() {
    const views = this.mode === 'platform'
      ? [['arrival', 'Arrival'], ['broadside', 'Broadside'], ['station', 'Facade'], ['wheels', 'Trackside'], ['cab', 'Cab']]
      : [['bay', 'Bay'], ['corridor', 'Corridor'], ['window', 'Window']];
    $('#view-list').innerHTML = views.map(([id, label]) =>
      `<button class="view-btn${id === (this.mode === 'platform' ? this.camera : this.interiorView || 'bay') ? ' is-active' : ''}" data-view="${id}">${label}</button>`
    ).join('');
  }

  _renderCard(def, index) {
    const [f1, f2] = def.facts || [[], []];
    $('#card-body').innerHTML = `
      <p class="eyebrow"><span>${String(index + 1).padStart(2, '0')}</span> / ${String(this.trains.length).padStart(2, '0')} <i></i> ${esc(def.class)}</p>
      <h1 class="train-title">${titleCase(def.name)}</h1>
      <p class="train-hi">${esc(def.hindi)}</p>
      <p class="train-tagline">${esc(def.tagline)}</p>
      <div class="train-meta">
        <span>${esc(def.route)}</span>
        <span class="dot"></span>
        <span>${def.speed} km/h</span>
        <span class="dot"></span>
        <span>${esc(def.number)}</span>
      </div>
      <p class="train-copy">${esc(def.copy)}</p>
      <div class="train-facts">
        ${(def.facts || []).slice(0, 2).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
      </div>
      <div class="card-actions">
        <button class="btn-primary" id="enter-btn">${this.mode === 'platform' ? 'Step inside' : 'Back to platform'} ${ICON.arrow}</button>
        <span class="card-index"><b>${esc(def.builders)}</b><i>${def.introduced} · ${esc(f1?.[0] || '')}</i></span>
      </div>
    `;
    const enter = $('#enter-btn', $('#card-body'));
    if (enter) enter.addEventListener('click', () => this.onMode(this.mode === 'platform' ? 'interior' : 'platform'));
    this._swapIn($('.train-title'));
  }

  _swapIn(el) {
    if (!el) return;
    el.classList.remove('swap-in');
    void el.offsetWidth;
    el.classList.add('swap-in');
  }

  setTrain(def, index) {
    this.activeTrain = def.id;
    this._renderCard(def, index);
    $$('.train-item').forEach(el => {
      const on = el.dataset.id === def.id;
      el.classList.toggle('is-active', on);
      if (on) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
    // Set the active car colour on the UI
    document.documentElement.style.setProperty('--accent', def.accent || '#e8a33d');
  }

  setMood(id, cfg) {
    this.activeMood = id;
    $$('.mood-btn').forEach(el => el.classList.toggle('is-active', el.dataset.mood === id));
    $('#mood-caption').textContent = `${cfg.label} · ${cfg.time}`;
    document.documentElement.style.setProperty('--mood', id);
  }

  setMode(mode) {
    this.mode = mode;
    $$('.mode-tab').forEach(el => el.classList.toggle('is-active', el.dataset.mode === mode));
    document.body.dataset.mode = mode;
    this._renderViews();
    $('#enter-btn')?.remove();
    const def = this.trains.find(t => t.id === this.activeTrain) || this.trains[0];
    const index = this.trains.indexOf(def);
    this._renderCard(def, Math.max(0, index));
    // label of the primary action is regenerated when the card is rendered
    const enter = $('#enter-btn');
    if (enter) {
      enter.innerHTML = `${mode === 'platform' ? 'Step inside' : 'Back to platform'} ${ICON.arrow}`;
      enter.addEventListener('click', () => this.onMode(mode === 'platform' ? 'interior' : 'platform'));
    }
  }

  setCamera(id, mode = 'platform') {
    if (mode === 'interior') this.interiorView = id;
    else this.camera = id;
    $$('.view-btn').forEach(el => el.classList.toggle('is-active', el.dataset.view === id));
  }

  setSound(on) {
    this.audioOn = on;
    const btn = $('#sound-btn');
    if (!btn) return;
    btn.innerHTML = `${on ? ICON.soundOn : ICON.soundOff}<span class="icon-label">${on ? 'Sound on' : 'Sound off'}</span>`;
    btn.classList.toggle('is-on', on);
    $('#horn-btn').classList.toggle('is-available', on);
  }

  announce(en, hi, kicker = 'Station announcement') {
    const el = $('#announce');
    if (!el) return;
    $('.announce-kicker', el).textContent = kicker;
    $('.announce-en', el).textContent = en;
    $('.announce-hi', el).textContent = hi;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => el.classList.remove('show'), 7600);
  }

  fade(to, duration = 600) {
    const veil = $('#fade-veil');
    if (!veil) return Promise.resolve();
    veil.style.transition = `opacity ${duration}ms ease`;
    veil.style.opacity = to;
    return new Promise(res => setTimeout(res, duration));
  }

  reveal() {
    this.visible = true;
    document.body.classList.add('ui-ready');
  }

  openModal(open) {
    const modal = $('#about-modal');
    modal.classList.toggle('open', open);
    modal.setAttribute('aria-hidden', String(!open));
  }

  _bind() {
    $('#train-rail').addEventListener('click', (e) => {
      const item = e.target.closest('.train-item');
      if (item) this.onTrain(item.dataset.id);
    });
    $('#rail-prev').addEventListener('click', () => this._stepTrain(-1));
    $('#rail-next').addEventListener('click', () => this._stepTrain(1));
    $('#mood-list').addEventListener('click', (e) => {
      const b = e.target.closest('.mood-btn');
      if (b) this.onMood(b.dataset.mood);
    });
    $('#view-list').addEventListener('click', (e) => {
      const b = e.target.closest('.view-btn');
      if (b) this.onCamera(b.dataset.view, this.mode);
    });
    $$('.mode-tab').forEach(tab => tab.addEventListener('click', () => this.onMode(tab.dataset.mode)));
    $('#sound-btn').addEventListener('click', () => this.onSound());
    $('#horn-btn').addEventListener('click', () => {
      if (this.audioOn) this.onHorn();
      else this.onSound();
    });
    $('#about-btn').addEventListener('click', () => this.openModal(true));
    $('#modal-close').addEventListener('click', () => this.openModal(false));
    $('#about-modal').addEventListener('click', (e) => { if (e.target.id === 'about-modal') this.openModal(false); });
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'ArrowRight') this._stepTrain(1);
      if (e.key === 'ArrowLeft') this._stepTrain(-1);
      if (e.key === '1') this.onMode('platform');
      if (e.key === '2') this.onMode('interior');
      if (e.key === 'h' || e.key === 'H') { if (this.audioOn) this.onHorn(); else this.onSound(); }
      if (e.key === 's' || e.key === 'S') this.onSound();
      if (e.key === 'm' || e.key === 'M') {
        const i = this.moods.findIndex(([id]) => id === this.activeMood);
        this.onMood(this.moods[(i + 1) % this.moods.length][0]);
      }
      if (e.key === 'Escape') this.openModal(false);
    });
    setTimeout(() => $('#hint')?.classList.add('fade'), 12000);
  }

  _stepTrain(dir) {
    const idx = this.trains.findIndex(t => t.id === this.activeTrain);
    const next = this.trains[(idx + dir + this.trains.length) % this.trains.length];
    this.onTrain(next.id);
  }

  _clock() {
    const tick = () => {
      const el = $('#station-clock');
      if (!el) return;
      const d = new Date();
      el.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
    };
    tick();
    setInterval(tick, 1000);
  }
}

function titleCase(name) {
  // Keep small words lowercase, set the rest in the display serif.
  const small = new Set(['of', 'the', 'and', 'a', 'an', 'to', 'for']);
  return esc(name).split(' ').map((w, i) => {
    if (/^[’'"]/.test(w)) return w;
    if (i > 0 && small.has(w.toLowerCase())) return `<em>${w.toLowerCase()}</em>`;
    return w;
  }).join(' ');
}

function trainsMarkup(trains, active) {
  return trains.map((t, i) => `
    <button class="train-item${t.id === active ? ' is-active' : ''}" data-id="${t.id}">
      <span class="ti-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="ti-name">${esc(t.name)}</span>
      <span class="ti-hi">${esc(t.hindi)}</span>
    </button>`).join('');
}
