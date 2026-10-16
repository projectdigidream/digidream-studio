//
// The vocabulary in words. Each condition and action the monster and weapon
// editors offer, as the sentence a designer reads ("the target is within 2 m"),
// over the engine's own names and units (maps/scripts/mob_vocab.json,
// weapon_vocab.json).
//
// A sentence is a list of parts:
//   ['t', words]                      plain words
//   ['n', arg, unit, default]         a number; `unit` says how it is kept:
//        'm'    a distance, kept as fixed point ("1.5")
//        'mps'  a speed in m/s, fixed point
//        's'    a time, kept in ticks (60 a second), shown in seconds
//        '%'    a percent, an int
//        '°'    degrees, an int
//        ''     a plain int
//        'n+1'  a count shown one less than it is kept (count_within's at_least, negated)
//   ['var', arg, default]             a name of one of its numbers
//   ['mob', arg, default]             a monster kind; 'any' leaves it out
//   ['state', arg]                    one of its states (a weapon's phases)
//   ['missile', arg, default]         a missile of the module
//   ['sound', arg, default]           a sound of the module's packs
//   ['fx', arg, default]              a particle kind (props.txt `vfx`)
//   ['enum', arg, [values], default]  one of a few words
//   ['bool', arg, words, default]     a yes/no, said by `words` when yes
//   ['text', arg, default]            a free name (a Lua function)
//   ['prop', arg, default]            a prop of the catalogue; '' is any
//
// A key 'vocab:<name>' is an entry the phrasebook has no words for, offered
// under "More": made bare and edited with the vocabulary's own form.
//
// The entry's key is the vocabulary name, with '!' for its negated form
// ("further than" is target_within negated) and ':' for an action told apart
// by an argument (set_param of move_speed is "change its speed").
// Anything the vocabulary has that is not here is still reachable: the editor
// falls back to argform.js for it.
//
// Pure: no DOM.
//

export const TPS = 60

// ---- fixed point, as lua.js writes it: an int, an exact decimal string, or [n, d] ----
export function fxNum (v) {
  if (v === undefined || v === null || v === '') return null
  if (Array.isArray(v)) return v[1] ? v[0] / v[1] : null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
/** A number as the fixed point the runtime reads: whole numbers as ints, else up to 4 decimals as a string. */
export function fxOf (n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return undefined
  const r = Math.round(n * 10000) / 10000
  if (Number.isInteger(r)) return r
  return String(r)
}
export const secs = (ticks) => (ticks === undefined || ticks === null ? null : Math.round((Number(ticks) / TPS) * 100) / 100)
export const ticksOf = (s) => (s === null || s === undefined || !Number.isFinite(Number(s)) ? undefined : Math.max(0, Math.round(Number(s) * TPS)))

/** A part's value as the editor shows it (a number in its unit, or a name). */
export function shown (part, obj) {
  const [k, arg] = part
  const v = obj?.[arg]
  if (k === 'n') {
    const unit = part[2]
    const def = part[3]
    if (v === undefined || v === null) return def
    if (unit === 's') return secs(v)
    if (unit === 'm' || unit === 'mps') { const n = fxNum(v); return n === null ? null : Math.round(n * 100) / 100 }
    if (unit === 'n+1') return Number(v) - 1
    return Number(v)
  }
  if (k === 'mob') return v ?? 'any'
  if (k === 'bool') return v === undefined ? part[3] ?? false : !!v
  return v ?? part[2] ?? part[3]
}

/** Writes a shown value back into `obj` in the engine's unit (mutates). */
export function store (part, obj, value) {
  const [k, arg] = part
  if (k === 'n') {
    const unit = part[2]
    const n = Number(value)
    if (!Number.isFinite(n)) return
    if (unit === 's') obj[arg] = ticksOf(n)
    else if (unit === 'm' || unit === 'mps') obj[arg] = fxOf(n)
    else if (unit === 'n+1') obj[arg] = Math.max(1, Math.round(n) + 1)
    else obj[arg] = Math.round(n)
    return
  }
  if (k === 'mob') { if (value === 'any' || value === '' || value == null) delete obj[arg]; else obj[arg] = value; return }
  if (k === 'bool') { if (value) obj[arg] = true; else delete obj[arg]; return }
  if (value === '' || value === undefined) delete obj[arg]; else obj[arg] = value
}

const unitJoin = (u) => (!u || u === 'n+1' ? '' : u === '%' || u === '°' ? u : u === 'mps' ? ' m/s' : ` ${u}`)

// ---------------------------------------------------------------- conditions

export const MOB_CONDITIONS = {
  has_target: { g: 'The target', p: [['t', 'it has a target']], short: 'has target' },
  'has_target!': { g: 'The target', p: [['t', 'it has no target']], short: 'no target' },
  target_visible: { g: 'The target', p: [['t', 'it can see the target']], short: 'sees target' },
  target_within: { g: 'The target', p: [['t', 'the target is within'], ['n', 'distance', 'm', 2]], short: (c, sh) => `≤${sh('distance')} m` },
  // with_target: a seen target further than N (brainc.js adds has_target); "not within" alone holds with no target too
  'target_within!': { g: 'The target', p: [['t', 'the target is further than'], ['n', 'distance', 'm', 8]], fixed: { with_target: true }, short: (c, sh) => `>${sh('distance')} m` },
  target_in_front: { g: 'The target', p: [['t', 'the target is within'], ['n', 'arc', '°', 45], ['t', 'of where it faces']], short: 'in front' },
  target_above: { g: 'The target', p: [['t', 'the target is'], ['n', 'by', 'm', 1], ['t', 'or more above it']], short: 'target above' },
  target_below: { g: 'The target', p: [['t', 'the target is'], ['n', 'by', 'm', 1], ['t', 'or more below it']], short: 'target below' },
  can_reach: { g: 'The target', p: [['t', 'it can walk to the target']], short: 'can reach' },
  target_is: { g: 'The target', p: [['t', 'it is hunting a'], ['enum', 'kind', ['player', 'mob', 'prop'], 'player']], short: (c) => `hunts ${c.kind}` },
  hp_below: { g: 'Itself', p: [['t', 'its health is below'], ['n', 'percent', '%', 30]], short: (c, sh) => `hp < ${sh('percent')}%` },
  was_hurt: { g: 'Itself', p: [['t', 'it was hurt in the last'], ['n', 'within', 's', 0.3]], short: 'hurt' },
  hurt_by_mob: { g: 'Itself', p: [['t', 'another monster hurt it']], short: 'hurt by a monster' },
  grounded: { g: 'Itself', p: [['t', 'it is on the ground']], short: 'grounded' },
  'grounded!': { g: 'Itself', p: [['t', 'it is in the air']], short: 'in the air' },
  stuck: { g: 'Itself', p: [['t', 'it has been stuck for'], ['n', 'ticks', 's', 1]], short: 'stuck' },
  mob_within: { g: 'Others nearby', p: [['t', 'a monster'], ['mob', 'mob', 'any'], ['t', 'is within'], ['n', 'distance', 'm', 3]], short: (c, sh) => `${c.mob ?? 'a monster'} ≤${sh('distance')} m` },
  count_within: { g: 'Others nearby', p: [['t', 'at least'], ['n', 'at_least', '', 3], ['t', 'monsters'], ['mob', 'mob', 'any'], ['t', 'are within'], ['n', 'distance', 'm', 6]], short: (c) => `${c.at_least} ${c.mob ?? 'monsters'} near` },
  'count_within!': { g: 'Others nearby', p: [['t', 'no more than'], ['n', 'at_least', 'n+1', 2], ['t', 'monsters'], ['mob', 'mob', 'any'], ['t', 'are within'], ['n', 'distance', 'm', 6]], short: (c) => `≤${c.at_least - 1} ${c.mob ?? 'monsters'} near` },
  prop_within: { g: 'Others nearby', p: [['t', 'a prop'], ['prop', 'prop', ''], ['t', 'is within'], ['n', 'distance', 'm', 3]], short: (c) => `${c.prop ?? 'a prop'} near` },
  ally_in_front: { g: 'Others nearby', p: [['t', 'another monster is in its line of fire']], short: 'ally in the way' },
  state_elapsed: { g: 'Time and chance', p: [['t', 'this state has run for'], ['n', 'ticks', 's', 1]], short: (c, sh) => `${sh('ticks')} s in` },
  chance: { g: 'Time and chance', p: [['t', 'a'], ['n', 'percent', '%', 50], ['t', 'chance']], short: (c) => `${c.percent}%` },
  cooldown_ready: { g: 'Numbers and timers', p: [['t', 'cooldown'], ['var', 'var', 'ready'], ['t', 'is over']], short: (c) => c.var },
  var_at_least: { g: 'Numbers and timers', p: [['t', 'the number'], ['var', 'var', 'rage'], ['t', 'is at least'], ['n', 'value', '', 1]], short: (c) => `${c.var} ≥ ${c.value}` },
  var_is: { g: 'Numbers and timers', p: [['t', 'the number'], ['var', 'var', 'rage'], ['t', 'is'], ['n', 'value', '', 0]], short: (c) => `${c.var} = ${c.value}` },
  'var_is!': { g: 'Numbers and timers', p: [['t', 'the number'], ['var', 'var', 'rage'], ['t', 'is not'], ['n', 'value', '', 0]], short: (c) => `${c.var} ≠ ${c.value}` },
  lua: { g: 'Lua', p: [['t', 'the Lua function'], ['text', 'fn', 'can_act'], ['t', 'says yes']], short: (c) => `${c.fn}()` }
}

export const WEAPON_CONDITIONS = {
  button_pressed: { g: 'Fire button', p: [['t', 'fire is pressed']], short: 'fire' },
  button_released: { g: 'Fire button', p: [['t', 'fire is let go']], short: 'let go' },
  button_held: { g: 'Fire button', p: [['t', 'fire is held']], short: 'held' },
  'button_held!': { g: 'Fire button', p: [['t', 'fire is not held']], short: 'not held' },
  held_for: { g: 'Fire button', p: [['t', 'fire has been held for'], ['n', 'ticks', 's', 0.5]], short: (c, sh) => `held ${sh('ticks')} s` },
  has_ammo: { g: 'Ammo', p: [['t', 'it has at least'], ['n', 'n', '', 1], ['t', 'ammo']], short: (c) => (c.n > 1 ? `ammo ≥ ${c.n}` : 'ammo') },
  no_ammo: { g: 'Ammo', p: [['t', 'it is out of ammo']], short: 'no ammo' },
  grounded: { g: 'The body', p: [['t', 'on the ground']], short: 'grounded' },
  'grounded!': { g: 'The body', p: [['t', 'in the air']], short: 'in the air' },
  moving: { g: 'The body', p: [['t', 'moving faster than'], ['n', 'speed', 'mps', 0.5]], short: 'moving' },
  falling: { g: 'The body', p: [['t', 'falling faster than'], ['n', 'speed', 'mps', 2]], short: 'falling' },
  phase_elapsed: { g: 'Time and chance', p: [['t', 'this state has run for'], ['n', 'ticks', 's', 0.2]], short: (c, sh) => `${sh('ticks')} s in` },
  chance: { g: 'Time and chance', p: [['t', 'a'], ['n', 'percent', '%', 50], ['t', 'chance']], short: (c) => `${c.percent}%` },
  always: { g: 'Time and chance', p: [['t', 'always']], short: 'always' },
  cooldown_ready: { g: 'Numbers and timers', p: [['t', 'cooldown'], ['var', 'var', 'shot_cd'], ['t', 'is over']], short: (c) => c.var },
  var_at_least: { g: 'Numbers and timers', p: [['t', 'the number'], ['var', 'var', 'combo'], ['t', 'is at least'], ['n', 'value', '', 1]], short: (c) => `${c.var} ≥ ${c.value}` },
  var_is: { g: 'Numbers and timers', p: [['t', 'the number'], ['var', 'var', 'combo'], ['t', 'is'], ['n', 'value', '', 0]], short: (c) => `${c.var} = ${c.value}` },
  'var_is!': { g: 'Numbers and timers', p: [['t', 'the number'], ['var', 'var', 'combo'], ['t', 'is not'], ['n', 'value', '', 0]], short: (c) => `${c.var} ≠ ${c.value}` },
  lua: { g: 'Lua', p: [['t', 'the Lua function'], ['text', 'fn', 'can_fire'], ['t', 'says yes']], short: (c) => `${c.fn}()` }
}

// ---------------------------------------------------------------- actions (a state's steps)

export const MOB_ACTIONS = {
  melee: { g: 'Attack', k: 'hit', p: [['t', 'melee hit for'], ['n', 'damage', '', 10], ['t', 'damage within'], ['n', 'range', 'm', 1.6], ['t', 'knocking back'], ['n', 'knockback', 'm', 4]] },
  missile: { g: 'Attack', k: 'hit', p: [['t', 'fire the missile'], ['missile', 'kind', ''], ['t', 'at the target'], ['bool', 'lead', 'aiming ahead of it', false]] },
  hitscan: { g: 'Attack', k: 'hit', p: [['t', 'fire an instant shot for'], ['n', 'damage', '', 8], ['t', 'damage, range'], ['n', 'range', 'm', 32], ['t', ', spread'], ['n', 'spread', '°', 3]] },
  damage_area: { g: 'Attack', k: 'hit', p: [['t', 'a blast of'], ['n', 'damage', '', 30], ['t', 'damage within'], ['n', 'radius', 'm', 3], ['bool', 'hurts_owner', 'that hurts itself too', false]] },
  swing: { g: 'Attack', k: 'hit', p: [['t', 'swing its own swing']] },
  telegraph: { g: 'Attack', k: 'hit', p: [['t', 'warn the player with'], ['fx', 'effect', 12], ['t', 'for'], ['n', 'ticks', 's', 0.4]] },
  sound: { g: 'Sound and look', k: 'sound', p: [['t', 'play the sound'], ['sound', 'name', '']] },
  vfx: { g: 'Sound and look', k: 'sound', p: [['t', 'show the effect'], ['fx', 'kind', 12]] },
  set_anim: { g: 'Sound and look', k: 'sound', p: [['t', 'play the animation of state'], ['n', 'anim', '', 0]] },
  set_cooldown: { g: 'Numbers and timers', k: 'clock', p: [['t', 'start cooldown'], ['var', 'var', 'ready'], ['t', 'for'], ['n', 'ticks', 's', 1]] },
  set_var: { g: 'Numbers and timers', k: 'clock', p: [['t', 'set the number'], ['var', 'var', 'phase'], ['t', 'to'], ['n', 'value', '', 1]] },
  add_var: { g: 'Numbers and timers', k: 'clock', p: [['t', 'add'], ['n', 'by', '', 1], ['t', 'to the number'], ['var', 'var', 'count']] },
  var_random: { g: 'Numbers and timers', k: 'clock', p: [['t', 'make'], ['var', 'var', 'pick'], ['t', 'a random number from'], ['n', 'min', '', 1], ['t', 'to'], ['n', 'max', '', 3]] },
  face: { g: 'Moving', k: 'turn', p: [['t', 'turn to face the target']] },
  set_angle: { g: 'Moving', k: 'turn', p: [['t', 'pick a heading'], ['enum', 'towards', ['target', 'facing', 'away', 'random'], 'random'], ['t', 'into the number'], ['var', 'var', 'wander']] },
  impulse: { g: 'Moving', k: 'turn', p: [['t', 'leap'], ['enum', 'towards', ['target', 'facing', 'away', 'random'], 'target'], ['t', 'at'], ['n', 'speed', 'mps', 8]] },
  'set_param:move_speed': { g: 'Moving', k: 'turn', p: [['t', 'change its speed to'], ['n', 'value', 'mps', 8]], fixed: { param: 'move_speed' } },
  teleport: { g: 'Moving', k: 'turn', p: [['t', 'teleport'], ['enum', 'to', ['behind', 'near'], 'behind'], ['t', 'the target,'], ['n', 'distance', 'm', 3], ['t', 'away, with'], ['fx', 'effect', 11]] },
  spawn: { g: 'Others', k: 'hit', p: [['t', 'summon'], ['n', 'count', '', 2], ['mob', 'mob', 'husk'], ['t', 'beside it']] },
  alert_nearby: { g: 'Others', k: 'turn', p: [['t', 'alert the monsters within'], ['n', 'radius', 'm', 12]] },
  revive: { g: 'Others', k: 'turn', p: [['t', 'raise a corpse within'], ['n', 'radius', 'm', 4]] },
  target_attacker: { g: 'Others', k: 'turn', p: [['t', 'turn on whoever hurt it']] },
  target_none: { g: 'Others', k: 'turn', p: [['t', 'forget its target']] },
  goto: { g: 'Flow', k: 'turn', p: [['t', 'leave now for'], ['state', 'state']] },
  despawn: { g: 'Flow', k: 'turn', p: [['t', 'vanish']] },
  lua: { g: 'Lua', k: 'turn', p: [['t', 'run the Lua function'], ['text', 'fn', 'on_step']] }
}

export const WEAPON_ACTIONS = {
  hitscan: { g: 'Attack', k: 'hit', p: [['t', 'fire an instant shot for'], ['n', 'damage', '', 10], ['t', 'damage, range'], ['n', 'range', 'm', 32], ['t', ', spread'], ['n', 'spread', '°', 2]] },
  launch: { g: 'Attack', k: 'hit', p: [['t', 'launch the missile'], ['missile', 'missile', '']] },
  damage_area: { g: 'Attack', k: 'hit', p: [['t', 'a blast of'], ['n', 'damage', '', 30], ['t', 'damage within'], ['n', 'radius', 'm', 2]] },
  telegraph: { g: 'Attack', k: 'hit', p: [['t', 'warn with'], ['fx', 'effect', 12], ['t', 'for'], ['n', 'ticks', 's', 0.2]] },
  consume: { g: 'Ammo', k: 'clock', p: [['t', 'use'], ['n', 'n', '', 1], ['t', 'ammo']] },
  switch_if_empty: { g: 'Ammo', k: 'clock', p: [['t', 'switch weapon if it is empty']] },
  sound: { g: 'Sound and look', k: 'sound', p: [['t', 'play the sound'], ['sound', 'name', '']] },
  vfx: { g: 'Sound and look', k: 'sound', p: [['t', 'show the effect'], ['fx', 'effect', 12]] },
  set_anim: { g: 'Sound and look', k: 'sound', p: [['t', 'show the picture of state'], ['n', 'state', '', 0]] },
  impulse: { g: 'Moving', k: 'turn', p: [['t', 'push the player'], ['enum', 'towards', ['away', 'facing', 'random'], 'away'], ['t', 'at'], ['n', 'speed', 'mps', 3]] },
  set_cooldown: { g: 'Numbers and timers', k: 'clock', p: [['t', 'start cooldown'], ['var', 'var', 'shot_cd'], ['t', 'for'], ['n', 'ticks', 's', 1]] },
  set_var: { g: 'Numbers and timers', k: 'clock', p: [['t', 'set the number'], ['var', 'var', 'combo'], ['t', 'to'], ['n', 'value', '', 0]] },
  add_var: { g: 'Numbers and timers', k: 'clock', p: [['t', 'add'], ['n', 'value', '', 1], ['t', 'to the number'], ['var', 'var', 'combo']] },
  goto: { g: 'Flow', k: 'turn', p: [['t', 'leave now for'], ['state', 'phase']] },
  lua: { g: 'Lua', k: 'turn', p: [['t', 'run the Lua function'], ['text', 'fn', 'on_step']] }
}

// What a missile does when it hits, runs out, bounces, or at a moment of its flight (the mob vocabulary's actions).
export const MISSILE_ACTIONS = {
  damage_area: { g: 'Damage', k: 'hit', p: [['t', 'a blast of'], ['n', 'damage', '', 20], ['t', 'damage within'], ['n', 'radius', 'm', 2], ['bool', 'falloff', 'weaker at the edge', true], ['t', 'knocking back'], ['n', 'knockback', 'm', 0], ['t', 'lifting'], ['n', 'lift', 'm', 0], ['bool', 'hurts_owner', 'hurts the one who fired it', false]] },
  damage: { g: 'Damage', k: 'hit', p: [['t', 'hurt what it hit for'], ['n', 'amount', '', 10]] },
  missile: { g: 'Missiles', k: 'hit', p: [['t', 'split into'], ['n', 'count', '', 3], ['missile', 'kind', ''], ['t', 'spread over'], ['n', 'arc', '°', 30], ['t', 'heading'], ['enum', 'towards', ['on', 'back', 'target'], 'on']] },
  spawn: { g: 'Missiles', k: 'hit', p: [['t', 'leave'], ['n', 'count', '', 1], ['mob', 'mob', 'husk'], ['t', 'where it is']] },
  sound: { g: 'Sound and look', k: 'sound', p: [['t', 'play the sound'], ['sound', 'name', 'boom']] },
  vfx: { g: 'Sound and look', k: 'sound', p: [['t', 'show the effect'], ['fx', 'kind', 11], ['t', 'at'], ['enum', 'at', ['impact', 'self'], 'impact']] }
}

// ---------------------------------------------------------------- lookups

/** The phrase key of a condition: its name, with '!' when negated and a negated form exists. */
export function condKey (table, c) {
  if (c?.negate && table[`${c.cond}!`]) return `${c.cond}!`
  return c?.cond
}
export function actKey (table, a) {
  if (a?.action === 'set_param' && a.param && table[`set_param:${a.param}`]) return `set_param:${a.param}`
  return a?.action
}

/** A new condition from a phrase key: { cond, negate?, defaults }. */
export function newCond (table, key) {
  const ph = table[key]
  if (key.startsWith('vocab:')) return { cond: key.slice(6) }
  const c = { cond: key.replace(/!$/, ''), ...(ph?.fixed ?? {}) }
  if (key.endsWith('!')) c.negate = true
  for (const part of ph?.p ?? []) if (part[0] !== 't') store(part, c, defaultOf(part))
  return c
}
/**
 * A new step from a phrase key, at `at` ticks. `ctx` names what a reference
 * starts as -- { missile, sound, state } -- the module's own, since a fixed
 * default would name something the module may not have.
 */
export function newAct (table, key, at = 0, ctx = {}) {
  if (key.startsWith('vocab:')) return { at, action: key.slice(6) }
  const ph = table[key]
  const a = { at, action: key.split(':')[0], ...(ph?.fixed ?? {}) }
  for (const part of ph?.p ?? []) if (part[0] !== 't') store(part, a, defaultOf(part, ctx))
  return a
}
function defaultOf (part, ctx = {}) {
  const [k] = part
  if (k === 'missile' && ctx.missile) return ctx.missile
  if (k === 'sound' && ctx.sound) return ctx.sound
  if (k === 'state' && ctx.state) return ctx.state
  if (k === 'mob' && ctx.mob) return ctx.mob
  if (k === 'n') return part[3]
  if (k === 'enum') return part[3]
  if (k === 'bool') return part[3]
  return part[2]
}

/** A sentence for a condition or a step. `names(kind, v)` may rename refs for display. */
export function sentence (table, obj, key = null) {
  const k = key ?? (obj && 'cond' in obj ? condKey(table, obj) : actKey(table, obj))
  const ph = table[k]
  if (!ph) return `${obj?.negate ? 'not ' : ''}${k ?? '?'}${argSummary(obj)}`
  return ph.p.map((part) => {
    const [kind, arg] = part
    if (kind === 't') return arg
    const v = shown(part, obj)
    if (kind === 'n') return `${v}${unitJoin(part[2])}`
    if (kind === 'mob') return v === 'any' ? '(any kind)' : `(${v})`
    if (kind === 'prop') return v ? `(${v})` : '(any)'
    if (kind === 'bool') return v ? `, ${part[2]}` : ''
    if (kind === 'fx') return v === undefined || v === '' ? '?' : `effect ${v}`
    return v === undefined || v === '' ? '?' : String(v)
  }).filter((s) => s !== '').join(' ').replace(/ ,/g, ',')
}
function argSummary (obj) {
  const skip = new Set(['cond', 'action', 'at', 'negate'])
  const parts = Object.entries(obj ?? {}).filter(([k]) => !skip.has(k)).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join('/') : v}`)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

/** The short label a graph arrow carries. */
export function shortOf (table, c) {
  const k = condKey(table, c)
  const ph = table[k]
  if (!ph) return (c?.negate ? 'not ' : '') + (c?.cond ?? '?')
  if (typeof ph.short === 'function') {
    const sh = (arg) => shown(ph.p.find((p) => p[1] === arg) ?? ['n', arg, '', 0], c)
    return ph.short(c, sh)
  }
  return ph.short
}

/** The chooser's groups: [{ label, opts: [{ key, label }] }], in table order. `kind` is 'cond' or 'act'. */
export function groupsOf (table, kind, only = null, ctx = {}) {
  const out = []
  for (const key of Object.keys(table)) {
    if (only && !only(key)) continue
    let grp = out.find((x) => x.label === table[key].g)
    if (!grp) { grp = { label: table[key].g, opts: [] }; out.push(grp) }
    const sample = kind === 'cond' ? newCond(table, key) : newAct(table, key, 0, ctx)
    grp.opts.push({ key, label: sentence(table, sample, key) })
  }
  return out
}

/**
 * The vocabulary's entries the table has no words for -- offered under "More",
 * so nothing the engine can do is out of the editor's reach.
 * @param names  the vocabulary's condition or action names
 */
export function unphrased (table, names) {
  const have = new Set(Object.keys(table).filter((k) => !k.includes(':')).map((k) => k.replace(/!$/, '')))
  return names.filter((n) => !have.has(n))
}
/** The chooser's groups with "More" at the end. */
export function groupsWithMore (table, kind, more, ctx = {}) {
  const g = groupsOf(table, kind, null, ctx)
  if (more?.length) g.push({ label: 'More (the engine\'s own words, edited in its own form)', opts: more.map((n) => ({ key: `vocab:${n}`, label: n.replace(/_/g, ' ') })) })
  return g
}

/** Which colour a step's mark takes on the timeline ('hit', 'sound', 'clock', 'turn'). */
export const stepKind = (table, a) => table[actKey(table, a)]?.k ?? 'turn'
