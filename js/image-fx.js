// 사진 필터 · 움직임 · 효과. 미리보기와 내보내기가 같은 draw()를 씁니다.

// ── 색 필터 프리셋 ──
export const COLOR_PRESETS = [
  { id: 'none', name: '원본', v: {} },
  { id: 'mono', name: '흑백', v: { sat: -1, contrast: 0.12 } },
  { id: 'sepia', name: '세피아', v: { sepia: 1, contrast: 0.05, fade: 0.08 } },
  { id: 'vintage', name: '빈티지', v: { fade: 0.25, warm: 0.3, sat: -0.2, contrast: -0.08 } },
  { id: 'film', name: '필름', v: { fade: 0.12, contrast: 0.12, sat: -0.1, warm: 0.12 } },
  { id: 'faded', name: '바랜 사진', v: { fade: 0.38, sat: -0.45, warm: 0.2, bright: 0.04 } },
  { id: 'cool', name: '차갑게', v: { warm: -0.45, sat: -0.08 } },
  { id: 'warm', name: '따뜻하게', v: { warm: 0.45, sat: 0.06 } },
  { id: 'vivid', name: '선명하게', v: { contrast: 0.25, sat: 0.35 } },
  { id: 'dream', name: '몽환', v: { fade: 0.15, bright: 0.07, sat: -0.12, glow: 0.55 } },
  { id: 'dawn', name: '새벽 블루', v: { warm: -0.6, fade: 0.2, bright: -0.04, sat: -0.15 } },
  { id: 'sunset', name: '노을', v: { warm: 0.65, sat: 0.2, contrast: 0.06, glow: 0.2 } },
  { id: 'night', name: '밤', v: { bright: -0.18, contrast: 0.15, warm: -0.3, sat: -0.25 } },
  { id: 'pink', name: '핑크빛', v: { tint: 0.5, fade: 0.1, bright: 0.04, glow: 0.2 } },
];
export const COLOR_KEYS = ['bright', 'contrast', 'sat', 'warm', 'fade', 'sepia', 'tint', 'glow'];

// ── 움직임 ──
export const MOTIONS = [
  { id: 'zoomin', name: '천천히 줌인', desc: '사진마다 조금씩 다가감' },
  { id: 'zoomout', name: '천천히 줌아웃', desc: '가까이에서 조금씩 멀어짐' },
  { id: 'pan', name: '좌우 이동', desc: '천천히 옆으로 흐름' },
  { id: 'sway', name: '둥실둥실', desc: '물에 뜬 것처럼 흔들흔들' },
  { id: 'shake', name: '손떨림', desc: '손으로 찍은 듯한 흔들림' },
  { id: 'pulse', name: '비트 펄스', desc: '음악 소리 크기에 맞춰 쿵쿵' },
  { id: 'spin', name: '기울기', desc: '천천히 기울었다 돌아옴' },
];

// ── 덧씌우는 효과 ──
export const OVERLAYS = [
  { id: 'grain', name: '필름 노이즈', desc: '자글자글 움직이는 입자' },
  { id: 'dust', name: '먼지 · 스크래치', desc: '오래된 필름의 먼지와 긁힘' },
  { id: 'vhs', name: 'VHS 비디오', desc: '색 번짐, 주사선, 화면 떨림' },
  { id: 'rgb', name: 'RGB 분리', desc: '빨강·파랑이 어긋남' },
  { id: 'glitch', name: '글리치', desc: '가끔 화면이 찢어지듯 밀림' },
  { id: 'scan', name: '주사선', desc: '옛날 모니터 가로줄' },
  { id: 'flicker', name: '깜빡임', desc: '영사기처럼 밝기가 떨림' },
  { id: 'leak', name: '빛 번짐', desc: '따뜻한 빛이 새어 들어옴' },
  { id: 'bokeh', name: '빛망울', desc: '흐릿한 동그란 빛이 떠다님' },
  { id: 'vignette', name: '비네팅', desc: '가장자리를 어둡게' },
  { id: 'snow', name: '눈 내림', desc: '하얀 눈송이' },
  { id: 'rain', name: '비 내림', desc: '비스듬히 떨어지는 빗줄기' },
  { id: 'sparkle', name: '반짝이', desc: '반짝반짝 별빛' },
  { id: 'hearts', name: '하트', desc: '하트가 둥실 떠오름' },
  { id: 'petals', name: '꽃잎', desc: '분홍 꽃잎이 흩날림' },
  { id: 'wave', name: '음파 라인', desc: '음악에 맞춰 움직이는 파형' },
  { id: 'bars', name: '이퀄라이저', desc: '음악에 맞춰 튀는 막대' },
  { id: 'letterbox', name: '시네마 바', desc: '위아래 검은 띠' },
];

// ── 결정적 난수 ──
function hash(a, b = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

// ── 사진 준비: 색 보정은 무거우니 한 번만 ──
export function prepareImage(src, color) {
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
  const s = Math.min(1, 2160 / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
  const c = mkCanvas(w, h);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, w, h);
  const v = color;
  const needs = COLOR_KEYS.some((k) => k !== 'glow' && v[k]);
  if (needs) {
    const im = x.getImageData(0, 0, w, h), d = im.data;
    const br = v.bright || 0, ct = 1 + (v.contrast || 0), sa = 1 + (v.sat || 0), wa = v.warm || 0, fa = v.fade || 0, se = v.sepia || 0, ti = v.tint || 0;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      r += br; g += br; b += br;
      r = (r - 0.5) * ct + 0.5; g = (g - 0.5) * ct + 0.5; b = (b - 0.5) * ct + 0.5;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sa; g = l + (g - l) * sa; b = l + (b - l) * sa;
      if (se) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r += (sr - r) * se; g += (sg - g) * se; b += (sb - b) * se;
      }
      r += 0.12 * wa; b -= 0.12 * wa; g += 0.02 * wa;
      if (ti) { r += 0.08 * ti; b += 0.05 * ti; g -= 0.03 * ti; }
      if (fa) { r = r * (1 - 0.35 * fa) + 0.28 * fa; g = g * (1 - 0.35 * fa) + 0.26 * fa; b = b * (1 - 0.35 * fa) + 0.27 * fa; }
      d[i] = clamp(r, 0, 1) * 255; d[i + 1] = clamp(g, 0, 1) * 255; d[i + 2] = clamp(b, 0, 1) * 255;
    }
    x.putImageData(im, 0, 0);
  }
  // 흐린 작은 사본: 빛 번짐(glow)과 블러 배경에 사용
  const t1 = mkCanvas(w / 12, h / 12);
  t1.getContext('2d').drawImage(c, 0, 0, t1.width, t1.height);
  const small = mkCanvas(w / 6, h / 6);
  const sx = small.getContext('2d'); sx.imageSmoothingQuality = 'high';
  sx.drawImage(t1, 0, 0, small.width, small.height);
  return { canvas: c, small, w, h };
}

// ── 잡음 타일 ──
let grainTiles = null;
function getGrain() {
  if (grainTiles) return grainTiles;
  grainTiles = [];
  for (let n = 0; n < 6; n++) {
    const c = mkCanvas(160, 160), x = c.getContext('2d');
    const im = x.createImageData(160, 160);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = hash(i, n * 977) * 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    grainTiles.push(c);
  }
  return grainTiles;
}

const scratch = new Map();
function scratchCanvas(key, w, h) {
  let c = scratch.get(key);
  if (!c || c.width !== w || c.height !== h) { c = mkCanvas(w, h); scratch.set(key, c); }
  return c;
}

function heart(x, cx, cy, s) {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.45, cy - s * 0.95, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.45, cy - s * 0.95, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35);
  x.fill();
}
function star(x, cx, cy, s) {
  x.beginPath();
  x.moveTo(cx, cy - s); x.quadraticCurveTo(cx, cy, cx + s, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + s); x.quadraticCurveTo(cx, cy, cx - s, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - s); x.fill();
}

/**
 * 한 프레임 그리기
 * @param x CanvasRenderingContext2D
 * @param t 초
 * @param sc 장면 { imgs, dur, photo, motion, overlay, stamp, text, vfadeIn, vfadeOut }
 * @param au 오디오 정보 { level(t), wave(t) -> Float32Array|null, bands(t) -> Float32Array|null }
 */
export function drawFrame(x, W, H, t, sc, au) {
  const u = Math.min(W, H) / 1080;
  const frame = Math.floor(t * 30);
  x.save();
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.fillStyle = sc.photo.bg === 'color' ? sc.photo.bgColor : '#000';
  x.fillRect(0, 0, W, H);

  const n = sc.imgs.length;
  if (n) {
    const seg = sc.dur / n;
    const i = clamp(Math.floor(t / seg), 0, n - 1);
    const local = t - i * seg;
    const xf = sc.photo.transition === 'cut' ? 0 : Math.min(sc.photo.xfade, seg * 0.45);
    drawPhoto(x, W, H, t, sc, au, sc.imgs[i], i, clamp(local / seg, 0, 1), 1);
    if (xf > 0 && i < n - 1 && local > seg - xf) {
      const a = (local - (seg - xf)) / xf;
      drawPhoto(x, W, H, t, sc, au, sc.imgs[i + 1], i + 1, 0, a);
    }
  }

  const o = Object.fromEntries(OVERLAYS.map((d) => [d.id, +sc.overlay[d.id] || 0]));
  if (o.leak) {
    x.globalCompositeOperation = 'screen';
    for (let k = 0; k < 2; k++) {
      const cx = W * (0.5 + 0.6 * Math.sin(t * 0.23 + k * 2.4)), cy = H * (0.3 + 0.5 * Math.sin(t * 0.17 + k * 1.3));
      const r = Math.max(W, H) * (0.55 + 0.15 * Math.sin(t * 0.4 + k));
      const a = o.leak * (0.32 + 0.16 * Math.sin(t * 1.1 + k * 3));
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, k ? `rgba(255,90,120,${a})` : `rgba(255,170,70,${a})`);
      gr.addColorStop(1, 'rgba(255,120,60,0)');
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
    }
    x.globalCompositeOperation = 'source-over';
  }

  if (o.bokeh) {
    x.globalCompositeOperation = 'screen';
    const N = Math.round(6 + 16 * o.bokeh);
    for (let k = 0; k < N; k++) {
      const r = (40 + 90 * hash(k, 5)) * u;
      const cx = ((hash(k, 1) * W + t * (10 + 25 * hash(k, 2)) * u) % (W + 2 * r)) - r;
      const cy = H * hash(k, 3) + Math.sin(t * 0.5 + k) * 30 * u;
      const a = 0.18 * o.bokeh * (0.6 + 0.4 * Math.sin(t * (0.6 + hash(k, 4)) + k));
      const gr = x.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
      const hue = [`255,220,170`, `255,190,210`, `200,220,255`][k % 3];
      gr.addColorStop(0, `rgba(${hue},${a})`); gr.addColorStop(0.85, `rgba(${hue},${a * 0.8})`); gr.addColorStop(1, `rgba(${hue},0)`);
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }

  if (o.rgb || o.vhs) {
    const off = Math.round((o.rgb * 9 + o.vhs * 5) * u * (1 + 0.5 * Math.sin(t * 7) * (o.vhs ? 1 : 0.2)) + 1);
    const c0 = scratchCanvas('c0', W, H), cR = scratchCanvas('cR', W, H), cB = scratchCanvas('cB', W, H);
    const x0 = c0.getContext('2d'); x0.globalCompositeOperation = 'copy'; x0.drawImage(x.canvas, 0, 0);
    for (const [cc, col] of [[cR, '#f00'], [cB, '#0ff']]) {
      const cx = cc.getContext('2d');
      cx.globalCompositeOperation = 'copy'; cx.drawImage(c0, 0, 0);
      cx.globalCompositeOperation = 'multiply'; cx.fillStyle = col; cx.fillRect(0, 0, W, H);
      cx.globalCompositeOperation = 'source-over';
    }
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    x.drawImage(cR, off, 0); x.drawImage(cB, -off, 0);
    x.globalCompositeOperation = 'source-over';
  }

  if (o.vhs) {
    // 흐르는 잡음 띠 + 아래쪽 떨림
    const c0 = scratchCanvas('c0', W, H), x0 = c0.getContext('2d');
    x0.globalCompositeOperation = 'copy'; x0.drawImage(x.canvas, 0, 0); x0.globalCompositeOperation = 'source-over';
    const bandY = ((t * 0.12) % 1.3) * H - H * 0.15, bandH = 50 * u;
    for (let y = 0; y < bandH; y += 3 * u) {
      const dx = (hash(frame, y | 0) - 0.5) * 40 * u * o.vhs;
      x.drawImage(c0, 0, bandY + y, W, 3 * u, dx, bandY + y, W, 3 * u);
    }
    const bot = H * 0.95;
    x.drawImage(c0, 0, bot, W, H - bot, (hash(frame, 9) - 0.5) * 30 * u * o.vhs, bot, W, H - bot);
    x.globalAlpha = 0.18 * o.vhs; x.fillStyle = '#fff';
    for (let k = 0; k < 40; k++) x.fillRect(hash(frame, k) * W, bandY + hash(frame, k + 99) * bandH, 30 * u * hash(k, frame), 1.5 * u);
    x.globalAlpha = 1;
  }

  if (o.glitch) {
    const bucket = Math.floor(t * 8);
    if (hash(bucket, 77) < 0.1 + 0.35 * o.glitch) {
      const c0 = scratchCanvas('c0', W, H), x0 = c0.getContext('2d');
      x0.globalCompositeOperation = 'copy'; x0.drawImage(x.canvas, 0, 0); x0.globalCompositeOperation = 'source-over';
      const N = 3 + Math.floor(hash(frame, 3) * 6 * o.glitch);
      for (let k = 0; k < N; k++) {
        const y = hash(frame, k * 3) * H, h = (8 + hash(frame, k * 3 + 1) * 70) * u;
        const dx = (hash(frame, k * 3 + 2) - 0.5) * 140 * u * o.glitch;
        x.drawImage(c0, 0, y, W, h, dx, y, W, h);
      }
      if (hash(frame, 55) < 0.4 * o.glitch) {
        x.globalCompositeOperation = 'difference';
        x.fillStyle = ['#ff00aa', '#00ffee', '#ffee00'][frame % 3];
        x.fillRect(0, hash(frame, 56) * H, W, (10 + 40 * hash(frame, 57)) * u);
        x.globalCompositeOperation = 'source-over';
      }
    }
  }

  if (o.scan || o.vhs) {
    const a = 0.22 * Math.max(o.scan, o.vhs * 0.7);
    const gap = Math.max(2, Math.round(4 * u));
    x.fillStyle = `rgba(0,0,0,${a})`;
    const sh = Math.max(1, Math.round(gap / 2));
    for (let y = (frame % 2) * sh; y < H; y += gap) x.fillRect(0, y, W, sh);
  }

  if (o.grain) {
    const tiles = getGrain();
    const pat = x.createPattern(tiles[frame % tiles.length], 'repeat');
    const ps = Math.max(1, u * 1.6);
    pat.setTransform(new DOMMatrix([ps, 0, 0, ps, hash(frame, 1) * 160 * ps, hash(frame, 2) * 160 * ps]));
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = 0.55 * o.grain;
    x.fillStyle = pat; x.fillRect(0, 0, W, H);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }

  if (o.dust) {
    const nL = Math.floor(hash(frame, 11) * 3 * o.dust + 0.6);
    for (let k = 0; k < nL; k++) {
      const lx = hash(frame, 20 + k) * W;
      x.strokeStyle = hash(frame, 30 + k) < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(20,10,0,.45)';
      x.lineWidth = (0.8 + hash(frame, 40 + k) * 1.6) * u;
      x.beginPath(); x.moveTo(lx, 0); x.lineTo(lx + (hash(frame, 50 + k) - 0.5) * 20 * u, H); x.stroke();
    }
    const nD = Math.floor(14 * o.dust * hash(frame, 12) + 2);
    for (let k = 0; k < nD; k++) {
      x.fillStyle = hash(frame, 70 + k) < 0.6 ? 'rgba(15,10,5,.55)' : 'rgba(255,250,240,.5)';
      const r = (1 + hash(frame, 80 + k) * 4) * u;
      x.beginPath(); x.ellipse(hash(frame, 90 + k) * W, hash(frame, 100 + k) * H, r, r * (0.4 + hash(k, frame)), hash(frame, k) * 3, 0, 7); x.fill();
    }
    if (hash(frame, 13) < 0.08 * o.dust) {
      x.strokeStyle = 'rgba(20,10,0,.4)'; x.lineWidth = 1.2 * u; x.beginPath();
      const hx = hash(frame, 14) * W, hy = hash(frame, 15) * H;
      x.moveTo(hx, hy);
      for (let k = 0; k < 6; k++) x.lineTo(hx + (hash(frame, 200 + k) - 0.5) * 60 * u, hy + k * 8 * u);
      x.stroke();
    }
  }

  if (o.flicker) {
    const f = hash(frame, 21);
    x.fillStyle = `rgba(0,0,0,${0.16 * o.flicker * f})`; x.fillRect(0, 0, W, H);
    if (hash(frame, 22) < 0.07) { x.fillStyle = `rgba(255,250,235,${0.08 * o.flicker})`; x.fillRect(0, 0, W, H); }
  }

  if (o.snow) {
    const N = Math.round(40 + 220 * o.snow);
    x.fillStyle = 'rgba(255,255,255,.9)';
    for (let k = 0; k < N; k++) {
      const depth = 0.35 + hash(k, 2) * 0.65;
      const r = (1.5 + 4.5 * depth) * u;
      const sp = (40 + 90 * depth) * u;
      const y = ((hash(k, 3) * (H + 40 * u) + t * sp) % (H + 40 * u)) - 20 * u;
      const xx = hash(k, 4) * W + Math.sin(t * (0.6 + depth) + k) * 22 * u;
      x.globalAlpha = 0.45 + 0.5 * depth;
      x.beginPath(); x.arc(xx, y, r, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
  }

  if (o.rain) {
    const N = Math.round(60 + 260 * o.rain);
    x.strokeStyle = 'rgba(210,225,255,.42)';
    x.lineCap = 'round';
    for (let k = 0; k < N; k++) {
      const depth = 0.3 + hash(k, 6) * 0.7;
      const len = (30 + 60 * depth) * u, sp = (900 + 900 * depth) * u;
      const y = ((hash(k, 7) * (H + len) + t * sp) % (H + len)) - len;
      const xx = ((hash(k, 8) * (W + 200 * u) - y * 0.18) % (W + 200 * u));
      x.lineWidth = (0.8 + 1.4 * depth) * u;
      x.beginPath(); x.moveTo(xx, y); x.lineTo(xx - len * 0.18, y + len); x.stroke();
    }
  }

  if (o.sparkle) {
    const N = Math.round(8 + 36 * o.sparkle);
    for (let k = 0; k < N; k++) {
      const p = Math.pow(Math.max(0, Math.sin(t * (1 + 2 * hash(k, 9)) + k * 1.7)), 6);
      if (p < 0.02) continue;
      const s = (6 + 18 * hash(k, 10)) * u * p;
      x.fillStyle = `rgba(255,255,240,${0.9 * p})`;
      star(x, hash(k, 11) * W, hash(k, 12) * H, s);
      x.fillStyle = `rgba(255,255,255,${0.3 * p})`;
      x.beginPath(); x.arc(hash(k, 11) * W, hash(k, 12) * H, s * 0.5, 0, 7); x.fill();
    }
  }

  if (o.hearts) {
    const N = Math.round(5 + 20 * o.hearts);
    for (let k = 0; k < N; k++) {
      const s = (16 + 30 * hash(k, 13)) * u, sp = (50 + 70 * hash(k, 14)) * u;
      const y = H + 40 * u - ((hash(k, 15) * (H + 80 * u) + t * sp) % (H + 80 * u));
      const xx = hash(k, 16) * W + Math.sin(t * 1.2 + k) * 25 * u;
      x.globalAlpha = 0.85 * clamp(y / (H * 0.4), 0, 1);
      x.fillStyle = ['#ff5f8f', '#ff8fb1', '#ffc2d6', '#ff3d6e'][k % 4];
      heart(x, xx, y, s);
    }
    x.globalAlpha = 1;
  }

  if (o.petals) {
    const N = Math.round(8 + 40 * o.petals);
    for (let k = 0; k < N; k++) {
      const s = (8 + 10 * hash(k, 17)) * u, sp = (60 + 80 * hash(k, 18)) * u;
      const y = ((hash(k, 19) * (H + 60 * u) + t * sp) % (H + 60 * u)) - 30 * u;
      const xx = ((hash(k, 20) * W + t * 40 * u + Math.sin(t + k) * 40 * u) % (W + 40 * u)) - 20 * u;
      x.save(); x.translate(xx, y); x.rotate(t * (1 + hash(k, 21)) + k); x.scale(1, 0.55 + 0.45 * Math.sin(t * 2 + k));
      x.fillStyle = ['rgba(255,190,205,.9)', 'rgba(255,214,224,.9)', 'rgba(250,170,190,.9)'][k % 3];
      x.beginPath(); x.ellipse(0, 0, s, s * 0.6, 0, 0, 7); x.fill();
      x.restore();
    }
  }

  if (o.wave && au && au.wave) {
    const w = au.wave(t);
    if (w) {
      const cy = H * 0.82, amp = H * 0.08 * (0.4 + o.wave);
      x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3 * u; x.lineJoin = 'round';
      x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 8 * u;
      x.beginPath();
      const N = 180, step = w.length / N;
      for (let k = 0; k < N; k++) {
        const v = w[Math.floor(k * step)] || 0;
        const px = W * 0.08 + (W * 0.84 * k) / (N - 1);
        const py = cy + v * amp * Math.sin((Math.PI * k) / (N - 1));
        k ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke(); x.shadowBlur = 0;
    }
  }

  if (o.bars && au && au.bands) {
    const b = au.bands(t);
    if (b) {
      const N = b.length, bw = (W * 0.7) / N, base = H * 0.88;
      x.fillStyle = 'rgba(255,255,255,.88)';
      for (let k = 0; k < N; k++) {
        const h = Math.max(4 * u, b[k] * H * 0.16 * (0.5 + o.bars));
        x.fillRect(W * 0.15 + k * bw + bw * 0.18, base - h, bw * 0.64, h);
      }
    }
  }

  if (o.vignette) {
    const gr = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${0.85 * o.vignette})`);
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
  }

  if (o.letterbox) {
    const bh = H * 0.12 * o.letterbox;
    x.fillStyle = '#000'; x.fillRect(0, 0, W, bh); x.fillRect(0, H - bh, W, bh);
  }

  drawText(x, W, H, t, sc, u);

  if (sc.stamp.on) {
    const fs = 44 * u;
    x.font = `700 ${fs}px "VT323", "Courier New", monospace`;
    x.textAlign = 'right'; x.textBaseline = 'alphabetic';
    x.shadowColor = 'rgba(255,120,0,.8)'; x.shadowBlur = 10 * u;
    x.fillStyle = '#ffa33a';
    const by = H - 54 * u - (o.letterbox ? H * 0.12 * o.letterbox : 0);
    x.fillText(sc.stamp.text || '', W - 50 * u, by);
    x.shadowBlur = 0;
  }

  // 화면 페이드 (멈춘 미리보기에서는 생략)
  let fa = 0;
  if (!sc.noFade) {
    if (sc.vfadeIn > 0) fa = Math.max(fa, 1 - t / sc.vfadeIn);
    if (sc.vfadeOut > 0) fa = Math.max(fa, 1 - (sc.dur - t) / sc.vfadeOut);
  }
  if (fa > 0) { x.globalAlpha = clamp(fa, 0, 1); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
  x.restore();
}

function drawPhoto(x, W, H, t, sc, au, img, idx, p, alpha) {
  const ph = sc.photo, m = Object.fromEntries(MOTIONS.map((d) => [d.id, +sc.motion[d.id] || 0]));
  const u = Math.min(W, H) / 1080;
  x.save();
  x.globalAlpha = alpha;
  const contain = ph.fit === 'contain';
  if (contain && ph.bg === 'blur') {
    const s = Math.max(W / img.w, H / img.h) * 1.1;
    x.drawImage(img.small, W / 2 - (img.w * s) / 2, H / 2 - (img.h * s) / 2, img.w * s, img.h * s);
    x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 0, W, H);
  } else if (contain) {
    x.fillStyle = ph.bg === 'color' ? ph.bgColor : '#000'; x.fillRect(0, 0, W, H);
  }
  let s = (contain ? Math.min(W / img.w, H / img.h) : Math.max(W / img.w, H / img.h)) * (ph.zoom || 1);
  let dx = 0, dy = 0, rot = 0;
  const ov = Math.max(0, (img.w * s - W) / 2), oh = Math.max(0, (img.h * s - H) / 2);
  dx -= (ph.x || 0) * ov; dy -= (ph.y || 0) * oh;

  if (m.zoomin) s *= 1 + 0.18 * m.zoomin * p;
  if (m.zoomout) s *= 1 + 0.18 * m.zoomout * (1 - p);
  if (m.pan) { s *= 1 + 0.14 * m.pan; dx += (0.5 - p) * W * 0.12 * m.pan * (idx % 2 ? -1 : 1); }
  if (m.sway) { s *= 1 + 0.05 * m.sway; dy += Math.sin(t * 0.9) * 16 * u * m.sway; dx += Math.sin(t * 0.55) * 10 * u * m.sway; rot += Math.sin(t * 0.6) * 0.012 * m.sway; }
  if (m.shake) {
    s *= 1 + 0.04 * m.shake;
    dx += (Math.sin(t * 7.3) + Math.sin(t * 11.1) * 0.6 + Math.sin(t * 2.3)) * 5 * u * m.shake;
    dy += (Math.sin(t * 8.7) + Math.sin(t * 13.3) * 0.5 + Math.cos(t * 1.9)) * 5 * u * m.shake;
    rot += Math.sin(t * 3.1) * 0.004 * m.shake;
  }
  if (m.pulse && au && au.level) s *= 1 + 0.09 * m.pulse * au.level(t);
  if (m.spin) { rot += Math.sin(t * 0.25) * 0.07 * m.spin; s *= 1 + 0.14 * m.spin; }

  x.translate(W / 2 + dx, H / 2 + dy);
  if (rot) x.rotate(rot);
  x.scale(s, s);
  x.imageSmoothingQuality = 'high';
  x.drawImage(img.canvas, -img.w / 2, -img.h / 2, img.w, img.h);
  if (sc.color.glow) {
    x.globalCompositeOperation = 'screen';
    x.globalAlpha = alpha * 0.65 * sc.color.glow;
    x.drawImage(img.small, -img.w / 2, -img.h / 2, img.w, img.h);
  }
  x.restore();
}

function drawText(x, W, H, t, sc, u) {
  const tx = sc.text;
  if (!tx || !tx.content || !tx.content.trim()) return;
  const lines = tx.content.split('\n');
  const fs = tx.size * u;
  x.save();
  x.font = `${tx.weight || 700} ${fs}px ${tx.font}`;
  x.textAlign = tx.align || 'center';
  x.textBaseline = 'middle';
  const lh = fs * 1.35;
  const total = lh * lines.length;
  const lb = +sc.overlay.letterbox ? H * 0.12 * sc.overlay.letterbox : 0;
  let y0 = tx.pos === 'top' ? Math.max(lb, H * 0.1) + lh / 2 : tx.pos === 'center' ? H / 2 - total / 2 + lh / 2 : H - Math.max(lb, H * 0.12) - total + lh / 2;
  const xx = x.textAlign === 'left' ? W * 0.08 : x.textAlign === 'right' ? W * 0.92 : W / 2;
  let a = 1;
  if (tx.anim === 'fade') a = clamp(t / 1.2, 0, 1);
  if (tx.anim === 'type') {
    const chars = Math.floor(t * 12);
    let left = chars;
    lines.forEach((ln, i) => { const show = ln.slice(0, Math.max(0, left)); left -= ln.length; lines[i] = show; });
  }
  x.globalAlpha = a;
  if (tx.shadow) { x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 12 * u; x.shadowOffsetY = 2 * u; }
  x.fillStyle = tx.color;
  lines.forEach((ln, i) => x.fillText(ln, xx, y0 + i * lh, W * 0.9));
  x.restore();
}
