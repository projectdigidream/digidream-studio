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

/** Which record draws the player, and which state each animation condition picks. */
export function avatarRows (S, ctx) {
  const module = S.module
  const props = (module.props ?? []).map((p) => p.name)
  const player = module.player
  const rows = [
    row('drawn by', chips([
      ...props.map((n) => ({ id: n, label: n, on: player?.prop === n })),
      { id: '', label: '(nothing yet)', on: !player }
    ], (it) => {
      // Only the picture changes: the player's size, moves, kit and sounds stay.
      module.player = { ...(player ?? newPlayer()), prop: it.id || null }
      ctx.changed()
    })),
    muted('Any prop of this module can draw the player. Give it the five states a body has and the conditions below pick between them.')
  ]
  if (!player?.prop) return rows
  // How big the player is DRAWN -- the prop's own drawing scale, as any prop's
  // (assets/props.txt `scale`). How big they are to the world -- what they
  // bump into, what fits through a door -- is the Size tab's.
  const art = (module.props ?? []).find((p) => p.name === player.prop)
  if (art) {
    rows.push(number('drawn at (scale)', art.scale ?? 1, { min: 0.1, max: 10, step: 0.05 }, (v) => {
      if (v > 0 && v !== 1) art.scale = v; else delete art.scale
      S.sprites?.forget?.(art.name)
      ctx.changed()
    }))
    rows.push(muted(`The picture's scale: ${art.name} is drawn ${(art.scale ?? 1)} times its sheet's size. It changes nothing the game simulates -- the player's body for collision is in the Size tab.`))
  }
  rows.push(number('cross-fade (s)', player.blend ?? 0, { min: 0, max: 1, step: 0.02 }, (v) => { player.blend = v > 0 ? v : null; ctx.changed() }))
  rows.push(muted('Zero is a hard cut, which is what hand-drawn frames want: a dissolve between two of them is a double exposure that reads as a renderer fault.'))
  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.preview', 'which state draws which condition')))
  const defaults = defaultStates()
  const anims = module.sprites?.[(module.props ?? []).find((p) => p.name === player.prop)?.art?.sheet]?.animations ?? []
  for (const cond of CONDITIONS) {
    const cur = player.when?.[cond]
    rows.push(number(`${cond}${cur === undefined ? ` (${defaults[cond]})` : ''}`, cur ?? defaults[cond], { min: 0, max: 31, step: 1 }, (v) => {
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

/** The pools, the health ceilings and the pickups: everything the arsenal has that is not a weapon. */
export function arsenalRows (S, ctx) {
  const V = S.vocab.weapon
  const a = S.module.weapons
  if (!V || !a) return [muted('No weapon vocabulary staged with this studio.')]
  const rows = [el('div', { class: 'st-section-head' }, withIcon('workshop.ammo', 'ammunition'))]
  for (const [name, pool] of Object.entries(a.ammo ?? {})) {
    rows.push(card(name, [
      ...argFields(V.ammo_fields, pool, ctx),
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
  rows.push(muted('The panel\'s read-out list is generated from `order`, so a pool with none can be carried, counted and capped and never appear on screen.'))

  rows.push(el('div', { class: 'st-section-head' }, withIcon('workshop.health', 'health')))
  a.health ??= { max: 100, bonus_max: 200 }
  rows.push(...argFields(V.health_fields, a.health, ctx))

  rows.push(el('div', { class: 'st-section-head' }, withIcon('section.props', 'pickups')))
  for (const [name, p] of Object.entries(a.pickups ?? {})) {
    rows.push(card(name, [
      ...argFields(V.pickup_fields, p, ctx, ['ammo'], 'pickup'),
      el('div', { class: 'st-muted', text: 'ammunition it grants' }),
      ...ammoAmountRows(S, p.ammo ?? (p.ammo = {}), ctx),
      button('delete pickup', () => { delete a.pickups[name]; ctx.changed() }, 'st-danger')
    ]))
  }
  rows.push(button('+ pickup', async () => {
    const raw = await ask('pickup name (letters, digits, underscore)', 'medkit')
    const n = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!n || a.pickups[n]) { if (raw) S.status('that name is empty or taken', 'warn'); return }
    a.pickups[n] = { heal: 25, ceiling: 'normal' }
    ctx.changed()
  }))
  rows.push(muted('A pickup is named by a prop in the level: walking over the prop grants this. `not_yet` declares one that does nothing yet and says so by name.'))
  return rows
}
