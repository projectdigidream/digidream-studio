//
// One-tap behaviours: a door, a lift, a switch, a trip-wire teleport, an
// ambush, an exit, a crusher. Each is a few triggers written in the
// vocabulary, exactly as an author would write them by hand -- the door is
// maps/doors_trig.lua's door with the numbers made generic -- so a preset is
// something the cards can show and the author can then change. Nothing here
// is a special case the runtime knows about.
//
// Every preset takes the document and the thing that was tapped, checks that
// the geometry can do what is asked (a door needs rooms on both sides), and
// either adds its triggers and flags and returns them, or returns the problem.
//
import { addTrigger, findEdge } from './doc.js'
import { derive } from './topology.js'
import { num as fmt } from './mapfmt.js'

const SPEED_DOOR = [1, 4]
const SPEED_LIFT = [1, 8]
const SPEED_FLOOR = [1, 8]

/** A name no trigger in the document has yet. */
function uniqueName (doc, base) {
  // A preset's triggers are "<base>: <part>", so the base is taken when any
  // trigger is named that way too.
  const taken = (b) => doc.triggers.some((t) => t.name === b || t.name.startsWith(`${b}: `))
  if (!taken(base)) return base
  for (let i = 2; ; i++) if (!taken(`${base} ${i}`)) return `${base} ${i}`
}

/** Sides of `sector` that have a neighbour, with the neighbour's edge facing them. */
function portals (doc, sectorId) {
  const d = derive(doc)
  const s = d.sectors.find((x) => x.id === sectorId)
  if (!s) return []
  return s.verts.filter((v) => v.kind === 'neighbor').map((v) => {
    const n = doc.sectors[v.neighbor]
    const q = s.verts[(s.verts.indexOf(v) + 1) % s.verts.length]
    const facing = n.verts.find((w, i) => {
      const r = n.verts[(i + 1) % n.verts.length]
      return w.x === q.x && w.y === q.y && r.x === v.x && r.y === v.y
    })
    return { edge: v.edge, neighbor: n, facing: facing?.edge ?? null }
  })
}

const fail = (msg) => ({ ok: false, problems: [msg], triggers: [] })

/**
 * A manual door: the tapped sector's ceiling sits on its floor, and pressing
 * it from either room opens it; it shuts on its own ninety ticks after it has
 * finished opening. Every portal side of the door gets the usable flag.
 */
export function door (doc, sectorId, { name = 'door', openTicks = 90 } = {}) {
  const s = doc.sectors[sectorId]
  if (!s) return fail('no such sector')
  const ports = portals(doc, sectorId).filter((p) => p.facing)
  if (ports.length === 0) return fail(`${name}: the sector has no room on any side to be opened from`)
  s.ceil = s.floor
  const base = uniqueName(doc, name)
  const shut = addTrigger(doc, {
    name: `${base}: shut`,
    conditions: [{ c: 'sector_at_rest', sector: { sector: sectorId } }],
    actions: [{ a: 'sector_move', sector: { sector: sectorId }, surface: 'ceiling', to: 'base_ceiling', speed: SPEED_DOOR }]
  })
  const made = [shut]
  for (const p of ports) {
    p.facing.flags.usable = true
    const side = { edgeTwin: p.edge.id }
    made.push(addTrigger(doc, {
      name: `${base}: open${ports.length > 1 ? ` from ${p.neighbor.id}` : ''}`,
      event: 'on_interact',
      conditions: [
        { c: 'side_is', side },
        { c: 'sector_at_rest', sector: 'behind' },
        { c: 'sector_offset_at_least', sector: 'behind', z: '0.25', negate: true }
      ],
      actions: [
        { a: 'sector_move', sector: 'behind', surface: 'ceiling', to: 'lowest_neighbour_ceiling', offset: [-1, 8], speed: SPEED_DOOR },
        { a: 'run_after', trigger: { trigger: shut.id }, after: 'behind', ticks: openTicks }
      ]
    }))
    made.push(addTrigger(doc, {
      name: `${base}: close${ports.length > 1 ? ` from ${p.neighbor.id}` : ''}`,
      event: 'on_interact',
      conditions: [
        { c: 'side_is', side },
        { c: 'sector_at_rest', sector: 'behind' },
        { c: 'sector_offset_at_least', sector: 'behind', z: '0.25' }
      ],
      actions: [{ a: 'sector_move', sector: 'behind', surface: 'ceiling', to: 'base_ceiling', speed: SPEED_DOOR }]
    }))
  }
  return { ok: true, problems: [], triggers: made }
}

/**
 * A lift: walking into the tapped sector from any neighbour lowers its floor
 * to the lowest neighbouring floor; it rises again `waitTicks` after settling.
 */
export function lift (doc, sectorId, { name = 'lift', waitTicks = 60 } = {}) {
  const s = doc.sectors[sectorId]
  if (!s) return fail('no such sector')
  const ports = portals(doc, sectorId).filter((p) => p.facing)
  if (ports.length === 0) return fail(`${name}: nothing walks into a sector with no neighbours`)
  const base = uniqueName(doc, name)
  const raise = addTrigger(doc, {
    name: `${base}: raise`,
    actions: [{ a: 'sector_move', sector: { sector: sectorId }, surface: 'floor', to: 'base_floor', speed: SPEED_LIFT }]
  })
  const lower = addTrigger(doc, {
    name: `${base}: lower`,
    actions: [
      { a: 'sector_move', sector: { sector: sectorId }, surface: 'floor', to: 'lowest_neighbour_floor', speed: SPEED_LIFT },
      { a: 'run_after', trigger: { trigger: raise.id }, after: { sector: sectorId }, ticks: waitTicks }
    ]
  })
  const made = [raise, lower]
  for (const p of ports) {
    // A crossing is reported as the side of the sector LEFT, so entering the
    // lift from a room is that room's side facing the lift.
    p.facing.flags.trigger = true
    made.push(addTrigger(doc, {
      name: `${base}: step on from ${p.neighbor.id}`,
      event: 'on_cross',
      conditions: [{ c: 'side_is', side: { edgeTwin: p.edge.id } },
                   { c: 'sector_at_rest', sector: { sector: sectorId } }],
      actions: [{ a: 'run', trigger: { trigger: lower.id } }]
    }))
  }
  return { ok: true, problems: [], triggers: made }
}

/** A switch on the tapped edge that moves a target sector's floor or ceiling. */
export function switchFor (doc, edgeId, targetId, {
  name = 'switch', surface = 'floor', to = 'lowest_neighbour_floor', once = false
} = {}) {
  const e = findEdge(doc, edgeId)
  if (!e) return fail('no such edge')
  if (!doc.sectors[targetId]) return fail('no such target sector')
  e.edge.flags.usable = true
  const t = addTrigger(doc, {
    name: uniqueName(doc, name),
    event: 'on_interact',
    once,
    conditions: [{ c: 'side_is', side: { edge: edgeId } }, { c: 'sector_at_rest', sector: { sector: targetId } }],
    actions: [{ a: 'sector_move', sector: { sector: targetId }, surface, to, speed: SPEED_FLOOR }]
  })
  return { ok: true, problems: [], triggers: [t] }
}

/** Crossing the tapped edge, from either side, teleports the crosser to (x, y, z). */
export function teleport (doc, edgeId, x, y, z = 0, { name = 'teleport' } = {}) {
  const e = findEdge(doc, edgeId)
  if (!e) return fail('no such edge')
  const base = uniqueName(doc, name)
  e.edge.flags.trigger = true
  const made = [addTrigger(doc, {
    name: base,
    event: 'on_cross',
    conditions: [{ c: 'side_is', side: { edge: edgeId } }],
    actions: [{ a: 'teleport', x: fmt(x), y: fmt(y), z: fmt(z) }]
  })]
  const twin = twinEdge(doc, edgeId)
  if (twin) {
    twin.flags.trigger = true
    made.push(addTrigger(doc, {
      name: `${base}: from the other side`,
      event: 'on_cross',
      conditions: [{ c: 'side_is', side: { edgeTwin: edgeId } }],
      actions: [{ a: 'teleport', x: fmt(x), y: fmt(y), z: fmt(z) }]
    }))
  }
  return { ok: true, problems: [], triggers: made }
}

/** Crossing the tapped edge once spawns a monster at (x, y, z). */
export function ambush (doc, edgeId, mobName, x, y, z = 0, { name = 'ambush' } = {}) {
  const e = findEdge(doc, edgeId)
  if (!e) return fail('no such edge')
  const base = uniqueName(doc, name)
  e.edge.flags.trigger = true
  const spawn = { a: 'spawn_enemy', name: mobName, x: fmt(x), y: fmt(y), z: fmt(z) }
  const made = [addTrigger(doc, {
    name: base, event: 'on_cross', once: true,
    conditions: [{ c: 'side_is', side: { edge: edgeId } }],
    actions: [spawn]
  })]
  const twin = twinEdge(doc, edgeId)
  if (twin) {
    twin.flags.trigger = true
    made.push(addTrigger(doc, {
      name: `${base}: from the other side`, event: 'on_cross', once: true,
      conditions: [{ c: 'side_is', side: { edgeTwin: edgeId } }],
      actions: [{ a: 'disable', trigger: { trigger: made[0].id } }, spawn]
    }))
    made[0].actions.push({ a: 'disable', trigger: { trigger: made[1].id } })
  }
  return { ok: true, problems: [], triggers: made }
}

/** Pressing the tapped edge ends the level. */
export function exit (doc, edgeId, { name = 'exit' } = {}) {
  const e = findEdge(doc, edgeId)
  if (!e) return fail('no such edge')
  e.edge.flags.usable = true
  const t = addTrigger(doc, {
    name: uniqueName(doc, name), event: 'on_interact', once: true,
    conditions: [{ c: 'side_is', side: { edge: edgeId } }],
    actions: [{ a: 'log', text: 'exit reached' }, { a: 'change_map' }]
  })
  return { ok: true, problems: [], triggers: [t] }
}

/** Pressing the tapped edge starts the target sector's ceiling pounding for ever. */
export function crusher (doc, edgeId, targetId, { name = 'crusher', gap = 0.25 } = {}) {
  const e = findEdge(doc, edgeId)
  if (!e) return fail('no such edge')
  const s = doc.sectors[targetId]
  if (!s) return fail('no such target sector')
  e.edge.flags.usable = true
  const t = addTrigger(doc, {
    name: uniqueName(doc, name), event: 'on_interact', once: true,
    conditions: [{ c: 'side_is', side: { edge: edgeId } }],
    actions: [{ a: 'sector_move', sector: { sector: targetId }, surface: 'ceiling', to: 'absolute',
                height: fmt(s.floor + gap), speed: SPEED_LIFT, loop: 'pingpong' }]
  })
  return { ok: true, problems: [], triggers: [t] }
}

/** The edge in another sector that runs the other way along `edgeId`, or null. */
export function twinEdge (doc, edgeId) {
  const e = findEdge(doc, edgeId)
  if (!e) return null
  const q = e.sector.verts[(e.i + 1) % e.sector.verts.length]
  for (const sid of doc.order) {
    if (sid === e.sector.id) continue
    const s = doc.sectors[sid]
    for (let i = 0; i < s.verts.length; i++) {
      const w = s.verts[i]; const r = s.verts[(i + 1) % s.verts.length]
      if (w.x === q.x && w.y === q.y && r.x === e.vert.x && r.y === e.vert.y) return w.edge
    }
  }
  return null
}

/** A tag no sector carries yet, above every tag in use. */
export function nextTag (doc) {
  let t = 0
  for (const sid of doc.order) t = Math.max(t, doc.sectors[sid].tag ?? 0)
  return t + 1
}

export const PRESETS = { door, lift, switch: switchFor, teleport, ambush, exit, crusher }
