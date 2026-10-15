//
// ONE MODULE, IN STEP WITH GITHUB. A three-way comparison per file: what this
// device has (local), what the branch has (remote), and what both had at the
// last sync (base, kept by this device). A file changed on one side takes
// that side; changed on both, the same way, is nothing; changed on both,
// differently, is a conflict the author settles on the Sync page.
//
// Each pass does ONE thing and starts again: write what GitHub has into the
// studio, or push what the studio has to GitHub, or note that they agree. A
// write the studio refuses (the module was saved since we read it) or a push
// GitHub refuses (the branch moved since we read it) is just another pass.
//
// No DOM, no IndexedDB: the studio, GitHub and the store are handed in, so
// the tests run it in node against a fake GitHub and fake studios.
//
import { blobSha, GitHubError } from './github.js'

const PASSES = 6

/** Files as the studio gives them -> { path: blobSha }. */
export async function shas (files) {
  const out = {}
  for (const f of files) out[f.path] = await blobSha(f.bytes)
  return out
}

/**
 * Local, remote and base, each { path: sha } -> what to do with each path.
 * `keep` settles conflicts: { path: { side: 'local'|'remote' } }. A choice
 * holds even if GitHub moved on after it was made: asking again only showed the
 * same question (a device that pushes as it saves moves it on all the time),
 * and whichever side loses is kept -- in GitHub's history or in a snapshot.
 */
export function plan (L, R, B, keep = {}) {
  const pull = []
  const push = []
  const conflicts = []
  for (const p of [...new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(B)])].sort()) {
    const l = L[p] ?? null
    const r = R[p] ?? null
    const b = B[p] ?? null
    if (l === r) continue
    if (l === b) { pull.push(p); continue }
    if (r === b) { push.push(p); continue }
    const k = keep[p]
    if (k?.side === 'remote' || k?.side === 'local') (k.side === 'remote' ? pull : push).push(p)
    else conflicts.push({ path: p, local: l, remote: r })
  }
  return { pull, push, conflicts }
}

const summary = (paths) => paths.length <= 3 ? paths.join(', ') : `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more`

/**
 * @param id      the module
 * @param studio  { files(id) -> { rev, files } | null, write(id, baseRev, files) -> { ok, rev, reason } }
 * @param gh      a GitHub (github.js), or anything with its methods
 * @param store   { get(id), put(id, state) }: what this device had at the last sync
 * @param device  a name for commit messages
 * @param keep    conflict choices (plan's)
 * @param get     true: bring a module this device does not have
 * @param progress  told each step: { step: 'checking'|'downloading'|'saving'|'uploading'|'committing', done?, total? }
 * @returns { result, state, pulled, pushed, conflicts }
 *   result: 'synced' | 'conflict' | 'missing-local' | 'missing-remote'
 */
export async function syncModule ({ id, studio, gh, store, device = 'a device', keep = {}, get = false, now = Date.now, progress = () => {} }) {
  let base = (await store.get(id)) ?? null
  const pulled = new Set()
  const pushed = new Set()
  for (let pass = 0; pass < PASSES; pass++) {
    progress({ step: 'checking' })
    const local = await studio.files(id)
    // A module this device does not have is only brought when asked. One it
    // had and has no more was deleted here: nothing is pushed for that (the
    // copy on GitHub stays), the page says so.
    if (!local && !get) return { result: 'missing-local', state: base }
    const L = local ? await shas(local.files) : {}
    const head = await gh.head()
    const dir = head ? await gh.dir(head.tree, id) : null
    const B = base?.files ?? {}
    // Gone from GitHub after it was synced: someone removed it there. Taking
    // that as "delete everything here" would be the worst reading of it.
    if (!dir && Object.keys(B).length) return { result: 'missing-remote', state: base }
    const R = !dir ? {} : (base?.dir === dir ? B : await gh.files(dir))

    const { pull, push, conflicts } = plan(L, R, B, keep)
    if (conflicts.length) {
      const state = { ...(base ?? {}), id, conflicts, remoteCommit: head?.commit ?? null }
      await store.put(id, state)
      return { result: 'conflict', state, conflicts, pulled: [...pulled], pushed: [...pushed] }
    }

    // GitHub has something the studio has not: write it in, then look again
    // (the push of what is left over happens on the next pass).
    if (pull.length) {
      const byPath = new Map((local?.files ?? []).map((f) => [f.path, f.bytes]))
      const fetching = pull.filter((p) => R[p])
      let got = 0
      for (const p of pull) {
        if (R[p]) {
          progress({ step: 'downloading', done: got, total: fetching.length })
          byPath.set(p, await gh.blob(R[p]))
          got++
        } else byPath.delete(p)
      }
      progress({ step: 'saving' })
      const files = [...byPath].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, bytes]) => ({ path, bytes }))
      const w = await studio.write(id, local?.rev ?? 0, files)
      if (!w.ok && w.reason === 'changed') continue
      if (!w.ok) throw new Error(`the studio refused what GitHub has for ${id}: ${w.reason}`)
      // Base moves to the remote for the files taken: they are now the same on both sides.
      const files2 = { ...B }
      for (const p of pull) { if (R[p]) files2[p] = R[p]; else delete files2[p] }
      base = { ...(base ?? {}), id, files: files2, dir: base?.dir === dir ? dir : null, commit: head?.commit ?? null, rev: w.rev, conflicts: null }
      await store.put(id, base)
      for (const p of pull) pulled.add(p)
      continue
    }

    // The studio has something GitHub has not: one commit with those files.
    if (push.length) {
      if (!head) { await gh.ensureBranch(); continue }
      const bytes = new Map(local.files.map((f) => [f.path, f.bytes]))
      const entries = []
      const sending = push.filter((p) => L[p])
      let sent = 0
      for (const p of push) {
        if (L[p]) {
          progress({ step: 'uploading', done: sent++, total: sending.length })
          const sha = await gh.createBlob(bytes.get(p))
          if (sha !== L[p]) throw new GitHubError(0, `GitHub stored ${p} as ${sha}, not ${L[p]}`, '/git/blobs')
          entries.push({ path: p, sha })
        } else entries.push({ path: p, sha: null })
      }
      progress({ step: 'committing' })
      const { root: tree, dir: newDir } = await gh.putDir(head.tree, id, entries, {
        progress: ({ done, total }) => progress({ step: 'committing', ...(total > 100 ? { done, total } : {}) })
      })
      const message = `${id}: ${summary(push)}\n\nFrom the studio on ${device}.`
      const commit = await gh.createCommit(message, tree, [head.commit])
      if (!(await gh.moveBranch(commit))) continue
      base = { id, files: { ...L }, dir: newDir, commit, rev: local.rev, conflicts: null, synced: now() }
      await store.put(id, base)
      for (const p of push) pushed.add(p)
      return { result: 'synced', state: base, pulled: [...pulled], pushed: [...pushed] }
    }

    // The same on both sides.
    base = { id, files: { ...L }, dir, commit: head?.commit ?? null, rev: local?.rev ?? 0, conflicts: null, synced: now() }
    await store.put(id, base)
    return { result: 'synced', state: base, pulled: [...pulled], pushed: [...pushed] }
  }
  throw new Error(`${id} kept changing while it was synced; it will be tried again`)
}

/**
 * The modules on the branch: folders at the top with a module.studio.json.
 * [{ id, dir }]
 */
export async function remoteModules (gh) {
  const head = await gh.head()
  if (!head) return []
  const all = await gh.tree(head.tree, true)
  const dirs = new Map(all.filter((e) => e.type === 'tree' && !e.path.includes('/')).map((e) => [e.path, e.sha]))
  return all.filter((e) => e.type === 'blob' && /^[^/]+\/module\.studio\.json$/.test(e.path))
    .map((e) => { const id = e.path.split('/')[0]; return { id, dir: dirs.get(id) } })
}
