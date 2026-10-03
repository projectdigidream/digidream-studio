//
// The Screens window's files: what the studio writes for a module's HUD, touch
// controls and panel templates is what the client reads (docs/UI_LAYOUT.md).
//
// Two things have to hold. The files: index.json names a default and each
// map's own layout by the level's name, and every layout parses with no error
// in the client's own parser. And the dragging: dropping an element re-anchors
// it to the part of the screen it landed in WITHOUT moving it, which is only
// true if anchorFor is the exact inverse of the client's `place`.
//
// ORACLE: engine/client/src/render/layout.js (parseLayout, place, uiScale,
// layoutFileFor) -- the code the game draws with.
//
import { uiFiles, newLayout, anchorFor, mapFile } from '../src/ui_emit.js'
import { DEFAULT_LAYOUT, ANCHORS, parseLayout, place, uiScale, layoutFileFor } from '../../engine/client/src/render/layout.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

// --- nothing until the module has screens of its own -------------------------------------
check(uiFiles({ id: 'm' }, [{ name: 'first' }]).length === 0, 'a module that never set its screens writes no file, so the client draws its default')

// --- the files ---------------------------------------------------------------------------
const mod = { id: 'm', ui: newLayout(DEFAULT_LAYOUT) }
mod.ui.hud.push({ id: 'ammo', type: 'number', anchor: 'br', x: -12, y: -12, bind: 'hud.ammo', format: '{value} / {max}' })
mod.ui.touch.buttons = [{ id: 'dash', hidden: true }]
mod.ui.panels = { shop: { anchor: 'c', w: 320, modal: true, slots: [{ widget: 2, anchor: 'tl', x: 12, y: 40, w: 140 }] } }
const boss = { name: 'boss', ui: newLayout(mod.ui) }
boss.ui.hud.push({ id: 'boss_bar', type: 'bar', anchor: 't', x: 0, y: 12, w: 300, h: 10, bind: 'hud.boss_hp', max: 'hud.boss_hp_max' })
const files = uiFiles(mod, [{ name: 'first' }, boss])
const byPath = new Map(files.map((f) => [f.path, JSON.parse(f.bytes)]))
const index = byPath.get('assets/ui/index.json')
check(index && index.default === 'hud.json' && index.maps?.boss === mapFile('boss') && !index.maps.first, `the index names the default and the one map with its own (${JSON.stringify(index)})`)
check(layoutFileFor(index, 'boss') === 'map_boss.json' && layoutFileFor(index, 'first') === 'hud.json', 'and the client picks each level\'s file by its name')
for (const [path, json] of byPath) {
  if (path.endsWith('index.json')) continue
  const r = parseLayout(json)
  check(r.ok && r.warnings.length === 0, `${path} parses in the client with nothing said (${[...r.errors, ...r.warnings].join('; ')})`)
}
const parsed = parseLayout(byPath.get('assets/ui/hud.json')).layout
check(parsed.hud.some((e) => e.id === 'ammo') && parsed.panels.shop?.slots?.[0]?.widget === 2, 'the elements and templates are there as written')
check(parsed.touch.buttons.find((b) => b.id === 'dash')?.hidden === true && parsed.touch.buttons.find((b) => b.id === 'jump')?.label === 'JUMP',
      'a button named in the layout is merged over the engine\'s, and one not named keeps its default')
check(parseLayout(byPath.get('assets/ui/map_boss.json')).layout.hud.some((e) => e.id === 'boss_bar'), 'the map\'s own layout is complete, with its addition')
const broken = newLayout(DEFAULT_LAYOUT)
broken.hud.push({ id: 'x', type: 'text', anchor: 'middle' })
check(!parseLayout(broken).ok, 'CONTROL: the parser does refuse a bad anchor, so the clean parses above mean something')

// --- re-anchoring is the inverse of place --------------------------------------------------
const sizes = [{ width: 844, height: 390, insets: { left: 47, right: 47, bottom: 21 } }, { width: 390, height: 844, insets: { top: 47, bottom: 34 } }, { width: 1280, height: 720, insets: {} }]
const layout = { ...newLayout(DEFAULT_LAYOUT), scale: { reference: 390, min: 0.5, max: 3 } }
let worst = 0
let anchorsSeen = new Set()
for (const dev of sizes) {
  const s = uiScale(layout, dev.width, dev.height)
  for (let i = 0; i < 60; i++) {
    const rect = { left: (i * 97) % (dev.width - 80), top: (i * 53) % (dev.height - 40), width: 40 + (i % 5) * 20, height: 20 + (i % 3) * 10 }
    const a = anchorFor(rect, dev.width, dev.height, s, dev.insets)
    anchorsSeen.add(a.anchor)
    const back = place({ ...a, w: rect.width / s, h: rect.height / s }, layout, dev.width, dev.height, dev.insets)
    worst = Math.max(worst, Math.abs(back.left - rect.left), Math.abs(back.top - rect.top))
  }
}
check(worst <= uiScale(layout, 1280, 720), `a dropped element lands where it was let go, to within the one-unit rounding (worst ${worst.toFixed(2)} px)`)
check(ANCHORS.every((a) => anchorsSeen.has(a)), `and every one of the nine anchors is reachable by dragging (${[...anchorsSeen].sort().join(' ')})`)
const tr = anchorFor({ left: 700, top: 10, width: 100, height: 30 }, 844, 390, 1, {})
check(tr.anchor === 'tr' && tr.x === -44 && tr.y === 10, `the top right corner is anchored there (${JSON.stringify(tr)})`)

console.log(`screens: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
