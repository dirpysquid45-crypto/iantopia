#!/usr/bin/env python3
"""Builds the optimised web assets My Iantopia uses from the large source art.

The source files are huge (up to 2500x2500 / 3.6 MB) and only ever shown at a
few dozen pixels, so they are downscaled here rather than shipped as-is:

  public/tycoon/icons/<key>.png   128px menu/row icon for each building
  public/tycoon/road.jpg          256px seamless cobblestone texture
  public/tycoon/water.jpg         horizontal sheet of the animated water frames

Run from the repo root:   python3 scripts/build-tycoon-assets.py
Needs Pillow. The large originals are deliberately NOT committed; this script
reads them from the repo root (new art) and public/tycoon (existing art).
"""
import os
import sys
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'tycoon')
ICON_DIR = os.path.join(OUT, 'icons')
ICON_PX = 128

# key -> source file (relative to the repo root)
ICONS = {
    'shabby_apartment':   'public/tycoon/shabby-apartment.png',
    'generic_building':   'public/tycoon/generic-building.png',
    'pagoda':             'public/tycoon/pagoda.png',
    'generic_skyscraper': 'public/tycoon/skyscraper.png',
    'taipei_101':         'public/tycoon/taipei-101.png',
    'office_building':    'Office Building.png',
    'sweatshop':          'Sweatshop.png',
    'factory':            'Factory.png',
    'coal_plant':         'Coal_Plant.png',
    'nuclear_plant':      'Nuclear-Plant.png',
}


def kb(path):
    return os.path.getsize(path) / 1024


def build_icon(key, src):
    path = os.path.join(ROOT, src)
    if not os.path.exists(path):
        print(f'  ! missing {src}, skipped')
        return
    im = Image.open(path).convert('RGBA')
    # Crop to the solid part of the picture. A threshold (not getbbox on any
    # non-zero alpha) so faint specks around the edge don't keep the whole
    # canvas, which is what left some of these as tiny figures in a big frame.
    solid = im.split()[3].point(lambda a: 255 if a > 128 else 0)
    box = solid.getbbox()
    if box:
        im = im.crop(box)
    im.thumbnail((ICON_PX, ICON_PX), Image.LANCZOS)
    out = os.path.join(ICON_DIR, key + '.png')
    im.save(out, optimize=True)
    print(f'  {key:20} {os.path.getsize(path)/1024:7.0f} KB -> {kb(out):5.1f} KB  {im.size}')


def build_road():
    src = os.path.join(ROOT, 'Road.jpg')
    if not os.path.exists(src):
        print('  ! Road.jpg missing, skipped')
        return
    im = Image.open(src).convert('RGB').resize((256, 256), Image.LANCZOS)
    out = os.path.join(OUT, 'road.jpg')
    im.save(out, quality=80, optimize=True, progressive=True)
    print(f'  road.jpg            {kb(src):7.0f} KB -> {kb(out):5.1f} KB')


def build_water():
    src = os.path.join(ROOT, 'Water-gif.gif')
    if not os.path.exists(src):
        print('  ! Water-gif.gif missing, skipped')
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
    print('building icons')
    for key, src in ICONS.items():
        build_icon(key, src)
    print('textures')
    build_road()
    build_water()
    print('done')


if __name__ == '__main__':
    sys.exit(main())
