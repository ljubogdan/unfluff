const assert = require('node:assert');
const { evaluate, classify, noiseOf, withDefaults, normalizeAuthor, summarize, prune, dayKey } = require('../src/rules.js');

const post = (over = {}) => ({
  authorIds: ['john-doe'], authorNames: ['John Doe'], company: false, header: null, promoted: false,
  unfollowed: false, repost: false, poll: false, video: false, document: false, celebration: false,
  jobLink: false, text: 'Shipped a new release today.', ...over,
});
const reason = (f, s = {}) => evaluate(f, withDefaults(s))?.id ?? null;

// defaults
assert.equal(reason(post()), null);
assert.equal(reason(post({ promoted: true })), 'promoted');
assert.equal(reason(post({ header: 'suggested' })), 'suggested');
assert.equal(reason(post({ header: 'activity' })), 'activity');
assert.equal(reason(post({ header: 'repost', repost: true })), null, 'reposts off by default');
assert.equal(reason(post({ poll: true })), null, 'polls off by default');
assert.equal(reason(post({ unfollowed: true })), null, 'following-only off by default');

// toggles
assert.equal(reason(post({ poll: true }), { rules: { polls: true } }), 'polls');
assert.equal(reason(post({ promoted: true }), { rules: { promoted: false } }), null);
assert.equal(reason(post({ company: true }), { rules: { company: true } }), 'company');
assert.equal(reason(post({ unfollowed: true }), { rules: { unfollowed: true } }), 'unfollowed');
assert.equal(reason(post({ text: "I'm happy to share that I'm starting a new position as CTO" }), { rules: { celebrations: true } }), 'celebrations');
assert.equal(reason(post({ text: 'We’re hiring! #hiring' }), { rules: { hiring: true } }), 'hiring');

// bait
for (const t of ['AI will replace managers. Agree?', 'Comment "GUIDE" below and I’ll DM you', '♻️ Repost to help your network', 'Follow me for more tips', 'Thoughts?']) {
  assert.equal(reason(post({ text: t })), 'bait', t);
}
assert.equal(reason(post({ text: 'I agree with the report.' })), null);

// hashtags
assert.equal(reason(post({ text: '#a #b #c #d #e #f' }), { rules: { hashtags: true } }), 'hashtags');
assert.equal(reason(post({ text: '#a #b #c' }), { rules: { hashtags: true } }), null);

// keywords
assert.equal(reason(post({ text: 'Thought   Leader vibes' }), { keywords: ['thought leader'] }), 'keyword');
assert.equal(reason(post({ text: 'new AI agents launch' }), { keywords: ['/\\bai agents?\\b/'] }), 'keyword');
assert.equal(reason(post({ text: 'hello' }), { keywords: ['/[bad/'] }), null, 'invalid regex ignored');

// authors
assert.equal(normalizeAuthor('https://www.linkedin.com/in/John-Doe/?x=1'), 'john-doe');
assert.equal(reason(post(), { authors: ['https://www.linkedin.com/in/john-doe/'] }), 'author');
assert.equal(reason(post(), { authors: ['john doe'] }), 'author');
assert.equal(reason(post(), { authors: ['jane'] }), null);

// noise classification ignores the user's toggles
assert.equal(noiseOf(classify(post({ promoted: true, poll: true }))), 'promoted');
assert.equal(noiseOf(classify(post({ poll: true }))), null, 'a poll is a preference, not noise');
assert.equal(noiseOf(classify(post({ text: '#a #b #c #d #e #f' }))), 'hashtags');
assert.equal(noiseOf(classify(post())), null);

// stored settings are sanitized
const bad = withDefaults({ keywords: 'x', authors: [1, 'ok'], rules: { polls: 'yes', evil: true }, mode: '<b>' });
assert.deepEqual(bad.keywords, []);
assert.deepEqual(bad.authors, ['ok']);
assert.equal(bad.rules.polls, false);
assert.equal('evil' in bad.rules, false);
assert.equal(bad.mode, 'collapse');
assert.equal(withDefaults({ mode: 'label' }).mode, 'label');
assert.equal(withDefaults({ rules: { polls: true } }).rules.promoted, true);
assert.deepEqual(withDefaults(null).authors, []);

// noise report
const now = new Date(2026, 10, 12, 15);
const days = {
  '2026-11-12': { seen: 50, noise: { promoted: 10, bait: 5 } },
  '2026-11-10': { seen: 50, noise: { promoted: 5, suggested: 20, bogus: 9 } },
  '2026-10-01': { seen: 100, noise: { promoted: 100 } },
};
assert.equal(dayKey(now), '2026-11-12');
const today = summarize(days, 1, now);
assert.deepEqual([today.seen, today.noise, today.pct], [50, 15, 30]);
const week = summarize(days, 7, now);
assert.deepEqual([week.seen, week.noise, week.pct], [100, 40, 40]);
assert.deepEqual(week.parts.map((p) => [p.id, p.pct]), [['suggested', 20], ['promoted', 15], ['bait', 5]]);
assert.equal(summarize({}, 7, now).pct, 0);
assert.equal(summarize(undefined, 7, now).seen, 0);
assert.deepEqual(Object.keys(prune(days, now)).sort(), ['2026-11-10', '2026-11-12']);

console.log('rules tests pass');
