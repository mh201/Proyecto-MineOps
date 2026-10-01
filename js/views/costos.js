// js/views/costos.js
window.Views = window.Views || {};

Views.costos = function () {
    const trucks = AppState.processedTrucks || [];
    const shovelsRaw = AppState.processedShovels || AppState.shovelData || [];

    if (trucks.length === 0) {
        return `
            <div class="card">
                <h2>Costos y Consumo Energético</h2>
                <p style="color: var(--ink-dim); margin-top: 10px; font-size: 0.9rem;">
                    No hay datos procesados todavía. Cargue y procese la telemetría en
                    <b>"Cargar y Filtrar"</b> para ver el costo de combustible y energía del turno.
                </p>
            </div>
        `;
    }

    const productivity = DataProcessor.computeProductivityStats(trucks, shovelsRaw, AppState.params);
    const stats = DataProcessor.computeCostStats(trucks, shovelsRaw, AppState.params, productivity.byTruck);
    const { byTruck, byShovel, totalFuelGal, totalFuelCost, totalEnergyCost, totalCost, totalRefuels, shiftHours } = stats;
    const p = AppState.params;

    const fmtInt = n => Math.round(n).toLocaleString('es-PE');
    const fmt1 = n => (n === null || n === undefined) ? '—' : n.toFixed(1);
    const fmtSoles = n => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const costPerTon = productivity.totalTons > 0 ? (totalCost / productivity.totalTons) : null;

    // ---- KPIs ----
    const kpisHtml = `
        <div class="kpis">
          <div class="kpi"><div class="n" data-count="${Math.round(totalCost)}">0</div><div class="l">Costo total del turno (S/)</div></div>
          <div class="kpi"><div class="n" data-count="${Math.round(totalFuelCost)}">0</div><div class="l">Costo de combustible (S/)</div></div>
          <div class="kpi"><div class="n" data-count="${Math.round(totalEnergyCost)}">0</div><div class="l">Costo de energía, palas -- estimado (S/)</div></div>
          <div class="kpi"><div class="n" data-count="${Math.round(totalFuelGal)}">0</div><div class="l">Combustible consumido (gal)</div></div>
          <div class="kpi"><div class="n" data-count="${costPerTon !== null ? costPerTon.toFixed(2) : 0}" data-decimals="2">0</div><div class="l">Costo por tonelada movida (S//t)</div></div>
        </div>
    `;

    // ---- Barras verticales: combustible consumido por camión ----
    const byFuelDesc = [...byTruck].sort((a, b) => b.consumedGal - a.consumedGal);
    const maxGal = Math.max(1, ...byFuelDesc.map(t => t.consumedGal));
    const fuelBars = byFuelDesc.map(t => `
        <div class="vbar-col">
          <div class="vbar-value">${fmt1(t.consumedGal)} gal</div>
          <div class="vbar-track"><div class="vbar vbar-fuel" data-h="${(t.consumedGal / maxGal * 100).toFixed(1)}"></div></div>
          <div class="vbar-label" title="${t.id}">${t.id}</div>
        </div>
    `).join('');

    // ---- Barras verticales: costo de energía estimado por pala ----
    const maxShovelCost = Math.max(1, ...byShovel.map(s => s.cost));
    const energyBars = byShovel.map(s => `
        <div class="vbar-col">
          <div class="vbar-value">${fmtSoles(s.cost)}</div>
          <div class="vbar-track"><div class="vbar vbar-energy" data-h="${(s.cost / maxShovelCost * 100).toFixed(1)}"></div></div>
          <div class="vbar-label" title="${s.id}">${s.id}</div>
        </div>
    `).join('');

    // ---- Tabla de costos por camión ----
    const truckTableRows = byTruck.map(t => `
        <tr>
          <td>${t.id}</td>
          <td class="mono">${fmt1(t.consumedGal)} gal</td>
          <td class="mono">${t.refuels}</td>
          <td class="mono">${fmtSoles(t.cost)}</td>
          <td class="mono">${fmtInt(t.tons)} t</td>
          <td class="mono">${t.costPerTon !== null ? 'S/ ' + t.costPerTon.toFixed(2) : '—'}</td>
        </tr>
    `).join('');

    // ---- Tabla de costos por pala ----
    const shovelTableRows = byShovel.map(s => `
        <tr>
          <td>${s.id}</td>
          <td class="mono">${s.powerKw} kW</td>
          <td class="mono">${s.hours !== null ? s.hours.toFixed(1) + ' h' : '—'}</td>
          <td class="mono">${fmtInt(s.kwh)} kWh</td>
          <td class="mono">${fmtSoles(s.cost)}</td>
        </tr>
    `).join('');

    return `
        <div class="card">
            <h2>Resumen de Costo y Energía del Turno</h2>
            <p class="section-sub">Combustible calculado a partir de la caída real del nivel de tanque; energía de palas estimada (no medida).</p>
            ${kpisHtml}
        </div>

        <div class="card">
            <h2>Combustible por Camión</h2>
            <p class="section-sub">Consumo real, calculado sumando solo las caídas del indicador de nivel de tanque entre lecturas consecutivas (las subidas se cuentan como reabastecimientos, no se restan del consumo). ${totalRefuels > 0 ? `Se detectaron <b>${totalRefuels}</b> reabastecimientos en el turno.` : 'No se detectaron reabastecimientos en el turno.'}</p>
            <div class="vbar-chart">${fuelBars}</div>
            <div class="table-wrap" style="margin-top: 16px;"><table class="tabla">
                <thead><tr><th>Camión</th><th>Combustible consumido</th><th>Reabastecimientos</th><th>Costo combustible</th><th>Toneladas movidas</th><th>Costo / tonelada</th></tr></thead>
                <tbody>${truckTableRows}</tbody>
            </table></div>
        </div>

        <div class="card">
            <h2>Energía por Pala <span class="badge badge-danger" style="margin-left: 8px;">ESTIMADO</span></h2>
            <p class="section-sub">La telemetría cruda no trae ningún sensor de consumo eléctrico de pala -- se estima como potencia asumida × horas de turno${shiftHours ? ` (${shiftHours.toFixed(1)} h)` : ''}.</p>
            <div class="vbar-chart">${energyBars}</div>
            <div class="table-wrap" style="margin-top: 16px;"><table class="tabla">
                <thead><tr><th>Pala</th><th>Potencia asumida</th><th>Horas de turno</th><th>Energía estimada</th><th>Costo estimado</th></tr></thead>
                <tbody>${shovelTableRows}</tbody>
            </table></div>
        </div>

        <div class="note-card">
            <b>Metodología.</b>
            <ul>
                <li><b>Combustible:</b> la columna "Combustible" es el nivel del tanque (0-100&nbsp;%), no un contador de consumo. Se suman las caídas de nivel entre lecturas consecutivas de cada camión; las subidas corresponden a reabastecimientos (columna "Abasteciendo") y no se descuentan. El porcentaje consumido se convierte a galones con la capacidad de tanque (<b>${p.fuelTankCapacityGal}&nbsp;gal</b>) y a soles con el precio del combustible (<b>S/&nbsp;${p.fuelPricePerGal}</b> por galón).</li>
                <li><b>Energía de palas:</b> la telemetría no incluye consumo eléctrico. Se estima como potencia promedio (<b>${p.shovelPowerKw}&nbsp;kW</b>) × horas del turno × precio de la energía (<b>S/&nbsp;${p.energyPricePerKwh}</b> por kWh). Es una aproximación que supone potencia constante; si conoce el consumo real del equipo, ajuste la potencia en "Parámetros y Supuestos".</li>
                <li><b>Costo por tonelada:</b> costo total del turno (combustible + energía) dividido entre las toneladas movidas que calcula Productividad.</li>
            </ul>
        </div>
    `;
};

Views.initCostosEvents = function () {
    animateReportWidgets(document.getElementById('view-container'));
};