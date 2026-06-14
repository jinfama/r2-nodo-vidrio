// ============================================================================
// COUNTRY PICKER - OWID-style slide panel for selecting countries & regions
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import { getColorForIndex } from '../utils.js';

const CountryPicker = (() => {

    // Minerva regions used for grouping
    const REGION_ORDER = [
        'Western Europe',
        'Europe & Central Asia',
        'North America',
        'Latin America & Caribbean',
        'East Asia & Pacific',
        'South Asia',
        'Middle East & North Africa',
        'Sub-Saharan Africa'
    ];

    let _overlay, _body, _searchInput;
    let _allCountries = [];    // [{iso3, name, region}]
    let _regionGroups = {};    // region → [iso3,...]

    function init() {
        _overlay = document.getElementById('cpicker-overlay');
        _body = document.getElementById('cpicker-body');
        _searchInput = document.getElementById('cpicker-search');
        if (!_overlay || !_body) return;

        // Close handlers
        document.getElementById('cpicker-close')?.addEventListener('click', close);
        document.getElementById('cpicker-backdrop')?.addEventListener('click', close);

        // Search
        _searchInput?.addEventListener('input', () => render());

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _overlay.classList.contains('open')) close();
        });

        // Open triggers
        document.getElementById('explore-open-picker')?.addEventListener('click', open);
        document.getElementById('analysis-open-picker')?.addEventListener('click', open);

        // State change → re-render if open
        State.subscribe('selectedCountries', () => {
            if (_overlay.classList.contains('open')) render();
        });
    }

    function loadData() {
        if (_allCountries.length > 0) return;
        const all = DataLoader.getAllMetadata();
        _allCountries = all.map(m => ({
            iso3: m.iso3,
            name: m.name,
            region: m.region_minerva || ''
        })).sort((a, b) => a.name.localeCompare(b.name));

        // Group by region
        _regionGroups = {};
        _allCountries.forEach(c => {
            if (!c.region) return;
            if (!_regionGroups[c.region]) _regionGroups[c.region] = [];
            _regionGroups[c.region].push(c.iso3);
        });
    }

    function open() {
        loadData();
        _overlay.classList.add('open');
        if (_searchInput) {
            _searchInput.value = '';
            setTimeout(() => _searchInput.focus(), 100);
        }
        render();
    }

    function close() {
        _overlay.classList.remove('open');
    }

    function render() {
        if (!_body) return;
        const selected = State.get('selectedCountries');
        const query = (_searchInput?.value || '').trim().toLowerCase();

        let html = '';

        // === SELECTION SECTION ===
        if (selected.length > 0 && !query) {
            html += '<div class="cpicker-section">';
            html += '<div class="cpicker-section-head"><span>Selection (' + selected.length + ')</span><a id="cpicker-clear-all">Clear</a></div>';
            selected.forEach((iso3, i) => {
                const meta = DataLoader.getMetadata(iso3);
                const name = meta ? meta.name : iso3;
                const color = getColorForIndex(i);
                html += '<div class="cpicker-item" data-iso="' + iso3 + '">';
                html += '<input type="checkbox" checked>';
                html += '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>';
                html += '<span class="cpicker-item-name">' + name + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // === WORLD ===
        if (!query || 'world'.includes(query) || 'global'.includes(query)) {
            const isSelected = selected.includes('WLD');
            html += '<div class="cpicker-item world" data-iso="WLD">';
            html += '<input type="checkbox" ' + (isSelected ? 'checked' : '') + '>';
            html += '<span class="cpicker-item-name">World</span>';
            html += '<span class="cpicker-item-tag">Global</span>';
            html += '</div>';
        }

        // === REGIONS ===
        if (!query) {
            html += '<div class="cpicker-section">';
            html += '<div class="cpicker-section-head"><span>Regions</span></div>';
            REGION_ORDER.forEach(regionName => {
                const isos = _regionGroups[regionName] || [];
                if (isos.length === 0) return;
                const allInSelected = isos.every(iso => selected.includes(iso));
                html += '<div class="cpicker-item region" data-region="' + regionName + '">';
                html += '<input type="checkbox" ' + (allInSelected ? 'checked' : '') + '>';
                html += '<span class="cpicker-item-name">' + regionName + '</span>';
                html += '<span class="cpicker-item-tag">' + isos.length + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // === ALL COUNTRIES ===
        const filtered = query
            ? _allCountries.filter(c =>
                c.name.toLowerCase().includes(query) ||
                c.iso3.toLowerCase().includes(query) ||
                c.region.toLowerCase().includes(query))
            : _allCountries;

        if (filtered.length > 0) {
            html += '<div class="cpicker-section">';
            if (!query) {
                html += '<div class="cpicker-section-head"><span>All countries (' + _allCountries.length + ')</span></div>';
            }
            filtered.forEach(c => {
                const isSelected = selected.includes(c.iso3);
                const idx = selected.indexOf(c.iso3);
                const colorDot = isSelected
                    ? '<span style="width:8px;height:8px;border-radius:50%;background:' + getColorForIndex(idx) + ';flex-shrink:0"></span>'
                    : '';
                html += '<div class="cpicker-item" data-iso="' + c.iso3 + '">';
                html += '<input type="checkbox" ' + (isSelected ? 'checked' : '') + '>';
                html += colorDot;
                html += '<span class="cpicker-item-name">' + c.name + '</span>';
                if (c.region) html += '<span class="cpicker-item-tag">' + c.region + '</span>';
                html += '</div>';
            });
            html += '</div>';
        } else if (query) {
            html += '<div class="cpicker-empty">No results for "' + query + '"</div>';
        }

        _body.innerHTML = html;

        // === EVENT HANDLERS ===

        // Clear all
        const clearBtn = document.getElementById('cpicker-clear-all');
        if (clearBtn) clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            State.clearCountries();
        });

        // Country items
        _body.querySelectorAll('.cpicker-item[data-iso]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.tagName === 'A') return;
                const iso3 = el.dataset.iso;
                State.toggleCountry(iso3);
            });
        });

        // Region items
        _body.querySelectorAll('.cpicker-item[data-region]').forEach(el => {
            el.addEventListener('click', () => {
                const regionName = el.dataset.region;
                const isos = _regionGroups[regionName] || [];
                const currentSelected = State.get('selectedCountries');
                const allIn = isos.every(iso => currentSelected.includes(iso));
                if (allIn) {
                    isos.forEach(iso => State.removeCountry(iso));
                } else {
                    isos.forEach(iso => {
                        if (!currentSelected.includes(iso)) State.addCountry(iso);
                    });
                }
            });
        });
    }

    return { init, open, close };
})();

export default CountryPicker;
