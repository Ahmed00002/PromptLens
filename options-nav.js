// Left-nav tab switching for the settings page. Purely presentational —
// every panel and its functional IDs stay in the DOM at all times, so
// options.js keeps working exactly as it did before, regardless of which
// tab is currently visible.
(() => {
  const navItems = document.querySelectorAll(".nav-item");
  const tabPages = document.querySelectorAll(".tab-page");
  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      navItems.forEach((b) => b.classList.toggle("is-active", b === btn));
      tabPages.forEach((p) => p.classList.toggle("is-active", p.dataset.tab === target));
    });
  });
})();
