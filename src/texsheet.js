//
// ANIMATED TEXTURES FROM SPRITE SHEETS (docs/TEXTURE_SHEETS.md): one picture
// holding every frame, stacked top to bottom (vertical) or side by side
// (horizontal) -- what qPainter exports.
//
//   module.textures[NAME].sheet = { layout: 'vertical'|'horizontal', frames, fps }
//
// written as a line of the module's assets/animations.txt,
//
//   sheet NAME vertical 8 fps 10
//
// which the client reads (render/animtex.js parseAnimations), cutting the
// sheet into equal frames when it loads. frameRect cuts where the client's
// sheetFrame (render/textures.js) does, which studio/test/texsheet.test.js
// holds it to.
//
// Pure: the Textures section, the texture cache, the emitter and the tests use it.
//

export const MAX_FRAMES = 256
export const DEFAULT_FPS = 8

/**
 * What a picture's shape suggests: qPainter's sheets are square frames, so a
 * picture a whole number of squares tall (or wide) is likely one. Null when
 * it is not (and a guess is only offered, never applied unasked).
 */
export function guessSheet (w, h) {
  if (h > w && w > 0 && h % w === 0 && h / w >= 2 && h / w <= MAX_FRAMES) return { layout: 'vertical', frames: h / w, fps: DEFAULT_FPS }
  if (w > h && h > 0 && w % h === 0 && w / h >= 2 && w / h <= MAX_FRAMES) return { layout: 'horizontal', frames: w / h, fps: DEFAULT_FPS }
  return null
}

/** Where frame `k` sits in the sheet, in its pixels (the client's sheetFrame). */
export function frameRect (spec, w, h, k) {
  if (spec.layout === 'horizontal') { const fw = Math.floor(w / spec.frames); return { x: k * fw, y: 0, w: fw, h } }
  const fh = Math.floor(h / spec.frames)
  return { x: 0, y: k * fh, w, h: fh }
}

/** One frame's size, and the pixels left over when the sheet does not divide evenly. */
export function frameSize (spec, w, h) {
  const along = spec.layout === 'horizontal' ? w : h
  const step = Math.floor(along / spec.frames)
  return spec.layout === 'horizontal'
    ? { w: step, h, spare: along - step * spec.frames }
    : { w, h: step, spare: along - step * spec.frames }
}

/** What the client would refuse or warn about. */
export function sheetProblems (name, spec, w, h) {
  const out = []
  if (!spec) return out
  if (spec.layout !== 'vertical' && spec.layout !== 'horizontal') out.push(`${name}: a sheet is vertical or horizontal`)
  if (!Number.isInteger(spec.frames) || spec.frames < 2 || spec.frames > MAX_FRAMES) out.push(`${name}: a sheet has 2 to ${MAX_FRAMES} frames`)
  if (spec.fps !== undefined && !(spec.fps > 0)) out.push(`${name}: frames a second must be above 0`)
  if (!out.length && w && h) {
    const f = frameSize(spec, w, h)
    if (f.w < 1 || f.h < 1) out.push(`${name}: ${spec.frames} frames do not fit in ${w}×${h}`)
    else if (f.spare) out.push(`${name}: ${spec.layout === 'horizontal' ? w : h} px is not ${spec.frames} equal frames -- the last ${f.spare} px are not shown`)
  }
  return out
}

/** A sheet's line, in the client's words. */
export function sheetLine (name, spec) {
  const fps = spec.fps ?? DEFAULT_FPS
  return `sheet ${name} ${spec.layout} ${spec.frames}${fps === DEFAULT_FPS ? '' : ` fps ${Number(Number(fps).toFixed(3))}`}`
}

/**
 * The module's assets/animations.txt: its sheets' lines. Written whenever the
 * module has textures of its own, with no lines when none is a sheet, so a
 * sheet turned off is not left animating by a file an earlier Play wrote.
 * Null for a module with no textures of its own.
 */
export function animationsTxt (module) {
  const own = Object.entries(module?.textures ?? {})
  if (!own.length) return null
  const lines = own.filter(([, t]) => t.sheet).sort(([a], [b]) => a.localeCompare(b)).map(([n, t]) => sheetLine(n, t.sheet))
  return ['# animations.txt -- written by the studio from module.studio.json.',
    '# Its textures that are sprite sheets (docs/TEXTURE_SHEETS.md).', ...lines, ''].join('\n')
}
