import {
  asArray,
  escapeHtml as h,
  flag,
  fmtTime,
  fmtDate,
  belgianParts,
  delayMinutes,
  occupancy,
  safeLink,
} from "./rail-utils.js?v=0.9.1";

const number = (value) =>
  ["number", "string"].includes(typeof value) &&
  String(value).trim() !== "" &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const timestamp = (value) =>
  number(value) > 0 && Number.isFinite(new Date(number(value) * 1000).getTime())
    ? number(value)
    : null;

export function renderCrowding(row, t) {
  const level = occupancy(row);
  if (!level || flag(row.canceled)) return "";
  return `<span class="crowding" role="img" title="${h(t("occupancy"))}" aria-label="${h(`${t("occupancy")}: ${t(level)}`)}"><span class="crowding-bars" aria-hidden="true">${[1, 2, 3].map((n) => `<i${n <= { low: 1, medium: 2, high: 3 }[level] ? ' class="filled"' : ""}></i>`).join("")}</span>${h(t(level))}</span>`;
}

// Display-only cleanup: strip complete tags until stable, preserve line breaks
// and decode common entities. This is not an HTML sanitizer: every result must
// still pass through escapeHtml when it is rendered, including decoded markup.
function plainText(value) {
  if (typeof value !== "string") return "";
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  let cleaned = value.replace(/<br\s*\/?\s*>|<\/p\s*>/gi, "\n");
  let previous;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(/<[^>]*>/g, "");
  } while (cleaned !== previous);
  return cleaned
    .replace(
      /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (match, entity) => {
        if (!entity.startsWith("#"))
          return entities[entity.toLowerCase()] || match;
        const code =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : match;
      },
    )
    .trim();
}

export function trainNotices(data, row = {}) {
  const stops = asArray(data?.stops?.stop);
  const seen = new Set();
  return [data, row, ...stops]
    .flatMap((source) => asArray(source?.alerts?.alert ?? source?.alerts))
    .filter((alert) => alert && typeof alert === "object")
    .map((alert) => ({
      header: plainText(alert.header || alert.title),
      body: plainText(alert.description || alert.lead || alert.text),
      link: safeLink(alert.link),
    }))
    .filter((alert) => {
      if (!alert.header && !alert.body) return false;
      // Repeated train/stop notices often carry different local IDs.
      const key = JSON.stringify([alert.header, alert.body, alert.link]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function renderTrainNotices(data, row, t) {
  const notices = trainNotices(data, row);
  if (!notices.length) return "";
  return `<section class="train-notices" aria-labelledby="trainNoticesTitle"><h3 id="trainNoticesTitle" class="section-title">${h(t("trainNotices"))}</h3><ul>${notices.map((notice) => `<li>${notice.header ? `<strong>${h(notice.header)}</strong>` : ""}${notice.body && notice.body !== notice.header ? `<p>${h(notice.body)}</p>` : ""}${notice.link ? `<a href="${h(notice.link)}" target="_blank" rel="noopener noreferrer">${h(t("moreInfo"))} ↗</a>` : ""}</li>`).join("")}</ul></section>`;
}

export function stopEvents(stop, index, total, mode = "departure") {
  const arrival =
    timestamp(stop.scheduledArrivalTime) || timestamp(stop.arrivaltime);
  const departure =
    timestamp(stop.scheduledDepartureTime) || timestamp(stop.departuretime);
  const events = [];
  const specificCancellation =
    stop.arrivalCanceled != null || stop.departureCanceled != null;
  const sameCancellation =
    flag(stop.arrivalCanceled) === flag(stop.departureCanceled);
  for (const [kind, planned] of [
    ["arrival", arrival],
    ["departure", departure],
  ]) {
    if (!planned) continue;
    // iRail may repeat the only event at a terminus into both time fields.
    if (
      arrival === departure &&
      sameCancellation &&
      ((total === 1 && kind !== mode) ||
        (total > 1 &&
          ((index === 0 && kind === "arrival") ||
            (index === total - 1 && kind === "departure"))))
    )
      continue;
    const delay =
      number(stop[`${kind}Delay`]) ??
      (kind === "departure" ? number(stop.delay) : null);
    const canceled =
      stop[`${kind}Canceled`] != null
        ? flag(stop[`${kind}Canceled`])
        : !specificCancellation && flag(stop.canceled);
    events.push({
      kind,
      planned,
      delay,
      canceled,
      expected: !canceled && delay !== null ? timestamp(planned + delay) : null,
      passed: flag(stop[kind === "arrival" ? "arrived" : "left"]),
    });
  }
  if (!events.length) {
    const planned = timestamp(stop.time);
    const delay = number(stop.delay);
    events.push({
      kind: mode,
      planned,
      delay,
      canceled: flag(stop.canceled),
      expected:
        planned && delay !== null && !flag(stop.canceled)
          ? timestamp(planned + delay)
          : null,
      passed: flag(stop[mode === "arrival" ? "arrived" : "left"]),
    });
  }
  return events;
}

function timeMarkup(value, language, t, serviceDay) {
  if (!value) return "—";
  const day = belgianParts(new Date(value * 1000)).date;
  return `${h(fmtTime(value, language))}${serviceDay && day !== serviceDay ? `<small class="stop-day">${h(fmtDate(day, language))}</small>` : ""}`;
}

function renderEvent(event, t, language, serviceDay, secondary = false) {
  let status,
    statusClass = "";
  if (event.canceled) {
    status = t("cancelled");
    statusClass = "cancelled";
  } else if (event.passed) {
    status = t(event.kind === "arrival" ? "arrived" : "departed");
    statusClass = "unknown";
  } else if (
    event.delay === null ||
    !event.planned ||
    event.expected === null
  ) {
    status = t("expectedUnknown");
    statusClass = "unknown";
  } else if (event.delay === 0) status = t("onTime");
  else {
    status = `${event.delay > 0 ? "+" : "−"}${Math.abs(delayMinutes(event.delay))} ${t("minute")}`;
    statusClass = "delay";
  }
  const displayed = event.expected ?? event.planned;
  const plannedHint =
    event.expected !== null && event.expected !== event.planned
      ? `${t("scheduledTime")}: ${fmtTime(event.planned, language)}`
      : "";
  const time = timeMarkup(displayed, language, t, serviceDay);
  return `<div class="stop-event${secondary ? " secondary-event" : ""}${event.canceled ? " cancelled-event" : ""}" data-event="${event.kind}"><span class="stop-clock"><span class="sr-only">${h(t(event.expected !== null ? "expectedTime" : "scheduledTime"))}: </span>${event.canceled ? `<span class="stop-scheduled">${time}</span>` : `<strong${plannedHint ? ` title="${h(plannedHint)}"` : ""}>${time}</strong>`}${plannedHint ? `<span class="sr-only"> · ${h(plannedHint)}</span>` : ""}</span><span class="stop-event-label">${h(t(event.kind))}</span><span class="status-text ${statusClass}">${h(status)}</span></div>`;
}

export function renderStopList(
  stops,
  { stationId, mode, serviceDay, language, t, platformHTML },
) {
  return stops
    .map((stop, index) => {
      const current = stop.stationinfo?.id === stationId;
      const events = stopEvents(stop, index, stops.length, mode);
      const primary =
        events.find((event) => event.kind === mode) || events.at(-1);
      // Keep the everyday view compact. The other event is shown only when its
      // cancellation state differs, so a partial cancellation remains explicit.
      const secondary = events.filter(
        (event) => event !== primary && event.canceled !== primary.canceled,
      );
      const metadata = [
        current ? t("selectedStop") : "",
        flag(stop.isExtraStop) ? t("extraStop") : "",
      ].filter(Boolean);
      return `<li class="stop${current ? " current" : ""}"><div class="stop-name"><strong>${h(stop.station || stop.stationinfo?.name || "—")}</strong>${metadata.length ? `<small>${h(metadata.join(" · "))}</small>` : ""}<div class="stop-times">${renderEvent(primary, t, language, serviceDay)}${secondary.map((event) => renderEvent(event, t, language, serviceDay, true)).join("")}</div>${renderCrowding(stop, t)}</div>${platformHTML(stop)}</li>`;
    })
    .join("");
}
