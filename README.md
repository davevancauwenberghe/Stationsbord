[![CodeQL (Stationsbord)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/2dnur.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

# Stationbord
*find it on the board*

Tiny Belgian train station departure board using iRail API.

## Notes

Sets a proper User-Agent (configure via env vars).

Uses ETag + Cache-Control to avoid excessive requests.

Includes a small in-process rate limiter to avoid spiking iRail.

---
