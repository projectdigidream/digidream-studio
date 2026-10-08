//
// WHICH PLUGINS THE STUDIO HAS, and which of them edits what.
//
// Two sources: the plugins bundled with this build (plugins/index.json, beside
// the studio) and the ones installed later (install.js). The same id from both:
// the higher version is used. The studio's own editors -- a section that
// already edits a kind, like the Scripts page -- are registered here too as
// BUILT-IN editors, so "open with…" can offer a plugin beside them.
//
// Pure apart from the `fetchJson` and `prefs` it is given; registry.test.js
// drives it in node.
//
import { validateManifest, compareVersions, PROTOCOL } from './manifest.js'

export class PluginRegistry {
  /**
   * @param suiteVersion  the studio's version (plugin.json's `studio` range is checked against it)
   * @param knownKinds    the studio's own kinds (kinds.js)
   * @param prefs         { get(key), set(key, value) }: which editor a kind opens in by default
   */
  constructor ({ suiteVersion = '0.0.0', knownKinds = [], prefs = null } = {}) {
    this.suiteVersion = suiteVersion
    this.knownKinds = knownKinds
    this.prefs = prefs
    this.plugins = new Map()     // id -> { manifest, baseUrl, source, enabled }
    this.builtins = []           // [{ key, label, kinds, open }]
    this.refused = []            // [{ id, source, errors }] -- shown on the Plugins page
    this.showHidden = false      // hidden plugins (tests, examples) are offered only when this is on
  }

  /**
   * Add a plugin from its plugin.json. `baseUrl` ends with '/': where its
   * entries are served from. Returns { ok, errors }.
   */
  add (json, { baseUrl, source = 'bundled', enabled = true } = {}) {
    const r = validateManifest(json, { suiteVersion: this.suiteVersion, protocol: PROTOCOL, knownKinds: this.knownKinds })
    if (!r.ok) { this.refused.push({ id: json?.id ?? '?', source, errors: r.errors }); return r }
    const have = this.plugins.get(r.plugin.id)
    if (have && compareVersions(have.manifest.version, r.plugin.version) >= 0) {
      return { ok: false, errors: [`${r.plugin.id} ${have.manifest.version} (${have.source}) is already here, and not older`] }
    }
    this.plugins.set(r.plugin.id, { manifest: r.plugin, baseUrl, source, enabled })
    return r
  }

  remove (id) { return this.plugins.delete(id) }

  setEnabled (id, on) {
    const p = this.plugins.get(id)
    if (p) p.enabled = !!on
  }

  /** A studio page that already edits these kinds: `open(key)` goes there. */
  addBuiltin ({ key, label, kinds, open }) {
    this.builtins.push({ key: `builtin/${key}`, label, kinds, open, builtin: true })
  }

  /** Every plugin, enabled or not, in id order. */
  list () {
    return [...this.plugins.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
  }

  /**
   * The editors for a kind: [{ key, label, builtin, plugin?, editor?, url? }].
   * The one the author chose for the kind comes first; otherwise the studio's
   * own (it is what the studio always did), then plugins by priority.
   */
  editorsFor (kind) {
    const out = this.builtins.filter((b) => b.kinds.includes(kind))
    for (const p of this.plugins.values()) {
      if (!p.enabled || (p.manifest.hidden && !this.showHidden)) continue
      for (const e of p.manifest.editors) {
        if (!e.kinds.includes(kind)) continue
        out.push({ key: `${p.manifest.id}/${e.id}`, label: e.label, builtin: false, plugin: p.manifest.id, editor: e, url: p.baseUrl + e.entry, priority: e.priority })
      }
    }
    const pref = this.prefs?.get(`editor.${kind}`)
    const rank = (x) => (x.key === pref ? 0 : x.builtin ? 1 : 2)
    return out.sort((a, b) => rank(a) - rank(b) || (b.priority ?? 0) - (a.priority ?? 0) || a.label.localeCompare(b.label))
  }

  /** Does anything other than the studio itself edit this kind? */
  hasPluginEditor (kind) { return this.editorsFor(kind).some((e) => !e.builtin) }

  setDefaultEditor (kind, key) { this.prefs?.set(`editor.${kind}`, key) }

  /** One editor by its key ('plugin/editor' or 'builtin/x'), or null. */
  editor (key) {
    const b = this.builtins.find((x) => x.key === key)
    if (b) return b
    const [pid, eid] = String(key).split('/')
    const p = this.plugins.get(pid)
    const e = p?.enabled && (!p.manifest.hidden || this.showHidden) ? p.manifest.editors.find((x) => x.id === eid) : null
    return e ? { key, label: e.label, builtin: false, plugin: pid, editor: e, url: p.baseUrl + e.entry } : null
  }

  /** The bakers for a kind, in plugin id order: [{ plugin, baker, url }]. */
  bakersFor (kind) {
    const out = []
    for (const p of this.list()) {
      if (!p.enabled) continue
      for (const b of p.manifest.bakers) if (b.kinds.includes(kind)) out.push({ plugin: p.manifest.id, baker: b, url: p.baseUrl + b.entry })
    }
    return out
  }

  /** Rail pages the plugins bring: [{ plugin, section, url }]. */
  sections () {
    const out = []
    for (const p of this.list()) {
      if (!p.enabled || p.manifest.hidden) continue
      for (const s of p.manifest.sections) out.push({ plugin: p.manifest.id, section: s, url: p.baseUrl + s.entry })
    }
    return out
  }
}

/**
 * The plugins bundled with this build: `${base}index.json` lists their ids,
 * each one's plugin.json is `${base}<id>/plugin.json`. A missing index is no
 * plugins (a plain studio build); a broken plugin is refused, not fatal.
 */
export async function loadBundled (registry, { base, fetchJson }) {
  let index
  try { index = await fetchJson(`${base}index.json`) } catch { return 0 }
  let n = 0
  for (const id of index?.plugins ?? []) {
    try {
      const r = registry.add(await fetchJson(`${base}${id}/plugin.json`), { baseUrl: `${base}${id}/`, source: 'bundled' })
      if (r.ok) n++
    } catch (e) {
      registry.refused.push({ id, source: 'bundled', errors: [`plugin.json did not load: ${e.message ?? e}`] })
    }
  }
  return n
}
