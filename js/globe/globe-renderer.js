// ============================================================================
// GLOBE RENDERER - Globe.gl wrapper for multi-indicator visualization
// ============================================================================

import DataLoader from '../data-loader.js';
import State from '../state.js';
import Tooltip from '../components/tooltip.js';
import {
    COLORS, formatValue, formatGDP, formatEmissions, formatRank, formatRatio,
    getAbsoluteColorScale, resolveIndicatorValue, INDICATOR_LABELS, INDICATOR_UNITS
} from '../utils.js';

let globe = null;
let currentColorFn = null;
let _pendingContainerId = null;
let _pendingFlyTo = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function retryGlobe() {
    if (globe) return;
    if (_pendingContainerId) initGlobe(_pendingContainerId);
}

export function initGlobe(containerId) {
    _pendingContainerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) return;

    function doInit() {
        if (globe) return; // Already initialized
        if (typeof Globe === 'undefined') {
            console.warn('Globe.gl not loaded yet — will retry');
            return;
        }
        try {
        const features = DataLoader.getGeoFeatures();

        globe = Globe()(container)
            .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png')
            .backgroundColor('#ffffff')
            .showAtmosphere(true)
            .atmosphereColor('#e0e8f0')
            .atmosphereAltitude(0.15)
            .width(container.clientWidth)
            .height(container.clientHeight)
            .polygonsData(features)
            .polygonGeoJsonGeometry(d => d.geometry)
            .polygonCapColor(d => getCountryColor(d.properties.iso3))
            .polygonSideColor(() => 'rgba(30,96,145,0.06)')
            .polygonStrokeColor(() => '#6c757d')
            .polygonAltitude(d => {
                const iso3 = d.properties.iso3;
                return State.get('selectedCountries').includes(iso3) ? 0.02 : 0.005;
            })
            .polygonLabel(() => '')
            .onPolygonClick((polygon) => {
                const iso3 = polygon.properties.iso3;
                if (iso3) {
                    State.toggleCountry(iso3);
                    document.dispatchEvent(new CustomEvent('globe:countryClick', { detail: { iso3 } }));
                }
            })
            .onPolygonHover((polygon, prevPolygon) => {
                if (polygon) {
                    const iso3 = polygon.properties.iso3;
                    const name = polygon.properties.name || iso3 || 'Unknown';
                    if (!iso3) { Tooltip.hide(); return; }
                    const year = State.get('currentYear');
                    const indicator = State.get('indicator');
                    const val = DataLoader.getCountryValue(iso3, year);
                    const worldVal = DataLoader.getWorldValue(year);

                    const html = buildTooltipHTML(name, year, indicator, iso3, val, worldVal);

                    const rect = container.getBoundingClientRect();
                    Tooltip.show(html, {
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    });
                } else {
                    Tooltip.hide();
                }
            })
            .polygonsTransitionDuration(200);

        // Initial camera position (altitude controls visual size of globe)
        globe.pointOfView({ lat: 20, lng: 10, altitude: 2.8 });

        // Tooltip tracking
        container.addEventListener('mousemove', (e) => Tooltip.move(e));
        container.addEventListener('mouseleave', () => Tooltip.hide());

        // Responsive resize
        const resizeObserver = new ResizeObserver(() => {
            if (globe) {
                globe.width(container.clientWidth);
                globe.height(container.clientHeight);
            }
        });
        resizeObserver.observe(container);

        console.log('Globe initialized:', container.clientWidth + 'x' + container.clientHeight);

        // Fly to pending country (set before globe was ready)
        if (_pendingFlyTo) {
            flyToCountry(_pendingFlyTo);
            _pendingFlyTo = null;
        }
        } catch (err) {
            console.error('Globe initialization failed:', err);
        }
    }

    // Robust deferred initialization — multiple mechanisms to handle
    // race conditions when app goes from display:none to visible
    function tryInit() {
        if (globe) return true; // Already done
        if (container.clientWidth > 0 && container.clientHeight > 0) {
            doInit();
            return true;
        }
        return false;
    }

    if (!tryInit()) {
        // 1. ResizeObserver — primary mechanism
        const waitObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    waitObserver.disconnect();
                    tryInit();
                    break;
                }
            }
        });
        waitObserver.observe(container);

        // 2. Polling fallback — catches cases ResizeObserver misses
        let attempts = 0;
        const pollInterval = setInterval(() => {
            attempts++;
            if (tryInit() || attempts > 100) {
                clearInterval(pollInterval);
                waitObserver.disconnect();
            }
        }, 200);
    }

    return globe;
}

// ---------------------------------------------------------------------------
// Tooltip builder -- adapts content to the current indicator
// ---------------------------------------------------------------------------

function buildTooltipHTML(name, year, indicator, iso3, val, worldVal) {
    const rankIndicator = resolveRankIndicator(indicator);
    const rank = DataLoader.getCountryRank(iso3, year, rankIndicator);
    const total = DataLoader.getTotalCountries(year, rankIndicator);

    // Primary value for the active indicator — use resolveIndicatorValue for computed fields
    const primaryValue = resolveIndicatorValue(val, indicator);
    const primaryLabel = INDICATOR_LABELS[indicator] || indicator;

    // Ratio vs world for the active indicator
    const worldPrimary = resolveIndicatorValue(worldVal, indicator);
    const ratio = (primaryValue != null && worldPrimary) ? primaryValue / worldPrimary : null;

    // Always show CO2, GDP pc, HDI as secondary context
    const rows = [
        `<div class="tooltip-title"><span>${name}</span><span>${year}</span></div>`,
        `<div class="tooltip-row"><span class="tooltip-label">${primaryLabel}</span><span class="tooltip-value">${formatValue(primaryValue, indicator)}</span></div>`,
        `<div class="tooltip-row"><span class="tooltip-label">World rank</span><span class="tooltip-value">${rank ? formatRank(rank, total) : '\u2014'}</span></div>`,
        `<div class="tooltip-row"><span class="tooltip-label">vs World avg</span><span class="tooltip-value">${ratio != null ? formatRatio(ratio) : '\u2014'}</span></div>`
    ];

    // Add secondary rows for quick context
    if (indicator !== 'gdp_pc') {
        rows.push(`<div class="tooltip-row"><span class="tooltip-label">GDP per capita</span><span class="tooltip-value">${formatGDP(val?.gdp_pc)}</span></div>`);
    }
    if (indicator !== 'ghg' && indicator !== 'co2ff' && indicator !== 'ghg_pc') {
        rows.push(`<div class="tooltip-row"><span class="tooltip-label">GHG total</span><span class="tooltip-value">${formatEmissions(val?.ghg)}</span></div>`);
    }
    if (indicator === 'ghg') {
        rows.push(`<div class="tooltip-row"><span class="tooltip-label">CO\u2082 fossil</span><span class="tooltip-value">${formatEmissions(val?.co2ff)}</span></div>`);
        rows.push(`<div class="tooltip-row"><span class="tooltip-label">GHG per capita</span><span class="tooltip-value">${val?.ghg_pc != null ? val.ghg_pc.toFixed(1) + ' t' : '\u2014'}</span></div>`);
    }

    return rows.join('');
}

// ---------------------------------------------------------------------------
// Color logic -- indicator-aware
// ---------------------------------------------------------------------------

/**
 * Map an indicator key to the ranking indicator used by DataLoader.
 * Rankings are pre-computed for: gdp_pc, ghg, ghg_pc, co2ff, hdi, hdi_ng, pop,
 * mfa_ext_tot, mfa_con_tot, mfa_ext_pc, mfa_con_pc, crop_total, rli, pop_density
 */
function resolveRankIndicator(indicator) {
    const RANKED = new Set([
        'gdp_pc', 'ghg', 'ghg_pc', 'co2ff', 'hdi', 'hdi_ng', 'pop',
        'mfa_ext_tot', 'mfa_con_tot', 'mfa_ext_pc', 'mfa_con_pc',
        'crop_total', 'rli', 'pop_density'
    ]);
    if (RANKED.has(indicator)) return indicator;
    // Fallback to a reasonable default
    if (indicator.startsWith('mfa_')) return 'mfa_ext_tot';
    if (indicator.startsWith('crop_')) return 'crop_total';
    if (indicator === 'co2ff_pc') return 'co2ff';
    if (indicator === 'gdp_total') return 'gdp_pc';
    return 'gdp_pc';
}

function getCountryColor(iso3) {
    if (!iso3) return '#b0b0b0';
    try {
        const year = State.get('currentYear');
        const indicator = State.get('indicator');
        const val = DataLoader.getCountryValue(iso3, year);

        const fieldValue = resolveIndicatorValue(val, indicator);
        if (fieldValue == null || isNaN(fieldValue)) return '#b0b0b0'; // no data → medium gray
        if (fieldValue === 0) return '#f5f0e8'; // zero → warm cream

        return absoluteToColor(fieldValue, indicator);
    } catch (e) {
        return '#b0b0b0';
    }
}

function absoluteToColor(value, indicator) {
    const colorScale = getAbsoluteColorScale(indicator);

    if (indicator === 'hdi' || indicator === 'hdi_ng') {
        // Map HDI 0→1 to color scale 0.15→1.0 so low values still get visible color
        const raw = Math.max(0, Math.min(1, value));
        const t = 0.15 + raw * 0.85;
        return colorScale(t);
    }

    // Indicators that can be negative (land use change) — use linear scale
    if (indicator === 'co2luc' || indicator === 'co2luc_pc' || indicator === 'land' || indicator === 'land_pc') {
        const rangeMin = indicator.endsWith('_pc') ? -10 : -100;
        const rangeMax = indicator.endsWith('_pc') ? 20 : 500;
        const t = Math.max(0, Math.min(1, (value - rangeMin) / (rangeMax - rangeMin)));
        return colorScale(t);
    }

    let logMin, logMax;
    if (indicator === 'ghg' || indicator === 'co2ff' || indicator === 'ff' || indicator === 'coal' || indicator === 'oil' || indicator === 'gas') {
        logMin = Math.log(0.1);
        logMax = Math.log(10000);
    } else if (indicator === 'ch4') {
        logMin = Math.log(0.1);
        logMax = Math.log(500);
    } else if (indicator === 'n2o') {
        logMin = Math.log(0.01);
        logMax = Math.log(100);
    } else if (indicator === 'fgas') {
        logMin = Math.log(0.001);
        logMax = Math.log(50);
    } else if (indicator === 'ghg_pc' || indicator === 'co2ff_pc' || indicator === 'ff_pc' || indicator === 'ch4_pc' || indicator === 'n2o_pc' || indicator === 'coal_pc' || indicator === 'oil_pc' || indicator === 'gas_pc') {
        logMin = Math.log(0.1);
        logMax = Math.log(40);
    } else if (indicator === 'fgas_pc') {
        logMin = Math.log(0.001);
        logMax = Math.log(5);
    } else if (indicator === 'pop') {
        logMin = Math.log(0.05);
        logMax = Math.log(1500);
    } else if (indicator === 'pop_density') {
        logMin = Math.log(1);
        logMax = Math.log(5000);
    } else if (indicator === 'gdp_total') {
        logMin = Math.log(100);
        logMax = Math.log(50000000);
    } else if (indicator === 'gdp_pc') {
        logMin = Math.log(400);
        logMax = Math.log(80000);
    } else if (indicator === 'rli') {
        // RLI is 0-1 index, treat like HDI
        const raw = Math.max(0, Math.min(1, value));
        const t = 0.15 + raw * 0.85;
        return colorScale(t);
    } else if (indicator.startsWith('mfa_') && indicator.endsWith('_pc')) {
        logMin = Math.log(0.5);
        logMax = Math.log(100);
    } else if (indicator.startsWith('mfa_')) {
        logMin = Math.log(1);
        logMax = Math.log(20000);
    } else if (indicator === 'crop_total_pc') {
        logMin = Math.log(0.01);
        logMax = Math.log(5);
    } else if (indicator.startsWith('crop_')) {
        logMin = Math.log(0.01);
        logMax = Math.log(500);
    } else {
        logMin = Math.log(0.1);
        logMax = Math.log(10000);
    }

    const safeValue = Math.max(Math.exp(logMin), value);
    const t = Math.max(0, Math.min(1, (Math.log(safeValue) - logMin) / (logMax - logMin)));
    return colorScale(t);
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function updateGlobeColors() {
    if (!globe) return;
    globe.polygonCapColor(d => getCountryColor(d.properties.iso3));
    globe.polygonAltitude(d => {
        const iso3 = d.properties.iso3;
        return State.get('selectedCountries').includes(iso3) ? 0.02 : 0.005;
    });
}

export function updateGlobeLegend() {
    const container = document.getElementById('globe-legend');
    if (!container) return;

    const indicator = State.get('indicator');
    container.innerHTML = buildAbsoluteLegend(indicator);
}

function buildAbsoluteLegend(indicator) {
    const colorScale = getAbsoluteColorScale(indicator);
    const isHdi = indicator === 'hdi' || indicator === 'hdi_ng';
    const stops = 12;
    const swatches = [];
    for (let i = 0; i <= stops; i++) {
        // For HDI, use compressed range 0.15→1.0 to match actual map colors
        const t = isHdi ? 0.15 + (i / stops) * 0.85 : i / stops;
        swatches.push(`<span class="legend-swatch" style="background:${colorScale(t)}"></span>`);
    }

    let lowLabel, midLabel, highLabel;
    if (indicator === 'hdi' || indicator === 'hdi_ng') {
        lowLabel = '0'; midLabel = '0.5'; highLabel = '1.0';
    } else if (indicator === 'rli') {
        lowLabel = '0'; midLabel = '0.5'; highLabel = '1.0';
    } else if (indicator === 'ghg' || indicator === 'co2ff' || indicator === 'ff') {
        lowLabel = '0.1 Mt'; midLabel = '100 Mt'; highLabel = '10 Gt';
    } else if (indicator === 'ch4') {
        lowLabel = '0.1 Mt'; midLabel = '10 Mt'; highLabel = '500 Mt';
    } else if (indicator === 'n2o') {
        lowLabel = '0.01 Mt'; midLabel = '1 Mt'; highLabel = '100 Mt';
    } else if (indicator === 'fgas') {
        lowLabel = '0.001 Mt'; midLabel = '0.1 Mt'; highLabel = '50 Mt';
    } else if (indicator === 'ghg_pc' || indicator === 'co2ff_pc' || indicator === 'ff_pc') {
        lowLabel = '0.1 t'; midLabel = '3 t'; highLabel = '40 t';
    } else if (indicator === 'co2luc' || indicator === 'land') {
        lowLabel = '-100 Mt'; midLabel = '0'; highLabel = '500 Mt';
    } else if (indicator === 'pop') {
        lowLabel = '~0'; midLabel = '50 M'; highLabel = '1.5 B';
    } else if (indicator === 'pop_density') {
        lowLabel = '1'; midLabel = '100'; highLabel = '5K/km\u00B2';
    } else if (indicator === 'gdp_total') {
        lowLabel = '$100M'; midLabel = '$500B'; highLabel = '$50T';
    } else if (indicator.startsWith('mfa_') && indicator.endsWith('_pc')) {
        lowLabel = '0.5 t'; midLabel = '10 t'; highLabel = '100 t';
    } else if (indicator.startsWith('mfa_')) {
        lowLabel = '1 Mt'; midLabel = '500 Mt'; highLabel = '20 Gt';
    } else if (indicator === 'crop_total_pc') {
        lowLabel = '0.01 ha'; midLabel = '0.5 ha'; highLabel = '5 ha';
    } else if (indicator.startsWith('crop_')) {
        lowLabel = '0.01 Mha'; midLabel = '10 Mha'; highLabel = '500 Mha';
    } else if (indicator === 'gdp_pc') {
        lowLabel = '$400'; midLabel = '$6K'; highLabel = '$80K';
    } else {
        lowLabel = 'Low'; midLabel = 'Mid'; highLabel = 'High';
    }

    return `
        <div class="legend-title">${INDICATOR_LABELS[indicator] || indicator}</div>
        <div class="legend-row">
            <div class="legend-main">
                <div class="legend-bar"><span class="legend-swatch" style="background:#ffffff;border:1px solid #ddd;box-sizing:border-box"></span>${swatches.join('')}</div>
                <div class="legend-labels"><span>0</span><span>${midLabel}</span><span>${highLabel}</span></div>
            </div>
            <div class="legend-nodata"><div class="legend-nodata-swatch"></div><div class="legend-nodata-label">No data</div></div>
        </div>
    `;
}

export function flyToCountry(iso3) {
    if (!globe) {
        _pendingFlyTo = iso3;
        return;
    }
    const features = DataLoader.getGeoFeatures();
    const feature = features.find(f => f.properties.iso3 === iso3);
    if (feature) {
        const centroid = d3.geoCentroid(feature);
        globe.pointOfView({ lat: centroid[1], lng: centroid[0], altitude: 2.0 }, 800);
    }
}

export function resetGlobeView() {
    if (!globe) return;
    globe.pointOfView({ lat: 20, lng: 10, altitude: 2.8 }, 800);
}
