//
// THE PLAYER'S MOVEMENT STATES (docs/MOVEMENT.md): the module's own ways of
// moving -- swimming, sliding, gliding, a stun -- the ways between them, the
// meters a body carries (breath, stamina) and the layered moves (a dash, a
// jump pad), written as module.txt `movestate`, `transition`, `meter` and
// `move` lines. `default` is the engine's own walking, jumping and climbing,
// and is never written.
//
// The truth about what is right is the engine's: the lines go through the
// core's own parser (WasmWorld.setMoveDefs, the server's), and its reason --
// "line 4: ..." -- is mapped back to the card that wrote line 4.
//
// In the module document:
//
//   movement: {
//     states:      [{ name, group, speed?, accel?, friction?, gravity?, buoyancy?, jump?, anim?, flags: [] }],
//     meters:      [{ name, max, start?, rate?, rules: [{ in, rate, when: [cond] }] }],
//     moves:       [{ name, mix: 'set'|'add', way, speed, for, priority?, cost?: { meter, n }, when: [cond] }],
//     transitions: [{ from, to, when: [cond], do?: action }]
//   }
//
//   cond:   { k: 'grounded'|'airborne'|'rising'|'falling'|'asked'|'touching' }
//         | { k: 'pressed'|'held'|'released', button } | { k: 'speed', cmp: 'above'|'below', v }
//         | { k: 'after', v } | { k: 'floor', tag } | { k: 'depth', level, below? }
//         | { k: 'meter', meter, how: 'empty'|'full'|'below'|'above', v? }
//   action: { k: 'jump'|'stop' } | { k: 'impulse', way: 'up'|'facing'|'back', v }
//         | { k: 'meter', meter, how: 'set'|'add', v } | { k: 'move', move }
//
import { el, row, select, button, toggle, chips, muted, withIcon, NUM_KEYS } from './ui.js'

// The core's limits (core/include/dnp/physics/movedefs.hpp).
export const LIMITS = { states: 8, transitions: 32, conditions: 4, meters: 8, rules: 16, moves: 8, name: 15 }

export const GROUPS = [
  ['floor', 'floor: the stick moves you along the ground (wading, sliding, ice, mud)'],
  ['air', 'air: as in the air (gliding, a slow fall)'],
  ['liquid', 'liquid: in 3D, jump and crouch go up and down (swimming)'],
  ['none', 'none: the stick does nothing (stunned, frozen, a cutscene)']
]
export const NUMBERS = [
  ['speed', 'how fast the stick takes it'],
  ['accel', 'how quickly it gets up to speed'],
  ['friction', 'how quickly it slows when you let go (in water, the drag)'],
  ['gravity', "a share of the world's gravity: 1 as on foot, 0.3 in water"],
  ['buoyancy', 'the lift in water, while it is at the waist or above'],
  ['jump', 'its jump, for a transition that says "do jump"']
]
export const FLAGS = ['no_jump', 'no_dash', 'no_attack', 'no_use', 'no_crouch', 'weapon_hidden', 'counts_as_ground', 'invulnerable']
export const BUTTONS = ['jump', 'crouch', 'up', 'dash', 'climb', 'hover', 'flight', 'grapple', 'use', 'attack']
export const CONDITIONS = [
  ['grounded', 'on the ground'], ['airborne', 'in the air'], ['rising', 'going up'], ['falling', 'falling'],
  ['pressed', 'a button pressed'], ['held', 'a button held'], ['released', 'a button let go'],
  ['speed', 'its speed'], ['after', 'after a time in the state'], ['floor', 'standing on a floor tagged'],
  ['depth', 'how deep in water'], ['meter', 'a meter'], ['touching', 'touching a wall'], ['asked', 'a script asked for it']
]
export const ACTIONS = [['', 'nothing'], ['jump', 'jump (the state\'s jump)'], ['stop', 'stop'], ['impulse', 'a push'], ['meter', 'change a meter'], ['move', 'start a move']]

const num = (v) => String(Number(Number(v).toFixed(4)))
/** A name the parser takes: 1 to 15 of a-z, 0-9, _ (and not default or any). */
export const cleanName = (raw) => String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, LIMITS.name)

export function movementOf (module) {
  const m = (module.movement ??= {})
  m.states ??= []; m.meters ??= []; m.moves ??= []; m.transitions ??= []
  return m
}

const hasAny = (m) => !!m && ['states', 'meters', 'moves', 'transitions'].some((k) => m[k]?.length)

// --- the lines ---------------------------------------------------------------------------

export function condText (c) {
  switch (c.k) {
    case 'pressed': case 'held': case 'released': return `${c.k} ${c.button ?? 'jump'}`
    case 'speed': return `speed ${c.cmp ?? 'above'} ${num(c.v ?? 0)}`
    case 'after': return `after ${num(c.v ?? 0)}`
    case 'floor': return `floor tag ${Math.round(c.tag ?? 0)}`
    case 'depth': return c.below ? `depth below ${c.level ?? 'waist'}` : `depth ${c.level ?? 'feet'}`
    case 'meter': return ['below', 'above'].includes(c.how) ? `meter ${c.meter} ${c.how} ${num(c.v ?? 0)}` : `meter ${c.meter} ${c.how ?? 'empty'}`
    case 'touching': return 'touching wall'
    default: return c.k
  }
}

export function actionText (a) {
  if (!a?.k) return ''
  if (a.k === 'impulse') return `impulse ${a.way ?? 'up'} ${num(a.v ?? 0)}`
  if (a.k === 'meter') return `meter ${a.meter} ${a.how ?? 'add'} ${num(a.v ?? 0)}`
  if (a.k === 'move') return `move ${a.move}`
  return a.k
}

const whenText = (when) => (when?.length ? ` when ${when.map(condText).join(' ')}` : '')

/**
 * The module.txt lines, and for each the card that wrote it ({ kind, i, j? }),
 * so the parser's "line N" names a card. Empty for a module with none.
 */
export function movementLines (module) {
  const m = module?.movement
  const lines = []; const owners = []
  if (!hasAny(m)) return { lines, owners }
  const push = (line, owner) => { lines.push(line); owners.push(owner) }
  ;(m.states ?? []).forEach((s, i) => {
    const w = [`movestate ${s.name} group ${s.group ?? 'floor'}`]
    for (const [k] of NUMBERS) if (s[k] !== undefined && s[k] !== null) w.push(`${k} ${num(s[k])}`)
    if (s.anim) w.push(`anim ${s.anim}`)
    if (s.flags?.length) w.push(`flags ${s.flags.join(' ')}`)
    push(w.join(' '), { kind: 'state', i })
  })
  ;(m.meters ?? []).forEach((t, i) => {
    push(`meter ${t.name} max ${num(t.max ?? 10)}${t.start !== undefined ? ` start ${num(t.start)}` : ''}${t.rate ? ` rate ${num(t.rate)}` : ''}`, { kind: 'meter', i })
  })
  ;(m.meters ?? []).forEach((t, i) => (t.rules ?? []).forEach((r, j) => {
    push(`meter ${t.name} in ${r.in ?? 'any'} rate ${num(r.rate ?? 0)}${whenText(r.when)}`, { kind: 'rule', i, j })
  }))
  ;(m.moves ?? []).forEach((v, i) => {
    const w = [`move ${v.name} ${v.mix ?? 'set'} ${v.way ?? 'facing'} ${num(v.speed ?? 0)} for ${num(v.for ?? 0.2)}`]
    if (v.priority) w.push(`priority ${Math.round(v.priority)}`)
    if (v.cost?.meter) w.push(`cost ${v.cost.meter} ${num(v.cost.n ?? 0)}`)
    push(w.join(' ') + whenText(v.when), { kind: 'move', i })
  })
  ;(m.transitions ?? []).forEach((t, i) => {
    const act = actionText(t.do)
    push(`transition ${t.from ?? 'any'} -> ${t.to ?? 'default'}${whenText(t.when) || ' when'}${act ? ` do ${act}` : ''}`, { kind: 'transition', i })
  })
  return { lines, owners }
}

/**
 * What the engine says of the lines: null when it reads them, else
 * { why, owner } -- the parser's reason and the card that wrote the line.
 * `world` is a WasmWorld (core.createWorld()); its definitions are replaced.
 */
export function checkMovement (world, module) {
  const { lines, owners } = movementLines(module)
  if (!lines.length || !world?.setMoveDefs) return null
  const why = world.setMoveDefs(lines.join('\n'))
  if (!why) return null
  const at = Number(/^line (\d+)/.exec(why)?.[1] ?? 0)
  return { why: why.replace(/^line \d+: /, ''), owner: owners[at - 1] ?? null, line: lines[at - 1] ?? null }
}

/** Where a card is, in words: "the transition swim -> wade". */
export function ownerText (module, o) {
  const m = movementOf(module)
  if (!o) return 'the movement'
  if (o.kind === 'state') return `the state ${m.states[o.i]?.name}`
  if (o.kind === 'meter') return `the meter ${m.meters[o.i]?.name}`
  if (o.kind === 'rule') return `a rate rule of the meter ${m.meters[o.i]?.name}`
  if (o.kind === 'move') return `the move ${m.moves[o.i]?.name}`
  const t = m.transitions[o.i]
  return `the way ${t?.from} → ${t?.to}`
}

// --- names -------------------------------------------------------------------------------

/** Every condition and action list in the movement, to walk for renames. */
function each (m, fn) {
  for (const t of m.transitions ?? []) { for (const c of t.when ?? []) fn({ cond: c }); if (t.do) fn({ action: t.do }) }
  for (const t of m.meters ?? []) for (const r of t.rules ?? []) for (const c of r.when ?? []) fn({ cond: c })
  for (const v of m.moves ?? []) { for (const c of v.when ?? []) fn({ cond: c }); if (v.cost) fn({ cost: v.cost }) }
}

/** Rename a state, a meter or a move, and every line that names it. Returns the new name, or null when refused. */
export function renameThing (module, kind, from, raw) {
  const m = movementOf(module)
  const to = cleanName(raw)
  const list = { state: m.states, meter: m.meters, move: m.moves }[kind]
  if (!to || to === from) return null
  if (kind === 'state' && (to === 'default' || to === 'any')) return null
  if (list.some((x) => x.name === to)) return null
  const it = list.find((x) => x.name === from)
  if (!it) return null
  it.name = to
  if (kind === 'state') {
    for (const t of m.transitions) { if (t.from === from) t.from = to; if (t.to === from) t.to = to }
    for (const t of m.meters) for (const r of t.rules ?? []) if (r.in === from) r.in = to
  }
  each(m, ({ cond, action, cost }) => {
    if (kind === 'meter' && cond?.k === 'meter' && cond.meter === from) cond.meter = to
    if (kind === 'meter' && action?.k === 'meter' && action.meter === from) action.meter = to
    if (kind === 'meter' && cost?.meter === from) cost.meter = to
    if (kind === 'move' && action?.k === 'move' && action.move === from) action.move = to
  })
  return to
}

const freeName = (list, base) => { for (let n = 1; ; n++) { const name = n === 1 ? base : `${base}${n}`.slice(0, LIMITS.name); if (!list.some((x) => x.name === name)) return name } }

export const stateNames = (module) => (module?.movement?.states ?? []).map((s) => s.name)
export const meterNames = (module) => (module?.movement?.meters ?? []).map((s) => s.name)
export const moveNames = (module) => (module?.movement?.moves ?? []).map((s) => s.name)
/** The animation conditions the states add (an avatar can draw each: assets/props.txt `avatar ... when <anim>`). */
export const movementAnims = (module) => [...new Set((module?.movement?.states ?? []).map((s) => s.anim).filter(Boolean))]

// --- recipes -------------------------------------------------------------------------------
// Starting points from docs/MOVEMENT.md's worked examples. Added to what is
// there; a name the module already has is kept as it is.

export const RECIPES = {
  swimming: {
    label: 'swimming (wade, swim, breath)',
    about: 'Wading in the shallows, swimming once the water is at the waist, out onto a low edge or with a jump, and an air meter that drains with the head under. Needs effect areas made liquid (water) on the map.',
    states: [
      { name: 'wade', group: 'floor', speed: 5, jump: 6, anim: 'wade', flags: [] },
      { name: 'swim', group: 'liquid', speed: 5, accel: 20, friction: 3, gravity: 0.3, buoyancy: 8, jump: 7, anim: 'swim', flags: ['no_dash'] }
    ],
    meters: [{ name: 'air', max: 10, rate: 5, rules: [{ in: 'swim', rate: -2, when: [{ k: 'depth', level: 'eyes' }] }] }],
    transitions: [
      { from: 'default', to: 'wade', when: [{ k: 'depth', level: 'feet' }] },
      { from: 'any', to: 'swim', when: [{ k: 'depth', level: 'waist' }, { k: 'falling' }] },
      { from: 'swim', to: 'wade', when: [{ k: 'grounded' }, { k: 'depth', level: 'waist', below: true }] },
      { from: 'swim', to: 'wade', when: [{ k: 'pressed', button: 'jump' }, { k: 'depth', level: 'eyes', below: true }], do: { k: 'jump' } },
      { from: 'wade', to: 'default', when: [{ k: 'depth', level: 'none' }] }
    ]
  },
  slide: {
    label: 'slide (crouch at a run)',
    about: 'Crouch while running fast to slide; it slows to a stop, or jump out of it.',
    states: [{ name: 'slide', group: 'floor', speed: 14, accel: 1, friction: 0.3, anim: 'slide', flags: ['no_attack'] }],
    transitions: [
      { from: 'default', to: 'slide', when: [{ k: 'grounded' }, { k: 'pressed', button: 'crouch' }, { k: 'speed', cmp: 'above', v: 8 }] },
      { from: 'slide', to: 'default', when: [{ k: 'speed', cmp: 'below', v: 3 }] },
      { from: 'slide', to: 'default', when: [{ k: 'pressed', button: 'jump' }], do: { k: 'jump' } }
    ]
  },
  sprint: {
    label: 'sprint (stamina)',
    about: 'Hold DASH to sprint while there is stamina: 10 to start, 30 a second while it runs, back at 20 a second after. Turn the player\'s built-in dash off (Player → moves) if DASH should only sprint.',
    states: [{ name: 'sprint', group: 'floor', speed: 14, accel: 40, flags: [] }],
    meters: [{ name: 'stamina', max: 100, rate: 20, rules: [{ in: 'sprint', rate: -30, when: [] }] }],
    transitions: [
      { from: 'default', to: 'sprint', when: [{ k: 'held', button: 'dash' }, { k: 'meter', meter: 'stamina', how: 'above', v: 10 }], do: { k: 'meter', meter: 'stamina', how: 'add', v: -10 } },
      { from: 'sprint', to: 'default', when: [{ k: 'meter', meter: 'stamina', how: 'empty' }] },
      { from: 'sprint', to: 'default', when: [{ k: 'released', button: 'dash' }] }
    ]
  },
  dash: {
    label: 'dash (costs stamina)',
    about: 'USE dashes forward for a fifth of a second, for 20 stamina. It runs over whatever state the player is in.',
    meters: [{ name: 'stamina', max: 100, rate: 15, rules: [] }],
    moves: [{ name: 'dash', mix: 'set', way: 'facing', speed: 18, for: 0.2, cost: { meter: 'stamina', n: 20 }, when: [{ k: 'pressed', button: 'use' }] }]
  },
  pad: {
    label: 'jump pad (floor tag 7)',
    about: 'Stepping on a floor tagged 7 throws the player up. Give a room\'s floor tag 7 on the map.',
    moves: [{ name: 'pad', mix: 'set', way: 'up', speed: 9, for: 0.1, when: [{ k: 'grounded' }, { k: 'floor', tag: 7 }] }]
  },
  glide: {
    label: 'glide (hold jump while falling)',
    about: 'Hold JUMP while falling to glide down slowly; let go or land to stop.',
    states: [{ name: 'glide', group: 'air', speed: 8, gravity: 0.2, anim: 'glide', flags: [] }],
    transitions: [
      { from: 'default', to: 'glide', when: [{ k: 'falling' }, { k: 'held', button: 'jump' }] },
      { from: 'glide', to: 'default', when: [{ k: 'grounded' }] },
      { from: 'glide', to: 'default', when: [{ k: 'released', button: 'jump' }] }
    ]
  },
  stun: {
    label: 'stunned (a script asks)',
    about: 'A script or a graph asks for the state ("ask movement state" stunned), and it lasts half a second.',
    states: [{ name: 'stunned', group: 'none', flags: ['no_attack', 'no_use'] }],
    transitions: [
      { from: 'default', to: 'stunned', when: [{ k: 'asked' }] },
      { from: 'stunned', to: 'default', when: [{ k: 'after', v: 0.5 }] }
    ]
  }
}

/** Add a recipe's states, meters, moves and ways; what the module has by name already is left alone. */
export function addRecipe (module, id) {
  const r = RECIPES[id]
  const m = movementOf(module)
  const copy = (x) => JSON.parse(JSON.stringify(x))
  for (const s of r.states ?? []) if (!m.states.some((x) => x.name === s.name)) m.states.push(copy(s))
  for (const t of r.meters ?? []) if (!m.meters.some((x) => x.name === t.name)) m.meters.push(copy(t))
  for (const v of r.moves ?? []) if (!m.moves.some((x) => x.name === v.name)) m.moves.push(copy(v))
  const have = new Set(m.transitions.map((t) => JSON.stringify(t)))
  for (const t of r.transitions ?? []) if (!have.has(JSON.stringify(t))) m.transitions.push(copy(t))
}

// --- the form -------------------------------------------------------------------------------

/** A number box that may be left empty (the engine's own then): blank is undefined. */
export function optNum (label, value, placeholder, onChange, { lo = -1e6, hi = 1e6 } = {}) {
  const input = el('input', { ...NUM_KEYS, value: value ?? '', placeholder, 'aria-label': label })
  input.addEventListener('change', () => {
    const t = input.value.trim().replace(',', '.')
    if (t === '') return onChange(undefined)
    const v = Number(t)
    if (Number.isFinite(v)) onChange(Math.min(hi, Math.max(lo, v)))
    else input.value = value ?? ''
  })
  return row(label, input)
}

function nameField (label, value, onRename) {
  const input = el('input', { type: 'text', value, 'aria-label': label, maxlength: LIMITS.name })
  input.addEventListener('change', () => { if (!onRename(input.value)) input.value = value })
  return row(label, input)
}

/** The options, with the current value kept when the list lacks it -- a state deleted shows by name, not as the first choice. */
const keep = (opts, v, say = (x) => `${x} (not declared)`) => (v && !opts.some((o) => (Array.isArray(o) ? o[0] : o) === v) ? [...opts, [v, say(v)]] : opts)

const move = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]] }

/** A list of conditions, each a kind and its few words; up to four. */
function condRows (S, conds, changed, { noAsked = false } = {}) {
  const meters = meterNames(S.module)
  const kinds = CONDITIONS.filter(([k]) => !(noAsked && k === 'asked'))
  const rows = conds.map((c, i) => {
    const parts = [select('', c.k, kinds, (v) => { conds[i] = { k: v, ...(v === 'meter' ? { meter: meters[0] ?? '', how: 'empty' } : {}) }; changed() })]
    if (['pressed', 'held', 'released'].includes(c.k)) parts.push(select('', c.button ?? 'jump', BUTTONS, (v) => { c.button = v; changed() }))
    if (c.k === 'speed') parts.push(select('', c.cmp ?? 'above', ['above', 'below'], (v) => { c.cmp = v; changed() }), optNum('', c.v ?? 0, 'm/s', (v) => { c.v = v ?? 0; changed() }, { lo: 0 }))
    if (c.k === 'after') parts.push(optNum('', c.v ?? 0, 's', (v) => { c.v = v ?? 0; changed() }, { lo: 0, hi: 1000 }))
    if (c.k === 'floor') parts.push(optNum('', c.tag ?? 0, 'tag', (v) => { c.tag = Math.round(v ?? 0); changed() }, { lo: 0, hi: 65535 }))
    if (c.k === 'depth') {
      parts.push(select('', c.below ? 'below' : 'at', [['at', 'reaches'], ['below', 'below']], (v) => { c.below = v === 'below'; if (c.below && (c.level ?? 'none') === 'none') c.level = 'waist'; changed() }))
      parts.push(select('', c.level ?? 'feet', c.below ? ['feet', 'waist', 'eyes'] : [['none', 'out of it'], 'feet', 'waist', 'eyes'], (v) => { c.level = v; changed() }))
    }
    if (c.k === 'meter') {
      parts.push(select('', c.meter ?? '', keep(meters.length ? meters : [['', '(no meter yet)']], c.meter), (v) => { c.meter = v; changed() }))
      parts.push(select('', c.how ?? 'empty', ['empty', 'full', 'below', 'above'], (v) => { c.how = v; changed() }))
      if (['below', 'above'].includes(c.how)) parts.push(optNum('', c.v ?? 0, 'amount', (v) => { c.v = v ?? 0; changed() }))
    }
    parts.push(button(withIcon('action.delete', ''), () => { conds.splice(i, 1); changed() }, 'st-danger'))
    return el('div', { class: 'st-row st-mv-cond' }, parts.map(unrow))
  })
  if (conds.length < LIMITS.conditions) rows.push(button(withIcon('action.add', conds.length ? 'and…' : 'when…'), () => { conds.push({ k: 'grounded' }); changed() }))
  return rows
}

// A row's control without its label, for a line of several in one row.
const unrow = (r) => (r.classList?.contains('st-row') && r.firstChild?.tagName === 'LABEL' && !r.firstChild.textContent ? r.lastChild : r)

function actionRows (S, t, changed) {
  const a = t.do ?? {}
  const parts = [select('then', a.k ?? '', ACTIONS, (v) => { if (!v) delete t.do; else t.do = { k: v, ...(v === 'meter' ? { meter: meterNames(S.module)[0] ?? '', how: 'add', v: 0 } : v === 'move' ? { move: moveNames(S.module)[0] ?? '' } : v === 'impulse' ? { way: 'up', v: 6 } : {}) }; changed() })]
  if (a.k === 'impulse') parts.push(select('', a.way ?? 'up', ['up', 'facing', 'back'], (v) => { a.way = v; changed() }), optNum('', a.v ?? 0, 'speed', (v) => { a.v = v ?? 0; changed() }))
  if (a.k === 'meter') parts.push(select('', a.meter ?? '', keep(meterNames(S.module), a.meter), (v) => { a.meter = v; changed() }), select('', a.how ?? 'add', ['add', 'set'], (v) => { a.how = v; changed() }), optNum('', a.v ?? 0, 'amount', (v) => { a.v = v ?? 0; changed() }))
  if (a.k === 'move') parts.push(select('', a.move ?? '', keep(moveNames(S.module), a.move), (v) => { a.move = v; changed() }))
  return el('div', { class: 'st-row st-mv-cond' }, parts.map((p, i) => (i ? unrow(p) : p)))
}

const head = (ico, t) => el('div', { class: 'st-section-head' }, withIcon(ico, t))
const box = (owner, bad, kids) => el('div', { class: 'st-card', 'data-mv': `${owner.kind}:${owner.i}`, ...(bad ? { 'data-bad': '1', style: 'outline:2px solid var(--dnp-color-error);' } : {}) }, kids)
const isBad = (verdict, kind, i) => verdict?.owner && (verdict.owner.kind === kind || (kind === 'meter' && verdict.owner.kind === 'rule')) && verdict.owner.i === i

/** The Player → movement tab. `ctx.changed()` saves and draws the tab again. */
export function movementRows (S, ctx) {
  const module = S.module
  const m = movementOf(module)
  const changed = () => ctx.changed()
  const verdict = S.checkMovement?.() ?? null
  const states = stateNames(module)
  const rows = [
    muted('A player is always in one movement state. "default" is the engine\'s own: walking, jumping, climbing, ledges. Add states with other numbers -- swimming, sliding, gliding, a stun -- the ways between them, meters a body carries (breath, stamina) and moves that push for a moment (a dash, a jump pad). They are written into module.txt and run on the server and the player\'s own device alike.'),
    verdict
      ? el('div', { class: 'st-danger', 'data-mv-verdict': 'bad', style: 'white-space:pre-wrap' , text: `The engine refuses ${ownerText(module, verdict.owner)}: ${verdict.why}.` })
      : hasAny(m) ? el('div', { class: 'st-muted', 'data-mv-verdict': 'ok', text: 'The engine reads all of it.' }) : null,
    head('action.add', 'start from'),
    chips(Object.entries(RECIPES).map(([id, r]) => ({ id, label: r.label })), (it) => { addRecipe(module, it.id); S.status?.(RECIPES[it.id].about, 'ok'); changed() }, { search: 99 })
  ]

  // STATES
  rows.push(head('workshop.state', `states (${m.states.length} of ${LIMITS.states})`))
  m.states.forEach((s, i) => {
    rows.push(box({ kind: 'state', i }, isBad(verdict, 'state', i), [
      nameField('name', s.name, (v) => { const n = renameThing(module, 'state', s.name, v); if (n) changed(); return n }),
      select('group', s.group ?? 'floor', GROUPS, (v) => { s.group = v; changed() }),
      ...NUMBERS.map(([k, about]) => optNum(k, s[k], "the player's", (v) => { if (v === undefined) delete s[k]; else s[k] = v; changed() })),
      muted(NUMBERS.map(([k, about]) => `${k}: ${about}`).join('; ') + '. Empty is the player\'s own.'),
      nameField('animation', s.anim ?? '', (v) => { const n = cleanName(v); if (n) s.anim = n; else delete s.anim; changed(); return true }),
      muted(s.anim ? `An avatar draws it by naming "${s.anim}" under Player → skin.` : 'A name the avatar can draw while in this state (Player → skin).'),
      row('flags', chips(FLAGS.map((f) => ({ id: f, label: f, on: s.flags?.includes(f) })), (it) => { s.flags ??= []; if (s.flags.includes(it.id)) s.flags = s.flags.filter((f) => f !== it.id); else s.flags.push(it.id); changed() }, { search: 99 })),
      el('div', { class: 'st-row' }, [button(withIcon('action.delete', 'delete'), () => { m.states.splice(i, 1); changed() }, 'st-danger')])
    ]))
  })
  if (m.states.length < LIMITS.states) rows.push(button(withIcon('action.add', 'a state'), () => { m.states.push({ name: freeName(m.states, 'state'), group: 'floor', flags: [] }); changed() }))

  // WAYS IN AND OUT
  rows.push(head('action.next', `ways between them (${m.transitions.length} of ${LIMITS.transitions})`))
  rows.push(muted('Each goes from a state (or any) to another when all its conditions hold. A state\'s own are tried before any\'s, top to bottom, and the first that holds wins.'))
  m.transitions.forEach((t, i) => {
    t.when ??= []
    rows.push(box({ kind: 'transition', i }, isBad(verdict, 'transition', i), [
      el('div', { class: 'st-row st-mv-cond' }, [
        unrow(select('', t.from ?? 'any', keep([['any', 'from any'], ['default', 'from default'], ...states.map((n) => [n, `from ${n}`])], t.from, (x) => `from ${x} (not declared)`), (v) => { t.from = v; changed() })),
        unrow(select('', t.to ?? 'default', keep([['default', 'to default'], ...states.map((n) => [n, `to ${n}`])], t.to, (x) => `to ${x} (not declared)`), (v) => { t.to = v; changed() }))
      ]),
      muted('when'),
      ...condRows(S, t.when, changed),
      actionRows(S, t, changed),
      el('div', { class: 'st-row' }, [
        button(withIcon('action.up', ''), () => { move(m.transitions, i, -1); changed() }),
        button(withIcon('action.down', ''), () => { move(m.transitions, i, 1); changed() }),
        button(withIcon('action.delete', 'delete'), () => { m.transitions.splice(i, 1); changed() }, 'st-danger')
      ])
    ]))
  })
  if (m.transitions.length < LIMITS.transitions) rows.push(button(withIcon('action.add', 'a way'), () => { m.transitions.push({ from: 'default', to: states[0] ?? 'default', when: [{ k: 'grounded' }] }); changed() }))

  // METERS
  const ruleCount = m.meters.reduce((n, t) => n + (t.rules?.length ?? 0), 0)
  rows.push(head('workshop.health', `meters (${m.meters.length} of ${LIMITS.meters})`))
  rows.push(muted('A number every body carries, from 0 to its max: breath, stamina, heat. It fills or drains at its rate a second (minus drains); a state can have its own rate. On the HUD as meter.<name> and meter.<name>_max; in graphs, "when meter empty" and "set meter".'))
  m.meters.forEach((t, i) => {
    t.rules ??= []
    rows.push(box({ kind: 'meter', i }, isBad(verdict, 'meter', i), [
      nameField('name', t.name, (v) => { const n = renameThing(module, 'meter', t.name, v); if (n) changed(); return n }),
      optNum('max', t.max ?? 10, '10', (v) => { t.max = v ?? 10; changed() }, { lo: 0.01 }),
      optNum('start', t.start, 'its max', (v) => { if (v === undefined) delete t.start; else t.start = v; changed() }, { lo: 0 }),
      optNum('rate', t.rate, '0', (v) => { if (!v) delete t.rate; else t.rate = v; changed() }),
      ...t.rules.flatMap((r, j) => [
        el('div', { class: 'st-row st-mv-cond' }, [
          unrow(select('', r.in ?? 'any', keep([['any', 'in any state'], ['default', 'in default'], ...states.map((n) => [n, `in ${n}`])], r.in, (x) => `in ${x} (not declared)`), (v) => { r.in = v; changed() })),
          unrow(optNum('', r.rate ?? 0, 'rate', (v) => { r.rate = v ?? 0; changed() })),
          button(withIcon('action.delete', ''), () => { t.rules.splice(j, 1); changed() }, 'st-danger')
        ]),
        ...((r.when ??= []).length ? [muted('when')] : []),
        ...condRows(S, r.when, changed, { noAsked: true })
      ]),
      ruleCount < LIMITS.rules ? button(withIcon('action.add', 'its own rate in a state'), () => { t.rules.push({ in: states[0] ?? 'any', rate: -1, when: [] }); changed() }) : null,
      el('div', { class: 'st-row' }, [button(withIcon('action.delete', 'delete'), () => { m.meters.splice(i, 1); changed() }, 'st-danger')])
    ].filter(Boolean)))
  })
  if (m.meters.length < LIMITS.meters) rows.push(button(withIcon('action.add', 'a meter'), () => { m.meters.push({ name: freeName(m.meters, 'meter'), max: 10, rules: [] }); changed() }))

  // LAYERED MOVES
  rows.push(head('workshop.moves', `moves (${m.moves.length} of ${LIMITS.moves})`))
  rows.push(muted('A push that lasts a moment, over whatever state runs: "set" holds the speed for its time (a dash), "add" pushes once and keeps the brakes off (a boost). It starts by itself when its conditions hold, from a way\'s "start a move", or from a graph. A new one on a busy axis replaces the running one only at a priority no lower.'))
  m.moves.forEach((v, i) => {
    v.when ??= []
    rows.push(box({ kind: 'move', i }, isBad(verdict, 'move', i), [
      nameField('name', v.name, (x) => { const n = renameThing(module, 'move', v.name, x); if (n) changed(); return n }),
      el('div', { class: 'st-row st-mv-cond' }, [
        unrow(select('', v.mix ?? 'set', [['set', 'holds'], ['add', 'adds']], (x) => { v.mix = x; changed() })),
        unrow(select('', v.way ?? 'facing', ['facing', 'back', 'up', 'down'], (x) => { v.way = x; changed() })),
        unrow(optNum('', v.speed ?? 0, 'speed', (x) => { v.speed = x ?? 0; changed() })),
        unrow(optNum('', v.for ?? 0.2, 'seconds', (x) => { v.for = x ?? 0; changed() }, { lo: 0, hi: 60 }))
      ]),
      optNum('priority', v.priority, '0', (x) => { if (!x) delete v.priority; else v.priority = Math.round(x); changed() }, { lo: 0, hi: 255 }),
      el('div', { class: 'st-row st-mv-cond' }, [
        unrow(select('costs', v.cost?.meter ?? '', keep([['', 'costs nothing'], ...meterNames(module).map((n) => [n, `costs ${n}`])], v.cost?.meter, (x) => `costs ${x} (not declared)`), (x) => { if (x) v.cost = { meter: x, n: v.cost?.n ?? 10 }; else delete v.cost; changed() })),
        v.cost ? unrow(optNum('', v.cost.n ?? 0, 'amount', (x) => { v.cost.n = x ?? 0; changed() }, { lo: 0 })) : null
      ].filter(Boolean)),
      muted(v.when.length ? 'starts by itself when' : 'starts only when a way or a graph starts it; or by itself when…'),
      ...condRows(S, v.when, changed, { noAsked: true }),
      el('div', { class: 'st-row' }, [button(withIcon('action.delete', 'delete'), () => { m.moves.splice(i, 1); changed() }, 'st-danger')])
    ]))
  })
  if (m.moves.length < LIMITS.moves) rows.push(button(withIcon('action.add', 'a move'), () => { m.moves.push({ name: freeName(m.moves, 'move'), mix: 'set', way: 'facing', speed: 12, for: 0.2, when: [] }); changed() }))

  // AS WRITTEN
  const { lines } = movementLines(module)
  if (lines.length) {
    rows.push(el('details', {}, [el('summary', { text: 'as written in module.txt' }), el('pre', { class: 'st-muted', style: 'white-space:pre-wrap;font-size:11px', text: lines.join('\n') })]))
  }
  return rows
}
