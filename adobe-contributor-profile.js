/**
 * Adobe Stock *public contributor profile* page (e.g. stock.adobe.com/contributor/12345/name,
 * optionally with a locale prefix like stock.adobe.com/uk/contributor/12345/name). Separate from
 * adobe-stock.js on purpose — that file targets the contributor.stock.adobe.com upload dashboard,
 * a completely different page with a different DOM and a different job.
 *
 * Feature: a small floating panel with two sort buttons. Adobe's own profile grid is sorted via
 * a `?order=` query param — `nb_downloads` for most-downloaded, `creation` for most-recent — so
 * this panel just rewrites the current tab's URL with the right value and navigates there.
 *
 * URL rewriting goes through the `URL`/`URLSearchParams` API rather than hand-rolled string
 * concatenation. That gets two things right for free:
 *   1. Whether the current URL already has a `?...` (need `&key=val`) or not (need `?key=val`).
 *   2. If `order` is already present (e.g. the person already sorted, or came in from a link that
 *      had one), the existing value is replaced in place instead of a duplicate `&order=...` being
 *      appended — string concatenation alone wouldn't do that.
 */
(() => {
  // Matches /contributor/<id>/<name> with an optional single-segment locale prefix
  // (/uk/contributor/..., /ca_fr/contributor/..., etc.) and ignores any trailing slash.
  const PROFILE_PATH_RE = /^\/(?:[a-z]{2}(?:_[a-z]{2})?\/)?contributor\/\d+\//i;

  if (!PROFILE_PATH_RE.test(location.pathname)) return;

  const SORT_OPTIONS = [
    { id: "downloads", label: "Most downloads", order: "nb_downloads" },
    { id: "recent", label: "Most recent", order: "creation" },
  ];

  /** Reads the *current* order value straight from the address bar so the panel can highlight it. */
  function getCurrentOrder() {
    try {
      return new URL(location.href).searchParams.get("order");
    } catch (_) {
      return null;
    }
  }

  /**
   * Builds the target URL for a given order value. Using URLSearchParams.set means: no `?`/`&`
   * bookkeeping to get wrong, and an existing `order=...` gets overwritten in place rather than
   * duplicated.
   */
  function buildSortedUrl(order) {
    const url = new URL(location.href);
    url.searchParams.set("order", order);
    return url.toString();
  }

  function applySort(order) {
    const target = buildSortedUrl(order);
    if (target === location.href) return; // already sorted this way — nothing to do
    location.href = target;
  }

  // ---------------------------------------------------------------------------------------
  // Panel UI — small, fixed, shadow-DOM (so the page's own CSS can't bleed in or be bled on).
  // ---------------------------------------------------------------------------------------

  function buildPanel() {
    const host = document.createElement("div");
    host.id = "promptlens-adobe-contributor-sort-panel";
    const shadow = host.attachShadow({ mode: "open" });

    const currentOrder = getCurrentOrder();

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .pl-panel {
          position: fixed; top: 90px; right: 20px; z-index: 2147483000;
          width: 220px; max-width: calc(100vw - 32px);
          background: #12141C; color: #EDEBE4;
          border: 1px solid rgba(232, 163, 61, 0.3);
          border-radius: 14px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 14px;
        }
        .pl-panel-label {
          margin: 0 0 10px;
          font: 700 10.5px/1 ui-monospace, "SF Mono", "Cascadia Code", monospace;
          letter-spacing: 0.07em; text-transform: uppercase; color: #8B8F9C;
        }
        .pl-sort-btn {
          display: block; width: 100%; box-sizing: border-box;
          appearance: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 9px;
          padding: 9px 10px; margin-bottom: 8px;
          background: #191C26; color: #EDEBE4;
          font: 600 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          text-align: left; cursor: pointer; transition: filter 0.12s ease, background 0.12s ease;
        }
        .pl-sort-btn:last-of-type { margin-bottom: 0; }
        .pl-sort-btn:hover { background: rgba(255,255,255,0.08); }
        .pl-sort-btn.is-active {
          background: #E8A33D; color: #12141C; border-color: #E8A33D;
        }
        .pl-sort-btn.is-active:hover { filter: brightness(1.05); }
      </style>
      <div class="pl-panel">
        <p class="pl-panel-label">Sort by</p>
        ${SORT_OPTIONS.map(
          (opt) => `
          <button class="pl-sort-btn${opt.order === currentOrder ? " is-active" : ""}" data-order="${opt.order}">
            ${opt.label}
          </button>`
        ).join("")}
      </div>
    `;

    shadow.querySelectorAll(".pl-sort-btn").forEach((btn) => {
      btn.addEventListener("click", () => applySort(btn.dataset.order));
    });

    document.documentElement.appendChild(host);
  }

  if (!document.getElementById("promptlens-adobe-contributor-sort-panel")) {
    buildPanel();
  }
})();
