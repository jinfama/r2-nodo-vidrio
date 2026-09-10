// ============================================================================
// UTILITIES - Formatters, color scales, calculations, constants
// ============================================================================

// The interface face, read once from the chrome token so canvas text (PNG
// export, label measuring) matches the CSS: Gill Sans, or Cabin in its place.
export const UI_FONT = (typeof getComputedStyle === 'function' && (getComputedStyle(document.documentElement).getPropertyValue('--ff') || '').trim()) || 'Cabin, sans-serif';

export const COLORS = {
    primary: '#1e6091',
    accent: '#e63946',
    dark: '#212529',
    gray: '#495057',
    // #adb5bd stays: it is a DATA colour (the World reference series, the
    // current-year rule, the unselected trajectories, the gridlines).
    lightGray: '#adb5bd',
    // Chrome text — axis titles, chart footers, empty-state messages. The
    // explorer's own --cg secondary ink (Growth & Earth, 2026-09-10: warm
    // grey-black on Gill cream), 7.7:1 on --bg, 7.0:1 on --bgl.
    uiText: '#4d443c',
    border: '#e0e0e0',
    bg: '#ffffff',
    bgLight: '#f8f9fa',
    success: '#28a745',
    warning: '#fd7e14',
    emissions: '#e63946',
    gdp: '#1e6091',
    hdi: '#2a9d8f',
    mfa: '#cc8b00'
};

// Chrome ink for a label written ON a data colour (the composition treemap).
// The tile colour is the data encoding and is never touched here; what this
// picks is the ink laid over it, so a pale tile gets sea ink and a dark tile
// gets paper. Returns the shadow too, always the opposite of the ink, so the
// glyph keeps an edge on a busy tile.
export function labelInkOn(bg) {
    const s = String(bg || '').trim();
    let r = 0, g = 0, b = 0, ok = false;
    const hex = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16);
        r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; ok = true;
    } else {
        const p = s.match(/[\d.]+/g);
        if (p && p.length >= 3) { r = +p[0]; g = +p[1]; b = +p[2]; ok = true; }
    }
    if (!ok) return { ink: '#ffffff', shadow: '0 1px 3px rgba(0,0,0,.5)' };
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // #1f1b18 is the chrome's deep ink (--sea2 since 2026-09-10; it was the
    // cover's sea #0a2136, 4.29:1 on the palest tiles for --sea). Its relative
    // luminance is 0.0115, a shade darker than the sea's 0.0142, so every tile
    // that cleared AA before still does. 0.0615 is that luminance plus 0.05.
    const onPaper = 1.05 / (L + 0.05);          // white ink over this tile
    const onSea   = (L + 0.05) / 0.0615;        // #1f1b18 ink over this tile
    return onSea > onPaper
        ? { ink: '#1f1b18', shadow: '0 1px 2px rgba(255,255,255,.65)' }
        : { ink: '#ffffff', shadow: '0 1px 3px rgba(0,0,0,.5)' };
}

export const COMPARISON_PALETTE = [
    '#1e6091', '#e63946', '#2a9d8f', '#e9c46a', '#264653',
    '#f4a261', '#6a4c93', '#1982c4', '#8ac926', '#ff595e'
];

// The same ten series, at the lightness a NAME can be written in. The palette
// above is a line palette: seven of its ten colours are between 1.4:1 and
// 3.6:1 on this paper, and the viewer writes the country's own name in its
// series colour in three places (trend end-labels, ranking end-labels,
// correlation bubbles) - so those names were unreadable. Hue is kept, so a
// label still points at its line; only lightness and chroma move, and each
// entry clears 4.5:1 over BOTH papers (--bg #f1e6c8 and --bgl #e8dcbd since
// 2026-09-10; the four that fell just under on the darker cream were walked
// down in HLS, hue and saturation kept).
// Measured min pairwise dE76 across the ten: 7.8 normal, 6.4 deuteranopia,
// 7.6 protanopia - against 9.5 / 1.8 / 9.4 for the line palette, i.e. the ink
// separates a little less under normal vision and far better without green.
// Use it ONLY for text on paper. Lines, dots, chips and tiles keep the palette,
// and text inside the dark tooltip keeps its own colours.
export const COMPARISON_INK = [
    '#105989', '#a6001b', '#006e63', '#5f4800', '#466672',
    '#925012', '#3b2264', '#00659d', '#023c00', '#bf1931'
];

// Palette colour -> its ink. Anything that is not a palette colour (the grey
// reference series, a component tile) is returned untouched.
export function inkFor(color) {
    const i = COMPARISON_PALETTE.indexOf(String(color).toLowerCase());
    return i >= 0 ? COMPARISON_INK[i] : color;
}

export const INDICATOR_LABELS = {
    ghg: 'GHG emissions (total)',
    ghg_pc: 'GHG per capita',
    co2ff: 'CO\u2082 fossil fuel',
    co2ff_pc: 'CO\u2082 fossil per capita',
    co2luc: 'CO\u2082 land use change',
    co2luc_pc: 'CO\u2082 land use per capita',
    ch4: 'CH\u2084 methane',
    ch4_pc: 'CH\u2084 per capita',
    n2o: 'N\u2082O nitrous oxide',
    n2o_pc: 'N\u2082O per capita',
    fgas: 'Fluorinated gases',
    fgas_pc: 'F-gases per capita',
    coal: 'Coal',
    coal_pc: 'Coal per capita',
    oil: 'Oil',
    oil_pc: 'Oil per capita',
    gas: 'Natural gas',
    gas_pc: 'Natural gas per capita',
    ff: 'Total fossil',
    ff_pc: 'Total fossil per capita',
    land: 'Total land',
    land_pc: 'Total land per capita',
    gdp_pc: 'GDP per capita',
    gdp_total: 'GDP (total)',
    hdi: 'Human Development Index',
    hdi_ng: 'AHDI (Prados)',
    pop: 'Population',
    pop_density: 'Population density',
    pat: 'Tapio pattern',
    cum_d: 'Cumulative decoupling',
    cum_r: 'Cumulative recession',
    // MFA - Material Flow Analysis
    mfa_ext_tot: 'Material extraction (total)',
    mfa_con_tot: 'Material consumption (total)',
    mfa_imp_tot: 'Material imports (total)',
    mfa_exp_tot: 'Material exports (total)',
    mfa_bal_tot: 'Physical trade balance (total)',
    mfa_mf_tot: 'Material footprint (total)',
    mfa_ext_pc: 'Material extraction per capita',
    mfa_con_pc: 'Material consumption per capita',
    mfa_imp_pc: 'Material imports per capita',
    mfa_exp_pc: 'Material exports per capita',
    mfa_bal_pc: 'Physical trade balance per capita',
    mfa_mf_pc: 'Material footprint per capita',
    mfa_ext_bio: 'Biomass extraction',
    mfa_ext_ff: 'Fossil fuels extraction',
    mfa_ext_met: 'Metal ores extraction',
    mfa_ext_min: 'Non-metallic minerals extraction',
    mfa_con_bio: 'Biomass consumption',
    mfa_con_ff: 'Fossil fuels consumption',
    mfa_con_met: 'Metal ores consumption',
    mfa_con_min: 'Non-metallic minerals consumption',
    mfa_imp_bio: 'Biomass imports',
    mfa_imp_ff: 'Fossil fuels imports',
    mfa_imp_met: 'Metal ores imports',
    mfa_imp_min: 'Non-metallic minerals imports',
    mfa_exp_bio: 'Biomass exports',
    mfa_exp_ff: 'Fossil fuels exports',
    mfa_exp_met: 'Metal ores exports',
    mfa_exp_min: 'Non-metallic minerals exports',
    mfa_bal_bio: 'Biomass trade balance',
    mfa_bal_ff: 'Fossil fuels trade balance',
    mfa_bal_met: 'Metal ores trade balance',
    mfa_bal_min: 'Non-metallic minerals trade balance',
    mfa_mf_bio: 'Biomass footprint',
    mfa_mf_ff: 'Fossil fuels footprint',
    mfa_mf_met: 'Metal ores footprint',
    mfa_mf_min: 'Non-metallic minerals footprint',
    // Crops / Land Use
    crop_cropland: 'Cropland',
    crop_arable: 'Arable land',
    crop_permanent: 'Permanent crops',
    crop_pastures: 'Permanent pastures',
    crop_total: 'Agricultural area (total)',
    crop_total_pc: 'Agricultural area per capita',
    // Biodiversity
    rli: 'Red List Index'
};

export const INDICATOR_UNITS = {
    ghg: 'Mt CO\u2082e',
    ghg_pc: 't CO\u2082e/person',
    co2ff: 'Mt CO\u2082e',
    co2ff_pc: 't CO\u2082e/person',
    co2luc: 'Mt CO\u2082e',
    co2luc_pc: 't CO\u2082e/person',
    ch4: 'Mt CO\u2082e',
    ch4_pc: 't CO\u2082e/person',
    n2o: 'Mt CO\u2082e',
    n2o_pc: 't CO\u2082e/person',
    fgas: 'Mt CO\u2082e',
    fgas_pc: 't CO\u2082e/person',
    coal: 'Mt CO\u2082e',
    coal_pc: 't CO\u2082e/person',
    oil: 'Mt CO\u2082e',
    oil_pc: 't CO\u2082e/person',
    gas: 'Mt CO\u2082e',
    gas_pc: 't CO\u2082e/person',
    ff: 'Mt CO\u2082e',
    ff_pc: 't CO\u2082e/person',
    land: 'Mt CO\u2082e',
    land_pc: 't CO\u2082e/person',
    gdp_pc: '1990 Int$ PPP',
    gdp_total: 'M Int$ PPP',
    hdi: 'Index (0\u20131)',
    hdi_ng: 'Index (0\u20131)',
    pop: 'Millions',
    pop_density: 'persons/km\u00B2',
    pat: 'Category',
    cum_d: 'Mt CO\u2082e',
    cum_r: 'Mt CO\u2082e',
    // MFA
    mfa_ext_tot: 'Mt', mfa_con_tot: 'Mt', mfa_imp_tot: 'Mt', mfa_exp_tot: 'Mt', mfa_bal_tot: 'Mt', mfa_mf_tot: 'Mt',
    mfa_ext_pc: 't/person', mfa_con_pc: 't/person', mfa_imp_pc: 't/person', mfa_exp_pc: 't/person', mfa_bal_pc: 't/person', mfa_mf_pc: 't/person',
    mfa_ext_bio: 'Mt', mfa_ext_ff: 'Mt', mfa_ext_met: 'Mt', mfa_ext_min: 'Mt',
    mfa_con_bio: 'Mt', mfa_con_ff: 'Mt', mfa_con_met: 'Mt', mfa_con_min: 'Mt',
    mfa_imp_bio: 'Mt', mfa_imp_ff: 'Mt', mfa_imp_met: 'Mt', mfa_imp_min: 'Mt',
    mfa_exp_bio: 'Mt', mfa_exp_ff: 'Mt', mfa_exp_met: 'Mt', mfa_exp_min: 'Mt',
    mfa_bal_bio: 'Mt', mfa_bal_ff: 'Mt', mfa_bal_met: 'Mt', mfa_bal_min: 'Mt',
    mfa_mf_bio: 'Mt', mfa_mf_ff: 'Mt', mfa_mf_met: 'Mt', mfa_mf_min: 'Mt',
    // Crops / Land Use
    crop_cropland: 'Mha', crop_arable: 'Mha', crop_permanent: 'Mha',
    crop_pastures: 'Mha', crop_total: 'Mha', crop_total_pc: 'ha/person',
    // Biodiversity
    rli: 'Index (0\u20131)'
};

// Resolve the effective indicator field from a base indicator + perCapita toggle + gasType
// Note: State is not imported here to avoid circular deps; callers pass needed values or
// we use the optional stateGetter parameter for fields that require state access.
export function getEffectiveIndicator(base, perCapita, gasType, stateGetter) {
    const _get = stateGetter || ((key) => {
        // Fallback: try global State if available (standalone build)
        try { return State.get(key); } catch(e) { return null; }
    });
    if (base === 'ghg') {
        const gas = gasType || 'total';
        if (gas === 'total') return perCapita ? 'ghg_pc' : 'ghg';
        return perCapita ? gas + '_pc' : gas;
    }
    if (base === 'co2ff') return perCapita ? 'co2ff_pc' : 'co2ff';
    if (base === 'gdp') return perCapita ? 'gdp_pc' : 'gdp_total';
    if (base === 'mfa') {
        const flow = _get('mfaFlow') || 'ext';
        return perCapita ? `mfa_${flow}_pc` : `mfa_${flow}_tot`;
    }
    if (base === 'crops') return perCapita ? 'crop_total_pc' : 'crop_total';
    if (base === 'bio') return 'rli';
    if (base === 'pop') {
        const popType = _get('popType');
        return popType === 'density' ? 'pop_density' : 'pop';
    }
    return base;
}

// MFA flow labels for UI
export const MFA_FLOW_LABELS = {
    ext: 'Extraction', con: 'Consumption',
    imp: 'Imports', exp: 'Exports', bal: 'Physical trade balance', mf: 'Material footprint'
};

// MFA material component definitions (for decomposition charts)
export const MFA_MATERIAL_KEYS = ['bio', 'ff', 'met', 'min'];
export const MFA_MATERIAL_LABELS = {
    bio: 'Biomass', ff: 'Fossil fuels', met: 'Metal ores', min: 'Non-metallic minerals'
};
export const MFA_MATERIAL_COLORS = {
    bio: '#e07b39', ff: '#2d2d2d', met: '#5b7fa5', min: '#c9b458'
};

// Crops / Land Use component definitions (for decomposition charts)
export const CROPS_COMPONENT_KEYS = ['crop_cropland', 'crop_arable', 'crop_permanent', 'crop_pastures'];
export const CROPS_COMPONENT_LABELS = {
    crop_cropland: 'Cropland', crop_arable: 'Arable land',
    crop_permanent: 'Permanent crops', crop_pastures: 'Permanent pastures'
};
export const CROPS_COMPONENT_COLORS = {
    crop_cropland: '#a8d08d', crop_arable: '#6b8e23',
    crop_permanent: '#228b22', crop_pastures: '#d2b48c'
};

// Fields that support per-capita (_pc) computation via division by pop
const PC_FIELDS = new Set(['co2ff', 'co2luc', 'ch4', 'n2o', 'fgas', 'coal', 'oil', 'gas', 'ff', 'land']);

// Read an indicator value from a data record, including computed fields
export function resolveIndicatorValue(val, indicator) {
    if (!val) return null;
    if (indicator === 'gdp_total') {
        return (val.gdp_pc != null && val.pop != null) ? val.gdp_pc * val.pop : null;
    }
    if (indicator === 'mfa_bal_tot') {
        return (val.mfa_imp_tot != null && val.mfa_exp_tot != null) ? val.mfa_imp_tot - val.mfa_exp_tot : null;
    }
    if (indicator === 'mfa_bal_pc') {
        return (val.mfa_imp_tot != null && val.mfa_exp_tot != null && val.pop > 0)
            ? (val.mfa_imp_tot - val.mfa_exp_tot) / val.pop : null;
    }
    const mfaBalanceMatch = indicator.match(/^mfa_bal_(bio|ff|met|min)$/);
    if (mfaBalanceMatch) {
        const mat = mfaBalanceMatch[1];
        const imp = val[`mfa_imp_${mat}`];
        const exp = val[`mfa_exp_${mat}`];
        return (imp != null && exp != null) ? imp - exp : null;
    }
    // Handle _pc variants: strip suffix, divide by pop
    if (indicator.endsWith('_pc')) {
        const base = indicator.slice(0, -3);
        if (PC_FIELDS.has(base)) {
            return (val[base] != null && val.pop > 0) ? val[base] / val.pop : null;
        }
    }
    return val[indicator] != null ? val[indicator] : null;
}

// Short display names for countries with excessively long official names
export const SHORT_NAMES = {
    'GBR': 'United Kingdom',
    'USA': 'United States',
    'PRK': 'North Korea',
    'KOR': 'South Korea',
    'VEN': 'Venezuela',
    'BOL': 'Bolivia',
    'COD': 'DR Congo',
    'COG': 'Congo',
    'FSM': 'Micronesia',
    'LAO': 'Laos',
    'VCT': 'St Vincent & Grenadines',
    'NLD': 'Netherlands',
    'VIR': 'US Virgin Islands',
    'TZA': 'Tanzania',
    'IRN': 'Iran',
    'MAF': 'Saint Martin',
    'CAF': 'Central African Rep.',
    'BIH': 'Bosnia & Herzegovina',
    'KNA': 'St Kitts & Nevis',
    'STP': 'São Tomé & Príncipe',
    'ARE': 'UAE',
    'SYR': 'Syria',
    'MKD': 'North Macedonia',
    'CIV': "Côte d'Ivoire",
    'TWN': 'Taiwan',
    'PSE': 'Palestine',
    'MDA': 'Moldova',
    'RUS': 'Russia',
    'BRN': 'Brunei',
    'SWZ': 'Eswatini'
};

export function shortName(iso3, fullName) {
    return SHORT_NAMES[iso3] || fullName || iso3;
}

// Number formatting
export function formatValue(value, indicator) {
    if (value == null || isNaN(value)) return '\u2014';
    if (indicator === 'hdi' || indicator === 'hdi_ng') return value.toFixed(3);
    if (indicator === 'pop') {
        if (value >= 1000) return (value / 1000).toFixed(1) + 'B';
        if (value >= 1) return value.toFixed(1) + 'M';
        if (value >= 0.001) return (value * 1000).toFixed(0) + 'K';
        return value.toFixed(2) + 'M';
    }
    if (indicator === 'pop_density') {
        if (value >= 1000) return d3.format(',')(Math.round(value)) + '/km\u00B2';
        if (value >= 1) return value.toFixed(1) + '/km\u00B2';
        return value.toFixed(2) + '/km\u00B2';
    }
    if (indicator === 'gdp_pc') return formatGDP(value);
    if (indicator === 'gdp_total') return formatGDPTotal(value);
    if (indicator === 'ghg' || indicator === 'co2ff' || indicator === 'co2luc' || indicator === 'ch4' || indicator === 'n2o' || indicator === 'fgas' || indicator === 'coal' || indicator === 'oil' || indicator === 'gas' || indicator === 'ff' || indicator === 'land') return formatEmissions(value);
    if (indicator.endsWith('_pc') && (indicator.startsWith('ghg') || indicator.startsWith('co2') || indicator.startsWith('ch4') || indicator.startsWith('n2o') || indicator.startsWith('fgas') || indicator.startsWith('coal') || indicator.startsWith('oil') || indicator.startsWith('gas') || indicator.startsWith('ff') || indicator.startsWith('land'))) {
        const sign = value < 0 ? '\u2212' : '';
        return sign + Math.abs(value).toFixed(1) + ' t CO\u2082e';
    }
    if (indicator === 'cum_d' || indicator === 'cum_r') return formatEmissions(value);
    if (indicator === 'pat') return String(value);
    // MFA indicators
    if (indicator.startsWith('mfa_')) {
        if (indicator.endsWith('_pc')) return value.toFixed(1) + ' t/person';
        return formatMFA(value);
    }
    // Crops / Land Use
    if (indicator.startsWith('crop_')) {
        if (indicator === 'crop_total_pc') return value.toFixed(2) + ' ha/person';
        return formatCrops(value);
    }
    // Biodiversity
    if (indicator === 'rli') return value.toFixed(3);
    return d3.format(',')(Math.round(value));
}

export function formatGDP(value) {
    if (value == null || isNaN(value)) return '\u2014';
    if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e3) return '$' + d3.format(',')(Math.round(value));
    return '$' + Math.round(value);
}

export function formatGDPCompact(value) {
    if (value == null || isNaN(value)) return '\u2014';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e4) return (value / 1e3).toFixed(1) + 'K';
    return d3.format(',')(Math.round(value));
}

export function formatGDPTotal(valueMil) {
    if (valueMil == null || isNaN(valueMil)) return '\u2014';
    if (valueMil >= 1e6) return '$' + (valueMil / 1e6).toFixed(1) + 'T';
    if (valueMil >= 1e3) return '$' + (valueMil / 1e3).toFixed(1) + 'B';
    return '$' + Math.round(valueMil) + 'M';
}

export function formatEmissions(value) {
    if (value == null || isNaN(value)) return '\u2014';
    // Handle negative values (e.g. CO2 land use change = carbon sink)
    if (value < 0) return '\u2212' + formatEmissions(-value).replace(/^\u2212/, '');
    if (value >= 1e3) return (value / 1e3).toFixed(1) + ' Gt CO\u2082e';
    if (value >= 1) return value.toFixed(1) + ' Mt CO\u2082e';
    if (value >= 0.001) return (value * 1e3).toFixed(0) + ' kt CO\u2082e';
    return value.toFixed(3) + ' Mt CO\u2082e';
}

export function formatMFA(value) {
    if (value == null || isNaN(value)) return '\u2014';
    if (value < 0) return '\u2212' + formatMFA(-value);
    if (value >= 1e3) return (value / 1e3).toFixed(1) + ' Gt';
    if (value >= 1) return value.toFixed(1) + ' Mt';
    if (value >= 0.001) return (value * 1e3).toFixed(0) + ' kt';
    return value.toFixed(3) + ' Mt';
}

export function formatCrops(value) {
    if (value == null || isNaN(value)) return '\u2014';
    if (value >= 1000) return (value / 1000).toFixed(1) + ' Gha';
    if (value >= 1) return value.toFixed(1) + ' Mha';
    if (value >= 0.001) return (value * 1000).toFixed(0) + ' kha';
    return value.toFixed(3) + ' Mha';
}

export function formatRatio(value) {
    if (value == null || isNaN(value)) return '\u2014';
    return value.toFixed(2) + 'x';
}

export function formatPercent(value) {
    if (value == null || isNaN(value)) return '\u2014';
    const sign = value >= 0 ? '+' : '';
    return sign + (value * 100).toFixed(1) + '%';
}

// Width of a run of text in CSS px, for margins that have to fit a label
// (end labels on trend and ranking are clipped on phones otherwise).
let _measureCtx = null;
export function textWidthPx(text, font) {
    if (!_measureCtx) {
        const c = document.createElement('canvas');
        _measureCtx = c.getContext('2d');
    }
    if (!_measureCtx) return String(text).length * 6;
    _measureCtx.font = font || `500 10px ${UI_FONT}`;
    return _measureCtx.measureText(String(text)).width;
}

export function formatRank(rank, total) {
    return `${rank}/${total}`;
}

// ============================================================================
// MAP COLOUR MODEL - choropleth and globe share it (revised 2026-09-06)
// ----------------------------------------------------------------------------
// Every ramp is a list of anchors interpolated in CIELAB, so lightness falls on
// an even ladder from end to end. The scales this replaced were d3 sequential
// interpolators pushed through stretchScale(): they trimmed the pale end and
// left the dark end alone, and above t~0.7 a ColorBrewer sequential barely
// changes lightness, so the whole upper range of every indicator arrived as one
// tone. Measured on real country-years, the mean number of tones a reader can
// separate (dE76 >= 5) went from 17.2 to 20.2 across 40 indicators, and the
// number of countries crushed into the palest tone from 17.5 to 6.8.
//
// The ends belong to the cover (07_temp/portadas_visores_2026-09/estelas/
// V5_wakes-in-the-sea.html): cream at the pale end, sea #0E2C48 or a warm ink
// at the dark end. The middle carries the hue travel, because a ramp confined
// to the cover's ice-to-navy is perceptually short and loses steps. Family and
// discrimination were in conflict there and discrimination won; see CLAUDE.md.
// ============================================================================

// Nine anchors per family, pale to dark. Do not hand-edit a single value:
// the ladder was fitted, and the tables in CLAUDE.md are measured against it.
//
// V7 (2026-09-08): the author asked for the interior palettes to follow the
// cover, so every family now starts at the cover's cream (#EFE4CC) and ends in
// the cover's sea (#0E2C48) or in the oxblood the cover's vermilion (#C4502F)
// darkens into; the mid-tones are the cover's ice, line2 and vermilion. Built
// in CIELCh with an even L* ladder (C:/Work/scratch/ephemeral/visores_2026-09/
// portadas_v7/estelas/ramps_v7.py) and measured on the real data: 16.9 tones
// separable on average (15.4 deutan, 14.9 protan), never fewer than 10, against
// 20.3/17.7/17.5 for the 2026-09-06 ramps. Fewer steps, one family: that trade
// was asked for. No tone comes within dE76 13 of no-data or 9.6 of zero.
//
// V7b (2026-09-09): ember rebuilt. The V7 ember spent its upper three anchors
// on three dark reds, and on co2ff_pc's [0.02, 50] domain the whole of Europe
// (3.5-9.2 t) fell into 9 % of the bar: one dark red, and Africa two oranges.
// Now eight anchors at NON-uniform stops (MAP_RAMP_STOPS.ember) that, on the
// new co2ff_pc domain [0.1, 50], sit at 0.1 / 0.5 / 1 / 3 / 6 / 10 / 20 / 50 t:
// sand, light ochre, ochre, amber, vermilion (the cover's), oxblood, plum, ink.
// Measured (C:/Work/scratch/ephemeral/visores_2026-09/portadas_v7/estelas/
// retoque/ramp_ember_v7b.py, CIEDE2000 >= 6 on the countries actually painted):
// adjacent anchors dE00 >= 7.3 in normal, deutan and protan vision; co2ff_pc
// 2024 9 -> 14 tones (deutan 9 -> 13, protan 9 -> 13), 1950 12 -> 13; Europe
// 2024 2 -> 4 tones, France vs Germany dE00 5.7 -> 13.3; the other 17 emission
// indicators all improve (mean 11.9 / 10.6 / 10.8 -> 14.2 / 12.5 / 12.5).
// No-data stays >= dE00 15.6 from the ramp, zero >= 9.2. The other families
// were not touched.
export const MAP_RAMPS = {
    // emissions - sand, ochre, amber, vermilion, oxblood, plum, ink (V7b)
    ember:  ['#f7ead0', '#ecc68d', '#e7a660', '#df773f', '#c64d38', '#9d363a', '#692b3e', '#1d2039'],
    // economy (default) - cream, ice, line2, sea
    depth:  ['#f4e7cd', '#c4dcca', '#a5cbce', '#83b5c4', '#659db6', '#4685a3', '#276687', '#044667', '#00263e'],
    // land use and biodiversity - cream, petrol slate, deep sea
    moss:   ['#f2e7cd', '#c9dbc1', '#a2ccc2', '#7bb4af', '#519ca0', '#33828b', '#106877', '#004858', '#002a38'],
    // human development - cream, gold, bronze, umber
    bronze: ['#f5e7c6', '#eed39d', '#e9bd76', '#dba35f', '#cd8a4a', '#b6703f', '#9f5834', '#6f3b26', '#422117'],
    // material flows - ice, steel blue, indigo ink
    ink:    ['#cbe8ed', '#a6d5e3', '#81c2dc', '#5ea9ce', '#3991c1', '#2875a7', '#185b8e', '#123e6a', '#082347'],
    // population - cream, mauve, violet, night (the one hue the cover lacks;
    // kept bluish so it stays clear of the no-data grey under dichromacy)
    ameth:  ['#fbe0d4', '#f3c9ca', '#e1b5cb', '#c99abe', '#ad82b4', '#8a6da2', '#655990', '#3c3d69', '#162244'],
    // signed: sink (sea) - zero - source (vermilion). The centre is a stone,
    // not the paper: a country sitting on zero has to be visible against the sea.
    tide:   ['#00263e', '#044667', '#276687', '#4685a3', '#659db6', '#83b5c4', '#a5cbce', '#c4dcca', '#e4d5bd',
             '#efce9c', '#eab677', '#e59755', '#df7840', '#c64e38', '#8f333b', '#59293d', '#1d2039']
};

// Where each anchor of a ramp sits on t (0-1). Only ember is non-uniform - its
// stops are the log positions of 0.1 / 0.5 / 1 / 3 / 6 / 10 / 20 / 50 t on the
// co2ff_pc domain, so the decade where Europe, China and North America live
// gets three steps instead of one. Every other family is read at even steps.
// A family listed here must have exactly as many stops as anchors.
export const MAP_RAMP_STOPS = {
    ember: [0.0000, 0.2590, 0.3705, 0.5473, 0.6588, 0.7410, 0.8526, 1.0000]
};

// Two categories that are not values. Both were measured against every tone of
// every ramp they can appear over, under normal vision, deuteranopia and
// protanopia: no data keeps dE76 >= 10.5, zero >= 20.3, and they are 18.8 apart.
// The old pair failed that test (no data #b0b0b0 came within 4.1 of the GDP
// ramp; zero #f5f0e8 was 2.8 from the paper, i.e. invisible).
export const MAP_NO_DATA = '#8f8a7e';   // unsurveyed; hatched as well on the SVG map
export const MAP_ZERO    = '#c6baa2';   // a measured nothing
export const MAP_PAPER   = '#f1e6c8';   // the ground both maps are drawn on (Gill cream, 2026-09-10)

const EMISSION_INDICATORS = new Set([
    'ghg', 'ghg_pc', 'co2ff', 'co2ff_pc', 'ch4', 'ch4_pc', 'n2o', 'n2o_pc',
    'fgas', 'fgas_pc', 'coal', 'coal_pc', 'oil', 'oil_pc', 'gas', 'gas_pc',
    'ff', 'ff_pc'
]);
// Quantities that carry a sign: a sink is not a small source.
const SIGNED_INDICATORS = new Set([
    'co2luc', 'co2luc_pc', 'land', 'land_pc', 'cum_d', 'cum_r'
]);

export function getMapFamily(indicator) {
    if (SIGNED_INDICATORS.has(indicator)) return 'tide';
    if (EMISSION_INDICATORS.has(indicator)) return 'ember';
    if (indicator === 'hdi' || indicator === 'hdi_ng') return 'bronze';
    if (indicator === 'pop' || indicator === 'pop_density') return 'ameth';
    if (indicator === 'rli' || indicator.startsWith('crop_')) return 'moss';
    if (indicator.startsWith('mfa_')) return 'ink';
    return 'depth';   // gdp_pc, gdp_total and the documented default
}

// ---- CIELAB interpolation (own maths, no d3: the browser must land on the
// exact colours the audit measured) --------------------------------------
function _srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function _hexToLab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = _srgbToLinear((n >> 16) & 255);
    const g = _srgbToLinear((n >> 8) & 255);
    const b = _srgbToLinear(n & 255);
    const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
    const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    const f = (t) => t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function _labToHex(L, a, b) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = (t) => t * t * t > 216 / 24389 ? t * t * t : (t - 4 / 29) * (108 / 841);
    const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
    const lin = [
        3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
        -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
        0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
    ];
    let out = '#';
    for (let i = 0; i < 3; i++) {
        let c = Math.max(0, Math.min(1, lin[i]));
        c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        out += Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0');
    }
    return out;
}
const _rampCache = {};
function rampLab(family) {
    if (_rampCache[family]) return _rampCache[family];
    const labs = MAP_RAMPS[family].map(_hexToLab);
    const n = labs.length - 1;
    const stops = MAP_RAMP_STOPS[family] || labs.map((_, i) => i / n);
    const fn = (t) => {
        t = t <= 0 ? 0 : t >= 1 ? 1 : t;
        let i = 0;
        while (i < n - 1 && t > stops[i + 1]) i++;
        const span = stops[i + 1] - stops[i];
        const u = span > 0 ? Math.max(0, Math.min(1, (t - stops[i]) / span)) : 0;
        const A = labs[i], B = labs[i + 1];
        return _labToHex(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u);
    };
    _rampCache[family] = fn;
    return fn;
}

// ---- Domains ---------------------------------------------------------------
// One entry per indicator the viewer can actually map. They are not typed by
// eye: each log pair was fitted over every country-year in the data (1850-2024)
// as the pair of round bounds (1/2/5 x 10^k) that maximises the number of
// separable tones across five sample years, while leaving at most 2% of the
// observations above the top and 5% below the bottom, and penalising a crushed
// end. gdp_pc is the one pinned by hand - the fit wanted a wider domain and
// that cost two steps in the recent decades, where the map is mostly read.
//   ['log',  min, max ]  logarithmic between the bounds, clamped
//   ['unit', lo,  hi  ]  linear over an index range
//   ['sym',  knee, max]  signed: log magnitude either side of zero
export const MAP_DOMAINS = {
    ghg:            ['log', 0.1, 5000],
    ghg_pc:         ['log', 0.5, 50],
    co2ff:          ['log', 0.1, 2000],
    co2ff_pc:       ['log', 0.1, 50],      // V7b: floor at 0.1 t, where the ember anchors start
    ch4:            ['log', 0.1, 1000],
    ch4_pc:         ['log', 0.2, 20],
    n2o:            ['log', 0.1, 200],
    n2o_pc:         ['log', 0.05, 5],
    fgas:           ['log', 0.1, 50],
    fgas_pc:        ['log', 0.002, 2],
    coal:           ['log', 0.1, 1000],
    coal_pc:        ['log', 0.01, 10],
    oil:            ['log', 0.1, 1000],
    oil_pc:         ['log', 0.02, 20],
    gas:            ['log', 0.1, 500],
    gas_pc:         ['log', 0.01, 20],
    ff:             ['log', 0.1, 2000],
    ff_pc:          ['log', 0.05, 50],
    gdp_pc:         ['log', 300, 80000],
    gdp_total:      ['log', 5, 5000000],
    pop:            ['log', 0.005, 500],
    pop_density:    ['log', 0.5, 2000],
    crop_total:     ['log', 0.01, 500],
    crop_total_pc:  ['log', 0.01, 20],
    crop_cropland:  ['log', 0.01, 200],
    crop_arable:    ['log', 0.01, 200],
    crop_permanent: ['log', 0.01, 10],
    crop_pastures:  ['log', 0.01, 500],
    mfa_ext_tot:    ['log', 0.1, 5000],
    mfa_con_tot:    ['log', 0.1, 10000],
    mfa_ext_pc:     ['log', 1, 100],
    mfa_con_pc:     ['log', 0.2, 100],
    mfa_ext_bio:    ['log', 0.1, 2000],
    mfa_ext_ff:     ['log', 0.1, 2000],
    mfa_ext_met:    ['log', 0.1, 1000],
    mfa_ext_min:    ['log', 0.05, 500],
    mfa_con_bio:    ['log', 0.1, 5000],
    mfa_con_ff:     ['log', 0.1, 1000],
    mfa_con_met:    ['log', 0.1, 1000],
    mfa_con_min:    ['log', 0.05, 200],
    // indices
    hdi:            ['unit', 0, 1],
    hdi_ng:         ['unit', 0, 1],
    rli:            ['unit', 0.4, 1],
    // signed
    co2luc:         ['sym', 1, 2000],
    land:           ['sym', 1, 2000],
    co2luc_pc:      ['sym', 0.1, 100],
    land_pc:        ['sym', 0.1, 100],
    cum_d:          ['sym', 1, 5000],
    cum_r:          ['sym', 1, 5000]
};

// Anything not in the table (a field added to the data before this table is
// updated) gets a stated fallback rather than an anonymous else branch.
export function getMapDomain(indicator) {
    if (MAP_DOMAINS[indicator]) return MAP_DOMAINS[indicator];
    if (indicator && indicator.endsWith('_pc')) return ['log', 0.05, 100];
    return ['log', 0.1, 10000];
}

export function mapValueToT(value, indicator) {
    const d = getMapDomain(indicator);
    if (d[0] === 'unit') {
        return Math.max(0, Math.min(1, (value - d[1]) / (d[2] - d[1])));
    }
    if (d[0] === 'sym') {
        const m = Math.min(1, Math.log1p(Math.abs(value) / d[1]) / Math.log1p(d[2] / d[1]));
        return 0.5 + 0.5 * (value > 0 ? m : -m);
    }
    const v = Math.max(d[1], Math.min(d[2], value));
    return Math.max(0, Math.min(1, (Math.log(v) - Math.log(d[1])) / (Math.log(d[2]) - Math.log(d[1]))));
}

// The one entry point. Choropleth, globe and both legends call this, so a
// country cannot be one colour on the map and another on the globe.
export function getMapColor(value, indicator) {
    if (value == null || isNaN(value)) return MAP_NO_DATA;
    if (value === 0 && !SIGNED_INDICATORS.has(indicator)) return MAP_ZERO;
    return rampLab(getMapFamily(indicator))(mapValueToT(value, indicator));
}

// t (0-1) to colour, for legend strips.
export function getAbsoluteColorScale(indicator) {
    return rampLab(getMapFamily(indicator));
}

export function isSignedIndicator(indicator) {
    return SIGNED_INDICATORS.has(indicator);
}

// ---- The legend -----------------------------------------------------------
// One builder for the choropleth and for the globe. The fill is continuous, so
// the legend is a continuous bar: the strip is the ramp itself, sampled, and
// every tick is placed at mapValueToT() of its own value, which is the exact
// position that value has on the map. What was there before promised classes -
// a row of labelled swatches - over a continuous fill, and on the globe a bar
// with three labels written by hand in a chain of if/else that had drifted
// away from the colours actually painted.
function _legendTicks(indicator) {
    const d = getMapDomain(indicator);
    const out = [];
    if (d[0] === 'unit') {
        const step = (d[2] - d[1]) / 4;
        for (let i = 0; i <= 4; i++) out.push(d[1] + i * step);
        return out;
    }
    if (d[0] === 'sym') {
        const mid = Math.pow(10, Math.round(Math.log10(Math.sqrt(d[1] * d[2]))));
        return [-d[2], -mid, 0, mid, d[2]];
    }
    out.push(d[1]);
    const first = Math.ceil(Math.log10(d[1]));
    const last = Math.floor(Math.log10(d[2]));
    for (let e = first; e <= last; e++) {
        const v = Math.pow(10, e);
        if (v > d[1] && v < d[2]) out.push(v);
    }
    out.push(d[2]);
    // drop ticks that would sit on top of each other (< 9% of the bar apart)
    const keep = [];
    for (const v of out) {
        const t = mapValueToT(v, indicator);
        if (!keep.length || t - mapValueToT(keep[keep.length - 1], indicator) >= 0.09
            || v === d[2]) keep.push(v);
    }
    if (keep.length > 2) {
        const a = mapValueToT(keep[keep.length - 2], indicator);
        const b = mapValueToT(keep[keep.length - 1], indicator);
        if (b - a < 0.09) keep.splice(keep.length - 2, 1);
    }
    return keep;
}

function _legendTickLabel(v) {
    const a = Math.abs(v);
    const sign = v < 0 ? '\u2212' : '';
    if (a === 0) return '0';
    if (a >= 1e6) return sign + (a / 1e6).toFixed(a % 1e6 ? 1 : 0) + 'M';
    if (a >= 1e3) return sign + (a / 1e3).toFixed(a % 1e3 ? 1 : 0) + 'k';
    if (a >= 1) return sign + String(+a.toFixed(a < 10 ? 1 : 0)).replace(/\.0$/, '');
    if (a >= 0.01) return sign + String(+a.toFixed(2));
    return sign + String(+a.toFixed(3));
}

export function buildMapLegendHTML(indicator) {
    const ramp = getAbsoluteColorScale(indicator);
    const stops = [];
    for (let i = 0; i <= 24; i++) {
        stops.push(`${ramp(i / 24)} ${(i / 24 * 100).toFixed(1)}%`);
    }
    // The ends of a log or signed domain are CLAMPS, not maxima: mapValueToT()
    // pins anything outside them to the end of the ramp, so on ghg 2020 China
    // and the United States arrive as the same darkest tone. Saying "5k" there
    // would repeat the old sin of a legend promising what the map does not do,
    // so the end ticks are marked as bounds. An index domain (hdi, rli) is the
    // natural range of the measure and is left plain.
    const clamped = getMapDomain(indicator)[0] !== 'unit';
    const tickValues = _legendTicks(indicator);
    const ticks = tickValues.map((v, i) => {
        const t = mapValueToT(v, indicator) * 100;
        const anchor = t < 6 ? 'left:0;transform:none' : t > 94 ? 'right:0;transform:none' : `left:${t.toFixed(1)}%`;
        let label = _legendTickLabel(v);
        if (clamped && i === 0) label = '≤' + label;
        if (clamped && i === tickValues.length - 1) label = '≥' + label;
        return `<span style="${anchor}">${label}</span>`;
    }).join('');
    const label = INDICATOR_LABELS[indicator] || indicator;
    const unit = INDICATOR_UNITS[indicator];
    const zero = isSignedIndicator(indicator) ? ''
        : `<span class="map-legend-cat"><i class="map-legend-zero"></i>Zero</span>`;
    return `
        <div class="map-legend-title">${label}${unit ? ' \u00B7 ' + unit : ''}</div>
        <div class="map-legend-scale">
            <div class="map-legend-bar" style="background:linear-gradient(to right,${stops.join(',')})"></div>
            <div class="map-legend-ticks">${ticks}</div>
        </div>
        <div class="map-legend-cats">
            <span class="map-legend-cat"><i class="map-legend-nodata"></i>No data</span>
            ${zero}
        </div>`;
}

// Calculations
export function calcCAGR(startVal, endVal, years) {
    if (!startVal || !endVal || years <= 0) return null;
    return Math.pow(endVal / startVal, 1 / years) - 1;
}

export function calcMovingAverage(data, window, field = 'v') {
    if (!window || window <= 1) return data;
    const half = Math.floor(window / 2);
    return data.map((d, i) => {
        const start = Math.max(0, i - half);
        const end = Math.min(data.length - 1, i + half);
        const slice = data.slice(start, end + 1);
        const avg = d3.mean(slice, s => s[field]);
        return { ...d, [field]: avg != null ? avg : d[field] };
    });
}

export function calcLinearRegression(data, xField = 'y', yField = 'v') {
    const valid = data.filter(d => d[yField] != null);
    const n = valid.length;
    if (n < 2) return null;
    const sumX = d3.sum(valid, d => d[xField]);
    const sumY = d3.sum(valid, d => d[yField]);
    const sumXY = d3.sum(valid, d => d[xField] * d[yField]);
    const sumX2 = d3.sum(valid, d => d[xField] * d[xField]);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const ssRes = d3.sum(valid, d => Math.pow(d[yField] - (slope * d[xField] + intercept), 2));
    const ssTot = d3.sum(valid, d => Math.pow(d[yField] - sumY / n, 2));
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, r2 };
}

export function getColorForIndex(index) {
    return COMPARISON_PALETTE[index % COMPARISON_PALETTE.length];
}

// Kaya identity decomposition: GHG = (GHG/GDP) * (GDP/Pop) * Pop
export function kayaDecomposition(data1, data2) {
    if (!data1 || !data2) return null;
    const ghgChange = (data2.ghg - data1.ghg) / data1.ghg;
    const gdpChange = (data2.gdp_pc - data1.gdp_pc) / data1.gdp_pc;
    const popChange = (data2.pop - data1.pop) / data1.pop;
    const techEffect = ghgChange - gdpChange - popChange;
    return {
        total: ghgChange,
        gdpEffect: gdpChange,
        popEffect: popChange,
        techEffect: techEffect
    };
}

// ISO 3166-1 numeric to ISO3 alpha mapping (for TopoJSON)
export const NUMERIC_TO_ISO3 = {
    4:'AFG',8:'ALB',12:'DZA',20:'AND',24:'AGO',28:'ATG',32:'ARG',51:'ARM',
    36:'AUS',40:'AUT',31:'AZE',44:'BHS',48:'BHR',50:'BGD',52:'BRB',112:'BLR',
    56:'BEL',84:'BLZ',204:'BEN',64:'BTN',68:'BOL',70:'BIH',72:'BWA',76:'BRA',
    96:'BRN',100:'BGR',854:'BFA',108:'BDI',132:'CPV',116:'KHM',120:'CMR',
    124:'CAN',140:'CAF',148:'TCD',152:'CHL',156:'CHN',170:'COL',174:'COM',
    178:'COG',180:'COD',188:'CRI',384:'CIV',191:'HRV',192:'CUB',196:'CYP',
    203:'CZE',208:'DNK',262:'DJI',212:'DMA',214:'DOM',218:'ECU',818:'EGY',
    222:'SLV',226:'GNQ',232:'ERI',233:'EST',748:'SWZ',231:'ETH',242:'FJI',
    246:'FIN',250:'FRA',266:'GAB',270:'GMB',268:'GEO',276:'DEU',288:'GHA',
    300:'GRC',308:'GRD',320:'GTM',324:'GIN',624:'GNB',328:'GUY',332:'HTI',
    340:'HND',348:'HUN',352:'ISL',356:'IND',360:'IDN',364:'IRN',368:'IRQ',
    372:'IRL',376:'ISR',380:'ITA',388:'JAM',392:'JPN',400:'JOR',398:'KAZ',
    404:'KEN',296:'KIR',408:'PRK',410:'KOR',414:'KWT',417:'KGZ',418:'LAO',
    428:'LVA',422:'LBN',426:'LSO',430:'LBR',434:'LBY',438:'LIE',440:'LTU',
    442:'LUX',450:'MDG',454:'MWI',458:'MYS',462:'MDV',466:'MLI',470:'MLT',
    584:'MHL',478:'MRT',480:'MUS',484:'MEX',583:'FSM',498:'MDA',492:'MCO',
    496:'MNG',499:'MNE',504:'MAR',508:'MOZ',104:'MMR',516:'NAM',520:'NRU',
    524:'NPL',528:'NLD',554:'NZL',558:'NIC',562:'NER',566:'NGA',807:'MKD',
    578:'NOR',512:'OMN',586:'PAK',585:'PLW',591:'PAN',598:'PNG',600:'PRY',
    604:'PER',608:'PHL',616:'POL',620:'PRT',634:'QAT',642:'ROU',643:'RUS',
    646:'RWA',659:'KNA',662:'LCA',670:'VCT',882:'WSM',674:'SMR',678:'STP',
    682:'SAU',686:'SEN',688:'SRB',690:'SYC',694:'SLE',702:'SGP',703:'SVK',
    705:'SVN',90:'SLB',706:'SOM',710:'ZAF',724:'ESP',144:'LKA',729:'SDN',
    740:'SUR',752:'SWE',756:'CHE',760:'SYR',762:'TJK',834:'TZA',764:'THA',
    626:'TLS',768:'TGO',776:'TON',780:'TTO',788:'TUN',792:'TUR',795:'TKM',
    798:'TUV',800:'UGA',804:'UKR',784:'ARE',826:'GBR',840:'USA',858:'URY',
    860:'UZB',548:'VUT',862:'VEN',704:'VNM',887:'YEM',894:'ZMB',716:'ZWE',
    275:'PSE',736:'SDN',728:'SSD',531:'CUW',534:'SXM',535:'BES',
    '-99':'CYN',10:'ATA'
};
