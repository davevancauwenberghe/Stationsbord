import {
  renderComposition,
  renderCompositionDisclaimer,
  installArtworkFallbacks,
} from "./composition.js?v=0.9.6";
import {
  renderCrowding,
  renderTrainNotices,
  renderStopList,
  stopEvents,
} from "./train-details.js?v=0.9.6";
import { languages, messages } from "./i18n.js?v=0.9.6";
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
  departures,
  disturbances,
  isPlanned,
  serviceDate,
  delayMinutes,
  filterBoardRows,
} from "./rail-utils.js?v=0.9.6";

import { renderNetwork } from "./network.js?v=0.9.6";
import { createPlanner } from "./planner.js?v=0.9.6";
import {
  normalizeTrainId,
  trainStops,
  matchesServiceDate,
  matchesBoardStop,
  previousServiceDate,
  journeyEndDate,
  trainLabel,
} from "./train-lookup.js?v=0.9.6";

import {
  trainProgress,
  renderProgress,
  activeService,
  currentServiceDay,
} from "./train-progress.js?v=0.9.6";

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
  screen:
    params.get("view") === "planner"
      ? "planner"
      : params.has("train") || params.get("view") === "train"
        ? "train"
        : "station",
  trainLive: true,
  trainView: null,
  trainData: null,
  trainServiceDate: "",
  trainStale: false,
  trainFailed: false,
  trainController: null,
  trainSequence: 0,
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
  dialogReturnKey: null,
  dialogTrain: null,
  editingSaved: false,
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
let planner;

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
  const focused = document.activeElement;
  const focusKey = focused?.dataset.stationKey;
  const focusAction = focused?.dataset.shortcutAction;
  const saved = readStations("savedStations");
  if (!saved.length) state.editingSaved = false;
  $("savedSection").hidden = !saved.length;
  renderStationList($("savedStations"), saved, true);
  $("popularSection").hidden = saved.length > 0;
  $("shortcutsTitle").textContent = t("popularStations");
  renderStationList(
    $("stationShortcuts"),
    popular.map((name) => ({ name })),
    false,
  );
  $("manageSaved").setAttribute("aria-pressed", String(state.editingSaved));
  $("manageSaved").textContent = t(
    state.editingSaved ? "doneEditing" : "manageSaved",
  );
  if (focusKey)
    [
      ...document.querySelectorAll(
        "#savedStations button, #stationShortcuts button",
      ),
    ]
      .find(
        (button) =>
          button.dataset.stationKey === focusKey &&
          button.dataset.shortcutAction === focusAction,
      )
      ?.focus({ preventScroll: true });
}
function renderStationList(container, stations, removable) {
  container.replaceChildren();
  stations.forEach((station) => {
    const row = document.createElement("div");
    row.className = removable ? "station-chip" : "shortcut";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = station.name;
    button.dataset.stationKey = station.id || station.name;
    button.dataset.shortcutAction = "select";
    button.addEventListener("click", () => selectStation(station));
    if (removable) {
      button.setAttribute(
        "aria-pressed",
        String(station.id === state.view?.station.id),
      );
    }
    row.append(button);
    if (removable && state.editingSaved) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.stationKey = station.id;
      remove.dataset.shortcutAction = "remove";
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
        const next = $("savedStations").querySelector(".remove-saved");
        (
          next ||
          (readStations("savedStations").length
            ? $("manageSaved")
            : $("stationInput"))
        ).focus();
      });
      row.append(remove);
    } else if (!removable) {
      const arrow = document.createElement("span");
      arrow.className = "shortcut-arrow";
      arrow.textContent = "↗";
      arrow.setAttribute("aria-hidden", "true");
      row.append(arrow);
    }
    container.append(row);
  });
}
$("manageSaved").addEventListener("click", () => {
  state.editingSaved = !state.editingSaved;
  renderShortcuts();
});
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

function updatePageTitle() {
  if (state.screen === "planner") {
    document.title = `${planner?.title || t("planner")} | Stationsbord`;
    return;
  }
  const view = state.screen === "train" ? state.trainView : state.view;
  document.title = !view
    ? `Stationsbord · ${t("eyebrow")}`
    : state.screen === "train"
      ? `${trainLabel(state.trainData, `${t("train")} ${view.id}`)} | Stationsbord`
      : `${state.data?.station || view.station.name} · ${t(view.mode === "arrival" ? "arrivals" : "departures")} | Stationsbord`;
}
function applyLanguage() {
  document.documentElement.lang = state.lang;
  updatePageTitle();
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
  $("viewNavigation").setAttribute("aria-label", t("searchViews"));
  $("trainInput").placeholder = t("trainPlaceholder");
  $("shareTrain").setAttribute("aria-label", t("shareTrain"));
  $("shareTrain").title = t("shareTrain");
  $("refreshTrain").setAttribute("aria-label", t("refresh"));
  $("refreshTrain").title = t("refresh");
  document
    .querySelector(".train-when-tabs")
    .setAttribute("aria-label", t("when"));
  updateTrainModeControls();
  planner?.language();
  document.querySelector(".skip-link").textContent = t(
    state.screen === "planner"
      ? "skipPlanner"
      : state.screen === "train"
        ? "skipTrain"
        : "skip",
  );
  if (!state.trainView) renderTrainEmpty();
  updateBoardControls();
  document
    .querySelector(".sidebar")
    .setAttribute("aria-label", `${t("station")} · ${t("time")}`);
  document.querySelector(".when-tabs").setAttribute("aria-label", t("when"));
  document
    .querySelector(".board-tabs")
    .setAttribute("aria-label", `${t("departures")} / ${t("arrivals")}`);
  $("searchStatus").textContent = "";
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
  if (state.view && state.screen === "station")
    loadBoard({ ...state.view, lang: state.lang });
  if (state.trainView && state.screen === "train")
    loadTrain({ ...state.trainView, lang: state.lang });
  if (state.screen === "planner") planner.refresh({ force: true });
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
    $("searchStatus").textContent = "";
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
  $("searchStatus").textContent = "";
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
        state.active < 0
          ? e.key === "ArrowDown"
            ? 0
            : state.options.length - 1
          : (state.active +
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
  return loadBoard({
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
    : "";
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
let boardFullscreenActive = false;
async function setFocusMode(
  enabled,
  { restoreFocus = true, fullscreen = true } = {},
) {
  state.focus = enabled;
  document.body.classList.toggle("board-focus", enabled);
  updateBoardControls();
  $("board").scrollIntoView({ block: "start", behavior: "auto" });
  if (restoreFocus) $("focusBoard").focus({ preventScroll: true });
  if (!fullscreen) return;
  const root = document.documentElement;
  const active = () =>
    (document.fullscreenElement || document.webkitFullscreenElement) === root;
  const exit = () =>
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  try {
    if (enabled) {
      const enter = root.requestFullscreen || root.webkitRequestFullscreen;
      if (enter) await enter.call(root, { navigationUI: "hide" });
      if (!state.focus && active()) await exit();
    } else if (active()) await exit();
  } catch {
    // Board mode still fills the viewport if browser fullscreen is unavailable.
  }
}
function fullscreenChanged() {
  const active =
    (document.fullscreenElement || document.webkitFullscreenElement) ===
    document.documentElement;
  if (boardFullscreenActive && !active)
    setFocusMode(false, { fullscreen: false });
  boardFullscreenActive = active;
}
document.addEventListener("fullscreenchange", fullscreenChanged);
document.addEventListener("webkitfullscreenchange", fullscreenChanged);
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
  if (event.key === "Escape" && state.focus && !typing) {
    event.preventDefault();
    setFocusMode(false);
  }
});
function syncURL() {
  updatePageTitle();
  if (state.screen === "planner") {
    const query = new URLSearchParams({ view: "planner", lang: state.lang });
    const view = planner?.view;
    if (view) {
      query.set("from", view.from.id);
      query.set("fromName", view.from.name);
      query.set("to", view.to.id);
      query.set("toName", view.to.name);
      if (!view.live) {
        query.set("date", view.date);
        query.set("time", view.time);
        query.set("timesel", view.timesel);
      }
    }
    history.replaceState(null, "", `${location.pathname}?${query}`);
    return;
  }
  if (state.screen === "train") {
    const view = state.trainView;
    const query = new URLSearchParams({ view: "train", lang: state.lang });
    if (view) {
      query.set("train", view.id);
      if (!view.live) {
        query.set("date", view.date);
      }
    }
    history.replaceState(null, "", `${location.pathname}?${query}`);
    return;
  }
  const view = state.view;
  if (!view) {
    history.replaceState(
      null,
      "",
      `${location.pathname}?${new URLSearchParams({ lang: state.lang })}`,
    );
    return;
  }
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
    `<div class="empty-state"><svg class="empty-sign" viewBox="0 0 24 24" aria-hidden="true"><use href="/icons.svg?v=0.9.6#station" /></svg><h3>${h(t(title))}</h3><p>${h(t(body))}</p></div>`;
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
  renderShortcuts();
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
    alerts: "true",
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
      text: "",
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
function trainKey(row) {
  return JSON.stringify([
    row.vehicleinfo?.name || row.vehicle,
    row.time,
    row.departureConnection || row.arrivalConnection || "",
  ]);
}
function renderBoard() {
  // Refresh replaces table nodes: restore keyboard focus by service, never row index.
  const focused = document.activeElement;
  const focusedTrain = focused?.dataset.trainKey;
  const focusedMore = focused?.id === "showMore";
  const restoreFocus = () => {
    if (!focusedTrain && !focusedMore) return;
    const target = focusedMore
      ? $("showMore")
      : [...$("boardContent").querySelectorAll("[data-train-key]")].find(
          (button) => button.dataset.trainKey === focusedTrain,
        );
    (target || $("board")).focus({ preventScroll: true });
  };
  const filtered = filterBoardRows(state.rows, state.filter, state.mode);
  $("filterCount").textContent = state.filter
    ? `${filtered.length} / ${state.rows.length} ${t(state.rows.length === 1 ? "trainSingular" : "trains")}`
    : `${state.rows.length} ${t(state.rows.length === 1 ? "trainSingular" : "trains")}`;
  $("clearFilter").hidden = !state.filter;
  if (!state.rows.length) {
    renderEmpty("noTrains", "noTrainsBody");
    restoreFocus();
    return;
  }
  if (!filtered.length) {
    renderEmpty("noFilterResults", "noFilterResultsBody");
    restoreFocus();
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
      const completed =
        flag(view.mode === "arrival" ? row.arrived : row.left) &&
        !flag(row.canceled);
      const statusMarkup = `${completed ? `<span class="sr-only">${h(t(view.mode === "arrival" ? "arrived" : "departed"))}</span>` : ""}<span class="status-text ${status.className}">${h(status.text)}</span>`;
      return `<tr${flag(row.canceled) ? ' class="cancelled-row"' : completed ? ' class="completed-row"' : ""}><td class="time-cell">${expected ? `<span class="scheduled">${h(when)}</span><span class="expected-time ${delay > 0 ? "delay" : "early"}">${h(expected)}</span>` : h(when)}</td><td><button class="train-link" type="button" data-train="${i}" data-train-key="${h(trainKey(row))}" aria-label="${h(`${train} · ${destination} · ${t("stops")}`)}"><span class="destination-line"><span>${h(destination)}</span><span class="row-arrow" aria-hidden="true">↗</span></span></button><div class="board-row-meta">${renderCrowding(row, t)}<div class="mobile-meta"><span class="train-code">${h(train)}</span>${statusMarkup}</div></div></td><td class="train-column"><span class="train-code">${h(train)}</span></td><td class="status-column">${statusMarkup}</td><td>${platformHTML(row)}</td></tr>`;
    })
    .join("");
  $("boardContent").innerHTML =
    `<table class="timetable"><caption class="sr-only">${h(t(view.mode === "arrival" ? "arrivals" : "departures"))} · ${h(state.data.station || view.station.name)}</caption><colgroup><col class="time-col"><col><col class="train-col"><col class="status-col"><col class="platform-col"></colgroup><thead><tr><th scope="col">${h(t("time"))}</th><th scope="col">${h(t(view.mode === "arrival" ? "origin" : "destination"))}</th><th scope="col" class="train-column">${h(t("train"))}</th><th scope="col" class="status-column">${h(t("status"))}</th><th scope="col">${h(t("platform"))}</th></tr></thead><tbody>${rows}</tbody></table>${filtered.length > 12 ? `<div class="more-row"><button class="text-button" type="button" id="showMore">${h(t(state.visible < filtered.length ? "more" : "less"))} (${state.visible < filtered.length ? filtered.length - state.visible : 12})</button></div>` : ""}`;
  restoreFocus();
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
  if (!$("detailsDialog").open)
    state.dialogReturnKey = document.activeElement?.dataset.trainKey || null;
  state.dialogTrain = null;
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
  state.dialogTrain = null;
  if (state.dialogReturnKey) {
    const opener = [...document.querySelectorAll("[data-train-key]")].find(
      (button) => button.dataset.trainKey === state.dialogReturnKey,
    );
    (opener || $(state.screen === "planner" ? "plannerResult" : "board")).focus(
      { preventScroll: true },
    );
    state.dialogReturnKey = null;
  }
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
  const date = serviceDate(row, view.live ? belgianParts().date : view.date);
  const { sequence, signal } = openDetails(
    trainLabel(row, t("train")),
    t("details"),
  );
  if (!id) {
    $("dialogContent").textContent = t("detailError");
    return;
  }
  const detail = {
    id,
    row,
    view,
    date,
    sequence,
    signal,
    result: null,
    loading: false,
  };
  state.dialogTrain = detail;
  await loadDialogTrain(detail);
}

// Refresh the open live route without resetting the dialog or refetching its
// composition every minute. A closed/replaced dialog cannot accept old results.
async function loadDialogTrain(detail, { background = false } = {}) {
  const current = () =>
    state.dialogTrain === detail && dialogCurrent(detail.sequence);
  if (!current() || detail.loading) return;
  detail.loading = true;
  try {
    const fetchRoute = async (date) => {
      const result = await request(
        `/api/vehicle?${new URLSearchParams({ id: detail.id, lang: state.lang, date: apiDate(date), alerts: "true" })}`,
        detail.signal,
      );
      if (
        !matchesServiceDate(result.data, date) ||
        !matchesBoardStop(result.data, detail.row, {
          stationId: detail.view.station.id,
          mode: detail.view.mode,
        })
      )
        throw Object.assign(new Error("Service does not match board stop"), {
          status: 404,
        });
      return result;
    };
    let result;
    try {
      result = await fetchRoute(detail.date);
    } catch (error) {
      if (error.status !== 404 || detail.result || !current()) throw error;
      const previous = previousServiceDate(detail.date);
      if (!previous) throw error;
      result = await fetchRoute(previous);
      if (!current()) return;
      detail.date = previous;
    }
    if (!current()) return;
    detail.result = result;
    $("dialogTitle").textContent = trainLabel(
      result.data,
      trainLabel(detail.row, t("train")),
    );
    const reused = replaceVehicleContent(
      $("dialogContent"),
      renderVehicle(result, detail.row, {
        date: detail.date,
        stationId: detail.view.station.id,
        mode: detail.view.mode,
        live: detail.view.live,
        compositionId: "composition",
      }),
      background,
    );
    if (!reused)
      await loadComposition(
        result.data.vehicleinfo?.name || result.data.vehicle || detail.id,
        {
          date: detail.date,
          section: $("composition"),
          current,
          signal: detail.signal,
        },
      );
  } catch (error) {
    if (!current() || detail.signal.aborted) return;
    if (detail.result) {
      replaceVehicleContent(
        $("dialogContent"),
        renderVehicle({ ...detail.result, stale: true }, detail.row, {
          date: detail.date,
          stationId: detail.view.station.id,
          mode: detail.view.mode,
          live: detail.view.live,
          compositionId: "composition",
        }),
        true,
        true,
      );
      const section = $("composition");
      if (section.dataset.loaded !== "true")
        showCompositionFailure(
          detail.result.data.vehicleinfo?.name ||
            detail.result.data.vehicle ||
            detail.id,
          { date: detail.date, section, current, signal: detail.signal },
        );
    } else {
      $("dialogContent").innerHTML =
        `<p class="notice error">${h(t("detailError"))}</p>${renderTrainNotices(null, detail.row, t)}<button class="text-button" type="button" id="retryDetails">${h(t("retry"))}</button>`;
      $("retryDetails").addEventListener("click", () =>
        openTrain(detail.row, detail.view),
      );
    }
  } finally {
    detail.loading = false;
  }
}

function replaceVehicleContent(
  container,
  html,
  reuseComposition = false,
  retainUnavailable = false,
) {
  const composition = reuseComposition
    ? container.querySelector(
        retainUnavailable
          ? ".composition-section"
          : '.composition-section[data-loaded="true"]',
      )
    : null;
  const focusedStop = container.contains(document.activeElement)
    ? document.activeElement?.dataset.stopIndex
    : null;
  const compositionFocused = composition?.contains(document.activeElement);
  const scroll = composition?.querySelector(".composition-scroll")?.scrollLeft;
  container.innerHTML = html;
  const replacement = container.querySelector(".composition-section");
  const age = Date.now() - Number(composition?.dataset.loadedAt);
  const reused =
    composition &&
    composition.dataset.key === replacement.dataset.key &&
    (retainUnavailable || (age >= 0 && age < 15 * 60_000));
  if (reused) {
    replacement.replaceWith(composition);
    if (scroll != null)
      composition.querySelector(".composition-scroll").scrollLeft = scroll;
    if (compositionFocused) {
      composition.tabIndex = -1;
      composition.focus({ preventScroll: true });
    }
  }
  if (focusedStop != null)
    container
      .querySelector(`[data-stop-index="${focusedStop}"]`)
      ?.focus({ preventScroll: true });
  return !!reused;
}

function renderVehicle(
  result,
  row,
  {
    date,
    stationId,
    mode = "departure",
    live = false,
    stationLinks = false,
    compositionId,
  },
) {
  const stops = trainStops(result.data);
  const endDate = journeyEndDate(stops, date);
  const dateLabel =
    fmtDate(date, state.lang) +
    (endDate !== date ? ` → ${fmtDate(endDate, state.lang)}` : "");
  const progress = trainProgress(stops, {
    live: live && currentServiceDay(stops, date),
    stale: result.stale || !navigator.onLine,
    timestamp: result.data.timestamp,
  });
  const compositionKey = JSON.stringify([
    String(
      result.data.vehicleinfo?.name ||
        result.data.vehicle ||
        row.vehicleinfo?.name ||
        row.vehicle ||
        "",
    ).replace(/^BE\.NMBS\./, ""),
    date,
    state.lang,
  ]);
  const html = renderStopList(stops, {
    stationId,
    mode,
    serviceDay: date,
    language: state.lang,
    t,
    platformHTML,
    nextIndex: progress?.nextIndex ?? -1,
    reportedIndex: progress?.index ?? -1,
    estimated: progress?.kind === "estimated",
    stationLinks,
  });
  return `${result.stale && compositionId === "composition" ? `<div class="notice">${h(t("stale"))}</div>` : ""}<div class="vehicle-details"><div class="vehicle-route"><p class="dialog-summary"><span>${h(dateLabel)}</span><span>${stops.length} ${h(t("stops"))}</span></p>${renderProgress(stops, progress, { t, language: state.lang, timestamp: result.data.timestamp })}${renderTrainNotices(result.data, row, t)}${stops.length ? `<ol class="stop-list">${html}</ol>` : `<p class="muted">${h(t("noStops"))}</p>`}</div><section class="composition-section" id="${compositionId}" data-key="${h(compositionKey)}"><h3 class="section-title">${h(t("composition"))}</h3><p class="muted" role="status">${h(t("compositionLoad"))}</p>${renderCompositionDisclaimer(t)}</section></div>`;
}

async function loadComposition(id, { date, section, current, signal }) {
  if (!current()) return;
  const heading = `<h3 class="section-title">${h(t("composition"))}</h3>`;
  section.dataset.key = JSON.stringify([
    String(id).replace(/^BE\.NMBS\./, ""),
    date,
    state.lang,
  ]);
  section.dataset.loaded = "false";
  section.innerHTML = `${heading}<p class="muted" role="status">${h(t("compositionLoad"))}</p>${renderCompositionDisclaimer(t)}`;
  try {
    const composition = await request(
      `/api/composition?${new URLSearchParams({ id: String(id).replace(/^BE\.NMBS\./, ""), lang: state.lang, date: apiDate(date) })}`,
      signal,
    );
    if (!current()) return;
    section.innerHTML = `${heading}${composition.stale ? `<p class="muted">${h(t("stale"))}</p>` : ""}${renderComposition(composition.data, t, { trainId: id })}`;
    section.dataset.loaded = "true";
    section.dataset.loadedAt = String(Date.now());
    installArtworkFallbacks(section);
  } catch {
    if (!current() || signal.aborted) return;
    showCompositionFailure(id, { date, section, current, signal });
  }
}

function showCompositionFailure(id, { date, section, current, signal }) {
  section.dataset.loaded = "false";
  section.innerHTML = `<h3 class="section-title">${h(t("composition"))}</h3><p class="muted">${h(t("compositionError"))}</p><button type="button" class="text-button" data-retry-composition>${h(t("retry"))}</button>${renderCompositionDisclaimer(t)}`;
  section
    .querySelector("[data-retry-composition]")
    .addEventListener("click", async () => {
      section.tabIndex = -1;
      section.focus({ preventScroll: true });
      await loadComposition(id, { date, section, current, signal });
    });
}

function setScreen(screen, { focus = true, refresh = true } = {}) {
  state.screen = screen;
  for (const view of ["station", "planner", "train"]) {
    $(`${view}View`).hidden = screen !== view;
    $(`${view}ViewButton`).setAttribute(
      "aria-pressed",
      String(screen === view),
    );
  }
  const target =
    screen === "planner"
      ? "plannerResult"
      : screen === "train"
        ? "trainResult"
        : "board";
  document.querySelector(".skip-link").href = `#${target}`;
  document.querySelector(".skip-link").textContent = t(
    screen === "planner"
      ? "skipPlanner"
      : screen === "train"
        ? "skipTrain"
        : "skip",
  );
  if (screen !== "station") {
    cancelSearch();
    closeOptions();
    if (state.focus) setFocusMode(false, { restoreFocus: false });
    state.boardController?.abort();
    state.boardSequence++;
    state.boardController = null;
    $("board").setAttribute("aria-busy", "false");
  }
  if (screen !== "train") {
    state.trainController?.abort();
    state.trainSequence++;
    state.trainController = null;
    $("trainResult").setAttribute("aria-busy", "false");
  }
  planner?.activate({ refresh });
  if (screen === "planner")
    planner.prefill(state.station || state.view?.station);
  else if (screen === "train") {
    if (
      refresh &&
      state.trainView &&
      !state.trainController &&
      (state.trainView.live ||
        !state.trainData ||
        $("trainComposition")?.dataset.loaded !== "true" ||
        state.trainView.lang !== state.lang)
    )
      loadTrain(
        { ...state.trainView, lang: state.lang },
        { background: !!state.trainData },
      );
  } else {
    if (refresh && state.view && !state.boardController)
      loadBoard(
        { ...state.view, lang: state.lang },
        { background: !!state.data },
      );
  }
  syncURL();
  if (focus)
    $(
      screen === "planner"
        ? "plannerFromInput"
        : screen === "train"
          ? "trainInput"
          : "stationInput",
    ).focus();
}
$("stationViewButton").addEventListener("click", () => setScreen("station"));
$("plannerViewButton").addEventListener("click", () => setScreen("planner"));
$("trainViewButton").addEventListener("click", () => setScreen("train"));

function updateTrainModeControls() {
  $("trainLiveMode").setAttribute("aria-pressed", String(state.trainLive));
  $("trainPlanMode").setAttribute("aria-pressed", String(!state.trainLive));
  $("trainPlannedFields").hidden = state.trainLive;
  $("trainDateInput").disabled = state.trainLive;
}
$("trainPlanMode").addEventListener("click", () => {
  state.trainLive = false;
  const now = belgianParts();
  if (!$("trainDateInput").value) $("trainDateInput").value = now.date;
  updateTrainModeControls();
  $("trainDateInput").focus();
});
$("trainLiveMode").addEventListener("click", () => {
  state.trainLive = true;
  updateTrainModeControls();
  if (normalizeTrainId($("trainInput").value)) submitTrain();
});
$("trainForm").addEventListener("submit", (event) => {
  event.preventDefault();
  submitTrain();
});
$("trainInput").addEventListener("input", () => {
  $("trainInput").removeAttribute("aria-invalid");
  $("trainSearchStatus").textContent = "";
});
function submitTrain() {
  const id = normalizeTrainId($("trainInput").value);
  if (!id) {
    $("trainSearchStatus").textContent = t("invalidTrain");
    $("trainInput").setAttribute("aria-invalid", "true");
    $("trainInput").focus();
    return;
  }
  const date = $("trainDateInput").value;
  if (!state.trainLive && !validDate(date)) return toast(t("invalidTrainDate"));
  $("trainSearchStatus").textContent = "";
  $("trainInput").removeAttribute("aria-invalid");
  return loadTrain({
    id,
    live: state.trainLive,
    date: state.trainLive ? "" : date,
    lang: state.lang,
  });
}
function renderTrainEmpty() {
  $("trainTitle").textContent = t("trainLookup");
  $("trainSubtitle").textContent = "";
  $("trainContent").innerHTML =
    `<div class="empty-state"><svg class="empty-sign" viewBox="0 0 24 24" aria-hidden="true"><use href="/icons.svg?v=0.9.6#train" /></svg><h3>${h(t("trainEmptyTitle"))}</h3><p>${h(t("trainEmptyBody"))}</p></div>`;
}
function renderTrainHeading() {
  const view = state.trainView;
  if (!view) return;
  const data = state.trainData;
  updatePageTitle();
  $("trainTitle").textContent = trainLabel(data, view.id);
  const stops = trainStops(data);
  $("trainSubtitle").textContent = stops.length
    ? `${stops[0].station || stops[0].stationinfo?.name || "—"} → ${stops.at(-1).station || stops.at(-1).stationinfo?.name || "—"}`
    : "";
  $("shareTrain").hidden = false;
  $("refreshTrain").hidden = false;
  $("refreshTrain").disabled = !!state.trainController;
  const notice = !navigator.onLine
    ? "offline"
    : state.trainFailed || state.trainStale
      ? "stale"
      : "";
  $("trainNotice").hidden = !notice || !data;
  $("trainNotice").textContent = notice && data ? t(notice) : "";
}
async function loadTrain(
  view,
  { background = false, refreshComposition = false } = {},
) {
  const same = JSON.stringify(view) === JSON.stringify(state.trainView);
  state.trainController?.abort();
  const controller = new AbortController(),
    sequence = ++state.trainSequence;
  state.trainController = controller;
  state.trainView = { ...view };
  if (!same) state.trainData = null;
  state.trainFailed = false;
  state.trainStale = false;
  renderTrainHeading();
  syncURL();
  // Keep an already displayed route during both refreshes and resubmissions.
  // If the request fails, its stops/composition remain visible with the stale notice.
  if (!state.trainData)
    $("trainContent").innerHTML =
      `<p class="muted" role="status">${h(t("loading"))}</p>`;
  $("trainResult").setAttribute("aria-busy", "true");
  if (!background) $("trainResult").focus({ preventScroll: true });
  const current = () =>
    sequence === state.trainSequence && state.screen === "train";
  let date = view.live ? belgianParts().date : view.date;
  try {
    const fetchVehicle = async (serviceDay) => {
      const result = await request(
        `/api/vehicle?${new URLSearchParams({ id: view.id, date: apiDate(serviceDay), lang: view.lang, alerts: "true" })}`,
        controller.signal,
      );
      if (!matchesServiceDate(result.data, serviceDay))
        throw Object.assign(new Error("Service date mismatch"), {
          status: 404,
        });
      return result;
    };
    let result, missing;
    try {
      result = await fetchVehicle(date);
    } catch (error) {
      if (error.status !== 404) throw error;
      missing = error;
    }
    const now = Date.now() / 1000;
    const first = trainStops(result?.data)[0];
    if (
      current() &&
      view.live &&
      belgianParts().time < "04:00" &&
      (!result || Number(first?.scheduledDepartureTime || first?.time) > now)
    ) {
      const previous = previousServiceDate(date);
      try {
        const overnight = await fetchVehicle(previous);
        if (activeService(trainStops(overnight.data), now)) {
          result = overnight;
          date = previous;
        }
      } catch (error) {
        if (controller.signal.aborted) throw error;
      }
    }
    if (!result) throw missing;
    if (!current()) return;
    state.trainData = result.data;
    state.trainServiceDate = date;
    state.trainStale = result.stale;
    const reused = replaceVehicleContent(
      $("trainContent"),
      renderVehicle(
        result,
        {},
        {
          date,
          live: view.live,
          stationLinks: true,
          compositionId: "trainComposition",
        },
      ),
      background && same && !refreshComposition,
    );
    renderTrainHeading();
    if (!reused)
      await loadComposition(
        result.data.vehicleinfo?.name || result.data.vehicle || view.id,
        {
          date,
          section: $("trainComposition"),
          current,
          signal: controller.signal,
        },
      );
  } catch (error) {
    if (!current() || controller.signal.aborted) return;
    state.trainFailed = true;
    if (state.trainData) {
      replaceVehicleContent(
        $("trainContent"),
        renderVehicle(
          { data: state.trainData, stale: true },
          {},
          {
            date: state.trainServiceDate,
            live: view.live,
            stationLinks: true,
            compositionId: "trainComposition",
          },
        ),
        true,
        true,
      );
      const section = $("trainComposition");
      if (section.dataset.loaded !== "true")
        showCompositionFailure(
          state.trainData.vehicleinfo?.name ||
            state.trainData.vehicle ||
            view.id,
          {
            date: state.trainServiceDate,
            section,
            current,
            signal: controller.signal,
          },
        );
    } else {
      $("trainContent").innerHTML =
        `<p class="notice error">${h(t(error.status === 404 ? "trainNotFound" : "detailError"))}</p><button type="button" class="text-button" id="retryTrain">${h(t("retry"))}</button>`;
      $("retryTrain").addEventListener("click", () => loadTrain(view));
    }
  } finally {
    if (current()) {
      state.trainController = null;
      $("trainResult").setAttribute("aria-busy", "false");
      renderTrainHeading();
    }
  }
}
$("refreshTrain").addEventListener("click", () => {
  if (state.trainView)
    loadTrain(state.trainView, { background: true, refreshComposition: true });
});
$("trainContent").addEventListener("click", (event) => {
  const button = event.target.closest("[data-stop-index]");
  if (!button) return;
  const stop = trainStops(state.trainData)[Number(button.dataset.stopIndex)];
  if (!stop?.stationinfo?.id) return;
  const view = state.trainView;
  setScreen("station", { focus: false, refresh: false });
  state.live = view.live;
  if (!view.live) {
    const stops = trainStops(state.trainData);
    const events = stopEvents(
      stop,
      Number(button.dataset.stopIndex),
      stops.length,
    );
    const planned = (
      events.find((event) => event.kind === "departure") || events[0]
    )?.planned;
    const stopMoment = planned
      ? belgianParts(new Date(planned * 1000))
      : { date: view.date, time: "00:00" };
    $("dateInput").value = stopMoment.date;
    $("timeInput").value = stopMoment.time;
  }
  updateModeControls();
  selectStation({
    id: stop.stationinfo.id,
    name: stop.station || stop.stationinfo.name,
  });
});

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
  $("dialogContent").innerHTML = renderNetwork(list, t, state.networkStale);
});
$("shareBoard").addEventListener("click", async () => {
  syncURL();
  const view = state.view;
  await shareURL(
    `${state.data?.station || view.station.name} · ${t(view.mode === "arrival" ? "arrivals" : "departures")} | Stationsbord`,
  );
});
$("shareTrain").addEventListener("click", async () => {
  syncURL();
  await shareURL(`${$("trainTitle").textContent} | Stationsbord`);
});
async function shareURL(title) {
  const url = location.href;
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        url,
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      // If native sharing is unavailable, keep the copy-link fallback.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t("copied"));
  } catch {
    openDetails(t("share"), t("schedule"));
    $("dialogContent").innerHTML =
      `<p class="muted">${h(t("shareFallback"))}</p><input class="share-input" id="shareURL" aria-label="URL" readonly value="${h(url)}">`;
    $("shareURL").focus();
    $("shareURL").select();
  }
}
function refreshVisible() {
  if (document.hidden) return;
  updateClock();
  if (state.dialogTrain?.view.live && navigator.onLine)
    loadDialogTrain(state.dialogTrain, { background: true });
  if (
    state.screen === "station" &&
    state.view?.live &&
    !state.boardController &&
    navigator.onLine
  )
    loadBoard(state.view, { background: true });
  if (
    state.screen === "train" &&
    state.trainView?.live &&
    !state.trainController &&
    navigator.onLine
  )
    loadTrain(state.trainView, { background: true });
  if (navigator.onLine) planner.refresh();
  if (!state.networkController && navigator.onLine) refreshNetwork();
}
window.addEventListener("offline", () => {
  state.networkStale = true;
  if (state.trainData && state.trainView)
    replaceVehicleContent(
      $("trainContent"),
      renderVehicle(
        { data: state.trainData, stale: true },
        {},
        {
          date: state.trainServiceDate,
          live: state.trainView.live,
          stationLinks: true,
          compositionId: "trainComposition",
        },
      ),
      true,
      true,
    );
  const detail = state.dialogTrain;
  if (detail?.result && dialogCurrent(detail.sequence))
    replaceVehicleContent(
      $("dialogContent"),
      renderVehicle({ ...detail.result, stale: true }, detail.row, {
        date: detail.date,
        stationId: detail.view.station.id,
        mode: detail.view.mode,
        live: detail.view.live,
        compositionId: "composition",
      }),
      true,
      true,
    );
  renderNotice();
  renderNetworkButton();
  renderTrainHeading();
  planner.heading();
});
window.addEventListener("online", () => {
  if (state.dialogTrain?.view.live && !document.hidden)
    loadDialogTrain(state.dialogTrain, { background: true });
  if (state.screen === "station" && state.view && !document.hidden)
    loadBoard(state.view, { background: true });
  if (state.screen === "train" && state.trainView && !document.hidden)
    loadTrain(state.trainView, { background: true });
  if (!document.hidden) planner.refresh({ force: true });
  refreshNetwork();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshVisible();
});
setInterval(refreshVisible, 60_000);

// A shared link restores the displayed station, language, arrivals/departures and planned moment.
planner = createPlanner({
  request,
  t,
  getLang: () => state.lang,
  isActive: () => state.screen === "planner",
  readStations,
  remember,
  onViewChange: syncURL,
  openTrain,
  shareURL,
});
const initialStation = params.get("station");
const date = params.get("date"),
  time = params.get("time");
if (
  validDate(date || "") &&
  validTime(time || "") &&
  state.screen === "station"
) {
  state.live = false;
  $("dateInput").value = date;
  $("timeInput").value = time;
}
applyLanguage();
setScreen(state.screen, { focus: false });
const initialTrain = normalizeTrainId(params.get("train"));
if (state.screen === "planner") {
  planner.restore(params);
} else if (state.screen === "train") {
  if (validDate(date || "")) {
    state.trainLive = false;
    $("trainDateInput").value = date;
    updateTrainModeControls();
  }
  if (initialTrain) {
    $("trainInput").value = initialTrain;
    submitTrain();
  }
} else if (initialStation && initialStation.length <= 150) {
  state.station = /^BE\.NMBS\.[A-Za-z0-9]+$/.test(initialStation)
    ? { id: initialStation, name: params.get("name") || initialStation }
    : { name: initialStation };
  $("stationInput").value = state.station.name;
  $("clearStation").hidden = false;
  submitBoard();
}
refreshNetwork();
