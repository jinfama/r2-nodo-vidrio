// ============================================================================
// ANALYSIS SECTION - Controller for Intensities, Drivers, Correlations, Recessions
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import { COMPARISON_PALETTE, getColorForIndex } from '../utils.js';
import { initIntensities, updateIntensities, destroyIntensities } from './intensities.js';
import { initDrivers, updateDrivers, destroyDrivers } from './drivers.js';
import { initCorrelations, updateCorrelations, destroyCorrelations } from './correlations.js';
import { initRecessions, updateRecessions, destroyRecessions } from './recessions.js';
import { initTapioView, updateTapioView, destroyTapioView } from '../explore/tapio-view.js';
import Timeline from '../components/timeline.js';

// Country groups for preset buttons
const PRESETS = {
    g7: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'CAN', 'JPN'],
    brics: ['BRA', 'RUS', 'IND', 'CHN', 'ZAF']
};

let _active = false;
let _unsubs = [];
let _timeline = null;

// ---- Sub-tab navigation ----

function bindSubTabs() {
    document.querySelectorAll('[data-analysis]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-analysis');
            State.set('analysisMode', mode);
        });
    });
}

function highlightSubTab(mode) {
    document.querySelectorAll('[data-analysis]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-analysis') === mode);
    });
}

// ---- Country search + chips ----

function bindSearch() {
    const input = document.getElementById('analysis-search');
    const dropdown = document.getElementById('analysis-ac');
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (q.length < 1) { dropdown.innerHTML = ''; dropdown.classList.remove('visible'); return; }
        const results = DataLoader.searchCountries(q);
        if (!results.length) { dropdown.innerHTML = ''; dropdown.classList.remove('visible'); return; }
        dropdown.innerHTML = results.map(m =>
            `<div class="ac-item" data-iso="${m.iso3}">${m.name} <span class="ac-iso">${m.iso3}</span></div>`
        ).join('');
        dropdown.classList.add('visible');
    });

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.ac-item');
        if (!item) return;
        const iso3 = item.dataset.iso;
        State.addCountry(iso3);
        input.value = '';
        dropdown.innerHTML = '';
        dropdown.classList.remove('visible');
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { dropdown.classList.remove('visible'); }, 200);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { dropdown.classList.remove('visible'); input.blur(); }
    });
}

function renderChips() {
    const container = document.getElementById('analysis-chips');
    if (!container) return;
    const countries = State.get('selectedCountries');

    if (countries.length > 18) {
        container.innerHTML = `<span class="chip chip-summary">
            ${countries.length} countries selected
            <button class="chip-remove" data-clear-all="true">&times;</button>
        </span>`;
        const clearBtn = container.querySelector('[data-clear-all="true"]');
        if (clearBtn) clearBtn.addEventListener('click', () => State.clearCountries());
        return;
    }

    container.innerHTML = countries.map((iso3, i) => {
        const meta = DataLoader.getMetadata(iso3);
        const name = meta ? meta.name : iso3;
        const color = getColorForIndex(i);
        return `<span class="chip">
            <span class="chip-color" style="background:${color}"></span>
            ${name}
            <button class="chip-remove" data-iso="${iso3}">&times;</button>
        </span>`;
    }).join('');

    container.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', () => State.removeCountry(btn.dataset.iso));
    });
}

// ---- Preset buttons ----

function bindPresets() {
    const g7Btn = document.getElementById('analysis-preset-g7');
    const bricsBtn = document.getElementById('analysis-preset-brics');
    const clearBtn = document.getElementById('analysis-preset-clear');

    if (g7Btn) g7Btn.addEventListener('click', () => {
        State.clearCountries();
        PRESETS.g7.forEach(iso => State.addCountry(iso));
    });
    if (bricsBtn) bricsBtn.addEventListener('click', () => {
        State.clearCountries();
        PRESETS.brics.forEach(iso => State.addCountry(iso));
    });
    if (clearBtn) clearBtn.addEventListener('click', () => State.clearCountries());
}

// ---- Mode switching ----

function switchMode(mode) {
    // Tear down previous mode
    destroyIntensities();
    destroyDrivers();
    destroyCorrelations();
    destroyRecessions();
    destroyTapioView();

    highlightSubTab(mode);
    showModeControls(mode);

    // Initialize the active mode
    switch (mode) {
        case 'intensities':  initIntensities();  break;
        case 'drivers':      initDrivers();      break;
        case 'correlations': initCorrelations();  break;
        case 'recessions':   initRecessions();    break;
        case 'tapio':        initTapioView();     break;
    }

    refresh();
}

function showModeControls(mode) {
    const optionsBar = document.getElementById('analysis-options');
    if (!optionsBar) return;

    // Hide all mode-specific control groups, show the active one
    optionsBar.querySelectorAll('[data-mode-controls]').forEach(el => {
        el.style.display = el.getAttribute('data-mode-controls') === mode ? 'contents' : 'none';
    });

    const timelineEl = document.getElementById('analysis-timeline');
    if (timelineEl) timelineEl.style.display = mode === 'drivers' ? 'none' : '';
    if (mode === 'drivers' && State.get('isPlaying')) {
        State.set('isPlaying', false);
    }
}

function refresh() {
    const mode = State.get('analysisMode');
    switch (mode) {
        case 'intensities':  updateIntensities();  break;
        case 'drivers':      updateDrivers();      break;
        case 'correlations': updateCorrelations();  break;
        case 'recessions':   updateRecessions();    break;
        case 'tapio':        updateTapioView();     break;
    }
}

// ---- Lifecycle ----

export function initAnalysisSection() {
    _active = true;

    bindSubTabs();
    bindSearch();
    bindPresets();

    // Timeline
    _timeline = new Timeline('analysis-timeline');

    // Subscribe to state changes
    _unsubs.push(State.subscribe('analysisMode', (mode) => switchMode(mode)));
    _unsubs.push(State.subscribe('selectedCountries', () => { renderChips(); refresh(); }));
    _unsubs.push(State.subscribe('currentYear', () => {
        if (State.get('analysisMode') !== 'drivers') refresh();
    }));
    // Re-initialize current view when section becomes active (fixes dimensions after hidden init)
    _unsubs.push(State.subscribe('activeSection', (section) => {
        if (section === 'analysis') {
            // Small delay to let CSS layout complete before measuring dimensions
            requestAnimationFrame(() => switchMode(State.get('analysisMode')));
        }
    }));

    // Initial render
    renderChips();
    switchMode(State.get('analysisMode'));
}

export function destroyAnalysisSection() {
    _active = false;
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    if (_timeline) { _timeline.destroy(); _timeline = null; }
    destroyIntensities();
    destroyDrivers();
    destroyCorrelations();
    destroyRecessions();
    destroyTapioView();
}
