// js/views/inicio.js
window.Views = window.Views || {};

Views.inicio = function () {
    return `
        <div class="card" style="background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%); border-color: var(--border-strong);">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 24px; justify-content: space-between;">
                <div style="max-width: 640px;">
                    <span style="display:inline-block; font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color: var(--accent); background: var(--accent-soft); padding: 4px 12px; border-radius: 20px; margin-bottom: 14px;">
                        ⛏️ Plataforma de Dispatch Minero
                    </span>
                    <h1 style="font-size: 2rem; margin: 0 0 12px;">MineOps Dispatch System</h1>
                    <p style="color: var(--ink-dim); line-height: 1.65; font-size: 0.95rem; margin: 0;">
                        Plataforma de monitoreo, simulación y análisis para flotas de carguío y acarreo en minería de
                        superficie. Lee telemetría cruda de camiones y palas (<b>.XLSX</b> / <b>.CSV</b>), la limpia y clasifica
                        automáticamente, y la convierte en animaciones 2D/3D y reportes operativos listos para revisar
                        o continuar en Power BI. Todo se ejecuta <b>en el navegador</b>, sin servidor ni base de datos.
                    </p>
                </div>
                <button class="btn-primary" id="btn-start-workflow" style="padding: 14px 28px; font-size: 13px; white-space: nowrap;">
                    🚀 Comenzar: Cargar Datos
                </button>
            </div>

            <div class="kpis" style="margin-top: 24px;">
                <div class="kpi"><div class="n">6</div><div class="l">Estados operativos detectados</div></div>
                <div class="kpi"><div class="n">2D <span style="color:var(--pala);">+</span> 3D</div><div class="l">Simulación de flota</div></div>
                <div class="kpi"><div class="n ok">100%</div><div class="l">Procesamiento local</div></div>
                <div class="kpi"><div class="n">.XLSX</div><div class="l">Lectura directa de telemetría</div></div>
            </div>
        </div>

        <div class="card">
            <h2>Flujo de Trabajo</h2>
            <p class="section-sub">Las pestañas del menú siguen este orden; las vistas de análisis se habilitan una vez procesados los datos.</p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; margin-top: 16px;">
                <div style="background: var(--surface-2); border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 8px; padding: 18px 20px;">
                    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px;">
                        <span style="font-family: 'Big Shoulders Display', sans-serif; font-size: 26px; font-weight: 800; color: var(--accent);">01</span>
                        <h3 style="font-size: 1rem; margin: 0;">Preparar los Datos</h3>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--ink-dim); line-height: 1.55;">
                        Cargue la telemetría de camiones y palas, defina los intervalos de guardia y filtros, y revise los
                        supuestos de capacidad, precios, límites de velocidad y material antes de generar los reportes.
                    </p>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">
                        <span class="badge">📂 Cargar y Filtrar</span>
                        <span class="badge">⚙️ Parámetros y Supuestos</span>
                    </div>
                </div>

                <div style="background: var(--surface-2); border: 1px solid var(--border); border-left: 4px solid var(--pala); border-radius: 8px; padding: 18px 20px;">
                    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px;">
                        <span style="font-family: 'Big Shoulders Display', sans-serif; font-size: 26px; font-weight: 800; color: var(--pala);">02</span>
                        <h3 style="font-size: 1rem; margin: 0;">Visualizar la Operación</h3>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--ink-dim); line-height: 1.55;">
                        Reproduzca el turno en el mapa 2D o recorra la operación en 3D, con la superficie de las vías
                        reconstruida desde el GPS, frentes de pala, puntos de descarga y cámara libre.
                    </p>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">
                        <span class="badge">🗺️ Simulación 2D</span>
                        <span class="badge">🧊 Recorrido 3D</span>
                    </div>
                </div>

                <div style="background: var(--surface-2); border: 1px solid var(--border); border-left: 4px solid var(--ok); border-radius: 8px; padding: 18px 20px;">
                    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px;">
                        <span style="font-family: 'Big Shoulders Display', sans-serif; font-size: 26px; font-weight: 800; color: var(--ok);">03</span>
                        <h3 style="font-size: 1rem; margin: 0;">Analizar KPIs</h3>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--ink-dim); line-height: 1.55;">
                        Cinco reportes operativos: resumen del turno, toneladas, pases y ritmo de carguío, tiempos de
                        ciclo por etapa, consumo de combustible y costos, y seguridad (proximidad, velocidad, paradas).
                    </p>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">
                        <span class="badge">📈 Resumen</span>
                        <span class="badge">📊 Productividad</span>
                        <span class="badge">⚡ Eficiencia</span>
                        <span class="badge">⛽ Costo y Energía</span>
                        <span class="badge">🛡️ Seguridad</span>
                    </div>
                </div>

                <div style="background: var(--surface-2); border: 1px solid var(--border); border-left: 4px solid var(--warn); border-radius: 8px; padding: 18px 20px;">
                    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px;">
                        <span style="font-family: 'Big Shoulders Display', sans-serif; font-size: 26px; font-weight: 800; color: var(--warn);">04</span>
                        <h3 style="font-size: 1rem; margin: 0;">Exportar y Continuar</h3>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--ink-dim); line-height: 1.55;">
                        Descargue en .xlsx los datos limpios y clasificados (camiones procesados, cargas completadas,
                        eventos de proximidad y KPIs agregados) para continuar el análisis en Power BI.
                    </p>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">
                        <span class="badge">🔗 Power BI</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Qué Calcula MineOps</h2>
            <p class="section-sub">Además de graficar la telemetría, el sistema la interpreta: identifica qué está haciendo cada equipo en cada segundo del turno.</p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 14px;">
                <div style="padding: 4px 2px;">
                    <h3 style="font-size: 0.92rem; color: var(--ink); display:flex; align-items:center; gap:8px;"><span>🔄</span> Ciclo completo por etapas</h3>
                    <p style="font-size: 0.83rem; color: var(--ink-dim); line-height: 1.5; margin-top: 6px;">
                        Separa espera en pala, estacionamiento en reversa, carga, acarreo, descarga y retorno usando el
                        Llenado, la tolva y la marcha del camión, y cuenta los pases de cuchara de cada carga.
                    </p>
                </div>
                <div style="padding: 4px 2px;">
                    <h3 style="font-size: 0.92rem; color: var(--ink); display:flex; align-items:center; gap:8px;"><span>⛽</span> Combustible real</h3>
                    <p style="font-size: 0.83rem; color: var(--ink-dim); line-height: 1.5; margin-top: 6px;">
                        El consumo se calcula sumando las caídas reales del indicador de nivel de tanque entre lecturas
                        consecutivas, en lugar de un promedio asumido, y detecta los reabastecimientos durante el turno.
                    </p>
                </div>
                <div style="padding: 4px 2px;">
                    <h3 style="font-size: 0.92rem; color: var(--ink); display:flex; align-items:center; gap:8px;"><span>🛡️</span> Proximidad 3D real</h3>
                    <p style="font-size: 0.83rem; color: var(--ink-dim); line-height: 1.5; margin-top: 6px;">
                        Mide la distancia 3D entre cada par de equipos en cada segundo del turno y descarta la cercanía
                        normal de la carga junto a la pala.
                    </p>
                </div>
                <div style="padding: 4px 2px;">
                    <h3 style="font-size: 0.92rem; color: var(--ink); display:flex; align-items:center; gap:8px;"><span>🧮</span> Corrección de datos</h3>
                    <p style="font-size: 0.83rem; color: var(--ink-dim); line-height: 1.5; margin-top: 6px;">
                        Reconstruye los ID de camión alterados por la notación científica de Excel, detecta palas y
                        puntos de descarga desde los datos, y admite turnos que cruzan medianoche.
                    </p>
                </div>
                <div style="padding: 4px 2px;">
                    <h3 style="font-size: 0.92rem; color: var(--ink); display:flex; align-items:center; gap:8px;"><span>🎛️</span> Supuestos editables</h3>
                    <p style="font-size: 0.83rem; color: var(--ink-dim); line-height: 1.5; margin-top: 6px;">
                        Capacidades, precios, límites de velocidad, material por pala y nombre de cada punto de descarga,
                        con valores por defecto referenciales (camiones 930E y palas CAT 7495).
                    </p>
                </div>
                <div style="padding: 4px 2px;">
                    <h3 style="font-size: 0.92rem; color: var(--ink); display:flex; align-items:center; gap:8px;"><span>🗺️</span> Dinámico por diseño</h3>
                    <p style="font-size: 0.83rem; color: var(--ink-dim); line-height: 1.5; margin-top: 6px;">
                        Detecta cuántos camiones, palas y puntos de descarga hay en los datos cargados, sin asumir una
                        flota fija, por lo que funciona con otros turnos u otras operaciones.
                    </p>
                </div>
            </div>
        </div>

        <div class="note-card">
            <b>Formatos de datos esperados.</b> Archivos <b>.xlsx</b> o <b>.csv</b> con al menos <code>Tiempo</code>,
            <code>Vehiculo</code>/<code>Cliente</code>, <code>X</code>, <code>Y</code>, <code>Z</code> y <code>Velocidad</code>
            por registro. En los camiones se usan además <code>Llenado</code>, <code>Tolva</code>, <code>Direccion</code>,
            <code>Combustible</code> y <code>Giro_Brusco</code> si están presentes; en las palas, <code>Rot_X/Y/Z</code> para la velocidad de giro.
            Si falta una columna, la carga continúa y las vistas que la necesitan indican qué no pudieron calcular.
            <br><br>
            <b>Privacidad.</b> Todo el procesamiento ocurre en el navegador con SheetJS y Plotly.js; ningún archivo se
            envía a un servidor externo.
        </div>
    `;
};

Views.initInicioEvents = function () {
    const btnStart = document.getElementById('btn-start-workflow');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            const cargarBtn = document.querySelector('.nav-btn[data-view="cargar"]');
            if (cargarBtn) cargarBtn.click();
        });
    }
};