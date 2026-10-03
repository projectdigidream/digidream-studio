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
import { el, button, muted, row, text, toggle, confirmDialog, ask } from '../ui.js'

let S = null

async function importTexture () {
  const f = await shell.importFile('image/png')
  if (!f) return
  const name = f.name.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
  if (!name) { S.status('the file needs a name made of letters and digits', 'error'); return }
  const blob = new Blob([f.bytes], { type: 'image/png' })
  let bmp
  try { bmp = await createImageBitmap(blob) } catch { S.status('that is not a PNG the browser can read', 'error'); return }
  S.module.textures ??= {}
  S.module.textures[name] = { w: bmp.width, h: bmp.height }
  S.rec.assets ??= {}
  S.rec.assets[`textures/${name}.png`] = blob
  if (S.imageUrls.has(name)) URL.revokeObjectURL(S.imageUrls.get(name))
  S.imageUrls.set(name, URL.createObjectURL(blob))
  S.textures.forget(name)
  bmp.close?.()
  S.moduleChanged()
  if (S.route() === 'textures') showTextures(name)
  S.status(`texture ${name} added (${bmp.width}x${bmp.height})`, 'ok')
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
    t.style.backgroundImage = `url("${S.imageUrls.get(n) ?? `/textures/${n}.png`}")`
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
