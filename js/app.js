import {
  isChordLine, isTabLine, layoutChordLine, transposeNote, firstChord, keyOf,
  collectChords, chordSVG, esc, parseChord, INSTRUMENTS,
} from './chords.js';
import { store, uid } from './store.js';

const $app = document.getElementById('app');
const STRUM_PRESETS = [
  ['Pop / Rock básico', '↓ ↓ ↑ ↑ ↓ ↑'],
  ['Balada', '↓ - ↓↑ - ↑ ↓↑'],
  ['Folk', '↓ ↓↑ ↑↓↑'],
  ['Rock (colcheias)', '↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓'],
  ['Reggae (contratempo)', '- ↑ - ↑'],
  ['Xote / Forró', '↓ x ↓↑ x'],
  ['Valsa / Guarânia (3/4)', '↓ ↓↑ ↓↑'],
  ['Arpejo (dedilhado)', 'P i m a m i'],
];

// ---------- Renderização da cifra ----------

function renderLine(line, semis) {
  if (!line.trim()) return '<div class="ln"> </div>';
  if (isTabLine(line)) return `<div class="ln tab">${esc(line)}</div>`;
  if (isChordLine(line)) {
    return '<div class="ln ch">' + layoutChordLine(line, semis)
      .map((s) => (s.chord ? `<b class="chord" data-c="${esc(s.chord)}">${esc(s.text)}</b>` : esc(s.text)))
      .join('') + '</div>';
  }
  return `<div class="ln">${esc(line)}</div>`;
}

export function renderSheet(text, semis = 0) {
  return text.split('\n').map((line) => {
    const sec = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (sec) {
      const rest = sec[2] ? renderLine(sec[2], semis) : '';
      return `<div class="sec">${esc(sec[1])}</div>${rest}`;
    }
    return renderLine(line, semis);
  }).join('');
}

function shownKey(song) {
  const k = song.key || keyOf(firstChord(song.text));
  if (!k) return '—';
  const c = parseChord(k);
  return c ? transposeNote(c.root, song.transpose || 0) + c.suffix : k;
}

function chordsStrip(song) {
  const list = collectChords(song.text, song.transpose || 0);
  if (!list.length) return '';
  const inst = store.prefs.instrument || 'guitar';
  return `<div class="strip">${list.map((c) => chordSVG(c, inst)).join('')}</div>`;
}

export function cleanImport(raw) {
  let key = '', capo = 0, strum = '';
  const lines = raw.replace(/\r/g, '').replace(/ /g, ' ').replace(/\t/g, '    ').split('\n');
  const out = [];
  for (const l of lines) {
    const tom = /^\s*tom:\s*([A-G][#b]?m?)/i.exec(l);
    if (tom) { key = tom[1]; continue; }
    const capoM = /capotraste.*?(\d+)/i.exec(l);
    if (capoM && l.length < 60) { capo = Number(capoM[1]); continue; }
    if (/^\s*afina[çc][ãa]o/i.test(l) && l.length < 60) continue;
    out.push(l.replace(/\s+$/, ''));
  }
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  return { text, key, capo, strum };
}

// ---------- Rolagem automática ----------

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* sem suporte */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && scroller.playing) keepAwake(true);
});

const scroller = {
  playing: false,
  holdUntil: 0,
  getSpeed: () => 20,
  onTick: () => {},
  onState: () => {},
  start() {
    if (this.playing) return;
    this.playing = true;
    this.acc = window.scrollY;
    this.last = performance.now();
    keepAwake(true);
    this.onState(true);
    requestAnimationFrame((t) => this.loop(t));
  },
  stop() {
    this.playing = false;
    this.holdUntil = 0;
    keepAwake(false);
    this.onState(false);
  },
  toggle() { this.playing ? this.stop() : this.start(); },
  loop(t) {
    if (!this.playing) return;
    const dt = Math.min(100, t - this.last);
    this.last = t;
    if (Math.abs(window.scrollY - this.acc) > 3) this.acc = window.scrollY; // usuário rolou na mão
    if (Date.now() >= this.holdUntil) {
      this.acc += (this.getSpeed() * dt) / 1000;
      window.scrollTo(0, this.acc);
    }
    this.onTick();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= max - 1 && Date.now() >= this.holdUntil) { this.stop(); return; }
    requestAnimationFrame((tt) => this.loop(tt));
  },
};

function fontScale() { return store.prefs.font / 16; }

// ---------- Views ----------

const routes = [
  [/^#\/?$/, viewLibrary],
  [/^#\/song\/(.+)$/, viewSong],
  [/^#\/edit\/(.+)$/, viewEdit],
  [/^#\/new$/, () => viewEdit()],
  [/^#\/import\/(.+)$/, viewImport],
  [/^#\/sets$/, viewSets],
  [/^#\/set\/(.+)$/, viewSet],
  [/^#\/play\/(.+)$/, viewPlay],
  [/^#\/config$/, viewConfig],
];

function render() {
  scroller.stop();
  scroller.onTick = () => {};
  scroller.onState = () => {};
  $app.onclick = $app.oninput = $app.onchange = null;
  window.onscroll = null;
  document.body.className = '';
  const h = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = re.exec(h);
    if (m) { window.scrollTo(0, 0); fn(...m.slice(1).map(decodeURIComponent)); return; }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', render);

function applyPrefs() {
  document.documentElement.dataset.theme = store.prefs.theme;
  document.documentElement.style.setProperty('--sheet-font', store.prefs.font + 'px');
}

function header(title, back, extra = '') {
  return `<header class="top">
    ${back ? `<a class="btn ghost" href="${back}" aria-label="Voltar">‹</a>` : '<span class="logo">🎸</span>'}
    <h1>${title}</h1>${extra}</header>`;
}

function nav(active) {
  const item = (href, label, icon, key) => `<a href="${href}" class="${active === key ? 'on' : ''}"><span>${icon}</span>${label}</a>`;
  return `<nav class="tabs">${item('#/', 'Músicas', '♫', 'lib')}${item('#/sets', 'Repertórios', '☰', 'sets')}${item('#/config', 'Ajustes', '⚙', 'cfg')}</nav>`;
}

function norm(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

function sortedSongs() {
  return [...store.songs].sort((a, b) => norm(a.title).localeCompare(norm(b.title)));
}

// Biblioteca
function viewLibrary() {
  const q = sessionStorage.getItem('q') || '';
  $app.innerHTML = header('Minhas Cifras', null, '<a class="btn primary" href="#/new">+ Música</a>') + `
    <main class="wrap">
      <input class="search" type="search" placeholder="Buscar por música ou artista…" value="${esc(q)}">
      <ul class="list" id="songs"></ul>
    </main>` + nav('lib');
  const list = $app.querySelector('#songs');
  const draw = (q) => {
    const nq = norm(q);
    const items = sortedSongs().filter((s) => !nq || norm(s.title + ' ' + s.artist).includes(nq));
    list.innerHTML = items.length ? items.map((s) => `
      <li><a href="#/song/${s.id}"><strong>${esc(s.title)}</strong><small>${esc(s.artist || '')}</small></a>
      <span class="key">${esc(shownKey(s))}</span></li>`).join('')
      : `<li class="empty">Nenhuma música${q ? ' encontrada' : ''}. Toque em <b>+ Música</b> e cole uma cifra.</li>`;
  };
  draw(q);
  $app.querySelector('.search').addEventListener('input', (e) => { sessionStorage.setItem('q', e.target.value); draw(e.target.value); });
}

// Música
function viewSong(id) {
  const song = store.song(id);
  if (!song) { location.hash = '#/'; return; }
  const draw = () => {
    $app.innerHTML = header(esc(song.title), '#/', `<a class="btn ghost" href="#/edit/${id}">Editar</a>`) + `
      <main class="wrap song">
        <div class="meta">
          <span>${esc(song.artist || '')}</span>
          ${song.capo ? `<span class="pill">Capo ${song.capo}ª casa</span>` : ''}
        </div>
        <div class="toolbar">
          <div class="grp"><button data-a="tdown">−</button><span class="lbl">Tom <b>${esc(shownKey(song))}</b></span><button data-a="tup">+</button></div>
          <div class="grp"><button data-a="fdown">A−</button><button data-a="fup">A+</button></div>
          ${instBtn()}
          <button data-a="diag" class="${store.prefs.showDiagrams ? 'on' : ''}">Acordes</button>
          <button data-a="addset">+ Repertório</button>
        </div>
        ${song.strum ? `<div class="strum"><span>Batida</span><b>${esc(song.strum)}</b></div>` : ''}
        ${store.prefs.showDiagrams ? chordsStrip(song) : ''}
        <article class="sheet">${renderSheet(song.text, song.transpose || 0)}</article>
        <div class="endpad"></div>
      </main>
      <div class="playbar">
        <button data-a="play" class="big">▶</button>
        <button data-a="sdown">−</button><span class="lbl">Velocidade <b id="spd">${song.speed || 20}</b></span><button data-a="sup">+</button>
      </div>`;
  };
  draw();
  scroller.getSpeed = () => (song.speed || 20) * fontScale();
  scroller.onState = (on) => { const b = $app.querySelector('[data-a=play]'); if (b) b.textContent = on ? '❚❚' : '▶'; };
  $app.onclick = (e) => {
    const chord = e.target.closest('.chord');
    if (chord) return showChord(chord.dataset.c);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) { if (e.target.closest('.sheet') && scroller.playing) scroller.stop(); return; }
    const y = window.scrollY;
    if (a === 'tup' || a === 'tdown') { store.patchSong(id, { transpose: ((song.transpose || 0) + (a === 'tup' ? 1 : -1)) % 12 }); draw(); window.scrollTo(0, y); }
    if (a === 'fup' || a === 'fdown') { store.savePrefs({ font: Math.max(10, Math.min(30, store.prefs.font + (a === 'fup' ? 1 : -1))) }); applyPrefs(); }
    if (a === 'inst') { toggleInst(); draw(); window.scrollTo(0, y); }
    if (a === 'diag') { store.savePrefs({ showDiagrams: !store.prefs.showDiagrams }); draw(); window.scrollTo(0, y); }
    if (a === 'addset') addToSetModal([id]);
    if (a === 'play') scroller.toggle();
    if (a === 'sup' || a === 'sdown') {
      store.patchSong(id, { speed: Math.max(2, Math.min(120, (song.speed || 20) + (a === 'sup' ? 2 : -2))) });
      $app.querySelector('#spd').textContent = song.speed;
    }
  };
}

function instBtn() {
  const uke = store.prefs.instrument === 'uke';
  return `<button data-a="inst" class="inst" title="Trocar instrumento">${uke ? '🪕 Ukulele' : '🎸 Violão'}</button>`;
}

function toggleInst() {
  const next = store.prefs.instrument === 'uke' ? 'guitar' : 'uke';
  store.savePrefs({ instrument: next, showDiagrams: true });
  toast(`Acordes de ${INSTRUMENTS[next]}`);
}

function showChord(c) {
  const inst = store.prefs.instrument || 'guitar';
  modal(`<div class="chordbig">${chordSVG(c, inst)}</div>`, `Acorde · ${INSTRUMENTS[inst]}`);
}

function modal(html, title) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="card"><div class="mhead"><h2>${title}</h2><button class="btn ghost" data-close>✕</button></div>${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) el.remove(); });
  document.body.appendChild(el);
  return el;
}

function addToSetModal(ids) {
  const sets = store.sets;
  const el = modal(`
    <ul class="list">${sets.map((s) => `<li><button class="row" data-set="${s.id}"><strong>${esc(s.name)}</strong><small>${s.items.length} músicas</small></button></li>`).join('')}</ul>
    <form class="newset"><input name="n" placeholder="Novo repertório…" required><button class="btn primary">Criar</button></form>`, 'Adicionar ao repertório');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const set = store.set(b.dataset.set);
    set.items.push(...ids.filter((i) => !set.items.includes(i)));
    store.saveSet(set);
    el.remove();
    toast(`Adicionada em “${set.name}”`);
  });
  el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const set = store.saveSet({ id: uid(), name: e.target.n.value.trim(), items: [...ids], pause: 0 });
    el.remove();
    toast(`Repertório “${set.name}” criado`);
  });
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Editor / importação
function viewEdit(id, preset) {
  const song = id ? store.song(id) : { id: uid(), title: '', artist: '', key: '', capo: 0, transpose: 0, speed: 20, strum: '', text: '', ...(preset || {}) };
  if (!song) { location.hash = '#/'; return; }
  const isNew = !store.song(song.id);
  $app.innerHTML = header(isNew ? 'Nova música' : 'Editar', isNew ? '#/' : `#/song/${song.id}`) + `
    <main class="wrap">
      <form class="form" id="f">
        ${isNew ? `<div class="hint">Copie a cifra em qualquer site (Cifra Club, Cifras, etc.) e cole no campo <b>Cifra</b>. Acordes, seções, tom e capotraste são reconhecidos automaticamente.
          <button type="button" class="btn" id="paste">📋 Colar da área de transferência</button></div>` : ''}
        <label>Música<input name="title" required value="${esc(song.title)}"></label>
        <label>Artista<input name="artist" value="${esc(song.artist)}"></label>
        <div class="row3">
          <label>Tom original<input name="key" value="${esc(song.key)}" placeholder="auto"></label>
          <label>Capotraste<input name="capo" type="number" min="0" max="12" value="${song.capo || 0}"></label>
          <label>Velocidade<input name="speed" type="number" min="2" max="120" value="${song.speed || 20}"></label>
        </div>
        <label>Batida / ritmo<input name="strum" value="${esc(song.strum)}" placeholder="ex: ↓ ↓↑ ↑↓↑"></label>
        <div class="strumkeys">
          ${['↓', '↑', 'x', '-', '␣'].map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}
          <button type="button" data-k="⌫">⌫</button>
          <select id="preset"><option value="">Padrões prontos…</option>${STRUM_PRESETS.map(([n, p]) => `<option value="${esc(p)}">${esc(n)}: ${esc(p)}</option>`).join('')}</select>
        </div>
        <label>Cifra<textarea name="text" rows="14" spellcheck="false" placeholder="[Intro] G  D  Em  C&#10;&#10;G              D&#10;Letra da música aqui...">${esc(song.text)}</textarea></label>
        <div class="actions">
          <button class="btn primary">Salvar</button>
          ${isNew ? '' : '<button type="button" class="btn danger" id="del">Excluir</button>'}
        </div>
        <h3 class="pv">Pré-visualização</h3>
        <article class="sheet preview" id="pv"></article>
      </form>
    </main>`;
  const f = $app.querySelector('#f');
  const pv = $app.querySelector('#pv');
  const upd = () => (pv.innerHTML = renderSheet(f.text.value));
  upd();
  const ingest = (raw) => {
    const r = cleanImport(raw);
    f.text.value = r.text;
    if (r.key && !f.key.value) f.key.value = r.key;
    if (r.capo) f.capo.value = r.capo;
    upd();
  };
  f.text.addEventListener('input', upd);
  f.text.addEventListener('paste', (e) => {
    const t = e.clipboardData?.getData('text');
    if (t && !f.text.value.trim()) { e.preventDefault(); ingest(t); }
  });
  $app.querySelector('#paste')?.addEventListener('click', async () => {
    try { ingest(await navigator.clipboard.readText()); } catch { toast('Toque e segure no campo Cifra e escolha Colar'); }
  });
  $app.querySelector('.strumkeys').addEventListener('click', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const v = f.strum.value;
    f.strum.value = k === '⌫' ? v.slice(0, -1).trimEnd() : (v + (k === '␣' ? ' ' : (v && !v.endsWith(' ') && k !== '↑' ? ' ' : '') + k));
  });
  $app.querySelector('#preset').addEventListener('change', (e) => { if (e.target.value) f.strum.value = e.target.value; });
  $app.querySelector('#del')?.addEventListener('click', () => {
    if (confirm(`Excluir “${song.title}”?`)) { store.deleteSong(song.id); location.hash = '#/'; }
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = cleanImport(f.text.value);
    const text = r.text;
    store.saveSong({
      ...song,
      title: f.title.value.trim(),
      artist: f.artist.value.trim(),
      key: f.key.value.trim() || r.key || keyOf(firstChord(text)),
      capo: Number(f.capo.value) || r.capo || 0,
      speed: Number(f.speed.value) || 20,
      strum: f.strum.value.trim(),
      text,
    });
    location.hash = `#/song/${song.id}`;
  });
}

function viewImport(payload) {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(payload))));
    const r = cleanImport(d.text || '');
    viewEdit(null, { title: (d.title || '').trim(), artist: (d.artist || '').trim(), text: r.text, key: r.key, capo: r.capo });
  } catch {
    toast('Não foi possível importar');
    location.hash = '#/new';
  }
}

// Repertórios
function viewSets() {
  $app.innerHTML = header('Repertórios', null) + `
    <main class="wrap">
      <form class="newset" id="ns"><input name="n" placeholder="Nome do novo repertório (ex: Luau sábado)" required><button class="btn primary">Criar</button></form>
      <ul class="list">${store.sets.length ? store.sets.map((s) => `
        <li><a href="#/set/${s.id}"><strong>${esc(s.name)}</strong><small>${s.items.length} músicas</small></a>
        ${s.items.length ? `<a class="btn primary sm" href="#/play/${s.id}">▶ Tocar</a>` : ''}</li>`).join('')
        : '<li class="empty">Crie um repertório e adicione músicas na ordem em que vai tocar.</li>'}</ul>
    </main>` + nav('sets');
  $app.querySelector('#ns').addEventListener('submit', (e) => {
    e.preventDefault();
    const s = store.saveSet({ id: uid(), name: e.target.n.value.trim(), items: [], pause: 0 });
    location.hash = `#/set/${s.id}`;
  });
}

function viewSet(id) {
  const set = store.set(id);
  if (!set) { location.hash = '#/sets'; return; }
  let q = '';
  const draw = () => {
    const songs = set.items.map((i) => store.song(i)).filter(Boolean);
    const nq = norm(q);
    const avail = sortedSongs().filter((s) => !set.items.includes(s.id) && (!nq || norm(s.title + ' ' + s.artist).includes(nq)));
    $app.innerHTML = header(esc(set.name), '#/sets', songs.length ? `<a class="btn primary" href="#/play/${id}">▶ Tocar</a>` : '') + `
      <main class="wrap">
        <div class="row3">
          <label>Nome<input id="nm" value="${esc(set.name)}"></label>
          <label>Pausa entre músicas (s)<input id="pz" type="number" min="0" max="30" value="${set.pause || 0}"></label>
        </div>
        <h3>Ordem do repertório</h3>
        <ol class="list setlist">${songs.map((s, i) => `
          <li><span class="n">${i + 1}</span><div class="t"><strong>${esc(s.title)}</strong><small>${esc(s.artist || '')} · Tom ${esc(shownKey(s))}</small></div>
          <button data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button data-mv="${i}:1" ${i === songs.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
          <button data-rm="${i}" aria-label="Remover">✕</button></li>`).join('') || '<li class="empty">Adicione músicas abaixo.</li>'}</ol>
        <h3>Adicionar músicas</h3>
        <input class="search" id="q" type="search" placeholder="Buscar…" value="${esc(q)}">
        <ul class="list">${avail.map((s) => `<li><button class="row" data-add="${s.id}"><strong>${esc(s.title)}</strong><small>${esc(s.artist || '')}</small></button><span class="key">＋</span></li>`).join('') || '<li class="empty">Nenhuma outra música.</li>'}</ul>
        <button class="btn danger" id="del">Excluir repertório</button>
      </main>`;
  };
  draw();
  $app.oninput = (e) => {
    if (e.target.id === 'q') { q = e.target.value; const pos = e.target.selectionStart; draw(); const el = $app.querySelector('#q'); el.focus(); el.setSelectionRange(pos, pos); }
  };
  $app.onchange = (e) => {
    if (e.target.id === 'nm') { set.name = e.target.value.trim() || set.name; store.saveSet(set); }
    if (e.target.id === 'pz') { set.pause = Math.max(0, Number(e.target.value) || 0); store.saveSet(set); }
  };
  $app.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const y = window.scrollY;
    if (t.dataset.add) { set.items.push(t.dataset.add); store.saveSet(set); draw(); window.scrollTo(0, y); }
    if (t.dataset.rm) { set.items.splice(Number(t.dataset.rm), 1); store.saveSet(set); draw(); window.scrollTo(0, y); }
    if (t.dataset.mv) {
      const [i, d] = t.dataset.mv.split(':').map(Number);
      [set.items[i], set.items[i + d]] = [set.items[i + d], set.items[i]];
      store.saveSet(set); draw(); window.scrollTo(0, y);
    }
    if (t.id === 'del' && confirm(`Excluir o repertório “${set.name}”? (as músicas continuam salvas)`)) { store.deleteSet(id); location.hash = '#/sets'; }
  };
}

// Modo palco: todas as músicas emendadas, rolando sozinhas
function viewPlay(id) {
  const set = store.set(id);
  const songs = set ? set.items.map((i) => store.song(i)).filter(Boolean) : [];
  if (!songs.length) { location.hash = '#/sets'; return; }
  document.body.className = 'stage';
  let cur = 0, lastCur = 0;
  $app.innerHTML = `
    <div class="stagebar top"><a class="btn ghost" href="#/set/${id}" aria-label="Sair">✕</a>
      <div class="now"><small id="pos">1/${songs.length}</small><b id="nowt">${esc(songs[0].title)}</b></div>
      <div class="grp">${instBtn()}<button data-a="fdown">A−</button><button data-a="fup">A+</button></div></div>
    <main class="wrap stagewrap">${songs.map((s, i) => `
      <section class="stsong" data-i="${i}">
        <div class="sthead"><span class="n">${i + 1}</span><div><h2>${esc(s.title)}</h2><small>${esc(s.artist || '')} · Tom <b>${esc(shownKey(s))}</b>${s.capo ? ` · Capo ${s.capo}` : ''}</small></div></div>
        ${s.strum ? `<div class="strum"><span>Batida</span><b>${esc(s.strum)}</b></div>` : ''}
        <div class="stripbox">${store.prefs.showDiagrams ? chordsStrip(s) : ''}</div>
        <article class="sheet">${renderSheet(s.text, s.transpose || 0)}</article>
      </section>`).join('')}
      <div class="fim">Fim do repertório 🎶</div><div class="endpad"></div>
    </main>
    <div class="countdown" id="cd" hidden></div>
    <div class="stagebar bottom">
      <button data-a="prev" aria-label="Música anterior">⏮</button>
      <button data-a="sdown">−</button>
      <button data-a="play" class="big">▶</button>
      <button data-a="sup">+</button>
      <button data-a="next" aria-label="Próxima música">⏭</button>
      <span class="lbl">vel <b id="spd">${songs[0].speed || 20}</b></span>
    </div>`;
  const secs = [...$app.querySelectorAll('.stsong')];
  const cd = $app.querySelector('#cd');
  const findCur = () => {
    const line = window.scrollY + 90;
    let i = 0;
    secs.forEach((s, k) => { if (s.offsetTop <= line) i = k; });
    return i;
  };
  const updCur = () => {
    cur = findCur();
    if (cur !== lastCur) {
      $app.querySelector('#pos').textContent = `${cur + 1}/${songs.length}`;
      $app.querySelector('#nowt').textContent = songs[cur].title;
      $app.querySelector('#spd').textContent = songs[cur].speed || 20;
      if (scroller.playing && cur > lastCur && set.pause > 0) scroller.holdUntil = Date.now() + set.pause * 1000;
      lastCur = cur;
    }
    const left = Math.ceil((scroller.holdUntil - Date.now()) / 1000);
    cd.hidden = !(scroller.playing && left > 0);
    if (!cd.hidden) cd.textContent = `Próxima em ${left}…`;
  };
  scroller.getSpeed = () => (songs[cur].speed || 20) * fontScale();
  scroller.onTick = updCur;
  scroller.onState = (on) => { $app.querySelector('[data-a=play]').textContent = on ? '❚❚' : '▶'; updCur(); };
  window.onscroll = () => { if (location.hash.startsWith('#/play')) updCur(); };
  const goto = (i) => {
    i = Math.max(0, Math.min(songs.length - 1, i));
    const top = Math.max(0, secs[i].offsetTop - 64);
    scroller.holdUntil = 0;
    scroller.acc = top;
    window.scrollTo(0, top);
    updCur();
    scroller.holdUntil = 0;
  };
  $app.onclick = (e) => {
    const chord = e.target.closest('.chord');
    if (chord) { scroller.stop(); return showChord(chord.dataset.c); }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) { if (e.target.closest('.stagewrap')) scroller.toggle(); return; }
    if (a === 'play') scroller.toggle();
    if (a === 'inst') {
      const offset = window.scrollY - secs[cur].offsetTop;
      toggleInst();
      $app.querySelector('.stagebar.top [data-a=inst]').outerHTML = instBtn();
      $app.querySelectorAll('.stripbox').forEach((el, i) => (el.innerHTML = chordsStrip(songs[i])));
      const top = secs[cur].offsetTop + offset;
      scroller.acc = top;
      window.scrollTo(0, top);
    }
    if (a === 'prev') goto(cur - 1);
    if (a === 'next') goto(cur + 1);
    if (a === 'fup' || a === 'fdown') { store.savePrefs({ font: Math.max(10, Math.min(30, store.prefs.font + (a === 'fup' ? 1 : -1))) }); applyPrefs(); }
    if (a === 'sup' || a === 'sdown') {
      const s = songs[cur];
      store.patchSong(s.id, { speed: Math.max(2, Math.min(120, (s.speed || 20) + (a === 'sup' ? 2 : -2))) });
      $app.querySelector('#spd').textContent = s.speed;
    }
  };
}

// Ajustes
function viewConfig() {
  const base = location.href.split('#')[0];
  const bm = `javascript:(()=>{const p=document.querySelector('.cifra_cnt pre')||document.querySelector('pre');if(!p){alert('Nenhuma cifra encontrada nesta página.');return}const h=document.querySelector('h1'),a=document.querySelector('h2');const d={title:h?h.innerText:document.title,artist:a?a.innerText:'',text:p.innerText};window.open('${base}#/import/'+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(d))))))})()`;
  $app.innerHTML = header('Ajustes', null) + `
    <main class="wrap form">
      <h3>Aparência</h3>
      <div class="grp"><button class="btn ${store.prefs.theme === 'dark' ? 'primary' : ''}" data-theme="dark">Escuro</button><button class="btn ${store.prefs.theme === 'light' ? 'primary' : ''}" data-theme="light">Claro</button></div>
      <h3>Instrumento dos diagramas</h3>
      <div class="grp">${Object.entries(INSTRUMENTS).map(([k, n]) => `<button class="btn ${(store.prefs.instrument || 'guitar') === k ? 'primary' : ''}" data-inst="${k}">${k === 'uke' ? '🪕' : '🎸'} ${n}</button>`).join('')}</div>
      <p class="muted">Ukulele na afinação padrão G-C-E-A. A cifra é a mesma; só mudam os desenhos dos acordes.</p>
      <h3>Backup</h3>
      <p class="muted">Tudo fica salvo só neste aparelho. Exporte um backup para passar para outro celular/computador.</p>
      <div class="grp"><button class="btn" id="exp">⬇ Exportar backup</button><label class="btn">⬆ Importar backup<input type="file" id="imp" accept="application/json" hidden></label></div>
      <h3>Importar com 1 clique (computador)</h3>
      <p class="muted">Arraste o botão abaixo para a barra de favoritos. Abrindo uma cifra em um site, clique nele: a música vem pronta para salvar aqui.</p>
      <a class="btn primary" id="bm" href="#">🎸 Enviar para Minhas Cifras</a>
      <h3>Instalar no celular</h3>
      <p class="muted">No Chrome (Android): menu ⋮ → <b>Adicionar à tela inicial</b>. No Safari (iPhone): Compartilhar → <b>Adicionar à Tela de Início</b>. Funciona sem internet depois de aberto uma vez.</p>
      <p class="muted small">${store.songs.length} músicas · ${store.sets.length} repertórios</p>
    </main>` + nav('cfg');
  $app.querySelector('#bm').setAttribute('href', bm);
  $app.querySelector('#bm').addEventListener('click', (e) => { e.preventDefault(); toast('Arraste este botão para a barra de favoritos'); });
  $app.onclick = (e) => {
    const t = e.target.closest('[data-theme]');
    if (t) { store.savePrefs({ theme: t.dataset.theme }); applyPrefs(); viewConfig(); }
    const ib = e.target.closest('[data-inst]');
    if (ib) { store.savePrefs({ instrument: ib.dataset.inst }); viewConfig(); }
    if (e.target.id === 'exp') {
      const blob = new Blob([store.exportAll()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `minhas-cifras-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    }
  };
  $app.querySelector('#imp').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = store.importAll(await file.text());
      toast(`${r.ns} músicas e ${r.nl} repertórios importados`);
      viewConfig();
    } catch { toast('Arquivo inválido'); }
  });
}

// ---------- Boot ----------
applyPrefs();
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
