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
//   MOVEMENT is the engine's. `set_body_param` refuses a player outright --
//   "a player's body comes from the catalogue and their session" -- so what
//   this writes is a modifier through the EFFECT STACK, the vocabulary's own
//   `mul` and `add`, applied to each player as they arrive. It goes in the
//   MAP's Lua, already resolved, so a map with an override carries one set of
//   modifiers rather than the module's plus a correction on top;
//
//   the KIT is the arsenal's, and module-wide: the weapons run ONCE for the
//   whole game (a module.txt `game` line), so what a player holds follows them
//   from map to map and a map has no starting kit of its own to override.
//
import { el, row, number, select, toggle, muted, button, card } from './ui.js'
import { DEFAULT_BODY } from './doc.js'

// The movement parameters worth offering, grouped as somebody thinks about
// them. MIRRORS core/include/dnp/physics/params_table.hpp, which is normative;
// studio/test/player.test.js reads that header and fails if a name here is not
// in it, so the copy cannot rot silently.
export const MOVE_PARAMS = [
  { group: 'walking', names: ['move_speed', 'ground_accel', 'air_accel', 'friction', 'turn_speed'] },
  { group: 'jumping', names: ['jump_impulse', 'max_jumps', 'gravity_scale'] },
  { group: 'dashing', names: ['dash_speed', 'dash_duration', 'dash_cooldown', 'max_dashes'] },
  { group: 'climbing and flight', names: ['climb_enabled', 'climb_speed', 'hover_enabled', 'hover_fuel_max', 'flight_enabled', 'flight_speed'] },
  { group: 'the grapple', names: ['grapple_enabled', 'grapple_range', 'swing_damping', 'pull_speed'] }
]

/** Every name the window offers, flat. */
export function paramNames () { return MOVE_PARAMS.flatMap((g) => g.names) }

export function newPlayer () {
  return { prop: null, blend: null, when: {}, body: { ...DEFAULT_BODY }, moves: {}, start: { weapons: null }, sounds: {} }
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
 *   moves    per parameter: the map's entry replaces the module's, and an
 *            entry with neither `mul` nor `add` means "not modified here"
 *
 * No weapons: they are game-wide, and travel with the player.
 */
export function playerFor (module, doc) {
  const p = module?.player ?? {}
  const ov = doc?.playerOverride ?? {}
  const moves = { ...(p.moves ?? {}), ...(ov.moves ?? {}) }
  for (const [n, m] of Object.entries(moves)) if (!live(m)) delete moves[n]
  return {
    body: ov.body ?? p.body ?? doc?.body ?? DEFAULT_BODY,
    moves
  }
}

/** What a map overrides, by name: 'size', 'moves'. */
export function overrides (doc) {
  const ov = doc?.playerOverride ?? {}
  const out = []
  if (ov.body) out.push('size')
  if (Object.keys(ov.moves ?? {}).length) out.push('moves')
  return out
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

/**
 * The player's half of one map's Lua, resolved for that map: the movement
 * modifiers. (What they hold is the game's -- emitGameLua in module_emit.js.)
 *
 * An `on_tick` that applies each arriving player's modifiers once. A hook
 * rather than a spawn event because a level gets no spawn event, and the
 * weapon runtime tracks arrivals the same way.
 *
 * It CHAINS whatever `on_tick` the map's own Lua defined above it: hooks are
 * harvested per chunk, so within the map's file a second definition would
 * silently replace the first.
 */
export function emitPlayerLua (module, doc = null) {
  const moves = Object.entries(playerFor(module, doc).moves)
  if (!moves.length) return null
  const L = ['-- >>> level editor: player', '--',
             '-- How each player moves on this map. The modifiers go through the EFFECT',
             "-- STACK because `set_body_param` refuses a player: their body comes from",
             '-- the catalogue and their session, and a script rewriting it would change',
             '-- physics the client predicts with no epoch to notice it by.',
             '--',
             'do',
             '  local applied = {}',
             '  local before = on_tick',
             '  function on_tick(...)',
             '    if before ~= nil then before(...) end',
             '    for _, e in ipairs(dnp.players()) do',
             '      local i = e:index()',
             '      if i ~= nil and not applied[i] then',
             '        applied[i] = true']
  for (const [name, m] of moves) {
    // Tagged, so a second application replaces rather than stacks -- an
    // arrival counted twice would otherwise double the modifier.
    if (m.mul !== undefined) L.push(`        e:add_effect("${name}", "mul", ${luaFx(m.mul)}, nil, "studio_player")`)
    if (m.add !== undefined) L.push(`        e:add_effect("${name}", "add", ${luaFx(m.add)}, nil, "studio_player")`)
  }
  L.push('      end', '    end', '  end', 'end', '-- <<< level editor: player')
  return L.join('\n') + '\n'
}

/** A number as the runtime takes one: whole, an exact decimal, or a fraction pair. */
function luaFx (v) {
  if (Array.isArray(v)) return `fx.frac(${Math.round(v[0])}, ${Math.round(v[1])})`
  if (Number.isInteger(Number(v))) return `fx.int(${Math.round(Number(v))})`
  return `fx.parse("${v}")`
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
  const pick = (v) => el('button', { text: v === 'module' ? '🌐 every map' : `🗺 only ${S.docName}`, 'data-on': scope === v ? '1' : '0',
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
  if (ov.moves && !Object.keys(ov.moves).length) delete ov.moves
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

/** What the player moves like: modifiers on the engine's own numbers. */
export function moveRows (S, ctx) {
  const p = (S.module.player ??= newPlayer())
  p.moves ??= {}
  const map = mapScope(S)
  const rows = [...scopeRows(S, ctx),
    muted('The engine owns a player\'s body and a script may not rewrite it. What it can do is modify it, which is what these are — a multiplier, an addition, or both, applied to each player as they arrive.')]
  const says = (m) => !live(m) ? 'unmodified' : [m.mul !== undefined ? `× ${m.mul}` : null, m.add ? `+ ${m.add}` : null].filter(Boolean).join(' ') || '× 1'
  const fields = (m, done) => [
    number('× multiply', m.mul ?? 1, { min: 0, max: 16, step: 0.05 }, (v) => { m.mul = v; done() }),
    number('+ add', m.add ?? 0, { min: -64, max: 64, step: 0.25 }, (v) => { if (v) m.add = v; else delete m.add; done() })
  ]
  for (const g of MOVE_PARAMS) {
    rows.push(el('div', { class: 'st-section-head', text: `▸ ${g.group}` }))
    for (const name of g.names) {
      const m = p.moves[name] ?? {}
      const on = live(m)
      if (!map) {
        rows.push(el('div', { class: 'st-card' }, [
          toggle(name, on, (v) => {
            if (v) p.moves[name] = { mul: 1 }
            else delete p.moves[name]
            ctx.changed()
          }),
          ...(on ? fields(m, ctx.changed) : [])
        ]))
        continue
      }
      // This map: inherited until switched to its own. Its own may be
      // "unmodified", which is how a map turns off something the module does.
      const ov = S.doc.playerOverride?.moves
      const mine = ov && name in ov ? ov[name] : null
      rows.push(el('div', { class: 'st-card', 'data-param': name }, [
        toggle(`${name} — own here`, !!mine, (v) => {
          if (v) { const o = ovOf(S); o.moves ??= {}; o.moves[name] = on ? { ...m } : { mul: 1 } }
          else { delete ov[name]; tidy(S.doc) }
          ctx.commit()
        }),
        ...(mine ? [toggle('modified', live(mine), (v) => { if (v) mine.mul = 1; else { delete mine.mul; delete mine.add } ctx.commit() }),
                    ...(live(mine) ? fields(mine, ctx.commit) : [])]
                 : [muted(`follows the module: ${says(m)}`)])
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
  rows.push(el('div', { class: 'st-section-head', text: '🏃 moving' }))
  for (const k of ['jump', 'land']) rows.push(field(PLAYER_SOUNDS.find((x) => x.key === k).label, () => s[k], (v) => { if (v) s[k] = v; else delete s[k] }))
  rows.push(number('a hard landing is faster than (units/s)', s.fall ?? DEFAULT_FALL, { min: 1, max: 60, step: 1 }, (v) => { if (Math.round(v) === DEFAULT_FALL) delete s.fall; else s.fall = Math.round(v); ctx.changed() }))
  rows.push(muted('Heard at once by the one jumping -- their own client plays it -- and a moment later by everybody else. An ordinary jump comes down at about 9 units a second.'))
  rows.push(el('div', { class: 'st-section-head', text: '💥 hurt' }))
  for (const k of ['pain', 'death']) rows.push(field(PLAYER_SOUNDS.find((x) => x.key === k).label, () => s[k], (v) => { if (v) s[k] = v; else delete s[k] }))
  rows.push(el('div', { class: 'st-section-head', text: '🎒 taking a pickup' }))
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
    rows.push(el('div', { class: 'st-section-head', text: '❤ health' }))
    rows.push(number('max', a.health.max ?? 100, { min: 1, max: 9999, step: 5 }, (v) => { a.health.max = Math.round(v); ctx.changed() }))
    rows.push(number('bonus max', a.health.bonus_max ?? 200, { min: 1, max: 9999, step: 5 }, (v) => { a.health.bonus_max = Math.round(v); ctx.changed() }))
    rows.push(el('div', { class: 'st-section-head', text: '🔢 ammunition carried at the start' }))
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
  rows.push(el('div', { class: 'st-section-head', text: '🔫 weapons in hand' }))
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
