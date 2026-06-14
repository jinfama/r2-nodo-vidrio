// ============================================================================
// CHOROPLETH - D3 dual-map with Natural Earth projection
// Categorical legend, no country selection in map view
// ============================================================================

import DataLoader from '../data-loader.js';
import State from '../state.js';
import Tooltip from '../components/tooltip.js';
import {
    COLORS,
    INDICATOR_LABELS,
    INDICATOR_UNITS,
    getAbsoluteColorScale,
    formatValue,
    formatRank,
    formatRatio,
    formatEmissions,
    formatGDP,
    resolveIndicatorValue
} from '../utils.js';

// ---- Module state ----
let svg1, g1, projection1, pathGen1, countryPaths1;
let svg2, g2, projection2, pathGen2, countryPaths2;
let isDualMap = false;
let yearFrom = 1990;
let map2Ready = false;

// ---- Categorical legend breakpoints per indicator ----
const LEGEND_CONFIG = {
    ghg: {
        values: [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
        labels: ['0.5', '1', '5', '10', '25', '50', '100', '250', '500', '1Gt', '2.5Gt', '5Gt'],
        title: 'GHG emissions (Mt CO\u2082e)'
    },
    ghg_pc: {
        values: [0.5, 1, 2, 3, 5, 8, 12, 16, 20, 30, 40],
        labels: ['0.5', '1', '2', '3', '5', '8', '12', '16', '20', '30', '40'],
        title: 'GHG per capita (t CO\u2082e)'
    },
    co2ff: {
        values: [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
        labels: ['0.5', '1', '5', '10', '25', '50', '100', '250', '500', '1Gt', '2.5Gt', '5Gt'],
        title: 'CO\u2082 fossil fuel (Mt CO\u2082e)'
    },
    gdp_pc: {
        values: [500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 50000, 80000],
        labels: ['$500', '$1K', '$2K', '$3K', '$5K', '$8K', '$12K', '$20K', '$30K', '$50K', '$80K'],
        title: 'GDP per capita (1990 Int$ PPP)'
    },
    hdi: {
        values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
        labels: ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'],
        title: 'Human Development Index'
    },
    hdi_ng: {
        values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
        labels: ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'],
        title: 'HDI (without GDP)'
    },
    pop: {
        values: [0.5, 1, 3, 5, 10, 25, 50, 100, 250, 500, 1000],
        labels: ['0.5M', '1M', '3M', '5M', '10M', '25M', '50M', '100M', '250M', '500M', '1B'],
        title: 'Population (millions)'
    },
    pop_density: {
        values: [5, 10, 25, 50, 100, 200, 500, 1000, 5000, 10000],
        labels: ['5', '10', '25', '50', '100', '200', '500', '1K', '5K', '10K'],
        title: 'Population density (persons/km\u00B2)'
    },
    co2ff_pc: {
        values: [0.5, 1, 2, 3, 5, 8, 12, 16, 20, 30, 40],
        labels: ['0.5', '1', '2', '3', '5', '8', '12', '16', '20', '30', '40'],
        title: 'CO\u2082 fossil per capita (t CO\u2082e)'
    },
    gdp_total: {
        values: [1000, 5000, 10000, 50000, 200000, 500000, 1000000, 5000000, 20000000],
        labels: ['$1B', '$5B', '$10B', '$50B', '$200B', '$500B', '$1T', '$5T', '$20T'],
        title: 'GDP total (M Int$ PPP)'
    },
    co2luc: {
        values: [-50, -10, -1, 0, 1, 10, 50, 200],
        labels: ['-50', '-10', '-1', '0', '1', '10', '50', '200'],
        title: 'CO\u2082 land use change (Mt CO\u2082e)'
    },
    ch4: {
        values: [0.5, 1, 3, 5, 10, 25, 50, 100, 250, 500],
        labels: ['0.5', '1', '3', '5', '10', '25', '50', '100', '250', '500'],
        title: 'CH\u2084 methane (Mt CO\u2082e)'
    },
    n2o: {
        values: [0.1, 0.5, 1, 3, 5, 10, 25, 50, 100],
        labels: ['0.1', '0.5', '1', '3', '5', '10', '25', '50', '100'],
        title: 'N\u2082O nitrous oxide (Mt CO\u2082e)'
    },
    fgas: {
        values: [0.01, 0.05, 0.1, 0.5, 1, 3, 5, 10, 50],
        labels: ['0.01', '0.05', '0.1', '0.5', '1', '3', '5', '10', '50'],
        title: 'Fluorinated gases (Mt CO\u2082e)'
    },
    ff: {
        values: [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
        labels: ['0.5', '1', '5', '10', '25', '50', '100', '250', '500', '1Gt', '2.5Gt', '5Gt'],
        title: 'Total fossil (Mt CO\u2082e)'
    },
    coal: {
        values: [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
        labels: ['0.5', '1', '5', '10', '25', '50', '100', '250', '500', '1Gt', '2.5Gt'],
        title: 'Coal CO\u2082 (Mt CO\u2082e)'
    },
    oil: {
        values: [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
        labels: ['0.5', '1', '5', '10', '25', '50', '100', '250', '500', '1Gt', '2.5Gt'],
        title: 'Oil CO\u2082 (Mt CO\u2082e)'
    },
    gas: {
        values: [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000],
        labels: ['0.5', '1', '5', '10', '25', '50', '100', '250', '500', '1Gt'],
        title: 'Natural gas CO\u2082 (Mt CO\u2082e)'
    },
    land: {
        values: [-50, -10, 0, 10, 50, 100, 500],
        labels: ['-50', '-10', '0', '10', '50', '100', '500'],
        title: 'Total land (Mt CO\u2082e)'
    },
    co2luc_pc: {
        values: [-5, -1, 0, 1, 5, 10, 20],
        labels: ['-5', '-1', '0', '1', '5', '10', '20'],
        title: 'CO\u2082 land use per capita (t CO\u2082e)'
    },
    ch4_pc: {
        values: [0.5, 1, 2, 3, 5, 8, 12, 20],
        labels: ['0.5', '1', '2', '3', '5', '8', '12', '20'],
        title: 'CH\u2084 per capita (t CO\u2082e)'
    },
    n2o_pc: {
        values: [0.1, 0.5, 1, 2, 3, 5, 8, 15],
        labels: ['0.1', '0.5', '1', '2', '3', '5', '8', '15'],
        title: 'N\u2082O per capita (t CO\u2082e)'
    },
    fgas_pc: {
        values: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
        labels: ['0.01', '0.05', '0.1', '0.3', '0.5', '1', '2', '5'],
        title: 'F-gases per capita (t CO\u2082e)'
    },
    ff_pc: {
        values: [0.5, 1, 2, 3, 5, 8, 12, 20, 40],
        labels: ['0.5', '1', '2', '3', '5', '8', '12', '20', '40'],
        title: 'Fossil total per capita (t CO\u2082e)'
    },
    coal_pc: {
        values: [0.1, 0.5, 1, 2, 3, 5, 8, 12, 20],
        labels: ['0.1', '0.5', '1', '2', '3', '5', '8', '12', '20'],
        title: 'Coal CO\u2082 per capita (t CO\u2082e)'
    },
    oil_pc: {
        values: [0.1, 0.5, 1, 2, 3, 5, 8, 12, 20],
        labels: ['0.1', '0.5', '1', '2', '3', '5', '8', '12', '20'],
        title: 'Oil CO\u2082 per capita (t CO\u2082e)'
    },
    gas_pc: {
        values: [0.1, 0.5, 1, 2, 3, 5, 8, 12, 20],
        labels: ['0.1', '0.5', '1', '2', '3', '5', '8', '12', '20'],
        title: 'Natural gas CO\u2082 per capita (t CO\u2082e)'
    },
    land_pc: {
        values: [-5, -1, 0, 1, 5, 10, 20],
        labels: ['-5', '-1', '0', '1', '5', '10', '20'],
        title: 'Land total per capita (t CO\u2082e)'
    },
    // MFA
    mfa_ext_tot: {
        values: [5, 20, 50, 100, 250, 500, 1000, 2500, 5000],
        labels: ['5', '20', '50', '100', '250', '500', '1Gt', '2.5Gt', '5Gt'],
        title: 'Material extraction (Mt)'
    },
    mfa_con_tot: {
        values: [5, 20, 50, 100, 250, 500, 1000, 2500, 5000],
        labels: ['5', '20', '50', '100', '250', '500', '1Gt', '2.5Gt', '5Gt'],
        title: 'Material consumption (Mt)'
    },
    mfa_imp_tot: {
        values: [5, 10, 50, 100, 250, 500, 1000, 2000, 5000],
        labels: ['5', '10', '50', '100', '250', '500', '1Gt', '2Gt', '5Gt'],
        title: 'Material imports (Mt)'
    },
    mfa_exp_tot: {
        values: [5, 10, 50, 100, 250, 500, 1000, 2000, 5000],
        labels: ['5', '10', '50', '100', '250', '500', '1Gt', '2Gt', '5Gt'],
        title: 'Material exports (Mt)'
    },
    mfa_mf_tot: {
        values: [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000],
        labels: ['10', '50', '100', '250', '500', '1Gt', '2Gt', '5Gt', '10Gt', '20Gt'],
        title: 'Material footprint (Mt)'
    },
    mfa_ext_pc: {
        values: [2, 5, 10, 15, 25, 40, 60, 80],
        labels: ['2', '5', '10', '15', '25', '40', '60', '80'],
        title: 'Material extraction per capita (t/person)'
    },
    mfa_con_pc: {
        values: [2, 5, 10, 15, 25, 40, 60, 80],
        labels: ['2', '5', '10', '15', '25', '40', '60', '80'],
        title: 'Material consumption per capita (t/person)'
    },
    mfa_imp_pc: {
        values: [0.5, 1, 3, 5, 10, 20, 40],
        labels: ['0.5', '1', '3', '5', '10', '20', '40'],
        title: 'Material imports per capita (t/person)'
    },
    mfa_exp_pc: {
        values: [0.5, 1, 3, 5, 10, 20, 40],
        labels: ['0.5', '1', '3', '5', '10', '20', '40'],
        title: 'Material exports per capita (t/person)'
    },
    mfa_mf_pc: {
        values: [1, 3, 5, 10, 15, 25, 40, 60, 100],
        labels: ['1', '3', '5', '10', '15', '25', '40', '60', '100'],
        title: 'Material footprint per capita (t/person)'
    },
    // Crops / Land Use
    crop_total: {
        values: [0.1, 0.5, 1, 5, 10, 25, 50, 100, 200, 500],
        labels: ['0.1', '0.5', '1', '5', '10', '25', '50', '100', '200', '500'],
        title: 'Agricultural area (Mha)'
    },
    crop_total_pc: {
        values: [0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1, 2, 5, 10],
        labels: ['0.05', '0.1', '0.2', '0.3', '0.5', '0.8', '1', '2', '5', '10'],
        title: 'Agricultural area per capita (ha/person)'
    },
    crop_cropland: {
        values: [0.01, 0.1, 0.5, 1, 5, 10, 25, 50, 100, 200],
        labels: ['0.01', '0.1', '0.5', '1', '5', '10', '25', '50', '100', '200'],
        title: 'Cropland (Mha)'
    },
    crop_arable: {
        values: [0.01, 0.1, 0.5, 1, 5, 10, 25, 50, 100, 200],
        labels: ['0.01', '0.1', '0.5', '1', '5', '10', '25', '50', '100', '200'],
        title: 'Arable land (Mha)'
    },
    crop_permanent: {
        values: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 25, 50],
        labels: ['0.01', '0.05', '0.1', '0.5', '1', '5', '10', '25', '50'],
        title: 'Permanent crops (Mha)'
    },
    crop_pastures: {
        values: [0.1, 0.5, 1, 5, 10, 25, 50, 100, 200, 500],
        labels: ['0.1', '0.5', '1', '5', '10', '25', '50', '100', '200', '500'],
        title: 'Permanent pastures (Mha)'
    },
    // Biodiversity
    rli: {
        values: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.98],
        labels: ['0.5', '0.6', '0.7', '0.75', '0.8', '0.85', '0.9', '0.95', '0.98'],
        title: 'Red List Index (0\u20131)'
    }
};


// ============================================================================
// Initialization
// ============================================================================

export function initChoropleth() {
    initMapPane(1);
    buildCategoricalLegend();

    // Resize observer
    const wrap = document.getElementById('explore-map-container-wrap');
    if (wrap) {
        const resizeObserver = new ResizeObserver(() => {
            fitProjection(1);
            if (isDualMap && map2Ready) fitProjection(2);
        });
        resizeObserver.observe(wrap);
    }
}

function initMapPane(idx) {
    const svgId = idx === 1 ? 'explore-map-svg' : 'explore-map-svg-2';
    const svgEl = d3.select('#' + svgId);
    if (!svgEl.node()) return;

    // Hatching pattern for no-data
    const defs = svgEl.append('defs');
    const pattern = defs.append('pattern')
        .attr('id', `hatching-explore-${idx}`)
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 6).attr('height', 6)
        .attr('patternTransform', 'rotate(45)');
    pattern.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', 0).attr('y2', 6)
        .attr('class', 'map-hatching');

    const proj = d3.geoNaturalEarth1().rotate([-10, 0]);
    const path = d3.geoPath().projection(proj);
    const group = svgEl.append('g');

    const features = DataLoader.getGeoFeatures();
    const getYearForPane = () => {
        if (idx === 1 && isDualMap) return yearFrom;
        return State.get('currentYear');
    };

    const paths = group.selectAll('.country')
        .data(features)
        .join('path')
        .attr('class', 'country')
        .attr('d', path)
        .attr('fill', d => getColorForYear(d.properties.iso3, getYearForPane()))
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 0.3)
        // No click selection in map view
        .on('mouseenter', (event, d) => {
            const iso3 = d.properties.iso3;
            const name = d.properties.name || iso3;
            const year = getYearForPane();
            const indicator = State.get('indicator');
            const val = DataLoader.getCountryValue(iso3, year);
            const mainValue = resolveIndicatorValue(val, indicator);
            // Use base ranking field for known rankings — rankings are only pre-computed
            // for: gdp_pc, ghg, ghg_pc, co2ff, hdi, hdi_ng, pop, mfa_ext_tot, mfa_con_tot,
            // mfa_ext_pc, mfa_con_pc, crop_total, rli, pop_density
            const RANKED_INDICATORS = new Set([
                'gdp_pc', 'ghg', 'ghg_pc', 'co2ff', 'hdi', 'hdi_ng', 'pop',
                'mfa_ext_tot', 'mfa_con_tot', 'mfa_ext_pc', 'mfa_con_pc',
                'crop_total', 'rli', 'pop_density'
            ]);
            const rankField = RANKED_INDICATORS.has(indicator) ? indicator : null;
            const rank = rankField ? DataLoader.getCountryRank(iso3, year, rankField) : null;
            const total = rankField ? DataLoader.getTotalCountries(year, rankField) : null;
            const worldVal = DataLoader.getWorldValue(year);
            const worldMain = resolveIndicatorValue(worldVal, indicator);
            const ratioVal = (mainValue != null && worldMain > 0) ? mainValue / worldMain : null;

            Tooltip.show(`
                <div class="tooltip-title"><span>${name}</span><span>${year}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">${INDICATOR_LABELS[indicator] || indicator}</span><span class="tooltip-value">${formatValue(mainValue, indicator)}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">World rank</span><span class="tooltip-value">${rank ? formatRank(rank, total) : '\u2014'}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">vs World avg</span><span class="tooltip-value">${ratioVal ? formatRatio(ratioVal) : '\u2014'}</span></div>
                ${(indicator === 'ghg' || indicator === 'ghg_pc') && val ? `
                <div class="tooltip-row"><span class="tooltip-label">CO\u2082 fossil</span><span class="tooltip-value">${formatEmissions(val.co2ff)}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">GHG per capita</span><span class="tooltip-value">${val.ghg_pc != null ? val.ghg_pc.toFixed(1) + ' t' : '\u2014'}</span></div>
                ` : ''}
            `, event);
        })
        .on('mousemove', (event) => Tooltip.move(event))
        .on('mouseleave', () => Tooltip.hide());

    if (idx === 1) {
        svg1 = svgEl; g1 = group; projection1 = proj; pathGen1 = path; countryPaths1 = paths;
    } else {
        svg2 = svgEl; g2 = group; projection2 = proj; pathGen2 = path; countryPaths2 = paths;
        map2Ready = true;
    }

    fitProjection(idx);
}

function fitProjection(idx) {
    const paneId = idx === 1 ? 'explore-map-pane-left' : 'explore-map-pane-right';
    const container = document.getElementById(paneId);
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;

    const svgEl = idx === 1 ? svg1 : svg2;
    const proj = idx === 1 ? projection1 : projection2;
    if (!svgEl || !proj) return;

    svgEl.attr('viewBox', `0 0 ${w} ${h}`);
    // Add padding so map doesn't overlap with year text or legend
    const pad = { top: 60, bottom: 40, left: 10, right: 10 };
    proj.fitExtent(
        [[pad.left, pad.top], [w - pad.right, h - pad.bottom]],
        { type: 'FeatureCollection', features: DataLoader.getGeoFeatures() }
    );

    const path = d3.geoPath().projection(proj);
    if (idx === 1) { pathGen1 = path; }
    else { pathGen2 = path; }

    const paths = idx === 1 ? countryPaths1 : countryPaths2;
    if (paths) paths.attr('d', path);
}

// ============================================================================
// Color mapping (continuous, takes explicit year)
// ============================================================================

function getColorForYear(iso3, year) {
    if (!iso3) return '#b0b0b0';
    const indicator = State.get('indicator');
    const val = DataLoader.getCountryValue(iso3, year);
    const value = resolveIndicatorValue(val, indicator);

    if (value == null || isNaN(value)) return '#b0b0b0'; // no data → medium gray
    if (value === 0) return '#f5f0e8'; // zero → warm cream (distinct from white background)
    return absoluteColor(value, indicator);
}

function absoluteColor(value, indicator) {
    const colorFn = getAbsoluteColorScale(indicator);

    if (indicator === 'hdi' || indicator === 'hdi_ng' || indicator === 'rli') {
        // Map 0→1 indices to color scale 0.15→1.0 so low values still get visible color
        const raw = Math.max(0, Math.min(1, value));
        const t = 0.15 + raw * 0.85;
        return colorFn(t);
    }

    // Indicators that can be negative (land use change) — use linear scale
    if (indicator === 'co2luc' || indicator === 'co2luc_pc' || indicator === 'land' || indicator === 'land_pc') {
        let rangeMin, rangeMax;
        if (indicator.endsWith('_pc')) { rangeMin = -10; rangeMax = 20; }
        else { rangeMin = -100; rangeMax = 500; }
        const t = Math.max(0, Math.min(1, (value - rangeMin) / (rangeMax - rangeMin)));
        return colorFn(t);
    }

    let logMin, logMax;
    if (indicator === 'ghg' || indicator === 'co2ff' || indicator === 'ff' || indicator === 'coal' || indicator === 'oil' || indicator === 'gas') {
        logMin = Math.log(0.1); logMax = Math.log(10000);
    } else if (indicator === 'ch4') {
        logMin = Math.log(0.1); logMax = Math.log(500);
    } else if (indicator === 'n2o') {
        logMin = Math.log(0.01); logMax = Math.log(100);
    } else if (indicator === 'fgas') {
        logMin = Math.log(0.001); logMax = Math.log(50);
    } else if (indicator === 'ghg_pc' || indicator === 'co2ff_pc' || indicator === 'ff_pc' || indicator === 'ch4_pc' || indicator === 'n2o_pc' || indicator === 'coal_pc' || indicator === 'oil_pc' || indicator === 'gas_pc') {
        logMin = Math.log(0.1); logMax = Math.log(40);
    } else if (indicator === 'fgas_pc') {
        logMin = Math.log(0.001); logMax = Math.log(5);
    } else if (indicator === 'gdp_pc') {
        logMin = Math.log(400); logMax = Math.log(80000);
    } else if (indicator === 'gdp_total') {
        logMin = Math.log(100); logMax = Math.log(50000000);
    } else if (indicator === 'pop') {
        logMin = Math.log(0.05); logMax = Math.log(1500);
    } else if (indicator === 'crop_total') {
        logMin = Math.log(0.05); logMax = Math.log(600);
    } else if (indicator === 'crop_total_pc') {
        logMin = Math.log(0.01); logMax = Math.log(15);
    } else if (indicator.startsWith('crop_')) {
        logMin = Math.log(0.01); logMax = Math.log(500);
    } else if (indicator === 'mfa_ext_tot' || indicator === 'mfa_con_tot') {
        logMin = Math.log(1); logMax = Math.log(5000);
    } else if (indicator === 'mfa_ext_pc' || indicator === 'mfa_con_pc') {
        logMin = Math.log(0.5); logMax = Math.log(80);
    } else if (indicator.startsWith('mfa_') && indicator.endsWith('_pc')) {
        logMin = Math.log(0.1); logMax = Math.log(40);
    } else if (indicator.startsWith('mfa_')) {
        logMin = Math.log(0.5); logMax = Math.log(3000);
    } else if (indicator === 'pop_density') {
        logMin = Math.log(1); logMax = Math.log(5000);
    } else {
        logMin = Math.log(0.1); logMax = Math.log(10000);
    }

    const safeValue = Math.max(Math.exp(logMin), value);
    const t = Math.max(0, Math.min(1, (Math.log(safeValue) - logMin) / (logMax - logMin)));
    return colorFn(t);
}


// ============================================================================
// Categorical legend (HTML-based)
// ============================================================================

function buildCategoricalLegend() {
    const container = document.getElementById('explore-legend');
    if (!container) return;

    const indicator = State.get('indicator');
    const config = LEGEND_CONFIG[indicator] || LEGEND_CONFIG.ghg;

    const swatches = config.values.map((val, i) => {
        const color = absoluteColor(val, indicator);
        return `<div class="map-legend-item"><div class="map-legend-color" style="background:${color}"></div><div class="map-legend-label">${config.labels[i]}</div></div>`;
    }).join('');

    container.innerHTML = `
        <div class="map-legend-title">${config.title}</div>
        <div class="map-legend-row">
            <div class="map-legend-item"><div class="map-legend-nodata"></div><div class="map-legend-label">No data</div></div>
            <div class="map-legend-item"><div class="map-legend-color" style="background:#ffffff;border:1px solid #ddd"></div><div class="map-legend-label">Zero</div></div>
            ${swatches}
        </div>
    `;
}


// ============================================================================
// Dual map control
// ============================================================================

export function setDualMap(enabled, fromYear) {
    isDualMap = enabled;
    if (fromYear != null) yearFrom = fromYear;

    const paneRight = document.getElementById('explore-map-pane-right');
    if (paneRight) paneRight.style.display = enabled ? '' : 'none';

    if (enabled && !map2Ready) {
        initMapPane(2);
    }

    setTimeout(() => {
        fitProjection(1);
        if (enabled && map2Ready) fitProjection(2);
        updateChoropleth();
    }, 60);
}

export function setYearFrom(year) {
    yearFrom = year;
    if (isDualMap) {
        updateMapPane(1);
        const el = document.getElementById('explore-year-display');
        if (el) el.textContent = year;
    }
}

export function getYearFrom() {
    return yearFrom;
}

export function isDual() {
    return isDualMap;
}

// ============================================================================
// Update
// ============================================================================

function updateMapPane(idx) {
    const year = (idx === 1 && isDualMap) ? yearFrom : State.get('currentYear');
    const paths = idx === 1 ? countryPaths1 : countryPaths2;
    if (!paths) return;

    paths.attr('fill', d => getColorForYear(d.properties.iso3, year))
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 0.3);
}

export function updateChoropleth() {
    updateMapPane(1);
    if (isDualMap && map2Ready) updateMapPane(2);

    // Year displays
    if (isDualMap) {
        const el1 = document.getElementById('explore-year-display');
        const el2 = document.getElementById('explore-year-display-2');
        if (el1) el1.textContent = yearFrom;
        if (el2) el2.textContent = State.get('currentYear');
    } else {
        const el = document.getElementById('explore-year-display');
        if (el) el.textContent = State.get('currentYear');
    }

    buildCategoricalLegend();
}

export function highlightCountries() {
    // No highlighting in map view (selection is disabled)
}
