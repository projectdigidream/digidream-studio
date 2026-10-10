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
  font:14px/1.4 var(--dnp-font-ui);color:var(--dnp-color-text-primary)}
/* WRAPS, because the bar is eight buttons now and a narrow phone is 360 CSS
   pixels: eight at their 56px floor plus the gaps does not fit on one row, and
   a bar that overflows puts More off the edge of the screen. */
.st-bar{position:absolute;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;gap:6px;padding:8px;
  padding-bottom:calc(8px + env(safe-area-inset-bottom));justify-content:center;pointer-events:auto;
  background:linear-gradient(transparent,color-mix(in srgb,var(--dnp-color-bg-app) 90%,transparent) 40%)}
.st-bar button{flex:0 1 96px;min-width:56px;height:52px;border-radius:10px;
  background:var(--dnp-color-bg-raised);color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);
  font:600 12px/1.1 var(--dnp-font-ui);cursor:pointer;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:3px}
/* Icons (icon(id)): as tall as the text round them, unless a place says otherwise. */
.ui-icon.st-i{--icon-size:1.25em;vertical-align:-.25em}
.st-i-label{margin-left:.4em}
.st-bar button .ico{font-size:18px;line-height:1;--icon-size:20px}
.st-bar button[data-on="1"]{background:color-mix(in srgb,var(--dnp-color-accent) 55%,transparent);border-color:color-mix(in srgb,var(--dnp-color-text-primary) 70%,transparent)}
/* A phone held upright: the eight tools in ONE row of icon-first buttons
   (they fit at 390 CSS px once each takes an equal share), not three rows
   over the bottom third of the map. On its side: a lower bar. */
@media (max-width:600px) and (orientation:portrait){
  .st-bar{flex-wrap:nowrap;gap:4px;padding:6px;padding-bottom:calc(6px + env(safe-area-inset-bottom))}
  .st-bar button{flex:1 1 0;min-width:0;height:50px;font-size:9px;letter-spacing:-.2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 2px}
  .st-bar button .ico{font-size:17px;--icon-size:19px}
}
@media (max-height:560px) and (orientation:landscape){
  .st-bar{padding:4px 6px;padding-bottom:calc(4px + env(safe-area-inset-bottom))}
  .st-bar button{height:42px;font-size:10px;gap:2px}
  .st-bar button .ico{font-size:15px;--icon-size:16px}
}
.st-top{position:absolute;left:0;right:0;top:0;display:flex;gap:6px;align-items:flex-start;
  padding:8px;padding-top:calc(8px + env(safe-area-inset-top));padding-left:calc(8px + env(safe-area-inset-left));
  padding-right:calc(8px + env(safe-area-inset-right))}
.st-status{flex:1 1 auto;pointer-events:auto;cursor:pointer;background:color-mix(in srgb,var(--dnp-color-bg-app) 70%,transparent);border-radius:8px;padding:6px 10px;
  font-size:12px;white-space:pre-wrap;max-height:30vh;overflow:auto;min-height:20px}
.st-status[data-level="error"]{color:var(--dnp-color-error)}
.st-status[data-level="warn"]{color:var(--dnp-color-warn)}
.st-status[data-level="ok"]{color:var(--dnp-color-ok)}
.st-side{display:flex;gap:6px;pointer-events:auto}
.st-side button,.st-sheet button,.st-row button{min-width:44px;height:44px;border-radius:8px;
  background:var(--dnp-color-bg-raised);color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);
  font:600 13px/1 var(--dnp-font-ui);cursor:pointer;padding:0 12px}
.st-side button[disabled]{opacity:.35}
.st-side button[data-on="1"]{background:color-mix(in srgb,var(--dnp-color-accent) 55%,transparent)}
.st-sheet{position:absolute;left:0;right:0;bottom:0;max-height:62vh;display:flex;flex-direction:column;
  pointer-events:auto;background:var(--dnp-color-bg-overlay);border-top:1px solid var(--dnp-color-line-strong);border-radius:14px 14px 0 0;
  box-shadow:var(--dnp-shadow-raised);transform:translateY(100%);transition:transform 160ms ease-out}
.st-sheet[data-open="1"]{transform:none}
/* Closing, it must stop taking taps at once, not when the slide has finished:
   the tap that dismissed it is usually followed by one on the floor. */
.st-sheet:not([data-open="1"]){pointer-events:none}
/* Landscape with room to spare: the sheet is a panel down the right side and
   the map keeps its full height; the bars step out of its way. */
@media (orientation: landscape) and (min-width: 700px) {
  .st-sheet{left:auto;top:0;bottom:0;right:0;width:min(420px,45vw);max-height:none;border-radius:14px 0 0 14px;
    border-top:0;border-left:1px solid var(--dnp-color-line-strong);transform:translateX(100%);padding-top:env(safe-area-inset-top)}
  .st-sheet[data-open="1"]{transform:none}
  .st-layer[data-sheet="1"] .st-bar{right:min(420px,45vw)}
  .st-layer[data-sheet="1"] .st-top{right:min(420px,45vw)}
}
.st-sheet-title{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dnp-color-line-strong);font-weight:600}
.st-sheet-title span{flex:1 1 auto}
.st-sheet-body{padding:10px 14px;padding-bottom:calc(76px + env(safe-area-inset-bottom));overflow:auto;
  display:flex;flex-direction:column;gap:10px}
.st-row{display:flex;align-items:center;gap:8px;min-height:44px}
.st-has-help{flex-wrap:wrap}
.st-sheet-v{background-size:100% calc(var(--frames) * 100%) !important;background-repeat:no-repeat;animation:st-sheet-v var(--sheet-s) steps(var(--frames), jump-none) infinite}
.st-sheet-h{background-size:calc(var(--frames) * 100%) 100% !important;background-repeat:no-repeat;animation:st-sheet-h var(--sheet-s) steps(var(--frames), jump-none) infinite}
@keyframes st-sheet-v{from{background-position:0 0%}to{background-position:0 100%}}
@keyframes st-sheet-h{from{background-position:0% 0}to{background-position:100% 0}}
.st-row.st-has-help > input:not([type=checkbox]),.st-row.st-has-help > select:not([multiple]){min-width:0;flex:1 1 0}
.st-help{flex:0 0 auto;width:26px;height:26px;min-width:0;min-height:0;padding:0;border-radius:50%;font-size:13px;line-height:24px;opacity:.7;background:transparent;border:1px solid color-mix(in srgb,var(--dnp-color-text-primary) 25%,transparent);color:var(--dnp-color-text-primary)}
.st-help[data-on="1"]{opacity:1;border-color:var(--dnp-color-accent);background:color-mix(in srgb,var(--dnp-color-accent) 20%,transparent)}
.st-help-text{flex:1 1 100%;font:12px/1.45 var(--dnp-font-ui);color:var(--dnp-color-text-secondary);white-space:pre-wrap;padding:2px 2px 6px}
.st-row label{flex:0 0 7em;opacity:.8;font-size:12px}
.st-row input[type=range]{flex:1 1 auto;min-width:60px;height:44px}
.st-row input[type=number],.st-row input[type=text],.st-row select,.st-row textarea{
  flex:1 1 auto;min-width:0;height:40px;border-radius:8px;background:var(--dnp-color-bg-input);color:var(--dnp-color-text-primary);
  border:1px solid var(--dnp-color-line-strong);font:inherit;padding:0 10px}
.st-row textarea{height:auto;min-height:80px;padding:8px}
.st-val{flex:0 0 4em;text-align:right;opacity:.75;font-variant-numeric:tabular-nums}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px}
.st-tile{height:72px;border-radius:8px;border:1px solid var(--dnp-color-line-strong);background:var(--dnp-color-bg-input) center/cover;
  display:flex;align-items:flex-end;justify-content:center;cursor:pointer;overflow:hidden;position:relative}
.st-tile span{font-size:10px;background:color-mix(in srgb,var(--dnp-color-bg-app) 75%,transparent);width:100%;text-align:center;padding:2px 0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-tile[data-on="1"]{border-color:var(--dnp-color-select);box-shadow:0 0 0 2px var(--dnp-color-select) inset}
.st-chip{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:18px;
  background:var(--dnp-color-bg-hover);border:1px solid var(--dnp-color-line-strong);cursor:pointer;font-size:12px}
.st-chip[data-on="1"]{background:color-mix(in srgb,var(--dnp-color-accent) 55%,transparent);border-color:color-mix(in srgb,var(--dnp-color-text-primary) 70%,transparent)}
.st-chips{display:flex;flex-wrap:wrap;gap:6px}
.st-card{border:1px solid var(--dnp-color-line-strong);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;background:var(--dnp-color-bg-panel)}
.st-card h4{margin:0;font-size:13px;display:flex;align-items:center;gap:8px}
.st-card h4 span{flex:1 1 auto}
.st-muted{opacity:.6;font-size:12px}
.st-danger{color:var(--dnp-color-error)}
.st-row select.st-sound[data-missing="1"]{border-color:var(--dnp-color-error);color:var(--dnp-color-error)}
.st-problem{background:color-mix(in srgb,var(--dnp-color-error) 12%,transparent);border:1px solid color-mix(in srgb,var(--dnp-color-error) 45%,transparent);border-radius:8px;padding:8px 10px;white-space:pre-wrap;font-size:12px}
.st-warn-box{color:var(--dnp-color-warn);background:color-mix(in srgb,var(--dnp-color-warn) 10%,transparent);border:1px solid color-mix(in srgb,var(--dnp-color-warn) 40%,transparent);border-radius:8px;padding:8px 10px;white-space:pre-wrap;font-size:12px}
.st-trow{display:flex;gap:10px;align-items:center;min-height:56px;border:1px solid var(--dnp-color-line-strong);border-radius:10px;
  padding:6px 12px;cursor:pointer;background:var(--dnp-color-bg-panel)}
.st-trow:hover{background:var(--dnp-color-bg-hover)}
.st-trow[data-on="1"]{border-color:var(--dnp-color-select)}
/* The swing's two views, and the particle preview: both are pictures of
   numbers that are hard to read as numbers. */
.st-swing-canvas{width:100%;max-width:336px;aspect-ratio:336/172;background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);border-radius:10px;align-self:center}
.st-vfx-canvas{width:100%;max-width:320px;aspect-ratio:8/5;background:var(--dnp-color-bg-app);border:1px solid var(--dnp-color-line-main);border-radius:10px;align-self:center}
.st-thumb{width:96px;height:96px;border:1px solid var(--dnp-color-line-strong);border-radius:10px;background:var(--dnp-color-bg-panel);display:flex;align-items:center;
  justify-content:center;overflow:hidden;image-rendering:pixelated;color:var(--dnp-color-text-dim);font-size:24px;flex:0 0 auto}
.st-thumb img{max-width:100%;max-height:100%}
.st-trow .st-thumb{width:48px;height:48px;font-size:14px}
.st-trow-bad{border-color:var(--dnp-color-error)}
.st-trow-text{flex:1 1 auto;min-width:0}
.st-trow-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-mark{font-size:20px;line-height:1;flex:0 0 auto;width:28px;text-align:center}
.st-section{border-left:4px solid var(--tone);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:8px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 12%,transparent),transparent 60%)}
.st-section-head{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.06em;font-size:12px;color:var(--tone)}
.st-when{--tone:var(--dnp-color-tone-when)}
.st-if{--tone:var(--dnp-color-tone-if)}
.st-then{--tone:var(--dnp-color-tone-then)}
.st-entry{flex:1 1 auto;font-weight:600}
.st-menu{position:absolute;right:8px;bottom:80px;display:flex;flex-direction:column;gap:4px;pointer-events:auto;
  background:var(--dnp-color-bg-overlay);border:1px solid var(--dnp-color-line-strong);border-radius:10px;padding:6px;min-width:200px;
  /* Taller than a phone on its side: it scrolls rather than running off the top. */
  max-height:calc(100vh - 96px - env(safe-area-inset-top));overflow-y:auto;overscroll-behavior:contain}
.st-menu button{flex:0 0 auto}
.st-menu button{height:44px;text-align:left;background:transparent;border:0;color:var(--dnp-color-text-primary);font:inherit;padding:0 12px;
  border-radius:6px;cursor:pointer}
.st-menu button:hover{background:var(--dnp-color-bg-hover)}
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
.st-panel-preview{position:relative;min-height:120px;margin-top:6px;border:1px dashed var(--dnp-color-line-strong);border-radius:8px;overflow:hidden}
.st-panel-preview .dnp-ui{position:absolute;top:8px;right:8px;left:8px;max-width:none}
.st-hidden{display:none!important}
/* A question: window.prompt is not there in Electron, nor in a phone's WebView
   without native help on each platform, so the studio asks with its own. */
.st-dialog{background:var(--dnp-color-bg-panel);color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);border-radius:12px;padding:14px;width:min(360px,92vw);font:inherit}
.st-dialog::backdrop{background:var(--dnp-color-scrim)}
.st-dialog form{display:flex;flex-direction:column;gap:10px}
.st-dialog .st-row label{flex:1 1 auto}
.st-dialog .st-actions{justify-content:flex-end}
.st-layer[data-workshop="1"] .st-bar,.st-layer[data-workshop="1"] .st-top{display:none}
/* --- the monster workshop: its own windows over the whole screen --- */
/* The player's window has no graph, so its column is not allocated. */
.wk[data-nograph="1"]{grid-template-columns:340px 1fr;grid-template-areas:"top top" "preview details"}
.wk{position:fixed;inset:0;z-index:60;background:var(--dnp-color-bg-app);color:var(--dnp-color-text-primary);display:grid;
  grid-template-rows:auto 1fr;grid-template-columns:340px 1fr 400px;grid-template-areas:"top top top" "preview graph details";
  font:14px/1.4 var(--dnp-font-ui);padding-top:env(safe-area-inset-top)}
.wk[hidden]{display:none}
.wk-top{grid-area:top;display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--dnp-color-line-main);flex-wrap:wrap}
.wk-top button,.wk-bar button,.wk-details button,.wk-preview button{min-width:44px;height:40px;border-radius:8px;background:var(--dnp-color-bg-raised);
  color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);font:600 12px/1 var(--dnp-font-ui);cursor:pointer;padding:0 12px}
.wk-tabs{display:flex;gap:4px}
.wk-tabs button[data-on="1"]{background:color-mix(in srgb,var(--dnp-color-accent) 55%,transparent);border-color:color-mix(in srgb,var(--dnp-color-text-primary) 70%,transparent)}
.wk-preview{grid-area:preview;border-right:1px solid var(--dnp-color-line-main);padding:10px;display:flex;flex-direction:column;gap:8px;overflow:auto}
.wk-title{font-weight:700}
.wk-canvas{width:100%;max-width:320px;aspect-ratio:1;background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);border-radius:10px;touch-action:none;
  image-rendering:pixelated;align-self:center}
.wk-graph{grid-area:graph;display:flex;flex-direction:column;min-height:0}
/* The bar is in the flow above the drawing, never floating over it: on a
   phone it wraps to rows, and a button over a state ate the finger that
   went for the state (the button's touch-action is scrolling's). */
.wk-bar{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap;padding:8px}
.wk-board{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;touch-action:none;
  background-color:var(--cv-graph-board);background-image:radial-gradient(var(--cv-graph-dot-fill) 1px,transparent 1px);background-size:var(--cv-graph-dot-size) var(--cv-graph-dot-size)}
.wk-zoom{position:absolute;right:8px;bottom:8px;z-index:5;display:flex;align-items:center;gap:4px;background:color-mix(in srgb,var(--dnp-color-bg-app) 85%,transparent);border:1px solid var(--dnp-color-line-main);border-radius:10px;padding:4px}
.wk-zoom button{min-width:36px;height:34px;padding:0 8px;border-radius:8px;background:var(--dnp-color-bg-raised);color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);font:600 15px/1 var(--dnp-font-ui);cursor:pointer}
.wk-zoom-pct{font:600 11px var(--dnp-font-mono);color:var(--dnp-color-text-secondary);min-width:42px;text-align:center}
.wk-world{position:absolute;left:0;top:0;width:4000px;height:4000px;transform-origin:0 0}
.wk-edges{position:absolute;left:0;top:0;width:4000px;height:4000px;overflow:visible}
.wk-edge{fill:none;stroke:var(--cv-graph-edge-transition);stroke-width:var(--cv-graph-edge-transition-width)}
.wk-edge-next{stroke-dasharray:8 6;stroke:var(--cv-graph-edge-next);stroke-width:var(--cv-graph-edge-next-width)}
.wk-edge-goto{stroke-dasharray:2 5;stroke:var(--cv-graph-edge-goto);stroke-width:var(--cv-graph-edge-goto-width)}
.wk-label{font:var(--cv-graph-edge-label-font);fill:var(--cv-graph-edge-label);paint-order:stroke;stroke:var(--cv-graph-edge-label-fill);stroke-width:4px;cursor:pointer;pointer-events:auto}
.wk-node{position:absolute;width:168px;height:72px;box-sizing:border-box;border:var(--cv-graph-state-width) solid var(--cv-graph-state);border-radius:var(--cv-graph-state-radius);background:var(--cv-graph-state-fill);
  padding:8px 10px;cursor:grab;user-select:none;touch-action:none;display:flex;flex-direction:column;gap:2px;font-size:11px}
.wk-node-name{font-weight:700;font-size:13px}
.wk-node-on{border-color:var(--cv-graph-state-selected);box-shadow:0 0 0 var(--cv-graph-state-selected-width) var(--cv-graph-state-selected) inset}
.wk-node-bad{border-color:var(--cv-graph-state-bad)}
.wk-details{grid-area:details;border-left:1px solid var(--dnp-color-line-main);padding:10px;display:flex;flex-direction:column;gap:10px;overflow:auto;
  padding-bottom:calc(20px + env(safe-area-inset-bottom))}
.wk-flash{outline:2px solid var(--dnp-color-select)}
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
  .wk[data-nograph="1"] .wk-preview{display:flex;grid-area:preview;min-height:0;overflow-y:auto;border-right:1px solid var(--dnp-color-line-main)}
  .wk[data-nograph="1"] .wk-details{display:flex;grid-area:details;min-height:0;overflow-y:auto}
  .wk[data-nograph="1"] .wk-top .wk-tabs{display:none}
  .wk[data-nograph="1"] .wk-canvas{width:100%;max-width:240px}
}
@media (max-width:1100px) and (orientation:portrait){
  .wk[data-nograph="1"]{display:block;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .wk[data-nograph="1"] .wk-preview,.wk[data-nograph="1"] .wk-details{display:flex;overflow:visible;border:0}
  .wk[data-nograph="1"] .wk-preview{border-bottom:1px solid var(--dnp-color-line-main)}
  .wk[data-nograph="1"] .wk-top .wk-tabs{display:none}
  .wk[data-nograph="1"] .wk-canvas{max-width:min(320px,70vw)}
}
`

const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'text') { if (v !== null && v !== undefined) e.append(String(v)) }
    // An icon by catalog id, before any text: el('button', { icon: 'action.close' }).
    else if (k === 'icon') { if (v) e.prepend(icon(v)) }
    else if (k === 'html') e.innerHTML = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (v !== null && v !== undefined) e.setAttribute(k, v)
  }
  for (const c of [].concat(children)) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  return e
}
export { el }

// --- icons (docs/STUDIO_SKINS.md, phase 3) -----------------------------------------
// Every icon the studio shows is a catalog id (vendor/uikit/catalog/icons.json):
// drawn by the skin when it has a picture for it, else today's glyph, so
// nothing disappears. A plugin's own glyph (no dot in it) is shown as given.
const icons = { skin: null, glyphs: new Map() }

/** The skin to draw icons with, and the catalog of ids and their glyphs. */
export function useIcons (skin, catalog) {
  icons.skin = skin
  for (const g of catalog?.groups ?? []) for (const [n, , glyph] of g.icons) icons.glyphs.set(`${g.id}.${n}`, glyph)
}

/** The glyph an id stands for (the catalog's), or the string itself when it is not an id. */
export function glyphOf (id) { return icons.glyphs.get(id) ?? (String(id).includes('.') ? '' : String(id ?? '')) }

/** The skin's picture for an id, as a URL, and whether it is tinted; null when the skin draws none. */
export function iconPicture (id) {
  const url = String(id).includes('.') ? icons.skin?.view?.iconUrl(id) : null
  return url ? { url, tinted: icons.skin.view.iconTinted(id) } : null
}

function paintIcon (e) {
  const pic = iconPicture(e.dataset.icon)
  e.classList.add('ui-icon', 'st-i')
  e.classList.toggle('is-glyph', !pic)
  e.classList.toggle('is-img', !!pic && !pic.tinted)
  if (pic) { e.style.setProperty('--icon', `url("${pic.url}")`); e.textContent = '' } else { e.style.removeProperty('--icon'); e.textContent = glyphOf(e.dataset.icon) }
}

/** An icon, by catalog id: <span class="ui-icon" data-icon=…>. Size: --icon-size. */
export function icon (id, cls = '') {
  const e = document.createElement('span')
  e.dataset.icon = id
  if (cls) e.className = cls
  e.setAttribute('aria-hidden', 'true')
  paintIcon(e)
  return e
}

/** An icon and a label, as children: button(withIcon('action.export', 'export'), …). */
export const withIcon = (id, label) => [icon(id), label ? el('span', { class: 'st-i-label', text: label }) : null].filter(Boolean)

/** Draw every icon on the page again (the skin changed). */
export function refreshIcons (root = document) { for (const e of root.querySelectorAll('[data-icon]')) paintIcon(e) }

export const TOOLS = [
  { id: 'select', label: 'Select', ico: 'maptool.select' },
  { id: 'room', label: 'Room', ico: 'maptool.room' },
  { id: 'place', label: 'Place', ico: 'maptool.place' },
  { id: 'trigger', label: 'Triggers', ico: 'maptool.triggers' },
  { id: 'camera', label: 'Camera', ico: 'maptool.camera' },
  { id: 'graph', label: 'Graph', ico: 'maptool.graph' },
  { id: 'play', label: 'Play', ico: 'maptool.play' },
  { id: 'menu', label: 'More', ico: 'maptool.more' }
]

export class Ui {
  /** @param on  { tool(id), undo(), redo(), view(mode), rotate(dir), menu(action) } */
  constructor (on) {
    this.on = on
    document.head.appendChild(el('style', { text: STYLE }))
    this.layer = el('div', { class: 'st-layer' })
    this.status = el('div', { class: 'st-status', text: '' })
    this.undoBtn = el('button', { title: 'undo', onclick: () => on.undo() }, [icon('action.undo')])
    this.redoBtn = el('button', { title: 'redo', onclick: () => on.redo() }, [icon('action.redo')])
    this.viewBtn = el('button', { text: 'PLAN', title: 'plan / game view', onclick: () => on.view() })
    this.rotL = el('button', { title: 'rotate', onclick: () => on.rotate(-1) }, [icon('action.rotateleft')])
    this.rotR = el('button', { title: 'rotate', onclick: () => on.rotate(1) }, [icon('action.rotate')])
    // Back to the module, on a phone held upright where there is no rail.
    this.homeBtn = el('button', { class: 'st-home-btn', title: 'the module', onclick: () => on.home?.() }, [icon('action.back')])
    this.side = el('div', { class: 'st-side' }, [this.homeBtn, this.undoBtn, this.redoBtn, this.rotL, this.rotR, this.viewBtn])
    this.top = el('div', { class: 'st-top' }, [this.status, this.side])
    this.bar = el('div', { class: 'st-bar' })
    this.buttons = {}
    for (const t of TOOLS) {
      const b = el('button', { onclick: () => on.tool(t.id) }, [icon(t.ico, 'ico'), el('span', { text: t.label })])
      this.buttons[t.id] = b
      this.bar.appendChild(b)
    }
    this.sheetTitle = el('span')
    this.sheetBody = el('div', { class: 'st-sheet-body' })
    this.sheet = el('div', { class: 'st-sheet' }, [
      el('div', { class: 'st-sheet-title' }, [this.sheetTitle, el('button', { title: 'close', onclick: () => this.hideSheet() }, [icon('action.close')])]),
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

// Which descriptions are open, by their text: a form drawn again after an
// edit keeps the one being read open.
const helpOpen = new Set()

/**
 * An ⓘ on a row: tapped, the field's own description -- the vocabulary's
 * `doc` -- shows under it, and stays open while the form is redrawn.
 */
export function addHelp (rowEl, doc) {
  if (!doc || !rowEl?.appendChild || rowEl.querySelector(':scope > .st-help')) return rowEl
  const text = el('div', { class: 'st-help-text', text: doc })
  text.hidden = !helpOpen.has(doc)
  const b = el('button', { class: 'st-help', type: 'button', title: doc, 'aria-label': 'what is this?', 'data-on': text.hidden ? '0' : '1' })
  b.append(icon('action.help'))
  b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation()
    text.hidden = !text.hidden
    b.dataset.on = text.hidden ? '0' : '1'
    if (text.hidden) helpOpen.delete(doc); else helpOpen.add(doc)
  })
  b.addEventListener('pointerdown', (e) => e.stopPropagation())
  rowEl.classList.add('st-has-help')
  rowEl.append(b, text)
  return rowEl
}

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

/** A button; `label` is its text, or children (withIcon(id, text)). */
export function button (label, onClick, cls = '') {
  return Array.isArray(label) ? el('button', { class: cls, onclick: onClick }, label) : el('button', { text: label, class: cls, onclick: onClick })
}

export function chips (items, onPick) {
  return el('div', { class: 'st-chips' }, items.map((it) => {
    const c = el('div', { class: 'st-chip', 'data-on': it.on ? '1' : '0' }, it.icon ? withIcon(it.icon, it.label) : [it.label])
    c.addEventListener('click', () => onPick(it))
    return c
  }))
}

/**
 * A tile's picture: the image, or -- for a sprite sheet ({ layout, frames, fps },
 * texsheet.js) -- one frame at a time, played by CSS alone (the background
 * stepped across the sheet), so a grid of them costs no script.
 */
export function pictureBackground (t, image, sheet = null) {
  t.style.backgroundImage = `url("${image}")`
  if (!sheet || !(sheet.frames >= 2)) return t
  t.classList.add(sheet.layout === 'horizontal' ? 'st-sheet-h' : 'st-sheet-v')
  t.style.setProperty('--frames', sheet.frames)
  t.style.setProperty('--sheet-s', `${sheet.frames / (sheet.fps || 8)}s`)
  t.dataset.sheet = String(sheet.frames)
  return t
}

/** A grid of picture tiles; `items`: [{ id, label, image?, sheet?, on? }]. */
export function tiles (items, onPick) {
  return el('div', { class: 'st-grid' }, items.map((it) => {
    const t = el('div', { class: 'st-tile', 'data-on': it.on ? '1' : '0' }, [el('span', { text: it.label })])
    if (it.image) pictureBackground(t, it.image, it.sheet)
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
