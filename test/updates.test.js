// IS THERE A NEWER STUDIO (src/updates.js): the release's tag read as a
// version, compared part by part; the answer kept for hours, asked again when
// forced; offline or refused is "could not check", with the last answer kept.
//
//   node studio/test/updates.test.js
//
// House style: standalone, prints ok/FAIL, ends with a count.

import { versionOfTag, compareVersions, whatChanged, checkForUpdate } from '../src/updates.js'

const name = 'updates'
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }

check(versionOfTag('studio-v0.3.1') === '0.3.1' && versionOfTag('v0.1.1.1') === '0.1.1.1' && versionOfTag('0.4.0') === '0.4.0', 'a tag names its version')
check(versionOfTag('nightly') === null && versionOfTag('') === null && versionOfTag(undefined) === null, 'CONTROL: a tag naming no version names none')
check(compareVersions('0.3.2', '0.3.1') === 1 && compareVersions('0.3.1', '0.3.1') === 0 && compareVersions('0.10.0', '0.9.9') === 1, 'versions compare part by part, as numbers (0.10 > 0.9)')
check(compareVersions('0.1.1.1', '0.1.1') === 1 && compareVersions('0.3', '0.3.0') === 0, 'a fourth part counts; a missing part is 0')

const body = '## Digidream Studio 0.3.2\n\nThe editor.\n\n### Before you open it\n\n- **macOS**: open anyway\n\n### What changed\n\n#### Fixed\n\n- **A first room** was invisible: new\n  rooms had no `textures`.\n- Play shows its steps.\n\n### Changes since studio-v0.3.1\n\n- a commit\n'
const notes = whatChanged(body)
check(notes.length === 2 && notes[0] === 'A first room was invisible: new rooms had no textures.' && notes[1] === 'Play shows its steps.', `"What changed" is read as plain lines, wrapped lines joined (${JSON.stringify(notes)})`)
check(whatChanged('## x\n\n### Changes\n\n- a commit').length === 0, 'CONTROL: notes without "What changed" give nothing (not the commit list)')

const memory = () => { let v = null; return { get: () => v, set: (x) => { v = x } } }
let asked = 0
const github = (tag, status = 200) => async () => { asked++; return { ok: status === 200, status, json: async () => ({ tag_name: tag, html_url: `https://github.com/x/releases/tag/${tag}`, body }) } }

{
  const store = memory(); asked = 0
  const a = await checkForUpdate('0.3.1', { fetchFn: github('studio-v0.3.2'), store, now: 1000 })
  check(a.state === 'newer' && a.latest === '0.3.2' && a.url.endsWith('studio-v0.3.2') && a.notes.length === 2, `a later release is newer, with its page and notes (${a.state} ${a.latest})`)
  const b = await checkForUpdate('0.3.1', { fetchFn: github('studio-v0.3.3'), store, now: 1000 + 3600e3 })
  check(b.latest === '0.3.2' && asked === 1, 'asked again an hour later: the kept answer, GitHub not asked')
  const c = await checkForUpdate('0.3.1', { fetchFn: github('studio-v0.3.3'), store, now: 1000 + 3600e3, force: true })
  check(c.latest === '0.3.3' && asked === 2, '"check now" asks GitHub whatever was kept')
  const d = await checkForUpdate('0.3.1', { fetchFn: github('studio-v0.3.4'), store, now: 1000 + 3600e3 + 7 * 3600e3 })
  check(d.latest === '0.3.4' && asked === 3, 'after six hours it asks again')
}
{
  const r = await checkForUpdate('0.3.1', { fetchFn: github('studio-v0.3.1'), store: memory(), now: 1 })
  check(r.state === 'current', 'the same version is current')
  const older = await checkForUpdate('0.4.0', { fetchFn: github('studio-v0.3.1'), store: memory(), now: 1 })
  check(older.state === 'current', 'CONTROL: a studio newer than the latest release (a build from source) is not told to go back')
}
{
  const store = memory()
  await checkForUpdate('0.3.1', { fetchFn: github('studio-v0.3.2'), store, now: 1 })
  const off = await checkForUpdate('0.3.1', { fetchFn: async () => { throw new Error('offline') }, store, now: 1 + 9 * 3600e3 })
  check(off.state === 'newer' && off.error === 'offline', `offline, the last answer still stands, and the error is said (${off.state}, ${off.error})`)
  const limited = await checkForUpdate('0.3.1', { fetchFn: github('x', 403), store: memory(), now: 1 })
  check(limited.state === 'unknown' && /rate limit/.test(limited.error), `refused by GitHub with nothing kept: unknown, and why (${limited.error})`)
}

console.log(`\n${name}: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
