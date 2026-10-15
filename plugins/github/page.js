//
// THE SYNC PAGE (the plugin's rail section): connecting a repository (one the
// token can see, or a new one made here), which
// modules sync, how each stands, and the choice when a file changed both here
// and on GitHub. The syncing itself is the service's (service.js); this page
// asks it over the channel and reads what it wrote (state.js).
//
import { inSuite, connectSuite } from './suite-sdk.js'
import { wearSkin } from './suite-skin.js'
import { GitHub } from './github.js'
import { remoteModules } from './sync.js'
import { CHANNEL, getConfig, setConfig, modules, status, deviceName } from './state.js'

const NEW_REPO = 'https://github.com/new?name=digidream-modules&visibility=private'
const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new'

const app = document.getElementById('app')
const chan = new BroadcastChannel(CHANNEL)
let api = null
let draft = { token: '', device: deviceName() }
let connectError = ''
let busy = false
let remote = null // [{ id }] on the branch, or null while not known
let remoteError = ''
// Module id -> { path: 'local'|'remote' }. Kept for the session: a pull into
// the open module re-mounts this page, and half-made choices should survive it.
const CHOICES = 'dnp.github.choices'
const choices = new Map((() => { try { return Object.entries(JSON.parse(sessionStorage.getItem(CHOICES) ?? '{}')) } catch { return [] } })())
const keepChoices = () => { try { sessionStorage.setItem(CHOICES, JSON.stringify(Object.fromEntries(choices))) } catch {} }

// ------------------------------------------------------------ bits of DOM

function h (tag, attrs = {}, kids = []) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'text') e.textContent = v
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of [].concat(kids)) if (c !== null && c !== undefined && c !== false) e.append(c)
  return e
}

// In the apps the studio opens it in the system's browser; in a browser it
// says false and this page opens a tab itself, still inside the click.
const open = async (url) => {
  const done = api ? await api.query('open-url', { url }).catch(() => false) : false
  if (!done) window.open(url, '_blank', 'noopener')
}
const ago = (t) => {
  if (!t) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleDateString()
}

// ------------------------------------------------------------ not connected

// Connecting is two steps: the token, then the repository -- one it can see,
// one typed in, or a new one. `picker` is the second step: { token, login,
// repos, error, filter, name, isPrivate, branch, other, back }.
let picker = null

function field (obj, key, label, type = 'text', placeholder = '') {
  return h('label', {}, [label, h('input', {
    type, value: obj[key] ?? '', placeholder, autocomplete: 'off', spellcheck: 'false', 'data-field': key,
    oninput: (e) => { obj[key] = e.target.value.trim(); if (key === 'filter') renderSoon() }
  })])
}

function connectView () {
  return [
    h('h1', { text: 'Sync with GitHub' }),
    h('p', { class: 'dim', text: 'Keep your modules in a GitHub repository and open them on your other devices. Each sync is a commit, so GitHub keeps every version.' }),
    h('section', { class: 'card' }, [
      h('h2', { text: 'A token from GitHub' }),
      h('p', {}, [h('button', { class: 'link', onclick: () => open(NEW_TOKEN), text: 'Make a new token on GitHub' }), ', set it up one of these two ways, and copy it:']),
      h('ul', { class: 'ways' }, [
        h('li', {}, [h('b', { text: 'The studio lists and makes repositories: ' }), 'Repository access "All repositories". Permissions: Contents "Read and write", and Administration "Read and write".']),
        h('li', {}, [h('b', { text: 'One repository only: ' }), h('button', { class: 'link', onclick: () => open(NEW_REPO), text: 'make the repository on GitHub' }), ' first, then choose "Only select repositories" and pick it. Permissions: Contents "Read and write".'])
      ]),
      h('div', { class: 'fields' }, [
        field(draft, 'token', 'Token', 'password', 'github_pat_…'),
        field(draft, 'device', 'This device, in commit messages', 'text', deviceName())
      ]),
      connectError ? h('p', { class: 'err', role: 'alert', text: connectError }) : null,
      h('div', { class: 'row' }, [
        h('button', { class: 'primary', 'data-action': 'continue', disabled: busy, onclick: checkToken, text: busy ? 'Checking…' : 'Continue' }),
        h('span', { class: 'dim', text: 'The token stays on this device.' })
      ])
    ])
  ]
}

async function checkToken () {
  if (!draft.token) { connectError = 'Paste the token from GitHub.'; return render() }
  busy = true; connectError = ''; render()
  try {
    const user = await new GitHub({ token: draft.token }).user()
    openPicker(draft.token, user.login)
  } catch (e) {
    connectError = e.status === 401 ? 'GitHub refused the token: check it was copied whole and has not expired.' : e.message
  } finally { busy = false }
  render()
}

/** The repository step, for a token already checked (or the one in use, to change repository). */
function openPicker (token, login, { back = 'token', branch = '' } = {}) {
  picker = { token, login, repos: null, error: '', filter: '', name: 'digidream-modules', isPrivate: true, branch, other: '', back, busy: false }
  listRepos()
}

async function listRepos () {
  const p = picker
  try {
    p.repos = await new GitHub({ token: p.token }).repos()
    // A name for a new one that is not taken yet.
    const taken = new Set(p.repos.map((r) => r.full_name.split('/')[1].toLowerCase()))
    if (taken.has(p.name.toLowerCase())) { let n = 2; while (taken.has(`digidream-modules-${n}`)) n++; p.name = `digidream-modules-${n}` }
  } catch (e) { p.repos = []; p.error = `Could not list the repositories: ${e.message}` }
  if (picker === p) render()
}

function pickerView () {
  const p = picker
  const want = p.filter.toLowerCase()
  const shown = (p.repos ?? []).filter((r) => !want || r.full_name.toLowerCase().includes(want))
  const list = p.repos === null ? h('p', { class: 'dim', text: 'Looking…' })
    : !p.repos.length ? h('p', { class: 'dim', text: 'This token cannot write to any repository yet. Make one below, or give the token one on GitHub.' })
      : h('div', { class: 'mods repos' }, shown.slice(0, 50).map((r) => h('div', { class: 'mod', 'data-repo': r.full_name }, [h('div', { class: 'row' }, [
        h('div', { class: 'grow' }, [h('span', { class: 'name', text: r.full_name }), h('span', { class: 'id', text: r.private ? '  private' : '  public' })]),
        h('button', { 'data-action': 'use', disabled: p.busy, onclick: () => useRepo(r.full_name, r.default_branch), text: 'Use' })
      ])])))
  return [
    h('h1', { text: 'Sync with GitHub' }),
    h('section', { class: 'card' }, [
      h('div', { class: 'row' }, [
        h('div', { class: 'grow' }, [h('h2', { text: 'Choose the repository' }), h('p', { class: 'dim', text: `Signed in as ${p.login}. Its modules go in one folder each.` })]),
        h('button', { 'data-action': 'back', onclick: () => { picker = null; render() }, text: p.back === 'connected' ? 'Cancel' : 'Back' })
      ]),
      (p.repos?.length ?? 0) > 8 ? field(p, 'filter', 'Find', 'text', 'name') : null,
      list,
      shown.length > 50 ? h('p', { class: 'dim', text: `${shown.length - 50} more: type to find them.` }) : null,
      h('div', { class: 'row' }, [
        h('label', { class: 'grow' }, ['Or one this list does not show', h('input', { type: 'text', value: p.other, placeholder: 'owner/name', 'data-field': 'other', spellcheck: 'false', autocomplete: 'off', oninput: (e) => { p.other = e.target.value.trim() } })]),
        h('button', { 'data-action': 'use-other', disabled: p.busy, onclick: () => useRepo(p.other), text: 'Use', style: 'align-self:flex-end' })
      ])
    ]),
    h('section', { class: 'card' }, [
      h('h2', { text: 'A new repository' }),
      h('div', { class: 'row' }, [
        h('label', { class: 'grow' }, [`Name (under ${p.login})`, h('input', { type: 'text', value: p.name, 'data-field': 'name', spellcheck: 'false', autocomplete: 'off', oninput: (e) => { p.name = e.target.value.trim() } })]),
        h('label', { class: 'switch', style: 'align-self:flex-end;padding-bottom:8px' }, [h('input', { type: 'checkbox', checked: p.isPrivate, 'data-field': 'private', onchange: (e) => { p.isPrivate = e.target.checked } }), 'private']),
        h('button', { class: 'primary', 'data-action': 'create', disabled: p.busy, onclick: createRepo, text: p.busy === 'create' ? 'Making it…' : 'Create', style: 'align-self:flex-end' })
      ]),
      p.isPrivate ? null : h('p', { class: 'dim', text: 'A public repository: anyone can read these modules.' })
    ]),
    h('section', { class: 'card' }, [field(p, 'branch', 'Branch (empty: the repository\'s own)', 'text', 'main')]),
    p.error ? h('p', { class: 'err', role: 'alert', text: p.error }) : null
  ]
}

async function useRepo (input, defaultBranch) {
  const p = picker
  const repo = String(input ?? '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { p.error = 'A repository is owner/name, as in its address on GitHub.'; return render() }
  p.busy = 'use'; p.error = ''; render()
  try {
    let info
    try { info = await new GitHub({ token: p.token, repo }).info() } catch (e) {
      throw new Error(e.status === 404 ? `${p.login} cannot see ${repo}: check the name, and that the token is given that repository.` : e.message)
    }
    if (info.permissions && info.permissions.push === false) throw new Error(`${p.login} cannot write to ${repo}.`)
    await finishConnect(repo, p.branch || defaultBranch || info.default_branch || 'main', !!info.private)
  } catch (e) { p.error = e.message } finally { p.busy = false }
  render()
}

async function createRepo () {
  const p = picker
  if (!/^[\w.-]+$/.test(p.name)) { p.error = 'A repository name is letters, digits, dots, dashes and underscores.'; return render() }
  p.busy = 'create'; p.error = ''; render()
  try {
    const made = await new GitHub({ token: p.token }).createRepo(p.name, { isPrivate: p.isPrivate })
    await finishConnect(made.full_name, p.branch || made.default_branch || 'main', !!made.private)
  } catch (e) { p.error = e.message } finally { p.busy = false }
  render()
}

async function finishConnect (repo, branch, isPrivate) {
  const p = picker
  const gh = new GitHub({ token: p.token, repo, branch })
  await gh.ensureBranch()
  const was = await getConfig()
  // Every module here syncs to begin with (untick the ones that should not); on
  // a change of repository, the ones that synced before.
  const local = api ? await api.query('modules') : []
  await modules.clear()
  await status.clear()
  await setConfig({
    token: p.token, repo, branch, login: p.login, private: isPrivate,
    device: was?.device || draft.device || deviceName(),
    tracked: was?.tracked ?? local.map((m) => m.id)
  })
  draft.token = ''
  picker = null
  remote = null
  chan.postMessage({ t: 'config' })
  refreshRemote()
}

// ------------------------------------------------------------ connected

async function connectedView (cfg) {
  const local = api ? await api.query('modules') : []
  const states = Object.fromEntries((await modules.all()).map((s) => [s.id, s]))
  const said = await status.all()
  const here = new Set(local.map((m) => m.id))
  const elsewhere = (remote ?? []).filter((m) => !here.has(m.id))
  const repoUrl = `https://github.com/${cfg.repo}`

  const head = h('section', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('div', { class: 'grow' }, [
        h('div', { class: 'name' }, [h('button', { class: 'link', onclick: () => open(repoUrl), text: cfg.repo }), ` · ${cfg.branch}`]),
        h('div', { class: 'dim', text: `Signed in as ${cfg.login}. This device: ${cfg.device}.${cfg.private === false ? ' The repository is public: anyone can read these modules.' : ''}` })
      ]),
      h('button', { class: 'primary', 'data-action': 'sync-all', onclick: () => { chan.postMessage({ t: 'sync' }); refreshRemote() }, text: 'Sync now' }),
      h('button', { 'data-action': 'change-repo', onclick: () => { openPicker(cfg.token, cfg.login, { back: 'connected' }); render() }, text: 'Change repository' }),
      h('button', { 'data-action': 'disconnect', onclick: disconnect, text: 'Disconnect' })
    ])
  ])

  const rows = local.map((m) => moduleRow(m, cfg, states[m.id], said[m.id]))
  const mine = h('section', { class: 'card' }, [
    h('h2', { text: 'On this device' }),
    local.length ? h('div', { class: 'mods' }, rows) : h('p', { class: 'dim', text: 'No modules yet.' })
  ])

  const theirs = h('section', { class: 'card' }, [
    h('h2', { text: 'On GitHub, not on this device' }),
    remoteError ? h('p', { class: 'err', text: remoteError })
      : remote === null ? h('p', { class: 'dim', text: 'Looking…' })
        : elsewhere.length ? h('div', { class: 'mods' }, elsewhere.map((m) => h('div', { class: 'mod', 'data-remote': m.id }, [
          h('div', { class: 'row' }, [
            h('div', { class: 'grow' }, [h('div', { class: 'name', text: m.id }), said[m.id] && said[m.id].text !== 'not on this device' ? h('div', { class: `state ${said[m.id].level}` }, [h('span', { class: 'dot' }), said[m.id].text]) : null]),
            h('button', { 'data-action': 'get', onclick: () => chan.postMessage({ t: 'sync', id: m.id, get: true }), text: 'Get' })
          ])
        ])))
          : h('p', { class: 'dim', text: 'Nothing: every module on GitHub is here too.' })
  ])
  return [h('h1', { text: 'Sync with GitHub' }), head, mine, theirs]
}

function moduleRow (m, cfg, st, said) {
  const on = cfg.tracked.includes(m.id)
  const kids = [h('div', { class: 'row' }, [
    h('div', { class: 'grow' }, [
      h('div', {}, [h('span', { class: 'name', text: m.name }), m.name !== m.id ? h('span', { class: 'id', text: `  ${m.id}` }) : null]),
      on && said ? h('div', { class: `state ${said.level}`, 'data-state': said.level }, [h('span', { class: 'dot' }), said.note && said.level === 'ok' ? said.note : said.text, said.level === 'ok' && st?.synced ? h('span', { class: 'dim', text: ` · ${ago(st.synced)}` }) : null])
        : h('div', { class: 'state dim', text: on ? 'waiting for its first sync' : 'not synced' })
    ]),
    on ? h('button', { 'data-action': 'sync', onclick: () => chan.postMessage({ t: 'sync', id: m.id }), text: 'Sync' }) : null,
    h('label', { class: 'switch' }, [h('input', { type: 'checkbox', checked: on, 'data-track': m.id, onchange: (e) => track(m.id, e.target.checked) }), 'sync'])
  ])]
  if (on && st?.conflicts?.length) kids.push(conflictBox(m.id, st.conflicts))
  if (on && said?.text?.startsWith('gone from GitHub')) {
    kids.push(h('div', { class: 'row' }, [
      h('span', { class: 'dim grow', text: 'It was removed from the repository after it was synced. Upload this device\'s copy again, or stop syncing it.' }),
      h('button', { 'data-action': 'reupload', onclick: () => chan.postMessage({ t: 'forget', id: m.id }), text: 'Upload again' })
    ]))
  }
  return h('div', { class: 'mod', 'data-module': m.id }, kids)
}

/** A file as the author knows it: 'map first', 'module settings', 'textures/BRICK.png'. */
function label (path) {
  if (path === 'module.studio.json') return 'module settings'
  const m = /^maps\/(.+)\.studio\.json$/.exec(path)
  if (m) return `map ${m[1]}`
  return path.replace(/^(assets|sources)\//, '')
}

function conflictBox (id, conflicts) {
  const pick = choices.get(id) ?? {}
  choices.set(id, pick)
  const set = (side) => { for (const c of conflicts) pick[c.path] = side; keepChoices(); render() }
  const ready = conflicts.every((c) => pick[c.path])
  const what = (c) => (!c.local ? ' (deleted here)' : !c.remote ? ' (deleted on GitHub)' : '')
  return h('div', { class: 'conflict', 'data-conflict': id }, [
    h('p', { text: 'Changed here and on GitHub since the last sync. Choose which to keep; the other stays in history (GitHub\'s commits, or the studio\'s Snapshots for this device\'s).' }),
    ...conflicts.map((c) => h('div', { class: 'file' }, [
      h('span', { class: 'what', title: c.path, text: label(c.path) + what(c) }),
      h('span', { class: 'pick' }, [
        h('label', {}, [h('input', { type: 'radio', name: `${id}:${c.path}`, checked: pick[c.path] === 'local', onchange: () => { pick[c.path] = 'local'; keepChoices(); render() } }), 'this device']),
        h('label', {}, [h('input', { type: 'radio', name: `${id}:${c.path}`, checked: pick[c.path] === 'remote', onchange: () => { pick[c.path] = 'remote'; keepChoices(); render() } }), 'GitHub'])
      ])
    ])),
    h('div', { class: 'row' }, [
      h('button', { 'data-action': 'keep-local', onclick: () => set('local'), text: 'All this device\'s' }),
      h('button', { 'data-action': 'keep-remote', onclick: () => set('remote'), text: 'All GitHub\'s' }),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'primary',
        'data-action': 'resolve',
        disabled: !ready,
        onclick: () => {
          const keep = Object.fromEntries(conflicts.map((c) => [c.path, { side: pick[c.path], remote: c.remote }]))
          choices.delete(id)
          keepChoices()
          chan.postMessage({ t: 'sync', id, keep })
        },
        text: 'Keep these'
      })
    ])
  ])
}

async function track (id, on) {
  const cfg = await getConfig()
  cfg.tracked = on ? [...new Set([...cfg.tracked, id])] : cfg.tracked.filter((x) => x !== id)
  await setConfig(cfg)
  chan.postMessage({ t: 'config' })
  render()
}

async function disconnect () {
  if (!confirm('Disconnect from GitHub? The modules stay on this device and on GitHub; this device forgets the token.')) return
  await setConfig(null)
  await modules.clear()
  await status.clear()
  remote = null
  chan.postMessage({ t: 'config' })
  render()
}

async function refreshRemote () {
  const cfg = await getConfig()
  if (!cfg) return
  try {
    remote = await remoteModules(new GitHub({ token: cfg.token, repo: cfg.repo, branch: cfg.branch }))
    remoteError = ''
  } catch (e) { remoteError = `Could not list the repository: ${e.message}` }
  render()
}

// ------------------------------------------------------------ drawing

let drawing = null
let again = false
async function render () {
  if (drawing) { again = true; return drawing }
  drawing = (async () => {
    do {
      again = false
      const cfg = await getConfig()
      const kids = picker ? pickerView() : cfg ? await connectedView(cfg) : connectView()
      // Keep what is being typed and where the caret is across a redraw.
      const focus = document.activeElement?.dataset?.field
      app.replaceChildren(...kids.filter(Boolean))
      if (focus) app.querySelector(`[data-field="${focus}"]`)?.focus()
    } while (again)
  })()
  try { await drawing } finally { drawing = null }
}

// The connect form is not redrawn under someone typing a token.
const quiet = () => !!picker || !!app.querySelector('[data-action="continue"]')

let soon = null
const renderSoon = () => { clearTimeout(soon); soon = setTimeout(render, 120) }

chan.onmessage = (e) => {
  if (e.data?.t !== 'changed') return
  if (quiet() && !e.data.id) return render()
  if (quiet()) return
  // A module that came from GitHub is now here: the lists move.
  if (e.data.id && remote?.some((m) => m.id === e.data.id)) refreshRemote()
  else render()
}

const fonts = { '--bg': 'color.bg.app', '--panel': 'color.bg.panel', '--raised': 'color.bg.raised', '--line': 'color.line.main', '--fg': 'color.text.primary', '--dim': 'color.text.secondary', '--accent': 'color.accent', '--on-accent': 'color.text.inverse', '--ok': 'color.ok', '--warn': 'color.warn', '--bad': 'color.error', '--info': 'color.info' }
if (inSuite()) {
  api = await connectSuite({
    onSectionInit: () => { render(); refreshRemote() },
    onEvent: () => { if (!quiet()) render() },
    onSkin: (bundle, mode, pointer) => wearSkin(bundle, mode, pointer, { vars: fonts })
  })
} else render()

globalThis.__githubPage = { render, refreshRemote, get remote () { return remote } }
