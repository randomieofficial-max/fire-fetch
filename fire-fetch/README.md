# Fire-Fetch

Paste a link from YouTube, TikTok, Instagram, Facebook, X and more — get the video or audio file.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | The page itself |
| `style.css` | The black-and-white look and all the animations |
| `app.js` | Makes the page work: link detection, preview, download |
| `favicon.svg` | The little flame icon in the browser tab |
| `netlify.toml` | Tells Netlify how to run the site |
| `netlify/functions/fetch.mjs` | Server code at `/api/fetch` — sends the link to the download engine |
| `netlify/functions/info.mjs` | Server code at `/api/info` — gets the title and thumbnail for the preview |

## Settings to add in Netlify

| Name | Value |
|---|---|
| `COBALT_API_URL` | Your download engine address from Railway (starts with `https://`) |
| `COBALT_API_KEY` | Your engine key from Railway |
| `ALWAYS_PROXY` | Optional. Leave unset. Set to `false` to save engine bandwidth. |

## Try the page without the engine

Open the site with `?demo` at the end of the address (for example `https://your-site.netlify.app/?demo`).
Downloads are simulated so you can check the design.
