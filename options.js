const DEFAULTS = { apiKey: '', model: 'mistral-large-latest', style: 'standard' };
const $ = (id) => document.getElementById(id);

function applyModel(value) {
  const known = [...$('model').options].some((o) => o.value === value);
  if (known) {
    $('model').value = value;
    $('customModel').hidden = true;
  } else {
    $('model').value = '__custom';
    $('customModel').hidden = false;
    $('customModel').value = value;
  }
}

$('model').addEventListener('change', () => {
  $('customModel').hidden = $('model').value !== '__custom';
  if (!$('customModel').hidden) $('customModel').focus();
});

$('toggleKey').addEventListener('click', () => {
  const field = $('apiKey');
  const shown = field.type === 'text';
  field.type = shown ? 'password' : 'text';
  $('toggleKey').textContent = shown ? 'Afficher' : 'Masquer';
});

$('save').addEventListener('click', async () => {
  const model = $('model').value === '__custom' ? $('customModel').value.trim() : $('model').value;
  await chrome.storage.local.set({
    apiKey: $('apiKey').value.trim(),
    model: model || DEFAULTS.model,
    style: $('style').value
  });
  $('saved').hidden = false;
  setTimeout(() => ($('saved').hidden = true), 1800);
});

$('clearCache').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith('summary:'));
  await chrome.storage.local.remove(keys);
  $('clearCache').textContent = `${keys.length} résumé(s) supprimé(s)`;
  setTimeout(() => ($('clearCache').textContent = 'Vider le cache des résumés'), 2200);
});

(async () => {
  const cfg = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  $('apiKey').value = cfg.apiKey;
  applyModel(cfg.model);
  $('style').value = cfg.style;
})();
