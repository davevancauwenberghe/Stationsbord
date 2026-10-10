# v0.9.2 follow-up

- [Mobile board](board-mobile.png): the main page no longer contains the schedule disclaimer.
- [Mobile composition](composition-mobile.png) and [desktop composition](composition-desktop.png): the localized reminder appears beneath the train information, alongside the illustration note and credit.

The board/vehicle browser fixtures replay public responses retrieved from the
deployed Stationsbord API on 10 October 2026. Composition uses a local fixture.

Validation:

- 43 Node tests pass, including exactly one disclaimer for populated and unavailable compositions.
- 48 responsive/accessibility checks: board and train details in NL/EN/FR/DE, light/dark, at 320, 390 and 1280 px. WCAG A/AA axe checks pass, without overflow or browser errors.
- A delayed failing request reproduces the PR #48 favourite-selection review. The requested favourite is now selected before the response and remains selected after failure. Successful retry and failed refresh with retained board data also preserve selection.
- The composition reminder appears once while loading, after success, with empty data, after a composition API error and for a past service date.
- A vehicle API error displays the existing retry state; a successful retry restores the stops.

Live diagnostic results:

- Deployed vehicle endpoint: IC508 on 10 October returned HTTP 200 and 10 stops; L879 returned HTTP 200 and 6 stops. IC508 on 9 October also returned HTTP 200 and 11 stops.
- Direct iRail vehicle endpoint: IC508 on 10 October returned HTTP 200 and 10 stops, with alerts enabled.
- Both current-day payloads render successfully through the v0.9.2 stop renderer and the local browser view.
- Deployed `app.js` and `train-details.js` hashes match the merged PR #48 files.

These checks did not reproduce the reported train-detail failure. They show that
the endpoint responded for the tested services at the time of the checks; they
do not establish the cause of an earlier error or availability of every service.
