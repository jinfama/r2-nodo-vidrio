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
        es: 'El mundo con la renta británica desde 1850',
        zh: '1850 年以来世界达到英国的收入水平'
    },
    {
        id: 'china-uk-1978',
        set: { whatifRegion: 'CHN', whatifRef: 'GBR', whatifFrom: 1978, whatifCfMode: 'rate', whatifIntensity: 'own' },
        en: 'China growing like the UK since 1978',
        es: 'China creciendo como el Reino Unido desde 1978',
        zh: '1978 年以来中国以英国的速度增长'
    },
    {
        // The third of Juan's readings: "as rich as", not "growing like".
        // Without it the level counterfactual needed a hand-thrown switch.
        id: 'china-uk-level-1978',
        set: { whatifRegion: 'CHN', whatifRef: 'GBR', whatifFrom: 1978, whatifCfMode: 'level', whatifIntensity: 'own' },
        en: 'China at British income levels since 1978',
        es: 'China con la renta británica desde 1978',
        zh: '1978 年以来中国达到英国的收入水平'
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
function isZH() { return _ctx && _ctx.lang() === 'zh'; }

/** One of three literals, by the language of the day (zh falls back to en). */
function pk(en, es, zh) { return isES() ? es : isZH() ? (zh == null ? en : zh) : en; }

/** Pick the EN / ES / ZH member of a {en, es, zh} bundle. */
function pick(pair) { return isES() ? pair.es : isZH() ? (pair.zh || pair.en) : pair.en; }

/** The region names of whatif.json in Chinese (the JSON carries en + es only). */
const REGION_ZH = {
    WLD: '世界', EAP: '东亚与太平洋', ECA: '欧洲与中亚',
    LAC: '拉丁美洲与加勒比', MENA: '中东与北非', NAM: '北美',
    SAS: '南亚', SSA: '撒哈拉以南非洲', WEU: '西欧',
    CHN: '中国', GBR: '英国'
};
function regionName(code, s) {
    if (isZH()) return REGION_ZH[code] || (s && s.name) || code;
    if (isES()) return (s && (s.name_es || s.name)) || code;
    return (s && s.name) || code;
}

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
    if (code === 'WLD') return pk('the world', 'el mundo', '世界');
    if (code === 'GBR') return pk('the United Kingdom', 'el Reino Unido', '英国');
    return regionName(code, s);
}

/**
 * The region after the preposition «de». Spanish contracts de + el into del,
 * so the income sentence used to read «El PIB por persona de el mundo…».
 * refProse() has carried this pair from the start; regionProse() had not.
 */
function regionGen(code, s) {
    const nom = regionProse(code, s);
    if (isZH()) return nom;
    if (!isES()) return 'in ' + nom;
    return nom.slice(0, 3) === 'el ' ? 'del ' + nom.slice(3) : 'de ' + nom;
}

/** The reference, nominative and genitive (Spanish contracts «de el» → «del»). */
function refProse(code) {
    if (code === 'GBR') {
        if (isZH()) return { nom: '英国', gen: '英国' };
        return isES()
            ? { nom: 'el Reino Unido', gen: 'del Reino Unido' }
            : { nom: 'the United Kingdom', gen: 'the United Kingdom' };
    }
    if (isZH()) return { nom: '世界平均水平', gen: '世界平均水平' };
    return isES()
        ? { nom: 'la media mundial', gen: 'de la media mundial' }
        : { nom: 'the world average', gen: 'the world average' };
}

/** «grown as fast as X» / «reached the income level of X» (already inflected). */
function modeProse(mode, refCode) {
    const r = refProse(refCode);
    if (isZH()) {
        return mode === 'level' ? '达到' + r.gen + '的收入水平' : '以' + r.nom + '一样快的速度增长';
    }
    if (isES()) {
        return mode === 'level'
            ? 'alcanzado el nivel de renta ' + r.gen
            : 'crecido tanto como ' + r.nom;
    }
    return mode === 'level'
        ? 'reached the income level of ' + r.gen
        : 'grown as fast as ' + r.nom;
}

/** «its own carbon intensity» / «the UK's» / «the world-average». */
function intensityProse(intensity, refCode) {
    const asWorld = (intensity === 'world') || (intensity === 'ref' && refCode === 'WLD');
    if (isZH()) {
        if (intensity === 'own') return '自身的碳强度';
        return asWorld ? '世界平均碳强度' : '英国的碳强度';
    }
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
.wib-wide{width:100%;text-align:left;white-space:normal;line-height:1.3}
.wib-stack{flex-direction:column;gap:4px}
.wib-years{display:flex;flex-wrap:wrap;gap:4px}
.wib-field{margin-bottom:9px}
.wib-sublabel{display:block;margin-bottom:5px}
/* Behind carries an extra strip inside the stage (the income thumbnail) and
   two sentences instead of one, so its stage gives back what they cost: at
   1440x900 the scene then closes without a scroll of its own, as Ahead does. */
#whatif-behind .wi-stage{height:clamp(246px,37vh,400px)}
#whatif-behind .wi-readout{gap:6px}
#whatif-behind .wi-mini{padding:5px 10px 6px}
#whatif-behind .wi-mini-svg{height:62px}
@media(min-width:901px) and (max-height:820px){
  #whatif-behind .wi-stage{height:clamp(226px,32vh,300px)}
  #whatif-behind .wi-mini-svg{height:50px}
  #whatif-behind .wib-note{font-size:10.5px;line-height:1.4}
}
.wib-tip{position:absolute;top:10px;left:0;z-index:5;pointer-events:none;background:var(--bg);border:1px solid var(--cb);padding:6px 9px 7px;font-size:11.5px;line-height:1.5;color:var(--cd);white-space:nowrap;font-variant-numeric:tabular-nums lining-nums}
.wib-tip[hidden]{display:none}
.wib-tip b{display:block;margin-bottom:3px;font-family:var(--ff-caps);font-size:9.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--cl)}
.wib-therm-read{font-family:var(--ff-serif);font-size:12.5px;letter-spacing:0;text-transform:none;color:var(--verm-ink);font-variant-numeric:tabular-nums lining-nums;white-space:nowrap}
.wib-therm-read strong{font-weight:700;color:var(--verm-ink)}
.wib-note{margin:0;font-size:11px;line-height:1.45;color:var(--cl);font-variant-numeric:tabular-nums lining-nums}
/* the two-number card ("1984 / 1996") needs a smaller numeral */
.wi-card[data-wib-card="crossing"] .wi-card-value{font-size:20px}
.wib-assump{border-top:1px solid var(--cb);padding-top:6px;margin-top:1px}
.wib-assump-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:24px;padding:0;border:0;background:transparent;color:var(--cl);font-family:var(--ff-caps);font-size:9px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;text-align:left}
.wib-assump-toggle:hover{color:var(--cd)}
.wib-assump-body{display:none;margin:5px 0 0;padding:0 0 0 15px;font-size:11px;line-height:1.5;color:var(--cg)}
.wib-assump-body li{margin-bottom:4px}
.wib-assump.open .wib-assump-body{display:block}
.wib-assump.open .wi-caret{transform:rotate(180deg)}
.wib-empty{font-family:var(--ff-serif);font-style:italic;font-size:14px;color:var(--cg)}
.wi-live{display:none}
@media(max-width:900px){
  .wib-assump-toggle{min-height:44px}
  /* the span is on the x axis already; the caption keeps to one line */
  #wib-figspan{display:none}
  .wib-tip{font-size:11px}
  .wi-card[data-wib-card="crossing"] .wi-card-value{font-size:17px}
  /* Same live strip as Ahead: on a phone the controls sit at the foot of the
     page, so the answer rides at the top of the scene, under the thumb. */
  .wi-live{display:block;position:sticky;top:0;z-index:5;margin:0 -16px;padding:9px 16px 10px;background:var(--foam);border-bottom:1px solid var(--cb)}
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
        `<button class="wi-preset wib-wide" type="button" data-wib-example="${esc(ex.id)}">${esc(pick(ex))}</button>`
    ).join('');

    const yearBtns = startYears.map(y =>
        `<button class="wi-preset" type="button" data-wib-year="${y}">${y}</button>`).join('');

    const es = isES();
    // Four boxes, as in Ahead: the ready-made questions, what is rewritten,
    // and the two rules of the rewrite. Loose labels down a column read as a
    // form; a ruled caption band over each group reads as something to touch.
    return `
<div class="wi-behind-controls">

  <div class="wi-dial" data-wib-group="examples">
    <div class="wi-dial-head">
      <span class="wi-dial-name" data-wib-tx="examplesHead">Three questions</span>
      <span class="wi-dial-unit" data-wib-tx="examplesUnit">one click sets every control below</span>
    </div>
    <div class="wi-dial-body">
      <div class="wi-presets wib-stack">${exampleBtns}</div>
    </div>
  </div>

  <div class="wi-dial">
    <div class="wi-dial-head">
      <span class="wi-dial-name" data-wib-tx="rewriteHead">The rewrite</span>
      <span class="wi-dial-unit" data-wib-tx="rewriteUnit">who is rewritten, after whom, from when</span>
    </div>
    <div class="wi-dial-body">
      <div class="wi-field wib-field">
        <span class="wi-field-label" data-i18n="whatifBehindRegion">Region</span>
        <select class="wi-select" id="wib-region">${opt(targets)}</select>
      </div>
      <div class="wi-field wib-field">
        <span class="wi-field-label" data-i18n="whatifBehindReference">Reference</span>
        <select class="wi-select" id="wib-ref">${opt(refs)}</select>
      </div>
      <span class="wi-field-label wib-sublabel" data-i18n="whatifBehindFrom">From</span>
      <div class="wib-years">${yearBtns}</div>
      <div class="wi-slider">
        <input type="range" id="wib-from" min="${Y0}" max="2000" step="1" value="${Y0}"
               aria-label="Start year">
        <output class="wi-slider-value" id="wib-from-out">${Y0}</output>
      </div>
    </div>
  </div>

  <div class="wi-dial">
    <div class="wi-dial-head">
      <span class="wi-dial-name" data-i18n="whatifBehindMode">Counterfactual</span>
      <span class="wi-dial-unit" data-wib-tx="modeUnit">same growth rate, or same income level</span>
    </div>
    <div class="wi-dial-body">
      <div class="wi-presets">
        <button class="wi-preset" type="button" data-wib-mode="rate" data-i18n="whatifBehindModeRate">same growth rate</button>
        <button class="wi-preset" type="button" data-wib-mode="level" data-i18n="whatifBehindModeLevel">same income level</button>
      </div>
      <p class="wi-scale-note" data-wib-tx="modeNote"></p>
    </div>
  </div>

  <div class="wi-dial">
    <div class="wi-dial-head">
      <span class="wi-dial-name" data-i18n="whatifBehindIntensity">Carbon intensity</span>
      <span class="wi-dial-unit" data-wib-tx="intUnit">the CO&#8322; per dollar the rewrite is charged</span>
    </div>
    <div class="wi-dial-body">
      <div class="wi-presets">
        <button class="wi-preset" type="button" data-wib-int="own" data-i18n="whatifBehindIntOwn">its own</button>
        <button class="wi-preset" type="button" data-wib-int="ref" data-i18n="whatifBehindIntRef">the reference&rsquo;s</button>
        <button class="wi-preset" type="button" data-wib-int="world" data-i18n="whatifBehindIntWorld">world average</button>
      </div>
      <details class="wi-aside">
        <summary>${esc(pk('What does not change', 'Lo que no cambia', '什么保持不变'))}</summary>
        <p data-wib-tx="intNote"></p>
      </details>
    </div>
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
    D.examplesUnit = d.querySelector('[data-wib-tx="examplesUnit"]');
    D.rewriteHead = d.querySelector('[data-wib-tx="rewriteHead"]');
    D.rewriteUnit = d.querySelector('[data-wib-tx="rewriteUnit"]');
    D.modeUnit = d.querySelector('[data-wib-tx="modeUnit"]');
    D.intUnit = d.querySelector('[data-wib-tx="intUnit"]');

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
            o.textContent = regionName(o.getAttribute('data-code'), s);
        });
    });
    if (D.region && D.region.value !== region) D.region.value = region;
    if (D.ref && D.ref.value !== ref) D.ref.value = ref;

    if (D.from && String(from) !== D.from.value) D.from.value = String(from);
    if (D.fromOut) D.fromOut.textContent = String(from);
    if (D.from) D.from.setAttribute('aria-label', pk('Start year', 'Año de inicio', '起始年'));
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

    // the ruled caption bands of the four control boxes
    if (D.examplesHead) D.examplesHead.textContent = pk('Three questions', 'Tres preguntas', '三个问题');
    if (D.examplesUnit) {
        D.examplesUnit.textContent = pk('one click sets every control below',
            'un clic fija todos los controles de abajo',
            '一次点击即可设定下方所有控件');
    }
    if (D.rewriteHead) D.rewriteHead.textContent = pk('The rewrite', 'La reescritura', '这次改写');
    if (D.rewriteUnit) {
        D.rewriteUnit.textContent = pk('who is rewritten, after whom, from when',
            'a quién se reescribe, según quién y desde cuándo',
            '改写谁、以谁为参照、从哪一年起');
    }
    if (D.modeUnit) {
        D.modeUnit.textContent = pk('the same growth rate, or the same income level',
            'el mismo ritmo, o el mismo nivel de renta',
            '相同的增长率，或相同的收入水平');
    }
    if (D.intUnit) {
        D.intUnit.textContent = pk('the CO₂ per dollar the rewrite is charged',
            'el CO₂ por dólar que se le cobra a la reescritura',
            '这次改写所计的每美元 CO₂');
    }

    const rp = regionProse(region, ctx.model.series(region));
    const rf = refProse(ref);
    if (D.modeNote) {
        D.modeNote.textContent = mode === 'level'
            ? pk(`Same level: ${rp} has the income per person of ${rf.gen} from ${from} on.`,
                `Mismo nivel: ${rp} tiene la renta por persona ${rf.gen} desde ${from}.`,
                `相同水平：自 ${from} 年起，${rp}的人均收入与${rf.gen}相同。`)
            : pk(`Same rate: ${rp} keeps its ${from} income and grows like ${rf.nom} from then on.`,
                `Mismo ritmo: ${rp} conserva su renta de ${from} y crece como ${rf.nom} desde entonces.`,
                `相同速率：${rp}保持 ${from} 年的收入，此后以${rf.nom}的速度增长。`);
    }
    if (D.intNote) {
        D.intNote.textContent = pk('Population follows its observed path: only income and carbon intensity change.',
            'La población sigue su senda observada: solo cambian la renta y la intensidad de carbono.',
            '人口沿其观测到的路径演进：只有收入与碳强度发生变化。');
    }
}

// ---------------------------------------------------------------------------
// SCENE — skeleton once, contents on every update
// ---------------------------------------------------------------------------
/**
 * The scene, recomposed on 11-IX to the same plan as Ahead: the live strip
 * first (so the phone reads the answer while the controls are at the foot),
 * then the taller figure with the vertical thermometer beside it, then the
 * four numerals together with the prose to their right. The legend went into
 * the drawing itself (drawNotes): the two lines and the gap between them now
 * carry their own names and their own totals.
 */
function sceneHTML(ctx) {
    const es = isES();
    // 11-IX (r2). Juan asked for the Behind numerals to be as visual as the
    // Ahead ones: not one of the four carried a drawing. Each card now ends in
    // the same two-rail figure — the world as it was on top, the world of the
    // counterfactual below, both to the same scale — so the gap the sentence
    // describes can be seen without reading it.
    const pairFig = (hook) => `
    <span class="wi-fig">
      <span class="wi-fig-track"><span class="wi-fig-ghost" data-wib-fig="${hook}-a"></span></span>
      <span class="wi-fig-track"><span class="wi-fig-mass" data-wib-fig="${hook}-b"></span></span>
      <span class="wi-fig-key"><span><i></i>${pk('observed', 'observado', '观测')}</span><span><i class="is-mass"></i>${pk('counterfactual', 'contrafactual', '反事实')}</span></span>
    </span>`;
    const spanFig = (hook, a, b) => `
    <span class="wi-fig">
      <span class="wi-fig-track"><span class="wi-fig-mass" data-wib-fig="${hook}-a"></span></span>
      <span class="wi-fig-track"><span class="wi-fig-mass" data-wib-fig="${hook}-b"></span></span>
      <span class="wi-fig-key"><span>${a}</span><span>${b}</span></span>
    </span>`;
    const card = (key, fb, hook, fig) => `
  <div class="wi-card" data-wib-card="${hook}">
    <span class="wi-card-label" data-i18n="${key}">${esc(fb)}</span>
    <span class="wi-card-value" data-wi="${hook}">—</span>
    <span class="wi-card-sub" data-wi="${hook}-sub"></span>${fig || ''}
  </div>`;

    return `<style>${OWN_CSS}</style>
<div class="wi-live" data-wib-live>
  <span class="wi-live-label" data-i18n="whatifCardDeltaT">${esc(ctx.t('whatifCardDeltaT'))}</span>
  <span class="wi-live-read" data-wib-live-read>—</span>
  <div class="wi-therm-rail wi-live-rail">
    <span class="wi-therm-tick" data-wib-live-today></span>
    <span class="wi-therm-needle" data-wib-live-needle></span>
  </div>
  <span class="wi-live-foot" data-wib-live-foot></span>
</div>
<div class="wi-stage">
  <div class="wi-stage-fig">
    <div class="wi-fig-cap">
      <span id="wib-figcap">${pk('Fossil CO₂ · observed and counterfactual', 'CO₂ fósil · observado y contrafactual', '化石 CO₂ · 观测值与反事实值')}</span>
      <span id="wib-figspan">1850–2024</span>
    </div>
    <div class="wi-chart" id="wib-chart">
      <svg class="wi-chart-svg" id="wib-svg" role="img" aria-label="Observed and counterfactual emissions, 1850–2024"></svg>
      <div class="wib-tip" id="wib-tip" hidden></div>
    </div>
    <div class="wi-mini">
      <span class="wi-mini-label" data-i18n="whatifBehindMini">GDP per person</span>
      <svg class="wi-mini-svg" id="wib-mini" aria-hidden="true"></svg>
    </div>
  </div>
  <div class="wi-therm">
    <div class="wi-therm-cap">
      <span data-i18n="whatifThermTitle">Thermometer</span>
      <b class="wib-therm-read" id="wib-therm-read"></b>
    </div>
    <div class="wi-therm-box" id="wib-therm-box"></div>
    <p class="wi-therm-foot" id="wib-therm-foot"></p>
  </div>
</div>
<div class="wi-results">
  <div class="wi-cards">
${card('whatifCardDeltaGt', 'Δ cumulative 1850–2024', 'delta-gt', pairFig('delta-gt'))}
${card('whatifCardDeltaT', 'Δ warming today', 'delta-t', pairFig('delta-t'))}
${card('whatifCardCrossing', 'Budget crossed', 'crossing', spanFig('crossing', '1850', '2024'))}
${card('whatifCardGdp', 'GDP per person in 2024', 'gdp', pairFig('gdp'))}
  </div>
  <div class="wi-readout">
    <span class="wi-readout-head">${pk('What it says', 'Lo que dice', '结果怎么说')}</span>
    <p class="wi-sentence" data-wi="sentence"></p>
    <p class="wi-sentence" data-wi="sentence-income"></p>
    <p class="wib-note" id="wib-budget-note"></p>
    <div class="wib-assump" id="wib-assump">
      <button class="wib-assump-toggle" type="button" id="wib-assump-toggle" aria-expanded="false">
        <span id="wib-assump-label">Stated assumptions</span><span class="wi-caret" aria-hidden="true">&#9660;</span>
      </button>
      <ul class="wib-assump-body" id="wib-assump-body"></ul>
    </div>
  </div>
</div>`;
}

function wireScene(ctx) {
    const r = ctx.root;
    D.chart = r.querySelector('#wib-chart');
    D.svg = r.querySelector('#wib-svg');
    D.tip = r.querySelector('#wib-tip');
    D.mini = r.querySelector('#wib-mini');
    D.thermRead = r.querySelector('#wib-therm-read');
    D.thermBox = r.querySelector('#wib-therm-box');
    D.thermFoot = r.querySelector('#wib-therm-foot');
    D.figCap = r.querySelector('#wib-figcap');
    D.budgetNote = r.querySelector('#wib-budget-note');
    D.liveRail = r.querySelector('[data-wib-live] .wi-live-rail');
    D.liveRead = r.querySelector('[data-wib-live-read]');
    D.liveToday = r.querySelector('[data-wib-live-today]');
    D.liveNeedle = r.querySelector('[data-wib-live-needle]');
    D.liveFoot = r.querySelector('[data-wib-live-foot]');
    D.sentence = r.querySelector('[data-wi="sentence"]');
    D.income = r.querySelector('[data-wi="sentence-income"]');
    D.assump = r.querySelector('#wib-assump');
    D.assumpToggle = r.querySelector('#wib-assump-toggle');
    D.assumpLabel = r.querySelector('#wib-assump-label');
    D.assumpBody = r.querySelector('#wib-assump-body');
    D.fig = {};
    r.querySelectorAll('[data-wib-fig]').forEach(n => { D.fig[n.dataset.wibFig] = n; });
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

    // --- in-canvas labels --------------------------------------------------
    // "I do not really know what the line on its own represents." The legend
    // used to be a row of chrome above the figure; each line carries its own
    // name and its own total now, and the tint between them is named too.
    const fs = narrow ? 8.5 : 9.5;
    const halo = `stroke="${P.foam}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke"`;
    const note = (x, y, txt, fill, op) => {
        const half = txt.length * fs * 0.66 * 0.5;
        const lo = padL + half + 2, hi = w - padR - half - 2;
        const cx = hi < lo ? (padL + w - padR) / 2 : clamp(x, lo, hi);
        return `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" fill="${fill}" fill-opacity="${op == null ? 1 : op}" font-family="${esc(P.ff)}" font-size="${fs}" letter-spacing="0.12em" ${halo}>${esc(txt)}</text>`;
    };
    // The three labels are stacked where the two lines are furthest apart:
    // that is the one place on the drawing where all three fit without any of
    // them landing on a stroke, and it is also where the eye already is.
    let kLab = 0, gapMax = -1;
    for (let k = 0; k < n; k++) {
        const g = Math.abs(YB[k] - YA[k]);
        if (g > gapMax) { gapMax = g; kLab = k; }
    }
    const cfAbove = B[kLab] >= A[kLab];
    // On a 245 px plot the totals do not fit beside the names; they are on the
    // cards and inside the sentence anyway, so the narrow label keeps the name
    // and the difference keeps its number.
    const tCf = pk('COUNTERFACTUAL', 'CONTRAFACTUAL', '反事实值')
        + (narrow ? '' : ' · ' + ctx.fmt.gt(_res.cum_region_cf_gt) + ' Gt');
    const tAct = pk('OBSERVED', 'OBSERVADO', '观测值')
        + (narrow ? '' : ' · ' + ctx.fmt.gt(_res.cum_region_actual_gt) + ' Gt');
    let notes =
        note(X[kLab], YB[kLab] + (cfAbove ? -8 : 14), tCf, P.vermDeep) +
        note(X[kLab], YA[kLab] + (cfAbove ? 14 : -8), tAct, P.cd);
    // the gap itself: the number the whole view exists to produce
    if (gapMax >= 46 && Math.abs(_res.delta_gt) >= 0.05) {
        const sgn = _res.delta_gt > 0 ? '+' : ctx.fmt.minus;
        notes += note(X[kLab], (YA[kLab] + YB[kLab]) / 2 + 3.5,
            pk('DIFFERENCE ', 'DIFERENCIA ', '差额 ') + sgn + ctx.fmt.gt(Math.abs(_res.delta_gt)) + ' Gt',
            P.cg);
    }

    // Tracked capitals, like the unit of the Ahead figure: it is the house
    // convention for a rubric, and having one mode in mixed case and the other
    // in small caps made the switch read as a change of section.
    const unit = pk('GT CO₂/YR', 'GT CO₂/AÑO', 'GT CO₂/年');
    const unitSaid = pk('Gt CO₂/yr', 'Gt CO₂/año', 'Gt CO₂/年');     // for the screen reader
    const label = pk(
        `Observed and counterfactual emissions, 1850–2024, in ${unitSaid}`,
        `Emisiones observadas y contrafactuales, 1850–2024, en ${unitSaid}`,
        `1850–2024 年观测与反事实排放，单位 ${unitSaid}`);

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-label', label);
    svg.innerHTML = `<title>${esc(label)}</title>
<rect x="0" y="0" width="${w}" height="${h}" fill="${P.foam}"></rect>
${grid}${areas}${t0mark}
<path d="${line(YB)}" fill="none" stroke="${P.vermDeep}" stroke-width="1.5" stroke-dasharray="5 4" stroke-linejoin="round"></path>
<path d="${line(YA)}" fill="none" stroke="${P.cd}" stroke-width="1.6" stroke-linejoin="round"></path>
<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${(padT + plotH).toFixed(1)}" stroke="${P.cb}" stroke-width="1"></line>
${notes}
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
        `${esc(pk('Observed', 'Observado', '观测值'))}: ${gtYear(ctx, a)} Gt<br>` +
        `${esc(pk('Counterfactual', 'Contrafactual', '反事实值'))}: ${gtYear(ctx, b)} Gt<br>` +
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
    const box = D.thermBox;
    if (!box || !_res) return;
    const f = ctx.fmt, es = isES();
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
    const dec = step < 0.1 ? 2 : 1;

    // the scale, plus the two thresholds of the section when they fall inside
    const ticks = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push({ v: Math.round(v * 1000) / 1000, label: f.n(v, dec) });
    [1.5, 2.0].forEach(v => {
        if (v >= lo && v <= hi && !ticks.some(t => Math.abs(t.v - v) < 1e-6)) {
            ticks.push({ v, label: f.n(v, 1), dash: true });
        }
    });

    // Just the answer in the caption: the rail beside it already carries
    // "today 1.36" and "would be 2.96" on their own needles, and the pair of
    // them together overran the 176 px column.
    D.thermRead.innerHTML = `<strong>${f.deg(cfT)} °C</strong>`;

    const r = box.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w >= 40 && h >= 80) {
        box.innerHTML = ctx.thermSVG({
            w, h, lo, hi,
            ticks,
            band: [rng[0], rng[1]],
            marks: [
                {
                    v: today, kind: 'now',
                    label: pk('today ', 'hoy ', '当前 ') + f.deg(today),
                    short: pk('now ', 'hoy ', '当前 ') + f.deg(today)
                },
                {
                    v: cfT, kind: 'main',
                    label: pk('would be ', 'sería ', '将为 ') + f.deg(cfT),
                    short: '→ ' + f.deg(cfT)
                }
            ]
        });
    }

    const away = [1.5, 2.0].filter(v => v > hi);
    D.thermFoot.textContent = (pk(
        `The rail is fitted to the story (${f.n(lo, dec)}–${f.n(hi, dec)} °C). The band is the likely range.`,
        `El riel se ajusta a la historia (${f.n(lo, dec)}–${f.n(hi, dec)} °C). La banda es el rango probable.`,
        `标尺按这段故事的跨度设定（${f.n(lo, dec)}–${f.n(hi, dec)} °C）。色带为可能范围。`)
        + (away.length
            ? pk(` ${f.n(away[0], 1)} °C sits above it.`, ` ${f.n(away[0], 1)} °C queda por encima.`, ` ${f.n(away[0], 1)} °C 在其上方。`)
            : '')).replace(/ (°C|Gt)/g, ' $1');
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

/**
 * The four micro-figures at the foot of the Behind cards (11-IX, r2). Each is
 * the card's own pair of numbers drawn to one scale — observed above,
 * counterfactual below — so the gap is seen, not only read. No new quantity is
 * introduced here: everything drawn is already printed on the card.
 */
function drawCardFigures(r) {
    const F = D.fig;
    if (!F) return;
    const set = (k, css) => { const n = F[k]; if (n) Object.assign(n.style, css); };
    const pair = (hook, a, b) => {
        const top = Math.max(Math.abs(a), Math.abs(b), 1e-9) * 1.04;
        set(hook + '-a', { left: '0', width: clamp((Math.abs(a) / top) * 100, 0, 100) + '%' });
        set(hook + '-b', { left: '0', width: clamp((Math.abs(b) / top) * 100, 0, 100) + '%' });
    };
    pair('delta-gt', r.cum_region_actual_gt, r.cum_region_cf_gt);
    pair('delta-t', r.t_2024_actual_c, r.t_2024_cf_c);
    pair('gdp', r.gdp_pc_2024_actual, r.gdp_pc_2024_cf);

    // BUDGET CROSSED: how far into 1850–2024 each budget would have lasted in
    // this world. A budget never crossed leaves its rail empty.
    const pc = (y) => (y == null ? 0 : clamp(((y - 1850) / 174) * 100, 0, 100));
    set('crossing-a', { left: '0', width: pc(r.crossing_year_1p5_cf) + '%' });
    set('crossing-b', { left: '0', width: pc(r.crossing_year_2p0_cf) + '%' });
}

function drawText(ctx) {
    if (!_res) return;
    const f = ctx.fmt, es = isES(), r = _res;
    const region = r.inputs.region, ref = r.inputs.reference;
    const s = ctx.model.series(region);
    const rp = regionProse(region, s);
    const t0 = r.inputs.start_year;

    // --- cards ------------------------------------------------------------
    const dGt = r.delta_gt, dYr = r.delta_years_of_2024_world_emissions;
    const sign = (x) => (x > 0 ? '+' : x < 0 ? f.minus : '');
    setCard('delta-gt',
        `${sign(dGt)}${f.gt(Math.abs(dGt))} Gt`,
        `${sign(dYr)}${f.n(Math.abs(dYr), 1)} ${esc(pk('years of 2024 world emissions', 'años de emisiones mundiales de 2024', '年的 2024 年世界排放量'))}`,
        dGt);
    setCard('delta-t',
        `${sign(r.delta_t_c)}${f.deg(Math.abs(r.delta_t_c))} °C`,
        `${sign(r.delta_t_range[0])}${f.deg(Math.abs(r.delta_t_range[0]))} ${esc(pk('to', 'a', '至'))} ${sign(r.delta_t_range[1])}${f.deg(Math.abs(r.delta_t_range[1]))} °C`,
        r.delta_t_c);

    // The two hooks stay addressable even when neither budget was crossed.
    const y15 = r.crossing_year_1p5_cf, y20 = r.crossing_year_2p0_cf;
    const crossVal =
        `<span data-wi="cross-15" data-value="${y15 == null ? '' : y15}">${f.year(y15)}</span>` +
        ` / <span data-wi="cross-20" data-value="${y20 == null ? '' : y20}">${f.year(y20)}</span>`;
    const crossSub = (y15 == null && y20 == null)
        ? esc(pk('both budgets would still be intact', 'los dos presupuestos seguirían intactos', '两份预算都仍完好'))
        : `${f.n(1.5, 1)} °C / ${f.n(2, 0)} °C`;
    setCard('crossing', crossVal, crossSub, null);

    const money = (x) => (es ? `${f.n(x, 0)} $` : `$${f.n(x, 0)}`);   // zh follows the English form
    setCard('gdp',
        `<span data-wi="gdp-cf" data-value="${r.gdp_pc_2024_cf}">${money(r.gdp_pc_2024_cf)}</span>`,
        `${esc(pk('instead of', 'en vez de', '而非'))} <span data-wi="gdp-actual" data-value="${r.gdp_pc_2024_actual}">${money(r.gdp_pc_2024_actual)}</span>`,
        null);

    drawCardFigures(r);

    // --- budget note (spec §4.3) ------------------------------------------
    // One paragraph, not two: the thermometer caveat of §6 rides with it.
    D.budgetNote.textContent = ctx.t('whatifThermNote') + ' ' + pk(
        `Carbon budget as used in this viewer (fossil CO₂, consistent with the “Safe space” paper): ${f.gt(r.implied_total_1p5_gt)} Gt since 1850 for 1.5 °C and ${f.gt(r.implied_total_2p0_gt)} Gt for 2 °C, both at 50 %. The real world stood at ${f.gt(r.cum_world_actual_1850_2024_gt)} Gt at the end of 2024; in this world, ${f.gt(r.cum_world_cf_1850_2024_gt)} Gt.`,
        `Presupuesto tal como lo usa este visor (CO₂ fósil, coherente con el paper «Safe space»): ${f.gt(r.implied_total_1p5_gt)} Gt desde 1850 para 1,5 °C y ${f.gt(r.implied_total_2p0_gt)} Gt para 2 °C, ambos al 50 %. El mundo real llevaba ${f.gt(r.cum_world_actual_1850_2024_gt)} Gt a finales de 2024; en este mundo, ${f.gt(r.cum_world_cf_1850_2024_gt)} Gt.`,
        `本视图所用的碳预算（化石 CO₂，与《Safe space》一文一致）：自 1850 年起，1.5 °C 为 ${f.gt(r.implied_total_1p5_gt)} Gt，2 °C 为 ${f.gt(r.implied_total_2p0_gt)} Gt，二者均按 50 % 概率。截至 2024 年底，真实世界已累计 ${f.gt(r.cum_world_actual_1850_2024_gt)} Gt；在这个世界里则是 ${f.gt(r.cum_world_cf_1850_2024_gt)} Gt。`);

    // --- the generated sentence (spec §8.3) -------------------------------
    const mt = modeProse(r.inputs.mode, ref);
    const it = intensityProse(r.inputs.intensity, ref);
    const absGt = f.n(Math.abs(dGt), 0);
    // one decimal while the figure is small enough to need it (the spec's B2
    // example reads «96 years», not «96.0»)
    const absYr = f.n(Math.abs(dYr), Math.abs(dYr) < 20 ? 1 : 0);
    let deltaText;
    if (Math.abs(dGt) < 0.05) {
        deltaText = pk('no change', 'sin cambio', '没有变化');
    } else if (es) {
        deltaText = `${absGt} Gt ${dGt > 0 ? 'más' : 'menos'}, ${absYr} años de emisiones actuales`;
    } else if (isZH()) {
        deltaText = `${dGt > 0 ? '多' : '少'} ${absGt} Gt，相当于当前 ${absYr} 年的排放量`;
    } else {
        deltaText = `${absGt} Gt ${dGt > 0 ? 'more' : 'less'}, ${absYr} years of today's emissions`;
    }
    const dRange = `${sign(r.delta_t_range[0])}${f.deg(Math.abs(r.delta_t_range[0]))} ${pk('to', 'a', '至')} ${sign(r.delta_t_range[1])}${f.deg(Math.abs(r.delta_t_range[1]))}`;

    let budgetText;
    if (y15 == null && y20 == null) {
        budgetText = pk('Both budgets would still be intact.', 'Los dos presupuestos seguirían intactos.', '两份预算都仍完好。');
    } else if (y20 == null) {
        budgetText = pk(
            `The 1.5 °C budget would have been exhausted in ${y15} and the 2 °C budget would still be intact.`,
            `El presupuesto de 1,5 °C se habría agotado en ${y15} y el de 2 °C seguiría intacto.`,
            `1.5 °C 的预算会在 ${y15} 年耗尽，而 2 °C 的预算仍完好。`);
    } else {
        budgetText = pk(
            `The 1.5 °C budget would have been exhausted in ${y15} and the 2 °C budget in ${y20}.`,
            `El presupuesto de 1,5 °C se habría agotado en ${y15} y el de 2 °C en ${y20}.`,
            `1.5 °C 的预算会在 ${y15} 年耗尽，2 °C 的预算在 ${y20} 年耗尽。`);
    }

    D.sentence.innerHTML = pk(
        `If ${esc(rp)} had ${esc(mt)} from ${t0} with ${esc(it)}, it would have emitted <strong>${f.gt(r.cum_region_cf_gt)} Gt</strong> of fossil CO₂ in 1850–2024 instead of ${f.gt(r.cum_region_actual_gt)} Gt — ${esc(deltaText)} — and human-induced warming today would be about <strong>${f.deg(r.t_2024_cf_c)} °C</strong> instead of ${f.deg(r.t_2024_actual_c)} °C (${dRange}). ${esc(budgetText)}`,
        `Si ${esc(rp)} hubiera ${esc(mt)} desde ${t0} con ${esc(it)}, habría emitido <strong>${f.gt(r.cum_region_cf_gt)} Gt</strong> de CO₂ fósil en 1850–2024 en vez de ${f.gt(r.cum_region_actual_gt)} Gt —${esc(deltaText)}— y el calentamiento antropogénico actual sería de unos <strong>${f.deg(r.t_2024_cf_c)} °C</strong> en vez de ${f.deg(r.t_2024_actual_c)} °C (${dRange}). ${esc(budgetText)}`,
        `如果${esc(rp)}自 ${t0} 年起${esc(mt)}，并采用${esc(it)}，那么在 1850–2024 年间它会排放 <strong>${f.gt(r.cum_region_cf_gt)} Gt</strong> 化石 CO₂，而不是 ${f.gt(r.cum_region_actual_gt)} Gt（${esc(deltaText)}），今天的人为增温将约为 <strong>${f.deg(r.t_2024_cf_c)} °C</strong>，而不是 ${f.deg(r.t_2024_actual_c)} °C（${dRange}）。${esc(budgetText)}`);

    const rg = regionGen(region, s);
    D.income.textContent = pk(
        `GDP per person ${rg} in 2024 would be ${money(r.gdp_pc_2024_cf)} instead of ${money(r.gdp_pc_2024_actual)} (international $ PPP, Maddison), and 2024 emissions ${f.gt(r.e_2024_cf_mt / 1000)} Gt instead of ${f.gt(r.series_actual_mt[Y1 - IDX0] / 1000)} Gt.`,
        `El PIB por persona ${rg} en 2024 sería de ${money(r.gdp_pc_2024_cf)} en vez de ${money(r.gdp_pc_2024_actual)} (dólares internacionales PPA, Maddison); las emisiones de 2024, ${f.gt(r.e_2024_cf_mt / 1000)} Gt en vez de ${f.gt(r.series_actual_mt[Y1 - IDX0] / 1000)} Gt.`,
        `2024 年${rg}的人均 GDP 将是 ${money(r.gdp_pc_2024_cf)}，而不是 ${money(r.gdp_pc_2024_actual)}（国际元，购买力平价，Maddison）；2024 年的排放为 ${f.gt(r.e_2024_cf_mt / 1000)} Gt，而不是 ${f.gt(r.series_actual_mt[Y1 - IDX0] / 1000)} Gt。`);

    // --- stated assumptions (spec §3.6) -----------------------------------
    D.assumpLabel.textContent = pk('Stated assumptions', 'Supuestos declarados', '已声明的假设');
    const items = isZH() ? [
        '人口沿其观测到的路径演进：收入不会反过来影响人口。',
        '一个区域的碳强度与其收入水平无关（在真实历史中它呈倒 U 形——因此提供了三种碳强度选项）。',
        '不含一般均衡效应：没有价格、贸易，也没有被诱发的技术变迁。',
        '英国既属于世界，也属于西欧：在「世界像英国一样」的情形中，整条世界路径都被替换，包括英国自身。',
        'TCRE 也以线性方式应用于负的差额（即比真实情况升温更少的情形）。',
        '世界其余部分保持不变：只有所选区域被改写，世界承接这一差额。'
    ] : es ? [
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
    D.liveFoot.textContent = pk(
        `Today ${f.deg(r.t_2024_actual_c)} °C → ${f.deg(r.t_2024_cf_c)} °C`,
        `Hoy ${f.deg(r.t_2024_actual_c)} °C → ${f.deg(r.t_2024_cf_c)} °C`,
        `当前 ${f.deg(r.t_2024_actual_c)} °C → ${f.deg(r.t_2024_cf_c)} °C`);
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

    if (reason === 'language') {
        // 11-IX (r2): three strings — the figure caption, the readout head and the
        // "what does not change" summary — are baked into the skeleton by pk() and
        // carry no data-i18n, so applyI18n() cannot reach them. Ahead already
        // rebuilds on a language change (ahead-view.js); Behind now does the same,
        // which also re-picks every option text and every generated label. The
        // model result is untouched: compute() is keyed on the dials, not the
        // language, so the rebuild repaints the very same numbers.
        dropListeners();
        if (_offResize) { _offResize(); _offResize = null; }
        Object.keys(D).forEach(k => { delete D[k]; });
        ctx.dials.innerHTML = dialsHTML(ctx);
        ctx.applyI18n(ctx.dials);
        wireDials(ctx);
        ctx.root.innerHTML = sceneHTML(ctx);
        ctx.applyI18n(ctx.root);
        wireScene(ctx);
        _offResize = ctx.onResize(() => { /* the pump already calls update({reason:'resize'}) */ });
    }

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
