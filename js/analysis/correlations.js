// ============================================================================
// CORRELATIONS - Gapminder-style bubble scatter plot
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import Tooltip from '../components/tooltip.js';
import {
    COLORS, COMPARISON_PALETTE, INDICATOR_LABELS, INDICATOR_UNITS,
    getColorForIndex, formatValue, resolveIndicatorValue
} from '../utils.js';

const MARGIN = { top: 24, right: 118, bottom: 52, left: 72 };

// Broad Minerva regions keep the legend compact.
const REGION_COLORS = {
    'Western Europe': '#1e6091',
    'Europe & Central Asia': '#264653',
    'North America': '#1982c4',
    'Latin America & Caribbean': '#2a9d8f',
    'East Asia & Pacific': '#e63946',
    'South Asia': '#f4a261',
    'Middle East & North Africa': '#bc6c25',
    'Sub-Saharan Africa': '#606c38'
};

let svg, xScale, yScale, sizeScale, chartW, chartH;
let _unsubs = [];
let _yearLabel = null;

// Per-axis config (base indicator, per-capita toggle, log/linear)
let _xBase = 'gdp', _xPc = true, _xLog = true;
let _yBase = 'ghg', _yPc = false, _yLog = false;

// Resolve base indicator + pc toggle to effective data key
function resolveIndicator(base, pc) {
    const map = {
        'gdp':   { total: 'gdp_total', pc: 'gdp_pc' },
        'ghg':   { total: 'ghg',       pc: 'ghg_pc' },
        'co2ff': { total: 'co2ff',     pc: 'co2ff_pc' }
    };
    if (map[base]) return map[base][pc ? 'pc' : 'total'];
    return base; // hdi, hdi_ng, pop -no pc variant
}

function hasPcVariant(base) {
    return ['gdp', 'ghg', 'co2ff'].includes(base);
}

// ---- Controls ----

function bindControls() {
    const xSel = document.getElementById('corr-x-select');
    const ySel = document.getElementById('corr-y-select');
    const sizeSel = document.getElementById('corr-size-select');
    const xPcGroup = document.getElementById('corr-x-pc-group');
    const yPcGroup = document.getElementById('corr-y-pc-group');
    const axisModeGroup = document.getElementById('corr-axis-mode-group');
    const scopeGroup = document.getElementById('corr-scope-group');

    function syncAxes() {
        State.set('correlationX', resolveIndicator(_xBase, _xPc));
        State.set('correlationY', resolveIndicator(_yBase, _yPc));
        // Dim PC buttons for indicators without per-capita
        if (xPcGroup) {
            xPcGroup.style.opacity = hasPcVariant(_xBase) ? '1' : '0.4';
            xPcGroup.style.pointerEvents = hasPcVariant(_xBase) ? '' : 'none';
        }
        if (yPcGroup) {
            yPcGroup.style.opacity = hasPcVariant(_yBase) ? '1' : '0.4';
            yPcGroup.style.pointerEvents = hasPcVariant(_yBase) ? '' : 'none';
        }
    }

    if (xSel) {
        xSel.value = _xBase;
        xSel.addEventListener('change', () => {
            _xBase = xSel.value;
            if (!hasPcVariant(_xBase)) _xPc = false;
            updatePcButtonUI('x');
            syncAxes();
        });
    }
    if (ySel) {
        ySel.value = _yBase;
        ySel.addEventListener('change', () => {
            _yBase = ySel.value;
            if (!hasPcVariant(_yBase)) _yPc = false;
            updatePcButtonUI('y');
            syncAxes();
        });
    }
    if (sizeSel) {
        sizeSel.value = State.get('correlationSize');
        sizeSel.addEventListener('change', () => State.set('correlationSize', sizeSel.value));
    }

    if (axisModeGroup) {
        axisModeGroup.querySelectorAll('[data-corr-axis-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.corrAxisMode === State.get('correlationAxisMode'));
            btn.onclick = () => {
                axisModeGroup.querySelectorAll('[data-corr-axis-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.set('correlationAxisMode', btn.dataset.corrAxisMode);
            };
        });
    }

    if (scopeGroup) {
        scopeGroup.querySelectorAll('[data-corr-scope]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.corrScope === State.get('correlationScope'));
            btn.onclick = () => {
                scopeGroup.querySelectorAll('[data-corr-scope]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.set('correlationScope', btn.dataset.corrScope);
            };
        });
    }

    // PC/Total toggles
    document.querySelectorAll('[data-axis][data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const axis = btn.dataset.axis;
            const mode = btn.dataset.mode;
            if (axis === 'x') _xPc = (mode === 'pc');
            else _yPc = (mode === 'pc');
            btn.closest('.ctrl-btn-row').querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            syncAxes();
        });
    });

    // Lin/Log toggles
    document.querySelectorAll('[data-axis][data-scale]').forEach(btn => {
        btn.addEventListener('click', () => {
            const axis = btn.dataset.axis;
            const scale = btn.dataset.scale;
            if (axis === 'x') _xLog = (scale === 'log');
            else _yLog = (scale === 'log');
            btn.closest('.ctrl-btn-row').querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateCorrelations();
        });
    });

    // Set initial button UI
    updatePcButtonUI('x');
    updatePcButtonUI('y');
    syncAxes();

    _unsubs.push(State.subscribe('correlationX', () => updateCorrelations()));
    _unsubs.push(State.subscribe('correlationY', () => updateCorrelations()));
    _unsubs.push(State.subscribe('correlationSize', () => updateCorrelations()));
    _unsubs.push(State.subscribe('correlationAxisMode', () => updateCorrelations()));
    _unsubs.push(State.subscribe('correlationScope', () => updateCorrelations()));
}

function updatePcButtonUI(axis) {
    const pc = axis === 'x' ? _xPc : _yPc;
    const group = document.getElementById(axis === 'x' ? 'corr-x-pc-group' : 'corr-y-pc-group');
    if (!group) return;
    group.querySelectorAll('.ctrl-btn').forEach(btn => {
        const mode = btn.dataset.mode;
        btn.classList.toggle('active', pc ? mode === 'pc' : mode === 'total');
    });
}

// ---- Data ----

function getCorrelationCountries() {
    const selected = State.get('selectedCountries');
    const scope = State.get('correlationScope') || 'all';
    if (scope === 'selected') return selected;
    return DataLoader.getAllMetadata().map(m => m.iso3);
}

function buildBubbles(year) {
    const xInd = State.get('correlationX');
    const yInd = State.get('correlationY');
    const sizeInd = State.get('correlationSize');
    const selected = State.get('selectedCountries');
    const scope = State.get('correlationScope') || 'all';
    const countryList = getCorrelationCountries();

    return countryList.map(iso3 => {
        const d = DataLoader.getCountryValue(iso3, year);
        const meta = DataLoader.getMetadata(iso3);
        if (!d || !meta) return null;

        const xVal = resolveIndicatorValue(d, xInd);
        const yVal = resolveIndicatorValue(d, yInd);
        const sizeVal = resolveIndicatorValue(d, sizeInd) || 1;
        if (xVal == null || yVal == null) return null;

        const isSelected = selected.includes(iso3);
        const region = meta.region_minerva || meta.region_un_sub || '';
        const showBackground = scope === 'all';

        return {
            iso3,
            name: meta.name,
            region,
            x: xVal,
            y: yVal,
            size: sizeVal,
            color: REGION_COLORS[region] || COLORS.gray,
            highlighted: scope === 'selected' || (selected.length > 0 && isSelected),
            dimmed: showBackground && selected.length > 0 && !isSelected
        };
    }).filter(Boolean);
}

function isValidForScale(value, useLog) {
    return Number.isFinite(value) && (!useLog || value > 0);
}

function paddedDomain(values, useLog) {
    const valid = values.filter(v => isValidForScale(v, useLog));
    if (valid.length === 0) return useLog ? [1, 10] : [0, 1];

    let min = d3.min(valid);
    let max = d3.max(valid);
    if (min === max) {
        const pad = Math.abs(max || 1) * 0.1;
        min -= pad;
        max += pad;
    }

    if (useLog) {
        return [Math.max(1e-9, min * 0.8), max * 1.2];
    }

    const pad = (max - min) * 0.08 || Math.abs(max || 1) * 0.08;
    const low = min >= 0 ? Math.max(0, min - pad) : min - pad;
    return [low, max + pad];
}

function getDomainValues(currentBubbles, useLogX, useLogY) {
    if (State.get('correlationAxisMode') !== 'fixed') {
        return {
            x: currentBubbles.map(d => d.x),
            y: currentBubbles.map(d => d.y),
            size: currentBubbles.map(d => d.size)
        };
    }

    const [start, end] = State.get('yearRange');
    const years = DataLoader.getAllYears().filter(y => y >= start && y <= end);
    const countries = getCorrelationCountries();
    const xInd = State.get('correlationX');
    const yInd = State.get('correlationY');
    const sizeInd = State.get('correlationSize');
    const values = { x: [], y: [], size: [] };

    years.forEach(year => {
        countries.forEach(iso3 => {
            const d = DataLoader.getCountryValue(iso3, year);
            if (!d) return;
            const xVal = resolveIndicatorValue(d, xInd);
            const yVal = resolveIndicatorValue(d, yInd);
            if (!isValidForScale(xVal, useLogX) || !isValidForScale(yVal, useLogY)) return;
            values.x.push(xVal);
            values.y.push(yVal);
            const sizeVal = resolveIndicatorValue(d, sizeInd);
            if (Number.isFinite(sizeVal)) values.size.push(sizeVal);
        });
    });

    if (values.x.length === 0) values.x = currentBubbles.map(d => d.x);
    if (values.y.length === 0) values.y = currentBubbles.map(d => d.y);
    if (values.size.length === 0) values.size = currentBubbles.map(d => d.size);
    return values;
}

// ---- Chart ----

function setupChart() {
    const wrapper = document.getElementById('analysis-chart-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const rect = wrapper.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 480;
    chartW = width - MARGIN.left - MARGIN.right;
    chartH = height - MARGIN.top - MARGIN.bottom;

    svg = d3.select(wrapper).append('svg')
        .attr('width', width)
        .attr('height', height)
      .append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    svg.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${chartH})`);
    svg.append('g').attr('class', 'y-axis');

    // Clip path to prevent bubbles from overflowing chart area
    svg.append('defs').append('clipPath').attr('id', 'corr-clip')
        .append('rect').attr('width', chartW).attr('height', chartH);

    svg.append('g').attr('class', 'bubbles-group').attr('clip-path', 'url(#corr-clip)');

    // Axis labels
    svg.append('text').attr('class', 'x-label')
        .attr('x', chartW / 2).attr('y', chartH + 42)
        .attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', COLORS.gray);

    svg.append('text').attr('class', 'y-label')
        .attr('x', -chartH / 2).attr('y', -52)
        .attr('transform', 'rotate(-90)')
        .attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', COLORS.gray);

    // Large year watermark in background
    _yearLabel = svg.append('text').attr('class', 'year-watermark')
        .attr('x', chartW / 2).attr('y', chartH / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 120)
        .attr('font-weight', 700)
        .attr('fill', COLORS.border)
        .attr('opacity', 0.4)
        .attr('pointer-events', 'none');

    xScale = d3.scaleLog().range([0, chartW]).clamp(true);
    yScale = d3.scaleLinear().range([chartH, 0]);
    sizeScale = d3.scaleSqrt().range([3, 40]);
}

function renderBubbles(bubbles) {
    if (!svg) return;

    const year = State.get('currentYear');
    const xInd = State.get('correlationX');
    const yInd = State.get('correlationY');
    const sizeInd = State.get('correlationSize');

    // Update watermark
    if (_yearLabel) _yearLabel.text(year);

    svg.selectAll('.empty-message').remove();

    // Use user-controlled log/linear scales
    const useLogX = _xLog;
    const useLogY = _yLog;
    const plotBubbles = bubbles.filter(d => isValidForScale(d.x, useLogX) && isValidForScale(d.y, useLogY));

    if (plotBubbles.length === 0) {
        svg.select('.bubbles-group').selectAll('*').remove();
        svg.selectAll('.region-legend').remove();
        svg.append('text')
            .attr('class', 'empty-message')
            .attr('x', chartW / 2)
            .attr('y', chartH / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', COLORS.lightGray)
            .attr('font-size', 13)
            .text(State.get('correlationScope') === 'selected'
                ? 'Select countries to show selected-only correlations'
                : 'No correlation data available for this year');
        return;
    }

    const domainValues = getDomainValues(plotBubbles, useLogX, useLogY);
    const xDomain = paddedDomain(domainValues.x, useLogX);
    const yDomain = paddedDomain(domainValues.y, useLogY);
    const sExt = d3.extent(domainValues.size.filter(Number.isFinite));

    xScale = useLogX
        ? d3.scaleLog().domain(xDomain).range([0, chartW]).clamp(true)
        : d3.scaleLinear().domain(xDomain).range([0, chartW]).nice();

    yScale = useLogY
        ? d3.scaleLog().domain(yDomain).range([chartH, 0]).clamp(true)
        : d3.scaleLinear().domain(yDomain).range([chartH, 0]).nice();

    sizeScale.domain([sExt[0] || 1, sExt[1] || 100]);

    // Axes
    const xTickFormat = useLogX ? d3.format('~s') : d3.format('.3~s');
    const yTickFormat = useLogY ? d3.format('~s') : d3.format('.3~s');

    svg.select('.x-axis')
        .transition().duration(300)
        .call(d3.axisBottom(xScale).ticks(6, xTickFormat));

    svg.select('.y-axis')
        .transition().duration(300)
        .call(d3.axisLeft(yScale).ticks(6, yTickFormat));

    const xLabel = (INDICATOR_LABELS[xInd] || xInd) + (useLogX ? ' [log]' : '');
    const yLabel = (INDICATOR_LABELS[yInd] || yInd) + (useLogY ? ' [log]' : '');
    svg.select('.x-label').text(xLabel);
    svg.select('.y-label').text(yLabel);

    // Bubbles with data join
    const bubblesGroup = svg.select('.bubbles-group');
    const dur = 400;

    const circles = bubblesGroup.selectAll('.bubble')
        .data(plotBubbles, d => d.iso3);

    circles.exit()
        .transition().duration(dur / 2)
        .attr('r', 0)
        .remove();

    const enter = circles.enter().append('circle')
        .attr('class', 'bubble')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', 0)
        .attr('fill', d => d.color)
        .attr('stroke', d => d.highlighted ? COLORS.dark : 'none')
        .attr('stroke-width', d => d.highlighted ? 1.5 : 0)
        .attr('opacity', d => d.dimmed ? 0.2 : (d.highlighted ? 0.85 : 0.65))
        .attr('cursor', 'pointer');

    const merged = enter.merge(circles);

    merged
        .on('mousemove', (event, d) => {
            Tooltip.show(
                `<strong>${d.name}</strong> (${year})<br>` +
                `${INDICATOR_LABELS[xInd]}: ${formatValue(d.x, xInd)}<br>` +
                `${INDICATOR_LABELS[yInd]}: ${formatValue(d.y, yInd)}<br>` +
                `${INDICATOR_LABELS[sizeInd]}: ${formatValue(d.size, sizeInd)}`,
                event
            );
        })
        .on('mouseleave', () => Tooltip.hide())
        .on('click', (event, d) => State.toggleCountry(d.iso3));

    // Sort: dimmed bubbles first (background), then highlighted (foreground)
    merged.sort((a, b) => (a.dimmed ? 0 : 1) - (b.dimmed ? 0 : 1));

    merged.transition().duration(dur)
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', d => sizeScale(d.size))
        .attr('fill', d => d.color)
        .attr('stroke', d => d.highlighted ? COLORS.dark : 'none')
        .attr('stroke-width', d => d.highlighted ? 1.5 : 0)
        .attr('opacity', d => d.dimmed ? 0.2 : (d.highlighted ? 0.85 : 0.65));

    // Country labels for highlighted (selected) bubbles -clamped within chart
    const labelData = plotBubbles.filter(d => d.highlighted);

    const labels = bubblesGroup.selectAll('.bubble-label')
        .data(labelData, d => d.iso3);

    labels.exit().remove();

    const enterLabels = labels.enter().append('text')
        .attr('class', 'bubble-label')
        .attr('font-size', 10)
        .attr('font-weight', 600)
        .attr('pointer-events', 'none')
        .attr('dy', -2);

    enterLabels.merge(labels)
        .text(d => d.name)
        .attr('fill', d => d.color)
        .transition().duration(dur)
        .attr('x', d => Math.max(30, Math.min(chartW - 30, xScale(d.x))))
        .attr('y', d => Math.max(14, yScale(d.y) - sizeScale(d.size) - 4))
        .attr('text-anchor', 'middle');

    // Region legend (outside chart area, in right margin)
    renderRegionLegend(plotBubbles);
}

function renderRegionLegend(bubbles) {
    const regions = [...new Set(bubbles.map(d => d.region))].sort();
    svg.selectAll('.region-legend').remove();

    // Position legend in the right margin (outside chart area)
    const legend = svg.append('g')
        .attr('class', 'region-legend')
        .attr('transform', `translate(${chartW + 10}, 0)`);

    const visible = regions.slice(0, 20);
    visible.forEach((region, i) => {
        const g = legend.append('g').attr('transform', `translate(0, ${i * 14})`);
        g.append('circle')
            .attr('cx', 4).attr('cy', 5).attr('r', 3.5)
            .attr('fill', REGION_COLORS[region] || COLORS.gray);
        g.append('text')
            .attr('x', 12).attr('y', 9)
            .attr('font-size', 8.5).attr('fill', COLORS.gray)
            .text(region.length > 16 ? region.slice(0, 14) + '..' : region);
    });
}

// ---- Public API ----

export function initCorrelations() {
    bindControls();
    setupChart();
}

export function updateCorrelations() {
    if (!svg) return;

    const year = State.get('currentYear');
    const xInd = State.get('correlationX');
    const yInd = State.get('correlationY');
    const axisMode = State.get('correlationAxisMode') || 'fixed';
    const scope = State.get('correlationScope') || 'all';

    const titleEl = document.getElementById('analysis-title');
    const subEl = document.getElementById('analysis-subtitle');
    if (titleEl) titleEl.textContent = `${INDICATOR_LABELS[yInd] || yInd} vs ${INDICATOR_LABELS[xInd] || xInd}`;
    if (subEl) subEl.textContent = `Bubble size: ${INDICATOR_LABELS[State.get('correlationSize')]}, Year: ${year}, axes: ${axisMode}, scope: ${scope === 'all' ? 'all countries' : 'selected only'}`;

    const bubbles = buildBubbles(year);
    renderBubbles(bubbles);
}

export function destroyCorrelations() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    svg = null;
    _yearLabel = null;
}
