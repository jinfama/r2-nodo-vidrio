// ============================================================================
// WHAT IF? — AHEAD VIEW (2025–2050)
//
// Three dials (growth, technology, population), one main figure, one horizontal
// thermometer, four cards, the generated sentence of spec §8.1 and the
// "Solve for…" panel of spec §8.2.
//
// This file is autonomous, as the shell contract demands: it imports nothing
// (d3 v7 is a page global), it never touches the DOM outside ctx.root and
// ctx.dials, it never subscribes to the whatif* State keys (the shell pumps
// every change back as update({reason:'state', key})) and it never imports
// app.js or behind-view.js.
//
// Contract (see whatif-section.js → makeContext):
//   initAheadView(ctx)      builds the DOM inside ctx.root and ctx.dials
//   updateAheadView(info)   redraws; info = {reason, key?} and may be omitted
//   destroyAheadView()      removes listeners and empties both containers
//
// Spec: 06_dev/docs/visores_2026-09/GROWTH_AND_EARTH_WHATIF_SPEC.md v0.3
//       §3.3 (projection), §3.4–3.5 (inverse, two horizons), §5 (dials and
//       presets), §6 (what is drawn), §8.1–8.2 (generated prose), §9 (layout).
// ============================================================================

// ---- constants -------------------------------------------------------------
// Solver brackets, mirrored from SOLVER in whatif-model.js (kept local so this
// file has no imports of its own). They are also the ranges app.js validates.
const R_LO = -0.60, R_HI = 0.20;          // carbon intensity, fraction/yr
const G_LO = -0.30, G_HI = 0.20;          // GDP per person, fraction/yr
const BASE_YEAR = 2024, PROJ_MID = 2050, PROJ_END = 2100;
const HIST_FROM = 1990;                    // left edge of the main figure (§6)
const THERM_LO = 1.0, THERM_HI = 3.5;      // thermometer range in °C (§6)

// ---- module state ----------------------------------------------------------
let ctx = null;
let dom = {};
let bound = [];                 // [node, type, handler] to unbind on destroy
let offResize = null;
let lastRes = null;             // last aheadResult(), for cheap resize redraws
let byYear = null;              // year → {gt, cum, rem} for the chart tooltip
let lastUnknown = 'intensity';  // remembered choice of the Solve panel

// The faint 2051–2100 tail (spec §6: optional). It lives in State, not in a
// module variable: as a module variable it was invisible to app.js, so the
// exported PNG kept saying "2025–2050" while its own x axis ended in 2100, and
// the choice survived neither the permalink nor a change of mode.
function tailOn() { return !!ctx.State.get('whatifTail'); }

// ============================================================================
// SMALL HELPERS
// ============================================================================

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function on(node, type, fn, opts) {
    if (!node) return;
    node.addEventListener(type, fn, opts);
    bound.push([node, type, fn, opts]);
}

function unbindAll() {
    bound.forEach(([node, type, fn, opts]) => {
        try { node.removeEventListener(type, fn, opts); } catch (e) { /* gone */ }
    });
    bound = [];
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round4 = (v) => Math.round(v * 1e4) / 1e4;
const isEs = () => ctx.lang() === 'es';

/** A signed integer of Gt, with the typographic minus and a leading plus. */
function signedGt(v, d = 0) {
    const f = ctx.fmt;
    if (v == null || !isFinite(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? f.minus : '') + f.n(Math.abs(v), d);
}

/** A rate (fraction/yr) as a magnitude in %, with a minus only when negative. */
function rateTxt(x, d = 1) {
    const f = ctx.fmt;
    return (x < 0 ? f.minus : '') + f.pct(x, d);
}

/** Population in the reader's idiom: "9.6 bn" / "9.620 M".
 *  Grouping is forced: es-ES leaves 9620 ungrouped next to 10.338, and the
 *  three chips of the dial then read as three different kinds of number. */
function popTxt(p) {
    const f = ctx.fmt;
    return isEs() ? f.nGroup(p / 1e6, 0) + ' M' : f.n(p / 1e9, 1) + ' bn';
}

/** Short target label for prose ('1.5 °C' / '2 °C' / '≈ 3 °C'). */
function targetTxt(target) {
    const es = isEs();
    if (target === '1.5C') return es ? '1,5 °C' : '1.5 °C';
    if (target === '3.0C') return '≈ 3 °C';
    return '2 °C';
}

/** The probability as printed ('50 %'). */
function probTxt(prob) { return String(prob).replace('%', ' %'); }

// ---- preset dictionaries ---------------------------------------------------
// The JSON carries the full label (label / label_es), the definition and the
// source; the tablets are 90 px wide, so the view keeps its own short names and
// pushes the full label + definition + source into the tooltip.
const SHORT = {
    growth: {
        imf: { en: 'IMF', es: 'FMI' },
        oecd: { en: 'OECD', es: 'OCDE' },
        recent: { en: 'Recent', es: 'Reciente' },
        stagnation: { en: 'Stagnation', es: 'Estancamiento' },
        degrowth: { en: 'Degrowth', es: 'Decrecimiento' }
    },
    technology: {
        bau: { en: 'BAU', es: 'Reciente' },
        best_global: { en: 'Best decade', es: 'Mejor década' },
        best_regional: { en: 'Best region', es: 'Mejor región' },
        double_best: { en: '×2 best', es: '×2 la mejor' },
        stagnation: { en: 'No change', es: 'Sin cambio' }
    }
};

/** How the growth clause of §8.2 names the technology dial. */
const TECH_PHRASE = {
    bau: { en: 'the recent trend in technology', es: 'la tendencia tecnológica reciente' },
    best_global: { en: 'the best global decade of technology', es: 'la mejor década tecnológica mundial' },
    best_regional: { en: 'the best regional decade of technology', es: 'la mejor década tecnológica regional' },
    double_best: { en: 'twice the best global decade', es: 'el doble de la mejor década mundial' },
    stagnation: { en: 'technology standing still', es: 'la tecnología estancada' }
};

// The JSON carries `definition` in Spanish only, so the English interface used
// to show "Projected — IMF / Crecimiento medio del PIB mundial…". Until
// build/build_whatif_data.py adds a `definition_en` field, the English
// rendering lives here; ES falls through to the JSON except for the two
// entries whose stored text says something the screen should not say (an
// English region name inside a Spanish label, and an internal note of the open
// decision D4). The numbers always come from the JSON — this map is prose.
const DEFS = {
    growth: {
        imf: { en: 'Average world GDP growth 2025–2030 from the IMF WEO of October 2025 (3.17 %/yr) minus world population growth 2024–2030 (UN WPP 2024 medium, 0.81 %/yr), extended to 2050.' },
        oecd: { en: 'World potential GDP per capita: from 2.0 %/yr in 2025 to 1.25 %/yr in 2050 (linear); the equivalent constant rate is shown (same 2050 level).' },
        recent: { en: 'CAGR of world GDP per capita 2010–2024 in the data of this viewer (Maddison).' },
        stagnation: { en: 'World GDP per capita held at its 2024 level.' },
        degrowth: {
            en: 'World GDP per capita −1 %/yr (≈ −23 % by 2050). An illustrative value; it comes from no projection.',
            es: 'PIB per cápita mundial −1 %/año (≈ −23 % en 2050). Valor ilustrativo: no procede de ninguna proyección.',
            source_en: 'definition', source_es: 'definición'
        }
    },
    technology: {
        bau: { en: 'CAGR 2010–2024 of world carbon intensity (fossil CO₂ / GDP PPP).' },
        best_global: { en: 'Largest average annual fall of world carbon intensity over rolling ten-year windows since 1960.' },
        best_regional: {
            en: 'Largest ten-year fall of carbon intensity in one of the 8 Minerva regions, among windows starting in 2010 or later, with GDP per person growing ≥ 1 %/yr and the region emitting ≥ 5 % of world fossil CO₂ at the start (a growth context, not a recession).',
            es: 'Mayor caída decenal de la intensidad en una de las 8 regiones Minerva, entre ventanas que empiezan en 2010 o después, con crecimiento del PIB pc ≥ 1 %/año y ≥ 5 % del CO₂ fósil mundial al inicio (contexto de crecimiento, no de recesión).',
            label_en: 'Best regional decade (Western Europe 2012–2022)',
            label_es: 'Mejor década regional (Europa Occidental 2012–2022)'
        },
        double_best: { en: '2 × the best world decade. Intensity in 2050 = (1+r)^26 of the 2024 one.' },
        stagnation: { en: 'Carbon intensity held at its 2024 level.' }
    },
    population: {                                  // these carry only a source
        medium: { source_en: 'UN WPP 2024, medium variant, rescaled to the 2024 base of this viewer' },
        low: { source_en: 'UN WPP 2024, low variant' },
        high: { source_en: 'UN WPP 2024, high variant' }
    }
};

function defOf(group, p) {
    const o = (DEFS[group] || {})[p.id] || {};
    if (isEs()) return o.es || p.definition || '';
    return o.en || p.definition || '';
}

function sourceOf(group, p) {
    const o = (DEFS[group] || {})[p.id] || {};
    const over = isEs() ? o.source_es : o.source_en;
    return over || p.source || '';
}

function presetFull(group, p) {
    const o = (DEFS[group] || {})[p.id] || {};
    if (isEs()) return o.label_es || p.label_es || p.label;
    return o.label_en || p.label;
}

function presetLabel(group, p) {
    const short = (SHORT[group] || {})[p.id];
    if (short) return short[isEs() ? 'es' : 'en'];
    return presetFull(group, p);
}

function presetTitle(p, group) {
    const g = group || 'growth';
    const bits = [presetFull(g, p)];
    const d = defOf(g, p);
    const s = sourceOf(g, p);
    if (d) bits.push(d);
    if (s) bits.push(s);
    return bits.join('\n');
}

/** The id of the preset whose rate is exactly the current value, or ''. */
function activePreset(group, value) {
    const list = ctx.model.presets(group) || [];
    for (const p of list) if (p.rate === value) return p.id;
    return '';
}

// ============================================================================
// SCALE SENTENCES (spec §5.2 — computed, never hand-written)
// ============================================================================

const FRACTION_WORD = [
    [2, { en: 'half of', es: 'la mitad del' }],
    [3, { en: 'a third of', es: 'la tercera parte del' }],
    [4, { en: 'a quarter of', es: 'la cuarta parte del' }],
    [5, { en: 'a fifth of', es: 'la quinta parte del' }],
    [10, { en: 'a tenth of', es: 'la décima parte del' }]
];

function fractionWord(ratio) {
    for (const [k, w] of FRACTION_WORD) {
        if (Math.abs(ratio - 1 / k) < 0.02) return w[isEs() ? 'es' : 'en'];
    }
    return null;
}

const YEARS = PROJ_MID - BASE_YEAR;      // 26 years of constant rates

function growthScaleNote(g) {
    const f = ctx.fmt, es = isEs();
    const ratio = Math.pow(1 + g, YEARS);
    const head = (g >= 0 ? '+' : f.minus) + f.pct(g, g === 0 ? 0 : 1) + ' %';
    if (g === 0) {
        return es
            ? '0 %/año: la renta por persona de 2050 sería la misma que la de hoy.'
            : '0 %/yr: income per person in 2050 would be the same as today.';
    }
    if (g > 0) {
        return es
            ? `${head}/año durante ${YEARS} años: la renta por persona se multiplica por ${f.ratio(ratio)} en 2050.`
            : `${head}/yr for ${YEARS} years: income per person ×${f.ratio(ratio)} by 2050.`;
    }
    return es
        ? `${head}/año durante ${YEARS} años: la renta por persona de 2050 sería el ${f.n(ratio * 100, 0)} % de la actual.`
        : `${head}/yr for ${YEARS} years: income per person in 2050 would be ${f.n(ratio * 100, 0)} % of today's.`;
}

function techScaleNote(r) {
    const f = ctx.fmt, es = isEs();
    const ratio = Math.pow(1 + r, YEARS);
    // One decimal, like the note of dial 1 above it and like the preset
    // tablets ("BAU −2.3"): spec §8 asks for one decimal in %.
    const head = (r >= 0 ? '+' : f.minus) + f.pct(r, r === 0 ? 0 : 1) + ' %';
    if (r === 0) {
        return es
            ? '0 %/año: el CO₂ por dólar de 2050 sería el mismo que el de hoy.'
            : '0 %/yr: the CO₂ per dollar of 2050 would be the same as today\'s.';
    }
    if (r > 0) {
        return es
            ? `${head}/año durante ${YEARS} años: el CO₂ por dólar de 2050 sería un ${f.n((ratio - 1) * 100, 0)} % mayor que el actual.`
            : `${head}/yr for ${YEARS} years: the CO₂ per dollar of 2050 would be ${f.n((ratio - 1) * 100, 0)} % higher than today's.`;
    }
    const word = fractionWord(ratio);
    if (word) {
        return es
            ? `${head}/año durante ${YEARS} años: el CO₂ por dólar de 2050 sería ${word} actual.`
            : `${head}/yr for ${YEARS} years: the CO₂ per dollar of 2050 is ${word} today's.`;
    }
    return es
        ? `${head}/año durante ${YEARS} años: el CO₂ por dólar de 2050 sería un ${f.n((1 - ratio) * 100, 0)} % menor que el actual.`
        : `${head}/yr for ${YEARS} years: CO₂ per dollar ${f.minus}${f.n((1 - ratio) * 100, 0)} % by 2050.`;
}

function popScaleNote(variant) {
    const list = ctx.model.presets('population') || [];
    const p = list.find(o => o.id === variant);
    if (!p) return '';
    const name = ctx.t('whatifPop' + variant.charAt(0).toUpperCase() + variant.slice(1), variant);
    return isEs()
        ? `${name}: ${popTxt(p.pop_2050)} de personas en 2050 y ${popTxt(p.pop_2100)} en 2100.`
        : `${name}: ${popTxt(p.pop_2050)} people in 2050, ${popTxt(p.pop_2100)} in 2100.`;
}

/**
 * The budgets note under the scene (spec §8.4). It used to be a fixed string
 * quoting the 50 % budgets, so choosing 67 % left "4.8× the 1.5 °C budget ·
 * 67 %" on the cards next to "…both at 50 %" in the note. It is read from
 * budgets.remaining_from_2025[target][probability] of the JSON, like the cards.
 */
function budgetNote(prob) {
    const f = ctx.fmt, es = isEs();
    const b = (ctx.data.budgets || {}).remaining_from_2025 || {};
    const g15 = ((b['1.5C'] || {})[prob] || {}).co2ff_gt;
    const g20 = ((b['2.0C'] || {})[prob] || {}).co2ff_gt;
    if (g15 == null || g20 == null) return ctx.t('whatifBudgetNote');
    const p = probTxt(prob);
    return es
        ? `Presupuestos desde el 1 de enero de 2025: ${f.nGroup(g15, 1)} Gt de CO₂ fósil para 1,5 °C y ${f.nGroup(g20, 1)} Gt para 2 °C, ambos al ${p}. Las estimaciones más recientes son mucho menores.`
        : `Budgets from 1 January 2025: ${f.nGroup(g15, 1)} Gt of fossil CO₂ for 1.5 °C and ${f.nGroup(g20, 1)} Gt for 2 °C, both at ${p}. Newer estimates are much smaller.`;
}

/** Spec §5.1: worldwide egalitarian degrowth is arithmetically stagnation. */
function egalitarianNote() {
    const f = ctx.fmt;
    const k = (ctx.data.diagnostics || {}).egalitarian_convergence_factor_2024;
    const factor = (k == null) ? '0,998' : f.n(k, 3);
    return isEs()
        ? `El decrecimiento igualitario mundial equivale al estancamiento: con las intensidades de 2024 la convergencia deja un factor ${factor} sobre las emisiones, así que no lleva preset aparte.`
        : `Worldwide egalitarian degrowth is arithmetically stagnation: with 2024 intensities the convergence factor is ${factor}, so it gets no separate preset.`;
}

// ============================================================================
// GENERATED PROSE (spec §8.1 and §8.2)
// ============================================================================

function exhaustedTxt(year) {
    const es = isEs();
    if (year == null) return es ? 'no se agota antes de 2100' : 'not exhausted before 2100';
    return es ? `agotado en ${year}` : `exhausted in ${year}`;
}

/** Spec §8.1, the direct sentence. Returns HTML (strong = vermilion). */
function mainSentence(res) {
    const f = ctx.fmt, es = isEs();
    const g = res.inputs.g, r = res.inputs.r;
    const gTxt = (g < 0 ? f.minus : '') + f.pct(g);
    const pop = es
        ? ({ low: 'baja', medium: 'media', high: 'alta' })[res.inputs.population]
        : res.inputs.population;
    const s15 = f.ratio(res.share_of_rcb_1p5);
    const s20 = f.ratio(res.share_of_rcb_2p0);
    const cum = f.gt(res.cum_2025_2050_gt);
    const evs = f.signedChange(res.e_2050_vs_2024) + ' %';
    const T = f.deg(res.t_2050_c);
    const lo = f.deg(res.t_2050_range[0]);
    const hi = f.deg(res.t_2050_range[1]);

    if (es) {
        const rc = r < 0 ? `un ${f.pct(r)} % anual menos de CO₂ por dólar`
            : r > 0 ? `un ${f.pct(r)} % anual más de CO₂ por dólar`
                : 'sin cambios en el CO₂ por dólar';
        return `Con un crecimiento del ${gTxt} % anual por persona, ${rc} y la senda de población ONU ${pop}, el mundo emite <strong>${cum} Gt</strong> en 2025–2050: ${s15} veces el presupuesto de 1,5 °C (${exhaustedTxt(res.exhaustion_year_1p5)}) y ${s20} veces el de 2 °C (${exhaustedTxt(res.exhaustion_year_2p0)}). En 2050 las emisiones son ${evs} respecto a 2024 y el calentamiento llega a <strong>${T} °C</strong> (${lo}–${hi}).`;
    }
    const rc = r < 0 ? `${f.pct(r)} %/yr less CO₂ per dollar`
        : r > 0 ? `${f.pct(r)} %/yr more CO₂ per dollar`
            : 'no change in CO₂ per dollar';
    return `At ${gTxt} %/yr growth per person, ${rc} and the UN ${pop} population path, the world emits <strong>${cum} Gt</strong> in 2025–2050 — ${s15}× the 1.5 °C budget (${exhaustedTxt(res.exhaustion_year_1p5)}) and ${s20}× the 2 °C budget (${exhaustedTxt(res.exhaustion_year_2p0)}). By 2050 emissions are ${evs} vs 2024 and warming reaches <strong>${T} °C</strong> (${lo}–${hi}).`;
}

/** Spec §8.1, the 2100 tail plus the q ≥ 1 warning. */
function tailSentence(res) {
    const f = ctx.fmt, es = isEs();
    const c100 = f.gt(res.cum_2025_2100_gt, 0);
    const t100 = f.deg(res.t_2100_c);
    let s = es
        ? `Si estas tasas continuaran, en 2100 se habrían emitido ${c100} Gt y el calentamiento sería de ${t100} °C.`
        : `If these rates continued, by 2100 the world would have emitted ${c100} Gt and warming would be ${t100} °C.`;
    if (res.never_falls) {
        s += es
            ? ' A estas tasas las emisiones por persona no bajan nunca.'
            : ' At these rates per-person emissions never fall.';
    }
    return s;
}

/** Text for a solver that came back null (spec §8.2, "out of range"). */
function outOfRangeSentence(solveFor, fixed, pv, targetGt, H) {
    const f = ctx.fmt, es = isEs();
    const lo = (solveFor === 'r') ? R_LO : G_LO;
    const hi = (solveFor === 'r') ? R_HI : G_HI;
    const atLo = (solveFor === 'r')
        ? ctx.model.cumulativeGt(ctx.model.forward(fixed, lo, pv, H))
        : ctx.model.cumulativeGt(ctx.model.forward(lo, fixed, pv, H));
    const below = atLo > targetGt;             // even the floor of the dial overshoots
    const edge = (below ? f.minus : '+') + f.pct(below ? lo : hi, 0) + ' %';
    return es
        ? `No se alcanza solo con esta palanca (haría falta más de un ${edge} anual).`
        : `Not reachable with this dial alone (would need ${below ? 'less than' : 'more than'} ${edge}/yr).`;
}

/** Spec §8.2, the inverse sentence. Returns HTML. */
function solveSentence(inv, horizon) {
    const f = ctx.fmt, es = isEs();
    const H = String(horizon), O = (horizon === PROJ_END) ? '2050' : '2100';
    const rowH = inv[H], rowO = inv[O];
    const target = targetTxt(inv.target);
    const prob = probTxt(inv.probability);
    const derived = inv.target === '3.0C'
        ? (es ? ' Es la marca del termómetro, derivada, no un presupuesto de la literatura.'
            : ' That is the derived thermometer mark, not a budget from the literature.')
        : '';

    if (!rowH || rowH.out_of_range) {
        return esc(outOfRangeSentence(inv.solve_for, inv.fixed_value, inv.population,
            inv.target_gt, horizon === PROJ_END ? PROJ_END : PROJ_MID)) + derived;
    }

    if (inv.solve_for === 'r') {
        const g = inv.fixed_value;
        const gTxt = (g < 0 ? f.minus : '') + f.pct(g);
        const xH = rowH.r_required;
        const xO = (rowO && !rowO.out_of_range) ? rowO.r_required : null;
        const magH = f.n(Math.abs(xH) * 100, 1);
        const magO = xO == null ? '—' : f.n(Math.abs(xO) * 100, 1);
        const eH = f.gt(rowH.e_2050_mt / 1000);
        const eO = xO == null ? '—' : f.gt(rowO.e_2050_mt / 1000);
        const ratio = rowH.ratio_vs_trend == null ? null : f.ratio(Math.abs(rowH.ratio_vs_trend));
        const bau = f.pct(ctx.model.presetRate('technology', 'bau'));
        // The two asides — the size of the cut and how it compares with the
        // recent trend — used to carry their own pair of dashes each and were
        // concatenated, so the 1.5 °C answer read "…— a 97 % cut — — 5.6× the
        // recent trend —". They are one parenthesis with one pair of dashes.
        const aside = [];
        // §8.2: for 1.5 °C the answer is a near-total cut; say so.
        if (rowH.intensity_2050_vs_2024 != null && rowH.intensity_2050_vs_2024 <= 0.10) {
            aside.push(es
                ? `un recorte del ${f.n((1 - rowH.intensity_2050_vs_2024) * 100, 0)} % del CO₂ por dólar en 2050`
                : `a ${f.n((1 - rowH.intensity_2050_vs_2024) * 100, 0)} % cut in CO₂ per dollar by 2050`);
        }
        if (ratio) {
            aside.push(es
                ? `${ratio} veces la tendencia reciente (${bau} %)`
                : `${ratio}× the recent trend (${bau} %/yr)`);
        }
        // `trend` closes the clause: it ends with the comma the sentence needs.
        const trend = aside.length
            ? (es ? ` —${aside.join(', ')}—,` : ` — ${aside.join(', ')} —`)
            : ',';
        // a required rate can be positive (the 3 °C mark to 2050): say "rise", not "fall"
        const must = (x, mag) => es
            ? (x < 0 ? `tiene que caer un <strong>${mag} % anual</strong>` : `podría incluso subir un <strong>${mag} % anual</strong>`)
            : (x < 0 ? `must fall <strong>${mag} %/yr</strong>` : `could even rise <strong>${mag} %/yr</strong>`);
        const would = (x, mag) => es
            ? (x < 0 ? `bastaría un ${mag} % anual` : `el CO₂ por dólar podría incluso subir un ${mag} % anual`)
            : (x < 0 ? `it would take ${mag} %/yr` : `CO₂ per dollar could even rise ${mag} %/yr`);

        if (horizon === PROJ_END) {
            const other = xO == null
                ? (es ? 'Contando solo hasta 2050 no hay solución dentro de la palanca.'
                    : 'Counting only to 2050 there is no solution inside the dial.')
                : (es ? `Contando solo hasta 2050 ${would(xO, magO)}, pero el presupuesto entero se habría consumido en 2050 con las emisiones todavía en ${eO} Gt/año.`
                    : `Counting only to 2050 ${would(xO, magO)}, but the whole budget would be used up by 2050 with emissions still at ${eO} Gt/yr.`);
            return es
                ? `Para no salirse del presupuesto de <strong>${target}</strong> (${prob}) con un crecimiento del ${gTxt} % anual por persona, el CO₂ por dólar ${must(xH, magH)} hasta 2100${trend} dejando las emisiones de 2050 en ${eH} Gt. ${other}${derived}`
                : `To stay within the <strong>${target}</strong> budget (${prob}) with ${gTxt} %/yr growth per person, CO₂ per dollar ${must(xH, magH)} through 2100${trend} leaving 2050 emissions at ${eH} Gt. ${other}${derived}`;
        }
        const other = xO == null
            ? (es ? 'Con tasas constantes hasta 2100 no hay solución dentro de la palanca.'
                : 'With constant rates to 2100 there is no solution inside the dial.')
            : (es ? `Con tasas constantes hasta 2100 ${would(xO, magO)}, que deja las emisiones de 2050 en ${eO} Gt.`
                : `With constant rates to 2100 ${would(xO, magO)}, leaving 2050 emissions at ${eO} Gt.`);
        return es
            ? `Contando solo hasta 2050, para quedarse dentro del presupuesto de <strong>${target}</strong> (${prob}) con un crecimiento del ${gTxt} % anual por persona el CO₂ por dólar ${must(xH, magH)}${trend} pero el presupuesto entero se habría consumido en 2050 con las emisiones todavía en ${eH} Gt/año. ${other}${derived}`
            : `Counting only to 2050, to stay within the <strong>${target}</strong> budget (${prob}) with ${gTxt} %/yr growth per person CO₂ per dollar ${must(xH, magH)}${trend} but the whole budget would be used up by 2050 with emissions still at ${eH} Gt/yr. ${other}${derived}`;
    }

    // ---- unknown = growth ----
    const r = inv.fixed_value;
    const id = activePreset('technology', r);
    const phrase = (TECH_PHRASE[id] || {})[isEs() ? 'es' : 'en']
        || (es ? `un CO₂ por dólar que ${r < 0 ? 'cae' : 'sube'} un ${f.pct(r)} % anual`
            : `CO₂ per dollar ${r < 0 ? 'falling' : 'rising'} ${f.pct(r)} %/yr`);
    const rTxt = r === 0 ? '0' : (r < 0 ? f.minus : '+') + f.pct(r);
    const xH = rowH.g_required;
    const magH = (xH < 0 ? f.minus : '+') + f.n(Math.abs(xH) * 100, 1);
    const ratio = rowH.gdp_pc_2050_vs_2024;
    // English takes "an" before a figure read aloud as a vowel: an 8…, an 11…,
    // an 18… ("an 81 % smaller economy"), "a" everywhere else.
    const art = (txt) => (/^(8|11|18)/.test(String(txt)) ? 'an' : 'a');
    const down = ratio == null ? '' : f.n((1 - ratio) * 100, 0);
    const up = ratio == null ? '' : f.n((ratio - 1) * 100, 0);
    const gText = ratio == null || Math.abs(ratio - 1) < 0.005
        ? (es ? 'la misma renta por persona en 2050' : 'the same income per person in 2050')
        : ratio < 1
            ? (es ? `una economía por persona un ${down} % menor en 2050`
                : `${art(down)} ${down} % smaller economy per person in 2050`)
            : (es ? `una economía por persona un ${up} % mayor en 2050`
                : `${art(up)} ${up} % larger economy per person in 2050`);
    const magO = rowO && !rowO.out_of_range
        ? (rowO.g_required < 0 ? f.minus : '+') + f.n(Math.abs(rowO.g_required) * 100, 1)
        : '—';

    if (horizon === PROJ_END) {
        return es
            ? `Con ${phrase} (${rTxt} % anual), quedarse dentro de <strong>${target}</strong> (${prob}) exige que el PIB por persona varíe un <strong>${magH} % anual</strong> hasta 2100 (es decir, ${gText}). Contando solo hasta 2050 cabría un ${magO} % anual, pero el presupuesto entero se habría consumido en 2050.${derived}`
            : `With ${phrase} (${rTxt} %/yr), staying within <strong>${target}</strong> (${prob}) requires GDP per person to change by <strong>${magH} %/yr</strong> through 2100 (that is, ${gText}). Counting only to 2050 it would allow ${magO} %/yr, but the whole budget would be used up by 2050.${derived}`;
    }
    return es
        ? `Contando solo hasta 2050, con ${phrase} (${rTxt} % anual) cabe un crecimiento del PIB por persona del <strong>${magH} % anual</strong> (es decir, ${gText}), pero el presupuesto de ${target} (${prob}) se agotaría del todo en 2050. Con tasas constantes hasta 2100 haría falta un ${magO} % anual.${derived}`
        : `Counting only to 2050, with ${phrase} (${rTxt} %/yr) GDP per person could still change by <strong>${magH} %/yr</strong> (that is, ${gText}), but the ${target} budget (${prob}) would be used up entirely by 2050. With constant rates to 2100 it would take ${magO} %/yr.${derived}`;
}

// ============================================================================
// DIALS
// ============================================================================

function dialHTML(key, group, nameKey, unitKey, sliders) {
    const list = ctx.model.presets(group) || [];
    const tablets = list.map(p => `<button class="wi-preset" type="button" data-wi-preset="${group}:${p.id}" aria-pressed="false" title="${esc(presetTitle(p, group))}">${esc(presetLabel(group, p))} ${esc((p.rate > 0 ? '+' : p.rate < 0 ? ctx.fmt.minus : '') + ctx.fmt.n(Math.abs(p.rate) * 100, 1))}</button>`).join('');
    return `
<div class="wi-dial" data-wi-dial="${key}">
  <div class="wi-dial-head">
    <span class="wi-dial-name" data-i18n="${nameKey}">${esc(ctx.t(nameKey))}</span>
    <span class="wi-dial-unit" data-i18n="${unitKey}">${esc(ctx.t(unitKey))}</span>
  </div>
  <div class="wi-presets">${tablets}</div>
  <div class="wi-slider">
    <input type="range" data-wi-range="${key}" min="${sliders.min * 100}" max="${sliders.max * 100}" step="${sliders.step * 100}" aria-label="${esc(ctx.t(nameKey))}">
    <input type="text" inputmode="decimal" class="wi-slider-value" data-wi-num="${key}" aria-label="${esc(ctx.t(nameKey))}">
    <span class="wi-ahead-unit">%</span>
  </div>
  <p class="wi-scale-note" data-wi-note="${key}"></p>
  ${key === 'g' ? '<p class="wi-scale-note wi-ahead-aside" data-wi-note="egal"></p>' : ''}
</div>`;
}

function popDialHTML() {
    const list = ctx.model.presets('population') || [];
    const tablets = list.map(p => {
        const name = ctx.t('whatifPop' + p.id.charAt(0).toUpperCase() + p.id.slice(1), p.id);
        return `<button class="wi-preset" type="button" data-wi-pop="${p.id}" aria-pressed="false" title="${esc(presetTitle(p, 'population'))}">${esc(name)} ${esc(popTxt(p.pop_2050))}</button>`;
    }).join('');
    return `
<div class="wi-dial" data-wi-dial="pop">
  <div class="wi-dial-head">
    <span class="wi-dial-name" data-i18n="whatifDial3">${esc(ctx.t('whatifDial3'))}</span>
    <span class="wi-dial-unit" data-i18n="whatifDial3Unit">${esc(ctx.t('whatifDial3Unit'))}</span>
  </div>
  <div class="wi-presets">${tablets}</div>
  <p class="wi-scale-note" data-wi-note="pop"></p>
</div>`;
}

/**
 * The live reading that stays with the dials. On a phone the dials fold open
 * ABOVE the scene, so moving a slider used to change nothing the reader could
 * see: the figure started 211 px below the fold and the thermometer 476 px
 * below that. This strip is sticky at the top of the panel on ≤900 px (spec §9
 * asks for a thermometer always in view) and is hidden on the desktop, where
 * the scene is beside the dials and needs no echo.
 */
function liveStripHTML() {
    return `
<div class="wi-live" data-wi-live>
  <span class="wi-live-label" data-i18n="whatifCardCum">${esc(ctx.t('whatifCardCum'))}</span>
  <span class="wi-live-read" data-wi-live-read>—</span>
  <div class="wi-therm-rail wi-live-rail">
    <span class="wi-therm-tick" style="left:20%"></span>
    <span class="wi-therm-tick" style="left:40%"></span>
    <span class="wi-therm-needle" data-wi-live-needle></span>
  </div>
  <span class="wi-live-foot" data-wi-live-foot></span>
</div>`;
}

/**
 * Where each preset comes from (spec §5.2). It used to live only in the title
 * attribute of the tablets, which a touch screen never shows: on a phone the
 * provenance of the three dials was unreachable, and on the desktop there was
 * no way to read the ten of them together.
 */
function sourcesHTML() {
    const es = isEs();
    const groups = [
        ['growth', ctx.t('whatifDial1')],
        ['technology', ctx.t('whatifDial2')],
        ['population', ctx.t('whatifDial3')]
    ];
    const body = groups.map(([g, name]) => {
        const rows = (ctx.model.presets(g) || []).map(p => {
            const d = defOf(g, p), s = sourceOf(g, p);
            return `<li><b>${esc(presetFull(g, p))}</b>${d ? ' ' + esc(d) : ''}${s ? ` <i>${esc(s)}</i>` : ''}</li>`;
        }).join('');
        return `<p class="wi-src-group">${esc(name)}</p><ul class="wi-src-list">${rows}</ul>`;
    }).join('');
    return `
<div class="wi-sources" data-wi-sources>
  <button class="wi-src-toggle" type="button" data-wi-src-toggle aria-expanded="false">
    <span>${esc(es ? 'Fuentes de las palancas' : 'Sources of the dials')}</span>
    <span class="wi-caret" aria-hidden="true">&#9660;</span>
  </button>
  <div class="wi-src-body" data-wi-src-body hidden>${body}</div>
</div>`;
}

function solvePanelHTML() {
    const es = isEs();
    const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
    return `
<div class="wi-solve">
  <button class="wi-ahead-solve-toggle" type="button" data-wi-solve-toggle aria-expanded="false">
    <span class="wi-solve-head" data-i18n="whatifSolveTitle">${esc(ctx.t('whatifSolveTitle'))}</span>
    <span class="wi-caret" aria-hidden="true">&#9660;</span>
  </button>
  <div class="wi-ahead-solve-body" data-wi-solve-body hidden>
    <div class="wi-field">
      <span class="wi-field-label" data-i18n="whatifSolveUnknown">${esc(ctx.t('whatifSolveUnknown'))}</span>
      <select class="wi-select" data-wi-solve="unknown">
        ${opt('intensity', ctx.t('whatifSolveIntensity'), true)}
        ${opt('growth', ctx.t('whatifSolveGrowth'), false)}
      </select>
    </div>
    <div class="wi-field">
      <span class="wi-field-label" data-i18n="whatifSolveTarget">${esc(ctx.t('whatifSolveTarget'))}</span>
      <select class="wi-select" data-wi-solve="target">
        ${opt('1.5C', ctx.t('whatifTarget15'), false)}
        ${opt('2.0C', ctx.t('whatifTarget20'), true)}
        ${opt('3.0C', ctx.t('whatifTarget30'), false)}
      </select>
    </div>
    <div class="wi-field">
      <span class="wi-field-label" data-i18n="whatifSolveProbability">${esc(ctx.t('whatifSolveProbability'))}</span>
      <select class="wi-select" data-wi-solve="prob">
        ${opt('50%', ctx.t('whatifProb50'), true)}
        ${opt('67%', ctx.t('whatifProb67'), false)}
        ${opt('83%', ctx.t('whatifProb83'), false)}
      </select>
    </div>
    <div class="wi-field">
      <span class="wi-field-label" data-i18n="whatifSolveHorizon">${esc(ctx.t('whatifSolveHorizon'))}</span>
      <select class="wi-select" data-wi-solve="horizon">
        ${opt('2050', ctx.t('whatifHorizon2050'), false)}
        ${opt('2100', ctx.t('whatifHorizon2100'), true)}
      </select>
    </div>
    <p class="wi-ahead-solve-out" data-wi-solve-out></p>
    <p class="wi-ahead-solve-echo" data-wi-solve-echo></p>
    <button class="wi-solve-apply" type="button" data-wi-apply data-i18n="whatifSolveApply">${esc(ctx.t('whatifSolveApply'))}</button>
  </div>
</div>`;
}

// `i18n` is false when the rebuild is itself the answer to a language change:
// ctx.applyI18n() calls app.js's applyLanguage(), which re-fires 'gw:language',
// which the shell turns into another update({reason:'language'}). Calling it
// there would spin one full rebuild per frame, for ever. It is not needed
// either: every label below is written with ctx.t() in the language of the day.
function buildDials(i18n = true) {
    const sl = ctx.model.presets('sliders') || {};
    ctx.dials.innerHTML =
        liveStripHTML() +
        dialHTML('g', 'growth', 'whatifDial1', 'whatifDial1Unit', sl.growth || { min: -0.03, max: 0.05, step: 0.001 }) +
        dialHTML('r', 'technology', 'whatifDial2', 'whatifDial2Unit', sl.technology || { min: -0.12, max: 0.02, step: 0.001 }) +
        popDialHTML() +
        solvePanelHTML() +
        sourcesHTML();
    if (i18n) ctx.applyI18n(ctx.dials);

    dom.rangeG = ctx.dials.querySelector('[data-wi-range="g"]');
    dom.rangeR = ctx.dials.querySelector('[data-wi-range="r"]');
    dom.numG = ctx.dials.querySelector('[data-wi-num="g"]');
    dom.numR = ctx.dials.querySelector('[data-wi-num="r"]');
    dom.noteG = ctx.dials.querySelector('[data-wi-note="g"]');
    dom.noteR = ctx.dials.querySelector('[data-wi-note="r"]');
    dom.notePop = ctx.dials.querySelector('[data-wi-note="pop"]');
    dom.noteEgal = ctx.dials.querySelector('[data-wi-note="egal"]');
    dom.solveToggle = ctx.dials.querySelector('[data-wi-solve-toggle]');
    dom.solveBody = ctx.dials.querySelector('[data-wi-solve-body]');
    dom.solveOut = ctx.dials.querySelector('[data-wi-solve-out]');
    dom.solveEcho = ctx.dials.querySelector('[data-wi-solve-echo]');
    dom.liveRead = ctx.dials.querySelector('[data-wi-live-read]');
    dom.liveNeedle = ctx.dials.querySelector('[data-wi-live-needle]');
    dom.liveFoot = ctx.dials.querySelector('[data-wi-live-foot]');
    dom.srcToggle = ctx.dials.querySelector('[data-wi-src-toggle]');
    dom.srcBody = ctx.dials.querySelector('[data-wi-src-body]');
    dom.selUnknown = ctx.dials.querySelector('[data-wi-solve="unknown"]');
    dom.selTarget = ctx.dials.querySelector('[data-wi-solve="target"]');
    dom.selProb = ctx.dials.querySelector('[data-wi-solve="prob"]');
    dom.selHorizon = ctx.dials.querySelector('[data-wi-solve="horizon"]');
    dom.applyBtn = ctx.dials.querySelector('[data-wi-apply]');

    wireDials();
}

function wireDials() {
    // presets ------------------------------------------------------------
    on(ctx.dials, 'click', (ev) => {
        const btn = ev.target.closest('[data-wi-preset], [data-wi-pop]');
        if (!btn || !ctx.dials.contains(btn)) return;
        if (btn.dataset.wiPop) { ctx.State.set('whatifPop', btn.dataset.wiPop); return; }
        const [group, id] = btn.dataset.wiPreset.split(':');
        const rate = ctx.model.presetRate(group, id);
        if (rate == null) return;
        ctx.State.set(group === 'growth' ? 'whatifG' : 'whatifR', rate);
    });

    // fine sliders --------------------------------------------------------
    const slide = (key, node) => on(node, 'input', () => {
        const v = round4(parseFloat(node.value) / 100);
        if (!isFinite(v)) return;
        ctx.State.set(key === 'g' ? 'whatifG' : 'whatifR',
            clamp(v, key === 'g' ? G_LO : R_LO, key === 'g' ? G_HI : R_HI));
    });
    slide('g', dom.rangeG);
    slide('r', dom.rangeR);

    // editable readouts ---------------------------------------------------
    const typed = (key, node) => on(node, 'change', () => {
        const sKey = key === 'g' ? 'whatifG' : 'whatifR';
        const lo = key === 'g' ? G_LO : R_LO, hi = key === 'g' ? G_HI : R_HI;
        const raw = String(node.value).replace(/−/g, '-').replace(/\s/g, '').replace(',', '.');
        const v = round4(parseFloat(raw) / 100);
        const next = isFinite(v) ? clamp(v, lo, hi) : ctx.State.get(sKey);
        ctx.State.set(sKey, next);
        node.value = ctx.fmt.n(next * 100, 2);               // echo back what was taken
    });
    typed('g', dom.numG);
    typed('r', dom.numR);

    // solve panel ---------------------------------------------------------
    on(dom.solveToggle, 'click', () => {
        const open = ctx.State.get('whatifSolveFor') != null;
        ctx.State.set('whatifSolveFor', open ? null : lastUnknown);
    });
    on(dom.selUnknown, 'change', () => {
        lastUnknown = dom.selUnknown.value === 'growth' ? 'growth' : 'intensity';
        ctx.State.set('whatifSolveFor', lastUnknown);
    });
    on(dom.selTarget, 'change', () => ctx.State.set('whatifTarget', dom.selTarget.value));
    on(dom.selProb, 'change', () => ctx.State.set('whatifProb', dom.selProb.value));
    on(dom.selHorizon, 'change', () => ctx.State.set('whatifHorizon', parseInt(dom.selHorizon.value, 10)));
    on(dom.srcToggle, 'click', () => {
        const open = dom.srcBody.hidden;
        dom.srcBody.hidden = !open;
        dom.srcToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    on(dom.applyBtn, 'click', () => {
        const inv = currentInverse();
        if (!inv) return;
        const row = inv[String(ctx.State.get('whatifHorizon') || PROJ_END)];
        if (!row || row.out_of_range) return;
        if (inv.solve_for === 'r') ctx.State.set('whatifR', clamp(round4(row.r_required), R_LO, R_HI));
        else ctx.State.set('whatifG', clamp(round4(row.g_required), G_LO, G_HI));
    });
}

// ============================================================================
// SCENE
// ============================================================================

const CSS = `
.wi-ahead-chart-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-family:var(--ff-caps);font-size:10px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--cl)}
.wi-ahead-key{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.wi-ahead-key[hidden]{display:none}
.wi-ahead-key i{display:inline-block;width:16px;height:0;border-top:2px solid var(--cd)}
.wi-ahead-key.is-proj i{border-top-color:var(--verm-deep)}
.wi-ahead-key.is-tail i{border-top:1px dashed var(--verm-deep)}
.wi-ahead-tailtoggle{margin-left:auto;display:inline-flex;align-items:center;gap:7px;cursor:pointer;color:var(--cl);font-family:var(--ff-caps);letter-spacing:.14em;text-transform:uppercase;font-size:10px;min-height:26px}
.wi-ahead-tailtoggle input{width:13px;height:13px;accent-color:var(--verm-deep);margin:0}
.wi-ahead-tip{position:absolute;z-index:4;top:0;left:0;pointer-events:none;min-width:118px;max-width:230px;padding:7px 9px;border:1px solid var(--cb);background:var(--bg);font-size:11.5px;line-height:1.5;color:var(--cg);font-variant-numeric:tabular-nums lining-nums}
.wi-ahead-tip b{display:block;font-family:var(--ff-caps);font-size:10px;font-weight:500;letter-spacing:.14em;color:var(--cd);margin-bottom:3px}
input.wi-slider-value{width:66px;flex:0 0 auto;height:26px;padding:2px 6px;border:1px solid var(--cb);border-radius:0;background:var(--bg);color:var(--cd);font-family:var(--ff);font-size:12.5px;font-weight:500;-moz-appearance:textfield}
input.wi-slider-value::-webkit-outer-spin-button,input.wi-slider-value::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.wi-ahead-unit{font-size:11px;color:var(--cl)}
.wi-ahead-aside{color:var(--cl);font-size:11.5px;font-style:italic}
.wi-ahead-solve-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:26px;padding:0;border:0;background:transparent;cursor:pointer}
.wi-ahead-solve-toggle .wi-solve-head{margin-bottom:0}
.wi-ahead-solve-toggle[aria-expanded="true"] .wi-caret{transform:rotate(180deg)}
.wi-ahead-solve-body{padding-top:11px}
.wi-ahead-solve-out{margin:2px 0 9px;font-size:12px;line-height:1.6;color:var(--cg);font-variant-numeric:tabular-nums lining-nums}
.wi-ahead-solve-out b{font-weight:500;color:var(--verm-ink)}
.wi-ahead-solve-echo{margin:0 0 11px;padding-left:10px;border-left:1px solid var(--verm-deep);font-family:var(--ff-serif);font-size:12.5px;line-height:1.5;color:var(--cd)}
.wi-ahead-solve-echo:empty{display:none}
.wi-ahead-solve-echo strong{font-weight:700;color:var(--verm-ink)}
.wi-live{display:none}
.wi-sources{margin-top:14px;padding-top:11px;border-top:1px solid var(--cb)}
.wi-src-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:26px;padding:0;border:0;background:transparent;cursor:pointer;color:var(--cl);font-family:var(--ff-caps);font-size:9.5px;font-weight:500;letter-spacing:.16em;text-transform:uppercase}
.wi-src-toggle[aria-expanded="true"] .wi-caret{transform:rotate(180deg)}
.wi-src-body{padding-top:9px}
.wi-src-body[hidden]{display:none}
.wi-src-group{margin:9px 0 4px;font-family:var(--ff-caps);font-size:9.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--verm-ink)}
.wi-src-group:first-child{margin-top:0}
.wi-src-list{margin:0;padding-left:14px;list-style:square;font-size:12px;line-height:1.5;color:var(--cg)}
.wi-src-list li{margin-bottom:6px}
.wi-src-list b{font-weight:500;color:var(--cd)}
.wi-src-list i{color:var(--cl);font-style:italic}
.wi-ahead-therm-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.wi-ahead-therm-read{font-family:var(--ff-serif);font-size:15px;color:var(--cd);font-variant-numeric:tabular-nums lining-nums}
.wi-ahead-tick-today{background:var(--cd)}
.wi-ahead-tick-3{background:repeating-linear-gradient(var(--cl) 0 2px,transparent 2px 4px)}
.wi-ahead-needle-2100{width:1px;background:var(--cl)}
.wi-ahead-legend-line{margin-top:7px;font-size:11.5px;line-height:1.55;color:var(--cg)}
.wi-sentence+.wi-ahead-solve-sentence{color:var(--cd);border-left:1px solid var(--verm-deep);padding-left:12px;margin-top:4px}
.wi-ahead-solve-sentence{color:var(--cd);border-left:1px solid var(--verm-deep);padding-left:12px}
@media (max-width:900px){
  input.wi-slider-value{height:44px;width:76px;font-size:14px}
  .wi-ahead-tailtoggle{min-height:44px}
  .wi-ahead-tip{font-size:11px;min-width:104px}
  .wi-ahead-solve-toggle{min-height:44px}
  /* The live reading rides with the dials: on a phone the scene is pushed
     below the fold when the accordion opens, and this is what answers the
     slider under the reader's thumb. */
  .wi-live{display:block;position:sticky;top:0;z-index:5;margin:0 -16px 12px;padding:9px 16px 10px;background:var(--foam);border-bottom:1px solid var(--cb)}
  .wi-live-label{display:block;font-family:var(--ff-caps);font-size:9.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--cl)}
  .wi-live-read{display:block;margin-top:2px;font-family:var(--ff-serif);font-size:19px;line-height:1.1;color:var(--cd);font-variant-numeric:tabular-nums lining-nums}
  .wi-live-rail{height:8px;margin-top:7px}
  .wi-live-foot{display:block;margin-top:5px;font-size:11.5px;color:var(--cg);font-variant-numeric:tabular-nums lining-nums}
}
@media (max-width:560px){
  /* The checkbox used to wrap onto a line of its own, hard right, and the
     chart header then ate 73 px of a 597 px fold. */
  .wi-ahead-chart-head{gap:4px 12px}
  .wi-ahead-tailtoggle{margin-left:0}
}`;

function sceneHTML() {
    const es = isEs();
    return `<style data-wi-ahead-css>${CSS}</style>
<div class="wi-ahead-chart-head">
  <span class="wi-ahead-key"><i></i>${es ? 'Histórico 1990–2024' : 'History 1990–2024'}</span>
  <span class="wi-ahead-key is-proj"><i></i>${es ? 'Proyección 2025–2050' : 'Projection 2025–2050'}</span>
  <span class="wi-ahead-key is-tail" data-wi-tailkey hidden><i></i>${es ? 'Cola 2051–2100' : 'Tail 2051–2100'}</span>
  <label class="wi-ahead-tailtoggle"><input type="checkbox" data-wi-tail>${es ? 'Hasta 2100' : 'To 2100'}</label>
</div>
<div class="wi-chart" data-wi-chartbox>
  <svg class="wi-chart-svg" data-wi-svg role="img" aria-label=""></svg>
  <div class="wi-ahead-tip" data-wi-tip hidden></div>
</div>
<div class="wi-therm">
  <div class="wi-ahead-therm-head">
    <span class="wi-dial-name" data-i18n="whatifThermTitle">${esc(ctx.t('whatifThermTitle'))}</span>
    <span class="wi-ahead-therm-read" data-wi-therm-read></span>
  </div>
  <div class="wi-therm-rail">
    <span class="wi-therm-band" data-wi-band></span>
    <span class="wi-therm-tick wi-ahead-tick-today" data-wi-tick-today></span>
    <span class="wi-therm-tick" style="left:20%"></span>
    <span class="wi-therm-tick" style="left:40%"></span>
    <span class="wi-therm-tick wi-ahead-tick-3" style="left:80%"></span>
    <span class="wi-therm-needle wi-ahead-needle-2100" data-wi-needle-2100></span>
    <span class="wi-therm-needle" data-wi-needle></span>
  </div>
  <div class="wi-therm-scale">
    <span>${es ? '1,0' : '1.0'}</span><span>${es ? '1,5' : '1.5'}</span><span>${es ? '2,0' : '2.0'}</span>
    <span>${es ? '2,5' : '2.5'}</span><span>${es ? '3,0' : '3.0'}</span><span>${es ? '3,5' : '3.5'}</span>
  </div>
  <p class="wi-ahead-legend-line" data-wi-therm-legend></p>
  <p class="wi-therm-note" data-i18n="whatifThermNote">${esc(ctx.t('whatifThermNote'))}</p>
</div>
<div class="wi-cards">
  <div class="wi-card" data-wi-card="cum">
    <span class="wi-card-label" data-i18n="whatifCardCum">${esc(ctx.t('whatifCardCum'))}</span>
    <span class="wi-card-value" data-wi-value>—</span>
    <span class="wi-card-sub" data-wi-sub></span>
  </div>
  <div class="wi-card" data-wi-card="remaining">
    <span class="wi-card-label" data-i18n="whatifCardRemaining">${esc(ctx.t('whatifCardRemaining'))}</span>
    <span class="wi-card-value" data-wi-value>—</span>
    <span class="wi-card-sub" data-wi-sub></span>
    <span class="wi-card-sub" data-wi-sub2></span>
  </div>
  <div class="wi-card" data-wi-card="exhaustion">
    <span class="wi-card-label" data-i18n="whatifCardExhaustion">${esc(ctx.t('whatifCardExhaustion'))}</span>
    <span class="wi-card-value" data-wi-value>—</span>
    <span class="wi-card-sub" data-wi-sub></span>
  </div>
  <div class="wi-card" data-wi-card="e2050">
    <span class="wi-card-label" data-i18n="whatifCard2050">${esc(ctx.t('whatifCard2050'))}</span>
    <span class="wi-card-value" data-wi-value>—</span>
    <span class="wi-card-sub" data-wi-sub></span>
  </div>
</div>
<p class="wi-sentence" data-wi-sentence></p>
<p class="wi-sentence" data-wi-tailsentence></p>
<p class="wi-sentence wi-ahead-solve-sentence" data-wi-solvesentence hidden></p>
<p class="wi-therm-note" data-wi-budgetnote></p>`;
}

function buildScene(i18n = true) {
    ctx.root.innerHTML = sceneHTML();
    if (i18n) ctx.applyI18n(ctx.root);

    dom.svg = ctx.root.querySelector('[data-wi-svg]');
    dom.chartBox = ctx.root.querySelector('[data-wi-chartbox]');
    dom.tip = ctx.root.querySelector('[data-wi-tip]');
    dom.tailBox = ctx.root.querySelector('[data-wi-tail]');
    dom.tailKey = ctx.root.querySelector('[data-wi-tailkey]');
    dom.thermRead = ctx.root.querySelector('[data-wi-therm-read]');
    dom.thermLegend = ctx.root.querySelector('[data-wi-therm-legend]');
    dom.band = ctx.root.querySelector('[data-wi-band]');
    dom.tickToday = ctx.root.querySelector('[data-wi-tick-today]');
    dom.needle = ctx.root.querySelector('[data-wi-needle]');
    dom.needle2100 = ctx.root.querySelector('[data-wi-needle-2100]');
    dom.cards = {};
    ctx.root.querySelectorAll('[data-wi-card]').forEach(card => {
        dom.cards[card.dataset.wiCard] = {
            value: card.querySelector('[data-wi-value]'),
            sub: card.querySelector('[data-wi-sub]'),
            sub2: card.querySelector('[data-wi-sub2]')
        };
    });
    dom.sentence = ctx.root.querySelector('[data-wi-sentence]');
    dom.tailSentence = ctx.root.querySelector('[data-wi-tailsentence]');
    dom.solveSentence = ctx.root.querySelector('[data-wi-solvesentence]');
    dom.budgetNote = ctx.root.querySelector('[data-wi-budgetnote]');

    if (dom.tailBox) dom.tailBox.checked = tailOn();

    // the svg skeleton: fixed groups, joined on every redraw
    if (dom.svg && window.d3) {
        const s = window.d3.select(dom.svg);
        ['grid', 'area', 'lines', 'marks', 'axis', 'hover'].forEach(k => s.append('g').attr('class', 'wi-g-' + k));
    }

    wireScene();
}

function wireScene() {
    on(dom.tailBox, 'change', () => { ctx.State.set('whatifTail', !!dom.tailBox.checked); });
    on(dom.svg, 'pointermove', onHover);
    on(dom.svg, 'pointerleave', hideTip);
    on(dom.svg, 'pointerdown', onHover);
}

// ---- the main figure -------------------------------------------------------

// A what-if figure needs a stable rule for its vertical scale. With a domain
// fitted to whatever is on screen the scene lied: technological stagnation
// (1,478 Gt cumulative, 79 Gt in 2050) drew its 2050 point 20 px LOWER than
// business as usual (1,055 Gt, 43 Gt), and the observed 1990–2024 line — fixed
// data — changed shape whenever a dial of the future moved.
//
// So the domain is the envelope of the whole preset space: the worst of the
// five growth presets crossed with the five technology presets, at the chosen
// population and horizon. Nothing the reader can click rescales the axis, and
// the three dials become comparable with one another. Only the fine slider can
// leave that space, and then the axis grows to hold the current path.
let envCache = {};

function envelopeGt(pop, xMax) {
    const key = pop + ':' + xMax;
    if (envCache[key] != null) return envCache[key];
    const G = (ctx.model.presets('growth') || []).map(p => p.rate);
    const R = (ctx.model.presets('technology') || []).map(p => p.rate);
    let max = 0;
    G.forEach(g => R.forEach(r => {
        let traj;
        try { traj = ctx.model.forward(g, r, pop, xMax); } catch (e) { return; }
        if (!traj) return;
        for (let i = 0; i < traj.length; i++) {
            const v = traj[i].E_mt / 1000;
            if (v > max) max = v;
        }
    }));
    envCache[key] = max;
    return max;
}

/** A round ceiling (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 × 10^k) for the axis. */
function niceTop(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / e;
    const s = m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5
        : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10;
    return s * e;
}

function drawChart(res) {
    const d3 = window.d3;
    if (!d3 || !dom.svg || !res) return;
    const box = dom.svg.getBoundingClientRect();
    const W = Math.round(box.width), H = Math.round(box.height);
    if (W < 60 || H < 60) return;                  // hidden or not laid out yet
    dom.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    dom.svg.setAttribute('aria-label', dom.svg.dataset.wiAria || '');

    const f = ctx.fmt, es = isEs(), mobile = ctx.isMobile();
    const m = { t: 24, r: mobile ? 12 : 18, b: 26, l: mobile ? 36 : 46 };
    const xMax = tailOn() ? PROJ_END : PROJ_MID;

    // data -------------------------------------------------------------
    const wld = ctx.model.series('WLD');
    const hist = [];
    for (let year = HIST_FROM; year <= BASE_YEAR; year++) {
        const v = wld.co2ff[year - wld.y0];
        if (v != null && isFinite(v)) hist.push({ year, gt: v / 1000 });
    }
    const anchor = hist.length ? hist[hist.length - 1] : { year: BASE_YEAR, gt: res.base.E / 1000 };
    const proj = [anchor].concat(res.trajectory.map(p => ({ year: p.year, gt: p.E_mt / 1000 })));
    const tail = tailOn()
        ? [proj[proj.length - 1]].concat(res.trajectory_tail.map(p => ({ year: p.year, gt: p.E_mt / 1000 })))
        : [];

    const shown = hist.concat(proj, tail).filter(d => d.year <= xMax);
    // The envelope is measured on the scene's own span, 2025–2050, which is
    // what the three dials are about. At 2100 the preset space really does
    // reach 270 Gt/yr, and an axis that held it would flatten every scenario
    // worth reading; the optional tail therefore lifts the ceiling only when
    // the path it draws needs it — and it announces itself by moving the x
    // axis at the same time.
    // No extra headroom on top of the envelope: the envelope already IS the
    // worst case of the preset space, and padding it would push the ceiling
    // from 80 to 100 Gt and waste a fifth of the figure on empty paper.
    const here = Math.max(1, d3.max(shown, d => d.gt));
    const yMax = niceTop(Math.max(here, envelopeGt(res.inputs.population, PROJ_MID)));

    const x = d3.scaleLinear().domain([HIST_FROM, xMax]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, yMax]).nice(mobile ? 4 : 5).range([H - m.b, m.t]);

    const line = d3.line().x(d => x(d.year)).y(d => y(d.gt));
    const area = d3.area().x(d => x(d.year)).y0(y(0)).y1(d => y(d.gt));

    // grid + y axis ----------------------------------------------------
    const ticks = y.ticks(mobile ? 4 : 5);
    const gGrid = d3.select(dom.svg).select('.wi-g-grid');
    gGrid.selectAll('line').data(ticks).join('line')
        .attr('x1', m.l).attr('x2', W - m.r)
        .attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', 'var(--cb)').attr('stroke-width', 1)
        .attr('opacity', d => (d === 0 ? 1 : 0.55));

    // areas ------------------------------------------------------------
    const y15 = res.exhaustion_year_1p5;
    const upTo15 = (y15 != null && y15 <= xMax) ? proj.filter(d => d.year <= y15) : [];
    const gArea = d3.select(dom.svg).select('.wi-g-area');
    const areas = [
        { key: 'all', d: area(proj.filter(d => d.year <= xMax)), op: 0.10 },
        { key: 'tail', d: tail.length ? area(tail) : null, op: 0.06 },
        { key: 'b15', d: upTo15.length > 1 ? area(upTo15) : null, op: 0.13 }
    ].filter(a => a.d);
    gArea.selectAll('path').data(areas, d => d.key).join('path')
        .attr('d', d => d.d).attr('fill', 'var(--verm)').attr('opacity', d => d.op)
        .attr('stroke', 'none');

    // lines ------------------------------------------------------------
    const lines = [
        { key: 'hist', d: line(hist), stroke: 'var(--cd)', w: 1.6, dash: null, op: 1 },
        { key: 'proj', d: line(proj.filter(d => d.year <= xMax)), stroke: 'var(--verm-deep)', w: 1.8, dash: null, op: 1 }
    ];
    if (tail.length) lines.push({ key: 'tail', d: line(tail), stroke: 'var(--verm-deep)', w: 1.2, dash: '4 4', op: 0.55 });
    d3.select(dom.svg).select('.wi-g-lines').selectAll('path').data(lines, d => d.key).join('path')
        .attr('d', d => d.d).attr('fill', 'none')
        .attr('stroke', d => d.stroke).attr('stroke-width', d => d.w)
        .attr('stroke-dasharray', d => d.dash).attr('opacity', d => d.op)
        .attr('stroke-linejoin', 'round');

    // budget-exhaustion marks -------------------------------------------
    const marks = [];
    const label15 = es ? 'presupuesto de 1,5 °C agotado' : '1.5 °C budget exhausted';
    [[res.exhaustion_year_1p5, label15], [res.exhaustion_year_2p0, '2 °C'], [res.exhaustion_year_3p0, '≈3 °C']]
        .forEach(([yr, txt], i) => {
            if (yr == null || yr < HIST_FROM || yr > xMax) return;
            marks.push({ key: 'm' + i, year: yr, text: `${txt} · ${yr}`, row: marks.length });
        });
    const gMarks = d3.select(dom.svg).select('.wi-g-marks');
    const mk = gMarks.selectAll('g').data(marks, d => d.key).join(
        enter => { const g = enter.append('g'); g.append('line'); g.append('text'); return g; }
    );
    mk.select('line')
        .attr('x1', d => x(d.year)).attr('x2', d => x(d.year))
        .attr('y1', y(0)).attr('y2', m.t)
        .attr('stroke', 'var(--verm-ink)').attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 3').attr('opacity', 0.75);
    mk.select('text')
        .attr('x', d => (x(d.year) > W - 150 ? x(d.year) - 5 : x(d.year) + 5))
        .attr('y', d => m.t + 11 + d.row * 13)
        .attr('text-anchor', d => (x(d.year) > W - 150 ? 'end' : 'start'))
        .attr('font-family', 'var(--ff)').attr('font-size', mobile ? 9.5 : 10.5)
        .attr('fill', 'var(--verm-ink)')
        .text(d => d.text);

    // axes --------------------------------------------------------------
    const step = mobile ? 20 : 10;
    const xTicks = [];
    for (let year = HIST_FROM; year <= xMax; year += step) xTicks.push(year);
    if (xTicks[xTicks.length - 1] !== xMax) xTicks.push(xMax);
    const gAxis = d3.select(dom.svg).select('.wi-g-axis');
    const axisData = [{ kind: 'unit', v: 0 }]
        .concat(ticks.map(v => ({ kind: 'y', v })))
        .concat(xTicks.map(v => ({ kind: 'x', v })));
    gAxis.selectAll('text').data(axisData, d => d.kind + d.v).join('text')
        .attr('x', d => d.kind === 'x' ? x(d.v) : (d.kind === 'y' ? m.l - 6 : m.l))
        .attr('y', d => d.kind === 'x' ? H - m.b + 15 : (d.kind === 'y' ? y(d.v) + 3.5 : m.t - 9))
        .attr('text-anchor', d => d.kind === 'x' ? 'middle' : (d.kind === 'y' ? 'end' : 'start'))
        .attr('font-family', d => d.kind === 'unit' ? 'var(--ff-caps)' : 'var(--ff)')
        .attr('font-size', d => d.kind === 'unit' ? 9.5 : (mobile ? 9.5 : 10.5))
        .attr('letter-spacing', d => d.kind === 'unit' ? '.14em' : null)
        .attr('fill', 'var(--cl)')
        .attr('style', d => d.kind === 'y' ? 'font-variant-numeric:tabular-nums lining-nums' : null)
        .text(d => d.kind === 'unit'
            ? (es ? 'GT CO₂/AÑO' : 'GT CO₂/YR')
            : (d.kind === 'y' ? f.n(d.v, 0) : String(d.v)));

    // hover scaffolding --------------------------------------------------
    const gHover = d3.select(dom.svg).select('.wi-g-hover');
    let hv = gHover.select('.wi-hover-line');
    if (hv.empty()) {
        gHover.append('line').attr('class', 'wi-hover-line')
            .attr('stroke', 'var(--cd)').attr('stroke-width', 1).attr('opacity', 0.45);
        gHover.append('circle').attr('class', 'wi-hover-dot')
            .attr('r', 3).attr('fill', 'var(--verm-deep)');
    }
    gHover.attr('display', 'none');

    // the index the tooltip reads
    byYear = new Map();
    hist.forEach(d => byYear.set(d.year, { gt: d.gt, cum: null, rem: null }));
    const rcbTarget = res.budget_target_gt;
    // cumulative_by_year and trajectory_2100 are the same 2025..2100 index
    res.cumulative_by_year.forEach((c, k) => {
        const p = res.trajectory_2100[k];
        byYear.set(c.year, { gt: (p ? p.E_mt : 0) / 1000, cum: c.cum_gt, rem: rcbTarget - c.cum_gt });
    });
    dom.chartGeom = { x, y, m, W, H, xMax };
}

function onHover(ev) {
    const d3 = window.d3;
    const geom = dom.chartGeom;
    if (!geom || !dom.svg || !byYear || !lastRes) return;
    const box = dom.svg.getBoundingClientRect();
    const mx = ev.clientX - box.left;
    if (mx < geom.m.l - 4 || mx > geom.W - geom.m.r + 4) { hideTip(); return; }
    const year = Math.round(clamp(geom.x.invert(mx), HIST_FROM, geom.xMax));
    const d = byYear.get(year);
    if (!d) { hideTip(); return; }

    const gHover = d3.select(dom.svg).select('.wi-g-hover').attr('display', null);
    gHover.select('.wi-hover-line')
        .attr('x1', geom.x(year)).attr('x2', geom.x(year))
        .attr('y1', geom.y(0)).attr('y2', geom.m.t);
    gHover.select('.wi-hover-dot').attr('cx', geom.x(year)).attr('cy', geom.y(d.gt));

    const f = ctx.fmt, es = isEs();
    const rows = [`${es ? 'Emisiones' : 'Emissions'}: ${f.gt(d.gt)} Gt`];
    if (d.cum != null) {
        rows.push(`${es ? 'Acumulado desde 2025' : 'Cumulative since 2025'}: ${f.gt(d.cum)} Gt`);
        rows.push(`${es ? 'Restante' : 'Remaining'} (${targetTxt(lastRes.inputs.target)}): ${signedGt(d.rem, 1)} Gt`);
    }
    dom.tip.innerHTML = `<b>${year}</b>${rows.map(esc).join('<br>')}`;
    dom.tip.hidden = false;

    const boxRect = dom.chartBox.getBoundingClientRect();
    const tipW = dom.tip.offsetWidth || 150;
    let left = geom.x(year) + 12;
    if (left + tipW > boxRect.width - 6) left = geom.x(year) - tipW - 12;
    dom.tip.style.left = Math.max(4, left) + 'px';
    dom.tip.style.top = Math.max(4, Math.min(geom.y(d.gt) - 10, geom.H - 90)) + 'px';
}

function hideTip() {
    if (dom.tip) dom.tip.hidden = true;
    if (dom.svg && window.d3) window.d3.select(dom.svg).select('.wi-g-hover').attr('display', 'none');
}

// ---- thermometer -----------------------------------------------------------

function thermPct(c) {
    return clamp((c - THERM_LO) / (THERM_HI - THERM_LO), 0, 1) * 100;
}

function drawThermometer(res) {
    const f = ctx.fmt, es = isEs();
    const t2024 = ctx.model.climate().warming_2024.human_induced;
    const lo = res.t_2050_range[0], hi = res.t_2050_range[1];

    dom.tickToday.style.left = thermPct(t2024) + '%';
    dom.band.style.left = thermPct(lo) + '%';
    dom.band.style.width = Math.max(0.4, thermPct(hi) - thermPct(lo)) + '%';
    dom.needle.style.left = thermPct(res.t_2050_c) + '%';
    dom.needle2100.style.left = thermPct(res.t_2100_c) + '%';

    dom.thermRead.textContent = `2050: ${f.deg(res.t_2050_c)} °C (${f.deg(lo)}–${f.deg(hi)})`;
    const off2100 = res.t_2100_c > THERM_HI ? ' ›' : '';
    dom.thermLegend.textContent = es
        ? `Hoy ${f.deg(t2024)} °C · 2100 ${f.deg(res.t_2100_c)} °C${off2100} (aguja gris) · ≈3 °C: marca del termómetro, derivada.`
        : `Today ${f.deg(t2024)} °C · 2100 ${f.deg(res.t_2100_c)} °C${off2100} (grey needle) · ≈3 °C: thermometer mark, derived.`;
}

/** The live strip that travels with the dials (phones, see liveStripHTML). */
function drawLive(res) {
    if (!dom.liveRead) return;
    const f = ctx.fmt, es = isEs();
    dom.liveRead.textContent = `${f.gt(res.cum_2025_2050_gt)} Gt · ${f.deg(res.t_2050_c)} °C`;
    if (dom.liveNeedle) dom.liveNeedle.style.left = thermPct(res.t_2050_c) + '%';
    const y15 = res.exhaustion_year_1p5, y20 = res.exhaustion_year_2p0;
    dom.liveFoot.textContent = es
        ? `1,5 °C ${y15 == null ? '—' : y15} · 2 °C ${y20 == null ? '—' : y20}`
        : `1.5 °C ${y15 == null ? '—' : y15} · 2 °C ${y20 == null ? '—' : y20}`;
}

// ---- cards -----------------------------------------------------------------

function drawCards(res) {
    const f = ctx.fmt, es = isEs();
    const prob = res.inputs.probability;
    const probTail = prob === '50%' ? '' : ` · ${probTxt(prob)}`;

    dom.cards.cum.value.textContent = `${f.gt(res.cum_2025_2050_gt)} Gt`;
    dom.cards.cum.sub.textContent = es
        ? `${f.ratio(res.share_of_rcb_1p5)}× el presupuesto de 1,5 °C · ${f.ratio(res.share_of_rcb_2p0)}× el de 2 °C${probTail}`
        : `${f.ratio(res.share_of_rcb_1p5)}× the 1.5 °C budget · ${f.ratio(res.share_of_rcb_2p0)}× the 2 °C one${probTail}`;

    // One decimal, like every other Gt figure in the section and like the
    // tooltip of 2050 ("Remaining (2 °C): +116.8 Gt"): spec §8.
    dom.cards.remaining.value.textContent =
        `${signedGt(res.remaining_2050_1p5_gt, 1)} / ${signedGt(res.remaining_2050_2p0_gt, 1)}`;
    dom.cards.remaining.sub.textContent = es
        ? `Gt para 1,5 °C / 2 °C${probTail}`
        : `Gt for 1.5 °C / 2 °C${probTail}`;
    const yrs = res.years_left_at_2050_rate_2p0;
    dom.cards.remaining.sub2.textContent = yrs == null
        ? (es ? 'El presupuesto de 2 °C ya estaría superado.' : 'The 2 °C budget would already be overshot.')
        : (es ? `${f.n(yrs, 1)} años al ritmo de 2050.` : `${f.n(yrs, 1)} years at the 2050 rate.`);

    dom.cards.exhaustion.value.textContent =
        `${f.year(res.exhaustion_year_1p5)} / ${f.year(res.exhaustion_year_2p0)}`;
    const e30 = res.exhaustion_year_3p0;
    dom.cards.exhaustion.sub.textContent = (es ? '1,5 °C / 2 °C' : '1.5 °C / 2 °C')
        + (e30 == null ? '' : ` · ≈3 °C: ${e30}`);

    dom.cards.e2050.value.textContent = f.signedChange(res.e_2050_vs_2024) + ' %';
    dom.cards.e2050.sub.textContent = es
        ? `${f.n(res.e_2050_mt, 0)} Mt en 2050 · ${f.n(res.base.E, 0)} Mt en 2024`
        : `${f.n(res.e_2050_mt, 0)} Mt in 2050 · ${f.n(res.base.E, 0)} Mt in 2024`;
}

// ============================================================================
// SOLVE PANEL
// ============================================================================

/** inverseResult() for the current State, or null when the panel is closed. */
function currentInverse() {
    const solveFor = ctx.State.get('whatifSolveFor');
    if (!solveFor) return null;
    const solving = solveFor === 'growth' ? 'g' : 'r';
    return ctx.model.inverseResult({
        fixed: solving === 'r' ? 'g' : 'r',
        value: solving === 'r' ? ctx.State.get('whatifG') : ctx.State.get('whatifR'),
        solveFor: solving,
        population: ctx.State.get('whatifPop'),
        target: ctx.State.get('whatifTarget'),
        probability: ctx.State.get('whatifProb')
    });
}

function drawSolve(inv) {
    const open = !!inv;
    dom.solveBody.hidden = !open;
    dom.solveToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    dom.solveSentence.hidden = !open;
    if (!open) {
        dom.solveOut.textContent = '';
        if (dom.solveEcho) dom.solveEcho.innerHTML = '';
        return;
    }

    const f = ctx.fmt, es = isEs();
    const horizon = parseInt(ctx.State.get('whatifHorizon'), 10) === PROJ_MID ? PROJ_MID : PROJ_END;
    dom.selUnknown.value = inv.solve_for === 'g' ? 'growth' : 'intensity';
    dom.selTarget.value = ctx.State.get('whatifTarget');
    dom.selProb.value = ctx.State.get('whatifProb');
    dom.selHorizon.value = String(horizon);

    const cell = (H) => {
        const row = inv[String(H)];
        const v = row && !row.out_of_range
            ? (inv.solve_for === 'r' ? row.r_required : row.g_required)
            : null;
        const txt = v == null
            ? (es ? 'fuera de rango' : 'out of range')
            : ((v < 0 ? f.minus : '+') + f.n(Math.abs(v) * 100, 2) + ' %');
        const lead = H === PROJ_END
            ? (es ? 'Tasas constantes hasta 2100' : 'Constant rates to 2100')
            : (es ? 'Solo hasta 2050' : 'Only to 2050');
        const strong = (H === horizon);
        return `<span data-wi-solved="${H}">${esc(lead)}: ${strong ? '<b>' : ''}${esc(txt)}${strong ? '</b>' : ''}</span>`;
    };
    dom.solveOut.innerHTML = cell(PROJ_END) + '<br>' + cell(PROJ_MID);

    const row = inv[String(horizon)];
    dom.applyBtn.disabled = !row || row.out_of_range;
    dom.applyBtn.style.opacity = dom.applyBtn.disabled ? '0.45' : '';
    const sent = solveSentence(inv, horizon);
    dom.solveSentence.innerHTML = sent;
    // The answer also belongs inside the panel: the two bare percentages above
    // are the arithmetic, not the answer, and the sentence in the scene column
    // has scrolled out of reach by the time the panel is open.
    if (dom.solveEcho) dom.solveEcho.innerHTML = sent;
}

// ============================================================================
// RENDER
// ============================================================================

function syncDials(res) {
    const g = res.inputs.g, r = res.inputs.r, pop = res.inputs.population;

    // slider ranges widen when a solved value falls outside the nominal range
    const widen = (node, v) => {
        if (!node) return;
        const pct = v * 100;
        const min = parseFloat(node.getAttribute('min')), max = parseFloat(node.getAttribute('max'));
        if (pct < min) node.min = String(Math.floor(pct * 2) / 2);
        if (pct > max) node.max = String(Math.ceil(pct * 2) / 2);
    };
    widen(dom.rangeG, g); widen(dom.rangeR, r);
    if (dom.rangeG) dom.rangeG.value = String(g * 100);
    if (dom.rangeR) dom.rangeR.value = String(r * 100);
    if (dom.numG && document.activeElement !== dom.numG) dom.numG.value = ctx.fmt.n(g * 100, 2);
    if (dom.numR && document.activeElement !== dom.numR) dom.numR.value = ctx.fmt.n(r * 100, 2);

    const onG = activePreset('growth', g), onR = activePreset('technology', r);
    ctx.dials.querySelectorAll('[data-wi-preset]').forEach(btn => {
        const [group, id] = btn.dataset.wiPreset.split(':');
        const active = (group === 'growth' ? onG : onR) === id;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    ctx.dials.querySelectorAll('[data-wi-pop]').forEach(btn => {
        const active = btn.dataset.wiPop === pop;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    dom.noteG.textContent = growthScaleNote(g);
    dom.noteR.textContent = techScaleNote(r);
    dom.notePop.textContent = popScaleNote(pop);
    if (dom.noteEgal) dom.noteEgal.textContent = egalitarianNote();
}

function render() {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;

    const res = ctx.model.aheadResult({
        g: ctx.State.get('whatifG'),
        r: ctx.State.get('whatifR'),
        population: ctx.State.get('whatifPop'),
        target: ctx.State.get('whatifTarget'),
        probability: ctx.State.get('whatifProb'),
        horizon: ctx.State.get('whatifHorizon')
    });
    lastRes = res;

    syncDials(res);
    drawCards(res);
    drawThermometer(res);
    drawLive(res);

    const main = mainSentence(res);
    dom.sentence.innerHTML = main;
    dom.tailSentence.textContent = tailSentence(res);
    if (dom.budgetNote) dom.budgetNote.textContent = budgetNote(res.inputs.probability);
    if (dom.svg) dom.svg.dataset.wiAria = dom.sentence.textContent;
    if (dom.tailKey) dom.tailKey.hidden = !tailOn();
    if (dom.tailBox) dom.tailBox.checked = tailOn();

    drawSolve(currentInverse());
    drawChart(res);

    // Perpetua draws no subscript two and an oversized degree ring; the shell
    // swaps those two glyphs for the sans face after every redraw.
    ctx.sciFix(ctx.root);
    ctx.sciFix(ctx.dials);

    if (t0) ctx.root.dataset.wiRedrawMs = (performance.now() - t0).toFixed(2);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function initAheadView(context) {
    ctx = context;
    dom = {};
    bound = [];
    lastRes = null;
    byYear = null;
    envCache = {};
    const solveFor = ctx.State.get('whatifSolveFor');
    if (solveFor) lastUnknown = solveFor;

    buildDials();
    buildScene();

    // The shell already pumps update({reason:'language'}) and {reason:'resize'};
    // the only extra work this view needs on a resize is dropping the tooltip.
    offResize = ctx.onResize(() => hideTip());
}

export function updateAheadView(info = {}) {
    if (!ctx) return;
    const reason = info && info.reason;

    if (reason === 'language') {
        // Preset labels, option texts and the generated prose all change: the
        // cheapest correct answer is to rebuild both skeletons and redraw.
        unbindAll();
        buildDials(false);
        buildScene(false);
        render();
        return;
    }

    if (reason === 'resize') {
        hideTip();
        if (lastRes) drawChart(lastRes);
        return;
    }

    render();
}

export function destroyAheadView() {
    unbindAll();
    if (offResize) { offResize(); offResize = null; }
    if (ctx) {
        if (ctx.dials) ctx.dials.innerHTML = '';
        if (ctx.root) {
            delete ctx.root.dataset.wiRedrawMs;
            ctx.root.innerHTML = '';
        }
    }
    dom = {};
    lastRes = null;
    byYear = null;
    ctx = null;
}
