// Fire-Fetch — download function
// Runs on Netlify at /api/fetch. It passes the link to your download engine
// (a cobalt instance) and keeps your engine key secret from visitors.
//
// Netlify environment variables (Site configuration → Environment variables):
//   COBALT_API_URL   your engine address, e.g. https://cobalt-production-xxxx.up.railway.app
//   COBALT_API_KEY   the key your engine gave you
//   ALWAYS_PROXY     optional. "true" (default) streams every file through the engine so it
//                    always downloads instead of opening in a new tab. Set "false" to save
//                    engine bandwidth.

const QUALITIES = new Set(["144", "240", "360", "480", "720", "1080", "1440", "2160", "4320", "max"]);
const AUDIO_FORMATS = new Set(["best", "mp3", "ogg", "wav", "opus"]);
const BITRATES = new Set(["320", "256", "128", "96", "64"]);
const MODES = new Set(["auto", "audio", "mute"]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const fail = (code, status = 200) => json({ status: "error", error: { code } }, status);

export default async (req) => {
  if (req.method !== "POST") return fail("fire.method", 405);

  const engine = (process.env.COBALT_API_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.COBALT_API_KEY || "").trim();
  if (!engine) return fail("fire.engine.missing");

  let body;
  try { body = await req.json(); } catch { return fail("fire.link.invalid", 400); }

  const url = String(body?.url || "").trim();
  if (url.length > 2048) return fail("fire.link.invalid", 400);
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    return fail("fire.link.invalid", 400);
  }

  const mode = MODES.has(body.mode) ? body.mode : "auto";
  const payload = {
    url,
    downloadMode: mode,
    videoQuality: QUALITIES.has(String(body.quality)) ? String(body.quality) : "1080",
    audioFormat: AUDIO_FORMATS.has(body.audioFormat) ? body.audioFormat : "mp3",
    audioBitrate: BITRATES.has(String(body.audioBitrate)) ? String(body.audioBitrate) : "320",
    filenameStyle: "pretty",
    youtubeVideoCodec: "h264",
    alwaysProxy: (process.env.ALWAYS_PROXY || "true").toLowerCase() !== "false"
  };

  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (key) headers["Authorization"] = `Api-Key ${key}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000); // Netlify's free limit is 10 seconds

  try {
    const r = await fetch(engine + "/", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const data = await r.json().catch(() => null);
    if (!data || typeof data.status !== "string") return fail("fire.engine.unreachable", 502);
    return json(data);
  } catch (err) {
    return fail(err?.name === "AbortError" ? "fire.engine.timeout" : "fire.engine.unreachable", 502);
  } finally {
    clearTimeout(timer);
  }
};

export const config = { path: "/api/fetch" };
