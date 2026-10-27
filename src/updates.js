// IS THERE A NEWER STUDIO? Asked of the studio's GitHub releases.
//
// The newest release of projectdigidream/digidream-studio ON MAIN, by GitHub's
// API (which a page may read from anywhere), compared with this studio's
// version. Releases are made on dev too since 2026-10-19; one whose tag main
// does not contain is a development build, never offered to a main build. A
// development build (four parts) is offered the newest of either. On Android
// either kind installs what it is offered in place (home.js, the shell's
// selfUpdate) -- so a stable build only ever installs a stable release.
// Asked at most every few hours: the answer is kept, per device, with when it
// was asked -- GitHub allows a visitor sixty questions an hour, and a studio
// opened ten times a day needs one. Never in the way: offline, rate-limited or
// refused, the answer is "could not check" and nothing else happens.
//
// Pure apart from `fetchFn` and `store`, which the tests replace.

const REPO_API = 'https://api.github.com/repos/projectdigidream/digidream-studio'
export const RELEASES_API = `${REPO_API}/releases?per_page=20`
/** Is the tag on main? GitHub's compare of main with it: 'identical' or 'behind' means main holds it. */
export const COMPARE_API = (tag) => `${REPO_API}/compare/main...${encodeURIComponent(tag)}`
export const RELEASES_PAGE = 'https://github.com/projectdigidream/digidream-studio/releases/latest'
// The tutorials, on the public site (tutorials/): the help the studio points to.
export const TUTORIALS_URL = 'https://projectdigidream.github.io/tutorials/'
const KEY = 'dnp.studio.update'
const EVERY_MS = 6 * 3600 * 1000

/** The version a studio tag names: 'studio-v0.3.1' -> '0.3.1'; null if it names none. */
export function versionOfTag (tag) {
  const m = /^(?:studio-)?v?(\d+(?:\.\d+){1,3})$/.exec(String(tag ?? '').trim())
  return m ? m[1] : null
}

/** A development build (the dev branch): four parts, 0.4.1.1. It is offered dev releases too. */
export const isDevVersion = (v) => String(v ?? '').split('.').length === 4

/** The release's Android APK for this build (with or without bundled plugins); null if it has none. */
export function apkUrl (u, withPlugins) { return assetUrl(u, withPlugins, 'android') }

// The release's file for each kind of studio, by what release.mjs names them.
const ARCHIVES = { android: 'android.apk', 'darwin-arm64': 'macos-arm64.zip', 'darwin-x64': 'macos-x64.zip', 'win32-x64': 'windows-x64.zip', 'linux-x64': 'linux-x64.tar.gz' }

/**
 * The release's download for this studio: `platform` is 'android' or a
 * desktop's `${process.platform}-${process.arch}` (the shell says); with or
 * without the bundled plugins, as this build is. Null if the release has none.
 */
export function assetUrl (u, withPlugins, platform) {
  const tail = ARCHIVES[platform]
  if (!tail) return null
  return u?.assets?.[`digidream-studio-${withPlugins ? '' : 'noplugins-'}${u?.latest}-${tail}`] ?? null
}

/** -1, 0 or 1, part by part; a missing part is 0 (0.3 == 0.3.0, and 0.1.1.1 > 0.1.1). */
export function compareVersions (a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0; const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * The release's "What changed" section (scripts/release.mjs writes it), as
 * plain lines for a short list: its bullets, without the markdown. [] if none.
 */
export function whatChanged (body, max = 6) {
  const text = String(body ?? '').replace(/\r/g, '')
  const at = text.indexOf('### What changed')
  if (at < 0) return []
  const rest = text.slice(at + '### What changed'.length)
  const end = rest.search(/\n### /)
  const items = []
  let cur = null
  for (const raw of (end < 0 ? rest : rest.slice(0, end)).split('\n')) {
    if (/^\s*- /.test(raw)) { cur = raw.replace(/^\s*- /, ''); items.push(cur) } else if (cur !== null && /^\s{2,}\S/.test(raw)) items[items.length - 1] += ' ' + raw.trim()
    else cur = null
  }
  return items.slice(0, max).map((s) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim())
}

const localStore = {
  get () { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null } },
  set (v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }
}

/**
 * { state: 'newer' | 'current' | 'unknown', current, latest, url, notes, at, error }
 * `force` asks GitHub even if it was asked lately (the "check now" button).
 */
export async function checkForUpdate (current, { force = false, fetchFn = (u, o) => fetch(u, o), store = localStore, now = Date.now() } = {}) {
  const kept = store.get()
  let rel = kept && kept.at && now - kept.at < EVERY_MS && !force ? kept : null
  let error = null
  if (!rel) {
    try {
      const ask = async (url) => {
        const r = await fetchFn(url, { headers: { accept: 'application/vnd.github+json' } })
        if (!r.ok) throw new Error(r.status === 403 ? 'GitHub is not answering for a while (rate limit)' : `GitHub said ${r.status}`)
        return r.json()
      }
      const dev = isDevVersion(current)
      const list = (await ask(RELEASES_API)).filter((j) => !j.draft && (dev || !j.prerelease) && versionOfTag(j.tag_name))
        .sort((a, b) => compareVersions(versionOfTag(b.tag_name), versionOfTag(a.tag_name)))
      // newest first. A dev build takes the newest of any; a main build only one main holds.
      // ponytail: up to 5 compares, then "nothing on main" -- enough while dev runs a few releases ahead
      let j = dev ? list[0] ?? null : null
      if (!dev) for (const c of list.slice(0, 5)) if (['identical', 'behind'].includes((await ask(COMPARE_API(c.tag_name))).status)) { j = c; break }
      rel = j
        ? { at: now, tag: j.tag_name, url: j.html_url || RELEASES_PAGE, body: j.body ?? '', assets: Object.fromEntries((j.assets ?? []).map((a) => [a.name, a.browser_download_url])) }
        : { at: now, tag: null, url: RELEASES_PAGE, body: '' }
      store.set(rel)
    } catch (e) {
      error = e.message ?? String(e)
      rel = kept // the last answer, if any, is still worth showing
    }
  }
  const latest = versionOfTag(rel?.tag)
  const base = { current, latest, url: rel?.url ?? RELEASES_PAGE, notes: whatChanged(rel?.body), at: rel?.at ?? null, error, assets: rel?.assets ?? {} }
  if (!latest) return { ...base, state: 'unknown' }
  return { ...base, state: compareVersions(latest, current) > 0 ? 'newer' : 'current' }
}

// "Not now" for one version: the notice stays away until a later one is out.
const SKIP = 'dnp.studio.update.skip'
export const skipped = () => { try { return localStorage.getItem(SKIP) } catch { return null } }
export const skipVersion = (v) => { try { localStorage.setItem(SKIP, v) } catch {} }
