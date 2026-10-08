[![Tests](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/test.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/test.yml)
[![CodeQL](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml)

# Stationsbord

A clear, lightweight timetable for the Belgian rail network, powered by [iRail](https://irail.be). Built with Node.js, Express and plain HTML/CSS/JavaScript.

## Using the board

1. Search for a station, or choose a popular, recent or saved station.
2. Use **Now** for a live board, or **Choose a time** for a specific date and time.
3. Switch between **Departures** and **Arrivals**. Select a train to view its stops and available carriage information.

Live boards refresh every minute while the page is visible. Planned searches stay at the selected time. All schedule times use **Europe/Brussels**, including daylight saving changes, regardless of the device’s time zone.

- Save up to eight stations using the star button. Recent and saved stations remain in your browser; no account is required.
- Share a link containing the station, arrivals/departures, language and optional date/time, using the native share sheet where supported or copying the link.
- Shared URLs include a branded image and localized station/timetable previews, available to social crawlers without JavaScript.
- View disruptions and engineering works across the rail network.
- Dutch, French, German and English interfaces.
- Choose System, Light or Dark appearance in the header. System follows your device; an explicit choice is remembered in your browser.
- A full-width station board with warm paper colours, ink-blue signage and a matching dark appearance.
- Filter the loaded trains by destination (or origin for arrivals) and train number. Filtering keeps cancelled services visible when they match.
- Use Board view to hide the search area while watching the live timetable. Press Escape outside a field to return, or use the button.
- Press `/` outside a text field to jump to station search. Keyboard station selection, native date/time pickers and accessible train-detail dialogs are supported.

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
