## Target classification

- **Website:** Books to Scrape (https://books.toscrape.com/)
- **Why:** This is a sandbox website made for practising web scraping.
- **Scope:** I will scrape only the first 3 catalogue pages.
- **Data:** I will collect each book’s title, price, rating, availability, and link.
- **robots.txt:** no robots file found.
- **Why it is appropriate:** The website says it was created for web-scraping practice, so it is suitable for this assignment.

I will not reuse this code on another site without checking its rules and terms first.

## How to run

From the repository root, after `npm install`:

```
node scraper/src/index.js
```

This writes `books.json`, `errors.json`, and `run-report.json` to `output/`.

## Lane and install

- **Lane:** Node.js (JavaScript) — built-in `fetch` for HTTP, `cheerio` for HTML parsing, `zod` for schema validation. No browser, no headless automation.
- **Requires:** Node.js 18+ (for the built-in `fetch` and `AbortSignal.timeout`).
- **Install:** `npm install` from the repository root. This also pulls in `express`, which belongs to the unrelated `server.js` health-check stub, not the scraper itself.

## Record schema

Each entry in `books.json` matches this shape, enforced with `zod` in `scraper/src/schema.js`:

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `product_url` | string (URL) | absolute link to the book's detail page |
| `price_text` | string | raw price as shown on the page, e.g. `"£51.77"` |
| `price_gbp` | number | parsed from `price_text`, non-negative |
| `availability_text` | string | e.g. `"In stock (22 available)"` |
| `rating_text` | `"One"` \| `"Two"` \| `"Three"` \| `"Four"` \| `"Five"` \| `null` | |
| `description` | string \| `null` | |
| `source_page` | string (URL) | catalogue page the book was discovered on |
| `fetched_at` | string (ISO datetime) | |

A record that doesn't match this shape isn't written to `books.json` — it's written to `errors.json` instead, alongside the raw record and the reason it failed.

## Politeness rules

- **User-Agent:** a real, identifying string that links back to this repo — `FlyRankInternshipA9/1.0 (+https://github.com/MemreYigit/The-polite-scraper)` — so whoever operates the site can see who's requesting and why.
- **Delay:** 500ms pause before every network request (cache hits skip the delay — nothing was sent over the wire).
- **Timeout:** every request aborts after 8 seconds instead of hanging forever.
- **Cache:** every page is saved to `cache/` on first fetch and reused on every later run, so re-running the scraper never re-requests a page it already has.
- On top of these: a timeout or 5xx is retried once; a 404 or 403 is not, since the server already gave its answer and asking again would just be noise.

## Run report (real example)

```json
{
  "start_time": "2026-08-18T16:36:24.301Z",
  "duration_ms": 72,
  "pages_fetched": 0,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0
}
```

`pages_fetched` is 0 here because every page was already in `cache/` from a prior run — the honest number to watch on a fresh run (empty cache) is `cache_hits: 0` and `pages_fetched: 63` (3 catalogue pages + 60 book pages).

## Limitation

Only the book detail pages have per-page error handling. If one of the 3 catalogue pages itself fails outright after its retry, the whole run crashes instead of logging and moving on — that gap only exists for catalogue pages, not book pages. It hasn't shown up in practice because the catalogue pages are cached after the first successful run, but it's a real weak spot if the cache is ever cleared on a day the site (or my network) is having trouble.

## Why no browser

Every field this scraper collects — title, price, rating, availability, description — is already present in the plain HTML the server sends back on the very first request, so a headless browser would only add startup time and complexity to re-render content that was never hidden behind JavaScript in the first place.

## Ethics note

If a site has an official API, I'd use that instead of scraping — it's the same data without guessing at HTML. I don't try to get past logins, paywalls, or anything blocking me — if I'm blocked, that means don't scrape it, not find a workaround. And I only collect the fields I actually need for the assignment, not everything on the page just because it's there.