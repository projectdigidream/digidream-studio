//
// The studio's frame: a RAIL of the module's sections down the left, and the
// section on the right.
//
// The map editor is one section among them. When it is the one showing, the
// page steps aside and the viewport with its toolbar and sheets is the content;
// every other section is a PAGE over it. On a phone held upright there is no
// rail: the module's home lists the sections and each one has a way back.
//
// The page is where the old sheets and windows now live. A section that was a
// sheet renders its rows into the page body (Ui.showSheet routes there while
// the section is up); one that was a full-screen window (the monster workshop,
// Screens, the graph) moves its root into the page body.
//
import { el } from '../ui.js'

const STYLE = `
:root{--rail-w:212px}
@media (max-width:1100px){:root{--rail-w:68px}}
@media (orientation:portrait) and (max-width:900px){:root{--rail-w:0px}}
.sd-rail{position:fixed;left:0;top:0;bottom:0;width:var(--rail-w);z-index:70;display:flex;flex-direction:column;gap:2px;
  background:#0e1118;border-right:1px solid #2a3446;padding:calc(8px + env(safe-area-inset-top)) 6px calc(8px + env(safe-area-inset-bottom));
  padding-left:calc(6px + env(safe-area-inset-left));overflow-y:auto;font:13px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfe3ff;box-sizing:border-box}
@media (orientation:portrait) and (max-width:900px){.sd-rail{display:none}}
.sd-rail button{display:flex;align-items:center;gap:10px;min-height:40px;border:0;border-radius:8px;background:transparent;color:inherit;
  font:inherit;text-align:left;padding:0 10px;cursor:pointer;flex:0 0 auto}
.sd-rail button:hover{background:#1a2130}
.sd-rail button[data-on="1"]{background:rgba(91,143,214,.35);color:#fff}
.sd-rail .ico{font-size:17px;width:22px;text-align:center;flex:0 0 auto}
.sd-rail .sd-mod{font-weight:700;color:#fff;min-height:48px}
.sd-rail .sd-gap{flex:1 1 auto;min-height:8px}
.sd-rail .sd-badge{margin-left:auto;background:#a33;color:#fff;border-radius:9px;padding:0 6px;font-size:11px}
@media (max-width:1100px){.sd-rail .lbl,.sd-rail .sd-badge{display:none}.sd-rail button{justify-content:center;padding:0}}
.sd-page{position:fixed;left:var(--rail-w);right:0;top:0;bottom:0;z-index:65;background:#0b0d12;color:#e8f0ff;display:flex;flex-direction:column;
  font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.sd-page[hidden]{display:none}
.sd-head{display:flex;align-items:center;gap:8px;padding:8px 12px;padding-top:calc(8px + env(safe-area-inset-top));border-bottom:1px solid #2a3446;flex:0 0 auto}
.sd-head .sd-title{font-weight:700;flex:1 1 auto}
.sd-head button{min-width:44px;height:40px;border-radius:8px;background:rgba(27,34,48,.85);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);
  font:600 13px/1 ui-monospace,Menlo,monospace;cursor:pointer;padding:0 12px}
.sd-head button[disabled]{opacity:.35}
.sd-back{display:none}
@media (orientation:portrait) and (max-width:900px){.sd-back{display:inline-block}}
.sd-body{position:relative;flex:1 1 auto;min-height:0;overflow:auto}
/* A section that was a sheet: its rows as a page, a readable column. */
.sd-body.st-page{padding:12px 16px calc(24px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px;max-width:980px}
.sd-body.st-page button{min-width:44px;height:40px;border-radius:8px;background:rgba(27,34,48,.85);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);
  font:600 13px/1 ui-monospace,Menlo,monospace;cursor:pointer;padding:0 12px}
/* A section that was a window fills the page. */
.sd-body > .wk{position:absolute;inset:0;padding-top:0;z-index:auto}
/* The map editor's chrome and its sheets sit right of the rail. */
.st-layer{left:var(--rail-w)!important}
/* Over a page, the sheet still opens (a texture picker from a prop), above it. */
.st-layer[data-page="1"]{z-index:80}
.st-layer[data-page="1"] .st-bar,.st-layer[data-page="1"] .st-top{display:none}
.st-layer[data-page="1"] .st-sheet:not([data-open="1"]){display:none}
.st-home-btn{display:none}
/* A script, edited on its page. */
.sd-code{width:100%;min-height:50vh;box-sizing:border-box;background:#0f131b;color:#e8f0ff;border:1px solid #3a4454;border-radius:8px;padding:10px;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2}
.sd-body.st-page .st-grid .st-tile{height:88px;padding:0}
/* A page has the room for a label to be read. */
.sd-body.st-page .st-row label{flex:0 0 13em}
/* The metamap's grid. */
.sd-grid{display:grid;gap:0;max-width:720px;border:1px solid #2a3446}
.sd-body.st-page .sd-cell{height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-style:dashed;padding:0 4px}
.sd-body.st-page .sd-cell[data-cell-map]{border-style:solid;background:rgba(91,143,214,.18)}
.sd-body.st-page .sd-cell[data-on="1"],.sd-body.st-page button[data-loose][data-on="1"]{border-color:#ffe066;box-shadow:0 0 0 2px #ffe066 inset}
/* What is wrong, each a way to it. */
.sd-body.st-page .sd-problem{height:auto;min-height:36px;text-align:left;padding:6px 10px;color:#ff8a8a;border-color:rgba(255,77,77,.4);white-space:normal}
/* The particle preview has the page's room. */
.sd-body.st-page .st-vfx-canvas{max-width:640px}
/* Map thumbnails: on Home, in the Maps list, in the metamap's cells. */
/* HANDHELD. A phone gives every pixel of height to what is edited: the
   page's row and a window's bar are compact, and a window's bar is one row
   that scrolls sideways rather than wrapping into two or three. What only
   explains (a note) or repeats (a window's own ‹ back, beside the rail and
   the page's ‹ module) is left out there. */
.sd-rail .sd-hist{display:none}
.sd-rail button[disabled]{opacity:.35}
@media (max-height:560px) and (orientation:landscape), (max-width:600px) and (orientation:portrait){
  .sd-head{padding:3px 8px;padding-top:calc(3px + env(safe-area-inset-top));gap:6px}
  .sd-head button{height:34px;min-width:38px;padding:0 10px}
  .sd-head .sd-title{font-size:13px}
  body .wk .wk-top{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;padding:4px 8px;gap:6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  body .wk .wk-top::-webkit-scrollbar{display:none}
  body .wk .wk-top > *{flex:0 0 auto}
  body .wk .wk-top button,body .wk .wk-top select{height:34px;min-width:34px;font-size:11px;padding:0 8px}
  body .wk .wk-top .wk-title{font-size:12px}
  body .wk .wk-top .wk-back,body .wk .wk-top .wk-note{display:none}
  body .wk .wk-top .st-chips{flex-wrap:nowrap}
  body .wk .wk-top .st-chip{padding:5px 8px;font-size:11px;white-space:nowrap}
  /* The panes' tabs are how a phone moves between them: first, never
     scrolled off the end of the bar. */
  body .wk .wk-top .wk-tabs{order:-1}
  .sd-rail{gap:0}
  .sd-rail button{min-height:32px}
  .sd-rail .sd-mod{min-height:36px}
}
/* A phone on its side, in a window: the window's bar is the header. */
@media (max-height:560px) and (orientation:landscape){
  .sd-page[data-kind="window"] .sd-head{display:none}
  .sd-rail .sd-hist{display:flex}
}
.sd-thumb{display:block;width:100%;aspect-ratio:16/10;border-radius:6px;background:#0e1219}
.sd-thumb-row{width:96px;flex:0 0 96px}
.sd-body.st-page .sd-cell{position:relative;overflow:hidden}
.sd-thumb-cell{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;opacity:.75;border-radius:0}
.sd-cell-name,.sd-cell-xy{position:relative;text-shadow:0 1px 2px #000}
.sd-body.st-page .sd-grid .sd-cell{height:auto;aspect-ratio:var(--cell-aspect,16/10)}
.sd-body.st-page>*{flex:0 0 auto}
/* The module's home. */
.sd-hero{display:flex;flex-direction:column;gap:6px;padding:4px 0 8px}
.sd-hero-name{font-size:22px;font-weight:700;color:#fff}
.sd-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.sd-maps{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.sd-body.st-page .sd-tile,.sd-body.st-page .sd-map{height:auto;min-height:72px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;
  padding:10px 12px;text-align:left;border-radius:10px}
.sd-tile .ico{font-size:22px}
.sd-tile .lbl,.sd-map .lbl{font-weight:700}
@media (orientation:portrait) and (max-width:900px){.st-home-btn{display:inline-block}}
`

export class Shell {
  /**
   * @param router  the Router whose sections the rail lists
   * @param on      { play(), exportPack() }
   */
  constructor ({ router, on }) {
    this.router = router
    this.on = on
    document.head.appendChild(el('style', { text: STYLE }))
    this.rail = el('nav', { class: 'sd-rail' })
    this.title = el('span', { class: 'sd-title' })
    this.actions = el('span', { class: 'sd-actions' })
    this.back = el('button', { class: 'sd-back', text: '‹ module', onclick: () => router.go('home') })
    // The module's own undo: what a page changes is the module document, which
    // has a history of its own beside each map's.
    this.undoBtn = el('button', { text: '↶', title: 'undo (the module)', 'data-action': 'undo', onclick: () => on.undo?.() })
    this.redoBtn = el('button', { text: '↷', title: 'redo (the module)', 'data-action': 'redo', onclick: () => on.redo?.() })
    this.head = el('div', { class: 'sd-head' }, [this.back, this.title, this.actions, this.undoBtn, this.redoBtn])
    this.body = el('div', { class: 'sd-body' })
    this.page = el('div', { class: 'sd-page' }, [this.head, this.body])
    this.page.hidden = true
    document.body.append(this.page, this.rail)
    this.pageClose = null
    this.badges = new Map()
    this.moduleName = ''
  }

  /** Draw the rail again: the module's name, every section, play and export. */
  drawRail () {
    const cur = this.router.current
    const lit = cur?.section.parent ?? cur?.id
    const items = [el('button', { class: 'sd-mod', title: 'the module', 'data-section': 'home', 'data-on': lit === 'home' ? '1' : '0',
      onclick: () => this.router.go('home') }, [el('span', { class: 'ico', text: '◆' }), el('span', { class: 'lbl', text: this.moduleName })])]
    for (const s of this.router.rail) {
      if (s.id === 'home') continue
      const n = this.badges.get(s.id) ?? 0
      items.push(el('button', { title: s.label, 'data-section': s.id, 'data-on': lit === s.id ? '1' : '0', onclick: () => this.router.go(s.id) },
        [el('span', { class: 'ico', text: s.icon }), el('span', { class: 'lbl', text: s.label }), n ? el('span', { class: 'sd-badge', text: String(n) }) : null].filter(Boolean)))
    }
    // Undo and redo, for a phone on its side, where a window's own bar is the
    // header and the page's row (which holds them) gives its height back.
    this.railUndo = el('button', { class: 'sd-hist', title: 'undo (the module)', 'data-action': 'rail-undo', onclick: () => this.on.undo?.() }, [el('span', { class: 'ico', text: '↶' }), el('span', { class: 'lbl', text: 'Undo' })])
    this.railRedo = el('button', { class: 'sd-hist', title: 'redo (the module)', 'data-action': 'rail-redo', onclick: () => this.on.redo?.() }, [el('span', { class: 'ico', text: '↷' }), el('span', { class: 'lbl', text: 'Redo' })])
    this.railUndo.disabled = this.undoBtn.disabled; this.railRedo.disabled = this.redoBtn.disabled
    items.push(el('div', { class: 'sd-gap' }), this.railUndo, this.railRedo,
      el('button', { title: 'play the map being edited', 'data-action': 'play', onclick: () => this.on.play() }, [el('span', { class: 'ico', text: '▶' }), el('span', { class: 'lbl', text: 'Play' })]),
      el('button', { title: 'export the module as a pack', 'data-action': 'export', onclick: () => this.on.exportPack() }, [el('span', { class: 'ico', text: '⇪' }), el('span', { class: 'lbl', text: 'Export' })]))
    this.rail.replaceChildren(...items)
  }

  setHistory (canUndo, canRedo) {
    this.undoBtn.disabled = !canUndo
    this.redoBtn.disabled = !canRedo
    if (this.railUndo) { this.railUndo.disabled = !canUndo; this.railRedo.disabled = !canRedo }
  }

  /** The page: a section's title, its actions, and an empty body for it. */
  openPage (title, { kind = 'rows', actions = [] } = {}) {
    this.closePageContent()
    this.page.hidden = false
    this.page.dataset.kind = kind
    this.title.textContent = title
    this.actions.replaceChildren(...actions)
    this.body.className = kind === 'rows' ? 'sd-body st-page' : 'sd-body'
    this.body.replaceChildren()
    this.body.scrollTop = 0
    return this.body
  }

  /** Rows into the page body, keeping the scroll when the same page is drawn again. */
  showRows (title, rows, onClose = null) {
    const keep = this.title.textContent === title ? this.body.scrollTop : 0
    this.title.textContent = title
    this.body.replaceChildren(...[].concat(rows).filter(Boolean))
    this.body.scrollTop = keep
    if (onClose) this.pageClose = onClose
  }

  /** Let go of whatever the page holds (a preview to stop). */
  closePageContent () {
    const cb = this.pageClose
    this.pageClose = null
    cb?.()
  }

  hidePage () {
    this.closePageContent()
    this.page.hidden = true
    this.body.replaceChildren()
  }
}
