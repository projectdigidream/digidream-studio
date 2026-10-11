//
// SCREENS: what is drawn over the game -- the HUD, the touch controls and the
// look of script panels -- edited by putting it where it goes
// (docs/UI_LAYOUT.md).
//
// THE PICTURE IS THE GAME'S. The device frame is drawn by the client's own
// HudView and UiView, placed by its own `place` and `uiScale`, and the touch
// buttons resolved by its own `touchLayout`. Nothing here decides where an
// element lands; it only edits the data and asks the client. What the frame
// shows is therefore what a phone of that size will show.
//
// ONE LAYOUT FOR THE MODULE, and a map may have its own. A map's is complete
// (the client picks one file per level and never merges), so "only this map"
// starts as a copy of the module's.
//
// Three tabs: HUD (elements: text, numbers, bars, pictures, groups), touch
// (the engine's buttons: moved, resized, relabelled, hidden -- never invented),
// and panels (templates a script's panel can name). Sample data drives the
// HUD so a low-health bar or a full magazine can be seen without playing.
//
import { el, row, number, text, select, toggle, button, muted, withIcon, icon } from './ui.js'
import { newLayout, anchorFor } from './ui_emit.js'
import { DEFAULT_LAYOUT, ANCHORS, TOUCH_IDS, CLIENT_BINDINGS, STANDARD_HUD_NAMES, HudView, parseLayout, place, uiScale } from '/src/render/layout.js'
import { touchLayout } from '/src/render/touchui.js'
import { UiView } from '/src/render/ui.js'
import { UI_KIND } from '/src/proto.js'

// Screens to try a layout on. Logical CSS pixels, and the safe area a notched
// phone keeps clear -- the client offsets everything from it, so must this.
export const DEVICES = {
  'phone, landscape': { width: 844, height: 390, insets: { left: 47, right: 47, bottom: 21 }, touch: true },
  'phone, portrait': { width: 390, height: 844, insets: { top: 47, bottom: 34 }, touch: true },
  'tablet': { width: 1180, height: 820, insets: { bottom: 20 }, touch: true },
  'desktop': { width: 1280, height: 720, insets: {}, touch: false }
}

const TYPES = ['text', 'number', 'bar', 'image', 'group']

/**
 * THE MODULE'S PICTURES IN THE HUD. The client's image element asks for
 * /sprites/<name>.png, then /textures/<name>.png -- served in the game, but in
 * the studio the module's own pictures are in its store, so those URLs miss and
 * the picture draws broken. Every such src under `host` is pointed at the
 * module's copy (a sprite picture first, then a texture, as the client tries
 * them), now and whenever the client sets one again.
 */
export function moduleImageUrl (S, src) {
  const m = /\/(sprites|textures)\/([^/?#]+)\.png$/.exec(src ?? '')
  if (!m) return null
  const name = decodeURIComponent(m[2])
  return (m[1] === 'sprites' ? S.spriteUrls?.get(name) : null) ?? S.imageUrls?.get(name) ?? null
}

function useModuleImages (host, S) {
  const fix = (node) => {
    if (node.tagName !== 'IMG') return
    const url = moduleImageUrl(S, node.getAttribute('src'))
    if (url) node.src = url
  }
  if (host.__images) return
  host.__images = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'attributes') fix(r.target)
      else for (const n of r.addedNodes) if (n.nodeType === 1) { fix(n); for (const k of n.querySelectorAll('img')) fix(k) }
    }
  })
  host.__images.observe(host, { attributes: true, attributeFilter: ['src'], subtree: true, childList: true })
}
const SAMPLE = { hp: 75, map: 'first', 'hud.hp_max': 100, 'hud.weapon': 'pistol', 'hud.ammo_type': 'bullets', 'hud.ammo': 12, 'hud.ammo_max': 50 }

let win = null
export function openScreens (S) {
  win ??= new Screens(S)
  win.open()
  return win
}

class Screens {
  constructor (S) {
    this.S = S
    this.tab = 'hud'
    this.device = 'phone, landscape'
    this.picked = null          // the id of the selected element / button / template
    this.sample = { ...SAMPLE }
    this.root = el('div', { class: 'wk sc' })
    this.root.hidden = true
    document.body.appendChild(this.root)
    const style = el('style', { text: STYLE })
    document.head.appendChild(style)
  }

  get scope () { return this.S.screensScope ?? 'module' }

  /** The layout being edited: the module's, or this map's own. */
  get layout () {
    const S = this.S
    if (this.scope === 'map' && S.doc.ui) return S.doc.ui
    // Looking is not choosing: until something is changed the module has no
    // layout of its own and writes no files, and the game draws its default.
    return S.module.ui ?? (this.draft ??= newLayout(DEFAULT_LAYOUT))
  }

  /** A change: a map's is undoable with the map; the module's re-bakes it. */
  changed () {
    const S = this.S
    if (this.scope === 'map' && S.doc.ui) S.commit()
    else {
      if (!S.module.ui && this.draft) { S.module.ui = this.draft; this.draft = null }
      S.moduleChanged()
    }
    this.render()
  }

  open () {
    this.root.hidden = false
    this.S.ui.layer.dataset.workshop = '1'
    this.S.ui.hideSheet()
    this.render()
  }

  close () {
    this.root.hidden = true
    this.S.ui.layer.dataset.workshop = '0'
    this.hud?.destroy()
    this.hud = null
  }

  // --- the frame -------------------------------------------------------------------

  render () {
    const S = this.S
    const dev = DEVICES[this.device]
    const scheme = S.module.controls === 'fps' ? 'fps' : 'platformer'
    const checked = parseLayout(this.layout)
    const top = el('div', { class: 'wk-top' }, [
      el('span', { class: 'wk-title' }, withIcon('section.screens', 'screens')),
      el('div', { class: 'wk-tabs sc-tabs' }, [['module', 'every map', 'action.scopegame'], ['map', `only ${S.docName}`, 'action.scopemap']].map(([v, l, i]) =>
        el('button', { 'data-on': this.scope === v ? '1' : '0', 'data-scope': v, onclick: () => { S.screensScope = v; this.picked = null; this.render() } }, withIcon(i, l)))),
      select('', this.device, Object.keys(DEVICES), (v) => { this.device = v; this.render() }).lastChild,
      el('div', { class: 'wk-tabs sc-tabs' }, [['hud', 'HUD'], ['touch', 'touch'], ['panels', 'templates']].map(([v, l]) =>
        el('button', { text: l, 'data-on': this.tab === v ? '1' : '0', 'data-tab': v, onclick: () => { this.tab = v; this.picked = null; this.render() } }))),
      el('span', { style: 'flex:1' }),
      button(withIcon('action.back', 'back'), () => (this.S.leave ? this.S.leave() : this.close()), 'wk-back')
    ])

    // The frame, scaled to fit beside the controls; the client draws at the
    // device's own logical size inside it.
    const stage = el('div', { class: 'sc-stage' })
    const frame = el('div', { class: 'sc-frame', style: `width:${dev.width}px;height:${dev.height}px` })
    const safe = el('div', { class: 'sc-safe' })
    Object.assign(safe.style, { left: `${dev.insets.left ?? 0}px`, right: `${dev.insets.right ?? 0}px`, top: `${dev.insets.top ?? 0}px`, bottom: `${dev.insets.bottom ?? 0}px` })
    frame.appendChild(safe)
    stage.appendChild(frame)
    const hits = el('div', { class: 'sc-hits' })

    this.hud?.destroy()
    if (this.tab === 'hud' || this.tab === 'touch') {
      useModuleImages(frame, this.S)
      this.hud = new HudView({ host: frame, touch: dev.touch, insets: dev.insets, size: { width: dev.width, height: dev.height } })
      this.hud.setLayout(checked.layout)
      this.hud.update(this.sample)
    } else this.hud = null
    if (this.tab === 'touch' || (this.tab === 'hud' && dev.touch)) this.#drawTouch(frame, hits, scheme, dev, this.tab === 'touch')
    if (this.tab === 'panels') this.#drawPanel(frame, dev)
    frame.appendChild(hits)

    const side = el('div', { class: 'wk-details' })
    if (this.scope === 'map') {
      side.appendChild(toggle(`own screens on ${S.docName}`, !!S.doc.ui, (v) => {
        if (v) S.doc.ui = newLayout(S.module.ui ?? DEFAULT_LAYOUT)
        else delete S.doc.ui
        S.commit(); this.render()
      }))
      if (!S.doc.ui) side.appendChild(muted(`${S.docName} uses the module's screens. Switch this on to give it a complete layout of its own, starting from a copy of the module's.`))
    }
    if (!checked.ok) side.appendChild(el('div', { class: 'st-danger', text: `The game would refuse part of this: ${checked.errors.join('; ')}` }))
    if (this.scope === 'module' || S.doc.ui) {
      if (this.tab === 'hud') side.append(...this.#hudRows(hits, frame, dev))
      if (this.tab === 'touch') side.append(...this.#touchRows(scheme))
      if (this.tab === 'panels') side.append(...this.#panelRows())
    }

    this.root.replaceChildren(top, stage, side)
    // Fit the frame into the stage once it has a size; the HUD measures its
    // text after it is attached, so it is painted again then.
    this.fit = () => {
      const r = stage.getBoundingClientRect()
      // Upright the stage is as tall as the scaled frame (the page scrolls);
      // otherwise the frame fits the stage it is given.
      const upright = matchMedia('(max-width:1100px) and (orientation:portrait)').matches
      const k = upright ? Math.min(1, (r.width - 24) / dev.width) : Math.min(1, (r.width - 24) / dev.width, (r.height - 24) / dev.height)
      this.k = k > 0 ? k : 1
      frame.style.transform = `scale(${this.k})`
      frame.style.transformOrigin = upright ? 'top center' : 'center'
      if (upright) stage.style.height = `${Math.ceil(dev.height * this.k) + 24}px`
      else stage.style.height = ''
      this.hud?.refresh()
      if (this.tab === 'hud') this.#placeHits(hits, frame, dev)
    }
    requestAnimationFrame(() => this.fit())
    if (!this.onResize) { this.onResize = () => { if (!this.root.hidden) this.fit?.() }; addEventListener('resize', this.onResize) }
  }

  // --- HUD ---------------------------------------------------------------------------

  /** Tap targets over the HUD's top-level elements, placed where the client put them. */
  #placeHits (hits, frame, dev) {
    for (const h of [...hits.querySelectorAll('.sc-hit-hud')]) h.remove()
    for (const n of this.hud?.nodes ?? []) {
      if (n.dom.style.display === 'none') continue
      const box = el('div', { class: 'sc-hit sc-hit-hud', 'data-el': n.el.id, 'data-on': n.el.id === this.picked ? '1' : '0' })
      Object.assign(box.style, { left: n.dom.style.left, top: n.dom.style.top, width: `${n.dom.offsetWidth}px`, height: `${n.dom.offsetHeight}px` })
      // The HUD drew the PARSED copy; the drag must move the document's own.
      const mine = this.#flat().find((f) => f.e.id === n.el.id)?.e
      if (mine) this.#draggable(box, mine, dev, () => ({ width: n.dom.offsetWidth, height: n.dom.offsetHeight }))
      hits.appendChild(box)
    }
  }

  /**
   * Drag to move; on release the element re-anchors to the ninth of the
   * screen it ended in, keeping where it is. A tap without a move selects.
   */
  #draggable (box, item, dev, sizeOf) {
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      box.setPointerCapture?.(e.pointerId)
      const start = { x: e.clientX, y: e.clientY, left: parseFloat(box.style.left), top: parseFloat(box.style.top) }
      let moved = false
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / this.k
        const dy = (ev.clientY - start.y) / this.k
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        box.style.left = `${start.left + dx}px`
        box.style.top = `${start.top + dy}px`
      }
      const up = () => {
        box.removeEventListener('pointermove', move)
        box.removeEventListener('pointerup', up)
        box.removeEventListener('pointercancel', up)
        if (!moved) { this.picked = item.id; this.render(); return }
        const sz = sizeOf()
        const s = uiScale(this.layout, dev.width, dev.height)
        const a = anchorFor({ left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: sz.width, height: sz.height }, dev.width, dev.height, s, dev.insets)
        Object.assign(item, a)
        this.picked = item.id
        this.changed()
      }
      box.addEventListener('pointermove', move)
      box.addEventListener('pointerup', up)
      box.addEventListener('pointercancel', up)
    })
  }

  /** Every element, nested, as a list to pick from. */
  #flat (list = this.layout.hud ?? [], depth = 0, out = []) {
    for (const e of list) { out.push({ e, depth, parent: list }); if (e.type === 'group') this.#flat(e.children ?? [], depth + 1, out) }
    return out
  }

  #bindings () {
    const pools = Object.keys(this.S.module.weapons?.ammo ?? {}).map((p) => `hud.ammo_${p}`)
    return [...CLIENT_BINDINGS.map((b) => b.name), ...STANDARD_HUD_NAMES.map((b) => b.name).filter((n) => !n.includes('<')), ...pools]
  }

  #hudRows (hits, frame, dev) {
    const L = this.layout
    L.hud ??= []
    const rows = [el('div', { class: 'st-section-head', text: 'elements' })]
    const flat = this.#flat()
    for (const { e, depth } of flat) {
      rows.push(el('div', { class: 'st-trow', 'data-el': e.id, 'data-on': e.id === this.picked ? '1' : '0', style: `padding-left:${8 + depth * 16}px`,
        onclick: () => { this.picked = e.id; this.render() } }, [
        el('div', { class: 'st-trow-text' }, [el('div', { class: 'st-trow-name', text: `${e.id}` }),
          el('div', { class: 'st-muted', text: `${e.type}${e.bind ? ` · ${e.bind}` : ''}${e.show && e.show !== 'always' ? ` · ${e.show} only` : ''}` })])
      ]))
    }
    rows.push(select('add', '', [['', '+ element…'], ...TYPES.map((t) => [t, t])], (t) => {
      if (!t) return
      const ids = new Set(flat.map((f) => f.e.id))
      let n = 1
      while (ids.has(`${t}${n}`)) n++
      const e = { id: `${t}${n}`, type: t, anchor: 'c', x: 0, y: 0 }
      if (t === 'text') e.text = 'Text'
      if (t === 'number') Object.assign(e, { bind: 'hp', format: '{value}', style: { size: 20, weight: 600 } })
      if (t === 'bar') Object.assign(e, { bind: 'hp', max: 'hud.hp_max', w: 160, h: 8, fill: '#5fbf6a' })
      if (t === 'image') Object.assign(e, { bind: 'hud.weapon_icon', w: 48, h: 48 })
      if (t === 'group') Object.assign(e, { stack: 'column', gap: 4, children: [] })
      const into = flat.find((f) => f.e.id === this.picked && f.e.type === 'group')?.e
      ;(into ? (into.children ??= []) : L.hud).push(into ? { ...e, anchor: undefined } : e)
      this.picked = e.id
      this.changed()
    }))
    const sel = flat.find((f) => f.e.id === this.picked)
    if (sel) rows.push(...this.#elementForm(sel.e, sel.parent, sel.depth > 0))
    else rows.push(muted('Tap an element in the frame or the list. Drag it in the frame to move it: it re-anchors to the part of the screen it lands in, so it stays there on a wider screen.'))
    rows.push(el('div', { class: 'st-section-head', text: 'sample data' }))
    const used = new Set(['hp', 'hud.hp_max'])
    for (const { e } of flat) for (const k of [e.bind, typeof e.max === 'string' ? e.max : null, e.visible?.bind]) if (k) used.add(k)
    for (const k of used) {
      const v = this.sample[k]
      rows.push(typeof v === 'string' || /weapon$|type$|icon$|map$/.test(k)
        ? text(k, v ?? '', (x) => { this.sample[k] = x; this.hud?.update({ [k]: x }); this.#placeHits(hits, frame, dev) })
        : number(k, v ?? 0, { min: 0, max: 9999, step: 1 }, (x) => { this.sample[k] = x; this.hud?.update({ [k]: x }); this.#placeHits(hits, frame, dev) }))
    }
    rows.push(muted('What the HUD shows while you look at it here. `hp` comes from the game every frame; the hud.* names are what the weapons runtime sends.'))
    return rows
  }

  #elementForm (e, parent, nested) {
    const ch = () => this.changed()
    const set = (k) => (v) => { if (v === '' || v === undefined || v === null) delete e[k]; else e[k] = v; ch() }
    const st = (k) => (v) => { e.style ??= {}; if (v === '' || v === undefined) delete e.style[k]; else e.style[k] = v; if (!Object.keys(e.style).length) delete e.style; ch() }
    const binds = this.#bindings()
    const bindRow = (label, key) => {
      const list = el('datalist', { id: `sc-binds-${key}` }, binds.map((b) => el('option', { value: b })))
      const i = el('input', { type: 'text', value: typeof e[key] === 'string' ? e[key] : '', list: `sc-binds-${key}`, placeholder: 'hp, hud.ammo …' })
      i.addEventListener('change', () => set(key)(i.value.trim()))
      return row(label, el('span', {}, [i, list]))
    }
    const size = (k) => (typeof e[k] === 'number' ? e[k] : '')
    const rows = [el('div', { class: 'st-section-head' }, withIcon('action.expand', `${e.id}`)),
      text('id', e.id, (v) => { const id = v.trim().slice(0, 24); if (id) { e.id = id; this.picked = id; ch() } })]
    if (!nested) {
      rows.push(select('anchor', e.anchor ?? 'tl', ANCHORS, set('anchor')),
        number('x', e.x ?? 0, { min: -2000, max: 2000, step: 1 }, set('x')),
        number('y', e.y ?? 0, { min: -2000, max: 2000, step: 1 }, set('y')))
    }
    rows.push(row('w', el('input', { type: 'number', value: size('w'), placeholder: 'auto', onchange: (ev) => set('w')(ev.target.value === '' ? undefined : Number(ev.target.value)) })),
      row('h', el('input', { type: 'number', value: size('h'), placeholder: 'auto', onchange: (ev) => set('h')(ev.target.value === '' ? undefined : Number(ev.target.value)) })),
      select('shown', e.show ?? 'always', [['always', 'always'], ['touch', 'touch screens only'], ['desktop', 'keyboard and mouse only']], (v) => set('show')(v === 'always' ? undefined : v)))
    if (e.type === 'text') rows.push(text('text', e.text ?? '', set('text'), { placeholder: 'Ammo {hud.ammo}' }))
    if (e.type === 'number') rows.push(bindRow('value of', 'bind'), text('format', e.format ?? '{value}', set('format'), { placeholder: '{value} / {max}' }))
    if (e.type === 'bar') {
      rows.push(bindRow('value of', 'bind'), bindRow('out of', 'max'),
        row('fill', el('input', { type: 'color', value: e.fill ?? '#5fbf6a', onchange: (ev) => set('fill')(ev.target.value) })),
        number('low below', e.low?.[0]?.below ?? 0, { min: 0, max: 1, step: 0.05 }, (v) => { if (v > 0) e.low = [{ below: v, fill: e.low?.[0]?.fill ?? '#d65b5b' }]; else delete e.low; ch() }))
    }
    if (e.type === 'image') rows.push(bindRow('picture from', 'bind'), text('or always', e.frame ?? '', set('frame'), { placeholder: 'a sprite name, e.g. PISGA0' }))
    if (e.type === 'group') rows.push(select('stack', e.stack ?? '', [['', 'free'], ['row', 'in a row'], ['column', 'in a column']], set('stack')), number('gap', e.gap ?? 0, { min: 0, max: 64, step: 1 }, set('gap')),
      muted('With this group selected, + element puts the new one inside it.'))
    rows.push(el('div', { class: 'st-section-head', text: 'look' }),
      row('colour', el('input', { type: 'color', value: e.style?.color ?? '#cfe3ff', onchange: (ev) => st('color')(ev.target.value) })),
      number('text size', e.style?.size ?? 12, { min: 6, max: 96, step: 1 }, st('size')),
      select('weight', String(e.style?.weight ?? 400), [['400', 'normal'], ['600', 'bold']], (v) => st('weight')(Number(v))),
      select('align', e.style?.align ?? 'left', ['left', 'center', 'right'], st('align')))
    // Shown only when a binding says so: a key icon while the key is held.
    const vis = e.visible
    rows.push(toggle('shown only when…', !!vis, (v) => { if (v) e.visible = { bind: 'hp', op: 'set' }; else delete e.visible; ch() }))
    if (vis) {
      const list = el('datalist', { id: 'sc-binds-vis' }, this.#bindings().map((b) => el('option', { value: b })))
      const i = el('input', { type: 'text', value: vis.bind, list: 'sc-binds-vis' })
      i.addEventListener('change', () => { vis.bind = i.value.trim() || 'hp'; ch() })
      rows.push(row('binding', el('span', {}, [i, list])),
        select('is', vis.op, [['set', 'has a value'], ['gt', 'more than'], ['lt', 'less than'], ['eq', 'equal to'], ['ne', 'not equal to']], (v) => { vis.op = v; ch() }))
      if (vis.op !== 'set') rows.push(text('value', vis.value ?? '', (v) => { vis.value = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; ch() }))
    }
    rows.push(button('delete element', () => { parent.splice(parent.indexOf(e), 1); this.picked = null; ch() }, 'st-danger'))
    return rows
  }

  // --- touch --------------------------------------------------------------------------

  #touchKey (scheme) { return scheme === 'fps' ? 'touch_fps' : 'touch' }

  /** The module's own keys that have a touch label (Controls; docs/KEYS.md), as the client takes them. */
  #keys () { return (this.S.module.keys ?? []).filter((k) => k.name && k.touch).map((k) => ({ name: k.name, label: k.touch })) }

  /** The buttons and the stick's zone, placed by the client's arithmetic. */
  #drawTouch (frame, hits, scheme, dev, editable) {
    const L = this.layout
    const t = touchLayout(parseLayout(L).layout, scheme, new Set(), this.#keys())
    const s = uiScale(L, dev.width, dev.height)
    const z = place(t.zone, L, dev.width, dev.height, dev.insets)
    const zone = el('div', { class: 'sc-zone' })
    Object.assign(zone.style, { left: `${z.left}px`, top: `${z.top}px`, width: `${z.width}px`, height: `${z.height}px` })
    frame.appendChild(zone)
    const key = this.#touchKey(scheme)
    for (const b of t.buttons) {
      const r = place(b, L, dev.width, dev.height, dev.insets)
      const node = el('div', { class: 'sc-btn' + (editable ? ' sc-hit' : ''), text: b.label ?? b.id.toUpperCase(), 'data-btn': b.id, 'data-on': editable && b.id === this.picked ? '1' : '0' })
      Object.assign(node.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: `${Math.max(9, 12 * s)}px` })
      if (editable) {
        // Dragging writes the button into this layout's own list, which the
        // client merges over its defaults by id.
        const own = () => {
          L[key] ??= { buttons: [] }
          L[key].buttons ??= []
          let mine = L[key].buttons.find((x) => x.id === b.id)
          if (!mine) { mine = { ...b }; L[key].buttons.push(mine) }
          return mine
        }
        this.#draggable(node, { get id () { return b.id }, set anchor (v) { own().anchor = v }, set x (v) { own().x = v }, set y (v) { own().y = v } }, dev, () => ({ width: r.width, height: r.height }))
        hits.appendChild(node)
      } else frame.appendChild(node)
    }
  }

  #touchRows (scheme) {
    const L = this.layout
    const key = this.#touchKey(scheme)
    const resolved = parseLayout(L).layout[key]
    const rows = [muted(`This module plays ${scheme === 'fps' ? 'first person' : 'as a platformer'} (Module settings), so these are its ${scheme === 'fps' ? 'first-person' : 'platformer'} controls. The buttons are the engine's: each one is an input, so they can be moved, resized, relabelled and hidden, not invented.`)]
    // Every button the client would draw, the module's keys included, where it would draw them.
    const full = touchLayout(parseLayout(L).layout, scheme, new Set(TOUCH_IDS), this.#keys()).buttons
    const own = (id) => {
      L[key] ??= { buttons: [] }
      L[key].buttons ??= []
      let b = L[key].buttons.find((x) => x.id === id)
      if (!b) { b = { ...(resolved.buttons.find((x) => x.id === id) ?? full.find((x) => x.id === id) ?? { id }) }; L[key].buttons.push(b) }
      return b
    }
    const ids = [...TOUCH_IDS, ...this.#keys().map((k) => `key:${k.name}`)]
    if (this.#keys().length) rows.push(muted('The module\'s own keys with a touch label (Controls) are here too, as key:<name>: unplaced, they stack in a column above the engine\'s buttons.'))
    for (const id of ids) {
      const b = resolved.buttons.find((x) => x.id === id) ?? full.find((x) => x.id === id) ?? { id }
      const on = id === this.picked
      rows.push(el('div', { class: 'st-card', 'data-btn': id }, [
        el('div', { class: 'st-row' }, [el('span', { class: 'st-entry', text: id }), button(withIcon(on ? 'action.collapse' : 'action.expand'), () => { this.picked = on ? null : id; this.render() })]),
        toggle('shown', !b.hidden, (v) => { own(id).hidden = !v; this.changed() }),
        ...(on ? [
          text('label', b.label ?? id.toUpperCase(), (v) => { own(id).label = v; this.changed() }),
          number('size', b.size ?? 74, { min: 32, max: 160, step: 2 }, (v) => { own(id).size = v; this.changed() }),
          select('anchor', b.anchor ?? 'br', ANCHORS, (v) => { own(id).anchor = v; this.changed() }),
          number('x', b.x ?? 0, { min: -2000, max: 2000, step: 1 }, (v) => { own(id).x = v; this.changed() }),
          number('y', b.y ?? 0, { min: -2000, max: 2000, step: 1 }, (v) => { own(id).y = v; this.changed() })
        ] : [])
      ]))
    }
    const zone = resolved.stick.zone
    rows.push(el('div', { class: 'st-section-head', text: 'the stick\'s zone' }),
      muted('Where a thumb must land to move. The pad appears wherever it lands inside, so the zone is generous on purpose.'),
      number('width, % of the screen', zone.w?.vw ?? 46, { min: 10, max: 80, step: 1 }, (v) => { L[key] ??= {}; L[key].stick = { zone: { ...zone, w: { vw: v, max: zone.w?.max ?? 340 } } }; this.changed() }),
      number('height, % of the screen', zone.h?.vh ?? 58, { min: 10, max: 100, step: 1 }, (v) => { L[key] ??= {}; L[key].stick = { zone: { ...zone, h: { vh: v, max: zone.h?.max ?? 380 } } }; this.changed() }),
      button('back to the engine\'s buttons', () => { delete L[key]; this.picked = null; this.changed() }))
    return rows
  }

  // --- panels -------------------------------------------------------------------------

  /** The picked template, drawn by the client's UiView with sample widgets. */
  #drawPanel (frame, dev) {
    const name = this.picked && this.layout.panels?.[this.picked] ? this.picked : Object.keys(this.layout.panels ?? {})[0]
    if (!name) return
    const t = this.layout.panels[name]
    // The map's panel of the same name, if it has one, else one widget per slot.
    const real = this.S.doc.panels?.[name]?.widgets
    const KIND = { label: UI_KIND.LABEL, button: UI_KIND.BUTTON, slider: UI_KIND.SLIDER, select: UI_KIND.SELECT, toggle: UI_KIND.TOGGLE }
    const widgets = real
      ? real.map((w) => ({ kind: KIND[w.kind] ?? UI_KIND.LABEL, id: w.id, label: w.label ?? '', value: w.value ?? 0, lo: w.lo ?? 0, hi: w.hi ?? 0, options: w.options ?? [] }))
      : (t.slots ?? []).map((sl) => ({ kind: UI_KIND.BUTTON, id: sl.widget, label: `widget ${sl.widget}`, value: 0, lo: 0, hi: 0, options: [] }))
    const view = new UiView({ onEvent: () => {}, host: frame, layout: parseLayout(this.layout).layout, size: { width: dev.width, height: dev.height }, insets: dev.insets })
    view.open({ uiId: 1, title: this.S.doc.panels?.[name]?.title ?? name, widgets, template: name })
  }

  #panelRows () {
    const L = this.layout
    L.panels ??= {}
    const rows = [el('div', { class: 'st-row' }, [el('span', { class: 'st-muted', text: 'The module\'s panels are designed in Panels, widgets and look together.' }), button(withIcon('section.panels', 'Panels…'), () => this.S.go('panels'))]),
      muted('Here: templates for panels a hand-written script opens (dnp.ui_open{ template = … }) -- how such a panel LOOKS: where it sits and where each widget goes. Widgets it does not place are stacked in the body, so a template never loses a control.')]
    for (const [name, t] of Object.entries(L.panels)) {
      const on = name === this.picked
      const set = (k) => (v) => { if (v === '' || v === undefined) delete t[k]; else t[k] = v; this.changed() }
      const body = [el('div', { class: 'st-row' }, [el('span', { class: 'st-entry', text: name }), button(withIcon(on ? 'action.collapse' : 'action.expand'), () => { this.picked = on ? null : name; this.render() })])]
      if (on) {
        body.push(select('anchor', t.anchor ?? 'c', ANCHORS, set('anchor')),
          number('x', t.x ?? 0, { min: -2000, max: 2000, step: 1 }, set('x')), number('y', t.y ?? 0, { min: -2000, max: 2000, step: 1 }, set('y')),
          number('width', t.w ?? 300, { min: 120, max: 1200, step: 10 }, set('w')),
          toggle('modal: dims the game and takes the touch input', !!t.modal, set('modal')),
          toggle('the player can close it', t.closeable !== false, (v) => set('closeable')(v ? undefined : false)))
        ;(t.slots ?? []).forEach((sl, i) => {
          body.push(el('div', { class: 'st-card' }, [
            number('widget id', sl.widget, { min: 0, max: 65535, step: 1 }, (v) => { sl.widget = Math.round(v); this.changed() }),
            select('anchor', sl.anchor ?? 'tl', ANCHORS, (v) => { sl.anchor = v; this.changed() }),
            number('x', sl.x ?? 0, { min: -2000, max: 2000, step: 1 }, (v) => { sl.x = v; this.changed() }),
            number('y', sl.y ?? 0, { min: -2000, max: 2000, step: 1 }, (v) => { sl.y = v; this.changed() }),
            number('w', sl.w ?? 120, { min: 20, max: 1200, step: 5 }, (v) => { sl.w = v; this.changed() }),
            button(withIcon('action.close', 'slot'), () => { t.slots.splice(i, 1); this.changed() })
          ]))
        })
        body.push(button('+ slot', () => { const used = new Set((t.slots ?? []).map((s) => s.widget)); let id = 1; while (used.has(id)) id++; (t.slots ??= []).push({ widget: id, anchor: 'tl', x: 12, y: 40 + 44 * (t.slots.length), w: 140 }); this.changed() }),
          button('delete template', () => { delete L.panels[name]; this.picked = null; this.changed() }, 'st-danger'))
      }
      rows.push(el('div', { class: 'st-card', 'data-template': name }, body))
    }
    rows.push(button('+ template', () => {
      const names = Object.keys(L.panels)
      const mapPanels = Object.keys(this.S.doc.panels ?? {}).filter((n) => !names.includes(n))
      let n = mapPanels[0] ?? 'panel'
      let k = 1
      while (L.panels[n]) n = `panel${++k}`
      L.panels[n] = { anchor: 'c', x: 0, y: 0, w: 320, modal: true, slots: [] }
      this.picked = n
      this.changed()
    }))
    if (Object.keys(this.S.doc.panels ?? {}).length) rows.push(muted(`A template named like one of this map's panels (${Object.keys(this.S.doc.panels).join(', ')}) is previewed with that panel's widgets.`))
    return rows
  }
}

const STYLE = `
.sc{grid-template-columns:1fr 400px;grid-template-areas:"top top" "stage details"}
.sc-stage{grid-area:stage;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--cv-common-stage)}
.sc-frame{position:relative;flex:0 0 auto;transform-origin:center;background:var(--cv-designer-frame-fill);
  border:var(--cv-designer-frame-width) solid var(--cv-designer-frame);border-radius:var(--cv-designer-frame-radius);overflow:hidden}
.sc-safe{position:absolute;border:1px dashed var(--cv-designer-safe);pointer-events:none}
.sc-hits{position:absolute;inset:0;z-index:40}
.sc-hit{position:absolute;cursor:grab;touch-action:none;outline:1px dashed var(--cv-designer-hit)}
.sc-hit[data-on="1"]{outline:var(--cv-common-selected-width) solid var(--cv-common-selected)}
.sc-zone{position:absolute;border:1px dashed var(--cv-designer-stick);border-radius:12px;pointer-events:none}
.sc-btn{position:absolute;border-radius:50%;display:flex;align-items:center;justify-content:center;font:var(--cv-designer-touchbtn-font);font-variant-ligatures:inherit;
  color:var(--dnp-color-text-primary);background:var(--cv-designer-touchbtn-fill);border:2px solid var(--cv-designer-touchbtn);box-sizing:border-box}
.sc-btn[data-on="1"]{border-color:var(--cv-common-selected)}
.sc .wk-top .sc-tabs{display:flex}
.sc .wk-details>*{flex:0 0 auto}
.sc .st-trow{padding:4px 10px;min-height:0;gap:4px}
.sc .wk-top select{height:40px;font-size:12px;line-height:1;padding:0 8px}

/* A phone on its side: the frame beside the list, each scrolling on its own. */
@media (max-width:1100px) and (orientation:landscape){
  .sc{grid-template-columns:minmax(0,1fr) minmax(300px,46%);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"top top" "stage details"}
  .sc .wk-details{display:flex;grid-area:details;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
}
/* Upright: one column that scrolls -- the frame, then everything under it --
   rather than a fixed split that leaves the list a sliver. */
@media (max-width:1100px) and (orientation:portrait){
  .sc{display:block;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .sc .sc-stage{height:auto;padding:12px 0}
  .sc .wk-details{display:flex;overflow:visible;border-left:0;border-top:1px solid var(--dnp-color-line-main)}
}
`
