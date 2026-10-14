import {
  asArray,
  escapeHtml as h,
  flag,
  belgianParts,
  validDate,
  fmtTime,
  fmtDate,
  delayMinutes,
} from "./rail-utils.js?v=0.9.6";
import { renderCrowding, renderTrainNotices } from "./train-details.js?v=0.9.6";
import { trainLabel } from "./train-lookup.js?v=0.9.6";

const number = (value) =>
  ["string", "number"].includes(typeof value) &&
  String(value).trim() &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const timestamp = (value) =>
  number(value) > 0 && Number.isFinite(new Date(Number(value) * 1000).getTime())
    ? Number(value)
    : null;
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function plannerStation(value = {}, fallback = {}) {
  const info = object(
    value.stationinfo ||
      (typeof value.station === "object" ? value.station : null) ||
      fallback.stationinfo ||
      fallback.station,
  );
  return {
    id: String(info.id || ""),
    name: String(
      typeof value.station === "string"
        ? value.station
        : info.name ||
            (typeof fallback.station === "string" ? fallback.station : "—"),
    ),
  };
}
function event(value, fallback) {
  const raw = object(value);
  const planned = timestamp(raw.time);
  const delay = number(raw.delay);
  const platform = object(raw.platforminfo || raw.platform);
  return {
    raw,
    station: plannerStation(raw, fallback),
    planned,
    delay,
    expected: planned ? timestamp(planned + (delay || 0)) : null,
    cancelled: flag(raw.canceled),
    platform: String(
      platform.name ||
        (typeof raw.platform !== "object" ? raw.platform || "" : ""),
    ),
    platformChanged: platform.normal != null && !flag(platform.normal),
  };
}
function vehicleInfo(raw) {
  return object(raw.vehicleinfo || raw.vehicle);
}
function vehicleName(raw) {
  return String(
    vehicleInfo(raw).name ||
      (typeof raw.vehicle === "string" ? raw.vehicle : ""),
  );
}

export function journeys(data, timesel = "departure") {
  const seen = new Set();
  return asArray(data?.connection)
    .filter((connection) => connection && typeof connection === "object")
    .map((connection) => {
      const vias = asArray(connection.vias?.via ?? connection.via).filter(
        (via) => via && typeof via === "object",
      );
      const departures = [
        connection.departure,
        ...vias.map((via) => via.departure),
      ];
      const arrivals = [...vias.map((via) => via.arrival), connection.arrival];
      const legs = departures.map((departure, i) => {
        const from = event(departure, i ? vias[i - 1] : {});
        const to = event(arrivals[i], vias[i] || {});
        const vehicle = vehicleName(from.raw) || vehicleName(to.raw);
        const walking =
          flag(from.raw.walking) ||
          flag(to.raw.walking) ||
          /(?:^|\.)WALK$/i.test(vehicle);
        const row = {
          ...from.raw,
          vehicle,
          vehicleinfo: vehicleInfo(from.raw),
        };
        return {
          from,
          to,
          vehicle,
          label: trainLabel(row, vehicle.replace(/^BE\.NMBS\./, "")),
          walking,
          row,
          stops: asArray(from.raw.stops?.stop ?? from.raw.stop).filter(
            (stop) => stop && typeof stop === "object",
          ),
        };
      });
      if (
        !legs.length ||
        legs.some(
          (leg) =>
            !leg.from.planned ||
            !leg.to.planned ||
            leg.to.planned < leg.from.planned,
        )
      )
        return null;
      // Walking takes time even when the preceding train is late. Do not call a
      // connection catchable merely because the walk's scheduled end is on time.
      let ready = legs[0].from.expected;
      for (const leg of legs) {
        ready = leg.walking
          ? Math.max(ready, leg.from.expected) +
            (leg.to.planned - leg.from.planned)
          : leg.to.expected;
        leg.ready = ready;
      }
      const transfers = legs.slice(0, -1).map((leg, i) => ({
        after: i,
        wait: legs[i + 1].from.expected - leg.ready,
        missed:
          !leg.walking && legs[i + 1].walking
            ? false
            : legs[i + 1].from.expected < leg.ready,
      }));
      const cancelled = legs.some(
        (leg) => leg.from.cancelled || leg.to.cancelled,
      );
      const missed =
        !cancelled && transfers.some((transfer) => transfer.missed);
      const tight =
        !cancelled &&
        !missed &&
        transfers.some(
          (transfer) =>
            !legs[transfer.after + 1].walking && transfer.wait < 300,
        );
      const key = JSON.stringify(
        legs.map((leg) => [
          leg.vehicle,
          leg.from.station.id || leg.from.station.name,
          leg.from.planned,
          leg.to.station.id || leg.to.station.name,
          leg.to.planned,
        ]),
      );
      const alerts = [connection, ...legs.map((leg) => leg.from.raw)].flatMap(
        (source) =>
          asArray(source.alerts?.alert ?? source.alerts ?? source.alert),
      );
      return {
        key,
        legs,
        transfers,
        cancelled,
        missed,
        tight,
        notices: { alerts },
        from: legs[0].from,
        to: legs.at(-1).to,
        changes: Math.max(0, legs.filter((leg) => !leg.walking).length - 1),
      };
    })
    .filter((journey) => {
      if (!journey || seen.has(journey.key)) return false;
      seen.add(journey.key);
      return true;
    })
    .sort((a, b) =>
      timesel === "arrival"
        ? b.to.planned - a.to.planned || b.from.planned - a.from.planned
        : a.from.planned - b.from.planned || a.to.planned - b.to.planned,
    )
    .slice(0, 12);
}

export function journeyCursor(list, direction) {
  if (!list.length) return null;
  const moments = list.map((journey) =>
    direction === "earlier" ? journey.to.planned : journey.from.planned,
  );
  const seconds =
    direction === "earlier"
      ? Math.min(...moments) - 60
      : Math.max(...moments) + 60;
  const moment = belgianParts(new Date(seconds * 1000));
  return validDate(moment.date)
    ? {
        ...moment,
        live: false,
        timesel: direction === "earlier" ? "arrival" : "departure",
      }
    : null;
}
export function journeyDuration(seconds, t) {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} ${t("hourShort")} ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim()
    : `${minutes} min`;
}
function timeMarkup(value, lang, baseDay) {
  if (!value) return "—";
  const date = new Date(value * 1000),
    day = belgianParts(date).date;
  return `<time datetime="${date.toISOString()}">${h(fmtTime(value, lang))}</time>${day !== baseDay ? `<small class="journey-day">${h(fmtDate(day, lang))}</small>` : ""}`;
}
function eventMarkup(event, lang, baseDay, t) {
  const planned = timeMarkup(event.planned, lang, baseDay);
  const minutes = delayMinutes(event.delay);
  if (event.cancelled)
    return `<del>${planned}</del><span class="journey-cancelled">${h(t("cancelled"))}</span>`;
  if (minutes)
    return `<del>${planned}</del><span class="${minutes > 0 ? "delay" : "early"}">${timeMarkup(event.expected, lang, baseDay)}</span><small class="journey-delay ${minutes > 0 ? "delay" : "early"}">${minutes > 0 ? "+" : ""}${minutes} min</small>`;
  return planned;
}
function platformMarkup(event, t) {
  return event.platform && event.platform !== "?"
    ? `<span class="journey-platform${event.platformChanged ? " changed" : ""}">${h(t("platform"))} <strong>${h(event.platform)}</strong>${event.platformChanged ? `<span class="sr-only"> · ${h(t("changedPlatform"))}</span>` : ""}</span>`
    : "";
}
export function renderJourneys(
  list,
  t,
  { lang = "nl", date, open = new Set(), openStops = new Set() } = {},
) {
  return list
    .map((journey, index) => {
      const day =
        date || belgianParts(new Date(journey.from.planned * 1000)).date;
      const change = journey.changes
        ? `${journey.changes} ${t(journey.changes === 1 ? "transfer" : "transfers")}`
        : t("direct");
      const warning = journey.cancelled
        ? "cancelledJourney"
        : journey.missed
          ? "missedTransfer"
          : journey.tight
            ? "shortTransfer"
            : "";
      const duration = journeyDuration(
        journey.cancelled || journey.to.expected < journey.from.expected
          ? journey.to.planned - journey.from.planned
          : journey.to.expected - journey.from.expected,
        t,
      );
      return `<details class="journey${journey.cancelled ? " journey-cancelled-route" : ""}" data-journey-key="${h(journey.key)}"${open.has(journey.key) ? " open" : ""}><summary><span class="journey-summary"><span class="journey-times"><span class="sr-only">${h(t("departure"))} </span><span>${eventMarkup(journey.from, lang, day, t)}</span><span class="journey-arrow" aria-hidden="true">→</span><span class="sr-only">${h(t("arrival"))} </span><span>${eventMarkup(journey.to, lang, day, t)}</span></span><span class="journey-meta"><span>${h(duration)}</span><span>${h(change)}</span><span class="journey-trains">${journey.legs.map((leg) => h(leg.walking ? t("walk") : leg.label || t("train"))).join(" · ")}</span></span>${warning ? `<span class="journey-warning${journey.cancelled || journey.missed ? " delay" : ""}">${h(t(warning))}</span>` : ""}</span><svg class="journey-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></summary><div class="journey-body"><ol class="journey-legs">${journey.legs
        .map((leg, i) => {
          const next = journey.legs[i + 1],
            transfer = journey.transfers[i];
          const stopList = leg.stops
            .map((stop) => {
              const station = plannerStation(stop),
                planned = timestamp(
                  stop.scheduledDepartureTime ||
                    stop.time ||
                    stop.scheduledArrivalTime,
                );
              const stopEvent = {
                planned,
                expected: planned
                  ? timestamp(
                      planned +
                        (number(stop.departureDelay ?? stop.delay) || 0),
                    )
                  : null,
                delay: number(stop.departureDelay ?? stop.delay),
                cancelled: flag(stop.departureCanceled ?? stop.canceled),
              };
              return `<li><span>${h(station.name)}</span><span>${eventMarkup(stopEvent, lang, day, t)}</span></li>`;
            })
            .join("");
          return `<li class="journey-leg${leg.walking ? " journey-walk" : ""}"><div class="journey-leg-heading">${leg.walking ? `<strong>${h(t("walk"))} · ${h(journeyDuration(leg.to.planned - leg.from.planned, t))}</strong>` : `<button type="button" class="journey-train" data-planner-leg="${index}:${i}" data-train-key="${h(`planner:${journey.key}:${i}`)}"${!leg.vehicle || !leg.from.station.id ? " disabled" : ""}>${h(leg.label || t("train"))}<span aria-hidden="true">↗</span><span class="sr-only"> · ${h(t("details"))}</span></button>${leg.from.raw.direction?.name ? `<span class="journey-direction">${h(t("towards"))} ${h(leg.from.raw.direction.name)}</span>` : ""}${renderCrowding(leg.row, t)}`}</div><div class="journey-endpoint"><div><strong>${h(leg.from.station.name)}</strong><span class="journey-event-label">${h(t("departure"))}</span></div><div class="journey-event-time">${eventMarkup(leg.from, lang, day, t)}</div>${leg.walking ? "" : platformMarkup(leg.from, t)}</div>${!leg.walking && stopList ? `<details class="journey-stops" data-leg-key="${h(`${journey.key}:${i}`)}"${openStops.has(`${journey.key}:${i}`) ? " open" : ""}><summary>${leg.stops.length} ${h(t(leg.stops.length === 1 ? "intermediateStop" : "intermediateStops"))}</summary><ol>${stopList}</ol></details>` : ""}<div class="journey-endpoint"><div><strong>${h(leg.to.station.name)}</strong><span class="journey-event-label">${h(t("arrival"))}</span></div><div class="journey-event-time">${eventMarkup(leg.to, lang, day, t)}</div>${leg.walking ? "" : platformMarkup(leg.to, t)}</div>${next && !next.walking ? `<p class="journey-transfer${transfer.missed ? " delay" : ""}">${h(transfer.missed ? t("missedTransfer") : `${journeyDuration(transfer.wait, t)} · ${t("transferAt")} ${leg.to.station.name}`)}</p>` : ""}</li>`;
        })
        .join(
          "",
        )}</ol>${renderTrainNotices(journey.notices, {}, (key) => t(key === "trainNotices" ? "journeyNotices" : key))}</div></details>`;
    })
    .join("");
}
