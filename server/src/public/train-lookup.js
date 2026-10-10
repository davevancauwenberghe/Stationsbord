import {
  asArray,
  belgianParts,
  serviceDate,
  validDate,
  validTime,
} from "./rail-utils.js?v=0.9.3";
import { stopEvents } from "./train-details.js?v=0.9.3";

// Keep a supplied service prefix (including S-line numbers); plain train numbers
// are supported directly by iRail. Never guess a category or probe multiple IDs.
export function normalizeTrainId(value) {
  if (typeof value !== "string" || value.length > 40) return "";
  const id = value
    .trim()
    .toUpperCase()
    .replace(/^BE\.NMBS\./, "")
    .replace(/\s+/g, "");
  return /^(?:[A-Z]{1,8})?\d{1,8}$/.test(id) ? id : "";
}

export function trainStops(data) {
  return asArray(data?.stops?.stop).filter(
    (stop) => stop && typeof stop === "object",
  );
}

export function matchesServiceDate(data, date) {
  // Some upstream versions ignored the requested date. Do not label a different
  // day's route as the user's selected service. Missing provenance is allowed.
  const firstDatedStop = trainStops(data).find((stop) => serviceDate(stop, ""));
  return !firstDatedStop || serviceDate(firstDatedStop, "") === date;
}

export function nextStopIndex(
  stops,
  { date, time, live = false, now = Date.now() / 1000 },
) {
  if (!validDate(date) || !validTime(time)) return -1;
  const moment = `${date}T${time}`;
  return stops.findIndex((stop, index) => {
    const events = stopEvents(stop, index, stops.length);
    const event =
      events.find((event) => event.kind === "departure" && !event.canceled) ||
      events.find((event) => !event.canceled);
    if (!event || event.canceled || (live && event.passed)) return false;
    const seconds = event.expected ?? event.planned;
    if (!seconds) return false;
    if (live) return seconds >= now;
    const parts = belgianParts(new Date(seconds * 1000));
    return `${parts.date}T${parts.time}` >= moment;
  });
}
