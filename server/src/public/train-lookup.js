import { asArray, serviceDate } from "./rail-utils.js?v=0.9.4-r1";
export { nextStopIndex } from "./train-progress.js?v=0.9.4-r1";

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
