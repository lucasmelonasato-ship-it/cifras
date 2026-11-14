// Teoria de acordes: parsing, transposição, detecção de linhas e diagramas de violão.

const NOTE_INDEX = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
// Convenção usual em cifras brasileiras
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

const CHORD_RE = /^([A-G](?:#|b)?)((?:maj|min|dim|aug|sus|add|m|M|°|º|ø|\+|-|\d|#|b|\(|\)|,|\/(?=\d))*)(?:\/([A-G](?:#|b)?))?$/;

export function parseChord(token) {
  const m = CHORD_RE.exec(token);
  if (!m) return null;
  return { root: m[1], suffix: m[2] || '', bass: m[3] || null };
}

function stripParens(t) {
  const m = /^(\(?)(.*?)(\)?)$/.exec(t);
  return { pre: m[1], core: m[2], post: m[3] };
}

export function isChordToken(t) {
  const { core } = stripParens(t);
  return core.length > 0 && parseChord(core) !== null;
}

const IGNORABLE = /^(\|+|:?\|\|?:?|x\d+|\d+x|\(\d+x\)|\(x\d+\)|-+|\(|\)|\/|%|\.{2,}|n\.?c\.?|>|→)$/i;

export function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let chords = 0;
  for (const t of tokens) {
    if (isChordToken(t)) chords++;
    else if (!IGNORABLE.test(t)) return false;
  }
  return chords > 0;
}

export function isTabLine(line) {
  return /^\s*[EADGBe]\s*[|:].*-/.test(line) || /^\s*\|?-{3,}.*\|/.test(line);
}

export function noteName(i) {
  return NOTE_NAMES[((i % 12) + 12) % 12];
}

export function transposeNote(n, semis) {
  const i = NOTE_INDEX[n];
  if (i === undefined) return n;
  return noteName(i + semis);
}

export function transposeChord(token, semis) {
  if (!semis) return token;
  const { pre, core, post } = stripParens(token);
  const c = parseChord(core);
  if (!c) return token;
  let out = transposeNote(c.root, semis) + c.suffix;
  if (c.bass) out += '/' + transposeNote(c.bass, semis);
  return pre + out + post;
}

// Re-renderiza uma linha de acordes mantendo cada acorde na sua coluna original.
// Retorna lista de segmentos {text, chord?}
export function layoutChordLine(line, semis) {
  const segs = [];
  const re = /\S+/g;
  let m, cursor = 0, first = true;
  while ((m = re.exec(line))) {
    const tok = m[0];
    const isChord = isChordToken(tok);
    const text = isChord ? transposeChord(tok, semis) : tok;
    let start = first ? m.index : Math.max(m.index, cursor + 1);
    if (start > cursor) segs.push({ text: ' '.repeat(start - cursor) });
    segs.push({ text, chord: isChord ? stripParens(text).core : null });
    cursor = start + text.length;
    first = false;
  }
  return segs;
}

export function firstChord(text) {
  for (const line of text.split('\n')) {
    const body = line.replace(/^\s*\[[^\]]*\]/, '');
    if (isChordLine(body)) {
      const tok = body.trim().split(/\s+/).find(isChordToken);
      if (tok) return stripParens(tok).core;
    }
  }
  return null;
}

export function keyOf(chord) {
  const c = parseChord(chord || '');
  if (!c) return '';
  const minor = /^(m(?!aj)|min|-)/.test(c.suffix);
  return c.root + (minor ? 'm' : '');
}

export function collectChords(text, semis) {
  const set = new Set();
  for (const line of text.split('\n')) {
    const body = line.replace(/^\s*\[[^\]]*\]/, '');
    if (!isChordLine(body)) continue;
    for (const t of body.trim().split(/\s+/)) {
      if (isChordToken(t)) set.add(stripParens(transposeChord(t, semis)).core);
    }
  }
  return [...set];
}

// ---------- Diagramas ----------

function quality(suffix) {
  const s = suffix.replace(/\s/g, '');
  const map = {
    '': 'maj', M: 'maj', maj: 'maj',
    m: 'm', min: 'm', '-': 'm',
    7: '7', m7: 'm7', min7: 'm7', '-7': 'm7',
    '7M': 'maj7', maj7: 'maj7', M7: 'maj7', '7+': 'maj7',
    sus4: 'sus4', 4: 'sus4', sus: 'sus4', sus2: 'sus2', 2: 'sus2',
    dim: 'dim', '°': 'dim', 'º': 'dim', dim7: 'dim7', '°7': 'dim7', 'º7': 'dim7',
    'm7(b5)': 'm7b5', m7b5: 'm7b5', 'ø': 'm7b5', 'm7(5-)': 'm7b5',
    aug: 'aug', '+': 'aug', '5+': 'aug', '(#5)': 'aug',
    6: '6', m6: 'm6',
    9: 'add9', add9: 'add9', '(9)': 'add9', '(add9)': 'add9',
    'm(9)': 'madd9', madd9: 'madd9', m9: 'madd9', 'm(add9)': 'madd9',
    '7(9)': '9', '9(7)': '9',
    '7(4)': '7sus4', '7sus4': '7sus4', '4(7)': '7sus4', '7/4': '7sus4', '7sus': '7sus4',
    'm(7M)': 'mmaj7', m7M: 'mmaj7', mmaj7: 'mmaj7', 'm(maj7)': 'mmaj7',
  };
  if (map[s] !== undefined) return map[s];
  const minor = /^(m(?!aj)|min|-)/.test(s);
  if (/7M|maj7/.test(s)) return minor ? 'mmaj7' : 'maj7';
  if (/7/.test(s)) return minor ? 'm7' : '7';
  return minor ? 'm' : 'maj';
}

// offsets relativos à casa da pestana (null = corda não tocada), cordas 6 → 1
const E_SHAPES = {
  maj: [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0], '7sus4': [0, 2, 0, 2, 0, 0],
  6: [0, 2, 2, 1, 2, 0], m6: [0, 2, 2, 0, 2, 0], aug: [0, 3, 2, 1, 1, 0],
  m7b5: [0, null, 0, 0, -1, null], dim7: [0, null, -1, 0, -1, null],
  mmaj7: [0, 2, 1, 0, 0, 0], madd9: [0, 2, 4, 0, 0, 0],
};
const A_SHAPES = {
  maj: [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], 7: [null, 0, 2, 0, 2, 0], m7: [null, 0, 2, 0, 1, 0],
  maj7: [null, 0, 2, 1, 2, 0], sus2: [null, 0, 2, 2, 0, 0], sus4: [null, 0, 2, 2, 3, 0],
  '7sus4': [null, 0, 2, 0, 3, 0], dim: [null, 0, 1, 2, 1, null], m7b5: [null, 0, 1, 0, 1, null],
  dim7: [null, 0, 1, -1, 1, null], aug: [null, 0, -1, -2, -2, null], 9: [null, 0, -1, 0, 0, 0],
  6: [null, 0, 2, 2, 2, 2], m6: [null, 0, 2, -1, 1, 0], add9: [null, 0, 2, 4, 2, 0],
  mmaj7: [null, 0, 2, 1, 1, 0], madd9: [null, 0, 2, 4, 1, 0],
};
const OPEN = {
  'C:maj': 'x32010', 'C:7': 'x32310', 'C:maj7': 'x32000', 'C:add9': 'x32030', 'C:6': 'x32210',
  'D:maj': 'xx0232', 'D:m': 'xx0231', 'D:7': 'xx0212', 'D:m7': 'xx0211', 'D:maj7': 'xx0222',
  'D:sus4': 'xx0233', 'D:sus2': 'xx0230', 'D:add9': 'xx0230', 'D:7sus4': 'xx0213',
  'G:maj': '320003', 'G:7': '320001', 'G:maj7': '320002', 'G:6': '320000', 'G:add9': '320203',
  'E:add9': '024100', 'B:7': 'x21202', 'F:maj7': 'xx3210',
};

function fromString(s) {
  return s.split('').map((c) => (c === 'x' ? null : Number(c)));
}

function guitarShape(chord) {
  const c = parseChord(chord);
  if (!c) return null;
  const q = quality(c.suffix);
  const r = NOTE_INDEX[c.root];
  const cands = [];
  const known = E_SHAPES[q] || A_SHAPES[q];
  const qq = known ? q : (q.startsWith('m') && q !== 'maj7' ? 'm' : 'maj');
  const open = OPEN[`${noteName(r)}:${q}`];
  if (open) cands.push({ frets: fromString(open), barre: null, score: -1 });
  const add = (shapes, base) => {
    const sh = shapes[qq];
    if (!sh) return;
    const f = (((r - base) % 12) + 12) % 12;
    const frets = sh.map((o) => (o === null ? null : f + o));
    if (frets.some((x) => x !== null && x < 0)) return;
    cands.push({ frets, barre: f > 0 ? f : null, score: f });
  };
  add(E_SHAPES, 4);
  add(A_SHAPES, 9);
  if (!cands.length) return null;
  cands.sort((a, b) => a.score - b.score);
  return { ...cands[0], bass: c.bass };
}


// ---------- Ukulele (afinação padrão G C E A, cordas 4 → 1) ----------
// Formas abertas de referência por qualidade: [tônica, casas]. Qualquer outro tom é
// obtido subindo a forma inteira no braço (pestana na casa k).
const UKE_TEMPLATES = {
  maj: [['C', '0003'], ['A', '2100'], ['G', '0232'], ['F', '2010'], ['D', '2220']],
  m: [['A', '2000'], ['D', '2210'], ['G', '0231'], ['E', '0432'], ['C', '0333'], ['F#', '2120'], ['C#', '1104'], ['B', '4222']],
  7: [['C', '0001'], ['A', '0100'], ['G', '0212'], ['D', '2223'], ['E', '1202']],
  m7: [['A', '0000'], ['D', '2213'], ['G', '0211'], ['E', '0202']],
  maj7: [['C', '0002'], ['A', '1100'], ['G', '0222'], ['F', '2410']],
  sus4: [['C', '0013'], ['A', '2200'], ['D', '0230'], ['G', '0233']],
  sus2: [['C', '0233'], ['D', '2200'], ['G', '0230']],
  dim: [['C', '2323']],
  dim7: [['C', '2323']],
  m7b5: [['C', '3323'], ['A', '2333'], ['B', '2212']],
  aug: [['C', '1003']],
  6: [['C', '0000'], ['G', '0202']],
  m6: [['C', '2333']],
  add9: [['C', '0203']],
  madd9: [['A', '2000']],
  9: [['C', '0201']],
  '7sus4': [['C', '0011'], ['G', '0213']],
  mmaj7: [['C', '0332']],
};

function ukeShape(chord) {
  const c = parseChord(chord);
  if (!c) return null;
  const q = quality(c.suffix);
  const list = UKE_TEMPLATES[q] || UKE_TEMPLATES[q.startsWith('m') && q !== 'maj7' ? 'm' : 'maj'];
  const r = NOTE_INDEX[c.root];
  const cands = list.map(([root, str]) => {
    const k = (((r - NOTE_INDEX[root]) % 12) + 12) % 12;
    const frets = str.split('').map((f) => Number(f) + k);
    return { frets, barre: k > 0 && str.includes('0') ? k : null, score: Math.max(...frets) * 100 + frets.reduce((a, f) => a + f, 0) };
  });
  cands.sort((a, b) => a.score - b.score);
  return { ...cands[0], bass: c.bass };
}

export const INSTRUMENTS = { guitar: 'Violão', uke: 'Ukulele' };

export function chordShape(chord, inst = 'guitar') {
  return inst === 'uke' ? ukeShape(chord) : guitarShape(chord);
}

export function chordSVG(chord, inst = 'guitar') {
  const shape = chordShape(chord, inst);
  const N = inst === 'uke' ? 4 : 6;
  const W = 92, H = 112, gap = inst === 'uke' ? 16 : 12, left = (W - gap * (N - 1)) / 2 - 4, top = 26, fretH = 16, nFrets = 5;
  if (!shape) {
    return `<svg viewBox="0 0 ${W} ${H}" class="diagram"><text x="${W / 2}" y="14" class="dg-name">${esc(chord)}</text><text x="${W / 2}" y="60" class="dg-small">sem diagrama</text></svg>`;
  }
  const played = shape.frets.filter((f) => f !== null && f > 0);
  const maxF = played.length ? Math.max(...played) : 0;
  const minF = played.length ? Math.min(...played) : 0;
  const base = maxF > nFrets ? minF : 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="Acorde ${esc(chord)} (${INSTRUMENTS[inst]})">`;
  s += `<text x="${W / 2}" y="12" class="dg-name">${esc(chord)}</text>`;
  // trastes
  for (let i = 0; i <= nFrets; i++) {
    const y = top + i * fretH;
    s += `<line x1="${left}" y1="${y}" x2="${left + gap * (N - 1)}" y2="${y}" class="${i === 0 && base === 1 ? 'dg-nut' : 'dg-line'}"/>`;
  }
  for (let i = 0; i < N; i++) {
    const x = left + i * gap;
    s += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + nFrets * fretH}" class="dg-line"/>`;
  }
  if (base > 1) s += `<text x="${left + gap * (N - 1) + 5}" y="${top + fretH * 0.7}" class="dg-fret">${base}</text>`;
  // pestana
  let barreDrawn = null;
  if (shape.barre) {
    const idx = shape.frets.map((f, i) => (f === shape.barre ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2) {
      const a = Math.min(...idx), b = Math.max(...idx);
      const y = top + (shape.barre - base + 0.5) * fretH;
      s += `<rect x="${left + a * gap - 5}" y="${y - 5}" width="${(b - a) * gap + 10}" height="10" rx="5" class="dg-dot"/>`;
      barreDrawn = shape.barre;
    }
  }
  shape.frets.forEach((f, i) => {
    const x = left + i * gap;
    if (f === null) s += `<text x="${x}" y="${top - 4}" class="dg-mark">×</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${top - 8}" r="3.5" class="dg-open"/>`;
    else if (f !== barreDrawn) s += `<circle cx="${x}" cy="${top + (f - base + 0.5) * fretH}" r="5" class="dg-dot"/>`;
  });
  if (shape.bass) s += `<text x="${W / 2}" y="${H - 1}" class="dg-small">baixo em ${esc(shape.bass)}</text>`;
  return s + '</svg>';
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
