# Podium

A clean, calm news site for Formula 1 and tennis. Live headlines from several publishers in one place, with search, pinned teams and players, and saved stories.

## Features

- Live news from BBC Sport, Motorsport.com, Autosport and The Guardian
- Tabs for Top stories, Formula 1, Tennis and Saved
- Pinned picks (Mercedes, Hamilton, Sinner, ATP Finals) that filter the feed in one click
- Search as you type (press `/` to focus, `Esc` to clear)
- Story pages with a link to the original article
- Bookmarks kept in the browser
- Responsive layout, reduced-motion support

## Run it

No build step and no dependencies. Serve the folder with any static server:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## How it works

- `app.js` fetches each RSS feed through the free [rss2json](https://rss2json.com) service and caches results in the browser for 10 minutes.
- Only the headline, a short excerpt, the cover image and a link to the source are shown. Full articles stay on the original sites.
- If every feed fails to load, a couple of built-in sample stories are shown instead.

To change sources, edit the `feeds` list at the top of `app.js`. To change the pinned picks, edit `pins`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | Design |
| `app.js` | Feeds, search, routing, bookmarks |
| `logo.svg` | Logo and favicon |
| `STARTUP.md` | Business plan and next steps |

## Notes

rss2json's free tier has a daily request limit. For a public launch, replace it with your own small backend that fetches the feeds.
