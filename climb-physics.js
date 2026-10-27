/**
 * Vertical window sides as holding surfaces, in stage DIPs, for the body kit.
 *
 * Window Perch owns the *roofs* she can stand on (`web/kit/perch-physics.js`); this owns the *walls*
 * she can hold on to. The two are deliberately separate modules on the same body: a window has a top
 * she can be thrown onto and two sides she can climb, and neither behaviour should have to know how
 * the other is implemented. Where they meet is one call — at the top of a climb the body asks the
 * perch to adopt the window's roof (`perch.catchOn`), and from there every rule that already works
 * on a window top picks up: riding it, walking off the end of it, being carried.
 *
 * Edges arrive already resolved for occlusion and clipped to the stage
 * (`host/climb-geometry.cjs`), one per window side:
 *
 *   id       stable while the window lives: which side of which window
 *   x        the line itself, in stage DIPs
 *   top      the highest she may hold: the window's top edge, kept clear by a margin
 *   bottom   the lowest she may hold: the window's bottom edge, kept clear by a margin
 *   headY    the window's own top edge — the roof she steps onto at the top of a climb
 *   side     +1 the window's left frame (she hangs on its left, facing right)
 *            -1 the window's right frame (she hangs on its right, facing left)
 *   origin   the window's left edge when it was sampled, for following it sideways
 *
 * Nothing here draws anything, and nothing here decides *why* she climbs; the body does that
 * (`cling` and `climb` in body.js). This module answers where the walls are, which one she is on,
 * where along it she is, and what becomes of her when the window moves or goes away.
 */
export function createClimbPhysics() {
  /**
   * How far outside the frame her middle sits while she holds on. This is a **hug**, not a climb: most
   * of her belongs inside the window she is leaning in to look at, with the frame running up through
   * her — arms and knees either side of it. Anything much larger leaves her hanging in the air beside
   * the window, which is what it looked like at .62. 108 is the kit's own half-width in logo units
   * (`HITS`).
   *
   * .5 → .42（中线离框 45 → 38px）：他要「爬和滑的时候身体更贴近边框」。
   * 想更贴就再往下调（.28 时脚尖能到离框线约 6px），但 `figure.js` 的 `armNear.tx` 必须跟着重解：
   * .5 → 13.6、.42 → 4.8、.28 → -10.6（负值是往身体那边收）。不重解，手就会插进窗口里或者吊在框外。
   * 靠近观众那条腿（髋 rig 104、腿长 45）最远只到 149，框线在 128 + HOLD×108 —— .42 时差 24 rig，
   * 所以「脚尖真正踩上框线」这条腿做不到。
   */
  const HOLD = .42, HALF = 108;
  /**
   * How far from the place holding on would put her she may be and still take hold, at her own
   * scale. Taking hold carries her the rest of the way to the line, so this is also the most she can
   * shift sideways the instant she grips — a wide net here is exactly what makes her look like she
   * is snapped sideways onto the wall, or flung off it.
   */
  const REACH = 26;
  /**
   * A window top needs this much stage above it before its side is worth holding: any less and her head
   * would leave the screen before she had her arms round it.
   *
   * This was 250, from the days when she climbed to the top of a window and stepped onto its roof, and
   * that is a rule about *arriving on top*. Holding on to look in happens anywhere down a side, so a
   * window high on the screen is worth a visit as much as a low one — and at 250 every window on this
   * desktop was refused, which is exactly why she went to one and then hung in the air beside it, arms
   * at her sides, never taking hold at all.
   */
  const HEADROOM = 80;
  /** The shortest run worth climbing, in stage DIPs. */
  const MIN_RUN = 140;
  /**
   * A window that jumps this far between two samples was snapped or flung, not moved: she loses her
   * grip instead of being carried along at that speed.
   */
  const SHAKE = 400;
  /**
   * How long she keeps her hold when the sample says nothing at all about the side she is on.
   *
   * A window dragged across another one has its side cut into pieces and joined back together from one
   * sample to the next, and a frame or two can arrive with no piece of that side in it at all. Letting
   * go on such a frame is what "she drops the moment you move the window" was: the window never moved
   * out from under her, the sample simply had nothing to say about it yet. Long enough to ride out a
   * drag, short enough that a window that is really gone — closed, minimised, covered for good — still
   * drops her without a visible pause.
   */
  const LOST_GRACE = 600;
  /**
   * 边从样本里消失时，按她最后的速度继续带着她走多久（上限）。和 LOST_GRACE 分开：那一个是
   * 「多久没有这条边就当窗口没了」，这一个只是「这几帧滑多远」，不该超过它原来的值。
   */
  const LOST_GLIDE_MS = 400;
  /**
   * How far ahead of the last sample she may be carried while the window is still moving.
   *
   * The samples arrive every few tens of milliseconds, and a window being dragged covers a long way in
   * that time. Holding her exactly where the last sample put her therefore leaves her trailing the
   * window by exactly that distance the whole way — which reads as lag, not as holding on. Between two
   * samples she keeps going at the speed the samples showed. Capped in both time and distance, because
   * a window that stops between samples must not have her sail past it: the next sample arrives within
   * a frame or two and puts her back on the line.
   *
   * Each side now carries `at`, the moment the World scanned it (see `host/climb-bridge.cjs`), so the
   * time to make up for is the real age of the position rather than the time since the page happened
   * to receive it — the scan and the hop across are most of the gap, and they used to be ignored. The
   * caps were raised with it: at 60ms and 40px a fast drag still left her visibly behind.
   */
  const DRIFT_MAX_MS = 90, DRIFT_MAX_PX = 0;
  /**
   * How long a fresh grip holds whatever the window does. The sample that arrives in the same frame
   * she takes hold can be a stale one, measured before the window settled; letting go on it reads as
   * being knocked off the instant she touches the wall, which is exactly what it must not look like.
   */
  const GRIP = 420;
  /**
   * How far above her feet a window's bottom edge may sit and still count as **meeting the floor**:
   * within this she walks to the side she means to climb, past it she has to fly there. A window
   * sitting on the taskbar is a step away; one whose bottom is a third of the way up the screen has
   * no side within reach of the ground at all, and walking to it would only teleport her upward the
   * instant she took hold.
   */
  const GROUND = 60;
  /**
   * A window is worth leaning in to see when it is a **normal** window: big enough that there is
   * something on it to look at. Tool palettes, find bars and floating gadgets are not — going to peer
   * at one of those only looks like she has mistaken a stripe of window chrome for a window.
   */
  const SEE_W = 300, SEE_H = 220;
  /**
   * How far below a window's own top she takes hold when she means to look in. High up, because that is
   * where a window's content is — but not at the very top: 56 apart read as her hanging off the window's
   * **corner**, with nothing under her and the top edge beside her head. Far enough down to be plainly on
   * the side of the frame, with the corner well above her and the window running away below.
   * Capped at a quarter of the run so a short window still works.
   */
  const HOLD_INSET = 150;
  /**
   * 她抓着的那一处被前面的窗口盖掉时，被顶开的初速（像素/秒；横向朝离窗口远的一侧，纵向为负＝先弹起）。
   *
   * 原来这里什么也没有：她那一段没了，她就被夹进同一扇窗剩下的那一截里 —— 屏幕上是她**从窗口
   * 下方一下闪到窗口上方**。框线在她那一段确实没有了，抓不住的东西就是抓不住：她应该被顶开、带
   * 一点速度落下去。2300 px/s² 的重力下，420 大约弹起 38px，横向 240 一秒内松手滑出一百多像素。
   */
  const KNOCK_X = 240, KNOCK_Y = 420;
  /**
   * 她爬到顶时，**脚**停在离窗口上沿多远（rig 单位，乘 scale 成像素）。
   *
   * 之前是把脚夹到 run 的上沿（窗口顶再下来 8px）：那是把「她这只手能抓住的最高一截」当成「她
   * 能站上去的最高一截」了。她的锚点在脚，脚到了窗口顶，整个人就悬在窗口上方、看起来飞到窗口外面
   * 去了。200 rig 是她从脚底(256)到头顶(约 56)的那一身，留出这一截，她的头才刚好齐着窗口上沿。
   */
  const BODY_CLEAR = 200;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nowTime = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  let edges = [], held = null, grippedAt = -Infinity, lostSince = 0;
  /**
   * 她在窗口上「离窗口上沿多远」。纵向位置靠它和窗口自己的上沿一起算出来（见 before 里那段），
   * 不是靠每帧把窗口的位移加到 pet.fy 上——后者会把每一帧多出来的一点（外推、夹在上下沿上）
   * 永久留在身上，上下拖动窗口时就表现为越拖越飘。爬行或撞到上下沿时它才变。
   */
  let rel = null;
  /**
   * 诊断：她到底比窗口慢多少、有没有被外推甩过头、有没有因为边丢了而停住。
   * 每秒由 body 取走一次写进墙上的日志（stats()），光靠眼睛分不出这三件事。
   */
  const probe = { n: 0, ageSum: 0, ageMax: 0, offXMax: 0, offYMax: 0, lost: 0, why: '-' };
  /**
   * The last sample she was moved to, and the speed it was moving at. Between two samples that is what
   * keeps her on the window instead of a few tens of milliseconds behind it — see `DRIFT_MAX_MS`.
   */
  let sampleEdge = null, sampleAt = 0, sampleX = 0, sampleY = 0, sampleStamp = NaN, driftX = 0, driftY = 0;
  /**
   * The windows she has already been to look into, by window (`id` on every piece of every side of it
   * is `<window>:<side>`). One visit each: the point of going to look is that a *new* window is worth
   * a look, so a window she has already read must not draw her back to it. A closed window is forgotten
   * (see `setEdges`): the same `hwnd:pid` opened again is a window she has not read.
   */
  const seenWindows = new Set();

  /**
   * Whether this run is long enough to be worth holding at all.
   *
   * It used to be "the window top must sit at least HEADROOM below the top of the screen". That is a
   * rule about arriving on the roof, from the days when a climb ended by stepping onto it; holding on
   * to look in happens anywhere down a side. It also made every maximised or top-docked window
   * unclimbable — the stage keeps no margin above a window whose top is on the screen's edge, so its
   * run started at y=8 and failed the test. The length check is the one that matters; how near the top
   * she takes hold is `HEAD_CLEAR` below instead.
   */
  const climbable = (e, scale) => (e.bottom - e.top) >= MIN_RUN * scale;
  /** The lowest she may hold on `e`: its own bottom, or the desktop floor, whichever comes first. */
  const foot = (e, desktopFloor) => Math.min(e.bottom, desktopFloor);
  /**
   * 她在这条边上最高能到哪儿。
   *
   * 两个约束取紧的那个：**头不能越过窗口自己的上沿**（`headY + 一身`），**也不能爬进被前面窗口
   * 盖掉的那一截**（`e.top`，那上面的框线抓不到）。原来只用了 `e.top` —— 脚一到 run 顶，人就整个
   * 悬在窗口上方了，他说的「爬到外面去了」就是这个。
   *
   * 顺序是 max 再 min：先满足「不许比我这一截还高」（否则碎片的上沿会把她往下推），再不许超过下沿。
   */
  const ceiling = (e, scale, desktopFloor) => {
    const low = foot(e, desktopFloor);
    return Math.min(Math.max(e.top, e.headY + BODY_CLEAR * scale), low);
  };
  /** Where her middle sits while she is on `e`. */
  const holdX = (e, scale) => e.x - e.side * HOLD * HALF * scale;
  /** How far outside `e` her middle is: positive on the hanging side of the line. */
  const outside = (e, x) => (e.x - x) * e.side;
  /**
   * 能不能当一面墙用：既要够长（`climbable`），也要**够从这条边抱到地面 / 窗口下沿**。
   *
   * 第二个门槛原来写的是 `MIN_RUN`（140 DIP，没乘 scale），而 `climbable` 用的是 `MIN_RUN * scale`
   * —— 同一个问题两个尺度。长度落在两者之间的侧边于是出现一种怪事：`reach()` 判能抓（她确实能
   * 挂上去），`nearest()` 判不能选（喊「爬上去」她找不到边、只会 setExpr('confused')）。
   * 2026-10-17 复查判定时对出来的，统一乘 scale。
   */
  const usable = (e, scale, desktopFloor) => climbable(e, scale) && foot(e, desktopFloor) - e.top >= MIN_RUN * scale;
  /** The window a piece of a side belongs to: `hwnd:pid:l#1` names one side of one window. */
  const windowOf = (edge) => edge.id.replace(/:[lr](#\d+)?$/, '');
  /**
   * The side of a window a piece belongs to — the same line, whether this sample happens to have it in
   * one piece or two. See `LOST_GRACE` and `before`.
   */
  const wallOf = (edge) => `${windowOf(edge)}:${edge.side === 1 ? 'l' : 'r'}`;
  /** Whether this window is a normal one: big enough that there is something on it to look at. */
  const worthSeeing = (e, scale) => !!e && (e.reach ?? 0) >= SEE_H * scale && (e.width ?? Infinity) >= SEE_W * scale;
  /** Where she takes hold when she means to look in: up near the top of the run, not at its bottom. */
  const holdSpot = (e, scale, desktopFloor, inset = HOLD_INSET) => {
    const low = foot(e, desktopFloor);
    // 上限是「头齐窗口上沿」那一截（ceiling），不是 run 的顶：飞到比这更高的地方，抓住的那一下
    // 会被 takeHold 夹下来 —— 屏幕上看就是「先飞到高处，再瞬移贴到框线上」。矮窗口时 high 要退回 low，
    // 否则 clamp 的下界比上界还大。
    const high = Math.min(low, Math.max(ceiling(e, scale, desktopFloor), e.top));
    return clamp(e.top + Math.min(inset * scale, (low - e.top) * .5), high, low);
  };

  /** Takes hold of `edge` at height `y`, turning her to face the window. */
  function takeHold(edge, y, pet, scale, desktopFloor) {
    if (!edge || !usable(edge, scale, desktopFloor)) return false;
    held = edge;
    grippedAt = nowTime();
    pet.x = pet.target = holdX(edge, scale);
    pet.fy = clamp(y, ceiling(edge, scale, desktopFloor), foot(edge, desktopFloor));
    rel = pet.fy - edge.headY;
    pet.fyShift = 0;
    pet.vx = 0; pet.vy = 0;
    pet.facing = edge.side;
    return true;
  }

  return {
    /**
     * 换一份新的可抱竖边。`openIds` 是可选的：这一帧还开着的窗口 id（**整扇窗**，不是裁完的边——
     * 被前面的窗口挡住、太窄没边的窗也算开着，否则它会因为“暂时没边”被误当成关掉了）。
     * 给了就顺手清掉「看过了」里已经不在的窗口：窗口关掉即忘记，同一个 `hwnd:pid` 再开一次，
     * 她还愿意去看一眼；不给（页面只喂边、不喂窗口列表）就完全照旧，一次都不清。
     *
     * 窗口列表本身 0.7 秒一份，所以“关掉”最快也要下一个样本才知道；关得太快又立刻重开
     * （同一个 id）她可能记成看过——代价只是少看一眼，不影响别的东西。
     */
    setEdges(value, openIds) {
      edges = Array.isArray(value) ? value : [];
      if (!Array.isArray(openIds)) return;
      const open = new Set(openIds);
      for (const id of seenWindows) if (!open.has(id)) seenWindows.delete(id);
    },
    /** True while she is holding on to a window side. */
    get attached() { return !!held; },
    /**
     * True while the sample has nothing to say about the side she is on and she is holding on through
     * it (see LOST_GRACE). For the log: it is the difference between "the window is gone" and "the
     * window is being dragged", which otherwise look the same from outside for as long as it lasts.
     */
    get lost() { return lostSince > 0; },
    /** The edge she is on, or null. */
    get edge() { return held; },
    get top() { return held ? held.top : 0; },
    get bottom() { return held ? held.bottom : 0; },
    /** The window's own top edge: where a climb ends in a step onto the roof. */
    get headY() { return held ? held.headY : 0; },
    /**
     * Whether the run she is on actually reaches that roof. False for a piece of a side that a window
     * in front has cut off: climbing to the top of that one ends in mid air, so there is nothing to
     * step onto and she must not be lifted to the window's real corner.
     */
    get roof() { return !!held && held.roof !== false; },
    holdX,
    windowOf, worthSeeing, holdSpot,
    /** 上一次调用以来的跟随诊断，取走即清零：lag/lagMax 毫秒，offX/offY 像素，lost 帧数。 */
    stats() {
      const n = Math.max(1, probe.n);
      const out = { n: probe.n, lag: Math.round(probe.ageSum / n), lagMax: Math.round(probe.ageMax),
        offX: Math.round(probe.offXMax), offY: Math.round(probe.offYMax), lost: probe.lost, why: probe.why };
      probe.n = 0; probe.ageSum = 0; probe.ageMax = 0; probe.offXMax = 0; probe.offYMax = 0; probe.lost = 0; probe.why = '-';
      return out;
    },
    /**
     * 窗口自己的顶边，一扇窗一条：把左右两条竖边配成一对，给出顶边的 y 和水平范围。
     *
     * 趴上去要用它——`edges` 里只有竖边，没有「窗口的顶在哪里、有多宽」。同一扇窗被别的窗口切成几段时
     * 会出现好几条边，这里只取每侧第一条，够用来摆位置了。
     * 窗口顶在屏幕外（y < 0）或者窄得像条缝的，不算：趴上去她会看不见，或者趴不住。
     */
    tops(scale, minWidth = 160) {
      const byWindow = new Map();
      for (const e of edges) {
        if (!climbable(e, scale)) continue;
        const w = windowOf(e);
        const list = byWindow.get(w);
        if (list) list.push(e); else byWindow.set(w, [e]);
      }
      const out = [];
      for (const [id, list] of byWindow) {
        const l = list.find(e => e.side === 1), r = list.find(e => e.side === -1);
        if (!l || !r) continue;
        const y = Math.min(l.headY, r.headY);
        const left = Math.min(l.x, r.x), right = Math.max(l.x, r.x);
        if (y < 0 || right - left < minWidth * scale) continue;
        out.push({ id, y, left, right, origin: l.origin });
      }
      return out;
    },
    /** How many sides she has been told about — for the log, and for the tests. */
    get edgeCount() { return edges.length; },
    /**
     * The point to fly at to look into `edge`: beside the line, up near its top, facing the window.
     * Nothing about the ground enters into it — going to look is a flight, not a walk, however low the
     * window happens to sit.
     */
    lookSpot(edge, scale, desktopFloor) {
      return { x: holdX(edge, scale), y: holdSpot(edge, scale, desktopFloor) };
    },
    /** Whether she has already been to look into this window. */
    seen(edge) { return !!edge && seenWindows.has(windowOf(edge)); },
    /** Remembers that she has looked into this window: one visit each, until it is closed. */
    markSeen(edge) { if (edge) seenWindows.add(windowOf(edge)); },
    /** How many windows she has looked into — for the log, and for the tests. */
    get seenCount() { return seenWindows.size; },
    /**
     * The window most worth going to look into that she has not read yet, or null. Nearest sideways to
     * where holding on would put her, with height counting for less, so she does not cross the stage
     * for a window she could only reach at an awkward height.
     */
    fresh(pet, scale, desktopFloor) {
      let best = null, bestCost = Infinity;
      for (const e of edges) {
        if (!usable(e, scale, desktopFloor)) continue;
        if (!worthSeeing(e, scale) || seenWindows.has(windowOf(e))) continue;
        const cost = Math.abs(holdX(e, scale) - pet.x) + .7 * Math.abs(holdSpot(e, scale, desktopFloor) - pet.fy);
        if (cost < bestCost) { bestCost = cost; best = e; }
      }
      return best;
    },
    /** Whether there is anything at all to climb: what the body asks before choosing to, on its own. */
    available(scale, desktopFloor) { return edges.some(e => usable(e, scale, desktopFloor)); },
    /**
     * The edge best worth heading for from (x, y): nearest sideways to where she would stand on it,
     * with the height it can be taken at counting for less, so she prefers a side she can take hold
     * of where she already is without walking off to a taller one.
     */
    nearest(x, y, scale, desktopFloor) {
      let best = null, bestCost = Infinity;
      for (const e of edges) {
        if (!usable(e, scale, desktopFloor)) continue;
        const cost = Math.abs(holdX(e, scale) - x) + .3 * Math.abs(clamp(y, e.top, foot(e, desktopFloor)) - y);
        if (cost < bestCost) { bestCost = cost; best = e; }
      }
      return best;
    },
    /**
     * 某一扇窗的一条竖边（被前面的窗口切成几段时取最长的那一段）。
     *
     * 她要认得**刚才被打断的那一扇**：被顶开以后自己爬回去接着看。只按远近找边会把带她去另一扇窗，
     * 看起来就像忘了自己本来在看什么。
     */
    edgeOfWindow(winId, scale, desktopFloor) {
      let best = null;
      for (const e of edges) {
        if (windowOf(e) !== winId || !usable(e, scale, desktopFloor)) continue;
        if (!best || (e.bottom - e.top) > (best.bottom - best.top)) best = e;
      }
      return best;
    },
    /** The window the user is working in (it holds the focus), as `hwnd:pid`, or null. */
    activeWindow() {
      for (const e of edges) if (e.active) return windowOf(e);
      return null;
    },
    /** The side of that window worth going up to watch, or null when none of it is. */
    activeEdge(pet, scale, desktopFloor) {
      const id = this.activeWindow();
      if (!id) return null;
      const e = this.edgeOfWindow(id, scale, desktopFloor);
      return e && worthSeeing(e, scale) ? e : null;
    },
    /**
     * How she gets to `edge` from where she is standing. Walking is the way there while the side meets
     * the floor she is on, and while the place holding on would put her is a place she can stand: a
     * window hanging clear of the ground, or a side out past the end of her walk, has to be flown to.
     *
     * `pet` is the body standing there, `lo`/`hi` the ends of its walk. Returns `{kind: 'walk', x}`,
     * or `{kind: 'fly', x, y}` — the point to fly at sits on the side, at a height she can take hold
     * of, so the reach that catches her when she drops past a window does the rest of the work.
     */
    approach(edge, pet, scale, desktopFloor, lo, hi) {
      const standX = holdX(edge, scale);
      // How far the bottom of the run sits above her feet, which is what decides walk from fly: at or
      // below the floor she is on, the side meets it; a third of the way up the screen, it does not.
      const above = pet.fy - Math.min(edge.bottom, desktopFloor);
      const walkX = clamp(standX, lo, hi);
      const meets = above <= GROUND * scale && Math.abs(walkX - standX) <= REACH * scale;
      if (meets) return { kind: 'walk', x: walkX };
      const low = foot(edge, desktopFloor);
      // Fly at a hold a little above the bottom of the run: high enough that taking hold is a reach
      // rather than a step up from nothing, low enough that the side is still in the air beside her.
      const y = clamp(Math.min(pet.fy - 90 * scale, low - 20 * scale), edge.top, low);
      return { kind: 'fly', x: standX, y };
    },
    attach: takeHold,
    /** The edge with this id, or null — for a body that only remembers what it set out for. */
    edgeById(id) {
      return edges.find(e => e.id === id) || null;
    },
    /** Takes hold of the edge with this id, for a body that walked to it and only remembers its id. */
    attachById(id, y, pet, scale, desktopFloor) {
      return takeHold(edges.find(e => e.id === id), y, pet, scale, desktopFloor);
    },
    /** Can she take hold of `edge` from height `y` at all, or is she too far above/below its side? */
    sideReachable(edge, y, scale, desktopFloor) {
      if (!edge) return false;
      const low = Math.min(edge.bottom, desktopFloor);
      return y >= edge.top - 6 * scale && y <= low + 6 * scale;
    },
    /**
     * Takes hold of the nearest edge within arm's reach of where she is, and says whether it found
     * one. This is what catches her: thrown at a window's side, dropped beside one, or settling out
     * of a flight next to one.
     */
    reach(pet, scale, desktopFloor) {
      const gap = HOLD * HALF * scale, give = REACH * scale;
      let best = null, bestD = Infinity;
      for (const e of edges) {
        if (!climbable(e, scale)) continue;
        // She has to be about where holding on would put her anyway. Taking hold carries her the rest
        // of the way to the line, so a wider net here is what makes her snap sideways onto the wall.
        const d = Math.abs(outside(e, pet.x) - gap);
        if (d > give) continue;
        if (pet.fy < e.top - 6 * scale || pet.fy > foot(e, desktopFloor)) continue;
        if (d < bestD) { bestD = d; best = e; }
      }
      return takeHold(best, pet.fy, pet, scale, desktopFloor);
    },
    /** Works her way `dy` along the edge she is on (negative is up), stopping at either end. */
    slide(pet, dy, scale, desktopFloor) {
      if (!held) return null;
      // The one thing that actually moves where she is on the window: her own climbing. Everything else
      // (the window moving, either end of the run clamping her) leaves `rel` alone.
      const high = ceiling(held, scale, desktopFloor);
      rel = clamp(rel + dy, high - held.headY, foot(held, desktopFloor) - held.headY);
      pet.fy = clamp(held.headY + rel, high, foot(held, desktopFloor));
      return pet.fy;
    },
    atTop(pet, scale, desktopFloor) { return !!held && pet.fy <= ceiling(held, scale, desktopFloor) + .5; },
    /** 到顶，容许 tol 像素的误差：抱在「看着窗口」的那个高度时，脚常常差一两像素到不了顶。 */
    nearTop(pet, scale, desktopFloor, tol = 6) { return !!held && pet.fy <= ceiling(held, scale, desktopFloor) + tol; },
    atBottom(pet, desktopFloor) { return !!held && pet.fy >= foot(held, desktopFloor) - .5; },
    /** Lets go. She is in the air from here; the body takes over (`case 'air'`). */
    release() { held = null; lostSince = 0; rel = null; },
    /**
     * Each frame, before gravity: keeps her on the window she is holding. Carries her when the window
     * moves under her, pulls her back inside the run if it shrank, and lets her go — reporting it
     * through `fall()` — when the window was closed, minimised, hidden behind another, snapped away,
     * or has slid off the stage.
     */
    before(pet, desktopFloor, scale, fall) {
      if (!held) return;
      const was = held;
      /**
       * 她抓着的那一处被前面的窗口盖掉了：那里没有框线可抓。不夹到别处、不原地悬着，被顶开 ——
       * 脱离，横向朝离窗口远的一侧、纵向先弹起来，然后归 `air` 的重力。
       *
       * `fall` 是 body 侧的回调，它原本一律把 vx/vy 清零再换 `air`（那是对的：边丢了、窗口被甩了，
       * 她只是掉下去）。这里把原因 `covered` 一起交出去，body 看到它就不清零，接住这份初速。
       */
      const knockedOff = (why) => {
        probe.why = why;
        const side = was.side;
        held = null; lostSince = 0; rel = null;
        pet.vx = -side * KNOCK_X; pet.vy = -KNOCK_Y; pet.airKind = 'jump';
        fall?.(why);
      };
      // Picked up, thrown, or otherwise off the wall: the grip is simply over, and she is not dropped
      // either — whoever took her is holding her. Without this she is hauled straight back to the
      // line, because this runs at the top of every frame, before anything else can look at her mode.
      if (pet.mode !== 'cling' && pet.mode !== 'climb') { probe.why = 'mode-' + pet.mode; held = null; lostSince = 0; return; }
      // The piece of the wall she is on, this sample. Usually it is the very piece she took hold of, but
      // a window in front of it cuts the run in two and the pieces are numbered — so a drag across
      // another window renames the piece in her hands while the wall under her has not moved at all.
      // Matching the piece exactly and letting go when it was not there is what made a moving window
      // throw her off. So: the same piece if it is there, otherwise another piece of the same side of
      // the same window, preferring the one her middle is actually on.
      let now = edges.find(e => e.id === was.id);
      if (!now || !climbable(now, scale)) {
        const wall = wallOf(was);
        const pieces = edges.filter(e => wallOf(e) === wall && climbable(e, scale));
        if (pieces.length) {
          // 只认她身子所在的那一段。以前找不到就退而取 top 最近的一段 —— 那正是「闪到上面」的
          // 另一个入口：她那一段被前面的窗口压得太短、整个从样本里消失时，最近的往往是上面那一段，
          // 于是她的 y 被搬到那一段的边上。她那一段没了就是没了。
          now = pieces.find(e => pet.fy >= e.top - 1 && pet.fy <= foot(e, desktopFloor) + 1);
          if (!now) return knockedOff('covered');
        }
      }
      if (!now || !climbable(now, scale)) {
        // Nothing about that side in this sample: a drag across another window, a snap, a frame the
        // scanner missed. She holds on where she is and waits for the next sample rather than being
        // dropped by one that never said the window was gone (see LOST_GRACE).
        if (!lostSince) lostSince = nowTime();
        const gone = nowTime() - lostSince;
        if (gone <= LOST_GRACE) {
          // A frame with nothing about her side in it: a window dragged across another one gets its
          // side cut into pieces, and a piece can be missing from a sample now and then. Holding her
          // still through those frames is what "she stutters while the window slides" was — the window
          // keeps going, she does not, and the next sample puts her somewhere else. She has no new
          // position to be on, so carry her on the last speed she was moving at instead, bounded by
          // how long a sample may be missing at all.
          probe.lost++;
          const last = was;
          const carry = Math.min(LOST_GLIDE_MS, gone);
          pet.x = pet.target = holdX(last, scale) + driftX * carry;
          const glide = clamp(last.headY + rel + driftY * carry, ceiling(last, scale, desktopFloor), foot(last, desktopFloor));
          pet.fy = glide;
          pet.fyShift = 0;
          return;
        }
        probe.why = 'lost'; held = null; lostSince = 0; fall(); return;
      }
      if (lostSince) {
        // Back, after samples that said nothing about it. None of what she missed was the window being
        // flung, so the hold gets the same moment of grace a fresh one does: the shift she comes back to
        // is followed rather than dropped for.
        lostSince = 0; grippedAt = nowTime();
      }
      const dx = now.origin - was.origin;
      // How far the window itself moved — taken from its own top edge, not from the top of the run: a
      // run cut in two by a window in front has a different top without the window having moved at all,
      // and reading that as movement would pull her up or down the face for no reason.
      const dy = now.headY - was.headY;
      // A fresh grip holds through whatever the window does for a moment: the sample arriving with it
      // can predate the window settling, and dropping her on that looks like a knock-off on touch.
      if ((Math.abs(dx) > SHAKE || Math.abs(dy) > SHAKE) && nowTime() - grippedAt > GRIP) { probe.why = 'shake'; held = null; fall(); return; }
      held = now;
      pet.facing = now.side;

      const t = nowTime();
      // Where this sample puts her, exactly: on the line, at her own place along it.
      const line = holdX(now, scale);
      // **Her height is an absolute position, not an accumulation.** Along the line she is put back on
      // the sample's own x every frame, so an error lasts one frame; up and down it used to be
      // `pet.fy + dy`, i.e. the window's movement added to whatever she was at — and anything extra that
      // went in on one frame (a drift, a clamp at either end of the run) stayed in for good. That is what
      // "dragging a window up and down and she drifts" was: the same window position, re-added every
      // sample, on top of a number that had already been moved. So keep the one thing that should persist
      // — how far down the window she is, from its own top edge — and rebuild her y from it each frame.
      if (rel === null) rel = pet.fy - was.headY;
      // Where the window puts her — but the clamping is only for this frame. `rel` is where she is on
      // the window, and a window sliding up to the top of the screen must move her up with it without
      // rewriting that: she used to be left at the top of the run for good, so dragging a window to the
      // top edge had her "climb" to its very top and then refuse to come back down with it.
      //
      // 但夹回只对「窗口自己变了」成立。同一扇窗、顶边和高度都没变（`origin`/`headY`/`reach` 都一样），
      // 只是这一段被前面的窗口**盖掉**了：她那一段没有框线了，夹进剩下那一截就是她**从窗口下方
      // 一下闪到窗口上方**（日志实证：边从 210..1018 变成 210..449，她就从 y=829 跳到 y=449）。
      // 这种时候不夹，直接顶开。
      const want = now.headY + rel;
      const low = foot(now, desktopFloor);
      const high = ceiling(now, scale, desktopFloor);
      const covered = Number.isFinite(now.reach) && now.reach === was.reach && now.headY === was.headY
        && want <= now.headY + now.reach
        && (want < high - 1 || want > low + 1);
      if (covered) return knockedOff('covered');
      const alongWindow = clamp(want, high, low);
      if (now !== sampleEdge) {
        // A new sample: it is the truth about where the window is. The speed it moved at is read off the
        // previous sample, and smoothed, so one jittery sample does not turn into a shove. Where the
        // sides carry the World's own `at`, that speed is worked out over the time between two *scans*
        // rather than between two arrivals: arrival times carry the hop's jitter, and a speed built on
        // them is wrong in both directions from one sample to the next.
        const stamped = Number.isFinite(now.at) && Number.isFinite(sampleStamp);
        const dt = stamped ? Math.max(1, now.at - sampleStamp) : Math.max(1, t - sampleAt);
        const had = sampleEdge !== null;
        driftX = had ? driftX + ((line - sampleX) / dt - driftX) * .7 : 0;
        driftY = had ? driftY + ((now.headY - sampleY) / dt - driftY) * .7 : 0;
        // This sample says the window has not moved along one of the two axes: do not keep carrying her
        // on the previous speed there. That is what "stops, but she slides a little further" was.
        if (had && line === sampleX) driftX = 0;
        if (had && now.headY === sampleY) driftY = 0;
        sampleEdge = now; sampleAt = t; sampleX = line; sampleY = now.headY;
        sampleStamp = Number.isFinite(now.at) ? now.at : NaN;
      }
      // How old the position she has just been given already is. With `at` this is the whole gap — the
      // World's scan, the hop into this process, the wait for a frame — and she is carried forward by
      // all of it. Without it, all that is left to measure is the time since that sample arrived, which
      // is why a dragged window used to leave her behind by exactly the part that was not counted.
      // .85 of it, not all: what is left over reads as being held rather than as overshooting.
      const age = Number.isFinite(now.at) ? Math.max(0, Date.now() - now.at) : Math.max(0, t - sampleAt);
      const ahead = Math.min(DRIFT_MAX_MS, age) * .85;
      pet.x = pet.target = line + clamp(driftX * ahead, -DRIFT_MAX_PX, DRIFT_MAX_PX);
      // Her own y stays where the window actually puts her; the bit she is carried forward by is handed
      // over separately (`fyShift`, used when drawing) so that it can never be added into her position.
      pet.fy = alongWindow;
      pet.fyShift = clamp(driftY * ahead, -DRIFT_MAX_PX, DRIFT_MAX_PX);
      probe.n++; probe.ageSum += age;
      if (age > probe.ageMax) probe.ageMax = age;
      if (Math.abs(pet.x - line) > probe.offXMax) probe.offXMax = Math.abs(pet.x - line);
      if (Math.abs(pet.fyShift) > probe.offYMax) probe.offYMax = Math.abs(pet.fyShift);
    },
  };
}
