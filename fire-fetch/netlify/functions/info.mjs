// Fire-Fetch — preview function
// Runs on Netlify at /api/info?url=... and returns { provider, title, author, thumbnail }
// using each site's public "oEmbed" preview service. No key needed.
// Sites without a public preview (Instagram, Facebook…) simply return an empty preview.

const SOURCES = [
  { name: "YouTube", host: /(^|\.)(youtube\.com|youtu\.be)$/, api: (u) => `https://www.youtube.com/oembed?format=json&url=${u}` },
  { name: "TikTok", host: /(^|\.)tiktok\.com$/, api: (u) => `https://www.tiktok.com/oembed?url=${u}` },
  { name: "Vimeo", host: /(^|\.)vimeo\.com$/, api: (u) => `https://vimeo.com/api/oembed.json?url=${u}` },
  { name: "SoundCloud", host: /(^|\.)soundcloud\.com$/, api: (u) => `https://soundcloud.com/oembed?format=json&url=${u}` },
  { name: "Dailymotion", host: /(^|\.)(dailymotion\.com|dai\.ly)$/, api: (u) => `https://www.dailymotion.com/services/oembed?format=json&url=${u}` },
  { name: "Reddit", host: /(^|\.)reddit\.com$/, api: (u) => `https://www.reddit.com/oembed?url=${u}` },
  { name: "X", host: /(^|\.)(twitter\.com|x\.com)$/, api: (u) => `https://publish.twitter.com/oembed?omit_script=1&url=${u}` }
];

const json = (body, maxAge = 3600) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`
    }
  });

export default async (req) => {
  const target = new URL(req.url).searchParams.get("url") || "";
  let host;
  try {
    const u = new URL(target);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    host = u.hostname.toLowerCase();
  } catch {
    return json({}, 60);
  }

  const source = SOURCES.find((s) => s.host.test(host));
  if (!source) return json({}, 600);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(source.api(encodeURIComponent(target)), {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; FireFetchPreview/1.0)" },
      signal: ctrl.signal
    });
    if (!r.ok) return json({ provider: source.name }, 300);
    const d = await r.json();
    return json({
      provider: source.name,
      title: typeof d.title === "string" ? d.title.slice(0, 200) : "",
      author: typeof d.author_name === "string" ? d.author_name.slice(0, 100) : "",
      thumbnail: typeof d.thumbnail_url === "string" && /^https:\/\//.test(d.thumbnail_url) ? d.thumbnail_url : ""
    });
  } catch {
    return json({ provider: source.name }, 60);
  } finally {
    clearTimeout(timer);
  }
};

export const config = { path: "/api/info" };
