//
// Where the studio is: one section at a time, its address in the hash.
//
import { Router, parseHash, formatHash } from '../src/app/router.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

check(JSON.stringify(parseHash('#/monsters/imp')) === '{"id":"monsters","arg":"imp"}' && parseHash('#/home').arg === null, 'an address is a section and its argument')
check(parseHash('') === null && parseHash('#nope') === null, 'anything else is no address')
check(formatHash('map', 'first floor') === '#/map/first%20floor' && parseHash(formatHash('map', 'first floor')).arg === 'first floor', 'an argument goes through the address and back')

const log = []
const location = { hash: '' }
const r = new Router({ location, onChange: (to, from) => log.push(`${from?.id ?? '-'}>${to.id}`) })
const sec = (id, extra = {}) => r.register({ id, label: id, icon: '', mount: (arg) => log.push(`mount ${id}${arg ? ':' + arg : ''}`), unmount: () => log.push(`unmount ${id}`), ...extra })
sec('home', { rail: false }); sec('maps'); sec('map', { rail: false, parent: 'maps' }); sec('sounds')
check(r.rail.map((s) => s.id).join() === 'maps,sounds', 'the rail lists the sections that ask to be in it')
await r.follow()
check(r.current.id === 'home' && location.hash === '#/home', 'with no address it goes home, and says so in the hash')
await r.go('map', 'first')
check(location.hash === '#/map/first' && log.includes('unmount home') && log.includes('mount map:first'), 'going somewhere unmounts where it was')
const n = log.length
await r.go('map', 'first')
check(log.length === n, 'going where it already is does nothing')
await r.go('nowhere')
check(r.current.id === 'home', 'an unknown section falls back to home')
location.hash = '#/sounds'
await r.follow()
check(r.current.id === 'sounds', 'following the address (a reload, the back button) goes there')
await r.remount()
check(log.slice(-3).join() === 'unmount sounds,mount sounds,sounds>sounds', `a remount draws the same section again (${log.slice(-3).join()})`)
let refused = false
r.sections.get('sounds').leave = () => { refused = true; return false }
await r.go('maps')
check(refused && r.current.id === 'sounds', 'a section may refuse to be left')
let threw = null
try { r.register({ id: 'maps' }) } catch (e) { threw = e.message }
check(/twice/.test(threw ?? ''), 'CONTROL: a section registered twice is refused')

console.log(`router: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
