// ============================================================================
// TIMELINE - Reusable play/pause time slider component
// Supports optional dual-handle mode for comparing two years
// ============================================================================

import State from '../state.js';

const SPEEDS = [
    { label: '1x', ms: 300 },
    { label: '2x', ms: 150 },
    { label: '4x', ms: 75 },
    { label: '8x', ms: 30 }
];

export default class Timeline {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.speedIndex = 2; // Default to 4x
        this.interval = null;
        this.dragging = false;
        this._dualMode = false;
        this._fromYear = State.get('yearRange')[0];
        this._onFromChange = null;
        this.render();
        this.bind();
        State.subscribe('currentYear', () => this.updatePosition());
        State.subscribe('yearRange', () => this.updatePosition());
        State.subscribe('isPlaying', (val) => this.updatePlayBtn(val));
    }

    render() {
        const id = this.container.id;
        this.container.innerHTML = `
            <button class="tl-play" id="${id}-play">
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
            <div style="position:relative;flex-shrink:0">
                <button class="tl-speed" id="${id}-speed">4x</button>
                <div class="tl-speed-dropdown" id="${id}-speed-dropdown" style="display:none;position:absolute;bottom:100%;left:0;background:var(--bg,#fff);border:1px solid var(--cb,#e0e0e0);z-index:50;min-width:50px">
                    ${SPEEDS.map((s, i) => `<div class="tl-speed-opt" data-idx="${i}" style="padding:4px 10px;font-size:11px;cursor:pointer;font-weight:${i === 2 ? '700' : '400'}">${s.label}</div>`).join('')}
                </div>
            </div>
            <div class="tl-track" id="${id}-track">
                <div class="tl-rail"></div>
                <div class="tl-range" id="${id}-range"></div>
                <div class="tl-progress" id="${id}-progress"></div>
                <div class="tl-handle tl-handle-from" id="${id}-handle-from" style="display:none"></div>
                <div class="tl-handle" id="${id}-handle"></div>
            </div>
            <div class="tl-year" id="${id}-year">2022</div>
        `;
        this.playBtn = document.getElementById(`${id}-play`);
        this.track = document.getElementById(`${id}-track`);
        this.progress = document.getElementById(`${id}-progress`);
        this.range = document.getElementById(`${id}-range`);
        this.handle = document.getElementById(`${id}-handle`);
        this.handleFrom = document.getElementById(`${id}-handle-from`);
        this.yearLabel = document.getElementById(`${id}-year`);
        this.speedBtn = document.getElementById(`${id}-speed`);
        this.updatePosition();
    }

    bind() {
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dd = document.getElementById(`${this.container.id}-speed-dropdown`);
            if (dd) dd.style.display = dd.style.display === 'none' ? '' : 'none';
        });
        const speedDD = document.getElementById(`${this.container.id}-speed-dropdown`);
        if (speedDD) {
            speedDD.querySelectorAll('.tl-speed-opt').forEach(opt => {
                opt.addEventListener('click', () => {
                    this.speedIndex = parseInt(opt.dataset.idx);
                    this.speedBtn.textContent = SPEEDS[this.speedIndex].label;
                    speedDD.querySelectorAll('.tl-speed-opt').forEach(o => o.style.fontWeight = '400');
                    opt.style.fontWeight = '700';
                    speedDD.style.display = 'none';
                    if (State.get('isPlaying')) this.startAnimation();
                });
            });
            document.addEventListener('click', (e) => {
                if (!speedDD.contains(e.target) && e.target !== this.speedBtn) {
                    speedDD.style.display = 'none';
                }
            });
        }
        this.track.addEventListener('click', (e) => {
            if (this.dragging) return;
            State.set('currentYear', this.posToYear(e));
        });

        // Main handle (right / current year)
        this._bindDrag(this.handle, (year) => State.set('currentYear', year));

        // From handle (left / from year) — constrained to not exceed currentYear
        this._bindDrag(this.handleFrom, (year) => {
            this._fromYear = Math.min(year, State.get('currentYear'));
            this.updatePosition();
            if (this._onFromChange) this._onFromChange(this._fromYear);
        });
    }

    _bindDrag(handleEl, onYear) {
        handleEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dragging = true;
            const onMove = (e2) => onYear(this.posToYear(e2));
            const onUp = () => { this.dragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        handleEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dragging = true;
            const onMove = (e2) => onYear(this.posToYear(e2.touches[0]));
            const onEnd = () => { this.dragging = false; document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); };
            document.addEventListener('touchmove', onMove);
            document.addEventListener('touchend', onEnd);
        });
    }

    posToYear(event) {
        const rect = this.track.getBoundingClientRect();
        const x = (event.clientX || event.pageX) - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const [minY, maxY] = State.get('yearRange');
        return Math.round(minY + pct * (maxY - minY));
    }

    updatePosition() {
        const year = State.get('currentYear');
        const [minY, maxY] = State.get('yearRange');
        const span = maxY - minY;
        const pct = span > 0 ? (Math.max(minY, Math.min(maxY, year)) - minY) / span * 100 : 0;

        this.handle.style.left = pct + '%';

        if (this._dualMode) {
            // Clamp fromYear to the current range
            this._fromYear = Math.max(minY, Math.min(maxY, this._fromYear));
            const fromPct = span > 0 ? (this._fromYear - minY) / span * 100 : 0;
            this.handleFrom.style.left = fromPct + '%';
            // Range highlight between from and to
            const left = Math.min(fromPct, pct);
            const width = Math.abs(pct - fromPct);
            this.range.style.left = left + '%';
            this.range.style.width = width + '%';
            this.progress.style.width = '0%';
            this.yearLabel.textContent = this._fromYear + ' \u2013 ' + year;
        } else {
            this.progress.style.width = pct + '%';
            this.range.style.width = '0%';
            this.yearLabel.textContent = year;
        }
    }

    updatePlayBtn(isPlaying) {
        this.playBtn.innerHTML = isPlaying
            ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
        // Stop any running interval when isPlaying externally set to false
        if (!isPlaying) this.stopAnimation();
    }

    togglePlay() {
        const playing = !State.get('isPlaying');
        State.set('isPlaying', playing);
        playing ? this.startAnimation() : this.stopAnimation();
    }

    startAnimation() {
        this.stopAnimation();
        // If already at the end, restart from the from-handle position
        const cur = State.get('currentYear');
        const [minY, maxY] = State.get('yearRange');
        const startY = this._dualMode ? this._fromYear : minY;
        if (cur >= maxY) {
            State.set('currentYear', startY);
        }
        this.interval = setInterval(() => {
            const year = State.get('currentYear');
            const [minY, maxY] = State.get('yearRange');
            if (year >= maxY) {
                // Stop at end — only restart if user presses play again
                this.stopAnimation();
                State.set('isPlaying', false);
                return;
            }
            State.set('currentYear', year + 1);
        }, SPEEDS[this.speedIndex].ms);
    }

    stopAnimation() {
        if (this.interval) { clearInterval(this.interval); this.interval = null; }
    }

    cycleSpeed() {
        this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
        this.speedBtn.textContent = SPEEDS[this.speedIndex].label;
        if (State.get('isPlaying')) this.startAnimation();
    }

    // Dual mode: show second handle for "from" year
    setDualMode(enabled, fromYear, onFromChange) {
        this._dualMode = enabled;
        if (fromYear != null) this._fromYear = fromYear;
        this._onFromChange = onFromChange || null;
        this.handleFrom.style.display = enabled ? '' : 'none';
        this.updatePosition();
    }

    getFromYear() { return this._fromYear; }

    destroy() { this.stopAnimation(); }
}
