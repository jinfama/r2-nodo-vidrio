// ============================================================================
// TAPIO VIEW - Decoupling pattern scatter plots (GDP growth vs GHG growth)
// Based on Tapio (2005) framework
// Multi-country: renders one chart per country in a grid layout
// ============================================================================

import State from '../state.js?v=20260911b';
import DataLoader from '../data-loader.js?v=20260911b';
import Tooltip from '../components/tooltip.js?v=20260911b';
import { COLORS, getColorForIndex, shortName, tLabel } from '../utils.js?v=20260911b';
import {
    createFacetGrid, resetFacetContainer, sizeFacetGrid, appendFacetCells,
    createFacetLegend, facetTicks, facetTitle, dropCornerTick
} from '../analysis/facet-grid.js?v=20260911b';

// Tapio pattern definitions (pre-computed in data as pat / pat_ff)
const PATTERN_META = {
    AD: { get label() { return tLabel('Absolute decoupling', 'Desacoplamiento absoluto', '绝对脱钩'); }, color: '#2a9d8f', get desc() { return tLabel('GDP grows, GHG falls', 'el PIB crece y los GEI caen', 'GDP 上升，温室气体下降'); } },
    WD: { get label() { return tLabel('Weak decoupling', 'Desacoplamiento débil', '弱脱钩'); }, color: '#8ecae6', get desc() { return tLabel('GDP grows, GHG grows slower', 'el PIB crece y los GEI crecen más despacio', 'GDP 上升，温室气体上升较慢'); } },
    CG: { get label() { return tLabel('Coupling growth', 'Crecimiento acoplado', '耦合增长'); }, color: '#f4a261', get desc() { return tLabel('GDP and GHG grow at similar rates', 'el PIB y los GEI crecen a ritmos parecidos', 'GDP 与温室气体以相近速度上升'); } },
    DG: { get label() { return tLabel('Divergent growth', 'Crecimiento divergente', '发散增长'); }, color: '#e76f51', get desc() { return tLabel('GDP grows, GHG grows faster', 'el PIB crece y los GEI crecen más deprisa', 'GDP 上升，温室气体上升更快'); } },
    RE: { get label() { return tLabel('Recessive', 'Recesivo', '衰退型'); }, color: '#6c757d', get desc() { return tLabel('GDP and GHG both decline', 'el PIB y los GEI caen', 'GDP 与温室气体同时下降'); } },
    DR: { get label() { return tLabel('Decoupling recessive', 'Recesivo con desacoplamiento', '衰退型脱钩'); }, color: '#606c38', get desc() { return tLabel('GDP falls, GHG falls faster', 'el PIB cae y los GEI caen más deprisa', 'GDP 下降，温室气体下降更快'); } },
    LB: { get label() { return tLabel('Land-based', 'De origen agrario', '土地驱动型'); }, color: '#a68a64', get desc() { return tLabel('Land-use change dominated', 'dominado por el cambio de uso del suelo', '以土地利用变化为主'); } },
    ND: { get label() { return tLabel('No data', 'Sin datos', '无数据'); }, color: '#dee2e6', desc: '' }
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

let _selectsWired = false;

export function initTapioView() {
    currentContainer = document.getElementById('analysis-chart-wrapper');
    // The two selects were read inside renderTapio() but nothing ever listened
    // to them, so changing them did nothing until some other state moved.
    // Wire them once (the nodes are static markup in explorer.html).
    if (!_selectsWired) {
        ['tapio-type-select', 'tapio-window-select'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => {
                if (currentContainer) renderTapio();
            });
        });
        _selectsWired = true;
    }
}

export function updateTapioView() {
    if (!currentContainer) return;
    renderTapio();
}

export function destroyTapioView() {
    if (currentContainer) {
        currentContainer.innerHTML = '';
        resetFacetContainer(currentContainer);
    }
}

function renderTapio() {
    const container = currentContainer;
    container.innerHTML = '';
    resetFacetContainer(container);

    const countries = State.get('selectedCountries');
    const yearRange = State.get('yearRange');
    const patField = document.getElementById('tapio-type-select')?.value || 'pat';
    const windowSize = parseInt(document.getElementById('tapio-window-select')?.value || '10');
    const currentYear = State.get('currentYear');

    // Update titles
    const titleEl = document.getElementById('analysis-title');
    const subtitleEl = document.getElementById('analysis-subtitle');
    const emType = patField === 'pat_ff'
        ? tLabel('fossil CO₂', 'CO₂ fósil', '化石 CO₂')
        : tLabel('GHG', 'GEI', '温室气体');
    if (titleEl) titleEl.textContent = `${tLabel('Tapio decoupling patterns', 'Patrones de desacoplamiento de Tapio', 'Tapio 脱钩模式')} \u2014 ${emType}`;
    if (subtitleEl) subtitleEl.textContent = `${windowSize}${tLabel('-year growth rates', ' años de tasa de crecimiento', ' 年增长率')} \u2014 ${tLabel('GDP per capita vs emissions', 'PIB per cápita frente a emisiones', '人均 GDP 对比排放')}`;

    if (countries.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">' + tLabel('Select countries to view Tapio decoupling patterns', 'Elige países para ver los patrones de desacoplamiento de Tapio', '请选择国家以查看 Tapio 脱钩模式') + '</div>';
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
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">' + tLabel('No data available for selected period', 'No hay datos para el periodo elegido', '所选时期暂无数据') + '</div>';
        return;
    }

    // One facet per country. The rows share the height of the scene instead of
    // standing on a constant 360 px cell, so a single country fills the area,
    // two take half of it each and six make a 3x2 that still fills it.
    const grid = createFacetGrid(container);

    // The legend joins the flex column before the grid measures itself, so its
    // strip is already discounted from the height the facets get.
    const legendDiv = createFacetLegend();
    const usedPatterns = new Set();
    validDataSets.forEach(ds => ds.points.forEach(p => { if (p.pat !== 'ND') usedPatterns.add(p.pat); }));
    const patOrder = ['AD', 'WD', 'CG', 'DG', 'RE', 'DR', 'LB'];
    patOrder.filter(code => usedPatterns.has(code)).forEach(code => {
        const meta = PATTERN_META[code];
        legendDiv.innerHTML += `<span style="display:flex;align-items:center;gap:5px;color:${COLORS.gray}">
            <span style="width:10px;height:10px;border-radius:50%;background:${meta.color};display:inline-block"></span>
            ${meta.label}
        </span>`;
    });
    container.appendChild(legendDiv);

    sizeFacetGrid(grid, validDataSets.length, { rowGap: 22, colGap: 20, minCell: 232 });
    const cells = appendFacetCells(grid, validDataSets.length);

    validDataSets.forEach((ds, i) => {
        renderSingleTapio(cells[i], ds, windowSize, currentYear, emType);
    });
}

function renderSingleTapio(container, ds, windowSize, currentYear, emType) {
    const rect = container.getBoundingClientRect();
    const width = Math.round(rect.width) || 350;
    const height = Math.round(rect.height) || 280;
    // Room for a 12 px axis label plus its title line under the plot.
    const margin = { top: 28, right: 20, bottom: 54, left: 64 };
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

    // Title: ink, with the series colour as the swatch in front of it (r2).
    facetTitle(svg, margin.left, 16, ds.name, ds.color, COLORS.dark);

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

    // Axes. Facet type stays at 12 px whatever the cell size, so when a facet
    // is narrow or short it is the number of ticks that comes down.
    const gx = g.append('g')
        .attr('transform', `translate(0,${h})`)
        .attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(facetTicks(w, 64, 3, 7)).tickFormat(d => d + '%'));

    const gy = g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(facetTicks(h, 48, 3, 6)).tickFormat(d => d + '%'));

    dropCornerTick(gx, gy);

    // Axis labels
    g.append('text')
        .attr('x', w / 2).attr('y', h + 42)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px').style('fill', COLORS.gray)
        .text(tLabel(`GDP pc growth (${windowSize}y, %)`,
                     `Crecimiento del PIB pc (${windowSize} años, %)`,
                     `人均 GDP 增长率（${windowSize} 年，%）`));

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -h / 2).attr('y', -46)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px').style('fill', COLORS.gray)
        .text(tLabel(`${emType} growth (${windowSize}y, %)`,
                     `Crecimiento de ${emType} (${windowSize} años, %)`,
                     `${emType} 增长率（${windowSize} 年，%）`));

    // Quadrant watermarks. They are corner labels, so they only earn their
    // place once the facet is wide enough for them not to meet the dots.
    if (w > 230) {
        // 11-IX (r2): they were painted in the quadrant's own tint (2.67:1 and
        // 2.49:1 on the cream). They are chrome, not marks, so they go to the
        // tertiary ink (--cl, 5.4:1) and keep their tint in a 9 px swatch.
        const qLabel = (x, y, anchor, color, text) => {
            g.append('rect')
                .attr('x', anchor === 'end' ? x - 9 : x).attr('y', y - 8)
                .attr('width', 9).attr('height', 9).attr('fill', color).attr('opacity', 0.85);
            g.append('text').attr('x', anchor === 'end' ? x - 14 : x + 14).attr('y', y)
                .attr('text-anchor', anchor)
                .style('font-size', '12px').style('fill', '#665a4e')
                .text(text);
        };
        qLabel(w - 4, 12, 'end', '#2a9d8f', tLabel('Absolute decoupling', 'Desacoplamiento absoluto', '绝对脱钩'));
        qLabel(4, h - 5, 'start', '#e76f51', tLabel('Divergent growth', 'Crecimiento divergente', '发散增长'));
    }

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
        .on('mouseleave', () => Tooltip.leave());

    // Label on current year point
    const curPt = points.find(d => d.year === currentYear);
    if (curPt) {
        // 11-IX (r2): the year used to be printed in the pattern's own colour
        // (#8ECAE6 read 1.44:1) and on top of its own marker. It steps off the
        // dot on a hairline leader and is set in the ink.
        const cx = xScale(curPt.gdpGrowth), cy = yScale(curPt.ghgGrowth);
        const up = cy > 26;
        const ly = up ? cy - 20 : cy + 24;
        g.append('line')
            .attr('x1', cx).attr('y1', up ? cy - 5 : cy + 5)
            .attr('x2', cx).attr('y2', up ? ly + 4 : ly - 10)
            .attr('stroke', COLORS.dark).attr('stroke-width', 1).attr('opacity', 0.5);
        g.append('text')
            .attr('x', cx).attr('y', ly)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('fill', COLORS.dark)
            .text(curPt.year);
    }
}
