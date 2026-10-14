import {
  flag,
  belgianParts,
  escapeHtml as h,
  fmtTime,
} from "./rail-utils.js?v=0.9.5";
import { stopEvents } from "./train-details.js?v=0.9.5";

export function nextStopIndex(stops, { now = Date.now() / 1000 } = {}) {
  return stops.findIndex((stop, index) => {
    const events = stopEvents(stop, index, stops.length);
    const event =
      events.find((event) => event.kind === "departure" && !event.canceled) ||
      events.find((event) => !event.canceled);
    return event && !event.passed && (event.expected ?? event.planned) >= now;
  });
}

export function activeService(stops, now = Date.now() / 1000) {
  const last = stops.at(-1);
  if (last && (flag(last.left) || flag(last.arrived))) return false;
  const events = stops
    .flatMap((stop, index) => stopEvents(stop, index, stops.length))
    .filter((event) => !event.canceled && event.planned);
  return (
    events.length > 0 &&
    (events[0].expected ?? events[0].planned) <= now &&
    (events.at(-1).expected ?? events.at(-1).planned) >= now
  );
}

export function trainProgress(
  stops,
  { live = false, stale = false, timestamp, now = Date.now() / 1000 } = {},
) {
  const unknown = { kind: "unknown", index: -1, nextIndex: -1 };
  if (!live || !stops.length) return null;
  // A response timestamp is not a GPS fix. Only recent reported stop flags may
  // be presented as live; clock-based progress is explicitly an estimate.
  if (
    stale ||
    !Number.isFinite(Number(timestamp)) ||
    now - Number(timestamp) > 180 ||
    Number(timestamp) - now > 60
  )
    return unknown;
  const served = stops
    .map((stop, index) => ({
      stop,
      index,
      events: stopEvents(stop, index, stops.length),
    }))
    .filter(({ events }) => events.some((event) => !event.canceled));
  const reported = served
    .filter(({ stop }) => flag(stop.left) || flag(stop.arrived))
    .at(-1);
  if (reported) {
    const { stop, index } = reported;
    const following = served.find((item) => item.index > index);
    if (!following) return { kind: "ended", index, nextIndex: -1 };
    return {
      kind: flag(stop.left) ? "after" : "at",
      index,
      nextIndex: following.index,
    };
  }
  const nextIndex = nextStopIndex(stops, { now });
  return nextIndex === -1
    ? unknown
    : { kind: "estimated", index: -1, nextIndex };
}

export function renderProgress(stops, progress, { t, language, timestamp }) {
  if (!progress) return "";
  const name = (index) =>
    h(stops[index]?.station || stops[index]?.stationinfo?.name || "—");
  let text;
  if (progress.kind === "unknown") text = h(t("progressUnknown"));
  else if (progress.kind === "estimated")
    text = `${h(t("expectedStop"))}: <strong>${name(progress.nextIndex)}</strong>`;
  else
    text = `${h(t({ at: "progressAt", after: "progressAfter", ended: "progressEnded" }[progress.kind]))} <strong>${name(progress.index)}</strong>${progress.nextIndex >= 0 ? `<span>${h(t("nextStop"))}: ${name(progress.nextIndex)}</span>` : ""}`;
  const reported = ["at", "after", "ended"].includes(progress.kind);
  return `<section class="train-progress" aria-label="${h(t("trainProgress"))}"><p class="eyebrow">${h(t(reported ? "reportedProgress" : progress.kind === "estimated" ? "estimatedProgress" : "trainProgress"))}${reported ? ` · ${h(t("updated"))} ${h(fmtTime(timestamp, language))}` : ""}</p><p>${text}</p></section>`;
}

export function currentServiceDay(stops, date, now = Date.now() / 1000) {
  return (
    date === belgianParts(new Date(now * 1000)).date ||
    activeService(stops, now)
  );
}
