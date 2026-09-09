// ============================================================================
// CHOROPLETH - D3 dual-map with Natural Earth projection
// Continuous fill + continuous legend, no country selection in map view
// ============================================================================

import DataLoader from '../data-loader.js?v=20260909a';
import State from '../state.js?v=20260909a';
import Tooltip from '../components/tooltip.js?v=20260909a';
import {
    INDICATOR_LABELS,
    getMapColor,
    MAP_NO_DATA,
    buildMapLegendHTML,
    formatValue,
    formatRank,
    formatRatio,
    formatEmissions,
    formatGDP,
    resolveIndicatorValue
} from '../utils.js?v=20260909a';

// ---- Module state ----
let svg1, g1, projection1, pathGen1, countryPaths1;
let svg2, g2, projection2, pathGen2, countryPaths2;
let isDualMap = false;
let yearFrom = 1990;
let map2Ready = false;

// The per-indicator breakpoint table that used to live here is gone. It fed a
// legend of labelled swatches drawn over a continuous fill - the legend
// promised classes the map never had - and it had no entry for the eight MFA
// material sub-indicators, so choosing "Biomass extraction" printed the GHG
// legend. Scale bounds now live in MAP_DOMAINS (js/utils.js), fitted to the
// data, and the legend is built from those same bounds by buildMapLegendHTML().


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

    // No-data hatch. It is not decoration: a flat grey cannot stay clear of
    // every tone of every ramp under dichromatic vision (the old #b0b0b0 came
    // within dE76 4.1 of the economy ramp), so on the SVG map "no data" is a
    // texture as well as a colour. The globe, which cannot carry an SVG
    // pattern, uses the flat MAP_NO_DATA alone.
    const defs = svgEl.append('defs');
    const pattern = defs.append('pattern')
        .attr('id', `hatching-explore-${idx}`)
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 5).attr('height', 5)
        .attr('patternTransform', 'rotate(45)');
    pattern.append('rect')
        .attr('width', 5).attr('height', 5)
        .attr('fill', MAP_NO_DATA);
    pattern.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', 0).attr('y2', 5)
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
        .attr('fill', d => getColorForYear(d.properties.iso3, getYearForPane(), idx))
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 0.3)
        // No click selection in map view. 'pointerup' is listed too so a tap on
        // a touch screen anchors the value card (Tooltip pins it when the
        // pointer is coarse); hover alone left phones with no way to read a value.
        .on('mouseenter pointerup', (event, d) => {
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
        // leave(), not hide(): on a touch screen the tap's synthetic mouseleave
        // arrives right after pointerup pinned the card. See tooltip.js.
        .on('mouseleave', () => Tooltip.leave());

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

function getColorForYear(iso3, year, paneIdx) {
    const indicator = State.get('indicator');
    const val = iso3 ? DataLoader.getCountryValue(iso3, year) : null;
    const value = iso3 ? resolveIndicatorValue(val, indicator) : null;
    if (value == null || isNaN(value)) {
        // hatched no-data, so the category never depends on hue alone
        return paneIdx ? `url(#hatching-explore-${paneIdx})` : MAP_NO_DATA;
    }
    return getMapColor(value, indicator);
}

// The twenty-branch chain of hand-typed log bounds that used to stand here -
// and its slightly different twin in js/globe/globe-renderer.js, which gave
// the same country two different colours on the globe and on the map - is now
// the single MAP_DOMAINS table in js/utils.js, read through getMapColor().


// ============================================================================
// Legend - a continuous bar, because the fill is continuous
// ============================================================================

function buildCategoricalLegend() {
    const container = document.getElementById('explore-legend');
    if (!container) return;
    container.innerHTML = buildMapLegendHTML(State.get('indicator'));
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

    paths.attr('fill', d => getColorForYear(d.properties.iso3, year, idx))
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
