// Appels à l'API Mistral (chat completions), avec streaming SSE.

const ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';

export class MistralError extends Error {}

function authHeaders(apiKey) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

async function readError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.message || body?.error?.message || JSON.stringify(body);
  } catch (_) {
    detail = await res.text().catch(() => '');
  }
  if (res.status === 401) return 'Clé API Mistral invalide ou expirée (401). Vérifiez-la dans les options.';
  if (res.status === 422) return `Requête refusée par Mistral (422) : ${detail}`;
  if (res.status === 429) return 'Quota ou débit dépassé côté Mistral (429). Réessayez dans un instant.';
  if (res.status === 400 && /model/i.test(detail)) return `Modèle inconnu pour votre compte : ${detail}`;
  return `Erreur API Mistral (HTTP ${res.status}) : ${detail}`;
}

export async function complete({ apiKey, model, messages, temperature = 0.3, maxTokens, signal }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: authHeaders(apiKey),
    signal,
    body: JSON.stringify({ model, messages, temperature, ...(maxTokens ? { max_tokens: maxTokens } : {}) })
  });
  if (!res.ok) throw new MistralError(await readError(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function completeStream({ apiKey, model, messages, temperature = 0.3, maxTokens, signal, onDelta }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), Accept: 'text/event-stream' },
    signal,
    body: JSON.stringify({ model, messages, temperature, stream: true, ...(maxTokens ? { max_tokens: maxTokens } : {}) })
  });
  if (!res.ok) throw new MistralError(await readError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop();
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) { full += delta; onDelta?.(delta, full); }
      } catch (_) {}
    }
  }
  return full;
}
