// ============================================================================
// TOOLTIP - Shared tooltip component
// ============================================================================

const Tooltip = (() => {
    const el = document.getElementById('tooltip');

    // On a touch screen the card is anchored by the tap instead of chasing a
    // pointer that is not there: it stays put until the next tap elsewhere.
    const COARSE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    let dismiss = null;

    function armDismiss() {
        if (dismiss) document.removeEventListener('pointerdown', dismiss, true);
        dismiss = (ev) => {
            if (el.contains(ev.target)) return;
            hide();
        };
        setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
    }

    function show(html, event) {
        el.innerHTML = html;
        el.classList.add('visible');
        el.classList.toggle('pinned', COARSE);
        position(event);
        if (COARSE) armDismiss();
    }

    function position(event) {
        const margin = 14;
        const rect = el.getBoundingClientRect();
        let x = event.clientX + margin;
        let y = event.clientY + margin;
        if (x + rect.width > window.innerWidth) x = event.clientX - rect.width - margin;
        if (y + rect.height > window.innerHeight) y = event.clientY - rect.height - margin;
        // Clamp to the viewport: on a phone an anchored card was running off
        // the left edge and losing the name and the value.
        x = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }

    function move(event) {
        if (COARSE) return;                       // a pinned card must not drift
        if (el.classList.contains('visible')) position(event);
    }

    function hide() {
        el.classList.remove('visible');
        el.classList.remove('pinned');
        if (dismiss) { document.removeEventListener('pointerdown', dismiss, true); dismiss = null; }
    }

    // "The pointer left the mark." Views call this from mouseleave instead of
    // hide(). It matters on a phone: after a tap Chromium replays the whole
    // compatibility mouse sequence — mouseover, mousemove, mousedown, mouseup,
    // click — and then immediately fires mouseout/mouseleave on the same
    // element, because the synthetic hover only lasts for the tap. That
    // mouseleave used to call hide() a few milliseconds after pointerup had
    // pinned the card, so on a touch screen the value card flashed and died and
    // the map was unreadable. A pinned card is taken down by the next tap
    // elsewhere (armDismiss), never by a hover event that did not happen.
    function leave() {
        if (COARSE && el.classList.contains('pinned')) return;
        hide();
    }

    // Views that also draw a crosshair ask this so the crosshair stays with the
    // card instead of vanishing under it.
    function isPinned() { return el.classList.contains('pinned'); }

    return { show, move, hide, leave, isPinned };
})();

export default Tooltip;
