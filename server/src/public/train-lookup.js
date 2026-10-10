import { asArray, serviceDate } from "./rail-utils.js?v=0.9.3";
import { stopEvents } from "./train-details.js?v=0.9.3";

// iRail resolves the service type from its number. Keep that distinction in the
// API response for composition artwork, without requiring it in the search.
export function normalizeTrainId(value) {
  if (typeof value !== "string" || value.length > 40) return "";
  const id = value.trim();
  return /^\d{1,8}$/.test(id) ? id : "";
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

export function nextStopIndex(stops, { now = Date.now() / 1000 } = {}) {
  return stops.findIndex((stop, index) => {
    const events = stopEvents(stop, index, stops.length);
    const event =
      events.find((event) => event.kind === "departure" && !event.canceled) ||
      events.find((event) => !event.canceled);
    if (!event || event.passed) return false;
    const seconds = event.expected ?? event.planned;
    if (!seconds) return false;
    return seconds >= now;
  });
}
