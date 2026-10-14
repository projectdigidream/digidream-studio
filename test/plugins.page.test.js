//
// The plugin system in a real page (docs/PLUGINS.md): the Echo editor opened on a
// script, edited, and brought back -- Back saves as one undo step, Discard
// keeps nothing, a draft outlives a reload. Opt-in, like page.test.js:
//
//   DNP_STUDIO_PAGE_TEST=1 STUDIO_URL=http://localhost:8093/studio/ \
//     NODE_PATH=<dir with puppeteer-core>/node_modules node studio/test/plugins.page.test.js
//
if (!process.env.DNP_STUDIO_PAGE_TEST) { console.log('plugins.page: 0 checks, 0 failures (set DNP_STUDIO_PAGE_TEST=1 to run)'); process.exit(0) }
import { createRequire } from 'node:module'
let puppeteer
try { puppeteer = createRequire(import.meta.url)('puppeteer-core') } catch {
  try { puppeteer = (await import('puppeteer-core')).default } catch { console.log('plugins.page: skipped (no puppeteer-core; set NODE_PATH)'); process.exit(0) }
}
const URL_ = process.env.STUDIO_URL ?? 'http://localhost:8093/studio/'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const ready = () => page.waitForFunction(() => window.__studio?.router?.current, { timeout: 60000 })
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))

await page.goto(URL_)
await ready()
await page.evaluate(() => { localStorage.setItem('dnp.studio.devPlugins', '1') })
await page.reload()
await ready()
check(await page.evaluate(() => window.__studio.plugins.hasPluginEditor('record:script')), 'the Echo editor is offered for scripts (hidden plugins on)')

// A script to edit.
await page.evaluate(() => {
  const S = window.__studio
  S.module.scripts = { ...(S.module.scripts ?? {}), 'echo_test.lua': 'print("before")\n' }
  S.moduleChanged()
})
await page.evaluate(() => window.__studio.go('scripts', 'echo_test.lua'))
await settle()
check(await page.$('[data-open-with="record:script"]') !== null, 'the Scripts page offers "open with…" when more than the studio edits scripts')

const echo = async () => {
  await page.waitForSelector('iframe.sx-frame')
  const handle = await page.$('iframe.sx-frame')
  const frame = await handle.contentFrame()
  await frame.waitForFunction(() => document.getElementById('text')?.value.length > 0, { timeout: 30000 })
  return frame
}
const type = async (frame, value) => frame.evaluate((v) => { const t = document.getElementById('text'); t.value = v; t.dispatchEvent(new Event('input')) }, value)
const script = () => page.evaluate(() => window.__studio.module.scripts['echo_test.lua'])

// Back saves.
await page.evaluate(() => window.__studio.go('edit', '_echo/text~record:script~echo_test.lua'))
let frame = await echo()
check(await frame.evaluate(() => document.getElementById('text').value) === 'print("before")\n', 'the editor is given the script')
// THE SKIN (phase 5): Echo asks for it (onSkin), so it is sent the studio's
// skin after init, and again when the mode changes.
{
  await frame.waitForFunction(() => globalThis.__echo?.skins?.length > 0, { timeout: 10000 }).catch(() => {})
  const first = await frame.evaluate(() => globalThis.__echo.skins.slice())
  const want = await page.evaluate(() => ({ id: window.__studio.skin.id, mode: window.__studio.skin.view.mode }))
  check(first.length === 1 && first[0].id === want.id && first[0].mode === want.mode && first[0].css, `the editor is sent the studio's skin on init (${JSON.stringify(first)})`)
  await page.evaluate(() => window.__studio.skin.setMode('light'))
  await frame.waitForFunction(() => globalThis.__echo.skins.length > 1, { timeout: 10000 }).catch(() => {})
  const after = await frame.evaluate(() => globalThis.__echo.skins.slice())
  check(after.length === 2 && after[1].mode === 'light', `and again on a mode change (${JSON.stringify(after.map((x) => x.mode))})`)
  await page.evaluate(() => window.__studio.skin.setMode('auto'))
}
await type(frame, 'print("after")\n')
await page.click('[data-action="editor-back"]')
await page.waitForFunction(() => !document.querySelector('.sx-editor'))
check(await script() === 'print("after")\n', 'back to studio puts the edited script in the module')
check(await page.evaluate(() => window.__studio.route()) === 'scripts', '...and goes back to where it was opened from')
await page.evaluate(() => window.__studio.undoHere())
await settle()
check(await script() === 'print("before")\n', 'one undo takes the whole edit back')
await page.evaluate(() => window.__studio.redoHere())
await settle()

// Discard keeps nothing.
await page.evaluate(() => window.__studio.go('edit', '_echo/text~record:script~echo_test.lua'))
frame = await echo()
await type(frame, 'print("thrown away")\n')
await settle(100)
await page.click('[data-action="editor-discard"]')
await page.waitForSelector('.sx-choose [data-answer="true"]')
await page.click('.sx-choose [data-answer="true"]')
await page.waitForFunction(() => !document.querySelector('.sx-editor'))
check(await script() === 'print("after")\n', 'discard leaves the module as it was')

// A draft outlives the page.
await page.evaluate(() => window.__studio.go('edit', '_echo/text~record:script~echo_test.lua'))
frame = await echo()
await type(frame, 'print("draft")\n')
await settle(2600)                       // drafts are sent at most every 2 s
await page.reload()
await page.waitForSelector('.sx-choose [data-answer="resume"]', { timeout: 60000 })
await page.click('.sx-choose [data-answer="resume"]')
frame = await echo()
check(await frame.evaluate(() => document.getElementById('text').value) === 'print("draft")\n', 'after a reload the editor is offered its unsaved work, and gets it')
await page.click('[data-action="editor-back"]')
await page.waitForFunction(() => !document.querySelector('.sx-editor'))
check(await script() === 'print("draft")\n', 'and Back saves it')
check(await page.evaluate(async () => (await window.__studio.pluginQuery('module')).id === window.__studio.module.id), 'a plugin can ask which module it is in')

// Leaving by the back button asks first.
await page.evaluate(() => window.__studio.go('edit', '_echo/text~record:script~echo_test.lua'))
frame = await echo()
await type(frame, 'print("left")\n')
await page.evaluate(() => history.back())
await page.waitForSelector('.sx-choose [data-answer="stay"]')
await page.click('.sx-choose [data-answer="stay"]')
await settle()
check(await page.$('.sx-editor') !== null, 'the back button asks, and "stay" stays')
await page.click('[data-action="editor-discard"]')
await page.waitForSelector('.sx-choose [data-answer="true"]')
await page.click('.sx-choose [data-answer="true"]')
await page.waitForFunction(() => !document.querySelector('.sx-editor'))

// BAKING (docs/PLUGINS.md, Bakers). A sprite source baked in the page's Worker
// is the same bytes as in node; the sheet is the studio's at once; an edited
// source is stale until baked; Play's emit bakes it.
{
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { Baker, BUILTIN_BAKERS, sha256 } = await import('../src/bake/run.js')
  const fixture = new Uint8Array(readFileSync(fileURLToPath(new URL('./fixtures/spirit.tsprite', import.meta.url))))
  const nodeBake = await new Baker({ bakersFor: (k) => BUILTIN_BAKERS.filter((b) => b.kinds.includes(k)) }).bake('file:tsprite', 'GHOST', fixture)
  const nodePng = await sha256(nodeBake.files['sprites/GHOST.png'])
  const r = await page.evaluate(async () => {
    const S = window.__studio
    const bytes = new Uint8Array(await (await fetch(new URL('test/fixtures/spirit.tsprite', location.href.replace(/#.*$/, '')))).arrayBuffer())
    S.rec.assets['sources/sprites/GHOST.tsprite'] = new Blob([bytes])
    const t0 = performance.now()
    const b = await S.bakeSource('file:tsprite', 'GHOST')
    const ms = performance.now() - t0
    const { sha256 } = await import(new URL('src/bake/run.js', location.href.replace(/#.*$/, '')).href)
    const png = new Uint8Array(await S.rec.assets['sprites/GHOST.png'].arrayBuffer())
    const stale0 = (await S.staleSources()).length
    // Edit the source (any change of bytes), and it is stale.
    S.rec.assets['sources/sprites/GHOST.tsprite'] = new Blob([bytes, new Uint8Array([0])])
    const stale1 = (await S.staleSources()).map((x) => x.why)
    S.rec.assets['sources/sprites/GHOST.tsprite'] = new Blob([bytes])
    const again = await S.bakeSource('file:tsprite', 'GHOST')
    const emitted = await S.emitAll()
    const out = {
      ok: b.ok, ms, worker: !!S.baker.w, png: await sha256(png), sheet: S.sheets.has('GHOST'), record: S.module.sprites?.GHOST?.animations?.length ?? 0,
      stale0, stale1, cached: again.said, files: emitted ? emitted.files.map((f) => f.path).filter((p) => /GHOST/.test(p)) : null
    }
    delete S.rec.assets['sources/sprites/GHOST.tsprite']; delete S.rec.assets['sprites/GHOST.png']; delete S.rec.assets['sprites/GHOST.json']
    delete S.module.sprites.GHOST; delete S.module.baked['sources/sprites/GHOST.tsprite']; S.sheets.delete('GHOST'); S.moduleChanged()
    return out
  })
  check(r.ok && r.worker, `a sprite source bakes, in a Worker (${Math.round(r.ms)} ms)`)
  check(r.png === nodePng, 'the page bakes the same bytes as node')
  check(r.sheet && r.record > 0, 'the baked sheet is the module\'s at once, with its animations')
  check(r.stale0 === 0 && JSON.stringify(r.stale1) === '["changed"]', 'a source changed after its bake is stale; one just baked is not')
  check(r.cached === 'GHOST', 'baking the same source again comes from the cache')
  check(JSON.stringify(r.files?.sort()) === JSON.stringify(['assets/sprites/GHOST.json', 'assets/sprites/GHOST.png', 'sources/sprites/GHOST.tsprite']), `Play writes the baked sheet and keeps its source beside it (${JSON.stringify(r.files)})`)
}

// THREESPRITE, bundled (studio/plugins/threesprite): a sprite project opened
// from the Sprites page, edited in ThreeSprite's own store, brought back
// re-baked; one undo puts the old sheet back.
if (await page.evaluate(() => window.__studio.plugins.plugins.has('threesprite'))) {
  await page.evaluate(async () => {
    const S = window.__studio
    const bytes = new Uint8Array(await (await fetch(new URL('test/fixtures/spirit.tsprite', location.href.replace(/#.*$/, '')))).arrayBuffer())
    S.rec.assets['sources/sprites/SPIRIT.tsprite'] = new Blob([bytes])
    await S.bakeSource('file:tsprite', 'SPIRIT')
    S.moduleChanged()
    S.go('sprites', 'SPIRIT')
  })
  await page.waitForSelector('[data-edit-in="threesprite/main"]')
  check(true, 'a sheet baked from its project offers "edit in ThreeSprite"')
  await page.click('[data-edit-in="threesprite/main"]')
  const ts = await (await page.waitForSelector('iframe.sx-frame')).contentFrame()
  // Until the studio's document arrives, ThreeSprite shows a blank project of its own: wait for the file.
  await ts.waitForFunction(() => window.__editorStore?.getState().source.path === 'SPIRIT.tsprite', { timeout: 60000 })
  check(await ts.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'ThreeSprite comes up styled (its stylesheet is served as CSS)')
  await ts.evaluate(() => window.__editorStore.getState().commit('suite test', (d) => { d.animations[d.animationOrder[0]].name = 'suite_edit' }))
  await page.waitForFunction(() => document.querySelector('.sx-status')?.textContent === 'changed', { timeout: 10000 })
  await page.click('[data-action="editor-back"]')
  await page.waitForFunction(() => !document.querySelector('.sx-editor'), { timeout: 30000 })
  check((await page.evaluate(() => window.__studio.module.sprites.SPIRIT.animations[0])) === 'suite_edit', 'an edit in ThreeSprite comes back baked into the sheet')
  await page.evaluate(() => window.__studio.undoHere())
  await settle(500)
  check((await page.evaluate(() => window.__studio.module.sprites.SPIRIT.animations[0])) === 'idle', 'and one undo puts the sheet back as it was')
  await page.evaluate(() => { const S = window.__studio; for (const k of ['sources/sprites/SPIRIT.tsprite', 'sprites/SPIRIT.png', 'sprites/SPIRIT.json']) delete S.rec.assets[k]; delete S.module.sprites.SPIRIT; S.sheets.delete('SPIRIT'); S.moduleChanged() })
}

// DIGIDREAMSOUND, bundled (studio/plugins/sfx): a sound pack opened from the
// Sounds page, a sound renamed in the tool's own store, Back writes the pack
// and the module's merged sounds have the new name.
if (await page.evaluate(() => window.__studio.plugins.plugins.has('sfx'))) {
  await page.evaluate(async () => {
    const S = window.__studio
    const t = await (await fetch('plugins/sfx/app/content/banks/starter.sfxproj')).text()
    S.module.sounds ??= { packs: [] }
    S.module.sounds.packs.push({ id: 'test-pack', name: 'starter', enabled: true })
    S.rec.assets['sources/sounds/test-pack.sfxproj'] = new Blob([t])
    await S.loadPacks(); S.moduleChanged(); S.go('sounds')
  })
  await page.waitForSelector('[data-pack="test-pack"] [data-edit-in="sfx/bank"]')
  await page.click('[data-pack="test-pack"] [data-edit-in="sfx/bank"]')
  const sx = await (await page.waitForSelector('iframe.sx-frame')).contentFrame()
  await sx.waitForFunction(() => window.__sfx?.store?.path === 'starter.sfxproj', { timeout: 60000 })
  check(await sx.evaluate(() => getComputedStyle(document.querySelector('[data-act="open"]')).display === 'none'), 'the sound tool hides its Open: the file is the suite\'s')
  await sx.evaluate(() => window.__sfx.store.mutate('rename', (d) => { d.sounds[0].name = 'suite.edit' }))
  await page.waitForFunction(() => document.querySelector('.sx-status')?.textContent === 'changed', { timeout: 10000 })
  await page.click('[data-action="editor-back"]')
  await page.waitForFunction(() => !document.querySelector('.sx-editor'), { timeout: 30000 })
  check(await page.evaluate(() => window.__studio.moduleSounds.includes('suite.edit')), 'a sound renamed in DigidreamSound is the module\'s, merged, after Back')
  await page.evaluate(() => { const S = window.__studio; S.module.sounds.packs = S.module.sounds.packs.filter((x) => x.id !== 'test-pack'); delete S.rec.assets['sources/sounds/test-pack.sfxproj']; S.loadPacks(); S.moduleChanged() })
}

// QPAINTER, bundled (studio/plugins/qpainter): a module texture opened from the
// Textures page, painted on, brought back as a qPainter project -- kept as the
// texture's source -- and the picture baked from it; undo puts the PNG back.
if (await page.evaluate(() => window.__studio.plugins.plugins.has('qpainter'))) {
  await page.evaluate(async () => {
    const S = window.__studio
    const blob = await (await fetch('/textures/ROCKWALL1.png')).blob()
    const bmp = await createImageBitmap(blob)
    S.module.textures ??= {}; S.module.textures.QPTEST = { w: bmp.width, h: bmp.height }
    S.rec.assets['textures/QPTEST.png'] = blob; S.imageUrls.set('QPTEST', URL.createObjectURL(blob)); S.moduleChanged()
    S.go('textures', 'QPTEST')
  })
  await page.waitForSelector('[data-edit-in="qpainter/texture"]')
  await page.click('[data-edit-in="qpainter/texture"]')
  const qp = await (await page.waitForSelector('iframe.sx-frame')).contentFrame()
  await qp.waitForFunction(() => window.qpainterEmbed && document.querySelector('#docname')?.textContent.startsWith('QPTEST'), { timeout: 60000 })
  check(await qp.evaluate(() => getComputedStyle(document.querySelector('#open')).display === 'none'), 'qPainter hides its Open: the texture is the suite\'s')
  const box = await (await qp.$('canvas')).boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForFunction(() => document.querySelector('.sx-status')?.textContent === 'changed', { timeout: 10000 })
  await page.click('[data-action="editor-back"]')
  await page.waitForFunction(() => !document.querySelector('.sx-editor'), { timeout: 30000 })
  const t = await page.evaluate(() => { const S = window.__studio; return { src: !!S.rec.assets['sources/textures/QPTEST.texproj.json'], baked: S.module.baked?.['sources/textures/QPTEST.texproj.json']?.baker, w: S.module.textures.QPTEST.w } })
  check(t.src && t.baked === 'texproj' && t.w === 256, `a texture painted in qPainter comes back as its project, and the picture is baked from it (${JSON.stringify(t)})`)
  await page.evaluate(() => window.__studio.undoHere())
  await settle(500)
  check(await page.evaluate(() => !window.__studio.rec.assets['sources/textures/QPTEST.texproj.json']), 'one undo puts the PNG back as it was')
  await page.evaluate(() => { const S = window.__studio; delete S.module.textures.QPTEST; for (const k of Object.keys(S.rec.assets)) if (k.includes('QPTEST')) delete S.rec.assets[k]; S.moduleChanged() })
}

// THE DAW, bundled (studio/plugins/daw): a song kept as its project opens in
// the DAW from the Music page; the plugin's baker (a Worker, outside the audio
// thread) makes the same .mstk bytes as the DAW's own Bake; an edit comes back
// as the project and is baked when asked for, not before.
if (await page.evaluate(() => window.__studio.plugins.plugins.has('daw'))) {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const song = readFileSync(fileURLToPath(new URL('../../midisynth/content/music/dreamy_dnb.msproj', import.meta.url)), 'utf8')
  await page.evaluate((text) => { const S = window.__studio; S.rec.assets['sources/music/dreamy.msproj'] = new Blob([text]); S.moduleChanged(); S.go('music') }, song)
  await page.waitForSelector('[data-track="dreamy"] [data-edit-in="daw/track"]')
  await page.click('[data-track="dreamy"] [data-edit-in="daw/track"]')
  const dw = await (await page.waitForSelector('iframe.sx-frame')).contentFrame()
  await dw.waitForFunction(() => window.__daw?.store?.p?.name === 'dreamy dnb', { timeout: 60000 })
  const own = await dw.evaluate(async () => {
    const { bakeProject } = await import('./daw/export.js')
    const bytes = new Uint8Array(await bakeProject(window.__daw.ctx, { name: 'dreamy' }))
    const d = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
  })
  const ours = await page.evaluate(async (text) => {
    const S = window.__studio
    const r = await S.baker.bake('file:msproj', 'dreamy', new TextEncoder().encode(text))
    const d = await crypto.subtle.digest('SHA-256', r.files['music/dreamy.mstk'])
    return { hash: [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''), worker: !!S.baker.w, baker: r.baker }
  }, song)
  check(ours.baker === 'daw/mstk' && ours.worker && ours.hash === own, `the DAW plugin's baker, in a Worker, makes the DAW's own .mstk bytes (${ours.hash.slice(0, 12)} vs ${own.slice(0, 12)})`)
  await dw.evaluate(() => window.__daw.store.mutate('suite test', (p) => { p.name = 'dreamy edited' }))
  await page.waitForFunction(() => document.querySelector('.sx-status')?.textContent === 'changed', { timeout: 10000 })
  await page.click('[data-action="editor-back"]')
  await page.waitForFunction(() => !document.querySelector('.sx-editor'), { timeout: 30000 })
  const m = await page.evaluate(async () => { const S = window.__studio; return { name: JSON.parse(await S.rec.assets['sources/music/dreamy.msproj'].text()).name, baked: !!S.rec.assets['music/dreamy.mstk'], stale: (await S.staleSources()).map((x) => x.why) } })
  check(m.name === 'dreamy edited' && !m.baked && JSON.stringify(m.stale) === '["never baked"]', `an edit in the DAW comes back as the project, not baked until asked (${JSON.stringify(m)})`)
  await page.click('[data-track="dreamy"] button:nth-of-type(2)')
  await page.waitForFunction(() => !!window.__studio.rec.assets['music/dreamy.mstk'], { timeout: 30000 })
  check(await page.evaluate(() => window.__studio.trackUrls.has('dreamy')), '"bake now" makes the track, and the Music page can play it')
  // With no baker (the DAW plugin off, or a studio built without plugins), a
  // track baked from these very bytes stands; one edited since still needs it.
  const noBaker = await page.evaluate(async () => {
    const S = window.__studio
    S.plugins.setEnabled('daw', false)
    const unchanged = (await S.staleSources()).filter((x) => x.key === 'dreamy').map((x) => x.why)
    const all = await S.bakeAll()
    const was = S.rec.assets['sources/music/dreamy.msproj']
    const p = JSON.parse(await was.text()); p.name = 'dreamy, edited again'
    S.rec.assets['sources/music/dreamy.msproj'] = new Blob([JSON.stringify(p)], { type: 'application/json' })
    const edited = (await S.staleSources()).filter((x) => x.key === 'dreamy').map((x) => x.why)
    S.rec.assets['sources/music/dreamy.msproj'] = was
    S.plugins.setEnabled('daw', true)
    return { unchanged, ok: all.ok, edited }
  })
  check(!noBaker.unchanged.length && noBaker.ok, `with no music baker, a track baked from the same project stands and Play goes on (${JSON.stringify(noBaker)})`)
  check(JSON.stringify(noBaker.edited) === '["nothing here bakes it"]', `CONTROL: and one edited since is still named as needing a baker (${JSON.stringify(noBaker.edited)})`)
  await page.evaluate(() => { const S = window.__studio; for (const k of Object.keys(S.rec.assets)) if (k.includes('dreamy')) delete S.rec.assets[k]; delete S.module.baked?.['sources/music/dreamy.msproj']; S.trackUrls.delete('dreamy'); S.moduleChanged() })
}

// THE PACKAGER, bundled as a rail page (studio/plugins/packager): it opens
// with the studio's module already in -- baked and packed by the studio -- so
// there is nothing to pick. (Building a game needs the engine kits; the
// packager's own tests do that.)
if (await page.evaluate(() => window.__studio.plugins.plugins.has('packager'))) {
  await page.evaluate(() => window.__studio.go('p-packager-package'))
  const pk = await (await page.waitForSelector('iframe.sx-section')).contentFrame()
  await pk.waitForFunction(() => /level\(s\)/.test(document.getElementById('mod-summary')?.textContent ?? ''), { timeout: 120000 })
  const summary = await pk.evaluate(() => document.getElementById('mod-summary').textContent)
  const id = await page.evaluate(() => window.__studio.module.id)
  check(summary.includes(`(${id})`), `the Package page has the studio's module without picking it (${summary.trim()})`)
  // ITS SAVE GOES THROUGH THE STUDIO (the `share` query), which saves where its
  // own Export does -- here, a browser download. The packager's own fallback,
  // a link in its frame, went nowhere in an Android WebView.
  {
    const { mkdtempSync, readdirSync, readFileSync: readF, existsSync: exists } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join: pjoin } = await import('node:path')
    const dir = mkdtempSync(pjoin(tmpdir(), 'dnp-share-'))
    const cdp = await page.target().createCDPSession()
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir })
    const said = await pk.evaluate(() => window.packagerHost.save(new Uint8Array([80, 75, 3, 4, 42]), 'game-test.apk'))
    let got = null
    for (let i = 0; i < 40 && !got; i++) { await settle(250); if (exists(pjoin(dir, 'game-test.apk'))) got = readF(pjoin(dir, 'game-test.apk')) }
    check(said === 'game-test.apk' && got && got.length === 5 && got[4] === 42, `the packager's save reaches the studio and the file is saved (${said}; ${readdirSync(dir).join(', ') || 'nothing'})`)
  }
  await page.evaluate(() => window.__studio.go('home'))
}

// CODE (studio/plugins/code), the example record editor: "open with…" lists
// it beside the Scripts page; its block check reaches the studio's bar.
if (await page.evaluate(() => window.__studio.plugins.plugins.has('code'))) {
  await page.evaluate(() => { localStorage.removeItem('dnp.studio.editor.record:script'); window.__studio.go('scripts', 'echo_test.lua') })
  await page.waitForSelector('[data-open-with="record:script"]')
  await page.click('[data-open-with="record:script"]')
  await page.waitForSelector('.sx-choose [data-answer="code/lua"]')
  await page.click('.sx-choose [data-answer="code/lua"]')
  const cf = await (await page.waitForSelector('iframe.sx-frame')).contentFrame()
  await cf.waitForFunction(() => document.getElementById('name')?.textContent === 'echo_test.lua', { timeout: 30000 })
  await cf.evaluate(() => { const t = document.getElementById('text'); t.value = 'function broken()\n  print(1)\n'; t.dispatchEvent(new Event('input')) })
  await page.waitForFunction(() => /1 problem/.test(document.querySelector('.sx-status')?.textContent ?? ''), { timeout: 10000 })
  check(true, 'an unclosed function in Code shows as a problem in the studio\'s bar')
  await cf.evaluate(() => { const t = document.getElementById('text'); t.value = 'function fixed()\n  print(1)\nend\n'; t.dispatchEvent(new Event('input')) })
  await page.click('[data-action="editor-back"]')
  await page.waitForFunction(() => !document.querySelector('.sx-editor'), { timeout: 30000 })
  check(await page.evaluate(() => window.__studio.module.scripts['echo_test.lua']) === 'function fixed()\n  print(1)\nend\n', 'Back from Code saves the script')
  check(await page.evaluate(() => localStorage.getItem('dnp.studio.editor.record:script')) === 'code/lua', 'the choice of editor is kept for the next script')
  await page.evaluate(() => localStorage.removeItem('dnp.studio.editor.record:script'))
}

// INSTALLING LATER (src/plugins/install.js, sw.js): a .dnpplugin made here
// from the Code plugin under another id is installed (one question), edits a
// script at once, is still there after a reload (the service worker serves it
// from Cache Storage), and uninstalls. A broken package is refused, saying why.
if (await page.evaluate(() => window.__studio.canInstall)) {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { writePack } = await import('../src/pack.js')
  const dir = fileURLToPath(new URL('../plugins/code/', import.meta.url))
  const json = JSON.parse(readFileSync(dir + 'plugin.json', 'utf8'))
  json.id = 'code-x'; json.name = 'Code X'; json.version = '0.2.0'; json.author = 'the test'
  const entries = readdirSync(dir).filter((f) => f !== 'plugin.json').map((f) => ({ path: `code-x/${f}`, bytes: new Uint8Array(readFileSync(dir + f)) }))
  entries.push({ path: 'code-x/plugin.json', bytes: new TextEncoder().encode(JSON.stringify(json)) })
  const zip = await writePack(entries)
  const broken = await writePack(entries.filter((e) => !e.path.endsWith('index.html')))
  const tryInstall = async (bytes, answer) => {
    const done = page.evaluate((b) => window.__studio.installPluginBytes(new Uint8Array(b)), [...bytes])
    if (answer) { await page.waitForSelector('dialog.st-dialog button[value="ok"]'); await page.click('dialog.st-dialog button[value="ok"]') }
    return done
  }
  check(await tryInstall(broken, false) === false && /index.html is named in plugin.json but is not in the package/.test(await page.evaluate(() => window.__studio.ui.status.textContent)), 'a package missing a file its plugin.json names is refused, saying which')
  check(await tryInstall(zip, true) === true, 'a .dnpplugin installs after one question')
  check(await page.evaluate(() => window.__studio.plugins.editor('code-x/lua')?.url.includes('/x/code-x@0.2.0/')), 'its editor is offered at once, served from x/code-x@0.2.0/')
  await page.evaluate(() => window.__studio.go('edit', 'code-x/lua~record:script~echo_test.lua'))
  const xf = await (await page.waitForSelector('iframe.sx-frame')).contentFrame()
  await xf.waitForFunction(() => document.getElementById('name')?.textContent === 'echo_test.lua', { timeout: 30000 })
  await xf.evaluate(() => { const t = document.getElementById('text'); t.value = '-- from an installed plugin\n'; t.dispatchEvent(new Event('input')) })
  await page.click('[data-action="editor-back"]')
  await page.waitForFunction(() => !document.querySelector('.sx-editor'), { timeout: 30000 })
  check(await page.evaluate(() => window.__studio.module.scripts['echo_test.lua']) === '-- from an installed plugin\n', 'an installed editor edits and hands back like a bundled one')
  await page.reload()
  await page.waitForFunction(() => window.__studio?.router?.current, { timeout: 60000 })
  check(await page.evaluate(() => window.__studio.plugins.plugins.get('code-x')?.source === 'installed'), 'after a reload it is still installed')
  await page.evaluate(() => window.__studio.go('plugins'))
  await page.waitForSelector('[data-plugin="code-x"] button.st-danger')
  await page.click('[data-plugin="code-x"] button.st-danger')
  await page.waitForSelector('dialog.st-dialog button[value="ok"]')
  await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click('dialog.st-dialog button[value="ok"]')])
  await page.waitForFunction(() => window.__studio?.router?.current, { timeout: 60000 })
  check(await page.evaluate(() => !window.__studio.plugins.plugins.has('code-x')), 'uninstalled, and gone after the reload it asks for')
} else console.log('  (no service worker here: installing is not checked)')

// Clean up the test's script.
await page.evaluate(() => { const S = window.__studio; delete S.module.scripts['echo_test.lua']; S.moduleChanged(); localStorage.removeItem('dnp.studio.devPlugins') })
check(errors.length === 0, `no page errors (${errors.join('; ')})`)
await browser.close()
console.log(`plugins.page: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
