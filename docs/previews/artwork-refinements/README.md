# Composition artwork refinements

Rendered in the running Stationsbord UI using controlled composition fixtures,
plus current iRail snapshots of IC515 and IC2216. Fixture train numbers are for
validation; they do not assert the actual formation of those services.

- `ic961-desktop.png`: AM96 second- and first-class cab direction.
- `ic713-desktop.png`: common source-pixel scale for M7/HLE13, plus M7 BXH.
- `ic500-desktop.png`: original M5 first, second and cab drawings.
- `otc123-desktop.png` / `otc-cab-desktop.png`: Ouigo I11 A/B and the standard I11 cab car.
- `locomotive-mobile.png`: the same scale at 390 pixels in dark mode.

Checked source filenames, loaded images, aspect ratios, common pixel scale and
baseline alignment across seven formations. Responsive WCAG A/AA checks cover
320/390/1280 pixels, NL/EN/FR/DE, and light/dark themes. Image failures retain
an explicit fallback. Stored PNGs remain lossless conversions of the original
MLGTraffic drawings; attribution and provenance remain in the asset directory.
