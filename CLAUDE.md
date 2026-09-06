# web_cascorro — Global Change & Human Development Explorer

> Protocolo comun de agentes: ver `../../AGENTS.md`. Plan de URLs beta: `../../docs/BETA_VISORS.md`.

## Descripción
Explorador global de indicadores de cambio ambiental y desarrollo humano.
Incluye globo 3D, mapas coropléticos, análisis de tendencias, descomposición y correlaciones.
Destino: organización GitHub pendiente de definir.

## Estructura
```
cascorro_explorer.html  ← ARCHIVO DESPLEGABLE (30 MB, autocontenido con todo embebido)
index.html              ← Versión modular (desarrollo, NO desplegar directamente)
js/                     ← Módulos ES6 (23 archivos, 380K)
├── app.js              ← Controlador principal, routing por hash
├── state.js            ← Gestión de estado
├── data-loader.js      ← Carga de datos
├── utils.js            ← Utilidades
├── components/         ← country-picker, timeline, tooltip, export
├── globe/              ← globe-section, globe-renderer, country-profile
├── explore/            ← explore-section, trend, composition, choropleth,
│                         ranking, tapio, table (201K — sección más grande)
└── analysis/           ← analysis-section, recessions, drivers,
                          correlations, intensities
data/                   ← JSONs (27.3 MB)
├── cascorro_countries.json    ← 24 MB — dataset principal
├── cascorro_regions.json      ← 2.4 MB — agregaciones regionales
├── cascorro_reductions.json   ← 693K — descomposiciones
├── cascorro_metadata.json     ← Definiciones de variables
└── countries-110m.json        ← Topología del mapa
img/                    ← Logos y fotos del equipo (1.2 MB)
build/build.ps1         ← NO DESPLEGAR. Script PowerShell que genera cascorro_explorer.html
{}                      ← Archivo vacío, se puede borrar
```

## Stack
- HTML/CSS/JS vanilla (módulos ES6)
- D3.js v7 + TopoJSON + Globe.gl (CDN)
- Fuentes: Bricolage Grotesque + Geist + Geist Mono (una sola hoja de Google Fonts)
- Build: PowerShell script que empaqueta todo en un HTML autocontenido

## Paleta y tipografía del cromo (2026-09-06)

**Portada que sigue el visor:**
`07_temp/portadas_visores_2026-09/estelas/V5_wakes-in-the-sea.html`
(sustituye a V3, que era la referencia anterior; misma paleta, más el token `--ice`).

**No hay `css/` propio.** El cromo vive en línea en cuatro sitios y hay que tocarlos juntos:
`index.html` (`:root` de la portada del visor), `explorer.html` (`:root` del explorador,
bloque `<style>` de ~530 líneas), `js/app.js` (cabecera del PNG exportado: lee `--bg/--cd/--cl/--cb`
del CSS, pero las familias tipográficas van escritas a mano) y las cadenas `style=`/`cssText`
de `js/explore/composition-view.js`, `js/explore/table-view.js`, `js/explore/tapio-view.js`
y `js/components/country-picker.js` (todas usan ya `var(--...)`).

**Tokens de la portada, literales:**
`--sea #0E2C48` `--sea2 #0A2136` `--line #1E4463` `--line2 #2F5C7E`
`--cream #EFE4CC` `--cream2 #C6CFD6` `--muted #8AA3B7` `--foam #EDF4F7`
`--verm #C4502F` `--ice #7FA6C2`

**Cómo se reasientan sobre papel** (la portada pinta crema sobre mar oscuro; el explorador
es el fondo contrario, papel de carta náutica).

**Cómo se miden los ratios (2026-09-06).** No con `getComputedStyle().color`: el texto SVG
se pinta con `fill`, y leer `color` sobre un `<text>` devuelve el valor heredado, no el que
se ve — de ahí que un barrido anterior declarara «0 por debajo de AA» y fuera falso. El
barrido bueno toma el color de `fill` en SVG y de `color` en HTML, y el fondo lo FOTOGRAFÍA:
esconde todo el texto de la página con una regla global (`color/fill:transparent`), hace una
captura, y cada rótulo muestrea los píxeles reales de su propia caja. Es la única forma
correcta cuando el fondo es un lienzo, una imagen o un degradado. La herramienta está en
`C:/Work/scratch/ephemeral/visores_2026-09/estelas2/barrido.py`.

Ratios de la tabla, medidos sobre píxeles:

**Hay DOS papeles, no uno**: `--bg` `#f2ede0` y `--bgl` `#e7dfcc`. El segundo es más
oscuro y bajo él un token pierde ~0.6 puntos de ratio, así que la columna que manda
para cualquier texto sobre `--bgl` (chips, etiquetas del selector, hovers de botón)
es la tercera.

| token | valor | sobre `--bg` | sobre `--bgl` | de dónde sale |
|---|---|---|---|---|
| `--bg` | `#f2ede0` | — | — | `--cream` levantado hacia `--foam` |
| `--bgl` | `#e7dfcc` | — | — | un paso de vuelta hacia `--cream` |
| `--cb` | `#c6cfd6` | 1.4:1 (filete) | 1.2:1 (filete) | `--cream2` |
| `--cd` | `#0e2c48` | **12.2:1** | **10.8:1** | `--sea` como tinta |
| `--cg` | `#2a5474` | **6.9:1** | **6.0:1** | `--sea`↔`--line2` |
| `--cl` | `#456580` | **5.2:1** | **4.6:1** | `--muted` bajado hasta pasar AA en LOS DOS papeles (`#8aa3b7` daba 2.5:1; `#4a6d85`, 4.7:1 y 4.2:1) |
| `--verm` | `#c4502f` | 4.0:1 | 3.5:1 | sólo filetes, subrayados y marcas |
| `--verm-ink` | `#9f4126` | **5.5:1** | **4.9:1** | `--verm` a L 38.6% (mismo tono 13.3°, misma saturación) |

`--cl` pasó de `#4a6d85` a `#456580` (2026-09-06) porque en su sitio real —filas teñidas
de la tabla, lista de países, barra inferior del móvil— medía 4.2–4.4:1, no los 4.7:1 que
da sobre papel limpio. Ahora pasa sobre los dos papeles. El aspa del chip (`.chip-remove`)
y la etiqueta de recuento del selector (`.cpicker-item-tag`) siguen pintadas en `--cg`. `--verm-ink` bajó
de `#b04728` (4.19:1 sobre `--bgl`, fallaba en `.chip-remove:hover` y `.header-btn:hover`)
a `#9f4126`, que pasa sobre los dos papeles.

Los `::placeholder` de los tres buscadores van a `--cl` con `opacity:1`
(`.ctrl-input`, `.cpicker-search input`, `#globe-search-input`): sin regla propia
heredaban el gris del navegador, `#757575`, 3.9:1.

`index.html` usa los mismos valores bajo sus nombres: `--paper/--paper-2/--ink/--ink-soft/
--ink-mute/--rule/--warm/--warm-ink`. **Si cambias uno, cambia el otro.**

El mar oscuro sobrevive en un sitio: el raíl de Explore (`.explore-sidebar`), pintado en
`--sea2` con marcador activo en `--verm` (6.2:1 inactivo, 9.5:1 activo).

**Tipografía:** `--ff-display` Bricolage Grotesque (logo, títulos de gráfico, nombre de país,
h1 del intro), `--ff` Geist (interfaz), `--ff-mono` Geist Mono (todas las microetiquetas
en versalitas con interletraje, los años y la cabecera del PNG). Una sola petición a
Google Fonts; **no añadas otra**: mete la familia en la hoja que ya existe.

**Esquinas:** `border-radius:0` en toda la interfaz. Excepciones vivas, declaradas al pie
del `<style>` de `explorer.html`: retratos circulares del equipo (`.about-avatar`), puntos
de datos al 50% (`.chip-color/.chip-dot` y los que imprimen los js), y el asa del timeline
(`.tl-handle`). Nada más; nada de píldoras de 999px.

**Tinta de cromo dentro de `js/`:** `utils.js` `COLORS.uiText` = `#2a5474` (el mismo valor
que `--cg`). Es la tinta de los rótulos de eje, los pies de gráfico, los mensajes de estado
vacío y la celda de rango de la tabla — texto de interfaz dibujado dentro de un SVG, donde
no llegan las variables CSS. `COLORS.lightGray` `#adb5bd` **sigue donde es dato**: la serie
de referencia World (trend), la línea del año actual y las trayectorias no seleccionadas
(ranking), y las retículas y líneas de referencia (drivers, tapio, country-profile).
`utils.js labelInkOn()` elige tinta mar o papel para el rótulo que va ENCIMA de un color de
dato (baldosas de composition); el color de la baldosa no se toca, sólo lo que se escribe
sobre él.

**Lo que NO es cromo:** las escalas de color de datos viven en `js/`
(`utils.js` `COLORS`/`COMPARISON_PALETTE`, trend, composition, tapio, choropleth,
correlations, drivers). `--c1/--c2/--c3` de `explorer.html` son la excepción de nombre:
`--c1` es acento de interfaz, pero `--c2`/`--c3` marcan las fichas de método con el color
de su serie, así que cuentan como dato.

> **La regla «no se tocan las escalas de datos» ya no cubre los mapas.** El 6 de septiembre
> de 2026 el autor la levantó explícitamente para las escalas de mapa y pidió ajustarlas a
> la portada y hacerlas más agradables. Se rehicieron; la sección siguiente dice con qué
> criterio y con qué medida. Para todo lo demás —series de gráfico, baldosas de
> composition, colores de patrón de tapio— **la regla sigue en pie**.

**Marcas de agua del año — decorativas, declaradas (2026-09-06).** `#globe-year-display`
(1.28:1), `#explore-year-display` y `-2` (1.23:1) y la `text.year-watermark` de
`correlations.js` (1.05:1) llevan `aria-hidden="true"` y conservan su tono. El criterio no
es el tamaño sino la evidencia: en las tres vistas el mismo año se imprime a 12.2:1 en la
barra de tiempo de esa misma vista (`#globe-timeline-year`, `#explore-timeline-year`,
`#analysis-timeline-year`), así que la marca repite un dato disponible y es decoración.
Si alguna vista dejara de mostrar su barra de tiempo, la marca pasaría a ser la única
forma de saber el año y habría que subirla a 3:1. Igual el separador `·` de la portada
(`.switcher .sep`, 1.97:1): divide botones, no lleva información, `aria-hidden`.

**Pendiente conocido** — lo que este pase midió por debajo de AA y NO tocó, porque es
codificación de dato. La decisión es del autor:

| dónde | medido | qué es |
|---|---|---|
| `.profile-rank-badge` y las cifras del perfil | 1.3–3.6:1 | el número en el color de su serie |
| `end-label` / `bubble-label` / etiquetas de ranking | 1.4–3.6:1 → **4.84–11.24:1** | corregido 2026-09-06: `COMPARISON_INK` + `inkFor()`, mismo tono, tinta para texto |
| rótulos de cuadrante de `tapio-view.js` | 1.7–1.9:1 | `PATTERN_META[].color` al 60%: el color nombra el patrón de desacople |
| año del punto actual en `tapio-view.js` | 1.5:1 | pintado con el color del patrón; el año está a 12.2:1 en la barra de tiempo |
| `span.wake` de la portada | 2.1–2.2:1 → **3.3–3.4:1** | corregido: token propio `--warm-hero` `#96381f` |
| etiquetas de baldosa de `composition-view.js` | 1.44–5.5:1 → **4.17–9.8:1** | corregido con `labelInkOn()` (tinta por baldosa) y quitando el atenuado de opacidad; quedan 6 de 18 entre 4.17 y 4.5 en las baldosas de luminancia media, donde ni papel ni `--sea2` llegan a 4.5:1: cerrarlo del todo pide un velo bajo el rótulo y eso es decisión de diseño |
| celda «—» de `table-view.js` | 1.58:1 → **6.1:1** | corregido: `COLORS.uiText` |
| rótulo de eje de trend y pie de ranking | 1.78:1 → **6.9:1** | corregido: `COLORS.uiText` |
| `--cl` en su sitio real (`.bn-label`, `.rp-country-iso`, `.profile-unit`) | 4.2–4.4:1 → **4.7–5.2:1** | corregido: `#4a6d85` → `#456580` |

## Escalas de color de los mapas (rehechas 2026-09-06)

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
- **Idioma**: inglés
- **4 secciones**: globe, explore, analysis, about (routing por hash)

## Estado actual
- [x] Globo 3D interactivo con perfil de país
- [x] 6 vistas en Explore (trend, composition, choropleth, ranking, tapio, table)
- [x] 4 análisis (recessions, drivers, correlations, intensities)
- [x] Versión autocontenida generada

## Pendiente
- [ ] **`cascorro_explorer.html` está desfasado** (de 2026-05-14; `explorer.html` es de
      2026-09). No lleva ni el pase móvil de septiembre ni la paleta de la portada V5.
      Regenerarlo con `build/build.ps1` cuando toque distribuir la versión offline.
- [ ] Crear `.gitignore` (excluir `build/`, `cascorro_explorer.html`, `{}`)
- [ ] Borrar archivo `{}` (vacío, sin propósito)
- [ ] Decidir estrategia de despliegue: modular (index.html) vs autocontenido (cascorro_explorer.html)
- [ ] Definir nombre de organización GitHub para este visor
- [ ] **Tamaño**: si se despliega modular, 27.3 MB de datos + 380K JS. Si autocontenido, 30 MB en un archivo. Ambos dentro de límites de GitHub.
