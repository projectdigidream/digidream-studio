//
// Sound packs merged into the one bank the engine plays.
//
// ORACLE: DigidreamSound's own loader (sound/tool/dist/dsound.mjs, WebSfx
// loadBankJson) -- the same code the game's sound worklet runs. A merged bank
// that parses as JSON is not enough: wrong keys parse and play silence.
//
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mergeBanks, bankNames, packId, packPath } from '../src/soundpacks.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const doom = JSON.parse(readFileSync(join(ROOT, 'modules', 'doom2', 'assets', 'sounds', 'bank.sfxproj'), 'utf8'))
// Two packs cut from DOOM's: weapons, and monsters plus one weapon sound under
// the same name -- a collision -- and a bus of the same name set differently.
const weapons = { ...doom, name: 'weapons', sounds: doom.sounds.filter((s) => s.name.startsWith('weapon.')) }
const dup = structuredClone(doom.sounds.find((s) => s.name.startsWith('weapon.')))
dup.gainDb = (dup.gainDb ?? 0) - 6
const monsters = { ...doom, name: 'monsters', buses: doom.buses.map((b, i) => (i === 0 ? { ...b, gainDb: (b.gainDb ?? 0) + 3 } : b)),
                   sounds: [...doom.sounds.filter((s) => s.name.startsWith('monster.')), dup] }

const r = mergeBanks([{ id: 'weapons', json: weapons }, { id: 'monsters', json: monsters }])
const names = bankNames(r.bank)
check(names.length === weapons.sounds.length + monsters.sounds.length - 1, `every sound of both packs, the duplicate once (${names.length})`)
check(r.collisions.length === 1 && r.collisions[0].name === dup.name && r.collisions[0].kept === 'weapons' && r.collisions[0].dropped[0] === 'monsters',
      `a name in two packs keeps the higher pack's and is listed (${JSON.stringify(r.collisions)})`)
check(r.bank.sounds.find((s) => s.name === dup.name).gainDb === weapons.sounds.find((s) => s.name === dup.name).gainDb, 'and the kept sound is the higher pack\'s own')
check(r.origin[dup.name] === 'weapons' && r.origin[monsters.sounds[0].name] === 'monsters', 'each sound knows its pack')
check(r.warnings.some((w) => /bus '.*' differs in monsters/.test(w)), `a bus set differently by two packs keeps the first and says so (${r.warnings.join('; ')})`)
const swapped = mergeBanks([{ id: 'monsters', json: monsters }, { id: 'weapons', json: weapons }])
check(swapped.collisions[0].kept === 'monsters', 'CONTROL: put the other pack first and it is the one kept')
check(mergeBanks([{ id: 'weapons', json: weapons, enabled: false }, { id: 'monsters', json: monsters }]).collisions.length === 0, 'a pack switched off takes no part')
check(mergeBanks([]).bank === null, 'no packs, no bank')
check(packId('My Pack.sfxproj') === 'my-pack' && packId('pack', ['pack']) === 'pack-2' && packPath('x') === 'sources/sounds/x.sfxproj', 'pack ids and where a pack is kept')

const DS = join(ROOT, 'sound', 'tool', 'dist', 'dsound.mjs')
if (!existsSync(DS)) {
  console.log('soundpacks: no sound engine build (sound/tool/dist/dsound.mjs) -- the loader check is skipped')
} else {
  const createSfx = (await import(DS)).default
  const mod = await createSfx()
  const load = (bank) => { const s = new mod.WebSfx(); const rep = JSON.parse(s.loadBankJson(JSON.stringify(bank))); const n = rep.ok ? s.soundCount() : 0; s.delete?.(); return { rep, n } }
  const merged = load(r.bank)
  check(merged.rep.ok && merged.n === names.length, `the sound engine loads the merged bank, every sound in it (${merged.n} of ${names.length}; ${JSON.stringify(merged.rep.errors ?? []).slice(0, 120)})`)
  check(!(merged.rep.warnings ?? []).some((w) => /unknown bus/.test(w.text)), 'and every sound finds its bus')
  // CONTROL: the two packs simply concatenated -- what the merge exists to
  // avoid -- are refused by the engine, for the name they share.
  const naive = { ...r.bank, sounds: [...weapons.sounds, ...monsters.sounds] }
  const refused = load(naive)
  check(!refused.rep.ok && (refused.rep.errors ?? []).some((e) => /duplicate name/.test(e.text)), `CONTROL: the packs simply concatenated are refused, for the duplicate (${JSON.stringify(refused.rep.errors ?? []).slice(0, 100)})`)
}

console.log(`soundpacks: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
