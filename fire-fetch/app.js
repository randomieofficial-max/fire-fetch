/* =========================================================
   Fire-Fetch — front-end logic
   Talks to two small server functions on Netlify:
     POST /api/fetch  -> asks the download engine for the file
     GET  /api/info   -> grabs title + thumbnail for the preview
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Demo mode: used for local previews (file:// or ?demo) so the page works without the engine.
  const DEMO = window.FIRE_DEMO === true ||
    !/^https?:$/.test(location.protocol) ||
    new URLSearchParams(location.search).has("demo");

  const API = "/api";

  // ---------- Elements ----------
  const form = $("#fetcher");
  const input = $("#url");
  const fuse = $("#fuse");
  const chip = $("#platformChip");
  const pasteBtn = $("#pasteBtn");
  const clearBtn = $("#clearBtn");
  const goBtn = $("#goBtn");
  const result = $("#result");
  const quality = $("#quality");
  const audioFormat = $("#audioFormat");
  const audioBitrate = $("#audioBitrate");
  const qualityWrap = $("#qualityWrap");
  const formatWrap = $("#formatWrap");
  const bitrateWrap = $("#bitrateWrap");
  const modeButtons = $$(".mode");
  const modeThumb = $(".mode-thumb");

  $("#year").textContent = new Date().getFullYear();

  // ---------- Small storage helpers (never crash if storage is blocked) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    }
  };

  // ---------- Platform detection ----------
  const PLATFORMS = [
    ["YouTube", /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/],
    ["TikTok", /(^|\.)tiktok\.com$/],
    ["Instagram", /(^|\.)(instagram\.com|instagr\.am)$/],
    ["Facebook", /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/],
    ["X", /(^|\.)(twitter\.com|x\.com|t\.co)$/],
    ["Reddit", /(^|\.)(reddit\.com|redd\.it)$/],
    ["SoundCloud", /(^|\.)(soundcloud\.com|snd\.sc)$/],
    ["Vimeo", /(^|\.)vimeo\.com$/],
    ["Pinterest", /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/],
    ["Twitch", /(^|\.)twitch\.tv$/],
    ["Snapchat", /(^|\.)snapchat\.com$/],
    ["Bluesky", /(^|\.)bsky\.app$/],
    ["Dailymotion", /(^|\.)(dailymotion\.com|dai\.ly)$/],
    ["Tumblr", /(^|\.)tumblr\.com$/],
    ["Streamable", /(^|\.)streamable\.com$/],
    ["Loom", /(^|\.)loom\.com$/],
    ["Bilibili", /(^|\.)(bilibili\.com|b23\.tv)$/],
    ["OK", /(^|\.)ok\.ru$/],
    ["VK", /(^|\.)(vk\.com|vkvideo\.ru)$/],
    ["Rutube", /(^|\.)rutube\.ru$/],
    ["Newgrounds", /(^|\.)newgrounds\.com$/],
    ["Xiaohongshu", /(^|\.)(xiaohongshu\.com|xhslink\.com)$/]
  ];

  function detectPlatform(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      for (const [name, re] of PLATFORMS) if (re.test(host)) return name;
      return null;
    } catch { return null; }
  }

  // Pull the first link out of pasted text ("Check this out! https://vm.tiktok.com/abc")
  function extractUrl(text) {
    if (!text) return "";
    const m = String(text).match(/https?:\/\/[^\s<>"']+/i);
    if (m) return m[0].replace(/[),.]+$/, "");
    const t = String(text).trim();
    // allow "youtube.com/watch?v=..." without https
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(t)) return "https://" + t;
    return t;
  }

  function isValidUrl(s) {
    try { const u = new URL(s); return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes("."); }
    catch { return false; }
  }

  function youtubeId(url) {
    try {
      const u = new URL(url);
      if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1).split("/")[0];
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{6,})/);
      return m ? m[2] : null;
    } catch { return null; }
  }

  // ---------- Mode switch (Video / Audio / No sound) ----------
  let mode = store.get("ff.mode", "auto");

  function setMode(next, focus) {
    mode = next;
    modeButtons.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    const isAudio = mode === "audio";
    qualityWrap.hidden = isAudio;
    formatWrap.hidden = !isAudio;
    bitrateWrap.hidden = !isAudio || audioFormat.value === "best" || audioFormat.value === "wav";
    placeThumb();
    store.set("ff.mode", mode);
  }

  function placeThumb() {
    const active = modeButtons.find((b) => b.dataset.mode === mode);
    if (!active) return;
    modeThumb.style.width = active.offsetWidth + "px";
    modeThumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  modeButtons.forEach((b, i) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
    b.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setMode(modeButtons[(i + 1) % modeButtons.length].dataset.mode, true); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setMode(modeButtons[(i - 1 + modeButtons.length) % modeButtons.length].dataset.mode, true); }
    });
  });
  window.addEventListener("resize", placeThumb);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeThumb);

  // Remember quality / format choices
  quality.value = store.get("ff.quality", "1080");
  audioFormat.value = store.get("ff.audioFormat", "mp3");
  audioBitrate.value = store.get("ff.audioBitrate", "320");
  quality.addEventListener("change", () => store.set("ff.quality", quality.value));
  audioFormat.addEventListener("change", () => { store.set("ff.audioFormat", audioFormat.value); setMode(mode); });
  audioBitrate.addEventListener("change", () => store.set("ff.audioBitrate", audioBitrate.value));
  setMode(mode);

  // ---------- Toasts ----------
  function toast(msg) {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add("bye"); setTimeout(() => el.remove(), 320); }, 2800);
  }

  // ---------- Link input ----------
  let previewTimer = null;
  let lastPreviewUrl = "";

  function onLinkChanged() {
    const raw = input.value;
    const url = extractUrl(raw);
    if (url !== raw && isValidUrl(url)) input.value = url;
    clearBtn.hidden = !input.value;
    pasteBtn.hidden = !!input.value;

    const valid = isValidUrl(input.value);
    const platform = valid ? detectPlatform(input.value) : null;
    if (platform) {
      chip.textContent = platform;
      chip.hidden = false;
      chip.style.animation = "none"; void chip.offsetWidth; chip.style.animation = "";
    } else {
      chip.hidden = true;
    }

    clearTimeout(previewTimer);
    if (valid && input.value !== lastPreviewUrl) {
      previewTimer = setTimeout(() => loadPreview(input.value), 280);
    }
    if (!input.value) { result.innerHTML = ""; lastPreviewUrl = ""; }
  }

  input.addEventListener("input", onLinkChanged);

  pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { toast("Your clipboard is empty."); return; }
      input.value = extractUrl(text);
      onLinkChanged();
      input.focus();
    } catch {
      input.focus();
      toast("Press Ctrl+V (or long-press → Paste) to paste your link.");
    }
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    onLinkChanged();
    input.focus();
  });

  // Paste anywhere on the page puts the link in the box
  document.addEventListener("paste", (e) => {
    if (e.target === input || e.target.closest("input, textarea, select")) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text) return;
    e.preventDefault();
    input.value = extractUrl(text);
    onLinkChanged();
    input.focus();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  // Drag a link onto the page
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    const text = e.dataTransfer && (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text"));
    if (!text) return;
    e.preventDefault();
    input.value = extractUrl(text);
    onLinkChanged();
  });

  // ---------- Preview card ----------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderSkeleton(platform) {
    result.innerHTML = `
      <div class="card" id="previewCard">
        <div class="thumb skeleton"><span class="thumb-fallback">${esc(platform || "")}</span></div>
        <div class="meta">
          <div class="line skeleton w40"></div>
          <div class="line skeleton w80"></div>
          <div class="line skeleton w60"></div>
        </div>
      </div>`;
  }

  function renderPreview(info, url) {
    const platform = info.provider || detectPlatform(url) || new URL(url).hostname.replace(/^www\./, "");
    const title = info.title || "Ready to download";
    const author = info.author ? `by ${info.author}` : new URL(url).hostname.replace(/^www\./, "");
    result.innerHTML = `
      <div class="card" id="previewCard">
        <div class="thumb">
          <span class="thumb-fallback">${esc(platform)}</span>
          ${info.thumbnail ? `<img alt="" src="${esc(info.thumbnail)}" referrerpolicy="no-referrer">` : ""}
        </div>
        <div class="meta">
          <p class="site">${esc(platform)}</p>
          <p class="title">${esc(title)}</p>
          <p class="author">${esc(author)}</p>
        </div>
      </div>`;
    const img = result.querySelector(".thumb img");
    if (img) {
      img.addEventListener("load", () => img.classList.add("loaded"));
      img.addEventListener("error", () => img.remove());
    }
    currentInfo = { title: info.title || "", platform };
  }

  let currentInfo = { title: "", platform: "" };
  let previewSeq = 0;

  async function loadPreview(url) {
    lastPreviewUrl = url;
    const seq = ++previewSeq;
    const platform = detectPlatform(url);
    renderSkeleton(platform);

    let info = {};
    try {
      if (DEMO) {
        await wait(450);
        info = demoInfo(url);
      } else {
        const r = await fetchWithTimeout(`${API}/info?url=${encodeURIComponent(url)}`, {}, 5000);
        if (r.ok) info = await r.json();
      }
    } catch { /* preview is optional */ }

    // Fallback thumbnail for YouTube even if the info call failed
    if (!info.thumbnail && platform === "YouTube") {
      const id = youtubeId(url);
      if (id) info.thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    if (seq !== previewSeq) return; // a newer link was pasted
    renderPreview(info, url);
  }

  // ---------- Download ----------
  const ERRORS = [
    ["error.api.link.invalid", "That link doesn't look right. Copy it again from the app's Share button."],
    ["error.api.link.unsupported", "This site isn't supported yet."],
    ["error.api.service.unsupported", "This site isn't supported yet."],
    ["error.api.service.disabled", "Downloads from this site are switched off for now."],
    ["error.api.content.too_long", "This video is longer than the allowed limit."],
    ["error.api.content.video.live", "Live streams can't be downloaded while they're live."],
    ["error.api.content.video.private", "This video is private."],
    ["error.api.content.video.age", "This video is age-restricted, so it can't be fetched."],
    ["error.api.content.video.region", "This video is blocked in the engine's region."],
    ["error.api.content.video.unavailable", "This video isn't available. It may be deleted or private."],
    ["error.api.content.post.private", "This post is private."],
    ["error.api.content.post.age", "This post is age-restricted, so it can't be fetched."],
    ["error.api.content.post.unavailable", "This post isn't available. It may be deleted or private."],
    ["error.api.content", "Nothing downloadable was found at this link."],
    ["error.api.fetch.empty", "Nothing downloadable was found at this link."],
    ["error.api.fetch.rate", "The site is limiting requests right now. Try again in a minute."],
    ["error.api.fetch.short_link", "Couldn't open that short link. Paste the full link instead."],
    ["error.api.fetch", "The site didn't respond properly. Try again in a moment."],
    ["error.api.youtube.login", "YouTube is asking the engine to sign in. Try again later, or see the setup guide's YouTube section."],
    ["error.api.youtube.no_matching_format", "That quality isn't available for this video. Pick a lower one."],
    ["error.api.youtube", "YouTube blocked this request. Try again in a minute."],
    ["error.api.rate_exceeded", "Too many downloads at once. Wait a few seconds and try again."],
    ["error.api.capacity", "The engine is busy. Try again in a moment."],
    ["error.api.timed_out", "The site took too long to answer. Try again."],
    ["error.api.auth", "The download engine rejected the key. Check COBALT_API_KEY in Netlify."],
    ["fire.engine.missing", "The download engine isn't connected yet. Add COBALT_API_URL in Netlify settings."],
    ["fire.engine.unreachable", "Can't reach the download engine. Make sure it's running."],
    ["fire.engine.timeout", "The download engine took too long. Try again."],
    ["fire.link.invalid", "Paste a full link that starts with https://"],
    ["fire.network", "You seem to be offline. Check your connection and try again."]
  ];

  function friendlyError(code) {
    if (!code) return "Something went wrong. Try again.";
    for (const [prefix, msg] of ERRORS) if (code === prefix || code.startsWith(prefix + ".") || code.startsWith(prefix)) return msg;
    return `Something went wrong (${code}). Try again.`;
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); startDownload(); });

  let busy = false;

  async function startDownload() {
    if (busy) return;
    const url = extractUrl(input.value);
    if (!isValidUrl(url)) {
      fuse.classList.remove("shake"); void fuse.offsetWidth; fuse.classList.add("shake");
      toast(input.value ? "Paste a full link that starts with https://" : "Paste a link first.");
      input.focus();
      return;
    }
    input.value = url;
    if (url !== lastPreviewUrl) loadPreview(url);

    busy = true;
    fuse.classList.add("burning");
    goBtn.classList.add("loading");
    clearStatus();

    const payload = {
      url,
      mode,
      quality: quality.value,
      audioFormat: audioFormat.value,
      audioBitrate: audioBitrate.value
    };

    let data;
    try {
      if (DEMO) {
        await wait(900);
        data = demoFetch(url);
      } else {
        const r = await fetchWithTimeout(`${API}/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload)
        }, 20000);
        data = await r.json().catch(() => ({ status: "error", error: { code: "fire.engine.unreachable" } }));
      }
    } catch (err) {
      data = { status: "error", error: { code: navigator.onLine === false ? "fire.network" : (err && err.name === "AbortError" ? "fire.engine.timeout" : "fire.engine.unreachable") } };
    }

    busy = false;
    fuse.classList.remove("burning");
    goBtn.classList.remove("loading");
    handleResponse(data, url);
  }

  function clearStatus() {
    result.querySelectorAll(".status, .picker").forEach((n) => n.remove());
  }

  function handleResponse(data, url) {
    clearStatus();
    if (!data || !data.status) data = { status: "error", error: { code: "fire.engine.unreachable" } };

    if (data.status === "tunnel" || data.status === "redirect") {
      triggerDownload(data.url, data.filename, data.status === "redirect");
      showStatus("ok", `<strong>Your download has started.</strong> ${esc(data.filename || "")}`,
        `<a class="btn" href="${esc(data.url)}" ${data.status === "redirect" ? 'target="_blank" rel="noopener"' : ""}>Download again</a>`);
      addHistory(url);
      return;
    }

    if (data.status === "picker" && Array.isArray(data.picker)) {
      const items = data.picker.map((p, i) => `
        <div class="pick" style="animation-delay:${Math.min(i * 50, 500)}ms">
          ${p.thumb || p.type === "photo" ? `<img alt="" loading="lazy" src="${esc(p.thumb || p.url)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
          <span class="pick-type">${esc(p.type === "photo" ? "Photo" : p.type === "gif" ? "GIF" : "Video")} ${i + 1}</span>
          <a href="${esc(p.url)}" target="_blank" rel="noopener">Save</a>
        </div>`).join("");
      const audio = data.audio ? `<a class="btn" href="${esc(data.audio)}" target="_blank" rel="noopener">Save the sound</a>` : "";
      showStatus("", `<strong>${data.picker.length} items found.</strong> Save the ones you want.`, audio);
      const grid = document.createElement("div");
      grid.className = "picker";
      grid.innerHTML = items;
      result.appendChild(grid);
      addHistory(url);
      return;
    }

    const code = data.error && data.error.code;
    showStatus("err", `<strong>Couldn't download this.</strong> ${esc(friendlyError(code))}`,
      `<button type="button" class="btn" id="retryBtn">Try again</button>`);
    const retry = $("#retryBtn");
    if (retry) retry.addEventListener("click", startDownload);
    fuse.classList.remove("shake"); void fuse.offsetWidth; fuse.classList.add("shake");
  }

  function showStatus(kind, html, actionHtml) {
    const el = document.createElement("div");
    el.className = "status " + kind;
    const icon = kind === "ok"
      ? `<svg class="check" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="#000"/><path d="M7.5 13.5l3.6 3.6 7.4-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : "";
    el.innerHTML = `${icon}<span class="grow">${html}</span>${actionHtml || ""}`;
    result.appendChild(el);
  }

  function triggerDownload(href, filename, newTab) {
    const a = document.createElement("a");
    a.href = href;
    if (filename) a.download = filename;
    if (newTab) { a.target = "_blank"; a.rel = "noopener"; }
    a.style.display = "none";
    document.body.appendChild(a);
    if (!DEMO) a.click();
    a.remove();
  }

  // ---------- Recent links (kept only in this browser) ----------
  const historySection = $("#historySection");
  const historyList = $("#historyList");

  function addHistory(url) {
    const list = store.get("ff.history", []).filter((h) => h.url !== url);
    list.unshift({ url, title: currentInfo.title || url, site: detectPlatform(url) || new URL(url).hostname.replace(/^www\./, ""), t: Date.now() });
    store.set("ff.history", list.slice(0, 8));
    renderHistory();
  }

  function renderHistory() {
    const list = store.get("ff.history", []);
    historySection.hidden = list.length === 0;
    historyList.innerHTML = list.map((h, i) => `
      <li>
        <span class="h-site">${esc(h.site)}</span>
        <span class="h-title" title="${esc(h.url)}">${esc(h.title)}</span>
        <button type="button" class="ghost-btn" data-i="${i}">Use again</button>
      </li>`).join("");
  }

  historyList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-i]");
    if (!btn) return;
    const h = store.get("ff.history", [])[Number(btn.dataset.i)];
    if (!h) return;
    input.value = h.url;
    onLinkChanged();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    input.focus();
  });
  $("#clearHistory").addEventListener("click", () => { store.set("ff.history", []); renderHistory(); toast("List cleared."); });
  renderHistory();

  // ---------- Helpers ----------
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
  }

  // ---------- Demo data (only used in preview mode) ----------
  function demoInfo(url) {
    const p = detectPlatform(url) || "Website";
    return { provider: p, title: `Sample ${p} video — preview mode`, author: "Fire-Fetch demo", thumbnail: "" };
  }
  function demoFetch(url) {
    if (/fail|error/i.test(url)) return { status: "error", error: { code: "error.api.content.video.unavailable" } };
    if (/instagram\.com\/p\//i.test(url)) {
      return { status: "picker", picker: [1, 2, 3, 4].map(() => ({ type: "photo", url: "#", thumb: "" })) };
    }
    const ext = mode === "audio" ? (audioFormat.value === "best" ? "opus" : audioFormat.value) : "mp4";
    return { status: "tunnel", url: "#", filename: `fire-fetch-demo.${ext}` };
  }

  // ---------- Hero motion ----------
  const hero = $(".hero");
  let heroVisible = true;
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(hero);

  // Cursor spotlight
  if (!reduceMotion) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", `${e.clientX - r.left}px`);
      hero.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  }

  // Rotating platform name in the subtitle
  const rotatorWord = $(".rotator-word");
  const rotateNames = ["YouTube", "TikTok", "Instagram", "Facebook", "X", "Reddit", "SoundCloud", "Vimeo"];
  let rIndex = 0;
  if (!reduceMotion) {
    setInterval(() => {
      if (!heroVisible || document.hidden) return;
      rotatorWord.classList.remove("in");
      rotatorWord.classList.add("out");
      setTimeout(() => {
        rIndex = (rIndex + 1) % rotateNames.length;
        rotatorWord.textContent = rotateNames[rIndex];
        rotatorWord.classList.remove("out");
        rotatorWord.classList.add("in");
      }, 340);
    }, 2200);
  }

  // Heat haze on the big wordmark
  const heatNoise = document.getElementById("heatNoise");
  const isSmall = window.matchMedia("(max-width: 760px)").matches;
  if (heatNoise && !reduceMotion) {
    let last = 0;
    const tick = (t) => {
      if (heroVisible && !document.hidden && t - last > 50) {
        last = t;
        const y = 0.024 + Math.sin(t / 900) * 0.008;
        const x = 0.006 + Math.cos(t / 1300) * 0.002;
        heatNoise.setAttribute("baseFrequency", `${x.toFixed(4)} ${y.toFixed(4)}`);
      }
      requestAnimationFrame(tick);
    };
    if (!isSmall) requestAnimationFrame(tick);
  }

  // Embers rising behind the hero
  const canvas = $(".embers");
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const count = isSmall ? 28 : 60;
    const embers = [];
    const resize = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (e, fresh) => {
      e.x = Math.random() * W;
      e.y = fresh ? Math.random() * H : H + 10;
      e.r = Math.random() * 1.8 + .4;
      e.vy = Math.random() * .6 + .25;
      e.vx = (Math.random() - .5) * .3;
      e.life = Math.random() * .6 + .4;
      e.phase = Math.random() * Math.PI * 2;
    };
    resize();
    for (let i = 0; i < count; i++) { const e = {}; spawn(e, true); embers.push(e); }
    window.addEventListener("resize", resize);

    const draw = (t) => {
      if (heroVisible && !document.hidden) {
        ctx.clearRect(0, 0, W, H);
        const boost = fuse.classList.contains("burning") ? 3 : 1;
        for (const e of embers) {
          e.y -= e.vy * boost;
          e.x += e.vx + Math.sin(t / 700 + e.phase) * .25;
          if (e.y < -10) spawn(e, false);
          const fade = Math.min(1, e.y / H) * e.life;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${(fade * .7).toFixed(3)})`;
          ctx.fill();
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  // "How it works" line burns across when it scrolls into view
  const steps = $(".steps");
  if (steps) {
    new IntersectionObserver((entries, obs) => {
      entries.forEach((en) => { if (en.isIntersecting) { steps.classList.add("seen"); obs.disconnect(); } });
    }, { threshold: .4 }).observe(steps);
  }

  // Focus the box on desktop so people can paste straight away
  if (!isSmall) setTimeout(() => input.focus({ preventScroll: true }), 600);
  if (DEMO) setTimeout(() => toast("Preview mode: downloads are simulated."), 900);
})();
