# Reliability and usability review

Follow-up to v0.9.2 / PR #49.

- Station search ignores malformed catalogue entries, folds names once when building the index, ranks exact/prefix matches before substring matches, and supports words entered in a different order. Translated standard names, accents and Gent/Ghent remain supported.
- Arrow Up selects the last autocomplete suggestion when none is active; Arrow Down selects the first.
- Background board refresh restores keyboard focus to the same train service. If it disappears, focus returns to the board. Closing train details also restores focus if a refresh replaced the original button.
- A failed composition request has its own retry button. Stops remain visible and are not requested again. Closing or replacing the dialog still cancels pending requests and prevents late results from replacing the current view.
- Proxy freshness subtracts the upstream `Age` header and parses `max-age` as a complete directive, so already-aged data does not receive a new full freshness period.

Validation: 47 Node tests, including regressions for malformed station data, search ranking and upstream cache age. Browser checks cover keyboard navigation, refresh focus, composition retry, existing favourite/error flows, and responsive WCAG A/AA checks at 320, 390 and 1280 pixels in NL/EN/FR/DE and light/dark themes. Browser API responses are fixtures, not a claim about live iRail availability.
