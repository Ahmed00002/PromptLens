(async () => {
  const brandMark = document.getElementById("brand-mark");
  const segmentedEl = document.getElementById("provider-segmented");
  const warningEl = document.getElementById("no-key-warning");
  const settingsBtn = document.getElementById("open-settings");

  const ipSafeToggle = document.getElementById("ip-safe-toggle");
  const ipSafeCustomizeBtn = document.getElementById("ip-safe-customize-btn");
  const ipSafeChecks = document.getElementById("ip-safe-checks");

  const iconModeToggle = document.getElementById("icon-mode-toggle");
  const iconGridBlock = document.getElementById("icon-grid-block");
  const iconGridChips = document.getElementById("icon-grid-chips");
  const iconGridCustom = document.getElementById("icon-grid-custom");
  const iconGridRowsInput = document.getElementById("icon-grid-rows");
  const iconGridColsInput = document.getElementById("icon-grid-cols");
  const iconGridTotal = document.getElementById("icon-grid-total");

  const selectModeBtn = document.getElementById("select-mode-btn");

  const lastDivider = document.getElementById("last-divider");
  const lastSection = document.getElementById("last-section");
  const lastBadge = document.getElementById("last-badge");
  const lastIconBadge = document.getElementById("last-icon-badge");
  const lastText = document.getElementById("last-text");
  const lastCopyBtn = document.getElementById("last-copy");

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

  // ---------- provider segmented control ----------

  function renderSegmented() {
    segmentedEl.innerHTML = "";
    Object.keys(PROVIDER_META).forEach((providerId) => {
      const meta = PROVIDER_META[providerId];
      const segment = document.createElement("div");
      segment.className = "segment" + (settings.activeProvider === providerId ? " is-active" : "");
      segment.textContent = meta.label;
      segment.addEventListener("click", async () => {
        settings.activeProvider = providerId;
        settings = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: { activeProvider: providerId } });
        renderSegmented();
        renderWarning();
      });
      segmentedEl.appendChild(segment);
    });
  }

  function renderWarning() {
    const config = settings.providers[settings.activeProvider];
    warningEl.hidden = Boolean(config && config.apiKey);
  }

  // ---------- IP-safe mode ----------

  async function saveIpSafe() {
    settings = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: { ipSafe: settings.ipSafe } });
  }

  function renderIpSafeChecks() {
    const enabled = Boolean(settings.ipSafe && settings.ipSafe.enabled);
    ipSafeChecks.innerHTML = "";
    IP_SAFE_ORDER.forEach((key) => {
      const meta = IP_SAFE_META[key];
      const row = document.createElement("label");
      row.className = "check-row" + (enabled ? "" : " is-disabled");
      row.title = meta.description;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(settings.ipSafe && settings.ipSafe[key]);
      input.disabled = !enabled;
      input.addEventListener("change", async () => {
        settings.ipSafe[key] = input.checked;
        await saveIpSafe();
      });

      const span = document.createElement("span");
      span.textContent = meta.label;

      row.appendChild(input);
      row.appendChild(span);
      ipSafeChecks.appendChild(row);
    });
  }

  function renderIpSafeToggle() {
    ipSafeToggle.checked = Boolean(settings.ipSafe && settings.ipSafe.enabled);
    renderIpSafeChecks();
  }

  ipSafeToggle.addEventListener("change", async () => {
    settings.ipSafe = settings.ipSafe || {};
    settings.ipSafe.enabled = ipSafeToggle.checked;
    renderIpSafeChecks();
    await saveIpSafe();
  });

  ipSafeCustomizeBtn.addEventListener("click", () => {
    const willOpen = ipSafeChecks.hidden;
    ipSafeChecks.hidden = !willOpen;
    ipSafeCustomizeBtn.classList.toggle("is-open", willOpen);
  });

  // ---------- icon mode ----------

  async function saveIconMode() {
    settings = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: { iconMode: settings.iconMode } });
  }

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
    iconGridChips.innerHTML = "";
    const activeMode = (settings.iconMode && settings.iconMode.gridMode) || "auto";
    ICON_GRID_PRESETS.forEach((preset) => {
      const chip = document.createElement("div");
      chip.className = "chip" + (activeMode === preset.id ? " is-active" : "");
      chip.textContent = preset.label;
      chip.addEventListener("click", async () => {
        settings.iconMode.gridMode = preset.id;
        renderIconGridChips();
        renderIconGridCustomVisibility();
        renderIconGridTotal();
        await saveIconMode();
      });
      iconGridChips.appendChild(chip);
    });
  }

  function clampGridValue(value) {
    return Math.min(12, Math.max(1, Math.round(Number(value)) || 3));
  }

  iconGridRowsInput.addEventListener("change", async () => {
    const val = clampGridValue(iconGridRowsInput.value);
    iconGridRowsInput.value = val;
    settings.iconMode.customRows = val;
    renderIconGridTotal();
    await saveIconMode();
  });

  iconGridColsInput.addEventListener("change", async () => {
    const val = clampGridValue(iconGridColsInput.value);
    iconGridColsInput.value = val;
    settings.iconMode.customCols = val;
    renderIconGridTotal();
    await saveIconMode();
  });

  function renderIconMode() {
    const enabled = Boolean(settings.iconMode && settings.iconMode.enabled);
    iconModeToggle.checked = enabled;
    iconGridBlock.hidden = !enabled;
    renderIconGridChips();
    renderIconGridCustomVisibility();
    renderIconGridTotal();
  }

  iconModeToggle.addEventListener("change", async () => {
    settings.iconMode = settings.iconMode || {};
    settings.iconMode.enabled = iconModeToggle.checked;
    renderIconMode();
    await saveIconMode();
  });

  // ---------- last generated ----------

  function renderLast() {
    const last = (settings.history || [])[0];
    if (!last) {
      lastDivider.hidden = true;
      lastSection.hidden = true;
      return;
    }
    lastDivider.hidden = false;
    lastSection.hidden = false;
    lastBadge.hidden = !last.ipSafe;
    lastIconBadge.hidden = !last.iconMode;
    lastIconBadge.textContent = last.iconGrid ? `Icon ${last.iconGrid.rows}×${last.iconGrid.cols}` : "Icon";
    lastText.textContent = last.prompt;
    lastCopyBtn.onclick = async () => {
      await navigator.clipboard.writeText(last.prompt);
      const original = lastCopyBtn.textContent;
      lastCopyBtn.textContent = "Copied ✓";
      setTimeout(() => (lastCopyBtn.textContent = original), 1200);
    };
  }

  // ---------- select / batch mode ----------

  selectModeBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "PROMPTLENS_ENTER_SELECT_MODE_ACTIVE_TAB" });
    window.close();
  });

  // ---------- settings ----------

  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  renderSegmented();
  renderWarning();
  renderIpSafeToggle();
  renderIconMode();
  renderLast();
})();
