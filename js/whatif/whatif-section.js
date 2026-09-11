// ============================================================================
// WHAT IF? SECTION — the frame (shell) of the section
//
// This module owns everything the two views share and NOTHING that either of
// them draws: the mode switch, the lazy fetch of data/whatif.json, the model,
// the State keys, the permalink, the loading and error states, the honesty
// text, and the redraw pump (language, resize, state).
//
// The two views are autonomous files:
//   js/whatif/ahead-view.js   → initAheadView / updateAheadView / destroyAheadView
//   js/whatif/behind-view.js  → initBehindView / updateBehindView / destroyBehindView
// Each receives a context object (see makeContext) and owns two containers:
// its scene container (#whatif-ahead | #whatif-behind) and its dials slot
// (#whatif-dials-ahead | #whatif-dials-behind). It must not touch anything
// else in the DOM, so the two files can be rewritten independently.
// ============================================================================

import State from '../state.js?v=20260911b';
import { createModel } from './whatif-model.js?v=20260911b';
import { initAheadView, updateAheadView, destroyAheadView } from './ahead-view.js?v=20260911b';
import { initBehindView, updateBehindView, destroyBehindView } from './behind-view.js?v=20260911b';

// 11-IX (r2): the only data file served with cache:'force-cache', and the one
// that was regenerated this round. Without a stamp a reader who had already
// opened the viewer would be pinned to the old JSON for good, and the module
// stamp below would not free them. It rides the release stamp like the code.
const DATA_URL = 'data/whatif.json?v=20260911b';

// The State keys this section owns. app.js reads them in buildStateHash() and
// writes them in applyStateFromParams(); the views read and write them through
// ctx.State. Anything else in State is none of this section's business.
export const WHATIF_STATE_KEYS = Object.freeze([
    'whatifMode',
    // Ahead
    'whatifG', 'whatifR', 'whatifPop', 'whatifTarget', 'whatifProb',
    'whatifSolveFor', 'whatifHorizon', 'whatifTail',
    // Behind
    'whatifRegion', 'whatifRef', 'whatifFrom', 'whatifCfMode', 'whatifIntensity'
]);

// The defaults live in js/state.js; this mirror is what "Reset" and the views
// compare against, and what buildStateHash() may omit from a permalink.
export const WHATIF_DEFAULTS = Object.freeze({
    whatifMode: 'ahead',
    whatifG: 0.0232,          // presets.growth 'recent'      (+2.32 %/yr)
    whatifR: -0.0231,         // presets.technology 'bau'     (−2.31 %/yr)
    whatifPop: 'medium',
    whatifTarget: '2.0C',
    whatifProb: '50%',
    whatifSolveFor: null,     // null = the Solve panel is closed
    whatifHorizon: 2100,
    whatifTail: false,        // the faint 2051–2100 tail of the main figure
    whatifRegion: 'WLD',
    whatifRef: 'GBR',
    whatifFrom: 1850,
    whatifCfMode: 'level',
    whatifIntensity: 'own'
});

// ---- module state ----
let _wired = false;
let _mounted = false;          // the active view is initialised
let _loading = false;
let _data = null;
let _model = null;
let _mode = null;              // the mode currently mounted
let _unsubs = [];
let _resizeCbs = [];
let _langCbs = [];
let _ro = null;
let _rafPending = 0;
let _pendingReason = null;

// ---- DOM handles (resolved once, in initWhatifSection) ----
const el = {};

// ---- language ------------------------------------------------------------
// app.js owns the dictionaries and the current language. It publishes a small
// read-only bridge on window.GrowthEarth (lang / t / applyLanguage) and fires
// a 'gw:language' event on document every time applyLanguage() runs.
function bridge() { return (typeof window !== 'undefined' && window.GrowthEarth) || {}; }

/** Active language for the generated prose: 'en' | 'es' | 'zh'. */
function lang() {
    const raw = bridge().lang ? bridge().lang() : (document.documentElement.lang || 'en');
    return raw === 'es' || raw === 'zh' ? raw : 'en';
}

/** A fixed string from the LANGUAGES dictionaries of app.js. */
function t(key, fallback = '') {
    const b = bridge();
    if (b.t) return b.t(key, fallback);
    return fallback;
}

/** Translate [data-i18n] nodes a view has just created. */
function applyI18n(root) {
    const b = bridge();
    if (b.applyLanguage) b.applyLanguage(root || document);
}

// ---- formatting ----------------------------------------------------------
// Every formatter reads the language at call time, so a view can hold on to
// the object and still print Spanish after the reader switches.
const MINUS = '−';   // U+2212, the typographic minus of the tabular figures

function locale() {
    const l = lang();
    return l === 'es' ? 'es-ES' : l === 'zh' ? 'zh-CN' : 'en-GB';
}

function n(x, d = 0) {
    if (x == null || !isFinite(x)) return '—';
    return Number(x).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d })
        .replace(/-/g, MINUS);
}

/**
 * Same as n(), but grouping is forced. es-ES leaves four-digit integers
 * ungrouped by default ("9620" next to "10.338"), which reads as two different
 * kinds of number in one row of chips.
 */
function nGroup(x, d = 0) {
    if (x == null || !isFinite(x)) return '—';
    const opts = { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' };
    let out;
    try {
        out = Number(x).toLocaleString(locale(), opts);
    } catch (e) {                                     // engines without 'always'
        out = Number(x).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    return out.replace(/-/g, MINUS);
}

const fmt = {
    locale,
    /** Plain number, d decimals, localized separators, typographic minus. */
    n,
    /** Plain number with grouping forced even for four digits (es-ES). */
    nGroup,
    /** Gt CO2, one decimal by default. */
    gt: (x, d = 1) => n(x, d),
    /** Degrees Celsius, two decimals. */
    deg: (x, d = 2) => n(x, d),
    /** A rate given as a fraction (0.0232) printed as a magnitude in % (2.3). */
    pct: (x, d = 1) => n(Math.abs(x) * 100, d),
    /** A rate given as a fraction printed signed in % (+2.3 / −2.3). */
    signedPct: (x, d = 1) => (x > 0 ? '+' : x < 0 ? MINUS : '') + n(Math.abs(x) * 100, d),
    /** A change given as a fraction (+0.17) printed signed in % (+17 %). */
    signedChange: (x, d = 0) => (x > 0 ? '+' : x < 0 ? MINUS : '') + n(Math.abs(x) * 100, d),
    /** A multiplier (3.3×) without the ×. */
    ratio: (x, d = 1) => n(x, d),
    /** A year, or an em dash when null. */
    year: (y) => (y == null ? '—' : String(y)),
    minus: MINUS
};

// ---- scientific glyphs in the Perpetua prose -----------------------------
// Perpetua has no subscript two and its degree ring is an oversized hairline,
// so "CO₂" reads "CO2" and "°C" wobbles in exactly the 15.5 px sentence that
// closes the scene, three paragraphs from a Gill Sans note where both are
// drawn correctly. Neither glyph exists in Gill Sans MT either: what works is
// a plain digit, scaled and dropped, and the degree sign in the sans face.
// The views call ctx.sciFix(node) after writing their prose; it walks text
// nodes only, so nothing it touches can be HTML.
const SCI_SELECTOR = '.wi-sentence,.wi-scale-note,.wi-card-value,.wib-therm-read,.wi-ahead-therm-read,.wi-live-read,.wi-ahead-solve-echo';
const SCI_RE = /[₂°]/;

function sciFixOne(host) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const p = node.parentNode;
            if (p && p.classList && (p.classList.contains('wi-sub') || p.classList.contains('wi-sci'))) {
                return NodeFilter.FILTER_REJECT;      // already wrapped
            }
            return SCI_RE.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    targets.forEach(node => {
        const frag = document.createDocumentFragment();
        const parts = node.nodeValue.split(/([₂°])/);
        parts.forEach(part => {
            if (part === '₂') {
                const s = document.createElement('span');
                s.className = 'wi-sub';
                s.textContent = '2';
                frag.appendChild(s);
            } else if (part === '°') {
                const s = document.createElement('span');
                s.className = 'wi-sci';
                s.textContent = '°';
                frag.appendChild(s);
            } else if (part) {
                frag.appendChild(document.createTextNode(part));
            }
        });
        node.parentNode.replaceChild(frag, node);
    });
}

function sciFix(root) {
    if (!root || !root.querySelectorAll) return;
    try {
        root.querySelectorAll(SCI_SELECTOR).forEach(sciFixOne);
        if (root.matches && root.matches(SCI_SELECTOR)) sciFixOne(root);
    } catch (err) { /* never let typography break a redraw */ }
}

// ============================================================================
// THE VERTICAL THERMOMETER (shared by both views through ctx.thermSVG)
//
// The reading of 11-IX: "the thermometer is very long and has no climate
// colours; better a taller figure and the thermometer down the right, running
// top to bottom." So it is a column now, and it carries a warming ramp.
//
// Colour here is a DATA ENCODING, not chrome, which is the one licence the
// identity grants to leave the single accent. The ramp is still built for the
// cream: it starts at the paper's own straw, walks through the amber and the
// vermilion of the interface, and ends in a maroon that is still a warm ink.
// Nothing in the ramp carries text, so it owes no contrast ratio; every label
// is drawn beside the rail, on the cream, in --cd / --cl.
// ============================================================================

// 11-IX (r2): the ramp used to open on #f1e6c8, which is the page's own --bg,
// so its whole cool half was invisible — at 1.36 °C the rail read "empty", not
// "temperate". It now opens on a muted slate, walks through the paper's straw
// at the hinge and ends in the maroon, which is the warming-stripes convention
// written in the palette of the section rather than in the usual blue-to-red.
const RAMP = [
    [0.0, [ 92, 126, 152]],   // slate: cool, and legible against the cream
    [0.8, [152, 177, 189]],
    [1.2, [214, 205, 178]],   // the hinge: the paper's own straw
    [1.5, [231, 201, 121]],   // straw
    [2.0, [222, 149, 65]],    // amber
    [2.5, [205, 93, 46]],     // the vermilion of the interface
    [3.0, [168, 47, 34]],
    [3.5, [109, 27, 24]]      // maroon
];

function hex2(n) { return ('0' + Math.round(n).toString(16)).slice(-2); }

/** The ramp sampled at c °C, clamped to its ends. */
function rampAt(c) {
    if (!(c > RAMP[0][0])) return '#' + RAMP[0][1].map(hex2).join('');
    const last = RAMP[RAMP.length - 1];
    if (c >= last[0]) return '#' + last[1].map(hex2).join('');
    for (let i = 1; i < RAMP.length; i++) {
        if (c <= RAMP[i][0]) {
            const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i];
            const k = (c - a) / (b - a);
            return '#' + ca.map((v, j) => hex2(v + (cb[j] - v) * k)).join('');
        }
    }
    return '#' + last[1].map(hex2).join('');
}

let _thermSeq = 0;

function sx(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * One vertical thermometer, as an SVG string.
 *
 * spec = {
 *   w, h            the box in px (the view measures its own container)
 *   lo, hi          the rail in °C, bottom to top
 *   ticks           [{v, label, dash}]  the scale down the left
 *   band            [lo, hi] | null     the likely range, beside the rail
 *   marks           [{v, label, short, kind}]  the needles, labelled right
 *                   kind: 'now' (hairline ink) | 'main' (2 px ink)
 *                         | 'soft' (1 px --cl)
 * }
 * Marks whose value leaves the rail are pinned to the edge and carry a ›.
 */
function thermSVG(spec) {
    const W = Math.max(56, Math.round(spec.w || 0));
    const H = Math.max(90, Math.round(spec.h || 0));
    if (!(spec.hi > spec.lo)) return '';
    const compact = W < 132;
    const id = 'wi-ramp-' + (++_thermSeq);

    const padT = 9, padB = 10;
    const gut = compact ? 19 : 27;                       // the scale labels
    const railX = gut + 3, railW = compact ? 17 : 24;
    const railR = railX + railW;
    const bandX = railR + 2, bandW = 4;
    const labX = bandX + bandW + (compact ? 3 : 5);
    const yTop = padT, yBot = H - padB, span = yBot - yTop;
    const pos = (v) => yBot - span * Math.min(1, Math.max(0, (v - spec.lo) / (spec.hi - spec.lo)));
    const fs = compact ? 8.5 : 10;
    const fsMark = compact ? 8.5 : 10.5;

    // the ramp, sampled along the rail
    let stops = '';
    for (let i = 0; i <= 10; i++) {
        const c = spec.lo + (spec.hi - spec.lo) * (i / 10);
        stops += `<stop offset="${(i * 10)}%" stop-color="${rampAt(c)}"/>`;
    }

    let out = `<svg class="wi-therm-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="presentation" focusable="false">`
        + `<defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0">${stops}</linearGradient></defs>`
        + `<rect x="${railX}" y="${yTop}" width="${railW}" height="${span}" fill="url(#${id})" stroke="var(--cb)" stroke-width="1"/>`;

    // the scale down the left, thinned so two numbers never touch: a rail
    // fitted to a wide uncertainty (Behind can ask for 0–5 °C) would otherwise
    // print eleven labels into 200 px
    const inRail = (spec.ticks || [])
        .filter(t => t.v >= spec.lo - 1e-9 && t.v <= spec.hi + 1e-9)
        .sort((a, b) => a.v - b.v);        // a view may append its thresholds last
    const minGap = fs + 3.5;
    let lastY = null;
    const ticks = inRail.filter((t, i) => {
        if (t.dash) return true;                       // a named threshold always shows
        const y = pos(t.v);
        const keep = lastY == null || Math.abs(y - lastY) >= minGap || i === inRail.length - 1;
        if (keep) lastY = y;
        return keep;
    });
    ticks.forEach(t => {
        const y = pos(t.v);
        out += `<line x1="${railX}" x2="${railR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--cd)" stroke-width="1" opacity="${t.dash ? 0.55 : 0.4}"${t.dash ? ' stroke-dasharray="2 2"' : ''}/>`
            + `<line x1="${railX - 3}" x2="${railX}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--cl)" stroke-width="1"/>`
            + `<text x="${railX - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-family="var(--ff)" font-size="${fs}" fill="var(--cl)" style="font-variant-numeric:tabular-nums lining-nums">${sx(t.label)}</text>`;
    });

    // the likely range
    if (spec.band && spec.band.length === 2) {
        const a = pos(Math.min(spec.band[0], spec.band[1]));
        const b = pos(Math.max(spec.band[0], spec.band[1]));
        out += `<rect x="${bandX}" y="${b.toFixed(1)}" width="${bandW}" height="${Math.max(1.5, a - b).toFixed(1)}" fill="var(--cd)" opacity="0.28"/>`;
    }

    // the needles, with their labels pushed apart so none sits on another
    const marks = (spec.marks || []).filter(m => m && isFinite(m.v)).slice();
    const placed = marks.map(m => ({
        m,
        y: pos(m.v),
        off: m.v > spec.hi + 1e-9 ? 1 : (m.v < spec.lo - 1e-9 ? -1 : 0)
    })).sort((a, b) => a.y - b.y);
    const gap = fsMark + 3.5;
    // one downward pass, then one upward pass, so nothing leaves the box
    placed.forEach(p => { p.ty = p.y; });
    for (let i = 1; i < placed.length; i++) {
        if (placed[i].ty - placed[i - 1].ty < gap) placed[i].ty = placed[i - 1].ty + gap;
    }
    for (let i = placed.length - 1; i >= 0; i--) {
        if (placed[i].ty > H - 3) placed[i].ty = H - 3;
        if (i > 0 && placed[i].ty - placed[i - 1].ty < gap) placed[i - 1].ty = placed[i].ty - gap;
    }
    placed.forEach(p => {
        if (p.ty < fsMark) p.ty = fsMark;
    });

    placed.forEach(p => {
        const m = p.m, y = p.y;
        const strong = m.kind === 'main';
        const stroke = m.kind === 'soft' ? 'var(--cl)' : 'var(--cd)';
        const wdt = strong ? 2 : 1;
        const x1 = strong ? railX - 4 : railX;
        const x2 = strong ? bandX + bandW : railR;
        out += `<line x1="${x1}" x2="${x2}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${stroke}" stroke-width="${wdt}"${p.off ? ' stroke-dasharray="3 2"' : ''}/>`;
        // the elbow that ties a pushed label back to its needle
        if (Math.abs(p.ty - y) > 2) {
            out += `<path d="M${x2} ${y.toFixed(1)} L${(labX - 3).toFixed(1)} ${(p.ty - 3.4).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="0.75" opacity="0.5"/>`;
        }
        const txt = (compact && m.short) ? m.short : m.label;
        out += `<text x="${labX}" y="${p.ty.toFixed(1)}" font-family="var(--ff)" font-size="${fsMark}" fill="${m.kind === 'soft' ? 'var(--cl)' : 'var(--cd)'}" style="font-variant-numeric:tabular-nums lining-nums">${sx(txt)}${p.off > 0 ? ' ›' : ''}</text>`;
    });

    return out + '</svg>';
}

// ---- the header explanation ---------------------------------------------
// The plate that said "WHAT IF? / Three dials, one carbon budget" is gone (the
// tab bar already names the section). What the header owes the reader is what
// this is and how it is played, and the two modes, centred.
// The wording says nothing about "the left" or "below": the dials are a column
// on a laptop and an accordion at the foot of a phone, and the sentence has to
// be true in both.
const LEDE = {
    ahead: {
        en: 'Emissions are people &times; income &times; the CO<span class="wi-sub">2</span> it takes to make a dollar. Move the three dials and read what the carbon budget says.',
        es: 'Las emisiones son personas &times; renta &times; el CO<span class="wi-sub">2</span> que cuesta producir un d&oacute;lar. Mueve las tres palancas y lee lo que dice el presupuesto de carbono.',
        zh: '排放 = 人口 &times; 收入 &times; 每产出一美元所需的 CO<span class="wi-sub">2</span>。拨动这三个旋钮，读出碳预算给出的答案。'
    },
    behind: {
        en: 'The same arithmetic run backwards. Rewrite one region&rsquo;s income history from a year of your choosing, and read what it would have emitted &mdash; and how warm today would be.',
        es: 'La misma aritm&eacute;tica al rev&eacute;s. Reescribe la historia de renta de una regi&oacute;n desde el a&ntilde;o que elijas y lee cu&aacute;nto habr&iacute;a emitido &mdash; y qu&eacute; calor har&iacute;a hoy.',
        zh: '同一套算术反过来跑。从你选定的年份起改写某个区域的收入史，读出它本会排放多少&mdash;&mdash;以及今天会有多暖。'
    }
};

function updateLede() {
    const node = el.lede;
    if (!node) return;
    const mode = (State.get('whatifMode') || WHATIF_DEFAULTS.whatifMode) === 'behind' ? 'behind' : 'ahead';
    node.innerHTML = LEDE[mode][lang()] || LEDE[mode].en;
}

// ---- "there is more below" --------------------------------------------
// The scene column scrolls on its own on the desktop, with no scrollbar of its
// own in most themes, so the closing sentence can sit under the fold with no
// sign that it is there. The honesty bar at the foot fades it in.
function updateScrollCue() {
    const s = el.scene;
    if (!s) return;
    const more = s.scrollHeight - s.clientHeight - s.scrollTop > 8;
    s.classList.toggle('is-more', more);
}

// ---- the probability the budgets are read at ----------------------------
// The honesty paragraph quotes the AR6 budgets at 50 %; the cards follow the
// reader's choice. Without this line the two contradict each other on screen.
function updateHonestyProb() {
    const node = el.honestyProb;
    if (!node) return;
    if ((State.get('whatifMode') || 'ahead') !== 'ahead') { node.textContent = ''; return; }
    const prob = String(State.get('whatifProb') || '50%').replace('%', ' %');
    const l = lang();
    node.textContent = l === 'es'
        ? `La vista actual lee los presupuestos al ${prob}.`
        : l === 'zh'
            ? `当前视图按 ${prob} 的概率读取碳预算。`
            : `The current view reads the budgets at ${prob}.`;
}

// ---- redraw pump ---------------------------------------------------------
function pump(reason) {
    _pendingReason = reason || _pendingReason || { reason: 'redraw' };
    if (_rafPending) return;
    _rafPending = requestAnimationFrame(() => {
        _rafPending = 0;
        const info = _pendingReason || { reason: 'redraw' };
        _pendingReason = null;
        if (!_mounted) return;
        try {
            if (_mode === 'ahead') updateAheadView(info);
            else updateBehindView(info);
        } catch (err) {
            console.error('[whatif] view update failed:', err);
        }
        updateHonestyProb();
        requestAnimationFrame(updateScrollCue);
    });
}

/** A view asks the frame for one coalesced redraw of itself. */
function requestRedraw() { pump({ reason: 'redraw' }); }

/** A view registers an extra resize callback; the returned function unregisters it. */
function onResize(fn) {
    if (typeof fn !== 'function') return () => {};
    _resizeCbs.push(fn);
    return () => { _resizeCbs = _resizeCbs.filter(f => f !== fn); };
}

/** A view registers an extra language callback; the returned function unregisters it. */
function onLanguage(fn) {
    if (typeof fn !== 'function') return () => {};
    _langCbs.push(fn);
    return () => { _langCbs = _langCbs.filter(f => f !== fn); };
}

/** Rewrite the address bar from State (app.js debounces its own writer too). */
function writeHash() {
    const b = bridge();
    if (b.writeStateHash) b.writeStateHash();
}

// ---- the context handed to the views ------------------------------------
function makeContext(mode) {
    const scene = el.scene;
    return {
        mode,
        model: _model,
        data: _data,
        root: mode === 'ahead' ? el.ahead : el.behind,
        dials: mode === 'ahead' ? el.dialsAhead : el.dialsBehind,
        scene,
        State,
        lang,
        t,
        applyI18n,
        fmt,
        sciFix,
        /** One vertical thermometer with the warming ramp; returns SVG source. */
        thermSVG,
        /** The ramp itself, for anything a view wants to key to a temperature. */
        rampAt,
        requestRedraw,
        onResize,
        onLanguage,
        writeHash,
        keys: WHATIF_STATE_KEYS,
        defaults: WHATIF_DEFAULTS,
        /** Live size of the scene column, for views that measure before drawing. */
        sceneSize: () => {
            const r = scene ? scene.getBoundingClientRect() : { width: 0, height: 0 };
            return { width: Math.round(r.width), height: Math.round(r.height) };
        },
        /** True while the viewport is in the one-column (phone) layout. */
        isMobile: () => window.matchMedia('(max-width:900px)').matches
    };
}

// ---- loading / error states ---------------------------------------------
function showLoading(on) {
    if (el.loading) el.loading.hidden = !on;
}

function showError(on, detail) {
    if (!el.error) return;
    el.error.hidden = !on;
    if (on && el.errorDetail) el.errorDetail.textContent = detail || '';
}

// ---- mounting ------------------------------------------------------------
function destroyActiveView() {
    if (!_mounted) return;
    try {
        if (_mode === 'ahead') destroyAheadView();
        else destroyBehindView();
    } catch (err) {
        console.error('[whatif] view destroy failed:', err);
    }
    _mounted = false;
}

function mountView(mode) {
    if (!_model) return;
    if (_mounted && _mode === mode) { pump({ reason: 'state' }); return; }
    destroyActiveView();
    _mode = mode;

    // Only the active view's containers are in the flow; the other pair is
    // hidden, which also keeps visibleFigure() (app.js) on the right figure.
    if (el.ahead) el.ahead.hidden = mode !== 'ahead';
    if (el.behind) el.behind.hidden = mode !== 'behind';
    if (el.dialsAhead) el.dialsAhead.hidden = mode !== 'ahead';
    if (el.dialsBehind) el.dialsBehind.hidden = mode !== 'behind';

    const ctx = makeContext(mode);
    try {
        if (mode === 'ahead') initAheadView(ctx);
        else initBehindView(ctx);
        _mounted = true;
        pump({ reason: 'init' });
    } catch (err) {
        console.error('[whatif] view init failed:', err);
        showError(true, String(err && err.message ? err.message : err));
    }
}

function highlightMode(mode) {
    document.querySelectorAll('[data-whatif-mode]').forEach(btn => {
        const on = btn.getAttribute('data-whatif-mode') === mode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

// ---- data ----------------------------------------------------------------
async function ensureData() {
    if (_model || _loading) return;
    _loading = true;
    showError(false);
    showLoading(true);
    try {
        const res = await fetch(DATA_URL, { cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _data = await res.json();
        _model = createModel(_data);
        showLoading(false);
        mountView(State.get('whatifMode') || WHATIF_DEFAULTS.whatifMode);
    } catch (err) {
        console.error('[whatif] could not load ' + DATA_URL + ':', err);
        showLoading(false);
        showError(true, String(err && err.message ? err.message : err));
    } finally {
        _loading = false;
    }
}

// ---- activation ----------------------------------------------------------
function activate() {
    if (!_model) { ensureData(); return; }
    // A section that was mounted while hidden has zero-width containers, so the
    // views measure again on the frame after the layout settles.
    mountView(State.get('whatifMode') || WHATIF_DEFAULTS.whatifMode);
    requestAnimationFrame(() => pump({ reason: 'resize' }));
}

// ---- wiring --------------------------------------------------------------
function bindModeSwitch() {
    document.querySelectorAll('[data-whatif-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-whatif-mode');
            if (!mode || mode === State.get('whatifMode')) return;
            State.set('whatifMode', mode);
        });
    });
}

function bindAccordions() {
    // The dials fold away above the scene on a phone; on the desktop the
    // toggle is display:none and the column is always open.
    if (el.dialsToggle && el.dials) {
        el.dialsToggle.addEventListener('click', () => {
            const open = el.dials.classList.toggle('open');
            el.dialsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            pump({ reason: 'resize' });
        });
    }
    if (el.honestyToggle && el.honesty) {
        el.honestyToggle.addEventListener('click', () => {
            const open = el.honesty.classList.toggle('open');
            el.honestyToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            requestAnimationFrame(updateScrollCue);
        });
    }
}

function bindRetry() {
    if (el.retry) el.retry.addEventListener('click', () => { _model = null; ensureData(); });
}

function observeResize() {
    if (!el.scene || typeof ResizeObserver === 'undefined') return;
    _ro = new ResizeObserver(() => {
        if (State.get('activeSection') !== 'whatif') return;
        _resizeCbs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
        updateScrollCue();
        pump({ reason: 'resize' });
    });
    _ro.observe(el.scene);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function initWhatifSection() {
    if (_wired) return;
    _wired = true;

    el.section = document.getElementById('section-whatif');
    if (!el.section) { console.warn('[whatif] #section-whatif is missing'); return; }
    el.scene = document.getElementById('whatif-scene');
    el.ahead = document.getElementById('whatif-ahead');
    el.behind = document.getElementById('whatif-behind');
    el.dials = document.getElementById('whatif-dials');
    el.dialsToggle = document.getElementById('whatif-dials-toggle');
    el.dialsAhead = document.getElementById('whatif-dials-ahead');
    el.dialsBehind = document.getElementById('whatif-dials-behind');
    el.loading = document.getElementById('whatif-loading');
    el.error = document.getElementById('whatif-error');
    el.errorDetail = document.getElementById('whatif-error-detail');
    el.retry = document.getElementById('whatif-retry');
    el.honesty = document.getElementById('whatif-honesty');
    el.honestyToggle = document.getElementById('whatif-honesty-toggle');
    el.honestyProb = document.getElementById('whatif-honesty-prob');
    el.lede = document.getElementById('whatif-lede');
    updateLede();

    if (el.scene) el.scene.addEventListener('scroll', updateScrollCue, { passive: true });

    bindModeSwitch();
    bindAccordions();
    bindRetry();
    observeResize();

    highlightMode(State.get('whatifMode') || WHATIF_DEFAULTS.whatifMode);

    _unsubs.push(State.subscribe('activeSection', (section) => {
        if (section === 'whatif') activate();
    }));

    _unsubs.push(State.subscribe('whatifMode', (mode) => {
        highlightMode(mode);
        updateLede();
        if (State.get('activeSection') !== 'whatif') return;
        if (!_model) { ensureData(); return; }
        mountView(mode);
    }));

    // Every other key of the section is a parameter of the active view.
    WHATIF_STATE_KEYS.filter(k => k !== 'whatifMode').forEach(key => {
        _unsubs.push(State.subscribe(key, () => {
            if (State.get('activeSection') !== 'whatif') return;
            pump({ reason: 'state', key });
        }));
    });

    document.addEventListener('gw:language', () => {
        updateLede();
        _langCbs.forEach(fn => { try { fn(lang()); } catch (e) { console.error(e); } });
        if (State.get('activeSection') !== 'whatif') return;
        pump({ reason: 'language' });
    });

    // A reload straight onto #whatif: handleHash() flips activeSection before
    // this subscription exists in some orders, so check once at wiring time.
    if (State.get('activeSection') === 'whatif') activate();
}

export function destroyWhatifSection() {
    destroyActiveView();
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    _resizeCbs = [];
    _langCbs = [];
    if (_ro) { _ro.disconnect(); _ro = null; }
    _wired = false;
}

/** The parsed data/whatif.json, or null before the first activation. */
export function whatifData() { return _data; }

/** The model built with createModel(), or null before the first activation. */
export function whatifModel() { return _model; }
