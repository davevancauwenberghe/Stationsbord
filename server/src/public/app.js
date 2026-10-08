import { languages, messages } from "./i18n.js?v=0.7.0";
import {
  asArray,
  escapeHtml as h,
  flag,
  belgianParts,
  validDate,
  validTime,
  apiDate,
  fmtTime,
  fmtDate,
  safeLink,
  departures,
  disturbances,
  isPlanned,
  serviceDate,
  delayMinutes,
  occupancy,
  filterBoardRows,
} from "./rail-utils.js?v=0.7.0";

const $ = (id) => document.getElementById(id);
const storage = {
  get(key, fallback) {
    try {
      return (
        JSON.parse(localStorage.getItem(`stationsbord.${key}`)) ?? fallback
      );
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`stationsbord.${key}`, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
const params = new URLSearchParams(location.search);
const preferred = [
  params.get("lang"),
  storage.get("language", ""),
  ...(navigator.languages || ["nl"]).map((l) => l.slice(0, 2)),
  "nl",
];
const state = {
  lang: preferred.find((l) => languages.includes(l)),
  station: null,
  mode: params.get("mode") === "arrival" ? "arrival" : "departure",
  live: true,
  view: null,
  data: null,
  rows: [],
  visible: 12,
  filter: "",
  focus: false,
  stale: false,
  failed: false,
  boardController: null,
  boardSequence: 0,
  searchController: null,
  searchSequence: 0,
  searchTimer: null,
  options: [],
  active: -1,
  dialogController: null,
  dialogSequence: 0,
  network: null,
  networkStale: false,
  networkController: null,
};
const t = (key) => messages[state.lang][key] || messages.en[key] || key;
const popular = [
  "Gent-Sint-Pieters",
  "Brussel-Centraal",
  "Antwerpen-Centraal",
  "Brugge",
];
let toastTimer;

function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 3500);
}
function readStations(key) {
  const list = storage.get(key, []);
  return Array.isArray(list)
    ? list
        .filter(
          (s) => s && typeof s.id === "string" && typeof s.name === "string",
        )
        .slice(0, 8)
    : [];
}
function remember(station) {
  if (!station?.id) return;
  storage.set(
    "recentStations",
    [
      station,
      ...readStations("recentStations").filter((s) => s.id !== station.id),
    ].slice(0, 4),
  );
  renderShortcuts();
}
function renderShortcuts() {
  const saved = readStations("savedStations");
  $("savedSection").hidden = !saved.length;
  renderStationList($("savedStations"), saved, true);
  const recent = readStations("recentStations").filter(
    (s) => !saved.some((f) => f.id === s.id),
  );
  $("shortcutsTitle").textContent = t(
    recent.length ? "recentStations" : "popularStations",
  );
  renderStationList(
    $("stationShortcuts"),
    recent.length ? recent : popular.map((name) => ({ name })),
    false,
  );
}
function renderStationList(container, stations, removable) {
  container.replaceChildren();
  stations.forEach((station) => {
    const row = document.createElement("div");
    row.className = "shortcut";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = station.name;
    button.addEventListener("click", () => selectStation(station));
    row.append(button);
    if (removable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-saved";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${t("removeSaved")}: ${station.name}`);
      remove.addEventListener("click", () => {
        if (
          !storage.set(
            "savedStations",
            readStations("savedStations").filter((s) => s.id !== station.id),
          )
        )
          return toast(t("storageError"));
        renderShortcuts();
        updateSaveButton();
      });
      row.append(remove);
    } else {
      const arrow = document.createElement("span");
      arrow.className = "shortcut-arrow";
      arrow.textContent = "↗";
      arrow.setAttribute("aria-hidden", "true");
      row.append(arrow);
    }
    container.append(row);
  });
}
function updateSaveButton() {
  const station = state.data?.stationinfo;
  const saved = readStations("savedStations").some((s) => s.id === station?.id);
  $("saveStation").hidden = !station?.id;
  $("saveStation").textContent = saved ? "★" : "☆";
  $("saveStation").setAttribute("aria-pressed", String(saved));
  $("saveStation").setAttribute("aria-label", t(saved ? "unsave" : "save"));
  $("saveStation").title = t(saved ? "unsave" : "save");
}
$("saveStation").addEventListener("click", () => {
  const info = state.data?.stationinfo;
  if (!info?.id) return;
  const saved = readStations("savedStations");
  const exists = saved.some((s) => s.id === info.id);
  if (!exists && saved.length >= 8) return toast(t("saveLimit"));
  const next = exists
    ? saved.filter((s) => s.id !== info.id)
    : [...saved, { id: info.id, name: state.data.station || info.name }];
  if (!storage.set("savedStations", next)) return toast(t("storageError"));
  updateSaveButton();
  renderShortcuts();
  toast(t(exists ? "stationRemoved" : "stationSaved"));
});

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.title = `Stationsbord · ${t("eyebrow")}`;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $("languageSelect").value = state.lang;
  $("stationInput").placeholder = t("searchPlaceholder");
  $("clearStation").setAttribute("aria-label", t("clear"));
  $("shareBoard").setAttribute("aria-label", t("share"));
  $("shareBoard").title = t("share");
  $("refreshBoard").setAttribute("aria-label", t("refresh"));
  $("refreshBoard").title = t("refresh");
  $("closeDialog").setAttribute("aria-label", t("close"));
  updateBoardControls();
  document
    .querySelector(".sidebar")
    .setAttribute("aria-label", `${t("station")} · ${t("time")}`);
  document.querySelector(".when-tabs").setAttribute("aria-label", t("when"));
  document
    .querySelector(".board-tabs")
    .setAttribute("aria-label", `${t("departures")} / ${t("arrivals")}`);
  $("searchStatus").textContent = t("searchHint");
  updateModeControls();
  renderShortcuts();
  renderHeading();
  updateSaveButton();
  renderNetworkButton();
  updateClock();
  if (!state.view) renderEmpty();
}
$("languageSelect").addEventListener("change", () => {
  state.lang = $("languageSelect").value;
  storage.set("language", state.lang);
  cancelSearch();
  closeOptions();
  closeDetails();
  applyLanguage();
  if (state.view) loadBoard({ ...state.view, lang: state.lang });
  refreshNetwork();
});
function updateClock() {
  const { date, time } = belgianParts();
  $("clock").textContent = `${fmtDate(date, state.lang)} · ${time}`;
}

// Search is cancelled as soon as text changes, not only when the debounce fires.
function cancelSearch() {
  clearTimeout(state.searchTimer);
  state.searchController?.abort();
  state.searchSequence++;
}
function closeOptions() {
  $("stationOptions").hidden = true;
  $("stationInput").setAttribute("aria-expanded", "false");
  $("stationInput").removeAttribute("aria-activedescendant");
  state.active = -1;
}
function highlightOption() {
  [...$("stationOptions").children].forEach((el, i) =>
    el.setAttribute("aria-selected", String(i === state.active)),
  );
  if (state.active >= 0) {
    $("stationInput").setAttribute(
      "aria-activedescendant",
      `station-option-${state.active}`,
    );
    $("stationOptions").children[state.active]?.scrollIntoView({
      block: "nearest",
    });
  } else $("stationInput").removeAttribute("aria-activedescendant");
}
function showOptions(options) {
  state.options = options;
  state.active = -1;
  $("stationOptions").replaceChildren();
  options.forEach((station, i) => {
    const option = document.createElement("div");
    option.className = "station-option";
    option.id = `station-option-${i}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.textContent = station.name;
    option.addEventListener("pointerdown", (e) => e.preventDefault());
    option.addEventListener("click", () => selectStation(station));
    $("stationOptions").append(option);
  });
  $("stationOptions").hidden = !options.length;
  $("stationInput").setAttribute("aria-expanded", String(!!options.length));
}
async function findStations() {
  const term = $("stationInput").value.trim();
  if (term.length < 2) {
    showOptions(readStations("recentStations"));
    $("searchStatus").textContent = t("searchHint");
    return;
  }
  const sequence = ++state.searchSequence;
  state.searchController = new AbortController();
  $("searchStatus").textContent = t("searching");
  $("searchStatus").classList.remove("error");
  try {
    const { data } = await request(
      `/api/stations/search?${new URLSearchParams({ q: term, lang: state.lang, limit: "10" })}`,
      state.searchController.signal,
    );
    if (sequence !== state.searchSequence) return;
    showOptions(asArray(data.results));
    $("searchStatus").textContent = state.options.length ? "" : t("noStations");
  } catch (error) {
    if (sequence !== state.searchSequence || error.name === "AbortError")
      return;
    closeOptions();
    $("searchStatus").textContent = t("searchError");
    $("searchStatus").classList.add("error");
  }
}
$("stationInput").addEventListener("input", () => {
  state.station = null;
  cancelSearch();
  closeOptions();
  $("clearStation").hidden = !$("stationInput").value;
  state.searchTimer = setTimeout(findStations, 180);
});
$("stationInput").addEventListener("focus", () => {
  if (!$("stationInput").value.trim())
    showOptions(readStations("recentStations"));
});
$("clearStation").addEventListener("click", () => {
  cancelSearch();
  state.station = null;
  $("stationInput").value = "";
  $("clearStation").hidden = true;
  $("stationInput").focus();
  showOptions(readStations("recentStations"));
  $("searchStatus").textContent = t("searchHint");
});
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".autocomplete")) {
    cancelSearch();
    closeOptions();
  }
});
$("stationInput").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cancelSearch();
    closeOptions();
    return;
  }
  if (e.key === "Tab") {
    cancelSearch();
    closeOptions();
    return;
  }
  if (!$("stationOptions").hidden && state.options.length) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      state.active =
        (state.active +
          (e.key === "ArrowDown" ? 1 : -1) +
          state.options.length) %
        state.options.length;
      highlightOption();
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectStation(state.options[state.active < 0 ? 0 : state.active]);
    }
  }
});
function selectStation(station) {
  cancelSearch();
  closeOptions();
  state.station = { ...station };
  $("stationInput").value = station.name;
  $("clearStation").hidden = false;
  $("searchStatus").textContent = "";
  $("searchStatus").classList.remove("error");
  $("stationInput").blur();
  submitBoard();
}
function updateModeControls() {
  $("liveMode").setAttribute("aria-pressed", String(state.live));
  $("planMode").setAttribute("aria-pressed", String(!state.live));
  $("plannedFields").hidden = state.live;
  $("dateInput").disabled = state.live;
  $("timeInput").disabled = state.live;
  $("modeHint").textContent = t(state.live ? "liveHint" : "planHint");
}
$("liveMode").addEventListener("click", () => {
  state.live = true;
  updateModeControls();
  if (state.station) submitBoard();
});
$("planMode").addEventListener("click", () => {
  state.live = false;
  const now = belgianParts();
  if (!$("dateInput").value) $("dateInput").value = now.date;
  if (!$("timeInput").value) $("timeInput").value = now.time;
  updateModeControls();
  $("dateInput").focus();
});
$("stationForm").addEventListener("submit", (e) => {
  e.preventDefault();
  submitBoard();
});
function submitBoard() {
  if (!state.station) {
    $("searchStatus").textContent = t("chooseHint");
    $("searchStatus").classList.add("error");
    $("stationInput").focus();
    findStations();
    return;
  }
  const date = $("dateInput").value,
    time = $("timeInput").value;
  if (!state.live && (!validDate(date) || !validTime(time)))
    return toast(t("invalidDate"));
  loadBoard({
    station: { ...state.station },
    mode: state.mode,
    lang: state.lang,
    live: state.live,
    date: state.live ? "" : date,
    time: state.live ? "" : time,
  });
}
for (const [id, mode] of [
  ["departuresTab", "departure"],
  ["arrivalsTab", "arrival"],
]) {
  $(id).addEventListener("click", () => {
    if (state.mode === mode) return;
    state.mode = mode;
    if (state.view) loadBoard({ ...state.view, mode });
    else renderHeading();
  });
}
$("refreshBoard").addEventListener("click", () => {
  if (state.view) loadBoard(state.view, { background: true });
});

async function request(url, signal) {
  // A client deadline also covers response-body consumption.
  const deadline = AbortSignal.timeout(30_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const response = await fetch(url, { signal: combined, cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || `HTTP ${response.status}`), {
      status: response.status,
    });
  return { data, stale: /^stale/i.test(response.headers.get("X-Cache") || "") };
}
function viewKey(view) {
  return JSON.stringify({
    ...view,
    station: view.station.id || view.station.name,
  });
}
function renderHeading() {
  const view = state.view;
  $("boardEyebrow").textContent = t("schedule");
  $("boardTitle").textContent = view
    ? state.data?.station || view.station.name
    : t("chooseStation");
  $("boardSubtitle").textContent = view
    ? view.live
      ? `${t("live")} · ${fmtDate(belgianParts().date, state.lang)}`
      : `${fmtDate(view.date, state.lang)} · ${view.time}`
    : t("searchHint");
  $("departuresTab").setAttribute(
    "aria-pressed",
    String(state.mode === "departure"),
  );
  $("arrivalsTab").setAttribute(
    "aria-pressed",
    String(state.mode === "arrival"),
  );
  $("shareBoard").hidden = !view;
  $("refreshBoard").disabled = !view || !!state.boardController;
  $("focusBoard").hidden = !view;
  $("boardTools").hidden = !state.data;
  updateBoardControls();
}

function updateBoardControls() {
  const label = t(
    state.mode === "arrival" ? "filterArrival" : "filterDeparture",
  );
  $("boardFilter").placeholder = label;
  $("filterLabel").textContent = label;
  $("clearFilter").setAttribute("aria-label", t("clearFilter"));
  $("clearFilter").title = t("clearFilter");
  const focusLabel = t(state.focus ? "exitFocus" : "focusBoard");
  $("focusLabel").textContent = focusLabel;
  $("focusBoard").setAttribute("aria-label", focusLabel);
  $("focusBoard").title = focusLabel;
  $("focusBoard").setAttribute("aria-pressed", String(state.focus));
}
function setFocusMode(enabled) {
  state.focus = enabled;
  document.body.classList.toggle("board-focus", enabled);
  updateBoardControls();
  $("board").scrollIntoView({ block: "start", behavior: "auto" });
  $("focusBoard").focus({ preventScroll: true });
}
$("focusBoard").addEventListener("click", () => setFocusMode(!state.focus));
$("boardFilter").addEventListener("input", () => {
  state.filter = $("boardFilter").value;
  state.visible = 12;
  renderBoard();
});
$("clearFilter").addEventListener("click", () => {
  state.filter = "";
  $("boardFilter").value = "";
  state.visible = 12;
  renderBoard();
  $("boardFilter").focus();
});
document.addEventListener("keydown", (event) => {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    $("detailsDialog").open
  )
    return;
  const typing = event.target.closest(
    "input, textarea, select, [contenteditable]",
  );
  if (event.key === "/" && !typing) {
    event.preventDefault();
    if (state.focus) setFocusMode(false);
    $("stationInput").focus();
    $("stationInput").select();
  } else if (event.key === "Escape" && state.focus && !typing) {
    event.preventDefault();
    setFocusMode(false);
  }
});
function syncURL() {
  const view = state.view;
  if (!view) return;
  const query = new URLSearchParams({
    station: view.station.id || view.station.name,
    name: state.data?.station || view.station.name,
    mode: view.mode,
    lang: view.lang,
  });
  if (!view.live) {
    query.set("date", view.date);
    query.set("time", view.time);
  }
  history.replaceState(null, "", `${location.pathname}?${query}`);
}
function renderNotice() {
  const notice = $("boardNotice");
  notice.className = "notice";
  if (!state.view) {
    notice.hidden = true;
    return;
  }
  const key = !navigator.onLine
    ? "offline"
    : state.failed
      ? state.data
        ? "stale"
        : "loadError"
      : state.stale
        ? "stale"
        : "";
  notice.hidden = !key;
  notice.textContent = key ? t(key) : "";
  if (state.failed && navigator.onLine) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = t("retry");
    retry.addEventListener("click", () =>
      loadBoard(state.view, { background: !!state.data }),
    );
    notice.append(retry);
  }
  if (state.failed && !state.data) notice.classList.add("error");
  const status = $("updateStatus");
  status.className = state.data ? `freshness${key ? " stale" : ""}` : "";
  status.textContent = state.data
    ? `${t("updated")} ${fmtTime(state.data.timestamp, state.lang)}${state.view.live && !key ? " · 60 s" : ""}`
    : "";
}
function renderEmpty(title = "emptyTitle", body = "emptyBody") {
  $("boardContent").innerHTML =
    `<div class="empty-state"><div class="empty-sign" aria-hidden="true">↗</div><h3>${h(t(title))}</h3><p>${h(t(body))}</p></div>`;
}
function renderLoading() {
  $("boardContent").innerHTML =
    `<div class="skeleton" aria-label="${h(t("loading"))}">${Array.from({ length: 5 }, () => '<div class="skeleton-row" aria-hidden="true"><span></span><span></span><span></span></div>').join("")}</div>`;
}
async function loadBoard(view, { background = false } = {}) {
  const same = state.view && viewKey(view) === viewKey(state.view);
  if (
    !state.view ||
    state.view.mode !== view.mode ||
    (state.view.station.id || state.view.station.name) !==
      (view.station.id || view.station.name)
  ) {
    state.filter = "";
    $("boardFilter").value = "";
  }
  state.boardController?.abort();
  const controller = new AbortController();
  state.boardController = controller;
  const sequence = ++state.boardSequence;
  state.view = { ...view, station: { ...view.station } };
  state.mode = view.mode;
  if (!same) {
    state.data = null;
    state.rows = [];
    state.visible = 12;
    state.failed = false;
    state.stale = false;
  }
  renderHeading();
  updateSaveButton();
  syncURL();
  renderNotice();
  if (!background || !state.data) renderLoading();
  if (!background) {
    $("board").focus({ preventScroll: true });
    if (matchMedia("(max-width: 760px)").matches) {
      $("board").scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }
  $("board").setAttribute("aria-busy", "true");
  const query = new URLSearchParams({
    lang: view.lang,
    arrdep: view.mode,
    alerts: "false",
  });
  query.set(
    view.station.id ? "id" : "station",
    view.station.id || view.station.name,
  );
  if (!view.live) {
    query.set("date", apiDate(view.date));
    query.set("time", view.time.replace(":", ""));
  }
  try {
    const result = await request(`/api/liveboard?${query}`, controller.signal);
    if (sequence !== state.boardSequence) return;
    state.data = result.data;
    state.rows = departures(result.data, view.mode);
    state.stale = result.stale;
    state.failed = false;
    const info = result.data.stationinfo;
    if (info?.id) {
      const station = {
        id: info.id,
        name: result.data.station || info.name || view.station.name,
      };
      state.view.station = station;
      remember(station);
      if (
        state.station &&
        (state.station.id === view.station.id ||
          state.station.name === view.station.name)
      ) {
        state.station = station;
        $("stationInput").value = station.name;
      }
    }
    renderBoard();
    renderHeading();
    updateSaveButton();
    syncURL();
  } catch (error) {
    if (sequence !== state.boardSequence || error.name === "AbortError") return;
    state.failed = true;
    if (state.data) renderBoard();
    else renderEmpty("loadError", "liveUnavailable");
  } finally {
    if (sequence === state.boardSequence) {
      state.boardController = null;
      $("board").setAttribute("aria-busy", "false");
      $("refreshBoard").disabled = false;
      renderNotice();
    }
  }
}
function statusFor(row, mode = state.mode) {
  if (flag(row.canceled))
    return { text: t("cancelled"), className: "cancelled" };
  if (flag(mode === "arrival" ? row.arrived : row.left))
    return {
      text: t(mode === "arrival" ? "arrived" : "departed"),
      className: "unknown",
    };
  const delay = delayMinutes(row.delay);
  if (delay === null) return { text: "—", className: "unknown" };
  return delay === 0
    ? { text: t("onTime"), className: "" }
    : {
        text: `${delay > 0 ? "+" : "−"}${Math.abs(delay)} ${t("minute")}`,
        className: "delay",
      };
}
function platformHTML(row) {
  const changed =
    row.platforminfo?.normal != null && !flag(row.platforminfo.normal);
  const platform =
    row.platform == null || row.platform === "" ? "—" : row.platform;
  return `<span class="platform${changed ? " changed" : ""}" title="${h(t(changed ? "changedPlatform" : "platform"))}" aria-label="${h(t(changed ? "changedPlatform" : "platform"))} ${h(platform)}">${h(platform)}</span>`;
}
function renderBoard() {
  const filtered = filterBoardRows(state.rows, state.filter, state.mode);
  $("filterCount").textContent = state.filter
    ? `${filtered.length} / ${state.rows.length} ${t(state.rows.length === 1 ? "trainSingular" : "trains")}`
    : `${state.rows.length} ${t(state.rows.length === 1 ? "trainSingular" : "trains")}`;
  $("clearFilter").hidden = !state.filter;
  if (!state.rows.length) {
    renderEmpty("noTrains", "noTrainsBody");
    return;
  }
  if (!filtered.length) {
    renderEmpty("noFilterResults", "noFilterResultsBody");
    return;
  }
  const view = state.view;
  const rows = filtered
    .slice(0, state.visible)
    .map(({ row, index: i }) => {
      const when = fmtTime(row.time, state.lang),
        delay = Number(row.delay) || 0;
      const expected =
        delay && !flag(row.canceled)
          ? fmtTime(Number(row.time) + delay, state.lang)
          : "";
      const status = statusFor(row, view.mode);
      const destination =
        (view.mode === "departure" ? row.direction?.name : "") ||
        row.station ||
        row.stationinfo?.name ||
        "—";
      const train =
        row.vehicleinfo?.shortname ||
        String(row.vehicleinfo?.name || row.vehicle || "").replace(
          /^BE\.NMBS\./,
          "",
        );
      const statusMarkup = `<span class="status-text ${status.className}">${h(status.text)}</span>`;
      return `<tr${flag(row.canceled) ? ' class="cancelled-row"' : ""}><td class="time-cell">${expected ? `<span class="scheduled">${h(when)}</span>${h(expected)}` : h(when)}</td><td><button class="train-link" type="button" data-train="${i}" aria-label="${h(`${train} · ${destination} · ${t("stops")}`)}"><span class="destination-line"><span>${h(destination)}</span><span class="row-arrow" aria-hidden="true">↗</span></span></button><div class="mobile-meta"><span class="train-code">${h(train)}</span>${statusMarkup}</div></td><td class="train-column"><span class="train-code">${h(train)}</span></td><td class="status-column">${statusMarkup}</td><td>${platformHTML(row)}</td></tr>`;
    })
    .join("");
  $("boardContent").innerHTML =
    `<table class="timetable"><caption class="sr-only">${h(t(view.mode === "arrival" ? "arrivals" : "departures"))} · ${h(state.data.station || view.station.name)}</caption><colgroup><col class="time-col"><col><col class="train-col"><col class="status-col"><col class="platform-col"></colgroup><thead><tr><th scope="col">${h(t("time"))}</th><th scope="col">${h(t(view.mode === "arrival" ? "origin" : "destination"))}</th><th scope="col" class="train-column">${h(t("train"))}</th><th scope="col" class="status-column">${h(t("status"))}</th><th scope="col">${h(t("platform"))}</th></tr></thead><tbody>${rows}</tbody></table>${filtered.length > 12 ? `<div class="more-row"><button class="text-button" type="button" id="showMore">${h(t(state.visible < filtered.length ? "more" : "less"))} (${state.visible < filtered.length ? filtered.length - state.visible : 12})</button></div>` : ""}`;
  $("showMore")?.addEventListener("click", () => {
    state.visible = state.visible < filtered.length ? state.visible + 12 : 12;
    renderBoard();
    $("showMore")?.focus();
  });
}
$("boardContent").addEventListener("click", (event) => {
  const button = event.target.closest("[data-train]");
  if (!button) return;
  const row = state.rows[Number(button.dataset.train)];
  if (row) openTrain(row, state.view);
});

function openDetails(title, eyebrow) {
  state.dialogController?.abort();
  state.dialogController = new AbortController();
  const sequence = ++state.dialogSequence;
  $("dialogTitle").textContent = title;
  $("dialogEyebrow").textContent = eyebrow;
  $("dialogContent").innerHTML =
    `<p class="muted" role="status">${h(t("loading"))}</p>`;
  if (!$("detailsDialog").open) $("detailsDialog").showModal();
  $("closeDialog").focus();
  return { sequence, signal: state.dialogController.signal };
}
function dialogCurrent(sequence) {
  return sequence === state.dialogSequence && $("detailsDialog").open;
}
function closeDetails() {
  $("detailsDialog").close();
  state.dialogController?.abort();
  state.dialogSequence++;
}
$("closeDialog").addEventListener("click", closeDetails);
$("detailsDialog").addEventListener("close", () => {
  state.dialogController?.abort();
  state.dialogSequence++;
});
$("detailsDialog").addEventListener("click", (event) => {
  if (event.target !== $("detailsDialog")) return;
  const rect = event.target.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    closeDetails();
});
async function openTrain(row, view) {
  const id = row.vehicleinfo?.name || row.vehicle;
  const short =
    row.vehicleinfo?.shortname || String(id || "").replace(/^BE\.NMBS\./, "");
  const date = serviceDate(row, view.live ? belgianParts().date : view.date);
  const { sequence, signal } = openDetails(short || t("train"), t("details"));
  if (!id) {
    $("dialogContent").textContent = t("detailError");
    return;
  }
  try {
    const query = new URLSearchParams({
      id,
      lang: state.lang,
      date: apiDate(date),
      alerts: "false",
    });
    const result = await request(`/api/vehicle?${query}`, signal);
    if (!dialogCurrent(sequence)) return;
    const stops = asArray(result.data.stops?.stop);
    const html = stops
      .map((stop) => {
        const dep =
          stop.scheduledDepartureTime || stop.departuretime || stop.time;
        const arr = stop.scheduledArrivalTime || stop.arrivaltime;
        const current = stop.stationinfo?.id === view.station.id;
        const status = statusFor(
          {
            delay: dep ? stop.departureDelay : stop.arrivalDelay,
            canceled: dep ? stop.departureCanceled : stop.arrivalCanceled,
          },
          "departure",
        );
        const occ = occupancy(stop);
        return `<li class="stop${current ? " current" : ""}"><div class="stop-times">${h(fmtTime(dep || arr, state.lang))}<small>${h(t(dep ? "departure" : "arrival"))}</small>${dep && arr && Number(arr) !== Number(dep) ? `<small>${h(t("arrival"))} ${h(fmtTime(arr, state.lang))}</small>` : ""}</div><div class="stop-name">${h(stop.station || stop.stationinfo?.name || "—")}<small><span class="status-text ${status.className}">${h(status.text)}</span>${current ? ` · ${h(t("selectedStop"))}` : ""}${flag(stop.isExtraStop) ? ` · ${h(t("extraStop"))}` : ""}${occ ? ` · ${h(t(occ))}` : ""}</small></div>${platformHTML(stop)}</li>`;
      })
      .join("");
    $("dialogContent").innerHTML =
      `${result.stale ? `<div class="notice">${h(t("stale"))}</div>` : ""}<p class="dialog-summary"><span>${h(fmtDate(date, state.lang))}</span><span>${stops.length} ${h(t("stops"))}</span><span>${h(t("allTimes"))}</span></p>${stops.length ? `<ol class="stop-list">${html}</ol>` : `<p class="muted">${h(t("noStops"))}</p>`}<section class="composition-section" id="composition"><h3 class="section-title">${h(t("composition"))}</h3><p class="muted" role="status">${h(t(date === belgianParts().date ? "compositionLoad" : "compositionToday"))}</p></section>`;
    // Show stops immediately; composition must never delay or overwrite a newer dialog.
    if (date !== belgianParts().date) return;
    try {
      const composition = await request(
        `/api/composition?${new URLSearchParams({ id: String(id).replace(/^BE\.NMBS\./, ""), lang: state.lang })}`,
        signal,
      );
      if (!dialogCurrent(sequence)) return;
      $("composition").innerHTML =
        `<h3 class="section-title">${h(t("composition"))}</h3>${composition.stale ? `<p class="muted">${h(t("stale"))}</p>` : ""}${renderComposition(composition.data)}`;
    } catch (error) {
      if (!dialogCurrent(sequence) || signal.aborted) return;
      $("composition").innerHTML =
        `<h3 class="section-title">${h(t("composition"))}</h3><p class="muted">${h(t("compositionError"))}</p>`;
    }
  } catch (error) {
    if (!dialogCurrent(sequence) || signal.aborted) return;
    $("dialogContent").innerHTML =
      `<p class="notice error">${h(t("detailError"))}</p><button class="text-button" type="button" id="retryDetails">${h(t("retry"))}</button>`;
    $("retryDetails").addEventListener("click", () => openTrain(row, view));
  }
}
function renderComposition(data) {
  const segments = asArray(data.composition?.segments?.segment);
  const number = (value) =>
    Number.isFinite(Number(value)) ? Number(value) : 0;
  const result = segments
    .map((segment) => {
      const units = asArray(segment.composition?.units?.unit);
      if (!units.length) return "";
      // Each segment is a separate formation; never add the same train across segments.
      const first = units.reduce(
        (sum, u) =>
          sum + number(u.seatsFirstClass) + number(u.seatsCoupeFirstClass),
        0,
      );
      const second = units.reduce(
        (sum, u) =>
          sum + number(u.seatsSecondClass) + number(u.seatsCoupeSecondClass),
        0,
      );
      const label = [
        segment.origin?.name || segment.origin,
        segment.destination?.name || segment.destination,
      ]
        .filter((v) => typeof v === "string")
        .join(" → ");
      return `<div class="composition-segment">${label ? `<h4>${h(label)}</h4>` : ""}<div class="composition-stats"><span>${units.length} ${h(t("carriages"))}</span><span>${h(t("first"))}: ${first}</span><span>${h(t("second"))}: ${second} ${h(t("seats"))}</span></div>${units
        .map((unit) => {
          const features = [
            ["hasToilets", "toilets"],
            ["hasBikeSection", "bikes"],
            ["hasPrmSection", "accessible"],
            ["hasAirco", "airco"],
          ]
            .filter(([key]) => flag(unit[key]))
            .map(([, key]) => t(key));
          if (
            flag(unit.hasFirstClassOutlets) ||
            flag(unit.hasSecondClassOutlets)
          )
            features.push(t("outlets"));
          const name =
            unit.materialSubTypeName ||
            [unit.materialType?.parent_type, unit.materialType?.sub_type]
              .filter(Boolean)
              .join(" ") ||
            "—";
          return `<div class="carriage"><div><strong>${h(name)}</strong><small>${h(unit.materialNumber || "")}</small></div><div><small>${h(features.join(" · "))}</small></div></div>`;
        })
        .join("")}</div>`;
    })
    .join("");
  return result || `<p class="muted">${h(t("compositionError"))}</p>`;
}

function renderNetworkButton() {
  const button = $("networkButton");
  button.className = "network-button";
  if (!state.network) {
    $("networkLabel").textContent = t(
      state.network === null ? "network" : "networkUnknown",
    );
    return;
  }
  const count = state.network.filter((d) => !isPlanned(d)).length;
  $("networkLabel").textContent = count
    ? `${count} ${t(count === 1 ? "networkIssue" : "networkIssues")}`
    : t("networkClear");
  if (state.networkStale) $("networkLabel").textContent = t("networkUnknown");
  else button.classList.add(count ? "has-issues" : "network-ok");
}
async function refreshNetwork() {
  state.networkController?.abort();
  const controller = new AbortController();
  state.networkController = controller;
  try {
    const result = await request(
      `/api/disturbances?lang=${state.lang}`,
      controller.signal,
    );
    if (controller !== state.networkController) return;
    state.network = disturbances(result.data);
    state.networkStale = result.stale;
  } catch {
    if (controller !== state.networkController || controller.signal.aborted)
      return;
    state.networkStale = true;
    if (!state.network) state.network = false;
  } finally {
    if (controller === state.networkController) {
      state.networkController = null;
      renderNetworkButton();
    }
  }
}
$("networkButton").addEventListener("click", async () => {
  const { sequence } = openDetails(t("disturbances"), t("network"));
  await refreshNetwork();
  if (!dialogCurrent(sequence)) return;
  const list = Array.isArray(state.network) ? state.network : [];
  $("dialogContent").innerHTML =
    `${state.networkStale ? `<div class="notice">${h(t(list.length ? "stale" : "networkUnknown"))}</div>` : ""}<p class="dialog-summary">${h(t("networkIntro"))}</p>${
      list.length
        ? list
            .map((d) => {
              const link = safeLink(d.link),
                attachment = safeLink(d.attachment);
              return `<article class="disturbance"><span class="category">${h(t(isPlanned(d) ? "works" : "disturbance"))}</span><h3>${h(d.title || t("disturbance"))}</h3><p>${h(d.description || "")}</p>${link ? `<a href="${h(link)}" target="_blank" rel="noopener noreferrer">${h(t("moreInfo"))} ↗</a>` : ""}${attachment ? `<a href="${h(attachment)}" target="_blank" rel="noopener noreferrer">${h(t("attachment"))} ↗</a>` : ""}</article>`;
            })
            .join("")
        : `<p class="muted">${h(t(state.networkStale ? "networkUnknown" : "noDisturbances"))}</p>`
    }`;
});
$("shareBoard").addEventListener("click", async () => {
  syncURL();
  if (navigator.share) {
    try {
      const view = state.view;
      await navigator.share({
        title: `${state.data?.station || view.station.name} · ${t(view.mode === "arrival" ? "arrivals" : "departures")} | Stationsbord`,
        url: location.href,
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      // If native sharing is unavailable, keep the copy-link fallback.
    }
  }
  try {
    await navigator.clipboard.writeText(location.href);
    toast(t("copied"));
  } catch {
    openDetails(t("share"), t("schedule"));
    $("dialogContent").innerHTML =
      `<p class="muted">${h(t("shareFallback"))}</p><input class="share-input" id="shareURL" aria-label="URL" readonly value="${h(location.href)}">`;
    $("shareURL").focus();
    $("shareURL").select();
  }
});
function refreshVisible() {
  if (document.hidden) return;
  updateClock();
  if (state.view?.live && !state.boardController && navigator.onLine)
    loadBoard(state.view, { background: true });
  if (!state.networkController && navigator.onLine) refreshNetwork();
}
window.addEventListener("offline", () => {
  renderNotice();
  state.networkStale = true;
  renderNetworkButton();
});
window.addEventListener("online", () => {
  if (state.view && !document.hidden)
    loadBoard(state.view, { background: true });
  refreshNetwork();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshVisible();
});
setInterval(refreshVisible, 60_000);

// A shared link restores the displayed station, language, arrivals/departures and planned moment.
const initialStation = params.get("station");
const date = params.get("date"),
  time = params.get("time");
if (validDate(date || "") && validTime(time || "")) {
  state.live = false;
  $("dateInput").value = date;
  $("timeInput").value = time;
}
applyLanguage();
if (initialStation && initialStation.length <= 150) {
  state.station = /^BE\.NMBS\.[A-Za-z0-9]+$/.test(initialStation)
    ? { id: initialStation, name: params.get("name") || initialStation }
    : { name: initialStation };
  $("stationInput").value = state.station.name;
  $("clearStation").hidden = false;
  submitBoard();
}
refreshNetwork();
