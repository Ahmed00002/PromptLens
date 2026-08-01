(() => {
  const HOST_ID = "promptlens-overlay-host";
  let refs = null;
  let hideTimer = null;

  const CARD_CSS = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    .pl-card {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      width: 340px;
      max-width: calc(100vw - 40px);
      background: #14161f;
      color: #f4f1e8;
      border: 1px solid rgba(232, 163, 61, 0.28);
      border-radius: 14px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
      animation: pl-rise 0.22s ease-out;
    }
    @keyframes pl-rise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .pl-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .pl-mark { width: 16px; height: 16px; flex: none; }
    .pl-title {
      font: 600 11px/1 ui-monospace, "SF Mono", "Cascadia Code", monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #E8A33D;
      flex: 1;
    }
    .pl-close {
      appearance: none;
      background: transparent;
      border: none;
      color: #7c7f8f;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 6px;
    }
    .pl-close:hover { background: rgba(255,255,255,0.08); color: #f4f1e8; }
    .pl-body { padding: 14px; }

    .pl-loading { display: flex; align-items: center; gap: 12px; padding: 4px 0 8px; }
    .pl-spinner { width: 28px; height: 28px; flex: none; animation: pl-spin 1.1s linear infinite; }
    @keyframes pl-spin { to { transform: rotate(360deg); } }
    .pl-loading-text { color: #b7b9c4; font-size: 12.5px; }

    .pl-prompt {
      max-height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: #0b0c11;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 10px 12px;
      margin: 0 0 12px;
      color: #f4f1e8;
    }
    .pl-meta {
      font: 500 10.5px/1 ui-monospace, "SF Mono", "Cascadia Code", monospace;
      color: #7c7f8f;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin: 0 0 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .pl-actions { display: flex; gap: 8px; }
    .pl-btn {
      flex: 1;
      appearance: none;
      border: none;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.12s ease, background 0.12s ease;
    }
    .pl-btn-primary { background: #E8A33D; color: #0b0c11; }
    .pl-btn-primary:hover { filter: brightness(1.08); }
    .pl-btn-secondary { background: rgba(255,255,255,0.06); color: #f4f1e8; }
    .pl-btn-secondary:hover { background: rgba(255,255,255,0.12); }
    .pl-error { color: #f0a494; background: rgba(226, 96, 75, 0.12); border: 1px solid rgba(226, 96, 75, 0.35); border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; }
    .pl-link { color: #E8A33D; text-decoration: underline; cursor: pointer; }
  `;

  function apertureSvg(spinning) {
    return `
      <svg class="${spinning ? "pl-spinner" : "pl-mark"}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="7" fill="#0b0c11"/>
        <g fill="#E8A33D">
          ${hexBlades(16, 16, 10).join("")}
        </g>
        <polygon points="${hexPoints(16, 16, 4.3).join(" ")}" fill="#0b0c11"/>
      </svg>`;
  }

  function hexPoints(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (-90 + i * 60);
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return pts;
  }

  function hexBlades(cx, cy, R) {
    const blades = [];
    const innerR = R * 0.42;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (-90 + i * 60);
      const next = (Math.PI / 180) * (-90 + (i + 1) * 60);
      const mid = (angle + next) / 2;
      const p1 = [cx + R * Math.cos(angle), cy + R * Math.sin(angle)];
      const p2 = [cx + R * Math.cos(next), cy + R * Math.sin(next)];
      const p3 = [cx + innerR * 1.05 * Math.cos(mid + 0.49), cy + innerR * 1.05 * Math.sin(mid + 0.49)];
      const p4 = [cx + innerR * 1.05 * Math.cos(mid - 0.49), cy + innerR * 1.05 * Math.sin(mid - 0.49)];
      blades.push(`<polygon points="${p1.join(",")} ${p3.join(",")} ${p4.join(",")} ${p2.join(",")}" />`);
    }
    return blades;
  }

  function ensureCard() {
    if (refs) return refs;
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CARD_CSS;
    const card = document.createElement("div");
    card.className = "pl-card";
    card.innerHTML = `
      <div class="pl-head">
        ${apertureSvg(false)}
        <span class="pl-title">PromptLens</span>
        <button class="pl-close" aria-label="Close">×</button>
      </div>
      <div class="pl-body"></div>
    `;
    shadow.appendChild(style);
    shadow.appendChild(card);
    document.documentElement.appendChild(host);

    const closeBtn = card.querySelector(".pl-close");
    closeBtn.addEventListener("click", () => {
      host.style.display = "none";
    });

    refs = { host, card, body: card.querySelector(".pl-body") };
    return refs;
  }

  function show() {
    const { host } = ensureCard();
    host.style.display = "block";
    if (hideTimer) clearTimeout(hideTimer);
  }

  function showLoading() {
    const { body } = ensureCard();
    show();
    body.innerHTML = `
      <div class="pl-loading">
        ${apertureSvg(true)}
        <span class="pl-loading-text">Reading the image and writing your prompt…</span>
      </div>
    `;
  }

  function showResult(data) {
    const { body } = ensureCard();
    show();
    const { prompt, providerLabel } = data || {};

    body.innerHTML = `
      <p class="pl-meta">Generated with ${escapeHtml(providerLabel)}</p>
      <div class="pl-prompt"></div>
      <div class="pl-actions">
        <button class="pl-btn pl-btn-primary" data-action="copy">Copy prompt</button>
        <button class="pl-btn pl-btn-secondary" data-action="regenerate">Regenerate</button>
      </div>
    `;
    body.querySelector(".pl-prompt").textContent = prompt;

    body.querySelector('[data-action="copy"]').addEventListener("click", (e) => {
      copyText(prompt, e.currentTarget);
    });
    body.querySelector('[data-action="regenerate"]').addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "PROMPTLENS_REGENERATE" });
      showLoading();
    });
  }

  function showError(message) {
    const { body } = ensureCard();
    show();
    const isKeyError = /api key|settings/i.test(message || "");
    body.innerHTML = `
      <div class="pl-error"></div>
      ${isKeyError ? '<p class="pl-meta"><span class="pl-link" data-action="open-settings">Open PromptLens settings →</span></p>' : ""}
    `;
    body.querySelector(".pl-error").textContent = message || "Something went wrong.";
    const link = body.querySelector('[data-action="open-settings"]');
    if (link) {
      link.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      });
    }
  }

  function copyText(text, buttonEl) {
    const done = () => {
      const original = buttonEl.textContent;
      buttonEl.textContent = "Copied ✓";
      setTimeout(() => (buttonEl.textContent = original), 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (_) {
      /* no-op */
    }
    document.body.removeChild(ta);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ================= Batch / select mode =================
  // Lets someone click any number of images on the page, then generate prompts for all of
  // them in one go. Entered via the "page" context menu item or the popup's button.

  const SELECT_HOST_ID = "promptlens-select-host";
  const MAX_BATCH_ITEMS = 40;
  let selectRefs = null;
  let selectModeActive = false;
  let selectPhase = "idle"; // "selecting" | "batch"
  const selectedImages = new Set();
  let batchItems = []; // [{ id, img, srcUrl, status, prompt, message }]

  const SELECT_CSS = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    .pl-mark { width: 16px; height: 16px; flex: none; }
    .pls-bar {
      position: fixed;
      left: 20px;
      bottom: 20px;
      z-index: 2147483647;
      width: 320px;
      max-width: calc(100vw - 40px);
      background: #14161f;
      color: #f4f1e8;
      border: 1px solid rgba(232, 163, 61, 0.28);
      border-radius: 14px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
      animation: pls-rise 0.22s ease-out;
    }
    @keyframes pls-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .pls-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .pls-title {
      font: 600 11px/1 ui-monospace, "SF Mono", "Cascadia Code", monospace;
      letter-spacing: 0.08em; text-transform: uppercase; color: #E8A33D; flex: 1;
    }
    .pls-close { appearance: none; background: transparent; border: none; color: #7c7f8f; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 6px; }
    .pls-close:hover { background: rgba(255,255,255,0.08); color: #f4f1e8; }
    .pls-body { padding: 14px; }
    .pls-hint { margin: 0 0 10px; font-size: 12px; color: #b7b9c4; }
    .pls-count-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .pls-count { font-weight: 700; font-size: 13px; color: #f4f1e8; }
    .pls-mini-actions { display: flex; gap: 6px; }
    .pls-mini-btn {
      appearance: none; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
      color: #b7b9c4; border-radius: 7px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .pls-mini-btn:hover { background: rgba(255,255,255,0.1); color: #f4f1e8; }
    .pl-btn { appearance: none; border: none; border-radius: 8px; padding: 9px 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; width: 100%; transition: filter 0.12s ease, background 0.12s ease, opacity 0.12s ease; }
    .pl-btn-primary { background: #E8A33D; color: #0b0c11; }
    .pl-btn-primary:hover { filter: brightness(1.08); }
    .pl-btn-primary:disabled { opacity: 0.45; cursor: default; filter: none; }
    .pl-btn-secondary { background: rgba(255,255,255,0.06); color: #f4f1e8; flex: 1; }
    .pl-btn-secondary:hover { background: rgba(255,255,255,0.12); }
    .pls-actions-row { display: flex; gap: 8px; margin-top: 10px; }
    .pls-list { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
    .pls-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: #0b0c11; border: 1px solid rgba(255,255,255,0.05); }
    .pls-row-status { flex: none; width: 16px; text-align: center; font-size: 12px; }
    .pls-row-status.is-error { color: #f0a494; }
    .pls-row-status.is-done { color: #6fbf8b; }
    .pls-row-status.is-loading { color: #E8A33D; animation: pls-pulse 1s ease-in-out infinite; }
    @keyframes pls-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    .pls-row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: #b7b9c4; }
    .pls-row-copy { appearance: none; border: none; background: rgba(232,163,61,0.14); color: #E8A33D; border-radius: 6px; padding: 3px 7px; font-size: 10.5px; font-weight: 700; cursor: pointer; flex: none; }
    .pls-row-copy:hover { background: rgba(232,163,61,0.24); }
  `;

  function ensureSelectBar() {
    if (selectRefs) return selectRefs;
    const host = document.createElement("div");
    host.id = SELECT_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SELECT_CSS;
    const bar = document.createElement("div");
    bar.className = "pls-bar";
    bar.innerHTML = `
      <div class="pls-head">
        ${apertureSvg(false)}
        <span class="pls-title">Select images</span>
        <button class="pls-close" aria-label="Close">×</button>
      </div>
      <div class="pls-body"></div>
    `;
    shadow.appendChild(style);
    shadow.appendChild(bar);
    document.documentElement.appendChild(host);
    bar.querySelector(".pls-close").addEventListener("click", exitSelectMode);
    selectRefs = { host, bar, body: bar.querySelector(".pls-body"), title: bar.querySelector(".pls-title") };
    return selectRefs;
  }

  function qualifiesForSelect(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.closest(`#${SELECT_HOST_ID}`) || img.closest(`#${HOST_ID}`)) return false;
    const rect = img.getBoundingClientRect();
    if (rect.width < 48 || rect.height < 48) return false;
    const style = getComputedStyle(img);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    return Boolean(img.currentSrc || img.src);
  }

  function setSelectedStyle(img, selected) {
    if (selected) {
      img.style.setProperty("outline", "3px solid #E8A33D", "important");
      img.style.setProperty("outline-offset", "-3px", "important");
      img.style.setProperty("cursor", "pointer", "important");
    } else {
      img.style.removeProperty("outline");
      img.style.removeProperty("outline-offset");
      if (!selectModeActive) img.style.removeProperty("cursor");
    }
  }

  function toggleSelection(img) {
    if (selectedImages.has(img)) {
      selectedImages.delete(img);
      setSelectedStyle(img, false);
    } else {
      selectedImages.add(img);
      setSelectedStyle(img, true);
    }
    renderSelectingBody();
  }

  function selectAllVisible() {
    document.querySelectorAll("img").forEach((img) => {
      if (qualifiesForSelect(img) && !selectedImages.has(img)) {
        selectedImages.add(img);
        setSelectedStyle(img, true);
      }
    });
    renderSelectingBody();
  }

  function clearSelection() {
    selectedImages.forEach((img) => setSelectedStyle(img, false));
    selectedImages.clear();
    renderSelectingBody();
  }

  function renderSelectingBody() {
    const { body, title } = ensureSelectBar();
    title.textContent = "Select images";
    const count = selectedImages.size;
    const label = count > 0 ? `Generate ${count} prompt${count === 1 ? "" : "s"}` : "Generate prompts";
    body.innerHTML = `
      <p class="pls-hint">Click any image on the page to select it for batch prompt generation${count > MAX_BATCH_ITEMS ? ` (first ${MAX_BATCH_ITEMS} will run)` : ""}.</p>
      <div class="pls-count-row">
        <span class="pls-count">${count} selected</span>
        <div class="pls-mini-actions">
          <button class="pls-mini-btn" data-action="select-all">Select all</button>
          <button class="pls-mini-btn" data-action="clear">Clear</button>
        </div>
      </div>
      <button class="pl-btn pl-btn-primary" data-action="generate" ${count ? "" : "disabled"}>${label}</button>
    `;
    body.querySelector('[data-action="select-all"]').addEventListener("click", selectAllVisible);
    body.querySelector('[data-action="clear"]').addEventListener("click", clearSelection);
    const genBtn = body.querySelector('[data-action="generate"]');
    if (genBtn) genBtn.addEventListener("click", startBatchGeneration);
  }

  function statusIcon(status) {
    if (status === "loading") return { icon: "◐", cls: "is-loading" };
    if (status === "done") return { icon: "✓", cls: "is-done" };
    if (status === "error") return { icon: "✕", cls: "is-error" };
    return { icon: "•", cls: "" };
  }

  function labelForUrl(url) {
    try {
      const u = new URL(url, location.href);
      const name = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
      return name.length > 34 ? name.slice(0, 31) + "…" : name;
    } catch (_) {
      return String(url).slice(0, 34);
    }
  }

  function renderBatchBody() {
    const { body, title } = ensureSelectBar();
    title.textContent = "Batch generating";
    const total = batchItems.length;
    const doneCount = batchItems.filter((b) => b.status === "done").length;
    const errorCount = batchItems.filter((b) => b.status === "error").length;
    const finished = doneCount + errorCount === total;

    const rowsHtml = batchItems
      .map((item) => {
        const { icon, cls } = statusIcon(item.status);
        return `
          <div class="pls-row">
            <span class="pls-row-status ${cls}">${icon}</span>
            <span class="pls-row-label" title="${escapeHtml(item.srcUrl)}">${escapeHtml(labelForUrl(item.srcUrl))}</span>
            <button class="pls-row-copy" data-action="copy-row" data-id="${item.id}" ${item.status === "done" ? "" : "hidden"}>Copy</button>
          </div>
        `;
      })
      .join("");

    const progressText = finished
      ? errorCount
        ? `Done — ${doneCount} generated, ${errorCount} failed.`
        : `Done — ${doneCount} generated.`
      : `Generating ${doneCount + errorCount} / ${total}…`;

    body.innerHTML = `
      <p class="pls-hint">${progressText}</p>
      <div class="pls-list">${rowsHtml}</div>
      <div class="pls-actions-row" ${finished && doneCount ? "" : "hidden"}>
        <button class="pl-btn pl-btn-secondary" data-action="copy-all">Copy all</button>
        <button class="pl-btn pl-btn-secondary" data-action="download-csv">Download CSV</button>
      </div>
    `;

    body.querySelectorAll('[data-action="copy-row"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = batchItems.find((b) => b.id === btn.dataset.id);
        if (item && item.prompt) copyText(item.prompt, btn);
      });
    });
    const copyAllBtn = body.querySelector('[data-action="copy-all"]');
    if (copyAllBtn) {
      copyAllBtn.addEventListener("click", (e) => {
        const combined = batchItems
          .filter((b) => b.status === "done" && b.prompt)
          .map((b) => b.prompt)
          .join("\n\n---\n\n");
        copyText(combined, e.currentTarget);
      });
    }
    const csvBtn = body.querySelector('[data-action="download-csv"]');
    if (csvBtn) csvBtn.addEventListener("click", downloadBatchCsv);
  }

  function csvEscape(value) {
    const str = String(value == null ? "" : value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function downloadBatchCsv() {
    const header = "Image URL,Prompt,Status\n";
    const rows = batchItems
      .map((b) => [csvEscape(b.srcUrl), csvEscape(b.prompt || b.message || ""), csvEscape(b.status)].join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `promptlens-batch-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function startBatchGeneration() {
    if (!selectedImages.size) return;
    selectPhase = "batch";
    const capped = Array.from(selectedImages).slice(0, MAX_BATCH_ITEMS);
    batchItems = capped.map((img, index) => ({
      id: `b${index}`,
      img,
      srcUrl: img.currentSrc || img.src,
      status: "pending",
      prompt: null,
      message: null,
    }));
    renderBatchBody();
    chrome.runtime.sendMessage({
      type: "PROMPTLENS_BATCH_GENERATE",
      items: batchItems.map((b) => ({ id: b.id, srcUrl: b.srcUrl })),
    });
  }

  function handleBatchItemUpdate(message) {
    const item = batchItems.find((b) => b.id === message.id);
    if (!item) return;
    item.status = message.status;
    if (message.status === "done") item.prompt = message.prompt;
    if (message.status === "error") item.message = message.message;
    renderBatchBody();
  }

  function enterSelectMode() {
    if (selectModeActive) return;
    hideHoverButton();
    selectModeActive = true;
    selectPhase = "selecting";
    renderSelectingBody();
    ensureSelectBar().host.style.display = "block";
  }

  function exitSelectMode() {
    selectModeActive = false;
    selectPhase = "idle";
    selectedImages.forEach((img) => setSelectedStyle(img, false));
    selectedImages.clear();
    batchItems = [];
    if (selectRefs) selectRefs.host.style.display = "none";
  }

  // ================= Hover quick-action button =================
  // A tiny floating button appears over any qualifying image on hover — a faster alternative to
  // the right-click menu for rapid-fire use. It always triggers the exact same PROMPTLENS_
  // GENERATE_FROM_HOVER -> runGeneration() flow as the context-menu item, so the result shows up
  // in the same pl-card as usual. Disabled automatically while select/batch mode is active, and
  // toggleable from the popup or Settings (persisted via settings.hoverButton.enabled).

  const HOVER_HOST_ID = "promptlens-hover-host";
  const HOVER_BTN_SIZE = 30;
  const HOVER_MIN_IMG_SIZE = 56; // a bit larger than batch mode's threshold so the button always fits comfortably
  const HOVER_HIDE_DELAY = 160; // ms grace period so moving the pointer onto the button itself doesn't hide it

  let hoverButtonEnabled = true; // updated from settings below; defaults to on
  let hoverRefs = null;
  let hoveredImg = null;
  let hoverHideTimer = null;
  let hoverRepositionQueued = false;

  const HOVER_CSS = `
    :host { all: initial; }
    .plh-btn {
      position: fixed;
      top: 0;
      left: 0;
      width: ${HOVER_BTN_SIZE}px;
      height: ${HOVER_BTN_SIZE}px;
      border-radius: 999px;
      background: #0b0c11;
      border: 1px solid rgba(232, 163, 61, 0.55);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45), 0 1px 4px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483647;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease, background 0.12s ease, border-color 0.12s ease;
    }
    .plh-btn.is-visible { opacity: 1; pointer-events: auto; }
    .plh-btn:hover { background: #1D2030; border-color: #E8A33D; }
    .plh-btn:active { opacity: 0.85; }
    .plh-btn svg { width: 16px; height: 16px; display: block; }
  `;

  function ensureHoverButton() {
    if (hoverRefs) return hoverRefs;
    const host = document.createElement("div");
    host.id = HOVER_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = HOVER_CSS;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "plh-btn";
    btn.setAttribute("aria-label", "Generate AI prompt for this image (PromptLens)");
    btn.title = "Generate AI prompt (PromptLens)";
    btn.innerHTML = apertureSvg(false);
    shadow.appendChild(style);
    shadow.appendChild(btn);
    document.documentElement.appendChild(host);

    // Hovering onto the button itself should cancel any pending hide from leaving the image.
    btn.addEventListener("mouseenter", () => {
      if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
        hoverHideTimer = null;
      }
    });
    btn.addEventListener("mouseleave", scheduleHoverHide);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredImg) return;
      const srcUrl = hoveredImg.currentSrc || hoveredImg.src;
      hideHoverButton();
      chrome.runtime.sendMessage({ type: "PROMPTLENS_GENERATE_FROM_HOVER", srcUrl });
    });

    hoverRefs = { host, btn };
    return hoverRefs;
  }

  function qualifiesForHover(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.closest(`#${SELECT_HOST_ID}`) || img.closest(`#${HOST_ID}`) || img.closest(`#${HOVER_HOST_ID}`)) return false;
    const rect = img.getBoundingClientRect();
    if (rect.width < HOVER_MIN_IMG_SIZE || rect.height < HOVER_MIN_IMG_SIZE) return false;
    const style = getComputedStyle(img);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    return Boolean(img.currentSrc || img.src);
  }

  function positionHoverButton(img) {
    const { btn } = ensureHoverButton();
    const rect = img.getBoundingClientRect();
    const inset = 8;
    let left = rect.right - HOVER_BTN_SIZE - inset;
    let top = rect.top + inset;
    // Clamp on-screen in case the image is larger than the viewport or hugging an edge.
    left = Math.max(4, Math.min(left, window.innerWidth - HOVER_BTN_SIZE - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - HOVER_BTN_SIZE - 4));
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
  }

  function showHoverButton(img) {
    if (!hoverButtonEnabled) return;
    hoveredImg = img;
    const { btn } = ensureHoverButton();
    positionHoverButton(img);
    btn.classList.add("is-visible");
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
  }

  function hideHoverButton() {
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
    hoveredImg = null;
    if (hoverRefs) hoverRefs.btn.classList.remove("is-visible");
  }

  function scheduleHoverHide() {
    if (hoverHideTimer) clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(hideHoverButton, HOVER_HIDE_DELAY);
  }

  function updateHoverPositionIfNeeded() {
    hoverRepositionQueued = false;
    if (!hoveredImg || !hoverRefs || !hoverRefs.btn.classList.contains("is-visible")) return;
    if (!document.documentElement.contains(hoveredImg) || !qualifiesForHover(hoveredImg)) {
      hideHoverButton();
      return;
    }
    positionHoverButton(hoveredImg);
  }

  // Some sites (Pinterest, Adobe Stock, and most other "hover a thumbnail" galleries) layer their
  // own hover overlay — a save button, license badge, gradient, etc. — directly on top of the
  // image the instant it's hovered. That overlay then becomes the topmost hit-test target, so the
  // browser reports a genuine "mouseout" on the <img> (relatedTarget = the site's overlay, not our
  // button) even though the cursor never actually left the thumbnail. Relying on event targets
  // alone can't tell those two situations apart, so we double-check with elementsFromPoint, which
  // returns the *entire* stack of elements under a point rather than just the topmost one.
  function isPointOnHoveredImage(x, y) {
    if (!hoveredImg) return false;
    if (typeof document.elementsFromPoint === "function") {
      try {
        return document.elementsFromPoint(x, y).includes(hoveredImg);
      } catch (_) {
        /* fall through to bounding-box check below */
      }
    }
    const r = hoveredImg.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      if (selectModeActive || !hoverButtonEnabled) return;
      const img = e.target && e.target.closest && e.target.closest("img");
      if (!img || !qualifiesForHover(img)) return;
      if (img === hoveredImg) {
        if (hoverHideTimer) {
          clearTimeout(hoverHideTimer);
          hoverHideTimer = null;
        }
        return;
      }
      showHoverButton(img);
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      if (!hoveredImg) return;
      const img = e.target && e.target.closest && e.target.closest("img");
      if (img !== hoveredImg) return;
      // Moving the pointer straight onto the button itself is retargeted to our shadow host —
      // don't start the hide timer in that case, the button's own mouseleave handles it instead.
      if (hoverRefs && e.relatedTarget === hoverRefs.host) return;
      // The pointer may still be sitting on the same image even though the reported target
      // changed — e.g. the page just layered its own hover overlay on top of it. Don't hide yet.
      if (isPointOnHoveredImage(e.clientX, e.clientY)) return;
      scheduleHoverHide();
    },
    true
  );

  // Once a site's own overlay takes over hit-testing on top of the image (see above), further
  // native mouseout events on the tracked <img> stop firing altogether — its closest("img") check
  // never matches again, so the handler above can no longer detect a *real* exit either. This
  // lightweight, rAF-throttled mousemove check is the fallback that keeps working in that case: it
  // watches the pointer position directly instead of trusting whichever element the browser
  // decides is topmost.
  let hoverMoveCheckQueued = false;
  document.addEventListener(
    "mousemove",
    (e) => {
      if (!hoveredImg || hoverMoveCheckQueued) return;
      hoverMoveCheckQueued = true;
      const x = e.clientX;
      const y = e.clientY;
      const overButton = Boolean(hoverRefs) && e.target === hoverRefs.host;
      requestAnimationFrame(() => {
        hoverMoveCheckQueued = false;
        if (!hoveredImg) return;
        if (overButton || isPointOnHoveredImage(x, y)) {
          if (hoverHideTimer) {
            clearTimeout(hoverHideTimer);
            hoverHideTimer = null;
          }
        } else if (!hoverHideTimer) {
          scheduleHoverHide();
        }
      });
    },
    true
  );

  // Nested scrollable containers don't bubble "scroll", but the capture phase still sees them —
  // keep the button glued to its image (or hide it once the image scrolls out of view/DOM).
  window.addEventListener(
    "scroll",
    () => {
      if (!hoveredImg || hoverRepositionQueued) return;
      hoverRepositionQueued = true;
      requestAnimationFrame(updateHoverPositionIfNeeded);
    },
    { capture: true, passive: true }
  );

  window.addEventListener("resize", () => {
    if (!hoveredImg || hoverRepositionQueued) return;
    hoverRepositionQueued = true;
    requestAnimationFrame(updateHoverPositionIfNeeded);
  });

  // Load the current setting, and keep it live-updated if changed from the popup/Settings page
  // while this page stays open (no need to refresh the tab for the toggle to take effect).
  (async () => {
    try {
      const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      hoverButtonEnabled = !settings || !settings.hoverButton ? true : Boolean(settings.hoverButton.enabled);
      if (!hoverButtonEnabled) hideHoverButton();
    } catch (_) {
      /* keep default (enabled) if settings couldn't be read */
    }
  })();

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const next = changes.settings.newValue;
      hoverButtonEnabled = !next || !next.hoverButton ? true : Boolean(next.hoverButton.enabled);
      if (!hoverButtonEnabled) hideHoverButton();
    });
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!selectModeActive || selectPhase !== "selecting") return;
      const img = e.target && e.target.closest && e.target.closest("img");
      if (!img || !qualifiesForSelect(img)) return;
      e.preventDefault();
      e.stopPropagation();
      toggleSelection(img);
    },
    true
  );

  document.addEventListener(
    "mouseover",
    (e) => {
      if (!selectModeActive || selectPhase !== "selecting") return;
      const img = e.target && e.target.closest && e.target.closest("img");
      if (!img || !qualifiesForSelect(img) || selectedImages.has(img)) return;
      img.style.setProperty("outline", "2px dashed rgba(232, 163, 61, 0.75)", "important");
      img.style.setProperty("outline-offset", "-2px", "important");
      img.style.setProperty("cursor", "pointer", "important");
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      if (!selectModeActive || selectPhase !== "selecting") return;
      const img = e.target && e.target.closest && e.target.closest("img");
      if (!img || selectedImages.has(img)) return;
      img.style.removeProperty("outline");
      img.style.removeProperty("outline-offset");
      img.style.removeProperty("cursor");
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectModeActive && selectPhase === "selecting") exitSelectMode();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "PROMPTLENS_LOADING") showLoading();
    if (message?.type === "PROMPTLENS_RESULT") showResult(message);
    if (message?.type === "PROMPTLENS_ERROR") showError(message.message);
    if (message?.type === "PROMPTLENS_ENTER_SELECT_MODE") enterSelectMode();
    if (message?.type === "PROMPTLENS_BATCH_ITEM_UPDATE") handleBatchItemUpdate(message);
    if (message?.type === "PROMPTLENS_BATCH_DONE") renderBatchBody();
  });
})();
