//
// COMPOSITE TEXTURES (docs/COMPOSITE_TEXTURES.md): one texture name made of up
// to eight pictures, laid out tile by tile so a big floor or wall stops showing
// its repeat. A map names it like any texture. The module's are
//
//   module.composites[NAME] = { members: [{ name, weight }], flipX, flipY, turn,
//                               shift, patches, seam, overlay: { name, scale, strength } | null,
//                               seed }
//
// -- the client's own definition (render/composite.js parseCompositeLine) less
// its name, with `seed` only once shuffled (the client takes it from the name
// otherwise, so a rename keeps a layout of its own) -- written as a line of
// assets/animations.txt beside the sheets' (texsheet.js animationsTxt):
//
//   composite FLOOR1 STONE 4 STONE_CRACKED flip turn overlay GRIME scale 8
//
// Client-only, as sheets are: no map format, hash or bake changes. Beside
// module.textures rather than in it, because a composite has no picture, and
// everything that reads module.textures takes one for granted.
//
// Pure: the Textures page, the texture cache, the emitter and the tests use it.
// The drawing takes the client's composite module as `cp`, so the tests hand
// it the very file the page imports.
//

export const COMPOSITE_MAX = 8
export const DEFAULT_PATCH = 3
export const DEFAULT_OVERLAY_SCALE = 4
export const DEFAULT_OVERLAY_STRENGTH = 0.5

const num = (v) => String(Number(Number(v).toFixed(3)))
// A seed is 24 bits, so a float carries it exactly (as the client keeps it).
const SEED_SPAN = 1 << 24

/** A new composite, of one texture when one is given. */
export function newComposite (first = null) {
  return { members: first ? [{ name: first, weight: 1 }] : [], flipX: false, flipY: false, turn: false, shift: false, patches: 0, seam: 'dither', overlay: null }
}

/** Its textures, overlay included: what index.json must size and a rename must follow. */
export function compositeTextures (c) {
  return [...new Set([...(c?.members ?? []).map((m) => m.name), ...(c?.overlay ? [c.overlay.name] : [])])]
}

/** Its line, in the client's words; null while it has no textures (the client would refuse it). */
export function compositeLine (name, c) {
  if (!c?.members?.length) return null
  const w = [`composite ${name}`]
  for (const m of c.members) w.push(m.weight === 1 || m.weight == null ? m.name : `${m.name} ${num(m.weight)}`)
  if (c.flipX && c.flipY) w.push('flip')
  else if (c.flipX) w.push('flip x')
  else if (c.flipY) w.push('flip y')
  if (c.turn) w.push('turn')
  // shift and patches are one or the other: patches wins a hand-edited both
  if (c.patches) w.push(c.patches === DEFAULT_PATCH ? 'patches' : `patches size ${num(c.patches)}`)
  else if (c.shift) w.push('shift')
  if ((c.shift || c.patches) && c.seam === 'blend') w.push('seam blend')
  if (c.overlay) {
    w.push(`overlay ${c.overlay.name}`)
    if ((c.overlay.scale ?? DEFAULT_OVERLAY_SCALE) !== DEFAULT_OVERLAY_SCALE) w.push(`scale ${num(c.overlay.scale)}`)
    if ((c.overlay.strength ?? DEFAULT_OVERLAY_STRENGTH) !== DEFAULT_OVERLAY_STRENGTH) w.push(`strength ${num(c.overlay.strength)}`)
  }
  if (c.seed != null) w.push(`seed ${(c.seed >>> 0) % SEED_SPAN}`)
  return w.join(' ')
}

/**
 * What the client would leave out, refuse or warn about, in the page's words.
 * `sizeOf(name)` -> { w, h } | null (the module's or the app's picture);
 * `isSheet(name)`, `isComposite(name)`; `isTexture(name)` for a name clash.
 */
export function compositeProblems (name, c, { sizeOf = () => null, isSheet = () => false, isComposite = () => false, isTexture = () => false } = {}) {
  const out = []
  const ms = c?.members ?? []
  if (!ms.length) out.push(`${name}: a composite needs at least one texture`)
  if (ms.length > COMPOSITE_MAX) out.push(`${name}: at most ${COMPOSITE_MAX} textures, not ${ms.length}`)
  if (isTexture(name)) out.push(`${name}: a texture has that name too; the composite wins in the game`)
  for (const m of ms) {
    if (m.name === name) out.push(`${name}: it cannot be one of its own textures`)
    else if (isComposite(m.name)) out.push(`${name}: ${m.name} is a composite, which cannot be one of its textures; left out`)
    else if (isSheet(m.name)) out.push(`${name}: ${m.name} is animated (a sheet), which cannot be one of its textures; left out`)
    else if (!sizeOf(m.name)) out.push(`${name}: no texture called ${m.name}; left out`)
    if (!(m.weight > 0)) out.push(`${name}: ${m.name}'s weight is above 0`)
  }
  const first = ms.map((m) => ({ m, size: !isSheet(m.name) && !isComposite(m.name) ? sizeOf(m.name) : null })).find((x) => x.size)
  if (first) {
    for (const m of ms) {
      const s = m === first.m ? null : sizeOf(m.name)
      if (s && (s.w !== first.size.w || s.h !== first.size.h) && !isSheet(m.name)) out.push(`${name}: ${m.name} is ${s.w}×${s.h}; it is drawn at ${first.m.name}'s ${first.size.w}×${first.size.h}`)
    }
    if (c.turn && first.size.w !== first.size.h) out.push(`${name}: 'turn' needs square textures; ${first.m.name} is ${first.size.w}×${first.size.h}, so nothing is turned`)
  }
  if (c?.overlay) {
    const o = c.overlay.name
    if (isComposite(o) || isSheet(o)) out.push(`${name}: the overlay ${o} is not a still picture; no overlay`)
    else if (!sizeOf(o)) out.push(`${name}: no texture called ${o} for the overlay`)
  }
  return out
}

/** A texture renamed: every composite naming it follows. How many changed. */
export function renameInComposites (composites, from, to) {
  let n = 0
  for (const c of Object.values(composites ?? {})) {
    let hit = false
    for (const m of c.members) if (m.name === from) { m.name = to; hit = true }
    if (c.overlay?.name === from) { c.overlay.name = to; hit = true }
    if (hit) n++
  }
  return n
}

/** A texture deleted: taken out of every composite. The names of those it was in. */
export function dropFromComposites (composites, name) {
  const out = []
  for (const [n, c] of Object.entries(composites ?? {})) {
    const before = c.members.length
    c.members = c.members.filter((m) => m.name !== name)
    let hit = c.members.length !== before
    if (c.overlay?.name === name) { c.overlay = null; hit = true }
    if (hit) out.push(n)
  }
  return out
}

/** The composites that use a texture, by name: [composite name]. */
export function compositesUsing (composites, name) {
  return Object.entries(composites ?? {}).filter(([, c]) => compositeTextures(c).includes(name)).map(([n]) => n)
}

/** A seed for "Shuffle": 24 bits, as the client keeps it. */
export const shuffleSeed = (rand = Math.random) => Math.floor(rand() * SEED_SPAN) % SEED_SPAN

/**
 * The surface as the client draws it: `tilesX` by `tilesY` tiles of the cell
 * (the first picture's size), each pixel the texel the shader picks
 * (cp.compositeSources -- the GPU's twin, held to it by the engine's browser
 * test), blended where `seam blend` mixes, and shaded by the overlay.
 *
 * @param cp      the client's render/composite.js
 * @param def     the client's definition (cp.parseCompositeLine of compositeLine)
 * @param pictures [{ name, data, w, h }] in the line's order, null where it has no
 *                picture; `data` RGBA at the picture's own size
 * @param overlay { data, w, h } | null
 * @returns { w, h, data: Uint8ClampedArray } | null when no texture has a picture
 */
export function renderComposite (cp, def, pictures, overlay, { tilesX = 6, tilesY = 4, side = 0, level = 0 } = {}) {
  // Left out as the client leaves them out: no picture, no tile.
  const kept = def.members.map((m, k) => ({ ...m, pic: pictures[k] })).filter((m) => m.pic)
  if (!kept.length) return null
  const cell = [kept[0].pic.w, kept[0].pic.h]
  const [W, H] = cell
  // Each drawn at the first one's size, nearest pixel (as buildAtlas draws them).
  const at = kept.map((m) => {
    const { data, w, h } = m.pic
    if (w === W && h === H) return data
    const out = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.min(w - 1, Math.floor((x + 0.5) * w / W)); const sy = Math.min(h - 1, Math.floor((y + 0.5) * h / H))
        out.set(data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * W + x) * 4)
      }
    }
    return out
  })
  const p = cp.uniformsFor({ ...def, members: kept }, { cell, overlay: !!overlay, level })
  const w = W * tilesX
  const h = H * tilesY
  const data = new Uint8ClampedArray(w * h * 4)
  const scale = def.overlay?.scale ?? DEFAULT_OVERLAY_SCALE
  const strength = def.overlay?.strength ?? DEFAULT_OVERLAY_STRENGTH
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      let r = 0; let g = 0; let b = 0; let a = 0
      for (const s of cp.compositeSources(p, gx, gy, side)) {
        const src = at[s.member]
        const i = (s.y * W + s.x) * 4
        r += src[i] * s.w; g += src[i + 1] * s.w; b += src[i + 2] * s.w; a += src[i + 3] * s.w
      }
      if (overlay) {
        // At the texel's centre, smoothly (the overlay is LINEAR and repeats),
        // grey changing nothing: c *= mix(1, 2o, strength), as the shader does.
        const o = bilinear(overlay, (gx + 0.5) / scale - 0.5, (gy + 0.5) / scale - 0.5)
        r *= 1 + strength * (2 * o[0] / 255 - 1); g *= 1 + strength * (2 * o[1] / 255 - 1); b *= 1 + strength * (2 * o[2] / 255 - 1)
      }
      const j = (gy * w + gx) * 4
      data[j] = r; data[j + 1] = g; data[j + 2] = b; data[j + 3] = a
    }
  }
  return { w, h, data }
}

function bilinear ({ data, w, h }, u, v) {
  const x0 = Math.floor(u); const y0 = Math.floor(v)
  const fx = u - x0; const fy = v - y0
  const px = (x, y) => { const i = ((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4; return [data[i], data[i + 1], data[i + 2]] }
  const a = px(x0, y0); const b = px(x0 + 1, y0); const c = px(x0, y0 + 1); const d = px(x0 + 1, y0 + 1)
  return [0, 1, 2].map((k) => (a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy)
}
