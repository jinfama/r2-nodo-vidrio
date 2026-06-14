// ============================================================================
// EXPLORE SECTION - Controller for the Explore tab with sub-views
// (Map, Trend, Ranking, Table, Composition)
// ============================================================================

import State from '../state.js';
import DataLoader from '../data-loader.js';
import { initChoropleth, updateChoropleth, highlightCountries, setDualMap, setYearFrom, isDual } from './choropleth.js';
import { initTrendView, updateTrendView, updateTrendYearMarker, destroyTrendView } from './trend-view.js';

import { initRankingView, updateRankingView, destroyRankingView } from './ranking-view.js';
import { initTableView, updateTableView } from './table-view.js';
import { initCompositionView, updateCompositionView } from './composition-view.js';
import Timeline from '../components/timeline.js';
import { getColorForIndex, getEffectiveIndicator, INDICATOR_LABELS,
         MFA_FLOW_LABELS, MFA_MATERIAL_KEYS, MFA_MATERIAL_LABELS, MFA_MATERIAL_COLORS,
         CROPS_COMPONENT_KEYS, CROPS_COMPONENT_LABELS, CROPS_COMPONENT_COLORS } from '../utils.js';

let timeline = null;
let initialized = false;

// ---- Preset groups ----
const G7 = ['USA', 'GBR', 'DEU', 'FRA', 'JPN', 'ITA', 'CAN'];
const BRICS = ['BRA', 'RUS', 'IND', 'CHN', 'ZAF'];
const TOP_EMITTERS = ['CHN', 'USA', 'IND', 'RUS', 'JPN', 'DEU', 'IRN', 'KOR', 'SAU', 'IDN'];

// Base indicators that support per-capita toggle
const PER_CAPITA_INDICATORS = new Set(['ghg', 'gdp', 'mfa', 'crops']);

// Module-level references (set during init, used by activateView/updateControlsUI)
let totalBtn = null, pcBtn = null, hdiConvBtn = null, hdiAugBtn = null, facetGroup = null;

// ============================================================================
// updateControlsUI - show/hide right panel sections by indicator
// ============================================================================
function updateControlsUI() {
    const base = State.get('baseIndicator');
    const view = State.get('exploreView');
    const isRanking = view === 'ranking';

    const rpPercapita = document.getElementById('right-panel-percapita');
    const rpGhgOpts = document.getElementById('right-panel-ghg-opts');
    const rpMfaOpts = document.getElementById('right-panel-mfa-opts');
    const rpHdiOpts = document.getElementById('right-panel-hdi-opts');
    const rpCropsOpts = document.getElementById('right-panel-crops-opts');
    const rpBioOpts = document.getElementById('right-panel-bio-opts');

    const isComposition = view === 'composition';
    // Per-capita: hide for ranking (has own indicator select) and composition
    // (composition always shows total decomposition by component)
    if (rpPercapita) rpPercapita.style.display =
        (!isRanking && !isComposition && PER_CAPITA_INDICATORS.has(base)) ? '' : 'none';
    // GHG gas type: hide for ranking and composition (composition always decomposes all gases)
    if (rpGhgOpts) rpGhgOpts.style.display =
        (!isRanking && !isComposition && base === 'ghg') ? '' : 'none';
    // MFA: flow selector is relevant for composition (picks ext/con), but material checkboxes
    // are only relevant for trend (composition always shows all materials).
    // We keep the whole MFA opts panel visible since the flow select is inside it.
    if (rpMfaOpts) rpMfaOpts.style.display =
        (!isRanking && base === 'mfa') ? '' : 'none';
    if (rpHdiOpts) rpHdiOpts.style.display =
        (!isRanking && (base === 'hdi' || base === 'hdi_ng')) ? '' : 'none';
    // Crops land-type controls are useful in trend and composition.
    if (rpCropsOpts) rpCropsOpts.style.display =
        (!isRanking && base === 'crops') ? '' : 'none';
    if (rpBioOpts) rpBioOpts.style.display =
        (!isRanking && base === 'bio') ? '' : 'none';

    const rpPopOpts = document.getElementById('right-panel-pop-opts');
    if (rpPopOpts) rpPopOpts.style.display =
        (!isRanking && base === 'pop') ? '' : 'none';

    // MFA material checkboxes: hide in composition view (always shows all materials)
    const matChecks = document.getElementById('mfa-material-checks');
    if (matChecks) matChecks.style.display = isComposition ? 'none' : '';

    if (totalBtn) totalBtn.classList.toggle('active', !State.get('perCapita'));
    if (pcBtn) pcBtn.classList.toggle('active', State.get('perCapita'));
    if (hdiConvBtn) hdiConvBtn.classList.toggle('active', base === 'hdi');
    if (hdiAugBtn) hdiAugBtn.classList.toggle('active', base === 'hdi_ng');

    document.querySelectorAll('.sidebar-tile[data-indicator]').forEach(t => {
        const tileInd = t.dataset.indicator;
        t.classList.toggle('active', tileInd === base || (tileInd === 'hdi' && base === 'hdi_ng'));
    });

    if (facetGroup) {
        const fm = State.get('facetMode');
        facetGroup.querySelectorAll('[data-facet]').forEach(b => {
            b.classList.toggle('active', b.dataset.facet === fm);
            if (b.dataset.facet === 'component') {
                b.style.display = (base === 'ghg' || base === 'mfa' || base === 'crops') ? '' : 'none';
            }
        });
        if (fm === 'component' && base !== 'ghg' && base !== 'mfa' && base !== 'crops') {
            State.set('facetMode', 'overlay');
        }
    }

    const rpChartSettings = document.getElementById('right-panel-chart-settings');
    if (rpChartSettings) {
        rpChartSettings.style.display = (view === 'trend' || view === 'composition') ? '' : 'none';
    }

    // Map compare: only in map view
    const rpMapCompare = document.getElementById('rp-row-map-compare');
    if (rpMapCompare) rpMapCompare.style.display = (view === 'map') ? '' : 'none';

    const valueModeSelect = document.getElementById('trend-value-mode');
    if (valueModeSelect) {
        // Non-additive indicators: % of world / % of group don't make sense
        const isNonAdditive = base === 'hdi' || base === 'hdi_ng' || base === 'bio';
        valueModeSelect.querySelectorAll('option').forEach(opt => {
            if (opt.value === 'pctWorld' || opt.value === 'pctGroup') {
                opt.disabled = isNonAdditive;
                opt.style.display = isNonAdditive ? 'none' : '';
            }
        });
        if (isNonAdditive && (valueModeSelect.value === 'pctWorld' || valueModeSelect.value === 'pctGroup')) {
            valueModeSelect.value = 'abs';
            valueModeSelect.dispatchEvent(new Event('change'));
        }
    }

    const rankIndEl = document.getElementById('ranking-indicator-group');
    const rankScopeEl = document.getElementById('ranking-scope-group');
    const rankCountEl = document.getElementById('ranking-count-group');
    if (rankIndEl) rankIndEl.style.display = isRanking ? '' : 'none';
    if (rankScopeEl) rankScopeEl.style.display = isRanking ? '' : 'none';
    if (rankCountEl) rankCountEl.style.display = isRanking ? '' : 'none';

    // Hide Countries section in map view (countries are selected via map click)
    const rpCountries = document.getElementById('right-panel-countries');
    if (rpCountries) rpCountries.style.display = (view === 'map') ? 'none' : '';

    // Hide Draw/Values/Scale/Y-axis rows in composition view (only Panels and Unit are relevant)
    const drawRow = document.getElementById('rp-row-draw');
    const valuesRow = document.getElementById('rp-row-values');
    const scaleRow = document.getElementById('rp-row-scale');
    const yaxisRow = document.getElementById('right-panel-yaxis-row');
    if (view === 'composition') {
        if (drawRow) drawRow.style.display = 'none';
        if (valuesRow) valuesRow.style.display = 'none';
        if (scaleRow) scaleRow.style.display = 'none';
        if (yaxisRow) yaxisRow.style.display = 'none';
    } else {
        if (drawRow) drawRow.style.display = '';
        if (valuesRow) valuesRow.style.display = '';
        if (scaleRow) scaleRow.style.display = '';
        // yaxisRow visibility is handled by facet toggle logic
    }
}

// ============================================================================
// syncEffectiveIndicator
// ============================================================================
function syncEffectiveIndicator() {
    const base = State.get('baseIndicator');
    const pc = State.get('perCapita');
    const gasType = State.get('gasType');
    // Crops sub-type override: if a specific sub-field is selected, use it directly
    if (base === 'crops') {
        const selectedCrops = State.get('selectedCrops') || ['total'];
        if (selectedCrops.length === 1 && selectedCrops[0] !== 'total') {
            State.set('indicator', selectedCrops[0]);
            return;
        }
    }
    // MFA material sub-type override: when a single non-total material is selected, use it directly
    if (base === 'mfa') {
        const flow = State.get('mfaFlow') || 'ext';
        const mats = State.get('selectedMaterials') || ['total'];
        if (mats.length === 1 && mats[0] !== 'total') {
            State.set('indicator', `mfa_${flow}_${mats[0]}`);
            return;
        }
    }
    const effective = getEffectiveIndicator(base, pc, gasType, (key) => State.get(key));
    State.set('indicator', effective);
}

function initRightPanelResize() {
    const panel = document.getElementById('explore-right-panel');
    const handle = document.getElementById('right-panel-resizer');
    if (!panel || !handle) return;

    const storageKey = 'cascorro.exploreRightPanelWidth';
    const clampWidth = (width) => {
        const maxWidth = Math.min(460, Math.max(260, Math.floor(window.innerWidth * 0.45)));
        return Math.max(220, Math.min(maxWidth, width));
    };
    const applyWidth = (width) => {
        panel.style.setProperty('--explore-right-panel-width', clampWidth(width) + 'px');
    };

    try {
        const saved = parseInt(localStorage.getItem(storageKey), 10);
        if (!Number.isNaN(saved)) applyWidth(saved);
    } catch (e) {
        // Ignore storage errors in privacy-restricted contexts.
    }

    let startX = 0;
    let startWidth = 0;

    const finishDrag = () => {
        document.removeEventListener('pointermove', onDrag);
        document.removeEventListener('pointerup', finishDrag);
        document.body.classList.remove('resizing-right-panel');
        handle.classList.remove('dragging');
        const width = panel.getBoundingClientRect().width;
        try { localStorage.setItem(storageKey, String(Math.round(width))); } catch (e) {}
        window.dispatchEvent(new Event('resize'));
        redrawCurrentView();
    };

    const onDrag = (event) => {
        const nextWidth = startWidth - (event.clientX - startX);
        applyWidth(nextWidth);
    };

    handle.addEventListener('pointerdown', (event) => {
        if (window.innerWidth <= 900) return;
        event.preventDefault();
        startX = event.clientX;
        startWidth = panel.getBoundingClientRect().width;
        document.body.classList.add('resizing-right-panel');
        handle.classList.add('dragging');
        document.addEventListener('pointermove', onDrag);
        document.addEventListener('pointerup', finishDrag);
    });

    window.addEventListener('resize', () => {
        const width = panel.getBoundingClientRect().width;
        if (width > 0) applyWidth(width);
    });
}

export function initExploreSection() {
    if (initialized) return;
    initialized = true;

    // ---- Sub-tab switching ----
    document.querySelectorAll('#section-explore [data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            State.set('exploreView', btn.dataset.view);
        });
    });

    // ================================================================
    // LEFT SIDEBAR - Indicator tiles
    // ================================================================
    document.querySelectorAll('.sidebar-tile[data-indicator]').forEach(tile => {
        tile.addEventListener('click', () => {
            const base = tile.dataset.indicator;
            // Update active class
            document.querySelectorAll('.sidebar-tile[data-indicator]').forEach(t => t.classList.remove('active'));
            tile.classList.add('active');
            // Set state
            State.set('baseIndicator', base);
            // Reset per-capita and sub-indicator selections when switching
            State.set('perCapita', false);
            if (base === 'ghg') {
                State.set('gasType', 'co2ff');
                State.set('selectedGases', ['co2ff']);
                updateGasCheckUI(['co2ff']);
            } else if (base === 'mfa') {
                State.set('mfaFlow', 'ext');
                State.set('selectedMaterials', ['total']);
                updateMatCheckUI(['total']);
            } else if (base === 'crops') {
                State.set('selectedCrops', ['total']);
                updateCropCheckUI(['total']);
            }
            updateControlsUI();
            syncEffectiveIndicator();
        });
    });

    // ================================================================
    // RIGHT PANEL - Per-capita toggle
    // ================================================================
    initRightPanelResize();

    totalBtn = document.getElementById('explore-total-btn');
    pcBtn = document.getElementById('explore-percapita-btn');

    if (totalBtn) totalBtn.addEventListener('click', () => {
        totalBtn.classList.add('active');
        if (pcBtn) pcBtn.classList.remove('active');
        State.set('perCapita', false);
        syncEffectiveIndicator();
    });
    if (pcBtn) pcBtn.addEventListener('click', () => {
        pcBtn.classList.add('active');
        if (totalBtn) totalBtn.classList.remove('active');
        State.set('perCapita', true);
        syncEffectiveIndicator();
    });

    // ================================================================
    // RIGHT PANEL - GHG gas type dropdown (presets + checkboxes)
    // ================================================================
    const gasChecksEl = document.getElementById('explore-gastype-checks');
    const gasDropdownBtn = document.getElementById('gas-dropdown-toggle');

    // Preset definitions: name -> gases array
    const GAS_PRESETS = {
        co2_total:   { gases: ['co2ff'],                                    label: 'Total CO\u2082' },
        total:       { gases: ['total'],                                    label: 'Total GHG' },
        co2_decomp:  { gases: ['coal', 'oil', 'gas', 'co2luc'],            label: 'CO\u2082 decomposed' },
        ghg_decomp:  { gases: ['co2ff', 'co2luc', 'ch4', 'n2o', 'fgas'],  label: 'GHG decomposed' }
    };

    const GAS_LABELS = {
        total: 'Total', co2ff: 'CO\u2082 fossil', co2luc: 'CO\u2082 land',
        ch4: 'CH\u2084', n2o: 'N\u2082O', fgas: 'F-gas',
        coal: 'Coal CO\u2082', oil: 'Oil CO\u2082', gas: 'Gas CO\u2082'
    };

    if (gasChecksEl && gasDropdownBtn) {
        // Toggle dropdown open/close
        gasDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            gasChecksEl.classList.toggle('open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!gasChecksEl.contains(e.target)) {
                gasChecksEl.classList.remove('open');
            }
        });

        // Preset click handlers
        gasChecksEl.querySelectorAll('.gas-preset').forEach(el => {
            el.addEventListener('click', () => {
                const preset = GAS_PRESETS[el.dataset.preset];
                if (!preset) return;
                const selected = [...preset.gases];
                State.set('selectedGases', selected);
                State.set('gasType', selected.length === 1 ? selected[0] : 'total');
                updateGasCheckUI(selected);
                syncEffectiveIndicator();
            });
        });

        // Individual checkbox logic
        gasChecksEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const gas = cb.value;
                const view = State.get('exploreView');
                const multiAllowed = (view === 'trend' || view === 'composition');

                let selected;
                if (multiAllowed) {
                    selected = [...State.get('selectedGases')].filter(g => g !== 'total');
                    if (cb.checked) {
                        if (!selected.includes(gas)) selected.push(gas);
                    } else {
                        selected = selected.filter(g => g !== gas);
                    }
                    if (selected.length === 0) selected = ['total'];
                } else {
                    // Single select for map, ranking, table
                    selected = cb.checked ? [gas] : ['co2ff'];
                }

                State.set('selectedGases', selected);
                State.set('gasType', selected.length === 1 ? selected[0] : 'total');
                updateGasCheckUI(selected);
                syncEffectiveIndicator();
            });
        });
    }

    function getActiveGasPreset(selected) {
        for (const [key, preset] of Object.entries(GAS_PRESETS)) {
            if (selected.length === preset.gases.length &&
                preset.gases.every(g => selected.includes(g))) {
                return key;
            }
        }
        return null;
    }

    function updateGasCheckUI(selected) {
        if (!gasChecksEl) return;
        const activePreset = getActiveGasPreset(selected);

        // Update preset highlights
        gasChecksEl.querySelectorAll('.gas-preset').forEach(el => {
            el.classList.toggle('active', el.dataset.preset === activePreset);
        });

        // Update individual checkboxes
        gasChecksEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = selected.includes(cb.value);
        });

        // Update button label
        if (gasDropdownBtn) {
            if (activePreset) {
                gasDropdownBtn.textContent = GAS_PRESETS[activePreset].label;
            } else {
                gasDropdownBtn.textContent = selected.map(g => GAS_LABELS[g] || g).join(', ');
            }
        }
    }

    // ================================================================
    // RIGHT PANEL - MFA controls (flow select + material checkboxes)
    // ================================================================
    const mfaFlowSelect = document.getElementById('mfa-flow-select');
    const matChecksEl = document.getElementById('mfa-material-checks');

    const MAT_PRESETS = {
        total:      { mats: ['total'],                      label: 'Total' },
        decomposed: { mats: ['bio', 'ff', 'met', 'min'],   label: 'All decomposed' }
    };

    if (mfaFlowSelect) {
        // Sync to state default
        mfaFlowSelect.value = State.get('mfaFlow') || 'ext';

        mfaFlowSelect.addEventListener('change', () => {
            State.set('mfaFlow', mfaFlowSelect.value);
            syncEffectiveIndicator();
        });
    }

    if (matChecksEl) {
        // Preset click handlers
        matChecksEl.querySelectorAll('[data-mat-preset]').forEach(el => {
            el.addEventListener('click', () => {
                const preset = MAT_PRESETS[el.dataset.matPreset];
                if (!preset) return;
                const selected = [...preset.mats];
                State.set('selectedMaterials', selected);
                updateMatCheckUI(selected);
                syncEffectiveIndicator();
            });
        });

        // Individual checkbox logic
        matChecksEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const mat = cb.value;
                const view = State.get('exploreView');
                const multiAllowed = (view === 'trend' || view === 'composition');

                let selected;
                if (multiAllowed) {
                    selected = [...State.get('selectedMaterials')].filter(m => m !== 'total');
                    if (cb.checked) {
                        if (!selected.includes(mat)) selected.push(mat);
                    } else {
                        selected = selected.filter(m => m !== mat);
                    }
                    if (selected.length === 0) selected = ['total'];
                } else {
                    // Single select for map, ranking, table
                    selected = cb.checked ? [mat] : ['total'];
                }

                State.set('selectedMaterials', selected);
                updateMatCheckUI(selected);
                syncEffectiveIndicator();
            });
        });
    }

    function getActiveMatPreset(selected) {
        for (const [key, preset] of Object.entries(MAT_PRESETS)) {
            if (selected.length === preset.mats.length &&
                preset.mats.every(m => selected.includes(m))) {
                return key;
            }
        }
        return null;
    }

    function updateMatCheckUI(selected) {
        if (!matChecksEl) return;
        const activePreset = getActiveMatPreset(selected);

        // Update preset highlights
        matChecksEl.querySelectorAll('[data-mat-preset]').forEach(el => {
            el.classList.toggle('active', el.dataset.matPreset === activePreset);
        });

        // Update individual checkboxes
        matChecksEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = selected.includes(cb.value);
        });
    }

    // ================================================================
    // RIGHT PANEL - Crops / land type controls
    // ================================================================
    const cropChecksEl = document.getElementById('crops-landtype-checks');
    const CROP_PRESETS = {
        total: { crops: ['total'], label: 'Total agricultural area' },
        decomposed: { crops: CROPS_COMPONENT_KEYS, label: 'All decomposed' }
    };

    if (cropChecksEl) {
        cropChecksEl.querySelectorAll('[data-crop-preset]').forEach(el => {
            el.addEventListener('click', () => {
                const preset = CROP_PRESETS[el.dataset.cropPreset];
                if (!preset) return;
                const selected = [...preset.crops];
                State.set('selectedCrops', selected);
                updateCropCheckUI(selected);
                syncEffectiveIndicator();
            });
        });

        cropChecksEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const crop = cb.value;
                const view = State.get('exploreView');
                const multiAllowed = (view === 'trend' || view === 'composition');
                let selected;
                if (multiAllowed) {
                    selected = [...(State.get('selectedCrops') || ['total'])].filter(c => c !== 'total');
                    if (cb.checked) {
                        if (!selected.includes(crop)) selected.push(crop);
                    } else {
                        selected = selected.filter(c => c !== crop);
                    }
                    if (selected.length === 0) selected = ['total'];
                } else {
                    selected = cb.checked ? [crop] : ['total'];
                }
                State.set('selectedCrops', selected);
                updateCropCheckUI(selected);
                syncEffectiveIndicator();
            });
        });
    }

    function getActiveCropPreset(selected) {
        for (const [key, preset] of Object.entries(CROP_PRESETS)) {
            if (selected.length === preset.crops.length &&
                preset.crops.every(c => selected.includes(c))) {
                return key;
            }
        }
        return null;
    }

    function updateCropCheckUI(selected) {
        if (!cropChecksEl) return;
        const activePreset = getActiveCropPreset(selected);
        cropChecksEl.querySelectorAll('[data-crop-preset]').forEach(el => {
            el.classList.toggle('active', el.dataset.cropPreset === activePreset);
        });
        cropChecksEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = selected.includes(cb.value);
        });
    }

    // ================================================================
    // RIGHT PANEL - HDI sub-toggle (conventional / augmented)
    // ================================================================
    hdiConvBtn = document.getElementById('explore-hdi-conv');
    hdiAugBtn = document.getElementById('explore-hdi-aug');

    if (hdiConvBtn) hdiConvBtn.addEventListener('click', () => {
        hdiConvBtn.classList.add('active');
        if (hdiAugBtn) hdiAugBtn.classList.remove('active');
        State.set('baseIndicator', 'hdi');
        syncEffectiveIndicator();
    });
    if (hdiAugBtn) hdiAugBtn.addEventListener('click', () => {
        hdiAugBtn.classList.add('active');
        if (hdiConvBtn) hdiConvBtn.classList.remove('active');
        State.set('baseIndicator', 'hdi_ng');
        syncEffectiveIndicator();
    });

    // ================================================================
    // RIGHT PANEL - Population type (total / density)
    // ================================================================
    const popTotalBtn = document.getElementById('pop-type-total');
    const popDensityBtn = document.getElementById('pop-type-density');
    if (popTotalBtn) popTotalBtn.addEventListener('click', () => {
        popTotalBtn.classList.add('active');
        if (popDensityBtn) popDensityBtn.classList.remove('active');
        State.set('popType', 'total');
        syncEffectiveIndicator();
    });
    if (popDensityBtn) popDensityBtn.addEventListener('click', () => {
        popDensityBtn.classList.add('active');
        if (popTotalBtn) popTotalBtn.classList.remove('active');
        State.set('popType', 'density');
        syncEffectiveIndicator();
    });

    // ================================================================
    // RIGHT PANEL - Country list
    // ================================================================
    populateCountryList();
    wireCountrySearch();
    wireCountryPresets();

    // ================================================================
    // RIGHT PANEL - Collapsible sections (generic handler)
    // ================================================================
    document.querySelectorAll('.rp-collapsible').forEach(head => {
        const bodyId = head.dataset.target;
        const body = document.getElementById(bodyId);
        const arrow = head.querySelector('.rp-arrow');
        if (head && body) {
            head.addEventListener('click', () => {
                const hidden = body.style.display === 'none';
                body.style.display = hidden ? '' : 'none';
                if (arrow) arrow.style.transform = hidden ? '' : 'rotate(-90deg)';
            });
        }
    });

    // ================================================================
    // RIGHT PANEL - Panels / Facet toggle
    // ================================================================
    facetGroup = document.getElementById('explore-panels-group');
    if (facetGroup) {
        facetGroup.querySelectorAll('[data-facet]').forEach(btn => {
            btn.addEventListener('click', () => {
                facetGroup.querySelectorAll('[data-facet]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.set('facetMode', btn.dataset.facet);
                // Show Y-axis row when faceting
                const yRow = document.getElementById('right-panel-yaxis-row');
                if (yRow) yRow.style.display = (btn.dataset.facet !== 'overlay') ? '' : 'none';
            });
        });
    }

    // Y-axis shared/free toggle
    const yaxisGroup = document.getElementById('explore-yaxis-group');
    if (yaxisGroup) {
        yaxisGroup.querySelectorAll('[data-yaxis]').forEach(btn => {
            btn.addEventListener('click', () => {
                yaxisGroup.querySelectorAll('[data-yaxis]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.set('freeYAxis', btn.dataset.yaxis === 'free');
            });
        });
    }

    // Keep old trend presets if they still exist
    bindPreset('trend-preset-g7', G7);
    bindPreset('trend-preset-brics', BRICS);
    const trendClearBtn = document.getElementById('trend-preset-clear');
    if (trendClearBtn) trendClearBtn.addEventListener('click', () => State.clearCountries());

    // ---- Initialize sub-views ----
    initChoropleth();
    initTrendView();
    initCompositionView();
    initRankingView();
    initTableView();

    // ---- Timeline ----
    timeline = new Timeline('explore-timeline');

    // ---- Map count buttons (dual map) ----
    const mapCount1 = document.getElementById('map-count-1');
    const mapCount2 = document.getElementById('map-count-2');

    if (mapCount1) mapCount1.addEventListener('click', () => {
        mapCount1.classList.add('active');
        if (mapCount2) mapCount2.classList.remove('active');
        setDualMap(false);
        if (timeline) timeline.setDualMode(false);
    });
    if (mapCount2) mapCount2.addEventListener('click', () => {
        mapCount2.classList.add('active');
        if (mapCount1) mapCount1.classList.remove('active');
        const dualStart = State.get('yearRange')[0];
        setDualMap(true, dualStart);
        if (timeline) timeline.setDualMode(true, dualStart, (fromYear) => {
            setYearFrom(fromYear);
        });
    });

    // ---- Indicator -> data field mapping for year-range detection ----
    const INDICATOR_DATA_FIELD = {
        ghg: 'ghg', ghg_pc: 'ghg', co2ff: 'co2ff', co2ff_pc: 'co2ff',
        ch4: 'ch4', ch4_pc: 'ch4', n2o: 'n2o', n2o_pc: 'n2o',
        gdp_pc: 'gdp_pc', gdp_total: 'gdp_pc', hdi: 'hdi', hdi_ng: 'hdi_ng', pop: 'pop',
        mfa_ext_tot: 'mfa_ext_tot', mfa_con_tot: 'mfa_con_tot',
        mfa_imp_tot: 'mfa_imp_tot', mfa_exp_tot: 'mfa_exp_tot', mfa_bal_tot: 'mfa_imp_tot', mfa_mf_tot: 'mfa_mf_tot',
        mfa_ext_pc: 'mfa_ext_tot', mfa_con_pc: 'mfa_con_tot',
        mfa_imp_pc: 'mfa_imp_tot', mfa_exp_pc: 'mfa_exp_tot', mfa_bal_pc: 'mfa_imp_tot', mfa_mf_pc: 'mfa_mf_tot',
        mfa_bal_bio: 'mfa_imp_bio', mfa_bal_ff: 'mfa_imp_ff',
        mfa_bal_met: 'mfa_imp_met', mfa_bal_min: 'mfa_imp_min',
        crop_total: 'crop_cropland', crop_total_pc: 'crop_cropland',
        crop_cropland: 'crop_cropland', crop_arable: 'crop_arable',
        crop_permanent: 'crop_permanent', crop_pastures: 'crop_pastures',
        rli: 'rli',
        pop_density: 'pop_density'
    };
    const fullYearRange = DataLoader.getYearRange() || [1850, 2022];

    function adjustYearRangeForIndicator() {
        const ind = State.get('indicator');
        const field = INDICATOR_DATA_FIELD[ind] || ind;
        const selectedCountries = State.get('selectedCountries') || [];
        const view = State.get('exploreView');
        const scopeCountries = (view === 'trend' || view === 'composition') ? selectedCountries : [];
        const extent = DataLoader.getYearExtentForField(field, scopeCountries);
        const firstYear = extent ? extent[0] : DataLoader.getFirstYearForField(field);
        const lastYear = extent ? extent[1] : DataLoader.getLastYearForField(field);
        const newMin = Math.max(firstYear, fullYearRange[0]);
        const newMax = Math.min(lastYear, fullYearRange[1]);
        const current = State.get('yearRange');
        if (current[0] !== newMin || current[1] !== newMax) {
            State.set('yearRange', [newMin, newMax]);
            State.set('yearFrom', newMin);
            // Clamp currentYear if needed
            const cy = State.get('currentYear');
            if (cy < newMin) State.set('currentYear', newMin);
            if (cy > newMax) State.set('currentYear', newMax);
        }
    }

    // ---- State subscriptions ----
    State.subscribe('exploreView', () => {
        adjustYearRangeForIndicator();
        activateView();
    });
    State.subscribe('currentYear', () => onYearChange());
    State.subscribe('indicator', () => {
        adjustYearRangeForIndicator();
        updateControlsUI();
        redrawCurrentView();
    });
    State.subscribe('selectedCountries', () => {
        updateChips();
        syncCountryListUI();
        adjustYearRangeForIndicator();
        redrawCurrentView();
    });
    State.subscribe('yearRange', () => redrawCurrentView());
    State.subscribe('yearFrom', () => redrawCurrentView());
    State.subscribe('facetMode', () => redrawCurrentView());
    State.subscribe('selectedGases', () => redrawCurrentView());
    State.subscribe('mfaFlow', () => redrawCurrentView());
    State.subscribe('selectedMaterials', () => redrawCurrentView());
    State.subscribe('selectedCrops', () => redrawCurrentView());
    State.subscribe('freeYAxis', () => redrawCurrentView());

    // ---- Initial draw ----
    adjustYearRangeForIndicator();
    updateControlsUI();
    activateView();
    updateChips();
    syncCountryListUI();
}

// ============================================================================
// Sub-view activation
// ============================================================================

function activateView() {
    const view = State.get('exploreView');

    // Update sub-tab buttons
    document.querySelectorAll('#section-explore [data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide panels
    const panels = {
        map: document.getElementById('explore-view-map'),
        trend: document.getElementById('explore-view-trend'),
        ranking: document.getElementById('explore-view-ranking'),
        table: document.getElementById('explore-view-table'),
        composition: document.getElementById('explore-view-composition')
    };

    Object.entries(panels).forEach(([key, el]) => {
        if (el) el.style.display = key === view ? 'flex' : 'none';
    });

    // Chips bar: show for all views except map when countries are selected
    updateChips();

    // Map-only controls
    const mapCountGroup = document.getElementById('explore-map-count-group');
    if (mapCountGroup) mapCountGroup.style.display = view === 'map' ? '' : 'none';

    // Enable dual-handle timeline for all explore views (Maddison-style range sub-selection)
    if (timeline) {
        if (view === 'map' && !isDual()) {
            timeline.setDualMode(false);
        } else {
            const fromYear = view === 'map' ? timeline.getFromYear() : State.get('yearFrom');
            timeline.setDualMode(true, fromYear, (yr) => {
                if (view === 'map') {
                    setYearFrom(yr);
                } else {
                    State.set('yearFrom', yr);
                }
            });
        }
    }

    // Update controls UI (handles chart settings visibility per view)
    updateControlsUI();

    // Ranking controls: show only in ranking
    const rankIndEl = document.getElementById('ranking-indicator-group');
    const rankScopeEl = document.getElementById('ranking-scope-group');
    const rankCountEl = document.getElementById('ranking-count-group');
    if (rankIndEl) rankIndEl.style.display = (view === 'ranking') ? '' : 'none';
    if (rankScopeEl) rankScopeEl.style.display = (view === 'ranking') ? '' : 'none';
    if (rankCountEl) rankCountEl.style.display = (view === 'ranking') ? '' : 'none';

    // Delay redraw slightly to let CSS layout compute after display changes
    requestAnimationFrame(() => redrawCurrentView());
}

function onYearChange() {
    const view = State.get('exploreView');
    if (view === 'map') {
        updateChoropleth();
    } else if (view === 'trend') {
        updateTrendYearMarker();
    } else if (view === 'ranking') {
        updateRankingView();
    } else if (view === 'table') {
        updateTableView();
    } else if (view === 'composition') {
        updateCompositionView();
    }
}

function redrawCurrentView() {
    const view = State.get('exploreView');
    switch (view) {
        case 'map':
            updateChoropleth();
            highlightCountries();
            break;
        case 'trend':
            updateTrendView();
            break;
        case 'ranking':
            updateRankingView();
            break;
        case 'table':
            updateTableView();
            break;
        case 'composition':
            updateCompositionView();
            break;
    }
}

// ============================================================================
// Country chips (trend + ranking toolbars only)
// ============================================================================

function updateChips() {
    const countries = State.get('selectedCountries');
    const view = State.get('exploreView');
    const chipsBar = document.getElementById('explore-chips-bar');
    const chipsEl = document.getElementById('explore-chips');

    // Show chips bar for all views except map, when countries are selected
    if (chipsBar) {
        chipsBar.style.display = (view !== 'map' && countries.length > 0) ? '' : 'none';
    }

    if (!chipsEl) return;

    if (countries.length === 0) {
        chipsEl.innerHTML = '';
        return;
    }

    if (countries.length > 30) {
        chipsEl.innerHTML = `<span class="chip">
            ${countries.length} countries
            <span class="chip-remove" data-clear="true">&times;</span>
        </span>`;
        const clear = chipsEl.querySelector('[data-clear]');
        if (clear) clear.addEventListener('click', () => State.clearCountries());
        return;
    }

    chipsEl.innerHTML = countries.map((iso3, i) => {
        const meta = DataLoader.getMetadata(iso3);
        const name = meta ? meta.name : iso3;
        const color = getColorForIndex(i);
        return `<span class="chip">
            <span class="chip-color" style="background:${color}"></span>
            ${name}
            <span class="chip-remove" data-iso3="${iso3}">&times;</span>
        </span>`;
    }).join('');

    chipsEl.querySelectorAll('.chip-remove').forEach(el => {
        el.addEventListener('click', () => {
            State.removeCountry(el.dataset.iso3);
        });
    });
}

// ============================================================================
// Right-panel country list
// ============================================================================

function populateCountryList() {
    const listEl = document.getElementById('right-panel-country-list');
    if (!listEl) return;

    const allMeta = DataLoader.getAllMetadata();
    if (!allMeta || allMeta.length === 0) return;

    // Sort alphabetically by name
    const sorted = [...allMeta].sort((a, b) => a.name.localeCompare(b.name));

    listEl.innerHTML = sorted.map(m => {
        return `<label class="rp-country" data-iso3="${m.iso3}" data-name="${m.name.toLowerCase()}">` +
            `<input type="checkbox" value="${m.iso3}">` +
            `<span class="rp-country-name">${m.name}</span>` +
            `<span class="rp-country-iso">${m.iso3}</span>` +
            `</label>`;
    }).join('');

    // Wire checkbox change events
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                State.addCountry(cb.value);
            } else {
                State.removeCountry(cb.value);
            }
        });
    });
}

function syncCountryListUI() {
    const listEl = document.getElementById('right-panel-country-list');
    if (!listEl) return;

    const selected = State.get('selectedCountries');
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = selected.includes(cb.value);
    });
}

function wireCountrySearch() {
    const searchInput = document.getElementById('right-panel-search');
    const listEl = document.getElementById('right-panel-country-list');
    if (!searchInput || !listEl) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        listEl.querySelectorAll('.rp-country').forEach(label => {
            if (!query) {
                label.style.display = '';
                return;
            }
            const name = label.dataset.name || '';
            const iso = label.dataset.iso3 || '';
            const match = name.includes(query) || iso.toLowerCase().includes(query);
            label.style.display = match ? '' : 'none';
        });
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.blur();
        }
    });
}

function wireCountryPresets() {
    bindPreset('rp-preset-g7', G7);
    bindPreset('rp-preset-brics', BRICS);
    const allBtn = document.getElementById('rp-preset-all');
    if (allBtn) {
        allBtn.addEventListener('click', () => {
            State.set('selectedCountries', DataLoader.getAllMetadata().map(m => m.iso3));
        });
    }
    const clearBtn = document.getElementById('rp-preset-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => State.clearCountries());
}

// ============================================================================
// Search autocomplete (legacy, for any remaining search inputs)
// ============================================================================

function setupSearch(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
        const query = input.value.trim();
        if (query.length < 1) {
            dropdown.classList.remove('visible');
            return;
        }
        const results = DataLoader.searchCountries(query);
        if (results.length === 0) {
            dropdown.classList.remove('visible');
            return;
        }
        dropdown.innerHTML = results.map(r => `
            <div class="autocomplete-item" data-iso3="${r.iso3}">
                <span>${r.name}</span>
                <span style="color:var(--cl)">${r.iso3}</span>
            </div>
        `).join('');
        dropdown.classList.add('visible');

        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                State.addCountry(item.dataset.iso3);
                input.value = '';
                dropdown.classList.remove('visible');
            });
        });
    });

    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('visible'), 200);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.classList.remove('visible');
            input.blur();
        }
    });
}

// ============================================================================
// Preset helper
// ============================================================================

function bindPreset(id, countries) {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('click', () => {
            State.set('selectedCountries', [...countries]);
        });
    }
}
