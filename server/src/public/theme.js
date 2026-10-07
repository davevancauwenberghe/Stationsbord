// Run before styles load so a saved appearance is applied on the first paint.
(() => {
  const key = "stationsbord.theme";
  const choices = ["system", "light", "dark"];
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (choices.includes(saved)) preference = saved;
  } catch {
    // Appearance remains usable when browser storage is unavailable.
  }

  function apply() {
    const theme =
      preference === "system"
        ? system.matches
          ? "dark"
          : "light"
        : preference;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#192525" : "#163b36";
  }
  apply();
  system.addEventListener("change", () => {
    if (preference === "system") apply();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    try {
      const saved = JSON.parse(event.newValue);
      preference = choices.includes(saved) ? saved : "system";
    } catch {
      preference = "system";
    }
    const select = document.getElementById("themeSelect");
    if (select) select.value = preference;
    apply();
  });
  document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("themeSelect");
    select.value = preference;
    select.addEventListener("change", () => {
      preference = select.value;
      try {
        localStorage.setItem(key, JSON.stringify(preference));
      } catch {
        // Keep the selection for this visit if storage is blocked.
      }
      apply();
    });
  });
})();
