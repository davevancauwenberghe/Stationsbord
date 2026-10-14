"""Export locally created LIMAX illustrations at Stationsbord's display scale.

Development prerequisite: Pillow. Source illustrations were created with the
built-in image-generation tool; this script only packages the finished artwork.
It trims transparent padding, scales uniformly and exports both cab directions.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1] / 'server/src/public/assets/trains'
SOURCE = ROOT / 'limax-originals'
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
    for car, original_direction in [('a', 'R'), ('b', 'L'), ('c', 'L')]:
        source_file = SOURCE / f'limax-{car}.png'
        source_bytes = source_file.read_bytes()
        with Image.open(source_file) as source:
            image = source.convert('RGBA')
        alpha = image.getchannel('A')
        bounds = alpha.point(lambda value: 255 if value > 32 else 0).getbbox()
        if not bounds or alpha.getextrema()[0] != 0:
            raise ValueError('Expected an illustration on a transparent background')
        drawing = image.crop(bounds)
        scale = min(BODY_HEIGHT / blue_body_height(drawing),
                    (FRAME_HEIGHT - MARGIN * 2) / drawing.height)
        size = (round(drawing.width * scale), round(drawing.height * scale))
        drawing = drawing.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (size[0] + MARGIN * 2, FRAME_HEIGHT))
        canvas.alpha_composite(drawing, (MARGIN, FRAME_HEIGHT - MARGIN - size[1]))
        variants = {}
        for side in ['L', 'R']:
            output = canvas if side == original_direction else ImageOps.mirror(canvas)
            filename = f'limax-{car}-{side.lower()}.png'
            output.save(ROOT / filename, optimize=True)
            variants[side] = {
                'file': filename, 'width': output.width, 'height': output.height,
                'cabFacing': None if car == 'b' else side,
                'creator': 'Stationsbord',
                'source': f'limax-originals/limax-{car}.png',
                'sourceSha256': sha(source_bytes),
                'pngSha256': sha((ROOT / filename).read_bytes()),
                'license': LICENSE,
                'creation': 'AI-assisted indicative adaptation with MLGTraffic drawing references.',
                'changes': 'Transparent padding trimmed; uniformly scaled to a common blue-body height; opposite direction mirrored.',
            }
        catalog[f'limax-{car}'] = variants
    manifest = {
        'creator': 'Stationsbord (AI-assisted)', 'created': '2026-10-14',
        'license': LICENSE,
        'referenceCreator': 'Marc Le Gad / MLGTraffic',
        'references': [
            {'url': 'http://www.mlgtraffic.net/images/NL_P/Arriva_FLIRT3_a_L.gif',
             'collection': 'http://www.mlgtraffic.net/NL_E_Arriva.xml',
             'role': 'Illustration style and Arriva FLIRT III appearance reference'},
            {'source': 'User-provided Railer screenshot of FLIRT_550_LIMAX c/b/a',
             'role': 'Three-car layout, livery and carriage details reference; screenshot is not redistributed'},
        ],
        'artwork': catalog,
    }
    (ROOT / 'local-artwork.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Exported six transparent LIMAX carriage PNGs with original-source hashes.')
