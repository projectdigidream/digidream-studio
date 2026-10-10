//
// The monster workshop: its own windows, over the whole screen.
//
// A monster is more than a sheet can hold: a picture that moves, a brain that
// is a graph, and a page of numbers. So the Mobs tool opens this instead of a
// sheet -- three windows side by side (one at a time on a phone):
//
//   PREVIEW   the monster drawn from its own sheet, playing an animation,
//             turnable through its views -- frames and rotations picked by the
//             client's own code (client/src/render/{atlas,props}.js), so what
//             plays here is what the game will draw
//   GRAPH     the brain as states and arrows: transitions, timed `next`, and
//             `goto` jumps; drag to arrange, tap to edit, link to add
//   DETAILS   the tapped state, or the brain's numbers, body, vars, missiles
//
// Edits write into the module document and re-draw the windows; the layout
// of the graph is kept in the module too (module.layouts), outside the table
// mobs.load{} reads.
//
import { useStroke, useText } from '../vendor/uikit/runtime.js'
import { el, row, slider, select, button, chips, muted, text, ask, confirmDialog, withIcon, icon } from './ui.js'
import { parseAtlas, frameKey, quadFor } from '/src/render/atlas.js'
import { rotationFor, frameAt } from '/src/render/props.js'
import { edgesOf, autoLayout, problemsByState, NODE_W, NODE_H, MOB_SHAPE, WEAPON_SHAPE } from './graph.js'
import { newMonster, deleteMonster, bodyRows, brainRows, varsRows, stateRows, missilesSection, STATE_NAMES } from './brain.js'
import { newWeapon, deleteWeapon, newArsenal } from './weapons_emit.js'
import { swingRows, newSwing, SwingPreview } from './swing.js'
import { slashRows } from './slashform.js'
import { avatarRows, weaponRows, arsenalRows } from './arms.js'
import { bodyRows as playerBodyRows, moveRows, kitRows, newPlayer, soundRows as playerSoundRows } from './player.js'

/** Pointer capture that does not throw for a pointer the browser has already let go of. */
function capture (node, e) {
  try { node.setPointerCapture(e.pointerId) } catch {}
}

/**
 * The two windows, which are one window.
 *
 * A monster's brain and a weapon are the same graph -- named nodes with
 * `ticks`, a `next`, a `sequence` and `transitions` checked in order -- so
 * they are edited by the same machine with two sets of bindings. What differs
 * is the vocabulary each validates against, the word for a node, and what the
 * detail tabs show. See graph.js.
 */
export function openWorkshop (S, mobName = null) { return open(S, 'mob', mobName) }
export function openArsenal (S, name = null) { return open(S, 'weapon', name) }
export function openPlayer (S) { return open(S, 'player', null) }

function open (S, kind, name) {
  S.workshop ??= new Workshop(S)
  S.workshop.open(kind, name)
  return S.workshop
}

// What each window is made of. Everything the editor does that depends on
// WHICH kind of thing is being edited is a line in here.
const SPECS = {
  mob: {
    kind: 'mob',
    word: 'monster',
    node: 'state',
    shape: MOB_SHAPE,
    home: (S) => { S.module.mobs ??= { missiles: {}, mobs: {} }; return S.module.mobs.mobs },
    layoutKey: (name) => name,
    vocab: (S) => S.vocab.mob,
    conditionSpec: (S, n) => S.vocab.mobConditions.get(n),
    actionSpec: (S, n) => S.vocab.mobActions.get(n),
    problems: (S) => S.vocab.validateMobs(S.module.mobs, { props: S.propNames?.() ?? null }),
    make: (S, raw) => newMonster(S, raw),
    remove: (S, name) => deleteMonster(S, name),
    // The body that draws it: its own prop record.
    prop: (S, name, subject) => (S.module.props ?? []).find((p) => p.name === (subject?.prop ?? name)),
    tabs: [['node', '', 'workshop.state'], ['brain', 'brain', 'workshop.brain'], ['swing', 'swing', 'workshop.swing'], ['slash', 'slash', 'sfx.whoosh'], ['body', 'body', 'workshop.body'], ['vars', 'vars', 'workshop.vars'], ['missiles', 'missiles', 'workshop.missiles']]
  },
  weapon: {
    kind: 'weapon',
    word: 'weapon',
    node: 'phase',
    shape: WEAPON_SHAPE,
    home: (S) => { S.module.weapons ??= newArsenal(); return S.module.weapons.weapons },
    // Namespaced, because a weapon and a monster may share a name and their
    // graphs are laid out separately.
    layoutKey: (name) => `weapon:${name}`,
    vocab: (S) => S.vocab.weapon,
    conditionSpec: (S, n) => S.vocab.weaponConditions.get(n),
    actionSpec: (S, n) => S.vocab.weaponActions.get(n),
    problems: (S) => S.vocab.validateWeapons(S.module),
    make: (S, raw) => newWeapon(S.module, raw),
    remove: (S, name) => deleteWeapon(S.module, name),
    // A weapon is held by the PLAYER, so the preview shows the player's art.
    prop: (S) => (S.module.props ?? []).find((p) => p.name === S.module.player?.prop),
    tabs: [['node', '', 'workshop.state'], ['weapon', 'weapon', 'workshop.weapon'], ['swing', 'swing', 'workshop.swing'], ['slash', 'slash', 'sfx.whoosh'], ['vars', 'vars', 'workshop.vars'], ['arsenal', 'arsenal', 'workshop.arsenal']]
  },
  // The player, who has no graph: nothing about them is a state machine, so
  // the window is its preview and its forms.
  player: {
    kind: 'player',
    word: 'player',
    node: null,
    graph: false,
    shape: MOB_SHAPE,
    sibling: { label: 'weapons', icon: 'section.weapons', kind: 'weapon' },
    home: (S) => { S.module.player ??= newPlayer(); return { player: S.module.player } },
    layoutKey: (name) => `player:${name}`,
    vocab: (S) => S.vocab.mob,
    conditionSpec: (S, n) => S.vocab.mobConditions.get(n),
    actionSpec: (S, n) => S.vocab.mobActions.get(n),
    problems: () => [],
    make: () => null,
    remove: () => {},
    prop: (S) => (S.module.props ?? []).find((p) => p.name === S.module.player?.prop),
    tabs: [['skin', 'skin', 'workshop.skin'], ['size', 'size', 'workshop.size'], ['moves', 'moves', 'workshop.moves'], ['kit', 'kit', 'workshop.arsenal'], ['sounds', 'sounds', 'workshop.sounds'], ['slash', 'slash', 'sfx.whoosh']]
  }
}

class Workshop {
  constructor (S) {
    this.S = S
    this.kind = 'mob'
    this.mob = null
    this.state = null
    this.tab = 'node'
    this.pane = 'graph'
    this.view = { x: 0, y: 0, z: 1 }
    this.linking = false
    // `anim` is a body state (0..4) to play; `animName` plays a named animation of the sheet instead.
    this.play = { anim: 0, animName: null, playing: true, facing: 0, t0: performance.now(), frame: 0 }
    // The swing, played rather than drawn still: a volume moving through time
    // is the one thing a still picture cannot show.
    this.swingPreview = new SwingPreview(() => S.skin)
    this.images = new Map()        // url -> HTMLImageElement
    this.atlases = new Map()       // sheet -> parsed atlas (served ones)
    this.raf = 0
    this.root = el('div', { class: 'wk', 'data-pane': this.pane })
    document.body.appendChild(this.root)
    this.root.hidden = true
  }

  open (kind, name) {
    const S = this.S
    S.module.props ??= []
    if (kind && kind !== this.kind) {
      this.kind = kind
      this.mob = null
      this.state = null
      this.tab = this.spec.tabs[0][0]
      if (this.spec.graph === false && this.pane === 'graph') this.pane = 'details'
    }
    const home = this.spec.home(S)
    const names = Object.keys(home)
    this.mob = name && home[name] ? name : (this.mob && home[this.mob] ? this.mob : names[0] ?? null)
    this.state = null
    this.root.hidden = false
    S.ui.layer.dataset.workshop = '1'
    S.ui.hideSheet()
    this.render()
    this.#loop()
  }

  close () {
    this.swingPreview.stop()
    this.root.hidden = true
    this.S.ui.layer.dataset.workshop = '0'
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.S.ui.setTool('select')
    this.S.tool = 'select'
  }

  get spec () { return SPECS[this.kind] }
  get brain () { return this.mob ? this.spec.home(this.S)[this.mob] : null }
  /** The graph's nodes, whatever they are called for this kind. */
  get nodes () { return this.brain?.[this.spec.shape.nodes] ?? {} }
  get prop () { return this.spec.prop(this.S, this.mob, this.brain) }
  get layout () {
    const m = this.S.module
    m.layouts ??= {}
    if (!this.mob) return {}
    const key = this.spec.layoutKey(this.mob)
    m.layouts[key] = autoLayout(this.brain, m.layouts[key] ?? {}, this.spec.shape)
    return m.layouts[key]
  }

  changed () {
    this.S.moduleChanged()
    this.render()
  }

  // --- the windows -------------------------------------------------------------------

  render () {
    const S = this.S
    const sp = this.spec
    const names = Object.keys(sp.home(S))
    const problems = this.#problems()
    const top = el('div', { class: 'wk-top' }, [
      button(withIcon('action.back', 'back'), () => (S.leave ? S.leave() : this.close()), 'wk-back'),
      // Across to the sibling window. A monster's claw and a player's fist are
      // the same facility, so moving between them should not be a trip out to
      // the level and back in again.
      sp.sibling ? button(withIcon(sp.sibling.icon, sp.sibling.label), () => (S.go ? S.go({ mob: 'monsters', weapon: 'weapons', player: 'player' }[sp.sibling.kind]) : this.open(sp.sibling.kind, null))) : null,
      sp.graph === false ? el('span', { class: 'st-muted wk-note', text: 'one player for the module; a map may override parts' }) : null,
      sp.graph === false ? null : chips([...names.map((n) => ({ id: n, label: n, on: n === this.mob })), { id: '+', label: `+ new ${sp.word}` }], async (it) => {
        if (it.id === '+') {
          const raw = await ask(`${sp.word} name (letters, digits, underscore)`, sp.kind === 'mob' ? 'grunt' : 'pistol')
          const name = raw ? sp.make(S, raw) : null
          if (raw && !name) S.status('that name is empty or taken', 'warn')
          if (name) { this.mob = name; this.state = null; this.changed() }
          return
        }
        this.mob = it.id; this.state = null; this.render()
      }),
      // Said in the window, because the window is opened from a level and the
      // thing being edited is not the level's. One monster, one weapon, one
      // arsenal per MODULE -- both runtimes load them once per level.
      sp.graph === false ? null : el('span', { class: 'st-muted wk-note', text: `${sp.word}s belong to the module, not to one map` }),
      el('span', { style: 'flex:1 1 auto' }),
      problems.length ? el('span', { class: 'st-danger', text: `${problems.length} problem(s)`, title: problems.join('\n') }) : el('span', { class: 'st-muted', text: 'loads clean' }),
      el('div', { class: 'wk-tabs' }, [
        ['preview', 'preview', 'workshop.preview'], ...(sp.graph === false ? [] : [['graph', 'graph', 'workshop.state']]), ['details', 'details', 'workshop.details']
      ].map(([id, label, i]) => el('button', { icon: i, text: label, 'data-on': this.pane === id ? '1' : '0', onclick: () => { this.pane = id; this.root.dataset.pane = id; this.#syncTabs() } })))
    ])
    const details = el('div', { class: 'wk-details' })
    const keep = this.root.querySelector('.wk-details')?.scrollTop ?? 0
    this.root.dataset.nograph = sp.graph === false ? '1' : '0'
    this.root.replaceChildren(top, this.#previewPane(), ...(sp.graph === false ? [] : [this.#graphPane(problems)]), details)
    this.#fillDetails(details, problems)
    details.scrollTop = keep
    this.#syncTabs()
  }

  /** This kind's problems, in the runtime's own words. */
  #problems () {
    if (this.kind === 'weapon' && !this.S.vocab.weapon) {
      return ['the weapon vocabulary is not staged with this studio, so nothing here can be checked (scripts/build_app.sh --studio)']
    }
    return this.spec.problems(this.S)
  }

  #syncTabs () {
    for (const b of this.root.querySelectorAll('.wk-tabs button')) b.dataset.on = b.textContent.includes(this.pane) ? '1' : '0'
  }

  // --- preview -------------------------------------------------------------------------

  #previewPane () {
    const canvas = el('canvas', { class: 'wk-canvas', width: 320, height: 320 })
    this.canvas = canvas
    const prop = this.prop
    const p = this.play
    const stateChips = chips([0, 1, 2, 3, 4].map((st) => ({ id: st, label: `${st} ${STATE_NAMES[st]}${prop?.art?.states?.[st] ? ' · ' + prop.art.states[st] : ''}`, on: p.animName === null && p.anim === st })),
                             (it) => { p.anim = it.id; p.animName = null; p.t0 = performance.now(); this.render() })
    // Any animation of the sheet, by name, whether or not a state uses it.
    // A served sheet's list arrives when its manifest does (#drawPreview).
    const sheet = prop?.art?.kind === 'atlas' ? prop.art.sheet : null
    this.animSelect = select('animation', p.animName ?? '', [['', "the state's"]], (v) => { p.animName = v || null; p.t0 = performance.now(); this.render() })
    if (sheet) this.#fillAnims(sheet, this.#sheet(sheet)?.atlas.animations.map((a) => a.name) ?? this.S.module.sprites?.[sheet]?.animations ?? [])
    // Drag across the picture to turn the monster; the slider does the same.
    let dragX = null
    canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; capture(canvas, e) })
    canvas.addEventListener('pointermove', (e) => { if (dragX === null) return; p.facing = ((p.facing + (e.clientX - dragX) / 300) % 1 + 1) % 1; dragX = e.clientX; this.#refreshFacing() })
    canvas.addEventListener('pointerup', () => { dragX = null })
    canvas.addEventListener('pointercancel', () => { dragX = null })
    this.facingRow = slider('facing (turns)', Math.round(p.facing * 100) / 100, { min: 0, max: 1, step: 0.01 }, (v) => { p.facing = v })
    this.viewLabel = el('div', { class: 'st-muted', text: '' })
    return el('div', { class: 'wk-preview' }, [
      el('div', { class: 'wk-title', text: this.mob ? `${this.mob}${prop?.art?.sheet ? ' · ' + prop.art.sheet : ''}` : 'no monster' }),
      canvas,
      this.viewLabel,
      stateChips,
      sheet ? this.animSelect : null,
      el('div', { class: 'st-row' }, [
        button(p.playing ? withIcon('transport.pause', 'pause') : withIcon('transport.play', 'play'), () => { p.playing = !p.playing; p.t0 = performance.now(); this.render() }),
        button(withIcon('action.rotateleft', 'turn'), () => { p.facing = (p.facing + 0.125) % 1; this.#refreshFacing() })
      ]),
      this.facingRow,
      muted('Drag across the picture to turn it. The ruler is in world units: the sheet\'s height sets the size (body card). Frames and views are chosen by the client\'s own code, so this is what the game draws.')
    ])
  }

  #fillAnims (sheet, names) {
    const s = this.animSelect?.querySelector('select')
    if (!s || s.dataset.sheet === sheet) return
    s.dataset.sheet = sheet
    s.replaceChildren(...[['', "the state's"], ...names.map((n) => [n, n])].map(([v, t]) => el('option', { value: v, text: t })))
    s.value = this.play.animName && names.includes(this.play.animName) ? this.play.animName : ''
  }

  #refreshFacing () {
    const input = this.facingRow?.querySelector('input')
    if (input) { input.value = String(Math.round(this.play.facing * 100) / 100); input.nextSibling.textContent = input.value }
  }

  #loop () {
    cancelAnimationFrame(this.raf)
    const tick = () => {
      if (this.root.hidden) return
      this.#drawPreview()
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  #image (url) {
    if (this.images.has(url)) return this.images.get(url)
    const img = new Image()
    img.src = url
    this.images.set(url, img)
    return img
  }

  /** The parsed atlas and picture for a sheet name: the module's, or the served catalogue's. */
  #sheet (name) {
    const own = this.S.sheets.get(name)
    if (own) return { atlas: own.atlas, img: this.#image(own.imageUrl) }
    if (this.atlases.has(name)) { const a = this.atlases.get(name); return a ? { atlas: a, img: this.#image(`/sprites/${a.image}`) } : null }
    this.atlases.set(name, null)
    fetch(`/sprites/${name}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) this.atlases.set(name, parseAtlas(j, name)) }).catch(() => {})
    return null
  }

  #drawPreview () {
    const c = this.canvas
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.imageSmoothingEnabled = false
    const prop = this.prop
    const p = this.play
    const seconds = p.playing ? (performance.now() - p.t0) / 1000 : p.frame / 8
    const floor = c.height - 24.5
    // THE PICTURE IS TO SCALE: world units against a ruler, so the sheet's
    // height (the one size the client draws by) is a thing you can see and
    // compare, not a picture stretched to fit the window.
    const src = prop?.art?.kind === 'atlas' && prop.art.sheet ? this.#sheet(prop.art.sheet) : null
    const kind = !src && this.mob ? [...this.S.kinds.values()].find((x) => x.name === this.mob) : null
    // The kind's drawing scale, as the game applies it (props.js propScale).
    const scale = Number(prop?.scale) > 0 ? Number(prop.scale) : 1
    const tall = (src ? src.atlas.worldHeight : (kind?.size ?? 1)) * scale
    const ppu = (floor - 8) / Math.max(2.5, tall * 1.15)
    // The skin's ruler (half units on its minor grid), and its floor line.
    const skin = this.S.skin
    const ruler = skin.canvas('common', 'ruler')
    ctx.font = ruler.font
    ctx.textAlign = 'left'
    for (let u = 0.5; u * ppu < floor - 8; u += 0.5) {
      const y = Math.round(floor - u * ppu) + 0.5
      useStroke(ctx, u % 1 ? skin.canvas('common', 'grid.minor') : skin.canvas('common', 'grid.major'))
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke()
      if (!(u % 1)) { ctx.fillStyle = ruler.color; ctx.fillText(`${u}`, 4, y - 2) }
    }
    useStroke(ctx, skin.canvas('preview', 'floor'))
    ctx.beginPath(); ctx.moveTo(0, floor); ctx.lineTo(c.width, floor); ctx.stroke()
    ctx.setLineDash([])
    let drew = false
    if (src) {
      if (src.atlas) this.#fillAnims(prop.art.sheet, src.atlas.animations.map((a) => a.name))
      const animName = p.animName ?? prop.art.states?.[p.anim]
      const anim = animName ? src.atlas.byName.get(animName) : null
      if (anim && src.img.complete && src.img.naturalWidth) {
        const n = anim.frames.length
        const i = n <= 1 || !anim.fps ? 0 : (anim.loop === false ? Math.min(n - 1, Math.floor(seconds * anim.fps)) : Math.floor(seconds * anim.fps) % n)
        const view = rotationFor(p.facing, 0, src.atlas.views.count)
        const key = frameKey(src.atlas, anim.name, i, view)
        const f = src.atlas.frames[key]
        const q = f ? quadFor(src.atlas, key, src.atlas.worldHeight * scale) : null
        if (q) {
          // quadFor: the trimmed frame in world units, centred dx beside the feet and dy above them.
          const cx = c.width / 2 + q.dx * ppu
          ctx.drawImage(src.img, f.rect.x, f.rect.y, f.rect.w, f.rect.h, cx - q.w * ppu / 2, floor - (q.dy + q.h / 2) * ppu, q.w * ppu, q.h * ppu)
          drew = true
          this.viewLabel.textContent = `${anim.name} · frame ${i + 1}/${n} · view ${view}/${src.atlas.views.count} · ${anim.fps} fps${anim.loop === false ? ' · once' : ''} · ${tall} tall`
        }
      } else if (!anim) this.viewLabel.textContent = animName ? `no animation '${animName}' in ${prop.art.sheet}` : 'no animation for this state'
    } else if (prop?.art?.kind === 'atlas' && prop.art.sheet) {
      this.viewLabel.textContent = `loading ${prop.art.sheet}…`
    } else if (this.mob) {
      // A classic per-frame kind from the served catalogue, if the name is one.
      const k = kind
      const st = k?.states?.get(p.anim)
      if (k?.type === 'sprite' && st?.frames?.length) {
        const i = frameAt(st, seconds)
        const view = rotationFor(p.facing, 0, 8)
        const img = this.#image(`/sprites/${st.frames[i]}${k.rot8 ? view : ''}.png`)
        if (img.complete && img.naturalWidth) {
          const h = tall * ppu
          const w = h * img.naturalWidth / img.naturalHeight
          ctx.drawImage(img, (c.width - w) / 2, floor - h, w, h)
          drew = true
          this.viewLabel.textContent = `${st.frames[i]} · frame ${i + 1}/${st.frames.length} · view ${view}/8 · ${st.fps} fps`
        }
      }
    }
    if (!drew) {
      useText(ctx, this.S.skin.canvas('common', 'text'))
      ctx.textAlign = 'center'
      ctx.fillText(this.mob ? 'no picture: give the body a sheet' : 'no monster', c.width / 2, c.height / 2)
    }
  }

  // --- graph ---------------------------------------------------------------------------

  #graphPane (problems) {
    const m = this.brain
    const pane = el('div', { class: 'wk-graph' })
    const bar = el('div', { class: 'wk-bar' }, [
      button(`+ ${this.spec.node}`, () => { this.#addState() }),
      this.state ? button(withIcon('status.initial', 'initial'), () => { m.initial = this.state; this.changed() }) : null,
      this.state ? button(this.linking ? 'tap the target…' : withIcon('action.link', 'link'), () => { this.linking = !this.linking; this.render() }) : null,
      this.state ? button(withIcon('action.close', `${this.spec.node}`), () => { delete this.nodes[this.state]; this.state = null; this.changed() }, 'st-danger') : null,
      button('auto layout', () => { this.S.module.layouts[this.spec.layoutKey(this.mob)] = autoLayout(m, {}, this.spec.shape); this.S.moduleChanged(); this.render() }),
      this.mob ? button(`delete ${this.spec.word}`, async () => { if (await confirmDialog(`delete ${this.spec.word} ${this.mob}?`)) { this.spec.remove(this.S, this.mob); this.mob = null; this.state = null; this.changed() } }, 'st-danger') : null
    ])
    pane.appendChild(bar)
    if (!m) { pane.appendChild(muted(`No ${this.spec.word}. Make one with "+ new ${this.spec.word}".`)); return pane }

    const layout = this.layout
    const bad = problemsByState(problems, this.mob, { kind: this.spec.kind, node: this.spec.node })
    const world = el('div', { class: 'wk-world' })
    world.appendChild(this.#edgesSvg(m, layout))
    for (const [name, st] of Object.entries(this.nodes)) {
      const pos = layout[name]
      const node = el('div', { class: 'wk-node' + (name === this.state ? ' wk-node-on' : '') + (bad.has(name) ? ' wk-node-bad' : ''),
                             style: `left:${pos.x}px;top:${pos.y}px`, title: bad.get(name)?.join('\n') ?? '' }, [
        el('div', { class: 'wk-node-name', icon: m.initial === name ? 'status.initial' : null, text: name }),
        el('div', { class: 'st-muted', text: `anim ${st.anim ?? '?'} · ${st.move ?? 'stop'}${st.ticks !== undefined ? ` · ${st.ticks}t → ${st.next ?? '?'}` : ''}` }),
        el('div', { class: 'st-muted', text: `${(st.transitions ?? []).length} out · ${(st.sequence ?? []).length} steps` })
      ])
      this.#nodeGestures(node, name, pos)
      world.appendChild(node)
    }
    world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})`
    const board = el('div', { class: 'wk-board' }, [world])
    pane.appendChild(board)
    this.#paneGestures(board, world)
    board.appendChild(this.#zoomBar(board))
    return pane
  }

  /** The arrows between nodes, as one SVG: rebuilt on its own while a node is dragged. */
  #edgesSvg (m, layout) {
    const edges = edgesOf(m, this.spec.shape)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'wk-edges')
    svg.innerHTML = '<defs><marker id="wk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--cv-graph-edge-transition)"/></marker></defs>'
    const centre = (n) => ({ x: (layout[n]?.x ?? 0) + NODE_W / 2, y: (layout[n]?.y ?? 0) + NODE_H / 2 })
    for (const e of edges) {
      if (!layout[e.to]) continue
      const a = centre(e.from); const b = centre(e.to)
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      let d; let lx; let ly
      if (e.from === e.to) {
        const x = a.x + NODE_W / 2; const y = a.y
        d = `M${x},${y - 12} C${x + 60},${y - 50} ${x + 60},${y + 50} ${x},${y + 12}`
        lx = x + 48; ly = y
      } else {
        const dx = b.x - a.x
        const sx = a.x + Math.sign(dx || 1) * NODE_W / 2; const tx = b.x - Math.sign(dx || 1) * NODE_W / 2
        const c1 = Math.abs(dx) < NODE_W ? 60 : Math.abs(dx) / 3
        d = `M${sx},${a.y} C${sx + Math.sign(dx || 1) * c1},${a.y} ${tx - Math.sign(dx || 1) * c1},${b.y} ${tx},${b.y}`
        lx = (sx + tx) / 2; ly = (a.y + b.y) / 2 - 6
      }
      path.setAttribute('d', d)
      path.setAttribute('class', `wk-edge wk-edge-${e.kind}`)
      path.setAttribute('marker-end', 'url(#wk-arrow)')
      svg.appendChild(path)
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', lx); label.setAttribute('y', ly)
      label.setAttribute('class', 'wk-label')
      label.textContent = e.label
      label.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); this.state = e.from; this.tab = 'node'; this.pane = 'details'; this.root.dataset.pane = 'details'; this.render(); this.#scrollToTransition(e) })
      svg.appendChild(label)
    }
    return svg
  }

  async #addState () {
    const m = this.brain
    if (!m) return
    const n = await ask(`${this.spec.node} name`, this.kind === 'mob' ? 'wander' : 'reload')
    if (!n) return
    const name = n.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!name || this.nodes[name]) return
    this.nodes[name] = this.kind === 'mob'
      ? { anim: 0, move: 'stop', face: 'hold', ticks: 30, next: m.initial ?? name }
      : { anim: 0, ticks: 20, next: m.initial ?? name }
    this.state = name
    this.changed()
  }

  #nodeGestures (node, name, pos) {
    let start = null
    let moved = false
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      capture(node, e)
      start = { x: e.clientX, y: e.clientY, nx: pos.x, ny: pos.y }
      moved = false
    })
    node.addEventListener('pointermove', (e) => {
      if (!start) return
      const dx = (e.clientX - start.x) / this.view.z; const dy = (e.clientY - start.y) / this.view.z
      if (Math.hypot(dx, dy) > 4) moved = true
      if (moved) { pos.x = Math.round(start.nx + dx); pos.y = Math.round(start.ny + dy); node.style.left = `${pos.x}px`; node.style.top = `${pos.y}px`; this.#redrawEdges() }
    })
    node.addEventListener('pointerup', () => {
      if (!start) return
      start = null
      if (moved) { this.S.moduleChanged(); return }
      if (this.linking && this.state && this.state !== name) {
        const from = this.brain.states[this.state]
        ;(from.transitions ??= []).push({ to: name, when: [] })
        this.linking = false
        this.tab = 'node'
        this.changed()
        return
      }
      this.linking = false
      this.state = name
      this.tab = 'node'
      this.render()
    })
    node.addEventListener('pointercancel', () => { start = null })
  }

  #redrawEdges () {
    // Only the arrows. Rebuilding the pane replaced the node under the finger
    // with a new one that knew nothing of the drag, and the pointer capture
    // went with the old one: on a phone the drag ended a few pixels in.
    const old = this.root.querySelector('.wk-world > .wk-edges')
    if (old) old.replaceWith(this.#edgesSvg(this.brain, this.layout))
  }

  /**
   * The board: one finger (or the mouse) on empty board pans, two pinch, the
   * wheel zooms about the pointer -- as the graph window's board does.
   */
  #paneGestures (pane, world) {
    const apply = () => {
      world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})`
      if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(this.view.z * 100)}%`
    }
    this.applyView = apply
    const pts = new Map()
    let last = null
    pane.addEventListener('pointerdown', (e) => {
      if (e.target !== pane && e.target !== world && !e.target.classList?.contains('wk-edges')) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      last = null
      capture(pane, e)
    })
    pane.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return
      const prev = pts.get(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1) { this.view.x += e.clientX - prev.x; this.view.y += e.clientY - prev.y }
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (last) this.#zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / last, pane)
        last = d
      }
      apply()
    })
    const end = (e) => { pts.delete(e.pointerId); last = null }
    pane.addEventListener('pointerup', end)
    pane.addEventListener('pointercancel', end)
    pane.addEventListener('wheel', (e) => { e.preventDefault(); this.#zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY / 400), pane); apply() }, { passive: false })
  }

  /** Zoom by `factor` about a screen point, keeping what is under it there. */
  #zoomAt (cx, cy, factor, pane) {
    const r = pane.getBoundingClientRect()
    const z = Math.min(2.5, Math.max(0.25, this.view.z * factor))
    const k = z / this.view.z
    const px = cx - r.left; const py = cy - r.top
    this.view.x = px - (px - this.view.x) * k
    this.view.y = py - (py - this.view.y) * k
    this.view.z = z
  }

  /** −, the zoom, +, and every node in view: for a phone, where a pinch is not always at hand. */
  #zoomBar (pane) {
    this.zoomLabel = el('span', { class: 'wk-zoom-pct', text: `${Math.round(this.view.z * 100)}%` })
    const mid = (f) => { const r = pane.getBoundingClientRect(); this.#zoomAt(r.left + r.width / 2, r.top + r.height / 2, f, pane); this.applyView?.() }
    const bar = el('div', { class: 'wk-zoom' }, [
      el('button', { title: 'zoom out', 'data-zoom': 'out', onclick: () => mid(1 / 1.25) }, withIcon('action.zoomout')),
      this.zoomLabel,
      el('button', { text: '+', title: 'zoom in', 'data-zoom': 'in', onclick: () => mid(1.25) }),
      el('button', { title: 'every node in view', 'data-zoom': 'fit', onclick: () => this.fitAll(pane) }, withIcon('action.fit'))
    ])
    bar.addEventListener('pointerdown', (e) => e.stopPropagation())
    return bar
  }

  /** Every node in view, as large as fits. */
  fitAll (pane) {
    const nodes = [...pane.querySelectorAll('.wk-world > .wk-node')]
    const layout = this.layout
    const names = Object.keys(this.nodes ?? {})
    if (!names.length) return
    const x0 = Math.min(...names.map((n) => layout[n]?.x ?? 0)); const y0 = Math.min(...names.map((n) => layout[n]?.y ?? 0))
    const x1 = Math.max(...names.map((n, i) => (layout[n]?.x ?? 0) + (nodes[i]?.offsetWidth ?? 160)))
    const y1 = Math.max(...names.map((n, i) => (layout[n]?.y ?? 0) + (nodes[i]?.offsetHeight ?? 70)))
    const r = pane.getBoundingClientRect()
    const z = Math.min(2, Math.max(0.25, Math.min((r.width - 40) / Math.max(1, x1 - x0), (r.height - 80) / Math.max(1, y1 - y0))))
    this.view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: 20 - y0 * z }
    this.applyView?.()
  }

  #scrollToTransition (e) {
    if (e.kind !== 'transition') return
    const card = this.root.querySelector(`.wk-details [data-transition="${e.index}"]`)
    card?.scrollIntoView({ block: 'center' })
    card?.classList.add('wk-flash')
  }

  // --- details ---------------------------------------------------------------------------

  #fillDetails (pane, problems) {
    const S = this.S
    const sp = this.spec
    const m = this.brain
    const weapon = this.kind === 'weapon'
    const changed = () => this.changed()
    const nodeNames = Object.keys(this.nodes)
    const ctx = {
      onChange: changed, changed, status: (t, l) => S.status(t, l),
      states: nodeNames, phases: nodeNames, vars: Object.keys(m?.vars ?? {}),
      missiles: Object.keys(S.module.mobs?.missiles ?? {}), mobs: Object.keys(S.module.mobs?.mobs ?? {}),
      props: S.propNames?.() ?? [],
      ammo: Object.keys(S.module.weapons?.ammo ?? {}), weapons: Object.keys(S.module.weapons?.weapons ?? {}),
      vfxChoices: () => S.vfxChoices?.() ?? [],
      suggest: (n, o) => S.suggest?.(n, o) ?? null,
      soundField: S.soundField
    }
    const nodeSpec = weapon
      ? { fields: sp.vocab(S)?.phase_fields ?? [], conditions: sp.vocab(S)?.conditions ?? [], actions: sp.vocab(S)?.actions ?? [],
          conditionSpec: (n) => sp.conditionSpec(S, n), actionSpec: (n) => sp.actionSpec(S, n) }
      : null
    const tabs = el('div', { class: 'wk-tabs' }, sp.tabs
      .map(([id, label, i]) => [id, id === 'node' ? `${this.state ?? sp.node}` : label, i])
      .map(([id, label, i]) => el('button', { icon: i, text: label, 'data-on': this.tab === id ? '1' : '0', onclick: () => { this.tab = id; this.render() } })))
    const body = []
    if (!m && this.kind !== 'player') body.push(muted(`No ${sp.word}.`))
    else if (this.tab === 'node') {
      const st = this.state ? this.nodes[this.state] : null
      if (!st) body.push(muted(`Tap a ${sp.node} in the graph, or an arrow, to edit it here.`))
      else {
        body.push(el('div', { class: 'st-row' }, [
          text('name', this.state, (v) => this.#renameState(this.state, v)).lastChild.parentElement
        ]))
        body.push(...stateRows(S, m, this.state, st, ctx, changed, {
          onPickTarget: () => { this.linking = true; this.pane = 'graph'; this.root.dataset.pane = 'graph'; this.render() },
          vocab: nodeSpec, nodes: sp.shape.nodes, skip: weapon ? ['swing'] : []
        }))
        // A PHASE MAY CARRY ITS OWN SWING, replacing the weapon's while it is
        // in it -- which is what makes a combo escalate rather than being three
        // names for one blow.
        if (weapon) body.push(...this.#swingSection(st, `this ${sp.node}`, ctx))
        const mine = problemsByState(problems, this.mob, { kind: sp.kind, node: sp.node }).get(this.state)
        if (mine) body.push(el('div', { class: 'st-danger', text: mine.join('\n'), style: 'white-space:pre-wrap;font-size:12px' }))
      }
    } else if (this.tab === 'brain') body.push(...brainRows(S, m, ctx))
    else if (this.tab === 'weapon') body.push(...weaponRows(S, this.mob, m, ctx))
    else if (this.tab === 'swing') {
      body.push(...this.#swingSection(m, `every ${sp.node}`, ctx))
      body.push(muted('How the swing is drawn in the game -- its slash streak -- is in the slash tab.'))
    } else if (this.tab === 'slash') {
      // How the swing is drawn in the game: the slash streak (docs/SWINGS.md),
      // this monster's or weapon's own, or the player's default for every swing.
      body.push(...slashRows(S, this.kind === 'player' ? 'default' : weapon ? 'weapon' : 'monster', this.mob, changed))
    }
    else if (this.tab === 'body') body.push(...(weapon ? avatarRows(S, { changed }) : bodyRows(S, this.prop, changed)))
    else if (this.tab === 'vars') body.push(...varsRows(m, changed))
    else if (this.tab === 'missiles') body.push(...missilesSection(S, changed))
    else if (this.tab === 'arsenal') body.push(...arsenalRows(S, { ...ctx, changed }))
    else if (this.tab === 'skin') body.push(...avatarRows(S, { changed }))
    else if (this.tab === 'sounds') body.push(...playerSoundRows(S, { changed }))
    else if (this.tab === 'size' || this.tab === 'moves' || this.tab === 'kit') {
      // Module-wide or this map's override: a module change re-bakes through
      // moduleChanged, a map's through commit (so it is undoable with the map).
      const pctx = { changed, commit: () => { S.commit(); this.render() }, render: () => this.render() }
      body.push(...({ size: playerBodyRows, moves: moveRows, kit: kitRows })[this.tab](S, pctx))
    }
    pane.replaceChildren(tabs, ...body.filter(Boolean))
  }

  /**
   * The swept collider `owner` declares, with the picture of it.
   *
   * The same fields for a monster's claw and a player's fist, because they are
   * the same engine facility -- there is no reason the player should be the
   * only thing that can be dodged.
   */
  #swingSection (owner, whose, ctx) {
    const S = this.S
    const V = this.kind === 'weapon' ? S.vocab.weapon : S.vocab.mob
    const radius = this.prop?.radius ?? 0.35
    const changed = () => this.changed()
    if (!owner.swing) {
      return [
        muted(`${whose[0].toUpperCase()}${whose.slice(1)} has no swing: a swept collider that moves through an arc over several ticks, so a target that steps aside is missed.`),
        button('+ swing', () => { owner.swing = newSwing(); changed() })
      ]
    }
    return swingRows(V, owner, { ...ctx, onChange: changed }, {
      radius,
      preview: this.swingPreview,
      onRemove: () => { delete owner.swing; changed() }
    })
  }

  #renameState (from, raw) {
    const to = String(raw).toLowerCase().replace(/[^a-z0-9_]/g, '')
    const m = this.brain
    const nodes = this.nodes
    const gotoField = this.spec.shape.gotoField
    if (!to || to === from || nodes[to]) return
    nodes[to] = nodes[from]
    delete nodes[from]
    if (m.initial === from) m.initial = to
    for (const st of Object.values(nodes)) {
      if (st.next === from) st.next = to
      for (const tr of st.transitions ?? []) if (tr.to === from) tr.to = to
      for (const step of st.sequence ?? []) if (step.action === 'goto' && step[gotoField] === from) step[gotoField] = to
    }
    const lay = this.S.module.layouts?.[this.spec.layoutKey(this.mob)]
    if (lay?.[from]) { lay[to] = lay[from]; delete lay[from] }
    this.state = to
    this.changed()
  }
}
