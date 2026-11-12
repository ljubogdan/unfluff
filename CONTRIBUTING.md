# Contributing

Thanks for helping. The most useful contributions:

- **Broken filters.** LinkedIn changes its markup often. Open an issue saying which kind of post got through, or send a fix to the selectors in `src/content.js`.
- **New bait patterns** for `src/rules.js`, with a test case.
- **Other languages.** Detection of "Promoted", "Suggested" and similar labels is English-only today.

## Working on it

There is no build step. Load the folder as an unpacked extension, or serve it locally and open `test/mock-feed.html` and `test/popup-preview.html?demo`.

Run `npm test` before opening a pull request, and add a test for any rule you add or change.

Please read the design rules in [SECURITY.md](SECURITY.md). In short: no dependencies, no remote code, no network requests, no new permissions, nothing that acts on the user's behalf.
