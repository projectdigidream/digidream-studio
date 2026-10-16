//
// Duplicate and export, for the Textures and Sprites pages (assetcopy.js).
//
import { button, ask, withIcon } from '../ui.js'
import { shell } from '../bridge.js'
import { writePack } from '../pack.js'
import { exportsOf, cleanName, copyName } from '../assetcopy.js'
import { nameTsprite } from '../sheets.js'

const bytesOf = async (b) => (b == null ? null : typeof b === 'string' ? new TextEncoder().encode(b) : typeof b.arrayBuffer === 'function' ? new Uint8Array(await b.arrayBuffer()) : b)

/** The export buttons for one texture ('texture') or sprite ('sprite'): each file it can leave as. */
export function exportButtons (S, kind, name) {
  return exportsOf(S.rec, kind, name).map((x) => button(withIcon('action.export', x.id === 'png' ? 'export PNG' : x.id === 'sheet' ? 'export sheet' : x.id === 'project' && kind === 'sprite' ? 'export .tsprite' : 'export project'), async () => {
    let bytes
    if (x.pack) bytes = await writePack(await Promise.all(x.pack.map(async (p) => ({ path: p.split('/').pop(), bytes: await bytesOf(S.rec.assets[p]) }))))
    else bytes = await bytesOf(S.rec.assets[x.path])
    if (!bytes) { S.status(`${name}: nothing to export`, 'warn'); return }
    // A sprite's project leaves as this sheet, whatever id it was drawn with.
    if (kind === 'sprite' && x.id === 'project') bytes = nameTsprite(bytes, name) ?? bytes
    const ok = await shell.share(x.file, bytes)
    S.status(ok ? `${x.file}: ${x.label}, out of the studio` : `${x.file} not saved`, ok ? 'ok' : 'warn')
  }))
}

/**
 * Ask for a copy's name (offering the first free NAME_2), checked against
 * `taken`; null when cancelled or unusable.
 */
export async function askCopyName (S, name, taken) {
  const raw = await ask(`the copy's name (A-Z, 0-9, _; up to 24)`, copyName(name, taken))
  const to = cleanName(raw)
  if (!to) return null
  if (taken(to)) { S.status(`${to} is taken`, 'warn'); return null }
  return to
}
