# v0.9.4 — train progress and dated formations

Both detail views show stop-based train progress. Board details distinguish the
selected station from the latest reported stop. Timetable forecasts are labelled
as estimates; stale/failed/offline results do not keep a live marker. Network
notices are expandable and separated from train-specific messages and works.

Carriage information uses the selected service date, including tomorrow and
overnight services. Train headings display the resolved type. Complete numbered
EMU/DMU sets orient their end cabs outward; uncertain formations keep upstream
direction. I10 VUH/BVUH uses the original second-class drawing.

The navigation icon uses only the train drawing from the favicon and follows
the button's current text colour. Both empty states share the same structure.
The page expands to 1920px; at 1440px and above the route and formation share a
row, and board details use a wider dialog. No glass effects were reintroduced.

## Previews

- [Live detail, selected/reported station and network notices](detail-1920-light.png)
- [Train lookup, mobile](train-390-light.png)
- [Train lookup, wide](train-1920-light.png)
- [Train lookup, wide dark](train-1920-dark.png)
- [Station board, mobile](station-390-light.png)
- [Station board, wide](station-1920-light.png)

Screenshots use controlled fixture data and a fixed clock. They demonstrate UI
behavior rather than actual formations, incidents or train locations. Bahnschrift
is not installed on the Linux screenshot host, so its system fallback is shown.

## Verification

- 74 Node tests pass, including progress freshness/estimates, separate selected
  and reported markers, cancellations, overnight activity, safe text, numbered
  cab groups, I10 aliases, typed headings, dated proxy validation/cache separation
  and all existing PNG provenance hashes.
- 96 Chromium/axe checks at 320/390/1280/1440/1920/2560px, NL/FR/DE/EN, both views
  and light/dark: no automated WCAG A/AA violations, document overflow or
  application/CSP errors. This is not a full accessibility certification.
- Workflows cover lookup/sharing, future-date formations, selected-station live
  dialog refresh, retained formations and retries, stale/offline progress,
  consistent empty states, system/persistent/cross-tab themes, blocked storage,
  forced colours and existing I11 livery and request-race behavior.
- A focused regression covers an unavailable formation followed by a failed
  resubmission: the formation retry remains visible and works with the current
  request context, rather than reverting to a permanent loading state.
- Overnight browser checks verify bounded previous-day lookup, correct service
  date, I10 artwork, next-day cache/formation rollover and not-found handling.
- Mobile lookup, wide dark lookup and wide board dialog visually inspected.

[Upstream data review and GTFS suitability](../../technical/v0.9.4-data.md).
