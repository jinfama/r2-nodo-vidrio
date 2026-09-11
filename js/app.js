// ============================================================================
// APP.JS - Application entry point, routing, initialization
// ============================================================================

import State from './state.js?v=20260911b';
import DataLoader from './data-loader.js?v=20260911b';
import { initGlobeSection } from './globe/globe-section.js?v=20260911b';
import { initExploreSection } from './explore/explore-section.js?v=20260911b';
import { initAnalysisSection } from './analysis/analysis-section.js?v=20260911b';
import { initWhatifSection, whatifModel, WHATIF_STATE_KEYS, WHATIF_DEFAULTS } from './whatif/whatif-section.js?v=20260911b';
import { toggleFullscreen, exportCSV } from './components/export.js?v=20260911b';
import CountryPicker from './components/country-picker.js?v=20260911b';
import { renderGlobeFrame, resetGlobeView } from './globe/globe-renderer.js?v=20260911b';
import { INDICATOR_LABELS, INDICATOR_UNITS, UI_FONT } from './utils.js?v=20260911b';

// ---- TAB NAVIGATION ---- //
const sections = {
    globe: document.getElementById('section-globe'),
    explore: document.getElementById('section-explore'),
    analysis: document.getElementById('section-analysis'),
    whatif: document.getElementById('section-whatif'),
    about: document.getElementById('section-about')
};

const tabButtons = document.querySelectorAll('.tab-btn');

function switchSection(sectionId) {
    Object.keys(sections).forEach(key => {
        if (sections[key]) sections[key].classList.toggle('active', key === sectionId);
    });
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });
    State.set('activeSection', sectionId);
    if (State.get('isPlaying')) State.set('isPlaying', false);
}

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const sectionId = btn.dataset.section;
        switchSection(sectionId);
        window.location.hash = '#' + sectionId;
    });
});

// ---- HASH ROUTING ---- //
function handleHash() {
    const hash = window.location.hash.replace('#', '') || 'globe';
    const parts = hash.split('?');
    // A path segment too: the spec (§2.1 and §9) documents #whatif/ahead and
    // #whatif/behind, and those links used to land the reader on the globe
    // with the hash silently rewritten, because the whole "whatif/behind"
    // matched no section.
    const path = parts[0].split('/');
    const section = path[0];
    if (sections[section]) switchSection(section);
    if (section === 'whatif' && (path[1] === 'ahead' || path[1] === 'behind')) {
        State.set('whatifMode', path[1]);
    }

    if (parts[1]) applyStateFromParams(new URLSearchParams(parts[1]));
}

// Restoring a shared link is an ORDERING problem, and getting the order wrong
// is what made the permalink look broken: it restored the countries, the year
// and the view, and then quietly threw away the period.
//
// explore-section.js recomputes the year range from the data extent of what is
// on screen (adjustYearRangeForIndicator) every time the countries, the
// indicator or the sub-view change. So anything that triggers that recompute
// has to be applied FIRST, and the reader's own year and range LAST. The old
// code did the opposite — it set the range inside handleHash() and then
// clicked the sub-view 900 ms later from a timer, which put the range straight
// back to the full extent of the data.
function applyStateFromParams(params) {
    if (params.has('c')) {
        State.set('selectedCountries', params.get('c').split(',').filter(Boolean));
    }
    if (params.has('ind')) State.set('indicator', params.get('ind'));
    // Sub-views own their own active class, so they are restored with a click.
    const view = params.get('view');
    if (view) document.querySelector(`.map-subtab[data-view="${view}"]`)?.click();
    const an = params.get('an');
    if (an) document.querySelector(`[data-analysis="${an}"]`)?.click();
    // Last, after everything that could recompute them.
    if (params.has('range')) {
        const [s, e] = params.get('range').split('-').map(Number);
        if (s && e) State.set('yearRange', [s, e]);
    }
    if (params.has('from')) {
        const f = parseInt(params.get('from'), 10);
        if (!isNaN(f)) State.set('yearFrom', f);
    }
    if (params.has('year')) {
        const y = parseInt(params.get('year'), 10);
        if (!isNaN(y)) State.set('currentYear', y);
    }
    applyWhatifParams(params);
}

// What if? carries its own parameters and nothing else:
//   #whatif?mode=ahead&g=0.0232&r=-0.0231&pop=medium&target=2.0C&prob=50
//   #whatif?mode=behind&region=WLD&ref=GBR&t0=1850&cf=rate&int=own
// Every value is validated here, so a hand-edited link can only ever fall
// back to the defaults of js/state.js.
const WHATIF_REGIONS = ['WLD', 'CHN', 'EAP', 'ECA', 'LAC', 'MENA', 'NAM', 'SAS', 'SSA', 'WEU', 'GBR'];

function applyWhatifParams(params) {
    const pick = (name, key, allowed) => {
        if (!params.has(name)) return;
        const v = params.get(name);
        if (allowed.indexOf(v) !== -1) State.set(key, v);
    };
    const rate = (name, key, lo, hi) => {
        if (!params.has(name)) return;
        const v = parseFloat(params.get(name));
        if (isFinite(v) && v >= lo && v <= hi) State.set(key, v);
    };
    pick('mode', 'whatifMode', ['ahead', 'behind']);
    rate('g', 'whatifG', -0.30, 0.20);
    rate('r', 'whatifR', -0.60, 0.20);
    pick('pop', 'whatifPop', ['low', 'medium', 'high']);
    pick('target', 'whatifTarget', ['1.5C', '2.0C', '3.0C']);
    if (params.has('prob')) {
        const v = params.get('prob').replace('%', '');
        if (['50', '67', '83'].indexOf(v) !== -1) State.set('whatifProb', v + '%');
    }
    if (params.has('hz')) {
        const v = parseInt(params.get('hz'), 10);
        if (v === 2050 || v === 2100) State.set('whatifHorizon', v);
    }
    if (params.has('solve')) {
        const v = params.get('solve');
        State.set('whatifSolveFor', (v === 'intensity' || v === 'growth') ? v : null);
    }
    if (params.has('tail')) State.set('whatifTail', params.get('tail') === '1');
    if (params.has('region')) {
        const v = params.get('region').toUpperCase();
        if (WHATIF_REGIONS.indexOf(v) !== -1) State.set('whatifRegion', v);
    }
    pick('ref', 'whatifRef', ['GBR', 'WLD']);
    if (params.has('t0')) {
        const v = parseInt(params.get('t0'), 10);
        if (v >= 1850 && v <= 2000) State.set('whatifFrom', v);
    }
    pick('cf', 'whatifCfMode', ['rate', 'level']);
    pick('int', 'whatifIntensity', ['own', 'ref', 'world']);
}

window.addEventListener('hashchange', handleHash);

// ---- INTRO ---- //
const introOverlay = document.getElementById('intro-overlay');
const appEl = document.getElementById('app');

// ============================================================================
// i18n  (en / es / zh) — four ways in, one dictionary
// ----------------------------------------------------------------------------
// 1. Markup, explorer.html. Put the key in an attribute and applyLanguage()
//    writes it on every language change:
//       data-i18n="key"              -> textContent
//       data-i18n-html="key"         -> innerHTML   (keeps <strong>, <em>, <a>)
//       data-i18n-title="key"        -> title
//       data-i18n-placeholder="key"  -> placeholder
//       data-i18n-aria="key"         -> aria-label
//       data-i18n-alt="key"          -> alt
//    A node with no entry in the active pack keeps the text the file shipped
//    with, so the `en` pack only needs a key when English has to differ from
//    the markup (i18nOriginal remembers the original the first time we touch
//    the node, which is also what makes es -> en restore the English).
// 2. Prose app.js prints itself: gwText('key', 'fallback').
// 3. A lazily-loaded section (js/whatif/*): the read-only bridge on
//    window.GrowthEarth — lang(), t(key, fallback), pick(en, es, zh),
//    applyLanguage(root). The section redraws on the 'gw:language' event that
//    applyLanguage() fires at the end.
// 4. A view that draws its own labels (js/explore/*, js/analysis/*, js/globe/*):
//    tLabel(en, es, zh) from utils.js, plus the five label tables of utils.js
//    (INDICATOR_LABELS, INDICATOR_UNITS, MFA_FLOW_LABELS, MFA_MATERIAL_LABELS,
//    CROPS_COMPONENT_LABELS), which are proxies over the pack of the day — a
//    view reads them by key and needs no change of its own. A label that lives
//    in a module-level object must be a getter, or it freezes the language of
//    the first render (see FACTOR_LABELS in js/analysis/drivers.js).
// Not translated, on purpose: country names and indicator names that come from
// the data, bibliographic references, DOIs and the names of the sources.
// ============================================================================
const LANGUAGE_STORAGE_KEY = 'growthWake.language';
const LANGUAGES = {
    en: {
        pubRead: "Read paper &rarr;",
        htmlLang: 'en',
        pageTitle: 'Growth & Earth · global development and environmental change since 1750',
        introTitle: 'Growth & Earth',
        introKicker: 'global development and environmental change since 1750',
        poemLabel: 'Antonio Machado, Proverbios y cantares, XXIX',
        poemQuote: '“Caminante, son tus huellas<br>el camino, y nada más;<br>caminante, no hay camino:<br>se hace camino al andar.<br>Al andar se hace camino,<br>y al volver la vista atrás<br>se ve la senda que nunca<br>se ha de volver a pisar.<br>Caminante, no hay camino,<br>sino estelas en la mar.”',
        poemCredit: 'Antonio Machado, Campos de Castilla (1912)',
        dataLabel: 'Explore the data',
        siteDescription: 'A website offering a compilation of historical series on economic development, resource use, and environmental impacts across countries.',
        introButton: 'Explore trajectories',
        loadingSubtitle: 'Loading two and a half centuries of development and environmental change…',
        fallbackIntro: 'A comparative compilation of historical series on <strong>economic development</strong>, <strong>resource use</strong>, and <strong>environmental impacts</strong> across countries and world regions.',
        logoHtml: 'Growth &amp; Earth <span>development &amp; environment since 1750</span>',
        navProfile: 'Country Profile',
        navExplore: 'Explore',
        navAnalysis: 'Analysis',
        navAbout: 'About',
        navProfileShort: 'Profile',
        navWhatif: 'What if?',
        whatifTitle: 'What if?',
        whatifSubtitle: 'Three dials, one carbon budget',
        whatifModeLabel: 'Mode',
        whatifModeAhead: 'Ahead <span class="wi-mode-when">· 2025–2050</span>',
        whatifModeBehind: 'Behind <span class="wi-mode-when">· 1850–2024</span>',
        whatifDialsTitle: 'Dials',
        whatifDial1: 'Economic growth',
        whatifDial1Unit: 'GDP per person, %/yr',
        whatifDial2: 'Technological change',
        whatifDial2Unit: 'CO₂ per dollar, %/yr',
        whatifDial3: 'Population',
        whatifDial3Unit: 'UN World Population Prospects 2024',
        whatifSolveTitle: 'Solve for…',
        whatifSolveTarget: 'Target',
        whatifSolveProbability: 'Probability',
        whatifSolveUnknown: 'Unknown',
        whatifSolveHorizon: 'Horizon',
        whatifSolveIntensity: 'CO₂ per dollar',
        whatifSolveGrowth: 'GDP per person',
        whatifSolveApply: 'Apply to dials',
        whatifHorizon2050: 'to 2050',
        whatifHorizon2100: 'constant rates to 2100',
        whatifTarget15: '1.5 °C',
        whatifTarget20: '2 °C',
        whatifTarget30: '≈ 3 °C (thermometer mark, derived)',
        whatifProb50: '50 %',
        whatifProb67: '67 %',
        whatifProb83: '83 %',
        whatifPopLow: 'UN low',
        whatifPopMedium: 'UN medium',
        whatifPopHigh: 'UN high',
        whatifCardCum: 'Cumulative 2025–2050',
        whatifCardRemaining: 'Budget left in 2050',
        whatifCardExhaustion: 'Budget exhausted',
        whatifCard2050: 'Emissions 2050 vs 2024',
        whatifCardDeltaGt: 'Δ cumulative 1850–2024',
        whatifCardDeltaT: 'Δ warming today',
        whatifCardCrossing: 'Budget crossed',
        whatifCardGdp: 'GDP per person in 2024',
        whatifBehindRegion: 'Region',
        whatifBehindReference: 'Reference',
        whatifBehindFrom: 'From',
        whatifBehindMode: 'Counterfactual',
        whatifBehindModeRate: 'same growth rate',
        whatifBehindModeLevel: 'same income level',
        whatifBehindIntensity: 'Carbon intensity',
        whatifBehindIntOwn: 'its own',
        whatifBehindIntRef: 'the reference’s',
        whatifBehindIntWorld: 'world average',
        whatifBehindMini: 'GDP per person',
        whatifThermTitle: 'Thermometer',
        whatifThermToday: 'today',
        whatifThermNote: 'The thermometer counts CO₂ only; when the 2 °C budget runs out it reads about 1.9 °C because the IPCC budget also allows for non-CO₂ warming.',
        whatifBudgetNote: 'Budgets from 1 January 2025: 320.6 Gt of fossil CO₂ for 1.5 °C and 1,170.6 Gt for 2 °C, both at 50 %. Newer estimates are much smaller.',
        whatifHonestyLabel: 'Method and limits',
        whatifHonestyLead: 'Kaya arithmetic, not a climate model — method and limits',
        whatifHonesty: '<strong>This is Kaya arithmetic, not a climate model.</strong> Emissions = population × GDP per person × CO₂ per dollar, with constant yearly rates you choose. Degrees come from the IPCC’s TCRE (0.45 °C per 1,000 Gt CO₂, likely range 0.27–0.63) added to 1.36 °C of human-induced warming in 2024 (Forster et al. 2025). Budgets are the AR6 remaining budgets used in the <em>Safe space</em> paper (500 and 1,350 Gt from 2020 for 1.5 °C and 2 °C at 50 %), minus what was emitted in 2020–2024, compared with fossil CO₂ only (land-use CO₂ excluded, non-CO₂ gases do not enter the thermometer, and the paper carries them as a ×1.25 factor on the budgets). Newer estimates are much smaller (130 Gt for 1.5 °C from 2025, Forster et al. 2025). Nothing here feeds back: growth does not change population, prices, or technology. The past cannot be rerun; these are thought experiments.',
        whatifLoading: 'Loading the What if? data…',
        whatifError: 'The What if? data could not be loaded.',
        whatifRetry: 'Try again',
        homeTitle: 'Back to cover',
        footerBrand: 'Growth & Earth · Infante-Amate, Aguilera & Travieso ·',
        footerAbout: 'About & sources',
        aboutTabAbout: 'About',
        aboutTabMethodology: 'Methodology',
        aboutTabPublications: 'Publications',
        aboutTitle: 'About Growth & Earth',
        aboutLead: "Since the industrial revolution, modern economic growth has sustained ever larger populations and extraordinary progress in education and health, while also transforming the planet through greenhouse gas emissions, cropland expansion, and raw material extraction. Growth & Earth is a place to explore this uneven history of global development and environmental change. It compiles country series on economic development, resource use, greenhouse gas emissions, material flows, land use, biodiversity, and other environmental impacts from the eighteenth century to the present.",
        conceptHeading: 'Conceptual frame',
        conceptOne: 'The cover carries a line of Machado because the metaphor is methodological as much as poetic. Development does not follow a single predefined road. Countries leave traces that branch, rise, fall, and sometimes contradict one another.',
        conceptTwo: 'The historical record lets us see those wakes retrospectively: where income rose, where human development improved, where resource use intensified, where emissions accumulated, and where environmental impacts became visible. Some older estimates are uncertain, but the direction of travel is clearer behind us than ahead.',
        viewerHeading: 'What the viewer shows',
        viewerText: 'The viewer links country profiles, maps, rankings, time-series comparisons, decoupling patterns, and decomposition tools. Together they allow readers to follow how GDP, HDI, population, emissions, material flows, land use, and biodiversity indicators moved together or apart across two centuries of global change.',
        teamHeading: 'Team',
        originsHeading: 'Origins and future directions',
        originsOne: 'The project began under the working name <strong>Cascorro</strong>, after the <em>Plaza de Cascorro</em>, a lively square in the historic centre of Madrid. Over the course of several research meetings held in Madrid, the three members of the team ended up &mdash;more often than not&mdash; wrapping up the day with a beer and conversation in this square. What began as an informal meeting point became the place where the project was conceived and gradually took shape.',
        originsTwo: 'The title, <strong>Growth &amp; Earth</strong>, names the two sides of the story: modern economic growth, and the planet that has sustained it and been transformed by it. The image of a wake on the sea, from Machado&rsquo;s verse, stays with the project as its Spanish subtitle, <em>Estelas del crecimiento</em>: development has no single predefined road, but a plurality of paths that can be reconstructed historically. Looking back, those wakes reveal gains in human development as well as greenhouse gas emissions, material pressures, land-use change, and biodiversity losses.',
        originsThree: 'Growth &amp; Earth is an ongoing research initiative. Future work will expand the platform with <strong>new indicators</strong>, updated datasets, and papers that analyze the interplay between environmental pressures and socioeconomic development in historical perspective, deepening our understanding of long-term decoupling patterns, regional trajectories, and the environmental costs of growth.',
        dataSourcesHeading: 'Data sources',
        dataSourcesText: 'All data displayed on this platform is derived from publicly available datasets. Each indicator page in the <strong>Methodology</strong> tab documents the original source, coverage, and required citation. If you use data or visualizations from Growth &amp; Earth in your work, please cite both the original data providers and the relevant publications by Infante-Amate, Travieso &amp; Aguilera listed in the Methodology section.',
        loadFail: "Failed to load data. Please check the console for errors.",
        flashCopied: "Copied",
        flashDone: "Done",
        flashNoFigure: "No figure",
        flashError: "Error",
        ariaLanguage: "Language",
        promptCopyLink: "Copy this link:",
        figCountryProfile: "Country profile",
        figAnalysis: "Analysis",
        figAboutSources: "About & sources",
        phSearchCountries: "Search countries...",
        phSearch: "Search...",
        phSearchCountryRegion: "Search country or region...",
        pstatPop: "Pop",
        pstatGdpPc: "GDP pc",
        pstatHdi: "HDI",
        pstatGhg: "GHG",
        pstatCropland: "Cropland",
        pstatMfa: "MFA",
        tilePop: "Pop",
        tileGdp: "GDP",
        tileHdi: "HDI",
        tileGhg: "GHG",
        tileMaterials: "Materials",
        tileCrops: "Crops",
        tileBio: "Bio",
        tilePopTitle: "Population",
        tileGdpTitle: "GDP",
        tileHdiTitle: "Human Development",
        tileGhgTitle: "GHG Emissions",
        tileMfaTitle: "Material Flows",
        tileCropsTitle: "Crops / Land Use",
        tileBioTitle: "Biodiversity",
        viewMap: "Map",
        viewTrend: "Trend",
        viewComposition: "Composition",
        viewRanking: "Ranking",
        viewTable: "Table",
        btnCountries: "Countries",
        btnSettings: "Settings",
        sheetTitle: "Explore settings",
        ariaCloseSettings: "Close settings",
        ttResizePanel: "Resize settings panel",
        rpSettings: "Settings",
        rpIndicator: "Indicator",
        rpCountries: "Countries",
        lblUnit: "Unit",
        btnTotalLc: "total",
        btnPerCapitaLc: "per capita",
        lblCompare: "Compare",
        btn1Map: "1 map",
        btn2Maps: "2 maps",
        ttSingleMap: "Single map",
        ttCompareYears: "Compare two years",
        lblDraw: "Draw",
        ttLines: "Lines",
        ttStacked: "Stacked area",
        lblValues: "Values",
        ttValueTransform: "Value transformation",
        lblScale: "Scale",
        btnLinear: "Linear",
        btnLog: "Log",
        lblPanels: "Panels",
        btnAll: "All",
        btnCountry: "Country",
        btnComponent: "Component",
        lblYAxis: "Y axis",
        btnShared: "Shared",
        btnFree: "Free",
        lblGasType: "Gas type",
        lblFlowType: "Flow type",
        lblMaterial: "Material",
        presetMatTotal: "Total",
        presetDecomposed: "All decomposed",
        matBio: "Biomass",
        matFf: "Fossil fuels",
        matMet: "Metal ores",
        matMin: "Non-metallic minerals",
        lblType: "Type",
        btnHdiConv: "Conventional",
        btnHdiAug: "Augmented (Prados)",
        lblLandType: "Land type",
        presetCropTotal: "Total agricultural area",
        cropCropland: "Cropland",
        cropArable: "Arable land",
        cropPermanent: "Permanent crops",
        cropPastures: "Permanent pastures",
        btnPopTotal: "Total",
        btnPopDensity: "Density (/km²)",
        btnClear: "Clear",
        anIntensities: "Intensities",
        anDrivers: "Drivers",
        anCorrelations: "Correlations",
        anRecessions: "Recessions",
        anTapio: "Tapio",
        lblXAxis: "X axis",
        lblSlashXAxis: "/ X axis",
        lblFrom: "From",
        lblTo: "To",
        lblChart: "Chart",
        lblSize: "Size",
        lblAxes: "Axes",
        lblScope: "Scope",
        lblView: "View",
        lblEmissionType: "Emission type",
        lblYearWindow: "Year window",
        btnTotal: "Total",
        btnPerCap: "Per cap",
        btnLin: "Lin",
        corrFixed: "Fixed",
        corrMobile: "Mobile",
        corrScopeAll: "All countries",
        corrScopeSel: "Selected only",
        recReductions: "Reductions",
        recDecomposition: "Decomposition",
        analysisTitleDefault: "Select an analysis type",
        analysisSubtitleDefault: "Choose countries and analysis mode",
        footLink: "Link",
        footReset: "Reset",
        footFullscreen: "Fullscreen",
        ttFootLink: "Copy a link to this exact view (section, indicator, year, countries)",
        ttFootPng: "Download the figure on screen as PNG",
        ttFootReset: "Back to the initial view",
    },
    es: {
        pubRead: "Leer el art\u00edculo &rarr;",
        htmlLang: 'es',
        pageTitle: 'Growth & Earth · desarrollo global y cambio ambiental desde 1750',
        introTitle: 'Growth & Earth',
        introKicker: 'desarrollo global y cambio ambiental desde 1750',
        poemLabel: 'Antonio Machado, Proverbios y cantares, XXIX',
        poemQuote: '“Caminante, son tus huellas<br>el camino, y nada más;<br>caminante, no hay camino:<br>se hace camino al andar.<br>Al andar se hace camino,<br>y al volver la vista atrás<br>se ve la senda que nunca<br>se ha de volver a pisar.<br>Caminante, no hay camino,<br>sino estelas en la mar.”',
        poemCredit: 'Antonio Machado, Campos de Castilla (1912)',
        dataLabel: 'Explorar los datos',
        siteDescription: 'Sitio web que ofrece una compilación de series históricas sobre desarrollo económico, uso de recursos e impactos ambientales de los países.',
        introButton: 'Explorar trayectorias',
        loadingSubtitle: 'Cargando dos siglos y medio de desarrollo y cambio ambiental…',
        fallbackIntro: 'Una compilación comparada de series históricas sobre <strong>desarrollo económico</strong>, <strong>uso de recursos</strong> e <strong>impactos ambientales</strong> para países y regiones del mundo.',
        logoHtml: 'Growth &amp; Earth <span>desarrollo y ambiente desde 1750</span>',
        navProfile: 'Perfil',
        navExplore: 'Explorar',
        navAnalysis: 'Análisis',
        navAbout: 'Acerca de',
        navProfileShort: 'Perfil',
        navWhatif: '¿Y si…?',
        whatifTitle: '¿Y si…?',
        whatifSubtitle: 'Tres palancas, un presupuesto de carbono',
        whatifModeLabel: 'Modo',
        whatifModeAhead: 'Hacia 2050 <span class="wi-mode-when">· desde 2025</span>',
        whatifModeBehind: 'Otro pasado <span class="wi-mode-when">· 1850–2024</span>',
        whatifDialsTitle: 'Palancas',
        whatifDial1: 'Crecimiento económico',
        whatifDial1Unit: 'PIB por persona, %/año',
        whatifDial2: 'Cambio tecnológico',
        whatifDial2Unit: 'CO₂ por dólar, %/año',
        whatifDial3: 'Población',
        whatifDial3Unit: 'ONU, World Population Prospects 2024',
        whatifSolveTitle: 'Despejar…',
        whatifSolveTarget: 'Objetivo',
        whatifSolveProbability: 'Probabilidad',
        whatifSolveUnknown: 'Incógnita',
        whatifSolveHorizon: 'Horizonte',
        whatifSolveIntensity: 'CO₂ por dólar',
        whatifSolveGrowth: 'PIB por persona',
        whatifSolveApply: 'Aplicar a las palancas',
        whatifHorizon2050: 'hasta 2050',
        whatifHorizon2100: 'tasas constantes hasta 2100',
        whatifTarget15: '1,5 °C',
        whatifTarget20: '2 °C',
        whatifTarget30: '≈ 3 °C (marca del termómetro, derivada)',
        whatifProb50: '50 %',
        whatifProb67: '67 %',
        whatifProb83: '83 %',
        whatifPopLow: 'ONU baja',
        whatifPopMedium: 'ONU media',
        whatifPopHigh: 'ONU alta',
        whatifCardCum: 'Acumulado 2025–2050',
        whatifCardRemaining: 'Presupuesto restante en 2050',
        whatifCardExhaustion: 'Presupuesto agotado',
        whatifCard2050: 'Emisiones de 2050 respecto a 2024',
        whatifCardDeltaGt: 'Δ acumulado 1850–2024',
        whatifCardDeltaT: 'Δ calentamiento actual',
        whatifCardCrossing: 'Presupuesto cruzado',
        whatifCardGdp: 'PIB por persona en 2024',
        whatifBehindRegion: 'Región',
        whatifBehindReference: 'Referencia',
        whatifBehindFrom: 'Desde',
        whatifBehindMode: 'Contrafactual',
        whatifBehindModeRate: 'mismo ritmo de crecimiento',
        whatifBehindModeLevel: 'mismo nivel de renta',
        whatifBehindIntensity: 'Intensidad de carbono',
        whatifBehindIntOwn: 'la suya',
        whatifBehindIntRef: 'la de la referencia',
        whatifBehindIntWorld: 'la media mundial',
        whatifBehindMini: 'PIB por persona',
        whatifThermTitle: 'Termómetro',
        whatifThermToday: 'hoy',
        whatifThermNote: 'El termómetro solo cuenta el CO₂: cuando se agota el presupuesto de 2 °C marca unos 1,9 °C porque el presupuesto del IPCC descuenta también el calentamiento no-CO₂.',
        whatifBudgetNote: 'Presupuestos desde el 1 de enero de 2025: 320,6 Gt de CO₂ fósil para 1,5 °C y 1.170,6 Gt para 2 °C, ambos al 50 %. Las estimaciones más recientes son mucho menores.',
        whatifHonestyLabel: 'Método y límites',
        whatifHonestyLead: 'Aritmética de Kaya, no un modelo climático — método y límites',
        whatifHonesty: '<strong>Esto es aritmética de Kaya, no un modelo climático.</strong> Emisiones = población × PIB por persona × CO₂ por dólar, con tasas anuales constantes que eliges tú. Los grados salen del TCRE del IPCC (0,45 °C por 1.000 Gt CO₂, rango probable 0,27–0,63) sumados a los 1,36 °C de calentamiento antropogénico de 2024 (Forster et al. 2025). Los presupuestos son los del AR6 usados en el paper <em>Safe space</em> (500 y 1.350 Gt desde 2020 para 1,5 °C y 2 °C al 50 %), menos lo emitido en 2020–2024, comparados solo con el CO₂ fósil (sin cambio de uso del suelo; los gases no-CO₂ no entran en el termómetro y el paper los incorpora con un factor ×1,25 sobre los presupuestos). Las estimaciones más recientes son mucho menores (130 Gt para 1,5 °C desde 2025, Forster et al. 2025). Nada retroalimenta: el crecimiento no cambia la población, los precios ni la tecnología. El pasado no se puede repetir; son experimentos mentales.',
        whatifLoading: 'Cargando los datos de ¿Y si…?…',
        whatifError: 'No se han podido cargar los datos de ¿Y si…?',
        whatifRetry: 'Reintentar',
        homeTitle: 'Volver a la portada',
        footerBrand: 'Growth & Earth · Infante-Amate, Aguilera & Travieso ·',
        footerAbout: 'Acerca de y fuentes',
        aboutTabAbout: 'Acerca de',
        aboutTabMethodology: 'Metodología',
        aboutTabPublications: 'Publicaciones',
        aboutTitle: 'Acerca de Growth & Earth',
        aboutLead: 'Desde la revolución industrial, el crecimiento económico moderno ha sostenido poblaciones cada vez más numerosas y progresos extraordinarios en educación y salud, al tiempo que transformaba el planeta mediante las emisiones de gases de efecto invernadero, la expansión de los cultivos y la extracción de materias primas. Growth & Earth es un lugar para explorar esta historia desigual del desarrollo global y del cambio ambiental. Compila series nacionales sobre desarrollo económico, uso de recursos, emisiones de gases de efecto invernadero, flujos materiales, uso del suelo, biodiversidad y otros impactos ambientales desde el siglo XVIII hasta el presente.',
        conceptHeading: 'Marco conceptual',
        conceptOne: 'La portada lleva un verso de Machado porque la metáfora es metodológica además de poética. El desarrollo no sigue un camino único y predefinido. Los países dejan trazas que se bifurcan, suben, caen y a veces se contradicen.',
        conceptTwo: 'El registro histórico permite ver esas estelas retrospectivamente: dónde creció el ingreso, dónde mejoró el desarrollo humano, dónde se intensificó el uso de recursos, dónde se acumularon emisiones y dónde se hicieron visibles los impactos ambientales. Algunas estimaciones antiguas son inciertas, pero la dirección del viaje se ve mejor hacia atrás que hacia adelante.',
        viewerHeading: 'Qué muestra el visor',
        viewerText: 'El visor conecta perfiles de país, mapas, rankings, comparaciones temporales, patrones de desacoplamiento y herramientas de descomposición. En conjunto permite seguir cómo PIB, IDH, población, emisiones, flujos materiales, usos del suelo e indicadores de biodiversidad se movieron juntos o se separaron a lo largo de dos siglos de cambio global.',
        teamHeading: 'Equipo',
        originsHeading: 'Orígenes y próximos pasos',
        originsOne: 'El proyecto comenzó con el nombre de trabajo <strong>Cascorro</strong>, por la <em>Plaza de Cascorro</em>, una plaza viva del centro histórico de Madrid. Durante varias reuniones de investigación en Madrid, los tres miembros del equipo terminaban a menudo el día con una cerveza y conversación en esa plaza. Lo que empezó como punto informal de encuentro acabó siendo el lugar donde el proyecto fue concebido y tomó forma.',
        originsTwo: 'El título, <strong>Growth &amp; Earth</strong>, nombra las dos caras de la historia: el crecimiento económico moderno y el planeta que lo ha sostenido y que él ha transformado. La imagen de la estela en el mar, tomada del verso de Machado, sigue acompañando al proyecto como subtítulo en español, <em>Estelas del crecimiento</em>: el desarrollo no tiene un camino predefinido, sino una pluralidad de trayectorias que pueden reconstruirse históricamente. Al mirar hacia atrás, esas estelas revelan ganancias en desarrollo humano junto a emisiones de gases de efecto invernadero, presiones materiales, cambios de uso del suelo y pérdidas de biodiversidad.',
        originsThree: 'Growth &amp; Earth es una iniciativa de investigación en marcha. El trabajo futuro ampliará la plataforma con <strong>nuevos indicadores</strong>, datos actualizados y artículos que analicen la relación entre presiones ambientales y desarrollo socioeconómico en perspectiva histórica.',
        dataSourcesHeading: 'Fuentes de datos',
        dataSourcesText: 'Todos los datos mostrados en esta plataforma proceden de fuentes públicas. Cada indicador de la pestaña <strong>Metodología</strong> documenta la fuente original, la cobertura y la cita requerida. Si usas datos o visualizaciones de Growth &amp; Earth, cita tanto a los proveedores originales como las publicaciones relevantes de Infante-Amate, Travieso &amp; Aguilera incluidas en la sección metodológica.',
        loadFail: "No se han podido cargar los datos. Revisa la consola para ver los errores.",
        flashCopied: "Copiado",
        flashDone: "Hecho",
        flashNoFigure: "Sin figura",
        flashError: "Error",
        ariaLanguage: "Idioma",
        promptCopyLink: "Copia este enlace:",
        figCountryProfile: "Perfil de país",
        figAnalysis: "Análisis",
        figAboutSources: "Acerca de y fuentes",
        introMore: "Para más información sobre fuentes, metodología y citas, véase <a href=\"#\" onclick=\"document.getElementById('intro-enter').click();setTimeout(function(){document.querySelector('[data-section=about]').click()},800);return false;\">Acerca de</a>.",
        phSearchCountries: "Buscar países…",
        phSearch: "Buscar…",
        phSearchCountryRegion: "Buscar país o región…",
        pstatPop: "Pobl.",
        pstatGdpPc: "PIB pc",
        pstatHdi: "IDH",
        pstatGhg: "GEI",
        pstatCropland: "Cultivos",
        pstatMfa: "MFA",
        pchartPop: "Población <span class=\"profile-unit\">(M)</span>",
        pchartGdpPc: "PIB per cápita <span class=\"profile-unit\">($PPP)</span>",
        pchartHdi: "IDH",
        pchartGhg: "Emisiones de GEI <span class=\"profile-unit\">(Mt)</span>",
        pchartCropland: "Superficie cultivada <span class=\"profile-unit\">(Mha)</span>",
        pchartMfa: "Extracción de materiales <span class=\"profile-unit\">(Mt)</span>",
        pchartGhgGdp: "GEI / PIB <span class=\"profile-unit\">(kg/$)</span>",
        pchartCropGdp: "Cultivos / PIB <span class=\"profile-unit\">(ha/k$)</span>",
        pchartMfaGdp: "MFA / PIB <span class=\"profile-unit\">(kg/$)</span>",
        tilePop: "Pobl.",
        tileGdp: "PIB",
        tileHdi: "IDH",
        tileGhg: "GEI",
        tileMaterials: "Materiales",
        tileCrops: "Cultivos",
        tileBio: "Bio",
        tilePopTitle: "Población",
        tileGdpTitle: "PIB",
        tileHdiTitle: "Desarrollo humano",
        tileGhgTitle: "Emisiones de GEI",
        tileMfaTitle: "Flujos de materiales",
        tileCropsTitle: "Cultivos y usos del suelo",
        tileBioTitle: "Biodiversidad",
        viewMap: "Mapa",
        viewTrend: "Series",
        viewComposition: "Composición",
        viewRanking: "Ranking",
        viewTable: "Tabla",
        btnCountries: "Países",
        btnSettings: "Ajustes",
        optGhgTotal: "GEI total",
        optCo2ff: "CO&#8322; de combustibles fósiles",
        optGhgPc: "GEI per cápita",
        optGdpPc: "PIB per cápita",
        optHdi: "IDH",
        optPop: "Población",
        optAnnual: "Anual",
        optCumulative: "Acumulado",
        optTop20: "Top 20",
        optTop30: "Top 30",
        optTop50: "Top 50",
        optAll: "Todos",
        optAbsolute: "Absolutos",
        optPctWorld: "% del total mundial",
        optPctGroup: "% de lo seleccionado",
        optIndex: "Índice (primer año = 100)",
        optGhgEmissions: "Emisiones de GEI",
        optCo2ffPc: "CO&#8322; fósil per cápita",
        optGdpTotal: "PIB total",
        optAhdi: "IDH ampliado (Prados)",
        optGdp: "PIB",
        optGhg: "GEI",
        optCo2Fossil: "CO&#8322; fósil",
        optGdpPcShort: "PIB pc",
        optWaterfall: "Cascada",
        optGroupedBar: "Comparación agrupada",
        optFaceted: "Cascada por paneles",
        optTapioGhg: "GEI (total)",
        tapioWin5: "5 años",
        tapioWin10: "10 años",
        tapioWin20: "20 años",
        sheetTitle: "Ajustes de Explorar",
        ariaCloseSettings: "Cerrar ajustes",
        ttResizePanel: "Redimensionar el panel de ajustes",
        rpSettings: "Ajustes",
        rpIndicator: "Indicador",
        rpCountries: "Países",
        lblUnit: "Unidad",
        btnTotalLc: "total",
        btnPerCapitaLc: "per cápita",
        lblCompare: "Comparar",
        btn1Map: "1 mapa",
        btn2Maps: "2 mapas",
        ttSingleMap: "Un solo mapa",
        ttCompareYears: "Comparar dos años",
        lblDraw: "Trazado",
        ttLines: "Líneas",
        ttStacked: "Área apilada",
        lblValues: "Valores",
        ttValueTransform: "Transformación de los valores",
        lblScale: "Escala",
        btnLinear: "Lineal",
        btnLog: "Log",
        lblPanels: "Paneles",
        btnAll: "Todo",
        btnCountry: "País",
        btnComponent: "Componente",
        lblYAxis: "Eje Y",
        btnShared: "Compartido",
        btnFree: "Libre",
        lblGasType: "Tipo de gas",
        presetTotalCO2: "CO&#8322; total",
        presetTotalGHG: "GEI total",
        presetCO2Decomp: "CO&#8322; desglosado",
        presetGHGDecomp: "GEI desglosado",
        gasCoal: "CO&#8322; del carbón",
        gasOil: "CO&#8322; del petróleo",
        gasGas: "CO&#8322; del gas",
        gasCo2luc: "CO&#8322; de usos del suelo",
        gasCh4: "CH&#8324;",
        gasN2o: "N&#8322;O",
        gasFgas: "Gases fluorados",
        lblFlowType: "Tipo de flujo",
        flowExt: "Extracción",
        flowCon: "Consumo",
        flowImp: "Importaciones",
        flowExp: "Exportaciones",
        flowBal: "Balanza comercial física",
        flowMf: "Huella material",
        lblMaterial: "Material",
        presetMatTotal: "Total",
        presetDecomposed: "Todo desglosado",
        matBio: "Biomasa",
        matFf: "Combustibles fósiles",
        matMet: "Minerales metálicos",
        matMin: "Minerales no metálicos",
        lblType: "Tipo",
        btnHdiConv: "Convencional",
        btnHdiAug: "Ampliado (Prados)",
        lblLandType: "Tipo de suelo",
        presetCropTotal: "Superficie agraria total",
        cropCropland: "Tierras de cultivo",
        cropArable: "Tierra arable",
        cropPermanent: "Cultivos permanentes",
        cropPastures: "Pastos permanentes",
        btnPopTotal: "Total",
        btnPopDensity: "Densidad (/km²)",
        bioNote: "Índice de la Lista Roja (0&ndash;1; 1 = todas las especies en preocupación menor)",
        btnClear: "Limpiar",
        anIntensities: "Intensidades",
        anDrivers: "Factores",
        anCorrelations: "Correlaciones",
        anRecessions: "Recesiones",
        anTapio: "Tapio",
        lblXAxis: "Eje X",
        lblSlashXAxis: "/ Eje X",
        lblFrom: "Desde",
        lblTo: "Hasta",
        lblChart: "Gráfico",
        lblSize: "Tamaño",
        lblAxes: "Ejes",
        lblScope: "Alcance",
        lblView: "Vista",
        lblEmissionType: "Tipo de emisión",
        lblYearWindow: "Ventana de años",
        btnTotal: "Total",
        btnPerCap: "Per cáp.",
        btnLin: "Lin",
        corrFixed: "Fijos",
        corrMobile: "Móviles",
        corrScopeAll: "Todos los países",
        corrScopeSel: "Solo seleccionados",
        recReductions: "Reducciones",
        recDecomposition: "Descomposición",
        analysisTitleDefault: "Elige un tipo de análisis",
        analysisSubtitleDefault: "Elige países y modo de análisis",
        footLink: "Enlace",
        footReset: "Reiniciar",
        footFullscreen: "Pantalla completa",
        ttFootLink: "Copiar un enlace a esta vista exacta (sección, indicador, año, países)",
        ttFootPng: "Descargar como PNG la figura en pantalla",
        ttFootReset: "Volver a la vista inicial",
        cpickerTitle: "Países y regiones",
        teamDesc1: "Historia ambiental y económica",
        teamDesc2: "Historia económica y ambiental",
        teamDesc3: "Agroecología y ciencia del clima",
        mtHead1: "Fuentes de datos y metodología",
        mtHead2: "Esta plataforma integra varios conjuntos de datos para ofrecer una visión de conjunto de las tendencias ambientales y de desarrollo humano en el mundo. Elige abajo un indicador para ver su metodología detallada, sus fuentes, su cobertura y cómo debe citarse.",
        mtHead3: "PIB",
        mtHead4: "IDH",
        mtHead5: "Población",
        mtHead6: "GEI",
        mtHead7: "Materiales",
        mtHead8: "Usos del suelo",
        mtHead9: "Biodiversidad",
        mtGdp1: "PIB &mdash; Maddison Project Database",
        mtGdp2: "Producto interior bruto per cápita en perspectiva de larga duración",
        mtGdp3: "Cobertura",
        mtGdp4: "199 países",
        mtGdp5: "Años",
        mtGdp6: "Unidad",
        mtGdp7: "Dólares internacionales de 2011 (PPA)",
        mtGdp8: "Resolución",
        mtGdp9: "Anual",
        mtGdp10: "Descripción",
        mtGdp11: "La fuente principal es la <strong>Maddison Project Database</strong> (actualización de 2023), el conjunto de datos económicos comparativos de larga duración más completo disponible. Iniciada por Angus Maddison, hoy la mantiene un equipo de la Universidad de Groninga. Ofrece estimaciones de PIB per cápita en dólares internacionales de 2011 (paridad de poder adquisitivo) para un amplio conjunto de países, en muchos casos desde el siglo XVIII o antes.",
        mtGdp12: "La actualización de 2023 incorpora nuevas estimaciones de referencia y mejoras metodológicas, y ofrece la imagen más fiable de la evolución de la economía mundial en el largo plazo. En esta plataforma las series de Maddison se prolongan con los <strong>Indicadores del Desarrollo Mundial del Banco Mundial (WDI)</strong> para los años más recientes que la edición de Maddison aún no cubre.",
        mtGdp13: "Relleno de huecos",
        mtGdp14: "Para los países y años que la Maddison Project Database no cubre, el PIB per cápita se estima de forma jerárquica: (1) se aplican las tasas de crecimiento del WDI del Banco Mundial para prolongar hacia adelante las series existentes; (2) para los huecos históricos se aplican pautas de crecimiento regionales (ponderadas por población) anclándolas al valor conocido más próximo del país; (3) a los países sin dato alguno se les asigna la media regional ponderada por población.",
        mtGdp15: "Cómo citar",
        mtGdp17: "<strong>Cita sugerida:</strong> &ldquo;Datos de PIB de la Maddison Project Database 2023 (Bolt &amp; van Zanden, 2024), ampliados con el WDI del Banco Mundial.&rdquo;",
        mtHdi1: "Índice de Desarrollo Humano (IDH)",
        mtHdi2: "IDH estándar (PNUD) e IDH ampliado (Prados de la Escosura)",
        mtHdi3: "Cobertura",
        mtHdi4: "199 países",
        mtHdi5: "Años",
        mtHdi6: "Unidad",
        mtHdi7: "Índice 0&ndash;1",
        mtHdi8: "Variantes",
        mtHdi9: "IDH, IDH ampliado (con democracia), IDH sin renta (IDH<sub>ni</sub>)",
        mtHdi10: "El Índice de Desarrollo Humano (IDH)",
        mtHdi11: "El <strong>Índice de Desarrollo Humano (IDH)</strong> fue presentado por el Programa de las Naciones Unidas para el Desarrollo en 1990, en su primer <em>Informe sobre Desarrollo Humano</em>. Concebido por los economistas Mahbub ul Haq y Amartya Sen, nació para desplazar el foco de la economía del desarrollo más allá de la renta, resumiendo el logro medio en tres dimensiones clave del desarrollo humano:",
        mtHdi12: "Salud",
        mtHdi13: "Esperanza de vida al nacer.",
        mtHdi14: "Educación",
        mtHdi15: "Años medios de escolarización y años esperados de escolarización.",
        mtHdi16: "Nivel de vida",
        mtHdi17: "RNB per cápita (PPA en dólares).",
        mtHdi18: "El IDH es la <strong>media geométrica</strong> de los índices normalizados de cada dimensión, y toma un valor entre 0 y 1. El PNUD publica valores anuales del IDH para más de 190 países, disponibles de <strong>1990 a 2023</strong> en el último Informe sobre Desarrollo Humano (PNUD, 2025).",
        mtHdi19: "El IDH se ha convertido en el indicador compuesto de desarrollo humano más utilizado del mundo, y ofrece un contrapunto a las medidas puramente económicas como el PIB per cápita. Para más información, véase el <a href=\"https://hdr.undp.org/data-center/human-development-index\" target=\"_blank\" style=\"color:var(--c1);text-decoration:none;border-bottom:1px solid var(--c1)\">Centro de Datos de Desarrollo Humano del PNUD</a>.",
        mtHdi20: "El Índice de Desarrollo Humano Ampliado (IDHA)",
        mtHdi21: "El <strong>IDHA</strong>, propuesto por Prados de la Escosura (2023), amplía el IDH estándar en dos sentidos: (1) añade una cuarta dimensión &mdash;la <strong>democracia liberal</strong>&mdash; y (2) ofrece estimaciones históricas que se remontan a <strong>1870</strong>, mucho antes del punto de partida de 1990 del PNUD. El IDHA es la media geométrica de cuatro componentes normalizados:",
        mtHdi22: "Renta",
        mtHdi23: "PIB per cápita (GK$ de 1990). Transformación de Kakwani con Mo&nbsp;=&nbsp;100&nbsp;$, M&nbsp;=&nbsp;47.000&nbsp;$.",
        mtHdi24: "Esperanza de vida",
        mtHdi25: "Años al nacer. Transformación de Kakwani con Mo&nbsp;=&nbsp;20, M&nbsp;=&nbsp;85.",
        mtHdi26: "Educación",
        mtHdi27: "Años medios de escolarización. Transformación de Kakwani con Mo&nbsp;=&nbsp;0, M&nbsp;=&nbsp;15.",
        mtHdi28: "Democracia liberal",
        mtHdi29: "Índice v2x_libdem de V-Dem, usado directamente en escala 0&ndash;1.",
        mtHdi30: "Cada componente se normaliza con la <strong>transformación de Kakwani</strong> no lineal de Prados, que recoge los rendimientos decrecientes: las mejoras desde niveles bajos pesan más que desde niveles altos:",
        mtHdi31: "donde <em>x</em> es el valor observado, <em>Mo</em> el mínimo y <em>M</em> el máximo. El índice de democracia liberal de V-Dem (0&ndash;1) se usa directamente, sin transformar.",
        mtHdi32: "El IDHA compuesto es:",
        mtHdi33: "Prados publicó los valores brutos de los componentes de <strong>162 países</strong> en 24 años de referencia (1870, 1880, &hellip;, 2010, 2015, 2020) en la <em>Economic History Review</em>. Es el conjunto de datos de larga duración sobre desarrollo humano más completo disponible hoy.",
        mtHdi34: "Umbrales de los componentes",
        mtHdi35: "Componente",
        mtHdi36: "Mínimo (Mo)",
        mtHdi37: "Máximo (M)",
        mtHdi38: "Transformación",
        mtHdi39: "Renta (PIB pc GK$ 1990)",
        mtHdi40: "Kakwani (log)",
        mtHdi41: "Esperanza de vida (años)",
        mtHdi42: "Kakwani (log)",
        mtHdi43: "Educación (años medios de escolarización)",
        mtHdi44: "Kakwani (log)",
        mtHdi45: "Democracia liberal (V-Dem)",
        mtHdi46: "Directa (sin transformar)",
        mtHdi47: "Cadena de tratamiento en este visor",
        mtHdi48: "Los conjuntos originales cubren números distintos de países con paneles desequilibrados: Prados ofrece 162 países en 24 años de referencia dispersos (1870&ndash;2020), mientras que el PNUD cubre 206 entidades pero solo desde 1990. Para este visor ambas fuentes se han fusionado, prolongado y rellenado hasta formar un panel completo de <strong>199 países reconocidos por la ONU &times; 155 años (1870&ndash;2024)</strong>.",
        mtHdi49: "<strong>Paso 1 &mdash; Interpolación anual de los años de referencia:</strong> Prados publicó los valores brutos de los componentes en 24 años de referencia. Hemos interpolado linealmente los componentes brutos a frecuencia anual dentro del rango de datos de cada país y después hemos aplicado las fórmulas de la transformación de Kakwani y la media geométrica. El IDHA reconstruido se ha verificado contra los valores publicados por Prados (error absoluto máximo &lt; 0,0001).",
        mtHdi50: "<strong>Paso 2 &mdash; Extensión hasta 2024:</strong> la serie de Prados termina en 2020. Hemos prolongado el IDHA hasta 2024 aplicando las tasas de crecimiento interanual de los componentes del IDH del PNUD (esperanza de vida, educación, renta) y de V-Dem (democracia liberal). La serie del IDH del PNUD termina en 2023; la proyectamos a 2024 aplicando la tasa de crecimiento 2022&rarr;2023.",
        mtHdi51: "<strong>Paso 3 &mdash; Retroproyección del IDH antes de 1990:</strong> para extender el IDH hacia atrás aprovechamos que tres de los cuatro componentes de Prados (renta, esperanza de vida, educación) se corresponden con las tres dimensiones del PNUD. Calculamos un índice de Prados de tres componentes (sin democracia):",
        mtHdi52: "Para los años anteriores a 1990, el IDH se retroproyecta empalmando por razón con la referencia de 1990 del PNUD:",
        mtHdi53: "Así se conserva la metodología y la ponderación del PNUD en el punto de anclaje de 1990 y, a la vez, se extiende hacia atrás con las estimaciones históricas de los componentes de Prados.",
        mtHdi54: "<strong>Paso 4 &mdash; Jerarquía de relleno de huecos:</strong> incluso tras la interpolación y la extensión, muchas celdas país-año siguen vacías. Los huecos se rellenan con un procedimiento jerárquico de tres niveles: (1) relleno por crecimiento con tasas regionales ponderadas por población; (2) interpolación lineal para huecos internos pequeños; (3) asignación de la media regional a los países sin dato alguno.",
        mtHdi55: "Indicadores de fiabilidad",
        mtHdi56: "Cada observación lleva un indicador de fiabilidad, de modo que el lector sepa siempre la calidad de lo que está viendo:",
        mtHdi57: "Original <span style=\"font-weight:400;color:var(--cl)\">&mdash; fiabilidad alta</span>",
        mtHdi58: "<strong>IDHA:</strong> observaciones de referencia publicadas por Prados de la Escosura (24 años concretos por país). <strong>IDH:</strong> valores anuales del PNUD, HDR 2025 (1990&ndash;2023).",
        mtHdi59: "Interpolado / estimado <span style=\"font-weight:400;color:var(--cl)\">&mdash; fiabilidad media</span>",
        mtHdi60: "Incluye: años del IDHA entre referencias (interpolación lineal), extensión del IDHA 2021&ndash;2024, retroproyección del IDH antes de 1990, extrapolación del IDH a 2024 y relleno por crecimiento en países con datos parciales.",
        mtHdi61: "Media regional <span style=\"font-weight:400;color:var(--cl)\">&mdash; fiabilidad baja</span>",
        mtHdi62: "A los países sin ningún dato original les asignamos, para cada año, la media de su región ponderada por población. Da un orden de magnitud plausible, pero arrastra una incertidumbre considerable.",
        mtHdi63: "Citas obligadas",
        mtHdi64: "<strong>Para el IDH (1990&ndash;2023, datos originales del PNUD):</strong><br> UNDP (2025), <em>Human Development Report 2025</em>. United Nations Development Programme. <a href=\"https://hdr.undp.org/\" target=\"_blank\" style=\"color:var(--c1);text-decoration:none;border-bottom:1px solid var(--c1)\">hdr.undp.org</a>",
        mtHdi65: "<strong>Para el IDHA (1870&ndash;2020, datos originales de Prados):</strong><br> Prados de la Escosura, L. (2023), &ldquo;Augmented Human Development in the Age of Globalisation.&rdquo; <em>Economic History Review</em>. DOI: <a href=\"https://doi.org/10.1111/ehr.13244\" target=\"_blank\" style=\"color:var(--c1);text-decoration:none;border-bottom:1px solid var(--c1)\">10.1111/ehr.13244</a>",
        mtHdi66: "<strong>Para las series ampliadas o completas (IDH anterior a 1990, IDHA posterior a 2020, datos rellenados):</strong><br> Infante-Amate, J. (2025). Universidad de Granada. La retroproyección, la extensión y el relleno de huecos son obra de Juan Infante-Amate. Si usas estas series ampliadas, cita esta herramienta además de las fuentes originales.",
        mtPop1: "Población",
        mtPop2: "World Population Prospects de la ONU, vía Our World in Data",
        mtPop3: "Cobertura",
        mtPop4: "199 países",
        mtPop5: "Años",
        mtPop6: "Unidad",
        mtPop7: "Personas",
        mtPop8: "Resolución",
        mtPop9: "Anual",
        mtPop10: "Descripción",
        mtPop11: "Las estimaciones y proyecciones de población proceden de los <strong>World Population Prospects (WPP) de las Naciones Unidas</strong>, consultados a través de Our World in Data. Los WPP son la fuente de referencia de los datos demográficos mundiales y los elabora la División de Población del Departamento de Asuntos Económicos y Sociales de la ONU.",
        mtPop12: "El conjunto ofrece estimaciones anuales de población total para todos los países desde 1950 hasta hoy, con proyecciones demográficas hasta 2100 bajo varios escenarios (variante media, alta y baja). Las estimaciones históricas se remontan a 1750 para los países principales, apoyadas en la investigación en demografía histórica y en los censos.",
        mtPop13: "Metodología",
        mtPop14: "Los WPP de la ONU proyectan la población con el método de componentes por cohortes: parten de la población del año base por edad y sexo y aplican supuestos sobre fecundidad, mortalidad y migración internacional futuras. Las estimaciones históricas integran censos, registros civiles y encuestas demográficas. Our World in Data armoniza las fronteras nacionales y ofrece series temporales coherentes pese a los cambios de fronteras políticas.",
        mtPop15: "Cómo citar",
        mtPop17: "<strong>Cita sugerida:</strong> &ldquo;Datos de población de los World Population Prospects de la ONU (2024), vía Our World in Data.&rdquo;",
        mtGhg1: "Emisiones de gases de efecto invernadero",
        mtGhg2: "Compilación multifuente por tipo de gas",
        mtGhg3: "Cobertura",
        mtGhg4: "199 países",
        mtGhg5: "Años",
        mtGhg6: "Unidad",
        mtGhg7: "Mt CO&#8322;-eq (GWP100) o unidades propias de cada gas",
        mtGhg8: "Gases",
        mtGhg9: "CO&#8322; (fósil), CO&#8322; (usos del suelo), CH&#8324;, N&#8322;O, gases fluorados",
        mtGhg10: "Descripción",
        mtGhg11: "Las emisiones de gases de efecto invernadero se compilan a partir de varias fuentes especializadas, según el tipo de gas. Este enfoque multifuente asegura el mejor dato disponible para cada componente sin perder cobertura de países ni de años.",
        mtGhg12: "Fuentes por tipo de gas",
        mtGhg13: "Gas / componente",
        mtGhg14: "Fuente",
        mtGhg15: "CO&#8322; de combustibles fósiles e industria",
        mtGhg17: "CO&#8322; de usos del suelo y cambios de uso",
        mtGhg19: "CH&#8324; (metano)",
        mtGhg21: "N&#8322;O (óxido nitroso)",
        mtGhg23: "Gases fluorados",
        mtGhg25: "Descomposición",
        mtGhg26: "Las emisiones totales de GEI se descomponen en cinco componentes principales: CO&#8322; de combustibles fósiles e industria (CO&#8322;ff), CO&#8322; de usos del suelo y sus cambios (CO&#8322;luc), metano (CH&#8324;), óxido nitroso (N&#8322;O) y gases fluorados. El CO&#8322; de combustibles fósiles se subdivide además por tipo de combustible: <strong>carbón</strong>, <strong>petróleo</strong>, <strong>gas</strong>, <strong>cemento</strong> y <strong>quema en antorcha</strong>.",
        mtGhg27: "Todos los gases se convierten a CO&#8322;-equivalente con los potenciales de calentamiento global a 100 años (GWP100) del AR6 del IPCC. Los datos de cada gas también están disponibles en sus unidades propias.",
        mtGhg28: "Cómo citar",
        mtGhg29: "<strong>CO&#8322; de combustibles fósiles:</strong> Friedlingstein, P. et al. (2024). &ldquo;Global Carbon Budget 2024.&rdquo; <em>Earth System Science Data</em>. <a href=\"https://doi.org/10.5194/essd-16-5567-2024\" target=\"_blank\" style=\"color:var(--c1)\">doi:10.5194/essd-16-5567-2024</a>",
        mtGhg30: "<strong>CO&#8322; de usos del suelo:</strong> Jones, M.W. et al. (2023). &ldquo;National contributions to climate change due to historical emissions of carbon dioxide, methane, and nitrous oxide since 1850.&rdquo; <em>Scientific Data</em>, 10, 155.",
        mtGhg31: "<strong>CH&#8324;, N&#8322;O y gases fluorados:</strong> G&uuml;tschow, J. et al. (2024). PRIMAP-hist v2.6: country-reported data priority. <em>Zenodo</em>. <a href=\"https://doi.org/10.5281/zenodo.10705513\" target=\"_blank\" style=\"color:var(--c1)\">doi:10.5281/zenodo.10705513</a>",
        mtGhg32: "<strong>Cita sugerida:</strong> cita la fuente o fuentes que correspondan a los gases que uses en tu análisis.",
        mtMfa1: "Análisis de flujos de materiales",
        mtMfa2: "Indicadores de flujos de materiales del conjunto de la economía",
        mtMfa3: "Cobertura",
        mtMfa4: "199 países",
        mtMfa5: "Años",
        mtMfa6: "1970&ndash;2024 (IRP); el mundo desde 1900; 6 países con series históricas anteriores a 1970",
        mtMfa7: "Unidad",
        mtMfa8: "Toneladas (total y per cápita)",
        mtMfa9: "Materiales",
        mtMfa10: "Biomasa, combustibles fósiles, minerales metálicos, minerales no metálicos",
        mtMfa11: "Flujos",
        mtMfa12: "Extracción, consumo, importaciones, exportaciones, huella material",
        mtMfa13: "Fuente principal",
        mtMfa14: "La fuente principal es la <strong>Global Material Flows Database del Panel Internacional de Recursos (IRP) del PNUMA</strong>, consultada a través de la OCDE. Ofrece cuentas de flujos de materiales del conjunto de la economía para todos los Estados miembros de la ONU desde 1970 hasta hoy. Las categorías de materiales son <strong>biomasa</strong> (cultivos alimentarios, forrajes, madera, etc.), <strong>combustibles fósiles</strong> (carbón, petróleo, gas), <strong>minerales metálicos</strong> (hierro, cobre, aluminio, etc.) y <strong>minerales no metálicos</strong> (arena, grava, caliza, etc.).",
        mtMfa15: "Los tipos de flujo disponibles son extracción doméstica (DE), consumo doméstico de materiales (DMC), importaciones, exportaciones, balanza comercial física (importaciones menos exportaciones) y huella material (MF, también llamada consumo de materias primas). Se ofrecen valores totales y per cápita.",
        mtMfa16: "Extensión histórica",
        mtMfa17: "Las series históricas que llegan hasta 1900 en el plano mundial se apoyan en el trabajo pionero de <strong>Krausmann et al. (2018)</strong>, que reconstruyeron el metabolismo socioeconómico de la economía mundial entre 1900 y 2015. En el plano nacional, hay datos anteriores a 1970 para un puñado de países (unos 6) con estudios históricos de flujos de materiales propios.",
        mtMfa18: "Metodología de la retroproyección",
        mtMfa19: "Para el periodo anterior a 1970, las estimaciones nacionales se obtienen aplicando tasas de crecimiento regionales (derivadas de las series mundiales y regionales de Krausmann et al.) a los valores de anclaje de 1970 de la base del IRP. La retroproyección es coherente, pero conviene leer con cautela la trayectoria de cada país por separado.",
        mtMfa20: "Cómo citar",
        mtMfa23: "<strong>Cita sugerida:</strong> &ldquo;Datos de flujos de materiales del IRP del PNUMA (2024) y de Krausmann et al. (2018).&rdquo;",
        mtCrops1: "Usos del suelo &mdash; cultivos y pastos",
        mtCrops2: "Reconstrucciones históricas de los usos del suelo",
        mtCrops3: "Cobertura",
        mtCrops4: "235 países",
        mtCrops5: "Años",
        mtCrops6: "Unidad",
        mtCrops7: "Mha (millones de hectáreas)",
        mtCrops8: "Variables",
        mtCrops9: "Tierras de cultivo, tierra arable, cultivos permanentes, pastos permanentes, superficie agraria total",
        mtCrops10: "Fuentes principales",
        mtCrops11: "Los datos históricos de usos del suelo proceden de la <strong>base HYDE 3.3</strong> (Klein Goldewijk et al., 2023), que ofrece reconstrucciones espacialmente explícitas de tierras de cultivo, tierra arable, cultivos permanentes y pastos permanentes desde el año 10.000 a.&nbsp;C. hasta hoy. En esta plataforma usamos HYDE 3.3 desde 1750, la serie nacional de usos del suelo más larga disponible.",
        mtCrops12: "Para los años más recientes, las <strong>estadísticas de usos del suelo de FAOSTAT</strong> completan el conjunto con actualizaciones anuales basadas en la información que los países remiten a la Organización de las Naciones Unidas para la Alimentación y la Agricultura.",
        mtCrops13: "Variables",
        mtCrops14: "La plataforma ofrece cinco variables de uso del suelo: <strong>tierras de cultivo</strong> (superficie total cultivada), <strong>tierra arable</strong> (cultivos temporales, praderas de siega y barbecho), <strong>cultivos permanentes</strong> (suelo con cultivos de ciclo largo, como frutales o viñedos), <strong>pastos permanentes</strong> (suelo dedicado de forma permanente a forraje herbáceo) y <strong>superficie agraria total</strong> (la suma de todas las categorías). Los valores se dan en millones de hectáreas (Mha) y también per cápita.",
        mtCrops15: "Cómo citar",
        mtCrops18: "<strong>Cita sugerida:</strong> &ldquo;Datos de usos del suelo de HYDE 3.3 (Klein Goldewijk et al., 2023) y FAOSTAT.&rdquo;",
        mtBio1: "Biodiversidad &mdash; Índice de la Lista Roja",
        mtBio2: "Índice de la Lista Roja de la UICN (indicador ODS 15.5.1 de la ONU)",
        mtBio3: "Cobertura",
        mtBio4: "199 países",
        mtBio5: "Años",
        mtBio6: "Unidad",
        mtBio7: "Índice 0&ndash;1",
        mtBio8: "Indicador ODS",
        mtBio9: "Descripción",
        mtBio10: "El <strong>Índice de la Lista Roja (RLI) de la UICN</strong> mide la tendencia del estado de conservación de grupos de especies. Se basa en los cambios reales en el número de especies de cada categoría de riesgo de extinción de la Lista Roja de Especies Amenazadas de la UICN y es el indicador oficial <strong>15.5.1</strong> de los Objetivos de Desarrollo Sostenible de la ONU (avance en la reducción de la pérdida de biodiversidad).",
        mtBio11: "Un valor de <strong>1,0</strong> significa que todas las especies están clasificadas como &ldquo;preocupación menor&rdquo;, es decir, que no se espera que ninguna se extinga en un futuro próximo. Un valor de <strong>0</strong> significa que todas se han extinguido. Un RLI que baja indica que la tasa esperada de futuras extinciones empeora.",
        mtBio12: "El índice se calcula para cada país a partir de las especies cuya área de distribución se solapa con su territorio. Cubre mamíferos, aves, anfibios, corales formadores de arrecife y cícadas: los grupos evaluados de forma exhaustiva en la Lista Roja de la UICN al menos dos veces.",
        mtBio13: "Cómo citar",
        mtBio15: "<strong>Cita sugerida:</strong> &ldquo;Datos del Índice de la Lista Roja de la UICN (2024), usados como indicador ODS 15.5.1 de la ONU.&rdquo;",
        mtPub1: "Publicaciones principales",
        mtPub5: "Referencias de las fuentes de datos",
    },
    zh: {
        pubRead: "\u9605\u8bfb\u8bba\u6587 &rarr;",
        htmlLang: 'zh',
        pageTitle: 'Growth & Earth：1750年以来的全球发展与环境变化',
        introTitle: 'Growth & Earth',
        introKicker: '1750年以来的全球发展与环境变化',
        poemLabel: 'Antonio Machado, Proverbios y cantares, XXIX',
        poemQuote: '“Caminante, son tus huellas<br>el camino, y nada más;<br>caminante, no hay camino:<br>se hace camino al andar.<br>Al andar se hace camino,<br>y al volver la vista atrás<br>se ve la senda que nunca<br>se ha de volver a pisar.<br>Caminante, no hay camino,<br>sino estelas en la mar.”',
        poemCredit: 'Antonio Machado, Campos de Castilla (1912)',
        dataLabel: '探索数据',
        siteDescription: '本网站汇编各国关于经济发展、资源使用与环境影响的历史序列。',
        introButton: '探索轨迹',
        loadingSubtitle: '正在加载两个半世纪的发展与环境变化…',
        fallbackIntro: '一套关于<strong>经济发展</strong>、<strong>资源使用</strong>与<strong>环境影响</strong>的可比较历史序列汇编，覆盖各国与世界区域。',
        logoHtml: 'Growth &amp; Earth <span>增长与地球 · 1750年以来</span>',
        navProfile: '国⁠家⁠概⁠况',
        navExplore: '探⁠索',
        navAnalysis: '分⁠析',
        navAbout: '关⁠于',
        navProfileShort: '国⁠家⁠概⁠况',
        navWhatif: '假⁠如？',
        whatifTitle: '假如？',
        whatifSubtitle: '三个旋钮，一份碳预算',
        whatifModeLabel: '模式',
        whatifModeAhead: '展望 <span class="wi-mode-when">· 2025–2050</span>',
        whatifModeBehind: '回望 <span class="wi-mode-when">· 1850–2024</span>',
        whatifDialsTitle: "旋钮",
        whatifDial1: "经济增长",
        whatifDial1Unit: "人均 GDP，%/年",
        whatifDial2: "技术变迁",
        whatifDial2Unit: "每美元 CO₂，%/年",
        whatifDial3: "人口",
        whatifDial3Unit: "联合国《世界人口展望 2024》",
        whatifSolveTitle: "求解…",
        whatifSolveTarget: "目标",
        whatifSolveProbability: "概率",
        whatifSolveUnknown: "未知量",
        whatifSolveHorizon: "时间跨度",
        whatifSolveIntensity: "每美元 CO₂",
        whatifSolveGrowth: "人均 GDP",
        whatifSolveApply: "应用到旋钮",
        whatifHorizon2050: "至 2050 年",
        whatifHorizon2100: "速率不变，至 2100 年",
        whatifTarget15: "1.5 °C",
        whatifTarget20: "2 °C",
        whatifTarget30: "≈ 3 °C（温度计刻度，推导值）",
        whatifProb50: "50 %",
        whatifProb67: "67 %",
        whatifProb83: "83 %",
        whatifPopLow: "联合国低方案",
        whatifPopMedium: "联合国中方案",
        whatifPopHigh: "联合国高方案",
        whatifCardCum: "2025–2050 累计排放",
        whatifCardRemaining: "2050 年剩余预算",
        whatifCardExhaustion: "预算耗尽",
        whatifCard2050: "2050 年排放相对 2024 年",
        whatifCardDeltaGt: "Δ 累计排放 1850–2024",
        whatifCardDeltaT: "Δ 当前升温",
        whatifCardCrossing: "预算越过时间",
        whatifCardGdp: "2024 年人均 GDP",
        whatifBehindRegion: "区域",
        whatifBehindReference: "参照",
        whatifBehindFrom: "起始年",
        whatifBehindMode: "反事实",
        whatifBehindModeRate: "相同增长率",
        whatifBehindModeLevel: "相同收入水平",
        whatifBehindIntensity: "碳强度",
        whatifBehindIntOwn: "自身的",
        whatifBehindIntRef: "参照方的",
        whatifBehindIntWorld: "世界平均",
        whatifBehindMini: "人均 GDP",
        whatifThermTitle: "温度计",
        whatifThermToday: "当前",
        whatifThermNote: "温度计只计入 CO₂；2 °C 的预算耗尽时它读数约为 1.9 °C，因为 IPCC 的预算同时为非 CO₂ 增温留出了空间。",
        whatifBudgetNote: "预算自 2025 年 1 月 1 日起算：1.5 °C 为 320.6 Gt 化石 CO₂，2 °C 为 1,170.6 Gt，二者均按 50 % 概率。更新的估计要小得多。",
        whatifHonestyLabel: "方法与局限",
        whatifHonestyLead: "这是 Kaya 恒等式的算术，不是气候模式 —— 方法与局限",
        whatifHonesty: "<strong>这是 Kaya 恒等式的算术，不是气候模式。</strong>排放 = 人口 × 人均 GDP × 每美元 CO₂，年变化率由你选定且保持不变。升温度数由 IPCC 的累积碳排放瞬时气候响应（TCRE，每 1,000 Gt CO₂ 升温 0.45 °C，可能范围 0.27–0.63）推得，并加上 2024 年 1.36 °C 的人为增温（Forster et al. 2025）。碳预算取自 <em>Safe space</em> 一文所用的 AR6 剩余预算（自 2020 年起，1.5 °C 为 500 Gt、2 °C 为 1,350 Gt，均按 50 % 概率），扣除 2020–2024 年的排放后，仅与化石 CO₂ 比较（不含土地利用 CO₂；非 CO₂ 气体不进入温度计，该文以 ×1.25 的系数折入预算）。更新的估计要小得多（自 2025 年起，1.5 °C 仅 130 Gt，Forster et al. 2025）。此处没有任何反馈：增长不会改变人口、价格或技术。过去无法重演；这些只是思想实验。",
        whatifLoading: "正在加载「假如」的数据…",
        whatifError: "无法加载「假如」的数据。",
        whatifRetry: "重试",
        homeTitle: '返回介绍',
        footerBrand: 'Growth & Earth · Infante-Amate, Aguilera & Travieso ·',
        footerAbout: '关于与数据来源',
        aboutTabAbout: '关于',
        aboutTabMethodology: '方法',
        aboutTabPublications: '出版物',
        aboutTitle: '关于 Growth & Earth',
        aboutLead: '自工业革命以来，现代经济增长支撑了不断扩大的人口，并带来了教育与健康的非凡进步，同时也通过温室气体排放、耕地扩张和原材料开采改变了地球。Growth & Earth 是一个探索这段不均衡的全球发展与环境变化历史的地方。它汇编各国关于经济发展、资源使用、温室气体排放、物质流、土地利用、生物多样性以及其他环境影响的历史序列，时间跨度从十八世纪延伸至今。',
        conceptHeading: '概念框架',
        conceptOne: '封面保留了 Machado 的诗句，因为这个隐喻既是诗意的，也是方法论的。发展并不沿着一条预设道路前进。不同国家留下的痕迹会分叉、上升、下落，有时还彼此矛盾。',
        conceptTwo: '历史记录让我们能够回望这些航迹：哪里收入增长，哪里人类发展改善，哪里资源使用加剧，哪里排放累积，哪里环境影响变得可见。一些早期估计存在不确定性，但旅行的方向在身后比在前方更清楚。',
        viewerHeading: '这个视图展示什么',
        viewerText: '本平台连接国家概况、地图、排名、时间序列比较、脱钩模式和分解工具。读者可以追踪两个世纪全球变化中，GDP、HDI、人口、排放、物质流、土地利用和生物多样性指标如何共同变化或彼此分离。',
        teamHeading: '团队',
        originsHeading: '起源与未来方向',
        originsOne: '这个项目最初的工作名是 <strong>Cascorro</strong>，来自马德里历史中心充满活力的 <em>Plaza de Cascorro</em>。在马德里的多次研究会议中，团队三位成员常常在这座广场以啤酒和谈话结束一天。一个非正式的会面地点，逐渐成为项目构思和成形的地方。',
        originsTwo: '标题 <strong>Growth &amp; Earth</strong>（增长与地球）指向这个故事的两面：现代经济增长，以及支撑了这一增长并被其改变的地球。取自 Machado 诗句的海上航迹意象，仍以西班牙语副标题 <em>Estelas del crecimiento</em> 的形式留在项目中：发展没有预设道路，而是由多条可以从历史中重建的路径组成。回望这些航迹，可以同时看到人类发展的进步，以及温室气体排放、物质压力、土地利用变化和生物多样性损失。',
        originsThree: 'Growth &amp; Earth 是一项持续推进的研究计划。未来工作将加入<strong>新指标</strong>、更新数据，并发表更多从历史视角分析环境压力与社会经济发展关系的研究。',
        dataSourcesHeading: '数据来源',
        dataSourcesText: '平台中的所有数据都来自公开数据集。<strong>方法</strong>标签中的每个指标都记录了原始来源、覆盖范围和引用要求。如果你在研究中使用 Growth &amp; Earth 中的数据或可视化，请同时引用原始数据提供者，以及方法部分列出的 Infante-Amate、Travieso &amp; Aguilera 相关出版物。',
        loadFail: "数据加载失败。请在控制台查看错误信息。",
        flashCopied: "已复制",
        flashDone: "完成",
        flashNoFigure: "无图形",
        flashError: "错误",
        ariaLanguage: "语言",
        promptCopyLink: "复制此链接：",
        figCountryProfile: "国家概况",
        figAnalysis: "分析",
        figAboutSources: "关于与数据来源",
        introMore: "关于数据来源、方法与引用的更多信息，请见<a href=\"#\" onclick=\"document.getElementById('intro-enter').click();setTimeout(function(){document.querySelector('[data-section=about]').click()},800);return false;\">「关于」</a>。",
        phSearchCountries: "搜索国家…",
        phSearch: "搜索…",
        phSearchCountryRegion: "搜索国家或地区…",
        pstatPop: "人口",
        pstatGdpPc: "人均GDP",
        pstatHdi: "HDI",
        pstatGhg: "温室气体",
        pstatCropland: "耕地",
        pstatMfa: "物质流",
        pchartPop: "人口 <span class=\"profile-unit\">(M)</span>",
        pchartGdpPc: "人均 GDP <span class=\"profile-unit\">($PPP)</span>",
        pchartHdi: "人类发展指数",
        pchartGhg: "温室气体排放 <span class=\"profile-unit\">(Mt)</span>",
        pchartCropland: "耕地 <span class=\"profile-unit\">(Mha)</span>",
        pchartMfa: "物质开采 <span class=\"profile-unit\">(Mt)</span>",
        pchartGhgGdp: "温室气体 / GDP <span class=\"profile-unit\">(kg/$)</span>",
        pchartCropGdp: "耕地 / GDP <span class=\"profile-unit\">(ha/k$)</span>",
        pchartMfaGdp: "物质流 / GDP <span class=\"profile-unit\">(kg/$)</span>",
        tilePop: "人口",
        tileGdp: "GDP",
        tileHdi: "HDI",
        tileGhg: "温室气体",
        tileMaterials: "物质",
        tileCrops: "耕地",
        tileBio: "生物",
        tilePopTitle: "人口",
        tileGdpTitle: "国内生产总值",
        tileHdiTitle: "人类发展",
        tileGhgTitle: "温室气体排放",
        tileMfaTitle: "物质流",
        tileCropsTitle: "耕地与土地利用",
        tileBioTitle: "生物多样性",
        viewMap: "地⁠图",
        viewTrend: "趋⁠势",
        viewComposition: "构⁠成",
        viewRanking: "排⁠名",
        viewTable: "表⁠格",
        btnCountries: "国⁠家",
        btnSettings: "设⁠置",
        optGhgTotal: "温室气体总量",
        optCo2ff: "化石燃料 CO&#8322;",
        optGhgPc: "人均温室气体",
        optGdpPc: "人均 GDP",
        optHdi: "人类发展指数",
        optPop: "人口",
        optAnnual: "逐年",
        optCumulative: "累计",
        optTop20: "前 20",
        optTop30: "前 30",
        optTop50: "前 50",
        optAll: "全部",
        optAbsolute: "绝对值",
        optPctWorld: "占世界总量的 %",
        optPctGroup: "占所选国家的 %",
        optIndex: "指数（首年 = 100）",
        optGhgEmissions: "温室气体排放",
        optCo2ffPc: "人均化石 CO&#8322;",
        optGdpTotal: "GDP 总量",
        optAhdi: "扩展人类发展指数（Prados）",
        optGdp: "GDP",
        optGhg: "温室气体",
        optCo2Fossil: "化石 CO&#8322;",
        optGdpPcShort: "人均 GDP",
        optWaterfall: "瀑布图",
        optGroupedBar: "分组对比",
        optFaceted: "分面瀑布图",
        optTapioGhg: "温室气体（总量）",
        tapioWin5: "5 年",
        tapioWin10: "10 年",
        tapioWin20: "20 年",
        sheetTitle: "探索设置",
        ariaCloseSettings: "关闭设置",
        ttResizePanel: "调整设置面板宽度",
        rpSettings: "设置",
        rpIndicator: "指标",
        rpCountries: "国家",
        lblUnit: "单位",
        btnTotalLc: "总量",
        btnPerCapitaLc: "人均",
        lblCompare: "对比",
        btn1Map: "1 张地图",
        btn2Maps: "2 张地图",
        ttSingleMap: "单张地图",
        ttCompareYears: "比较两个年份",
        lblDraw: "绘制",
        ttLines: "折线",
        ttStacked: "堆叠面积",
        lblValues: "数值",
        ttValueTransform: "数值变换",
        lblScale: "标度",
        btnLinear: "线性",
        btnLog: "对数",
        lblPanels: "分面",
        btnAll: "全部",
        btnCountry: "按国家",
        btnComponent: "按组分",
        lblYAxis: "Y 轴",
        btnShared: "共用",
        btnFree: "独立",
        lblGasType: "气体类型",
        presetTotalCO2: "CO&#8322; 总量",
        presetTotalGHG: "温室气体总量",
        presetCO2Decomp: "CO&#8322; 分解",
        presetGHGDecomp: "温室气体分解",
        gasCoal: "煤炭 CO&#8322;",
        gasOil: "石油 CO&#8322;",
        gasGas: "天然气 CO&#8322;",
        gasCo2luc: "土地利用 CO&#8322;",
        gasCh4: "CH&#8324;",
        gasN2o: "N&#8322;O",
        gasFgas: "含氟气体",
        lblFlowType: "流量类型",
        flowExt: "开采",
        flowCon: "消费",
        flowImp: "进口",
        flowExp: "出口",
        flowBal: "实物贸易差额",
        flowMf: "物质足迹",
        lblMaterial: "材料",
        presetMatTotal: "总量",
        presetDecomposed: "全部分解",
        matBio: "生物质",
        matFf: "化石燃料",
        matMet: "金属矿",
        matMin: "非金属矿",
        lblType: "类型",
        btnHdiConv: "常规",
        btnHdiAug: "扩展版（Prados）",
        lblLandType: "土地类型",
        presetCropTotal: "农业用地总面积",
        cropCropland: "耕地",
        cropArable: "可耕地",
        cropPermanent: "永久性作物",
        cropPastures: "永久性牧场",
        btnPopTotal: "总量",
        btnPopDensity: "密度（/km²）",
        bioNote: "红色名录指数（0&ndash;1，1 = 所有物种均为无危）",
        btnClear: "清除",
        anIntensities: "强⁠度",
        anDrivers: "驱⁠动⁠因⁠素",
        anCorrelations: "相⁠关",
        anRecessions: "衰⁠退",
        anTapio: "Tapio",
        lblXAxis: "X 轴",
        lblSlashXAxis: "/ X 轴",
        lblFrom: "起始",
        lblTo: "截至",
        lblChart: "图表",
        lblSize: "大小",
        lblAxes: "坐标轴",
        lblScope: "范围",
        lblView: "视图",
        lblEmissionType: "排放类型",
        lblYearWindow: "年份窗口",
        btnTotal: "总量",
        btnPerCap: "人均",
        btnLin: "线性",
        corrFixed: "固定",
        corrMobile: "自适应",
        corrScopeAll: "所有国家",
        corrScopeSel: "仅所选",
        recReductions: "减排",
        recDecomposition: "分解",
        analysisTitleDefault: "请选择分析类型",
        analysisSubtitleDefault: "选择国家与分析模式",
        footLink: "链⁠接",
        footReset: "重⁠置",
        footFullscreen: "全⁠屏",
        ttFootLink: "复制指向当前视图的链接（板块、指标、年份、国家）",
        ttFootPng: "将屏幕上的图形下载为 PNG",
        ttFootReset: "返回初始视图",
        cpickerTitle: "国家与地区",
        teamDesc1: "环境史与经济史",
        teamDesc2: "经济史与环境史",
        teamDesc3: "农业生态学与气候科学",
        mtHead1: "数据来源与方法",
        mtHead2: "本平台整合多套数据集，以呈现全球环境与人类发展趋势的全貌。请在下方选择一个指标，查看其详细方法、来源、覆盖范围与引用要求。",
        mtHead3: "GDP",
        mtHead4: "HDI",
        mtHead5: "人口",
        mtHead6: "温室气体",
        mtHead7: "物质",
        mtHead8: "土地利用",
        mtHead9: "生物多样性",
        mtGdp1: "GDP &mdash; Maddison Project Database",
        mtGdp2: "长期视角下的人均国内生产总值",
        mtGdp3: "覆盖范围",
        mtGdp4: "199 个国家",
        mtGdp5: "年份范围",
        mtGdp6: "单位",
        mtGdp7: "2011 年国际元（购买力平价）",
        mtGdp8: "时间分辨率",
        mtGdp9: "逐年",
        mtGdp10: "说明",
        mtGdp11: "主要来源是 <strong>Maddison Project Database</strong>（2023 年版），目前可得的最完整的长期可比经济数据集。该数据库由 Angus Maddison 创建，现由格罗宁根大学的团队维护。它以 2011 年国际元（购买力平价）提供大量国家的人均 GDP 估计，许多序列可回溯至十八世纪甚至更早。",
        mtGdp12: "2023 年版纳入了新的基准估计与方法改进，给出了世界经济长期演变最可靠的图景。在本平台中，Maddison 的序列以<strong>世界银行世界发展指标（WDI）</strong>向后延伸，补足 Maddison 版本尚未覆盖的最近年份。",
        mtGdp13: "缺口填补方法",
        mtGdp14: "对于 Maddison Project Database 未覆盖的国家与年份，人均 GDP 采用分层方法估计：（1）使用世界银行 WDI 的增长率将已有序列向后延伸；（2）对历史缺口，采用按人口加权的区域增长模式，并锚定在该国最邻近的已知数值上；（3）对完全没有数据的国家，赋以按人口加权的区域平均值。",
        mtGdp15: "如何引用",
        mtGdp17: "<strong>建议引用：</strong>&ldquo;GDP 数据来自 Maddison Project Database 2023（Bolt &amp; van Zanden, 2024），并以世界银行 WDI 延伸。&rdquo;",
        mtHdi1: "人类发展指数（HDI）",
        mtHdi2: "标准 HDI（UNDP）与扩展 HDI（Prados de la Escosura）",
        mtHdi3: "覆盖范围",
        mtHdi4: "199 个国家",
        mtHdi5: "年份范围",
        mtHdi6: "单位",
        mtHdi7: "指数 0&ndash;1",
        mtHdi8: "变体",
        mtHdi9: "HDI、扩展 HDI（含民主维度）、不含收入的 HDI（HDI<sub>ni</sub>）",
        mtHdi10: "人类发展指数（HDI）",
        mtHdi11: "<strong>人类发展指数（HDI）</strong>由联合国开发计划署于 1990 年在首份<em>《人类发展报告》</em>中提出。它由经济学家 Mahbub ul Haq 与 Amartya Sen 构想，旨在把发展经济学的关注点从单纯的收入移开，用一个综合指标概括人类发展三个关键维度的平均成就：",
        mtHdi12: "健康",
        mtHdi13: "出生时预期寿命。",
        mtHdi14: "教育",
        mtHdi15: "平均受教育年限与预期受教育年限。",
        mtHdi16: "生活水平",
        mtHdi17: "人均国民总收入（购买力平价美元）。",
        mtHdi18: "HDI 是各维度归一化指数的<strong>几何平均值</strong>，取值在 0 与 1 之间。UNDP 每年为 190 多个国家发布 HDI，最新一期《人类发展报告》（UNDP, 2025）覆盖 <strong>1990 至 2023 年</strong>。",
        mtHdi19: "HDI 已成为世界上使用最广泛的人类发展综合指标，为人均 GDP 等纯经济指标提供了对照。更多信息见 <a href=\"https://hdr.undp.org/data-center/human-development-index\" target=\"_blank\" style=\"color:var(--c1);text-decoration:none;border-bottom:1px solid var(--c1)\">UNDP 人类发展数据中心</a>。",
        mtHdi20: "扩展人类发展指数（AHDI）",
        mtHdi21: "<strong>AHDI</strong> 由 Prados de la Escosura（2023）提出，在两个方面扩展了标准 HDI：（1）增加第四个维度&mdash;&mdash;<strong>自由民主</strong>；（2）提供可回溯至 <strong>1870 年</strong>的历史估计，远早于 UNDP 的 1990 年起点。AHDI 是四个归一化分量的几何平均值：",
        mtHdi22: "收入",
        mtHdi23: "人均 GDP（1990 年 GK 美元）。Kakwani 变换，Mo&nbsp;=&nbsp;$100，M&nbsp;=&nbsp;$47,000。",
        mtHdi24: "预期寿命",
        mtHdi25: "出生时年数。Kakwani 变换，Mo&nbsp;=&nbsp;20，M&nbsp;=&nbsp;85。",
        mtHdi26: "教育",
        mtHdi27: "平均受教育年限。Kakwani 变换，Mo&nbsp;=&nbsp;0，M&nbsp;=&nbsp;15。",
        mtHdi28: "自由民主",
        mtHdi29: "V-Dem 的 v2x_libdem 指数，直接以 0&ndash;1 的标度使用。",
        mtHdi30: "每个分量都用 Prados 的非线性 <strong>Kakwani 变换</strong>归一化，以刻画收益递减&mdash;&mdash;低水平上的改善比高水平上的改善权重更大：",
        mtHdi31: "其中 <em>x</em> 为实际值，<em>Mo</em> 为最小值，<em>M</em> 为最大值。V-Dem 的自由民主指数（0&ndash;1）直接使用，不作变换。",
        mtHdi32: "合成的 AHDI 为：",
        mtHdi33: "Prados 在 <em>Economic History Review</em> 上发表了 <strong>162 个国家</strong>在 24 个基准年份（1870、1880、&hellip;、2010、2015、2020）的分量原始值。这是目前可得的最完整的人类发展长期数据集。",
        mtHdi34: "各分量的上下限",
        mtHdi35: "分量",
        mtHdi36: "最小值（Mo）",
        mtHdi37: "最大值（M）",
        mtHdi38: "变换",
        mtHdi39: "收入（人均 GDP，1990 年 GK 美元）",
        mtHdi40: "Kakwani（对数）",
        mtHdi41: "预期寿命（年）",
        mtHdi42: "Kakwani（对数）",
        mtHdi43: "教育（平均受教育年限）",
        mtHdi44: "Kakwani（对数）",
        mtHdi45: "自由民主（V-Dem）",
        mtHdi46: "直接使用（不变换）",
        mtHdi47: "本视图的数据处理流程",
        mtHdi48: "原始数据集覆盖的国家数不同，且面板不平衡：Prados 提供 162 个国家、24 个稀疏基准年份（1870&ndash;2020），而 UNDP 覆盖 206 个实体但仅自 1990 年起。本视图将两套来源合并、延伸并填补缺口，形成 <strong>199 个联合国承认国家 &times; 155 年（1870&ndash;2024）</strong>的完整面板。",
        mtHdi49: "<strong>第一步 &mdash; 基准年份的逐年插值：</strong>Prados 公布的是 24 个基准年份的分量原始值。我们在每个国家的数据区间内，将原始分量线性插值为逐年频率，再套用 Kakwani 变换公式与几何平均。重建的 AHDI 已与 Prados 发表的数值核对（最大绝对误差 &lt; 0.0001）。",
        mtHdi50: "<strong>第二步 &mdash; 延伸至 2024 年：</strong>Prados 的序列止于 2020 年。我们利用 UNDP HDI 各分量（预期寿命、教育、收入）与 V-Dem（自由民主）的同比增长率，将 AHDI 延伸至 2024 年。UNDP 的 HDI 序列止于 2023 年；我们以 2022&rarr;2023 的增长率外推至 2024 年。",
        mtHdi51: "<strong>第三步 &mdash; 将 HDI 回推至 1990 年之前：</strong>为把 HDI 向前延伸，我们利用 Prados 四个分量中的三个（收入、预期寿命、教育）与 UNDP 三个维度相对应这一点，先计算一个三分量的 Prados 指数（不含民主维度）：",
        mtHdi52: "对 1990 年以前的年份，HDI 以比值拼接的方式回推到 UNDP 的 1990 年基准：",
        mtHdi53: "这样既在 1990 年的锚点上保留了 UNDP 的方法与权重，又能借助 Prados 的历史分量估计向前延伸。",
        mtHdi54: "<strong>第四步 &mdash; 缺口填补的层级：</strong>即便经过插值与延伸，仍有许多国家&ndash;年份的单元格为空。缺口按三级层次填补：（1）以按人口加权的区域增长率进行增长式填补；（2）对内部小缺口作线性插值；（3）对完全没有数据的国家赋以区域平均值。",
        mtHdi55: "可靠性标识",
        mtHdi56: "每个观测值都带有可靠性标识，读者因此始终知道所看数据的质量：",
        mtHdi57: "原始值 <span style=\"font-weight:400;color:var(--cl)\">&mdash; 高可靠性</span>",
        mtHdi58: "<strong>AHDI：</strong>Prados de la Escosura 发表的基准观测值（每国 24 个特定年份）。<strong>HDI：</strong>UNDP《人类发展报告 2025》的逐年数值（1990&ndash;2023）。",
        mtHdi59: "插值 / 估计 <span style=\"font-weight:400;color:var(--cl)\">&mdash; 中等可靠性</span>",
        mtHdi60: "包括：AHDI 基准年之间的年份（线性插值）、AHDI 2021&ndash;2024 年的延伸、HDI 1990 年前的回推、HDI 2024 年的外推，以及对数据不完整国家的增长式填补。",
        mtHdi61: "区域平均 <span style=\"font-weight:400;color:var(--cl)\">&mdash; 低可靠性</span>",
        mtHdi62: "对完全没有原始数据的国家，我们按年赋以其所在区域按人口加权的平均值。这能给出量级上合理的估计，但不确定性相当大。",
        mtHdi63: "必需的引用",
        mtHdi64: "<strong>HDI（1990&ndash;2023，UNDP 原始数据）：</strong><br> UNDP (2025), <em>Human Development Report 2025</em>. United Nations Development Programme. <a href=\"https://hdr.undp.org/\" target=\"_blank\" style=\"color:var(--c1);text-decoration:none;border-bottom:1px solid var(--c1)\">hdr.undp.org</a>",
        mtHdi65: "<strong>AHDI（1870&ndash;2020，Prados 原始数据）：</strong><br> Prados de la Escosura, L. (2023), &ldquo;Augmented Human Development in the Age of Globalisation.&rdquo; <em>Economic History Review</em>. DOI: <a href=\"https://doi.org/10.1111/ehr.13244\" target=\"_blank\" style=\"color:var(--c1);text-decoration:none;border-bottom:1px solid var(--c1)\">10.1111/ehr.13244</a>",
        mtHdi66: "<strong>扩展或完整序列（1990 年前的 HDI、2020 年后的 AHDI、填补后的数据）：</strong><br> Infante-Amate, J. (2025). Universidad de Granada. 回推、延伸与缺口填补由 Juan Infante-Amate 完成。使用这些扩展序列时，请在引用原始来源之外同时引用本工具。",
        mtPop1: "人口",
        mtPop2: "联合国《世界人口展望》，经由 Our World in Data",
        mtPop3: "覆盖范围",
        mtPop4: "199 个国家",
        mtPop5: "年份范围",
        mtPop6: "单位",
        mtPop7: "人",
        mtPop8: "时间分辨率",
        mtPop9: "逐年",
        mtPop10: "说明",
        mtPop11: "人口估计与预测来自<strong>联合国《世界人口展望》（WPP）</strong>，经由 Our World in Data 获取。WPP 是全球人口数据的首要来源，由联合国经济和社会事务部人口司编制。",
        mtPop12: "该数据集提供 1950 年至今各国人口总量的逐年估计，并在多种情景（中、高、低变体）下给出直至 2100 年的人口预测。对主要国家，历史估计可回溯至 1750 年，依据的是历史人口学研究与普查资料。",
        mtPop13: "方法",
        mtPop14: "联合国 WPP 采用队列要素法推算人口：以基年按年龄和性别划分的人口为起点，并对未来生育率、死亡率与国际迁移作出假设。历史估计整合了普查数据、生命登记系统与人口调查。Our World in Data 对国界作了协调，使序列在政治边界变动前后保持一致。",
        mtPop15: "如何引用",
        mtPop17: "<strong>建议引用：</strong>&ldquo;人口数据来自联合国《世界人口展望》（2024），经由 Our World in Data。&rdquo;",
        mtGhg1: "温室气体排放",
        mtGhg2: "按气体种类的多来源汇编",
        mtGhg3: "覆盖范围",
        mtGhg4: "199 个国家",
        mtGhg5: "年份范围",
        mtGhg6: "单位",
        mtGhg7: "Mt CO&#8322;-当量（GWP100），或各气体的原生单位",
        mtGhg8: "气体",
        mtGhg9: "CO&#8322;（化石）、CO&#8322;（土地利用）、CH&#8324;、N&#8322;O、含氟气体",
        mtGhg10: "说明",
        mtGhg11: "温室气体排放按气体种类从多个专门来源汇编。这种多来源的做法为每一分项取得质量最高的数据，同时保持完整的国家与时间覆盖。",
        mtGhg12: "按气体种类的来源",
        mtGhg13: "气体 / 分项",
        mtGhg14: "来源",
        mtGhg15: "化石燃料与工业的 CO&#8322;",
        mtGhg17: "土地利用与土地利用变化的 CO&#8322;",
        mtGhg19: "CH&#8324;（甲烷）",
        mtGhg21: "N&#8322;O（氧化亚氮）",
        mtGhg23: "含氟气体",
        mtGhg25: "分解",
        mtGhg26: "温室气体排放总量被分解为五个主要分项：化石燃料与工业的 CO&#8322;（CO&#8322;ff）、土地利用及其变化的 CO&#8322;（CO&#8322;luc）、甲烷（CH&#8324;）、氧化亚氮（N&#8322;O）与含氟气体。化石燃料 CO&#8322; 再按燃料细分为<strong>煤炭</strong>、<strong>石油</strong>、<strong>天然气</strong>、<strong>水泥</strong>与<strong>火炬燃烧</strong>。",
        mtGhg27: "所有气体均按 IPCC AR6 的 100 年全球增温潜势（GWP100）折算为 CO&#8322; 当量。各气体的数据也提供其原生单位。",
        mtGhg28: "如何引用",
        mtGhg29: "<strong>化石燃料 CO&#8322;：</strong>Friedlingstein, P. et al. (2024). &ldquo;Global Carbon Budget 2024.&rdquo; <em>Earth System Science Data</em>. <a href=\"https://doi.org/10.5194/essd-16-5567-2024\" target=\"_blank\" style=\"color:var(--c1)\">doi:10.5194/essd-16-5567-2024</a>",
        mtGhg30: "<strong>土地利用 CO&#8322;：</strong>Jones, M.W. et al. (2023). &ldquo;National contributions to climate change due to historical emissions of carbon dioxide, methane, and nitrous oxide since 1850.&rdquo; <em>Scientific Data</em>, 10, 155.",
        mtGhg31: "<strong>CH&#8324;、N&#8322;O 与含氟气体：</strong>G&uuml;tschow, J. et al. (2024). PRIMAP-hist v2.6: country-reported data priority. <em>Zenodo</em>. <a href=\"https://doi.org/10.5281/zenodo.10705513\" target=\"_blank\" style=\"color:var(--c1)\">doi:10.5281/zenodo.10705513</a>",
        mtGhg32: "<strong>建议引用：</strong>请按分析中所用气体种类引用相应来源。",
        mtMfa1: "物质流分析",
        mtMfa2: "全经济范围的物质流指标",
        mtMfa3: "覆盖范围",
        mtMfa4: "199 个国家",
        mtMfa5: "年份范围",
        mtMfa6: "1970&ndash;2024（IRP）；世界层面自 1900 年起；6 个国家有 1970 年以前的历史序列",
        mtMfa7: "单位",
        mtMfa8: "吨（总量与人均）",
        mtMfa9: "材料",
        mtMfa10: "生物质、化石燃料、金属矿、非金属矿",
        mtMfa11: "流量",
        mtMfa12: "开采、消费、进口、出口、物质足迹",
        mtMfa13: "主要来源",
        mtMfa14: "主要来源是<strong>联合国环境规划署国际资源专家委员会（IRP）的全球物质流数据库</strong>，经由 OECD 获取。该数据库提供所有联合国成员国自 1970 年至今的全经济范围物质流账户。材料类别包括<strong>生物质</strong>（粮食作物、饲料、木材等）、<strong>化石燃料</strong>（煤、石油、天然气）、<strong>金属矿</strong>（铁、铜、铝等）与<strong>非金属矿</strong>（砂、砾石、石灰石等）。",
        mtMfa15: "可用的流量类型包括国内开采（DE）、国内物质消费（DMC）、进口、出口、实物贸易差额（进口减出口）与物质足迹（MF，亦称原材料消费）。总量与人均值均有提供。",
        mtMfa16: "历史延伸",
        mtMfa17: "在世界层面可回溯至 1900 年的历史序列，依托 <strong>Krausmann 等（2018）</strong>的开创性工作，他们重建了 1900&ndash;2015 年全球经济的社会经济代谢。在国家层面，只有少数国家（约 6 个）因有专门的历史物质流研究而具备 1970 年以前的数据。",
        mtMfa18: "回推方法",
        mtMfa19: "对 1970 年以前的时期，国家层面的估计是把区域增长率（取自 Krausmann 等的全球/区域序列）应用到 IRP 数据库 1970 年的锚定值上得到的。这样的回推在整体上是一致的，但对单个国家的轨迹应谨慎解读。",
        mtMfa20: "如何引用",
        mtMfa23: "<strong>建议引用：</strong>&ldquo;物质流数据来自 UNEP IRP（2024）与 Krausmann 等（2018）。&rdquo;",
        mtCrops1: "土地利用 &mdash; 耕地与牧场",
        mtCrops2: "土地利用的历史重建",
        mtCrops3: "覆盖范围",
        mtCrops4: "235 个国家",
        mtCrops5: "年份范围",
        mtCrops6: "单位",
        mtCrops7: "Mha（百万公顷）",
        mtCrops8: "变量",
        mtCrops9: "耕地、可耕地、永久性作物、永久性牧场、农业用地总面积",
        mtCrops10: "主要来源",
        mtCrops11: "历史土地利用数据来自 <strong>HYDE 3.3 数据库</strong>（Klein Goldewijk 等，2023），该库提供自公元前 10,000 年至今耕地、可耕地、永久性作物与永久性牧场的空间显式重建。本平台使用 1750 年以来的 HYDE 3.3 数据，这是目前可得最长的国家级土地利用序列。",
        mtCrops12: "对最近的年份，<strong>FAOSTAT 土地利用统计</strong>作为补充，依据各国向联合国粮食及农业组织报送的数据提供逐年更新。",
        mtCrops13: "变量",
        mtCrops14: "本平台提供五个土地利用变量：<strong>耕地</strong>（作物种植总面积）、<strong>可耕地</strong>（一年生作物、刈草草地与休耕地）、<strong>永久性作物</strong>（果园、葡萄园等多年生作物用地）、<strong>永久性牧场</strong>（长期用于草本饲料的土地）与<strong>农业用地总面积</strong>（以上各类之和）。数值以百万公顷（Mha）表示，并另给出人均值。",
        mtCrops15: "如何引用",
        mtCrops18: "<strong>建议引用：</strong>&ldquo;土地利用数据来自 HYDE 3.3（Klein Goldewijk 等，2023）与 FAOSTAT。&rdquo;",
        mtBio1: "生物多样性 &mdash; 红色名录指数",
        mtBio2: "IUCN 红色名录指数（联合国可持续发展目标指标 15.5.1）",
        mtBio3: "覆盖范围",
        mtBio4: "199 个国家",
        mtBio5: "年份范围",
        mtBio6: "单位",
        mtBio7: "指数 0&ndash;1",
        mtBio8: "可持续发展目标指标",
        mtBio9: "说明",
        mtBio10: "<strong>IUCN 红色名录指数（RLI）</strong>衡量物种类群整体保护状况的变化趋势。它以 IUCN 濒危物种红色名录中各灭绝风险等级物种数量的实质变动为基础，并被用作联合国可持续发展目标的官方指标 <strong>15.5.1</strong>（减少生物多样性丧失的进展）。",
        mtBio11: "取值为 <strong>1.0</strong> 表示所有物种均被列为&ldquo;无危&rdquo;，即预期近期内不会有物种灭绝；取值为 <strong>0</strong> 则表示所有物种均已灭绝。RLI 下降意味着未来物种灭绝的预期速率正在恶化。",
        mtBio12: "该指数按国家计算，依据分布范围与该国领土重叠的物种。它涵盖哺乳类、鸟类、两栖类、造礁珊瑚与苏铁类&mdash;&mdash;这些类群在 IUCN 红色名录中已至少两次被全面评估。",
        mtBio13: "如何引用",
        mtBio15: "<strong>建议引用：</strong>&ldquo;红色名录指数数据来自 IUCN（2024），用作联合国可持续发展目标指标 15.5.1。&rdquo;",
        mtPub1: "主要出版物",
        mtPub5: "数据来源文献",
    }
};

let currentLanguage = 'en';
try {
    currentLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en';
} catch (err) {
    currentLanguage = 'en';
}

function i18nNodes(root, selector) {
    const nodes = [];
    if (root.matches && root.matches(selector)) nodes.push(root);
    root.querySelectorAll(selector).forEach(node => nodes.push(node));
    return nodes;
}

// The six ways a node can carry a translation. 'text' and 'html' write the
// content; the rest write the attribute of that name.
const I18N_HOOKS = [
    ['data-i18n', 'text'],
    ['data-i18n-html', 'html'],
    ['data-i18n-title', 'title'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria', 'aria-label'],
    ['data-i18n-alt', 'alt']
];

// The English text a node shipped with, remembered the first time we touch it.
// This is what lets the `en` pack stay small: a key with no `en` entry falls
// back to the markup in explorer.html, and switching es -> en restores it
// instead of leaving Spanish on screen.
function i18nOriginal(node, kind) {
    const slot = '__gwOrig_' + kind;
    if (node[slot] === undefined) {
        node[slot] = kind === 'text' ? node.textContent
            : kind === 'html' ? node.innerHTML
                : node.getAttribute(kind);
    }
    return node[slot];
}

function applyLanguage(root = document) {
    const lang = LANGUAGES[currentLanguage] ? currentLanguage : 'en';
    const pack = LANGUAGES[lang];
    document.documentElement.lang = pack.htmlLang;
    document.title = pack.pageTitle;

    I18N_HOOKS.forEach(([attr, kind]) => {
        i18nNodes(root, '[' + attr + ']').forEach(node => {
            const key = node.getAttribute(attr);
            if (!key) return;
            const original = i18nOriginal(node, kind);
            let value = pack[key];
            if (value == null) value = LANGUAGES.en[key];
            if (value == null) value = original;
            if (value == null) return;
            if (kind === 'text') node.textContent = value;
            else if (kind === 'html') node.innerHTML = value;
            else node.setAttribute(kind, value);
        });
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    // Sections that generate their own prose (What if?, Explore, Analysis,
    // Country Profile) redraw on this.
    document.dispatchEvent(new CustomEvent('gw:language', { detail: { lang } }));
}

// ---- Language bridge for the lazily-loaded sections ----
// js/whatif/* must not import app.js (that would be a circular import), so the
// dictionaries reach it through this small read-only object plus the
// 'gw:language' event above. Read it lazily: app.js evaluates AFTER the
// modules it imports.
window.GrowthEarth = Object.assign(window.GrowthEarth || {}, {
    /** 'en' | 'es' | 'zh' — the language the reader chose. */
    lang: () => (LANGUAGES[currentLanguage] ? currentLanguage : 'en'),
    /** A string from the active dictionary, falling back to English. */
    t: (key, fallback = '') => {
        const pack = LANGUAGES[LANGUAGES[currentLanguage] ? currentLanguage : 'en'];
        if (pack && pack[key] != null) return pack[key];
        if (LANGUAGES.en[key] != null) return LANGUAGES.en[key];
        return fallback;
    },
    /** One of three literals, by the language of the day. */
    pick: (en, es, zh) => {
        const l = LANGUAGES[currentLanguage] ? currentLanguage : 'en';
        return l === 'es' ? es : l === 'zh' ? (zh == null ? en : zh) : en;
    },
    /** Translate [data-i18n] nodes a section has just created. */
    applyLanguage: (root) => applyLanguage(root || document),
    /** Rewrite the permalink from State (debounced by app.js). */
    writeStateHash: () => scheduleURLSync()
});

/** A string from the active dictionary, for the prose app.js prints itself. */
function gwText(key, fallback) {
    const pack = LANGUAGES[LANGUAGES[currentLanguage] ? currentLanguage : 'en'];
    if (pack && pack[key] != null) return pack[key];
    if (LANGUAGES.en[key] != null) return LANGUAGES.en[key];
    return fallback;
}

function setLanguage(lang) {
    if (!LANGUAGES[lang]) return;
    currentLanguage = lang;
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (err) {
        // Language still changes for the current session if storage is unavailable.
    }
    applyLanguage(document);
}

function wireLanguageControls(root = document) {
    i18nNodes(root, '.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
}

// Shared HTML template for the wake intro container
const WAKE_HTML = `
<div class="intro-wake-container">
  <svg id="intro-wake-svg" class="intro-wake-svg" aria-hidden="true"></svg>
  <div class="intro-lang-switcher lang-switcher" aria-label="Language"><button class="lang-btn" data-lang="en">EN</button><button class="lang-btn" data-lang="es">ES</button><button class="lang-btn" data-lang="zh">中文</button></div>
  <div class="intro-wake-copy">
    <div class="intro-wake-header">
      <div class="intro-wake-kicker" id="intro-kicker" data-i18n="introKicker">Historical trajectories of development and environment</div>
      <h1 id="intro-title" data-i18n="introTitle">Growth &amp; Earth</h1>
    </div>
    <div class="intro-wake-grid">
      <div class="intro-poem" id="intro-poem">
        <div class="intro-section-label" data-i18n="poemLabel">Antonio Machado, Proverbios y cantares, XXIX</div>
        <blockquote data-i18n-html="poemQuote">“Caminante, son tus huellas<br>el camino, y nada más;<br>caminante, no hay camino:<br>se hace camino al andar.<br>Al andar se hace camino,<br>y al volver la vista atrás<br>se ve la senda que nunca<br>se ha de volver a pisar.<br>Caminante, no hay camino,<br>sino estelas en la mar.”</blockquote>
        <div class="intro-poem-credit" data-i18n="poemCredit">Antonio Machado, Campos de Castilla (1912)</div>
      </div>
      <div class="intro-data-panel" id="intro-data-panel">
        <div class="intro-section-label" data-i18n="dataLabel">Explore the data</div>
        <p data-i18n="siteDescription">A website offering a compilation of historical series on economic development, resource use, and environmental impacts across countries.</p>
        <button class="intro-enter" id="intro-enter" style="opacity:0;pointer-events:none" data-i18n="introButton">Explore trajectories</button>
      </div>
    </div>
  </div>
</div>`;

const WAKE_TRAJECTORIES = [
    { start: .88, end: .18, c1: .68, c2: .34, x0: -.18, x1: .32, x2: .58, x3: 1.12, width: 2.6, opacity: .62, dash: '4 18', delay: 0, speed: 15, colors: ['#496878', '#9a7770', '#9f504b'], foot: '#a65e55', footprints: 9 },
    { start: .77, end: .32, c1: .50, c2: .52, x0: -.12, x1: .46, x2: .42, x3: 1.10, width: 2.0, opacity: .48, dash: '2 16', delay: 180, speed: 18, colors: ['#476977', '#6f9287', '#2f756e'], foot: '#72c6aa', footprints: 0 },
    { start: .66, end: .12, c1: 1.02, c2: .22, x0: -.16, x1: .26, x2: .76, x3: 1.14, width: 1.7, opacity: .44, dash: '7 22', delay: 360, speed: 20, colors: ['#5d7480', '#a98672', '#a25447'], foot: '#e16459', footprints: 0 },
    { start: .98, end: .42, c1: .74, c2: .64, x0: -.20, x1: .58, x2: .36, x3: 1.08, width: 1.9, opacity: .44, dash: '3 18', delay: 540, speed: 17, colors: ['#435c6b', '#5f8491', '#337b8a'], foot: '#82cde0', footprints: 0 },
    { start: .58, end: .22, c1: .90, c2: .10, x0: -.10, x1: .18, x2: .62, x3: 1.16, width: 1.5, opacity: .34, dash: '5 24', delay: 720, speed: 22, colors: ['#627985', '#bd9a6f', '#ae654c'], foot: '#e88764', footprints: 0 },
    { start: .90, end: .54, c1: 1.06, c2: .36, x0: -.08, x1: .42, x2: .72, x3: 1.06, width: 1.4, opacity: .32, dash: '2 20', delay: 900, speed: 19, colors: ['#3f5868', '#b99d68', '#b27b56'], foot: '#f4c471', footprints: 0 },
    { start: .72, end: .28, c1: .38, c2: .70, x0: -.14, x1: .30, x2: .54, x3: 1.18, width: 1.6, opacity: .38, dash: '6 26', delay: 1080, speed: 18, colors: ['#4f6e78', '#7ca0a3', '#2f756e'], foot: '#8bd4c2', footprints: 0 }
];

const FOOTPRINT_IMAGE = { x: -36, y: -66, width: 72, height: 132 };
const FOOTPRINT_IMAGE_CACHE = new Map();

function footprintImageHref(fill) {
    if (FOOTPRINT_IMAGE_CACHE.has(fill)) return FOOTPRINT_IMAGE_CACHE.get(fill);
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-36 -66 72 132">
  <g fill="${fill}">
    <path d="M -16 -22 C -26 -12 -27 10 -20 28 C -14 43 -9 58 4 62 C 18 66 27 54 25 38 C 23 26 16 19 18 7 C 21 -10 14 -28 1 -34 C -6 -37 -12 -32 -16 -22 Z"/>
    <ellipse cx="22" cy="-45" rx="9.2" ry="12.2" transform="rotate(19 22 -45)"/>
    <ellipse cx="10" cy="-54" rx="6.4" ry="8.2" transform="rotate(8 10 -54)"/>
    <ellipse cx="-2" cy="-55" rx="5.7" ry="7.5" transform="rotate(-4 -2 -55)"/>
    <ellipse cx="-13" cy="-50" rx="5.2" ry="6.9" transform="rotate(-17 -13 -50)"/>
    <ellipse cx="-22" cy="-42" rx="4.6" ry="6.2" transform="rotate(-28 -22 -42)"/>
  </g>
</svg>`;
    const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
    FOOTPRINT_IMAGE_CACHE.set(fill, href);
    return href;
}

function startIntroCursorTrail(container) {
    if (!container || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const href = footprintImageHref('#a65e55');
    const cursor = document.createElement('div');
    cursor.className = 'wake-cursor-footprint';
    cursor.style.backgroundImage = `url("${href}")`;
    cursor.style.opacity = '0';
    container.appendChild(cursor);
    container.classList.add('footprint-cursor');

    let lastX = null;
    let lastY = null;
    let lastStepX = null;
    let lastStepY = null;
    let side = -1;
    let angle = -34;
    let lastStepAt = 0;

    function placeFootstep(x, y, stepAngle) {
        if (reduceMotion) return;
        const trail = document.createElement('div');
        trail.className = 'wake-cursor-trail';
        trail.style.backgroundImage = `url("${href}")`;
        trail.style.transform = `translate(${x - 17}px,${y - 31}px) rotate(${stepAngle}deg) scaleX(${side})`;
        container.appendChild(trail);

        const marks = container.querySelectorAll('.wake-cursor-trail');
        if (marks.length > 34) marks[0].remove();
        trail.addEventListener('animationend', () => trail.remove(), { once: true });
    }

    container.addEventListener('pointerenter', event => {
        cursor.style.opacity = '.78';
        const rect = container.getBoundingClientRect();
        lastX = event.clientX - rect.left;
        lastY = event.clientY - rect.top;
        lastStepX = lastX;
        lastStepY = lastY;
    });

    container.addEventListener('pointerleave', () => {
        cursor.style.opacity = '0';
        lastX = null;
        lastY = null;
    });

    container.addEventListener('pointermove', event => {
        if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (lastX !== null && lastY !== null) {
            const dx = x - lastX;
            const dy = y - lastY;
            if (Math.hypot(dx, dy) > 2) angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        }

        cursor.style.opacity = '.78';
        cursor.style.backgroundImage = `url("${href}")`;
        cursor.style.transform = `translate(${x - 17}px,${y - 31}px) rotate(${angle}deg) scaleX(${side})`;

        const now = performance.now();
        const distance = lastStepX === null || lastStepY === null ? Infinity : Math.hypot(x - lastStepX, y - lastStepY);
        if (distance > 46 && now - lastStepAt > 135) {
            const angleRad = (angle - 90) * Math.PI / 180;
            const lateral = side * 10;
            const markX = x + Math.cos(angleRad + Math.PI / 2) * lateral;
            const markY = y + Math.sin(angleRad + Math.PI / 2) * lateral;
            placeFootstep(markX, markY, angle + side * 7);
            side *= -1;
            lastStepX = x;
            lastStepY = y;
            lastStepAt = now;
        }

        lastX = x;
        lastY = y;
    });
}

/**
 * Wire the #intro-enter button inside a given overlay element.
 * Handles hiding the overlay, showing the app, retrying the globe, and cleanup.
 */
function wireIntroEnter(overlayEl) {
    const btn = overlayEl.querySelector('#intro-enter') || overlayEl.querySelector('.intro-enter');
    if (!btn) return;
    btn.addEventListener('click', () => {
        overlayEl.classList.add('hidden');
        appEl.style.display = 'flex';
        // Retry globe init now that app is visible
        setTimeout(() => {
            import('./globe/globe-renderer.js?v=20260911b').then(m => m.retryGlobe());
        }, 100);
        setTimeout(() => overlayEl.remove(), 600);
    });
}

function wakeAnchors(width, height, d, i) {
    return {
        p0: { x: width * (d.x0 ?? (-.10 + i * -.018)), y: height * d.start },
        p1: { x: width * (d.x1 ?? (.20 + i * .018)), y: height * d.c1 },
        p2: { x: width * (d.x2 ?? (.66 + i * .012)), y: height * d.c2 },
        p3: { x: width * (d.x3 ?? (1.08 + i * .01)), y: height * d.end }
    };
}

function wakePath(width, height, d, i) {
    const p = wakeAnchors(width, height, d, i);
    return `M ${p.p0.x} ${p.p0.y} C ${p.p1.x} ${p.p1.y}, ${p.p2.x} ${p.p2.y}, ${p.p3.x} ${p.p3.y}`;
}

function cubicPoint(p, t) {
    const u = 1 - t;
    return {
        x: u * u * u * p.p0.x + 3 * u * u * t * p.p1.x + 3 * u * t * t * p.p2.x + t * t * t * p.p3.x,
        y: u * u * u * p.p0.y + 3 * u * u * t * p.p1.y + 3 * u * t * t * p.p2.y + t * t * t * p.p3.y
    };
}

function footprintTransform(mark, t) {
    const p = cubicPoint(mark.anchors, t);
    const next = cubicPoint(mark.anchors, Math.min(.999, t + .01));
    const angleRad = Math.atan2(next.y - p.y, next.x - p.x);
    const angle = angleRad * 180 / Math.PI + 90 + mark.turn;
    const offset = mark.offset * mark.side;
    const x = p.x + Math.cos(angleRad + Math.PI / 2) * offset;
    const y = p.y + Math.sin(angleRad + Math.PI / 2) * offset;
    return `translate(${x},${y}) rotate(${angle}) scale(${mark.scale * mark.side},${mark.scale})`;
}

function wakeFootprints(width, height) {
    const marks = [];
    WAKE_TRAJECTORIES.forEach((d, i) => {
        const anchors = wakeAnchors(width, height, d, i);
        const count = d.footprints ?? 5;
        const cadence = width < 700 ? 720 : 840;
        const stepPeriod = count * cadence + 2800;
        for (let j = 0; j < count; j++) {
            const side = j % 2 === 0 ? -1 : 1;
            marks.push({
                anchors,
                phase: .12 + (j / Math.max(1, count - 1)) * .70,
                duration: (d.speed + 22) * 1000,
                offset: width < 700 ? 13 : 21,
                side,
                fill: d.foot,
                opacity: .72,
                delay: d.delay,
                stepDelay: d.delay + j * cadence + i * 260,
                stepPeriod,
                turn: side * (width < 700 ? 5 : 7),
                scale: width < 700 ? .30 : .38
            });
        }
    });
    return marks;
}

function footprintStepOpacity(mark, elapsed) {
    const appear = 340;
    const hold = 520;
    const fade = 1700;
    const local = ((elapsed - mark.stepDelay) % mark.stepPeriod + mark.stepPeriod) % mark.stepPeriod;
    let pulse = 0;

    if (local < appear) {
        const t = local / appear;
        pulse = 1 - Math.pow(1 - t, 3);
    } else if (local < appear + hold) {
        pulse = 1;
    } else if (local < appear + hold + fade) {
        const t = (local - appear - hold) / fade;
        pulse = Math.pow(1 - t, 2);
    }

    return mark.opacity * pulse;
}

function startFootprintMotion(footprints) {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
        footprints.attr('opacity', d => d.opacity * .5);
        return;
    }
    const ownerSvg = footprints.node()?.ownerSVGElement;

    const timer = d3.timer(elapsed => {
        if (!ownerSvg || !ownerSvg.isConnected) {
            timer.stop();
            return;
        }
        footprints.attr('opacity', d => footprintStepOpacity(d, elapsed));
    });
}

function renderWakeTrajectories(animate) {
    const svg = d3.select('#intro-wake-svg');
    if (svg.empty()) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'none');

    const defs = svg.append('defs');
    const glow = defs.append('filter').attr('id', 'wake-glow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    glow.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    WAKE_TRAJECTORIES.forEach((d, i) => {
        const gradient = defs.append('linearGradient')
            .attr('id', `wake-gradient-${i}`)
            .attr('gradientUnits', 'userSpaceOnUse')
            .attr('x1', 0)
            .attr('y1', height)
            .attr('x2', width)
            .attr('y2', 0);
        gradient.append('stop').attr('offset', '0%').attr('stop-color', d.colors[0]).attr('stop-opacity', .22);
        gradient.append('stop').attr('offset', '56%').attr('stop-color', d.colors[1]).attr('stop-opacity', .52);
        gradient.append('stop').attr('offset', '100%').attr('stop-color', d.colors[2]).attr('stop-opacity', .95);
    });

    svg.selectAll('.wake-halo')
        .data(WAKE_TRAJECTORIES)
        .enter()
        .append('path')
        .attr('class', 'wake-halo')
        .attr('d', wakePath.bind(null, width, height))
        .attr('fill', 'none')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', d => d.width + 10)
        .attr('stroke-linecap', 'round')
        .attr('stroke-dasharray', d => d.dash)
        .attr('opacity', animate ? 0 : .08)
        .attr('filter', 'url(#wake-glow)')
        .style('animation-duration', d => `${d.speed + 9}s`)
        .style('animation-delay', d => `${-(d.delay / 1000)}s`);

    const lines = svg.selectAll('.wake-line')
        .data(WAKE_TRAJECTORIES)
        .enter()
        .append('path')
        .attr('class', 'wake-line')
        .attr('d', wakePath.bind(null, width, height))
        .attr('fill', 'none')
        .attr('stroke', (d, i) => `url(#wake-gradient-${i})`)
        .attr('stroke-width', d => d.width)
        .attr('stroke-linecap', 'round')
        .attr('stroke-dasharray', d => d.dash)
        .attr('stroke-dashoffset', 0)
        .attr('opacity', animate ? 0 : d => d.opacity)
        .attr('filter', 'url(#wake-glow)')
        .style('animation-duration', d => `${d.speed}s`)
        .style('animation-delay', d => `${-(d.delay / 1000)}s`);

    const footprints = svg.selectAll('.wake-footprint')
        .data(wakeFootprints(width, height))
        .enter()
        .append('g')
        .attr('class', 'wake-footprint')
        .attr('transform', d => footprintTransform(d, d.phase % 1))
        .attr('opacity', animate ? 0 : d => d.opacity);

    footprints.append('image')
        .attr('href', d => footprintImageHref(d.fill))
        .attr('xlink:href', d => footprintImageHref(d.fill))
        .attr('x', FOOTPRINT_IMAGE.x)
        .attr('y', FOOTPRINT_IMAGE.y)
        .attr('width', FOOTPRINT_IMAGE.width)
        .attr('height', FOOTPRINT_IMAGE.height);

    startFootprintMotion(footprints);

    if (!animate) return;

    svg.selectAll('.wake-halo')
        .transition()
        .delay(d => d.delay)
        .duration(2600)
        .ease(d3.easeCubicOut)
        .attr('opacity', .08);

    lines.transition()
        .delay(d => d.delay)
        .duration(1800)
        .ease(d3.easeCubicOut)
        .attr('opacity', d => d.opacity);

}

function revealIntroCopy(delay) {
    setTimeout(() => {
        d3.select('#intro-kicker').transition().duration(650).style('opacity', 1);
        d3.select('#intro-title').transition().delay(160).duration(760).style('opacity', 1);
        d3.select('#intro-poem').transition().delay(360).duration(760).style('opacity', 1);
        d3.select('#intro-data-panel').transition().delay(540).duration(760).style('opacity', 1);
        d3.select('#intro-enter')
            .transition().delay(780).duration(760)
            .style('opacity', 1)
            .style('pointer-events', 'auto');
    }, delay);
}

function animateWakeIntro() {
    if (!introOverlay) return;
    introOverlay.innerHTML = WAKE_HTML;
    wireLanguageControls(introOverlay);
    applyLanguage(introOverlay);
    renderWakeTrajectories(true);
    startIntroCursorTrail(introOverlay.querySelector('.intro-wake-container'));
    revealIntroCopy(2100);
    wireIntroEnter(introOverlay);
}

function buildStaticWake(overlayEl) {
    overlayEl.innerHTML = WAKE_HTML;
    wireLanguageControls(overlayEl);
    applyLanguage(overlayEl);
    renderWakeTrajectories(false);
    startIntroCursorTrail(overlayEl.querySelector('.intro-wake-container'));
    d3.select('#intro-kicker').style('opacity', 1);
    d3.select('#intro-title').style('opacity', 1);
    d3.select('#intro-poem').style('opacity', 1);
    d3.select('#intro-data-panel').style('opacity', 1);
    d3.select('#intro-enter').style('opacity', 1).style('pointer-events', 'auto');
    wireIntroEnter(overlayEl);
}

wireLanguageControls(document);
applyLanguage(document);

// ---- HEADER ACTIONS ---- //
document.getElementById('btn-home').addEventListener('click', () => {
    // The cover is index.html, a page of its own (portada V6, 2026-09-08).
    // Until then the explorer lived inside the cover's iframe and posted a
    // message up; standalone it rebuilt codex's intro overlay, which would
    // now be a second cover. Both paths retired: go back to the cover.
    location.href = 'index.html';
});
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

/**
 * The CSV of the What if? scenario on screen. Ahead: the trajectory with the
 * cumulative and what is left of each budget. Behind: observed against
 * counterfactual, for the region and for the world. Returns false when the
 * section has not loaded its data yet, so the caller falls back.
 */
function exportWhatifCSV() {
    const model = whatifModel();
    if (!model) return false;
    const behind = State.get('whatifMode') === 'behind';
    const rows = [];
    try {
        if (behind) {
            const r = model.counterfactualResult({
                region: State.get('whatifRegion'),
                reference: State.get('whatifRef'),
                fromYear: State.get('whatifFrom'),
                mode: State.get('whatifCfMode'),
                intensity: State.get('whatifIntensity'),
                probability: '50%'
            });
            r.years.filter(y => y >= 1850).forEach((year) => {
                const i = year - 1750;
                rows.push({
                    year: year,
                    region: r.inputs.region,
                    reference: r.inputs.reference,
                    co2ff_observed_mt: round1(r.series_actual_mt[i]),
                    co2ff_counterfactual_mt: round1(r.series_cf_mt[i]),
                    gdp_pc_observed: round1(r.gdp_pc_actual[i]),
                    gdp_pc_counterfactual: round1(r.gdp_pc_cf[i]),
                    world_observed_mt: round1(r.world_actual_mt[i]),
                    world_counterfactual_mt: round1(r.world_cf_mt[i]),
                    counterfactual: r.inputs.mode,
                    intensity: r.inputs.intensity
                });
            });
        } else {
            const r = model.aheadResult({
                g: State.get('whatifG'), r: State.get('whatifR'),
                population: State.get('whatifPop'), target: State.get('whatifTarget'),
                probability: State.get('whatifProb'), horizon: State.get('whatifHorizon')
            });
            const last = State.get('whatifTail') ? 2100 : 2050;
            const cum = {};
            r.cumulative_by_year.forEach(c => { cum[c.year] = c.cum_gt; });
            r.trajectory_2100.filter(p => p.year <= last).forEach(p => {
                rows.push({
                    year: p.year,
                    co2ff_mt: round1(p.E_mt),
                    cumulative_since_2025_gt: round1(cum[p.year]),
                    remaining_1p5c_gt: round1(r.budget_1p5_gt - cum[p.year]),
                    remaining_2c_gt: round1(r.budget_2p0_gt - cum[p.year]),
                    population: Math.round(p.P),
                    gdp_pc: round1(p.y),
                    co2_per_dollar_kg: p.I == null ? '' : Number((p.I * 1e9).toPrecision(4))
                });
            });
        }
    } catch (err) {
        console.error('[whatif] CSV export failed:', err);
        return false;
    }
    if (!rows.length) return false;
    const slug = behind
        ? `behind_${State.get('whatifRegion')}_${State.get('whatifRef')}_${State.get('whatifFrom')}`
        : `ahead_g${Math.round(State.get('whatifG') * 10000)}_r${Math.round(State.get('whatifR') * 10000)}_${State.get('whatifPop')}`;
    exportCSV(rows, `growth-earth_what-if_${slug}.csv`);
    return true;
}

function round1(x) {
    return (x == null || !isFinite(x)) ? '' : Math.round(x * 10) / 10;
}

// ---- FOOTER ACTIONS ---- //
document.getElementById('footer-fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('footer-csv').addEventListener('click', () => {
    // Inside What if? the button used to hand a co-author the series of the
    // countries picked in the OTHER sections, which have nothing to do with
    // the figure on screen. There it exports the scenario.
    if (State.get('activeSection') === 'whatif' && exportWhatifCSV()) return;
    const countries = State.get('selectedCountries');
    if (countries.length === 0) return;
    const yearRange = State.get('yearRange');
    const rows = [];
    countries.forEach(iso3 => {
        const data = DataLoader.getCountryData(iso3);
        const meta = DataLoader.getMetadata(iso3);
        if (!data) return;
        data.filter(d => d.y >= yearRange[0] && d.y <= yearRange[1]).forEach(d => {
            rows.push({
                iso3,
                country: meta ? meta.name : iso3,
                year: d.y,
                ghg_mt: d.ghg,
                ghg_pc_t: d.ghg_pc,
                co2ff_mt: d.co2ff,
                gdp_pc: d.gdp_pc,
                population: d.pop,
                hdi: d.hdi,
                hdi_ng: d.hdi_ng
            });
        });
    });
    exportCSV(rows, `growth-earth_data_${countries.join('_')}.csv`);
});

// ---- MOBILE SHELL (sprint visores 2026-09) ---- //
// The embedded mode (body.embedded, the Escape forwarder and the gutter for
// the cover's audio chip) was removed on 2026-09-08: the cover no longer
// wraps the explorer in an iframe. Escape is owned by the components that
// open overlays, sheets and dropdowns.

// ---- EXPLORE SETTINGS BOTTOM SHEET (phones) ---- //
(function wireExploreSheet() {
    const panel    = document.getElementById('explore-right-panel');
    const openBtn  = document.getElementById('explore-settings-btn');
    const closeBtn = document.getElementById('explore-sheet-close');
    const backdrop = document.getElementById('explore-sheet-backdrop');
    if (!panel || !openBtn) return;

    const isSheet = () => window.matchMedia('(max-width:900px)').matches;

    function openSheet() {
        panel.classList.add('open');
        backdrop?.classList.add('open');
        openBtn.setAttribute('aria-expanded', 'true');
        panel.scrollTop = 0;
    }
    function closeSheet() {
        panel.classList.remove('open');
        backdrop?.classList.remove('open');
        openBtn.setAttribute('aria-expanded', 'false');
    }
    openBtn.addEventListener('click', () => {
        panel.classList.contains('open') ? closeSheet() : openSheet();
    });
    closeBtn?.addEventListener('click', closeSheet);
    backdrop?.addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) { e.preventDefault(); closeSheet(); }
    });
    // Leaving Explore, or growing past the breakpoint, must not leave a sheet
    // stranded over the desktop layout.
    State.subscribe('activeSection', (section) => { if (section !== 'explore') closeSheet(); });
    window.addEventListener('resize', () => { if (!isSheet()) closeSheet(); });
})();

// ---- SECTION STATE CHANGE ---- //
State.subscribe('activeSection', (section) => switchSection(section));

// ---- INITIALIZATION ---- //
async function init() {
    try {
        await DataLoader.init();

        // Set dynamic year range from loaded data
        const dataYearRange = DataLoader.getYearRange();
        if (dataYearRange) {
            State.set('yearRange', dataYearRange);
            State.set('yearFrom', dataYearRange[0]);
            State.set('currentYear', dataYearRange[1]);
        }

        // Set default countries if none specified via URL hash
        const DEFAULT_COUNTRIES = ['CHN', 'USA', 'IND', 'DEU', 'GBR', 'ESP'];
        State.set('selectedCountries', DEFAULT_COUNTRIES);

        initGlobeSection();
        initExploreSection();
        initAnalysisSection();
        initWhatifSection();
        CountryPicker.init();

        handleHash();

        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('hidden');
        setTimeout(() => loadingScreen.remove(), 500);

        // The cover (index.html, portada V6) gates entry via its own CTA and
        // links here as a page of its own, so the reader arrives directly on
        // the globe: codex's wake-intro overlay would be a second cover.
        // animateWakeIntro() is kept in the file, unused, for reference.
        if (introOverlay) introOverlay.classList.add('hidden');
        appEl.style.display = 'flex';
        setTimeout(() => {
            import('./globe/globe-renderer.js?v=20260911b').then(m => m.retryGlobe());
        }, 100);
        setTimeout(() => introOverlay && introOverlay.remove(), 600);

        console.log('Growth & Earth initialized successfully');

    } catch (err) {
        console.error('Initialization failed:', err);
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.querySelector('.loading-subtitle').textContent =
            gwText('loadFail', 'Failed to load data. Please check the console for errors.');
        loadingScreen.querySelector('.loading-bar').style.display = 'none';
    }
}

init();

// ---- ABOUT SECTION TABS ---- //
document.querySelectorAll('.about-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.about-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.about-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        tab.classList.add('active');
        const panel = document.getElementById('about-panel-' + tab.dataset.aboutTab);
        if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    });
});
// Method indicator buttons
document.querySelectorAll('.method-indicator-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.method-indicator-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.method-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        btn.classList.add('active');
        const panel = document.getElementById('method-panel-' + btn.dataset.method);
        if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    });
});

// ============================================================================
// SHARE / EXPORT / RESET  (sprint visores 2026-09)
// handleHash() above already *reads* a state URL; nothing ever wrote one, so
// the viewer could not be linked to. These three functions close that: a URL
// that carries the view, a PNG of the figure on screen with its own title,
// year and source, and a way back to the initial state.
// ============================================================================

let _urlSyncTimer = null;

function buildStateHash() {
    const section = State.get('activeSection') || 'globe';
    const p = new URLSearchParams();
    // What if? is a world of its own: its link carries its dials and nothing
    // of the countries, years and indicators of the other four sections.
    if (section === 'whatif') {
        const mode = State.get('whatifMode') || 'ahead';
        p.set('mode', mode);
        if (mode === 'ahead') {
            p.set('g', Number(State.get('whatifG')).toFixed(4));
            p.set('r', Number(State.get('whatifR')).toFixed(4));
            p.set('pop', State.get('whatifPop'));
            p.set('target', State.get('whatifTarget'));
            p.set('prob', String(parseInt(State.get('whatifProb'), 10)));
            const hz = State.get('whatifHorizon');
            if (hz && hz !== 2100) p.set('hz', String(hz));
            const solve = State.get('whatifSolveFor');
            if (solve) p.set('solve', solve);
            if (State.get('whatifTail')) p.set('tail', '1');
        } else {
            p.set('region', State.get('whatifRegion'));
            p.set('ref', State.get('whatifRef'));
            p.set('t0', String(State.get('whatifFrom')));
            p.set('cf', State.get('whatifCfMode'));
            p.set('int', State.get('whatifIntensity'));
        }
        return '#whatif?' + p.toString();
    }
    const countries = State.get('selectedCountries') || [];
    if (countries.length) p.set('c', countries.slice(0, 40).join(','));
    const year = State.get('currentYear');
    if (year) p.set('year', String(year));
    const range = State.get('yearRange') || [];
    if (range.length === 2) p.set('range', range[0] + '-' + range[1]);
    // The left handle of the dual timeline. It clips every series in trend and
    // composition, so a link without it comes back showing a different period.
    const from = State.get('yearFrom');
    if (from && range.length === 2 && from !== range[0]) p.set('from', String(from));
    const ind = State.get('indicator');
    if (ind) p.set('ind', ind);
    if (section === 'explore') {
        const view = State.get('exploreView');
        if (view && view !== 'map') p.set('view', view);
    }
    if (section === 'analysis') {
        const mode = State.get('analysisMode');
        if (mode) p.set('an', mode);
    }
    const q = p.toString();
    return '#' + section + (q ? '?' + q : '');
}

function permalinkURL() {
    return location.origin + location.pathname + buildStateHash();
}

function writeURLNow() {
    const h = buildStateHash();
    try { history.replaceState(null, '', h); } catch (e) { /* link button still works */ }
    refreshFooterActions();
}

/**
 * 11-IX (r2): the PNG button used to blink "No figure" at the reader in
 * Composition (an HTML treemap), Table and About. It now says so before it is
 * pressed: where there is nothing to take a picture of, it greys out and its
 * tooltip explains why. Called from writeURLNow(), which every state change
 * and every section switch already goes through.
 */
function refreshFooterActions() {
    const btn = document.getElementById('footer-png');
    if (!btn) return;
    const ok = !!visibleFigure();
    btn.disabled = !ok;
    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    btn.style.opacity = ok ? '' : '.38';
    btn.style.cursor = ok ? '' : 'default';
    btn.title = ok ? gwText('ttFootPng', 'Download the figure on screen as PNG')
                   : gwText('flashNoFigure', 'No figure');
}

function scheduleURLSync() {
    if (State.get('isPlaying')) return;   // the time-lapse would burn the replaceState budget
    clearTimeout(_urlSyncTimer);
    _urlSyncTimer = setTimeout(writeURLNow, 400);
}

function flashAction(btn, text) {
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 1400);
}

async function copyPermalink(btn) {
    const url = permalinkURL();
    try { history.replaceState(null, '', buildStateHash()); } catch (e) { /* ignore */ }
    try {
        await navigator.clipboard.writeText(url);
        flashAction(btn, gwText('flashCopied', 'Copied'));
    } catch (e) {
        window.prompt(gwText('promptCopyLink', 'Copy this link:'), url);
    }
}

// ---- PNG of what is on screen ---- //

function exportSlug(text) {
    return String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'growth-earth';
}

function pageStyleSheetText() {
    let css = '';
    for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin (fonts)
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
            const t = rule.cssText || '';
            if (t.startsWith('@import') || t.startsWith('@font-face')) continue;
            css += t + '\n';
        }
    }
    return css;
}

function visibleFigure() {
    const section = document.querySelector('.section.active');
    if (!section) return null;
    const cands = Array.from(section.querySelectorAll('svg, canvas'))
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(o => o.r.width > 140 && o.r.height > 100);
    if (!cands.length) return null;
    cands.sort((a, b) => (b.r.width * b.r.height) - (a.r.width * a.r.height));
    return cands[0];
}

async function figureToImage(el, w, h) {
    if (el.tagName.toLowerCase() === 'canvas') {
        renderGlobeFrame();
        const data = el.toDataURL('image/png');
        if (!data || data.length < 2000) return null;
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = data; });
        return img;
    }
    const clone = el.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = pageStyleSheetText();
    clone.insertBefore(st, clone.firstChild);
    const txt = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    try {
        await new Promise((res, rej) => {
            img.onload = res; img.onerror = rej;
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt);
        });
    } catch (e) { return null; }
    return img;
}

function figureTitle() {
    const section = State.get('activeSection');
    const ind = State.get('indicator');
    const label = (typeof INDICATOR_LABELS !== 'undefined' && INDICATOR_LABELS[ind]) || ind || '';
    const unit = (typeof INDICATOR_UNITS !== 'undefined' && INDICATOR_UNITS[ind]) || '';
    if (section === 'globe') return { main: `Country profile — ${label}`, unit };
    if (section === 'analysis') return { main: `Analysis — ${State.get('analysisMode')}`, unit };
    if (section === 'about') return { main: gwText('figAboutSources', 'About & sources'), unit };
    if (section === 'whatif') return whatifFigureTitle();
    return { main: `${label}`, unit, view: State.get('exploreView') };
}

// What if? is world-wide and carries no countries: its exported figure used to
// be stamped with the country list of the OTHER sections ("CHN, USA, IND, DEU,
// GBR, ESP") and with a period fixed to 2025-2050 even when the reader had
// asked for the tail to 2100. The subtitle carries the scenario instead, and
// the foot of the sheet says what kind of arithmetic this is.
function whatifFigureTitle() {
    const behind = State.get('whatifMode') === 'behind';
    const t = (k, fb) => (window.GrowthEarth && window.GrowthEarth.t ? window.GrowthEarth.t(k, fb) : fb);
    const plain = (k, fb) => String(t(k, fb))
        .replace(/<span class="wi-mode-when">[\s\S]*?<\/span>/g, '')   // the period is printed on its own
        .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const head = plain('whatifTitle', 'What if?');
    const note = 'Kaya arithmetic, not a climate model \u00b7 warming from the AR6 TCRE';
    if (behind) {
        const cf = State.get('whatifCfMode') === 'level' ? 'same income level' : 'same growth rate';
        const int = { own: 'own intensity', ref: 'reference intensity', world: 'world-average intensity' }[State.get('whatifIntensity')] || '';
        return {
            main: `${head} \u2014 ${plain('whatifModeBehind', 'Behind')}`,
            unit: 'Gt CO\u2082',
            when: '1850\u20132024',
            subtitle: `${State.get('whatifRegion')} vs ${State.get('whatifRef')} \u00b7 from ${State.get('whatifFrom')} \u00b7 ${cf} \u00b7 ${int}`,
            note: note
        };
    }
    const pct = (x) => {
        const v = Number(x) * 100;
        return (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(2) + ' %/yr';
    };
    const popTxt = { low: 'UN low', medium: 'UN medium', high: 'UN high' }[State.get('whatifPop')] || '';
    const target = { '1.5C': '1.5 \u00b0C', '2.0C': '2 \u00b0C', '3.0C': '\u22483 \u00b0C (derived)' }[State.get('whatifTarget')] || '';
    return {
        main: `${head} \u2014 ${plain('whatifModeAhead', 'Ahead')}`,
        unit: 'Gt CO\u2082',
        when: State.get('whatifTail') ? '2025\u20132100' : '2025\u20132050',
        subtitle: `GDP/person ${pct(State.get('whatifG'))} \u00b7 CO\u2082/$ ${pct(State.get('whatifR'))} \u00b7 ${popTxt} population \u00b7 ${target} at ${State.get('whatifProb')}`,
        note: note
    };
}

async function exportVisiblePNG(btn) {
    const found = visibleFigure();
    if (!found) { flashAction(btn, gwText('flashNoFigure', 'No figure')); return; }
    const w = Math.max(620, Math.round(found.r.width));
    const h = Math.max(380, Math.round(found.r.height));
    const img = await figureToImage(found.el, w, h);
    if (!img) { flashAction(btn, gwText('flashNoFigure', 'No figure')); return; }

    const scale = 2, padTop = 76, padBottom = 52, padSide = 26;
    const canvas = document.createElement('canvas');
    canvas.width = (w + padSide * 2) * scale;
    canvas.height = (h + padTop + padBottom) * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const css = getComputedStyle(document.documentElement);
    const paper = css.getPropertyValue('--bg').trim() || '#f1e6c8';
    const ink = css.getPropertyValue('--cd').trim() || '#2b2521';
    const mute = css.getPropertyValue('--cl').trim() || '#4a6d85';
    const rule = css.getPropertyValue('--cb').trim() || '#cdbf9e';

    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w + padSide * 2, h + padTop + padBottom);
    ctx.drawImage(img, padSide, padTop, w, h);

    const t = figureTitle();
    const year = State.get('currentYear');
    const range = State.get('yearRange') || [];
    const when = t.when || ((State.get('activeSection') === 'explore' && State.get('exploreView') !== 'map' && range.length === 2)
        ? `${range[0]}–${range[1]}` : String(year));

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mute;
    ctx.font = `500 10px ${UI_FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.16em';
    ctx.fillText('GROWTH & EARTH · GLOBAL DEVELOPMENT AND ENVIRONMENTAL CHANGE SINCE 1750', padSide, 24);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = ink;
    ctx.font = `500 20px ${UI_FONT}`;
    ctx.fillText(`${t.main}${t.unit ? ` (${t.unit})` : ''} · ${when}`, padSide, 51);
    // A section that declares its own subtitle owns that line; only the four
    // country-based sections stamp the selection there.
    const sel = State.get('selectedCountries') || [];
    const sub = t.subtitle || (sel.length ? sel.join(', ') : '');
    ctx.fillStyle = mute;
    ctx.font = `400 10.5px ${UI_FONT}`;
    if (sub) ctx.fillText(sub.slice(0, 150), padSide, 66);

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padSide, h + padTop + 16);
    ctx.lineTo(w + padSide, h + padTop + 16);
    ctx.stroke();
    ctx.fillStyle = mute;
    ctx.font = `400 10px ${UI_FONT}`;
    ctx.fillText('Source: Growth & Earth — Infante-Amate, Aguilera & Travieso. See About & sources for the full reference list.'
        + (t.note ? '  ·  ' + t.note : ''), padSide, h + padTop + 33);
    ctx.fillText(permalinkURL().slice(0, 170), padSide, h + padTop + 47);

    canvas.toBlob(blob => {
        if (!blob) { flashAction(btn, gwText('flashError', 'Error')); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `growth-earth_${exportSlug(t.main)}_${when.replace('–', '-')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        flashAction(btn, 'PNG ✓');
    }, 'image/png');
}

// ---- Reset ---- //

// The year and the range that state.js declares are placeholders: the loader
// widens them to the real extent of the data. Reset has to return to what the
// reader saw on first load, not to those placeholders.
let INITIAL_VIEW = null;
setTimeout(() => {
    if (!INITIAL_VIEW) INITIAL_VIEW = {
        year: State.get('currentYear'),
        range: State.get('yearRange')
    };
}, 2200);

function resetViewer() {
    State.set('isPlaying', false);
    State.clearCountries();
    State.set('currentYear', INITIAL_VIEW ? INITIAL_VIEW.year : 2022);
    State.set('yearRange', INITIAL_VIEW ? INITIAL_VIEW.range : [1850, 2022]);
    State.set('baseIndicator', 'ghg');
    State.set('perCapita', true);
    State.set('indicator', 'co2ff_pc');
    State.set('selectedGases', ['co2ff']);
    // Every key the section declares, not a hand-kept list of eight: the five
    // dials of Behind (region, reference, start year, counterfactual mode and
    // intensity) used to survive a Reset and come back when the reader
    // switched mode again.
    WHATIF_STATE_KEYS.forEach(k => State.set(k, WHATIF_DEFAULTS[k]));
    document.querySelector('.map-subtab[data-view="map"]')?.click();
    document.querySelector('.tab-btn[data-section="globe"]')?.click();
    resetGlobeView();
    writeURLNow();
    setTimeout(writeURLNow, 500);   // after the sections re-render
}

// ---- Wiring ---- //

document.getElementById('footer-link')?.addEventListener('click', e => copyPermalink(e.currentTarget));
document.getElementById('footer-png')?.addEventListener('click', e => exportVisiblePNG(e.currentTarget));
document.getElementById('footer-reset')?.addEventListener('click', e => {
    resetViewer(); flashAction(e.currentTarget, gwText('flashDone', 'Done'));
});

// The four country-based sections, then every key What if? declares (so a new
// dial cannot be forgotten here again: 'whatifTail' was one).
['activeSection', 'selectedCountries', 'currentYear', 'yearRange', 'yearFrom', 'indicator',
 'exploreView', 'analysisMode', 'isPlaying']
    .concat(WHATIF_STATE_KEYS)
    .forEach(key => State.subscribe(key, scheduleURLSync));

// The link is applied once, by handleHash(), in an order that survives the
// year-range recompute. It used to be re-applied here on a 900 ms timer, and
// that second pass was exactly what reset the reader's period.
setTimeout(scheduleURLSync, 1400);
