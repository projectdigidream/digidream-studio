//
// The monster editor and the weapon editor: one window, two sets of bindings.
//
// A monster's brain and a weapon are the same machine -- named nodes with
// `ticks`, `next`, a `sequence` of steps and `transitions` checked in order --
// so one editor serves both, as the workshop did; KINDS says what differs.
// The words and their units are phrases.js, the editor's own words (phases,
// rules for any state, end branches) are compiled by brainc.js, and the
// preview runs the compiled brain by the engine's rules (brainsim.js).
//
// Tabs: Overview (its numbers), Behaviour (its states, as a list of sentences
// or as a graph, beside an editor of the one picked and the preview), Attacks,
// Looks, Advanced.
//
import { el, button, ask, confirmDialog } from '../ui.js'
import { MOB_CONDITIONS, MOB_ACTIONS, WEAPON_CONDITIONS, WEAPON_ACTIONS, sentence, shortOf, secs, ticksOf, fxNum, fxOf, condKey, unphrased } from '../phrases.js'
import { compileMob, compileWeapon } from '../brainc.js'
import { nextPropId } from '../props_emit.js'
import { guessStates } from '../sheets.js'
import { newArsenal } from '../weapons_emit.js'
import { injectCss, sentenceEl, ruleCards, stepsBlock, numField, checkField, selectField, chooser, toast, trackFocus, restoreFocus } from './common.js'
import { Preview, Sheets } from './preview.js'
import { board } from './board.js'
import { MOB_RECIPES, WEAPON_RECIPES, RECIPE_MISSILE, bindAnims, animName } from './recipes.js'
import { giveMissileLook, giveWeaponLook } from '../placeholders.js'
import { markerNames } from '../markers.js'
// The workshop's forms for what is not behaviour, kept as they were: a brain's
// own fields, its body states, a swept swing and how it is drawn, a weapon's
// prediction (brain.js, swing.js, slashform.js, arms.js).
import { brainRows, bodyRows } from '../brain.js'
import { swingRows, newSwing, SwingPreview } from '../swing.js'
import { slashRows } from '../slashform.js'
import { weaponRows } from '../arms.js'

const toName = (v) => String(v ?? '').toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
const nameProblem = (n) => (!n ? 'Type a name first.' : !/^[a-z]/.test(n) ? 'A name starts with a letter.' : n.length > 24 ? 'A name is at most 24 letters long.' : '')
const clone = (x) => JSON.parse(JSON.stringify(x))
const phoneNow = () => typeof matchMedia === 'function' && matchMedia('(max-height:560px) and (orientation:landscape), (max-width:700px)').matches

const MOVE = { stop: 'stands still', chase: 'runs at the target', charge: 'charges straight ahead', flee: 'backs away', strafe: 'circles the target', wander: 'wanders', free: 'is moved by its steps' }
const FACE = { target: 'the target', movement: 'where it walks', hold: 'where it was' }

const KINDS = {
  mob: {
    word: 'monster', node: 'state', title: 'Monsters', conds: MOB_CONDITIONS, acts: MOB_ACTIONS,
    home: (S) => (S.module.mobs ??= { missiles: {}, mobs: {} }).mobs,
    nodes: (b) => (b.states ??= {}),
    compile: (S, b, name) => compileMob(b, propOf(S, name, b)),
    tabs: [['overview', 'Overview'], ['behaviour', 'Behaviour'], ['attacks', 'Attacks'], ['look', 'Looks'], ['advanced', 'Advanced']]
  },
  weapon: {
    word: 'weapon', node: 'state', title: 'Weapons', conds: WEAPON_CONDITIONS, acts: WEAPON_ACTIONS,
    home: (S) => (S.module.weapons ??= newArsenal()).weapons,
    nodes: (w) => (w.phases ??= {}),
    compile: (S, w) => compileWeapon(w),
    tabs: [['overview', 'Overview'], ['behaviour', 'Behaviour'], ['attacks', 'Attacks'], ['look', 'Looks'], ['arsenal', 'Arsenal'], ['advanced', 'Advanced']]
  }
}

function propOf (S, name, brain) {
  const want = brain?.prop ?? name
  return (S.module.props ?? []).find((p) => p.name === want) ?? null
}

// Advanced's fields in plain words (the vocabulary's names are the file's).
const MOB_WORDS = { hp: 'Health', sight: 'Notices a target within (m)', pain_chance: 'Flinch chance (of 256)', pain_time: 'Flinch length', turn_speed: 'Turns a second', jump_height: 'Hops up (m)', flying: 'Flies', hover_z: 'Hovers above the target (m)', infighting: 'Fights back at monsters', blood: 'Blood (particle kind)', corpse: 'Leaves a corpse', mass: 'Weight' }
const WEAPON_WORDS = { label: 'Name', order: 'Selection order', ammo: 'Uses ammunition', per: 'A shot costs (ammo)', initial: 'Starts in', icon: 'Icon on the panel', aim_snap: 'Aim directions (0 = free)' }

export class NodeEditor {
  constructor (S, kind) {
    this.S = S
    this.kind = kind
    this.K = KINDS[kind]
    injectCss()
    this.root = el('div', { class: 'me', 'data-kind': kind })
    trackFocus(this.root)
    this.sheets = new Sheets(S)
    this.name = null
    this.tab = 'behaviour'
    this.view = 'list'
    this.sel = null           // a state's name, or null
    this.step = null          // index into the selected state's sequence
    this.picking = null       // { list: 'rules'|'ends'|'any', i }
    this.pickAct = false
    this.newState = null      // the name being typed, or null
    this.screen = 'detail'    // 'gallery' picks another
    this.pvOpen = !phoneNow()
    this.anyOpen = !phoneNow()
    this.menu = false
    this.boardView = { x: 10, y: 10, z: 1, fit: true }
    this.scroll = {}
    this.newName = ''
    this.preview = null
    this.swingPreview = new SwingPreview(() => S.skin)
  }

  // ---- the document ----
  get home () { return this.K.home(this.S) }
  get thing () { return this.name ? this.home[this.name] : null }
  get nodes () { return this.thing ? this.K.nodes(this.thing) : {} }
  get prop () { return this.kind === 'mob' ? propOf(this.S, this.name, this.thing) : null }
  get initial () { return this.thing?.initial ?? Object.keys(this.nodes)[0] }
  get phone () { return phoneNow() }

  open (name = null) {
    const names = Object.keys(this.home)
    this.name = name && this.home[name] ? name : (this.name && this.home[this.name] ? this.name : names[0] ?? null)
    if (!this.name) this.screen = 'gallery'
    this.root.hidden = false
    this.makePreview()
    this.render()
  }

  close () { this.root.hidden = true; this.preview?.stop(); this.swingPreview.stop() }

  changed () {
    this.S.moduleChanged()
    this.preview?.rebuild()
    this.render()
  }

  say (msg, level = 'ok') { this.S.status(msg, level); toast(this.root, msg, level) }

  makePreview () {
    this.preview?.stop()
    if (!this.thing) { this.preview = null; return }
    this.preview = new Preview(this.S, {
      kind: this.kind,
      sheets: this.sheets,
      subject: () => (!this.thing ? null : {
        compiled: this.K.compile(this.S, this.thing, this.name),
        prop: this.prop, initial: this.initial,
        missiles: this.S.module.mobs?.missiles ?? {},
        flying: !!this.thing.flying, hover: fxNum(this.thing.hover_z) ?? 2,
        ammo: this.kind === 'weapon' ? (this.thing.ammo ? 50 : null) : undefined
      }),
      animOf: (st) => this.animOf(this.nodes[st]?.anim),
      view: () => (this.kind === 'weapon' ? this.S.module.viewmodels?.weapons?.[this.name] ?? null : null),
      onState: () => this.markRunning()
    })
    this.preview.start()
    this.preview.pause()
  }

  /** The animation a body-state number plays (its sheet's name for it). */
  animOf (n) {
    if (this.kind !== 'mob') return n === undefined ? 'its resting picture' : `picture ${n}`
    return animName(this.prop?.art, n) ?? (n === undefined ? '' : `state ${n}`)
  }
  sheetAnims () { return this.prop?.art?.sheet ? this.sheets.animations(this.prop.art.sheet) : [] }
  /** The number a state must hold to play animation `name` (adding a body state past the five when needed). */
  animNumber (name) {
    const art = (this.prop.art ??= { kind: 'atlas', sheet: '', states: {} })
    const tmp = { states: { x: { anim: name } } }
    bindAnims(tmp, art, this.sheetAnims())
    return tmp.states.x.anim
  }

  // ---- ctx for sentences ----
  ctx () {
    const S = this.S
    const vars = new Set(Object.keys(this.thing?.vars ?? {}))
    for (const st of Object.values(this.nodes)) {
      for (const t of st.transitions ?? []) for (const c of t.when ?? []) if (c.var) vars.add(c.var)
      for (const p of st.sequence ?? []) if (p.var) vars.add(p.var)
    }
    return {
      vars: [...vars].filter((v) => !v.startsWith('__')),
      mobs: Object.keys(S.module.mobs?.mobs ?? {}),
      states: Object.keys(this.nodes),
      missiles: Object.keys(S.module.mobs?.missiles ?? {}),
      fx: S.vfxChoices?.() ?? [],
      props: S.propNames?.() ?? [],
      moreConds: unphrased(this.K.conds, ((this.kind === 'mob' ? S.vocab?.mob : S.vocab?.weapon)?.conditions ?? []).map((c) => c.name)),
      moreActs: unphrased(this.K.acts, ((this.kind === 'mob' ? S.vocab?.mob : S.vocab?.weapon)?.actions ?? []).map((c) => c.name)),
      soundField: S.soundField,
      changed: () => this.changed(),
      condSpec: (n) => (this.kind === 'mob' ? S.vocab?.mobConditions : S.vocab?.weaponConditions)?.get(n),
      actSpec: (n) => (this.kind === 'mob' ? S.vocab?.mobActions : S.vocab?.weaponActions)?.get(n),
      argCtx: { states: Object.keys(this.nodes), vars: [...vars], missiles: Object.keys(S.module.mobs?.missiles ?? {}), mobs: Object.keys(S.module.mobs?.mobs ?? {}), vfxChoices: S.vfxChoices, soundField: S.soundField, suggest: S.suggest }
    }
  }
  /** What the workshop's forms are given (argform.js ctx). */
  formCtx () {
    const S = this.S
    const changed = () => this.changed()
    const names = Object.keys(this.nodes)
    return {
      onChange: changed, changed, status: (t, l) => S.status(t, l),
      states: names, phases: names, vars: Object.keys(this.thing?.vars ?? {}),
      missiles: Object.keys(S.module.mobs?.missiles ?? {}), mobs: Object.keys(S.module.mobs?.mobs ?? {}),
      props: S.propNames?.() ?? [], ammo: Object.keys(S.module.weapons?.ammo ?? {}), weapons: Object.keys(S.module.weapons?.weapons ?? {}),
      vfxChoices: () => S.vfxChoices?.() ?? [], suggest: (n, o) => S.suggest?.(n, o) ?? null, soundField: S.soundField
    }
  }
  /** A swept swing on `owner` (the monster, the weapon, or one weapon state), with its moving picture. */
  swingSection (owner, whose) {
    const V = this.kind === 'weapon' ? this.S.vocab.weapon : this.S.vocab.mob
    if (!owner.swing) return [el('span', { class: 'me-muted', text: `${whose} has no swing: a swept collider that moves through an arc over several ticks, so a target that steps aside is missed.` }), button('+ swing', () => { owner.swing = newSwing(); this.changed() })]
    return swingRows(V, owner, { ...this.formCtx(), onChange: () => this.changed() }, { radius: this.prop?.radius ?? 0.35, preview: this.swingPreview, onRemove: () => { delete owner.swing; this.changed() } })
  }

  actCtx () {
    const sounds = [...(this.S.soundsByPack?.() ?? new Map()).values()].flat()
    const mobs = Object.keys(this.S.module.mobs?.mobs ?? {})
    return { missile: Object.keys(this.S.module.mobs?.missiles ?? {})[0], sound: sounds.find((n) => n.startsWith(`${this.name}.`)) ?? sounds[0], state: Object.keys(this.nodes)[0], mob: mobs.find((n) => n !== this.name) ?? mobs[0] }
  }

  // ---- render ----
  render () {
    // each pane keeps its own scroll, per tab
    const c = this.root.querySelector('.me-center')
    const ins = this.root.querySelector('.me-ins')
    if (c) this.scroll[`c:${this.tabWas}`] = c.scrollTop
    if (ins) this.scroll[`i:${this.selWas}`] = ins.scrollTop
    this.tabWas = this.tab
    this.selWas = this.sel
    const body = this.screen === 'gallery' || !this.thing ? this.gallery() : this.detail()
    const note = this.root.querySelector(':scope > .me-toast')
    this.root.replaceChildren(...body.filter(Boolean))
    if (note) this.root.appendChild(note)
    restoreFocus(this.root)
    const c2 = this.root.querySelector('.me-center')
    const i2 = this.root.querySelector('.me-ins')
    if (c2) c2.scrollTop = this.scroll[`c:${this.tab}`] ?? 0
    if (i2) i2.scrollTop = this.scroll[`i:${this.sel}`] ?? 0
  }

  top (inner) {
    return el('div', { class: 'me-top' }, inner)
  }

  thumb () {
    const c = el('canvas', { class: 'me-thumb', width: 56, height: 68 })
    const sheet = this.kind === 'mob' ? this.prop?.art?.sheet : null
    if (sheet) {
      // drawn a frame later, so it holds what it was made with: the monster may be gone by then
      const anim = this.animOf(0) ?? this.sheetAnims()[0]
      requestAnimationFrame(() => {
        const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false
        this.sheets.draw(ctx, sheet, anim, 0, 0, 28, 66, 60 / Math.max(1, this.sheets.height(sheet)))
      })
    }
    return c
  }

  gallery () {
    const S = this.S
    const names = Object.keys(this.home)
    const recipes = this.kind === 'mob' ? MOB_RECIPES : WEAPON_RECIPES
    const input = el('input', { type: 'text', placeholder: this.kind === 'mob' ? 'its name, e.g. spitter' : 'its name, e.g. bfg', value: this.newName, 'aria-label': `The new ${this.K.word}'s name` })
    input.addEventListener('input', () => { const n = toName(input.value); if (n !== input.value) { const at = input.selectionStart; input.value = n; input.setSelectionRange(at, at) } this.newName = n })
    return [
      this.top([el('b', { text: this.K.title }), el('span', { class: 'me-muted', text: `in ${S.module.name ?? S.module.id ?? 'this module'}` }), el('span', { class: 'me-grow' }),
        this.thing ? button('back', () => { this.screen = 'detail'; this.render() }) : null]),
      el('div', { class: 'me-center' }, [
        el('div', { class: 'me-panel' }, [el('b', { text: `New ${this.K.word}` }), input,
          el('div', { class: 'me-row' }, Object.entries(recipes).map(([k, r]) => el('button', { title: r.note, text: r.label, onclick: () => this.create(k) })).concat(this.thing ? [button(`Copy of ${this.name}`, () => this.create('copy'))] : []))]),
        el('div', { class: 'me-gal' }, names.map((n) => el('button', { class: 'me-gcard', 'data-on': n === this.name ? '1' : '0', onclick: () => this.switchTo(n) }, [
          el('b', { class: 'me-mono', text: this.home[n].label && this.kind === 'mob' ? this.home[n].label : n }),
          el('span', { class: 'me-muted', text: this.kind === 'mob' ? `${this.home[n].hp ?? '?'} health · ${Object.keys(this.home[n].states ?? {}).length} states` : `slot ${this.home[n].order ?? '?'} · ${Object.keys(this.home[n].phases ?? {}).length} states` })
        ]))),
        el('span', { class: 'me-muted', text: this.kind === 'mob' ? 'Monsters belong to the module; every map can place them.' : 'Weapons belong to the module; the order is the key that selects them.' })
      ])
    ]
  }

  switchTo (n) { this.name = n; this.sel = null; this.step = null; this.picking = null; this.pickAct = false; this.screen = 'detail'; this.makePreview(); this.render() }

  create (how) {
    const S = this.S
    const name = toName(this.newName)
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(name)) { this.say(nameProblem(name), 'warn'); return }
    if (this.home[name]) { this.say(`There is already a ${this.K.word} called ${name}.`, 'warn'); return }
    const missile = () => {
      S.module.mobs ??= { missiles: {}, mobs: {} }
      const have = Object.keys(S.module.mobs.missiles)
      if (have.length) { giveMissileLook(S, have[0]); return have[0] }
      S.module.mobs.missiles.bolt = RECIPE_MISSILE()
      // drawn as a glowing dot of its own: the server fires no missile whose prop is missing
      giveMissileLook(S, 'bolt')
      return 'bolt'
    }
    if (this.kind === 'mob') {
      S.module.props ??= []
      if (how === 'copy') {
        this.home[name] = clone(this.thing)
        delete this.home[name].label
        const src = this.prop
        S.module.props.push({ ...(src ? clone(src) : { radius: 0.35, height: 1, speed: 4, solid: true, art: { kind: 'atlas', sheet: '', states: {} } }), id: nextPropId(S.module), name })
      } else {
        const r = MOB_RECIPES[how]
        const sheets = Object.keys(S.module.sprites ?? {})
        const sheet = sheets[0] ?? ''
        const anims = sheet ? this.sheets.animations(sheet) : []
        const art = { kind: 'atlas', sheet, states: sheet ? guessStates(anims) : { 0: 'idle', 1: 'walk', 2: 'attack', 3: 'pain', 4: 'death' } }
        let kin = Object.keys(this.home).find((n) => n !== name)
        if (how === 'boss' && !kin) {
          kin = `${name}_minion`
          const mb = bindAnims(MOB_RECIPES.grunt.brain(), clone(art), anims)
          this.home[kin] = { hp: 40, pain_chance: 128, sight: '40', turn_speed: 12, infighting: true, corpse: true, ...mb }
          S.module.props.push({ id: nextPropId(S.module), name: kin, radius: 0.35, height: S.module.sprites?.[sheet]?.worldHeight ?? 1, speed: 4, solid: true, art: clone(art) })
        }
        const brain = bindAnims(r.brain(r.missile ? missile() : null, kin), art, anims)
        this.home[name] = { hp: r.hp, pain_chance: brain.pain_chance ?? 140, sight: '40', turn_speed: 12, infighting: true, corpse: true, ...brain }
        S.module.props.push({ id: nextPropId(S.module), name, radius: 0.35, height: S.module.sprites?.[sheet]?.worldHeight ?? 1, speed: r.speed, solid: true, art })
      }
    } else {
      S.module.weapons ??= newArsenal()
      const W = S.module.weapons
      const orders = Object.values(W.weapons).map((x) => x.order ?? 0)
      const order = orders.length ? Math.max(...orders) + 1 : 1
      const label = name.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase())
      if (how === 'copy') this.home[name] = { ...clone(this.thing), label, order }
      else {
        const r = WEAPON_RECIPES[how]
        const pool = Object.keys(W.ammo ?? {})[0]
        this.home[name] = { label, order, initial: 'draw', phases: r.phases(r.missile ? missile() : null), ...(r.per && pool ? { ammo: pool, per: r.per } : {}) }
        // a gun on the screen, at rest and firing, until it has pictures of its own
        giveWeaponLook(S, name, { blade: how === 'blade' })
      }
    }
    this.newName = ''
    this.S.moduleChanged()
    this.switchTo(name)
    this.say(how === 'copy' ? `${name}: a copy.` : `${name}, from the ${(this.kind === 'mob' ? MOB_RECIPES : WEAPON_RECIPES)[how].label} recipe: ${(this.kind === 'mob' ? MOB_RECIPES : WEAPON_RECIPES)[how].note}.`)
  }

  detail () {
    const tabs = el('div', { class: 'me-tabs', role: 'tablist' }, this.K.tabs.map(([id, label]) => el('button', { role: 'tab', 'data-on': this.tab === id ? '1' : '0', 'aria-selected': this.tab === id ? 'true' : 'false', text: label,
      onclick: () => { if (this.tab === id) return; this.tab = id; if (this.phone) { this.sel = null; this.step = null; this.pvOpen = false } this.render() } })))
    const label = this.kind === 'mob' ? (this.thing.label ?? this.name) : this.name
    const top = this.top([
      el('button', { class: 'me-name', 'aria-label': 'Choose another', onclick: () => { this.screen = 'gallery'; this.render() } }, [this.kind === 'mob' ? this.thumb() : null, el('span', { class: 'me-mono', text: label }), el('span', { text: '⌄' })]),
      tabs, el('span', { class: 'me-grow' }),
      this.tab === 'behaviour' ? el('div', { class: 'me-row', role: 'tablist', 'aria-label': 'View' }, [
        el('button', { 'data-on': this.view === 'list' ? '1' : '0', text: 'List', onclick: () => { this.view = 'list'; this.render() } }),
        el('button', { 'data-on': this.view === 'graph' ? '1' : '0', text: 'Graph', onclick: () => { this.view = 'graph'; this.render() } })]) : null,
      el('button', { 'aria-label': `Rename, duplicate or delete the ${this.K.word}`, icon: 'action.more', onclick: () => { this.menu = !this.menu; this.render() } })
    ])
    const menu = this.menu ? el('div', { class: 'me-menu' }, [
      el('button', { text: 'Rename', onclick: () => this.rename() }),
      el('button', { text: 'Duplicate', onclick: () => { this.menu = false; this.newName = `${this.name}_2`; this.create('copy') } }),
      el('button', { class: 'me-lnk danger', text: 'Delete', onclick: () => this.remove() })]) : null
    const center = el('div', { class: 'me-center' }, this.tab === 'behaviour' ? this.behaviour() : this.tab === 'overview' ? this.overview() : this.tab === 'attacks' ? this.attacks() : this.tab === 'look' ? this.looks() : this.tab === 'arsenal' ? this.arsenal() : this.advanced())
    const side = this.side()
    return [top, menu, el('div', { class: 'me-body' }, [center, side])]
  }

  async rename () {
    this.menu = false
    const was = this.kind === 'mob' ? (this.thing.label ?? this.name) : this.thing.label ?? this.name
    const v = await ask(`The ${this.K.word}'s name`, was)
    if (v === null || !v.trim()) { this.render(); return }
    const shownName = v.trim()
    const key = toName(shownName)
    if (this.kind === 'weapon') { this.thing.label = shownName }
    if (key && key !== this.name) {
      if (!/^[a-z][a-z0-9_]{0,23}$/.test(key)) { this.say(nameProblem(key), 'warn'); this.render(); return }
      if (this.home[key]) { this.say(`There is already a ${this.K.word} called ${key}.`, 'warn'); this.render(); return }
      this.home[key] = this.thing
      delete this.home[this.name]
      if (this.kind === 'mob') {
        const p = this.prop
        if (p && p.name === this.name) p.name = key
        // what names it follows: spawns and reviving in every brain, conditions on a kind
        for (const b of Object.values(this.S.module.mobs.mobs)) for (const st of Object.values(b.states ?? {})) {
          for (const s of st.sequence ?? []) if (s.mob === this.name) s.mob = key
          for (const t of st.transitions ?? []) for (const c of t.when ?? []) if (c.mob === this.name) c.mob = key
        }
        for (const m of Object.values(this.S.module.mobs.missiles ?? {})) for (const list of ['on_hit', 'on_expire', 'on_bounce', 'sequence']) for (const s of m[list] ?? []) if (s.mob === this.name) s.mob = key
      }
      this.name = key
    }
    if (this.kind === 'mob') { if (shownName !== key) this.thing.label = shownName; else delete this.thing.label }
    this.changed()
    this.say(`Renamed to ${shownName}${shownName !== key ? ` (the files call it ${key})` : ''}.`)
  }

  async remove () {
    this.menu = false
    if (!(await confirmDialog(`Delete ${this.name}?`))) { this.render(); return }
    delete this.home[this.name]
    if (this.kind === 'mob') this.S.module.props = (this.S.module.props ?? []).filter((p) => p.name !== this.name)
    this.name = null
    this.changed()
    this.open()
  }

  // ---- Behaviour ----
  react (n) { return n === 'death' || n === 'pain' || this.nodes[n]?.next === '@previous' }
  behaviour () {
    const out = []
    out.push(el('div', { class: 'me-row' }, [
      button(`+ ${this.K.node}`, () => { this.newState = this.newState === null ? '' : null; this.render() }),
      this.kind === 'mob' ? button('+ phase', () => this.addPhase()) : null]))
    if (this.newState !== null) {
      const i = el('input', { id: 'me-newstate', type: 'text', placeholder: 'e.g. spit', value: this.newState, 'aria-label': `New ${this.K.node}, named` })
      if (!this.newState) requestAnimationFrame(() => { if (i.isConnected && document.activeElement?.tagName !== 'INPUT') i.focus() })
      i.addEventListener('input', () => { const n = toName(i.value); if (n !== i.value) i.value = n; this.newState = n })
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.createState(i.value); if (e.key === 'Escape') { this.newState = null; this.render() } })
      out.push(el('div', { class: 'me-panel' }, [el('div', { class: 'me-row' }, [el('label', { class: 'me-muted', for: 'me-newstate', text: `New ${this.K.node}, named` }), i,
        el('span', { class: 'me-muted', text: this.sel ? `placed after ${this.sel}` : 'placed at the end' }),
        (this.thing.phases ?? []).length ? (() => {
          const s = el('select', { 'aria-label': 'In phase' }, [el('option', { value: '', text: '(no phase)' }), ...this.thing.phases.map((p) => el('option', { value: p.id, text: p.name }))])
          s.value = this.newPhase ?? this.defaultPhase()
          s.addEventListener('change', () => { this.newPhase = s.value })
          return el('label', { class: 'me-muted' }, ['in ', s])
        })() : null,
        button('Create', () => this.createState(i.value)), el('button', { class: 'me-lnk', text: 'cancel', onclick: () => { this.newState = null; this.render() } })]),
        el('span', { class: 'me-muted', text: `Then give some other ${this.K.node} a rule that goes to it.` })]))
      requestAnimationFrame(() => i.focus())
    }
    out.push(this.anyPanel())
    if (this.view === 'graph') {
      const live = this.live()
      out.push(board({
        nodes: this.nodes, initial: this.initial, phases: this.thing.phases ?? [], any: this.thing.any ?? [], table: this.K.conds, sel: this.sel,
        running: this.preview?.running ? this.preview.sim.state : null, live, word: this.K.node, phone: this.phone, view: this.boardView,
        lineOf: (n, st) => (this.kind === 'mob' ? `${this.animOf(st.anim)} · ${MOVE[st.move ?? 'stop']?.split(' ')[0]}` : `${this.animOf(st.anim)}`),
        pick: (n) => this.select(n), pickRule: (n) => this.select(n), pickAny: () => { this.anyOpen = true; this.render() }
      }))
      return out
    }
    const groups = []
    const phs = this.kind === 'mob' ? (this.thing.phases ?? []) : []
    const names = Object.keys(this.nodes)
    if (phs.length) {
      const rest = names.filter((n) => !this.react(n) && !phs.some((p) => p.id === this.nodes[n].phase))
      if (rest.length) groups.push({ title: 'Not in a phase', ids: rest })
      for (const p of phs) groups.push({ phase: p, ids: names.filter((n) => !this.react(n) && this.nodes[n].phase === p.id) })
      groups.push({ title: 'Reactions', note: 'Entered from any state when something happens to it.', ids: names.filter((n) => this.react(n)) })
    } else if (this.kind === 'mob') {
      groups.push({ title: 'Flow', note: 'Where it begins (the star) and what it does.', ids: names.filter((n) => !this.react(n)) })
      groups.push({ title: 'Reactions', note: 'Entered from any state when something happens to it.', ids: names.filter((n) => this.react(n)) })
    } else groups.push({ title: 'States', note: 'What the weapon does while it is out. The star is where it begins: being drawn.', ids: names })
    // Several phases fold, so the list is not every state twice: open is the
    // one with the state being edited, else the one running, else the first.
    // A folded one keeps its header and names its states.
    const phaseIds = groups.filter((g) => g.phase)
    const holds = (n) => n && phaseIds.some((g) => g.ids.includes(n))
    const run = this.preview?.running ? this.preview.sim.state : null
    const isOpen = (g) => {
      if (phaseIds.length < 2) return true
      const mine = this.phaseOpen?.get(g.phase.id)
      if (mine !== undefined) return mine
      if (holds(this.sel)) return g.ids.includes(this.sel)
      if (holds(run)) return g.ids.includes(run)
      return g === phaseIds[0]
    }
    for (const g of groups) {
      if (g.phase) {
        const open = isOpen(g)
        out.push(this.phaseHead(g.phase, g.ids.length, phaseIds.length < 2 ? null : open))
        if (!open) {
          out.push(el('div', { class: 'me-row me-folded' }, g.ids.map((n) => el('button', { class: 'me-chip', icon: n === this.initial ? 'status.initial' : null, text: n,
            onclick: () => { this.phaseOpen?.delete(g.phase.id); this.select(n) } }))))
          continue
        }
      } else if (g.ids.length) out.push(el('div', { class: 'me-h', text: g.title }), g.note ? el('span', { class: 'me-muted', text: g.note }) : null)
      for (const n of g.ids) out.push(this.card(n))
    }
    return out.filter(Boolean)
  }

  /** `open`: true or false where phases fold, null where they do not (one phase). */
  phaseHead (p, n, open = null) {
    const name = el('input', { class: 'me-phname', value: p.name, 'aria-label': 'Name of this phase' })
    name.addEventListener('change', () => { p.name = name.value.trim() || p.name; this.changed() })
    const sp = el('input', { type: 'text', inputmode: 'decimal', value: p.speed ?? '', placeholder: String(this.prop?.speed ?? 4), 'aria-label': 'How fast it runs in this phase', style: 'width:56px' })
    sp.addEventListener('change', () => { const v = sp.value.trim() === '' ? undefined : Number(sp.value); if (v === undefined || Number.isFinite(v)) { if (v === undefined) delete p.speed; else p.speed = v; this.changed() } })
    // when it starts: the rule for any state that goes into one of its states
    const door = (this.thing.any ?? []).find((r) => r.to && this.nodes[r.to]?.phase === p.id)
    const starts = door ? `starts when ${(door.when ?? []).map((c) => sentence(this.K.conds, c)).join(' and ') || '(no condition yet)'}${door.once ? ', once' : ''}` : (Object.entries(this.nodes).some(([k, st]) => st.phase === p.id && k === this.initial) ? 'where it begins' : 'nothing starts it yet: a rule under "Whatever it is doing"')
    const fold = open === null ? null : el('button', { class: 'me-x', 'aria-label': open ? 'Fold this phase' : 'Unfold this phase', 'aria-expanded': open ? 'true' : 'false', icon: open ? 'action.collapse' : 'action.expand',
      onclick: () => { (this.phaseOpen ??= new Map()).set(p.id, !open); this.render() } })
    return el('div', { class: 'me-row me-phh' }, [fold, name, el('span', { class: 'me-muted', text: `${n} state${n === 1 ? '' : 's'} · ${starts}` }),
      el('label', { class: 'me-muted' }, ['runs at ', sp, ' m/s', p.speed === undefined ? ' (its own speed)' : '']), el('span', { class: 'me-grow' }),
      el('button', { class: 'me-lnk', text: 'duplicate', onclick: () => this.duplicatePhase(p.id) }),
      el('button', { class: 'me-lnk danger', text: 'remove', onclick: () => { this.thing.phases = this.thing.phases.filter((q) => q !== p); for (const st of Object.values(this.nodes)) if (st.phase === p.id) delete st.phase; this.changed(); this.say('Removed the phase; its states stay, outside any phase.') } })])
  }

  card (n) {
    const st = this.nodes[n]
    const isMob = this.kind === 'mob'
    const T = (label, cls, onclick, ic = null) => el('button', { class: `me-tok ${cls ?? ''}`, icon: ic, text: label, onclick })
    const missing = isMob && this.prop?.art?.sheet && !this.sheetAnims().includes(this.animOf(st.anim))
    const line = [el('span', { text: isMob ? 'plays' : 'shows' }), T(missing ? `${this.animOf(st.anim)}: missing` : this.animOf(st.anim), missing ? 'bad' : '', () => this.select(n, 'what'))]
    if (isMob) line.push(el('span', { text: ',' }), T(MOVE[st.move ?? 'stop'], '', () => this.select(n, 'what')), el('span', { text: 'and faces' }), T(FACE[st.face ?? 'target'], '', () => this.select(n, 'what')))
    const b = []
    if (st.ticks !== undefined) {
      b.push(el('span', { text: 'for' }), T(`${secs(st.ticks)} s`, '', () => this.select(n, 'what')))
      for (const r of st.ends ?? []) b.push(el('span', { text: 'then' }), T(r.to ? r.to : 'choose a state', r.to ? 'to' : 'bad', () => this.select(n, 'ends'), 'action.right'), el('span', { text: `if ${(r.when ?? []).map((c) => sentence(this.K.conds, c)).join(' and ') || '(incomplete)'};` }))
      if ((st.ends ?? []).length) b.push(el('span', { text: 'otherwise' }))
      if (st.next === '@previous') b.push(el('span', { text: 'then goes back to what it was doing' }))
      else if (st.next === n) b.push(el('span', { text: n === 'death' ? 'and stays dead' : 'then starts it again' }))
      else if (st.next) b.push(el('span', { text: 'then goes on to' }), T(st.next, 'to', () => this.select(n, 'what')))
    } else b.push(el('span', { text: (st.transitions ?? []).length ? 'until a rule below sends it on' : 'and stays here' }))
    if (isMob && !this.react(n) && st.interruptible === false) b.push(el('span', { class: 'me-muted', text: '(never flinches here)' }))
    // A flinch drawn as standing still is a flinch nobody sees.
    const stand = isMob && n === 'pain' && this.nodes[this.initial] && this.animOf(st.anim) === this.animOf(this.nodes[this.initial].anim)
    const live = this.live()
    const rules = (st.transitions ?? []).map((t, i) => {
      const todo = !t.to || !(t.when ?? []).length
      const segs = [T(t.to ? t.to : 'choose a state', t.to ? 'to' : 'bad', () => this.select(n, 'rules'), 'action.right')]
      if (todo) segs.push(el('span', { class: 'me-warn', text: `incomplete: ${!t.to ? 'choose where it goes' : 'add a condition'} (it never fires until then)` }))
      if ((t.when ?? []).length) segs.push(el('span', { text: `when ${t.when.map((c) => sentence(this.K.conds, c)).join(' and ')}` }))
      // the whole row opens that rule beside the list
      return el('div', { class: 'me-rule', 'data-live': live?.state === n && live.rule === i ? '1' : '0', 'data-todo': todo ? '1' : '0', role: 'button', tabindex: '0', onclick: (e) => { if (e.target.closest('button')) return; this.select(n, 'rules') } }, segs)
    })
    const unreached = n !== this.initial && !this.react(n) && !this.refsTo(n)
    const steps = (st.sequence ?? []).map((p, i) => ({ p, i })) // in the runtime's order, as the timeline lists them
    const run = this.preview?.running && this.preview.sim.state === n
    return el('article', { class: 'me-card', 'data-on': this.sel === n ? '1' : '0', 'data-run': run ? '1' : '0', 'data-card': n }, [
      el('div', { class: 'me-chead' }, [el('button', { class: 'me-cname', onclick: () => this.select(n) , icon: this.initial === n ? 'status.initial' : null, text: n }),
        el('span', { class: 'me-muted', text: unreached ? 'nothing goes here yet' : n === 'pain' && isMob ? `when hurt, ${Math.round((Number(this.thing.pain_chance ?? 0) / 256) * 100)}% of hits` : n === 'death' && isMob ? 'when its health reaches 0' : '' }),
        el('span', { class: 'me-grow' }), el('button', { class: 'me-lnk', text: 'edit', onclick: () => this.select(n) })]),
      el('div', { class: 'me-line' }, [...line, el('span', { text: ',' }), ...b]),
      stand ? el('span', { class: 'me-warn', text: `It plays ${this.animOf(st.anim)}, as it does standing in ${this.initial}: in the game a flinch will not be seen. Pick another animation, or give its sprite one for pain.` }) : null,
      ...rules,
      steps.length ? el('div', { class: 'me-row' }, steps.map(({ p, i }) => el('button', { class: 'me-chip', 'data-k': this.K.acts[p.action]?.k ?? 'turn', text: `${secs(p.at)} s · ${sentence(this.K.acts, p)}`, onclick: () => { this.select(n, 'steps'); this.step = i; this.render() } }))) : null
    ])
  }

  refsTo (n) {
    let k = 0
    for (const st of Object.values(this.nodes)) { if (st.next === n) k++; for (const t of st.transitions ?? []) if (t.to === n) k++; for (const t of st.ends ?? []) if (t.to === n) k++; for (const p of st.sequence ?? []) if ((p.state ?? p.phase) === n && p.action === 'goto') k++ }
    for (const r of this.thing.any ?? []) if (r.to === n) k++
    return k
  }

  /** Which rule would fire now, in the editor's own lists (not the compiled ones). */
  live () {
    const p = this.preview
    if (!p) return null
    const s = p.sim
    const st = this.nodes[s.state]
    if (!st) return null
    const ok = (r) => r.to && (r.when ?? []).length && s.holdsAll(r.when)
    const ai = (this.thing.any ?? []).findIndex((r, i) => r.to !== s.state && s.state !== 'death' && !st.no_any && ok(r) && !(r.once && s.vars[`__once${i + 1}`]))
    if (ai >= 0) return { any: ai }
    const ri = (st.transitions ?? []).findIndex(ok)
    return ri >= 0 ? { state: s.state, rule: ri } : null
  }

  markRunning () {
    for (const c of this.root.querySelectorAll('.me-card,.me-node')) {
      const n = c.dataset.card ?? c.dataset.node
      c.dataset.run = this.preview?.running && this.preview.sim.state === n ? '1' : '0'
    }
  }

  select (n, jump = null) {
    this.sel = n; this.step = null; this.picking = null; this.pickAct = false
    if (this.nodes[n]?.phase) this.phaseOpen?.delete(this.nodes[n].phase)   // its phase unfolds, even if folded by hand
    if (this.phone) this.pvOpen = false
    this.render()
    requestAnimationFrame(() => this.root.querySelector(`.me-card[data-card="${n}"]`)?.scrollIntoView({ block: 'nearest' }))
    if (jump) requestAnimationFrame(() => this.root.querySelector(`#me-sec-${jump}`)?.scrollIntoView({ block: 'start' }))
  }

  createState (raw) {
    const name = toName(raw)
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(name)) { this.say(nameProblem(name), 'warn'); return }
    if (this.nodes[name]) { this.say(`There is already a ${this.K.node} called ${name}.`, 'warn'); return }
    // a weapon's new state goes back to resting, not to being drawn again
    const rest = this.kind === 'weapon' ? (this.nodes.ready ? 'ready' : Object.keys(this.nodes).find((k) => k !== this.initial) ?? this.initial) : null
    const fresh = this.kind === 'mob' ? { anim: 0, move: 'stop', face: 'target', interruptible: true } : { anim: 0, ticks: 18, next: rest }
    const ph = this.newPhase ?? this.defaultPhase()
    if (ph) fresh.phase = ph
    this.newPhase = undefined
    // placed after the one picked: a fresh object in key order
    const entries = Object.entries(this.nodes)
    const at = this.sel ? entries.findIndex(([k]) => k === this.sel) + 1 : entries.length
    entries.splice(at, 0, [name, fresh])
    const map = this.K.nodes(this.thing)
    for (const k of Object.keys(map)) delete map[k]
    for (const [k, v] of entries) map[k] = v
    this.newState = null
    this.sel = name
    this.changed()
    this.say(`Added ${name}. Nothing goes to it yet: give another ${this.K.node} a rule that goes to ${name}.`)
  }

  /** The phase a new state goes in, unless said: the picked state's, else the first. */
  defaultPhase () {
    const phs = this.thing.phases ?? []
    if (!phs.length) return ''
    const after = this.sel ? this.nodes[this.sel] : null
    return after?.phase && !this.react(this.sel) ? after.phase : phs[0].id
  }

  renameState (from, raw) {
    const to = toName(raw)
    if (!to || to === from) return
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(to)) { this.say(nameProblem(to), 'warn'); this.render(); return }
    if (this.nodes[to]) { this.say(`There is already a ${this.K.node} called ${to}.`, 'warn'); this.render(); return }
    const map = this.K.nodes(this.thing)
    const entries = Object.entries(map).map(([k, v]) => [k === from ? to : k, v])
    for (const k of Object.keys(map)) delete map[k]
    for (const [k, v] of entries) map[k] = v
    for (const st of Object.values(map)) {
      if (st.next === from) st.next = to
      for (const t of st.transitions ?? []) if (t.to === from) t.to = to
      for (const t of st.ends ?? []) if (t.to === from) t.to = to
      for (const p of st.sequence ?? []) if (p.action === 'goto' && (p.state ?? p.phase) === from) { if (p.state) p.state = to; else p.phase = to }
    }
    for (const r of this.thing.any ?? []) if (r.to === from) r.to = to
    if (this.thing.initial === from) this.thing.initial = to
    this.sel = to
    this.changed()
    const warn = from === 'pain' || from === 'death' ? ` It is no longer the built-in ${from}: the engine only enters a state named ${from}.` : ''
    this.say(`Renamed ${from} to ${to}; every rule that went to it follows.${warn}`)
  }

  deleteState (n) {
    const map = this.K.nodes(this.thing)
    delete map[n]
    let removed = 0
    for (const st of Object.values(map)) {
      if (st.next === n) delete st.next
      const b = (st.transitions ?? []).length
      if (st.transitions) st.transitions = st.transitions.filter((t) => t.to !== n)
      removed += b - (st.transitions ?? []).length
      if (st.ends) st.ends = st.ends.filter((t) => t.to !== n)
      if (st.sequence) st.sequence = st.sequence.filter((p) => !(p.action === 'goto' && (p.state ?? p.phase) === n))
    }
    if (this.thing.any) this.thing.any = this.thing.any.filter((r) => r.to !== n)
    if (this.thing.initial === n) this.thing.initial = Object.keys(map)[0]
    this.sel = null
    this.changed()
    this.say(`Deleted ${n}.${removed ? ` ${removed} rule(s) that went to it were removed too.` : ''}`)
  }

  // ---- phases: a new one is a copy of the last, faster, entered once its health drops ----
  addPhase () {
    const b = this.thing
    if (!(b.phases ?? []).length) {
      b.phases = [{ id: 'p1', name: 'Phase 1' }]
      for (const [n, st] of Object.entries(this.nodes)) if (!this.react(n)) st.phase = 'p1'
    }
    this.duplicatePhase(b.phases.at(-1).id)
  }

  duplicatePhase (pid) {
    const b = this.thing
    const src = b.phases.find((p) => p.id === pid)
    let i = b.phases.length + 1
    while (b.phases.some((p) => p.id === `p${i}`)) i++
    const base = Number(this.prop?.speed ?? 4)
    const np = { id: `p${i}`, name: `Phase ${b.phases.length + 1}`, speed: Math.round((src?.speed ?? base) * 1.3 * 10) / 10 }
    const members = Object.entries(this.nodes).filter(([, st]) => st.phase === pid)
    const taken = new Set(Object.keys(this.nodes))
    const map = {}
    for (const [n] of members) { let k = `${n}_${b.phases.length + 1}`; let j = 2; while (taken.has(k)) k = `${n}_${b.phases.length + 1}_${j++}`; taken.add(k); map[n] = k }
    const re = (t) => map[t] ?? t
    for (const [n, st] of members) {
      const c = clone(st)
      c.phase = np.id
      if (c.next) c.next = re(c.next)
      for (const t of c.transitions ?? []) t.to = re(t.to)
      for (const t of c.ends ?? []) t.to = re(t.to)
      for (const p of c.sequence ?? []) if (p.action === 'goto') { if (p.state) p.state = re(p.state); if (p.phase) p.phase = re(p.phase) }
      this.nodes[map[n]] = c
    }
    b.phases.push(np)
    // entered once its health drops: half of the last phase change's threshold, and below where it is now
    b.any ??= []
    const hps = b.any.map((r) => (r.when ?? []).find((c) => c.cond === 'hp_below')).filter(Boolean).map((c) => Number(c.percent))
    const thr = hps.length ? Math.max(5, Math.round(Math.min(...hps) / 2)) : 50
    const door = members.find(([, st]) => st.move === 'chase')?.[0] ?? members[0]?.[0]
    if (door) b.any.push({ to: map[door], when: [{ cond: 'hp_below', percent: thr }], once: true })
    this.changed()
    this.say(`${np.name}: a copy of ${src?.name ?? 'the phase'} that runs at ${np.speed} m/s. ${door ? `It starts when its health drops below ${thr}% (a rule under "Whatever it is doing").` : ''} Make it angrier: change its states, its speed, or what it hits for.`)
  }

  anyPanel () {
    const b = this.thing
    const any = b.any ?? []
    const isMob = this.kind === 'mob'
    const has = (n) => !!this.nodes[n]
    const builtin = isMob ? [
      { when: `it is hurt (${Math.round((Number(b.pain_chance ?? 0) / 256) * 100)}% of hits)`, to: 'pain' },
      { when: 'its health reaches 0', to: 'death' }] : []
    const live = this.live()
    const targets = Object.keys(this.nodes).map((n) => [n, n])
    const cards = ruleCards({ id: 'any', list: any, table: this.K.conds, ctx: this.ctx(), targets, key: 'any', canOnce: true, live: live?.any ?? -1,
      picking: this.picking?.list === 'any' ? this.picking.i : -1, setPicking: (i) => { this.picking = i === null ? null : { list: 'any', i }; this.render() },
      fired: (i) => !!this.preview?.sim.vars[`__once${i + 1}`] })
    const head = el('button', { class: 'me-pvbar', 'aria-expanded': this.anyOpen ? 'true' : 'false', onclick: () => { this.anyOpen = !this.anyOpen; this.render() } },
      [el('span', { icon: this.anyOpen ? 'action.collapse' : 'action.expand' }), el('b', { text: 'Whatever it is doing' }), el('span', { class: 'me-muted', text: `${builtin.length ? `${builtin.length} built in · ` : ''}${any.length ? `${any.length} of yours` : 'none of yours yet'}` })])
    if (!this.anyOpen) return el('div', { class: 'me-panel' }, [head])
    return el('div', { class: 'me-panel' }, [head,
      el('span', { class: 'me-muted', text: `Checked first, before a ${this.K.node}'s own rules; the first that holds wins. "Only once" makes a rule fire a single time: a boss's phase change.` }),
      ...builtin.map((x) => el('div', { class: 'me-rule' }, [el('span', { text: `when ${x.when}` }), el('span', { class: 'me-tok to', icon: 'action.right', text: x.to }), el('span', { class: 'me-badge', text: 'built in' }),
        el('span', { class: 'me-muted', text: has(x.to) ? `the engine's own, for a state named ${x.to}` : `no state is named ${x.to}, so this never happens` }), el('span', { class: 'me-grow' }),
        has(x.to) ? el('button', { class: 'me-lnk', text: `open ${x.to}`, onclick: () => this.select(x.to) }) : null])),
      ...cards,
      el('div', { class: 'me-row' }, [button(`+ a rule for any ${this.K.node}`, () => { (b.any ??= []).push({ to: '', when: [] }); this.picking = { list: 'any', i: b.any.length - 1 }; this.changed() }),
        el('span', { class: 'me-muted', text: isMob ? 'for example: flee when its health is below 30%' : 'for example: when it is out of ammo, go to a reload state' })])
    ])
  }

  // ---- the side: preview, and the editor of the state picked ----
  side () {
    const isBeh = this.tab === 'behaviour'
    const sel = this.sel && this.nodes[this.sel] ? this.sel : null
    const mini = this.phone && !sel && !this.pvOpen
    // A state open on a desktop: a wider panel, the preview drawn smaller over
    // it, so the state's own fields have the most of the height.
    const side = el('aside', { class: 'me-side', 'data-gone': isBeh ? '0' : '1', 'data-mini': mini ? '1' : '0', 'data-wide': sel ? '1' : '0', 'data-compact': sel && !this.phone ? '1' : '0' })
    if (!isBeh) return side
    const p = this.preview
    if (mini) {
      side.append(el('div', { class: 'me-strip' }, [
        el('button', { 'aria-label': p?.running ? 'Pause' : 'Run', icon: p?.running ? 'transport.pause' : 'transport.play', onclick: () => { this.pvOpen = true; p?.start(); this.render() } }),
        el('button', { 'aria-label': 'Show the preview', icon: 'paint.dim', onclick: () => { this.pvOpen = true; this.render() } }),
        el('span', { class: 'me-vlab me-mono', text: p?.sim.state ?? '' })]))
      return side
    }
    const pv = el('div', { class: 'me-pv' }, [
      el('div', { class: 'me-row' }, [
        el('button', { class: 'me-pvbar', 'aria-expanded': this.pvOpen ? 'true' : 'false', onclick: () => { this.pvOpen = !this.pvOpen; this.render() } }, [el('span', { icon: this.pvOpen ? 'action.collapse' : 'action.expand' }), el('b', { text: 'Preview' }), p ? p.stateEl : null]),
        el('button', { 'aria-label': p?.running ? 'Pause' : 'Run', icon: p?.running ? 'transport.pause' : 'transport.play', onclick: () => { p?.toggle(); this.pvOpen = true; this.render() } }),
        this.phone ? el('button', { 'aria-label': 'Close the panel', icon: 'action.right', onclick: () => { this.pvOpen = false; this.sel = null; this.render() } }) : null]),
      ...(this.pvOpen && p ? [p.stage, p.evEl, p.controls(), p.nowEl, p.varsEl] : [])
    ])
    side.append(pv)
    if (p && this.pvOpen) { p.wake(); requestAnimationFrame(() => p.draw()) }
    const ins = el('div', { class: 'me-ins' }, sel ? this.inspector(sel) : [el('span', { class: 'me-muted', text: `Tap a ${this.K.node} to edit it here. The preview runs the real rules.` })])
    side.append(ins)
    if (sel && this.phone && (this.step !== null || this.pickAct)) side.append(this.stepSheet(sel))
    return side
  }

  inspector (n) {
    const st = this.nodes[n]
    const isMob = this.kind === 'mob'
    const set = () => this.changed()
    const ctx = this.ctx()
    const names = Object.keys(this.nodes)
    const nameIn = el('input', { class: 'me-mono', value: n, 'aria-label': `Name of this ${this.K.node}` })
    nameIn.addEventListener('input', () => { const v = toName(nameIn.value); if (v !== nameIn.value) nameIn.value = v })
    nameIn.addEventListener('change', () => this.renameState(n, nameIn.value))
    const out = [
      el('div', { class: 'me-row' }, [nameIn, el('span', { class: 'me-muted', text: `a ${this.K.node} of ${this.name}` }), el('span', { class: 'me-grow' }),
        el('button', { 'aria-label': 'Close', icon: 'action.close', onclick: () => { this.sel = null; this.render() } })]),
      el('div', { class: 'me-row' }, [
        n === this.initial ? el('span', { class: 'me-muted', icon: 'status.initial', text: ' where it begins' }) : el('button', { class: 'me-lnk', icon: 'status.initial', text: ' make it where it begins', onclick: () => { this.thing.initial = n; this.changed(); this.preview?.reset(); this.say(`${n} is now where it begins (★); the preview starts there.`) } }),
        el('button', { class: 'me-lnk', text: 'duplicate', onclick: () => { let k = `${n}_copy`; let j = 2; while (this.nodes[k]) k = `${n}_copy${j++}`; this.nodes[k] = clone(st); this.sel = k; this.changed() } }),
        el('button', { class: 'me-lnk danger', text: 'delete', onclick: async () => { if (await confirmDialog(`Delete ${n}? ${this.refsTo(n)} rule(s) or "then goes to" point at it.`)) this.deleteState(n) } })]),
      el('div', { class: 'me-row' }, ['what', 'rules', 'ends', 'steps'].map((k) => el('button', { class: 'me-vbtn', text: { what: 'does', rules: 'goes to', ends: 'at the end', steps: 'steps' }[k], onclick: () => this.root.querySelector(`#me-sec-${k}`)?.scrollIntoView({ block: 'start' }) }))),
      el('div', { class: 'me-h first', id: 'me-sec-what', text: 'What it does' })
    ]
    const anims = isMob ? this.sheetAnims() : []
    if (isMob) {
      const cur = this.animOf(st.anim)
      const opts = anims.map((a) => [a, a])
      if (cur && !anims.includes(cur)) opts.unshift([cur, `${cur} (missing)`])
      out.push(selectField('Plays', cur, opts, (v) => { st.anim = this.animNumber(v); set() }, this.prop?.art?.sheet ? `an animation of the sprite ${this.prop.art.sheet}` : 'no sprite yet: pick one on Looks'))
      out.push(selectField('Moves', st.move ?? 'stop', Object.entries(MOVE), (v) => { st.move = v; set() }))
      out.push(selectField('Faces', st.face ?? 'target', Object.entries(FACE), (v) => { st.face = v; set() }))
    } else {
      out.push(numField('Shows picture', st.anim ?? 0, '', (v) => { st.anim = Math.max(0, Math.round(v ?? 0)); set() }, { hint: 'a state of its first-person view model (Looks)' }))
    }
    out.push(numField('Lasts', st.ticks === undefined ? '' : secs(st.ticks), 's', (v) => { if (v === null) { delete st.ticks; delete st.ticks_jitter } else { st.ticks = ticksOf(v); if (!st.next) st.next = this.react(n) ? '@previous' : this.initial } set() },
      { hint: st.ticks !== undefined ? `${st.ticks} ticks; the game runs 60 a second` : 'empty: it stays until a rule sends it on', placeholder: 'until a rule fires' }))
    if (st.ticks !== undefined) {
      const opts = [['', '(stays)'], ...(isMob ? [['@previous', 'back to what it was doing (resumed)']] : []), ...names.map((x) => [x, x])]
      out.push(selectField('Then goes to', st.next ?? '', opts, (v) => { if (v) st.next = v; else { delete st.next; delete st.ticks } set() }, st.next === '@previous' ? 'goes back to the state it interrupted and carries on from where it was: its steps are not run again' : ''))
    }
    if (isMob && !this.react(n) && (this.thing.phases ?? []).length) out.push(selectField('Phase', st.phase ?? '', [['', '(no phase)'], ...this.thing.phases.map((p) => [p.id, p.name])], (v) => { if (v) st.phase = v; else delete st.phase; set() }, 'which group it is listed and drawn in'))
    if (n !== 'death') out.push(checkField('Follows "whatever it is doing"', !st.no_any, (v) => { if (v) delete st.no_any; else st.no_any = true; set() }, st.no_any ? 'the rules for any state are not checked here' : 'the rules for any state are checked here too, first'))
    if (isMob) {
      out.push(checkField('Pain can cut it short', st.interruptible !== false, (v) => { st.interruptible = v; set() }, st.interruptible !== false ? 'a hit can make it flinch here' : 'a hit lands but it never flinches here. Dying always interrupts.'))
      out.push(checkField('Blocks', st.solid !== false, (v) => { if (v) delete st.solid; else st.solid = false; set() }, 'shots and walkers stop at it'))
    }
    // its own rules
    out.push(el('div', { class: 'me-h', id: 'me-sec-rules', text: 'Goes to' }))
    const own = st.transitions ?? []
    const live = this.live()
    const phs = this.thing.phases ?? []
    const phName = (id) => phs.find((p) => p.id === id)?.name
    const mine = names.filter((x) => x !== n && (!phs.length || (this.nodes[x].phase ?? null) === (st.phase ?? null)))
    const rest = names.filter((x) => x !== n && !mine.includes(x))
    const targets = [...mine.map((x) => [x, x]), ...rest.map((x) => [x, `${x} · ${phName(this.nodes[x].phase) ?? (this.react(x) ? 'reaction' : 'no phase')}`])]
    const warn = (r) => {
      const t = r.to && this.nodes[r.to]
      const w = (r.when ?? []).find((c) => c.cond === 'target_within' && !c.negate)
      const hit = t?.sequence?.find((p) => p.action === 'melee')
      const leaps = t?.sequence?.some((p) => p.action === 'impulse' && hit && p.at <= hit.at)
      return hit && w && !leaps && fxNum(w.distance) > fxNum(hit.range) ? `${r.to} hits only ${fxNum(hit.range)} m away: from ${fxNum(w.distance)} m it can swing and miss.` : null
    }
    out.push(...ruleCards({ id: n, list: own, table: this.K.conds, ctx, targets, key: 'rules', canOnce: false, live: live?.state === n ? live.rule : -1,
      picking: this.picking?.list === 'rules' ? this.picking.i : -1, setPicking: (i) => { this.picking = i === null ? null : { list: 'rules', i }; this.render() }, warn }))
    if (!own.length) out.push(el('span', { class: 'me-muted', text: st.ticks !== undefined ? `No rules: it runs for ${secs(st.ticks)} s, then goes on.` : 'No rules: it stays here.' }))
    out.push(button('+ another rule', () => { (st.transitions ??= []).push({ to: '', when: [] }); this.picking = { list: 'rules', i: st.transitions.length - 1 }; this.changed() }))
    // branches as its time is up
    out.push(el('div', { class: 'me-h', id: 'me-sec-ends', text: 'When its time is up (optional branches)' }))
    if (st.ticks === undefined) out.push(el('span', { class: 'me-muted', text: 'It has no length, so it only leaves through a rule. To leave after a while, give it a length above, or a rule "this state has run for".' }))
    else {
      const ends = st.ends ?? []
      out.push(...ruleCards({ id: `${n}#ends`, list: ends, table: this.K.conds, ctx, targets, key: 'ends', canOnce: false, live: -1,
        picking: this.picking?.list === 'ends' ? this.picking.i : -1, setPicking: (i) => { this.picking = i === null ? null : { list: 'ends', i }; this.render() } }))
      out.push(el('div', { class: 'me-row' }, [el('span', { class: 'me-muted', text: `otherwise → ${st.next === '@previous' ? 'back to what it was doing' : st.next ?? '(it stays)'}` }), el('span', { class: 'me-grow' }),
        button('+ a branch', () => { (st.ends ??= []).push({ to: '', when: [] }); this.picking = { list: 'ends', i: st.ends.length - 1 }; this.changed() })]))
    }
    // its steps
    out.push(el('div', { class: 'me-h', id: 'me-sec-steps', text: 'Timeline' }))
    const blk = this.steps(n)
    out.push(...blk.timeline)
    if (!(st.sequence ?? []).length) out.push(el('span', { class: 'me-muted', text: 'No steps yet: in this state it only moves and plays its animation.' }))
    out.push(...blk.list)
    if (!this.phone) { if (blk.editor) out.push(blk.editor); if (blk.adder) out.push(blk.adder) }
    if (!this.pickAct) out.push(button(`+ add a step at ${secs(this.addAt(n))} s`, () => { this.pickAct = true; this.step = null; this.render() }))
    // A swing is a step now, its shape in it. A state that still carries a swing
    // of its own (a module written before) shows it, with the way to a step.
    if (!isMob && st.swing) {
      out.push(el('div', { class: 'me-h', text: 'Its own swing (the older way)' }),
        el('span', { class: 'me-muted', text: 'A swing shape kept on the state, which the attack button swings. A swing step does the same with its numbers in it, at the moment it says.' }),
        button('turn it into a swing step', async () => {
          if (!await confirmDialog(`Make ${n}'s swing a step at 0 s? A weapon with a swing step in any state swings only through its steps: the attack button then just moves it from state to state.`)) return
          ;(st.sequence ??= []).unshift({ at: 0, action: 'swing', ...JSON.parse(JSON.stringify(st.swing)) })
          delete st.swing
          this.changed()
          this.say(`${n} now swings through a step at 0 s, with the shape it had.`)
        }),
        ...this.swingSection(st, `This ${this.K.node}`))
    }
    return out.filter(Boolean)
  }

  addAt (n) { const p = this.preview; return p?.running && p.sim.state === n ? p.sim.elapsed : 0 }

  steps (n) {
    const st = this.nodes[n]
    const len = st.ticks ?? Math.max(60, ...(st.sequence ?? []).map((p) => Math.round((p.at ?? 0) * 1.15)), ...(st.transitions ?? []).flatMap((t) => (t.when ?? []).filter((c) => c.cond === 'held_for' || c.cond === 'state_elapsed' || c.cond === 'phase_elapsed').map((c) => c.ticks)))
    const p = this.preview
    return stepsBlock({ node: st, table: this.K.acts, ctx: this.ctx(), length: len, head: p?.running && p.sim.state === n ? p.sim.elapsed : null,
      sel: this.step, setSel: (i) => { this.step = i; this.pickAct = false; this.render() }, picking: this.pickAct, setPicking: (b) => { this.pickAct = b; this.render() },
      addAt: this.addAt(n), actCtx: this.actCtx(), onMissile: (m) => this.S.go('missiles', m),
      // the swing a step leaves numbers out of: a weapon state's own (an older module's), else the declared one
      declared: () => (this.kind === 'weapon' ? st.swing ?? this.thing.swing : this.thing.swing) ?? null })
  }

  stepSheet (n) {
    const blk = this.steps(n)
    const st = this.nodes[n]
    return el('div', { class: 'me-sheet', role: 'dialog', 'aria-label': 'Edit the step' }, [
      el('div', { class: 'me-row' }, [el('b', { text: this.step !== null && st.sequence?.[this.step] ? `step at ${secs(st.sequence[this.step].at)} s in ${n}` : `add a step to ${n}` }), el('span', { class: 'me-grow' }),
        el('button', { 'aria-label': 'Close the step', icon: 'action.close', onclick: () => { this.step = null; this.pickAct = false; this.render() } })]),
      blk.editor, blk.adder])
  }

  // ---- Overview ----
  overview () {
    const b = this.thing
    const set = () => this.changed()
    const say = (m) => this.say(m, 'warn')
    if (this.kind === 'weapon') {
      const W = this.S.module.weapons
      return [el('div', { class: 'me-panel' }, [el('b', { class: 'me-mono', text: this.name }), el('span', { text: this.summary() })]),
        el('div', { class: 'me-ov' }, [
          el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'In the arsenal' }),
            (() => { const i = el('input', { value: b.label ?? '', 'aria-label': 'Name' }); i.addEventListener('change', () => { b.label = i.value; set() }); return el('div', { class: 'me-frow' }, [el('label', { text: 'Name' }), i]) })(),
            numField('Slot', b.order, '', (v) => { b.order = Math.max(1, Math.round(v ?? 1)); set() }, { hint: 'the key that selects it' }),
            selectField('Ammo', b.ammo ?? '', [['', 'never runs out'], ...Object.keys(W.ammo ?? {}).map((k) => [k, W.ammo[k].label ?? k])], (v) => { if (v) b.ammo = v; else { delete b.ammo; delete b.per } set() }, 'the pools are on Arsenal'),
            b.ammo ? numField('A shot counts as', b.per ?? 1, 'ammo', (v) => { b.per = Math.max(0, Math.round(v ?? 1)); set() }, { hint: `what "it has ammo" asks for when it names no number. What a shot spends is its "use N ammo" steps${this.spends() ? `: ${this.spends()}` : ''}.` }) : null].filter(Boolean))])]
    }
    const prop = this.prop
    const pct = Math.round((Number(b.pain_chance ?? 0) / 256) * 100)
    return [
      el('div', { class: 'me-panel' }, [el('b', { class: 'me-mono', text: b.label ?? this.name }), el('span', { text: this.summary() })]),
      el('div', { class: 'me-ov' }, [
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Toughness' }),
          numField('Health', b.hp, '', (v) => { b.hp = Math.max(1, Math.round(v ?? 1)); set() }, { lo: 1, hi: 100000, say }),
          numField('Flinches', pct, '% of hits', (v) => { b.pain_chance = Math.max(0, Math.min(256, Math.round((v ?? 0) * 2.56))); set() }, { hint: 'how often a hit makes it flinch (its pain state)', lo: 0, hi: 100, say }),
          // A marker over its head with its health (docs/MARKERS.md): the game keeps value and max current.
          selectField('A bar over it', b.health_bar ?? '', [['', 'none'], ...markerNames(this.S.module.ui).map((n) => [n, n === 'health' ? 'health (the built-in bar)' : n]),
            ...(b.health_bar && !markerNames(this.S.module.ui).includes(b.health_bar) ? [[b.health_bar, `${b.health_bar} (missing)`]] : [])],
          (v) => { if (v) b.health_bar = v; else delete b.health_bar; set() }, 'its health over its head in the game, while it lives. Markers are made on Screens → markers.')]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Speed and senses' }),
          prop ? numField('Runs at', Number(prop.speed ?? 4), 'm/s', (v) => { prop.speed = fxOf(v ?? 4); set() }, { hint: 'how fast it runs at you or backs away: 4 is a walk, 9 a sprint. A phase can be faster.', lo: 0.5, hi: 40, say }) : null,
          numField('Sees', fxNum(b.sight) ?? '', 'm', (v) => { if (v === null) delete b.sight; else b.sight = fxOf(v); set() }, { placeholder: 'engine default' }),
          numField('Turn speed', b.turn_speed ?? '', '', (v) => { if (v === null) delete b.turn_speed; else b.turn_speed = Math.round(v); set() }, { hint: 'higher turns to face you faster', placeholder: 'engine default' }),
          checkField('Flies', !!b.flying, (v) => { if (v) b.flying = true; else delete b.flying; set() }),
          b.flying ? numField('Hover height', fxNum(b.hover_z) ?? '', 'm', (v) => { if (v === null) delete b.hover_z; else b.hover_z = fxOf(v); set() }) : null].filter(Boolean)),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'When it dies' }),
          checkField('Leaves a body', !!b.corpse, (v) => { b.corpse = v; set() }),
          checkField('Fights others', b.infighting !== false, (v) => { b.infighting = v; set() }, 'a hit from another monster makes it turn on that one')])
      ])
    ]
  }

  /** What its "use N ammo" steps spend, by state. */
  spends () {
    return Object.entries(this.nodes).flatMap(([n, st]) => (st.sequence ?? []).filter((p) => p.action === 'consume').map((p) => `${p.n ?? 1} in ${n}`)).join(', ')
  }

  summary () {
    const b = this.thing
    const atk = Object.entries(this.nodes).flatMap(([n, st]) => (st.sequence ?? []).filter((p) => (this.K.acts[p.action]?.g === 'Attack' && p.action !== 'telegraph') || p.action === 'spawn').map((p) => `In ${n}: ${sentence(this.K.acts, p)}.`))
    if (this.kind === 'weapon') return `${b.label ?? this.name}: ${atk.length ? atk.slice(0, 3).join(' ') : 'nothing fires yet: give a state a step.'} Ammo: ${b.ammo ? (this.spends() ? `${b.ammo}, ${this.spends()}` : `${b.ammo}, but no step uses any`) : 'never runs out'}.`
    return `${b.hp ?? '?'} health, runs at ${Number(this.prop?.speed ?? 4)} m/s, sees ${fxNum(b.sight) ?? 'as far as the engine lets it'} m.${atk.length ? ' ' + atk.slice(0, 3).join(' ') : ' No attack yet: add a step to a state.'}${b.flying ? ' It flies.' : ''}`
  }

  // ---- Attacks ----
  attacks () {
    const out = []
    const ctx = this.ctx()
    for (const [n, st] of Object.entries(this.nodes)) {
      for (const p of st.sequence ?? []) {
        if ((this.K.acts[p.action]?.g !== 'Attack' || p.action === 'telegraph') && p.action !== 'spawn') continue
        out.push(el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: `In ${n}, at ${secs(p.at)} s` }), sentenceEl(this.K.acts, p, { ...ctx, live: true }),
          el('button', { class: 'me-lnk', text: `Open ${n}`, onclick: () => { this.tab = 'behaviour'; this.sel = n; this.step = st.sequence.indexOf(p); this.render() } })]))
      }
    }
    if (!out.length) out.push(el('div', { class: 'me-panel' }, [el('b', { text: 'Nothing hits yet' }), el('span', { class: 'me-muted', text: `Its attacks are steps in its ${this.K.node}s ("melee hit", "fire the missile", "a blast of" …). Add one on Behaviour.` }), button('Open Behaviour', () => { this.tab = 'behaviour'; this.render() })]))
    const ms = Object.keys(this.S.module.mobs?.missiles ?? {})
    out.push(el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Missiles in the module' }), el('span', { text: ms.join(' · ') || 'none yet' }),
      el('span', { class: 'me-muted', text: 'Shared by every monster and weapon: speed, fall and what it does on a hit are edited in Missiles.' }), button('Open Missiles', () => this.S.go('missiles'))]))
    return [el('div', { class: 'me-ov' }, out)]
  }

  // ---- Looks ----
  looks () {
    if (this.kind === 'weapon') return this.weaponLooks()
    const S = this.S
    const prop = this.prop
    if (!prop) return [el('span', { class: 'me-muted', text: 'This monster has no body (a prop) to draw.' })]
    prop.art ??= { kind: 'atlas', sheet: '', states: {} }
    const sheets = Object.keys(S.module.sprites ?? {})
    const sheet = prop.art.sheet
    this.look ??= { anim: null, facing: 0, play: true, t0: performance.now() }
    const L = this.look
    const canvas = el('canvas', { class: 'me-stage', style: 'height:240px', 'aria-label': "The sprite's current frame" })
    const info = el('span', { class: 'me-muted' })
    const draw = () => {
      if (!canvas.isConnected) return
      const w = canvas.clientWidth; const h = canvas.clientHeight
      if (canvas.width !== w) { canvas.width = w; canvas.height = h }
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = false
      const tall = this.sheets.height(sheet) * Number(prop.scale ?? 1)
      const px = (h - 30) / Math.max(1.2, tall * 1.1)
      const anims = this.sheetAnims()
      const a = L.anim && anims.includes(L.anim) ? L.anim : anims[0]
      const r = this.sheets.draw(ctx, sheet, a, L.play ? (performance.now() - L.t0) / 1000 : 0, L.facing, w / 2, h - 18, px, Number(prop.scale ?? 1))
      info.textContent = r ? `${r.anim} · frame ${r.frame + 1} of ${r.frames} · ${r.fps} fps · ${r.loop ? 'loops' : 'plays once'} · side ${r.view} of ${r.views} · ${Math.round(r.tall * 100) / 100} m tall` : sheet ? `loading ${sheet}…` : 'no sprite yet: pick one, or import one'
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)
    const anims = this.sheetAnims()
    const sideNames = ['front', '45°', '90°', '135°', 'back', '225°', '270°', '315°']
    const states = Object.entries(this.nodes)
    const sounds = states.flatMap(([n, st]) => (st.sequence ?? []).map((p, i) => ({ n, p, i })).filter(({ p }) => p.action === 'sound'))
    return [el('div', { class: 'me-lookrow' }, [
      el('div', { class: 'me-lookside' }, [canvas, info]),
      el('div', { class: 'me-lookmain' }, [
        el('div', { class: 'me-panel' }, [
          el('div', { class: 'me-row' }, [el('label', { class: 'me-muted', text: 'sprite' }),
            (() => { const s = el('select', { 'aria-label': 'Its sprite' }, [el('option', { value: '', text: '(none)' }), ...sheets.map((x) => el('option', { value: x, text: x }))]); s.value = sheet ?? ''; s.addEventListener('change', () => { prop.art.sheet = s.value; prop.art.states = s.value ? guessStates(this.sheets.animations(s.value)) : {}; prop.height = S.module.sprites?.[s.value]?.worldHeight ?? prop.height; L.anim = null; this.changed() }); return s })(),
            button('Import a sprite…', async () => { const n = await S.importSheet?.(); if (n) { prop.art.sheet = n; prop.art.states = guessStates(this.sheets.animations(n)); this.changed() } }),
            S.editInPlugin && sheet && S.rec?.assets?.[`sources/sprites/${sheet}.tsprite`] ? button('Edit in ThreeSprite', () => S.editInPlugin('file:tsprite', sheet)) : null,
            // A sheet with no project (imported as pictures) cannot be opened as one: drawing "it" would start a
            // blank project under its name, and saving would replace the art every monster drawn with it uses.
            S.editInPlugin && !(sheet && S.rec?.assets?.[`sources/sprites/${sheet}.tsprite`]) ? button('Draw a sprite of its own…', async () => {
              const raw = await ask('the new sprite\'s name (capitals and digits)', this.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SPRITE')
              const nm = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '')
              if (!nm) return
              if (S.module.sprites?.[nm] || S.rec?.assets?.[`sources/sprites/${nm}.tsprite`]) { this.say(`${nm} is taken: pick another name.`, 'warn'); return }
              prop.art = { kind: 'atlas', sheet: nm, states: { 0: 'idle', 1: 'walk', 2: 'attack', 3: 'pain', 4: 'death' } }
              this.changed()
              S.editInPlugin('file:tsprite', nm)
            }) : null]),
          el('div', { class: 'me-row' }, [el('span', { class: 'me-muted', text: 'animation' }), ...anims.map((a) => el('button', { class: 'me-vbtn', 'data-on': (L.anim ?? anims[0]) === a ? '1' : '0', text: a, onclick: () => { L.anim = a; L.t0 = performance.now(); L.play = true; this.render() } }))]),
          el('div', { class: 'me-row' }, [el('span', { class: 'me-muted', text: 'side' }), ...sideNames.map((x, i) => el('button', { class: 'me-vbtn', 'data-on': Math.round(L.facing * 8) % 8 === i ? '1' : '0', text: x, onclick: () => { L.facing = i / 8; this.render() } }))]),
          el('div', { class: 'me-row' }, [button(L.play ? 'Pause' : 'Play', () => { L.play = !L.play; L.t0 = performance.now(); this.render() })])]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Each state plays' }), el('span', { class: 'me-muted', text: 'An animation of the sprite, by name.' }),
          ...states.map(([n, st]) => { const cur = this.animOf(st.anim); const opts = anims.map((a) => [a, a]); if (cur && !anims.includes(cur)) opts.unshift([cur, `${cur} (missing)`]); return selectField(n, cur, opts, (v) => { st.anim = this.animNumber(v); L.anim = v; this.changed() }, cur && !anims.includes(cur) ? `${sheet || 'the sprite'} has no "${cur}": pick one` : '') })]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Sounds' }), el('span', { class: 'me-muted', text: 'Every sound its steps play, from the module\'s sound packs. Add one with a "play the sound" step.' }),
          ...(sounds.length ? sounds.map(({ n, p }) => S.soundField(n, p.name, (v) => { p.name = v; this.changed() })) : [el('span', { class: 'me-muted', text: 'none yet' })]),
          el('div', { class: 'me-row' }, [button('Bring in sounds of your own…', () => S.go('sounds')), el('span', { class: 'me-muted', text: 'a pack made in the sound tool, on the Sounds page' })])]),
        el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Its body' }),
          numField('Width (radius)', fxNum(prop.radius) ?? 0.35, 'm', (v) => { prop.radius = fxOf(v ?? 0.35); this.changed() }),
          numField('Drawn at', Number(prop.scale ?? 1), '× size', (v) => { if (v === null || v === 1) delete prop.scale; else prop.scale = fxOf(v); this.changed() }, { hint: 'the picture only; its body stays its size', lo: 0.25, hi: 6, say: (m) => this.say(m, 'warn') })])
      ])
    ])]
  }

  weaponLooks () {
    const S = this.S
    const b = this.thing
    const states = Object.entries(this.nodes)
    const sounds = states.flatMap(([n, st]) => (st.sequence ?? []).map((p) => ({ n, p })).filter(({ p }) => p.action === 'sound'))
    const rows = S.viewRows ? S.viewRows(this.name, () => this.changed()) : []
    return [el('div', { class: 'me-ov' }, [
      el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Held in first person' }), ...rows, rows.length ? null : el('span', { class: 'me-muted', text: 'The view model is set on the weapon\'s view page.' })].filter(Boolean)),
      el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Each state shows' }), ...states.map(([n, st]) => numField(n, st.anim ?? 0, '', (v) => { st.anim = Math.max(0, Math.round(v ?? 0)); this.changed() }))]),
      el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Sounds' }), ...(sounds.length ? sounds.map(({ n, p }) => S.soundField(n, p.name, (v) => { p.name = v; this.changed() })) : [el('span', { class: 'me-muted', text: 'none yet: add a "play the sound" step' })])]),
      b.icon !== undefined ? el('span', { class: 'me-muted', text: `icon ${b.icon}` }) : null
    ].filter(Boolean))]
  }

  arsenal () {
    const rows = this.S.arsenalRows ? this.S.arsenalRows(() => this.changed()) : []
    return [el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Ammunition, health and pickups' }), ...rows])]
  }

  // ---- Advanced ----
  advanced () {
    const vars = {}
    const note = (v, what) => { (vars[v] ??= new Set()).add(what) }
    for (const [n, st] of Object.entries(this.nodes)) {
      for (const t of st.transitions ?? []) for (const c of t.when ?? []) if (c.var) note(c.var, `checked in ${n}`)
      for (const p of st.sequence ?? []) if (p.var) note(p.var, `${p.action === 'set_cooldown' ? 'a cooldown started' : 'set'} in ${n}`)
    }
    for (const r of this.thing.any ?? []) for (const c of r.when ?? []) if (c.var) note(c.var, 'checked in "whatever it is doing"')
    for (const v of Object.keys(this.thing.vars ?? {})) note(v, `starts at ${this.thing.vars[v]}`)
    const names = Object.keys(vars).filter((v) => !v.startsWith('__'))
    const changed = () => this.changed()
    const more = this.kind === 'mob'
      ? [el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Its brain: blood, pain, drops and the rest' }), ...brainRows(this.S, this.thing, { ...this.formCtx(), words: MOB_WORDS })]),
          el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Its default swing' }),
            el('span', { class: 'me-muted', text: 'What a swing step leaves out. A swing is a step like any other attack (Behaviour: a state, + add a step, Attack): its numbers in it.' }),
            ...this.swingSection(this.thing, 'This monster'), ...slashRows(this.S, 'monster', this.name, changed)]),
          this.prop ? el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Its body states' }), ...bodyRows(this.S, this.prop, changed)]) : null]
      : [el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'The weapon' }), ...weaponRows(this.S, this.name, this.thing, { ...this.formCtx(), words: WEAPON_WORDS })]),
          el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Its default swing' }),
            el('span', { class: 'me-muted', text: 'Swung by the attack button while no state has a swing step, and what a swing step leaves out. A swing is a step like any other attack: its numbers in it.' }),
            ...this.swingSection(this.thing, 'This weapon'), ...slashRows(this.S, 'weapon', this.name, changed)])]
    return [el('div', { class: 'me-panel' }, [el('div', { class: 'me-h first', text: 'Its numbers' }),
      el('span', { class: 'me-muted', text: 'Numbers it remembers, like which phase it is in or a cooldown. One exists as soon as a step sets it or a rule checks it: add a "set the number" step to make one.' }),
      ...(names.length ? names.map((v) => {
        const start = el('input', { type: 'text', inputmode: 'numeric', value: String(this.thing.vars?.[v] ?? 0), 'aria-label': `${v} starts at`, style: 'width:56px' })
        start.addEventListener('change', () => { const n = Math.round(Number(start.value)); if (Number.isFinite(n)) { (this.thing.vars ??= {})[v] = n; this.changed() } })
        return el('div', { class: 'me-frow inline' }, [el('span', { class: 'me-mono', text: v }), el('span', { class: 'me-muted', text: [...vars[v]].filter((t) => !/^starts at/.test(t)).join('; ') }), el('label', { class: 'me-muted' }, ['starts at ', start])])
      }) : [el('span', { class: 'me-muted', text: 'none yet' })])]), ...more.filter(Boolean)]
  }
}

// ---- entry points: one window per kind, kept across visits ----
export function openMonsters (S, name = null) {
  S.monsterEditor ??= new NodeEditor(S, 'mob')
  S.monsterEditor.open(name)
  return S.monsterEditor
}
export function openWeapons (S, name = null) {
  S.weaponEditor ??= new NodeEditor(S, 'weapon')
  S.weaponEditor.open(name)
  return S.weaponEditor
}

export { condKey, shortOf, chooser }
