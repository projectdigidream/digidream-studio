//
// THE PANEL EDITOR: the module's panels, designed where the player will see
// them (docs/PANELS.md).
//
// WHAT YOU SEE IS THE GAME'S. The panel is drawn by the client's own UiView
// from the template this panel writes, inside a device frame at that device's
// size, over the module's HUD. The handles over it are measured from what
// UiView drew -- nothing here decides where a widget lands, it only edits the
// panel and asks the client again. So a slider dragged here sits where a
// phone of that size will draw it.
//
// Edit: drag the panel to move it (it re-anchors to the ninth of the screen it
// lands in, as HUD elements do), its right and bottom edges to size it; drag a
// widget or a piece of decor inside it, and its corner to size it. Try: the
// panel works as in the game, and each press says what a graph hears.
//
// A panel is opened and answered by graphs (and trigger cards). The Graphs
// card lists where, and adds the nodes: the engine's panel nodes when its
// graph vocabulary has them, else the trigger words a map's graph already
// understands (ui_open, on_ui_event + widget_is).
//
import { el, row, number, text, select, toggle, button, muted, ask, confirmDialog } from './ui.js'
import { anchorFor } from './ui_emit.js'
import { DEVICES } from './screens.js'
import {
  KINDS, MAX_WIDGETS, SLOT_H, NAME_RE, cleanName, freeName, newPanel, addWidget, widgetsOf, withTemplates,
  panelProblems, panelUses, renamePanelRefs, renameWidgetRefs
} from './panels_emit.js'
import { newGraph, graphsOf, graphRoute, parseGraphRoute, MAP_GRAPH, GAME_NAME } from './graphs_emit.js'
import { ANCHORS, HudView, parseLayout, uiScale } from '/src/render/layout.js'
import { UiView } from '/src/render/ui.js'
import { UI_KIND } from '/src/proto.js'

const WIRE = { label: UI_KIND.LABEL, button: UI_KIND.BUTTON, slider: UI_KIND.SLIDER, select: UI_KIND.SELECT, toggle: UI_KIND.TOGGLE }
const ICON = { label: 'T', button: '▭', toggle: '◐', slider: '⇿', select: '☰' }
const GRID = 2                       // UI units a drag snaps to

let win = null
export function openPanels (S, name = null) {
  win ??= new PanelWindow(S)
  if (name && S.module.panels?.[name]) { win.name = name; win.sel = { kind: 'panel' } }
  win.open()
  return win
}

class PanelWindow {
  constructor (S) {
    this.S = S
    this.name = null
    this.sel = { kind: 'panel' }      // { kind: 'panel' } | { kind: 'widget', id } | { kind: 'decor', i }
    this.device = 'phone, landscape'
    this.mode = 'edit'
    this.heard = []                   // what a graph would have heard, in try mode
    this.sample = {}
    this.root = el('div', { class: 'wk pw' })
    this.root.hidden = true
    document.body.appendChild(this.root)
    document.head.appendChild(el('style', { text: STYLE }))
    addEventListener('keydown', (e) => this.#key(e))
  }

  get panels () { return this.S.module.panels ?? {} }
  get panel () { return this.name ? this.panels[this.name] ?? null : null }

  open () {
    if (!this.panel) this.name = Object.keys(this.panels)[0] ?? null
    this.root.hidden = false
    this.S.ui.layer.dataset.workshop = '1'
    this.S.ui.hideSheet()
    this.render()
  }

  close () {
    this.root.hidden = true
    this.S.ui.layer.dataset.workshop = '0'
    this.view?.clear()
  }

  /** A change to the module: undoable, saved, and drawn again. */
  changed () {
    if (this.S.module.panels && !Object.keys(this.S.module.panels).length) delete this.S.module.panels
    this.S.moduleChanged()
    this.render()
  }

  // --- the frame -------------------------------------------------------------------

  render () {
    const S = this.S
    const dev = DEVICES[this.device]
    const p = this.panel
    const top = el('div', { class: 'wk-top' }, [
      el('span', { class: 'wk-title', text: '▢ panels' }),
      select('', this.name ?? '', [...Object.keys(this.panels).map((n) => [n, n]), ['\u0000new', '+ new panel…']], (v) => {
        if (v === '\u0000new') this.#newPanel(); else { this.name = v; this.sel = { kind: 'panel' }; this.heard = []; this.render() }
      }).lastChild,
      select('', this.device, Object.keys(DEVICES), (v) => { this.device = v; this.render() }).lastChild,
      el('div', { class: 'wk-tabs pw-modes' }, [['edit', '✎ edit'], ['try', '▶ try']].map(([v, l]) =>
        el('button', { text: l, 'data-on': this.mode === v ? '1' : '0', 'data-mode': v, onclick: () => { this.mode = v; this.heard = []; this.render() } }))),
      p && this.mode === 'edit' ? this.#palette() : null,
      el('span', { style: 'flex:1' }),
      button('‹ back', () => (S.leave ? S.leave() : this.close()), 'wk-back')
    ].filter(Boolean))

    // The frame and the client's views in it live as long as the device does:
    // drawn again on every change, never built again (each UiView brings its
    // own stylesheet).
    if (this.frameFor !== this.device) {
      this.view?.clear()
      this.hud?.destroy()
      this.stage = el('div', { class: 'pw-stage' })
      this.zoom = { z: 1, x: 0, y: 0 }
      this.autoZoomFor = null
      this.#zoomBar(this.stage)
      this.#stageGestures(this.stage)
      const frame = el('div', { class: 'pw-frame', style: `width:${dev.width}px;height:${dev.height}px` })
      const safe = el('div', { class: 'pw-safe' })
      Object.assign(safe.style, { left: `${dev.insets.left ?? 0}px`, right: `${dev.insets.right ?? 0}px`, top: `${dev.insets.top ?? 0}px`, bottom: `${dev.insets.bottom ?? 0}px` })
      frame.appendChild(safe)
      this.stage.appendChild(frame)
      this.frame = frame
      // The module's HUD behind it, as the player will have it.
      this.hud = new HudView({ host: frame, touch: false, insets: dev.insets, size: { width: dev.width, height: dev.height } })
      this.hud.root.classList.add('pw-behind')
      this.view = new UiView({
        host: frame, size: { width: dev.width, height: dev.height }, insets: dev.insets,
        onEvent: (uiId, wid, value) => this.#heard(wid, value),
        onChange: () => { if (this.mode === 'try' && this.view && !this.view.panels.size && !this.redrawing) this.#heard(0, 0) }
      })
      this.empty = el('div', { class: 'pw-empty', text: 'No panels yet. + new panel above.' })
      this.hits = el('div', { class: 'pw-hits' })
      frame.append(this.empty, this.hits)
      this.frameFor = this.device
    }
    const stage = this.stage
    const frame = this.frame
    this.dev = dev
    const layout = parseLayout(withTemplates(S.module.ui ?? { version: 1 }, this.panels)).layout
    this.layout = layout
    this.hud.setLayout(layout)
    this.hud.update({ hp: 75, 'hud.hp_max': 100, ...this.sample })
    this.empty.hidden = !!p
    // Nothing to zoom onto: the whole screen.
    if (!p && this.zoom) { this.zoom = { z: 1, x: 0, y: 0 }; this.autoZoomFor = null }
    this.redrawing = true
    this.view.clear()
    if (p) this.#drawPanel(layout)
    this.redrawing = false
    this.hits.replaceChildren()
    // The handles over everything the client drew.
    frame.appendChild(this.hits)

    this.root.dataset.mode = this.mode
    const side = el('div', { class: 'wk-details' }, this.#side())
    this.root.replaceChildren(top, stage, side)
    this.fit = () => {
      const r = stage.getBoundingClientRect()
      const upright = matchMedia('(max-width:1100px) and (orientation:portrait)').matches
      const k = upright ? Math.min(1, (r.width - 24) / dev.width) : Math.min(1, (r.width - 24) / dev.width, (r.height - 24) / dev.height)
      // The fitted scale: the whole device in the stage. Zoom and pan are on top.
      this.k0 = k > 0 ? k : 1
      // Upright, at least half the screen less a little, so a zoomed panel has room.
      stage.style.height = upright ? `${Math.max(Math.ceil(dev.height * this.k0) + 24, Math.round(innerHeight * 0.45))}px` : ''
      this.#place()
      this.hud?.refresh()
      this.view?.relayout()
      this.#handles()
      // On a phone a panel opens zoomed onto itself: at the device's whole
      // size it is a few millimetres of screen.
      if (this.autoZoomFor !== this.name && this.name && this.mode === 'edit' && handheld()) {
        this.autoZoomFor = this.name
        requestAnimationFrame(() => this.zoomToPanel())
      }
    }
    requestAnimationFrame(() => this.fit())
    if (!this.onResize) { this.onResize = () => { if (!this.root.hidden) this.fit?.() }; addEventListener('resize', this.onResize) }
    // The stage's width settles after the side list has laid out (and its
    // fonts arrived): fitted again whenever it changes, not only on the first frame.
    if (this.watched !== stage && globalThis.ResizeObserver) {
      this.stageObserver?.disconnect()
      let last = 0
      this.stageObserver = new ResizeObserver(([e]) => {
        const w = Math.round(e.contentRect.width)
        if (w !== last && !this.root.hidden) { last = w; this.fit?.() }
      })
      this.stageObserver.observe(stage)
      this.watched = stage
    }
  }

  /** The panel, drawn by the client from the template this panel writes. */
  #drawPanel (layout) {
    const p = this.panel
    this.view.layout = layout
    this.view.open({
      uiId: 1, title: p.title ?? this.name, template: this.name,
      widgets: widgetsOf(p).map((w) => ({ kind: WIRE[w.kind], id: w.id, label: w.label, value: w.value ?? 0, lo: w.lo ?? 0, hi: w.hi ?? 0, options: w.options ?? [] }))
    })
    this.view.panels.get(1)?.decor?.update({ hp: 75, 'hud.hp_max': 100, ...this.sample })
  }

  // --- zoom ------------------------------------------------------------------------

  /** Where the frame is: fitted, then zoomed by `z` about the stage's middle and moved by (x, y). */
  #place () {
    const st = this.stage
    if (!st || !this.dev) return
    const W = st.clientWidth; const H = st.clientHeight
    const k = this.k0 * this.zoom.z
    this.k = k
    const tx = (W - this.dev.width * k) / 2 + this.zoom.x
    const ty = (H - this.dev.height * k) / 2 + this.zoom.y
    this.frame.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`
    if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(k * 100)}%`
  }

  /** Zoom by `f` keeping the stage point (cx, cy) where it is. */
  zoomAt (f, cx, cy) {
    const st = this.stage
    const W = st.clientWidth; const H = st.clientHeight
    const z = Math.min(8 / this.k0, Math.max(0.5, this.zoom.z * f))
    const k = this.k0 * this.zoom.z; const k2 = this.k0 * z
    const tx = (W - this.dev.width * k) / 2 + this.zoom.x
    const ty = (H - this.dev.height * k) / 2 + this.zoom.y
    // The frame point under (cx, cy) stays under it.
    const fx = (cx - tx) / k; const fy = (cy - ty) / k
    this.zoom = { z, x: cx - fx * k2 - (W - this.dev.width * k2) / 2, y: cy - fy * k2 - (H - this.dev.height * k2) / 2 }
    this.#place()
  }

  /** The whole device again. */
  zoomFit () { this.zoom = { z: 1, x: 0, y: 0 }; this.#place() }

  /** The panel filling the stage, with a margin round it. */
  zoomToPanel () {
    const root = this.view?.panels.get(1)?.root
    if (!root || !this.stage) return
    this.zoomFit()
    const r = this.#rectOf(root)
    const W = this.stage.clientWidth; const H = this.stage.clientHeight
    // A margin round it, and the zoom bar's height clear at the bottom.
    const k2 = Math.min((W * 0.88) / r.width, (H - 56) * 0.92 / r.height, 8)
    const z = Math.max(1, k2 / this.k0)
    const kk = this.k0 * z
    // Centre the panel: its middle, in frame units, at the stage's middle.
    const mx = r.left + r.width / 2; const my = r.top + r.height / 2
    this.zoom = { z, x: W / 2 - mx * kk - (W - this.dev.width * kk) / 2, y: (H - 44) / 2 - my * kk - (H - this.dev.height * kk) / 2 }
    this.#place()
  }

  #zoomBar (stage) {
    this.zoomLabel = el('span', { class: 'pw-zoom-pct', text: '100%' })
    const mid = () => [stage.clientWidth / 2, stage.clientHeight / 2]
    stage.appendChild(el('div', { class: 'pw-zoom' }, [
      el('button', { text: '−', title: 'zoom out', 'data-zoom': 'out', onclick: () => this.zoomAt(1 / 1.4, ...mid()) }),
      this.zoomLabel,
      el('button', { text: '+', title: 'zoom in', 'data-zoom': 'in', onclick: () => this.zoomAt(1.4, ...mid()) }),
      el('button', { text: '▢', title: 'zoom to the panel', 'data-zoom': 'panel', onclick: () => this.zoomToPanel() }),
      el('button', { text: '⤢', title: 'the whole screen', 'data-zoom': 'fit', onclick: () => this.zoomFit() })
    ]))
  }

  /**
   * Pinch or wheel to zoom; drag the empty stage (or the frame where nothing
   * is) to pan. A handle's own drag never reaches here: it stops the event.
   * In try mode the panel's controls keep their touches.
   */
  #stageGestures (stage) {
    const pts = new Map()
    let last = null
    const at = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    let travel = 0
    let downOn = null
    stage.addEventListener('pointerdown', (e) => {
      if (e.defaultPrevented || e.target.closest('.pw-zoom') || (this.mode === 'try' && e.target.closest('.dnp-ui'))) return
      stage.setPointerCapture?.(e.pointerId)
      pts.set(e.pointerId, at(e))
      last = null
      travel = 0
      downOn = e.target
    })
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return
      const prev = pts.get(e.pointerId)
      const p = at(e)
      pts.set(e.pointerId, p)
      travel += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)
      if (pts.size === 1) { this.zoom.x += p.x - prev.x; this.zoom.y += p.y - prev.y; this.#place() } else if (pts.size === 2) {
        // Two fingers: the pinch zooms about their middle, and the middle moving pans.
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (last) {
          this.zoom.x += (m.x - last.m.x); this.zoom.y += (m.y - last.m.y)
          this.zoomAt(d / last.d, m.x, m.y)
        }
        last = { d, m }
      }
    })
    const end = (e) => {
      const tap = pts.size === 1 && travel < 4
      pts.delete(e.pointerId); last = null
      if (tap && downOn?.closest?.('.pw-panel') && this.mode === 'edit') this.#pick({ kind: 'panel' })
    }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const p = at(e); this.zoomAt(Math.exp(-e.deltaY / 300), p.x, p.y) }, { passive: false })
  }

  // --- handles ---------------------------------------------------------------------

  /** Where something the client drew is, in the frame's own pixels. */
  #rectOf (node) {
    const f = this.frame.getBoundingClientRect()
    const r = node.getBoundingClientRect()
    return { left: (r.left - f.left) / this.k, top: (r.top - f.top) / this.k, width: r.width / this.k, height: r.height / this.k }
  }

  #handles () {
    const hits = this.hits
    if (!hits) return
    hits.replaceChildren()
    const open = this.view?.panels.get(1)
    if (!open || this.mode !== 'edit') return
    const p = this.panel
    const s = uiScale(this.layout, this.dev.width, this.dev.height)
    const root = open.root
    const stageEl = root.querySelector('.dnp-ui-stage')
    const pr = this.#rectOf(root)
    const sr = stageEl ? this.#rectOf(stageEl) : { left: pr.left, top: pr.top + pr.height, width: pr.width, height: 0 }

    // The panel: drag to move it; its right edge and its bottom to size it.
    const pbox = this.#box(pr, 'pw-panel', this.sel.kind === 'panel', { 'data-handle': 'panel' })
    // Moved by its title bar (or its top edge without one); the rest of it is
    // the stage's, to pan when zoomed in, and a tap there selects it.
    const band = Math.max(18, root.querySelector('.dnp-ui-title')?.offsetHeight ?? 0)
    this.#drag(pbox, root, (dx, dy, moved) => {
      if (!moved) return this.#pick({ kind: 'panel' })
      const a = anchorFor({ ...pr, left: pr.left + dx, top: pr.top + dy }, this.dev.width, this.dev.height, s, this.dev.insets)
      Object.assign(p.look, a)
      this.sel = { kind: 'panel' }
      this.changed()
    }, null, (e) => (e.clientY - pbox.getBoundingClientRect().top) / this.k <= band || e.target !== pbox)
    const wide = el('div', { class: 'pw-edge pw-edge-r', 'data-handle': 'panel-w' })
    this.#drag(wide, null, (dx, dy, moved) => { if (moved) { p.look.w = Math.max(120, snap((pr.width + dx) / s)); this.changed() } }, (dx) => { pbox.style.width = `${pr.width + dx}px` })
    const tall = el('div', { class: 'pw-edge pw-edge-b', 'data-handle': 'panel-h' })
    this.#drag(tall, null, (dx, dy, moved) => { if (moved) { p.look.h = Math.max(16, snap((sr.height + dy) / s)); this.changed() } }, (dx, dy) => { pbox.style.height = `${pr.height + dy}px` })
    pbox.append(wide, tall)
    hits.appendChild(pbox)

    // The widgets, in the order the client placed their slots.
    const slots = stageEl ? [...stageEl.querySelectorAll(':scope > .dnp-ui-slot')] : []
    p.widgets.forEach((w, i) => {
      const node = slots[i]
      if (!node) return
      const r = this.#rectOf(node)
      const on = this.sel.kind === 'widget' && this.sel.id === w.id
      const box = this.#box(r, 'pw-slot', on, { 'data-widget': w.name, title: `${w.kind} · ${w.name}` })
      box.appendChild(el('span', { class: 'pw-tag', text: `${ICON[w.kind]} ${w.name}` }))
      this.#drag(box, node, (dx, dy, moved) => {
        if (!moved) return this.#pick({ kind: 'widget', id: w.id })
        w.slot.x = Math.max(0, snap((r.left - sr.left + dx) / s))
        w.slot.y = Math.max(0, snap((r.top - sr.top + dy) / s))
        this.sel = { kind: 'widget', id: w.id }
        this.changed()
      })
      const corner = el('div', { class: 'pw-corner', 'data-handle': 'size' })
      this.#drag(corner, null, (dx, dy, moved) => {
        if (!moved) return
        w.slot.w = Math.max(20, snap((r.width + dx) / s))
        w.slot.h = Math.max(16, snap((r.height + dy) / s))
        this.sel = { kind: 'widget', id: w.id }
        this.changed()
      }, (dx, dy) => { box.style.width = `${r.width + dx}px`; box.style.height = `${r.height + dy}px` })
      box.appendChild(corner)
      hits.appendChild(box)
    })

    // The decor, as the HUD code placed it inside the panel's stage.
    for (const [i, n] of (open.decor?.nodes ?? []).entries()) {
      const e = p.decor[i]
      if (!e || n.dom.style.display === 'none') continue
      const r = this.#rectOf(n.dom)
      const on = this.sel.kind === 'decor' && this.sel.i === i
      const box = this.#box(r, 'pw-decor', on, { 'data-decor': String(i) })
      this.#drag(box, n.dom, (dx, dy, moved) => {
        if (!moved) return this.#pick({ kind: 'decor', i })
        const a = anchorFor({ left: r.left - sr.left + dx, top: r.top - sr.top + dy, width: r.width, height: r.height }, sr.width, sr.height, s, {})
        Object.assign(e, a)
        this.sel = { kind: 'decor', i }
        this.changed()
      })
      hits.appendChild(box)
    }
  }

  #box (r, cls, on, attrs = {}) {
    const b = el('div', { class: `pw-box ${cls}`, 'data-on': on ? '1' : '0', ...attrs })
    Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    return b
  }

  /**
   * Drag a handle. `live` follows the pointer (the client's own element is
   * moved with it, so the panel itself moves, not an outline); `end(dx, dy,
   * moved)` writes the change. Distances are in frame pixels.
   */
  #drag (handle, target, end, live = null, accept = null) {
    handle.addEventListener('pointerdown', (e) => {
      // Not this handle's: left to the stage (a pan), which sees it next.
      if (accept && !accept(e)) return
      e.preventDefault(); e.stopPropagation()
      handle.setPointerCapture?.(e.pointerId)
      const x0 = e.clientX; const y0 = e.clientY
      const left0 = parseFloat(handle.style.left) || 0; const top0 = parseFloat(handle.style.top) || 0
      let moved = false; let dx = 0; let dy = 0
      const move = (ev) => {
        dx = (ev.clientX - x0) / this.k; dy = (ev.clientY - y0) / this.k
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        if (!moved) return
        if (live) live(dx, dy)
        else {
          handle.style.left = `${left0 + dx}px`; handle.style.top = `${top0 + dy}px`
          if (target) target.style.transform = `translate(${dx}px, ${dy}px)`
        }
      }
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up)
        end(dx, dy, moved)
      }
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up)
    })
  }

  #pick (sel) { this.sel = sel; this.render() }

  /** Delete and the arrows, for the selected widget or decor, when no field has the keys. */
  #key (e) {
    if (this.root.hidden || this.mode !== 'edit' || !this.panel) return
    if (e.target.closest?.('input,textarea,select')) return
    const p = this.panel
    const w = this.sel.kind === 'widget' ? p.widgets.find((x) => x.id === this.sel.id) : null
    const d = this.sel.kind === 'decor' ? p.decor[this.sel.i] : null
    if ((e.key === 'Delete' || e.key === 'Backspace') && (w || d)) {
      e.preventDefault()
      if (w) this.#deleteWidget(w); else { p.decor.splice(this.sel.i, 1); this.sel = { kind: 'panel' }; this.changed() }
      return
    }
    const step = e.shiftKey ? 8 : GRID
    const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!dir) return
    e.preventDefault()
    const it = w ? w.slot : d ?? p.look
    it.x = (it.x ?? 0) + dir[0]; it.y = (it.y ?? 0) + dir[1]
    if (w) { it.x = Math.max(0, it.x); it.y = Math.max(0, it.y) }
    this.changed()
  }

  // --- adding ----------------------------------------------------------------------

  #palette () {
    const s = el('select', { class: 'pw-palette' }, [el('option', { value: '', text: '+ add…' }),
      el('optgroup', { label: 'widgets' }, KINDS.map((k) => el('option', { value: `w:${k}`, text: `${ICON[k]} ${k}` }))),
      el('optgroup', { label: 'decor, behind the widgets' }, [el('option', { value: 'd:text', text: 'T text (may show {hud.name})' }), el('option', { value: 'd:image', text: '▣ picture' })])])
    s.addEventListener('change', () => {
      const [what, kind] = s.value.split(':')
      if (!what) return
      const p = this.panel
      if (what === 'w') {
        if (p.widgets.length >= MAX_WIDGETS) { this.S.status(`a panel carries at most ${MAX_WIDGETS} widgets`, 'warn'); return }
        const w = addWidget(p, kind)
        this.sel = { kind: 'widget', id: w.id }
      } else {
        p.decor ??= []
        const ids = new Set(p.decor.map((d) => d.id))
        const e = kind === 'text'
          ? { id: freeName('text', ids), type: 'text', anchor: 'tr', x: -12, y: 8, text: 'Gold {hud.gold}', style: { size: 12 } }
          : { id: freeName('picture', ids), type: 'image', anchor: 'tl', x: 8, y: 8, w: 48, h: 48, frame: '' }
        p.decor.push(e)
        this.sel = { kind: 'decor', i: p.decor.length - 1 }
      }
      this.changed()
    })
    return s
  }

  async #newPanel () {
    const raw = await ask('panel name (letters, digits, underscore)', 'shop')
    const name = cleanName(raw)
    if (!name) { this.render(); return }
    if (this.panels[name]) { this.S.status(`there is a panel called ${name} already`, 'warn'); this.render(); return }
    const p = newPanel(name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '))
    addWidget(p, 'label', 'What would you like?')
    addWidget(p, 'button', 'OK')
    ;(this.S.module.panels ??= {})[name] = p
    this.name = name
    this.sel = { kind: 'panel' }
    this.changed()
  }

  #deleteWidget (w) {
    const p = this.panel
    p.widgets.splice(p.widgets.indexOf(w), 1)
    this.sel = { kind: 'panel' }
    this.changed()
  }

  // --- the side --------------------------------------------------------------------

  #side () {
    const p = this.panel
    const rows = []
    // Every panel, to switch between them.
    rows.push(el('div', { class: 'st-section-head', text: `▢ the module's panels (${Object.keys(this.panels).length})` }))
    for (const [n, q] of Object.entries(this.panels)) {
      const uses = panelUses(n, this.S.module, Object.values(this.S.docs))
      rows.push(el('div', { class: 'st-trow', 'data-panel': n, 'data-on': n === this.name ? '1' : '0', onclick: () => { this.name = n; this.sel = { kind: 'panel' }; this.heard = []; this.render() } }, [
        el('span', { class: 'st-mark', text: '▢' }),
        el('div', { class: 'st-trow-text' }, [el('div', { class: 'st-trow-name', text: n }),
          el('div', { class: 'st-muted', text: `${q.widgets.length} widget${q.widgets.length === 1 ? '' : 's'} · ${uses.length ? `used ${uses.length}×` : 'not used yet'}` })])
      ]))
    }
    rows.push(button('+ new panel', () => this.#newPanel()))
    if (!p) {
      rows.push(muted('A panel is a window over the game: a shop, a dialogue, a choice. Design it here, open it from a graph (the game\'s or a map\'s) or a trigger card, and answer its buttons there.'))
      return rows
    }
    for (const m of panelProblems(this.name, p)) rows.push(el('div', { class: 'st-danger', text: m }))
    if (this.mode === 'try') rows.push(...this.#tryRows())
    else if (this.sel.kind === 'widget' && p.widgets.some((w) => w.id === this.sel.id)) rows.push(...this.#widgetRows(p.widgets.find((w) => w.id === this.sel.id)))
    else if (this.sel.kind === 'decor' && p.decor?.[this.sel.i]) rows.push(...this.#decorRows(p.decor[this.sel.i], this.sel.i))
    else rows.push(...this.#panelRows())
    rows.push(...this.#widgetList())
    rows.push(...this.#graphRows())
    return rows
  }

  #panelRows () {
    const p = this.panel
    const L = p.look
    const ch = () => this.changed()
    const st = (k) => (v) => { L.style ??= {}; if (v === '' || v === undefined) delete L.style[k]; else L.style[k] = v; if (!Object.keys(L.style).length) delete L.style; ch() }
    return [el('div', { class: 'st-section-head', text: `▸ ${this.name}` }),
      text('name', this.name, (v) => this.#rename(v)),
      text('title', p.title ?? '', (v) => { p.title = v; ch() }),
      toggle('title bar', L.showTitle !== false, (v) => { L.showTitle = v; ch() }),
      toggle('the player can close it (×)', L.closeable !== false, (v) => { L.closeable = v; ch() }),
      toggle('modal: dims the game, takes the touch input', !!L.modal, (v) => { L.modal = v; ch() }),
      select('sits at', L.anchor ?? 'c', ANCHORS, (v) => { L.anchor = v; L.x = 0; L.y = 0; ch() }),
      number('width', L.w ?? 320, { min: 120, max: 1600, step: 2 }, (v) => { L.w = v; ch() }),
      row('height', el('input', { type: 'number', value: L.h ?? '', placeholder: 'fits the widgets', onchange: (e) => { if (e.target.value === '') delete L.h; else L.h = Number(e.target.value); ch() } })),
      el('div', { class: 'st-section-head', text: 'look' }),
      row('background', el('input', { type: 'color', value: L.style?.bg ?? '#121216', onchange: (e) => st('bg')(e.target.value) })),
      row('text', el('input', { type: 'color', value: L.style?.color ?? '#e8e8ea', onchange: (e) => st('color')(e.target.value) })),
      row('border', el('input', { type: 'text', value: L.style?.border ?? '', placeholder: '1px solid #5b8fd6', onchange: (e) => st('border')(e.target.value.trim()) })),
      number('corners', L.style?.radius ?? 8, { min: 0, max: 40, step: 1 }, st('radius')),
      el('div', { class: 'st-row' }, [
        button('duplicate', () => {
          const n = freeName(`${this.name}_copy`, new Set(Object.keys(this.panels)))
          this.S.module.panels[n] = JSON.parse(JSON.stringify(p)); this.name = n; ch()
        }),
        button('delete panel', async () => {
          const uses = panelUses(this.name, this.S.module, Object.values(this.S.docs))
          if (!await confirmDialog(`delete the panel ${this.name}?${uses.length ? ` ${uses.length} node(s) or card(s) still name it.` : ''}`)) return
          delete this.S.module.panels[this.name]; this.name = Object.keys(this.panels)[0] ?? null; this.sel = { kind: 'panel' }; ch()
        }, 'st-danger')
      ]),
      muted('Drag the panel in the frame to move it -- it stays anchored to that part of the screen on any size -- and its right or bottom edge to size it. + add puts in a widget or decor.')]
  }

  #widgetRows (w) {
    const ch = () => this.changed()
    const set = (k) => (v) => { if (v === '' || v === undefined || v === null) delete w[k]; else w[k] = v; ch() }
    const sl = w.slot
    const ss = (k) => (v) => { sl.style ??= {}; if (v === '' || v === undefined) delete sl.style[k]; else sl.style[k] = v; if (!Object.keys(sl.style).length) delete sl.style; ch() }
    const rows = [el('div', { class: 'st-section-head', text: `▸ ${ICON[w.kind]} ${w.kind} · ${w.name}` }),
      text('name (graphs say it)', w.name, (v) => {
        const n = cleanName(v)
        if (!n || this.panel.widgets.some((x) => x !== w && x.name === n)) { this.S.status('that name is empty or taken on this panel', 'warn'); this.render(); return }
        // Graph nodes that name it follow.
        renameWidgetRefs(this.S.module, this.name, w.name, n)
        for (const d of Object.values(this.S.docs)) renameWidgetRefs(d, this.name, w.name, n)
        w.name = n; ch()
      }),
      text(w.kind === 'label' ? 'text' : 'label', w.label ?? '', set('label'))]
    if (w.kind === 'slider') {
      rows.push(number('from', w.lo ?? 0, { min: -100000, max: 100000, step: 1 }, (v) => { w.lo = Math.round(v); ch() }),
        number('to', w.hi ?? 10, { min: -100000, max: 100000, step: 1 }, (v) => { w.hi = Math.round(v); ch() }),
        number('starts at', w.value ?? w.lo ?? 0, { min: -100000, max: 100000, step: 1 }, (v) => { w.value = Math.round(v); ch() }))
    }
    if (w.kind === 'toggle') rows.push(toggle('starts on', !!w.value, (v) => { w.value = v ? 1 : 0; ch() }))
    if (w.kind === 'select') {
      rows.push(text('options', (w.options ?? []).join(', '), (v) => { w.options = v.split(',').map((x) => x.trim()).filter(Boolean); if ((w.value ?? 0) >= w.options.length) w.value = 0; ch() }, { placeholder: 'red, green, blue' }),
        select('starts at', String(w.value ?? 0), (w.options ?? []).map((o, i) => [String(i), o]), (v) => { w.value = Number(v); ch() }))
    }
    rows.push(el('div', { class: 'st-section-head', text: 'place and look' }),
      el('div', { class: 'pw-xywh' }, [
        number('x', sl.x ?? 0, { min: 0, max: 2000, step: 1 }, (v) => { sl.x = v; ch() }),
        number('y', sl.y ?? 0, { min: 0, max: 2000, step: 1 }, (v) => { sl.y = v; ch() }),
        number('w', sl.w ?? 120, { min: 20, max: 2000, step: 1 }, (v) => { sl.w = v; ch() }),
        number('h', sl.h ?? SLOT_H, { min: 16, max: 2000, step: 1 }, (v) => { sl.h = v; ch() })]),
      button('full width', () => { sl.x = 12; sl.w = Math.max(20, (this.panel.look.w ?? 320) - 24); ch() }),
      row('background', el('input', { type: 'color', value: sl.style?.bg ?? '#1b2230', onchange: (e) => ss('bg')(e.target.value) }), button('✕', () => ss('bg')(''))),
      row('text', el('input', { type: 'color', value: sl.style?.color ?? '#e8e8ea', onchange: (e) => ss('color')(e.target.value) }), button('✕', () => ss('color')(''))),
      number('text size', sl.style?.size ?? 12, { min: 6, max: 72, step: 1 }, ss('size')),
      select('weight', String(sl.style?.weight ?? 400), [['400', 'normal'], ['600', 'bold']], (v) => ss('weight')(Number(v))),
      number('corners', sl.style?.radius ?? 0, { min: 0, max: 40, step: 1 }, ss('radius')),
      button('delete widget', () => this.#deleteWidget(w), 'st-danger'),
      muted(`Its id on the wire is ${w.id}; it never changes, so renaming it keeps every link. Drag it in the frame, or its corner to size it; arrows nudge it.`))
    return rows
  }

  #decorRows (e, i) {
    const p = this.panel
    const ch = () => this.changed()
    const set = (k) => (v) => { if (v === '' || v === undefined) delete e[k]; else e[k] = v; ch() }
    const st = (k) => (v) => { e.style ??= {}; if (v === '' || v === undefined) delete e.style[k]; else e.style[k] = v; if (!Object.keys(e.style).length) delete e.style; ch() }
    const rows = [el('div', { class: 'st-section-head', text: `▸ decor · ${e.id}` })]
    if (e.type === 'text') {
      rows.push(text('text', e.text ?? '', set('text'), { placeholder: 'Gold {hud.gold}' }),
        number('size', e.style?.size ?? 12, { min: 6, max: 96, step: 1 }, st('size')),
        row('colour', el('input', { type: 'color', value: e.style?.color ?? '#e8e8ea', onchange: (ev) => st('color')(ev.target.value) })),
        select('weight', String(e.style?.weight ?? 400), [['400', 'normal'], ['600', 'bold']], (v) => st('weight')(Number(v))))
      // The HUD values it shows, with a value to see them by.
      for (const m of String(e.text ?? '').matchAll(/\{(hud\.[a-z0-9_]+)\}/g)) {
        rows.push(text(`sample ${m[1]}`, String(this.sample[m[1]] ?? ''), (v) => { this.sample[m[1]] = /^-?\d+$/.test(v) ? Number(v) : v; this.render() }))
      }
      rows.push(muted('{hud.name} shows a HUD value -- what a graph\'s set_hud writes (or the weapons runtime: {hud.ammo}, {hud.weapon}). That is how a panel shows something that changes: the gold you have, a timer.'))
    } else {
      rows.push(text('picture', e.frame ?? '', set('frame'), { placeholder: 'a sprite frame or texture name' }),
        number('w', e.w ?? 48, { min: 4, max: 2000, step: 1 }, set('w')), number('h', e.h ?? 48, { min: 4, max: 2000, step: 1 }, set('h')))
    }
    rows.push(button('delete decor', () => { p.decor.splice(i, 1); this.sel = { kind: 'panel' }; ch() }, 'st-danger'))
    return rows
  }

  #widgetList () {
    const p = this.panel
    const rows = [el('div', { class: 'st-section-head', text: `widgets (${p.widgets.length} of ${MAX_WIDGETS})` })]
    p.widgets.forEach((w, i) => {
      rows.push(el('div', { class: 'st-trow', 'data-wrow': w.name, 'data-on': this.sel.kind === 'widget' && this.sel.id === w.id ? '1' : '0', onclick: () => this.#pick({ kind: 'widget', id: w.id }) }, [
        el('span', { class: 'st-mark', text: ICON[w.kind] }),
        el('div', { class: 'st-trow-text' }, [el('div', { class: 'st-trow-name', text: w.name }), el('div', { class: 'st-muted', text: `${w.kind} · ${w.label ?? ''}` })])
      ]))
    })
    for (const [i, d] of (p.decor ?? []).entries()) {
      rows.push(el('div', { class: 'st-trow', 'data-drow': String(i), 'data-on': this.sel.kind === 'decor' && this.sel.i === i ? '1' : '0', onclick: () => this.#pick({ kind: 'decor', i }) }, [
        el('span', { class: 'st-mark', text: d.type === 'text' ? '“' : '▣' }),
        el('div', { class: 'st-trow-text' }, [el('div', { class: 'st-trow-name', text: d.id }), el('div', { class: 'st-muted', text: `decor · ${d.type === 'text' ? d.text : d.frame}` })])
      ]))
    }
    return rows
  }

  // --- try ---------------------------------------------------------------------------

  #heard (wid, value) {
    if (this.mode !== 'try') return
    const w = this.panel?.widgets.find((x) => x.id === wid)
    this.heard.unshift(wid === 0
      ? { text: `when_panel_closed · ${this.name}`, raw: 'the player closed it' }
      : { text: `when_panel_used · ${this.name} · ${w?.name ?? wid} → value ${value}`, raw: `on_ui_event · widget ${wid} · value ${value}` })
    this.heard = this.heard.slice(0, 12)
    const list = this.root.querySelector('.pw-heard')
    if (list) list.replaceChildren(...this.#heardRows())
  }

  #heardRows () {
    if (!this.heard.length) return [muted('Press its buttons, move its sliders: each line is what a graph hears.')]
    return this.heard.map((h) => el('div', { class: 'pw-heard-row' }, [el('div', { text: h.text }), el('div', { class: 'st-muted', text: h.raw })]))
  }

  #tryRows () {
    return [el('div', { class: 'st-section-head', text: '▶ try it' }),
      el('div', { class: 'pw-heard' }, this.#heardRows()),
      button('open it again', () => { this.heard = []; this.render() })]
  }

  // --- graphs ------------------------------------------------------------------------

  /** Does the engine's graph vocabulary have panel nodes yet (docs/PANELS.md)? */
  get nodesReady () { return !!this.S.vocab.graph?.nodes?.some((n) => n.name === 'open_panel') }

  #graphRows () {
    const S = this.S
    const p = this.panel
    const uses = panelUses(this.name, S.module, Object.values(S.docs))
    const rows = [el('div', { class: 'st-section-head', text: '◇ graphs' })]
    const say = { opens: 'opens it', closes: 'closes it', sets: 'sets', answers: 'answers', closed: 'hears it closed', asks: 'asks if open', trigger: 'a card opens or closes it' }
    for (const u of uses) {
      const where = u.trigger ? `${u.graph}'s cards` : `${u.graph === 'game' ? 'the game' : u.graph} · ${u.gname}`
      rows.push(el('div', { class: 'st-trow', 'data-use': `${u.graph}:${u.gname ?? ''}:${u.node ?? u.trigger}`, onclick: () => this.#goTo(u) }, [
        el('span', { class: 'st-mark', text: u.graph === 'game' ? '🌐' : '🗺' }),
        el('div', { class: 'st-trow-text' }, [el('div', { class: 'st-trow-name', text: `${where} · ${u.node ?? u.trigger}` }),
          el('div', { class: 'st-muted', text: `${say[u.how]}${u.widget ? ` ${u.widget}` : ''}` })]),
        el('span', { class: 'st-muted', text: '›' })
      ]))
    }
    if (!uses.length) rows.push(muted('Nothing opens it yet.'))
    // Every graph there is, and a first one for a scope with none.
    const scopeTargets = (owner, scope, map, first, icon, label) => {
      const names = graphsOf(owner).map(([n]) => n)
      return (names.length ? names : [first]).map((n) => [graphRoute(scope, map, n), `${icon} ${label} · ${n}${names.length ? '' : ' (new)'}`])
    }
    const targets = [...(this.nodesReady ? scopeTargets(S.module, 'game', null, GAME_NAME, '🌐', 'the game') : []),
      ...Object.keys(S.docs).sort().flatMap((m) => scopeTargets(S.docs[m], 'map', m, MAP_GRAPH, '🗺', m))]
    rows.push(select('open it from', '', [['', 'choose a graph…'], ...targets], (g) => { if (g) this.#addNodes(g, 'open') }))
    rows.push(select('answer', '', [['', 'choose a widget…'], ...p.widgets.filter((w) => w.kind !== 'label').map((w) => [w.name, `${ICON[w.kind]} ${w.name}`])], (wn) => {
      if (!wn) return
      this.answering = wn
      this.render()
    }))
    if (this.answering && p.widgets.some((w) => w.name === this.answering)) {
      rows.push(select(`answer ${this.answering} in`, '', [['', 'choose a graph…'], ...targets], (g) => { if (g) this.#addNodes(g, 'answer', this.answering) }))
    }
    rows.push(muted(this.nodesReady
      ? 'A panel is answered in the graph that opens it: one the game opens, by the game\'s graph; one a map opens, by that map\'s.'
      : 'Until the engine has panel nodes (docs/PANELS.md), a map\'s graph opens a panel with the trigger words -- do ui_open -- and hears a press as when on_ui_event + if widget_is. The game\'s graph waits for the panel nodes.'))
    return rows
  }

  /** Go to where it is used: the graph, its node picked; or the map's trigger cards. */
  async #goTo (u) {
    const S = this.S
    if (u.trigger) { await S.go('map', u.graph); S.showTriggers?.(); return }
    S.graphFocus = u.node
    if (u.graph === 'game') return S.go('graph', graphRoute('game', null, u.gname))
    if (u.graph !== S.docName) await S.openDoc(u.graph)
    S.go('graph', graphRoute('map', u.graph, u.gname))
  }

  /**
   * Put the nodes that open the panel, or answer one of its widgets, into a
   * graph, then go there with them picked. The engine's panel nodes when it
   * has them; otherwise the trigger words a map's graph runs today.
   */
  async #addNodes (route, what, widget = null) {
    const S = this.S
    const to = parseGraphRoute(route)
    const game = to.scope === 'game'
    const target = to.map
    const owner = game ? S.module : S.docs[target]
    owner.graphs ??= {}
    const graph = (owner.graphs[to.name] ??= newGraph())
    const ids = new Set(graph.nodes.map((n) => n.id))
    const id = (base) => { const b = freeName(base, ids); ids.add(b); return b }
    const y = graph.nodes.length ? Math.max(...graph.nodes.map((n) => n.pos?.y ?? 0)) + 180 : 0
    const w = widget ? this.panel.widgets.find((x) => x.name === widget) : null
    let focus
    if (what === 'open') {
      focus = id(`open_${this.name}`)
      graph.nodes.push(this.nodesReady
        ? { id: focus, type: 'open_panel', panel: this.name, pos: { x: 280, y } }
        : { id: focus, type: 'action', a: 'ui_open', panel: this.name, pos: { x: 280, y } })
    } else if (this.nodesReady) {
      focus = id(`on_${widget}`)
      graph.nodes.push({ id: focus, type: 'when_panel_used', panel: this.name, widget, pos: { x: 0, y } })
    } else {
      const ev = id(`ui_${widget}`)
      focus = id(`is_${widget}`)
      graph.nodes.push({ id: ev, type: 'event', event: 'on_ui_event', pos: { x: 0, y } },
        { id: focus, type: 'condition', c: 'widget_is', widget: w.id, pos: { x: 260, y } })
      graph.links.push([`${ev}.then`, `${focus}.in`])
    }
    S.graphFocus = focus
    S.moduleChanged()
    S.status(`added to ${game ? 'the game' : target}'s graph ${to.name}: ${focus}`, 'ok')
    if (game) return S.go('graph', route)
    if (target !== S.docName) await S.openDoc(target)
    S.commit()
    S.go('graph', route)
  }

  #rename (raw) {
    const n = cleanName(raw)
    if (!n || n === this.name) { this.render(); return }
    if (!NAME_RE.test(n) || this.panels[n]) { this.S.status('that name is empty or taken', 'warn'); this.render(); return }
    const S = this.S
    S.module.panels[n] = S.module.panels[this.name]
    delete S.module.panels[this.name]
    // Every card and node that names it follows.
    renamePanelRefs(S.module, this.name, n)
    for (const d of Object.values(S.docs)) renamePanelRefs(d, this.name, n)
    this.name = n
    this.changed()
  }
}

const snap = (v) => Math.round(v / GRID) * GRID
/** A phone: on its side and short, or upright and narrow. */
const handheld = () => matchMedia('(max-height:560px) and (orientation:landscape), (max-width:600px) and (orientation:portrait)').matches

const STYLE = `
.pw{grid-template-columns:1fr 400px;grid-template-areas:"top top" "stage details"}
.pw .wk-top select{height:40px;border-radius:8px;background:rgba(27,34,48,.85);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);font:600 12px/1 ui-monospace,Menlo,monospace;padding:0 8px;max-width:180px}
.pw .wk-top .pw-modes{display:flex}
.pw .wk-details>*{flex:0 0 auto}
.pw .st-trow{padding:4px 10px;min-height:0;gap:4px}
.pw .st-trow[data-on="1"]{background:rgba(91,143,214,.25)}
.pw-stage{grid-area:stage;position:relative;overflow:hidden;background:#07090d;touch-action:none}
.pw-frame{position:absolute;left:0;top:0;transform-origin:0 0;background:linear-gradient(160deg,#1a2230,#0e1219);border:2px solid #3a4454;border-radius:18px;overflow:hidden}
.pw-zoom{position:absolute;right:8px;bottom:8px;z-index:5;display:flex;align-items:center;gap:4px;background:rgba(11,13,18,.85);border:1px solid #2a3446;border-radius:10px;padding:4px}
.pw .pw-zoom button{min-width:36px;height:34px;padding:0 8px;border-radius:8px;background:rgba(27,34,48,.95);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);font:600 15px/1 ui-monospace,Menlo,monospace;cursor:pointer}
.pw-zoom-pct{font:600 11px ui-monospace,Menlo,monospace;color:#9fb0c8;min-width:42px;text-align:center}
/* Fingers: handles big enough to take. */
@media (pointer:coarse){
  .pw-corner{width:24px;height:24px;right:-12px;bottom:-12px;border-radius:6px}
  .pw-edge-r{width:20px;right:-10px}
  .pw-edge-b{height:20px;bottom:-10px}
}
.pw-safe{position:absolute;border:1px dashed rgba(207,227,255,.12);pointer-events:none}
.pw-hits{position:absolute;inset:0}
.pw-behind{opacity:.45}
.pw-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9fb0c8;font:600 14px ui-monospace,Menlo,monospace}
.pw-hits{z-index:60}
.pw-box{position:absolute;box-sizing:border-box;touch-action:none;cursor:grab}
.pw-panel{outline:1px dashed rgba(255,224,102,.35)}
.pw-panel[data-on="1"]{outline:2px solid #ffe066}
.pw-slot{outline:1px dashed rgba(122,212,138,.55)}
.pw-slot[data-on="1"]{outline:2px solid #66ff99;background:rgba(102,255,153,.08)}
.pw-decor{outline:1px dotted rgba(143,208,255,.6)}
.pw-decor[data-on="1"]{outline:2px solid #8fd0ff}
.pw-tag{position:absolute;left:0;top:-15px;font:600 10px/14px ui-monospace,Menlo,monospace;color:#0e1219;background:rgba(122,212,138,.85);padding:0 4px;border-radius:3px;white-space:nowrap;pointer-events:none;opacity:0}
.pw-slot:hover .pw-tag,.pw-slot[data-on="1"] .pw-tag{opacity:1}
.pw-corner{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;background:#66ff99;border-radius:3px;cursor:nwse-resize;touch-action:none;display:none}
.pw-slot[data-on="1"] .pw-corner{display:block}
.pw-edge{position:absolute;touch-action:none;display:none}
.pw-panel[data-on="1"] .pw-edge{display:block}
.pw-edge-r{right:-6px;top:20%;bottom:20%;width:12px;cursor:ew-resize;background:rgba(255,224,102,.6);border-radius:4px}
.pw-edge-b{bottom:-6px;left:20%;right:20%;height:12px;cursor:ns-resize;background:rgba(255,224,102,.6);border-radius:4px}
.pw[data-mode="try"] .pw-hits{display:none}
.pw-xywh{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
.pw-heard{display:flex;flex-direction:column;gap:6px}
.pw-heard-row{border-left:3px solid #66ff99;padding:2px 8px;font:600 12px ui-monospace,Menlo,monospace}
@media (max-width:1100px) and (orientation:landscape){
  .pw{grid-template-columns:minmax(0,1fr) minmax(300px,46%);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"top top" "stage details"}
  .pw .wk-details{display:flex;grid-area:details;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
}
@media (max-width:1100px) and (orientation:portrait){
  .pw{display:block;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .pw .pw-stage{min-height:200px}
  .pw .wk-details{display:flex;overflow:visible;border-left:0;border-top:1px solid #2a3446}
}
`
