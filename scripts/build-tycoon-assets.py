#!/usr/bin/env python3
"""Builds the optimised web assets My Iantopia uses from the large source art.

The source files are huge (up to 2500x2500 / 3.6 MB) and only ever shown at a
few dozen pixels, so they are downscaled here rather than shipped as-is:

  public/tycoon/icons/<key>.png   128px menu/row icon for each building
  public/tycoon/art/<key>.png     256px card art for the buildings that have no
                                  existing /tycoon/*.png (crate reveal + shop)
  public/tycoon/road.jpg          256px seamless cobblestone texture
  public/tycoon/water.jpg         horizontal sheet of the animated water frames

Run from the repo root:   python3 scripts/build-tycoon-assets.py
Needs Pillow. The large originals are deliberately NOT committed; this script
reads them from art-source/tycoon/ (new art) and public/tycoon (existing art).
"""
import os
import sys
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'tycoon')   # the large originals (not committed)
OUT = os.path.join(ROOT, 'public', 'tycoon')
ICON_DIR = os.path.join(OUT, 'icons')
ART_DIR = os.path.join(OUT, 'art')
ICON_PX = 128
ART_PX = 256
# Only the new buildings need card art; the original five keep their existing files.
ART_KEYS = {'seven_eleven', 'bank', 'office_building', 'sweatshop', 'factory', 'coal_plant', 'nuclear_plant'}

# key -> source file (relative to the repo root). The first five are the
# earlier art kept under public/tycoon; the rest are the large originals.
ICONS = {
    'shabby_apartment':   'public/tycoon/shabby-apartment.png',
    'generic_building':   'public/tycoon/generic-building.png',
    'pagoda':             'public/tycoon/pagoda.png',
    'generic_skyscraper': 'public/tycoon/skyscraper.png',
    'taipei_101':         'public/tycoon/taipei-101.png',
    'bank':               'art-source/tycoon/bank.png',
    'seven_eleven':       'art-source/tycoon/seven-eleven.png',
    'office_building':    'art-source/tycoon/office-building.png',
    'sweatshop':          'art-source/tycoon/sweatshop.png',
    'factory':            'art-source/tycoon/factory.png',
    'coal_plant':         'art-source/tycoon/coal-plant.png',
    'nuclear_plant':      'art-source/tycoon/nuclear-plant.png',
}


def kb(path):
    return os.path.getsize(path) / 1024


# Sources whose "transparent" background is really an opaque white/grey
# checkerboard (a screenshot of a transparency grid). Flood-filled from the
# border so only background connected to the edge goes, never white on the
# building itself.
CHECKER_BG = {'seven_eleven'}


def strip_checker(im):
    w, h = im.size
    px = im.load()

    def is_bg(p):
        return p[3] > 0 and p[0] >= 222 and abs(p[0] - p[1]) <= 5 and abs(p[1] - p[2]) <= 5

    seen = bytearray(w * h)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i] or not is_bg(px[x, y]):
            continue
        seen[i] = 1
        px[x, y] = (0, 0, 0, 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    return im


def build_icon(key, src):
    path = os.path.join(ROOT, src)
    if not os.path.exists(path):
        print(f'  ! missing {src}, skipped')
        return
    im = Image.open(path).convert('RGBA')
    if key in CHECKER_BG:
        im = strip_checker(im)
    # Crop to the solid part of the picture. A threshold (not getbbox on any
    # non-zero alpha) so faint specks around the edge don't keep the whole
    # canvas, which is what left some of these as tiny figures in a big frame.
    solid = im.split()[3].point(lambda a: 255 if a > 128 else 0)
    box = solid.getbbox()
    if box:
        im = im.crop(box)
    if key in ART_KEYS:
        big = im.copy()
        big.thumbnail((ART_PX, ART_PX), Image.LANCZOS)
        big.save(os.path.join(ART_DIR, key + '.png'), optimize=True)
    im.thumbnail((ICON_PX, ICON_PX), Image.LANCZOS)
    out = os.path.join(ICON_DIR, key + '.png')
    im.save(out, optimize=True)
    print(f'  {key:20} {os.path.getsize(path)/1024:7.0f} KB -> {kb(out):5.1f} KB  {im.size}')


def build_road():
    src = os.path.join(SRC, 'road.jpg')
    if not os.path.exists(src):
        print('  ! art-source/tycoon/road.jpg missing, skipped')
        return
    im = Image.open(src).convert('RGB').resize((256, 256), Image.LANCZOS)
    out = os.path.join(OUT, 'road.jpg')
    im.save(out, quality=80, optimize=True, progressive=True)
    print(f'  road.jpg            {kb(src):7.0f} KB -> {kb(out):5.1f} KB')


def build_water():
    src = os.path.join(SRC, 'water.gif')
    if not os.path.exists(src):
        print('  ! art-source/tycoon/water.gif missing, skipped')
        return
    gif = Image.open(src)
    frames = [f.convert('RGB').resize((96, 96), Image.LANCZOS) for f in ImageSequence.Iterator(gif)]
    sheet = Image.new('RGB', (96 * len(frames), 96))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * 96, 0))
    out = os.path.join(OUT, 'water.jpg')
    sheet.save(out, quality=78, optimize=True)
    print(f'  water.jpg           {kb(src):7.0f} KB -> {kb(out):5.1f} KB  ({len(frames)} frames of 96px)')


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    os.makedirs(ART_DIR, exist_ok=True)
    print('building icons')
    for key, src in ICONS.items():
        build_icon(key, src)
    print('textures')
    build_road()
    build_water()
    print('done')


if __name__ == '__main__':
    sys.exit(main())
