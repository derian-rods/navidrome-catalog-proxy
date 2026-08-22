const loginGate = document.querySelector('#loginGate');
const loginForm = document.querySelector('#loginForm');
const loginUser = document.querySelector('#loginUser');
const loginPassword = document.querySelector('#loginPassword');
const loginMessage = document.querySelector('#loginMessage');
const sessionUser = document.querySelector('#sessionUser');
const logoutButton = document.querySelector('#logout');
const form = document.querySelector('#searchForm');
const queryInput = document.querySelector('#query');
const searchMode = document.querySelector('#searchMode');
const resultLimit = document.querySelector('#resultLimit');
const collectionsEl = document.querySelector('#collections');
const resultsEl = document.querySelector('#results');
const statusEl = document.querySelector('#status');
const template = document.querySelector('#cardTemplate');
const collectionTemplate = document.querySelector('#collectionTemplate');
const rowTemplate = document.querySelector('#rowTemplate');
const downloadedList = document.querySelector('#downloadedList');
const quarantineList = document.querySelector('#quarantineList');
const downloadedFilter = document.querySelector('#downloadedFilter');
const albumPreview = document.querySelector('#albumPreview');

let downloadedTracks = [];

function credentials() {
  return {
    user: sessionStorage.getItem('catalogUser') || '',
    password: sessionStorage.getItem('catalogPassword') || ''
  };
}

function adminHeaders() {
  const auth = credentials();
  return {
    'content-type': 'application/json',
    'x-catalog-user': auth.user,
    'x-catalog-password': auth.password
  };
}

function updateLoginState() {
  const auth = credentials();
  const loggedIn = Boolean(auth.user && auth.password);
  loginGate.classList.toggle('hidden', loggedIn);
  document.body.classList.toggle('locked', !loggedIn);
  sessionUser.textContent = loggedIn ? auth.user : '';
}

function setStatus(message, tone = '') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return '';
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function sourceId(result) {
  return String(result.sourceId || result.id || '').replace(/^yt[:-]/, '');
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  return payload;
}

async function login(user, password) {
  const payload = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user, password })
  });
  sessionStorage.setItem('catalogUser', payload.user || user);
  sessionStorage.setItem('catalogPassword', password);
  updateLoginState();
  setStatus('Logged in with Navidrome.', 'success');
}

function setActiveTab(panelId) {
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.tab === panelId);
  for (const panel of document.querySelectorAll('.panel')) panel.classList.toggle('active', panel.id === panelId);
  if (panelId === 'downloadedPanel') loadDownloaded().catch(error => setStatus(error.message, 'error'));
  if (panelId === 'quarantinePanel') loadQuarantine().catch(error => setStatus(error.message, 'error'));
}

for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));

function songCard(result) {
  const node = template.content.firstElementChild.cloneNode(true);
  const id = sourceId(result);
  const title = result.title || id;
  const artist = result.artist || result.channel || 'YouTube';
  node.querySelector('.thumb').src = result.thumbnail || '';
  node.querySelector('.thumb').alt = title;
  node.querySelector('h2').textContent = title;
  node.querySelector('.artist').textContent = artist;
  node.querySelector('.duration').textContent = formatDuration(result.duration);
  node.querySelector('.watch').href = result.url || `https://www.youtube.com/watch?v=${id}`;
  const button = node.querySelector('.download');
  const message = node.querySelector('.message');
  button.addEventListener('click', () => downloadOne(id, button, message));
  return node;
}

async function downloadOne(id, button, message) {
  button.disabled = true;
  button.textContent = 'Downloading...';
  message.textContent = 'Downloading, tagging, saving, and rescanning Navidrome.';
  message.dataset.tone = '';
  try {
    const payload = await api('/api/catalog/download', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sourceId: id })
    });
    button.textContent = 'Downloaded';
    message.textContent = `Saved: ${payload.path}`;
    message.dataset.tone = 'success';
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Retry download';
    message.textContent = error.message;
    message.dataset.tone = 'error';
  }
}

function renderSongs(songs) {
  resultsEl.textContent = '';
  for (const song of songs) resultsEl.append(songCard(song));
}

function collectionCard(collection) {
  const node = collectionTemplate.content.firstElementChild.cloneNode(true);
  const title = collection.title || collection.sourceId;
  node.querySelector('h2').textContent = title;
  node.querySelector('.artist').textContent = `${collection.artist || collection.channel || 'YouTube'}${collection.entryCount ? ` - ${collection.entryCount} tracks` : ''}`;
  node.querySelector('.watch').href = collection.url || `https://www.youtube.com/watch?v=${sourceId(collection)}`;
  const message = node.querySelector('.message');
  const previewButton = node.querySelector('.preview');
  const downloadAll = node.querySelector('.download-all');
  previewButton.addEventListener('click', async () => {
    previewButton.disabled = true;
    message.textContent = 'Loading preview...';
    try {
      const payload = await previewUrl(collection.url || `https://www.youtube.com/watch?v=${sourceId(collection)}`);
      renderPreview(payload.preview);
      message.textContent = 'Preview loaded below.';
      message.dataset.tone = 'success';
    } catch (error) {
      message.textContent = error.message;
      message.dataset.tone = 'error';
    } finally {
      previewButton.disabled = false;
    }
  });
  downloadAll.addEventListener('click', async () => {
    downloadAll.disabled = true;
    message.textContent = 'Loading collection and downloading all...';
    try {
      const payload = await previewUrl(collection.url || `https://www.youtube.com/watch?v=${sourceId(collection)}`);
      await downloadBatch(payload.preview.entries || [], text => { message.textContent = text; });
      message.dataset.tone = 'success';
    } catch (error) {
      downloadAll.disabled = false;
      message.textContent = error.message;
      message.dataset.tone = 'error';
    }
  });
  return node;
}

function renderCollections(collections) {
  collectionsEl.textContent = '';
  if (collections.length) {
    const title = document.createElement('h2');
    title.className = 'results-title';
    title.textContent = 'Albums / Playlists';
    collectionsEl.append(title);
  }
  for (const collection of collections) collectionsEl.append(collectionCard(collection));
}

async function previewUrl(url) {
  return api('/api/catalog/preview-url', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ url })
  });
}

function renderPreview(preview) {
  albumPreview.textContent = '';
  const entries = preview.entries || [];
  const wrap = document.createElement('article');
  wrap.className = 'preview-card';
  const heading = document.createElement('div');
  heading.innerHTML = `<h2>${preview.title || 'YouTube collection'}</h2><p>${entries.length} track${entries.length === 1 ? '' : 's'} found${preview.uploader ? ` - ${preview.uploader}` : ''}</p>`;
  const downloadAll = document.createElement('button');
  downloadAll.type = 'button';
  downloadAll.textContent = 'Download all';
  const message = document.createElement('p');
  message.className = 'message';
  downloadAll.addEventListener('click', () => downloadBatch(entries, text => { message.textContent = text; }));
  const list = document.createElement('ol');
  list.className = 'preview-list';
  for (const entry of entries) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Download';
    const itemMessage = document.createElement('span');
    item.append(`${entry.title || entry.sourceId} ${entry.duration ? `(${formatDuration(entry.duration)})` : ''} `, button, itemMessage);
    button.addEventListener('click', () => downloadOne(sourceId(entry), button, itemMessage));
    list.append(item);
  }
  wrap.append(heading, downloadAll, message, list);
  albumPreview.append(wrap);
}

async function downloadBatch(entries, update) {
  const ids = entries.map(sourceId).filter(Boolean);
  if (!ids.length) throw new Error('No tracks to download');
  if (!confirm(`Download ${ids.length} tracks to Navidrome?`)) return;
  update(`Downloading ${ids.length} tracks. Keep this tab open.`);
  const payload = await api('/api/catalog/download-batch', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ sourceIds: ids })
  });
  const ok = payload.results.filter(result => result.ok).length;
  const failed = payload.results.length - ok;
  update(`Finished: ${ok} downloaded, ${failed} failed. Rescan ${payload.scanStarted ? 'started' : 'not started'}.`);
  setStatus(`Batch finished: ${ok} downloaded, ${failed} failed.`, failed ? 'warn' : 'success');
}

async function lookup(query) {
  setStatus('Searching...');
  albumPreview.textContent = '';
  collectionsEl.textContent = '';
  resultsEl.textContent = '';
  const payload = await api('/api/catalog/lookup', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ query, mode: searchMode.value, limit: Number(resultLimit.value) })
  });
  if (payload.preview) renderPreview(payload.preview);
  renderCollections(payload.collections || []);
  renderSongs(payload.songs || []);
  const total = (payload.collections || []).length + (payload.songs || []).length + (payload.preview?.entries?.length ? 1 : 0);
  setStatus(total ? 'Results loaded.' : 'No results found.', total ? '' : 'warn');
}

function trackTitle(track) {
  return track.title || track.meta?.title || track.sourceId;
}

function row(title, meta, pathText) {
  const node = rowTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('h3').textContent = title;
  node.querySelector('.row-meta').textContent = meta;
  node.querySelector('.row-path').textContent = pathText;
  return node;
}

function renderDownloaded() {
  const filter = downloadedFilter.value.trim().toLowerCase();
  const tracks = downloadedTracks.filter(track => `${trackTitle(track)} ${track.artist} ${track.album} ${track.path}`.toLowerCase().includes(filter));
  downloadedList.textContent = '';
  if (!tracks.length) {
    downloadedList.textContent = 'No downloaded tracks found.';
    return;
  }
  for (const track of tracks) {
    const state = track.quarantined ? 'quarantined' : track.exists ? 'downloaded' : 'missing';
    const node = row(trackTitle(track), `${track.artist || 'Unknown artist'} - ${track.album || 'Unknown album'} - ${state}`, track.path);
    const actions = node.querySelector('.row-actions');
    if (track.url) {
      const watch = document.createElement('a');
      watch.href = track.url;
      watch.target = '_blank';
      watch.rel = 'noreferrer';
      watch.textContent = 'YouTube';
      actions.append(watch);
    }
    const quarantine = document.createElement('button');
    quarantine.type = 'button';
    quarantine.textContent = 'Move to quarantine';
    quarantine.disabled = track.quarantined || !track.exists;
    quarantine.addEventListener('click', async () => {
      if (!confirm(`Move "${trackTitle(track)}" to quarantine?`)) return;
      quarantine.disabled = true;
      try {
        await api(`/api/catalog/downloaded/${encodeURIComponent(track.sourceId)}/quarantine`, { method: 'POST', headers: adminHeaders(), body: '{}' });
        setStatus('Moved to quarantine and rescan requested.', 'success');
        await loadDownloaded();
      } catch (error) {
        setStatus(error.message, 'error');
        quarantine.disabled = false;
      }
    });
    actions.append(quarantine);
    downloadedList.append(node);
  }
}

async function loadDownloaded() {
  setStatus('Loading downloaded tracks...');
  const payload = await api('/api/catalog/downloaded');
  downloadedTracks = payload.tracks || [];
  renderDownloaded();
  setStatus(`${downloadedTracks.length} downloaded track${downloadedTracks.length === 1 ? '' : 's'} loaded.`);
}

async function loadQuarantine() {
  setStatus('Loading quarantine...');
  const payload = await api('/api/catalog/quarantine');
  const candidates = payload.candidates || [];
  quarantineList.textContent = '';
  if (!candidates.length) {
    quarantineList.textContent = 'Quarantine is empty.';
    setStatus('Quarantine is empty.');
    return;
  }
  for (const candidate of candidates) {
    const node = row(candidate.sourceId, candidate.reason || 'manual quarantine', candidate.quarantinePath || candidate.originalPath);
    const actions = node.querySelector('.row-actions');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore';
    restore.addEventListener('click', async () => {
      try {
        await api(`/api/catalog/quarantine/${encodeURIComponent(candidate.sourceId)}/restore`, { method: 'POST', headers: adminHeaders(), body: '{}' });
        setStatus('Restored and rescan requested.', 'success');
        await loadQuarantine();
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = 'Delete forever';
    deleteButton.addEventListener('click', async () => {
      if (!confirm(`Delete ${candidate.sourceId} forever? This cannot be undone.`)) return;
      try {
        await api(`/api/catalog/quarantine/${encodeURIComponent(candidate.sourceId)}`, { method: 'DELETE', headers: adminHeaders() });
        setStatus('Deleted forever and rescan requested.', 'success');
        await loadQuarantine();
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
    actions.append(restore, deleteButton);
    quarantineList.append(node);
  }
  setStatus(`${candidates.length} quarantined track${candidates.length === 1 ? '' : 's'} loaded.`);
}

loginForm.addEventListener('submit', event => {
  event.preventDefault();
  loginMessage.textContent = 'Checking login...';
  login(loginUser.value.trim(), loginPassword.value).catch(error => {
    loginMessage.textContent = error.message;
    loginMessage.dataset.tone = 'error';
  });
});

logoutButton.addEventListener('click', () => {
  sessionStorage.removeItem('catalogUser');
  sessionStorage.removeItem('catalogPassword');
  updateLoginState();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return setStatus('Type or paste something to search.', 'warn');
  lookup(query).catch(error => setStatus(error.message, 'error'));
});

downloadedFilter.addEventListener('input', renderDownloaded);
document.querySelector('#refreshDownloaded').addEventListener('click', () => loadDownloaded().catch(error => setStatus(error.message, 'error')));
document.querySelector('#refreshQuarantine').addEventListener('click', () => loadQuarantine().catch(error => setStatus(error.message, 'error')));
document.querySelector('#rescanNow').addEventListener('click', async () => {
  try {
    await api('/api/catalog/rescan', { method: 'POST', headers: adminHeaders(), body: '{}' });
    setStatus('Navidrome rescan requested.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

updateLoginState();
