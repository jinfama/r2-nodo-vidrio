// ============================================================================
// EXPORT - Screenshot + CSV export + Fullscreen
// ============================================================================

export function captureScreenshot() {
    const app = document.getElementById('app');
    if (typeof html2canvas !== 'undefined') {
        html2canvas(app, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false })
            .then(canvas => {
                const link = document.createElement('a');
                link.download = `cascorro_export_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(err => console.error('Screenshot failed:', err));
    } else {
        console.warn('html2canvas not loaded');
    }
}

export function exportCSV(data, filename) {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
        headers.map(h => {
            const val = row[h];
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return val;
        }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || `cascorro_data_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function toggleFullscreen() {
    const app = document.getElementById('app');
    if (!document.fullscreenElement) {
        app.requestFullscreen().catch(err => console.error(err));
    } else {
        document.exitFullscreen();
    }
}
