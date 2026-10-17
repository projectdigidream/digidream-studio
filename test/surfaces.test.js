//
// How a surface is painted, and whether you can see through it.
//
// A flat's texture is projected straight down from world coordinates, and
// `floorangle`, `flooroffx/y`, `floorscale` and `flooralpha` sit on top of
// that projection (docs/MAP_AUTHOR.md); a wall takes `alpha` for the grate a
// two-sided line could always draw and never show. What has to be proven is
// that the studio writes the same grammar mapc reads, and that a map which
// says nothing about any of it still hashes as it always did -- because
// modules/doom2/assets/music/index.json is keyed by that hash, and a re-bake
// that folded in a default would unmap every soundtrack.
//
// ORACLES: build/<arch>/mapc, and the runtime's own loader read back through
// client/src/mapdata.js.
//
import { newDoc, addSector, addSpawn, validate, newStyle, styleIsDefault } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { requireOracles, bakeNative, readBaked } from './oracle.js'

requireOracles('surfaces')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const build = (tweak) => {
  const doc = newDoc('surf')
  const a = addSector(doc, rect(0, 0, 16, 16), { floorTex: 'F', ceilTex: 'C' })
  const b = addSector(doc, rect(16, 0, 32, 16), { floorTex: 'F', ceilTex: 'C' })
  addSpawn(doc, 'start', 2, 2)
  tweak?.(doc, a, b)
  normalize(doc)
  return { doc, emitted: emitMap(derive(doc), doc, []) }
}

// --- a map that says nothing is written exactly as it was ------------------------------
const plain = build()
check(!/floorangle|floorscale|flooralpha|ceilangle|alpha /.test(plain.emitted.text),
      'a map with every style at its default writes none of them')
check(styleIsDefault(newStyle()) && !styleIsDefault({ ...newStyle(), scale: 2 }), 'a default style is recognised as one')

// --- and one that does ------------------------------------------------------------------
const styled = build((doc, a) => {
  a.floorStyle = { angle: 30, offX: 0.25, offY: -1.5, scale: 1.5, alpha: 128 }
  a.ceilStyle = { angle: 90, offX: 0, offY: 0, scale: 0.5, alpha: 255 }
  a.verts[1].edge.alpha = 254
})
check(/floorangle 30 flooroffx 0\.25 flooroffy -1\.5 floorscale 1\.5 flooralpha 128/.test(styled.emitted.text),
      `the floor's style is one prefix and one suffix apiece (${/sector .*/.exec(styled.emitted.text)?.[0]?.slice(0, 120)})`)
check(/ceilangle 90 ceilscale 0\.5/.test(styled.emitted.text) && !/ceilalpha/.test(styled.emitted.text),
      'the ceiling writes what it changed and not what it did not')
check(/alpha 254/.test(styled.emitted.text), 'and a wall takes an alpha of its own')

// --- through the real compiler, read back by the runtime ---------------------------------
const baked = bakeNative(styled.emitted.text, 'surf')
check(baked.ok, `mapc accepts the studio's surfaces:\n${baked.stderr}`)
if (baked.ok) {
  const { data } = await readBaked(baked.dnpm)
  const s = data.sectors[0]
  check(Math.abs(s.floorStyle.turns * 360 - 30) < 0.01, `the angle arrives as turns of the degrees written (${(s.floorStyle.turns * 360).toFixed(3)}°)`)
  check(Math.abs(s.floorStyle.offX - 0.25) < 1e-6 && Math.abs(s.floorStyle.offY + 1.5) < 1e-6, 'the offsets survive')
  check(Math.abs(s.floorStyle.scale - 1.5) < 1e-6, `the scale survives (${s.floorStyle.scale})`)
  check(Math.abs(s.floorStyle.alpha - 128 / 255) < 1e-3, `alpha arrives as the fraction a material takes (${s.floorStyle.alpha.toFixed(3)})`)
  check(Math.abs(s.ceilStyle.scale - 0.5) < 1e-6 && s.ceilStyle.alpha === 1, 'the ceiling keeps its own, and stays opaque')
  const seeThrough = data.sides.filter((x) => x.alpha < 1)
  check(seeThrough.length === 1 && Math.abs(seeThrough[0].alpha - 254 / 255) < 1e-3,
        `exactly one wall is see-through (${seeThrough.length}, alpha ${seeThrough[0]?.alpha?.toFixed(3)})`)
}

// --- painted in the sector's own frame ----------------------------------------------------
//
// Only a sector that MOVES can tell the two frames apart, so this is the one
// style whose point is what happens later: a sliding platform otherwise slides
// out from under its own pattern, and a turntable becomes a window onto a
// floor somewhere else.
const anchored = build((doc, a) => { a.floorStyle = { ...newStyle(), anchor: 'sector' } })
check(/flooranchor sector/.test(anchored.emitted.text), `a flat can be painted in its sector's frame (${/sector[^\n]*flooranchor[^\n]*/.exec(anchored.emitted.text)?.[0]?.slice(0, 90)})`)
check(!/ceilanchor/.test(anchored.emitted.text), 'CONTROL: and the ceiling, which said nothing, stays in the world')
const abaked = bakeNative(anchored.emitted.text, 'anchor')
check(abaked.ok, `mapc accepts it:\n${abaked.stderr}`)
if (abaked.ok) {
  const { data } = await readBaked(abaked.dnpm)
  check(data.sectors[0].floorStyle.anchor === 1 && data.sectors[0].ceilStyle.anchor === 0,
        `the floor is anchored to the sector and the ceiling to the world (${data.sectors[0].floorStyle.anchor}, ${data.sectors[0].ceilStyle.anchor})`)
}

// --- THE HASH. A map that says nothing about a style must hash as it always did ----------
const bare = bakeNative(plain.emitted.text, 'bare')
const withDefaults = build((doc, a, b) => { a.floorStyle = newStyle(); b.ceilStyle = newStyle(); a.floorStyle.anchor = 'world'; a.verts[0].edge.alpha = 255 })
const same = bakeNative(withDefaults.emitted.text, 'bare2')
check(bare.ok && same.ok && Buffer.compare(Buffer.from(bare.dnpm), Buffer.from(same.dnpm)) === 0,
      'writing a style that is entirely default changes nothing in the bake, so an older map keeps its hash')
const different = bakeNative(styled.emitted.text, 'diff')
check(different.ok && Buffer.compare(Buffer.from(bare.dnpm), Buffer.from(different.dnpm)) !== 0,
      'CONTROL: a style that says something does change it')

// --- the rules ----------------------------------------------------------------------------
const zero = build((doc, a) => { a.floorStyle = { ...newStyle(), scale: 0 } })
check(validate(zero.doc).some((p) => /scale must be greater than zero/.test(p.msg)), 'CONTROL: a scale of zero is refused, because it is a division')
check(!bakeNative(zero.emitted.text, 'zero').ok, 'CONTROL: and mapc refuses it too')
const wild = build((doc, a) => { a.ceilStyle = { ...newStyle(), alpha: 300 } })
check(validate(wild.doc).some((p) => /alpha 300 is outside 0\.\.255/.test(p.msg)), 'CONTROL: an alpha past 255 is named')
const wall = build((doc, a) => { a.verts[0].edge.alpha = -5 })
check(validate(wall.doc).some((p) => /alpha -5 is outside/.test(p.msg)), "CONTROL: and so is a wall's")

// --- A WALL'S TURN AND SIZE (docs/WALL_STYLES.md): a flat's angle and scale, on a wall ------
const turned = build((doc, a) => { const e = a.verts[0].edge; e.middle = 'BRICK'; e.angle = 30; e.scale = 2 })
check(/tex BRICK[^\n]* angle 30 scale 2/.test(turned.emitted.text), "a wall's turn and size are written on its vertex line")
const tb = bakeNative(turned.emitted.text, 'walls')
check(tb.ok, `mapc accepts them:\n${tb.stderr}`)
if (tb.ok) {
  const { data } = await readBaked(tb.dnpm)
  const side = data.sides.find((x) => x.turns > 0)
  check(side && Math.abs(side.turns - 30 / 360) < 1e-6 && Math.abs(side.scale - 2) < 1e-6,
        `and the runtime reads the wall back turned a twelfth and twice the size (${side ? `${side.turns} ${side.scale}` : 'no turned side'})`)
}
const wallDefaults = build((doc, a) => { a.verts[0].edge.angle = 0; a.verts[0].edge.scale = 1 })
const wd = bakeNative(wallDefaults.emitted.text, 'wdef')
check(bare.ok && wd.ok && Buffer.compare(Buffer.from(bare.dnpm), Buffer.from(wd.dnpm)) === 0 && !/ angle | scale /.test(wallDefaults.emitted.text.split('\n').filter((l) => /^\s*vertex/.test(l)).join('\n')),
      'a wall at no turn and size 1 writes neither, so a map keeps its hash')
const flatWall = build((doc, a) => { a.verts[0].edge.scale = 0 })
check(validate(flatWall.doc).some((p) => /a wall's texture scale must be greater than zero/.test(p.msg)), "CONTROL: a wall's zero scale is named, as a flat's is")

console.log(`surfaces: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
