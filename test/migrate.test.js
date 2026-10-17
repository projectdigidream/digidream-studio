//
// Modules made by an earlier studio, brought up to date as they open
// (src/migrate.js): here, the starter's old script, which charged every swing
// twice, replaced word for word -- and a script the author changed, kept.
//
import { migrateModule, OLD_STARTER_LUA, STARTER_LUA } from '../src/migrate.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

const rec = (script) => ({ module: { id: 'm', version: 99, scripts: { 'starter.lua': script }, sounds: { packs: [] }, metamap: {} }, docs: {}, assets: {} })

const old = rec(OLD_STARTER_LUA)
const did = migrateModule(old)
check(old.module.scripts['starter.lua'] === STARTER_LUA && !/function on_attack/.test(STARTER_LUA), 'the starter\'s old script is replaced by the one with no on_attack of its own')
check(did.some((d) => /charges every swing twice/.test(d)), `and the update says so (${did.join('; ')})`)
const mine = OLD_STARTER_LUA.replace('10, attacker', '25, attacker')
const kept = rec(mine)
migrateModule(kept)
check(kept.module.scripts['starter.lua'] === mine, 'CONTROL: a script the author changed is theirs and kept')
const none = rec(undefined)
delete none.module.scripts
migrateModule(none)
check(!none.module.scripts, 'and a module with no scripts is given none')

console.log(`migrate: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
