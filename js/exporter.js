// MP4 만들기: WebCodecs(H.264 + AAC)로 실제 속도보다 빠르게 인코딩하고 mp4-muxer로 묶습니다.
// WebCodecs가 없는 브라우저는 MediaRecorder로 실시간 녹화합니다.

export const BANDS = 20;
export const bandFreqs = Array.from({ length: BANDS }, (_, i) => 60 * Math.pow(12000 / 60, i / (BANDS - 1)));

const levelOf = (rms) => Math.min(1, rms * 3.2);
const bandOf = (db) => Math.max(0, Math.min(1, (db + 100) / 70));

/** 렌더된 오디오에서 프레임별 소리 크기·파형·주파수 막대를 뽑습니다. */
export function analyze(buf, fps) {
  const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const frames = Math.ceil(buf.duration * fps);
  const level = new Float32Array(frames);
  const bands = Array.from({ length: frames }, () => new Float32Array(BANDS));
  const N = 1024, win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const tmp = new Float32Array(N);
  let prev = 0;
  const prevB = new Float32Array(BANDS);
  for (let f = 0; f < frames; f++) {
    const a = Math.floor((f / fps) * sr), b = Math.min(L.length, a + Math.floor(sr / fps));
    let sum = 0;
    for (let i = a; i < b; i++) { const m = (L[i] + R[i]) * 0.5; sum += m * m; }
    const v = levelOf(Math.sqrt(sum / Math.max(1, b - a)));
    prev = Math.max(v, prev * 0.85);
    level[f] = prev;
    for (let i = 0; i < N; i++) { const j = a + i; tmp[i] = j < L.length ? (L[j] + R[j]) * 0.5 * win[i] : 0; }
    for (let k = 0; k < BANDS; k++) {
      const w = (2 * Math.PI * bandFreqs[k]) / sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < N; i++) { const s0 = tmp[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      const mag = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / N;
      const val = bandOf(20 * Math.log10(mag + 1e-9));
      prevB[k] = Math.max(val, prevB[k] * 0.8);
      bands[f][k] = prevB[k];
    }
  }
  const wave = (t) => {
    const a = Math.floor(t * sr), out = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const j = a + i; out[i] = j < L.length ? (L[j] + R[j]) * 0.5 : 0; }
    return out;
  };
  return {
    level: (t) => level[Math.min(frames - 1, Math.max(0, Math.floor(t * fps)))] || 0,
    bands: (t) => bands[Math.min(frames - 1, Math.max(0, Math.floor(t * fps)))] || null,
    wave,
  };
}

/** 미리듣기용: AnalyserNode에서 같은 값을 뽑습니다. */
export function liveAnalyzer(an) {
  const td = new Float32Array(an.fftSize), fd = new Float32Array(an.frequencyBinCount);
  let lv = 0, lastT = -1, bandsOut = new Float32Array(BANDS);
  const binHz = an.context.sampleRate / an.fftSize;
  const pull = (t) => {
    if (t === lastT) return;
    lastT = t;
    an.getFloatTimeDomainData(td);
    let s = 0;
    for (let i = 0; i < td.length; i++) s += td[i] * td[i];
    lv = Math.max(levelOf(Math.sqrt(s / td.length)), lv * 0.88);
    an.getFloatFrequencyData(fd);
    for (let k = 0; k < BANDS; k++) {
      const lo = Math.max(1, Math.floor((k ? Math.sqrt(bandFreqs[k - 1] * bandFreqs[k]) : bandFreqs[0] * 0.8) / binHz));
      const hi = Math.max(lo + 1, Math.ceil((k < BANDS - 1 ? Math.sqrt(bandFreqs[k] * bandFreqs[k + 1]) : bandFreqs[k] * 1.2) / binHz));
      let m = -200;
      for (let i = lo; i < hi && i < fd.length; i++) m = Math.max(m, fd[i]);
      bandsOut[k] = Math.max(bandOf(m), bandsOut[k] * 0.8);
    }
  };
  return {
    level: (t) => (pull(t), lv),
    bands: (t) => (pull(t), bandsOut),
    wave: (t) => (pull(t), td),
  };
}

export function canWebCodecs() {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof Mp4Muxer !== 'undefined';
}

async function pickVideo(W, H, fps) {
  const bitrate = Math.round(Math.min(16e6, Math.max(2.5e6, W * H * fps * 0.11)));
  for (const codec of ['avc1.640033', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e033', 'avc1.42e01f']) {
    for (const hw of ['prefer-hardware', 'no-preference', 'prefer-software']) {
      const cfg = { codec, width: W, height: H, bitrate, framerate: fps, hardwareAcceleration: hw, avc: { format: 'avc' } };
      try {
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return r.config || cfg;
      } catch { /* 다음 후보 */ }
    }
  }
  return null;
}

async function pickAudio(sr) {
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = { codec, sampleRate: sr, numberOfChannels: 2, bitrate: 192000 };
    try {
      const r = await AudioEncoder.isConfigSupported(cfg);
      if (r.supported) return { cfg: r.config || cfg, mux };
    } catch { /* 다음 후보 */ }
  }
  return null;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * @param o { W, H, fps, dur, audio: AudioBuffer|null, draw(ctx, W, H, t), onProgress(p, label), signal }
 * @returns { blob, ext, mime, note }
 */
export async function exportVideo(o) {
  if (canWebCodecs()) {
    const vcfg = await pickVideo(o.W, o.H, o.fps);
    const acfg = o.audio ? await pickAudio(o.audio.sampleRate) : null;
    if (vcfg && (!o.audio || acfg)) return encodeWebCodecs(o, vcfg, acfg);
  }
  return recordRealtime(o);
}

async function encodeWebCodecs(o, vcfg, acfg) {
  const { W, H, fps, dur, audio, signal } = o;
  const { Muxer, ArrayBufferTarget } = Mp4Muxer;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    audio: acfg ? { codec: acfg.mux, numberOfChannels: 2, sampleRate: audio.sampleRate } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failure = e) });
  venc.configure(vcfg);

  if (acfg) {
    o.onProgress(0, '소리 인코딩 중…');
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e) });
    aenc.configure(acfg.cfg);
    const sr = audio.sampleRate, L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
    const CH = 4096;
    for (let a = 0; a < L.length; a += CH) {
      if (signal.aborted) throw new DOMException('취소됨', 'AbortError');
      if (failure) throw failure;
      const n = Math.min(CH, L.length - a);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(a, a + n), 0); data.set(R.subarray(a, a + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((a / sr) * 1e6), data });
      aenc.encode(ad); ad.close();
      if (aenc.encodeQueueSize > 20) await tick();
    }
    await aenc.flush();
    aenc.close();
  }

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { alpha: false });
  const frames = Math.max(1, Math.round(dur * fps));
  const us = 1e6 / fps;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (signal.aborted) { venc.close(); throw new DOMException('취소됨', 'AbortError'); }
    if (failure) throw failure;
    o.draw(ctx, W, H, i / fps);
    const vf = new VideoFrame(cv, { timestamp: Math.round(i * us), duration: Math.round(us) });
    venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 4) await tick();
    if (i % 5 === 0) {
      const el = (performance.now() - t0) / 1000, p = (i + 1) / frames;
      const left = p > 0.02 ? Math.round((el / p) * (1 - p)) : null;
      o.onProgress(p, `영상 인코딩 중… ${i + 1}/${frames}프레임${left != null ? ` · 약 ${left}초 남음` : ''}`);
      await tick();
    }
  }
  await venc.flush();
  venc.close();
  if (failure) throw failure;
  muxer.finalize();
  const note = acfg && acfg.mux === 'opus' ? '이 브라우저는 AAC를 지원하지 않아 소리를 Opus로 넣었어요. 일부 기기(아이폰 사진 앱 등)에서 소리가 안 날 수 있어요. 크롬·엣지·사파리 최신 버전을 추천해요.' : '';
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4', mime: 'video/mp4', note };
}

async function recordRealtime(o) {
  const { W, H, fps, dur, audio, signal } = o;
  if (typeof MediaRecorder === 'undefined') throw new Error('이 브라우저는 영상 만들기를 지원하지 않아요. 크롬, 엣지, 사파리 최신 버전에서 열어주세요.');
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { alpha: false });
  o.draw(ctx, W, H, 0);
  const stream = cv.captureStream(fps);
  const ac = new AudioContext({ sampleRate: audio ? audio.sampleRate : 48000 });
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  let src = null;
  if (audio) { src = ac.createBufferSource(); src.buffer = audio; src.connect(dest); }
  else { const g = ac.createGain(); g.gain.value = 0; const osc = ac.createOscillator(); osc.connect(g).connect(dest); osc.start(); }
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const mimes = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(12e6, W * H * fps * 0.1), audioBitsPerSecond: 192000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  const start = ac.currentTime + 0.1;
  if (src) src.start(start);
  await new Promise((resolve, reject) => {
    const loop = () => {
      if (signal.aborted) { rec.stop(); reject(new DOMException('취소됨', 'AbortError')); return; }
      const t = Math.max(0, ac.currentTime - start);
      o.draw(ctx, W, H, Math.min(t, dur));
      o.onProgress(Math.min(1, t / dur), `실시간 녹화 중… ${Math.floor(t)}/${Math.ceil(dur)}초 (이 브라우저는 빠른 인코딩을 지원하지 않아요)`);
      if (t >= dur) { rec.stop(); resolve(); return; }
      requestAnimationFrame(loop);
    };
    loop();
  });
  await done;
  ac.close();
  stream.getTracks().forEach((tr) => tr.stop());
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const note = ext === 'webm' ? '이 브라우저는 MP4를 직접 만들 수 없어 WebM으로 저장했어요. 크롬·엣지·사파리 최신 버전에서는 MP4로 저장돼요.' : '';
  return { blob: new Blob(parts, { type }), ext, mime: type, note };
}
