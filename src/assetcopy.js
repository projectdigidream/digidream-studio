//
// A TEXTURE OR A SPRITE, DUPLICATED OR TAKEN OUT OF THE STUDIO.
//
// A texture is its picture (textures/NAME.png) and, when it was painted in
// qPainter, its project (sources/textures/NAME.texproj.json). A sprite is
// its baked sheet (sprites/NAME.json + .png) and, when it was made in
// ThreeSprite, its project (sources/sprites/NAME.tsprite). A copy takes all of
// them under the new name -- the bakers name what they write after the key,
// so the copy's project bakes to the copy -- and starts out identical: a
// variant to change without touching the original.
//
// Pure over a record ({ module, assets }): assetcopy.test.js runs it in Node.
//

/** A name the studio takes for a texture or sheet: A-Z, 0-9, _, up to 24. */
export const cleanName = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)

/** The first free `<NAME>_2`, `<NAME>_3`, … for a copy (kept within 24 letters). */
export function copyName (name, taken) {
  for (let n = 2; ; n++) {
    const tail = `_${n}`
    const c = `${name.slice(0, 24 - tail.length)}${tail}`
    if (!taken(c)) return c
  }
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/** Copy a texture to `to`: its meta, its picture, its qPainter project. False when there is nothing to copy. */
export function duplicateTexture (rec, name, to) {
  const m = rec.module
  if (!m.textures?.[name] || m.textures[to] || !rec.assets?.[`textures/${name}.png`]) return false
  m.textures[to] = clone(m.textures[name])
  rec.assets[`textures/${to}.png`] = rec.assets[`textures/${name}.png`]
  const src = `sources/textures/${name}.texproj.json`
  if (rec.assets[src]) {
    rec.assets[`sources/textures/${to}.texproj.json`] = rec.assets[src]
    if (m.baked?.[src]) m.baked[`sources/textures/${to}.texproj.json`] = clone(m.baked[src])
  }
  return true
}

/**
 * Copy a sprite to `to`: its record, its sheet (the manifest renamed to
 * match), its ThreeSprite project. `manifestText` is the sheet's json as
 * text (read by the caller, since assets are Blobs in the page); returns
 * the new manifest's text, or null when there is nothing to copy.
 */
export function duplicateSprite (rec, name, to, manifestText) {
  const m = rec.module
  if (!m.sprites?.[name] || m.sprites[to] || !rec.assets?.[`sprites/${name}.png`]) return null
  m.sprites[to] = clone(m.sprites[name])
  let json
  try { json = JSON.parse(manifestText) } catch { return null }
  json.sprite = to
  json.image = `${to}.png`
  const text = JSON.stringify(json)
  rec.assets[`sprites/${to}.json`] = text
  rec.assets[`sprites/${to}.png`] = rec.assets[`sprites/${name}.png`]
  const src = `sources/sprites/${name}.tsprite`
  if (rec.assets[src]) {
    rec.assets[`sources/sprites/${to}.tsprite`] = rec.assets[src]
    if (m.baked?.[src]) m.baked[`sources/sprites/${to}.tsprite`] = clone(m.baked[src])
  }
  return text
}

/**
 * What can be taken out of the studio for one texture or sprite:
 * [{ id, label, file, path }] -- `path` is the record's asset, `file` the
 * name it is saved as. A sprite's sheet is two files, packed (`pack`).
 */
export function exportsOf (rec, kind, name) {
  const a = rec.assets ?? {}
  if (kind === 'texture') {
    return [
      a[`textures/${name}.png`] && { id: 'png', label: 'the picture (PNG)', file: `${name}.png`, path: `textures/${name}.png` },
      a[`sources/textures/${name}.texproj.json`] && { id: 'project', label: 'its qPainter project', file: `${name}.texproj.json`, path: `sources/textures/${name}.texproj.json` }
    ].filter(Boolean)
  }
  return [
    a[`sources/sprites/${name}.tsprite`] && { id: 'project', label: 'its ThreeSprite project (.tsprite)', file: `${name}.tsprite`, path: `sources/sprites/${name}.tsprite` },
    a[`sprites/${name}.png`] && { id: 'sheet', label: 'the baked sheet (.zip: json + png)', file: `${name}-sheet.zip`, pack: [`sprites/${name}.json`, `sprites/${name}.png`] }
  ].filter(Boolean)
}
