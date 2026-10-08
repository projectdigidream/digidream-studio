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

let S = null

const sourceOf = (n) => S.rec.assets?.[`sources/sprites/${n}.tsprite`]

function showSprites (open = null) {
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
      button('+ import a sprite (.tsprite, or an atlas)', async () => { const n = await importSheet(); if (n) showSprites(n) })
    ].filter(Boolean)),
    editors.length ? null : muted('No sprite editor here: projects can be imported, and are baked, but not edited. A studio with the ThreeSprite plugin edits them in place.')
  ].filter(Boolean)
  if (!names.length) body.push(muted('No sheets yet. A sheet is what a prop or a monster is drawn with.'))
  const grid = el('div', { class: 'st-grid' }, names.map((n) => {
    const t = el('button', { class: 'st-tile', 'data-sprite': n, 'data-on': n === open ? '1' : '0', title: n, onclick: () => showSprites(n) }, [el('span', { text: `${sourceOf(n) ? '' : '◇ '}${n}` })])
    const src = S.sheets.get(n)
    if (src) { t.style.backgroundImage = `url("${src.imageUrl}")`; t.style.backgroundSize = 'contain'; t.style.backgroundRepeat = 'no-repeat'; t.style.backgroundPosition = 'center' }
    return t
  }))
  body.push(grid)
  if (open && S.module.sprites?.[open]) {
    const rec = S.module.sprites[open]
    const users = (S.module.props ?? []).filter((p) => p.art?.sheet === open).map((p) => p.name ?? p.id)
    const baked = S.module.baked?.[`sources/sprites/${open}.tsprite`]
    body.push(el('div', { class: 'st-card', 'data-open-sprite': open }, [
      el('div', { class: 'st-entry', text: open }),
      muted(`${(rec.animations ?? []).length} animation(s): ${(rec.animations ?? []).join(', ') || '—'}`),
      muted(users.length ? `drawn by ${users.join(', ')}` : 'no prop draws it yet'),
      muted(sourceOf(open) ? `baked from its ThreeSprite project${baked ? ` (baker ${baked.baker} ${baked.version})` : ''}` : 'imported as a finished sheet: no project to edit (import its .tsprite to have one)'),
      el('div', { class: 'st-row' }, sourceOf(open) ? (S.editButtons?.('file:tsprite', open) ?? []) : [])
    ]))
  }
  S.ui.showSheet('Sprites', body)
}

export function install (s) {
  S = s
  S.showSprites = S.sectionAlias('sprites', showSprites)
}
