// IS THERE A NEWER STUDIO? Asked of the studio's GitHub releases.
//
// The latest release of projectdigidream/digidream-studio, by GitHub's API
// (which a page may read from anywhere), compared with this studio's version.
// Asked at most every few hours: the answer is kept, per device, with when it
// was asked -- GitHub allows a visitor sixty questions an hour, and a studio
// opened ten times a day needs one. Never in the way: offline, rate-limited or
// refused, the answer is "could not check" and nothing else happens.
//
// Pure apart from `fetchFn` and `store`, which the tests replace.

export const RELEASES_API = 'https://api.github.com/repos/projectdigidream/digidream-studio/releases/latest'
export const RELEASES_PAGE = 'https://github.com/projectdigidream/digidream-studio/releases/latest'
const KEY = 'dnp.studio.update'
const EVERY_MS = 6 * 3600 * 1000

/** The version a studio tag names: 'studio-v0.3.1' -> '0.3.1'; null if it names none. */
export function versionOfTag (tag) {
  const m = /^(?:studio-)?v?(\d+(?:\.\d+){1,3})$/.exec(String(tag ?? '').trim())
  return m ? m[1] : null
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
      const r = await fetchFn(RELEASES_API, { headers: { accept: 'application/vnd.github+json' } })
      if (!r.ok) throw new Error(r.status === 403 ? 'GitHub is not answering for a while (rate limit)' : `GitHub said ${r.status}`)
      const j = await r.json()
      rel = { at: now, tag: j.tag_name, url: j.html_url || RELEASES_PAGE, body: j.body ?? '' }
      store.set(rel)
    } catch (e) {
      error = e.message ?? String(e)
      rel = kept // the last answer, if any, is still worth showing
    }
  }
  const latest = versionOfTag(rel?.tag)
  const base = { current, latest, url: rel?.url ?? RELEASES_PAGE, notes: whatChanged(rel?.body), at: rel?.at ?? null, error }
  if (!latest) return { ...base, state: 'unknown' }
  return { ...base, state: compareVersions(latest, current) > 0 ? 'newer' : 'current' }
}

// "Not now" for one version: the notice stays away until a later one is out.
const SKIP = 'dnp.studio.update.skip'
export const skipped = () => { try { return localStorage.getItem(SKIP) } catch { return null } }
export const skipVersion = (v) => { try { localStorage.setItem(SKIP, v) } catch {} }
