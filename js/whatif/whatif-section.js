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

import State from '../state.js?v=20260911a';
import { createModel } from './whatif-model.js?v=20260911a';
import { initAheadView, updateAheadView, destroyAheadView } from './ahead-view.js?v=20260911a';
import { initBehindView, updateBehindView, destroyBehindView } from './behind-view.js?v=20260911a';

const DATA_URL = 'data/whatif.json';

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
    whatifCfMode: 'rate',
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

/** Active language for the generated prose: 'en' | 'es'. 中文 falls back to English. */
function lang() {
    const raw = bridge().lang ? bridge().lang() : (document.documentElement.lang || 'en');
    return raw === 'es' ? 'es' : 'en';
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

function locale() { return lang() === 'es' ? 'es-ES' : 'en-GB'; }

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
    node.textContent = lang() === 'es'
        ? `La vista actual lee los presupuestos al ${prob}.`
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
