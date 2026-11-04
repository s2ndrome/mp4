// 음향 효과: 미리듣기(AudioContext)와 내보내기(OfflineAudioContext)가 같은 그래프를 씁니다.

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerpExp = (a, b, k) => a * Math.pow(b / a, k);

// ── 버퍼 만들기 (컨텍스트마다 캐시) ──
const cache = new WeakMap();
function cached(ctx, key, make) {
  let m = cache.get(ctx);
  if (!m) cache.set(ctx, (m = new Map()));
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

function impulse(ctx, seconds, decay, bright = 0.5, seed = 7) {
  return cached(ctx, `ir:${seconds}:${decay}:${bright}`, () => {
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * seconds));
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const r = rng(seed + ch * 101);
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const n = i / len;
        y += (r() * 2 - 1 - y) * bright;
        d[i] = y * Math.pow(1 - n, decay) * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
      }
    }
    return buf;
  });
}

function noiseBuffer(ctx, kind) {
  return cached(ctx, `noise:${kind}`, () => {
    const sr = ctx.sampleRate;
    const secs = kind === 'white' ? 3 : 7;
    const len = Math.floor(sr * secs);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const r = rng(kind.length * 31 + ch * 7 + 3);
      const d = buf.getChannelData(ch);
      if (kind === 'white') {
        for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
      } else if (kind === 'crackle') {
        // 바늘 잡음: 드문드문 '틱' + 가끔 큰 '팍'
        for (let i = 0; i < len; i++) {
          const p = r();
          if (p < 45 / sr) {
            const big = r() < 0.08;
            const amp = (big ? 0.9 : 0.25 + r() * 0.35) * (r() < 0.5 ? -1 : 1);
            const L = big ? 160 : 18 + Math.floor(r() * 50);
            for (let j = 0; j < L && i + j < len; j++) d[i + j] += amp * Math.exp(-j / (L * 0.25)) * (r() * 0.6 + 0.4);
          }
        }
        let lo = 0;
        for (let i = 0; i < len; i++) { lo += ((r() * 2 - 1) - lo) * 0.02; d[i] += lo * 0.05; }
      } else if (kind === 'rain') {
        // 빗소리: 부드러운 쏴아 + 톡톡 물방울
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
          const w = r() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.06;
          if (r() < 70 / sr) {
            const amp = 0.08 + r() * 0.25, f = 2000 + r() * 4000, L = 300 + Math.floor(r() * 500);
            for (let j = 0; j < L && i + j < len; j++) d[i + j] += amp * Math.sin((j * f * 2 * Math.PI) / sr) * Math.exp(-j / (L * 0.2));
          }
        }
      } else if (kind === 'crowd') {
        // 웅성거림: 여러 대역을 천천히 흔든 잡음
        let a = 0, b = 0, env = 0.5;
        for (let i = 0; i < len; i++) {
          const w = r() * 2 - 1;
          a += (w - a) * 0.08; b += (a - b) * 0.3;
          if (i % 2400 === 0) env = 0.4 + r() * 0.6;
          d[i] = (a - b * 0.6) * env * 0.9;
        }
      }
    }
    return buf;
  });
}

function curve(fn, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i * 2) / (n - 1) - 1);
  return c;
}
const distCurve = (k) => curve((x) => ((1 + k) * x) / (1 + k * Math.abs(x)));
const softCurve = (drive) => curve((x) => Math.tanh(x * drive) / Math.tanh(drive));
const crushCurve = (steps) => curve((x) => Math.round(x * steps) / steps, 4096);

// ── 노드 만들기 도우미 ──
class G {
  constructor(ctx) { this.ctx = ctx; this.sources = []; }
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  bq(type, f, q = 0.707, gain = 0) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain;
    return b;
  }
  delay(t, max = 2) { const d = this.ctx.createDelay(max); d.delayTime.value = t; return d; }
  conv(buf) { const c = this.ctx.createConvolver(); c.normalize = true; c.buffer = buf; return c; }
  shaper(c) { const s = this.ctx.createWaveShaper(); s.curve = c; s.oversample = '2x'; return s; }
  lfo(param, freq, depth, type = 'sine') {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.gain(depth); o.connect(g).connect(param); this.sources.push(o); return o;
  }
  noise(kind) {
    const s = this.ctx.createBufferSource(); s.buffer = noiseBuffer(this.ctx, kind); s.loop = true;
    this.sources.push(s); return s;
  }
  mono() { const g = this.ctx.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; return g; }
  // dry/wet: dry 쪽 볼륨과 wet 체인을 받아 합칩니다.
  mix(dry, wetIn, wetOut, wet) {
    const input = this.gain(1), output = this.gain(1);
    input.connect(this.gain(dry)).connect(output);
    input.connect(wetIn); wetOut.connect(this.gain(wet)).connect(output);
    return { input, output };
  }
}

// ── 효과 목록 ── k: 강도 0~1
export const AUDIO_FX = [
  {
    id: 'vinyl', name: 'LP 지지직', desc: '턴테이블 바늘 잡음, 살짝 늘어지는 소리',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      const wow = g.delay(0.012); g.lfo(wow.delayTime, 0.55, 0.0011 * k);
      input.connect(g.bq('highpass', 40 + 80 * k)).connect(g.bq('lowpass', lerpExp(18000, 6500, k))).connect(wow).connect(g.shaper(softCurve(1 + 1.5 * k))).connect(output);
      g.noise('crackle').connect(g.gain(0.6 * k)).connect(output);
      g.noise('white').connect(g.bq('bandpass', 5000, 0.5)).connect(g.gain(0.012 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'water', name: '물속에 잠긴', desc: '먹먹하게 잠긴 소리, 천천히 일렁임',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1 + 0.6 * k);
      const ch = g.delay(0.015); g.lfo(ch.delayTime, 0.3, 0.004 * k);
      input.connect(g.bq('lowpass', lerpExp(20000, 280, k), 1 + 2 * k)).connect(g.bq('lowshelf', 180, 0.7, 6 * k)).connect(ch).connect(output);
      const wet = g.conv(impulse(g.ctx, 1.6, 2.5, 0.15));
      ch.connect(wet).connect(g.gain(0.5 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'concert', name: '콘서트장', desc: '큰 공연장 울림과 관객 웅성거림',
    build(g, k) {
      const pre = g.delay(0.035), rv = g.conv(impulse(g.ctx, 3.4, 3, 0.45));
      pre.connect(g.bq('highpass', 220)).connect(rv);
      const m = g.mix(1 - 0.35 * k, pre, rv, 1.6 * k);
      const crowd = g.noise('crowd'); const cg = g.gain(0.05 * k);
      g.lfo(cg.gain, 0.13, 0.02 * k);
      crowd.connect(g.bq('bandpass', 700, 0.6)).connect(cg).connect(m.output);
      return m;
    },
  },
  {
    id: 'dreamy', name: '퍼지는 몽환', desc: '길게 퍼지는 잔향과 좌우로 번지는 메아리',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      input.connect(g.gain(1 - 0.45 * k)).connect(output);
      const rv = g.conv(impulse(g.ctx, 6, 2, 0.25));
      input.connect(rv).connect(g.gain(1.8 * k)).connect(output);
      const merger = g.ctx.createChannelMerger(2);
      const dl = g.delay(0.33), dr = g.delay(0.47), fb1 = g.gain(0.4 * k), fb2 = g.gain(0.4 * k);
      const send = g.bq('lowpass', 3500);
      input.connect(send); send.connect(dl); send.connect(dr);
      dl.connect(fb1).connect(dl); dr.connect(fb2).connect(dr);
      dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
      merger.connect(g.gain(0.45 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'hall', name: '성당 · 큰 홀', desc: '높은 천장에서 길게 울리는 소리',
    build(g, k) {
      const rv = g.conv(impulse(g.ctx, 5, 2.4, 0.55));
      const pre = g.delay(0.05); pre.connect(rv);
      return g.mix(1 - 0.3 * k, pre, rv, 1.7 * k);
    },
  },
  {
    id: 'room', name: '옆방에서', desc: '벽 너머로 새어 들리는 먹먹한 소리',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1 - 0.25 * k);
      const lp = g.bq('lowpass', lerpExp(20000, 520, k), 0.9);
      input.connect(g.bq('highpass', 60 + 120 * k)).connect(lp).connect(output);
      lp.connect(g.conv(impulse(g.ctx, 0.8, 3, 0.4))).connect(g.gain(0.9 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'far', name: '멀리서 들리는', desc: '운동장 건너편 스피커처럼 멀고 넓게',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      const thin = g.bq('highpass', 120 + 380 * k);
      input.connect(thin).connect(g.bq('lowpass', lerpExp(20000, 3500, k))).connect(g.gain(1 - 0.55 * k)).connect(output);
      const pre = g.delay(0.09);
      thin.connect(pre).connect(g.conv(impulse(g.ctx, 3, 2.2, 0.3))).connect(g.gain(1.3 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'radio', name: '옛날 라디오', desc: '좁은 대역, 살짝 찌그러진 소리와 잡음',
    build(g, k) {
      const a = g.bq('highpass', 450), out = g.gain(0.7);
      a.connect(g.bq('lowpass', 3200)).connect(g.bq('peaking', 1500, 1, 6)).connect(g.shaper(distCurve(18))).connect(out);
      const m = g.mix(1 - k, a, out, k);
      g.noise('white').connect(g.bq('bandpass', 2500, 0.8)).connect(g.gain(0.02 * k)).connect(m.output);
      g.noise('crackle').connect(g.gain(0.12 * k)).connect(m.output);
      return m;
    },
  },
  {
    id: 'phone', name: '전화기 너머', desc: '수화기에서 나오는 좁고 가는 소리',
    build(g, k) {
      const a = g.mono(), out = g.gain(0.8);
      a.connect(g.bq('highpass', 550, 1)).connect(g.bq('lowpass', 2800, 1)).connect(g.bq('peaking', 1800, 1.2, 5)).connect(g.shaper(distCurve(35))).connect(out);
      return g.mix(1 - k, a, out, k);
    },
  },
  {
    id: 'megaphone', name: '확성기', desc: '쩌렁쩌렁 찢어지는 확성기 소리',
    build(g, k) {
      const a = g.mono(), out = g.gain(0.45);
      a.connect(g.bq('highpass', 800)).connect(g.bq('peaking', 2000, 2.5, 10)).connect(g.shaper(distCurve(120))).connect(g.bq('lowpass', 3800)).connect(out);
      return g.mix(1 - k, a, out, k);
    },
  },
  {
    id: 'cassette', name: '카세트 테이프', desc: '울렁이는 테이프 흔들림과 쉬익 잡음',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      const wow = g.delay(0.02); g.lfo(wow.delayTime, 0.6, 0.0018 * k); g.lfo(wow.delayTime, 7, 0.00025 * k);
      input.connect(wow).connect(g.bq('lowpass', lerpExp(20000, 6000, k))).connect(g.bq('lowshelf', 120, 0.7, 3 * k)).connect(g.shaper(softCurve(1 + 1.6 * k))).connect(output);
      g.noise('white').connect(g.bq('highpass', 3000)).connect(g.gain(0.018 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'lofi', name: '로파이', desc: '거칠게 깎인 비트와 따뜻한 먹먹함',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      const wow = g.delay(0.01); g.lfo(wow.delayTime, 0.4, 0.0006 * k);
      const lp = g.bq('lowpass', lerpExp(20000, 2600, k), 0.9);
      input.connect(wow).connect(lp);
      const crush = g.shaper(crushCurve(Math.round(Math.pow(2, 8 - 4.5 * k))));
      crush.oversample = 'none';
      lp.connect(g.gain(1 - 0.6 * k)).connect(output);
      lp.connect(crush).connect(g.gain(0.6 * k)).connect(output);
      g.noise('crackle').connect(g.gain(0.25 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'echo', name: '동굴 메아리', desc: '되돌아오는 메아리가 여러 번',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      input.connect(output);
      const d = g.delay(0.42), fb = g.gain(0.3 + 0.3 * k), tone = g.bq('lowpass', 2500);
      input.connect(d); d.connect(tone).connect(fb).connect(d);
      d.connect(g.gain(0.7 * k)).connect(output);
      input.connect(g.conv(impulse(g.ctx, 2.5, 2.5, 0.35))).connect(g.gain(0.8 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'rotate', name: '8D 회전', desc: '소리가 머리 주위를 빙글빙글 (이어폰 추천)',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      const p = g.ctx.createStereoPanner(); p.pan.value = 0;
      g.lfo(p.pan, 0.12, 0.95 * k);
      input.connect(p).connect(output);
      p.connect(g.conv(impulse(g.ctx, 1.8, 2.5, 0.4))).connect(g.gain(0.45 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'tremolo', name: '물결 트레몰로', desc: '볼륨이 파도처럼 흔들림',
    build(g, k) {
      const input = g.gain(1), t = g.gain(1 - 0.35 * k);
      g.lfo(t.gain, 5.5, 0.35 * k);
      input.connect(t);
      return { input, output: t };
    },
  },
  {
    id: 'karaoke', name: '보컬 줄이기', desc: '가운데 목소리를 줄여 MR 느낌 (곡마다 다름)',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      input.channelCount = 2; input.channelCountMode = 'explicit';
      const sp = g.ctx.createChannelSplitter(2), side = g.mono();
      input.connect(sp);
      sp.connect(g.gain(1), 0).connect(side);
      sp.connect(g.gain(-1), 1).connect(side);
      input.connect(g.gain(1 - k)).connect(output);
      side.connect(g.gain(1.1 * k)).connect(output);
      input.connect(g.bq('lowpass', 160)).connect(g.gain(0.9 * k)).connect(output);
      return { input, output };
    },
  },
  {
    id: 'broken', name: '고장난 스피커', desc: '찢어지고 지글거리는 소리',
    build(g, k) {
      const a = g.gain(1), out = g.gain(0.35);
      a.connect(g.bq('highpass', 250)).connect(g.shaper(distCurve(40 + 400 * k))).connect(g.bq('lowpass', 5000)).connect(out);
      const t = g.gain(1); g.lfo(t.gain, 13, 0.25 * k, 'square');
      out.connect(t);
      return g.mix(1 - k, a, t, k);
    },
  },
  {
    id: 'rain', name: '창밖 빗소리', desc: '비 오는 창가에서 듣는 느낌',
    build(g, k) {
      const input = g.gain(1), output = g.gain(1);
      input.connect(g.bq('lowpass', lerpExp(20000, 5000, k))).connect(g.gain(1 - 0.15 * k)).connect(output);
      g.noise('rain').connect(g.bq('highpass', 200)).connect(g.gain(0.9 * k)).connect(output);
      return { input, output };
    },
  },
];

export const AUDIO_FX_MAP = Object.fromEntries(AUDIO_FX.map((f) => [f.id, f]));

// 출력 길이(초): 자른 구간 ÷ 속도
export function outDuration(buffer, s) {
  if (!buffer) return 0;
  const end = s.end == null ? buffer.duration : Math.min(s.end, buffer.duration);
  const start = Math.min(s.start || 0, end);
  return Math.max(0, (end - start) / s.speed);
}

/**
 * 그래프 만들기.
 * @param ctx AudioContext | OfflineAudioContext
 * @param buffer 원본 AudioBuffer
 * @param s 소리 설정
 * @param pos 출력 기준 시작 위치(초)
 * @param when ctx 시간 기준 시작 시각
 * @param dest 연결할 노드
 */
export function playGraph(ctx, buffer, s, pos, when, dest) {
  const g = new G(ctx);
  const total = outDuration(buffer, s);
  const remain = Math.max(0.01, total - pos);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = s.speed;

  let node = src;
  const bass = g.bq('lowshelf', 200, 0.7, s.bass || 0);
  const treble = g.bq('highshelf', 4000, 0.7, s.treble || 0);
  node.connect(bass).connect(treble);
  node = treble;
  for (const f of s.fx) {
    const def = AUDIO_FX_MAP[f.id];
    if (!def || f.k <= 0) continue;
    const { input, output } = def.build(g, Math.min(1, Math.max(0, f.k)));
    node.connect(input);
    node = output;
  }
  const master = g.gain(s.volume);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6; comp.knee.value = 4; comp.ratio.value = 20; comp.attack.value = 0.003; comp.release.value = 0.2;
  const fade = g.gain(1);
  node.connect(master).connect(comp).connect(fade).connect(dest);

  // 페이드 인/아웃 곡선
  const fi = Math.max(0, s.fadeIn || 0), fo = Math.max(0, s.fadeOut || 0);
  const N = Math.min(4000, Math.max(2, Math.ceil(remain * 30)));
  const c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = pos + (remain * i) / (N - 1);
    let v = 1;
    if (fi > 0) v = Math.min(v, x / fi);
    if (fo > 0) v = Math.min(v, (total - x) / fo);
    c[i] = Math.max(0, Math.min(1, v));
  }
  fade.gain.setValueCurveAtTime(c, when, remain);

  const startIn = (s.start || 0) + pos * s.speed;
  src.start(when, startIn, remain * s.speed);
  for (const o of g.sources) { o.start(when); o.stop(when + remain + 0.05); }
  src.stop(when + remain + 0.05);
  return { src, sources: g.sources, remain };
}

/** 효과를 입힌 최종 오디오를 오프라인으로 만들어 돌려줍니다. */
export async function renderAudio(buffer, s, sampleRate = 48000) {
  const dur = outDuration(buffer, s);
  const len = Math.max(1, Math.ceil(dur * sampleRate));
  const ctx = new OfflineAudioContext(2, len, sampleRate);
  playGraph(ctx, buffer, s, 0, 0, ctx.destination);
  return ctx.startRendering();
}
