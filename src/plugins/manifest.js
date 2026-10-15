//
// A PLUGIN, as its plugin.json says it is (docs/PLUGINS.md, Plugins).
//
//   { "id": "threesprite", "name": "ThreeSprite", "version": "1.0.0",
//     "protocol": 1, "suite": ">=0.1.0",
//     "kinds":    [{ "id": "file:tsprite", "label": "sprite", "ext": [".tsprite"] }],
//     "editors":  [{ "id": "main", "entry": "host.html", "kinds": ["file:tsprite"], "label": "ThreeSprite", "priority": 10 }],
//     "bakers":   [{ "id": "tsprite", "entry": "bake.js", "version": "1", "kinds": ["file:tsprite"] }],
//     "sections": [{ "id": "packager", "entry": "index.html", "label": "Package", "icon": "📦" }],
//     "services": [{ "id": "sync", "entry": "service.html" }],
//     "permissions": ["module-write", "background", "net:github.com"] }
//
// SERVICES are pages that run hidden from boot to the end, never unmounted:
// work that must go on whatever page is shown (a sync). PERMISSIONS say what
// a plugin needs beyond editing what it is handed: `module-write` (replace a
// whole module, any module), `background` (run a service), `net:<host>`
// (talk to that host -- declared, and shown when it is installed). A bundled
// plugin is trusted with what it declares; an installed one is asked about.
//
// Three things a plugin can bring, each optional: EDITORS (a page that edits
// one document and hands it back), BAKERS (a function turning a source into
// what the game loads, no DOM) and SECTIONS (a page in the rail). A document's
// KIND says what it is -- a file the module keeps (`file:...`) or a record in
// the module document (`record:...`) -- and is how an editor is matched to it.
//
// Pure: no DOM, no fetch. manifest.test.js holds it.
//

/** The protocol this studio speaks to editors (protocol.js, sdk.js). */
export const PROTOCOL = 1

const ID = /^[a-z0-9_][a-z0-9_-]{0,47}$/
const KIND = /^(file|record):[a-z0-9_-]{1,32}$/
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
/** The permissions a plugin may ask for. */
export const PERMISSIONS = ['module-write', 'background']
const NET = /^net:[a-z0-9-]+(\.[a-z0-9-]+)+$/
export const validPermission = (x) => PERMISSIONS.includes(x) || NET.test(String(x))

/** What a permission lets a plugin do, in a sentence for the install question. */
export function describePermission (x) {
  if (x === 'module-write') return 'replace whole modules (any module here), as a sync does'
  if (x === 'background') return 'keep running in the background, whatever page is open'
  if (NET.test(String(x))) return `talk to ${x.slice(4)}`
  return x
}

/** '1.2.3' -> [1,2,3], or null. */
export function parseVersion (v) {
  const m = SEMVER.exec(String(v ?? ''))
  return m ? [+m[1], +m[2], +m[3]] : null
}

/** <0, 0, >0 like a sort comparator. Unparseable versions sort first. */
export function compareVersions (a, b) {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/**
 * Does `version` satisfy `range`? The forms a plugin may write: '>=1.2.3',
 * '1.2.3' (exactly), '^1.2.3' (same major, not older), '*' or nothing (any).
 */
export function satisfies (version, range) {
  const r = String(range ?? '*').trim()
  if (r === '' || r === '*') return true
  const m = /^(>=|\^)?\s*(\d+\.\d+\.\d+)$/.exec(r)
  if (!m) return false
  const c = compareVersions(version, m[2])
  if (!m[1]) return c === 0
  if (m[1] === '>=') return c >= 0
  return c >= 0 && parseVersion(version)?.[0] === parseVersion(m[2])[0]
}

/** A path inside the plugin's own folder: relative, no '..', no scheme. */
export function safeEntry (p) {
  if (typeof p !== 'string' || !p || p.length > 256) return false
  if (p.startsWith('/') || p.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(p)) return false
  return !p.split('/').some((s) => s === '' || s === '.' || s === '..')
}

/**
 * Check a manifest. `knownKinds`: the kinds the studio itself has (kinds.js);
 * an editor may name those or the plugin's own. Returns { ok, errors, plugin }
 * where `plugin` is the manifest with defaults filled in.
 */
export function validateManifest (json, { suiteVersion = '0.0.0', protocol = PROTOCOL, knownKinds = [] } = {}) {
  const errors = []
  const bad = (msg) => errors.push(msg)
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, errors: ['plugin.json is not an object'], plugin: null }
  const p = {
    id: json.id, name: json.name ?? json.id, version: json.version, protocol: json.protocol, suite: json.suite ?? '*',
    author: json.author ?? '', description: json.description ?? '', hidden: !!json.hidden,
    kinds: [], editors: [], bakers: [], sections: [], services: [], permissions: []
  }
  if (!ID.test(String(p.id ?? ''))) bad(`id "${p.id}" must be lowercase letters, digits, _ or -`)
  if (typeof p.name !== 'string' || !p.name) bad('name is missing')
  if (!parseVersion(p.version)) bad(`version "${p.version}" is not major.minor.patch`)
  if (!Number.isInteger(p.protocol)) bad('protocol is missing (the editor protocol version it speaks)')
  else if (p.protocol > protocol) bad(`it speaks editor protocol ${p.protocol}; this studio speaks ${protocol}`)
  if (!satisfies(suiteVersion, p.suite)) bad(`it wants studio ${p.suite}; this is ${suiteVersion}`)

  const own = new Set()
  for (const [i, k] of (json.kinds ?? []).entries()) {
    if (!KIND.test(String(k?.id ?? ''))) { bad(`kinds[${i}]: "${k?.id}" is not file:<name> or record:<name>`); continue }
    own.add(k.id)
    p.kinds.push({ id: k.id, label: k.label ?? k.id.split(':')[1], ext: [].concat(k.ext ?? []) })
  }
  const kindOk = (k) => own.has(k) || knownKinds.includes(k)
  const ids = (list, what) => {
    const seen = new Set()
    return list.map((x, i) => {
      const id = String(x?.id ?? `${what}${i}`)
      if (seen.has(id)) bad(`${what}s: "${id}" twice`)
      seen.add(id)
      return id
    })
  }
  const editorIds = ids(json.editors ?? [], 'editor')
  for (const [i, e] of (json.editors ?? []).entries()) {
    if (!safeEntry(e?.entry)) { bad(`editors[${i}]: entry "${e?.entry}" must be a relative path inside the plugin`); continue }
    const kinds = [].concat(e.kinds ?? [])
    if (!kinds.length) bad(`editors[${i}]: edits no kinds`)
    for (const k of kinds) if (!kindOk(k)) bad(`editors[${i}]: kind "${k}" is neither the studio's nor declared in "kinds"`)
    p.editors.push({ id: editorIds[i], entry: e.entry, kinds, label: e.label ?? p.name, priority: Number.isFinite(e.priority) ? e.priority : 0 })
  }
  const bakerIds = ids(json.bakers ?? [], 'baker')
  for (const [i, b] of (json.bakers ?? []).entries()) {
    if (!safeEntry(b?.entry)) { bad(`bakers[${i}]: entry "${b?.entry}" must be a relative path inside the plugin`); continue }
    if (typeof b.version !== 'string' || !b.version) bad(`bakers[${i}]: version is missing (it keys the bake cache)`)
    const kinds = [].concat(b.kinds ?? [])
    if (!kinds.length) bad(`bakers[${i}]: bakes no kinds`)
    for (const k of kinds) if (!kindOk(k)) bad(`bakers[${i}]: kind "${k}" is neither the studio's nor declared in "kinds"`)
    p.bakers.push({ id: bakerIds[i], entry: b.entry, version: b.version, kinds })
  }
  const sectionIds = ids(json.sections ?? [], 'section')
  for (const [i, s] of (json.sections ?? []).entries()) {
    if (!safeEntry(s?.entry)) { bad(`sections[${i}]: entry "${s?.entry}" must be a relative path inside the plugin`); continue }
    if (!ID.test(sectionIds[i])) bad(`sections[${i}]: id "${sectionIds[i]}" must be lowercase letters, digits, _ or -`)
    p.sections.push({ id: sectionIds[i], entry: s.entry, label: s.label ?? p.name, icon: s.icon ?? '◈' })
  }
  for (const [i, x] of [].concat(json.permissions ?? []).entries()) {
    if (!validPermission(x)) bad(`permissions[${i}]: "${x}" is not one of ${PERMISSIONS.join(', ')} or net:<host>`)
    else if (!p.permissions.includes(x)) p.permissions.push(x)
  }
  const serviceIds = ids(json.services ?? [], 'service')
  for (const [i, s] of (json.services ?? []).entries()) {
    if (!safeEntry(s?.entry)) { bad(`services[${i}]: entry "${s?.entry}" must be a relative path inside the plugin`); continue }
    if (!ID.test(serviceIds[i])) bad(`services[${i}]: id "${serviceIds[i]}" must be lowercase letters, digits, _ or -`)
    p.services.push({ id: serviceIds[i], entry: s.entry })
  }
  if (p.services.length && !p.permissions.includes('background')) bad('it has services but does not ask for the "background" permission')
  if (!p.editors.length && !p.bakers.length && !p.sections.length && !p.services.length) bad('it brings no editors, bakers, sections or services')
  return { ok: errors.length === 0, errors, plugin: errors.length ? null : p }
}
