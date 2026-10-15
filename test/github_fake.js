//
// A FAKE GITHUB, in memory, for the sync plugin's tests (plugins/github): the
// part of the REST API github.js calls, as a `fetch`. Objects get git's own
// ids (blob, tree and commit, hashed as git hashes them), so a sha the plugin
// works out for a file is the sha this hands back, and a branch only moves
// forward, as GitHub's does.
//
import { createHash } from 'node:crypto'

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')
const obj = (type, body) => sha1(Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body]))

export class FakeGitHub {
  constructor ({ token = 'tok', repo = 'me/modules', login = 'me', empty = false, canCreate = true } = {}) {
    this.token = token
    this.repo = repo
    this.login = login
    this.blobs = new Map() // sha -> Buffer
    this.trees = new Map() // sha -> [{ name, mode, type, sha }]
    this.commits = new Map() // sha -> { tree, parents, message }
    // Objects are by content, so every repository shares them; branches and
    // settings are each repository's own.
    this.allRefs = new Map() // full name -> Map(branch -> commit sha)
    this.meta = new Map() // full name -> { private, push }
    this.canCreate = canCreate
    this.addRepo(repo)
    this.calls = []
    this.beforeMove = null // a test's hook: runs before a branch moves (another device pushing first)
    this.offline = false
    if (!empty) this.writeFiles('main', { 'README.md': Buffer.from('# modules\n') }, 'first')
  }

  addRepo (full, { isPrivate = true, push = true } = {}) {
    this.meta.set(full, { private: isPrivate, push })
    this.allRefs.set(full, new Map())
  }

  refsOf (full = this.repo) { return this.allRefs.get(full) }
  get refs () { return this.refsOf(this.repo) }

  // ---------------------------------------------------------- objects

  putBlob (buf) { const sha = obj('blob', buf); this.blobs.set(sha, Buffer.from(buf)); return sha }

  putTree (entries) {
    // git sorts a tree's entries by name, a folder as if its name ended in '/'.
    const sorted = [...entries].sort((a, b) => {
      const ka = a.name + (a.type === 'tree' ? '/' : '')
      const kb = b.name + (b.type === 'tree' ? '/' : '')
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
    const body = Buffer.concat(sorted.map((e) => Buffer.concat([Buffer.from(`${e.type === 'tree' ? '40000' : e.mode} ${e.name}\0`), Buffer.from(e.sha, 'hex')])))
    const sha = obj('tree', body)
    this.trees.set(sha, sorted)
    return sha
  }

  /** A tree's files, flat: { 'a/b': blobSha }. */
  flat (treeSha, prefix = '') {
    const out = {}
    for (const e of this.trees.get(treeSha) ?? []) {
      if (e.type === 'tree') Object.assign(out, this.flat(e.sha, `${prefix}${e.name}/`))
      else out[prefix + e.name] = e.sha
    }
    return out
  }

  /** { 'a/b': blobSha } -> the root tree's sha (folders made as needed, empty ones dropped). */
  build (files) {
    const root = {}
    for (const [p, sha] of Object.entries(files)) {
      const parts = p.split('/')
      let node = root
      for (const d of parts.slice(0, -1)) node = (node[d] ??= {})
      node[parts.at(-1)] = sha
    }
    const make = (node) => this.putTree(Object.entries(node).map(([name, v]) =>
      typeof v === 'string' ? { name, mode: '100644', type: 'blob', sha: v } : { name, mode: '040000', type: 'tree', sha: make(v) }))
    return make(root)
  }

  putCommit (tree, parents, message) {
    const body = Buffer.from(`tree ${tree}\n${parents.map((p) => `parent ${p}\n`).join('')}author t <t> 0 +0000\ncommitter t <t> 0 +0000\n\n${message}`)
    const sha = obj('commit', body)
    this.commits.set(sha, { tree, parents, message })
    return sha
  }

  isAncestor (anc, sha) {
    const seen = new Set()
    const stack = [sha]
    while (stack.length) {
      const s = stack.pop()
      if (s === anc) return true
      if (seen.has(s)) continue
      seen.add(s)
      stack.push(...(this.commits.get(s)?.parents ?? []))
    }
    return false
  }

  // ---------------------------------------------------------- for tests

  /** Commit `files` ({ path: Buffer|string|null }, null deletes) over the branch, as someone else would. */
  writeFiles (branch, files, message = 'by hand', repo = this.repo) {
    const refs = this.refsOf(repo)
    const head = refs.get(branch)
    const flat = head ? this.flat(this.commits.get(head).tree) : {}
    for (const [p, v] of Object.entries(files)) {
      if (v === null) delete flat[p]
      else flat[p] = this.putBlob(Buffer.from(v))
    }
    const c = this.putCommit(this.build(flat), head ? [head] : [], message)
    refs.set(branch, c)
    return c
  }

  /** The branch's files under a folder: { path: string }. */
  read (branch, dir, repo = this.repo) {
    const head = this.refsOf(repo)?.get(branch)
    if (!head) return {}
    const out = {}
    for (const [p, sha] of Object.entries(this.flat(this.commits.get(head).tree))) {
      if (p.startsWith(dir + '/')) out[p.slice(dir.length + 1)] = this.blobs.get(sha).toString()
    }
    return out
  }

  log (branch = 'main', repo = this.repo) {
    const out = []
    let c = this.refsOf(repo)?.get(branch)
    while (c) { const x = this.commits.get(c); out.push(x.message); c = x.parents[0] }
    return out
  }

  // ---------------------------------------------------------- fetch

  get fetch () { return (url, init) => this.handle(url, init) }

  async handle (url, init = {}) {
    if (this.offline) throw new TypeError('fetch failed')
    const u = new URL(url)
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : null
    this.calls.push(`${method} ${u.pathname}`)
    const auth = init.headers?.Authorization ?? init.headers?.authorization
    if (auth !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' })
    if (u.pathname === '/user') return json(200, { login: this.login })
    const describe = (full) => ({ full_name: full, name: full.split('/')[1], private: this.meta.get(full).private, default_branch: 'main', archived: false, permissions: { push: this.meta.get(full).push } })
    if (u.pathname === '/user/repos' && method === 'GET') {
      return json(200, u.searchParams.get('page') > 1 ? [] : [...this.meta.keys()].map(describe))
    }
    if (u.pathname === '/user/repos' && method === 'POST') {
      if (!this.canCreate) return json(403, { message: 'Resource not accessible by personal access token' })
      const full = `${this.login}/${body.name}`
      if (this.meta.has(full)) return json(422, { message: 'Repository creation failed.', errors: [{ resource: 'Repository', code: 'custom', field: 'name', message: 'name already exists on this account' }] })
      this.addRepo(full, { isPrivate: body.private !== false })
      if (body.auto_init) this.writeFiles('main', { 'README.md': `# ${body.name}\n` }, 'Initial commit', full)
      return json(201, describe(full))
    }
    const rm = /^\/repos\/([^/]+\/[^/]+)(.*)$/.exec(u.pathname)
    if (!rm || !this.meta.has(rm[1])) return json(404, { message: 'Not Found' })
    const full = rm[1]
    const refs = this.refsOf(full)
    const path = rm[2]
    let m
    if (path === '' && method === 'GET') return json(200, describe(full))
    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(path)) && method === 'GET') {
      if (!refs.size) return json(409, { message: 'Git Repository is empty.' })
      const sha = refs.get(decodeURIComponent(m[1]))
      return sha ? json(200, { ref: `refs/heads/${m[1]}`, object: { sha, type: 'commit' } }) : json(404, { message: 'Not Found' })
    }
    if ((m = /^\/git\/commits\/([0-9a-f]{40})$/.exec(path)) && method === 'GET') {
      const c = this.commits.get(m[1])
      return c ? json(200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : json(404, { message: 'Not Found' })
    }
    if ((m = /^\/git\/trees\/([0-9a-f]{40})$/.exec(path)) && method === 'GET') {
      if (!this.trees.has(m[1])) return json(404, { message: 'Not Found' })
      const list = (sha, prefix, deep) => (this.trees.get(sha) ?? []).flatMap((e) => {
        const here = { path: prefix + e.name, mode: e.type === 'tree' ? '040000' : e.mode, type: e.type, sha: e.sha }
        return e.type === 'tree' && deep ? [here, ...list(e.sha, `${prefix}${e.name}/`, deep)] : [here]
      })
      return json(200, { sha: m[1], tree: list(m[1], '', u.searchParams.get('recursive') === '1'), truncated: false })
    }
    if ((m = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(path)) && method === 'GET') {
      const b = this.blobs.get(m[1])
      return b ? json(200, { sha: m[1], encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') }) : json(404, { message: 'Not Found' })
    }
    if (path === '/git/blobs' && method === 'POST') {
      if (!refs.size) return json(409, { message: 'Git Repository is empty.' })
      return json(201, { sha: this.putBlob(Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')) })
    }
    if (path === '/git/trees' && method === 'POST') {
      const flat = body.base_tree ? this.flat(body.base_tree) : {}
      for (const e of body.tree) {
        if (e.sha === null) delete flat[e.path]
        else if (!this.blobs.has(e.sha)) return json(422, { message: `tree.sha ${e.sha} is not a valid blob` })
        else flat[e.path] = e.sha
      }
      return json(201, { sha: this.build(flat) })
    }
    if (path === '/git/commits' && method === 'POST') {
      if (!this.trees.has(body.tree)) return json(422, { message: 'Tree SHA does not exist' })
      return json(201, { sha: this.putCommit(body.tree, body.parents, body.message) })
    }
    if (path === '/git/refs' && method === 'POST') {
      const b = body.ref.replace(/^refs\/heads\//, '')
      if (refs.has(b)) return json(422, { message: 'Reference already exists' })
      refs.set(b, body.sha)
      return json(201, { ref: body.ref, object: { sha: body.sha } })
    }
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(path)) && method === 'PATCH') {
      const b = decodeURIComponent(m[1])
      if (this.beforeMove) { const f = this.beforeMove; this.beforeMove = null; await f(this) }
      const cur = refs.get(b)
      if (!cur) return json(422, { message: 'Reference does not exist' })
      if (!body.force && !this.isAncestor(cur, body.sha)) return json(422, { message: 'Update is not a fast forward' })
      refs.set(b, body.sha)
      return json(200, { ref: `refs/heads/${b}`, object: { sha: body.sha } })
    }
    if (path === '/contents/README.md' && method === 'PUT') {
      const b = body.branch ?? 'main'
      if (refs.get(b)) return json(422, { message: 'sha wasn\'t supplied' })
      this.writeFiles(b, { 'README.md': Buffer.from(body.content, 'base64') }, body.message, full)
      return json(201, {})
    }
    return json(404, { message: `the fake has no ${method} ${path}` })
  }
}

function json (status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/**
 * A FAKE STUDIO: modules as files, with the revisions and the refusals of the
 * real one's `record-files` and `module-write` (docs/PLUGINS.md).
 */
export class FakeStudio {
  constructor () { this.modules = new Map(); this.revs = 0; this.writes = 0 }
  /** files: { path: string } */
  put (id, files) {
    this.modules.set(id, { rev: ++this.revs, files: new Map(Object.entries(files).map(([p, v]) => [p, Buffer.from(v)])) })
  }

  edit (id, files) {
    const m = this.modules.get(id)
    for (const [p, v] of Object.entries(files)) { if (v === null) m.files.delete(p); else m.files.set(p, Buffer.from(v)) }
    m.rev = ++this.revs
  }

  text (id) { const m = this.modules.get(id); return m ? Object.fromEntries([...m.files].map(([p, b]) => [p, b.toString()])) : null }

  async files (id) {
    const m = this.modules.get(id)
    if (!m) return null
    return { id, rev: m.rev, files: [...m.files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, b]) => ({ path, bytes: new Uint8Array(b) })) }
  }

  async write (id, baseRev, files) {
    const m = this.modules.get(id)
    if ((m?.rev ?? 0) !== baseRev) return { ok: false, reason: 'changed', rev: m?.rev ?? 0 }
    const mod = files.find((f) => f.path === 'module.studio.json')
    if (!mod || !files.some((f) => /^maps\/.+\.studio\.json$/.test(f.path))) return { ok: false, reason: 'not a studio module' }
    if (JSON.parse(Buffer.from(mod.bytes).toString()).id !== id) return { ok: false, reason: 'module.studio.json names another module' }
    this.writes++
    if (this.beforeWrite) { const f = this.beforeWrite; this.beforeWrite = null; f(this) }
    const now = this.modules.get(id)
    if ((now?.rev ?? 0) !== baseRev) return { ok: false, reason: 'changed', rev: now.rev }
    this.modules.set(id, { rev: ++this.revs, files: new Map(files.map((f) => [f.path, Buffer.from(f.bytes)])) })
    return { ok: true, rev: this.revs }
  }
}

/** A store of sync states in memory. */
export class MemStore {
  constructor () { this.m = new Map() }
  async get (id) { return structuredClone(this.m.get(id) ?? null) }
  async put (id, s) { this.m.set(id, structuredClone(s)) }
}
