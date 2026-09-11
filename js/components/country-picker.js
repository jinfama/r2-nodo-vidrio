// ============================================================================
// COUNTRY PICKER - OWID-style slide panel for selecting countries & regions
// ============================================================================

import State from '../state.js?v=20260911b';
import DataLoader from '../data-loader.js?v=20260911b';
import { getColorForIndex, tLabel } from '../utils.js?v=20260911b';

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

    // Region names are a UI grouping, not data: they are translated so the
    // picker does not stay English inside a Spanish or Chinese page.
    const REGION_NAMES = {
        es: {
            'Western Europe': 'Europa Occidental',
            'Europe & Central Asia': 'Europa y Asia Central',
            'North America': 'América del Norte',
            'Latin America & Caribbean': 'América Latina y Caribe',
            'East Asia & Pacific': 'Asia Oriental y Pacífico',
            'South Asia': 'Asia Meridional',
            'Middle East & North Africa': 'Oriente Medio y Norte de África',
            'Sub-Saharan Africa': 'África Subsahariana'
        },
        zh: {
            'Western Europe': '西欧',
            'Europe & Central Asia': '欧洲与中亚',
            'North America': '北美',
            'Latin America & Caribbean': '拉丁美洲与加勒比',
            'East Asia & Pacific': '东亚与太平洋',
            'South Asia': '南亚',
            'Middle East & North Africa': '中东与北非',
            'Sub-Saharan Africa': '撒哈拉以南非洲'
        }
    };
    function regionLabel(name) {
        return tLabel(name, (REGION_NAMES.es[name] || name), (REGION_NAMES.zh[name] || name));
    }

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

        // Language change → the section heads and region names are ours
        document.addEventListener('gw:language', () => {
            if (_overlay && _overlay.classList.contains('open')) render();
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
            html += '<div class="cpicker-section-head"><span>' + tLabel('Selection', 'Selección', '已选') + ' (' + selected.length + ')</span><a id="cpicker-clear-all">' + tLabel('Clear', 'Limpiar', '清除') + '</a></div>';
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
            html += '<span class="cpicker-item-name">' + tLabel('World', 'Mundo', '世界') + '</span>';
            html += '<span class="cpicker-item-tag">' + tLabel('Global', 'Global', '全球') + '</span>';
            html += '</div>';
        }

        // === REGIONS ===
        if (!query) {
            html += '<div class="cpicker-section">';
            html += '<div class="cpicker-section-head"><span>' + tLabel('Regions', 'Regiones', '区域') + '</span></div>';
            REGION_ORDER.forEach(regionName => {
                const isos = _regionGroups[regionName] || [];
                if (isos.length === 0) return;
                const allInSelected = isos.every(iso => selected.includes(iso));
                html += '<div class="cpicker-item region" data-region="' + regionName + '">';
                html += '<input type="checkbox" ' + (allInSelected ? 'checked' : '') + '>';
                html += '<span class="cpicker-item-name">' + regionLabel(regionName) + '</span>';
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
                html += '<div class="cpicker-section-head"><span>' + tLabel('All countries', 'Todos los países', '所有国家') + ' (' + _allCountries.length + ')</span></div>';
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
                if (c.region) html += '<span class="cpicker-item-tag">' + regionLabel(c.region) + '</span>';
                html += '</div>';
            });
            html += '</div>';
        } else if (query) {
            html += '<div class="cpicker-empty">' + tLabel('No results for', 'Sin resultados para', '未找到') + ' "' + query + '"</div>';
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
