//
// The Weapons workshop's "first person" tab (viewmodel_emit.js): how a weapon
// is drawn over the view when the module is played first person -- its
// pictures at rest and firing, where each sits on the screen, and a preview
// played with the client's own view-model arithmetic (render/viewmodel.js).
//
import { el, select, button, muted, withIcon, slider } from './ui.js'
import { frameAt, place } from '/src/render/viewmodel.js'
import { SCREEN, weaponView, expandSheetViews, sheetCanvas, sheetBottomCentre, screenAt, offsetFor, offsetOf, bottomCentre, viewPictures } from './viewmodel_emit.js'

/** The module's single pictures (sprites/NAME.png with no sheet manifest). */
const picturesOf = (S) => Object.keys(S.rec?.assets ?? {})
  .filter((p) => /^sprites\/[^/]+\.png$/.test(p) && !S.rec.assets[p.replace(/\.png$/, '.json')])
  .map((p) => p.slice(8, -4)).sort()

const images = new Map()
/** A picture's image (decoded once), and its size once loaded. */
function pictureImage (S, name, onLoad) {
  const url = S.spriteUrls?.get(name)
  if (!url) return null
  let img = images.get(url)
  if (!img) { img = new Image(); img.src = url; images.set(url, img) }
  if (!img.complete) img.addEventListener('load', onLoad, { once: true })
  return img
}
const sizeOf = (S, name) => { const img = pictureImage(S, name, () => {}); return img?.naturalWidth ? [img.naturalWidth, img.naturalHeight] : null }

const sheetImages = new Map()
/** A sheet's whole image, decoded once. */
function sheetImage (S, name) {
  const url = S.sheets.get(name)?.imageUrl
  if (!url) return null
  let img = sheetImages.get(url)
  if (!img) { img = new Image(); img.src = url; sheetImages.set(url, img) }
  return img
}

/** The preview: the ready frames looping, and the fire frames when "fire" is pressed. */
class ViewPreview {
  constructor (S) {
    this.S = S
    this.canvas = el('canvas', { class: 'st-view-canvas', width: SCREEN[0] * 2, height: SCREEN[1] * 2 })
    this.t0 = performance.now()
    this.fireAt = null
    this.raf = 0
  }

  show (view) {
    this.view = view
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick())
  }

  fire () { this.fireAt = performance.now() }

  tick () {
    this.raf = this.canvas.isConnected ? requestAnimationFrame(() => this.tick()) : 0
    const S = this.S
    const g = this.canvas.getContext('2d')
    const W = this.canvas.width; const H = this.canvas.height
    g.clearRect(0, 0, W, H)
    // The screen's own frame of reference: its bottom edge, the middle.
    g.strokeStyle = S.skin.canvas('designer', 'safe').color
    g.setLineDash([4, 4]); g.strokeRect(0.5, 0.5, W - 1, H - 1); g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); g.setLineDash([])
    let v = this.view
    if (!v) return
    // Drawn from a sheet: its frames, cut and placed as the module will write them.
    let cut = null
    if (v.sheet?.name) {
      const ex = expandSheetViews({ viewmodels: { weapons: { w: v } } }, (n) => S.sheets.get(n)?.atlas)
      v = ex.module.viewmodels.weapons.w
      cut = new Map(ex.pictures.map((p) => [p.name, p]))
    }
    const now = performance.now()
    let frame = null
    if (this.fireAt !== null) {
      frame = frameAt(v.fire, (now - this.fireAt) / 1000)
      if (frame === null) this.fireAt = null
    }
    if (!frame) frame = frameAt(v.ready?.length ? v.ready : v.fire?.slice(0, 1), (now - this.t0) / 1000, true)
    if (!frame) return
    for (const name of [frame[0], frame[2]].filter(Boolean)) {
      const p = cut?.get(name)
      if (p) {
        const sheetImg = sheetImage(S, p.sheet)
        if (!sheetImg?.naturalWidth) continue
        const r = place({ width: W, height: H }, p.size, p.offset, 1, 32, SCREEN)
        g.imageSmoothingEnabled = false
        g.drawImage(sheetImg, p.rect.x, p.rect.y, p.rect.w, p.rect.h, r.left, r.top, r.width, r.height)
        continue
      }
      const img = pictureImage(S, name, () => {})
      if (!img?.naturalWidth) continue
      const size = [img.naturalWidth, img.naturalHeight]
      // The client's own placement, on a screen the size of this canvas.
      const r = place({ width: W, height: H }, size, offsetOf(S.module, name, size), 1, 32, SCREEN)
      g.imageSmoothingEnabled = false
      g.drawImage(img, r.left, r.top, r.width, r.height)
    }
  }
}

let preview = null

/**
 * The rows for weapon `name`. `changed` saves the module and draws again.
 */
export function viewRows (S, name, changed) {
  const m = S.module
  preview ??= new ViewPreview(S)
  preview.S = S
  const view = weaponView(m, name) ?? { ready: [], fire: [] }
  const pics = picturesOf(S)
  const rows = []
  if (m.controls !== 'fps') rows.push(el('div', { class: 'st-warn-box', text: 'This is drawn only when the module is played first person: Settings → controls → first person (fps).' }))
  rows.push(muted(`How ${name} is drawn over the view in first person: pictures at rest and firing, as DOOM drew its guns. Each frame shows for some tics (35 a second); a frame may add a muzzle flash over it.`))
  preview.show(view)
  rows.push(preview.canvas, el('div', { class: 'st-row' }, [button(withIcon('transport.play', 'fire'), () => preview.fire())]))
  // DRAWN FROM: single pictures frame by frame, or a sprite sheet's animations
  // (a ThreeSprite project, baked) cut into pictures when the module is written.
  const sheets = Object.keys(m.sprites ?? {}).sort()
  rows.push(select('drawn from', view.sheet ? 'sheet' : 'pictures', [['pictures', 'pictures, frame by frame'], ['sheet', 'a sprite (ThreeSprite project): its animations']], (v) => {
    const w = weaponView(m, name, { make: true })
    if (v === 'sheet') w.sheet = { name: sheets[0] ?? null, ready: null, fire: null, scale: 1 }; else delete w.sheet
    changed()
  }))
  if (view.sheet) { rows.push(...sheetRows(S, name, view, sheets, changed)); return rows }
  rows.push(el('div', { class: 'st-row' }, [button(withIcon('action.import', 'import a picture (PNG)…'), async () => { const n = await S.importPicture?.(); if (n) changed() })]))
  if (!pics.length) {
    rows.push(muted('No pictures yet: import the weapon\'s pictures (PNG) first -- one for it at rest, one per frame of its shot, and a flash if it has one.'))
    return rows
  }
  const edit = () => weaponView(m, name, { make: true })
  const list = (key, title, doc) => {
    const frames = view[key] ?? []
    const out = [el('div', { class: 'st-section-head', text: title }), muted(doc)]
    frames.forEach((f, i) => {
      out.push(el('div', { class: 'st-row st-view-frame', 'data-view-frame': `${key}:${i}` }, [
        el('span', { class: 'st-val', text: String(i + 1) }),
        select('', f[0] ?? '', [['', '(picture)'], ...pics.map((p) => [p, p])], (v) => { edit()[key][i][0] = v || null; changed() }).lastChild,
        el('input', { type: 'number', min: 1, max: 350, step: 1, value: f[1] ?? 4, title: 'tics (35 a second)', class: 'st-view-tics', onchange: (e) => { edit()[key][i][1] = Math.max(1, Math.round(Number(e.target.value) || 1)); changed() } }),
        select('', f[2] ?? '', [['', '(no flash)'], ...pics.map((p) => [p, `flash: ${p}`])], (v) => { const fr = edit()[key][i]; if (v) fr[2] = v; else fr.length = 2; changed() }).lastChild,
        i > 0 ? button(withIcon('action.up'), () => { const a = edit()[key]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; changed() }) : null,
        button(withIcon('action.close'), () => { edit()[key].splice(i, 1); changed() })
      ].filter(Boolean)))
    })
    out.push(button(`+ frame`, () => { const a = edit()[key]; a.push([a[a.length - 1]?.[0] ?? pics[0], key === 'ready' ? 1 : 4]); changed() }))
    return out
  }
  rows.push(...list('ready', 'at rest', 'Shown while it is held, looping: one frame for a still pose, more for an idle judder.'))
  rows.push(...list('fire', 'firing', 'Played once on every shot, from the moment it is fired.'))
  // WHERE EACH PICTURE SITS: its top-left corner on the 320 x 200 screen, at rest.
  const used = viewPictures(m).filter((p) => pics.includes(p))
  if (used.length) {
    rows.push(el('div', { class: 'st-section-head', text: 'where each picture sits' }),
      muted('The picture\'s top-left corner on a 320 x 200 screen, with the weapon at rest; it bobs and lowers from there as the player walks and switches. Bottom centre is where a gun usually sits.'))
    for (const p of used) {
      const size = sizeOf(S, p)
      const at = screenAt(offsetOf(m, p, size))
      const setAt = (x, y) => { m.pictureOffsets ??= {}; m.pictureOffsets[p] = offsetFor(x, y); changed() }
      rows.push(el('div', { class: 'st-row', 'data-view-picture': p }, [
        el('span', { class: 'st-entry', text: `${p}${size ? ` (${size[0]}×${size[1]})` : ''}` }),
        el('input', { type: 'number', step: 1, value: at.x, title: 'x', class: 'st-view-tics', onchange: (e) => setAt(Number(e.target.value) || 0, at.y) }),
        el('input', { type: 'number', step: 1, value: at.y, title: 'y', class: 'st-view-tics', onchange: (e) => setAt(at.x, Number(e.target.value) || 0) }),
        button('bottom centre', () => { const c = bottomCentre(size ?? [64, 64]); setAt(c.x, c.y) })
      ]))
    }
  }
  return rows
}

/** A weapon drawn from a sheet: which sheet, which animation at rest and firing, and where its canvas sits. */
function sheetRows (S, name, view, sheets, changed) {
  const sh = view.sheet
  const atlas = sh.name ? S.sheets.get(sh.name)?.atlas : null
  const anims = (atlas?.animations ?? []).map((a) => a.name)
  const set = (k) => (v) => { sh[k] = v; changed() }
  const canvasPx = sheetCanvas(atlas)
  const at = { x: sh.x ?? sheetBottomCentre(canvasPx, sh.scale ?? 1).x, y: sh.y ?? sheetBottomCentre(canvasPx, sh.scale ?? 1).y }
  const rows = [
    muted('Draw the gun in ThreeSprite -- an animation for it held, another for a shot -- and pick them here. Each frame (its front view) becomes a picture when the module is written, shown for as long as the animation\'s fps says.'),
    select('sprite', sh.name ?? '', [['', '(choose)'], ...sheets.map((n) => [n, n])], (v) => { sh.name = v || null; sh.ready = sh.fire = null; changed() }),
    el('div', { class: 'st-row' }, [
      button(withIcon('action.import', 'import a sprite (.tsprite)…'), async () => { const n = await S.importSheet?.(); if (n) { sh.name = n; sh.ready = sh.fire = null; changed() } }),
      S.editButtons && sh.name && S.rec?.assets?.[`sources/sprites/${sh.name}.tsprite`] ? S.editButtons('file:tsprite', sh.name) : null
    ].flat().filter(Boolean))
  ]
  if (!sh.name) return rows
  if (!atlas) { rows.push(el('div', { class: 'st-warn-box', text: `${sh.name} is not baked yet: open it in ThreeSprite and come back.` })); return rows }
  rows.push(
    select('at rest', sh.ready ?? '', [['', '(choose an animation)'], ...anims.map((a) => [a, a])], (v) => set('ready')(v || null)),
    select('firing', sh.fire ?? '', [['', '(choose an animation)'], ...anims.map((a) => [a, a])], (v) => set('fire')(v || null)),
    slider('scale', sh.scale ?? 1, { min: 0.25, max: 8, step: 0.25 }, (v, done) => { if (done) set('scale')(v) }),
    el('div', { class: 'st-row' }, [
      el('span', { class: 'st-entry', text: `canvas ${canvasPx}×${canvasPx} at` }),
      el('input', { type: 'number', step: 1, value: at.x, title: 'x', class: 'st-view-tics', onchange: (e) => set('x')(Number(e.target.value) || 0) }),
      el('input', { type: 'number', step: 1, value: at.y, title: 'y', class: 'st-view-tics', onchange: (e) => set('y')(Number(e.target.value) || 0) }),
      button('bottom centre', () => { delete sh.x; delete sh.y; changed() })
    ]),
    muted('The sprite\'s canvas on the 320 x 200 screen, its top-left corner at x, y with the weapon at rest; scale is screen pixels to a canvas pixel.')
  )
  return rows
}
