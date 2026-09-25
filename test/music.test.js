//
// A map's music is filed under its content hash, and the studio's key for a
// baked map must be the number the client computes when it looks the track
// up -- or every map plays nothing, quietly.
//
// ORACLE: the runtime's own loader (core.loadMap) reading the hash out of a
// baked map, as the client does; the map is modules/starter's committed bake.
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { musicKey, musicIndex } from '../src/module_emit.js'
import { ROOT, requireOracles, readBaked } from './oracle.js'

requireOracles('music', { mapc: false, core: true })

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const dnpm = readFileSync(join(ROOT, 'modules', 'starter', 'maps', 'first.dnpm'))
const { map } = await readBaked(dnpm)
const clientKey = map.hash.toString(16)
check(musicKey(dnpm) === clientKey, `the key is the hash the client computes (${musicKey(dnpm)} vs ${clientKey})`)
check(/^[0-9a-f]{1,16}$/.test(clientKey) && clientKey === clientKey.toLowerCase(), 'lowercase hex, no padding: the manifest\'s spelling')
const flipped = Buffer.from(dnpm)
flipped[flipped.length - 3] ^= 0x10
check(musicKey(flipped) !== clientKey, 'CONTROL: a different trailer is a different key')
let threw = null
try { musicKey(new Uint8Array(3)) } catch (e) { threw = e.message }
check(threw !== null, 'CONTROL: something too short to be a map is refused')

// --- the index -------------------------------------------------------------------
const docA = { name: 'first', music: { default: 'calm', fight: 'loud' } }
const docB = { name: 'second', music: {} }
const docC = { name: 'third', music: { fight: 'loud' } }
const r = musicIndex([{ doc: docA, dnpm }, { doc: docB, dnpm: flipped }, { doc: docC, dnpm: flipped }], new Set(['calm']))
check(Object.keys(r.index).length === 2, `maps with cues are filed, one without is not (${Object.keys(r.index).length})`)
check(r.index[clientKey]?.default === 'calm.mstk' && r.index[clientKey]?.fight === 'loud.mstk', 'each cue names its track file')
check(r.warnings.some((w) => w.map === 'first' && /'loud'.*not in the module/.test(w.msg)), 'CONTROL: a cue naming a track the module lacks is said')
check(r.warnings.some((w) => w.map === 'third' && /no cue called 'default'/.test(w.msg)), 'CONTROL: a map with cues but no default is said')
check(musicIndex([{ doc: docA, dnpm }], null).warnings.length === 0, 'with the tracks unknown (the workstation tool), nothing is guessed')

console.log(`music: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
