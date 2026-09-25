//
// Pointer events into the handful of gestures an editor needs.
//
// One finger (or the left button) belongs to the tool: a tap, a drag, a long
// press. Two fingers belong to the camera: pan by their midpoint, zoom by their
// spread. A mouse gets the same camera with the wheel and the right button,
// and nothing here knows which it was talking to -- the touch layer in the
// client is built the same way (client/src/touch.js) and for the same reason.
//
// Decided ONCE per pointer, on the way down: a drag that started as a tool
// drag stays one if a second finger lands, and a two-finger pan stays a pan
// if one finger lifts early. Changing one's mind mid-gesture is how a wall
// ends up drawn where the camera was being moved.
//

const TAP_SLOP = 8          // px of movement that still counts as a tap
const LONG_PRESS_MS = 550

export class Gestures {
  /**
   * @param el       the element to listen on (the canvas)
   * @param handlers { tap, dragStart, drag, dragEnd, longPress, pan, zoom, wheel, key }
   *   tap/dragX get { x, y, dx, dy, startX, startY, button, shift, alt }
   *   pan gets { dx, dy }; zoom gets a factor (>1 zooms in); wheel gets deltaY
   */
  constructor (el, handlers) {
    this.el = el
    this.h = handlers
    this.pointers = new Map()      // id -> { x, y, startX, startY, role, moved, button }
    this.camera = null             // { lastMid, lastDist } while two fingers are down
    this.longTimer = null
    el.addEventListener('pointerdown', (e) => this.#down(e))
    el.addEventListener('pointermove', (e) => this.#move(e))
    el.addEventListener('pointerup', (e) => this.#up(e))
    el.addEventListener('pointercancel', (e) => this.#up(e, true))
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.h.wheel?.(e.deltaY, e) }, { passive: false })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    addEventListener('blur', () => this.#clear())
    addEventListener('keydown', (e) => this.h.key?.(e))
  }

  #down (e) {
    this.el.setPointerCapture?.(e.pointerId)
    const p = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false,
                button: e.button, shift: e.shiftKey, alt: e.altKey, role: null, dragging: false }
    const touches = [...this.pointers.values()].filter((q) => q.role !== 'camera')
    if (e.pointerType === 'mouse' && e.button !== 0) p.role = 'camera'
    else if (this.pointers.size === 1 && touches.length === 1 && !touches[0].dragging) {
      // A second finger before the first started dragging: both become the camera.
      touches[0].role = 'camera'
      p.role = 'camera'
      this.#cancelLong()
    } else if (this.pointers.size >= 1) p.role = 'camera'
    else p.role = 'tool'
    this.pointers.set(e.pointerId, p)
    if (p.role === 'tool') {
      this.longTimer = setTimeout(() => {
        const q = this.pointers.get(e.pointerId)
        if (q && !q.moved) { q.role = 'done'; this.h.longPress?.(this.#info(q)) }
      }, LONG_PRESS_MS)
    } else this.#cameraReset()
  }

  #move (e) {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    p.x = e.clientX; p.y = e.clientY
    if (!p.moved && Math.hypot(p.x - p.startX, p.y - p.startY) > TAP_SLOP) { p.moved = true; this.#cancelLong() }
    if (p.role === 'tool') {
      if (p.moved && !p.dragging) { p.dragging = true; this.h.dragStart?.(this.#info(p)) }
      if (p.dragging) this.h.drag?.(this.#info(p))
    } else if (p.role === 'camera') this.#cameraMove()
  }

  #up (e, cancelled = false) {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    p.x = e.clientX; p.y = e.clientY
    this.pointers.delete(e.pointerId)
    this.#cancelLong()
    if (p.role === 'tool') {
      if (p.dragging) this.h.dragEnd?.(this.#info(p), cancelled)
      else if (!cancelled) this.h.tap?.(this.#info(p))
    } else if (p.role === 'camera') this.#cameraReset()
  }

  #info (p) {
    return { x: p.x, y: p.y, startX: p.startX, startY: p.startY, dx: p.x - p.startX, dy: p.y - p.startY,
             button: p.button, shift: p.shift, alt: p.alt }
  }

  #cancelLong () { if (this.longTimer) { clearTimeout(this.longTimer); this.longTimer = null } }

  #cameraPointers () { return [...this.pointers.values()].filter((q) => q.role === 'camera') }

  #cameraReset () {
    const c = this.#cameraPointers()
    if (c.length === 0) { this.camera = null; return }
    const mid = { x: c.reduce((s, q) => s + q.x, 0) / c.length, y: c.reduce((s, q) => s + q.y, 0) / c.length }
    const dist = c.length >= 2 ? Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y) : 0
    this.camera = { mid, dist }
  }

  #cameraMove () {
    const c = this.#cameraPointers()
    if (!this.camera || c.length === 0) return
    const mid = { x: c.reduce((s, q) => s + q.x, 0) / c.length, y: c.reduce((s, q) => s + q.y, 0) / c.length }
    const dx = mid.x - this.camera.mid.x
    const dy = mid.y - this.camera.mid.y
    if (dx || dy) this.h.pan?.({ dx, dy })
    if (c.length >= 2) {
      const dist = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y)
      if (this.camera.dist > 0 && dist > 0) this.h.zoom?.(dist / this.camera.dist)
      this.camera.dist = dist
    }
    this.camera.mid = mid
  }

  #clear () {
    this.pointers.clear()
    this.camera = null
    this.#cancelLong()
  }
}
