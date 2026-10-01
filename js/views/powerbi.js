// js/views/powerbi.js
window.Views = window.Views || {};

// ---------------------------------------------------------------------------
// Helpers de exportación (SheetJS, ya cargado globalmente en index.html para
// leer los .xlsx de entrada -- se reutiliza la misma librería para escribir).
// Todo ocurre en el navegador: no hay backend ni servidor, XLSX.writeFile
// arma el archivo en memoria y dispara la descarga directamente.
// ---------------------------------------------------------------------------
function pbiDownloadSheet(rows, filename, sheetName) {
    if (!rows || rows.length === 0) {
        showToast('No hay datos para exportar en esta tabla.', 'warning');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Datos');
    XLSX.writeFile(wb, filename);
    showToast(`Se descargó ${filename} (${rows.length} filas).`, 'success');
}

function pbiDownloadWorkbook(sheets, filename) {
    const nonEmpty = (sheets || []).filter(s => s.rows && s.rows.length > 0);
    if (nonEmpty.length === 0) {
        showToast('No hay datos para exportar todavía.', 'warning');
        return;
    }
    const wb = XLSX.utils.book_new();
    nonEmpty.forEach(s => {
        const ws = XLSX.utils.json_to_sheet(s.rows);
        XLSX.utils.book_append_sheet(wb, ws, s.name);
    });
    XLSX.writeFile(wb, filename);
    showToast(`Se descargó ${filename}.`, 'success');
}

Views.powerbi = function () {
    const trucks = AppState.processedTrucks || [];
    const shovels = AppState.processedShovels || AppState.shovelData || [];

    if (trucks.length === 0) {
        return `
            <div class="card">
                <h2>Exportar y Continuar en Power BI</h2>
                <p style="color: var(--ink-dim); margin-top: 10px; font-size: 0.9rem;">
                    No hay datos procesados todavía. Cargue y procese la telemetría en
                    <b>"Cargar y Filtrar"</b> para poder exportarla.
                </p>
            </div>
        `;
    }

    // Conteos para mostrar cuántas filas trae cada exportación.
    const shovelZones = DataProcessor.getShovelZones(shovels);
    const trips = DataProcessor.attributeEpisodesToShovels(
        DataProcessor.detectLoadEpisodesByTruck(trucks), shovelZones
    );
    const proximityEvents = DataProcessor.detectProximityEvents(trucks, shovels);
    const prod = DataProcessor.computeProductivityStats(trucks, shovels, AppState.params);

    const exportCards = [
        {
            icon: '🚛',
            title: 'Camiones Procesados',
            desc: 'Cada registro de telemetría de camión, ya con la zona y el estado operativo calculados (CARGANDO, EN_TRANSITO, DESCARGANDO, etc.). Es la tabla base para armar cualquier vista propia en Power BI.',
            count: `${trucks.length.toLocaleString('es-PE')} filas`,
            action: 'export-trucks'
        },
        {
            icon: '🔁',
            title: 'Viajes Completados',
            desc: 'Un registro por cada carga completa: camión, pala asignada, hora de inicio y fin, duración, número de pases y toneladas asumidas. Útil para un diagrama de Gantt de ciclos por camión.',
            count: `${trips.length.toLocaleString('es-PE')} filas`,
            action: 'export-trips'
        },
        {
            icon: '⚠️',
            title: 'Eventos de Proximidad',
            desc: 'El mismo detalle de la pestaña Seguridad: par de vehículos, inicio, fin, duración, distancia mínima y zona de cada evento.',
            count: `${proximityEvents.length.toLocaleString('es-PE')} filas`,
            action: 'export-proximity'
        },
        {
            icon: '📊',
            title: 'Resumen por Camión y por Pala',
            desc: 'Los KPIs agregados del turno (toneladas, viajes, pases, excesos de velocidad, paradas, ciclos por hora), sin los registros individuales.',
            count: `${prod.byTruck.length + prod.byShovel.length} filas`,
            action: 'export-summary'
        }
    ];

    const exportCardsHtml = exportCards.map(c => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 22px;">${c.icon}</span>
                <h3 style="font-size: 0.95rem; margin: 0;">${c.title}</h3>
            </div>
            <p style="font-size: 0.82rem; color: var(--ink-dim); line-height: 1.5; flex: 1;">${c.desc}</p>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <span class="badge" style="border-color: var(--border);">${c.count}</span>
                <button class="btn-primary pbi-export-btn" data-action="${c.action}" style="padding: 8px 16px; font-size: 11px;">
                    ⬇ Descargar .xlsx
                </button>
            </div>
        </div>
    `).join('');

    return `
        <div class="card">
            <h2>Exportar y Continuar en Power BI</h2>
            <p class="section-sub">
                Los resultados del procesamiento (estados operativos, cargas, eventos y KPIs) existen solo mientras la
                aplicación está abierta. Para cruzar este turno con otros, compartir un tablero o hacer análisis propios,
                exporte las tablas a Excel y continúe en Power BI u otra herramienta. Los archivos se generan en el
                navegador con la misma librería que lee los datos crudos; no se envía información a ningún servidor.
            </p>
        </div>

        <div class="card">
            <h2>Qué Exportar</h2>
            <p class="section-sub">Elija la tabla según el análisis que quiera construir.</p>
            <div class="upload-grid">${exportCardsHtml}</div>
        </div>

        <div class="card">
            <h2>Cómo Continuar en Power BI</h2>
            <p class="section-sub">Una vez descargado el archivo:</p>
            <ol style="color: var(--ink-dim); font-size: 0.88rem; line-height: 1.9; padding-left: 20px; margin-top: 4px;">
                <li>En Power BI Desktop: <b>Obtener datos → Excel</b>.</li>
                <li>Seleccione el archivo descargado y la hoja correspondiente.</li>
                <li>Haga clic en <b>Cargar</b> (o en <b>Transformar datos</b> para ajustar antes los tipos de columna).</li>
                <li>La hora se exporta como texto <code>HH:MM:SS</code>; conviértala a tipo Hora en Power Query para graficar por tiempo.</li>
            </ol>
            <p class="section-sub" style="margin-top: 14px;">Algunos análisis posibles:</p>
            <ul style="color: var(--ink-dim); font-size: 0.88rem; line-height: 1.8; padding-left: 20px;">
                <li><b>Gantt de ciclos por camión</b>, con "Viajes Completados" (inicio y fin de cada carga).</li>
                <li><b>Mapa de dispersión X/Z coloreado por estado operativo</b>, con "Camiones Procesados".</li>
                <li><b>Toneladas o eventos de proximidad por hora del turno</b>, relacionando las tablas por camión.</li>
            </ul>
        </div>

        <div class="note-card">
            <b>Alcance.</b> Esta vista no genera un archivo <code>.pbix</code> ni una plantilla de Power BI. Entrega los datos
            ya limpios y clasificados (estados, cargas, pases, eventos) en Excel, de modo que la lógica de clasificación no
            tenga que reconstruirse en otra herramienta. Las horas de un turno que cruza medianoche se exportan como hora
            del día (por ejemplo, 01:30:00).
        </div>
    `;
};

Views.initPowerbiEvents = function () {
    const container = document.getElementById('view-container');
    if (!container) return;

    const trucks = AppState.processedTrucks || [];
    const shovels = AppState.processedShovels || AppState.shovelData || [];

    container.querySelectorAll('.pbi-export-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;

            if (action === 'export-trucks') {
                const rows = trucks.map(r => {
                    const clean = {};
                    Object.keys(r).forEach(k => { if (!k.startsWith('__')) clean[k] = r[k]; });
                    return clean;
                });
                pbiDownloadSheet(rows, 'mineops_camiones_procesados.xlsx', 'Camiones');

            } else if (action === 'export-trips') {
                const shovelZones = DataProcessor.getShovelZones(shovels);
                const episodes = DataProcessor.attributeEpisodesToShovels(
                    DataProcessor.detectLoadEpisodesByTruck(trucks), shovelZones
                );
                const truckCapacity = parseFloat(AppState.params.truckCapacityTons) || DataProcessor.DEFAULT_PARAMS.truckCapacityTons;
                const rows = episodes.map(ep => ({
                    Camion: ep.truckId,
                    Pala: ep.shovelId || '—',
                    HoraInicio: DataProcessor.secondsToHMS(ep.startSec),
                    HoraFin: DataProcessor.secondsToHMS(ep.endSec),
                    DuracionSeg: ep.endSec - ep.startSec,
                    Pases: ep.passes || null,
                    ToneladasAsumidas: truckCapacity
                }));
                pbiDownloadSheet(rows, 'mineops_viajes_completados.xlsx', 'Viajes');

            } else if (action === 'export-proximity') {
                const events = DataProcessor.detectProximityEvents(trucks, shovels);
                const rows = events.map(e => ({
                    Vehiculo1: e.v1,
                    Vehiculo2: e.v2,
                    Inicio: DataProcessor.secondsToHMS(e.startSec),
                    Fin: DataProcessor.secondsToHMS(e.endSec),
                    DuracionSeg: e.durationSec,
                    DistMinM: Number(e.minDist.toFixed(2)),
                    Zona: e.zone
                }));
                pbiDownloadSheet(rows, 'mineops_eventos_proximidad.xlsx', 'Proximidad');

            } else if (action === 'export-summary') {
                const prod = DataProcessor.computeProductivityStats(trucks, shovels, AppState.params);
                const speedStats = DataProcessor.computeSpeedStatsByTruck(trucks, AppState.params);
                const stops = DataProcessor.countUnscheduledStopsByTruck(trucks);

                const byTruckRows = prod.byTruck.map(t => ({
                    Camion: t.id,
                    Viajes: t.trips,
                    ToneladasMovidas: t.tons,
                    VelocidadMaxima: speedStats[t.id] ? Number(speedStats[t.id].maxSpeed.toFixed(1)) : null,
                    SegundosExcesoVelocidad: speedStats[t.id] ? speedStats[t.id].excessCount : 0,
                    ParadasNoProgramadas: stops[t.id] || 0
                }));

                const byShovelRows = prod.byShovel.map(s => ({
                    Pala: s.id,
                    Material: s.material,
                    Viajes: s.trips,
                    CiclosPorHora: s.cyclesPerHour !== null ? Number(s.cyclesPerHour.toFixed(2)) : null,
                    PasesPromedio: s.avgPasses !== null ? Number(s.avgPasses.toFixed(2)) : null,
                    TiempoCargaPromMin: s.avgLoadMin !== null ? Number(s.avgLoadMin.toFixed(2)) : null,
                    ToneladasMovidas: s.tons
                }));

                pbiDownloadWorkbook([
                    { name: 'Por Camion', rows: byTruckRows },
                    { name: 'Por Pala', rows: byShovelRows }
                ], 'mineops_resumen_kpis.xlsx');
            }
        });
    });
};