//
// The studio's placeholder pictures (src/placeholders.js): what a recipe's
// missile and weapon are drawn with until they have art of their own.
//
// ORACLE: the studio's own PNG decoder (src/bake/png.js, which reads what the
// engine and the browsers read), on the bytes; and the module the helpers
// change, read back. Controls: a missile that has a prop, and a weapon that
// has pictures, are left as they were.
//
import { orbPng, gunPngs, GUN_SIZE, giveMissileLook, giveWeaponLook } from '../src/placeholders.js'
import { decodePng } from '../src/bake/png.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }
const alpha = (d, x, y) => d.rgba[(y * d.w + x) * 4 + 3]

const orb = decodePng(orbPng())
check(orb.w === 24 && orb.h === 24 && alpha(orb, 12, 12) > 200 && alpha(orb, 0, 0) === 0, `a glowing dot: solid in the middle, clear at the corners (${alpha(orb, 12, 12)}, ${alpha(orb, 0, 0)})`)
check(Buffer.from(orbPng()).equals(Buffer.from(orbPng())), 'the same bytes every time')
const [rest, fire] = gunPngs().map(decodePng)
check(rest.w === GUN_SIZE[0] && rest.h === GUN_SIZE[1] && alpha(rest, 36, 70) === 255, 'a gun at the bottom of its picture')
check(alpha(rest, 36, 8) === 0 && alpha(fire, 36, 8) > 100, `the firing picture has a flash over the muzzle, the resting one none (${alpha(rest, 36, 8)}, ${alpha(fire, 36, 8)})`)

// The helpers, on a studio stand-in: the module, its record's pictures.
globalThis.URL.createObjectURL ??= () => 'blob:x'
const S = { module: { props: [{ id: 1000, name: 'spirit' }], mobs: { missiles: { bolt: { speed: '16' }, glob: { speed: '9', prop: 'spirit' } }, mobs: {} } }, rec: { assets: {} }, spriteUrls: new Map() }
S.propNames = () => S.module.props.map((p) => p.name)
check(giveMissileLook(S, 'bolt') === 'bolt', 'a missile with nothing to be drawn as is given a prop of its name')
const bolt = S.module.props.find((p) => p.name === 'bolt')
check(bolt && bolt.solid === false && bolt.art?.kind === 'sprite' && !!S.rec.assets[`sprites/${bolt.art.states[0].frames[0]}.png`], `walk-through, drawn as a picture the module now has (${JSON.stringify(bolt?.art)})`)
check(giveMissileLook(S, 'bolt') === null && S.module.props.filter((p) => p.name === 'bolt').length === 1, 'asked again, it is not given a second')
check(giveMissileLook(S, 'glob') === null && S.module.props.length === 2, 'CONTROL: a missile drawn as a prop the module has is left as it is')
const W = { ...S, module: { ...S.module, viewmodels: { weapons: { old: { ready: [['OLDA', 4]], fire: [] } } } } }
check(giveWeaponLook(W, 'gun') === true, 'a weapon with no pictures is given the gun')
const vm = W.module.viewmodels.weapons.gun
check(vm.ready.length === 1 && vm.fire.length === 2 && vm.fire[0][0] !== vm.ready[0][0] && vm.fire[1][0] === vm.ready[0][0], `at rest, and firing for a moment then at rest (${JSON.stringify(vm)})`)
check(giveWeaponLook(W, 'old') === false && W.module.viewmodels.weapons.old.ready[0][0] === 'OLDA', 'CONTROL: a weapon with pictures of its own keeps them')

console.log(`placeholders: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
