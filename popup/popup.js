(() => {
  'use strict';

  const { RULES, PAGE, withDefaults, summarize } = globalThis.UNFLUFF;
  const { drawCard, toBlob } = globalThis.UNFLUFF_CARD;
  const $ = (id) => document.getElementById(id);

  const RANGE_LABELS = { 1: 'today', 7: 'the last 7 days', 30: 'the last 30 days' };
  const RING = 263.9; // circumference of the gauge ring (r = 42)
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let settings = withDefaults();
  let days = {};
  let range = 7;

  const save = async (patch) => {
    Object.assign(settings, patch);
    try {
      await chrome.storage.sync.set(patch);
      $('error').hidden = true;
    } catch (e) {
      // Most likely the sync storage quota (8 KB per list).
      $('error').textContent = `Couldn't save: ${e.message || e}. Try a shorter list.`;
      $('error').hidden = false;
    }
  };

  // ---------- noise report ----------

  let countFrame = 0;
  let countDone = 0;
  function countTo(el, to) {
    cancelAnimationFrame(countFrame);
    clearTimeout(countDone);
    const from = Number(el.textContent) || 0;
    if (reducedMotion || from === to) { el.textContent = to; return; }
    // Frames can be throttled; make sure the final number always lands.
    countDone = setTimeout(() => { cancelAnimationFrame(countFrame); el.textContent = to; }, 800);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 700);
      el.textContent = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
      if (t < 1) countFrame = requestAnimationFrame(step);
    };
    countFrame = requestAnimationFrame(step);
  }

  function renderReport() {
    for (const b of document.querySelectorAll('[data-range]')) {
      b.setAttribute('aria-selected', String(Number(b.dataset.range) === range));
    }
    const r = summarize(days, range);
    const empty = r.seen === 0;
    document.querySelector('.report').classList.toggle('empty', empty);
    $('actions').hidden = empty;
    $('openFeed').hidden = !empty;
    $('bars').hidden = empty;

    countTo($('pct'), r.pct);
    $('ring').style.strokeDashoffset = RING * (1 - r.pct / 100);
    if (empty) {
      $('headline').textContent = 'No posts measured yet';
      $('counts').textContent = `Scroll your LinkedIn feed and your noise report for ${RANGE_LABELS[range]} appears here.`;
      return;
    }
    $('headline').textContent = 'of your feed was noise';
    $('counts').textContent = `${r.noise.toLocaleString()} of ${r.seen.toLocaleString()} posts, ${RANGE_LABELS[range]}`;

    const bars = $('bars');
    bars.replaceChildren();
    const max = Math.max(...r.parts.map((p) => p.pct), 1);
    const fills = [];
    for (const p of r.parts) {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.title = `${p.label}: ${p.count.toLocaleString()} of ${r.seen.toLocaleString()} posts`;
      const label = document.createElement('span');
      label.textContent = p.label;
      const track = document.createElement('span');
      track.className = 'track';
      const fill = document.createElement('span');
      fills.push([fill, `${Math.max(3, (p.pct / max) * 100)}%`]);
      track.append(fill);
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = `${p.pct}%`;
      row.append(label, track, value);
      bars.append(row);
    }
    // Set widths after the rows are in the page so the bars grow in.
    setTimeout(() => fills.forEach(([el, w]) => { el.style.width = w; }), 30);
  }

  async function makeCard() {
    const logo = document.querySelector('header img'); // already loaded
    return toBlob(drawCard(summarize(days, range), RANGE_LABELS[range], logo.naturalWidth ? logo : null));
  }

  function flash(el, text) {
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => { el.textContent = old; }, 1500);
  }

  async function downloadCard() {
    const url = URL.createObjectURL(await makeCard());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unfluff-noise-report.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyCard() {
    const label = $('copy').querySelector('span');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': makeCard() })]);
      flash(label, 'Copied');
    } catch {
      flash(label, 'Failed');
    }
  }

  // ---------- settings ----------

  function renderEnabled() {
    document.body.classList.toggle('off', !settings.enabled);
    $('status').textContent = settings.enabled ? 'Cleaning your feed' : 'Paused';
  }

  function renderMode() {
    for (const b of document.querySelectorAll('[data-mode]')) {
      b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
    }
  }

  function renderCounts() {
    const on = (group) => RULES.filter((r) => r.group === group && settings.rules[r.id]).length;
    const counts = {
      feed: on('feed'),
      content: on('content'),
      text: on('text') + settings.keywords.length,
      authors: settings.authors.length,
      page: PAGE.filter((p) => settings.page[p.id]).length,
    };
    for (const pill of document.querySelectorAll('[data-count]')) {
      const n = counts[pill.dataset.count];
      pill.textContent = n ? `${n} on` : '';
    }
  }

  function renderToggles() {
    for (const box of document.querySelectorAll('.toggles')) {
      const group = box.dataset.group;
      const key = group === 'page' ? 'page' : 'rules';
      const items = group === 'page' ? PAGE : RULES.filter((r) => r.group === group);
      box.replaceChildren();
      for (const item of items) {
        const label = document.createElement('label');
        const text = document.createElement('span');
        text.className = 'text';
        text.textContent = item.label;
        if (item.hint) {
          const hint = document.createElement('small');
          hint.textContent = item.hint;
          text.append(hint);
        }
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'sw';
        input.checked = !!settings[key][item.id];
        input.addEventListener('change', () => {
          save({ [key]: { ...settings[key], [item.id]: input.checked } });
          renderCounts();
        });
        label.append(text, input);
        box.append(label);
      }
    }
  }

  // A list of removable chips with an input that adds on Enter.
  function bindChips(id, key) {
    const box = $(id);
    const chips = box.querySelector('.chips');
    const input = box.querySelector('input');

    const render = () => {
      chips.replaceChildren();
      settings[key].forEach((value, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        const text = document.createElement('span');
        text.textContent = value;
        text.title = value;
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = '×';
        x.setAttribute('aria-label', `Remove ${value}`);
        x.addEventListener('click', () => set(settings[key].filter((_, j) => j !== i)));
        chip.append(text, x);
        chips.append(chip);
      });
    };
    const set = (list) => {
      save({ [key]: list });
      render();
      renderCounts();
    };
    const add = (raw) => {
      const items = raw.split('\n').map((s) => s.trim()).filter((s) => s && !settings[key].includes(s));
      if (items.length) set([...settings[key], ...items]);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        add(input.value);
        input.value = '';
      } else if (e.key === 'Backspace' && !input.value && settings[key].length) {
        set(settings[key].slice(0, -1));
      }
    });
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData.getData('text');
      if (!text.includes('\n')) return;
      e.preventDefault();
      add(text);
    });
    input.addEventListener('blur', () => { add(input.value); input.value = ''; });
    box.addEventListener('click', (e) => { if (e.target === box || e.target === chips) input.focus(); });
    render();
  }

  async function init() {
    settings = withDefaults(await chrome.storage.sync.get(null));
    ({ days = {} } = await chrome.storage.local.get('days'));
    if (!summarize(days, 7).seen) range = 1;

    $('enabled').checked = settings.enabled;
    $('enabled').addEventListener('change', (e) => { save({ enabled: e.target.checked }); renderEnabled(); });
    for (const b of document.querySelectorAll('[data-range]')) {
      b.addEventListener('click', () => { range = Number(b.dataset.range); renderReport(); });
    }
    for (const b of document.querySelectorAll('[data-mode]')) {
      b.addEventListener('click', () => { save({ mode: b.dataset.mode }); renderMode(); });
    }
    $('download').addEventListener('click', downloadCard);
    $('copy').addEventListener('click', copyCard);
    $('reset').addEventListener('click', async () => {
      await chrome.storage.local.remove('days');
      days = {};
      renderReport();
    });

    renderEnabled();
    renderMode();
    renderToggles();
    bindChips('keywords', 'keywords');
    bindChips('authors', 'authors');
    renderCounts();
    // Let the first paint happen with an empty gauge so it animates in.
    setTimeout(renderReport, 30);
  }

  init();
})();
