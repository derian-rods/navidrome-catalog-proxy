const form = document.querySelector('#searchForm');
const queryInput = document.querySelector('#query');
const resultsEl = document.querySelector('#results');
const statusEl = document.querySelector('#status');
const template = document.querySelector('#cardTemplate');

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
        const response = await fetch('/api/catalog/download', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourceId: id })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || 'Download failed');
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
  const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || payload.error || 'Search failed');
  renderResults(payload.results || []);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) {
    setStatus('Type something to search.', 'warn');
    return;
  }

  search(query).catch(error => {
    setStatus(error.message, 'error');
  });
});
