//
// A map's thumbnail fits its rooms in the picture, north up, centred; framed by
// a metamap cell, every map is at the cell's scale.
//
import { thumbTransform } from '../src/thumbs.js'
import { newDoc, addSector } from '../src/doc.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const doc = newDoc('t')
addSector(doc, [{ x: -10, y: -2 }, { x: 30, y: -2 }, { x: 30, y: 8 }, { x: -10, y: 8 }])
const t = thumbTransform(doc, 160, 100, 4)
const X = (x) => t.ox + t.k * x
const Y = (y) => t.oy - t.k * y
check(Math.abs(X(-10) - 4) < 1e-9 && Math.abs(X(30) - 156) < 1e-9, `the wide way fills the width, less the margin (${X(-10)}..${X(30)})`)
check(Y(8) < Y(-2) && Math.abs((Y(8) + Y(-2)) / 2 - 50) < 1e-9, 'north is up, and the short way is centred')
check(thumbTransform(newDoc('empty'), 160, 100) === null, 'a map with no rooms has no picture')
const cell = thumbTransform(doc, 160, 160, 4, [0, 0, 32, 32])
check(cell.k === 5 && cell.ox === 0 && cell.oy === 160, `framed by a 32-unit cell, a unit is 5 px wherever the rooms are (${JSON.stringify(cell)})`)

console.log(`thumbs: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
