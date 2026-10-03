//
// The studio, in a real browser: boots, draws a room, bakes it, places a
// thing, applies a preset, exports a pack.
//
// OPT-IN, because it needs Chrome and puppeteer-core, and a dev server:
//
//   DNP_HTTP_PORT=8093 node tools/devserver.js --module doom2 &
//   DNP_STUDIO_PAGE_TEST=1 STUDIO_URL=http://localhost:8093/studio/ \
//   NODE_PATH=<dir with puppeteer-core>/node_modules node studio/test/page.test.js
//
// Skips loudly otherwise. It drives the page through pointer events on the
// canvas and reads the document back through `window.__studio`, so what it
// checks is what a finger would get.
//
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const name = 'page'
if (!process.env.DNP_STUDIO_PAGE_TEST) {
  console.log(`${name}: skipped (set DNP_STUDIO_PAGE_TEST=1 with a dev server running)`)
  console.log(`${name}: 0 checks, 0 failures (SKIPPED)`)
  process.exit(0)
}
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(CHROME)) { console.log(`${name}: skipped (no Chrome at ${CHROME})`); process.exit(0) }
let puppeteer
try { puppeteer = createRequire(import.meta.url)('puppeteer-core') } catch {
  try { puppeteer = (await import('puppeteer-core')).default } catch { console.log(`${name}: skipped (no puppeteer-core; set NODE_PATH)`); process.exit(0) }
}
const URL_ = process.env.STUDIO_URL ?? 'http://localhost:8093/studio/'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
await page.setViewport({ width: 1000, height: 700 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
// Resource failures are recorded from the response hook below, with their
// URL; the console's version of the same event names nothing.
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })
page.on('response', (r) => { if (r.status() === 404 && !/favicon/.test(r.url())) errors.push(`404 ${r.url()}`) })
await page.goto(URL_, { waitUntil: 'networkidle0' })
try {
  await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, { timeout: 60000 })
} catch (e) {
  console.log('  boot did not finish:', await page.evaluate(() => document.getElementById('bootmsg')?.textContent), errors.slice(0, 5))
}
check(await page.evaluate(() => document.getElementById('boot')?.hidden === true), 'the studio boots')
check(errors.length === 0, `no page errors during boot (${errors.slice(0, 3).join(' | ')})`)

// THE STUDIO OPENS ON THE MODULE: its home, with a rail of its sections; the
// map editor is one of them, entered from a map.
{
  const home = await page.evaluate(() => ({ route: window.__studio.route(), hash: location.hash,
    rail: [...document.querySelectorAll('.sd-rail [data-section]')].map((b) => b.dataset.section),
    maps: document.querySelectorAll('.sd-page [data-map]').length, tiles: document.querySelectorAll('.sd-page .sd-tile').length }))
  check(home.route === 'home' && home.hash === '#/home', `the studio opens on the module's home (${home.route}, ${home.hash})`)
  check(['maps', 'monsters', 'player', 'weapons', 'sounds', 'settings'].every((x) => home.rail.includes(x)) && home.maps >= 1 && home.tiles >= 8,
        `with a rail of the module's sections and its maps (${home.rail.join(' ')})`)
  await page.evaluate(() => document.querySelector('.sd-page [data-map]').click())
  await page.waitForFunction(() => window.__studio.route() === 'map', { timeout: 5000 }).catch(() => {})
  const map = await page.evaluate(() => ({ route: window.__studio.route(), page: document.querySelector('.sd-page').hidden, lit: document.querySelector('.sd-rail [data-on="1"]')?.dataset.section }))
  check(map.route === 'map' && map.page && map.lit === 'maps', `tapping a map opens the map editor, under Maps (${JSON.stringify(map)})`)
  // Each map on the home has a thumbnail of its rooms.
  const thumb = await page.evaluate(async () => {
    await window.__studio.go('maps'); await window.__studio.go('home')
    await new Promise((r) => setTimeout(r, 300))
    const c = document.querySelector('.sd-page .sd-map canvas.sd-thumb')
    if (!c) return null
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++
    await window.__studio.go('map')
    return { w: c.width, lit }
  })
  check(thumb && thumb.w > 0 && thumb.lit > 50, `a map on the home shows a thumbnail of its rooms (${JSON.stringify(thumb)})`)
}

const state = () => page.evaluate(() => {
  const S = window.__studio
  return { sectors: S.doc.order.length, tool: S.tool, status: S.ui.status.textContent, level: S.ui.status.dataset.level,
           entities: S.doc.entities.length, triggers: S.doc.triggers.length, ok: S.preview.last.ok }
})
await page.waitForFunction(() => window.__studio?.preview?.last?.ok === true, { timeout: 30000 }).catch(() => {})
let s = await state()
check(s.sectors === 1 && s.ok, `a fresh module starts with one room, baked (${JSON.stringify(s)})`)

// Frame a known piece of the world, so taps can be aimed in engine units:
// the starter room spans x -8..8, y -6..6, and these rooms go east of it.
await page.evaluate(() => { const S = window.__studio; S.viewport.lookAt(8, 0, 0); S.viewport.viewHeight = 40; S.viewport.resize() })
const at = (x, y) => page.evaluate(([x, y]) => window.__studio.viewport.toScreen(x, y, 0), [x, y])
const tapAt = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); await new Promise((r) => setTimeout(r, 60)) }

// Draw a room by tapping four corners and closing on the first.
await page.keyboard.press('2')
s = await state()
check(s.tool === 'room', 'key 2 picks the room tool')
await tapAt(12, -4); await tapAt(20, -4); await tapAt(20, 4); await tapAt(12, 4); await tapAt(12, -4)
await page.waitForFunction(() => window.__studio.doc.order.length === 2, { timeout: 5000 }).catch(() => {})
s = await state()
check(s.sectors === 2, `tapping four corners and the first again makes a room (${s.sectors} sectors)`)
await page.waitForFunction(() => window.__studio.preview.busy === false && window.__studio.preview.last.ok, { timeout: 15000 }).catch(() => {})
s = await state()
check(s.ok, `the new room bakes (${s.status})`)

// Drag a rectangle room.
await page.keyboard.press('Escape')
await page.keyboard.press('2')
{
  const a = await at(12, -14); const b = await at(20, -8)
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up()
}
await page.waitForFunction(() => window.__studio.doc.order.length === 3, { timeout: 5000 }).catch(() => {})
s = await state()
check(s.sectors === 3, `dragging a rectangle makes a room (${s.sectors} sectors)`)

// Undo removes it; redo brings it back.
await page.keyboard.down('Meta'); await page.keyboard.press('z'); await page.keyboard.up('Meta')
s = await state()
check(s.sectors === 2, `undo removes the last room (${s.sectors})`)
await page.keyboard.down('Meta'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Meta')
s = await state()
check(s.sectors === 3, `redo brings it back (${s.sectors})`)

// Drag a corner of the tapped room: the picture follows through the core's
// staged edit (no bake), and the release bakes.
await page.keyboard.press('1')
await tapAt(16, 0)
s = await state()
const selected = await page.evaluate(() => window.__studio.selection)
check(selected?.kind === 'sector', `tapping inside a room selects it (${JSON.stringify(selected)})`)
{
  // The room's sheet slides up over the corner about to be dragged; put it
  // away first, as a finger would.
  await page.evaluate(() => window.__studio.ui.hideSheet())
  await new Promise((r) => setTimeout(r, 220))
  const a = await at(20, 4); const b = await at(22, 4)
  const before = await page.evaluate(() => window.__studio.preview.staged)
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  for (let i = 1; i <= 6; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 6, a.y + (b.y - a.y) * i / 6); await new Promise((r) => setTimeout(r, 30)) }
  await page.mouse.up()
  const after = await page.evaluate(() => ({ staged: window.__studio.preview.staged,
    moved: Object.values(window.__studio.doc.sectors).some((sec) => sec.verts.some((v) => v.x === 22 && v.y === 4)) }))
  check(after.moved, 'the corner ends where the finger let go')
  check(after.staged > before, `the drag was drawn through staged edits, not bakes (${after.staged - before} steps)`)
  await page.waitForFunction(() => window.__studio.preview.busy === false && window.__studio.preview.last.ok, { timeout: 15000 }).catch(() => {})
  s = await state()
  check(s.ok, `the release bakes the moved room (${s.status})`)
}

// Draw a room whose corners are tapped NEAR the tapped room's and the
// rectangle room's corners: they snap, and the walls between come out shared.
await page.keyboard.press('2')
await tapAt(12.3, -4.2); await tapAt(19.8, -3.7); await tapAt(20.2, -7.8); await tapAt(11.8, -8.3); await tapAt(12.3, -4.2)
await page.waitForFunction((n) => window.__studio.doc.order.length === n, { timeout: 5000 }, 4).catch(() => {})
const snapped = await page.evaluate(async () => {
  const S = window.__studio
  const { derive } = await import('/studio/src/topology.js')
  const sid = S.doc.order[S.doc.order.length - 1]
  const s = S.doc.sectors[sid]
  const d = derive(S.doc).sectors.find((x) => x.id === sid)
  return { corners: s.verts.map((v) => [v.x, v.y]), kinds: d.verts.map((v) => v.kind) }
})
check(snapped.corners.every(([x, y]) => [12, 20].includes(x) && [-4, -8].includes(y)), `the corners snapped onto the neighbours' (${JSON.stringify(snapped.corners)})`)
check(snapped.kinds.filter((k) => k === 'neighbor').length === 2, `two of its walls are shared with the rooms beside it (${snapped.kinds.join(', ')})`)
await page.waitForFunction(() => window.__studio.preview.busy === false && window.__studio.preview.last.ok, { timeout: 15000 }).catch(() => {})
s = await state()
check(s.ok, `the connected rooms bake (${s.status})`)

// A shared wall is two edges: the tap's side picks the room, and tapping it
// again flips to the other side.
await page.keyboard.press('1')
// The wall's sheet slides up over the lower half of the screen, so each tap
// first puts it away, as a finger would.
const pickEdge = async (x, y) => {
  await page.evaluate(() => window.__studio.ui.hideSheet())
  await new Promise((r) => setTimeout(r, 220))
  await tapAt(x, y)
  return page.evaluate(() => window.__studio.selection)
}
const below = await pickEdge(16, -4.3)
const above = await pickEdge(16, -3.7)
const flipped = await pickEdge(16, -3.7)
const lastRoom = await page.evaluate(() => window.__studio.doc.order[window.__studio.doc.order.length - 1])
check(below?.kind === 'edge' && below.sectorId === lastRoom, `tapping the shared wall from the lower room selects that room's side (${JSON.stringify(below)})`)
check(above?.kind === 'edge' && above.sectorId !== lastRoom && above.id !== below.id, `and from the upper room, the upper room's side (${JSON.stringify(above)})`)
check(flipped?.kind === 'edge' && flipped.id === below.id, `tapping it again flips to the other side (${JSON.stringify(flipped)})`)
// And the sheet's own way across, for when the sheet covers the wall.
const viaButton = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.st-sheet button')].find((x) => /other side/.test(x.textContent))
  if (!b) return null
  b.click()
  return window.__studio.selection
})
check(viaButton?.kind === 'edge' && viaButton.id === above.id, `the sheet's button crosses to the other side too (${JSON.stringify(viaButton)})`)
await page.keyboard.press('Escape')

// Place a spawn from the palette on the first room.
await page.keyboard.press('3')
await page.evaluate(() => { window.__studio.place = { kind: 'prop', name: 'barrel' }; window.__studio.ui.hideSheet() })
await new Promise((r) => setTimeout(r, 250))
await tapAt(16, 0)
s = await state()
check(s.entities === 1, `placing from the palette adds an entity (${s.entities})`)

// The placed barrel is drawn as its own picture once the catalogue's frame has
// loaded: a textured sprite standing on the floor, not a badge.
await page.waitForFunction(() => window.__studio.viewport.markers.children.some((m) => m.userData.kind === 'entity' && m.material.map?.image?.width > 0 && !m.material.map.image.getContext), { timeout: 15000 }).catch(() => {})
const drawn = await page.evaluate(() => {
  const m = window.__studio.viewport.markers.children.find((x) => x.userData.kind === 'entity')
  return m ? { pictured: !!m.material.map?.image?.width && !m.material.map.image.getContext, h: m.scale.y } : null
})
check(drawn?.pictured && drawn.h > 0.5 && drawn.h < 1.5, `a placed prop is drawn as its sprite at its catalogue size (${JSON.stringify(drawn)})`)

// A .tsprite project imported through the picker: composed by ThreeSprite's
// runtime into a sheet the module keeps, then a monster drawn with it.
{
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 10000 }),
    page.evaluate(() => { window.__importDone = window.__studio.importSheet() })
  ])
  await chooser.accept([new URL('./fixtures/spirit.tsprite', import.meta.url).pathname])
  const imported = await page.evaluate(() => window.__importDone)
  const sheet = await page.evaluate(() => ({ rec: window.__studio.module.sprites?.SPIR, has: window.__studio.sheets.has('SPIR'), asset: !!window.__studio.rec.assets['sprites/SPIR.png'] }))
  check(imported === 'SPIR' && sheet.has && sheet.asset && sheet.rec?.animations?.length === 4, `a .tsprite becomes the module's sheet (${JSON.stringify(sheet)})`)
  await page.evaluate(async () => {
    const S = window.__studio
    const { addEntity } = await import('/studio/src/doc.js')
    S.module.props.push({ id: 1000, name: 'spirit', radius: 0.35, height: 1, speed: 5, solid: true, art: { kind: 'atlas', sheet: 'SPIR', states: { 0: 'idle' } } })
    addEntity(S.doc, 'mob', 'spirit', 4, 0, 0)
    S.commit()
  })
  await page.waitForFunction(() => window.__studio.viewport.markers.children.filter((m) => m.userData.kind === 'entity' && m.material.map?.image?.width > 0 && !m.material.map.image.getContext).length >= 2, { timeout: 15000 }).catch(() => {})
  const spirit = await page.evaluate(() => {
    const e = window.__studio.doc.entities.find((x) => x.name === 'spirit')
    const m = window.__studio.viewport.markers.children.find((x) => x.userData.id === e?.id)
    return m ? { pictured: !!m.material.map?.image?.width && !m.material.map.image.getContext, w: m.scale.x, h: m.scale.y, cut: m.material.map.repeat.x < 1 } : null
  })
  check(spirit?.pictured && spirit.cut && spirit.h > 0.3 && spirit.h <= 1, `the monster is drawn from its imported sheet, one frame cut from it (${JSON.stringify(spirit)})`)
}

// The monster workshop: its own windows. A new monster gets the imported
// sheet; the preview draws it, the graph shows its five states and their
// arrows, and tapping a state opens it in the details window.
{
  const made = await page.evaluate(async () => {
    const S = window.__studio
    const { newMonster } = await import('/studio/src/brain.js')
    const name = newMonster(S, 'ghost')
    S.moduleChanged()
    return name
  })
  check(made === 'ghost', `a new monster is made from the forms (${made})`)
  // Monsters are a section of the module now, in the rail.
  await page.evaluate(() => document.querySelector('.sd-rail [data-section="monsters"]').click())
  await page.waitForFunction(() => document.querySelector('.wk') && !document.querySelector('.wk').hidden, { timeout: 5000 }).catch(() => {})
  const wk = await page.evaluate(() => ({
    open: !!document.querySelector('.wk') && !document.querySelector('.wk').hidden,
    nodes: document.querySelectorAll('.wk-node').length,
    edges: document.querySelectorAll('.wk-edge').length,
    sheet: window.__studio.module.props.find((p) => p.name === 'ghost')?.art?.sheet,
    chrome: getComputedStyle(document.querySelector('.st-bar')).display
  }))
  check(wk.open && wk.nodes === 5 && wk.edges >= 6, `the graph shows the brain: ${wk.nodes} states, ${wk.edges} arrows`)
  check(wk.sheet === 'SPIR', `the new monster took the imported sheet (${wk.sheet})`)
  check(wk.chrome === 'none', 'the level chrome is out of the way while the monsters are open')
  await page.waitForFunction(() => {
    const c = document.querySelector('.wk-canvas'); if (!c) return false
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height - 30).data
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n > 500
  }, { timeout: 15000 }).catch(() => {})
  const painted = await page.evaluate(() => {
    const c = document.querySelector('.wk-canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height - 30).data
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return { n, label: document.querySelector('.wk-preview .st-muted')?.textContent }
  })
  check(painted.n > 500, `the preview paints the monster from its sheet (${painted.n} px, ${painted.label})`)
  const picked = await page.evaluate(() => {
    const node = [...document.querySelectorAll('.wk-node')].find((n) => n.textContent.includes('chase'))
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
    return { state: window.__studio.workshop.state, transitions: document.querySelectorAll('.wk-details [data-transition]').length }
  })
  check(picked.state === 'chase' && picked.transitions === 2, `tapping a state opens it with its transitions (${JSON.stringify(picked)})`)
  // The forms are the vocabulary's: every condition and action the runtime
  // knows is on offer, and a `prop` argument lists the catalogue.
  const offered = await page.evaluate(() => {
    const S = window.__studio
    const sel = [...document.querySelectorAll('.wk-details select')]
    const when = sel.find((s) => [...s.options].some((o) => o.value === 'prop_within'))
    const step = sel.find((s) => [...s.options].some((o) => o.value === 'alert_nearby'))
    S.module.mobs.mobs.ghost.states.chase.transitions[0].when.push({ cond: 'prop_within', distance: '4' })
    S.workshop.render()
    const propSel = [...document.querySelectorAll('.wk-details .st-row')].find((r) => r.querySelector('label')?.textContent === 'prop?')?.querySelector('select')
    return { when: when ? when.options.length - 1 : 0, step: step ? step.options.length - 1 : 0, props: propSel ? propSel.options.length - 1 : 0, first: propSel?.options[1]?.value }
  })
  check(offered.when >= 23 && offered.step >= 27, `the whole mob vocabulary is on offer (${offered.when} conditions, ${offered.step} actions)`)
  check(offered.props > 1 && typeof offered.first === 'string', `a prop argument lists the catalogue (${offered.props} names, first ${offered.first})`)
  await page.evaluate(() => { window.__studio.module.mobs.mobs.ghost.states.chase.transitions[0].when.pop(); window.__studio.workshop.render() })
  // Dragging a state moves it the whole way: the arrows are redrawn under
  // the finger, the node under it is the same element from start to end.
  const dragged = await page.evaluate(() => {
    const node = [...document.querySelectorAll('.wk-node')].find((n) => n.textContent.includes('chase'))
    const r = node.getBoundingClientRect()
    const ev = (type, dx) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: r.x + 10 + dx, clientY: r.y + 10 }))
    ev('pointerdown', 0)
    for (let i = 1; i <= 8; i++) ev('pointermove', i * 10)
    ev('pointerup', 80)
    return { alive: node.isConnected, dx: node.getBoundingClientRect().x - r.x, edges: document.querySelectorAll('.wk-edge').length }
  })
  check(dragged.alive && Math.round(dragged.dx) === 80 && dragged.edges >= 6, `dragging a state moves it the whole way and keeps its arrows (${JSON.stringify(dragged)})`)
  // A new state is named in the studio's own dialog: window.prompt is not
  // there in Electron, nor in a phone's WebView.
  await page.evaluate(() => [...document.querySelectorAll('.wk-bar button')].find((b) => b.textContent === '+ state').click())
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.type('flee')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.module.mobs.mobs.ghost.states.flee, { timeout: 3000 }).catch(() => {})
  const added = await page.evaluate(() => ({ state: !!window.__studio.module.mobs.mobs.ghost.states.flee, nodes: document.querySelectorAll('.wk-node').length, dialogs: document.querySelectorAll('dialog').length }))
  check(added.state && added.nodes === 6 && added.dialogs === 0, `a state is added through the studio's own dialog (${JSON.stringify(added)})`)
  // The preview plays any animation of the sheet by name, not only a state's.
  await page.select('.wk-preview select', 'walk')
  await page.waitForFunction(() => document.querySelector('.wk-preview .st-muted')?.textContent.startsWith('walk'), { timeout: 5000 }).catch(() => {})
  const anim = await page.evaluate(() => ({ label: document.querySelector('.wk-preview .st-muted')?.textContent, chipsOn: document.querySelectorAll('.wk-preview .st-chip[data-on="1"]').length, options: document.querySelectorAll('.wk-preview select option').length }))
  check(anim.label?.startsWith('walk') && anim.chipsOn === 0 && anim.options >= 4, `the preview plays a chosen animation (${JSON.stringify(anim)})`)
  // ...and one that plays once, and keeps drawing after it: the loop must
  // not die on any animation of the sheet.
  await page.select('.wk-preview select', 'Attack')
  await page.waitForFunction(() => document.querySelector('.wk-preview .st-muted')?.textContent.startsWith('Attack'), { timeout: 5000 }).catch(() => {})
  const once = await page.evaluate(() => {
    const c = document.querySelector('.wk-canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height - 30).data
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return { n, label: document.querySelector('.wk-preview .st-muted')?.textContent, loop: window.__studio.workshop.raf > 0 }
  })
  check(once.n > 500 && once.label?.startsWith('Attack') && once.loop, `a once-only animation draws and the loop lives on (${JSON.stringify(once)})`)
  // A sheet's height scales its sprite: the manifest the game reads, the
  // atlas the studio draws from and the bodies that matched it all follow.
  const scaled = await page.evaluate(async () => {
    const S = window.__studio
    const before = S.sheets.get('SPIR').atlas.worldHeight
    await S.setSheetHeight('SPIR', before * 2)
    const json = JSON.parse(await S.rec.assets['sprites/SPIR.json'].text())
    return { before, after: S.sheets.get('SPIR').atlas.worldHeight, file: json.worldHeight, body: S.module.props.find((p) => p.name === 'ghost').height, rec: S.module.sprites.SPIR.worldHeight }
  })
  check(scaled.after === scaled.before * 2 && scaled.file === scaled.after && scaled.body === scaled.after && scaled.rec === scaled.after, `a sheet's height scales its sprite everywhere (${JSON.stringify(scaled)})`)
  // The monster's own attack editing: the swept collider it claws with, and
  // what it bleeds -- both drawn from the same places a weapon's are.
  const claw = await page.evaluate(() => {
    const S = window.__studio
    S.workshop.tab = 'swing'; S.workshop.render()
    ;[...document.querySelectorAll('.wk-details button')].find((b) => b.textContent === '+ swing').click()
    S.workshop.render()
    return { swing: S.module.mobs.mobs.ghost.swing, canvas: !!document.querySelector('.wk-details .st-swing-canvas') }
  })
  check(claw.swing?.damage > 0 && claw.canvas, 'a monster gets the same swept collider, with the same preview')
  // The preview runs the engine's own sweep, so the collider moves.
  const swept = await page.evaluate(async () => {
    const c = document.querySelector('.wk-details .st-swing-canvas')
    const lit = () => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] > 90 && d[i + 1] > 70) n++
      return n
    }
    const seen = new Set()
    for (let i = 0; i < 40; i++) { seen.add(lit()); await new Promise((r) => requestAnimationFrame(r)) }
    return { frames: seen.size, any: Math.max(...seen) }
  })
  check(swept.any > 50 && swept.frames > 3, `and the collider sweeps rather than sitting still (${swept.frames} distinct frames)`)
  const blood = await page.evaluate(() => {
    const S = window.__studio
    S.workshop.tab = 'brain'; S.workshop.render()
    const row = [...document.querySelectorAll('.wk-details .st-row')].find((r) => r.querySelector('label')?.textContent?.startsWith('blood'))
    const sel = row?.querySelector('select')
    return { isPicker: !!sel, options: sel ? sel.options.length - 1 : 0 }
  })
  check(blood.isPicker && blood.options > 0, `what it bleeds is picked from the particle kinds, not typed as a number (${blood.options} offered)`)
  await page.evaluate(() => { delete window.__studio.module.mobs.mobs.ghost.swing; window.__studio.moduleChanged() })
  await page.evaluate(() => window.__studio.go('map'))
  const closed = await page.evaluate(() => document.querySelector('.sd-page').hidden && getComputedStyle(document.querySelector('.st-bar')).display !== 'none')
  check(closed, 'leaving the monsters for the map brings the level back')
}

// The module's maps, from one sheet: a new one, switching, deleting -- the
// last map stays, and a deleted map's neighbour is opened in its place.
{
  await page.evaluate(() => window.__studio.showMaps())
  const listed = await page.evaluate(() => ({ rows: document.querySelectorAll('.sd-page [data-map]').length, on: document.querySelector('.sd-page [data-map][data-on="1"]')?.dataset.map, docs: Object.keys(window.__studio.docs).length }))
  check(listed.rows === listed.docs && listed.on === 'first', `the Maps sheet lists every map and marks the one being edited (${JSON.stringify(listed)})`)
  await page.evaluate(() => [...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ new map').click())
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.type('arena')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.docName === 'arena', { timeout: 5000 }).catch(() => {})
  const made = await page.evaluate(() => ({ name: window.__studio.docName, docs: Object.keys(window.__studio.docs), sectors: window.__studio.doc.order.length, sheet: window.__studio.ui.sheetOpen }))
  check(made.name === 'arena' && made.docs.length === 2 && made.sectors === 1 && !made.sheet, `a new map is made from the sheet and opened (${JSON.stringify(made)})`)
  await page.evaluate(async () => { await window.__studio.showMaps(); document.querySelector('.sd-page [data-map="first"]').click() })
  await page.waitForFunction(() => window.__studio.docName === 'first', { timeout: 5000 }).catch(() => {})
  check(await page.evaluate(() => window.__studio.docName === 'first' && window.__studio.doc.order.length > 1), 'tapping a map in the sheet opens it')
  await page.evaluate(async () => { await window.__studio.showMaps(); document.querySelector('.sd-page [data-map="arena"] button').click() })
  await page.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('dialog[open] button[type=submit]').click())
  await page.waitForFunction(() => !window.__studio.docs.arena, { timeout: 5000 }).catch(() => {})
  const gone = await page.evaluate(() => ({ docs: Object.keys(window.__studio.docs), name: window.__studio.docName, rows: document.querySelectorAll('.sd-page [data-map]').length }))
  check(gone.docs.length === 1 && gone.name === 'first' && gone.rows === 1, `a map is deleted after the studio's own confirmation, and the list follows (${JSON.stringify(gone)})`)
  // The status is read in the same turn as the tap: a bake finishing a moment
  // later rewrites the strip, and under load that raced a fixed wait.
  const said = await page.evaluate(() => { document.querySelector('.sd-page [data-map="first"] button').click(); return window.__studio.ui.status.textContent })
  await new Promise((r) => setTimeout(r, 300))
  const kept = await page.evaluate((status) => ({ docs: Object.keys(window.__studio.docs).length, dialog: !!document.querySelector('dialog[open]'), status }), said)
  check(kept.docs === 1 && !kept.dialog && /at least one map/.test(kept.status), `the last map cannot be deleted (${JSON.stringify(kept)})`)
  await page.evaluate(() => window.__studio.go('map'))
}

// A prop: a body without a brain, from the Props sheet, with a single
// picture of the module's own; placed, it is drawn from that picture.
{
  await page.evaluate(() => window.__studio.showProps())
  await page.evaluate(() => [...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ new prop').click())
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.type('barrel')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.module.props.some((p) => p.name === 'barrel'), { timeout: 5000 }).catch(() => {})
  const made = await page.evaluate(() => ({ prop: window.__studio.module.props.find((p) => p.name === 'barrel'), title: document.querySelector('.sd-head .sd-title')?.textContent }))
  check(made.prop?.id > 1000 && /barrel/.test(made.title ?? ''), `a new prop is made from the sheet and its form opens (${JSON.stringify(made)})`)
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 10000 }),
    page.evaluate(() => { window.__picDone = window.__studio.importPicture() })
  ])
  await chooser.accept([new URL('../../modules/starter/assets/textures/ROCKFLOOR1.png', import.meta.url).pathname])
  const pic = await page.evaluate(() => window.__picDone)
  check(pic === 'ROCKFLOOR1' && await page.evaluate(() => !!window.__studio.rec.assets['sprites/ROCKFLOOR1.png']), `a PNG becomes the module's picture (${pic})`)
  await page.evaluate(async () => {
    const S = window.__studio
    const { artFromPicture } = await import('/studio/src/props.js')
    const { addEntity } = await import('/studio/src/doc.js')
    const p = S.module.props.find((x) => x.name === 'barrel')
    p.height = 1.25
    p.art = artFromPicture('ROCKFLOOR1', p.height)
    S.sprites.forget('barrel')
    addEntity(S.doc, 'prop', 'barrel', 6, 2, 0)
    S.commit(); S.moduleChanged()
  })
  await page.waitForFunction(() => { const m = window.__studio.viewport.markers.children.find((x) => x.userData.id === window.__studio.doc.entities.find((e) => e.name === 'barrel')?.id); return m && m.material.map?.image?.width > 0 && !m.material.map.image.getContext }, { timeout: 15000 }).catch(() => {})
  const drawn = await page.evaluate(() => {
    const e = window.__studio.doc.entities.find((x) => x.name === 'barrel')
    const m = window.__studio.viewport.markers.children.find((x) => x.userData.id === e?.id)
    return m ? { pictured: !!m.material.map?.image?.width && !m.material.map.image.getContext, h: m.scale.y } : null
  })
  check(drawn?.pictured && Math.abs(drawn.h - 1.25) < 1e-6, `a placed prop is drawn from its picture, as tall as its body (${JSON.stringify(drawn)})`)
  // The drawing scale multiplies that, here as in the game.
  await page.evaluate(() => { const S = window.__studio; S.module.props.find((x) => x.name === 'barrel').scale = 2; S.sprites.forget('barrel'); S.moduleChanged(); S.viewport.markers.clear() })
  await page.evaluate(() => window.__studio.commit())
  await page.waitForFunction(() => { const S = window.__studio; const e = S.doc.entities.find((x) => x.name === 'barrel'); const m = S.viewport.markers.children.find((x) => x.userData.id === e?.id); return m && m.userData.h && Math.abs(m.userData.h - 2.5) < 1e-6 }, { timeout: 15000 }).catch(() => {})
  const scaled = await page.evaluate(() => { const S = window.__studio; const e = S.doc.entities.find((x) => x.name === 'barrel'); const m = S.viewport.markers.children.find((x) => x.userData.id === e?.id); return m?.userData.h })
  check(scaled !== undefined && Math.abs(scaled - 2.5) < 1e-6, `a body's scale doubles the drawn prop (${scaled})`)
  const emitted = await page.evaluate(async () => (await import('/studio/src/props_emit.js')).emitProps(window.__studio.module))
  check(/^prop \d+ barrel radius 0\.5 height 1\.25 scale 2 solid$/m.test(emitted) && /^sprite \d+ size 1\.25 billboard frames ROCKFLOOR1$/m.test(emitted), `the catalogue carries the body, its scale and the picture (${emitted.split('\n').filter((l) => /barrel|ROCKFLOOR1/.test(l)).join(' | ')})`)
  const palette = await page.evaluate(async () => { await window.__studio.go('map'); window.__studio.openPalette(); return [...document.querySelectorAll('.st-sheet .st-chip')].map((c) => c.textContent) })
  check(palette.includes('barrel'), 'the Place palette offers the prop')
  await page.evaluate(() => window.__studio.ui.hideSheet())
}

// The soundtrack: a baked track imported into the module, made the map's
// default cue, and heard here through the client's own synth. The pack then
// carries the index the game looks the map up in, under the map's hash.
{
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 10000 }),
    page.evaluate(() => { window.__trackDone = window.__studio.importTrack() })
  ])
  await chooser.accept([new URL('../../modules/doom2/assets/music/d_evil.mstk', import.meta.url).pathname])
  const track = await page.evaluate(() => window.__trackDone)
  check(track === 'd_evil' && await page.evaluate(() => !!window.__studio.rec.assets['music/d_evil.mstk'] && window.__studio.trackUrls.has('d_evil')), `a .mstk becomes the module's track (${track})`)
  await page.evaluate(() => window.__studio.showMusic())
  await page.evaluate(() => [...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ cue').click())
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.doc.music?.default, { timeout: 3000 }).catch(() => {})
  const cued = await page.evaluate(() => ({ music: window.__studio.doc.music, rows: document.querySelectorAll('.sd-page [data-cue]').length, tracks: document.querySelectorAll('.sd-page [data-track]').length }))
  check(cued.music?.default === 'd_evil' && cued.rows === 1 && cued.tracks === 1, `the first cue is 'default' on the imported track (${JSON.stringify(cued)})`)
  await page.evaluate(() => window.__studio.listen('d_evil'))
  await page.waitForFunction(() => window.__studio.music && (window.__studio.music.current || window.__studio.music.failed), { timeout: 20000 }).catch(() => {})
  await page.waitForFunction(() => window.__studio.music?.health() !== null, { timeout: 5000 }).catch(() => {})
  const heard = await page.evaluate(() => { const m = window.__studio.music; return { started: m?.started, ready: m?.ready, playing: !!m?.current && m.current === window.__studio.trackUrls.get('d_evil'), failed: m?.failed ?? null, health: m?.health(), rate: m?.ctx?.sampleRate } })
  check(heard.ready && heard.playing && !heard.failed, `the track plays here through the client's synth (${JSON.stringify(heard)})`)
  const packed = await page.evaluate(async () => {
    const S = window.__studio
    const { emitModule } = await import('/studio/src/module_emit.js')
    const { musicKeyFor } = await import('/src/audio/musickey.js')
    const assets = {}
    for (const [path, blob] of Object.entries(S.rec.assets)) assets[path] = new Uint8Array(await blob.arrayBuffer())
    const r = await emitModule(S.module, Object.values(S.docs), { bake: S.bake, runtime: S.runtime, assets })
    const idx = r.files.find((f) => f.path === 'assets/music/index.json')
    const dnpm = r.files.find((f) => f.path === `maps/${S.docName}.dnpm`)?.bytes
    const loaded = S.core.loadMap(new Uint8Array(dnpm))
    const index = idx ? JSON.parse(idx.bytes) : null
    return { index, key: index && musicKeyFor(index, loaded.map.hash, S.docName), hasTrack: r.files.some((f) => f.path === 'assets/music/d_evil.mstk'), warnings: r.problems.flatMap((p) => p.warnings.filter((w) => w.sector === 'music').map((w) => w.msg)) }
  })
  check(packed.key && packed.index?.[packed.key]?.default === 'd_evil.mstk' && packed.hasTrack && packed.warnings.length === 0,
        `the pack files the map's cues where the client looks them up (${JSON.stringify({ ...packed, index: Object.keys(packed.index ?? {}) })})`)
  await page.evaluate(() => { window.__studio.stopListening(); return window.__studio.go('map') })
}

// The map's camera: set from its sheet, taken by the level view at once,
// squashing sprite markers as the game's pitch will, and written for the game.
{
  await page.evaluate(() => window.__studio.showCamera())
  const before = await page.evaluate(() => ({ mode: window.__studio.viewport.mode, elevation: window.__studio.viewport.elevation, ranges: document.querySelectorAll('.st-sheet input[type=range]').length }))
  await page.evaluate(() => { const S = window.__studio; S.doc.camera = { yaw: 0.25, pitch: 0.05, distance: 30, lockYaw: true, lockZoom: false }; S.viewport.setMode('iso'); S.applyCamera(); S.commit(); S.showCamera() })
  const cam = await page.evaluate(async () => {
    const S = window.__studio
    S.viewport.render()
    const marker = S.viewport.markers.children.find((m) => m.userData.h)
    const { emitMapLua } = await import('/studio/src/lua_emit.js')
    const { emitMap } = await import('/studio/src/mapfmt.js')
    const { derive } = await import('/studio/src/topology.js')
    const text = emitMapLua(S.doc, emitMap(derive(S.doc), S.doc, [])).text
    return { yaw: S.viewport.yaw, elevation: S.viewport.elevation, ranges: document.querySelectorAll('.st-sheet input[type=range]').length,
             squash: marker ? marker.scale.y / marker.userData.h : null, lua: /dnp\.level_camera\{ yaw = 250 \/ 1000, pitch = 50 \/ 1000, distance = 30000 \/ 1000, lock_yaw = 1 \}/.test(text) }
  })
  check(before.ranges === 0 && cam.ranges === 3, `the sheet offers the angle and distance once they are set (${before.ranges} -> ${cam.ranges} sliders)`)
  check(Math.abs(cam.yaw - Math.PI / 2) < 1e-9 && Math.abs(cam.elevation - Math.PI * 0.1) < 1e-9, `the level view takes the map's angle (${JSON.stringify({ yaw: cam.yaw, elevation: cam.elevation })})`)
  check(cam.squash !== null && Math.abs(cam.squash - Math.cos(Math.PI * 0.1)) < 1e-6, `a sprite marker is squashed by the pitch's cosine, as the game will draw it (${cam.squash})`)
  check(cam.lua, 'the camera is written for the game in thousandths')
  await page.evaluate(() => { const S = window.__studio; S.doc.camera = { yaw: null, pitch: null, distance: null, lockYaw: false, lockZoom: false }; S.applyCamera(); S.viewport.setMode('plan'); S.commit(); S.ui.hideSheet() })
  check(await page.evaluate(() => Math.abs(window.__studio.viewport.elevation - 0.8960553845713439) < 1e-6), 'CONTROL: off, the level view is back on the engine\'s own pitch')
}

// Every wall of a sector at once, one field at a time.
{
  await page.evaluate(() => { const S = window.__studio; S.select({ kind: 'sector', id: S.doc.order[0] }) })
  const labels = await page.evaluate(() => [...document.querySelectorAll('.st-sheet .st-row label')].map((l) => l.textContent))
  check(['all middles', 'all uppers', 'all lowers'].every((l) => labels.includes(l)), `the sector offers all three wall fields (${labels.filter((l) => l.startsWith('all ')).join(', ')})`)
  const before = await page.evaluate(() => {
    const s = window.__studio.doc.sectors[window.__studio.doc.order[0]]
    return { middles: s.verts.map((v) => v.edge.middle), uppers: s.verts.map((v) => v.edge.upper) }
  })
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.st-sheet .st-row')].find((r) => r.querySelector('label')?.textContent === 'all uppers')
    row.querySelector('button').click()
  })
  const picked = await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.st-sheet .st-tile')].find((t) => t.textContent && t.textContent !== '(none)')
    const name = tile.textContent
    tile.click()
    return name
  })
  const after = await page.evaluate(() => {
    const s = window.__studio.doc.sectors[window.__studio.doc.order[0]]
    return { middles: s.verts.map((v) => v.edge.middle), uppers: s.verts.map((v) => v.edge.upper) }
  })
  check(after.uppers.length > 1 && after.uppers.every((u) => u === picked), `one pick sets upper on every wall of the sector (${after.uppers.join(',')})`)
  check(after.middles.join() === before.middles.join(), `and leaves the other fields alone (${after.middles.join(',')})`)
  await page.evaluate(() => {
    const s = window.__studio.doc.sectors[window.__studio.doc.order[0]]
    for (const v of s.verts) v.edge.upper = null
    window.__studio.commit(); window.__studio.ui.hideSheet()
  })
}

// How a surface is painted, and the transparency toggle.
{
  await page.evaluate(() => { const S = window.__studio; S.select({ kind: 'sector', id: S.doc.order[0] }) })
  const labels = await page.evaluate(() => [...document.querySelectorAll('.st-sheet .st-row label')].map((l) => l.textContent))
  check(['turn (°)', 'shift x', 'size', 'see-through'].every((l) => labels.includes(l)),
        `a sector's flats can be turned, shifted, resized and seen through (${labels.filter((l) => /turn|shift|size|see/.test(l)).join(', ')})`)
  const heads = await page.evaluate(() => [...document.querySelectorAll('.st-sheet .st-section-head')].map((h) => h.textContent))
  check(heads.filter((h) => /pattern/.test(h)).length === 2, `the floor and the ceiling each get their own (${heads.filter((h) => /pattern/.test(h)).join(' | ')})`)
  // The toggle turns a surface see-through, and reveals the number behind it.
  const toggled = await page.evaluate(() => {
    const S = window.__studio
    const rows = [...document.querySelectorAll('.st-sheet .st-row')]
    const row = rows.find((r) => r.querySelector('label')?.textContent === 'see-through')
    row.querySelector('button').click()
    const s = S.doc.sectors[S.doc.order[0]]
    return { alpha: s.floorStyle.alpha, opacity: [...document.querySelectorAll('.st-sheet .st-row label')].includes }
  })
  check(toggled.alpha === 254, `the toggle makes it see-through at the value that shows a texture's own holes (${toggled.alpha})`)
  const after = await page.evaluate(() => [...document.querySelectorAll('.st-sheet .st-row label')].map((l) => l.textContent))
  check(after.includes('opacity'), 'and the number behind it appears once it is on')
  check(after.includes('painted in'), "and each flat says whose coordinates its pattern is painted in")
  // It reaches the map, and the preview bakes it.
  const emitted = await page.evaluate(async () => {
    const S = window.__studio
    const { emitMap } = await import('/studio/src/mapfmt.js')
    const { derive, normalize } = await import('/studio/src/topology.js')
    normalize(S.doc)
    return emitMap(derive(S.doc), S.doc, []).text
  })
  check(/flooralpha 254/.test(emitted), `the map says so (${/sector[^\n]*flooralpha[^\n]*/.exec(emitted)?.[0]?.slice(0, 90)})`)
  await page.evaluate(() => { const S = window.__studio; S.doc.sectors[S.doc.order[0]].floorStyle.alpha = 255; S.commit() })
  await page.waitForFunction(() => window.__studio.preview.busy === false && window.__studio.preview.last.ok, { timeout: 20000 }).catch(() => {})
  check(await page.evaluate(() => window.__studio.preview.last.ok), 'and the studio still bakes it')
  await page.evaluate(() => window.__studio.ui.hideSheet())
}

// Sectors that travel and turn: the vocabulary grew six arguments and the
// trigger cards are generated from it, so they appear with no studio change.
{
  const sm = await page.evaluate(async () => {
    const S = window.__studio
    const spec = S.vocab.actions.get('sector_move')
    return { args: (spec?.args ?? []).map((a) => a.name) }
  })
  check(['dx', 'dy', 'spin', 'spin_speed', 'pivot_x', 'pivot_y'].every((n) => sm.args.includes(n)),
        `a sector can be told to travel and to turn (${sm.args.filter((n) => /dx|dy|spin|pivot/.test(n)).join(', ')})`)
  // And the two presets that write those sentences, which also anchor the flat
  // -- a slider painted in world coordinates slides out from under its floor.
  await page.evaluate(() => { const S = window.__studio; S.tool = 'trigger'; S.triggerOpen = null; S.ui.showSheet('Triggers', [], () => {}) })
  const made = await page.evaluate(async () => {
    const S = window.__studio
    const { slider, turntable } = await import('/studio/src/presets.js')
    const sid = S.doc.order[0]
    const edge = S.doc.sectors[sid].verts[0].edge.id
    const before = S.doc.triggers.length
    const a = slider(S.doc, edge, sid, { dx: 3, dy: 0 })
    const b = turntable(S.doc, edge, sid, { spin: 90 })
    S.commit()
    return { ok: a.ok && b.ok, added: S.doc.triggers.length - before, anchor: S.doc.sectors[sid].floorStyle.anchor,
             spin: b.triggers[0].actions[0].spin, dx: a.triggers.find((t) => /out/.test(t.name))?.actions[0]?.dx }
  })
  check(made.ok && made.added === 3, `a slider and a turntable are presets (${made.added} triggers)`)
  check(made.dx === 3 && made.spin === 90, `they write the travel and the turn (dx ${made.dx}, spin ${made.spin}°)`)
  check(made.anchor === 'sector', "and anchor the flat, or the platform leaves its own pattern behind")
  await page.waitForFunction(() => window.__studio.preview.busy === false, { timeout: 20000 }).catch(() => {})
  check(await page.evaluate(() => window.__studio.preview.last.ok), 'and the map still bakes')
  await page.evaluate(() => {
    const S = window.__studio
    const sid = S.doc.order[0]
    S.doc.triggers = S.doc.triggers.filter((t) => !/slider|turntable/.test(t.name))
    S.doc.sectors[sid].floorStyle.anchor = 'world'
    S.commit(); S.ui.hideSheet()
  })
}

// A monster and a weapon belong to the MODULE. Made while one map is open,
// they are still there in another -- which is what "edit them in the module"
// has to mean from the outside.
{
  const across = await page.evaluate(async () => {
    const S = window.__studio
    const { newWeapon } = await import('/studio/src/weapons_emit.js')
    const { newMonster } = await import('/studio/src/brain.js')
    const first = S.docName
    const mob = newMonster(S, 'sentry')
    const gun = newWeapon(S.module, 'rifle')
    S.moduleChanged()
    // A second map, opened: the map document changes, the module does not.
    S.docs.elsewhere = JSON.parse(JSON.stringify(S.docs[first]))
    S.docs.elsewhere.name = 'elsewhere'
    await S.openDoc('elsewhere')
    const seen = { mob: !!S.module.mobs.mobs[mob], gun: !!S.module.weapons.weapons[gun], docName: S.docName }
    // ...and the map document carries neither of them.
    const keys = Object.keys(S.doc)
    await S.openDoc(first)
    delete S.docs.elsewhere
    delete S.module.mobs.mobs[mob]
    delete S.module.weapons.weapons[gun]
    S.moduleChanged()
    return { ...seen, leaked: keys.filter((k) => ['mobs', 'weapons', 'props', 'vfx', 'player'].includes(k)) }
  })
  check(across.docName === 'elsewhere' && across.mob && across.gun,
        `a monster and a weapon made in one map are there in another (${JSON.stringify(across)})`)
  check(across.leaked.length === 0, `and the map document carries no definitions of its own (${across.leaked.join(', ') || 'none'})`)
}

// The player's own window: skin, size, movement and kit, and no graph --
// nothing about a player is a state machine.
{
  const opened = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('player')
    return { kind: S.workshop.kind, nograph: document.querySelector('.wk').dataset.nograph,
             tabs: [...document.querySelectorAll('.wk-details .wk-tabs button')].map((b) => b.textContent),
             panes: [...document.querySelectorAll('.wk-top .wk-tabs button')].map((b) => b.textContent) }
  })
  check(opened.kind === 'player' && opened.nograph === '1', 'the player gets a window of its own, with no graph in it')
  check(opened.panes.every((p) => !/graph/.test(p)), `and no graph pane to switch to (${opened.panes.join(', ')})`)
  check(['skin', 'size', 'moves', 'kit'].every((t) => opened.tabs.some((x) => x.includes(t))),
        `skin, size, movement and kit (${opened.tabs.join(', ')})`)
  // THE PLAYER IS THE MODULE'S, and a map overrides only what it names.
  const set = (label, v) => {
    const r = [...document.querySelectorAll('.wk-details .st-row')].find((x) => x.firstChild?.textContent === label)
    const i = r.querySelector('input'); i.value = String(v); i.dispatchEvent(new Event('change'))
  }
  const size = await page.evaluate(async (setSrc) => {
    const set = eval(setSrc)
    const S = window.__studio
    const { playerFor } = await import('/studio/src/player.js')
    S.docs.second ??= JSON.parse(JSON.stringify(S.doc))
    S.playerScope = 'module'
    S.workshop.tab = 'size'; S.workshop.render()
    set('radius', 0.4)
    const everywhere = Object.values(S.docs).map((d) => playerFor(S.module, d).body.radius)
    // Now this map only: its own height, and the other map keeps the module's.
    ;[...document.querySelectorAll('.wk-details .st-scope button')].find((b) => b.dataset.scope === 'map').click()
    const own = [...document.querySelectorAll('.wk-details .st-row')].find((r) => /own size/.test(r.textContent))
    const inheritedSaid = document.querySelector('.wk-details').textContent.includes('Follows the module: 0.4')
    own.querySelector('button').click()
    set('height', 3)
    const r = { everywhere, inheritedSaid, mine: playerFor(S.module, S.doc).body, other: playerFor(S.module, S.docs.second).body,
                module: S.module.player.body, undoable: S.history.canUndo }
    // Back to following the module: the override disappears from the document.
    ;[...document.querySelectorAll('.wk-details .st-row')].find((x) => /own size/.test(x.textContent)).querySelector('button').click()
    r.after = S.doc.playerOverride ?? null
    return r
  }, `(${set.toString()})`)
  check(size.everywhere.every((v) => v === 0.4), `the module's size is every map's (${size.everywhere.join(', ')})`)
  check(size.inheritedSaid, 'a map that follows the module says what it follows')
  check(size.mine.height === 3 && size.mine.radius === 0.4 && size.other.height === 2 && size.module.height === 2,
        `one map's own size leaves the module and the other maps alone (${JSON.stringify(size)})`)
  check(size.undoable, 'and it is a change to the map, so it undoes with it')
  check(size.after === null, `switching the override off leaves nothing behind (${JSON.stringify(size.after)})`)
  // One movement parameter overridden on one map: that map's Lua carries the
  // resolved set, the other map's the module's.
  const perMap = await page.evaluate(async () => {
    const S = window.__studio
    const { emitPlayerLua } = await import('/studio/src/player.js')
    S.workshop.tab = 'moves'; S.workshop.render()
    const card = document.querySelector('.wk-details .st-card[data-param="jump_impulse"]')
    card.querySelector('button').click()
    const r = { own: S.doc.playerOverride?.moves?.jump_impulse, mine: emitPlayerLua(S.module, S.doc), other: emitPlayerLua(S.module, S.docs.second) }
    delete S.doc.playerOverride
    S.playerScope = 'module'
    S.workshop.render()
    return r
  })
  check(perMap.own?.mul === 1 && /jump_impulse/.test(perMap.mine ?? '') && !/jump_impulse/.test(perMap.other ?? ''),
        `a movement override is this map's alone (${JSON.stringify(perMap.own)})`)
  // MOVEMENT IS A MODIFIER, because the engine will not let a script write a
  // player's body at all.
  const moves = await page.evaluate(() => {
    const S = window.__studio
    S.workshop.tab = 'moves'; S.workshop.render()
    const card = [...document.querySelectorAll('.wk-details .st-card')].find((c) => c.textContent.includes('move_speed'))
    card.querySelector('button').click()
    S.workshop.render()
    return { moves: S.module.player.moves, groups: [...document.querySelectorAll('.wk-details .st-section-head')].map((h) => h.textContent) }
  })
  check(moves.moves.move_speed?.mul === 1, `a parameter is turned on as a modifier (${JSON.stringify(moves.moves)})`)
  check(moves.groups.length >= 4, `grouped as somebody thinks about them (${moves.groups.join(' | ')})`)
  const written = await page.evaluate(async () => {
    const S = window.__studio
    S.module.player.moves.move_speed = { mul: 1.5 }
    const { emitPlayerLua } = await import('/studio/src/player.js')
    return emitPlayerLua(S.module)
  })
  check(/add_effect\("move_speed", "mul"/.test(written), 'and it is written through the effect stack, which is what a player allows')
  await page.evaluate(async () => {
    const S = window.__studio
    S.module.player = null
    delete S.docs.second
    await S.go('map')
    S.moduleChanged()
  })
}

// The weapons window: an arsenal, a weapon that is a phase graph, and a
// swing with a picture of it. The same machine the monster window is.
{
  const opened = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('weapons')
    const wk = S.workshop
    return { kind: wk.kind, open: !document.querySelector('.wk').hidden, vocab: !!S.vocab.weapon, sibling: [...document.querySelectorAll('.wk-top button')].map((b) => b.textContent).join('|') }
  })
  check(opened.open && opened.kind === 'weapon', `the arsenal opens as its own window (${JSON.stringify(opened)})`)
  check(opened.vocab, 'the weapon vocabulary is served to the studio')
  check(/monsters/.test(opened.sibling), 'and it links across to the monsters')
  const made = await page.evaluate(async () => {
    const S = window.__studio
    const { newWeapon } = await import('/studio/src/weapons_emit.js')
    const name = newWeapon(S.module, 'pistol')
    S.workshop.mob = name
    S.workshop.render()
    return { name, phases: Object.keys(S.module.weapons.weapons[name].phases), nodes: document.querySelectorAll('.wk-node').length, edges: document.querySelectorAll('.wk-edge').length }
  })
  check(made.name === 'pistol' && made.phases.length === 2, `a new weapon is a working phase machine (${made.phases.join(', ')})`)
  check(made.nodes === 2 && made.edges >= 2, `its graph is drawn like a brain's (${made.nodes} phases, ${made.edges} arrows)`)
  // The phase form is the weapon vocabulary's, not the mob's.
  const offered = await page.evaluate(() => {
    const S = window.__studio
    S.workshop.state = 'ready'; S.workshop.tab = 'node'; S.workshop.render()
    const sel = [...document.querySelectorAll('.wk-details select')]
    const when = sel.find((x) => [...x.options].some((o) => o.value === 'button_held'))
    const step = sel.find((x) => [...x.options].some((o) => o.value === 'switch_if_empty'))
    return { when: when ? when.options.length - 1 : 0, step: step ? step.options.length - 1 : 0, mobOnly: sel.some((x) => [...x.options].some((o) => o.value === 'target_nearest')) }
  })
  check(offered.when >= 15 && offered.step >= 13, `the phase offers the weapon vocabulary (${offered.when} conditions, ${offered.step} actions)`)
  check(!offered.mobOnly, "CONTROL: and not the monster's, which a weapon cannot run")
  // A swing, its picture, and the arsenal's pools.
  const swung = await page.evaluate(() => {
    const S = window.__studio
    S.workshop.tab = 'swing'; S.workshop.render()
    ;[...document.querySelectorAll('.wk-details button')].find((b) => b.textContent === '+ swing').click()
    S.workshop.render()
    return { swing: S.module.weapons.weapons.pistol.swing, canvas: !!document.querySelector('.wk-details .st-swing-canvas') }
  })
  check(swung.swing?.damage > 0 && swung.canvas, 'a swing is added, with a preview that plays it')
  const arsenal = await page.evaluate(() => {
    const S = window.__studio
    S.workshop.tab = 'arsenal'; S.workshop.render()
    const before = Object.keys(S.module.weapons.ammo).length
    S.module.weapons.ammo.shells = { label: 'Shells', max: 50, initial: 8, order: 1 }
    S.workshop.render()
    return { before, pools: Object.keys(S.module.weapons.ammo), labels: [...document.querySelectorAll('.wk-details .st-section-head')].map((h) => h.textContent).join('|'), health: S.module.weapons.health }
  })
  check(/ammunition/.test(arsenal.labels) && /health/.test(arsenal.labels) && /pickups/.test(arsenal.labels),
        `the arsenal tab holds the pools, the ceilings and the pickups (${arsenal.labels})`)
  check(arsenal.before === 0 && arsenal.pools.join() === 'shells' && arsenal.health?.max > 0,
        `a fresh module carries no pools until one is made, and the ceilings default (${JSON.stringify(arsenal.health)})`)
  // The player's art is chosen from the module's own props.
  const avatar = await page.evaluate(() => {
    const S = window.__studio
    S.workshop.tab = 'body'; S.workshop.render()
    const chip = [...document.querySelectorAll('.wk-details .st-chip')].find((c) => c.textContent === 'spirit')
    if (chip) chip.click()
    S.workshop.render()
    return { player: S.module.player, rows: document.querySelectorAll('.wk-details .st-row').length }
  })
  check(avatar.player?.prop === 'spirit' && avatar.rows > 14, `the player is drawn by a prop of the module, with a state per condition (${avatar.rows} rows)`)
  // And it all reaches the files the game reads.
  const files = await page.evaluate(async () => {
    const S = window.__studio
    const { emitWeaponsLua } = await import('/studio/src/weapons_emit.js')
    const { emitProps } = await import('/studio/src/props_emit.js')
    return { lua: emitWeaponsLua(S.module), props: emitProps(S.module) }
  })
  check(/weapons\.load\{/.test(files.lua) && /pistol = \{/.test(files.lua), 'the arsenal is written as weapons.load{}')
  // THE CASE THAT USED TO BREAK. Monsters, triggers and weapons together need
  // three runtimes at two slots each; a file apiece for the monsters, the
  // arsenal and every module script put that over the map's eight, so adding a
  // weapon to a module that had the other two stopped it baking at all.
  const budget = await page.evaluate(async () => {
    const S = window.__studio
    const { scriptDecls } = await import('/studio/src/module_emit.js')
    const { newMonster } = await import('/studio/src/brain.js')
    if (!Object.keys(S.module.mobs.mobs).length) newMonster(S, 'watcher')
    S.module.scripts = { 'hooks.lua': 'function on_attack(a, t) end' }
    const decls = scriptDecls(S.module, { hasMobs: true, hasTriggers: true, hasWeapons: true })
    return { triggers: S.doc.triggers.length, slots: decls.length + 1, own: decls.filter((d) => !d.includes('/')) }
  })
  check(budget.slots <= 8 && budget.own.length === 1,
        `monsters, triggers and weapons together fit the map's eight scripts (${budget.slots}: ${budget.own.join(', ')} plus the runtimes)`)
  await page.evaluate(() => window.__studio.moduleChanged())
  await page.waitForFunction(() => window.__studio.preview.busy === false, { timeout: 20000 }).catch(() => {})
  const baked = await page.evaluate(() => ({ ok: window.__studio.preview.last.ok, errors: (window.__studio.preview.last.errors ?? []).map((e) => e.msg) }))
  check(baked.ok, `and the map still bakes with all three (${baked.errors.join(' | ') || 'no errors'})`)
  await page.evaluate(() => { window.__studio.module.scripts = {} })
  check(/^avatar \d+$/m.test(files.props), `the catalogue addresses the player's art (${/avatar.*/.exec(files.props)?.[0]})`)
  await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map')
    S.module.weapons = { ammo: {}, health: null, weapons: {}, pickups: {} }
    S.module.player = null
    S.moduleChanged()
  })
}

// Particles: a kind of the module's own, played by the client's own code.
{
  await page.evaluate(() => window.__studio.showVfx())
  const before = await page.evaluate(() => document.querySelectorAll('.sd-page [data-vfx]').length)
  await page.evaluate(() => [...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ particles').click())
  const made = await page.evaluate(() => ({ kinds: window.__studio.module.vfx.length, rows: document.querySelectorAll('.sd-page [data-vfx]').length, canvas: !!document.querySelector('.st-vfx-canvas') }))
  check(made.kinds === before + 1 && made.rows === made.kinds && made.canvas, `a new kind is made and opens with its preview (${JSON.stringify(made)})`)
  // The preview runs the game's own burst code, so it paints without a bake.
  await page.waitForFunction(() => {
    const c = document.querySelector('.st-vfx-canvas')
    if (!c) return false
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 40 || d[i + 1] > 40) lit++
    return lit > 40
  }, { timeout: 8000 }).catch(() => {})
  const painted = await page.evaluate(() => {
    const c = document.querySelector('.st-vfx-canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 40 || d[i + 1] > 40) lit++
    return { lit, live: window.__studio.vfxPreview.parts.length }
  })
  check(painted.lit > 40 && painted.live > 0, `the preview integrates the burst the game would draw (${painted.lit} lit pixels, ${painted.live} specks)`)
  // Anything that names a kind by number offers them.
  const offered = await page.evaluate(() => {
    const S = window.__studio
    const ids = S.vfxChoices().map((c) => c[0])
    return { ids, mine: String(S.module.vfx[0].id), served: S.servedVfx.size }
  })
  check(offered.served > 0 && offered.ids.includes(offered.mine),
        `the kinds are offered wherever one is named: the module's ${offered.mine} beside ${offered.served} the app serves`)
  const emitted = await page.evaluate(async () => (await import('/studio/src/props_emit.js')).emitProps(window.__studio.module))
  check(/^vfx \d+ particles count \d+/m.test(emitted), `the catalogue carries the kind (${/vfx .*/.exec(emitted)?.[0]?.slice(0, 70)})`)
  await page.evaluate(() => { const S = window.__studio; S.module.vfx = []; S.moduleChanged(); return S.go('map') })
}

// A camera path, drawn the way a finger draws one: from the Camera sheet,
// tapped into the viewport, and then named by the level camera.
{
  await page.evaluate(() => { window.__studio.viewport.lookAt(8, 0, 0); window.__studio.viewport.viewHeight = 40; window.__studio.viewport.resize(); window.__studio.showCamera() })
  await page.evaluate(() => [...document.querySelectorAll('.st-sheet button')].find((b) => b.textContent === '+ new path').click())
  const armed = await page.evaluate(() => ({ tool: window.__studio.tool, editing: !!window.__studio.editedPath(), paths: window.__studio.doc.paths.length, sheet: window.__studio.ui.sheetOpen }))
  // The sheet STAYS: a waypoint's height is a number and a number needs
  // somewhere to be typed.
  check(armed.tool === 'path' && armed.editing && armed.paths === 1 && armed.sheet, `a new path opens for editing with its own sheet (${JSON.stringify(armed)})`)
  // Entering path mode swings the view to iso; let it draw a frame there
  // before aiming a tap, or the first one is aimed at the view being left.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  for (const [x, y] of [[2, -2], [10, -2], [10, 6]]) await tapAt(x, y)
  await page.waitForFunction(() => window.__studio.doc.paths[0]?.points.length === 3, { timeout: 5000 }).catch(() => {})
  const drawn = await page.evaluate(() => {
    const S = window.__studio
    const p = S.doc.paths[0]
    const curve = S.pathCurve(p)
    const chord = Math.hypot(10 - 2, 0) + Math.hypot(0, 6 + 2)
    return { points: p.points.map((pt) => [pt.x, pt.y]), curve: curve?.points.length, length: curve?.length, chord, handles: S.viewport.handles.children.filter((h) => h.userData.kind === 'pathpoint').length }
  })
  check(drawn.points.length === 3 && drawn.points[0][0] === 2 && drawn.points[2][1] === 6, `three taps make three points where they were tapped (${JSON.stringify(drawn.points)})`)
  check(drawn.handles === 3, `each point gets a handle of its own kind (${drawn.handles})`)
  // The curve bows outward at the corner, so it is longer than the polyline.
  check(drawn.curve > 24 && drawn.length > drawn.chord, `the curve is drawn and is longer than the line through the points (${drawn.length?.toFixed(2)} vs ${drawn.chord})`)
  // A TAP ON A WAYPOINT PICKS IT rather than dropping a second one on it, and
  // the sheet then edits that one's height.
  const picked = await page.evaluate(async () => {
    const S = window.__studio
    const p = S.doc.paths[0]
    const first = p.points[0]
    const before = p.points.length
    // The handle's own centre, which is what a finger aims at: the box is
    // drawn standing ON the waypoint, so the point itself is its bottom edge.
    const h = S.viewport.handles.children.find((x) => x.userData.id === first.id)
    const v = h.position.clone().project(S.viewport.camera)
    const scr = { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }
    return { before, scr, id: first.id }
  })
  await page.mouse.click(picked.scr.x, picked.scr.y)
  await new Promise((r) => setTimeout(r, 120))
  const sel = await page.evaluate(() => ({
    sel: window.__studio.pathPointSel, points: window.__studio.doc.paths[0].points.length,
    title: document.querySelector('.st-sheet-title')?.textContent,
    labels: [...document.querySelectorAll('.st-sheet .st-row label')].map((l) => l.textContent)
  }))
  check(sel.sel === picked.id && sel.points === picked.before, `tapping a waypoint picks it rather than adding another (${sel.points} points)`)
  check(sel.labels.includes('height'), `and its height is there to set (${sel.labels.filter((l) => /height|^x$|^y$/.test(l)).join(', ')})`)
  // Height, one waypoint and all of them.
  const heights = await page.evaluate(() => {
    const S = window.__studio
    const p = S.doc.paths[0]
    const rows = [...document.querySelectorAll('.st-sheet .st-row')]
    const one = rows.find((r) => r.querySelector('label')?.textContent === 'height')?.querySelector('input[type=range]')
    one.value = '5'; one.dispatchEvent(new Event('input', { bubbles: true })); one.dispatchEvent(new Event('change', { bubbles: true }))
    const picked = p.points.find((q) => q.id === S.pathPointSel).z
    const all = rows.find((r) => r.querySelector('label')?.textContent === 'height for every waypoint')?.querySelector('input[type=range]')
    all.value = '3'; all.dispatchEvent(new Event('input', { bubbles: true })); all.dispatchEvent(new Event('change', { bubbles: true }))
    return { picked, all: p.points.map((q) => q.z) }
  })
  check(heights.picked === 5, `one waypoint's height is set on its own (${heights.picked})`)
  check(heights.all.every((z) => z === 3), `and every waypoint's at once (${heights.all.join(', ')})`)

  // REARRANGING. The curve runs through the waypoints in order, so where one
  // sits in the list is part of the shape: the same points in another order
  // are another path.
  const order = () => page.evaluate(() => window.__studio.doc.paths[0].points.map((q) => `${q.x},${q.y}`))
  const before = await order()
  await page.evaluate(() => {
    const S = window.__studio
    S.selectPathPoint(S.doc.paths[0].points[2].id)
    ;[...document.querySelectorAll('.st-sheet button')].find((b) => b.textContent === '◀ earlier').click()
  })
  const reordered = await order()
  check(reordered[1] === before[2] && reordered[2] === before[1], `a waypoint moves one place along the curve (${before.join(' → ')} became ${reordered.join(' → ')})`)
  // The first cannot move earlier, and says so rather than moving.
  const stuck = await page.evaluate(() => {
    const S = window.__studio
    S.selectPathPoint(S.doc.paths[0].points[0].id)
    const b = [...document.querySelectorAll('.st-sheet button')].find((x) => x.textContent === '◀ earlier')
    const dim = b.className.includes('st-dim')
    b.click()
    return { dim, order: S.doc.paths[0].points.map((q) => `${q.x},${q.y}`) }
  })
  check(stuck.dim && stuck.order.join('|') === reordered.join('|'), 'CONTROL: the first waypoint has nowhere earlier to go, and the button says so')
  // Inserting puts one BETWEEN two, not at the end -- appending would change
  // where the shot finishes rather than how it gets there.
  const inserted = await page.evaluate(() => {
    const S = window.__studio
    S.selectPathPoint(S.doc.paths[0].points[0].id)
    ;[...document.querySelectorAll('.st-sheet button')].find((b) => b.textContent === '+ after this').click()
    const p = S.doc.paths[0]
    return { n: p.points.length, at: p.points.indexOf(p.points.find((q) => q.id === S.pathPointSel)), pts: p.points.map((q) => `${q.x},${q.y}`) }
  })
  check(inserted.n === reordered.length + 1 && inserted.at === 1, `a new waypoint goes between the picked one and the next (${inserted.pts.join(' → ')})`)
  // The order is on the map, or moving one has no visible effect.
  const numbered = await page.evaluate(() => {
    const S = window.__studio
    S.redraw()
    return S.viewport.markers.children.filter((m) => m.userData.kind === 'badge').length
  })
  check(numbered >= inserted.n, `every waypoint is numbered on the map (${numbered} badges for ${inserted.n} waypoints)`)
  await page.evaluate(() => {
    const S = window.__studio
    const p = S.doc.paths[0]
    p.points.splice(1, 1)
    S.commit()
  })

  // Dragging a point moves it; holding one removes it.
  {
    const a = await page.evaluate(() => { const p = window.__studio.doc.paths[0].points[2]; return window.__studio.viewport.toScreen(p.x, p.y, p.z) })
    const b = await page.evaluate(() => window.__studio.viewport.toScreen(14, 8, window.__studio.doc.paths[0].points[2].z))
    await page.mouse.move(a.x, a.y); await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up()
    await new Promise((r) => setTimeout(r, 120))
  }
  const moved = await page.evaluate(() => window.__studio.doc.paths[0].points[2])
  check(Math.abs(moved.x - 14) < 0.2 && Math.abs(moved.y - 8) < 0.2, `a point follows the drag (${moved.x},${moved.y})`)
  // The map it bakes carries the path, and the level camera names it by tag.
  const emitted = await page.evaluate(async () => {
    const S = window.__studio
    const { emitMap } = await import('/studio/src/mapfmt.js')
    const { derive, normalize } = await import('/studio/src/topology.js')
    normalize(S.doc)
    const e = emitMap(derive(S.doc), S.doc, [])
    S.doc.camera = { ...S.doc.camera, mode: 'flythrough', path: S.doc.paths[0].tag, speed: 6 }
    const { emitMapLua } = await import('/studio/src/lua_emit.js')
    return { map: e.text, lua: emitMapLua(S.doc, e).text, tag: S.doc.paths[0].tag }
  })
  check(new RegExp(`^path tag ${emitted.tag}$`, 'm').test(emitted.map) && /^  waypoint 2 -2 3$/m.test(emitted.map),
        `the map carries the path block, waypoints at the height they were set to (${/path tag[\s\S]{0,60}/.exec(emitted.map)?.[0].split('\n').join(' / ')})`)
  check(new RegExp(`cam_mode = 2, cam_path = ${emitted.tag}, cam_path_speed = 6000 / 1000`.replace(/[/]/g, '\\/')).test(emitted.lua), `the level camera rides it (${/level_camera\{[^}]*\}/.exec(emitted.lua)?.[0]})`)
  await page.keyboard.press('Escape')
  const left = await page.evaluate(() => ({ tool: window.__studio.tool, editing: !!window.__studio.editedPath() }))
  check(left.tool === 'select' && !left.editing, 'Escape leaves the path alone')
  await page.evaluate(() => { const S = window.__studio; S.doc.paths = []; S.doc.camera = { yaw: null, pitch: null, distance: null, lockYaw: false, lockZoom: false, mode: null, path: null, speed: null, attach: null, blend: null }; S.commit(); S.ui.hideSheet() })
}

// A new module is a copy of the starter: everything comes along, and the
// props get an id range of their own so both can be loaded together.
{
  const copy = await page.evaluate(async () => {
    const S = window.__studio
    const base = { id: 'starter', module: structuredClone(S.module), docs: structuredClone(S.docs), assets: S.rec.assets }
    base.module.id = 'starter'; base.module.propIdBase = 1000
    await S.store.save(base)
    const rec = await S.copyModule('starter', 'copy1', 'Copy One')
    const again = await S.copyModule('starter', 'copy2', 'Copy Two')
    return { id: rec?.id, name: rec?.module.name, maps: Object.keys(rec?.docs ?? {}), sheets: Object.keys(rec?.module.sprites ?? {}),
             base: rec?.module.propIdBase, firstId: rec?.module.props?.[0]?.id, base2: again?.module.propIdBase, assets: Object.keys(rec?.assets ?? {}).length }
  })
  check(copy.id === 'copy1' && copy.maps.length >= 1 && copy.sheets.includes('SPIR') && copy.assets >= 2, `the copy carries the maps, sheets and files (${JSON.stringify(copy)})`)
  check(copy.base >= 1100 && copy.firstId === copy.base && copy.base2 > copy.base, `each copy gets its own prop id range (${copy.base}, ${copy.base2})`)
}

// A door preset through the studio's own code path, on the sector between two rooms.
const preset = await page.evaluate(async () => {
  const S = window.__studio
  const { door } = await import('/studio/src/presets.js')
  const { addSector } = await import('/studio/src/doc.js')
  // A door sector between the starter room's right wall (x = 8) and the tapped room (x = 12).
  const d = addSector(S.doc, [{ x: 8, y: -2 }, { x: 12, y: -2 }, { x: 12, y: 2 }, { x: 8, y: 2 }], { floor: 0, ceil: 4 })
  S.commit()
  const r = door(S.doc, d.id)
  S.commit()
  return { ok: r.ok, n: r.triggers.length, problems: S.vocab.validateTriggers(S.doc) }
})
check(preset.ok && preset.n === 5 && preset.problems.length === 0, `the door preset writes five clean triggers (${JSON.stringify(preset)})`)
await page.waitForFunction(() => window.__studio.preview.busy === false, { timeout: 15000 }).catch(() => {})
s = await state()
check(s.ok, `the map with a door bakes (${s.status})`)

// The trigger sheet: a list, one row per trigger, and one trigger opened
// with its three marked sections.
await page.keyboard.press('4')
const listed = await page.evaluate(() => ({ rows: document.querySelectorAll('.st-trow').length, triggers: window.__studio.doc.triggers.length }))
check(listed.rows === listed.triggers && listed.rows >= 5, `the trigger sheet lists one row per trigger (${listed.rows} of ${listed.triggers})`)
const opened = await page.evaluate(() => {
  document.querySelector('.st-trow').click()
  return [...document.querySelectorAll('.st-sheet .st-section-head')].map((h) => h.textContent.trim().slice(0, 12))
})
check(opened.length === 3 && /WHEN/.test(opened[0]) && /IF/.test(opened[1]) && /THEN/.test(opened[2]), `a trigger opens with WHEN, IF and THEN sections (${opened.join(' | ')})`)
await page.keyboard.press('Escape')

// A pick lights every candidate; an open trigger lights what it touches, by
// section; and in landscape the sheet is a panel down the side.
{
  await page.evaluate(() => { window.__pick = window.__studio.pickInViewport(['edge'], 'tap a wall') })
  const lit = await page.evaluate(() => {
    const V = window.__studio.viewport
    return { segments: V.segments.visible ? V.segments.geometry.attributes.position.count / 2 : 0, sheetOpen: window.__studio.ui.sheetOpen }
  })
  check(lit.segments >= 20 && !lit.sheetOpen, `while picking a wall every wall is lit (${lit.segments} segments) and the sheet is out of the way`)
  await tapAt(16, -4.3)
  const picked = await page.evaluate(async () => ({ hit: await window.__pick, segments: window.__studio.viewport.segments.visible }))
  check(picked.hit?.kind === 'edge' && picked.segments === false, `the tap answers the pick and the lights go out (${JSON.stringify(picked.hit)})`)

  await page.keyboard.press('4')
  const shown = await page.evaluate(() => {
    ;[...document.querySelectorAll('.st-trow')].find((r) => /door: open/.test(r.textContent)).click()
    const S = window.__studio
    const tones = { if: 0x5b8fd6, then: 0x7ad48a }
    const lines = S.viewport.lines.children.map((l) => l.material.color.getHex())
    const badges = S.viewport.markers.children.filter((m) => m.userData.kind === 'badge').length
    return { refs: S.highlights.map((r) => `${r.tone}:${r.kind}`), ifLines: lines.filter((c) => c === tones.if).length, thenLines: lines.filter((c) => c === tones.then).length, badges }
  })
  check(shown.refs.some((r) => r === 'if:edge') && shown.refs.some((r) => r === 'if:sector') && shown.refs.some((r) => r === 'then:sector'),
        `the door's trigger names its wall and the room behind it, in IF and in THEN (${shown.refs.join(', ')})`)
  check(shown.ifLines >= 2 && shown.thenLines >= 1 && shown.badges >= 3, `they are drawn in the sections' colours with badges (${JSON.stringify(shown)})`)
  const panel = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.st-sheet'))
    const bar = getComputedStyle(document.querySelector('.st-bar'))
    return { left: cs.left, width: parseFloat(cs.width), top: cs.top, barRight: parseFloat(bar.right) }
  })
  check(panel.left !== '0px' && panel.width <= 450 && panel.top === '0px' && panel.barRight > 100, `in landscape the sheet is a side panel and the toolbar steps aside (${JSON.stringify(panel)})`)
  await page.evaluate(() => window.__studio.ui.hideSheet())
  const cleared = await page.evaluate(() => ({ refs: window.__studio.highlights.length, badges: window.__studio.viewport.markers.children.filter((m) => m.userData.kind === 'badge').length }))
  check(cleared.refs === 0 && cleared.badges === 0, 'closing the sheet clears the lights')
}

// WEATHER AND FOG: the sector inspector offers the engine's effect kinds with
// the engine's own defaults (a probe bake read back through readEffects), and
// the level view draws them with the game's own renderer.
{
  await page.waitForFunction(() => !!window.__studio.fxSchema, { timeout: 20000 }).catch(() => {})
  const fx = await page.evaluate(async () => {
    const S = window.__studio
    const sid = S.doc.order[0]
    S.select({ kind: 'sector', id: sid })
    const chip = [...document.querySelectorAll('.st-sheet .st-chip')].find((c) => /rain/.test(c.textContent))
    chip?.click()
    await new Promise((r) => setTimeout(r, 50))
    const card = document.querySelector('.st-sheet [data-fx="rain"]')
    const density = card ? [...card.querySelectorAll('.st-row')].find((r) => r.firstChild?.textContent === 'density')?.querySelector('input') : null
    return { schema: S.fxSchema?.rain?.density, fog: Object.keys(S.fxSchema?.fog ?? {}), doc: S.doc.sectors[sid].fx, card: !!card, placeholder: density?.placeholder }
  })
  check(fx.schema === 8 && fx.fog.includes('falloff') && !fx.fog.includes('speed'), `the effect keys and defaults are the engine's (${JSON.stringify({ rain: fx.schema, fog: fx.fog })})`)
  check(fx.card && fx.doc?.[0]?.kind === 'rain' && fx.placeholder === '8', `a sector gets rain from its inspector, its defaults shown greyed (${JSON.stringify(fx)})`)
  await page.waitForFunction(() => window.__studio.preview.busy === false && !!window.__studio.viewport.fx, { timeout: 20000 }).catch(() => {})
  const drawn = await page.evaluate(() => ({ fx: !!window.__studio.viewport.fx, counts: window.__studio.viewport.fx?.counts, animating: window.__studio.viewport.animating, ok: window.__studio.preview.last.ok }))
  check(drawn.ok && drawn.fx && drawn.counts?.[0] > 0 && drawn.animating, `and the level view rains, by the game's renderer (${JSON.stringify(drawn)})`)
  await page.evaluate(() => { const S = window.__studio; delete S.doc.sectors[S.doc.order[0]].fx; S.commit(); S.ui.hideSheet() })
  await page.waitForFunction(() => window.__studio.preview.busy === false && !window.__studio.viewport.fx, { timeout: 20000 }).catch(() => {})
  check(await page.evaluate(() => !window.__studio.viewport.fx && !window.__studio.viewport.animating), 'CONTROL: taking the rain away stops the drawing, and the view stops redrawing every frame')
}

// PANELS: what ui_open opens, edited on the trigger sheet and previewed by the
// client's own UiView.
{
  const panels = await page.evaluate(async () => {
    const S = window.__studio
    S.doc.panels = { shop: { title: 'Shop', widgets: [{ kind: 'button', id: 1, label: 'Buy' }] } }
    S.commit()
    S.triggerOpen = null
    const { triggersSheet } = await import('/studio/src/cards.js')
    S.ui.showSheet('Triggers', triggersSheet(S))
    const card = document.querySelector('.st-sheet [data-panel="shop"]')
    const add = card && [...card.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'slider'))
    if (add) { add.value = 'slider'; add.dispatchEvent(new Event('change')) }
    const again = document.querySelector('.st-sheet [data-panel="shop"]')
    const preview = again?.querySelector('.st-panel-preview .dnp-ui')
    return { widgets: S.doc.panels.shop.widgets.map((w) => `${w.kind}#${w.id}`), preview: !!preview, buttons: preview?.querySelectorAll('button').length ?? 0, sliders: preview?.querySelectorAll('input[type=range]').length ?? 0 }
  })
  check(panels.widgets.join() === 'button#1,slider#2', `a widget is added with the next free id (${panels.widgets.join(', ')})`)
  check(panels.preview && panels.buttons >= 1 && panels.sliders === 1, `the panel is previewed as the game draws it (${JSON.stringify(panels)})`)
  await page.evaluate(() => { const S = window.__studio; delete S.doc.panels; S.commit(); S.ui.hideSheet() })
}

// SOUNDS, and how the module is played: the Sounds sheet opens on whatever
// bank there is, and module.txt says controls, persistence and the game lines.
{
  const sounds = await page.evaluate(async () => {
    const S = window.__studio
    await S.showSounds()
    return { title: document.querySelector('.sd-head .sd-title')?.textContent, served: (S.servedSounds ?? []).length, rows: document.querySelectorAll('.sd-page [data-sound]').length,
             suggest: (S.suggest('name', 'sound') ?? []).length === S.soundNames().length && S.suggest('name', 'log') === null }
  })
  check(/Sounds/.test(sounds.title) && sounds.rows === sounds.served && sounds.suggest, `with no packs of its own, the Sounds page lists the app's sounds (${JSON.stringify(sounds)})`)

  // SOUND PACKS: two imported at once; a name both give is the higher pack's,
  // and the page says so; the merged bank is what Play writes.
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const doom = JSON.parse(readFileSync(new URL('../../modules/doom2/assets/sounds/bank.sfxproj', import.meta.url), 'utf8'))
  const dir = mkdtempSync(join(tmpdir(), 'dnp-packs-'))
  const weaponsPack = { ...doom, name: 'weapons', sounds: doom.sounds.filter((x) => x.name.startsWith('weapon.')) }
  const monstersPack = { ...doom, name: 'monsters', sounds: [...doom.sounds.filter((x) => x.name.startsWith('monster.')), weaponsPack.sounds[0]] }
  writeFileSync(join(dir, 'weapons.sfxproj'), JSON.stringify(weaponsPack))
  writeFileSync(join(dir, 'monsters.sfxproj'), JSON.stringify(monstersPack))
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 10000 }),
    page.evaluate(() => [...document.querySelectorAll('.sd-page button')].find((b) => /import sound packs/.test(b.textContent)).click())
  ])
  check(chooser.isMultiple(), 'several packs can be chosen at once')
  await chooser.accept([join(dir, 'weapons.sfxproj'), join(dir, 'monsters.sfxproj')])
  await page.waitForFunction(() => (window.__studio.module.sounds?.packs ?? []).length === 2, { timeout: 20000 }).catch(() => {})
  const packs = await page.evaluate(async () => {
    const S = window.__studio
    await new Promise((r) => setTimeout(r, 200))
    const { emitModule } = await import('/studio/src/module_emit.js')
    const assets = {}
    for (const [path, blob] of Object.entries(S.rec.assets)) assets[path] = new Uint8Array(await blob.arrayBuffer())
    const r = await emitModule(S.module, Object.values(S.docs), { bake: S.bake, runtime: S.runtime, assets })
    const bank = r.files.find((f) => f.path === 'assets/sounds/bank.sfxproj')
    return { ids: S.module.sounds.packs.map((p) => p.id), cards: document.querySelectorAll('.sd-page [data-pack]').length,
             collision: document.querySelector('.sd-page .st-warn-box')?.textContent ?? '', merged: bank ? JSON.parse(bank.bytes).sounds.length : 0,
             sources: r.files.filter((f) => f.path.startsWith('sources/sounds/')).length, names: S.moduleSounds.length }
  })
  check(packs.ids.join() === 'weapons,monsters' && packs.cards === 2, `both packs are the module's, in the order imported (${packs.ids.join(', ')})`)
  check(new RegExp(weaponsPack.sounds[0].name.replace(/\./g, '\\.')).test(packs.collision) && /weapons over monsters/.test(packs.collision),
        `the name both give is said, with whose is kept (${packs.collision.slice(0, 90)})`)
  check(packs.merged === weaponsPack.sounds.length + monstersPack.sounds.length - 1 && packs.names === packs.merged && packs.sources === 2,
        `the module writes one merged bank, and keeps both packs as sources (${JSON.stringify(packs)})`)
  // In a monster, a sound is picked from the packs, grouped, and heard.
  const picked = await page.evaluate(async (want) => {
    const S = window.__studio
    const { newMonster } = await import('/studio/src/brain.js')
    const name = newMonster(S, 'howler')
    const m = S.module.mobs.mobs[name]
    const st = Object.keys(m.states)[0]
    m.states[st].sequence = [{ at: 0, action: 'sound', name: '' }]
    S.moduleChanged()
    await S.go('monsters', name)
    S.workshop.state = st; S.workshop.tab = 'node'; S.workshop.render()
    const sel = document.querySelector('.wk-details select.st-sound')
    const groups = sel ? [...sel.querySelectorAll('optgroup')].map((g) => g.label) : []
    if (sel) { sel.value = want; sel.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 100))
    const after = S.module.mobs.mobs[name].states[st].sequence[0].name
    delete S.module.mobs.mobs[name]; S.moduleChanged()
    return { groups, after, play: !!sel?.parentElement?.querySelector('button') }
  }, monstersPack.sounds[0].name)
  check(picked.groups.includes('weapons') && picked.groups.includes('monsters') && picked.after === monstersPack.sounds[0].name && picked.play,
        `a monster's sound is picked from the packs, grouped by pack, with a ▶ (${JSON.stringify(picked)})`)
  await page.evaluate(async () => { const S = window.__studio; S.module.sounds.packs = []; for (const k of Object.keys(S.rec.assets)) if (k.startsWith('sources/')) delete S.rec.assets[k]; await S.loadPacks(); S.moduleChanged(); await S.go('map') })
  const txt = await page.evaluate(async () => {
    const S = window.__studio
    const { moduleTxt } = await import('/studio/src/module_emit.js')
    const before = { controls: S.module.controls, persist: S.module.persist }
    S.module.controls = 'fps'; S.module.persist = ['levels', 'saves']
    const t = moduleTxt(S.module)
    S.module.controls = before.controls; S.module.persist = before.persist
    S.ui.hideSheet()
    return t
  })
  check(/^controls fps$/m.test(txt) && /^persist levels$/m.test(txt) && /^persist saves$/m.test(txt) && !/persist server/.test(txt), `module.txt carries the controls and what the module keeps (${txt.split('\n').slice(2).join(' | ')})`)
}

// SCREENS: the HUD, touch controls and panel templates, drawn in a device frame
// by the client's own HudView, edited by dragging.
{
  const opened = await page.evaluate(async () => {
    const S = window.__studio
    delete S.module.ui
    await S.go('screens')
    const w = S.window
    w.device = 'phone, landscape'; w.tab = 'hud'; w.render()
    await new Promise((r) => setTimeout(r, 200))
    return { hud: !!document.querySelector('.sc .sc-frame .dnp-hud'), hits: document.querySelectorAll('.sc .sc-hit-hud').length, moduleUi: !!S.module.ui,
             tabs: [...document.querySelectorAll('.sc .wk-top .sc-tabs button')].filter((b) => b.offsetParent).length }
  })
  check(opened.hud && opened.hits >= 1 && opened.tabs === 5, `the Screens window draws the HUD in a device frame, its switches visible (${JSON.stringify(opened)})`)
  check(!opened.moduleUi, 'and looking is not choosing: the module has no layout of its own yet')
  const box = await page.evaluate(() => { const r = document.querySelector('.sc .sc-hit-hud').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: document.querySelector('.sc .sc-hit-hud').dataset.el } })
  const frameBox = await page.evaluate(() => { const r = document.querySelector('.sc .sc-frame').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  // Drag the health block to the bottom right of the screen.
  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 4 })
  await page.mouse.move(frameBox.x + frameBox.w * 0.8, frameBox.y + frameBox.h * 0.85, { steps: 6 })
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 300))
  const dragged = await page.evaluate((id) => {
    const S = window.__studio
    const e = S.module.ui?.hud.find((x) => x.id === id)
    return { ui: !!S.module.ui, anchor: e?.anchor, x: e?.x, y: e?.y, picked: document.querySelector('.sc .st-trow[data-on="1"]')?.dataset.el }
  }, box.id)
  check(dragged.ui && dragged.anchor === 'br' && dragged.x < 0 && dragged.y < 0 && dragged.picked === box.id,
        `dragging an element to the bottom right re-anchors it there, and the module now has a layout (${JSON.stringify(dragged)})`)
  const files = await page.evaluate(async () => {
    const S = window.__studio
    const { uiFiles } = await import('/studio/src/ui_emit.js')
    const { parseLayout } = await import('/src/render/layout.js')
    const f = uiFiles(S.module, Object.values(S.docs))
    return { paths: f.map((x) => x.path), ok: parseLayout(JSON.parse(f.find((x) => x.path.endsWith('hud.json')).bytes)).ok }
  })
  check(files.paths.includes('assets/ui/index.json') && files.paths.includes('assets/ui/hud.json') && files.ok, `and it is written as files the client parses (${files.paths.join(', ')})`)
  const touch = await page.evaluate(async () => {
    const S = window.__studio
    S.workshop?.close?.()
    await S.go('screens')
    const w = S.window
    w.tab = 'touch'; w.render()
    const card = document.querySelector('.sc .wk-details [data-btn="dash"]')
    card.querySelector('.st-row + .st-row button, .st-row:nth-child(2) button').click()
    await new Promise((r) => setTimeout(r, 100))
    return { hidden: S.module.ui.touch?.buttons?.find((b) => b.id === 'dash')?.hidden, drawn: [...document.querySelectorAll('.sc .sc-btn')].map((b) => b.dataset.btn) }
  })
  check(touch.hidden === true && !touch.drawn.includes('dash') && touch.drawn.includes('jump'), `a touch button can be hidden, and the frame stops drawing it (${JSON.stringify(touch)})`)
  const panel = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('screens')
    const w = S.window
    w.tab = 'panels'; w.render()
    ;[...document.querySelectorAll('.sc .wk-details button')].find((b) => /template/.test(b.textContent)).click()
    await new Promise((r) => setTimeout(r, 100))
    ;[...document.querySelectorAll('.sc .wk-details button')].find((b) => /\+ slot/.test(b.textContent)).click()
    await new Promise((r) => setTimeout(r, 200))
    const t = Object.values(S.module.ui.panels)[0]
    return { slots: t?.slots?.length, preview: !!document.querySelector('.sc .sc-frame .dnp-ui') }
  })
  check(panel.slots === 1 && panel.preview, `a panel template with a slot, previewed by the client's UiView (${JSON.stringify(panel)})`)
  await page.evaluate(async () => { const S = window.__studio; await S.go('map'); delete S.module.ui; S.moduleChanged() })
}

// GRAPHS: a map's graph built in its window -- nodes from the vocabulary, a
// link drawn by dragging from one pin to another -- and baked with the map.
{
  const built = await page.evaluate(async () => {
    const S = window.__studio
    delete S.doc.graph
    S.commit()
    await S.go('graph')
    const w = S.window
    const pal = () => document.querySelector('.gw .wk-top select')
    const pick = (v) => { const s = pal(); s.value = v; s.dispatchEvent(new Event('change')) }
    pick('event:on_interact')
    pick('act:')
    await new Promise((r) => setTimeout(r, 300))
    return { nodes: S.doc.graph?.nodes.map((n) => `${n.type}:${n.id}`), drawn: document.querySelectorAll('.gw .gw-node').length }
  })
  check(built.nodes?.join() === 'event:interact,action:do' && built.drawn === 2, `nodes are added from the vocabulary's menu and drawn (${JSON.stringify(built)})`)
  const pins = await page.evaluate(() => {
    const c = (sel) => { const r = document.querySelector(sel).querySelector('.gw-dot').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }
    return { from: c('.gw-pin[data-pin="interact.then"][data-dir="out"]'), to: c('.gw-pin[data-pin="do.in"][data-dir="in"]') }
  })
  await page.mouse.move(pins.from.x, pins.from.y)
  await page.mouse.down()
  await page.mouse.move((pins.from.x + pins.to.x) / 2, pins.to.y + 20, { steps: 5 })
  await page.mouse.move(pins.to.x, pins.to.y, { steps: 5 })
  await page.mouse.up()
  await page.waitForFunction(() => window.__studio.preview.busy === false, { timeout: 20000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  const linked = await page.evaluate(async () => {
    const S = window.__studio
    const { emitLevel } = await import('/studio/src/module_emit.js')
    const r = await emitLevel(S.module, S.doc, { bake: S.bake, runtime: S.runtime, hooks: S.vocab.trigger.events.map((e) => e.name) })
    return { links: S.doc.graph?.links, curves: document.querySelectorAll('.gw .gw-link').length, ok: r.ok, errors: r.errors.map((e) => e.msg),
             declares: /script first\.graph\.json/.test(r.mapText), file: r.graphText && JSON.parse(r.graphText).links }
  })
  check(JSON.stringify(linked.links) === JSON.stringify([['interact.then', 'do.in']]) && linked.curves === 1, `dragging from a pin to a pin links them (${JSON.stringify(linked.links)})`)
  check(linked.ok && linked.declares && linked.file?.length === 1, `and the map bakes declaring its graph (${linked.errors.join(' | ') || 'no errors'})`)
  const undone = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('graph')
    const w = S.window
    w.picked = { kind: 'node', id: 'do' }; w.render()
    ;[...document.querySelectorAll('.gw .wk-details button')].find((b) => /delete node/.test(b.textContent)).click()
    await new Promise((r) => setTimeout(r, 100))
    const after = { nodes: S.doc.graph?.nodes.length, links: S.doc.graph?.links.length }
    w.close()
    delete S.doc.graph; S.commit()
    return after
  })
  check(undone.nodes === 1 && undone.links === 0, `deleting a node takes its links with it (${JSON.stringify(undone)})`)
}

// THE GRAPH BOARD: fields edited on the nodes themselves, links with arrows,
// and places, rooms and things picked on the map for a node's arguments.
{
  const setup = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map', Object.keys(S.docs)[0])
    const { addEntity } = await import('/studio/src/doc.js')
    const sid = S.doc.order[0]
    const room = S.doc.sectors[sid]
    const cx = room.verts.reduce((a, v) => a + v.x, 0) / room.verts.length
    const cy = room.verts.reduce((a, v) => a + v.y, 0) / room.verts.length
    room.tag = 0
    // Only this monster on the map, so the tap that picks it can mean nothing else.
    window.__keptEntities = S.doc.entities
    S.doc.entities = []
    const mob = addEntity(S.doc, 'mob', 'imp', cx + 1, cy, room.floor)
    S.doc.graph = { vars: {}, links: [['press.then', 'tp.in']], nodes: [
      { id: 'press', type: 'event', event: 'on_interact', pos: { x: 0, y: 0 } },
      { id: 'tp', type: 'action', a: 'teleport', pos: { x: 280, y: 0 } },
      { id: 'tag', type: 'condition', c: 'sector_tag_is', pos: { x: 0, y: 260 } },
      { id: 'kind', type: 'condition', c: 'entity_kind_is', pos: { x: 280, y: 260 } },
      { id: 'wait', type: 'delay', ticks: 30, pos: { x: 560, y: 0 } }] }
    S.commit()
    await S.go('graph')
    await new Promise((r) => setTimeout(r, 300))
    const node = (id) => document.querySelector(`.gw [data-node="${id}"]`)
    // A field on the board: the delay's ticks, changed where it is drawn.
    const ticks = [...node('wait').querySelectorAll('.st-row')].find((r) => r.firstChild?.textContent === 'ticks')?.querySelector('input')
    if (ticks) { ticks.value = '90'; ticks.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 100))
    const link = document.querySelector('.gw .wk-edge.gw-exec-link')
    return { sid, mob: mob.id, center: { x: cx, y: cy, floor: room.floor }, ticks: S.doc.graph.nodes.find((n) => n.id === 'wait').ticks,
             arrow: link?.getAttribute('marker-end') ?? null, pointBtn: !!node('tp')?.querySelector('button') }
  })
  check(setup.ticks === 90, `a node's field is edited on the board itself (ticks ${setup.ticks})`)
  check(/gw-arrow-exec/.test(setup.arrow ?? ''), `a link ends in an arrow showing which way it runs (${setup.arrow})`)
  // Dragging a link lights up the inputs it could go to.
  const lit = await page.evaluate(async () => {
    const pin = document.querySelector('.gw [data-pin="press.then"][data-dir="out"]')
    const r = pin.querySelector('.gw-dot').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.move(lit.x, lit.y); await page.mouse.down(); await page.mouse.move(lit.x + 40, lit.y + 30, { steps: 3 })
  const during = await page.evaluate(() => ({ linking: document.querySelector('.gw .wk-world').dataset.linking,
    glow: getComputedStyle(document.querySelector('.gw [data-pin="wait.in"][data-dir="in"] .gw-dot')).backgroundColor }))
  await page.mouse.up()
  check(during.linking === 'exec' && /102, 255, 153/.test(during.glow), `while a link is dragged the inputs it can reach light up (${JSON.stringify(during)})`)
  // Picks on the map, from the nodes: the board steps aside, the tap fills the fields.
  const tapWorld = async (x, y, z = 0) => { const p = await page.evaluate(([x, y, z]) => window.__studio.viewport.toScreen(x, y, z), [x, y, z]); await page.mouse.click(p.x, p.y); await new Promise((r) => setTimeout(r, 150)) }
  const clickIn = (id, text) => page.evaluate(([id, text]) => [...document.querySelectorAll(`.gw [data-node="${id}"] button`)].find((b) => b.textContent.includes(text)).click(), [id, text])
  await page.evaluate(() => { const S = window.__studio; S.viewport.setMode('plan'); S.ui.setView('plan') })
  await clickIn('tp', 'pick a point')
  await new Promise((r) => setTimeout(r, 150))
  const hidden = await page.evaluate(() => document.querySelector('.sd-page').hidden)
  await tapWorld(setup.center.x - 1, setup.center.y + 1, setup.center.floor)
  await clickIn('tag', '📍')
  await new Promise((r) => setTimeout(r, 150))
  await tapWorld(setup.center.x - 2, setup.center.y - 1, setup.center.floor)
  await clickIn('kind', '📍')
  await new Promise((r) => setTimeout(r, 150))
  await tapWorld(setup.center.x + 1, setup.center.y, setup.center.floor + 0.5)
  await new Promise((r) => setTimeout(r, 200))
  const picked = await page.evaluate((sid) => {
    const S = window.__studio
    const n = (id) => S.doc.graph.nodes.find((x) => x.id === id)
    return { tp: [n('tp').x, n('tp').y, n('tp').z], tag: n('tag').tag, roomTag: S.doc.sectors[sid].tag, kind: n('kind').name, back: !document.querySelector('.sd-page').hidden }
  }, setup.sid)
  check(hidden, 'picking on the map steps the board aside')
  check(Math.abs(picked.tp[0] - (setup.center.x - 1)) < 0.3 && Math.abs(picked.tp[1] - (setup.center.y + 1)) < 0.3 && picked.tp[2] === setup.center.floor,
        `a teleport's place is a tap on the floor, at that floor (${JSON.stringify(picked.tp)})`)
  check(picked.tag > 0 && picked.tag === picked.roomTag, `a tag is a tap on the room, which is given one if it had none (${picked.tag}/${picked.roomTag})`)
  check(picked.kind === 'imp' && picked.back, `a thing's name is a tap on one placed on the map, and the board comes back (${JSON.stringify(picked)})`)
  await page.evaluate(async (mob) => { const S = window.__studio; delete S.doc.graph; S.doc.entities = window.__keptEntities; S.commit(); S.viewport.setMode('iso'); S.ui.setView('iso'); await S.go('map') }, setup.mob)
}

// THE GAME'S GRAPH: listed with the maps' in the Graphs section, edited with
// only the words the game has, a call to the level answered by a map's
// on_call whose value is linked straight into an action's argument.
{
  const listed = await page.evaluate(async () => {
    const S = window.__studio
    delete S.module.graph
    S.moduleChanged()
    await S.go('graphs')
    const rows = [...document.querySelectorAll('[data-graph]')].map((r) => r.dataset.graph)
    document.querySelector('[data-graph="game"]').click()
    await new Promise((r) => setTimeout(r, 300))
    const opts = [...document.querySelector('.gw .wk-top select').options].map((o) => o.value)
    return { rows, maps: Object.keys(S.docs), scope: S.window?.scope, title: document.querySelector('.gw .wk-title')?.textContent, opts }
  })
  check(listed.rows[0] === 'game' && listed.maps.every((m) => listed.rows.includes(m)), `the Graphs section lists the game's graph, then every map's (${listed.rows.join(', ')})`)
  check(listed.scope === 'game' && /game/.test(listed.title ?? ''), `and opens the game's (${listed.title})`)
  check(listed.opts.includes('event:on_player_enter') && !listed.opts.includes('event:on_interact') && listed.opts.includes('node:call') && listed.opts.includes('node:on_call'),
        'its menu offers what the game hears and calls, not a level\'s events')
  const game = await page.evaluate(async () => {
    const S = window.__studio
    const pick = (v) => { const s = document.querySelector('.gw .wk-top select'); s.value = v; s.dispatchEvent(new Event('change')) }
    pick('event:on_player_enter')
    pick('node:call')
    await new Promise((r) => setTimeout(r, 200))
    const verbs = (() => { pick('act:'); return [...document.querySelector('.gw [data-node="do"] select').options].map((o) => o.value) })()
    return { nodes: S.module.graph?.nodes.map((n) => `${n.type}:${n.id}`), call: S.module.graph?.nodes.find((n) => n.type === 'call'), verbs, mapGraph: !!S.doc.graph }
  })
  check(game.nodes?.join() === 'event:player_enter,call:call,action:do' && game.call?.to === 'level' && !game.mapGraph,
        `nodes go into the module's graph, not the map's; a call from the game goes to the level (${JSON.stringify(game.nodes)})`)
  check(game.verbs.includes('counter_add') && !game.verbs.includes('sector_move') && !game.verbs.includes('teleport'), 'its actions are the game\'s only')
  // The level answers: on_call 'reward', whose value is the counter's step.
  const lvl = await page.evaluate(async () => {
    const S = window.__studio
    const g = S.module.graph
    g.nodes = g.nodes.filter((n) => n.id !== 'do')
    g.nodes.find((n) => n.type === 'call').name = 'reward'
    g.links = [['player_enter.then', 'call.in'], ['player_enter.entity', 'call.entity']]
    S.moduleChanged()
    await S.go('graphs')
    const unanswered = [...document.querySelectorAll('[data-unanswered]')].map((x) => x.dataset.unanswered)
    const name = Object.keys(S.docs)[0]
    S.docs[name].graph = { vars: {}, nodes: [
      { id: 'heard', type: 'on_call', name: 'reward', pos: { x: 0, y: 0 } },
      { id: 'add', type: 'action', a: 'counter_add', counter: 'gold', pos: { x: 320, y: 0 } }], links: [['heard.then', 'add.in']] }
    document.querySelector(`[data-graph="${name}"]`).click()
    await new Promise((r) => setTimeout(r, 600))
    S.commit()
    await new Promise((r) => setTimeout(r, 200))
    const row = document.querySelector('.gw [data-node="add"] .gw-argrow[data-arg="counter"]')
    return { unanswered, scope: S.window?.scope, doc: S.docName, name, rowPin: !!row?.querySelector('.gw-pin[data-pin="add.counter"]'),
             more: !!document.querySelector('.gw [data-node="add"] .gw-more') }
  })
  check(lvl.unanswered.includes('reward'), 'a call nothing answers is said')
  check(lvl.scope === 'map' && lvl.doc === lvl.name, `a map's graph opens from the list, with its map (${lvl.scope}, ${lvl.doc})`)
  check(lvl.rowPin && lvl.more, 'an argument\'s data pin sits in its row on the node, and optional arguments can be brought on')
  // Show `by`, then drag heard.value into its pin.
  await page.evaluate(async () => {
    const sel = document.querySelector('.gw [data-node="add"] .gw-more')
    sel.value = 'by'; sel.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 200))
  })
  const ends = await page.evaluate(() => {
    const c = (sel) => { const r = document.querySelector(sel)?.querySelector('.gw-dot')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null }
    return { from: c('.gw-pin[data-pin="heard.value"][data-dir="out"]'), to: c('.gw-argrow .gw-pin[data-pin="add.by"]') }
  })
  if (ends.from && ends.to) {
    await page.mouse.move(ends.from.x, ends.from.y); await page.mouse.down()
    await page.mouse.move((ends.from.x + ends.to.x) / 2, ends.to.y + 10, { steps: 5 }); await page.mouse.move(ends.to.x, ends.to.y, { steps: 5 }); await page.mouse.up()
    await new Promise((r) => setTimeout(r, 300))
  }
  const fed = await page.evaluate(async () => {
    const S = window.__studio
    const row = document.querySelector('.gw [data-node="add"] [data-arg="by"]')
    const { graphProblems } = await import('/studio/src/graphs_emit.js')
    const r = await S.emitAll()
    await S.go('graphs')
    return { links: S.doc.graph.links, row: row?.textContent ?? '', curve: document.querySelectorAll('.gw .gw-data-link').length,
             problems: graphProblems(S.doc.graph, S.vocab.graph, S.vocab.trigger), ok: !!r,
             files: (r?.files ?? []).map((f) => f.path).filter((p) => /graph|module\.txt/.test(p)),
             txt: r ? String(r.files.find((f) => f.path === 'module.txt').bytes) : '',
             unanswered: [...document.querySelectorAll('[data-unanswered]')].length }
  })
  check(fed.links.some(([f, t]) => f === 'heard.value' && t === 'add.by') && /← heard\.value/.test(fed.row), `a value dragged into an argument's pin feeds it, and the field says so (${JSON.stringify(fed.links)} / ${fed.row})`)
  check(fed.ok && fed.files.includes('maps/module.graph.json') && /game graphs\.lua shared/.test(fed.txt), `the module is written with its game graph (${fed.files.join(', ')})`)
  check(fed.unanswered === 0, 'and with the map answering, no call is left unanswered')
  await page.evaluate(async () => { const S = window.__studio; delete S.module.graph; S.moduleChanged(); delete S.doc.graph; S.commit(); await S.go('map') })
}

// WRONG ROOMS: a room that makes the bake fail is marked on the map in red and
// explained in its inspector; fixing it clears the mark.
{
  const marked = await page.evaluate(async () => {
    const S = window.__studio
    const { addSector } = await import('/studio/src/doc.js')
    const o = S.doc.sectors[S.doc.order[0]]
    const xs = o.verts.map((v) => v.x); const ys = o.verts.map((v) => v.y)
    const x = Math.max(...xs) - 1; const y = Math.max(...ys) - 1
    // Half in, half out of the first room: an overlap mapc refuses.
    const bad = addSector(S.doc, [{ x, y }, { x: x + 4, y }, { x: x + 4, y: y + 4 }, { x, y: y + 4 }], { floor: o.floor, ceil: o.ceil })
    S.commit()
    await new Promise((r) => { const t = setInterval(() => { if (!S.preview.busy && S.preview.last.problems) { clearInterval(t); r() } }, 50) })
    await new Promise((r) => setTimeout(r, 200))
    S.select({ kind: 'sector', id: bad.id })
    return { id: bad.id, first: S.doc.order[0], ok: S.preview.last.ok, rooms: [...new Set((S.problems ?? []).map((p) => p.sector))],
             badge: S.viewport.markers.children.some((m) => m.userData.kind === 'badge' && /wrong/.test(m.userData.label ?? '')),
             said: document.querySelector('.st-sheet .st-problem')?.textContent ?? '', status: S.ui.status.textContent }
  })
  check(!marked.ok && marked.rooms.includes(marked.id) && marked.rooms.includes(marked.first), `a room that breaks the bake is marked, with the room it overlaps (${JSON.stringify(marked.rooms)})`)
  check(/overlaps/.test(marked.said) && /wrong/.test(marked.status), `its inspector says why, and the status says how many (${marked.said.slice(0, 80)})`)
  const cleared = await page.evaluate(async (id) => {
    const S = window.__studio
    const { removeSector } = await import('/studio/src/doc.js')
    removeSector(S.doc, id); S.select(null); S.commit()
    await new Promise((r) => setTimeout(r, 100))
    await new Promise((r) => { const t = setInterval(() => { if (!S.preview.busy) { clearInterval(t); r() } }, 50) })
    return { ok: S.preview.last.ok, problems: (S.problems ?? []).length }
  }, marked.id)
  check(cleared.ok && cleared.problems === 0, `fixing it clears the mark (${JSON.stringify(cleared)})`)
}

// THE MODULE'S TEXTURES, SCRIPTS AND UNDO: pages of their own.
{
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 10000 }),
    page.evaluate(async () => { await window.__studio.go('textures'); window.__texDone = window.__studio.importTexture() })
  ])
  await chooser.accept([new URL('../../modules/starter/assets/textures/ROCKWALL1.png', import.meta.url).pathname])
  await page.evaluate(() => window.__texDone)
  const tex = await page.evaluate(async () => {
    const S = window.__studio
    const sid = S.doc.order[0]
    S.doc.sectors[sid].floorTex = 'ROCKWALL1'
    S.commit()
    await S.showTextures('ROCKWALL1')
    const card = document.querySelector('.sd-page [data-open-texture="ROCKWALL1"]')
    return { own: !!S.module.textures?.ROCKWALL1, tile: !!document.querySelector('.sd-page [data-texture="ROCKWALL1"]'), card: card?.textContent ?? '' }
  })
  check(tex.own && tex.tile && /used 1 time/.test(tex.card), `an imported texture is the module's, shown with where it is used (${tex.card.slice(0, 60)})`)
  const renamed = await page.evaluate(async () => {
    const S = window.__studio
    ;[...document.querySelectorAll('.sd-page [data-open-texture] button')].find((b) => b.textContent === 'rename').click()
    await new Promise((r) => setTimeout(r, 100))
    const i = document.querySelector('dialog[open] input'); i.value = 'CAVEWALL'
    document.querySelector('dialog[open] button[type=submit]').click()
    await new Promise((r) => setTimeout(r, 200))
    return { floor: S.doc.sectors[S.doc.order[0]].floorTex, own: Object.keys(S.module.textures), asset: !!S.rec.assets['textures/CAVEWALL.png'] }
  })
  check(renamed.floor === 'CAVEWALL' && renamed.own.includes('CAVEWALL') && !renamed.own.includes('ROCKWALL1') && renamed.asset,
        `renaming a texture follows it onto every surface that names it (${JSON.stringify(renamed)})`)
  // Undo on a page is the module's.
  const undone = await page.evaluate(async () => {
    const S = window.__studio
    document.querySelector('.sd-head [data-action="undo"]').click()
    await new Promise((r) => setTimeout(r, 200))
    return { own: Object.keys(S.module.textures ?? {}), floor: S.doc.sectors[S.doc.order[0]].floorTex }
  })
  check(undone.own.includes('ROCKWALL1') && !undone.own.includes('CAVEWALL') && undone.floor === 'ROCKWALL1',
        `undo on a page undoes the module's last change, the maps it reached into included (${JSON.stringify(undone)})`)
  await page.evaluate(() => { const S = window.__studio; S.doc.sectors[S.doc.order[0]].floorTex = null; delete S.module.textures.ROCKWALL1; delete S.module.textures.CAVEWALL; S.commit(); S.moduleChanged() })

  const scripts = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('scripts')
    ;[...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ script').click()
    await new Promise((r) => setTimeout(r, 100))
    document.querySelector('dialog[open] button[type=submit]').click()
    await new Promise((r) => setTimeout(r, 200))
    const area = document.querySelector('.sd-page textarea[data-editing]')
    area.value = 'function on_tick() end\n'; area.dispatchEvent(new Event('change'))
    const { emitModuleLua } = await import('/studio/src/module_emit.js')
    const lua = emitModuleLua(S.module, { hooks: S.vocab.trigger.events.map((e) => e.name) })
    const r = { names: Object.keys(S.module.scripts), lua: /function on_tick\(\) end/.test(lua ?? '') }
    S.module.scripts = {}; S.moduleChanged()
    return r
  })
  check(scripts.names.includes('module_hooks.lua') && scripts.lua, `a module script is made and edited on its page, and goes into the module's Lua (${scripts.names.join(', ')})`)
  await page.evaluate(() => window.__studio.go('map'))
}

// THE METAMAP: two maps put side by side on the grid, one shared world; the
// map editor draws the neighbour where it sits and colours the seam.
{
  const placed = await page.evaluate(async () => {
    const S = window.__studio
    const { newDoc, addSector, addSpawn } = await import('/studio/src/doc.js')
    const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
    for (const [n, open] of [['west', 1], ['east', 3]]) {
      const d = newDoc(n); const sc = addSector(d, rect(0, 0, 16, 8), { floorTex: S.textureNames[0], ceilTex: S.textureNames[0] }); addSpawn(d, 'start', 2, 2)
      sc.verts[open].edge.force = 'open'
      S.docs[n] = d
    }
    S.module.metamap = { enabled: true, pitch: [16, 16], radius: 1, cells: {} }
    S.moduleChanged()
    await S.go('maps')
    const tap = (sel) => document.querySelector(sel).click()
    tap('.sd-page [data-loose="west"]'); await new Promise((r) => setTimeout(r, 50))
    tap('.sd-page [data-cell="0,0"]'); await new Promise((r) => setTimeout(r, 50))
    tap('.sd-page [data-loose="east"]'); await new Promise((r) => setTimeout(r, 50))
    tap('.sd-page [data-cell="1,0"]'); await new Promise((r) => setTimeout(r, 50))
    return { cells: S.module.metamap.cells, grid: [...document.querySelectorAll('.sd-page [data-cell-map]')].map((c) => c.dataset.cellMap) }
  })
  check(JSON.stringify(placed.cells) === JSON.stringify({ west: [0, 0], east: [1, 0] }) && placed.grid.includes('west') && placed.grid.includes('east'),
        `maps are put in cells by tapping (${JSON.stringify(placed.cells)})`)
  await page.evaluate(() => window.__studio.go('map', 'west'))
  await page.waitForFunction(() => window.__studio.viewport.neighbours.children.length === 1 && (window.__studio.seams ?? []).length > 0, { timeout: 20000 }).catch(() => {})
  const near = await page.evaluate(() => {
    const S = window.__studio
    const nb = S.viewport.neighbours.children[0]
    return { drawn: S.viewport.neighbours.children.length, at: nb ? [nb.position.x, nb.position.z] : null, seams: (S.seams ?? []).map((x) => `${x.state}:${x.with}`),
             badge: S.viewport.markers.children.some((m) => m.userData.kind === 'badge' && m.userData.label === 'east') }
  })
  check(near.drawn === 1 && near.at?.[0] === 16 && near.badge, `the map editor draws the neighbour one pitch east, named (${JSON.stringify(near)})`)
  check(near.seams.includes('joined:east'), `and the side both maps opened is a joined seam (${near.seams.join(', ')})`)
  const txt = await page.evaluate(async () => {
    const S = window.__studio
    const { metamapText } = await import('/studio/src/metamap.js')
    const t = metamapText(S.module.metamap)
    delete S.docs.west; delete S.docs.east; S.module.metamap = { enabled: false, pitch: null, radius: 1, cells: {} }; S.moduleChanged()
    await S.go('map', Object.keys(S.docs)[0])
    return t
  })
  check(/^pitch 16 16$/m.test(txt) && /^cell 1 0 east$/m.test(txt), 'and the module writes the grid as the server reads it')
}

// WHAT IS WRONG, ANYWHERE: the module's home lists it, each line a way to it,
// and the rail counts it by section.
{
  const listed = await page.evaluate(async () => {
    const S = window.__studio
    const { newDoc, addSector, addSpawn } = await import('/studio/src/doc.js')
    const d = newDoc('broken'); addSector(d, [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }]); addSpawn(d, 'start', 1, 1)
    d.sectors[d.order[0]].ceil = -2
    S.docs.broken = d
    S.moduleChanged()
    await S.go('home')
    await new Promise((r) => setTimeout(r, 600))
    const line = document.querySelector('.sd-page .sd-problem[data-problem="map"]')
    const badge = document.querySelector('.sd-rail [data-section="maps"] .sd-badge')?.textContent
    line?.click()
    await new Promise((r) => setTimeout(r, 200))
    const r = { text: line?.textContent ?? '', badge, route: S.route(), doc: S.docName }
    delete S.docs.broken; S.moduleChanged()
    await S.go('map', Object.keys(S.docs)[0])
    return r
  })
  check(/broken.*below floor/.test(listed.text) && listed.badge === '1', `the home lists a map's problem and the rail counts it (${JSON.stringify(listed)})`)
  check(listed.route === 'map' && listed.doc === 'broken', 'tapping the line opens the map it is about')
}

// THE PLAYER'S SOUNDS AND SCALE, and the window readable on a phone.
{
  const pl = await page.evaluate(async () => {
    const S = window.__studio
    const { newProp } = await import('/studio/src/props.js')
    const prop = S.module.props.find((p) => p.name === 'ghost') ?? S.module.props[0]
    S.module.player = { ...(S.module.player ?? {}), prop: prop.name, body: { radius: 0.5, height: 2 }, moves: { move_speed: { mul: 2 } } }
    S.moduleChanged()
    await S.go('player')
    S.workshop.tab = 'skin'; S.workshop.render()
    const scaleRow = [...document.querySelectorAll('.wk-details .st-row')].find((r) => /drawn at/.test(r.textContent))
    const i = scaleRow?.querySelector('input'); if (i) { i.value = '1.5'; i.dispatchEvent(new Event('change')) }
    S.workshop.tab = 'sounds'; S.workshop.render()
    const sels = [...document.querySelectorAll('.wk-details select.st-sound')]
    const r = { scale: prop.scale, sounds: sels.length, moves: S.module.player.moves?.move_speed?.mul }
    // Choosing the picture again keeps everything else about the player.
    S.workshop.tab = 'skin'; S.workshop.render()
    ;[...document.querySelectorAll('.wk-details .st-chip')].find((c) => c.textContent === prop.name)?.click()
    r.kept = S.module.player.moves?.move_speed?.mul === 2 && S.module.player.body?.height === 2
    delete prop.scale
    S.module.player = null; S.moduleChanged()
    return r
  })
  check(pl.scale === 1.5, `the player's sprite is scaled from the skin tab (${pl.scale})`)
  check(pl.sounds >= 8, `the sounds tab offers jumping, landing, hurt, dying and every pickup from the packs (${pl.sounds})`)
  check(pl.kept, 'choosing the picture keeps the player\'s size and moves')
  await page.setViewport({ width: 915, height: 412 })
  const side = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('home'); await S.go('player')
    await new Promise((r) => setTimeout(r, 200))
    const d = document.querySelector('.wk:not([hidden]) .wk-details'); const p = document.querySelector('.wk:not([hidden]) .wk-preview')
    const r = { details: d?.getBoundingClientRect().width ?? 0, preview: p?.getBoundingClientRect().width ?? 0, scrolls: d ? getComputedStyle(d).overflowY === 'auto' : false }
    await S.go('screens')
    await new Promise((r) => setTimeout(r, 200))
    const sd = document.querySelector('.sc .wk-details')
    r.screensList = sd?.getBoundingClientRect().height ?? 0
    r.screensScrolls = sd ? getComputedStyle(sd).overflowY : ''
    await S.go('map')
    return r
  })
  await page.setViewport({ width: 1000, height: 700 })
  check(side.details > 200 && side.preview > 150 && side.scrolls, `on a phone on its side the player's picture and forms are side by side, the forms scrolling (${JSON.stringify(side)})`)
  check(side.screensList > 250 && side.screensScrolls === 'auto', 'and Screens gives its list the height to be read, scrolling')
}

// A PHONE HELD UPRIGHT: no rail; the module's home lists the sections, and
// each one, the map editor included, has a way back to it.
{
  await page.setViewport({ width: 390, height: 844 })
  await page.evaluate(() => window.__studio.go('home'))
  await new Promise((r) => setTimeout(r, 200))
  const phone = await page.evaluate(() => ({ rail: getComputedStyle(document.querySelector('.sd-rail')).display, tiles: document.querySelectorAll('.sd-page .sd-tile').length,
    left: document.querySelector('.sd-page').getBoundingClientRect().left }))
  check(phone.rail === 'none' && phone.tiles >= 8 && phone.left === 0, `upright, there is no rail and the home lists the sections (${JSON.stringify(phone)})`)
  await page.evaluate(() => document.querySelector('.sd-page .sd-tile[data-section="sounds"]').click())
  await new Promise((r) => setTimeout(r, 200))
  const inSection = await page.evaluate(() => ({ route: window.__studio.route(), back: getComputedStyle(document.querySelector('.sd-back')).display }))
  check(inSection.route === 'sounds' && inSection.back !== 'none', `a section shows its way back (${JSON.stringify(inSection)})`)
  await page.evaluate(() => document.querySelector('.sd-back').click())
  await page.evaluate(() => window.__studio.go('map'))
  await new Promise((r) => setTimeout(r, 200))
  const inMap = await page.evaluate(() => ({ home: getComputedStyle(document.querySelector('.st-home-btn')).display }))
  check(inMap.home !== 'none', `and so does the map editor (${JSON.stringify(inMap)})`)
  await page.setViewport({ width: 1000, height: 700 })
}

// BACK FROM PLAY: Play notes the map and the view; the game's "◀ Studio" link
// opens /studio/ with no address, and the studio goes back to that map.
{
  const before = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map', Object.keys(S.docs)[0])
    S.viewport.lookAt(5, 3, 0); S.viewport.viewHeight = 33; S.viewport.resize()
    S.rememberReturn()
    return { map: S.docName }
  })
  await page.goto(URL_, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, { timeout: 60000 }).catch(() => {})
  const after = await page.evaluate(() => ({ route: window.__studio.route(), map: window.__studio.docName, hash: location.hash,
    x: window.__studio.viewport.target.x, h: window.__studio.viewport.viewHeight, left: localStorage.getItem('dnp.studio.return') }))
  check(after.route === 'map' && after.map === before.map && after.hash === `#/map/${before.map}`, `back from Play, the studio opens the map that was being tested (${JSON.stringify(after)})`)
  check(after.x === 5 && after.h === 33 && after.left === null, 'with the view as it was, and the note used up')
  await page.goto(URL_, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, { timeout: 60000 }).catch(() => {})
  check(await page.evaluate(() => window.__studio.route()) === 'home', 'CONTROL: opened again without having played, it is the module\'s home')
  await page.evaluate(() => window.__studio.go('map'))
}

// Export: the whole module as files, with the map's Lua carrying the triggers.
const exported = await page.evaluate(async () => {
  const S = window.__studio
  const { emitModule } = await import('/studio/src/module_emit.js')
  const r = await emitModule(S.module, Object.values(S.docs), { bake: S.bake, runtime: S.runtime })
  const lua = r.files.find((f) => f.path === 'maps/first.lua')?.bytes ?? ''
  return { ok: r.ok, n: r.files.length, paths: r.files.map((f) => f.path), hasTriggers: /triggers\.load/.test(lua), hasDnpm: r.files.some((f) => f.path === 'maps/first.dnpm') }
})
check(exported.ok && exported.hasDnpm && exported.hasTriggers, `the module emits with a baked map and its triggers (${JSON.stringify(exported).slice(0, 300)})`)
check(errors.length === 0, `no page errors at all (${errors.slice(0, 3).join(' | ')})`)

await browser.close()
console.log(`\n${name}: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
