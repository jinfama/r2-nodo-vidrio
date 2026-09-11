// ============================================================================
// WHAT IF? — BEHIND VIEW (1850–2024): counterfactual pasts
//
// "What if a region had grown like — or become as rich as — a reference?"
// Spec: 06_dev/docs/visores_2026-09/GROWTH_AND_EARTH_WHATIF_SPEC.md
//   §3.6 counterfactual model (rate/level, own/ref/world intensity, assumptions)
//   §4.3 implied fossil totals since 1850 (2,128.8 / 2,978.8 Gt at 50 %)
//   §6   what is painted here
//   §8.3 the generated sentence (EN / ES)
//   §11.3 test cases B1–B12
//
// Contract (whatif-section.js → makeContext):
//   initBehindView(ctx)      builds the DOM inside ctx.root and ctx.dials
//   updateBehindView(info)   redraws; info = {reason, key?} and may be omitted
//   destroyBehindView()      removes listeners and empties both containers
//
// This file is autonomous: no imports at all (the model, State, the formatters
// and the language bridge arrive through ctx), it never touches the DOM outside
// ctx.root / ctx.dials, and it never subscribes to the whatif* State keys — the
// frame pumps every change back as update({reason:'state', key}).
// ============================================================================

// ---------------------------------------------------------------------------
// module state
// ---------------------------------------------------------------------------
let _ctx = null;
let _offResize = null;
let _listeners = [];      // [node, type, fn] triples, dropped on destroy
let _res = null;          // last counterfactualResult()
let _sig = '';            // signature of the inputs behind _res
let _pal = null;          // resolved palette (literal hex, so the PNG export works)
let _modeTouched = false; // the reader has clicked the rate/level switch by hand
let _assumpOpen = false;
let _err = null;          // last computation error, shown in the scene

const D = {};             // cached nodes

// The order the regions are offered in: the world, the eight Minerva regions,
// then the two countries. Anything the JSON does not carry is skipped.
const REGION_ORDER = ['WLD', 'EAP', 'ECA', 'LAC', 'MENA', 'NAM', 'SAS', 'SSA', 'WEU', 'CHN', 'GBR'];
const START_FALLBACK = [1850, 1900, 1950, 1978, 1990];
const Y0 = 1850, Y1 = 2024, IDX0 = 1750;   // series index = year − 1750

// Juan's two questions, as one-click shortcuts (spec §3.6 "lectura de…").
const EXAMPLES = [
    {
        id: 'world-uk-1850',
        set: { whatifRegion: 'WLD', whatifRef: 'GBR', whatifFrom: 1850, whatifCfMode: 'level', whatifIntensity: 'own' },
        en: 'The world at British income levels since 1850',
        es: 'El mundo con la renta británica desde 1850'
    },
    {
        id: 'china-uk-1978',
        set: { whatifRegion: 'CHN', whatifRef: 'GBR', whatifFrom: 1978, whatifCfMode: 'rate', whatifIntensity: 'own' },
        en: 'China growing like the UK since 1978',
        es: 'China creciendo como el Reino Unido desde 1978'
    },
    {
        // The third of Juan's readings: "as rich as", not "growing like".
        // Without it the level counterfactual needed a hand-thrown switch.
        id: 'china-uk-level-1978',
        set: { whatifRegion: 'CHN', whatifRef: 'GBR', whatifFrom: 1978, whatifCfMode: 'level', whatifIntensity: 'own' },
        en: 'China at British income levels since 1978',
        es: 'China con la renta británica desde 1978'
    }
];

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function on(node, type, fn, opts) {
    if (!node) return;
    node.addEventListener(type, fn, opts);
    _listeners.push([node, type, fn, opts]);
}

function dropListeners() {
    _listeners.forEach(([node, type, fn, opts]) => {
        try { node.removeEventListener(type, fn, opts); } catch (e) { /* gone with the node */ }
    });
    _listeners = [];
}

function isES() { return _ctx && _ctx.lang() === 'es'; }

/** Pick the EN or ES member of a {en, es} pair. */
function pick(pair) { return isES() ? pair.es : pair.en; }

/** Resolve the palette once, in literal hex: var() does not survive PNG export. */
function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const g = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb;
    return {
        cd: g('--cd', '#2b2521'),
        cg: g('--cg', '#4d443c'),
        cl: g('--cl', '#665a4e'),
        cb: g('--cb', '#cdbf9e'),
        bg: g('--bg', '#f1e6c8'),
        bgl: g('--bgl', '#e8dcbd'),
        foam: g('--foam', '#f7f0de'),
        verm: g('--verm', '#d84a34'),
        vermDeep: g('--verm-deep', '#b13522'),
        ff: g('--ff', 'Gill Sans MT, sans-serif')
    };
}

/** A round-ish ceiling for an axis maximum. */
function niceMax(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / e;
    const s = m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10;
    return s * e;
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------------------
// prose vocabulary (spec §8.3) — templates live here, not in the dictionaries
// ---------------------------------------------------------------------------

/** The region as the subject of a sentence. */
function regionProse(code, s) {
    if (code === 'WLD') return isES() ? 'el mundo' : 'the world';
    if (code === 'GBR') return isES() ? 'el Reino Unido' : 'the United Kingdom';
    return isES() ? (s.name_es || s.name) : s.name;
}

/**
 * The region after the preposition «de». Spanish contracts de + el into del,
 * so the income sentence used to read «El PIB por persona de el mundo…».
 * refProse() has carried this pair from the start; regionProse() had not.
 */
function regionGen(code, s) {
    const nom = regionProse(code, s);
    if (!isES()) return 'in ' + nom;
    return nom.slice(0, 3) === 'el ' ? 'del ' + nom.slice(3) : 'de ' + nom;
}

/** The reference, nominative and genitive (Spanish contracts «de el» → «del»). */
function refProse(code) {
    if (code === 'GBR') {
        return isES()
            ? { nom: 'el Reino Unido', gen: 'del Reino Unido' }
            : { nom: 'the United Kingdom', gen: 'the United Kingdom' };
    }
    return isES()
        ? { nom: 'la media mundial', gen: 'de la media mundial' }
        : { nom: 'the world average', gen: 'the world average' };
}

/** «grown as fast as X» / «reached the income level of X» (already inflected). */
function modeProse(mode, refCode) {
    const r = refProse(refCode);
    if (isES()) {
        return mode === 'level'
            ? 'alcanzado el nivel de renta ' + r.gen
            : 'crecido tanto como ' + r.nom;
    }
    return mode === 'level'
        ? 'reached the income level of ' + r.gen
        : 'grown as fast as ' + r.nom;
}

/** Tooltip for the mark that falls off the right of the fitted rail. */
function es0Title() {
    return isES() ? 'Fuera del riel, a la derecha' : 'Off the rail, to the right';
}

/** «its own carbon intensity» / «the UK's» / «the world-average». */
function intensityProse(intensity, refCode) {
    const asWorld = (intensity === 'world') || (intensity === 'ref' && refCode === 'WLD');
    if (isES()) {
        if (intensity === 'own') return 'su propia intensidad de carbono';
        return asWorld ? 'la intensidad media mundial' : 'la intensidad de carbono británica';
    }
    if (intensity === 'own') return 'its own carbon intensity';
    return asWorld ? 'the world-average carbon intensity' : "the UK's carbon intensity";
}

// ---------------------------------------------------------------------------
// own CSS — injected inside ctx.root, so it leaves with the view
// ---------------------------------------------------------------------------
const OWN_CSS = `
.wib-group{padding-bottom:13px;border-bottom:1px solid var(--cb)}
.wib-group:last-child{border-bottom:0;padding-bottom:0}
.wib-group-head{font-family:var(--ff-caps);font-size:10.5px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--cd);display:block;margin-bottom:8px}
.wib-wide{width:100%;text-align:left;white-space:normal;line-height:1.3}
.wib-stack{flex-direction:column;gap:4px}
.wib-years{display:flex;flex-wrap:wrap;gap:4px}
.wib-legend{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 20px;margin-top:8px;font-size:11.5px;line-height:1.45;color:var(--cg);font-variant-numeric:tabular-nums lining-nums}
.wib-key{display:inline-block;width:20px;height:0;border-top-width:2px;border-top-style:solid;margin-right:8px;vertical-align:middle}
.wib-legend b{font-weight:500;color:var(--cd)}
.wib-tip{position:absolute;top:10px;left:0;z-index:5;pointer-events:none;background:var(--bg);border:1px solid var(--cb);padding:6px 9px 7px;font-size:11.5px;line-height:1.5;color:var(--cd);white-space:nowrap;font-variant-numeric:tabular-nums lining-nums}
.wib-tip[hidden]{display:none}
.wib-tip b{display:block;margin-bottom:3px;font-family:var(--ff-caps);font-size:9.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--cl)}
.wib-therm-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:7px}
.wib-therm-title{font-family:var(--ff-caps);font-size:9.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--cl)}
.wib-therm-read{font-family:var(--ff-serif);font-size:14.5px;color:var(--cg);font-variant-numeric:tabular-nums lining-nums}
.wib-therm-read strong{font-weight:700;color:var(--verm-ink)}
.wib-therm-today{position:absolute;top:0;bottom:0;width:1px;background:var(--cd)}
.wib-note{font-size:11px;line-height:1.55;color:var(--cl);max-width:92ch;font-variant-numeric:tabular-nums lining-nums}
.wib-assump{border-top:1px solid var(--cb);padding-top:8px}
.wib-assump-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:34px;padding:0;border:0;background:transparent;color:var(--cl);font-family:var(--ff-caps);font-size:10px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;text-align:left}
.wib-assump-toggle:hover{color:var(--cd)}
.wib-assump-body{display:none;margin:2px 0 0;padding:0 0 0 17px;font-size:11.5px;line-height:1.6;color:var(--cg);max-width:92ch}
.wib-assump-body li{margin-bottom:4px}
.wib-assump.open .wib-assump-body{display:block}
.wib-assump.open .wi-caret{transform:rotate(180deg)}
.wib-empty{font-family:var(--ff-serif);font-style:italic;font-size:14px;color:var(--cg)}
.wib-therm-off{color:var(--cl);white-space:nowrap}
.wi-live{display:none}
@media(max-width:900px){
  .wib-assump-toggle{min-height:44px}
  .wib-tip{font-size:11px}
  /* Same live strip as Ahead: on a phone the scene is below the fold while
     the controls are open, so the answer travels with the controls. */
  .wi-live{display:block;position:sticky;top:0;z-index:5;margin:0 -16px 12px;padding:9px 16px 10px;background:var(--foam);border-bottom:1px solid var(--cb)}
  .wi-live-label{display:block;font-family:var(--ff-caps);font-size:9.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--cl)}
  .wi-live-read{display:block;margin-top:2px;font-family:var(--ff-serif);font-size:19px;line-height:1.1;color:var(--cd);font-variant-numeric:tabular-nums lining-nums}
  .wi-live-rail{height:8px;margin-top:7px}
  .wi-live-foot{display:block;margin-top:5px;font-size:11.5px;color:var(--cg);font-variant-numeric:tabular-nums lining-nums}
}
`;

// ---------------------------------------------------------------------------
// DIALS — built once, then only synchronised (so the slider keeps its focus)
// ---------------------------------------------------------------------------
function dialsHTML(ctx) {
    const regions = ctx.model.regions();
    const byCode = {};
    regions.forEach(r => { byCode[r.code] = r; });
    const targets = REGION_ORDER.filter(c => byCode[c] && byCode[c].is_target);
    const refs = REGION_ORDER.filter(c => byCode[c] && byCode[c].is_reference);
    const cfData = (ctx.data && ctx.data.counterfactual) || {};
    const startYears = (cfData.start_years_suggested && cfData.start_years_suggested.length)
        ? cfData.start_years_suggested : START_FALLBACK;

    const opt = (list) => list.map(c =>
        `<option value="${esc(c)}" data-code="${esc(c)}">${esc(byCode[c].name)}</option>`).join('');

    const exampleBtns = EXAMPLES.map(ex =>
        `<button class="wi-preset wib-wide" type="button" data-wib-example="${esc(ex.id)}">${esc(ex.en)}</button>`
    ).join('');

    const yearBtns = startYears.map(y =>
        `<button class="wi-preset" type="button" data-wib-year="${y}">${y}</button>`).join('');

    return `
<div class="wi-behind-controls">

  <div class="wi-live" data-wib-live>
    <span class="wi-live-label" data-i18n="whatifCardDeltaT">${esc(ctx.t('whatifCardDeltaT'))}</span>
    <span class="wi-live-read" data-wib-live-read>—</span>
    <div class="wi-therm-rail wi-live-rail">
      <span class="wib-therm-today" data-wib-live-today></span>
      <span class="wi-therm-needle" data-wib-live-needle></span>
    </div>
    <span class="wi-live-foot" data-wib-live-foot></span>
  </div>

  <div class="wib-group" data-wib-group="examples">
    <span class="wib-group-head" data-wib-tx="examplesHead">Three questions</span>
    <div class="wi-presets wib-stack">${exampleBtns}</div>
  </div>

  <div class="wib-group">
    <div class="wi-field">
      <span class="wi-field-label" data-i18n="whatifBehindRegion">Region</span>
      <select class="wi-select" id="wib-region">${opt(targets)}</select>
    </div>
  </div>

  <div class="wib-group">
    <div class="wi-field">
      <span class="wi-field-label" data-i18n="whatifBehindReference">Reference</span>
      <select class="wi-select" id="wib-ref">${opt(refs)}</select>
    </div>
  </div>

  <div class="wib-group">
    <span class="wib-group-head" data-i18n="whatifBehindFrom">From</span>
    <div class="wib-years">${yearBtns}</div>
    <div class="wi-slider">
      <input type="range" id="wib-from" min="${Y0}" max="2000" step="1" value="${Y0}"
             aria-label="Start year">
      <output class="wi-slider-value" id="wib-from-out">${Y0}</output>
    </div>
  </div>

  <div class="wib-group">
    <span class="wib-group-head" data-i18n="whatifBehindMode">Counterfactual</span>
    <div class="wi-presets">
      <button class="wi-preset" type="button" data-wib-mode="rate" data-i18n="whatifBehindModeRate">same growth rate</button>
      <button class="wi-preset" type="button" data-wib-mode="level" data-i18n="whatifBehindModeLevel">same income level</button>
    </div>
    <p class="wi-scale-note" data-wib-tx="modeNote"></p>
  </div>

  <div class="wib-group">
    <span class="wib-group-head" data-i18n="whatifBehindIntensity">Carbon intensity</span>
    <div class="wi-presets">
      <button class="wi-preset" type="button" data-wib-int="own" data-i18n="whatifBehindIntOwn">its own</button>
      <button class="wi-preset" type="button" data-wib-int="ref" data-i18n="whatifBehindIntRef">the reference&rsquo;s</button>
      <button class="wi-preset" type="button" data-wib-int="world" data-i18n="whatifBehindIntWorld">world average</button>
    </div>
    <p class="wi-scale-note" data-wib-tx="intNote"></p>
  </div>

</div>`;
}

function wireDials(ctx) {
    const d = ctx.dials;
    D.region = d.querySelector('#wib-region');
    D.ref = d.querySelector('#wib-ref');
    D.from = d.querySelector('#wib-from');
    D.fromOut = d.querySelector('#wib-from-out');
    D.yearBtns = Array.from(d.querySelectorAll('[data-wib-year]'));
    D.modeBtns = Array.from(d.querySelectorAll('[data-wib-mode]'));
    D.intBtns = Array.from(d.querySelectorAll('[data-wib-int]'));
    D.exBtns = Array.from(d.querySelectorAll('[data-wib-example]'));
    D.modeNote = d.querySelector('[data-wib-tx="modeNote"]');
    D.intNote = d.querySelector('[data-wib-tx="intNote"]');
    D.examplesHead = d.querySelector('[data-wib-tx="examplesHead"]');
    D.liveRail = d.querySelector('[data-wib-live] .wi-live-rail');
    D.liveRead = d.querySelector('[data-wib-live-read]');
    D.liveToday = d.querySelector('[data-wib-live-today]');
    D.liveNeedle = d.querySelector('[data-wib-live-needle]');
    D.liveFoot = d.querySelector('[data-wib-live-foot]');

    on(D.region, 'change', () => ctx.State.set('whatifRegion', D.region.value));

    on(D.ref, 'change', () => {
        const ref = D.ref.value;
        ctx.State.set('whatifRef', ref);
        // Spec §3.6: «level» is the natural default against the United Kingdom,
        // «rate» against the world average. Only volunteered while the reader has
        // not picked a mode by hand in this session.
        if (!_modeTouched) ctx.State.set('whatifCfMode', ref === 'GBR' ? 'level' : 'rate');
    });

    D.yearBtns.forEach(b => on(b, 'click', () => {
        ctx.State.set('whatifFrom', parseInt(b.getAttribute('data-wib-year'), 10));
    }));

    on(D.from, 'input', () => {
        const v = clamp(parseInt(D.from.value, 10) || Y0, Y0, 2000);
        D.fromOut.textContent = String(v);          // immediate readout; the pump redraws
        ctx.State.set('whatifFrom', v);
    });

    D.modeBtns.forEach(b => on(b, 'click', () => {
        _modeTouched = true;
        ctx.State.set('whatifCfMode', b.getAttribute('data-wib-mode'));
    }));

    D.intBtns.forEach(b => on(b, 'click', () => {
        ctx.State.set('whatifIntensity', b.getAttribute('data-wib-int'));
    }));

    D.exBtns.forEach(b => on(b, 'click', () => {
        const ex = EXAMPLES.find(e => e.id === b.getAttribute('data-wib-example'));
        if (!ex) return;
        _modeTouched = true;                        // an example is an explicit choice
        Object.keys(ex.set).forEach(k => ctx.State.set(k, ex.set[k]));
    }));
}

function syncDials(ctx) {
    const region = ctx.State.get('whatifRegion');
    const ref = ctx.State.get('whatifRef');
    const from = ctx.State.get('whatifFrom');
    const mode = ctx.State.get('whatifCfMode');
    const intensity = ctx.State.get('whatifIntensity');
    const es = isES();

    // localized option labels (the names live in whatif.json, not in the dictionaries)
    [D.region, D.ref].forEach(sel => {
        if (!sel) return;
        Array.from(sel.options).forEach(o => {
            const s = ctx.model.series(o.getAttribute('data-code'));
            o.textContent = es ? (s.name_es || s.name) : s.name;
        });
    });
    if (D.region && D.region.value !== region) D.region.value = region;
    if (D.ref && D.ref.value !== ref) D.ref.value = ref;

    if (D.from && String(from) !== D.from.value) D.from.value = String(from);
    if (D.fromOut) D.fromOut.textContent = String(from);
    if (D.from) D.from.setAttribute('aria-label', es ? 'Año de inicio' : 'Start year');
    if (D.region) D.region.setAttribute('aria-label', ctx.t('whatifBehindRegion', 'Region'));
    if (D.ref) D.ref.setAttribute('aria-label', ctx.t('whatifBehindReference', 'Reference'));
    D.yearBtns.forEach(b => b.classList.toggle('active', parseInt(b.getAttribute('data-wib-year'), 10) === from));
    D.modeBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-wib-mode') === mode));
    D.intBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-wib-int') === intensity));

    D.exBtns.forEach(b => {
        const ex = EXAMPLES.find(e => e.id === b.getAttribute('data-wib-example'));
        if (!ex) return;
        b.textContent = pick(ex);
        b.classList.toggle('active', Object.keys(ex.set).every(k => ctx.State.get(k) === ex.set[k]));
    });

    if (D.examplesHead) D.examplesHead.textContent = es ? 'Tres preguntas' : 'Three questions';

    const rp = regionProse(region, ctx.model.series(region));
    const rf = refProse(ref);
    if (D.modeNote) {
        D.modeNote.textContent = mode === 'level'
            ? (es
                ? `Mismo nivel: ${rp} tiene la renta por persona ${rf.gen} desde ${from}.`
                : `Same level: ${rp} has the income per person of ${rf.gen} from ${from} on.`)
            : (es
                ? `Mismo ritmo: ${rp} conserva su renta de ${from} y crece como ${rf.nom} desde entonces.`
                : `Same rate: ${rp} keeps its ${from} income and grows like ${rf.nom} from then on.`);
    }
    if (D.intNote) {
        D.intNote.textContent = es
            ? 'La población sigue su senda observada: solo cambian la renta y la intensidad de carbono.'
            : 'Population follows its observed path: only income and carbon intensity change.';
    }
}

// ---------------------------------------------------------------------------
// SCENE — skeleton once, contents on every update
// ---------------------------------------------------------------------------
function sceneHTML(ctx) {
    const card = (key, fb, hook) => `
  <div class="wi-card">
    <span class="wi-card-label" data-i18n="${key}">${esc(fb)}</span>
    <span class="wi-card-value" data-wi="${hook}">—</span>
    <span class="wi-card-sub" data-wi="${hook}-sub"></span>
  </div>`;

    // The legend sits ABOVE the figure, as it does in Ahead: with one mode
    // putting it over the chart and the other under it, flipping the switch
    // felt like changing section rather than question.
    return `<style>${OWN_CSS}</style>
<div class="wib-legend" id="wib-legend"></div>
<div class="wi-chart" id="wib-chart">
  <svg class="wi-chart-svg" id="wib-svg" role="img" aria-label="Observed and counterfactual emissions, 1850–2024"></svg>
  <div class="wib-tip" id="wib-tip" hidden></div>
</div>

<div class="wi-mini">
  <span class="wi-mini-label" data-i18n="whatifBehindMini">GDP per person</span>
  <svg class="wi-mini-svg" id="wib-mini" aria-hidden="true"></svg>
</div>

<div class="wi-therm">
  <div class="wib-therm-head">
    <span class="wib-therm-title" data-i18n="whatifThermTitle">Thermometer</span>
    <span class="wib-therm-read" id="wib-therm-read"></span>
  </div>
  <div class="wi-therm-rail" id="wib-rail"></div>
  <div class="wi-therm-scale" id="wib-scale"></div>
  <p class="wi-therm-note" data-i18n="whatifThermNote"></p>
</div>

<div class="wi-cards">
${card('whatifCardDeltaGt', 'Δ cumulative 1850–2024', 'delta-gt')}
${card('whatifCardDeltaT', 'Δ warming today', 'delta-t')}
${card('whatifCardCrossing', 'Budget crossed', 'crossing')}
${card('whatifCardGdp', 'GDP per person in 2024', 'gdp')}
</div>

<p class="wi-sentence" data-wi="sentence"></p>
<p class="wi-sentence" data-wi="sentence-income"></p>
<p class="wib-note" id="wib-budget-note"></p>

<div class="wib-assump" id="wib-assump">
  <button class="wib-assump-toggle" type="button" id="wib-assump-toggle" aria-expanded="false">
    <span id="wib-assump-label">Stated assumptions</span><span class="wi-caret" aria-hidden="true">&#9660;</span>
  </button>
  <ul class="wib-assump-body" id="wib-assump-body"></ul>
</div>`;
}

function wireScene(ctx) {
    const r = ctx.root;
    D.chart = r.querySelector('#wib-chart');
    D.svg = r.querySelector('#wib-svg');
    D.tip = r.querySelector('#wib-tip');
    D.legend = r.querySelector('#wib-legend');
    D.mini = r.querySelector('#wib-mini');
    D.thermRead = r.querySelector('#wib-therm-read');
    D.rail = r.querySelector('#wib-rail');
    D.scale = r.querySelector('#wib-scale');
    D.budgetNote = r.querySelector('#wib-budget-note');
    D.sentence = r.querySelector('[data-wi="sentence"]');
    D.income = r.querySelector('[data-wi="sentence-income"]');
    D.assump = r.querySelector('#wib-assump');
    D.assumpToggle = r.querySelector('#wib-assump-toggle');
    D.assumpLabel = r.querySelector('#wib-assump-label');
    D.assumpBody = r.querySelector('#wib-assump-body');
    D.cards = {};
    ['delta-gt', 'delta-t', 'crossing', 'gdp'].forEach(k => {
        D.cards[k] = {
            v: r.querySelector(`[data-wi="${k}"]`),
            s: r.querySelector(`[data-wi="${k}-sub"]`)
        };
    });

    on(D.assumpToggle, 'click', () => {
        _assumpOpen = !_assumpOpen;
        D.assump.classList.toggle('open', _assumpOpen);
        D.assumpToggle.setAttribute('aria-expanded', _assumpOpen ? 'true' : 'false');
    });

    on(D.svg, 'pointermove', onPointer);
    on(D.svg, 'pointerdown', onPointer);
    on(D.svg, 'pointerleave', hideTip);
    on(D.svg, 'pointercancel', hideTip);
}

// ---------------------------------------------------------------------------
// the big figure: observed vs counterfactual emissions, 1850–2024
// ---------------------------------------------------------------------------
let _geom = null;   // {padL, padR, padT, padB, w, h, xOf, yOf} for the tooltip

function drawChart(ctx) {
    const svg = D.svg;
    if (!svg || !_res) return;
    const rect = svg.getBoundingClientRect();
    const w = Math.round(rect.width) || 0;
    if (w < 60) { _geom = null; return; }           // still hidden: wait for the resize pump
    const h = Math.round(rect.height) || (ctx.isMobile() ? 250 : 320);
    const P = _pal;
    const es = isES();

    const i0 = Y0 - IDX0, i1 = Y1 - IDX0;
    const act = _res.series_actual_mt, cf = _res.series_cf_mt;
    let vmax = 0;
    for (let i = i0; i <= i1; i++) {
        if (act[i] > vmax) vmax = act[i];
        if (cf[i] > vmax) vmax = cf[i];
    }
    const yMax = niceMax(vmax);

    const narrow = w < 460;
    const padL = narrow ? 42 : 52, padR = 12, padT = 18, padB = 24;
    const plotW = Math.max(10, w - padL - padR);
    const plotH = Math.max(10, h - padT - padB);
    const xOf = (year) => padL + (year - Y0) / (Y1 - Y0) * plotW;
    const yOf = (v) => padT + plotH - clamp(v, 0, yMax) / yMax * plotH;
    _geom = { padL, padR, padT, padB, w, h, plotW, plotH, xOf, yOf };

    const n = Y1 - Y0 + 1;
    const X = new Array(n), YA = new Array(n), YB = new Array(n), A = new Array(n), B = new Array(n);
    for (let k = 0; k < n; k++) {
        const year = Y0 + k, i = year - IDX0;
        A[k] = act[i]; B[k] = cf[i];
        X[k] = xOf(year); YA[k] = yOf(A[k]); YB[k] = yOf(B[k]);
    }

    // --- the tinted difference, split into runs of a single sign -----------
    const runs = [];
    let cur = null;
    for (let k = 0; k < n; k++) {
        const diff = B[k] - A[k];
        const sg = diff > 1e-9 ? 1 : diff < -1e-9 ? -1 : 0;
        if (!cur) { cur = { sign: sg, from: k, to: k }; continue; }
        if (sg === 0 || sg === cur.sign) { cur.to = k; if (cur.sign === 0) cur.sign = sg; continue; }
        const d0 = B[k - 1] - A[k - 1], d1 = diff;
        const t = (d0 - d1) === 0 ? 0.5 : d0 / (d0 - d1);
        const xc = X[k - 1] + t * (X[k] - X[k - 1]);
        const yc = YA[k - 1] + t * (YA[k] - YA[k - 1]);
        cur.tail = [xc, yc];
        runs.push(cur);
        cur = { sign: sg, from: k, to: k, head: [xc, yc] };
    }
    if (cur) runs.push(cur);

    const areas = runs.filter(r => r.sign !== 0).map(r => {
        const p = [];
        if (r.head) p.push('M' + r.head[0].toFixed(1) + ' ' + r.head[1].toFixed(1));
        for (let k = r.from; k <= r.to; k++) p.push((p.length ? 'L' : 'M') + X[k].toFixed(1) + ' ' + YA[k].toFixed(1));
        if (r.tail) p.push('L' + r.tail[0].toFixed(1) + ' ' + r.tail[1].toFixed(1));
        for (let k = r.to; k >= r.from; k--) p.push('L' + X[k].toFixed(1) + ' ' + YB[k].toFixed(1));
        p.push('Z');
        const fill = r.sign > 0 ? P.verm : P.cd;
        const op = r.sign > 0 ? 0.2 : 0.11;
        return `<path d="${p.join(' ')}" fill="${fill}" fill-opacity="${op}"></path>`;
    }).join('');

    const line = (Ys) => Ys.map((y, k) => (k ? 'L' : 'M') + X[k].toFixed(1) + ' ' + y.toFixed(1)).join(' ');

    // --- axes -------------------------------------------------------------
    const step = yMax / 4;
    const dec = step / 1000 >= 10 ? 0 : step / 1000 >= 1 ? 1 : 2;
    let grid = '';
    for (let k = 0; k <= 4; k++) {
        const v = step * k, y = yOf(v);
        grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${(w - padR).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${P.cb}" stroke-width="1" stroke-opacity="${k === 0 ? 1 : 0.45}"></line>`;
        grid += `<text x="${padL - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="${P.cl}" font-family="${esc(P.ff)}" font-size="${narrow ? 9 : 10}">${ctx.fmt.n(v / 1000, dec)}</text>`;
    }
    const ticks = narrow ? [1850, 1900, 1950, 2000] : [1850, 1900, 1950, 2000, 2024];
    let xax = '';
    ticks.forEach(y => {
        xax += `<text x="${xOf(y).toFixed(1)}" y="${(h - 8).toFixed(1)}" text-anchor="middle" fill="${P.cl}" font-family="${esc(P.ff)}" font-size="${narrow ? 9 : 10}">${y}</text>`;
    });

    const t0 = _res.inputs.start_year;
    let t0mark = '';
    if (t0 > Y0) {
        const x = xOf(t0);
        t0mark = `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="${P.cl}" stroke-width="1" stroke-dasharray="2 3"></line>`
            + `<text x="${(x + 4).toFixed(1)}" y="${(padT + 9).toFixed(1)}" fill="${P.cl}" font-family="${esc(P.ff)}" font-size="9.5">${t0}</text>`;
    }

    // Tracked capitals, like the unit of the Ahead figure: it is the house
    // convention for a rubric, and having one mode in mixed case and the other
    // in small caps made the switch read as a change of section.
    const unit = es ? 'GT CO₂/AÑO' : 'GT CO₂/YR';
    const unitSaid = es ? 'Gt CO₂/año' : 'Gt CO₂/yr';     // for the screen reader
    const label = es
        ? `Emisiones observadas y contrafactuales, 1850–2024, en ${unitSaid}`
        : `Observed and counterfactual emissions, 1850–2024, in ${unitSaid}`;

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-label', label);
    svg.innerHTML = `<title>${esc(label)}</title>
<rect x="0" y="0" width="${w}" height="${h}" fill="${P.foam}"></rect>
${grid}${areas}${t0mark}
<path d="${line(YB)}" fill="none" stroke="${P.vermDeep}" stroke-width="1.5" stroke-dasharray="5 4" stroke-linejoin="round"></path>
<path d="${line(YA)}" fill="none" stroke="${P.cd}" stroke-width="1.6" stroke-linejoin="round"></path>
<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${(padT + plotH).toFixed(1)}" stroke="${P.cb}" stroke-width="1"></line>
${xax}
<text x="${padL}" y="${(padT - 6).toFixed(1)}" fill="${P.cl}" font-family="${esc(P.ff)}" font-size="9.5" letter-spacing="0.14em">${esc(unit)}</text>
<line id="wib-guide" x1="0" y1="${padT}" x2="0" y2="${(padT + plotH).toFixed(1)}" stroke="${P.cl}" stroke-width="1" visibility="hidden"></line>
<circle id="wib-dotA" r="3" fill="${P.cd}" visibility="hidden"></circle>
<circle id="wib-dotB" r="3" fill="${P.vermDeep}" visibility="hidden"></circle>`;

    D.guide = svg.querySelector('#wib-guide');
    D.dotA = svg.querySelector('#wib-dotA');
    D.dotB = svg.querySelector('#wib-dotB');
}

function drawMini(ctx) {
    const svg = D.mini;
    if (!svg || !_res) return;
    const rect = svg.getBoundingClientRect();
    const w = Math.round(rect.width) || 0;
    if (w < 40) return;
    const h = Math.round(rect.height) || 46;
    const P = _pal;
    const i0 = Y0 - IDX0, i1 = Y1 - IDX0;
    const a = _res.gdp_pc_actual, b = _res.gdp_pc_cf;
    let vmax = 0;
    for (let i = i0; i <= i1; i++) { if (a[i] > vmax) vmax = a[i]; if (b[i] > vmax) vmax = b[i]; }
    const yMax = niceMax(vmax);
    const pad = 3;
    const xOf = (y) => (y - Y0) / (Y1 - Y0) * w;
    const yOf = (v) => (h - pad) - clamp(v, 0, yMax) / yMax * (h - pad * 2);
    const path = (arr) => {
        let p = '';
        for (let year = Y0; year <= Y1; year++) {
            p += (p ? 'L' : 'M') + xOf(year).toFixed(1) + ' ' + yOf(arr[year - IDX0]).toFixed(1);
        }
        return p;
    };
    // the wedge between the two income paths, so the divergence reads at 46 px
    let back = '';
    for (let year = Y1; year >= Y0; year--) back += 'L' + xOf(year).toFixed(1) + ' ' + yOf(a[year - IDX0]).toFixed(1);
    const richer = b[i1] >= a[i1];
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML =
        `<path d="${path(b)}${back}Z" fill="${richer ? P.verm : P.cd}" fill-opacity="${richer ? 0.16 : 0.09}"></path>` +
        `<path d="${path(b)}" fill="none" stroke="${P.vermDeep}" stroke-width="1.4" stroke-dasharray="4 3"></path>` +
        `<path d="${path(a)}" fill="none" stroke="${P.cd}" stroke-width="1.4"></path>`;
}

// ---------------------------------------------------------------------------
// tooltip
// ---------------------------------------------------------------------------
function gtYear(ctx, mt) {
    const v = mt / 1000;
    return ctx.fmt.gt(v, Math.abs(v) < 10 ? 2 : 1);
}

function onPointer(ev) {
    const ctx = _ctx;
    if (!ctx || !_geom || !_res || !D.tip) return;
    const rect = D.svg.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    if (px < _geom.padL - 4 || px > _geom.w - _geom.padR + 4) { hideTip(); return; }
    const frac = clamp((px - _geom.padL) / _geom.plotW, 0, 1);
    const year = Math.round(Y0 + frac * (Y1 - Y0));
    const i = year - IDX0;
    const a = _res.series_actual_mt[i], b = _res.series_cf_mt[i];
    const es = isES();
    const x = _geom.xOf(year);

    D.tip.innerHTML =
        `<b>${year}</b>` +
        `${esc(es ? 'Observado' : 'Observed')}: ${gtYear(ctx, a)} Gt<br>` +
        `${esc(es ? 'Contrafactual' : 'Counterfactual')}: ${gtYear(ctx, b)} Gt<br>` +
        `Δ ${(b - a) > 0 ? '+' : ''}${gtYear(ctx, b - a)} Gt`;
    D.tip.hidden = false;
    const tw = D.tip.offsetWidth || 120;
    D.tip.style.left = clamp(x + 12, 4, Math.max(4, _geom.w - tw - 4)) + 'px';

    if (D.guide) {
        D.guide.setAttribute('x1', x.toFixed(1));
        D.guide.setAttribute('x2', x.toFixed(1));
        D.guide.setAttribute('visibility', 'visible');
    }
    if (D.dotA) {
        D.dotA.setAttribute('cx', x.toFixed(1));
        D.dotA.setAttribute('cy', _geom.yOf(a).toFixed(1));
        D.dotA.setAttribute('visibility', 'visible');
    }
    if (D.dotB) {
        D.dotB.setAttribute('cx', x.toFixed(1));
        D.dotB.setAttribute('cy', _geom.yOf(b).toFixed(1));
        D.dotB.setAttribute('visibility', 'visible');
    }
}

function hideTip() {
    if (D.tip) D.tip.hidden = true;
    if (D.guide) D.guide.setAttribute('visibility', 'hidden');
    if (D.dotA) D.dotA.setAttribute('visibility', 'hidden');
    if (D.dotB) D.dotB.setAttribute('visibility', 'hidden');
}

// ---------------------------------------------------------------------------
// thermometer (spec §6): T'2024 against the 1.36 °C of today
// ---------------------------------------------------------------------------
function drawThermometer(ctx) {
    if (!D.rail || !_res) return;
    const P = _pal;
    const today = _res.t_2024_actual_c;
    const cfT = _res.t_2024_cf_c;
    const rng = _res.t_2024_cf_range;   // ascending (F-03)

    // Behind used the 1.0–3.5 °C rail it had inherited from Ahead, but the
    // whole story of Behind happens between about 1.1 and 1.5 °C: 97 % of the
    // rail was empty and the difference the reader came to see measured 11 px
    // on a phone. The rail is fitted to the story instead, with the marks that
    // fall outside it announced by an arrow at the edge.
    const vals = [today, cfT, rng[0], rng[1]];
    const dLo = Math.min.apply(null, vals), dHi = Math.max.apply(null, vals);
    const span = Math.max(0.5, (dHi - dLo) / 0.55);          // story ≈ 55 % of the rail
    const mid = (dLo + dHi) / 2;
    const step = span <= 0.7 ? 0.1 : span <= 1.6 ? 0.25 : 0.5;
    const lo = Math.max(0, Math.floor((mid - span / 2) / step) * step);
    const hi = Math.ceil((mid + span / 2) / step) * step;
    const pos = (v) => clamp((v - lo) / (hi - lo), 0, 1) * 100;
    const inRail = (v) => v >= lo && v <= hi;

    const marks = [1.5, 2.0, 3.0].filter(inRail).map(v =>
        `<span class="wi-therm-tick" style="left:${pos(v).toFixed(2)}%" title="${ctx.fmt.deg(v, 1)} °C"></span>`).join('');

    D.rail.innerHTML =
        `<span class="wi-therm-band" style="left:${pos(rng[0]).toFixed(2)}%;width:${Math.max(0.4, pos(rng[1]) - pos(rng[0])).toFixed(2)}%"></span>` +
        marks +
        `<span class="wib-therm-today" style="left:${pos(today).toFixed(2)}%" title="${ctx.fmt.deg(today)} °C"></span>` +
        `<span class="wi-therm-needle" style="left:${pos(cfT).toFixed(2)}%"></span>`;

    let scale = '';
    for (let v = lo; v <= hi + 1e-9; v += step) scale += `<span>${ctx.fmt.n(v, step < 0.1 ? 2 : 1)}</span>`;
    D.scale.innerHTML = scale;

    const es = isES();
    const away = [1.5, 2.0].filter(v => v > hi);
    const off = away.length
        ? ` &middot; <span class="wib-therm-off" title="${esc(es0Title())}">${esc(ctx.fmt.n(away[0], 1))} °C &rsaquo;</span>`
        : '';
    D.thermRead.innerHTML =
        `${esc(es ? 'Hoy' : 'Today')} ${ctx.fmt.deg(today)} °C &rarr; ` +
        `<strong>${ctx.fmt.deg(cfT)} °C</strong> ` +
        `(${ctx.fmt.deg(rng[0])}&ndash;${ctx.fmt.deg(rng[1])})${off}`;
}

// ---------------------------------------------------------------------------
// cards, legend, notes and the generated sentences (spec §8.3)
// ---------------------------------------------------------------------------
function setCard(key, value, sub, raw) {
    const c = D.cards[key];
    if (!c) return;
    if (c.v) {
        c.v.innerHTML = value;
        if (raw !== undefined && raw !== null) c.v.setAttribute('data-value', String(raw));
        else c.v.removeAttribute('data-value');
    }
    if (c.s) c.s.innerHTML = sub || '';
}

function drawText(ctx) {
    if (!_res) return;
    const f = ctx.fmt, es = isES(), r = _res;
    const region = r.inputs.region, ref = r.inputs.reference;
    const s = ctx.model.series(region);
    const rp = regionProse(region, s);
    const t0 = r.inputs.start_year;

    // --- legend under the figure (it carries the two cumulatives) ---------
    D.legend.innerHTML =
        `<span><span class="wib-key" style="border-top-color:var(--cd)"></span>` +
        `${esc(es ? 'Observado' : 'Observed')} 1850&ndash;2024 &middot; ` +
        `<b data-wi="cum-actual" data-value="${r.cum_region_actual_gt}">${f.gt(r.cum_region_actual_gt)} Gt</b></span>` +
        `<span><span class="wib-key" style="border-top-color:var(--verm-deep);border-top-style:dashed"></span>` +
        `${esc(es ? 'Contrafactual' : 'Counterfactual')} &middot; ` +
        `<b data-wi="cum-cf" data-value="${r.cum_region_cf_gt}">${f.gt(r.cum_region_cf_gt)} Gt</b></span>`;

    // --- cards ------------------------------------------------------------
    const dGt = r.delta_gt, dYr = r.delta_years_of_2024_world_emissions;
    const sign = (x) => (x > 0 ? '+' : x < 0 ? f.minus : '');
    setCard('delta-gt',
        `${sign(dGt)}${f.gt(Math.abs(dGt))} Gt`,
        `${sign(dYr)}${f.n(Math.abs(dYr), 1)} ${esc(es ? 'años de emisiones mundiales de 2024' : 'years of 2024 world emissions')}`,
        dGt);
    setCard('delta-t',
        `${sign(r.delta_t_c)}${f.deg(Math.abs(r.delta_t_c))} °C`,
        `${sign(r.delta_t_range[0])}${f.deg(Math.abs(r.delta_t_range[0]))} ${esc(es ? 'a' : 'to')} ${sign(r.delta_t_range[1])}${f.deg(Math.abs(r.delta_t_range[1]))} °C`,
        r.delta_t_c);

    // The two hooks stay addressable even when neither budget was crossed.
    const y15 = r.crossing_year_1p5_cf, y20 = r.crossing_year_2p0_cf;
    const crossVal =
        `<span data-wi="cross-15" data-value="${y15 == null ? '' : y15}">${f.year(y15)}</span>` +
        ` / <span data-wi="cross-20" data-value="${y20 == null ? '' : y20}">${f.year(y20)}</span>`;
    const crossSub = (y15 == null && y20 == null)
        ? esc(es ? 'los dos presupuestos seguirían intactos' : 'both budgets would still be intact')
        : `${f.n(1.5, 1)} °C / ${f.n(2, 0)} °C`;
    setCard('crossing', crossVal, crossSub, null);

    const money = (x) => (es ? `${f.n(x, 0)} $` : `$${f.n(x, 0)}`);
    setCard('gdp',
        `<span data-wi="gdp-cf" data-value="${r.gdp_pc_2024_cf}">${money(r.gdp_pc_2024_cf)}</span>`,
        `${esc(es ? 'en vez de' : 'instead of')} <span data-wi="gdp-actual" data-value="${r.gdp_pc_2024_actual}">${money(r.gdp_pc_2024_actual)}</span>`,
        null);

    // --- budget note (spec §4.3) ------------------------------------------
    D.budgetNote.textContent = es
        ? `Presupuesto tal como lo usa este visor (CO₂ fósil, coherente con el paper «Safe space»): ${f.gt(r.implied_total_1p5_gt)} Gt desde 1850 para 1,5 °C y ${f.gt(r.implied_total_2p0_gt)} Gt para 2 °C, ambos al 50 %. El mundo real llevaba ${f.gt(r.cum_world_actual_1850_2024_gt)} Gt a finales de 2024; en este mundo, ${f.gt(r.cum_world_cf_1850_2024_gt)} Gt.`
        : `Carbon budget as used in this viewer (fossil CO₂, consistent with the “Safe space” paper): ${f.gt(r.implied_total_1p5_gt)} Gt since 1850 for 1.5 °C and ${f.gt(r.implied_total_2p0_gt)} Gt for 2 °C, both at 50 %. The real world stood at ${f.gt(r.cum_world_actual_1850_2024_gt)} Gt at the end of 2024; in this world, ${f.gt(r.cum_world_cf_1850_2024_gt)} Gt.`;

    // --- the generated sentence (spec §8.3) -------------------------------
    const mt = modeProse(r.inputs.mode, ref);
    const it = intensityProse(r.inputs.intensity, ref);
    const absGt = f.n(Math.abs(dGt), 0);
    // one decimal while the figure is small enough to need it (the spec's B2
    // example reads «96 years», not «96.0»)
    const absYr = f.n(Math.abs(dYr), Math.abs(dYr) < 20 ? 1 : 0);
    let deltaText;
    if (Math.abs(dGt) < 0.05) {
        deltaText = es ? 'sin cambio' : 'no change';
    } else if (es) {
        deltaText = `${absGt} Gt ${dGt > 0 ? 'más' : 'menos'}, ${absYr} años de emisiones actuales`;
    } else {
        deltaText = `${absGt} Gt ${dGt > 0 ? 'more' : 'less'}, ${absYr} years of today's emissions`;
    }
    const dRange = `${sign(r.delta_t_range[0])}${f.deg(Math.abs(r.delta_t_range[0]))} ${es ? 'a' : 'to'} ${sign(r.delta_t_range[1])}${f.deg(Math.abs(r.delta_t_range[1]))}`;

    let budgetText;
    if (y15 == null && y20 == null) {
        budgetText = es ? 'Los dos presupuestos seguirían intactos.' : 'Both budgets would still be intact.';
    } else if (y20 == null) {
        budgetText = es
            ? `El presupuesto de 1,5 °C se habría agotado en ${y15} y el de 2 °C seguiría intacto.`
            : `The 1.5 °C budget would have been exhausted in ${y15} and the 2 °C budget would still be intact.`;
    } else {
        budgetText = es
            ? `El presupuesto de 1,5 °C se habría agotado en ${y15} y el de 2 °C en ${y20}.`
            : `The 1.5 °C budget would have been exhausted in ${y15} and the 2 °C budget in ${y20}.`;
    }

    D.sentence.innerHTML = es
        ? `Si ${esc(rp)} hubiera ${esc(mt)} desde ${t0} con ${esc(it)}, habría emitido <strong>${f.gt(r.cum_region_cf_gt)} Gt</strong> de CO₂ fósil en 1850–2024 en vez de ${f.gt(r.cum_region_actual_gt)} Gt —${esc(deltaText)}— y el calentamiento antropogénico actual sería de unos <strong>${f.deg(r.t_2024_cf_c)} °C</strong> en vez de ${f.deg(r.t_2024_actual_c)} °C (${dRange}). ${esc(budgetText)}`
        : `If ${esc(rp)} had ${esc(mt)} from ${t0} with ${esc(it)}, it would have emitted <strong>${f.gt(r.cum_region_cf_gt)} Gt</strong> of fossil CO₂ in 1850–2024 instead of ${f.gt(r.cum_region_actual_gt)} Gt — ${esc(deltaText)} — and human-induced warming today would be about <strong>${f.deg(r.t_2024_cf_c)} °C</strong> instead of ${f.deg(r.t_2024_actual_c)} °C (${dRange}). ${esc(budgetText)}`;

    const rg = regionGen(region, s);
    D.income.textContent = es
        ? `El PIB por persona ${rg} en 2024 sería de ${money(r.gdp_pc_2024_cf)} en vez de ${money(r.gdp_pc_2024_actual)} (dólares internacionales PPA, Maddison); las emisiones de 2024, ${f.gt(r.e_2024_cf_mt / 1000)} Gt en vez de ${f.gt(r.series_actual_mt[Y1 - IDX0] / 1000)} Gt.`
        : `GDP per person ${rg} in 2024 would be ${money(r.gdp_pc_2024_cf)} instead of ${money(r.gdp_pc_2024_actual)} (international $ PPP, Maddison), and 2024 emissions ${f.gt(r.e_2024_cf_mt / 1000)} Gt instead of ${f.gt(r.series_actual_mt[Y1 - IDX0] / 1000)} Gt.`;

    // --- stated assumptions (spec §3.6) -----------------------------------
    D.assumpLabel.textContent = es ? 'Supuestos declarados' : 'Stated assumptions';
    const items = es ? [
        'La población sigue su senda observada: la renta no retroalimenta la demografía.',
        'La intensidad de carbono de una región es independiente de su nivel de renta (en la historia real sigue una U invertida: por eso se ofrecen tres intensidades).',
        'Sin efectos de equilibrio general: ni precios, ni comercio, ni tecnología inducida.',
        'El Reino Unido forma parte del mundo y de Europa Occidental: en «el mundo como el Reino Unido» se sustituye toda la senda mundial, él incluido.',
        'El TCRE se aplica de forma lineal también a los deltas negativos (menos calentamiento que el real).',
        'El resto del mundo no cambia: solo se reescribe la región elegida y el mundo hereda la diferencia.'
    ] : [
        'Population follows its observed path: income feeds nothing back into demography.',
        'A region’s carbon intensity is independent of its income level (in real history it traces an inverted U — hence the three intensity options).',
        'No general-equilibrium effects: no prices, no trade, no induced technology.',
        'The United Kingdom is part of the world and of Western Europe: in “the world like the UK” the whole world path is replaced, the UK included.',
        'TCRE is applied linearly to negative deltas too (less warming than the real one).',
        'The rest of the world is unchanged: only the chosen region is rewritten and the world inherits the difference.'
    ];
    D.assumpBody.innerHTML = items.map(x => `<li>${esc(x)}</li>`).join('');
}

/**
 * The live reading that rides with the controls on a phone (see .wi-live).
 * It mirrors the thermometer: today's warming against the counterfactual one.
 */
function drawLive(ctx) {
    if (!D.liveRead || !_res) return;
    const f = ctx.fmt, es = isES(), r = _res;
    const d = r.delta_t_c;
    const sign = d > 0 ? '+' : d < 0 ? f.minus : '';
    D.liveRead.textContent = `${sign}${f.deg(Math.abs(d))} °C`;
    if (D.liveToday && D.liveNeedle && D.liveRail) {
        const vals = [r.t_2024_actual_c, r.t_2024_cf_c];
        const lo = Math.min.apply(null, vals) - 0.12, hi = Math.max.apply(null, vals) + 0.12;
        const pos = (v) => clamp((v - lo) / (hi - lo), 0, 1) * 100;
        D.liveToday.style.left = pos(r.t_2024_actual_c).toFixed(2) + '%';
        D.liveNeedle.style.left = pos(r.t_2024_cf_c).toFixed(2) + '%';
    }
    D.liveFoot.textContent = es
        ? `Hoy ${f.deg(r.t_2024_actual_c)} °C → ${f.deg(r.t_2024_cf_c)} °C`
        : `Today ${f.deg(r.t_2024_actual_c)} °C → ${f.deg(r.t_2024_cf_c)} °C`;
}

// ---------------------------------------------------------------------------
// compute
// ---------------------------------------------------------------------------
function compute(ctx, force) {
    const S = ctx.State;
    const sig = [S.get('whatifRegion'), S.get('whatifRef'), S.get('whatifFrom'),
        S.get('whatifCfMode'), S.get('whatifIntensity')].join('|');
    if (!force && sig === _sig && _res) return;
    _sig = sig;
    _err = null;
    try {
        _res = ctx.model.counterfactualResult({
            region: S.get('whatifRegion'),
            reference: S.get('whatifRef'),
            fromYear: S.get('whatifFrom'),
            mode: S.get('whatifCfMode'),
            intensity: S.get('whatifIntensity'),
            probability: '50%'
        });
    } catch (err) {
        _res = null;
        _err = String((err && err.message) || err);
        console.error('[whatif/behind] counterfactual failed:', err);
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function initBehindView(ctx) {
    _ctx = ctx;
    _pal = readPalette();
    _res = null;
    _sig = '';
    _modeTouched = false;

    ctx.dials.innerHTML = dialsHTML(ctx);
    ctx.applyI18n(ctx.dials);
    wireDials(ctx);

    ctx.root.innerHTML = sceneHTML(ctx);
    ctx.applyI18n(ctx.root);
    wireScene(ctx);

    _offResize = ctx.onResize(() => { /* the pump already calls update({reason:'resize'}) */ });
}

export function updateBehindView(info = {}) {
    const ctx = _ctx;
    if (!ctx) return;
    const reason = info.reason || 'redraw';

    compute(ctx, reason === 'init');
    if (_err) {
        if (D.sentence) D.sentence.textContent = _err;
        return;
    }
    if (!_res) return;

    if (reason !== 'resize') syncDials(ctx);
    hideTip();
    drawChart(ctx);
    drawMini(ctx);
    drawThermometer(ctx);
    if (reason !== 'resize') drawText(ctx);
    drawLive(ctx);

    // Perpetua has no subscript two and its degree ring is oversized: the
    // shell swaps those two glyphs for the sans face after every redraw.
    ctx.sciFix(ctx.root);
    ctx.sciFix(ctx.dials);
}

export function destroyBehindView() {
    dropListeners();
    if (_offResize) { _offResize(); _offResize = null; }
    if (_ctx) {
        if (_ctx.dials) _ctx.dials.innerHTML = '';
        if (_ctx.root) _ctx.root.innerHTML = '';
    }
    Object.keys(D).forEach(k => { delete D[k]; });
    _ctx = null;
    _res = null;
    _sig = '';
    _geom = null;
    _err = null;
}
