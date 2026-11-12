// Shows today's noise percentage on the toolbar icon.
importScripts('rules.js');

const { summarize } = globalThis.UNFLUFF;
const MIN_POSTS = 10; // too few posts makes the number meaningless

async function updateBadge() {
  const { days = {} } = await chrome.storage.local.get('days');
  const today = summarize(days, 1);
  chrome.action.setBadgeBackgroundColor({ color: '#0f766e' });
  chrome.action.setBadgeText({ text: today.seen >= MIN_POSTS ? `${today.pct}%` : '' });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.days) updateBadge();
});
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
