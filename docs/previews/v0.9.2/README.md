# v0.9.2 refinements

Review captures use deterministic local API fixtures, not live service data.

- [Mobile board](board-mobile.png): 390 px, Dutch, light theme; one-row favourites, correct search/time/submit order, delayed and cancelled services, and the schedule disclaimer.
- [Mobile train details](train-mobile.png): 390 px, Dutch, light theme; prominent departures, smaller arrivals, separate revised times and delays, both partial cancellation directions, and a faded departed stop.
- [Desktop train details](train-desktop.png): 1280 px, Dutch, dark theme.
- [Mobile network view](network-mobile.png): 390 px, Dutch, light theme.
- [Desktop network view](network-desktop.png): 1280 px, Dutch, dark theme; current disruptions above a separate, initially collapsed works section.

Validation: 43 Node tests; 120 responsive/accessibility checks covering board,
train details and the expanded network view in Dutch, English, French and German,
light/dark themes and widths of 320, 375, 390, 768 and 1280 px. Checks include
WCAG A/AA contrast and labels, no page/dialog overflow, a table that fills its
container and a single-row favourites strip. Browser checks also cover selecting,
editing and persisting favourites, recent stations in the combobox, planned mode,
arrival boards, works-only/stale/failed network data and unknown delays.
