// Persistência local (no próprio aparelho). Sem servidor, sem conta, sem anúncio.
import { SEED_SONGS } from './seed.js';

const K = { songs: 'cifras.songs', sets: 'cifras.setlists', prefs: 'cifras.prefs', seeded: 'cifras.seeded' };

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    alert('Não foi possível salvar no aparelho: ' + e.message);
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const state = {
  songs: load(K.songs, []),
  sets: load(K.sets, []),
  prefs: load(K.prefs, { font: 16, theme: 'dark', showDiagrams: true }),
};

if (!load(K.seeded, false) && state.songs.length === 0) {
  state.songs = SEED_SONGS.map((s) => ({ ...s, id: uid(), createdAt: Date.now() }));
  save(K.songs, state.songs);
  save(K.seeded, true);
}

export const store = {
  get songs() {
    return state.songs;
  },
  get sets() {
    return state.sets;
  },
  get prefs() {
    return state.prefs;
  },
  song: (id) => state.songs.find((s) => s.id === id),
  set: (id) => state.sets.find((s) => s.id === id),
  saveSong(song) {
    const i = state.songs.findIndex((s) => s.id === song.id);
    song.updatedAt = Date.now();
    if (i >= 0) state.songs[i] = song;
    else state.songs.push({ ...song, createdAt: Date.now() });
    save(K.songs, state.songs);
    return song;
  },
  patchSong(id, patch) {
    const s = this.song(id);
    if (!s) return;
    Object.assign(s, patch);
    save(K.songs, state.songs);
  },
  deleteSong(id) {
    state.songs = state.songs.filter((s) => s.id !== id);
    state.sets.forEach((l) => (l.items = l.items.filter((x) => x !== id)));
    save(K.songs, state.songs);
    save(K.sets, state.sets);
  },
  saveSet(set) {
    const i = state.sets.findIndex((s) => s.id === set.id);
    set.updatedAt = Date.now();
    if (i >= 0) state.sets[i] = set;
    else state.sets.push(set);
    save(K.sets, state.sets);
    return set;
  },
  deleteSet(id) {
    state.sets = state.sets.filter((s) => s.id !== id);
    save(K.sets, state.sets);
  },
  savePrefs(p) {
    Object.assign(state.prefs, p);
    save(K.prefs, state.prefs);
  },
  exportAll() {
    return JSON.stringify({ app: 'cifras', version: 1, exportedAt: new Date().toISOString(), songs: state.songs, setlists: state.sets }, null, 2);
  },
  importAll(json) {
    const data = JSON.parse(json);
    let ns = 0, nl = 0;
    for (const s of data.songs || []) {
      if (!state.songs.some((x) => x.id === s.id)) {
        state.songs.push(s);
        ns++;
      }
    }
    for (const l of data.setlists || []) {
      if (!state.sets.some((x) => x.id === l.id)) {
        state.sets.push(l);
        nl++;
      }
    }
    save(K.songs, state.songs);
    save(K.sets, state.sets);
    return { ns, nl };
  },
};
