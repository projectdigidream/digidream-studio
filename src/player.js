//
// The player: what draws them, how big they are, what they move like, and
// what they start holding.
//
// THE MODULE'S, AND A MAP'S ONLY WHEN IT SAYS SO. One player is set up once
// for every map; a map that needs it different -- a giant's level, a low-gravity
// one -- overrides exactly the parts it names in `doc.playerOverride`, and
// everything it does not name follows the module. `playerFor` is the one place
// that resolves the two.
//
// WHO ENFORCES WHAT, which is why the pieces are emitted in different places:
//
//   the SKIN is an `avatar` line naming one of the module's props -- a player
//   is kind 0 on the wire, and kind 0 is structurally "no prop" -- so it is the
//   catalogue's, and module-only: one catalogue serves every map;
//
//   the SIZE is written into each map as `body radius R height H`, and is in
//   its content hash: it is replicated as movement parameters and predicted,
//   so a client whose player is a different size from the server's has a
//   different map;
//
//   MOVEMENT is the module's to SAY (docs/PLAYER.md): `player <parameter>
//   <value>` lines in module.txt for every level, `player <map> <parameter>
//   <value>` for one, read by the server into the full parameter set a
//   player arrives with -- so the client predicts with them from the first
//   tick. Values, not modifiers: what the line says is what the player has;
//
//   the KIT is the arsenal's, and module-wide: the weapons run ONCE for the
//   whole game (a module.txt `game` line), so what a player holds follows them
//   from map to map and a map has no starting kit of its own to override.
//
import { el, row, number, select, toggle, muted, button, card, withIcon, icon } from './ui.js'
import { DEFAULT_BODY } from './doc.js'

// THE PLAYER'S PARAMETERS, grouped as docs/PLAYER.md §3 has them, with the
// engine's defaults, types and units. MIRRORS
// core/include/dnp/physics/params_table.hpp (names and types) and PLAYER.md
// (defaults); studio/test/player.test.js reads both and fails if a name, a
// type or a default here is not the engine's, so the copy cannot rot silently.
// The body's size (radius, height) is the size tab's: it goes into each map.
//
//   number  a decimal (written exactly; the server reads it with no float)
//   switch  on or off
//   count   a whole number 0..255
const P = (name, type, def, unit, about) => ({ name, type, def, unit, about })
export const PLAYER_PARAMS = [
  { group: 'moving and turning', params: [
    P('move_speed', 'number', 8, 'units/s', 'top running speed'),
    P('ground_accel', 'number', 80, 'units/s²', 'acceleration on the ground'),
    P('air_accel', 'number', 24, 'units/s²', 'acceleration in the air (air control)'),
    P('friction', 'number', 60, 'units/s²', 'slowing on the ground with no input'),
    P('gravity_scale', 'number', 1, '×', 'multiplier on gravity'),
    P('turn_speed', 'number', 4, 'turns/s', 'how fast the body turns to its aim (1000: at once; 0: never)'),
    P('move_relative', 'switch', false, '', 'the stick pushes relative to the facing (first person)'),
    P('input_scale', 'number', 1, '×', 'multiplier on the movement stick; 0 freezes movement'),
    P('aim_snap', 'count', 0, 'directions', 'aim snaps to this many directions; 0 is free aim')] },
  { group: 'jumping', params: [
    P('jump_impulse', 'number', 9, 'units/s', 'upward speed a jump gives'),
    P('max_jumps', 'count', 2, 'jumps', 'before landing again: 1 single, 2 double, 0 none'),
    P('coyote_time', 'number', 0.1, 's', 'after walking off an edge, the ground jump is still there this long'),
    P('variable_jump', 'switch', false, '', 'a jump is as high as JUMP is held: letting go while it rises cuts it, so a tap is a short hop'),
    P('jump_release_keep', 'number', 0.5, '×', 'with variable_jump, how much of the rising speed letting go keeps (1 cuts nothing, 0 stops it dead)')] },
  { group: 'climbing', params: [
    P('climb_enabled', 'switch', true, '', 'climbing walls marked climbable'),
    P('climb_speed', 'number', 4, 'units/s', ''),
    P('climb_auto', 'switch', false, '', 'how a wall is grabbed: off, by holding GRAB (G, or the touch button); on, by pushing into it'),
    P('ledge_grab', 'switch', false, '', 'falling, catch the edge of a higher floor a jump just missed (any side, climbable or not; rising past one goes on by); JUMP pulls up, pushing away drops'),
    P('ledge_reach', 'number', 0.5, 'units', 'how far above the head a ledge\'s top may be and still be caught')] },
  { group: 'dashing', params: [
    P('max_dashes', 'count', 1, 'dashes', 'before landing again; 0 is no dash'),
    P('dash_speed', 'number', 30, 'units/s', ''),
    P('dash_duration', 'number', 0.12, 's', ''),
    P('dash_cooldown', 'number', 0.45, 's', 'before the next')] },
  { group: 'hovering and flight', params: [
    P('hover_enabled', 'switch', false, '', 'holding hover keeps altitude'),
    P('hover_fuel_max', 'number', 2, 's', 'of hover in a full tank (players start full)'),
    P('hover_drain', 'number', 1, '/s', 'fuel used per second'),
    P('hover_gravity_scale', 'number', 0.04, '×', 'gravity while hovering'),
    P('hover_vspeed_clamp', 'number', 0.5, 'units/s', 'the fastest it rises or sinks'),
    P('flight_enabled', 'switch', false, '', 'gravity off, the stick and up/down steer in 3D'),
    P('flight_fuel_max', 'number', 3, 's', 'of flight in a full tank'),
    P('flight_drain', 'number', 1, '/s', 'fuel used per second'),
    P('flight_speed', 'number', 12, 'units/s', ''),
    P('shared_fuel', 'switch', false, '', 'hover and flight draw on one tank')] },
  { group: 'the grapple', params: [
    P('grapple_enabled', 'switch', false, '', ''),
    P('grapple_range', 'number', 14, 'units', ''),
    P('swing_damping', 'number', 0.003, '/tick', 'energy lost while swinging'),
    P('pull_speed', 'number', 18, 'units/s', 'reeling in')] },
  { group: 'the bare-handed swing', params: [
    P('attack_enabled', 'switch', true, '', 'whether attack swings at all'),
    P('attack_reach', 'number', 2, 'units', 'how far, from the body\'s surface'),
    P('attack_min_reach', 'number', 0, 'units', 'the inner edge'),
    P('attack_half_arc', 'number', 0.125, 'turns', 'half the horizontal arc'),
    P('attack_sweep_from', 'number', -0.125, 'turns', 'where the sweep starts, from the aim'),
    P('attack_sweep_to', 'number', 0.125, 'turns', 'where it ends'),
    P('attack_half_pitch', 'number', 0, 'turns', 'half the vertical arc; 0 does not check pitch'),
    P('attack_pitch_from', 'number', 0, 'turns', ''),
    P('attack_pitch_to', 'number', 0, 'turns', ''),
    P('attack_ticks', 'count', 16, 'ticks', 'how long the collider is live (60 a second)'),
    P('attack_cooldown', 'count', 0, 'ticks', 'before another swing')] }
]
const BY_NAME = new Map(PLAYER_PARAMS.flatMap((g) => g.params.map((p) => [p.name, p])))
export const paramOf = (name) => BY_NAME.get(name) ?? null
// What `controls fps` sets before the module's lines (PLAYER.md §2).
export const FPS_RULES = Object.freeze({ turn_speed: 1000, move_relative: true })

/** Every movement parameter, flat (what add_effect may name too). */
export function paramNames () { return [...BY_NAME.keys()] }

/** What a parameter is before the module says anything: the engine's, or the control scheme's. */
export function baseValue (module, name) {
  if (module?.controls === 'fps' && name in FPS_RULES) return FPS_RULES[name]
  return paramOf(name)?.def
}

/** A value in module.txt's words: `on`/`off`, a whole count, an exact decimal (never an exponent). */
export function paramText (name, v) {
  const p = paramOf(name)
  if (p?.type === 'switch') return v ? 'on' : 'off'
  if (p?.type === 'count') return String(Math.max(0, Math.min(255, Math.round(Number(v)))))
  const n = Number(Number(v).toFixed(6))
  return (Object.is(n, -0) ? 0 : n).toFixed(6).replace(/\.?0+$/, '')
}

/** A value as the form says it: "8 units/s", "on". */
export const says = (name, v) => { const p = paramOf(name); return p?.type === 'switch' ? (v ? 'on' : 'off') : `${paramText(name, v)}${p?.unit ? ` ${p.unit}` : ''}` }

export function newPlayer () {
  return { prop: null, blend: null, when: {}, body: { ...DEFAULT_BODY }, set: {}, start: { weapons: null }, sounds: {} }
}

// What a player sounds like, and which runtime plays each (docs/SOUNDS.md):
//   jump, land  the player_sounds.lua GAME script -- heard at once by the one
//               jumping (predicted), everybody else hears the server's copy;
//               `fall` is how fast a landing must be to make a sound;
//   pain, death the mob runtime, in each level (mobs.player_sounds);
//   pickup.*    the weapons runtime, when something is taken (weapons.pickup_sounds).
export const PLAYER_SOUNDS = [
  { key: 'jump', label: 'jumping', runtime: 'game' },
  { key: 'land', label: 'landing hard', runtime: 'game' },
  { key: 'pain', label: 'hurt', runtime: 'mobs' },
  { key: 'death', label: 'dying', runtime: 'mobs' }
]
export const PICKUP_SOUNDS = ['weapon', 'ammo', 'health', 'armour']
const DEFAULT_FALL = 12

/** Does the module give the player any jump or landing sound (and so need player_sounds.lua)? */
export const hasMoveSounds = (module) => !!(module.player?.sounds?.jump || module.player?.sounds?.land)

/** The game-wide file that configures player_sounds.lua; null when there is nothing to say. */
export function emitPlayerSoundsLua (module) {
  const s = module.player?.sounds ?? {}
  if (!hasMoveSounds(module)) return null
  const q = (v) => (v ? JSON.stringify(v) : 'nil')
  return ['-- >>> level editor: player sounds', '--',
    '-- What the player sounds like jumping and landing (engine/maps/scripts/player_sounds.lua,',
    '-- a game script loaded before this one). Set at load, before anybody arrives.',
    '--',
    'if player_sounds ~= nil then',
    `  player_sounds.jump = ${q(s.jump)}`,
    `  player_sounds.land = ${q(s.land)}`,
    `  player_sounds.fall = fx.int(${Math.round(s.fall ?? DEFAULT_FALL)})`,
    'end',
    '-- <<< level editor: player sounds', ''].join('\n')
}

/** The level-side part: pain and death, through the mob runtime. Null when unset. */
export function emitPlayerHurtLua (module) {
  const s = module.player?.sounds ?? {}
  if (!s.pain && !s.death) return null
  const q = (v) => (v ? JSON.stringify(v) : 'nil')
  return ['-- >>> level editor: player hurt sounds',
    `if mobs ~= nil then mobs.player_sounds = { pain = ${q(s.pain)}, death = ${q(s.death)} } end`,
    '-- <<< level editor: player hurt sounds', ''].join('\n')
}

/** weapons.pickup_sounds, for the arsenal's file; null when unset. */
export function emitPickupSoundsLua (module) {
  const p = module.player?.sounds?.pickup ?? {}
  const set = PICKUP_SOUNDS.filter((k) => p[k])
  if (!set.length) return null
  return `weapons.pickup_sounds = { ${set.map((k) => `${k} = ${JSON.stringify(p[k])}`).join(', ')} }\n`
}

/** A modifier that modifies something. */
const live = (m) => m && (m.mul !== undefined || m.add !== undefined)

/**
 * What one map's player actually is: the module's, with the map's override
 * laid over it part by part.
 *
 *   body     the map's own if it has one, else the module's; a document
 *            written before the size belonged to the module keeps its own
 *            until migratePlayer has run, so an old map bakes unchanged
 *   set      per parameter: the map's value, else the module's -- only what
 *            is said; the rest is the engine's (baseValue)
 *
 * No weapons: they are game-wide, and travel with the player.
 */
export function playerFor (module, doc) {
  const p = module?.player ?? {}
  const ov = doc?.playerOverride ?? {}
  return {
    body: ov.body ?? p.body ?? doc?.body ?? DEFAULT_BODY,
    set: { ...(p.set ?? {}), ...(ov.set ?? {}) }
  }
}

/** What a map overrides, by name: 'size', 'moves'. */
export function overrides (doc) {
  const ov = doc?.playerOverride ?? {}
  const out = []
  if (ov.body) out.push('size')
  if (Object.keys(ov.set ?? {}).length) out.push('moves')
  return out
}

/**
 * The module.txt `player` lines (docs/PLAYER.md §1): the module's, then each
 * map's own under its name, parameters in the table's order. The server
 * builds a player on arrival from the engine's defaults, the control scheme,
 * these module-wide lines, the map's own body, then the map's lines.
 */
export function playerLines (module, docs = []) {
  const out = []
  const lines = (set, pre) => {
    for (const name of paramNames()) if (set && name in set) out.push(`player ${pre}${name} ${paramText(name, set[name])}`)
  }
  lines(module?.player?.set, '')
  for (const d of docs) lines(d.playerOverride?.set, `${d.name} `)
  return out
}

/** What the server would refuse: a name it lacks, a value not of the parameter's type. */
export function playerProblems (module, docs = []) {
  const out = []
  const look = (set, where) => {
    for (const [name, v] of Object.entries(set ?? {})) {
      const p = paramOf(name)
      if (!p) { out.push(`${where}: no movement parameter called ${name}`); continue }
      if (p.type === 'switch' && typeof v !== 'boolean') out.push(`${where}: ${name} is on or off`)
      if (p.type === 'count' && !(Number.isInteger(v) && v >= 0 && v <= 255)) out.push(`${where}: ${name} is a whole number 0..255`)
      if (p.type === 'number' && !Number.isFinite(v)) out.push(`${where}: ${name} is a number`)
    }
  }
  look(module?.player?.set, 'the player')
  for (const d of docs) look(d.playerOverride?.set, `${d.name}'s player`)
  return out
}

/**
 * Modifiers (`moves: { name: { mul, add } }`, from when movement went through
 * the effect stack) as the values they came to: the engine's (or the
 * scheme's) value, multiplied and added to. An override entry that modified
 * nothing turned the module's modifier off on that map, so it becomes the
 * plain value.
 */
function movesToSet (moves, module, set) {
  for (const [name, m] of Object.entries(moves ?? {})) {
    const p = paramOf(name)
    if (!p) continue
    const base = Number(baseValue(module, name))
    const v = live(m) ? base * (m.mul ?? 1) + (m.add ?? 0) : base
    set[name] = p.type === 'switch' ? v > 0 : p.type === 'count' ? Math.max(0, Math.min(255, Math.round(v))) : Number(v.toFixed(4))
  }
}

/**
 * Bring maps written when the size was the map's into the module.
 *
 * The module takes the size most of its maps already have; a map with a
 * different one keeps it as its override. Nothing changes size, so nothing
 * changes hash -- which matters, because a soundtrack is keyed by it.
 *
 * @returns whether anything moved
 */
export function migratePlayer (module, docs) {
  // A per-map starting kit, from before the weapons ran game-wide: there is
  // nothing for it to mean now, since the player arrives holding what they
  // held in the last map.
  let moved = false
  if (module.player && 'moves' in module.player) {
    const set = (module.player.set ??= {})
    movesToSet(module.player.moves, module, set)
    delete module.player.moves
    moved = true
  }
  for (const d of Object.values(docs)) {
    const ov = d.playerOverride
    if (ov && 'moves' in ov) {
      if (Object.keys(ov.moves ?? {}).length) movesToSet(ov.moves, module, (ov.set ??= {}))
      delete ov.moves
      if (!Object.keys(ov).length) delete d.playerOverride
      moved = true
    }
  }
  for (const d of Object.values(docs)) {
    if (d.playerOverride && 'weapons' in d.playerOverride) {
      delete d.playerOverride.weapons
      if (!Object.keys(d.playerOverride).length) delete d.playerOverride
      moved = true
    }
  }
  const old = Object.values(docs).filter((d) => d.body)
  if (!old.length) return moved
  const p = (module.player ??= newPlayer())
  if (!p.body) {
    const count = new Map()
    for (const d of old) {
      const k = `${d.body.radius}x${d.body.height}`
      count.set(k, (count.get(k) ?? { n: 0, body: d.body }))
      count.get(k).n++
    }
    const best = [...count.values()].sort((x, y) => y.n - x.n)[0]
    p.body = { radius: best.body.radius, height: best.body.height }
  }
  for (const d of old) {
    if (d.body.radius !== p.body.radius || d.body.height !== p.body.height) {
      d.playerOverride ??= {}
      d.playerOverride.body ??= { radius: d.body.radius, height: d.body.height }
    }
    delete d.body
  }
  return true
}

// --- the forms ------------------------------------------------------------------------

/**
 * Whose player the window is editing: the module's, or this map's override.
 *
 * Shown on the size, moves and kit tabs, and the choice is remembered for the
 * session. In "this map" each part is inherited until it is switched to its
 * own, and says what it would inherit, so an override is never a mystery copy.
 */
export function scopeRows (S, ctx) {
  const scope = S.playerScope ?? 'module'
  const pick = (v) => el('button', { icon: v === 'module' ? 'action.scopegame' : 'action.scopemap', text: v === 'module' ? 'every map' : `only ${S.docName}`, 'data-on': scope === v ? '1' : '0',
    'data-scope': v, onclick: () => { S.playerScope = v; ctx.render() } })
  const own = overrides(S.doc)
  return [
    el('div', { class: 'wk-tabs st-scope' }, [pick('module'), pick('map')]),
    muted(scope === 'module'
      ? `Every map of the module uses these${own.length ? ` — except where ${S.docName} overrides its ${own.join(', ')}` : ''}.`
      : `${S.docName} follows the module except for what is switched to its own below.`)
  ]
}

const mapScope = (S) => (S.playerScope ?? 'module') === 'map'
const ovOf = (S) => (S.doc.playerOverride ??= {})
/** Drop an override that no longer overrides anything, so the document says nothing it does not mean. */
function tidy (doc) {
  const ov = doc.playerOverride
  if (!ov) return
  if (ov.set && !Object.keys(ov.set).length) delete ov.set
  if (!Object.keys(ov).length) delete doc.playerOverride
}

/** How big the player is -- written into every map's .map, and in its hash. */
export function bodyRows (S, ctx) {
  const p = (S.module.player ??= newPlayer())
  p.body ??= { ...DEFAULT_BODY }
  const rows = scopeRows(S, ctx)
  const fields = (b, done) => [
    number('radius', b.radius, { min: 0.1, max: 4, step: 0.0625 }, (v) => { b.radius = v; done() }),
    number('height', b.height, { min: 0.25, max: 8, step: 0.0625 }, (v) => { b.height = v; done() })
  ]
  if (!mapScope(S)) {
    rows.push(...fields(p.body, ctx.changed))
    rows.push(muted("Part of each map's content hash: a client whose player is a different size from the server's has a different map, so changing it re-bakes every map that does not have its own."))
    return rows
  }
  const ov = S.doc.playerOverride
  rows.push(toggle(`own size on ${S.docName}`, !!ov?.body, (v) => {
    if (v) ovOf(S).body = { ...p.body }
    else { delete ov.body; tidy(S.doc) }
    ctx.commit()
  }))
  if (ov?.body) rows.push(...fields(ov.body, ctx.commit))
  else rows.push(muted(`Follows the module: ${p.body.radius} × ${p.body.height}.`))
  return rows
}

/** The input for one parameter's value, by its type. */
function valueField (p, v, done) {
  if (p.type === 'switch') return toggle(p.unit || 'on', !!v, (x) => done(x))
  if (p.type === 'count') return number(p.unit || 'count', v, { min: 0, max: 255, step: 1 }, (x) => done(Math.max(0, Math.min(255, Math.round(x)))))
  const step = Math.abs(p.def) >= 10 ? 1 : Math.abs(p.def) >= 1 ? 0.25 : Math.abs(p.def) >= 0.1 || p.def === 0 ? 0.005 : 0.001
  return number(p.unit || 'value', v, { step }, (x) => done(x))
}

/** What the player moves like: the module.txt `player` lines (docs/PLAYER.md). */
export function moveRows (S, ctx) {
  const p = (S.module.player ??= newPlayer())
  p.set ??= {}
  const map = mapScope(S)
  const fps = S.module.controls === 'fps'
  const rows = [...scopeRows(S, ctx),
    muted(`How the player moves, written into module.txt as \`player\` lines the server builds each player from as they arrive. What is not set is the engine's${fps ? ', or what first-person controls set (turn_speed 1000, move_relative on)' : ''}. Scripts, weapons and effects build on these.`)]
  for (const g of PLAYER_PARAMS) {
    rows.push(el('div', { class: 'st-section-head' }, withIcon('action.expand', `${g.group}`)))
    for (const prm of g.params) {
      const { name } = prm
      const base = baseValue(S.module, name)
      const from = fps && name in FPS_RULES ? 'first-person controls' : 'the engine'
      const head = el('div', { class: 'st-muted', text: prm.about })
      if (!map) {
        const on = name in p.set
        rows.push(el('div', { class: 'st-card', 'data-param': name }, [
          toggle(name, on, (v) => { if (v) p.set[name] = base; else delete p.set[name]; ctx.changed() }),
          ...(prm.about ? [head] : []),
          on ? valueField(prm, p.set[name], (v) => { p.set[name] = v; ctx.changed() }) : muted(`${from}'s: ${says(name, base)}`)
        ]))
        continue
      }
      // This map: inherited until switched to its own.
      const ov = S.doc.playerOverride?.set
      const mine = !!ov && name in ov
      const inherited = name in p.set ? p.set[name] : base
      rows.push(el('div', { class: 'st-card', 'data-param': name }, [
        toggle(`${name} — own here`, mine, (v) => {
          if (v) { const o = ovOf(S); o.set ??= {}; o.set[name] = inherited }
          else { delete ov[name]; tidy(S.doc) }
          ctx.commit()
        }),
        ...(prm.about ? [head] : []),
        mine ? valueField(prm, ov[name], (v) => { ov[name] = v; ctx.commit() })
             : muted(`follows the module: ${says(name, inherited)}${name in p.set ? '' : ` (${from}'s)`}`)
      ]))
    }
  }
  return rows
}

/** What the player sounds like: every sound picked from the module's packs, with a ▶. */
export function soundRows (S, ctx) {
  const p = (S.module.player ??= newPlayer())
  const s = (p.sounds ??= {})
  const field = (label, get, set) => (S.soundField ? S.soundField(label, get(), (v) => { set(v || undefined); ctx.changed() })
    : row(label, el('input', { type: 'text', value: get() ?? '', onchange: (e) => { set(e.target.value || undefined); ctx.changed() } })))
  const rows = [muted('Picked from the module\'s sound packs (Sounds). A sound left at (none) is silence.')]
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.moves', 'moving')))
  for (const k of ['jump', 'land']) rows.push(field(PLAYER_SOUNDS.find((x) => x.key === k).label, () => s[k], (v) => { if (v) s[k] = v; else delete s[k] }))
  rows.push(number('a hard landing is faster than (units/s)', s.fall ?? DEFAULT_FALL, { min: 1, max: 60, step: 1 }, (v) => { if (Math.round(v) === DEFAULT_FALL) delete s.fall; else s.fall = Math.round(v); ctx.changed() }))
  rows.push(muted('Heard at once by the one jumping -- their own client plays it -- and a moment later by everybody else. An ordinary jump comes down at about 9 units a second.'))
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.hurt', 'hurt')))
  for (const k of ['pain', 'death']) rows.push(field(PLAYER_SOUNDS.find((x) => x.key === k).label, () => s[k], (v) => { if (v) s[k] = v; else delete s[k] }))
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.arsenal', 'taking a pickup')))
  for (const k of PICKUP_SOUNDS) {
    rows.push(field(`a${k === 'ammo' || k === 'armour' ? 'n' : ''} ${k} pickup`, () => s.pickup?.[k], (v) => {
      s.pickup ??= {}
      if (v) s.pickup[k] = v; else delete s.pickup[k]
      if (!Object.keys(s.pickup).length) delete s.pickup
    }))
  }
  rows.push(muted('A pickup with a sound of its own (Weapons → arsenal) plays that instead. Pickups need the arsenal: with no weapons they are silent.'))
  return rows
}

/** What the player starts with: the ceilings, the pools' initial amounts, the weapons in hand. */
export function kitRows (S, ctx) {
  const a = S.module.weapons
  const p = (S.module.player ??= newPlayer())
  const map = mapScope(S)
  const rows = scopeRows(S, ctx)
  if (!a || !S.vocab.weapon) return [...rows, muted('No arsenal yet. Make a weapon in the Player & weapons window and the kit appears here.')]
  if (!map) {
    a.health ??= { max: 100, bonus_max: 200 }
    rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.health', 'health')))
    rows.push(number('max', a.health.max ?? 100, { min: 1, max: 9999, step: 5 }, (v) => { a.health.max = Math.round(v); ctx.changed() }))
    rows.push(number('bonus max', a.health.bonus_max ?? 200, { min: 1, max: 9999, step: 5 }, (v) => { a.health.bonus_max = Math.round(v); ctx.changed() }))
    rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.ammo', 'ammunition carried at the start')))
    const pools = Object.entries(a.ammo ?? {})
    if (!pools.length) rows.push(muted('No pools yet.'))
    for (const [name, pool] of pools) {
      rows.push(number(name, pool.initial ?? 0, { min: 0, max: pool.max ?? 999, step: 1 }, (v) => { pool.initial = Math.round(v); ctx.changed() }))
    }
  } else {
    const w = p.start?.weapons
    rows.push(muted(`The kit is the module's, on every map: health, starting ammunition, and in hand ${Array.isArray(w) ? (w.join(', ') || 'nothing') : 'the lowest `order` weapon'}. ` +
      'The weapons run once for the whole game, so a player arrives in a map holding what they held in the last one.'))
    return rows
  }
  rows.push(el('div', { class: 'st-section-head' }, withIcon('section.weapons', 'weapons in hand')))
  const names = Object.keys(a.weapons ?? {})
  if (!names.length) rows.push(muted('No weapons yet.'))
  const holder = { get: () => p.start?.weapons, set: (v) => { p.start ??= {}; p.start.weapons = v } }
  const done = ctx.changed
  const chosen = holder.get()
  rows.push(toggle('choose them', Array.isArray(chosen), (v) => { holder.set(v ? names.slice(0, 1) : null); done() }))
  if (Array.isArray(chosen)) {
    for (const n of names) {
      rows.push(toggle(n, chosen.includes(n), (v) => {
        const set = new Set(holder.get())
        v ? set.add(n) : set.delete(n)
        holder.set([...set])
        done()
      }))
    }
  }
  rows.push(muted(Array.isArray(chosen)
    ? 'Named, so the player starts holding exactly these.'
    : "Not named, so the player starts with the lowest `order` weapon -- the one that always works, and which cannot be empty."))
  return rows
}
