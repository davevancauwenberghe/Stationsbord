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

The local LIMAX and AR41 continuations described below are also distributed under
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
These are a continuation based on Marc Le Gad / MLGTraffic's artwork.
`Arriva_FLIRT3_a_L.gif` from the [Arriva collection](http://www.mlgtraffic.net/NL_E_Arriva.xml)
provided an illustration-style and vehicle-appearance reference.

These drawings are **Stationsbord adaptations**, not original MLGTraffic 550
drawings. Neither Marc Le Gad, Arriva nor Stadler endorses them. They are
indicative and may differ in details from individual vehicles. Seats and
amenities remain sourced from iRail.

The three AI-generated transparent masters are retained under `limax-originals/`.
The export script trims transparent padding, scales uniformly by the blue-body
height, aligns the bottom edge and creates mirrored variants. This processing
applies only to the local set; imported MLGTraffic PNGs retain their
original pixels. Sources, hashes, creator and changes are recorded per variant
in `local-artwork.json` and merged into `sources.json`. The current production
brief is in `scripts/limax-artwork-brief.json`.

## Enhanced AR41 / MW41 trial

Created for **Stationsbord on 2026-10-14**, with AI-assisted image generation,
as a continuation based on these **Marc Le Gad / MLGTraffic** drawings:

- Mixed-class AB car: http://www.mlgtraffic.net/images/SNCB/AED/SNCB_MW41_AB_L.gif
- Second-class B car: http://www.mlgtraffic.net/images/SNCB/AED/SNCB_MW41_B_R.gif

The silver body, yellow cab, red doors, window arrangement and two conventional
bogies follow the original drawings. The enhanced versions retain the flat AR41 drawing style, with cleaner outlines
and window definition. They are indicative illustrations;
classes and amenities remain sourced from iRail.

The two transparent masters are retained under `ar41-originals/`, with generation
prompts in `scripts/ar41-artwork-prompts.json`. Packaging trims transparent
padding, uniformly fits each drawing to its original AR41 bounding box, aligns
the bottom and mirrors the opposite direction. No horizontal stretching is
applied. The original imported AR41 PNGs and their provenance remain unchanged.
The enhanced display files use separate `ar41-enhanced-*` names.

Rebuild all ten local display PNGs with:

    python scripts/export-local-train-artwork.py
    python scripts/import-train-artwork.py --metadata-only

The live composition credits Stationsbord for local continuations and retains the MLGTraffic
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
coaches. Imported artwork retains its original pixels; local export steps are
documented above. Cab orientation selects the matching
original drawing by reviewed `cabFacing` metadata for each supported EMU/DMU
cab and cab coach. AM96 BX, M4 ADx and M5 BDx have `L`/`R` filenames opposite
to their visible cab direction. Intermediate vehicles are explicitly marked
with a null cab direction. Metadata changes do not alter the original artwork. M5 is matched as M5; historical M4
records keep M4 illustrations. Only OTC services select Ouigo I11 A/B drawings;
I11 cab cars use the standard I11 BDx artwork.
