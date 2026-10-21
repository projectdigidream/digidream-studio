//
// THE MODULE'S SPRITES: its sheets, and the projects they are baked from.
//
// A sheet the module draws (sprites/NAME.json + .png) either has a SOURCE --
// a ThreeSprite project kept at sources/sprites/NAME.tsprite, baked into the
// sheet (bake/tsprite.js) -- or was imported finished (an atlas export) and
// has none. A sheet with a source opens in ThreeSprite when its plugin is
// here; Back to studio bakes it again. Props and monsters pick sheets by name,
// so a sheet re-baked under the same name changes them all.
//
import { el, button, muted, ask } from '../ui.js'
import { sheetName } from '../sheets.js'
import { importSheet } from './props.js'
import { frameKey, parseAtlas } from '/src/render/atlas.js'
import { withIcon } from '../ui.js'
import { duplicateSprite } from '../assetcopy.js'
import { exportButtons, askCopyName } from './assetbuttons.js'
import { animationEditor, editableSheet, loopRows, ANIM_CSS } from './animeditor.js'

let S = null

const sourceOf = (n) => S.rec.assets?.[`sources/sprites/${n}.tsprite`]

// `anim`: the animation open in the editor of an imported sheet (animeditor.js).
async function showSprites (open = null, anim = null) {
  if (!document.getElementById('st-anim-css')) document.head.appendChild(el('style', { id: 'st-anim-css', text: ANIM_CSS }))
  const names = Object.keys(S.module.sprites ?? {}).sort()
  const editors = S.plugins.editorsFor('file:tsprite').filter((e) => !e.builtin)
  const body = [
    el('div', { class: 'st-row' }, [
      editors.length ? button('+ new sprite', async () => {
        const raw = await ask('the new sheet\'s name (A-Z, 0-9, _)', 'SPRITE')
        const n = sheetName(raw ?? '')
        if (!n) return
        if (S.module.sprites?.[n] || sourceOf(n)) { S.status(`${n} is taken`, 'warn'); return }
        S.editInPlugin('file:tsprite', n)
      }) : null,
      button('+ import a sprite (.tsprite, an atlas, or one PNG picture)', async () => { const n = await importSheet(); if (n) showSprites(n) })
    ].filter(Boolean)),
    editors.length ? null : muted('No sprite editor here: projects can be imported, and are baked, but not edited. A studio with the ThreeSprite plugin edits them in place.')
  ].filter(Boolean)
  if (!names.length) body.push(muted('No sheets yet. A sheet is what a prop or a monster is drawn with.'))
  const grid = el('div', { class: 'st-grid' }, names.map((n) => {
    const t = el('button', { class: 'st-tile st-sprite-tile', 'data-sprite': n, 'data-on': n === open ? '1' : '0', title: n, onclick: () => showSprites(n) }, [frameThumb(S.sheets.get(n)), el('span', { icon: sourceOf(n) ? null : 'section.graphs', text: n })])
    return t
  }))
  // Many sprites: found by name, not by scrolling a screen of them.
  if (names.length > 12) {
    const find = el('input', { class: 'st-chips-find', type: 'search', placeholder: `find among ${names.length} sprites…`, autocomplete: 'off' })
    find.addEventListener('input', () => { const q = find.value.trim().toLowerCase(); for (const t of grid.children) t.hidden = !!q && !t.dataset.sprite.toLowerCase().includes(q) && t.dataset.on !== '1' })
    body.push(find)
  }
  body.push(grid)
  if (open && S.module.sprites?.[open]) {
    const rec = S.module.sprites[open]
    const users = (S.module.props ?? []).filter((p) => p.art?.sheet === open).map((p) => p.name ?? p.id)
    const baked = S.module.baked?.[`sources/sprites/${open}.tsprite`]
    body.push(el('div', { class: 'st-card', 'data-open-sprite': open }, [
      el('div', { class: 'st-entry', text: open }),
      // The sheet's own list when the module's record of it has none (an imported file).
      ((names) => muted(`${names.length} animation(s): ${names.join(', ') || '—'}`))(rec.animations?.length ? rec.animations : (S.sheets.get(open)?.atlas?.animations ?? []).map((a) => a.name)),
      muted(users.length ? `drawn by ${users.join(', ')}` : 'no prop draws it yet'),
      muted(sourceOf(open) ? `baked from its ThreeSprite project${baked ? ` (baker ${baked.baker} ${baked.version})` : ''}: its animations are the project's, edited in ThreeSprite` : 'imported as a finished sheet: its animations are edited below; its pictures are the sheet\'s (import its .tsprite to edit those)'),
      el('div', { class: 'st-row' }, [
        ...(sourceOf(open) ? (S.editButtons?.('file:tsprite', open) ?? []) : []),
        // A copy: the sheet and its ThreeSprite project under a new name, a variant to change.
        button(withIcon('action.duplicate', 'duplicate'), async () => {
          const to = await askCopyName(S, open, (n) => !!S.module.sprites?.[n] || !!S.rec.assets?.[`sources/sprites/${n}.tsprite`])
          if (!to) return
          const json = S.rec.assets[`sprites/${open}.json`]
          const text = duplicateSprite(S.rec, open, to, typeof json === 'string' ? json : await json?.text?.())
          if (!text) { S.status(`${open} could not be copied`, 'error'); return }
          S.rec.assets[`sprites/${to}.json`] = new Blob([text], { type: 'application/json' })
          S.sheets.set(to, { atlas: parseAtlas(JSON.parse(text), to), imageUrl: URL.createObjectURL(S.rec.assets[`sprites/${to}.png`]) })
          S.moduleChanged()
          S.status(`${to}: a copy of ${open}`, 'ok')
          showSprites(to)
        }),
        ...exportButtons(S, 'sprite', open)
      ]),
      // An imported sheet's animations: name, fps, loop and frames.
      editableSheet(S, open) ? await animationEditor(S, open, anim, (n, a) => showSprites(n, a))
        // Baked from a project: which of its animations loop, the studio's to say.
        : sourceOf(open) ? await loopRows(S, open, (n) => showSprites(n)) : null
    ].filter(Boolean)))
  }
  S.ui.showSheet('Sprites', body)
}

/**
 * A sheet's tile: one frame of it (its idle, else its first animation, from
 * the front), not the whole sheet squeezed into a square -- a walk cycle of
 * eight views is a smear at that size.
 */
function frameThumb (src) {
  const c = el('canvas', { class: 'st-sprite-thumb', width: 96, height: 96 })
  if (!src?.atlas || !src.imageUrl) return c
  const img = new Image()
  img.src = src.imageUrl
  const draw = () => {
    const a = src.atlas
    const anim = a.byName.get('idle') ?? a.animations[0]
    // Views count from 1 (the front); a sheet of one view has only that.
    const f = anim ? a.frames[frameKey(a, anim.name, 0, 1) ?? Object.values(anim.frames[0]?.views ?? {})[0]] : null
    const r = f?.rect
    if (!r || !img.naturalWidth) return
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    const k = Math.min(88 / r.w, 88 / r.h)
    g.drawImage(img, r.x, r.y, r.w, r.h, (96 - r.w * k) / 2, (96 - r.h * k) / 2, r.w * k, r.h * k)
  }
  if (img.complete) draw(); else img.addEventListener('load', draw, { once: true })
  return c
}

export function install (s) {
  S = s
  S.showSprites = S.sectionAlias('sprites', showSprites)
}
