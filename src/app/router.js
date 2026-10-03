//
// Where the studio is: one SECTION of the module at a time.
//
// The studio is a module editor. Its sections -- the module's home, its maps,
// monsters, player, weapons, particles, textures, music, sounds, screens,
// scripts, settings, and the map editor for one map -- are registered here and
// exactly one is mounted. The address is the location hash (#/monsters/imp),
// so a reload comes back to the same place and a test can go anywhere by name.
//
// Pure apart from `location`/`history`, which are injectable: router.test.js
// drives it without a browser.
//

/** '#/monsters/imp' -> { id: 'monsters', arg: 'imp' }; '' -> null. */
export function parseHash (hash) {
  const m = /^#\/([a-z][a-z0-9_-]*)(?:\/(.+))?$/.exec(String(hash ?? ''))
  if (!m) return null
  return { id: m[1], arg: m[2] === undefined ? null : decodeURIComponent(m[2]) }
}

/** { id, arg } -> '#/id/arg'. */
export function formatHash (id, arg = null) {
  return arg === null || arg === undefined || arg === '' ? `#/${id}` : `#/${id}/${encodeURIComponent(arg)}`
}

export class Router {
  /**
   * @param onChange  (to, from) after a section is mounted
   * @param location  window.location, or a stand-in with `hash`
   */
  constructor ({ onChange = () => {}, location = globalThis.location, fallback = 'home' } = {}) {
    this.sections = new Map()
    this.order = []
    this.current = null           // { id, arg, section }
    this.onChange = onChange
    this.location = location
    this.fallback = fallback
    this.going = false
  }

  /**
   * A section: { id, label, icon, rail (shown in the rail), mount(arg), unmount(),
   * parent (the rail entry it lights, for the map editor: 'maps') }.
   */
  register (section) {
    if (this.sections.has(section.id)) throw new Error(`section ${section.id} registered twice`)
    this.sections.set(section.id, section)
    this.order.push(section.id)
    return section
  }

  /** The sections the rail lists, in registration order. */
  get rail () { return this.order.map((id) => this.sections.get(id)).filter((s) => s.rail !== false) }

  /** Mount a section. Going where we already are with the same argument is a no-op. */
  async go (id, arg = null) {
    const section = this.sections.get(id) ?? this.sections.get(this.fallback)
    if (!section) return
    const to = { id: section.id, arg: section.id === id ? arg : null, section }
    const from = this.current
    if (from && from.id === to.id && from.arg === to.arg) return
    if (this.going) { this.queued = [id, arg]; return }
    this.going = true
    try {
      // A section may refuse to be left (an unsaved question); it says so by
      // returning false from `leave`.
      if (from?.section.leave && (await from.section.leave(to)) === false) return
      if (from && from.id !== to.id) await from.section.unmount?.(to)
      this.current = to
      const hash = formatHash(to.id, to.arg)
      if (this.location && this.location.hash !== hash) this.location.hash = hash
      await section.mount?.(to.arg, from)
      this.onChange(to, from)
    } finally {
      this.going = false
      if (this.queued) { const [qid, qarg] = this.queued; this.queued = null; this.go(qid, qarg) }
    }
  }

  /** Draw the current section again from scratch (the module it shows was replaced: an undo). */
  async remount () {
    const c = this.current
    if (!c) return
    await c.section.unmount?.(c)
    await c.section.mount?.(c.arg, c)
    this.onChange(c, c)
  }

  /** Follow the address (a reload, the back button). */
  follow () {
    const h = parseHash(this.location?.hash)
    return this.go(h?.id ?? this.fallback, h?.arg ?? null)
  }
}
