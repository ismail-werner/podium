# Podium

A clean, fast video game news site. Live headlines from several gaming sites in one place, with search, category tabs and saved stories.

Design: Apple-style typography and layout with Steam's color palette.

## Features

- Live news from JV (jeuxvideo.com), IGN, Eurogamer, PC Gamer and GameSpot
- Search as you type (press `/` to focus, `Esc` to clear)
- One tab per source, plus a Saved tab
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
- If the feeds fail to load, built-in sample stories are shown instead.

To change sources, edit the `feeds` list at the top of `app.js`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | Design |
| `app.js` | Feeds, search, routing, bookmarks |
| `STARTUP.md` | Business plan and next steps |

## Notes

rss2json's free tier has a daily request limit. For a public launch, replace it with your own small backend that fetches the feeds.
