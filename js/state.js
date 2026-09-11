// ============================================================================
// STATE MANAGEMENT - Centralized pub/sub state for cross-section communication
// ============================================================================

const State = (() => {
    const _state = {
        activeSection: 'globe',
        selectedCountries: [],
        selectedRegions: [],
        currentYear: 2022,
        yearRange: [1850, 2022],
        yearFrom: 1850,               // left handle of timeline sub-range
        isPlaying: false,
        playSpeed: 200,
        // Explore
        indicator: 'co2ff_pc',         // effective: ghg, ghg_pc, co2ff, co2ff_pc, gdp_pc, gdp_total, hdi, hdi_ng, pop
        baseIndicator: 'ghg',         // dropdown: ghg, co2ff, gdp, hdi, hdi_ng, pop
        perCapita: true,              // per-capita toggle (for ghg, co2ff, gdp)
        gasType: 'co2ff',             // gas sub-type when ghg selected (legacy, kept for compat)
        selectedGases: ['co2ff'],     // array: ['total'] or ['co2ff','ch4',...] for multi-gas
        // MFA
        popType: 'total',              // 'total' | 'density'
        mfaFlow: 'ext',               // 'ext' | 'con'
        selectedMaterials: ['total'],  // analogous to selectedGases: ['total'] or ['bio','ff',...]
        selectedCrops: ['total'],      // ['total'] or crop component keys for land-use decomposition
        exploreView: 'map',            // map, trend, ranking, table, composition
        facetMode: 'overlay',          // overlay | country | component
        freeYAxis: false,              // false = shared Y scale across facets, true = free
        // Analysis
        analysisMode: 'intensities',   // intensities, drivers, correlations, recessions, tapio
        intensityX: 'gdp_pc',
        intensityY: 'ghg',
        intensityNormalize: false,     // per capita normalization
        // Drivers (Kaya)
        driversPeriod: [1990, 2024],
        driversFacet: 'single', // single | country
        // Correlations (Gapminder)
        correlationX: 'gdp_pc',
        correlationY: 'ghg',
        correlationSize: 'pop',        // pop
        correlationAxisMode: 'fixed',  // fixed | mobile
        correlationScope: 'all',       // all | selected
        correlationTimelapse: false,
        // Recessions
        recessionFreeYAxis: true,      // true = each facet gets its own Y scale
        // What if? (js/whatif/*) — the shell owns these; see WHATIF_DEFAULTS
        whatifMode: 'ahead',           // 'ahead' (2025-2050) | 'behind' (1850-2024)
        whatifG: 0.0232,               // GDP per person, fraction per year  (preset 'recent')
        whatifR: -0.0231,              // CO2 per dollar, fraction per year  (preset 'bau')
        whatifPop: 'medium',           // 'low' | 'medium' | 'high'  (UN WPP 2024)
        whatifTarget: '2.0C',          // '1.5C' | '2.0C' | '3.0C' (derived mark)
        whatifProb: '50%',             // '50%' | '67%' | '83%'
        whatifSolveFor: null,          // null (panel closed) | 'intensity' | 'growth'
        whatifHorizon: 2100,           // 2050 | 2100 (the solver's horizon)
        whatifTail: false,             // Ahead: the faint 2051-2100 tail of the figure
        whatifRegion: 'WLD',           // Behind: WLD CHN EAP ECA LAC MENA NAM SAS SSA WEU GBR
        whatifRef: 'GBR',              // Behind: 'GBR' | 'WLD'
        whatifFrom: 1850,              // Behind: counterfactual start year
        whatifCfMode: 'level',         // Behind: 'rate' | 'level' ('level' pairs with the UK reference, spec 3.6)
        whatifIntensity: 'own',        // Behind: 'own' | 'ref' | 'world'
        // Chart options
        chartType: 'evolution',
        movingAverage: 0,
        showRegression: false,
        showPeriods: false,
        periodLength: 25,
        isFullscreen: false
    };

    const _subscribers = {};

    function _notify(key) {
        if (_subscribers[key]) {
            _subscribers[key].forEach(cb => {
                try { cb(_state[key], key); } catch (e) { console.error('State subscriber error:', e); }
            });
        }
        if (_subscribers['*']) {
            _subscribers['*'].forEach(cb => {
                try { cb(_state[key], key); } catch (e) { console.error('State subscriber error:', e); }
            });
        }
    }

    return {
        get(key) { return _state[key]; },

        set(key, value) {
            if (JSON.stringify(_state[key]) === JSON.stringify(value)) return;
            _state[key] = value;
            _notify(key);
        },

        subscribe(key, callback) {
            if (!_subscribers[key]) _subscribers[key] = [];
            _subscribers[key].push(callback);
            return () => {
                _subscribers[key] = _subscribers[key].filter(cb => cb !== callback);
            };
        },

        addCountry(iso3) {
            const current = [..._state.selectedCountries];
            if (!current.includes(iso3)) {
                current.push(iso3);
                _state.selectedCountries = current;
                _notify('selectedCountries');
            }
        },

        removeCountry(iso3) {
            const current = _state.selectedCountries.filter(c => c !== iso3);
            if (current.length !== _state.selectedCountries.length) {
                _state.selectedCountries = current;
                _notify('selectedCountries');
            }
        },

        toggleCountry(iso3) {
            if (_state.selectedCountries.includes(iso3)) {
                this.removeCountry(iso3);
            } else {
                this.addCountry(iso3);
            }
        },

        clearCountries() {
            if (_state.selectedCountries.length > 0) {
                _state.selectedCountries = [];
                _notify('selectedCountries');
            }
        },

        getSnapshot() {
            return JSON.parse(JSON.stringify(_state));
        }
    };
})();

export default State;
