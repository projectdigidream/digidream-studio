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
//     moves:       [{ name, mix: 'set'|'add', way, speed, for, priority?, cost?: { meter, n }, off?, when: [cond] }],
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
import { el, row, button, chips, withIcon, icon, NUM_KEYS } from './ui.js'

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
// `off`: it starts switched off, for a script or a graph to switch on per player (MOVEMENT.md, "Switching them off")
export const FLAGS = ['off', 'no_jump', 'no_dash', 'no_attack', 'no_use', 'no_crouch', 'weapon_hidden', 'counts_as_ground', 'invulnerable']
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
    if (v.off) w.push('off')
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
// AN OVERVIEW FIRST: each state one line in plain words, with its ways out
// under it -- the order the engine tries them in -- then the meters and the
// moves, a line each. A line opens its editor in place, one at a time, so a
// phone shows the whole of a module's movement in a screen or two.

let open = null   // the card being edited: 'state:1', 'way:3', 'meter:0', 'move:0'

const CSS = `
.mv-line{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:6px 10px;box-sizing:border-box;text-align:left;
  border:1px solid var(--dnp-color-line-main);border-radius:10px;background:var(--dnp-color-bg-panel);color:var(--dnp-color-text-primary);font:inherit;cursor:pointer}
/* over the Workshop's button rule (one line, 40px): a summary wraps */
.wk-details .mv-line,.mv-line{height:auto;white-space:normal;font-size:14px;line-height:1.35}
.mv-line[data-open="1"]{border-color:var(--dnp-color-select)}
.mv-line[data-bad="1"]{border-color:var(--dnp-color-error)}
.mv-line .mv-name{flex:0 0 auto;font-weight:700}
.mv-line .mv-say{flex:1 1 auto;min-width:0;color:var(--dnp-color-text-secondary);font-size:13px}
.mv-line .mv-chev{flex:0 0 auto;color:var(--dnp-color-text-dim)}
.mv-ways{display:flex;flex-direction:column;gap:4px;margin-left:22px}
.mv-way .mv-name{font-weight:400}
.mv-head{display:flex;gap:6px;align-items:stretch}
.mv-head .mv-line{flex:1 1 auto}
.mv-head>button:not(.mv-line){flex:0 0 auto}
.mv-plain{cursor:default}
.mv-edit{margin:0 0 6px;padding:10px;border:1px solid var(--dnp-color-select);border-radius:10px;display:flex;flex-direction:column;gap:8px}
.mv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px 10px}
.mv-grid label,.mv-field{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--dnp-color-text-secondary)}
.mv-grid input,.mv-field input,.mv-field select{width:100%;box-sizing:border-box}
.mv-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.mv-row select{flex:1 1 110px;min-width:0}
.mv-row input{flex:0 1 84px;min-width:56px}
.mv-row>span{font-size:12px;color:var(--dnp-color-text-secondary)}
.mv-bad{color:var(--dnp-color-error);font-size:12px}
.mv-hint{color:var(--dnp-color-warn);font-size:12px}
.mv-small{font-size:12px;color:var(--dnp-color-text-secondary)}
`
function css () {
  if (typeof document === 'undefined' || document.getElementById('mv-css')) return
  document.head.appendChild(el('style', { id: 'mv-css', text: CSS }))
}

// --- plain words ---

const GROUP_WORDS = { floor: 'on foot', air: 'in the air', liquid: 'swimming', none: 'held still' }
const GROUP_OPTIONS = [
  ['floor', 'on foot: walking, with its own numbers (wading, sliding, ice)'],
  ['air', 'in the air: gliding, a slow fall'],
  ['liquid', 'swimming: jump and crouch go up and down'],
  ['none', 'held still: the stick does nothing (stunned)']
]
const NUM_LABELS = { speed: 'top speed', accel: 'speeds up', friction: 'slows down', gravity: 'gravity ×', buoyancy: 'floats up', jump: 'jump' }
const FLAG_WORDS = {
  off: 'starts switched off', no_jump: 'no jumping', no_dash: 'no dash', no_attack: 'no attacking', no_use: 'no using', no_crouch: 'no crouching',
  weapon_hidden: 'weapon put away', counts_as_ground: 'counts as ground', invulnerable: "can't be hurt"
}
const DEPTH_WORDS = { none: 'out of the water', feet: 'water at the feet', waist: 'water at the waist', eyes: 'under water' }
const DEPTH_BELOW = { feet: 'out of the water', waist: 'water below the waist', eyes: 'head above water' }

/** A condition in words: "water at the waist", "jump pressed". */
export function condWords (c) {
  switch (c.k) {
    case 'grounded': return 'on the ground'
    case 'airborne': return 'in the air'
    case 'rising': return 'going up'
    case 'falling': return 'falling'
    case 'asked': return 'a script asks'
    case 'touching': return 'touching a wall'
    case 'pressed': return `${c.button ?? 'jump'} pressed`
    case 'held': return `${c.button ?? 'jump'} held`
    case 'released': return `${c.button ?? 'jump'} let go`
    case 'speed': return `${c.cmp === 'below' ? 'slower' : 'faster'} than ${num(c.v ?? 0)}`
    case 'after': return `after ${num(c.v ?? 0)} s`
    case 'floor': return `on a floor tagged ${Math.round(c.tag ?? 0)}`
    case 'depth': return c.below ? DEPTH_BELOW[c.level ?? 'waist'] : DEPTH_WORDS[c.level ?? 'feet']
    case 'meter': return ['below', 'above'].includes(c.how) ? `${c.meter} ${c.how} ${num(c.v ?? 0)}` : `${c.meter} ${c.how ?? 'empty'}`
    default: return c.k
  }
}

/** An action in words: "jump", "stamina −10", "start dash". */
export function actionWords (a) {
  if (!a?.k) return ''
  if (a.k === 'impulse') return `push ${a.way ?? 'up'} ${num(a.v ?? 0)}`
  if (a.k === 'meter') return a.how === 'set' ? `${a.meter} = ${num(a.v ?? 0)}` : `${a.meter} ${(a.v ?? 0) >= 0 ? '+' : '-'}${num(Math.abs(a.v ?? 0))}`
  if (a.k === 'move') return `start ${a.move}`
  return a.k
}

const conds = (when) => (when?.length ? when.map(condWords).join(', ') : 'never (no condition yet)')
const stateSay = (s) => [GROUP_WORDS[s.group ?? 'floor'], NUMBERS.filter(([k]) => s[k] !== undefined).map(([k]) => `${NUM_LABELS[k]} ${num(s[k])}`).join(', '), ...(s.flags ?? []).map((f) => FLAG_WORDS[f] ?? f), s.anim ? `draws “${s.anim}”` : ''].filter(Boolean).join(' · ')
const waySay = (t) => `when ${conds(t.when)}${t.do?.k ? `, then ${actionWords(t.do)}` : ''}`
const sign = (v) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${num(Math.abs(v))}`
const meterSay = (t) => [`0 to ${num(t.max ?? 10)}`, t.start !== undefined ? `starts at ${num(t.start)}` : '', `${sign(t.rate ?? 0)} a second`,
  ...(t.rules ?? []).map((r) => `${sign(r.rate ?? 0)} in ${r.in ?? 'any'}${r.when?.length ? ` when ${conds(r.when)}` : ''}`)].filter(Boolean).join(' · ')
const moveSay = (v) => [`${v.mix === 'add' ? 'pushes' : 'holds'} ${v.way ?? 'facing'} at ${num(v.speed ?? 0)} for ${num(v.for ?? 0.2)} s`,
  v.cost?.meter ? `costs ${num(v.cost.n ?? 0)} ${v.cost.meter}` : '', v.off ? 'starts switched off' : '', v.when?.length ? `by itself when ${conds(v.when)}` : 'when a way or a graph starts it'].filter(Boolean).join(' · ')

// --- bare controls (the line's own label is the card's) ---

function sel (value, options, onChange, aria = '') {
  const s = el('select', { 'aria-label': aria }, options.map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, o]
    const opt = el('option', { value: v, text: t })
    if (v === value) opt.selected = true
    return opt
  }))
  s.addEventListener('change', () => onChange(s.value))
  return s
}
function numIn (value, placeholder, onChange, { lo = -1e6, hi = 1e6, aria = '' } = {}) {
  const input = el('input', { ...NUM_KEYS, value: value ?? '', placeholder, 'aria-label': aria || placeholder })
  input.addEventListener('change', () => {
    const t = input.value.trim().replace(',', '.')
    if (t === '') return onChange(undefined)
    const v = Number(t)
    if (Number.isFinite(v)) onChange(Math.min(hi, Math.max(lo, v)))
    else input.value = value ?? ''
  })
  return input
}
const field = (label, control, title = '') => el('label', { class: 'mv-field', title }, [label, control])

/** A number box that may be left empty (the engine's own then), as a labelled row: blank is undefined. */
export function optNum (label, value, placeholder, onChange, opts = {}) {
  return row(label, numIn(value, placeholder, onChange, { ...opts, aria: label }))
}

function nameIn (value, onRename, aria = 'name') {
  const input = el('input', { type: 'text', value, 'aria-label': aria, maxlength: LIMITS.name })
  input.addEventListener('change', () => { if (!onRename(input.value)) input.value = value })
  return input
}

/** The options, with the current value kept when the list lacks it -- a state deleted shows by name, not as the first choice. */
const keep = (opts, v, say = (x) => `${x} (not declared)`) => (v && !opts.some((o) => (Array.isArray(o) ? o[0] : o) === v) ? [...opts, [v, say(v)]] : opts)

/** A list of conditions, each its kind and its few words; up to four. */
function condRows (S, list, changed, { noAsked = false } = {}) {
  const meters = meterNames(S.module)
  const kinds = CONDITIONS.filter(([k]) => !(noAsked && k === 'asked'))
  const rows = list.map((c, i) => {
    const parts = [sel(c.k, kinds, (v) => { list[i] = { k: v, ...(v === 'meter' ? { meter: meters[0] ?? '', how: 'empty' } : {}) }; changed() }, 'condition')]
    if (['pressed', 'held', 'released'].includes(c.k)) parts.push(sel(c.button ?? 'jump', BUTTONS, (v) => { c.button = v; changed() }, 'button'))
    if (c.k === 'speed') parts.push(sel(c.cmp ?? 'above', [['above', 'faster than'], ['below', 'slower than']], (v) => { c.cmp = v; changed() }), numIn(c.v ?? 0, 'speed', (v) => { c.v = v ?? 0; changed() }, { lo: 0 }))
    if (c.k === 'after') parts.push(numIn(c.v ?? 0, 'seconds', (v) => { c.v = v ?? 0; changed() }, { lo: 0, hi: 1000 }), el('span', { text: 's' }))
    if (c.k === 'floor') parts.push(numIn(c.tag ?? 0, 'tag', (v) => { c.tag = Math.round(v ?? 0); changed() }, { lo: 0, hi: 65535 }))
    if (c.k === 'depth') {
      parts.push(sel(c.below ? 'below' : 'at', [['at', 'reaches'], ['below', 'below']], (v) => { c.below = v === 'below'; if (c.below && (c.level ?? 'none') === 'none') c.level = 'waist'; changed() }))
      parts.push(sel(c.level ?? 'feet', c.below ? ['feet', 'waist', 'eyes'] : [['none', 'out of it'], 'feet', 'waist', 'eyes'], (v) => { c.level = v; changed() }))
    }
    if (c.k === 'meter') {
      parts.push(sel(c.meter ?? '', keep(meters.length ? meters : [['', '(no meter yet)']], c.meter), (v) => { c.meter = v; changed() }, 'meter'))
      parts.push(sel(c.how ?? 'empty', ['empty', 'full', 'below', 'above'], (v) => { c.how = v; changed() }))
      if (['below', 'above'].includes(c.how)) parts.push(numIn(c.v ?? 0, 'amount', (v) => { c.v = v ?? 0; changed() }))
    }
    parts.push(button(withIcon('action.delete', ''), () => { list.splice(i, 1); changed() }, 'st-danger'))
    return el('div', { class: 'mv-row' }, parts)
  })
  if (list.length < LIMITS.conditions) rows.push(el('div', { class: 'mv-row' }, [button(withIcon('action.add', list.length ? 'and…' : 'when…'), () => { list.push({ k: 'grounded' }); changed() })]))
  return rows
}

// --- the editors, one open at a time ---

function stateEditor (S, s, i, changed) {
  const m = movementOf(S.module)
  return [
    el('div', { class: 'mv-grid' }, [
      field('name', nameIn(s.name, (v) => { const n = renameThing(S.module, 'state', s.name, v); if (n) changed(); return n })),
      field('animation', nameIn(s.anim ?? '', (v) => { const n = cleanName(v); if (n) s.anim = n; else delete s.anim; changed(); return true }, 'animation'), 'a name the avatar draws while in this state: Player → skin gives it a picture')
    ]),
    field('moves', sel(s.group ?? 'floor', GROUP_OPTIONS, (v) => { s.group = v; changed() }, 'moves')),
    el('div', { class: 'mv-grid' }, NUMBERS.map(([k, about]) => field(NUM_LABELS[k], numIn(s[k], 'as usual', (v) => { if (v === undefined) delete s[k]; else s[k] = v; changed() }, { aria: k }), `${k}: ${about}`))),
    el('details', { class: 'mv-small' }, [el('summary', { text: 'what the numbers mean' }), el('div', { text: NUMBERS.map(([k, about]) => `${NUM_LABELS[k]}: ${about}.`).join(' ') + ' Empty is as the player usually moves (Player → moves).' })]),
    chips(FLAGS.map((f) => ({ id: f, label: FLAG_WORDS[f], on: s.flags?.includes(f) })), (it) => { s.flags ??= []; if (s.flags.includes(it.id)) s.flags = s.flags.filter((f) => f !== it.id); else s.flags.push(it.id); changed() }, { search: 99 }),
    el('div', { class: 'mv-row' }, [button(withIcon('action.delete', 'delete this state'), () => {
      const name = s.name
      const ways = m.transitions.filter((t) => t.from === name || t.to === name).length
      const rates = m.meters.reduce((n, t) => n + (t.rules ?? []).filter((r) => r.in === name).length, 0)
      m.states.splice(i, 1)
      m.transitions = m.transitions.filter((t) => t.from !== name && t.to !== name)
      for (const t of m.meters) t.rules = (t.rules ?? []).filter((r) => r.in !== name)
      open = null
      S.status?.(`${name} deleted${ways + rates ? `, with the ${[ways ? `${ways} way${ways > 1 ? 's' : ''}` : '', rates ? `${rates} rate${rates > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')} that used it` : ''}. Undo brings ${ways + rates ? 'them' : 'it'} back.`, 'ok')
      changed()
    }, 'st-danger')])
  ]
}

function wayEditor (S, t, i, changed) {
  const m = movementOf(S.module)
  const states = stateNames(S.module)
  const a = t.do ?? {}
  const then = [sel(a.k ?? '', ACTIONS, (v) => { if (!v) delete t.do; else t.do = { k: v, ...(v === 'meter' ? { meter: meterNames(S.module)[0] ?? '', how: 'add', v: 0 } : v === 'move' ? { move: moveNames(S.module)[0] ?? '' } : v === 'impulse' ? { way: 'up', v: 6 } : {}) }; changed() }, 'then')]
  if (a.k === 'impulse') then.push(sel(a.way ?? 'up', ['up', 'facing', 'back'], (v) => { a.way = v; changed() }), numIn(a.v ?? 0, 'speed', (v) => { a.v = v ?? 0; changed() }))
  if (a.k === 'meter') then.push(sel(a.meter ?? '', keep(meterNames(S.module), a.meter), (v) => { a.meter = v; changed() }, 'meter'), sel(a.how ?? 'add', [['add', 'add'], ['set', 'set to']], (v) => { a.how = v; changed() }), numIn(a.v ?? 0, 'amount', (v) => { a.v = v ?? 0; changed() }))
  if (a.k === 'move') then.push(sel(a.move ?? '', keep(moveNames(S.module), a.move), (v) => { a.move = v; changed() }, 'move'))
  // Up and down among the ways out of the same state: only their order matters.
  const step = (d) => { for (let j = i + d; j >= 0 && j < m.transitions.length; j += d) if (m.transitions[j].from === t.from) { [m.transitions[i], m.transitions[j]] = [m.transitions[j], m.transitions[i]]; open = `way:${j}`; changed(); return } }
  return [
    el('div', { class: 'mv-row' }, [
      sel(t.from ?? 'any', keep([['any', 'from any state'], ['default', 'from default'], ...states.map((n) => [n, `from ${n}`])], t.from, (x) => `from ${x} (not declared)`), (v) => { t.from = v; changed() }, 'from'),
      sel(t.to ?? 'default', keep([['default', 'to default'], ...states.map((n) => [n, `to ${n}`])], t.to, (x) => `to ${x} (not declared)`), (v) => { t.to = v; changed() }, 'to')
    ]),
    el('div', { class: 'mv-small', text: 'when all of these hold' }),
    ...condRows(S, (t.when ??= []), changed),
    el('div', { class: 'mv-row' }, [el('span', { text: 'then' }), ...then]),
    el('div', { class: 'mv-row' }, [
      button(withIcon('action.up', 'tried sooner'), () => step(-1)),
      button(withIcon('action.down', 'later'), () => step(1)),
      button(withIcon('action.delete', 'delete'), () => { m.transitions.splice(i, 1); open = null; changed() }, 'st-danger')
    ])
  ]
}

function meterEditor (S, t, i, changed) {
  const m = movementOf(S.module)
  const states = stateNames(S.module)
  const ruleCount = m.meters.reduce((n, x) => n + (x.rules?.length ?? 0), 0)
  t.rules ??= []
  return [
    el('div', { class: 'mv-grid' }, [
      field('name', nameIn(t.name, (v) => { const n = renameThing(S.module, 'meter', t.name, v); if (n) changed(); return n })),
      field('most', numIn(t.max ?? 10, '10', (v) => { t.max = v ?? 10; changed() }, { lo: 0.01 })),
      field('starts at', numIn(t.start, 'full', (v) => { if (v === undefined) delete t.start; else t.start = v; changed() }, { lo: 0 })),
      field('a second', numIn(t.rate, '0', (v) => { if (!v) delete t.rate; else t.rate = v; changed() }), 'plus fills, minus drains')
    ]),
    ...t.rules.flatMap((r, j) => [
      el('div', { class: 'mv-row' }, [
        sel(r.in ?? 'any', keep([['any', 'in any state'], ['default', 'in default'], ...states.map((n) => [n, `in ${n}`])], r.in, (x) => `in ${x} (not declared)`), (v) => { r.in = v; changed() }, 'in'),
        numIn(r.rate ?? 0, 'a second', (v) => { r.rate = v ?? 0; changed() }), el('span', { text: 'a second' }),
        button(withIcon('action.delete', ''), () => { t.rules.splice(j, 1); changed() }, 'st-danger')
      ]),
      ...condRows(S, (r.when ??= []), changed, { noAsked: true })
    ]),
    el('div', { class: 'mv-row' }, [
      ruleCount < LIMITS.rules ? button(withIcon('action.add', 'its own rate in a state'), () => { t.rules.push({ in: states[0] ?? 'any', rate: -1, when: [] }); changed() }) : null,
      button(withIcon('action.delete', 'delete this meter'), () => { m.meters.splice(i, 1); open = null; changed() }, 'st-danger')
    ].filter(Boolean)),
    el('div', { class: 'mv-small', text: `On the HUD: meter.${t.name} and meter.${t.name}_max (Screens). In graphs: when meter empty / full, set meter.` })
  ]
}

function moveEditor (S, v, i, changed) {
  const m = movementOf(S.module)
  return [
    el('div', { class: 'mv-grid' }, [
      field('name', nameIn(v.name, (x) => { const n = renameThing(S.module, 'move', v.name, x); if (n) changed(); return n })),
      field('it', sel(v.mix ?? 'set', [['set', 'holds a speed'], ['add', 'pushes once']], (x) => { v.mix = x; changed() }), 'holds: keeps that speed for its time (a dash). pushes: adds it once and keeps the brakes off (a boost)'),
      field('which way', sel(v.way ?? 'facing', ['facing', 'back', 'up', 'down'], (x) => { v.way = x; changed() })),
      field('speed', numIn(v.speed ?? 0, 'speed', (x) => { v.speed = x ?? 0; changed() })),
      field('seconds', numIn(v.for ?? 0.2, 'seconds', (x) => { v.for = x ?? 0; changed() }, { lo: 0, hi: 60 })),
      field('priority', numIn(v.priority, '0', (x) => { if (!x) delete v.priority; else v.priority = Math.round(x); changed() }, { lo: 0, hi: 255 }), 'a new move replaces a running one on its axis only at a priority no lower'),
      field('costs', sel(v.cost?.meter ?? '', keep([['', 'nothing'], ...meterNames(S.module)], v.cost?.meter), (x) => { if (x) v.cost = { meter: x, n: v.cost?.n ?? 10 }; else delete v.cost; changed() }, 'costs')),
      v.cost ? field('how much', numIn(v.cost.n ?? 0, 'amount', (x) => { v.cost.n = x ?? 0; changed() }, { lo: 0 })) : null,
      field('at the start', sel(v.off ? 'off' : 'on', [['on', 'switched on'], ['off', 'switched off']], (x) => { if (x === 'off') v.off = true; else delete v.off; changed() }), 'switched off, it never starts until a graph (enable move) or a script switches it on for that player')
    ].filter(Boolean)),
    el('div', { class: 'mv-small', text: (v.when ??= []).length ? 'starts by itself when' : 'starts when a way ("start a move") or a graph starts it -- or by itself:' }),
    ...condRows(S, v.when, changed, { noAsked: true }),
    el('div', { class: 'mv-row' }, [button(withIcon('action.delete', 'delete this move'), () => { m.moves.splice(i, 1); open = null; changed() }, 'st-danger')])
  ]
}

// --- what a map is missing for it ---

function hints (S) {
  const m = S.module.movement
  const out = []
  const docs = Object.values(S.docs ?? {})
  const all = [...(m?.transitions ?? []).flatMap((t) => t.when ?? []), ...(m?.meters ?? []).flatMap((t) => (t.rules ?? []).flatMap((r) => r.when ?? [])), ...(m?.moves ?? []).flatMap((v) => v.when ?? [])]
  const wet = (m?.states ?? []).some((s) => s.group === 'liquid') || all.some((c) => c.k === 'depth')
  if (wet && !docs.some((d) => Object.values(d.sectors ?? {}).some((s) => s.kind === 'effect' && s.liquid))) {
    out.push('No map has water yet: on a map, draw an effect area and switch on "liquid (water)" in its panel. Until then, nothing here that needs water happens.')
  }
  // switched off at the start, and no graph switches it on: it never runs (unless a script does)
  const graphs = [S.module, ...docs].flatMap((o) => Object.values(o?.graphs ?? {})).flatMap((g) => g?.nodes ?? [])
  const enabled = (type, key, name) => graphs.some((n) => n.type === type && n[key] === name && n.on !== false)
  for (const s of m?.states ?? []) if (s.flags?.includes('off') && !enabled('enable_movement_state', 'state', s.name)) out.push(`${s.name} starts switched off, and no graph switches it on ("enable movement state" ${s.name}): it never runs, unless a script does.`)
  for (const v of m?.moves ?? []) if (v.off && !enabled('enable_move', 'move', v.name)) out.push(`The move ${v.name} starts switched off, and no graph switches it on ("enable move" ${v.name}): it never starts, unless a script does.`)
  const tags = new Set(docs.flatMap((d) => Object.values(d.sectors ?? {}).map((s) => s.tag)).filter(Boolean))
  for (const tag of new Set(all.filter((c) => c.k === 'floor').map((c) => Math.round(c.tag ?? 0)))) {
    if (!tags.has(tag)) out.push(`No floor is tagged ${tag} yet: give a room tag ${tag} in its panel on a map, or what waits for "on a floor tagged ${tag}" never happens.`)
  }
  return out
}

// --- the tab ---

const keyOf = (o) => (!o ? null : o.kind === 'state' ? `state:${o.i}` : o.kind === 'transition' ? `way:${o.i}` : o.kind === 'move' ? `move:${o.i}` : `meter:${o.i}`)

/** The Player → movement tab. `ctx.changed()` saves and draws it again; `ctx.render()` only draws it. */
export function movementRows (S, ctx) {
  css()
  const module = S.module
  const m = movementOf(module)
  const changed = () => ctx.changed()
  const redraw = () => (ctx.render ?? ctx.changed)()
  const verdict = S.checkMovement?.() ?? null
  const badKey = keyOf(verdict?.owner)
  if (verdict && !open) open = badKey
  const states = stateNames(module)
  const empty = !hasAny(m)

  // One line, and its editor under it when open.
  const card = (key, name, say, editor, { cls = '', extra = null, ico = null } = {}) => {
    const on = open === key
    const line = el('button', { class: `mv-line ${cls}`, type: 'button', 'data-mv': key, 'data-open': on ? '1' : '0', 'data-bad': key === badKey ? '1' : '0', onclick: () => { open = on ? null : key; redraw() } }, [
      el('span', { class: 'mv-name' }, ico ? [icon(ico), name] : [name]), el('span', { class: 'mv-say', text: say }), icon(on ? 'action.collapse' : 'action.expand', 'mv-chev')
    ])
    return [extra ? el('div', { class: 'mv-head' }, [line, extra]) : line,
      key === badKey ? el('div', { class: 'mv-bad', text: `The engine refuses this: ${verdict.why}.` }) : null,
      on ? el('div', { class: 'mv-edit' }, editor()) : null]
  }
  const addWay = (from) => button(withIcon('action.add', 'way'), () => {
    if (m.transitions.length >= LIMITS.transitions) return S.status?.(`at most ${LIMITS.transitions} ways`, 'warn')
    const to = from === 'default' ? (states[0] ?? 'default') : 'default'
    m.transitions.push({ from, to, when: [{ k: 'grounded' }] }); open = `way:${m.transitions.length - 1}`; changed()
  })
  const ways = (from) => {
    const list = m.transitions.map((t, i) => [t, i]).filter(([t]) => t.from === from)
    return list.length ? el('div', { class: 'mv-ways' }, list.flatMap(([t, i]) => card(`way:${i}`, t.to, waySay(t), () => wayEditor(S, t, i, changed), { cls: 'mv-way', ico: 'action.link' })).filter(Boolean)) : null
  }

  const rows = [
    el('div', { class: 'mv-small', text: 'How the player moves besides walking: swimming, sliding, gliding, a stun. Each state is a way of moving, with the ways into the next under it. Tap a line to change it.' }),
    verdict ? el('div', { class: 'st-danger', 'data-mv-verdict': 'bad', text: `The engine refuses ${ownerText(module, verdict.owner)}: ${verdict.why}. It is outlined below.` })
      : empty ? null : el('div', { class: 'mv-small', 'data-mv-verdict': 'ok', text: 'The engine reads all of it.' }),
    ...hints(S).map((h) => el('div', { class: 'mv-hint', 'data-mv-hint': '1', text: h })),
    el('details', empty ? { open: '' } : {}, [
      el('summary', { text: empty ? 'start from' : 'add from a recipe' }),
      chips(Object.entries(RECIPES).map(([id, r]) => ({ id, label: r.label })), (it) => { addRecipe(module, it.id); S.status?.(RECIPES[it.id].about, 'ok'); changed() }, { search: 99 })
    ])
  ]

  // STATES, each with its ways out; default first, any last
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.state', `states (${m.states.length} of ${LIMITS.states})`)))
  rows.push(el('div', { class: 'mv-head' }, [el('div', { class: 'mv-line mv-plain' }, [el('span', { class: 'mv-name', text: 'default' }), el('span', { class: 'mv-say', text: 'walking, jumping, climbing: the engine\'s own' })]), addWay('default')]))
  rows.push(ways('default'))
  m.states.forEach((s, i) => {
    rows.push(...card(`state:${i}`, s.name, stateSay(s), () => stateEditor(S, s, i, changed), { extra: addWay(s.name) }))
    rows.push(ways(s.name))
  })
  const anyWays = ways('any')
  if (anyWays || m.states.length) rows.push(el('div', { class: 'mv-head' }, [el('div', { class: 'mv-line mv-plain' }, [el('span', { class: 'mv-name', text: 'from any state' }), el('span', { class: 'mv-say', text: 'tried after a state\'s own ways' })]), addWay('any')]), anyWays)
  // ways out of a state nobody declares (it was renamed by hand, or the file says so)
  for (const from of new Set(m.transitions.map((t) => t.from).filter((f) => f !== 'any' && f !== 'default' && !states.includes(f)))) {
    rows.push(el('div', { class: 'mv-line mv-plain' }, [el('span', { class: 'mv-name', text: from }), el('span', { class: 'mv-say', text: 'not declared: these ways never run' })]), ways(from))
  }
  if (m.states.length < LIMITS.states) rows.push(el('div', { class: 'mv-row' }, [button(withIcon('action.add', 'a state'), () => { m.states.push({ name: freeName(m.states, 'state'), group: 'floor', flags: [] }); open = `state:${m.states.length - 1}`; changed() })]))

  // METERS
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.health', `meters (${m.meters.length} of ${LIMITS.meters})`)))
  if (!m.meters.length) rows.push(el('div', { class: 'mv-small', text: 'A number each body carries and the moves can spend: breath, stamina, heat.' }))
  m.meters.forEach((t, i) => rows.push(...card(`meter:${i}`, t.name, meterSay(t), () => meterEditor(S, t, i, changed))))
  if (m.meters.length < LIMITS.meters) rows.push(el('div', { class: 'mv-row' }, [button(withIcon('action.add', 'a meter'), () => { m.meters.push({ name: freeName(m.meters, 'meter'), max: 10, rules: [] }); open = `meter:${m.meters.length - 1}`; changed() })]))

  // MOVES
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.moves', `moves (${m.moves.length} of ${LIMITS.moves})`)))
  if (!m.moves.length) rows.push(el('div', { class: 'mv-small', text: 'A push that lasts a moment, whatever the state: a dash, a jump pad, a boost.' }))
  m.moves.forEach((v, i) => rows.push(...card(`move:${i}`, v.name, moveSay(v), () => moveEditor(S, v, i, changed))))
  if (m.moves.length < LIMITS.moves) rows.push(el('div', { class: 'mv-row' }, [button(withIcon('action.add', 'a move'), () => { m.moves.push({ name: freeName(m.moves, 'move'), mix: 'set', way: 'facing', speed: 12, for: 0.2, when: [] }); open = `move:${m.moves.length - 1}`; changed() })]))

  // AS WRITTEN
  const { lines } = movementLines(module)
  if (lines.length) rows.push(el('details', {}, [el('summary', { text: 'as written in module.txt' }), el('pre', { class: 'mv-small', style: 'white-space:pre-wrap;font-size:11px', text: lines.join('\n') })]))
  return rows.flat().filter(Boolean)
}
