//
// THE SYNC, IN THE BACKGROUND (plugin.json `services`): a hidden page the
// studio starts once and never closes, so modules sync whatever page is
// shown. It syncs a module when it is opened, a few seconds after it is
// saved, when the app comes back to the front, every few minutes for the open
// one, and when the Sync page asks. One sync at a time, so this device never
// races itself on the branch.
//
// The Sync page (page.js) talks to it over a BroadcastChannel: it asks
// (`sync`, `config`, `forget`), this answers `changed` whenever a module's
// state or the settings move, and the page reads them from state.js.
//
import { inSuite, connectSuite } from './suite-sdk.js'
import { GitHub, GitHubError, isOffline } from './github.js'
import { syncModule } from './sync.js'
import { CHANNEL, TAB, getConfig, setConfig, modules, status, deviceName } from './state.js'

const SAVED_DELAY = 4000
const POLL = 120000

const chan = new BroadcastChannel(CHANNEL)
let api = null
let cfg = null
let openId = null

const changed = (id = null) => chan.postMessage({ t: 'changed', id })

// THE MODULE OPEN IN THIS TAB, marked for the other tabs (a shared Web Lock
// per module, held while it is open). Writing GitHub's files into a module
// another tab has open would leave that tab with the old one in memory, and
// its next save would put the old one back -- and the sync would then send
// that to GitHub over the change it had just taken.
const openLock = (id) => `dnp-github-open:${id}`
let markedFor = null
let unmark = null
function markOpen (id) {
  markedFor = id
  unmark?.(); unmark = null
  if (!id || !globalThis.navigator?.locks) return
  navigator.locks.request(openLock(id), { mode: 'shared' }, () => (markedFor !== id ? undefined : new Promise((resolve) => { unmark = resolve })))
}

/** Is the module open in another tab of the studio in this browser? */
async function openElsewhere (id) {
  if (!globalThis.navigator?.locks?.query) return false
  const { held = [] } = await navigator.locks.query()
  return held.filter((l) => l.name === openLock(id)).length > (markedFor === id ? 1 : 0)
}

class OpenElsewhere extends Error {}

// The studio, as sync.js wants it.
const studio = {
  async files (id) {
    try { return await api.query('record-files', { id }, { timeout: 30000 }) } catch (e) {
      if (/^no module called/.test(e.message)) return null
      throw e
    }
  },
  async write (id, baseRev, files) {
    if (await openElsewhere(id)) throw new OpenElsewhere()
    return api.query('module-write', { id, baseRev, files }, { timeout: 60000 })
  }
}

const tracked = (id) => !!cfg?.tracked?.includes(id)

async function say (id, text, level, extra = {}) {
  await status.put(id, { text, level, at: Date.now(), ...extra })
  api?.status({ module: id, text, level })
  changed(id)
}

// ------------------------------------------------------------ the queue

const queue = new Map() // id -> opts, waiting
let working = false
// What the page draws as bars: the step each module is at (kept, so a page that
// opens, or is re-mounted, mid-sync catches up on 'ping'), and how far the
// current run of modules is.
const steps = new Map() // id -> { step, done, total }
const batch = { done: 0, total: 0 }
const tell = () => chan.postMessage({ t: 'progress', tab: TAB, steps: Object.fromEntries(steps), batch, waiting: [...queue.keys()] })

function schedule (id, opts = {}) {
  if (!cfg || !id) return
  if (!tracked(id) && !opts.get) return
  if (!queue.has(id)) batch.total++
  queue.set(id, { ...(queue.get(id) ?? {}), ...opts })
  tell()
  if (!working) work()
}

async function work () {
  working = true
  try {
    while (queue.size) {
      const [id, opts] = queue.entries().next().value
      queue.delete(id)
      // One sync at a time across every tab of the studio in this browser: two
      // services on one module and one store would undo each other's work.
      if (globalThis.navigator?.locks) await navigator.locks.request('dnp-github-sync', () => syncOne(id, opts))
      else await syncOne(id, opts)
      batch.done++
      tell()
    }
  } finally {
    working = false
    batch.done = batch.total = 0
    tell()
  }
}

async function syncOne (id, { get = false, keep = {}, asked = false } = {}) {
  if (!cfg) return
  // Open in another tab and not here: that tab's service syncs it.
  if (markedFor !== id && await openElsewhere(id)) {
    if (asked) await say(id, 'open in another tab: it syncs there', 'info')
    return
  }
  const gh = new GitHub({ token: cfg.token, repo: cfg.repo, branch: cfg.branch })
  gh.onWait = ({ seconds }) => { steps.set(id, { step: `GitHub busy, ${seconds}s` }); tell() }
  await say(id, 'syncing…', 'info')
  try {
    let r
    try {
      r = await syncModule({ id, studio, gh, store: modules, device: cfg.device || deviceName(), keep, get, progress: (p) => { steps.set(id, p); tell() } })
    } finally { steps.delete(id) }
    if (r.result === 'synced') {
      if (get && !tracked(id)) { cfg.tracked = [...(cfg.tracked ?? []), id]; await saveConfig() }
      const took = r.pulled.length ? `, ${r.pulled.length} file${r.pulled.length > 1 ? 's' : ''} from GitHub` : ''
      await say(id, 'synced', 'ok', { pulled: r.pulled.length, pushed: r.pushed.length, note: `synced${took}` })
    } else if (r.result === 'conflict') {
      await say(id, `${r.conflicts.length} file${r.conflicts.length > 1 ? 's' : ''} changed here and on GitHub`, 'warn')
    } else if (r.result === 'missing-local') {
      await say(id, 'not on this device', 'info')
    } else if (r.result === 'missing-remote') {
      await say(id, 'gone from GitHub; this device keeps its copy', 'warn')
    }
  } catch (e) {
    if (e instanceof OpenElsewhere) await say(id, 'open in another tab too: close one to sync it', 'warn')
    else if (isOffline(e)) await say(id, 'offline; it will sync when GitHub can be reached', 'info')
    else await say(id, `sync failed: ${e.message}`, 'error', { error: e instanceof GitHubError ? e.status : 0 })
  }
}

async function syncAll () {
  for (const id of cfg?.tracked ?? []) schedule(id)
}

async function saveConfig () {
  await setConfig(cfg)
  changed()
}

// ------------------------------------------------------------ the studio's events

const savedTimers = new Map()

/** Every tracked module's badge, as last said (the studio forgets them on a reload). */
async function badges () {
  const all = await status.all()
  for (const id of cfg?.tracked ?? []) if (all[id]) api.status({ module: id, text: all[id].text === 'syncing…' ? '' : all[id].text, level: all[id].level })
}

async function start () {
  cfg = await getConfig()
  if (!cfg) return
  await badges()
  syncAll()
}

if (inSuite()) {
  api = await connectSuite({
    async onServiceInit (m) {
      openId = m.module
      markOpen(m.module)
      await start()
    },
    onEvent (name, m) {
      if (name === 'module-opened') { openId = m.id; markOpen(m.id); schedule(m.id) }
      else if (name === 'module-saved') {
        clearTimeout(savedTimers.get(m.id))
        savedTimers.set(m.id, setTimeout(() => { savedTimers.delete(m.id); schedule(m.id) }, SAVED_DELAY))
      } else if (name === 'foreground') syncAll()
    }
  })
  setInterval(() => { if (openId) schedule(openId) }, POLL)
}

// ------------------------------------------------------------ the Sync page's asks

chan.onmessage = async (e) => {
  const m = e.data ?? {}
  // What a Sync page asks is for the service in its own tab.
  if (['ping', 'sync', 'forget'].includes(m.t) && m.tab && m.tab !== TAB) return
  if (m.t === 'ping') { chan.postMessage({ t: 'pong', running: !!api, busy: working }); tell() }
  else if (m.t === 'config') {
    // Settings changed on the page: connected, disconnected, modules ticked.
    const was = cfg
    cfg = await getConfig()
    for (const id of was?.tracked ?? []) if (!tracked(id)) api?.status({ module: id, text: '' })
    if (cfg) syncAll()
  } else if (m.t === 'sync') {
    if (m.id) schedule(m.id, { get: !!m.get, keep: m.keep ?? {}, asked: true })
    else syncAll()
  } else if (m.t === 'forget') {
    // Sync this module as if for the first time (after it was removed from GitHub).
    await modules.put(m.id, null)
    schedule(m.id)
  }
}

globalThis.__githubSync = { get cfg () { return cfg }, schedule, get working () { return working }, queue }
