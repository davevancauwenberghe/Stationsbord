import {
  asArray,
  escapeHtml as h,
  belgianParts,
  validDate,
  validTime,
  apiDate,
  fmtDate,
  fmtTime,
} from "./rail-utils.js?v=0.9.6";
import {
  journeys,
  journeyCursor,
  renderJourneys,
} from "./journey-planner.js?v=0.9.6";
import { stationAutocomplete } from "./station-autocomplete.js?v=0.9.6";

const $ = (id) => document.getElementById(id);
const key = (view) =>
  JSON.stringify([
    view.from.id,
    view.to.id,
    view.lang,
    view.live,
    view.timesel,
    view.live ? "" : view.date,
    view.live ? "" : view.time,
  ]);

export function createPlanner({
  request,
  t,
  getLang,
  isActive,
  readStations,
  remember,
  onViewChange,
  openTrain,
  shareURL,
}) {
  const state = {
    from: null,
    to: null,
    live: true,
    timesel: "departure",
    view: null,
    result: null,
    list: [],
    failed: false,
    stale: false,
    controller: null,
    sequence: 0,
  };
  const shortcuts = () => {
    const seen = new Set();
    return [
      ...readStations("savedStations"),
      ...readStations("recentStations"),
    ].filter((station) => {
      if (seen.has(station.id)) return false;
      seen.add(station.id);
      return true;
    });
  };
  const fields = Object.fromEntries(
    ["from", "to"].map((kind) => {
      const prefix = kind === "from" ? "plannerFrom" : "plannerTo";
      return [
        kind,
        stationAutocomplete({
          input: $(`${prefix}Input`),
          list: $(`${prefix}Options`),
          clear: $(`${prefix}Clear`),
          status: $(`${prefix}Status`),
          request,
          t,
          getLang,
          shortcuts,
          onSelect(station) {
            state[kind] = { ...station };
            $("plannerSearchStatus").textContent = "";
            if (kind === "from" && !state.to) $("plannerToInput").focus();
          },
          onEdit() {
            state[kind] = null;
            $("plannerSearchStatus").textContent = "";
          },
        }),
      ];
    }),
  );
  function dismiss() {
    fields.from.dismiss();
    fields.to.dismiss();
  }
  function modes() {
    $("plannerLiveMode").setAttribute("aria-pressed", String(state.live));
    $("plannerPlanMode").setAttribute("aria-pressed", String(!state.live));
    $("plannerDepartMode").setAttribute(
      "aria-pressed",
      String(state.timesel === "departure"),
    );
    $("plannerArriveMode").setAttribute(
      "aria-pressed",
      String(state.timesel === "arrival"),
    );
    $("plannerPlannedFields").hidden = state.live;
    $("plannerDateInput").disabled = state.live;
    $("plannerTimeInput").disabled = state.live;
  }
  function customTime() {
    const now = belgianParts();
    state.live = false;
    if (!$("plannerDateInput").value) $("plannerDateInput").value = now.date;
    if (!$("plannerTimeInput").value) $("plannerTimeInput").value = now.time;
    modes();
  }
  function empty(title = "plannerEmptyTitle", body = "plannerEmptyBody") {
    $("plannerContent").innerHTML =
      `<div class="empty-state"><svg class="empty-sign planner-route-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h9a4 4 0 0 1 0 8H9M9 11l-4 4 4 4"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="17" r="2"/></svg><h3>${h(t(title))}</h3><p>${h(t(body))}</p></div>`;
  }
  function heading() {
    const view = state.view;
    $("plannerTitle").textContent = view
      ? `${view.from.name} → ${view.to.name}`
      : t("planner");
    $("plannerSubtitle").textContent = view
      ? `${view.live ? `${t("live")} · ` : ""}${fmtDate(view.date, getLang())} · ${t(view.timesel === "arrival" ? "arriveBy" : "departAt")} ${view.time}`
      : "";
    $("sharePlanner").hidden = !view;
    $("refreshPlanner").hidden = !view;
    $("refreshPlanner").disabled = !!state.controller;
    $("plannerPagination").hidden = !state.list.length;
    $("plannerEarlier").disabled =
      !!state.controller || !journeyCursor(state.list, "earlier");
    $("plannerLater").disabled =
      !!state.controller || !journeyCursor(state.list, "later");
    const freshness = !navigator.onLine
      ? "offline"
      : state.failed || state.stale
        ? "stale"
        : "";
    $("plannerFreshness").textContent = state.result?.timestamp
      ? `${t("updated")} ${fmtTime(state.result.timestamp, getLang())}${view?.live && !freshness ? " · 60 s" : ""}`
      : "";
    $("plannerFreshness").className = `freshness${freshness ? " stale" : ""}`;
    const notice = $("plannerNotice");
    notice.replaceChildren();
    notice.className = `notice${state.failed && !state.result ? " error" : ""}`;
    notice.hidden = !view || !(freshness || state.failed);
    if (!notice.hidden) {
      notice.append(
        document.createTextNode(
          t(
            state.result
              ? freshness || "stale"
              : state.failed
                ? "plannerError"
                : "offline",
          ),
        ),
      );
      if (state.failed && navigator.onLine) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = t("retry");
        retry.disabled = !!state.controller;
        retry.addEventListener("click", () =>
          load(state.view, { background: !!state.result }),
        );
        notice.append(retry);
      }
    }
  }
  function render() {
    const open = new Set(
      [...$("plannerContent").querySelectorAll(".journey[open]")].map(
        (item) => item.dataset.journeyKey,
      ),
    );
    const openStops = new Set(
      [...$("plannerContent").querySelectorAll(".journey-stops[open]")].map(
        (item) => item.dataset.legKey,
      ),
    );
    const active = document.activeElement;
    const hadFocus = $("plannerContent").contains(active);
    const focusedJourney = active?.matches(".journey > summary")
      ? active.parentElement.dataset.journeyKey
      : null;
    const focusedTrain = active?.dataset.trainKey;
    const focusedStops = active?.matches(".journey-stops > summary")
      ? active.parentElement.dataset.legKey
      : null;
    if (state.list.length)
      $("plannerContent").innerHTML = renderJourneys(state.list, t, {
        lang: getLang(),
        date: state.view.date,
        open,
        openStops,
      });
    else empty("noJourneys", "noJourneysBody");
    if (focusedJourney)
      [...$("plannerContent").querySelectorAll(".journey")]
        .find((item) => item.dataset.journeyKey === focusedJourney)
        ?.querySelector("summary")
        .focus({ preventScroll: true });
    if (focusedTrain)
      [...$("plannerContent").querySelectorAll("[data-train-key]")]
        .find((item) => item.dataset.trainKey === focusedTrain)
        ?.focus({ preventScroll: true });
    if (focusedStops)
      [...$("plannerContent").querySelectorAll(".journey-stops")]
        .find((item) => item.dataset.legKey === focusedStops)
        ?.querySelector("summary")
        .focus({ preventScroll: true });
    if (hadFocus && document.activeElement === document.body)
      $("plannerResult").focus({ preventScroll: true });
    heading();
  }
  async function load(view, { background = false } = {}) {
    const same = state.view && key(view) === key(state.view);
    state.controller?.abort();
    const controller = new AbortController(),
      sequence = ++state.sequence;
    state.controller = controller;
    state.view = {
      ...view,
      from: { ...view.from },
      to: { ...view.to },
      ...(view.live ? belgianParts() : {}),
    };
    if (!same) {
      state.result = null;
      state.list = [];
      state.failed = false;
      state.stale = false;
    }
    dismiss();
    heading();
    onViewChange();
    $("plannerResult").setAttribute("aria-busy", "true");
    if (!state.result)
      $("plannerContent").innerHTML =
        `<p class="planner-loading muted" role="status">${h(t("planning"))}</p>`;
    if (!background) {
      $("plannerResult").focus({ preventScroll: true });
      if (matchMedia("(max-width: 760px)").matches)
        $("plannerResult").scrollIntoView({ block: "start", behavior: "auto" });
    }
    const queryView = state.view;
    const current = () => sequence === state.sequence && isActive();
    try {
      let result;
      try {
        result = await request(
          `/api/connections?${new URLSearchParams({ from: queryView.from.id, to: queryView.to.id, date: apiDate(queryView.date), time: queryView.time.replace(":", ""), timesel: queryView.timesel, lang: queryView.lang })}`,
          controller.signal,
        );
      } catch (error) {
        if (error.status !== 404) throw error;
        result = { data: { connection: [] }, stale: false };
      }
      if (!current()) return;
      const list = journeys(result.data, queryView.timesel);
      if (
        !result.data ||
        (!Object.hasOwn(result.data, "connection") &&
          Number(result.data.number) !== 0) ||
        (asArray(result.data.connection).length && !list.length)
      )
        throw new Error("Invalid journey response");
      state.result = result.data;
      state.list = list;
      state.failed = false;
      state.stale = result.stale;
      for (const kind of ["from", "to"]) {
        const station = list[0]?.[kind].station;
        if (station?.id) {
          state.view[kind] = { ...station };
          remember(station);
          if (state[kind]?.id === queryView[kind].id) {
            state[kind] = { ...station };
            fields[kind].set(station);
          }
        }
      }
      render();
      onViewChange();
    } catch (error) {
      if (!current() || controller.signal.aborted) return;
      state.failed = true;
      // A failed refresh/resubmission keeps its complete route, including any
      // open trip. New station pairs never inherit the previous pair's data.
      if (state.result) heading();
      else empty("plannerError", "plannerRetryBody");
    } finally {
      if (current()) {
        state.controller = null;
        $("plannerResult").setAttribute("aria-busy", "false");
        heading();
      }
    }
  }
  function submit() {
    for (const kind of ["from", "to"]) {
      if (!state[kind]?.id) {
        const input = $(
          kind === "from" ? "plannerFromInput" : "plannerToInput",
        );
        $("plannerSearchStatus").textContent = t("choosePlannerStations");
        input.setAttribute("aria-invalid", "true");
        input.focus();
        fields[kind].search();
        return;
      }
    }
    if (state.from.id === state.to.id) {
      $("plannerSearchStatus").textContent = t("differentStations");
      $("plannerToInput").setAttribute("aria-invalid", "true");
      $("plannerToInput").focus();
      return;
    }
    const moment = state.live
      ? belgianParts()
      : {
          date: $("plannerDateInput").value,
          time: $("plannerTimeInput").value,
        };
    if (!validDate(moment.date) || !validTime(moment.time)) {
      $("plannerSearchStatus").textContent = t("invalidDate");
      return;
    }
    $("plannerSearchStatus").textContent = "";
    return load({
      from: state.from,
      to: state.to,
      live: state.live,
      timesel: state.timesel,
      lang: getLang(),
      ...moment,
    });
  }
  $("plannerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  $("plannerSwap").addEventListener("click", () => {
    const fromText = $("plannerFromInput").value,
      toText = $("plannerToInput").value;
    [state.from, state.to] = [state.to, state.from];
    fields.from.set(state.from);
    fields.to.set(state.to);
    $("plannerFromInput").value = toText;
    $("plannerFromClear").hidden = !toText;
    $("plannerToInput").value = fromText;
    $("plannerToClear").hidden = !fromText;
    $("plannerSearchStatus").textContent = "";
    if (state.view && state.from && state.to) submit();
    else $(state.from ? "plannerToInput" : "plannerFromInput").focus();
  });
  $("plannerLiveMode").addEventListener("click", () => {
    state.live = true;
    state.timesel = "departure";
    modes();
  });
  $("plannerPlanMode").addEventListener("click", () => {
    customTime();
    $("plannerDateInput").focus();
  });
  $("plannerDepartMode").addEventListener("click", () => {
    state.timesel = "departure";
    modes();
  });
  $("plannerArriveMode").addEventListener("click", () => {
    state.timesel = "arrival";
    customTime();
  });
  $("refreshPlanner").addEventListener("click", () => {
    if (state.view) load(state.view, { background: true });
  });
  $("sharePlanner").addEventListener("click", () => {
    onViewChange();
    shareURL(`${$("plannerTitle").textContent} | Stationsbord`);
  });
  for (const direction of ["earlier", "later"]) {
    $(
      direction === "earlier" ? "plannerEarlier" : "plannerLater",
    ).addEventListener("click", () => {
      const cursor = journeyCursor(state.list, direction);
      if (!cursor) return;
      state.live = false;
      state.timesel = cursor.timesel;
      $("plannerDateInput").value = cursor.date;
      $("plannerTimeInput").value = cursor.time;
      state.from = { ...state.view.from };
      state.to = { ...state.view.to };
      fields.from.set(state.from);
      fields.to.set(state.to);
      modes();
      load({ ...state.view, ...cursor });
    });
  }
  $("plannerContent").addEventListener("click", (event) => {
    const button = event.target.closest("[data-planner-leg]");
    if (!button) return;
    const [journeyIndex, legIndex] = button.dataset.plannerLeg
      .split(":")
      .map(Number);
    const leg = state.list[journeyIndex]?.legs[legIndex];
    if (!leg || leg.walking || !leg.vehicle || !leg.from.station.id) return;
    openTrain(leg.row, {
      station: leg.from.station,
      date: belgianParts(new Date(leg.from.planned * 1000)).date,
      mode: "departure",
      lang: getLang(),
      live: state.view.live,
    });
  });
  function language() {
    dismiss();
    if (state.view && state.view.lang !== getLang()) {
      state.controller?.abort();
      state.sequence++;
      state.controller = null;
      $("plannerResult").setAttribute("aria-busy", "false");
    }
    modes();
    for (const kind of ["From", "To"]) {
      $(`planner${kind}Input`).placeholder = t("searchPlaceholder");
      $(`planner${kind}Clear`).setAttribute("aria-label", t("clear"));
    }
    $("plannerSwap").setAttribute("aria-label", t("swapStations"));
    $("plannerSwap").title = t("swapStations");
    $("sharePlanner").setAttribute("aria-label", t("shareJourney"));
    $("sharePlanner").title = t("shareJourney");
    $("refreshPlanner").setAttribute("aria-label", t("refresh"));
    $("refreshPlanner").title = t("refresh");
    $("plannerWhenTabs").setAttribute("aria-label", t("when"));
    $("plannerTimeTabs").setAttribute("aria-label", t("plannerTiming"));
    $("plannerPagination").setAttribute("aria-label", t("otherJourneys"));
    if (state.result) render();
    else if (!state.view) {
      empty();
      heading();
    }
  }
  return {
    get view() {
      return state.view;
    },
    get title() {
      return state.view
        ? `${state.view.from.name} → ${state.view.to.name}`
        : t("planner");
    },
    language,
    heading,
    prefill(station) {
      if (!state.from && !$("plannerFromInput").value && station?.id) {
        state.from = { ...station };
        fields.from.set(station);
      }
    },
    activate({ refresh = true } = {}) {
      dismiss();
      if (!isActive()) {
        state.controller?.abort();
        state.sequence++;
        state.controller = null;
        $("plannerResult").setAttribute("aria-busy", "false");
      } else if (
        refresh &&
        state.view &&
        !state.controller &&
        (state.view.live || !state.result || state.view.lang !== getLang())
      )
        load(
          { ...state.view, lang: getLang() },
          { background: !!state.result },
        );
    },
    refresh({ force = false } = {}) {
      if (
        isActive() &&
        state.view &&
        !state.controller &&
        (force || state.view.live)
      )
        return load({ ...state.view, lang: getLang() }, { background: true });
    },
    restore(params) {
      for (const kind of ["from", "to"]) {
        const id = params.get(kind),
          name = params.get(`${kind}Name`);
        if (
          params.getAll(kind).length === 1 &&
          /^(?:BE\.NMBS\.)?\d{9}$/.test(id || "")
        ) {
          state[kind] = {
            id: id.startsWith("BE.") ? id : `BE.NMBS.${id}`,
            name: name?.length <= 150 ? name : id,
          };
          fields[kind].set(state[kind]);
        }
      }
      const date = params.get("date"),
        time = params.get("time");
      if (validDate(date || "") && validTime(time || "")) {
        state.live = false;
        state.timesel =
          params.get("timesel") === "arrival" ? "arrival" : "departure";
        $("plannerDateInput").value = date;
        $("plannerTimeInput").value = time;
      }
      modes();
      if (state.from && state.to) submit();
    },
  };
}
