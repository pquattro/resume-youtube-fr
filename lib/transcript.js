// Récupération de la transcription d'une vidéo YouTube.
// Stratégie 1 : page watch -> ytInitialPlayerResponse -> pistes de sous-titres (timedtext).
// Stratégie 2 (repli) : lecture du panneau « Transcription » directement dans l'onglet.

export function videoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);
      if (m) return m[1];
    }
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
  } catch (_) {}
  return null;
}

// Extrait l'objet JSON qui suit un marqueur, par comptage d'accolades
// (plus robuste qu'une expression régulière sur du JS minifié).
function jsonAfter(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  let i = html.indexOf('{', start + marker.length);
  if (i === -1) return null;
  const begin = i;
  let depth = 0, inStr = false, esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(begin, i + 1)); } catch (_) { return null; }
      }
    }
  }
  return null;
}

async function fetchPlayerResponse(videoId) {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=fr&bpctr=9999999999&has_verified=1`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Page YouTube inaccessible (HTTP ${res.status}).`);
  const html = await res.text();
  return {
    player: jsonAfter(html, 'ytInitialPlayerResponse') || jsonAfter(html, '"playerResponse":'),
    html
  };
}

function pickTrack(tracks) {
  const isFr = (t) => (t.languageCode || '').toLowerCase().startsWith('fr');
  const isAsr = (t) => t.kind === 'asr';
  return (
    tracks.find((t) => isFr(t) && !isAsr(t)) ||
    tracks.find((t) => isFr(t)) ||
    tracks.find((t) => !isAsr(t)) ||
    tracks[0] ||
    null
  );
}

function cleanText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function fetchTrackSegments(baseUrl) {
  const sep = baseUrl.includes('?') ? '&' : '?';

  // Format JSON (le plus propre).
  try {
    const res = await fetch(`${baseUrl}${sep}fmt=json3`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const segs = (data.events || [])
        .filter((e) => e.segs)
        .map((e) => ({ t: Math.round((e.tStartMs || 0) / 1000), text: cleanText(e.segs.map((s) => s.utf8).join('')) }))
        .filter((s) => s.text);
      if (segs.length) return segs;
    }
  } catch (_) {}

  // Repli XML.
  try {
    const res = await fetch(baseUrl, { credentials: 'include' });
    if (res.ok) {
      const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
      const segs = [...xml.querySelectorAll('text')]
        .map((n) => ({ t: Math.round(parseFloat(n.getAttribute('start') || '0')), text: cleanText(n.textContent) }))
        .filter((s) => s.text);
      if (segs.length) return segs;
    }
  } catch (_) {}

  return [];
}

// Supprime les répétitions typiques des sous-titres automatiques défilants.
function dedupe(segments) {
  const out = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && (prev.text === s.text || prev.text.endsWith(s.text))) continue;
    out.push(s);
  }
  return out;
}

export function formatTimestamp(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Regroupe les segments en lignes lisibles préfixées d'un horodatage.
export function segmentsToText(segments, maxLineChars = 220, maxLineSeconds = 45) {
  const lines = [];
  let buf = null;
  for (const s of segments) {
    const tooLong = buf && buf.text.length + s.text.length + 1 > maxLineChars;
    const tooLate = buf && s.t - buf.t > maxLineSeconds;
    if (!buf || tooLong || tooLate) {
      if (buf) lines.push(buf);
      buf = { t: s.t, text: s.text };
    } else {
      buf.text += ' ' + s.text;
    }
  }
  if (buf) lines.push(buf);
  return lines.map((l) => `[${formatTimestamp(l.t)}] ${l.text}`).join('\n');
}

async function transcriptFromTab(tabId) {
  const reply = await chrome.tabs.sendMessage(tabId, { type: 'YTR_GET_TRANSCRIPT' }).catch(() => null);
  if (reply?.ok && reply.segments?.length) return reply.segments;
  return [];
}

/**
 * Renvoie { title, author, segments, source, languageCode }.
 */
export async function getTranscript({ videoId, tabId }) {
  let title = '', author = '', languageCode = '', segments = [], source = '';

  try {
    const { player } = await fetchPlayerResponse(videoId);
    if (player) {
      title = player.videoDetails?.title || '';
      author = player.videoDetails?.author || '';
      const status = player.playabilityStatus?.status;
      if (status && status !== 'OK' && status !== 'LIVE_STREAM_OFFLINE') {
        // On note l'info mais on tente quand même le repli DOM.
      }
      const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const track = pickTrack(tracks);
      if (track?.baseUrl) {
        languageCode = track.languageCode || '';
        segments = await fetchTrackSegments(track.baseUrl);
        if (segments.length) source = track.kind === 'asr' ? 'sous-titres automatiques' : 'sous-titres';
      }
    }
  } catch (_) {}

  if (!segments.length && tabId != null) {
    segments = await transcriptFromTab(tabId);
    if (segments.length) source = 'panneau transcription';
  }

  if (!title && tabId != null) {
    const info = await chrome.tabs.sendMessage(tabId, { type: 'YTR_GET_INFO' }).catch(() => null);
    if (info?.ok) { title = info.title || title; author = info.author || author; }
  }

  return { title, author, languageCode, source, segments: dedupe(segments) };
}
