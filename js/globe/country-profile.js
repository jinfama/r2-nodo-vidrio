// ============================================================================
// COUNTRY PROFILE - Side panel with multi-indicator mini charts + waterfall
// ============================================================================

import DataLoader from '../data-loader.js';
import State from '../state.js';
import {
    COLORS, formatValue, formatGDP, formatEmissions, formatMFA, formatCrops,
    formatRank, formatRatio,
    formatPercent, getAbsoluteColorScale, INDICATOR_LABELS
} from '../utils.js';

let currentIso3 = null;

// Ensure first/last values in tick array with minimum gap (Maddison style)
function ensureEndTicks(ticks, first, last, minGap) {
    minGap = minGap || 15;
    let t = ticks.filter(v => v !== first && v !== last);
    t = t.filter(v => Math.abs(v - first) >= minGap);
    t = t.filter(v => Math.abs(v - last) >= minGap);
    t.unshift(first);
    t.push(last);
    return t;
}

// Ensure Y-axis always shows first + last domain value
function ensureYEndTicks(ticks, yDom) {
    const lo = yDom[0], hi = yDom[1];
    let t = [lo, ...ticks.filter(v => v !== lo && v !== hi), hi];
    return [...new Set(t)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

// Map data-indicator values to baseIndicator + perCapita state
const INDICATOR_STATE_MAP = {
    pop:         { base: 'pop',    pc: false },
    ghg:         { base: 'ghg',    pc: false },
    co2ff:       { base: 'ghg',    pc: false, gas: 'co2ff', gases: ['co2ff'] },
    gdp_pc:      { base: 'gdp',    pc: true  },
    hdi:         { base: 'hdi',    pc: false },
    crop_total:  { base: 'crops',  pc: false },
    mfa_ext_tot: { base: 'mfa',   pc: false }
};

export function initCountryProfile() {
    const closeBtn = document.querySelector('.profile-close');
    if (closeBtn) closeBtn.addEventListener('click', closeProfile);

    // Clickable chart sections — switch globe indicator
    document.querySelectorAll('.profile-chart-section[data-indicator]').forEach(section => {
        section.addEventListener('click', () => {
            const ind = section.dataset.indicator;
            const mapping = INDICATOR_STATE_MAP[ind];
            if (!mapping) return;
            State.set('baseIndicator', mapping.base);
            State.set('perCapita', mapping.pc);
            if (mapping.gases) {
                State.set('selectedGases', mapping.gases);
                State.set('gasType', mapping.gas || 'total');
            } else {
                State.set('selectedGases', ['total']);
                State.set('gasType', 'total');
            }
            State.set('indicator', ind);
        });
    });

    // Keep active-indicator class in sync with state
    updateActiveIndicatorHighlight();
    State.subscribe('indicator', () => updateActiveIndicatorHighlight());

}

// Map effective indicator back to the chart section's data-indicator value
const INDICATOR_TO_SECTION = {
    pop: 'pop',
    ghg: 'ghg', ghg_pc: 'ghg',
    co2ff: 'co2ff', co2ff_pc: 'co2ff',
    gdp_pc: 'gdp_pc', gdp_total: 'gdp_pc',
    hdi: 'hdi', hdi_ng: 'hdi',
    crop_total: 'crop_total', crop_total_pc: 'crop_total',
    mfa_ext_tot: 'mfa_ext_tot', mfa_ext_pc: 'mfa_ext_tot'
};

function updateActiveIndicatorHighlight() {
    const indicator = State.get('indicator');
    const sectionKey = INDICATOR_TO_SECTION[indicator] || indicator;
    document.querySelectorAll('.profile-chart-section[data-indicator]').forEach(section => {
        section.classList.toggle('active-indicator', section.dataset.indicator === sectionKey);
    });
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

export function openProfile(iso3) {
    currentIso3 = iso3;
    const panel = document.getElementById('country-profile');
    if (!panel) return;

    const meta = DataLoader.getMetadata(iso3);
    const year = State.get('currentYear');
    const val = DataLoader.getCountryValue(iso3, year);
    const worldVal = DataLoader.getWorldValue(year);

    const nameEl = document.getElementById('profile-name');
    const regionEl = document.getElementById('profile-region');
    if (nameEl) nameEl.textContent = meta ? meta.name : iso3;
    if (regionEl) regionEl.textContent = meta ? (meta.region_un_sub || '') : '';

    updateStatsRow(iso3, year, val, worldVal);
    panel.classList.add('open');
    // Delay chart render until panel transition completes (300ms) so clientWidth is correct
    setTimeout(() => renderAllCharts(iso3), 350);
}

export function closeProfile() {
    const panel = document.getElementById('country-profile');
    if (panel) panel.classList.remove('open');
    currentIso3 = null;
}

export function isProfileOpen() {
    return currentIso3 !== null;
}

// ---------------------------------------------------------------------------
// Stats row
// ---------------------------------------------------------------------------

function latestFieldValue(iso3, year, field) {
    const data = DataLoader.getCountryData(iso3) || [];
    for (let i = data.length - 1; i >= 0; i--) {
        const d = data[i];
        if (d.y <= year && d[field] != null && Number.isFinite(d[field])) {
            return { value: d[field], year: d.y };
        }
    }
    return { value: null, year };
}

function updateStatsRow(iso3, year, val, worldVal) {
    const row = document.getElementById('profile-stats-row');
    if (!row) return;

    const pop = latestFieldValue(iso3, year, 'pop');
    const gdp = latestFieldValue(iso3, year, 'gdp_pc');
    const hdi = latestFieldValue(iso3, year, 'hdi');
    const ghg = latestFieldValue(iso3, year, 'ghg');
    const crop = latestFieldValue(iso3, year, 'crop_total');
    const mfa = latestFieldValue(iso3, year, 'mfa_ext_tot');

    const popStr = pop.value != null ? (pop.value >= 1000 ? (pop.value / 1000).toFixed(1) + 'B' : pop.value.toFixed(1) + 'M') : '\u2014';
    const gdpStr = formatGDP(gdp.value);
    const hdiStr = hdi.value != null ? hdi.value.toFixed(3) : '\u2014';
    // Compact GHG format — no "CO₂e" to avoid wrapping
    const ghgVal = ghg.value;
    const ghgStr = ghgVal != null
        ? (ghgVal >= 1e3 ? (ghgVal / 1e3).toFixed(1) + ' Gt' : ghgVal.toFixed(1) + ' Mt')
        : '\u2014';
    const cropStr = crop.value != null ? formatCrops(crop.value) : '\u2014';
    const mfaStr = mfa.value != null ? formatMFA(mfa.value) : '\u2014';

    // Get ranks
    const fmtRank = (r) => r ? `(#${r})` : '';
    const statRank = (stat, field) => stat.value != null
        ? fmtRank(DataLoader.getCountryRank(iso3, stat.year, field))
        : '';

    row.innerHTML = `
        <div class="profile-stat">
            <div class="profile-stat-label">Pop</div>
            <div class="profile-stat-value">${popStr}</div>
            <div class="profile-stat-rank">${statRank(pop, 'pop')}</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-label">GDP pc</div>
            <div class="profile-stat-value">${gdpStr}</div>
            <div class="profile-stat-rank">${statRank(gdp, 'gdp_pc')}</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-label">HDI</div>
            <div class="profile-stat-value">${hdiStr}</div>
            <div class="profile-stat-rank">${statRank(hdi, 'hdi')}</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-label">GHG</div>
            <div class="profile-stat-value">${ghgStr}</div>
            <div class="profile-stat-rank">${statRank(ghg, 'ghg')}</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-label">Cropland</div>
            <div class="profile-stat-value">${cropStr}</div>
            <div class="profile-stat-rank">${statRank(crop, 'crop_total')}</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-label">MFA</div>
            <div class="profile-stat-value">${mfaStr}</div>
            <div class="profile-stat-rank">${statRank(mfa, 'mfa_ext_tot')}</div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Render all profile charts
// ---------------------------------------------------------------------------

function renderAllCharts(iso3) {
    // Row 1: Socioeconomic
    renderMiniChart('pchart-pop', iso3, 'pop');
    renderMiniChart('pchart-gdp', iso3, 'gdp_pc');
    renderMiniChart('pchart-hdi', iso3, 'hdi');
    // Row 2: Environmental
    renderMiniChart('pchart-emissions', iso3, 'ghg');
    renderMiniChart('pchart-cropland', iso3, 'crop_total');
    renderMiniChart('pchart-mfa', iso3, 'mfa_ext_tot');
    // Row 3: Intensities
    renderMiniChart('pchart-intensity', iso3, '_intensity_ghg');
    renderMiniChart('pchart-crop-intensity', iso3, '_crop_intensity');
    renderMiniChart('pchart-mfa-intensity', iso3, '_mfa_intensity');
}

// ---------------------------------------------------------------------------
// Mini sparkline charts
// ---------------------------------------------------------------------------

function renderMiniChart(containerId, iso3, field) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const data = DataLoader.getCountryData(iso3);
    if (!data) return;

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 120;
    // Scale font sizes relative to chart size (viewBox scaling makes them too big)
    const fontSize = Math.max(7, Math.min(9, height / 15));

    const margin = { top: 12, right: 32, bottom: 14, left: 28 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svg = d3.select(container).append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%').style('height', '100%')
        .style('font-size', fontSize + 'px');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const [minY, maxY] = State.get('yearRange');
    const filtered = data.filter(d => d.y >= minY && d.y <= maxY);

    // Compute values
    const yData = filtered.map(d => {
        let v;
        if (field === '_intensity_ghg') {
            v = (d.ghg != null && d.gdp_pc > 0 && d.pop > 0)
                ? (d.ghg * 1000) / (d.gdp_pc * d.pop)
                : null;
        } else if (field === '_intensity_co2') {
            v = (d.co2ff != null && d.gdp_pc > 0 && d.pop > 0)
                ? (d.co2ff * 1000) / (d.gdp_pc * d.pop)
                : null;
        } else if (field === '_crop_intensity') {
            // Cropland per GDP: crop_total (Mha) * 1e6 / (gdp_pc * pop * 1e6) * 1000 = crop_total * 1000 / (gdp_pc * pop)  (ha/k$)
            v = (d.crop_total != null && d.gdp_pc > 0 && d.pop > 0)
                ? (d.crop_total * 1000) / (d.gdp_pc * d.pop)
                : null;
        } else if (field === '_mfa_intensity') {
            // MFA per GDP: mfa_ext_tot (Mt) * 1e9 / (gdp_pc * pop * 1e6) = mfa_ext_tot * 1e3 / (gdp_pc * pop)  (kg/$)
            v = (d.mfa_ext_tot != null && d.gdp_pc > 0 && d.pop > 0)
                ? (d.mfa_ext_tot * 1000) / (d.gdp_pc * d.pop)
                : null;
        } else {
            v = d[field];
        }
        return { y: d.y, v };
    }).filter(d => d.v != null);

    if (yData.length === 0) return;

    const xScale = d3.scaleLinear().domain([minY, maxY]).range([0, w]);

    let yDomain;
    if (field === 'hdi') {
        yDomain = [0, 1];
    } else {
        yDomain = [0, d3.max(yData, d => d.v) * 1.1];
    }
    const yScale = d3.scaleLinear().domain(yDomain).range([h, 0]).nice();

    const color = getChartColor(field);

    // Grid
    const yDom = yScale.domain();
    g.selectAll('.mini-grid')
        .data(yScale.ticks(3))
        .join('line')
        .attr('class', 'grid-line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d));

    // X-axis: always show first + last year (Maddison style)
    const xTicks = ensureEndTicks(xScale.ticks(3), minY, maxY, 55);
    g.append('g')
        .attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d3.format('d')))
        .attr('class', 'axis');

    const yTickFormat = field === 'hdi'
        ? d3.format('.1f')
        : field === 'gdp_pc'
            ? d => (d >= 1000 ? (d / 1000).toFixed(0) + 'K' : d.toFixed(0))
            : (field === '_intensity_ghg' || field === '_intensity_co2' || field === '_mfa_intensity')
                ? d => d.toFixed(2)
                : field === '_crop_intensity'
                    ? d => d.toFixed(2)
                    : d => {
                        if (d >= 1e6) return (d / 1e6).toFixed(0) + 'B';
                        if (d >= 1000) return (d / 1000).toFixed(0) + 'K';
                        if (d >= 1) return d.toFixed(0);
                        return d.toFixed(1);
                    };

    // Y-axis: always show first + last domain value (Maddison style)
    const yTicks = ensureYEndTicks(yScale.ticks(3), yDom);
    g.append('g')
        .call(d3.axisLeft(yScale).tickValues(yTicks).tickFormat(yTickFormat))
        .attr('class', 'axis');

    // Area
    const area = d3.area()
        .x(d => xScale(d.y))
        .y0(h)
        .y1(d => yScale(d.v))
        .curve(d3.curveMonotoneX)
        .defined(d => d.v != null);

    g.append('path')
        .datum(yData)
        .attr('fill', color)
        .attr('fill-opacity', 0.08)
        .attr('d', area);

    // Line
    const line = d3.line()
        .x(d => xScale(d.y))
        .y(d => yScale(d.v))
        .curve(d3.curveMonotoneX)
        .defined(d => d.v != null);

    g.append('path')
        .datum(yData)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('d', line);

    // Current year marker with value label — use last available if exact year missing
    const currentYear = State.get('currentYear');
    let currentEntry = yData.find(d => d.y === currentYear);
    if (!currentEntry && yData.length > 0) {
        // Use the last data point that's <= currentYear
        const candidates = yData.filter(d => d.y <= currentYear);
        currentEntry = candidates.length > 0 ? candidates[candidates.length - 1] : yData[yData.length - 1];
    }
    const isAtEnd = !currentEntry || currentEntry.y >= maxY - 2;

    if (currentEntry && currentEntry.v != null) {
        const cx = xScale(currentEntry.y);
        const cy = yScale(currentEntry.v);

        g.append('circle')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', 3)
            .attr('fill', color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5);

        const valText = formatMiniValue(currentEntry.v, field);
        if (isAtEnd) {
            // At last year: label to the right of dot
            g.append('text')
                .attr('x', cx + 6)
                .attr('y', cy + 3)
                .attr('text-anchor', 'start')
                .style('font-size', '8px')
                .style('font-weight', '600')
                .style('fill', color)
                .text(valText);
        } else {
            // During animation: label above dot
            const labelY = Math.max(6, cy - 10);
            g.append('text')
                .attr('x', cx)
                .attr('y', labelY)
                .attr('text-anchor', 'middle')
                .style('font-size', '8px')
                .style('font-weight', '600')
                .style('fill', color)
                .text(valText);
        }
    }

    // Rank badge — top-right corner
    let rank = null, total = null;
    const rankYear = currentEntry ? currentEntry.y : currentYear;
    if (field === '_intensity_ghg' || field === '_intensity_co2' || field === '_crop_intensity' || field === '_mfa_intensity') {
        // Compute intensity ranking on-the-fly (lower = better, so rank ascending)
        const intensityRanking = computeIntensityRanking(rankYear, field);
        const entry = intensityRanking.find(e => e.iso3 === iso3);
        if (entry) { rank = entry.rank; total = intensityRanking.length; }
    } else {
        const rankIndicator = field === 'gdp_pc' ? 'gdp_pc'
            : field === 'hdi' ? 'hdi'
            : field === 'co2ff' ? 'co2ff'
            : field === 'pop' ? 'pop'
            : field === 'crop_total' ? 'crop_total'
            : field === 'mfa_ext_tot' ? 'mfa_ext_tot'
            : 'ghg';
        rank = DataLoader.getCountryRank(iso3, rankYear, rankIndicator);
        total = DataLoader.getTotalCountries(rankYear, rankIndicator);
    }

    // Rank badge — inside the title line, right-aligned
    const section = container.closest('.profile-chart-section');
    if (section) {
        const titleEl = section.querySelector('.profile-chart-title');
        if (titleEl) {
            const oldBadge = titleEl.querySelector('.profile-rank-badge');
            if (oldBadge) oldBadge.remove();
            if (rank) {
                const badge = document.createElement('span');
                badge.className = 'profile-rank-badge';
                badge.innerHTML = `<span style="color:${color}">#${rank}</span><br><span style="color:var(--cl)">of ${total}</span>`;
                titleEl.appendChild(badge);
            }
        }
    }
}

function formatMiniValue(value, field) {
    if (value == null) return '';
    if (field === 'hdi') return value.toFixed(3);
    if (field === 'gdp_pc') {
        if (value >= 1e4) return (value / 1e3).toFixed(1);
        return Math.round(value);
    }
    if (field === '_intensity_ghg' || field === '_intensity_co2') return value.toFixed(2);
    if (field === '_crop_intensity') return value.toFixed(2);
    if (field === '_mfa_intensity') return value.toFixed(2);
    if (field === 'ghg' || field === 'co2ff' || field === 'mfa_ext_tot') {
        if (value >= 1000) return (value / 1000).toFixed(1);
        if (value >= 1) return value.toFixed(0);
        return value.toFixed(2);
    }
    if (field === 'crop_total') {
        if (value >= 1000) return (value / 1000).toFixed(1);
        if (value >= 1) return value.toFixed(1);
        return value.toFixed(2);
    }
    if (field === 'pop') {
        if (value >= 1000) return (value / 1000).toFixed(1) + 'B';
        if (value >= 1) return value.toFixed(1);
        return value.toFixed(2);
    }
    return String(Math.round(value));
}

function computeIntensityRanking(year, field) {
    const allMeta = DataLoader.getAllMetadata();
    const entries = [];
    allMeta.forEach(m => {
        const val = DataLoader.getCountryValue(m.iso3, year);
        if (!val || !val.pop || val.pop <= 0) return;

        let intensity;
        if (field === '_crop_intensity') {
            // Cropland per GDP (ha/k$)
            if (val.crop_total == null || !val.gdp_pc || val.gdp_pc <= 0) return;
            intensity = (val.crop_total * 1000) / (val.gdp_pc * val.pop);
        } else if (field === '_mfa_intensity') {
            // MFA per GDP (kg/$)
            if (val.mfa_ext_tot == null || !val.gdp_pc || val.gdp_pc <= 0) return;
            intensity = (val.mfa_ext_tot * 1000) / (val.gdp_pc * val.pop);
        } else {
            // Carbon intensity (kg/$)
            if (!val.gdp_pc || val.gdp_pc <= 0) return;
            const emissionField = field === '_intensity_co2' ? 'co2ff' : 'ghg';
            if (val[emissionField] == null) return;
            intensity = (val[emissionField] * 1000) / (val.gdp_pc * val.pop);
        }
        entries.push({ iso3: m.iso3, value: intensity });
    });
    // Sort ascending (lower intensity = better rank)
    entries.sort((a, b) => a.value - b.value);
    entries.forEach((e, i) => e.rank = i + 1);
    return entries;
}

function getChartColor(field) {
    if (field === 'ghg' || field === 'co2ff') return COLORS.emissions;
    if (field === '_intensity_ghg' || field === '_intensity_co2') return '#e9c46a';
    if (field === 'gdp_pc') return COLORS.gdp;
    if (field === 'hdi' || field === 'hdi_ng') return COLORS.hdi;
    if (field === 'pop') return '#e9c46a';
    if (field === 'crop_total' || field === '_crop_intensity') return '#606c38';
    if (field === 'mfa_ext_tot' || field === '_mfa_intensity') return '#bc6c25';
    return COLORS.primary;
}

// ---------------------------------------------------------------------------
// Mini Tapio decoupling scatter (single country, rolling windows)
// ---------------------------------------------------------------------------

const TAPIO_PATTERNS = {
    SD: { label: 'Strong decoupling', color: '#2a9d8f' },
    WD: { label: 'Weak decoupling', color: '#8ecae6' },
    EC: { label: 'Expansive coupling', color: '#f4a261' },
    EN: { label: 'Expansive negative', color: '#e76f51' },
    WN: { label: 'Weak negative', color: '#bc4749' },
    SN: { label: 'Strong negative', color: '#9b2226' },
    RC: { label: 'Recessive coupling', color: '#ee9b00' },
    RD: { label: 'Recessive decoupling', color: '#606c38' },
    ND: { label: 'No data', color: '#ddd' }
};

function classifyTapio(gdpGrowth, ghgGrowth) {
    if (gdpGrowth === 0 && ghgGrowth === 0) return 'ND';
    const e = gdpGrowth !== 0 ? ghgGrowth / gdpGrowth : null;
    if (gdpGrowth > 0 && ghgGrowth < 0) return 'SD';
    if (gdpGrowth > 0 && ghgGrowth >= 0) {
        if (e != null && e < 0.8) return 'WD';
        if (e != null && e <= 1.2) return 'EC';
        return 'EN';
    }
    if (gdpGrowth < 0 && ghgGrowth > 0) return 'SN';
    if (gdpGrowth < 0 && ghgGrowth <= 0) {
        if (e != null && e < 0.8) return 'WN';
        if (e != null && e <= 1.2) return 'RC';
        return 'RD';
    }
    return 'ND';
}

function renderMiniTapio(containerId, iso3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const raw = DataLoader.getCountryData(iso3);
    if (!raw) return;

    const [minY, maxY] = State.get('yearRange');
    const currentYear = State.get('currentYear');
    const windowSize = 10;

    const filtered = raw.filter(d => d.y >= minY && d.y <= maxY);
    const points = [];

    for (let i = windowSize; i < filtered.length; i++) {
        const d0 = filtered[i - windowSize];
        const d1 = filtered[i];
        if (!d0.gdp_pc || !d1.gdp_pc || d0.gdp_pc === 0) continue;
        if (!d0.ghg || !d1.ghg || d0.ghg === 0) continue;

        const gdpGrowth = ((d1.gdp_pc - d0.gdp_pc) / d0.gdp_pc) * 100;
        const ghgGrowth = ((d1.ghg - d0.ghg) / d0.ghg) * 100;
        const pat = classifyTapio(gdpGrowth, ghgGrowth);
        points.push({ year: d1.y, startYear: d0.y, gdpGrowth, ghgGrowth, pat });
    }

    if (points.length === 0) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 90;
    const margin = { top: 6, right: 6, bottom: 14, left: 26 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales — use data extent with padding, ensure 0 is included
    const xExt = d3.extent(points, d => d.gdpGrowth);
    const yExt = d3.extent(points, d => d.ghgGrowth);
    const padX = Math.max((xExt[1] - xExt[0]) * 0.1, 5);
    const padY = Math.max((yExt[1] - yExt[0]) * 0.1, 5);

    const xScale = d3.scaleLinear()
        .domain([Math.min(xExt[0] - padX, -padX), Math.max(xExt[1] + padX, padX)])
        .range([0, w]).nice();
    const yScale = d3.scaleLinear()
        .domain([Math.min(yExt[0] - padY, -padY), Math.max(yExt[1] + padY, padY)])
        .range([h, 0]).nice();

    // Quadrant shading
    g.append('rect')
        .attr('x', xScale(0)).attr('y', 0)
        .attr('width', w - xScale(0)).attr('height', yScale(0))
        .attr('fill', '#2a9d8f').attr('opacity', 0.06);
    g.append('rect')
        .attr('x', 0).attr('y', yScale(0))
        .attr('width', xScale(0)).attr('height', h - yScale(0))
        .attr('fill', '#9b2226').attr('opacity', 0.06);

    // Zero lines
    g.append('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', yScale(0)).attr('y2', yScale(0))
        .attr('stroke', COLORS.gray).attr('stroke-width', 0.5);
    g.append('line')
        .attr('x1', xScale(0)).attr('x2', xScale(0))
        .attr('y1', 0).attr('y2', h)
        .attr('stroke', COLORS.gray).attr('stroke-width', 0.5);

    // 1:1 diagonal
    const diagMin = Math.max(xScale.domain()[0], yScale.domain()[0]);
    const diagMax = Math.min(xScale.domain()[1], yScale.domain()[1]);
    g.append('line')
        .attr('x1', xScale(diagMin)).attr('y1', yScale(diagMin))
        .attr('x2', xScale(diagMax)).attr('y2', yScale(diagMax))
        .attr('stroke', COLORS.lightGray).attr('stroke-dasharray', '3,2');

    // Axes
    const pctFmt = d => (Number.isInteger(d) ? d : d.toFixed(0)) + '%';
    g.append('g').attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(xScale).ticks(4).tickFormat(pctFmt))
        .attr('class', 'axis').selectAll('text').style('font-size', '7px');
    g.append('g')
        .call(d3.axisLeft(yScale).ticks(4).tickFormat(pctFmt))
        .attr('class', 'axis').selectAll('text').style('font-size', '7px');

    // Dots
    g.selectAll('.tapio-pt')
        .data(points)
        .enter().append('circle')
        .attr('cx', d => xScale(d.gdpGrowth))
        .attr('cy', d => yScale(d.ghgGrowth))
        .attr('r', d => d.year === currentYear ? 5 : 2.5)
        .attr('fill', d => TAPIO_PATTERNS[d.pat]?.color || '#999')
        .attr('opacity', d => d.year === currentYear ? 1 : 0.3)
        .attr('stroke', d => d.year === currentYear ? COLORS.dark : 'none')
        .attr('stroke-width', 1);

    // Current year label
    const curPt = points.find(d => d.year === currentYear);
    if (curPt) {
        const pat = TAPIO_PATTERNS[curPt.pat] || TAPIO_PATTERNS.ND;
        g.append('text')
            .attr('x', xScale(curPt.gdpGrowth) + 7)
            .attr('y', yScale(curPt.ghgGrowth) + 3)
            .style('font-size', '8px').style('font-weight', '600')
            .style('fill', pat.color)
            .text(`${curPt.year} (${curPt.pat})`);
    }

    // Legend below chart as HTML
    const legendEl = document.createElement('div');
    legendEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 8px;margin-top:2px';
    ['SD', 'WD', 'EC', 'EN', 'SN', 'RC'].forEach(code => {
        const p = TAPIO_PATTERNS[code];
        const span = document.createElement('span');
        span.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:7px;color:#868e96';
        span.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${p.color};flex-shrink:0"></span>${code}`;
        span.title = p.label;
        legendEl.appendChild(span);
    });
    container.appendChild(legendEl);
}

// ---------------------------------------------------------------------------
// Mini Correlation scatter: log(GDP pc) vs GHG — all countries, highlight one
// ---------------------------------------------------------------------------

function renderMiniCorrelation(containerId, iso3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const year = State.get('currentYear');
    const allMeta = DataLoader.getAllMetadata();

    // Build data for all countries — GHG per capita (t CO₂e / person)
    const pts = [];
    allMeta.forEach(m => {
        const d = DataLoader.getCountryValue(m.iso3, year);
        if (!d || !d.gdp_pc || d.gdp_pc <= 0 || !d.ghg || d.ghg <= 0 || !d.pop || d.pop <= 0) return;
        const ghgPc = (d.ghg * 1e6) / d.pop; // Mt → t, then / pop
        if (ghgPc <= 0) return;
        pts.push({
            iso3: m.iso3,
            name: m.name,
            gdp: d.gdp_pc,
            ghgPc,
            logGdp: Math.log10(d.gdp_pc),
            logGhg: Math.log10(ghgPc),
            isHighlighted: m.iso3 === iso3
        });
    });

    if (pts.length < 3) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 90;
    const margin = { top: 6, right: 6, bottom: 14, left: 26 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Log scales
    const xExt = d3.extent(pts, d => d.logGdp);
    const yExt = d3.extent(pts, d => d.logGhg);
    const xScale = d3.scaleLinear()
        .domain([xExt[0] - 0.1, xExt[1] + 0.1]).range([0, w]);
    const yScale = d3.scaleLinear()
        .domain([yExt[0] - 0.2, yExt[1] + 0.2]).range([h, 0]);

    // Linear regression in log-log space
    const n = pts.length;
    const sumX = d3.sum(pts, d => d.logGdp);
    const sumY = d3.sum(pts, d => d.logGhg);
    const sumXY = d3.sum(pts, d => d.logGdp * d.logGhg);
    const sumX2 = d3.sum(pts, d => d.logGdp * d.logGdp);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const meanY = sumY / n;
    const ssRes = d3.sum(pts, d => Math.pow(d.logGhg - (slope * d.logGdp + intercept), 2));
    const ssTot = d3.sum(pts, d => Math.pow(d.logGhg - meanY, 2));
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    // Regression line
    const xDom = xScale.domain();
    g.append('line')
        .attr('x1', xScale(xDom[0]))
        .attr('y1', yScale(slope * xDom[0] + intercept))
        .attr('x2', xScale(xDom[1]))
        .attr('y2', yScale(slope * xDom[1] + intercept))
        .attr('stroke', COLORS.emissions)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3')
        .attr('opacity', 0.6);

    // R² label
    g.append('text')
        .attr('x', w - 4).attr('y', 12)
        .attr('text-anchor', 'end')
        .style('font-size', '9px').style('font-weight', '600')
        .style('fill', COLORS.gray)
        .text(`R\u00B2 = ${r2.toFixed(3)}`);

    // Year label
    g.append('text')
        .attr('x', w - 4).attr('y', 24)
        .attr('text-anchor', 'end')
        .style('font-size', '8px')
        .style('fill', COLORS.lightGray)
        .text(year);

    // Axes
    g.append('g').attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(xScale).ticks(3).tickFormat(d => {
            const v = Math.pow(10, d);
            return v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v.toFixed(0);
        }))
        .attr('class', 'axis').selectAll('text').style('font-size', '7px');
    g.append('g')
        .call(d3.axisLeft(yScale).ticks(3).tickFormat(d => {
            const v = Math.pow(10, d);
            if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
            if (v >= 1) return v.toFixed(0);
            return v.toFixed(1);
        }))
        .attr('class', 'axis').selectAll('text').style('font-size', '7px');

    // All country dots (background)
    g.selectAll('.corr-bg')
        .data(pts.filter(d => !d.isHighlighted))
        .enter().append('circle')
        .attr('cx', d => xScale(d.logGdp))
        .attr('cy', d => yScale(d.logGhg))
        .attr('r', 2)
        .attr('fill', '#ccc')
        .attr('opacity', 0.4);

    // Highlighted country
    const hl = pts.find(d => d.isHighlighted);
    if (hl) {
        g.append('circle')
            .attr('cx', xScale(hl.logGdp))
            .attr('cy', yScale(hl.logGhg))
            .attr('r', 5)
            .attr('fill', COLORS.emissions)
            .attr('stroke', COLORS.dark)
            .attr('stroke-width', 1.5);

        g.append('text')
            .attr('x', xScale(hl.logGdp) + 7)
            .attr('y', yScale(hl.logGhg) + 3)
            .style('font-size', '8px').style('font-weight', '600')
            .style('fill', COLORS.dark)
            .text(hl.name);
    }
}

// ---------------------------------------------------------------------------
// Mini Kaya waterfall — from earliest available data to current year
// ---------------------------------------------------------------------------

function renderMiniWaterfall(containerId, iso3, mode) {
    mode = mode || 'ghg';
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const [minY, maxY] = State.get('yearRange');
    const endYear = State.get('currentYear');

    // Find earliest year with valid data for this country
    const allData = DataLoader.getCountryData(iso3);
    if (!allData) return;

    // Determine which fields are needed based on mode
    const needsGdp = true; // all three modes use GDP decomposition
    const valueField = mode === 'ghg' ? 'ghg' : mode === 'mfa' ? 'mfa_ext_tot' : 'crop_total';

    let startYear = null;
    for (const d of allData) {
        if (d.y >= minY && d[valueField] > 0 && d.pop > 0 && (!needsGdp || d.gdp_pc > 0)) {
            startYear = d.y;
            break;
        }
    }
    if (!startYear) return;

    const d1 = DataLoader.getCountryValue(iso3, startYear);
    // Find last year with valid data for this indicator (may be before endYear)
    let actualEndYear = endYear;
    let d2 = DataLoader.getCountryValue(iso3, actualEndYear);
    while (actualEndYear > startYear && (!d2 || !d2[valueField] || !d2.pop || (needsGdp && !d2.gdp_pc))) {
        actualEndYear--;
        d2 = DataLoader.getCountryValue(iso3, actualEndYear);
    }
    if (!d1 || !d2) return;
    if (!d1[valueField] || !d1.pop || (needsGdp && !d1.gdp_pc)) return;
    if (!d2[valueField] || !d2.pop || (needsGdp && !d2.gdp_pc)) return;

    const v1 = d1[valueField], v2 = d2[valueField];
    const totalChange = v2 - v1;
    const logRatio = v2 > 0 && v1 > 0 ? Math.log(v2 / v1) : 0;
    const L = logRatio !== 0 ? totalChange / logRatio : (v1 + v2) / 2;

    const FACTOR_COLORS = { pop: '#e9c46a', gdp: '#1e6091', tech: '#2a9d8f' };
    let factors;

    if (mode === 'ghg') {
        // GHG = (GHG/GDP) x (GDP/cap) x Pop
        const intensity1 = d1.ghg / (d1.gdp_pc * d1.pop);
        const intensity2 = d2.ghg / (d2.gdp_pc * d2.pop);
        const popEffect = d2.pop > 0 && d1.pop > 0 ? L * Math.log(d2.pop / d1.pop) : 0;
        const gdpEffect = d2.gdp_pc > 0 && d1.gdp_pc > 0 ? L * Math.log(d2.gdp_pc / d1.gdp_pc) : 0;
        const techEffect = intensity2 > 0 && intensity1 > 0 ? L * Math.log(intensity2 / intensity1) : 0;
        factors = [
            { key: 'Pop', val: popEffect, color: FACTOR_COLORS.pop },
            { key: 'GDP/cap', val: gdpEffect, color: FACTOR_COLORS.gdp },
            { key: 'GHG/GDP', val: techEffect, color: FACTOR_COLORS.tech }
        ];
    } else if (mode === 'mfa') {
        // MFA = (MFA/GDP) x (GDP/cap) x Pop
        const intensity1 = d1.mfa_ext_tot / (d1.gdp_pc * d1.pop);
        const intensity2 = d2.mfa_ext_tot / (d2.gdp_pc * d2.pop);
        const popEffect = d2.pop > 0 && d1.pop > 0 ? L * Math.log(d2.pop / d1.pop) : 0;
        const gdpEffect = d2.gdp_pc > 0 && d1.gdp_pc > 0 ? L * Math.log(d2.gdp_pc / d1.gdp_pc) : 0;
        const techEffect = intensity2 > 0 && intensity1 > 0 ? L * Math.log(intensity2 / intensity1) : 0;
        factors = [
            { key: 'Pop', val: popEffect, color: FACTOR_COLORS.pop },
            { key: 'GDP/cap', val: gdpEffect, color: FACTOR_COLORS.gdp },
            { key: 'MFA/GDP', val: techEffect, color: FACTOR_COLORS.tech }
        ];
    } else {
        // Cropland = (Crop/GDP) x (GDP/cap) x Pop
        const intensity1 = d1.crop_total / (d1.gdp_pc * d1.pop);
        const intensity2 = d2.crop_total / (d2.gdp_pc * d2.pop);
        const popEffect = d2.pop > 0 && d1.pop > 0 ? L * Math.log(d2.pop / d1.pop) : 0;
        const gdpEffect = d2.gdp_pc > 0 && d1.gdp_pc > 0 ? L * Math.log(d2.gdp_pc / d1.gdp_pc) : 0;
        const techEffect = intensity2 > 0 && intensity1 > 0 ? L * Math.log(intensity2 / intensity1) : 0;
        factors = [
            { key: 'Pop', val: popEffect, color: FACTOR_COLORS.pop },
            { key: 'GDP/cap', val: gdpEffect, color: FACTOR_COLORS.gdp },
            { key: 'Crop/GDP', val: techEffect, color: FACTOR_COLORS.tech }
        ];
    }

    const width = container.clientWidth || 600;
    const height = Math.max(container.clientHeight, 140) || 160;
    const margin = { top: 8, right: 12, bottom: 18, left: 38 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    if (w <= 0 || h <= 0) return;

    const svg = d3.select(container).append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%').style('height', '100%');
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Build waterfall bars
    const bars = [];
    bars.push({ label: String(startYear), start: 0, end: v1, val: v1, isYear: true });
    let cum = v1;

    factors.forEach(f => {
        bars.push({ label: f.key, start: cum, end: cum + f.val, val: f.val, color: f.color });
        cum += f.val;
    });

    bars.push({ label: String(actualEndYear), start: 0, end: v2, val: v2, isYear: true });

    const xScale = d3.scaleBand()
        .domain(bars.map((_, i) => i))
        .range([0, w])
        .padding(0.15);

    const allEnds = bars.flatMap(b => [b.start, b.end]);
    const yMax = d3.max(allEnds) * 1.15;
    const yMin = Math.min(0, d3.min(allEnds));
    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([h, 0]).nice();

    // Axes
    g.append('g').attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(xScale).tickFormat((d, i) => bars[i]?.label || ''))
        .attr('class', 'axis')
        .selectAll('text').style('font-size', '8px');

    const wfYDom = yScale.domain();
    const wfYTicks = ensureYEndTicks(yScale.ticks(3), wfYDom);
    g.append('g')
        .call(d3.axisLeft(yScale).tickValues(wfYTicks).tickFormat(d => {
            if (Math.abs(d) >= 1000) return (d / 1000).toFixed(1) + 'G';
            return d.toFixed(0);
        }))
        .attr('class', 'axis');

    // Bars
    bars.forEach((b, i) => {
        g.append('rect')
            .attr('x', xScale(i))
            .attr('width', xScale.bandwidth())
            .attr('y', yScale(Math.max(b.start, b.end)))
            .attr('height', Math.max(1, Math.abs(yScale(b.start) - yScale(b.end))))
            .attr('fill', b.isYear ? (mode === 'ghg' ? COLORS.emissions : mode === 'mfa' ? '#bc6c25' : '#606c38') : b.color)
            .attr('opacity', 0.85)
            .attr('rx', 1);
    });

    // Connectors
    for (let i = 0; i < bars.length - 1; i++) {
        const b = bars[i];
        const connY = b.end;
        g.append('line')
            .attr('x1', xScale(i) + xScale.bandwidth())
            .attr('x2', xScale(i + 1))
            .attr('y1', yScale(connY)).attr('y2', yScale(connY))
            .attr('stroke', COLORS.lightGray)
            .attr('stroke-dasharray', '2,1')
            .attr('stroke-width', 0.5);
    }

    // Percentage labels on factor bars
    bars.forEach((b, i) => {
        if (b.isYear) return;
        const pct = v1 > 0 ? b.val / v1 : 0;
        const pctText = (pct >= 0 ? '+' : '') + (pct * 100).toFixed(0) + '%';
        g.append('text')
            .attr('x', xScale(i) + xScale.bandwidth() / 2)
            .attr('y', yScale(Math.max(b.start, b.end)) - 3)
            .attr('text-anchor', 'middle')
            .style('font-size', '7px')
            .style('font-weight', '600')
            .style('fill', b.color)
            .text(pctText);
    });
}

// ---------------------------------------------------------------------------
// Year update
// ---------------------------------------------------------------------------

export function updateProfileYear() {
    if (!currentIso3) return;

    const year = State.get('currentYear');
    const val = DataLoader.getCountryValue(currentIso3, year);
    const worldVal = DataLoader.getWorldValue(year);

    updateStatsRow(currentIso3, year, val, worldVal);
    renderAllCharts(currentIso3);
}
