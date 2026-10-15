//
// THE PART OF GITHUB'S REST API A SYNC NEEDS: refs, commits, trees and blobs
// (the "git database" API), so a push is one commit made from the files that
// changed, and a pull reads only what moved. No git library, no server of
// ours: api.github.com answers a page from any origin (CORS), with a token.
//
// Self-contained -- no imports -- like everything a plugin carries.
//

const API = 'https://api.github.com'

export class GitHubError extends Error {
  constructor (status, message, path) {
    super(message)
    this.status = status
    this.path = path
  }
}

/** True when an error is the network, not GitHub saying no. */
export const isOffline = (e) => !(e instanceof GitHubError) && /fetch|network|load failed/i.test(String(e?.message ?? e))

// ---------------------------------------------------------------- bytes

const enc = new TextEncoder()

export function toBase64 (bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64 (b64) {
  const s = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// SHA-1 by hand for where crypto.subtle is missing: a page served over plain
// http to a phone on the LAN is not a secure context, and has no subtle.
export function sha1js (bytes) {
  const ml = bytes.length
  const words = new Uint32Array((((ml + 8) >> 6) + 1) * 16)
  for (let i = 0; i < ml; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8)
  words[ml >> 2] |= 0x80 << (24 - (ml % 4) * 8)
  words[words.length - 1] = ml * 8
  words[words.length - 2] = Math.floor(ml / 0x20000000)
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0
  const w = new Uint32Array(80)
  for (let o = 0; o < words.length; o += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[o + i]
    for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31) }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? ((b & c) | (~b & d)) + 0x5A827999
        : i < 40 ? (b ^ c ^ d) + 0x6ED9EBA1
          : i < 60 ? ((b & c) | (b & d) | (c & d)) + 0x8F1BBCDC
            : (b ^ c ^ d) + 0xCA62C1D6
      const t = (((a << 5) | (a >>> 27)) + f + e + w[i]) >>> 0
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, '0')).join('')
}

export async function sha1 (bytes) {
  const subtle = globalThis.crypto?.subtle
  return subtle ? hex(await subtle.digest('SHA-1', bytes)) : sha1js(bytes)
}

/**
 * The id git gives a file's bytes: sha1("blob <length>\0" + bytes). The same
 * as the sha in a GitHub tree, so a file is compared without downloading it.
 */
export async function blobSha (bytes) {
  const head = enc.encode(`blob ${bytes.length}\0`)
  const all = new Uint8Array(head.length + bytes.length)
  all.set(head)
  all.set(bytes, head.length)
  return sha1(all)
}

// ---------------------------------------------------------------- the API

export class GitHub {
  /**
   * @param token   a fine-grained token (Contents: read and write on the repo) or a classic one
   * @param repo    'owner/name'
   * @param branch  the branch the modules live on
   * @param fetch   injectable, for the tests
   */
  constructor ({ token, repo, branch = 'main', fetch = globalThis.fetch.bind(globalThis) }) {
    this.token = token
    this.repo = repo
    this.branch = branch
    this.fetch = fetch
  }

  async req (method, path, body) {
    const url = path.startsWith('/repos/') || path.startsWith('/user') ? API + path : `${API}/repos/${this.repo}${path}`
    const r = await this.fetch(url, {
      method,
      // A ref answered from the browser's cache (GitHub says max-age=60) is a
      // minute stale, and a sync must see the branch as it is.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (r.status === 204) return null
    const text = await r.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch {}
    if (!r.ok) {
      let msg = json?.message ?? `HTTP ${r.status}`
      // Why a repository was refused is in `errors`, not the message.
      const why = (json?.errors ?? []).map((x) => x?.message ?? x?.code).filter(Boolean)
      if (why.length) msg = `${msg} ${why.join('; ')}`
      if (r.status === 401) msg = 'GitHub refused the token (expired, revoked or mistyped)'
      else if (r.status === 403 && r.headers?.get?.('x-ratelimit-remaining') === '0') msg = 'GitHub\'s rate limit is used up for now; it resets within the hour'
      throw new GitHubError(r.status, msg, path)
    }
    return json
  }

  /** Who the token belongs to: { login }. */
  user () { return this.req('GET', '/user') }

  /** The repository: { full_name, private, default_branch, permissions: { push } }. */
  info () { return this.req('GET', '') }

  /**
   * The repositories the token can write to, most recently pushed first:
   * [{ full_name, private, default_branch, pushed_at }]. A fine-grained token
   * sees only the repositories it was given.
   */
  async repos ({ pages = 5 } = {}) {
    const out = []
    for (let page = 1; page <= pages; page++) {
      const list = await this.req('GET', `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`)
      out.push(...list)
      if (list.length < 100) break
    }
    return out.filter((r) => r.permissions?.push !== false && !r.archived)
  }

  /**
   * A new repository of the token's owner, with a first commit (so the git
   * database API takes it at once). Private unless asked otherwise.
   */
  async createRepo (name, { isPrivate = true } = {}) {
    try {
      return await this.req('POST', '/user/repos', { name, private: isPrivate, auto_init: true, description: 'Digidream Studio modules' })
    } catch (e) {
      if (e.status === 422 && /already exists/i.test(e.message)) throw new GitHubError(422, `there is already a repository called ${name}`, e.path)
      if (e.status === 403 || e.status === 404) {
        throw new GitHubError(e.status, 'this token may not create repositories: it needs "All repositories" with the Administration permission (or a classic token with the repo scope). Make the repository on GitHub instead, then pick it here.', e.path)
      }
      if (e.status === 422) throw new GitHubError(422, `GitHub refused the name "${name}": ${e.message}`, e.path)
      throw e
    }
  }

  /**
   * The branch's commit and that commit's root tree, or null when the branch
   * does not exist yet (or the repository has no commits at all).
   */
  async head () {
    let ref
    try { ref = await this.req('GET', `/git/ref/heads/${encodeURIComponent(this.branch)}`) } catch (e) {
      if (e.status === 404 || e.status === 409) return null
      throw e
    }
    const commit = await this.req('GET', `/git/commits/${ref.object.sha}`)
    return { commit: ref.object.sha, tree: commit.tree.sha }
  }

  /** A tree's entries: [{ path, mode, type, sha }]; recursive lists every file under it. */
  async tree (sha, recursive = false) {
    const t = await this.req('GET', `/git/trees/${sha}${recursive ? '?recursive=1' : ''}`)
    if (t.truncated) throw new GitHubError(0, 'the repository is too big for GitHub to list in one answer', '/git/trees')
    return t.tree
  }

  /** The sha of the folder `name` at the top of a root tree, or null. */
  async dir (rootTree, name) {
    const e = (await this.tree(rootTree)).find((x) => x.path === name && x.type === 'tree')
    return e?.sha ?? null
  }

  /** Every file under a folder's tree: { 'relative/path': blobSha }. */
  async files (dirSha) {
    const out = {}
    for (const e of await this.tree(dirSha, true)) if (e.type === 'blob') out[e.path] = e.sha
    return out
  }

  async blob (sha) {
    const b = await this.req('GET', `/git/blobs/${sha}`)
    return b.encoding === 'base64' ? fromBase64(b.content) : enc.encode(b.content)
  }

  async createBlob (bytes) {
    return (await this.req('POST', '/git/blobs', { content: toBase64(bytes), encoding: 'base64' })).sha
  }

  /** entries: [{ path, sha }] where sha null removes the file. */
  async createTree (baseTree, entries) {
    const tree = entries.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha }))
    return (await this.req('POST', '/git/trees', baseTree ? { base_tree: baseTree, tree } : { tree })).sha
  }

  async createCommit (message, tree, parents) {
    return (await this.req('POST', '/git/commits', { message, tree, parents })).sha
  }

  /**
   * Move the branch to `sha` -- only forward. False when it moved since the
   * commit was made from it (another device pushed): pull, then try again.
   */
  async moveBranch (sha, { create = false } = {}) {
    try {
      if (create) await this.req('POST', '/git/refs', { ref: `refs/heads/${this.branch}`, sha })
      else await this.req('PATCH', `/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha, force: false })
      return true
    } catch (e) {
      if (e.status === 422 || e.status === 409) return false
      throw e
    }
  }

  /**
   * A repository with no commits at all cannot take the git database API
   * (GitHub answers 409), so its first commit is a README written through the
   * contents API. Does nothing when the branch exists.
   */
  async ensureBranch () {
    if (await this.head()) return
    const info = await this.info()
    const base = info.default_branch && info.default_branch !== this.branch
      ? await new GitHub({ ...this, branch: info.default_branch }).head()
      : null
    if (base) { await this.moveBranch(base.commit, { create: true }); return }
    await this.req('PUT', '/contents/README.md', {
      message: 'Digidream Studio modules',
      branch: this.branch,
      content: toBase64(enc.encode(README))
    })
  }
}

const README = `# Digidream Studio modules

Modules kept in sync by the studio's GitHub plugin. Each folder is one
module, as the studio keeps it: \`module.studio.json\`, the maps
(\`maps/<name>.studio.json\`), and its assets and sources. Nothing baked.

The studio writes here; edit a module in the studio rather than by hand.
`
