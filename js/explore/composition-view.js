// ============================================================================
// COMPOSITION VIEW - Treemap showing indicator decomposition
// GHG: by gas type; MFA: by material type
// Supports viewing for world, single country, or sum of selected countries
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import {
    COLORS,
    INDICATOR_LABELS,
    formatValue,
    formatMFA,
    formatEmissions,
    formatCrops,
    resolveIndicatorValue,
    getColorForIndex,
    MFA_MATERIAL_LABELS,
    MFA_MATERIAL_COLORS,
    MFA_FLOW_LABELS,
    CROPS_COMPONENT_KEYS,
    CROPS_COMPONENT_LABELS,
    CROPS_COMPONENT_COLORS
} from '../utils.js';

let container = null;
let resizeObserver = null;
let debounceTimer = null;

// GHG gas components
const GHG_COMPONENTS = [
    { key: 'co2ff',  label: 'CO\u2082 fossil fuels', color: '#e63946' },
    { key: 'co2luc', label: 'CO\u2082 land use',     color: '#d4a574' },
    { key: 'ch4',    label: 'CH\u2084 methane',       color: '#e9c46a' },
    { key: 'n2o',    label: 'N\u2082O',               color: '#2a9d8f' },
    { key: 'fgas',   label: 'F-gases',                color: '#6a4c93' }
];

// MFA material components
const MFA_COMPONENTS = [
    { key: 'bio', label: 'Biomass',                 color: '#e07b39' },
    { key: 'ff',  label: 'Fossil fuels',            color: '#2d2d2d' },
    { key: 'met', label: 'Metal ores',              color: '#5b7fa5' },
    { key: 'min', label: 'Non-metallic minerals',   color: '#c9b458' }
];

// Crops / Land Use components
const CROPS_COMPONENTS = [
    { key: 'crop_cropland',  label: 'Cropland',          color: CROPS_COMPONENT_COLORS.crop_cropland },
    { key: 'crop_arable',    label: 'Arable land',       color: CROPS_COMPONENT_COLORS.crop_arable },
    { key: 'crop_permanent', label: 'Permanent crops',   color: CROPS_COMPONENT_COLORS.crop_permanent },
    { key: 'crop_pastures',  label: 'Permanent pastures', color: CROPS_COMPONENT_COLORS.crop_pastures }
];

function getCountryValueField(base) {
    if (base === 'pop') return State.get('popType') === 'density' ? 'pop_density' : 'pop';
    if (base === 'gdp') return 'gdp_total';
    if (base === 'hdi' || base === 'hdi_ng') return base;
    if (base === 'bio') return 'rli';
    return State.get('indicator');
}

function renderCountryValueComposition(base, year, width, height) {
    const field = getCountryValueField(base);
    const label = INDICATOR_LABELS[field] || field;
    const selectedCountries = State.get('selectedCountries') || [];
    const sources = selectedCountries.length > 0
        ? selectedCountries
        : DataLoader.getAllMetadata().map(m => m.iso3);

    const children = sources.map((iso3, idx) => {
        const row = DataLoader.getCountryValue(iso3, year);
        const value = resolveIndicatorValue(row, field);
        if (value == null || !Number.isFinite(value) || value <= 0) return null;
        const meta = DataLoader.getMetadata(iso3);
        return {
            name: meta ? meta.name : iso3,
            value,
            iso3,
            color: selectedCountries.length <= 20 ? getColorForIndex(idx) : null
        };
    }).filter(Boolean).sort((a, b) => b.value - a.value);

    if (!children.length) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl,#adb5bd);font-size:13px;font-family:Inter,sans-serif">No country data for year ' + year + '</div>';
        return;
    }

    const maxValue = d3.max(children, d => d.value) || 1;
    const colorScale = d3.scaleSequential(d3.interpolateYlGnBu).domain([0, maxValue]);
    children.forEach(d => { if (!d.color) d.color = colorScale(d.value); });

    const total = children.reduce((s, d) => s + d.value, 0);
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'position:relative;padding:6px 12px;font-size:11px;font-weight:600;color:var(--cg,#495057);font-family:Inter,sans-serif;text-transform:uppercase;letter-spacing:.3px;background:rgba(255,255,255,.85);z-index:2;flex-shrink:0';
    const scope = selectedCountries.length > 0 ? children.length + ' selected countries' : 'All countries';
    titleBar.textContent = `${label} by country — ${scope} — ${year}`;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;flex:1;min-height:0';

    const treemapHeight = Math.max(height - 30, 100);
    const root = d3.hierarchy({ children })
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .size([width, treemapHeight])
        .padding(1)
        .round(true)(root);

    root.leaves().forEach(leaf => {
        const d = leaf.data;
        const w = leaf.x1 - leaf.x0;
        const h = leaf.y1 - leaf.y0;
        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0';

        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute;left:${leaf.x0}px;top:${leaf.y0}px;width:${w}px;height:${h}px;background:${d.color};overflow:hidden;cursor:pointer;transition:opacity .15s`;
        cell.addEventListener('mouseenter', () => { cell.style.opacity = '0.85'; });
        cell.addEventListener('mouseleave', () => { cell.style.opacity = '1'; });

        const text = document.createElement('div');
        text.style.cssText = 'padding:6px 8px;color:#fff;font-family:Inter,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.45)';
        if (w > 52 && h > 22) {
            const nameEl = document.createElement('div');
            nameEl.style.cssText = `font-size:${w > 140 ? '12' : '10'}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
            nameEl.textContent = d.name;
            text.appendChild(nameEl);
        }
        if (w > 88 && h > 52) {
            const valEl = document.createElement('div');
            valEl.style.cssText = 'font-size:11px;opacity:.9;margin-top:2px';
            valEl.textContent = formatValue(d.value, field);
            text.appendChild(valEl);

            const pctEl = document.createElement('div');
            pctEl.style.cssText = 'font-size:10px;opacity:.75;margin-top:1px';
            pctEl.textContent = pct + '% of shown total';
            text.appendChild(pctEl);
        }

        cell.title = `${d.name}\n${formatValue(d.value, field)}\n${pct}% of shown total`;
        cell.appendChild(text);
        wrap.appendChild(cell);
    });

    container.appendChild(titleBar);
    container.appendChild(wrap);
}

export function initCompositionView() {
    container = document.getElementById('explore-composition-container');
    if (container && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
            if (State.get('exploreView') === 'composition') {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => render(), 100);
            }
        });
        resizeObserver.observe(container);
    }
}

export function updateCompositionView() {
    if (!container) return;
    requestAnimationFrame(() => requestAnimationFrame(() => render()));
}

export function destroyCompositionView() {
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (container) container.innerHTML = '';
}

// ============================================================================
// Main render
// ============================================================================

function render() {
    if (!container) return;
    container.innerHTML = '';
    container.style.cssText = 'flex:1;position:relative;overflow:hidden;min-height:0;display:flex;flex-direction:column';

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    const base = State.get('baseIndicator');
    const year = State.get('currentYear');
    const facetMode = State.get('facetMode');

    let components, dataKeys, title, formatFn;

    if (base === 'ghg') {
        components = GHG_COMPONENTS;
        dataKeys = GHG_COMPONENTS.map(c => c.key);
        title = 'GHG emissions by gas';
        formatFn = formatEmissions;
    } else if (base === 'mfa') {
        const flow = State.get('mfaFlow') || 'ext';
        const flowLabel = MFA_FLOW_LABELS[flow] || flow;
        components = MFA_COMPONENTS.map(c => ({
            ...c,
            dataKey: `mfa_${flow}_${c.key}`
        }));
        dataKeys = components.map(c => c.dataKey);
        title = `Material ${flowLabel.toLowerCase()} by type`;
        formatFn = formatMFA;
    } else if (base === 'crops') {
        const selectedCrops = State.get('selectedCrops') || ['total'];
        const cropKeys = selectedCrops.includes('total') ? CROPS_COMPONENT_KEYS : selectedCrops;
        components = CROPS_COMPONENTS.filter(c => cropKeys.includes(c.key));
        dataKeys = CROPS_COMPONENTS.map(c => c.key);
        title = 'Agricultural land by type';
        formatFn = formatCrops;
    } else {
        renderCountryValueComposition(base, year, width, height);
        return;
    }

    const countries = State.get('selectedCountries');

    // ---- Facet by country: render a grid of mini-treemaps ----
    if (facetMode === 'country' && countries.length > 0) {
        Object.assign(container.style, {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'4px',overflow:'auto',padding:'4px',flex:'1',position:'relative'});
        countries.forEach(iso3 => {
            const meta = DataLoader.getMetadata(iso3);
            const countryName = meta ? meta.name : iso3;
            const cd = DataLoader.getCountryData(iso3);
            let dataRow = {};
            if (cd) {
                const row = cd.find(d => d.y === year);
                if (row) {
                    const keys = base === 'mfa' ? dataKeys : components.map(c => c.key);
                    keys.forEach(k => {
                        const v = resolveIndicatorValue(row, k);
                        if (v != null && !isNaN(v)) dataRow[k] = v;
                    });
                }
            }
            const panel = document.createElement('div');
            panel.style.cssText = 'border:1px solid var(--cb,#e0e0e0);position:relative;min-height:200px';
            renderTreemapInto(panel, components, dataRow, formatFn, countryName, year, title);
            container.appendChild(panel);
        });
        return;
    }

    // ---- Facet by component: one panel per component, showing breakdown by country ----
    if (facetMode === 'component' && (base === 'ghg' || base === 'mfa' || base === 'crops')) {
        Object.assign(container.style, {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'4px',overflow:'auto',padding:'4px',flex:'1',position:'relative'});
        const sources = countries.length > 0 ? countries : ['WORLD'];

        components.forEach(comp => {
            const compKey = comp.dataKey || comp.key;
            // Build children: one per country/world, value = that country's value for this component
            const children = [];
            sources.forEach((iso3, idx) => {
                let value = 0;
                if (iso3 === 'WORLD') {
                    const worldData = DataLoader.getWorldData();
                    const wd = worldData ? worldData.find(d => d.y === year) : null;
                    if (wd) {
                        const v = resolveIndicatorValue(wd, compKey);
                        if (v != null) value = v;
                    }
                } else {
                    const cd = DataLoader.getCountryData(iso3);
                    if (cd) {
                        const row = cd.find(d => d.y === year);
                        if (row) {
                            const v = resolveIndicatorValue(row, compKey);
                            if (v != null) value = v;
                        }
                    }
                }
                if (value > 0) {
                    const meta = iso3 === 'WORLD' ? null : DataLoader.getMetadata(iso3);
                    children.push({
                        name: iso3 === 'WORLD' ? 'World' : (meta ? meta.name : iso3),
                        value: value,
                        color: iso3 === 'WORLD' ? comp.color : getColorForIndex(idx),
                        key: iso3
                    });
                }
            });

            const panel = document.createElement('div');
            panel.style.cssText = 'border:1px solid var(--cb,#e0e0e0);position:relative;min-height:200px';

            if (children.length === 0) {
                panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl,#adb5bd);font-size:12px;font-family:Inter,sans-serif">No data</div>';
                const lbl = document.createElement('div');
                lbl.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:4px 8px;font-size:10px;font-weight:600;color:var(--cg,#495057);font-family:Inter,sans-serif;text-transform:uppercase;letter-spacing:.3px;background:rgba(255,255,255,.85);z-index:2;pointer-events:none';
                lbl.textContent = comp.label + ' \u2014 ' + year;
                panel.appendChild(lbl);
            } else {
                // Reuse renderTreemapInto with custom "components" that are actually countries
                const pseudoComponents = children.map(c => ({
                    key: c.key,
                    dataKey: c.key,
                    label: c.name,
                    color: c.color
                }));
                const pseudoDataRow = {};
                children.forEach(c => { pseudoDataRow[c.key] = c.value; });
                renderTreemapInto(panel, pseudoComponents, pseudoDataRow, formatFn, comp.label, year, title);
            }

            container.appendChild(panel);
        });
        return;
    }

    // ---- Single aggregated treemap (default) ----
    let dataRow = {};

    if (countries.length === 0) {
        // World data
        const worldData = DataLoader.getWorldData();
        const wd = worldData ? worldData.find(d => d.y === year) : null;
        if (wd) dataRow = wd;
    } else {
        // Sum selected countries
        countries.forEach(iso3 => {
            const cd = DataLoader.getCountryData(iso3);
            if (!cd) return;
            const row = cd.find(d => d.y === year);
            if (!row) return;
            const keys = base === 'mfa' ? dataKeys : components.map(c => c.key);
            keys.forEach(k => {
                const v = resolveIndicatorValue(row, k);
                if (v != null && !isNaN(v)) {
                    dataRow[k] = (dataRow[k] || 0) + v;
                }
            });
        });
    }

    // Build treemap data
    const children = components.map(c => {
        const key = c.dataKey || c.key;
        const value = dataRow[key] != null ? dataRow[key] : resolveIndicatorValue(dataRow, key);
        return {
            name: c.label,
            value: (value != null && value > 0) ? value : 0,
            color: c.color,
            key: key
        };
    }).filter(d => d.value > 0);

    if (children.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl,#adb5bd);font-size:13px;font-family:Inter,sans-serif">No data for year ' + year + '</div>';
        return;
    }

    const total = children.reduce((s, d) => s + d.value, 0);

    // D3 treemap layout
    const root = d3.hierarchy({ children })
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    const treemapHeight = Math.max(height - 30, 100); // reserve space for title bar
    d3.treemap()
        .size([width, treemapHeight])
        .padding(2)
        .round(true)(root);

    // Create treemap container
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:relative;width:100%;flex:1;min-height:0`;

    root.leaves().forEach(leaf => {
        const d = leaf.data;
        const w = leaf.x1 - leaf.x0;
        const h = leaf.y1 - leaf.y0;
        const pct = ((d.value / total) * 100).toFixed(1);

        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute;left:${leaf.x0}px;top:${leaf.y0}px;width:${w}px;height:${h}px;background:${d.color};overflow:hidden;cursor:pointer;transition:opacity .15s`;
        cell.addEventListener('mouseenter', () => { cell.style.opacity = '0.85'; });
        cell.addEventListener('mouseleave', () => { cell.style.opacity = '1'; });

        // Label
        const label = document.createElement('div');
        label.style.cssText = 'padding:8px 10px;color:#fff;font-family:Inter,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.4)';

        const showDetail = w > 80 && h > 50;
        const showName = w > 50 && h > 25;

        if (showName) {
            const nameEl = document.createElement('div');
            nameEl.style.cssText = `font-size:${w > 150 ? '13' : '11'}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
            nameEl.textContent = d.name;
            label.appendChild(nameEl);
        }

        if (showDetail) {
            const valEl = document.createElement('div');
            valEl.style.cssText = 'font-size:12px;opacity:.85;margin-top:2px';
            valEl.textContent = formatFn(d.value);
            label.appendChild(valEl);

            const pctEl = document.createElement('div');
            pctEl.style.cssText = 'font-size:11px;opacity:.7;margin-top:1px';
            pctEl.textContent = pct + '% of total';
            label.appendChild(pctEl);
        }

        cell.appendChild(label);

        // Tooltip for small cells
        cell.title = `${d.name}\n${formatFn(d.value)}\n${pct}% of total`;

        wrap.appendChild(cell);
    });

    // Title bar (normal flow, before the treemap)
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'position:relative;padding:6px 12px;font-size:11px;font-weight:600;color:var(--cg,#495057);font-family:Inter,sans-serif;text-transform:uppercase;letter-spacing:.3px;background:rgba(255,255,255,.85);z-index:2;flex-shrink:0';
    const scope = countries.length === 0 ? 'World'
        : countries.length === 1 ? (DataLoader.getMetadata(countries[0]) || {}).name || countries[0]
        : countries.length + ' countries';
    titleBar.textContent = `${title} \u2014 ${scope} \u2014 ${year}`;

    container.appendChild(titleBar);
    container.appendChild(wrap);
}

// ============================================================================
// Render a treemap into a given DOM element (used by both single and faceted)
// ============================================================================

function renderTreemapInto(panel, components, dataRow, formatFn, scopeLabel, year, titleText) {
    const children = components.map(c => {
        const key = c.dataKey || c.key;
        const value = dataRow[key] != null ? dataRow[key] : resolveIndicatorValue(dataRow, key);
        return {
            name: c.label,
            value: (value != null && value > 0) ? value : 0,
            color: c.color,
            key: key
        };
    }).filter(d => d.value > 0);

    if (children.length === 0) {
        panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl,#adb5bd);font-size:12px;font-family:Inter,sans-serif">No data</div>';
        // Still add the country label
        const lbl = document.createElement('div');
        lbl.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:4px 8px;font-size:10px;font-weight:600;color:var(--cg,#495057);font-family:Inter,sans-serif;text-transform:uppercase;letter-spacing:.3px;background:rgba(255,255,255,.85);z-index:2;pointer-events:none';
        lbl.textContent = scopeLabel + ' \u2014 ' + year;
        panel.appendChild(lbl);
        return;
    }

    const total = children.reduce((s, d) => s + d.value, 0);

    // Need to measure panel after it is in the DOM; use fixed sizing
    // We render after appending, so use a requestAnimationFrame-style approach
    // Instead, set a fixed height and use that
    const pw = panel.offsetWidth || 280;
    const ph = 200;
    panel.style.height = ph + 'px';

    const root = d3.hierarchy({ children })
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .size([pw, ph])
        .padding(2)
        .round(true)(root);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;height:100%';

    root.leaves().forEach(leaf => {
        const d = leaf.data;
        const w = leaf.x1 - leaf.x0;
        const h = leaf.y1 - leaf.y0;
        const pct = ((d.value / total) * 100).toFixed(1);

        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute;left:${leaf.x0}px;top:${leaf.y0}px;width:${w}px;height:${h}px;background:${d.color};overflow:hidden;cursor:pointer;transition:opacity .15s`;
        cell.addEventListener('mouseenter', () => { cell.style.opacity = '0.85'; });
        cell.addEventListener('mouseleave', () => { cell.style.opacity = '1'; });

        const label = document.createElement('div');
        label.style.cssText = 'padding:4px 6px;color:#fff;font-family:Inter,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.4)';

        const showDetail = w > 60 && h > 40;
        const showName = w > 40 && h > 20;

        if (showName) {
            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
            nameEl.textContent = d.name;
            label.appendChild(nameEl);
        }

        if (showDetail) {
            const valEl = document.createElement('div');
            valEl.style.cssText = 'font-size:10px;opacity:.85;margin-top:1px';
            valEl.textContent = formatFn(d.value);
            label.appendChild(valEl);

            const pctEl = document.createElement('div');
            pctEl.style.cssText = 'font-size:9px;opacity:.7;margin-top:1px';
            pctEl.textContent = pct + '%';
            label.appendChild(pctEl);
        }

        cell.appendChild(label);
        cell.title = `${d.name}\n${formatFn(d.value)}\n${pct}% of total`;
        wrap.appendChild(cell);
    });

    // Country/scope label
    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:4px 8px;font-size:10px;font-weight:600;color:var(--cg,#495057);font-family:Inter,sans-serif;text-transform:uppercase;letter-spacing:.3px;background:rgba(255,255,255,.85);z-index:2;pointer-events:none';
    titleBar.textContent = scopeLabel + ' \u2014 ' + year;

    panel.appendChild(wrap);
    panel.appendChild(titleBar);
}
