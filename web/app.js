const form = document.querySelector('#searchForm');
const queryInput = document.querySelector('#query');
const resultsEl = document.querySelector('#results');
const statusEl = document.querySelector('#status');
const template = document.querySelector('#cardTemplate');
const rowTemplate = document.querySelector('#rowTemplate');
const adminPasswordInput = document.querySelector('#adminPassword');
const downloadedList = document.querySelector('#downloadedList');
const quarantineList = document.querySelector('#quarantineList');
const downloadedFilter = document.querySelector('#downloadedFilter');

let downloadedTracks = [];

adminPasswordInput.value = sessionStorage.getItem('catalogAdminPassword') || '';
adminPasswordInput.addEventListener('input', () => {
  sessionStorage.setItem('catalogAdminPassword', adminPasswordInput.value);
});

function adminHeaders() {
  return {
    'content-type': 'application/json',
    'x-catalog-password': adminPasswordInput.value
  };
}

function setStatus(message, tone = '') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return '';
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
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

function setActiveTab(panelId) {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === panelId);
  }
  for (const panel of document.querySelectorAll('.panel')) {
    panel.classList.toggle('active', panel.id === panelId);
  }
  if (panelId === 'downloadedPanel') loadDownloaded();
  if (panelId === 'quarantinePanel') loadQuarantine();
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
}

function renderResults(results) {
  resultsEl.textContent = '';
  if (results.length === 0) {
    setStatus('No results found.', 'warn');
    return;
  }

  setStatus(`${results.length} result${results.length === 1 ? '' : 's'} found.`);
  for (const result of results) {
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
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Downloading...';
      message.textContent = 'Downloading, tagging, saving, and rescanning Navidrome. This can take a minute.';
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
    });

    resultsEl.append(node);
  }
}

async function search(query) {
  setStatus('Searching YouTube...');
  resultsEl.textContent = '';
  const payload = await api(`/api/catalog/search?q=${encodeURIComponent(query)}`);
  renderResults(payload.results || []);
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
  const tracks = downloadedTracks.filter(track => {
    const haystack = `${trackTitle(track)} ${track.artist} ${track.album} ${track.path}`.toLowerCase();
    return !filter || haystack.includes(filter);
  });
  downloadedList.textContent = '';
  if (tracks.length === 0) {
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
        await api(`/api/catalog/downloaded/${encodeURIComponent(track.sourceId)}/quarantine`, {
          method: 'POST',
          headers: adminHeaders(),
          body: '{}'
        });
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
  if (candidates.length === 0) {
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
        await api(`/api/catalog/quarantine/${encodeURIComponent(candidate.sourceId)}/restore`, {
          method: 'POST',
          headers: adminHeaders(),
          body: '{}'
        });
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
        await api(`/api/catalog/quarantine/${encodeURIComponent(candidate.sourceId)}`, {
          method: 'DELETE',
          headers: adminHeaders()
        });
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

form.addEventListener('submit', event => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) {
    setStatus('Type something to search.', 'warn');
    return;
  }
  search(query).catch(error => setStatus(error.message, 'error'));
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
