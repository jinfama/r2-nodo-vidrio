// ============================================================================
// FACET GRID - shared geometry for the small-multiple grids in Analysis
// ----------------------------------------------------------------------------
// Recessions and Tapio used to size their facets with a constant (260 or 360
// px per cell) and then let the grid start at the top, so two facets left half
// the section empty and six of them scrolled even on a 1080p screen. The rule
// now is the other way round: the grid is told how many rows it has and the
// rows SHARE the height the section gives them.
//
//   1 facet    -> the whole scene
//   2 facets   -> two columns (two rows on a phone), half the height each
//   3-4 facets -> 2x2, half the height each
//   5-6 facets -> 3x2, the row height computed to fill the area
//   7 and up   -> same columns, the grid scrolls, never below a legible floor
//
// The caller measures each cell AFTER the rows are set, so the explicit
// grid-template-rows is what makes a single-pass measurement safe.
// ============================================================================

// Below this a facet is no longer a chart: the title and the x axis eat about
// 60 px, so ~150 px of plot is what is left. This is the floor for the
// scrolling grids.
export const MIN_FACET_H = 212;

// One or two rows always share whatever the section gives them, even on a short
// window: a slightly squat pair reads better than a scrollbar on two charts.
// Below this relaxed floor even two rows give up and scroll.
const SOFT_RATIO = 0.72;

/**
 * Columns for `count` facets across `width` pixels.
 * Phones keep one column; the 3-column grid starts at 900 px so a 1440 px
 * laptop shows six facets as 3x2 instead of the old 2x3 that overflowed, and a
 * 1000 px window still fits them in two rows instead of scrolling three.
 */
export function facetColumns(width, count) {
    if (count <= 1) return 1;
    if (width < 640) return 1;
    if (width < 900) return Math.min(2, count);
    if (count <= 4) return 2;
    return 3;
}

/**
 * Turn the chart wrapper into a flex column and add the grid to it. The legend
 * the caller appends afterwards is a sibling, so the grid's own clientHeight
 * (read later, in sizeFacetGrid) is already net of the legend.
 */
export function createFacetGrid(container) {
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.minHeight = '0';
    const grid = document.createElement('div');
    grid.className = 'facet-grid';
    container.appendChild(grid);
    return grid;
}

/** Undo createFacetGrid's container styling for the single-chart paths. */
export function resetFacetContainer(container) {
    if (!container) return;
    container.style.display = '';
    container.style.flexDirection = '';
    container.style.minHeight = '';
}

/**
 * Distribute the available height over the rows. Call it once the legend (if
 * any) is already in the DOM, and before the cells are appended.
 * Returns { cols, rows, cellH, scroll, width }.
 */
export function sizeFacetGrid(grid, count, opts = {}) {
    const rowGap = opts.rowGap != null ? opts.rowGap : 20;
    const colGap = opts.colGap != null ? opts.colGap : 18;
    const pad = opts.padding != null ? opts.padding : 8;
    const minCell = opts.minCell != null ? opts.minCell : MIN_FACET_H;
    const softFloor = opts.softFloor != null ? opts.softFloor : Math.round(minCell * SOFT_RATIO);

    grid.style.rowGap = rowGap + 'px';
    grid.style.columnGap = colGap + 'px';
    grid.style.padding = pad + 'px';

    const rect = grid.getBoundingClientRect();
    const width = grid.clientWidth || rect.width || 1000;
    const avail = grid.clientHeight || rect.height || 480;

    const cols = facetColumns(width, count);
    const rows = Math.max(1, Math.ceil(count / cols));
    const inner = avail - pad * 2 - rowGap * (rows - 1);
    const fit = Math.floor(inner / rows);
    const floor = rows <= 2 ? softFloor : minCell;
    const scroll = fit < floor;
    const cellH = scroll ? minCell : Math.max(fit, 1);

    grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
    grid.style.gridTemplateRows = `repeat(${rows},${cellH}px)`;
    grid.style.overflowY = scroll ? 'auto' : 'hidden';
    grid.style.overflowX = 'hidden';
    grid.classList.toggle('facet-grid-scroll', scroll);

    // Read back after the overflow change: a scrollbar narrows the columns and
    // the cells are measured against this width.
    return { cols, rows, cellH, scroll, width: grid.clientWidth || width };
}

/** Append `count` empty cells; the caller measures and draws into them. */
export function appendFacetCells(grid, count) {
    const cells = [];
    for (let i = 0; i < count; i++) {
        const cell = document.createElement('div');
        cell.className = 'facet-cell';
        grid.appendChild(cell);
        cells.push(cell);
    }
    return cells;
}

/**
 * Facet type never shrinks below 12 px, so when a facet is narrow or short it
 * is the NUMBER of ticks that comes down, not the type size.
 */
export function facetTicks(px, perTick, min = 3, max = 8) {
    return Math.max(min, Math.min(max, Math.floor(px / perTick) || min));
}

/** Standard legend strip under a facet grid (a flex sibling, never overlaps). */
export function createFacetLegend() {
    const el = document.createElement('div');
    el.className = 'facet-legend';
    return el;
}

/**
 * The title of one facet. 11-IX (r2): it used to be painted in the country's
 * own series colour, and four of the six ramps fall below 4.5:1 on the cream
 * (France's #E9C46A read 1.34:1, which is not a label, it is a rumour). The
 * colour is a data key, so it keeps its place — as a 9 px swatch in front of
 * the name — and the name itself is set in the ink.
 */
export function facetTitle(svg, x, y, name, color, ink) {
    svg.append('rect')
        .attr('x', x).attr('y', y - 9).attr('width', 9).attr('height', 9)
        .attr('fill', color);
    return svg.append('text')
        .attr('x', x + 14).attr('y', y)
        .style('font-size', '12px').style('font-weight', '600').style('fill', ink)
        .text(name);
}

/**
 * The classic corner collision: at the origin the first x tick and the last y
 * tick share the same 25 px ("−60 %" over "−100 %", "1860" over "0"). The x
 * label is the one that goes — the y axis owns that corner. Call it after both
 * axes are in the DOM. 11-IX (r2).
 */
export function dropCornerTick(gx, gy) {
    try {
        const xs = gx.selectAll('.tick text').nodes();
        const ys = gy.selectAll('.tick text').nodes();
        if (!xs.length || !ys.length) return;
        const a = xs[0].getBoundingClientRect();
        if (!(a.width > 0)) return;
        for (const n of ys) {
            const b = n.getBoundingClientRect();
            if (a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2) {
                xs[0].style.visibility = 'hidden';
                return;
            }
        }
    } catch (e) { /* no layout yet: nothing to drop */ }
}
