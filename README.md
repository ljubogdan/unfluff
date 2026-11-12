# Unfluff for LinkedIn

**See how much of your LinkedIn feed is noise. Then hide it.**

Unfluff is a small open-source browser extension that measures the fluff in your feed (ads, "Suggested" posts, strangers' likes, engagement bait) and removes it, so what's left is posts from people you actually follow.

<p align="center"><img src="icons/icon128.png" width="96" alt=""></p>

<!-- TODO: add a screenshot of the popup and a share card here -->

> Not affiliated with, endorsed by, or sponsored by LinkedIn Corporation. "LinkedIn" is a trademark of LinkedIn Corporation and is used here only to describe what the extension works with.

## The noise report

Open the popup and you get one number: **what share of your feed was noise**, for today, the last 7 days, or the last 30, with a breakdown by type.

- The toolbar icon shows today's percentage.
- **Share your number** turns your report into an image you can post.

A post counts as noise when it is an ad, a suggested post, something shown only because someone liked or commented on it, engagement bait, or hashtag spam. It is counted whether or not you choose to hide it.

## What it can do with the noise

Pick one: **collapse** it to a thin bar with a Show button, **remove** it completely, or keep it and **label** it ("Ad", "Engagement bait", "Someone's like").

**Feed** (on by default)
- Promoted posts (ads)
- "Suggested" and recommended posts
- Posts you only see because someone liked or commented on them
- Posts from people you don't follow *(off: turn on for a following-only feed)*
- Reposts *(off)*, company page posts *(off)*

**Post types** (all off by default)
- Polls, videos, carousels/PDFs
- "Starting a new position" and work anniversary posts
- Hiring posts and job ads

**Words & phrases**
- Engagement bait: "Agree?", "Comment YES below and I'll send it", "♻️ Repost to help", "Follow me for more" *(on)*
- Hashtag spam (6+ hashtags)
- Your own muted words. Plain phrases or `/regex/`.

**People & companies**: mute anyone by pasting their profile link or name.

**Page clean-up**: Premium upsells, the right sidebar (news, puzzles, ads), and like/comment counts.

## Install

1. Clone or download this repo: `git clone https://github.com/ljubogdan/unfluff.git`
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin the extension and refresh linkedin.com.

Works in Chrome, Edge, Brave, Arc and other Chromium browsers.

## Privacy and safety

- **It makes no network requests. None.** It reads the page you are already looking at and hides parts of it, like an ad blocker.
- **It never acts for you:** no clicking, liking, following, messaging, or scraping.
- **Minimal permissions:** `storage`, plus a content script on `linkedin.com`. No remote code, no analytics.
- **Everything stays in your browser.** See [PRIVACY.md](PRIVACY.md).

LinkedIn's terms discourage third-party extensions in general, including ones that only change how the site looks. Cosmetic filters like this one are widely used, but nobody can promise how LinkedIn will treat any extension. Use your own judgement.

## How it works

A content script watches the feed as you scroll and reads each post's structure: the header ("X likes this", "Suggested"), the "Promoted" label, the author, the attachments, and the text. Each post is classified, tallied for the report, and hidden or labelled if one of your filters matches.

## Caveats

- Text-based detection (headers, "Promoted", bait phrases) assumes LinkedIn's **English** UI.
- LinkedIn changes its markup often. If something stops getting filtered, open an issue with the post type.
- The noise percentage covers posts that loaded while you scrolled, not your whole feed.

## Development

```
manifest.json       MV3 manifest
src/rules.js        filter definitions, classification, noise-report math
src/content.js      feed scanner: reads posts, hides or labels them, tallies
src/content.css     hidden-post bar, labels, page clean-up styles
src/background.js   toolbar badge with today's noise percentage
popup/              settings popup, noise report, share card
test/               node unit tests + a mock feed for browser testing
```

No build step and no dependencies. Run the tests with `npm test`.

To try changes without LinkedIn, serve the folder (`python3 -m http.server`) and open `test/mock-feed.html` or `test/popup-preview.html?demo`.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
