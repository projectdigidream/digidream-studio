//
// The brain as a graph: every way the runtime can leave a state is an arrow,
// and the arrangement puts every state somewhere, the initial one first.
//
import { edgesOf, autoLayout, summarizeWhen, problemsByState } from '../src/graph.js'
import { DEFAULT_BRAIN } from '../src/brain.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const m = DEFAULT_BRAIN()
const edges = edgesOf(m)
const has = (from, to, kind) => edges.some((e) => e.from === from && e.to === to && e.kind === kind)
check(has('look', 'chase', 'transition') && has('chase', 'look', 'transition') && has('chase', 'attack', 'transition'), 'transitions are arrows')
check(has('attack', 'chase', 'next') && has('pain', 'chase', 'next') && has('death', 'death', 'next'), 'timed states point at their next, a self-loop included')
check(edges.length === 6, `six arrows in the default brain (${edges.length})`)
m.states.chase.sequence = [{ at: 5, action: 'goto', state: 'pain' }]
check(edgesOf(m).some((e) => e.kind === 'goto' && e.from === 'chase' && e.to === 'pain' && /@5/.test(e.label)), 'a goto step is an arrow with its tick')
check(summarizeWhen([{ cond: 'has_target' }, { cond: 'target_visible', negate: true }]) === 'has_target & !target_visible', 'conditions read as a sentence')
check(summarizeWhen([]) === 'always' && summarizeWhen(undefined) === 'always', 'no conditions reads as always')

const lay = autoLayout(m, {})
check(Object.keys(m.states).every((s) => lay[s] && Number.isFinite(lay[s].x)), 'every state is placed')
check(lay.look.x < lay.chase.x && lay.chase.x < lay.attack.x, `columns follow distance from the initial state (${lay.look.x} < ${lay.chase.x} < ${lay.attack.x})`)
const kept = autoLayout(m, { look: { x: 999, y: 1 } })
check(kept.look.x === 999 && kept.chase, 'a hand-placed state stays where it was and the rest are placed')
m.states.orphan = { anim: 0, move: 'stop' }
const withOrphan = autoLayout(m, {})
check(withOrphan.orphan.x > withOrphan.attack.x, 'an unreachable state goes in a column of its own, after the rest')

const byState = problemsByState(['mob "grunt", state "pain": has `ticks` and so needs `next`', 'mob "grunt": needs `initial`', 'mob "other", state "pain": x'], 'grunt')
check(byState.get('pain')?.length === 1 && byState.size === 1, 'problems are filed under their state, for this mob only')

// CONTROL: the arrangement is deterministic, so the picture does not shuffle on every open.
check(JSON.stringify(autoLayout(m, {})) === JSON.stringify(autoLayout(m, {})), 'CONTROL: the same brain lays out the same way twice')

console.log(`\ngraph: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
