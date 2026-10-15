// THE PLAY SCREEN: what Play is doing, over the whole studio, from the press
// until the game takes the window.
//
// Play bakes every stale source (music, sounds, sprites), checks the maps and
// graphs, bakes each map with mapc, writes the module's files and starts the
// game server, and only then does the game page load. That takes seconds on
// a big module, and on a phone many seconds; with only the status strip to
// say so the studio looked frozen, then the game appeared all at once. This is
// the boot screen's kit part (ui-boot), so every skin draws it the same way:
// a title, a bar, the step it is on, and a log of the steps with their times.
//
// A step that fails stays on screen with what went wrong and a way back,
// instead of a red line in a strip that the next action overwrites.

const paint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

/**
 * Show the play screen. `steps`: [{ id, label, weight }] in order -- the bar
 * moves through them by weight, and within one by its own fraction.
 * Returns { step(id, detail?), progress(frac, detail?), fail(message, actions), close() };
 * step() and progress() resolve after the screen has painted, so a step that
 * then blocks the page (a wasm bake) is shown before it starts.
 */
export function showPlayScreen ({ title, steps, now = () => performance.now() }) {
  document.getElementById('playscreen')?.remove()
  const el = document.createElement('div')
  el.id = 'playscreen'
  el.className = 'ui-boot'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-live', 'polite')
  el.innerHTML = '<div class="ui-boot__title"></div><div class="bar ui-boot__track"><div class="fill ui-boot__fill"></div></div>' +
    '<div class="ui-boot__status"></div><pre class="ui-boot__log"></pre><div class="ps-actions" hidden></div>'
  el.querySelector('.ui-boot__title').textContent = title
  document.body.appendChild(el)
  const fill = el.querySelector('.ui-boot__fill')
  const status = el.querySelector('.ui-boot__status')
  const log = el.querySelector('.ui-boot__log')
  const actions = el.querySelector('.ps-actions')

  const total = steps.reduce((a, s) => a + (s.weight ?? 1), 0) || 1
  const t0 = now()
  let current = -1
  let stepAt = t0
  const since = (t) => `${((now() - t) / 1000).toFixed(2)}s`
  const line = (text, kind) => {
    const row = document.createElement('div')
    row.className = 'ui-boot__line' + (kind ? ` ${kind}` : '')
    row.textContent = text
    log.appendChild(row)
    log.scrollTop = log.scrollHeight
    return row
  }
  const bar = (frac) => {
    const before = steps.slice(0, Math.max(0, current)).reduce((a, s) => a + (s.weight ?? 1), 0)
    const w = current >= 0 ? (steps[current].weight ?? 1) : 0
    fill.style.width = `${Math.min(100, ((before + w * Math.max(0, Math.min(1, frac))) / total) * 100)}%`
  }
  const finishCurrent = () => {
    if (current < 0) return
    line(`${since(t0)}  ✓ ${steps[current].label} (${Math.round(now() - stepAt)} ms)`)
  }

  return {
    el,
    /** Begin step `id` (the one before it is done). */
    async step (id, detail = '') {
      const i = steps.findIndex((s) => s.id === id)
      if (i < 0) throw new Error(`no play step ${id}`)
      finishCurrent()
      current = i
      stepAt = now()
      status.textContent = detail ? `${steps[i].label}: ${detail}` : `${steps[i].label}…`
      bar(0)
      await paint()
    },
    /** How far the current step is (0..1), and what it is on. */
    async progress (frac, detail = '') {
      if (current < 0) return
      bar(frac)
      if (detail) status.textContent = `${steps[current].label}: ${detail}`
      await paint()
    },
    /**
     * The step failed: its message stays, with buttons. `actions`:
     * [{ label, run }] -- each closes the screen, then runs.
     */
    fail (message, buttons = []) {
      if (current >= 0) line(`${since(t0)}  ✗ ${steps[current].label}`, 'bad')
      for (const m of String(message).split('\n').filter(Boolean)) line(`    ${m}`, 'bad')
      status.textContent = current >= 0 ? `${steps[current].label} failed` : 'Play failed'
      el.classList.add('ps-failed')
      actions.innerHTML = ''
      for (const b of [...buttons, { label: 'back to the studio', run: () => {} }]) {
        const btn = document.createElement('button')
        btn.className = 'ui-button'
        btn.textContent = b.label
        btn.addEventListener('click', () => { el.remove(); b.run() })
        actions.appendChild(btn)
      }
      actions.hidden = false
      actions.querySelector('button')?.focus()
    },
    /** All done (the game is loading in this window), or Play is abandoned. */
    close () { el.remove() }
  }
}
