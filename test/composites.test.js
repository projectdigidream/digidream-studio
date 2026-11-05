//
// Composite textures (src/composites.js): what the studio writes is what the
// client reads, the module ships the pictures a composite is made of, and the
// studio's flat drawings show the texels the game's shader picks.
//
// ORACLES: the client's parseCompositeLine and parseAnimations (the line read
// back), compositeSources and uniformsFor (the JS twin the engine's browser
// test holds to the GPU, pixel for pixel), and the emitter's own files.
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newComposite, compositeLine, compositeProblems, compositeTextures, renameInComposites, dropFromComposites, compositesUsing,
  renderComposite, shuffleSeed, greyscale, isGrey, greyName, COMPOSITE_MAX, DEFAULT_PATCH } from '../src/composites.js'
import { animationsTxt } from '../src/texsheet.js'
import * as cp from '../../engine/client/src/render/composite.js'
import { parseAnimations } from '../../engine/client/src/render/animtex.js'
import { newModule, emitModule, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { bake } from '../src/bake.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

const read = (name, c) => cp.parseCompositeLine(compositeLine(name, c).split(/\s+/))
check(COMPOSITE_MAX === cp.COMPOSITE_MAX_MEMBERS && DEFAULT_PATCH === cp.COMPOSITE_DEFAULT_PATCH, 'the studio\'s limits are the client\'s')

// --- the line, read back by the client ----------------------------------------------------
const floor = { ...newComposite('STONE'), members: [{ name: 'STONE', weight: 4 }, { name: 'STONE_CRACKED', weight: 1 }, { name: 'STONE_MOSS', weight: 1.5 }],
  flipX: true, flipY: true, turn: true, overlay: { name: 'GRIME', scale: 8, strength: 0.5 } }
check(compositeLine('FLOOR1', floor) === 'composite FLOOR1 STONE 4 STONE_CRACKED STONE_MOSS 1.5 flip turn overlay GRIME scale 8',
  `a weight of 1, the default strength, dither go unsaid (${compositeLine('FLOOR1', floor)})`)
const cases = [
  ['FLOOR1', floor],
  ['WALL1', { ...newComposite('BRICK'), members: [{ name: 'BRICK', weight: 6 }, { name: 'BRICK_HOLE', weight: 1 }], flipX: true, shift: true }],
  ['WALL2', { ...newComposite('BRICK'), flipY: true, shift: true, seam: 'blend', seed: 1234 }],
  ['YARD', { ...newComposite('GRASS'), members: [{ name: 'GRASS', weight: 1 }, { name: 'GRASS_DRY', weight: 1 }], patches: 3 }],
  ['YARD2', { ...newComposite('GRASS'), patches: 4.5, seam: 'blend', overlay: { name: 'DIRT', scale: 3, strength: 0.25 } }]
]
for (const [name, c] of cases) {
  const r = read(name, c)
  const d = r.def
  const same = d && d.name === name && JSON.stringify(d.members) === JSON.stringify(c.members) && d.flipX === !!c.flipX && d.flipY === !!c.flipY && d.turn === !!c.turn &&
    d.shift === !!c.shift && d.patches === (c.patches || 0) && d.seam === ((c.shift || c.patches) && c.seam === 'blend' ? 'blend' : 'dither') &&
    JSON.stringify(d.overlay) === JSON.stringify(c.overlay) && d.seed === (c.seed ?? cp.nameSeed(name))
  check(same, `${name}: the client reads back what the studio holds (${compositeLine(name, c)}${r.error ? ` -- ${r.error}` : ''})`)
}
check(/ patches$/.test(compositeLine('Y', { ...newComposite('G'), patches: 3 })) && / patches size 4.5 /.test(compositeLine('YARD2', cases[4][1])), 'the default patch size goes unsaid, another is said')
check(compositeLine('Z', newComposite()) === null, 'one with no textures yet writes no line (the client refuses it)')
check(!/seam/.test(compositeLine('Z', { ...newComposite('A'), seam: 'blend' })), 'CONTROL: a blend with neither shift nor patches is not written (the client refuses `seam` alone)')
check(!read('Z', { ...newComposite('A'), shift: true, patches: 2 }).error && / patches size 2$/.test(compositeLine('Z', { ...newComposite('A'), shift: true, patches: 2 })), 'both shift and patches held: patches is written, so the client never sees both')
const s = shuffleSeed(() => 0.999999999)
check(s >= 0 && s <= 0xFFFFFF && read('Z', { ...newComposite('A'), seed: s }).def.seed === s, 'a shuffled seed is 24 bits, kept as written')

// --- animations.txt -----------------------------------------------------------------------
const mod = { textures: { LAVAFALL: { w: 64, h: 512, sheet: { layout: 'vertical', frames: 8, fps: 10 } }, STONE: { w: 64, h: 64 } },
  composites: Object.fromEntries([...cases, ['EMPTY', newComposite()]]) }
const txt = animationsTxt(mod)
const cat = parseAnimations(txt)
check([...cat.composites.keys()].sort().join() === 'FLOOR1,WALL1,WALL2,YARD,YARD2' && cat.sheets.has('LAVAFALL') && cat.warnings.length === 0,
  `the client reads every composite and the sheet, with no warning (${[...cat.composites.keys()].join()} | ${cat.warnings.join(' | ')})`)
check(animationsTxt({ composites: { FLOOR1: floor } }) !== null && animationsTxt({}) === null, 'a module with only composites writes the file; one with neither does not')
const withSheet = parseAnimations(animationsTxt({ textures: { LAVAFALL: mod.textures.LAVAFALL }, composites: { MIX: { ...newComposite('STONE'), members: [{ name: 'STONE', weight: 1 }, { name: 'LAVAFALL', weight: 1 }] } } }))
check(withSheet.composites.get('MIX')?.members.map((m) => m.name).join() === 'STONE', 'CONTROL: a sheet among its textures the client leaves out -- which compositeProblems says first')

// --- what the page says -------------------------------------------------------------------
const sizes = { STONE: { w: 64, h: 64 }, STONE_CRACKED: { w: 64, h: 64 }, STONE_MOSS: { w: 64, h: 64 }, GRIME: { w: 128, h: 128 }, TALL: { w: 64, h: 128 }, BIG: { w: 128, h: 128 }, LAVAFALL: { w: 64, h: 512 } }
const opts = { sizeOf: (n) => sizes[n] ?? null, isSheet: (n) => n === 'LAVAFALL', isComposite: (n) => n === 'WALL1', isTexture: (n) => n === 'STONE' }
check(compositeProblems('FLOOR1', floor, opts).length === 0, `CONTROL: a sound composite has no problems (${compositeProblems('FLOOR1', floor, opts).join(' | ')})`)
const said = (c, re, name = 'X') => compositeProblems(name, c, opts).some((p) => re.test(p))
check(said(newComposite(), /at least one texture/), 'no textures')
check(said({ ...newComposite(), members: Array.from({ length: 9 }, () => ({ name: 'STONE', weight: 1 })) }, /at most 8/), 'more than eight')
check(said({ ...newComposite('NOPE') }, /no texture called NOPE/), 'a texture that is not there')
check(said({ ...newComposite('LAVAFALL') }, /animated \(a sheet\)/) && said({ ...newComposite('WALL1') }, /is a composite/), 'a sheet, and a composite, as one of its textures')
check(said({ ...newComposite('TALL'), turn: true }, /'turn' needs square/) && !said({ ...newComposite('BIG'), turn: true }, /'turn'/), 'a turn on a picture that is not square (CONTROL: a square one)')
check(said({ ...newComposite('STONE'), members: [{ name: 'STONE', weight: 1 }, { name: 'BIG', weight: 1 }] }, /BIG is 128×128; it is drawn at STONE's 64×64/), 'a texture of another size, drawn at the first one\'s')
check(said({ ...newComposite('STONE'), overlay: { name: 'NOPE', scale: 4, strength: 0.5 } }, /for the overlay/) && said({ ...newComposite('STONE'), overlay: { name: 'LAVAFALL', scale: 4, strength: 0.5 } }, /not a still picture/), 'an overlay missing, or animated')
check(said(newComposite('STONE_CRACKED'), /a texture has that name too/, 'STONE') && said(newComposite('X'), /one of its own/), 'its name taken by a texture, and itself as a texture')

// --- following a texture --------------------------------------------------------------------
const comps = JSON.parse(JSON.stringify({ FLOOR1: floor, OTHER: newComposite('BRICK') }))
check(compositeTextures(comps.FLOOR1).join() === 'STONE,STONE_CRACKED,STONE_MOSS,GRIME' && compositesUsing(comps, 'GRIME').join() === 'FLOOR1', 'its textures and overlay, and who uses one')
check(renameInComposites(comps, 'GRIME', 'DIRT') === 1 && comps.FLOOR1.overlay.name === 'DIRT' && renameInComposites(comps, 'STONE', 'ROCK') === 1 && comps.FLOOR1.members[0].name === 'ROCK', 'a rename follows into its textures and its overlay')
check(dropFromComposites(comps, 'DIRT').join() === 'FLOOR1' && comps.FLOOR1.overlay === null && dropFromComposites(comps, 'BRICK').join() === 'OTHER' && comps.OTHER.members.length === 0, 'a delete takes it out (an overlay, the only texture)')

// --- the drawing: every pixel the texel the shader picks ---------------------------------------
// Pictures whose every pixel says which picture and where: r = member, g = x, b = y.
const pic = (k, w, h) => { const data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([k * 40, x, y, 255], (y * w + x) * 4); return { data, w, h } }
const W = 16
const modes = { plain: '', flip: 'flip', turn: 'turn', 'flip x': 'flip x', shift: 'shift', patches: 'patches size 2' }
for (const [label, words] of Object.entries(modes)) {
  const { def } = cp.parseCompositeLine(`composite T A 3 B C ${words}`.trim().split(/\s+/))
  const pics = [pic(0, W, W), pic(1, W, W), pic(2, W, W)]
  const out = renderComposite(cp, def, pics, null, { tilesX: 5, tilesY: 4, level: 3 })
  const p = cp.uniformsFor(def, { cell: [W, W], level: 3 })
  let bad = 0
  const seen = new Set()
  for (let gy = 0; gy < out.h; gy++) {
    for (let gx = 0; gx < out.w; gx++) {
      const [s] = cp.compositeSources(p, gx, gy, 0)
      const i = (gy * out.w + gx) * 4
      if (out.data[i] !== s.member * 40 || out.data[i + 1] !== s.x || out.data[i + 2] !== s.y) bad++
      seen.add(s.member)
    }
  }
  check(out.w === 5 * W && out.h === 4 * W && bad === 0 && seen.size === 3, `${label}: every pixel is the texel the client's twin picks, all three pictures shown (${bad} off)`)
}
{
  // CONTROL: the drawing is not right by accident -- the twin at another level picks other texels.
  const { def } = cp.parseCompositeLine('composite T A B C flip turn'.split(' '))
  const pics = [pic(0, W, W), pic(1, W, W), pic(2, W, W)]
  const a = renderComposite(cp, def, pics, null, { tilesX: 4, tilesY: 4, level: 0 })
  const b = renderComposite(cp, def, pics, null, { tilesX: 4, tilesY: 4, level: 1 })
  check(a.data.some((v, i) => v !== b.data[i]), 'CONTROL: another level lays it out otherwise')
}
{
  const { def } = cp.parseCompositeLine('composite T A B'.split(' '))
  const out = renderComposite(cp, def, [null, pic(1, W, W)], null, { tilesX: 4, tilesY: 4 })
  let onlyB = true
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i] !== 40) onlyB = false
  check(onlyB, 'a texture with no picture is left out, as the client leaves it out')
  check(renderComposite(cp, def, [null, null], null) === null, 'and with none, nothing is drawn')
  const small = renderComposite(cp, cp.parseCompositeLine('composite T A B'.split(' ')).def, [pic(0, W, W), pic(1, W / 2, W / 2)], null, { tilesX: 8, tilesY: 8 })
  let bOk = true
  for (let i = 0; i < small.data.length; i += 4) if (small.data[i] === 40 && (small.data[i + 1] > W / 2 - 1 || small.data[i + 2] > W / 2 - 1)) bOk = false
  check(small.w === 8 * W && bOk, 'a smaller picture is drawn at the first one\'s size, its own pixels stretched')
}
{
  // `seam blend`: the pixels are mixes of the twin's sources by their weights.
  const { def } = cp.parseCompositeLine('composite T A B shift seam blend'.split(' '))
  const pics = [pic(0, W, W), pic(5, W, W)]
  const out = renderComposite(cp, def, pics, null, { tilesX: 3, tilesY: 3 })
  const p = cp.uniformsFor(def, { cell: [W, W] })
  let bad = 0
  for (let gy = 0; gy < out.h; gy++) for (let gx = 0; gx < out.w; gx++) {
    const want = cp.compositeSources(p, gx, gy, 0).reduce((a, s) => a + s.member * 200 * s.w, 0)
    if (Math.abs(out.data[(gy * out.w + gx) * 4] - want) > 0.51) bad++
  }
  check(bad === 0, `seam blend: each pixel the weighted mix of the twin's four sources (${bad} off)`)
}
{
  // The overlay: grey changes nothing, white at full strength doubles, as the shader multiplies.
  const { def } = cp.parseCompositeLine('composite T A overlay O strength 1'.split(' '))
  const base = { data: new Uint8ClampedArray(W * W * 4).fill(100), w: W, h: W }
  const flat = (v) => ({ data: new Uint8ClampedArray(8 * 8 * 4).fill(v), w: 8, h: 8 })
  const none = renderComposite(cp, def, [base], null, { tilesX: 2, tilesY: 2 })
  const grey = renderComposite(cp, def, [base], { ...flat(0), data: new Uint8ClampedArray(8 * 8 * 4).fill(127.5) }, { tilesX: 2, tilesY: 2 })
  const white = renderComposite(cp, def, [base], flat(255), { tilesX: 2, tilesY: 2 })
  check(none.data[0] === 100 && Math.abs(grey.data[0] - 100) <= 1 && white.data[0] === 200 && white.data[3] === 100, `an overlay: grey neutral, white doubling, alpha untouched (${none.data[0]}, ${grey.data[0]}, ${white.data[0]})`)
}

// --- a grey copy for an overlay -----------------------------------------------------------------
{
  // A dark green picture, half of it see-through at the edges.
  const N = 16
  const col = new Uint8ClampedArray(N * 4)
  for (let k = 0; k < N; k++) col.set([20 + k, 90 + 3 * k, 30, k < 2 ? 0 : 255], k * 4)
  const g = greyscale(col)
  let grey = true; let sum = 0; let n = 0; let alpha = true
  for (let k = 0; k < N; k++) {
    const [r, gg, b, a] = g.subarray(k * 4, k * 4 + 4)
    if (r !== gg || gg !== b) grey = false
    if (a !== col[k * 4 + 3]) alpha = false
    if (a > 0) { sum += r; n++ }
  }
  check(grey && isGrey(g) && !isGrey(col), 'a grey copy is grey, and the coloured picture is told from it')
  check(Math.abs(sum / n - 127.5) <= 0.5 && alpha, `its average over the pixels that show is mid-grey, the overlay's no-change (${(sum / n).toFixed(2)}), alpha kept`)
  const flat = greyscale(col, { centre: false })
  const lum = (i) => 0.299 * col[i] + 0.587 * col[i + 1] + 0.114 * col[i + 2]
  check([0, 5, 15].every((k) => Math.abs(flat[k * 4] - lum(k * 4)) <= 0.5) && Math.abs((g[60] - g[20]) - (flat[60] - flat[20])) <= 1,
    'uncentred it is each pixel\'s luminance; centred, the contrast between pixels is the same')
  check(isGrey(new Uint8ClampedArray([10, 11, 10, 255, 200, 200, 201, 255])), 'a grey picture is grey to within PNG\'s rounding')
  // A dark picture with a white strip: shifted up, the strip clamps at white, and the average must still land on mid-grey.
  const strip = new Uint8ClampedArray(32 * 4)
  for (let k = 0; k < 32; k++) strip.set(k < 2 ? [255, 255, 255, 255] : [64, 80, 128, 255], k * 4)
  const sg = greyscale(strip)
  let st = 0; for (let k = 0; k < 32; k++) st += sg[k * 4]
  const naive = 255 / 16 + (0.299 * 64 + 0.587 * 80 + 0.114 * 128) * 15 / 16
  check(Math.abs(st / 32 - 127.5) <= 0.6 && sg[0] === 255, `with pixels clamped at white, the average is still mid-grey (${(st / 32).toFixed(2)}; a plain shift by ${(127.5 - naive).toFixed(1)} would give less)`)
  const taken = new Set(['MOSS_GREY', 'ABCDEFGHIJKLMNOPQRS_GREY'])
  check(greyName('MOSS', (n) => taken.has(n)) === 'MOSS_GREY2' && greyName('ABCDEFGHIJKLMNOPQRSTUVWX', (n) => taken.has(n)) === 'ABCDEFGHIJKLMNOPQR_GREY2' &&
    greyName('DIRT', () => false) === 'DIRT_GREY' && greyName('ABCDEFGHIJKLMNOPQRSTUVWX', () => false).length === 24, 'its name: NAME_GREY, cut to 24, numbered while taken')
  // Through the client's own sums: a surface shaded by the centred copy at full strength keeps its average.
  const { def } = cp.parseCompositeLine('composite T A overlay O strength 1'.split(' '))
  const base = { data: new Uint8ClampedArray(8 * 8 * 4).fill(100), w: 8, h: 8 }
  const oc = new Uint8ClampedArray(8 * 8 * 4)
  for (let k = 0; k < 64; k++) oc.set([(k * 37) % 120, 60 + (k % 9) * 10, 40, 255], k * 4)
  const shaded = renderComposite(cp, def, [base], { data: greyscale(oc), w: 8, h: 8 }, { tilesX: 4, tilesY: 4 })
  const tinted = renderComposite(cp, def, [base], { data: oc, w: 8, h: 8 }, { tilesX: 4, tilesY: 4 })
  const avg = (d, c) => { let t = 0; for (let i = c; i < d.length; i += 4) t += d[i]; return t / (d.length / 4) }
  check(Math.abs(avg(shaded.data, 0) - 100) < 3 && avg(shaded.data, 0) === avg(shaded.data, 1),
    `shaded by its grey copy, the surface keeps its brightness on average and gains no tint (${avg(shaded.data, 0).toFixed(1)})`)
  check(Math.abs(avg(tinted.data, 0) - avg(tinted.data, 1)) > 20, 'CONTROL: the coloured picture itself tints it')
}

// --- the module's files ------------------------------------------------------------------------
{
  const runtime = {}
  for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  const m = { ...newModule('cmp', 'cmp'), textures: { STONE: { w: 64, h: 64 }, MOSS: { w: 64, h: 64 }, GRIME: { w: 128, h: 128, cutout: true }, UNUSED: { w: 32, h: 32 } },
    composites: { FLOOR1: { ...newComposite('STONE'), members: [{ name: 'STONE', weight: 3 }, { name: 'MOSS', weight: 1 }], flip: true, overlay: { name: 'GRIME', scale: 6, strength: 0.4 } } } }
  const doc = newDoc('yard')
  addSector(doc, rect(0, 0, 16, 8), { floorTex: 'FLOOR1', ceilTex: 'F_SKY1' })
  addSpawn(doc, 'start', 2, 2)
  const r = await emitModule(m, [doc], { bake, runtime })
  const file = (p) => r.files.find((f) => f.path === p)?.bytes
  const index = JSON.parse(file('assets/textures/index.json'))
  check(index.sizes.STONE?.join() === '64,64' && index.sizes.MOSS && index.sizes.GRIME?.join() === '128,128' && index.cutout.GRIME === true,
    `index.json sizes a used composite's textures and its overlay (${Object.keys(index.sizes).join()})`)
  check(!index.sizes.FLOOR1 && !index.sizes.UNUSED, 'and not the composite\'s own name (it has no picture), nor what no map uses')
  const anims = parseAnimations(file('assets/animations.txt'))
  check(anims.composites.get('FLOOR1')?.overlay?.name === 'GRIME' && anims.warnings.length === 0, 'animations.txt carries it, and the client reads it')
  check(r.ok, `the module bakes with a composite on its floor (${r.problems.map((p) => JSON.stringify(p)).join(' | ')})`)
}

console.log(`composites: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
