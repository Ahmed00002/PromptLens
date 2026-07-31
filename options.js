(async () => {
  const providersEl = document.getElementById("providers");
  const styleEl = document.getElementById("style-options");
  const ipSafeToggle = document.getElementById("ip-safe-toggle");
  const ipSafeGrid = document.getElementById("ip-safe-grid");
  const iconModeToggle = document.getElementById("icon-mode-toggle");
  const iconGridPanel = document.getElementById("icon-grid-panel");
  const iconGridChips = document.getElementById("icon-grid-chips");
  const iconGridCustom = document.getElementById("icon-grid-custom");
  const iconGridRowsInput = document.getElementById("icon-grid-rows");
  const iconGridColsInput = document.getElementById("icon-grid-cols");
  const iconGridTotal = document.getElementById("icon-grid-total");
  const hoverButtonToggle = document.getElementById("hover-button-toggle");

  const adobeStockEnabledToggle = document.getElementById("adobe-stock-enabled-toggle");
  const adobeStockFields = document.getElementById("adobe-stock-fields");
  const adobeStockAutoTrigger = document.getElementById("adobe-stock-auto-trigger");
  const adobeStockDisclosure = document.getElementById("adobe-stock-disclosure");
  const adobeStockSetupStatus = document.getElementById("adobe-stock-setup-status");
  const asTitleMin = document.getElementById("as-title-min");
  const asTitleMax = document.getElementById("as-title-max");
  const asTitleRangeValue = document.getElementById("as-title-range-value");
  const asKeywordMin = document.getElementById("as-keyword-min");
  const asKeywordMax = document.getElementById("as-keyword-max");
  const asKeywordRangeValue = document.getElementById("as-keyword-range-value");
  const asKeywordType = document.getElementById("as-keyword-type");
  const asKeywordTypeHint = document.getElementById("as-keyword-type-hint");
  const historyEl = document.getElementById("history");
  const saveStatusEl = document.getElementById("save-status");
  const clearHistoryBtn = document.getElementById("clear-history");
  const brandMark = document.getElementById("brand-mark");

  brandMark.innerHTML = `
    <rect width="32" height="32" rx="7" fill="#101219"/>
    <g fill="#E8A33D">
      <polygon points="16,6 24.3,9.7 24.3,10.9 18.9,15.2 13.1,15.2 16,10.4"/>
      <polygon points="26,16 25.9,25.1 24.8,25.6 19.1,22.5 16.4,17.5 21.8,15.5"/>
      <polygon points="16,26 7.7,22.3 7.7,21.1 13.1,16.8 18.9,16.8 16,21.6"/>
      <polygon points="6,16 6.1,6.9 7.2,6.4 12.9,9.5 15.6,14.5 10.2,16.5"/>
    </g>
    <polygon points="16,11.7 19.7,14 19.7,18 16,20.3 12.3,18 12.3,14" fill="#101219"/>
  `;

  let settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  let saveTimer = null;

  function queueSave(partial) {
    settings = { ...settings, ...partial };
    saveStatusEl.textContent = "Saving…";
    saveStatusEl.classList.remove("saved");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      settings = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: settings });
      saveStatusEl.textContent = "Saved";
      saveStatusEl.classList.add("saved");
      setTimeout(() => {
        saveStatusEl.textContent = "All changes save automatically";
        saveStatusEl.classList.remove("saved");
      }, 1600);
    }, 350);
  }

  function renderProviders() {
    providersEl.innerHTML = "";
    const template = document.getElementById("provider-card-template");

    Object.keys(PROVIDER_META).forEach((providerId) => {
      const meta = PROVIDER_META[providerId];
      const config = settings.providers[providerId] || { apiKey: "", model: meta.defaultModel };
      const node = template.content.cloneNode(true);
      const card = node.querySelector(".provider-card");

      card.dataset.provider = providerId;
      card.classList.toggle("is-active", settings.activeProvider === providerId);

      const radio = node.querySelector('input[type="radio"]');
      radio.checked = settings.activeProvider === providerId;
      radio.addEventListener("change", () => {
        settings.activeProvider = providerId;
        renderProviders();
        queueSave({ activeProvider: providerId });
      });

      node.querySelector(".provider-name").textContent = meta.label;

      const link = node.querySelector(".provider-link");
      link.href = meta.helpUrl;

      const keyInput = node.querySelector(".key-input");
      keyInput.placeholder = meta.keyPlaceholder;
      keyInput.value = config.apiKey || "";
      keyInput.addEventListener("input", () => {
        settings.providers[providerId] = { ...settings.providers[providerId], apiKey: keyInput.value };
        queueSave({ providers: settings.providers });
      });

      const toggleBtn = node.querySelector(".toggle-visibility");
      toggleBtn.addEventListener("click", () => {
        keyInput.type = keyInput.type === "password" ? "text" : "password";
        toggleBtn.textContent = keyInput.type === "password" ? "👁" : "🙈";
      });

      const modelInput = node.querySelector(".model-input");
      modelInput.placeholder = meta.defaultModel;
      modelInput.value = config.model || meta.defaultModel;
      modelInput.addEventListener("input", () => {
        settings.providers[providerId] = {
          ...settings.providers[providerId],
          model: modelInput.value || meta.defaultModel,
        };
        queueSave({ providers: settings.providers });
      });
      node.querySelector(".model-hint").textContent = meta.modelHint;

      const testBtn = node.querySelector(".test-btn");
      const testResult = node.querySelector(".test-result");
      testBtn.addEventListener("click", async () => {
        testResult.textContent = "Testing…";
        testResult.className = "test-result pending";
        testBtn.disabled = true;
        const res = await chrome.runtime.sendMessage({
          type: "TEST_PROVIDER",
          providerId,
          apiKey: keyInput.value,
          model: modelInput.value || meta.defaultModel,
        });
        testBtn.disabled = false;
        if (res.ok) {
          testResult.textContent = "Connected ✓";
          testResult.className = "test-result ok";
        } else {
          testResult.textContent = res.message;
          testResult.className = "test-result fail";
        }
      });

      providersEl.appendChild(node);
    });
  }

  function renderStyles() {
    styleEl.innerHTML = "";
    Object.keys(OUTPUT_STYLES).forEach((styleId) => {
      const meta = OUTPUT_STYLES[styleId];
      const card = document.createElement("div");
      card.className = "style-card" + (settings.outputStyle === styleId ? " is-active" : "");
      card.innerHTML = `<h4></h4><p></p>`;
      card.querySelector("h4").textContent = meta.label;
      card.querySelector("p").textContent = meta.description;
      card.addEventListener("click", () => {
        settings.outputStyle = styleId;
        renderStyles();
        queueSave({ outputStyle: styleId });
      });
      styleEl.appendChild(card);
    });
  }

  function renderIpSafe() {
    const enabled = Boolean(settings.ipSafe && settings.ipSafe.enabled);
    ipSafeToggle.checked = enabled;

    ipSafeGrid.innerHTML = "";
    IP_SAFE_ORDER.forEach((key) => {
      const meta = IP_SAFE_META[key];
      const card = document.createElement("label");
      card.className = "ip-safe-card" + (enabled ? "" : " is-disabled");

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(settings.ipSafe && settings.ipSafe[key]);
      input.disabled = !enabled;
      input.addEventListener("change", () => {
        settings.ipSafe = { ...settings.ipSafe, [key]: input.checked };
        queueSave({ ipSafe: settings.ipSafe });
      });

      const copy = document.createElement("div");
      copy.innerHTML = `<h4></h4><p></p>`;
      copy.querySelector("h4").textContent = meta.label;
      copy.querySelector("p").textContent = meta.description;

      card.appendChild(input);
      card.appendChild(copy);
      ipSafeGrid.appendChild(card);
    });
  }

  ipSafeToggle.addEventListener("change", () => {
    settings.ipSafe = { ...settings.ipSafe, enabled: ipSafeToggle.checked };
    renderIpSafe();
    queueSave({ ipSafe: settings.ipSafe });
  });

  function renderIconGridTotal() {
    const grid = resolveIconGrid(settings.iconMode);
    iconGridTotal.textContent = grid ? `${grid.rows * grid.cols} icons total` : "";
  }

  function renderIconGridCustomVisibility() {
    const mode = (settings.iconMode && settings.iconMode.gridMode) || "auto";
    iconGridCustom.hidden = mode !== "custom";
    if (mode === "custom") {
      iconGridRowsInput.value = settings.iconMode.customRows || 3;
      iconGridColsInput.value = settings.iconMode.customCols || 3;
    }
  }

  function renderIconGridChips() {
    const enabled = Boolean(settings.iconMode && settings.iconMode.enabled);
    iconGridChips.innerHTML = "";
    const activeMode = (settings.iconMode && settings.iconMode.gridMode) || "auto";
    ICON_GRID_PRESETS.forEach((preset) => {
      const chip = document.createElement("div");
      chip.className = "chip" + (activeMode === preset.id ? " is-active" : "");
      chip.textContent = preset.label;
      chip.addEventListener("click", () => {
        if (!enabled) return;
        settings.iconMode.gridMode = preset.id;
        renderIconGridChips();
        renderIconGridCustomVisibility();
        renderIconGridTotal();
        queueSave({ iconMode: settings.iconMode });
      });
      iconGridChips.appendChild(chip);
    });
  }

  function clampGridValue(value) {
    return Math.min(12, Math.max(1, Math.round(Number(value)) || 3));
  }

  iconGridRowsInput.addEventListener("change", () => {
    const val = clampGridValue(iconGridRowsInput.value);
    iconGridRowsInput.value = val;
    settings.iconMode.customRows = val;
    renderIconGridTotal();
    queueSave({ iconMode: settings.iconMode });
  });

  iconGridColsInput.addEventListener("change", () => {
    const val = clampGridValue(iconGridColsInput.value);
    iconGridColsInput.value = val;
    settings.iconMode.customCols = val;
    renderIconGridTotal();
    queueSave({ iconMode: settings.iconMode });
  });

  function renderIconMode() {
    const enabled = Boolean(settings.iconMode && settings.iconMode.enabled);
    iconModeToggle.checked = enabled;
    iconGridPanel.classList.toggle("is-disabled", !enabled);
    renderIconGridChips();
    renderIconGridCustomVisibility();
    renderIconGridTotal();
  }

  iconModeToggle.addEventListener("change", () => {
    settings.iconMode = { ...settings.iconMode, enabled: iconModeToggle.checked };
    renderIconMode();
    queueSave({ iconMode: settings.iconMode });
  });

  function renderHoverButton() {
    hoverButtonToggle.checked = Boolean(settings.hoverButton && settings.hoverButton.enabled);
  }

  hoverButtonToggle.addEventListener("change", () => {
    settings.hoverButton = { ...settings.hoverButton, enabled: hoverButtonToggle.checked };
    queueSave({ hoverButton: settings.hoverButton });
  });

  async function renderAdobeStockStatus() {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: "https://contributor.stock.adobe.com/*" });
    } catch (_) {
      tabs = [];
    }
    const pendingText =
      'Selectors not yet confirmed — open the Adobe Stock contributor portal, then use the popup\'s "Copy page diagnostics" button and send the result to Claude.';
    if (!tabs.length) {
      adobeStockSetupStatus.textContent = pendingText;
      adobeStockSetupStatus.className = "setup-status is-pending";
      return;
    }
    try {
      const res = await chrome.tabs.sendMessage(tabs[0].id, { type: "ADOBE_STOCK_STATUS" });
      if (res?.selectorsReady) {
        adobeStockSetupStatus.textContent = "✓ Configured and ready.";
        adobeStockSetupStatus.className = "setup-status is-ready";
      } else {
        adobeStockSetupStatus.textContent = pendingText;
        adobeStockSetupStatus.className = "setup-status is-pending";
      }
    } catch (_) {
      adobeStockSetupStatus.textContent = pendingText;
      adobeStockSetupStatus.className = "setup-status is-pending";
    }
  }

  function renderKeywordTypeOptions() {
    if (asKeywordType.options.length) return;
    KEYWORD_TYPE_ORDER.forEach((typeId) => {
      const meta = KEYWORD_TYPE_META[typeId];
      const option = document.createElement("option");
      option.value = typeId;
      option.textContent = meta.label;
      asKeywordType.appendChild(option);
    });
  }

  function renderAdobeStock() {
    const enabled = Boolean(settings.adobeStock && settings.adobeStock.enabled);
    adobeStockEnabledToggle.checked = enabled;
    adobeStockFields.classList.toggle("is-disabled", !enabled);
    adobeStockAutoTrigger.checked = Boolean(settings.adobeStock && settings.adobeStock.autoTrigger);
    adobeStockDisclosure.value = (settings.adobeStock && settings.adobeStock.aiDisclosure) || "off";

    const as = settings.adobeStock || {};
    asTitleMin.value = as.titleMinLength ?? 20;
    asTitleMax.value = as.titleMaxLength ?? 70;
    asKeywordMin.value = as.keywordMin ?? 30;
    asKeywordMax.value = as.keywordMax ?? 49;
    renderSeekLabels();

    renderKeywordTypeOptions();
    const keywordType = as.keywordType || "mixed";
    asKeywordType.value = keywordType;
    asKeywordTypeHint.textContent = (KEYWORD_TYPE_META[keywordType] || KEYWORD_TYPE_META.mixed).description;

    renderAdobeStockStatus();
  }

  function renderSeekLabels() {
    asTitleRangeValue.textContent = `${asTitleMin.value}–${asTitleMax.value} chars`;
    asKeywordRangeValue.textContent = `${asKeywordMin.value}–${asKeywordMax.value}`;
  }

  asTitleMin.addEventListener("input", () => {
    if (Number(asTitleMin.value) > Number(asTitleMax.value)) asTitleMax.value = asTitleMin.value;
    renderSeekLabels();
  });
  asTitleMin.addEventListener("change", () => {
    settings.adobeStock = {
      ...settings.adobeStock,
      titleMinLength: Number(asTitleMin.value),
      titleMaxLength: Number(asTitleMax.value),
    };
    queueSave({ adobeStock: settings.adobeStock });
  });

  asTitleMax.addEventListener("input", () => {
    if (Number(asTitleMax.value) < Number(asTitleMin.value)) asTitleMin.value = asTitleMax.value;
    renderSeekLabels();
  });
  asTitleMax.addEventListener("change", () => {
    settings.adobeStock = {
      ...settings.adobeStock,
      titleMinLength: Number(asTitleMin.value),
      titleMaxLength: Number(asTitleMax.value),
    };
    queueSave({ adobeStock: settings.adobeStock });
  });

  asKeywordMin.addEventListener("input", () => {
    if (Number(asKeywordMin.value) > Number(asKeywordMax.value)) asKeywordMax.value = asKeywordMin.value;
    renderSeekLabels();
  });
  asKeywordMin.addEventListener("change", () => {
    settings.adobeStock = {
      ...settings.adobeStock,
      keywordMin: Number(asKeywordMin.value),
      keywordMax: Number(asKeywordMax.value),
    };
    queueSave({ adobeStock: settings.adobeStock });
  });

  asKeywordMax.addEventListener("input", () => {
    if (Number(asKeywordMax.value) < Number(asKeywordMin.value)) asKeywordMin.value = asKeywordMax.value;
    renderSeekLabels();
  });
  asKeywordMax.addEventListener("change", () => {
    settings.adobeStock = {
      ...settings.adobeStock,
      keywordMin: Number(asKeywordMin.value),
      keywordMax: Number(asKeywordMax.value),
    };
    queueSave({ adobeStock: settings.adobeStock });
  });

  adobeStockEnabledToggle.addEventListener("change", () => {
    settings.adobeStock = { ...settings.adobeStock, enabled: adobeStockEnabledToggle.checked };
    renderAdobeStock();
    queueSave({ adobeStock: settings.adobeStock });
  });

  adobeStockAutoTrigger.addEventListener("change", () => {
    settings.adobeStock = { ...settings.adobeStock, autoTrigger: adobeStockAutoTrigger.checked };
    queueSave({ adobeStock: settings.adobeStock });
  });

  adobeStockDisclosure.addEventListener("change", () => {
    settings.adobeStock = { ...settings.adobeStock, aiDisclosure: adobeStockDisclosure.value };
    queueSave({ adobeStock: settings.adobeStock });
  });

  asKeywordType.addEventListener("change", () => {
    settings.adobeStock = { ...settings.adobeStock, keywordType: asKeywordType.value };
    asKeywordTypeHint.textContent = (KEYWORD_TYPE_META[asKeywordType.value] || KEYWORD_TYPE_META.mixed).description;
    queueSave({ adobeStock: settings.adobeStock });
  });

  function renderHistory() {
    const history = settings.history || [];
    if (!history.length) {
      historyEl.innerHTML = `<p class="history-empty">Nothing generated yet — right-click any image on a page and choose “Generate AI Prompt.”</p>`;
      return;
    }
    historyEl.innerHTML = "";
    history.forEach((item) => {
      const el = document.createElement("div");
      el.className = "history-item";
      const label = PROVIDER_META[item.provider]?.label || item.provider;
      const date = new Date(item.timestamp).toLocaleString();
      const badge = item.ipSafe ? `<span class="history-badge">IP-safe</span>` : "";
      const iconLabel = item.iconGrid ? `Icon ${item.iconGrid.rows}×${item.iconGrid.cols}` : "Icon";
      const iconBadge = item.iconMode ? `<span class="history-badge">${iconLabel}</span>` : "";
      const batchBadge = item.batch ? `<span class="history-badge">Batch</span>` : "";
      el.innerHTML = `<div class="history-meta"><span></span><span></span></div><div class="history-prompt"></div>`;
      const metaSpans = el.querySelectorAll(".history-meta span");
      metaSpans[0].textContent = label;
      metaSpans[1].innerHTML = `${date}${badge}${iconBadge}${batchBadge}`;
      el.querySelector(".history-prompt").textContent = item.prompt;
      historyEl.appendChild(el);
    });
  }

  clearHistoryBtn.addEventListener("click", async () => {
    settings = await chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
    renderHistory();
  });

  renderProviders();
  renderStyles();
  renderIpSafe();
  renderIconMode();
  renderHoverButton();
  renderAdobeStock();
  renderHistory();
})();
