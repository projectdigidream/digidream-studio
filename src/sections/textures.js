//
// The module's textures: its own pictures, and the app's beside them.
//
// A texture is a NAME (up to 24 characters, the map format's limit) and a PNG.
// The module's own live in the record's assets with their size in
// module.textures; the app serves more (/textures/index.json). Rooms name them
// in their floor and ceiling and walls in their three bands, so renaming one
// follows every reference in every map, and deleting one in use asks first.
//
import { shell } from '../bridge.js'
import { el, button, muted, row, text, toggle, confirmDialog, ask, select, number, pictureBackground } from '../ui.js'
import { guessSheet, frameRect, frameSize, sheetProblems, MAX_FRAMES, DEFAULT_FPS } from '../texsheet.js'

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
    const play = button('⏸', () => { playing = !playing; play.textContent = playing ? '⏸' : '▶' })
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
        g.strokeStyle = 'rgba(255,224,102,.85)'; g.lineWidth = 1
        for (let i = 1; i < spec.frames; i++) {
          const c = frameRect(spec, w, h, i)
          g.beginPath()
          if (spec.layout === 'horizontal') { g.moveTo(c.x * k + 0.5, 0); g.lineTo(c.x * k + 0.5, ch) } else { g.moveTo(0, c.y * k + 0.5); g.lineTo(cw, c.y * k + 0.5) }
          g.stroke()
        }
        g.strokeStyle = '#5b8fd6'; g.lineWidth = 2
        g.strokeRect(r.x * k + 1, r.y * k + 1, r.w * k - 2, r.h * k - 2)
        // What is left over, shaded: the client does not show it.
        const spare = frameSize(spec, w, h).spare
        if (spare) { g.fillStyle = 'rgba(255,77,77,.4)'; if (spec.layout === 'horizontal') g.fillRect((w - spare) * k, 0, spare * k, ch); else g.fillRect(0, (h - spare) * k, cw, spare * k) }
      }
      const t = tileCv.getContext('2d')
      t.imageSmoothingEnabled = false
      t.clearRect(0, 0, 192, 192)
      const s = Math.min(96 / r.w, 96 / r.h)
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) t.drawImage(img, r.x, r.y, r.w, r.h, ox * r.w * s, oy * r.h * s, r.w * s, r.h * s)
    }
    // novalidate: a hidden field's limits (a still picture's frame size) must not block the button.
    const dlg = el('dialog', { class: 'st-dialog sd-sheet-dialog', 'data-sheet-dialog': name }, [el('form', { method: 'dialog', novalidate: '' }, [
      el('div', { class: 'st-section-head', text: `🎞 ${name}` }),
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

function showTextures (open = null) {
  const own = Object.keys(S.module.textures ?? {}).sort()
  const served = S.textureNames.filter((n) => !own.includes(n))
  const tile = (n, mine) => {
    const t = el('button', { class: 'st-tile', 'data-texture': n, 'data-on': n === open ? '1' : '0', title: n, onclick: () => showTextures(mine ? n : null) },
      [el('span', { text: n })])
    pictureBackground(t, S.imageUrls.get(n) ?? `/textures/${n}.png`, S.sheetOf?.(n))
    return t
  }
  const body = [
    el('div', { class: 'st-row' }, [button('+ import texture (PNG)', () => importTexture())]),
    el('div', { class: 'st-section-head', text: `🧱 the module's own (${own.length})` }),
    own.length ? el('div', { class: 'st-grid' }, own.map((n) => tile(n, true))) : muted('None yet. A PNG imported here is the module\'s, and ships in its pack.')
  ]
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
        el('span', { style: 'flex:1 1 auto', text: meta.sheet ? `🎞 animated: ${meta.sheet.frames} frames ${meta.sheet.layout === 'horizontal' ? 'side by side' : 'stacked'}, ${meta.sheet.fps ?? DEFAULT_FPS} a second` : 'a still picture' }),
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
        button('rename', async () => {
          const raw = await ask('new name (A-Z, 0-9, _; up to 24)', open)
          const n = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
          if (!n || n === open) return
          if (!valid(n) || S.module.textures[n] || S.textureNames.includes(n)) { S.status(`${n} is taken or not a usable name`, 'warn'); return }
          S.module.textures[n] = meta; delete S.module.textures[open]
          S.rec.assets[`textures/${n}.png`] = S.rec.assets[`textures/${open}.png`]; delete S.rec.assets[`textures/${open}.png`]
          S.imageUrls.set(n, S.imageUrls.get(open)); S.imageUrls.delete(open)
          for (const x of u) x.set(n)
          S.textures.forget(open)
          S.moduleChanged(); S.redraw()
          S.status(`${open} is ${n} now, on ${u.length} surface${u.length === 1 ? '' : 's'}`, 'ok')
          showTextures(n)
        }),
        button('delete', async () => {
          if (u.length && !await confirmDialog(`${open} is on ${u.length} surface${u.length === 1 ? '' : 's'} (${maps.join(', ')}). Delete it and leave those bare?`)) return
          for (const x of u) x.set(null)
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
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.importTexture = importTexture
  S.showTextures = S.sectionAlias('textures', showTextures)
}

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
.st-dialog.sd-sheet-dialog{width:min(820px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 16px);overflow:auto;box-sizing:border-box}
.sd-sheet-body{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.sd-sheet-ctl{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:2px}
.sd-sheet-pics{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin:6px 0}
.sd-sheet-col{display:flex;flex-direction:column;align-items:center;gap:4px}
.sd-sheet-cv,.sd-sheet-tile{image-rendering:pixelated;background:repeating-conic-gradient(#1b2230 0 25%,#121620 0 50%) 0 0/16px 16px;border:1px solid #2a3446;border-radius:6px;max-width:100%}
.sd-sheet-tile{width:min(192px,45vh);height:min(192px,45vh)}
.sd-sheet-thumb{width:56px;height:56px;flex:0 0 auto;border-radius:6px;border:1px solid #2a3446;background-size:cover;image-rendering:pixelated}
` }))
