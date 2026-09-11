// ============================================================================
// APP.JS - Application entry point, routing, initialization
// ============================================================================

import State from './state.js?v=20260911a';
import DataLoader from './data-loader.js?v=20260911a';
import { initGlobeSection } from './globe/globe-section.js?v=20260911a';
import { initExploreSection } from './explore/explore-section.js?v=20260911a';
import { initAnalysisSection } from './analysis/analysis-section.js?v=20260911a';
import { initWhatifSection, whatifModel, WHATIF_STATE_KEYS, WHATIF_DEFAULTS } from './whatif/whatif-section.js?v=20260911a';
import { toggleFullscreen, exportCSV } from './components/export.js?v=20260911a';
import CountryPicker from './components/country-picker.js?v=20260911a';
import { renderGlobeFrame, resetGlobeView } from './globe/globe-renderer.js?v=20260911a';
import { INDICATOR_LABELS, INDICATOR_UNITS, UI_FONT } from './utils.js?v=20260911a';

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

const LANGUAGE_STORAGE_KEY = 'growthWake.language';
const LANGUAGES = {
    en: {
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
        dataSourcesText: 'All data displayed on this platform is derived from publicly available datasets. Each indicator page in the <strong>Methodology</strong> tab documents the original source, coverage, and required citation. If you use data or visualizations from Growth &amp; Earth in your work, please cite both the original data providers and the relevant publications by Infante-Amate, Travieso &amp; Aguilera listed in the Methodology section.'
    },
    es: {
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
        dataSourcesText: 'Todos los datos mostrados en esta plataforma proceden de fuentes públicas. Cada indicador de la pestaña <strong>Metodología</strong> documenta la fuente original, la cobertura y la cita requerida. Si usas datos o visualizaciones de Growth &amp; Earth, cita tanto a los proveedores originales como las publicaciones relevantes de Infante-Amate, Travieso &amp; Aguilera incluidas en la sección metodológica.'
    },
    zh: {
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
        navProfile: '国家概况',
        navExplore: '探索',
        navAnalysis: '分析',
        navAbout: '关于',
        navWhatif: '假如',
        whatifTitle: '假如？',
        whatifSubtitle: '三个旋钮，一份碳预算',
        whatifModeLabel: '模式',
        whatifModeAhead: '展望 <span class="wi-mode-when">· 2025–2050</span>',
        whatifModeBehind: '回望 <span class="wi-mode-when">· 1850–2024</span>',
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
        dataSourcesText: '平台中的所有数据都来自公开数据集。<strong>方法</strong>标签中的每个指标都记录了原始来源、覆盖范围和引用要求。如果你在研究中使用 Growth &amp; Earth 中的数据或可视化，请同时引用原始数据提供者，以及方法部分列出的 Infante-Amate、Travieso &amp; Aguilera 相关出版物。'
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

function applyLanguage(root = document) {
    const lang = LANGUAGES[currentLanguage] ? currentLanguage : 'en';
    const pack = LANGUAGES[lang];
    document.documentElement.lang = pack.htmlLang;
    document.title = pack.pageTitle;

    i18nNodes(root, '[data-i18n]').forEach(node => {
        const key = node.dataset.i18n;
        if (pack[key] != null) node.textContent = pack[key];
    });
    i18nNodes(root, '[data-i18n-html]').forEach(node => {
        const key = node.dataset.i18nHtml;
        if (pack[key] != null) node.innerHTML = pack[key];
    });
    i18nNodes(root, '[data-i18n-title]').forEach(node => {
        const key = node.dataset.i18nTitle;
        if (pack[key] != null) node.setAttribute('title', pack[key]);
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    // Sections that generate their own prose (What if?) redraw on this.
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
    /** Translate [data-i18n] nodes a section has just created. */
    applyLanguage: (root) => applyLanguage(root || document),
    /** Rewrite the permalink from State (debounced by app.js). */
    writeStateHash: () => scheduleURLSync()
});

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
            import('./globe/globe-renderer.js?v=20260911a').then(m => m.retryGlobe());
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
            import('./globe/globe-renderer.js?v=20260911a').then(m => m.retryGlobe());
        }, 100);
        setTimeout(() => introOverlay && introOverlay.remove(), 600);

        console.log('Growth & Earth initialized successfully');

    } catch (err) {
        console.error('Initialization failed:', err);
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.querySelector('.loading-subtitle').textContent =
            'Failed to load data. Please check the console for errors.';
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
        flashAction(btn, 'Copied');
    } catch (e) {
        window.prompt('Copy this link:', url);
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
    if (section === 'about') return { main: 'About & sources', unit };
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
    if (!found) { flashAction(btn, 'No figure'); return; }
    const w = Math.max(620, Math.round(found.r.width));
    const h = Math.max(380, Math.round(found.r.height));
    const img = await figureToImage(found.el, w, h);
    if (!img) { flashAction(btn, 'No figure'); return; }

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
        if (!blob) { flashAction(btn, 'Error'); return; }
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
    resetViewer(); flashAction(e.currentTarget, 'Done');
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
