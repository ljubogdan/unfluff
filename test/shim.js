// Test-only stand-ins for the extension APIs so the scripts can run on a
// plain local page. Any network request is recorded: there should be none.
const mem = { sync: {}, local: {} };
const listeners = [];
const area = (name) => ({
  async get(keys) {
    if (keys == null) return { ...mem[name] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in mem[name]).map((k) => [k, mem[name][k]]));
    if (typeof keys === 'string') return keys in mem[name] ? { [keys]: mem[name][keys] } : {};
    return { ...keys, ...mem[name] };
  },
  async set(obj) {
    const changes = {};
    for (const [k, v] of Object.entries(obj)) { changes[k] = { newValue: v }; mem[name][k] = v; }
    listeners.forEach((l) => l(changes, name));
  },
  async remove(k) { delete mem[name][k]; listeners.forEach((l) => l({ [k]: {} }, name)); },
});
window.chrome = { storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: (f) => listeners.push(f) } } };

window.requests = [];
window.fetch = async (url) => { requests.push(String(url)); throw new Error('no network in tests'); };

// popup-preview.html?demo fills the report with sample numbers
if (location.search.includes('demo')) {
  const d = new Date();
  const key = (back) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  mem.local.days = {
    [key(0)]: { seen: 84, noise: { promoted: 17, suggested: 14, activity: 12, bait: 6 } },
    [key(1)]: { seen: 120, noise: { promoted: 26, suggested: 22, activity: 19, bait: 9, hashtags: 4 } },
    [key(3)]: { seen: 61, noise: { promoted: 12, suggested: 9, activity: 11, bait: 5 } },
  };
}
