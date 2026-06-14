// ============================================================================
// INTENSITIES - Time series of indicator ratios (e.g. CO2/GDP, GDP/HDI)
// Progressive reveal: lines grow as timelapse advances
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import Tooltip from '../components/tooltip.js';
import {
    COLORS, INDICATOR_LABELS, INDICATOR_UNITS,
    getColorForIndex, formatValue, shortName, resolveIndicatorValue
} from '../utils.js';

const MARGIN = { top: 24, right: 120, bottom: 44, left: 64 };
let _unsubs = [];
let _container = null;
let _retryTimer = null;

function dedupeSorted(values) {
    return [...new Set(values.filter(v => Number.isFinite(v)).map(v => +v))]
        .sort((a, b) => a - b);
}

function makeReadableTicks(values, scale, minPxGap) {
    const sorted = dedupeSorted(values);
    const kept = [];
    sorted.forEach(value => {
        const px = scale(value);
        const tooClose = kept.some(existing => Math.abs(scale(existing) - px) < minPxGap);
        if (!tooClose) kept.push(value);
    });
    return kept;
}

function makeYearTicks(xScale, width) {
    const [minYear, maxYear] = xScale.domain();
    const approxCount = Math.max(4, Math.floor(width / 110));
    const regular = xScale.ticks(approxCount);
    const withEnds = dedupeSorted([minYear, ...regular, maxYear]);
    const minPxGap = width < 900 ? 62 : 54;

    const interior = withEnds
        .filter(v => v !== minYear && v !== maxYear)
        .filter(v =>
            Math.abs(xScale(v) - xScale(minYear)) >= minPxGap &&
            Math.abs(xScale(v) - xScale(maxYear)) >= minPxGap
        );

    return makeReadableTicks([minYear, ...interior, maxYear], xScale, minPxGap);
}

function makeRatioTicks(yScale, height) {
    const [minY, maxY] = yScale.domain();
    const regular = yScale.ticks(6);
    const withEnds = dedupeSorted([minY, ...regular, maxY]);
    const minPxGap = height < 320 ? 18 : 16;
    const interior = withEnds
        .filter(v => v !== minY && v !== maxY)
        .filter(v =>
            Math.abs(yScale(v) - yScale(minY)) >= minPxGap &&
            Math.abs(yScale(v) - yScale(maxY)) >= minPxGap
        );
    return makeReadableTicks([minY, ...interior, maxY], yScale, minPxGap);
}

function formatRatioAxis(value) {
    const abs = Math.abs(value);
    if (abs === 0) return '0';
    if (abs >= 1000) return d3.format(',.0f')(value);
    if (abs >= 100) return d3.format(',.1f')(value).replace(/\.0$/, '');
    if (abs >= 10) return d3.format(',.2f')(value).replace(/\.?0+$/, '');
    if (abs >= 1) return d3.format(',.2f')(value).replace(/\.?0+$/, '');
    if (abs >= 0.01) return d3.format(',.3f')(value).replace(/\.?0+$/, '');
    return d3.format(',.2e')(value);
}

function layoutEndLabels(labels, chartH) {
    if (!labels.length) return labels;

    const top = 8;
    const bottom = Math.max(top, chartH - 8);
    const minGap = 16;

    labels.forEach(label => {
        label.labelY = Math.max(top, Math.min(bottom, label.y));
    });

    for (let i = 1; i < labels.length; i++) {
        if (labels[i].labelY - labels[i - 1].labelY < minGap) {
            labels[i].labelY = labels[i - 1].labelY + minGap;
        }
    }

    const overflow = labels[labels.length - 1].labelY - bottom;
    if (overflow > 0) labels[labels.length - 1].labelY -= overflow;

    for (let i = labels.length - 2; i >= 0; i--) {
        if (labels[i + 1].labelY - labels[i].labelY < minGap) {
            labels[i].labelY = labels[i + 1].labelY - minGap;
        }
    }

    const underflow = top - labels[0].labelY;
    if (underflow > 0) labels.forEach(label => { label.labelY += underflow; });

    return labels;
}

// ---- Controls binding ----

function bindControls() {
    const xSel = document.getElementById('intensity-x-select');
    const ySel = document.getElementById('intensity-y-select');

    if (xSel) {
        xSel.value = State.get('intensityX');
        xSel.addEventListener('change', () => State.set('intensityX', xSel.value));
    }
    if (ySel) {
        ySel.value = State.get('intensityY');
        ySel.addEventListener('change', () => State.set('intensityY', ySel.value));
    }

    _unsubs.push(State.subscribe('intensityX', () => updateIntensities()));
    _unsubs.push(State.subscribe('intensityY', () => updateIntensities()));
}

// ---- Data preparation ----

function buildSeries(currentYear) {
    const countries = State.get('selectedCountries');
    const xInd = State.get('intensityX');
    const yInd = State.get('intensityY');

    return countries.map((iso3, idx) => {
        const raw = DataLoader.getCountryData(iso3);
        if (!raw) return null;
        const meta = DataLoader.getMetadata(iso3);

        // ALL data points (not filtered by currentYear) for computing full y-scale
        const allPoints = raw.map(d => {
            const xVal = resolveIndicatorValue(d, xInd);
            const yVal = resolveIndicatorValue(d, yInd);
            if (xVal == null || yVal == null || xVal === 0) return null;
            return { y: d.y, v: yVal / xVal };
        }).filter(Boolean);

        // Progressive reveal: only points up to currentYear
        const visiblePoints = allPoints.filter(d => d.y <= currentYear);

        return {
            iso3,
            name: meta ? shortName(iso3, meta.name) : iso3,
            color: getColorForIndex(idx),
            data: visiblePoints,
            allData: allPoints
        };
    }).filter(Boolean);
}

function buildTitle() {
    const yInd = State.get('intensityY');
    const xInd = State.get('intensityX');
    const yLabel = INDICATOR_LABELS[yInd] || yInd;
    const xLabel = INDICATOR_LABELS[xInd] || xInd;
    return `${yLabel} / ${xLabel}`;
}

// ---- Public API ----

export function initIntensities() {
    _container = document.getElementById('analysis-chart-wrapper');
    bindControls();
}

export function updateIntensities() {
    if (!_container) return;

    const titleEl = document.getElementById('analysis-title');
    const subEl = document.getElementById('analysis-subtitle');
    if (titleEl) titleEl.textContent = buildTitle();
    if (subEl) subEl.textContent = 'Ratio of selected indicators over time';

    const currentYear = State.get('currentYear');
    const series = buildSeries(currentYear);
    renderChart(_container, series, currentYear);
}

export function destroyIntensities() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    _container = null;
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
}

// ---- Full chart rendering (measures dimensions fresh each call) ----

function renderChart(container, seriesList, currentYear) {
    container.innerHTML = '';

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // If dimensions not available yet, retry after layout
    if (width < 50 || height < 50) {
        if (_retryTimer) clearTimeout(_retryTimer);
        _retryTimer = setTimeout(() => updateIntensities(), 100);
        return;
    }

    const chartW = width - MARGIN.left - MARGIN.right;
    const chartH = height - MARGIN.top - MARGIN.bottom;
    if (chartW <= 0 || chartH <= 0) return;

    // Use ALL data (including future) for consistent y-scale
    const allDataPoints = seriesList.flatMap(s => s.allData);
    if (!allDataPoints.length) return;

    // Fixed x-axis: use full yearRange so chart space stays constant
    const yearRange = State.get('yearRange');
    const xScale = d3.scaleLinear().domain(yearRange).range([0, chartW]);

    // Y scale from ALL data (not just visible) for stable axis during timelapse
    const vExtent = d3.extent(allDataPoints, d => d.v);
    const vPad = (vExtent[1] - vExtent[0]) * 0.08 || 0.1;
    const yScale = d3.scaleLinear()
        .domain([Math.max(0, vExtent[0] - vPad), vExtent[1] + vPad])
        .range([chartH, 0]);
    yScale.nice(6);

    const xTicks = makeYearTicks(xScale, chartW);
    const yTicks = makeRatioTicks(yScale, chartH);

    const lineGen = d3.line()
        .defined(d => d.v != null)
        .x(d => xScale(d.y))
        .y(d => yScale(d.v));

    // SVG
    const svgEl = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svgEl.append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Clip path
    svgEl.append('defs').append('clipPath').attr('id', 'intensity-clip')
        .append('rect').attr('width', chartW).attr('height', chartH);

    // Grid
    g.selectAll('.grid-h')
        .data(yTicks)
        .join('line')
        .attr('x1', 0).attr('x2', chartW)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
        .attr('stroke', '#eee').attr('stroke-width', 0.5);

    // Axes (fixed, don't change during timelapse)
    g.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${chartH})`)
        .call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d3.format('d')))
        .selectAll('text')
        .attr('text-anchor', (d, i) => i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle');

    g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(yScale).tickValues(yTicks).tickFormat(formatRatioAxis));

    // "Future" background zone (light shading for years beyond currentYear)
    const [, maxY] = yearRange;
    if (currentYear < maxY) {
        const futureX = xScale(currentYear);
        g.append('rect')
            .attr('x', futureX)
            .attr('y', 0)
            .attr('width', chartW - futureX)
            .attr('height', chartH)
            .attr('fill', '#f5f5f5')
            .attr('opacity', 0.6);
    }

    // Lines group with clip — only visible data
    const linesG = g.append('g').attr('clip-path', 'url(#intensity-clip)');

    seriesList.forEach(s => {
        if (s.data.length === 0) return;
        linesG.append('path')
            .datum(s.data)
            .attr('fill', 'none')
            .attr('stroke', s.color)
            .attr('stroke-width', 2)
            .attr('opacity', 0.85)
            .attr('d', lineGen);
    });

    // End labels with collision avoidance (at the tip of each visible line)
    const labels = seriesList
        .filter(s => s.data.length > 0)
        .map(s => {
            const last = s.data[s.data.length - 1];
            return { name: s.name, color: s.color, x: xScale(last.y), y: yScale(last.v) };
        })
        .sort((a, b) => a.y - b.y);

    layoutEndLabels(labels, chartH);

    labels.forEach(l => {
        if (Math.abs(l.labelY - l.y) > 2) {
            g.append('line')
                .attr('x1', l.x + 1).attr('x2', l.x + 5)
                .attr('y1', l.y).attr('y2', l.labelY)
                .attr('stroke', l.color).attr('stroke-width', 0.8)
                .attr('opacity', 0.45);
        }

        g.append('text')
            .attr('x', l.x + 6)
            .attr('y', l.labelY)
            .attr('font-size', 11)
            .attr('dy', '0.35em')
            .attr('fill', l.color)
            .text(l.name);
    });

    // Year marker line at currentYear
    if (currentYear < maxY) {
        const xm = xScale(currentYear);
        if (xm >= 0 && xm <= chartW) {
            g.append('line')
                .attr('x1', xm).attr('x2', xm)
                .attr('y1', 0).attr('y2', chartH)
                .attr('stroke', COLORS.dark).attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4,3').attr('opacity', 0.5);
            g.append('text')
                .attr('x', xm).attr('y', -6)
                .attr('text-anchor', 'middle')
                .attr('font-size', 10).attr('font-weight', 600)
                .attr('fill', COLORS.dark)
                .text(currentYear);
        }
    }

    // Hover overlay
    const hoverG = g.append('g').style('display', 'none');
    hoverG.append('line')
        .attr('class', 'hover-line')
        .attr('y1', 0).attr('y2', chartH)
        .attr('stroke', COLORS.dark).attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,2').attr('opacity', 0.6);

    g.append('rect')
        .attr('width', chartW).attr('height', chartH)
        .attr('fill', 'none').attr('pointer-events', 'all')
        .on('mousemove', function (event) {
            const [mx] = d3.pointer(event);
            const year = Math.round(xScale.invert(mx));
            if (year > currentYear) { hoverG.style('display', 'none'); Tooltip.hide(); return; }
            const yInd = State.get('intensityY');
            const xInd = State.get('intensityX');
            const ratioLabel = `${INDICATOR_LABELS[yInd] || yInd} / ${INDICATOR_LABELS[xInd] || xInd}`;
            const rows = seriesList.map(s => {
                const pt = s.data.find(d => d.y === year);
                return pt ? `<tr><td style="color:${s.color}">${s.name}</td><td>${pt.v.toFixed(4)}</td></tr>` : '';
            }).filter(Boolean).join('');
            if (rows) {
                hoverG.style('display', null);
                const x = xScale(year);
                hoverG.select('.hover-line').attr('x1', x).attr('x2', x);
                Tooltip.show(`<strong>${ratioLabel} \u2014 ${year}</strong><table>${rows}</table>`, event);
            }
        })
        .on('mouseleave', () => { hoverG.style('display', 'none'); Tooltip.hide(); });
}
