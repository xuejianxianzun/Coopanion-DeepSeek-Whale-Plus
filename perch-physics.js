/** One-way window platforms; coordinates and the foot anchor use stage DIPs. */
export function createPerchPhysics() {
  let surfaces = [], support = null;
  let sampledAt = null;
  let history = [];
  let pendingSweep = false;
  const inside = (s, x, radius) => x - radius >= s.left && x + radius <= s.right;
  const risingFast = s => s.velocity < -320 || (s.velocity < -80 && Math.hypot(s.velocityX, s.velocity) > 450);
  const launch = (pet, s) => {
    // Scale and cap the vector together so diagonal throws retain the drag direction.
    const gain = Math.min(Math.max(1.1, 450 / -s.velocity), 1100 / -s.velocity,
      1400 / Math.hypot(s.velocityX, s.velocity));
    pet.vx = s.velocityX * gain;
    pet.vy = s.velocity * gain;
    pet.airKind = 'throw';
    pet.sqv = (pet.sqv ?? 0) - 1.5;
  };
  return {
    setSurfaces(value, now = performance.now()) {
      // A short velocity window avoids interpreting pixel quantization / IPC
      // jitter at 60 Hz as a throw. Geometry itself is never delayed or smoothed.
      if (sampledAt !== null && (now <= sampledAt || now - sampledAt > 300)) history = [];
      while (history.length > 1 && history[1].time <= now - 64) history.shift();
      const baseline = history[0];
      const seconds = baseline ? (now - baseline.time) / 1000 : 0;
      const previous = new Map(surfaces.map(s => [s.id, s]));
      surfaces = (Array.isArray(value) ? value : []).map(s => {
        const old = previous.get(s.id);
        const base = baseline?.surfaces.get(s.id);
        const velocity = old && base && seconds >= .008 && seconds <= .3 ? (s.y - base.y) / seconds : 0;
        const velocityX = old && base && seconds >= .008 && seconds <= .3 ? (s.origin - base.origin) / seconds : 0;
        return { ...s, velocity, velocityX, previousY: old?.y ?? s.y };
      });
      sampledAt = now;
      history.push({time: now, surfaces: new Map(surfaces.map(s => [s.id, s]))});
      if (history.length > 16) history.shift();
      pendingSweep = true;
    },
    get supported() { return !!support; },
    before(pet, desktopFloor, scale, fall) {
      const radius = 24 * scale;
      const sweep = pendingSweep;
      pendingSweep = false;
      if (pet.mode === 'drag' || pet.mode === 'air' || pet.mode === 'flying' || pet.mode === 'swimming') support = null;
      if (pet.mode === 'air' && sweep) {
        // A rising window may cross the feet between native snapshots. Resolve
        // that relative sweep before advancing gravity, even if the pet is rising.
        const lifted = surfaces.filter(s => s.y >= 250 * scale && s.y < desktopFloor &&
          s.y < s.previousY && s.previousY >= pet.fy && s.y <= pet.fy && inside(s, pet.x, radius))
          .sort((a, b) => a.y - b.y)[0];
        if (lifted) {
          pet.fy = lifted.y;
          if (risingFast(lifted)) launch(pet, lifted);
          else { support = lifted; return lifted.y; }
        }
      }
      if (support) {
        const candidate = surfaces.find(s => s.id === support.id && s.y >= 250 * scale && s.y < desktopFloor &&
          inside(s, pet.x + s.origin - support.origin, radius));
        if (candidate) {
          const dx = candidate.origin - support.origin;
          const dy = candidate.y - support.y;
          pet.x += dx; pet.target += dx;
          if (Math.abs(dy) >= 2 && (risingFast(candidate) || candidate.velocity > 280)) {
            support = null;
            // Upward motion pushes the feet to the new edge before launching.
            // A descending support leaves the body at its previous height.
            if (dy < 0) pet.fy = candidate.y;
            fall();
            if (dy < 0) launch(pet, candidate);
            return desktopFloor;
          }
          pet.fy = candidate.y;
          support = candidate;
          return candidate.y;
        }
        support = null;
        fall();
      }
      return desktopFloor;
    },
    land(from, pet, desktopFloor, scale) {
      if (pet.vy <= 0 || pet.fy < from.y) return null;
      let hit = null, fraction = Infinity;
      for (const s of surfaces) {
        if (s.y < 250 * scale || s.y >= desktopFloor || s.y < from.y - .01 || s.y > pet.fy) continue;
        const t = (s.y - from.y) / Math.max(.001, pet.fy - from.y);
        const x = from.x + (pet.x - from.x) * t;
        if (inside(s, x, 24 * scale) && t < fraction) { hit = s; fraction = t; }
      }
      if (hit) {
        // Resolve at the crossing point so a fast diagonal throw cannot tunnel.
        pet.x = from.x + (pet.x - from.x) * fraction;
        support = hit; return hit.y;
      }
      return null;
    },
    reset() { support = null; },
    /**
     * The window tops she could stand on, in stage DIPs: high enough that her head clears the top of the
     * screen, above the desktop floor, and wide enough to land on. Window Perch owns these surfaces;
     * this is only how the body asks for them.
     */
    roofs(scale, desktopFloor, minWidth = 60) {
      const out = [];
      for (const s of surfaces) {
        if (!(s.y >= 250 * scale) || s.y >= desktopFloor) continue;
        if (s.right - s.left < minWidth * scale) continue;
        out.push({ id: s.id, y: s.y, left: s.left, right: s.right, x: s.left + (s.right - s.left) / 2, origin: s.origin });
      }
      return out;
    },
    /** The window top best worth going to from where she is: nearest sideways, height counting for less. */
    nearestRoof(pet, scale, desktopFloor) {
      let best = null, cost = Infinity;
      for (const r of this.roofs(scale, desktopFloor)) {
        const c = Math.abs(r.x - pet.x) + .3 * Math.abs(r.y - pet.fy);
        if (c < cost) { cost = c; best = r; }
      }
      return best;
    },
    /** The window top sitting at (about) this height, or null: what "can she actually stand up there" asks. */
    roofNear(y, tol = 10, scale = .42, desktopFloor = Infinity) {
      let best = null, d = Infinity;
      for (const r of this.roofs(scale, desktopFloor)) {
        const dd = Math.abs(r.y - y);
        if (dd <= tol && dd < d) { d = dd; best = r; }
      }
      return best;
    },
    /** Flown onto a platform rather than fallen onto it: adopt the surface at (x, y) as her support, so every
     *  rule that already works for a perch — riding a window that moves, coming off the end of one, being
     *  carried — picks up from there. Without this she would sit at the right height but still think the
     *  desktop floor was under her. Returns the surface's y, or null when nothing is there to stand on. */
    catchOn(x, y, scale) {
      const radius = 24 * scale;
      const s = surfaces.find(s => s.y >= 250 * scale && Math.abs(s.y - y) < 2.5 && inside(s, x, radius));
      if (!s) return null;
      support = s;
      return s.y;
    },
  };
}
