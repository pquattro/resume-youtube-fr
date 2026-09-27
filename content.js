// Script injecté dans les pages YouTube.
// Route principale d'extraction : le panneau « Transcription » de la page.
// (La route timedtext, historiquement primaire, renvoie un corps vide depuis
//  septembre 2026 — YouTube exige un jeton de provenance qu'on ne peut pas forger.)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Deux générations d'interface YouTube.
const SEGMENT_SELECTORS = [
  'transcript-segment-view-model',   // depuis sept. 2026
  'ytd-transcript-segment-renderer'  // ancienne interface
];

// Libellés du bouton d'ouverture selon la langue de l'interface.
const OPEN_LABELS = /^(afficher la transcription|show transcript|transcript anzeigen|mostrar transcripci[oó]n|mostrar transcri[cç][aã]o|mostra trascrizione|transcriptie tonen)$/i;
const CLOSE_WORDS = /(fermer|close|masquer|hide|schlie[sß]en|cerrar|chiudi|ocultar)/i;

function timeToSeconds(stamp) {
  const parts = String(stamp || '').trim().split(':').map((n) => parseInt(n, 10));
  if (!parts.length || parts.some(isNaN)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

function segmentNodes() {
  for (const sel of SEGMENT_SELECTORS) {
    const nodes = document.querySelectorAll(sel);
    if (nodes.length) return [...nodes];
  }
  return [];
}

function readSegments() {
  const segments = [];
  for (const node of segmentNodes()) {
    let stamp = '';
    let text = '';

    const modernStamp = node.querySelector('.ytwTranscriptSegmentViewModelTimestamp');
    if (modernStamp) {
      // L'horodatage contient un libellé d'accessibilité (« 7 secondes ») à retirer.
      const a11y = modernStamp.querySelector('.ytwTranscriptSegmentViewModelTimestampA11yLabel');
      stamp = a11y ? modernStamp.textContent.replace(a11y.textContent, '') : modernStamp.textContent;
      text = node.querySelector('.ytAttributedStringHost')?.textContent || '';
    } else {
      stamp = node.querySelector('.segment-timestamp')?.textContent || '';
      text = node.querySelector('.segment-text, yt-formatted-string.segment-text')?.textContent || '';
    }

    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    segments.push({ t: timeToSeconds(stamp) ?? 0, text });
  }
  return segments;
}

async function waitFor(fn, timeout = 12000, interval = 300) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await sleep(interval);
  }
  return false;
}

// Restreint aux vrais <button> : chercher plus large attrapait un lien de la
// description, dont le clic ouvrait un nouvel onglet au lieu du panneau.
function findOpenButton() {
  const buttons = [...document.querySelectorAll('button')];
  const exact = buttons.find((b) => OPEN_LABELS.test((b.getAttribute('aria-label') || '').trim()));
  if (exact) return exact;
  return buttons.find((b) => {
    const label = `${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`;
    return /transcri/i.test(label) && !CLOSE_WORDS.test(label);
  }) || null;
}

async function openTranscriptPanel() {
  if (segmentNodes().length) return true;

  let button = findOpenButton();
  if (!button) {
    // Le bouton vit dans la description, qu'il faut déplier au préalable.
    const expand = document.querySelector('#description-inline-expander #expand, tp-yt-paper-button#expand, #expand');
    if (expand) { expand.click(); await sleep(900); }
    button = findOpenButton();
  }
  if (!button) return false;

  button.click();
  return waitFor(() => segmentNodes().length > 0);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'YTR_GET_INFO') {
    sendResponse({
      ok: true,
      title:
        document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string')?.textContent?.trim() ||
        document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, ''),
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
        if (!(await openTranscriptPanel())) {
          sendResponse({ ok: false, error: 'panneau transcription introuvable' });
          return;
        }
        // Le panneau se remplit progressivement : on attend la stabilisation du compte.
        let segments = readSegments();
        for (let i = 0; i < 15; i++) {
          await sleep(350);
          const next = readSegments();
          if (next.length && next.length === segments.length) break;
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
