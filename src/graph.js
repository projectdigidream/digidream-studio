//
// A monster's brain as a graph: states are nodes, what moves between them are
// edges. Pure, so the workshop's picture and its test read the same thing.
//
// Three kinds of edge, because the runtime has three ways to leave a state
// (docs/MOBS.md): a TRANSITION fires when its conditions hold; NEXT follows
// when a timed state's ticks run out; a GOTO action in a sequence jumps at a
// given tick.
//

/** Every edge of a brain: [{ from, to, kind, label, index }]. */
export function edgesOf (mob) {
  const out = []
  for (const [from, s] of Object.entries(mob.states ?? {})) {
    ;(s.transitions ?? []).forEach((tr, i) => {
      if (tr.to) out.push({ from, to: tr.to, kind: 'transition', index: i, label: summarizeWhen(tr.when) })
    })
    if (s.next && s.ticks !== undefined) out.push({ from, to: s.next, kind: 'next', index: -1, label: `after ${s.ticks} ticks` })
    ;(s.sequence ?? []).forEach((step, i) => {
      if (step.action === 'goto' && step.state) out.push({ from, to: step.state, kind: 'goto', index: i, label: `@${step.at ?? 0}: goto` })
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
export function autoLayout (mob, layout = {}) {
  const names = Object.keys(mob.states ?? {})
  const out = { ...layout }
  const edges = edgesOf(mob)
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

/** Which states the validator complained about, from its sentences. */
export function problemsByState (problems, mobName) {
  const out = new Map()
  for (const p of problems) {
    const m = new RegExp(`^mob "${mobName}", state "([^"]+)"`).exec(p)
    if (m) out.set(m[1], [...(out.get(m[1]) ?? []), p])
  }
  return out
}
