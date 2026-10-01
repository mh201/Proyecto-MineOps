// js/views/seguridad.js
window.Views = window.Views || {};

Views.seguridad = function () {
    const trucks = AppState.processedTrucks || [];
    const shovels = AppState.processedShovels || [];

    if (trucks.length === 0 && shovels.length === 0) {
        return `
            <div class="card">
                <h2>Seguridad: Proximidad, Velocidad y Paradas</h2>
                <p style="color: var(--ink-dim); margin-top: 10px; font-size: 0.9rem;">
                    No hay datos procesados todavía. Cargue y procese la telemetría en
                    <b>"Cargar y Filtrar"</b> para ver los indicadores de seguridad del turno.
                </p>
            </div>
        `;
    }

    function sevClass(d) {
        if (d < 10) return 'sev-high';
        if (d < 13) return 'sev-mid';
        return 'sev-low';
    }

    // ---- Cálculos (ver dataProcessor.js, módulo de seguridad) ----
    const events = DataProcessor.detectProximityEvents(trucks, shovels);
    const limits = DataProcessor.getSpeedLimits(AppState.params);
    const speedStatsObj = DataProcessor.computeSpeedStatsByTruck(trucks, AppState.params);
    const stopsByTruck = DataProcessor.countUnscheduledStopsByTruck(trucks);
    const sharpTurns = DataProcessor.countSharpTurns(trucks);
    const swingStats = DataProcessor.computeShovelSwingStats(shovels);
    // Línea de referencia en el gráfico de velocidad máxima: el límite más alto
    // (normalmente el de camión vacío en vía plana).
    const limitKmh = Math.max(limits.empty, limits.loaded);
    const singleLimit = limits.empty === limits.loaded && limits.ramp >= limits.empty;
    const limitsText = singleLimit
        ? `${limits.empty}&nbsp;km/h`
        : `vacío ${limits.empty}, cargado ${limits.loaded} y rampa ${limits.ramp}&nbsp;km/h`;

    const totalProximity = events.length;
    const minDistOverall = events.length > 0 ? Math.min(...events.map(e => e.minDist)) : null;
    const totalStops = Object.values(stopsByTruck).reduce((s, v) => s + v, 0);

    const speedStatsArr = Object.values(speedStatsObj);
    const totalSpeedExcess = speedStatsArr.reduce((s, v) => s + v.excessCount, 0);
    const excessBy = {
        empty: speedStatsArr.reduce((s, v) => s + v.excessEmpty, 0),
        loaded: speedStatsArr.reduce((s, v) => s + v.excessLoaded, 0),
        ramp: speedStatsArr.reduce((s, v) => s + v.excessRamp, 0)
    };

    // ---- KPIs ----
    const minDistKpi = minDistOverall !== null
        ? `<div class="n" data-count="${minDistOverall.toFixed(1)}" data-decimals="1" data-suffix="&nbsp;m">0&nbsp;m</div>`
        : `<div class="n">—</div>`;

    const kpisHtml = `
        <div class="kpis">
          <div class="kpi"><div class="n danger" data-count="${totalProximity}">0</div><div class="l">Eventos de proximidad detectados</div></div>
          <div class="kpi">${minDistKpi}<div class="l">Distancia mínima registrada</div></div>
          <div class="kpi"><div class="n" data-count="${totalStops}">0</div><div class="l">Paradas no programadas en ruta</div></div>
          <div class="kpi"><div class="n danger" data-count="${totalSpeedExcess}">0</div><div class="l">Segundos con exceso de velocidad</div></div>
          <div class="kpi"><div class="n" data-count="${sharpTurns.total}">0</div><div class="l">Giros bruscos registrados</div></div>
        </div>
    `;

    // ---- Excesos de velocidad por camión ----
    const bySpeedExcessDesc = [...speedStatsArr].sort((a, b) => b.excessCount - a.excessCount);
    const maxExcess = Math.max(1, ...bySpeedExcessDesc.map(s => s.excessCount));
    const speedExcessRows = bySpeedExcessDesc.map(s => `
        <div class="meter-row">
          <div class="lbl">${s.id}</div>
          <div class="meter-track"><div class="meter-fill" data-w="${(s.excessCount / maxExcess * 100).toFixed(1)}" style="background: var(--danger)"></div></div>
          <div class="meter-val">${s.excessCount} s</div>
        </div>
    `).join('');

    // ---- Velocidad máxima por camión (con línea del límite de referencia) ----
    const bySpeedMaxDesc = [...speedStatsArr].sort((a, b) => b.maxSpeed - a.maxSpeed);
    const axisMax = Math.max(70, Math.ceil(Math.max(limitKmh, ...bySpeedMaxDesc.map(s => s.maxSpeed)) * 1.05));
    const limitPct = (limitKmh / axisMax * 100).toFixed(1);
    const maxSpeedRows = bySpeedMaxDesc.map(s => {
        const exceeded = s.excessCount > 0;
        const pct = (s.maxSpeed / axisMax * 100).toFixed(1);
        return `
        <div class="meter-row">
          <div class="lbl">${s.id}</div>
          <div class="meter-track"><div class="meter-limit" style="left:${limitPct}%"></div><div class="meter-fill" data-w="${pct}" style="background: ${exceeded ? 'var(--danger)' : 'var(--ok)'}"></div></div>
          <div class="meter-val">${s.maxSpeed.toFixed(1)}&nbsp;km/h <span class="badge ${exceeded ? 'badge-danger' : 'badge-ok'}">${exceeded ? 'EXCESO' : 'OK'}</span></div>
        </div>
        `;
    }).join('');

    // ---- Paradas no programadas por camión ----
    const stopsArr = Object.keys(stopsByTruck).map(id => ({ id, count: stopsByTruck[id] })).sort((a, b) => b.count - a.count);
    const maxStops = Math.max(1, ...stopsArr.map(s => s.count));
    const stopsRows = stopsArr.map(s => `
        <div class="meter-row">
          <div class="lbl">${s.id}</div>
          <div class="meter-track"><div class="meter-fill" data-w="${(s.count / maxStops * 100).toFixed(1)}" style="background: #c9f27a"></div></div>
          <div class="meter-val">${s.count} paradas</div>
        </div>
    `).join('');

    // ---- Velocidad de giro por pala (opcional, si hay palas) ----
    let swingBlockHtml = '';
    if (swingStats.length > 0) {
        const maxSwing = Math.max(1, ...swingStats.map(s => s.maxSwingSpeed));
        const swingRows = swingStats.map(s => `
            <div class="meter-row">
              <div class="lbl">${s.id}</div>
              <div class="meter-track"><div class="meter-fill" data-w="${(s.maxSwingSpeed / maxSwing * 100).toFixed(1)}" style="background: #38bdf8"></div></div>
              <div class="meter-val">${s.maxSwingSpeed.toFixed(1)}&nbsp;°/s (giro)</div>
            </div>
        `).join('');

        swingBlockHtml = `
        <div class="card">
            <h2>Velocidad de Giro de Palas</h2>
            <p class="section-sub">Velocidad angular de la superestructura al girar entre el frente y la tolva del camión.</p>
            <div class="meter-block"><h4 class="block-title">Velocidad de giro máxima por pala</h4>${swingRows}</div>
            <p class="kpi-note">Se estima a partir del cambio de orientación (Rot_Z) entre lecturas consecutivas de cada pala; la telemetría no trae la velocidad angular medida directamente. Corresponde al giro de la superestructura, no a un desplazamiento, por eso no se compara con los límites de velocidad de vía.</p>
        </div>
        `;
    }

    // ---- Resumen de proximidad por zona ----
    const zoneGroups = {};
    events.forEach(e => {
        if (!zoneGroups[e.zone]) zoneGroups[e.zone] = [];
        zoneGroups[e.zone].push(e);
    });
    const zoneOrder = Object.keys(zoneGroups).sort((a, b) => zoneGroups[b].length - zoneGroups[a].length);

    const zoneSummaryRows = zoneOrder.map(zone => {
        const list = zoneGroups[zone];
        const minD = Math.min(...list.map(e => e.minDist));
        const totalDur = list.reduce((s, e) => s + e.durationSec, 0);
        return `
        <tr>
          <td>${zone}</td>
          <td class="mono">${list.length}</td>
          <td class="mono ${sevClass(minD)}">${minD.toFixed(2)} m</td>
          <td class="mono">${totalDur.toFixed(1)} s</td>
        </tr>
        `;
    }).join('');

    const zoneSummaryHtml = zoneOrder.length > 0 ? `
        <div class="card">
            <h2>Proximidad por Zona</h2>
            <p class="section-sub">Los ${totalProximity} eventos de proximidad, agrupados por la actividad operativa del camión en el momento del evento.</p>
            <div class="table-wrap"><table class="tabla">
                <thead><tr><th>Zona</th><th>N° Eventos</th><th>Dist. mínima</th><th>Duración total</th></tr></thead>
                <tbody>${zoneSummaryRows}</tbody>
            </table></div>
        </div>
    ` : '';

    // ---- Reporte detallado ----
    const detailRows = events.map(e => `
        <tr>
          <td>${e.v1}</td>
          <td>${e.v2}</td>
          <td class="mono">${DataProcessor.secondsToHMS(e.startSec)}</td>
          <td class="mono">${DataProcessor.secondsToHMS(e.endSec)}</td>
          <td class="mono">${e.durationSec.toFixed(1)} s</td>
          <td class="mono ${sevClass(e.minDist)}">${e.minDist.toFixed(2)} m</td>
          <td>${e.zone}</td>
        </tr>
    `).join('');

    const detailHtml = `
        <div class="card">
            <h2>Reporte Detallado de Eventos de Proximidad</h2>
            <p class="section-sub">Total de eventos detectados: <b class="mono">${totalProximity}</b></p>
            ${totalProximity > 0 ? `
            <div class="table-wrap"><table class="tabla">
                <thead><tr><th>Vehículo 1</th><th>Vehículo 2</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Dist. mín.</th><th>Zona</th></tr></thead>
                <tbody>${detailRows}</tbody>
            </table></div>
            ` : `<p style="color: var(--ink-dim); font-size: 0.85rem;">No se detectaron pares de vehículos por debajo del umbral de ${DataProcessor.PROXIMITY_THRESHOLD_METERS} m en este turno (sin contar la espera, la maniobra y la carga junto a la pala).</p>`}
        </div>
    `;

    return `
        <div class="card">
            <h2>Resumen de Seguridad del Turno</h2>
            <p class="section-sub">Proximidad entre vehículos, excesos de velocidad, paradas no programadas y giros bruscos.</p>
            ${kpisHtml}
        </div>

        <div class="card">
            <h2>Velocidad</h2>
            <p class="section-sub">Comparación por camión contra los límites configurados en Parámetros (${limitsText}).</p>
            <div class="meter-block"><h4 class="block-title">Segundos con exceso de velocidad por camión</h4>${speedExcessRows}</div>
            <div class="meter-block"><h4 class="block-title">Velocidad máxima por camión (línea = ${limitKmh} km/h)</h4>${maxSpeedRows}</div>
            <p class="kpi-note">Del total de ${totalSpeedExcess} s con exceso: <b>${excessBy.empty}</b> s con el camión vacío, <b>${excessBy.loaded}</b> s cargado y <b>${excessBy.ramp}</b> s en rampa (sobre el límite de rampa). ${sharpTurns.total === 0 ? 'El indicador "Giro_Brusco" no se activó en ningún registro del turno.' : `Se registraron ${sharpTurns.total} giros bruscos (indicador "Giro_Brusco").`}</p>
        </div>

        <div class="card">
            <h2>Paradas No Programadas</h2>
            <p class="section-sub">Camión detenido (velocidad ≈ 0) fuera del frente de pala y sin señal de descarga — es decir, parado en plena ruta de acarreo o retorno.</p>
            <div class="meter-block"><h4 class="block-title">Paradas no programadas por camión (detenido en ruta)</h4>${stopsRows}</div>
            <p class="kpi-note">Los segundos consecutivos de un mismo camión detenido (con huecos de hasta 5&nbsp;s) se cuentan como una sola parada.</p>
        </div>

        ${swingBlockHtml}

        ${zoneSummaryHtml}

        ${detailHtml}

        <div class="note-card">
            <b>Metodología.</b>
            <ul>
                <li><b>Proximidad:</b> en cada segundo del turno se mide la distancia 3D entre los centros de cada par de equipos (camión-camión y camión-pala). Hay un evento cuando esa distancia baja de <b>${DataProcessor.PROXIMITY_THRESHOLD_METERS}&nbsp;m</b> (dimensiones de un 930E más un margen de seguridad); los segundos consecutivos de un mismo par forman un solo evento, con su duración y distancia mínima. No se cuentan los pares camión-pala mientras el camión espera el primer pase, se estaciona o carga, porque en esas etapas debe estar junto a la pala.</li>
                <li><b>Zona del evento:</b> se toma del estado del camión en ese momento (carguío, cola en pala, maniobra, descarga, tránsito o detenido en ruta); entre dos camiones se usa el estado más específico.</li>
                <li><b>Velocidad:</b> cada registro se compara con su límite: vacío o cargado según el Llenado, y el de rampa cuando la pendiente del tramo (medida en los últimos 20&nbsp;m recorridos) es de al menos ${limits.rampGradePct}%. Cada segundo por encima del límite suma un segundo de exceso.</li>
                <li><b>Paradas no programadas:</b> camión detenido fuera del frente de pala y del punto de descarga, sin estar maniobrando.</li>
            </ul>
        </div>
    `;
};

Views.initSeguridadEvents = function () {
    animateReportWidgets(document.getElementById('view-container'));
};