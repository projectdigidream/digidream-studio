//
// The debug overlay (docs/MODULES.md `debug off`): what module.txt says for the
// module, and for a play-test that chooses either way -- read by the server.
//
// ORACLE: dnp-server, which reports a debug line it cannot read.
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { newModule, moduleTxt } from '../src/module_emit.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }
const line = (t) => t.split('\n').find((l) => l.startsWith('debug')) ?? null

const on = newModule('d', 'd')
const off = { ...newModule('d', 'd'), debug: false }
check(line(moduleTxt(on)) === null, 'a module that shows the overlay (the default) says nothing')
check(line(moduleTxt(off)) === 'debug off', 'one that hides it says debug off')
check(line(moduleTxt(on, [], { debug: false })) === 'debug off' && line(moduleTxt(off, [], { debug: true })) === 'debug on',
      'a play-test choosing either way says so, over what the module says')
check(line(moduleTxt(off, [], { debug: undefined })) === 'debug off', 'CONTROL: a play-test following the module says the module\'s')

const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
if (!existsSync(SERVER)) console.log('debug: no server build -- the server check is skipped')
else {
  const serve = async (txt, port) => {
    const dir = mkdtempSync(join(tmpdir(), 'dnp-debug-'))
    mkdirSync(join(dir, 'maps'), { recursive: true })
    writeFileSync(join(dir, 'module.txt'), txt)
    const map = ['arm64', 'x86_64', 'native'].map((a) => join(ROOT, 'engine', 'build', a, 'test.dnpm')).find(existsSync)
    const srv = spawn(SERVER, ['--port', String(port), '--module', dir, ...(map ? ['--map', map] : [])], { cwd: join(ROOT, 'engine') })
    let log = ''
    srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
    await new Promise((r) => setTimeout(r, 1500))
    srv.kill()
    return log
  }
  const good = await serve(moduleTxt(off) + moduleTxt(on, [], { debug: true }).split('\n').filter((l) => l.startsWith('debug')).join('\n') + '\n', 34731)
  check(!/module\.txt: debug/.test(good.log ?? good) && /listening/.test(good), `the server reads debug off and debug on without a word (${good.split('\n').filter((l) => /debug/.test(l)).join(' | ') || 'none said'})`)
  const bad = await serve('name d\nid d\ndebug maybe\n', 34732)
  check(/module\.txt: debug is on or off, not 'maybe'/.test(bad), `CONTROL: one it cannot read it reports (${bad.split('\n').filter((l) => /debug/.test(l)).join('').replace(/^.*module\.txt: /, '')})`)
}

console.log(`debug: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
