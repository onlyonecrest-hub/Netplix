# StreamFlix

Netflix-style streaming UI with no login, no admin panel, and no user accounts.

## Features

- Cinematic dark StreamFlix interface
- Auto-rotating hero banner
- Horizontal carousel rows with drag/swipe and arrow controls
- Lazy-loaded poster cards with hover previews
- Detail modal and Vidsrc iframe player modal
- TMDB trending, now-playing, popular, TV, genre, and search data through `/api/tmdb`
- OMDb metadata backup through `/api/omdb`
- Vidsrc new-domain discovery through `/api/vidsrc-domains`
- Render-ready `render.yaml`

## Run Locally

```bash
npm start
```

Open `http://localhost:3000`.

Create a local `.env` or set environment variables before starting the server:

- `OMDB_API_KEY`
- `TMDB_READ_ACCESS_TOKEN`
- `TMDB_API_KEY`
- Optional: `TMDB_API_KEYS` for multiple TMDB keys, e.g. `["KEY1","KEY2"]`

## Deploy On Render

Create a new Web Service from this repo or use the included `render.yaml`. Set `OMDB_API_KEY`, `TMDB_READ_ACCESS_TOKEN`, and `TMDB_API_KEY` in Render environment variables.

### Free hosting suggestions
- Render Free tier: good for small Node apps and includes automatic HTTPS.
- Railway free tier: fast deployment for Node + static apps.
- Fly.io free tier: useful if you want a lightweight VM and low-cost scaling.

Any of those support `server.js` and the app's `/api/*` routes.

## Vidsrc Embeds

The server fetches `https://vidsrc.domains/` and uses the current published Vidsrc domains. It prefers the latest domain list from that source and only falls back to `vidsrc.cc` if the domain page cannot be reached.

- Movies: `/embed/movie/{imdbID}`
- TV episodes: `/embed/tv/{imdbID}/{season}-{episode}`
