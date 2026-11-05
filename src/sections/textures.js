//
// The module's textures: its own pictures, and the app's beside them.
//
// A texture is a NAME (up to 24 characters, the map format's limit) and a PNG.
// The module's own live in the record's assets with their size in
// module.textures; the app serves more (/textures/index.json). Rooms name them
// in their floor and ceiling and walls in their three bands, so renaming one
// follows every reference in every map, and deleting one in use asks first.
//
// COMPOSITES (composites.js) are here too: one texture name made of up to
// eight of these pictures, laid out tile by tile so a big surface stops showing
// its repeat. A map names one as it names a texture; renaming or deleting a
// texture follows it into them.
//
import { useStroke } from '../../vendor/uikit/runtime.js'
import { shell } from '../bridge.js'
import { el, button, muted, row, text, toggle, confirmDialog, ask, select, number, slider, pictureBackground, withIcon, icon } from '../ui.js'
import { guessSheet, frameRect, frameSize, sheetProblems, MAX_FRAMES, DEFAULT_FPS } from '../texsheet.js'
import { newComposite, compositeLine, renameInComposites, dropFromComposites, compositesUsing, shuffleSeed, greyName,
  COMPOSITE_MAX, DEFAULT_PATCH, DEFAULT_OVERLAY_SCALE, DEFAULT_OVERLAY_STRENGTH } from '../composites.js'
import { texturePicker } from '../inspector.js'
import { duplicateTexture } from '../assetcopy.js'
import { exportButtons, askCopyName } from './assetbuttons.js'

let S = null

// --- the sheet dialog: a picture, and how it is cut into an animation ----------------------
//
// The whole picture with its cut lines and the frame playing marked, the frame
// itself tiled 2×2 as a wall shows it, and the cut by hand: still, frames
// stacked (vertical) or side by side (horizontal), how many frames -- or how
// many pixels each -- and how many a second. Opened on import (with what the
// picture's shape suggests) and from a texture's card.

/**
 * @returns { name, sheet } -- sheet null for a still picture -- or null when cancelled
 */
function sheetDialog ({ name, url, w, h, sheet, okLabel = 'save', nameEditable = false }) {
  return new Promise((resolve) => {
    let spec = sheet ? { ...sheet, fps: sheet.fps ?? DEFAULT_FPS } : null
    let playing = true
    let shownName = name
    const img = new Image()
    img.src = url
    const sheetCv = el('canvas', { class: 'sd-sheet-cv', 'data-sheet-canvas': '1' })
    const tileCv = el('canvas', { class: 'sd-sheet-tile', width: 192, height: 192 })
    const info = el('div', { class: 'st-muted', 'data-sheet-info': '1' })
    const warn = el('div', { class: 'st-danger', style: 'font-size:12px' })
    const along = () => (spec?.layout === 'horizontal' ? w : h)
    const framesIn = number('frames', spec?.frames ?? 2, { min: 2, max: MAX_FRAMES, step: 1 }, (v) => { if (!spec) return; spec.frames = Math.max(2, Math.min(MAX_FRAMES, Math.round(v))); sync() })
    const sizeIn = number('each frame, px', spec ? Math.floor(along() / spec.frames) : 0, { min: 1, max: 4096, step: 1 }, (v) => { if (!spec) return; spec.frames = Math.max(2, Math.min(MAX_FRAMES, Math.floor(along() / Math.max(1, Math.round(v))))); sync() })
    const fpsIn = number('frames a second', spec?.fps ?? DEFAULT_FPS, { min: 0.25, max: 60, step: 0.25 }, (v) => { if (!spec) return; spec.fps = Math.max(0.25, v); sync() })
    const cut = select('cut', spec?.layout ?? 'still', [['still', 'a still picture'], ['vertical', 'frames stacked ↓ (vertical)'], ['horizontal', 'frames side by side → (horizontal)']], (v) => {
      if (v === 'still') spec = null
      else {
        const g = guessSheet(w, h)
        const frames = spec?.frames ?? (g?.layout === v ? g.frames : Math.max(2, Math.round((v === 'horizontal' ? w / h : h / w)) || 2))
        spec = { layout: v, frames: Math.max(2, Math.min(MAX_FRAMES, frames)), fps: spec?.fps ?? DEFAULT_FPS }
      }
      sync()
    })
    cut.querySelector('select').dataset.sheetCut = '1'
    framesIn.querySelector('input').dataset.sheetFrames = '1'
    fpsIn.querySelector('input').dataset.sheetFps = '1'
    const nameIn = nameEditable ? text('name', name, (v) => { shownName = String(v).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24) || name; nameRow.querySelector('input').value = shownName }) : null
    const nameRow = nameIn
    const play = button(withIcon('transport.pause'), () => { playing = !playing; play.replaceChildren(icon(playing ? 'transport.pause' : 'transport.play')) })
    const sync = () => {
      for (const r of [framesIn, sizeIn, fpsIn]) r.hidden = !spec
      play.hidden = !spec
      if (spec) {
        framesIn.querySelector('input').value = spec.frames
        sizeIn.querySelector('input').value = Math.floor(along() / spec.frames)
        fpsIn.querySelector('input').value = spec.fps
        const f = frameSize(spec, w, h)
        info.textContent = `${w}×${h}: ${spec.frames} frames of ${f.w}×${f.h}, ${spec.fps} a second -- ${(spec.frames / spec.fps).toFixed(2)} s round`
      } else info.textContent = `${w}×${h}, a still picture`
      warn.textContent = sheetProblems(shownName, spec, w, h).join('\n')
    }
    // Drawn while open: the sheet with its cuts and the frame playing, and that frame tiled.
    const t0 = performance.now()
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (!img.complete || !img.naturalWidth) return
      // As large as fits beside the controls, and never taller than half the screen.
      const box = Math.max(96, Math.min(240, Math.round(innerHeight * 0.5)))
      const k = Math.min(box / w, box / h, 8)
      const cw = Math.max(1, Math.round(w * k)); const ch = Math.max(1, Math.round(h * k))
      if (sheetCv.width !== cw || sheetCv.height !== ch) { sheetCv.width = cw; sheetCv.height = ch }
      const g = sheetCv.getContext('2d')
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, cw, ch)
      g.drawImage(img, 0, 0, cw, ch)
      const frame = spec ? (playing ? Math.floor(((performance.now() - t0) / 1000) * spec.fps) % spec.frames : 0) : 0
      const r = spec ? frameRect(spec, w, h, frame) : { x: 0, y: 0, w, h }
      if (spec) {
        useStroke(g, S.skin.canvas('preview', 'cutter.divider'))
        for (let i = 1; i < spec.frames; i++) {
          const c = frameRect(spec, w, h, i)
          g.beginPath()
          if (spec.layout === 'horizontal') { g.moveTo(c.x * k + 0.5, 0); g.lineTo(c.x * k + 0.5, ch) } else { g.moveTo(0, c.y * k + 0.5); g.lineTo(cw, c.y * k + 0.5) }
          g.stroke()
        }
        useStroke(g, S.skin.canvas('preview', 'cutter.current'))
        g.strokeRect(r.x * k + 1, r.y * k + 1, r.w * k - 2, r.h * k - 2)
        // What is left over, shaded: the client does not show it.
        const spare = frameSize(spec, w, h).spare
        if (spare) { g.fillStyle = S.skin.canvas('preview', 'cutter.leftover').fill; if (spec.layout === 'horizontal') g.fillRect((w - spare) * k, 0, spare * k, ch); else g.fillRect(0, (h - spare) * k, cw, spare * k) }
      }
      const t = tileCv.getContext('2d')
      t.imageSmoothingEnabled = false
      t.clearRect(0, 0, 192, 192)
      const s = Math.min(96 / r.w, 96 / r.h)
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) t.drawImage(img, r.x, r.y, r.w, r.h, ox * r.w * s, oy * r.h * s, r.w * s, r.h * s)
    }
    // novalidate: a hidden field's limits (a still picture's frame size) must not block the button.
    const dlg = el('dialog', { class: 'st-dialog sd-sheet-dialog', 'data-sheet-dialog': name }, [el('form', { method: 'dialog', novalidate: '' }, [
      el('div', { class: 'st-section-head' }, withIcon('section.sprites', `${name}`)),
      // Pictures beside the controls where there is room (a phone on its side), above them where not.
      el('div', { class: 'sd-sheet-body' }, [
        el('div', { class: 'sd-sheet-pics' }, [
          el('div', { class: 'sd-sheet-col' }, [sheetCv, muted('the picture, cut')]),
          el('div', { class: 'sd-sheet-col' }, [tileCv, muted('a frame, tiled as on a wall')])]),
        el('div', { class: 'sd-sheet-ctl' }, [nameRow, cut, framesIn, sizeIn, fpsIn, el('div', { class: 'st-row' }, [play, info]), warn,
          muted('qPainter saves an animation as frames stacked top to bottom. The frames are equal: the picture divided by their number.')].filter(Boolean))]),
      el('div', { class: 'st-row st-actions' }, [
        el('button', { type: 'button', text: 'cancel', onclick: () => dlg.close('') }),
        el('button', { type: 'submit', value: 'ok', text: okLabel, 'data-sheet-ok': '1' })])
    ].filter(Boolean))])
    dlg.addEventListener('close', () => {
      cancelAnimationFrame(raf)
      const ok = dlg.returnValue === 'ok'
      dlg.remove()
      resolve(ok ? { name: shownName, sheet: spec ? { layout: spec.layout, frames: spec.frames, fps: spec.fps } : null } : null)
    })
    document.body.appendChild(dlg)
    sync()
    dlg.showModal()
    draw()
  })
}

async function importTexture () {
  const f = await shell.importFile('image/png')
  if (!f) return
  let name = f.name.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
  if (!name) name = 'TEXTURE'
  const blob = new Blob([f.bytes], { type: 'image/png' })
  let bmp
  try { bmp = await createImageBitmap(blob) } catch { S.status('that is not a PNG the browser can read', 'error'); return }
  // How it is cut, by hand: a still picture, or a sprite sheet (what its shape suggests first).
  const url = URL.createObjectURL(blob)
  const chosen = await sheetDialog({ name, url, w: bmp.width, h: bmp.height, sheet: guessSheet(bmp.width, bmp.height), okLabel: 'import', nameEditable: true })
  URL.revokeObjectURL(url)
  if (!chosen) { bmp.close?.(); return }
  name = chosen.name
  if (!valid(name)) { S.status(`${name} is not a usable texture name (A-Z, 0-9, _; up to 24)`, 'error'); bmp.close?.(); return }
  S.module.textures ??= {}
  S.module.textures[name] = { w: bmp.width, h: bmp.height, ...(chosen.sheet ? { sheet: chosen.sheet } : {}) }
  S.rec.assets ??= {}
  S.rec.assets[`textures/${name}.png`] = blob
  if (S.imageUrls.has(name)) URL.revokeObjectURL(S.imageUrls.get(name))
  S.imageUrls.set(name, URL.createObjectURL(blob))
  S.textures.forget(name)
  bmp.close?.()
  S.moduleChanged()
  if (S.route() === 'textures') showTextures(name)
  S.status(`texture ${name} added (${bmp.width}x${bmp.height}${chosen.sheet ? `, ${chosen.sheet.frames} frames at ${chosen.sheet.fps} a second` : ''})`, 'ok')
}

/** Every place a texture is named, across the module's maps: [{ map, set(name) }]. */
function uses (name) {
  const out = []
  for (const d of Object.values(S.docs)) {
    for (const sid of d.order) {
      const sec = d.sectors[sid]
      for (const k of ['floorTex', 'ceilTex']) if (sec[k] === name) out.push({ map: d.name, set: (v) => { sec[k] = v } })
      for (const v of sec.verts) for (const k of ['upper', 'middle', 'lower']) if (v.edge[k] === name) out.push({ map: d.name, set: (n) => { v.edge[k] = n } })
    }
  }
  return out
}

const valid = (n) => /^[A-Z0-9_]{1,24}$/.test(n)
const clean = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
/** A name a texture or a composite already has: the module's own, or the app's. */
const taken = (n) => !!S.module.textures?.[n] || !!S.module.composites?.[n] || S.textureNames.includes(n)

// --- composites ---------------------------------------------------------------------------

/**
 * The still pictures a composite can be made of -- the module's and the app's,
 * no sheet, no composite -- in the panel beside the page, which closes on a
 * pick or on back, leaving the composite's card where it was.
 */
function pickStill (title, back, onPick) {
  const names = [...new Set([...Object.keys(S.module.textures ?? {}), ...S.textureNames])].filter((n) => !S.sheetOf(n) && !S.isComposite(n))
  const leave = () => { S.ui.hideSheet(); showTextures(back) }
  S.ui.showSheet(title, [
    el('div', { class: 'st-row' }, [button(withIcon('action.back', 'back'), leave)]),
    muted('A still picture: an animated one (a sheet) cannot be one of a composite\'s textures.'),
    ...texturePicker(names, null, (n) => { if (!n) { leave(); return } S.ui.hideSheet(); onPick(n) }, { imageFor: (n) => S.imageFor(n) })
  ], () => {})
}

async function addComposite () {
  let suggest = 'COMPOSITE1'
  for (let k = 2; taken(suggest); k++) suggest = `COMPOSITE${k}`
  const n = clean(await ask('the composite\'s name (A-Z, 0-9, _; up to 24)', suggest))
  if (!n) return
  if (!valid(n) || taken(n)) { S.status(`${n} is taken or not a usable name`, 'warn'); return }
  S.module.composites ??= {}
  const c = S.module.composites[n] = newComposite()
  S.moduleChanged()
  // Straight on to its first texture, which sets the tile size.
  pickStill(`${n}: its first texture`, n, (t) => { c.members.push({ name: t, weight: 1 }); S.moduleChanged(); showTextures(n) })
}

/**
 * "Make a grey copy" for a composite's overlay, when its picture has colour:
 * the copy is a texture of the module's own (so it ships in the pack), and the
 * overlay from then on. Hidden until the picture is read, and for a grey one.
 */
function greyOffer (name, c, changed) {
  const from = c.overlay.name
  const box = el('div', { class: 'cp-grey', 'data-composite-grey': from, hidden: '' }, [
    muted(`${from} has colour in it, so it tints the whole surface. A grey copy only shades it: lighter brightens, darker darkens, its average moved to mid-grey so it does both evenly.`),
    el('div', { class: 'st-row' }, [button('make a grey copy', async () => {
      const g = await S.greyCopy(from)
      if (!g) { S.status(`${from}'s picture could not be read`, 'error'); return }
      const to = greyName(from, taken)
      S.module.textures ??= {}
      S.module.textures[to] = { w: g.w, h: g.h }
      S.rec.assets ??= {}
      S.rec.assets[`textures/${to}.png`] = g.blob
      S.imageUrls.set(to, URL.createObjectURL(g.blob))
      c.overlay.name = to
      S.status(`${to}: a grey copy of ${from}, now ${name}'s overlay`, 'ok')
      changed()
    })])
  ])
  S.isGreyPicture(from).then((grey) => { box.hidden = grey !== false })
  return box
}

/** The card of one composite: its textures and weights, how they are laid out, and the surface drawn live. */
function compositeCard (name) {
  const c = S.module.composites[name]
  const u = uses(name)
  const maps = [...new Set(u.map((x) => x.map))]
  const changed = () => { S.moduleChanged(); S.redraw(); showTextures(name) }
  // THE SURFACE, as the game lays it out (the client's JS twin of its shader).
  const cv = el('canvas', { class: 'cp-preview', 'data-composite-preview': name })
  const info = el('div', { class: 'st-muted', 'data-composite-info': name })
  let painting = 0
  const repaint = async () => {
    const n = ++painting
    const def = S.compositeDefOf(name)
    const tmp = document.createElement('canvas')
    const out = def && await S.drawComposite(tmp, def, { maxPx: 640, maxTiles: 8, minTiles: 3, level: 0 })
    if (n !== painting) return
    cv.hidden = !out
    if (!out) { info.textContent = def ? 'None of its textures has a picture yet.' : 'Add a texture to see it.'; return }
    cv.width = tmp.width; cv.height = tmp.height
    cv.getContext('2d').drawImage(tmp, 0, 0)
    const cell = S.module.textures?.[def.members[0].name] ?? (S.textureSizes[def.members[0].name] && { w: S.textureSizes[def.members[0].name][0], h: S.textureSizes[def.members[0].name][1] })
    info.textContent = cell ? `${out.w / cell.w}×${out.h / cell.h} tiles of ${cell.w}×${cell.h}, as a floor of it shows them` : ''
  }
  // A slider being dragged redraws the surface; letting go saves.
  const live = (set) => (v, done) => { set(v); if (done) changed(); else repaint() }
  const total = c.members.reduce((a, m) => a + (m.weight > 0 ? m.weight : 0), 0) || 1
  const members = c.members.map((m, k) => {
    const w = el('input', { type: 'number', class: 'cp-weight', min: 0.1, max: 100, step: 1, value: m.weight, 'data-composite-weight': m.name, title: 'weight: how often it shows, against the others' })
    w.addEventListener('change', () => { const v = Number(w.value); if (v > 0) { m.weight = v; changed() } else w.value = m.weight })
    return el('div', { class: 'st-row cp-member', 'data-composite-member': m.name }, [
      pictureBackground(el('div', { class: 'sd-sheet-thumb cp-thumb' }), S.imageFor(m.name)),
      el('div', { class: 'cp-member-name' }, [el('span', { text: m.name }),
        el('span', { class: 'st-muted', text: `${Math.round((100 * m.weight) / total)}% of tiles${k === 0 ? ' · sets the tile size' : ''}` })]),
      el('label', { class: 'cp-weight-label' }, [el('span', { class: 'st-muted', text: 'weight' }), w]),
      // the first stays first unless another is moved up: it sets the tile size
      k > 0 ? button(withIcon('action.up'), () => { c.members.splice(k - 1, 0, c.members.splice(k, 1)[0]); changed() }, 'cp-icon') : el('span'),
      button(withIcon('action.delete'), () => { c.members.splice(k, 1); changed() }, 'cp-icon')
    ])
  })
  const flip = c.flipX && c.flipY ? 'both' : c.flipX ? 'x' : c.flipY ? 'y' : 'none'
  const hide = c.patches ? 'patches' : c.shift ? 'shift' : 'none'
  const advice = []
  if (c.flipY) advice.push('On walls, mirror left-right only: up-down puts a brick\'s lit top edge underneath.')
  if (c.turn) advice.push('Turning suits only a square picture with no up, whose four edges all match; otherwise stones are cut along the tile lines and bricks stand on end.')
  if (hide === 'none' && c.members.length > 1) advice.push('The textures should tile with each other: change only pixels away from the edges (cracks, moss, a missing brick), so any two sit side by side without a seam.')
  if (hide === 'shift') advice.push('Shift hides the grid even with a single texture; the price is a ragged band where tiles meet.')
  if (hide === 'patches') advice.push('Patches suit ground -- grass, dirt, rock -- where no grid should show. On bricks they break the courses.')
  if ((c.shift || c.patches) && c.seam === 'blend') advice.push('Blended bands mix two pictures, which looks smeared beside the engine\'s sharp pixels.')
  if (c.overlay) advice.push('An overlay is the cheapest way to break up a big surface: a 128 px grime or moss picture at scale 6 to 8. Grey changes nothing, lighter brightens, darker darkens.')
  const card = el('div', { class: 'st-card cp-card', 'data-open-composite': name }, [
    el('div', { class: 'st-entry', text: name }),
    muted(`a composite of ${c.members.length} texture${c.members.length === 1 ? '' : 's'} · used ${u.length} time${u.length === 1 ? '' : 's'}${maps.length ? ` on ${maps.join(', ')}` : ''}`),
    el('div', { class: 'cp-body' }, [
      el('div', { class: 'cp-pic' }, [cv, info,
        el('div', { class: 'st-row' }, [
          button('shuffle', () => { c.seed = shuffleSeed(); changed() }),
          c.seed != null ? button('its name\'s own layout', () => { delete c.seed; changed() }) : null].filter(Boolean))]),
      el('div', { class: 'cp-ctl' }, [
        el('div', { class: 'st-section-head', text: `its textures (${c.members.length} of at most ${COMPOSITE_MAX})` }),
        ...members,
        c.members.length < COMPOSITE_MAX ? el('div', { class: 'st-row' }, [button(withIcon('action.add', 'texture'), () => pickStill(`${name}: another texture`, name, (t) => { c.members.push({ name: t, weight: 1 }); changed() }))]) : null,
        el('div', { class: 'st-section-head', text: 'each tile' }),
        select('mirrored', flip, [['none', 'no'], ['both', 'at random, both ways'], ['x', 'at random, left-right only (walls)'], ['y', 'at random, up-down only']],
          (v) => { c.flipX = v === 'both' || v === 'x'; c.flipY = v === 'both' || v === 'y'; changed() }),
        toggle('turned a quarter at random (square pictures)', !!c.turn, (v) => { c.turn = v; changed() }),
        select('hide the grid', hide, [['none', 'no: a texture per tile'], ['shift', 'shift: each tile at its own offset'], ['patches', 'patches: no grid, irregular patches']],
          (v) => { c.shift = v === 'shift'; c.patches = v === 'patches' ? (c.patches || DEFAULT_PATCH) : 0; changed() }),
        c.patches ? slider('patch size (tiles)', c.patches, { min: 1, max: 8, step: 0.5 }, live((v) => { c.patches = v })) : null,
        c.shift || c.patches ? select('where they meet', c.seam === 'blend' ? 'blend' : 'dither', [['dither', 'dithered: sharp pixels'], ['blend', 'blended: faded into each other']],
          (v) => { c.seam = v; changed() }) : null,
        el('div', { class: 'st-section-head', text: 'over the whole surface' }),
        toggle('an overlay picture', !!c.overlay, (v) => {
          if (!v) { c.overlay = null; changed(); return }
          pickStill(`${name}: its overlay`, name, (t) => { c.overlay = { name: t, scale: DEFAULT_OVERLAY_SCALE, strength: DEFAULT_OVERLAY_STRENGTH }; changed() })
        }),
        c.overlay ? el('div', { class: 'st-row cp-overlay', 'data-composite-overlay': c.overlay.name }, [
          pictureBackground(el('div', { class: 'sd-sheet-thumb cp-thumb' }), S.imageFor(c.overlay.name)),
          el('span', { class: 'cp-member-name', text: c.overlay.name }),
          button('change…', () => pickStill(`${name}: its overlay`, name, (t) => { c.overlay.name = t; changed() }))]) : null,
        // A picture with colour in it tints the whole surface: offered a grey copy (shown once its pixels are read).
        c.overlay ? greyOffer(name, c, changed) : null,
        c.overlay ? slider('its size (times its own)', c.overlay.scale ?? DEFAULT_OVERLAY_SCALE, { min: 1, max: 16, step: 0.5 }, live((v) => { c.overlay.scale = v })) : null,
        c.overlay ? slider('how strong', c.overlay.strength ?? DEFAULT_OVERLAY_STRENGTH, { min: 0, max: 1, step: 0.05 }, live((v) => { c.overlay.strength = v })) : null,
        ...advice.map((a) => el('div', { class: 'st-muted cp-advice', text: a }))
      ].filter(Boolean))
    ]),
    ...S.compositeProblems(name, c).map((p) => el('div', { class: 'st-danger', text: p })),
    el('div', { class: 'st-muted cp-line', 'data-composite-line': name, text: `written: ${compositeLine(name, c) ?? 'nothing yet -- it needs a texture'}` }),
    el('div', { class: 'st-row' }, [
      button(withIcon('action.duplicate', 'duplicate'), async () => {
        const to = await askCopyName(S, name, (n) => !valid(n) || taken(n))
        if (!to) return
        S.module.composites[to] = JSON.parse(JSON.stringify(c))
        S.moduleChanged()
        S.status(`${to}: a copy of ${name}`, 'ok')
        showTextures(to)
      }),
      button('rename', async () => {
        const n = clean(await ask('new name (A-Z, 0-9, _; up to 24)', name))
        if (!n || n === name) return
        if (!valid(n) || taken(n)) { S.status(`${n} is taken or not a usable name`, 'warn'); return }
        S.module.composites[n] = c; delete S.module.composites[name]
        for (const x of u) x.set(n)
        S.moduleChanged(); S.redraw()
        S.status(`${name} is ${n} now, on ${u.length} surface${u.length === 1 ? '' : 's'}`, 'ok')
        showTextures(n)
      }),
      button('delete', async () => {
        if (u.length && !await confirmDialog(`${name} is on ${u.length} surface${u.length === 1 ? '' : 's'} (${maps.join(', ')}). Delete it and leave those bare?`)) return
        for (const x of u) x.set(null)
        delete S.module.composites[name]
        S.moduleChanged(); S.redraw()
        showTextures()
      }, 'st-danger')
    ])
  ])
  repaint()
  return card
}

function showTextures (open = null) {
  const own = Object.keys(S.module.textures ?? {}).sort()
  const comps = Object.keys(S.module.composites ?? {}).sort()
  const served = S.textureNames.filter((n) => !own.includes(n))
  const tile = (n, mine) => {
    const t = el('button', { class: 'st-tile', 'data-texture': n, 'data-on': n === open ? '1' : '0', title: n, onclick: () => showTextures(mine ? n : null) },
      [el('span', { text: n })])
    pictureBackground(t, S.imageFor(n), S.sheetOf?.(n))
    if (S.isComposite(n)) t.dataset.compositeTile = n
    return t
  }
  const body = [
    el('div', { class: 'st-row' }, [
      // A texture painted from nothing, in the texture editor when the studio has one (docs/PLUGINS.md).
      ...(S.plugins?.hasPluginEditor('file:texture') ? [button('+ new texture', async () => {
        const raw = await ask('the new texture\'s name (A-Z, 0-9, _; up to 24)', 'NEWTEX')
        const n = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
        if (!n) return
        if (taken(n)) { S.status(`${n} is taken`, 'warn'); return }
        S.editInPlugin('file:texture', n)
      })] : []),
      button('+ import texture (PNG)', () => importTexture()),
      button('+ composite', () => addComposite())
    ]),
    el('div', { class: 'st-section-head' }, withIcon('section.textures', `the module's own (${own.length})`)),
    own.length ? el('div', { class: 'st-grid' }, own.map((n) => tile(n, true))) : muted('None yet. A PNG imported here is the module\'s, and ships in its pack.'),
    el('div', { class: 'st-section-head' }, withIcon('section.textures', `composites (${comps.length})`)),
    comps.length ? el('div', { class: 'st-grid', 'data-composites': '1' }, comps.map((n) => tile(n, true)))
      : muted('None yet. A composite is one texture name made of up to eight pictures, laid out tile by tile so a big floor or wall stops showing its repeat.')
  ]
  if (open && S.module.composites?.[open]) body.push(compositeCard(open))
  if (open && S.module.textures?.[open]) {
    const meta = S.module.textures[open]
    const u = uses(open)
    const maps = [...new Set(u.map((x) => x.map))]
    body.push(el('div', { class: 'st-card', 'data-open-texture': open }, [
      el('div', { class: 'st-entry', text: open }),
      muted(`${meta.w}×${meta.h} · used ${u.length} time${u.length === 1 ? '' : 's'}${maps.length ? ` on ${maps.join(', ')}` : ''}`),
      toggle('cut out (see-through where transparent)', !!meta.cutout, (v) => { if (v) meta.cutout = true; else delete meta.cutout; S.textures.forget(open); S.moduleChanged(); showTextures(open) }),
      // ANIMATED: a sprite sheet, cut and timed by hand.
      el('div', { class: 'st-row', 'data-texture-sheet': open }, [
        pictureBackground(el('div', { class: 'sd-sheet-thumb' }), S.imageUrls.get(open), meta.sheet),
        el('span', { style: 'flex:1 1 auto', text: meta.sheet ? `animated: ${meta.sheet.frames} frames ${meta.sheet.layout === 'horizontal' ? 'side by side' : 'stacked'}, ${meta.sheet.fps ?? DEFAULT_FPS} a second` : 'a still picture' }),
        button(meta.sheet ? 'cut & speed…' : 'animate…', async () => {
          const chosen = await sheetDialog({ name: open, url: S.imageUrls.get(open), w: meta.w, h: meta.h, sheet: meta.sheet ?? guessSheet(meta.w, meta.h) })
          if (!chosen) return
          if (chosen.sheet) meta.sheet = chosen.sheet; else delete meta.sheet
          S.textures.forget(open)
          S.moduleChanged(); S.redraw()
          showTextures(open)
        })
      ]),
      ...sheetProblems(open, meta.sheet, meta.w, meta.h).map((p) => el('div', { class: 'st-danger', text: p })),
      el('div', { class: 'st-row' }, [
        ...(S.editButtons?.('file:texture', open) ?? []),
        // A copy: the picture and its qPainter project under a new name, a variant to change.
        button(withIcon('action.duplicate', 'duplicate'), async () => {
          const to = await askCopyName(S, open, (n) => !valid(n) || taken(n))
          if (!to || !duplicateTexture(S.rec, open, to)) return
          S.imageUrls.set(to, URL.createObjectURL(S.rec.assets[`textures/${to}.png`]))
          S.moduleChanged()
          S.status(`${to}: a copy of ${open}`, 'ok')
          showTextures(to)
        }),
        ...exportButtons(S, 'texture', open),
        button('rename', async () => {
          const raw = await ask('new name (A-Z, 0-9, _; up to 24)', open)
          const n = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
          if (!n || n === open) return
          if (!valid(n) || taken(n)) { S.status(`${n} is taken or not a usable name`, 'warn'); return }
          S.module.textures[n] = meta; delete S.module.textures[open]
          S.rec.assets[`textures/${n}.png`] = S.rec.assets[`textures/${open}.png`]; delete S.rec.assets[`textures/${open}.png`]
          S.imageUrls.set(n, S.imageUrls.get(open)); S.imageUrls.delete(open)
          for (const x of u) x.set(n)
          // and in the composites made with it
          const inComps = renameInComposites(S.module.composites, open, n)
          S.textures.forget(open)
          S.moduleChanged(); S.redraw()
          S.status(`${open} is ${n} now, on ${u.length} surface${u.length === 1 ? '' : 's'}${inComps ? ` and in ${inComps} composite${inComps === 1 ? '' : 's'}` : ''}`, 'ok')
          showTextures(n)
        }),
        button('delete', async () => {
          const inComps = compositesUsing(S.module.composites, open)
          const where = [u.length ? `on ${u.length} surface${u.length === 1 ? '' : 's'} (${maps.join(', ')})` : null, inComps.length ? `in the composite${inComps.length === 1 ? '' : 's'} ${inComps.join(', ')}` : null].filter(Boolean)
          if (where.length && !await confirmDialog(`${open} is ${where.join(' and ')}. Delete it and leave ${u.length ? 'those bare' : 'them without it'}?`)) return
          for (const x of u) x.set(null)
          dropFromComposites(S.module.composites, open)
          delete S.module.textures[open]; delete S.rec.assets[`textures/${open}.png`]
          URL.revokeObjectURL(S.imageUrls.get(open)); S.imageUrls.delete(open)
          S.textures.forget(open)
          S.moduleChanged(); S.redraw()
          showTextures()
        }, 'st-danger')
      ])
    ]))
  }
  // The app's can be hundreds: filtered by name as it is typed, and said when cut.
  const grid = el('div', { class: 'st-grid' })
  const find = el('input', { type: 'text', placeholder: 'filter by name', value: S.textureFilter ?? '' })
  const fill = () => {
    S.textureFilter = find.value
    const q = find.value.trim().toUpperCase()
    const hits = served.filter((n) => !q || n.includes(q))
    grid.replaceChildren(...hits.slice(0, 400).map((n) => tile(n, false)), ...(hits.length > 400 ? [muted(`and ${hits.length - 400} more: filter to find them`)] : []))
  }
  find.addEventListener('input', fill)
  fill()
  body.push(el('div', { class: 'st-section-head', text: `the app's (${served.length})` }),
    served.length ? row('find', find) : null, served.length ? grid : muted('The app serves none.'),
    muted('The app\'s textures come with the engine build the module plays in; a map may name any of them. Only the module\'s own travel in its pack.'))
  S.ui.showSheet('Textures', body.filter(Boolean))
  // A composite's tile is its flat drawing, which may still be being made after a change.
  S.compositesDrawn?.then(() => {
    for (const t of document.querySelectorAll('[data-composite-tile]')) { const url = S.compositeThumb(t.dataset.compositeTile); if (url) t.style.backgroundImage = `url("${url}")` }
  })
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.importTexture = importTexture
  S.addComposite = addComposite
  S.showTextures = S.sectionAlias('textures', showTextures)
}

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
.st-dialog.sd-sheet-dialog{width:min(820px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 16px);overflow:auto;box-sizing:border-box}
.sd-sheet-body{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.sd-sheet-ctl{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:2px}
.sd-sheet-pics{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin:6px 0}
.sd-sheet-col{display:flex;flex-direction:column;align-items:center;gap:4px}
.sd-sheet-cv,.sd-sheet-tile{image-rendering:pixelated;background:repeating-conic-gradient(var(--cv-common-checker-a-fill) 0 25%,var(--cv-common-checker-b-fill) 0 50%) 0 0/16px 16px;border:1px solid var(--dnp-color-line-main);border-radius:6px;max-width:100%}
.sd-sheet-tile{width:min(192px,45vh);height:min(192px,45vh)}
.sd-sheet-thumb{width:56px;height:56px;flex:0 0 auto;border-radius:6px;border:1px solid var(--dnp-color-line-main);background-size:cover;image-rendering:pixelated}
.cp-body{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.cp-pic{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:6px}
.cp-ctl{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:2px}
.cp-preview{width:100%;max-width:640px;image-rendering:pixelated;border:1px solid var(--dnp-color-line-main);border-radius:6px;background:repeating-conic-gradient(var(--cv-common-checker-a-fill) 0 25%,var(--cv-common-checker-b-fill) 0 50%) 0 0/16px 16px}
/* a grid, not the row's wrapping flex: on a phone the weight and the buttons stay beside the name */
.st-row.cp-member{display:grid;grid-template-columns:44px minmax(0,1fr) auto 44px 44px;align-items:center;gap:8px}
.st-row.cp-overlay{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:8px}
.cp-thumb{width:44px;height:44px}
.cp-member-name{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;overflow-wrap:anywhere}
.cp-weight-label{display:flex;flex-direction:column;align-items:flex-start;gap:0;font-size:12px}
.cp-weight{width:64px;min-height:44px;box-sizing:border-box}
.cp-icon{min-width:44px;min-height:44px}
.cp-advice{font-size:12px;margin-top:4px}
.cp-grey{display:flex;flex-direction:column;gap:4px;margin:2px 0 6px}
.cp-grey[hidden]{display:none}
.cp-line{font-family:var(--dnp-font-mono,monospace);font-size:12px;overflow-wrap:anywhere;margin:6px 0}
` }))
