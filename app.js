const PATHS = {
  canciones: 'todo/canciones.json',
  letras:    'todo/letras.json',
  buscar:    'todo/buscar.json'
};

const STORAGE_KEY = 'letras_app_songs_v3';
const RECENT_KEY  = 'letras_app_recent_v3';

let songs = [];
let currentId = null;
let editingId = null;
let autoOn = false;
let rafId = null;
let searchTemplate = '';
let currentFilter = 'all';

const $ = id => document.getElementById(id);
const songListEl = $('songList');
const songCountEl = $('songCount');
const searchEl   = $('search');
const lyricsEl   = $('lyrics');
const lyricsWrap = $('lyricsWrap');
const titleEl    = $('songTitle');
const mobileCur  = $('mobileCur');
const autoBtn    = $('autoBtn');
const speedFrame = $('speedFrame');
const speedEl    = $('speed');
const speedVal   = $('speedVal');
const playPauseBtn = $('playPauseBtn');
const modalBg    = $('modalBg');
const modalTitle = $('modalTitle');
const inTitle    = $('inTitle');
const inLyrics   = $('inLyrics');
const sidebar    = $('sidebar');
const overlay    = $('overlay');
const menuToggle = $('menuToggle');

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    songs = raw ? JSON.parse(raw) : [];
  } catch { songs = []; }
}
function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function pushRecent(id) {
  let r = getRecent().filter(x => x !== id);
  r.unshift(id);
  r = r.slice(0, 25);
  localStorage.setItem(RECENT_KEY, JSON.stringify(r));
}

async function loadJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn('No se pudo cargar', url, e.message);
    return null;
  }
}

function slug(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clasificarLetra(texto) {
  if (!texto) return 'empty';
  const t = texto.trim();
  if (!t) return 'empty';
  if (t.length < 200) return 'bad';
  const lower = t.toLowerCase();
  const basura = [
    'contributors',
    'sencillos del mes',
    'letras.com',
    'lyrics',
    'this lyrics is not',
    'no lyrics',
    'letra no disponible',
    'no disponible'
  ];
  for (const b of basura) {
    if (lower.includes(b)) return 'bad';
  }
  const lineas = t.split('\n').filter(l => l.trim()).length;
  if (lineas < 3) return 'bad';
  return 'good';
}

async function bootstrap() {
  loadLocal();

  const canciones = await loadJson(PATHS.canciones);
  if (Array.isArray(canciones)) {
    const normalized = canciones.map((c, i) => {
      if (typeof c === 'string') {
        return { id: slug(c) + '_' + i, name: c, lyrics: '' };
      }
      return {
        id: c.id || slug(c.nombre || c.name || '') + '_' + i,
        name: c.nombre || c.name || 'Sin titulo',
        lyrics: ''
      };
    });
    const map = new Map();
    normalized.forEach(s => map.set(s.id, s));
    songs.forEach(s => map.set(s.id, s));
    songs = Array.from(map.values());
  }

  const letras = await loadJson(PATHS.letras);
  if (letras && typeof letras === 'object') {
    songs.forEach(s => {
      if (letras[s.id]) s.lyrics = letras[s.id];
      else if (letras[s.name]) s.lyrics = letras[s.name];
    });
  }

  const buscar = await loadJson(PATHS.buscar);
  if (buscar) {
    searchTemplate = typeof buscar === 'string'
      ? buscar
      : (buscar.url || buscar.template || '');
  }

  saveLocal();
  renderList();

  const recent = getRecent();
  if (recent.length && songs.find(s => s.id === recent[0])) {
    selectSong(recent[0]);
  }
}

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  let visible = songs.slice();
  visible.sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );
  if (q) visible = visible.filter(s => s.name.toLowerCase().includes(q));
  if (currentFilter !== 'all') {
    visible = visible.filter(s => clasificarLetra(s.lyrics) === currentFilter);
  }

  songListEl.innerHTML = '';
  songCountEl.textContent = songs.length;

  if (!visible.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = songs.length
      ? 'Sin resultados en este filtro'
      : 'Sin canciones. Pulsa + para agregar.';
    songListEl.appendChild(li);
    return;
  }

  visible.forEach(song => {
    const li = document.createElement('li');
    li.dataset.id = song.id;
    if (song.id === currentId) li.classList.add('active');
    const tipo = clasificarLetra(song.lyrics);
    li.classList.add(
      tipo === 'good' ? 'has-lyrics' :
      tipo === 'bad'  ? 'bad-lyrics' :
                        'no-lyrics'
    );

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = song.name;

    const edit = document.createElement('button');
    edit.className = 'edit';
    edit.textContent = '\u270E';
    edit.title = 'Editar letra';
    edit.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(song);
    });

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '\u00D7';
    del.title = 'Eliminar';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Eliminar "' + song.name + '"?')) return;
      songs = songs.filter(s => s.id !== song.id);
      if (currentId === song.id) {
        currentId = null;
        titleEl.textContent = 'Selecciona una cancion';
        titleEl.classList.add('muted');
        mobileCur.textContent = 'Sin seleccion';
        lyricsEl.textContent = 'Selecciona una cancion para ver la letra.';
        lyricsEl.classList.add('placeholder');
      }
      saveLocal();
      renderList();
    });

    li.appendChild(name);
    li.appendChild(edit);
    li.appendChild(del);
    li.addEventListener('click', () => {
      selectSong(song.id);
      closeSidebarMobile();
    });
    songListEl.appendChild(li);
  });
}

function selectSong(id) {
  const song = songs.find(s => s.id === id);
  if (!song) return;

  currentId = id;
  titleEl.textContent = song.name;
  titleEl.classList.remove('muted');
  mobileCur.textContent = song.name;

  lyricsEl.classList.remove('placeholder');

  const txt = (song.lyrics || '').trim();
  if (txt) {
    lyricsEl.textContent = txt;
  } else {
    lyricsEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.color = 'var(--muted)';
    msg.textContent = 'Sin letra guardada.';
    lyricsEl.appendChild(msg);

    if (searchTemplate) {
      const a = document.createElement('a');
      a.href = searchTemplate.replace('{query}', encodeURIComponent(song.name));
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Buscar letra en la web';
      a.style.cssText = 'display:inline-block;margin-top:14px;color:var(--accent);text-decoration:none;font-size:.85rem;border:1px solid var(--border);padding:8px 14px;border-radius:4px;';
      lyricsEl.appendChild(a);
    }
  }

  lyricsWrap.scrollTop = 0;
  pushRecent(id);
  renderList();
  stopAuto();
}

function startAuto() {
  if (autoOn) return;
  if (!currentId) return;
  autoOn = true;
  playPauseBtn.classList.remove('paused');
  playPauseBtn.title = 'Pausar';

  let last = performance.now();
  const step = (now) => {
    if (!autoOn) return;
    const dt = (now - last) / 1000;
    last = now;
    const speed = Number(speedEl.value);
    const pxPerSec = speed * 0.7;
    lyricsWrap.scrollTop += pxPerSec * dt;

    if (lyricsWrap.scrollTop + lyricsWrap.clientHeight >= lyricsWrap.scrollHeight - 1) {
      pauseAuto();
      return;
    }
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function pauseAuto() {
  autoOn = false;
  playPauseBtn.classList.add('paused');
  playPauseBtn.title = 'Reproducir';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function stopAuto() {
  autoOn = false;
  playPauseBtn.classList.add('paused');
  playPauseBtn.title = 'Reproducir';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

autoBtn.addEventListener('click', () => {
  if (speedFrame.classList.contains('show')) {
    speedFrame.classList.remove('show');
    autoBtn.classList.remove('active');
  } else {
    speedFrame.classList.add('show');
    autoBtn.classList.add('active');
  }
});

playPauseBtn.addEventListener('click', () => {
  if (!currentId) { alert('Selecciona una cancion primero'); return; }
  if (autoOn) pauseAuto();
  else startAuto();
});

speedEl.addEventListener('input', () => {
  speedVal.textContent = speedEl.value;
});

lyricsWrap.addEventListener('wheel', () => {
  if (autoOn) pauseAuto();
}, { passive: true });

lyricsWrap.addEventListener('touchstart', () => {
  if (autoOn) pauseAuto();
}, { passive: true });

function openModal(song = null) {
  editingId = song ? song.id : null;
  modalTitle.textContent = song ? 'Editar letra' : 'Agregar cancion';
  inTitle.value = song ? song.name : '';
  inLyrics.value = song ? (song.lyrics || '') : '';
  modalBg.classList.add('show');
  setTimeout(() => {
    if (song) inLyrics.focus();
    else inTitle.focus();
  }, 30);
}
function closeModal() {
  modalBg.classList.remove('show');
  editingId = null;
  inTitle.value = '';
  inLyrics.value = '';
}
$('openAdd').addEventListener('click', () => openModal());
$('cancelBtn').addEventListener('click', closeModal);
modalBg.addEventListener('click', e => { if (e.target === modalBg) closeModal(); });

$('saveBtn').addEventListener('click', () => {
  const name = inTitle.value.trim();
  const lyrics = inLyrics.value;
  if (!name) { alert('Ponle un nombre'); return; }

  if (editingId) {
    const s = songs.find(x => x.id === editingId);
    if (s) { s.name = name; s.lyrics = lyrics; }
    saveLocal();
    renderList();
    if (currentId === editingId) selectSong(editingId);
    closeModal();
    return;
  }

  const id = slug(name) + '_' + Date.now().toString(36);
  songs.push({ id, name, lyrics });
  saveLocal();
  renderList();
  closeModal();
  selectSong(id);
});

document.querySelectorAll('.filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

$('exportBtn').addEventListener('click', () => {
  const exportObj = {};
  const ordenado = songs.slice().sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );
  ordenado.forEach(s => {
    exportObj[s.id] = s.lyrics || '';
  });
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'letras.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

titleEl.addEventListener('dblclick', () => {
  if (!currentId) return;
  const s = songs.find(x => x.id === currentId);
  if (s) openModal(s);
});

function openSidebarMobile() {
  sidebar.classList.add('open');
  overlay.classList.add('show');
}
function closeSidebarMobile() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}
menuToggle.addEventListener('click', () => {
  if (sidebar.classList.contains('open')) closeSidebarMobile();
  else openSidebarMobile();
});
overlay.addEventListener('click', closeSidebarMobile);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (modalBg.classList.contains('show')) closeModal();
    else closeSidebarMobile();
  }
  const tag = document.activeElement.tagName;
  if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    e.preventDefault();
    if (!speedFrame.classList.contains('show')) {
      speedFrame.classList.add('show');
      autoBtn.classList.add('active');
    }
    if (autoOn) pauseAuto();
    else if (currentId) startAuto();
  }
});

searchEl.addEventListener('input', renderList);

bootstrap();
