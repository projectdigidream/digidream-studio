//
// The module's props: bodies without a brain, their pictures and sheets.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { parseAtlas, frameKey } from '/src/render/atlas.js'
import { importSheetFile, sheetRecord, nameTsprite } from '../sheets.js'
import { copyName, cleanName } from '../assetcopy.js'
import { shell } from '../bridge.js'
import { el, button, text, muted, ask, confirmDialog } from '../ui.js'
import { moduleProps, newProp, deleteProp, renameProp, placementsOf, propRows } from '../props.js'

let S = null

/** A monster's or prop's pictures: a .tsprite project, an atlas .json and its .png, or one .png picture. */
export async function importSheet () {
  const f = await shell.importFile('.tsprite,.json,.png')
  if (!f) return null
  S.status('composing…', 'ok')
  let r
  try {
    r = await importSheetFile(f, {
      parseAtlas,
      pickPng: async (image) => { S.status(`now pick ${image}`, 'ok'); return shell.importFile('.png') }
    })
  } catch (e) { S.status(String(e.message ?? e), 'error'); return null }
  // A name the module already has is never taken over unasked: a second
  // sprite, made with the same id, would replace the first one's art.
  // (A single picture of that name, a prop's, would become this sheet's image.)
  const taken = (n) => !!S.module.sprites?.[n] || !!S.rec.assets?.[`sources/sprites/${n}.tsprite`] || !!S.rec.assets?.[`sprites/${n}.png`]
  if (taken(r.name)) {
    const raw = await ask(`There is a sheet called ${r.name} already. This one's name (A-Z, 0-9, _), or ${r.name} to replace it`, copyName(r.name, taken))
    const to = cleanName(raw ?? '')
    if (!to) { S.status('not imported', 'warn'); return null }
    if (taken(to) && !await confirmDialog(`Replace the sheet ${to}, and the art of everything drawn with it?`)) { S.status('not imported', 'warn'); return null }
    r.name = to
    r.manifest.sprite = to
    r.manifest.image = `${to}.png`
  }
  // A PROJECT is kept as the sheet's source (docs/PLUGINS.md, Bakers), so it can
  // be opened in ThreeSprite again; the sheet is baked from it. It carries the
  // sheet's name, so it goes out again as this sheet.
  if (/\.tsprite$/i.test(f.name) && S.bakeSource) {
    S.rec.assets ??= {}
    const src = `sources/sprites/${r.name}.tsprite`
    const prev = S.rec.assets[src]
    S.rec.assets[src] = new Blob([nameTsprite(f.bytes, r.name) ?? f.bytes])
    const b = await S.bakeSource('file:tsprite', r.name)
    if (!b.ok) { if (prev) S.rec.assets[src] = prev; else delete S.rec.assets[src]; S.status(b.error, 'error'); return null }
    S.moduleChanged()
    S.redraw()
    S.status(`sheet ${r.name} imported with its project: ${r.manifest.animations.length} animation(s)${r.warnings.length ? ' -- ' + r.warnings.join('; ') : ''}`, 'ok')
    return r.name
  }
  const json = new Blob([JSON.stringify(r.manifest)], { type: 'application/json' })
  const png = new Blob([r.png], { type: 'image/png' })
  S.rec.assets ??= {}
  S.rec.assets[`sprites/${r.name}.json`] = json
  S.rec.assets[`sprites/${r.name}.png`] = png
  S.module.sprites ??= {}
  S.module.sprites[r.name] = sheetRecord(r.manifest)
  const old = S.sheets.get(r.name)
  if (old) URL.revokeObjectURL(old.imageUrl)
  S.sheets.set(r.name, { atlas: parseAtlas(r.manifest, r.name), imageUrl: URL.createObjectURL(png) })
  S.sprites.forgetAll()
  S.moduleChanged()
  S.redraw()
  S.status(`sheet ${r.name} imported: ${r.manifest.animations.length} animation(s)${r.warnings.length ? ' -- ' + r.warnings.join('; ') : ''}`, 'ok')
  return r.name
}

/** One picture (a PNG) for a prop: assets/sprites/NAME.png, served to the game as /sprites/NAME.png. */
async function importPicture () {
  const f = await shell.importFile('image/png')
  if (!f) return null
  const name = f.name.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
  if (!name) { S.status('the file needs a name made of letters and digits', 'error'); return null }
  if (S.module.sprites?.[name]) { S.status(`${name} is a sheet already; pick another name`, 'error'); return null }
  const blob = new Blob([f.bytes], { type: 'image/png' })
  try { (await createImageBitmap(blob)).close?.() } catch { S.status('that is not a PNG the browser can read', 'error'); return null }
  S.rec.assets ??= {}
  S.rec.assets[`sprites/${name}.png`] = blob
  if (S.spriteUrls.has(name)) URL.revokeObjectURL(S.spriteUrls.get(name))
  S.spriteUrls.set(name, URL.createObjectURL(blob))
  S.sprites.forgetAll()
  S.save()
  S.status(`picture ${name} added`, 'ok')
  return name
}

/** The module's single pictures: sprite PNGs with no manifest beside them. */
function pictureNames () {
  return Object.keys(S.rec.assets ?? {})
    .filter((p) => /^sprites\/[^/]+\.png$/.test(p) && !S.rec.assets[p.replace(/\.png$/, '.json')])
    .map((p) => p.slice(8, -4)).sort()
}

// --- props: the sheet that lists them, and the one that edits one --------------------------------
function showProps () {
  const props = moduleProps(S.module)
  const rows = props.map((p) => {
    const r = el('div', { class: 'st-trow', 'data-prop': p.name }, [
      propThumb(p),
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: p.name }),
        el('div', { class: 'st-muted', text: `${p.radius} × ${p.height} · ${p.solid ? 'solid' : 'walk-through'} · ${p.art ? (p.art.kind === 'atlas' ? p.art.sheet : p.art.states?.[0]?.frames?.[0]) : 'no picture'} · placed ${placementsOf(S.docs, p.name).length}` })
      ])
    ])
    r.addEventListener('click', () => showProp(p.name))
    return r
  })
  S.ui.showSheet('Props', [
    ...rows,
    props.length ? null : muted('No props yet. A prop is a thing without a brain: a barrel, a torch, a tree.'),
    button('+ new prop', async () => {
      const raw = await ask('prop name (letters, digits, underscore)', 'barrel')
      if (!raw) return
      const name = newProp(S.module, raw)
      if (!name) { S.status('that name is empty or taken', 'warn'); return }
      S.moduleChanged()
      showProp(name)
    }),
    muted('Tap one to edit it. A monster\'s body is edited with the monster, on Monsters.')
  ])
}

function propThumb (p) {
  const box = el('div', { class: 'st-thumb', text: '?' })
  const icon = S.sprites.iconFor(p.name)
  const img = icon?.texture?.image
  if (img?.src) { box.textContent = ''; box.appendChild(el('img', { src: img.src })) }
  return box
}

function showProp (name) {
  const p = S.module.props.find((x) => x.name === name)
  if (!p) { showProps(); return }
  const ctx = {
    pictures: pictureNames(),
    sheets: Object.keys(S.module.sprites ?? {}),
    placements: placementsOf(S.docs, name).length,
    pictureUrl: (n) => S.spriteUrls.get(n) ?? null,
    sheetFrame: (sheet, anim) => {
      const src = S.sheets.get(sheet)
      const a = anim ? src?.atlas.byName.get(anim) : null
      const f = a ? src.atlas.frames[frameKey(src.atlas, a.name, 0, 1)] : null
      return f ? { url: src.imageUrl, rect: f.rect } : null
    },
    importPicture,
    importSheet,
    changed: () => { S.sprites.forget(name); S.moduleChanged(); S.redraw(); showProp(name) },
    rename: (raw) => {
      const to = renameProp(S.module, S.docs, name, raw)
      if (!to) { S.status('that name is empty or taken', 'warn'); showProp(name); return }
      S.sprites.forgetAll(); S.commit(); S.moduleChanged(); showProp(to)
    },
    remove: async () => {
      const n = placementsOf(S.docs, name).length
      if (!await confirmDialog(`delete prop ${name}?${n ? ` It stands in the maps ${n} time(s); those go too.` : ''}`)) return
      deleteProp(S.module, S.docs, name)
      S.sprites.forget(name); S.commit(); S.moduleChanged(); showProps()
    },
    place: () => { S.place = { kind: 'prop', name }; S.ui.setTool('place'); S.tool = 'place'; S.ui.hideSheet(); S.status(`tap the floor to place ${name}`, 'ok') }
  }
  S.ui.showSheet(`Prop ${name}`, propRows(S.module, p, ctx).filter(Boolean))
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.importSheet = importSheet
  S.importPicture = importPicture
  S.showProps = S.sectionAlias('props', showProps)
  S.showProp = S.sectionAlias('props', showProp)
}
