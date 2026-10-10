"""Import a curated set of original MLGTraffic GIFs as lossless PNGs.

Development only: python -m pip install Pillow; python scripts/import-train-artwork.py
No HyperRail files, code or assets are used. Source URLs come from MLGTraffic's
SNCB_AE, SNCB_AD, SNCB_VM, SNCB_VI and SNCB_LE collection pages.
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'server/src/public/assets/trains'
BASE = 'http://www.mlgtraffic.net/'
# id: (original path without side/extension, collection page)
SOURCES = {}
def add(ids, directory, page):
    for key, name in ids.items():
        SOURCES[key] = (f'images/SNCB/{directory}/SNCB_{name}', page)

add({'am08-a':'AM08_a','am08-dc-b':'AM08_0_b','am08-dc-c':'AM08_0_c',
     'am08-ac-b':'AM08_5_b','am08-ac-c':'AM08_5_c',
     'am96-first':'AM96_AX','am96-second':'AM96_BX',
     'am96-dc-middle':'AM96_BMONO','am96-ac-middle':'AM96_BBic',
     'am80-first':'AM80_ABDx_B','am80-middle':'AM80_B_B','am80-second':'AM80_Bx_B',
     'am75-first':'AM75_RxA_B','am75-second':'AM75_RxB_B',
     'am75-middle-b':'AM75_M1_B','am75-middle-c':'AM75_M2_B',
     'am86-motor':'AM86_M_B','am86-trailer':'AM86_R_B',
     'm7-motor':'76000'},'AED','SNCB_AE.htm')
add({'ar41-first':'MW41_AB','ar41-second':'MW41_B'},'AED','SNCB_AD.htm')
add({'m4-first':'M4_B_A','m4-second':'M4_B_B','m4-luggage-first':'M4_B_AD',
     'm4-luggage-second':'M4_B_BD','m4-cab':'M4_B_ADx',
     'm5-first':'M5_B_A','m5-second':'M5_B_B','m5-cab':'M5_B_BDx',
     'm6-first':'M6_A','m6-second':'M6_B','m6-luggage-mixed':'M6_ABD',
     'm6-luggage-second':'M6_BD','m6-cab':'M6_Bx',
     'm7-mixed':'M7_AB','m7-second':'M7_B','m7-luggage':'M7_BD','m7-cab':'M7_BDx'},'V','SNCB_VM.htm')
add({'i6-first':'I6_B2_A','i6-second':'I6_B2_B',
     'i10-first':'I10_B_A','i10-second':'I10_B_B',
     'i11-first':'I11_A','i11-second':'I11_B','i11-cab':'I11_BDx',
     'i11-ouigo-first':'I11_A_Ouigo','i11-ouigo-second':'I11_B_Ouigo'},'V','SNCB_VI.htm')
add({'hle13':'HLE13','hle18':'HLE18II','hle21':'HLE21_U',
     'hle27':'HLE27_U','hle28':'HLE28Traxx'},'LE','SNCB_LE.htm')

# Visually reviewed direction of the cab in each original _L drawing.
# None explicitly identifies intermediate vehicles without a cab. Source-side
# names are not cab-direction guarantees (AM96 BX, M4 ADx and M5 BDx reverse).
CAB_FACING_L = {
    'am08-a': 'L', 'am08-dc-b': None, 'am08-dc-c': 'L',
    'am08-ac-b': None, 'am08-ac-c': 'L',
    'am75-first': 'L', 'am75-second': 'L',
    'am75-middle-b': None, 'am75-middle-c': None,
    'am80-first': 'L', 'am80-middle': None, 'am80-second': 'L',
    'am86-motor': 'L', 'am86-trailer': 'L',
    'am96-first': 'L', 'am96-second': 'R',
    'am96-dc-middle': None, 'am96-ac-middle': None,
    'ar41-first': 'L', 'ar41-second': 'L',
    'm7-motor': 'L',
    'm4-cab': 'R', 'm5-cab': 'R', 'm6-cab': 'L',
    'm7-cab': 'L', 'i11-cab': 'L',
}

def cab_facing(key, side):
    multiple_unit = key.startswith(('am', 'ar')) or SOURCES.get(key, ('', ''))[1] in ('SNCB_AE.htm', 'SNCB_AD.htm')
    if multiple_unit and key not in CAB_FACING_L:
        raise ValueError('Declare reviewed cab direction (or None for an intermediate unit): ' + key)
    facing = CAB_FACING_L.get(key)
    return facing if side == 'L' or facing is None else {'L': 'R', 'R': 'L'}[facing]

def import_side(item):
    key, (path, page), side = item
    url = BASE + path + '_' + side + '.gif'
    request = urllib.request.Request(url, headers={'User-Agent':'Stationsbord-artwork-import/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        original = response.read()
    with Image.open(io.BytesIO(original)) as image:
        if getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Animated source: ' + url)
        # Format conversion only: preserve original size, colours and transparency.
        png = io.BytesIO()
        image.convert('RGBA').save(png, format='PNG', optimize=True)
        width, height = image.size
    name = f'{key}-{side.lower()}.png'
    converted = png.getvalue()
    (ROOT / name).write_bytes(converted)
    return key, side, {'file':name, 'width':width, 'height':height,
                      'source':url, 'collection':BASE+page+'?lang=E',
                      'sourceSha256':hashlib.sha256(original).hexdigest(),
                      'pngSha256':hashlib.sha256(converted).hexdigest()}

if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', choices=sorted(SOURCES),
                        help='Import selected drawings and retain existing provenance.')
    parser.add_argument('--metadata-only', action='store_true',
                        help='Rebuild orientation metadata/catalogue without downloading or changing PNGs.')
    args = parser.parse_args()
    if args.only and args.metadata_only:
        parser.error('--only and --metadata-only cannot be combined')
    existing = ROOT / 'sources.json'
    if args.metadata_only and not existing.exists():
        parser.error('--metadata-only requires the existing sources.json')
    catalog = json.loads(existing.read_text())['artwork'] if (args.only or args.metadata_only) and existing.exists() else {}
    selected = {key: value for key, value in SOURCES.items() if not args.only or key in args.only}
    # Check all multiple-unit source entries before any download starts.
    for key in SOURCES:
        cab_facing(key, 'L')
    jobs = [] if args.metadata_only else [(key, value, side) for key, value in selected.items() for side in ['L','R']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for key, side, entry in executor.map(import_side, jobs):
            catalog.setdefault(key,{})[side] = entry
    catalog = dict(sorted(catalog.items()))
    for key, sides in catalog.items():
        for side, entry in sides.items():
            entry['cabFacing'] = cab_facing(key, side)
    manifest = {'creator':'Marc Le Gad / MLGTraffic',
                'collection':BASE+'Coll_BNL_E.htm',
                'license':'https://creativecommons.org/licenses/by-nc-sa/3.0/',
                'changes':'Lossless GIF to PNG conversion only; original dimensions and colours retained.',
                'artwork':catalog}
    (ROOT/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
    display = {key:{side:{k:entry[k] for k in ['file','width','height','cabFacing']}
                        for side,entry in sides.items()} for key,sides in catalog.items()}
    (ROOT/'catalog.js').write_text('// Generated by scripts/import-train-artwork.py. Artwork: MLGTraffic, CC BY-NC-SA 3.0.\nexport const artwork = '+json.dumps(display,indent=2)+';\n')
    # Equal source pixels have equal displayed sizes, including shorter locomotives.
    # Width selectors avoid inline styles, keeping the site's strict CSP intact.
    reference_width = max(entry['width'] for sides in catalog.values() for entry in sides.values())
    widths = sorted({entry['width'] for sides in catalog.values() for entry in sides.values()})
    css = '/* Generated by scripts/import-train-artwork.py. Common artwork pixel scale. */\n'
    css += ''.join(f'.carriage-image img[width="{width}"] {{ width: {100 * width / reference_width:.6f}%; }}\n'
                   for width in widths)
    (ROOT/'scales.css').write_text(css)
    if args.metadata_only:
        print(f'Rebuilt cab metadata for {len(catalog)} drawings; PNG files unchanged.')
    else:
        print(f'Imported {len(jobs)} PNGs directly from MLGTraffic ({len(catalog)} drawings).')
