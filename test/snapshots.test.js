//
// Snapshots (src/snapshots.js): what is kept, how one is told apart from the
// module now, and how its maps compare. The store and the page are the page
// test's.
//
import { prune, digest, when, compareMaps, missingAssets, MAX_RECENT, DAYS } from '../src/snapshots.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

// --- what is kept ---------------------------------------------------------------------
const now = new Date(2026, 9, 6, 15, 0).getTime()
const H = 3600000
const D = 86400000
// Every hour for three weeks: far more than is kept.
const many = Array.from({ length: 24 * 21 }, (_, i) => ({ key: `m@${i}`, at: now - i * H }))
const { keep, drop } = prune(many, now)
const days = new Set(keep.map((s) => new Date(s.at).toDateString()))
check(keep.slice(0, MAX_RECENT).every((s, i) => s.at === now - i * H), `the newest ${MAX_RECENT} are kept (${keep.length} kept of ${many.length})`)
check(keep.length <= MAX_RECENT + DAYS + 1 && days.size >= DAYS, `beyond them, one a day for ${DAYS} days (${days.size} days in ${keep.length})`)
check(keep.every((s) => now - s.at <= DAYS * D + D) && drop.length === many.length - keep.length, 'nothing older than that, and the rest dropped')
const oneDay = keep.slice(MAX_RECENT).filter((s) => new Date(s.at).toDateString() === new Date(now - 5 * D).toDateString())
check(oneDay.length === 1 && new Date(oneDay[0].at).getHours() === 0, `a day's kept snapshot is its first (${oneDay.map((s) => new Date(s.at).getHours())})`)
check(prune([{ at: now }, { at: now - H }], now).keep.length === 2, 'CONTROL: a few are all kept')

// --- telling one apart -----------------------------------------------------------------
const mod = { id: 'm', name: 'M' }
const docs = { a: { name: 'a', order: ['s1'] }, b: { name: 'b', order: [] } }
check(digest(mod, docs) === digest(structuredClone(mod), structuredClone(docs)), 'the same module gives the same fingerprint')
check(digest(mod, { ...docs, b: { name: 'b', order: ['x'] } }) !== digest(mod, docs), 'CONTROL: a changed map, another')

// --- how its maps compare ------------------------------------------------------------------
const cmp = compareMaps(docs, { a: docs.a, b: { name: 'b', order: ['changed'] }, c: { name: 'c' } })
check(cmp.map((m) => `${m.name}:${m.state}`).join() === 'a:same,b:changed,c:new', `each map: the same, changed since, or made since (${cmp.map((m) => `${m.name}:${m.state}`)})`)
check(compareMaps(docs, { a: docs.a }).find((m) => m.name === 'b').state === 'gone', 'or deleted since')
check(missingAssets({ assets: ['textures/A.png', 'sounds/x.sfxproj'] }, { 'textures/A.png': 1 }).join() === 'sounds/x.sfxproj', 'a restore names the files it lists that are gone')

// --- said for a person ---------------------------------------------------------------------
check(when(now - 30000, now) === 'just now' && when(now - 12 * 60000, now) === '12 min ago' && /^today \d\d:\d\d$/.test(when(now - 3 * H, now)) &&
      /^yesterday /.test(when(now - D, now)) && /^\d+ \w{3} \d\d:\d\d$/.test(when(now - 5 * D, now)), `when (${[30000, 12 * 60000, 3 * H, D, 5 * D].map((d) => when(now - d, now)).join(' | ')})`)

console.log(`snapshots: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
