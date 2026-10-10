[![Tests](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/test.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/test.yml)
[![CodeQL](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml)

# Stationsbord

**It’s on the board.**

A clear, lightweight timetable for the Belgian rail network, powered by [iRail](https://irail.be). Built with Node.js, Express and plain HTML/CSS/JavaScript.

## Using the board

1. Search for a station, or choose a popular or saved station. Recent stations appear when you tap the search field.
2. Use **Now** for a live board, or **Choose a time** for a specific date and time.
3. Switch between **Departures** and **Arrivals**. Select a train to view its stops and available carriage information.

Live boards refresh every minute while the page is visible. Planned searches stay at the selected time. All schedule times use **Europe/Brussels**, including daylight saving changes, regardless of the device’s time zone.

- Save up to eight stations using the star button. Favourites appear as compact, selectable chips with an edit mode for removal. Recent and saved stations remain in your browser; no account is required.
- Share a link containing the station, arrivals/departures, language and optional date/time, using the native share sheet where supported or copying the link.
- Shared URLs include a branded image and localized station/timetable previews, available to social crawlers without JavaScript.
- Current network disruptions appear first; scheduled works are in a separate expandable section using iRail’s `type` field.
- Train details include service notices returned by iRail, with repeated notices
  combined and links to further information. Missing notices do not imply that a
  service is unaffected.
- Crowding indicators appear on the board when iRail supplies a quiet, moderate
  or busy level. Unknown levels and cancelled services have no indicator.
- Departure times are prominent in train details; arrival times appear on a smaller line. Delayed events show the original time crossed out, the new time in red and a separate delay label. Arrival and departure cancellations remain distinct. Departed stops fade without disappearing; screen readers retain their status. Dates appear across midnight and unknown delays remain explicit.
- Dutch, French, German and English interfaces.
- Choose System, Light or Dark appearance in the header. System follows your device; an explicit choice is remembered in your browser.
- A full-width station board with warm paper colours, ink-blue signage and a matching dark appearance.
- Filter the loaded trains by destination (or origin for arrivals) and train number. Filtering keeps cancelled services visible when they match.
- Use Board view to hide the search area while watching the live timetable. Press Escape outside a field to return, or use the button.
- Keyboard station selection, native date/time pickers and accessible train-detail dialogs are supported.

Train times and tracks may change or differ from the displayed information. Check station boards and announcements or the SNCB app before departure. This reminder appears in the train composition section, including when composition data is unavailable.

Stationsbord is an independent service. Schedule availability depends on iRail/NMBS; searches far into the past or future may not be available. Train composition is queried only for today, because that endpoint does not accept a service date. Cached or failed refreshes are explicitly labelled rather than presented as fresh data.

## Run locally

Requires Node.js 22 or later; Docker and CI use Node.js 24.

```sh
cp .env.example .env
cd server
npm ci
node --env-file=../.env src/index.js
```

Open **http://localhost:8080**. Set `APP_WEBSITE` and `APP_EMAIL` in `.env` to real contact details before production use; iRail uses these to contact application owners when needed.

## Docker

```sh
docker compose up --build -d
```

The container listens on port 8080 and runs as an unprivileged user. The existing `fly.toml` continues to configure Fly.io hosting.

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `PORT` | `8080` |
| `IRAIL_BASE_URL` | `https://api.irail.be`; override for an upstream fixture or alternate endpoint |
| `IRAIL_TIMEOUT_MS` | `25000`; covers headers and response body |
| `APP_NAME`, `APP_VERSION` | Application name/version in the upstream User-Agent |
| `APP_WEBSITE`, `APP_EMAIL` | Owner contact details in the upstream User-Agent |
| `PUBLIC_BASE_URL` | Public origin for canonical and social-image URLs; defaults to `https://stationsbord.fly.dev`. Set this to your HTTPS domain if using a custom domain. |

ETags and upstream cache lifetimes are respected. Identical concurrent requests share one upstream request. Upstream requests are rate limited; the memory cache is capped at 500 entries, and stale responses expire five minutes after their fresh lifetime. Per-client limiter entries are periodically pruned. Fly installations trust one ingress proxy hop; direct/self-hosted installations do not trust forwarded client headers by default.

## Checks

```sh
cd server
npm ci
npm test
```

Tests cover Belgian time and DST, calendar validation, service-date handling, station search, safe external links, supported language coverage, cache limits, response-body timeouts and HTTP proxy behavior. GitHub Actions runs tests alongside CodeQL.

No bundler or frontend framework is required. Assets use a version query, and browser caching is limited to one hour with revalidation.

## Link previews

The server renders Open Graph and large-image card metadata for the homepage and shared station URLs in Dutch, French, German and English. Station, direction and valid planned date/time parameters are retained in the canonical URL; unrelated tracking parameters are omitted. Preview creation never calls iRail, and the artwork contains no live departure times that could become stale.

`server/src/public/social-card.svg` is the editable source for the 1200 × 630 PNG used by social platforms. Export an updated PNG at the same dimensions when changing the artwork. Platforms cache previews independently, so existing posts may retain an older image or description until their cache refreshes. Actual card presentation depends on the receiving platform.

## License

[MIT](LICENSE)

## Train illustrations

The composition view shows original **MLGTraffic / Marc Le Gad** train drawings
with per-unit seat counts and amenities, including priority seats and tables or
luggage areas when supplied. Seat counts describe the rolling stock, not the
number of free places. Standing capacity and lengths are omitted from the view.
It supports AM08, AM75, AM80, AM86,
AM96, AR41, M4/M5, M6, M7 (including motor cars), I6/I10/I11 and selected HLE
locomotives. Unknown types and failed images retain their text and show a
labelled fallback. Each composition segment has its own horizontally scrollable,
keyboard-focusable train strip. Drawings are indicative: actual livery, order
and orientation may differ from the upstream data.

The 104 PNGs are committed under `server/src/public/assets/trains/`, served from
Stationsbord itself, and imported directly from the [MLGTraffic Benelux
collection](http://www.mlgtraffic.net/Coll_BNL_E.htm). No HyperRail code or assets
are used. `composition.js` contains Stationsbord's own field-based matching and
rendering; labels, seats and amenities always use the API response. M5 units
use their own drawings; M4 is retained for historical/legacy API types. OTC
services use Ouigo I11 A/B artwork and the standard I11 cab car; other services
use the standard I11 livery. Combined type names such as `I11BDXH` and M7 `BXH`
are recognized. Cab direction follows iRail's orientation while accounting for
original source filenames whose side names face the opposite way. This is
shared across AM08/75/80/86/96, AR41/MW41 and M7 motor cars through explicit
`cabFacing` metadata. Intermediate units have `cabFacing: null`; new EMU/DMU
imports must explicitly classify the cab direction before they can be imported.
Use `python scripts/import-train-artwork.py --metadata-only` to rebuild the
catalogue after reviewing direction metadata without changing PNGs. Artwork
shares a common display pixel scale, so shorter HLE locomotives are no longer
stretched to the width of a full coach. Stored PNGs retain the original pixels.

**Artwork is CC BY-NC-SA 3.0, excluded from the project's MIT licence.** Keep the
visible credits and licence links when redistributing, use the artwork only for
noncommercial purposes, and preserve the artwork licence for adaptations.
[Attribution and changes](server/src/public/assets/trains/ATTRIBUTION.md) and
[sources.json](server/src/public/assets/trains/sources.json) record provenance,
source hashes and the lossless GIF-to-PNG conversion. Re-import with
`python scripts/import-train-artwork.py` (development prerequisite: Pillow).
