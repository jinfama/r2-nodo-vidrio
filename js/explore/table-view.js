// ============================================================================
// TABLE VIEW - Sortable data table for selected countries/indicator/year
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import { exportCSV } from '../components/export.js';
import {
    COLORS,
    INDICATOR_LABELS,
    INDICATOR_UNITS,
    formatValue,
    formatEmissions,
    formatGDP,
    formatGDPTotal,
    formatRank,
    getColorForIndex,
    resolveIndicatorValue
} from '../utils.js';

let currentContainer = null;
let sortColumn = 'rank';
let sortAscending = true;

export function initTableView() {
    currentContainer = document.getElementById('explore-table-container');
}

export function updateTableView() {
    if (!currentContainer) return;
    renderTable();
}

// ============================================================================
// Table rendering
// ============================================================================

function renderTable() {
    const container = currentContainer;
    container.innerHTML = '';

    const indicator = State.get('indicator');
    const year = State.get('currentYear');
    const selectedCountries = State.get('selectedCountries');
    // Determine which countries to display
    let countryList;
    if (selectedCountries.length > 0) {
        countryList = selectedCountries;
    } else {
        // Show top countries from ranking
        let ranking = DataLoader.getRanking(indicator, year);
        if (!ranking || ranking.length === 0) {
            ranking = buildManualRanking(indicator, year);
        }
        countryList = ranking.slice(0, 30).map(r => r.iso3);
    }

    if (countryList.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--cl)">No data available</div>';
        return;
    }

    // Determine columns
    const isEmission = indicator === 'ghg' || indicator === 'co2ff' || indicator === 'ghg_pc';

    const columns = [
        { key: 'rank', label: '#', width: '40px', align: 'center' },
        { key: 'name', label: 'Country', width: 'auto', align: 'left' },
        { key: indicator, label: INDICATOR_LABELS[indicator] || indicator, width: '120px', align: 'right' }
    ];

    // Context columns
    if (isEmission) {
        if (indicator !== 'ghg_pc') columns.push({ key: 'ghg_pc', label: 'GHG p.c.', width: '80px', align: 'right' });
        if (indicator !== 'co2ff') columns.push({ key: 'co2ff', label: 'CO\u2082 FF', width: '90px', align: 'right' });
    }
    if (indicator !== 'gdp_pc') columns.push({ key: 'gdp_pc', label: 'GDP p.c.', width: '100px', align: 'right' });
    if (indicator !== 'hdi' && indicator !== 'hdi_ng') columns.push({ key: 'hdi', label: 'HDI', width: '70px', align: 'right' });

    columns.push({ key: 'pop', label: 'Pop', width: '80px', align: 'right' });

    // Build rows
    const rows = countryList.map(iso3 => {
        const val = DataLoader.getCountryValue(iso3, year);
        const meta = DataLoader.getMetadata(iso3);
        const rank = DataLoader.getCountryRank(iso3, year, indicator);

        const row = {
            iso3,
            name: meta ? meta.name : iso3,
            rank: rank || 999,
            isSelected: selectedCountries.includes(iso3)
        };

        if (val) {
            row[indicator] = resolveIndicatorValue(val, indicator);
            row.gdp_pc = val.gdp_pc;
            row.hdi = val.hdi;
            row.hdi_ng = val.hdi_ng;
            row.ghg = val.ghg;
            row.ghg_pc = val.ghg_pc;
            row.co2ff = val.co2ff;
            row.pop = val.pop;
        }

        return row;
    });

    // Sort
    rows.sort((a, b) => {
        let va = a[sortColumn];
        let vb = b[sortColumn];
        if (sortColumn === 'name') {
            va = va || '';
            vb = vb || '';
            return sortAscending ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        va = va ?? -Infinity;
        vb = vb ?? -Infinity;
        return sortAscending ? va - vb : vb - va;
    });

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'overflow-x:auto;overflow-y:auto;max-height:100%;width:100%;';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--cb);';
    toolbar.innerHTML = `
        <span style="font-size:12px;font-weight:600;color:var(--cd)">${INDICATOR_LABELS[indicator] || indicator} \u2014 ${year}</span>
        <button id="explore-table-export" style="font-size:11px;padding:3px 10px;cursor:pointer;border:1px solid var(--cb);border-radius:4px;background:var(--bgl);color:var(--cg)">Export CSV</button>
    `;
    wrapper.appendChild(toolbar);

    // Table
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.dataset.sortKey = col.key;
        th.style.cssText = `
            padding:6px 8px;text-align:${col.align};font-weight:600;font-size:11px;
            color:var(--cg);border-bottom:2px solid var(--cb);
            cursor:pointer;white-space:nowrap;user-select:none;
            ${col.width !== 'auto' ? 'width:' + col.width + ';' : ''}
        `;

        // Sort indicator
        if (col.key === sortColumn) {
            th.textContent += sortAscending ? ' \u25B2' : ' \u25BC';
        }

        th.addEventListener('click', () => {
            if (sortColumn === col.key) {
                sortAscending = !sortAscending;
            } else {
                sortColumn = col.key;
                sortAscending = col.key === 'name' || col.key === 'rank';
            }
            renderTable();
        });

        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    rows.forEach((row, rowIdx) => {
        const tr = document.createElement('tr');
        tr.style.cssText = `cursor:pointer;${row.isSelected ? 'background:rgba(30,96,145,0.06);' : ''}`;

        tr.addEventListener('click', () => {
            State.toggleCountry(row.iso3);
        });

        tr.addEventListener('mouseenter', () => {
            tr.style.background = 'rgba(30,96,145,0.08)';
        });
        tr.addEventListener('mouseleave', () => {
            tr.style.background = row.isSelected ? 'rgba(30,96,145,0.06)' : '';
        });

        columns.forEach(col => {
            const td = document.createElement('td');
            td.style.cssText = `padding:5px 8px;text-align:${col.align};border-bottom:1px solid var(--cb);white-space:nowrap;`;

            if (col.key === 'rank') {
                td.textContent = row.rank < 999 ? row.rank : '\u2014';
                td.style.fontWeight = '500';
                td.style.color = COLORS.lightGray;
            } else if (col.key === 'name') {
                const colorIdx = selectedCountries.indexOf(row.iso3);
                if (colorIdx >= 0) {
                    td.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${getColorForIndex(colorIdx)};margin-right:4px"></span>${row.name}`;
                    td.style.fontWeight = '600';
                } else {
                    td.textContent = row.name;
                }
            } else if (col.key === 'pop') {
                td.textContent = row.pop != null ? formatValue(row.pop, 'pop') : '\u2014';
            } else {
                td.textContent = formatValue(row[col.key], col.key);
            }

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);

    // CSV export button
    const exportBtn = document.getElementById('explore-table-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const csvData = rows.map(row => {
                const obj = { rank: row.rank, country: row.name, iso3: row.iso3 };
                columns.forEach(col => {
                    if (col.key !== 'rank' && col.key !== 'name') {
                        obj[col.label] = row[col.key] != null ? row[col.key] : '';
                    }
                });
                return obj;
            });
            exportCSV(csvData, `cascorro_${indicator}_${year}.csv`);
        });
    }
}

// ============================================================================
// Helpers
// ============================================================================

function buildManualRanking(indicator, year) {
    const allMeta = DataLoader.getAllMetadata();
    const entries = allMeta.map(m => {
        const val = DataLoader.getCountryValue(m.iso3, year);
        return {
            iso3: m.iso3,
            value: resolveIndicatorValue(val, indicator),
            rank: null
        };
    }).filter(d => d.value != null);

    entries.sort((a, b) => b.value - a.value);
    entries.forEach((d, i) => d.rank = i + 1);
    return entries;
}
