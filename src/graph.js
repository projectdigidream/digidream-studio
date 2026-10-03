//
// A brain or an arsenal as a graph: named nodes, and what moves between them.
// Pure, so the workshop's picture and its test read the same thing.
//
// Three kinds of edge, because the runtime has three ways to leave a node
// (docs/MOBS.md): a TRANSITION fires when its conditions hold; NEXT follows
// when a timed node's ticks run out; a GOTO action in a sequence jumps at a
// given tick.
//
// A MONSTER'S BRAIN AND A WEAPON ARE THE SAME GRAPH. A mob's nodes are
// `states` and a weapon's are `phases` (maps/scripts/weapon_vocab.lua), and a
// goto names one by a field of its own name -- which is the whole of the
// difference, so it is two words of configuration rather than a second copy of
// this file. Automatic fire, a charge, a combo and an alt-fire are shapes in
// that graph rather than flags, which is why one editor can draw both.
//
export const MOB_SHAPE = { nodes: 'states', gotoField: 'state' }
export const WEAPON_SHAPE = { nodes: 'phases', gotoField: 'phase' }

/** Every edge of a graph: [{ from, to, kind, label, index }]. */
export function edgesOf (mob, shape = MOB_SHAPE) {
  const out = []
  for (const [from, s] of Object.entries(mob?.[shape.nodes] ?? {})) {
    ;(s.transitions ?? []).forEach((tr, i) => {
      if (tr.to) out.push({ from, to: tr.to, kind: 'transition', index: i, label: summarizeWhen(tr.when) })
    })
    if (s.next && s.ticks !== undefined) out.push({ from, to: s.next, kind: 'next', index: -1, label: `after ${s.ticks} ticks` })
    ;(s.sequence ?? []).forEach((step, i) => {
      const to = step[shape.gotoField]
      if (step.action === 'goto' && to) out.push({ from, to, kind: 'goto', index: i, label: `@${step.at ?? 0}: goto` })
    })
  }
  return out
}

/** "has_target & !target_visible", or "always". */
export function summarizeWhen (when) {
  if (!when || !when.length) return 'always'
  return when.map((c) => (c.negate ? '!' : '') + (c.cond ?? '?') + argHint(c)).join(' & ')
}

function argHint (c) {
  const keys = Object.keys(c).filter((k) => k !== 'cond' && k !== 'negate')
  if (!keys.length) return ''
  return ' ' + keys.map((k) => (typeof c[k] === 'object' ? k : `${c[k]}`)).join(',')
}

export const NODE_W = 168
export const NODE_H = 72
const GAP_X = 240
const GAP_Y = 110

/**
 * Positions for every state that has none: columns by distance from the
 * initial state (breadth first over every edge kind), rows in the order the
 * states were written. Unreachable states go in a last column. Existing
 * positions are kept, so a hand-arranged graph stays arranged.
 */
export function autoLayout (mob, layout = {}, shape = MOB_SHAPE) {
  const names = Object.keys(mob?.[shape.nodes] ?? {})
  const out = { ...layout }
  const edges = edgesOf(mob, shape)
  const depth = new Map()
  const start = mob.initial && names.includes(mob.initial) ? mob.initial : names[0]
  if (start) {
    depth.set(start, 0)
    const queue = [start]
    while (queue.length) {
      const n = queue.shift()
      for (const e of edges) {
        if (e.from !== n || depth.has(e.to) || !names.includes(e.to)) continue
        depth.set(e.to, depth.get(n) + 1)
        queue.push(e.to)
      }
    }
  }
  const far = Math.max(0, ...depth.values()) + 1
  const columns = new Map()
  for (const n of names) {
    const d = depth.has(n) ? depth.get(n) : far
    columns.set(d, [...(columns.get(d) ?? []), n])
  }
  for (const [d, col] of columns) {
    col.forEach((n, i) => { if (!out[n]) out[n] = { x: 40 + d * GAP_X, y: 40 + i * GAP_Y } })
  }
  return out
}

/**
 * Which nodes the validator complained about, from its sentences.
 *
 * The validators write where a problem is in words -- `mob "imp", state
 * "chase": ...` -- so this reads that back rather than every check having to
 * carry a machine-readable address it would otherwise never use.
 */
export function problemsByState (problems, owner, { kind = 'mob', node = 'state' } = {}) {
  const out = new Map()
  const re = new RegExp(`^${kind} "${owner}", ${node} "([^"]+)"`)
  for (const p of problems) {
    const m = re.exec(p)
    if (m) out.set(m[1], [...(out.get(m[1]) ?? []), p])
  }
  return out
}
