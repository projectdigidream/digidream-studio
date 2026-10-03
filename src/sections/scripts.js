//
// The module's own Lua: scripts every map of the module declares.
//
// A script here runs in each level, beside the runtimes, after the module's
// monsters are loaded (module_emit.js, emitModuleLua): hooks it defines are
// chained with every other part's rather than replacing them. It is the place
// for behaviour no vocabulary has words for yet. Game-wide behaviour -- what
// should run once for the whole game rather than once per level -- is the
// game's graph's (sections/graphs.js) and the weapons runtime's.
//
import { el, button, muted, row, confirmDialog, ask } from '../ui.js'

let S = null

function showScripts (open = null) {
  S.module.scripts ??= {}
  const names = Object.keys(S.module.scripts).sort()
  if (open && !(open in S.module.scripts)) open = null
  const body = names.map((n) => el('div', { class: 'st-trow', 'data-script': n, 'data-on': n === open ? '1' : '0', onclick: () => showScripts(n) }, [
    el('span', { class: 'st-mark', text: '📜' }),
    el('div', { class: 'st-trow-text' }, [el('div', { class: 'st-trow-name', text: n }),
      el('div', { class: 'st-muted', text: `${String(S.module.scripts[n]).split('\n').length} lines` })])
  ]))
  if (!names.length) body.push(muted('No scripts of the module\'s own. Most behaviour is written in the studio\'s own words -- triggers, monster brains, weapons, graphs -- and needs none.'))
  if (open) {
    const area = el('textarea', { class: 'sd-code', spellcheck: 'false', 'data-editing': open })
    area.value = S.module.scripts[open]
    area.addEventListener('change', () => { S.module.scripts[open] = area.value; S.moduleChanged() })
    body.push(el('div', { class: 'st-section-head', text: `📜 ${open}` }), area, el('div', { class: 'st-row' }, [
      button('rename', async () => {
        const raw = await ask('file name', open)
        const n = cleanName(raw)
        if (!n || n === open) return
        if (S.module.scripts[n] !== undefined) { S.status(`${n} exists already`, 'warn'); return }
        S.module.scripts[n] = S.module.scripts[open]; delete S.module.scripts[open]
        S.moduleChanged(); showScripts(n)
      }),
      button('delete', async () => {
        if (!await confirmDialog(`delete ${open}? Every map stops declaring it.`)) return
        delete S.module.scripts[open]; S.moduleChanged(); showScripts()
      }, 'st-danger')
    ]))
  }
  body.push(button('+ script', async () => {
    const n = cleanName(await ask('file name (letters, digits, _ -)', 'module_hooks.lua'))
    if (!n) return
    if (S.module.scripts[n] !== undefined) { S.status(`${n} exists already`, 'warn'); return }
    S.module.scripts[n] = '-- Runs in every level of the module, after its monsters are loaded.\n'
    S.moduleChanged(); showScripts(n)
  }), muted('Each runs in every level, in its own scope; hooks it defines (on_tick, on_attack, ...) run alongside every other script\'s. Game-wide graphs are not offered yet: they would need the trigger runtime game-wide, which the engine would then skip in every level.'))
  S.ui.showSheet('Scripts', body)
}

const cleanName = (raw) => {
  const n = String(raw ?? '').trim().replace(/[^A-Za-z0-9_.-]/g, '')
  if (!n) return null
  return n.endsWith('.lua') ? n : `${n}.lua`
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showScripts = S.sectionAlias('scripts', showScripts)
}
