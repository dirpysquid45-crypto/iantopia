// desktop-items.js
// Movable "toys" that appear loose on the homepage — draggable PNGs you can
// drag around the page and drop back onto the inventory chest to put away.
// Everything draggable is case loot: any CASE_ITEMS entry with
// `draggable: true` (Stinky Ian Sock, the Display Shelf, etc.) — only
// present once actually won from a case. `size` on a CASE_ITEMS entry is an
// optional custom render width in px (default: 56); height follows the
// image's own aspect ratio.
//
// STATIC_ITEMS is kept as an (empty) extension point for anything that
// should ever need to be free/always-on again without unlocking — nothing
// currently uses it.
//
// Requires case-data.js (for CASE_ITEMS art/labels) to be loaded first.
// Exposes window.DesktopItems.
(function () {
  const INV_KEY = 'strubles_inventory_v1';
  const PLACED_KEY = 'desktop_items_v1';
  // Ids ever auto-placed at least once. Stashing an item in the chest removes
  // it from PLACED_KEY but leaves it here, so it stays put away instead of
  // reappearing on the next render — only a brand-new item gets auto-placed.
  const SEEN_KEY = 'desktop_items_seen_v1';
  const CHEST_PROXIMITY_PX = 70;

  const STATIC_ITEMS = {};

  // Mirrors lootbox.js's own type -> inventory bucket mapping. A draggable
  // item can be ANY collectible type (mini_trophy is a badge, sock is a
  // plain item, etc.) — ownership has to be checked in the bucket that
  // type actually lives in, not hardcoded to a single one.
  const BUCKET = {
    item: 'items',
    badge: 'badges',
    powerup: 'powerups',
    sfx: 'sfx',
    theme: 'themes',
    music_unlock: 'tracks',
    background_unlock: 'backgrounds',
    cursor_unlock: 'cursors',
  };

  function loadJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function saveJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }

  // Looks up an item's render data regardless of which registry it lives in.
  function findItem(id) {
    return STATIC_ITEMS[id] || (window.CASE_ITEMS || {})[id];
  }

  // Every draggable id currently available: case loot actually owned (in
  // whichever inventory bucket its type lives in), plus the always-on
  // static decorations (nothing to "own" for those).
  function draggableOwnedIds() {
    const inv = loadJSON(INV_KEY, {});
    const items = window.CASE_ITEMS || {};
    const lootIds = Object.keys(items).filter((id) => {
      const item = items[id];
      if (!item || !item.draggable || !item.img) return false;
      const bucket = BUCKET[item.type];
      const key = item.key || id;
      return bucket && Array.isArray(inv[bucket]) && inv[bucket].includes(key);
    });
    return Object.keys(STATIC_ITEMS).concat(lootIds);
  }

  // { [id]: {xPct, yPct} } — only items currently loose on the desktop.
  // Anything owned but absent here is considered "put away" in the chest.
  function getPlaced() {
    return loadJSON(PLACED_KEY, {});
  }
  function savePlaced(placed) {
    saveJSON(PLACED_KEY, placed);
    // Previously dispatched nothing at all, so dragging/taking-out/stashing
    // an item had no path to the cloud faster than the 15s periodic sync —
    // see cloud-sync.js's SYNC_EVENTS.
    try { window.dispatchEvent(new Event('desktop-items:changed')); } catch {}
  }
  function getSeen() {
    return loadJSON(SEEN_KEY, []);
  }
  function saveSeen(seen) {
    saveJSON(SEEN_KEY, seen);
  }

  function randomSpot(index) {
    // Spread new arrivals out instead of stacking them on one spot.
    const x = 20 + ((index * 137) % 55);
    const y = 30 + ((index * 89) % 45);
    return { xPct: x, yPct: y };
  }

  function init(desktopEl, chestEl) {
    if (!desktopEl || !chestEl) return;

    // Multi-select: shift-click toggles an item in/out of `selected`; dragging
    // any selected item (when 2+ are selected) moves the whole group together.
    // Ephemeral (not persisted) — a fresh page load always starts deselected.
    const selected = new Set();
    let elementsById = {}; // id -> { wrap, el } for the items currently rendered

    function setSelected(id, on) {
      if (on) selected.add(id); else selected.delete(id);
      const entry = elementsById[id];
      if (entry) entry.wrap.classList.toggle('selected', on);
    }
    function clearSelection() {
      selected.forEach((id) => setSelected(id, false));
    }

    // Reconciles `placed` against what's actually owned: drops anything no
    // longer owned, and auto-places anything owned for the first time ever
    // (a newly-won item, or one won on another page/session entirely) —
    // but never re-places something that was deliberately stashed.
    function syncPlaced(owned) {
      const placed = getPlaced();
      const seen = getSeen();
      let placedChanged = false;
      let seenChanged = false;

      Object.keys(placed).forEach((id) => {
        if (!owned.includes(id)) { delete placed[id]; placedChanged = true; }
      });
      owned.forEach((id, i) => {
        if (!seen.includes(id)) {
          placed[id] = randomSpot(i);
          seen.push(id);
          placedChanged = true;
          seenChanged = true;
        }
      });

      if (placedChanged) savePlaced(placed);
      if (seenChanged) saveSeen(seen);
      return placed;
    }

    // Stashes an item back into the chest — shared by the drag-onto-chest
    // gesture and the explicit [x] remove button, so both paths animate and
    // persist identically.
    function stashItem(id, el) {
      const placed = getPlaced();
      delete placed[id];
      savePlaced(placed);
      selected.delete(id);
      el.classList.add('stashing');
      setTimeout(() => render(), 180);
    }

    function render() {
      const owned = draggableOwnedIds();
      const placed = syncPlaced(owned);
      elementsById = {};

      desktopEl.innerHTML = '';
      owned.forEach((id, i) => {
        if (!(id in placed)) return; // owned but stashed in the chest
        const def = findItem(id);
        if (!def) return;
        const spot = placed[id] || randomSpot(i);

        // The wrap is the thing that's actually positioned (fixed, shrink-to-fit
        // around the image) so the remove button can sit at a fixed corner
        // offset without its own geometry fighting the drag math on the image.
        const wrap = document.createElement('div');
        wrap.className = 'desktop-item-wrap' + (selected.has(id) ? ' selected' : '');
        wrap.style.left = spot.xPct + 'vw';
        wrap.style.top = spot.yPct + 'vh';
        wrap.dataset.itemId = id;

        const el = document.createElement('img');
        el.src = def.img;
        el.alt = def.label;
        el.title = def.label;
        el.className = 'desktop-item' + (def.pixelated ? ' pixel-art' : '');
        if (def.size) {
          // Custom footprint (e.g. the shelf) — width fixed, height follows
          // the image's natural aspect ratio instead of being forced square.
          el.style.width = def.size + 'px';
          el.style.height = 'auto';
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'desktop-item-remove';
        removeBtn.title = 'Remove from desktop';
        removeBtn.setAttribute('aria-label', `Remove ${def.label} from desktop`);
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          stashItem(id, el);
        });

        wrap.appendChild(el);
        wrap.appendChild(removeBtn);
        desktopEl.appendChild(wrap);
        elementsById[id] = { wrap, el };
        wireDrag(wrap, el, id);
      });
    }

    // A pointerdown that never moves past this many px is treated as a click
    // (selection toggle) rather than a drag, so shift-click can select
    // without nudging the item.
    const CLICK_MOVE_THRESHOLD = 4;

    function wireDrag(wrap, el, id) {
      let dragging = false;
      let hasMoved = false;
      let startClientX = 0, startClientY = 0;
      let shiftHeld = false;
      // groupStarts: id -> { wrap, startLeftPx, startTopPx } for every item
      // moving together in this drag (just this one, unless it's part of an
      // active multi-selection).
      let groupStarts = {};

      const onPointerDown = (e) => {
        dragging = true;
        hasMoved = false;
        shiftHeld = e.shiftKey;
        startClientX = e.clientX;
        startClientY = e.clientY;
        el.setPointerCapture(e.pointerId);

        const groupIds = (selected.has(id) && selected.size > 1) ? Array.from(selected) : [id];
        groupStarts = {};
        groupIds.forEach((gid) => {
          const entry = elementsById[gid];
          if (!entry) return;
          const rect = entry.wrap.getBoundingClientRect();
          groupStarts[gid] = { wrap: entry.wrap, el: entry.el, startLeftPx: rect.left, startTopPx: rect.top };
        });

        e.preventDefault();
      };

      const onPointerMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startClientX;
        const dy = e.clientY - startClientY;

        if (!hasMoved && Math.hypot(dx, dy) < CLICK_MOVE_THRESHOLD) return;
        if (!hasMoved) {
          hasMoved = true;
          Object.values(groupStarts).forEach(({ wrap: w, el: e2 }) => {
            e2.classList.add('dragging');
            w.style.zIndex = '21';
          });
        }

        Object.values(groupStarts).forEach(({ wrap: w, startLeftPx, startTopPx }) => {
          const x = startLeftPx + dx;
          const y = startTopPx + dy;
          w.style.left = (x / window.innerWidth * 100) + 'vw';
          w.style.top = (y / window.innerHeight * 100) + 'vh';
        });

        const chestRect = chestEl.getBoundingClientRect();
        const chestCx = chestRect.left + chestRect.width / 2;
        const chestCy = chestRect.top + chestRect.height / 2;
        const dist = Math.hypot(e.clientX - chestCx, e.clientY - chestCy);
        chestEl.classList.toggle('drag-near', dist < CHEST_PROXIMITY_PX);
      };

      const onPointerUp = (e) => {
        if (!dragging) return;
        dragging = false;
        chestEl.classList.remove('drag-near');

        if (!hasMoved) {
          // A plain click, not a drag — toggle/replace selection instead of
          // moving anything.
          if (shiftHeld) {
            setSelected(id, !selected.has(id));
          } else {
            const soleSelection = selected.size === 1 && selected.has(id);
            clearSelection();
            if (!soleSelection) setSelected(id, true);
          }
          return;
        }

        Object.values(groupStarts).forEach(({ wrap: w, el: e2 }) => {
          e2.classList.remove('dragging');
          w.style.zIndex = '';
        });

        const chestRect = chestEl.getBoundingClientRect();
        const chestCx = chestRect.left + chestRect.width / 2;
        const chestCy = chestRect.top + chestRect.height / 2;
        const dist = Math.hypot(e.clientX - chestCx, e.clientY - chestCy);

        if (dist < CHEST_PROXIMITY_PX) {
          // Dropped the group on the chest — stash all of them.
          Object.keys(groupStarts).forEach((gid) => stashItem(gid, groupStarts[gid].el));
        } else {
          const placed = getPlaced();
          Object.entries(groupStarts).forEach(([gid, { wrap: w }]) => {
            const rect = w.getBoundingClientRect();
            const xPct = Math.min(96, Math.max(0, rect.left / window.innerWidth * 100));
            const yPct = Math.min(94, Math.max(6, rect.top / window.innerHeight * 100));
            placed[gid] = { xPct, yPct };
          });
          savePlaced(placed);
        }
      };

      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerUp);
    }

    // Clicking anything outside a desktop item clears the current selection.
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest || !e.target.closest('.desktop-item-wrap')) clearSelection();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') clearSelection();
    });

    render();
    // render() re-syncs placement each time, so a plain re-render is enough
    // to pick up a newly-won item, whether won just now or on another tab.
    window.addEventListener('inventory:changed', render);
    window.addEventListener('storage', render);

    return { refresh: render };
  }

  window.DesktopItems = {
    init,
    getPlaced,
    getStaticItems: () => STATIC_ITEMS,
    // Moves an item from the chest back onto the desktop — used by the
    // inventory modal's [Take Out] button. Call instance.refresh() (the
    // object init() returns) afterward to redraw immediately.
    takeOut(id) {
      const placed = getPlaced();
      if (id in placed) return;
      const owned = draggableOwnedIds();
      placed[id] = randomSpot(owned.indexOf(id));
      savePlaced(placed);
    },
    // Reverse of takeOut — puts a desktop item away into the chest without
    // needing to drag it there. Used by the inventory modal's storage button.
    // Call instance.refresh() afterward to redraw immediately.
    stash(id) {
      const placed = getPlaced();
      if (!(id in placed)) return;
      delete placed[id];
      savePlaced(placed);
    },
  };
})();
