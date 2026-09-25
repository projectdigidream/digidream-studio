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
import { el, row, slider, select, button, chips, muted, text, ask, confirmDialog } from './ui.js'
import { parseAtlas, frameKey, quadFor } from '/src/render/atlas.js'
import { rotationFor, frameAt } from '/src/render/props.js'
import { edgesOf, autoLayout, problemsByState, NODE_W, NODE_H } from './graph.js'
import { newMonster, deleteMonster, bodyRows, brainRows, varsRows, stateRows, missilesSection, STATE_NAMES } from './brain.js'

/** Pointer capture that does not throw for a pointer the browser has already let go of. */
function capture (node, e) {
  try { node.setPointerCapture(e.pointerId) } catch {}
}

export function openWorkshop (S, mobName = null) {
  if (S.workshop) { S.workshop.open(mobName); return S.workshop }
  S.workshop = new Workshop(S)
  S.workshop.open(mobName)
  return S.workshop
}

class Workshop {
  constructor (S) {
    this.S = S
    this.mob = null
    this.state = null
    this.tab = 'state'
    this.pane = 'graph'
    this.view = { x: 0, y: 0, z: 1 }
    this.linking = false
    // `anim` is a body state (0..4) to play; `animName` plays a named animation of the sheet instead.
    this.play = { anim: 0, animName: null, playing: true, facing: 0, t0: performance.now(), frame: 0 }
    this.images = new Map()        // url -> HTMLImageElement
    this.atlases = new Map()       // sheet -> parsed atlas (served ones)
    this.raf = 0
    this.root = el('div', { class: 'wk', 'data-pane': this.pane })
    document.body.appendChild(this.root)
    this.root.hidden = true
  }

  open (mobName) {
    const S = this.S
    S.module.mobs ??= { missiles: {}, mobs: {} }
    S.module.props ??= []
    const names = Object.keys(S.module.mobs.mobs)
    this.mob = mobName && S.module.mobs.mobs[mobName] ? mobName : (this.mob && S.module.mobs.mobs[this.mob] ? this.mob : names[0] ?? null)
    this.state = null
    this.root.hidden = false
    S.ui.layer.dataset.workshop = '1'
    S.ui.hideSheet()
    this.render()
    this.#loop()
  }

  close () {
    this.root.hidden = true
    this.S.ui.layer.dataset.workshop = '0'
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.S.ui.setTool('select')
    this.S.tool = 'select'
  }

  get brain () { return this.mob ? this.S.module.mobs.mobs[this.mob] : null }
  get prop () { return this.mob ? (this.S.module.props ?? []).find((p) => p.name === (this.brain?.prop ?? this.mob)) : null }
  get layout () {
    const m = this.S.module
    m.layouts ??= {}
    if (this.mob) m.layouts[this.mob] = autoLayout(this.brain, m.layouts[this.mob] ?? {})
    return this.mob ? m.layouts[this.mob] : {}
  }

  changed () {
    this.S.moduleChanged()
    this.render()
  }

  // --- the windows -------------------------------------------------------------------

  render () {
    const S = this.S
    const names = Object.keys(S.module.mobs.mobs)
    const problems = this.#problems()
    const top = el('div', { class: 'wk-top' }, [
      button('‹ level', () => this.close()),
      chips([...names.map((n) => ({ id: n, label: n, on: n === this.mob })), { id: '+', label: '+ new monster' }], async (it) => {
        if (it.id === '+') {
          const raw = await ask('monster name (letters, digits, underscore)', 'grunt')
          const name = raw ? newMonster(S, raw) : null
          if (raw && !name) S.status('that name is empty or taken', 'warn')
          if (name) { this.mob = name; this.state = null; this.changed() }
          return
        }
        this.mob = it.id; this.state = null; this.render()
      }),
      el('span', { style: 'flex:1 1 auto' }),
      problems.length ? el('span', { class: 'st-danger', text: `${problems.length} problem(s)`, title: problems.join('\n') }) : el('span', { class: 'st-muted', text: 'loads clean' }),
      el('div', { class: 'wk-tabs' }, [
        ['preview', '🎞 preview'], ['graph', '⬡ graph'], ['details', '☰ details']
      ].map(([id, label]) => el('button', { text: label, 'data-on': this.pane === id ? '1' : '0', onclick: () => { this.pane = id; this.root.dataset.pane = id; this.#syncTabs() } })))
    ])
    const details = el('div', { class: 'wk-details' })
    const keep = this.root.querySelector('.wk-details')?.scrollTop ?? 0
    this.root.replaceChildren(top, this.#previewPane(), this.#graphPane(problems), details)
    this.#fillDetails(details, problems)
    details.scrollTop = keep
    this.#syncTabs()
  }

  /** The brains' problems, with the catalogue to hand so a prop name is checked. */
  #problems () { return this.S.vocab.validateMobs(this.S.module.mobs, { props: this.S.propNames?.() ?? null }) }

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
        button(p.playing ? '⏸ pause' : '▶ play', () => { p.playing = !p.playing; p.t0 = performance.now(); this.render() }),
        button('⟲ turn', () => { p.facing = (p.facing + 0.125) % 1; this.#refreshFacing() })
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
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'left'
    for (let u = 0.5; u * ppu < floor - 8; u += 0.5) {
      const y = Math.round(floor - u * ppu) + 0.5
      ctx.strokeStyle = u % 1 ? '#1a2230' : '#2a3446'
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke()
      if (!(u % 1)) { ctx.fillStyle = '#5f7fa8'; ctx.fillText(`${u}`, 4, y - 2) }
    }
    ctx.strokeStyle = '#3a4a62'
    ctx.beginPath(); ctx.moveTo(0, floor); ctx.lineTo(c.width, floor); ctx.stroke()
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
      ctx.fillStyle = '#5f7fa8'
      ctx.font = '13px ui-monospace, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(this.mob ? 'no picture: give the body a sheet' : 'no monster', c.width / 2, c.height / 2)
    }
  }

  // --- graph ---------------------------------------------------------------------------

  #graphPane (problems) {
    const m = this.brain
    const pane = el('div', { class: 'wk-graph' })
    const bar = el('div', { class: 'wk-bar' }, [
      button('+ state', () => { this.#addState() }),
      this.state ? button('★ initial', () => { m.initial = this.state; this.changed() }) : null,
      this.state ? button(this.linking ? 'tap the target…' : '→ link', () => { this.linking = !this.linking; this.render() }) : null,
      this.state ? button('✕ state', () => { delete m.states[this.state]; this.state = null; this.changed() }, 'st-danger') : null,
      button('auto layout', () => { this.S.module.layouts[this.mob] = autoLayout(m, {}); this.S.moduleChanged(); this.render() }),
      this.mob ? button('delete monster', async () => { if (await confirmDialog(`delete monster ${this.mob}?`)) { deleteMonster(this.S, this.mob); this.mob = null; this.state = null; this.changed() } }, 'st-danger') : null
    ])
    pane.appendChild(bar)
    if (!m) { pane.appendChild(muted('No monster. Make one with "+ new monster".')); return pane }

    const layout = this.layout
    const bad = problemsByState(problems, this.mob)
    const world = el('div', { class: 'wk-world' })
    world.appendChild(this.#edgesSvg(m, layout))
    for (const [name, st] of Object.entries(m.states)) {
      const pos = layout[name]
      const node = el('div', { class: 'wk-node' + (name === this.state ? ' wk-node-on' : '') + (bad.has(name) ? ' wk-node-bad' : ''),
                             style: `left:${pos.x}px;top:${pos.y}px`, title: bad.get(name)?.join('\n') ?? '' }, [
        el('div', { class: 'wk-node-name', text: `${m.initial === name ? '★ ' : ''}${name}` }),
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
    return pane
  }

  /** The arrows between states, as one SVG: rebuilt on its own while a node is dragged. */
  #edgesSvg (m, layout) {
    const edges = edgesOf(m)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'wk-edges')
    svg.innerHTML = '<defs><marker id="wk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8fa6c4"/></marker></defs>'
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
      label.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); this.state = e.from; this.tab = 'state'; this.pane = 'details'; this.root.dataset.pane = 'details'; this.render(); this.#scrollToTransition(e) })
      svg.appendChild(label)
    }
    return svg
  }

  async #addState () {
    const m = this.brain
    if (!m) return
    const n = await ask('state name', 'wander')
    if (!n) return
    const name = n.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!name || m.states[name]) return
    m.states[name] = { anim: 0, move: 'stop', face: 'hold', ticks: 30, next: m.initial ?? name }
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
        this.tab = 'state'
        this.changed()
        return
      }
      this.linking = false
      this.state = name
      this.tab = 'state'
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

  #paneGestures (pane, world) {
    let pan = null
    pane.addEventListener('pointerdown', (e) => { if (e.target !== pane && e.target !== world && !e.target.classList?.contains('wk-edges')) return; pan = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; capture(pane, e) })
    pane.addEventListener('pointermove', (e) => { if (!pan) return; this.view.x = pan.vx + e.clientX - pan.x; this.view.y = pan.vy + e.clientY - pan.y; world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})` })
    pane.addEventListener('pointerup', () => { pan = null })
    pane.addEventListener('pointercancel', () => { pan = null })
    pane.addEventListener('wheel', (e) => { e.preventDefault(); this.view.z = Math.min(2, Math.max(0.4, this.view.z * (e.deltaY > 0 ? 0.9 : 1.1))); world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})` }, { passive: false })
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
    const m = this.brain
    const changed = () => this.changed()
    const ctx = {
      onChange: changed, status: (t, l) => S.status(t, l),
      states: Object.keys(m?.states ?? {}), vars: Object.keys(m?.vars ?? {}),
      missiles: Object.keys(S.module.mobs.missiles ?? {}), mobs: Object.keys(S.module.mobs.mobs), props: S.propNames?.() ?? []
    }
    const tabs = el('div', { class: 'wk-tabs' }, [['state', this.state ? `⬡ ${this.state}` : '⬡ state'], ['brain', '🧠 brain'], ['body', '👤 body'], ['vars', '# vars'], ['missiles', '☄ missiles']]
      .map(([id, label]) => el('button', { text: label, 'data-on': this.tab === id ? '1' : '0', onclick: () => { this.tab = id; this.render() } })))
    const body = []
    if (!m) body.push(muted('No monster.'))
    else if (this.tab === 'state') {
      const st = this.state ? m.states[this.state] : null
      if (!st) body.push(muted('Tap a state in the graph, or an arrow, to edit it here.'))
      else {
        body.push(el('div', { class: 'st-row' }, [
          text('name', this.state, (v) => this.#renameState(this.state, v)).lastChild.parentElement,
        ]))
        body.push(...stateRows(S, m, this.state, st, ctx, changed, { onPickTarget: () => { this.linking = true; this.pane = 'graph'; this.root.dataset.pane = 'graph'; this.render() } }))
        const mine = problemsByState(problems, this.mob).get(this.state)
        if (mine) body.push(el('div', { class: 'st-danger', text: mine.join('\n'), style: 'white-space:pre-wrap;font-size:12px' }))
      }
    } else if (this.tab === 'brain') body.push(...brainRows(S, m, ctx))
    else if (this.tab === 'body') body.push(...bodyRows(S, this.prop, changed))
    else if (this.tab === 'vars') body.push(...varsRows(m, changed))
    else if (this.tab === 'missiles') body.push(...missilesSection(S, changed))
    pane.replaceChildren(tabs, ...body.filter(Boolean))
  }

  #renameState (from, raw) {
    const to = String(raw).toLowerCase().replace(/[^a-z0-9_]/g, '')
    const m = this.brain
    if (!to || to === from || m.states[to]) return
    m.states[to] = m.states[from]
    delete m.states[from]
    if (m.initial === from) m.initial = to
    for (const st of Object.values(m.states)) {
      if (st.next === from) st.next = to
      for (const tr of st.transitions ?? []) if (tr.to === from) tr.to = to
      for (const step of st.sequence ?? []) if (step.action === 'goto' && step.state === from) step.state = to
    }
    const lay = this.S.module.layouts?.[this.mob]
    if (lay?.[from]) { lay[to] = lay[from]; delete lay[from] }
    this.state = to
    this.changed()
  }
}
