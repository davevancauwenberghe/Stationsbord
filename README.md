[![CodeQL (Stationsbord)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/2dnur.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

# Stationbord
*find it on the board*

A tiny, self-hosted Belgian train station departure board powered by the **iRail API**.

Designed to be lightweight, fast, and polite to upstream services. Perfect for dashboards, wall displays, or running in a small container on a VPS or Raspberry Pi.

---

## Features

- 🚆 Real-time Belgian train departures via iRail  
- 🪶 Minimal footprint (no heavy frameworks)  
- ⚡ HTTP caching using **ETag** and **Cache-Control**  
- 🛡️ Built-in rate limiting to prevent API abuse
- 🐳 Docker-friendly

---

## Notes

- Sets a proper **User-Agent** (configurable via environment variables)
- Uses **ETag + Cache-Control** headers to avoid excessive requests
- Includes a small in-process rate limiter to avoid spiking iRail
- Intended for personal or small-scale use

---

## Tech

- Node.js
- iRail API
- Plain HTML + CSS frontend
- Optional Docker setup

---