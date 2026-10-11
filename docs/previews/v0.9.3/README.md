# v0.9.3 — train lookup and station typography

The station board and train-number lookup are separate views. The lookup accepts
plain train numbers such as 510, 8013 and 69, supports today or another date,
and keeps the complete route visible. Today's live lookup marks the next stop;
custom-date routes have no time-based marker. Stop names open the matching
station board, using the stop's scheduled time for custom dates. Sharing
preserves the requested number, language and date without a time parameter.
The navigation button and empty state reuse the original favicon asset.

Navigation and train actions use solid, opaque surfaces. The former effect
control, preference handling, translations and backdrop-filter styles have
been removed. Light/dark/system appearance and the forced-colour selected-state
outline remain available.

Liveboard station headings and destination/origin names use Bahnschrift when
installed, with a system sans-serif fallback otherwise. The screenshots were
captured on Linux without Bahnschrift and therefore show that fallback. Exact
cross-platform typography needs a licensed webfont or Adobe Fonts web project;
see the [typography notes](../../../README.md#station-typography).

I11 AUH and BVUH match the stored original A/B drawings. OTC services select
Ouigo A/B artwork; other services retain standard I11 artwork. The BDx cab coach
retains its standard drawing. No image pixels, licences or provenance changed.

## Screenshots

- [Train lookup, mobile](train-390-light.png)
- [Train lookup, desktop](train-1280-light.png)
- [Train lookup, dark](train-1280-dark.png)
- [Station board, mobile](station-390-light.png)
- [Station board, desktop](station-1280-light.png)

Screenshots use controlled fixture routes and formations. Their service numbers
demonstrate behavior and do not assert actual formations or live status.

## Verification

- 62 Node tests pass, including I11 aliases/liveries, number validation,
  next-stop selection, expected times, cancellations, midnight service dates,
  safe sharing metadata and all original PNG hashes.
- 48 Chromium/axe checks pass at 320/390/1280px, in NL/FR/DE/EN and light/dark,
  for both main views. No automated WCAG A/AA violations or document overflow
  were detected; this is not a full manual accessibility certification.
- Browser workflows cover plain train numbers, date-only shared-link
  restoration, stop-to-board navigation, 404/retry, composition retry,
  discarded older requests, wrong-day rejection, invalid input, static planned
  searches and persistent/system light/dark preferences. Solid navigation and
  train actions, obsolete saved preferences, blocked browser storage, and
  forced-colour selected states were checked. Numeric searches still resolve
  the correct OTC/Ouigo composition internally. No application page/CSP errors.
- A focused regression checks failed resubmissions of an already loaded lookup
  in both live and planned modes. The route and composition remain visible,
  the stale notice appears, busy state clears, and a successful retry restores
  freshness. A different lookup still clears the previous route and offers
  retry on failure. This regression fails against the original PR implementation.
- A direct iRail request for number `515`, dated 11 October 2026, returned IC515
  with ten stops and matching service-day provenance. The vehicle endpoint uses
  a date, not a time. Availability still depends on iRail; composition is
  requested only for today.

No new runtime dependencies, framework, image transformations or upstream
endpoint probing were added.
