// ============================================================================
// DRIVERS - Kaya decomposition: CO2 = (CO2/GDP) * (GDP/Pop) * Pop
// Waterfall chart with optional faceting by country
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import Tooltip from '../components/tooltip.js';
import { COLORS, getColorForIndex, formatPercent, formatEmissions } from '../utils.js';

const MARGIN = { top: 24, right: 24, bottom: 64, left: 64 };
const FACTOR_COLORS = {
    popEffect: '#e9c46a',
    gdpEffect: '#1e6091',
    techEffect: '#2a9d8f',
    total: '#e63946'
};
const FACTOR_LABELS = {
    popEffect: 'Population',
    gdpEffect: 'GDP per capita',
    techEffect: 'Emission intensity',
    total: 'Total GHG change'
};

let svg, chartW, chartH;
let _unsubs = [];

// ---- Controls ----

function bindControls() {
    const startSel = document.getElementById('drivers-period-start');
    const endSel = document.getElementById('drivers-period-end');

    if (startSel) {
        startSel.value = State.get('driversPeriod')[0];
        startSel.addEventListener('change', () => {
            const period = [...State.get('driversPeriod')];
            period[0] = parseInt(startSel.value);
            State.set('driversPeriod', period);
        });
    }
    if (endSel) {
        endSel.value = State.get('driversPeriod')[1];
        endSel.addEventListener('change', () => {
            const period = [...State.get('driversPeriod')];
            period[1] = parseInt(endSel.value);
            State.set('driversPeriod', period);
        });
    }

    const vizSelect = document.getElementById('drivers-viz-select');
    if (vizSelect) {
        const current = State.get('driversFacet');
        vizSelect.value = current === 'bar' ? 'bar'
            : current === 'country' || current === 'faceted' ? 'faceted'
            : 'waterfall';
        vizSelect.addEventListener('change', () => {
            State.set('driversFacet', vizSelect.value);
        });
    }

    // Facet buttons
    const facetGroup = document.getElementById('drivers-facet-group');
    if (facetGroup) {
        facetGroup.querySelectorAll('[data-drivers-facet]').forEach(btn => {
            btn.addEventListener('click', () => {
                facetGroup.querySelectorAll('[data-drivers-facet]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.set('driversFacet', btn.dataset.driversFacet);
            });
        });
        // Sync initial state
        const fm = State.get('driversFacet');
        facetGroup.querySelectorAll('[data-drivers-facet]').forEach(b => {
            b.classList.toggle('active', b.dataset.driversFacet === fm);
        });
    }

    _unsubs.push(State.subscribe('driversPeriod', () => updateDrivers()));
    _unsubs.push(State.subscribe('driversFacet', () => updateDrivers()));
}

// ---- Kaya decomposition ----

function decompose(iso3) {
    const [startYear, endYear] = State.get('driversPeriod');
    const d1 = DataLoader.getCountryValue(iso3, startYear);
    const d2 = DataLoader.getCountryValue(iso3, endYear);
    if (!d1 || !d2 || !d1.ghg || !d1.pop || !d1.gdp_pc) return null;
    if (!d2.ghg || !d2.pop || !d2.gdp_pc) return null;

    const intensity1 = d1.ghg / (d1.gdp_pc * d1.pop);
    const intensity2 = d2.ghg / (d2.gdp_pc * d2.pop);

    const totalChange = d2.ghg - d1.ghg;
    const logRatio = d2.ghg > 0 && d1.ghg > 0
        ? Math.log(d2.ghg / d1.ghg) : 0;
    const L = logRatio !== 0 ? totalChange / logRatio : (d1.ghg + d2.ghg) / 2;

    const popEffect = d2.pop > 0 && d1.pop > 0
        ? L * Math.log(d2.pop / d1.pop) : 0;
    const gdpEffect = d2.gdp_pc > 0 && d1.gdp_pc > 0
        ? L * Math.log(d2.gdp_pc / d1.gdp_pc) : 0;
    const techEffect = intensity2 > 0 && intensity1 > 0
        ? L * Math.log(intensity2 / intensity1) : 0;

    const meta = DataLoader.getMetadata(iso3);
    return {
        iso3,
        name: meta ? meta.name : iso3,
        popEffect,
        gdpEffect,
        techEffect,
        total: totalChange,
        startGHG: d1.ghg,
        endGHG: d2.ghg
    };
}

// ---- Chart setup ----

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
    svg.append('g').attr('class', 'bars-group');
    svg.append('line').attr('class', 'zero-line')
        .attr('stroke', COLORS.lightGray)
        .attr('stroke-dasharray', '4,3');
}

// ---- Single country waterfall ----

function renderSingleWaterfall(dec, group) {
    const [startYear, endYear] = State.get('driversPeriod');

    const barData = [];
    barData.push({ label: String(startYear), start: 0, end: dec.startGHG, value: dec.startGHG, isYear: true });

    let cumulative = dec.startGHG;
    ['popEffect', 'gdpEffect', 'techEffect'].forEach(f => {
        const val = dec[f];
        barData.push({
            label: FACTOR_LABELS[f],
            factor: f,
            start: cumulative,
            end: cumulative + val,
            value: val,
            pct: dec.startGHG > 0 ? val / dec.startGHG : 0
        });
        cumulative += val;
    });
    barData.push({ label: String(endYear), start: 0, end: dec.endGHG, value: dec.endGHG, isYear: true });

    const xScale = d3.scaleBand()
        .domain(barData.map((d, i) => i))
        .range([0, chartW])
        .padding(0.2);

    const allEnds = barData.flatMap(d => [d.start, d.end]);
    const yMin = Math.min(0, d3.min(allEnds));
    const yMax = d3.max(allEnds) * 1.15;
    const yScale = d3.scaleLinear()
        .domain([yMin, yMax])
        .range([chartH, 0])
        .nice();

    svg.select('.x-axis')
        .call(d3.axisBottom(xScale).tickFormat((d, i) => {
            const bar = barData[i];
            return bar.isYear ? bar.label : bar.label.substring(0, 3);
        }))
        .selectAll('text')
        .style('font-weight', (d, i) => barData[i]?.isYear ? '700' : '400')
        .style('font-size', '11px');

    svg.select('.y-axis')
        .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => {
            if (Math.abs(d) >= 1000) return (d / 1000).toFixed(1) + ' Gt';
            return d.toFixed(0) + ' Mt';
        }));

    svg.select('.zero-line')
        .attr('x1', 0).attr('x2', chartW)
        .attr('y1', yScale(0)).attr('y2', yScale(0));

    group.selectAll('.wf-bar')
        .data(barData)
        .enter().append('rect')
        .attr('class', 'wf-bar')
        .attr('x', (d, i) => xScale(i))
        .attr('width', xScale.bandwidth())
        .attr('y', d => yScale(Math.max(d.start, d.end)))
        .attr('height', d => Math.abs(yScale(d.start) - yScale(d.end)))
        .attr('fill', d => d.isYear ? FACTOR_COLORS.total : FACTOR_COLORS[d.factor])
        .attr('opacity', 0.85)
        .attr('rx', 2)
        .attr('stroke', d => d.isYear ? FACTOR_COLORS.total : 'none')
        .attr('stroke-width', d => d.isYear ? 0.5 : 0)
        .on('mousemove', (event, d) => {
            if (d.isYear) {
                Tooltip.show(`<strong>${d.label}</strong><br>GHG: ${formatEmissions(d.value)}`, event);
            } else {
                Tooltip.show(
                    `<strong>${d.label}</strong><br>` +
                    `${formatEmissions(Math.abs(d.value))} (${formatPercent(d.pct)})`,
                    event
                );
            }
        })
        .on('mouseleave', () => Tooltip.hide());

    // Connector lines
    for (let i = 0; i < barData.length - 1; i++) {
        const connY = barData[i].end;
        group.append('line')
            .attr('class', 'connector')
            .attr('x1', xScale(i) + xScale.bandwidth())
            .attr('x2', xScale(i + 1))
            .attr('y1', yScale(connY))
            .attr('y2', yScale(connY))
            .attr('stroke', COLORS.lightGray)
            .attr('stroke-dasharray', '2,2');
    }

    // Percentage labels on factor bars
    barData.forEach((d, i) => {
        if (d.isYear) return;
        const pctText = (d.pct >= 0 ? '+' : '') + (d.pct * 100).toFixed(1) + '%';
        const barTop = yScale(Math.max(d.start, d.end));
        group.append('text')
            .attr('x', xScale(i) + xScale.bandwidth() / 2)
            .attr('y', barTop - 6)
            .attr('text-anchor', 'middle')
            .attr('font-size', 11)
            .attr('font-weight', 600)
            .attr('fill', FACTOR_COLORS[d.factor])
            .text(pctText);
    });

    // Value labels on year bars
    barData.forEach((d, i) => {
        if (!d.isYear) return;
        group.append('text')
            .attr('x', xScale(i) + xScale.bandwidth() / 2)
            .attr('y', yScale(d.end) - 6)
            .attr('text-anchor', 'middle')
            .attr('font-size', 10)
            .attr('font-weight', 600)
            .attr('fill', FACTOR_COLORS.total)
            .text(formatEmissions(d.value));
    });

    renderLegend(group, ['popEffect', 'gdpEffect', 'techEffect']);
}

// ---- Multi-country waterfall (factors on x-axis, grouped by country) ----

function renderMultiCountryChart(decompositions, group) {
    const [startYear, endYear] = State.get('driversPeriod');
    const factors = ['popEffect', 'gdpEffect', 'techEffect'];
    const countryNames = decompositions.map(d => d.name);

    // Outer scale: factors on x-axis
    const xOuter = d3.scaleBand()
        .domain(factors)
        .range([0, chartW])
        .padding(0.2);

    // Inner scale: countries within each factor
    const xInner = d3.scaleBand()
        .domain(countryNames)
        .range([0, xOuter.bandwidth()])
        .padding(0.08);

    // Y scale
    const allValues = decompositions.flatMap(d =>
        [d.popEffect, d.gdpEffect, d.techEffect]
    );
    const maxAbs = d3.max(allValues.map(Math.abs)) * 1.2;
    const yScale = d3.scaleLinear()
        .domain([-maxAbs, maxAbs])
        .range([chartH, 0])
        .nice();

    // X axis with factor labels
    svg.select('.x-axis')
        .call(d3.axisBottom(xOuter).tickFormat(d => FACTOR_LABELS[d]))
        .selectAll('text')
        .style('font-size', '11px')
        .style('font-weight', '600');

    svg.select('.y-axis')
        .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => {
            if (Math.abs(d) >= 1000) return (d / 1000).toFixed(1) + ' Gt';
            return d.toFixed(0) + ' Mt';
        }));

    svg.select('.zero-line')
        .attr('x1', 0).attr('x2', chartW)
        .attr('y1', yScale(0)).attr('y2', yScale(0));

    // Bars: one per country per factor
    decompositions.forEach((dec, ci) => {
        const color = getColorForIndex(ci);
        factors.forEach(f => {
            const val = dec[f];
            group.append('rect')
                .attr('x', xOuter(f) + xInner(dec.name))
                .attr('width', xInner.bandwidth())
                .attr('y', val >= 0 ? yScale(val) : yScale(0))
                .attr('height', Math.abs(yScale(0) - yScale(val)))
                .attr('fill', color)
                .attr('opacity', 0.85)
                .attr('rx', 2)
                .on('mousemove', (event) => {
                    Tooltip.show(
                        `<strong>${dec.name}</strong><br>` +
                        `${FACTOR_LABELS[f]}: ${formatEmissions(Math.abs(val))}` +
                        `<br>${formatPercent(val / dec.startGHG)}` +
                        `<br>${startYear}\u2013${endYear}`,
                        event
                    );
                })
                .on('mouseleave', () => Tooltip.hide());
        });
    });

    // Country legend
    const legend = group.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${chartW - 140}, -10)`);

    decompositions.forEach((dec, i) => {
        const g = legend.append('g').attr('transform', `translate(0, ${i * 18})`);
        g.append('rect').attr('width', 12).attr('height', 12).attr('fill', getColorForIndex(i)).attr('rx', 2);
        g.append('text').attr('x', 16).attr('y', 10).attr('font-size', 11).attr('fill', COLORS.dark)
            .text(dec.name);
    });
}

// ---- Legend ----

function renderLegend(group, factors) {
    const legend = group.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${chartW - 160}, -10)`);

    factors.forEach((f, i) => {
        const g = legend.append('g').attr('transform', `translate(0, ${i * 18})`);
        g.append('rect').attr('width', 12).attr('height', 12).attr('fill', FACTOR_COLORS[f]).attr('rx', 2);
        g.append('text').attr('x', 16).attr('y', 10).attr('font-size', 11).attr('fill', COLORS.dark)
            .text(FACTOR_LABELS[f]);
    });
}

// ---- Faceted waterfall (one panel per country) ----

function renderFacetedWaterfall(decompositions) {
    const wrapper = document.getElementById('analysis-chart-wrapper');
    if (!wrapper || !decompositions.length) return;
    wrapper.innerHTML = '';
    svg = null;

    const [startYear, endYear] = State.get('driversPeriod');
    const n = decompositions.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);

    const wrapRect = wrapper.getBoundingClientRect();
    const totalW = wrapRect.width || 800;
    const totalH = wrapRect.height || 480;
    const cellW = Math.floor(totalW / cols);
    const cellH = Math.max(180, Math.floor(totalH / rows));

    const facetMargin = { top: 22, right: 12, bottom: 32, left: 48 };

    // Global Y domain for consistency
    let globalMin = 0, globalMax = 0;
    decompositions.forEach(dec => {
        const vals = [0, dec.startGHG, dec.endGHG];
        let cum = dec.startGHG;
        ['popEffect', 'gdpEffect', 'techEffect'].forEach(f => {
            vals.push(cum, cum + dec[f]);
            cum += dec[f];
        });
        globalMin = Math.min(globalMin, ...vals);
        globalMax = Math.max(globalMax, ...vals);
    });
    globalMax *= 1.2;
    globalMin = Math.min(globalMin * 1.2, 0);

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);width:100%;height:100%`;
    wrapper.appendChild(grid);

    decompositions.forEach(dec => {
        const cell = document.createElement('div');
        cell.style.cssText = `position:relative;width:${cellW}px;height:${cellH}px`;
        grid.appendChild(cell);

        const w = cellW - facetMargin.left - facetMargin.right;
        const h = cellH - facetMargin.top - facetMargin.bottom;

        const facetSvg = d3.select(cell).append('svg')
            .attr('width', cellW)
            .attr('height', cellH)
          .append('g')
            .attr('transform', `translate(${facetMargin.left},${facetMargin.top})`);

        // Country name title
        facetSvg.append('text')
            .attr('x', w / 2).attr('y', -8)
            .attr('text-anchor', 'middle')
            .attr('font-size', 11).attr('font-weight', 600)
            .attr('fill', COLORS.dark)
            .text(dec.name);

        // Build waterfall bars
        const barData = [];
        barData.push({ label: String(startYear), start: 0, end: dec.startGHG, value: dec.startGHG, isYear: true });

        let cumulative = dec.startGHG;
        ['popEffect', 'gdpEffect', 'techEffect'].forEach(f => {
            const val = dec[f];
            barData.push({
                label: FACTOR_LABELS[f].substring(0, 3),
                factor: f,
                start: cumulative,
                end: cumulative + val,
                value: val,
                pct: dec.startGHG > 0 ? val / dec.startGHG : 0
            });
            cumulative += val;
        });
        barData.push({ label: String(endYear), start: 0, end: dec.endGHG, value: dec.endGHG, isYear: true });

        const xScale = d3.scaleBand()
            .domain(barData.map((d, i) => i))
            .range([0, w])
            .padding(0.15);

        const yScale = d3.scaleLinear()
            .domain([globalMin, globalMax])
            .range([h, 0]);

        facetSvg.append('g')
            .attr('transform', `translate(0,${h})`)
            .call(d3.axisBottom(xScale).tickFormat((d, i) => barData[i]?.label || ''))
            .selectAll('text').attr('font-size', 8);

        facetSvg.append('g')
            .call(d3.axisLeft(yScale).ticks(4).tickFormat(d => {
                if (Math.abs(d) >= 1000) return (d / 1000).toFixed(0) + 'G';
                return d.toFixed(0);
            }))
            .selectAll('text').attr('font-size', 8);

        facetSvg.append('line')
            .attr('x1', 0).attr('x2', w)
            .attr('y1', yScale(0)).attr('y2', yScale(0))
            .attr('stroke', COLORS.lightGray).attr('stroke-dasharray', '3,2');

        facetSvg.selectAll('.wf-bar')
            .data(barData)
            .enter().append('rect')
            .attr('x', (d, i) => xScale(i))
            .attr('width', xScale.bandwidth())
            .attr('y', d => yScale(Math.max(d.start, d.end)))
            .attr('height', d => Math.max(0, Math.abs(yScale(d.start) - yScale(d.end))))
            .attr('fill', d => d.isYear ? FACTOR_COLORS.total : FACTOR_COLORS[d.factor])
            .attr('opacity', 0.85)
            .on('mousemove', (event, d) => {
                if (d.isYear) {
                    Tooltip.show(`<strong>${dec.name} (${d.label})</strong><br>GHG: ${formatEmissions(d.value)}`, event);
                } else {
                    Tooltip.show(
                        `<strong>${dec.name}</strong><br>${FACTOR_LABELS[d.factor]}: ` +
                        `${formatEmissions(Math.abs(d.value))} (${formatPercent(d.pct)})`,
                        event
                    );
                }
            })
            .on('mouseleave', () => Tooltip.hide());

        // Connectors
        for (let i = 0; i < barData.length - 1; i++) {
            const connY = barData[i].end;
            facetSvg.append('line')
                .attr('x1', xScale(i) + xScale.bandwidth())
                .attr('x2', xScale(i + 1))
                .attr('y1', yScale(connY)).attr('y2', yScale(connY))
                .attr('stroke', COLORS.lightGray).attr('stroke-dasharray', '2,2');
        }

        // Percentage labels
        barData.forEach((d, i) => {
            if (d.isYear) return;
            const pctText = (d.pct >= 0 ? '+' : '') + (d.pct * 100).toFixed(0) + '%';
            facetSvg.append('text')
                .attr('x', xScale(i) + xScale.bandwidth() / 2)
                .attr('y', yScale(Math.max(d.start, d.end)) - 3)
                .attr('text-anchor', 'middle')
                .attr('font-size', 8).attr('font-weight', 600)
                .attr('fill', FACTOR_COLORS[d.factor])
                .text(pctText);
        });
    });
}

// ---- Public API ----

export function initDrivers() {
    bindControls();
    setupChart();
}

export function updateDrivers() {
    const [startYear, endYear] = State.get('driversPeriod');
    const titleEl = document.getElementById('analysis-title');
    const subEl = document.getElementById('analysis-subtitle');
    if (titleEl) titleEl.textContent = 'Kaya Decomposition';
    if (subEl) subEl.textContent = `GHG emission drivers, ${startYear}\u2013${endYear}`;

    const countries = State.get('selectedCountries');
    const decompositions = countries.map(iso => decompose(iso)).filter(Boolean);

    if (!decompositions.length) {
        const wrapper = document.getElementById('analysis-chart-wrapper');
        if (wrapper) {
            wrapper.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">Select countries with data for the chosen period</div>';
        }
        svg = null;
        return;
    }

    const vizSelect = document.getElementById('drivers-viz-select');
    const facet = vizSelect ? vizSelect.value : State.get('driversFacet');
    if (facet === 'faceted' || facet === 'country' || (facet !== 'bar' && decompositions.length > 1)) {
        renderFacetedWaterfall(decompositions);
    } else {
        if (!svg) setupChart();
        if (!svg) return;
        const barsGroup = svg.select('.bars-group');
        barsGroup.selectAll('*').remove();

        if (decompositions.length === 1) {
            renderSingleWaterfall(decompositions[0], barsGroup);
        } else if (facet === 'bar') {
            renderMultiCountryChart(decompositions, barsGroup);
        }
    }
}

export function destroyDrivers() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    svg = null;
}
