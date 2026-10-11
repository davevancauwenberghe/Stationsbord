// Runs before the application module so installed apps have a visible launch
// state while scripts and the initial board/lookup are loading.
(() => {
  const installed =
    navigator.standalone === true ||
    matchMedia("(display-mode: standalone), (display-mode: fullscreen)")
      .matches;
  if (!installed) return;
  const root = document.documentElement;
  root.classList.add("app-loading");
  let finished = false;
  const observer = new MutationObserver(show);
  const timeout = setTimeout(finish, 8000);
  function show() {
    if (finished) return;
    const launch = document.getElementById("appLaunch");
    if (launch) launch.hidden = false;
    for (const content of document.querySelectorAll("[data-launch-content]"))
      content.inert = true;
  }
  function finish() {
    finished = true;
    clearTimeout(timeout);
    observer.disconnect();
    root.classList.remove("app-loading");
    document.getElementById("appLaunch")?.remove();
    for (const content of document.querySelectorAll("[data-launch-content]"))
      content.inert = false;
  }
  observer.observe(root, { childList: true, subtree: true });
  show();
  window.addEventListener("stationsbord:ready", finish, { once: true });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) finish();
  });
})();
