[![Tests](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/test.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/test.yml)
[![CodeQL](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml)

# Stationsbord

**It’s on the board.**

A lightweight Belgian railway timetable powered by [iRail](https://irail.be), built with Node.js, Express and plain HTML/CSS/JavaScript.

## Features

- Station arrivals and departures, live or for a chosen date/time.
- Journey planner with departure/arrival searches, transfers, walking links and train details.
- Train-number lookup by date, with stops, delays, cancellations and reported progress.
- Train compositions, seats and amenities when available.
- Favourites, shareable links, network disruptions and planned works.
- Responsive board view with fullscreen support, light/dark themes and four languages.
- Installable web app with accessible search and keyboard navigation.

Live views refresh every minute while visible. Times use Europe/Brussels; overnight journeys retain their service date. Data availability depends on iRail/NMBS.

Train times and tracks may change. Check station boards, announcements or the SNCB app before departure. Stationsbord is an independent service.

## Run locally

Requires **Node.js 22+**; Docker and CI use Node.js 24.

```sh
cp .env.example .env
cd server
npm ci
node --env-file=../.env src/index.js
```

Open **http://localhost:8080**. Set real `APP_WEBSITE` and `APP_EMAIL` contact details before production use.

## Docker

```sh
docker compose up --build -d
```

The container runs on port 8080. `fly.toml` configures Fly.io hosting.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | Listening port; default `8080` |
| `IRAIL_BASE_URL` | Upstream API; default `https://api.irail.be` |
| `IRAIL_TIMEOUT_MS` | Request timeout; default `25000` |
| `APP_NAME`, `APP_VERSION` | Application identification |
| `APP_WEBSITE`, `APP_EMAIL` | Owner contact details for iRail |
| `PUBLIC_BASE_URL` | Public origin; default `https://stationsbord.fly.dev` |

## Tests

```sh
cd server
npm ci
npm test
```

GitHub Actions runs the tests and CodeQL.

## Train illustrations

Train drawings are by **Marc Le Gad / [MLGTraffic](http://www.mlgtraffic.net/Coll_BNL_E.htm)**. The **LIMAX EMU illustrations by Dave Van Cauwenberghe** are a continuation based on MLGTraffic, stored as PNGs.

All train artwork is licensed under **[CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/)** and excluded from the code’s MIT licence. [Attribution](server/src/public/assets/trains/ATTRIBUTION.md) records the sources and adaptations.

## Licence

Project code: [MIT](LICENSE).
