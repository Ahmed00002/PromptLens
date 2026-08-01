/**
 * Adobe Stock contributor-portal automation. Separate from the universal content.js on purpose:
 * this file is full of Adobe-specific DOM assumptions that will need updating whenever Adobe
 * changes their frontend, and keeping it isolated means that's the only file that ever needs
 * touching for that.
 *
 * SELECTORS below are confirmed against a real diagnostics capture of the live page (not
 * guesses) for the file card, title field, and keyword box — data-t test-id attributes where
 * available, since the CSS classes sitting right next to them (e.g. "zo2IKa_spectrum-Textfield-
 * input") are CSS-module hashes that will change on Adobe's next deploy.
 *
 * IMPORTANT — deliberately out of scope for now: the "Yes/No" toggle originally assumed to be
 * the AI-content disclosure question turned out, from the real markup, to be a model/property
 * RELEASE question (`name="hasReleases"`) — a different field entirely. Auto-answering "Yes" to
 * that when a release doesn't actually exist would be an incorrect legal declaration, not just a
 * wrong guess, so this file does not touch it at all.
 *
 * UI: a single draggable, collapsible control panel (replacing the earlier standalone button +
 * toast combo) — status line, progress bar, Start/Cancel, and live title-length / keyword-count
 * range sliders, all in one place. The already-filled modal is unchanged. Auto-trigger, the
 * popup's "Run now", and the panel's own Start button all funnel through the same performRun(),
 * so the panel's status always reflects whatever's actually happening regardless of what kicked
 * it off.
 */
(() => {
  const SELECTORS_READY = true;

  const SELECTORS = {
    // One uploaded file's card in the grid.
    fileCard: ".upload-tile",
    // That card's thumbnail — clicking this selects the card and switches the side panel to it.
    fileCardThumbnail: "img.upload-tile__thumbnail",
    // The (smaller) thumbnail in the side panel header — its src matching the just-clicked
    // card's thumbnail src is how we detect the panel has actually caught up after selecting.
    sidebarThumbnail: "img[data-t='asset-sidebar-header-thumbnail']",
    // Title field in the side panel.
    titleField: "textarea[data-t='asset-title-content-tagger']",
    // The bulk keyword paste box.
    keywordPasteBox: "#content-keywords-ui-textarea",
  };

  // Thumbnail-src keys of every file card that's already been handled (filled, explicitly
  // skipped via the modal, or found already-filled) — checked before auto-pilot ever selects a
  // card again, so a finished file is never re-visited for the rest of this page session. This
  // (combined with the card-count gate on the observer below) is what stops the feedback loop.
  const processedCardKeys = new Set();
  // Once the person checks "remember my choice" in the already-filled modal, this holds that
  // choice for the rest of the session so they're not asked again on every file.
  let sessionAlreadyFilledDecision = null;

  let cachedSettings = null;

  async function getSettings() {
    if (cachedSettings) return cachedSettings;
    cachedSettings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    return cachedSettings;
  }

  /** Persists a partial adobeStock update and keeps the local cache in sync. */
  async function saveAdobeStockSettings(partial) {
    const settings = await getSettings();
    settings.adobeStock = { ...settings.adobeStock, ...partial };
    cachedSettings = await chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      payload: { adobeStock: settings.adobeStock },
    });
  }

  // ---------------------------------------------------------------------------------------
  // Diagnostics — collects structured info about the live page so real selectors can be
  // wired in. Triggered from the popup's "Copy page diagnostics" button (see popup.js) via
  // the ADOBE_STOCK_COLLECT_DIAGNOSTICS message below. Everything here is read-only.
  //
  // A plain `document.querySelectorAll()` only sees the top-level document — it does NOT
  // reach into <iframe> content or shadow DOM subtrees, both common in modern component-based
  // SPAs. The first version of this collector only checked the top document and came back
  // completely empty (zero images, zero text fields, zero buttons) even on a page with visible
  // content — a strong signal the real UI lives in one of those. This version walks into every
  // reachable root: same-origin iframes (cross-origin ones are simply inaccessible to any
  // extension content script and are reported as such, not silently skipped) and open shadow
  // roots (closed shadow roots are, by design, inaccessible to any outside script — Adobe would
  // have to be using one specifically to block DevTools/extensions, which is unusual for a
  // contributor upload form, but if that turns out to be the case it'll show up here as a gap
  // between "elements with a shadow root" and "shadow roots we could actually read").
  // ---------------------------------------------------------------------------------------

  function describeAncestors(el, depth) {
    const chain = [];
    let node = el.parentElement;
    for (let i = 0; i < depth && node; i++) {
      chain.push({
        tag: node.tagName,
        id: node.id || null,
        className: (node.className && String(node.className).slice(0, 100)) || null,
      });
      node = node.parentElement;
    }
    return chain;
  }

  /** Every document/shadow-root we can actually read from this page, plus a report on what we couldn't. */
  function discoverRoots() {
    const roots = [{ label: "top document", root: document }];
    const inaccessibleFrames = [];
    let shadowHostCount = 0;

    function collectShadowRoots(root, labelPrefix) {
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          shadowHostCount++;
          roots.push({ label: `${labelPrefix} > shadow root on <${el.tagName.toLowerCase()}>`, root: el.shadowRoot });
          collectShadowRoots(el.shadowRoot, `${labelPrefix} > <${el.tagName.toLowerCase()}> shadow`);
        }
      });
    }

    // Same-origin iframes. Cross-origin ones throw on .contentDocument access (browser
    // same-origin policy) — that's expected and just gets recorded, not treated as an error.
    document.querySelectorAll("iframe").forEach((frame, i) => {
      try {
        if (frame.contentDocument) {
          roots.push({ label: `iframe #${i} (${frame.src || "no src"})`, root: frame.contentDocument });
        }
      } catch (_) {
        inaccessibleFrames.push(frame.src || "(no src attribute)");
      }
    });

    // Shadow roots, recursively, across every root discovered so far (including inside iframes).
    roots.slice().forEach(({ root, label }) => collectShadowRoots(root, label));

    return { roots, inaccessibleFrames, shadowHostCount };
  }

  function findInRoot(root) {
    const thumbs = Array.from(root.querySelectorAll("img"))
      .map((img) => ({ img, rect: img.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 40 && rect.width < 400 && rect.height > 40 && rect.height < 400)
      .slice(0, 6)
      .map(({ img }) => ({
        src: (img.currentSrc || img.src || "").slice(0, 160),
        outerHTML: img.outerHTML.slice(0, 300),
        ancestorChain: describeAncestors(img, 4),
      }));

    const fields = Array.from(root.querySelectorAll("textarea, [contenteditable='true'], input[type='text']"))
      .slice(0, 14)
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute("type"),
        placeholder: el.getAttribute("placeholder"),
        ariaLabel: el.getAttribute("aria-label"),
        id: el.id || null,
        className: (el.className && String(el.className).slice(0, 120)) || null,
        outerHTML: el.outerHTML.slice(0, 250),
      }));

    const yesNo = Array.from(root.querySelectorAll("button, [role='button']"))
      .filter((el) => /^(yes|no)$/i.test((el.textContent || "").trim()))
      .slice(0, 6)
      .map((el) => ({
        text: el.textContent.trim(),
        outerHTML: el.outerHTML.slice(0, 250),
        parentOuterHTML: el.parentElement ? el.parentElement.outerHTML.slice(0, 500) : null,
      }));

    return { thumbs, fields, yesNo };
  }

  function collectDiagnostics() {
    const report = { url: location.href, timestamp: new Date().toISOString() };
    const { roots, inaccessibleFrames, shadowHostCount } = discoverRoots();

    report.rootsSearched = roots.map((r) => r.label);
    report.crossOriginFramesSkipped = inaccessibleFrames; // these are simply unreachable — expected, not a bug
    report.shadowHostsFound = shadowHostCount;

    report.byRoot = [];
    let totalFound = 0;
    roots.forEach(({ label, root }) => {
      const { thumbs, fields, yesNo } = findInRoot(root);
      if (thumbs.length || fields.length || yesNo.length) {
        totalFound += thumbs.length + fields.length + yesNo.length;
        report.byRoot.push({ root: label, candidateThumbnails: thumbs, textFields: fields, yesNoElements: yesNo });
      }
    });

    if (totalFound === 0) {
      // Nothing matched anywhere we could reach — fall back to a raw (truncated) snapshot of
      // the top document's body so there's still something to look at, plus enough page stats
      // to tell whether this is a timing issue (page not fully loaded yet) or something else.
      report.fallbackNote =
        "Nothing matched in any reachable root (including iframes and open shadow roots). " +
        "This could mean: the page hadn't finished loading when this ran, the real UI is inside " +
        "a CLOSED shadow root (unreachable by any script, extension or otherwise), or it's inside " +
        "a cross-origin iframe listed in crossOriginFramesSkipped above.";
      report.pageStats = {
        readyState: document.readyState,
        totalImgTagsTopDocument: document.querySelectorAll("img").length,
        totalIframes: document.querySelectorAll("iframe").length,
        bodyChildElementCount: document.body ? document.body.childElementCount : 0,
      };
      report.bodyHtmlSnapshot = document.body ? document.body.outerHTML.slice(0, 5000) : null;
    }

    report.note =
      "Everything under byRoot is a heuristic guess, not confirmed selectors. Send this whole JSON back to get exact selectors wired into adobe-stock.js.";

    return report;
  }

  // ---------------------------------------------------------------------------------------
  // React-controlled-input safe value setter. A plain `el.value = x` is silently ignored (or
  // reverted) by React-controlled inputs, because React tracks value changes through its own
  // synthetic event system, not the raw DOM property. Going through the native setter and then
  // dispatching a real `input` event is the standard workaround. Kept here, ready to use, even
  // though nothing calls it yet.
  // ---------------------------------------------------------------------------------------

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setContentEditableValue(el, value) {
    el.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Simple delay helper — used to give Adobe's own (presumably debounced) field save a moment to actually fire before the automation moves on and switches the selected card out from under it. */
  function settle(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------------------
  // Automation — per-card selection (with an actual wait for the side panel to catch up,
  // rather than a fixed delay), the already-filled check, filling fields, and the sequential
  // auto-pilot loop across every card.
  // ---------------------------------------------------------------------------------------

  function findFileCards() {
    return Array.from(document.querySelectorAll(SELECTORS.fileCard));
  }

  function getCardThumbnailSrc(card) {
    const img = card.querySelector(SELECTORS.fileCardThumbnail);
    return img ? img.currentSrc || img.src : null;
  }

  /** Unique per-file key (the thumbnail URL is stable and unique per uploaded file). */
  function cardKeyFor(card) {
    return getCardThumbnailSrc(card);
  }

  /** Polls the side panel's thumbnail until it matches the just-selected card, or times out. */
  function waitForSidebarMatch(expectedSrc, timeoutMs = 4000, intervalMs = 150) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        const sidebarImg = document.querySelector(SELECTORS.sidebarThumbnail);
        const currentSrc = sidebarImg ? sidebarImg.currentSrc || sidebarImg.src : null;
        if (currentSrc && currentSrc === expectedSrc) {
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, intervalMs);
        }
      })();
    });
  }

  /** Clicks a card's thumbnail (the precise clickable surface, rather than the whole card container) and waits for the side panel to actually reflect it before returning. */
  async function selectCard(card) {
    const img = card.querySelector(SELECTORS.fileCardThumbnail);
    if (!img) return false;
    const expectedSrc = img.currentSrc || img.src;
    img.click();
    return waitForSidebarMatch(expectedSrc);
  }

  /** Finds a card fresh by thumbnail src, since a card reference held across an await can go stale if Adobe's own UI re-renders/re-sorts the grid in the meantime. */
  function findCardByThumbnailSrc(expectedSrc) {
    return findFileCards().find((c) => getCardThumbnailSrc(c) === expectedSrc) || null;
  }

  /**
   * Confirms the side panel is still showing `expectedSrc` right now, re-selecting if it isn't.
   * Metadata generation is an async network+AI round trip that can take several seconds, and
   * nothing stops the selected file from changing while that's in flight — the person clicking a
   * different thumbnail, or Adobe's own grid re-rendering/re-sorting after a batch upload. Filling
   * without this check writes whichever file is on screen *now*, not the one this metadata was
   * actually generated for, which is exactly how metadata ends up on the wrong file. Called right
   * before writing to the fields, not just once up front, since "right up front" is precisely the
   * state that can no longer be trusted by then.
   */
  async function ensureCardSelected(card, expectedSrc) {
    const sidebarImg = document.querySelector(SELECTORS.sidebarThumbnail);
    const currentSrc = sidebarImg ? sidebarImg.currentSrc || sidebarImg.src : null;
    if (currentSrc && currentSrc === expectedSrc) return true;

    // Drifted — re-find the card (the original reference may be a stale/detached node by now)
    // and try once to get back to it before giving up.
    const freshCard = findCardByThumbnailSrc(expectedSrc) || card;
    return selectCard(freshCard);
  }

  function getTitleField() {
    return document.querySelector(SELECTORS.titleField);
  }

  function getKeywordBox() {
    return document.querySelector(SELECTORS.keywordPasteBox);
  }

  /** Checked only after the card is selected and the side panel has caught up to it. */
  function currentTitleIsFilled() {
    const field = getTitleField();
    return Boolean(field && field.value && field.value.trim().length > 0);
  }

  function fillTitle(title) {
    const field = getTitleField();
    if (!field) throw new Error("Title field not found on the page.");
    setNativeValue(field, title);
  }

  function fillKeywords(keywords) {
    const box = getKeywordBox();
    if (!box) throw new Error("Keyword paste box not found on the page.");
    setNativeValue(box, keywords.join(", "));
    // The paste box's own onChange/onInput handler (fired by setNativeValue above) most likely
    // already parses+commits the pasted text into keyword chips. As a safety net in case that
    // commit is instead keyed off Enter, also dispatch a synthetic Enter keydown/keyup —
    // synthetic (untrusted) keyboard events fire JS listeners but the browser does NOT perform
    // native text-insertion for them, so this can't corrupt the value just set above; it can
    // only trigger a handler that's listening for it, or do nothing.
    const enterOpts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
    box.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
    box.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
  }

  /**
   * Handles one card end to end: select it, resolve the already-filled question (via the
   * session-remembered decision or a fresh modal prompt), generate if needed, fill, and mark it
   * processed so neither auto-pilot nor the mutation observer ever revisits it. Used by both the
   * auto-pilot loop and the manual generate button.
   */
  async function runSingleCard(card) {
    try {
      return await runSingleCardInner(card);
    } catch (err) {
      // Belt-and-suspenders: everything inside runSingleCardInner already has its own try/catch
      // around the parts most likely to throw, but this outer one guarantees that *any* surprise
      // (an Adobe DOM shape we didn't anticipate, etc.) still comes back as a normal failure
      // result rather than an uncaught rejection — which is what used to leave the whole panel
      // stuck mid-run until the page was refreshed.
      return { ok: false, message: err?.message || String(err) };
    }
  }

  async function runSingleCardInner(card) {
    const key = cardKeyFor(card);

    const selected = await selectCard(card);
    if (!selected) {
      return { ok: false, message: "Timed out waiting for the side panel to update for this file." };
    }

    if (currentTitleIsFilled()) {
      let action = sessionAlreadyFilledDecision;
      if (!action) {
        const decision = await showAlreadyFilledModal();
        action = decision.action;
        if (decision.applyToAll) sessionAlreadyFilledDecision = decision.action;
      }
      if (action === "skip") {
        if (key) processedCardKeys.add(key);
        return { ok: true, skipped: true };
      }
      // else "overwrite" — fall through to generate & fill as normal
    }

    const thumbSrc = getCardThumbnailSrc(card);
    if (!thumbSrc) {
      return { ok: false, message: "Could not find this file's thumbnail image." };
    }

    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "ADOBE_STOCK_GENERATE_METADATA", srcUrl: thumbSrc });
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }
    if (!res?.ok) {
      // Not marked as processed — a transient failure (rate limit exhausted across every
      // configured provider, a network hiccup) may well succeed on a later manual "Run now" or
      // the next genuinely-new-file auto-trigger pass, so it stays eligible for retry.
      return { ok: false, message: res?.message || "Metadata generation failed." };
    }

    // The generation call above is an async network+AI round trip (can easily take several
    // seconds), during which the side panel's selection can drift — a click elsewhere, or
    // Adobe's own grid re-rendering after a batch upload. fillTitle/fillKeywords write to
    // whatever is on screen *right now*, so without re-confirming here, this file's metadata can
    // land on a completely different file. This is the fix for that mix-up.
    const stillOnRightFile = await ensureCardSelected(card, thumbSrc);
    if (!stillOnRightFile) {
      // Not marked as processed, same reasoning as the failure branch above — safe to retry.
      return {
        ok: false,
        message: "Lost track of the selected file while generating — skipped instead of risking writing this metadata to the wrong file.",
      };
    }

    try {
      fillTitle(res.title);
      fillKeywords(res.keywords);
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }

    // fillKeywords only simulates the keystrokes that get the pasted text parsed into chips —
    // it does not confirm those chips are actually saved against *this* file. Adobe's own save
    // for both fields is presumably debounced or blur-triggered rather than instant, and the very
    // next thing this loop does is call selectCard() on the *next* file. If that happens before
    // Adobe's debounce fires, the save lands against whichever file is selected *then* — i.e. the
    // next one — not this one. That mismatch is indistinguishable from a title/keyword mix-up
    // from the outside, but it's really a timing issue here, not a generation issue. Dispatching
    // blur forces any blur-triggered save to run now, while this file is still selected, and the
    // settle delay gives a debounce-based save time to actually fire before we move on.
    getTitleField()?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    getKeywordBox()?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    await settle(700);

    if (key) processedCardKeys.add(key);
    // Deliberately not touching the model/property-release toggle here — see the file-level
    // comment at the top for why.
    return { ok: true, title: res.title, keywords: res.keywords };
  }

  let cancelRequested = false;

  /**
   * Processes every not-yet-handled card, reporting progress via onProgress(done, total) as it
   * goes, and returns a summary the caller (the panel) turns into status text. Checked for
   * cancellation between cards so a long batch can be interrupted from the panel's Cancel button.
   */
  async function runAutoPilot(onProgress) {
    const settings = await getSettings();
    if (!settings.adobeStock?.enabled) return { total: 0, filled: 0, skipped: 0, failed: 0, cancelled: false };

    const cards = findFileCards().filter((card) => {
      const key = cardKeyFor(card);
      return !key || !processedCardKeys.has(key);
    });

    let filled = 0;
    let skipped = 0;
    let failed = 0;
    const total = cards.length;
    let done = 0;
    for (const card of cards) {
      if (cancelRequested) break;
      // Selecting cards is an inherently sequential UI interaction (one side panel, one file
      // shown at a time), so this loop is intentionally sequential rather than parallel.
      // eslint-disable-next-line no-await-in-loop
      const result = await runSingleCard(card);
      done++;
      if (result.skipped) skipped++;
      else if (result.ok) filled++;
      else failed++;
      if (onProgress) onProgress(done, total);
    }

    return { total, filled, skipped, failed, cancelled: cancelRequested };
  }

  // ---------------------------------------------------------------------------------------
  // Already-filled modal — a real confirmation dialog instead of silently skipping. Returns
  // { action: "skip" | "overwrite", applyToAll: boolean }.
  // ---------------------------------------------------------------------------------------

  let modalHost = null;

  function ensureModalHost() {
    if (modalHost) return modalHost;
    modalHost = document.createElement("div");
    modalHost.id = "promptlens-adobe-stock-modal";
    const shadow = modalHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .pl-modal-backdrop {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(10, 11, 15, 0.55);
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: pl-fade-in 0.15s ease-out;
      }
      @keyframes pl-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .pl-modal {
        width: 340px; max-width: calc(100vw - 40px);
        background: #14161f; color: #f4f1e8;
        border: 1px solid rgba(232, 163, 61, 0.3);
        border-radius: 14px; padding: 18px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      }
      .pl-modal-title { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: #E8A33D; }
      .pl-modal-body { margin: 0 0 14px; font-size: 12.5px; line-height: 1.5; color: #b7b9c4; }
      .pl-modal-checkbox {
        display: flex; align-items: flex-start; gap: 8px;
        font-size: 11.5px; color: #b7b9c4; margin-bottom: 16px; cursor: pointer;
      }
      .pl-modal-checkbox input { margin-top: 2px; accent-color: #E8A33D; }
      .pl-modal-actions { display: flex; gap: 8px; }
      .pl-modal-btn {
        flex: 1; appearance: none; border: none; border-radius: 8px;
        padding: 9px 10px; font-size: 12.5px; font-weight: 600; cursor: pointer;
      }
      .pl-modal-btn-secondary { background: rgba(255,255,255,0.06); color: #f4f1e8; }
      .pl-modal-btn-secondary:hover { background: rgba(255,255,255,0.12); }
      .pl-modal-btn-primary { background: #E8A33D; color: #0b0c11; }
      .pl-modal-btn-primary:hover { filter: brightness(1.08); }
    `;
    shadow.appendChild(style);
    document.documentElement.appendChild(modalHost);
    return modalHost;
  }

  function showAlreadyFilledModal() {
    return new Promise((resolve) => {
      const host = ensureModalHost();
      const wrapper = document.createElement("div");
      wrapper.className = "pl-modal-backdrop";
      wrapper.innerHTML = `
        <div class="pl-modal">
          <p class="pl-modal-title">This file already has a title</p>
          <p class="pl-modal-body">
            PromptLens found existing text in the title field for this file. What should it do?
          </p>
          <label class="pl-modal-checkbox">
            <input type="checkbox" id="pl-modal-remember" />
            <span>Do this for every already-filled file for the rest of this session</span>
          </label>
          <div class="pl-modal-actions">
            <button class="pl-modal-btn pl-modal-btn-secondary" data-action="skip">Skip this file</button>
            <button class="pl-modal-btn pl-modal-btn-primary" data-action="overwrite">Overwrite</button>
          </div>
        </div>
      `;
      host.shadowRoot.appendChild(wrapper);

      function finish(action) {
        const applyToAll = wrapper.querySelector("#pl-modal-remember").checked;
        wrapper.remove();
        resolve({ action, applyToAll });
      }
      wrapper.querySelector('[data-action="skip"]').addEventListener("click", () => finish("skip"));
      wrapper.querySelector('[data-action="overwrite"]').addEventListener("click", () => finish("overwrite"));
    });
  }

  // ---------------------------------------------------------------------------------------
  // Control panel — draggable (grab the header), collapsible, with a live status line,
  // progress bar, Start/Cancel button, and title-length / keyword-count range sliders. This is
  // the single on-page surface for the feature; auto-trigger and the popup's "Run now" both run
  // through the same performRun() below, so whatever's actually happening (or not) is always
  // reflected here regardless of what kicked it off.
  // ---------------------------------------------------------------------------------------

  let panelHost = null;
  let panelEls = null; // cached references into the shadow DOM once built
  let runInProgress = false;

  const SPARKLE_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24"><path d="M12 2 L14.2 9 L21 11 L14.2 13 L12 20 L9.8 13 L3 11 L9.8 9 Z" fill="#E8A33D"/></svg>';

  function ensurePanel() {
    if (panelHost) return panelEls;

    panelHost = document.createElement("div");
    panelHost.id = "promptlens-adobe-stock-panel";
    const shadow = panelHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .pl-panel {
          position: fixed; top: 90px; right: 20px; z-index: 2147483000;
          width: 340px; max-width: calc(100vw - 32px);
          background: #0b0c11; color: #f4f1e8;
          border: 1px solid rgba(232, 163, 61, 0.3);
          border-radius: 16px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
          user-select: none;
        }
        .pl-panel-head {
          display: flex; align-items: center; gap: 8px;
          padding: 13px 14px; background: #14161f;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          cursor: move; touch-action: none;
        }
        .pl-panel-title {
          flex: 1; font: 700 11.5px/1 ui-monospace, "SF Mono", "Cascadia Code", monospace;
          letter-spacing: 0.07em; text-transform: uppercase; color: #E8A33D;
        }
        .pl-panel-collapse {
          appearance: none; border: none; background: transparent; color: #7c7f8f;
          cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px;
        }
        .pl-panel-collapse:hover { background: rgba(255,255,255,0.08); color: #f4f1e8; }
        .pl-panel-body { padding: 16px; user-select: text; }
        .pl-panel.is-collapsed .pl-panel-body { display: none; }
        .pl-status { margin: 0 0 12px; font-size: 12.5px; line-height: 1.5; color: #b7b9c4; }
        .pl-progress-track {
          height: 4px; border-radius: 999px; background: rgba(255,255,255,0.08);
          margin-bottom: 14px; overflow: hidden;
        }
        .pl-progress-fill {
          height: 100%; width: 0%; background: #E8A33D; border-radius: 999px;
          transition: width 0.25s ease;
        }
        .pl-start-btn {
          width: 100%; appearance: none; border: none; border-radius: 10px;
          padding: 12px; margin-bottom: 18px;
          background: #E8A33D; color: #0b0c11;
          font: 700 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          cursor: pointer; transition: filter 0.12s ease;
        }
        .pl-start-btn:hover { filter: brightness(1.08); }
        .pl-start-btn.is-running { background: rgba(255,255,255,0.08); color: #f4f1e8; }
        .pl-generate-current-btn {
          width: 100%; appearance: none; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px;
          padding: 10px; margin: -8px 0 18px;
          background: transparent; color: #b7b9c4;
          font: 700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          cursor: pointer; transition: filter 0.12s ease, background 0.12s ease;
        }
        .pl-generate-current-btn:hover { background: rgba(255,255,255,0.06); }
        .pl-generate-current-btn:disabled { opacity: 0.5; cursor: default; background: transparent; }
        .pl-slider-group { margin-bottom: 16px; }
        .pl-slider-row {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
        }
        .pl-slider-label {
          font: 700 10.5px/1 ui-monospace, "SF Mono", "Cascadia Code", monospace;
          letter-spacing: 0.05em; text-transform: uppercase; color: #7c7f8f;
        }
        .pl-slider-value {
          font: 700 12px ui-monospace, "SF Mono", "Cascadia Code", monospace; color: #E8A33D;
        }
        .pl-range-wrap { position: relative; height: 18px; }
        .pl-range-track {
          position: absolute; top: 50%; left: 0; right: 0; height: 4px;
          background: rgba(255,255,255,0.12); border-radius: 999px; transform: translateY(-50%);
        }
        .pl-range-fill {
          position: absolute; top: 50%; height: 4px; background: #E8A33D;
          border-radius: 999px; transform: translateY(-50%);
        }
        .pl-range {
          position: absolute; top: 0; left: 0; width: 100%; height: 18px; margin: 0;
          background: transparent; pointer-events: none;
          -webkit-appearance: none; appearance: none;
        }
        .pl-range::-webkit-slider-thumb {
          pointer-events: auto; -webkit-appearance: none; appearance: none;
          width: 15px; height: 15px; border-radius: 50%;
          background: #E8A33D; border: 2px solid #0b0c11; cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .pl-range::-moz-range-thumb {
          pointer-events: auto; width: 15px; height: 15px; border-radius: 50%;
          background: #E8A33D; border: 2px solid #0b0c11; cursor: pointer;
        }
        .pl-range::-moz-range-track { background: transparent; border: none; }
        .pl-field-group { margin-bottom: 16px; }
        .pl-field-label {
          display: block; margin-bottom: 8px;
          font: 700 10.5px/1 ui-monospace, "SF Mono", "Cascadia Code", monospace;
          letter-spacing: 0.05em; text-transform: uppercase; color: #7c7f8f;
        }
        .pl-select {
          width: 100%; appearance: none; -webkit-appearance: none;
          background: #14161f; color: #f4f1e8;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
          padding: 8px 10px; font-size: 12.5px; font-weight: 600;
          font-family: inherit; cursor: pointer; outline: none;
        }
        .pl-select:focus { border-color: rgba(232, 163, 61, 0.5); }
        .pl-field-hint { margin: 6px 0 0; font-size: 11px; line-height: 1.4; color: #6E7180; }
        .pl-footer { margin: 0; font-size: 11px; line-height: 1.5; color: #6E7180; }
        .pl-footer a { color: #E8A33D; text-decoration: none; font-weight: 600; cursor: pointer; }
        .pl-footer a:hover { text-decoration: underline; }
      </style>
      <div class="pl-panel" id="panel">
        <div class="pl-panel-head" id="panel-head">
          ${SPARKLE_SVG}
          <span class="pl-panel-title">Adobe Stock auto-fill</span>
          <button class="pl-panel-collapse" id="panel-collapse" aria-label="Collapse">—</button>
        </div>
        <div class="pl-panel-body">
          <p class="pl-status" id="panel-status">
            Idle — click Start to generate a title &amp; keywords for every uploaded file.
          </p>
          <div class="pl-progress-track"><div class="pl-progress-fill" id="panel-progress"></div></div>
          <button class="pl-start-btn" id="panel-start">Start</button>
          <button class="pl-generate-current-btn" id="panel-generate-current">Generate this file</button>

          <div class="pl-slider-group">
            <div class="pl-slider-row">
              <span class="pl-slider-label">Title length</span>
              <span class="pl-slider-value" id="title-range-value">20–70 chars</span>
            </div>
            <div class="pl-range-wrap">
              <div class="pl-range-track"></div>
              <div class="pl-range-fill" id="title-range-fill"></div>
              <input type="range" class="pl-range" id="title-min" min="10" max="200" step="1" />
              <input type="range" class="pl-range" id="title-max" min="10" max="200" step="1" />
            </div>
          </div>

          <div class="pl-slider-group">
            <div class="pl-slider-row">
              <span class="pl-slider-label">Keyword count</span>
              <span class="pl-slider-value" id="keyword-range-value">30–49</span>
            </div>
            <div class="pl-range-wrap">
              <div class="pl-range-track"></div>
              <div class="pl-range-fill" id="keyword-range-fill"></div>
              <input type="range" class="pl-range" id="keyword-min" min="5" max="49" step="1" />
              <input type="range" class="pl-range" id="keyword-max" min="5" max="49" step="1" />
            </div>
          </div>

          <div class="pl-field-group">
            <span class="pl-field-label">Keyword type</span>
            <select class="pl-select" id="keyword-type"></select>
            <p class="pl-field-hint" id="keyword-type-hint"></p>
          </div>

          <p class="pl-footer">
            Files with an existing title or keywords always ask first — nothing is overwritten
            silently. Click a file's thumbnail to open it, then use "Generate this file" to
            fill just that one. <a id="panel-more-settings">More settings →</a>
          </p>
        </div>
      </div>
    `;
    document.documentElement.appendChild(panelHost);

    panelEls = {
      panel: shadow.getElementById("panel"),
      head: shadow.getElementById("panel-head"),
      collapseBtn: shadow.getElementById("panel-collapse"),
      status: shadow.getElementById("panel-status"),
      progress: shadow.getElementById("panel-progress"),
      startBtn: shadow.getElementById("panel-start"),
      generateCurrentBtn: shadow.getElementById("panel-generate-current"),
      titleMin: shadow.getElementById("title-min"),
      titleMax: shadow.getElementById("title-max"),
      titleFill: shadow.getElementById("title-range-fill"),
      titleValue: shadow.getElementById("title-range-value"),
      keywordMin: shadow.getElementById("keyword-min"),
      keywordMax: shadow.getElementById("keyword-max"),
      keywordFill: shadow.getElementById("keyword-range-fill"),
      keywordValue: shadow.getElementById("keyword-range-value"),
      keywordType: shadow.getElementById("keyword-type"),
      keywordTypeHint: shadow.getElementById("keyword-type-hint"),
      moreSettings: shadow.getElementById("panel-more-settings"),
    };

    wireDragging(panelEls.panel, panelEls.head, panelEls.collapseBtn);
    wireCollapse(panelEls.panel, panelEls.collapseBtn);
    wireStartButton(panelEls.startBtn);
    wireGenerateCurrentButton(panelEls.generateCurrentBtn);
    panelEls.moreSettings.addEventListener("click", () => chrome.runtime.openOptionsPage());

    return panelEls;
  }

  /** Drag-to-reposition by the header, using Pointer Events (unifies mouse/touch, and setPointerCapture keeps tracking even if the cursor briefly leaves the header during a fast drag). Clamped so the panel can't be dragged off-screen. */
  function wireDragging(panel, handle, collapseBtn) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("pointerdown", (e) => {
      if (e.target === collapseBtn) return; // don't start a drag from the collapse button
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      const x = Math.min(Math.max(0, e.clientX - offsetX), Math.max(0, maxX));
      const y = Math.min(Math.max(0, e.clientY - offsetY), Math.max(0, maxY));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.style.right = "auto";
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (_) {
        // already released — harmless
      }
    }
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function wireCollapse(panel, collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("is-collapsed");
      collapseBtn.textContent = collapsed ? "▢" : "—";
      collapseBtn.setAttribute("aria-label", collapsed ? "Expand" : "Collapse");
    });
  }

  /** Wires one min/max slider pair: keeps min<=max, updates the fill bar + value label, and persists on change (not on every input tick, to avoid a storage write per pixel of drag). */
  function setupRangePair(minInput, maxInput, fillEl, valueEl, unit, onCommit) {
    function pct(v) {
      const min = Number(minInput.min);
      const max = Number(minInput.max);
      return ((v - min) / (max - min)) * 100;
    }
    function render() {
      const lo = Number(minInput.value);
      const hi = Number(maxInput.value);
      fillEl.style.left = `${pct(lo)}%`;
      fillEl.style.width = `${Math.max(0, pct(hi) - pct(lo))}%`;
      valueEl.textContent = `${lo}–${hi}${unit}`;
    }
    minInput.addEventListener("input", () => {
      if (Number(minInput.value) > Number(maxInput.value)) minInput.value = maxInput.value;
      render();
    });
    maxInput.addEventListener("input", () => {
      if (Number(maxInput.value) < Number(minInput.value)) maxInput.value = minInput.value;
      render();
    });
    [minInput, maxInput].forEach((el) =>
      el.addEventListener("change", () => onCommit(Number(minInput.value), Number(maxInput.value)))
    );
    render();
    return {
      setValues(lo, hi) {
        minInput.value = lo;
        maxInput.value = hi;
        render();
      },
    };
  }

  async function initSliders(els) {
    const settings = await getSettings();
    const as = settings.adobeStock || {};

    const titleRange = setupRangePair(
      els.titleMin,
      els.titleMax,
      els.titleFill,
      els.titleValue,
      " chars",
      (lo, hi) => saveAdobeStockSettings({ titleMinLength: lo, titleMaxLength: hi })
    );
    titleRange.setValues(as.titleMinLength ?? 20, as.titleMaxLength ?? 70);

    const keywordRange = setupRangePair(els.keywordMin, els.keywordMax, els.keywordFill, els.keywordValue, "", (lo, hi) =>
      saveAdobeStockSettings({ keywordMin: lo, keywordMax: hi })
    );
    keywordRange.setValues(as.keywordMin ?? 30, as.keywordMax ?? 49);

    setupKeywordTypeSelect(els.keywordType, els.keywordTypeHint, as.keywordType ?? "mixed");
  }

  /** Populates and wires the keyword-type dropdown (mixed / single-word / long-tail keywords). */
  function setupKeywordTypeSelect(selectEl, hintEl, initialValue) {
    if (!selectEl.options.length) {
      KEYWORD_TYPE_ORDER.forEach((typeId) => {
        const meta = KEYWORD_TYPE_META[typeId];
        const option = document.createElement("option");
        option.value = typeId;
        option.textContent = meta.label;
        selectEl.appendChild(option);
      });
    }
    selectEl.value = initialValue;
    hintEl.textContent = (KEYWORD_TYPE_META[initialValue] || KEYWORD_TYPE_META.mixed).description;
    selectEl.addEventListener("change", () => {
      hintEl.textContent = (KEYWORD_TYPE_META[selectEl.value] || KEYWORD_TYPE_META.mixed).description;
      saveAdobeStockSettings({ keywordType: selectEl.value });
    });
  }

  function setPanelStatus(text) {
    if (panelEls) panelEls.status.textContent = text;
  }
  function setPanelProgress(pct) {
    if (panelEls) panelEls.progress.style.width = `${pct}%`;
  }
  function setStartButtonRunning(running) {
    if (!panelEls) return;
    panelEls.startBtn.textContent = running ? "Cancel" : "Start";
    panelEls.startBtn.classList.toggle("is-running", running);
  }

  /**
   * The one place that actually kicks off a batch — used by the panel's Start button, the
   * auto-trigger observer, and the popup's "Run now" button, so the panel's status always
   * reflects reality no matter what triggered the run. Guards against overlapping runs itself.
   */
  async function performRun() {
    if (runInProgress) return;
    runInProgress = true;
    cancelRequested = false;
    setStartButtonRunning(true);
    if (panelEls?.generateCurrentBtn) panelEls.generateCurrentBtn.disabled = true;
    setPanelStatus("Starting…");
    setPanelProgress(0);

    // Previously, if anything inside runAutoPilot threw instead of returning a result (a rate
    // limit exhausted across every provider, an unexpected DOM shape, etc.), that exception
    // skipped straight past the reset code below and left runInProgress stuck true forever — the
    // Start button would then just set cancelRequested on click with nothing left running to see
    // it, so nothing happened until the page was refreshed. try/finally guarantees the reset runs
    // no matter how this ends, so a single failed file can no longer wedge the whole panel.
    let total = 0, filled = 0, skipped = 0, failed = 0, cancelled = false, crashed = false, crashMessage = "";
    try {
      ({ total, filled, skipped, failed, cancelled } = await runAutoPilot((done, doneTotal) => {
        setPanelProgress(doneTotal ? (done / doneTotal) * 100 : 0);
        setPanelStatus(`Processing ${done} of ${doneTotal}…`);
      }));
    } catch (err) {
      crashed = true;
      crashMessage = err?.message || String(err);
      console.error("PromptLens Adobe Stock auto-fill: batch run failed", err);
    } finally {
      runInProgress = false;
      setStartButtonRunning(false);
      if (panelEls?.generateCurrentBtn) panelEls.generateCurrentBtn.disabled = false;
    }

    if (crashed) {
      setPanelStatus(`Stopped early — ${crashMessage || "an unexpected error occurred"}. Click Start to try again.`);
    } else if (cancelled) {
      setPanelStatus("Cancelled.");
    } else if (total === 0) {
      setPanelStatus("Idle — click Start to generate a title & keywords for every uploaded file.");
    } else {
      const parts = [];
      if (filled) parts.push(`${filled} filled`);
      if (skipped) parts.push(`${skipped} skipped`);
      if (failed) parts.push(`${failed} failed`);
      setPanelStatus(`Done — ${parts.join(", ")}.`);
    }
    setTimeout(() => setPanelProgress(0), total ? 1400 : 0);
  }

  function wireStartButton(button) {
    button.addEventListener("click", () => {
      if (runInProgress) {
        cancelRequested = true;
        setPanelStatus("Cancelling…");
        return;
      }
      performRun();
    });
  }

  /**
   * The currently-open file is whichever card's thumbnail matches the side panel's own header
   * thumbnail — there's no separate "selected" flag on the card itself, so this is the same
   * src-matching check used elsewhere (waitForSidebarMatch, ensureCardSelected) to confirm what's
   * actually on screen right now.
   */
  function findCurrentlySelectedCard() {
    const sidebarImg = document.querySelector(SELECTORS.sidebarThumbnail);
    const currentSrc = sidebarImg ? sidebarImg.currentSrc || sidebarImg.src : null;
    if (!currentSrc) return null;
    return findCardByThumbnailSrc(currentSrc);
  }

  /**
   * Generates a title & keywords for just the one file currently open in the side panel, without
   * touching any other file or requiring a full batch run. Shares runInProgress with the batch
   * Start button so the two can't run at the same time and collide over the same side panel.
   */
  async function performSingleFileRun() {
    if (runInProgress) return;
    const card = findCurrentlySelectedCard();
    if (!card) {
      setPanelStatus("Click a file's thumbnail to open it, then try Generate this file again.");
      return;
    }

    runInProgress = true;
    panelEls.startBtn.disabled = true;
    panelEls.generateCurrentBtn.disabled = true;
    panelEls.generateCurrentBtn.textContent = "Generating…";
    setPanelStatus("Generating this file…");
    setPanelProgress(0);

    let result;
    try {
      result = await runSingleCard(card);
    } catch (err) {
      // runSingleCard already catches its own internals, but this mirrors performRun's
      // try/finally belt-and-suspenders so a surprise here can't wedge these buttons either.
      result = { ok: false, message: err?.message || String(err) };
    }

    runInProgress = false;
    panelEls.startBtn.disabled = false;
    panelEls.generateCurrentBtn.disabled = false;
    panelEls.generateCurrentBtn.textContent = "Generate this file";
    setPanelProgress(0);

    if (result.skipped) setPanelStatus("Skipped — this file already had a title/keywords.");
    else if (result.ok) setPanelStatus("Done — this file's title & keywords are filled.");
    else setPanelStatus(`Failed — ${result.message || "see console for details."}`);
  }

  function wireGenerateCurrentButton(button) {
    button.addEventListener("click", () => performSingleFileRun());
  }

  // ---------------------------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "ADOBE_STOCK_STATUS") {
      sendResponse({ ok: true, selectorsReady: SELECTORS_READY });
      return true;
    }
    if (message?.type === "ADOBE_STOCK_COLLECT_DIAGNOSTICS") {
      try {
        sendResponse({ ok: true, report: collectDiagnostics() });
      } catch (err) {
        sendResponse({ ok: false, message: err.message || String(err) });
      }
      return true;
    }
    if (message?.type === "ADOBE_STOCK_RUN_NOW") {
      performRun().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  (async () => {
    const settings = await getSettings();
    if (!settings.adobeStock?.enabled) return; // feature fully inert when disabled — no UI, nothing.

    const els = ensurePanel();
    await initSliders(els);

    if (settings.adobeStock.autoTrigger) {
      let debounceTimer = null;
      let lastCardCount = 0; // deliberately starts at 0, not the real count — see below

      const triggerRun = () => {
        clearTimeout(debounceTimer);
        // React re-renders constantly, including from the automation's own actions (selecting a
        // card, filling a field), so a burst of mutations gets debounced into one check rather
        // than reacting to each individually.
        debounceTimer = setTimeout(() => {
          const currentCount = findFileCards().length;
          // Only worth a pass if the card count actually grew. This is the fix for the loop:
          // without it, the automation's own DOM mutations would re-trigger this observer
          // forever even when there's nothing new to do. A same-or-lower count means nothing
          // new arrived, so skip. performRun()'s own runInProgress guard covers overlap too.
          if (currentCount <= lastCardCount) return;
          lastCardCount = currentCount;
          performRun();
        }, 800);
      };

      triggerRun(); // covers files already present when the toggle/page loads
      const observer = new MutationObserver(triggerRun);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  })();
})();
