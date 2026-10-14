# Train artwork attribution

Original drawings: **Marc Le Gad / MLGTraffic**.
Collection: http://www.mlgtraffic.net/Coll_BNL_E.htm
Homepage and licence notice: http://www.mlgtraffic.net/index.html

All train artwork is distributed under **[CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/)**, excluded from Stationsbord’s MIT licence. Redistribution and adaptations require credit, a licence link, noncommercial use and the same artwork licence. The original creator does not endorse Stationsbord.

## Imported MLGTraffic drawings

Original GIFs are converted losslessly to PNG without changing their dimensions, colours or transparency. Both original sides are retained. `sources.json` records source URLs, collection pages and source/PNG SHA-256 hashes.

The original collection was imported on 2026-10-09; M5 and Ouigo I11 drawings were added on 2026-10-10. Revised M6 A/B/BD/Bx drawings were imported on 2026-10-14; ABD retains the supplied original. AR41 uses the original MLGTraffic MW41 AB/B drawings. No HyperRail code or assets are used.

The collection homepage links to CC BY-NC-SA 3.0; some individual pages retain an older CC BY-NC-SA 2.0 France notice. These conversions use the collection’s CC BY-NC-SA 3.0 terms.

## LIMAX EMU continuation

Artwork credit: **Dave Van Cauwenberghe / Stationsbord**, based on Marc Le Gad / MLGTraffic’s `Arriva_FLIRT3_a_L.gif` ([Arriva collection](http://www.mlgtraffic.net/NL_E_Arriva.xml)).

Created on 2026-10-14 with AI-assisted image generation. These are indicative adaptations, not original MLGTraffic LIMAX drawings. The three transparent PNG masters are retained in `limax-originals/`. Display export trims transparent padding, scales uniformly, aligns the bottom and mirrors the opposite direction. `local-artwork.json` records creator, references, processing and hashes.

## Train-asset maintenance

Development prerequisite: Pillow. From the repository root:

```sh
python scripts/import-train-artwork.py
python scripts/export-limax-artwork.py
python scripts/import-train-artwork.py --metadata-only
```

The website serves the committed PNGs locally. Illustrations are representative; actual livery, order and orientation may differ. Seats and amenities come from iRail.
