// js/views/parametros.js
window.Views = window.Views || {};

// Campos numéricos editables: id del input, clave en AppState.params, etiqueta,
// paso, y si admite 0 (los precios sí; capacidades y límites, no).
const PARAM_FIELDS = {
    capacidades: [
        { id: 'param-truck-capacity', key: 'truckCapacityTons', label: 'Capacidad de Tolva por Camión (t)', step: 1 },
        { id: 'param-bucket-capacity', key: 'bucketCapacityTons', label: 'Capacidad de Cuchara por Pala (t)', step: 1 },
        { id: 'param-fuel-price', key: 'fuelPricePerGal', label: 'Precio de Combustible (S/ por galón)', step: 0.1, allowZero: true },
        { id: 'param-energy-price', key: 'energyPricePerKwh', label: 'Precio de Energía Eléctrica (S/ por kWh)', step: 0.01, allowZero: true },
        { id: 'param-tank-capacity', key: 'fuelTankCapacityGal', label: 'Capacidad de Tanque de Combustible (gal)', step: 10 },
        { id: 'param-shovel-power', key: 'shovelPowerKw', label: 'Potencia Promedio por Pala (kW)', step: 10 }
    ],
    velocidad: [
        { id: 'param-speed-empty', key: 'speedLimitEmptyKmh', label: 'Límite con Camión Vacío (km/h)', step: 1 },
        { id: 'param-speed-loaded', key: 'speedLimitLoadedKmh', label: 'Límite con Camión Cargado (km/h)', step: 1 },
        { id: 'param-speed-ramp', key: 'speedLimitRampKmh', label: 'Límite en Rampa (km/h)', step: 1 },
        { id: 'param-ramp-grade', key: 'rampGradePct', label: 'Pendiente que Define una Rampa (%)', step: 0.5 }
    ]
};

function paramFieldHtml(f, p) {
    return `
        <div class="filter-group">
            <label>${f.label}</label>
            <input type="number" id="${f.id}" min="${f.allowZero ? 0 : 0.01}" step="${f.step}" value="${p[f.key]}">
        </div>`;
}

// Puntos de descarga detectados en los datos procesados (mismos que dibuja el mapa).
function detectedDumps() {
    const trucks = AppState.processedTrucks || [];
    return (trucks.length && window.MineZones) ? MineZones.getDumpClusters(trucks) : [];
}

Views.parametros = function () {
    const shovelsRaw = AppState.processedShovels || AppState.shovelData || [];
    const trucksRaw = AppState.processedTrucks || AppState.truckData || [];

    if (shovelsRaw.length === 0 && trucksRaw.length === 0) {
        return `
            <div class="card">
                <h2>Parámetros y Supuestos del Turno</h2>
                <p style="color: var(--ink-dim); margin-top: 10px; font-size: 0.9rem;">
                    No hay datos procesados todavía. Cargue y procese la telemetría en
                    <b>"Cargar y Filtrar"</b> para configurar los supuestos de este turno
                    (se necesita conocer las palas y los puntos de descarga presentes en los datos).
                </p>
            </div>
        `;
    }

    const shovelZones = DataProcessor.getShovelZones(shovelsRaw);
    const dumps = detectedDumps();
    const p = AppState.params;
    const materials = p.materialByShovel || {};
    const dumpNames = p.dumpNames || {};

    const materialRows = shovelZones.map(z => `
        <div class="filter-group">
            <label>${z.id}</label>
            <select class="param-material-select" data-shovel-id="${z.id}">
                ${DataProcessor.MATERIAL_OPTIONS.map(opt => `<option value="${opt}" ${(materials[z.id] || p.defaultMaterial) === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
        </div>
    `).join('');

    const dumpRows = dumps.map(d => `
        <div class="filter-group">
            <label>${d.id} <span style="color: var(--ink-faint); text-transform: none;">(${Math.round(d.x)}, ${Math.round(d.y)})</span></label>
            <input type="text" class="param-dump-name" data-dump-id="${d.id}" maxlength="40" placeholder="${d.id}" value="${(dumpNames[d.id] || '').replace(/"/g, '&quot;')}">
        </div>
    `).join('');

    const L = DataProcessor.getSpeedLimits(p);
    const materialSummary = shovelZones.map(z => `${z.id}: <b>${materials[z.id] || p.defaultMaterial}</b>`).join(' &nbsp;·&nbsp; ');
    const dumpSummary = dumps.map(d => `${d.id}: <b>${DataProcessor.dumpDisplayName(d.id)}</b>`).join(' &nbsp;·&nbsp; ');

    return `
        <div class="card">
            <h2>Parámetros y Supuestos del Turno</h2>
            <p style="color: var(--ink-dim); font-size: 0.9rem; margin-top: 6px; margin-bottom: 4px;">
                Algunos cálculos necesitan datos que no vienen en la telemetría: capacidades de los equipos, precios,
                límites de velocidad de la operación, el material que extrae cada pala y el nombre de cada punto de
                descarga. Los valores por defecto son referenciales para una flota de camiones Komatsu 930E con palas
                CAT 7495; ajústelos a su operación antes de revisar los reportes. Los cambios se aplican a todas las vistas.
            </p>
        </div>

        <div class="card">
            <h2>Capacidades y Precios</h2>
            <div class="filter-grid">${PARAM_FIELDS.capacidades.map(f => paramFieldHtml(f, p)).join('')}</div>
            <p class="kpi-note">
                <b>Capacidad de tolva:</b> toneladas por viaje en Productividad, Resumen y Costos.
                <b>Capacidad de cuchara:</b> pases teóricos por carga, que Eficiencia compara con los pases medidos
                (si difieren mucho, la capacidad configurada probablemente no corresponde a la pala real).
                <b>Precios, tanque y potencia de pala:</b> cálculo de costos en Costo y Energía.
            </p>
        </div>

        <div class="card">
            <h2>Límites de Velocidad</h2>
            <div class="filter-grid">${PARAM_FIELDS.velocidad.map(f => paramFieldHtml(f, p)).join('')}</div>
            <p class="kpi-note">
                Cada registro se compara con el límite que le corresponde: <b>vacío</b> o <b>cargado</b> según el Llenado
                del camión y, si el tramo tiene una pendiente igual o mayor a la indicada, el límite de <b>rampa</b> cuando
                es más estricto. Use los valores del procedimiento de tránsito (PETS) de su operación; por defecto los tres
                límites son iguales.
            </p>
        </div>

        <div class="card">
            <h2>Material por Pala <span style="color: var(--ink-dim); font-weight: 400; font-size: 0.8rem;">(${shovelZones.length} detectada${shovelZones.length === 1 ? '' : 's'} en los datos)</span></h2>
            <p style="color: var(--ink-dim); font-size: 0.85rem; margin-top: 4px; margin-bottom: 10px;">
                Indique qué material extrae cada pala. Se muestra en Productividad y se incluye en la exportación.
            </p>
            <div class="filter-grid">${materialRows}</div>
        </div>

        <div class="card">
            <h2>Puntos de Descarga <span style="color: var(--ink-dim); font-weight: 400; font-size: 0.8rem;">(${dumps.length} detectado${dumps.length === 1 ? '' : 's'} en los datos)</span></h2>
            <p style="color: var(--ink-dim); font-size: 0.85rem; margin-top: 4px; margin-bottom: 10px;">
                Los puntos de descarga se detectan por los levantes de tolva; los datos no permiten saber si cada uno es una
                chancadora, un botadero o un stock. Asígneles un nombre (por ejemplo, "Chancadora primaria") para que
                aparezca en los mapas y rutas. Si se deja vacío, se usa el nombre genérico.
            </p>
            ${dumps.length ? `<div class="filter-grid">${dumpRows}</div>` : '<p class="section-sub">No se detectaron descargas en los datos procesados.</p>'}
        </div>

        <div class="card" style="text-align: center;">
            <button class="btn-primary" id="btn-save-params" style="padding: 12px 30px;">
                💾 Guardar Parámetros
            </button>
            <button id="btn-assume-defaults" style="background: var(--surface-2); border: 1px solid var(--accent); color: var(--accent); padding: 12px 24px; border-radius: 4px; cursor: pointer; font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 12px; margin-left: 12px;">
                ⚡ Restablecer Valores por Defecto
            </button>
        </div>

        <div class="note-card">
            <b>Valores en uso:</b>
            <ul>
                <li>Capacidad de tolva: <b>${p.truckCapacityTons} t</b> &nbsp;·&nbsp; Capacidad de cuchara: <b>${p.bucketCapacityTons} t</b></li>
                <li>Combustible: <b>S/ ${p.fuelPricePerGal}</b> por galón &nbsp;·&nbsp; Tanque: <b>${p.fuelTankCapacityGal} gal</b></li>
                <li>Energía eléctrica: <b>S/ ${p.energyPricePerKwh}</b> por kWh &nbsp;·&nbsp; Potencia por pala: <b>${p.shovelPowerKw} kW</b></li>
                <li>Velocidad: vacío <b>${L.empty} km/h</b> &nbsp;·&nbsp; cargado <b>${L.loaded} km/h</b> &nbsp;·&nbsp; rampa (≥ ${L.rampGradePct}%) <b>${L.ramp} km/h</b></li>
                <li>Material por pala: ${materialSummary || '—'}</li>
                <li>Puntos de descarga: ${dumpSummary || '—'}</li>
            </ul>
        </div>
    `;
};

Views.initParametrosEvents = function () {
    const btnSave = document.getElementById('btn-save-params');
    const btnDefaults = document.getElementById('btn-assume-defaults');
    const D = DataProcessor.DEFAULT_PARAMS;

    if (btnSave) {
        btnSave.addEventListener('click', () => {
            PARAM_FIELDS.capacidades.concat(PARAM_FIELDS.velocidad).forEach(f => {
                const el = document.getElementById(f.id);
                const v = el ? parseFloat(el.value) : NaN;
                const valid = !isNaN(v) && (f.allowZero ? v >= 0 : v > 0);
                AppState.params[f.key] = valid ? v : D[f.key];
            });

            const materials = {};
            document.querySelectorAll('.param-material-select').forEach(sel => { materials[sel.dataset.shovelId] = sel.value; });
            AppState.params.materialByShovel = materials;

            const names = {};
            document.querySelectorAll('.param-dump-name').forEach(inp => {
                const v = inp.value.trim();
                if (v) names[inp.dataset.dumpId] = v;
            });
            AppState.params.dumpNames = names;

            showToast("Parámetros guardados. Se aplican en todas las vistas.", "success");
            loadView('parametros');
        });
    }

    if (btnDefaults) {
        btnDefaults.addEventListener('click', () => {
            PARAM_FIELDS.capacidades.concat(PARAM_FIELDS.velocidad).forEach(f => { AppState.params[f.key] = D[f.key]; });
            const materials = {};
            DataProcessor.getShovelZones(AppState.processedShovels || AppState.shovelData || [])
                .forEach(z => { materials[z.id] = D.defaultMaterial; });
            AppState.params.materialByShovel = materials;
            AppState.params.dumpNames = {};

            showToast(`Valores por defecto restablecidos: ${D.truckCapacityTons} t por camión, ${D.bucketCapacityTons} t por cuchara, límites de ${D.speedLimitEmptyKmh} km/h, material "${D.defaultMaterial}" y nombres genéricos de descarga.`, "info", 6000);
            loadView('parametros');
        });
    }
};