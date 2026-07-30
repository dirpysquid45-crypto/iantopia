# Cursor art

Drop cursor PNGs in this folder, then register each one in
`public/cursor-library.js` and add a matching `cursor_unlock` item to
`public/case-data.js`.

## Format

- **PNG with transparency** (the canvas composites it over the page)
- **Square**, ideally **64×64** — `cursor.js` draws at 34×34, so 64px keeps it
  crisp on retina without looking soft
- Keep the visual weight near the centre; the image is drawn centred on the
  pointer, not anchored at its top-left corner

## Wiring a new cursor

1. `public/cursors/my-cursor.png`

2. `public/cursor-library.js` — the key is what gets stored in the inventory:

   ```js
   my_cursor: {
     label: 'My Cursor',
     point: '/cursors/my-cursor.png',
     interact: '/cursors/my-cursor-hover.png', // optional; falls back to point
   },
   ```

3. `public/case-data.js` — `key` must match the library key exactly, or the
   item drops but can never be equipped:

   ```js
   cur_mine: {
     label: 'Cursor: My Cursor',
     tier: 'covert',
     img: '/cursors/my-cursor.png',
     type: 'cursor_unlock',
     key: 'my_cursor',
   },
   ```

The `signal` and `vault` cases pick up new cursor items automatically — their
contents are derived from the item pool, so only `starter` needs no thought.

## Emoji cursors

A cursor doesn't need art at all. An entry with `emoji` instead of `point` is
rendered as text on the canvas:

```js
lightning: { label: 'Lightning Bolt', emoji: '⚡' },
```

## Click sounds

An entry can optionally cycle through a sequence of sounds on every click,
looping back to the start once it reaches the end:

```js
my_cursor: {
  label: 'My Cursor',
  point: '/cursors/my-cursor.png',
  clickSounds: ['/audio/sfx/my-cursor-1.mp3', '/audio/sfx/my-cursor-2.mp3'],
},
```
