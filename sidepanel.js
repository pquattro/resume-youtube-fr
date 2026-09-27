import { videoIdFromUrl, getTranscript, segmentsToText, formatTimestamp } from './lib/transcript.js';
import { summarize } from './lib/summarize.js';
import { renderMarkdown } from './lib/markdown.js';
import { MistralError } from './lib/mistral.js';

const els = {
  title: document.getElementById('videoTitle'),
  meta: document.getElementById('videoMeta'),
  style: document.getElementById('style'),
  run: document.getElementById('runBtn'),
  status: document.getElementById('status'),
  output: document.getElementById('output'),
  footer: document.getElementById('footer'),
  footerHint: document.getElementById('footerHint'),
  copy: document.getElementById('copyBtn'),
  redo: document.getElementById('redoBtn'),
  settings: document.getElementById('settingsBtn')
};

const DEFAULTS = { apiKey: '', model: 'mistral-large-latest', style: 'standard' };

let current = { tabId: null, videoId: null, title: '', author: '' };
let running = false;
let controller = null;
let lastMarkdown = '';

const setStatus = (html, isError = false) => {
  if (!html) { els.status.hidden = true; els.status.textContent = ''; return; }
  els.status.hidden = false;
  els.status.classList.toggle('error', isError);
  els.status.innerHTML = html;
};

const busy = (label) => setStatus(`<span class="spinner"></span>${label}`);

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function renderOutput(md) {
  lastMarkdown = md;
  els.output.innerHTML = renderMarkdown(md);
  els.footer.hidden = !md;
}

async function refreshTarget() {
  const tab = await activeTab();
  const videoId = tab ? videoIdFromUrl(tab.url || '') : null;

  if (!videoId) {
    current = { tabId: null, videoId: null, title: '', author: '' };
    els.title.textContent = 'Aucune vidéo détectée';
    els.meta.textContent = "Ouvrez une vidéo YouTube dans l'onglet actif.";
    els.run.disabled = true;
    return;
  }

  if (videoId !== current.videoId) {
    els.output.innerHTML = '';
    els.footer.hidden = true;
    lastMarkdown = '';
    setStatus('');
  }

  current = { tabId: tab.id, videoId, title: tab.title?.replace(/ - YouTube$/, '') || '', author: '' };
  els.title.textContent = current.title || `Vidéo ${videoId}`;
  els.meta.textContent = 'Prêt à résumer.';
  els.run.disabled = running;

  const cached = await chrome.storage.local.get(`summary:${videoId}`);
  const entry = cached[`summary:${videoId}`];
  if (entry?.markdown && !lastMarkdown) {
    renderOutput(entry.markdown);
    els.footerHint.textContent = `Résumé en cache · ${entry.model || ''}`;
    setStatus('Résumé déjà généré pour cette vidéo. « Regénérer » pour le refaire.');
  }
}

async function run() {
  if (running) { controller?.abort(); return; }

  const cfg = await settings();
  if (!cfg.apiKey) {
    setStatus('Aucune clé API Mistral enregistrée. Ouvrez les <a href="#" id="openOpts">options</a> pour la saisir.', true);
    document.getElementById('openOpts')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }
  if (!current.videoId) { setStatus('Aucune vidéo YouTube dans l\'onglet actif.', true); return; }

  running = true;
  controller = new AbortController();
  els.run.textContent = 'Arrêter';
  els.output.innerHTML = '';
  els.footer.hidden = true;
  lastMarkdown = '';

  try {
    busy('Récupération de la transcription…');
    const data = await getTranscript({ videoId: current.videoId, tabId: current.tabId });

    if (!data.segments.length) {
      setStatus(
        "Transcription introuvable. L'extension lit le panneau « Transcription » de la page : vérifiez qu'il existe pour cette vidéo (déroulez la description, bouton « Afficher la transcription »). S'il est là, rechargez la page (Cmd+R) puis réessayez — le panneau doit être chargé. Sinon, la vidéo n'a tout simplement pas de sous-titres.",
        true
      );
      return;
    }

    if (data.title) { current.title = data.title; els.title.textContent = data.title; }
    current.author = data.author || current.author;

    const transcript = segmentsToText(data.segments);
    const duration = formatTimestamp(data.segments[data.segments.length - 1].t);
    els.meta.textContent = [current.author, `${duration} de transcription`, data.source].filter(Boolean).join(' · ');

    const style = els.style.value;
    await chrome.storage.local.set({ style });

    const markdown = await summarize({
      apiKey: cfg.apiKey,
      model: cfg.model,
      style,
      transcript,
      meta: { title: current.title, author: current.author, source: data.source },
      signal: controller.signal,
      onProgress: busy,
      onDelta: (_delta, full) => {
        setStatus('');
        renderOutput(full);
      }
    });

    renderOutput(markdown);
    setStatus('');
    els.footerHint.textContent = `${cfg.model} · ${Math.round(transcript.length / 1000)} k caractères analysés`;
    await chrome.storage.local.set({
      [`summary:${current.videoId}`]: { markdown, model: cfg.model, style, at: Date.now() }
    });
  } catch (err) {
    if (err?.name === 'AbortError') setStatus('Génération interrompue.');
    else if (err instanceof MistralError) setStatus(err.message, true);
    else setStatus(`Erreur : ${err?.message || err}`, true);
  } finally {
    running = false;
    controller = null;
    els.run.textContent = 'Résumer';
    els.run.disabled = !current.videoId;
  }
}

// Clic sur un horodatage -> navigation dans la vidéo.
els.output.addEventListener('click', (e) => {
  const link = e.target.closest('a.ts');
  if (!link) return;
  e.preventDefault();
  const seconds = Number(link.dataset.seconds);
  if (current.tabId != null && Number.isFinite(seconds)) {
    chrome.tabs.sendMessage(current.tabId, { type: 'YTR_SEEK', seconds }).catch(() => {});
  }
});

els.run.addEventListener('click', run);
els.redo.addEventListener('click', async () => {
  await chrome.storage.local.remove(`summary:${current.videoId}`);
  run();
});
els.copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(lastMarkdown);
  els.copy.textContent = 'Copié ✓';
  setTimeout(() => (els.copy.textContent = 'Copier'), 1500);
});
els.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.tabs.onActivated.addListener(refreshTarget);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === current.tabId || info.status === 'complete') refreshTarget();
});

(async () => {
  const cfg = await settings();
  els.style.value = cfg.style;
  await refreshTarget();
  if (!cfg.apiKey) {
    setStatus('Bienvenue. Renseignez votre clé API Mistral dans les <a href="#" id="openOpts">options</a> pour commencer.');
    document.getElementById('openOpts')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
})();
