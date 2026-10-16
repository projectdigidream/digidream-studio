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
import { join } from 'node:path'
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
// with where it was thrown: a bare message names no culprit
page.on('pageerror', (e) => errors.push(String(e.stack ?? e).split('\n').slice(0, 2).join(' ').replace(/\s+/g, ' ')))
// Resource failures are recorded from the response hook below, with their
// URL; the console's version of the same event names nothing.
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })
// The one 404 tolerated: a style's picture under /ui/, asked by the client's
// UiView before the studio points it at the module's own copy -- until the
// client takes an assetUrl (docs/UI_STYLES.md 6.1), when it stops being asked.
page.on('response', (r) => { if (r.status() === 404 && !/favicon/.test(r.url()) && !(/\/ui\/skins\//.test(r.url()) && !globalThis.__assetUrlSupported)) errors.push(`404 ${r.url()}`) })
await page.goto(URL_, { waitUntil: 'networkidle0' })
try {
  await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, { timeout: 60000 })
} catch (e) {
  console.log('  boot did not finish:', await page.evaluate(() => document.getElementById('bootmsg')?.textContent), errors.slice(0, 5))
}
check(await page.evaluate(() => document.getElementById('boot')?.hidden === true), 'the studio boots')
globalThis.__assetUrlSupported = await page.evaluate(async () => !!(await import('/src/render/layout.js')).UI_STYLES?.assetUrl).catch(() => false)
check(errors.length === 0, `no page errors during boot (${errors.slice(0, 3).join(' | ')})`)
// THE LOADING LOG: each step and its time, kept for "copy this" when one fails.
const bootText = await page.evaluate(() => window.__bootText?.() ?? '')
check(/studio \d+\.\d+\.\d+(\.\d+)? · /.test(bootText) && /opening the store/.test(bootText) && /✓ opening your work \(\d+ ms\)/.test(bootText) && /opened \S+: \d+ map/.test(bootText),
      `the loading screen logs its steps, with times (${bootText.split('\n').length} lines)`)
// A FIRST BOOT (a fresh profile: an empty store) opens a module made from the
// starter template -- its monster and sheet -- not a blank room. It once ran
// before the template's address was initialised, and made the blank room.
{
  const first = await page.evaluate(() => ({ id: window.__studio.rec.id, props: window.__studio.module.props?.length ?? 0, sheets: Object.keys(window.__studio.module.sprites ?? {}), fromTemplate: /from the starter template/.test(window.__bootText?.() ?? '') }))
  if (first.fromTemplate) check(first.id === 'my-level' && first.props >= 1 && first.sheets.includes('SPIR'), `a first boot opens a module made from the starter template (${JSON.stringify(first)})`)
  else console.log('page: the store was not empty at boot -- the first-boot check is skipped')
  // What every scenario below was written against: one room on its own, the
  // module made fresh in place of the starter's copy.
  await page.evaluate(async () => {
    const S = window.__studio
    const { newModule } = await import('/studio/src/module_emit.js')
    const id = S.rec.id
    await S.store.remove(id)
    S.rec = null
    await S.store.save({ id, module: newModule(id, 'My Level'), docs: { first: S.starterDoc('first') }, assets: {} })
    await S.openModule(id)
  })
  await page.waitForFunction(() => window.__studio?.doc && Object.keys(window.__studio.docs ?? {}).length === 1, { timeout: 30000 })
}

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
// ITS START FACING: set in its form, drawn as an arrow at its foot that a tap
// never picks; the slider at 0 leaves no angle in the document.
{
  const faced = await page.evaluate(async () => {
    const S = window.__studio
    const e = S.doc.entities[0]
    S.select({ kind: 'entity', id: e.id })
    await new Promise((r) => setTimeout(r, 200))
    const input = [...document.querySelectorAll('.st-sheet label, .st-sheet .st-row')].find((n) => /facing/.test(n.textContent))?.querySelector('input[type=range]')
    if (input) { input.value = '90'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 200))
    const arrows = S.viewport.markers.children.filter((m) => m.userData.kind === 'heading').length
    const angle = e.angle
    if (input) { input.value = '0'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 100))
    return { slider: !!input, angle, arrows, cleared: !('angle' in e) }
  })
  check(faced.slider && faced.angle === 90 && faced.arrows >= 1 && faced.cleared, `a placed thing's facing is set in its form and drawn as an arrow (${JSON.stringify(faced)})`)
  await page.evaluate(() => window.__studio.ui.hideSheet())
}

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

// THE MONSTER EDITOR (src/editors/editor.js). A new monster gets the imported
// sheet; the preview draws it running its brain; the graph shows its states
// and their arrows in lanes; tapping a state opens it beside the list, with its
// rules as sentences and every condition and action of the engine on offer.
{
  const made = await page.evaluate(async () => {
    const S = window.__studio
    const { newMonster } = await import('/studio/src/brain.js')
    const name = newMonster(S, 'ghost')
    S.moduleChanged()
    return name
  })
  check(made === 'ghost', `a new monster is made from the forms (${made})`)
  // Monsters are a section of the module, in the rail.
  await page.evaluate(() => document.querySelector('.sd-rail [data-section="monsters"]').click())
  await page.waitForFunction(() => document.querySelector('.me[data-kind="mob"]') && !document.querySelector('.me[data-kind="mob"]').hidden, { timeout: 5000 }).catch(() => {})
  await page.evaluate(async () => { const S = window.__studio; await S.go('monsters', 'ghost'); const ed = S.monsterEditor; ed.view = 'graph'; ed.render() })
  const ed = await page.evaluate(() => ({
    open: !!document.querySelector('.me[data-kind="mob"]') && !document.querySelector('.me[data-kind="mob"]').hidden,
    nodes: document.querySelectorAll('.me .me-node').length,
    edges: document.querySelectorAll('.me .me-edge').length,
    sheet: window.__studio.module.props.find((p) => p.name === 'ghost')?.art?.sheet,
    chrome: getComputedStyle(document.querySelector('.st-bar')).display
  }))
  check(ed.open && ed.nodes === 5 && ed.edges >= 4, `the graph shows the brain: ${ed.nodes} states, ${ed.edges} arrows`)
  check(ed.sheet === 'SPIR', `the new monster took the imported sheet (${ed.sheet})`)
  check(ed.chrome === 'none', 'the level chrome is out of the way while the monsters are open')
  // The preview, opened and run: the monster drawn from its sheet.
  await page.evaluate(() => { const ed = window.__studio.monsterEditor; ed.pvOpen = true; ed.preview.start(); ed.render() })
  const lit = () => page.evaluate(() => {
    const c = document.querySelector('.me .me-side canvas.me-stage'); if (!c) return 0
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n
  })
  for (let i = 0; i < 60 && (await lit()) < 500; i++) await new Promise((r) => setTimeout(r, 250))
  check((await lit()) > 500, `the preview paints the monster from its sheet as it runs (${await lit()} px)`)
  const why = await page.evaluate(() => document.querySelector('.me .me-now')?.textContent ?? '')
  check(/^Now in \w+/.test(why), `and says what it is doing and why (${why})`)
  await page.evaluate(() => window.__studio.monsterEditor.preview.pause())
  // Tapping a state opens it beside, with its own rules.
  const picked = await page.evaluate(() => {
    const ed = window.__studio.monsterEditor
    ed.view = 'list'; ed.render()
    const b = [...document.querySelectorAll('.me .me-cname')].find((x) => x.textContent.trim() === 'chase')
    b.click()
    return { sel: ed.sel, rules: document.querySelectorAll('.me .me-side .me-rcard').length }
  })
  check(picked.sel === 'chase' && picked.rules === 2, `tapping a state opens it with its rules (${JSON.stringify(picked)})`)
  // EVERY CONDITION AND ACTION THE RUNTIME KNOWS is on offer: in words where
  // the phrasebook has them, under "More" (the vocabulary's own form) where not.
  const offered = await page.evaluate(() => {
    const S = window.__studio
    const ed = S.monsterEditor
    ed.picking = { list: 'rules', i: 0 }; ed.render()
    const conds = [...document.querySelectorAll('.me .me-side .me-chooser .me-copt')].length
    ed.picking = null; ed.pickAct = true; ed.render()
    const acts = [...document.querySelectorAll('.me .me-side .me-chooser .me-copt')].length
    ed.pickAct = false
    const more = [...document.querySelectorAll('.me .me-side .me-chooser .me-cgl')].some((g) => /^More/.test(g.textContent))
    // a prop is picked from the catalogue
    S.module.mobs.mobs.ghost.states.chase.transitions[0].when.push({ cond: 'prop_within', distance: '4' })
    ed.render()
    const propSel = [...document.querySelectorAll('.me .me-side select[aria-label="prop"]')][0]
    const r = { conds, acts, more, vocabConds: S.vocab.mob.conditions.length, vocabActs: S.vocab.mob.actions.length, props: propSel ? propSel.options.length - 1 : 0, first: propSel?.options[1]?.value }
    S.module.mobs.mobs.ghost.states.chase.transitions[0].when.pop(); ed.render()
    return r
  })
  check(offered.conds >= offered.vocabConds && offered.acts >= offered.vocabActs - 1 && offered.more, `the whole mob vocabulary is on offer (${offered.conds} conditions for ${offered.vocabConds}, ${offered.acts} actions for ${offered.vocabActs}, "More": ${offered.more})`)
  check(offered.props > 1 && typeof offered.first === 'string', `a prop is picked from the catalogue (${offered.props} names, first ${offered.first})`)
  // The graph lays the states out itself: in the order the arrows read, the reactions on a row of their own.
  const lanes = await page.evaluate(() => {
    const ed = window.__studio.monsterEditor
    ed.view = 'graph'; ed.render()
    const top = (n) => [...document.querySelectorAll('.me .me-node')].find((x) => x.dataset.node === n)?.getBoundingClientRect().top
    return { look: top('look'), chase: top('chase'), pain: top('pain'), death: top('death') }
  })
  check(lanes.look === lanes.chase && lanes.pain === lanes.death && lanes.pain > lanes.look, `the graph lays the flow in a row and the reactions below it (${JSON.stringify(lanes)})`)
  // A new state is named in the editor itself: no window.prompt (not there in
  // Electron, nor in a phone's WebView), no dialog.
  await page.evaluate(() => { const ed = window.__studio.monsterEditor; ed.view = 'list'; ed.sel = null; ed.render(); [...document.querySelectorAll('.me button')].find((b) => b.textContent === '+ state').click() })
  await page.waitForSelector('.me input[aria-label^="New state"]', { timeout: 3000 }).catch(() => {})
  await page.focus('.me input[aria-label^="New state"]')
  await page.keyboard.type('Flee')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.module.mobs.mobs.ghost.states.flee, { timeout: 3000 }).catch(() => {})
  const added = await page.evaluate(() => ({ state: !!window.__studio.module.mobs.mobs.ghost.states.flee, cards: document.querySelectorAll('.me .me-card').length, dialogs: document.querySelectorAll('dialog').length }))
  check(added.state && added.cards === 6 && added.dialogs === 0, `a state is added in the editor, its name lower-cased as typed (${JSON.stringify(added)})`)
  // Looks plays any animation of the sheet by name, and one that plays once keeps drawing.
  const looks = async (anim) => page.evaluate(async (anim) => {
    const ed = window.__studio.monsterEditor
    ed.tab = 'look'; ed.render()
    const b = [...document.querySelectorAll('.me .me-vbtn')].find((x) => x.textContent === anim)
    b?.click()
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); if (document.querySelector('.me .me-lookside .me-muted')?.textContent.startsWith(anim)) break }
    await new Promise((r) => setTimeout(r, 1200))
    const c = document.querySelector('.me .me-lookside canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return { found: !!b, n, label: document.querySelector('.me .me-lookside .me-muted')?.textContent }
  }, anim)
  const walk = await looks('walk')
  check(walk.found && walk.n > 500 && walk.label?.startsWith('walk'), `Looks plays a chosen animation (${JSON.stringify(walk)})`)
  const once = await looks('Attack')
  check(once.n > 500 && once.label?.startsWith('Attack') && /plays once|loops/.test(once.label), `and one that plays once draws, and keeps drawing (${JSON.stringify(once)})`)
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
  // The monster's own swept collider, and what it bleeds, on Advanced: the same forms a weapon's are.
  const claw = await page.evaluate(() => {
    const S = window.__studio
    const ed = S.monsterEditor
    ed.tab = 'advanced'; ed.render()
    ;[...document.querySelectorAll('.me button')].find((b) => b.textContent === '+ swing').click()
    return { swing: S.module.mobs.mobs.ghost.swing, canvas: !!document.querySelector('.me .st-swing-canvas') }
  })
  check(claw.swing?.damage > 0 && claw.canvas, 'a monster gets the same swept collider, with the same preview')
  const swept = await page.evaluate(async () => {
    const c = document.querySelector('.me .st-swing-canvas')
    const lit = () => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 90 && d[i + 1] > 70) n++; return n }
    const seen = new Set()
    for (let i = 0; i < 40; i++) { seen.add(lit()); await new Promise((r) => requestAnimationFrame(r)) }
    return { frames: seen.size, any: Math.max(...seen) }
  })
  check(swept.any > 50 && swept.frames > 3, `and the collider sweeps rather than sitting still (${swept.frames} distinct frames)`)
  const blood = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.me .st-row')].find((r) => r.querySelector('label')?.textContent?.startsWith('blood'))
    const sel = row?.querySelector('select')
    return { isPicker: !!sel, options: sel ? sel.options.length - 1 : 0 }
  })
  check(blood.isPicker && blood.options > 0, `what it bleeds is picked from the particle kinds, not typed as a number (${blood.options} offered)`)
  // THE BOARD ZOOMS: −, +, fit; a pinch too.
  const zoomed = await page.evaluate(async () => {
    const ed = window.__studio.monsterEditor
    ed.tab = 'behaviour'; ed.view = 'graph'; ed.render()
    await new Promise((r) => setTimeout(r, 100))
    const board = document.querySelector('.me .me-board')
    const z0 = ed.boardView.z
    ;[...board.querySelectorAll('.me-zoom button')].find((b) => b.getAttribute('aria-label') === 'zoom in').click()
    const zIn = ed.boardView.z
    ;[...board.querySelectorAll('.me-zoom button')].find((b) => b.textContent === 'fit').click()
    await new Promise((r) => setTimeout(r, 50))
    const br = board.getBoundingClientRect()
    const inside = [...board.querySelectorAll('.me-node')].every((n) => { const r = n.getBoundingClientRect(); return r.left >= br.left - 1 && r.right <= br.right + 1 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1 })
    const zBefore = ed.boardView.z
    const at = (id, x, y, type) => board.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }))
    const cx = br.left + br.width / 2; const cy = br.top + br.height - 30
    at(1, cx - 20, cy, 'pointerdown'); at(2, cx + 20, cy, 'pointerdown')
    at(1, cx - 25, cy, 'pointermove'); at(2, cx + 25, cy, 'pointermove')
    at(1, cx - 60, cy, 'pointermove'); at(2, cx + 60, cy, 'pointermove')
    at(1, cx - 60, cy, 'pointerup'); at(2, cx + 60, cy, 'pointerup')
    return { z0, zIn, inside, pinched: ed.boardView.z > zBefore * 1.5 }
  })
  check(zoomed.zIn > zoomed.z0 && zoomed.inside && zoomed.pinched, `the monster board zooms: + in, fit puts every state in view, a pinch too (${JSON.stringify(zoomed)})`)
  // THE FLINCH: switched on, a bigger hit holds the monster in pain longer,
  // said in ticks for a few hits by the runtime's own sum.
  const flinch = await page.evaluate(async () => {
    const S = window.__studio
    const ed = S.monsterEditor
    const g = S.module.mobs.mobs.ghost
    const hadPain = !!g.states.pain
    g.states.pain ??= { anim: 0, move: 'stop', face: 'hold', ticks: 12, next: g.initial }
    ed.tab = 'advanced'; ed.render()
    const row = [...document.querySelectorAll('.me .st-row')].find((r) => r.querySelector('label')?.textContent === 'a bigger hit, a longer flinch')
    row?.querySelector('button').click()
    await new Promise((r) => setTimeout(r, 100))
    const said = [...document.querySelectorAll('.me .st-muted')].map((m) => m.textContent).find((t) => /a 10-point hit/.test(t)) ?? ''
    const r = { pt: g.pain_time ? { ...g.pain_time } : null, said, problems: S.vocab.validateMobs(S.module.mobs).filter((p) => /pain/.test(p)) }
    delete g.pain_time; if (!hadPain) delete g.states.pain; S.moduleChanged()
    return r
  })
  const base = Number(/lasts (\d+) ticks/.exec(flinch.said)?.[1])
  check(flinch.pt?.per_damage === '0.5' && flinch.pt.max >= 30 && new RegExp(`a 10-point hit ${Math.min(base + 5, flinch.pt.max)}\\b`).test(flinch.said) && !flinch.problems.length,
        `a bigger hit, a longer flinch: pain_time on, its lengths said by the runtime's sum (${JSON.stringify(flinch)})`)
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
  // (the seven sliders of how it moves are always there: three more once the angle and distance are set)
  check(cam.ranges - before.ranges === 3, `the sheet offers the angle and distance once they are set (${before.ranges} -> ${cam.ranges} sliders)`)
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
  // One movement parameter overridden on one map: module.txt gets a line
  // under that map's name, and none for the other map.
  const perMap = await page.evaluate(async () => {
    const S = window.__studio
    const { playerLines } = await import('/studio/src/player.js')
    S.workshop.tab = 'moves'; S.workshop.render()
    const card = document.querySelector('.wk-details .st-card[data-param="jump_impulse"]')
    card.querySelector('button').click()
    const said = card.textContent
    S.workshop.render()
    const input = document.querySelector('.wk-details .st-card[data-param="jump_impulse"] input[type=number]')
    input.value = '12'; input.dispatchEvent(new Event('change'))
    const r = { own: S.doc.playerOverride?.set?.jump_impulse, said, lines: playerLines(S.module, Object.values(S.docs)), map: S.docName }
    delete S.doc.playerOverride
    S.playerScope = 'module'
    S.workshop.render()
    return r
  })
  check(perMap.own === 12 && perMap.lines.includes(`player ${perMap.map} jump_impulse 12`) && !perMap.lines.some((l) => / second /.test(l)),
        `a movement override is this map's alone, a line under its name (${JSON.stringify(perMap)})`)
  // MOVEMENT IS A VALUE the module says, starting from the engine's.
  const moves = await page.evaluate(async () => {
    const S = window.__studio
    const { moduleTxt } = await import('/studio/src/module_emit.js')
    S.workshop.tab = 'moves'; S.workshop.render()
    const before = document.querySelector('.wk-details .st-card[data-param="move_speed"]').textContent
    document.querySelector('.wk-details .st-card[data-param="move_speed"] button').click()
    S.workshop.render()
    const sw = document.querySelector('.wk-details .st-card[data-param="hover_enabled"] button')
    sw.click(); S.workshop.render()
    document.querySelectorAll('.wk-details .st-card[data-param="hover_enabled"] button')[1]?.click()
    return { set: { ...S.module.player.set }, before, groups: [...document.querySelectorAll('.wk-details .st-section-head')].map((h) => h.textContent),
             txt: moduleTxt(S.module, Object.values(S.docs)).split('\n').filter((l) => /^player /.test(l)) }
  })
  check(/the engine's: 8 units\/s/.test(moves.before), `an unset parameter says the engine's value (${moves.before})`)
  check(moves.set.move_speed === 8 && moves.set.hover_enabled === true, `set, it starts from that value; a switch is on or off (${JSON.stringify(moves.set)})`)
  check(moves.groups.length >= 7, `grouped as PLAYER.md has them (${moves.groups.join(' | ')})`)
  check(moves.txt.includes('player move_speed 8') && moves.txt.includes('player hover_enabled on'), `and written as module.txt player lines (${moves.txt.join(' | ')})`)
  await page.evaluate(async () => {
    const S = window.__studio
    S.module.player = null
    delete S.docs.second
    await S.go('map')
    S.moduleChanged()
  })
}

// THE WEAPON EDITOR: the monster editor's machine with the weapon vocabulary.
// An arsenal, a weapon that is a graph of states, rules for the fire button,
// a swing with a picture of it, and the files the game reads.
{
  const opened = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('weapons')
    const root = document.querySelector('.me[data-kind="weapon"]')
    return { open: !!root && !root.hidden, vocab: !!S.vocab.weapon, top: [...document.querySelectorAll('.me[data-kind="weapon"] .me-top button')].map((b) => b.textContent).join('|') }
  })
  check(opened.open, `the weapons open as their own section (${JSON.stringify(opened)})`)
  check(opened.vocab, 'the weapon vocabulary is served to the studio')
  check(!/monsters/i.test(opened.top), `and it has no button across to the monsters, as asked (${opened.top})`)
  const made = await page.evaluate(async () => {
    const S = window.__studio
    const { newWeapon } = await import('/studio/src/weapons_emit.js')
    const name = newWeapon(S.module, 'pistol')
    S.moduleChanged()
    S.weaponEditor.switchTo(name)
    S.weaponEditor.view = 'graph'; S.weaponEditor.render()
    return { name, phases: Object.keys(S.module.weapons.weapons[name].phases), nodes: document.querySelectorAll('.me .me-node').length, edges: document.querySelectorAll('.me .me-edge').length }
  })
  check(made.name === 'pistol' && made.phases.length === 2, `a new weapon is a working machine of states (${made.phases.join(', ')})`)
  check(made.nodes === 2 && made.edges >= 2, `its graph is drawn like a brain's (${made.nodes} states, ${made.edges} arrows)`)
  // Its rules are the weapon vocabulary's, not the monster's.
  const offered = await page.evaluate(() => {
    const S = window.__studio
    const ed = S.weaponEditor
    ed.view = 'list'; ed.sel = 'ready'; ed.picking = { list: 'rules', i: 0 }; ed.render()
    const conds = [...document.querySelectorAll('.me .me-side .me-chooser .me-copt')].map((b) => b.textContent)
    ed.picking = null; ed.pickAct = true; ed.render()
    const acts = [...document.querySelectorAll('.me .me-side .me-chooser .me-copt')].map((b) => b.textContent)
    ed.pickAct = false; ed.render()
    return { conds: conds.length, acts: acts.length, vocabConds: S.vocab.weapon.conditions.length, vocabActs: S.vocab.weapon.actions.length, held: conds.some((t) => /fire is held/.test(t)), notHeld: conds.some((t) => /fire is not held/.test(t)), mobOnly: conds.some((t) => /hunting|can see the target/.test(t)) }
  })
  check(offered.conds >= offered.vocabConds && offered.acts >= offered.vocabActs, `the state offers the weapon vocabulary (${offered.conds} conditions for ${offered.vocabConds}, ${offered.acts} actions for ${offered.vocabActs})`)
  check(offered.held && offered.notHeld, 'with a negated form, which the weapon runtime takes since 0.2.0 ("fire is not held")')
  check(!offered.mobOnly, "CONTROL: and not the monster's, which a weapon cannot run")
  // A new rule: to a state, on a condition; the file the runtime reads takes it.
  const ruled = await page.evaluate(async () => {
    const S = window.__studio
    const ed = S.weaponEditor
    const w = S.module.weapons.weapons.pistol
    const before = w.phases.fire.transitions?.length ?? 0
    ed.sel = 'fire'; ed.render()
    ;[...document.querySelectorAll('.me .me-side button')].find((b) => b.textContent === '+ another rule').click()
    const to = [...document.querySelectorAll('.me .me-side .me-rcard select[aria-label="goes to"]')].at(-1)
    to.value = 'ready'; to.dispatchEvent(new Event('change'))
    ;[...document.querySelectorAll('.me .me-side .me-chooser .me-copt')].find((b) => b.textContent === 'fire is not held').click()
    const added = w.phases.fire.transitions.at(-1)
    // checked as the studio checks it: the editor's own words compiled first (brainc.js)
    const { compileArsenal } = await import('/studio/src/brainc.js')
    return { grew: w.phases.fire.transitions.length - before, added, problems: S.vocab.validateWeapons({ ...S.module, weapons: compileArsenal(S.module.weapons) }).filter((p) => /pistol/.test(p)) }
  })
  check(ruled.grew === 1 && ruled.added?.to === 'ready' && ruled.added.when?.[0]?.cond === 'button_held' && ruled.added.when[0].negate === true && !ruled.problems.length,
        `a rule is added with a target and a negated condition, and the arsenal still validates (${JSON.stringify(ruled)})`)
  // A swing, its picture, and the arsenal's pools.
  const swung = await page.evaluate(() => {
    const S = window.__studio
    const ed = S.weaponEditor
    ed.tab = 'advanced'; ed.render()
    ;[...document.querySelectorAll('.me button')].find((b) => b.textContent === '+ swing').click()
    return { swing: S.module.weapons.weapons.pistol.swing, canvas: !!document.querySelector('.me .st-swing-canvas') }
  })
  check(swung.swing?.damage > 0 && swung.canvas, 'a swing is added, with a preview that plays it')
  const arsenal = await page.evaluate(() => {
    const S = window.__studio
    const ed = S.weaponEditor
    const before = Object.keys(S.module.weapons.ammo).length
    S.module.weapons.ammo.shells = { label: 'Shells', max: 50, initial: 8, order: 1 }
    ed.tab = 'arsenal'; ed.render()
    return { before, pools: Object.keys(S.module.weapons.ammo), labels: [...document.querySelectorAll('.me .st-section-head')].map((h) => h.textContent).join('|'), health: S.module.weapons.health }
  })
  check(/ammunition/.test(arsenal.labels) && /health/.test(arsenal.labels) && /pickups/.test(arsenal.labels),
        `the arsenal tab holds the pools, the ceilings and the pickups (${arsenal.labels})`)
  check(arsenal.before === 0 && arsenal.pools.join() === 'shells' && arsenal.health?.max > 0,
        `a fresh module carries no pools until one is made, and the ceilings default (${JSON.stringify(arsenal.health)})`)
  // The player's art is chosen from the module's own props (the Player page).
  const avatar = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('player')
    S.workshop.tab = 'skin'; S.workshop.render()
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

// THE EDITORS' OWN WORDS, end to end: a boss from its recipe, run in the
// preview through its phases; the file the engine reads has them as plain
// vocabulary; a missile's flight; and the phone on its side.
{
  const boss = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('monsters')
    const ed = S.monsterEditor
    ed.screen = 'gallery'; ed.render()
    const input = document.querySelector('.me input[aria-label^="The new monster"]')
    input.value = 'Big Boss'; input.dispatchEvent(new Event('input'))
    ;[...document.querySelectorAll('.me button')].find((b) => b.textContent === 'Boss (3 phases)').click()
    await new Promise((r) => setTimeout(r, 300))
    const b = S.module.mobs.mobs.big_boss
    // the preview runs where it is seen: on Behaviour
    ed.tab = 'behaviour'; ed.pvOpen = true; ed.render()
    // twenty-six hits of 25 on 900: through 66% and 33%, each phase change once
    const p = ed.preview
    p.start()
    const seen = []
    for (let i = 0; i < 26; i++) { p.hit(false); await new Promise((r) => setTimeout(r, 120)); seen.push(p.sim.state) }
    p.pause()
    const { emitMobsLua } = await import('/studio/src/mobs_emit.js')
    const { compileMobs } = await import('/studio/src/brainc.js')
    const lua = emitMobsLua(S.module)
    const problems = S.vocab.validateMobs(compileMobs(S.module.mobs, S.module.props), { props: S.propNames() })
    return { name: ed.name, phases: (b?.phases ?? []).length, any: (b?.any ?? []).length, roar: seen.filter((s, i) => s === 'roar' && seen[i - 1] !== 'roar').length, frenzy: seen.includes('frenzy') || seen.includes('enrage') || seen.includes('leap') || seen.includes('call_adds'), phase: p.sim.vars.phase, lua: { once: /__once1/.test(lua), back: /@previous/.test(lua), speed: /move_speed/.test(lua), editorWords: /\bany =|\bphases =|\bends =/.test(lua) }, problems }
  })
  check(boss.name === 'big_boss' && boss.phases === 3 && boss.any === 2, `a boss from its recipe, named as typed in lower case (${JSON.stringify({ name: boss.name, phases: boss.phases, any: boss.any })})`)
  check(boss.roar === 1 && boss.frenzy && boss.phase >= 2, `hit in the preview it goes through its phases, roaring once (${JSON.stringify({ roar: boss.roar, frenzy: boss.frenzy, phase: boss.phase })})`)
  check(boss.lua.once && boss.lua.back && boss.lua.speed && !boss.lua.editorWords && !boss.problems.length, `and the engine's file has it in plain vocabulary, with no problem (${JSON.stringify(boss.lua)} ${boss.problems.join(' | ')})`)
  // A missile: its flight is the engine's arc; a fireball bursts where it lands.
  const mis = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('missiles')
    const ed = S.missileEditor
    const name = Object.keys(S.module.mobs.missiles)[0]
    ed.open(name)
    const m = S.module.mobs.missiles[name]
    m.speed = '6'; m.gravity = '9'; m.z_offset = '0.6667'; delete m.throw
    ed.dist = 10; ed.render()
    const info = document.querySelector('.me .mi-main .me-muted')?.textContent ?? ''
    return { name, info, path: !!document.querySelector('.me .mi-path'), peak: ed.F.peak, end: ed.F.end }
  })
  check(mis.path && mis.end === 'hit' && mis.peak > 3 && mis.peak < 3.5 && /peaks/.test(mis.info), `a falling missile is thrown on the engine's arc: lands 10 m on, peaking about 3.3 up (${JSON.stringify(mis)})`)
  await page.evaluate(() => window.__studio.go('map'))
  // THE PHONE ON ITS SIDE: the rail stays, the preview waits behind a strip, a state opens beside the list.
  const phone = await browser.newPage()
  await phone.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const perrs = []
  phone.on('pageerror', (e) => perrs.push(String(e.stack ?? e).split('\n').slice(0, 2).join(' ')))
  await phone.goto(URL_, { waitUntil: 'networkidle0' })
  await phone.waitForFunction(() => window.__studio?.router, { timeout: 30000 })
  const ph = await phone.evaluate(async () => {
    const S = window.__studio
    const { newMonster } = await import('/studio/src/brain.js')
    newMonster(S, 'phoney'); S.moduleChanged()
    await S.go('monsters', 'phoney'); await new Promise((r) => setTimeout(r, 500))
    const ed = S.monsterEditor
    const side = () => document.querySelector('.me .me-side')
    const rail = document.querySelector('.sd-rail')
    const r = { rail: !!rail && rail.getBoundingClientRect().width > 30, mini: side()?.dataset.mini, width: Math.round(side()?.getBoundingClientRect().width ?? 0) }
    ;[...document.querySelectorAll('.me .me-cname')].find((b) => b.textContent.trim() === 'chase').click()
    r.wide = side()?.dataset.wide; r.ins = !!document.querySelector('.me .me-side .me-ins input[aria-label^="Name of this state"]')
    ed.pickAct = true; ed.render()
    r.sheet = !!document.querySelector('.me .me-side .me-sheet .me-chooser')
    r.page = document.documentElement.scrollWidth - innerWidth
    return r
  })
  check(ph.rail && ph.mini === '1' && ph.width < 80, `on a phone on its side the rail stays and the preview waits behind a strip (${JSON.stringify(ph)})`)
  check(ph.wide === '1' && ph.ins && ph.sheet && ph.page <= 0, `a state opens beside the list, a step's chooser in a sheet over it, and nothing runs off the screen (${JSON.stringify(ph)})`)
  check(!perrs.length, `and no page errors on the phone (${perrs.slice(0, 2).join(' | ')})`)
  await phone.evaluate(async () => { const S = window.__studio; delete S.module.mobs.mobs.phoney; S.module.props = S.module.props.filter((p) => p.name !== 'phoney'); S.moduleChanged() })
  await phone.close()
  await page.evaluate(async () => { const S = window.__studio; const { deleteMonster } = await import('/studio/src/brain.js'); deleteMonster(S, 'big_boss'); S.moduleChanged() })
}

// Particles: a kind of the module's own, played by the client's own code.
{
  await page.evaluate(() => window.__studio.showVfx())
  const before = await page.evaluate(() => document.querySelectorAll('.sd-page [data-vfx]').length)
  await page.evaluate(() => [...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ particles').click())
  const made = await page.evaluate(() => ({ kinds: window.__studio.module.vfx.length, rows: document.querySelectorAll('.sd-page [data-vfx]').length, canvas: !!document.querySelector('.st-vfx-canvas') }))
  check(made.kinds === before + 1 && made.rows === made.kinds && made.canvas, `a new kind is made and opens with its preview (${JSON.stringify(made)})`)
  // The preview is the client's own VfxView in a three.js view, so it paints
  // without a bake -- specks big enough to see, at the game's own sizes.
  const painted = await page.evaluate(async () => {
    const S = window.__studio
    const p = S.vfxPreview
    const def = S.module.vfx[S.module.vfx.length - 1]
    const c = document.querySelector('.st-vfx-canvas')
    // Lit pixels a little after a fresh burst, the best of a few tries.
    const lit = async (size) => {
      Object.assign(def, { size, sizeEnd: size }); p.show(def, { radius: 0.4 })
      let best = 0
      for (let i = 0; i < 8; i++) { p.fire(); await new Promise((r) => setTimeout(r, 60)); best = Math.max(best, p.litPixels()) }
      return best
    }
    const big = await lit(0.3)
    const live = p.parts.length
    const small = await lit(0.05)
    Object.assign(def, { size: 0.1, sizeEnd: 0 })
    return { big, small, live, w: c?.clientWidth }
  })
  check(painted.big > 120 && painted.live > 0, `the preview draws the burst with the game's own renderer (${painted.big} lit pixels at size 0.3, ${painted.live} specks, ${painted.w}px wide)`)
  check(painted.small < painted.big / 2, `CONTROL: at size 0.05 far fewer (${painted.small}) -- the specks are the kind's size in the world`)
  // Turned on its side, the preview and the form sit side by side.
  const sideBySide = await page.evaluate(async () => {
    const v = document.querySelector('.sd-vfx-view').getBoundingClientRect()
    const f = document.querySelector('.sd-vfx-form > *:nth-child(2)').getBoundingClientRect()
    return { landscape: innerWidth > innerHeight, beside: f.left >= v.right - 1, viewW: Math.round(v.width), formLeft: Math.round(f.left) }
  })
  check(!sideBySide.landscape || sideBySide.beside, `in landscape the form is beside the preview, not under it (${JSON.stringify(sideBySide)})`)
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
    ;[...document.querySelectorAll('.st-sheet button')].find((b) => b.querySelector('[data-icon="action.left"]') && /earlier$/.test(b.textContent)).click()
  })
  const reordered = await order()
  check(reordered[1] === before[2] && reordered[2] === before[1], `a waypoint moves one place along the curve (${before.join(' → ')} became ${reordered.join(' → ')})`)
  // The first cannot move earlier, and says so rather than moving.
  const stuck = await page.evaluate(() => {
    const S = window.__studio
    S.selectPathPoint(S.doc.paths[0].points[0].id)
    const b = [...document.querySelectorAll('.st-sheet button')].find((x) => x.querySelector('[data-icon="action.left"]') && /earlier$/.test(x.textContent))
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
  // A TAP ON A WAYPOINT'S NUMBER picks it (the number is what a finger aims
  // at; the handle under it is a few pixels wide) rather than adding one.
  const badge = await page.evaluate(() => {
    const S = window.__studio
    S.pathPointSel = null; S.redraw()
    const q = S.doc.paths[0].points[2]
    const at = S.viewport.toScreen(q.x, q.y, q.z + 0.6 + S.viewport.viewHeight / 44)
    return { x: at.x, y: at.y, id: q.id, n: S.doc.paths[0].points.length }
  })
  await page.mouse.click(badge.x, badge.y); await new Promise((r) => setTimeout(r, 250))
  const tappedBadge = await page.evaluate(() => ({ sel: window.__studio.pathPointSel, n: window.__studio.doc.paths[0].points.length }))
  check(tappedBadge.sel === badge.id && tappedBadge.n === badge.n, `a tap on a waypoint's number picks it, adding nothing (${JSON.stringify({ ...tappedBadge, want: badge.id })})`)
  // THE ORDER AS A LIST: a row's down arrow moves that waypoint one later;
  // "reverse the order" turns the path round.
  const listed = await page.evaluate(() => {
    const S = window.__studio
    const p = S.doc.paths[0]
    const was = p.points.map((q) => q.id)
    const rows = [...document.querySelectorAll('.st-sheet [data-path-point]')]
    rows[0].querySelector('[data-icon="action.down"]').closest('button').click()
    const moved = S.doc.paths[0].points.map((q) => q.id)
    ;[...document.querySelectorAll('.st-sheet button')].find((b) => /reverse the order/.test(b.textContent)).click()
    const back = S.doc.paths[0].points.map((q) => q.id)
    return { rows: rows.length, was, moved, back, sel: S.pathPointSel }
  })
  check(listed.rows === listed.was.length && listed.moved[1] === listed.was[0] && listed.moved[0] === listed.was[1] && listed.sel === listed.was[0],
        `the waypoints are listed in order, and a row's arrow moves it along (${JSON.stringify({ rows: listed.rows, was: listed.was, moved: listed.moved })})`)
  check(listed.back.join() === [...listed.moved].reverse().join(), 'and the whole order reverses at once')
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

// THE STARTER TEMPLATE: a new module comes from the starter the studio shipped,
// not from the store's 'starter' -- edited here, then deleted, and the new
// module is the pristine one all the same. The template is never in the store.
{
  const made = await page.evaluate(async () => {
    const S = window.__studio
    const base = await S.store.load('starter')
    base.module.about = 'TAMPERED'; base.module.props = []
    await S.store.save(base)
    const a = await S.newFromTemplate('fresh1', 'Fresh One')
    await S.store.remove('starter')
    const b = await S.newFromTemplate('fresh2', 'Fresh Two')
    const ids = (await S.store.list()).map((r) => r.id)
    const tpl = await S.templateRecord()
    for (const id of ['fresh1', 'fresh2']) await S.store.remove(id)
    const say = (r) => ({ id: r?.id, name: r?.module.name, about: r?.module.about, maps: Object.keys(r?.docs ?? {}), props: r?.module.props?.length,
                          sheets: Object.keys(r?.module.sprites ?? {}), assets: Object.keys(r?.assets ?? {}).sort(), base: r?.module.propIdBase, firstId: r?.module.props?.[0]?.id })
    return { a: say(a), b: say(b), tpl: say(tpl), ids }
  })
  const { a, b, tpl } = made
  check(tpl.id === 'starter' && tpl.maps.includes('first') && tpl.props >= 1 && tpl.sheets.includes('SPIR') && tpl.assets.some((p) => p.endsWith('SPIR.png')) && tpl.assets.some((p) => p.endsWith('ROCKWALL1.png')),
        `the template is the shipped starter: maps, props, sheet and textures (${JSON.stringify(tpl)})`)
  check(a.id === 'fresh1' && a.name === 'Fresh One' && a.about === tpl.about && a.props === tpl.props && JSON.stringify(a.assets) === JSON.stringify(tpl.assets),
        `an edited store starter does not reach a new module (${JSON.stringify(a)})`)
  check(b.id === 'fresh2' && b.maps.includes('first') && b.props === tpl.props, `a deleted store starter does not either (${JSON.stringify(b)})`)
  check(a.base >= 1100 && a.firstId === a.base, `a module from the template gets its own prop ids (${a.base})`)
  check(!made.ids.includes('starter') && made.ids.includes('fresh1') && made.ids.includes('fresh2'), `the template is never in the store (${made.ids.join(', ')})`)
}

// SWITCHING MODULE: Home shows the module just opened -- its name and its
// maps -- not the one before (the router does not move to the section already
// showing, so opening a module redraws Home itself); from any other section
// it lands there too.
{
  const switched = await page.evaluate(async () => {
    const S = window.__studio
    const was = S.rec.id
    const title = () => document.querySelector('.sd-page:not([hidden]) .sd-body h1, .sd-page:not([hidden]) .sd-body .sd-home-name')?.textContent ?? document.querySelector('.sd-page:not([hidden]) .sd-body')?.textContent.slice(0, 60)
    await S.go('home')
    await new Promise((r) => setTimeout(r, 200))
    // An edit, and the switch at once: within the moment saving waits.
    const about = S.module.about
    S.module.about = 'edited just before switching'; S.save()
    const chip = [...document.querySelectorAll('.sd-body .st-chip')].find((c) => c.textContent === 'copy1')
    chip?.click()
    await new Promise((r) => setTimeout(r, 800))
    const after = { route: S.route(), rec: S.rec.id, text: document.querySelector('.sd-page .sd-body')?.textContent ?? '', rail: document.querySelector('.sd-rail .sd-mod')?.textContent }
    await S.go('sounds')
    await S.openModule(was)
    await new Promise((r) => setTimeout(r, 800))
    const back = { route: S.route(), rec: S.rec.id, text: document.querySelector('.sd-page .sd-body')?.textContent ?? '' }
    const kept = S.module.about
    S.module.about = about; S.save()
    const out = { chip: !!chip, was, after, back, name: S.module.name, kept }
    await S.go('map')
    return out
  })
  check(switched.chip && switched.after.rec === 'copy1' && switched.after.route === 'home' && /Copy One/.test(switched.after.text) && /Copy One/.test(switched.after.rail ?? ''),
        `opening another module from Home shows that module's Home and name (${JSON.stringify({ ...switched.after, text: switched.after.text.slice(0, 50) })})`)
  check(switched.back.rec === switched.was && switched.back.route === 'home' && switched.back.text.includes(switched.name) && !/Copy One/.test(switched.back.text.slice(0, 80)),
        `and opening one from another section lands on its Home (${JSON.stringify({ ...switched.back, text: switched.back.text.slice(0, 50) })})`)
  check(switched.kept === 'edited just before switching', `an edit made just before switching is saved with the module it was made in (${switched.kept})`)
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

// PANELS ON THE TRIGGER SHEET: the module's, named there and designed in the
// Panels section; a card's ui_open chooses one rather than typing it.
{
  const panels = await page.evaluate(async () => {
    const S = window.__studio
    const { newPanel, addWidget } = await import('/studio/src/panels_emit.js')
    const p = newPanel('Shop'); addWidget(p, 'button', 'Buy')
    S.module.panels = { shop: p }
    S.doc.triggers.push({ id: 'tp1', name: 'open_shop', event: 'on_interact', actions: [{ a: 'ui_open', panel: 'shop' }] })
    S.commit()
    S.triggerOpen = null
    const { triggersSheet } = await import('/studio/src/cards.js')
    S.ui.showSheet('Triggers', triggersSheet(S))
    const listed = [...document.querySelectorAll('.st-sheet .st-row')].find((r) => /in the module/.test(r.textContent))?.textContent ?? ''
    const problems = S.vocab.validateTriggers(S.doc, S.module.panels)
    S.triggerOpen = 'tp1'
    S.ui.showSheet('Triggers', triggersSheet(S))
    const pick = [...document.querySelectorAll('.st-sheet select')].find((x) => [...x.options].some((o) => o.value === 'shop'))
    const out = { listed, problems, pick: pick ? [...pick.options].map((o) => o.value) : null }
    S.doc.triggers = S.doc.triggers.filter((t) => t.id !== 'tp1'); delete S.module.panels; S.triggerOpen = null; S.commit(); S.ui.hideSheet()
    return out
  })
  check(/1 in the module; these cards open shop/.test(panels.listed), `the trigger sheet names the module's panels its cards open (${panels.listed})`)
  check(panels.problems.length === 0 && panels.pick?.includes('shop'), `a card's ui_open chooses one of them, and is clean (${JSON.stringify(panels)})`)
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
    const ed = S.monsterEditor; ed.tab = 'behaviour'; ed.sel = st; ed.step = 0; ed.render()
    const sel = document.querySelector('.me .me-side select.st-sound')
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
    // The HUD lays out after its fonts and the frame's size settle: waited
    // for, not slept on (200 ms was sometimes short on a busy machine).
    for (let i = 0; i < 30 && !document.querySelector('.sc .sc-hit-hud'); i++) await new Promise((r) => setTimeout(r, 100))
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
    delete S.doc.graphs
    S.commit()
    await S.go('graph')
    const w = S.window
    const pick = (v) => w.addFrom(v)
    pick('event:on_interact')
    pick('act:')
    await new Promise((r) => setTimeout(r, 300))
    return { nodes: S.doc.graphs?.main?.nodes.map((n) => `${n.type}:${n.id}`), drawn: document.querySelectorAll('.gw .gw-node').length }
  })
  check(built.nodes?.join() === 'event:interact,action:do' && built.drawn === 2, `nodes are added from the vocabulary's menu and drawn (${JSON.stringify(built)})`)
  // THE PANELS have a group of their own in the menu, each word dropped in
  // ready (the module's first panel filled in); a node's ✕ deletes it, links
  // and all, and undo brings it back.
  const panelled = await page.evaluate(async () => {
    const S = window.__studio
    const hadPanels = S.module.panels
    S.module.panels = { shop: { title: 'Shop', widgets: [] }, ...(hadPanels ?? {}) }
    S.window.render()
    const offered = S.window.menuItems().filter((i) => /panels/.test(i.group)).map((i) => i.value)
    const pick = (v) => S.window.addFrom(v)
    pick('act:ui_open'); pick('event:on_ui_event')
    await new Promise((r) => setTimeout(r, 200))
    const nodes = S.doc.graphs.main.nodes
    const opened = nodes.find((n) => n.a === 'ui_open')
    S.doc.graphs.main.links.push(['ui_event.then', `${opened.id}.in`])
    S.commit(); S.window.render()
    const before = nodes.length
    document.querySelector(`.gw .gw-node[data-node="${opened.id}"] .gw-del`).click()
    await new Promise((r) => setTimeout(r, 100))
    const after = { nodes: S.doc.graphs.main.nodes.length, links: S.doc.graphs.main.links.filter(([f, t]) => t.startsWith(opened.id) || f.startsWith(opened.id)).length, drawn: !!document.querySelector(`.gw .gw-node[data-node="${opened.id}"]`) }
    const undoBtn = document.querySelector('.sd-head [data-action="undo"]')
    const undoable = !!undoBtn && !undoBtn.disabled
    undoBtn?.click()
    await new Promise((r) => setTimeout(r, 100))
    const back = (S.doc.graphs.main.nodes ?? []).some((n) => n.id === opened.id)
    // Leave the graph as the steps below expect it: the event and the action.
    S.doc.graphs.main.nodes = S.doc.graphs.main.nodes.filter((n) => ['interact', 'do'].includes(n.id))
    S.doc.graphs.main.links = []
    if (hadPanels) S.module.panels = hadPanels; else delete S.module.panels
    S.commit(); S.window.render()
    return { offered, opened: { a: opened.a, panel: opened.panel, id: opened.id }, before, after, back, undoable }
  })
  check((panelled.offered.includes('node:open_panel:shop') || ['act:ui_open', 'act:ui_close', 'event:on_ui_event', 'cond:widget_is'].every((v) => panelled.offered.includes(v))) && panelled.opened.panel === 'shop',
        `the menu has the panels in a group of their own, dropped in ready (${JSON.stringify(panelled.offered)} -> ${JSON.stringify(panelled.opened)})`)
  // THE MENU IS SEARCHED: + node… opens it, a word narrows it, Enter adds
  // the first. Every trigger verb is there by name; a panel's widgets are
  // entries of their own.
  const found = await page.evaluate(async () => {
    const S = window.__studio
    S.module.panels = { shop: { title: 'Shop', widgets: [{ kind: 'button', id: 1, name: 'buy', label: 'Buy', slot: 0 }], decor: [] } }
    S.window.render()
    document.querySelector('.gw .wk-top .gw-palette').click()
    await new Promise((r) => setTimeout(r, 50))
    const input = document.querySelector('.gw-menu .gw-menu-find')
    const all = document.querySelectorAll('.gw-menu .gw-menu-item').length
    input.value = 'fog'; input.dispatchEvent(new Event('input'))
    const fog = [...document.querySelectorAll('.gw-menu .gw-menu-item')].map((b) => b.dataset.value)
    input.value = 'shop buy'; input.dispatchEvent(new Event('input'))
    const buy = [...document.querySelectorAll('.gw-menu .gw-menu-item')].map((b) => b.dataset.value)
    const had = S.doc.graphs.main.nodes.length
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await new Promise((r) => setTimeout(r, 100))
    const nodes = S.vocab.graph.nodes.some((n) => n.name === 'when_panel_used')
    const added = S.doc.graphs.main.nodes.slice(had).map((n) => nodes ? `${n.type}:${n.panel}:${n.widget}` : `${n.type}:${n.event ?? n.c ?? ''}:${n.widget ?? ''}`)
    const linked = S.doc.graphs.main.links.some(([f, t]) => f.startsWith('shop_used') && t.startsWith('if_shop_1'))
    const closed = !document.querySelector('.gw-menu')
    S.doc.graphs.main.nodes = S.doc.graphs.main.nodes.slice(0, had); S.doc.graphs.main.links = S.doc.graphs.main.links.filter(([f]) => !f.startsWith('shop_used'))
    delete S.module.panels; S.commit(); S.window.render()
    return { nodes, all, fog, buy, added, linked, closed, verbs: S.window.menuItems().filter((i) => i.value.startsWith('cond:') || i.value.startsWith('act:')).length }
  })
  check(found.all > 60 && found.fog[0] === 'node:set_sector_effect', `+ node… opens a menu of everything, and "fog" finds the sector effect first (${found.all} entries; ${found.fog.slice(0, 3).join(', ')})`)
  if (found.nodes) {
    check(found.buy[0] === 'node:when_panel_used:shop:buy' && found.added.join() === 'when_panel_used:shop:buy' && found.closed,
          `"shop buy" finds the button's own entry, and Enter drops in the engine's when_panel_used for it (${JSON.stringify(found)})`)
  } else {
    check(found.buy[0] === 'ui:shop:1' && found.added.join() === 'event:on_ui_event:,condition:widget_is:1' && found.linked && found.closed,
          `"shop buy" finds the button's own entry, and Enter drops in the panel event and its widget, linked (${JSON.stringify(found)})`)
  }
  check(found.verbs > 30, `every trigger condition and action is in the menu by name (${found.verbs})`)
  // SHOWN AND HIDDEN: show / hide entries for every widget (a label too) and
  // every decor element; a decor entry drops in a node naming it, its form
  // offers the panel's decor, and choosing a widget there clears the decor.
  const shown = await page.evaluate(async () => {
    const S = window.__studio
    if (!S.vocab.graph.nodes.some((n) => n.name === 'show_element')) return null
    S.module.panels = { shop: { title: 'Shop', widgets: [{ kind: 'label', id: 1, name: 'gold', label: 'Gold', slot: {} }, { kind: 'button', id: 2, name: 'sell', label: 'Sell', hidden: true, slot: {} }], decor: [{ id: 'purse', type: 'text', text: '{hud.gold}' }] } }
    S.window.render()
    const offered = S.window.menuItems().map((i) => i.value).filter((v) => /_element:/.test(v))
    const had = S.doc.graphs.main.nodes.length
    const id = S.window.addFrom('node:hide_element:shop:#purse')
    const n = S.doc.graphs.main.nodes.find((x) => x.id === id)
    const made = { type: n?.type, panel: n?.panel, decor: n?.decor, widget: n?.widget }
    S.window.render()
    await new Promise((r) => setTimeout(r, 100))
    const sels = [...document.querySelectorAll('.gw select')]
    const decorSel = sels.find((s) => [...s.options].some((o) => o.value === 'purse'))
    const widgetSel = sels.find((s) => [...s.options].some((o) => o.value === 'sell'))
    const formDecor = decorSel?.value
    if (widgetSel) { widgetSel.value = 'sell'; widgetSel.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 100))
    const after = { widget: n?.widget, decor: n?.decor }
    S.doc.graphs.main.nodes = S.doc.graphs.main.nodes.slice(0, had)
    delete S.module.panels; S.commit(); S.window.render()
    return { offered, made, formDecor, after }
  })
  if (shown) {
    check(['node:show_element:shop:gold', 'node:hide_element:shop:sell', 'node:show_element:shop:#purse', 'node:hide_element:shop:#purse'].every((v) => shown.offered.includes(v)),
          `the menu shows and hides every widget, a label too, and every decor element (${shown.offered.join(', ')})`)
    check(shown.made.type === 'hide_element' && shown.made.decor === 'purse' && shown.made.widget === undefined && shown.formDecor === 'purse',
          `a decor entry drops in a node naming it, and its form shows it (${JSON.stringify(shown)})`)
    check(shown.after.widget === 'sell' && shown.after.decor === undefined, `choosing a widget clears the decor: the engine takes one (${JSON.stringify(shown.after)})`)
  } else console.log('page: the engine has no show_element -- skipped')
  const ticked = await page.evaluate(() => {
    const w = window.__studio.window
    const items = w.menuItems()
    const tick = items.find((i) => i.value === 'event:on_tick')
    return { group: tick?.group, label: tick?.label, afterEvery: items.findIndex((i) => i.value === 'event:on_tick') > items.findIndex((i) => i.value === 'node:every') }
  })
  check(ticked.group === 'when …' && ticked.label === 'every tick' && ticked.afterEvery, `"every tick" is a start in the when group, after "every" (${JSON.stringify(ticked)})`)
  // NOTES AND BENDS: a note round the picked node, its title dragged with
  // the node inside; a bend in a link, drawn through; the link gone, its bend too.
  const noted = await page.evaluate(async () => {
    const S = window.__studio
    const w = S.window
    w.picked = { kind: 'node', id: 'do' }
    w.addFrom('note:')
    const g = S.doc.graphs.main
    const note = g.notes?.[0]
    const node = g.nodes.find((n) => n.id === 'do')
    const wraps = note && node.pos.x > note.x && node.pos.y > note.y && node.pos.x < note.x + note.w
    const before = { nx: node.pos.x, ox: note.x }
    const head = document.querySelector(`.gw-note[data-note="${note.id}"] .gw-note-head`)
    const r = head.getBoundingClientRect()
    return { wraps, before, head: { x: r.x + 30, y: r.y + r.height / 2 }, id: note.id, drawn: !!document.querySelector('.gw-note') }
  })
  await page.mouse.move(noted.head.x, noted.head.y)
  await page.mouse.down()
  await page.mouse.move(noted.head.x + 40, noted.head.y + 30, { steps: 4 })
  await page.mouse.move(noted.head.x + 80, noted.head.y + 60, { steps: 4 })
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 200))
  // ...and resized from a side, and its text edited in place: two taps on
  // its title, type, Enter.
  const handle = await page.evaluate((id) => {
    const h = document.querySelector(`.gw-note[data-note="${id}"] .gw-note-h-e`)
    const r = h?.getBoundingClientRect()
    const n = window.__studio.doc.graphs.main.notes.find((x) => x.id === id)
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, was: { x: n.x, w: n.w } } : null
  }, noted.id)
  if (handle) {
    await page.mouse.move(handle.x, handle.y); await page.mouse.down()
    await page.mouse.move(handle.x + 30, handle.y, { steps: 4 }); await page.mouse.move(handle.x + 60, handle.y, { steps: 4 }); await page.mouse.up()
    await new Promise((r) => setTimeout(r, 200))
  }
  const sized = await page.evaluate((id) => { const n = window.__studio.doc.graphs.main.notes.find((x) => x.id === id); return { x: n.x, w: n.w } }, noted.id)
  const title = await page.evaluate((id) => { const r = document.querySelector(`.gw-note[data-note="${id}"] .gw-note-text`).getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 } }, noted.id)
  await page.mouse.click(title.x, title.y); await new Promise((r) => setTimeout(r, 120))
  await page.mouse.click(title.x, title.y); await new Promise((r) => setTimeout(r, 300))
  const editing = await page.evaluate(() => !!document.querySelector('.gw-note-editing'))
  await page.keyboard.type('Gate puzzle'); await page.keyboard.press('Enter'); await new Promise((r) => setTimeout(r, 300))
  const retitled = await page.evaluate((id) => window.__studio.doc.graphs.main.notes.find((x) => x.id === id).text, noted.id)
  check(handle && sized.w > handle.was.w + 40 && sized.x === handle.was.x,
        `a picked note resizes from its side, the other side staying put (${JSON.stringify({ was: handle?.was, now: sized })})`)
  check(editing && retitled === 'Gate puzzle', `two taps on a note's title edit its text in place (${JSON.stringify({ editing, retitled })})`)
  const bent = await page.evaluate(async (id) => {
    const S = window.__studio
    const w = S.window
    const g = S.doc.graphs.main
    const note = g.notes.find((n) => n.id === id)
    const node = g.nodes.find((n) => n.id === 'do')
    const moved = { note: note.x, node: node.pos.x }
    g.links = [['interact.then', 'do.in']]
    S.commit(); w.render()
    await new Promise((r) => setTimeout(r, 300))
    w.addBend(0)
    await new Promise((r) => setTimeout(r, 300))
    const dot = !!document.querySelector('.gw-bend')
    const path = document.querySelector('.gw-link')?.getAttribute('d') ?? ''
    const through = (path.match(/C/g) ?? []).length
    g.links = []; S.commit(); w.render()
    const pruned = !g.bends
    delete g.notes; S.commit(); w.render()
    return { moved, dot, through, pruned }
  }, noted.id)
  check(noted.drawn && noted.wraps, `a note goes round the picked node (${JSON.stringify(noted)})`)
  check(bent.moved.note - noted.before.ox > 40 && bent.moved.node - noted.before.nx > 40, `dragging its title moves the note and the node inside it (${JSON.stringify(bent.moved)} from ${JSON.stringify(noted.before)})`)
  check(bent.dot && bent.through === 2 && bent.pruned, `a bend is a dot the link is drawn through, and goes with its link (${JSON.stringify(bent)})`)
  // HELP: a node's ⓘ opens its description under its title, and stays open
  // when the board is drawn again; a field's ⓘ in the side panel opens the
  // field's own (the vocabularies' doc strings).
  const helped = await page.evaluate(async () => {
    const S = window.__studio
    const w = S.window
    const id = w.addFrom('node:set_sector_light')
    await new Promise((r) => setTimeout(r, 100))
    const spec = S.vocab.graph.nodes.find((n) => n.name === 'set_sector_light')
    const info = document.querySelector(`.gw-node[data-node="${id}"] [data-info]`)
    info?.click()
    const shown = document.querySelector(`.gw-node[data-node="${id}"] .gw-doc`)
    const open1 = shown && !shown.hidden && shown.textContent === spec.doc
    w.render()
    const kept = !document.querySelector(`.gw-node[data-node="${id}"] .gw-doc`)?.hidden
    // The side panel's fields: the light's own description.
    w.picked = { kind: 'node', id }; w.render()
    const lightRow = document.querySelector('.gw .wk-details [data-arg="light"]')
    lightRow?.querySelector('.st-help')?.click()
    const fieldDoc = lightRow?.querySelector('.st-help-text')
    const field = fieldDoc && !fieldDoc.hidden && fieldDoc.textContent === spec.args.find((a) => a.name === 'light').doc
    S.doc.graphs.main.nodes = S.doc.graphs.main.nodes.filter((n) => n.id !== id); S.commit(); w.picked = null; w.render()
    return { info: !!info, open1, kept, field, helps: document.querySelectorAll('.gw .st-help').length }
  })
  check(helped.info && helped.open1 && helped.kept, `a node's ⓘ opens its description, and it stays open when the board is drawn again (${JSON.stringify(helped)})`)
  check(helped.field, 'a field\'s ⓘ opens the field\'s own description')
  // THE VARIABLES PANE AND THE VAR DROPDOWN: the graph's variables and every
  // property; a property's set dropped in from its row; the node's dropdown
  // grouped, offering only what a set may name.
  const vars = await page.evaluate(async () => {
    const S = window.__studio
    const w = S.window
    if (!(S.vocab.graph.properties ?? []).length) return { skip: true }
    w.side = 'variables'; w.render()
    const find = document.querySelector('.gw .gw-var-find')
    const rows = { props: document.querySelectorAll('.gw [data-prop]').length, readOnlyX: [...(document.querySelector('.gw [data-prop="x"]')?.querySelectorAll('.gw-var-drop') ?? [])].map((b) => b.textContent) }
    find.value = 'jump'; find.dispatchEvent(new Event('input'))
    const filtered = [...document.querySelectorAll('.gw [data-prop]')].map((r) => r.dataset.prop)
    const setHp = [...document.querySelectorAll('.gw [data-prop]')].length >= 0 && (() => { find.value = 'hp'; find.dispatchEvent(new Event('input')); return [...document.querySelector('.gw [data-prop="hp"]').querySelectorAll('.gw-var-drop')].find((b) => b.textContent === 'set') })()
    setHp.click()
    await new Promise((r) => setTimeout(r, 200))
    const node = S.doc.graphs.main.nodes.find((n) => n.type === 'set_var' && n.var === 'hp')
    w.side = 'details'; w.render()
    const sel = document.querySelector(`.gw-node[data-node="${node?.id}"] select[data-var]`)
    const groups = sel ? [...sel.querySelectorAll('optgroup')].map((g) => g.label) : []
    const offersX = sel ? [...sel.options].some((o) => o.value === 'x') : null
    S.doc.graphs.main.nodes = S.doc.graphs.main.nodes.filter((n) => n !== node); w.varFilter = ''; S.commit(); w.render()
    return { rows, filtered, node: node && { type: node.type, var: node.var }, groups, offersX }
  })
  if (!vars.skip) {
    check(vars.rows.props > 50 && vars.rows.readOnlyX.join() === 'get', `the variables pane lists every property, a read-only one only to get (${JSON.stringify(vars.rows)})`)
    check(vars.filtered.length && vars.filtered.every((n) => /jump/.test(n)) , `and is searched (${vars.filtered.join(', ')})`)
    check(vars.node?.var === 'hp' && vars.groups.includes('the entity') && vars.offersX === false,
          `a property's set is dropped in from its row, and the node's dropdown is grouped, offering only what a set may name (${JSON.stringify(vars)})`)
  }
  // A NUMBER FROM A VARIABLE: 𝑥 beside a damage amount takes it from the
  // graph's variable instead; ✕ makes it a typed number again; a delay's
  // count, which stays literal (it decides the exits), has no 𝑥.
  const bound = await page.evaluate(async () => {
    const S = window.__studio
    const w = S.window
    const g = S.doc.graphs.main
    g.vars = { ...(g.vars ?? {}), dmg: 5 }
    const hurt = w.addFrom('node:damage')
    const wait = w.addFrom('node:sequence')
    g.nodes.find((n) => n.id === hurt).amount = 10
    S.commit(); w.side = 'details'; w.render()
    await new Promise((r) => setTimeout(r, 100))
    const node = () => document.querySelector(`.gw-node[data-node="${hurt}"]`)
    const offered = !!node().querySelector('[data-bind="amount"]')
    const onDelay = !!document.querySelector(`.gw-node[data-node="${wait}"] [data-bind]`)
    node().querySelector('[data-bind="amount"]').click()
    await new Promise((r) => setTimeout(r, 100))
    const held = JSON.stringify(g.nodes.find((n) => n.id === hurt).amount)
    const sel = node().querySelector('[data-bound="amount"]')
    const choices = sel ? [...sel.options].map((o) => o.value) : []
    ;[...node().querySelectorAll('.gw-bound-row .gw-bind')].find((b) => b.querySelector('[data-icon="action.close"]'))?.click()
    await new Promise((r) => setTimeout(r, 100))
    const back = g.nodes.find((n) => n.id === hurt).amount
    g.nodes = g.nodes.filter((n) => n.id !== hurt && n.id !== wait); delete g.vars.dmg; S.commit(); w.render()
    return { offered, onDelay, held, choices: choices.slice(0, 3), hasHp: choices.includes('hp'), back: back === undefined ? 'unset' : back }
  })
  check(bound.offered && !bound.onDelay && bound.held === '{"var":"dmg"}' && bound.choices[0] === 'dmg' && bound.hasHp && bound.back === 'unset',
        `𝑥 takes a number from a variable (the graph's, or a numeric property), ✕ makes it typed again; a sequence's count has none (${JSON.stringify(bound)})`)
  check(panelled.after.nodes === panelled.before - 1 && panelled.after.links === 0 && !panelled.after.drawn && panelled.undoable && panelled.back,
        `a node's ✕ deletes it and its links, and undo brings it back (${JSON.stringify(panelled)})`)
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
    return { links: S.doc.graphs?.main?.links, curves: document.querySelectorAll('.gw .gw-link').length, ok: r.ok, errors: r.errors.map((e) => e.msg),
             declares: /script first\.main\.graph\.json/.test(r.mapText), file: r.graphText && JSON.parse(r.graphText).links }
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
    const after = { nodes: S.doc.graphs?.main?.nodes.length, links: S.doc.graphs?.main?.links.length }
    w.close()
    delete S.doc.graphs; S.commit()
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
    S.doc.graphs = { main: { vars: {}, links: [['press.then', 'tp.in']], nodes: [
      { id: 'press', type: 'event', event: 'on_interact', pos: { x: 0, y: 0 } },
      { id: 'tp', type: 'action', a: 'teleport', pos: { x: 280, y: 0 } },
      { id: 'tag', type: 'condition', c: 'sector_tag_is', pos: { x: 0, y: 260 } },
      { id: 'kind', type: 'condition', c: 'entity_kind_is', pos: { x: 280, y: 260 } },
      { id: 'wait', type: 'delay', ticks: 30, pos: { x: 560, y: 0 } }] } }
    S.commit()
    await S.go('graph')
    await new Promise((r) => setTimeout(r, 300))
    const node = (id) => document.querySelector(`.gw [data-node="${id}"]`)
    // A field on the board: the delay's ticks, changed where it is drawn.
    const ticks = node('wait').querySelector('[data-arg="ticks"] input')
    if (ticks) { ticks.value = '90'; ticks.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 100))
    // Links are drawn on the next frame, once the pins have places.
    for (let i = 0; i < 20 && !document.querySelector('.gw .wk-edge.gw-exec-link'); i++) await new Promise((r) => setTimeout(r, 50))
    const link = document.querySelector('.gw .wk-edge.gw-exec-link')
    return { sid, mob: mob.id, center: { x: cx, y: cy, floor: room.floor }, ticks: S.doc.graphs.main.nodes.find((n) => n.id === 'wait').ticks,
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
    glow: getComputedStyle(document.querySelector('.gw [data-pin="wait.in"][data-dir="in"] .gw-dot')).backgroundColor,
    // the skin's colour for a pin a link may end on
    want: (() => { const d = document.createElement('div'); d.style.color = window.__studio.skin.canvas('graph', 'pin.valid').color; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v })() }))
  await page.mouse.up()
  check(during.linking === 'exec' && during.glow === during.want, `while a link is dragged the inputs it can reach light up (${JSON.stringify(during)})`)
  // Picks on the map, from the nodes: the board steps aside, the tap fills the fields.
  const tapWorld = async (x, y, z = 0) => { const p = await page.evaluate(([x, y, z]) => window.__studio.viewport.toScreen(x, y, z), [x, y, z]); await page.mouse.click(p.x, p.y); await new Promise((r) => setTimeout(r, 150)) }
  // by its text, or by its icon: '📍' is the action.pick icon (ui.js icon), whichever the skin draws
  const clickIn = (id, text) => page.evaluate(([id, text]) => [...document.querySelectorAll(`.gw [data-node="${id}"] button`)].find((b) => b.textContent.includes(text) || (text === '📍' && b.querySelector('[data-icon="action.pick"]'))).click(), [id, text])
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
    const n = (id) => S.doc.graphs.main.nodes.find((x) => x.id === id)
    return { tp: [n('tp').x, n('tp').y, n('tp').z], tag: n('tag').tag, roomTag: S.doc.sectors[sid].tag, kind: n('kind').name, back: !document.querySelector('.sd-page').hidden }
  }, setup.sid)
  check(hidden, 'picking on the map steps the board aside')
  check(Math.abs(picked.tp[0] - (setup.center.x - 1)) < 0.3 && Math.abs(picked.tp[1] - (setup.center.y + 1)) < 0.3 && picked.tp[2] === setup.center.floor,
        `a teleport's place is a tap on the floor, at that floor (${JSON.stringify(picked.tp)})`)
  check(picked.tag > 0 && picked.tag === picked.roomTag, `a tag is a tap on the room, which is given one if it had none (${picked.tag}/${picked.roomTag})`)
  check(picked.kind === 'imp' && picked.back, `a thing's name is a tap on one placed on the map, and the board comes back (${JSON.stringify(picked)})`)
  await page.evaluate(async (mob) => { const S = window.__studio; delete S.doc.graphs; S.doc.entities = window.__keptEntities; S.commit(); S.viewport.setMode('iso'); S.ui.setView('iso'); await S.go('map') }, setup.mob)
}

// THE PANEL EDITOR: a panel designed where the player sees it -- drawn by the
// client's UiView, its widgets dragged and sized in the frame -- tried as in
// the game, and opened and answered from a map's graph.
{
  const opened = await page.evaluate(async () => {
    const S = window.__studio
    const { newPanel, addWidget } = await import('/studio/src/panels_emit.js')
    const p = newPanel('Shop')
    addWidget(p, 'label', 'What will it be?')
    addWidget(p, 'button', 'Buy')
    S.module.panels = { shop: p }
    S.moduleChanged()
    await S.go('panels', 'shop')
    await new Promise((r) => setTimeout(r, 500))
    const drawn = document.querySelector('.pw .dnp-ui-t[data-template="shop"]')
    return { route: S.route(), drawn: !!drawn, slots: [...document.querySelectorAll('.pw .pw-slot')].map((b) => b.dataset.widget), title: drawn?.querySelector('.dnp-ui-title')?.textContent }
  })
  check(opened.route === 'panels' && opened.drawn && opened.slots.join() === 'what_will_it_be,buy', `the panel is drawn by the client's own UiView, a handle over each widget (${JSON.stringify(opened)})`)
  // Drag the button 30 frame pixels right and 20 down.
  const handle = async (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, k: window.__studio.window?.k ?? 1 } }, sel)
  const drag = async (from, dx, dy) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 }); await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 }); await page.mouse.up(); await new Promise((r) => setTimeout(r, 300)) }
  const before = await page.evaluate(() => ({ ...window.__studio.module.panels.shop.widgets[1].slot }))
  const b = await handle('.pw [data-widget="buy"]')
  await drag(b, 30, 20)
  const after = await page.evaluate(() => {
    const S = window.__studio; const w = S.module.panels.shop.widgets[1]
    const slot = document.querySelectorAll('.pw .dnp-ui-stage > .dnp-ui-slot')[1]
    return { slot: { ...w.slot }, left: parseFloat(slot.style.left), on: document.querySelector('.pw [data-widget="buy"]')?.dataset.on }
  })
  check(after.slot.x > before.x + 4 && after.slot.y > before.y + 4 && after.on === '1', `dragging a widget moves its slot, and selects it (${JSON.stringify(before)} -> ${JSON.stringify(after.slot)})`)
  // Its corner sizes it.
  const corner = await handle('.pw [data-widget="buy"] .pw-corner')
  await drag(corner, -40, 16)
  const sized = await page.evaluate(() => ({ ...window.__studio.module.panels.shop.widgets[1].slot }))
  check(sized.w < after.slot.w && sized.h > after.slot.h, `its corner sizes it (${after.slot.w}x${after.slot.h} -> ${sized.w}x${sized.h})`)
  // The panel moved toward the top right re-anchors there.
  // By its title bar: the rest of the panel pans the view.
  const pan = await page.evaluate(() => { const r = document.querySelector('.pw [data-handle="panel"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 8 } })
  await page.evaluate(() => { window.__studio.window.sel = { kind: 'panel' } })
  await drag(pan, 260, -120)
  const look = await page.evaluate(() => ({ ...window.__studio.module.panels.shop.look }))
  check(look.anchor === 'tr' || look.anchor === 't' || look.anchor === 'r', `dragging the panel re-anchors it to where it lands (${JSON.stringify(look)})`)
  // Add a toggle from the palette, rename it, and undo brings the old name back.
  const added = await page.evaluate(async () => {
    const S = window.__studio
    const pal = document.querySelector('.pw .pw-palette')
    pal.value = 'w:toggle'; pal.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 300))
    const w = S.module.panels.shop.widgets.at(-1)
    const name = [...document.querySelectorAll('.pw .wk-details .st-row')].find((r) => /name \(graphs say it\)/.test(r.textContent))?.querySelector('input')
    name.value = 'Loud Music'; name.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 300))
    const renamed = S.module.panels.shop.widgets.at(-1).name
    return { kind: w.kind, id: w.id, renamed, handles: document.querySelectorAll('.pw .pw-slot').length }
  })
  check(added.kind === 'toggle' && added.id === 3 && added.renamed === 'loud_music' && added.handles === 3, `the palette adds a widget, drawn with a handle; its name is made the engine's way (${JSON.stringify(added)})`)
  // Try it: a press says what a graph hears.
  const tried = await page.evaluate(async () => {
    const S = window.__studio
    document.querySelector('.pw [data-mode="try"]').click()
    await new Promise((r) => setTimeout(r, 300))
    ;[...document.querySelectorAll('.pw .dnp-ui-t button')].find((x) => x.textContent === 'Buy').click()
    await new Promise((r) => setTimeout(r, 100))
    const heard = [...document.querySelectorAll('.pw .pw-heard-row')].map((r) => r.firstChild.textContent)
    document.querySelector('.pw [data-mode="edit"]').click()
    return { heard, hidden: getComputedStyle(document.querySelector('.pw .pw-hits')).display }
  })
  check(tried.heard[0] === 'when_panel_used · shop · buy → value 1', `in try mode a press says what a graph hears (${tried.heard.join(' | ')})`)
  // Open it from the first map's graph, and answer its button there.
  const wired = await page.evaluate(async () => {
    const S = window.__studio
    const map = Object.keys(S.docs)[0]
    delete S.docs[map].graphs
    const pick = (label, value) => { const s = [...document.querySelectorAll('.pw .wk-details .st-row')].find((r) => r.firstChild?.textContent === label)?.querySelector('select'); s.value = value; s.dispatchEvent(new Event('change')) }
    pick('open it from', `${map}:main`)
    await new Promise((r) => setTimeout(r, 600))
    const first = { route: S.route(), nodes: S.docs[map].graphs?.main?.nodes.map((n) => `${n.type}:${n.a ?? ''}:${n.panel ?? ''}`), picked: S.window?.picked?.id }
    await S.go('panels', 'shop')
    await new Promise((r) => setTimeout(r, 300))
    pick('answer', 'buy')
    await new Promise((r) => setTimeout(r, 200))
    pick('answer buy in', `${map}:main`)
    await new Promise((r) => setTimeout(r, 600))
    const g = S.docs[map].graphs.main
    const { graphProblems } = await import('/studio/src/graphs_emit.js')
    await S.go('panels', 'shop')
    await new Promise((r) => setTimeout(r, 300))
    const uses = [...document.querySelectorAll('.pw [data-use]')].map((u) => u.dataset.use)
    const r = await S.emitAll()
    const lua = r ? String(r.files.find((f) => f.path === `maps/${map}.lua`).bytes) : ''
    const hud = r ? JSON.parse(String(r.files.find((f) => f.path === 'assets/ui/hud.json')?.bytes ?? '{}')) : {}
    const out = { map, first, nodes: g.nodes.map((n) => n.type + (n.c ? `:${n.c}:${n.widget}` : '')), links: g.links, problems: graphProblems(g, S.vocab.graph, S.vocab.trigger), uses,
                  ok: !!r, luaPanels: /panels = \{/.test(lua) && /template = "shop"/.test(lua), template: !!hud.panels?.shop, ready: !!S.vocab.graph.nodes.some((n) => n.name === 'open_panel'),
                  graphPanels: r ? !!JSON.parse(String(r.files.find((f) => f.path === `maps/${map}.main.graph.json`)?.bytes ?? '{}')).panels?.shop : false }
    delete S.docs[map].graphs; delete S.module.panels; S.moduleChanged()
    return out
  })
  const viaNodes = wired.ready
  check(wired.first.route === 'graph' && wired.first.picked && wired.first.nodes?.length === 1 && wired.first.nodes[0].includes('shop'),
        `"open it from" puts the opening node into that map's graph and goes there, picked (${JSON.stringify(wired.first)})`)
  check(viaNodes ? wired.nodes.includes('when_panel_used') : (wired.nodes.includes('event') && wired.nodes.some((n) => n === 'condition:widget_is:2') && wired.links.length === 1),
        `"answer" adds what hears that button (${viaNodes ? 'the panel node' : 'on_ui_event + widget_is, the trigger words'}: ${wired.nodes.join(', ')})`)
  // With the trigger words, widget_is does not name its panel, so only the opening is listed.
  check(wired.problems.length === 0 && wired.uses.length === (viaNodes ? 2 : 1), `the graph is clean, and the panel lists where it is used (${wired.problems.join(' | ')} / ${wired.uses.join(', ')})`)
  // With the engine's panel nodes the graph's own file carries the panel
  // (graph field `panels`); with the trigger words, the map's trigger table.
  check(wired.ok && (wired.ready ? wired.graphPanels : wired.luaPanels) && wired.template,
        `and the module is written: ${wired.ready ? 'the graph\'s file' : 'the map\'s trigger table'} carries the panel, the layout its template (${JSON.stringify({ ok: wired.ok, graph: wired.graphPanels, lua: wired.luaPanels, template: wired.template })})`)
  await page.evaluate(async () => { await window.__studio.go('home') })
}

// MANY GRAPHS: a map holds several, each with its own name -- a new one made
// from the bar's picker, edited apart from the first, switched between,
// renamed; the Graphs section lists them all and the module writes each as
// its own file, declared by the map; deleting one asks first.
{
  await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map', Object.keys(S.docs)[0])
    S.doc.graphs = { main: { vars: {}, nodes: [{ id: 'press', type: 'event', event: 'on_interact', pos: { x: 0, y: 0 } }], links: [] } }
    S.commit()
    await S.go('graph')
    await new Promise((r) => setTimeout(r, 300))
    const sel = document.querySelector('.gw .gw-graphs')
    sel.value = '\u0000new'; sel.dispatchEvent(new Event('change'))
  })
  await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
  await page.keyboard.type('doors')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.window?.gname === 'doors', { timeout: 3000 }).catch(() => {})
  const made = await page.evaluate(async () => {
    const S = window.__studio
    S.window.addFrom('node:delay')
    await new Promise((r) => setTimeout(r, 200))
    const out = { names: Object.keys(S.doc.graphs), gname: S.window.gname, hash: location.hash, doors: S.doc.graphs.doors?.nodes.map((n) => n.type), main: S.doc.graphs.main.nodes.map((n) => n.type),
                  picker: [...document.querySelectorAll('.gw .gw-graphs option')].map((o) => o.value).filter((v) => v !== '\u0000new') }
    const sel = document.querySelector('.gw .gw-graphs')
    sel.value = 'main'; sel.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 400))
    out.back = { gname: S.window.gname, drawn: [...document.querySelectorAll('.gw .gw-node')].map((n) => n.dataset.node) }
    return out
  })
  check(made.names.join() === 'main,doors' && made.gname === 'doors' && /graph\/first%3Adoors/.test(made.hash) && made.picker.join() === 'main,doors',
        `a new graph is made from the bar's picker, named in the studio's dialog, and its address follows (${JSON.stringify(made)})`)
  check(made.doors?.join() === 'delay' && made.main.join() === 'event', 'a node goes into the graph being edited, and the other is untouched')
  check(made.back.gname === 'main' && made.back.drawn.join() === 'press', `the picker switches between them (${JSON.stringify(made.back)})`)
  const renamed = await page.evaluate(async () => {
    const S = window.__studio
    const name = [...document.querySelectorAll('.gw .wk-details .st-row')].find((r) => r.firstChild?.textContent === 'name' && r.closest('.wk-details'))
    const inputs = [...document.querySelectorAll('.gw .wk-details .st-row')].filter((r) => r.firstChild?.textContent === 'name').map((r) => r.querySelector('input'))
    const box = inputs.at(-1)
    box.value = 'Lifts'; box.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 200))
    await S.go('graphs')
    await new Promise((r) => setTimeout(r, 200))
    const rows = [...document.querySelectorAll('[data-graph]')].map((r) => r.dataset.graph)
    const r = await S.emitAll()
    const paths = (r?.files ?? []).map((f) => f.path)
    const map = r ? String(r.files.find((f) => f.path === 'maps/first.map').bytes) : ''
    return { names: Object.keys(S.doc.graphs), rows, files: paths.filter((p) => p.endsWith('.graph.json')), declares: ['first.lifts.graph.json', 'first.doors.graph.json'].every((f) => map.includes(`script ${f}`)), had: !!name }
  })
  check(renamed.names.join() === 'lifts,doors', `renaming keeps the graph and its place in the order (${renamed.names.join()})`)
  check(renamed.rows.includes('first:lifts') && renamed.rows.includes('first:doors'), `the Graphs section lists both (${renamed.rows.join(', ')})`)
  check(renamed.files.includes('maps/first.lifts.graph.json') && renamed.files.includes('maps/first.doors.graph.json') && renamed.declares,
        `the module writes each as its own file, and the map declares both (${renamed.files.join(', ')})`)
  await page.evaluate(async () => {
    const S = window.__studio
    await S.go('graph', 'first:doors')
    await new Promise((r) => setTimeout(r, 300))
    ;[...document.querySelectorAll('.gw .wk-details button')].find((b) => b.textContent === 'delete graph').click()
  })
  await page.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('dialog[open] button[type=submit]').click())
  await new Promise((r) => setTimeout(r, 400))
  const deleted = await page.evaluate(async () => {
    const S = window.__studio
    const out = { names: Object.keys(S.doc.graphs), gname: S.window.gname }
    delete S.doc.graphs; S.commit(); await S.go('map')
    return out
  })
  check(deleted.names.join() === 'lifts' && deleted.gname === 'lifts', `deleting a graph asks first, and the window moves to the one left (${JSON.stringify(deleted)})`)
}

// A CUTSCENE: the camera path chosen on its node (its length, the shot's
// duration), and ▶ scene playing the run over the map -- bars in, the line at
// the bottom drawn by the client's HUD, the camera on the path -- then back.
{
  const built = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map', Object.keys(S.docs)[0])
    const { addPath, addPathPoint } = await import('/studio/src/doc.js')
    const room = S.doc.sectors[S.doc.order[0]]
    const xs = room.verts.map((v) => v.x); const ys = room.verts.map((v) => v.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    window.__keptPaths = S.doc.paths
    S.doc.paths = []
    const p = addPath(S.doc, 7)
    for (const [fx, fy] of [[0.2, 0.2], [0.5, 0.4], [0.8, 0.7]]) addPathPoint(S.doc, p, x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, room.floor + 2)
    S.doc.graphs = { intro: { vars: {}, nodes: [
      { id: 'go', type: 'when_level_starts', pos: { x: 0, y: 0 } },
      { id: 'cut', type: 'start_cinematic', pos: { x: 260, y: 0 } },
      { id: 'fly', type: 'camera_flythrough', path: 7, speed: 2, pos: { x: 520, y: 0 } },
      { id: 'line', type: 'subtitle', text: 'You came back.', speaker: 'Guide', seconds: 6, pos: { x: 780, y: 0 } }],
      links: [['go.then', 'cut.in'], ['cut.then', 'fly.in'], ['fly.then', 'line.in']] } }
    S.commit()
    await S.go('graph', `${S.docName}:intro`)
    await new Promise((r) => setTimeout(r, 400))
    const node = document.querySelector('.gw [data-node="fly"]')
    const sel = [...node.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === '7'))
    return { option: sel ? [...sel.options].find((o) => o.value === '7').textContent : null, hint: node.textContent.match(/the shot lasts [\d.]+ s/)?.[0] ?? null,
             length: S.pathCurve(p).length, play: !!document.querySelector('.gw .gw-play') }
  })
  check(/tag 7 · [\d.]+ u/.test(built.option ?? '') && built.hint === `the shot lasts ${(built.length / 2).toFixed(1)} s`,
        `a flythrough chooses its path from the map's, with its length and the shot's duration (${built.option} / ${built.hint})`)
  const playing = await page.evaluate(async () => {
    const S = window.__studio
    document.querySelector('.gw .gw-play').click()
    await new Promise((r) => setTimeout(r, 1200))
    const scene = document.querySelector('.sc-scene')
    const bar = scene?.querySelector('.sc-bar-top')
    const hud = scene?.querySelector('.dnp-hud')?.textContent ?? ''
    return { scene: !!scene, bar: bar ? bar.getBoundingClientRect().height : 0, hud, pose: S.viewport.pose, graphHidden: document.querySelector('.gw').hidden,
             clock: scene?.querySelector('.sc-clock')?.textContent }
  })
  check(playing.scene && playing.bar > 10 && playing.graphHidden, `▶ scene plays the run over the map, the bars in (${playing.bar}px)`)
  check(/Guide/.test(playing.hud) && /You came back\./.test(playing.hud), `the line and its speaker at the bottom, drawn by the client's HUD (${playing.hud})`)
  check(!!playing.pose?.eye && !!playing.pose?.look, `the camera rides the path (${JSON.stringify(playing.pose?.eye)})`)
  const stopped = await page.evaluate(async () => {
    const S = window.__studio
    document.querySelector('.sc-scene [data-scene="stop"]').click()
    await new Promise((r) => setTimeout(r, 300))
    const out = { scene: !!document.querySelector('.sc-scene'), pose: S.viewport.pose ?? null, graph: !document.querySelector('.gw').hidden, route: S.route() }
    delete S.doc.graphs; S.doc.paths = window.__keptPaths ?? []; S.commit(); await S.go('map')
    return out
  })
  check(!stopped.scene && stopped.pose === null && stopped.graph && stopped.route === 'graph', `■ ends it: the camera given back, the graph window there again (${JSON.stringify(stopped)})`)
}

// GOING TO ANOTHER MAP, and A PANEL THE GAME OPENS: change_map chooses one of
// the module's maps and a spawn point there; the panel editor puts the
// opening into the game's graph, and the module is written with the game's
// own table of the panels its graphs open.
{
  const travel = await page.evaluate(async () => {
    const S = window.__studio
    const { addSpawn } = await import('/studio/src/doc.js')
    const here = Object.keys(S.docs)[0]
    S.docs.yard = S.starterDoc('yard')
    addSpawn(S.docs.yard, 'door', 2, 2, 0)
    await S.go('map', here)
    S.doc.graphs = { travel: { vars: {}, nodes: [
      { id: 'go', type: 'when_level_starts', pos: { x: 0, y: 0 } },
      { id: 'away', type: 'change_map', level: 'yard', pos: { x: 260, y: 0 } }], links: [['go.then', 'away.in']] } }
    S.commit()
    await S.go('graph', `${here}:travel`)
    await new Promise((r) => setTimeout(r, 400))
    const node = () => document.querySelector('.gw [data-node="away"]')
    const level = [...node().querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'yard'))
    const more = node().querySelector('.gw-more')
    more.value = 'spawn'; more.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 200))
    const spawn = [...node().querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'door'))
    const maps = level ? [...level.options].map((o) => o.value).filter(Boolean) : []
    spawn.value = 'door'; spawn.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 200))
    const { graphProblems } = await import('/studio/src/graphs_emit.js')
    const g = S.doc.graphs.travel
    const clean = graphProblems(g, S.vocab.graph, S.vocab.trigger, { maps: Object.keys(S.docs) })
    g.nodes[1].level = 'nowhere'
    const lost = graphProblems(g, S.vocab.graph, S.vocab.trigger, { maps: Object.keys(S.docs) })
    delete S.doc.graphs; S.commit()
    return { maps, here, spawn: g.nodes[1].spawn, clean, lost }
  })
  check(travel.maps.includes('yard') && travel.maps.includes(travel.here) && travel.spawn === 'door', `change_map chooses a map of the module and a spawn point there by its tag (${JSON.stringify(travel)})`)
  check(travel.clean.length === 0 && travel.lost.some((p) => /no map called nowhere/.test(p)), 'and a map the module lacks is named')
  const gamePanel = await page.evaluate(async () => {
    const S = window.__studio
    const { newPanel, addWidget } = await import('/studio/src/panels_emit.js')
    const p = newPanel('Shop'); addWidget(p, 'button', 'Buy')
    S.module.panels = { shop: p }
    delete S.module.graphs
    S.moduleChanged()
    await S.go('panels', 'shop')
    await new Promise((r) => setTimeout(r, 400))
    const sel = [...document.querySelectorAll('.pw .wk-details .st-row')].find((r) => r.firstChild?.textContent === 'open it from')?.querySelector('select')
    const offered = [...sel.options].map((o) => o.value)
    sel.value = 'game:game'; sel.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 600))
    const node = S.module.graphs?.game?.nodes?.[0]
    const r = await S.emitAll()
    const txt = r ? String(r.files.find((f) => f.path === 'module.txt').bytes) : ''
    const table = r ? String(r.files.find((f) => f.path === 'maps/module_panels.lua')?.bytes ?? '') : ''
    const gameFile = r ? JSON.parse(String(r.files.find((f) => f.path === 'maps/module.game.graph.json')?.bytes ?? '{}')) : {}
    const ready = !!S.vocab.graph.nodes.some((n) => n.name === 'open_panel')
    delete S.module.graphs; delete S.module.panels; delete S.docs.yard; S.moduleChanged(); await S.go('map')
    return { offered, route: S.route(), node, txt, table: /triggers\.load/.test(table) && /template = "shop"/.test(table), ready, graphPanels: !!gameFile.panels?.shop, tableFile: !!table }
  })
  check(gamePanel.offered.includes('game:game') && (gamePanel.ready ? gamePanel.node?.type === 'open_panel' : gamePanel.node?.a === 'ui_open') && gamePanel.node?.panel === 'shop',
        `the panel editor opens a panel from the game's graph too, ${gamePanel.ready ? 'with the engine\'s open_panel' : 'with ui_open'} (${JSON.stringify(gamePanel.node)})`)
  if (gamePanel.ready) {
    // The engine's panel nodes: the game graph's own file carries the panel,
    // and no trigger table is needed in the game VM.
    check(gamePanel.graphPanels && !gamePanel.tableFile && !/module_panels\.lua/.test(gamePanel.txt),
          `and the game graph's file carries the panel it opens, with no trigger table for it (${gamePanel.txt.split('\n').filter((l) => /^game/.test(l)).join(', ')})`)
  } else {
    check(/game triggers\.lua shared\n(?:.*\n)*game module_panels\.lua\ngame module\.game\.graph\.json/.test(gamePanel.txt) && gamePanel.table,
          `and the module gives the game its own table of the panels its graphs open, before the graphs (${gamePanel.txt.split('\n').filter((l) => /^game/.test(l)).join(', ')})`)
  }
}

// THE WORLD'S NODES: the menu grouped the designer's way, a door added with
// its speed already chosen, and its room picked on the map.
{
  const menu = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map', Object.keys(S.docs)[0])
    delete S.doc.graphs; S.commit()
    await S.go('graph')
    const groups = [...new Set(S.window.menuItems().map((i) => i.group))]
    S.window.addFrom('node:open_door')
    await new Promise((r) => setTimeout(r, 200))
    const n = S.doc.graphs.main.nodes[0]
    const sid = S.doc.order[0]; const room = S.doc.sectors[sid]
    const cx = room.verts.reduce((a, v) => a + v.x, 0) / room.verts.length
    const cy = room.verts.reduce((a, v) => a + v.y, 0) / room.verts.length
    // Near a corner, inside: the middle of the room has things placed in it.
    const v0 = room.verts[0]
    const { graphProblems } = await import('/studio/src/graphs_emit.js')
    return { groups, n: { ...n }, sid, center: { x: v0.x + 0.12 * (cx - v0.x) + 0.5, y: v0.y + 0.12 * (cy - v0.y) + 0.5, floor: room.floor }, before: graphProblems(S.doc.graphs?.main, S.vocab.graph, S.vocab.trigger),
             btn: [...document.querySelectorAll('.gw [data-node="open_door"] button')].map((b) => b.textContent) }
  })
  check(menu.groups.slice(0, 3).join() === 'when …,do to a thing,move the map' && menu.groups.includes('trigger words'), `the node menu is grouped the designer's way (${menu.groups.join(', ')})`)
  check(menu.n.type === 'open_door' && menu.n.id === 'open_door' && menu.before.some((p) => /needs a sector/.test(p)), `a door is added, and asks for its room (${menu.before.join(' | ')})`)
  // Bring the sector onto the node and pick it.
  await page.evaluate(async () => {
    const sel = document.querySelector('.gw [data-node="open_door"] .gw-more')
    sel.value = 'sector'; sel.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 200))
    ;[...document.querySelectorAll('.gw [data-node="open_door"] button')].find((b) => /tap a sector/.test(b.textContent)).click()
    const S = window.__studio; S.viewport.setMode('plan'); S.ui.setView('plan'); S.frameToDoc()
    await new Promise((r) => setTimeout(r, 200))
  })
  const p = await page.evaluate((c) => window.__studio.viewport.toScreen(c.x - 0.5, c.y - 0.5, c.floor), menu.center)
  await page.mouse.click(p.x, p.y)
  await new Promise((r) => setTimeout(r, 300))
  const picked = await page.evaluate(async () => {
    const S = window.__studio
    const { graphProblems } = await import('/studio/src/graphs_emit.js')
    const { emitLevel } = await import('/studio/src/module_emit.js')
    const r = await emitLevel(S.module, S.doc, { bake: S.bake, runtime: S.runtime, hooks: S.vocab.trigger.events.map((e) => e.name) })
    const out = { status: document.querySelector('.st-status')?.textContent, pending: S.pick?.kinds ?? null, sector: S.doc.graphs.main.nodes[0].sector, problems: graphProblems(S.doc.graphs?.main, S.vocab.graph, S.vocab.trigger),
                  file: r.graphText ? JSON.parse(r.graphText).nodes[0] : null, ok: r.ok, errors: r.errors.map((e) => e.msg) }
    delete S.doc.graphs; S.commit(); S.viewport.setMode('iso'); S.ui.setView('iso'); await S.go('map')
    return out
  })
  check(picked.sector?.sector && picked.problems.length === 0, `the door's room is a tap on it (${JSON.stringify(picked.sector)} ${picked.problems.join(' | ')}; tapped ${JSON.stringify(p)}, ${picked.status}, pending ${picked.pending})`)
  check(picked.ok && Number.isInteger(picked.file?.sector) && !('expect_tag' in (picked.file ?? {})), `and bakes as its index, with no trigger guard (${JSON.stringify(picked.file)} ${picked.errors.join(' | ')})`)
}

// THE GAME'S GRAPH: listed with the maps' in the Graphs section, edited with
// only the words the game has, a call to the level answered by a map's
// on_call whose value is linked straight into an action's argument.
{
  const listed = await page.evaluate(async () => {
    const S = window.__studio
    delete S.module.graphs
    S.moduleChanged()
    // One for the game, so the section has it to list.
    S.module.graphs = { game: { vars: {}, nodes: [], links: [] } }
    await S.go('graphs')
    const rows = [...document.querySelectorAll('[data-graph]')].map((r) => r.dataset.graph)
    document.querySelector('[data-graph="game:game"]').click()
    await new Promise((r) => setTimeout(r, 300))
    const opts = S.window.menuItems().map((i) => i.value)
    return { rows, maps: Object.keys(S.docs), scope: S.window?.scope, title: document.querySelector('.gw .wk-title')?.textContent, opts }
  })
  check(listed.rows[0] === 'game:game', `the Graphs section lists the game's graphs first (${listed.rows.join(', ')})`)
  check(listed.scope === 'game' && /game/.test(listed.title ?? ''), `and opens the game's (${listed.title})`)
  check(listed.opts.includes('event:on_player_enter') && !listed.opts.includes('event:on_interact') && listed.opts.includes('node:call') && listed.opts.includes('node:on_call'),
        'its menu offers what the game hears and calls, not a level\'s events')
  check(listed.opts.includes('node:when_player_arrives') && listed.opts.includes('node:heal') && !listed.opts.includes('node:open_door') && !listed.opts.includes('node:when_sector_entered'),
        'and of the world\'s nodes, only those that need no level')
  const game = await page.evaluate(async () => {
    const S = window.__studio
    const pick = (v) => S.window.addFrom(v)
    pick('event:on_player_enter')
    pick('node:call')
    await new Promise((r) => setTimeout(r, 200))
    const verbs = (() => { pick('act:'); return [...document.querySelector('.gw [data-node="do"] select').options].map((o) => o.value) })()
    return { nodes: S.module.graphs?.game?.nodes.map((n) => `${n.type}:${n.id}`), call: S.module.graphs?.game?.nodes.find((n) => n.type === 'call'), verbs, mapGraph: !!S.doc.graphs }
  })
  check(game.nodes?.join() === 'event:player_enter,call:call,action:do' && game.call?.to === 'level' && !game.mapGraph,
        `nodes go into the module's graph, not the map's; a call from the game goes to the level (${JSON.stringify(game.nodes)})`)
  check(game.verbs.includes('counter_add') && !game.verbs.includes('sector_move') && !game.verbs.includes('teleport'), 'its actions are the game\'s only')
  // The level answers: on_call 'reward', whose value is the counter's step.
  const lvl = await page.evaluate(async () => {
    const S = window.__studio
    const g = S.module.graphs.game
    g.nodes = g.nodes.filter((n) => n.id !== 'do')
    g.nodes.find((n) => n.type === 'call').name = 'reward'
    g.links = [['player_enter.then', 'call.in'], ['player_enter.entity', 'call.entity']]
    S.moduleChanged()
    await S.go('graphs')
    const unanswered = [...document.querySelectorAll('[data-unanswered]')].map((x) => x.dataset.unanswered)
    const name = Object.keys(S.docs)[0]
    S.docs[name].graphs = { main: { vars: {}, nodes: [
      { id: 'heard', type: 'on_call', name: 'reward', pos: { x: 0, y: 0 } },
      { id: 'add', type: 'action', a: 'counter_add', counter: 'gold', pos: { x: 320, y: 0 } }], links: [['heard.then', 'add.in']] } }
    S.showGraphs()
    document.querySelector(`[data-graph="${name}:main"]`).click()
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
    return { links: S.doc.graphs.main.links, row: row?.textContent ?? '', curve: document.querySelectorAll('.gw .gw-data-link').length,
             problems: graphProblems(S.doc.graphs?.main, S.vocab.graph, S.vocab.trigger), ok: !!r,
             files: (r?.files ?? []).map((f) => f.path).filter((p) => /graph|module\.txt/.test(p)),
             txt: r ? String(r.files.find((f) => f.path === 'module.txt').bytes) : '',
             unanswered: [...document.querySelectorAll('[data-unanswered]')].length }
  })
  check(fed.links.some(([f, t]) => f === 'heard.value' && t === 'add.by') && /← ?heard\.value/.test(fed.row), `a value dragged into an argument's pin feeds it, and the field says so (${JSON.stringify(fed.links)} / ${fed.row})`)
  check(fed.ok && fed.files.includes('maps/module.game.graph.json') && /game graphs\.lua shared/.test(fed.txt), `the module is written with its game graph (${fed.files.join(', ')})`)
  check(fed.unanswered === 0, 'and with the map answering, no call is left unanswered')
  await page.evaluate(async () => { const S = window.__studio; delete S.module.graphs; S.moduleChanged(); delete S.doc.graphs; S.commit(); await S.go('map') })
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
  // A square picture: the sheet dialog opens on "a still picture", and import takes it.
  await page.waitForSelector('dialog[data-sheet-dialog] [data-sheet-ok]', { timeout: 5000 })
  const stillCut = await page.evaluate(() => document.querySelector('dialog[data-sheet-dialog] [data-sheet-cut]').value)
  await page.evaluate(() => document.querySelector('dialog[data-sheet-dialog] [data-sheet-ok]').click())
  await page.evaluate(() => window.__texDone)
  check(stillCut === 'still', `a square picture is imported as a still one unless told otherwise (${stillCut})`)
  const tex = await page.evaluate(async () => {
    const S = window.__studio
    const sid = S.doc.order[0]
    S.doc.sectors[sid].floorTex = 'ROCKWALL1'
    S.commit()
    await S.showTextures('ROCKWALL1')
    const card = document.querySelector('.sd-page [data-open-texture="ROCKWALL1"]')
    // Every place it is named, counted here: rooms drawn earlier may already
    // use it (the style keeps the last texture a room took).
    let uses = 0
    for (const d of Object.values(S.docs)) for (const id of d.order) {
      const sec = d.sectors[id]
      uses += (sec.floorTex === 'ROCKWALL1') + (sec.ceilTex === 'ROCKWALL1')
      for (const v of sec.verts) uses += ['upper', 'middle', 'lower'].filter((k) => v.edge[k] === 'ROCKWALL1').length
    }
    return { own: !!S.module.textures?.ROCKWALL1, tile: !!document.querySelector('.sd-page [data-texture="ROCKWALL1"]'), card: card?.textContent ?? '', uses }
  })
  check(tex.own && tex.tile && tex.uses >= 1 && new RegExp(`used ${tex.uses} times?`).test(tex.card), `an imported texture is the module's, shown with where it is used (${tex.card.slice(0, 60)})`)
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

  // AN ANIMATED TEXTURE: a picture four squares tall (as qPainter saves an
  // animation) is offered as four frames stacked; the speed is set by hand;
  // its tile plays; animations.txt carries its line; the map view plays it
  // with the client's own animator, frame after frame.
  {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const sheetPath = join(mkdtempSync(join(tmpdir(), 'dnp-sheet-')), 'flicker.png')
    writeFileSync(sheetPath, Buffer.from(await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 64
      const g = c.getContext('2d')
      ;['#ff0000', '#00ff00', '#0000ff', '#ffff00'].forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 16, 16, 16) })
      const b = await new Promise((r) => c.toBlob(r, 'image/png'))
      return [...new Uint8Array(await b.arrayBuffer())]
    })))
    const [ch] = await Promise.all([
      page.waitForFileChooser({ timeout: 10000 }),
      page.evaluate(async () => { await window.__studio.go('textures'); window.__texDone = window.__studio.importTexture() })
    ])
    await ch.accept([sheetPath])
    await page.waitForSelector('dialog[data-sheet-dialog] [data-sheet-ok]', { timeout: 5000 })
    const offered = await page.evaluate(() => {
      const d = document.querySelector('dialog[data-sheet-dialog]')
      const out = { cut: d.querySelector('[data-sheet-cut]').value, frames: d.querySelector('[data-sheet-frames]').value, info: d.querySelector('[data-sheet-info]').textContent }
      const fps = d.querySelector('[data-sheet-fps]'); fps.value = '12'; fps.dispatchEvent(new Event('change'))
      d.querySelector('[data-sheet-ok]').click()
      return out
    })
    await page.evaluate(() => window.__texDone)
    const sheet = await page.evaluate(async () => {
      const S = window.__studio
      await S.showTextures('FLICKER')
      const tile = document.querySelector('.sd-page [data-texture="FLICKER"]')
      const { animationsTxt } = await import('/studio/src/texsheet.js')
      const sid = S.doc.order[0]
      S.doc.sectors[sid].floorTex = 'FLICKER'
      S.commit()
      // The map is baked when it shows, not under the Textures page (main.js previewNow).
      await S.go('map', S.docName)
      await new Promise((r) => { const t = setInterval(() => { if (!S.preview.busy && S.preview.view && !S.previewStale) { clearInterval(t); r() } }, 50) })
      await new Promise((r) => setTimeout(r, 300))
      const a = S.viewport.texAnimator
      const slot = S.preview.view.map.textures.indexOf('FLICKER')
      const mat = S.preview.view.materials[slot]
      const seen = new Set()
      for (let i = 0; i < 8; i++) { a?.update(i / 12); seen.add(mat?.uniforms.map.value?.name) }
      const r = { spec: S.module.textures.FLICKER?.sheet, tileClass: tile?.className ?? '', txt: animationsTxt(S.module), animated: a?.count ?? 0, frames: [...seen].sort(), repeat: mat?.uniforms.repeat.value.y }
      S.doc.sectors[sid].floorTex = null; delete S.module.textures.FLICKER; S.commit(); S.moduleChanged()
      return r
    })
    check(offered.cut === 'vertical' && offered.frames === '4' && /4 frames of 16×16/.test(offered.info), `a picture four squares tall is offered as four frames stacked, as qPainter saves them (${JSON.stringify(offered)})`)
    check(sheet.spec?.layout === 'vertical' && sheet.spec.frames === 4 && sheet.spec.fps === 12 && /st-sheet-v/.test(sheet.tileClass),
          `the cut and the speed set by hand are kept, and its tile plays (${JSON.stringify(sheet.spec)}, ${sheet.tileClass})`)
    check(/^sheet FLICKER vertical 4 fps 12$/m.test(sheet.txt ?? ''), `animations.txt carries its line (${(sheet.txt ?? '').split('\n').filter((l) => l.startsWith('sheet')).join('')})`)
    check(sheet.animated >= 1 && sheet.frames.join() === 'FLICKER,FLICKER#1,FLICKER#2,FLICKER#3',
          `the map view plays it with the client's animator, every frame in turn (${sheet.frames.join(', ')})`)
  }

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
  // This map's limits on the grid: a thick, opaque band around its cell,
  // the same thickness on screen at any zoom.
  const band = await page.evaluate(async () => {
    const S = window.__studio
    const v = S.viewport
    const one = () => {
      const b = v.bands?.[0]
      if (!b) return null
      const pos = b.geometry.getAttribute('position')
      let minX = Infinity; let maxX = -Infinity
      for (let i = 0; i < pos.count; i++) { minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i)) }
      return { bands: v.bands.length, width: b.userData.band.width, opaque: !b.material.transparent, span: maxX - minX, perPx: v.viewHeight / innerHeight }
    }
    v.render()
    const a = one()
    v.viewHeight *= 3; v.resize(); v.render()
    const b = one()
    v.viewHeight /= 3; v.resize(); v.render()
    return { a, b }
  })
  // The band runs past the cell by half its width each side: span - pitch = width in world units.
  const px = (x) => (x.span - 16) / x.perPx
  check(band.a && band.a.bands === 1 && band.a.width >= 4 && band.a.opaque && Math.abs(px(band.a) - band.a.width) < 1 && Math.abs(px(band.b) - band.b.width) < 1,
        `the map's cell is outlined by a thick opaque band, as thick on screen zoomed out as in (${band.a && px(band.a).toFixed(1)} px, then ${band.b && px(band.b).toFixed(1)} px)`)
  await page.screenshot({ path: process.env.DNP_SHOT_DIR ? `${process.env.DNP_SHOT_DIR}/metamap-cell.png` : '/dev/null' }).catch(() => {})
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

// AN IMPORTED SHEET'S ANIMATIONS, EDITED ON THE SPRITES PAGE (animeditor.js):
// a rename that the props drawn with it follow, fps, a frame moved, one of the
// sheet's own frames added, a new animation and a deletion -- each kept in the
// sheet's JSON and read back by the client's parser; undo takes one back.
{
  const ae = await page.evaluate(async () => {
    const S = window.__studio
    const wait = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)) } return null }
    const sheet = 'SPIR'
    const json = async () => JSON.parse(await S.rec.assets[`sprites/${sheet}.json`].text())
    const anim = async (n) => (await json()).animations.find((a) => a.name === n)
    const field = (label) => [...document.querySelectorAll('[data-anim-editor] .st-row')].find((r) => r.textContent.trim().startsWith(label))?.querySelector('input')
    await S.go('sprites'); await S.showSprites(sheet, 'walk')
    if (!await wait(() => document.querySelector('[data-anim-editor] [data-anim="walk"][data-on="1"]'))) return { opened: false }
    const out = { opened: true }
    const walk0 = await anim('walk')
    // fps.
    const fps = field('fps'); fps.value = '12'; fps.dispatchEvent(new Event('change'))
    out.fps = await wait(async () => (await anim('walk'))?.fps === 12)
    // A frame moved later: the first two swap.
    await wait(() => document.querySelector('[data-anim-editor] [data-frame="0"] [data-move="right"]'))
    document.querySelector('[data-anim-editor] [data-frame="0"] [data-move="right"]').click()
    out.moved = await wait(async () => { const a = await anim('walk'); return a && JSON.stringify(a.frames[1].views) === JSON.stringify(walk0.frames[0].views) && JSON.stringify(a.frames[0].views) === JSON.stringify(walk0.frames[1].views) })
    // One of the sheet's frames added at the end (from another animation).
    await wait(() => document.querySelector('[data-anim-editor] [data-pick]'))
    const pickBtn = [...document.querySelectorAll('[data-anim-editor] [data-pick]')].find((b) => /^death/.test(b.dataset.from))
    pickBtn.click()
    out.added = await wait(async () => (await anim('walk'))?.frames.length === walk0.frames.length + 1)
    // A rename, which the prop drawn with the sheet follows.
    const spirit = S.module.props.find((p) => p.art?.sheet === sheet && Object.values(p.art.states ?? {}).includes('walk'))
    await wait(() => field('name'))
    const nm = field('name'); nm.value = 'stride'; nm.dispatchEvent(new Event('change'))
    out.renamed = await wait(async () => !!(await anim('stride')) && !(await anim('walk')))
    out.followed = spirit ? Object.values(spirit.art.states).includes('stride') && !Object.values(spirit.art.states).includes('walk') : null
    out.parsed = !!S.sheets.get(sheet)?.atlas?.byName?.get('stride')
    // A new animation, then deleted.
    await wait(() => [...document.querySelectorAll('[data-anim-editor] button')].find((b) => /new animation/.test(b.textContent)))
    const before = (await json()).animations.length
    // ask() is the studio's own dialog: answer it.
    ;[...document.querySelectorAll('[data-anim-editor] button')].find((b) => /new animation/.test(b.textContent)).click()
    const dlg = await wait(() => document.querySelector('dialog[open] input'))
    if (dlg) { dlg.value = 'stride_copy'; dlg.closest('dialog').querySelector('button[type=submit]').click() }
    out.made = await wait(async () => (await json()).animations.length === before + 1 && !!(await anim('stride_copy')))
    // Undo takes the last step back.
    S.undoModule()
    out.undone = await wait(async () => !(await anim('stride_copy')))
    // Back as it was: the original manifest kept for the scenarios after.
    S.rec.assets[`sprites/${sheet}.json`] = new Blob([JSON.stringify({ ...(await json()), animations: (await json()).animations.map((a) => (a.name === 'stride' ? { ...walk0 } : a)) })])
    if (spirit) for (const k of Object.keys(spirit.art.states)) if (spirit.art.states[k] === 'stride') spirit.art.states[k] = 'walk'
    const { parseAtlas } = await import('/src/render/atlas.js')
    S.sheets.set(sheet, { ...S.sheets.get(sheet), atlas: parseAtlas(await json(), sheet) })
    S.moduleChanged()
    await S.go('map')
    return out
  })
  check(ae.opened && ae.fps && ae.moved && ae.added, `an imported sheet's animation: its fps, a frame moved, one of the sheet's frames added (${JSON.stringify(ae)})`)
  check(ae.renamed && ae.followed !== false && ae.parsed, 'renamed in the sheet, the prop drawn with it follows, and the client\'s parser reads it')
  check(ae.made && ae.undone, 'a new animation is made from the one shown, and undo takes it back')
}

// A SHEET BAKED FROM A THREESPRITE PROJECT: whether each animation loops is the
// studio's to say (ThreeSprite leaves it at its default), and the choice is
// kept through the next bake.
{
  const lp = await page.evaluate(async () => {
    const S = window.__studio
    const wait = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)) } return null }
    const n = 'LOOPT'
    const bytes = new Uint8Array(await (await fetch('/studio/test/fixtures/spirit.tsprite')).arrayBuffer())
    S.rec.assets[`sources/sprites/${n}.tsprite`] = new Blob([bytes])
    const b1 = await S.bakeSource('file:tsprite', n)
    const json = async () => JSON.parse(await S.rec.assets[`sprites/${n}.json`].text())
    const loopOf = async (a) => (await json()).animations.find((x) => x.name === a)?.loop
    const out = { baked: b1.ok, before: await loopOf('death') }
    await S.go('sprites'); await S.showSprites(n)
    const row = await wait(() => document.querySelector(`[data-loop-editor="${n}"] [data-loop-anim="death"] .ui-switch`))
    out.row = !!row
    if (row) row.click()
    out.now = await wait(async () => (await loopOf('death')) === false)
    out.kept = S.module.sprites[n]?.loops?.death === false
    // Baked again (a changed project would be): the choice stands.
    const b2 = await S.bakeSource('file:tsprite', n)
    out.rebaked = b2.ok && (await loopOf('death')) === false && (await loopOf('idle')) === true
    out.atlas = S.sheets.get(n)?.atlas?.byName?.get('death')?.loop === false
    delete S.rec.assets[`sources/sprites/${n}.tsprite`]; delete S.rec.assets[`sprites/${n}.json`]; delete S.rec.assets[`sprites/${n}.png`]
    delete S.module.sprites[n]; delete S.module.baked?.[`sources/sprites/${n}.tsprite`]; S.sheets.delete(n); S.moduleChanged()
    await S.go('map')
    return out
  })
  check(lp.baked && lp.before === true && lp.row && lp.now && lp.kept, `a baked sheet's animation is set not to loop on the Sprites page (${JSON.stringify(lp)})`)
  check(lp.rebaked && lp.atlas, 'and stays so through the next bake, the others as the project has them')
}

// A MONSTER'S OWN STATE NUMBERS (a leap in 5): its Body tab lists them, named
// by the brain states that use them, and they can be given an animation; the
// preview can play them.
{
  const own = await page.evaluate(async () => {
    const S = window.__studio
    const { newMonster } = await import('/studio/src/brain.js')
    const name = newMonster(S, 'leaper')
    const mob = S.module.mobs.mobs[name]
    mob.states.leap = { anim: 5, move: 'stop', face: 'target', ticks: 10, next: Object.keys(mob.states)[0] }
    S.moduleChanged()
    await S.go('monsters', name); await new Promise((r) => setTimeout(r, 300))
    const ed = S.monsterEditor; ed.tab = 'advanced'; ed.render()
    const row = [...document.querySelectorAll('.me .st-row')].find((x) => x.textContent.includes('state 5 · state leap'))
    const ctl = row?.querySelector('select, input')
    const prop = S.module.props.find((p) => p.name === name)
    const anims = S.module.sprites?.[prop.art?.sheet]?.animations ?? []
    const want = anims[anims.length - 1] ?? 'leap'
    if (ctl) { ctl.value = want; ctl.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 100))
    ed.tab = 'look'; ed.render()
    const plays = [...document.querySelectorAll('.me .me-frow')].filter((f) => f.querySelector('label')?.textContent === 'leap' && f.querySelector('select')?.value === want).map(() => 'leap')
    const r = { row: !!row, set: prop.art?.states?.[5], want, chips: plays }
    const { emitProps } = await import('/studio/src/props_emit.js')
    r.written = new RegExp(`atlas ${prop.id} state 5 sheet \\S+ anim ${want}`).test(emitProps(S.module))
    const { deleteMonster } = await import('/studio/src/brain.js')
    deleteMonster(S, name); S.moduleChanged()
    await S.go('map')
    return r
  })
  check(own.row && own.set === own.want && own.written, `a monster's own state 5 is in its Body tab, given an animation, and written for the game (${JSON.stringify({ row: own.row, set: own.set, written: own.written })})`)
  check(own.chips.length === 1, `Looks says the leap state plays it (${own.chips.join(', ')})`)
}

// THE PLAYER'S STATES, WITHOUT A MONSTER: the Player page makes a body of its
// own and sets which animation each state plays; a body that also draws a
// monster is said, and copied, after which the two are separate.
{
  const st = await page.evaluate(async () => {
    const S = window.__studio
    const mobsBefore = Object.keys(S.module.mobs?.mobs ?? {}).sort().join()
    const keep = S.module.player
    S.module.player = null; S.moduleChanged()
    await S.go('player')
    S.workshop.tab = 'skin'; S.workshop.render()
    const chip = (t) => [...document.querySelectorAll('.wk-details .st-chip')].find((c) => c.textContent === t)
    chip('+ a body of its own')?.click()
    await new Promise((r) => setTimeout(r, 100))
    const own = S.module.props.find((p) => p.name === S.module.player?.prop)
    const r = { own: own?.name, isMob: !!S.module.mobs?.mobs?.[own?.name], mobsSame: Object.keys(S.module.mobs?.mobs ?? {}).sort().join() === mobsBefore,
      // Its states matched to the sheet's animations at once (the sheet's own list, not only the module's record of it).
      guessed: !!own?.art?.states?.[0] }
    // State 1 (walk) given an animation from the skin tab.
    const rowOf = (label) => [...document.querySelectorAll('.wk-details .st-row')].find((x) => x.textContent.includes(label))
    const walk = rowOf('state 1 · walk')
    const ctl = walk?.querySelector('select, input')
    const anims = S.module.sprites?.[own?.art?.sheet]?.animations ?? []
    const pick = anims.find((a) => a !== own?.art?.states?.[1]) ?? 'stride'
    if (ctl?.tagName === 'SELECT') { ctl.value = pick; ctl.dispatchEvent(new Event('change')) } else if (ctl) { ctl.value = pick; ctl.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 100))
    r.walk = own?.art?.states?.[1]
    r.wanted = pick
    r.rows = ['state 0 · idle', 'state 2 · attack', 'state 4 · death'].every((l) => !!rowOf(l))
    // What the game is given: the prop's states in props.txt.
    const { emitProps } = await import('/studio/src/props_emit.js').catch(() => ({}))
    r.emitted = emitProps ? emitProps(S.module).includes(own?.name) : null
    // A body shared with a monster: said, then copied.
    const mobName = Object.keys(S.module.mobs?.mobs ?? {}).find((n) => S.module.props.some((p) => p.name === n))
    if (mobName) {
      S.module.player.prop = mobName; S.moduleChanged()
      S.workshop.tab = 'skin'; S.workshop.render()
      const box = document.querySelector(`.wk-details [data-shared-body="${mobName}"]`)
      r.warned = !!box
      box?.querySelector('button')?.click()
      await new Promise((r) => setTimeout(r, 100))
      const copy = S.module.props.find((p) => p.name === S.module.player.prop)
      const mobProp = S.module.props.find((p) => p.name === mobName)
      r.copied = copy && copy.name !== mobName && copy.id !== mobProp.id && JSON.stringify(copy.art) === JSON.stringify(mobProp.art)
      const before = JSON.stringify(mobProp.art)
      copy.art.states[2] = 'changed-for-player'
      r.separate = JSON.stringify(mobProp.art) === before
      S.module.props = S.module.props.filter((p) => p !== copy)
    }
    S.module.props = S.module.props.filter((p) => p !== own)
    S.module.player = keep; S.moduleChanged()
    await S.go('map')
    return { ...r, mobName }
  })
  check(st.own && !st.isMob && st.mobsSame && st.guessed, `the Player page makes the player a body of its own, its states matched to the sheet, and no monster (${st.own})`)
  check(st.rows && st.walk === st.wanted, `its states are set on the Player page: state 1 plays ${st.walk}`)
  check(st.emitted !== false, 'and the body is written for the game with them')
  if (st.mobName) check(st.warned && st.copied && st.separate, `a body that also draws a monster is said, and copied; the copy's states are the player's alone (${JSON.stringify({ warned: st.warned, copied: st.copied, separate: st.separate })})`)
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
  check(side.screensList > 250 && side.screensScrolls === 'auto', `and Screens gives its list the height to be read, scrolling (${side.screensList}, ${side.screensScrolls})`)
}

// HANDHELD: the chrome gives the height back -- on a phone on its side a
// window's own bar is the header (undo moves to the rail), every bar is one
// row -- and the panel editor zooms: onto the panel when it opens there,
// fitted, stepped, and panned by dragging the panel's body; the graph board
// shows every node with one button; upright, the map's tools are one row.
{
  await page.setViewport({ width: 915, height: 412 })
  const land = await page.evaluate(async () => {
    const S = window.__studio
    const { newPanel, addWidget } = await import('/studio/src/panels_emit.js')
    const p = newPanel('Shop'); addWidget(p, 'label', 'What will it be?'); addWidget(p, 'button', 'Buy'); addWidget(p, 'slider', 'How many')
    S.module.panels = { hh: p }; S.moduleChanged()
    await S.go('panels', 'hh')
    await new Promise((r) => setTimeout(r, 900))
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0 }
    const w = S.window
    return { head: vis('.sd-page .sd-head'), top: Math.round(document.querySelector('.pw .wk-top').getBoundingClientRect().height),
             railUndo: vis('.sd-rail .sd-hist'), back: vis('.pw .wk-top .wk-back'), z: w.zoom.z, k0: w.k0 }
  })
  check(!land.head && land.top <= 48 && land.railUndo && !land.back, `on a phone on its side a window's bar is the header, one row, undo in the rail (${JSON.stringify(land)})`)
  check(land.z > 1.5, `a panel opens zoomed onto itself there (zoom ${land.z.toFixed(2)})`)
  const zoomed = await page.evaluate(async () => {
    const w = window.__studio.window
    document.querySelector('.pw [data-zoom="fit"]').click()
    const fit = w.zoom.z
    document.querySelector('.pw [data-zoom="in"]').click()
    const stepped = w.zoom.z
    document.querySelector('.pw [data-zoom="panel"]').click()
    return { fit, stepped, panel: w.zoom.z }
  })
  check(zoomed.fit === 1 && zoomed.stepped > 1.3 && zoomed.panel > 1.5, `fit shows the whole screen, + steps in, the panel button zooms back onto it (${JSON.stringify(zoomed)})`)
  // Drag the panel's body (below its title bar): the view pans, the panel stays.
  const body = await page.evaluate(() => {
    const r = document.querySelector('.pw [data-handle="panel"]').getBoundingClientRect()
    const look = { ...window.__studio.module.panels.hh.look }
    return { x: r.x + 6, y: r.y + r.height - 6, zx: window.__studio.window.zoom.x, look }
  })
  await page.mouse.move(body.x, body.y); await page.mouse.down(); await page.mouse.move(body.x + 60, body.y - 20, { steps: 5 }); await page.mouse.up()
  await new Promise((r) => setTimeout(r, 300))
  const panned = await page.evaluate(() => ({ zx: window.__studio.window.zoom.x, look: { ...window.__studio.module.panels.hh.look } }))
  check(Math.abs(panned.zx - body.zx - 60) < 3 && JSON.stringify(panned.look) === JSON.stringify(body.look), `dragging the panel's body pans the view and leaves the panel where it is (${Math.round(panned.zx - body.zx)})`)
  const graph = await page.evaluate(async () => {
    const S = window.__studio
    S.doc.graphs = { main: { vars: {}, nodes: [0, 1, 2, 3, 4].map((i) => ({ id: `n${i}`, type: 'delay', ticks: 30, pos: { x: i * 300, y: (i % 2) * 400 } })), links: [] } }
    S.commit(); await S.go('graph')
    await new Promise((r) => setTimeout(r, 500))
    document.querySelector('.gw [data-zoom="fit"]').click()
    const b = document.querySelector('.gw .wk-board').getBoundingClientRect()
    const inside = [...document.querySelectorAll('.gw .gw-node')].every((n) => { const q = n.getBoundingClientRect(); return q.left >= b.left - 1 && q.right <= b.right + 1 && q.top >= b.top - 1 && q.bottom <= b.bottom + 1 })
    delete S.doc.graphs; S.commit()
    return { inside, z: S.window.view.z }
  })
  check(graph.inside && graph.z < 1, `the graph's ⤢ puts every node in view (${JSON.stringify(graph)})`)
  await page.setViewport({ width: 390, height: 844 })
  const port = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map')
    await new Promise((r) => setTimeout(r, 400))
    const tops = [...document.querySelectorAll('.st-bar button')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().top))
    await S.go('panels', 'hh')
    await new Promise((r) => setTimeout(r, 600))
    const top = Math.round(document.querySelector('.pw .wk-top').getBoundingClientRect().height)
    const stage = Math.round(document.querySelector('.pw .pw-stage').getBoundingClientRect().height)
    delete S.module.panels; S.moduleChanged(); await S.go('home')
    return { rows: new Set(tops).size, tools: tops.length, top, stage }
  })
  check(port.rows === 1 && port.tools >= 8, `upright, the map's tools are one row (${JSON.stringify(port)})`)
  check(port.top <= 48 && port.stage >= 360, `and the panel editor's bar is one row over a stage of half the screen (${JSON.stringify(port)})`)
  await page.setViewport({ width: 1000, height: 700 })
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

// BACK FROM PLAY TO A MAP THAT IS NOT THE FIRST: the way back opens it during
// the boot, which redrew before the redraw was published -- the loader stuck
// on "the picture". It must boot, on that map, with no error.
{
  const second = await page.evaluate(async () => {
    const S = window.__studio
    S.docs.second = S.starterDoc('second')
    S.save()
    await new Promise((r) => setTimeout(r, 900))
    await S.go('map', 'second')
    S.rememberReturn()
    return Object.keys(S.docs)[0] !== 'second'
  })
  const before = errors.length
  await page.goto(URL_, { waitUntil: 'domcontentloaded' })
  const booted = await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, { timeout: 30000 }).then(() => true).catch(() => false)
  const back = await page.evaluate(() => ({ route: window.__studio?.route(), map: window.__studio?.docName, msg: document.getElementById('bootmsg')?.textContent }))
  check(second && booted && back.route === 'map' && back.map === 'second' && errors.length === before,
        `back from Play to a map that is not the first, the studio boots on it (${JSON.stringify(back)} ${errors.slice(before, before + 2).join(' | ')})`)
  if (booted) await page.evaluate(async () => { const S = window.__studio; delete S.docs.second; await S.openDoc(Object.keys(S.docs)[0]); S.save(); await new Promise((r) => setTimeout(r, 900)) })
}

// STYLE: a font and a picture imported, a named panel style using the picture
// as a 9-slice, a panel taking the style, the subtitles restyled -- and the
// module written with all of it in its layout (docs/UI_STYLES.md).
{
  const { existsSync } = await import('node:fs')
  const FONT = '/System/Library/Fonts/Supplemental/Andale Mono.ttf'
  const PNG = new URL('../../modules/starter/assets/textures/ROCKWALL1.png', import.meta.url).pathname
  if (!existsSync(FONT) || !existsSync(PNG)) console.log('  (style: no font or picture to import here -- skipped)')
  else {
    await page.evaluate(async () => { await window.__studio.go('style') })
    await new Promise((r) => setTimeout(r, 300))
    const pick = async (label, file) => {
      const [chooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 10000 }),
        page.evaluate((label) => [...document.querySelectorAll('.sd-page button')].find((b) => b.textContent.startsWith(label)).click(), label)
      ])
      await chooser.accept([file])
      await new Promise((r) => setTimeout(r, 1200))
    }
    await pick('+ import fonts', FONT)
    await pick('+ import pictures', PNG)
    const imported = await page.evaluate(() => {
      const S = window.__studio
      const f = S.module.style?.fonts?.[0]
      const sample = document.querySelector('[data-font] .sd-font-sample')
      return { font: f, asset: !!S.rec.assets?.[`ui/${f?.file}`], loaded: [...document.fonts].some((x) => x.family.replace(/"/g, '') === f?.family && x.status === 'loaded'),
               sampleFont: sample ? getComputedStyle(sample).fontFamily : '', picture: !!S.rec.assets?.['ui/skins/rockwall1.png'], thumb: !!document.querySelector('[data-picture="skins/rockwall1.png"] img') }
    })
    check(imported.font?.family === 'Andale Mono' && imported.asset && imported.loaded && /Andale Mono/.test(imported.sampleFont), `a font is imported, kept in the module, loaded, and its sample shown in it (${JSON.stringify(imported.font)})`)
    check(imported.picture && imported.thumb, 'a picture is imported and shown')
    // A named style, through the studio's own dialog.
    await page.evaluate(() => [...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ new style').click())
    await page.waitForSelector('dialog[open] input', { timeout: 3000 }).catch(() => {})
    await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta')
    await page.keyboard.type('stone')
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 600))
    const styled = await page.evaluate(async () => {
      const S = window.__studio
      const st = S.module.style.styles?.stone
      const card = document.querySelector('[data-style="stone"]')
      const choose = (label, value) => { const r = [...card.querySelectorAll('.st-row')].find((x) => x.firstChild?.textContent === label); const sel = r.querySelector('select'); sel.value = value; sel.dispatchEvent(new Event('change')) }
      choose('font', 'Andale Mono')
      await new Promise((r) => setTimeout(r, 300))
      const card2 = document.querySelector('[data-style="stone"]')
      const r2 = [...card2.querySelectorAll('.st-row')].find((x) => x.firstChild?.textContent === 'panel picture'); const sel = r2.querySelector('select'); sel.value = 'skins/rockwall1.png'; sel.dispatchEvent(new Event('change'))
      await new Promise((r) => setTimeout(r, 300))
      const preview = document.querySelector('[data-style-preview="stone"] .dnp-ui')
      return { st: S.module.style.styles.stone, slice: !!document.querySelector('[data-style="stone"] canvas.sd-slice'), preview: !!preview, previewBg: preview ? getComputedStyle(preview).backgroundColor : '',
               skin: preview?.style.borderImage ?? '', font: preview ? getComputedStyle(preview).fontFamily : '', support: document.querySelector('[data-style-support]')?.dataset.styleSupport }
    })
    check(styled.st?.font === 'Andale Mono' && styled.st?.panel?.image === 'skins/rockwall1.png' && styled.st.panel.slice?.length === 4 && styled.slice,
          `a style takes the font and the picture as a 9-slice, its slice lines drawn over it (${JSON.stringify(styled.st?.panel)})`)
    check(styled.preview && styled.previewBg === 'rgb(18, 18, 22)', `and a sample panel in it is drawn by the client's UiView, in the style's colours (${styled.previewBg})`)
    check(/blob:/.test(styled.skin) && /Andale Mono/.test(styled.font) && /"fonts":true/.test(styled.support ?? ''),
          `the client draws its 9-slice from the module's own picture and its font, now that it draws styles (${styled.skin.slice(0, 60)} / ${styled.font})`)
    // Subtitles: on, a colour of their own.
    const subbed = await page.evaluate(async () => {
      const S = window.__studio
      const r = [...document.querySelectorAll('.sd-page [data-subtitles] .st-row')].find((x) => x.firstChild?.textContent === 'the module styles its subtitles')
      r.querySelector('button').click()
      await new Promise((r) => setTimeout(r, 300))
      const text = [...document.querySelectorAll('.sd-page [data-subtitles] .st-row')].find((x) => x.firstChild?.textContent === 'text')?.querySelector('input[type=color]')
      text.value = '#00ff88'; text.dispatchEvent(new Event('change'))
      await new Promise((r) => setTimeout(r, 400))
      const line = [...document.querySelectorAll('[data-sub-preview] .dnp-hud div')].find((d) => d.textContent === 'This hall was sealed for a hundred years.')
      return { sub: S.module.style.subtitle, color: line ? getComputedStyle(line).color : '' }
    })
    check(subbed.sub?.color === '#00ff88' && subbed.color === 'rgb(0, 255, 136)', `the subtitles take a colour, drawn by the client's HudView (${subbed.color})`)
    // A panel takes the style; the module is written with it.
    const written = await page.evaluate(async () => {
      const S = window.__studio
      const { newPanel, addWidget } = await import('/studio/src/panels_emit.js')
      const p = newPanel('Shop'); addWidget(p, 'button', 'Buy')
      S.module.panels = { shop: p }
      S.moduleChanged()
      await S.go('panels', 'shop')
      await new Promise((r) => setTimeout(r, 400))
      const sel = document.querySelector('.pw [data-panel-style]')
      sel.value = 'stone'; sel.dispatchEvent(new Event('change'))
      await new Promise((r) => setTimeout(r, 400))
      const drawn = document.querySelector('.pw .dnp-ui-t')
      const r = await S.emitAll()
      const hud = r ? JSON.parse(String(r.files.find((f) => f.path === 'assets/ui/hud.json').bytes)) : {}
      const paths = (r?.files ?? []).map((f) => f.path)
      const out = { styleName: p.look.styleName, drawnBg: drawn ? getComputedStyle(drawn).backgroundColor : '', tpl: hud.panels?.shop?.style, fonts: hud.fonts, styles: Object.keys(hud.styles ?? {}),
                    sub: hud.hud?.find((e) => e.id === 'subtitle')?.children?.[1]?.style?.color, files: paths.filter((x) => /assets\/ui\/(fonts|skins)/.test(x)) }
      delete S.module.style; delete S.module.panels
      for (const k of Object.keys(S.rec.assets)) if (k.startsWith('ui/')) delete S.rec.assets[k]
      S.moduleChanged(); await S.go('map')
      return out
    })
    check(written.styleName === 'stone' && written.drawnBg === 'rgb(18, 18, 22)', `a panel takes the style in the panel editor, drawn in its colours (${written.drawnBg})`)
    check(written.tpl?.use === 'stone' && written.fonts?.[0]?.family === 'Andale Mono' && written.styles.includes('stone') && written.sub === '#00ff88' &&
          written.files.some((x) => x.endsWith('.ttf')) && written.files.includes('assets/ui/skins/rockwall1.png'),
          `and the module is written with the fonts, the style, the subtitle and the files beside its layout (${written.files.join(', ')})`)
  }
}

// THE SKY: the module's sky set in its section and drawn by the client's own
// Sky in the preview and behind the level; a map's own sky; a ceiling opened
// to the sky from the inspector (docs/SKY.md).
{
  const sky = await page.evaluate(async () => {
    const S = window.__studio
    delete S.module.sky
    await S.go('sky')
    await new Promise((r) => setTimeout(r, 300))
    ;[...document.querySelectorAll('.sd-page button')].find((b) => /give the module a sky/.test(b.textContent)).click()
    await new Promise((r) => setTimeout(r, 300))
    const pic = [...document.querySelectorAll('.sd-page .st-row')].find((r) => r.firstChild?.textContent === 'picture')?.querySelector('input[type=text]')
    pic.value = 'SKY1'; pic.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 1200))
    const canvas = document.querySelector('[data-sky-preview] canvas')
    return { sky: S.module.sky, canvas: !!canvas && canvas.width > 0, words: document.querySelector('.sd-page')?.textContent.match(/module\.txt: sky default [^\n]*?SKY1/)?.[0] ?? '' }
  })
  check(sky.sky?.kind === 'strip' && sky.sky.images[0] === 'SKY1' && sky.canvas && /sky default strip SKY1/.test(sky.words), `the module's sky is set in its section and previewed by the client's Sky (${JSON.stringify(sky.sky)})`)
  const level = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('map', Object.keys(S.docs)[0])
    S.viewport.setMode('iso'); S.ui.setView('iso')
    await new Promise((r) => setTimeout(r, 1500))
    S.viewport.render()
    const iso = { kind: S.levelSky.sky.kind, shown: S.levelSky.background.visible }
    S.viewport.setMode('plan'); S.ui.setView('plan'); S.viewport.render()
    return { iso, plan: S.levelSky.background.visible }
  })
  check(level.iso.kind === 1 && level.iso.shown && !level.plan, `the level view draws the same sky behind the map in 3D, not from above (${JSON.stringify(level)})`)
  const own = await page.evaluate(async () => {
    const S = window.__studio
    const name = S.docName
    await S.go('sky', name)
    await new Promise((r) => setTimeout(r, 300))
    ;[...document.querySelectorAll('.sd-page .st-row')].find((r) => /has a sky of its own/.test(r.firstChild?.textContent ?? ''))?.querySelector('button').click()
    await new Promise((r) => setTimeout(r, 300))
    const kind = [...document.querySelectorAll('.sd-page .st-row')].find((r) => r.firstChild?.textContent === 'kind')?.querySelector('select')
    kind.value = 'panorama'; kind.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 300))
    const { moduleTxt } = await import('/studio/src/module_emit.js')
    const txt = moduleTxt(S.module, Object.values(S.docs))
    // A ceiling opened to the sky, and closed again.
    await S.go('map', name)
    const sid = S.doc.order[0]
    const was = S.doc.sectors[sid].ceilTex
    S.selection = { kind: 'sector', id: sid }
    S.showInspector()
    await new Promise((r) => setTimeout(r, 200))
    const tog = () => [...document.querySelectorAll('.st-sheet .st-row')].find((r) => r.firstChild?.textContent === 'ceiling open to the sky')?.querySelector('button')
    tog().click()
    const opened = S.doc.sectors[sid].ceilTex
    tog().click()
    const closed = S.doc.sectors[sid].ceilTex
    delete S.doc.sky; delete S.module.sky; S.commit(); S.moduleChanged(); S.ui.hideSheet(); S.viewport.setMode('iso'); S.ui.setView('iso')
    return { name, docSky: txt.match(new RegExp(`^sky ${name} .*$`, 'm'))?.[0], dflt: txt.match(/^sky default .*$/m)?.[0], opened, closed, was }
  })
  check(own.docSky === `sky ${own.name} panorama SKY1` && own.dflt === 'sky default strip SKY1', `a map takes a sky of its own, written beside the module's (${own.docSky} / ${own.dflt})`)
  check(own.opened === 'F_SKY1' && own.closed === own.was, `the inspector opens a ceiling to the sky and closes it again (${own.opened} -> ${own.closed})`)
}

// THE PLAY LOG: a page of its own; in a browser (no shell, no Play) it says so.
{
  const pl = await page.evaluate(async () => {
    const S = window.__studio
    await S.go('playlog')
    await new Promise((r) => setTimeout(r, 300))
    const out = { route: S.route(), text: document.querySelector('.sd-page .sd-body')?.textContent ?? '' }
    await S.go('map')
    return out
  })
  check(pl.route === 'playlog' && /Play, and its log, need the app/.test(pl.text), `the Play log has a page, which in a browser says Play needs the app (${pl.text.slice(0, 60)})`)
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
// CONTROLS: the control mapper. + key waits for a key press; the key pressed
// is the key's; a touch label gives it a button, placed in Screens; renaming
// it follows into a graph that answers it; module.txt carries its line; a
// button node offers it beside the engine's.
{
  await page.evaluate(async () => {
    const S = window.__studio
    S.module.keys = []
    S.doc.graphs = { main: { vars: {}, nodes: [{ id: 'press', type: 'when_button_pressed', button: 'action', pos: { x: 0, y: 0 } }], links: [] } }
    S.commit()
    await S.go('controls')
    ;[...document.querySelectorAll('.sd-page button')].find((b) => b.textContent === '+ key').click()
  })
  await new Promise((r) => setTimeout(r, 200))
  const waiting = await page.evaluate(() => document.querySelector('.sd-key-wait')?.textContent ?? '')
  await page.keyboard.press('KeyT')
  await new Promise((r) => setTimeout(r, 200))
  const keyed = await page.evaluate(async () => {
    const S = window.__studio
    const k = S.module.keys[0]
    const r = { name: k?.name, code: k?.code, shown: document.querySelector('[data-key-press]')?.textContent }
    // A touch button, and a name.
    const touch = document.querySelector('.sd-key-card [data-key-touch]')
    touch.value = 'reload'; touch.dispatchEvent(new Event('change'))
    await new Promise((res) => setTimeout(res, 100))
    const name = document.querySelector('.sd-key-card [data-key-name]')
    name.value = 'Reload'; name.dispatchEvent(new Event('change'))
    await new Promise((res) => setTimeout(res, 100))
    const { moduleTxt } = await import('/studio/src/module_emit.js')
    r.after = { ...S.module.keys[0] }
    r.graph = S.doc.graphs.main.nodes[0].button
    r.line = moduleTxt(S.module).split('\n').find((l) => l.startsWith('key ')) ?? ''
    await S.showScreensTouch()
    await new Promise((res) => setTimeout(res, 300))
    r.screens = !!document.querySelector('.sc [data-btn="key:reload"]')
    await S.go('graph')
    S.window.picked = { kind: 'node', id: 'press' }; S.window.render()
    const sel = document.querySelector('.gw [data-node="press"] [data-arg="button"] select')
    r.groups = sel ? [...sel.querySelectorAll('optgroup')].map((g) => `${g.label}:${g.children.length}`) : []
    r.chosen = sel?.value
    delete S.module.keys; delete S.doc.graphs; S.commit(); S.moduleChanged(); await S.go('map')
    return r
  })
  check(/press a key/.test(waiting) && keyed.code === 'KeyT' && /T/.test(keyed.shown ?? ''), `+ key waits for a key, and the key pressed is the key's (${JSON.stringify({ waiting, code: keyed.code, shown: keyed.shown })})`)
  check(keyed.after.name === 'reload' && keyed.after.touch === 'RELOAD' && keyed.graph === 'reload', `a typed name made one the server takes, and the graph answering it follows the rename (${JSON.stringify(keyed.after)}, graph: ${keyed.graph})`)
  check(keyed.line === `key reload KeyT touch ${keyed.after.touch}`, `module.txt carries its line (${keyed.line})`)
  check(keyed.screens, 'its touch button is placed in Screens beside the engine\'s')
  check(keyed.groups.length === 2 && /this module's keys:1/.test(keyed.groups.join()) && keyed.chosen === 'reload', `a button node offers the engine's buttons and the module's keys (${keyed.groups.join(', ')})`)
}

// A BAR IN A PANEL: + add → bar puts in a decor bar, drawn by the HUD's own
// code as health is; the preview fills it from its sample value.
{
  const barred = await page.evaluate(async () => {
    const S = window.__studio
    const { newPanel } = await import('/studio/src/panels_emit.js')
    S.module.panels = { mana: newPanel('Mana') }; S.moduleChanged()
    await S.go('panels', 'mana')
    await new Promise((r) => setTimeout(r, 400))
    const pal = document.querySelector('.pw .pw-palette'); pal.value = 'd:bar'; pal.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 300))
    const e = S.module.panels.mana.decor?.[0]
    const node = (S.window.view.panels.get(1)?.decor?.nodes ?? []).find((n) => n.el.type === 'bar')
    const r = { decor: e && { type: e.type, bind: e.bind, max: e.max }, fill: node?.fill?.style.width, rows: [...document.querySelectorAll('.pw .wk-details .st-row label')].map((l) => l.textContent).filter((t) => /value|out of|colour/.test(t)) }
    delete S.module.panels; S.moduleChanged(); await S.go('map')
    return r
  })
  check(barred.decor?.type === 'bar' && barred.decor.bind === 'hud.mana' && barred.decor.max === 100 && parseFloat(barred.fill) === 60 && barred.rows.includes('out of'),
        `+ add → bar puts a bar in the panel, filled in the preview from its sample, with its value, its most and its colour to set (${JSON.stringify(barred)})`)
}

// SNAPSHOTS: the module as it was. One is taken by hand; the module is
// changed and a map deleted; the deleted map is restored alone, then the
// whole module -- through the page's own buttons and confirmations, each
// restore snapshotting the module as it was first.
{
  const ok = async () => { await page.waitForSelector('dialog[open]', { timeout: 3000 }); await page.evaluate(() => document.querySelector('dialog[open] button[type=submit]').click()); await new Promise((r) => setTimeout(r, 400)) }
  const setup = await page.evaluate(async () => {
    const S = window.__studio
    const { starterDoc } = S
    S.docs.spare = S.starterDoc ? S.starterDoc('spare') : structuredClone(S.doc)
    S.docs.spare.name = 'spare'
    S.moduleChanged(); S.save.flush()
    await S.go('snapshots')
    const snap = await S.snapshot('test mark', { force: true })
    const aboutWas = S.module.about
    S.module.about = 'changed after the snapshot'
    delete S.docs.spare
    S.moduleChanged(); S.save.flush()
    await S.showSnapshots()
    await new Promise((r) => setTimeout(r, 300))
    return { key: snap?.key, aboutWas, listed: [...document.querySelectorAll('[data-snap]')].map((c) => c.dataset.snap) }
  })
  check(!!setup.key && setup.listed.includes(setup.key), `a snapshot taken is listed (${setup.key}; ${setup.listed.join(", ")})`)
  // Its maps: the deleted one is offered back alone.
  await page.evaluate((key) => [...document.querySelector(`[data-snap="${key}"]`).querySelectorAll('button')].find((b) => /maps/.test(b.textContent)).click(), setup.key)
  await new Promise((r) => setTimeout(r, 400))
  const offered = await page.evaluate((key) => {
    const row = document.querySelector(`[data-snap="${key}"] [data-snap-map="spare"]`)
    const b = row && [...row.querySelectorAll('button')].find((x) => /restore spare/.test(x.textContent))
    b?.click()
    return { state: row?.dataset.state, button: !!b }
  }, setup.key)
  await ok()
  await new Promise((r) => setTimeout(r, 800))
  const oneMap = await page.evaluate(() => ({ spare: !!window.__studio.docs.spare, about: window.__studio.module.about }))
  check(offered.state === 'gone' && offered.button && oneMap.spare && oneMap.about === 'changed after the snapshot',
        `a deleted map is restored alone, the rest left as it is (${JSON.stringify({ ...offered, ...oneMap })})`)
  // The whole module.
  await page.evaluate(async (key) => {
    await window.__studio.showSnapshots(); await new Promise((r) => setTimeout(r, 300))
    ;[...document.querySelector(`[data-snap="${key}"]`).querySelectorAll('button')].find((b) => b.textContent === 'restore').click()
  }, setup.key)
  await ok()
  await new Promise((r) => setTimeout(r, 1000))
  const whole = await page.evaluate(async (was) => {
    const S = window.__studio
    const list = await S.snaps.list(S.rec.id)
    const r = { about: S.module.about, back: S.module.about === was, before: list.filter((x) => /^before restoring/.test(x.reason)).length, stored: (await S.store.load(S.rec.id)).module.about === was }
    delete S.docs.spare; S.moduleChanged(); S.save.flush(); await S.go('map')
    return r
  }, setup.aboutWas)
  check(whole.back && whole.stored, `the whole module is restored, and saved so (${JSON.stringify(whole)})`)
  check(whole.before >= 2, `each restore snapshotted the module as it was first (${whole.before})`)
}

check(errors.length === 0, `no page errors at all (${errors.slice(0, 3).join(' | ')})`)

// THE SKINS (src/skin.js, docs/STUDIO_SKINS.md): every shipped skin, in each
// of its modes, chosen in the prefs and booted from cold -- clean, worn on
// <html>, the page in the skin's own background, and the map editor's
// materials in the skin's canvas colours after a mode change.
{
  // EVERY CONTROL WEARS ITS KIT CLASS (phase 4): across the sections, no
  // button, field or select the studio drew is without a ui-* class -- a
  // control without one keeps the browser's look in every skin.
  const bare = await page.evaluate(async () => {
    const S = window.__studio
    const out = []
    for (const r of ['home', 'maps', 'map', 'monsters', 'player', 'weapons', 'screens', 'panels', 'settings', 'textures', 'controls', 'sounds', 'music', 'graphs', 'scripts', 'style', 'sky', 'particles', 'props']) {
      await S.go(r); await new Promise((res) => setTimeout(res, 250))
      for (const e of document.querySelectorAll('button, select, textarea, input:not([type=range]):not([type=color]):not([type=file]):not([type=checkbox]):not([type=hidden])')) {
        if (!e.offsetParent || /(^|\s)ui-/.test(e.className) || e.closest('#boot, iframe, .dnp-ui, .dnp-hud, .pw-frame, .sc-frame')) continue
        out.push(`${r}: <${e.tagName.toLowerCase()} class="${e.className}">${(e.textContent || e.value || '').trim().slice(0, 24)}`)
      }
    }
    await S.go('map')
    return [...new Set(out)]
  })
  check(bare.length === 0, `every control the studio draws wears a kit class (${bare.length} without: ${bare.slice(0, 6).join(' | ')})`)
  const list = await page.evaluate(() => window.__studio.skinList)
  check(list.length >= 4 && list[0].id === 'claude', `the shipped skins are listed (${list.map((s) => s.id).join(', ')})`)
  // A mode change, live: the map editor's colours and its lasting materials
  // (the grid) take the skin's canvas colours in place, no reload.
  const live = await page.evaluate(async () => {
    const S = window.__studio
    const { COLORS } = await import('/studio/src/viewport.js')
    const { colorParts } = await import('/studio/vendor/uikit/runtime.js')
    const THREE = await import('three')
    const read = () => {
      // vertex colours are linear; back to the sRGB number the skin wrote
      const col = S.viewport.gridLines.major.geometry.attributes.color
      const grid = new THREE.Color().setRGB(col.array[0], col.array[1], col.array[2], THREE.LinearSRGBColorSpace).getHex()
      return { path: COLORS.path, wantPath: colorParts(S.skin.canvas('map', 'path').color).hex, grid, wantGrid: colorParts(S.skin.canvas('common', 'grid.major').color).hex }
    }
    const was = read()
    S.skin.setMode('light')
    const lit = read()
    const r = { mode: document.documentElement.dataset.dnpMode, was, lit, bg: S.skin.token('color.bg.app') }
    S.skin.setMode('auto')
    return r
  })
  check(live.mode === 'light' && live.lit.path === live.lit.wantPath && live.lit.grid === live.lit.wantGrid && live.was.grid === live.was.wantGrid && live.was.grid !== live.lit.grid,
        `a mode change recolours the map editor in place: paths and grid in the skin's colours (${JSON.stringify(live)})`)
  for (const s of list) {
    for (const mode of s.modes) {
      const p = await browser.newPage()
      await p.setViewport({ width: 1000, height: 700 })
      const errs = []
      p.on('pageerror', (e) => errs.push(String(e)))
      p.on('console', (m) => { if ((m.type() === 'error' && !/Failed to load resource/.test(m.text())) || /^skin: no /.test(m.text())) errs.push(m.text()) })
      await p.goto(URL_, { waitUntil: 'domcontentloaded' })
      await p.evaluate((id, m) => { localStorage.setItem('dnp.studio.skin', id); localStorage.setItem('dnp.studio.skin.mode', m) }, s.id, mode)
      await p.reload({ waitUntil: 'networkidle0' })
      await p.waitForFunction(() => document.getElementById('boot')?.hidden === true, { timeout: 60000 }).catch(() => {})
      const r = await p.evaluate(() => {
        const S = window.__studio
        const rgb = (c) => { const d = document.createElement('div'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v }
        return { id: S?.skin?.id, mode: document.documentElement.dataset.dnpMode, bg: getComputedStyle(document.body).backgroundColor, want: rgb(S?.skin?.token('color.bg.app')) }
      })
      check(r.id === s.id && r.mode === mode && r.bg === r.want && errs.length === 0,
            `${s.id}/${mode}: boots clean, worn, the page in the skin's background (${JSON.stringify(r)}${errs.length ? ' ' + errs.slice(0, 2).join(' | ') : ''})`)
      await p.close()
    }
  }
  await page.evaluate(() => { localStorage.removeItem('dnp.studio.skin'); localStorage.removeItem('dnp.studio.skin.mode') })
}

// HOW A SWING LOOKS IN THE GAME (docs/SWINGS.md): the monster's swing tab and
// the player's slash tab carry the slash fields; an edit lands in the module
// and in the assets/sprites/swings.json the next Play writes.
{
  const got = await page.evaluate(async () => {
    const S = window.__studio
    const mob = Object.keys(S.module.mobs?.mobs ?? {})[0]
    await S.go('monsters', mob); await new Promise((r) => setTimeout(r, 400))
    const tab = (t) => [...document.querySelectorAll('.wk-details .wk-tabs button')].find((b) => b.textContent.trim().endsWith(t))
    S.monsterEditor.tab = 'advanced'; S.monsterEditor.render(); await new Promise((r) => setTimeout(r, 300))
    const rows = [...document.querySelectorAll('.me .st-row label')].map((l) => l.textContent)
    const blend = [...document.querySelectorAll('.me .st-row')].find((r) => /^blend/.test(r.querySelector('label')?.textContent ?? ''))?.querySelector('select')
    if (blend) { blend.value = 'normal'; blend.dispatchEvent(new Event('change')) }
    await new Promise((r) => setTimeout(r, 300))
    const own = S.module.swings?.monsters?.[mob]
    await S.go('player'); await new Promise((r) => setTimeout(r, 400))
    tab('slash')?.click(); await new Promise((r) => setTimeout(r, 300))
    const playerRows = [...document.querySelectorAll('.wk-details .st-row label')].map((l) => l.textContent)
    const { swingsJson } = await import('/studio/src/swings_emit.js')
    const file = JSON.parse(swingsJson(S.module) ?? '{}')
    delete S.module.swings; S.moduleChanged()
    await S.go('map')
    return { mob, monsterFields: ['show', 'color', 'opacity', 'fade', 'width', 'blend', 'texture'].every((f) => rows.some((r) => r.startsWith(f))), own, playerFields: playerRows.some((r) => r.startsWith('blend')), file }
  })
  check(got.monsterFields && got.own?.blend === 'normal' && got.playerFields && got.file.monsters?.[got.mob]?.blend === 'normal',
        `a monster's swing look and the default look are set in the workshops, and written to swings.json (${JSON.stringify(got)})`)
}

// THE EXAMPLE PROJECT: Gem Hollow, packed into the studio
// (src/templates/gemhollow.zip), opens from Home as a module of the user's
// own, with nothing wrong; asked again it opens that one; a fresh copy is a
// second module beside it.
{
  const got = await page.evaluate(async () => {
    const S = window.__studio
    const was = S.rec.id
    await S.go('home')
    let offered = false
    for (let i = 0; i < 30 && !offered; i++) { await new Promise((r) => setTimeout(r, 100)); offered = !!document.querySelector('[data-example="gemhollow"] button') }
    await S.openExample('gemhollow'); await new Promise((r) => setTimeout(r, 1500))
    const r = { offered, id: S.rec.id, maps: Object.keys(S.docs).sort().join(','), mobs: Object.keys(S.module.mobs?.mobs ?? {}).length,
      problems: document.querySelectorAll('.sd-problem').length, clean: !!document.querySelector('[data-problems="0"]') }
    r.again = await S.openExample('gemhollow')
    r.fresh = await S.openExample('gemhollow', { fresh: true })
    for (const id of ['gemhollow', r.fresh]) await S.store.remove(id)
    await S.openModule(was); await S.go('map')
    return r
  })
  check(got.offered && got.id === 'gemhollow' && got.maps === 'menu,world' && got.mobs === 3 && got.clean && got.again === 'gemhollow' && got.fresh === 'gemhollow-2',
        `Gem Hollow opens from Home as the user's own module, clean, and a fresh copy beside it (${JSON.stringify(got)})`)
}

// CINDERFALL, the other example: a first-person shooter of twelve maps, with
// fonts of its own (which the template must carry) and baked music.
{
  const got = await page.evaluate(async () => {
    const S = window.__studio
    const was = S.rec.id
    await S.go('home')
    let offered = false
    for (let i = 0; i < 30 && !offered; i++) { await new Promise((r) => setTimeout(r, 100)); offered = !!document.querySelector('[data-example="cinderfall"] button') }
    await S.openExample('cinderfall'); await new Promise((r) => setTimeout(r, 2500))
    const r = { offered, id: S.rec.id, maps: Object.keys(S.docs).length, mobs: Object.keys(S.module.mobs?.mobs ?? {}).length,
      fonts: Object.keys(S.rec.assets).filter((k) => /^ui\/fonts\/.+\.ttf$/.test(k)).length, clean: !!document.querySelector('[data-problems="0"]'),
      bake: (await S.bakeAll()).ok }
    await S.store.remove('cinderfall')
    await S.openModule(was); await S.go('map')
    return r
  })
  check(got.offered && got.id === 'cinderfall' && got.maps === 12 && got.mobs === 6 && got.fonts === 2 && got.clean && got.bake,
        `Cinderfall opens from Home, clean, its fonts and baked music with it (${JSON.stringify(got)})`)
}

// DUPLICATE AND EXPORT: in the example project, a texture and a sprite are
// duplicated (the dialog's name taken as offered), the copies are there to
// draw, and each offers its files to take out of the studio.
{
  const got = await page.evaluate(async () => {
    const S = window.__studio
    const was = S.rec.id
    await S.openExample('gemhollow'); await new Promise((r) => setTimeout(r, 1500))
    const okDialog = async () => { for (let i = 0; i < 30; i++) { const d = document.querySelector('dialog[open]'); if (d) { d.querySelector('button[type=submit]').click(); return true } await new Promise((r) => setTimeout(r, 100)) } return false }
    const tex = Object.keys(S.module.textures)[0]
    await S.go('textures', tex); await new Promise((r) => setTimeout(r, 400))
    S.showTextures(tex); await new Promise((r) => setTimeout(r, 300))
    const texCard = document.querySelector(`[data-open-texture="${tex}"]`)
    const texExports = [...texCard.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /export/.test(t))
    ;[...texCard.querySelectorAll('button')].find((b) => /duplicate/.test(b.textContent)).click(); await okDialog(); await new Promise((r) => setTimeout(r, 400))
    const texCopy = `${tex}_2`
    const texOk = !!S.module.textures[texCopy] && !!S.rec.assets[`textures/${texCopy}.png`] && !!S.imageUrls.get(texCopy)
    await S.go('sprites'); await new Promise((r) => setTimeout(r, 400))
    S.showSprites('HERO'); await new Promise((r) => setTimeout(r, 300))
    const sprCard = document.querySelector('[data-open-sprite="HERO"]')
    const sprExports = [...sprCard.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /export/.test(t))
    ;[...sprCard.querySelectorAll('button')].find((b) => /duplicate/.test(b.textContent)).click(); await okDialog(); await new Promise((r) => setTimeout(r, 400))
    const sprOk = !!S.module.sprites.HERO_2 && !!S.sheets.get('HERO_2')?.atlas && !!S.rec.assets['sources/sprites/HERO_2.tsprite'] && JSON.parse(await S.rec.assets['sprites/HERO_2.json'].text()).sprite === 'HERO_2'
    await S.store.remove('gemhollow'); await S.openModule(was); await S.go('map')
    return { tex, texOk, texExports, sprOk, sprExports }
  })
  check(got.texOk && got.sprOk, `a texture and a sprite duplicate, picture, sheet and project, under the new name (${JSON.stringify(got)})`)
  check(got.texExports.some((t) => /PNG/.test(t)) && got.sprExports.some((t) => /tsprite/.test(t)) && got.sprExports.some((t) => /sheet/.test(t)), 'and each offers its files to take out of the studio')
}

// BIG GRAPHS STAY QUICK. What made them crawl, each guarded: the map drawn
// and baked under the page; a tap or an edit building every node again; a
// drag reading every pin's place between writes. The links must still meet
// their pins, measured from the page, after a drag and after an edit.
{
  const got = await page.evaluate(async () => {
    const S = window.__studio
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const r = {}
    // The map is neither drawn nor baked while a page covers it.
    let draws = 0
    const render = S.viewport.render.bind(S.viewport)
    S.viewport.render = (...a) => { draws++; return render(...a) }
    await S.go('graph'); await frame()
    S.viewport.dirty = true; draws = 0
    for (let i = 0; i < 4; i++) await frame()
    r.drawsUnder = draws
    S.moduleChanged()
    r.staleUnder = !!S.previewStale
    // A board of 120 nodes in a chain, each with a field.
    const nodes = [{ id: 'start', type: 'when_level_starts', pos: { x: 0, y: 0 } }]
    const links = []
    let prev = 'start.then'
    for (let i = 0; i < 120; i++) {
      nodes.push({ id: `b${i}`, type: 'branch', pos: { x: 240 * (1 + (i % 10)), y: 150 * Math.floor(i / 10) } })
      nodes.push({ id: `c${i}`, type: 'compare', op: '>=', b: i, pos: { x: 240 * (1 + (i % 10)) - 100, y: 150 * Math.floor(i / 10) + 70 } })
      links.push([prev, `b${i}.in`], [`c${i}.value`, `b${i}.cond`])
      prev = `b${i}.true`
    }
    S.doc.graphs ??= {}
    S.doc.graphs.big = { version: 1, vars: {}, nodes, links }
    const gw = S.window
    await gw.pickGraph('big'); await frame(); await frame()
    const nodeEl = (id) => document.querySelector(`.gw .gw-node[data-node="${id}"]`)
    const paths = () => [...document.querySelectorAll('.gw .gw-link-g .wk-edge')]
    // Every link's ends against its pins' dots, measured now.
    const misses = () => {
      const w = gw.world.getBoundingClientRect(); const z = gw.view.z
      let worst = 0
      for (const [i, [f, t]] of gw.graph.links.entries()) {
        const vis = document.querySelector(`.gw .gw-link[data-link="${i}"]`)
        const nums = vis.getAttribute('d').match(/-?[\d.]+/g).map(Number)
        const dot = (key, dir) => { const q = document.querySelector(`.gw .gw-pin[data-pin="${key}"][data-dir="${dir}"] .gw-dot`).getBoundingClientRect(); return { x: (q.left + q.width / 2 - w.left) / z, y: (q.top + q.height / 2 - w.top) / z } }
        const a = dot(f, 'out'); const b = dot(t, 'in')
        worst = Math.max(worst, Math.hypot(nums[0] - a.x, nums[1] - a.y), Math.hypot(nums.at(-2) - b.x, nums.at(-1) - b.y))
      }
      return +worst.toFixed(1)
    }
    r.missAfterOpen = misses()
    // A tap keeps every other node's element.
    const keep = nodeEl('b50')
    gw.picked = { kind: 'node', id: 'b3' }; gw.render(); await frame()
    r.tapKept = nodeEl('b50') === keep && nodeEl('b3').classList.contains('gw-on')
    // A drag: only the dragged node's links change, and nothing is rebuilt.
    const before = paths(); const d0 = before.map((p) => p.getAttribute('d'))
    const head = nodeEl('b12').querySelector('.gw-head'); const hr = head.getBoundingClientRect()
    head.setPointerCapture = () => {}
    const at = (dx) => ({ bubbles: true, clientX: hr.x + 10 + dx, clientY: hr.y + 8 + dx, pointerId: 9, isPrimary: true, buttons: 1 })
    head.dispatchEvent(new PointerEvent('pointerdown', at(0)))
    for (let i = 1; i <= 5; i++) head.dispatchEvent(new PointerEvent('pointermove', at(i * 10)))
    const after = paths()
    r.dragSameEls = after.length === before.length && after.every((p, i) => p === before[i])
    r.dragChanged = after.filter((p, i) => p.getAttribute('d') !== d0[i]).length
    head.dispatchEvent(new PointerEvent('pointerup', at(50))); await frame(); await frame()
    r.missAfterDrag = misses()
    // A node made taller (its help opened): the links follow its pins.
    const h0 = nodeEl('c7').offsetHeight
    gw.docOpen ??= new Set(); gw.docOpen.add('c7')
    gw.changed(); await frame(); await frame(); await frame()
    r.missAfterEdit = misses()
    r.grew = nodeEl('c7').offsetHeight - h0
    r.editKept = nodeEl('b50') === keep
    delete S.doc.graphs.big
    // Back on the map: the bake that waited, and a frame.
    draws = 0
    await S.go('map'); await frame(); await frame()
    r.staleOnMap = !!S.previewStale
    r.drawsOnMap = draws
    S.viewport.render = render
    return r
  })
  check(got.drawsUnder === 0 && got.staleUnder, `under a page the map is neither drawn nor baked (${got.drawsUnder} draws, waiting ${got.staleUnder})`)
  check(!got.staleOnMap && got.drawsOnMap > 0, `and back on the map it is baked and drawn (${JSON.stringify({ stale: got.staleOnMap, draws: got.drawsOnMap })})`)
  check(got.tapKept && got.editKept, `a tap or an edit on a big graph keeps the nodes it did not change (${JSON.stringify({ tap: got.tapKept, edit: got.editKept })})`)
  check(got.dragSameEls && got.dragChanged === 3, `a drag moves only the dragged node's links, building nothing (${got.dragChanged} changed, same elements ${got.dragSameEls})`)
  check(got.missAfterOpen < 1.5 && got.missAfterDrag < 1.5 && got.missAfterEdit < 1.5,
        `every link meets its pins, opened, dragged and edited (worst ${got.missAfterOpen} / ${got.missAfterDrag} / ${got.missAfterEdit} units; the edited node grew ${got.grew}px)`)
  check(got.grew > 0, 'CONTROL: and the edit did move its pins')
}

// FOUR PAGES IN THE EXAMPLE PROJECT: the Sky page opens, a HUD picture that
// names one of the module's own textures draws (the client asks /sprites/ and
// /textures/, where the studio keeps none), the Sounds page counts a graph's
// play_sound as a user, and a decimal typed into a graph is a number.
{
  const got = await page.evaluate(async () => {
    const S = window.__studio
    const was = S.rec.id
    const errors = []
    const onErr = (e) => errors.push(String(e.message ?? e.reason))
    window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onErr)
    await S.openExample('gemhollow'); await new Promise((r) => setTimeout(r, 1500))
    await S.go('sky'); await new Promise((r) => setTimeout(r, 800))
    const sky = !!document.querySelector('.sd-page canvas, .st-sheet canvas')
    // The HUD picture.
    const tex = Object.keys(S.module.textures)[0]
    S.module.ui ??= JSON.parse(JSON.stringify((await import('/studio/src/ui_emit.js')).newLayout((await import('/src/render/layout.js')).DEFAULT_LAYOUT)))
    S.module.ui.hud.push({ id: 'logo', type: 'image', frame: tex, anchor: 'tl', x: 8, y: 8, w: 32, h: 32 })
    await S.go('screens')
    S.window.tab = 'hud'; S.window.render()
    let img = null
    for (let i = 0; i < 40; i++) { img = [...document.querySelectorAll('.sc .sc-frame img')].find((x) => x.dataset.frame === tex); if (img?.complete && img.naturalWidth) break; await new Promise((r) => setTimeout(r, 100)) }
    const hud = { tex, src: img?.src?.slice(0, 5), w: img?.naturalWidth ?? 0 }
    S.module.ui.hud.pop()
    // The sound a graph plays.
    const sound = (S.moduleSounds ?? [])[0]
    const d = Object.values(S.docs)[0]
    const { graphsOf } = await import('/studio/src/graphs_emit.js')
    const [gname, g] = graphsOf(d)[0] ?? []
    g?.nodes.push({ id: 'zz_hear', type: 'play_sound', sound, pos: { x: 0, y: 0 } })
    const by = [...(S.soundsUsed().get(sound) ?? [])]
    g?.nodes.pop()
    // The decimal.
    const { literal } = await import('/studio/src/graphwin.js')
    const typed = [literal('2.5'), literal('0,5'), literal('3'), literal('gold')]
    window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr)
    await S.store.remove('gemhollow'); await S.openModule(was); await S.go('map')
    return { errors, sky, hud, sound, gname, by, typed }
  })
  check(!got.errors.length && got.sky, `the Sky page opens on the example project without an error (${got.errors.join(' | ')})`)
  check(got.hud.src === 'blob:' && got.hud.w > 0, `a HUD picture naming one of the module's textures draws, from the module's copy (${JSON.stringify(got.hud)})`)
  check(got.by.some((w) => w.includes(got.gname)), `the Sounds page counts a graph's play_sound as a user of ${got.sound} (${got.by.join(', ')})`)
  check(JSON.stringify(got.typed) === '[2.5,0.5,3,"gold"]', `a decimal typed into a graph is a number, a word stays a word (${JSON.stringify(got.typed)})`)
}

// A STYLE FROM OUTSIDE: uikit's sample skin, baked as a tool would get it,
// imported through the studio (skin.js importSkin, what Home's "import a
// style…" calls), worn, listed on Home, then forgotten.
{
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const out = join(mkdtempSync(join(tmpdir(), 'dnp-skin-')), 'sample.skin.js')
  execFileSync(process.execPath, [new URL('../../uikit/build.js', import.meta.url).pathname, 'sample', '--js', out])
  const text = readFileSync(out, 'utf8')
  const got = await page.evaluate(async (text) => {
    const S = window.__studio
    const { importSkin, removeSkin, skinList } = await import('/studio/src/skin.js')
    const s = await importSkin(text)
    await S.skin.use({ skin: s.id })
    S.skinList = await skinList()
    await S.go('home'); await new Promise((r) => setTimeout(r, 400))
    const options = [...document.querySelectorAll('.sd-page select')].flatMap((x) => [...x.options].map((o) => o.textContent))
    const r = { id: s.id, worn: S.skin.id, mode: document.documentElement.dataset.dnpMode, listed: options.some((o) => /\(imported\)/.test(o)), forgetBtn: !!document.querySelector('.sd-page button.st-danger') }
    await removeSkin(s.id); await S.skin.use({ skin: 'claude' }); S.skinList = await skinList()
    r.gone = !S.skinList.some((x) => x.id === s.id)
    await S.go('map')
    return r
  }, text)
  check(got.id === 'sample' && got.worn === 'sample' && got.listed && got.forgetBtn && got.gone,
        `a style baked by uikit is imported, worn and listed on Home, and can be forgotten (${JSON.stringify(got)})`)
  await page.evaluate(() => { localStorage.removeItem('dnp.studio.skin'); localStorage.removeItem('dnp.studio.skin.mode') })
}

// A FIRST ROOM IS VISIBLE. A style that names no texture once drew rooms that
// were outlines in plan and nothing in 3D, and a newcomer thought drawing had
// failed: a room now takes the module's own textures, and a module with none
// (and an app that serves none) is given two plain ones.
{
  const drawn = async () => {
    await page.evaluate(async () => { const S = window.__studio; await S.go('map'); S.viewport.lookAt(30, 0, 0); S.viewport.viewHeight = 40; S.viewport.resize() })
    await page.keyboard.press('Escape'); await page.keyboard.press('2')
    const n = await page.evaluate(() => window.__studio.doc.order.length)
    await tapAt(26, -3); await tapAt(34, -3); await tapAt(34, 3); await tapAt(26, 3); await tapAt(26, -3)
    await page.waitForFunction((n) => window.__studio.doc.order.length === n + 1, { timeout: 5000 }, n).catch(() => {})
    return page.evaluate(() => {
      const S = window.__studio; const sec = S.doc.sectors[S.doc.order.at(-1)]
      return { floor: sec.floorTex, ceil: sec.ceilTex, wall: sec.verts[0].edge.middle, own: Object.keys(S.module.textures ?? {}) }
    })
  }
  const reset = () => page.evaluate(() => { const S = window.__studio; Object.assign(S.style.sector, { floorTex: null, ceilTex: null }); Object.assign(S.style.edge, { middle: null, upper: null, lower: null }) })
  const made = await page.evaluate(async () => { const S = window.__studio; S.__texBack = S.rec.id; await S.store.remove('tex-first').catch(() => {}); const r = await S.newFromTemplate('tex-first', 'Tex first'); if (r) await S.openModule('tex-first'); return !!r })
  if (made) {
    await reset()
    const r = await drawn()
    check(r.own.includes(r.floor) && r.own.includes(r.wall) && r.ceil === r.floor,
          `a room drawn in a module from the template takes the module's textures (${JSON.stringify(r)})`)
  } else check(false, 'the starter template opens for the first-room check')
  const plain = await page.evaluate(async () => {
    const S = window.__studio
    const { newModule } = await import('/studio/src/module_emit.js')
    await S.store.remove('tex-none').catch(() => {})
    await S.store.save({ id: 'tex-none', module: newModule('tex-none', 'Tex none'), docs: { first: S.starterDoc('first', { fresh: true }) }, assets: {} })
    await S.openModule('tex-none')
    S.__served = [S.textureNames, S.textureSizes]; S.textureNames = []; S.textureSizes = {}
  })
  await reset()
  const r = await drawn()
  check(r.floor === 'PLAIN_FLOOR' && r.ceil === 'PLAIN_FLOOR' && r.wall === 'PLAIN_WALL' && r.own.includes('PLAIN_WALL'),
        `a module with no textures at all is given two plain ones for its first room (${JSON.stringify(r)})`)
  await page.waitForFunction(() => window.__studio.preview.busy === false && window.__studio.preview.last, { timeout: 15000 }).catch(() => {})
  const baked = await page.evaluate(() => ({ ok: window.__studio.preview.last?.ok, assets: Object.keys(window.__studio.rec.assets ?? {}).filter((p) => p.startsWith('textures/')) }))
  check(baked.ok && baked.assets.includes('textures/PLAIN_FLOOR.png'), `and it bakes, the pictures in the module (${JSON.stringify(baked)})`)
  void plain
  await page.evaluate(async () => {
    const S = window.__studio; [S.textureNames, S.textureSizes] = S.__served; delete S.__served
    // Back to the module the scenarios before were on, then the two test modules gone:
    // removing the OPEN one left later scenarios on a module the store no longer had.
    await S.openModule(S.__texBack); delete S.__texBack
    await S.store.remove('tex-none'); await S.store.remove('tex-first')
  })
}

// PLAY SHOWS WHAT IT IS DOING: a screen over the studio from the press until
// the game takes the window -- once it went silent, then the game appeared.
// A stand-in shell (the page has none): files counted, a launch that takes a
// while, and then fails (the failure stays, with the log and a way back) or
// succeeds (the screen stays for the page that replaces it).
{
  const run = (fail) => page.evaluate(async (fail) => {
    const S = window.__studio
    await S.go('map')
    let writes = 0
    globalThis.dnp = { studio: {
      writeFile: async () => { writes++; return true },
      readFile: async () => null, listFiles: async () => [], deleteFile: async () => true, useModule: async () => true,
      share: async () => true,
      launch: () => new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error('the test server refused')) : resolve(true)), 900))
    } }
    const seen = new Set()
    const watch = setInterval(() => { const st = document.querySelector('#playscreen .ui-boot__status')?.textContent; if (st) seen.add(st.replace(/:.*$/, '').replace(/…$/, '')) }, 20)
    const playing = S.play()
    await new Promise((r) => setTimeout(r, 30))
    const early = !!document.getElementById('playscreen')
    await playing
    clearInterval(watch)
    const el = document.getElementById('playscreen')
    const out = { early, writes, seen: [...seen], open: !!el, failed: el?.classList.contains('ps-failed') ?? false,
      log: [...(el?.querySelectorAll('.ui-boot__line') ?? [])].map((x) => x.textContent.replace(/^\S+\s+/, '')),
      buttons: [...(el?.querySelectorAll('.ps-actions button') ?? [])].map((b) => b.textContent),
      fill: parseFloat(el?.querySelector('.ui-boot__fill')?.style.width ?? '0') }
    return out
  }, fail)
  const bad = await run(true)
  await page.screenshot({ path: process.env.DNP_SHOT_DIR ? `${process.env.DNP_SHOT_DIR}/play-failed.png` : '/dev/null' }).catch(() => {})
  // Each step logged as done, in order (a fast one can finish between two looks at the status).
  const done = bad.log.filter((l) => /^✓ /.test(l)).map((l) => l.replace(/^✓ /, '').replace(/ \(\d+ ms\)$/, ''))
  check(bad.early && bad.writes > 0 && done.join(' > ') === 'baking sources > checking maps and graphs > baking maps > writing the module' && bad.seen.includes('starting the game'),
        `Play shows a screen at once and logs each step as it runs (${done.join(' > ')}; ${bad.writes} files)`)
  check(bad.open && bad.failed && bad.log.some((l) => /✗ starting the game/.test(l)) && bad.log.some((l) => /the test server refused/.test(l)) && bad.buttons.join() === 'play log,back to the studio',
        `a launch that fails stays on the screen, with the error, the log and a way back (${JSON.stringify({ log: bad.log.slice(-3), buttons: bad.buttons })})`)
  const back = await page.evaluate(async () => { [...document.querySelectorAll('#playscreen .ps-actions button')].find((b) => /back/.test(b.textContent)).click(); await new Promise((r) => setTimeout(r, 50)); return { gone: !document.getElementById('playscreen'), route: window.__studio.route() } })
  check(back.gone && back.route === 'map', `"back to the studio" puts it away, on the map (${JSON.stringify(back)})`)
  const good = await run(false)
  check(good.open && !good.failed && good.fill >= 99 && good.log.some((l) => /✓ writing the module/.test(l)),
        `a launch that works keeps the screen, the bar full, until the game replaces the page (${good.fill}%)`)
  await page.evaluate(() => { document.getElementById('playscreen')?.remove(); delete globalThis.dnp })
}

// A NEWER STUDIO IS SAID ON HOME (updates.js): what it is, what changed, a
// download that goes to the system's browser (the shell's openUrl), and "not
// now" that keeps it away until a later one. CONTROL: the same version is no notice.
{
  const r = await page.evaluate(async () => {
    const S = window.__studio
    const opened = []
    globalThis.dnp = { studio: { openUrl: async (u) => { opened.push(u); return true } } }
    localStorage.removeItem('dnp.studio.update.skip')
    const current = S.update
    S.update = { state: 'newer', current: '0.3.1', latest: '9.9.9', url: 'https://github.com/projectdigidream/digidream-studio/releases/tag/studio-v9.9.9', notes: ['A first room is visible.', 'Play shows its steps.'], error: null }
    await S.go('home'); await new Promise((r) => setTimeout(r, 300))
    const card = document.querySelector('.sd-page .sd-update[data-update="9.9.9"]')
    const out = { card: !!card, text: card?.textContent ?? '', notes: card?.querySelectorAll('li').length ?? 0, check: !!document.querySelector('.sd-page [data-action="check-update"]') }
    ;[...(card?.querySelectorAll('button') ?? [])].find((b) => /download/.test(b.textContent))?.click()
    await new Promise((r) => setTimeout(r, 50))
    out.opened = opened
    ;[...(document.querySelector('.sd-page .sd-update')?.querySelectorAll('button') ?? [])].find((b) => /not now/.test(b.textContent))?.click()
    await new Promise((r) => setTimeout(r, 300))
    out.afterSkip = !!document.querySelector('.sd-page .sd-update')
    localStorage.removeItem('dnp.studio.update.skip')
    S.update = { ...S.update, state: 'current', latest: '0.3.1' }
    await S.router.remount(); await new Promise((r) => setTimeout(r, 300))
    out.current = !!document.querySelector('.sd-page .sd-update')
    S.update = current; delete globalThis.dnp
    await S.go('map')
    return out
  })
  check(r.card && /Studio 9\.9\.9 is out/.test(r.text) && r.notes === 2 && r.check, `Home says a newer studio is out, with what changed, and offers a check (${r.text.slice(0, 60)})`)
  check(r.opened.length === 1 && /releases\/tag\/studio-v9\.9\.9$/.test(r.opened[0]), `download opens the release in the system's browser (${r.opened})`)
  check(!r.afterSkip && !r.current, `"not now" puts it away; the same version shows no notice (${JSON.stringify({ afterSkip: r.afterSkip, current: r.current })})`)
}

// PLAY FROM HOME STARTS ON THE MODULE'S STARTING MAP (startmap.js), not the
// map open in the editor; the map editor's Play starts on the map being
// edited. Unset, the first by name -- what the game does.
{
  const r = await page.evaluate(async () => {
    const S = window.__studio
    const launched = []
    globalThis.dnp = { studio: { writeFile: async () => true, readFile: async () => null, listFiles: async () => [], deleteFile: async () => true, useModule: async () => true, share: async () => true,
      launch: async (o) => { launched.push(o.map); throw new Error('stop here') } } }
    const had = S.module.startMap
    S.docs.zzstart = S.starterDoc('zzstart')
    S.docs.aafirst = S.starterDoc('aafirst')
    await S.openDoc(Object.keys(S.docs).find((n) => n !== 'zzstart' && n !== 'aafirst'))
    const editing = S.docName
    const homePlay = async () => {
      await S.go('home'); await S.router.remount(); await new Promise((r) => setTimeout(r, 200))
      const b = [...document.querySelectorAll('.sd-page .sd-hero button')].find((x) => /play from/.test(x.textContent))
      const label = b?.textContent ?? ''
      b?.click(); await new Promise((r) => setTimeout(r, 50))
      await new Promise((r) => { const t = setInterval(() => { if (document.querySelector('#playscreen.ps-failed')) { clearInterval(t); r() } }, 50) })
      document.getElementById('playscreen')?.remove()
      return label
    }
    S.module.startMap = 'zzstart'
    const labelSet = await homePlay()
    delete S.module.startMap
    const labelUnset = await homePlay()
    await S.go('map')
    await S.play()
    document.getElementById('playscreen')?.remove()
    delete S.docs.zzstart; delete S.docs.aafirst
    if (had) S.module.startMap = had
    delete globalThis.dnp
    return { launched, editing, labelSet, labelUnset }
  })
  check(r.launched[0] === 'zzstart.dnpm' && /play from zzstart/.test(r.labelSet), `Home's Play starts on the starting map, not the one being edited (${r.launched[0]}, editing ${r.editing})`)
  check(r.launched[1] === 'aafirst.dnpm' && /play from aafirst/.test(r.labelUnset), `with none set, on the first map by name, as the game (${r.launched[1]})`)
  check(r.launched[2] === `${r.editing}.dnpm`, `the map editor's Play starts on the map being edited (${r.launched[2]})`)
}

// WHAT A SYNC PLUGIN NEEDS (the hidden _sync plugin's background service):
// every module and its unbaked files with their revision; module-write, which
// replaces the open module in place and refuses one edited since; the
// studio's events; a badge on Home and the rail; and none of it for a plugin
// that did not ask.
{
  const r = await page.evaluate(async () => {
    const S = window.__studio
    const wait = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)) } return null }
    S.plugins.showHidden = true
    const { startPluginServices } = await import('/studio/src/plugins/frame.js')
    startPluginServices(S)
    const frame = document.querySelector('iframe[data-service="_sync/sync"]')
    const svc = await wait(() => frame?.contentWindow?.__sync?.api && frame.contentWindow.__sync.init && frame.contentWindow.__sync)
    if (!svc) return { started: false }
    const out = { started: true, hidden: frame.getBoundingClientRect().width === 0, init: svc.init }
    const id = S.rec.id
    await S.go('map')
    const mapBefore = S.docName
    const view = { x: S.viewport.target.x, h: S.viewport.viewHeight }
    // Every module, and this one's files.
    const mods = await svc.api.query('modules')
    out.listed = mods.some((m) => m.id === id && m.open && Number.isInteger(m.rev))
    const got = await svc.api.query('record-files', { id })
    out.files = got.files.length
    out.unbaked = !got.files.some((f) => /\.(dnpm|lua)$/.test(f.path))
    // A pull: the module renamed and a room added to the open map, written at the rev it was read at.
    const dec = new TextDecoder(); const enc = new TextEncoder()
    const files = got.files.map((f) => {
      if (f.path === 'module.studio.json') { const m = JSON.parse(dec.decode(f.bytes)); m.name = 'Pulled'; return { path: f.path, bytes: enc.encode(JSON.stringify(m)) } }
      return f
    })
    const snapsBefore = (await S.snaps?.list?.(id).catch(() => []))?.length ?? null
    const w = await svc.api.query('module-write', { id, baseRev: got.rev, files }, { timeout: 30000 })
    out.write = w
    out.nameNow = S.module.name
    out.mapKept = S.docName === mapBefore
    out.viewKept = S.viewport.target.x === view.x && S.viewport.viewHeight === view.h
    out.snapshot = snapsBefore === null ? 'n/a' : ((await S.snaps.list(id)).length > snapsBefore)
    out.revNow = (await S.store.load(id)).rev
    // Stale: written against the rev before.
    out.stale = await svc.api.query('module-write', { id, baseRev: got.rev, files }, { timeout: 30000 })
    // An edit, saved: one module-saved event with its rev.
    svc.events.length = 0
    S.module.about = (S.module.about ?? '') + ' '
    S.moduleChanged()
    out.saved = await wait(() => svc.events.find((e) => e.name === 'module-saved' && e.id === id))
    out.savedOnce = svc.events.filter((e) => e.name === 'module-saved').length
    // The app back in front (the Android shell's word).
    globalThis.__dnpAppHidden?.(false)
    out.front = await wait(() => svc.events.find((e) => e.name === 'foreground'))
    // A badge for the module, on the rail and Home.
    svc.api.status({ module: id, text: '2 changes to push', level: 'warn' })
    await S.go('home'); await S.router.remount()
    out.rail = await wait(() => document.querySelector('.sd-mod .sd-modstatus')?.title)
    out.home = await wait(() => { const n = document.querySelector(`.sd-page [data-badge-module="${id}"]`); return n && !n.hidden && n.textContent })
    svc.api.status({ module: id, text: '' })
    out.cleared = await wait(() => !document.querySelector('.sd-mod .sd-modstatus') && document.querySelector(`.sd-page [data-badge-module="${id}"]`)?.hidden)
    // A plugin that did not ask may not write.
    try { await S.pluginQuery('module-write', { id, baseRev: out.revNow, files }, { plugin: '_echo' }); out.denied = false } catch (e) { out.denied = /may not write/.test(e.message) }
    await S.go('map')
    return out
  })
  check(r.started && r.hidden && r.init?.service === 'sync', `a plugin's service starts hidden and is told it started (${JSON.stringify(r.init)})`)
  check(r.listed && r.files > 2 && r.unbaked, `it is given every module with its revision, and a module's files unbaked (${r.files} files)`)
  check(r.write?.ok && r.write.rev > 0 && r.nameNow === 'Pulled' && r.mapKept && r.viewKept && r.snapshot !== false,
        `module-write replaces the open module in place, the map and view kept, a snapshot first (${JSON.stringify({ write: r.write, name: r.nameNow, map: r.mapKept, view: r.viewKept, snap: r.snapshot })})`)
  check(r.stale && r.stale.ok === false && r.stale.reason === 'changed' && r.stale.rev === r.revNow, `a write made against an older revision is refused (${JSON.stringify(r.stale)})`)
  check(r.saved && r.saved.rev > r.revNow && r.savedOnce === 1 && r.front, `the service hears each save once, with its revision, and the app coming back (${JSON.stringify({ saved: r.saved, once: r.savedOnce, front: !!r.front })})`)
  check(r.rail === '2 changes to push' && /2 changes to push/.test(r.home ?? '') && r.cleared, `its status is a badge on the rail and Home, and empty text takes it away (${r.rail} / ${r.home})`)
  check(r.denied === true, 'CONTROL: a plugin that did not ask for "module-write" is refused')
}

// An editor open on a document a write changes: clean, it is given the new
// one; with unsaved work, it keeps it and is told.
{
  const r = await page.evaluate(async () => {
    const S = window.__studio
    const wait = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)) } return null }
    const svc = document.querySelector('iframe[data-service="_sync/sync"]').contentWindow.__sync
    const id = S.rec.id
    ;(S.module.scripts ??= {})['sync_test.lua'] = '-- as it was'
    S.moduleChanged()
    await S.go('edit', '_echo/text~record:script~sync_test.lua')
    const echo = await wait(() => { const w = document.querySelector('.sx-editor iframe.sx-frame')?.contentWindow; return w?.__echo?.text?.value === '-- as it was' && w.__echo })
    if (!echo) return { opened: false }
    const pull = async (body) => {
      const got = await svc.api.query('record-files', { id })
      const dec = new TextDecoder(); const enc = new TextEncoder()
      const files = got.files.map((f) => {
        if (f.path !== 'module.studio.json') return f
        const m = JSON.parse(dec.decode(f.bytes)); m.scripts['sync_test.lua'] = body; return { path: f.path, bytes: enc.encode(JSON.stringify(m)) }
      })
      return svc.api.query('module-write', { id, baseRev: got.rev, files }, { timeout: 30000 })
    }
    const out = { opened: true }
    out.w1 = await pull('-- from GitHub')
    out.clean = await wait(() => echo.text.value === '-- from GitHub')
    // Unsaved work in the editor: kept, and the bar says so.
    echo.text.value = '-- mine'; echo.text.dispatchEvent(new Event('input'))
    await wait(() => S.editorSession?.dirty)
    out.w2 = await pull('-- from GitHub again')
    await new Promise((r) => setTimeout(r, 300))
    out.kept = echo.text.value
    out.said = document.querySelector('.sx-editor .sx-status')?.textContent ?? ''
    S.editorSession.dirty = false
    await S.editorSession.finish(false)
    delete S.module.scripts['sync_test.lua']; S.moduleChanged()
    await S.go('map')
    return out
  })
  check(r.opened && r.w1?.ok && r.clean, `an editor with nothing unsaved is given the document a write changed (${JSON.stringify(r.w1)})`)
  check(r.w2?.ok && r.kept === '-- mine' && /changed by .* while you edit/.test(r.said), `an editor with unsaved work keeps it, and is told (${r.said})`)
}

// The rest of what a sync relies on: revisions never repeat (an older record
// put back still takes a new number); a module that is not open is read and
// written the same way, and a new one can be made; files that are not a
// module, or name another id, are refused; opening a module is an event; the
// Plugins page says what a plugin may do; openUrl without a shell opens a tab.
{
  const r = await page.evaluate(async () => {
    const S = window.__studio
    const wait = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)) } return null }
    const svc = document.querySelector('iframe[data-service="_sync/sync"]').contentWindow.__sync
    const id = S.rec.id
    const out = {}
    // Revisions only rise: the stored record saved back from an older copy.
    const stored = await S.store.load(id)
    const older = { ...stored, rev: 1 }
    const back = await S.store.save(older)
    out.monotonic = back > stored.rev
    // Another module, not open: made by a write (baseRev 0), read back, written again.
    const mine = await svc.api.query('record-files', { id })
    const enc = new TextEncoder(); const dec = new TextDecoder()
    const asOther = (name) => mine.files.map((f) => {
      if (f.path !== 'module.studio.json') return f
      const m = JSON.parse(dec.decode(f.bytes)); m.id = 'synctwo'; m.name = name; return { path: f.path, bytes: enc.encode(JSON.stringify(m)) }
    })
    await S.store.remove('synctwo').catch(() => {})
    out.made = await svc.api.query('module-write', { id: 'synctwo', baseRev: 0, files: asOther('Two') }, { timeout: 30000 })
    out.listed = (await svc.api.query('modules')).find((m) => m.id === 'synctwo')
    const two = await svc.api.query('record-files', { id: 'synctwo' })
    out.readOther = two.rev === out.made.rev && two.files.length === mine.files.length
    out.writeOther = await svc.api.query('module-write', { id: 'synctwo', baseRev: two.rev, files: asOther('Two again') }, { timeout: 30000 })
    out.stillOpen = S.rec.id === id && (await S.store.load('synctwo')).module.name === 'Two again'
    // Refusals.
    out.notModule = await svc.api.query('module-write', { id: 'synctwo', baseRev: out.writeOther.rev, files: [{ path: 'readme.txt', bytes: enc.encode('hi') }] })
    out.otherId = await svc.api.query('module-write', { id, baseRev: (await S.store.load(id)).rev, files: asOther('x') })
    // Opening a module is an event; then back.
    svc.events.length = 0
    await S.openModule('synctwo')
    out.opened = await wait(() => svc.events.find((e) => e.name === 'module-opened' && e.id === 'synctwo'))
    await S.openModule(id)
    await S.store.remove('synctwo')
    // The Plugins page says what the plugin may do.
    S.devPlugins = true
    await S.go('plugins'); await new Promise((r) => setTimeout(r, 300))
    out.perms = document.querySelector('[data-plugin="_sync"] [data-permissions]')?.textContent ?? ''
    S.devPlugins = false
    // openUrl with no shell: a new tab.
    const opened = []
    const realOpen = window.open
    window.open = (u, t) => { opened.push([u, t]); return null }
    const { shell } = await import('/studio/src/bridge.js')
    await shell.openUrl('https://github.com/projectdigidream/digidream-studio/releases/latest')
    window.open = realOpen
    out.tab = opened
    await S.go('map')
    return out
  })
  check(r.monotonic, 'a record put back from an older copy still takes a new, higher revision')
  check(r.made?.ok && r.listed && r.readOther && r.writeOther?.ok && r.writeOther.rev > r.made.rev && r.stillOpen,
        `a module that is not open is made, listed, read and written, and the open one stays open (${JSON.stringify({ made: r.made, write: r.writeOther })})`)
  check(r.notModule?.ok === false && /not a studio module/.test(r.notModule.reason) && r.otherId?.ok === false && /says "synctwo"/.test(r.otherId.reason),
        `files that are not a module, or name another module, are refused (${r.notModule?.reason} / ${r.otherId?.reason})`)
  check(!!r.opened, 'opening a module is an event the service hears')
  check(/replace whole modules/.test(r.perms) && /in the background/.test(r.perms), `the Plugins page says what a plugin may do (${r.perms})`)
  check(r.tab.length === 1 && r.tab[0][1] === '_blank' && /releases\/latest$/.test(r.tab[0][0]), `openUrl without a shell opens a new tab (${JSON.stringify(r.tab)})`)
}

await browser.close()
console.log(`\n${name}: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
