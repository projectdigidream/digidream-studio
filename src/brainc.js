//
// The editor's words, compiled to the engine's.
//
// The module keeps a monster's brain and a weapon's phases in the engine's own
// shape (docs/MOBS.md, docs/WEAPONS.md), so a module written by hand or by an
// older studio is read as it is. The monster and weapon editors add a few keys
// of their own, and this writes them out as plain vocabulary when the module is
// emitted or checked:
//
//   brain.any    rules for any state ("whatever it is doing"): each is put at
//                the head of every state's transitions, except `death`, the
//                states that opt out (`no_any`) and the rule's own target --
//                a rule into the state it is in would restart it every tick.
//   rule.once    fires a single time (a boss's phase change): the rule also
//                needs `var_is __onceN 0`, and the state it enters sets that
//                var to 1 as its first step. Saves keep a monster's vars
//                (ENGINE_NEEDS, "Only once"), so a reload does not undo it.
//   state.ends   branches taken as its time runs out: appended after its own
//                transitions with `state_elapsed >= ticks`; transitions are
//                checked before the deadline on the same tick, so a branch
//                that holds wins over `next` (proven in test_lua_mobneeds.cpp).
//   brain.phases and state.phase
//                a boss's stages. Grouping only, except a phase's `speed`:
//                `set_param move_speed` as the first step of each of its flow
//                states, and the body's own speed in the flow states outside
//                any phase. Reactions (pain, death) are left alone: pain
//                RESUMES what it interrupted without re-running its first
//                steps, so a speed set during a flinch would stick.
//   "further than N"
//                is target_within N negated, which also holds with no target
//                at all; the editor marks it `with_target`, and `has_target`
//                is added beside it.
//   brain.label  a monster's display name; dropped (a weapon's `label` is the engine's own).
//
// A rule with no target or no condition yet is the editor's unfinished rule:
// it never fires, so it is not written.
//
// Pure: no DOM, no module mutation.
//
import { fxOf } from './phrases.js'

const BRAIN_KEYS = ['label', 'phases', 'any', 'recipe']
const STATE_KEYS = ['phase', 'ends', 'no_any']

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)))
// A transition with no `when` at all is the runtime's own business (left as written); an empty list is the editor's unfinished rule.
const complete = (r) => r && typeof r.to === 'string' && r.to !== '' && !(Array.isArray(r.when) && r.when.length === 0)

/** The hidden var that remembers rule i of `any` has fired. */
export const onceVar = (i) => `__once${i + 1}`

/**
 * "further than": the editor's negated target_within carries `with_target`,
 * because "not within" also holds with no target at all. The marker becomes a
 * `has_target` beside it. A negated target_within written by hand, without
 * the marker, means what it says and is left alone.
 */
function withTarget (when) {
  if (!Array.isArray(when)) return when
  const out = when.map(clone)
  const marked = out.some((c) => c.with_target)
  for (const c of out) delete c.with_target
  if (marked && !out.some((c) => c.cond === 'has_target' && !c.negate)) out.push({ cond: 'has_target' })
  return out
}

/**
 * The rules for any state, ready to put in front of a node's transitions:
 * [{ rule, i }] with `once` turned into its var.
 */
function anyRules (any) {
  return (any ?? []).map((r, i) => ({ r, i })).filter(({ r }) => complete(r) && Array.isArray(r.when) && r.when.length > 0).map(({ r, i }) => {
    const when = withTarget(r.when) ?? []
    if (r.once) when.push({ cond: 'var_is', var: onceVar(i), value: 0 })
    return { to: r.to, when, i, once: !!r.once }
  })
}

/**
 * Compiles one node map (a monster's `states` or a weapon's `phases`).
 * @param kind  'mob' | 'weapon'
 */
function compileNodes (nodes, { kind, any, phases, baseSpeed }) {
  const out = {}
  const rules = anyRules(any)
  const elapsed = kind === 'mob' ? 'state_elapsed' : 'phase_elapsed'
  const speeds = kind === 'mob' && (phases ?? []).some((p) => fxOf(Number(p.speed)) !== undefined)
  for (const [name, node] of Object.entries(nodes ?? {})) {
    const n = clone(node)
    for (const k of STATE_KEYS) delete n[k]
    const own = (node.transitions ?? []).filter(complete).map((t) => ({ ...clone(t), when: withTarget(t.when) }))
    const ends = node.ticks !== undefined
      ? (node.ends ?? []).filter(complete).map((t) => ({ to: t.to, when: [...(withTarget(t.when) ?? []), { cond: elapsed, ticks: node.ticks }] }))
      : []
    const follows = name !== 'death' && !node.no_any
    const head = follows ? rules.filter((r) => r.to !== name).map(({ to, when }) => ({ to, when: clone(when) })) : []
    const transitions = [...head, ...own, ...ends]
    if (transitions.length) n.transitions = transitions
    else delete n.transitions
    // the steps a phase and a once-rule add go first, at tick 0
    const pre = []
    for (const r of rules) if (r.once && r.to === name) pre.push({ at: 0, action: 'set_var', var: onceVar(r.i), value: 1 })
    const reaction = name === 'pain' || name === 'death' || node.next === '@previous'
    if (speeds && !reaction) {
      const ph = (phases ?? []).find((p) => p.id === node.phase)
      const v = fxOf(Number(ph?.speed ?? baseSpeed))
      if (v !== undefined) pre.push({ at: 0, action: 'set_param', param: 'move_speed', value: v })
    }
    // The runtime walks a sequence IN ITS ORDER, a step running once its `at`
    // has passed and every step before it has run -- so the order is the
    // author's and is kept. The compiler's own steps are at tick 0, first.
    if (pre.length) n.sequence = [...pre, ...(n.sequence ?? [])]
    out[name] = n
  }
  return { nodes: out, onceVars: rules.filter((r) => r.once).map((r) => onceVar(r.i)) }
}

/**
 * A monster's brain as mobs.load{} takes it.
 * @param body  its body prop ({ speed }), for a phase's speed to come back to
 */
export function compileMob (brain, body = null) {
  const b = clone(brain)
  for (const k of BRAIN_KEYS) delete b[k]
  const { nodes, onceVars } = compileNodes(brain.states, { kind: 'mob', any: brain.any, phases: brain.phases, baseSpeed: body?.speed ?? 4 })
  b.states = nodes
  if (onceVars.length) { b.vars = { ...(b.vars ?? {}) }; for (const v of onceVars) b.vars[v] ??= 0 }
  return b
}

/** A weapon as weapons.load{} takes it. */
export function compileWeapon (weapon) {
  const w = clone(weapon)
  // a weapon's `label` is the engine's own (its name in the arsenal); only the editor's rules go
  for (const k of ['any', 'recipe']) delete w[k]
  const { nodes, onceVars } = compileNodes(weapon.phases, { kind: 'weapon', any: weapon.any })
  w.phases = nodes
  if (onceVars.length) { w.vars = { ...(w.vars ?? {}) }; for (const v of onceVars) w.vars[v] ??= 0 }
  return w
}

/** The module's `mobs` table, compiled: { missiles, mobs }. */
export function compileMobs (mobsTable, props = []) {
  const mobs = {}
  for (const [name, brain] of Object.entries(mobsTable?.mobs ?? {})) {
    const body = props.find((p) => p.name === (brain.prop ?? name)) ?? null
    mobs[name] = compileMob(brain, body)
  }
  const missiles = {}
  for (const [name, m] of Object.entries(mobsTable?.missiles ?? {})) { const c = clone(m); delete c.label; missiles[name] = c }
  return { missiles, mobs }
}

/** The module's `weapons` table with each weapon compiled; pools, health and pickups as they are. */
export function compileArsenal (weaponsTable) {
  if (!weaponsTable) return weaponsTable
  const out = { ...weaponsTable, weapons: {} }
  for (const [name, w] of Object.entries(weaponsTable.weapons ?? {})) out.weapons[name] = compileWeapon(w)
  return out
}
