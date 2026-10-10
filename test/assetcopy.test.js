//
// DUPLICATE AND EXPORT (src/assetcopy.js): a copied texture or sprite takes
// every file it is made of under the new name -- picture, sheet, project --
// and a copied sheet's manifest names the copy, as the sprite baker names
// what it writes after the key; what can leave the studio is each file there is.
//
// House style: standalone, prints ok/FAIL, ends with a count.
//
import { duplicateTexture, duplicateSprite, exportsOf, copyName, cleanName } from '../src/assetcopy.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++ }

const rec = {
  module: { textures: { STONE: { w: 64, h: 64, cutout: true } }, sprites: { HERO: { worldHeight: 2, animations: ['idle'] } }, baked: { 'sources/sprites/HERO.tsprite': { baker: 'tsprite', version: '1' } } },
  assets: { 'textures/STONE.png': 'png-bytes', 'sources/textures/STONE.texproj.json': '{}', 'sprites/HERO.png': 'sheet-png', 'sprites/HERO.json': '{"sprite":"HERO","image":"HERO.png","frames":{}}', 'sources/sprites/HERO.tsprite': 'proj' }
}
check(copyName('STONE', (n) => n === 'STONE_2') === 'STONE_3' && copyName('X'.repeat(24), () => false).length === 24 && cleanName('my stone!') === 'MYSTONE', 'a copy is offered the first free NAME_n, within 24 letters')
check(duplicateTexture(rec, 'STONE', 'STONE_2') && rec.assets['textures/STONE_2.png'] === 'png-bytes' && rec.assets['sources/textures/STONE_2.texproj.json'] === '{}' && rec.module.textures.STONE_2.cutout === true,
      'a texture copies its picture, its qPainter project and its settings')
rec.module.textures.STONE_2.cutout = false
check(rec.module.textures.STONE.cutout === true, 'and the copy is its own: changing it leaves the original')
check(!duplicateTexture(rec, 'STONE', 'STONE_2') && !duplicateTexture(rec, 'NONE', 'X'), 'CONTROL: onto a name that is taken, or from one that is not there, nothing is copied')
const text = duplicateSprite(rec, 'HERO', 'HERO_2', rec.assets['sprites/HERO.json'])
const j = JSON.parse(text)
check(j.sprite === 'HERO_2' && j.image === 'HERO_2.png' && rec.assets['sprites/HERO_2.png'] === 'sheet-png' && rec.assets['sources/sprites/HERO_2.tsprite'] === 'proj' && rec.module.sprites.HERO_2 && rec.module.baked['sources/sprites/HERO_2.tsprite'],
      'a sprite copies its sheet (its manifest naming the copy), its ThreeSprite project and its bake record')
const tx = exportsOf(rec, 'texture', 'STONE').map((x) => x.file)
const sx = exportsOf(rec, 'sprite', 'HERO').map((x) => x.file)
check(tx.join() === 'STONE.png,STONE.texproj.json' && sx.join() === 'HERO.tsprite,HERO-sheet.zip', `each file there is can leave the studio (${tx.join(' ')} | ${sx.join(' ')})`)
delete rec.assets['sources/textures/STONE.texproj.json']
check(exportsOf(rec, 'texture', 'STONE').length === 1, 'CONTROL: a texture with no project exports its picture alone')

console.log(`\nassetcopy: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
