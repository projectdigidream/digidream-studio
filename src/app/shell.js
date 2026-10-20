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
import { el, icon, withIcon } from '../ui.js'

// The rail's groups, in order; the last takes any section no group names.
const RAIL_GROUPS = [
  { id: 'world', label: 'World', ids: ['maps', 'sky'] },
  { id: 'gameplay', label: 'Gameplay', ids: ['monsters', 'player', 'controls', 'weapons', 'missiles', 'props'] },
  { id: 'art', label: 'Art', ids: ['sprites', 'particles', 'textures'] },
  { id: 'sound', label: 'Sound', ids: ['music', 'sounds'] },
  { id: 'interface', label: 'Interface', ids: ['screens', 'panels', 'style'] },
  { id: 'logic', label: 'Logic', ids: ['scripts', 'graphs'] },
  { id: 'module', label: 'Module', ids: ['settings'] }
]

const STYLE = `
:root{--rail-w:212px}
@media (max-width:1100px){:root{--rail-w:68px}}
@media (orientation:portrait) and (max-width:900px){:root{--rail-w:0px}}
.sd-rail{position:fixed;left:0;top:0;bottom:0;width:var(--rail-w);z-index:70;display:flex;flex-direction:column;gap:2px;padding:calc(8px + env(safe-area-inset-top)) 6px calc(8px + env(safe-area-inset-bottom));
  padding-left:calc(6px + env(safe-area-inset-left));overflow-y:auto;font-size:13px;line-height:1.3;box-sizing:border-box}
/* The rail's width is the page's layout (--rail-w), whatever a skin's compact rail says. */
.sd-rail.ui-rail,.sd-rail.ui-rail.ui-rail--compact{width:var(--rail-w);min-width:0;max-width:none}
@media (orientation:portrait) and (max-width:900px){.sd-rail{display:none}}
.sd-rail.ui-rail .ui-rail__item{display:flex;align-items:center;gap:10px;height:auto;min-height:40px;text-align:left;padding:0 10px;cursor:pointer;flex:0 0 auto}

.sd-rail .ico{font-size:17px;width:22px;text-align:center;flex:0 0 auto;--icon-size:20px}
.sd-rail .sd-mod{font-weight:700;min-height:48px}
.sd-rail .sd-gap{flex:1 1 auto;min-height:8px}
.sd-rail .sd-group{flex:0 0 auto;margin:8px 4px 2px;padding:6px 6px 0;border-top:1px solid var(--dnp-color-line-main,#333);font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;white-space:nowrap;overflow:hidden}
@media (max-width:1100px){.sd-rail .sd-group{margin:5px 6px 3px;padding:0;height:0;font-size:0}}
.sd-rail .sd-badge{margin-left:auto;padding:0 6px;font-size:11px}
@media (max-width:1100px){.sd-rail .lbl,.sd-rail .sd-badge{display:none}.sd-rail.ui-rail .ui-rail__item{justify-content:center;padding:0}}
.sd-page{position:fixed;left:var(--rail-w);right:0;top:0;bottom:0;z-index:65;background:var(--dnp-color-bg-app);color:var(--dnp-color-text-primary);display:flex;flex-direction:column;
  font-size:14px;line-height:1.4;font-family:var(--dnp-font-ui)}
.sd-page[hidden]{display:none}
.sd-head{display:flex;align-items:center;gap:8px;height:auto;min-height:0;padding:8px 12px;padding-top:calc(8px + env(safe-area-inset-top));flex:0 0 auto}
.sd-head .sd-title{font-weight:700;flex:1 1 auto}
.sd-head button{min-width:44px;height:40px;
  font-size:13px;line-height:1;cursor:pointer;padding:0 12px}

.sd-back{display:none}
@media (orientation:portrait) and (max-width:900px){.sd-back{display:inline-block}}
.sd-body{position:relative;flex:1 1 auto;min-height:0;overflow:auto}
/* A section that was a sheet: its rows as a page, a readable column. */
.sd-body.st-page{padding:12px 16px calc(24px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px;max-width:980px}
.sd-body.st-page button:where(:not(.ui-switch):not(.ui-help)){min-width:44px;height:40px;
  font-size:13px;line-height:1;cursor:pointer;padding:0 12px}
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
.sd-code{width:100%;min-height:50vh;box-sizing:border-box;padding:10px;font-size:13px;line-height:1.45;tab-size:2}
.sd-body.st-page .st-grid .st-tile{height:88px;padding:0}
/* A row of buttons wraps on a narrow screen rather than running off it (a kit button does not shrink). */
.sd-body.st-page .st-row{flex-wrap:wrap}
/* A page has the room for a label to be read. */
.sd-body.st-page .st-row label{flex:0 0 13em}
/* The metamap's grid. */
.sd-grid{display:grid;gap:0;max-width:720px;border:1px solid var(--dnp-color-line-main)}
.sd-body.st-page .sd-cell{height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-style:dashed;padding:0 4px}
.sd-body.st-page .sd-cell[data-cell-map]{border-style:solid;background:color-mix(in srgb,var(--dnp-color-accent) 18%,transparent)}
.sd-body.st-page .sd-cell[data-on="1"],.sd-body.st-page button[data-loose][data-on="1"]{border-color:var(--dnp-color-select);box-shadow:0 0 0 2px var(--dnp-color-select) inset}
/* What is wrong, each a way to it. */
.sd-body.st-page .sd-problem{height:auto;min-height:36px;text-align:left;padding:6px 10px;white-space:normal}
/* The particle preview has the page's room. */
.sd-body.st-page .st-vfx-canvas{max-width:640px}
/* Map thumbnails: on Home, in the Maps list, in the metamap's cells. */
/* HANDHELD. A phone gives every pixel of height to what is edited: the
   page's row and a window's bar are compact, and a window's bar is one row
   that scrolls sideways rather than wrapping into two or three. What only
   explains (a note) or repeats (a window's own ‹ back, beside the rail and
   the page's ‹ module) is left out there. */
.sd-rail .sd-hist{display:none}

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
  .sd-rail.ui-rail .ui-rail__item{min-height:32px}
  .sd-rail .sd-mod{min-height:36px}
}
/* A phone on its side, in a window: the window's bar is the header. */
@media (max-height:560px) and (orientation:landscape){
  .sd-page[data-kind="window"] .sd-head{display:none}
  .sd-rail .sd-hist{display:flex}
}
/* The Play log: the shells' and the studio's lines, the failures in red. */
.sd-log{font-size:11px;line-height:1.45;padding:6px 8px;max-height:46vh;overflow:auto;-webkit-overflow-scrolling:touch}
.sd-log-line{white-space:pre-wrap;word-break:break-word}

.sd-thumb{display:block;width:100%;aspect-ratio:16/10;border-radius:6px;background:var(--dnp-color-bg-sunken)}
.sd-thumb-row{width:96px;flex:0 0 96px}
.sd-body.st-page .sd-cell{position:relative;overflow:hidden}
.sd-thumb-cell{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;opacity:.75;border-radius:0}
.sd-cell-name,.sd-cell-xy{position:relative;text-shadow:0 1px 2px var(--dnp-color-text-inverse)}
.sd-body.st-page .sd-grid .sd-cell{height:auto;aspect-ratio:var(--cell-aspect,16/10)}
.sd-body.st-page>*{flex:0 0 auto}
/* The module's home. */
.sd-hero{display:flex;flex-direction:column;gap:6px;padding:4px 0 8px}
.sd-hero-name{font-size:22px;font-weight:700;color:var(--dnp-color-text-primary)}
.sd-modstatus{position:absolute;top:6px;right:6px}
.sd-mod{position:relative}
.sd-sync{display:inline-flex;align-items:center;gap:6px;font-size:12px}
.sd-sync[hidden]{display:none}
/* The version, a check for a newer one, and the notice when there is one (updates.js). */
.sd-version-row{align-items:center;gap:10px}
.sd-body.st-page .sd-check-update{height:auto;min-height:0;padding:2px 8px;font-size:12px}
.sd-update{display:flex;flex-direction:column;gap:6px;border-color:var(--dnp-color-accent)}
.sd-update .lbl{font-weight:700;color:var(--dnp-color-text-primary)}
.sd-update-notes{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:2px}
.sd-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.sd-maps{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.sd-body.st-page .sd-tile,.sd-body.st-page .sd-map{height:auto;min-height:72px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;
  padding:10px 12px;text-align:left}
.sd-tile .ico{font-size:22px;--icon-size:24px}
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
    this.rail = el('nav', { class: 'sd-rail ui-rail' })
    // A narrow screen's rail is icons only: the kit's compact rail.
    const narrow = matchMedia('(max-width:1100px)')
    const compact = () => this.rail.classList.toggle('ui-rail--compact', narrow.matches)
    narrow.addEventListener?.('change', compact)
    compact()
    this.title = el('span', { class: 'sd-title ui-topbar__title' })
    this.actions = el('span', { class: 'sd-actions' })
    this.back = el('button', { class: 'sd-back', onclick: () => router.go('home') }, withIcon('action.back', 'module'))
    // The module's own undo: what a page changes is the module document, which
    // has a history of its own beside each map's.
    this.undoBtn = el('button', { class: 'ui-button ui-button--icon', title: 'undo (the module)', 'data-action': 'undo', onclick: () => on.undo?.() }, withIcon('action.undo'))
    this.redoBtn = el('button', { class: 'ui-button ui-button--icon', title: 'redo (the module)', 'data-action': 'redo', onclick: () => on.redo?.() }, withIcon('action.redo'))
    this.head = el('div', { class: 'sd-head ui-topbar' }, [this.back, this.title, this.actions, this.undoBtn, this.redoBtn])
    this.body = el('div', { class: 'sd-body' })
    this.page = el('div', { class: 'sd-page' }, [this.head, this.body])
    this.page.hidden = true
    document.body.append(this.page, this.rail)
    this.pageClose = null
    this.badges = new Map()
    this.moduleName = ''
    this.moduleStatus = null // { text, level } a plugin set for the open module (main.js, pluginStatus)
  }

  /** Draw the rail again: the module's name, every section, play and export. */
  drawRail () {
    const cur = this.router.current
    const lit = cur?.section.parent ?? cur?.id
    const items = [el('button', { class: 'sd-mod ui-rail__item', title: 'the module', 'data-section': 'home', 'data-on': lit === 'home' ? '1' : '0',
      onclick: () => this.router.go('home') }, [el('span', { class: 'ico' }, withIcon('section.home')), el('span', { class: 'lbl ui-rail__label', text: this.moduleName }),
      // A plugin's word on the open module (a sync's state): a dot, its text on hover.
      this.moduleStatus?.text ? el('span', { class: `sd-modstatus ui-dot${this.moduleStatus.level && this.moduleStatus.level !== 'info' ? ` ui-dot--${this.moduleStatus.level}` : ''}`, title: this.moduleStatus.text, 'data-status-level': this.moduleStatus.level ?? 'info' }) : null].filter(Boolean))]
    // IN GROUPS, each under a small heading (a line where the rail is icons
    // only): what an editor is for, not the order it registered in. A
    // section no group names (a plugin's) goes with the module's own.
    const gi = (s) => { const i = RAIL_GROUPS.findIndex((g) => g.ids.includes(s.id)); return i < 0 ? RAIL_GROUPS.length - 1 : i }
    const sections = this.router.rail.filter((s) => s.id !== 'home').map((s, n) => ({ s, n, g: gi(s) })).sort((a, b) => a.g - b.g || a.n - b.n)
    let group = -1
    for (const { s, g } of sections) {
      if (g !== group) { group = g; items.push(el('div', { class: 'sd-group', role: 'separator', 'data-group': RAIL_GROUPS[g].id, text: RAIL_GROUPS[g].label })) }
      const n = this.badges.get(s.id) ?? 0
      items.push(el('button', { class: 'ui-rail__item', title: s.label, 'data-section': s.id, 'data-on': lit === s.id ? '1' : '0', onclick: () => (this.router.current?.id === s.id && !this.router.current.arg ? this.router.remount() : this.router.go(s.id)) },
        [icon(s.icon, 'ico'), el('span', { class: 'lbl ui-rail__label', text: s.label }), n ? el('span', { class: 'sd-badge ui-rail__badge ui-badge ui-badge--error', text: String(n) }) : null].filter(Boolean)))
    }
    // Undo and redo, for a phone on its side, where a window's own bar is the
    // header and the page's row (which holds them) gives its height back.
    this.railUndo = el('button', { class: 'sd-hist ui-rail__item', title: 'undo (the module)', 'data-action': 'rail-undo', onclick: () => this.on.undo?.() }, [el('span', { class: 'ico' }, withIcon('action.undo')), el('span', { class: 'lbl ui-rail__label', text: 'Undo' })])
    this.railRedo = el('button', { class: 'sd-hist ui-rail__item', title: 'redo (the module)', 'data-action': 'rail-redo', onclick: () => this.on.redo?.() }, [el('span', { class: 'ico' }, withIcon('action.redo')), el('span', { class: 'lbl ui-rail__label', text: 'Redo' })])
    this.railUndo.disabled = this.undoBtn.disabled; this.railRedo.disabled = this.redoBtn.disabled
    items.push(el('div', { class: 'sd-gap' }), this.railUndo, this.railRedo,
      el('button', { class: 'ui-rail__item', title: 'play the map being edited', 'data-action': 'play', onclick: () => this.on.play() }, [el('span', { class: 'ico' }, withIcon('transport.play')), el('span', { class: 'lbl ui-rail__label', text: 'Play' })]),
      el('button', { class: 'ui-rail__item', title: 'export the module as a pack', 'data-action': 'export', onclick: () => this.on.exportPack() }, [el('span', { class: 'ico' }, withIcon('action.export')), el('span', { class: 'lbl ui-rail__label', text: 'Export' })]))
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
