//
// The studio's tab icon (src/app/icon.png) is the Digidream logo at 64 px, made
// by branding/icons.mjs from branding/digidream-logo.png: a copy, because the
// studio is served from its own folder. A logo changed without making it again
// is a stale icon. Fix: node branding/icons.mjs png 64 studio/src/app/icon.png
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { square } from '../../branding/icons.mjs'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

const have = readFileSync(join(ROOT, 'studio', 'src', 'app', 'icon.png'))
check(Buffer.compare(have, Buffer.from(square(64))) === 0, 'src/app/icon.png is the logo at 64 px (node branding/icons.mjs png 64 studio/src/app/icon.png)')
check(/rel="icon"[^>]*href="\.\/src\/app\/icon\.png"/.test(readFileSync(join(ROOT, 'studio', 'index.html'), 'utf8')), 'and index.html names it as the tab icon')

console.log(`icon: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
