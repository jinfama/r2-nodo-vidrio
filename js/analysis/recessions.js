// ============================================================================
// RECESSIONS - Emission reductions & Kaya decomposition
// View 1: Reductions — Green Growth vs Recessive (uses pre-computed cum_d/cum_r)
// View 2: Decomposition — Kaya identity (Pop × Income × Intensity)
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import Tooltip from '../components/tooltip.js';
import {
    COLORS, getColorForIndex, formatEmissions, shortName
} from '../utils.js';

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

function facetLayout(container, count) {
    const width = container.clientWidth || container.getBoundingClientRect().width || 1000;
    const cols = count === 1 ? 1
        : width < 900 ? 1
        : width < 1450 ? 2
        : Math.min(3, count);
    const height = width < 900 ? 280 : 260;
    return { cols, height };
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
    if (currentContainer) currentContainer.innerHTML = '';
}

// ============================================================================
// VIEW 1: REDUCTIONS — Green Growth vs Recessive (cum_d / cum_r)
// ============================================================================

function renderReductions() {
    const titleEl = document.getElementById('analysis-title');
    const subEl = document.getElementById('analysis-subtitle');
    if (titleEl) titleEl.textContent = 'Emission Reductions: Green Growth vs Recessions';
    if (subEl) subEl.textContent = _chartMode === 'annual'
        ? 'Annual reductions decomposed by economic context'
        : 'Cumulative emission reductions over time';

    const countries = State.get('selectedCountries');
    if (countries.length === 0) {
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view emission reduction patterns</div>';
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
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">No reduction data available for selected countries</div>';
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
    const { cols, height: cellHeight } = facetLayout(container, dataSets.length);
    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));grid-auto-rows:minmax(${cellHeight}px,auto);gap:24px 18px;width:100%;height:100%;padding:10px;overflow:auto;align-content:start`;
    container.appendChild(gridDiv);

    const currentYear = State.get('currentYear');
    const yearRange = State.get('yearRange');

    let sharedYMax;
    if (!_freeYAxis) {
        let globalMax = 0;
        dataSets.forEach(ds => {
            ds.points.filter(d => d.year >= yearRange[0] && d.year <= currentYear).forEach(d => {
                const total = _chartMode === 'annual'
                    ? Math.abs(d.delta_d) + Math.abs(d.delta_r)
                    : Math.abs(d.cum_d) + Math.abs(d.cum_r);
                if (total > globalMax) globalMax = total;
            });
        });
        sharedYMax = globalMax * 1.08 || 10;
    }

    dataSets.forEach((ds, idx) => {
        const points = ds.points.filter(d => d.year >= yearRange[0] && d.year <= currentYear);
        if (points.length === 0) return;

        const cell = document.createElement('div');
        cell.style.cssText = `position:relative;min-height:${cellHeight}px;overflow:hidden`;
        gridDiv.appendChild(cell);

        const cellRect = cell.getBoundingClientRect();
        const width = cellRect.width || 350;
        const height = cellRect.height || cellHeight;
        const margin = { top: 24, right: 12, bottom: 34, left: 62 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        if (w <= 0 || h <= 0) return;

        const svg = d3.select(cell).append('svg')
            .attr('width', width).attr('height', height);
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        svg.append('defs').append('clipPath').attr('id', `recess-clip-${idx}`)
            .append('rect').attr('width', w).attr('height', h);

        svg.append('text')
            .attr('x', margin.left).attr('y', 14)
            .style('font-size', '11px').style('font-weight', '600').style('fill', ds.color)
            .text(ds.name);

        if (_chartMode === 'annual') {
            renderAnnualBars(g, points, w, h, false, sharedYMax);
        } else {
            renderCumulativeArea(g, points, w, h, false, sharedYMax);
        }
    });

    // Shared legend
    const legendDiv = document.createElement('div');
    legendDiv.style.cssText = 'display:flex;gap:20px;padding:8px 12px;justify-content:center;flex-shrink:0';
    [{ label: 'Green growth', color: GREEN_COLOR }, { label: 'Recessive', color: RECESS_COLOR }].forEach(item => {
        legendDiv.innerHTML += `<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:${COLORS.gray};text-transform:uppercase;letter-spacing:.3px">
            <span style="width:12px;height:12px;background:${item.color};display:inline-block"></span>
            ${item.label}</span>`;
    });
    container.appendChild(legendDiv);
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

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(isSingle ? 5 : 4)).join('line')
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
    g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(isSingle ? 10 : 5).tickFormat(d3.format('d')));
    g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(isSingle ? 6 : 4).tickFormat(formatEmissionTick));

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '10px').style('fill', COLORS.lightGray)
            .text('Annual emission reduction (Mt CO\u2082e)');
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

    g.selectAll('.grid-h').data(yScale.ticks(isSingle ? 5 : 4)).join('line')
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
            .attr('font-size', 9).attr('fill', GREEN_COLOR).attr('dy', '0.35em')
            .text(formatEmissions(Math.abs(last.cum_d)));
        g.append('text').attr('x', xEnd + 4)
            .attr('y', yScale(Math.abs(last.cum_r) / 2))
            .attr('font-size', 9).attr('fill', RECESS_COLOR).attr('dy', '0.35em')
            .text(formatEmissions(Math.abs(last.cum_r)));
    }

    g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(isSingle ? 10 : 5).tickFormat(d3.format('d')));
    g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(isSingle ? 6 : 4).tickFormat(formatEmissionTick));

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '10px').style('fill', COLORS.lightGray)
            .text('Cumulative emission reductions (Mt CO\u2082e)');
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
    if (titleEl) titleEl.textContent = 'Kaya Decomposition';
    if (subEl) subEl.textContent = _chartMode === 'annual'
        ? 'Annual GHG change decomposed: Population \u00d7 Income \u00d7 Intensity'
        : 'Cumulative Kaya factors over time';

    const countries = State.get('selectedCountries');
    if (countries.length === 0) {
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries to view Kaya decomposition</div>';
        return;
    }

    const dataSets = countries.map((iso3, idx) => {
        const kaya = buildKayaDecomposition(iso3);
        if (!kaya || kaya.data.length < 2) return null;
        return { ...kaya, color: getColorForIndex(idx) };
    }).filter(Boolean);

    if (dataSets.length === 0) {
        currentContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">No data available for decomposition</div>';
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
    const { cols, height: cellHeight } = facetLayout(container, dataSets.length);
    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));grid-auto-rows:minmax(${cellHeight}px,auto);gap:24px 18px;width:100%;height:100%;padding:10px;overflow:auto;align-content:start`;
    container.appendChild(gridDiv);

    const currentYear = State.get('currentYear');
    const yearRange = State.get('yearRange');
    let sharedMaxAbs;

    if (!_freeYAxis) {
        const allVals = [];
        dataSets.forEach(ds => {
            const data = ds.data.filter(d => d.year >= yearRange[0] && d.year <= currentYear);
            if (_chartMode === 'annual') {
                data.forEach(d => allVals.push(d.popEffect, d.incEffect, d.intEffect, d.ghgChange));
            } else {
                let cumPop = 0, cumInc = 0, cumInt = 0, cumTotal = 0;
                data.forEach(d => {
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

    dataSets.forEach((ds, idx) => {
        const data = ds.data.filter(d => d.year >= yearRange[0] && d.year <= currentYear);
        if (data.length === 0) return;

        const cell = document.createElement('div');
        cell.style.cssText = `position:relative;min-height:${cellHeight}px;overflow:hidden`;
        gridDiv.appendChild(cell);

        const cellRect = cell.getBoundingClientRect();
        const width = cellRect.width || 350;
        const height = cellRect.height || cellHeight;
        const margin = { top: 24, right: 12, bottom: 34, left: 62 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        if (w <= 0 || h <= 0) return;

        const svg = d3.select(cell).append('svg')
            .attr('width', width).attr('height', height);
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        svg.append('text').attr('x', margin.left).attr('y', 14)
            .style('font-size', '11px').style('font-weight', '600').style('fill', ds.color)
            .text(ds.name);

        if (_chartMode === 'annual') {
            renderKayaAnnual(g, data, w, h, false, sharedMaxAbs);
        } else {
            renderKayaCumulative(g, data, w, h, false, sharedMaxAbs);
        }
    });

    // Shared legend
    const legendDiv = document.createElement('div');
    legendDiv.style.cssText = 'display:flex;gap:20px;padding:8px 12px;justify-content:center;flex-shrink:0';
    [
        { label: 'Population', color: POP_COLOR },
        { label: 'Income', color: INC_COLOR },
        { label: 'Intensity', color: INT_COLOR }
    ].forEach(item => {
        legendDiv.innerHTML += `<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:${COLORS.gray};text-transform:uppercase;letter-spacing:.3px">
            <span style="width:12px;height:12px;background:${item.color};display:inline-block"></span>
            ${item.label}</span>`;
    });
    container.appendChild(legendDiv);
}

// ---- Kaya annual bars (stacked positive/negative) ----

function renderKayaAnnual(g, data, w, h, isSingle, sharedMaxAbs) {
    const yearExtent = d3.extent(data, d => d.year);
    const xScale = d3.scaleLinear().domain(yearExtent).range([0, w]);

    const allVals = data.flatMap(d => [d.popEffect, d.incEffect, d.intEffect, d.ghgChange]);
    const maxAbs = sharedMaxAbs || d3.max(allVals.map(Math.abs)) * 1.15 || 10;
    const yScale = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([h, 0]).nice();

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(isSingle ? 5 : 4)).join('line')
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
    g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(isSingle ? 10 : 5).tickFormat(d3.format('d')));
    g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(isSingle ? 6 : 4).tickFormat(formatEmissionTick));

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '10px').style('fill', COLORS.lightGray)
            .text('GHG change by Kaya factor (Mt CO\u2082e)');

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

    // Grid
    g.selectAll('.grid-h').data(yScale.ticks(isSingle ? 5 : 4)).join('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
        .attr('stroke', '#eee').attr('stroke-width', 0.5);

    // Zero line
    g.append('line').attr('x1', 0).attr('x2', w)
        .attr('y1', yScale(0)).attr('y2', yScale(0))
        .attr('stroke', COLORS.gray).attr('stroke-width', 0.5);

    // Factor lines
    const factors = [
        { key: 'cumPop', color: POP_COLOR, label: 'Population' },
        { key: 'cumInc', color: INC_COLOR, label: 'Income' },
        { key: 'cumInt', color: INT_COLOR, label: 'Intensity' }
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
                .attr('dy', '0.35em').attr('font-size', 9).attr('fill', f.color)
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
    g.append('g').attr('transform', `translate(0,${h})`).attr('class', 'axis')
        .call(d3.axisBottom(xScale).ticks(isSingle ? 10 : 5).tickFormat(d3.format('d')));
    g.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(isSingle ? 6 : 4).tickFormat(formatEmissionTick));

    if (isSingle) {
        g.append('text').attr('transform', 'rotate(-90)')
            .attr('y', -52).attr('x', -h / 2).attr('text-anchor', 'middle')
            .style('font-size', '10px').style('fill', COLORS.lightGray)
            .text('Cumulative Kaya factor contribution (Mt CO\u2082e)');
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
            .attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 600)
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
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${GREEN_COLOR}">Green growth</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.delta_d))}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${RECESS_COLOR}">Recessive</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.delta_r))}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label"><strong>Total</strong></span><span class="tooltip-value"><strong>${formatEmissions(total)}</strong></span></div>`,
                entry.ar6 != null ? `<div class="tooltip-row"><span class="tooltip-label">AR6</span><span class="tooltip-value">${entry.ar6}</span></div>` : ''
            ].join(''), event);
        })
        .on('mouseleave', function () { hoverG.style('display', 'none'); Tooltip.hide(); });
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
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${GREEN_COLOR}">Green growth</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.cum_d))} (${pctD}%)</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${RECESS_COLOR}">Recessive</span><span class="tooltip-value">${formatEmissions(Math.abs(entry.cum_r))} (${pctR}%)</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label"><strong>Total</strong></span><span class="tooltip-value"><strong>${formatEmissions(totalCum)}</strong></span></div>`
            ].join(''), event);
        })
        .on('mouseleave', function () { hoverG.style('display', 'none'); Tooltip.hide(); });
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
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${POP_COLOR}">Population</span><span class="tooltip-value">${formatEmissions(entry.popEffect)}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${INC_COLOR}">Income</span><span class="tooltip-value">${formatEmissions(entry.incEffect)}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label" style="color:${INT_COLOR}">Intensity</span><span class="tooltip-value">${formatEmissions(entry.intEffect)}</span></div>`,
                `<div class="tooltip-row"><span class="tooltip-label"><strong>Total GHG</strong></span><span class="tooltip-value"><strong>${formatEmissions(entry.ghgChange)}</strong></span></div>`
            ].join(''), event);
        })
        .on('mouseleave', function () { hoverG.style('display', 'none'); Tooltip.hide(); });
}

function renderReductionsLegend(svg, margin, w) {
    const legend = svg.append('g')
        .attr('transform', `translate(${margin.left + w / 2 - 80},${margin.top - 14})`);
    let xOff = 0;
    [{ label: 'Green growth', color: GREEN_COLOR }, { label: 'Recessive', color: RECESS_COLOR }].forEach(item => {
        const row = legend.append('g').attr('transform', `translate(${xOff},0)`);
        row.append('rect').attr('width', 10).attr('height', 10).attr('y', -8)
            .attr('fill', item.color).attr('opacity', 0.85);
        row.append('text').attr('x', 14).attr('y', 0).attr('font-size', 10).attr('fill', COLORS.gray)
            .style('text-transform', 'uppercase').style('letter-spacing', '0.3px').text(item.label);
        xOff += item.label.length * 6.5 + 28;
    });
}

function renderKayaLegend(svg, margin, w) {
    const legend = svg.append('g')
        .attr('transform', `translate(${margin.left + w / 2 - 120},${margin.top - 14})`);
    let xOff = 0;
    [
        { label: 'Population', color: POP_COLOR },
        { label: 'Income', color: INC_COLOR },
        { label: 'Intensity', color: INT_COLOR }
    ].forEach(item => {
        const row = legend.append('g').attr('transform', `translate(${xOff},0)`);
        row.append('rect').attr('width', 10).attr('height', 10).attr('y', -8)
            .attr('fill', item.color).attr('opacity', 0.85);
        row.append('text').attr('x', 14).attr('y', 0).attr('font-size', 10).attr('fill', COLORS.gray)
            .style('text-transform', 'uppercase').style('letter-spacing', '0.3px').text(item.label);
        xOff += item.label.length * 6.5 + 28;
    });
}
