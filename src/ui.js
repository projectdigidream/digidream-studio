//
// The chrome: a toolbar along the bottom, a status line at the top, a sheet
// that slides up with whatever was tapped, and a few small controls that
// every form is built from.
//
// DOM, not WebGL, for the reason client/src/render/ui.js gives: a panel is
// not in the world. Sized for a thumb -- nothing to hit is under 44px -- and
// the same on a desktop, where a big button costs nothing.
//
const STYLE = `
.st-layer{position:fixed;inset:0;pointer-events:none;z-index:50;
  font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e8f0ff}
/* WRAPS, because the bar is eight buttons now and a narrow phone is 360 CSS
   pixels: eight at their 56px floor plus the gaps does not fit on one row, and
   a bar that overflows puts More off the edge of the screen. */
.st-bar{position:absolute;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;gap:6px;padding:8px;
  padding-bottom:calc(8px + env(safe-area-inset-bottom));justify-content:center;pointer-events:auto;
  background:linear-gradient(transparent,rgba(11,13,18,.9) 40%)}
.st-bar button{flex:0 1 96px;min-width:56px;height:52px;border-radius:10px;
  background:rgba(27,34,48,.85);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);
  font:600 12px/1.1 ui-monospace,Menlo,monospace;cursor:pointer;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:3px}
.st-bar button .ico{font-size:18px;line-height:1}
.st-bar button[data-on="1"]{background:rgba(91,143,214,.55);border-color:rgba(207,227,255,.7)}
/* A phone held upright: the eight tools in ONE row of icon-first buttons
   (they fit at 390 CSS px once each takes an equal share), not three rows
   over the bottom third of the map. On its side: a lower bar. */
@media (max-width:600px) and (orientation:portrait){
  .st-bar{flex-wrap:nowrap;gap:4px;padding:6px;padding-bottom:calc(6px + env(safe-area-inset-bottom))}
  .st-bar button{flex:1 1 0;min-width:0;height:50px;font-size:9px;letter-spacing:-.2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 2px}
  .st-bar button .ico{font-size:17px}
}
@media (max-height:560px) and (orientation:landscape){
  .st-bar{padding:4px 6px;padding-bottom:calc(4px + env(safe-area-inset-bottom))}
  .st-bar button{height:42px;font-size:10px;gap:2px}
  .st-bar button .ico{font-size:15px}
}
.st-top{position:absolute;left:0;right:0;top:0;display:flex;gap:6px;align-items:flex-start;
  padding:8px;padding-top:calc(8px + env(safe-area-inset-top));padding-left:calc(8px + env(safe-area-inset-left));
  padding-right:calc(8px + env(safe-area-inset-right))}
.st-status{flex:1 1 auto;pointer-events:auto;cursor:pointer;background:rgba(11,13,18,.7);border-radius:8px;padding:6px 10px;
  font-size:12px;white-space:pre-wrap;max-height:30vh;overflow:auto;min-height:20px}
.st-status[data-level="error"]{color:#ff8a8a}
.st-status[data-level="warn"]{color:#ffd27a}
.st-status[data-level="ok"]{color:#9fe0b0}
.st-side{display:flex;gap:6px;pointer-events:auto}
.st-side button,.st-sheet button,.st-row button{min-width:44px;height:44px;border-radius:8px;
  background:rgba(27,34,48,.85);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);
  font:600 13px/1 ui-monospace,Menlo,monospace;cursor:pointer;padding:0 12px}
.st-side button[disabled]{opacity:.35}
.st-side button[data-on="1"]{background:rgba(91,143,214,.55)}
.st-sheet{position:absolute;left:0;right:0;bottom:0;max-height:62vh;display:flex;flex-direction:column;
  pointer-events:auto;background:rgba(18,20,26,.97);border-top:1px solid #3a3a44;border-radius:14px 14px 0 0;
  box-shadow:0 -8px 32px rgba(0,0,0,.5);transform:translateY(100%);transition:transform 160ms ease-out}
.st-sheet[data-open="1"]{transform:none}
/* Closing, it must stop taking taps at once, not when the slide has finished:
   the tap that dismissed it is usually followed by one on the floor. */
.st-sheet:not([data-open="1"]){pointer-events:none}
/* Landscape with room to spare: the sheet is a panel down the right side and
   the map keeps its full height; the bars step out of its way. */
@media (orientation: landscape) and (min-width: 700px) {
  .st-sheet{left:auto;top:0;bottom:0;right:0;width:min(420px,45vw);max-height:none;border-radius:14px 0 0 14px;
    border-top:0;border-left:1px solid #3a3a44;transform:translateX(100%);padding-top:env(safe-area-inset-top)}
  .st-sheet[data-open="1"]{transform:none}
  .st-layer[data-sheet="1"] .st-bar{right:min(420px,45vw)}
  .st-layer[data-sheet="1"] .st-top{right:min(420px,45vw)}
}
.st-sheet-title{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #3a3a44;font-weight:600}
.st-sheet-title span{flex:1 1 auto}
.st-sheet-body{padding:10px 14px;padding-bottom:calc(76px + env(safe-area-inset-bottom));overflow:auto;
  display:flex;flex-direction:column;gap:10px}
.st-row{display:flex;align-items:center;gap:8px;min-height:44px}
.st-row label{flex:0 0 7em;opacity:.8;font-size:12px}
.st-row input[type=range]{flex:1 1 auto;min-width:60px;height:44px}
.st-row input[type=number],.st-row input[type=text],.st-row select,.st-row textarea{
  flex:1 1 auto;min-width:0;height:40px;border-radius:8px;background:#151a24;color:#e8f0ff;
  border:1px solid #3a4454;font:inherit;padding:0 10px}
.st-row textarea{height:auto;min-height:80px;padding:8px}
.st-val{flex:0 0 4em;text-align:right;opacity:.75;font-variant-numeric:tabular-nums}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px}
.st-tile{height:72px;border-radius:8px;border:1px solid #3a4454;background:#151a24 center/cover;
  display:flex;align-items:flex-end;justify-content:center;cursor:pointer;overflow:hidden;position:relative}
.st-tile span{font-size:10px;background:rgba(11,13,18,.75);width:100%;text-align:center;padding:2px 0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-tile[data-on="1"]{border-color:#ffe066;box-shadow:0 0 0 2px #ffe066 inset}
.st-chip{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:18px;
  background:#1f2836;border:1px solid #3a4454;cursor:pointer;font-size:12px}
.st-chip[data-on="1"]{background:rgba(91,143,214,.55);border-color:rgba(207,227,255,.7)}
.st-chips{display:flex;flex-wrap:wrap;gap:6px}
.st-card{border:1px solid #3a4454;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;background:#12161e}
.st-card h4{margin:0;font-size:13px;display:flex;align-items:center;gap:8px}
.st-card h4 span{flex:1 1 auto}
.st-muted{opacity:.6;font-size:12px}
.st-danger{color:#ff8a8a}
.st-row select.st-sound[data-missing="1"]{border-color:#ff4d4d;color:#ff8a8a}
.st-problem{background:rgba(255,77,77,.12);border:1px solid rgba(255,77,77,.45);border-radius:8px;padding:8px 10px;white-space:pre-wrap;font-size:12px}
.st-warn-box{color:#ffd27a;background:rgba(255,169,77,.10);border:1px solid rgba(255,169,77,.4);border-radius:8px;padding:8px 10px;white-space:pre-wrap;font-size:12px}
.st-trow{display:flex;gap:10px;align-items:center;min-height:56px;border:1px solid #3a4454;border-radius:10px;
  padding:6px 12px;cursor:pointer;background:#12161e}
.st-trow:hover{background:#1a2130}
.st-trow[data-on="1"]{border-color:#ffe066}
/* The swing's two views, and the particle preview: both are pictures of
   numbers that are hard to read as numbers. */
.st-swing-canvas{width:100%;max-width:336px;aspect-ratio:336/172;background:#12161e;border:1px solid #2a3446;border-radius:10px;align-self:center}
.st-vfx-canvas{width:100%;max-width:320px;aspect-ratio:8/5;background:#0b0d12;border:1px solid #2a3446;border-radius:10px;align-self:center}
.st-thumb{width:96px;height:96px;border:1px solid #3a4454;border-radius:10px;background:#12161e;display:flex;align-items:center;
  justify-content:center;overflow:hidden;image-rendering:pixelated;color:#5f7fa8;font-size:24px;flex:0 0 auto}
.st-thumb img{max-width:100%;max-height:100%}
.st-trow .st-thumb{width:48px;height:48px;font-size:14px}
.st-trow-bad{border-color:#8a3a3a}
.st-trow-text{flex:1 1 auto;min-width:0}
.st-trow-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-mark{font-size:20px;line-height:1;flex:0 0 auto;width:28px;text-align:center}
.st-section{border-left:4px solid var(--tone);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:8px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 12%,transparent),transparent 60%)}
.st-section-head{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.06em;font-size:12px;color:var(--tone)}
.st-when{--tone:#ffcc66}
.st-if{--tone:#5b8fd6}
.st-then{--tone:#7ad48a}
.st-entry{flex:1 1 auto;font-weight:600}
.st-menu{position:absolute;right:8px;bottom:80px;display:flex;flex-direction:column;gap:4px;pointer-events:auto;
  background:rgba(18,20,26,.97);border:1px solid #3a3a44;border-radius:10px;padding:6px;min-width:200px;
  /* Taller than a phone on its side: it scrolls rather than running off the top. */
  max-height:calc(100vh - 96px - env(safe-area-inset-top));overflow-y:auto;overscroll-behavior:contain}
.st-menu button{flex:0 0 auto}
.st-menu button{height:44px;text-align:left;background:transparent;border:0;color:#e8f0ff;font:inherit;padding:0 12px;
  border-radius:6px;cursor:pointer}
.st-menu button:hover{background:#1f2836}
/* The sheet is dense: a phone shows a few rows of a room's numbers beside the
   map, and 44px rows showed three. Still finger-sized, just not spread out. */
.st-sheet{font-size:13px}
.st-sheet-title{padding:6px 10px;font-size:13px}
.st-sheet-body{gap:6px;padding:8px 10px;padding-bottom:calc(72px + env(safe-area-inset-bottom))}
.st-sheet .st-row{min-height:34px;gap:6px}
.st-sheet .st-row label{flex:0 0 6em;font-size:11px}
.st-sheet .st-row input[type=number],.st-sheet .st-row input[type=text],.st-sheet .st-row select{height:30px;padding:0 8px;font-size:12px}
.st-sheet .st-row textarea{min-height:64px;font-size:12px}
.st-sheet .st-row input[type=range]{height:30px}
.st-sheet button,.st-sheet .st-row button{min-width:34px;height:32px;padding:0 10px;font-size:12px}
.st-sheet .st-chip{height:28px;padding:0 9px;font-size:11px}
.st-sheet .st-tile{height:56px}
.st-sheet .st-card{padding:6px 8px;gap:5px}
.st-sheet .st-section{padding:6px 8px;gap:5px}
.st-sheet .st-section-head{font-size:11px}
.st-sheet .st-trow{min-height:44px;padding:4px 10px;gap:8px}
.st-sheet .st-mark{font-size:16px;width:22px}
.st-sheet .st-muted{font-size:11px}
/* A button that is there but has nowhere to go: the first waypoint cannot move
   earlier. Dimmed rather than removed, so the row does not reflow under a
   thumb that is already reaching for it. */
.st-dim{opacity:.4}
.st-panel-preview{position:relative;min-height:120px;margin-top:6px;border:1px dashed #3a4256;border-radius:8px;overflow:hidden}
.st-panel-preview .dnp-ui{position:absolute;top:8px;right:8px;left:8px;max-width:none}
.st-hidden{display:none!important}
/* A question: window.prompt is not there in Electron, nor in a phone's WebView
   without native help on each platform, so the studio asks with its own. */
.st-dialog{background:#12161e;color:#e8f0ff;border:1px solid #3a4454;border-radius:12px;padding:14px;width:min(360px,92vw);font:inherit}
.st-dialog::backdrop{background:rgba(0,0,0,.55)}
.st-dialog form{display:flex;flex-direction:column;gap:10px}
.st-dialog .st-row label{flex:1 1 auto}
.st-dialog .st-actions{justify-content:flex-end}
.st-layer[data-workshop="1"] .st-bar,.st-layer[data-workshop="1"] .st-top{display:none}
/* --- the monster workshop: its own windows over the whole screen --- */
/* The player's window has no graph, so its column is not allocated. */
.wk[data-nograph="1"]{grid-template-columns:340px 1fr;grid-template-areas:"top top" "preview details"}
.wk{position:fixed;inset:0;z-index:60;background:#0b0d12;color:#e8f0ff;display:grid;
  grid-template-rows:auto 1fr;grid-template-columns:340px 1fr 400px;grid-template-areas:"top top top" "preview graph details";
  font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding-top:env(safe-area-inset-top)}
.wk[hidden]{display:none}
.wk-top{grid-area:top;display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #2a3446;flex-wrap:wrap}
.wk-top button,.wk-bar button,.wk-details button,.wk-preview button{min-width:44px;height:40px;border-radius:8px;background:rgba(27,34,48,.85);
  color:#cfe3ff;border:1px solid rgba(207,227,255,.22);font:600 12px/1 ui-monospace,Menlo,monospace;cursor:pointer;padding:0 12px}
.wk-tabs{display:flex;gap:4px}
.wk-tabs button[data-on="1"]{background:rgba(91,143,214,.55);border-color:rgba(207,227,255,.7)}
.wk-preview{grid-area:preview;border-right:1px solid #2a3446;padding:10px;display:flex;flex-direction:column;gap:8px;overflow:auto}
.wk-title{font-weight:700}
.wk-canvas{width:100%;max-width:320px;aspect-ratio:1;background:#12161e;border:1px solid #2a3446;border-radius:10px;touch-action:none;
  image-rendering:pixelated;align-self:center}
.wk-graph{grid-area:graph;display:flex;flex-direction:column;min-height:0}
/* The bar is in the flow above the drawing, never floating over it: on a
   phone it wraps to rows, and a button over a state ate the finger that
   went for the state (the button's touch-action is scrolling's). */
.wk-bar{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap;padding:8px}
.wk-board{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;touch-action:none;
  background-image:radial-gradient(#1b2230 1px,transparent 1px);background-size:24px 24px}
.wk-world{position:absolute;left:0;top:0;width:4000px;height:4000px;transform-origin:0 0}
.wk-edges{position:absolute;left:0;top:0;width:4000px;height:4000px;overflow:visible}
.wk-edge{fill:none;stroke:#8fa6c4;stroke-width:2}
.wk-edge-next{stroke-dasharray:8 6;stroke:#ffcc66}
.wk-edge-goto{stroke-dasharray:2 5;stroke:#7ad48a}
.wk-label{font:11px ui-monospace,Menlo,monospace;fill:#cfe3ff;paint-order:stroke;stroke:#0b0d12;stroke-width:4px;cursor:pointer;pointer-events:auto}
.wk-node{position:absolute;width:168px;height:72px;box-sizing:border-box;border:1px solid #3a4454;border-radius:10px;background:#12161e;
  padding:8px 10px;cursor:grab;user-select:none;touch-action:none;display:flex;flex-direction:column;gap:2px;font-size:11px}
.wk-node-name{font-weight:700;font-size:13px}
.wk-node-on{border-color:#ffe066;box-shadow:0 0 0 2px #ffe066 inset}
.wk-node-bad{border-color:#ff8a8a}
.wk-details{grid-area:details;border-left:1px solid #2a3446;padding:10px;display:flex;flex-direction:column;gap:10px;overflow:auto;
  padding-bottom:calc(20px + env(safe-area-inset-bottom))}
.wk-flash{outline:2px solid #ffe066}
@media (max-width:1100px){
  .wk,.wk[data-nograph="1"]{grid-template-columns:1fr;grid-template-areas:"top" "main"}
  .wk-preview,.wk-graph,.wk-details{grid-area:main;display:none;border:0}
  .wk[data-pane="preview"] .wk-preview{display:flex}
  .wk[data-pane="graph"] .wk-graph{display:flex}
  .wk[data-pane="details"] .wk-details{display:flex}
}
/* A phone on its side: the picture beside its controls, not above them
   with the animation list below the fold. The canvas takes the height. */
@media (max-width:1100px) and (orientation:landscape){
  .wk[data-pane="preview"] .wk-preview{display:grid;grid-template-columns:auto minmax(0,1fr);grid-auto-rows:min-content;column-gap:16px;align-content:start}
  .wk-preview .wk-title{grid-column:1/-1}
  .wk-canvas{grid-column:1;grid-row:2/span 8;width:min(320px,calc(100vh - 150px));max-width:none;align-self:start}
}
@media (min-width:1101px){ .wk-top .wk-tabs{display:none} }
/* THE PLAYER on a phone: no graph, so the picture and the forms both fit --
   side by side when it is on its side, one scrolling column when upright --
   rather than one pane at a time behind a switch. */
@media (max-width:1100px) and (orientation:landscape){
  .wk[data-nograph="1"]{grid-template-columns:minmax(220px,38%) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"top top" "preview details"}
  .wk[data-nograph="1"] .wk-preview{display:flex;grid-area:preview;min-height:0;overflow-y:auto;border-right:1px solid #2a3446}
  .wk[data-nograph="1"] .wk-details{display:flex;grid-area:details;min-height:0;overflow-y:auto}
  .wk[data-nograph="1"] .wk-top .wk-tabs{display:none}
  .wk[data-nograph="1"] .wk-canvas{width:100%;max-width:240px}
}
@media (max-width:1100px) and (orientation:portrait){
  .wk[data-nograph="1"]{display:block;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .wk[data-nograph="1"] .wk-preview,.wk[data-nograph="1"] .wk-details{display:flex;overflow:visible;border:0}
  .wk[data-nograph="1"] .wk-preview{border-bottom:1px solid #2a3446}
  .wk[data-nograph="1"] .wk-top .wk-tabs{display:none}
  .wk[data-nograph="1"] .wk-canvas{max-width:min(320px,70vw)}
}
`

const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'text') e.textContent = v
    else if (k === 'html') e.innerHTML = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (v !== null && v !== undefined) e.setAttribute(k, v)
  }
  for (const c of [].concat(children)) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  return e
}
export { el }

export const TOOLS = [
  { id: 'select', label: 'Select', ico: '⌖' },
  { id: 'room', label: 'Room', ico: '▭' },
  { id: 'place', label: 'Place', ico: '✦' },
  { id: 'trigger', label: 'Triggers', ico: '⚡' },
  { id: 'camera', label: 'Camera', ico: '🎥' },
  { id: 'graph', label: 'Graph', ico: '◇' },
  { id: 'play', label: 'Play', ico: '▶' },
  { id: 'menu', label: 'More', ico: '⋯' }
]

export class Ui {
  /** @param on  { tool(id), undo(), redo(), view(mode), rotate(dir), menu(action) } */
  constructor (on) {
    this.on = on
    document.head.appendChild(el('style', { text: STYLE }))
    this.layer = el('div', { class: 'st-layer' })
    this.status = el('div', { class: 'st-status', text: '' })
    this.undoBtn = el('button', { text: '↶', title: 'undo', onclick: () => on.undo() })
    this.redoBtn = el('button', { text: '↷', title: 'redo', onclick: () => on.redo() })
    this.viewBtn = el('button', { text: 'PLAN', title: 'plan / game view', onclick: () => on.view() })
    this.rotL = el('button', { text: '⟲', title: 'rotate', onclick: () => on.rotate(-1) })
    this.rotR = el('button', { text: '⟳', title: 'rotate', onclick: () => on.rotate(1) })
    // Back to the module, on a phone held upright where there is no rail.
    this.homeBtn = el('button', { class: 'st-home-btn', text: '‹', title: 'the module', onclick: () => on.home?.() })
    this.side = el('div', { class: 'st-side' }, [this.homeBtn, this.undoBtn, this.redoBtn, this.rotL, this.rotR, this.viewBtn])
    this.top = el('div', { class: 'st-top' }, [this.status, this.side])
    this.bar = el('div', { class: 'st-bar' })
    this.buttons = {}
    for (const t of TOOLS) {
      const b = el('button', { onclick: () => on.tool(t.id) }, [el('span', { class: 'ico', text: t.ico }), el('span', { text: t.label })])
      this.buttons[t.id] = b
      this.bar.appendChild(b)
    }
    this.sheetTitle = el('span')
    this.sheetBody = el('div', { class: 'st-sheet-body' })
    this.sheet = el('div', { class: 'st-sheet' }, [
      el('div', { class: 'st-sheet-title' }, [this.sheetTitle, el('button', { text: '✕', onclick: () => this.hideSheet() })]),
      this.sheetBody
    ])
    this.menu = el('div', { class: 'st-menu st-hidden' })
    this.layer.append(this.top, this.sheet, this.menu, this.bar)
    document.body.appendChild(this.layer)
    this.onSheetClose = null
  }

  setTool (id) {
    for (const [k, b] of Object.entries(this.buttons)) b.dataset.on = k === id ? '1' : '0'
  }

  setHistory (canUndo, canRedo) {
    this.undoBtn.disabled = !canUndo
    this.redoBtn.disabled = !canRedo
  }

  setView (mode) {
    this.viewBtn.textContent = mode === 'plan' ? 'PLAN' : 'GAME'
    this.rotL.classList.toggle('st-hidden', mode === 'plan')
    this.rotR.classList.toggle('st-hidden', mode === 'plan')
  }

  setStatus (text, level = '') {
    this.status.textContent = text
    this.status.dataset.level = level
    this.status.classList.toggle('st-hidden', !text)
  }

  showSheet (title, body, onClose = null) {
    // A section that was a sheet is a page now: while it is up, its rows go
    // there (app/shell.js), and everything else still slides up as a sheet.
    if (this.pageTitles && this.pageTitles.test(title) && this.pageSink) return this.pageSink(title, body, onClose)
    // Drawn again after every edit; the same sheet keeps its place. A
    // different sheet taking over closes the old one properly.
    const same = this.sheet.dataset.open === '1' && this.sheetTitle.textContent === title
    const keep = same ? this.sheetBody.scrollTop : 0
    if (!same && this.onSheetClose) { const cb = this.onSheetClose; this.onSheetClose = null; cb() }
    this.sheetTitle.textContent = title
    this.sheetBody.replaceChildren(...[].concat(body).filter(Boolean))
    this.sheet.dataset.open = '1'
    this.layer.dataset.sheet = '1'
    this.onSheetClose = onClose
    this.sheetBody.scrollTop = keep
  }

  hideSheet () {
    if (this.sheet.dataset.open !== '1') return
    this.sheet.dataset.open = '0'
    this.layer.dataset.sheet = '0'
    const cb = this.onSheetClose
    this.onSheetClose = null
    cb?.()
  }

  get sheetOpen () { return this.sheet.dataset.open === '1' }

  showMenu (items) {
    this.menu.replaceChildren(...items.map(([label, fn]) => el('button', { text: label, onclick: () => { this.hideMenu(); fn() } })))
    this.menu.classList.remove('st-hidden')
    const off = (e) => { if (!this.menu.contains(e.target)) { this.hideMenu(); removeEventListener('pointerdown', off, true) } }
    setTimeout(() => addEventListener('pointerdown', off, true), 0)
  }

  hideMenu () { this.menu.classList.add('st-hidden') }
}

// --- controls -------------------------------------------------------------------

export function row (label, ...controls) {
  return el('div', { class: 'st-row' }, [el('label', { text: label }), ...controls])
}

/** A number with a slider and an exact readout. `step` keeps it on the grid. */
export function slider (label, value, { min, max, step = 0.25 }, onChange) {
  const val = el('span', { class: 'st-val', text: String(value) })
  const input = el('input', { type: 'range', min, max, step, value })
  input.addEventListener('input', () => { val.textContent = input.value; onChange(Number(input.value), false) })
  input.addEventListener('change', () => onChange(Number(input.value), true))
  return row(label, input, val)
}

export function number (label, value, { min, max, step = 0.25 }, onChange) {
  const input = el('input', { type: 'number', min, max, step, value })
  input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v)) onChange(v, true) })
  return row(label, input)
}

export function text (label, value, onChange, { placeholder = '', multiline = false } = {}) {
  const input = multiline ? el('textarea', { placeholder }) : el('input', { type: 'text', value: value ?? '', placeholder })
  if (multiline) input.value = value ?? ''
  input.addEventListener('change', () => onChange(input.value))
  return row(label, input)
}

export function toggle (label, value, onChange) {
  const b = el('button', { text: value ? 'on' : 'off', 'data-on': value ? '1' : '0' })
  b.addEventListener('click', () => { const v = b.dataset.on !== '1'; b.dataset.on = v ? '1' : '0'; b.textContent = v ? 'on' : 'off'; onChange(v) })
  return row(label, b)
}

export function select (label, value, options, onChange) {
  const s = el('select', {}, options.map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, o]
    const opt = el('option', { value: v, text: t })
    if (v === value) opt.selected = true
    return opt
  }))
  s.addEventListener('change', () => onChange(s.value))
  return row(label, s)
}

export function button (label, onClick, cls = '') {
  return el('button', { text: label, class: cls, onclick: onClick })
}

export function chips (items, onPick) {
  return el('div', { class: 'st-chips' }, items.map((it) => {
    const c = el('div', { class: 'st-chip', text: it.label, 'data-on': it.on ? '1' : '0' })
    c.addEventListener('click', () => onPick(it))
    return c
  }))
}

/** A grid of picture tiles; `items`: [{ id, label, image?, on? }]. */
export function tiles (items, onPick) {
  return el('div', { class: 'st-grid' }, items.map((it) => {
    const t = el('div', { class: 'st-tile', 'data-on': it.on ? '1' : '0' }, [el('span', { text: it.label })])
    if (it.image) t.style.backgroundImage = `url("${it.image}")`
    t.addEventListener('click', () => onPick(it))
    return t
  }))
}

export function card (title, body, actions = []) {
  return el('div', { class: 'st-card' }, [el('h4', {}, [el('span', { text: title }), ...actions]), ...[].concat(body)])
}

export function muted (t) { return el('div', { class: 'st-muted', text: t }) }

// A modal question, resolved when it closes. Not window.prompt/confirm: Electron
// does not implement prompt, and a WebView shows neither without native help
// on each platform -- one <dialog> is the same everywhere.
function dialog (body, okLabel) {
  return new Promise((resolve) => {
    const cancel = el('button', { type: 'button', text: 'cancel', onclick: () => dlg.close('') })
    const ok = el('button', { type: 'submit', value: 'ok', text: okLabel })
    const dlg = el('dialog', { class: 'st-dialog' }, [el('form', { method: 'dialog' }, [...body, el('div', { class: 'st-row st-actions' }, [cancel, ok])])])
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove() })
    document.body.appendChild(dlg)
    dlg.showModal()
  })
}

/** A question with one typed answer: the string, or null when dismissed. */
export async function ask (label, value = '') {
  const input = el('input', { type: 'text', value, autofocus: '' })
  const p = dialog([row(label, input)], 'OK')
  input.select()
  return (await p) ? input.value : null
}

/** A yes/no question: true when confirmed. */
export function confirmDialog (question) {
  return dialog([el('div', { text: question })], 'yes')
}
