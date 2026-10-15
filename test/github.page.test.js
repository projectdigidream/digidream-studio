//
// THE GITHUB SYNC PLUGIN IN A REAL STUDIO (plugins/github), with every request
// to api.github.com answered by the fake GitHub (github_fake.js) through
// request interception: connect on the Sync page, the open module goes up, an
// edit in the studio follows by itself, a commit from "another device" comes
// into the open module, a conflict is settled on the page, and a module only
// on GitHub is brought here with Get. Opt-in, like the other page tests:
//
//   DNP_STUDIO_PAGE_TEST=1 STUDIO_URL=http://localhost:8093/studio/ \
//     NODE_PATH=<dir with puppeteer-core>/node_modules node studio/test/github.page.test.js
//
if (!process.env.DNP_STUDIO_PAGE_TEST) { console.log('github.page: 0 checks, 0 failures (set DNP_STUDIO_PAGE_TEST=1 to run)'); process.exit(0) }
import { createRequire } from 'node:module'
import { FakeGitHub } from './github_fake.js'
let puppeteer
try { puppeteer = createRequire(import.meta.url)('puppeteer-core') } catch {
  try { puppeteer = (await import('puppeteer-core')).default } catch { console.log('github.page: skipped (no puppeteer-core; set NODE_PATH)'); process.exit(0) }
}
const URL_ = process.env.STUDIO_URL ?? 'http://localhost:8093/studio/'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v = null; try { v = await fn() } catch {} if (v) return v; await settle(150) } return null }

const fake = new FakeGitHub({ token: 'github_pat_test', repo: 'me/modules', login: 'me' })
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type, X-GitHub-Api-Version', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE' }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.setRequestInterception(true)
page.on('request', async (req) => {
  const u = req.url()
  if (!u.startsWith('https://api.github.com/')) return req.continue()
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS })
  const r = await fake.handle(u, { method: req.method(), headers: req.headers().authorization ? { Authorization: req.headers().authorization } : {}, body: req.postData() })
  req.respond({ status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: await r.text() })
})

await page.goto(URL_)
await page.waitForFunction(() => window.__studio?.router?.current && window.__studio.rec, { timeout: 60000 })
const S = (fn, ...a) => page.evaluate(fn, ...a)
// By selector at the moment of the click: the page redraws, and a handle can go stale.
const click = (fr, sel) => fr.evaluate((s) => { const b = document.querySelector(s); if (!b) throw new Error(`no ${s}`); b.click() }, sel)
const id = await S(() => window.__studio.rec.id)

check(await until(() => S(() => !!document.querySelector('iframe[data-service="github/sync"]')?.contentWindow?.__githubSync)), 'the sync service runs in the background, hidden')

// CONNECT on the Sync page.
await S(() => window.__studio.go('p-github-sync'))
const sec = async () => (await (await page.waitForSelector('iframe.sx-section')).contentFrame())
let f = await sec()
await f.waitForSelector('[data-action="continue"]', { timeout: 30000 })
await click(f, '[data-action="continue"]')
check(/token/i.test(await f.$eval('.err', (e) => e.textContent).catch(() => '')), 'Continue with no token says what is missing')
await f.type('[data-field="token"]', 'wrong')
await click(f, '[data-action="continue"]')
await f.waitForFunction(() => /refused the token/.test(document.querySelector('.err')?.textContent ?? ''), { timeout: 10000 }).catch(() => {})
check(/refused the token/.test(await f.$eval('.err', (e) => e.textContent).catch(() => '')), 'a wrong token is refused, saying so')
await f.$eval('[data-field="token"]', (e) => { e.value = '' })
await f.type('[data-field="token"]', 'github_pat_test')
await click(f, '[data-action="continue"]')

// THE REPOSITORY: the ones the token can write to are listed, one it cannot
// is not; a new one is made here.
fake.addRepo('me/old-game', { isPrivate: false })
fake.addRepo('someone/theirs', { push: false })
await f.waitForSelector('[data-repo="me/modules"]', { timeout: 20000 })
const listed = await f.$$eval('[data-repo]', (els) => els.map((e) => e.dataset.repo))
check(listed.includes('me/modules') && listed.includes('me/old-game') && !listed.includes('someone/theirs'), `the token's repositories are listed, only ones it can write to (${listed})`)
check(await f.$eval('[data-field="name"]', (e) => e.value) === 'digidream-modules', 'a new one is offered a free name')
check(!/\bnull\b|undefined/.test(await f.evaluate(() => document.body.innerText)), 'nothing on the page reads null or undefined')
await f.$eval('[data-field="name"]', (e) => { e.value = 'modules'; e.dispatchEvent(new Event('input')) })
await click(f, '[data-action="create"]')
await f.waitForFunction(() => /already a repository called modules/.test(document.querySelector('.err')?.textContent ?? ''), { timeout: 10000 }).catch(() => {})
check(/already a repository called modules/.test(await f.$eval('.err', (e) => e.textContent).catch(() => '')), 'a taken name is refused, saying so')
fake.canCreate = false
await f.$eval('[data-field="name"]', (e) => { e.value = 'fresh'; e.dispatchEvent(new Event('input')) })
await click(f, '[data-action="create"]')
await f.waitForFunction(() => /Administration/.test(document.querySelector('.err')?.textContent ?? ''), { timeout: 10000 }).catch(() => {})
check(/Administration/.test(await f.$eval('.err', (e) => e.textContent).catch(() => '')), 'a token that may not create repositories is told which permission it lacks')
check(!fake.meta.has('me/fresh'), '...and nothing was made')
fake.canCreate = true
await click(f, '[data-repo="me/modules"] [data-action="use"]')
await f.waitForSelector('[data-action="disconnect"]', { timeout: 20000 })
check(true, 'Use connects to a listed repository')
check(!(await f.evaluate(() => document.body.textContent.includes('github_pat_test'))), 'the token is not shown on the page')

// THE OPEN MODULE GOES UP.
// From here the Sync page is looked up afresh each time: a pull into the open
// module re-mounts it.
const up = await until(() => fake.read('main', id)['module.studio.json'])
check(!!up && JSON.parse(up).id === id, `the open module goes up to GitHub (${Object.keys(fake.read('main', id)).length} files)`)
check(await until(async () => (await sec()).evaluate((m) => document.querySelector(`[data-module="${m}"] [data-state="ok"]`), id)), 'its row says synced')
check(await until(() => S(() => window.__studio.shell.moduleStatus?.level === 'ok')), `and the studio wears the badge (${JSON.stringify(await S(() => window.__studio.shell.moduleStatus))})`)
check(fake.log()[0].includes(`${id}:`) && fake.log()[0].includes('From the studio on'), `one commit for it (${JSON.stringify(fake.log()[0].split('\n')[0])})`)

// AN EDIT IN THE STUDIO FOLLOWS BY ITSELF (a few seconds after the save).
await S(() => { const St = window.__studio; St.module.name = 'Renamed on this device'; St.moduleChanged() })
check(await until(() => /Renamed on this device/.test(fake.read('main', id)['module.studio.json'] ?? ''), 30000), 'an edit in the studio reaches GitHub without asking')

// A COMMIT FROM ANOTHER DEVICE COMES INTO THE OPEN MODULE.
{
  const m = JSON.parse(fake.read('main', id)['module.studio.json'])
  m.name = 'Renamed on the phone'
  fake.writeFiles('main', { [`${id}/module.studio.json`]: JSON.stringify(m, null, 2) + '\n' }, `${id}: from the phone`)
  await click(await sec(), '[data-action="sync-all"]')
  check(await until(() => S(() => window.__studio.module.name === 'Renamed on the phone')), 'a commit from another device comes into the open module, in place')
  check(await S(() => window.__studio.route()) === 'p-github-sync', 'the Sync page is still the page shown')
  check((await until(() => S(async () => (await window.__studio.store.load(window.__studio.rec.id))?.module?.name === 'Renamed on the phone'))), '...and is saved')
}

// A CONFLICT, SETTLED ON THE PAGE.
{
  // Both sides edit module.studio.json; the local save is made to sync at once.
  const m = JSON.parse(fake.read('main', id)['module.studio.json'])
  m.name = 'GitHub wins'
  fake.writeFiles('main', { [`${id}/module.studio.json`]: JSON.stringify(m, null, 2) + '\n' }, `${id}: elsewhere`)
  await S(() => { const St = window.__studio; St.module.name = 'Mine'; St.moduleChanged() })
  await settle(900)
  await click(await sec(), `[data-module="${id}"] [data-action="sync"]`)
  check(!!(await until(async () => (await sec()).$(`[data-conflict="${id}"]`))), 'the same file changed here and on GitHub shows a choice')
  check(await S(() => window.__studio.module.name) === 'Mine', 'and nothing here was touched while it waits')
  check(await until(() => S(() => window.__studio.shell.moduleStatus?.level === 'warn')), 'the badge says it needs a look')
  check(await (await sec()).$eval('[data-action="resolve"]', (b) => b.disabled), '"Keep these" waits for a choice')
  await click(await sec(), '[data-action="keep-remote"]')
  await click(await sec(), '[data-action="resolve"]')
  check(await until(() => S(() => window.__studio.module.name === 'GitHub wins')), 'kept GitHub\'s: the module takes it')
  const snaps = await S(async () => (await window.__studio.snaps.list(window.__studio.rec.id)).map((s) => s.reason))
  check(snaps.some((l) => /before sync from GitHub sync/.test(l)), `this device's version is in the Snapshots (${snaps.slice(0, 3).join('; ')})`)
}

// A MODULE ONLY ON GITHUB: Get.
{
  const files = fake.read('main', id)
  const m = JSON.parse(files['module.studio.json'])
  m.id = 'from-github'; m.name = 'From GitHub'
  const put = {}
  for (const [p, v] of Object.entries(files)) put[`from-github/${p}`] = p === 'module.studio.json' ? JSON.stringify(m, null, 2) + '\n' : v
  fake.writeFiles('main', put, 'from-github: another device')
  await until(async () => (await sec()).evaluate(() => !!globalThis.__githubPage))
  await (await sec()).evaluate(() => globalThis.__githubPage.refreshRemote())
  await (await sec()).waitForSelector('[data-remote="from-github"] [data-action="get"]', { timeout: 10000 })
  await click(await sec(), '[data-remote="from-github"] [data-action="get"]')
  check(await until(() => S(async () => (await window.__studio.pluginQuery('modules')).some((x) => x.id === 'from-github'))), 'Get brings a module that was only on GitHub')
  check(await until(async () => (await sec()).evaluate(() => !document.querySelector('[data-remote="from-github"]') && !!document.querySelector('[data-module="from-github"] input[data-track]:checked'))), 'and it moves to this device\'s list, synced from then on')
}

// CHANGE REPOSITORY to a new one made here: the modules that synced go there.
{
  await click(await sec(), '[data-action="change-repo"]')
  await (await sec()).waitForSelector('[data-action="create"]', { timeout: 20000 })
  await (await sec()).$eval('[data-field="name"]', (e) => { e.value = 'second-home'; e.dispatchEvent(new Event('input')) })
  await click(await sec(), '[data-action="create"]')
  check(await until(() => fake.meta.get('me/second-home')?.private === true), 'Create makes a private repository')
  check(await until(() => fake.read('main', id, 'me/second-home')['module.studio.json']), 'and the synced modules go up to it')
  check(await until(async () => (await sec()).evaluate(() => document.querySelector('.name button.link')?.textContent === 'me/second-home')), 'the page says which repository it syncs with now')
}

// THE GITHUB LINKS: in a browser, a new tab, opened inside the click (a tab
// opened by the studio after the message would be blocked as a popup).
{
  const tab = browser.waitForTarget((t) => t.url().startsWith('https://github.com/me/second-home'), { timeout: 10000 }).catch(() => null)
  await click(await sec(), '.name button.link')
  check(!!(await tab), 'the repository link opens GitHub in a new tab')
}

check(errors.length === 0, `no page errors (${errors.join('; ')})`)
await browser.close()
console.log(`github.page: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
