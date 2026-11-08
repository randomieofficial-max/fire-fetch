const $ = s => document.querySelector(s);
const form = $("#f"), input = $("#u"), msg = $("#msg"), out = $("#results"), go = $("#go");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
$("#yr").textContent = new Date().getFullYear();

let ci = 0;
document.querySelectorAll("[data-split]").forEach(r => {
  r.innerHTML = [...r.textContent].map(c => `<span class="ch" style="--i:${ci++}">${c}</span>`).join("");
});

const NAMES = ["YouTube","TikTok","Instagram","X","Facebook","Pinterest","SoundCloud","Twitch","Dailymotion","Vimeo"];
document.querySelectorAll(".marq .track").forEach((t, k) => {
  const list = k ? [...NAMES].reverse() : NAMES;
  const html = list.map(n => `<span>${n}</span>`).join("");
  t.innerHTML = html + html;
});

(() => {
  const cv = $("#field"), cx = cv.getContext("2d");
  let W, H, dpr, mx = -999, my = -999, t = 0, run = true;
  const GAP = 30;
  const size = () => {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = () => {
    cx.clearRect(0, 0, W, H);
    for (let y = GAP / 2; y < H; y += GAP) for (let x = GAP / 2; x < W; x += GAP) {
      const d = Math.hypot(x - mx, y - my);
      const near = Math.max(0, 1 - d / 170);
      const wave = reduce ? 0 : (Math.sin(t + x * .012 + y * .008) + 1) * .5;
      const r = .7 + near * 2.4 + wave * .35;
      cx.fillStyle = `rgba(255,255,255,${.08 + near * .55 + wave * .05})`;
      cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.fill();
    }
  };
  const loop = () => { if (run) { t += .012; draw(); } requestAnimationFrame(loop); };
  addEventListener("resize", () => { size(); draw(); });
  addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; });
  document.addEventListener("pointerleave", () => { mx = my = -999; });
  document.addEventListener("visibilitychange", () => { run = !document.hidden; });
  size(); draw(); if (!reduce) loop();
})();

(() => {
  $(".cur")?.remove();
  if (!matchMedia("(pointer:fine)").matches) return;
  document.addEventListener("pointermove", e => {
    const b = e.target.closest(".go,.dlbtn");
    document.querySelectorAll(".go,.dlbtn").forEach(el => { if (el !== b) el.style.transform = ""; });
    if (!b || reduce) return;
    const r = b.getBoundingClientRect();
    b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .06}px,${(e.clientY - r.top - r.height / 2) * .16}px)`;
  });
  const fb = $("#fieldbox");
  fb.addEventListener("pointermove", e => { const r = fb.getBoundingClientRect(); fb.style.setProperty("--mx", e.clientX - r.left + "px"); fb.style.setProperty("--my", e.clientY - r.top + "px"); });
})();

const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .2 });
document.querySelectorAll(".reveal").forEach((el, i) => { el.style.transitionDelay = i * 90 + "ms"; io.observe(el); });

const detect = u => {
  try {
    const h = new URL(u).hostname;
    const map = {youtube:/youtu/,tiktok:/tiktok/,instagram:/instagram/,x:/(^|\.)x\.com|twitter/,facebook:/facebook|fb\.(watch|com)/,
      pinterest:/pinterest|pin\.it/,soundcloud:/soundcloud/,twitch:/twitch/,dailymotion:/dailymotion|dai\.ly/};
    for (const k in map) if (map[k].test(h)) return k;
    return "web";
  } catch { return null; }
};
const light = () => { const p = detect(input.value.trim()); document.querySelectorAll(".sites span").forEach(s => s.classList.toggle("on", s.dataset.p === p)); };
input.addEventListener("input", light);
const fmtSize = b => !b ? "" : b > 1e9 ? (b/1e9).toFixed(2)+" GB" : b > 1e6 ? (b/1e6).toFixed(1)+" MB" : Math.max(1, Math.round(b/1e3))+" KB";
const fmtDur = s => { s = Math.round(s||0); if (!s) return ""; const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=String(s%60).padStart(2,"0"); return h ? `${h}:${String(m).padStart(2,"0")}:${x}` : `${m}:${x}`; };
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const say = (t, err) => { msg.className = "msg" + (err ? " err" : ""); msg.textContent = t; };

const INV = ["https://yt.chocolatemoo53.com","https://inv.nadeko.net","https://invidious.nerdvpn.de","https://yewtu.be","https://invidious.f5.si","https://inv.tux.pizza","https://invidious.tiekoetter.com","https://iv.ggtyler.dev"];
const ytId = u => (/(?:v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/.exec(u) || [])[1];
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const PIPED = ["https://pipedapi.kavin.rocks","https://api.piped.private.coffee","https://pipedapi.adminforge.de","https://pipedapi.leptons.xyz","https://piped-api.lunar.icu","https://pipedapi.r4fo.com","https://pipedapi.reallyaweso.me","https://api.piped.yt"];
const ytThumb = vid => `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
async function probeOk(url) {
  const pr = await withTimeout(fetch(url, { headers: { Range: "bytes=0-1023" } }), 10000);
  if (!pr.ok) throw new Error("stream " + pr.status);
}
async function viaPiped(base, vid) {
  const d = await withTimeout(fetch(`${base}/streams/${vid}`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }), 12000);
  if (d.error || !((d.videoStreams || []).length || (d.audioStreams || []).length)) throw new Error(d.error || "no streams");
  const title = d.title || "video";
  const clean = (t, e) => (t.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 90) || "video") + "." + e;
  const extOf = (m, fb) => /webm/.test(m || "") ? "webm" : /audio\/mp4|m4a/.test(m || "") ? "m4a" : /mp4/.test(m || "") ? "mp4" : fb;
  const av = [], vids = {}, auds = [];
  for (const s of d.videoStreams || []) {
    if (!s.url) continue;
    const h = (s.width && s.height) ? Math.min(s.width, s.height) : parseInt(s.quality) || 0; if (!h) continue;
    const ext = extOf(s.mimeType, "mp4");
    const f = { url: s.url, name: clean(title, ext), ext, label: h + "p", height: h, size: s.contentLength || 0, fps: s.fps || 0,
      rank: (ext === "mp4" ? (/avc/i.test(s.codec || "") ? 3 : 2) : 1) * 1e9 + (s.bitrate || 0) };
    if (!s.videoOnly) { if (!av.some(x => x.height === h)) av.push(f); }
    else if (!vids[h] || vids[h].rank < f.rank) vids[h] = f;
  }
  const seen = new Set();
  for (const s of (d.audioStreams || []).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))) {
    if (!s.url) continue;
    const ext = extOf(s.mimeType, "m4a"), abr = Math.round((s.bitrate || 0) / 1000), k = ext + Math.round(abr / 8);
    if (seen.has(k)) continue; seen.add(k);
    auds.push({ url: s.url, name: clean(title, ext), ext, label: abr + " kbps", abr, height: 0, size: s.contentLength || 0, fps: 0 });
  }
  await probeOk((av[0] || Object.values(vids)[0] || auds[0]).url);
  return [{ title, author: d.uploader || "", duration: d.duration || 0, thumbnail: ytThumb(vid), source: "mirror",
    av: av.sort((a, b) => b.height - a.height), video: Object.values(vids).sort((a, b) => b.height - a.height), audio: auds, image: [] }];
}
async function viaMirror(base, vid) {
  const d = await withTimeout(fetch(`${base}/api/v1/videos/${vid}?local=true`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }), 12000);
  if (d.error) throw new Error(d.error);
  const abs = u => u && u.startsWith("/") ? base + u : u;
  const side = (size, res) => { const m = /(\d+)x(\d+)/.exec(size || ""); return m ? Math.min(+m[1], +m[2]) : parseInt(res) || 0; };
  const title = d.title || "video";
  const clean = (t, e) => (t.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 90) || "video") + "." + e;
  const mk = (url, ext, extra) => ({ url: abs(url), name: clean(title, ext), ext, ...extra });
  const av = (d.formatStreams || []).filter(s => s.url).map(s => { const h = side(s.size, s.resolution); return mk(s.url, s.container || "mp4", { label: h ? h + "p" : "Original", height: h, size: 0, fps: s.fps || 0 }); });
  const vids = {}, auds = [];
  for (const s of d.adaptiveFormats || []) {
    const t = s.type || ""; if (!s.url) continue;
    if (t.startsWith("audio")) {
      const ext = t.includes("mp4") ? "m4a" : "webm", abr = Math.round((+s.bitrate || 0) / 1000);
      auds.push(mk(s.url, ext, { label: abr + " kbps", abr, height: 0, size: +s.clen || 0, fps: 0 }));
    } else if (t.startsWith("video")) {
      const h = side(s.size, s.resolution); if (!h) continue;
      const ext = s.container || (t.includes("webm") ? "webm" : "mp4");
      const rank = (ext === "mp4" ? (/avc|h264/i.test((s.encoding || "") + t) ? 3 : 2) : 1) * 1e9 + (+s.bitrate || 0);
      const f = mk(s.url, ext, { label: h + "p", height: h, size: +s.clen || 0, fps: s.fps || 0, rank });
      if (!vids[h] || vids[h].rank < rank) vids[h] = f;
    }
  }
  const probe = av[0] || auds[0] || Object.values(vids)[0];
  if (!probe) throw new Error("no streams");
  await probeOk(probe.url);
  auds.sort((a, b) => b.abr - a.abr);
  const seenA = new Set(), uaud = auds.filter(x => { const k = x.ext + Math.round(x.abr / 8); if (seenA.has(k)) return false; seenA.add(k); return true; });
  return [{ title, author: d.author || "", duration: d.lengthSeconds || 0,
    thumbnail: ytThumb(vid), source: "mirror",
    av: av.sort((a, b) => b.height - a.height), video: Object.values(vids).sort((a, b) => b.height - a.height), audio: uaud, image: [] }];
}

$("#paste").addEventListener("click", async () => {
  try { input.value = (await navigator.clipboard.readText()).trim(); light(); fetchIt(); }
  catch { say("Your browser blocked pasting. Press and hold in the box, then choose Paste."); input.focus(); }
});
input.addEventListener("paste", () => setTimeout(() => { light(); if (/^https?:\/\//.test(input.value.trim())) fetchIt(); }, 30));
form.addEventListener("submit", e => { e.preventDefault(); fetchIt(); });

let running = false;
async function fetchIt() {
  const url = input.value.trim();
  if (!url || running) return;
  if (!/^https?:\/\//.test(url)) return say("Paste a full link that starts with https://", true);
  running = true; form.classList.add("busy"); document.body.classList.add("loading"); go.textContent = "Fetching";
  say("Reading the link…");
  out.innerHTML = `<div class="skel"><i class="t"></i><div><i class="l" style="width:80%"></i><i class="l" style="width:45%"></i><i class="l" style="width:60%;height:44px;margin-top:28px"></i><i class="l" style="width:90%;height:62px"></i></div></div>`;
  const slow = setTimeout(() => say(detect(url) === "youtube" ? "Trying the backup YouTube sources…" : "Still working on it…"), 3500);
  const t0 = performance.now();
  try {
    const server = fetch("/api/info?url=" + encodeURIComponent(url)).then(async r => {
      const data = await r.json().catch(() => ({ error: "The server took too long. Try again." }));
      if (!r.ok || data.error) throw new Error(data.error || "Couldn't read that link.");
      return data.items;
    });
    const vid = detect(url) === "youtube" && ytId(url);
    let items;
    try { items = await Promise.any(vid ? [server, ...INV.map(b => viaMirror(b, vid)), ...PIPED.map(b => viaPiped(b, vid))] : [server]);
    if (vid) items.forEach(it => { it.thumbnail = ytThumb(vid); }); }
    catch (agg) { throw (agg.errors && agg.errors[0]) || agg; }
    const n = items.length;
    say(`Ready in ${((performance.now() - t0) / 1000).toFixed(1)}s${n > 1 ? ` · ${n} videos in this post` : ""}.`);
    render(items);
  } catch (e) {
    out.innerHTML = "";
    say(e instanceof TypeError ? "Couldn't reach Fire Fetch. Check your internet connection and try again." : e.message, true);
  } finally {
    clearTimeout(slow); running = false; form.classList.remove("busy"); document.body.classList.remove("loading"); go.textContent = "Fetch";
  }
}

function bestAudioFor(ext, audios) {
  if (!audios.length) return null;
  const want = ext === "webm" ? "webm" : "m4a";
  return audios.find(a => a.ext === want) || audios[0];
}
function choicesFor(it) {
  const tabs = [];
  const audios = it.audio || [];
  const withSound = (it.av || []).map(f => ({ ...f, kind: "file", sub: [f.ext.toUpperCase(), fmtSize(f.size), f.fps > 30 ? f.fps + "fps" : ""] }));
  const haveH = new Set(withSound.map(f => f.height));
  for (const v of it.video || []) {
    if (haveH.has(v.height) || !audios.length) continue;
    const a = bestAudioFor(v.ext, audios);
    const outExt = (v.ext === "webm" && a.ext === "webm") ? "webm" : (v.ext === "mp4" && a.ext === "m4a") ? "mp4" : "mkv";
    const total = (v.size || 0) + (a.size || 0);
    withSound.push({ ...v, kind: "merge", audio: a, aExt: a.ext, outExt, size: total,
      sub: [outExt.toUpperCase(), fmtSize(total), v.fps > 30 ? v.fps + "fps" : ""] });
    haveH.add(v.height);
  }
  withSound.sort((a, b) => (b.height || 0) - (a.height || 0));
  if (withSound.length) tabs.push({ id: "av", name: "Video", list: withSound });
  if (audios.length) tabs.push({ id: "audio", name: "Sound only", list: audios.map(f => ({ ...f, kind: "file", sub: [f.ext.toUpperCase(), fmtSize(f.size)] })) });
  if ((it.video || []).length) tabs.push({ id: "video", name: "No sound", list: it.video.map(f => ({ ...f, kind: "file", sub: [f.ext.toUpperCase(), fmtSize(f.size), f.fps > 30 ? f.fps + "fps" : ""] })) });
  if ((it.image || []).length) tabs.push({ id: "image", name: "Photo", list: it.image.map(f => ({ ...f, kind: "file", sub: [f.ext.toUpperCase(), fmtSize(f.size)] })) });
  return tabs;
}

const STATE = [];
const DL_ICON = `<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 3v14M5 11l7 7 7-7M4 21h16"/></svg>`;
const OK_ICON = `<svg class="arrow check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>`;

function render(items) {
  STATE.length = 0;
  out.innerHTML = items.map((it, i) => {
    const tabs = choicesFor(it);
    STATE[i] = { it, tabs, tab: 0, pick: 0 };
    return `<article class="item" data-i="${i}" style="animation-delay:${i * 100}ms">
      <div class="thumb">${it.thumbnail ? `<img src="${esc(it.thumbnail)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : ""}
        ${it.duration ? `<span class="badge r">${fmtDur(it.duration)}</span>` : ""}
        ${it.source === "mirror" ? `<span class="badge l">Backup source</span>` : ""}</div>
      <div class="meta">
        <h2>${esc(it.title)}</h2>
        ${it.author ? `<p class="by">${esc(it.author)}</p>` : ""}
        <div class="tabs" role="tablist"><span class="pill"></span>
          ${tabs.map((t, k) => `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${k === 0}">${t.name}<small>${t.list.length}</small></button>`).join("")}
        </div>
        <div class="chips" role="group" aria-label="Quality"></div>
        <p class="note"></p>
        <button type="button" class="dlbtn"><span class="fill"></span><span class="lbl"></span><span class="pct"></span>${DL_ICON}</button>
        <p class="status" aria-live="polite"></p>
      </div>
    </article>`;
  }).join("");
  out.querySelectorAll(".item").forEach(el => { drawChips(el); movePill(el); });
  out.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function movePill(el) {
  const s = STATE[el.dataset.i], tabs = el.querySelector(".tabs"), b = tabs.querySelectorAll(".tab")[s.tab];
  if (!b) { tabs.style.display = "none"; return; }
  const pill = tabs.querySelector(".pill");
  pill.style.width = b.offsetWidth + "px";
  pill.style.transform = `translateX(${b.offsetLeft}px)`;
  tabs.querySelectorAll(".tab").forEach((t, k) => t.setAttribute("aria-selected", k === s.tab));
}

function drawChips(el) {
  const s = STATE[el.dataset.i], t = s.tabs[s.tab];
  const box = el.querySelector(".chips");
  if (!t) { box.innerHTML = "<p class='note'>Nothing to download in this post.</p>"; el.querySelector(".dlbtn").hidden = true; return; }
  box.innerHTML = t.list.map((f, k) => `<button type="button" class="chip" style="--i:${k}" data-k="${k}" aria-pressed="${k === s.pick}">
      <b>${esc(f.label)}${f.height >= 2160 ? "<em>4K</em>" : f.height >= 1440 ? "<em>2K</em>" : f.height >= 720 ? "<em>HD</em>" : ""}</b>
      <small>${esc(f.sub.filter(Boolean).join(" · "))}</small></button>`).join("");
  updateButton(el);
}

function updateButton(el) {
  const s = STATE[el.dataset.i], t = s.tabs[s.tab], f = t.list[s.pick];
  const btn = el.querySelector(".dlbtn");
  btn.className = "dlbtn"; btn.querySelector(".fill").style.transform = "";
  btn.querySelector(".pct").textContent = "";
  btn.lastElementChild.outerHTML = DL_ICON;
  const what = t.id === "audio" ? `sound ${f.label}` : t.id === "image" ? "photo" : f.label;
  const ext = f.kind === "merge" ? f.outExt : f.ext;
  btn.querySelector(".lbl").textContent = `Download ${what} · ${ext.toUpperCase()}${f.size ? " · " + fmtSize(f.size) : ""}`;
  el.querySelector(".note").textContent = f.kind === "merge"
    ? "This quality comes as separate picture and sound files. Fire Fetch joins them on your device, so it takes a little longer."
    : t.id === "video" ? "Picture only. This file has no sound." : "";
  el.querySelector(".status").textContent = "";
}

out.addEventListener("click", e => {
  const el = e.target.closest(".item"); if (!el) return;
  const s = STATE[el.dataset.i];
  const tab = e.target.closest(".tab");
  if (tab) { s.tab = +tab.dataset.tab; s.pick = 0; movePill(el); drawChips(el); return; }
  const chip = e.target.closest(".chip");
  if (chip) {
    const r = chip.getBoundingClientRect(), rip = document.createElement("i");
    rip.className = "rip"; rip.style.left = e.clientX - r.left + "px"; rip.style.top = e.clientY - r.top + "px";
    chip.appendChild(rip); setTimeout(() => rip.remove(), 650);
    s.pick = +chip.dataset.k;
    el.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === chip));
    updateButton(el); return;
  }
  const btn = e.target.closest(".dlbtn");
  if (btn && !btn.classList.contains("run")) startDownload(el, btn);
});
addEventListener("resize", () => out.querySelectorAll(".item").forEach(movePill));

async function pull(f, onBytes) {
  const r = await fetch(f.url || "/api/dl?t=" + encodeURIComponent(f.token));
  if (!r.ok) throw new Error((await r.text()).slice(0, 160) || "Download failed.");
  const total = +r.headers.get("content-length") || 0;
  const name = (/filename\*=UTF-8''([^;]+)/.exec(r.headers.get("content-disposition") || "") || [])[1];
  const reader = r.body.getReader(), parts = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); onBytes(value.length, total); }
  return { parts, total, type: r.headers.get("content-type") || "application/octet-stream", name: f.name || (name ? decodeURIComponent(name) : "video") };
}
function burst(el) {
  if (reduce) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("i"); p.className = "spark";
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
    p.style.left = r.right - 32 + "px"; p.style.top = r.top + r.height / 2 + "px";
    p.style.setProperty("--dx", Math.cos(a) * d + "px"); p.style.setProperty("--dy", Math.sin(a) * d + "px");
    document.body.appendChild(p); setTimeout(() => p.remove(), 800);
  }
}
function save(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function meter(btn, statusEl, expected) {
  let got = 0; const t0 = performance.now();
  const fill = btn.querySelector(".fill"), pct = btn.querySelector(".pct");
  return {
    add(n, total) {
      got += n; const T = expected || total;
      const speed = got / Math.max((performance.now() - t0) / 1000, .1);
      if (T) { const p = Math.min(got / T, 1); fill.style.transform = `scaleX(${p})`; pct.textContent = Math.round(p * 100) + "%"; }
      statusEl.textContent = `${fmtSize(got)}${T ? " of " + fmtSize(T) : ""} · ${fmtSize(speed)}/s`;
    },
    set(p, text) { fill.style.transform = `scaleX(${p})`; pct.textContent = Math.round(p * 100) + "%"; if (text) statusEl.textContent = text; }
  };
}

async function startDownload(el, btn) {
  const s = STATE[el.dataset.i], f = s.tabs[s.tab].list[s.pick], statusEl = el.querySelector(".status");
  if (f.kind === "file" && f.token && f.size > 450e6) { location.href = "/api/dl?t=" + encodeURIComponent(f.token); statusEl.textContent = "Big file: your browser is downloading it directly."; return; }
  btn.classList.add("run"); el.querySelectorAll(".chip,.tab").forEach(b => b.disabled = true);
  const m = meter(btn, statusEl, f.size);
  try {
    if (f.kind === "merge") await mergeDownload(f, m, statusEl, s.it.title);
    else {
      const res = await pull(f, (n, t) => m.add(n, t));
      save(new Blob(res.parts, { type: res.type }), res.name);
    }
    btn.classList.remove("run"); btn.classList.add("done");
    btn.querySelector(".fill").style.transform = ""; btn.querySelector(".pct").textContent = "";
    btn.querySelector(".lbl").textContent = "Saved to your device"; btn.lastElementChild.outerHTML = OK_ICON;
    burst(btn);
    statusEl.textContent = "Pick another quality to download it too.";
  } catch (err) {
    btn.classList.remove("run"); btn.querySelector(".fill").style.transform = ""; btn.querySelector(".pct").textContent = "";
    statusEl.textContent = (err.message || "Download failed. Try again.").slice(0, 200);
  } finally {
    el.querySelectorAll(".chip,.tab").forEach(b => b.disabled = false);
  }
}

let ffReady = null;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Couldn't load the joiner. Check your connection.")); document.head.appendChild(s); });
async function blobURL(url, type, onBytes) {
  const r = await fetch(url); if (!r.ok) throw new Error("Couldn't load the joiner.");
  const total = +r.headers.get("content-length") || 0, reader = r.body.getReader(), parts = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); onBytes && onBytes(value.length, total); }
  return URL.createObjectURL(new Blob(parts, { type }));
}
function getFF(onLoad) {
  if (ffReady) return ffReady;
  ffReady = (async () => {
    const V = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd", C = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
    await loadScript(V + "/ffmpeg.js");
    const ff = new FFmpegWASM.FFmpeg();
    let got = 0;
    const loading = ff.load({
      classWorkerURL: await blobURL(V + "/814.ffmpeg.js", "text/javascript"),
      coreURL: await blobURL(C + "/ffmpeg-core.js", "text/javascript"),
      wasmURL: await blobURL(C + "/ffmpeg-core.wasm", "application/wasm", (n, t) => { got += n; onLoad(got, t || 32e6); }),
    });
    await Promise.race([loading, new Promise((_, no) => setTimeout(() => no(new Error("The joiner didn't start. Reload the page and try again.")), 60000))]);
    return ff;
  })();
  ffReady.catch(() => { ffReady = null; });
  return ffReady;
}
async function mergeDownload(f, m, statusEl, title) {
  if (f.size > 1.6e9) throw new Error("This quality is too big to join in the browser. Pick a lower quality, or download picture and sound separately.");
  let prep = "";
  const ffP = getFF((got, total) => { prep = `Preparing the joiner ${Math.min(99, Math.round(got / total * 100))}% · `; });
  let vGot = 0, aGot = 0;
  const tick = () => m.set(Math.min((vGot + aGot) / (f.size || 1), 1) * .9, `${prep}${fmtSize(vGot + aGot)} of ${fmtSize(f.size)}`);
  const [v, a, ff] = await Promise.all([
    pull(f, n => { vGot += n; tick(); }),
    pull(f.audio, n => { aGot += n; tick(); }),
    ffP,
  ]);
  m.set(.92, "Joining picture and sound…");
  const vn = "v." + f.ext, an = "a." + f.aExt, on = "out." + f.outExt;
  await ff.writeFile(vn, new Uint8Array(await new Blob(v.parts).arrayBuffer()));
  await ff.writeFile(an, new Uint8Array(await new Blob(a.parts).arrayBuffer()));
  const onProg = ({ progress }) => m.set(.92 + Math.min(Math.max(progress, 0), 1) * .08, "Joining picture and sound…");
  ff.on("progress", onProg);
  const args = ["-i", vn, "-i", an, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy"];
  if (f.outExt === "mp4") args.push("-movflags", "+faststart");
  const code = await ff.exec([...args, on]);
  ff.off("progress", onProg);
  if (code !== 0) throw new Error("Joining failed for this quality. Try another one, or download picture and sound separately.");
  const data = await ff.readFile(on);
  await Promise.all([vn, an, on].map(n => ff.deleteFile(n).catch(() => {})));
  const base = (title || "video").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 90) || "video";
  const mime = f.outExt === "mp4" ? "video/mp4" : f.outExt === "webm" ? "video/webm" : "video/x-matroska";
  save(new Blob([data.buffer], { type: mime }), `${base} ${f.label}.${f.outExt}`);
}

const q = new URLSearchParams(location.search).get("url");
if (q) { input.value = q; light(); fetchIt(); }

/* thumbnail tilt */
out.addEventListener("pointermove", e => {
  const t = e.target.closest(".thumb"); if (!t || reduce) return;
  const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
  t.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
});
out.addEventListener("pointerout", e => { const t = e.target.closest(".thumb"); if (t && !t.contains(e.relatedTarget)) t.style.transform = ""; });

/* typewriter example links */
(() => {
  if (reduce) return;
  const ex = ["https://www.youtube.com/watch?v=…", "https://www.tiktok.com/@creator/video/…", "https://www.instagram.com/reel/…", "https://x.com/user/status/…", "https://www.facebook.com/watch/?v=…"];
  let i = 0, j = 0, del = false;
  const step = () => {
    if (document.activeElement === input || input.value) { input.placeholder = "Paste a video link"; return setTimeout(step, 900); }
    const w = ex[i];
    j += del ? -1 : 1;
    input.placeholder = w.slice(0, j) || " ";
    if (!del && j >= w.length) { del = true; return setTimeout(step, 1500); }
    if (del && j <= 0) { del = false; i = (i + 1) % ex.length; }
    setTimeout(step, del ? 18 : 42);
  };
  setTimeout(step, 1600);
})();
