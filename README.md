# Fire Fetch

Universal video downloader: paste a link from YouTube, TikTok, Instagram, X, Facebook and 1,000+ other sites, then pick any quality, sound only, or video without sound.

Live site: https://fire-fetch.vercel.app

## What's in this folder

- index.html: the page (design, styles, layout)
- app.js: everything that happens in the browser (animations, fetching links, the quality picker, downloading, joining HD picture and sound)
- api/info.py: server engine that reads a link and lists every downloadable file (uses yt-dlp, with YouTube mirror and X backups)
- api/dl.js: server step that passes a chosen file straight to the visitor with its real title as the file name
- requirements.txt: tells Vercel to install yt-dlp
- package.json: tells Vercel the JavaScript settings
- vercel.json: server region and time limits

## How to put it online yourself (Vercel)

1. Make a free account at https://vercel.com
2. Install Node.js from https://nodejs.org (the LTS version)
3. Open a terminal in this folder and run:

   npm i -g vercel
   vercel login
   vercel --prod

4. Answer the questions: pick your account, say "no" to linking an existing project if this is new, and accept the defaults.
5. Vercel prints your live address when it finishes.

Required: in the Vercel dashboard, open the project, go to Settings > Environment Variables and add DL_SECRET with any long random text (at least 32 characters). Downloads won't work without it. It's already set on the live fire-fetch project.
