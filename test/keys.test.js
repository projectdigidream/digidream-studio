//
// The module's own keys (src/keys_emit.js; docs/KEYS.md): the module.txt lines
// the studio writes are what the server reads, and a graph answering one by
// name loads where a key nobody has is refused -- as the studio says first.
//
// ORACLE: dnp-server, reading the module the studio emits.
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { keyLines, keyProblems, keyLabel, buttonNames, cleanKeyName, cleanLabel, ENGINE_BUTTON_NAMES } from '../src/keys_emit.js'
import { newModule, emitModule, moduleTxt, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { graphProblems } from '../src/graphs_emit.js'
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { bake } from '../src/bake.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

const GV = JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'graph_vocab.json'), 'utf8'))
const TV = JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'trigger_vocab.json'), 'utf8'))

// --- the lines ---------------------------------------------------------------------------
const module = { ...newModule('keyed', 'keyed'), keys: [{ name: 'reload', code: 'KeyT', touch: 'RELOAD' }, { name: 'map', code: 'KeyM' }, { name: 'bag', code: 'KeyI', touch: 'BAG' }] }
check(keyLines(module).join('|') === 'key reload KeyT touch RELOAD|key map KeyM|key bag KeyI touch BAG', `one line a key, in order, touch only with a label (${keyLines(module).join(' | ')})`)
check(/^controls fps\nkey reload KeyT/m.test(moduleTxt({ ...module, controls: 'fps' })) && !/^key /m.test(moduleTxt(newModule('p', 'p'))), 'module.txt carries them after the controls; a module with none says nothing')
check(keyLabel('KeyR') === 'R' && keyLabel('Digit4') === '4' && keyLabel('ShiftLeft') === 'Shift' && keyLabel('F5') === 'F5', 'a code as a person says it')
check(cleanKeyName('Open Map!') === 'open_map' && cleanLabel('my bag') === 'MY_BAG', 'a typed name and label made into ones the server takes')

// --- what is said -------------------------------------------------------------------------
const said = (keys) => keyProblems({ keys }).map((p) => `${p.level}:${p.msg}`)
check(said(module.keys).length === 0, 'CONTROL: three good keys, nothing said')
check(said([{ name: 'Reload', code: 'KeyT' }]).some((p) => /^error:.*a name is 1 to 16/.test(p)), 'a name the server refuses')
check(said([{ name: 'x' }]).some((p) => /^error:.*needs a key/.test(p)), 'a key with no key')
check(said([{ name: 'x', code: 'KeyT', touch: 'MUCH_TOO_LONG_LABEL' }]).some((p) => /touch label is 1 to 12/.test(p)), 'a label too long')
check(said(Array.from({ length: 9 }, (_, i) => ({ name: `k${i}`, code: `F${i + 1 > 9 ? 10 : i + 1}` }))).some((p) => /8 of its own at most/.test(p)), 'a ninth key')
check(said([{ name: 'jump', code: 'KeyT' }]).some((p) => /^warn:.*engine has a button called jump/.test(p)), 'a key named like an engine button is warned')
check(said([{ name: 'x', code: 'KeyE' }]).some((p) => /^warn:.*engine's key for use/.test(p)) && said([{ name: 'a', code: 'KeyT' }, { name: 'b', code: 'KeyT' }]).some((p) => /^warn:.*both fire/.test(p)),
      'a key on the engine\'s own, or two on one, is warned')
check(buttonNames(module).join() === [...ENGINE_BUTTON_NAMES, 'reload', 'map', 'bag'].join(), 'a button field may name the engine\'s buttons and then the module\'s keys')

// --- a graph answering one ----------------------------------------------------------------
const answers = (button) => ({ vars: {}, nodes: [
  { id: 'press', type: 'when_button_pressed', button, pos: { x: 0, y: 0 } },
  { id: 'say', type: 'action', a: 'log', text: 'reloading', pos: { x: 260, y: 0 } }], links: [['press.then', 'say.in']] })
check(graphProblems(answers('reload'), GV, TV, { buttons: buttonNames(module) }).length === 0 && graphProblems(answers('jump'), GV, TV, { buttons: buttonNames(module) }).length === 0,
      'a graph answering the module\'s key, or the engine\'s jump, is clean')
check(graphProblems(answers('nonsense'), GV, TV, { buttons: buttonNames(module) }).some((p) => /no button or key called nonsense/.test(p)), 'CONTROL: one answering a key nobody has is named')

// --- the server reads them -----------------------------------------------------------------
const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
if (!existsSync(SERVER)) console.log('keys: no server build -- the server checks are skipped')
else {
  const runtime = {}
  for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  const serve = async (mod, graph, port, extraTxt = '') => {
    const doc = newDoc('room'); addSector(doc, rect(0, 0, 16, 8), {}); addSpawn(doc, 'start', 2, 2)
    if (graph) doc.graphs = { keys: graph }
    const r = await emitModule(mod, [doc], { bake, runtime })
    const dir = mkdtempSync(join(tmpdir(), 'dnp-keys-'))
    for (const f of r.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes)) }
    if (extraTxt) writeFileSync(join(dir, 'module.txt'), readFileSync(join(dir, 'module.txt'), 'utf8') + extraTxt)
    const srv = spawn(SERVER, ['--port', String(port), '--module', dir], { cwd: join(ROOT, 'engine') })
    let log = ''
    srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
    await new Promise((res) => setTimeout(res, 2000))
    srv.kill()
    return { ok: r.ok, log }
  }
  const good = await serve(module, answers('reload'), 34721)
  check(good.ok && !/module\.txt: .*key/.test(good.log) && /\[graphs\] room\.keys\.graph\.json: 2 nodes, 1 links/.test(good.log),
        `the server reads every key line without a word, and loads a graph answering the module's key (${good.log.split('\n').filter((l) => /key|graph\.json/.test(l)).slice(0, 2).join(' | ').replace(/\S*\[graphs\] /, '')})`)
  const bad = await serve(module, answers('nonsense'), 34722, 'key Bad! KeyZ\n')
  check(/module\.txt: `key Bad! KeyZ\s*` -- want/.test(bad.log), `CONTROL: a line it cannot read it reports (${bad.log.split('\n').filter((l) => /module\.txt: `key/.test(l)).slice(0, 1).join('').replace(/^.*module.txt: /, '').slice(0, 90)})`)
  check(!/room\.keys\.graph\.json: 2 nodes/.test(bad.log) && /nonsense/.test(bad.log), `and refuses a graph answering a key nobody has, as the studio says (${bad.log.split('\n').filter((l) => /nonsense/.test(l)).slice(0, 1).join('').replace(/^.*\[graphs\] /, '')})`)
}

console.log(`keys: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
