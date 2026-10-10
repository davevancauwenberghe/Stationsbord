import { artwork } from "./assets/trains/catalog.js?v=0.9.2-r4";
import { asArray, escapeHtml as h, flag } from "./rail-utils.js?v=0.9.2";

const seats = (value) =>
  Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const firstSeats = (unit) =>
  seats(unit.seatsFirstClass) + seats(unit.seatsCoupeFirstClass);
const secondSeats = (unit) =>
  seats(unit.seatsSecondClass) + seats(unit.seatsCoupeSecondClass);
const text = (value) => (typeof value === "string" ? value.trim() : "");

function parseMaterial(value) {
  return text(value)
    .toUpperCase()
    .replace(/(?:[_\s]+UNKNOWN)$/, "")
    .match(
      /^(HLE\d+(?:II)?|AM\d{2}[MP]?|AR41|MW41|M[4567]|I(?:6|10|11))(?:[_\s]?)(.*)$/,
    );
}
function material(unit) {
  const parent = text(unit.materialType?.parent_type);
  const fromParent = parseMaterial(parent);
  const fromName = parseMaterial(unit.materialSubTypeName);
  const subtype = text(unit.materialType?.sub_type).toUpperCase();
  return {
    family: (fromParent?.[1] || fromName?.[1] || parent)
      .toUpperCase()
      .replace(/\s/g, ""),
    // Some API records put the whole type (e.g. I11BDXH) in parent_type and
    // report sub_type as "unknown". Recover its suffix before using the label.
    subtype: (subtype && subtype !== "UNKNOWN"
      ? subtype
      : fromParent?.[2] || fromName?.[2] || ""
    )
      .toUpperCase()
      .replace(/\s/g, ""),
    side: ["RIGHT", "R"].includes(
      text(unit.materialType?.orientation).toUpperCase(),
    )
      ? "R"
      : "L",
  };
}

// Cab direction is reviewed per drawing, independent of its source-side filename.
// Intermediate vehicles retain the requested source side; formation order stays intact.
export function selectArtworkVariant(variants, orientation) {
  return (
    Object.values(variants || {}).find(
      (entry) => entry.cabFacing === orientation,
    ) || variants?.[orientation]
  );
}
const isOtc = (trainId) => /^(?:BE\.NMBS\.)?OTC\d+$/i.test(text(trainId));

// Written for Stationsbord from iRail's public fields and the original MLGTraffic
// collection descriptions. No HyperRail code or asset transformations are used.
export function matchArtwork(unit, { trainId = "" } = {}) {
  const { family, subtype, side: orientation } = material(unit);
  const first = firstSeats(unit) > 0 || flag(unit.isFirstClass);
  const second = secondSeats(unit) > 0 || flag(unit.isSecondClass);
  const number = Number(unit.materialNumber);
  let key;
  if (/^HLE(?:13|18|19|21|27|28|29)(?:II)?$/.test(family)) {
    const series = family.match(/\d+/)[0];
    key = "hle" + ({ 19: "18", 29: "28" }[series] || series);
  } else if (/^AM08[MP]?$/.test(family) && ["A", "B", "C"].includes(subtype)) {
    const voltage =
      family.endsWith("P") || (number >= 8501 && number <= 8595) ? "ac" : "dc";
    key =
      subtype === "A" ? "am08-a" : `am08-${voltage}-${subtype.toLowerCase()}`;
  } else if (/^AM96[MP]?$/.test(family)) {
    if (subtype === "B") {
      const voltage =
        family.endsWith("P") || (number >= 441 && number <= 490) ? "ac" : "dc";
      key = `am96-${voltage}-middle`;
    } else if (["A", "C"].includes(subtype) && (first || second)) {
      key = first ? "am96-first" : "am96-second";
    } else {
      key = {
        AX: "am96-first",
        BX: "am96-second",
        BMONO: "am96-dc-middle",
        BBIC: "am96-ac-middle",
      }[subtype];
    }
  } else if (/^AM80[MP]?$/.test(family)) {
    if (subtype === "B") key = "am80-middle";
    else if (["A", "C"].includes(subtype) && (first || second))
      key = first ? "am80-first" : "am80-second";
  } else if (/^AM75[MP]?$/.test(family)) {
    if (subtype === "B" || subtype === "C")
      key = `am75-middle-${subtype.toLowerCase()}`;
    else if (["A", "D"].includes(subtype) && (first || second))
      key = first ? "am75-first" : "am75-second";
  } else if (
    /^AM86[MP]?$/.test(family) &&
    ["A", "B"].includes(subtype) &&
    (first || second)
  ) {
    key = first ? "am86-trailer" : "am86-motor";
  } else if (
    ["AR41", "MW41"].includes(family) &&
    ["A", "B", "AB"].includes(subtype) &&
    (first || second)
  ) {
    key = first ? "ar41-first" : "ar41-second";
  } else if (family === "M4") {
    key = {
      A: "m4-first",
      AU: "m4-first",
      AYU: "m4-first",
      B: "m4-second",
      BU: "m4-second",
      BYU: "m4-second",
      AD: "m4-luggage-first",
      AUD: "m4-luggage-first",
      BD: "m4-luggage-second",
      BDU: "m4-luggage-second",
      ADX: "m4-cab",
      ADU: "m4-cab",
    }[subtype];
  } else if (family === "M5") {
    if (["BDX", "BDXH", "BX", "BXH"].includes(subtype)) key = "m5-cab";
    else if (["A", "AU"].includes(subtype)) key = "m5-first";
    else if (["B", "BU", "BUH", "BYU"].includes(subtype)) key = "m5-second";
  } else if (family === "M6") {
    if (["BX", "BDX", "BXCT", "BXAA"].includes(subtype)) key = "m6-cab";
    else if (["ABD", "BDAU", "ABUH"].includes(subtype))
      key = "m6-luggage-mixed";
    else if (["BD", "BDH", "BDU", "BDUH", "BDYU"].includes(subtype))
      key = "m6-luggage-second";
    else if (["A", "AU"].includes(subtype)) key = "m6-first";
    else if (["B", "BU", "BUH", "BYU", "BAU"].includes(subtype))
      key = first ? "m6-first" : "m6-second";
  } else if (family === "M7") {
    if (["BMX", "BM", "BMXH"].includes(subtype)) key = "m7-motor";
    else if (["BDX", "BDXH", "BX", "BXH"].includes(subtype)) key = "m7-cab";
    else if (["BD", "BDH", "BDU", "BDUH", "BDYU"].includes(subtype))
      key = "m7-luggage";
    else if (["AB", "ABUH", "AU"].includes(subtype)) key = "m7-mixed";
    else if (["BAU", "BUH"].includes(subtype))
      key = first
        ? "m7-mixed"
        : flag(unit.hasPrmSection)
          ? "m7-luggage"
          : "m7-second";
    else if (["B", "BU", "BYU"].includes(subtype))
      key = first ? "m7-mixed" : "m7-second";
  } else if (["I6", "I10", "I11"].includes(family)) {
    if (family === "I11" && ["BDX", "BX", "BDXH"].includes(subtype))
      key = "i11-cab";
    else if (["A", "AU", "B", "BU", "BUH", "BYU"].includes(subtype))
      key =
        family.toLowerCase() +
        (first || ["A", "AU"].includes(subtype) ? "-first" : "-second");
  }
  // OTC services use Ouigo A/B drawings; their I11 cab car uses the standard drawing.
  if (
    family === "I11" &&
    isOtc(trainId) &&
    ["i11-first", "i11-second"].includes(key)
  )
    key = key.replace("i11-", "i11-ouigo-");
  const entry = selectArtworkVariant(artwork[key], orientation);
  return entry ? { ...entry, key, src: `/assets/trains/${entry.file}` } : null;
}

const icons = {
  bikes:
    '<circle cx="5" cy="16" r="4"/><circle cx="19" cy="16" r="4"/><path d="m5 16 5-9 5 9H5l-2-9h5m7 9-3-12h4"/>',
  accessible:
    '<circle cx="12" cy="4" r="2"/><path d="m11 8-1 7h7l3 6m-9-10h6M8 11a6 6 0 1 0 7 9"/>',
  toilets: '<path d="M8 3h8v5H8zM6 11h12v2a6 6 0 0 1-6 6H9v3h6M16 8v3"/>',
  airco: '<path d="M12 2v20M3 7l18 10M3 17 21 7m-12-3 3 3 3-3m-6 16 3-3 3 3"/>',
  outlets: '<path d="M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-5 5v6"/>',
  priority: '<path d="M8 3v10h10v5H5V8m2 10v4m10-4v4M12 3v6m-3-3h6"/>',
  tables: '<path d="M3 8h18v4H3zM6 12v9m12-9v9"/>',
  luggage:
    '<rect x="5" y="6" width="14" height="14" rx="2"/><path d="M9 6V3h6v3M9 10v6m6-6v6M8 20v2m8-2v2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name]}</svg>`;

function renderUnit(unit, index, t, context) {
  const drawing = matchArtwork(unit, context);
  const suppliedName = text(unit.materialSubTypeName);
  const name =
    (drawing
      ? suppliedName.replace(/(?:[_\s]+unknown)$/i, "")
      : suppliedName) ||
    [text(unit.materialType?.parent_type), text(unit.materialType?.sub_type)]
      .filter((value) => value && value.toUpperCase() !== "UNKNOWN")
      .join(" ") ||
    t("unknown");
  const first = firstSeats(unit),
    second = secondSeats(unit);
  const classes = [
    [first, "first", "1"],
    [second, "second", "2"],
  ]
    .filter(
      ([count, key]) =>
        count > 0 ||
        flag(unit[key === "first" ? "isFirstClass" : "isSecondClass"]),
    )
    .map(
      ([count, key, label]) =>
        `<span class="carriage-class"><b>${label}</b><span>${h(t(key))}${count ? ` · ${count} ${h(t("seats"))}` : ""}</span></span>`,
    )
    .join("");
  const features = [
    ["hasBikeSection", "bikes"],
    ["hasPrmSection", "accessible"],
    ["hasToilets", "toilets"],
    ["hasAirco", "airco"],
    ["hasPriorityPlaces", "priority"],
    ["hasTables", "tables"],
    ["hasLuggageSection", "luggage"],
  ]
    .filter(([field]) => flag(unit[field]))
    .map(([, key]) => key);
  if (flag(unit.hasFirstClassOutlets) || flag(unit.hasSecondClassOutlets))
    features.push("outlets");
  return `<li class="carriage-card"><div class="carriage-image">${drawing ? `<img src="${h(drawing.src)}" width="${drawing.width}" height="${drawing.height}" alt="" decoding="async">` : ""}<span class="carriage-placeholder" ${drawing ? "hidden" : ""}>${h(t("artworkUnavailable"))}</span></div><div class="carriage-caption"><span class="carriage-position">${String(index + 1).padStart(2, "0")}</span><div><strong>${h(name)}</strong>${unit.materialNumber ? `<small>${h(unit.materialNumber)}</small>` : ""}</div></div><div class="carriage-classes">${classes || `<span class="muted">${h(t(/^HLE/.test(material(unit).family) ? "locomotive" : "seatsUnknown"))}</span>`}</div>${features.length ? `<ul class="carriage-features">${features.map((key) => `<li>${icon(key)}<span>${h(t(key))}</span></li>`).join("")}</ul>` : ""}</li>`;
}

export function renderCompositionDisclaimer(t) {
  return `<p class="composition-note schedule-disclaimer">${h(t("scheduleDisclaimer"))}</p>`;
}

export function renderComposition(data, t, context = {}) {
  const segments = asArray(data?.composition?.segments?.segment);
  const result = segments
    .map((segment, index) => {
      const units = asArray(segment.composition?.units?.unit).filter(
        (unit) => unit && typeof unit === "object",
      );
      if (!units.length) return "";
      const label = [
        segment.origin?.name || segment.origin,
        segment.destination?.name || segment.destination,
      ]
        .filter((v) => typeof v === "string")
        .join(" → ");
      const title = label || `${t("composition")} ${index + 1}`;
      // Segments are separate formations: never sum or join them into one train.
      const first = units.reduce((sum, unit) => sum + firstSeats(unit), 0);
      const second = units.reduce((sum, unit) => sum + secondSeats(unit), 0);
      return `<div class="composition-segment">${label ? `<h4>${h(label)}</h4>` : ""}<div class="composition-stats"><span>${units.length} ${h(t("carriages"))}</span><span>${h(t("first"))}: ${first} ${h(t("seats"))}</span><span>${h(t("second"))}: ${second} ${h(t("seats"))}</span></div><div class="composition-scroll" tabindex="0" role="region" aria-label="${h(title)}"><ol class="composition-train">${units.map((unit, i) => renderUnit(unit, i, t, context)).join("")}</ol></div></div>`;
    })
    .join("");
  return result
    ? `${result}${renderCompositionDisclaimer(t)}<p class="composition-note">${h(t("compositionIndicative"))}</p><p class="artwork-credit">${h(t("artworkCredit"))}: <a href="http://www.mlgtraffic.net/Coll_BNL_E.htm" target="_blank" rel="noopener noreferrer">Marc Le Gad / MLGTraffic</a> · <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener noreferrer license">CC BY-NC-SA 3.0</a></p>`
    : `<p class="muted">${h(t("compositionError"))}</p>${renderCompositionDisclaimer(t)}`;
}

export function installArtworkFallbacks(container) {
  container.querySelectorAll(".carriage-image img").forEach((img) => {
    const fallback = () => {
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    };
    img.addEventListener("error", fallback, { once: true });
    if (img.complete && img.naturalWidth === 0) fallback();
  });
}
