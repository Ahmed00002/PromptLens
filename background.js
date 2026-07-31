importScripts("constants.js", "providers.js");

const MENU_ID = "promptlens-generate";
const SELECT_MODE_MENU_ID = "promptlens-select-mode";
const BATCH_CONCURRENCY = 3;
const MAX_BATCH_ITEMS = 40;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "✨ Generate AI Prompt (PromptLens)",
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: SELECT_MODE_MENU_ID,
      title: "🖼️ Select images to batch-generate (PromptLens)",
      contexts: ["page"],
    });
  });
  seedDefaultSettings();
});

async function seedDefaultSettings() {
  const existing = await chrome.storage.local.get("settings");
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  // Backfill any keys added in later versions of the extension.
  return {
    ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    ...settings,
    providers: { ...DEFAULT_SETTINGS.providers, ...(settings.providers || {}) },
    hoverButton: { ...DEFAULT_SETTINGS.hoverButton, ...(settings.hoverButton || {}) },
    ipSafe: { ...DEFAULT_SETTINGS.ipSafe, ...(settings.ipSafe || {}) },
    iconMode: { ...DEFAULT_SETTINGS.iconMode, ...(settings.iconMode || {}) },
    adobeStock: { ...DEFAULT_SETTINGS.adobeStock, ...(settings.adobeStock || {}) },
  };
}

async function saveSettings(partial) {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

async function pushHistoryEntry(entry) {
  const settings = await getSettings();
  const history = [entry, ...(settings.history || [])].slice(0, MAX_HISTORY);
  await saveSettings({ history });
}

/** Keep the last requested image per tab so "Regenerate" can re-run it. */
const lastRequestByTab = new Map();

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    // Content script probably wasn't injected yet (page loaded before install/update).
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tabId, message);
    } catch (err2) {
      console.warn("PromptLens: could not deliver message to tab", err2);
    }
  }
}

async function fetchImageAsBase64(srcUrl) {
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`Could not download the image (HTTP ${res.status}).`);
  const blob = await res.blob();
  let mimeType = blob.type;
  if (!mimeType || !mimeType.startsWith("image/")) {
    const extMatch = srcUrl.match(/\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i);
    mimeType = extMatch ? `image/${extMatch[1].toLowerCase().replace("jpg", "jpeg")}` : "image/jpeg";
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return { base64, mimeType };
}

async function runGeneration(tabId, srcUrl) {
  lastRequestByTab.set(tabId, srcUrl);
  await sendToTab(tabId, { type: "PROMPTLENS_LOADING" });
  try {
    const settings = await getSettings();
    const { base64, mimeType } = await fetchImageAsBase64(srcUrl);

    const { result: prompt, providerId } = await generateWithFallback(settings, (pid, pconfig) =>
      generatePromptFromImage(pid, pconfig, base64, mimeType, settings.outputStyle, settings.ipSafe, settings.iconMode)
    );

    await sendToTab(tabId, {
      type: "PROMPTLENS_RESULT",
      prompt,
      providerLabel: PROVIDER_META[providerId]?.label || providerId,
      srcUrl,
    });

    await pushHistoryEntry({
      id: `${Date.now()}`,
      timestamp: Date.now(),
      prompt,
      srcUrl,
      provider: providerId,
      ipSafe: Boolean(settings.ipSafe && settings.ipSafe.enabled),
      iconMode: Boolean(settings.iconMode && settings.iconMode.enabled),
      iconGrid: settings.iconMode && settings.iconMode.enabled ? resolveIconGrid(settings.iconMode) : null,
    });
  } catch (err) {
    console.error("PromptLens generation failed:", err);
    await sendToTab(tabId, { type: "PROMPTLENS_ERROR", message: err.message || String(err) });
  }
}

/**
 * Runs prompt generation for several images at once (select mode). Items are processed with
 * limited concurrency — enough to feel fast without slamming the provider's rate limit — and
 * each one's progress is streamed back to the tab individually via PROMPTLENS_BATCH_ITEM_UPDATE
 * so the floating panel can update row-by-row instead of waiting for the whole batch to finish.
 * A failure on one image (bad URL, provider hiccup) doesn't stop the rest of the batch.
 */
async function runBatchGeneration(tabId, items) {
  const capped = items.slice(0, MAX_BATCH_ITEMS);
  const settings = await getSettings();

  let cursor = 0;
  async function worker() {
    while (cursor < capped.length) {
      const item = capped[cursor++];
      await sendToTab(tabId, { type: "PROMPTLENS_BATCH_ITEM_UPDATE", id: item.id, status: "loading" });
      try {
        const { base64, mimeType } = await fetchImageAsBase64(item.srcUrl);
        const { result: prompt, providerId } = await generateWithFallback(settings, (pid, pconfig) =>
          generatePromptFromImage(pid, pconfig, base64, mimeType, settings.outputStyle, settings.ipSafe, settings.iconMode)
        );
        const providerLabel = PROVIDER_META[providerId]?.label || providerId;
        await sendToTab(tabId, {
          type: "PROMPTLENS_BATCH_ITEM_UPDATE",
          id: item.id,
          status: "done",
          prompt,
          providerLabel,
        });
        await pushHistoryEntry({
          id: `${Date.now()}-${item.id}`,
          timestamp: Date.now(),
          prompt,
          srcUrl: item.srcUrl,
          provider: providerId,
          ipSafe: Boolean(settings.ipSafe && settings.ipSafe.enabled),
          iconMode: Boolean(settings.iconMode && settings.iconMode.enabled),
          iconGrid: settings.iconMode && settings.iconMode.enabled ? resolveIconGrid(settings.iconMode) : null,
          batch: true,
        });
      } catch (err) {
        await sendToTab(tabId, {
          type: "PROMPTLENS_BATCH_ITEM_UPDATE",
          id: item.id,
          status: "error",
          message: err.message || String(err),
        });
      }
    }
  }

  const workerCount = Math.min(BATCH_CONCURRENCY, capped.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, worker));
  await sendToTab(tabId, { type: "PROMPTLENS_BATCH_DONE" });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.srcUrl && tab?.id) {
    runGeneration(tab.id, info.srcUrl);
    return;
  }
  if (info.menuItemId === SELECT_MODE_MENU_ID && tab?.id) {
    sendToTab(tab.id, { type: "PROMPTLENS_ENTER_SELECT_MODE" });
  }
});

// Messages from the content script (regenerate button) and the popup/options pages.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "PROMPTLENS_REGENERATE") {
      const tabId = sender.tab?.id;
      const srcUrl = tabId ? lastRequestByTab.get(tabId) : null;
      if (tabId && srcUrl) await runGeneration(tabId, srcUrl);
      return;
    }
    if (message?.type === "PROMPTLENS_GENERATE_FROM_HOVER") {
      // Same single-image flow as the context-menu item — just triggered from the hover button
      // instead of a right-click. Fire-and-forget; progress/result/error stream to the tab's card.
      const tabId = sender.tab?.id;
      if (tabId && message.srcUrl) runGeneration(tabId, message.srcUrl);
      sendResponse({ ok: Boolean(tabId && message.srcUrl) });
      return;
    }
    if (message?.type === "GET_SETTINGS") {
      sendResponse(await getSettings());
      return;
    }
    if (message?.type === "SAVE_SETTINGS") {
      sendResponse(await saveSettings(message.payload));
      return;
    }
    if (message?.type === "TEST_PROVIDER") {
      try {
        await testProviderConnection(message.providerId, message.apiKey, message.model);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, message: err.message || String(err) });
      }
      return;
    }
    if (message?.type === "PROMPTLENS_ENTER_SELECT_MODE_ACTIVE_TAB") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await sendToTab(tab.id, { type: "PROMPTLENS_ENTER_SELECT_MODE" });
      sendResponse({ ok: Boolean(tab?.id) });
      return;
    }
    if (message?.type === "PROMPTLENS_BATCH_GENERATE") {
      const tabId = sender.tab?.id;
      if (tabId && Array.isArray(message.items) && message.items.length) {
        runBatchGeneration(tabId, message.items); // fire-and-forget; progress streams back per item
      }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "ADOBE_STOCK_GENERATE_METADATA") {
      try {
        const settings = await getSettings();
        if (!settings.adobeStock?.enabled) {
          sendResponse({ ok: false, message: "Adobe Stock automation is disabled in PromptLens settings." });
          return;
        }
        const { base64, mimeType } = await fetchImageAsBase64(message.srcUrl);
        const { result, providerId } = await generateWithFallback(settings, (pid, pconfig) =>
          generateAdobeStockMetadata(pid, pconfig, base64, mimeType, settings.ipSafe, settings.adobeStock)
        );
        sendResponse({
          ok: true,
          title: result.title,
          keywords: result.keywords,
          providerId,
          providerLabel: PROVIDER_META[providerId]?.label || providerId,
        });
      } catch (err) {
        sendResponse({ ok: false, message: err.message || String(err) });
      }
      return;
    }
    if (message?.type === "CLEAR_HISTORY") {
      sendResponse(await saveSettings({ history: [] }));
      return;
    }
    if (message?.type === "OPEN_OPTIONS") {
      chrome.runtime.openOptionsPage();
      return;
    }
  })();
  return true; // keep the message channel open for the async response
});
