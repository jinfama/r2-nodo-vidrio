// ============================================================================
// TREND VIEW - Line/Area chart for time series comparison
// Supports absolute values, % of world total, and GHG stacked area decomposition
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import Tooltip from '../components/tooltip.js';
import {
    COLORS,
    INDICATOR_LABELS,
    INDICATOR_UNITS,
    MFA_FLOW_LABELS,
    MFA_MATERIAL_LABELS,
    MFA_MATERIAL_COLORS,
    CROPS_COMPONENT_KEYS,
    CROPS_COMPONENT_LABELS,
    CROPS_COMPONENT_COLORS,
    getColorForIndex,
    formatValue,
    resolveIndicatorValue
} from '../utils.js';

let currentContainer = null;
let drawMode = 'line';       // 'line' | 'stacked'
let valueMode = 'abs';       // 'abs' | 'pctWorld' | 'pctGroup' | 'index'
let useLog = false;           // independent toggle — combines with any valueMode
let _yearMarkerState = null; // {g, xScale, yScale, series, indicator} for lightweight updates

// GHG gas components for stacked area decomposition
const GAS_COMPONENTS = [
    { key: 'co2ff', label: 'CO\u2082 fossil', color: '#e63946' },
    { key: 'co2luc', label: 'CO\u2082 land use', color: '#d4a574' },
    { key: 'ch4', label: 'CH\u2084 methane', color: '#e9c46a' },
    { key: 'n2o', label: 'N\u2082O', color: '#2a9d8f' },
    { key: 'fgas', label: 'F-gases', color: '#6a4c93' },
    { key: 'coal', label: 'Coal CO\u2082', color: '#4a4a4a' },
    { key: 'oil', label: 'Oil CO\u2082', color: '#8b5e3c' },
    { key: 'gas', label: 'Natural gas CO\u2082', color: '#5b9bd5' }
];
const ALL_GAS_KEYS = ['co2ff', 'co2luc', 'ch4', 'n2o', 'fgas'];

function getComponentDefinitions(keys) {
    return keys.map(key => {
        const gas = GAS_COMPONENTS.find(gc => gc.key === key);
        if (gas) return gas;

        const mfaMatch = key.match(/^mfa_(ext|con|imp|exp|bal|mf)_(bio|ff|met|min)$/);
        if (mfaMatch) {
            const [, flow, material] = mfaMatch;
            const flowLabel = (MFA_FLOW_LABELS[flow] || flow).toLowerCase();
            return {
                key,
                label: `${MFA_MATERIAL_LABELS[material] || material} ${flowLabel}`,
                color: MFA_MATERIAL_COLORS[material] || COLORS.mfa
            };
        }

        if (CROPS_COMPONENT_KEYS.includes(key)) {
            return {
                key,
                label: CROPS_COMPONENT_LABELS[key] || key,
                color: CROPS_COMPONENT_COLORS[key] || COLORS.success
            };
        }

        return {
            key,
            label: INDICATOR_LABELS[key] || key,
            color: COLORS.gray
        };
    });
}

function getResponsivePanelColumns(count, width) {
    if (count <= 1) return 1;
    const maxColumns = width < 1050 ? 2 : 3;
    return Math.min(count, maxColumns);
}

function getSelectedMfaComponentKeys() {
    const flow = State.get('mfaFlow') || 'ext';
    const mats = State.get('selectedMaterials') || ['total'];
    if (mats.includes('total')) return [];
    return mats.map(m => `mfa_${flow}_${m}`);
}

function getSelectedCropComponentKeys() {
    const crops = State.get('selectedCrops') || ['total'];
    if (crops.includes('total')) return [];
    return crops;
}

function getMfaAxisIndicator() {
    const flow = State.get('mfaFlow') || 'ext';
    return State.get('perCapita') ? `mfa_${flow}_pc` : `mfa_${flow}_tot`;
}

// ============================================================================
// Value transforms & helpers — shared across all rendering functions
// ============================================================================

function applySeriesTransform(series, vMode, indicator) {
    if (vMode === 'pctWorld') {
        const worldData = DataLoader.getWorldData();
        const worldByYear = new Map();
        worldData?.forEach(d => {
            const v = resolveIndicatorValue(d, indicator);
            if (v != null && v > 0) worldByYear.set(d.y, v);
        });
        series.forEach(s => {
            s.data = s.data.map(d => ({
                y: d.y,
                v: d.v != null && worldByYear.get(d.y) > 0
                    ? (d.v / worldByYear.get(d.y)) * 100 : null
            }));
        });
    } else if (vMode === 'pctGroup') {
        const groupTotal = new Map();
        series.forEach(s => {
            s.data.forEach(d => {
                if (d.v != null) groupTotal.set(d.y, (groupTotal.get(d.y) || 0) + d.v);
            });
        });
        series.forEach(s => {
            s.data = s.data.map(d => ({
                y: d.y,
                v: d.v != null && groupTotal.get(d.y) > 0
                    ? (d.v / groupTotal.get(d.y)) * 100 : null
            }));
        });
    } else if (vMode === 'index') {
        series.forEach(s => {
            const baseline = s.data.find(d => d.v != null)?.v;
            if (baseline && baseline > 0) {
                s.data = s.data.map(d => ({
                    y: d.y,
                    v: d.v != null ? (d.v / baseline) * 100 : null
                }));
            }
        });
    }
    // 'abs' doesn't modify data
}

function makeYScale(yMin, yMax, h, isLog) {
    if (isLog) {
        // Floor at smallest positive value or 0.1; log can't handle ≤0
        const logMin = yMin > 0 ? yMin * 0.9 : 0.1;
        return d3.scaleLog().domain([logMin, yMax]).range([h, 0]).nice();
    }
    return d3.scaleLinear().domain([yMin, yMax]).range([h, 0]).nice();
}

function getYAxisFormat(vMode) {
    if (vMode === 'pctWorld' || vMode === 'pctGroup') return d => d.toFixed(0) + '%';
    if (vMode === 'index') return d => {
        if (Math.abs(d) >= 1e6) return (d / 1e6).toFixed(0) + 'M';
        if (Math.abs(d) >= 1e3) return (d / 1e3).toFixed(1) + 'K';
        return d.toFixed(0);
    };
    return d => {
        if (Math.abs(d) >= 1e6) return (d / 1e6).toFixed(0) + 'M';
        if (Math.abs(d) >= 1e3) return (d / 1e3).toFixed(0) + 'K';
        return d;
    };
}

function getYLabel(vMode, indicator, isLog) {
    const label = INDICATOR_LABELS[indicator] || indicator;
    let base;
    switch (vMode) {
        case 'pctWorld': base = `% of world ${label}`; break;
        case 'pctGroup': base = '% of selected countries'; break;
        case 'index': base = `${label} (indexed, first year = 100)`; break;
        default: base = label;
    }
    return isLog ? base + ' — log scale' : base;
}

function tooltipVal(v, vMode, indicator) {
    if (vMode === 'pctWorld' || vMode === 'pctGroup') return v.toFixed(1) + '%';
    if (vMode === 'index') return v.toFixed(1);
    return formatValue(v, indicator);
}

export function initTrendView() {
    currentContainer = document.getElementById('explore-trend-container');

    // Draw toggle (Lines / Stacked)
    const drawBtns = {
        line: document.getElementById('trend-draw-line'),
        stacked: document.getElementById('trend-draw-stacked')
    };
    // Value mode dropdown
    const valueSel = document.getElementById('trend-value-mode');
    // Scale toggle buttons (Linear / Log)
    const linearBtn = document.getElementById('trend-scale-linear');
    const logBtn = document.getElementById('trend-log-toggle');
    // Index option in dropdown (to disable when stacked)
    const indexOpt = valueSel?.querySelector('option[value="index"]');

    function syncScaleButtons() {
        if (linearBtn) linearBtn.classList.toggle('active', !useLog);
        if (logBtn) logBtn.classList.toggle('active', useLog);
    }

    function syncDisabled() {
        const isStacked = (drawMode === 'stacked');
        // Disable index option when stacked
        if (indexOpt) indexOpt.disabled = isStacked;
        // Disable log toggle when stacked
        if (logBtn) logBtn.classList.toggle('disabled', isStacked);
        // Fallback if current state is incompatible
        if (isStacked && valueMode === 'index') {
            valueMode = 'abs';
            if (valueSel) valueSel.value = 'abs';
        }
        if (isStacked && useLog) {
            useLog = false;
            syncScaleButtons();
        }
    }

    function setDrawMode(mode) {
        drawMode = mode;
        Object.entries(drawBtns).forEach(([k, b]) => { if (b) b.classList.toggle('active', k === mode); });
        syncDisabled();
        updateTrendView();
    }

    if (valueSel) {
        valueSel.addEventListener('change', () => {
            valueMode = valueSel.value;
            updateTrendView();
        });
    }

    if (linearBtn) {
        linearBtn.addEventListener('click', () => {
            useLog = false;
            syncScaleButtons();
            updateTrendView();
        });
    }

    if (logBtn) {
        logBtn.addEventListener('click', () => {
            useLog = !useLog;
            syncScaleButtons();
            updateTrendView();
        });
    }

    Object.entries(drawBtns).forEach(([k, b]) => { if (b) b.addEventListener('click', () => setDrawMode(k)); });
}

export function updateTrendView() {
    if (!currentContainer) return;
    const base = State.get('baseIndicator');
    const selectedGases = State.get('selectedGases');
    const facetMode = State.get('facetMode');
    const isStacked = (drawMode === 'stacked');
    const mfaComponentKeys = base === 'mfa' ? getSelectedMfaComponentKeys() : [];
    const cropComponentKeys = base === 'crops' ? getSelectedCropComponentKeys() : [];

    // ---- PANELS = "By component" (GHG gas decomposition or MFA material decomposition) ----
    if (facetMode === 'component' || facetMode === 'gas') {
        if (base === 'ghg') {
            const gases = selectedGases.includes('total') ? ALL_GAS_KEYS : selectedGases;
            renderFacetedByGas(gases, isStacked, valueMode);
            return;
        }
        if (base === 'mfa') {
            const flow = State.get('mfaFlow') || 'ext';
            const mats = (State.get('selectedMaterials') || ['total']);
            const matKeys = mats.includes('total')
                ? ['bio', 'ff', 'met', 'min']
                : mats;
            const fullKeys = matKeys.map(m => `mfa_${flow}_${m}`);
            renderFacetedByGas(fullKeys, isStacked, valueMode);
            return;
        }
        if (base === 'crops') {
            const keys = cropComponentKeys.length > 0 ? cropComponentKeys : CROPS_COMPONENT_KEYS;
            renderFacetedByGas(keys, isStacked, valueMode);
            return;
        }
    }

    // ---- PANELS = "By country" ----
    if (facetMode === 'country') {
        if (base === 'ghg') {
            const gases = selectedGases.includes('total') ? ALL_GAS_KEYS : selectedGases;
            renderStackedArea(gases, valueMode, !isStacked);
        } else if (base === 'mfa' && mfaComponentKeys.length > 1) {
            renderStackedArea(mfaComponentKeys, valueMode, !isStacked || State.get('mfaFlow') === 'bal', getMfaAxisIndicator());
        } else if (base === 'crops' && cropComponentKeys.length > 1) {
            renderStackedArea(cropComponentKeys, valueMode, !isStacked, 'crop_total');
        } else {
            renderFacetedChart(valueMode, isStacked);
        }
        return;
    }

    // ---- PANELS = "All in one" ----
    const isMultiGas = base === 'ghg' && selectedGases.length > 1
        && !selectedGases.includes('total');
    const isMultiMfa = base === 'mfa' && mfaComponentKeys.length > 1;
    const isMultiCrop = base === 'crops' && cropComponentKeys.length > 1;

    if (isStacked) {
        if (isMultiGas) renderStackedArea(selectedGases, valueMode);
        else if (isMultiMfa) renderStackedArea(mfaComponentKeys, valueMode, State.get('mfaFlow') === 'bal', getMfaAxisIndicator());
        else if (isMultiCrop) renderStackedArea(cropComponentKeys, valueMode, false, 'crop_total');
        else renderStackedCountryArea(valueMode);
    } else {
        if (isMultiGas) renderMultiGasLines(selectedGases, valueMode);
        else if (isMultiMfa) renderMultiGasLines(mfaComponentKeys, valueMode, getMfaAxisIndicator());
        else if (isMultiCrop) renderMultiGasLines(cropComponentKeys, valueMode, 'crop_total');
        else renderChart(valueMode);
    }
}

export function destroyTrendView() {
    if (currentContainer) currentContainer.innerHTML = '';
    _yearMarkerState = null;
}

// ============================================================================
// Standard chart rendering (line/area per country)
// ============================================================================

function renderChart(vMode = 'abs') {
    const container = currentContainer;
    container.innerHTML = '';

    const countries = State.get('selectedCountries');
    const indicator = State.get('indicator');
    const _yr = State.get('yearRange');
    const yearFrom = State.get('yearFrom');
    const yearRange = [Math.max(_yr[0], yearFrom), _yr[1]];

    if (countries.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view trends</div>';
        return;
    }

    const rect = container.getBoundingClientRect();
    const width = rect.width || 700;
    const height = rect.height || 400;
    const margin = { top: 15, right: Math.min(100, Math.max(60, width * 0.08)), bottom: 35, left: 65 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svgEl = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svgEl.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Clip-path to prevent lines escaping chart area (important for log scale)
    const clipId = 'trend-clip-' + Math.random().toString(36).slice(2, 8);
    svgEl.append('defs').append('clipPath').attr('id', clipId)
        .append('rect').attr('width', w).attr('height', h);

    // Build series
    const series = countries.map((iso3, i) => {
        const raw = DataLoader.getCountryData(iso3);
        const meta = DataLoader.getMetadata(iso3);
        if (!raw) return null;

        const data = raw
            .filter(d => d.y >= yearRange[0] && d.y <= yearRange[1])
            .map(d => {
                const v = resolveIndicatorValue(d, indicator);
                return { y: d.y, v };
            });

        return {
            key: iso3,
            label: meta ? meta.name : iso3,
            data,
            color: getColorForIndex(i)
        };
    }).filter(Boolean);

    // World reference line only if explicitly selected
    if (countries.includes('WLD')) {
        const worldData = DataLoader.getWorldData();
        if (worldData && worldData.length > 0) {
            series.push({
                key: 'WLD',
                label: 'World',
                data: worldData
                    .filter(d => d.y >= yearRange[0] && d.y <= yearRange[1])
                    .map(d => ({ y: d.y, v: resolveIndicatorValue(d, indicator) })),
                color: COLORS.lightGray,
                dashed: true,
                lineWidth: 1.2
            });
        }
    }

    // Progressive reveal: clip data to currentYear
    const currentYear = State.get('currentYear');
    series.forEach(s => {
        s.data = s.data.filter(d => d.y <= currentYear);
    });

    // Apply value transform (%, index, etc.)
    applySeriesTransform(series, vMode, indicator);

    // Auto-fit x-axis to actual data range (where data exists)
    let xMin = yearRange[1], xMax = yearRange[0];
    series.forEach(s => {
        s.data.forEach(d => {
            if (d.v != null) {
                if (d.y < xMin) xMin = d.y;
                if (d.y > xMax) xMax = d.y;
            }
        });
    });
    if (xMin > xMax) { xMin = yearRange[0]; xMax = yearRange[1]; }
    const effectiveRange = [xMin, xMax];

    const xScale = d3.scaleLinear().domain(effectiveRange).range([0, w]);

    let yMin = Infinity, yMax = -Infinity;
    series.forEach(s => {
        s.data.forEach(d => {
            if (d.v != null) {
                yMin = Math.min(yMin, d.v);
                yMax = Math.max(yMax, d.v);
            }
        });
    });

    if (yMin === Infinity) { yMin = 0; yMax = 100; }
    if (!useLog) yMin = Math.min(0, yMin);
    yMax = yMax * 1.08;

    const yScale = makeYScale(yMin, yMax, h, useLog);

    // Grid
    g.selectAll('.grid-h')
        .data(yScale.ticks(6))
        .join('line')
        .attr('class', 'grid-line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

    // Axes
    g.append('g')
        .attr('transform', `translate(0,${h})`)
        .attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(8).tickFormat(d3.format('d')));

    g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(6).tickFormat(getYAxisFormat(vMode)));

    // Y label
    const yLabel = getYLabel(vMode, indicator, useLog);
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 14)
        .attr('x', -h / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('fill', COLORS.lightGray)
        .text(yLabel);

    // Line generator
    const lineGen = d3.line()
        .x(d => xScale(d.y))
        .y(d => yScale(d.v))
        .curve(d3.curveMonotoneX)
        .defined(d => d.v != null);

    // Draw series (clipped to chart area)
    const linesG = g.append('g').attr('clip-path', `url(#${clipId})`);
    const endLabels = [];
    series.forEach((s, i) => {
        if (s.data.length === 0) return;
        const color = s.color || getColorForIndex(i);
        const isDashed = s.dashed || false;
        const lineWidth = s.lineWidth || 1.8;

        // Line
        linesG.append('path')
            .datum(s.data)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', lineWidth)
            .attr('stroke-dasharray', isDashed ? '6,4' : 'none')
            .attr('d', lineGen);

        // Collect end labels for collision avoidance
        const lastPoint = s.data.filter(d => d.v != null).slice(-1)[0];
        if (lastPoint) {
            endLabels.push({ label: s.label, x: xScale(lastPoint.y) + 6, y: yScale(lastPoint.v) + 4, color });
        }
    });

    // Resolve label collisions
    endLabels.sort((a, b) => a.y - b.y);
    const labelHeight = 12;
    for (let i = 1; i < endLabels.length; i++) {
        const prev = endLabels[i - 1];
        const curr = endLabels[i];
        if (curr.y - prev.y < labelHeight) {
            curr.y = prev.y + labelHeight;
        }
    }

    endLabels.forEach(lbl => {
        g.append('text')
            .attr('class', 'end-label')
            .attr('x', lbl.x)
            .attr('y', lbl.y)
            .attr('fill', lbl.color)
            .text(lbl.label);
    });

    // Hover interaction
    addHoverInteraction(g, svgEl, series, xScale, yScale, w, h, indicator, vMode);
}

// ============================================================================
// Faceted line/area chart — one panel per country, shared Y scale
// ============================================================================

function renderFacetedChart(vMode = 'abs', asFilled = false) {
    const container = currentContainer;
    container.innerHTML = '';
    _yearMarkerState = null;

    const countries = State.get('selectedCountries');
    const indicator = State.get('indicator');
    const _yr = State.get('yearRange');
    const yearFrom = State.get('yearFrom');
    const yearRange = [Math.max(_yr[0], yearFrom), _yr[1]];

    if (countries.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view trends</div>';
        return;
    }

    const rect = container.getBoundingClientRect();
    const totalWidth = rect.width || 700;
    const totalHeight = rect.height || 400;

    const n = countries.length;
    const cols = getResponsivePanelColumns(n, totalWidth);
    const rows = Math.ceil(n / cols);

    const panelW = Math.floor(totalWidth / cols);
    const panelH = Math.max(160, Math.floor(totalHeight / rows));

    // Progressive reveal: clip to currentYear
    const currentYear = State.get('currentYear');

    // Build series
    const allSeries = countries.map((iso3, i) => {
        const raw = DataLoader.getCountryData(iso3);
        const meta = DataLoader.getMetadata(iso3);
        if (!raw) return null;

        const data = raw
            .filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
            .map(d => {
                const v = resolveIndicatorValue(d, indicator);
                return { y: d.y, v };
            });

        return {
            key: iso3,
            label: meta ? meta.name : iso3,
            data,
            color: getColorForIndex(i)
        };
    }).filter(Boolean);

    // Apply value transform
    applySeriesTransform(allSeries, vMode, indicator);

    // Compute global Y range after transform (used when shared Y axis)
    const freeY = State.get('freeYAxis');
    let globalYMin = Infinity, globalYMax = -Infinity;
    allSeries.forEach(s => {
        s.data.forEach(d => {
            if (d.v != null) {
                globalYMin = Math.min(globalYMin, d.v);
                globalYMax = Math.max(globalYMax, d.v);
            }
        });
    });
    if (globalYMin === Infinity) { globalYMin = 0; globalYMax = 100; }
    if (!useLog) globalYMin = Math.min(0, globalYMin);
    globalYMax = globalYMax * 1.08;

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);width:100%;height:100%;overflow-y:auto`;
    container.appendChild(wrapper);

    allSeries.forEach((s, pi) => {
        const panelDiv = document.createElement('div');
        panelDiv.style.cssText = `width:${panelW}px;height:${panelH}px;position:relative;flex-shrink:0`;
        wrapper.appendChild(panelDiv);

        const isSingle = n === 1;
        const margin = isSingle
            ? { top: 15, right: Math.min(100, Math.max(60, panelW * 0.1)), bottom: 35, left: 65 }
            : { top: 22, right: 50, bottom: 25, left: 45 };
        const w = panelW - margin.left - margin.right;
        const h = panelH - margin.top - margin.bottom;
        if (w <= 0 || h <= 0) return;

        const svgEl = d3.select(panelDiv).append('svg')
            .attr('width', panelW).attr('height', panelH);
        const g = svgEl.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // X range from actual data
        let xMin = yearRange[1], xMax = yearRange[0];
        s.data.forEach(d => {
            if (d.v != null) {
                if (d.y < xMin) xMin = d.y;
                if (d.y > xMax) xMax = d.y;
            }
        });
        if (xMin > xMax) { xMin = yearRange[0]; xMax = yearRange[1]; }

        const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, w]);
        // Free Y axis: compute per-panel range
        let panelYMin = globalYMin, panelYMax = globalYMax;
        if (freeY) {
            panelYMin = Infinity; panelYMax = -Infinity;
            s.data.forEach(d => {
                if (d.v != null) {
                    if (d.v < panelYMin) panelYMin = d.v;
                    if (d.v > panelYMax) panelYMax = d.v;
                }
            });
            if (panelYMin === Infinity) { panelYMin = 0; panelYMax = 100; }
            if (!useLog) panelYMin = Math.min(0, panelYMin);
            panelYMax = panelYMax * 1.08;
        }
        const yScale = makeYScale(panelYMin, panelYMax, h, useLog);

        // Grid
        g.selectAll('.grid-h')
            .data(yScale.ticks(4))
            .join('line')
            .attr('class', 'grid-line')
            .attr('x1', 0).attr('x2', w)
            .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

        // Axes
        g.append('g')
            .attr('transform', `translate(0,${h})`)
            .attr('class', 'axis')
            .call(d3.axisBottom(xScale).ticks(isSingle ? 8 : 4).tickFormat(d3.format('d')));

        g.append('g')
            .attr('class', 'axis')
            .call(d3.axisLeft(yScale).ticks(4).tickFormat(getYAxisFormat(vMode)));

        // Country label
        g.append('text')
            .attr('x', isSingle ? w / 2 : 4).attr('y', -6)
            .attr('text-anchor', isSingle ? 'middle' : 'start')
            .style('font-size', isSingle ? '13px' : '11px')
            .style('font-weight', '600')
            .style('fill', s.color)
            .text(s.label);

        // Line generator
        const lineGen = d3.line()
            .x(d => xScale(d.y)).y(d => yScale(d.v))
            .curve(d3.curveMonotoneX)
            .defined(d => d.v != null);

        // Filled area (for non-GHG stacked/pct graceful degradation)
        if (asFilled) {
            const areaGen = d3.area()
                .x(d => xScale(d.y)).y0(yScale(0)).y1(d => yScale(d.v))
                .curve(d3.curveMonotoneX).defined(d => d.v != null);
            g.append('path').datum(s.data)
                .attr('fill', s.color).attr('fill-opacity', 0.3)
                .attr('d', areaGen);
        }

        // Line
        g.append('path').datum(s.data)
            .attr('fill', 'none')
            .attr('stroke', s.color)
            .attr('stroke-width', 1.8)
            .attr('d', lineGen);

        // End label
        const lastPt = s.data.filter(d => d.v != null).slice(-1)[0];
        if (lastPt && isSingle) {
            g.append('text')
                .attr('x', xScale(lastPt.y) + 6).attr('y', yScale(lastPt.v) + 4)
                .attr('fill', s.color)
                .style('font-size', '10px').style('font-weight', '600')
                .text(s.label);
        }

    });
}

// ============================================================================
// Stacked Area by Country — countries stacked on top of each other
// ============================================================================

function renderStackedCountryArea(vMode = 'abs') {
    const container = currentContainer;
    container.innerHTML = '';
    _yearMarkerState = null;

    const countries = State.get('selectedCountries');
    const indicator = State.get('indicator');
    const _yr = State.get('yearRange');
    const yearFrom = State.get('yearFrom');
    const yearRange = [Math.max(_yr[0], yearFrom), _yr[1]];
    const currentYear = State.get('currentYear');
    const isPctWorld = (vMode === 'pctWorld');
    const isPctGroup = (vMode === 'pctGroup');
    const isPct = isPctWorld || isPctGroup;

    if (countries.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view stacked area</div>';
        return;
    }

    const rect = container.getBoundingClientRect();
    const width = rect.width || 700;
    const height = rect.height || 400;
    const margin = { top: 15, right: Math.min(120, Math.max(80, width * 0.1)), bottom: 35, left: 65 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    // Collect all years present in any country
    const yearSet = new Set();
    const countryRaw = {};
    countries.forEach(iso3 => {
        const raw = DataLoader.getCountryData(iso3);
        if (!raw) return;
        countryRaw[iso3] = new Map();
        raw.filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
            .forEach(d => {
                let v = resolveIndicatorValue(d, indicator);
                if (v != null && v > 0) {
                    countryRaw[iso3].set(d.y, v);
                    yearSet.add(d.y);
                }
            });
    });

    const years = Array.from(yearSet).sort((a, b) => a - b);
    if (years.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">No data for selected countries</div>';
        return;
    }

    // Build matrix for d3.stack — mode determines data and offset
    let matrix, stackKeys, yMax, stackOffset;

    if (isPctWorld) {
        // % of world: compute each country as % of world total, add _rest
        const worldData = DataLoader.getWorldData();
        const worldByYear = new Map();
        if (worldData) {
            worldData.forEach(d => {
                const v = resolveIndicatorValue(d, indicator);
                if (v != null && v > 0) worldByYear.set(d.y, v);
            });
        }
        matrix = years.map(y => {
            const worldV = worldByYear.get(y) || 0;
            const row = { y };
            let selectedSum = 0;
            countries.forEach(iso3 => {
                const raw = (countryRaw[iso3] && countryRaw[iso3].get(y)) || 0;
                const pct = worldV > 0 ? (raw / worldV) * 100 : 0;
                row[iso3] = pct;
                selectedSum += pct;
            });
            row._rest = Math.max(0, 100 - selectedSum);
            return row;
        });
        stackKeys = [...countries, '_rest'];
        yMax = 100;
        stackOffset = d3.stackOffsetNone;
    } else if (isPctGroup) {
        // % of selected: use stackOffsetExpand (normalizes to 0-1)
        matrix = years.map(y => {
            const row = { y };
            countries.forEach(iso3 => {
                row[iso3] = (countryRaw[iso3] && countryRaw[iso3].get(y)) || 0;
            });
            return row;
        });
        stackKeys = [...countries];
        yMax = 1;
        stackOffset = d3.stackOffsetExpand;
    } else {
        // Absolute
        matrix = years.map(y => {
            const row = { y };
            countries.forEach(iso3 => {
                row[iso3] = (countryRaw[iso3] && countryRaw[iso3].get(y)) || 0;
            });
            return row;
        });
        stackKeys = [...countries];
        yMax = 0;
        matrix.forEach(row => {
            let total = 0;
            countries.forEach(iso3 => { total += row[iso3]; });
            if (total > yMax) yMax = total;
        });
        yMax *= 1.08;
        stackOffset = d3.stackOffsetNone;
    }

    const stackGen = d3.stack()
        .keys(stackKeys)
        .order(d3.stackOrderNone)
        .offset(stackOffset);
    const stacked = stackGen(matrix);

    const svgEl = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svgEl.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([years[0], years[years.length - 1]]).range([0, w]);
    const yScale = d3.scaleLinear().domain([0, yMax]).range([h, 0]).nice();

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(6)).join('line')
        .attr('class', 'grid-line').attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

    // Axes
    g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(8).tickFormat(d3.format('d')));

    const yFmt = isPctWorld ? (d => d.toFixed(0) + '%')
        : isPctGroup ? (d => (d * 100).toFixed(0) + '%')
        : getYAxisFormat('abs');
    g.append('g').attr('class', 'axis').call(d3.axisLeft(yScale).ticks(6).tickFormat(yFmt));

    // Y label
    g.append('text').attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 14).attr('x', -h / 2).attr('text-anchor', 'middle')
        .style('font-size', '10px').style('fill', COLORS.lightGray)
        .text(getYLabel(vMode, indicator, useLog));

    // Draw stacked areas
    const areaGen = d3.area()
        .x(d => xScale(d.data.y))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    stacked.forEach((layer, li) => {
        const isRest = layer.key === '_rest';
        const color = isRest ? '#e0e0e0' : getColorForIndex(li);
        g.append('path')
            .datum(layer)
            .attr('fill', color)
            .attr('fill-opacity', isRest ? 0.5 : 0.7)
            .attr('stroke', isRest ? 'none' : color)
            .attr('stroke-width', isRest ? 0 : 0.5)
            .attr('d', areaGen);
    });

    // Thin lines on top of each area boundary for visual clarity (skip _rest)
    const lineGen = d3.line()
        .x(d => xScale(d.data.y))
        .y(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    stacked.forEach((layer, li) => {
        if (layer.key === '_rest') return;
        g.append('path')
            .datum(layer)
            .attr('fill', 'none')
            .attr('stroke', getColorForIndex(li))
            .attr('stroke-width', 1)
            .attr('d', lineGen);
    });

    // Legend (right side)
    const legendG = g.append('g')
        .attr('transform', `translate(${w + 10}, 5)`);

    countries.forEach((iso3, i) => {
        const meta = DataLoader.getMetadata(iso3);
        const name = meta ? meta.name : iso3;
        legendG.append('rect')
            .attr('x', 0).attr('y', i * 15)
            .attr('width', 10).attr('height', 10)
            .attr('fill', getColorForIndex(i))
            .attr('fill-opacity', 0.7);
        legendG.append('text')
            .attr('x', 14).attr('y', i * 15 + 9)
            .style('font-size', '9px')
            .style('fill', COLORS.gray)
            .text(name);
    });

    // Rest of World legend entry (only in pctWorld mode)
    if (isPctWorld) {
        const ri = countries.length;
        legendG.append('rect')
            .attr('x', 0).attr('y', ri * 15)
            .attr('width', 10).attr('height', 10)
            .attr('fill', '#e0e0e0').attr('fill-opacity', 0.5);
        legendG.append('text')
            .attr('x', 14).attr('y', ri * 15 + 9)
            .style('font-size', '9px').style('fill', COLORS.gray)
            .text('Rest of World');
    }

    // Hover interaction
    const hoverG = g.append('g').style('display', 'none');
    const hoverLine = hoverG.append('line')
        .attr('class', 'hover-line').attr('y1', 0).attr('y2', h);

    const hoverRect = g.append('rect')
        .attr('width', w).attr('height', h)
        .attr('fill', 'none').attr('pointer-events', 'all');

    hoverRect.on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const year = Math.round(xScale.invert(mx));
        const entry = matrix.find(d => d.y === year);
        if (!entry) { hoverG.style('display', 'none'); Tooltip.hide(); return; }

        hoverG.style('display', null);
        hoverLine.attr('x1', xScale(year)).attr('x2', xScale(year));

        const indName = INDICATOR_LABELS[indicator] || indicator;
        const titleLabel = isPctWorld ? `Share of world ${indName}`
            : isPctGroup ? `% of selected \u2014 ${indName}` : indName;
        const lines = [`<div class="tooltip-title"><span>${titleLabel}</span><span>${year}</span></div>`];
        if (isPctWorld) {
            countries.forEach((iso3, i) => {
                const pct = entry[iso3];
                if (pct != null) {
                    const meta = DataLoader.getMetadata(iso3);
                    const name = meta ? meta.name : iso3;
                    lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${getColorForIndex(i)}">${name}</span><span class="tooltip-value">${pct.toFixed(1)}%</span></div>`);
                }
            });
            const rest = entry._rest;
            if (rest != null) {
                lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:#aaa">Rest of World</span><span class="tooltip-value">${rest.toFixed(1)}%</span></div>`);
            }
        } else if (isPctGroup) {
            // stackOffsetExpand: values in matrix are absolute, compute % from total
            let rowTotal = 0;
            countries.forEach(iso3 => { rowTotal += (entry[iso3] || 0); });
            countries.forEach((iso3, i) => {
                const v = entry[iso3];
                if (v > 0 && rowTotal > 0) {
                    const pct = (v / rowTotal) * 100;
                    const meta = DataLoader.getMetadata(iso3);
                    const name = meta ? meta.name : iso3;
                    lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${getColorForIndex(i)}">${name}</span><span class="tooltip-value">${pct.toFixed(1)}%</span></div>`);
                }
            });
        } else {
            let total = 0;
            countries.forEach(iso3 => { total += entry[iso3]; });
            countries.forEach((iso3, i) => {
                const v = entry[iso3];
                if (v > 0) {
                    const meta = DataLoader.getMetadata(iso3);
                    const name = meta ? meta.name : iso3;
                    lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${getColorForIndex(i)}">${name}</span><span class="tooltip-value">${formatValue(v, indicator)}</span></div>`);
                }
            });
            if (countries.length > 1) {
                lines.push(`<div class="tooltip-row" style="border-top:1px solid rgba(255,255,255,.2);padding-top:3px;margin-top:3px"><span class="tooltip-label"><strong>Total</strong></span><span class="tooltip-value"><strong>${formatValue(total, indicator)}</strong></span></div>`);
            }
        }
        Tooltip.show(lines.join(''), event);
    });

    hoverRect.on('mouseleave', () => {
        hoverG.style('display', 'none');
        Tooltip.hide();
    });
}

// ============================================================================
// GHG Stacked Area — decomposed by gas type, faceted for multiple countries
// ============================================================================

function renderStackedArea(filterGases, vMode = 'abs', asLines = false, axisIndicator = 'ghg') {
    const container = currentContainer;
    container.innerHTML = '';

    const countries = State.get('selectedCountries');
    const _yr = State.get('yearRange');
    const yearFrom = State.get('yearFrom');
    const yearRange = [Math.max(_yr[0], yearFrom), _yr[1]];
    const currentYear = State.get('currentYear');
    const components = filterGases ? getComponentDefinitions(filterGases) : GAS_COMPONENTS;

    if (countries.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view GHG breakdown</div>';
        return;
    }

    const rect = container.getBoundingClientRect();
    const totalWidth = rect.width || 700;
    const totalHeight = rect.height || 400;

    // For 1 country: single panel. For multiple: faceted grid.
    const nCountries = countries.length;
    const isSingle = nCountries === 1;
    let cols, rows;
    if (isSingle) {
        cols = 1;
        rows = 1;
    } else {
        cols = getResponsivePanelColumns(nCountries, totalWidth);
        rows = Math.ceil(nCountries / cols);
    }

    // Shared legend height (for multi-panel, legend above the grid)
    const legendH = isSingle ? 0 : 20;
    const panelW = Math.floor(totalWidth / cols);
    const panelH = Math.max(160, Math.floor((totalHeight - legendH) / rows));

    // Compute global y-max for shared scale
    const isPctGroup = !asLines && vMode === 'pctGroup';
    const isPctWorld = !asLines && vMode === 'pctWorld';
    let globalYMax = isPctGroup ? 1 : 0;

    // World data for pctWorld mode
    let worldByYear;
    if (isPctWorld) {
        const worldData = DataLoader.getWorldData();
        worldByYear = new Map();
        if (worldData) worldData.forEach(d => {
            const v = resolveIndicatorValue(d, axisIndicator);
            if (v != null && v > 0) worldByYear.set(d.y, v);
        });
    }

    const allPanelData = countries.map(iso3 => {
        const raw = DataLoader.getCountryData(iso3);
        const meta = DataLoader.getMetadata(iso3);
        if (!raw) return null;

        const data = raw
            .filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
            .map(d => {
                const row = { y: d.y };
                let total = 0;
                components.forEach(gc => {
                    let v = resolveIndicatorValue(d, gc.key);
                    v = (v != null && Number.isFinite(v)) ? v : 0;
                    if (!asLines && v < 0) v = 0;
                    if (isPctWorld) {
                        const wt = worldByYear?.get(d.y) || 0;
                        v = wt > 0 ? (v / wt) * 100 : 0;
                    }
                    row[gc.key] = v;
                    total += asLines ? Math.abs(v) : v;
                });
                row._total = total;
                if (!isPctGroup && !asLines) globalYMax = Math.max(globalYMax, total);
                return row;
            });

        return { iso3, label: meta ? meta.name : iso3, data };
    }).filter(Boolean);

    if (!isPctGroup && !asLines) globalYMax *= 1.08;

    // For line mode: compute per-gas series with transform, then global Y max
    if (asLines) {
        allPanelData.forEach(panel => {
            panel.lineSeries = components.map(gc => ({
                key: gc.key, label: gc.label, color: gc.color,
                indicator: gc.key,
                data: panel.data.map(d => ({ y: d.y, v: d[gc.key] !== 0 ? d[gc.key] : null }))
            }));
            applySeriesTransform(panel.lineSeries, vMode, axisIndicator);
            panel.lineSeries.forEach(s => s.data.forEach(d => {
                if (d.v != null) globalYMax = Math.max(globalYMax, d.v);
            }));
        });
        globalYMax *= 1.08;
    }

    // Shared legend above grid (multi-panel only)
    if (!isSingle) {
        const legendDiv = document.createElement('div');
        legendDiv.style.cssText = `display:flex;gap:12px;padding:2px 8px;font-size:10px;color:var(--cd,#555);flex-wrap:wrap;align-items:center`;
        components.forEach(gc => {
            const item = document.createElement('span');
            item.style.cssText = `display:flex;align-items:center;gap:3px`;
            item.innerHTML = `<span style="width:10px;height:10px;border-radius:2px;background:${gc.color};opacity:.8;flex-shrink:0"></span>${gc.label}`;
            legendDiv.appendChild(item);
        });
        container.appendChild(legendDiv);
    }

    // Grid wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);width:100%;height:calc(100% - ${legendH}px);overflow-y:auto`;
    container.appendChild(wrapper);

    allPanelData.forEach((panel, pi) => {
        const panelDiv = document.createElement('div');
        panelDiv.style.cssText = `position:relative;min-height:${panelH}px`;
        wrapper.appendChild(panelDiv);

        const margin = isSingle
            ? { top: 15, right: 100, bottom: 35, left: 65 }
            : { top: 20, right: 10, bottom: 25, left: 45 };
        const w = panelW - margin.left - margin.right;
        const h = panelH - margin.top - margin.bottom;
        if (w <= 0 || h <= 0) return;

        const svgEl = d3.select(panelDiv).append('svg')
            .attr('width', panelW)
            .attr('height', panelH);

        const g = svgEl.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Compute x range from data
        let xMin = yearRange[1], xMax = yearRange[0];
        panel.data.forEach(d => {
            if (d._total > 0) {
                if (d.y < xMin) xMin = d.y;
                if (d.y > xMax) xMax = d.y;
            }
        });
        if (xMin > xMax) { xMin = yearRange[0]; xMax = yearRange[1]; }

        const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, w]);

        if (asLines) {
            // ---- LINE MODE: one line per gas ----
            const yScale = makeYScale(0, globalYMax, h, useLog);

            g.selectAll('.grid-h').data(yScale.ticks(4)).join('line')
                .attr('class', 'grid-line').attr('x1', 0).attr('x2', w)
                .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

            g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
                .call(d3.axisBottom(xScale).ticks(isSingle ? 8 : 4).tickFormat(d3.format('d')));
            g.append('g').attr('class', 'axis')
                .call(d3.axisLeft(yScale).ticks(4).tickFormat(getYAxisFormat(vMode)));

            g.append('text')
                .attr('x', isSingle ? w / 2 : 4).attr('y', -6)
                .attr('text-anchor', isSingle ? 'middle' : 'start')
                .style('font-size', isSingle ? '13px' : '11px')
                .style('font-weight', '600').style('fill', COLORS.dark)
                .text(panel.label);

            const lineGen = d3.line().x(d => xScale(d.y)).y(d => yScale(d.v))
                .curve(d3.curveMonotoneX).defined(d => d.v != null);

            panel.lineSeries.forEach(s => {
                g.append('path').datum(s.data)
                    .attr('fill', 'none').attr('stroke', s.color)
                    .attr('stroke-width', 1.8).attr('d', lineGen);
            });

            // Legend for single panel (right side)
            if (isSingle) {
                const legendG = g.append('g').attr('transform', `translate(${w + 10}, 5)`);
                components.forEach((gc, i) => {
                    legendG.append('rect').attr('x', 0).attr('y', i * 13)
                        .attr('width', 10).attr('height', 10).attr('fill', gc.color).attr('fill-opacity', 0.8);
                    legendG.append('text').attr('x', 14).attr('y', i * 13 + 9)
                        .style('font-size', '9px').style('fill', COLORS.gray).text(gc.label);
                });
            }

            addHoverInteraction(g, svgEl, panel.lineSeries, xScale, yScale, w, h, 'ghg', vMode);
        } else {
            // ---- STACKED MODE ----
            const yScale = d3.scaleLinear().domain([0, globalYMax]).range([h, 0]).nice();

            g.selectAll('.grid-h').data(yScale.ticks(4)).join('line')
                .attr('class', 'grid-line').attr('x1', 0).attr('x2', w)
                .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

            g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
                .call(d3.axisBottom(xScale).ticks(isSingle ? 8 : 4).tickFormat(d3.format('d')));

            const yAxisFormat = d => {
                if (isPctGroup) return (d * 100).toFixed(0) + '%';
                if (isPctWorld) return d.toFixed(0) + '%';
                if (Math.abs(d) >= 1e3) return (d / 1e3).toFixed(0) + 'K';
                return d;
            };
            g.append('g').attr('class', 'axis')
                .call(d3.axisLeft(yScale).ticks(4).tickFormat(yAxisFormat));

            g.append('text')
                .attr('x', isSingle ? w / 2 : 4).attr('y', -6)
                .attr('text-anchor', isSingle ? 'middle' : 'start')
                .style('font-size', isSingle ? '13px' : '11px')
                .style('font-weight', '600').style('fill', COLORS.dark)
                .text(panel.label);

            const keys = components.map(gc => gc.key);
            const stackGen = d3.stack().keys(keys).order(d3.stackOrderNone)
                .offset(isPctGroup ? d3.stackOffsetExpand : d3.stackOffsetNone);
            const stacked = stackGen(panel.data);

            const areaGen = d3.area()
                .x(d => xScale(d.data.y))
                .y0(d => yScale(d[0]))
                .y1(d => yScale(d[1]))
                .curve(d3.curveMonotoneX);

            stacked.forEach((layer, li) => {
                g.append('path').datum(layer)
                    .attr('fill', components[li].color)
                    .attr('fill-opacity', 0.7)
                    .attr('d', areaGen);
            });

            // Legend for single panel (right side, inside SVG margin)
            if (isSingle && pi === 0) {
                const legendG = g.append('g').attr('transform', `translate(${w + 10}, 5)`);
                components.forEach((gc, i) => {
                    legendG.append('rect').attr('x', 0).attr('y', i * 13)
                        .attr('width', 10).attr('height', 10).attr('fill', gc.color).attr('fill-opacity', 0.7);
                    legendG.append('text').attr('x', 14).attr('y', i * 13 + 9)
                        .style('font-size', '9px').style('fill', COLORS.gray).text(gc.label);
                });
            }

            if (isSingle) {
                const yLabel = isPctGroup ? '% of country total'
                    : isPctWorld ? `% of world ${INDICATOR_LABELS[axisIndicator] || axisIndicator}`
                    : `${INDICATOR_LABELS[axisIndicator] || axisIndicator} (${INDICATOR_UNITS[axisIndicator] || ''})`;
                g.append('text').attr('transform', 'rotate(-90)')
                    .attr('y', -margin.left + 14).attr('x', -h / 2).attr('text-anchor', 'middle')
                    .style('font-size', '10px').style('fill', COLORS.lightGray).text(yLabel);
            }

            addStackedHover(g, svgEl, panel, components, xScale, yScale, w, h, vMode, axisIndicator);
        }
    });
}

function addStackedHover(g, svgEl, panel, components, xScale, yScale, w, h, vMode = 'abs', axisIndicator = 'ghg') {
    const hoverG = g.append('g').style('display', 'none');
    const hoverLine = hoverG.append('line')
        .attr('class', 'hover-line')
        .attr('y1', 0).attr('y2', h);

    const hoverRect = g.append('rect')
        .attr('width', w).attr('height', h)
        .attr('fill', 'none')
        .attr('pointer-events', 'all');

    hoverRect.on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const year = Math.round(xScale.invert(mx));
        const entry = panel.data.find(d => d.y === year);
        if (!entry) { hoverG.style('display', 'none'); Tooltip.hide(); return; }

        hoverG.style('display', null);
        hoverLine.attr('x1', xScale(year)).attr('x2', xScale(year));

        const isExpand = (vMode === 'pctGroup' || vMode === 'pctWorld');
        const lines = [`<div class="tooltip-title"><span>${panel.label}</span><span>${year}</span></div>`];
        components.forEach(gc => {
            const v = entry[gc.key];
            if (v > 0) {
                const valStr = isExpand && entry._total > 0
                    ? ((v / entry._total) * 100).toFixed(1) + '%'
                    : formatValue(v, gc.key);
                lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${gc.color}">${gc.label}</span><span class="tooltip-value">${valStr}</span></div>`);
            }
        });
        const totalStr = isExpand ? '100%' : formatValue(entry._total, axisIndicator);
        lines.push(`<div class="tooltip-row" style="border-top:1px solid rgba(255,255,255,.2);padding-top:3px;margin-top:3px"><span class="tooltip-label"><strong>Total</strong></span><span class="tooltip-value"><strong>${totalStr}</strong></span></div>`);

        Tooltip.show(lines.join(''), event);
    });

    hoverRect.on('mouseleave', () => {
        hoverG.style('display', 'none');
        Tooltip.hide();
    });
}

// ============================================================================
// Multi-gas overlay: separate lines per gas per country
// ============================================================================

function renderMultiGasLines(selectedGases, vMode = 'abs', axisIndicator = 'ghg') {
    const container = currentContainer;
    container.innerHTML = '';
    _yearMarkerState = null;

    const countries = State.get('selectedCountries');
    const _yr = State.get('yearRange');
    const yearFrom = State.get('yearFrom');
    const yearRange = [Math.max(_yr[0], yearFrom), _yr[1]];
    const currentYear = State.get('currentYear');
    const components = getComponentDefinitions(selectedGases);

    if (countries.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view gas breakdown</div>';
        return;
    }

    const rect = container.getBoundingClientRect();
    const width = rect.width || 700;
    const height = rect.height || 400;
    const margin = { top: 15, right: Math.min(100, Math.max(60, width * 0.08)), bottom: 35, left: 65 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svgEl = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svgEl.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const mgClipId = 'mg-clip-' + Math.random().toString(36).slice(2, 8);
    svgEl.append('defs').append('clipPath').attr('id', mgClipId)
        .append('rect').attr('width', w).attr('height', h);

    // Build one series per country x gas
    const DASHES = ['', '6,4', '3,3', '8,3,2,3', '2,2'];
    const series = [];
    countries.forEach((iso3, ci) => {
        const raw = DataLoader.getCountryData(iso3);
        const meta = DataLoader.getMetadata(iso3);
        if (!raw) return;

        components.forEach(gc => {
            const data = raw
                .filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
                .map(d => {
                    const v = resolveIndicatorValue(d, gc.key);
                    return { y: d.y, v: (v != null && Number.isFinite(v) && v !== 0) ? v : null };
                });

            const countryLabel = meta ? meta.name : iso3;
            series.push({
                key: `${iso3}_${gc.key}`,
                label: countries.length > 1 ? `${countryLabel} — ${gc.label}` : gc.label,
                indicator: gc.key,
                data,
                color: gc.color,
                dash: countries.length > 1 ? DASHES[ci % DASHES.length] : '',
                lineWidth: 1.8
            });
        });
    });

    // Apply value transform
    applySeriesTransform(series, vMode, axisIndicator);

    // Scales
    let xMin = yearRange[1], xMax = yearRange[0];
    series.forEach(s => s.data.forEach(d => {
        if (d.v != null) { xMin = Math.min(xMin, d.y); xMax = Math.max(xMax, d.y); }
    }));
    if (xMin > xMax) { xMin = yearRange[0]; xMax = yearRange[1]; }
    const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, w]);

    let yMin = Infinity, yMax = -Infinity;
    series.forEach(s => s.data.forEach(d => {
        if (d.v != null) { yMax = Math.max(yMax, d.v); yMin = Math.min(yMin, d.v); }
    }));
    if (yMin === Infinity) { yMin = 0; yMax = 100; }
    yMax *= 1.08;
    if (!useLog && yMin > 0) yMin = 0;
    const yScale = makeYScale(yMin, yMax, h, useLog);

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(6)).join('line')
        .attr('class', 'grid-line').attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

    // Axes
    g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(8).tickFormat(d3.format('d')));

    g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(6).tickFormat(getYAxisFormat(vMode)));

    g.append('text').attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 14).attr('x', -h / 2).attr('text-anchor', 'middle')
        .style('font-size', '10px').style('fill', COLORS.lightGray)
        .text(getYLabel(vMode, axisIndicator, useLog));

    // Draw lines (clipped)
    const linesG = g.append('g').attr('clip-path', `url(#${mgClipId})`);
    const lineGen = d3.line().x(d => xScale(d.y)).y(d => yScale(d.v))
        .curve(d3.curveMonotoneX).defined(d => d.v != null);

    const endLabels = [];
    series.forEach(s => {
        linesG.append('path').datum(s.data)
            .attr('fill', 'none').attr('stroke', s.color)
            .attr('stroke-width', s.lineWidth)
            .attr('stroke-dasharray', s.dash || 'none')
            .attr('d', lineGen);

        const last = s.data.filter(d => d.v != null).slice(-1)[0];
        if (last) endLabels.push({ label: s.label, x: xScale(last.y) + 6, y: yScale(last.v) + 4, color: s.color });
    });

    // Resolve label collisions
    endLabels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < endLabels.length; i++) {
        if (endLabels[i].y - endLabels[i - 1].y < 11) endLabels[i].y = endLabels[i - 1].y + 11;
    }
    endLabels.forEach(lbl => {
        g.append('text').attr('class', 'end-label').attr('x', lbl.x).attr('y', lbl.y)
            .attr('fill', lbl.color).text(lbl.label);
    });

    addHoverInteraction(g, svgEl, series, xScale, yScale, w, h, axisIndicator, vMode);
}

// ============================================================================
// Faceted by gas type: one panel per selected gas
// Supports line and stacked (countries stacked, with optional 100% mode)
// ============================================================================

function renderFacetedByGas(selectedGases, isStacked = false, vMode = 'abs') {
    const container = currentContainer;
    container.innerHTML = '';
    _yearMarkerState = null;

    const countries = State.get('selectedCountries');
    const _yr = State.get('yearRange');
    const yearFrom = State.get('yearFrom');
    const yearRange = [Math.max(_yr[0], yearFrom), _yr[1]];
    const currentYear = State.get('currentYear');
    const components = getComponentDefinitions(selectedGases);

    if (countries.length === 0 || components.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries and components</div>';
        return;
    }

    const rect = container.getBoundingClientRect();
    const totalW = rect.width || 700;
    const totalH = rect.height || 400;
    const cols = getResponsivePanelColumns(components.length, totalW);
    const rows = Math.ceil(components.length / cols);
    const panelW = Math.floor(totalW / cols);
    const panelH = Math.floor(totalH / rows);

    // Global Y max: for pct modes use 100; for stacked use sum; else use max individual
    const isPctWorld = (vMode === 'pctWorld');
    const isPctGroup = (vMode === 'pctGroup');
    let globalYMax;
    if (isPctWorld) {
        globalYMax = 100; // world-based percentages 0-100
    } else if (isPctGroup) {
        globalYMax = 1; // stackOffsetExpand normalizes to 0-1
    } else {
        globalYMax = 0;
        components.forEach(gc => {
            const yearTotals = new Map();
            countries.forEach(iso3 => {
                const raw = DataLoader.getCountryData(iso3);
                if (!raw) return;
                raw.filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear).forEach(d => {
                    const v = resolveIndicatorValue(d, gc.key);
                    if (v != null && v > 0) {
                        if (isStacked) {
                            yearTotals.set(d.y, (yearTotals.get(d.y) || 0) + v);
                        } else {
                            globalYMax = Math.max(globalYMax, v);
                        }
                    }
                });
            });
            if (isStacked) {
                yearTotals.forEach(total => { globalYMax = Math.max(globalYMax, total); });
            }
        });
        globalYMax *= 1.08;
    }

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);width:100%;height:100%;overflow:auto`;
    container.appendChild(grid);

    components.forEach((gc, gi) => {
        const cell = document.createElement('div');
        cell.style.cssText = `position:relative;min-height:${panelH}px`;
        grid.appendChild(cell);

        const margin = { top: 20, right: 60, bottom: 25, left: 50 };
        const w = panelW - margin.left - margin.right;
        const h = panelH - margin.top - margin.bottom;
        if (w <= 0 || h <= 0) return;

        const svg = d3.select(cell).append('svg').attr('width', panelW).attr('height', panelH);
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const clipId = `gas-facet-clip-${gc.key}`;
        svg.append('defs').append('clipPath').attr('id', clipId)
            .append('rect').attr('width', w).attr('height', h);

        // Title
        svg.append('text').attr('x', margin.left).attr('y', 14)
            .style('font-size', '11px').style('font-weight', '600').style('fill', gc.color)
            .text(gc.label);

        // Dynamic x-axis
        let xMin = Infinity, xMax = -Infinity;
        countries.forEach(iso3 => {
            const raw = DataLoader.getCountryData(iso3);
            if (!raw) return;
            raw.filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
                .forEach(d => { if (resolveIndicatorValue(d, gc.key) != null) { xMin = Math.min(xMin, d.y); xMax = Math.max(xMax, d.y); } });
        });
        if (xMin === Infinity) { xMin = yearRange[0]; xMax = yearRange[1]; }
        const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, w]);
        // Free Y: compute per-panel max
        let panelYMax = globalYMax;
        if (State.get('freeYAxis') && !isPctWorld && !isPctGroup) {
            panelYMax = 0;
            countries.forEach(iso3 => {
                const raw = DataLoader.getCountryData(iso3);
                if (!raw) return;
                raw.filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
                    .forEach(d => { const v = resolveIndicatorValue(d, gc.key); if (v != null && v > panelYMax) panelYMax = v; });
            });
            panelYMax *= 1.08;
        }
        const yScale = d3.scaleLinear().domain([0, panelYMax]).range([h, 0]).nice();

        g.selectAll('.grid-h').data(yScale.ticks(4)).join('line')
            .attr('class', 'grid-line').attr('x1', 0).attr('x2', w)
            .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

        g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
            .call(d3.axisBottom(xScale).ticks(4).tickFormat(d3.format('d')));
        const yFmt = d => {
            if (isPctWorld) return d.toFixed(0) + '%';
            if (isPctGroup) return (d * 100).toFixed(0) + '%';
            return Math.abs(d) >= 1e3 ? (d / 1e3).toFixed(0) + 'K' : d;
        };
        g.append('g').attr('class', 'axis').call(d3.axisLeft(yScale).ticks(4).tickFormat(yFmt));

        const linesG = g.append('g').attr('clip-path', `url(#${clipId})`);

        if (isStacked && countries.length > 0) {
            // ---- Stacked mode: countries stacked within this gas panel ----
            const yearSet = new Set();
            const countryMaps = {};
            countries.forEach(iso3 => {
                const raw = DataLoader.getCountryData(iso3);
                if (!raw) return;
                countryMaps[iso3] = new Map();
                raw.filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
                    .forEach(d => {
                        const v = resolveIndicatorValue(d, gc.key);
                        if (v != null && v > 0) {
                            countryMaps[iso3].set(d.y, v);
                            yearSet.add(d.y);
                        }
                    });
            });

            const years = Array.from(yearSet).sort((a, b) => a - b);

            let matrix, stackKeys, stackOffset;
            if (isPctWorld) {
                // World-based 100%: get world totals for this specific gas
                const worldData = DataLoader.getWorldData();
                const worldByYear = new Map();
                if (worldData) {
                    worldData.forEach(d => {
                        const v = resolveIndicatorValue(d, gc.key);
                        if (v != null && v > 0) worldByYear.set(d.y, v);
                    });
                }
                matrix = years.map(y => {
                    const worldV = worldByYear.get(y) || 0;
                    const row = { y };
                    let selectedSum = 0;
                    countries.forEach(iso3 => {
                        const raw = (countryMaps[iso3] && countryMaps[iso3].get(y)) || 0;
                        const pct = worldV > 0 ? (raw / worldV) * 100 : 0;
                        row[iso3] = pct;
                        selectedSum += pct;
                    });
                    row._rest = Math.max(0, 100 - selectedSum);
                    return row;
                });
                stackKeys = [...countries, '_rest'];
                stackOffset = d3.stackOffsetNone;
            } else if (isPctGroup) {
                matrix = years.map(y => {
                    const row = { y };
                    countries.forEach(iso3 => {
                        row[iso3] = (countryMaps[iso3] && countryMaps[iso3].get(y)) || 0;
                    });
                    return row;
                });
                stackKeys = [...countries];
                stackOffset = d3.stackOffsetExpand;
            } else {
                matrix = years.map(y => {
                    const row = { y };
                    countries.forEach(iso3 => {
                        row[iso3] = (countryMaps[iso3] && countryMaps[iso3].get(y)) || 0;
                    });
                    return row;
                });
                stackKeys = [...countries];
                stackOffset = d3.stackOffsetNone;
            }

            const stackGen = d3.stack().keys(stackKeys).order(d3.stackOrderNone)
                .offset(stackOffset);
            const stacked = stackGen(matrix);

            const stackedArea = d3.area()
                .x(d => xScale(d.data.y))
                .y0(d => yScale(d[0]))
                .y1(d => yScale(d[1]))
                .curve(d3.curveMonotoneX);

            stacked.forEach((layer, li) => {
                const isRest = layer.key === '_rest';
                const color = isRest ? '#e0e0e0' : getColorForIndex(li);
                linesG.append('path').datum(layer)
                    .attr('fill', color)
                    .attr('fill-opacity', isRest ? 0.5 : 0.7)
                    .attr('stroke', isRest ? 'none' : color)
                    .attr('stroke-width', isRest ? 0 : 0.5)
                    .attr('d', stackedArea);
            });

            // Thin boundary lines (skip _rest)
            const stackedLine = d3.line()
                .x(d => xScale(d.data.y))
                .y(d => yScale(d[1]))
                .curve(d3.curveMonotoneX);
            stacked.forEach((layer, li) => {
                if (layer.key === '_rest') return;
                linesG.append('path').datum(layer)
                    .attr('fill', 'none').attr('stroke', getColorForIndex(li))
                    .attr('stroke-width', 0.8).attr('d', stackedLine);
            });

            // Hover for stacked
            const sHoverG = g.append('g').style('display', 'none');
            const sHoverLine = sHoverG.append('line').attr('class', 'hover-line').attr('y1', 0).attr('y2', h);
            const sHoverRect = g.append('rect').attr('width', w).attr('height', h)
                .attr('fill', 'none').attr('pointer-events', 'all');
            sHoverRect.on('mousemove', (event) => {
                const [mx] = d3.pointer(event);
                const year = Math.round(xScale.invert(mx));
                const entry = matrix.find(d => d.y === year);
                if (!entry) { sHoverG.style('display', 'none'); Tooltip.hide(); return; }
                sHoverG.style('display', null);
                sHoverLine.attr('x1', xScale(year)).attr('x2', xScale(year));
                const lines = [`<div class="tooltip-title"><span>${gc.label}</span><span>${year}</span></div>`];
                if (isPctWorld) {
                    countries.forEach((iso3, ci) => {
                        const pct = entry[iso3];
                        if (pct != null && pct > 0) {
                            const meta = DataLoader.getMetadata(iso3);
                            const name = meta ? meta.name : iso3;
                            lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${getColorForIndex(ci)}">${name}</span><span class="tooltip-value">${pct.toFixed(1)}%</span></div>`);
                        }
                    });
                    const rest = entry._rest;
                    if (rest != null) {
                        lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:#aaa">Rest of World</span><span class="tooltip-value">${rest.toFixed(1)}%</span></div>`);
                    }
                } else if (isPctGroup) {
                    let rowTotal = 0;
                    countries.forEach(iso3 => { rowTotal += (entry[iso3] || 0); });
                    countries.forEach((iso3, ci) => {
                        const v = entry[iso3];
                        if (v > 0 && rowTotal > 0) {
                            const pct = (v / rowTotal) * 100;
                            const meta = DataLoader.getMetadata(iso3);
                            const name = meta ? meta.name : iso3;
                            lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${getColorForIndex(ci)}">${name}</span><span class="tooltip-value">${pct.toFixed(1)}%</span></div>`);
                        }
                    });
                } else {
                    let total = 0;
                    countries.forEach(iso3 => { total += entry[iso3]; });
                    countries.forEach((iso3, ci) => {
                        const v = entry[iso3];
                        if (v > 0) {
                            const meta = DataLoader.getMetadata(iso3);
                            const name = meta ? meta.name : iso3;
                            lines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${getColorForIndex(ci)}">${name}</span><span class="tooltip-value">${formatValue(v, gc.key)}</span></div>`);
                        }
                    });
                    if (countries.length > 1) {
                        lines.push(`<div class="tooltip-row" style="border-top:1px solid rgba(255,255,255,.2);padding-top:3px;margin-top:3px"><span class="tooltip-label"><strong>Total</strong></span><span class="tooltip-value"><strong>${formatValue(total, gc.key)}</strong></span></div>`);
                    }
                }
                Tooltip.show(lines.join(''), event);
            });
            sHoverRect.on('mouseleave', () => { sHoverG.style('display', 'none'); Tooltip.hide(); });

        } else {
            // ---- Line mode: countries as separate series ----
            const lineSeries = countries.map((iso3, ci) => {
                const raw = DataLoader.getCountryData(iso3);
                if (!raw) return null;
                const meta = DataLoader.getMetadata(iso3);
                const data = raw
                    .filter(d => d.y >= yearRange[0] && d.y <= yearRange[1] && d.y <= currentYear)
                    .map(d => {
                        const v = resolveIndicatorValue(d, gc.key);
                        return { y: d.y, v: (v != null && Number.isFinite(v) && v !== 0) ? v : null };
                    });
                return { key: iso3, label: meta ? meta.name : iso3, data, color: getColorForIndex(ci) };
            }).filter(Boolean);

            // Apply value transform
            applySeriesTransform(lineSeries, vMode, gc.key);

            // Recompute Y scale after transform
            let panelYMin = Infinity, panelYMax = -Infinity;
            lineSeries.forEach(s => s.data.forEach(d => {
                if (d.v != null) { panelYMax = Math.max(panelYMax, d.v); panelYMin = Math.min(panelYMin, d.v); }
            }));
            if (panelYMin === Infinity) { panelYMin = 0; panelYMax = 100; }
            panelYMax *= 1.08;
            if (!useLog && panelYMin > 0) panelYMin = 0;
            const localYScale = makeYScale(panelYMin, panelYMax, h, useLog);

            // Update axis with local scale
            g.selectAll('.axis').remove();
            g.selectAll('.grid-line').remove();
            g.selectAll('.grid-h').data(localYScale.ticks(4)).join('line')
                .attr('class', 'grid-line').attr('x1', 0).attr('x2', w)
                .attr('y1', d => localYScale(d)).attr('y2', d => localYScale(d));
            g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
                .call(d3.axisBottom(xScale).ticks(4).tickFormat(d3.format('d')));
            g.append('g').attr('class', 'axis')
                .call(d3.axisLeft(localYScale).ticks(4).tickFormat(getYAxisFormat(vMode)));

            const lineGen = d3.line().x(d => xScale(d.y)).y(d => localYScale(d.v))
                .curve(d3.curveMonotoneX).defined(d => d.v != null);

            const endLabels = [];
            lineSeries.forEach(s => {
                linesG.append('path').datum(s.data)
                    .attr('fill', 'none').attr('stroke', s.color)
                    .attr('stroke-width', 1.8).attr('d', lineGen);

                const last = s.data.filter(d => d.v != null).slice(-1)[0];
                if (last) {
                    endLabels.push({ label: s.label, x: xScale(last.y) + 4, y: localYScale(last.v) + 3, color: s.color });
                }
            });

            endLabels.sort((a, b) => a.y - b.y);
            for (let li = 1; li < endLabels.length; li++) {
                if (endLabels[li].y - endLabels[li - 1].y < 10) endLabels[li].y = endLabels[li - 1].y + 10;
            }
            endLabels.forEach(lbl => {
                g.append('text').attr('x', lbl.x).attr('y', lbl.y)
                    .style('font-size', '8px').style('fill', lbl.color)
                    .text(lbl.label);
            });

            addHoverInteraction(g, svg, lineSeries, xScale, localYScale, w, h, gc.key, vMode);
        }
    });
}

// ============================================================================
// Current year marker (vertical line + dots) for timelapse
// ============================================================================

function drawYearMarker() {
    if (!_yearMarkerState) return;
    const { g, xScale, yScale, series, h } = _yearMarkerState;
    const currentYear = State.get('currentYear');

    // Remove previous marker
    g.selectAll('.year-marker').remove();

    const x = xScale(currentYear);
    const [xMin, xMax] = xScale.domain();
    if (currentYear < xMin || currentYear > xMax) return;

    const markerG = g.append('g').attr('class', 'year-marker');

    // Vertical line
    markerG.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.dark)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,2')
        .attr('opacity', 0.5);

    // Dots on each series at currentYear
    series.forEach(s => {
        const entry = s.data.find(d => d.y === currentYear);
        if (entry && entry.v != null) {
            markerG.append('circle')
                .attr('cx', x)
                .attr('cy', yScale(entry.v))
                .attr('r', 4)
                .attr('fill', s.color)
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.5);
        }
    });

    // Year label at top
    markerG.append('text')
        .attr('x', x)
        .attr('y', -4)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('font-weight', '600')
        .style('fill', COLORS.dark)
        .text(currentYear);
}

export function updateTrendYearMarker() {
    if (!currentContainer) return;
    // Progressive reveal: always full redraw since data range changes with currentYear
    updateTrendView();
}

// ============================================================================
// Standard hover interaction
// ============================================================================

function addHoverInteraction(g, svgEl, series, xScale, yScale, w, h, indicator, vMode = 'abs') {
    const hoverG = g.append('g').style('display', 'none');
    const hoverLine = hoverG.append('line')
        .attr('class', 'hover-line')
        .attr('y1', 0).attr('y2', h);

    const hoverDots = hoverG.selectAll('.hover-dot')
        .data(series)
        .join('circle')
        .attr('r', 3.5)
        .attr('fill', (d, i) => d.color || getColorForIndex(i))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);

    const hoverRect = g.append('rect')
        .attr('width', w).attr('height', h)
        .attr('fill', 'none')
        .attr('pointer-events', 'all');

    const indLabel = INDICATOR_LABELS[indicator] || indicator;
    const indUnit = INDICATOR_UNITS[indicator] || '';

    hoverRect.on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const year = Math.round(xScale.invert(mx));
        hoverG.style('display', null);
        hoverLine.attr('x1', xScale(year)).attr('x2', xScale(year));

        const tooltipLines = [`<div class="tooltip-title"><span>${indLabel}</span><span>${year}</span></div>`];

        hoverDots.each((s, i, nodes) => {
            const entry = s.data.find(d => d.y === year);
            if (entry && entry.v != null) {
                d3.select(nodes[i])
                    .attr('cx', xScale(year))
                    .attr('cy', yScale(entry.v))
                    .style('display', null);

                const valueStr = tooltipVal(entry.v, vMode, s.indicator || indicator);
                tooltipLines.push(`<div class="tooltip-row"><span class="tooltip-label" style="color:${s.color}">${s.label}</span><span class="tooltip-value">${valueStr}</span></div>`);
            } else {
                d3.select(nodes[i]).style('display', 'none');
            }
        });

        Tooltip.show(tooltipLines.join(''), event);
    });

    hoverRect.on('mouseleave', () => {
        hoverG.style('display', 'none');
        Tooltip.hide();
    });
}
