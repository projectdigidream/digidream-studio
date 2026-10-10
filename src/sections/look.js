//
// THE LOOK: which skin the studio wears on this device, its mode and its
// pointer size, and the skins brought in from outside (skin.js). Shown on
// Home and in Settings; the person's choice, never written into a module.
//
import { el, select, button, muted, card, withIcon, confirmDialog } from '../ui.js'
import { skinList, importSkin, removeSkin } from '../skin.js'
import { shell } from '../bridge.js'

/**
 * The Look card. `redraw` draws its page again once the list of skins or
 * the chosen one has changed (a mode or pointer change needs no redraw).
 */
export function lookCard (S, redraw, { title = 'Look — this device, not the module', about = true } = {}) {
  const list = S.skinList ?? []
  const cur = list.find((s) => s.id === S.skin.id) ?? { modes: S.skin.view.compiled.modes, about: '' }
  const want = S.skin.want
  const refresh = async () => { S.skinList = await skinList(); redraw() }
  const pick = async () => {
    const files = await shell.importFiles('.json,.js,application/json,text/javascript')
    for (const f of files) {
      try {
        const s = await importSkin(new TextDecoder().decode(f.bytes))
        await S.skin.use({ skin: s.id })
        S.status(`style ${s.name} imported, and worn`, 'ok')
      } catch (e) { S.status(`${f.name}: ${e.message}`, 'error') }
    }
    if (files.length) await refresh()
  }
  const forget = async () => {
    if (!await confirmDialog(`forget the style ${cur.name}? It is only on this device.`)) return
    await removeSkin(cur.id)
    await S.skin.use({ skin: 'claude' })
    await refresh()
  }
  return card(title, [
    select('style', S.skin.id, list.map((s) => [s.id, s.imported ? `${s.name} (imported)` : s.name]), (v) => { S.skin.use({ skin: v }).then(refresh) }),
    select('mode', want.mode, [['auto', 'auto — follows the system'], ...cur.modes.map((m) => [m, m])], (v) => { S.skin.use({ mode: v }) }),
    select('pointer', want.pointer, [['touch', 'touch — finger-sized'], ['mouse', 'mouse — compact'], ['auto', 'auto — follows the device']], (v) => { S.skin.use({ pointer: v }) }),
    el('div', { class: 'st-row' }, [
      button(withIcon('action.import', 'import a style…'), pick),
      cur.imported ? button(withIcon('action.delete', 'forget this style'), forget, 'st-danger') : null
    ].filter(Boolean)),
    about ? muted(cur.about || '') : null,
    about ? muted('A style is a skin made with uikit, baked into one file: node uikit/build.js <name> --js, or the testbench\'s "Bake bundle". Imported styles stay on this device.') : null
  ].filter(Boolean))
}

