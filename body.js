/**
 * The pet kit: a body that stands on the floor of the stage, walks, runs, jumps, sits, sleeps,
 * is picked up and thrown, makes faces and short gestures, with particles (hearts, tears, z's,
 * dust, notes) and a shadow. A figure pack builds its body on it (`createBody`) and only draws:
 * Coo (web/coo/figure.js) and the whale (web/whale/figure.js) both do. A pack may also ignore the
 * kit and answer the body contract (web/figure-frame.js) on its own.
 *
 * Coordinates: the figure is drawn in logo units, facing right, ground at y=256, inside a 256 square.
 * The stage places it with translate(AX AY) rotate(rot) scale(kx ky) translate(-ax -ay); `toStage`
 * maps a logo point back to stage pixels for hit tests, particles and the bubble's spot.
 *
 * Nothing here plays sound or talks to the World: sounds are asked for through `opts.sfx` and what
 * happens to the body is told through `opts.onEvent`; the page around the frame does the rest.
 */
import { createPerchPhysics } from './perch-physics.js';
import { createClimbPhysics } from './climb-physics.js';
export { createRig } from './rig.js';

export const f = n => Math.round(n * 10) / 10;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = k => k * k * (3 - 2 * k);
/** 0 → 1 over [0, a] of k, holds, then back to 0 over [b, 1]: the shape of a gesture held for a moment. */
export const envelope = (k, a, b) => smooth(clamp(k / a, 0, 1)) * (1 - smooth(clamp((k - b) / (1 - b), 0, 1)));

/* ---------- legs and particles ---------- */
export const HIPS = [[104, 212], [150, 212]];
export const LEG_W = 30;
// a foot's round cap touches the ground
const FOOT_Y = 256 - LEG_W / 2;
export const STAND = HIPS.map(h => [h[0], h[1], h[0], FOOT_Y]);
export const DROP = 'M0 -9C4 -3 6 0 6 3.5A6 6 0 0 1 -6 3.5C-6 0 -4 -3 0 -9Z';
export function heartD(cx, cy, s) {
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  return `M${p(0, 14)}C${p(-7, 8)} ${p(-19, 1)} ${p(-19, -6)}C${p(-19, -15)} ${p(-8, -18)} ${p(0, -9)}C${p(8, -18)} ${p(19, -15)} ${p(19, -6)}C${p(19, 1)} ${p(7, 8)} ${p(0, 14)}Z`;
}

/* ---------- faces ----------
   What a face asks of the body and the figure: eye shapes and sizes, mouth gap, blush, marks over
   the head, particles. Coo draws these as they are; a figure with its own art reads what it can. */
const ring = o => ({ shape: 'ring', rx: 16, ry: 16, ...o });
const yawn = t => { const p = (t % 4.2) / 1.6; return p < 1 ? Math.sin(Math.PI * p) ** 2 : 0; };

export const FACES = {
  neutral:   { label: '平静', kao: '(0 0',  f: () => ({ gap: [50, 50], eyes: [ring(), ring()] }) },
  happy:     { label: '开心', kao: '(^ ^',  f: () => ({ gap: [58, 58], eyes: [{ shape: 'up' }, { shape: 'up' }], blush: .45 }) },
  wink:      { label: '眨眼', kao: '(0 ^',  f: () => ({ gap: [56, 52], eyes: [ring(), { shape: 'up' }] }) },
  love:      { label: '喜欢', kao: '(♡ ♡',  f: t => { const s = .8 + .08 * Math.sin(t * 9); return { gap: [56, 56], eyes: [{ shape: 'heart', s, sw: 8 }, { shape: 'heart', s, sw: 8 }], blush: .7, emit: 'heart' }; } },
  shy:       { label: '害羞', kao: '(o o *', f: () => ({ gap: [40, 40], eyes: [ring({ rx: 13, ry: 12, dx: -3, dy: 5 }), ring({ rx: 13, ry: 12, dx: -3, dy: 5 })], blush: 1, lookLock: true }) },
  surprised: { label: '惊讶', kao: '(O O',  f: () => ({ gap: [62, 62], eyes: [ring({ rx: 20, ry: 21 }), ring({ rx: 20, ry: 21 })], bang: true }) },
  angry:     { label: '生气', kao: '(ò ó',  f: () => ({ gap: [36, 36], eyes: [ring({ ry: 11, dy: 4 }), ring({ ry: 11, dy: 4 })], brows: 'angry', anger: true, shake: true }) },
  sad:       { label: '难过', kao: '(ó ò',  f: () => ({ gap: [34, 40], eyes: [ring({ ry: 14, dy: 4 }), ring({ ry: 14, dy: 4 })], brows: 'sad', emit: 'tear' }) },
  // a yawn narrows the eyes without squeezing them to a slit
  sleepy:    { label: '犯困', kao: '(- -',  f: t => { const y = yawn(t); return { gap: [50 + 14 * y, 50 + 14 * y], eyes: [{ shape: 'lid', ry: 10 - 5 * y }, { shape: 'lid', ry: 10 - 5 * y }] }; } },
  sleep:     { label: '睡着', kao: '(u u',  f: t => { const b = 40 + 6 * Math.sin(t * 1.7); return { gap: [b, b], eyes: [{ shape: 'down' }, { shape: 'down' }], emit: 'z' }; } },
  dizzy:     { label: '晕乎', kao: '(@ @',  f: t => ({ gap: [54 + 5 * Math.sin(t * 5), 48], eyes: [{ shape: 'spiral', rot: t * 7 }, { shape: 'spiral', rot: t * 7 + 1.4 }], orbit: true }) },
  dragged:   { label: '被拎起', kao: '(> <', f: t => { const g = 55 + 3 * Math.sin(t * 22); return { gap: [g, g], eyes: [{ shape: 'gt' }, { shape: 'lt' }], sweat: true }; } },
  // seated eyes rest open; once drowse passes .7 they are the closed sleep sprite (the shape swap hides under a blink)
  content:   { label: '惬意', f: (t, p) => { const d = p ? p.drowse : 0; const e = d > .7 ? { shape: 'down' } : { shape: 'lid', ry: 13.5 - 10 * d }; return { gap: [46, 46], eyes: [e, { ...e }] }; } },
  waking:    { label: '醒来', f: (t, p) => {
    const mt = p ? p.modeT : 1;
    const k = clamp(mt / .5, 0, 1), y = mt > .5 ? Math.sin(clamp((mt - .5) / .9, 0, 1) * Math.PI) : 0;
    const r = Math.max(0, 10 * k * (1 - .7 * y));
    return { gap: [50 + 12 * y, 50 + 12 * y], eyes: [{ shape: 'lid', ry: r }, { shape: 'lid', ry: r }] };
  } },
  squeeze:   { label: '回神', f: () => ({ gap: [44, 44], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }] }) },
  listening: { label: '倾听', f: () => ({ gap: [44, 44], eyes: [ring({ rx: 17, ry: 18, dy: -1 }), ring({ rx: 17, ry: 18, dy: -1 })], listen: true }) },
  thinking:  { label: '思考', f: t => ({ gap: [46, 46], eyes: [ring({ rx: 14, ry: 15, dx: 3, dy: -4 }), ring({ rx: 14, ry: 15, dx: 3, dy: -4 })], think: true }) },
  run:       { label: '冲刺', f: t => { const g = 55 + 4 * Math.sin(t * 16); return { gap: [g, g], eyes: [ring(), ring()], sweat: true }; } },
  smug:      { label: '得意', kao: '(¬ ¬', f: () => ({ gap: [52, 46], eyes: [{ shape: 'lid', ry: 8, dx: 4 }, { shape: 'lid', ry: 8, dx: 4 }], blush: .25 }) },
  // `lookAt` holds the gaze (and with it a figure's head) on a point, here away from whoever is there
  pout:      { label: '嘟嘴', kao: '(o o 3', f: () => ({ gap: [28, 28], eyes: [ring({ rx: 14, ry: 13 }), ring({ rx: 14, ry: 13 })], blush: .6, lookAt: [-5, -1] }) },
  worried:   { label: '担心', kao: '(ó ò ;', f: () => ({ gap: [40, 44], eyes: [ring({ ry: 17, dy: 2 }), ring({ ry: 17, dy: 2 })], brows: 'sad', sweat: true }) },
  determined: { label: '认真', kao: '(ò ó', f: () => ({ gap: [42, 42], eyes: [ring({ ry: 13, dy: 1 }), ring({ ry: 13, dy: 1 })], brows: 'angry' }) },
  flustered: { label: '慌张', kao: '(> <;', f: t => ({ gap: [50 + 3 * Math.sin(t * 22), 48], eyes: [{ shape: 'gt' }, { shape: 'lt' }], blush: 1, sweat: true }) },
  // `wide`: eyes wider than open (a figure with drawn eyes may use its surprised ones)
  scared:    { label: '害怕', kao: '(O O;', f: () => ({ gap: [38, 38], eyes: [ring({ rx: 18, ry: 19 }), ring({ rx: 18, ry: 19 })], brows: 'sad', wide: true, shake: true, sweat: true }) },
  excited:   { label: '期待', kao: '(☆ ☆', f: () => ({ gap: [60, 60], eyes: [ring({ rx: 18, ry: 19, dy: -1 }), ring({ rx: 18, ry: 19, dy: -1 })], sparkle: true, blush: .4 }) },
  cry:       { label: '大哭', kao: '(T T', f: t => { const g = 36 + 6 * Math.abs(Math.sin(t * 9)); return { gap: [g, g], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }], brows: 'sad', emit: 'tears', streams: true }; } },
  // a motion's own face (not one to ask for): eyes shut through a bow
  bowing:    { label: '鞠躬', f: () => ({ gap: [48, 48], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }] }) },
  confused:  { label: '疑惑', kao: '(0 o ?', f: () => ({ gap: [44, 40], eyes: [ring(), ring({ rx: 14, ry: 11 })], question: true }) },
};

/** The faces a word can ask for, and the motions the kit does by name. */
export const KIT_EXPRESSIONS = ['neutral', 'happy', 'wink', 'love', 'shy', 'surprised', 'angry', 'sad', 'sleepy', 'thinking',
  'smug', 'pout', 'worried', 'determined', 'flustered', 'scared', 'excited', 'cry', 'confused'];
export const KIT_MOTIONS = ['stand', 'jump', 'hop', 'look', 'turn', 'nod', 'shake', 'spin', 'sit', 'sleep', 'dizzy', 'walk', 'run',
  'wave', 'bow', 'shiver', 'flap', 'dance', 'fly', 'soar', 'soarleft', 'soarright', 'soarup', 'soardown',
  // Swimming: a short paddle, a sustained one, stopping, and steering or changing pace in the water.
  'swim', 'swimhold', 'swimstop', 'swimleft', 'swimright', 'swimup', 'swimdown', 'swimfast', 'swimslow',
  'soarfast', 'soarslow', 'soarauto', 'soarfastleft', 'soarfastright', 'soarhold', 'soarstop',
  // 窗口上沿：站到最近一扇窗口的顶边（ledges 来自 manifest 的 needs: ["windows"]）
  'perch',
  // 窗口侧边：抱住、上下爬、挂住、松手、翻上去、趴窗看
  'climb', 'climbup', 'climbdown', 'cling', 'letgo', 'peek', 'mantle'];
/** The tone each face plays as it comes on (the host's synthesized sounds, web/sound.js), filed as a face sound. */
const FACE_TONES = {
  happy: 'happy', wink: 'wink', love: 'love', surprised: 'surprised', angry: 'angry', sad: 'sad', shy: 'shy', sleepy: 'yawn',
  smug: 'wink', worried: 'hmm', determined: 'pop', flustered: 'shy', scared: 'surprised', excited: 'sparkle', cry: 'sad', confused: 'hmm',
};
/** Body modes in which the figure travels across the stage or squashes fast (dancing steps and sways on the spot). */
const MOVING_MODES = new Set(['drag', 'air', 'flying', 'swimming', 'crouch', 'land', 'walk', 'run', 'dance', 'cling', 'climb', 'mantle']);
/** Points on the body in logo units, for a figure that names none: where the eyes look from, where a tear starts,
 *  where z's and hearts start ([x from, x to, y]), the bubble's spot. `tears` (one start under each eye) has no default. */
const ANCHORS = { gaze: [140, 117], tear: [166, 136], z: [196, 40], hearts: [90, 175, 34], bubble: [128, 0], mouth: [150, 144] };
/** The body's box in logo units, for a figure that names none (`figure.extent`), and its hit circles (`figure.hits`). */
const EXTENT = [20, 12, 236, 256];
const HITS = [[128, 128, 108]];

/* ---------- the live pet: simulation, rendering, pointer ---------- */
/**
 * `els`: { petG, shadowEl, fxG }, SVG elements the body draws into (the shadow is an ellipse).
 * `opts.bounds()` returns { W, H, floorY, S } in stage pixels.
 * `opts.onEvent(kind, detail)` reports what happened to the body: arrived, interrupted, touch, mode, done.
 * `opts.sfx.play(name, kind, ...args)` asks for a sound (web/sound.js names them); an `sfx` without `play`
 * is called by name instead (`sfx.jump()`), for pages that record the calls.
 * `opts.enter: 'drop'` starts the pet above the top edge, falling to the floor.
 * `opts.words` are the pack's own words, beyond the kit's (KIT_EXPRESSIONS, KIT_MOTIONS):
 *   `{ id: { expression: { like, seconds?, sound? } } }` holds a face that takes its eyes and marks from the kit's
 *   face `like` (the figure gets the word as `frame.face` and may draw it its own way);
 *   `{ id: { motion: { seconds, face?, sound? } } }` is a gesture the figure draws from `frame.gesture`.
 * `opts.figure` draws the body: `figure.draw(petG, face, frame)` keeps its own elements inside `petG` (logo space,
 * feet at y=256). Its frame adds the face's name, the mode, how long the mode has run, the talk level,
 * drowsiness and how far the body sits.
 * `figure.groupTilt(mode, tilt, lean)`, if present, returns the rotation (degrees) the whole group gets
 * instead of tilt + lean; the frame carries tilt, lean and that rotation (groupRot) so the figure can bend the rest.
 * `figure.colors.z`, if present, colours the sleep z's (otherwise they take the `eye` class).
 * `figure.gestures`, if present, names the short gestures (nod, shake) the figure draws itself: the body then
 * leaves them out, and the frame's `gesture` ({ kind, k: 0..1 }, or null) says which one is playing and how far.
 * `figure.anchors`, `figure.extent` ([x0, y0, x1, y1]) and `figure.hits` ([[x, y, r]]) are in logo units; each
 * is read every frame, so a getter may follow the skin. `figure.setSkin(skin)` hears each skin change.
 */
export function createPet(els, opts) {
  const { petG, shadowEl, fxG } = els;
  let custom = opts.figure;
  const sfx = opts.sfx;
  const play = (name, kind, ...args) => (sfx.play ? sfx.play(name, kind, ...args) : sfx[name]?.(...args));
  const onEvent = opts.onEvent || (() => {});
  const words = opts.words || {};
  const perch = createPerchPhysics();
  const climb = createClimbPhysics();
  let desktopFloor = 0;
  let W = 0, H = 0, floorY = 0, S = .42, T = 0;
  let roam = opts.roam ?? 'free';
  let skin = opts.skin || null;
  /**
   * What she does on her own, and how much: the weights of her idle choices, how often a window she has
   * not read is worth a look and how long she stays, how fast she climbs, and whether she acts on her own
   * at all. Everything written here comes from the World's window_tune tool; anything missing keeps the
   * page's own default, so an empty object means "exactly as before".
   */
  /**
   * 她自己的设置。形象包没有 World 的 `window_tune` 工具，所以默认值就是下面这个空对象：
   *
   *   autonomy: false      不再自己去看窗口，只按口令做事（默认 undefined = 会自己看）
   *   watchAfter: 5        你在同一扇窗里连续操作几秒后，她爬上来守着看
   *   watchInset: 60       守窗时离窗口上沿多少（×S 像素），越大抱得越低
   *   climbPace: 1         爬多快，0.3–3
   *   peekRetry: 4         被弄下来几次后不再去看
   *   weights: { climb: 1, perch: 1, fly: 2, soar: 1, ... }  各动作在她自己一天里的份量，0 = 不做
   *   calmScale: .35       roam 为 calm 时，大幅动作按这个比例缩
   *
   * 想改就直接改这里；页面/World 也可以调 `set({ tune })` 覆盖（整份替换，不是合并）。
   */
  let tune = {};
  const tuneNum = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  const tunePair = (v, fallback) => (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? v : fallback);
  /** How long a visit lasts before she drops off the frame by herself. */
  const peekStay = () => { const [a, b] = tunePair(tune.peekStay, [20, 20]); return T + rnd(Math.min(a, b), Math.max(a, b)); };
  /** Climbing speed, both the step up and the slide down. */
  const climbPace = () => clamp(tuneNum(tune.climbPace, 1), .3, 3);
  /** 爬到顶上没掷中「翻上去」时，隔多久再掷一次（一趟最多 3 次，见 case 'climb' 的 atCeiling 支）。 */
  const MANTLE_REROLL = 1.2;
  /* ---- 打盹与作息 ------------------------------------------------------------
   * 白天她只是偶尔坐下歇一下（不睡），夜里可以真的打盹，但一次只打一会儿：到点自己
   * 起身，两次之间至少隔 `napCool` 秒。说「坐下」「睡觉」也一样——它们本来是「一直
   * 保持」的词，这里给它们一个上限，免得一坐一整天、一睡一整夜。
   *
   * 全部可以在 tune 里覆盖（整份替换，[白天, 夜里] 表示按现在几点取一个）：
   *   nightFrom / nightTo   夜里从几点到几点，默认 23 / 7
   *   napCool     [240, 480]   两次自主坐下 / 打盹之间的最少间隔（秒）
   *   napLen      [90, 180]    夜里一次打盹多久（秒）；白天固定 8–12 秒
   *   sitWeight   [9, 12]      自主「坐下」的权重（原来是 16）
   *   sitMax      [90, 180]    说「坐下」之后最多坐多久（秒），0 = 一直坐
   *   sleepMax    [180, 480]   说「睡觉」之后最多睡多久（秒），0 = 一直睡
   */
  const clock = typeof opts.clock === 'function' ? opts.clock : () => new Date();
  const hourOfDay = () => {
    const d = clock();
    if (d instanceof Date) return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    return Number(d) || 0;
  };
  /** 23:00–07:00 算夜里；跨零点的窗口按「或」判断。 */
  const isNight = () => {
    const h = hourOfDay(), a = tuneNum(tune.nightFrom, 23), b = tuneNum(tune.nightTo, 7);
    return a > b ? (h >= a || h < b) : (h >= a && h < b);
  };
  /** 一个 [白天, 夜里] 的值，按现在几点取。 */
  const nightPair = (v, fallback) => { const p = tunePair(v, fallback); return isNight() ? p[1] : p[0]; };
  const napCool = () => nightPair(tune.napCool, [240, 480]);
  const sitWeight = () => nightPair(tune.sitWeight, [9, 12]);
  /** 自主坐下：白天短短歇一下，夜里打一个两分钟上下的盹。 */
  const napLength = () => (isNight() ? tunePair(tune.napLen, [90, 180]) : [8, 12]);
  /** 一个「保持」的词最多保持多久；0 = 一直保持（旧行为）。 */
  const maxHold = (v, fallback) => {
    if (v === 0) return 1e9;
    const p = tunePair(v, fallback);
    return isNight() ? p[1] : p[0];
  };
  const sitMax = () => maxHold(tune.sitMax, [90, 180]);
  const sleepMax = () => maxHold(tune.sleepMax, [180, 480]);
  /** 刚坐完 / 刚睡醒的冷却期里，她不再自己找地方歇着。 */
  const cooling = () => T < (pet.napReadyAt ?? 0);
  let hold = 0; // until T: an order from outside is in progress, free roaming waits
  const pet = {
    x: 260, fy: 0, vx: 0, vy: 0, facing: 1, faceVis: 1, turnAt: -99, mode: 'idle', modeT: 0, dur: 0, target: 0,
    speed: 0, stride: 0, lift: 0, bob: 0, phase: 0, lastHalf: 0, lean: 0, tilt: 0, tiltV: 0,
    sq: 0, sqv: 0, sitK: 0, stretch: 0, low: 0, gap: [50, 50], look: [0, 0], drowse: 0,
    feet: STAND.map(l => [l[2], l[3]]), blinkT: 1.5, blinkAge: 9, expr: null, exprUntil: 0,
    nextAt: 1.2, emitAt: 0, airKind: 'jump', turned: false, startle: false, lastAct: '', nap: false, napReadyAt: 0,
    flyCruise: false, flyDescendAt: Infinity, flyFromY: 0, flyTX: 0, flyTY: 0, flySpeed: 0, flyLegs: 0, dragWrap: 0, flyBias: null,
    swimCruise: false, swimUntil: 0, swimTX: 0, swimTY: 0, swimSpeed: 0, swimBias: null, swimBubbleAt: 0,
    turnAcc: 0, dx: 0, dy: 0, jumpV: 700, jumpVx: 0, xf: null, blushK: 0,
    eyeSig: '', eyeCur: null, eyePrev: null, eyeDims: [[16, 16, 0, 0], [16, 16, 0, 0]], swapAge: 9,
    glance: [0, 0], glanceAt: 0, swing: 0, swingV: 0, prevA: null, velX: 0, talkK: 0, sfxAt: 0, skid: false, cue: 0,
    pulse: null, walkId: 0, walkWord: null, listening: false, thinking: false, thoughtShown: false, placed: false, noteAt: 0, tearN: 0,
    cursor: '',
  };
  const pointer = { x: -1e4, y: -1e4, inside: false, vx: 0, samples: [] };
  let press = null, strokeAcc = 0, petCool = 0;
  /** Whether the last frame found the horizontal speed not finite: a run of such frames is logged once. */
  let velXBad = false;
  const P = [];
  const anchors = () => ({ ...ANCHORS, ...custom?.anchors });
  let A = anchors();
  const minX = () => 104 * S + 8, maxX = () => W - 104 * S - 8;
  const faceDef = n => FACES[n] ?? FACES[words[n]?.expression?.like] ?? FACES.neutral;

  function resize() {
    const b = opts.bounds();
    if (W !== b.W || H !== b.H) perch.reset();
    W = b.W; H = b.H; desktopFloor = b.floorY; S = b.S;
    if (!perch.supported) floorY = desktopFloor;
    if (!pet.placed && W > 0) {
      pet.x = opts.startX != null ? opts.startX : W * .7; pet.placed = true;
      if (opts.enter === 'drop') { pet.fy = -8; pet.vy = 0; pet.vx = 0; pet.airKind = 'drop'; setMode('air'); }
    }
    // A body holding a window's side stands where that side is, which may be outside the walking
    // limits, and its feet are its own until it lets go — so neither is clamped under it.
    if (pet.mode !== 'cling' && pet.mode !== 'climb' && pet.mode !== 'mantle') {
      pet.x = clamp(pet.x, minX(), maxX());
      pet.target = clamp(pet.target, minX(), maxX());
    }
    if (pet.mode !== 'air' && pet.mode !== 'drag' && pet.mode !== 'flying' && pet.mode !== 'cling' && pet.mode !== 'climb' && pet.mode !== 'mantle') pet.fy = floorY;
  }

  function toStage(lx, ly) {
    const c = pet.xf;
    if (!c) return { x: pet.x, y: floorY };
    const x = (lx - c.ax) * c.kx, y = (ly - c.ay) * c.ky, r = c.rot * Math.PI / 180;
    return { x: c.AX + x * Math.cos(r) - y * Math.sin(r), y: c.AY + x * Math.sin(r) + y * Math.cos(r) };
  }
  /** The hit circles in stage pixels. */
  function hits() {
    return (custom?.hits ?? HITS).map(([x, y, r]) => ({ ...toStage(x, y), r: r * S }));
  }
  function hitPet(p) {
    return hits().some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r);
  }

  function setMode(m, o = {}) {
    const prev = pet.mode;
    // an arrival clears walkId before going idle, so anything else that ends a walk (a turn, a bow, listening) cuts it short
    if ((prev === 'walk' || prev === 'run') && pet.walkId) {
      onEvent('interrupted', { walkId: pet.walkId, x: Math.round(pet.x), by: m });
      pet.walkId = 0;
    }
    // a walk or run asked for as a word is done once the body stops going, whatever stopped it
    if ((prev === 'walk' || prev === 'run') && pet.walkWord && m !== prev) { onEvent('done', { word: pet.walkWord }); pet.walkWord = null; }
    pet.mode = m; pet.modeT = 0; pet.turned = false; pet.startle = false; pet.skid = false; pet.cue = 0;
    Object.assign(pet, o);
    pet.nap = o.nap === true;
    if (prev !== m) onEvent('mode', { mode: m });
  }
  const busy = () => pet.mode === 'drag' || pet.mode === 'air' || pet.mode === 'crouch' || pet.mode === 'flying' || pet.mode === 'swimming';
  function pickTarget(minDist) {
    for (let i = 0; i < 12; i++) {
      const x = rnd(minX(), maxX());
      if (Math.abs(x - pet.x) > minDist) return x;
    }
    return pet.x - minX() > maxX() - pet.x ? minX() : maxX();
  }
  /** The desktop is a ring. The wrap edges sit one body-width OUTSIDE the screen, not at it: at the body's own
   *  limits she is still half visible, so wrapping there would snap her from half-shown on one edge to
   *  half-shown on the other. Out here she slides fully out of view first and slides back in on the far side,
   *  which reads as one continuous move. Everything that moves her goes through `wrapX`, so walking, being
   *  thrown, being carried and flying all cross alike. */
  const wrapL = () => -104 * S, wrapR = () => W + 104 * S;
  const wrapSpan = () => wrapR() - wrapL();
  function wrapX() {
    const span = wrapSpan();
    if (pet.mode === 'drag') {
      // carried: while held her place is `dx`; `x` only catches up once she is let go. `dragWrap` moves with
      // it, so the pointer she is following stays on the same side of the ring as she is.
      if (pet.dx < wrapL()) { pet.dx += span; pet.dragWrap += span; }
      else if (pet.dx > wrapR()) { pet.dx -= span; pet.dragWrap -= span; }
    } else {
      if (pet.x < wrapL()) pet.x += span;
      else if (pet.x > wrapR()) pet.x -= span;
      // The wrap lands her just off the far edge, which is fine while she is travelling — she is drawn sliding
      // back in. Parked there she would simply be gone, so anything at rest is brought back onto the stage.
      // Nothing is drawn outside the screen, so this move cannot be seen.
      if (!MOVING_MODES.has(pet.mode)) pet.x = clamp(pet.x, minX(), maxX());
    }
  }
  /** Shortest way round the ring from `from` to `to`, signed. This is what makes her cross the edge on her own:
   *  when the way past an edge is shorter than the way across the screen, she takes it — so a target on the far
   *  right sends her out of the left. Measured against half the span, the ring's own definition of "which way". */
  function wrapDx(from, to) {
    const span = wrapSpan();
    let d = to - from;
    if (d > span / 2) d -= span;
    else if (d < -span / 2) d += span;
    return d;
  }
  /** A whole-body flip right after the last one reads as flailing, not as changing course. Turns go
   *  through here and wait out TURN_GAP; a fresh leg picks a point ahead while it is still cooling. */
  const TURN_GAP = 2;
  const inTurnGap = () => T - pet.turnAt < TURN_GAP;
  function faceTo(dir) {
    if (!dir || Math.sign(pet.facing) === dir) return false;
    if (inTurnGap()) return false;
    pet.facing = dir; pet.turnAt = T;
    return true;
  }
  /** A random x, but while a turn is still cooling only points on the side she faces. */
  function aheadX(face) {
    let x = rnd(minX(), maxX());
    if (face && inTurnGap()) {
      for (let i = 0; i < 12 && Math.sign(wrapDx(pet.x, x)) !== face; i++) x = rnd(minX(), maxX());
    }
    return x;
  }
  /** The nearest usable window top from the page's ledges, in stage pixels, or null. */
  function perchTarget() {
    const list = (opts.bounds?.().ledges ?? []).filter((l) => l && l.y < desktopFloor - 30 && l.x1 - l.x0 > 40);
    if (!list.length) return null;
    let best = null, bestD = Infinity;
    for (const l of list) {
      const cx = (l.x0 + l.x1) / 2;
      const d = Math.abs(wrapDx(pet.x, cx));
      if (d < bestD) { bestD = d; best = l; }
    }
    return { x: clamp((best.x0 + best.x1) / 2, minX(), maxX()), y: best.y };
  }
  /** A point in the air she may head for: across the stage, between 63 and 294 px above where she took off
   *  from, never so high her head leaves the top. Targets stay inside the ring, so a flight never has to pick
   *  a way round — she crosses only when she overshoots. */
  function flyPoint(fromY, face) {
    const ceiling = 250 * S + 14;
    return { x: aheadX(face), y: Math.max(ceiling, fromY - rnd(150, 700) * S) };
  }

  /** Runs a motion. Returns false when the body cannot take it now (in the air, being dragged). */
  /** Words that steer a flight already in progress. Said while she is up there they retarget her rather than
   *  being refused — `flying` counts as busy, so without this a sustained flight could never be steered, only
   *  watched until it ended. */
  const FLY_CMDS = new Set(['soarleft', 'soarright', 'soarup', 'soardown', 'soarfast', 'soarslow', 'soarauto',
    'soarfastleft', 'soarfastright', 'soarhold']);
  /** Retarget or re-pace her without taking off again: the mode clock, the height she is at and her momentum
   *  all carry over, so steering reads as her changing course rather than as a new flight starting. */
  function steerFlight(a) {
    if (a === 'soarfast' || a === 'soarfastleft' || a === 'soarfastright') pet.flyBias = true;
    else if (a === 'soarslow') pet.flyBias = false;
    else if (a === 'soarauto') pet.flyBias = null;
    if (a !== 'soarfast' && a !== 'soarslow' && a !== 'soarauto') {
      // a heading (or plain "keep going"): she stays up and heads that way
      const dir = (a === 'soarleft' || a === 'soarfastleft') ? -1 : (a === 'soarright' || a === 'soarfastright') ? 1 : 0;
      if (dir) { pet.flyTX = pet.x + dir * wrapSpan() / 3; pet.flyTY = pet.fy - rnd(120, 380) * S; }
      else if (a === 'soarup') { pet.flyTX = pet.x; pet.flyTY = Math.max(250 * S + 14, pet.fy - rnd(280, 560) * S); }
      else if (a === 'soardown') { pet.flyTX = pet.x + rnd(-180, 180) * S; pet.flyTY = Math.min(floorY - 60 * S, pet.fy + rnd(110, 240) * S); }
      pet.flySpeed = pickSpeed(240, 900);
      pet.flyCruise = true;
      pet.flyDescendAt = Infinity;
      if (a === 'soarhold' && pet.flyLegs < 1e9) pet.flyLegs = 1e9;
    }
    pet.expr = 'happy'; pet.exprUntil = T + 2;
  }
  /** Her pace for a leg of swimming: a brisk 130-340 px/s, around 1.5x the first cut, with a wider
   *  spread so a change of pace reads at a glance. Told to go faster or slower (`swimBias`), she takes
   *  the top or the bottom of that range. */
  function pickSwimSpeed() {
    if (pet.swimBias === true) return rnd(285, 340);
    if (pet.swimBias === false) return rnd(130, 160);
    const r = Math.random();
    return r < .28 ? rnd(130, 160) : r < .78 ? rnd(180, 255) : rnd(265, 340);
  }
  /** A point in the water she may head for: the whole screen above the taskbar, kept off the top edge. */
  function swimPoint(face) {
    const top = 170 * S + 14, bottom = Math.max(top + 40 * S, desktopFloor - 24 * S);
    return { x: aheadX(face), y: rnd(top, bottom) };
  }
  /** Words that steer a swim already in progress: a new heading or a new pace, without surfacing. */
  const SWIM_CMDS = new Set(['swimleft', 'swimright', 'swimup', 'swimdown', 'swimfast', 'swimslow', 'swimhold']);
  function steerSwim(a) {
    const top = 170 * S + 14, bottom = Math.max(top + 40 * S, desktopFloor - 24 * S);
    if (a === 'swimfast' || a === 'swimslow') {
      pet.swimBias = a === 'swimfast';
      pet.swimSpeed = pickSwimSpeed();
      if (!pet.swimCruise) { pet.swimCruise = true; pet.swimUntil = Math.max(pet.swimUntil || 0, T + 5); }
    } else if (a === 'swimhold') {
      pet.swimCruise = true; pet.swimUntil = Infinity;
    } else {
      const dir = a === 'swimleft' ? -1 : a === 'swimright' ? 1 : 0;
      if (dir) { pet.swimTX = pet.x + dir * wrapSpan() / 3; pet.swimTY = clamp(pet.fy + rnd(-120, 120) * S, top, bottom); }
      else if (a === 'swimup') { pet.swimTX = pet.x + rnd(-140, 140) * S; pet.swimTY = Math.max(top, pet.fy - rnd(140, 300) * S); }
      else if (a === 'swimdown') { pet.swimTX = pet.x + rnd(-140, 140) * S; pet.swimTY = Math.min(bottom, pet.fy + rnd(120, 260) * S); }
      pet.swimSpeed = pickSwimSpeed();
      pet.swimCruise = true;
      if (!Number.isFinite(pet.swimUntil) || pet.swimUntil <= T) pet.swimUntil = T + 6;
    }
    pet.expr = 'happy'; pet.exprUntil = T + 2;
  }
  /**
   * The words that put her on a window's side, move her along it, or take her off it. They answer in
   * every state rather than only while she is already climbing: `climb` said on the floor walks her to
   * the nearest side worth climbing and starts up it.
   */
  const CLIMB_CMDS = new Set(['climb', 'climbup', 'climbdown', 'cling', 'letgo', 'peek', 'mantle', 'perch']);

  /**
   * Going to look into a window: she flies to the side of one she has not read yet and takes hold of
   * it up near its top, leaning in over the frame to see what is on it.
   *
   * This is what the whole thing is for. A window that has just opened is worth a look; the same
   * window, once read, is not — so she flies to a window the climb physics still counts as fresh
   * (climb.fresh), and the visit is remembered the moment she has hold of it (climb.markSeen).
   * Nothing about the ground enters into it: looking in is a flight, not a walk.
   */
  function peekAct() {
    const target = climb.fresh(pet, S, desktopFloor);
    // Nothing new to look at. Not a failure worth a face: she simply carries on with her day.
    if (!target) { pet.peekWin = null; pet.peekDrops = 0; return false; }
    const spot = climb.lookSpot(target, S, desktopFloor);
    pet.climbWant = null; pet.peekId = target.id; pet.peekUntil = 0;
    // 这一趟要看的窗口：被弄下来以后她还认得它（自己爬回去，或者第二次就哭）。换目标时计数从零开始。
    pet.peekWin = climb.windowOf(target);
    pet.peekDrops = 0;
    pet.peekResumeAt = 0;
    pet.peekTryAt = T + rnd(1.2, 2.4);
    setMode('flying', {
      flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
      flyTX: spot.x, flyTY: spot.y, flySpeed: pickSpeed(320, 700), flyLegs: 1, airKind: 'fly',
    });
    holdFace('happy', 14);
    play('chirps', 'move');
    return true;
  }

  /**
   * Standing on a window's top edge: she goes there when she is curious, and when she is told to (the
   * perch word). A window top is usually up in the air, so walking to it is not a thing; she flies to
   * just under it and hops up. The hop itself happens at the end of the flight (see pet.perchWant in
   * the flying branch) because the perch only catches a body that is falling: the hop has to cross the
   * window top on the way down.
   */
  function perchAct() {
    if (climb.attached) {
      // 正抱着窗边：如果头顶就是这扇窗的窗沿，直接跳上去；不是的话松手，改飞别的窗沿。
      if (perch.roofNear(climb.headY, 10, S, desktopFloor)) return mantleJump();
      climb.release();
      pet.vx = 0; pet.vy = 0;
    }
    const roof = perch.nearestRoof(pet, S, desktopFloor);
    if (!roof) {
      // Nothing worth standing on (docked to the top of the screen, too narrow, gone): she says so
      // rather than standing there looking like she ignored the word.
      setExpr('confused', 2);
      pet.nextAt = T + 1.6;
      return false;
    }
    pet.climbWant = null; pet.peekId = null; pet.peekUntil = 0; pet.climbDir = 1;
    pet.perchWant = { y: roof.y, at: T };
    const under = pet.fy - roof.y;
    // Already under it and lined up: hop now, no second flight.
    if (Math.abs(pet.x - roof.x) < 16 * S && under > 0 && under < 200 * S) {
      pet.perchWant = null;                 // this hop is the whole errand: the flying branch has nothing to do
      pet.vx = 0; pet.vy = -Math.sqrt(2 * 2300 * (under + 60 * S)); pet.airKind = 'jump';
      play('jump', 'move');
      setMode('air');
      return true;
    }
    // Otherwise fly to a point just under the window top, lined up with its middle. The hop that puts
    // her feet on it is taken by the flying branch when the flight starts to settle.
    setMode('flying', {
      flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
      flyTX: clamp(roof.x, minX(), maxX()),
      flyTY: clamp(roof.y + 90 * S, 250 * S + 14, floorY - 20 * S),
      flySpeed: pickSpeed(300, 700), flyLegs: 1, airKind: 'fly',
    });
    holdFace('happy', 10);
    play('chirps', 'move');
    return true;
  }

  /**
   * 被打断的那次访问，落地之后接着做。
   *
   * 第一次被弄下来（被前面的窗口顶开、被甩、边从样本里丢了）：她从底下爬回去，把这一扇窗看完；
   * 第二次还被打断：她不再去了，坐在地上哭一会儿。这是他要的，别做成「默默放弃」。
   */
  function peekResume() {
    const win = pet.peekWin;
    if (!win) return false;
    if ((pet.peekDrops ?? 0) >= tuneNum(tune.peekRetry, 4)) {
      // 两次都没看成：坐下哭一会儿，哭完自己站起来，日子照过
      pet.peekWin = null; pet.peekDrops = 0;
      setExpr('cry', 6);
      setMode('sit', { dur: rnd(7, 11), willSleep: false });
      play('sad', 'face');
      return true;
    }
    const edge = climb.edgeOfWindow(win, S, desktopFloor);
    if (!edge) { pet.peekWin = null; pet.peekDrops = 0; return false; }
    // 还守着这一次访问：peekId 留着，抓住的时候重新记 seen 与停留时间
    pet.peekId = edge.id;
    const plan = climb.approach(edge, pet, S, desktopFloor, minX(), maxX());
    if (plan.kind === 'fly') {
      setMode('flying', {
        flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
        flyTX: plan.x, flyTY: plan.y, flySpeed: pickSpeed(300, 700), flyLegs: 1, airKind: 'fly',
      });
      holdFace('happy', 10);
      play('chirps', 'move');
      return true;
    }
    if (Math.abs(plan.x - pet.x) < 2) {
      if (!climb.attach(edge, pet.fy, pet, S, desktopFloor)) { pet.peekWin = null; pet.peekDrops = 0; return false; }
      // 抓住就是往上爬：climbDir 会从上一趟（滑到底、或者从下面爬上来那次）留成 +1，
      // 不重置的话她一抓住就顺着框往下滑 —— 「抱住了会自动往下滑」就是这一条。
      pet.climbDir = -1; pet.climbPeek = 0;
      play('grab', 'touch');
      setMode('climb');
      return true;
    }
    if (!walkTo(plan.x, true, 0)) { pet.peekWin = null; pet.peekDrops = 0; return false; }
    pet.climbWant = edge.id;
    return true;
  }

  /** 抱到哪儿算「高处」：窗口上沿下方 watchInset×S（默认 60 ≈ 50px，比看窗口的 150 高得多）。 */
  const watchHoldY = edge => climb.holdSpot(edge, S, desktopFloor, tuneNum(tune.watchInset, 60));

  /**
   * 上去看着他干：他正在用的那扇窗（前台），她抱在窗口边的高处一直看，没有 20 秒的期限。
   *
   * 和 peek 分开：peek 是「这扇窗我还没看过」（每扇一次、看够就走），这个是「他正在这里干活」——
   * 结束条件是这扇窗不再被操作（watchLeave 秒），或者他开了新窗口（按 peekSwitch 分心）。
   * 位置低了（从下面爬上来、或者抱住的位置不合适）就自己往上爬到她该在的高度。
   */
  function watchAct(fromBottom = false) {
    const edge = climb.activeEdge(pet, S, desktopFloor);
    if (!edge) return false;
    const nextId = climb.windowOf(edge);
    // 换了一扇窗才是新的一趟（被打断的计数归零）；同一扇窗爬回去不算新的一趟，否则永远哭不完。
    if (pet.watchId !== nextId) pet.watchDrops = 0;
    pet.watchId = nextId;
    pet.watchIdleSince = 0;
    pet.watchSpot = watchHoldY(edge);
    pet.peekWin = null; pet.peekDrops = 0; pet.peekUntil = 0; pet.peekId = null; pet.peekResumeAt = 0;
    pet.climbWant = null;
    // 哭完爬回去（他要求的路线）：**飞到这段可爬范围的下沿** → 收尾时被 climb.reach 抓住 →
    // 再由「位置低了往上爬」一步一蹬上到她该在的高度。不是直接飞到她该在的高处贴住。
    if (fromBottom && !climb.attached) {
      const foot = Math.min(edge.bottom, desktopFloor);
      setMode('flying', {
        flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
        flyTX: climb.holdX(edge, S),
        flyTY: clamp(foot - 16 * S, 250 * S + 14, floorY - 20 * S),
        flySpeed: pickSpeed(320, 720), flyLegs: 1, airKind: 'fly',
      });
      holdFace('happy', 10);
      play('chirps', 'move');
      return true;
    }
    // 已经抱着这扇窗：低了就往上爬，够高了就抱着看
    if (climb.attached && climb.windowOf(climb.edge) === pet.watchId) {
      if (pet.fy > pet.watchSpot + 6) { pet.climbDir = -1; setMode('climb'); return true; }
      setMode('cling');
      return true;
    }
    const plan = climb.approach(edge, pet, S, desktopFloor, minX(), maxX());
    if (plan.kind === 'fly') {
      setMode('flying', {
        flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
        flyTX: climb.holdX(edge, S), flyTY: pet.watchSpot,
        flySpeed: pickSpeed(320, 720), flyLegs: 1, airKind: 'fly',
      });
      holdFace('happy', 10);
      play('chirps', 'move');
      return true;
    }
    if (Math.abs(plan.x - pet.x) < 2) {
      if (!climb.attach(edge, pet.watchSpot, pet, S, desktopFloor)) { pet.watchId = null; return false; }
      // 抓住就是往上爬：同 peekResume，别让上一趟留下的 climbDir=+1 让她一抱住就往下滑
      pet.climbDir = -1; pet.climbPeek = 0;
      play('grab', 'touch');
      setMode('cling');
      return true;
    }
    if (!walkTo(plan.x, true, 0)) { pet.watchId = null; return false; }
    pet.climbWant = edge.id;
    return true;
  }

  /**
   * 他把她看着的那扇窗口拽走了（或者窗口把她顶开、甩掉）：先坐地上哭。
   *   · 第一次：哭完还要爬回去接着看（peekResumeAt 到点由 idle 那支重新调 watchAct）
   *   · 第二次：哭完就不看了（watchId 清掉，这一趟彻底结束）
   */
  function watchCry() {
    const drops = pet.watchDrops ?? 0;
    pet.watchDrops = 0;
    const again = drops < 2;
    const seconds = again ? 4.5 : 6;
    if (!again) {
      // 第二次：哭完就不看了。记住这一扇，别让 decide 过 5 秒又把她送上去。
      pet.watchGiveUp = pet.watchId;
      pet.watchId = null; pet.watchIdleSince = 0; pet.watchCryBack = false;
    } else {
      // 第一次：哭完还要从底下爬回去
      pet.watchCryBack = true;
    }
    setExpr('cry', seconds);
    // setExpr 遇到 busy 会悄悄什么都不做；这里必须哭出来，所以兜一层
    if (pet.expr !== 'cry') { pet.expr = 'cry'; pet.exprUntil = T + seconds; }
    play('sad', 'face');
    // 第一次哭 3-4 秒就起身回去；第二次哭久一点，然后不管了
    setMode('sit', { dur: again ? rnd(3.0, 4.2) : rnd(7, 11), willSleep: false });
    if (again) pet.peekResumeAt = T + 4.4;
    return true;
  }

  /** How often she says what she is doing on a frame: often enough to follow, rare enough to keep. */  let wallReportAt = 0;
  /**
   * One line about the frame she is on, out to the host's log — deliberately NOT through onEvent.
   * What she does on a window frame is her own business: the agent does not need to hear about every
   * lean and glance, and a Word's event stream is the wrong place for a trail. The log is where it
   * belongs, and it is the only way to tell "she went and looked" from "she never moved at all" —
   * which is exactly what could not be told apart the last time this was built.
   */
  function reportWall() {
    if (T < wallReportAt) return;
    // Once a second, whatever she is doing: the note drops repeats, so a line costs nothing until
    // something actually changes. Narrowing this to "on a frame" was a mistake — a run that reported
    // nothing at all could not be told apart from one that never happened, which is the whole reason
    // the report exists.
    wallReportAt = T + 1;
    const report = opts.onWallReport;
    const e = climb.edge;
    const d = {
      mode: pet.mode, x: Math.round(pet.x), y: Math.round(pet.fy),
      edge: e ? e.id : null, seen: climb.seenCount, want: pet.peekId ?? null,
      sides: climb.edgeCount,
      lost: climb.lost ? 1 : 0,
      strain: Math.round((pet.climbStrain ?? 0) * 100) / 100,
      until: pet.peekUntil > 0 ? Math.round((pet.peekUntil - T) * 10) / 10 : 0,
      look: [Math.round(pet.look[0] * 10) / 10, Math.round(pet.look[1] * 10) / 10],
      drop: pet.dropWhy ?? '-',
      // Taken and cleared here, so each line covers the second since the last one: lag is how old the
      // window position she is drawn from already was, off the drift she was carried by, lost the frames
      // the side was missing from the sample. Those three look the same from outside; this tells them apart.
      probe: climb.stats ? climb.stats() : null,
    };
    // Out through postMessage, to the page that owns this frame (web/body-host.js), and from there to
    // the host's log. The body lives in a sandboxed iframe: there is no preload in here and no
    // ipcRenderer either, so the parent page is the only way anything about her leaves this frame.
    try { parent.postMessage({ t: 'wall', d }, '*'); } catch { /* never a reason to stop */ }
    report?.(d);
  }

  /**
   * Where she looks while she is only holding on: a fresh thing to look at every second or two, mostly
   * side to side, sometimes up the run above her or down at the floor. Deliberately a state rather than
   * a per-frame random — the eyes travel to a place and stay there, which is what reads as looking
   * about; a fresh random every frame only reads as jitter.
   */
  function wallLook() {
    if (!(pet.climbLookAt > T)) {
      const r = Math.random();
      pet.climbLook = r < .38 ? [rnd(-4, -2), rnd(-1, 2)]
        : r < .76 ? [rnd(2, 4), rnd(-1, 2)]
        : r < .9 ? [-1, 3]
        : [2, -2];
      pet.climbLookAt = T + rnd(1.1, 2.3);
    }
    return pet.climbLook;
  }

  /**
   * 翻上窗口顶：起跳越过顶沿，横向落进窗口，落下时由 Window Perch 的窗台接住。
   *
   * 她的脚要到窗口顶，得抬高一整个身高（BODY_CLEAR = 200 rig，约 168px）：1000 px/s 在 2300 的重力
   * 下升 217px，留了约 50px 余量（落到窗台时还在下坠，perch.land 才接）；横向 120 px/s 在半秒多里
   * 挪一百来像素，正好从框线外侧落进窗口里侧。airKind 用 jump 不用 throw —— throw 会被空中抓握
   * 逻辑重新抓回框上。
   *
   * **只在她说要做的时候做**（mantle 这个词），爬到顶不会自己跳。
   */
  function mantleJump() {
    const side = climb.edge ? climb.edge.side : 1;
    const top = climb.headY;
    // 这扇窗的顶上到底有没有能站的窗沿？Window Perch 只推它看得见的（贴屏幕顶、太窄、被前面的
    // 窗口盖住的都没有）。没有就跳不上去：跳出去只会穿过窗口顶掉回地面，她再爬一次，看着就是
    // 「爬好几次才上去」。所以起跳前先问一句，没有就明说，不白跳。
    const roof = perch.roofNear(top, 10, S, desktopFloor);
    if (!roof) {
      pet.mantleWant = false;
      pet.dropWhy = 'mantle-noroof';
      setExpr('confused', 2);
      return false;
    }
    // 记下起跳高度：翻上去这一段到底是从哪儿起跳的，日志里 drop 字段能直接看出来。
    pet.dropWhy = 'mantle-' + Math.round(pet.fy);
    // 翻上去这一趟就算「看完了 / 守完了」：不清掉的话，站到窗沿上又会触发一次「上去看他那扇窗」，
    // 变成爬上去 → 翻上屋顶 → 再爬上去的循环。
    pet.watchId = null; pet.peekWin = null; pet.mantleRestUntil = T + 12;
    // 横向落点对准窗沿中点。air 里横向按 exp(-0.4t) 衰减，0.6 秒大约走 0.21 倍的 vx，
    // 所以给定目标位移 dx，vx ≈ dx / 0.21（夹住，别横着飞出去）。
    const dx = (roof.left + roof.right) / 2 - pet.x;
    pet.vx = clamp(dx / .21, -440, 440);
    pet.vy = -1000; pet.airKind = 'jump';
    pet.mantleWant = false;
    pet.mantleRollAt = 0; pet.mantleRolls = 0;   // 下一次爬到顶重新掷满 3 次
    climb.release();
    play('jump', 'move');
    setMode('air');
    return true;
  }

  /** What the climbing words do. False when the body cannot take the word at all. */
  function climbAct(a) {
    // A word from outside ends any pause she had taken on the wall: the next one is hers to set again.
    pet.climbRest = 0; pet.climbResting = false;
    // 他开口了：新的一趟重新给满三次「翻上去」的机会（不然上一趟掷完三次还在顶上时，这一趟不会掷）。
    pet.mantleRollAt = 0; pet.mantleRolls = 0;
    // 他开口叫她做攀爬/看窗的事，就当她「被告诉了」：之前放弃的那一扇也重新算数。
    // （那个放弃只有应用重启或他再说一次才解除，见 watchCry。）
    pet.watchGiveUp = null;
    // 只有 climbdown 这一次明确要往下（给它两秒的效力）：别的时候（尤其在看窗口/守窗时）不许顺着框滑下去。
    pet.climbForceDown = a === 'climbdown' ? T : 0;
    // And the last pull is forgotten with it: legs that had come off a frame she is no longer on are not
    // still off it, and the shift that held her hand on it is not still holding.
    pet.climbLegsOff = false; pet.climbLift = 0;
    // 翻上窗口顶：她要才做。已经在墙上就往顶上爬（爬到顶由 atTop 那支跳上去）；不在墙上先爬上去。
    if (a === 'mantle') {
      pet.mantleWant = true;
      pet.climbDir = -1; pet.climbPeek = 0; pet.peekUntil = 0;
      if (climb.attached) {
        // 就地往上爬，不换位置、不飞。drop 记成 mantle-climb，日志里能看出她走的是这条。
        pet.dropWhy = 'mantle-climb';
        if (climb.atTop(pet, S, desktopFloor)) { mantleJump(); return true; }
        setMode('climb');
        play('tick', 'move');
        return true;
      }
      // 没抱住：先就地够一下（贴着窗边掉下来的时候能直接抓住），够不着才去找窗口。
      if (climb.reach(pet, S, desktopFloor)) {
        pet.dropWhy = 'mantle-grab';
        setMode('climb');
        play('grab', 'touch');
        return true;
      }
      pet.dropWhy = 'mantle-away';
      return climbAct('climb');
    }
    // 别的动词都把这个念头放下：跳上去只对这一次的那个指令有效。
    pet.mantleWant = false;
    pet.perchWant = null;
    // Looking into a window is an errand of its own, answered from any state: she takes off towards it.
    if (a === 'peek') return peekAct();
    // And so is going up to stand on a window's top.
    if (a === 'perch') return perchAct();
    if (a === 'letgo') {
      const e = climb.edge;
      if (!e) return false;
      pet.dropWhy = 'letgo';
      // she pushes off the wall rather than simply dropping down its face
      pet.vx = -e.side * 90; pet.vy = 40; pet.airKind = 'drop';
      climb.release();
      play('tick', 'move');
      setMode('air');
      return true;
    }
    if (climb.attached) {
      // already on a wall: these steer her instead of starting anything new
      // told to hold on, she stays: the visit that would have ended by itself is called off
      if (a === 'cling') { pet.climbDir = 1; pet.peekUntil = 0; setMode('cling'); return true; }
      pet.climbDir = a === 'climbdown' ? 1 : -1;
      pet.climbPeek = 0;
      pet.peekUntil = 0;
      setMode('climb');
      play('tick', 'move');
      return true;
    }
    // up in the air or on the way down, right beside a window's side: take hold of it where she is
    if ((pet.mode === 'flying' || pet.mode === 'air') && climb.reach(pet, S, desktopFloor)) {
      pet.flyCruise = false; pet.flyDescendAt = Infinity; pet.flyLegs = 0;
      pet.expr = null;
      pet.climbDir = -1; pet.climbPeek = 0; pet.peekUntil = 0;
      play('grab', 'touch');
      setMode('climb');
      return true;
    }
    if (a === 'climbdown' || a === 'cling') return false;
    // On the ground: head for the nearest side worth climbing, then go up it.
    const target = climb.nearest(pet.x, pet.fy, S, desktopFloor);
    if (!target) {
      // Nothing to climb within reason. She says so rather than standing there: a word the World
      // accepted and a climb that actually happened must not look the same from outside.
      setExpr('confused', 2);
      pet.nextAt = T + 1.6;
      return false;
    }
    // Walking is only the way there while the side meets the floor she is standing on. A window hanging
    // clear of the ground has no side within reach of her feet, so she flies to it and takes hold on the
    // way — the same reach that catches her thrown at a window or dropping past one. Walking to a side
    // like that used to end with her lifted up its face from the floor, which is not a climb.
    let plan = climb.approach(target, pet, S, desktopFloor, minX(), maxX());
    pet.climbDir = -1; pet.climbPeek = 0;
    // 她现在站的地方可能根本不在这扇窗的侧边范围里 —— 典型是站在另一个窗口的上沿（窗沿）上，
    // 或者刚从高处掉下来。这种时候「走过去再抓住」是假的：走到横向位置之后 attach 用的是她当时的
    // 高度，落到边框上就是**从原处瞬移过去**（他 2026-10-17 报的「从 DSH 窗沿直接闪现抱住 QQ
    // 窗口」）。够不着就一律改成飞过去，落地那一下由收尾的 reach 接住。
    const runLow = Math.min(target.bottom, desktopFloor);
    if (plan.kind === 'walk' && (pet.fy < target.top - 6 * S || pet.fy > runLow + 6 * S)) {
      plan = {
        kind: 'fly',
        x: climb.holdX(target, S),
        y: clamp(Math.min(pet.fy - 90 * S, runLow - 20 * S), target.top, runLow),
      };
    }
    if (plan.kind === 'fly') {
      pet.climbWant = null;
      setMode('flying', {
        flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
        flyTX: plan.x, flyTY: plan.y, flySpeed: pickSpeed(300, 700), flyLegs: 1, airKind: 'fly',
      });
      holdFace('happy', 12);
      play('chirps', 'move');
      return true;
    }
    if (Math.abs(plan.x - pet.x) < 2) {
      if (!climb.attach(target, pet.fy, pet, S, desktopFloor)) { setExpr('confused', 2); return false; }
      play('grab', 'touch');
      setMode('climb');
      return true;
    }
    if (!walkTo(plan.x, true, 0)) { setExpr('confused', 2); return false; }
    pet.climbWant = target.id;
    return true;
  }

  function act(a) {
    // Said while she is up there, these have to get through: `flying` counts as busy, so without an early exit
    // here a sustained flight could never be steered or called off.
    if (pet.mode === 'flying' && FLY_CMDS.has(a)) { steerFlight(a); pet.lastAct = a; play('tick', 'move'); return true; }
    // Swimming answers while she is in the water: `swimming` counts as busy, so a sustained swim could
    // otherwise only be watched until it ended.
    if (pet.mode === 'swimming' && SWIM_CMDS.has(a)) { steerSwim(a); pet.lastAct = a; play('tick', 'move'); return true; }
    if (a === 'swimstop' && pet.mode === 'swimming') {
      pet.swimCruise = false; pet.swimUntil = 0;
      pet.expr = null; pet.lastAct = a;
      play('tick', 'move');
      return true;
    }
    if (a === 'soarstop' && pet.mode === 'flying') {
      pet.flyCruise = false; pet.flyLegs = 0; pet.flyDescendAt = pet.modeT;
      pet.expr = null; pet.lastAct = a;
      play('tick', 'move');
      return true;
    }
    // Climbing is not `busy`, so these answer before the gate below rather than being refused.
    if (CLIMB_CMDS.has(a)) { pet.lastAct = a; return climbAct(a); }
    // Anything that would move her has to wait until she is off the wall. Faces still get through.
    if (climb.attached) return false;
    if (busy()) return false;
    pet.expr = null; pet.lastAct = a;
    const seated = pet.mode === 'sleep' || pet.mode === 'sit';
    switch (a) {
      case 'stand': setMode(seated ? 'wake' : 'idle', seated ? { startle: false } : {}); pet.nextAt = T + 3; break;
      case 'walk': setMode('walk', { target: pickTarget(160) }); break;
      case 'run': setMode('run', { target: pet.x < W / 2 ? maxX() - rnd(0, 30) : minX() + rnd(0, 30) }); break;
      case 'jump': setMode('crouch', { jumpV: 720, jumpVx: pet.facing * 40 }); break;
      case 'hop': setMode('crouch', { jumpV: 480, jumpVx: 0 }); break;
      case 'look': setMode('look'); break;
      case 'turn': if (!seated) setMode('idle'); pet.facing *= -1; play('tick', 'move'); break;
      case 'nod': pulse('nod', .7); play('nod', 'move'); break;
      case 'shake': pulse('shake', .7); play('shake', 'move'); break;
      case 'spin': if (!seated) setMode('idle'); pulse('spin', .6); play('spin', 'move'); break;
      // 坐下 / 睡觉这两个「保持」的词现在有上限：坐一会儿、睡一会儿就自己起来（tune 设 0 可恢复一直保持）
      case 'sit': setMode('sit', { dur: sitMax(), willSleep: false }); break;
      case 'sleep': setMode('sleep', { dur: sleepMax() }); break;
      case 'dizzy': setMode('dizzy'); break;
      case 'wave': pulse('wave', 1.6); holdFace('happy', 1.8); break;
      case 'bow': if (!seated) setMode('idle'); pulse('bow', 1.6); holdFace('bowing', 1.5); play('tick', 'move'); break;
      case 'shiver': pulse('shiver', 1.8); play('shiver', 'move'); break;
      case 'flap': setMode('crouch', { jumpV: 540, jumpVx: 0 }); pulse('flap', 1.4); holdFace('happy', 1.6); play('chirps', 'move'); break;
      case 'dance': setMode('dance', { dur: 3.2 }); holdFace('happy', 3.4); play('dance', 'move'); break;
      // flight (see the 'flying' branch in step). `fly` lifts straight up and hovers where she stands.
      // `soar` is free flight: she crosses the stage and changes height as she likes, picking a fresh point
      // and a fresh speed for each leg, then settles. Nothing fixes her to one height or one lane.
      // Swimming: the whole screen is water. `swim` is a short, unhurried paddle that ends with her coming
      // back down to the bottom; `swimhold` never ends by itself. The words that steer a flight have their
      // swimming counterparts, and so do the two paces.
      case 'swim': case 'swimhold': case 'swimleft': case 'swimright': case 'swimup': case 'swimdown':
      case 'swimfast': case 'swimslow': {
        const hold = a === 'swimhold';
        const first = swimPoint();
        // a first leg that goes somewhere: from the floor she rises into the water instead of skimming it
        first.y = Math.min(first.y, Math.max(170 * S + 14, pet.fy - rnd(180, 340) * S));
        // A swim starts from the bottom of the screen: clear any window top she was standing on, or the
        // "bottom" would be that window's roof.
        perch.reset();
        setMode('swimming', {
          swimCruise: true,
          swimUntil: hold ? Infinity : T + rnd(6, 9.5),
          swimTX: first.x, swimTY: first.y, swimSpeed: pickSwimSpeed(), swimBias: null,
          swimBubbleAt: T + rnd(.4, 1.2), airKind: 'swim',
        });
        if (a === 'swimfast' || a === 'swimslow') { pet.swimBias = a === 'swimfast'; pet.swimSpeed = pickSwimSpeed(); }
        if (a === 'swimleft' || a === 'swimright') { pet.swimTX = pet.x + (a === 'swimleft' ? -1 : 1) * wrapSpan() / 3; }
        if (a === 'swimup') pet.swimTY = Math.max(170 * S + 14, pet.fy - rnd(140, 300) * S);
        if (a === 'swimdown') pet.swimTY = Math.min(desktopFloor - 24 * S, pet.fy + rnd(120, 260) * S);
        holdFace('happy', hold ? 30 : 9);
        play('chirps', 'move');
        break;
      }
      case 'swimstop': {
        // only reaches here when she is not swimming; then there is nothing to call off
        holdFace('neutral', 2); play('tick', 'move'); break;
      }
      case 'fly': {
        const up = rnd(150, 205) * S;
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: false, flyDescendAt: 1.1 + rnd(3.4, 5.0),
          flyTX: pet.x, flyTY: pet.fy - up, flySpeed: 0, flyLegs: 0, airKind: 'fly',
        });
        holdFace('happy', 9);
        play('chirps', 'move');
        break;
      }
      // 站到最近一扇窗口的顶边：走 CLIMB_CMDS 里的 perchAct（先飞到它上方，再落下去让 perch-physics 接住）。
      case 'soar': {
        const legs = 2 + Math.floor(Math.random() * 2);
        const first = flyPoint(pet.fy);
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
          flyTX: first.x, flyTY: first.y, flySpeed: pickSpeed(240, 900), flyLegs: legs, airKind: 'fly',
        });
        holdFace('happy', 18);
        play('chirps', 'move');
        break;
      }
      // Sustained flight: she keeps taking fresh points and never comes down on her own. `soarstop` ends it.
      case 'soarhold': {
        const first = flyPoint(pet.fy);
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
          flyTX: first.x, flyTY: first.y, flySpeed: pickSpeed(240, 900),
          flyLegs: 1e9, airKind: 'fly',
        });
        play('chirps', 'move'); break;
      }
      case 'soarstop': {
        // only reaches here when she is not flying; then there is nothing to call off
        holdFace('neutral', 2); play('tick', 'move'); break;
      }
      // Heading and pace in one word, for when both are wanted at once: `soarfast` then `soarright` works too,
      // but it also flies a leg of its own in between, which is not what "fast to the right" should look like.
      case 'soarfastleft': case 'soarfastright': {
        pet.flyBias = true;
        const dir = a === 'soarfastleft' ? -1 : 1;
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
          flyTX: pet.x + dir * wrapSpan() / 3, flyTY: pet.fy - rnd(150, 420) * S,
          flySpeed: 900, flyLegs: 1, airKind: 'fly',
        });
        holdFace('happy', 16); play('chirps', 'move'); break;
      }
      case 'soarfast': case 'soarslow': case 'soarauto': {
        // `soarauto` hands the choice back to her; the other two set the pace and then fly a leg, so the setting
        // shows itself straight away instead of only on the next flight.
        pet.flyBias = a === 'soarauto' ? null : (a === 'soarfast');
        holdFace('happy', a === 'soarauto' ? 3 : 18);
        if (a === 'soarauto') { play('tick', 'move'); break; }
        const legs = 2 + Math.floor(Math.random() * 2);
        const first = flyPoint(pet.fy);
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
          flyTX: first.x, flyTY: first.y, flySpeed: pickSpeed(240, 900), flyLegs: legs, airKind: 'fly',
        });
        play('chirps', 'move'); break;
      }
      // Directed flight. `soar` lets her choose where to go; these four say which way. Each is a single leg
      // (`flyLegs: 1`), so she cannot pick a fresh point mid-way and wander off the heading she was given.
      case 'soarleft': case 'soarright': {
        // sideways: a third of the ring away. That is short of half the span, so the shortest way round is the
        // way she was told — a longer leg would let the ring send her the other way instead.
        const dir = a === 'soarleft' ? -1 : 1;
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
          flyTX: pet.x + dir * wrapSpan() / 3, flyTY: pet.fy - rnd(150, 420) * S,
          flySpeed: pickSpeed(300, 900), flyLegs: 1, airKind: 'fly',
        });
        holdFace('happy', 16); play('chirps', 'move'); break;
      }
      case 'soarup': {
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
          flyTX: pet.x, flyTY: Math.max(250 * S + 14, pet.fy - rnd(320, 620) * S),
          flySpeed: pickSpeed(260, 620), flyLegs: 1, airKind: 'fly',
        });
        holdFace('happy', 16); play('chirps', 'move'); break;
      }
      case 'soardown': {
        setMode('flying', {
          flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
          flyTX: pet.x + rnd(-200, 200) * S,
          flyTY: Math.min(floorY - 60 * S, pet.fy + rnd(120, 260) * S),
          flySpeed: pickSpeed(240, 520), flyLegs: 1, airKind: 'fly',
        });
        holdFace('happy', 16); play('chirps', 'move'); break;
      }
      default: {
        // a gesture of the pack's own, drawn by its figure from frame.gesture
        const m = words[a]?.motion;
        if (!m) return false;
        if (!seated) setMode('idle');
        pulse(a, m.seconds);
        if (m.face) holdFace(m.face, m.seconds);
        if (m.sound) play(m.sound, 'move');
      }
    }
    return true;
  }
  function pulse(kind, dur) { pet.pulse = { kind, t0: T, dur }; }
  /** Her cruising speed for a leg. Left to herself she picks anywhere in the range; told to fly fast or slow
   *  (`flyBias`), she takes the top or the bottom of it instead. The setting sticks until it is changed back,
   *  so "fly fast" governs the flights that follow rather than just the one it was said in. */
  const pickSpeed = (lo, hi) => pet.flyBias == null ? rnd(lo, hi) : (pet.flyBias ? hi : lo);
  /** A motion's own face, without the expression's sound and bounce (act() has just cleared any held face). */
  function holdFace(n, seconds) { pet.expr = n; pet.exprUntil = T + seconds; pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6); }

  function setExpr(n, seconds) {
    if (n === 'sleep') { act('sleep'); return; }
    if (busy()) return;
    if (n === 'dragged') {
      pet.expr = null;
      pet.vy = -1150; pet.vx = rnd(-120, 120); pet.airKind = 'throw'; pet.sqv -= 3;
      play('whoosh', 'move'); play('jump', 'move');
      setMode('air'); return;
    }
    if (n === 'dizzy') { pet.expr = null; setMode('dizzy'); return; }
    if (pet.mode === 'look' || pet.mode === 'land') setMode('idle');
    const own = words[n]?.expression;
    pet.expr = n; pet.exprUntil = T + (seconds ?? own?.seconds ?? (n === 'sleepy' ? 4.4 : 3.2));
    pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6);
    pet.sqv += n === 'surprised' ? -2.2 : .8;
    const tone = own?.sound ?? FACE_TONES[n];
    if (tone) play(tone, 'face');
    if (n === 'love') for (let i = 0; i < 4; i++) emitHeart();
  }

  /**
   * Does a word of the body's vocabulary: one of the kit's faces or motions, or one of the pack's own
   * (`opts.words`). A walk or run goes to the other side of the stage and reports `done` once it stops.
   * Returns false for a word it does not know or cannot take now.
   */
  function doWord(w) {
    if (w === 'neutral') { setExpr('neutral', .1); return true; }
    if (w === 'walk' || w === 'run') {
      const x = pet.x < W / 2 ? W * (.55 + Math.random() * .35) : W * (.1 + Math.random() * .35);
      if (!walkTo(x, w === 'run', 0)) return false;
      if (pet.mode === w) pet.walkWord = w;
      else onEvent('done', { word: w });
      return true;
    }
    if (KIT_MOTIONS.includes(w) || words[w]?.motion) return act(w);
    if (KIT_EXPRESSIONS.includes(w) || words[w]?.expression) {
      if (busy()) return false;
      setExpr(w);
      return true;
    }
    return false;
  }

  /** Walks (or runs) to stage x. Resolves the walk through onEvent('arrived' | 'interrupted'). */
  function walkTo(x, run, walkId) {
    if (busy()) return false;
    if (pet.mode === 'sleep' || pet.mode === 'sit') setMode('wake', { startle: true });
    const target = clamp(x, minX(), maxX());
    pet.expr = null;
    if (Math.abs(target - pet.x) < 2) { onEvent('arrived', { walkId, x: Math.round(pet.x) }); return true; }
    setMode(run ? 'run' : 'walk', { target, walkId });
    return true;
  }

  /** Stops the walk `walkId` where the pet stands; it reports the walk 'interrupted'. A finished walk is left alone. */
  function stopWalk(walkId) {
    if ((pet.mode === 'walk' || pet.mode === 'run') && pet.walkId === walkId) setMode('idle');
    // 包自己的 move（比如去窗口顶）也要能被页面叫停，不然 World 只能等 30 秒超时
    else if (pet.moveId === walkId && pet.mode === 'flying') {
      pet.flyCruise = false; pet.flyLegs = 0; pet.flyDescendAt = pet.modeT;
      pet.moveId = null;
      play('tick', 'move');
    }
  }

  function faceName() {
    const m = pet.mode;
    if (m === 'drag') return 'dragged';
    // Thrown up: startled at first, then she works out that her fins will hold her and settles into the glide.
    // The turn comes a beat after the throw, so the fright reads before the calm does.
    if (m === 'air' && pet.airKind === 'throw') return pet.modeT < 1.2 ? 'surprised' : 'happy';
    if (m === 'air' && pet.airKind === 'drop') return 'surprised';
    if (m === 'swimming') return 'happy';
    if (m === 'flying') return 'happy';
    // On a wall, whatever the conversation is putting on her face comes first: she talks, listens,
    // thinks and pulls faces up there exactly as she does on the floor. Only with nothing else asked
    // for does she wear the face of the job — pleased while she is only holding on, set while she
    // works her way along, and straining when someone is trying to pull her off the frame.
    if (m === 'climb' || m === 'cling') {
      if (pet.expr && T < pet.exprUntil) return pet.expr;
      if (pet.listening) return 'listening';
      if (pet.thinking) return 'thinking';
      // Being pulled at, she wears the face she pulls when she has been running: out of breath and
      // straining. It reads as effort, where a hard-set face read as her being annoyed instead.
      if ((pet.climbStrain ?? 0) > .25) return 'run';
      // 往上爬的时候一脸使劲：就是她跑步时那张流着汗的脸（run）。原来给的是 determined，
      // 太"平静"了，爬窗户这件事在她身上该是费力的。
      // 往下滑是高兴的（他要求的：下滑不该流着汗）；往上爬仍是使劲那张脸。
      if (m === 'climb') return pet.climbDir === 1 ? 'happy' : 'run';
      return 'happy';
    }
    if (m === 'dizzy') return pet.modeT < 2.4 ? 'dizzy' : 'squeeze';
    if (m === 'wake') return pet.startle ? 'surprised' : 'waking';
    if (pet.listening && m !== 'sleep') return 'listening';
    if (m === 'sleep') return 'sleep';
    if (pet.expr && T < pet.exprUntil) return pet.expr;
    if (pet.thinking) return 'thinking';
    if (m === 'sit') return 'content';
    if (m === 'run') return 'run';
    return 'neutral';
  }

  function decide() {
    const calm = roam === 'calm';
    // `fly` is a hover on the spot; `soar` is free flight across the stage, so it is the rarer of the two
    // Told to keep still (tune.autonomy false), she simply does not roll her own day: every word still
    // works, she just stops choosing things by herself.
    if (tune.autonomy === false) return;
    // 他在那扇窗里已经干了 watchAfter 秒（默认 5）：她上去看着他干。**只看他正在用的那一扇**——
    // 原来那条「自己去找一扇没看过的窗、看 20 秒就走」按他的要求去掉了（2026-10-17 晚）。
    if (T - (pet.activeSince ?? T) >= tuneNum(tune.watchAfter, 5) && climb.activeEdge(pet, S, desktopFloor)
        && climb.activeWindow() !== pet.watchGiveUp
        // 刚翻上窗顶、或者爬到顶没翻又滑下来的那一趟（mantleRestUntil）：12 秒内不再把她送上去，
        // 免得变成「爬上去 → 滑下来 → 一落地又爬上去」的上下反复（见 mantleJump 与 atCeiling 支）
        && T >= (pet.mantleRestUntil ?? 0)) {
      if (watchAct()) { pet.lastAct = 'watch'; pet.nextAt = T + rnd(2, 4); return; }
    }
    // `climb` stays on the list: she is the one who can tell whether there is a side worth going to,
    // and it stays one of the rarer choices even when roaming calmly — rare enough to be a surprise,
    // not so rare that it never happens on its own at all.
    //
    // The weights themselves come from tune when they are there (the World's window_tune tool writes
    // them): how much of her day goes on windows is a setting, not something baked into the page. With
    // no tune at all, the numbers are exactly the ones this used to carry. Calm scales the things she
    // does at large (walk, jump, flight, climbing) and divides out of the waiting, which is what makes a
    // calm day read as calm; looking, sitting and faces are the same either way.
    const w = tune.weights ?? {};
    const calmK = calm ? clamp(tuneNum(tune.calmScale, .35), .05, 3) : 1;
    const wg = (k, fallback) => {
      const v = Number.isFinite(w[k]) ? w[k] : fallback;
      if (k === 'wait') return calm ? v / calmK : v;
      return (k === 'look' || k === 'sit' || k === 'expr') ? v : v * calmK;
    };
    const opts2 = [['walk', wg('walk', 10)], ['run', wg('run', 0)], ['look', wg('look', 14)], ['jump', wg('jump', 2)], ['sit', wg('sit', sitWeight())], ['expr', wg('expr', 12)], ['fly', wg('fly', 2)], ['soar', wg('soar', 1)], ['climb', wg('climb', 1)], ['perch', wg('perch', 1)], ['wait', wg('wait', 30)]]
      // 刚歇过 / 刚睡醒的冷却期里，不再自己找地方坐下（`sit` 从候选里去掉）
      .filter(o => o[1] > 0 && (o[0] !== pet.lastAct || o[0] === 'wait') && (o[0] !== 'sit' || !cooling()));
    let r = Math.random() * opts2.reduce((a, o) => a + o[1], 0), pick = 'wait';
    for (const o of opts2) { if ((r -= o[1]) < 0) { pick = o[0]; break; } }
    if (pick === 'look') { setMode('look'); pet.lastAct = 'look'; }
    else if (pick === 'expr') { setExpr(['happy', 'wink', 'love', 'sleepy', 'surprised', 'shy'][Math.floor(Math.random() * 6)]); pet.lastAct = 'expr'; }
    // 自己选的坐：白天是短暂歇一下，夜里是打盹（nap：闭眼、到点自己起来）；不再自动转成睡过去
    else if (pick === 'sit') {
      const [a, b] = napLength();
      setMode('sit', { dur: rnd(a, b), willSleep: false, nap: isNight() });
      pet.lastAct = 'sit';
    }
    else if (pick !== 'wait') act(pick);
    if (pet.mode === 'idle' && T >= pet.nextAt) pet.nextAt = T + rnd(2, 4);
  }

  /* particles */
  function emit(type, p, o = {}) { P.push({ type, x: p.x, y: p.y, vx: 0, vy: 0, age: 0, life: 1, ...o }); }
  function emitHeart() {
    emit('heart', toStage(rnd(A.hearts[0], A.hearts[1]), A.hearts[2] + pet.low), { vx: rnd(-20, 20), vy: rnd(-70, -45), life: 1.6 });
  }
  function dustAt(lx, n, spread) {
    for (let i = 0; i < n; i++) {
      emit('dust', toStage(lx, 250), { vx: rnd(-spread, spread) - pet.facing * rnd(10, 40), vy: rnd(-30, -8), life: rnd(.4, .65) });
    }
  }

  function step(dt) {
    // a frame that took no time has nothing to advance, and the horizontal speed below divides by its length
    if (!(dt > 0 && dt < Infinity)) return;
    // One line about a visit while it is happening, whatever state she is in — a visit that never got
    // off the ground and one that got somewhere and came away look identical from outside otherwise.
    reportWall();
    // Two kinds of surface, two owners. While she is on a window's side the climb keeps her there and
    // the perch is told to forget its support, so a roof she was standing on cannot keep tugging at
    // her feet from underneath. Otherwise the perch runs exactly as before.
    if (climb.attached) {
      perch.reset();
      floorY = desktopFloor;
      climb.before(pet, desktopFloor, S, (why) => {
        // 她抓的那一处被前面的窗口盖掉（why = 'covered'）：她不是原地松手，是被顶开。横向和纵向的
        // 初速已经由 climb 侧给好，这里不清零，只换状态。边丢了、窗口被甩了这些照旧清零。
        if (why !== 'covered') { pet.vx = 0; pet.vy = 0; pet.airKind = 'drop'; }
        if (why) pet.dropWhy = why;
        // 正在看窗口的时候被弄下来：记一笔。落地以后她自己爬回去（第一次），第二次就坐下哭。
        // 被鼠标拎走不算（那是 grab，会把这个念头的全部状态都清掉）。
        if (pet.peekWin && (why === 'covered' || why === 'shake' || why === 'lost')) {
          pet.peekDrops = (pet.peekDrops ?? 0) + 1;
        }
        // 看着他正在用的那扇窗时被打断（他把窗口拽走 / 被前面的窗口顶开 / 边被甩丢）：也记一笔，
        // 落地后先坐下哭；哭完第一次还爬回去，第二次就不看了（见 watchCry）。
        if (pet.watchId && (why === 'covered' || why === 'shake' || why === 'lost')) {
          pet.watchDrops = (pet.watchDrops ?? 0) + 1;
        }
        setMode('air');
      });
    } else {
      floorY = perch.before(pet, desktopFloor, S, () => {
        pet.vx = 0; pet.vy = 0; pet.airKind = 'drop'; setMode('air');
      });
      // 脚下没有支撑、人却停在半空：要么 Window Perch 报了一扇屏幕上看不见的窗口，要么支撑刚好丢了
      // 却还停在落地前的那个高度。她这时会「踏空而行」（站着/pr 踩空气）。按着地面对齐。
      if (!climb.attached && !perch.supported && pet.fy < floorY - 8 &&
          ['idle', 'walk', 'run', 'look', 'sit', 'sleep', 'wake', 'dance'].includes(pet.mode)) {
        pet.fy = floorY;
      }
    }
    T += dt; pet.modeT += dt;
    // 前台窗口是谁、已经连续多久：watchAct 用它决定「该上去了」，cling 用它决定「他不看了，走」。
    const actWin = climb.activeWindow ? climb.activeWindow() : null;
    if (actWin !== pet.activeWin) { pet.activeWin = actWin; pet.activeSince = T; }
    wrapX();
    A = anchors();
    const m = pet.mode, mt = pet.modeT;
    let sqT = 0, strideT = 0, liftT = 0, leanT = 0, sitT = 0, bobT = 0, rate = 0, lookT = [0, 0], tiltT = 0;
    let tk = 160, tc = 12, drowseT = 0;
    const free = roam !== 'off' && T > hold && !opts.dialogOpen?.();

    pet.blinkT -= dt; pet.blinkAge += dt;
    if (pet.blinkT <= 0) { pet.blinkAge = 0; pet.blinkT = Math.random() < .2 ? .28 : rnd(2.2, 5.2); }

    const head = toStage(A.gaze[0], A.gaze[1]);
    const pdx = pointer.x - head.x, pdy = pointer.y - head.y, pm = Math.hypot(pdx, pdy) || 1;
    const track = () => {
      if (!pointer.inside) {
        if (T > pet.glanceAt) { pet.glance = Math.random() < .45 ? [0, 0] : [rnd(-3, 5), rnd(-3, 3)]; pet.glanceAt = T + rnd(1.2, 3); }
        return pet.glance;
      }
      const k = Math.min(1, pm / 120);
      return [pdx * pet.facing / pm * 5 * k, pdy / pm * 4 * k];
    };

    switch (m) {
      case 'idle': {
        // 落地了、站稳了：先处理「看他那扇窗时被打断」（哭 → 爬回去 / 不看了），再看别的。
        if (pet.peekResumeAt && T >= pet.peekResumeAt) {
          pet.peekResumeAt = 0;
          if (pet.watchId && (pet.watchDrops ?? 0) > 0) { watchCry(); break; }
          // 哭完了、还要看：从底下爬回去（他要求的「从底下爬上去」，不是飞过去贴住）
          if (pet.watchId && pet.watchCryBack) { pet.watchCryBack = false; if (watchAct(true)) break; }
          if (pet.watchId && climb.activeWindow() === pet.watchId && watchAct()) break;
          peekResume();
          break;
        }
        lookT = track();
        if (pointer.inside && !press && pdx * pet.facing < -50 && pm < 600) {
          pet.turnAcc += dt;
          if (pet.turnAcc > .9) { pet.facing *= -1; pet.turnAcc = 0; }
        } else pet.turnAcc = 0;
        if (pet.listening) { lookT = [3, -4]; tiltT = -7; leanT = -2; }
        if (free && !pet.listening && T > pet.nextAt && !(pet.expr && T < pet.exprUntil)) decide();
        break;
      }
      case 'walk': case 'run': {
        const run = m === 'run', d = wrapDx(pet.x, pet.target), dist = Math.abs(d), dir = Math.sign(d) || pet.facing;
        pet.facing = dir;
        const vMax = run ? 250 : 78;
        const vT = Math.min(vMax, run ? dist * 4 + 20 : dist * 3 + 14);
        strideT = run ? 17 : 10; liftT = run ? 15 : 8; bobT = run ? 7 : 3; rate = run ? 4.4 : 2.1;
        leanT = run ? (dist < 50 && pet.speed > 120 ? -6 : 11) : 4;
        if (leanT < 0 && !pet.skid) { pet.skid = true; play('skid', 'move'); }
        const ramp = Math.min(1, mt / (run ? .35 : .25));
        pet.speed = lerp(pet.speed, vT * smooth(ramp), ease(run ? 6 : 9, dt));
        pet.x += dir * Math.min(dist, pet.speed * dt);
        const k = clamp(pet.speed / vMax, 0, 1);
        strideT *= .4 + .6 * k; liftT *= .4 + .6 * k;
        pet.phase += Math.PI * 2 * rate * dt * Math.max(.35, k);
        lookT = [run ? 4 : 3, run ? 1 : 0];
        const half = Math.floor(pet.phase / Math.PI);
        if (half !== pet.lastHalf) {
          play('step', 'move', run, half & 1);
          if (run && pet.speed > 120) dustAt(128, dist < 50 ? 3 : 1, 20);
        }
        pet.lastHalf = half;
        if (dist < 1.5) {
          pet.speed = 0;
          const id = pet.walkId; pet.walkId = 0;
          // a walk that was only the way to a window's side ends on it rather than on the floor
          const want = pet.climbWant; pet.climbWant = null;
          const wantEdge = want ? climb.edgeById(want) : null;
          // 走到横向位置了，但脚下这个高度压根不在那扇窗的侧边范围里（站在别的窗口上沿上走过来的、
          // 或者半路掉下来了）：直接 attach 会把她**瞬移**到边框上（他 2026-10-17 报的「从 DSH
          // 窗沿直接闪现抱住 QQ 窗口」）。够不着就飞过去，收尾的 reach 会接住。
          if (wantEdge && !climb.sideReachable(wantEdge, pet.fy, S, desktopFloor)) {
            const low = Math.min(wantEdge.bottom, desktopFloor);
            pet.climbWant = want;
            setMode('flying', {
              flyFromY: pet.fy, flyCruise: true, flyDescendAt: Infinity,
              flyTX: climb.holdX(wantEdge, S),
              flyTY: clamp(Math.min(pet.fy - 90 * S, low - 20 * S), wantEdge.top, low),
              flySpeed: pickSpeed(300, 700), flyLegs: 1, airKind: 'fly',
            });
            holdFace('happy', 10);
            play('chirps', 'move');
          } else if (want && climb.attachById(want, pet.fy, pet, S, desktopFloor)) {
            pet.climbDir = -1; pet.climbPeek = 0;
            play('grab', 'touch');
            setMode('climb');
          } else {
            // walked all the way to a window side and it was no longer takeable: say so
            if (want) setExpr('confused', 2);
            setMode('idle'); pet.nextAt = T + rnd(1.2, 3.2);
          }
          if (id) onEvent('arrived', { walkId: id, x: Math.round(pet.x) });
        }
        break;
      }
      case 'look': {
        if (!pet.cue) { pet.cue = 1; play('look', 'move'); }
        if (mt < .9) lookT = [4, -4];
        else if (mt < 1.8) { if (!pet.turned) { pet.turned = true; pet.facing *= -1; } lookT = [5, 0]; }
        else if (mt < 2.6) lookT = [1, 4];
        else { setMode('idle'); pet.nextAt = T + rnd(1, 2.5); }
        break;
      }
      case 'sit': {
        sitT = 1;
        lookT = track().map(v => v * (1 - pet.drowse));
        if (pet.listening) { lookT = [3, -4]; tiltT = -7; }
        // 打盹：一坐下就慢慢闭眼，全程维持「打盹」的样子；普通坐下眼皮不动。
        // 旧写法只在最后 1.6 秒闭眼，是因为旧逻辑里坐完必接 sleep —— 现在不接了。
        drowseT = pet.nap ? clamp(mt / 2.2, .15, .95)
          : pet.willSleep && free ? clamp((mt - (pet.dur - 1.6)) / 1.2, 0, 1)
          : .15;
        if (pet.drowse > .5) leanT = 7 * pet.drowse * Math.pow(Math.max(0, Math.sin(T * 1.3)), 6);
        // 到点起身。dur 有上限的（打盹、或词给的 sitMax）连开着对话框也照起；
        // 只有 dur = 1e9 的「一直坐」仍旧等 free（对话时不动）。
        if (mt > pet.dur && (free || pet.dur < 1e8)) {
          pet.napReadyAt = T + napCool();
          if (pet.willSleep) setMode('sleep', { dur: rnd(8, 12) });
          else if (pet.nap) setMode('wake');
          else { setMode('idle'); pet.sqv -= 1.2; pet.nextAt = T + rnd(1.5, 3); }
        }
        break;
      }
      case 'sleep': {
        sitT = 1; drowseT = 1; leanT = 5;
        // 打盹 / 睡着都有上限：到点自己醒（开不开对话框都一样；只有 tune 设成 0 的「一直睡」才等 free）
        if (mt > pet.dur && (free || pet.dur < 1e8)) { pet.napReadyAt = T + napCool(); setMode('wake'); }
        break;
      }
      case 'wake': {
        if (pet.startle) {
          sitT = 0; lookT = [3, -2];
          if (mt > .9) { setMode('idle'); pet.nextAt = T + rnd(1.5, 3); }
        } else {
          sitT = mt < 1.1 ? 1 : 0;
          if (mt > .5 && !pet.cue) { pet.cue = 1; play('yawn', 'face'); }
          sqT = mt > .5 && mt < 1.3 ? -.1 : 0;
          leanT = mt < .5 ? 5 : mt < 1.2 ? -5 : 0;
          lookT = mt > 1.2 ? track() : [0, 0];
          if (mt > 1.8) { setMode('idle'); pet.nextAt = T + rnd(1, 2); }
        }
        break;
      }
      case 'crouch': {
        sqT = .24; sitT = .3;
        if (mt > .16) {
          pet.vy = -pet.jumpV; pet.vx = pet.jumpVx; pet.airKind = 'jump'; pet.sqv -= 2.6;
          play('jump', 'move');
          setMode('air');
        }
        break;
      }
      case 'air': {
        const from = { x: pet.x, y: pet.fy };
        // Thrown up she glides down rather than dropping: a gentler pull, capped so she settles into a steady
        // flutter instead of accelerating all the way to the floor. The cap only applies while falling, so the
        // throw itself still arcs the way a throw should.
        if (pet.vy > 0 && pet.airKind === 'throw') pet.vy = Math.min(pet.vy + 500 * dt, 170);
        else pet.vy += 2300 * dt;
        pet.vx *= Math.exp(-dt * .4);
        pet.x += pet.vx * dt; pet.fy += pet.vy * dt;
        // thrown past an edge: no bounce off it, she carries on out and comes back in the other side (wrapX)
        if (pet.fy - 250 * S < 0 && pet.vy < 0) { pet.fy = 250 * S; pet.vy = Math.abs(pet.vy) * .3; }
        sqT = -Math.min(.12, Math.abs(pet.vy) / 6000);
        tiltT = clamp(pet.vx * .025, -30, 30);
        tk = 70; tc = 8;
        // Thrown hard at a window's side: she takes hold of it on the way past. Only a throw, and
        // only at speed — set down beside a window, or hopping next to one, she falls exactly as she
        // always did. Reaching on a gentle drop is what made her stick to whatever she was put beside.
        if (pet.airKind === 'throw' && Math.hypot(pet.vx, pet.vy) > 260 * S && climb.reach(pet, S, desktopFloor)) {
          pet.vx = 0; pet.vy = 0; pet.airKind = 'jump';
          pet.expr = 'surprised';
          // 抓住以后默认往上，别带着上一趟的 climbDir=+1 继续往下滑
          pet.climbDir = -1; pet.climbPeek = 0;
          play('grab', 'touch');
          setMode('cling');
          break;
        }
        const platformY = perch.land(from, pet, desktopFloor, S);
        if (platformY !== null) floorY = platformY;
        if (pet.fy >= floorY && pet.vy > 0) land();
        break;
      }
      case 'swimming': {
        // Water, not air: no gravity and no rise-and-settle. She holds her depth, lies level and picks a
        // fresh point whenever she reaches the last one. `swimUntil` is the whole of a short swim; a
        // sustained one sets it to Infinity. `swimCruise` false means "surface now".
        const top = 170 * S + 14, bottom = Math.max(top + 40 * S, desktopFloor - 24 * S);
        if (pet.swimCruise && T >= pet.swimUntil) pet.swimCruise = false;
        // The faster she goes the flatter she lies; the paddle in the figure reads the same speed, so the
        // beat follows the pace without either side knowing about the other.
        tiltT = pet.facing * (72 + 16 * clamp((pet.speed || 0) / 320, 0, 1)); tk = 60; tc = 14;
        // a gentle roll with each stroke, so the level body still breathes
        leanT = 4 * Math.sin(pet.phase + 1);
        pet.phase += Math.PI * 2 * (1.05 + 1.1 * clamp((pet.speed || 0) / 210, 0, 1)) * dt;
        if (pet.swimCruise) {
          const dx = wrapDx(pet.x, pet.swimTX), dy = pet.swimTY - pet.fy;
          const dist = Math.hypot(dx, dy);
          if (dist > 4) {
            const v = Math.min(pet.swimSpeed, dist * 6 + 60);
            pet.speed = lerp(pet.speed, v, ease(3, dt));
            const step = Math.min(dist, pet.speed * dt);
            pet.x += dx / dist * step; pet.fy += dy / dist * step;
            if (Math.abs(dx) > 3) faceTo(Math.sign(dx));
            lookT = [clamp(dx / 60, -3, 3), clamp(dy / 60, -2, 2)];
          } else {
            // another leg: a fresh point and a fresh pace — slow, unhurried, sometimes quicker
            const p = swimPoint(pet.facing);
            pet.swimTX = p.x; pet.swimTY = p.y; pet.swimSpeed = pickSwimSpeed();
          }
        } else {
          // out of the water: down to the floor, levelling out as she goes, then stand up
          const dy = desktopFloor - pet.fy;
          pet.speed = lerp(pet.speed, 285, ease(4, dt));
          pet.fy += Math.sign(dy) * Math.min(Math.abs(dy), pet.speed * dt);
          tiltT = pet.facing * 62 * clamp(Math.abs(dy) / (50 * S), 0, 1);
          lookT = [2, 2];
          if (Math.abs(dy) < 2) {
            pet.fy = desktopFloor; floorY = desktopFloor;
            pet.speed = 0; pet.vy = 0; pet.sqv += .5;
            play('land', 'move', false);
            dustAt(128, 2, 40);
            pet.expr = null;
            setMode('land'); pet.nextAt = T + rnd(1.2, 2.2);
          }
        }
        // Bubbles at her mouth every second or two: two at a time, rising and wobbling as they go.
        if (T > (pet.swimBubbleAt ?? 0)) {
          const mx = (A.mouth ?? [150, 144])[0], my = (A.mouth ?? [150, 144])[1];
          const mouth = toStage(mx, my);
          for (let i = 0; i < 2; i++) {
            emit('bubble', { x: mouth.x + rnd(-4, 4) * S, y: mouth.y + rnd(-3, 3) * S },
              { vx: rnd(-6, 6) * S, vy: rnd(-38, -24) * S, life: rnd(1.2, 1.9), seed: rnd(0, 6.28) });
          }
          pet.swimBubbleAt = T + rnd(1.2, 2.6);
        }
        break;
      }
      case 'flying': {
        // A flight that is really a visit to a window says so on the way: without it, "she never set out"
        // and "the flight never took her there" leave exactly the same trail — none.
        if (pet.peekId) reportWall();
        // Deliberate flight, unlike the ballistic 'air': no gravity, so she holds herself up and goes where she
        // likes. One clock, three stages: rise (eased), free flight, settle. In free flight she heads for a point
        // in the air — both axes move — and on reaching it picks another and a new speed of her own, `flyLegs`
        // times over, before coming down. `flyDescendAt` is the mode time the settle begins at.
        const baseY = pet.flyFromY;
        // How far over she lies. Tied to her speed, not to the mode: she only goes flat out ("横着的 1") once
        // she is really moving, and drifts upright as she slows — slow flight and hovering are done standing up.
        // Cruise speed runs 240..900, so the 240..740 band maps onto 0..88 degrees.
        const flyTilt = () => 88 * clamp((pet.speed - 240) / 500, 0, 1);
        // the lift and the settle are eased and both end at rest, so their peak speed is 1.5 x distance / time.
        // Scaling the time with the distance keeps that peak near the cruise speed instead of flinging her up.
        // The lift and the settle are eased and both end at rest, so their peak speed is 1.5 x distance / time.
        // This divisor is deliberately well under the cruise cap: lift-off is a build-up, and at cruise speed
        // a long climb reads as a jump cut rather than as her rising.
        const span = Math.abs(baseY - pet.flyTY);
        const RISE = clamp(span / 240, .8, 2.4);
        const landY = Math.max(floorY, baseY);
        const FALL = clamp(Math.abs(landY - pet.flyTY) / 300, .7, 2.4);
        // the hover's bob fades in over the lift and out over the settle, so neither seam shows as a step
        const bob = Math.sin(T * 1.9) * 6 * S;
        pet.vx = 0; pet.vy = 0;
        if (mt < RISE) {
          const k = smooth(clamp(mt / RISE, 0, 1));
          pet.fy = baseY + (pet.flyTY - baseY) * k + bob * k;
          pet.speed = lerp(pet.speed, 0, ease(8, dt));
          sqT = -.1 * Math.sin(Math.PI * k);
          tiltT = pet.facing * flyTilt(); tk = 45;
          lookT = [2, -2];
        } else if (mt < pet.flyDescendAt) {
          if (pet.flyCruise) {
            const dx = wrapDx(pet.x, pet.flyTX), dy = pet.flyTY - pet.fy;
            const dist = Math.hypot(dx, dy);
            if (dist > 3) {
              // Only bleed speed off in the last stretch. The older curve started easing a long way out, so a
              // leg was never actually flown at the speed it was set to.
              const v = Math.min(pet.flySpeed, dist * 8 + 60);
              pet.speed = lerp(pet.speed, v, ease(3.2, dt));
              const stepLen = Math.min(dist, pet.speed * dt);
              pet.x += dx / dist * stepLen;
              pet.fy += dy / dist * stepLen;
              if (Math.abs(dx) > 4) faceTo(Math.sign(dx));
              tiltT = pet.facing * flyTilt(); tk = 45;
              lookT = [clamp(dx / 45, -4, 4), clamp(dy / 45, -3, 3)];
            } else if (pet.flyLegs > 1) {
              // another leg: a fresh point, and a fresh speed for it
              pet.flyLegs--;
              const p = flyPoint(baseY, pet.facing);
              pet.flyTX = p.x; pet.flyTY = p.y;
              pet.flySpeed = pickSpeed(240, 900);
            } else {
              pet.flyCruise = false;
              pet.flyDescendAt = mt + rnd(.9, 1.8);
            }
          } else {
            pet.speed = lerp(pet.speed, 0, ease(4, dt));
            tiltT = Math.sin(T * 1.4) * 3; tk = 45;
            lookT = track();
            pet.fy = pet.flyTY + bob;
          }
        } else {
          // The descent is a real fall rather than a scripted height. That is what lets the perch see her meet a
          // window edge on the way down and catch her on it — `land` only answers for a body that is falling.
          // The speed eases up from nothing, so the settle still reads as a settle rather than a drop.
          // A hop up onto a window top she set out for (perch word, or her own idea): the perch only
          // catches a body that is falling, so the crossing has to happen on the way down. Ninety seconds
          // is the shelf life of the intent: a hop meant for a flight that never got there must not fire
          // on some later landing of hers.
          if (pet.perchWant && T - (pet.perchWant.at ?? 0) < 90) {
            const roof = pet.perchWant; pet.perchWant = null;
            const rise = Math.max(40 * S, pet.fy - roof.y) + 60 * S;
            pet.vx = 0; pet.vy = -Math.sqrt(2 * 2300 * rise); pet.airKind = 'jump';
            play('jump', 'move');
            setMode('air');
            break;
          }
          pet.perchWant = null;
          const from = { x: pet.x, y: pet.fy };
          const k = clamp((mt - pet.flyDescendAt) / FALL, 0, 1);
          pet.vy = 360 * smooth(k);
          pet.fy += pet.vy * dt;
          pet.speed = lerp(pet.speed, 0, ease(4, dt));
          tiltT = pet.facing * flyTilt(); tk = 45;
          lookT = [1, 2];
          // settling beside a window's side, she takes hold of it: the way up a building after a flight
          if (climb.reach(pet, S, desktopFloor)) {
            pet.vy = 0; pet.speed = 0;
            pet.flyCruise = false; pet.flyDescendAt = Infinity; pet.flyLegs = 0;
            pet.expr = null;
            // 抓住以后默认往上：否则上一次滑到底留下的 climbDir=+1 会让下一段攀爬继续往下
            pet.climbDir = -1; pet.climbPeek = 0;
            // If this flight was a visit to look into a window, the visit is remembered here — once per
            // window, which is the whole rule — and it is given a length, so she drops off by herself
            // when she has seen enough instead of living on the frame.
            if (pet.peekId) {
              const e = climb.edge;
              if (e && e.id === pet.peekId) climb.markSeen(e);
              pet.peekUntil = peekStay();
            }
            pet.peekId = null;
            play('grab', 'touch');
            setMode('cling');
            break;
          }
          const platY = perch.land(from, pet, desktopFloor, S);
          const caught = platY === null ? null : perch.catchOn(pet.x, platY, S);
          if (caught !== null) {
            // a window edge was in the way: stand on it instead of passing through it
            pet.fy = caught; pet.vy = 0;
            pet.flyCruise = false; pet.flyDescendAt = Infinity; pet.flyLegs = 0;
            pet.expr = null;
            dustAt(128, 3, 45);
            play('land', 'move', false);
            setMode('idle'); pet.nextAt = T + rnd(1.6, 3.2);
            if (pet.moveId) { onEvent('arrived', { walkId: pet.moveId, x: Math.round(pet.x) }); pet.moveId = null; }
          } else if (pet.fy >= landY) {
            pet.vy = 0;
            pet.fy = landY; pet.flyCruise = false; pet.flyDescendAt = Infinity; pet.flyLegs = 0;
            pet.expr = null;
            dustAt(128, 3, 45);
            play('land', 'move', false);
            setMode('idle'); pet.nextAt = T + rnd(1.6, 3.2);
          }
        }
        break;
      }
      case 'cling': case 'climb': {
        // 手上其实没抓着窗边（边刚丢、数据换了一版、或者根本没 attach 成功）：不许原地做攀爬动作 ——
        // 那看起来就是「悬在半空爬空气」。掉下去比空爬自然。
        if (!climb.attached) { setMode('air'); break; }
        // She is on a window's side. `climb` works her way along it; `cling` holds on where she is.
        // Where the window has moved, climb.before has already carried her with it, this frame.
        let up = pet.climbDir === 1 ? 1 : -1;
        // 看着窗口（peek / 守着他的窗口）时不许顺着框往下滑：往下是「看完了」或者听 climbdown 才做的事。
        // 只有 climbdown 这一次明确指下来（climbForceDown），才允许 up 是 +1。
        if (up > 0 && (pet.peekWin || pet.watchId) && !(pet.climbForceDown && T - pet.climbForceDown < 2)) { pet.climbDir = -1; up = -1; }
        const pace = 58 * S;
        tiltT = 0; tk = 60;
        reportWall();
        // Pulled at by the pointer while she is holding on: she grips harder rather than letting go.
        // The strain is what the pose and the face below are drawn with — and it is the reason she
        // comes off only to a real yank, which the pointer handler measures and clears this on.
        const strain = pet.climbStrain ?? 0;
        pet.climbStrain = Math.max(0, strain - dt * .35);
        // Her legs come off the frame well before her grip does. Once they are off she is hanging on with
        // the one hand — and she hangs on **harder** for it: from then on the pull has to go a great deal
        // further before it takes her. The strain itself eases off when the pull does, and the legs go back
        // on the frame with it (see the kit's cling branch, which reads the strain the same way); only this
        // raised bar stays, which is the "she grips harder now" part rather than a pose she is stuck in.
        if (strain > .35) pet.climbLegsOff = true;
        // And a hand can let go too. Once the pull is off her and the legs are back on the frame she is
        // holding on with both arms and both knees again — so the raised bar goes back down with them.
        // Leaving it up was the other half of "she sticks and will not come off": the legs came back on,
        // but the next pull was still judged as if she were down to one hand.
        else if (strain < .25) pet.climbLegsOff = false;
        const legsOff = !!pet.climbLegsOff;
        // Working upward she stops of her own accord every few seconds, hangs there looking about, and
        // then goes on. A run up a window with no pause in it reads as a lift rather than as a climb,
        // and the pause is where the looking about belongs.
        const canRest = up < 0;
        if (!(pet.climbRest > 0)) pet.climbRest = T + rnd(2.0, 4.0);
        if (T >= pet.climbRest) {
          pet.climbResting = !pet.climbResting;
          pet.climbRest = T + (pet.climbResting ? rnd(1.4, 2.8) : rnd(2.2, 4.6));
        }
        const resting = canRest && !!pet.climbResting;
        // 到顶就没有下一步了：一步一蹬在这里只会一直把她往天花板顶，「抓 → 蹬 → 抓」循环不停，
        // 屏幕上就是**原地爬**。停住动作，挂在那儿等 2.4 秒那个计时让她转身往下（或 mantle 送她上去）。
        // 差几像素也算到顶（抱在守窗高度时常常差 1–3 像素，原来那样永远掷不到「翻上去」的骰子）
        const atCeiling = climb.nearTop(pet, S, desktopFloor, 4 * S);
        const climbing = !resting && !(up < 0 && atCeiling);
        if (m === 'climb') {
          if (climbing) {
            if (up < 0) {
              // 往上不是匀速平移，是一点一点蹬上去：先把上面那只手沿框线够上去抓住（这一段身体不动），
              // 抓住之后再蹬腿把身体送上一截。一步一停，停的那一下才是「抓」的意思。
              // STEP 乘 tune.climbPace：她爬多快是可调的（世界那只 window_tune 工具写），
              // 手抓的那一下与蹬的节奏不动，只改一步多高、往下滑多快。
              const STEP = 24 * S * climbPace(), GRAB = .26, PUSH = .30, CYCLE = GRAB + PUSH;
              pet.climbStepT = (pet.climbStepT ?? 0) + dt;
              const inStep = pet.climbStepT % CYCLE;
              if (inStep < GRAB) {
                const k = inStep / GRAB;
                pet.climbGrab = k * k * (3 - 2 * k);   // 手沿框线往上够
                pet.climbPush = 0;
                pet.climbStepE = 0;
              } else {
                const k = clamp((inStep - GRAB) / PUSH, 0, 1);
                const e = k * k * (3 - 2 * k);
                let de = e - (pet.climbStepE ?? 0);
                if (de < 0) de = e;
                pet.climbStepE = e;
                climb.slide(pet, -STEP * de, S, desktopFloor);
                pet.climbGrab = 1 - e;                 // 手跟着身体回到框上
                pet.climbPush = Math.sin(k * Math.PI); // 蹬出去的那一下
              }
            } else {
              // 往下是抱着框慢慢滑下去，不蹬。速度是 55*S：原来跟往上爬共用 pace（58*S），
              // 但往上现在是一段一段的，往下这个匀速就成了「比爬还慢」，他说要快一点。
              climb.slide(pet, 55 * S * climbPace() * dt, S, desktopFloor);
              pet.climbGrab = 0; pet.climbPush = 0; pet.climbStepE = 0;
            }
            // 腿的相位在往上往下都要走：脚的蹬和摆靠它，停在原地的话腿是死的。
            pet.phase += Math.PI * 2 * 1.1 * dt;
          }
          pet.speed = lerp(pet.speed, climbing ? pace : 0, ease(6, dt));
          // nose up the wall while she climbs, tilted back into it when she comes down.
          // Leaning **into** the frame is what gets the outside hand to the window: her near arm hangs off
          // a shoulder that sits at rig x 113, the frame runs at 54 past her middle (x 182), and an arm is
          // not that long. At 5 she leaned hardly at all, so that hand stopped short of the frame and hung
          // in the air beside it. At 11-13 the shoulders carry about 20 rig forward and the hand arrives.
          // 往上看、往下看：look 的第二个数是「往下看」为正（figure.js 里 angleY 用它压低头部）。
          // 往上爬的时候头要抬起来看着上面那一截，往下滑的时候看着下面。
          lookT = resting || (up < 0 && atCeiling) ? wallLook() : up < 0 ? [-1, -3] : [-3, 2];
          // 往下滑也是前倾的。原来这里给 -4（身体后仰着往下挪，像爬梯子下来）：可是手是靠前倾把
          // 肩膀送过去才够得到框线的 —— 后仰 4° 手尖就退到框线**外** 12px，掉在半空里，正是他说的
          // 「下滑的时候手没放到边框里」。9° 比爬升的 11° 略小，往下滑的样子还在，手仍压在内侧。
          leanT = up < 0 ? 11 : 9;
          if (climbing && T > pet.sfxAt) { play('step', 'move', false, Math.random() < .5); pet.sfxAt = T + rnd(.3, .46); }
        } else {
          pet.speed = lerp(pet.speed, 0, ease(6, dt));
          // Held on to, she looks about instead of staring into the frame — and since she is here to
          // read a window, most of that looking is into the window.
          lookT = wallLook();
          // 28 is chosen from a rendered sheet of 5 / 12 / 20 / 28 / 36, not from the number: leaning
          // moves the whole upper body towards the frame without changing where the arms sit on it, so
          // the only way to pick this is to look at her. At 20 the head was just reaching the frame line,
          // at 28 the body is plainly leaning into the window, and 36 reads as falling over.
          leanT = 28;
        }
        // Someone pulling at her: she does not slide along the frame and she is not dragged across it —
        // the pull goes into her grip instead, which is the only thing that reads as holding on harder.
        // What moves is her shape: her body leans into the pull, her free arm hangs, and her face turns
        // down and away from the hand that has hold of the frame.
        // Someone pulling at her: she does not slide along the frame and she is not dragged across it — the
        // pull goes into her grip instead, which is what reads as holding on harder. What moves is her
        // shape: her body leans into the pull, her legs come off the frame and hang, and her face turns down
        // away from the hand that has hold. A modest lean, turned by facing (the rig mirrors): big leans
        // pivot at her feet and swing her head out, and any shift added to hold her hand in place piles up
        // frame after frame, because only her x is rewritten from the frame line — her y is not.
        if (strain > .02) {
          const [pullX] = pet.climbPull ?? [0, 0];
          tiltT += pullX * pet.facing * strain * 22 + strain * 2.5 * Math.sin(T * 26);
          leanT += strain * 4;
          sqT -= strain * .05;
          lookT = [pullX * pet.facing * 2, 3];
        }
        // A visit to look into a window ends by itself: she lets go and drops off the frame. There is
        // no such clock on a grip that a word asked for (cling), or one a throw put her into, so those
        // simply stay until something else happens.
        if (pet.peekUntil > 0 && T >= pet.peekUntil) {
          pet.peekUntil = 0; pet.dropWhy = 'peek';
          // 看够了（20 秒）：这一扇窗的访问到此结束，被弄下来的计数一并归零
          pet.peekWin = null; pet.peekDrops = 0; pet.peekResumeAt = 0;
          const e = climb.edge;
          pet.vx = e ? -e.side * 70 : 0; pet.vy = 30; pet.airKind = 'drop';
          climb.release();
          play('tick', 'move');
          setMode('air');
          break;
        }
        // 他看哪扇她看哪扇（2026-10-17 晚改的）：
        //   · 焦点还在这一扇 → 老老实实抱着看；位置低了就自己往上爬
        //   · 焦点切到别的窗口满 watchAfter 秒 → 她丢下这扇过去看那扇（drop=watch-switch）
        //   · 这一扇被关掉 → 立刻走（她的窗口没了，climb.before 会把她放下，落地后再去找焦点那扇）
        // 不再有「看完 20 秒自己走」和「按概率去看新窗口」这两条：她只看他正在用的。
        if (pet.watchId) {
          if (!climb.edgeOfWindow(pet.watchId, S, desktopFloor)) {
            pet.watchId = null; pet.watchIdleSince = 0; pet.dropWhy = 'watch-closed';
            climb.release();
            pet.vx = 0; pet.vy = 60; pet.airKind = 'drop';
            play('tick', 'move');
            setMode('air');
            break;
          }
          if (climb.activeWindow() !== pet.watchId) {
            if (!pet.watchIdleSince) pet.watchIdleSince = T;
            else if (T - pet.watchIdleSince >= tuneNum(tune.watchAfter, 5)) {
              // 他在新窗口里待够久了：过去看那一扇
              pet.watchIdleSince = 0; pet.dropWhy = 'watch-switch';
              if (!watchAct()) { climb.release(); setMode('air'); }
              break;
            }
          } else pet.watchIdleSince = 0;
          // 「抱得低了就往高处爬」：目标是窗口上沿下方 watchInset×S
          if (m === 'cling' && pet.fy > (pet.watchSpot ?? 0) + 6) { pet.climbDir = -1; setMode('climb'); break; }
        }
        if (atCeiling) {
          if (up < 0) {
            // 到顶了：这两个字（mantle / 翻上去）他喊了就一定翻；没喊她自己掷一次骰子 ——
            // 2026-10-17 他要的：「我觉得她还是能自己决定跳不跳比较好」。骰子只在到顶那一刻掷一次，
            // 掷中之后再停半秒（像在掂量）才起跳，没掷中就照旧停 2.4 秒转身往下。
            if (pet.mantleWant) { mantleJump(); break; }
            // 到顶立刻掷第一次；没掷中就在顶上接着掷（每 MANTLE_REROLL 秒一次，一趟最多 3 次）。
            // 原来一辈子只掷这一下：30% 的趟次爬上来就白爬 —— 他 2026-10-25 说「六七次了从没见她翻上去」
            // 就是这个：每次到顶只有一次机会，看着像根本不翻。3 次全不中只剩 2.7%。
            if (!pet.mantleRollAt || T - pet.mantleRollAt >= MANTLE_REROLL) {
              const rolls = (pet.mantleRolls ?? 0) + 1;
              pet.mantleRolls = rolls;
              pet.mantleRollAt = T;
              if (rolls <= 3) pet.mantleWant = Math.random() < tuneNum(tune.mantleChance, .7);
            }
            // 想好了也还要掂量半秒才起跳（这一段是他要的「自己决定跳不跳」的那个停顿）。
            if (pet.mantleWant && T - pet.mantleRollAt >= .5) { mantleJump(); break; }
            // 正在看窗口 / 守着他的窗口时赖在顶上：不许被 2.4 秒那条计时赶下去（那会变成
            // 「抱住了又自己往下滑」）。看完 / 他走了才会走进下面那条。
            if (pet.peekWin || pet.watchId) pet.climbPeek = 0;
            else if (!pet.climbPeek) pet.climbPeek = T;
            // 4 秒而不是 2.4：三次掷骰要 0 + 1.2 + 2.4 秒才走完，2.4 秒就把她赶下去的话
            // 第三次永远轮不到。
            else if (T - pet.climbPeek > 4) {
              pet.climbDir = 1; pet.climbPeek = 0; pet.mantleRollAt = 0; pet.mantleRolls = 0;
              // 到顶自己下来这一趟到此为止：12 秒内别再被「守着他正在用的窗口」自动送上去。
              // 不然就是他 2026-10-17 报的那个循环：爬上去 → 停 → 滑下来 → 一落地又爬上去。
              // 他再开口叫她爬（指令）不受这条影响。
              pet.mantleRestUntil = T + 12;   // 到顶没翻、滑下来以后，等 12 秒就能再试一次（原来 30 秒）
            }
          } else { pet.mantleRollAt = 0; pet.mantleRolls = 0; }
        } else {
          pet.climbPeek = 0;
          // the bottom of the run: she steps off it and drops the rest of the way
          if (up > 0 && climb.atBottom(pet, desktopFloor)) {
            pet.dropWhy = 'bottom'; climb.release();
            pet.vx = 0; pet.vy = 120; pet.airKind = 'jump';
            setMode('air');
          }
        }
        break;
      }
      case 'land': {
        sitT = .35 * (1 - smooth(clamp(mt / .35, 0, 1)));
        lookT = [2, 2];
        if (mt > .4) setMode('idle');
        break;
      }
      case 'dizzy': {
        sitT = mt < 2.6 ? 1 : 0;
        if (mt < 2.4 && T > pet.sfxAt) { play('chirps', 'move'); pet.sfxAt = T + .9; }
        if (mt >= 2.4 && !pet.cue) { pet.cue = 1; play('shake', 'move'); }
        if (mt < 2.4) tiltT = 8 * Math.sin(T * 4.5) * Math.min(1, mt * 2);
        else if (mt < 3) { const k = (mt - 2.4) / .6; tiltT = 12 * Math.sin(mt * 34) * (1 - k); }
        else { setMode('idle'); pet.sqv -= 1; pet.nextAt = T + rnd(1.5, 3); }
        break;
      }
      case 'dance': {
        // a little two-step on the spot: the feet take turns, the body sways with them, notes float up
        strideT = 5; liftT = 10; bobT = 3;
        pet.phase += Math.PI * 2 * 1.1 * dt;
        tiltT = 7 * Math.sin(pet.phase);
        lookT = [3, -2];
        const half = Math.floor(pet.phase / Math.PI);
        if (half !== pet.lastHalf) play('step', 'move', false, half & 1);
        pet.lastHalf = half;
        if (T > pet.noteAt) { emit('note', toStage(A.z[0], A.z[1] + pet.low), { vx: pet.facing * rnd(10, 30), vy: -34, life: 1.8 }); pet.noteAt = T + .6; }
        if (mt > pet.dur) { setMode('idle'); pet.nextAt = T + rnd(1.5, 3); }
        break;
      }
      case 'drag': {
        pet.dx = lerp(pet.dx, pointer.x + pet.dragWrap, ease(28, dt));
        pet.dy = lerp(pet.dy, Math.min(pointer.y, floorY - 245 * S), ease(28, dt));
        tiltT = clamp(pointer.vx * .035, -40, 40); tk = 90; tc = 5;
        if (Math.abs(pointer.vx) > 500 && T > pet.sfxAt) { play('squeak', 'touch'); pet.sfxAt = T + rnd(.4, .7); }
        break;
      }
    }

    // short gestures layered over whatever the body is doing
    // (a figure that lists a gesture in `figure.gestures` draws it itself, from the frame's `gesture`)
    if (pet.pulse) {
      const k = (T - pet.pulse.t0) / pet.pulse.dur;
      if (k >= 1) pet.pulse = null;
      else if (custom?.gestures?.includes(pet.pulse.kind)) { /* the figure's own */ }
      else if (pet.pulse.kind === 'nod') leanT += 9 * Math.abs(Math.sin(k * Math.PI * 2));
      else if (pet.pulse.kind === 'shake') tiltT += 10 * Math.sin(k * Math.PI * 6) * (1 - k);
      else if (pet.pulse.kind === 'wave') tiltT += 6 * Math.sin(k * Math.PI * 6) * Math.sin(k * Math.PI);
      else if (pet.pulse.kind === 'bow') leanT += 16 * envelope(k, .25, .7);
      else if (pet.pulse.kind === 'flap') { tiltT += 7 * Math.sin(k * Math.PI * 8) * (1 - k); sqT -= .06 * Math.abs(Math.sin(k * Math.PI * 8)) * (1 - k); }
      else if (pet.pulse.kind === 'spin' && k > .5 && !pet.pulse.flipped) { pet.pulse.flipped = true; pet.facing *= -1; }
      else if (pet.pulse.kind === 'spin' && k < .5 && !pet.pulse.first) { pet.pulse.first = true; pet.facing *= -1; pet.sqv -= 1; }
    }

    const fname = faceName(), fc = faceDef(fname).f(T, pet);
    // while the page shows the thought in its status bubble, the face keeps the eyes without a second thought trail
    if (pet.thinking && pet.thoughtShown && fname === 'thinking') fc.think = false;
    if (fc.lookLock || pet.mode === 'sleep' || pet.mode === 'drag') lookT = [0, 0];
    else if (fc.lookAt) lookT = fc.lookAt;

    // eye shape changes hide under a quick blink; same-shape changes (ring size) ease
    const sig = fc.eyes.map(e => e.shape).join();
    if (sig !== pet.eyeSig) {
      if (pet.eyeCur) { pet.eyePrev = pet.eyeCur; pet.swapAge = 0; }
      pet.eyeSig = sig;
      fc.eyes.forEach((e, i) => { pet.eyeDims[i] = [e.rx ?? 16, e.ry ?? 16, e.dx || 0, e.dy || 0]; });
    }
    pet.swapAge += dt;
    pet.eyeCur = fc.eyes.map((e, i) => {
      if (e.shape !== 'ring' && e.shape !== 'lid') return e;
      const d = pet.eyeDims[i], tgt = [e.rx ?? 16, e.ry ?? 16, e.dx || 0, e.dy || 0];
      for (let j = 0; j < 4; j++) d[j] = lerp(d[j], tgt[j], ease(16, dt));
      return { ...e, rx: d[0], ry: d[1], dx: d[2], dy: d[3] };
    });
    pet.blushK = lerp(pet.blushK, fc.blush || 0, ease(6, dt));

    // springs & easing
    pet.sqv += ((sqT - pet.sq) * 280 - pet.sqv * 14) * dt;
    pet.sq = clamp(pet.sq + pet.sqv * dt, -.35, .45);
    pet.tiltV += ((tiltT - pet.tilt) * tk - pet.tiltV * tc) * dt;
    pet.tilt += pet.tiltV * dt;
    pet.lean = lerp(pet.lean, leanT, ease(7, dt));
    pet.sitK = lerp(pet.sitK, sitT, ease(m === 'land' ? 18 : 6, dt));
    pet.drowse = lerp(pet.drowse, drowseT, ease(m === 'sleep' ? 1.5 : m === 'sit' ? 4 : 6, dt));
    pet.stretch = lerp(pet.stretch, m === 'drag' ? 1 : 0, ease(8, dt));
    pet.stride = lerp(pet.stride, strideT, ease(10, dt));
    pet.lift = lerp(pet.lift, liftT, ease(10, dt));
    pet.bob = lerp(pet.bob, bobT, ease(10, dt));
    pet.look[0] = lerp(pet.look[0], lookT[0], ease(9, dt));
    pet.look[1] = lerp(pet.look[1], lookT[1], ease(9, dt));
    pet.gap[0] = lerp(pet.gap[0], fc.gap[0], ease(8, dt));
    pet.gap[1] = lerp(pet.gap[1], fc.gap[1], ease(8, dt));
    // turning reads as a quick card flip rather than a mirror snap
    pet.faceVis = lerp(pet.faceVis, pet.facing, ease(15, dt));
    if (m !== 'walk' && m !== 'run' && m !== 'dance' && m !== 'cling' && m !== 'climb' && m !== 'swimming') pet.phase = lerp(pet.phase, Math.round(pet.phase / Math.PI) * Math.PI, ease(6, dt));
    pointer.vx *= Math.exp(-dt * 6);

    // secondary motion for ears/antenna/scarf: lags behind horizontal movement
    const AX = pet.mode === 'drag' ? pet.dx : pet.x;
    if (pet.prevA != null) pet.velX = lerp(pet.velX, (AX - pet.prevA) / dt, .25);
    // lerp keeps a NaN or an infinity for good, and the swing with it: a figure's warps that read the swing then
    // draw nothing (the whale's hair, tail and skirt went missing, #87). Start the speed over and say what it came from.
    if (!Number.isFinite(pet.velX)) {
      if (!velXBad) console.warn(`[pet] 横向速度不是有限数,已归零:velX=${pet.velX} x=${AX} 上一帧x=${pet.prevA} dt=${dt} 模式=${m}`);
      velXBad = true;
      pet.velX = 0;
    } else velXBad = false;
    pet.prevA = AX;
    // dancing stays put but rocks: the rock swings what hangs off the body (ears, hair, skirt), as moving does
    const hugTight = m === 'cling' || m === 'climb' ? .3 : 1;
    const swingT = clamp(-(pet.velX * .06 * hugTight + (m === 'dance' ? pet.tiltV * .22 : 0)) * Math.sign(pet.faceVis || 1), -28, 28);
    pet.swingV += ((swingT - pet.swing) * 110 - pet.swingV * 7) * dt;
    pet.swing = clamp(pet.swing + pet.swingV * dt, -40, 40);

    pet.low = pet.sitK * 29 + pet.bob * Math.abs(Math.sin(pet.phase));
    pet.feet.forEach((ft, i) => {
      const hx = HIPS[i][0], hy = HIPS[i][1] + pet.low;
      let tx, ty;
      if (m === 'drag') { tx = hx + 7 * Math.sin(T * 11 + i * 2.2); ty = hy + 36; }
      else if (m === 'air' || m === 'flying') { tx = hx + (i ? 9 : -9); ty = hy + 33; }
      else if (m === 'cling' || m === 'climb') {
        // Round the frame like arms round a post: one knee either side of it, feet drawn in against it.
        // Pulled at, the legs come off it first — and they **come down**, hanging under her with the feet
        // turned towards whoever is pulling. Legs still up in the grip after the frame is no longer between
        // them is the difference between holding on and being carried off.
        // Both feet reach for the window's side, drawn up on to the frame — one knee out past it, the
        // other tucked in against it, and both well above where they stand on the floor. Standing, they
        // are 32 below the hips; here the inner one is level with them and the outer one higher still.
        // Both offsets are positive for the same reason the arms' are: the window is on the +x side of
        // her middle, so reaching for it is one direction, not one offset either side of the middle.
        // Pulled at, the give factor brings them down and lets them go.
        // 腿只有「绕髋旋转」一个自由度（figure 里 legA 就是 hip→foot 的夹角），没有膝关节：
        // 脚的目标横向给得越大，整条腿越是横着伸向窗口，脚就被伸到裙子后面去了（他说「看不见小腿和脚」）。
        // 所以让脚落在**髋的正下方偏窗口**，腿是垂下来的 —— 裙摆下沿在 rig y≈229，脚在 242 附近，
        // 正好露在裙摆外面。横向指向框线（框在 rig x≈173：i=1 的髋在 150，+23 就到；i=0 的髋在 104，
        // 腿长只有 45，够到 149 为止 —— 见交接里「leg_back 够不到框线」那条）。
        // 蹬的时候脚往上踩 16（腿跟着弯），看起来是被脚带上来的。
        const ph = pet.phase + i * Math.PI;
        const give = clamp(((pet.climbStrain ?? 0) - .25) / .4, 0, 1);
        const push = m === 'climb' ? (pet.climbPush ?? 0) : 0;
        tx = hx + (i ? 23 : 66) * (1 - give) + (i ? 5 : -5) * give
          + (2 * Math.sin(ph) - 3 * push) * (1 - give * .6);
        ty = hy + 30 * (1 - give) + 44 * give + (i ? -3 : 0) * (1 - give)
          + (2 * Math.cos(ph) - 16 * push) * (1 - give * .6);
      }
      else if (m === 'swimming') {
        // legs trail behind the level body and kick in alternation: after the 80° turn this is a fish's
        // little kick, not a walk
        const kick = Math.sin(pet.phase + i * Math.PI);
        tx = hx + (i ? 7 : -7) + 4 * kick;
        ty = hy + 33 + 4 * kick;
      }

      else {
        const ph = pet.phase + i * Math.PI;
        const sx = hx + pet.stride * Math.sin(ph), sy = FOOT_Y - pet.lift * Math.max(0, Math.cos(ph));
        tx = lerp(sx, hx + 26, pet.sitK); ty = lerp(sy, FOOT_Y, pet.sitK);
      }
      const r = m === 'drag' || m === 'air' || m === 'flying' ? 14 : m === 'cling' || m === 'climb' ? 20 : 40;
      ft[0] = lerp(ft[0], tx, ease(r, dt)); ft[1] = lerp(ft[1], ty, ease(r, dt));
    });

    if (fc.emit && T > pet.emitAt) {
      if (fc.emit === 'heart') { emitHeart(); pet.emitAt = T + .45; }
      if (fc.emit === 'z') { emit('z', toStage(A.z[0], A.z[1] + pet.low), { vx: pet.facing * 16, vy: -26, life: 2.4 }); pet.emitAt = T + 1.3; play('snore', 'snore', pet.modeT); }
      if (fc.emit === 'tear') { emit('drop', toStage(A.tear[0] + pet.look[0], A.tear[1] + pet.low), { vx: pet.facing * rnd(10, 30), vy: -20, life: 3 }); pet.emitAt = T + .8; }
      if (fc.emit === 'tears') {
        // both eyes cry, taking turns; a figure that names only its one tear spot cries from there
        const eyes = A.tears ?? [A.tear], [ex, ey] = eyes[pet.tearN++ % eyes.length];
        emit('drop', toStage(ex + pet.look[0] + rnd(-6, 6), ey + pet.low), { vx: pet.facing * rnd(-20, 50), vy: rnd(-60, -20), life: 3 }); pet.emitAt = T + .22;
      }
    }
    strokeAcc *= Math.exp(-dt * 1.5);
    petCool -= dt;

    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'drop') { p.vy += 900 * dt; if (p.y > floorY) p.age = p.life; }
      if (p.type === 'dust') p.vx *= Math.exp(-dt * 4);
      if (p.age >= p.life) P.splice(i, 1);
    }
    pet.talkK *= Math.exp(-dt * 12);
    pet._fc = fc; pet._fname = fname;
  }

  function land() {
    const impact = pet.vy, kind = pet.airKind;
    pet.fy = floorY; pet.vy = 0; pet.vx = 0;
    pet.sqv += clamp(impact * .0024, .8, 4.5);
    play('land', 'move', kind !== 'jump' && impact > 1000);
    dustAt(128, impact > 900 ? 7 : 3, 70);
    if (kind === 'throw' && impact > 1000) { setMode('dizzy'); onEvent('touch', { kind: 'crash' }); return; }
    setMode('land');
    // 看窗口被打断过、或者他正在用的那扇窗还没看完：落地站稳之后接着去（第二次以后就坐下哭）
    if (pet.watchId || (pet.peekWin && (pet.peekDrops ?? 0) > 0)) pet.peekResumeAt = T + .45;
    if (kind === 'throw') { pet.expr = 'surprised'; pet.exprUntil = T + .9; pet.nextAt = T + 2; }
    else if (kind === 'drop') { pet.expr = 'happy'; pet.exprUntil = T + 1.6; pet.nextAt = T + 2.6; }
    else pet.nextAt = T + rnd(.8, 2);
  }

  function render() {
    const fc = pet._fc || FACES.neutral.f(0), fname = pet._fname || 'neutral';
    const drag = pet.mode === 'drag';
    const br = Math.sin(T * (pet.mode === 'sleep' ? 1.7 : 2.4));
    const sx = (1 + pet.sq * .7) * (1 - .05 * pet.stretch) * (1 - .009 * br);
    const sy = (1 - pet.sq) * (1 + .09 * pet.stretch) * (1 + .016 * br);
    const ax = 128, ay = drag ? 36 : 256;
    const fyShift = pet.mode === 'cling' || pet.mode === 'climb' ? (pet.fyShift || 0) : 0;
    let AX = drag ? pet.dx : pet.x, AY = drag ? pet.dy : pet.fy + fyShift;
    if (fc.shake) AX += Math.sin(T * 60) * 1.4;
    else if (pet.pulse?.kind === 'shiver') AX += Math.sin(T * 75) * 1.1 * envelope((T - pet.pulse.t0) / pet.pulse.dur, .08, .85);
    // a figure may keep tilt and lean off the whole group and bend its own parts instead
    const kx = S * pet.faceVis * sx, ky = S * sy, lean = pet.lean * pet.faceVis;
    // In flight she turns right over onto her front, so the group has to turn about her middle rather than her
    // feet — pivoting 90° on the feet would swing her whole body clear off the anchor. `flyTurn` rides her tilt,
    // so the axis slides across as she levels out, and AY gives back the shift to leave her feet where they were.
    const flyTurn = drag ? 0 : Math.min(1, Math.abs(pet.tilt || 0) / 90);
    const ayUse = lerp(ay, 128, flyTurn);
    if (flyTurn > 0) AY -= (ay - ayUse) * ky;
    const rot = custom?.groupTilt ? custom.groupTilt(pet.mode, pet.tilt, lean) : pet.tilt + lean;
    pet.xf = { AX, AY, ax, ay: ayUse, kx, ky, rot };
    petG.setAttribute('transform', `translate(${f(AX)} ${f(AY)}) rotate(${f(rot)}) scale(${kx.toFixed(4)} ${ky.toFixed(4)}) translate(${-ax} ${-ayUse})`);

    const legs = pet.feet.map((ft, i) => [HIPS[i][0], HIPS[i][1] + pet.low, ft[0], ft[1]]);
    // drowsy blinks are slower
    const bd = .16 + .3 * pet.drowse, blink = pet.blinkAge < bd ? Math.sin(Math.PI * pet.blinkAge / bd) : 0;
    let eyes = pet.eyeCur || fc.eyes, eyeClose = 0;
    if (pet.swapAge < .07 && pet.eyePrev) { eyes = pet.eyePrev; eyeClose = pet.swapAge / .07; }
    else if (pet.swapAge < .16) eyeClose = 1 - (pet.swapAge - .07) / .09;
    const face = { ...fc, eyes, gap: pet.gap.map(g => Math.min(64, g + pet.talkK * 12)), blush: pet.blushK };
    const gesture = pet.pulse ? { kind: pet.pulse.kind, k: clamp((T - pet.pulse.t0) / pet.pulse.dur, 0, 1) } : null;
    custom.draw(petG, face, {
      look: pet.look, legs, low: pet.low, t: T, blink, eyeClose, acc: skin, swing: pet.swing,
      face: fname, mode: pet.mode, modeT: pet.modeT, talk: pet.talkK, drowse: pet.drowse, sit: pet.sitK, facing: pet.faceVis, tilt: pet.tilt, lean, groupRot: rot, gesture, speed: pet.speed, airKind: pet.airKind,
      // How hard she is being pulled at while she has hold of a frame. The figure opens her arm with this
      // number; the kit opens her legs with the same one, and earlier — see the cling branch below. Once
      // her legs have gone the arm stops opening: she is down to one hand, and that hand closes.
      strain: pet.climbLegsOff ? Math.min(pet.climbStrain ?? 0, .32) : (pet.climbStrain ?? 0),
      // 往上攀爬的节拍：0 = 手搭在框上，1 = 手沿框线够到上面那一截（抓住）。蹬的那一下回落到 0。
      climbGrab: pet.climbGrab ?? 0,
    });

    const footY = drag ? pet.dy + 220 * S * 1.09 : pet.fy;
    // Up a wall there is no floor under her: what the kit draws is a soft mark where she would land,
    // which reads as a mistake there, so most of it is taken away while she is on a window's side.
    const k = clamp(1 - (floorY - footY) / 420, .3, 1) * (pet.mode === 'cling' || pet.mode === 'climb' ? .3 : 1);
    shadowEl.setAttribute('cx', f(AX)); shadowEl.setAttribute('cy', f(floorY - 2));
    shadowEl.setAttribute('rx', f(72 * S * k * (1 + pet.sq * .5))); shadowEl.setAttribute('ry', f(10 * S * k + 1));
    shadowEl.setAttribute('opacity', f(k));

    let s = '';
    const sc = S / .48;
    // sleep z's take the eye colour, or the figure's own colour for them
    const zPaint = custom?.colors?.z ? `stroke="${custom.colors.z}"` : 'class="eye"';
    for (const p of P) {
      const a = p.age / p.life;
      if (p.type === 'z') {
        const op = a < .15 ? a / .15 : 1 - (a - .15) / .85, z = (.7 + .9 * a) * sc;
        s += `<path ${zPaint} fill="none" stroke-width="${f(3 / z)}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(op)}" transform="translate(${f(p.x + Math.sin(p.age * 2.5) * 6)} ${f(p.y)}) scale(${f(z)})" d="M-6 -7H6L-6 7H6"/>`;
      } else if (p.type === 'heart') {
        s += `<path class="p-heart" fill="none" stroke-width="5" stroke-linejoin="round" opacity="${f(1 - a * a)}" transform="translate(${f(p.x + Math.sin(p.age * 4) * 5)} ${f(p.y)}) scale(${f((.45 + .35 * a) * sc)})" d="${heartD(0, 0, 1)}"/>`;
      } else if (p.type === 'dust') {
        s += `<circle class="p-dust" fill="none" stroke-width="2" cx="${f(p.x)}" cy="${f(p.y)}" r="${f((3 + 8 * a) * sc)}" opacity="${f(.7 * (1 - a))}"/>`;
      } else if (p.type === 'note') {
        const op = a < .15 ? a / .15 : 1 - (a - .15) / .85, z = (.8 + .4 * a) * sc;
        s += `<g opacity="${f(op)}" transform="translate(${f(p.x + Math.sin(p.age * 3) * 8)} ${f(p.y)}) scale(${f(z)})"><path ${zPaint} fill="none" stroke-width="2.4" stroke-linecap="round" d="M3 4V-9L9 -6"/><circle ${zPaint} fill="none" stroke-width="3.6" cx="0" cy="4.5" r="1.8"/></g>`;
      } else if (p.type === 'drop') {
        s += `<path class="tearf" transform="translate(${f(p.x)} ${f(p.y)}) scale(${f(.9 * sc)})" d="${DROP}"/>`;
      } else if (p.type === 'bubble') {
        // a bubble: a thin ring, wobbling up as it rises, a little bigger by the time it goes
        const op = a < .1 ? a / .1 : 1 - smooth(.65, 1, a);
        const r = (3 + 2.4 * a) * sc;
        s += `<circle fill="none" stroke="#8FD3FF" stroke-width="${f(1.4 / sc)}" cx="${f(p.x + Math.sin(p.age * 4 + (p.seed || 0)) * 2.4)}" cy="${f(p.y)}" r="${f(r)}" opacity="${f(.8 * op)}"/>`;
      }
    }
    fxG.innerHTML = s;
    return fname;
  }

  /* pointer: stage-pixel coordinates; `p.t` is when it happened (ms), else now */
  const now = (p) => p?.t ?? performance.now();
  function velocity() {
    const s = pointer.samples;
    if (s.length < 2) return { x: 0, y: 0 };
    const a = s[0], b = s[s.length - 1], dt = Math.max(.016, (b.t - a.t) / 1000);
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }
  /** Picks the body up by the scruff; it then follows the pointer until let go of. */
  function grab() {
    const scruff = toStage(128, 36);
    pet.expr = null;
    // Taken off the wall by hand. climb.before drops the grip on the next frame anyway, but this frame
    // already has to know she is being carried rather than holding on.
    climb.release();
    // Carried off: the visit she was in the middle of is over, and the strain goes with it.
    pet.peekId = null; pet.peekUntil = 0; pet.climbStrain = 0; pet.climbLegsOff = false; pet.climbLift = 0;
    // A window top she was on her way up to is off too: being carried means whatever she meant to do next
    // is over, and a hop that fires later would put her somewhere she never asked to go.
    pet.perchWant = null;
    // 鼠标把她从窗口上拎下来：这也算「他把她拽下来」（2026-10-17 晚他要求的）——
    // 落地后先坐下哭，第一次还从底下爬回去，第二次就不看了（见 watchCry）。
    // 不在墙上时被拎起来不算（那只是把她抱起来），这一趟守窗到此为止。
    if (pet.watchId && (pet.mode === 'cling' || pet.mode === 'climb')) {
      pet.watchDrops = (pet.watchDrops ?? 0) + 1;
    } else {
      pet.watchId = null; pet.watchIdleSince = 0;
    }
    // `dragWrap` keeps the carried anchor and the pointer in the same turn of the ring. Without it the anchor
    // wraps to the far side, the follow pulls it straight back, and she flickers on the edge forever.
    setMode('drag', { dx: scruff.x, dy: scruff.y, dragWrap: scruff.x - pointer.x });
    play('grab', 'touch');
    pet.sqv -= 1.2; pet.tiltV = 0;
    onEvent('touch', { kind: 'grab' });
  }
  function pointerDown(p) {
    Object.assign(pointer, { x: p.x, y: p.y, inside: true });
    if (!hitPet(p)) return false;
    press = { x: p.x, y: p.y, t: now(p) };
    pointer.samples = [{ t: now(p), x: p.x, y: p.y }];
    // caught while falling or flying: held at once, since the body would fall on while the pointer moved the drag threshold
    if (pet.mode === 'air' || pet.mode === 'flying') grab();
    return true;
  }
  /** Returns the cursor the stage should show. */
  function pointerMove(p) {
    const t = now(p);
    const ddx = p.x - pointer.x, ddy = p.y - pointer.y;
    Object.assign(pointer, { x: p.x, y: p.y, inside: true });
    pointer.samples.push({ t, x: p.x, y: p.y });
    while (pointer.samples.length > 2 && t - pointer.samples[0].t > 110) pointer.samples.shift();
    pointer.vx = lerp(pointer.vx, velocity().x, .35);

    // On a window frame she is not simply picked up: she has hold of it, and a slow pull only makes
    // her grip harder — the pose reads the strain and she stays where she is. Only a real yank takes
    // her off it. Off the frame the ordinary pick-up is unchanged: six pixels and she is in the air.
    if (press && pet.mode !== 'drag' && Math.hypot(p.x - press.x, p.y - press.y) > 6) {
      if (climb.attached) {
        const v = Math.hypot(velocity().x, velocity().y);
        pet.climbPull = [Math.sign(p.x - press.x) || 0, Math.sign(p.y - press.y) || 0];
        // A yank is counted in **pulls**, not in frames: testing the speed alone meant a fast drag added to
        // the strain every single frame, and the whole ladder from "legs off" to "torn away" went by in half
        // a second. One pull adds one step, and no more than one step per 380 ms.
        //
        // Two steps, not three — and the bar does not go up for having held on once. At .45 a pull, the
        // second one has her off (a bit under half a second of really pulling); and pulling her well clear
        // of where the press started takes her off outright, however slowly it is done. Three steps with a
        // bar that rose to .88 after the first was what "she sticks and will not come off" was: the first
        // pull could never finish the job on its own, and every pull after it was harder than the last.
        const pulled = Math.hypot(p.x - press.x, p.y - press.y);
        if (v > 1100 && Date.now() - (pet.climbYankAt ?? 0) > 380) {
          pet.climbYankAt = Date.now();
          pet.climbStrain = Math.min(1, (pet.climbStrain ?? 0) + .45);
        }
        if (pet.climbStrain >= (pet.climbLegsOff ? .7 : .55) || pulled > 220) grab();
      } else grab();
    }
    if (press) return (pet.cursor = 'grabbing');
    const over = hitPet(p);
    if (over && ['idle', 'look', 'sit', 'sleep'].includes(pet.mode)) {
      strokeAcc += Math.hypot(ddx, ddy);
      if (strokeAcc > 320 && petCool <= 0) {
        strokeAcc = 0; petCool = 2.5;
        play('purr', 'touch');
        if (pet.mode === 'sleep') emitHeart();
        else setExpr(Math.random() < .5 ? 'love' : 'shy');
        onEvent('touch', { kind: 'pet', asleep: pet.mode === 'sleep' });
      }
    }
    return (pet.cursor = over ? 'grab' : '');
  }
  function pointerUp(p) {
    pet.cursor = '';
    if (!press) return;
    if (pet.mode === 'drag') {
      // hand over from the scruff anchor to the feet anchor without a visual jump
      const foot = toStage(128, 256);
      const v = velocity();
      pet.x = clamp(foot.x, minX(), maxX());
      pet.fy = Math.min(floorY, foot.y);
      pet.vx = clamp(v.x, -1800, 1800); pet.vy = clamp(v.y, -1800, 1400);
      pet.airKind = 'throw';
      const speed = Math.hypot(v.x, v.y);
      if (speed > 700) play('whoosh', 'move');
      setMode('air');
      onEvent('touch', { kind: speed > 700 ? 'throw' : 'drop', x: Math.round(pet.x) });
    } else if (now(p) - press.t < 400) {
      if (pet.mode === 'sleep' || pet.mode === 'sit') {
        const wasAsleep = pet.mode === 'sleep';
        setMode('wake', { startle: true }); pet.sqv -= 2.2; pet.nextAt = T + 2.4;
        play('surprised', 'face');
        onEvent('touch', { kind: 'poke', woke: wasAsleep });
      } else if (pet.mode !== 'dizzy') {
        play('poke', 'touch');
        const r = ['happy', 'wink', 'surprised', 'love', 'angry'][Math.floor(Math.random() * 5)];
        setExpr(r);
        if (Math.random() < .5 && pet.mode === 'idle') setMode('crouch', { jumpV: 480, jumpVx: 0 });
        onEvent('touch', { kind: 'poke' });
      }
    }
    press = null;
  }
  /**
   * Ends a drag with the body dropped from under stage point `p` with no throw: the pointer was let
   * go of on another display and the stage now covers that one. Call after `resize()` has taken the
   * new size.
   */
  function dropAt(p) {
    press = null;
    if (pet.mode !== 'drag') return;
    Object.assign(pointer, { x: p.x, y: p.y, vx: 0, samples: [] });
    pet.x = clamp(p.x, minX(), maxX());
    pet.fy = Math.min(floorY, p.y + 220 * S);
    pet.vx = 0; pet.vy = 0;
    pet.airKind = 'drop';
    setMode('air');
    onEvent('touch', { kind: 'drop', x: Math.round(pet.x) });
  }
  /**
   * Keeps a held body under the pointer when the stage moved to another display mid-drag: every
   * point on screen now sits (dx, dy) stage pixels from where it was.
   */
  function shiftDrag(dx, dy) {
    if (pet.mode !== 'drag') return;
    pet.dx += dx; pet.dy += dy; pet.x += dx;
    pointer.x += dx; pointer.y += dy;
    for (const s of pointer.samples) { s.x += dx; s.y += dy; }
    if (press) { press.x += dx; press.y += dy; }
  }
  function pointerLeave() { if (!press) pointer.inside = false; }

  /** Head top in stage pixels, for placing a speech bubble. */
  const anchor = () => toStage(A.bubble[0], A.bubble[1] + pet.low);

  /**
   * Where the body is and what it is doing, in stage pixels, for the page around it: its box and hit
   * circles, the bubble's spot, the point the hover buttons sit beside (`side`, with `reach` from it to
   * the body's edge), and the cursor to show.
   */
  function layout() {
    const [x0, y0, x1, y1] = custom?.extent ?? EXTENT;
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => toStage(x, y));
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    const side = toStage(128, 128 + pet.low);
    return {
      x: pet.x, facing: pet.facing, mode: pet.mode, busy: busy(), pressing: !!press, cursor: pet.cursor,
      moving: !!press || MOVING_MODES.has(pet.mode) || !!pet.pulse || Math.abs(pet.faceVis - pet.facing) > .05,
      box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      hit: hits(), bubble: anchor(), side: { x: side.x, y: side.y, reach: 104 * S },
    };
  }

  resize();
  custom?.setSkin?.(skin);
  return {
    setPerchSurfaces: (surfaces) => perch.setSurfaces(surfaces),
    setClimbEdges: (list, openIds) => climb.setEdges(list, openIds),
    /** Her own settings (weights, how long a look lasts, climbing speed, autonomy): see the peekStay and
     *  climbPace helpers above, and decide(). Replaced whole each time, so clearing one means omitting it. */
    setTune(t) { tune = t && typeof t === 'object' ? t : {}; },
    /** The pack's own pet_move_to targets; only `perch` for now. */
    move(args, id) {
      const to = args && typeof args === 'object' ? args.to : null;
      if (to !== 'windowtop') return false;
      if (!perchTarget()) { onEvent('interrupted', { walkId: id, by: 'nowindow' }); return true; }
      if (!doWord('perch')) return false;
      pet.moveId = id;
      return true;
    },
    pet, step, render, resize, act, setExpr, doWord, walkTo, stopWalk, toStage, hitPet, busy, layout,
    pointerDown, pointerMove, pointerUp, pointerLeave, dropAt, shiftDrag,
    get pressing() { return !!press; },
    /** Pressed, carried, airborne, walking, running, dancing, turning round, or in a short gesture (nod, wave, bow…): motion that frames far apart show as jumps. */
    get moving() {
      return !!press || MOVING_MODES.has(pet.mode) || !!pet.pulse || Math.abs(pet.faceVis - pet.facing) > .05;
    },
    get time() { return T; },
    get bounds() { return { W, H, floorY, S, minX: minX(), maxX: maxX() }; },
    setSkin(s) { skin = s; custom?.setSkin?.(s); },
    /** Swaps the body's drawing (see `opts.figure`). */
    setFigure(fig) {
      if (fig === custom) return;
      // a swapped-out figure may hold a WebGL context; release it now instead of waiting for GC
      custom?.dispose?.();
      custom = fig;
      custom.setSkin?.(skin);
      A = anchors();
      petG.textContent = '';
      render();
    },
    get figure() { return custom; },
    get skin() { return skin; },
    setRoam(r) { roam = r; if (r !== 'off') pet.nextAt = T + 1; },
    get roam() { return roam; },
    /** Outside orders keep free roaming quiet for `seconds`. */
    holdRoam(seconds) { hold = Math.max(hold, T + seconds); },
    talk() { pet.talkK = 1; },
    setListening(on) { pet.listening = on; if (on && (pet.mode === 'walk' || pet.mode === 'run')) setMode('idle'); },
    setThinking(on) { pet.thinking = on; },
    /** The page shows the bot's thinking in a bubble of its own. */
    setThoughtShown(on) { pet.thoughtShown = on; },
    anchor,
    emitHeart,
  };
}

/* ---------- the body a pack hands the figure frame ---------- */
/** Colours of what the kit draws itself (shadow, particles; z's take the `eye` class without a figure colour). */
const KIT_CSS = `
:root{--shadow:rgba(27,22,38,.12);--tear:#5AAEF0;--heart:#F0567A;--dust:#A39DB0;--skin-eye:#00A870}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--shadow:rgba(0,0,0,.32);--tear:#6BBDF7;--heart:#FF6F93;--dust:#5B6472;--skin-eye:#2FD59B}}
:root[data-theme="dark"]{--shadow:rgba(0,0,0,.32);--tear:#6BBDF7;--heart:#FF6F93;--dust:#5B6472;--skin-eye:#2FD59B}
.shadow{fill:var(--shadow)} .tearf{fill:var(--tear)} .p-heart{stroke:var(--heart)} .p-dust{stroke:var(--dust)} .eye{stroke:var(--skin-eye)}
svg.kit{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
`;
const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * The body contract (api 2, web/figure-frame.js) on top of `createPet`: what a pack's factory returns.
 * `host` is what the frame gives the factory: `root` (the element to draw in), `bounds()`, `emit(kind, detail)`
 * for what happens to the body, `sound(name, kind, ...args)` for what it wants heard, and `start` ({ x, facing,
 * enter, skin }: where it stands, or enter 'drop' to fall in from above, and the skin to wear). `opts` are
 * createPet's, with `figure` required; `opts.css` is more style for the frame's document (a figure's own
 * classes) and `opts.skinCss(skin)` the style that follows the skin.
 *
 * The body takes these calls from the page: step(dt), layout(), do(word), walk(x, run, id), stopWalk(id), pointer(type, p),
 * drop(p), shift(dx, dy), place(x, facing), set({ roam, hold, dialogOpen, listening, thinking, thoughtShown, skin, theme }),
 * cue(kind), talk(), setScheme(id, o), dispose(); `words` lists every word its do() knows.
 */
export function createBody(host, opts) {
  const doc = host.root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = KIT_CSS + (opts.css ?? '');
  doc.head.appendChild(style);
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'kit');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<ellipse class="shadow" cx="0" cy="0" rx="0" ry="0"/><g></g><g></g>';
  host.root.appendChild(svg);
  const [shadowEl, petG, fxG] = svg.children;
  const skinStyle = doc.createElement('style');
  doc.head.appendChild(skinStyle);
  const start = host.start ?? {};
  if (opts.skinCss && start.skin) skinStyle.textContent = opts.skinCss(start.skin);
  let dialogOpen = false;
  const ctl = createPet({ petG, shadowEl, fxG }, {
    ...opts,
    skin: start.skin ?? null, startX: start.x, enter: start.enter,
    bounds: host.bounds,
    onEvent: host.emit,
    sfx: { play: host.sound },
    dialogOpen: () => dialogOpen,
  });
  if (start.facing === 1 || start.facing === -1) ctl.pet.facing = ctl.pet.faceVis = start.facing;
  return {
    step(dt) { ctl.step(dt); ctl.render(); },
    layout: ctl.layout,
    resize: ctl.resize,
    do: ctl.doWord,
    words: [...KIT_EXPRESSIONS, ...KIT_MOTIONS, ...Object.keys(opts.words ?? {}).filter((w) => opts.words[w]?.expression || opts.words[w]?.motion)],
    walk: (x, run, id) => ctl.walkTo(x, run, id),
    move: (args, id) => ctl.move(args, id),
    stopWalk: (id) => ctl.stopWalk(id),
    pointer(type, p) {
      if (type === 'down') ctl.pointerDown(p);
      else if (type === 'move') ctl.pointerMove(p);
      else if (type === 'up' || type === 'cancel') ctl.pointerUp(p);
      else if (type === 'leave') ctl.pointerLeave();
    },
    drop: ctl.dropAt,
    shift: ctl.shiftDrag,
    /** Puts a body that is standing at stage x, turned to `facing` (1 right, -1 left). */
    place(x, facing) {
      if (ctl.pet.mode === 'drag' || ctl.pet.mode === 'air' || ctl.pet.mode === 'flying' || ctl.pet.mode === 'cling' || ctl.pet.mode === 'climb') return;
      const { minX, maxX } = ctl.bounds;
      ctl.pet.x = ctl.pet.target = clamp(x, minX, maxX);
      if (facing === 1 || facing === -1) ctl.pet.facing = ctl.pet.faceVis = facing;
    },
    set(s) {
      if (s.perchSurfaces) ctl.setPerchSurfaces(s.perchSurfaces);
      if (s.climbEdges) ctl.setClimbEdges(s.climbEdges, s.climbWindows);
      if (s.tune) ctl.setTune(s.tune);
      if (s.roam) ctl.setRoam(s.roam);
      if (typeof s.hold === 'number') ctl.holdRoam(s.hold);
      if (typeof s.dialogOpen === 'boolean') dialogOpen = s.dialogOpen;
      if (typeof s.listening === 'boolean') ctl.setListening(s.listening);
      if (typeof s.thinking === 'boolean') ctl.setThinking(s.thinking);
      if (typeof s.thoughtShown === 'boolean') ctl.setThoughtShown(s.thoughtShown);
      if (s.skin) { ctl.setSkin(s.skin); if (opts.skinCss) skinStyle.textContent = opts.skinCss(s.skin); }
      if (s.theme) doc.documentElement.dataset.theme = s.theme;
    },
    /** The page's own moments: a talk key tapped (`perk`), speech heard (`heard`), an answer sent (`cheer`), a dress pick (`bounce`). */
    cue(kind) {
      if (kind === 'perk') { ctl.pet.sqv += .6; ctl.setExpr('surprised', .5); }
      else if (kind === 'heard') ctl.pet.sqv += .9;
      else if (kind === 'cheer') ctl.setExpr('happy');
      else if (kind === 'bounce') ctl.pet.sqv += 1.2;
    },
    talk: ctl.talk,
    setScheme: (id, o) => opts.figure.setScheme?.(id, o),
    get z() { return opts.figure.colors?.z ?? null; },
    dispose() { opts.figure.dispose?.(); svg.remove(); style.remove(); skinStyle.remove(); },
  };
}
