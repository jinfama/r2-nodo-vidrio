// ============================================================================
// TOOLTIP - Shared tooltip component
// ============================================================================

const Tooltip = (() => {
    const el = document.getElementById('tooltip');

    function show(html, event) {
        el.innerHTML = html;
        el.classList.add('visible');
        position(event);
    }

    function position(event) {
        const margin = 14;
        const rect = el.getBoundingClientRect();
        let x = event.clientX + margin;
        let y = event.clientY + margin;
        if (x + rect.width > window.innerWidth) x = event.clientX - rect.width - margin;
        if (y + rect.height > window.innerHeight) y = event.clientY - rect.height - margin;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }

    function move(event) {
        if (el.classList.contains('visible')) position(event);
    }

    function hide() { el.classList.remove('visible'); }

    return { show, move, hide };
})();

export default Tooltip;
