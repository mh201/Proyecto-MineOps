// js/views/simulacion.js
window.Views = window.Views || {};

Views.simulacion = function () {
    return `
        <!-- Encabezado de la Vista 2D (Fuera del Canvas) -->
        <div class="sim-header" style="background: rgba(11, 37, 60, 0.7); border: 1px solid rgba(234, 244, 251, 0.1); border-radius: 8px; padding: 12px 18px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="margin: 0; color: #eaf4fb; font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span style="color: #38bdf8;">📡</span> Animación 2D del Recorrido y Operaciones
            </h3>
            <span style="color: #5f88a8; font-size: 11px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.5px;">Arrastrar: mover · Rueda: zoom · Doble clic: vista completa</span>
        </div>

        <!-- Ventana / Contenedor Principal de la Animación -->
        <div class="simulation-container" style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
            <!-- HUD de Controles de la Animación -->
            <div class="sim-hud">
                <div class="hud-group">
                    <button id="sim-play-btn" class="hud-btn primary">▶</button>
                    <button id="sim-pause-btn" class="hud-btn">⏸</button>
                    <div class="time-display mono" id="sim-clock">00:00:00</div>
                </div>
                <div class="hud-group fill">
                    <input type="range" id="sim-timeline" min="0" max="100" value="0" class="sim-slider">
                </div>
                <div class="hud-group">
                    <label class="hud-label mono">VELOCIDAD:</label>
                    <select id="sim-speed-select" class="hud-select" title="Segundos de turno por segundo real">
                        <option value="1">1x</option>
                        <option value="5">5x</option>
                        <option value="10" selected>10x</option>
                        <option value="30">30x</option>
                        <option value="60">60x</option>
                        <option value="120">120x</option>
                    </select>
                </div>
                <div class="hud-group">
                    <label class="checkbox-group" style="font-size: 11px; margin: 0;">
                        <input type="checkbox" id="sim-toggle-labels" checked>
                        <span style="color: #9cc3dd;">Etiquetas</span>
                    </label>
                </div>
            </div>

            <!-- Canvas de Plotly (Área de Animación) -->
            <div id="plotly-2d" class="plotly-canvas-container" style="min-height: 520px; width: 100%;"></div>
        </div>

        <!-- Leyenda Explicativa (Fuera del Canvas y de la Animación) -->
        <div class="sim-legend-bar" style="background: rgba(11, 37, 60, 0.85); border: 1px solid rgba(234, 244, 251, 0.12); border-radius: 8px; padding: 12px 18px; margin-top: 12px; display: flex; flex-wrap: wrap; gap: 18px; align-items: center; justify-content: space-around;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: #6ee7b7; border-radius: 2px;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Pala:</b> punto de carga</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: #7dd3fc; border-radius: 50%;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>En tránsito</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: #ffd23f; transform: rotate(45deg);"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Cargando</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: #fb923c; clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Espera en pala</b> (cola / maniobra)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 11px solid #e879f9;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Estacionando</b> (reversa en pala/descarga)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 12px solid #ef4444;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Descargando</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 11px; height: 11px; background: #94a3b8;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Detenido en ruta</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 16px; height: 12px; border: 1.5px dashed #ffd23f; background: rgba(255, 210, 63, 0.15);"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Frente de carga</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 16px; height: 12px; border: 1.5px solid #6ee7b7; background: rgba(110, 231, 183, 0.15);"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Punto de descarga</b> (color según etiqueta)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 18px; height: 0; border-top: 2px dotted #a78bfa;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Ruta habitual</b> pala → chancadora</span>
            </div>
        </div>
    `;
};

Views.initSimulacionEvents = function () {
    const TARGET = 'plotly-2d';
    // Colores para diferenciar cada ruta pala->chancadora detectada. Con más
    // rutas de las que hay colores se reciclan (poco probable en la práctica).
    const ROUTE_COLOR_PALETTE = ['#a78bfa', '#f472b6', '#fb923c', '#facc15', '#34d399', '#60a5fa'];

    const trucks = AppState.processedTrucks || [];
    const shovels = AppState.processedShovels || [];

    if (trucks.length === 0 && shovels.length === 0) {
        if (typeof showToast === 'function') showToast("No hay datos cargados para simular.", "warning");
        return;
    }

    // ---------------------------------------------------------------------
    // Cálculos pesados: una sola vez por dataset (ver js/playback.js). Al
    // volver a esta pestaña se reutilizan tal cual.
    // ---------------------------------------------------------------------
    const tracks = Playback.memo('tracks', () => Playback.buildTracks(trucks, shovels));
    if (tracks.tEnd <= tracks.tStart && tracks.trucks.length === 0) {
        if (typeof showToast === 'function') showToast("No hay registros de tiempo válidos.", "warning");
        return;
    }
    const bounds = Playback.memo('bounds', () => Playback.trackBounds(tracks));
    // La clave incluye los nombres de descarga de Parámetros: si se renombran,
    // las etiquetas del mapa se regeneran.
    const dumpNamesKey = JSON.stringify((AppState.params && AppState.params.dumpNames) || {});
    const activeZones = Playback.memo('zones2d|' + dumpNamesKey, () => MineZones.generateZonesFromData(trucks, shovels));
    const routeTraces = Playback.memo('routeTraces2d|' + dumpNamesKey, () => {
        const routes = (window.TrajectoryEngine && TrajectoryEngine.computeHaulRoutes)
            ? TrajectoryEngine.computeHaulRoutes(trucks, activeZones.shovelZones, activeZones.dumpClusters)
            : [];
        return routes.map((r, idx) => ({
            uid: Playback.safeUid('route-' + r.id),
            name: `Ruta: ${DataProcessor.dumpDisplayName(r.originId)} → ${DataProcessor.dumpDisplayName(r.destId)}`,
            type: 'scatter',
            mode: 'lines',
            x: r.points.map(p => p.x),
            y: r.points.map(p => p.y),
            line: { color: ROUTE_COLOR_PALETTE[idx % ROUTE_COLOR_PALETTE.length], width: 2, dash: 'dot' },
            opacity: 0.6,
            hoverinfo: 'name',
            legendrank: 2000 // en la leyenda, después de palas y camiones
        }));
    });

    // Estado guardado de esta vista (instante, velocidad, zoom, etc.).
    const session = Playback.session('sim2d', {
        time: tracks.tStart, speed: 10, playing: false, view: null, showLabels: true
    });

    const labelsToggle = document.getElementById('sim-toggle-labels');
    if (labelsToggle) labelsToggle.checked = session.showLabels;

    let disposed = false;

    function drawFrame(t) {
        if (disposed || !document.getElementById(TARGET)) return;
        hud.updateHud(t);
        const frame = Playback.sampleFrame(tracks, t);
        return Map2DPlotly.render(TARGET, frame, bounds, activeZones, routeTraces, {
            showLabels: labelsToggle ? labelsToggle.checked : true,
            view: camera.get()
        });
    }

    const player = Playback.createPlayer({
        tStart: tracks.tStart,
        tEnd: tracks.tEnd,
        // Tramos = intervalos de guardia elegidos al cargar; entre ellos se salta.
        segments: Playback.memo('segments', () => Playback.buildSegments(tracks)),
        initialTime: session.time,
        speed: session.speed,
        maxFps: 30,
        onFrame: drawFrame,
        onStateChange: p => hud.setPlaying(p)
    });

    const hud = Playback.bindHud(player, {
        play: 'sim-play-btn', pause: 'sim-pause-btn', timeline: 'sim-timeline',
        clock: 'sim-clock', speed: 'sim-speed-select'
    });

    if (labelsToggle) labelsToggle.addEventListener('change', () => player.render());

    // Cámara propia: arrastrar/rueda cambian la vista sin detener la animación
    // (ver createViewController en map2D.js). En pausa se redibuja a demanda;
    // corriendo, el siguiente cuadro ya toma la vista nueva.
    let pendingRender = false;
    const camera = Map2DPlotly.createViewController(
        TARGET, Map2DPlotly.defaultView(bounds), session.view,
        () => {
            if (player.isPlaying() || pendingRender) return;
            pendingRender = true;
            requestAnimationFrame(() => { pendingRender = false; player.render(); });
        }
    );

    // Primer cuadro (con el zoom/paneo que el usuario tenía, si volvió).
    Promise.resolve(drawFrame(player.getTime())).then(() => camera.bindPlotlyEvents());
    hud.setPlaying(false);
    if (session.playing) player.play();

    // Al salir de la vista: guardar el estado y liberar el gráfico. Al volver
    // se retoma desde el mismo instante, con el mismo zoom y velocidad, y si
    // estaba corriendo sigue corriendo.
    if (window.ViewLifecycle) {
        ViewLifecycle.register(() => {
            session.time = player.getTime();
            session.speed = player.getSpeed();
            session.playing = player.isPlaying();
            session.view = camera.get();
            session.showLabels = labelsToggle ? labelsToggle.checked : true;

            disposed = true;
            player.dispose();
            hud.dispose();
            camera.dispose();
            if (window.Plotly) { try { Plotly.purge(TARGET); } catch (e) { /* ya no existe */ } }
        });
    }
};