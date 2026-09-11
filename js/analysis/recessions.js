// ============================================================================
// RECESSIONS - Emission reductions & Kaya decomposition
// View 1: Reductions — Green Growth vs Recessive (uses pre-computed cum_d/cum_r)
// View 2: Decomposition — Kaya identity (Pop × Income × Intensity)
// ============================================================================

import State from '../state.js?v=20260911b';
import DataLoader from '../data-loader.js?v=20260911b';
import Tooltip from '../components/tooltip.js?v=20260911b';
import {
    COLORS, getColorForIndex, formatEmissions, shortName,
    tLabel
} from '../utils.js?v=20260911b';
import {
    createFacetGrid, resetFacetContainer, sizeFacetGrid, appendFacetCells,
    createFacetLegend, facetTicks, facetTitle, dropCornerTick
} from './facet-grid.js?v=20260911b';

const GREEN_COLOR = '#2a9d8f';     // green growth (decoupling)
const RECESS_COLOR = '#495057';    // recessive (dark gray)
const POP_COLOR = '#e9c46a';       // population effect (yellow)
const INC_COLOR = '#264653';       // income effect (dark blue)
const INT_COLOR = '#2a9d8f';       // intensity effect (green)

let currentContainer = null;
let _view = 'reductions';     // 'reductions' | 'decomposition'
let _chartMode = 'annual';    // 'annual' | 'cumulative'
let _freeYAxis = true;

function formatEmissionTick(value) {
    if (value == null || !Number.isFinite(value)) return '';
    const sign = value < 0 ? '\u2212' : '';
    const abs = Math.abs(value);
    if (abs >= 1e3) return sign + d3.format('.3~s')(abs);
    if (abs >= 1) return sign + d3.format('.3~s')(abs);
    if (abs >= 0.01) return sign + d3.format('.2~f')(abs);
    if (abs === 0) return '0';
    return sign + d3.format('.2~g')(abs);
}

export function initRecessions() {
    currentContainer = document.getElementById('analysis-chart-wrapper');

    // View toggle
    const redBtn = document.getElementById('recession-view-reductions');
    const decBtn = document.getElementById('recession-view-decomposition');
    if (redBtn) redBtn.addEventListener('click', () => {
        _view = 'reductions';
        redBtn.classList.add('active');
        if (decBtn) decBtn.classList.remove('active');
        updateRecessions();
    });
    if (decBtn) decBtn.addEventListener('click', () => {
        _view = 'decomposition';
        decBtn.classList.add('active');
        if (redBtn) redBtn.classList.remove('active');
        updateRecessions();
    });

    // Chart mode toggle
    const annualBtn = document.getElementById('recession-chart-annual');
    const cumBtn = document.getElementById('recession-chart-cumulative');
    if (annualBtn) annualBtn.addEventListener('click', () => {
        _chartMode = 'annual';
        annualBtn.classList.add('active');
        if (cumBtn) cumBtn.classList.remove('active');
        updateRecessions();
    });
    if (cumBtn) cumBtn.addEventListener('click', () => {
        _chartMode = 'cumulative';
        cumBtn.classList.add('active');
        if (annualBtn) annualBtn.classList.remove('active');
        updateRecessions();
    });

    // Faceted Y-axis scale toggle
    _freeYAxis = State.get('recessionFreeYAxis');
    const yAxisGroup = document.getElementById('recession-yaxis-group');
    if (yAxisGroup) {
        yAxisGroup.querySelectorAll('[data-recession-yaxis]').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.recessionYaxis === 'free') === _freeYAxis);
            btn.onclick = () => {
                _freeYAxis = btn.dataset.recessionYaxis === 'free';
                yAxisGroup.querySelectorAll('[data-recession-yaxis]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.set('recessionFreeYAxis', _freeYAxis);
                updateRecessions();
            };
        });
    }
}

export function updateRecessions() {
    if (!currentContainer) return;
    if (_view === 'reductions') {
        renderReductions();
    } else {
        renderDecomposition();
    }
}

export function destroyRecessions() {
    if (currentContainer) {
        currentContainer.innerHTML = '';
        resetFacetContainer(currentContainer);
    }
}

// ============================================================================
// VIEW 1: REDUCTIONS — Green Growth vs Recessive (cum_d / cum_r)
// ============================================================================

function renderReductions() {
    const titleEl = document.getElementById('analysis-title');
    const subEl = document.getElementById('analysis-subtitle');
    if (titleEl) titleEl.textContent = tLabel('Emission Reductions: Green Growth vs Recessions', 'Reducciones de emisiones: crecimiento verde frente a recesiones', '减排：绿色增长与经济衰退');
    if (subEl) subEl.textContent = _chartMode === 'annual'
        ? tLabel('Annual reductions decomposed by economic context', 'Reducciones anuales descompuestas por contexto económico', '按经济背景分解的年度减排')
        : tLabel('Cumulative emission reductions over time', 'Reducciones acumuladas de emisiones a lo largo del tiempo', '累计减排随时间的变化');

    resetFacetContainer(currentContainer);
    const countries = State.get('selectedCountries');
    if (countries.length === 0) {
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">' + tLabel('Select countries to view emission reduction patterns', 'Elige países para ver las pautas de reducción de emisiones', '请选择国家以查看减排模式') + '</div>';
        return;
    }

    // Build data sets
    const dataSets = countries.map((iso3, idx) => {
        const raw = DataLoader.getCountryData(iso3);
        const meta = DataLoader.getMetadata(iso3);
        if (!raw) return null;

        const points = raw
            .filter(d => d.cum_d != null || d.cum_r != null)
            .map(d => ({
                year: d.y,
                cum_d: d.cum_d || 0,
                cum_r: d.cum_r || 0,
                ar6: d.ar6 || null,
                ghg: d.ghg
            }));

        if (points.length < 2) return null;

        // Compute annual deltas from cumulative values
        const annualPoints = [];
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            annualPoints.push({
                year: curr.year,
                delta_d: (curr.cum_d - prev.cum_d),
                delta_r: (curr.cum_r - prev.cum_r),
                cum_d: curr.cum_d,
                cum_r: curr.cum_r,
                ar6: curr.ar6,
                ghg: curr.ghg
            });
        }

        return {
            iso3,
            name: meta ? shortName(iso3, meta.name) : iso3,
            color: getColorForIndex(idx),
            points: annualPoints
        };
    }).filter(Boolean);

    if (dataSets.length === 0) {
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">' + tLabel('No reduction data available for selected countries', 'No hay datos de reducción para los países elegidos', '所选国家暂无减排数据') + '</div>';
        return;
    }

    currentContainer.innerHTML = '';

    if (dataSets.length === 1) {
        renderSingleReductions(currentContainer, dataSets[0]);
    } else {
        renderFacetedReductions(currentContainer, dataSets);
    }
}

function renderSingleReductions(container, ds) {
    const rect = container.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 480;
    const margin = { top: 28, right: 24, bottom: 40, left: 65 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const currentYear = State.get('currentYear');
    const yearRange = State.get('yearRange');
    const points = ds.points.filter(d => d.year >= yearRange[0] && d.year <= currentYear);
    if (points.length === 0) return;

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    svg.append('defs').append('clipPath').attr('id', 'recess-clip-single')
        .append('rect').attr('width', w).attr('height', h);

    svg.append('text')
        .attr('x', margin.left).attr('y', 16)
        .style('font-size', '13px').style('font-weight', '600').style('fill', COLORS.dark)
        .text(ds.name);

    if (_chartMode === 'annual') {
        renderAnnualBars(g, points, w, h, true);
    } else {
        renderCumulativeArea(g, points, w, h, true);
    }

    renderReductionsLegend(svg, margin, w);
}

function renderFacetedReductions(container, dataSets) {
    const currentYear = State.get('currentYear');
    const yearRange = State.get('yearRange');

    // A country with no point inside the window used to leave a hole in the
    // grid, so the facets are resolved BEFORE the rows are counted.
    const facets = dataSets
        .map(ds => ({ ds, points: ds.points.filter(d => d.year >= yearRange[0] && d.year <= currentYear) }))
        .filter(f => f.points.length > 0);
    if (facets.length === 0) return;

    const grid = createFacetGrid(container);

    // The legend joins the flex column first: whatever it takes is already
    // discounted when the grid measures itself.
    const legend = createFacetLegend();
    [{ label: tLabel('Green growth', 'Crecimiento verde', '绿色增长'), color: GREEN_COLOR }, { label: tLabel('Recessive', 'Recesivo', '衰退型'), color: RECESS_COLOR }].forEach(item => {
        legend.innerHTML += `<span style="display:flex;align-items:center;gap:6px;color:${COLORS.gray};text-transform:uppercase;letter-spacing:.12em">
            <span style="width:12px;height:12px;background:${item.color};display:inline-block"></span>
            ${item.label}</span>`;
    });
    container.appendChild(legend);

    sizeFacetGrid(grid, facets.length);
    const cells = appendFacetCells(grid, facets.length);

    let sharedYMax;
    if (!_freeYAxis) {
        let globalMax = 0;
        facets.forEach(f => {
            f.points.forEach(d => {
                const total = _chartMode === 'annual'
                    ? Math.abs(d.delta_d) + Math.abs(d.delta_r)
                    : Math.abs(d.cum_d) + Math.abs(d.cum_r);
                if (total > globalMax) globalMax = total;
            });
        });
        sharedYMax = globalMax * 1.08 || 10;
    }

    facets.forEach((f, idx) => {
        const cell = cells[idx];
        const cellRect = cell.getBoundingClientRect();
        const width = Math.round(cellRect.width) || 350;
        const height = Math.round(cellRect.height) || 260;
        const margin = { top: 26, right: 14, bottom: 38, left: 66 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        if (w <= 0 || h <= 0) return;

        const svg = d3.select(cell).append('svg')
            .attr('width', width).attr('height', height);
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        svg.append('defs').append('clipPath').attr('id', `recess-clip-${idx}`)
            .append('rect').attr('width', w).attr('height', h);

        facetTitle(svg, margin.left, 15, f.ds.name, f.ds.color, COLORS.dark);

        if (_chartMode === 'annual') {
            renderAnnualBars(g, f.points, w, h, false, sharedYMax);
        } else {
            renderCumulativeArea(g, f.points, w, h, false, sharedYMax);
        }
    });
}

// ---- Annual stacked bars ----

function renderAnnualBars(g, points, w, h, isSingle, sharedYMax) {
    const yearExtent = d3.extent(points, d => d.year);
    const xScale = d3.scaleLinear().domain(yearExtent).range([0, w]);

    let yMax;
    if (sharedYMax != null) {
        yMax = sharedYMax;
    } else {
        yMax = d3.max(points, d => Math.abs(d.delta_d) + Math.abs(d.delta_r)) || 10;
        yMax *= 1.08;
    }
    const yScale = d3.scaleLinear().domain([0, yMax]).range([h, 0]).nice();

    // Facet type stays at 12 px whatever the cell size, so it is the number of
    // ticks that gives way when a facet is narrow or short.
    const xTicks = facetTicks(w, isSingle ? 78 : 88, 3, isSingle ? 11 : 7);
    const yTicks = facetTicks(h, 48, 3, isSingle ? 7 : 5);

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(yTicks)).join('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
        .attr('stroke', '#eee').attr('stroke-width', 0.5);

    const nYears = yearExtent[1] - yearExtent[0] + 1;
    const barW = Math.max(1, Math.min(12, (w / nYears) * 0.75));
    const clipG = g.append('g').attr('clip-path', isSingle ? 'url(#recess-clip-single)' : null);

    points.forEach(d => {
        const x = xScale(d.year) - barW / 2;
        const absD = Math.abs(d.delta_d);
        const absR = Math.abs(d.delta_r);

        if (absR > 0) {
            clipG.append('rect').attr('x', x).attr('width', barW)
                .attr('y', yScale(absR)).attr('height', yScale(0) - yScale(absR))
                .attr('fill', RECESS_COLOR).attr('opacity', 0.85);
        }
        if (absD > 0) {
            clipG.append('rect').attr('x', x).attr('width', barW)
                .attr('y', yScale(absR + absD)).attr('height', yScale(absR) - yScale(absR + absD))
                .attr('fill', GREEN_COLOR).attr('opacity', 0.85);
        }
    });

    // Axes
    const gxAxis = g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(xTicks).tickFormat(d3.format('d')));
    const gyAxis = g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(yTicks).tickFormat(formatEmissionTick));
    dropCornerTick(gxAxis, gyAxis);

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '12px').style('fill', COLORS.uiText)
            .text(tLabel('Annual emission reduction (Mt CO\u2082e)',
                         'Reducción anual de emisiones (Mt CO\u2082e)',
                         '年度减排量（Mt CO\u2082e）'));
        addHoverAnnual(g, points, xScale, yScale, w, h);
    }

    addYearMarker(g, xScale, h, isSingle);
}

// ---- Cumulative stacked area ----

function renderCumulativeArea(g, points, w, h, isSingle, sharedYMax) {
    const yearExtent = d3.extent(points, d => d.year);
    const xScale = d3.scaleLinear().domain(yearExtent).range([0, w]);

    let yMax;
    if (sharedYMax != null) {
        yMax = sharedYMax;
    } else {
        yMax = d3.max(points, d => Math.abs(d.cum_d) + Math.abs(d.cum_r)) || 10;
        yMax *= 1.08;
    }
    const yScale = d3.scaleLinear().domain([0, yMax]).range([h, 0]).nice();

    const xTicks = facetTicks(w, isSingle ? 78 : 88, 3, isSingle ? 11 : 7);
    const yTicks = facetTicks(h, 48, 3, isSingle ? 7 : 5);

    g.selectAll('.grid-h').data(yScale.ticks(yTicks)).join('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
        .attr('stroke', '#eee').attr('stroke-width', 0.5);

    const clipG = g.append('g').attr('clip-path', isSingle ? 'url(#recess-clip-single)' : null);

    const areaR = d3.area().x(d => xScale(d.year)).y0(h)
        .y1(d => yScale(Math.abs(d.cum_r))).curve(d3.curveMonotoneX);
    const areaTotal = d3.area().x(d => xScale(d.year))
        .y0(d => yScale(Math.abs(d.cum_r)))
        .y1(d => yScale(Math.abs(d.cum_d) + Math.abs(d.cum_r)))
        .curve(d3.curveMonotoneX);

    clipG.append('path').datum(points).attr('d', areaR)
        .attr('fill', RECESS_COLOR).attr('opacity', 0.7);
    clipG.append('path').datum(points).attr('d', areaTotal)
        .attr('fill', GREEN_COLOR).attr('opacity', 0.7);

    const lineTotal = d3.line().x(d => xScale(d.year))
        .y(d => yScale(Math.abs(d.cum_d) + Math.abs(d.cum_r)))
        .curve(d3.curveMonotoneX);
    clipG.append('path').datum(points).attr('d', lineTotal)
        .attr('fill', 'none').attr('stroke', COLORS.dark)
        .attr('stroke-width', 0.8).attr('opacity', 0.5);

    // End labels
    const last = points[points.length - 1];
    if (last && isSingle) {
        const xEnd = xScale(last.year);
        g.append('text').attr('x', xEnd + 4)
            .attr('y', yScale(Math.abs(last.cum_r) + Math.abs(last.cum_d) / 2))
            .attr('font-size', 12).attr('fill', GREEN_COLOR).attr('dy', '0.35em')
            .text(formatEmissions(Math.abs(last.cum_d)));
        g.append('text').attr('x', xEnd + 4)
            .attr('y', yScale(Math.abs(last.cum_r) / 2))
            .attr('font-size', 12).attr('fill', RECESS_COLOR).attr('dy', '0.35em')
            .text(formatEmissions(Math.abs(last.cum_r)));
    }

    const gxAxis = g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(xTicks).tickFormat(d3.format('d')));
    const gyAxis = g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(yTicks).tickFormat(formatEmissionTick));
    dropCornerTick(gxAxis, gyAxis);

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '12px').style('fill', COLORS.uiText)
            .text(tLabel('Cumulative emission reductions (Mt CO\u2082e)',
                         'Reducciones acumuladas de emisiones (Mt CO\u2082e)',
                         '累计减排量（Mt CO\u2082e）'));
        addHoverCumulative(g, points, xScale, yScale, w, h);
    }

    addYearMarker(g, xScale, h, isSingle);
}

// ============================================================================
// VIEW 2: DECOMPOSITION — Kaya identity (Pop × Income × Intensity)
// ============================================================================

function buildKayaDecomposition(iso3) {
    const raw = DataLoader.getCountryData(iso3);
    if (!raw || raw.length < 2) return null;
    const meta = DataLoader.getMetadata(iso3);

    const results = [];
    for (let i = 1; i < raw.length; i++) {
        const prev = raw[i - 1];
        const curr = raw[i];
        if (!prev.ghg || !curr.ghg || !prev.gdp_pc || !curr.gdp_pc || !prev.pop || !curr.pop) continue;
        if (prev.gdp_pc === 0 || prev.pop === 0) continue;

        const ghgChange = curr.ghg - prev.ghg;
        const gdpTotal_prev = prev.gdp_pc * prev.pop;
        const gdpTotal_curr = curr.gdp_pc * curr.pop;
        if (gdpTotal_prev === 0) continue;

        const intensity_prev = prev.ghg / gdpTotal_prev;
        const intensity_curr = curr.ghg / gdpTotal_curr;

        // LMDI additive decomposition (simplified):
        // dGHG ≈ dPop_effect + dIncome_effect + dIntensity_effect
        const avgIntensity = (intensity_prev + intensity_curr) / 2;
        const avgGdpPc = (prev.gdp_pc + curr.gdp_pc) / 2;
        const avgPop = (prev.pop + curr.pop) / 2;

        const popEffect = (curr.pop - prev.pop) * avgIntensity * avgGdpPc;
        const incEffect = (curr.gdp_pc - prev.gdp_pc) * avgIntensity * avgPop;
        const intEffect = (intensity_curr - intensity_prev) * avgGdpPc * avgPop;

        results.push({
            year: curr.y,
            ghgChange,
            popEffect,
            incEffect,
            intEffect,
            isRecession: curr.gdp_pc < prev.gdp_pc,
            ghg: curr.ghg,
            gdp_pc: curr.gdp_pc
        });
    }

    return {
        iso3,
        name: meta ? shortName(iso3, meta.name) : iso3,
        data: results
    };
}

function renderDecomposition() {
    const titleEl = document.getElementById('analysis-title');
    const subEl = document.getElementById('analysis-subtitle');
    if (titleEl) titleEl.textContent = tLabel('Kaya Decomposition', 'Descomposición de Kaya', 'Kaya 分解');
    if (subEl) subEl.textContent = _chartMode === 'annual'
        ? tLabel('Annual GHG change decomposed: Population \u00d7 Income \u00d7 Intensity',
            'Cambio anual de GEI descompuesto: población \u00d7 renta \u00d7 intensidad',
            '年度温室气体变化的分解：人口 \u00d7 收入 \u00d7 强度')
        : tLabel('Cumulative Kaya factors over time', 'Factores de Kaya acumulados a lo largo del tiempo', '累计 Kaya 因子随时间的变化');

    resetFacetContainer(currentContainer);
    const countries = State.get('selectedCountries');
    if (countries.length === 0) {
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">' + tLabel('Select countries to view Kaya decomposition', 'Elige países para ver la descomposición de Kaya', '请选择国家以查看 Kaya 分解') + '</div>';
        return;
    }

    const dataSets = countries.map((iso3, idx) => {
        const kaya = buildKayaDecomposition(iso3);
        if (!kaya || kaya.data.length < 2) return null;
        return { ...kaya, color: getColorForIndex(idx) };
    }).filter(Boolean);

    if (dataSets.length === 0) {
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">' + tLabel('No data available for decomposition', 'No hay datos para la descomposición', '暂无可用于分解的数据') + '</div>';
        return;
    }

    currentContainer.innerHTML = '';

    if (dataSets.length === 1) {
        renderSingleDecomposition(currentContainer, dataSets[0]);
    } else {
        renderFacetedDecomposition(currentContainer, dataSets);
    }
}

function renderSingleDecomposition(container, ds) {
    const rect = container.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 480;
    const margin = { top: 28, right: 24, bottom: 40, left: 65 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const currentYear = State.get('currentYear');
    const yearRange = State.get('yearRange');
    const data = ds.data.filter(d => d.year >= yearRange[0] && d.year <= currentYear);
    if (data.length === 0) return;

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    svg.append('defs').append('clipPath').attr('id', 'kaya-clip-single')
        .append('rect').attr('width', w).attr('height', h);

    svg.append('text').attr('x', margin.left).attr('y', 16)
        .style('font-size', '13px').style('font-weight', '600').style('fill', COLORS.dark)
        .text(ds.name);

    if (_chartMode === 'annual') {
        renderKayaAnnual(g, data, w, h, true);
    } else {
        renderKayaCumulative(g, data, w, h, true);
    }

    renderKayaLegend(svg, margin, w);
}

function renderFacetedDecomposition(container, dataSets) {
    const currentYear = State.get('currentYear');
    const yearRange = State.get('yearRange');

    const facets = dataSets
        .map(ds => ({ ds, data: ds.data.filter(d => d.year >= yearRange[0] && d.year <= currentYear) }))
        .filter(f => f.data.length > 0);
    if (facets.length === 0) return;

    const grid = createFacetGrid(container);

    const legend = createFacetLegend();
    [
        { label: tLabel('Population', 'Población', '人口'), color: POP_COLOR },
        { label: tLabel('Income', 'Renta', '收入'), color: INC_COLOR },
        { label: tLabel('Intensity', 'Intensidad', '强度'), color: INT_COLOR }
    ].forEach(item => {
        legend.innerHTML += `<span style="display:flex;align-items:center;gap:6px;color:${COLORS.gray};text-transform:uppercase;letter-spacing:.12em">
            <span style="width:12px;height:12px;background:${item.color};display:inline-block"></span>
            ${item.label}</span>`;
    });
    container.appendChild(legend);

    sizeFacetGrid(grid, facets.length);
    const cells = appendFacetCells(grid, facets.length);

    let sharedMaxAbs;
    if (!_freeYAxis) {
        const allVals = [];
        facets.forEach(f => {
            if (_chartMode === 'annual') {
                f.data.forEach(d => allVals.push(d.popEffect, d.incEffect, d.intEffect, d.ghgChange));
            } else {
                let cumPop = 0, cumInc = 0, cumInt = 0, cumTotal = 0;
                f.data.forEach(d => {
                    cumPop += d.popEffect;
                    cumInc += d.incEffect;
                    cumInt += d.intEffect;
                    cumTotal += d.ghgChange;
                    allVals.push(cumPop, cumInc, cumInt, cumPop + cumInc, cumTotal);
                });
            }
        });
        sharedMaxAbs = (d3.max(allVals.map(Math.abs)) || 10) * 1.15;
    }

    facets.forEach((f, idx) => {
        const cell = cells[idx];
        const cellRect = cell.getBoundingClientRect();
        const width = Math.round(cellRect.width) || 350;
        const height = Math.round(cellRect.height) || 260;
        const margin = { top: 26, right: 14, bottom: 38, left: 66 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        if (w <= 0 || h <= 0) return;

        const svg = d3.select(cell).append('svg')
            .attr('width', width).attr('height', height);
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        facetTitle(svg, margin.left, 15, f.ds.name, f.ds.color, COLORS.dark);

        if (_chartMode === 'annual') {
            renderKayaAnnual(g, f.data, w, h, false, sharedMaxAbs);
        } else {
            renderKayaCumulative(g, f.data, w, h, false, sharedMaxAbs);
        }
    });
}

// ---- Kaya annual bars (stacked positive/negative) ----

function renderKayaAnnual(g, data, w, h, isSingle, sharedMaxAbs) {
    const yearExtent = d3.extent(data, d => d.year);
    const xScale = d3.scaleLinear().domain(yearExtent).range([0, w]);

    const allVals = data.flatMap(d => [d.popEffect, d.incEffect, d.intEffect, d.ghgChange]);
    const maxAbs = sharedMaxAbs || d3.max(allVals.map(Math.abs)) * 1.15 || 10;
    const yScale = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([h, 0]).nice();

    const xTicks = facetTicks(w, isSingle ? 78 : 88, 3, isSingle ? 11 : 7);
    const yTicks = facetTicks(h, 48, 3, isSingle ? 7 : 5);

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(yTicks)).join('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
        .attr('stroke', '#eee').attr('stroke-width', 0.5);

    // Zero line
    g.append('line').attr('x1', 0).attr('x2', w)
        .attr('y1', yScale(0)).attr('y2', yScale(0))
        .attr('stroke', COLORS.gray).attr('stroke-width', 0.5);

    const nYears = yearExtent[1] - yearExtent[0] + 1;
    const barW = Math.max(1, Math.min(8, (w / nYears) * 0.7));

    // For each year: stacked bars for 3 Kaya factors
    const factors = [
        { key: 'popEffect', color: POP_COLOR },
        { key: 'incEffect', color: INC_COLOR },
        { key: 'intEffect', color: INT_COLOR }
    ];

    data.forEach(d => {
        const x = xScale(d.year);
        let posStack = 0;
        let negStack = 0;

        factors.forEach(f => {
            const val = d[f.key];
            if (val >= 0) {
                g.append('rect')
                    .attr('x', x - barW / 2).attr('width', barW)
                    .attr('y', yScale(posStack + val))
                    .attr('height', yScale(posStack) - yScale(posStack + val))
                    .attr('fill', f.color).attr('opacity', 0.8);
                posStack += val;
            } else {
                g.append('rect')
                    .attr('x', x - barW / 2).attr('width', barW)
                    .attr('y', yScale(negStack))
                    .attr('height', yScale(negStack + val) - yScale(negStack))
                    .attr('fill', f.color).attr('opacity', 0.8);
                negStack += val;
            }
        });
    });

    // Total GHG change line
    const line = d3.line().x(d => xScale(d.year)).y(d => yScale(d.ghgChange))
        .defined(d => d.ghgChange != null).curve(d3.curveMonotoneX);
    g.append('path').datum(data).attr('d', line)
        .attr('fill', 'none').attr('stroke', COLORS.dark)
        .attr('stroke-width', 1.5).attr('opacity', 0.6);

    // Axes
    const gxAxis = g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(xTicks).tickFormat(d3.format('d')));
    const gyAxis = g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(yTicks).tickFormat(formatEmissionTick));
    dropCornerTick(gxAxis, gyAxis);

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '12px').style('fill', COLORS.uiText)
            .text(tLabel('GHG change by Kaya factor (Mt CO\u2082e)',
                         'Cambio de GEI por factor de Kaya (Mt CO\u2082e)',
                         '按卡亚因子分解的温室气体变化（Mt CO\u2082e）'));

        // Hover
        addHoverKaya(g, data, xScale, yScale, w, h);
    }

    addYearMarker(g, xScale, h, isSingle);
}

// ---- Kaya cumulative area ----

function renderKayaCumulative(g, data, w, h, isSingle, sharedMaxAbs) {
    const yearExtent = d3.extent(data, d => d.year);
    const xScale = d3.scaleLinear().domain(yearExtent).range([0, w]);

    // Compute cumulative sums
    let cumPop = 0, cumInc = 0, cumInt = 0, cumTotal = 0;
    const cumData = data.map(d => {
        cumPop += d.popEffect;
        cumInc += d.incEffect;
        cumInt += d.intEffect;
        cumTotal += d.ghgChange;
        return { year: d.year, cumPop, cumInc, cumInt, cumTotal };
    });

    const allVals = cumData.flatMap(d => [d.cumPop, d.cumInc, d.cumInt, d.cumPop + d.cumInc, d.cumTotal]);
    const maxAbs = sharedMaxAbs || d3.max(allVals.map(Math.abs)) * 1.15 || 10;
    const yScale = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([h, 0]).nice();

    const xTicks = facetTicks(w, isSingle ? 78 : 88, 3, isSingle ? 11 : 7);
    const yTicks = facetTicks(h, 48, 3, isSingle ? 7 : 5);

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(yTicks)).join('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
        .attr('stroke', '#eee').attr('stroke-width', 0.5);

    // Zero line
    g.append('line').attr('x1', 0).attr('x2', w)
        .attr('y1', yScale(0)).attr('y2', yScale(0))
        .attr('stroke', COLORS.gray).attr('stroke-width', 0.5);

    // Factor lines
    const factors = [
        { key: 'cumPop', color: POP_COLOR, label: tLabel('Population', 'Población', '人口') },
        { key: 'cumInc', color: INC_COLOR, label: tLabel('Income', 'Renta', '收入') },
        { key: 'cumInt', color: INT_COLOR, label: tLabel('Intensity', 'Intensidad', '强度') }
    ];

    factors.forEach(f => {
        const line = d3.line().x(d => xScale(d.year)).y(d => yScale(d[f.key]))
            .curve(d3.curveMonotoneX);
        g.append('path').datum(cumData).attr('d', line)
            .attr('fill', 'none').attr('stroke', f.color)
            .attr('stroke-width', 2).attr('opacity', 0.85);

        // End label
        const last = cumData[cumData.length - 1];
        if (last && isSingle) {
            g.append('text')
                .attr('x', xScale(last.year) + 4)
                .attr('y', yScale(last[f.key]))
                .attr('dy', '0.35em').attr('font-size', 12).attr('fill', f.color)
                .text(f.label);
        }
    });

    // Total line (dashed)
    const totalLine = d3.line().x(d => xScale(d.year)).y(d => yScale(d.cumTotal))
        .curve(d3.curveMonotoneX);
    g.append('path').datum(cumData).attr('d', totalLine)
        .attr('fill', 'none').attr('stroke', COLORS.dark)
        .attr('stroke-width', 1.5).attr('stroke-dasharray', '4,3').attr('opacity', 0.6);

    // Axes
    const gxAxis = g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(xTicks).tickFormat(d3.format('d')));
    const gyAxis = g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(yTicks).tickFormat(formatEmissionTick));
    dropCornerTick(gxAxis, gyAxis);

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '12px').style('fill', COLORS.uiText)
            .text(tLabel('Cumulative Kaya factor contribution (Mt CO\u2082e)',
                         'Contribución acumulada por factor de Kaya (Mt CO\u2082e)',
                         '各卡亚因子的累计贡献（Mt CO\u2082e）'));
    }

    addYearMarker(g, xScale, h, isSingle);
}

// ============================================================================
// Shared helpers
// ============================================================================

function addYearMarker(g, xScale, h, isSingle) {
    const year = State.get('currentYear');
    const [, maxY] = State.get('yearRange');
    if (year >= maxY) return;
    const x = xScale(year);
    if (x < 0 || x > xScale.range()[1]) return;

    g.append('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.dark).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3').attr('opacity', 0.4);

    if (isSingle) {
        g.append('text').attr('x', x).attr('y', -4)
            .attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 600)
            .attr('fill', COLORS.dark).text(year);
    }
}

function addHoverAnnual(g, points, xScale, yScale, w, h) {
    const hoverG = g.append('g').style('display', 'none');
    hoverG.append('line').attr('class', 'hover-line').attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.dark).attr('stroke-width', 1).attr('stroke-dasharray', '2,2').attr('opacity', 0.6);

    g.append('rect').attr('width', w).attr('height', h).attr('fill', 'none').attr('pointer-events', 'all')
        .on('mousemove', function (event) {
            const mx = d3.pointer(event)[0];
            const year = Math.round(xScale.invert(mx));
            const entry = points.find(d => d.year === year);
            if (!entry) { hoverG.style('display', 'none'); Tooltip.hide(); return; }

            hoverG.style('display', null);
            const x = xScale(year);
            hoverG.select('.hover-line').attr('x1', x).attr('x2', x);

            const total = Math.abs(entry.delta_d) + Math.abs(entry.delta_r);
            Tooltip.show([
                `<div class="tooltip-title"><span>${year}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${GREEN_COLOR}">${tLabel('Green growth', 'Crecimiento verde', '绿色增长')}</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.delta_d))}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${RECESS_COLOR}">${tLabel('Recessive', 'Recesivo', '衰退型')}</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.delta_r))}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label"><strong>${tLabel('Total', 'Total', '合计')}</strong></span><span class="tooltip-value"><strong>${formatEmissions(total)}</strong></span></div>`,
                entry.ar6 != null ? `<div class="tooltip-row"><span class="tooltip-label">AR6</span><span class="tooltip-value">${entry.ar6}</span></div>` : ''
            ].join(''), event);
        })
        .on('mouseleave', function () {
            if (Tooltip.isPinned()) return;        // tap-anchored card keeps its crosshair
            hoverG.style('display', 'none'); Tooltip.leave();
        });
}

function addHoverCumulative(g, points, xScale, yScale, w, h) {
    const hoverG = g.append('g').style('display', 'none');
    hoverG.append('line').attr('class', 'hover-line').attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.dark).attr('stroke-width', 1).attr('stroke-dasharray', '2,2').attr('opacity', 0.6);
    const dotTotal = hoverG.append('circle').attr('r', 3.5)
        .attr('fill', COLORS.dark).attr('stroke', '#fff').attr('stroke-width', 1);

    g.append('rect').attr('width', w).attr('height', h).attr('fill', 'none').attr('pointer-events', 'all')
        .on('mousemove', function (event) {
            const mx = d3.pointer(event)[0];
            const year = Math.round(xScale.invert(mx));
            const entry = points.find(d => d.year === year);
            if (!entry) { hoverG.style('display', 'none'); Tooltip.hide(); return; }

            hoverG.style('display', null);
            const x = xScale(year);
            hoverG.select('.hover-line').attr('x1', x).attr('x2', x);

            const totalCum = Math.abs(entry.cum_d) + Math.abs(entry.cum_r);
            dotTotal.attr('cx', x).attr('cy', yScale(totalCum));

            const pctD = totalCum > 0 ? (Math.abs(entry.cum_d) / totalCum * 100).toFixed(0) : 0;
            const pctR = totalCum > 0 ? (Math.abs(entry.cum_r) / totalCum * 100).toFixed(0) : 0;

            Tooltip.show([
                `<div class="tooltip-title"><span>${year}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${GREEN_COLOR}">${tLabel('Green growth', 'Crecimiento verde', '绿色增长')}</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.cum_d))} (${pctD}%)</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${RECESS_COLOR}">${tLabel('Recessive', 'Recesivo', '衰退型')}</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.cum_r))} (${pctR}%)</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label"><strong>${tLabel('Total', 'Total', '合计')}</strong></span><span class="tooltip-value"><strong>${formatEmissions(totalCum)}</strong></span></div>`
            ].join(''), event);
        })
        .on('mouseleave', function () {
            if (Tooltip.isPinned()) return;        // tap-anchored card keeps its crosshair
            hoverG.style('display', 'none'); Tooltip.leave();
        });
}

function addHoverKaya(g, data, xScale, yScale, w, h) {
    const hoverG = g.append('g').style('display', 'none');
    hoverG.append('line').attr('class', 'hover-line').attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.dark).attr('stroke-width', 1).attr('stroke-dasharray', '2,2').attr('opacity', 0.6);

    g.append('rect').attr('width', w).attr('height', h).attr('fill', 'none').attr('pointer-events', 'all')
        .on('mousemove', function (event) {
            const mx = d3.pointer(event)[0];
            const year = Math.round(xScale.invert(mx));
            const entry = data.find(d => d.year === year);
            if (!entry) { hoverG.style('display', 'none'); Tooltip.hide(); return; }

            hoverG.style('display', null);
            const x = xScale(year);
            hoverG.select('.hover-line').attr('x1', x).attr('x2', x);

            Tooltip.show([
                `<div class="tooltip-title"><span>${year}${entry.isRecession ? ' (recession)' : ''}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${POP_COLOR}">${tLabel('Population', 'Población', '人口')}</span><span class="tooltip-value">${formatEmissions(entry.popEffect)}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${INC_COLOR}">${tLabel('Income', 'Renta', '收入')}</span><span class="tooltip-value">${formatEmissions(entry.incEffect)}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${INT_COLOR}">${tLabel('Intensity', 'Intensidad', '强度')}</span><span class="tooltip-value">${formatEmissions(entry.intEffect)}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label"><strong>${tLabel('Total GHG', 'GEI total', '温室气体总量')}</strong></span><span class="tooltip-value"><strong>${formatEmissions(entry.ghgChange)}</strong></span></div>`
            ].join(''), event);
        })
        .on('mouseleave', function () {
            if (Tooltip.isPinned()) return;        // tap-anchored card keeps its crosshair
            hoverG.style('display', 'none'); Tooltip.leave();
        });
}

/**
 * The legend of the single-country charts, laid out with the type's REAL
 * widths (11-IX, r2). It used to advance by `label.length * 6.5`, which is
 * blind both to the uppercase + 0.12 em tracking it then applies and to
 * Chinese glyphs, so "GREEN GROWTH" ran 5.4 px into "RECESSIVE" in every
 * language and at every width. Each row is measured with
 * getComputedTextLength() and the strip is centred once it is built.
 */
function renderInSvgLegend(svg, margin, w, items) {
    const legend = svg.append('g');
    let xOff = 0;
    items.forEach(item => {
        const row = legend.append('g').attr('transform', `translate(${xOff},0)`);
        row.append('rect').attr('width', 10).attr('height', 10).attr('y', -8)
            .attr('fill', item.color).attr('opacity', 0.85);
        const t = row.append('text').attr('x', 14).attr('y', 0).attr('font-size', 12).attr('fill', COLORS.gray)
            .style('text-transform', 'uppercase').style('letter-spacing', '0.12em').text(item.label);
        let tw;
        try { tw = t.node().getComputedTextLength(); } catch (e) { tw = 0; }
        if (!(tw > 0)) tw = String(item.label).length * 8;
        xOff += 14 + Math.ceil(tw) + 24;
    });
    const total = Math.max(0, xOff - 24);
    legend.attr('transform',
        `translate(${Math.round(Math.max(margin.left, margin.left + w / 2 - total / 2))},${margin.top - 14})`);
}

function renderReductionsLegend(svg, margin, w) {
    renderInSvgLegend(svg, margin, w, [
        { label: tLabel('Green growth', 'Crecimiento verde', '绿色增长'), color: GREEN_COLOR },
        { label: tLabel('Recessive', 'Recesivo', '衰退型'), color: RECESS_COLOR }
    ]);
}

function renderKayaLegend(svg, margin, w) {
    renderInSvgLegend(svg, margin, w, [
        { label: tLabel('Population', 'Población', '人口'), color: POP_COLOR },
        { label: tLabel('Income', 'Renta', '收入'), color: INC_COLOR },
        { label: tLabel('Intensity', 'Intensidad', '强度'), color: INT_COLOR }
    ]);
}
