# web_cascorro — Growth & Earth: global development and environmental change since 1750

> Protocolo comun de agentes: ver `../../AGENTS.md`. Plan de URLs beta: `../../docs/BETA_VISORS.md`.

## Descripción
**Growth & Earth** (desde el 10 de septiembre de 2026; antes «Growth's Wake / Estelas del
crecimiento»; nombre de trabajo original «Cascorro», que sigue en el nombre de la carpeta, en
`data/`, en `portada/cascorro.js` y en la foto de la Plaza de Cascorro de About). Explorador
global de indicadores de cambio ambiental y desarrollo humano: 199 países y ocho regiones,
1750–2024; globo 3D con perfil de país, mapas coropléticos, tendencias, ranking, tabla,
composición y cinco análisis (intensidades, drivers, correlaciones, recesiones, Tapio).
Destino: organización GitHub pendiente de definir.

**Título oficial** (la marca no se traduce): «Growth & Earth: global development and
environmental change since 1750». Emiliano Travieso: «al revés [Earth & Growth] suena peor».
Nombre español secundario, solo en el eyebrow del toggle ES de la portada y en el texto de
orígenes de About: «Estelas del crecimiento». **Texto de entrada** de Emiliano (EN) en la placa
de la portada, en `aboutLead` del explorador (EN/ES/中文) y traducido al español en el `data-es`
de `.lede`: «Since the industrial revolution, modern economic growth has sustained ever larger
populations and extraordinary progress in education and health, while also transforming the
planet through greenhouse gas emissions, cropland expansion, and raw material extraction.
Growth & Earth is a place to explore this uneven history of global development and
environmental change.»

## Estructura
```
cascorro_explorer.html  ← ARCHIVO DESPLEGABLE (30 MB, autocontenido con todo embebido) — DESFASADO, ver Pendiente
index.html              ← Portada V8 «Growth & Earth» (2026-09-10): escena V7b a sangre + placa Gill arriba a la izquierda; CTA → explorer.html
explorer.html           ← Explorador modular (js/ + data/), página propia desde 2026-09-08; identidad Gill desde 2026-09-10; caché `?v=20260910a`
portada/                ← Kit de la portada (cascorro.js, world-110m.js, regions-map.js ← build/portada_kit_v6.py); no se toca
js/                     ← Módulos ES6 (23 archivos)
├── app.js              ← Controlador principal, routing por hash, diccionarios i18n (EN/ES/中文), exportación PNG
├── state.js            ← Gestión de estado
├── data-loader.js      ← Carga de datos
├── utils.js            ← Utilidades, COLORS, rampas de mapa, COMPARISON_INK, UI_FONT
├── components/         ← country-picker, timeline, tooltip, export
├── globe/              ← globe-section, globe-renderer, country-profile
├── explore/            ← explore-section, trend, composition, choropleth,
│                         ranking, tapio, table
└── analysis/           ← analysis-section, recessions, drivers,
                          correlations, intensities
data/                   ← JSONs (27.3 MB) — no se tocan
├── cascorro_countries.json    ← 24 MB — dataset principal
├── cascorro_regions.json      ← 2.4 MB — agregaciones regionales
├── cascorro_reductions.json   ← 693K — descomposiciones
├── cascorro_metadata.json     ← Definiciones de variables
└── countries-110m.json        ← Topología del mapa
img/                    ← Fotos del equipo y logos institucionales; `cascorro.jpg` (el azulejo, marca antigua) se conserva y solo lo usa la historia de About
build/build.ps1         ← NO DESPLEGAR. Script PowerShell que genera cascorro_explorer.html
{}                      ← Archivo vacío, se puede borrar
```

**No hay `css/` propio.** El cromo vive en línea: `index.html` (`:root` + `<style>` de la
portada), `explorer.html` (`:root` + bloque `<style>` de ~640 líneas), `js/app.js` (cabecera
del PNG exportado, que lee `--bg/--cd/--cl/--cb` y la familia `UI_FONT` de `utils.js`) y las
cadenas `style=`/`cssText` de `js/explore/composition-view.js`, `js/explore/table-view.js`,
`js/explore/tapio-view.js` y `js/components/country-picker.js` (todas con `var(--...)`).

## Stack
- HTML/CSS/JS vanilla (módulos ES6)
- D3.js v7 + TopoJSON + Globe.gl (CDN)
- Fuentes: **Gill Sans** del sistema, con **Cabin** (Google Fonts) como sustituto libre;
  **Perpetua** del sistema, con **Crimson Pro** (Google Fonts) como sustituto. Una sola hoja
  de Google Fonts (`Cabin` + `Crimson Pro`) en portada y explorador; **no añadas otra**.
  **No se incluyen ficheros de Gill Sans ni Perpetua en el repo** (licencia Monotype).
- Build: PowerShell script que empaqueta todo en un HTML autocontenido

## Identidad Gill (2026-09-10)

Encargo de Juan y de Emiliano: tomar la estética de Eric Gill («un genio del diseño de
principios de siglo»): referencia de Emiliano, fondo bermellón (≈ `#d84a34`) y texto crema
(≈ `#f1e6c8`) en Gill Sans, «GROWTH & EARTH» en versales ligeras y espaciadas, subtítulo en
caja baja. Reglas de la casa, portada y explorador:

- **Un solo color de acento, el bermellón**, sobre crema; tinta gris-negra cálida para el
  texto; filetes de 1 px; versales espaciadas (`.14–.2em`) en pestañas, rótulos y títulos de
  sección; caja baja para subtítulos; Perpetua (itálica) para prosa editorial, subtítulos de
  gráfica y los numerales grandes del año; **cifras tabulares** (`font-variant-numeric:
  tabular-nums lining-nums` en `body`); `border-radius:0` (excepciones vivas al pie del
  `<style>`: retratos, puntos de dato, asa del timeline); composición asimétrica.
- **El bermellón de Emiliano `#d84a34` da 3,4:1 sobre la crema**: sirve para filetes,
  subrayados, marcas, la marca de sol y versales grandes (≥ 24 px, o ≥ 19 px en negrita), y
  **nunca para texto pequeño**. Para eso existe `#b13522`: el mismo tono y saturación (HLS) a
  la luminosidad que pasa AA — crema sobre él 5,0:1; él sobre `--bg` 5,0:1 y sobre `--bgl`
  4,5:1. Los botones primarios y las pastillas activas son `#b13522` con tipo crema; el
  bermellón claro solo va en superficies sin texto pequeño.
- **La marca**: un grabado de línea, sol saliendo sobre el agua dentro de un anillo (SVG en
  línea, `class="mark"`, trazos 1,2–1,8 en un `viewBox 0 0 48 48`, `currentColor`), repetido
  en la placa de la portada, la cabecera del explorador, la pantalla de carga y la intro. No
  hay fichero de imagen: si cambias el dibujo, cámbialo en los cuatro sitios (`MARK` en los
  scripts de parche de `C:/Work/scratch/ephemeral/visores_2026-09/growth_earth/`).
- **Pila tipográfica** (idéntica en los dos ficheros):
  `--ff`/`--sans`: `"Gill Sans MT","Gill Sans Nova","Gill Sans",Cabin,"Alegreya Sans",sans-serif`;
  `--ff-serif`/`--serif`: `Perpetua,"Crimson Pro","EB Garamond",Georgia,serif`.
  **`"Gill Sans MT"` va ANTES de `"Gill Sans"` a propósito**: en Windows con Office el fichero
  `GILSANUB.TTF` (Gill Sans Ultra Bold) registra su familia interna como «Gill Sans» y
  responde el primero; con el orden del encargo (`"Gill Sans"` primero) toda la portada salía
  en Ultra Bold (medido el 10-IX en esta máquina, que tiene Gill Sans MT regular/bold/italic
  y Perpetua regular/italic/bold). En Mac/iOS «Gill Sans» es la familia real y cae ahí; sin
  ninguna Gill, Cabin. Windows no trae Gill Sans MT Light: el «ligero» de las versales es el
  regular 400 espaciado; por eso en el explorador **`font-weight:600` se bajó a 500** en todo
  el `<style>` (Gill Sans MT solo tiene 400 y 700, y 600 caía en negrita). `--ff-caps` (las
  versales espaciadas, antes `--ff-mono` Geist Mono) apunta a la misma pila; **`--ff-mono` es
  un mono del sistema y solo lo usa `.method-formula`**. `utils.js` exporta `UI_FONT` (lee
  `--ff` del `:root`) para el texto en canvas: cabecera del PNG y `textWidthPx()`.
- **Lo que no cambió**: el motor de estelas de la portada (V7b, 9-IX); las rampas de datos de
  los mapas (`MAP_RAMPS`, `ember` con su ancla `#c64d38` incluida: es dato, no acento);
  `COMPARISON_PALETTE`; las baldosas de composition; los patrones de tapio. Solo se retocó lo
  que es cromo: `COLORS.uiText` `#2a5474` → `#4d443c` (= `--cg`, 7,7:1), la tinta de
  `labelInkOn()` `#0a2136` → `#1f1b18` (más oscura: todo lo que pasaba AA sigue pasando;
  constante 0,0615), `MAP_PAPER` y el fondo del globo → `#f1e6c8`, atmósfera del globo
  `#7fa6c2` → `#d9ccab`, y **cuatro entradas de `COMPARISON_INK`** que sobre la crema nueva
  quedaban en 4,3–4,4:1 se bajaron en HLS (tono y saturación intactos): `#007065`→`#006e63`,
  `#486875`→`#466672`, `#965212`→`#925012`, `#0068a1`→`#00659d`, `#c31932`→`#bf1931`; las
  diez pasan de 4,5:1 sobre los dos papeles.

**Tokens del explorador (`explorer.html :root`), medidos sobre los dos papeles:**

| token | valor | sobre `--bg` | sobre `--bgl` | uso |
|---|---|---|---|---|
| `--bg` | `#f1e6c8` | — | — | la crema de Emiliano, fondo de todo el cromo, del globo y de los mapas |
| `--bgl` | `#e8dcbd` | — | — | un paso más oscuro: filas teñidas, chips, hovers |
| `--foam` | `#f7f0de` | — | — | un realce sobre la crema |
| `--cd` | `#2b2521` | **12,2:1** | **11,1:1** | tinta |
| `--cg` | `#4d443c` | **7,7:1** | **7,0:1** | tinta secundaria; = `COLORS.uiText` |
| `--cl` | `#665a4e` | **5,4:1** | **4,9:1** | tinta terciaria, pestañas inactivas, placeholders |
| `--cb` | `#cdbf9e` | 1,5:1 (filete) | 1,4:1 | filete |
| `--verm` | `#d84a34` | 3,4:1 | 3,1:1 | filete de pestaña activa, subrayados, marcas, marca, progreso del timeline, versales grandes |
| `--verm-deep` | `#b13522` | crema sobre él **5,0:1** | | botones primarios: `.tl-play`, `.ctrl-btn.active`, `.lang-btn.active`, `.map-compare-btn`, `.method-indicator-btn.active`, `.gas-preset.active` |
| `--verm-ink` | `#b13522` | **5,0:1** | **4,5:1** | bermellón como texto: logo de la cabecera, `h2.about-h2`, hovers |
| `--c1` | `#b13522` | | | acento de interfaz (checkboxes, enlaces, barras de la tabla) |
| `--sea` / `--sea2` | `#2b2521` / `#1f1b18` | | | nombres heredados de la carta náutica: ahora tinta (raíl de Explore, tooltip) |
| `--cream` / `--cream2` / `--muted` | `#f1e6c8` / `#d9ccab` / `#a89b86` | | | heredados; `--muted` sobre `--sea2` 6,0:1 (raíl inactivo) |

**Tokens de la portada (`index.html :root`):** escena sin cambios (`--sea #0E2C48 --sea2
#0A2136 --line #1E4463 --line2 #2F5C7E --ice #7FA6C2`); `--cream #F1E6C8 --cream2 #D9CCAB
--muted #A89B86 --foam #F7F0DE`; `--verm #D84A34 --verm-deep #B13522`; tinta de la placa
`--ink #2B2521 --ink2 #4D443C --ink3 #665A4E`, filete `--rule #CDBF9E`. Medidos en vivo
(Playwright, `getComputedStyle` sobre fondo plano): eyebrow 5,4:1, EN/ES 5,0:1, `h1` 3,4:1 a
44 px (texto grande), subtítulo 7,7:1, párrafo 12,2:1, CTA (crema sobre `--verm-deep`)
5,0:1, banda: `--cream2` sobre `--sea2` 8,8:1 y `--muted` 6,0:1. En el JS de la escena,
`CREAM`/`FOAM`/`VERM` y `RGB.*` repiten estos valores: la tinta de las estelas va de espuma a
bermellón según los GEI por persona, así que el cambio de `--verm` se ve en las estelas y en
el mapa (permitido: es el tono de acento). **Si cambias un token aquí, cambia el otro.**

**Cómo se miden los ratios (2026-09-06).** No con `getComputedStyle().color` sobre un SVG:
el texto SVG se pinta con `fill`, y leer `color` sobre un `<text>` devuelve el valor
heredado. El barrido bueno toma el color de `fill` en SVG y de `color` en HTML, y el fondo lo
FOTOGRAFÍA (esconde el texto con `color/fill:transparent`, captura, y muestrea los píxeles
reales de cada caja). Herramienta: `C:/Work/scratch/ephemeral/visores_2026-09/estelas2/barrido.py`.
Las cifras de la tabla de arriba son sobre fondo plano (el cromo); el barrido sobre píxeles
de los rótulos dentro de los lienzos no se repitió el 10-IX y sigue pendiente (ver «Pendiente
conocido»). Los `::placeholder` de los tres buscadores van a `--cl` con `opacity:1`.

**Marcas de agua del año — decorativas, declaradas.** `#globe-year-display`,
`#explore-year-display` y `-2` y la `text.year-watermark` de `correlations.js` llevan
`aria-hidden="true"`; desde el 10-IX van en Perpetua (`--ff-serif`, 34/56 px) y tinta cálida
al 11–13 %. Son decoración porque el mismo año se imprime a 12,2:1 en la barra de tiempo de
esa vista. Si alguna vista dejara de mostrar su barra, la marca pasaría a ser la única forma
de saber el año y habría que subirla a 3:1.

**Pendiente conocido** — lo medido por debajo de AA el 6-IX sobre los papeles V7b
(`#f2ede0`/`#e7dfcc`) y NO tocado porque es codificación de dato; con la crema nueva
(L 0,79 frente a 0,84) los ratios bajan ~5 %, así que estas cifras son orientativas:

| dónde | medido | qué es |
|---|---|---|
| `.profile-rank-badge` y las cifras del perfil | 1.3–3.6:1 | el número en el color de su serie |
| rótulos de cuadrante de `tapio-view.js` | 1.7–1.9:1 | `PATTERN_META[].color` al 60%: el color nombra el patrón de desacople |
| año del punto actual en `tapio-view.js` | 1.5:1 | pintado con el color del patrón; el año está a 12.2:1 en la barra de tiempo |
| etiquetas de baldosa de `composition-view.js` | 4.17–9.8:1 | `labelInkOn()`; 6 de 18 entre 4.17 y 4.5 en baldosas de luminancia media |
| `end-label` / `bubble-label` / etiquetas de ranking | ≥ 4.5:1 | `COMPARISON_INK` + `inkFor()`, remedidas y ajustadas el 10-IX sobre la crema nueva |

**Lo que NO es cromo:** las escalas de color de datos viven en `js/` (`utils.js`
`COLORS`/`COMPARISON_PALETTE`/`MAP_RAMPS`, trend, composition, tapio, choropleth,
correlations, drivers). `--c1/--c2/--c3` de `explorer.html` son la excepción de nombre:
`--c1` es acento de interfaz (ahora bermellón), pero `--c2`/`--c3` marcan las fichas de
método con el color de su serie, así que cuentan como dato.

> **La regla «no se tocan las escalas de datos» ya no cubre los mapas.** El 6 de septiembre
> de 2026 el autor la levantó explícitamente para las escalas de mapa y pidió ajustarlas a
> la portada y hacerlas más agradables. Se rehicieron; la sección siguiente dice con qué
> criterio y con qué medida. Para todo lo demás —series de gráfico, baldosas de
> composition, colores de patrón de tapio— **la regla sigue en pie**. El 10-IX no se tocó
> ninguna rampa: solo el tono de acento.

## Portada V8 «Growth & Earth» (`index.html`, 2026-09-10)

Juan: «me gusta [la carta náutica], quiero que el mapa salga un poco más grande», y otra
estructura que no sea texto a la izquierda y escena a la derecha: «que la figura y el mapa lo
ocupen todo y solo arriba a la izquierda aparezca el título, la descripción y el botón».

- **Escena a sangre** (`#scene`, absoluta, `bottom: var(--band)` = 48 px): el motor de la
  carta náutica V7b sin cambios de semántica (ocho estelas, GEI como tinta, mar abierta con
  dos o tres estelas fantasma por región, rosa, sondas, orla). Cambian la mano tipográfica
  (Perpetua para años, sondas, «the wakes part» y «open water»; Gill Sans en versales
  espaciadas `.14em` para las placas de nombre de las cabezas y las letras de la rosa; las
  fuentes se leen de `--sans`/`--serif` del `:root` al arrancar, `SANS`/`SERIF`) y los
  colores `CREAM`/`FOAM`/`VERM`.
- **La placa** (`header.plate`, absoluta en 32/32, 472 px de ancho, crema, borde de tinta de
  1 px + `outline` crema a 3 px, sombra): fila superior con eyebrow (`199 countries ·
  1750–2024` / ES `Estelas del crecimiento · 1750–2024`) y el toggle EN/ES (botones de
  40 px, el activo en `--verm-deep` subrayado); `.title-row` con el `h1` «GROWTH / & EARTH»
  (dos líneas, `clamp(36px,3.1vw,44px)`, peso 400, `.18em`, bermellón) y la marca a su
  derecha (50 px); subtítulo en caja baja 16,5 px; filete bermellón de 44 px; el párrafo de
  Emiliano a 14 px; CTA «Enter the explorer» (`--verm-deep`, crema, versales `.18em`, 52 px,
  hover invertido). En `max-height:760px` la placa se compacta.
- **El motor respeta la placa**: `layout()` lee su rect (`PL`) y (a) coloca el **cartucho
  del mapa** debajo, alineado con su borde izquierdo, a `W*0.26` acotado en 240–380 px
  (374 px a 1440×900: 1,87× los 200 px de la V7b) y lo reduce solo si no cabe sobre las
  estelas de 1750–1900 (`avail`; mínimo 200), (b) baja el rótulo «✦ 1885 · the wakes part»
  bajo la placa (`partLabelY()`) y (c) mantiene las sondas fuera de placa, cartucho y
  rótulo. Un `ResizeObserver` sobre la placa relanza `layout()` cuando cambia de alto (ES es
  más largo; fuentes tardías), igual que `document.fonts.ready`.
- **El sello** (`.stamp`, arriba a la derecha, en la mar abierta): el año en Perpetua
  (`#year`, 34–44 px), el rótulo de una línea de qué es la escena (versales `.16em`), la
  región fijada (`#pinlbl`, estrella bermellón) y la pista en itálica. En móvil solo el año.
- **Sin barra de tiempo**: el `input[type=range]` es una **línea fina tendida sobre el eje
  de años** (`layout()` lo coloca en `xL..xData`, 44 px de alto para el dedo, pista
  transparente sobre el eje dibujado, asa de 10 px en rombo crema). Arrastrar el agua sigue
  recorriendo los años. El botón reproducir/pausa existe pero es `sr-only` (teclado: espacio,
  flechas, Inicio/Fin, Escape suelta la región fijada).
- **La banda** (`footer.band`, 48 px, `--sea2`, filete crema al 22 %): índice de las cuatro
  secciones en versales espaciadas (numerales en `--muted`, hover en bermellón) y el verso de
  Machado en Perpetua itálica con «ANTONIO MACHADO · 1912» (se oculta por debajo de 1180 px).
- **Móvil (≤ 899 px)**: la página fluye (`flex-direction:column`): placa (sin CTA), escena a
  `55vh` (mín. 400 px, cartucho arriba a la izquierda a `W*0.42`, 150–190 px), banda con el
  índice en columna y el verso; CTA fijo abajo con degradado. El eyebrow va en una línea
  (`nowrap`, 10 px).
- **Contrato V7** comprobado el 10-IX: sin fetch, `index.html` 60 KB + kit 180 KB en total,
  `noindex`, `prefers-reduced-motion` (estado final estático), 0 errores, sin
  desbordamiento, ~30 fps en reposo (el bucle vivo se limita a 32 ms) en escritorio y móvil,
  título «Growth & Earth · global development and environmental change since 1750» (ES:
  «… · desarrollo global y cambio ambiental desde 1750»). Clave de idioma compartida con el
  explorador: `growthWake.language` (no se renombró para no perder la preferencia guardada).
- La V7b anterior está en `C:/Work/scratch/checkpoint/visores_2026-09/web_cascorro_backup/index.html.20260910-ge.bak`
  (y `explorer.html.20260910-ge.bak`, `js.20260910-ge/`, `CLAUDE.md.20260910-ge.bak`).
  Scripts de parche reproducibles (`patch_portada.py`, `patch_explorer.py`) y QA (`qa_ge.py`)
  en `C:/Work/scratch/ephemeral/visores_2026-09/growth_earth/`; capturas en `identidad/`.

## Sistema de pestañas del explorador (documentado para añadir una sección, p. ej. «What if»)

Comprobado en `js/app.js` (líneas 15–90) y `explorer.html`. Una sección nueva necesita, en
este orden:

1. **El panel**: `<div class="section" id="section-<id>">…</div>` dentro de
   `.section-container` (junto a `#section-globe`, `#section-explore`, `#section-analysis`,
   `#section-about`). `.section` es absoluta y `display:none`; `.section.active` es `flex`
   en columna. Las barras superiores de una sección se ordenan con `order:-3/-2/-1`.
2. **El registro**: añadir la clave al objeto `sections` de `app.js`
   (`sections = { globe, explore, analysis, about }` → `document.getElementById`). Sin esa
   entrada `switchSection()` ignora el id y `handleHash()` no enruta.
3. **Los botones**: un `<button class="tab-btn" data-section="<id>" data-i18n="nav<Id>">` en
   `nav.tab-nav` de la cabecera **y otro** en `nav.mobile-bottom-nav` (con su `<svg>` de
   18 px y `<span class="bn-label" data-i18n="nav<Id>">`). `app.js` los cablea todos con un
   solo `querySelectorAll('.tab-btn')`: clic → `switchSection(id)` + `location.hash = '#id'`;
   la clase `active` se sincroniza en los dos juegos. El estilo ya está hecho (versales Gill
   espaciadas, filete bermellón inferior en escritorio y superior en el móvil): no hace
   falta CSS nuevo para la pestaña.
4. **Los textos**: claves `nav<Id>` en los tres diccionarios de `LANGUAGES` (`en`, `es`,
   `zh`) de `app.js`; `applyLanguage()` rellena `[data-i18n]`, `[data-i18n-html]` y
   `[data-i18n-title]`.
5. **El enrutado**: `#<id>` abre la sección (`handleHash`, también en `hashchange`);
   `#<id>?clave=valor` pasa por `applyStateFromParams()` (hoy `c`, `ind`, `view`, `an`,
   `range`, `from`, `year`); `buildStateHash()` escribe el permalink desde `State`
   (`activeSection`, `selectedCountries`, `currentYear`, `yearRange`, `yearFrom`,
   `indicator`…). `State.subscribe('activeSection')` llama a `switchSection`, y `switchSection`
   para la reproducción (`isPlaying=false`).
6. **Exportación**: `visibleFigure()` toma el `svg`/`canvas` más grande de `.section.active`
   para el PNG; `figureTitle()` distingue `globe`/`analysis`/`about` y deja el resto como
   Explore — una sección nueva con figura propia debe añadir su rama ahí. El botón Reset del
   pie vuelve a `globe`.
7. **La portada**: si la sección debe aparecer en el índice de la banda, añadir un enlace
   `explorer.html#<id>` en `nav.index` de `index.html` (con `data-es`).
8. **Caché**: subir el sufijo `?v=` en `explorer.html` y en todos los `import` de `js/`
   (hoy `20260910a`; un solo `sed` sobre `js/` y `explorer.html`).

## Escalas de color de los mapas (rehechas 2026-09-06; familia de la portada desde 2026-09-08; `ember` V7b 2026-09-09)

> **V7b (2026-09-09): `ember` rehecha; el globo sin textura ni paredes.** Juan vio que en CO₂
> fósil per cápita «Europa entera cae en el mismo rojo oscuro y África en dos naranjas». Causa:
> la `ember` V7 gastaba sus tres anclas altas en tres rojos oscuros y el dominio `[0,02, 50]`
> metía a toda Europa (3,5–9,2 t en 2024) en el 9 % de la barra. Ahora `ember` tiene **ocho
> anclas en paradas NO uniformes** (`MAP_RAMP_STOPS.ember` en `utils.js`; `rampLab()` las lee
> y las demás familias siguen a pasos iguales) que, sobre el dominio nuevo de `co2ff_pc`
> `[0,1, 50]`, caen en 0,1 · 0,5 · 1 · 3 · 6 · 10 · 20 · 50 t: arena `#f7ead0` → ocre claro
> `#ecc68d` → ocre `#e7a660` → ámbar `#df773f` → bermellón `#c64d38` (el de la portada) →
> sangre de toro `#9d363a` → ciruela `#692b3e` → tinta `#1d2039`. La mitad «fuente» de `tide`
> se remuestreó de la nueva `ember` (t 0,2→1). Medido con **CIEDE2000 ≥ 6** sobre los países
> realmente pintados (`C:/Work/scratch/ephemeral/visores_2026-09/portadas_v7/estelas/retoque/ramp_ember_v7b.py`):
> anclas vecinas ΔE00 ≥ 7,3 en normal, deutan y protan; `co2ff_pc` 2024 **9 → 14** tonos
> (deutan 9 → 13, protan 9 → 13), 1950 12 → 13; Europa 2024 2 → 4 tonos, Francia frente a
> Alemania ΔE00 5,7 → 13,3, EE. UU. frente a Alemania 6,7 → 13,8; los otros 17 indicadores de
> emisiones mejoran todos (media 11,9 / 10,6 / 10,8 → 14,2 / 12,5 / 12,5). «Sin dato» queda a
> ΔE00 ≥ 15,6 de la rampa y «cero» a ≥ 9,2; ambos siguen con trama/beige. Coste consciente:
> con el suelo en 0,1 t, en 1950 44 países de 154 (y 59 en 1900) caen en la arena de «≤ 0,1»
> — eran emisores casi nulos; si alguna vez importa, el suelo es una línea en `MAP_DOMAINS`.
> Las otras seis familias no se tocaron.
>
> **Globo.** Las «astillas negras» de las costas no eran las paredes de los polígonos sino la
> textura `earth-water.png` de la esfera, una máscara que pinta la tierra de NEGRO y cuya
> costa es más fina que la de los polígonos 110m: asomaba por cada borde (y por dentro de
> Groenlandia). `globe-renderer.js` ya no carga textura (`globeImageUrl(null)`, material de
> la esfera `#f8f5ee`), los lados son transparentes y los casquetes van a altitud 0,006
> (0,015 el seleccionado). Hover y clic no cambian (raycast sobre los casquetes; comprobado
> con tooltip). La leyenda del globo lleva 20 px de aire al panel de perfil, a la línea de
> tiempo y a la esfera, y 12/14/11 px de relleno; la del mapa, 20/20.

> **V7 (2026-09-08).** Juan pidió que «las paletas interiores se adapten a la portada». Las
> siete familias se reconstruyeron en CIELCh con el mismo método (escalera de L\* uniforme,
> `C:/Work/scratch/ephemeral/visores_2026-09/portadas_v7/estelas/ramps_v7.py`) pero ancladas
> a los tokens de la portada: todas arrancan en `--cream` y terminan en `--sea`/`--sea2` o en
> el sangre de toro en que oscurece `--verm`; los medios son `--ice`, `--line2` y `--verm`.
> `ember` (emisiones) = crema → ocre → bermellón → sangre de toro; `depth` (economía, por
> defecto) = crema → hielo → line2 → mar; `moss` (suelo, RLI) = crema → pizarra petróleo → mar
> profundo; `bronze` (IDH) = crema → oro → bronce → tierra; `ink` (materiales) = hielo → azul
> acero → índigo; `ameth` (población) = crema → malva → violeta → noche (el único matiz que
> la portada no tiene; se mantuvo azulado para que bajo dicromacia no se acerque al gris de
> «sin dato»); `tide` = mitad de `depth` invertida + piedra `#e4d5bd` + `ember`.
> **Medido sobre los datos reales** (49 indicadores × 5 años, mismo contador de tonos
> mutuamente separables ΔE76 ≥ 5): media **16,9** tonos con visión normal, **15,4** deutan,
> **14,9** protan (antes 20,3 / 17,7 / 17,5); mínimo 10,0 (`hdi_ng`, peor visión). Es un
> coste consciente: la familia de la portada es más corta perceptualmente y pierde 3–4
> escalones; el brief pedía ≥ 6 y todas pasan de 10. «Sin dato» `#8f8a7e` queda a ΔE76 ≥ 13,4
> de todas las rampas y «cero» `#c6baa2` a ≥ 9,6 (256 muestras, tres visiones); la trama de
> «sin dato» no cambia. **La regla anterior «ningún tono a menos de ΔE 10 de `--verm`» ya no
> rige para `ember` y `bronze`**: pasan por el bermellón porque eso es lo que se pidió. Las
> tablas que siguen son las de 2026-09-06 y describen las rampas anteriores; valen como
> método, no como cifras vigentes.

**Por qué.** Encargo del autor: «las paletas de los mapas ajustar a portadas y colores más
agradables en general». Objetivo doble: (a) que el mapa **discrimine** —dos valores
distintos, dos colores distintos— y (b) que la familia entera tenga un aire común con la
portada V5. Donde chocan, gana (a) y aquí se dice dónde chocó.

**Qué estaba mal.** Cuatro cosas, todas medidas antes de tocar nada:

1. `stretchScale()` recortaba el extremo CLARO de las rampas secuenciales de d3 y dejaba
   intacto el OSCURO. El problema estaba arriba: por encima de t≈0,7 una secuencial de
   ColorBrewer apenas cambia de luminosidad. Consecuencia real: sobre datos reales, **16,5
   países de media caían en el tono más pálido sin poder distinguirse entre sí**.
2. Veinte `if/else` con mínimos y máximos logarítmicos escritos a mano en
   `js/explore/choropleth.js`, **y una copia distinta** en `js/globe/globe-renderer.js`:
   los flujos de materiales iban de 1 a 20000 en el globo y de 0,5 a 3000 en el mapa, los
   cultivos 0,01–5 frente a 0,01–15. El mismo país, el mismo año, dos colores según la
   vista. De 46 indicadores mapeables, 35 tenían rango propio; 11 heredaban el de un
   prefijo y ninguno lo había elegido para ellos (`crop_permanent` usaba un tope de 500 Mha
   cuando su máximo histórico es 26).
3. La leyenda prometía escalones —una fila de casillas rotuladas— sobre un relleno
   continuo; en el globo, tres rótulos escritos a mano que ya no cuadraban con la escala
   («10 Gt» cuando el mapa se saturaba en 5 Gt) y un `Low/Mid/High` genérico para todo
   indicador no listado. Y `LEGEND_CONFIG` no tenía entrada para los ocho sub-indicadores
   de materiales: elegir «Biomass extraction» imprimía la leyenda de GHG.
4. «Sin dato» `#b0b0b0` y «cero» `#f5f0e8`. El cero estaba a ΔE76 **2,8** del papel: era
   invisible. El sin-dato caía a ΔE76 **4,1** de un tono de la rampa de economía bajo
   deuteranopía.

**Qué hay ahora.** Un solo modelo en `js/utils.js`, que usan el coropleto, el globo y las
dos leyendas: `MAP_RAMPS` (anclas), `MAP_DOMAINS` (dominios), `getMapColor()`,
`buildMapLegendHTML()`. Los dos `if/else` largos y `buildAbsoluteLegend()` desaparecieron.

- **Rampas.** Nueve anclas por familia interpoladas **en CIELAB** (matemática propia en
  `utils.js`, sin d3, para que el navegador aterrice exactamente en los colores auditados),
  con escalera de luminosidad monótona de L\*≈92 a L\*≈14. Siete familias: `ember`
  (emisiones), `depth` (economía), `bronze` (IDH), `ameth` (población), `ink` (flujos de
  materiales), `moss` (usos del suelo y RLI) y `tide` (divergente, para lo que lleva signo).
- **Dominios.** `MAP_DOMAINS` tiene entrada para **los 46 indicadores mapeables**; ninguno
  cae ya en un `else` anónimo (el que quedara fuera tiene un fallback declarado). Los pares
  logarítmicos **no están escritos a ojo**: se ajustaron sobre todos los pares país-año de
  `data/` (1850-2024) buscando el par de límites redondos (1/2/5 × 10^k) que maximiza el
  número de tonos separables en cinco años de muestra, dejando como mucho el 2% de las
  observaciones por encima del techo y el 5% por debajo del suelo, y penalizando un extremo
  aplastado. La única excepción anotada es `gdp_pc`, fijado a mano en `[300, 80000]`.
- **Signo.** `co2luc`, `land`, sus `_pc` y los acumulados usan una rampa divergente con
  transformación log simétrica: sumidero en azul, fuente en ámbar. Antes eran una rampa
  secuencial sobre un rango lineal −100…500 con recorte, y los 51 países sumidero de 2020
  se pintaban todos del mismo color.

**Cómo se midió** (herramientas en
`C:/Work/scratch/ephemeral/visores_2026-09/paletas/web_cascorro/`, `lock.py` reproduce la
tabla): se calcula el color de **todas** las unidades del mapa para un indicador y un año y
se cuenta cuántos tonos separa un lector, con ΔE76 ≥ 5 contra **todos** los ya contados —
no sólo contra el anterior, para no premiar a una rampa que se dobla sobre sí misma.

| medida (media de 40 indicadores × 5 años) | antes | después |
|---|---|---|
| tonos separables | 17,2 | **20,1** |
| unidades aplastadas en el tono más pálido | 16,5 | **7,4** |
| unidades aplastadas en el tono más oscuro | 2,4 | 2,4 |

Mejoran 36 de 40. Empeoran tres, dos de ellos ruido (`mfa_con_bio` −0,7, `pop_density`
−0,6) y uno de verdad: **`gdp_pc` (21,0 → 18,6)**,
que es el conflicto honesto entre (a) y (b): la rampa que le ganaba es `YlGnBu`, un
amarillo-verde-cian ácido sin ninguna relación con la portada, y el cambio devuelve a
cambio 7 países que antes compartían el tono más pálido (9,6 → 2,6).

Por indicador, en 2020 (normal / deuteranopía / protanopía):

| indicador | normal | deuteranopía | protanopía |
|---|---|---|---|
| `ghg` | 23 → **24** | 16 → **21** | 18 → **21** |
| `ghg_pc` | 18 → **25** | 12 → **20** | 14 → **19** |
| `coal_pc` | 16 → **24** | 10 → **20** | 13 → **20** |
| `pop` | 19 → **20** | 17 → **19** | 18 → 18 |
| `hdi` | 11 → **14** | 10 → **13** | 10 → **12** |
| `rli` | 14 → **18** | 11 → **16** | 11 → **16** |
| `co2luc` | 9 → **33** | 6 → **31** | 7 → **28** |
| `gdp_pc` | 25 → 22 | 23 → **22** | 23 → 21 |

La simulación de dicromacia es Viénot-Brettel-Mollon 1999. Las nueve anclas de cada familia
siguen siendo mutuamente separables (9/9) con visión normal, deuteranopía y protanopía; las
17 de la divergente, 17/17. Se cayó `RdYlGn` para el Red List Index: es el esquema
rojo-verde de manual, el que un deuteranope no puede leer, y ahora RLI usa `moss`
secuencial (oscuro = índice alto = más intacto).

**Categorías que no son valores.** `MAP_NO_DATA` `#8f8a7e` y `MAP_ZERO` `#c6baa2`, ambos en
`utils.js`. Medidos contra **cada tono de cada rampa sobre la que pueden aparecer**, en las
tres visiones: sin dato ΔE76 ≥ **10,5**, cero ≥ **20,3**, y **18,8** entre ellos; contra el
papel, 36,2 y 19,1. Ningún gris plano puede mantenerse lejos de todas las rampas bajo
deuteranopía, así que en el mapa SVG «sin dato» es además **trama** (el `pattern`
`hatching-explore-N`, con rect de fondo `#8f8a7e` y líneas `#6b6659`, que hay que mantener
igual que el swatch `.map-legend-nodata` de `explorer.html`). El globo, que no puede llevar
un `pattern` SVG, usa el plano solo. El centro de la rampa divergente **no** es el papel
sino una piedra `#e4d5bd`: un país que vale cero tiene que verse contra el mar (ΔE76 10,6
frente a `--bg`; el `#efe9dc` que probé primero daba 3 y Australia desaparecía).

**Aire con la portada, y qué quedó fuera.** Los **extremos** son de la portada: el pálido
sale de `--cream` `#EFE4CC` y el oscuro aterriza en `--sea` `#0E2C48` / `--sea2` o en una
tinta cálida equivalente; el papel, el cero y el sin-dato son neutros de la misma gama
cálida. El **medio no es de la portada** y no puede serlo: una rampa encerrada en el
hielo-a-marino de la portada tiene un recorrido perceptual corto (≈134 unidades de CIELAB
frente a ≈172 de la que se usa) y pierde entre 2 y 5 escalones por indicador. Se midió y se
descartó. Se respetó además el color de acento: ningún tono de ninguna rampa se acerca a
menos de ΔE76 10 de `--verm` `#c4502f`, para que un dato no se lea como un botón.
El globo se pasó al mismo papel (`backgroundColor` `#f2ede0`, atmósfera `--ice`).

La que más se aleja de la portada es `ameth` (población): un rosa-violeta que no está en la
carta náutica. Hacen falta siete familias distinguibles y la portada da seis; `ameth` es la
séptima, hereda la identidad morada que la población ya tenía (`Purples`) y aterriza en el
mismo azul de tinta que las demás. Si alguna vez sobra una familia, es la primera a revisar.

**La leyenda.** Una barra continua, porque el relleno es continuo, con las marcas colocadas
en `mapValueToT()` de su propio valor: la posición exacta que ese valor tiene en el mapa. El
título sale de `INDICATOR_LABELS` + `INDICATOR_UNITS`, así que no hay indicador sin leyenda.
La construye `buildMapLegendHTML()` y la usan las dos vistas; el CSS `.map-legend-*` vive al
pie del `<style>` de `explorer.html`. Texto medido sobre píxeles reales: título, marcas y
categorías **6,88:1** sobre el fondo de la caja, en mapa y en globo.

**Nombres de país escritos con el color de su serie.** `COMPARISON_PALETTE` es una paleta de
**línea**: siete de sus diez colores están entre 1,4:1 y 3,6:1 sobre este papel, y el visor
escribe el nombre del país en su color en tres sitios. Se añadió `COMPARISON_INK` +
`inkFor()` en `utils.js`: mismo tono, otra luminosidad, **los diez por encima de 4,5:1 sobre
los DOS papeles**. Se aplicó sólo a texto sobre papel — `end-label` de `trend-view.js` (dos
sitios), etiquetas de `ranking-view.js` y `bubble-label` de `correlations.js` — y medido
sobre píxeles da **4,84–11,24:1** donde antes daba 1,4–3,6:1. Las líneas, los puntos, los
chips y las baldosas **siguen con `COMPARISON_PALETTE`**, y el texto dentro del tooltip
oscuro también. La tinta separa algo menos con visión normal (ΔE76 mínimo entre pares 7,8
frente a 9,5) y bastante mejor sin verde (6,4 frente a **1,8**).

**Lo que este pase NO tocó y sigue pendiente:**

- `composition-view.js` sigue usando `d3.interpolateYlGnBu` para las baldosas del treemap.
  Es gráfico, no mapa, y su tinta de rótulo (`labelInkOn()`) está medida contra esas
  baldosas: cambiarlas obliga a remedir los 18 rótulos.
- `.profile-rank-badge` y las cifras del perfil de país siguen pintadas con el color de
  serie (1,3–3,6:1). Tienen sitio para `inkFor()` pero conviven con fondos teñidos y hay que
  medirlos uno a uno.
- Los rótulos de cuadrante de `tapio-view.js` (`PATTERN_META[].color` al 60%, 1,7–1,9:1)
  siguen igual: ahí el color nombra el patrón.

### Verificación independiente (2026-09-07)

Un segundo agente reprodujo las medidas **leyendo los `fill` realmente pintados en la
página servida** (Playwright sobre `explorer.html`, la copia previa del checkpoint en un
puerto propio para el «antes»), no recalculando las rampas en Python. El sentido general se
confirma; **dos cifras de la tabla de arriba no se reproducen** y hay un coste que no estaba
declarado.

| medida (28 pares indicador–año, sobre píxel pintado) | antes | después |
|---|---|---|
| tonos separables, visión normal | 16,4 | **20,0** |
| tonos separables, deuteranopía | 12,9 | **17,4** |
| tonos separables, protanopía | 13,9 | **17,1** |
| unidades aplastadas en el tono más pálido | 11,6 | **3,8** |
| unidades aplastadas en el tono más oscuro | 3,9 | 3,0 |

- **`pop` no mejora, empeora.** Medido: 17 → 15 con visión normal y 16 → 13 en protanopía
  (2020); 16 → 15 en 1980. La tabla de arriba dice 19 → 20 y no se reproduce. Se ve en el
  mapa: con `ameth` sobre `[0,005, 500]` casi todo el mundo cae en la mitad violeta-oscura.
- **`ghg` sale plano, no +1**: 19 → 19 con visión normal (sí mejora en dicromácia, 13 → 16
  y 15 → 17).
- **Coste no declarado en el extremo alto.** Los dominios nuevos son más bajos y clampan a
  más países grandes en el año que más se mira: en 2020, `ghg` funde China y EE. UU. en el
  mismo tono (antes sólo China tocaba techo), `co2ff` funde China, India y EE. UU., y `pop`
  funde China e India. La regla de ajuste (≤2% de las observaciones por encima del techo)
  se cumple sobre 1850-2024, donde dominan los años con valores pequeños. Si alguna vez se
  revisa una familia, empezar por `ameth`/`pop` y por el techo de `ghg`/`co2ff`.
- **Corregido en esta verificación:** las marcas de los extremos de la leyenda llevan ahora
  `≤` y `≥` en los dominios `log` y `sym`, porque esos extremos son **recortes**, no
  máximos. Sin el signo, la leyenda prometía «5k» donde el mapa dice «5k o más». Los
  dominios `unit` (`hdi`, `rli`) se dejan planos: ahí el límite es el rango de la medida.
  Cambio en `buildMapLegendHTML()` de `js/utils.js`, dentro de la generación `?v=20260906m`
  ya estampada: **antes de desplegar hay que subir el sufijo**, porque `m` ya se sirvió.
- Se comprobó también, y **sí cuadra**: leyenda contra mapa (ΔE76 medio 0,4 entre el color
  del país y el punto de la barra que le corresponde, máximo 3,9 en la divergente); las
  distancias de «sin dato» y «cero» contra las rampas **muestreadas a 256 puntos**, no sólo
  contra las nueve anclas; `COMPARISON_INK` (5,11–11,24:1 sobre `--bg`, 4,51–9,90:1 sobre
  `--bgl`, ΔE mínimo entre pares 7,8 / 6,4 / 7,6); y que `COLORS`, `labelInkOn()`,
  `COMPARISON_PALETTE` y las baldosas de composition siguen intactos.
- **Aviso latente:** `MAP_ZERO` `#c6baa2` queda a ΔE76 4,7 (deuteranopía) y 3,0
  (protanopía) de la rampa `depth`. Hoy no importa —ningún indicador de esa familia tiene
  ceros en los datos— pero `depth` es además la familia **por defecto** de
  `getMapFamily()`: un indicador nuevo que caiga ahí y tenga ceros los pintaría invisibles
  para un dicrómata. Al añadir un indicador, darle familia explícita.

## Reglas para agentes
- **Hay DOS modos de despliegue**:
  1. `cascorro_explorer.html` — archivo único autocontenido (30 MB). Se genera con `build/build.ps1`.
  2. `index.html` + `js/` + `data/` — versión modular (para desarrollo).
- **Para GitHub Pages**: se puede desplegar `index.html` directamente (usa módulos ES6 + CDN). El HTML autocontenido es alternativa para distribución offline.
- **NO modificar `build/`** sin instrucción explícita
- **Idioma**: inglés (interfaz EN/ES/中文; la marca «Growth & Earth» no se traduce)
- **4 secciones**: globe, explore, analysis, about (routing por hash; ver «Sistema de pestañas» arriba antes de añadir una)
- **Identidad Gill (2026-09-10)**: un solo acento (bermellón), crema, tinta cálida, versales espaciadas, filetes finos, Gill Sans/Cabin + Perpetua/Crimson Pro, sin ficheros de fuentes en el repo, una sola hoja de Google Fonts, `border-radius:0`. No introduzcas colores nuevos de cromo ni otra familia; `--verm` claro nunca como texto pequeño (usa `--verm-ink`/`--verm-deep`).

## Estado actual
- [x] Globo 3D interactivo con perfil de país
- [x] 6 vistas en Explore (trend, composition, choropleth, ranking, tapio, table)
- [x] 4 análisis (recessions, drivers, correlations, intensities)
- [x] Versión autocontenida generada (desfasada)
- [x] Identidad Growth & Earth / Gill en portada y explorador (2026-09-10)

## Pendiente
- [ ] **`cascorro_explorer.html` está desfasado** (de 2026-05-14; `explorer.html` es de
      2026-09). No lleva ni el pase móvil de septiembre, ni la paleta de la portada V5, ni el
      cromo claro V7b, la `ember` de ocho anclas ni el globo sin textura (2026-09-09), ni el
      nombre e identidad Growth & Earth (2026-09-10).
      Regenerarlo con `build/build.ps1` cuando toque distribuir la versión offline.
- [ ] Crear `.gitignore` (excluir `build/`, `cascorro_explorer.html`, `{}`)
- [ ] Borrar archivo `{}` (vacío, sin propósito)
- [ ] Decidir estrategia de despliegue: modular (index.html) vs autocontenido (cascorro_explorer.html)
- [ ] Definir nombre de organización GitHub para este visor
- [ ] **Tamaño**: si se despliega modular, 27.3 MB de datos + 380K JS. Si autocontenido, 30 MB en un archivo. Ambos dentro de límites de GitHub.
