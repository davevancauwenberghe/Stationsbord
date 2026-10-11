import {
  asArray,
  serviceDate,
  belgianParts,
  validDate,
} from "./rail-utils.js?v=0.9.4-r2";
import { stopEvents } from "./train-details.js?v=0.9.4-r2";
export { nextStopIndex } from "./train-progress.js?v=0.9.4-r2";

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
  const first = trainStops(data)[0];
  const moment = Number(first?.scheduledDepartureTime || first?.time);
  const originDate =
    serviceDate(first || {}, "") ||
    (Number.isFinite(moment) && moment > 0
      ? belgianParts(new Date(moment * 1000)).date
      : "");
  return !originDate || originDate === date;
}

export function previousServiceDate(date) {
  return validDate(date)
    ? new Date(Date.parse(`${date}T12:00:00Z`) - 86400000)
        .toISOString()
        .slice(0, 10)
    : "";
}

// Connection dates belong to a stop. Match its scheduled instant to distinguish
// a journey continuing after midnight from the same number the following night.
export function matchesBoardStop(data, row, { stationId, mode = "departure" }) {
  const planned = Number(row.time);
  if (!stationId || !Number.isFinite(planned) || planned <= 0) return true;
  const stops = trainStops(data);
  const index = stops.findIndex((stop) => stop.stationinfo?.id === stationId);
  if (index < 0) return false;
  const event = stopEvents(stops[index], index, stops.length, mode).find(
    (event) => event.kind === mode,
  );
  return !!event?.planned && Math.abs(event.planned - planned) < 60;
}

export function journeyEndDate(stops, fallback) {
  const last = stops.at(-1);
  if (!last) return fallback;
  const moments = stopEvents(last, stops.length - 1, stops.length)
    .map((event) => event.planned)
    .filter(Boolean);
  return moments.length
    ? belgianParts(new Date(Math.max(...moments) * 1000)).date
    : fallback;
}

export function trainLabel(data, fallback = "") {
  const info = data?.vehicleinfo;
  const label =
    info?.shortname ||
    (info?.type && info?.number
      ? `${info.type} ${info.number}`
      : info?.name || data?.vehicle);
  return typeof label === "string"
    ? label.replace(/^BE\.NMBS\./, "")
    : fallback;
}
