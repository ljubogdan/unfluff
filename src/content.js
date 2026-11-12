// Scans the LinkedIn feed, works out what each post is (ad, suggestion,
// someone's like, bait, poll...), then hides or labels the ones the user's
// filters match and keeps a daily tally for the noise report.
// It only reads the page you are already looking at. It makes no requests.
(() => {
  'use strict';

  const { withDefaults, classify, noiseOf, evaluate, dayKey, prune, PAGE } = globalThis.UNFLUFF;

  const MAX_TEXT = 5000; // chars of post text checked against filters

  const POST_SELECTOR = [
    'div.feed-shared-update-v2',
    'div[data-urn^="urn:li:activity:"]',
    'div[data-urn^="urn:li:aggregate:"]',
    'div[data-id^="urn:li:activity:"]',
    'div[data-id^="urn:li:aggregate:"]',
  ].join(',');
  const ACTOR_SELECTOR = '.update-components-actor, .feed-shared-actor';
  const HEADER_SELECTOR = '.update-components-header, .feed-shared-header';
  const TEXT_SELECTOR = '.update-components-text, .feed-shared-update-v2__description, .feed-shared-text';
  const AUTHOR_LINK = 'a[href*="/in/"], a[href*="/company/"], a[href*="/school/"], a[href*="/showcase/"]';
  const FOLLOW_BUTTON = 'button[aria-label^="Follow "], .update-components-actor__follow-button, button.follow';
  const IGNORED_AREAS = `${HEADER_SELECTOR}, .comments-comments-list, .comments-comment-item, .social-details-social-counts`;

  let settings = withDefaults();
  const state = new WeakMap(); // post -> { f, tags }
  const counted = new Set(); // post ids already in today's tally

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const next = { ...settings };
    for (const [k, { newValue }] of Object.entries(changes)) next[k] = newValue;
    settings = withDefaults(next);
    applyPageClasses();
    document.querySelectorAll('[data-uf-key]').forEach(applyToPost);
    scan();
  });

  // ---------- reading a post ----------

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function authorOf(actor) {
    const a = actor.querySelector(AUTHOR_LINK);
    const m = a && a.getAttribute('href').match(/\/(in|company|school|showcase)\/([^/?#]+)/);
    if (!m) return null;
    const nameEl = actor.querySelector('.update-components-actor__title span[aria-hidden="true"], .update-components-actor__name, .feed-shared-actor__name');
    const name = clean(nameEl ? nameEl.textContent : a.textContent).split(' • ')[0];
    return { id: decodeURIComponent(m[2]), person: m[1] === 'in', name };
  }

  function extract(post) {
    const actorEls = [...post.querySelectorAll(ACTOR_SELECTOR)];
    const actors = actorEls.map(authorOf).filter(Boolean);
    if (!actors.length) {
      // Unknown markup: fall back to the first profile link outside header/comments.
      const a = [...post.querySelectorAll(AUTHOR_LINK)].find((el) => !el.closest(IGNORED_AREAS));
      const author = a && authorOf(a.parentElement);
      if (author) actors.push(author);
    }
    const main = actors[0];
    const actorEl = actorEls[0] || post;
    const actorText = clean(actorEl.textContent);

    const headerEl = post.querySelector(HEADER_SELECTOR);
    const headerText = headerEl ? clean(headerEl.textContent) : '';
    let header = null;
    if (headerText) {
      if (/\breposted\b/i.test(headerText)) header = 'repost';
      else if (/\b(suggested|recommended|popular|trending)\b/i.test(headerText)) header = 'suggested';
      else header = 'activity'; // "X likes this", "X commented on this", "X follows Y"...
    }

    const textEls = post.querySelectorAll(TEXT_SELECTOR);
    const text = textEls.length ? [...textEls].map((el) => el.textContent).join('\n') : post.textContent;

    return {
      authorIds: actors.map((a) => a.id),
      authorNames: actors.map((a) => a.name).filter(Boolean),
      company: !!main && !main.person,
      header,
      promoted: [...actorEl.querySelectorAll('span, a')].some((el) => /^promoted( by .+)?$/i.test(clean(el.textContent))),
      // A Follow button or a 2nd/3rd-degree badge means you don't follow the author.
      unfollowed: !!actorEl.querySelector(FOLLOW_BUTTON) || /•\s*(2nd|3rd\+?)(\s|$)/i.test(actorText),
      repost: header === 'repost' || actors.length > 1,
      poll: !!post.querySelector('.update-components-poll, .feed-shared-poll'),
      video: !!post.querySelector('.update-components-linkedin-video, .feed-shared-linkedin-video, video'),
      document: !!post.querySelector('.update-components-document, .feed-shared-document, .document-s-container'),
      celebration: !!post.querySelector('.update-components-celebration, .feed-shared-celebration-image'),
      jobLink: !!post.querySelector('a[href*="/jobs/view/"]'),
      text: clean(text).slice(0, MAX_TEXT),
    };
  }

  // ---------- hiding / labelling ----------

  function processPost(post) {
    const f = extract(post);
    const id = post.dataset.urn || post.dataset.id || '';
    const key = [id, f.authorIds.join(','), f.text.length].join('|');
    if (post.dataset.ufKey === key) return;
    post.dataset.ufKey = key;
    const tags = classify(f);
    state.set(post, { f, tags });
    applyToPost(post);

    // Tally each post once, after its text has rendered.
    if (id && f.text && !counted.has(id)) {
      counted.add(id);
      tally(noiseOf(tags));
    }
  }

  function applyToPost(post) {
    const st = state.get(post);
    const match = st && settings.enabled ? evaluate(st.f, settings, st.tags) : null;

    const bar = post.previousElementSibling;
    if (bar && bar.classList.contains('uf-bar')) bar.remove();
    post.classList.remove('uf-hidden');
    delete post.dataset.ufReason;
    if (!match) return;

    post.dataset.ufReason = match.id;
    if (settings.mode === 'label') {
      post.before(makeBar(post, match.reason, true));
      return;
    }
    if (post.dataset.ufRevealed === '1') return;
    post.classList.add('uf-hidden');
    if (settings.mode === 'collapse') post.before(makeBar(post, match.reason, false));
  }

  function makeBar(post, reason, labelOnly) {
    const bar = document.createElement('div');
    bar.className = labelOnly ? 'uf-bar uf-label' : 'uf-bar';
    const mark = document.createElement('span');
    mark.className = 'uf-mark';
    const label = document.createElement('span');
    label.className = 'uf-reason';
    label.textContent = reason;
    bar.append(mark, label);
    if (!labelOnly) {
      const note = document.createElement('span');
      note.className = 'uf-note';
      note.textContent = 'hidden by Unfluff';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Show';
      btn.addEventListener('click', () => {
        post.dataset.ufRevealed = '1';
        post.classList.add('uf-reveal');
        applyToPost(post);
      });
      bar.append(note, btn);
    }
    return bar;
  }

  // ---------- noise report tally ----------

  let pending = { seen: 0, noise: {} };
  let tallyTimer = null;
  function tally(noiseId) {
    pending.seen++;
    if (noiseId) pending.noise[noiseId] = (pending.noise[noiseId] || 0) + 1;
    clearTimeout(tallyTimer);
    tallyTimer = setTimeout(async () => {
      const add = pending;
      pending = { seen: 0, noise: {} };
      const { days = {} } = await chrome.storage.local.get('days');
      const today = (days[dayKey()] ||= { seen: 0, noise: {} });
      today.seen += add.seen;
      for (const [k, n] of Object.entries(add.noise)) today.noise[k] = (today.noise[k] || 0) + n;
      chrome.storage.local.set({ days: prune(days) });
    }, 1000);
  }

  // ---------- page ----------

  function applyPageClasses() {
    for (const { id } of PAGE) {
      document.documentElement.classList.toggle(`uf-page-${id}`, settings.enabled && !!settings.page[id]);
    }
  }

  function scan() {
    const posts = new Set();
    for (const el of document.querySelectorAll(POST_SELECTOR)) {
      // Only the outermost match: nested selectors hit the same post twice.
      const outer = el.parentElement?.closest(POST_SELECTOR);
      posts.add(outer || el);
    }
    posts.forEach(processPost);
  }

  let scanTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 100);
  });

  chrome.storage.sync.get(null).then((sync) => {
    settings = withDefaults(sync);
    applyPageClasses();
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
