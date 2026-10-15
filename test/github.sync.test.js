// THE GITHUB SYNC PLUGIN'S ENGINE (plugins/github: github.js, sync.js) against
// a fake GitHub and two fake studios -- two devices sharing one repository.
// A module goes up, comes down on the other device, edits cross both ways,
// edits to different maps merge, edits to the same map are a conflict settled
// either way, and every race (a branch moved under a push, a module saved
// under a write) ends with nobody's work lost.
//
//   node studio/test/github.sync.test.js

import { readFileSync } from 'node:fs'
import { readPack } from '../src/pack.js'
import { recordFromEntries, recordToEntries } from '../src/record.js'
import { GitHub, GitHubError, blobSha, sha1, sha1js, toBase64, fromBase64, isOffline } from '../plugins/github/github.js'
import { syncModule, plan, remoteModules } from '../plugins/github/sync.js'
import { FakeGitHub, FakeStudio, MemStore } from './github_fake.js'

const name = 'github.sync'
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }
const sorted = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x)
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

// ------------------------------------------------------------- the pieces

{
  const bytes = new Uint8Array(100000).map((_, i) => (i * 7919) & 255)
  check(same([...fromBase64(toBase64(bytes))], [...bytes]), 'base64 round-trips 100 KB of binary (past the 32 KB chunk)')
  check(sha1js(bytes) === await sha1(bytes) && sha1js(new Uint8Array(0)) === 'da39a3ee5e6b4b0d3255bfef95601890afd80709', 'the hand-written SHA-1 (for pages with no crypto.subtle) agrees with the platform\'s')
  for (const n of [55, 56, 63, 64, 65]) check(sha1js(bytes.subarray(0, n)) === await sha1(bytes.subarray(0, n)), `...at ${n} bytes, around the block edge`)
  check(await blobSha(new TextEncoder().encode('hello\n')) === 'ce013625030ba8dba906f756967f9e9ca394464a', 'a file\'s sha is git\'s (`git hash-object` of "hello\\n")')
}

{
  const p = plan({ a: '1', b: '2', c: 'x', d: 'y', e: '5' }, { a: '1', b: '9', c: '3', d: 'z', f: '6' }, { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' })
  check(same(p.pull, ['b', 'e']) && same(p.push, ['c', 'f']) && same(p.conflicts.map((x) => x.path), ['d']),
    `three-way: changed on one side takes that side, deletions too, both sides is a conflict (${JSON.stringify(p)})`)
  const k = plan({ d: 'y' }, { d: 'z' }, { d: '4' }, { d: { side: 'remote', remote: 'z' } })
  const stale = plan({ d: 'y' }, { d: 'w' }, { d: '4' }, { d: { side: 'remote', remote: 'z' } })
  check(same(k.pull, ['d']) && stale.conflicts.length === 1, 'a choice settles its conflict, but not when GitHub moved on since it was made')
  check(plan({ a: '1' }, { a: '1' }, {}).pull.length + plan({ a: '1' }, { a: '1' }, {}).push.length === 0, 'the same file on both sides with no base is nothing to do')
}

// ------------------------------------------------------------- two devices

const fake = new FakeGitHub()
const gh = new GitHub({ token: 'tok', repo: 'me/modules', branch: 'main', fetch: fake.fetch })
const A = { studio: new FakeStudio(), store: new MemStore(), device: 'Mac' }
const B = { studio: new FakeStudio(), store: new MemStore(), device: 'Pixel' }
const sync = (dev, id, extra = {}) => syncModule({ id, studio: dev.studio, gh, store: dev.store, device: dev.device, ...extra })

// A real module: the starter, as the studio's record-files gives it.
{
  const pack = await readPack(new Uint8Array(readFileSync(new URL('../src/templates/starter.zip', import.meta.url))))
  const prefix = pack.find((e) => e.path.endsWith('module.studio.json')).path.replace(/module\.studio\.json$/, '')
  const rec = recordFromEntries(pack.filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length), bytes: e.bytes })))
  const files = await recordToEntries(rec)
  A.studio.modules.set(rec.id, { rev: ++A.studio.revs, files: new Map(files.map((f) => [f.path, Buffer.from(f.bytes)])) })
  const r = await sync(A, rec.id)
  const up = fake.read('main', rec.id)
  check(r.result === 'synced' && r.pushed.length === files.length && Object.keys(up).length === files.length,
    `the starter goes up whole: ${files.length} files, binary assets included (${r.result})`)
  const r2 = await sync(B, rec.id, { get: true })
  check(r2.result === 'synced' && same(Object.keys(B.studio.text(rec.id)).sort(), files.map((f) => f.path)) &&
    files.every((f) => Buffer.from(f.bytes).equals(B.studio.modules.get(rec.id).files.get(f.path))),
    'and comes down on the other device byte for byte')
}

const mod = (id, maps) => ({ 'module.studio.json': JSON.stringify({ id }), ...Object.fromEntries(Object.entries(maps).map(([m, v]) => [`maps/${m}.studio.json`, v])) })
A.studio.put('cave', mod('cave', { map01: 'one', map02: 'two' }))
{
  const r = await sync(A, 'cave')
  check(r.result === 'synced' && same(fake.read('main', 'cave'), A.studio.text('cave')), 'a second module goes up beside the first')
  check(fake.log()[0].startsWith('cave: maps/map01.studio.json, maps/map02.studio.json, module.studio.json') && fake.log()[0].includes('on Mac'),
    `one commit, saying what and from where (${JSON.stringify(fake.log()[0])})`)
  const mods = await remoteModules(gh)
  check(same(mods.map((m) => m.id).sort(), ['cave', 'starter']), `the repository lists both modules (${mods.map((m) => m.id)})`)
}

{
  const r = await sync(B, 'cave')
  check(r.result === 'missing-local' && !B.studio.modules.has('cave'), 'a module only on GitHub is not brought unasked')
  await sync(B, 'cave', { get: true })
  check(same(B.studio.text('cave'), A.studio.text('cave')), 'asked, it is')
}

{
  const before = fake.log().length
  const calls = fake.calls.length
  const w = A.studio.writes
  const r = await sync(A, 'cave')
  check(r.result === 'synced' && fake.log().length === before && A.studio.writes === w, 'nothing changed: no commit, no write')
  check(fake.calls.slice(calls).every((c) => !c.includes('recursive')) && fake.calls.length - calls <= 3,
    `...and GitHub is asked only for the branch and the folder's id (${fake.calls.slice(calls).join(', ')})`)
}

// One side edits, the other takes it.
B.studio.edit('cave', { 'maps/map01.studio.json': 'one, from the phone' })
await sync(B, 'cave')
{
  const r = await sync(A, 'cave')
  check(r.result === 'synced' && same(r.pulled, ['maps/map01.studio.json']) && A.studio.text('cave')['maps/map01.studio.json'] === 'one, from the phone',
    'an edit on the phone comes to the Mac')
  const again = await sync(A, 'cave')
  check(again.pushed.length === 0 && again.pulled.length === 0, 'and the Mac does not send it back')
}

// Both edit, different maps: both edits end up everywhere.
A.studio.edit('cave', { 'maps/map02.studio.json': 'two, from the Mac' })
B.studio.edit('cave', { 'maps/map01.studio.json': 'one, phone again', 'maps/map03.studio.json': 'three, new on the phone' })
await sync(A, 'cave')
{
  const r = await sync(B, 'cave')
  check(r.result === 'synced' && same(r.pulled, ['maps/map02.studio.json']) && same(r.pushed.sort(), ['maps/map01.studio.json', 'maps/map03.studio.json']),
    `edits to different maps merge: the phone takes map02 and sends map01 and map03 (${JSON.stringify(r)})`)
  await sync(A, 'cave')
  check(same(A.studio.text('cave'), B.studio.text('cave')) && same(A.studio.text('cave'), fake.read('main', 'cave')) && A.studio.text('cave')['maps/map03.studio.json'] === 'three, new on the phone',
    'and afterwards both devices and GitHub hold the same module')
}

// A deletion travels.
A.studio.edit('cave', { 'maps/map03.studio.json': null })
await sync(A, 'cave')
await sync(B, 'cave')
check(!('maps/map03.studio.json' in B.studio.text('cave')) && !('maps/map03.studio.json' in fake.read('main', 'cave')), 'a map deleted on one device is deleted on GitHub and on the other')

// Both edit the same map: a conflict, settled each way.
A.studio.edit('cave', { 'maps/map01.studio.json': 'mac version' })
B.studio.edit('cave', { 'maps/map01.studio.json': 'phone version', 'maps/map02.studio.json': 'phone map02' })
await sync(A, 'cave')
{
  const r = await sync(B, 'cave')
  check(r.result === 'conflict' && same(r.conflicts.map((c) => c.path), ['maps/map01.studio.json']) && B.studio.text('cave')['maps/map01.studio.json'] === 'phone version',
    'the same map edited on both: a conflict, and nothing of the phone\'s is touched')
  check((await B.store.get('cave')).conflicts.length === 1, 'the conflict is kept for the Sync page')
  check(fake.read('main', 'cave')['maps/map02.studio.json'] !== 'phone map02', 'while it stands, nothing goes up either (the module waits whole)')
  const keep = Object.fromEntries(r.conflicts.map((c) => [c.path, { side: 'remote', remote: c.remote }]))
  const r2 = await sync(B, 'cave', { keep })
  check(r2.result === 'synced' && B.studio.text('cave')['maps/map01.studio.json'] === 'mac version' && fake.read('main', 'cave')['maps/map02.studio.json'] === 'phone map02',
    'kept GitHub\'s: the phone takes the Mac\'s map01, and its own map02 goes up')
}
A.studio.edit('cave', { 'maps/map01.studio.json': 'mac again' })
B.studio.edit('cave', { 'maps/map01.studio.json': 'phone again' })
await sync(A, 'cave')
await sync(B, 'cave')
{
  const c = (await B.store.get('cave')).conflicts
  // GitHub moves on before the choice is used: the choice no longer counts.
  A.studio.edit('cave', { 'maps/map01.studio.json': 'mac a third time' })
  await sync(A, 'cave')
  const r = await sync(B, 'cave', { keep: { [c[0].path]: { side: 'local', remote: c[0].remote } } })
  check(r.result === 'conflict', 'a choice made before GitHub moved on is asked again')
  const r2 = await sync(B, 'cave', { keep: { [r.conflicts[0].path]: { side: 'local', remote: r.conflicts[0].remote } } })
  check(r2.result === 'synced' && fake.read('main', 'cave')['maps/map01.studio.json'] === 'phone again', 'kept mine: the phone\'s map01 goes up over the Mac\'s')
  await sync(A, 'cave')
  check(A.studio.text('cave')['maps/map01.studio.json'] === 'phone again', '...and the Mac takes it (its version is in GitHub\'s history)')
}

// RACES. The branch moves between our commit and our push.
A.studio.edit('cave', { 'maps/map02.studio.json': 'mac, racing' })
fake.beforeMove = (f) => f.writeFiles('main', { 'cave/maps/map04.studio.json': 'pushed by a third device' }, 'cave: third')
{
  const r = await sync(A, 'cave')
  const up = fake.read('main', 'cave')
  check(r.result === 'synced' && up['maps/map02.studio.json'] === 'mac, racing' && up['maps/map04.studio.json'] === 'pushed by a third device' &&
    A.studio.text('cave')['maps/map04.studio.json'] === 'pushed by a third device',
    'a push refused because the branch moved: it pulls the other push in, then pushes again, both kept')
}
// The module is saved while GitHub's files are being written into it.
B.studio.beforeWrite = (s) => s.edit('cave', { 'maps/map05.studio.json': 'typed during the sync' })
{
  const r = await sync(B, 'cave')
  check(r.result === 'synced' && B.studio.text('cave')['maps/map05.studio.json'] === 'typed during the sync' &&
    fake.read('main', 'cave')['maps/map05.studio.json'] === 'typed during the sync' && B.studio.text('cave')['maps/map04.studio.json'] === 'pushed by a third device',
    'a write refused because the module was saved meanwhile: read again, nothing typed is lost, both directions done')
}

// GONE ON ONE SIDE: never read as "delete everything".
{
  A.studio.modules.delete('cave')
  const n = fake.log().length
  const r = await sync(A, 'cave')
  check(r.result === 'missing-local' && fake.log().length === n && Object.keys(fake.read('main', 'cave')).length > 0, 'deleted on this device: GitHub keeps its copy')
  const flat = Object.fromEntries(Object.keys(fake.read('main', 'cave')).map((p) => [`cave/${p}`, null]))
  fake.writeFiles('main', flat, 'removed by hand')
  const r2 = await sync(B, 'cave')
  check(r2.result === 'missing-remote' && Object.keys(B.studio.text('cave')).length > 3, 'removed from GitHub: this device keeps its copy')
  await B.store.put('cave', null)
  const r3 = await sync(B, 'cave')
  check(r3.result === 'synced' && same(fake.read('main', 'cave'), B.studio.text('cave')), 'forgotten and synced again, it goes back up whole')
}

// AN EMPTY REPOSITORY (a new one with no README): its first commit is made.
{
  const empty = new FakeGitHub({ empty: true })
  const g = new GitHub({ token: 'tok', repo: 'me/modules', fetch: empty.fetch })
  const s = new FakeStudio()
  s.put('cave', mod('cave', { map01: 'x' }))
  const r = await syncModule({ id: 'cave', studio: s, gh: g, store: new MemStore() })
  check(r.result === 'synced' && same(empty.read('main', 'cave'), s.text('cave')) && empty.log().includes('Digidream Studio modules'), 'an empty repository gets a README first, then the module')
}
// ANOTHER BRANCH than the default: made from it.
{
  const g = new GitHub({ token: 'tok', repo: 'me/modules', branch: 'studio', fetch: fake.fetch })
  const s = new FakeStudio()
  s.put('side', mod('side', { m: 'y' }))
  const r = await syncModule({ id: 'side', studio: s, gh: g, store: new MemStore() })
  check(r.result === 'synced' && fake.read('studio', 'side').m === undefined && fake.read('studio', 'side')['maps/m.studio.json'] === 'y' && !fake.read('main', 'side')['maps/m.studio.json'],
    'a branch that does not exist yet is made from the default one, and only it gets the module')
}

// ERRORS say what is wrong.
{
  const bad = new GitHub({ token: 'nope', repo: 'me/modules', fetch: fake.fetch })
  let e = null
  try { await bad.user() } catch (x) { e = x }
  check(e instanceof GitHubError && e.status === 401 && /token/.test(e.message), `a bad token: ${e?.message}`)
  fake.offline = true
  e = null
  try { await gh.head() } catch (x) { e = x }
  fake.offline = false
  check(isOffline(e) && !isOffline(new GitHubError(500, 'x')), 'no network is told apart from GitHub saying no')
}

console.log(`${name}: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
