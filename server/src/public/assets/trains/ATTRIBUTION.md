# MLGTraffic — Benelux train drawings

Creator and collection publisher: **Marc Le Gad / MLGTraffic**.

Original collection: http://www.mlgtraffic.net/Coll_BNL_E.htm

Collection homepage and licence notice: http://www.mlgtraffic.net/index.html

Licence: **Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported**
(CC BY-NC-SA 3.0): https://creativecommons.org/licenses/by-nc-sa/3.0/

These PNGs are third-party artwork, excluded from Stationsbord's MIT licence.
They may be shared and adapted for noncommercial purposes with appropriate
credit, a licence link, and an indication of adaptations. Adapted artwork is
released under CC BY-NC-SA 3.0. The creator does not endorse Stationsbord.

## Sources and changes

Initial collection downloaded directly from MLGTraffic on 2026-10-09;
M5 and Ouigo I11 A/B drawings added directly on 2026-10-10. No HyperRail files, assets,
code, mappings, or image transformations were copied into this project.

Each static GIF was converted losslessly to PNG, preserving its original
pixel dimensions, colours and transparency. No rescaling, redrawing, cropping,
flipping or visual changes were applied to the stored artwork. Both original
left and right side drawings are retained. Filename changes are recorded in
`sources.json`, alongside the exact source URL, collection page, dimensions,
and SHA-256 hashes of the source GIF and resulting PNG.

The collection homepage links to CC BY-NC-SA 3.0. Some individual collection
pages also retain an older CC BY-NC-SA 2.0 France notice; the PNG conversions
are distributed under the collection's CC BY-NC-SA 3.0 terms.

Reproduce the import from the repository root with:

    python -m pip install Pillow
    python scripts/import-train-artwork.py

Pillow is needed only for this development task. The running website uses the
committed PNGs and never requests images from MLGTraffic or another application.

## Representation

Artwork depicts representative rolling-stock types, not a guarantee of the
actual vehicle's livery, orientation or platform position. Seat counts and
amenities come from iRail/NMBS data, not from the drawings. Unknown types keep
their textual information and display an explicit illustration fallback.

Display sizing uses a common source-pixel scale for locomotives, EMUs and
coaches. The stored artwork is unchanged. Cab orientation selects the matching
original drawing, including AM96 BX and M5 BDx whose `L`/`R` filenames are
opposite to the visible cab direction. M5 is matched as M5; historical M4
records keep M4 illustrations. Only OTC services select Ouigo I11 A/B drawings;
I11 cab cars use the standard I11 BDx artwork.
