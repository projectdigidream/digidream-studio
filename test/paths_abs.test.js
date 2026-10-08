// The studio is served at /studio/, and wherever else a shell puts it, so
// nothing in src/ may name an absolute /studio/ path: every URL of its own
// comes from src/base.js. A '/studio/' literal would load the wrong copy, or
// nothing, once the studio is served somewhere else.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
let checks = 0, failures = 0
const check = (ok, msg) => { checks++; if (!ok) { failures++; console.log('FAIL', msg) } }

function walk (dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(js|mjs|html)$/.test(n)) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        check(!/['"`]\/studio\//.test(code), `${p.slice(SRC.length + 1)}:${i + 1} names /studio/: ${line.trim()}`)
      })
    }
  }
}
walk(SRC)
const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8')
check(!/['"]\/studio\//.test(html), 'index.html names /studio/')
console.log(`paths_abs: ${checks} checks, ${failures} failures`)
process.exit(failures ? 1 : 0)
