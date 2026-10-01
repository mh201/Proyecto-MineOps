// js/views/resumen.js
window.Views = window.Views || {};

Views.resumen = function () {
    const trucks = AppState.processedTrucks || [];
    const shovels = AppState.processedShovels || AppState.shovelData || [];

    if (trucks.length === 0 && shovels.length === 0) {
        return `
            <div class="card">
                <h2>Resumen Operativo del Turno</h2>
                <p style="color: var(--ink-dim); margin-top: 10px; font-size: 0.9rem;">
                    No hay datos procesados todavía. Cargue y procese la telemetría en
                    <b>"Cargar y Filtrar"</b> para ver el resumen del turno.
                </p>
            </div>
        `;
    }

    // ---- Cálculos (reutiliza los mismos módulos que Productividad/Seguridad) ----
    const shiftWindow = DataProcessor.computeShiftWindow(trucks.length > 0 ? trucks : shovels);
    const shovelZones = DataProcessor.getShovelZones(shovels);
    const prodStats = DataProcessor.computeProductivityStats(trucks, shovels, AppState.params);
    const proximityEvents = DataProcessor.detectProximityEvents(trucks, shovels);
    const speedStatsArr = Object.values(DataProcessor.computeSpeedStatsByTruck(trucks, AppState.params));
    const totalSpeedExcess = speedStatsArr.reduce((s, v) => s + v.excessCount, 0);
    const stopsByTruck = DataProcessor.countUnscheduledStopsByTruck(trucks);
    const totalStops = Object.values(stopsByTruck).reduce((s, v) => s + v, 0);
    const stateDist = DataProcessor.computeStateDistribution(trucks);

    const activeTrucks = new Set(trucks.map(t => t.Vehiculo || t.EQUIPO || t.id)).size;
    const avgCyclesPerHour = prodStats.byShovel.length > 0
        ? prodStats.byShovel.reduce((s, x) => s + (x.cyclesPerHour || 0), 0) / prodStats.byShovel.length
        : null;

    const fmtInt = n => Math.round(n).toLocaleString('es-PE');
    const fmt1 = n => (n === null || n === undefined) ? '—' : n.toFixed(1);

    // ---- Franja de turno ----
    const shiftLabelHtml = shiftWindow
        ? `<b class="mono">${DataProcessor.secondsToHMS(shiftWindow.startSec)}</b> a <b class="mono">${DataProcessor.secondsToHMS(shiftWindow.endSec)}</b> &nbsp;·&nbsp; <b>${shiftWindow.hours.toFixed(1)} h</b> de telemetría`
        : 'No se pudo determinar la ventana horaria del turno.';

    // ---- KPIs generales ----
    const kpisHtml = `
        <div class="kpis">
          <div class="kpi"><div class="n" data-count="${activeTrucks}">0</div><div class="l">Camiones activos</div></div>
          <div class="kpi"><div class="n" data-count="${shovelZones.length}">0</div><div class="l">Palas en operación</div></div>
          <div class="kpi"><div class="n" data-count="${Math.round(prodStats.totalTons)}">0</div><div class="l">Toneladas totales movidas</div></div>
          <div class="kpi"><div class="n" data-count="${prodStats.totalTrips}">0</div><div class="l">Viajes completados</div></div>
          <div class="kpi"><div class="n" data-count="${avgCyclesPerHour !== null ? avgCyclesPerHour.toFixed(1) : 0}" data-decimals="1">0</div><div class="l">Ritmo de carguío promedio (ciclos/h)</div></div>
        </div>
    `;

    // ---- KPIs de seguridad (resumen, el detalle vive en la pestaña Seguridad) ----
    const safetyKpisHtml = `
        <div class="kpis">
          <div class="kpi"><div class="n danger" data-count="${proximityEvents.length}">0</div><div class="l">Eventos de proximidad</div></div>
          <div class="kpi"><div class="n danger" data-count="${totalSpeedExcess}">0</div><div class="l">Segundos con exceso de velocidad</div></div>
          <div class="kpi"><div class="n" data-count="${totalStops}">0</div><div class="l">Paradas no programadas</div></div>
        </div>
    `;

    // ---- Distribución de tiempo operativo de la flota ----
    const stateMeta = {
        CARGANDO: { label: 'Cargando', color: '#ffd23f' },
        ESPERA_EN_PALA: { label: 'Espera en pala', color: '#fb923c' },
        EN_TRANSITO: { label: 'En tránsito', color: '#7dd3fc' },
        DESCARGANDO: { label: 'Descargando', color: '#ef4444' },
        DETENIDO_EN_RUTA: { label: 'Detenido en ruta', color: '#94a3b8' },
        ESTACIONANDO: { label: 'Estacionando (reversa)', color: '#e879f9' }
    };
    const stateRows = stateDist.map(s => {
        const meta = stateMeta[s.state] || { label: s.state, color: '#5f88a8' };
        return `
        <div class="meter-row">
          <div class="lbl">${meta.label}</div>
          <div class="meter-track"><div class="meter-fill" data-w="${s.pct.toFixed(1)}" style="background: ${meta.color}"></div></div>
          <div class="meter-val">${s.pct.toFixed(1)}%</div>
        </div>
        `;
    }).join('');

    return `
        <div class="card">
            <h2>Resumen Operativo del Turno</h2>
            <p class="section-sub">${shiftLabelHtml}</p>
            ${kpisHtml}
        </div>

        <div class="card">
            <h2>Seguridad — Vistazo Rápido</h2>
            <p class="section-sub">Detalle completo (por camión, por zona, y el reporte evento por evento) en la pestaña <b>Seguridad</b>.</p>
            ${safetyKpisHtml}
        </div>

        <div class="card">
            <h2>Distribución del Tiempo Operativo de la Flota</h2>
            <p class="section-sub">Qué porcentaje de todos los segundos de telemetría de los camiones cayó en cada estado. El detalle por camión está en <b>Eficiencia y Ciclos</b>.</p>
            <div class="meter-block">${stateRows}</div>
        </div>

        <div class="note-card">
            <b>Metodología.</b> Este resumen reúne los indicadores principales de las demás vistas, calculados con los mismos
            criterios: <b>Productividad</b> (viajes = cargas completas detectadas; toneladas = viajes × ${prodStats.truckCapacity}&nbsp;t
            de capacidad de tolva), <b>Seguridad</b> (proximidad, velocidad según los límites de Parámetros y paradas en ruta) y
            <b>Eficiencia y Ciclos</b> (estados operativos). La ventana del turno va desde el primer hasta el último registro
            de camiones después de aplicar los filtros de "Cargar y Filtrar"; la distribución del tiempo se calcula sobre
            todos los segundos de telemetría de los camiones.
        </div>
    `;
};

Views.initResumenEvents = function () {
    animateReportWidgets(document.getElementById('view-container'));
};