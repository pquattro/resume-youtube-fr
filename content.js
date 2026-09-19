// Script injecté dans les pages YouTube : repli d'extraction de la transcription
// (lecture du panneau natif) et navigation dans la vidéo depuis le résumé.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function timeToSeconds(stamp) {
  const parts = String(stamp).trim().split(':').map((n) => parseInt(n, 10));
  if (parts.some(isNaN)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

function readSegments() {
  const nodes = document.querySelectorAll('ytd-transcript-segment-renderer');
  const segments = [];
  for (const node of nodes) {
    const text = node.querySelector('.segment-text, yt-formatted-string.segment-text')?.textContent?.trim();
    const stamp = node.querySelector('.segment-timestamp')?.textContent?.trim();
    if (!text) continue;
    segments.push({ t: timeToSeconds(stamp) ?? 0, text: text.replace(/\s+/g, ' ') });
  }
  return segments;
}

async function waitFor(fn, timeout = 6000, interval = 200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = fn();
    if (value && (!Array.isArray(value) || value.length)) return value;
    await sleep(interval);
  }
  return null;
}

function findTranscriptButton() {
  const direct = document.querySelector('ytd-video-description-transcript-section-renderer button');
  if (direct) return direct;
  const candidates = [...document.querySelectorAll('button, tp-yt-paper-button, yt-formatted-string')];
  return candidates.find((el) => {
    const label = `${el.getAttribute?.('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
    return /transcri(pt|ption)/.test(label);
  }) || null;
}

async function openTranscriptPanel() {
  if (document.querySelector('ytd-transcript-segment-renderer')) return true;

  let button = findTranscriptButton();
  if (!button) {
    // Le bouton vit dans la description, qu'il faut parfois déplier.
    const expand = document.querySelector('#description-inline-expander #expand, tp-yt-paper-button#expand, #expand');
    if (expand) { expand.click(); await sleep(600); }
    button = findTranscriptButton();
  }
  if (!button) return false;

  (button.closest('button') || button).click();
  const ok = await waitFor(() => document.querySelectorAll('ytd-transcript-segment-renderer').length, 8000);
  return Boolean(ok);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'YTR_GET_INFO') {
    sendResponse({
      ok: true,
      title:
        document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string')?.textContent?.trim() ||
        document.title.replace(/ - YouTube$/, ''),
      author: document.querySelector('#owner #channel-name a, ytd-channel-name a')?.textContent?.trim() || ''
    });
    return true;
  }

  if (msg?.type === 'YTR_SEEK') {
    const video = document.querySelector('video.html5-main-video, video');
    if (video && Number.isFinite(msg.seconds)) {
      video.currentTime = msg.seconds;
      video.play?.().catch(() => {});
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
    return true;
  }

  if (msg?.type === 'YTR_GET_TRANSCRIPT') {
    (async () => {
      try {
        const opened = await openTranscriptPanel();
        if (!opened) { sendResponse({ ok: false, error: 'panneau introuvable' }); return; }
        let segments = readSegments();
        // Le panneau se remplit progressivement : on attend la stabilisation.
        for (let i = 0; i < 12; i++) {
          await sleep(350);
          const next = readSegments();
          if (next.length === segments.length && segments.length) break;
          segments = next;
        }
        sendResponse({ ok: segments.length > 0, segments });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true; // réponse asynchrone
  }
});
