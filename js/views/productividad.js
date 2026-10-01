// js/views/productividad.js
window.Views = window.Views || {};

Views.productividad = function () {
    const trucks = AppState.processedTrucks || [];
    const shovelsRaw = AppState.processedShovels || AppState.shovelData || [];

    if (trucks.length === 0) {
        return `
            <div class="card">
                <h2>Análisis de Productividad</h2>
                <p style="color: var(--ink-dim); margin-top: 10px; font-size: 0.9rem;">
                    No hay datos procesados todavía. Cargue y procese la telemetría en
                    <b>"Cargar y Filtrar"</b> para ver toneladas movidas, viajes completados
                    y ritmo de carguío del turno.
                </p>
            </div>
        `;
    }

    const stats = DataProcessor.computeProductivityStats(trucks, shovelsRaw, AppState.params);
    const { byTruck, byShovel, totalTrips, totalTons, shiftHours, truckCapacity, passStats } = stats;

    const fmtInt = n => Math.round(n).toLocaleString('es-PE');
    const fmt1 = n => (n === null || n === undefined) ? '—' : n.toFixed(1);

    const avgTripsPerTruck = byTruck.length > 0 ? (totalTrips / byTruck.length) : 0;
    const avgCyclesPerHour = byShovel.length > 0
        ? byShovel.reduce((s, x) => s + (x.cyclesPerHour || 0), 0) / byShovel.length
        : null;

    // ---- KPIs ----
    const kpisHtml = `
        <div class="kpis">
          <div class="kpi"><div class="n" data-count="${Math.round(totalTons)}">0</div><div class="l">Toneladas totales movidas</div></div>
          <div class="kpi"><div class="n" data-count="${totalTrips}">0</div><div class="l">Viajes completados</div></div>
          <div class="kpi"><div class="n" data-count="${avgTripsPerTruck.toFixed(1)}" data-decimals="1">0</div><div class="l">Promedio de viajes por camión</div></div>
          <div class="kpi"><div class="n" data-count="${avgCyclesPerHour !== null ? avgCyclesPerHour.toFixed(1) : 0}" data-decimals="1">0</div><div class="l">Ritmo de carguío promedio (ciclos/hora)</div></div>
          <div class="kpi"><div class="n" data-count="${passStats && passStats.avgPasses ? passStats.avgPasses.toFixed(1) : 0}" data-decimals="1">0</div><div class="l">Pases promedio por carga</div></div>
        </div>
    `;

    // ---- Toneladas movidas por camión ----
    const maxTons = Math.max(1, ...byTruck.map(t => t.tons));
    const tonsRows = byTruck.map(t => `
        <div class="meter-row">
          <div class="lbl">${t.id}</div>
          <div class="meter-track"><div class="meter-fill" data-w="${(t.tons / maxTons * 100).toFixed(1)}" style="background: var(--accent)"></div></div>
          <div class="meter-val">${fmtInt(t.tons)} t</div>
        </div>
    `).join('');

    // ---- Viajes completados por camión ----
    const byTripsDesc = [...byTruck].sort((a, b) => b.trips - a.trips);
    const maxTrips = Math.max(1, ...byTripsDesc.map(t => t.trips));
    const tripsRows = byTripsDesc.map(t => `
        <div class="meter-row">
          <div class="lbl">${t.id}</div>
          <div class="meter-track"><div class="meter-fill" data-w="${(t.trips / maxTrips * 100).toFixed(1)}" style="background: #7dd3fc"></div></div>
          <div class="meter-val">${t.trips} viajes</div>
        </div>
    `).join('');

    // ---- Ritmo de carguío por pala ----
    const maxCph = Math.max(1, ...byShovel.map(s => s.cyclesPerHour || 0));
    const cphRows = byShovel.map(s => `
        <div class="meter-row">
          <div class="lbl">${s.id}</div>
          <div class="meter-track"><div class="meter-fill" data-w="${((s.cyclesPerHour || 0) / maxCph * 100).toFixed(1)}" style="background: #6ee7b7"></div></div>
          <div class="meter-val">${fmt1(s.cyclesPerHour)} ciclos/h</div>
        </div>
    `).join('');

    // ---- Distribución de pases por carga ----
    const passDist = (passStats && passStats.distribution) || {};
    const passKeys = Object.keys(passDist).map(Number).sort((a, b) => a - b);
    const maxPassCount = Math.max(1, ...passKeys.map(k => passDist[k]));
    const passRows = passKeys.map(k => `
        <div class="meter-row">
          <div class="lbl">${k} ${k === 1 ? 'pase' : 'pases'}</div>
          <div class="meter-track"><div class="meter-fill" data-w="${(passDist[k] / maxPassCount * 100).toFixed(1)}" style="background: #ffd23f"></div></div>
          <div class="meter-val">${passDist[k]} ${passDist[k] === 1 ? 'carga' : 'cargas'}</div>
        </div>
    `).join('');

    // ---- Tabla resumen por pala ----
    const shovelTableRows = byShovel.map(s => `
        <tr>
          <td>${s.id}</td>
          <td>${s.material}</td>
          <td class="mono">${s.trips}</td>
          <td class="mono">${fmt1(s.cyclesPerHour)}</td>
          <td class="mono">${fmt1(s.avgPasses)}</td>
          <td class="mono">${fmt1(s.avgLoadMin)} min</td>
          <td class="mono">${fmtInt(s.tons)} t</td>
        </tr>
    `).join('');

    return `
        <div class="card">
            <h2>Resumen de Productividad del Turno</h2>
            <p class="section-sub">Toneladas movidas, viajes completados y ritmo de carguío, con la capacidad de tolva asumida en Parámetros y Supuestos.</p>
            ${kpisHtml}
        </div>

        <div class="card">
            <h2>Por Camión</h2>
            <p class="section-sub">1 viaje = 1 carga completa (desde el primer pase de la pala hasta que el camión parte). Toneladas = viajes × ${truckCapacity} t.</p>
            <div class="meter-block"><h4 class="block-title">Toneladas movidas por camión</h4>${tonsRows}</div>
            <div class="meter-block"><h4 class="block-title">Viajes completados por camión</h4>${tripsRows}</div>
        </div>

        <div class="card">
            <h2>Por Pala</h2>
            <p class="section-sub">Cada viaje se asigna a la pala físicamente más cercana durante ese pase de carga. Ritmo de carguío = viajes atendidos ÷ duración del turno${shiftHours ? ` (${shiftHours.toFixed(1)} h)` : ''}.</p>
            <div class="meter-block"><h4 class="block-title">Ritmo de carguío por pala (ciclos/hora)</h4>${cphRows}</div>
            <div class="meter-block"><h4 class="block-title">Cargas según número de pases</h4>${passRows || '<p class="section-sub">Sin datos de Llenado para contar pases.</p>'}</div>
            <div class="table-wrap"><table class="tabla">
                <thead><tr><th>Pala</th><th>Material asignado</th><th>Viajes atendidos</th><th>Ciclos/hora</th><th>Pases prom.</th><th>Tiempo de carga prom.</th><th>Toneladas movidas</th></tr></thead>
                <tbody>${shovelTableRows}</tbody>
            </table></div>
        </div>

        <div class="note-card">
            <b>Metodología.</b> Un <b>pase</b> es cada subida del <code>Llenado</code> del camión estando en el frente; si el
            sensor registra el mismo pase en lecturas separadas por 5&nbsp;s o menos, se cuenta una sola vez. Una
            <b>carga</b> va desde el primer pase hasta que el camión vuelve a moverse; todo ese tiempo es
            <b>CARGANDO</b> (también los segundos entre pases), y el tiempo en el frente antes del primer pase es
            <b>espera en pala</b>. Los pases pertenecen a la misma carga si no hubo descarga entre ellos, no pasaron más de
            10&nbsp;min y el camión no se alejó más de 120&nbsp;m. Cada carga se asigna a la pala más cercana a la posición
            promedio del camión mientras cargaba. Las <b>toneladas</b> asumen que cada viaje carga la capacidad nominal de
            tolva configurada (<b>${truckCapacity}&nbsp;t</b> actualmente) -- no se pondera por el Llenado final ni por
            densidad del material. La capacidad de tolva y el material de cada pala se configuran en
            <b>"Parámetros y Supuestos"</b>, y esta vista se recalcula con los valores guardados.
        </div>
    `;
};

Views.initProductividadEvents = function () {
    animateReportWidgets(document.getElementById('view-container'));
};