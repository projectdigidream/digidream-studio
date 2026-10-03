//
// The METAMAP: the module's levels on a grid (maps/metamap.txt).
//
// The engine's grammar (engine/server/src/world/metamap.cpp) is three words:
// `radius N` (0..4) -- how many cells around a player stay loaded; `pitch X Y`
// -- the world size of a cell, and when there is one, the levels on the grid
// SHARE ONE WORLD, each at (pitch.x * cell.x, pitch.y * cell.y); `cell X Y map`.
// Without a pitch the grid only says what to keep in memory.
//
// In a shared world two levels join only where their authors made them meet:
// a side marked open (a ledge) in one that is exactly the reverse of an open
// side in the other, at the same world points (engine/core/include/dnp/geom/
// mapstore.hpp). The seam check below says, for the map being edited, which of
// its boundary sides meet a neighbour's, and which would if they were open.
// Production transitions are authored per pair of maps (compose's corridors
// are test scaffolding), so this checks; it never generates.
//
// Pure: the Maps section, the map editor and emitModule all use it.
//

export const MAX_RADIUS = 4

/** maps/metamap.txt, or null when the module has no metamap to write. */
export function metamapText (mm) {
  if (!mm?.enabled) return null
  const cells = Object.entries(mm.cells ?? {})
  if (!cells.length) return null
  const L = ['# metamap.txt -- written by the studio from module.studio.json.', '# Where the module\'s levels sit (engine/server/src/world/metamap.hpp).']
  L.push(`radius ${mm.radius ?? 1}`)
  if (mm.pitch) L.push(`pitch ${word(mm.pitch[0])} ${word(mm.pitch[1])}`)
  for (const [name, [x, y]] of cells.sort((a, b) => a[1][1] - b[1][1] || a[1][0] - b[1][0])) L.push(`cell ${x} ${y} ${name}`)
  return L.join('\n') + '\n'
}

const word = (v) => String(Number(Number(v).toFixed(6)))

/** What the server would refuse, said first. */
export function metamapProblems (mm, mapNames) {
  const out = []
  if (!mm?.enabled) return out
  if (!(Number.isInteger(mm.radius) && mm.radius >= 0 && mm.radius <= MAX_RADIUS)) out.push(`radius must be a whole number 0..${MAX_RADIUS}`)
  if (mm.pitch && !(mm.pitch[0] > 0 && mm.pitch[1] > 0)) out.push('a pitch must be greater than zero both ways')
  const seen = new Map()
  for (const [name, c] of Object.entries(mm.cells ?? {})) {
    if (!mapNames.includes(name)) out.push(`cell ${c[0]} ${c[1]} names '${name}', which is not a map of the module`)
    if (!Number.isInteger(c[0]) || !Number.isInteger(c[1])) out.push(`'${name}' is not on a whole cell`)
    const k = `${c[0]},${c[1]}`
    if (seen.has(k)) out.push(`cell ${k} holds both '${seen.get(k)}' and '${name}'`)
    seen.set(k, name)
  }
  return out
}

/** Which map is in a cell, or null. */
export function mapAt (mm, x, y) {
  for (const [name, c] of Object.entries(mm?.cells ?? {})) if (c[0] === x && c[1] === y) return name
  return null
}

/** The maps within the radius of `name`'s cell: [{ name, dx, dy }], not itself. */
export function neighboursOf (mm, name) {
  const me = mm?.cells?.[name]
  if (!mm?.enabled || !me) return []
  const r = mm.radius ?? 1
  const out = []
  for (const [n, c] of Object.entries(mm.cells)) {
    if (n === name) continue
    const dx = c[0] - me[0]; const dy = c[1] - me[1]
    if (Math.abs(dx) <= r && Math.abs(dy) <= r) out.push({ name: n, dx, dy })
  }
  return out
}

/** Where a neighbour's own coordinates sit in this map's: its origin minus ours. */
export const offsetOf = (mm, dx, dy) => ({ x: dx * (mm?.pitch?.[0] ?? 0), y: dy * (mm?.pitch?.[1] ?? 0) })

/**
 * The outline sides of a derived map that face nothing inside it (a wall or an
 * open edge with no neighbour): [{ edgeId, a, b, open }], in its own units.
 */
export function outerSides (derived) {
  const out = []
  for (const s of derived.sectors) {
    const n = s.verts.length
    s.verts.forEach((v, i) => {
      if (v.kind !== 'wall' && v.kind !== 'open') return
      const q = s.verts[(i + 1) % n]
      out.push({ edgeId: v.edge.id, sector: s.id, a: { x: v.x, y: v.y }, b: { x: q.x, y: q.y }, open: v.kind === 'open' })
    })
  }
  return out
}

/**
 * This map's boundary against its neighbours, in its own coordinates.
 *
 * @param mine        outerSides(derive(this map))
 * @param neighbours  [{ name, offset: {x, y}, sides: outerSides(derive(theirs)) }]
 * @returns [{ edgeId, sector, a, b, with, state }] where state is
 *          'joined'   both open: the engine stitches them;
 *          'one-way'  only one side open: they will not join;
 *          'walls'    both walls along the same line: they meet, closed;
 *          'loose'    this side is open and nothing meets it.
 */
export function seamCheck (mine, neighbours) {
  const key = (p, q) => `${p.x},${p.y}>${q.x},${q.y}`
  const theirs = new Map()
  for (const nb of neighbours) {
    for (const s of nb.sides) {
      const a = { x: s.a.x + nb.offset.x, y: s.a.y + nb.offset.y }
      const b = { x: s.b.x + nb.offset.x, y: s.b.y + nb.offset.y }
      theirs.set(key(b, a), { ...s, with: nb.name })
    }
  }
  const out = []
  for (const s of mine) {
    const t = theirs.get(key(s.a, s.b))
    if (t) out.push({ ...s, with: t.with, state: s.open && t.open ? 'joined' : (s.open || t.open) ? 'one-way' : 'walls' })
    else if (s.open) out.push({ ...s, with: null, state: 'loose' })
  }
  return out
}

/** Corners of a map outside its cell [0, pitch): they would overlap a neighbour. */
export function outsideCell (doc, pitch) {
  if (!pitch) return []
  const out = []
  for (const sid of doc.order) {
    for (const v of doc.sectors[sid].verts) {
      if (v.x < 0 || v.y < 0 || v.x > pitch[0] || v.y > pitch[1]) { out.push(sid); break }
    }
  }
  return out
}
