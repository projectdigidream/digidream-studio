//
// CLIMBING: what a side marked `climbable` will climb, by the engine's rule
// (core/src/physics/controller.cpp climb_top; docs/PLAYER.md "How climbing
// plays").
//
// A side climbs from the sector it belongs to -- the one the climber stands
// in -- up to:
//   a WALL           the ceiling;
//   a STEP's face    the floor beyond it, where the climb ends in a mantle onto
//                    the ledge -- but only a face higher than STEP_HEIGHT, as a
//                    step the body walks up anyway is never grabbed;
//   a step DOWN      nowhere: there is no face above this floor to hold, which
//                    is what a flag on the upper sector's side of a step is;
//   an OPEN side     nowhere: there is no wall at all.
//
// Read from derive(), so a side's kind is the one the bake writes: a shared
// edge is a neighbour unless forced to a wall, a cut's rim faces its pit.
//
// Pure: the inspector, the problems list and the tests use it.
//
import { derive } from './topology.js'

// The engine's (core/include/dnp/sim/constants.hpp STEP_HEIGHT).
export const STEP_HEIGHT = 0.5

/**
 * Every climbable side and what it climbs:
 *   [{ sector, edge, kind: 'wall'|'step'|'low'|'down'|'open', height, to }]
 * `height` is how far the climb goes above this sector's floor; `to` the
 * sector a step's face climbs onto.
 */
export function climbSides (doc, derived = derive(doc)) {
  const byId = new Map(derived.sectors.map((s) => [s.id, s]))
  const out = []
  for (const s of derived.sectors) {
    for (const v of [...s.verts, ...s.holes.flat()]) {
      if (!v.edge?.flags?.climbable) continue
      out.push({ sector: s.id, edge: v.edge, ...reach(s, v, byId) })
    }
  }
  return out
}

function reach (s, v, byId) {
  if (v.kind === 'open') return { kind: 'open', height: 0, to: null }
  if (v.kind === 'wall') return { kind: 'wall', height: s.ceil - s.floor, to: null }
  const back = byId.get(v.neighbor)
  const h = (back?.floor ?? s.floor) - s.floor
  if (!(h > 0)) return { kind: 'down', height: 0, to: v.neighbor }
  return { kind: h > STEP_HEIGHT ? 'step' : 'low', height: h, to: v.neighbor }
}

/** What one climbable side does, in a sentence (the inspector says it). */
export function climbSays (c) {
  const h = Number(c.height.toFixed(3))
  return {
    wall: `Climbs ${h} up this wall, to the ceiling.`,
    step: `Climbs the ${h}-high face onto ${c.to}, and mantles over the top.`,
    low: `A ${h} step is walked up, so it is never grabbed (a face must be higher than ${STEP_HEIGHT}).`,
    down: `This side looks down onto ${c.to}: there is no face above this floor to hold. The climbable side of a step is the lower room's -- the other side of this wall.`,
    open: 'An open side has no wall to hold.'
  }[c.kind]
}

/** The climbable sides that can never be grabbed, as problems: [{ sector, edge, msg }]. */
export function climbProblems (doc, derived) {
  const all = climbSides(doc, derived)
  // A cut's rim is the nested sector's own edge, mirrored: a pit's wall
  // flagged climbable climbs out of the pit and looks down from the room
  // above. It is a problem only if no side it is climbs anything.
  const climbs = new Set(all.filter((c) => c.kind === 'wall' || c.kind === 'step').map((c) => c.edge))
  return all
    .filter((c) => (c.kind === 'low' || c.kind === 'down' || c.kind === 'open') && !climbs.has(c.edge))
    .map((c) => ({ sector: c.sector, edge: c.edge.id, msg: `a climbable side that never grabs: ${climbSays(c)}` }))
}
