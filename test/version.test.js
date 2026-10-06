//
// The studio's version is said in one place (studio/VERSION) and mirrored in
// src/version.js for the browser: the two must agree, and be major.minor.patch.
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STUDIO_VERSION } from '../src/version.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

const file = readFileSync(join(ROOT, 'studio', 'VERSION'), 'utf8').trim()
check(/^\d+\.\d+\.\d+$/.test(file), `studio/VERSION is major.minor.patch (${file})`)
check(STUDIO_VERSION === file, `src/version.js says the same as studio/VERSION (${STUDIO_VERSION} vs ${file})`)

console.log(`version: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
