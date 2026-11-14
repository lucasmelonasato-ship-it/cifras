// Afinador cromático: microfone + detecção de frequência (algoritmo YIN).

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = { C: 'Dó', 'C#': 'Dó#', D: 'Ré', 'D#': 'Ré#', E: 'Mi', F: 'Fá', 'F#': 'Fá#', G: 'Sol', 'G#': 'Sol#', A: 'Lá', 'A#': 'Lá#', B: 'Si' };

export const TUNINGS = {
  guitar: { name: 'Violão', strings: [['6ª', 'E', 2], ['5ª', 'A', 2], ['4ª', 'D', 3], ['3ª', 'G', 3], ['2ª', 'B', 3], ['1ª', 'E', 4]] },
  uke: { name: 'Ukulele', strings: [['4ª', 'G', 4], ['3ª', 'C', 4], ['2ª', 'E', 4], ['1ª', 'A', 4]] },
};

export const midiOf = (name, oct) => NAMES.indexOf(name) + (oct + 1) * 12;
export const freqOf = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

export function noteFromFreq(f, a4 = 440) {
  const midi = 69 + 12 * Math.log2(f / a4);
  const n = Math.round(midi);
  return { midi: n, name: NAMES[((n % 12) + 12) % 12], octave: Math.floor(n / 12) - 1, cents: (midi - n) * 100 };
}

// YIN: retorna a frequência fundamental em Hz, ou null quando não há som claro.
export function detectPitch(buf, sr, minF = 60, maxF = 1200) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.008) return null;
  const tauMin = Math.floor(sr / maxF);
  const tauMax = Math.min(Math.floor(sr / minF), Math.floor(buf.length / 2));
  const W = buf.length - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      sum += x * x;
    }
    d[tau] = sum;
  }
  // diferença média normalizada cumulativa
  let run = 0;
  const cm = new Float32Array(tauMax + 1);
  cm[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau];
    cm[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cm[t] < 0.15) {
      while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // interpolação parabólica para precisão sub-amostra
  const a = cm[tau - 1] ?? cm[tau], b = cm[tau], c = cm[tau + 1] ?? cm[tau];
  const den = a + c - 2 * b;
  const shift = den ? (a - c) / (2 * den) : 0;
  return sr / (tau + shift);
}

export function mountTuner(root, { getInst, setInst }) {
  let ctx = null, stream = null, analyser = null, buf = null, raf = 0, lastRun = 0;
  let target = null; // índice da corda escolhida; null = automático
  const hist = [];

  const tuning = () => TUNINGS[getInst()] || TUNINGS.guitar;

  root.innerHTML = `
    <div class="tuner">
      <div class="tinst">${Object.entries(TUNINGS).map(([k, t]) => `<button class="btn ${getInst() === k ? 'primary' : ''}" data-ti="${k}">${k === 'uke' ? '🪕' : '🎸'} ${t.name}</button>`).join('')}</div>
      <div class="tdial">
        <div class="tnote"><span id="tn">–</span><small id="tsol"> </small></div>
        <div class="tmeter"><div class="tscale">${Array.from({ length: 11 }, (_, i) => `<i class="${i === 5 ? 'mid' : ''}"></i>`).join('')}</div><div class="tneedle" id="tneedle"></div></div>
        <div class="tread"><span id="tcents">ligue o microfone</span><span id="thz"></span></div>
        <div class="thint" id="thint"> </div>
      </div>
      <button class="btn primary tstart" id="tstart">🎤 Ligar afinador</button>
      <h3>Cordas <small class="muted" id="tmode">automático: detecta a corda mais próxima</small></h3>
      <div class="tstrings" id="tstrings"></div>
      <p class="muted small">Toque numa corda para ouvir o som de referência e travar o afinador nela. Toque de novo para voltar ao automático.</p>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const buildStrings = () => {
    $('#tstrings').innerHTML = tuning().strings.map(([n, note], i) => `
      <button class="tstr" data-s="${i}"><b>${note}</b><small>${n} · ${SOLFEGE[note]}</small></button>`).join('');
  };
  // só troca classes (não recria os botões a cada leitura, para não perder toques)
  const drawStrings = (active = -1) => {
    root.querySelectorAll('.tstr').forEach((b, i) => {
      b.classList.toggle('sel', target === i);
      b.classList.toggle('hit', active === i);
    });
    $('#tmode').textContent = target === null ? 'automático: detecta a corda mais próxima' : `travado na ${tuning().strings[target][0]} corda`;
  };
  buildStrings();
  drawStrings();

  function show(freq) {
    const t = tuning();
    if (!freq) {
      $('#tneedle').style.setProperty('--x', '0');
      root.querySelector('.tdial').classList.remove('ok');
      return;
    }
    const n = noteFromFreq(freq);
    // corda mais próxima (ou a corda travada)
    let si = target;
    if (si === null) {
      let best = Infinity;
      t.strings.forEach(([, note, oct], i) => {
        const dist = Math.abs(12 * Math.log2(freq / freqOf(midiOf(note, oct))));
        if (dist < best) { best = dist; si = i; }
      });
      if (best > 2.5) si = -1; // longe de qualquer corda: mostra só a nota cromática
    }
    let cents = n.cents, label = n.name, sol = SOLFEGE[n.name] + ' · ' + n.octave;
    if (si >= 0) {
      const [, note, oct] = t.strings[si];
      cents = 1200 * Math.log2(freq / freqOf(midiOf(note, oct)));
      if (Math.abs(cents) > 50) { label = n.name; } else { label = note; }
    }
    const ok = Math.abs(cents) <= 5;
    $('#tn').textContent = label;
    $('#tsol').textContent = sol;
    $('#tcents').textContent = `${cents > 0 ? '+' : ''}${Math.round(cents)} cents`;
    $('#thz').textContent = `${freq.toFixed(1)} Hz`;
    $('#tneedle').style.setProperty('--x', String(Math.max(-1, Math.min(1, cents / 50))));
    root.querySelector('.tdial').classList.toggle('ok', ok);
    $('#thint').textContent = ok ? '✓ Afinado' : cents < 0 ? (cents < -50 ? '▲ Muito grave: aperte bem a corda' : '▲ Aperte um pouco (mais agudo)') : (cents > 50 ? '▼ Muito agudo: afrouxe bem a corda' : '▼ Afrouxe um pouco (mais grave)');
    drawStrings(si);
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - lastRun < 70) return;
    lastRun = t;
    analyser.getFloatTimeDomainData(buf);
    const f = detectPitch(buf, ctx.sampleRate);
    if (f) { hist.push(f); if (hist.length > 5) hist.shift(); } else if (hist.length) hist.shift();
    if (!hist.length) return show(null);
    const sorted = [...hist].sort((a, b) => a - b);
    show(sorted[Math.floor(sorted.length / 2)]);
  }

  async function start() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      $('#tstart').textContent = '⏹ Desligar';
      $('#tcents').textContent = 'toque uma corda…';
      raf = requestAnimationFrame(loop);
    } catch (e) {
      $('#tcents').textContent = 'sem acesso ao microfone';
      $('#thint').textContent = 'Permita o microfone: Ajustes do iPhone → Safari → Microfone (ou no cadeado da barra de endereço, no Android).';
    }
  }
  function stopMic() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    $('#tstart').textContent = '🎤 Ligar afinador';
  }

  function playRef(freq) {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    g.connect(ctx.destination);
    [1, 2, 3].forEach((h, i) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq * h;
      og.gain.value = [1, 0.35, 0.15][i];
      o.connect(og).connect(g);
      o.start(now);
      o.stop(now + 2.3);
    });
  }

  root.onclick = (e) => {
    if (e.target.closest('#tstart')) return stream ? stopMic() : start();
    const ti = e.target.closest('[data-ti]');
    if (ti) {
      setInst(ti.dataset.ti);
      target = null;
      root.querySelectorAll('[data-ti]').forEach((b) => b.classList.toggle('primary', b === ti));
      buildStrings();
      return drawStrings();
    }
    const s = e.target.closest('[data-s]');
    if (s) {
      const i = Number(s.dataset.s);
      target = target === i ? null : i;
      const [, note, oct] = tuning().strings[i];
      if (target !== null) playRef(freqOf(midiOf(note, oct)));
      drawStrings();
    }
  };

  return () => {
    stopMic();
    ctx?.close();
    ctx = null;
    root.onclick = null;
  };
}
