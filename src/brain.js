//
// Monsters: the forms. A body, a brain, its vars, its states and the
// module's missiles, each as rows of controls that write straight into the
// module document -- the same JSON mobs.load{} will be given (docs/MOBS.md).
// Every field, condition and action comes from maps/scripts/mob_vocab.json.
//
// The workshop (workshop.js) composes these into its windows; nothing here
// knows about a window.
//
import { tidySwings } from './swings_emit.js'
import { el, row, text, toggle, select, button, chips, card, muted, number, ask, withIcon, icon } from './ui.js'
import { nextPropId } from './props_emit.js'
import { argFields } from './argform.js'
import { painLength } from './mobs_emit.js'
import { guessStates } from './sheets.js'

export const DEFAULT_BRAIN = () => ({
  hp: 30, turn_speed: 12, sight: '40', pain_chance: 128, infighting: true, corpse: true,
  initial: 'look',
  vars: { ready: 0 },
  states: {
    look: { anim: 0, move: 'stop', face: 'hold', transitions: [{ to: 'chase', when: [{ cond: 'has_target' }, { cond: 'target_visible' }] }] },
    chase: { anim: 1, move: 'chase', face: 'target', interruptible: true,
             transitions: [{ to: 'look', when: [{ cond: 'has_target', negate: true }] },
                           { to: 'attack', when: [{ cond: 'target_within', distance: '1.5' }, { cond: 'target_visible' }, { cond: 'cooldown_ready', var: 'ready' }] }] },
    attack: { anim: 2, move: 'stop', face: 'target', ticks: 20, next: 'chase', interruptible: true,
              sequence: [{ at: 0, action: 'face' }, { at: 10, action: 'melee', damage: 8, range: '1.5' }, { at: 10, action: 'set_cooldown', var: 'ready', ticks: 60 }] },
    pain: { anim: 3, move: 'stop', face: 'hold', ticks: 10, next: 'chase' },
    death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' }
  }
})

export const STATE_NAMES = ['idle', 'walk', 'attack', 'pain', 'death']

/** A monster with a working brain and a body drawn with the first imported sheet. Returns its name, or null. */
export function newMonster (S, raw) {
  const module = S.module
  module.mobs ??= { missiles: {}, mobs: {} }
  module.props ??= []
  const name = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!name || module.mobs.mobs[name]) return null
  module.mobs.mobs[name] = DEFAULT_BRAIN()
  const sheets = Object.keys(module.sprites ?? {})
  const sheet = sheets[0] ?? ''
  const states = sheet ? guessStates(module.sprites[sheet].animations) : { 0: 'idle', 1: 'walk', 2: 'attack', 3: 'pain', 4: 'death' }
  module.props.push({ id: nextPropId(module), name, radius: 0.35, height: module.sprites?.[sheet]?.worldHeight ?? 1, speed: 4, solid: true,
                      art: { kind: 'atlas', sheet, states } })
  return name
}

export function deleteMonster (S, name) {
  const module = S.module
  delete module.mobs.mobs[name]
  module.props = (module.props ?? []).filter((p) => p.name !== name)
  if (module.layouts) delete module.layouts[name]
  // Its look in the game goes with it (swings_emit.js).
  if (module.swings?.monsters) { delete module.swings.monsters[name]; tidySwings(module) }
}

/** The body: size, speed, and which sheet draws it in which states. */
export function bodyRows (S, prop, changed) {
  const module = S.module
  if (!prop) return [muted('No body record; the catalogue will not know this monster.')]
  const setSheet = (name) => {
    const anims = module.sprites?.[name]?.animations
    prop.art = { kind: 'atlas', sheet: name, states: anims?.length ? guessStates(anims) : (prop.art?.states ?? {}) }
    if (module.sprites?.[name]?.worldHeight) prop.height = module.sprites[name].worldHeight
    changed()
  }
  const sheet = prop.art?.kind === 'atlas' && module.sprites?.[prop.art.sheet] ? prop.art.sheet : null
  return [
    number('radius', prop.radius, { min: 0.1, max: 4, step: 0.05 }, (v) => { prop.radius = v; changed() }),
    number('height', prop.height, { min: 0.1, max: 8, step: 0.05 }, (v) => { prop.height = v; changed() }),
    // The picture's size is the sheet's, not the body's: every monster drawn
    // with the sheet grows with it, and the preview's ruler shows it.
    sheet ? number('sprite height', module.sprites[sheet].worldHeight, { min: 0.1, max: 8, step: 0.05 }, (v) => { S.setSheetHeight(sheet, v).then(changed) }) : null,
    number('scale', prop.scale ?? 1, { min: 0.1, max: 8, step: 0.05 }, (v) => { prop.scale = v; changed() }),
    sheet ? muted('height is what the body collides as. sprite height is how tall the sheet is drawn, for everything that uses it; scale multiplies that for this body alone.') : muted('scale multiplies how big the picture is drawn; the body it collides as stays height and radius.'),
    number('speed', prop.speed ?? 0, { min: 0, max: 30, step: 0.1 }, (v) => { prop.speed = v; changed() }),
    toggle('solid', !!prop.solid, (v) => { prop.solid = v; changed() }),
    row('sprite sheet', chips([
      ...Object.keys(module.sprites ?? {}).map((n) => ({ id: n, label: n, on: prop.art?.sheet === n })),
      { id: '+', label: '+ import sheet…' }
    ], async (it) => {
      if (it.id === '+') { const name = await S.importSheet?.(); if (name) setSheet(name); else changed(); return }
      setSheet(it.id)
    })),
    prop.art?.sheet && !module.sprites?.[prop.art.sheet] ? text('sheet name', prop.art.sheet, (v) => setSheet(v.toUpperCase().slice(0, 24)), { placeholder: 'a sheet the catalogue serves' }) : null,
    ...[0, 1, 2, 3, 4].map((st) => {
      const anims = module.sprites?.[prop.art?.sheet]?.animations
      const label = `state ${st} · ${STATE_NAMES[st]}`
      const set = (v) => { prop.art ??= { kind: 'atlas', sheet: '', states: {} }; prop.art.states[st] = v.trim(); changed() }
      return anims?.length
        ? select(label, prop.art?.states?.[st] ?? '', [['', '(choose)'], ...anims], set)
        : text(label, prop.art?.states?.[st] ?? '', set, { placeholder: 'animation name' })
    }),
    muted(`Prop id ${prop.id}. The numbers are what a state's \`anim\` names.`)
  ]
}

/** The brain's own fields (not its states). */
export function brainRows (S, m, ctx) {
  const states = Object.keys(m.states ?? {})
  return [
    select('initial state', m.initial ?? '', [['', '(choose)'], ...states], (v) => { m.initial = v || undefined; ctx.onChange() }),
    ...argFields(S.vocab.mob.mob_fields, m, ctx, ['states', 'vars', 'prop', 'initial', 'drops']),
    ...painRows(S, m, ctx),
    ...dropsRows(S, m, ctx)
  ]
}

function painRows (S, m, ctx) {
  const V = S.vocab.mob
  if (!V.pain_time_fields) return []
  const pain = m.states?.pain
  const rows = [el('div', { class: 'st-section-head' }, withIcon('workshop.flinch', 'the flinch'))]
  if (!pain) {
    rows.push(muted('No state called "pain": this monster never flinches. Add one (with ticks and a next) and pain_chance decides how often it does.'))
    if (m.pain_time) rows.push(el('div', { class: 'st-danger', text: 'pain_time is set and there is no pain state for it to lengthen.' }))
    return rows
  }
  rows.push(toggle('a bigger hit, a longer flinch', !!m.pain_time, (v) => {
    if (v) m.pain_time = { per_damage: '0.5', max: Math.max(40, (pain.ticks ?? 10) * 3) }
    else delete m.pain_time
    ctx.onChange()
  }))
  if (m.pain_time) rows.push(...argFields(V.pain_time_fields, m.pain_time, ctx))
  const say = (d) => `${painLength(m, d)}`
  rows.push(muted(pain.ticks === undefined
    ? 'The pain state has no ticks, so its length is not the flinch\'s to change.'
    : `A flinch lasts ${pain.ticks} ticks (60 a second)${m.pain_time ? `; a 10-point hit ${say(10)}, a 50-point ${say(50)}, a 100-point ${say(100)}` : ', whatever the hit'}. A graph can change the base while the game runs: set_var pain_ticks.`))
  return rows
}

/**
 * What the monster leaves where it dies (mob_vocab's `drops`): a list of
 * entries, each an item placed every time, or ONE of weighted choices -- a
 * choice with no item is nothing, which is how a drop is made a chance.
 * The fields come from the vocabulary (drop_fields, drop_choice_fields).
 */
export function dropsRows (S, m, ctx) {
  const V = S.vocab.mob
  if (!V.drop_fields) return []
  const changed = () => { if (m.drops && !m.drops.length) delete m.drops; ctx.onChange() }
  const rows = [el('div', { class: 'st-section-head' }, withIcon('workshop.drops', 'drops'))]
  ;(m.drops ?? []).forEach((d, i) => {
    const body = [...argFields(V.drop_fields, d, { ...ctx, onChange: changed }, ['one_of'])]
    if (d.one_of) {
      body.push(muted('one of these, by weight:'))
      d.one_of.forEach((c, j) => {
        body.push(el('div', { class: 'st-card' }, [
          ...argFields(V.drop_choice_fields ?? [], c, { ...ctx, onChange: changed }),
          button(withIcon('action.close', 'choice'), () => { d.one_of.splice(j, 1); if (!d.one_of.length) delete d.one_of; changed() })
        ]))
      })
      const total = d.one_of.reduce((n, c) => n + (c.weight ?? 0), 0)
      const none = d.one_of.filter((c) => !c.item).reduce((n, c) => n + (c.weight ?? 0), 0)
      if (total > 0) body.push(muted(`Something drops ${Math.round(100 * (total - none) / total)}% of the time.`))
    }
    body.push(el('div', { class: 'st-row' }, [
      button('+ weighted choice', () => { delete d.item; (d.one_of ??= []).push({ weight: 1 }); changed() }),
      button(withIcon('action.close', 'drop'), () => { m.drops.splice(i, 1); changed() }, 'st-danger')
    ]))
    rows.push(el('div', { class: 'st-card' }, body))
  })
  rows.push(button('+ drop', () => { (m.drops ??= []).push({ item: S.propNames?.()[0] }); changed() }))
  rows.push(muted('An item is a catalogue name. Several of one are spread round the body; a choice with no item is nothing.'))
  return rows
}

export function varsRows (m, changed) {
  return [
    chips(Object.keys(m.vars ?? {}).map((v) => ({ id: v, label: `${v} = ${m.vars[v]}` })), async (it) => {
      const v = await ask(`initial value of ${it.id} (empty to remove)`, String(m.vars[it.id]))
      if (v === null) return
      if (v === '') delete m.vars[it.id]; else m.vars[it.id] = Math.round(Number(v)) || 0
      changed()
    }),
    button('+ var', async () => { const n = await ask('var name', 'ready'); if (n) { (m.vars ??= {})[n.replace(/[^a-z0-9_]/gi, '')] = 0; changed() } })
  ]
}

/**
 * One node of a graph: its fields, its transitions with their conditions, and
 * its sequence.
 *
 * A monster's state and a weapon's phase are the same shape (see graph.js), so
 * this takes the vocabulary to read rather than assuming the mob's -- which is
 * the whole of what it took to make one editor serve both.
 */
export function stateRows (S, m, sname, st, ctx, changed, { onPickTarget = null, vocab: V = null, nodes = 'states', skip = [], negate = true, newWhen = () => [] } = {}) {
  const spec = V ?? {
    fields: S.vocab.mob.state_fields,
    conditions: S.vocab.mob.conditions,
    actions: S.vocab.mob.actions,
    conditionSpec: (n) => S.vocab.mobConditions.get(n),
    actionSpec: (n) => S.vocab.mobActions.get(n)
  }
  const states = Object.keys(m[nodes] ?? {})
  const rows = [...argFields(spec.fields, st, ctx, ['sequence', 'transitions', ...skip])]
  rows.push(el('div', { class: 'st-section-head st-if' }, withIcon('trigger.if', 'go to … when all of …')))
  ;(st.transitions ?? []).forEach((tr, i) => {
    const trRows = [el('div', { class: 'st-row' }, [
      select('to', tr.to ?? '', [['', '(choose)'], ...states], (v) => { tr.to = v; changed() }).lastChild,
      button(withIcon('action.close'), () => { st.transitions.splice(i, 1); changed() })
    ])]
    ;(tr.when ?? []).forEach((c, j) => {
      const cspec = spec.conditionSpec(c.cond)
      trRows.push(el('div', { class: 'st-row' }, [
        el('span', { class: 'st-entry', text: c.cond }),
        // Only a monster's conditions can be turned round; a weapon has its opposites (has_ammo / no_ammo).
        ...(negate || c.negate ? [toggle('', !!c.negate, (v) => { c.negate = v || undefined; changed() }).lastChild, muted('not')] : []),
        button(withIcon('action.close'), () => { tr.when.splice(j, 1); changed() })
      ]))
      if (cspec) trRows.push(...argFields(cspec.args ?? [], c, ctx, ['fn']))
    })
    trRows.push(select('add when', '', [['', '…'], ...spec.conditions.map((c) => [c.name, c.name])],
                       (v) => { if (v) { (tr.when ??= []).push({ cond: v }); changed() } }))
    rows.push(el('div', { class: 'st-card', 'data-transition': String(i) }, trRows))
  })
  rows.push(el('div', { class: 'st-row' }, [
    button('+ transition', () => { (st.transitions ??= []).push({ to: states[0], when: newWhen() }); changed() }),
    onPickTarget ? button(withIcon('action.link', 'tap a target state'), onPickTarget) : null
  ]))
  rows.push(el('div', { class: 'st-section-head st-then' }, withIcon('transport.play', 'at tick … do …')))
  ;(st.sequence ?? []).forEach((step, i) => {
    const aspec = spec.actionSpec(step.action)
    const stRows = [el('div', { class: 'st-row' }, [
      number('at', step.at ?? 0, { min: 0, max: 600, step: 1 }, (v) => { step.at = Math.round(v); changed() }).lastChild,
      el('span', { class: 'st-entry', text: step.action }),
      button(withIcon('action.close'), () => { st.sequence.splice(i, 1); changed() })
    ])]
    if (aspec) stRows.push(...argFields(aspec.args ?? [], step, ctx, ['fn'], step.action))
    rows.push(el('div', { class: 'st-card' }, stRows))
  })
  rows.push(select('add step', '', [['', '…'], ...spec.actions.map((a) => [a.name, a.name])],
                   (v) => { if (v) { (st.sequence ??= []).push({ at: 0, action: v }); changed() } }))
  return rows
}

export function missilesSection (S, changed) {
  const module = S.module
  const vocab = S.vocab
  const missiles = module.mobs.missiles
  const rows = []
  for (const [name, ms] of Object.entries(missiles)) {
    const ctx = { onChange: () => changed(), status: (t, l) => S.status(t, l), missiles: Object.keys(missiles), mobs: Object.keys(module.mobs.mobs), props: S.propNames?.() ?? [] }
    const r = [...argFields(vocab.mob.missile_fields, ms, ctx, ['on_hit', 'on_expire'])]
    for (const list of ['on_hit', 'on_expire']) {
      r.push(el('div', { class: 'st-muted', text: list }))
      ;(ms[list] ?? []).forEach((act, i) => {
        const spec = vocab.mobActions.get(act.action)
        r.push(el('div', { class: 'st-card' }, [
          el('div', { class: 'st-row' }, [el('span', { class: 'st-entry', text: act.action }), button(withIcon('action.close'), () => { ms[list].splice(i, 1); changed() })]),
          ...(spec ? argFields(spec.args ?? [], act, ctx, ['fn'], act.action) : [])
        ]))
      })
      r.push(select(`add ${list}`, '', [['', '…'], ...vocab.mob.actions.map((a) => [a.name, a.name])],
                    (v) => { if (v) { (ms[list] ??= []).push({ action: v }); changed() } }))
    }
    r.push(button('delete missile', () => { delete missiles[name]; changed() }, 'st-danger'))
    rows.push(card(`Missile: ${name}`, r))
  }
  rows.push(button('+ missile', async () => {
    const n = await ask('missile name', 'fireball')
    if (!n) return
    const name = n.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!name || missiles[name]) return
    missiles[name] = { speed: '8', gravity: 0, life: 300, z_offset: '0.5', anim_fly: 0, anim_burst: 1, burst_ticks: 20, on_hit: [{ action: 'damage', amount: 10 }] }
    changed()
  }))
  return rows
}
