// ============================================================================
// GLOBE SECTION - Controller for the globe explorer tab
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import { initGlobe, retryGlobe, updateGlobeColors, updateGlobeLegend, flyToCountry } from './globe-renderer.js';
import { initCountryProfile, openProfile, closeProfile, updateProfileYear } from './country-profile.js';
import Timeline from '../components/timeline.js';

let timeline = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initGlobeSection() {
    if (initialized) return;
    initialized = true;

    // Globe
    initGlobe('globe-mount');

    // Country profile side panel
    initCountryProfile();

    // Timeline
    timeline = new Timeline('globe-timeline');

    // Legend (render once, then update on indicator / mode changes)
    updateGlobeLegend();
    updateYearDisplay();

    // ----- Search -----
    const searchInput = document.getElementById('globe-search-input');
    const searchResults = document.getElementById('globe-search-results');

    if (searchInput && searchResults) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            if (query.length < 1) {
                searchResults.classList.remove('visible');
                return;
            }
            const results = DataLoader.searchCountries(query);
            if (results.length === 0) {
                searchResults.classList.remove('visible');
                return;
            }
            searchResults.innerHTML = results.map(r => `
                <div class="search-result-item" data-iso3="${r.iso3}">
                    <span class="search-result-name">${r.name}</span>
                    <span class="search-result-iso">${r.iso3}</span>
                </div>
            `).join('');
            searchResults.classList.add('visible');

            searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const iso3 = item.dataset.iso3;
                    State.addCountry(iso3);
                    flyToCountry(iso3);
                    openProfile(iso3);
                    searchInput.value = '';
                    searchResults.classList.remove('visible');
                });
            });
        });

        searchInput.addEventListener('blur', () => {
            setTimeout(() => searchResults.classList.remove('visible'), 200);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchResults.classList.remove('visible');
                searchInput.blur();
            }
        });
    }

    // ----- Default country profile -----
    flyToCountry('ESP');
    openProfile('ESP');

    // ----- Globe country click -----
    document.addEventListener('globe:countryClick', (e) => {
        const { iso3 } = e.detail;
        flyToCountry(iso3);
        openProfile(iso3);
    });

    // ----- State subscriptions -----

    // Year changes: recolor globe, update profile stats + mini charts, update year badge
    State.subscribe('currentYear', () => {
        updateGlobeColors();
        updateProfileYear();
        updateYearDisplay();
    });

    // Selection changes: update polygon altitudes (highlight)
    State.subscribe('selectedCountries', () => {
        updateGlobeColors();
    });

    // Indicator changes: recolor globe, refresh legend, refresh profile if open
    State.subscribe('indicator', () => {
        updateGlobeColors();
        updateGlobeLegend();
        updateProfileYear();
    });

    // Retry globe when section becomes active (catches cases where init failed)
    State.subscribe('activeSection', (section) => {
        if (section === 'globe') {
            retryGlobe();
        }
    });

}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateYearDisplay() {
    const el = document.getElementById('globe-year-display');
    if (el) el.textContent = State.get('currentYear');
}
