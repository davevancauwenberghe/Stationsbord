# v0.9.3 — train lookup and quiet glass accents

The station board and train-number lookup are separate views. The lookup accepts
plain numbers or service codes, supports live or date/time selection, and keeps
the complete route visible with a next-stop marker. Stop names open the matching
station board. Sharing preserves the requested train, language and custom moment.

Glass accents are limited to navigation and small train actions. Timetable rows
remain opaque. The footer toggle persists locally; reduced-transparency,
increased-contrast and forced-colour preferences use solid surfaces where
supported. Browsers without backdrop-filter use the same solid fallback.

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
- Browser workflows cover number-only and prefixed searches, shared-link
  restoration, stop-to-board navigation, 404/retry, composition retry,
  discarded older requests, wrong-day rejection, invalid input, static planned
  searches and persistent/OS glass preferences. No application page/CSP errors.
- A direct iRail request for number `515`, dated 11 October 2026, returned IC515
  with ten stops and matching service-day provenance. The vehicle endpoint uses
  a date, not a time: custom time highlights the route locally. Availability
  still depends on iRail; composition is requested only for today.

No new runtime dependencies, framework, image transformations or upstream
endpoint probing were added.
