// js/views/eficiencia.js
window.Views = window.Views || {};

Views.eficiencia = function () {
    const trucks = AppState.processedTrucks || [];
    const shovelsRaw = AppState.processedShovels || AppState.shovelData || [];

    if (trucks.length === 0) {
        return `
            <div class="card">
                <h2>Eficiencia y Tiempos de Ciclo</h2>
                <p style="color: var(--ink-dim); margin-top: 10px; font-size: 0.9rem;">
                    No hay datos procesados todavía. Cargue y procese la telemetría en
                    <b>"Cargar y Filtrar"</b> para ver el desglose de ciclo, tiempos muertos
                    en cola, y el impacto de la pendiente en la velocidad.
                </p>
            </div>
        `;
    }

    const stats = DataProcessor.computeEfficiencyStats(trucks, AppState.params);
    const { byTruck, fleetAvgCycleMinutes, fleetQueueMinutes, fleetTransitPct, theoreticalPasses, observedPasses, fleetSpottingMinutes, gradeProfile } = stats;
    const p = AppState.params;

    const fmt1 = n => (n === null || n === undefined) ? '—' : n.toFixed(1);
    const fmtMin = n => (n === null || n === undefined) ? '—' : `${n.toFixed(1)} min`;

    const gradeSubida = gradeProfile.find(g => g.key === 'subida');
    const slopeImpactLabel = (gradeSubida && gradeSubida.pctSlowerThanFlat !== null)
        ? `${gradeSubida.pctSlowerThanFlat.toFixed(0)}%`
        : '—';

    // ---- KPIs ----
    const kpisHtml = `
        <div class="kpis">
          <div class="kpi"><div class="n" data-count="${fleetAvgCycleMinutes !== null ? fleetAvgCycleMinutes.toFixed(1) : 0}" data-decimals="1" data-suffix="&nbsp;min">0 min</div><div class="l">Duración promedio de ciclo completo</div></div>
          <div class="kpi"><div class="n" data-count="${fleetQueueMinutes.toFixed(1)}" data-decimals="1" data-suffix="&nbsp;min">0 min</div><div class="l">Tiempo muerto en cola (turno)</div></div>
          <div class="kpi"><div class="n" data-count="${fleetTransitPct.toFixed(1)}" data-decimals="1" data-suffix="%">0%</div><div class="l">Tiempo en tránsito (acarreo + retorno)</div></div>
          <div class="kpi"><div class="n ${gradeSubida && gradeSubida.pctSlowerThanFlat > 0 ? 'danger' : ''}">${slopeImpactLabel}</div><div class="l">Más lento en subida vs. tramo plano</div></div>
          <div class="kpi"><div class="n" data-count="${observedPasses !== null ? observedPasses.toFixed(1) : 0}" data-decimals="1">0</div><div class="l">Pases de balde por carga (medido)</div></div>
          <div class="kpi"><div class="n" data-count="${(fleetSpottingMinutes || 0).toFixed(1)}" data-decimals="1" data-suffix="&nbsp;min">0 min</div><div class="l">Estacionando en reversa (turno)</div></div>
        </div>
    `;

    // ---- Leyenda de etapas de ciclo ----
    const legendHtml = DataProcessor.CYCLE_STAGE_ORDER.map(s => {
        const meta = DataProcessor.CYCLE_STAGE_META[s];
        return `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 11px; height: 11px; border-radius: 2px; background: ${meta.color};"></span>
          <span style="color: var(--ink-dim); font-size: 11px; font-family: 'JetBrains Mono', monospace;">${meta.label}</span>
        </div>
        `;
    }).join('');

    // ---- Barras apiladas: distribución del ciclo por camión ----
    const stackedRows = byTruck.map(t => {
        const segments = DataProcessor.CYCLE_STAGE_ORDER.map(s => {
            const meta = DataProcessor.CYCLE_STAGE_META[s];
            const pct = t.pct[s] || 0;
            return `<div class="meter-fill" data-w="${pct.toFixed(1)}" style="background: ${meta.color}" title="${meta.label}: ${pct.toFixed(1)}%"></div>`;
        }).join('');
        return `
        <div class="meter-row">
          <div class="lbl">${t.id}</div>
          <div class="meter-track">${segments}</div>
          <div class="meter-val">${t.cycles} viajes</div>
        </div>
        `;
    }).join('');

    // ---- Tabla de tiempos de ciclo por camión ----
    const cycleTableRows = byTruck.map(t => `
        <tr>
          <td>${t.id}</td>
          <td class="mono">${t.cycles}</td>
          <td class="mono">${fmtMin(t.avgCycleMinutes)}</td>
          <td class="mono">${fmtMin(t.minutes.ESPERA_EN_PALA)}</td>
          <td class="mono">${fmtMin(t.minutes.ESTACIONANDO)}</td>
        </tr>
    `).join('');

    // ---- Barras verticales: impacto de la pendiente ----
    const maxSpeed = Math.max(1, ...gradeProfile.map(g => g.avgSpeed || 0));
    const gradeColors = { bajada: '#6ee7b7', plano: '#7dd3fc', subida: '#ffd23f' };
    const gradeBars = gradeProfile.map(g => `
        <div class="vbar-col">
          <div class="vbar-value">${g.avgSpeed !== null ? fmt1(g.avgSpeed) + ' km/h' : 'Sin datos'}</div>
          <div class="vbar-track"><div class="vbar" data-h="${g.avgSpeed !== null ? (g.avgSpeed / maxSpeed * 100).toFixed(1) : 0}" style="background: ${gradeColors[g.key]}"></div></div>
          <div class="vbar-label">${g.label}</div>
        </div>
    `).join('');

    return `
        <div class="card">
            <h2>Resumen de Eficiencia y Ciclos</h2>
            <p class="section-sub">Desglose del tiempo de ciclo por etapa, duración de ciclo completo, y cómo la pendiente afecta la velocidad de acarreo.</p>
            ${kpisHtml}
        </div>

        <div class="card">
            <h2>Distribución del Ciclo por Camión</h2>
            <p class="section-sub">% del tiempo de telemetría de cada camión en cada etapa. "Acarreo" y "Retorno" se distinguen por el Llenado del camión (ver metodología).</p>
            <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 14px;">${legendHtml}</div>
            <div class="meter-block">${stackedRows}</div>
        </div>

        <div class="card">
            <h2>Tiempos de Ciclo por Camión</h2>
            <div class="table-wrap"><table class="tabla">
                <thead><tr><th>Camión</th><th>Viajes</th><th>Ciclo promedio</th><th>Tiempo en cola</th><th>Estacionando</th></tr></thead>
                <tbody>${cycleTableRows}</tbody>
            </table></div>
            <p class="kpi-note">"Pases de balde por carga" se <b>mide</b> contando las subidas del Llenado durante cada carga (ver Productividad). Como referencia, la razón de capacidades de Parámetros (tolva ${p.truckCapacityTons} t ÷ cuchara ${p.bucketCapacityTons} t) da ${theoreticalPasses !== null ? theoreticalPasses.toFixed(1) : '—'} pases${theoreticalPasses !== null && observedPasses !== null && Math.abs(theoreticalPasses - observedPasses) >= 0.5 ? ' -- si difiere mucho de lo medido, revise la capacidad de cuchara en Parámetros' : ''}.</p>
        </div>

        <div class="card">
            <h2>Impacto de la Pendiente en la Velocidad</h2>
            <p class="section-sub">Velocidad promedio durante tránsito real (acarreo + retorno), agrupada por pendiente local del tramo recorrido.</p>
            <div class="vbar-chart">${gradeBars}</div>
        </div>

        <div class="note-card">
            <b>Metodología.</b>
            <ul>
                <li><b>Acarreo / Retorno:</b> el tránsito con Llenado mayor a 10&nbsp;% es Acarreo (cargado) y con Llenado de 10&nbsp;% o menos es Retorno (vacío). Solo si falta el Llenado se usa la secuencia (lo que sigue a una carga es Acarreo; a una descarga, Retorno).</li>
                <li><b>Estacionando:</b> tiempo moviéndose en reversa (Direccion = R) cerca de una pala o de un punto de descarga, para cuadrarse antes de cargar o descargar; incluye pausas de hasta 8&nbsp;s dentro de la misma maniobra.</li>
                <li><b>Ciclo completo:</b> tiempo entre el inicio de una carga y el inicio de la siguiente del mismo camión (las mismas cargas que cuenta Productividad).</li>
                <li><b>Tiempo en cola:</b> minutos en estado "Espera en Pala": en el frente antes del primer pase de la carga, sin contar la maniobra de estacionamiento.</li>
                <li><b>Pendiente:</b> para cada par de lecturas consecutivas en Acarreo o Retorno se calcula la variación de elevación sobre la distancia horizontal recorrida, y las muestras se agrupan en tres rangos (bajada &lt; -4&nbsp;%, plano, subida &gt; 4&nbsp;%). El "% más lento" compara la velocidad promedio de cada rango con la del tramo plano.</li>
                <li><b>Pases de balde:</b> cada subida del Llenado durante la carga es un pase; si el sensor parte un mismo pase en dos lecturas (≤&nbsp;5&nbsp;s), se cuenta una vez.</li>
            </ul>
        </div>
    `;
};

Views.initEficienciaEvents = function () {
    animateReportWidgets(document.getElementById('view-container'));
};