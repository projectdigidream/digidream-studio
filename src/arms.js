//
// The player's half: which record draws them, and what they carry.
//
// A PLAYER IS NOT A PROP KIND. They are kind 0 on the wire and kind 0 is
// structurally "no prop" in both readers, so the art is an ordinary catalogue
// record and only its ADDRESSING is special -- an `avatar <id>` line naming
// it (assets/props.txt). That is why the player's body is chosen from the
// module's props here rather than being a thing of its own.
//
// The weapon forms are generated from maps/scripts/weapon_vocab.json, exactly
// as the monster forms are generated from the mob vocabulary, so a field the
// runtime grows appears here with no change.
//
import { el, row, number, text, select, button, chips, muted, card, toggle, ask, confirmDialog, withIcon, icon } from './ui.js'
import { argFields } from './argform.js'
import { newPlayer } from './player.js'
import { CONDITIONS, defaultStates } from '/src/render/animstate.js'
import { artRows, STATE_NAMES, sheetAnims } from './brain.js'
import { nextPropId } from './props_emit.js'
import { guessStates } from './sheets.js'

// A body of the player's own, never a monster's: a prop named `player` (or
// player2 ...), drawn with the first sheet, its states guessed from the
// sheet's animation names as a monster's are.
function newPlayerBody (S, from = null) {
  const module = S.module
  module.props ??= []
  const taken = new Set(module.props.map((p) => p.name))
  let name = 'player'
  for (let i = 2; taken.has(name); i++) name = `player${i}`
  const sheet = from?.art?.sheet ?? Object.keys(module.sprites ?? {})[0] ?? ''
  const art = from?.art ? JSON.parse(JSON.stringify(from.art))
    : { kind: 'atlas', sheet, states: sheet ? guessStates(sheetAnims(S, sheet)) : { 0: 'idle', 1: 'walk', 2: 'attack', 3: 'pain', 4: 'death' } }
  const base = from ? JSON.parse(JSON.stringify(from)) : { radius: 0.35, height: module.sprites?.[sheet]?.worldHeight ?? 1, solid: true }
  module.props.push({ ...base, id: nextPropId(module), name, art })
  return name
}

/** Which record draws the player, and which state each animation condition picks. */
export function avatarRows (S, ctx) {
  const module = S.module
  const props = (module.props ?? []).map((p) => p.name)
  const player = module.player
  const rows = [
    row('drawn by', chips([
      ...props.map((n) => ({ id: n, label: n, on: player?.prop === n })),
      { id: '', label: '(nothing yet)', on: !player?.prop },
      { id: '+', label: '+ a body of its own' }
    ], (it) => {
      // Only the picture changes: the player's size, moves, kit and sounds stay.
      const prop = it.id === '+' ? newPlayerBody(S) : it.id || null
      module.player = { ...(player ?? newPlayer()), prop }
      ctx.changed()
    })),
    muted('Any prop of this module can draw the player, or one of its own: its sheet and the animation each of its five states plays are set below, and the conditions under them pick between the states. No monster is needed.')
  ]
  if (!player?.prop) return rows
  // The same prop drawing a monster too: its states are that monster's as well.
  const art = (module.props ?? []).find((p) => p.name === player.prop)
  if (art && module.mobs?.mobs?.[art.name]) {
    rows.push(el('div', { class: 'st-warn-box', 'data-shared-body': art.name }, [
      el('div', { text: `${art.name} also draws the monster ${art.name}: a state changed here changes the monster's too.` }),
      button('give the player a body of its own (a copy)', () => { module.player = { ...player, prop: newPlayerBody(S, art) }; ctx.changed() })
    ]))
  }
  // How big the player is DRAWN -- the prop's own drawing scale, as any prop's
  // (assets/props.txt `scale`). How big they are to the world -- what they
  // bump into, what fits through a door -- is the Size tab's.
  if (art) {
    rows.push(number('drawn at (scale)', art.scale ?? 1, { min: 0.1, max: 10, step: 0.05 }, (v) => {
      if (v > 0 && v !== 1) art.scale = v; else delete art.scale
      S.sprites?.forget?.(art.name)
      ctx.changed()
    }))
    rows.push(muted(`The picture's scale: ${art.name} is drawn ${(art.scale ?? 1)} times its sheet's size. It changes nothing the game simulates -- the player's body for collision is in the Size tab.`))
  }
  // The player's STATES: which sheet, and which animation each state plays --
  // its prop's, edited here (a monster's Body tab edits a monster's).
  if (art) {
    rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.skin', 'its states: which animation each plays')))
    // The states its conditions pick (a number above 4 is a state of its own).
    const uses = new Map()
    for (const [cond, n] of Object.entries(player.when ?? {})) { if (!uses.has(n)) uses.set(n, []); uses.get(n).push(cond) }
    rows.push(...artRows(S, art, () => { S.sprites?.forget?.(art.name); ctx.changed() }, { fitHeight: false, uses, usedBy: 'when' }).filter(Boolean))
  }
  rows.push(number('cross-fade (s)', player.blend ?? 0, { min: 0, max: 1, step: 0.02 }, (v) => { player.blend = v > 0 ? v : null; ctx.changed() }))
  rows.push(muted('Zero is a hard cut, which is what hand-drawn frames want: a dissolve between two of them is a double exposure that reads as a renderer fault.'))
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.preview', 'which state draws which condition')))
  const defaults = defaultStates()
  const anims = sheetAnims(S, art?.art?.sheet)
  for (const cond of CONDITIONS) {
    const cur = player.when?.[cond]
    rows.push(number(`${cond}${cur === undefined ? ` (${defaults[cond]}${STATE_NAMES[defaults[cond]] ? ` · ${STATE_NAMES[defaults[cond]]}` : ''})` : ''}`, cur ?? defaults[cond], { min: 0, max: 31, step: 1 }, (v) => {
      player.when ??= {}
      if (Math.round(v) === defaults[cond]) delete player.when[cond]
      else player.when[cond] = Math.round(v)
      ctx.changed()
    }))
  }
  rows.push(muted(`The conditions are the engine's closed list, most specific first: the first that holds wins, which is why attacking while walking is an attack. A number in brackets is the default and is not written.${anims.length ? ` This sheet draws ${anims.join(', ')}.` : ''}`))
  return rows
}

/** One weapon's own fields -- everything that is not its phases or its swing. */
export function weaponRows (S, name, w, ctx) {
  const V = S.vocab.weapon
  if (!V) return [muted('No weapon vocabulary staged with this studio.')]
  return [
    ...argFields(V.weapon_fields, w, ctx, ['phases', 'swing', 'vars', 'gives', 'predict']),
    ...predictRows(S, w, ctx),
    el('div', { class: 'st-section-head' }, withIcon('workshop.arsenal', 'what its own pickup grants')),
    ...ammoAmountRows(S, w.gives ?? (w.gives = {}), ctx),
    muted('Doom\'s shotgun arrives with eight shells. Granted every time the pickup is walked over, not only the first.')
  ]
}

// When the player's OWN client plays a sound for this weapon (weapon_vocab's
// `predict`). The values of `on` are the field doc's closed list.
const PREDICT_ON = ['primary', 'primary_held', 'secondary', 'secondary_held', 'swing']

/**
 * What the player hears at once on their own shot, rather than a round trip
 * later: a list of { on, sound, every }. The phase's own sound for the same
 * shot should then be `predicted`, so their client drops the server's copy.
 */
function predictRows (S, w, ctx) {
  const rows = [el('div', { class: 'st-section-head' }, withIcon('workshop.sounds', 'heard at once by the one firing'))]
  const changed = () => { if (w.predict && !w.predict.length) delete w.predict; ctx.onChange() }
  ;(w.predict ?? []).forEach((p, i) => {
    rows.push(el('div', { class: 'st-card' }, [
      select('on', p.on ?? 'primary', PREDICT_ON, (v) => { p.on = v; changed() }),
      ...argFields([{ name: 'sound', type: 'string' }], p, { ...ctx, onChange: changed }),
      /_held$/.test(p.on ?? '') ? number('every (ticks)', p.every ?? 4, { min: 1, max: 600, step: 1 }, (v) => { p.every = Math.round(v); changed() }) : null,
      button(withIcon('action.close'), () => { w.predict.splice(i, 1); changed() }, 'st-danger')
    ].filter(Boolean)))
  })
  rows.push(button('+ predicted sound', () => { (w.predict ??= []).push({ on: 'primary', sound: '' }); changed() }))
  rows.push(muted("`_held` repeats while the button is down (a chaingun); `swing` is the swept collider starting. Mark the phase's own `sound` for the same shot as predicted, so this player does not hear it twice."))
  return rows
}

/** A {pool = n} table, as a row per declared pool. */
function ammoAmountRows (S, table, ctx) {
  const pools = Object.keys(S.module.weapons?.ammo ?? {})
  if (!pools.length) return [muted('No ammunition pools yet; make one in the arsenal.')]
  return pools.map((pool) => number(pool, table[pool] ?? 0, { min: 0, max: 999, step: 1 }, (v) => {
    if (v > 0) table[pool] = Math.round(v); else delete table[pool]
    ctx.changed()
  }))
}

// The arsenal's fields in plain words (the vocabulary's names are the file's).
const AMMO_WORDS = { label: 'Name on the panel', max: 'Most a player holds', initial: 'Starts with', order: 'Place on the panel' }
const HEALTH_WORDS = { max: 'Most health', bonus_max: 'Most with bonuses' }
const PICKUP_WORDS = { weapon: 'Gives the weapon', heal: 'Heals', ceiling: 'Heals up to', armour: 'Sets armour to', sound: 'Sound when taken', not_yet: 'Not working yet (says)' }

/** The pools, the health ceilings and the pickups: everything the arsenal has that is not a weapon. */
export function arsenalRows (S, ctx) {
  const V = S.vocab.weapon
  const a = S.module.weapons
  if (!V || !a) return [muted('No weapon vocabulary staged with this studio.')]
  const rows = [el('div', { class: 'st-section-head' }, withIcon('workshop.ammo', 'ammunition'))]
  const say = (words) => ({ ...ctx, words })
  for (const [name, pool] of Object.entries(a.ammo ?? {})) {
    rows.push(card(name, [
      ...argFields(V.ammo_fields, pool, say(AMMO_WORDS)),
      button('delete pool', async () => {
        if (!await confirmDialog(`delete the ${name} pool? Weapons that eat it will name a pool that is gone.`)) return
        delete a.ammo[name]; ctx.changed()
      }, 'st-danger')
    ]))
  }
  rows.push(button('+ ammunition pool', async () => {
    const raw = await ask('pool name (letters, digits, underscore)', 'cells')
    const n = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!n || a.ammo[n]) { if (raw) S.status('that name is empty or taken', 'warn'); return }
    const orders = Object.values(a.ammo).map((p) => p.order ?? 0)
    a.ammo[n] = { label: n.charAt(0).toUpperCase() + n.slice(1), max: 200, initial: 0, order: orders.length ? Math.max(...orders) + 1 : 1 }
    ctx.changed()
  }))
  rows.push(muted('The panel lists the pools by their place on it: a pool with no place can be carried, counted and capped, but is never shown.'))

  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.health', 'health')))
  a.health ??= { max: 100, bonus_max: 200 }
  rows.push(...argFields(V.health_fields, a.health, say(HEALTH_WORDS)))

  rows.push(el('div', { class: 'st-section-head' }, withIcon('section.props', 'pickups')))
  for (const [name, p] of Object.entries(a.pickups ?? {})) {
    rows.push(card(name, [
      ...argFields(V.pickup_fields, p, say(PICKUP_WORDS), ['ammo'], 'pickup'),
      el('div', { class: 'st-muted', text: 'ammunition it grants' }),
      ...ammoAmountRows(S, p.ammo ?? (p.ammo = {}), ctx),
      button('delete pickup', () => { delete a.pickups[name]; ctx.changed() }, 'st-danger')
    ]))
  }
  // BY WHAT IT GIVES: every new pickup healed 25, an ammunition clip too.
  const pool = Object.keys(a.ammo ?? {})[0]
  const newPickup = (kind, suggested, fields) => button(withIcon('action.add', `${kind} pickup`), async () => {
    const raw = await ask('pickup name (letters, digits, underscore)', suggested)
    const n = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!n || a.pickups[n]) { if (raw) S.status('that name is empty or taken', 'warn'); return }
    a.pickups[n] = fields
    ctx.changed()
  })
  rows.push(el('div', { class: 'st-row' }, [
    newPickup('health', 'medkit', { heal: 25, ceiling: 'max' }),
    pool ? newPickup('ammunition', `${pool}_box`, { ammo: { [pool]: 10 } }) : null,
    newPickup('armour', 'armour', { armour: 100 })
  ].filter(Boolean)))
  rows.push(muted('A pickup is a prop in the level with the same name: walking over it gives this. "Not working yet" keeps one that does nothing so far, and says so when it is walked over.'))
  return rows
}
