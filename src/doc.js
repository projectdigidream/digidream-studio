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
// NUMBERS ARE DYADIC. Every coordinate and height sits on a grid of 1/256 of a
// unit (1/8 before the grid could be switched off; topology.js multiplies two
// of them, so a map thousands of units wide stays far inside a double's 2^53), so a JS double holds it exactly, String() prints it exactly, and
// mapc's parse_fx reads it back exactly. The document has no floats in the
// sense the engine forbids: it has fractions whose denominator is a power of
// two, which is the one kind of decimal that survives the round trip.
//
// An EDGE lives on the vertex it starts at, the way a .map line does: verts[i]
// carries the edge from verts[i] to verts[i+1]. It has its own id, because
// normalising a loop's winding moves edges to different start vertices and
// the id must follow the edge, not the vertex.
//

export const RES = 256            // grid resolution: coordinates are multiples of 1/RES
export const MIN_GRID = 1 / RES
export const DEFAULT_GRID = 0.25

// The engine's capacities (core/include/dnp/geom/mapstore.hpp), so a document
// is refused here with a sentence instead of by mapc with a count.
export const CAP = {
  sectors: 512, points: 4096, sides: 4096, spawns: 64, lights: 128,
  textures: 256, scripts: 16, loopPoints: 192, holesPerSector: 64, textureName: 24,
  // Camera paths (core/include/dnp/geom/mapstore.hpp). Deliberately small: a
  // map has a handful of scripted shots, not a network of track.
  paths: 16, pathPoints: 256,
  // Sector effects (core/include/dnp/geom/sector_fx.hpp, MAX_MAP_FX).
  effects: 256
}

// The effect kinds mapc parses (sector_fx.hpp). Their keys and defaults come
// from the engine at run time: studio/src/fxlib.js.
export const FX_KIND_NAMES = ['rain', 'snow', 'dust', 'embers', 'fog']

export const EDGE_FLAGS = ['climbable', 'grapple', 'blocking', 'trigger', 'usable']

// The player's size when nobody has said otherwise. The module's
// `player.body` says otherwise for every map, and a map's `playerOverride.body`
// for itself (studio/src/player.js, playerFor).
export const DEFAULT_BODY = { radius: 0.5, height: 2 }

export function newDoc (name = 'level') {
  return {
    version: 1,
    name,
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
    // The camera the map is played from: turns and units, null = the engine's
    // own. `mode` and the four path fields are design §4.1's camera modes;
    // `path` is a path's TAG, never its index (docs/MAP_AUTHOR.md).
    camera: { yaw: null, pitch: null, distance: null, lockYaw: false, lockZoom: false,
              mode: null, path: null, speed: null, attach: null, blend: null },
    // Camera paths: [{ id, tag, loop, anchored, points: [{ id, x, y, z }] }].
    // The camera rides a CURVE through the points, not the polyline.
    paths: [],
    extraLua: ''
  }
}

export function newId (doc, prefix) {
  return `${prefix}${doc.nextId++}`
}

/**
 * A flat's painting style, all at "no change" -- what every map was drawn as.
 *
 * `anchor` is whose coordinates the pattern is painted in. Only a sector that
 * MOVES can tell `world` from `sector`, which is why world is the default: a
 * sector at rest is drawn identically either way, and the option is only
 * meaningful for the ones that travel or turn.
 */
export function newStyle () { return { angle: 0, offX: 0, offY: 0, scale: 1, alpha: 255, anchor: 'world' } }

/** Whether a style says anything, so the emitter can leave a default unwritten. */
export function styleIsDefault (st) {
  if (!st) return true
  return !st.angle && !st.offX && !st.offY && (st.scale === undefined || st.scale === 1) &&
         (st.alpha === undefined || st.alpha === 255) && (st.anchor === undefined || st.anchor === 'world')
}

export function newEdge (doc, attrs = {}) {
  return {
    id: newId(doc, 'e'),
    flags: {},
    middle: null, upper: null, lower: null,
    xoff: 0, yoff: 0,
    // The picture turned (degrees) and drawn larger (scale), as a flat's is
    // (docs/WALL_STYLES.md): about the side's texture origin, then shifted by
    // the offsets, then scaled. 0 and 1 change nothing and are never written.
    angle: 0, scale: 1,
    // 255 is the solid sheet every wall was drawn as; anything less lets the
    // picture's own alpha channel through, which is how a grate is made.
    alpha: 255,
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
    // HOW EACH FLAT IS PAINTED. A flat's texture is projected straight down
    // from WORLD coordinates -- which is why neighbouring floors line up
    // instead of each restarting at its own origin -- and these sit on top of
    // that projection. Angle in degrees, offsets in world units applied after
    // the rotation, `scale` how many times LARGER the tile is drawn, and
    // `alpha` 0..255 where 255 is the opaque surface that was always drawn.
    floorStyle: newStyle(), ceilStyle: newStyle(),
    verts: corners.map((c) => ({ id: newId(doc, 'v'), x: c.x, y: c.y, edge: newEdge(doc, edge) })),
    ...attrs
  }
  doc.sectors[s.id] = s
  doc.order.push(s.id)
  return s
}

/**
 * A room taken out of the map, with the triggers that named it or one of its
 * walls (a door's preset names both) and those that ran them: left behind,
 * they point at nothing, and the map no longer bakes -- the views then kept
 * drawing the room from the last bake, a ghost nothing could select. They are
 * returned, so whoever deleted it is told; undo brings them all back.
 */
export function removeSector (doc, id) {
  const gone = triggersNaming(doc, id)
  delete doc.sectors[id]
  doc.order = doc.order.filter((s) => s !== id)
  if (gone.length) doc.triggers = doc.triggers.filter((t) => !gone.includes(t))
  return gone
}

/** The triggers that name a room or one of its walls, and those that run them. */
export function triggersNaming (doc, sectorId) {
  const s = doc.sectors[sectorId]
  if (!s) return []
  const walls = new Set(s.verts.map((v) => v.edge?.id).filter(Boolean))
  const gone = new Set()
  const names = (v) => !!v && typeof v === 'object' && !Array.isArray(v) &&
    (v.sector === sectorId || walls.has(v.edge) || walls.has(v.edgeTwin) || (v.trigger !== undefined && gone.has(v.trigger)))
  for (let more = true; more;) {
    more = false
    for (const t of doc.triggers ?? []) {
      if (gone.has(t.id) || ![...(t.conditions ?? []), ...(t.actions ?? [])].some((e) => Object.values(e).some(names))) continue
      gone.add(t.id); more = true
    }
  }
  return (doc.triggers ?? []).filter((t) => gone.has(t.id))
}

/** The map's graphs that still name a room (a graph is the author's: it is told, not changed). */
export function graphsNaming (doc, sectorId) {
  return Object.entries(doc.graphs ?? {}).filter(([, g]) => JSON.stringify(g).includes(`{"sector":"${sectorId}"}`)).map(([n]) => n)
}

/**
 * A camera path, empty. `tag` is what a script names it by and is NOT unique:
 * mapc takes the first match, exactly as docs/MAP_AUTHOR.md says.
 *
 * `anchored` is whether its points ride the sector under them. mapc infers the
 * anchor per point at bake; saying `anchor none` pins every point to the world
 * instead. ponytail: one switch for the whole path rather than per point --
 * the per-point case (one point of a path crossing a lift) needs a control on
 * a point, and nothing has asked for it yet.
 */
export function addPath (doc, tag = 0) {
  doc.paths ??= []
  const p = { id: newId(doc, 'c'), tag, loop: false, anchored: true, points: [] }
  doc.paths.push(p)
  return p
}

/**
 * A waypoint, appended -- or inserted at `at`, which is what rearranging one
 * into the middle of a curve needs. The curve runs through the points IN
 * ORDER, so where a point sits in the list is part of the shape.
 */
export function addPathPoint (doc, path, x, y, z = 0, at = -1) {
  const pt = { id: newId(doc, 'w'), x, y, z }
  if (at >= 0 && at < path.points.length) path.points.splice(at, 0, pt)
  else path.points.push(pt)
  return pt
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
// WHAT A MAP IS NOT ALLOWED TO HOLD.
//
// A monster, a weapon, a prop, a particle kind and the player's art belong to
// the MODULE and are shared by every map in it: the runtimes load each of them
// once per level from one file the module owns (mobs.load and weapons.load
// both refuse a second call), so a definition living in a map document would
// be a definition that exists in one level and silently not in the next.
//
// The studio has always kept them apart -- nothing writes these onto a map --
// and this is here so that staying that way is checked rather than remembered.
const MODULE_ONLY = ['mobs', 'weapons', 'props', 'vfx', 'player', 'sprites', 'textures', 'missiles']

export function validate (doc) {
  const problems = []
  const say = (msg, sector = null) => problems.push(sector ? { msg, sector } : { msg })
  for (const key of MODULE_ONLY) {
    if (doc[key] !== undefined) {
      say(`the map carries \`${key}\`, which belongs to the module: every map of a module shares one set, and a copy here would exist in this level and nowhere else`)
    }
  }

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
    for (const [which, st] of [['floor', s.floorStyle], ['ceiling', s.ceilStyle]]) {
      if (!st) continue
      // Refused rather than clamped, and refused here rather than at the bake:
      // zero is a division, and an author who wrote one wants to be told.
      if (st.scale !== undefined && !(st.scale > 0)) say(`${which} scale must be greater than zero, got ${st.scale}`, sid)
      if (st.alpha !== undefined && (st.alpha < 0 || st.alpha > 255)) say(`${which} alpha ${st.alpha} is outside 0..255`, sid)
    }
    for (const v of s.verts) {
      if (v.edge.alpha !== undefined && (v.edge.alpha < 0 || v.edge.alpha > 255)) say(`a wall's alpha ${v.edge.alpha} is outside 0..255`, sid)
      if (v.edge.scale !== undefined && !(v.edge.scale > 0)) say(`a wall's texture scale must be greater than zero, got ${v.edge.scale}`, sid)
    }
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
  const paths = doc.paths ?? []
  if (paths.length > CAP.paths) say(`${paths.length} camera paths; a map holds ${CAP.paths}`)
  let pathPoints = 0
  for (const p of paths) {
    // Two is the minimum the grammar accepts, and a one-point path is a curve
    // through nothing -- mapc refuses it, so saying so here is the difference
    // between a message in the studio and a failed bake.
    if (p.points.length < 2) say(`camera path ${p.tag} has ${p.points.length} point(s); a path needs at least 2`)
    if (p.tag < 0 || p.tag > 65535) say(`camera path tag ${p.tag} is outside 0..65535`)
    pathPoints += p.points.length
  }
  if (pathPoints > CAP.pathPoints) say(`${pathPoints} camera path points in all; a map holds ${CAP.pathPoints}`)
  // Weather and fog: the kinds mapc knows, and the per-map cap. The keys are
  // mapc's to judge, against the engine's own table.
  let effects = 0
  for (const sid of doc.order) {
    for (const e of doc.sectors[sid].fx ?? []) {
      effects++
      if (!FX_KIND_NAMES.includes(e.kind)) say(`no effect called "${e.kind}" (${FX_KIND_NAMES.join(', ')})`, sid)
    }
  }
  if (effects > CAP.effects) say(`${effects} sector effects; a map holds ${CAP.effects}`)
  // A map's own size, when it has one: its override, or the body of a
  // document written before the size belonged to the module.
  const body = doc.playerOverride?.body ?? doc.body
  if (body && !(body.radius > 0 && body.height > 0)) say('body radius and height must both be positive')
  if (!(doc.texscale > 0)) say('texscale must be positive')
  return problems
}
