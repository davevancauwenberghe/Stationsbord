"""Export local MLGTraffic continuations at Stationsbord's display scale.

Development prerequisite: Pillow. Source illustrations were created with the
built-in image-generation tool; this script only packages the finished artwork.
It trims transparent padding, scales uniformly and exports both cab directions.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1] / 'server/src/public/assets/trains'
FRAME_HEIGHT = 58
BODY_HEIGHT = 36
MARGIN = 2
LICENSE = 'https://creativecommons.org/licenses/by-nc-sa/3.0/'


def blue_body_height(image):
    # Measure the solid blue body, excluding roof boxes, windows and running gear.
    # This shares a vertical scale without stretching wheels or other details.
    counts = []
    for y in range(image.height):
        count = sum(1 for r, g, b, a in
                    (image.getpixel((x, y)) for x in range(image.width))
                    if a > 128 and b > r * 1.4 and b > g * 1.12)
        counts.append(count)
    maximum = max(counts)
    if not maximum:
        raise ValueError('No blue body found')
    rows = [y for y, count in enumerate(counts) if count > maximum * 0.45]
    return rows[-1] - rows[0] + 1


def sha(data):
    return hashlib.sha256(data).hexdigest()


if __name__ == '__main__':
    catalog = {}
    drawings = [
        ('limax-a', 'limax-originals/limax-a.png', 'R', None),
        ('limax-b', 'limax-originals/limax-b.png', 'L', None),
        ('limax-c', 'limax-originals/limax-c.png', 'L', None),
        ('ar41-enhanced-first', 'ar41-originals/ar41-first.png', 'L', 'ar41-first-l.png'),
        ('ar41-enhanced-second', 'ar41-originals/ar41-second.png', 'R', 'ar41-second-r.png'),
    ]
    for key, source_path, original_direction, reference in drawings:
        source_file = ROOT / source_path
        source_bytes = source_file.read_bytes()
        with Image.open(source_file) as source:
            image = source.convert('RGBA')
        alpha = image.getchannel('A')
        bounds = alpha.point(lambda value: 255 if value > 32 else 0).getbbox()
        if not bounds or alpha.getextrema()[0] != 0:
            raise ValueError('Expected an illustration on a transparent background')
        drawing = image.crop(bounds)
        if reference:
            # Fit the original DMU's bounding box, without stretching its wheels.
            with Image.open(ROOT / reference) as original:
                bounds = original.convert('RGBA').getchannel('A').getbbox()
            reference_width = bounds[2] - bounds[0]
            reference_height = bounds[3] - bounds[1]
            scale = min(reference_width / drawing.width, reference_height / drawing.height)
            sizing = 'Uniformly fitted to the original MLGTraffic AR41 bounding box'
        else:
            scale = min(BODY_HEIGHT / blue_body_height(drawing),
                        (FRAME_HEIGHT - MARGIN * 2) / drawing.height)
            sizing = 'Uniformly scaled to a common blue-body height'
        size = (round(drawing.width * scale), round(drawing.height * scale))
        drawing = drawing.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (size[0] + MARGIN * 2, FRAME_HEIGHT))
        canvas.alpha_composite(drawing, (MARGIN, FRAME_HEIGHT - MARGIN - size[1]))
        variants = {}
        for side in ['L', 'R']:
            output = canvas if side == original_direction else ImageOps.mirror(canvas)
            filename = f'{key}-{side.lower()}.png'
            output.save(ROOT / filename, optimize=True)
            variants[side] = {
                'file': filename, 'width': output.width, 'height': output.height,
                'cabFacing': None if key == 'limax-b' else side,
                'creator': 'Stationsbord',
                'source': source_path,
                'sourceSha256': sha(source_bytes),
                'pngSha256': sha((ROOT / filename).read_bytes()),
                'license': LICENSE,
                'creation': 'AI-assisted indicative continuation based on Marc Le Gad / MLGTraffic artwork.',
                'changes': f'Transparent padding trimmed; {sizing.lower()}; bottom aligned; opposite direction mirrored.',
            }
            if reference:
                variants[side]['reference'] = reference
        catalog[key] = variants
    manifest = {
        'creator': 'Stationsbord (AI-assisted)', 'created': '2026-10-14',
        'license': LICENSE,
        'referenceCreator': 'Marc Le Gad / MLGTraffic',
        'references': [
            {'url': 'http://www.mlgtraffic.net/images/NL_P/Arriva_FLIRT3_a_L.gif',
             'collection': 'http://www.mlgtraffic.net/NL_E_Arriva.xml',
             'role': 'Illustration style and Arriva FLIRT III appearance reference'},
            {'url': 'http://www.mlgtraffic.net/images/SNCB/AED/SNCB_MW41_AB_L.gif',
             'collection': 'http://www.mlgtraffic.net/SNCB_AD.htm?lang=E',
             'role': 'AR41 mixed-class car: geometry and livery reference'},
            {'url': 'http://www.mlgtraffic.net/images/SNCB/AED/SNCB_MW41_B_R.gif',
             'collection': 'http://www.mlgtraffic.net/SNCB_AD.htm?lang=E',
             'role': 'AR41 second-class car: geometry and livery reference'},
        ],
        'artwork': catalog,
    }
    (ROOT / 'local-artwork.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Exported ten transparent LIMAX/AR41 carriage PNGs with master-source hashes.')
