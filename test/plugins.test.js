//
// The plugin system without a browser: what a plugin.json may say, which
// editor opens what, the protocol both ends speak, and undo that brings back
// the module's files along with its documents (docs/PLUGINS.md).
//
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateManifest, satisfies, compareVersions, safeEntry, PROTOCOL } from '../src/plugins/manifest.js'
import { PluginRegistry, loadBundled } from '../src/plugins/registry.js'
import { Port, handshake, sameBytes, sendSkin } from '../src/plugins/protocol.js'
import { serveEditor } from '../src/plugins/sdk.js'
import { SUITE_KINDS } from '../src/plugins/kinds.js'
import { editArg, parseEditArg } from '../src/plugins/frame.js'
import { History } from '../src/history.js'

const HERE = dirname(fileURLToPath(import.meta.url))
let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

// --- versions and paths -------------------------------------------------------------
check(compareVersions('1.2.10', '1.2.9') > 0 && compareVersions('1.0.0', '1.0.0') === 0 && compareVersions('0.9.9', '1.0.0') < 0, 'versions compare numerically, not as text')
check(satisfies('0.1.0', '>=0.1.0') && !satisfies('0.0.9', '>=0.1.0') && satisfies('1.4.0', '^1.2.0') && !satisfies('2.0.0', '^1.2.0') && satisfies('3.0.0', '*'), 'the ranges a plugin may ask for')
check(!satisfies('1.0.0', '~1.0.0'), 'a range it cannot read is not satisfied (refused, not guessed)')
// A studio with a fourth number (a rebuild: 0.3.3.1) still satisfies its plugins' ranges.
check(satisfies('0.3.3.1', '>=0.3.1') && satisfies('0.3.3.1', '^0.3.0') && satisfies('0.3.3.1', '>=0.3.3') && !satisfies('0.3.3.1', '>=0.3.4') && compareVersions('0.3.3.1', '0.3.3') > 0,
      'a four-part studio version is read, and compares above its three-part base')
check(!satisfies('0.3.3.1.7', '>=0.1.0'), 'CONTROL: five parts is not a version')
check(safeEntry('host.html') && safeEntry('dist/index.html') && !safeEntry('../x.html') && !safeEntry('/abs.html') && !safeEntry('https://evil/x.js') && !safeEntry('a//b'), 'an entry stays inside the plugin')

// --- manifests --------------------------------------------------------------------------
const good = { id: 'sprite-ed', name: 'Sprites', version: '1.0.0', protocol: 1, suite: '>=0.1.0', editors: [{ entry: 'host.html', kinds: ['file:tsprite'] }] }
const v = validateManifest(good, { suiteVersion: '0.1.0', knownKinds: SUITE_KINDS })
check(v.ok && v.plugin.editors[0].id === 'editor0' && v.plugin.editors[0].priority === 0, 'a minimal plugin is accepted, with defaults filled in')
const errs = (m, o = {}) => validateManifest(m, { suiteVersion: '0.1.0', knownKinds: SUITE_KINDS, ...o }).errors.join(' | ')
check(/protocol 2/.test(errs({ ...good, protocol: 2 })), 'a plugin speaking a newer protocol is refused, saying so')
check(/wants (suite|studio) >=9.0.0/.test(errs({ ...good, suite: '>=9.0.0' })), 'a plugin for a newer studio is refused, saying so')
check(/neither the studio's nor declared/.test(errs({ ...good, editors: [{ entry: 'h.html', kinds: ['file:psd'] }] })), 'an editor for a kind nobody declared is refused')
check(validateManifest({ ...good, kinds: [{ id: 'file:psd' }], editors: [{ entry: 'h.html', kinds: ['file:psd'] }] }, { suiteVersion: '0.1.0', knownKinds: SUITE_KINDS }).ok, 'a plugin may declare a kind of its own and edit it')
check(/relative path/.test(errs({ ...good, editors: [{ entry: '../../studio/src/main.js', kinds: ['file:tsprite'] }] })), 'an entry outside the plugin is refused')
check(/no editors, bakers, sections or services/.test(errs({ ...good, editors: [] })), 'a plugin that brings nothing is refused')
// Services and permissions (the sync plugin's needs).
{
  const sync = { id: 'sync', name: 'Sync', version: '1.0.0', protocol: 1, services: [{ id: 'sync', entry: 'service.html' }], sections: [{ id: 'sync', entry: 'index.html' }], permissions: ['module-write', 'background', 'net:github.com', 'net:api.github.com'] }
  const r = validateManifest(sync, { suiteVersion: '0.1.0', knownKinds: SUITE_KINDS })
  check(r.ok && r.plugin.services[0].entry === 'service.html' && r.plugin.permissions.join() === 'module-write,background,net:github.com,net:api.github.com', `a service and its permissions are accepted (${r.errors})`)
  check(/background/.test(errs({ ...sync, permissions: ['module-write'] })), 'a service without the "background" permission is refused')
  check(/permissions\[0\]/.test(errs({ ...good, permissions: ['everything'] })) && /permissions\[0\]/.test(errs({ ...good, permissions: ['net:*'] })), 'an unknown permission, or a host that is not one, is refused')
  check(validateManifest({ ...good, services: [] }, { suiteVersion: '0.1.0', knownKinds: SUITE_KINDS }).plugin.permissions.length === 0, 'CONTROL: a plugin asking for nothing has no permissions')
  const reg = new PluginRegistry({ suiteVersion: '0.1.0', knownKinds: SUITE_KINDS })
  reg.add(sync, { baseUrl: '/p/sync/' }); reg.add(good, { baseUrl: '/p/sprite-ed/' })
  check(reg.can('sync', 'module-write') && !reg.can('sprite-ed', 'module-write') && !reg.can('nobody', 'module-write'), 'a plugin may do only what it declared')
  check(reg.services().length === 1 && reg.services()[0].url === '/p/sync/service.html', 'the registry lists the services to start')
  reg.setEnabled('sync', false)
  check(!reg.can('sync', 'module-write') && reg.services().length === 0, 'a plugin switched off may do nothing and runs no service')
}
check(/version/.test(errs({ ...good, bakers: [{ entry: 'b.js', kinds: ['file:tsprite'] }] })), 'a baker without a version is refused (the version keys the bake cache)')
check(/twice/.test(errs({ ...good, editors: [{ id: 'a', entry: 'a.html', kinds: ['file:tsprite'] }, { id: 'a', entry: 'b.html', kinds: ['file:tsprite'] }] })), 'two editors with one id are refused')
check(/lowercase/.test(errs({ ...good, id: 'Bad Id' })), 'an id is lowercase letters, digits, _ and -')

// --- the registry -------------------------------------------------------------------------
const store = new Map()
const prefs = { get: (k) => store.get(k) ?? null, set: (k, val) => store.set(k, val) }
const reg = new PluginRegistry({ suiteVersion: '0.1.0', knownKinds: SUITE_KINDS, prefs })
reg.addBuiltin({ key: 'scripts', label: 'Scripts page', kinds: ['record:script'], open: () => 'builtin' })
check(reg.add({ ...good, id: 'code', editors: [{ id: 'lua', entry: 'i.html', kinds: ['record:script'], priority: 5 }] }, { baseUrl: '/p/code/' }).ok, 'a plugin is added')
reg.add({ ...good, id: 'other', editors: [{ id: 'x', entry: 'x.html', kinds: ['record:script'], priority: 9 }] }, { baseUrl: '/p/other/' })
check(reg.editorsFor('record:script').map((e) => e.key).join() === 'builtin/scripts,other/x,code/lua', 'the studio\'s own editor first, then plugins by priority')
reg.setDefaultEditor('record:script', 'code/lua')
check(reg.editorsFor('record:script')[0].key === 'code/lua', 'the editor chosen for a kind comes first after that')
check(reg.editor('code/lua').url === '/p/code/i.html' && reg.editor('builtin/scripts').builtin, 'an editor by its key, with the URL it is served at')
reg.setEnabled('code', false)
check(!reg.editor('code/lua') && reg.editorsFor('record:script').length === 2, 'a switched-off plugin edits nothing')
reg.setEnabled('code', true)
check(!reg.add({ ...good, id: 'code', version: '0.9.0', editors: [{ entry: 'i.html', kinds: ['record:script'] }] }, { baseUrl: '/i/code/', source: 'installed' }).ok, 'an older copy of a plugin already here is not taken')
check(reg.add({ ...good, id: 'code', version: '2.0.0', editors: [{ id: 'lua', entry: 'i.html', kinds: ['record:script'] }] }, { baseUrl: '/i/code/', source: 'installed' }).ok && reg.editor('code/lua').url === '/i/code/i.html', 'a newer one replaces it (installed over bundled)')
reg.add({ ...good, id: 'hid', hidden: true, editors: [{ id: 'h', entry: 'h.html', kinds: ['record:mob'] }] }, { baseUrl: '/p/hid/' })
check(!reg.hasPluginEditor('record:mob') && !reg.editor('hid/h'), 'a hidden plugin (a test editor) is not offered')
reg.showHidden = true
check(reg.hasPluginEditor('record:mob') && reg.editor('hid/h'), '...unless asked for')
reg.add({ ...good, id: 'pk', editors: [], sections: [{ id: 'package', entry: 'index.html', label: 'Package' }], bakers: [{ id: 't', entry: 'bake.js', version: '3', kinds: ['file:tsprite'] }] }, { baseUrl: '/p/pk/' })
check(reg.sections().some((s) => s.section.id === 'package' && s.url === '/p/pk/index.html') && reg.bakersFor('file:tsprite')[0].baker.version === '3', 'sections and bakers are listed with their URLs')

// The bundled index, read the way the studio reads it.
const bundled = new PluginRegistry({ suiteVersion: JSON.parse(JSON.stringify(readFileSync(join(HERE, '..', 'VERSION'), 'utf8').trim())), knownKinds: SUITE_KINDS })
const fetchJson = async (u) => JSON.parse(readFileSync(join(HERE, '..', u.replace(/^\/studio\//, '')), 'utf8'))
const n = await loadBundled(bundled, { base: '/studio/plugins/', fetchJson })
check(n >= 1 && bundled.plugins.has('_echo') && bundled.refused.length === 0, `every bundled plugin loads (${n}, refused: ${bundled.refused.map((r) => r.id + ': ' + r.errors).join('; ')})`)
check(await loadBundled(new PluginRegistry(), { base: '/none/', fetchJson: async () => { throw new Error('404') } }) === 0, 'no index is no plugins, not an error')

// --- the route ---------------------------------------------------------------------------------
check(JSON.stringify(parseEditArg(editArg('code/lua', 'record:script', 'boss.lua'))) === '{"editorKey":"code/lua","kind":"record:script","key":"boss.lua"}', 'an edit route names the editor, the kind and the document')
check(parseEditArg('nope') === null, 'anything else is no edit route')

// --- the protocol, both ends --------------------------------------------------------------------
{
  const ch = new MessageChannel()
  const host = new Port(ch.port1)
  let doc = ''
  const said = []
  host.on('*', (m) => said.push(m.t))
  const ready = new Promise((resolve) => host.on('ready', resolve))
  const api = serveEditor(ch.port2, {
    onInit: ({ payload }) => { doc = payload },
    onSave: () => doc + ' edited'
  })
  const r = await ready
  check(r.v === PROTOCOL && r.proto === PROTOCOL, 'the editor says ready, with the protocol it speaks')
  host.send('init', { kind: 'record:script', key: 'a.lua', name: 'a.lua', payload: 'print(1)' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  check(doc === 'print(1)' && api.key === 'a.lua', 'init hands the editor its document')
  const c = await host.request('request-save')
  check(c.t === 'content' && c.payload === 'print(1) edited', 'request-save is answered with the document')
  api.dirty(true)
  api.edit('typed')
  await new Promise((resolve) => setTimeout(resolve, 20))
  check(said.includes('dirty') && said.includes('edit'), 'the editor tells the studio it changed')
  host.on('query', (m) => host.send('query-result', { reqId: m.reqId, result: m.what === 'sounds' ? ['door'] : null }))
  check(JSON.stringify(await api.query('sounds')) === '["door"]', 'the editor can ask the studio something, and is answered')
  const bytes = new Uint8Array([1, 2, 3])
  const api2Ch = new MessageChannel()
  const host2 = new Port(api2Ch.port1)
  const ready2 = new Promise((resolve) => host2.on('ready', resolve))
  let got = null
  serveEditor(api2Ch.port2, { onInit: ({ payload }) => { got = payload }, onSave: () => { throw new Error('the editor broke') } })
  await ready2
  host2.send('init', { payload: bytes })
  await new Promise((resolve) => setTimeout(resolve, 20))
  check(got instanceof Uint8Array && sameBytes(got, bytes) && bytes.length === 3, 'bytes arrive as bytes, and the sender keeps its own copy')
  const failed = await host2.request('request-save')
  check(failed.error === 'the editor broke', 'an editor that fails to save says why, instead of handing back nothing')
  host.close(); host2.close()
}

// THE SKIN (docs/STUDIO_SKINS.md, phase 5): an editor that gives onSkin asks
// for it in its ready's caps, and is sent the studio's bundle, mode and pointer
// after init and again on a change; one that does not ask is never sent it.
{
  const listeners = new Set()
  const view = { mode: 'dark', pointer: 'touch', compiled: { id: 'claude', css: {} } }
  const S = { skin: { id: 'claude', get view () { return view }, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn) } } }
  const change = (m) => { view.mode = m; for (const fn of listeners) fn(view) }
  const ch = new MessageChannel()
  const host = new Port(ch.port1)
  const ready = new Promise((resolve) => host.on('ready', resolve))
  const got = []
  serveEditor(ch.port2, { onSkin: (bundle, mode, pointer) => got.push(`${bundle.id}/${mode}/${pointer}`) })
  const r = await ready
  check((r.caps ?? []).includes('skin'), 'an editor with onSkin asks for the skin in its ready')
  const off = sendSkin(S, host, r)
  await new Promise((resolve) => setTimeout(resolve, 20))
  check(got.join() === 'claude/dark/touch', `it is sent the skin at once (${got.join()})`)
  change('dark')                                    // a font arriving: nothing new to say
  change('light')
  await new Promise((resolve) => setTimeout(resolve, 20))
  check(got.join() === 'claude/dark/touch,claude/light/touch', `and again when the mode changes, once (${got.join()})`)
  off(); change('dark')
  await new Promise((resolve) => setTimeout(resolve, 20))
  check(got.length === 2, 'and no more once it has closed')
  // CONTROL: an editor that does not ask.
  const ch2 = new MessageChannel()
  const host2 = new Port(ch2.port1)
  const ready2 = new Promise((resolve) => host2.on('ready', resolve))
  const said2 = []
  host2.on('*', (m) => said2.push(m.t))
  serveEditor(ch2.port2, {})
  const r2 = await ready2
  check(!(r2.caps ?? []).includes('skin') && sendSkin(S, host2, r2) === null, 'CONTROL: an editor without onSkin does not ask, and is not sent it')
  host.close(); host2.close()
}

// The handshake: offers repeat until a ready comes back on one of them.
{
  let offers = 0
  const target = {
    postMessage (msg, origin, ports) {
      offers++
      if (offers === 3) serveEditor(ports[0], {})       // the page started listening late
    }
  }
  const hs = handshake(target, { origin: 'x', every: 10, timeout: 2000 })
  const { ready } = await hs.done
  check(ready.t === 'ready' && offers >= 3, `an editor that starts late still gets a channel (offered ${offers} times)`)
  const silent = handshake({ postMessage () {} }, { origin: 'x', every: 10, timeout: 60 })
  let refused = null
  try { await silent.done } catch (e) { refused = e.message }
  check(refused === 'the editor did not start', 'an editor that never answers is given up on, saying so')
}

// --- every plugin's copy of the SDK is the studio's ---------------------------------------------
{
  const { readdirSync, existsSync } = await import('node:fs')
  const sdk = readFileSync(join(HERE, '..', 'src', 'plugins', 'sdk.js'), 'utf8')
  for (const id of readdirSync(join(HERE, '..', 'plugins'))) {
    const copy = join(HERE, '..', 'plugins', id, 'suite-sdk.js')
    if (existsSync(copy)) check(readFileSync(copy, 'utf8') === sdk, `plugins/${id}/suite-sdk.js is the suite's sdk.js (vendor_plugins.mjs copies it; copy it again)`)
  }
  // Every editor that has a shim wears the studio's skin, with the studio's
  // own helper beside it (suite-skin.js, a byte copy of src/plugins/skinwear.js).
  const wear = readFileSync(join(HERE, '..', 'src', 'plugins', 'skinwear.js'), 'utf8')
  for (const id of readdirSync(join(HERE, '..', 'plugins'))) {
    const dir = join(HERE, '..', 'plugins', id)
    const shim = ['suite-shim.js', 'code.js'].map((f) => join(dir, f)).find((f) => existsSync(f))
    if (!shim) continue
    check(existsSync(join(dir, 'suite-skin.js')) && readFileSync(join(dir, 'suite-skin.js'), 'utf8') === wear, `plugins/${id}/suite-skin.js is the studio's skinwear.js`)
    check(/onSkin/.test(readFileSync(shim, 'utf8')), `plugins/${id} asks for the studio's skin (onSkin in its shim)`)
  }
}
// wearSkin, on a page of its own: the editor's variables take the skin's tokens.
{
  const { wearSkin, tokenVar } = await import('../src/plugins/skinwear.js')
  const els = new Map()
  const doc = {
    documentElement: { dataset: {} },
    getElementById: (id) => els.get(id) ?? null,
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: (e) => els.set(e.id, e) }
  }
  const bundle = { css: { 'dark/touch': ':where(x){--dnp-color-bg-app:#0b0d12}' }, tokens: { 'dark/touch': { 'color.bg.app': '#0b0d12' }, 'light/touch': { 'color.bg.app': '#f4f5f8' } } }
  wearSkin(bundle, 'light', 'touch', { vars: { '--bg': 'color.bg.app', '--gap': '4px' }, mono: ['pre'], doc })
  const map = els.get('dnp-skin-map')?.textContent ?? ''
  check(doc.documentElement.dataset.dnpMode === 'light' && els.get('dnp-skin-css')?.textContent.includes('--dnp-color-bg-app'), 'wearSkin puts the bundle on the page and marks the mode')
  check(map.includes(`--bg:${tokenVar('color.bg.app')} !important`) && map.includes('--gap:4px !important') && map.includes('color-scheme:light') && /pre\{font-family:var\(--dnp-font-mono\)/.test(map),
        `and maps the editor's variables onto the tokens (${map.slice(0, 160)})`)
}

// --- the Code plugin's block check ------------------------------------------------------------
{
  const { check: lua } = await import('../plugins/code/code.js')
  check(lua('function f()\n  if x then print(1) end\nend\nfor i = 1, 3 do end\nrepeat until true\n').length === 0, 'Code: well-formed Lua has no problems')
  check(lua('function f()\n  if x then\nend\n')[0]?.msg === '"function" is never closed', 'Code: a block left open is found, where it opened')
  check(lua('x = "open\n')[0]?.msg === 'a string that never closes' && lua('end')[0]?.msg === '"end" with nothing open', 'Code: an open string, a stray end')
  check(lua('--[[ a\nlong comment ]] local s = [==[ ]] ]==]').length === 0, 'Code: long comments and long strings are skipped whole')
}

// --- undo brings back the files --------------------------------------------------------------
{
  const before = new Blob(['old picture'])
  const h = new History({ module: { id: 'm' }, docs: {}, assets: { 'textures/A.png': before } })
  h.commit({ module: { id: 'm' }, docs: {}, assets: { 'textures/A.png': new Blob(['new picture']) } })
  const back = h.undo()
  check(back.assets['textures/A.png'] instanceof Blob && await back.assets['textures/A.png'].text() === 'old picture', 'an undo puts back the picture an editor replaced')
  const fwd = h.redo()
  check(await fwd.assets['textures/A.png'].text() === 'new picture', 'and a redo the new one')
}

console.log(`plugins: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
