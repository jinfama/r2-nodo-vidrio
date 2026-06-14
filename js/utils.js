// ============================================================================
// UTILITIES - Formatters, color scales, calculations, constants
// ============================================================================

export const COLORS = {
    primary: '#1e6091',
    accent: '#e63946',
    dark: '#212529',
    gray: '#495057',
    lightGray: '#adb5bd',
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

export const COMPARISON_PALETTE = [
    '#1e6091', '#e63946', '#2a9d8f', '#e9c46a', '#264653',
    '#f4a261', '#6a4c93', '#1982c4', '#8ac926', '#ff595e'
];

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

export function formatRank(rank, total) {
    return `${rank}/${total}`;
}

// Color scales — high contrast for globe and choropleth
// All emission-type indicators
const EMISSION_INDICATORS = new Set([
    'ghg', 'ghg_pc', 'co2ff', 'co2ff_pc', 'co2luc', 'co2luc_pc',
    'ch4', 'ch4_pc', 'n2o', 'n2o_pc', 'fgas', 'fgas_pc',
    'coal', 'coal_pc', 'oil', 'oil_pc', 'gas', 'gas_pc',
    'ff', 'ff_pc', 'land', 'land_pc', 'cum_d', 'cum_r'
]);

// Stretch color scales to skip the washed-out near-white range
// Maps t (0→1) to the interpolator range (min→1) for stronger contrast
function stretchScale(interpolator, min = 0.18) {
    return (t) => interpolator(min + t * (1 - min));
}

export function getAbsoluteColorScale(indicator) {
    if (EMISSION_INDICATORS.has(indicator)) {
        return stretchScale(d3.interpolateYlOrRd, 0.15);
    }
    if (indicator.startsWith('mfa_')) {
        return stretchScale(d3.interpolateOranges, 0.20);
    }
    if (indicator === 'hdi' || indicator === 'hdi_ng') {
        return stretchScale(d3.interpolateYlGn, 0.12);
    }
    if (indicator === 'pop' || indicator === 'pop_density') {
        return stretchScale(d3.interpolatePurples, 0.12);
    }
    if (indicator.startsWith('crop_')) {
        return stretchScale(d3.interpolateGreens, 0.15);
    }
    if (indicator === 'rli') {
        return stretchScale(d3.interpolateRdYlGn, 0.05);
    }
    // GDP
    return stretchScale(d3.interpolateYlGnBu, 0.12);
}

export function getDivergingColorScale() {
    return d3.interpolateRdBu;
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
