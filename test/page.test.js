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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
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
  await page.keyboard.press('5')
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
  check(wk.chrome === 'none', 'the level chrome is out of the way while the workshop is open')
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
  await page.evaluate(() => window.__studio.workshop.close())
  const closed = await page.evaluate(() => document.querySelector('.wk').hidden && getComputedStyle(document.querySelector('.st-bar')).display !== 'none')
  check(closed, 'closing the workshop brings the level back')
}

// The module's maps, from one sheet: a new one, switching, deleting -- the
// last map stays, and a deleted map's neighbour is opened in its place.
{
  await page.evaluate(() => window.__studio.showMaps())
  const listed = await page.evaluate(() => ({ rows: document.querySelectorAll('.st-sheet [data-map]').length, on: document.querySelector('.st-sheet [data-map][data-on="1"]')?.dataset.map, docs: Object.keys(window.__studio.docs).length }))
  check(listed.rows === listed.docs && listed.on === 'first', `the Maps sheet lists every map and marks the one being edited (${JSON.stringify(listed)})`)
  await page.evaluate(() => [...document.querySelectorAll('.st-sheet button')].find((b) => b.textContent === '+ new map').click())
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.type('arena')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.docName === 'arena', { timeout: 5000 }).catch(() => {})
  const made = await page.evaluate(() => ({ name: window.__studio.docName, docs: Object.keys(window.__studio.docs), sectors: window.__studio.doc.order.length, sheet: window.__studio.ui.sheetOpen }))
  check(made.name === 'arena' && made.docs.length === 2 && made.sectors === 1 && !made.sheet, `a new map is made from the sheet and opened (${JSON.stringify(made)})`)
  await page.evaluate(() => { window.__studio.showMaps(); document.querySelector('.st-sheet [data-map="first"]').click() })
  await page.waitForFunction(() => window.__studio.docName === 'first', { timeout: 5000 }).catch(() => {})
  check(await page.evaluate(() => window.__studio.docName === 'first' && window.__studio.doc.order.length > 1), 'tapping a map in the sheet opens it')
  await page.evaluate(() => { window.__studio.showMaps(); document.querySelector('.st-sheet [data-map="arena"] button').click() })
  await page.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('dialog[open] button[type=submit]').click())
  await page.waitForFunction(() => !window.__studio.docs.arena, { timeout: 5000 }).catch(() => {})
  const gone = await page.evaluate(() => ({ docs: Object.keys(window.__studio.docs), name: window.__studio.docName, rows: document.querySelectorAll('.st-sheet [data-map]').length }))
  check(gone.docs.length === 1 && gone.name === 'first' && gone.rows === 1, `a map is deleted after the studio's own confirmation, and the list follows (${JSON.stringify(gone)})`)
  await page.evaluate(() => { document.querySelector('.st-sheet [data-map="first"] button').click() })
  await new Promise((r) => setTimeout(r, 300))
  const kept = await page.evaluate(() => ({ docs: Object.keys(window.__studio.docs).length, dialog: !!document.querySelector('dialog[open]'), status: window.__studio.ui.status.textContent }))
  check(kept.docs === 1 && !kept.dialog && /at least one map/.test(kept.status), `the last map cannot be deleted (${JSON.stringify(kept)})`)
  await page.evaluate(() => window.__studio.ui.hideSheet())
}

// A prop: a body without a brain, from the Props sheet, with a single
// picture of the module's own; placed, it is drawn from that picture.
{
  await page.evaluate(() => window.__studio.showProps())
  await page.evaluate(() => [...document.querySelectorAll('.st-sheet button')].find((b) => b.textContent === '+ new prop').click())
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.type('barrel')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.module.props.some((p) => p.name === 'barrel'), { timeout: 5000 }).catch(() => {})
  const made = await page.evaluate(() => ({ prop: window.__studio.module.props.find((p) => p.name === 'barrel'), title: document.querySelector('.st-sheet-title')?.textContent }))
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
  const palette = await page.evaluate(() => { window.__studio.openPalette(); return [...document.querySelectorAll('.st-sheet .st-chip')].map((c) => c.textContent) })
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
  await page.evaluate(() => { window.__studio.showMusic() })
  await page.evaluate(() => [...document.querySelectorAll('.st-sheet button')].find((b) => b.textContent === '+ cue').click())
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.doc.music?.default, { timeout: 3000 }).catch(() => {})
  const cued = await page.evaluate(() => ({ music: window.__studio.doc.music, rows: document.querySelectorAll('.st-sheet [data-cue]').length, tracks: document.querySelectorAll('.st-sheet [data-track]').length }))
  check(cued.music?.default === 'd_evil' && cued.rows === 1 && cued.tracks === 1, `the first cue is 'default' on the imported track (${JSON.stringify(cued)})`)
  await page.evaluate(() => window.__studio.listen('d_evil'))
  await page.waitForFunction(() => window.__studio.music && (window.__studio.music.current || window.__studio.music.failed), { timeout: 20000 }).catch(() => {})
  await page.waitForFunction(() => window.__studio.music?.health() !== null, { timeout: 5000 }).catch(() => {})
  const heard = await page.evaluate(() => { const m = window.__studio.music; return { started: m?.started, ready: m?.ready, playing: !!m?.current && m.current === window.__studio.trackUrls.get('d_evil'), failed: m?.failed ?? null, health: m?.health(), rate: m?.ctx?.sampleRate } })
  check(heard.ready && heard.playing && !heard.failed, `the track plays here through the client's synth (${JSON.stringify(heard)})`)
  const packed = await page.evaluate(async () => {
    const S = window.__studio
    const { emitModule, musicKey } = await import('/studio/src/module_emit.js')
    const assets = {}
    for (const [path, blob] of Object.entries(S.rec.assets)) assets[path] = new Uint8Array(await blob.arrayBuffer())
    const r = await emitModule(S.module, Object.values(S.docs), { bake: S.bake, runtime: S.runtime, assets })
    const idx = r.files.find((f) => f.path === 'assets/music/index.json')
    const dnpm = r.files.find((f) => f.path === `maps/${S.docName}.dnpm`)?.bytes
    const loaded = S.core.loadMap(new Uint8Array(dnpm))
    return { index: idx ? JSON.parse(idx.bytes) : null, key: musicKey(dnpm), clientKey: loaded.map.hash.toString(16), hasTrack: r.files.some((f) => f.path === 'assets/music/d_evil.mstk'), warnings: r.problems.flatMap((p) => p.warnings.filter((w) => w.sector === 'music').map((w) => w.msg)) }
  })
  check(packed.index?.[packed.clientKey]?.default === 'd_evil.mstk' && packed.key === packed.clientKey && packed.hasTrack && packed.warnings.length === 0,
        `the pack files the map's cues under the hash the client computes (${JSON.stringify({ ...packed, index: Object.keys(packed.index ?? {}) })})`)
  await page.evaluate(() => { window.__studio.stopListening(); window.__studio.ui.hideSheet() })
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
