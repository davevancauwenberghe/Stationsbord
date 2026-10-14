# MLGTraffic and Stationsbord — Benelux train drawings

Creator and collection publisher: **Marc Le Gad / MLGTraffic**.

Original collection: http://www.mlgtraffic.net/Coll_BNL_E.htm

Collection homepage and licence notice: http://www.mlgtraffic.net/index.html

Licence: **Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported**
(CC BY-NC-SA 3.0): https://creativecommons.org/licenses/by-nc-sa/3.0/

These PNGs are third-party artwork, excluded from Stationsbord's MIT licence.
They may be shared and adapted for noncommercial purposes with appropriate
credit, a licence link, and an indication of adaptations. Adapted artwork is
released under CC BY-NC-SA 3.0. The creator does not endorse Stationsbord.

The local LIMAX adaptations described below are also distributed under
CC BY-NC-SA 3.0 and excluded from the code's MIT licence.

## Sources and changes

Initial collection downloaded directly from MLGTraffic on 2026-10-09;
M5 and Ouigo I11 A/B drawings added directly on 2026-10-10. No HyperRail files, assets,
code, mappings, or image transformations were copied into this project.

M6 A, B, BD and Bx drawings were replaced on 2026-10-14 with MLGTraffic's
refurbished `M6_RG_*` originals, including their larger pictograms. Both source
sides were imported directly. The supplied M6 ABD drawing retains its existing
original: the collection does not list a revised ABD asset. `M6 AUH` records
select the first-class A drawing. This is a representative illustration, not a
claim that the individual coach has been refurbished.

Each static GIF was converted losslessly to PNG, preserving its original
pixel dimensions, colours and transparency. No rescaling, redrawing, cropping,
flipping or visual changes were applied to the stored artwork. Both original
left and right side drawings are retained. Filename changes are recorded in
`sources.json`, alongside the exact source URL, collection page, dimensions,
and SHA-256 hashes of the source GIF and resulting PNG.

The collection homepage links to CC BY-NC-SA 3.0. Some individual collection
pages also retain an older CC BY-NC-SA 2.0 France notice; the PNG conversions
are distributed under the collection's CC BY-NC-SA 3.0 terms.

## Local LIMAX 550 adaptations

Created for **Stationsbord on 2026-10-14**, with AI-assisted image generation.
Marc Le Gad's `Arriva_FLIRT3_a_L.gif` from the [Arriva collection](http://www.mlgtraffic.net/NL_E_Arriva.xml)
provided an illustration-style and vehicle-appearance reference. A user-provided
Railer screenshot guided the three-car LIMAX layout and livery. The reference
screenshot and original MLGTraffic GIF are not redistributed here. No Railer
application files or HyperRail files/code were imported.

These drawings are **Stationsbord adaptations**, not original MLGTraffic 550
drawings. Neither Marc Le Gad, Railer, Arriva nor Stadler endorses them. They are
indicative and may differ in details from individual vehicles. Seats and
amenities remain sourced from iRail.

The three AI-generated transparent masters are retained under `limax-originals/`.
The export script trims transparent padding, scales uniformly by the blue-body
height, aligns the bottom edge and creates mirrored variants. This processing
applies only to the local LIMAX set; imported MLGTraffic PNGs retain their
original pixels. Sources, hashes, creator and changes are recorded per variant
in `local-artwork.json` and merged into `sources.json`. The prompt set is in
`scripts/limax-artwork-prompts.json`.

Rebuild these six display PNGs with:

    python scripts/export-limax-artwork.py
    python scripts/import-train-artwork.py --metadata-only

The live composition credits Stationsbord for LIMAX and retains the MLGTraffic
reference credit and CC BY-NC-SA 3.0 link.

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
original drawing by reviewed `cabFacing` metadata for each supported EMU/DMU
cab and cab coach. AM96 BX, M4 ADx and M5 BDx have `L`/`R` filenames opposite
to their visible cab direction. Intermediate vehicles are explicitly marked
with a null cab direction. Metadata changes do not alter the original artwork. M5 is matched as M5; historical M4
records keep M4 illustrations. Only OTC services select Ouigo I11 A/B drawings;
I11 cab cars use the standard I11 BDx artwork.
