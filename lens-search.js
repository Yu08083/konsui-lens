((root) => {
  'use strict';
  const smallKana = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'っ': 'つ', 'ゎ': 'わ', 'ゕ': 'か', 'ゖ': 'け' };
  function text(value, reading = false) {
    return String(value || '').replace(/\[([^/\]]+)\/([^\]]+)\]/g, (_, name, kana) => reading ? kana : name).replace(/\\n/g, ' ');
  }
  function normalize(value, relaxed = false) {
    let normalized = text(value).normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
    if (relaxed) normalized = normalized.normalize('NFD').replace(/[\u3099\u309a]/g, '').replace(/[ぁぃぅぇぉゃゅょっゎゕゖ]/g, (character) => smallKana[character]);
    return normalized.replace(/[\s\p{P}\p{S}]/gu, '');
  }
  function forms(value) {
    return [...new Set([text(value), text(value, true)].filter(Boolean))];
  }
  function distance(left, right, maximum) {
    const a = [...left], b = [...right];
    if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
    let previousPrevious = null;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], previousPrevious[j - 2] + 1);
      }
      previousPrevious = previous;
      previous = current;
    }
    return previous[b.length];
  }
  function index(fields) {
    return fields.flatMap((field) => forms(typeof field === 'string' ? field : field.value).map((value) => ({
      strict: normalize(value), relaxed: normalize(value, true), label: text(value), kind: field.kind || 'name', fuzzy: typeof field === 'string' || field.fuzzy !== false
    }))).filter((field) => field.strict);
  }
  function match(fields, query) {
    const strict = normalize(query), relaxed = normalize(query, true);
    if (!strict) return { score: 0, kind: '', fuzzy: false };
    let best = null;
    for (const field of fields) {
      const weight = field.kind === 'name' ? 0 : field.kind === 'reward' ? 3 : 5;
      let score = Infinity, fuzzy = false;
      if (field.strict === strict) score = weight;
      else if (field.relaxed === relaxed) score = 8 + weight;
      else if (field.strict.includes(strict)) score = 16 + weight;
      else if (field.relaxed.includes(relaxed)) score = 24 + weight;
      else if (field.fuzzy && relaxed.length >= 4 && relaxed.length <= 24) {
        const maximum = relaxed.length >= 6 ? 2 : 1;
        const edits = distance(relaxed, field.relaxed, maximum);
        if (edits <= maximum && edits / Math.max(relaxed.length, field.relaxed.length) <= 0.34) {
          score = 60 + edits * 10 + weight;
          fuzzy = true;
        }
      }
      if (Number.isFinite(score) && (!best || score < best.score)) best = { score, kind: field.kind, label: field.label, fuzzy };
    }
    return best;
  }
  const api = Object.freeze({ text, normalize, index, match });
  root.LensSearch = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
