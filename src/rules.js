// Filter definitions, default settings, the pure decision function that says
// whether (and why) a post is hidden, and the noise-report math.
// Shared by the content script, the popup and the background worker.
(() => {
  'use strict';

  // `noise: true` rules count toward the noise report whether or not the
  // user hides them. The others are personal preferences, not noise.
  const RULES = [
    { id: 'promoted', group: 'feed', label: 'Ads', hint: 'Promoted posts', reason: 'Ad', noise: true, on: true },
    { id: 'suggested', group: 'feed', label: 'Suggested posts', hint: 'Recommended, popular, trending', reason: 'Suggested', noise: true, on: true },
    { id: 'activity', group: 'feed', label: "Someone's likes", hint: 'Shown because a connection liked or commented', reason: "Someone's like", noise: true, on: true },
    { id: 'unfollowed', group: 'feed', label: "People you don't follow", hint: 'Turn on for a following-only feed', reason: 'Not following', on: false },
    { id: 'reposts', group: 'feed', label: 'Reposts', reason: 'Repost', on: false },
    { id: 'company', group: 'feed', label: 'Company pages', reason: 'Company post', on: false },
    { id: 'polls', group: 'content', label: 'Polls', reason: 'Poll', on: false },
    { id: 'videos', group: 'content', label: 'Videos', reason: 'Video', on: false },
    { id: 'documents', group: 'content', label: 'Carousels & PDFs', reason: 'Carousel', on: false },
    { id: 'celebrations', group: 'content', label: 'Job updates', hint: 'New positions, work anniversaries', reason: 'Job update', on: false },
    { id: 'hiring', group: 'content', label: 'Hiring posts', hint: '"We\'re hiring" and job ads', reason: 'Hiring post', on: false },
    { id: 'bait', group: 'text', label: 'Engagement bait', hint: '"Agree?", "Comment YES below"', reason: 'Engagement bait', noise: true, on: true },
    { id: 'hashtags', group: 'text', label: 'Hashtag spam', hint: '6 or more hashtags', reason: 'Hashtag spam', noise: true, on: false },
  ];

  const PAGE = [
    { id: 'premium', label: 'Premium upsells', on: true },
    { id: 'sidebar', label: 'Right sidebar', hint: 'News, puzzles, ads', on: false },
    { id: 'counts', label: 'Like & comment counts', on: false },
  ];

  const MODES = ['collapse', 'remove', 'label'];
  const flags = (list) => Object.fromEntries(list.map((r) => [r.id, r.on]));

  const DEFAULTS = {
    enabled: true,
    mode: 'collapse',
    rules: flags(RULES),
    page: flags(PAGE),
    keywords: [],
    authors: [],
  };

  // Stored settings are untrusted input: coerce every field to its expected type.
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 500) : []);
  const bools = (defaults, v) => {
    const out = { ...defaults };
    if (v && typeof v === 'object') for (const k of Object.keys(defaults)) if (typeof v[k] === 'boolean') out[k] = v[k];
    return out;
  };
  function withDefaults(s) {
    s = s && typeof s === 'object' ? s : {};
    return {
      enabled: s.enabled !== false,
      mode: MODES.includes(s.mode) ? s.mode : 'collapse',
      rules: bools(DEFAULTS.rules, s.rules),
      page: bools(DEFAULTS.page, s.page),
      keywords: strings(s.keywords),
      authors: strings(s.authors),
    };
  }

  const BAIT = [
    /\bagree\s*\?/i,
    /\bthoughts\s*\?/i,
    /\b(comment|type|drop|reply)\s+["“'‘]?[\w-]{2,20}["”'’]?\s+(below|in the comments|and i('|’)?ll|to get|for)\b/i,
    /\brepost\s+(this\s+)?(if|to help|so)\b/i,
    /♻️/,
    /\bfollow\s+(me\s+)?for\s+more\b/i,
    /\blike\s+(this\s+(post\s+)?)?if\s+you\b/i,
    /\b(tag|mention)\s+(someone|a friend|a colleague)\b/i,
    /\bsave\s+this\s+(post\s+)?for\s+later\b/i,
    /\bwho\s+else\b[^.!?\n]{0,60}\?/i,
  ];

  const HIRING = /(^|\s)#hiring\b|\bwe('|’)?re hiring\b|\bi('|’)?m hiring\b|\bwe are hiring\b|\bjoin our team\b/i;
  const CELEBRATION = /\bstarting a new position\b|\bwork anniversary\b|\bcelebrating \d+ years?\b|\bnew certification\b/i;

  // "linkedin.com/in/john-doe/?x" -> "john-doe"; anything else lowercased.
  function normalizeAuthor(entry) {
    const s = String(entry).trim().toLowerCase();
    const m = s.match(/\/(?:in|company|school|showcase)\/([^/?#\s]+)/);
    return m ? decodeURIComponent(m[1]) : s.replace(/^@/, '');
  }

  // "/regex/i" entries are regexes; everything else is a case-insensitive phrase.
  const compiled = new WeakMap();
  function compileKeywords(list) {
    if (compiled.has(list)) return compiled.get(list);
    const out = [];
    for (const raw of list) {
      const k = String(raw).trim();
      if (!k || k.length > 200) continue;
      const m = k.match(/^\/(.+)\/([a-z]*)$/);
      if (m) {
        try { out.push({ k, re: new RegExp(m[1], m[2].includes('i') ? m[2] : m[2] + 'i') }); } catch { /* skip bad regex */ }
      } else {
        out.push({ k, re: new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i') });
      }
    }
    compiled.set(list, out);
    return out;
  }

  const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

  // f: features extracted from a post (see content.js extract()).
  // Returns every rule id the post matches, in priority order, ignoring settings.
  function classify(f) {
    const text = f.text || '';
    const tests = {
      promoted: f.promoted,
      suggested: f.header === 'suggested',
      activity: f.header === 'activity',
      unfollowed: f.unfollowed,
      reposts: f.repost,
      company: f.company,
      polls: f.poll,
      videos: f.video,
      documents: f.document,
      celebrations: f.celebration || CELEBRATION.test(text),
      hiring: f.jobLink || HIRING.test(text),
      bait: BAIT.some((re) => re.test(text)),
      hashtags: (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length >= 6,
    };
    return RULES.filter((r) => tests[r.id]).map((r) => r.id);
  }

  // The noise category a post counts under in the report, or null.
  const noiseOf = (tags) => tags.find((id) => RULE_BY_ID[id].noise) || null;

  // Returns { id, reason } for the first filter the user has on, or null.
  function evaluate(f, s, tags = classify(f)) {
    if (s.authors.length) {
      const muted = new Set(s.authors.map(normalizeAuthor));
      const who = [...f.authorIds, ...f.authorNames].map((x) => x.toLowerCase());
      if (who.some((x) => muted.has(x))) return { id: 'author', reason: 'Muted author' };
    }
    const id = tags.find((t) => s.rules[t]);
    if (id) return { id, reason: RULE_BY_ID[id].reason };
    for (const { k, re } of compileKeywords(s.keywords)) {
      if (re.test(f.text || '')) return { id: 'keyword', reason: `Muted word "${k}"` };
    }
    return null;
  }

  // ---------- noise report ----------
  // days: { 'YYYY-MM-DD': { seen: n, noise: { ruleId: n } } }

  const KEEP_DAYS = 30;
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function lastDays(n, now = new Date()) {
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    return keys;
  }

  function summarize(days, n, now = new Date()) {
    let seen = 0;
    const noise = {};
    for (const key of lastDays(n, now)) {
      const d = days && days[key];
      if (!d) continue;
      seen += d.seen || 0;
      for (const [id, c] of Object.entries(d.noise || {})) if (RULE_BY_ID[id]) noise[id] = (noise[id] || 0) + c;
    }
    const total = Object.values(noise).reduce((a, b) => a + b, 0);
    const parts = Object.entries(noise)
      .map(([id, count]) => ({ id, label: RULE_BY_ID[id].reason, count, pct: seen ? Math.round((count / seen) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    return { seen, noise: total, pct: seen ? Math.round((total / seen) * 100) : 0, parts };
  }

  function prune(days, now = new Date()) {
    const keep = new Set(lastDays(KEEP_DAYS, now));
    return Object.fromEntries(Object.entries(days).filter(([k]) => keep.has(k)));
  }

  const api = { RULES, PAGE, MODES, DEFAULTS, withDefaults, classify, noiseOf, evaluate, normalizeAuthor, compileKeywords, dayKey, summarize, prune };
  globalThis.UNFLUFF = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
