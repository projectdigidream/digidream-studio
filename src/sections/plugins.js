//
// THE PLUGINS PAGE: what the studio has besides itself (docs/PLUGINS.md).
//
// Each plugin with what it brings -- editors and the kinds they edit, bakers,
// rail pages -- where it came from (bundled with this build, or installed),
// and a switch. Below: the ones refused and why (a plugin for a newer studio,
// a broken plugin.json), which editor each kind opens in, and any unsaved
// work an editor left behind.
//
import { el, button, muted, toggle, confirmDialog } from '../ui.js'
import { shell } from '../bridge.js'
import { BASE } from '../base.js'
import { readPluginZip, installPlugin, uninstallPlugin, pluginBase } from '../plugins/install.js'
import { SUITE_KINDS } from '../plugins/kinds.js'
import { installPluginSections } from '../plugins/frame.js'
import { STUDIO_VERSION } from '../version.js'
import { compareVersions } from '../plugins/manifest.js'
import { draftsOf, clearDraft } from '../plugins/drafts.js'
import { editArg } from '../plugins/frame.js'

let S = null

async function showPlugins () {
  const list = S.plugins.list().filter((p) => !p.manifest.hidden || S.devPlugins)
  const body = []
  body.push(muted('Editors and tools that run inside the studio. A plugin edits the module\'s own files and hands them back when you go back to the studio; the module never depends on it to play.'))
  body.push(el('div', { class: 'st-row' }, [
    S.canInstall
      ? button('+ install a plugin (.dnpplugin)', async () => { const f = await shell.importFile('.dnpplugin,.zip,application/zip'); if (f) await installFromBytes(f.bytes) })
      : muted('Installing plugins needs a service worker, which this window does not have; the bundled ones work.')
  ]))
  for (const p of list) {
    const m = p.manifest
    const brings = [
      ...m.editors.map((e) => `edits ${e.kinds.map((k) => S.docKinds[k]?.label ?? k).join(', ')}`),
      ...m.bakers.map((b) => `bakes ${b.kinds.map((k) => S.docKinds[k]?.label ?? k).join(', ')}`),
      ...m.sections.map((x) => `the ${x.label} page`)
    ]
    body.push(el('div', { class: 'st-card', 'data-plugin': m.id }, [
      el('div', { class: 'st-row' }, [
        el('span', { class: 'st-entry', text: `${m.name} ${m.version}` }),
        el('span', { class: 'st-muted', text: p.source === 'bundled' ? 'bundled' : 'installed' })
      ]),
      m.description ? muted(m.description) : null,
      muted(brings.join(' · ')),
      toggle('on', p.enabled, (v) => { S.plugins.setEnabled(m.id, v); S.savePluginState?.(); showPlugins() }),
      p.source === 'installed' ? el('div', { class: 'st-row' }, [button('uninstall', async () => {
        if (!await confirmDialog(`Uninstall ${m.name} ${m.version}? Unsaved work it left stays, for another editor to pick up. The studio reloads to finish.`)) return
        await uninstallPlugin(BASE, m.id)
        S.save.flush?.()
        location.reload()
      }, 'st-danger')]) : null
    ].filter(Boolean)))
  }
  if (!list.length) body.push(muted('None. This build of the studio came without plugins.'))
  for (const r of S.plugins.refused) {
    body.push(el('div', { class: 'st-danger st-problem', 'data-refused': r.id, text: `${r.id} (${r.source}) was not loaded: ${r.errors.join('; ')}` }))
  }

  // Which editor each kind opens in, where there is a choice.
  const choices = Object.values(S.docKinds).filter((k) => S.plugins.editorsFor(k.id).length > 1)
  if (choices.length) {
    body.push(el('div', { class: 'st-section-head', text: 'opens in' }))
    for (const k of choices) {
      const editors = S.plugins.editorsFor(k.id)
      const sel = el('select', { 'data-default-editor': k.id }, editors.map((e, i) => {
        const o = el('option', { value: e.key, text: e.label + (e.builtin ? ' (the studio)' : '') })
        if (i === 0) o.selected = true
        return o
      }))
      sel.addEventListener('change', () => S.plugins.setDefaultEditor(k.id, sel.value))
      body.push(el('div', { class: 'st-row' }, [el('span', { style: 'flex:1 1 auto', text: `a ${k.label}` }), sel]))
    }
  }

  // Unsaved work an editor left (the app was closed mid-edit).
  const drafts = await draftsOf(S.module.id).catch(() => [])
  if (drafts.length) {
    body.push(el('div', { class: 'st-section-head', text: 'unsaved work' }))
    for (const d of drafts) {
      const label = S.docKinds[d.kind]?.label ?? d.kind
      const editor = S.plugins.editor(d.editor) ?? S.plugins.editorsFor(d.kind).find((e) => !e.builtin)
      body.push(el('div', { class: 'st-row', 'data-draft': d.key }, [
        el('span', { style: 'flex:1 1 auto', text: `${label} ${d.doc}, ${new Date(d.at).toLocaleString()}` }),
        editor ? button('open', () => S.go('edit', editArg(editor.key, d.kind, d.doc))) : null,
        button('throw away', async () => { await clearDraft(S.module.id, d.kind, d.doc); showPlugins() }, 'st-danger')
      ].filter(Boolean)))
    }
  }
  S.ui.showSheet('Plugins', body)
}

/**
 * Install a .dnpplugin: read and checked first (manifest.js, every entry
 * present), then one question -- it runs with the studio's own reach -- then
 * stored, and its editors are offered at once; a rail page appears with it.
 */
async function installFromBytes (bytes) {
  const r = await readPluginZip(bytes, { suiteVersion: STUDIO_VERSION, knownKinds: SUITE_KINDS })
  if (!r.ok) { S.status(`not installed: ${r.errors.join('; ')}`, 'error'); return false }
  const m = r.manifest
  const have = S.plugins.plugins.get(m.id)
  if (have?.source === 'bundled' && compareVersions(have.manifest.version, m.version) >= 0) {
    S.status(`not installed: this studio comes with ${m.name} ${have.manifest.version}, which is not older`, 'warn')
    return false
  }
  const brings = [...m.editors.map((e) => `edits ${e.kinds.join(', ')}`), ...m.bakers.map((b) => `bakes ${b.kinds.join(', ')}`), ...m.sections.map((x) => `a ${x.label} page`)].join('; ')
  const ok = await confirmDialog(`Install ${m.name} ${m.version}${m.author ? ` by ${m.author}` : ''}${have ? ` (replacing ${have.manifest.version})` : ''}? It ${brings}. A plugin runs inside the studio with the same access as the studio: it can read and change every module here. Install only plugins you trust.`)
  if (!ok) return false
  const done = await installPlugin(BASE, r)
  if (have) S.plugins.remove(m.id)
  const add = S.plugins.add(r.json, { baseUrl: pluginBase(BASE, m.id, m.version), source: 'installed' })
  if (!add.ok) { S.status(`stored, but not loaded: ${add.errors.join('; ')}`, 'error'); return false }
  installPluginSections(S)
  S.status(`${m.name} ${m.version} installed${done.replaced ? ` (was ${done.replaced})` : ''}`, 'ok')
  showPlugins()
  return true
}

export function install (s) {
  S = s
  S.showPlugins = S.sectionAlias('plugins', showPlugins)
  S.installPluginBytes = installFromBytes
}
