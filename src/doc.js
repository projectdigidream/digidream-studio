//
// The studio document: what a level IS while it is being edited.
//
// STABLE IDS, NEVER INDICES. A trigger says "the edge e12", not "side 7":
// side 7 is whatever mapc's walk makes it on the day, and one inserted vertex
// renumbers every side after it. Ids are minted once from a counter in the
// document and survive every edit; the indices are computed at emit time by
// mapfmt.js from the same walk that writes the .map, so they cannot disagree
// with it.
//
// NUMBERS ARE DYADIC. Every coordinate and height sits on a grid of 1/8 of a
// unit, so a JS double holds it exactly, String() prints it exactly, and
// mapc's parse_fx reads it back exactly. The document has no floats in the
// sense the engine forbids: it has fractions whose denominator is a power of
// two, which is the one kind of decimal that survives the round trip.
//
// An EDGE lives on the vertex it starts at, the way a .map line does: verts[i]
// carries the edge from verts[i] to verts[i+1]. It has its own id, because
// normalising a loop's winding moves edges to different start vertices and
// the id must follow the edge, not the vertex.
//

export const RES = 8              // grid resolution: coordinates are multiples of 1/RES
export const MIN_GRID = 1 / RES
export const DEFAULT_GRID = 0.25

// The engine's capacities (core/include/dnp/geom/mapstore.hpp), so a document
// is refused here with a sentence instead of by mapc with a count.
export const CAP = {
  sectors: 512, points: 4096, sides: 4096, spawns: 64, lights: 128,
  textures: 256, scripts: 8, loopPoints: 192, holesPerSector: 64, textureName: 24
}

export const EDGE_FLAGS = ['climbable', 'grapple', 'blocking', 'trigger', 'usable']

export function newDoc (name = 'level') {
  return {
    version: 1,
    name,
    body: { radius: 0.5, height: 2 },
    texscale: 32,
    grid: DEFAULT_GRID,
    nextId: 1,
    sectors: {},
    order: [],
    spawns: [],
    lights: [],
    entities: [],
    triggers: [],
    music: {},                // cue name -> track name; the game starts `default`
    // The camera the map is played from: turns and units, null = the engine's own.
    camera: { yaw: null, pitch: null, distance: null, lockYaw: false, lockZoom: false },
    extraLua: ''
  }
}

export function newId (doc, prefix) {
  return `${prefix}${doc.nextId++}`
}

export function newEdge (doc, attrs = {}) {
  return {
    id: newId(doc, 'e'),
    flags: {},
    middle: null, upper: null, lower: null,
    xoff: 0, yoff: 0,
    unpegUpper: false, unpegLower: false,
    // 'wall' forces a solid wall where topology would derive a neighbour.
    force: null,
    ...attrs
  }
}

/**
 * A sector from a list of {x, y} corners, in either winding. `attrs` overrides
 * the defaults; `edge` is applied to every edge.
 */
export function addSector (doc, corners, attrs = {}, edge = {}) {
  const s = {
    id: newId(doc, 's'),
    // 'auto' decides platform-or-cut from the floor heights when the sector is
    // nested in another; see topology.js. Top-level sectors ignore it.
    kind: 'auto',
    floor: 0, ceil: 4, light: 255, thickness: 0, tag: 0,
    floorTex: null, ceilTex: null,
    verts: corners.map((c) => ({ id: newId(doc, 'v'), x: c.x, y: c.y, edge: newEdge(doc, edge) })),
    ...attrs
  }
  doc.sectors[s.id] = s
  doc.order.push(s.id)
  return s
}

export function removeSector (doc, id) {
  delete doc.sectors[id]
  doc.order = doc.order.filter((s) => s !== id)
}

export function addSpawn (doc, tag, x, y, z = 0) {
  const sp = { id: newId(doc, 'p'), tag, x, y, z }
  doc.spawns.push(sp)
  return sp
}

export function addLight (doc, x, y, z, attrs = {}) {
  const l = { id: newId(doc, 'l'), x, y, z, r: 255, g: 255, b: 255, radius: 12, intensity: 1, ...attrs }
  doc.lights.push(l)
  return l
}

/** kind: 'mob' | 'prop'. */
export function addEntity (doc, kind, name, x, y, z = 0, attrs = {}) {
  const e = { id: newId(doc, 'n'), kind, name, x, y, z, dormant: false, ...attrs }
  doc.entities.push(e)
  return e
}

export function addTrigger (doc, t) {
  const trig = { id: newId(doc, 't'), name: '', event: null, once: false, enabled: true,
                 conditions: [], actions: [], ...t }
  doc.triggers.push(trig)
  return trig
}

/** Every edge in the document, with its sector and index: [{sector, i, edge}]. */
export function edges (doc) {
  const out = []
  for (const sid of doc.order) {
    const s = doc.sectors[sid]
    s.verts.forEach((v, i) => out.push({ sector: s, i, edge: v.edge, vert: v }))
  }
  return out
}

export function findEdge (doc, edgeId) {
  return edges(doc).find((e) => e.edge.id === edgeId) ?? null
}

/** Snap to the document's grid; the grid itself is never finer than 1/RES. */
export function snap (v, grid) {
  const g = Math.max(grid, MIN_GRID)
  return Math.round(v / g) * g
}

const okTexture = (t) => t === null || (typeof t === 'string' && t.length > 0 &&
                         t.length <= CAP.textureName && !/\s/.test(t))

/**
 * What mapc would refuse, said first and in the document's own terms.
 * Returns [{msg, sector?}]; empty means "worth baking".
 */
export function validate (doc) {
  const problems = []
  const say = (msg, sector = null) => problems.push(sector ? { msg, sector } : { msg })

  if (doc.order.length > CAP.sectors) say(`${doc.order.length} sectors; the engine holds ${CAP.sectors}`)
  let points = 0
  const textures = new Set()
  for (const sid of doc.order) {
    const s = doc.sectors[sid]
    if (!s) { say(`order names a sector that does not exist: ${sid}`); continue }
    if (s.verts.length < 3) say(`has ${s.verts.length} corners; a sector needs at least 3`, sid)
    if (s.verts.length > CAP.loopPoints) say(`has ${s.verts.length} corners; a loop holds ${CAP.loopPoints}`, sid)
    // A ceiling ON the floor is a closed door, which mapc bakes and a trigger
    // opens; only a ceiling below the floor is a shape nothing can mean.
    if (s.ceil < s.floor) say(`ceiling ${s.ceil} is below floor ${s.floor}`, sid)
    if (s.light < 0 || s.light > 255) say(`light ${s.light} is outside 0..255`, sid)
    if (s.thickness < 0) say('thickness is negative', sid)
    if (s.tag < 0 || s.tag > 65535) say(`tag ${s.tag} is outside 0..65535`, sid)
    for (const t of [s.floorTex, s.ceilTex]) {
      if (!okTexture(t)) say(`texture name '${t}' is not usable (1..${CAP.textureName} chars, no spaces)`, sid)
      if (t) textures.add(t)
    }
    for (const v of s.verts) {
      for (const t of [v.edge.middle, v.edge.upper, v.edge.lower]) {
        if (!okTexture(t)) say(`texture name '${t}' is not usable`, sid)
        if (t) textures.add(t)
      }
    }
    points += s.verts.length
  }
  if (points > CAP.points) say(`${points} corners in all; the engine holds ${CAP.points}`)
  if (textures.size > CAP.textures) say(`${textures.size} distinct textures; a map holds ${CAP.textures}`)
  if (doc.spawns.length > CAP.spawns) say(`${doc.spawns.length} spawns; the engine holds ${CAP.spawns}`)
  if (!doc.spawns.some((p) => p.tag === 'start')) say("no spawn tagged 'start'; the server spawns players there")
  for (const p of doc.spawns) if (p.tag.length === 0 || p.tag.length > 32) say(`spawn tag '${p.tag}' must be 1..32 chars`)
  if (doc.lights.length > CAP.lights) say(`${doc.lights.length} lights; the engine holds ${CAP.lights}`)
  if (!(doc.body.radius > 0 && doc.body.height > 0)) say('body radius and height must both be positive')
  if (!(doc.texscale > 0)) say('texscale must be positive')
  return problems
}
