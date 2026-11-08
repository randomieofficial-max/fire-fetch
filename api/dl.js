import crypto from "node:crypto";

const SECRET = process.env.DL_SECRET || "";
const CHUNK = 8 * 1024 * 1024;

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [raw, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", SECRET).update(raw).digest("hex").slice(0, 32);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!data.u || !/^https?:\/\//.test(data.u)) return null;
    if (data.e && Date.now() / 1000 > data.e) return null;
    return data;
  } catch {
    return null;
  }
}

function disposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function chunkedStream(url, headers, total) {
  let pos = 0;
  return new ReadableStream({
    async pull(controller) {
      if (pos >= total) return controller.close();
      const end = Math.min(pos + CHUNK, total) - 1;
      const r = await fetch(url, { headers: { ...headers, Range: `bytes=${pos}-${end}` } });
      if (!r.ok && r.status !== 206) return controller.error(new Error("upstream " + r.status));
      const buf = new Uint8Array(await r.arrayBuffer());
      controller.enqueue(buf);
      pos = end + 1;
    },
  });
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const data = verify(params.get("t"));
  if (!data) return new Response("This download link expired. Fetch the video again.", { status: 410 });

  const headers = { "User-Agent": "Mozilla/5.0", ...(data.h || {}) };
  const name = data.n || "video.mp4";
  const target = new URL(data.u);
  const isYouTube = /googlevideo\.com/.test(target.hostname) || target.pathname.includes("/videoplayback");
  const clientRange = request.headers.get("range");

  try {
    if (isYouTube && !clientRange) {
      const probe = await fetch(data.u, { headers: { ...headers, Range: "bytes=0-0" } });
      const cr = probe.headers.get("content-range");
      const total = cr ? parseInt(cr.split("/")[1], 10) : 0;
      if (total > 0) {
        return new Response(chunkedStream(data.u, headers, total), {
          headers: {
            "Content-Type": probe.headers.get("content-type") || "application/octet-stream",
            "Content-Length": String(total),
            "Content-Disposition": disposition(name),
            "Cache-Control": "no-store",
          },
        });
      }
    }

    const up = await fetch(data.u, { headers: clientRange ? { ...headers, Range: clientRange } : headers });
    if (!up.ok && up.status !== 206) {
      return new Response(`The site refused the download (status ${up.status}). Fetch the video again.`, { status: 502 });
    }
    const out = new Headers({
      "Content-Type": up.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": disposition(name),
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    });
    for (const h of ["content-length", "content-range"]) {
      const v = up.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(up.body, { status: up.status, headers: out });
  } catch (e) {
    console.error("dl error", e);
    return new Response("Download failed midway. Try again.", { status: 502 });
  }
}
