// ============================================================================
// TAPIO VIEW - Decoupling pattern scatter plots (GDP growth vs GHG growth)
// Based on Tapio (2005) framework
// Multi-country: renders one chart per country in a grid layout
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import Tooltip from '../components/tooltip.js';
import { COLORS, getColorForIndex, shortName } from '../utils.js';

// Tapio pattern definitions (pre-computed in data as pat / pat_ff)
const PATTERN_META = {
    AD: { label: 'Absolute decoupling',   color: '#2a9d8f', desc: 'GDP grows, GHG falls' },
    WD: { label: 'Weak decoupling',       color: '#8ecae6', desc: 'GDP grows, GHG grows slower' },
    CG: { label: 'Coupling growth',       color: '#f4a261', desc: 'GDP and GHG grow at similar rates' },
    DG: { label: 'Divergent growth',      color: '#e76f51', desc: 'GDP grows, GHG grows faster' },
    RE: { label: 'Recessive',             color: '#6c757d', desc: 'GDP and GHG both decline' },
    DR: { label: 'Decoupling recessive',  color: '#606c38', desc: 'GDP falls, GHG falls faster' },
    LB: { label: 'Land-based',            color: '#a68a64', desc: 'Land-use change dominated' },
    ND: { label: 'No data',               color: '#dee2e6', desc: '' }
};

// Fallback classification when pre-computed pat field is missing
function classifyTapio(gdpGrowth, ghgGrowth) {
    if (gdpGrowth === 0 && ghgGrowth === 0) return 'ND';
    const e = gdpGrowth !== 0 ? ghgGrowth / gdpGrowth : null;

    if (gdpGrowth > 0 && ghgGrowth < 0) return 'AD';
    if (gdpGrowth > 0 && ghgGrowth >= 0) {
        if (e != null && e < 0.8) return 'WD';
        if (e != null && e <= 1.2) return 'CG';
        return 'DG';
    }
    if (gdpGrowth < 0 && ghgGrowth <= 0) {
        if (e != null && e > 1.2) return 'DR';
        return 'RE';
    }
    return 'DG'; // GDP falls, GHG rises
}

let currentContainer = null;

export function initTapioView() {
    currentContainer = document.getElementById('analysis-chart-wrapper');
}

export function updateTapioView() {
    if (!currentContainer) return;
    renderTapio();
}

export function destroyTapioView() {
    if (currentContainer) currentContainer.innerHTML = '';
}

function renderTapio() {
    const container = currentContainer;
    container.innerHTML = '';

    const countries = State.get('selectedCountries');
    const yearRange = State.get('yearRange');
    const patField = document.getElementById('tapio-type-select')?.value || 'pat';
    const windowSize = parseInt(document.getElementById('tapio-window-select')?.value || '10');
    const currentYear = State.get('currentYear');

    // Update titles
    const titleEl = document.getElementById('analysis-title');
    const subtitleEl = document.getElementById('analysis-subtitle');
    const emType = patField === 'pat_ff' ? 'CO\u2082 fossil fuel' : 'GHG';
    if (titleEl) titleEl.textContent = `Tapio decoupling patterns \u2014 ${emType}`;
    if (subtitleEl) subtitleEl.textContent = `${windowSize}-year growth rates \u2014 GDP per capita vs emissions`;

    if (countries.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view Tapio decoupling patterns</div>';
        return;
    }

    // Build data for each country
    const countryDataSets = countries.map((iso3, cidx) => {
        const raw = DataLoader.getCountryData(iso3);
        const meta = DataLoader.getMetadata(iso3);
        if (!raw) return null;

        const filtered = raw.filter(d => d.y >= yearRange[0] && d.y <= yearRange[1]);
        const ghgField = patField === 'pat_ff' ? 'co2ff' : 'ghg';
        const points = [];

        for (let i = windowSize; i < filtered.length; i++) {
            const d0 = filtered[i - windowSize];
            const d1 = filtered[i];
            if (!d0.gdp_pc || !d1.gdp_pc || d0.gdp_pc === 0) continue;
            if (!d0[ghgField] || !d1[ghgField] || d0[ghgField] === 0) continue;

            const gdpGrowth = ((d1.gdp_pc - d0.gdp_pc) / d0.gdp_pc) * 100;
            const ghgGrowth = ((d1[ghgField] - d0[ghgField]) / d0[ghgField]) * 100;
            // Use pre-computed pattern from data; fall back to dynamic classification
            const pat = d1[patField] || classifyTapio(gdpGrowth, ghgGrowth);
            // var_ghg for bubble sizing (if available in data)
            const varGhg = d1.var_ghg != null ? Math.abs(d1.var_ghg) : null;

            points.push({
                year: d1.y,
                startYear: d0.y,
                gdpGrowth,
                ghgGrowth,
                pat,
                varGhg
            });
        }

        return {
            iso3,
            name: meta ? meta.name : iso3,
            color: getColorForIndex(cidx),
            points
        };
    }).filter(Boolean);

    const validDataSets = countryDataSets.filter(ds => ds.points.length > 0);
    if (validDataSets.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">No data available for selected period</div>';
        return;
    }

    // Create grid layout - one chart per country
    const gridDiv = document.createElement('div');
    const containerWidth = container.clientWidth || container.getBoundingClientRect().width || 1000;
    const cols = validDataSets.length === 1 ? 1
        : containerWidth < 900 ? 1
        : containerWidth < 1550 ? 2
        : Math.min(3, validDataSets.length);
    const cellHeight = containerWidth < 900 ? 380 : 360;
    gridDiv.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));grid-auto-rows:minmax(${cellHeight}px,auto);gap:28px 22px;width:100%;height:100%;padding:12px;overflow:auto;align-content:start`;
    container.appendChild(gridDiv);

    validDataSets.forEach(ds => {
        const cell = document.createElement('div');
        cell.style.cssText = `position:relative;min-height:${cellHeight}px;overflow:hidden`;
        gridDiv.appendChild(cell);
        renderSingleTapio(cell, ds, windowSize, currentYear, emType);
    });

    // Shared legend at bottom — only show patterns present in data
    const legendDiv = document.createElement('div');
    legendDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;padding:8px 12px;justify-content:center';
    const usedPatterns = new Set();
    validDataSets.forEach(ds => ds.points.forEach(p => { if (p.pat !== 'ND') usedPatterns.add(p.pat); }));
    const patOrder = ['AD', 'WD', 'CG', 'DG', 'RE', 'DR', 'LB'];
    patOrder.filter(code => usedPatterns.has(code)).forEach(code => {
        const meta = PATTERN_META[code];
        legendDiv.innerHTML += `<span style="display:flex;align-items:center;gap:4px;font-size:10px;color:${COLORS.gray}">
            <span style="width:10px;height:10px;border-radius:50%;background:${meta.color};display:inline-block"></span>
            ${meta.label}
        </span>`;
    });
    container.appendChild(legendDiv);
}

function renderSingleTapio(container, ds, windowSize, currentYear, emType) {
    const rect = container.getBoundingClientRect();
    const width = rect.width || 350;
    const height = rect.height || 280;
    const margin = { top: 28, right: 20, bottom: 50, left: 62 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svg = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height);

    // Clip path for outliers
    const clipId = 'tapio-clip-' + ds.iso3;
    svg.append('defs').append('clipPath').attr('id', clipId)
        .append('rect').attr('width', w).attr('height', h);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Title
    svg.append('text')
        .attr('x', margin.left).attr('y', 16)
        .style('font-size', '11px').style('font-weight', '600').style('fill', ds.color)
        .text(ds.name);

    const points = ds.points;

    // Scales — use percentile-based clamping to handle outliers
    // Instead of symmetric max(abs), use 5th/95th percentiles + 15% padding
    // This prevents a single extreme observation from compressing all other data
    const xVals = points.map(d => d.gdpGrowth).sort((a, b) => a - b);
    const yVals = points.map(d => d.ghgGrowth).sort((a, b) => a - b);

    function percentileBounds(sorted) {
        if (sorted.length < 3) {
            const mx = Math.max(Math.abs(sorted[0] || 0), Math.abs(sorted[sorted.length - 1] || 0)) * 1.15 || 10;
            return [-mx, mx];
        }
        const p05 = sorted[Math.floor(sorted.length * 0.03)] || 0;
        const p95 = sorted[Math.ceil(sorted.length * 0.97) - 1] || 0;
        const maxAbs = Math.max(Math.abs(p05), Math.abs(p95)) * 1.3 || 10;
        return [-maxAbs, maxAbs];
    }

    const xBounds = percentileBounds(xVals);
    const yBounds = percentileBounds(yVals);

    const xScale = d3.scaleLinear().domain(xBounds).range([0, w]).nice();
    const yScale = d3.scaleLinear().domain(yBounds).range([h, 0]).nice();

    // Quadrant backgrounds
    // Green: top-right (GDP grows, GHG decreases) = Strong decoupling
    g.append('rect')
        .attr('x', xScale(0)).attr('y', 0)
        .attr('width', w - xScale(0)).attr('height', yScale(0))
        .attr('fill', '#2a9d8f').attr('opacity', 0.06);

    // Red: bottom-left (GDP shrinks, GHG increases) = Strong negative
    g.append('rect')
        .attr('x', 0).attr('y', yScale(0))
        .attr('width', xScale(0)).attr('height', h - yScale(0))
        .attr('fill', '#9b2226').attr('opacity', 0.06);

    // Diagonal 1:1 line
    const diagMin = Math.max(xScale.domain()[0], yScale.domain()[0]);
    const diagMax = Math.min(xScale.domain()[1], yScale.domain()[1]);
    g.append('line')
        .attr('x1', xScale(diagMin)).attr('y1', yScale(diagMin))
        .attr('x2', xScale(diagMax)).attr('y2', yScale(diagMax))
        .attr('stroke', COLORS.lightGray)
        .attr('stroke-dasharray', '4,3')
        .attr('stroke-width', 1);

    // Zero lines
    g.append('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', yScale(0)).attr('y2', yScale(0))
        .attr('stroke', COLORS.gray).attr('stroke-width', 0.5);
    g.append('line')
        .attr('x1', xScale(0)).attr('x2', xScale(0))
        .attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.gray).attr('stroke-width', 0.5);

    // Axes
    g.append('g')
        .attr('transform', `translate(0,${h})`)
        .attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => d + '%'));

    g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d + '%'));

    // Axis labels
    g.append('text')
        .attr('x', w / 2).attr('y', h + 34)
        .attr('text-anchor', 'middle')
        .style('font-size', '9px').style('fill', COLORS.gray)
        .text(`GDP pc growth (${windowSize}y, %)`);

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -h / 2).attr('y', -38)
        .attr('text-anchor', 'middle')
        .style('font-size', '9px').style('fill', COLORS.gray)
        .text(`${emType} growth (${windowSize}y, %)`);

    // Quadrant labels
    g.append('text').attr('x', w - 4).attr('y', 10).attr('text-anchor', 'end')
        .style('font-size', '8px').style('fill', '#2a9d8f').style('opacity', 0.6)
        .text('Absolute decoupling');
    g.append('text').attr('x', 4).attr('y', h - 4).attr('text-anchor', 'start')
        .style('font-size', '8px').style('fill', '#e76f51').style('opacity', 0.6)
        .text('Divergent growth');

    // Bubble size scale (if var_ghg data is available)
    const hasVarGhg = points.some(d => d.varGhg != null);
    const rScale = hasVarGhg
        ? d3.scaleSqrt().domain([0, d3.max(points, d => d.varGhg || 0)]).range([2, 14])
        : null;

    // Points - colored by Tapio pattern, dimmed except current year
    const dotsG = g.append('g').attr('clip-path', `url(#${clipId})`);
    dotsG.selectAll('.tapio-dot')
        .data(points)
        .enter().append('circle')
        .attr('class', 'tapio-dot')
        .attr('cx', d => xScale(d.gdpGrowth))
        .attr('cy', d => yScale(d.ghgGrowth))
        .attr('r', d => {
            if (d.year === currentYear) return rScale ? Math.max(rScale(d.varGhg || 0), 5) : 6;
            return rScale ? Math.max(rScale(d.varGhg || 0), 2) : 3.5;
        })
        .attr('fill', d => PATTERN_META[d.pat]?.color || '#999')
        .attr('opacity', d => d.year === currentYear ? 1 : 0.25)
        .attr('stroke', d => d.year === currentYear ? COLORS.dark : 'none')
        .attr('stroke-width', 1.5)
        .attr('cursor', 'pointer')
        .on('mousemove', (event, d) => {
            const patInfo = PATTERN_META[d.pat] || PATTERN_META.ND;
            Tooltip.show(
                `<strong>${ds.name}</strong> (${d.startYear}\u2013${d.year})<br>` +
                `GDP growth: ${d.gdpGrowth >= 0 ? '+' : ''}${d.gdpGrowth.toFixed(1)}%<br>` +
                `${emType} growth: ${d.ghgGrowth >= 0 ? '+' : ''}${d.ghgGrowth.toFixed(1)}%<br>` +
                `Pattern: <span style="color:${patInfo.color};font-weight:600">${patInfo.label}</span>`,
                event
            );
        })
        .on('mouseleave', () => Tooltip.hide());

    // Label on current year point
    const curPt = points.find(d => d.year === currentYear);
    if (curPt) {
        g.append('text')
            .attr('x', xScale(curPt.gdpGrowth))
            .attr('y', yScale(curPt.ghgGrowth) - 10)
            .attr('text-anchor', 'middle')
            .style('font-size', '9px')
            .style('font-weight', '600')
            .style('fill', PATTERN_META[curPt.pat]?.color || COLORS.dark)
            .text(curPt.year);
    }
}
