// ============================================================================
// RANKING VIEW - Bump chart showing country ranking trajectories over time
// Maddison-style with quartile zones, configurable indicator + scope
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import Tooltip from '../components/tooltip.js';
import {
    COLORS,
    INDICATOR_LABELS,
    getColorForIndex,
    formatValue,
    formatRank,
    resolveIndicatorValue
} from '../utils.js';

let currentContainer = null;

export function initRankingView() {
    currentContainer = document.getElementById('explore-ranking-container');

    // Bind ranking-specific controls
    const indSelect = document.getElementById('ranking-indicator');
    const scopeSelect = document.getElementById('ranking-scope');
    const countSelect = document.getElementById('ranking-count');

    if (indSelect) indSelect.addEventListener('change', () => updateRankingView());
    if (scopeSelect) scopeSelect.addEventListener('change', () => updateRankingView());
    if (countSelect) countSelect.addEventListener('change', () => updateRankingView());
}

export function updateRankingView() {
    if (!currentContainer) return;
    renderBumpChart();
}

export function destroyRankingView() {
    if (currentContainer) currentContainer.innerHTML = '';
}

// ============================================================================
// Bump chart rendering
// ============================================================================

function renderBumpChart() {
    const container = currentContainer;
    container.innerHTML = '';

    const indicator = document.getElementById('ranking-indicator')?.value || 'ghg';
    const scope = document.getElementById('ranking-scope')?.value || 'annual';
    const maxShow = parseInt(document.getElementById('ranking-count')?.value || '30');
    const selectedCountries = State.get('selectedCountries');
    const _yr = State.get('yearRange');
    const yearFrom = State.get('yearFrom');
    const yearRange = [Math.max(_yr[0], yearFrom), _yr[1]];
    const currentYear = State.get('currentYear');

    // Build ranking for each year
    const allYears = DataLoader.getAllYears().filter(y => y >= yearRange[0] && y <= yearRange[1] && y <= currentYear);
    if (allYears.length === 0) return;

    // Pre-compute rankings for ALL years once (instead of per-country × per-year)
    const allMeta = DataLoader.getAllMetadata();
    const cumulativeData = scope === 'cumulative' ? computeCumulativeRanking(allMeta, allYears, indicator) : null;

    const rankingsByYear = new Map();
    allYears.forEach(year => {
        let ranking;
        if (scope === 'cumulative' && cumulativeData) {
            ranking = buildRankingFromCumulative(cumulativeData, year, indicator);
        } else {
            // Use DataLoader's pre-computed rankings (O(1) lookup)
            const precomputed = DataLoader.getRanking(indicator, year);
            ranking = precomputed.length > 0 ? precomputed : buildAnnualRanking(allMeta, year, indicator);
        }
        const map = new Map(ranking.map(d => [d.iso3, d]));
        rankingsByYear.set(year, map);
    });

    // Get ranking at current year to determine who to display
    const currentRankingMap = rankingsByYear.get(currentYear);
    const currentRanking = currentRankingMap
        ? [...currentRankingMap.values()].sort((a, b) => a.rank - b.rank)
        : [];

    if (currentRanking.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">No ranking data available</div>';
        return;
    }

    // Determine which countries to show
    const effectiveMax = maxShow > 0 ? Math.min(maxShow, currentRanking.length) : currentRanking.length;
    const topIsos = new Set(currentRanking.slice(0, effectiveMax).map(d => d.iso3));

    // Always include selected countries
    selectedCountries.forEach(iso3 => topIsos.add(iso3));

    // Build rank trajectories using pre-computed rankings (O(1) lookup per entry)
    const trajectories = [];
    topIsos.forEach(iso3 => {
        const meta = DataLoader.getMetadata(iso3);
        if (!meta) return;
        const points = [];

        allYears.forEach(year => {
            const entry = rankingsByYear.get(year)?.get(iso3);
            if (entry) points.push({ year, rank: entry.rank, value: entry.value });
        });

        if (points.length > 0) {
            trajectories.push({ iso3, name: meta.name, points });
        }
    });

    // Max rank across all visible data for Y scale
    const maxRank = Math.min(
        effectiveMax + 5,
        d3.max(trajectories, t => d3.max(t.points, p => p.rank)) || 30
    );

    // Dimensions
    const rect = container.getBoundingClientRect();
    const width = rect.width || 700;
    const height = rect.height || 500;
    const margin = { top: 30, right: 100, bottom: 35, left: 50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svg = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
        .domain([allYears[0], allYears[allYears.length - 1]])
        .range([0, w]);

    const yScale = d3.scaleLinear()
        .domain([1, maxRank])
        .range([0, h]);

    // Quartile zones
    const q1 = Math.ceil(maxRank * 0.25);
    const q3 = Math.ceil(maxRank * 0.75);

    g.append('rect')
        .attr('x', 0).attr('y', yScale(1))
        .attr('width', w).attr('height', yScale(q1) - yScale(1))
        .attr('fill', '#1e6091').attr('opacity', 0.04);

    g.append('rect')
        .attr('x', 0).attr('y', yScale(q3))
        .attr('width', w).attr('height', yScale(maxRank) - yScale(q3))
        .attr('fill', '#e63946').attr('opacity', 0.04);

    // Grid lines
    const yTicks = yScale.ticks(10).filter(t => t === Math.round(t) && t >= 1);
    yTicks.forEach(tick => {
        g.append('line')
            .attr('x1', 0).attr('x2', w)
            .attr('y1', yScale(tick)).attr('y2', yScale(tick))
            .attr('stroke', COLORS.border)
            .attr('stroke-dasharray', '3,3')
            .attr('stroke-width', 0.5);
    });

    // Current year line
    g.append('line')
        .attr('x1', xScale(currentYear)).attr('x2', xScale(currentYear))
        .attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.lightGray)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,2');

    // Axes
    g.append('g')
        .attr('transform', `translate(0,${h})`)
        .attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(10).tickFormat(d3.format('d')));

    g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(10).tickFormat(d3.format('d')));

    // Y-axis label
    const scopeLabel = scope === 'cumulative' ? 'cumulative' : '';
    const indLabel = INDICATOR_LABELS[indicator] || indicator;
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -h / 2).attr('y', -38)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px').style('fill', COLORS.gray)
        .text('World ranking (1 = highest)');

    // Title
    svg.append('text')
        .attr('x', margin.left).attr('y', 16)
        .style('font-size', '12px').style('font-weight', '600').style('fill', COLORS.dark)
        .text(`${indLabel} ${scopeLabel} ranking`);

    // Draw trajectories
    const selectedSet = new Set(selectedCountries);
    const line = d3.line()
        .defined(d => d.rank != null && d.rank <= maxRank)
        .x(d => xScale(d.year))
        .y(d => yScale(d.rank))
        .curve(d3.curveMonotoneX);

    // Sort: non-selected first (background), selected on top
    const sorted = [...trajectories].sort((a, b) => {
        const asel = selectedSet.has(a.iso3) ? 1 : 0;
        const bsel = selectedSet.has(b.iso3) ? 1 : 0;
        return asel - bsel;
    });

    // Draw non-selected first (background), then selected on top
    const selectedLabels = [];
    sorted.forEach((traj, ti) => {
        const isSelected = selectedSet.has(traj.iso3);
        const selIdx = selectedCountries.indexOf(traj.iso3);
        const color = isSelected ? getColorForIndex(selIdx) : COLORS.lightGray;
        const opacity = isSelected ? 1 : 0.3;
        const strokeWidth = isSelected ? 2.2 : 0.6;

        const validPoints = traj.points.filter(p => p.rank <= maxRank);
        if (validPoints.length < 2) return;

        // Line
        g.append('path')
            .datum(validPoints)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', strokeWidth)
            .attr('opacity', opacity)
            .attr('d', line);

        // End label — only for selected countries
        if (isSelected) {
            const last = validPoints[validPoints.length - 1];
            selectedLabels.push({ name: traj.name, x: xScale(last.year) + 6, y: yScale(last.rank) + 4, color });
        }

        // Tooltip zone using invisible wider path
        const last = validPoints[validPoints.length - 1];
        g.append('path')
            .datum(validPoints)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 10)
            .attr('d', line)
            .style('cursor', 'pointer')
            .on('mouseenter', (event) => {
                const [mx] = d3.pointer(event);
                const hoveredYear = Math.round(xScale.invert(mx));
                const pt = validPoints.find(p => p.year === hoveredYear) || last;
                Tooltip.show(`
                    <div class="tooltip-title"><span>${traj.name}</span><span>${pt.year}</span></div>
                    <div class="tooltip-row"><span class="tooltip-label">Rank</span><span class="tooltip-value">#${pt.rank}</span></div>
                    <div class="tooltip-row"><span class="tooltip-label">${indLabel}</span><span class="tooltip-value">${formatValue(pt.value, indicator)}</span></div>
                `, event);
            })
            .on('mousemove', (event) => Tooltip.move(event))
            .on('mouseleave', () => Tooltip.hide())
            .on('click', () => State.toggleCountry(traj.iso3));
    });

    // Resolve selected label collisions
    selectedLabels.sort((a, b) => a.y - b.y);
    const labelH = 13;
    for (let i = 1; i < selectedLabels.length; i++) {
        if (selectedLabels[i].y - selectedLabels[i - 1].y < labelH) {
            selectedLabels[i].y = selectedLabels[i - 1].y + labelH;
        }
    }
    selectedLabels.forEach(lbl => {
        g.append('text')
            .attr('x', lbl.x)
            .attr('y', lbl.y)
            .style('font-size', '10px')
            .style('font-weight', '700')
            .style('fill', lbl.color)
            .text(lbl.name);
    });

    // Footer
    g.append('text')
        .attr('x', 0).attr('y', h + 30)
        .style('font-size', '10px').style('fill', COLORS.lightGray)
        .text(`Showing ${trajectories.length} countries \u2014 Rank 1 = highest ${indLabel}`);
}

// ============================================================================
// Ranking builders
// ============================================================================

function buildAnnualRanking(allMeta, year, indicator) {
    const entries = [];
    allMeta.forEach(m => {
        const val = DataLoader.getCountryValue(m.iso3, year);
        const v = resolveIndicatorValue(val, indicator);
        if (v != null) entries.push({ iso3: m.iso3, value: v });
    });
    entries.sort((a, b) => b.value - a.value);
    entries.forEach((e, i) => e.rank = i + 1);
    return entries;
}

function computeCumulativeRanking(allMeta, allYears, indicator) {
    // Returns Map<iso3, Map<year, cumulativeValue>>
    const result = {};
    allMeta.forEach(m => {
        let cumSum = 0;
        const yearMap = new Map();
        allYears.forEach(year => {
            const d = DataLoader.getCountryValue(m.iso3, year);
            const v = d ? resolveIndicatorValue(d, indicator) : null;
            if (v != null) cumSum += v;
            if (cumSum > 0) yearMap.set(year, cumSum);
        });
        if (yearMap.size > 0) result[m.iso3] = yearMap;
    });
    return result;
}

function buildRankingFromCumulative(cumulativeData, year, indicator) {
    const entries = [];
    Object.entries(cumulativeData).forEach(([iso3, yearMap]) => {
        const v = yearMap.get(year);
        if (v != null) entries.push({ iso3, value: v });
    });
    entries.sort((a, b) => b.value - a.value);
    entries.forEach((e, i) => e.rank = i + 1);
    return entries;
}
