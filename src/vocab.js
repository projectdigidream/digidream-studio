//
// The two vocabularies, as the studio reads them, and what they let it check.
//
// GENERATED, NOT WRITTEN. maps/scripts/trigger_vocab.json and mob_vocab.json
// are emitted from the normative Lua tables (tools/vocabjson, docs/TRIGGERS.md
// "Reading it from something that is not Lua"). Nothing in this file knows what
// a door is; every card the studio draws and every check it makes comes from
// those two files at run time, so a new action in the vocabulary is a new card
// with no studio release.
//
// WHAT THIS CHECKS IS WHAT THE RUNTIME CHECKS, said earlier. The server refuses
// a whole trigger table for one bad argument; this says which argument while
// the author still has the card open. It is not the oracle -- the runtime is,
// and the tests hold this to it -- so it stays conservative: it flags what it
// can prove wrong and lets the runtime rule on the rest.
//

const isInt = (v) => Number.isInteger(v)
const isFx = (v) => isInt(v) || (typeof v === 'string' && /^-?\d+(\.\d{1,9})?$/.test(v)) ||
                    (Array.isArray(v) && v.length === 2 && v.every(isInt) && v[1] !== 0)

/** Geometry references the studio writes in place of indices. */
export const isRef = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
                            ('edge' in v || 'edgeTwin' in v || 'sector' in v || 'trigger' in v)

// Argument checks by vocabulary type. `ctx` knows the document / module so
// references can be resolved.
const TYPES = {
  int: (v) => isInt(v),
  fx: (v) => isFx(v),
  string: (v) => typeof v === 'string',
  bool: (v) => typeof v === 'boolean',
  value: (v) => typeof v === 'string' || typeof v === 'boolean' || isInt(v),
  enum: (v, a) => a.values.includes(v),
  sector: (v, a, ctx) => v === 'event' || v === 'behind' || isInt(v) ||
                         (isRef(v) && 'sector' in v && ctx.hasSector(v.sector)),
  trigger: (v, a, ctx) => (typeof v === 'string' && ctx.hasTriggerName(v)) ||
                          (isRef(v) && 'trigger' in v && ctx.hasTrigger(v.trigger)),
  function: () => false,             // never written by the studio
  // mob vocabulary
  state: (v, a, ctx) => typeof v === 'string' && ctx.hasState(v),
  var: (v, a, ctx) => typeof v === 'string' && ctx.hasVar(v),
  missile: (v, a, ctx) => typeof v === 'string' && ctx.hasMissile(v),
  mob: (v, a, ctx) => typeof v === 'string' && ctx.hasMob(v),
  // A catalogue record. The runtime leaves whether it exists to the editor,
  // "because the editor is the one holding the catalogue" (mobs.lua); without
  // one to hand, any name passes and the server decides at load.
  prop: (v, a, ctx) => typeof v === 'string' && (ctx.hasProp ? ctx.hasProp(v) : true),
  table: (v) => v !== null && typeof v === 'object',
  actions: (v) => Array.isArray(v)
}

/**
 * Check `obj`'s fields against an argument spec list. `ignore` names keys the
 * caller owns (the discriminator, negate, guards the emitter fills in).
 */
function checkArgs (args, obj, where, problems, ctx, ignore = []) {
  const groups = new Map()
  for (const a of args) {
    const v = obj[a.name]
    if (a.one_of) {
      if (!groups.has(a.one_of)) groups.set(a.one_of, [])
      if (v !== undefined) groups.get(a.one_of).push(a.name)
      if (v === undefined) continue
    } else if (v === undefined) {
      if (!a.optional) problems.push(`${where}: needs \`${a.name}\``)
      continue
    }
    const ok = TYPES[a.type]
    if (!ok) continue                       // a type this file does not know: the runtime decides
    if (!ok(v, a, ctx)) problems.push(`${where}: \`${a.name}\` should be ${describe(a)}, got ${JSON.stringify(v)}`)
  }
  for (const [g, present] of groups) {
    const members = args.filter((a) => a.one_of === g).map((a) => a.name)
    if (present.length !== 1) problems.push(`${where}: needs exactly one of ${members.join(', ')} (got ${present.length})`)
  }
  const known = new Set([...args.map((a) => a.name), ...ignore])
  for (const k of Object.keys(obj)) if (!known.has(k)) problems.push(`${where}: unknown field \`${k}\``)
}

function describe (a) {
  switch (a.type) {
    case 'int': return 'a whole number'
    case 'fx': return 'a whole number, an exact decimal string or [numerator, denominator]'
    case 'enum': return `one of ${a.values.join(', ')}`
    case 'sector': return 'a sector, "event" or "behind"'
    case 'trigger': return 'the name of a trigger'
    case 'state': return 'the name of a state'
    case 'var': return 'a declared var'
    case 'missile': return 'the name of a missile'
    case 'mob': return 'the name of a mob'
    case 'prop': return 'the name of a prop in the catalogue'
    case 'bool': return 'true or false'
    default: return `a ${a.type}`
  }
}

export class Vocab {
  /** @param trigger  parsed trigger_vocab.json  @param mob  parsed mob_vocab.json */
  constructor (trigger, mob) {
    this.trigger = trigger
    this.mob = mob
    this.events = new Map(trigger.events.map((e) => [e.name, e]))
    this.conditions = new Map(trigger.conditions.map((c) => [c.name, c]))
    this.actions = new Map(trigger.actions.map((a) => [a.name, a]))
    this.mobConditions = new Map(mob.conditions.map((c) => [c.name, c]))
    this.mobActions = new Map(mob.actions.map((a) => [a.name, a]))
  }

  /** Problems with a document's triggers, as sentences naming the trigger. Empty is clean. */
  validateTriggers (doc) {
    const problems = []
    const names = new Map()
    const ids = new Set(doc.triggers.map((t) => t.id))
    const edgeIds = new Set()
    for (const sid of doc.order) for (const v of doc.sectors[sid].verts) edgeIds.add(v.edge.id)
    const ctx = {
      hasSector: (id) => id in doc.sectors,
      hasTrigger: (id) => ids.has(id),
      hasTriggerName: (n) => doc.triggers.some((t) => t.name === n)
    }
    for (const t of doc.triggers) {
      const where = `trigger "${t.name || t.id}"`
      if (!t.name) problems.push(`${where}: needs a name`)
      else if (names.has(t.name)) problems.push(`${where}: the name is already used`)
      names.set(t.name, t)
      if (t.event !== null && t.event !== undefined && !this.events.has(t.event)) {
        problems.push(`${where}: unknown event "${t.event}"`)
      }
      if (!t.actions?.length) problems.push(`${where}: needs at least one action`)
      for (const [i, c] of (t.conditions ?? []).entries()) {
        const spec = this.conditions.get(c.c)
        const cw = `${where}, condition ${i + 1}`
        if (!spec) { problems.push(`${cw}: unknown condition "${c.c}"`); continue }
        if (t.event && spec.events && !spec.events.includes(t.event)) {
          problems.push(`${cw}: "${c.c}" only makes sense on ${spec.events.join(', ')}, not ${t.event}`)
        }
        const obj = { ...c }
        // `side` on side_is is written as an edge reference; the emitter turns
        // it into the index and adds the guard. Neither is the author's to
        // type, so the reference is checked here and stands in for both.
        if (c.c === 'side_is') {
          if (!(isRef(c.side) && (('edge' in c.side && edgeIds.has(c.side.edge)) ||
                                   ('edgeTwin' in c.side && edgeIds.has(c.side.edgeTwin))))) {
            problems.push(`${cw}: \`side\` must point at an edge of the map`)
          }
          obj.side = 0; obj.expect_neighbour = 0
        }
        delete obj.expect_tag
        checkArgs(spec.args ?? [], obj, cw, problems, ctx, ['c', 'negate', 'expect_tag'])
      }
      for (const [i, a] of (t.actions ?? []).entries()) {
        const spec = this.actions.get(a.a)
        const aw = `${where}, action ${i + 1}`
        if (!spec) { problems.push(`${aw}: unknown action "${a.a}"`); continue }
        const obj = { ...a }
        delete obj.expect_tag
        checkArgs(spec.args ?? [], obj, aw, problems, ctx, ['a', 'expect_tag'])
      }
    }
    return problems
  }

  /**
   * Problems with a module's mobs and missiles: `{ missiles: {name: {...}},
   * mobs: {name: {...}} }`, the shape mobs.load{} takes.
   */
  /** @param props  the catalogue's prop names, when known; null lets any name through */
  validateMobs (mobsTable, { props = null } = {}) {
    const problems = []
    const mobs = mobsTable.mobs ?? {}
    const missiles = mobsTable.missiles ?? {}
    const hasProp = props ? (n) => props.includes(n) : null
    for (const [name, m] of Object.entries(missiles)) {
      const where = `missile "${name}"`
      const ctx = { hasMissile: (n) => n in missiles, hasMob: (n) => n in mobs, hasVar: () => true, hasState: () => true, hasProp }
      checkArgs(this.mob.missile_fields, m, where, problems, ctx)
      for (const list of ['on_hit', 'on_expire']) {
        for (const [i, act] of (m[list] ?? []).entries()) this.#checkMobAction(act, `${where}, ${list} ${i + 1}`, problems, ctx)
      }
    }
    for (const [name, m] of Object.entries(mobs)) {
      const where = `mob "${name}"`
      const states = m.states ?? {}
      const ctx = {
        hasMissile: (n) => n in missiles, hasMob: (n) => n in mobs,
        hasVar: (n) => n in (m.vars ?? {}), hasState: (n) => n in states, hasProp
      }
      checkArgs(this.mob.mob_fields, m, where, problems, ctx)
      if (m.initial === undefined) problems.push(`${where}: needs \`initial\``)
      if (m.corpse && !('death' in states)) problems.push(`${where}: has corpse = true and no death state`)
      for (const [sname, s] of Object.entries(states)) {
        const sw = `${where}, state "${sname}"`
        checkArgs(this.mob.state_fields, s, sw, problems, ctx)
        if (s.ticks !== undefined && s.next === undefined) problems.push(`${sw}: has \`ticks\` and so needs \`next\``)
        // The vocabulary says so and the runtime does not check: a jitter with
        // no duration to lengthen is a setting that does nothing.
        if (s.ticks_jitter !== undefined && s.ticks === undefined) problems.push(`${sw}: has \`ticks_jitter\` and so needs \`ticks\``)
        for (const [i, tr] of (s.transitions ?? []).entries()) {
          const tw = `${sw}, transition ${i + 1}`
          if (typeof tr.to !== 'string' || !(tr.to in states)) problems.push(`${tw}: \`to\` must name a state`)
          for (const [j, c] of (tr.when ?? []).entries()) {
            const spec = this.mobConditions.get(c.cond)
            const cw = `${tw}, condition ${j + 1}`
            if (!spec) { problems.push(`${cw}: unknown condition "${c.cond}"`); continue }
            checkArgs(spec.args ?? [], c, cw, problems, ctx, ['cond', 'negate'])
          }
        }
        for (const [i, step] of (s.sequence ?? []).entries()) {
          const pw = `${sw}, step ${i + 1}`
          if (!isInt(step.at)) problems.push(`${pw}: needs \`at\`, a whole number of ticks`)
          this.#checkMobAction(step, pw, problems, ctx, ['at'])
        }
      }
    }
    return problems
  }

  #checkMobAction (act, where, problems, ctx, extra = []) {
    const spec = this.mobActions.get(act.action)
    if (!spec) { problems.push(`${where}: unknown action "${act.action}"`); return }
    checkArgs(spec.args ?? [], act, where, problems, ctx, ['action', ...extra])
  }
}

/** Load both vocabularies from a base URL (the studio's runtime directory). */
export async function loadVocab (baseUrl = '/studio/runtime') {
  const [t, m] = await Promise.all([
    fetch(`${baseUrl}/trigger_vocab.json`).then((r) => r.json()),
    fetch(`${baseUrl}/mob_vocab.json`).then((r) => r.json())
  ])
  return new Vocab(t, m)
}
