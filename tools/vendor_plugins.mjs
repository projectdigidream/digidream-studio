#!/usr/bin/env node
//
// Bring the bundled plugins' editors into the studio (docs/PLUGINS.md, Assembly).
//
//   node studio/tools/vendor_plugins.mjs [id ...] [--check]
//
// studio/plugins.lock.json says, per plugin, where its editor comes from and at
// what version. Each one's built output lands in studio/plugins/<id>/app/; what
// is written by hand beside it (plugin.json, the shim that speaks the studio's
// protocol, a baker) is never touched. The studio's SDK is copied in as
// suite-sdk.js, and its skin helper as suite-skin.js, because an editor must not
// import the studio's own files.
//
//   { "git":  "/path/to/repo", "commit": "abc1234", "install": "pnpm install --frozen-lockfile",
//     "build": "pnpm build:web", "out": "dist-web" }
//       built in a temporary git worktree at that commit, so nobody's
//       uncommitted work in the checkout ever reaches the studio;
//   { "path": "threesprite", "commit": "220e97c", "install": ..., "build": ..., "out": ... }
//       a tool beside the studio in the workspace, a repository of its own:
//       that repository at that commit (git archive, so uncommitted work never
//       reaches the studio), built in a temporary directory;
//   { "copy": ["sound/tool/sfx.html", "sound/tool/sfx", ...], "base": "sound" }
//       files of this repository copied as they are (paths kept below `base`),
//       pinned by the hash of what was copied, which --check compares.
//   "pages": [{ "from": "tool/sfx.html", "to": "tool/suite.html", "head": "<script …>" }]
//       (either kind) a copy of one of the tool's pages with the plugin's shim
//       first in its head -- the entry its plugin.json names.
//
// After a run, studio/plugins/<id>/app/VENDORED.json says what was taken.
//
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync, mkdtempSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'

const SUITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(SUITE, '..')
const LOCK = join(SUITE, 'plugins.lock.json')
const lock = JSON.parse(readFileSync(LOCK, 'utf8'))
const args = process.argv.slice(2)
const check = args.includes('--check')
const want = args.filter((a) => !a.startsWith('--'))
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 << 20 })

/** Every file under `dir`, as [relative path] in a stable order. */
function walk (dir, base = dir) {
  const out = []
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...walk(p, base))
    else out.push(relative(base, p))
  }
  return out
}
function hashTree (dir) {
  const h = createHash('sha256')
  for (const f of walk(dir)) { if (f === 'VENDORED.json') continue; h.update(f + '\0'); h.update(readFileSync(join(dir, f))) }
  return h.digest('hex')
}

let failed = 0
for (const [id, spec] of Object.entries(lock.plugins)) {
  if (want.length && !want.includes(id)) continue
  const dir = join(SUITE, 'plugins', id)
  const app = join(dir, 'app')
  const stamp = existsSync(join(app, 'VENDORED.json')) ? JSON.parse(readFileSync(join(app, 'VENDORED.json'), 'utf8')) : null
  if (check) {
    const now = existsSync(app) ? hashTree(app) : null
    const pinned = spec.git || spec.path ? stamp?.commit === spec.commit : true
    const ok = now && stamp?.tree === now && pinned
    console.log(`${id}: ${ok ? 'as vendored' : !now ? 'missing (run vendor_plugins.mjs)' : !pinned ? `vendored from ${stamp?.commit}, lock says ${spec.commit}` : 'app/ was changed by hand'}`)
    if (!ok) failed++
    continue
  }
  const tmp = mkdtempSync(join(tmpdir(), `suite-vendor-${id}-`))
  try {
    let source
    if (spec.git) {
      const wt = join(tmp, 'src')
      sh(`git worktree add --detach "${wt}" ${spec.commit}`, spec.git)
      try {
        process.stdout.write(`${id}: building ${spec.git} at ${spec.commit}… `)
        if (spec.install) sh(spec.install, wt)
        sh(spec.build, wt)
        rmSync(app, { recursive: true, force: true })
        cpSync(join(wt, spec.out), app, { recursive: true })
      } finally {
        sh(`git worktree remove --force "${wt}"`, spec.git)
      }
      source = { git: spec.git, commit: spec.commit }
    } else if (spec.path) {
      // The tool's own repository, beside the studio, at the pinned commit.
      const wt = join(tmp, 'src')
      mkdirSync(wt)
      process.stdout.write(`${id}: building ${spec.path}/ at ${spec.commit}… `)
      sh(`git archive --format=tar ${spec.commit} | tar -x -C "${wt}"`, join(REPO, spec.path))
      const at = wt
      if (spec.install) sh(spec.install, at)
      sh(spec.build, at)
      rmSync(app, { recursive: true, force: true })
      cpSync(join(at, spec.out), app, { recursive: true })
      source = { path: spec.path, commit: spec.commit }
    } else if (spec.copy) {
      process.stdout.write(`${id}: copying ${spec.copy.length} path(s)… `)
      rmSync(app, { recursive: true, force: true })
      for (const p of spec.copy) {
        const from = join(REPO, p)
        if (!existsSync(from)) throw new Error(`${p} is not there (built?)`)
        cpSync(from, join(app, relative(spec.base ?? '', p)), { recursive: true })
      }
      source = { copy: spec.copy, base: spec.base ?? '' }
    } else throw new Error('neither git, path nor copy')
    for (const p of spec.drop ?? []) rmSync(join(app, p), { recursive: true, force: true })
    // A page of the tool's, copied with the studio's shim as the first thing in
    // its head: the tool's own document, styles and scripts, untouched.
    for (const pg of spec.pages ?? []) {
      const html = readFileSync(join(app, pg.from), 'utf8')
      const tag = pg.head
      const at = html.search(/<head[^>]*>/i)
      const out = at >= 0 ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`) : `${tag}\n${html}`
      writeFileSync(join(app, pg.to), out)
    }
    cpSync(join(SUITE, 'src', 'plugins', 'sdk.js'), join(dir, 'suite-sdk.js'))
    cpSync(join(SUITE, 'src', 'plugins', 'skinwear.js'), join(dir, 'suite-skin.js'))
    const tree = hashTree(app)
    writeFileSync(join(app, 'VENDORED.json'), JSON.stringify({ ...source, tree, files: walk(app).length }, null, 1) + '\n')
    console.log(`${walk(app).length} files, ${(walk(app).reduce((n, f) => n + statSync(join(app, f)).size, 0) / 1024).toFixed(0)} KB`)
  } catch (e) {
    failed++
    console.log(`\n${id}: FAILED: ${String(e.stderr || e.message).trim().split('\n').slice(-6).join('\n  ')}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
process.exit(failed ? 1 : 0)
