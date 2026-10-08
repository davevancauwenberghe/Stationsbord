export const ZONE = "Europe/Brussels";
export const asArray = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const flag = (value) => String(value) === "1" || value === true;
export function belgianParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
export function validDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function apiDate(iso) {
  return validDate(iso)
    ? iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(2, 4)
    : "";
}
export function fmtTime(seconds, language = "nl") {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return "—";
  return new Intl.DateTimeFormat(language, {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(Number(seconds) * 1000));
}
export function fmtDate(iso, language = "nl") {
  if (!validDate(iso)) return "";
  return new Intl.DateTimeFormat(language, {
    timeZone: ZONE,
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T12:00:00Z`));
}
export function safeLink(value) {
  let raw = String(value || "").trim();
  if (/^https?%3a/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return "";
    }
  }
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function departures(data, mode) {
  return asArray(
    mode === "arrival" ? data?.arrivals?.arrival : data?.departures?.departure,
  )
    .filter((row) => row && typeof row === "object")
    .sort((a, b) => Number(a.time) - Number(b.time));
}

// Keep the original index so a filtered result still opens the correct train.
export function filterBoardRows(rows, query, mode) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  const needle = normalize(query);
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const destination =
        (mode === "departure" ? row.direction?.name : "") ||
        row.station ||
        row.stationinfo?.name ||
        "";
      const train =
        row.vehicleinfo?.shortname ||
        row.vehicleinfo?.name ||
        row.vehicle ||
        "";
      return !needle || normalize(`${destination} ${train}`).includes(needle);
    });
}
export function disturbances(data) {
  const root = data?.disturbances ?? data?.disturbance ?? [];
  return asArray(root?.disturbance ?? root).filter(
    (d) => d && typeof d === "object" && (d.title || d.description),
  );
}
export function isPlanned(item) {
  return (
    String(item?.type || "")
      .trim()
      .toLowerCase() === "planned"
  );
}
// The connection URI carries the service date, which can differ from the calendar date after midnight.
export function serviceDate(row, fallback) {
  const match = String(
    row.departureConnection || row.arrivalConnection || "",
  ).match(/\/(20\d{6})\//);
  if (match) {
    const value = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
    if (validDate(value)) return value;
  }
  return fallback;
}
export function delayMinutes(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value)))
    return null;
  const seconds = Number(value);
  return seconds === 0
    ? 0
    : Math.sign(seconds) * Math.ceil(Math.abs(seconds) / 60);
}
export function occupancy(row) {
  const value = String(row.occupancy?.name || row.occupancy?.["@id"] || "")
    .split("/")
    .pop();
  return ["low", "medium", "high"].includes(value) ? value : "";
}
