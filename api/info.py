from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from concurrent.futures import ThreadPoolExecutor, as_completed
import base64
import hashlib
import hmac
import json
import os
import re
import time
import urllib.request

import yt_dlp

SECRET = os.environ.get("DL_SECRET", "").encode()
KEEP_HEADERS = {"user-agent", "referer", "origin", "accept", "accept-language", "cookie"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0 Safari/537.36"

PIPED_DEFAULT = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.private.coffee",
    "https://pipedapi.leptons.xyz",
    "https://piped-api.lunar.icu",
    "https://pipedapi.r4fo.com",
]
INVIDIOUS_DEFAULT = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be",
    "https://invidious.f5.si",
    "https://inv.tux.pizza",
    "https://iv.ggtyler.dev",
    "https://invidious.privacyredirect.com",
]
_cache = {"t": 0, "piped": PIPED_DEFAULT, "inv": INVIDIOUS_DEFAULT}


def sign(payload):
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(SECRET, raw.encode(), hashlib.sha256).hexdigest()[:32]
    return raw + "." + sig


def clean_name(text, ext):
    text = re.sub(r"[\\/:*?\"<>|\r\n\t]+", " ", text or "video")
    text = re.sub(r"\s+", " ", text).strip()[:90] or "video"
    return f"{text}.{ext or 'mp4'}"


def get_json(url, timeout=8):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def reachable(url, headers=None):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-0", **(headers or {})})
        with urllib.request.urlopen(req, timeout=6) as r:
            return r.status in (200, 206)
    except Exception:
        return False


def platform_of(url):
    host = (urlparse(url).hostname or "").lower()
    table = [
        ("youtube", ("youtube.com", "youtu.be")),
        ("tiktok", ("tiktok.com",)),
        ("instagram", ("instagram.com",)),
        ("facebook", ("facebook.com", "fb.watch", "fb.com")),
        ("x", ("twitter.com", "x.com")),
        ("reddit", ("reddit.com", "redd.it")),
        ("vimeo", ("vimeo.com",)),
        ("pinterest", ("pinterest.", "pin.it")),
        ("soundcloud", ("soundcloud.com",)),
        ("twitch", ("twitch.tv",)),
        ("dailymotion", ("dailymotion.com", "dai.ly")),
    ]
    for name, hosts in table:
        if any(h in host for h in hosts):
            return name
    return "web"


def youtube_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/shorts/|/live/|/embed/|/v/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def ext_from_mime(mime, fallback="mp4"):
    mime = (mime or "").lower()
    if "webm" in mime:
        return "webm"
    if "audio/mp4" in mime or "m4a" in mime:
        return "m4a"
    if "mp4" in mime:
        return "mp4"
    if "mpeg" in mime:
        return "mp3"
    return fallback


def package(title, author, duration, thumb, fmts, expires, source):
    title = (title or "video").split("\n")[0][:140]
    best = {"av": {}, "video": {}, "audio": {}, "image": {}}
    seen = set()

    def score(f):
        ext, vc = f.get("ext"), (f.get("vcodec") or "").lower()
        s = 0
        if ext == "mp4":
            s = 3 if ("avc" in vc or "h264" in vc or not vc) else 2
        elif ext == "webm":
            s = 1
        return (s, f.get("tbr") or 0)

    for f in fmts:
        url, kind = f.get("url"), f.get("kind")
        if not url or not kind or url in seen:
            continue
        seen.add(url)
        if kind == "audio":
            key = (f.get("ext"), int(round((f.get("abr") or 0) / 8)))
        else:
            key = f.get("height") or f.get("label") or url[-24:]
        prev = best[kind].get(key)
        if prev and kind != "audio" and score(prev) >= score(f):
            continue
        if prev and kind == "audio" and (prev.get("abr") or 0) >= (f.get("abr") or 0):
            continue
        best[kind][key] = f

    def out(kind):
        rows = list(best[kind].values())
        if kind == "audio":
            rows.sort(key=lambda f: f.get("abr") or 0, reverse=True)
        else:
            rows.sort(key=lambda f: (f.get("height") or 0, f.get("tbr") or 0), reverse=True)
        res = []
        for f in rows:
            ext = f.get("ext") or "mp4"
            if kind == "audio":
                label = f"{int(f['abr'])} kbps" if f.get("abr") else "Original"
            else:
                label = f.get("label") or (f"{f['height']}p" if f.get("height") else "Original")
            res.append({
                "label": label,
                "ext": ext,
                "size": int(f.get("size") or 0),
                "height": f.get("height") or 0,
                "fps": int(f.get("fps") or 0),
                "abr": int(f.get("abr") or 0),
                "token": sign({"u": f["url"], "h": f.get("headers") or {}, "n": clean_name(title, ext), "e": expires}),
            })
        return res

    return {
        "title": title,
        "author": author or "",
        "duration": duration or 0,
        "thumbnail": thumb,
        "source": source,
        "av": out("av"),
        "video": out("video"),
        "audio": out("audio"),
        "image": out("image"),
    }


def has_media(item):
    return bool(item["av"] or item["video"] or item["audio"] or item["image"])


def ytdlp_formats(ydl, info):
    formats = info.get("formats") or []
    if not formats and info.get("url"):
        formats = [info]
    rows = []
    for f in formats:
        url = f.get("url")
        proto = (f.get("protocol") or "https").lower()
        if not url or proto not in ("http", "https") or f.get("fragments"):
            continue
        vc, ac = f.get("vcodec"), f.get("acodec")
        ext = (f.get("ext") or "mp4").lower()
        if vc == "none" and ac == "none":
            kind = "image" if ext in ("jpg", "jpeg", "png", "webp") else None
        elif vc == "none":
            kind = "audio"
        elif ac == "none":
            kind = "video"
        else:
            kind = "av"
        if not kind:
            continue
        h, w = f.get("height") or 0, f.get("width") or 0
        height = min(h, w) if (h and w) else h
        fid = str(f.get("format_id") or "")
        label = None
        if not height:
            if fid.lower() in ("hd", "sd"):
                label = fid.upper()
            elif f.get("format_note") and len(f["format_note"]) < 18:
                label = f["format_note"]
        headers = {k: v for k, v in (f.get("http_headers") or info.get("http_headers") or {}).items()
                   if k.lower() in KEEP_HEADERS and v}
        try:
            ck = ydl.cookiejar.get_cookie_header(url)
            if ck:
                headers["Cookie"] = ck
        except Exception:
            pass
        rows.append({
            "url": url, "kind": kind, "height": height, "label": label,
            "abr": f.get("abr") or 0, "tbr": f.get("tbr") or 0, "fps": f.get("fps") or 0,
            "ext": "m4a" if (kind == "audio" and ext == "mp4") else ext,
            "vcodec": vc if vc not in (None, "none") else "",
            "size": f.get("filesize") or f.get("filesize_approx") or 0,
            "headers": headers,
        })
    return rows


def via_ytdlp(url):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "cachedir": False,
        "socket_timeout": 15,
        "extractor_args": {"youtube": {"player_client": ["tv_simply", "android_vr", "web_embedded", "default"]}},
    }
    expires = int(time.time()) + 6 * 3600
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        entries = info.get("entries") if info.get("_type") in ("playlist", "multi_video") else None
        src = [e for e in list(entries)[:12] if e] if entries else [info]
        items = []
        for e in src:
            thumb = e.get("thumbnail") or ((e.get("thumbnails") or [{}])[-1].get("url"))
            items.append(package(
                e.get("title") or e.get("description"),
                e.get("uploader") or e.get("channel") or e.get("creator"),
                e.get("duration"), thumb, ytdlp_formats(ydl, e), expires, "main",
            ))
    return [i for i in items if has_media(i)]


def refresh_instances():
    if time.time() - _cache["t"] < 1800:
        return
    _cache["t"] = time.time()
    try:
        data = get_json("https://api.invidious.io/instances.json?sort_by=health", timeout=3)
        uris = [v.get("uri") for _, v in data if v.get("api") and v.get("type") == "https" and v.get("uri")]
        if uris:
            _cache["inv"] = list(dict.fromkeys(uris[:8] + INVIDIOUS_DEFAULT))
    except Exception:
        pass
    try:
        data = get_json("https://piped-instances.kavin.rocks/", timeout=3)
        apis = [d.get("api_url") for d in data if d.get("api_url")]
        if apis:
            _cache["piped"] = list(dict.fromkeys(PIPED_DEFAULT[:2] + apis[:8]))
    except Exception:
        pass


def via_piped(api, vid):
    d = get_json(f"{api.rstrip('/')}/streams/{vid}")
    if d.get("error") or not (d.get("videoStreams") or d.get("audioStreams")):
        raise RuntimeError(d.get("error") or "no streams")
    rows = []
    for s in d.get("videoStreams") or []:
        if not s.get("url"):
            continue
        h, w = s.get("height") or 0, s.get("width") or 0
        height = min(h, w) if (h and w) else (h or int(re.sub(r"\D", "", s.get("quality") or "0") or 0))
        rows.append({
            "url": s["url"], "kind": "video" if s.get("videoOnly") else "av", "height": height,
            "tbr": (s.get("bitrate") or 0) / 1000, "fps": s.get("fps") or 0,
            "ext": ext_from_mime(s.get("mimeType")), "vcodec": s.get("codec") or "",
            "size": s.get("contentLength") or 0,
        })
    for s in d.get("audioStreams") or []:
        if not s.get("url"):
            continue
        rows.append({
            "url": s["url"], "kind": "audio", "abr": (s.get("bitrate") or 0) / 1000,
            "ext": ext_from_mime(s.get("mimeType"), "m4a"), "size": s.get("contentLength") or 0,
        })
    test = next((r for r in rows if r["kind"] in ("av", "video")), rows[0])
    if not reachable(test["url"]):
        raise RuntimeError("piped stream unreachable")
    item = package(d.get("title"), d.get("uploader"), d.get("duration"),
                   d.get("thumbnailUrl") or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                   rows, int(time.time()) + 4 * 3600, "mirror")
    return [item] if has_media(item) else []


def via_invidious(inst, vid):
    base = inst.rstrip("/")
    d = get_json(f"{base}/api/v1/videos/{vid}?local=true")
    if d.get("error"):
        raise RuntimeError(d["error"])

    def absu(u):
        return base + u if u and u.startswith("/") else u

    def short_side(size, res):
        m = re.match(r"(\d+)x(\d+)", size or "")
        if m:
            return min(int(m.group(1)), int(m.group(2)))
        return int(re.sub(r"\D", "", res or "0") or 0)

    rows = []
    for s in d.get("formatStreams") or []:
        rows.append({
            "url": absu(s.get("url")), "kind": "av", "height": short_side(s.get("size"), s.get("resolution")),
            "ext": s.get("container") or "mp4", "vcodec": s.get("encoding") or "avc1",
        })
    for s in d.get("adaptiveFormats") or []:
        t = s.get("type") or ""
        if t.startswith("audio"):
            rows.append({
                "url": absu(s.get("url")), "kind": "audio", "abr": int(s.get("bitrate") or 0) / 1000,
                "ext": "m4a" if "mp4" in t else ext_from_mime(t, "m4a"), "size": int(s.get("clen") or 0),
            })
        elif t.startswith("video"):
            rows.append({
                "url": absu(s.get("url")), "kind": "video",
                "height": short_side(s.get("size"), s.get("resolution")),
                "tbr": int(s.get("bitrate") or 0) / 1000, "fps": s.get("fps") or 0,
                "ext": s.get("container") or ext_from_mime(t), "vcodec": s.get("encoding") or t,
                "size": int(s.get("clen") or 0),
            })
    rows = [r for r in rows if r.get("url")]
    if not rows:
        raise RuntimeError("no streams")
    test = next((r for r in rows if r["kind"] == "av"), rows[0])
    if not reachable(test["url"]):
        raise RuntimeError("invidious stream unreachable")
    thumbs = d.get("videoThumbnails") or []
    thumb = next((t.get("url") for t in thumbs if t.get("quality") in ("maxresdefault", "high", "sddefault")), None)
    item = package(d.get("title"), d.get("author"), d.get("lengthSeconds"),
                   thumb if thumb and thumb.startswith("http") else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                   rows, int(time.time()) + 4 * 3600, "mirror")
    return [item] if has_media(item) else []


def youtube_race(url):
    vid = youtube_id(url)
    jobs = [("main", via_ytdlp, (url,))]
    if vid:
        refresh_instances()
        jobs += [("piped " + p, via_piped, (p, vid)) for p in _cache["piped"][:5]]
        jobs += [("inv " + i, via_invidious, (i, vid)) for i in _cache["inv"][:6]]
    pool = ThreadPoolExecutor(max_workers=len(jobs))
    futs = {pool.submit(fn, *args): name for name, fn, args in jobs}
    errors = []
    try:
        for fut in as_completed(futs, timeout=45):
            try:
                items = fut.result()
                if items:
                    print("youtube winner:", futs[fut])
                    return items
            except Exception as e:  # noqa: BLE001
                errors.append(f"{futs[fut]}: {str(e)[:160]}")
    except Exception as e:  # noqa: BLE001
        errors.append(f"timeout: {e}")
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    print("youtube race failed:", " | ".join(errors)[:2000])
    main_err = next((e for e in errors if e.startswith("main")), "")
    raise RuntimeError(main_err or "all sources failed")


def x_fallback(url):
    m = re.search(r"/status(?:es)?/(\d+)", url)
    if not m:
        return []
    data = get_json(f"https://api.fxtwitter.com/i/status/{m.group(1)}", timeout=12)
    tw = data.get("tweet") or {}
    media = tw.get("media") or {}
    title = (tw.get("text") or "X video").split("\n")[0][:140] or "X video"
    author = (tw.get("author") or {}).get("name") or ""
    expires = int(time.time()) + 6 * 3600
    items = []
    for v in media.get("videos") or []:
        rows = []
        for x in v.get("variants") or []:
            if "mp4" not in (x.get("content_type") or "") or not x.get("url"):
                continue
            q = re.search(r"/(\d+)x(\d+)/", x["url"])
            rows.append({"url": x["url"], "kind": "av", "ext": "mp4", "tbr": (x.get("bitrate") or 0) / 1000,
                         "height": min(int(q.group(1)), int(q.group(2))) if q else 0})
        if not rows and v.get("url"):
            rows = [{"url": v["url"], "kind": "av", "ext": "mp4"}]
        it = package(title, author, v.get("duration"), v.get("thumbnail_url"), rows, expires, "mirror")
        if has_media(it):
            items.append(it)
    for ph in media.get("photos") or []:
        if ph.get("url"):
            items.append(package(title, author, 0, ph["url"],
                                 [{"url": ph["url"], "kind": "image", "ext": "jpg", "label": "Photo"}],
                                 expires, "mirror"))
    return items


def friendly_error(msg, platform):
    m = msg.lower()
    if platform == "youtube":
        if "private" in m:
            return "This YouTube video is private."
        if "age" in m and ("confirm" in m or "restricted" in m):
            return "This YouTube video is age-restricted, so it can't be fetched without an account."
        return "YouTube and all the backup sources are busy right now. Try again in a minute."
    if "authentication is required" in m or "logged-in" in m or "cookies" in m:
        return "This site only lets signed-in accounts fetch videos right now, so Fire Fetch can't get this one."
    if "private" in m or "login" in m or "log in" in m:
        return "This post is private or needs a login, so it can't be fetched."
    if "unsupported url" in m:
        return "That link isn't a supported video page. Paste the link to the post itself."
    if "404" in m or "not found" in m or "unavailable" in m:
        return "That video is unavailable or was removed."
    return "Couldn't read that link. Check it opens in your browser, then try again."


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body, cache=False):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, s-maxage=900, max-age=0" if cache else "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        url = (qs.get("url") or [""])[0].strip()
        if not re.match(r"^https?://", url):
            return self._send(400, {"error": "Paste a full link that starts with https://"})
        platform = platform_of(url)
        t0 = time.time()
        try:
            items = youtube_race(url) if platform == "youtube" else via_ytdlp(url)
        except Exception as e:  # noqa: BLE001
            print("extract error:", url, str(e)[:500])
            items = []
            if platform == "x":
                try:
                    items = x_fallback(url)
                except Exception as e2:  # noqa: BLE001
                    print("x fallback error:", str(e2)[:300])
            if not items:
                if platform == "x" and "no video could be found" in str(e).lower():
                    return self._send(422, {"error": "That post has no video or photo to download."})
                return self._send(422, {"error": friendly_error(str(e), platform), "detail": str(e)[:300]})
        if not items:
            return self._send(422, {"error": "Found the post, but it has no downloadable video or audio."})
        return self._send(200, {"platform": platform, "items": items, "ms": int((time.time() - t0) * 1000)}, cache=True)
