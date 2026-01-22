[![CodeQL (Stationsbord)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/Stationsbord/actions/workflows/codeql.yml)

# Stationbord
*find it on the board*

Tiny Belgian train station departure board using iRail API.

## Notes

Sets a proper User-Agent (configure via env vars).

Uses ETag + Cache-Control to avoid excessive requests.

Includes a small in-process rate limiter to avoid spiking iRail.

---
