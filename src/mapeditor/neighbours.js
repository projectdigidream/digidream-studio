//
// The map's neighbours on the metamap, in the map editor.
//
// With the metamap on and a pitch set, the levels on the grid are one world:
// each sits at (pitch.x * cell.x, pitch.y * cell.y), and this map is drawn in
// its own coordinates, 0 to the pitch -- so a neighbour one cell east is this
// map's picture moved one pitch east. Each neighbour is baked by the same
// compiler as everything else and drawn as a real MapView (the game's look,
// not an outline), cached until that map's document changes. They are drawn,
// never picked: the map being edited is the only one under a finger.
//
// The seam check (metamap.js) then says which of this map's boundary sides
// meet a neighbour's and how, for the viewport to colour and the wall's
// inspector to say.
//
import { MapView } from '/src/render/scene.js'
import { readMap } from '/src/mapdata.js'
import { normalize, derive } from '../topology.js'
import { emitMap } from '../mapfmt.js'
import { neighboursOf, offsetOf, outerSides, seamCheck } from '../metamap.js'

let S = null
const cache = new Map()          // map name -> { key, view, sides }
let running = null

/** A key that changes when the map's geometry or its textures do. */
const keyOf = (doc) => JSON.stringify([doc.order, doc.sectors, doc.texscale])

async function bakeNeighbour (name, doc) {
  const key = keyOf(doc)
  const hit = cache.get(name)
  if (hit && hit.key === key) return hit
  const copy = structuredClone(doc)
  normalize(copy)
  const derived = derive(copy)
  const { text } = emitMap(derived, copy, [])
  const r = await S.bake({ mapPath: `modules/${S.module.id}/maps/${name}.map`, mapText: text, files: {} })
  const polys = derived.sectors.map((sec) => ({ floor: sec.floor, pts: sec.verts.map((v) => ({ x: v.x, y: v.y })) }))
  if (!r.ok) { cache.set(name, { key, view: null, polys, sides: outerSides(derived), failed: r.errors.map((e) => e.msg).join('; ') }); return cache.get(name) }
  const loaded = S.core.loadMap(r.dnpm)
  if (!loaded.ok) return null
  const view = new MapView(readMap(loaded.map))
  view.setDynamicSectors([])
  await S.textures.apply(view, copy.texscale)
  hit?.view?.root.removeFromParent()
  const out = { key, view, polys, sides: outerSides(derived) }
  cache.set(name, out)
  return out
}

/**
 * Bring the neighbours up to date for the map being edited: draw them, and
 * set S.seams to the seam check against them. Cheap when nothing changed.
 */
export async function refreshNeighbours () {
  if (running) { running.again = true; return running.promise }
  running = { again: false }
  running.promise = (async () => {
    do {
      running.again = false
      const mm = S.module.metamap
      const near = mm?.enabled && mm.pitch && S.route() === 'map' ? neighboursOf(mm, S.docName) : []
      // Nothing to show and nothing shown: touch nothing. A redraw here lands
      // after every bake, and in the middle of whatever a finger is doing.
      if (!near.length && !(S.neighbourInfo?.length) && !(S.seams?.length)) continue
      const drawn = []
      const sides = []
      for (const nb of near) {
        const doc = S.docs[nb.name]
        if (!doc) continue
        const b = await bakeNeighbour(nb.name, doc)
        if (!b) continue
        const offset = offsetOf(mm, nb.dx, nb.dy)
        if (b.view) drawn.push({ view: b.view, offset })
        sides.push({ name: nb.name, offset, sides: b.sides })
      }
      const info = near.map((nb) => ({ ...nb, offset: offsetOf(mm, nb.dx, nb.dy), failed: cache.get(nb.name)?.failed ?? null, polys: cache.get(nb.name)?.polys ?? [] }))
      const mine = structuredClone(S.doc)
      normalize(mine)
      const seams = near.length ? seamCheck(outerSides(derive(mine)), sides) : []
      // Drawn again only when what is drawn changed: this runs after every bake.
      const views = drawn.map((d) => d.view)
      const same = JSON.stringify([info, seams]) === JSON.stringify([S.neighbourInfo ?? [], S.seams ?? []]) &&
                   views.length === (S.neighbourViews?.length ?? 0) && views.every((v, i) => v === S.neighbourViews[i])
      if (same) continue
      S.neighbourInfo = info
      S.seams = seams
      S.neighbourViews = views
      S.viewport.setNeighbours(drawn)
      S.redraw()
    } while (running.again)
  })()
  try { await running.promise } finally { running = null }
}

export function install (s) {
  S = s
  S.refreshNeighbours = refreshNeighbours
  S.seamFor = (edgeId) => (S.seams ?? []).find((x) => x.edgeId === edgeId) ?? null
}
