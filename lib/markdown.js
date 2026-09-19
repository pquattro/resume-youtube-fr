// Mini-rendu Markdown (sans dépendance, compatible CSP des extensions).
// Gère : titres, listes, gras/italique, code, citations, et horodatages cliquables.

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeToSeconds(stamp) {
  const parts = stamp.split(':').map((n) => parseInt(n, 10));
  if (parts.some(isNaN)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // Horodatages : [12:34], (12:34) ou 1:02:33 nu -> lien de navigation dans la vidéo.
  out = out.replace(/\[?\(?\b(\d{1,2}:\d{2}(?::\d{2})?)\b\)?\]?/g, (match, stamp) => {
    const sec = timeToSeconds(stamp);
    if (sec === null) return match;
    return `<a href="#" class="ts" data-seconds="${sec}" title="Aller à ${stamp}">${stamp}</a>`;
  });
  return out;
}

export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const html = [];
  let listType = null;
  let inCode = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) { html.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; }
  };
  const closeList = () => {
    if (listType) { html.push(`</${listType}>`); listType = null; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^```/.test(line.trim())) {
      flushParagraph(); closeList();
      html.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { html.push(escapeHtml(raw) + '\n'); continue; }

    if (!line.trim()) { flushParagraph(); closeList(); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(); closeList();
      const level = Math.min(6, Math.max(2, heading[1].length));
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph(); closeList();
      html.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }

    if (/^\s*([-*•])\s+/.test(line)) {
      flushParagraph();
      if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
      html.push(`<li>${inline(line.replace(/^\s*[-*•]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
      html.push(`<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushParagraph(); closeList(); html.push('<hr>');
      continue;
    }

    // Une ligne qui démarre par un horodatage est un bloc à elle seule
    // (sinon le « Déroulé » se fond en un seul pavé).
    if (/^\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?[\])]?\s/.test(line)) {
      flushParagraph();
      closeList();
      html.push(`<p class="cue">${inline(line.trim())}</p>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph(); closeList();
  if (inCode) html.push('</code></pre>');
  return html.join('\n');
}
