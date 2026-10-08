import { escapeHtml, validDate, validTime } from "./public/rail-utils.js";

const copy = {
  nl: {
    locale: "nl_BE",
    tagline: "België per spoor",
    departures: "Vertrekken",
    arrivals: "Aankomsten",
    description:
      "Belgische treinen, helder in beeld. Bekijk vertrekken, aankomsten, perrons en vertragingen voor jouw station.",
    board: "Bekijk de dienstregeling, perrons en vertragingen.",
    live: "Open de link voor de actuele treinen.",
    planned: "Geplande dienstregeling",
    zone: "Belgische tijd",
    imageAlt:
      "Stationsbord: Belgische treinen, helder in beeld. Crème en blauw met koperkleurige spoorlijnen en het Stationsbord-logo.",
  },
  fr: {
    locale: "fr_BE",
    tagline: "La Belgique en train",
    departures: "Départs",
    arrivals: "Arrivées",
    description:
      "Les trains belges, en toute clarté. Consultez les départs, arrivées, voies et retards de votre gare.",
    board: "Consultez les horaires, voies et retards.",
    live: "Ouvrez le lien pour les trains en temps réel.",
    planned: "Horaires prévus",
    zone: "heure belge",
    imageAlt:
      "Stationsbord : horaires des trains belges. Fond crème et bleu, lignes ferroviaires cuivrées et logo Stationsbord.",
  },
  de: {
    locale: "de_BE",
    tagline: "Belgien auf Schienen",
    departures: "Abfahrten",
    arrivals: "Ankünfte",
    description:
      "Belgische Züge, klar im Blick. Abfahrten, Ankünfte, Gleise und Verspätungen für deinen Bahnhof.",
    board: "Fahrplan, Gleise und Verspätungen im Überblick.",
    live: "Öffne den Link für aktuelle Zugdaten.",
    planned: "Geplanter Fahrplan",
    zone: "belgische Zeit",
    imageAlt:
      "Stationsbord: belgische Zugfahrpläne. Cremefarbener und blauer Hintergrund mit kupferfarbenen Bahnlinien und Stationsbord-Logo.",
  },
  en: {
    locale: "en_GB",
    tagline: "Belgium by rail",
    departures: "Departures",
    arrivals: "Arrivals",
    description:
      "Belgian trains, clearly. Find departures, arrivals, platforms and delays for your station.",
    board: "See train times, platforms and delays.",
    live: "Open the link for current train information.",
    planned: "Planned timetable",
    zone: "Belgian time",
    imageAlt:
      "Stationsbord, Belgian train schedules. Cream and blue artwork with copper railway lines and the Stationsbord logo.",
  },
};

// Never construct public metadata from an untrusted Host/Forwarded header.
export function publicOrigin(value = "https://stationsbord.fly.dev") {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      "PUBLIC_BASE_URL must be an absolute HTTP(S) origin without a path or credentials",
    );
  }
}

export function pageMetadata(search, origin) {
  const params = new URLSearchParams(search);
  const read = (key, limit = 150) => {
    const values = params.getAll(key);
    if (values.length !== 1 || values[0].length > limit) return "";
    return values[0].replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  };
  const language = read("lang", 2);
  const lang = Object.hasOwn(copy, language) ? language : "nl";
  const text = copy[lang];
  const station = read("station");
  const name = station
    ? read("name") || (/^BE\.NMBS\.[A-Za-z0-9]+$/.test(station) ? "" : station)
    : "";
  const arrival = read("mode") === "arrival";
  const label = arrival ? text.arrivals : text.departures;
  const url = new URL("/", origin);
  let title = `Stationsbord · ${text.tagline}`;
  let description = text.description;
  if (station) {
    url.searchParams.set("station", station);
    if (name) url.searchParams.set("name", name);
    url.searchParams.set("mode", arrival ? "arrival" : "departure");
    url.searchParams.set("lang", lang);
    title = `${name ? `${name} · ` : ""}${label} | Stationsbord`;
    description = `${text.board} ${text.live}`;
    const date = read("date", 10),
      time = read("time", 5);
    if (validDate(date) && validTime(time)) {
      url.searchParams.set("date", date);
      url.searchParams.set("time", time);
      const formatted = new Intl.DateTimeFormat(lang, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Brussels",
      }).format(new Date(`${date}T12:00:00Z`));
      description = `${text.planned}: ${formatted}, ${time} (${text.zone}). ${text.board}`;
    }
  } else if (lang !== "nl") url.searchParams.set("lang", lang);
  return {
    lang,
    title,
    description,
    url: url.href,
    locale: text.locale,
    image: new URL("/social-card.png?v=0.7.0", origin).href,
    imageAlt: text.imageAlt,
  };
}

export function metadataMarkup(meta) {
  const property = (key, value) =>
    `<meta property="${key}" content="${escapeHtml(value)}" />`;
  const name = (key, value) =>
    `<meta name="${key}" content="${escapeHtml(value)}" />`;
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    name("description", meta.description),
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    property("og:type", "website"),
    property("og:site_name", "Stationsbord"),
    property("og:title", meta.title),
    property("og:description", meta.description),
    property("og:url", meta.url),
    property("og:locale", meta.locale),
    ...Object.values(copy)
      .filter((text) => text.locale !== meta.locale)
      .map((text) => property("og:locale:alternate", text.locale)),
    property("og:image", meta.image),
    property("og:image:type", "image/png"),
    property("og:image:width", "1200"),
    property("og:image:height", "630"),
    property("og:image:alt", meta.imageAlt),
    name("twitter:card", "summary_large_image"),
    name("twitter:title", meta.title),
    name("twitter:description", meta.description),
    name("twitter:image", meta.image),
    name("twitter:image:alt", meta.imageAlt),
  ].join("\n    ");
}

export function renderPage(template, search, origin) {
  const meta = pageMetadata(search, origin);
  return template
    .replace(/<html lang="[^"]*"/, `<html lang="${meta.lang}"`)
    .replace(
      /<!-- page-meta:start -->[\s\S]*?<!-- page-meta:end -->/,
      () =>
        `<!-- page-meta:start -->\n    ${metadataMarkup(meta)}\n    <!-- page-meta:end -->`,
    );
}
