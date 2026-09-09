// ============================================================================
// GLOBE RENDERER - Globe.gl wrapper for multi-indicator visualization
// ============================================================================

import DataLoader from '../data-loader.js?v=20260909a';
import State from '../state.js?v=20260909a';
import Tooltip from '../components/tooltip.js?v=20260909a';
import {
    COLORS, formatValue, formatGDP, formatEmissions, formatRank, formatRatio,
    getMapColor, MAP_NO_DATA, buildMapLegendHTML, resolveIndicatorValue,
    INDICATOR_LABELS, INDICATOR_UNITS
} from '../utils.js?v=20260909a';

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
            // V7b (2026-09-09): no sphere texture. The old earth-water.png is a
            // land/water mask that paints LAND BLACK; the 110m polygons are
            // coarser than its coastline, so wherever the mask's land ran past
            // a polygon's edge a black splinter showed along the coast (and,
            // at a grazing angle, inside Greenland). A plain sphere in the
            // paper's white does not have a coastline to disagree with.
            .globeImageUrl(null)
            // the same paper the explorer is printed on (--bg), so the globe
            // is not a white hole in the middle of a cream page
            .backgroundColor('#f2ede0')
            .showAtmosphere(true)
            .atmosphereColor('#7fa6c2')
            .atmosphereAltitude(0.15)
            .width(container.clientWidth)
            .height(container.clientHeight)
            .polygonsData(features)
            .polygonGeoJsonGeometry(d => d.geometry)
            .polygonCapColor(d => getCountryColor(d.properties.iso3))
            // V7b: no walls either. The caps sit just off the sphere (0.006
            // clears z-fighting with the sphere, also on a software renderer)
            // on fully transparent sides; the dark sea-at-10 % sides of V7 read
            // as a second set of splinters. Hover and click are raycast against
            // the caps, so neither changes.
            .polygonSideColor(() => 'rgba(0,0,0,0)')
            .polygonStrokeColor(() => '#6f6a5f')
            .polygonAltitude(d => {
                const iso3 = d.properties.iso3;
                return State.get('selectedCountries').includes(iso3) ? 0.015 : 0.006;
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

        // The bare sphere: the paper's own white, lit by globe.gl's lights so it
        // still reads as a ball. (Color.set needs no THREE global.)
        try { globe.globeMaterial().color.set('#f8f5ee'); } catch (e) { /* older globe.gl */ }

        // Initial camera position (altitude controls visual size of globe)
        globe.pointOfView({ lat: 20, lng: 10, altitude: 2.8 });

        // Tooltip tracking
        container.addEventListener('mousemove', (e) => Tooltip.move(e));
        container.addEventListener('mouseleave', () => Tooltip.leave());

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
    if (!iso3) return MAP_NO_DATA;
    try {
        const value = resolveIndicatorValue(
            DataLoader.getCountryValue(iso3, State.get('currentYear')), State.get('indicator'));
        return getMapColor(value, State.get('indicator'));
    } catch (e) {
        return MAP_NO_DATA;
    }
}

// The globe used to carry its own copy of the choropleth's log bounds, and the
// two copies had drifted: material flows ran 1-20000 here and 0.5-3000 on the
// map, crops 0.01-5 here and 0.01-15 there, so the same country in the same
// year came out a different colour depending on which view you opened. Both
// now read MAP_DOMAINS from js/utils.js through getMapColor().

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function updateGlobeColors() {
    if (!globe) return;
    globe.polygonCapColor(d => getCountryColor(d.properties.iso3));
    globe.polygonAltitude(d => {
        const iso3 = d.properties.iso3;
        return State.get('selectedCountries').includes(iso3) ? 0.015 : 0.006;
    });
}

export function updateGlobeLegend() {
    const container = document.getElementById('globe-legend');
    if (!container) return;
    container.innerHTML = buildMapLegendHTML(State.get('indicator'));
}

// buildAbsoluteLegend() is gone with it: thirteen swatches under three labels
// picked by a chain of if/else that no longer matched the scale it described
// (it still announced 10 Gt for GHG when the map topped out at 5 Gt, and fell
// back to "Low / Mid / High" for every indicator nobody had listed).

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

// Exposed so the PNG export can force one frame before reading the WebGL
// buffer -- globe.gl renders on demand and the buffer is otherwise blank.
export function renderGlobeFrame() {
    if (!globe) return null;
    try {
        globe.renderer().render(globe.scene(), globe.camera());
        return globe.renderer().domElement;
    } catch (e) {
        return null;
    }
}
