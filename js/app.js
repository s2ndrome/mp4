import { AUDIO_FX, AUDIO_FX_MAP, playGraph, renderAudio, outDuration } from './audio-fx.js';
import { COLOR_PRESETS, COLOR_KEYS, MOTIONS, OVERLAYS, prepareImage, drawFrame } from './image-fx.js';
import { exportVideo, analyze, liveAnalyzer, canWebCodecs, BANDS } from './exporter.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const todayStamp = () => { const d = new Date(); return `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, ' ')} ${String(d.getDate()).padStart(2, ' ')}`; };

// ───────── 상태 ─────────
const DEFAULTS = () => ({
  tab: 'photo',
  photo: { fit: 'cover', bg: 'blur', bgColor: '#000000', zoom: 1, x: 0, y: 0, transition: 'fade', xfade: 0.8 },
  color: { preset: 'none', bright: 0, contrast: 0, sat: 0, warm: 0, fade: 0, sepia: 0, tint: 0, glow: 0 },
  motion: {},
  overlay: {},
  stamp: { on: false, text: todayStamp() },
  text: { content: '', font: '"Noto Sans KR", sans-serif', pos: 'bottom', align: 'center', anim: 'fade', size: 64, color: '#ffffff', shadow: true },
  sound: { fx: [], speed: 1, bass: 0, treble: 0, volume: 1, fadeIn: 0.5, fadeOut: 2, start: 0, end: null },
  out: { ratio: '9:16', res: 1080, fps: 30, vfadeIn: 0.6, vfadeOut: 1.2, silentDur: 10, name: '' },
});
const KEY = 'seol-mp4-v1';
let S = DEFAULTS();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) for (const k of Object.keys(S)) if (saved[k] != null) S[k] = typeof S[k] === 'object' ? { ...S[k], ...saved[k] } : saved[k];
  S.sound.start = 0; S.sound.end = null; // 곡마다 다르니 구간은 기억하지 않음
} catch { /* 무시 */ }
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 무시 */ } }, 300); };

const media = { imgs: [], audio: null, audioName: '', peaks: null };
let uid = 0;

const getK = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
const setK = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], S)[last] = v; };

function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ───────── 오디오 ─────────
let ac = null, analyser = null, live = null;
function audioCtx() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ac.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.6;
    analyser.connect(ac.destination);
    live = liveAnalyzer(analyser);
  }
  return ac;
}

const totalDur = () => (media.audio ? outDuration(media.audio, S.sound) : S.out.silentDur);

const player = { playing: false, pos: 0, t0: 0, ctx0: 0, nodes: null };
function position() {
  if (!player.playing) return player.pos;
  if (player.nodes) return player.pos + (ac.currentTime - player.ctx0);
  return player.pos + (performance.now() - player.t0) / 1000;
}
function stopNodes() {
  if (!player.nodes) return;
  try { player.nodes.src.stop(); } catch { /* 이미 멈춤 */ }
  for (const s of player.nodes.sources) { try { s.stop(); } catch { /* 이미 멈춤 */ } }
  player.nodes = null;
}
async function play() {
  if (player.pos >= totalDur() - 0.05) player.pos = 0;
  player.playing = true;
  player.t0 = performance.now();
  $('#play').textContent = '❚❚';
  if (media.audio) {
    const c = audioCtx();
    await c.resume();
    startNodes();
  }
}
function startNodes() {
  stopNodes();
  const c = audioCtx();
  player.ctx0 = c.currentTime + 0.03;
  player.nodes = playGraph(c, media.audio, S.sound, player.pos, player.ctx0, analyser);
}
function pause() {
  player.pos = Math.min(position(), totalDur());
  player.playing = false;
  stopNodes();
  $('#play').textContent = '▶';
  redraw();
}
function seek(p) {
  const was = player.playing;
  if (was) { player.playing = false; stopNodes(); }
  player.pos = clamp(p, 0, totalDur());
  if (was) play(); else redraw();
}
let sndT = 0;
function soundChanged() {
  updateTrimUI();
  if (!player.playing || !media.audio) return;
  clearTimeout(sndT);
  sndT = setTimeout(() => { if (player.playing) { player.pos = Math.min(position(), totalDur()); startNodes(); } }, 120);
}

// ───────── 사진 ─────────
function colorVals() {
  const v = {};
  for (const k of COLOR_KEYS) v[k] = S.color[k] || 0;
  return v;
}
async function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}
async function addImageFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|bmp|heic)$/i.test(f.name));
  let fail = 0;
  for (const f of list) {
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImage(url);
      media.imgs.push({ id: ++uid, img, url, prep: prepareImage(img, colorVals()) });
    } catch { fail++; URL.revokeObjectURL(url); }
  }
  if (fail) toast(fail === 1 ? '사진 하나를 열 수 없어요. (HEIC는 JPG로 바꿔서 넣어주세요)' : `사진 ${fail}장을 열 수 없어요.`);
  if (list.length - fail > 0) imagesChanged();
}
async function addImageURL(u) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = u;
  await img.decode();
  // 내보내기 때 막히지 않는지 미리 확인
  const c = document.createElement('canvas'); c.width = c.height = 2;
  c.getContext('2d').drawImage(img, 0, 0, 2, 2);
  c.getContext('2d').getImageData(0, 0, 1, 1);
  media.imgs.push({ id: ++uid, img, url: u, prep: prepareImage(img, colorVals()) });
  imagesChanged();
}
function imagesChanged() {
  renderThumbs();
  presetThumbs();
  sizeCanvas();
  redraw();
}
let reprepT = 0;
function reprep() {
  clearTimeout(reprepT);
  reprepT = setTimeout(() => { for (const m of media.imgs) m.prep = prepareImage(m.img, colorVals()); redraw(); }, 60);
}
function renderThumbs() {
  const box = $('#thumbs');
  box.innerHTML = '';
  media.imgs.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<img alt=""><span class="n">${i + 1}</span><button class="x" aria-label="빼기">✕</button><div class="mv"><button aria-label="앞으로">◀</button><button aria-label="뒤로">▶</button></div>`;
    d.querySelector('img').src = m.url;
    d.querySelector('.x').onclick = () => { media.imgs.splice(i, 1); if (m.url.startsWith('blob:')) URL.revokeObjectURL(m.url); imagesChanged(); };
    const [l, r] = d.querySelectorAll('.mv button');
    l.disabled = i === 0; r.disabled = i === media.imgs.length - 1;
    l.onclick = () => { media.imgs.splice(i - 1, 0, media.imgs.splice(i, 1)[0]); imagesChanged(); };
    r.onclick = () => { media.imgs.splice(i + 1, 0, media.imgs.splice(i, 1)[0]); imagesChanged(); };
    box.appendChild(d);
  });
  $('#empty').hidden = media.imgs.length > 0;
}

// ───────── 음악 ─────────
async function loadAudioFile(f) {
  const c = audioCtx();
  $('#audio-name').textContent = '불러오는 중…';
  try {
    const ab = await f.arrayBuffer();
    const buf = await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
    if (player.playing) pause();
    media.audio = buf; media.audioName = f.name;
    S.sound.start = 0; S.sound.end = null;
    player.pos = 0;
    computePeaks();
    audioChanged();
    toast(`음악을 넣었어요 · ${fmt(buf.duration)}`);
  } catch {
    toast('이 파일은 소리를 읽을 수 없어요. mp3, m4a, wav 파일을 넣어주세요.');
    audioChanged();
  }
}
function audioChanged() {
  $('#audio-name').textContent = media.audio ? `♪ ${media.audioName}` : '음악 파일을 여기로 끌어다 놓기';
  $('#audio-drop').classList.toggle('has', !!media.audio);
  $('#trim-box').hidden = !media.audio;
  updateTrimUI();
  redraw();
}
function computePeaks() {
  const b = media.audio, N = 600, L = b.getChannelData(0), step = Math.floor(L.length / N) || 1;
  const p = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let j = i * step, e = Math.min(L.length, j + step); j < e; j += 8) m = Math.max(m, Math.abs(L[j]));
    p[i] = m;
  }
  media.peaks = p;
}
function drawWave() {
  const cv = $('#wave');
  if (!media.audio || !media.peaks || cv.offsetParent === null) return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const d = media.audio.duration, s = S.sound.start / d, e = (S.sound.end ?? d) / d;
  const N = media.peaks.length;
  for (let i = 0; i < N; i++) {
    const f = i / N, a = media.peaks[i] * h * 0.9;
    x.fillStyle = f >= s && f <= e ? '#5f7a8c' : '#c0d1dc';
    x.fillRect((i / N) * w, h / 2 - a / 2, Math.max(1, w / N - 0.3), Math.max(1, a));
  }
  x.fillStyle = 'rgba(192,209,220,.35)';
  x.fillRect(0, 0, s * w, h); x.fillRect(e * w, 0, w - e * w, h);
  const ph = (S.sound.start + position() * S.sound.speed) / d;
  x.fillStyle = '#34495a'; x.fillRect(ph * w - 1, 0, 2, h);
}
function updateTrimUI() {
  const b = media.audio;
  if (!b) return;
  const d = b.duration, st = $('#trim-start'), en = $('#trim-end');
  st.max = en.max = d.toFixed(2);
  st.value = S.sound.start; en.value = S.sound.end ?? d;
  $('#start-out').textContent = fmt(S.sound.start);
  $('#end-out').textContent = fmt(S.sound.end ?? d);
  $('#trim-info').textContent = `영상 길이 ${fmt(totalDur())}${S.sound.speed !== 1 ? ` (속도 ${S.sound.speed}× 반영)` : ''}`;
}

// ───────── 미리보기 ─────────
const pv = $('#pv');
const pvx = pv.getContext('2d', { alpha: false });

function outSize() {
  const res = +S.out.res;
  let ar;
  if (S.out.ratio === 'photo') {
    const m = media.imgs[0];
    ar = m ? m.prep.w / m.prep.h : 9 / 16;
    ar = clamp(ar, 9 / 21, 21 / 9);
  } else {
    const [a, b] = S.out.ratio.split(':').map(Number);
    ar = a / b;
  }
  let W, H;
  if (ar < 1) { W = res; H = res / ar; } else { H = res; W = res * ar; }
  const ev = (v) => Math.max(2, Math.round(v / 2) * 2);
  return { W: ev(W), H: ev(H) };
}
function sizeCanvas() {
  const { W, H } = outSize();
  const maxW = Math.min(440, $('.preview').clientWidth - 24);
  const maxH = Math.min(innerHeight * (innerWidth <= 860 ? 0.62 : 0.66), 640);
  const sc = Math.min(maxW / W, maxH / H);
  const dw = Math.round(W * sc), dh = Math.round(H * sc);
  pv.style.width = dw + 'px'; pv.style.height = dh + 'px';
  const q = Math.min(Math.min(2, devicePixelRatio || 1), 720 / Math.min(dw, dh));
  pv.width = Math.round(dw * q); pv.height = Math.round(dh * q);
  $('#hero-s').textContent = `${W}×${H} · ${S.out.fps}fps`;
  redraw();
}
function scene(dur) {
  return {
    imgs: media.imgs.map((m) => m.prep),
    dur,
    photo: S.photo,
    color: S.color,
    motion: S.motion,
    overlay: S.overlay,
    stamp: S.stamp,
    text: S.text,
    vfadeIn: S.out.vfadeIn,
    vfadeOut: S.out.vfadeOut,
  };
}
const quietAu = { level: () => 0, wave: () => new Float32Array(256), bands: () => new Float32Array(BANDS).fill(0.05) };
let dirty = true;
const redraw = () => { dirty = true; };

function frame() {
  const dur = totalDur();
  if (player.playing) {
    const p = position();
    if (p >= dur) { player.pos = dur; pause(); player.pos = 0; }
    dirty = true;
  }
  if (dirty) {
    dirty = false;
    const t = clamp(position(), 0, Math.max(0, dur - 1e-3));
    const au = player.playing && player.nodes ? live : quietAu;
    drawFrame(pvx, pv.width, pv.height, t, { ...scene(dur), noFade: !player.playing }, au);
    $('#seek').max = dur.toFixed(2);
    if (document.activeElement !== $('#seek')) $('#seek').value = t;
    $('#time').textContent = `${fmt(t)} / ${fmt(dur)}`;
    drawWave();
  }
  requestAnimationFrame(frame);
}

// 미리보기를 드래그해서 위치 옮기기, 휠로 확대
(() => {
  const shot = $('#shot');
  let drag = null;
  shot.addEventListener('pointerdown', (e) => {
    if (!media.imgs.length || e.target.closest('.empty')) return;
    drag = { x: e.clientX, y: e.clientY, px: S.photo.x, py: S.photo.y };
    shot.setPointerCapture(e.pointerId);
  });
  shot.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = pv.getBoundingClientRect();
    S.photo.x = clamp(drag.px - ((e.clientX - drag.x) / r.width) * 2.2, -1, 1);
    S.photo.y = clamp(drag.py - ((e.clientY - drag.y) / r.height) * 2.2, -1, 1);
    syncInputs('photo.'); redraw();
  });
  const end = () => { if (drag) { drag = null; save(); } };
  shot.addEventListener('pointerup', end);
  shot.addEventListener('pointercancel', end);
  shot.addEventListener('wheel', (e) => {
    if (!media.imgs.length) return;
    e.preventDefault();
    S.photo.zoom = clamp(S.photo.zoom * Math.exp(-e.deltaY * 0.0015), 1, 2.5);
    syncInputs('photo.'); redraw(); save();
  }, { passive: false });
})();

// ───────── 입력 연결 ─────────
function syncInputs(prefix = '') {
  for (const el of $$('[data-k]')) {
    const k = el.dataset.k;
    if (!k.startsWith(prefix)) continue;
    const v = getK(k);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el || el.type === 'range') el.value = v ?? '';
  }
  for (const o of $$('[data-out]')) {
    const v = getK(o.dataset.out);
    o.textContent = o.hasAttribute('data-pct') ? Math.round(v * 100) : String(Math.round(v * 100) / 100);
  }
  syncChips();
}
function syncChips() {
  $$('#ratio-seg button').forEach((b) => b.classList.toggle('on', b.dataset.ratio === S.out.ratio));
  $$('#fit-chips button').forEach((b) => b.classList.toggle('on', b.dataset.fit === S.photo.fit));
  $$('#trans-chips button').forEach((b) => b.classList.toggle('on', b.dataset.trans === S.photo.transition));
  $$('#speed-chips button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === S.sound.speed));
  $$('[data-show=contain]').forEach((e) => (e.hidden = S.photo.fit !== 'contain'));
  $$('[data-show=bgcolor]').forEach((e) => (e.hidden = S.photo.bg !== 'color'));
  $$('#color-presets button').forEach((b) => b.classList.toggle('on', b.dataset.p === S.color.preset));
  renderSummary();
}

for (const el of $$('[data-k]')) {
  const ev = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
  el.addEventListener(ev, () => {
    const k = el.dataset.k;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'range' || ['out.res', 'out.fps'].includes(k)) v = parseFloat(el.value);
    else v = el.value;
    setK(k, v);
    if (el.hasAttribute('data-color')) { S.color.preset = 'custom'; reprep(); }
    if (el.hasAttribute('data-snd')) soundChanged();
    if (k === 'out.ratio' || k === 'out.res' || k === 'out.fps') sizeCanvas();
    if (k === 'out.silentDur' && !media.audio) player.pos = Math.min(player.pos, totalDur());
    if (k === 'text.font') document.fonts.load(`700 40px ${S.text.font}`).then(redraw);
    syncInputs();
    redraw();
    save();
  });
}

// 탭
function setTab(t) {
  S.tab = t;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('.panel [data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== t));
  $('#hero-t').textContent = { photo: 'Photo', look: 'Effects', music: 'Music', sound: 'Sound', out: 'Export' }[t];
  if (t === 'look') presetThumbs();
  redraw();
  save();
}
$$('.tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

$$('#ratio-seg button').forEach((b) => (b.onclick = () => { S.out.ratio = b.dataset.ratio; syncInputs(); sizeCanvas(); save(); }));
$$('#fit-chips button').forEach((b) => (b.onclick = () => { S.photo.fit = b.dataset.fit; syncInputs(); redraw(); save(); }));
$$('#trans-chips button').forEach((b) => (b.onclick = () => { S.photo.transition = b.dataset.trans; syncInputs(); redraw(); save(); }));
$$('#speed-chips button').forEach((b) => (b.onclick = () => { S.sound.speed = +b.dataset.speed; syncInputs(); soundChanged(); redraw(); save(); }));

// ───────── 필터 프리셋 ─────────
let thumbSrc = null;
function presetThumbs() {
  const box = $('#color-presets');
  if (!box.children.length) {
    for (const p of COLOR_PRESETS) {
      const b = document.createElement('button');
      b.dataset.p = p.id;
      b.innerHTML = `<span class="ph"></span>${p.name}`;
      b.onclick = () => {
        for (const k of COLOR_KEYS) S.color[k] = p.v[k] || 0;
        S.color.preset = p.id;
        syncInputs(); reprep(); save();
      };
      box.appendChild(b);
    }
  }
  const first = media.imgs[0];
  if (!first) { thumbSrc = null; $$('canvas', box).forEach((c) => c.replaceWith(Object.assign(document.createElement('span'), { className: 'ph' }))); return; }
  if (thumbSrc === first.id || $('[data-pane=look]').hidden) return;
  thumbSrc = first.id;
  const sm = document.createElement('canvas');
  const iw = first.img.naturalWidth, ih = first.img.naturalHeight, s = 120 / Math.min(iw, ih);
  sm.width = 120; sm.height = 120;
  sm.getContext('2d').drawImage(first.img, (120 - iw * s) / 2, (120 - ih * s) / 2, iw * s, ih * s);
  $$('button', box).forEach((b) => {
    const p = COLOR_PRESETS.find((x) => x.id === b.dataset.p);
    const v = {}; for (const k of COLOR_KEYS) v[k] = p.v[k] || 0;
    const pr = prepareImage(sm, v);
    const c = document.createElement('canvas'); c.width = c.height = 120;
    const x = c.getContext('2d'); x.drawImage(pr.canvas, 0, 0);
    if (v.glow) { x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.65 * v.glow; x.drawImage(pr.small, 0, 0, 120, 120); }
    b.querySelector('canvas, .ph').replaceWith(c);
  });
}

// ───────── 효과 칩 ─────────
function fxPicker({ grid, on, defs, get, toggle, setK: setVal, order }) {
  const g = $(grid), o = $(on);
  g.innerHTML = '';
  for (const d of defs) {
    const b = document.createElement('button');
    b.textContent = d.name; b.title = d.desc; b.dataset.id = d.id;
    b.onclick = () => { toggle(d.id); render(); };
    g.appendChild(b);
  }
  function render() {
    $$('button', g).forEach((b) => b.classList.toggle('on', get(b.dataset.id) > 0));
    o.innerHTML = '';
    const ids = order ? order() : defs.filter((d) => get(d.id) > 0).map((d) => d.id);
    ids.forEach((id, i) => {
      const d = defs.find((x) => x.id === id);
      const row = document.createElement('div');
      row.className = 'fx-row';
      row.innerHTML = `<b>${order ? `<span class="ord">${i + 1}</span>` : ''}${d.name}<small>${d.desc}</small></b><button class="x" aria-label="끄기">✕</button><input type="range" min="0.05" max="1" step="0.01" aria-label="${d.name} 강도">`;
      const r = row.querySelector('input');
      r.value = get(id);
      r.oninput = () => setVal(id, parseFloat(r.value));
      row.querySelector('.x').onclick = () => { toggle(id); render(); };
      o.appendChild(row);
    });
    renderSummary();
  }
  render();
  return render;
}

const renderMotion = fxPicker({
  grid: '#motion-grid', on: '#motion-on', defs: MOTIONS,
  get: (id) => S.motion[id] || 0,
  toggle: (id) => { S.motion[id] ? delete S.motion[id] : (S.motion[id] = 0.6); redraw(); save(); },
  setK: (id, v) => { S.motion[id] = v; redraw(); save(); },
});
const renderOverlay = fxPicker({
  grid: '#overlay-grid', on: '#overlay-on', defs: OVERLAYS,
  get: (id) => S.overlay[id] || 0,
  toggle: (id) => { S.overlay[id] ? delete S.overlay[id] : (S.overlay[id] = 0.6); redraw(); save(); },
  setK: (id, v) => { S.overlay[id] = v; redraw(); save(); },
});
const renderSfx = fxPicker({
  grid: '#sfx-grid', on: '#sfx-on', defs: AUDIO_FX,
  get: (id) => (S.sound.fx.find((f) => f.id === id) || {}).k || 0,
  order: () => S.sound.fx.map((f) => f.id),
  toggle: (id) => {
    const i = S.sound.fx.findIndex((f) => f.id === id);
    if (i >= 0) S.sound.fx.splice(i, 1); else S.sound.fx.push({ id, k: 0.6 });
    soundChanged(); save();
  },
  setK: (id, v) => { const f = S.sound.fx.find((x) => x.id === id); if (f) f.k = v; soundChanged(); save(); },
});

$('#look-reset').onclick = () => {
  S.motion = {}; S.overlay = {}; S.stamp.on = false;
  for (const k of COLOR_KEYS) S.color[k] = 0;
  S.color.preset = 'none';
  renderMotion(); renderOverlay(); syncInputs(); reprep(); save();
};
$('#sound-reset').onclick = () => {
  S.sound.fx = []; S.sound.speed = 1; S.sound.bass = 0; S.sound.treble = 0;
  renderSfx(); syncInputs(); soundChanged(); save();
};
$('#slowed').onclick = () => {
  S.sound.speed = 0.85; S.sound.bass = Math.max(S.sound.bass, 2);
  const hall = S.sound.fx.find((f) => f.id === 'dreamy');
  if (hall) hall.k = 0.6; else S.sound.fx.push({ id: 'dreamy', k: 0.6 });
  renderSfx(); syncInputs(); soundChanged(); save();
  toast('속도 0.85× + 퍼지는 몽환 잔향을 켰어요');
};
$('#stamp-today').onclick = () => { S.stamp.text = todayStamp(); S.stamp.on = true; syncInputs(); redraw(); save(); };

function renderSummary() {
  const box = $('#summary');
  if (!box) return;
  const names = (defs, obj) => defs.filter((d) => obj[d.id] > 0).map((d) => d.name).join(', ') || '없음';
  const preset = COLOR_PRESETS.find((p) => p.id === S.color.preset);
  box.innerHTML = [
    `<b>사진</b> ${media.imgs.length}장 · 필터 ${preset ? preset.name : '직접 조절'}`,
    `<b>움직임</b> ${names(MOTIONS, S.motion)}`,
    `<b>효과</b> ${names(OVERLAYS, S.overlay)}${S.stamp.on ? ', 캠코더 날짜' : ''}`,
    `<b>음악</b> ${media.audio ? media.audioName : '없음'}`,
    `<b>음향</b> ${S.sound.fx.map((f) => AUDIO_FX_MAP[f.id]?.name).filter(Boolean).join(' → ') || '없음'}${S.sound.speed !== 1 ? ` · 속도 ${S.sound.speed}×` : ''}`,
    `<b>길이</b> ${fmt(totalDur())}`,
  ].map((l) => `<div>${l}</div>`).join('');
  const { W, H } = outSize();
  const info = $('#out-info');
  if (info) info.textContent = `${W}×${H}px · ${S.out.fps}fps · H.264 + AAC`;
}

// ───────── 파일 넣기 (선택 · 끌어다 놓기 · 붙여넣기) ─────────
function routeFiles(files) {
  const arr = [...files];
  const imgs = arr.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|bmp|heic)$/i.test(f.name));
  const auds = arr.filter((f) => f.type.startsWith('audio/') || f.type.startsWith('video/') || /\.(mp3|m4a|wav|ogg|flac|aac|opus|mp4|mov|webm)$/i.test(f.name));
  if (imgs.length) addImageFiles(imgs);
  if (auds.length) loadAudioFile(auds[0]);
  if (!imgs.length && !auds.length && arr.length) toast('사진이나 음악 파일만 넣을 수 있어요.');
}
$$('input[type=file][data-pick]').forEach((inp) => inp.addEventListener('change', () => { routeFiles(inp.files); inp.value = ''; }));
for (const id of ['#img-drop', '#audio-drop']) {
  const d = $(id), inp = $('input', d);
  d.addEventListener('click', (e) => { if (e.target !== inp) inp.click(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
}
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#drop-cover').hidden = false; });
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-cover').hidden = true; });
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('#drop-cover').hidden = true;
  routeFiles(e.dataTransfer.files);
});
addEventListener('paste', (e) => {
  const cd = e.clipboardData;
  if (!cd) return;
  const files = [...cd.files];
  if (!files.length) for (const it of cd.items || []) if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
  if (files.length) { e.preventDefault(); routeFiles(files); return; }
  const tgt = e.target;
  if (tgt.closest && tgt.closest('input, textarea')) return;
  const text = (cd.getData('text') || '').trim();
  if (/^https?:\/\/\S+$/i.test(text)) addImageURL(text).catch(() => toast('그 주소의 이미지는 가져올 수 없어요. 이미지를 복사해서 붙여넣어 보세요.'));
});

$('#img-clear').onclick = () => { media.imgs.forEach((m) => m.url.startsWith('blob:') && URL.revokeObjectURL(m.url)); media.imgs = []; imagesChanged(); };
$('#audio-clear').onclick = () => { if (player.playing) pause(); media.audio = null; media.audioName = ''; player.pos = 0; audioChanged(); };

// 링크 모달
const openModal = (id) => ($(id).hidden = false);
$$('[data-close-modal]').forEach((b) => b.addEventListener('click', () => { const m = b.closest('.modal'); if (m.id !== 'exp-modal' || !exporting) m.hidden = true; }));
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m && !(m.id === 'exp-modal' && exporting)) m.hidden = true; }));
$('#img-link').onclick = () => { $('#link-err').hidden = true; $('#link-url').value = ''; openModal('#link-modal'); setTimeout(() => $('#link-url').focus(), 50); };
$('#link-go').onclick = async () => {
  const u = $('#link-url').value.trim();
  if (!u) return;
  $('#link-go').disabled = true;
  try { await addImageURL(u); $('#link-modal').hidden = true; }
  catch { const e = $('#link-err'); e.textContent = '이 주소의 이미지는 가져올 수 없어요 (사이트가 막아두었거나 이미지 주소가 아니에요).'; e.hidden = false; }
  $('#link-go').disabled = false;
};
$('#qa-btn').onclick = () => openModal('#qa-modal');

// 구간 자르기
$('#trim-start').addEventListener('input', (e) => {
  const d = media.audio.duration, end = S.sound.end ?? d;
  S.sound.start = clamp(+e.target.value, 0, end - 0.5);
  player.pos = 0; soundChanged(); redraw();
});
$('#trim-end').addEventListener('input', (e) => {
  const d = media.audio.duration;
  const v = clamp(+e.target.value, S.sound.start + 0.5, d);
  S.sound.end = v >= d - 0.01 ? null : v;
  player.pos = Math.min(player.pos, totalDur()); soundChanged(); redraw();
});
$$('[data-len]').forEach((b) => (b.onclick = () => {
  if (!media.audio) return;
  const len = +b.dataset.len, d = media.audio.duration;
  S.sound.end = len ? Math.min(d, S.sound.start + len * S.sound.speed) : null;
  if (!len) S.sound.start = 0;
  player.pos = 0; soundChanged(); redraw();
}));
$('#start-here').onclick = () => {
  if (!media.audio) return;
  const src = S.sound.start + position() * S.sound.speed;
  const len = (S.sound.end ?? media.audio.duration) - S.sound.start;
  S.sound.start = clamp(src, 0, media.audio.duration - 1);
  if (S.sound.end != null) S.sound.end = Math.min(media.audio.duration, S.sound.start + len);
  if (S.sound.end != null && S.sound.end >= media.audio.duration - 0.01) S.sound.end = null;
  seek(0); soundChanged();
};

// 재생
$('#play').onclick = () => (player.playing ? pause() : play());
$('#seek').addEventListener('input', (e) => seek(+e.target.value));
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest('input, textarea, select, button')) return;
  e.preventDefault(); player.playing ? pause() : play();
});
let rsT = 0;
addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(sizeCanvas, 100); });

// ───────── 내보내기 ─────────
let exporting = null;
async function doExport() {
  if (!media.imgs.length) { toast('먼저 사진을 넣어주세요.'); setTab('photo'); return; }
  if (player.playing) pause();
  const ctrl = new AbortController();
  exporting = ctrl;
  const bar = $('#exp-bar'), label = $('#exp-label');
  $('#exp-title').textContent = '영상 만드는 중';
  $('#exp-run').hidden = false; $('#exp-done').hidden = true;
  bar.style.width = '0%'; label.textContent = '준비 중…';
  openModal('#exp-modal');
  const prog = (p, l) => { bar.style.width = `${Math.round(p * 100)}%`; if (l) label.textContent = l; };
  try {
    await Promise.all([document.fonts.load(`700 40px ${S.text.font}`), document.fonts.load('700 40px "VT323"')]).catch(() => {});
    const fps = +S.out.fps;
    const { W, H } = outSize();
    let audio = null, au = quietAu, dur = S.out.silentDur;
    if (media.audio) {
      prog(0, '음향 효과 입히는 중…');
      audio = await renderAudio(media.audio, S.sound, 48000);
      if (ctrl.signal.aborted) throw new DOMException('취소됨', 'AbortError');
      prog(0, '음악 분석 중…');
      await new Promise((r) => setTimeout(r, 20));
      au = analyze(audio, fps);
      dur = audio.duration;
    }
    const sc = scene(dur);
    const res = await exportVideo({
      W, H, fps, dur, audio, signal: ctrl.signal,
      draw: (x, w, h, t) => drawFrame(x, w, h, t, sc, au),
      onProgress: prog,
    });
    const url = URL.createObjectURL(res.blob);
    const name = `${(S.out.name || 'seol-mp4').replace(/[\\/:*?"<>|]+/g, '_')}.${res.ext}`;
    const v = $('#exp-video');
    if (v.src) URL.revokeObjectURL(v.src);
    v.src = url;
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, v.duration / 2); };
    const a = $('#exp-dl'); a.href = url; a.download = name;
    a.textContent = `다운로드 (${(res.blob.size / 1048576).toFixed(1)}MB)`;
    $('#exp-note').textContent = res.note || `${W}×${H} · ${fps}fps · ${fmt(dur)}`;
    const file = new File([res.blob], name, { type: res.mime });
    const sh = $('#exp-share');
    sh.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    sh.onclick = () => navigator.share({ files: [file] }).catch(() => {});
    $('#exp-title').textContent = '완성!';
    $('#exp-run').hidden = true; $('#exp-done').hidden = false;
  } catch (err) {
    $('#exp-modal').hidden = true;
    if (err && err.name === 'AbortError') toast('저장을 취소했어요.');
    else { console.error(err); toast(`영상을 만들지 못했어요: ${err && err.message ? err.message : err}`, 5000); }
  } finally {
    exporting = null;
  }
}
$('#export-btn').onclick = doExport;
$('#export-btn2').onclick = doExport;
$('#exp-cancel').onclick = () => exporting && exporting.abort();

// ───────── 시작 ─────────
$('#support').textContent = canWebCodecs()
  ? '이 브라우저는 빠른 MP4 인코딩을 지원해요. 곡 길이보다 빠르게 만들어져요.'
  : '이 브라우저는 빠른 인코딩을 지원하지 않아 곡 길이만큼 실시간으로 녹화해요. 크롬·엣지·사파리 최신 버전을 추천해요.';
syncInputs();
setTab(S.tab);
audioChanged();
renderThumbs();
sizeCanvas();
document.fonts.ready.then(redraw);
requestAnimationFrame(frame);
