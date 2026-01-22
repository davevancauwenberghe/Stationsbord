# Stationbord
## find it on the board

Tiny Belgian train station departure board using iRail API.

## Run locally

docker compose up --build
Open: http://localhost:8080

## Notes

Sets a proper User-Agent (configure via env vars).

Uses ETag + Cache-Control to avoid excessive requests.

Includes a small in-process rate limiter to avoid spiking iRail.

---
