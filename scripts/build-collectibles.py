#!/usr/bin/env python3
"""Builds the web-size art for the collectible items (the drinks, the bear and the three
terrain tiles). The buildings' collectible art is the My Iantopia building art
that scripts/build-tycoon-assets.py already makes.

Run from the repo root:   python3 scripts/build-collectibles.py      (needs Pillow)
"""
import os
from PIL import Image, ImageDraw, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEMS = os.path.join(ROOT, 'public', 'assets', 'items')
OUT = os.path.join(ROOT, 'public', 'assets', 'collectibles')
os.makedirs(OUT, exist_ok=True)


def trimmed(path):
    im = Image.open(path).convert('RGBA')
    box = im.split()[3].point(lambda a: 255 if a > 24 else 0).getbbox()
    return im.crop(box) if box else im


def drink(src, dest, height=300):
    im = trimmed(os.path.join(ROOT, 'art-source', 'collectibles', src))
    im.thumbnail((height, height), Image.LANCZOS)
    out = os.path.join(ITEMS, dest)
    im.save(out, optimize=True)
    print(f'  {dest:22} {im.size}  {os.path.getsize(out) / 1024:.1f} KB')


def tile(im, dest, px=192, radius=26):
    """A square tile with rounded corners, so a texture reads as a collectible object."""
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).convert('RGBA').resize((px, px), Image.LANCZOS)
    mask = Image.new('L', (px, px), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, px - 1, px - 1), radius, fill=255)
    im.putalpha(mask)
    out = os.path.join(OUT, dest)
    im.save(out, optimize=True)
    print(f'  {dest:22} {os.path.getsize(out) / 1024:.1f} KB')


print('drinks')
drink('modelo-negra.png', 'modelo-negra.png')
drink('smirnoff-ice.png', 'smirnoff-ice.png')
drink('tuff-ahh-bear.png', 'tuff-ahh-bear.png')
print('terrain tiles')
tile(Image.open(os.path.join(ROOT, 'public', 'assets', 'decorations', 'mongolia-grass-texture.jpg')), 'grass-tile.png')
road = os.path.join(ROOT, 'art-source', 'tycoon', 'road.jpg')
if os.path.exists(road):
    tile(Image.open(road), 'road-tile.png')
water = os.path.join(ROOT, 'art-source', 'tycoon', 'water.gif')
if os.path.exists(water):
    frame = [f.copy() for f in ImageSequence.Iterator(Image.open(water))][0]
    tile(frame, 'water-tile.png')
