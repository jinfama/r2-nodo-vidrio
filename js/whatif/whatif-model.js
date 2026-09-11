// ============================================================================
// WHATIF-MODEL - pure arithmetic for the "What if? / Y si..." section
// Growth & Earth (web_cascorro). Spec: 06_dev/docs/visores_2026-09/
// GROWTH_AND_EARTH_WHATIF_SPEC.md v0.3 (sections 3, 4, 7, 10, 11).
//
// Kaya identity E = P * y * I, constant-rate projection (Ahead), inverse
// bisection solver, historical counterfactuals (Behind) and a TCRE thermometer.
//
// This module is PURE: no DOM, no D3, no imports, no side effects, no internal
// rounding (round only when comparing or formatting). It runs unchanged in the
// browser (ES6 modules) and in Node (plain `import` of this file).
// ============================================================================

/** @typedef {Object} Series
 *  @property {string} code    Region code (WLD, GBR, CHN, EAP, ...).
 *  @property {string} name    English name.
 *  @property {string} name_es Spanish name.
 *  @property {string} level   'world' | 'region' | 'country'.
 *  @property {number} y0      First year of the aligned arrays.
 *  @property {number} y1      Last year of the aligned arrays.
 *  @property {number[]} pop     Population (persons), index = year - y0.
 *  @property {number[]} gdp_pc  GDP per person (int$ PPP, Maddison).
 *  @property {number[]} co2ff   Fossil + cement CO2 (Mt CO2).
 *  @property {number[]} ghg     Greenhouse gases (Mt CO2e).
 */

/** @typedef {Object} Point
 *  @property {number} year  Calendar year.
 *  @property {number} E_mt  Emissions that year (Mt CO2).
 *  @property {number} P     Population that year (persons).
 *  @property {number} y     GDP per person that year (int$ PPP).
 *  @property {number} I     Carbon intensity that year (Mt CO2 per $).
 */

/** @typedef {Object} Warming
 *  @property {number} c   Central warming (degC above 1850-1900).
 *  @property {number} lo  Low bound of the TCRE likely range (degC).
 *  @property {number} hi  High bound of the TCRE likely range (degC).
 */

/** Module version (independent from the data version in `meta.version`). */
export const MODEL_VERSION = '1.0.0';

/** Bisection brackets and stopping rule, spec section 3.4. */
export const SOLVER = Object.freeze({
    R_LO: -0.60,
    R_HI: 0.20,
    G_LO: -0.30,
    G_HI: 0.20,
    TOL: 1e-7,
    ITERS: 200
});

/** Tolerances of spec section 11, used by `selfTest()`. */
export const TOLERANCES = Object.freeze({
    gtRel: 0.001,      // Gt / Mt: +-0.1 % relative
    degAbs: 0.01,      // degrees C: +-0.01 absolute
    rateAbs: 0.0001,   // rates (r, g, q): +-0.0001 absolute
    ratioAbs: 0.001,   // dimensionless ratios: +-0.001 absolute
    yearsExact: true   // years: exact match (null included)
});

// ---- generic helpers (pure, data-free) -------------------------------------

/**
 * Round to `n` decimals. Only for comparison / formatting, never inside the model.
 * @param {number|null} x
 * @param {number} [n=0]
 * @returns {number|null}
 */
export function roundTo(x, n = 0) {
    if (x === null || x === undefined) return null;
    if (typeof x !== 'number' || !isFinite(x)) return x;
    const f = Math.pow(10, n);
    return Math.round(x * f) / f;
}

/**
 * Bisection on a monotonically increasing function, spec section 3.4.
 * Mirrors `solve_rate()` of build/build_whatif_data.py step by step (same order
 * of operations, same two stopping criteria) so the JSON test cases reproduce.
 * @param {function(number): number} fn  Monotone increasing objective.
 * @param {number} target                Value to reach.
 * @param {number} lo                    Lower bracket.
 * @param {number} hi                    Upper bracket.
 * @param {number} [tol=1e-7]            Stop when |fn-target| < tol or (hi-lo) < tol.
 * @param {number} [iters=200]           Maximum iterations.
 * @returns {number|null}                Solution, or null when out of bracket.
 */
export function bisect(fn, target, lo, hi, tol = SOLVER.TOL, iters = SOLVER.ITERS) {
    let flo = fn(lo) - target;
    const fhi = fn(hi) - target;
    if (flo * fhi > 0) return null;
    for (let k = 0; k < iters; k++) {
        const mid = 0.5 * (lo + hi);
        const fm = fn(mid) - target;
        if (Math.abs(fm) < tol || (hi - lo) < tol) return mid;
        if (flo * fm < 0) {
            hi = mid;
        } else {
            lo = mid;
            flo = fm;
        }
    }
    return 0.5 * (lo + hi);
}

/**
 * Cumulative emissions of a trajectory, Gt CO2 (sum of Mt, divided by 1000).
 * @param {Point[]|number[]} traj  Output of `forward()`, or plain Mt values.
 * @returns {number} Gt CO2.
 */
export function cumulativeGt(traj) {
    let s = 0;
    for (let i = 0; i < traj.length; i++) {
        s += (typeof traj[i] === 'number' ? traj[i] : traj[i].E_mt);
    }
    return s / 1000.0;
}

/**
 * First year in which the running total since the start of the trajectory
 * reaches `budgetGt`; null if it never does inside the trajectory.
 * @param {Point[]|number[]} traj
 * @param {number} budgetGt         Budget in Gt CO2.
 * @param {number} [startYear=2025] Only used when `traj` is a plain array of Mt.
 * @returns {number|null}
 */
export function exhaustionYear(traj, budgetGt, startYear = 2025) {
    let acc = 0.0;
    for (let k = 0; k < traj.length; k++) {
        const p = traj[k];
        const isNum = (typeof p === 'number');
        acc += (isNum ? p : p.E_mt) / 1000.0;
        if (acc >= budgetGt) return isNum ? startYear + k : p.year;
    }
    return null;
}

/**
 * TCRE thermometer: warming for a cumulative CO2 amount on top of `t0`.
 * @param {number} cumGt Cumulative CO2 since the reference year (Gt).
 * @param {number} t0    Warming already reached at the reference year (degC).
 * @param {{central:number,low:number,high:number}} tcre degC per 1000 Gt CO2.
 * @returns {Warming}
 */
export function warmingFrom(cumGt, t0, tcre) {
    return {
        c: t0 + tcre.central * cumGt / 1000.0,
        lo: t0 + tcre.low * cumGt / 1000.0,
        hi: t0 + tcre.high * cumGt / 1000.0
    };
}

// ---- key normalisation -----------------------------------------------------

const TARGET_ALIASES = {
    '1.5': '1.5C', '1.5c': '1.5C', '1,5': '1.5C', '1p5': '1.5C',
    '2': '2.0C', '2.0': '2.0C', '2c': '2.0C', '2.0c': '2.0C', '2p0': '2.0C',
    '3': '3.0C', '3.0': '3.0C', '3c': '3.0C', '3.0c': '3.0C', '3p0': '3.0C'
};
const PROB_ALIASES = {
    '50': '50%', '0.5': '50%',
    '67': '67%', '0.67': '67%',
    '83': '83%', '0.83': '83%'
};

/** @param {string|number} t @returns {string} Canonical target key: '1.5C'|'2.0C'|'3.0C'. */
function normTarget(t) {
    const k = String(t === undefined || t === null ? '2.0C' : t).trim();
    if (k === '1.5C' || k === '2.0C' || k === '3.0C') return k;
    return TARGET_ALIASES[k] || TARGET_ALIASES[k.toLowerCase()] || k;
}

/** @param {string|number} p @returns {string} Canonical probability key: '50%'|'67%'|'83%'. */
function normProb(p) {
    const k = String(p === undefined || p === null ? '50%' : p).trim();
    if (k === '50%' || k === '67%' || k === '83%') return k;
    return PROB_ALIASES[k] || PROB_ALIASES[k.toLowerCase()] || k;
}

// ---- the model -------------------------------------------------------------

/**
 * Build the model bound to an already loaded `data/whatif.json`.
 * Nothing is mutated: the returned object only reads from `data`.
 * @param {Object} data Parsed data/whatif.json (v0.3.0 contract, spec section 7).
 * @returns {Object} the model API.
 */
export function createModel(data) {
    if (!data || !data.series || !data.series.WLD) {
        throw new Error('whatif-model: data/whatif.json missing or malformed (no series.WLD)');
    }

    const W = data.series.WLD;
    const SERIES_Y0 = W.y0;                                    // 1750
    const SERIES_Y1 = W.y1;                                    // 2024
    const BASE_YEAR = SERIES_Y1;                               // 2024
    const PROJ_START = (data.meta && data.meta.years_proj) ? data.meta.years_proj[0] : 2025;
    const PROJ_MID = (data.meta && data.meta.years_proj) ? data.meta.years_proj[1] : 2050;
    const PROJ_END = (data.meta && data.meta.years_tail) ? data.meta.years_tail[1] : 2100;
    const CUM_FROM = 1850;                                     // cumulative accounting start (Behind)
    const TCRE = data.climate.tcre;
    const T2024 = data.climate.warming_2024.human_induced;

    /** @param {number} year @returns {number} Index into the historical arrays. */
    const idx = (year) => year - SERIES_Y0;

    /**
     * Observed carbon intensity of a series in a year (Mt CO2 per $ PPP).
     * Multiply by 1e9 for kg CO2 per $.
     * @param {Series} s
     * @param {number} year
     * @param {string} [metric='co2ff']
     * @returns {number}
     */
    function intensityOf(s, year, metric = 'co2ff') {
        const i = idx(year);
        return s[metric][i] / (s.gdp_pc[i] * s.pop[i]);
    }

    /**
     * Scaled UN population path, index 0 = 2025 (spec section 3.3; audit finding
     * F-02: the UN -> viewer scale is per variant and already applied in the JSON).
     * @param {string} [variant='medium'] 'low' | 'medium' | 'high'.
     * @returns {number[]} persons, 2025..2100.
     */
    function popPath(variant = 'medium') {
        const p = data.population_projection[variant];
        if (!p) throw new Error('whatif-model: unknown population variant "' + variant + '"');
        return p;
    }

    /**
     * World base values for 2024 (spec section 3.2).
     * @param {string} [metric='co2ff']
     * @returns {{year:number, P:number, y:number, E:number, I:number}}
     */
    function base(metric = 'co2ff') {
        const i = idx(BASE_YEAR);
        const P = W.pop[i], y = W.gdp_pc[i], E = W[metric][i];
        return { year: BASE_YEAR, P: P, y: y, E: E, I: E / (P * y) };
    }

    /**
     * Raw projection (Mt CO2), same order of operations as the reference
     * implementation: P_t * y_2024 * (1+g)^n * I_2024 * (1+r)^n.
     * @private
     */
    function projectMt(g, r, popVariant, endYear, metric) {
        const b = base(metric);
        const P = popPath(popVariant);
        const last = Math.min(endYear, PROJ_START + P.length - 1);
        const out = [];
        for (let year = PROJ_START; year <= last; year++) {
            const k = year - PROJ_START;
            const n = year - BASE_YEAR;
            out.push(P[k] * b.y * Math.pow(1 + g, n) * b.I * Math.pow(1 + r, n));
        }
        return out;
    }

    /**
     * Kaya projection with constant rates, spec section 3.3.
     * @param {number} g Annual growth of GDP per person (fraction; 0.0232 = +2.32 %/yr).
     * @param {number} r Annual change of carbon intensity (fraction; negative = improvement).
     * @param {string} [popVariant='medium'] UN variant: 'low' | 'medium' | 'high'.
     * @param {number} [endYear=2050] Last projected year (2100 max).
     * @param {string} [metric='co2ff'] 'co2ff' (pilot) or 'ghg' (reference view).
     * @returns {Point[]} one point per year, 2025..endYear.
     */
    function forward(g, r, popVariant = 'medium', endYear = PROJ_MID, metric = 'co2ff') {
        const b = base(metric);
        const P = popPath(popVariant);
        const mt = projectMt(g, r, popVariant, endYear, metric);
        const out = [];
        for (let k = 0; k < mt.length; k++) {
            const year = PROJ_START + k;
            const n = year - BASE_YEAR;
            out.push({
                year: year,
                E_mt: mt[k],
                P: P[k],
                y: b.y * Math.pow(1 + g, n),
                I: b.I * Math.pow(1 + r, n)
            });
        }
        return out;
    }

    /**
     * Remaining carbon budget from 1-1-2025 (Gt CO2), spec sections 4.1 and 4.4.
     * '3.0C' is the derived thermometer mark (section 4.4); probability ignored there.
     * @param {string|number} [target='2.0C'] '1.5C' | '2.0C' | '3.0C'.
     * @param {string|number} [probability='50%'] '50%' | '67%' | '83%'.
     * @param {string} [metric='co2ff'] 'co2ff' or 'ghg'.
     * @returns {number} Gt CO2 (Gt CO2e when metric = 'ghg').
     */
    function budgetGt(target = '2.0C', probability = '50%', metric = 'co2ff') {
        const t = normTarget(target);
        const p = normProb(probability);
        if (t === '3.0C') {
            const b3 = data.budgets.three_degrees_derived;
            return metric === 'ghg' ? b3.co2ff_gt * data.budgets.ghg_scale : b3.co2ff_gt;
        }
        const row = data.budgets.remaining_from_2025[t];
        if (!row || !row[p]) throw new Error('whatif-model: unknown budget ' + t + ' / ' + p);
        return metric === 'ghg' ? row[p].ghg_gt_co2e : row[p].co2ff_gt;
    }

    /**
     * Implied fossil total since 1850 used by the Behind mode (spec section 4.3).
     * @param {string|number} [target='2.0C']
     * @param {string|number} [probability='50%']
     * @returns {number} Gt CO2 since 1850.
     */
    function impliedTotalGt(target = '2.0C', probability = '50%') {
        const t = normTarget(target);
        if (t === '3.0C') return data.budgets.three_degrees_derived.implied_fossil_total_1850_gt;
        return data.budgets.remaining_from_2025[t][normProb(probability)].implied_fossil_total_1850_gt;
    }

    /**
     * TCRE thermometer on top of the 2024 human-induced warming (spec section 4.5).
     * @param {number} cumGt Cumulative CO2 since 2025 (Gt).
     * @returns {Warming}
     */
    function warming(cumGt) {
        return warmingFrom(cumGt, T2024, TCRE);
    }

    /** @private objective for the solvers: cumulative Gt from 2025 to `horizon`. */
    function cumFor(g, r, popVariant, horizon, metric) {
        return cumulativeGt(projectMt(g, r, popVariant, horizon, metric));
    }

    /**
     * Inverse problem, unknown = intensity rate (spec section 3.4).
     * @param {number} g Fixed growth of GDP per person.
     * @param {string} [popVariant='medium']
     * @param {number} budgetGtTarget Budget to hit exactly (Gt CO2).
     * @param {number|string} [horizon=2100] 2050 or 2100.
     * @param {string} [metric='co2ff']
     * @returns {number|null} r*, or null when the answer falls outside [-0.60, 0.20].
     */
    function solveIntensity(g, popVariant, budgetGtTarget, horizon = PROJ_END, metric = 'co2ff') {
        const H = parseInt(horizon, 10);
        return bisect((r) => cumFor(g, r, popVariant, H, metric), budgetGtTarget, SOLVER.R_LO, SOLVER.R_HI);
    }

    /**
     * Inverse problem, unknown = growth of GDP per person (spec section 3.4).
     * @param {number} r Fixed intensity rate.
     * @param {string} [popVariant='medium']
     * @param {number} budgetGtTarget Budget to hit exactly (Gt CO2).
     * @param {number|string} [horizon=2100] 2050 or 2100.
     * @param {string} [metric='co2ff']
     * @returns {number|null} g*, or null when the answer falls outside [-0.30, 0.20].
     */
    function solveGrowth(r, popVariant, budgetGtTarget, horizon = PROJ_END, metric = 'co2ff') {
        const H = parseInt(horizon, 10);
        return bisect((g) => cumFor(g, r, popVariant, H, metric), budgetGtTarget, SOLVER.G_LO, SOLVER.G_HI);
    }

    /**
     * First year of a trajectory at or below `frac` of the 2024 world emissions.
     * @param {Point[]|number[]} traj
     * @param {number} [frac=0.05]
     * @returns {number|null}
     */
    function nearZeroYear(traj, frac = 0.05) {
        const e24 = base().E;
        for (let k = 0; k < traj.length; k++) {
            const p = traj[k];
            const v = (typeof p === 'number') ? p : p.E_mt;
            if (v <= frac * e24) return (typeof p === 'number') ? PROJ_START + k : p.year;
        }
        return null;
    }

    // ---- Ahead ------------------------------------------------------------

    /**
     * Every Ahead output of spec sections 3.3 and 11.1. The canonical field names
     * are exactly those of `data/whatif.json -> test_cases[].expected`; the extra
     * keys (trajectories, base, budgets used, target-specific figures) are
     * additions for the UI and never collide with the canonical ones.
     * No value is rounded.
     * @param {Object} opts
     * @param {number} opts.g Growth of GDP per person (fraction/yr).
     * @param {number} opts.r Intensity change (fraction/yr).
     * @param {string} [opts.population='medium'] UN variant.
     * @param {string|number} [opts.target='2.0C'] Featured target.
     * @param {string|number} [opts.probability='50%'] Budget probability.
     * @param {number} [opts.horizon=2050] Horizon of the headline cumulative (2050 or 2100).
     * @returns {Object}
     */
    function aheadResult(opts) {
        const o = opts || {};
        const g = +o.g, r = +o.r;
        const pv = o.population || 'medium';
        const target = normTarget(o.target === undefined ? '2.0C' : o.target);
        const prob = normProb(o.probability === undefined ? '50%' : o.probability);
        const horizon = (o.horizon === undefined) ? PROJ_MID : parseInt(o.horizon, 10);

        const b = base();
        const traj = forward(g, r, pv, PROJ_MID);
        const traj100 = forward(g, r, pv, PROJ_END);
        const cum = cumulativeGt(traj);
        const cum100 = cumulativeGt(traj100);

        const rcb15 = budgetGt('1.5C', prob);
        const rcb20 = budgetGt('2.0C', prob);
        const rcb30 = budgetGt('3.0C', prob);
        const rcbTarget = budgetGt(target, prob);

        const w = warming(cum);
        const w100 = warming(cum100);
        const e2050 = traj[traj.length - 1].E_mt;
        const remaining20 = rcb20 - cum;
        const q = (1 + g) * (1 + r);

        // running cumulative (Gt) per year, for tooltips and the filling budget area
        const cumByYear = [];
        let acc = 0.0;
        for (let k = 0; k < traj100.length; k++) {
            acc += traj100[k].E_mt / 1000.0;
            cumByYear.push({ year: traj100[k].year, cum_gt: acc, remaining_target_gt: rcbTarget - acc });
        }

        return {
            // --- canonical fields (test_cases[].expected) ---
            e_2025_mt: traj[0].E_mt,
            e_2050_mt: e2050,
            e_2050_vs_2024: e2050 / b.E - 1,
            cum_2025_2050_gt: cum,
            remaining_2050_1p5_gt: rcb15 - cum,
            remaining_2050_2p0_gt: remaining20,
            share_of_rcb_1p5: cum / rcb15,
            share_of_rcb_2p0: cum / rcb20,
            exhaustion_year_1p5: exhaustionYear(traj100, rcb15),
            exhaustion_year_2p0: exhaustionYear(traj100, rcb20),
            exhaustion_year_3p0: exhaustionYear(traj100, rcb30),
            years_left_at_2050_rate_2p0: remaining20 <= 0 ? null : remaining20 / (e2050 / 1000.0),
            t_2050_c: w.c,
            t_2050_range: [w.lo, w.hi],
            emissions_growth_factor_q: q,
            e_2100_mt: traj100[traj100.length - 1].E_mt,
            cum_2025_2100_gt: cum100,
            near_zero_year_by_2100: nearZeroYear(traj100),
            t_2100_c: w100.c,
            t_2100_range: [w100.lo, w100.hi],
            // --- extras for the UI ---
            inputs: { g: g, r: r, population: pv, target: target, probability: prob, horizon: horizon },
            base: b,
            trajectory: traj,                                   // 2025-2050
            trajectory_tail: traj100.slice(traj.length),         // 2051-2100
            trajectory_2100: traj100,                            // 2025-2100
            cumulative_by_year: cumByYear,
            budget_1p5_gt: rcb15,
            budget_2p0_gt: rcb20,
            budget_3p0_gt: rcb30,
            budget_target_gt: rcbTarget,
            cum_horizon_gt: (horizon === PROJ_END) ? cum100 : cum,
            remaining_2050_target_gt: rcbTarget - cum,
            share_of_rcb_target: cum / rcbTarget,
            exhaustion_year_target: exhaustionYear(traj100, rcbTarget),
            t_2050: w,
            t_2100: w100,
            intensity_2050_vs_2024: Math.pow(1 + r, PROJ_MID - BASE_YEAR),
            gdp_pc_2050_vs_2024: Math.pow(1 + g, PROJ_MID - BASE_YEAR),
            pop_2050: traj[traj.length - 1].P,
            pop_2100: traj100[traj100.length - 1].P,
            never_falls: (q >= 1)                                // spec 3.3.7 / 8.1
        };
    }

    // ---- Ahead, inverse ---------------------------------------------------

    /**
     * Inverse solver for both horizons (to 2050, and constant rates to 2100),
     * spec sections 3.4 / 3.5 and 11.2. The canonical field names are those of
     * the I* test cases; each horizon hangs from the string key '2050' / '2100'.
     * @param {Object} opts
     * @param {string|number} opts.fixed Which lever is held fixed: 'g'|'growth' or
     *        'r'|'intensity'|'technology'. A number is accepted as a shorthand for
     *        the fixed value itself (then `solveFor` decides which lever is solved).
     * @param {number} [opts.value] Value of the fixed lever (fraction/yr).
     * @param {string} [opts.solveFor] 'r' or 'g'; defaults to the lever not fixed.
     * @param {string} [opts.population='medium']
     * @param {string|number} [opts.target='2.0C']
     * @param {string|number} [opts.probability='50%']
     * @param {number} [opts.targetGt] Explicit budget override (Gt).
     * @returns {Object} { solve_for, fixed, fixed_value, population, target,
     *                     probability, target_gt, horizons, '2050': {...}, '2100': {...} }
     */
    function inverseResult(opts) {
        const o = opts || {};
        let fixedLever = o.fixed;
        let value = o.value;
        if (typeof fixedLever === 'number') {          // shorthand: fixed = the value itself
            value = fixedLever;
            fixedLever = (o.solveFor === 'g') ? 'r' : 'g';
        }
        fixedLever = String(fixedLever === undefined ? 'g' : fixedLever).toLowerCase();
        if (fixedLever === 'growth' || fixedLever === 'gdp') fixedLever = 'g';
        if (fixedLever === 'intensity' || fixedLever === 'technology' || fixedLever === 'tech') fixedLever = 'r';
        const solveFor = o.solveFor ? String(o.solveFor).toLowerCase() : (fixedLever === 'g' ? 'r' : 'g');
        const fixed = +value;
        const pv = o.population || 'medium';
        const target = normTarget(o.target === undefined ? '2.0C' : o.target);
        const prob = normProb(o.probability === undefined ? '50%' : o.probability);
        const targetGt = (o.targetGt === undefined || o.targetGt === null)
            ? budgetGt(target, prob)
            : +o.targetGt;

        const out = {
            solve_for: solveFor,
            fixed: fixedLever,
            fixed_value: fixed,
            population: pv,
            target: target,
            probability: prob,
            target_gt: targetGt,
            horizons: ['2050', '2100']
        };

        // reference rate for the "N times the recent trend" clause of section 8.2
        const trendRef = (solveFor === 'r') ? presetRate('technology', 'bau') : presetRate('growth', 'recent');

        const horizons = [PROJ_MID, PROJ_END];
        for (let hi = 0; hi < horizons.length; hi++) {
            const H = horizons[hi];
            const x = (solveFor === 'r')
                ? solveIntensity(fixed, pv, targetGt, H)
                : solveGrowth(fixed, pv, targetGt, H);
            const row = {};
            if (solveFor === 'r') {
                row.r_required = x;
                row.intensity_2050_vs_2024 = (x === null) ? null : Math.pow(1 + x, PROJ_MID - BASE_YEAR);
            } else {
                row.g_required = x;
                row.gdp_pc_2050_vs_2024 = (x === null) ? null : Math.pow(1 + x, PROJ_MID - BASE_YEAR);
            }
            row.out_of_range = (x === null);
            if (x !== null) {
                const gg = (solveFor === 'r') ? fixed : x;
                const rr = (solveFor === 'r') ? x : fixed;
                const traj = forward(gg, rr, pv, PROJ_MID);
                const traj100 = forward(gg, rr, pv, PROJ_END);
                row.e_2050_mt = traj[traj.length - 1].E_mt;
                row.cum_2025_2050_gt = cumulativeGt(traj);
                row.cum_2025_2100_gt = cumulativeGt(traj100);
                row.exhaustion_year = exhaustionYear(traj100, targetGt);
                // extras for the UI
                row.g = gg;
                row.r = rr;
                row.trajectory = traj;
                row.trajectory_2100 = traj100;
                row.ratio_vs_trend = (trendRef === null || trendRef === 0) ? null : x / trendRef;
                row.t_2050_c = warming(row.cum_2025_2050_gt).c;
                row.t_2100_c = warming(row.cum_2025_2100_gt).c;
            }
            out[String(H)] = row;
        }
        return out;
    }

    // ---- Behind -----------------------------------------------------------

    /**
     * Counterfactual emissions series of `region` with the income path of
     * `reference` from `fromYear` on (spec section 3.6). Returns a copy of the
     * observed array with the years >= fromYear replaced; nothing is mutated.
     * @param {string} regionCode
     * @param {string} referenceCode
     * @param {number} fromYear
     * @param {string} [mode='rate'] 'rate' (same growth) | 'level' (same income level).
     * @param {string} [intensityMode='own'] 'own' | 'ref' | 'world'.
     * @param {string} [metric='co2ff']
     * @returns {number[]} Mt CO2, index = year - 1750.
     */
    function counterfactualSeries(regionCode, referenceCode, fromYear, mode = 'rate', intensityMode = 'own', metric = 'co2ff') {
        const R = data.series[regionCode];
        const REF = data.series[referenceCode];
        if (!R) throw new Error('whatif-model: unknown region "' + regionCode + '"');
        if (!REF) throw new Error('whatif-model: unknown reference "' + referenceCode + '"');
        const out = R[metric].slice();
        const t0 = Math.max(SERIES_Y0, Math.min(fromYear, SERIES_Y1));
        for (let year = t0; year <= SERIES_Y1; year++) {
            const i = idx(year);
            const yCf = (mode === 'rate')
                ? R.gdp_pc[idx(t0)] * REF.gdp_pc[i] / REF.gdp_pc[idx(t0)]
                : REF.gdp_pc[i];
            const src = (intensityMode === 'own') ? R : ((intensityMode === 'ref') ? REF : W);
            const inten = intensityOf(src, year, metric);
            out[i] = R.pop[i] * yCf * inten;
        }
        return out;
    }

    /**
     * Cumulative emissions of an aligned array between two years (Gt).
     * @param {number[]} vals Mt CO2, index = year - 1750.
     * @param {number} [a=1850]
     * @param {number} [b=2024]
     * @returns {number} Gt CO2.
     */
    function cumRangeGt(vals, a = CUM_FROM, b = SERIES_Y1) {
        let s = 0;
        for (let i = idx(a); i <= idx(b); i++) s += vals[i];
        return s / 1000.0;
    }

    /**
     * First year in which the running total from `start` reaches `totalGt`.
     * @param {number[]} vals Mt CO2, index = year - 1750.
     * @param {number} start
     * @param {number} totalGt
     * @returns {number|null}
     */
    function crossingYear(vals, start, totalGt) {
        let acc = 0.0;
        for (let year = start; year <= SERIES_Y1; year++) {
            acc += vals[idx(year)] / 1000.0;
            if (acc >= totalGt) return year;
        }
        return null;
    }

    /**
     * Every Behind output of spec sections 3.6 and 11.3. The canonical field names
     * are those of the B* test cases; degree ranges come out sorted ascending
     * (audit finding F-03). No value is rounded.
     * @param {Object} opts
     * @param {string} opts.region Region code to rewrite (WLD, CHN, WEU, ...).
     * @param {string} [opts.reference='GBR'] Reference path ('GBR' or 'WLD').
     * @param {number} [opts.fromYear=1850] First rewritten year.
     * @param {string} [opts.mode='rate'] 'rate' | 'level'.
     * @param {string} [opts.intensity='own'] 'own' | 'ref' | 'world'.
     * @param {string|number} [opts.probability='50%'] Probability of the implied totals.
     * @param {string} [opts.metric='co2ff']
     * @returns {Object}
     */
    function counterfactualResult(opts) {
        const o = opts || {};
        const regionCode = o.region || 'WLD';
        const referenceCode = o.reference || 'GBR';
        const t0 = (o.fromYear === undefined) ? CUM_FROM : parseInt(o.fromYear, 10);
        const mode = o.mode || 'rate';
        const intensityMode = o.intensity || 'own';
        const prob = normProb(o.probability === undefined ? '50%' : o.probability);
        const metric = o.metric || 'co2ff';

        const R = data.series[regionCode];
        const REF = data.series[referenceCode];
        if (!R) throw new Error('whatif-model: unknown region "' + regionCode + '"');
        if (!REF) throw new Error('whatif-model: unknown reference "' + referenceCode + '"');

        const cf = counterfactualSeries(regionCode, referenceCode, t0, mode, intensityMode, metric);

        const actualRegion = cumRangeGt(R[metric]);
        const cfRegion = cumRangeGt(cf);
        const delta = cfRegion - actualRegion;
        const cumWorld1850 = cumRangeGt(W[metric]);
        const cumWorldCf = cumWorld1850 + delta;              // the rest of the world is unchanged

        const worldCf = (regionCode === 'WLD')
            ? cf
            : W[metric].map((v, i) => v + (cf[i] - R[metric][i]));

        const dT = TCRE.central * delta / 1000.0;
        const dTa = TCRE.low * delta / 1000.0;
        const dTb = TCRE.high * delta / 1000.0;

        const impl15 = impliedTotalGt('1.5C', prob);
        const impl20 = impliedTotalGt('2.0C', prob);

        const gdpCf = [];
        for (let i = 0; i < R.gdp_pc.length; i++) {
            const year = SERIES_Y0 + i;
            gdpCf.push(year < t0
                ? R.gdp_pc[i]
                : ((mode === 'rate')
                    ? R.gdp_pc[idx(t0)] * REF.gdp_pc[i] / REF.gdp_pc[idx(t0)]
                    : REF.gdp_pc[i]));
        }
        const years = [];
        for (let year = SERIES_Y0; year <= SERIES_Y1; year++) years.push(year);

        return {
            // --- canonical fields (test_cases[].expected) ---
            gdp_pc_2024_actual: R.gdp_pc[idx(SERIES_Y1)],
            gdp_pc_2024_cf: gdpCf[idx(SERIES_Y1)],
            cum_region_actual_gt: actualRegion,
            cum_region_cf_gt: cfRegion,
            delta_gt: delta,
            delta_years_of_2024_world_emissions: delta / (W[metric][idx(SERIES_Y1)] / 1000.0),
            cum_world_cf_1850_2024_gt: cumWorldCf,
            e_2024_cf_mt: cf[idx(SERIES_Y1)],
            delta_t_c: dT,
            delta_t_range: (dTa <= dTb) ? [dTa, dTb] : [dTb, dTa],   // F-03: ascending
            t_2024_cf_c: T2024 + dT,
            remaining_1p5_end_2024_cf_gt: impl15 - cumWorldCf,
            remaining_2p0_end_2024_cf_gt: impl20 - cumWorldCf,
            crossing_year_1p5_cf: crossingYear(worldCf, CUM_FROM, impl15),
            crossing_year_2p0_cf: crossingYear(worldCf, CUM_FROM, impl20),
            crossing_year_1p5_actual: crossingYear(W[metric], CUM_FROM, impl15),
            crossing_year_2p0_actual: crossingYear(W[metric], CUM_FROM, impl20),
            // --- extras for the UI ---
            inputs: {
                region: regionCode, reference: referenceCode, start_year: t0,
                mode: mode, intensity: intensityMode, probability: prob, metric: metric
            },
            region: { code: R.code, name: R.name, name_es: R.name_es, level: R.level },
            reference: { code: REF.code, name: REF.name, name_es: REF.name_es, level: REF.level },
            years: years,
            series_actual_mt: R[metric].slice(),
            series_cf_mt: cf,
            gdp_pc_actual: R.gdp_pc.slice(),
            gdp_pc_cf: gdpCf,
            world_actual_mt: W[metric].slice(),
            world_cf_mt: worldCf,
            cum_world_actual_1850_2024_gt: cumWorld1850,
            implied_total_1p5_gt: impl15,
            implied_total_2p0_gt: impl20,
            t_2024_actual_c: T2024,
            t_2024_cf_range: [T2024 + Math.min(dTa, dTb), T2024 + Math.max(dTa, dTb)]
        };
    }

    // ---- convenience readers for the UI -----------------------------------

    /**
     * Rate of one preset, exactly as stored (4 decimals, audit finding F-01:
     * consume it as it comes, never re-derive it).
     * @param {string} group 'growth' | 'technology'.
     * @param {string} id    Preset id ('recent', 'bau', ...).
     * @returns {number|null}
     */
    function presetRate(group, id) {
        const list = (data.presets && data.presets[group]) || [];
        for (let i = 0; i < list.length; i++) {
            if (list[i].id === id) return (list[i].rate === undefined ? null : list[i].rate);
        }
        return null;
    }

    /**
     * Preset dials as stored in the JSON (spec section 5).
     * @param {string} [group] 'growth' | 'technology' | 'population' | 'sliders'.
     * @returns {Object|Array} the requested group, or the whole `presets` block.
     */
    function presets(group) {
        return group ? data.presets[group] : data.presets;
    }

    /**
     * Carbon budget block (spec section 4) plus two helpers.
     * @returns {Object} data.budgets extended with { get, impliedTotal }.
     */
    function budgets() {
        return Object.assign({ get: budgetGt, impliedTotal: impliedTotalGt }, data.budgets);
    }

    /**
     * Climate parameters: TCRE and the 2024 warming (spec section 4.5).
     * @returns {Object} data.climate.
     */
    function climate() {
        return data.climate;
    }

    /**
     * Region descriptors available for the Behind mode.
     * @returns {Array<Object>} { code, name, name_es, level, y0, y1, is_target, is_reference }.
     */
    function regions() {
        const cf = data.counterfactual || { targets: [], references: [] };
        return Object.keys(data.series).map((code) => {
            const s = data.series[code];
            return {
                code: s.code, name: s.name, name_es: s.name_es, level: s.level,
                y0: s.y0, y1: s.y1,
                is_target: (cf.targets || []).indexOf(code) >= 0,
                is_reference: (cf.references || []).indexOf(code) >= 0
            };
        });
    }

    /**
     * Raw historical series of a region. The arrays are the ones held by `data`:
     * treat them as read-only.
     * @param {string} [code='WLD']
     * @returns {Series}
     */
    function series(code = 'WLD') {
        const s = data.series[code];
        if (!s) throw new Error('whatif-model: unknown series "' + code + '"');
        return s;
    }

    // ---- self test (spec section 11) --------------------------------------

    /** @private number of decimals visible in the expected literal. */
    function decimalsOf(x) {
        if (typeof x !== 'number' || !isFinite(x)) return 0;
        const s = String(x);
        const dot = s.indexOf('.');
        if (dot < 0) return 0;
        return Math.min(10, s.length - dot - 1);
    }

    /**
     * @private Tolerance for one canonical field, spec section 11.
     * The stored literals are rounded (`round(x, n)` in the generator), so for the
     * families whose relative tolerance can be finer than that granularity the
     * literal's own half-unit is absorbed; degrees and rates keep the flat
     * absolute tolerance of the spec, and years must match exactly.
     * @returns {{kind:string, tol:number}}
     */
    function toleranceOf(field, expected) {
        const f = field.replace(/^.*\./, '').replace(/\[\d+\]$/, '');
        if (/^(exhaustion_year|crossing_year|near_zero_year)/.test(f)) return { kind: 'year', tol: 0 };
        const e = Math.abs(typeof expected === 'number' ? expected : 0);
        const half = 0.5 * Math.pow(10, -decimalsOf(expected));
        if (/^t_/.test(f) || /delta_t/.test(f)) return { kind: 'degC', tol: TOLERANCES.degAbs };
        if (/^(r_required|g_required|emissions_growth_factor_q)$/.test(f)) return { kind: 'rate', tol: TOLERANCES.rateAbs };
        if (/_gt$/.test(f) || /_mt$/.test(f) || /^gdp_pc_2024/.test(f)) {
            return { kind: 'gt', tol: Math.max(TOLERANCES.gtRel * e, half) };
        }
        return { kind: 'ratio', tol: Math.max(TOLERANCES.ratioAbs, TOLERANCES.gtRel * e, half) };
    }

    /** @private compare one expected value (recursively) against the model output. */
    function compareValue(path, expected, got, failures) {
        if (Array.isArray(expected)) {
            for (let i = 0; i < expected.length; i++) {
                compareValue(path + '[' + i + ']', expected[i],
                    Array.isArray(got) ? got[i] : undefined, failures);
            }
            return;
        }
        if (expected !== null && typeof expected === 'object') {
            const keys = Object.keys(expected);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                compareValue(path + '.' + k, expected[k],
                    (got === undefined || got === null) ? undefined : got[k], failures);
            }
            return;
        }
        const rule = toleranceOf(path, expected);
        if (rule.kind === 'year' || expected === null || got === null || got === undefined) {
            const ok = (expected === null && (got === null || got === undefined))
                || (expected !== null && got !== null && got !== undefined && Math.round(got) === expected);
            if (!ok) {
                failures.push({
                    field: path, expected: expected, got: (got === undefined ? null : got),
                    rounded: (got === undefined ? null : got), diff: null, tol: 0, rel: null, rule: 'exact'
                });
            }
            return;
        }
        if (typeof got !== 'number' || !isFinite(got)) {
            failures.push({ field: path, expected: expected, got: got, rounded: got, diff: null, tol: 0, rel: null, rule: 'type' });
            return;
        }
        const diff = Math.abs(got - expected);          // raw output, never rounded first
        if (diff > rule.tol) {
            failures.push({
                field: path, expected: expected, got: got,
                rounded: roundTo(got, decimalsOf(expected)),
                diff: diff, tol: rule.tol,
                rel: (expected === 0 ? null : diff / Math.abs(expected)),
                rule: rule.kind
            });
        }
    }

    /**
     * Run the 33 cases stored in `data.test_cases` with the tolerances of spec
     * section 11 (Gt +-0.1 %, degC +-0.01, rates +-0.0001, years exact).
     * @returns {{total:number, passed:number, failures:Array, cases:Array}}
     */
    function selfTest() {
        const cases = [];
        let passed = 0;
        const list = data.test_cases || [];
        for (let n = 0; n < list.length; n++) {
            const tc = list[n];
            const inp = tc.inputs || {};
            let got;
            try {
                if (tc.mode === 'ahead') {
                    got = aheadResult({ g: inp.g, r: inp.r, population: inp.population, probability: '50%' });
                } else if (tc.mode === 'ahead_inverse') {
                    got = inverseResult({
                        fixed: (inp.solve_for === 'r') ? 'g' : 'r',
                        value: inp.fixed,
                        solveFor: inp.solve_for,
                        population: inp.population,
                        target: inp.target,
                        probability: inp.prob,
                        targetGt: inp.target_gt
                    });
                } else if (tc.mode === 'behind') {
                    got = counterfactualResult({
                        region: inp.region, reference: inp.reference, fromYear: inp.start_year,
                        mode: inp.mode, intensity: inp.intensity
                    });
                } else {
                    throw new Error('unknown test-case mode "' + tc.mode + '"');
                }
            } catch (err) {
                cases.push({
                    id: tc.id, mode: tc.mode, label: tc.label, ok: false,
                    failures: [{
                        field: '(exception)', expected: null,
                        got: String((err && err.message) || err), rounded: null,
                        diff: null, tol: 0, rel: null, rule: 'error'
                    }]
                });
                continue;
            }
            const failures = [];
            const keys = Object.keys(tc.expected);
            for (let i = 0; i < keys.length; i++) {
                compareValue(keys[i], tc.expected[keys[i]], got[keys[i]], failures);
            }
            const ok = (failures.length === 0);
            if (ok) passed++;
            cases.push({ id: tc.id, mode: tc.mode, label: tc.label, ok: ok, failures: failures });
        }
        const flat = [];
        for (let i = 0; i < cases.length; i++) {
            for (let j = 0; j < cases[i].failures.length; j++) {
                flat.push(Object.assign({ id: cases[i].id }, cases[i].failures[j]));
            }
        }
        return { total: cases.length, passed: passed, failures: flat, cases: cases };
    }

    // ---- public API -------------------------------------------------------

    return {
        version: MODEL_VERSION,
        data: data,
        meta: data.meta,
        units: data.units,
        // base arithmetic
        base: base,
        forward: forward,
        cumulativeGt: cumulativeGt,
        exhaustionYear: exhaustionYear,
        nearZeroYear: nearZeroYear,
        warming: warming,
        intensityOf: intensityOf,
        popPath: popPath,
        // inverse solvers
        solveIntensity: solveIntensity,
        solveGrowth: solveGrowth,
        // high-level results
        aheadResult: aheadResult,
        inverseResult: inverseResult,
        counterfactualResult: counterfactualResult,
        counterfactualSeries: counterfactualSeries,
        cumRangeGt: cumRangeGt,
        crossingYear: crossingYear,
        // readers
        presets: presets,
        presetRate: presetRate,
        budgets: budgets,
        budgetGt: budgetGt,
        impliedTotalGt: impliedTotalGt,
        climate: climate,
        regions: regions,
        series: series,
        years: {
            historyFrom: SERIES_Y0, historyTo: SERIES_Y1, base: BASE_YEAR,
            projFrom: PROJ_START, projTo: PROJ_MID, tailTo: PROJ_END, cumFrom: CUM_FROM
        },
        // QA
        selfTest: selfTest
    };
}

export default createModel;
