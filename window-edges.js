/**
 * The vertical window sides she can hold on to, worked out from the windows the page hands a pack
 * that `needs` `windows` (`host.bounds().windows`).
 *
 * The application gives the windows whole — `{ id, x0, y0, x1, y1, active }` in stage pixels, front
 * first, the parts behind other windows included. What a body needs is the opposite: only the parts
 * of each side that nothing in front covers, already clipped to the stage. That is this file, and it
 * is the pack's own job now that the app stopped doing it for us.
 *
 * A window contributes two lines (its left and right frame); each is free over a run of y, and a
 * window in front cuts that run wherever it stands across the same line. A run shorter than `minRun`
 * is not worth holding on to, and a line with no room beside it is dropped — she hangs *outside* the
 * frame, so a line at the very edge of the stage would put her off it.
 *
 *   id       `window:l` / `window:r`, plus `#0` / `#1` when a side is cut into more than one run
 *   x        the line itself
 *   top      the highest she may hold (the window's top edge, less `margin`)
 *   bottom   the lowest she may hold (its bottom edge less `margin`, clipped to the floor)
 *   side     +1 the window's left frame (she hangs outside it, facing right)
 *            -1 the window's right frame (facing left)
 *   headY    the window's own top edge: the roof she steps onto at the top of a climb
 *   roof     whether this run reaches that roof (one cut from above ends in mid air)
 *   origin   the window's left edge, so the body can follow it sideways when it moves
 *   reach    the window's height
 *   width    the window's width (too narrow a window is not worth leaning into)
 *   active   whether this window holds the focus
 */

const DEFAULTS = {
  /** Room on the stage on the hanging side of the line; she hangs outside the frame. */
  gutter: 56,
  /** Kept clear at the top and bottom, so she never holds a bare corner. */
  margin: 8,
  /** The shortest run worth holding on to. */
  minRun: 140,
  /** Most edges one read reports. */
  max: 96,
};

/** `[a, z]` less the part `[c, d]` covers. */
function cut(a, z, c, d) {
  if (d <= a || c >= z) return [[a, z]];
  const out = [];
  if (c > a) out.push([a, Math.min(z, c)]);
  if (d < z) out.push([Math.max(a, d), z]);
  return out.filter(([p, q]) => q > p);
}

/**
 * @param {Array<{id?: string, x0: number, y0: number, x1: number, y1: number, active?: boolean}>} windows
 *   the app's whole windows, front first, in stage pixels
 * @param {{width: number, floor: number}} view  the stage's width and the floor line
 * @param {{gutter?: number, margin?: number, minRun?: number, max?: number}} [options]
 */
export function windowEdges(windows, view, options = {}) {
  const { gutter, margin, minRun, max } = { ...DEFAULTS, ...options };
  const edges = [];
  const front = [];
  const width = Number(view?.width) || 0;
  const floor = Number.isFinite(view?.floor) ? view.floor : Infinity;

  (Array.isArray(windows) ? windows : []).forEach((w, index) => {
    const id = typeof w?.id === 'string' && w.id ? w.id : `w${index}`;
    const left = Number(w?.x0), right = Number(w?.x1);
    const top = Number(w?.y0), bottom = Number(w?.y1);
    if (!(right > left) || !(bottom > top)) return;

    for (const side of [1, -1]) {
      const x = side === 1 ? left : right;
      // The line has to be on the stage, with room to hang on the outside of it.
      if (x < 0 || x > width) continue;
      if (side === 1 ? x < gutter : x > width - gutter) continue;

      // Her own frame, clear of the corners and of the floor.
      const from = Math.max(0, top + margin);
      const to = Math.min(floor, bottom - margin);
      if (to - from < minRun) continue;

      // A window in front cuts this line only where it stands across it.
      let runs = [[from, to]];
      for (const b of front) {
        if (b.left - 1 > x || b.right + 1 < x) continue;
        runs = runs.flatMap(([a, z]) => cut(a, z, b.top, b.bottom));
      }
      runs = runs.filter(([a, z]) => z - a >= minRun).sort((p, q) => p[0] - q[0]);

      runs.forEach(([a, z], i) => {
        edges.push({
          // A side cut in two is two holds, not one: the pieces are numbered so an id never names
          // two different runs, and the body can tell which one it is on.
          id: `${id}:${side === 1 ? 'l' : 'r'}${runs.length > 1 ? `#${i}` : ''}`,
          x,
          top: a,
          bottom: z,
          side,
          headY: top,
          roof: Math.abs(a - (top + margin)) <= 1,
          origin: left,
          reach: bottom - top,
          width: right - left,
          active: !!w.active,
        });
      });
    }

    front.push({ left, right, top, bottom });
  });

  return edges.sort((a, b) => a.top - b.top || a.x - b.x).slice(0, max);
}
