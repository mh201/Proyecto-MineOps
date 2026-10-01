// js/views/recorrido3D.js
window.Views = window.Views || {};

Views.recorrido3D = function () {
    return `
        <!-- Encabezado -->
        <div class="sim-header" style="background: rgba(11, 37, 60, 0.7); border: 1px solid rgba(234, 244, 251, 0.1); border-radius: 8px; padding: 12px 18px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="margin: 0; color: #eaf4fb; font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span>🧊</span> Visualización 3D del Recorrido y Topografía
            </h3>
            <span style="color: #5f88a8; font-size: 11px; font-family: 'JetBrains Mono', monospace;">Arrastrar: rotar · Rueda: zoom · Clic derecho: mover</span>
        </div>

        <!-- Ventana Principal -->
        <div class="simulation-container" style="display: flex; flex-direction: column; gap: 12px; width: 100%; position: relative;">
            
            <div id="sim3d-loader" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(11, 19, 32, 0.85); backdrop-filter: blur(4px); z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 6px;">
                <div style="font-size: 32px; margin-bottom: 10px; animation: pulse 1.5s infinite;">📐</div>
                <div style="color: #7dd3fc; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600;">Cargando Geometría 3D...</div>
            </div>

            <!-- HUD de Controles -->
            <div class="sim-hud" style="flex-wrap: wrap;">
                <div class="hud-group">
                    <button id="sim3d-play-btn" class="hud-btn primary">▶</button>
                    <button id="sim3d-pause-btn" class="hud-btn">⏸</button>
                    <div class="time-display mono" id="sim3d-clock">00:00:00</div>
                </div>

                <div class="hud-group fill">
                    <input type="range" id="sim3d-timeline" min="0" max="100" value="0" class="sim-slider">
                </div>

                <div class="hud-group">
                    <label class="hud-label mono">VEHÍCULO:</label>
                    <select id="sim3d-vehicle-filter" class="hud-select" style="max-width: 130px;">
                        <option value="ALL">Todos</option>
                    </select>
                </div>

                <div class="hud-group">
                    <label class="hud-label mono">VELOCIDAD:</label>
                    <select id="sim3d-speed-select" class="hud-select" title="Segundos de turno por segundo real">
                        <option value="1">1x</option>
                        <option value="5">5x</option>
                        <option value="10" selected>10x</option>
                        <option value="30">30x</option>
                        <option value="60">60x</option>
                        <option value="120">120x</option>
                    </select>
                </div>

                <div class="hud-group" style="margin-left: auto;">
                    <label class="checkbox-group" style="font-size: 11px; margin: 0;">
                        <input type="checkbox" id="sim3d-toggle-surface" checked>
                        <span style="color: #9cc3dd;">Superficie</span>
                    </label>
                    <label class="checkbox-group" style="font-size: 11px; margin-left: 8px;">
                        <input type="checkbox" id="sim3d-toggle-trails" >
                        <span style="color: #9cc3dd;">Líneas</span>
                    </label>
                    <label class="checkbox-group" style="font-size: 11px; margin-left: 8px;">
                        <input type="checkbox" id="sim3d-toggle-zones" checked>
                        <span style="color: #9cc3dd;">Zonas</span>
                    </label>
                    <label class="checkbox-group" style="font-size: 11px; margin-left: 8px;">
                        <input type="checkbox" id="sim3d-toggle-labels" checked>
                        <span style="color: #9cc3dd;">Etiquetas</span>
                    </label>
                </div>
            </div>

            <!-- Canvas Plotly 3D -->
            <div id="plotly-3d" class="plotly-canvas-container" style="min-height: 580px; width: 100%;"></div>
        </div>

        <!-- Leyenda Explicativa -->
        <div class="sim-legend-bar" style="background: rgba(11, 37, 60, 0.85); border: 1px solid rgba(234, 244, 251, 0.12); border-radius: 8px; padding: 12px 18px; margin-top: 12px; display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-around;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: #6ee7b7; border-radius: 2px;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Pala:</b> punto de carga</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 16px; height: 3px; background: linear-gradient(90deg, #f87171, #facc15, #4ade80, #38bdf8, #a78bfa);"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Trayectorias:</b> un color por camión (clic en la leyenda para aislar uno)</span>
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
                <span style="display: inline-block; width: 9px; height: 9px; border: 2px solid #fb923c; transform: rotate(45deg);"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Espera en pala</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; color: #e879f9; font-weight: bold; line-height: 12px; text-align: center;">✚</span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Estacionando</b> (reversa en pala/descarga)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ef4444;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Descargando</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 11px; height: 11px; background: #94a3b8;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Detenido en ruta</b></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 16px; height: 0; border-top: 2px dotted #6ee7b7;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Anillo verde:</b> frente de pala</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 16px; height: 0; border-top: 2px dotted #a78bfa;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Anillo de color:</b> chancadora/botadero</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 16px; height: 12px; background: linear-gradient(90deg, #2b1b0e, #a9713b); border-radius: 2px;"></span>
                <span style="color: #eaf4fb; font-size: 11px; font-family: 'JetBrains Mono', monospace;"><b>Superficie:</b> topografía de la vía (más claro = más alto)</span>
            </div>
        </div>
    `;
};

Views.initRecorrido3DEvents = function () {
    const TARGET = 'plotly-3d';
    const FONT = 'JetBrains Mono';
    const trucks = AppState.processedTrucks || [];
    const shovels = AppState.processedShovels || [];
    const loader = document.getElementById('sim3d-loader');

    if (trucks.length === 0 && shovels.length === 0) {
        if (loader) loader.style.display = 'none';
        if (typeof showToast === 'function') showToast("No hay datos procesados.", "warning");
        return;
    }

    // =====================================================================
    // DATOS (cacheados por dataset en js/playback.js: al volver a esta
    // pestaña no se recalcula nada, ni siquiera la superficie).
    // =====================================================================
    const tracks = Playback.memo('tracks', () => Playback.buildTracks(trucks, shovels));
    if (tracks.trucks.length === 0 && tracks.shovels.length === 0) {
        if (loader) loader.style.display = 'none';
        return;
    }
    const traj = Playback.memo('traj3d', () => TrajectoryEngine3D.process3DTrajectories(trucks, shovels));
    const bounds = traj.bounds;
    const vehicleMap = traj.vehicleMap;
    const vehicleIds = Object.keys(vehicleMap).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

    const session = Playback.session('sim3d', {
        time: tracks.tStart, speed: 10, playing: false, camera: null,
        vehicle: 'ALL', surface: true, trails: false, zones: true, labels: true
    });

    // ---------------------------------------------------------------------
    // Controles
    // ---------------------------------------------------------------------
    const vehicleSelect = document.getElementById('sim3d-vehicle-filter');
    const toggleSurface = document.getElementById('sim3d-toggle-surface');
    const toggleTrails = document.getElementById('sim3d-toggle-trails');
    const toggleZones = document.getElementById('sim3d-toggle-zones');
    const toggleLabels = document.getElementById('sim3d-toggle-labels');

    if (vehicleSelect) {
        vehicleSelect.innerHTML = '<option value="ALL">Todos los equipos</option>';
        vehicleIds.forEach(vId => {
            const opt = document.createElement('option');
            opt.value = vId;
            opt.textContent = vId;
            vehicleSelect.appendChild(opt);
        });
        vehicleSelect.value = vehicleIds.includes(session.vehicle) ? session.vehicle : 'ALL';
    }
    if (toggleSurface) toggleSurface.checked = session.surface;
    if (toggleTrails) toggleTrails.checked = session.trails;
    if (toggleZones) toggleZones.checked = session.zones;
    if (toggleLabels) toggleLabels.checked = session.labels;

    const isOn = (el, fallback) => el ? el.checked : fallback;

    // =====================================================================
    // ELEMENTOS ESTÁTICOS (se construyen una vez; en cada cuadro solo se
    // reenvían las mismas referencias, así Plotly no copia arreglos grandes).
    // =====================================================================

    // Color distinto por camión (matices repartidos en la rueda de color).
    const vehicleColorMap = {};
    vehicleIds.forEach((id, idx) => {
        const hue = Math.round((idx * (360 / (vehicleIds.length || 1))) % 360);
        vehicleColorMap[id] = `hsl(${hue}, 78%, 62%)`;
    });

    // Zonas: disco translúcido + borde. El nombre va como anotación (ver
    // labels más abajo), no como texto WebGL.
    const ZONE_RADIUS_METERS = 55;
    const DUMP_COLOR_PALETTE = ['#a78bfa', '#f472b6', '#fb923c', '#facc15'];

    function buildZoneTraces(uid, cx, cy, cz, radius, color, label) {
        const segments = 48;
        const ringX = [], ringY = [], ringZ = [];
        const discX = [cx], discY = [cy], discZ = [cz];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * 2 * Math.PI;
            const px = cx + radius * Math.cos(a);
            const py = cy + radius * Math.sin(a);
            ringX.push(px); ringY.push(py); ringZ.push(cz);
            if (i < segments) { discX.push(px); discY.push(py); discZ.push(cz); }
        }
        const I = [], J = [], K = [];
        for (let i = 1; i <= segments; i++) { I.push(0); J.push(i); K.push((i % segments) + 1); }
        return [
            {
                uid: uid + '-disc', type: 'mesh3d', name: label, legendgroup: uid,
                x: discX, y: discY, z: discZ, i: I, j: J, k: K,
                color, opacity: 0.30, flatshading: true,
                lighting: { ambient: 1, diffuse: 0, specular: 0 },
                hoverinfo: 'name', showlegend: true
            },
            {
                uid: uid + '-ring', type: 'scatter3d', mode: 'lines', name: label, legendgroup: uid,
                x: ringX, y: ringY, z: ringZ,
                line: { color, width: 7 },
                hoverinfo: 'name', showlegend: false
            }
        ];
    }

    const zoneDefs = Playback.memo('zones3d', () => {
        const defs = [];
        // Centro de cada frente = mediana de la posición de la pala en el
        // turno (antes era su PRIMER registro, que puede no ser representativo
        // si la pala se reubica).
        tracks.shovels.forEach(tr => {
            const m = Playback.trackMedian(tr);
            defs.push({ uid: Playback.safeUid('zone-' + tr.id), x: m.x, y: m.y, z: m.z, color: '#6ee7b7', label: `Frente ${tr.id}` });
        });
        // Mismos puntos de descarga (y misma numeración) que el mapa 2D; la
        // elevación es la mediana de los registros de descarga de cada uno.
        const dumps = MineZones.getDumpClusters(trucks);
        dumps.forEach((dc, idx) => {
            const zs = [];
            trucks.forEach(r => {
                if (r.ESTADO_OPERATIVO !== 'DESCARGANDO') return;
                const g = DataProcessor.getGroundCoords(r);
                if (g.x < dc.bbox.minX || g.x > dc.bbox.maxX || g.y < dc.bbox.minY || g.y > dc.bbox.maxY) return;
                const z = DataProcessor.getElevation(r, null);
                if (z !== null && isFinite(z)) zs.push(z);
            });
            zs.sort((a, b) => a - b);
            const z = zs.length ? zs[zs.length >> 1] : (bounds.minZ + bounds.maxZ) / 2;
            defs.push({ uid: Playback.safeUid('zone-' + dc.id), dumpId: dc.id, x: dc.x, y: dc.y, z, color: DUMP_COLOR_PALETTE[idx % DUMP_COLOR_PALETTE.length], label: dc.id });
        });
        return defs;
    });
    const zoneTraces = [];
    const zoneLabel = d => d.dumpId ? DataProcessor.dumpDisplayName(d.dumpId) : d.label;
    zoneDefs.forEach(d => zoneTraces.push(...buildZoneTraces(d.uid, d.x, d.y, d.z, ZONE_RADIUS_METERS, d.color, zoneLabel(d))));
    const zoneAnnotations = zoneDefs.map(d => ({
        x: d.x, y: d.y, z: d.z, text: `<b>${zoneLabel(d).toUpperCase()}</b>`,
        showarrow: false, yshift: 22,
        font: { color: d.color, size: 12, family: FONT }
    }));

    // Trayectorias: una traza por camión, simplificada (se descartan puntos
    // a menos de 3 m del anterior: los largos ratos detenido en pala o cola
    // generaban miles de puntos idénticos que se re-subían a la GPU en cada
    // cuadro). Se construyen recién la primera vez que se activan.
    let trailTraces = null;
    function getTrailTraces() {
        if (trailTraces) return trailTraces;
        const simplified = Playback.memo('trails3d', () => {
            const out = {};
            vehicleIds.forEach(id => {
                const pts = vehicleMap[id] || [];
                const x = [], y = [], z = [];
                let lx = NaN, ly = NaN;
                pts.forEach(p => {
                    if (!(Math.hypot(p.x - lx, p.y - ly) < 3)) {
                        x.push(p.x); y.push(p.y); z.push(p.z);
                        lx = p.x; ly = p.y;
                    }
                });
                out[id] = { x, y, z };
            });
            return out;
        });
        trailTraces = {};
        vehicleIds.forEach(id => {
            trailTraces[id] = {
                uid: Playback.safeUid('trail-' + id), type: 'scatter3d', mode: 'lines', name: id,
                legendgroup: 'trails', opacity: 0.85,
                x: simplified[id].x, y: simplified[id].y, z: simplified[id].z,
                line: { color: vehicleColorMap[id], width: 3 },
                hoverinfo: 'name'
            };
        });
        return trailTraces;
    }

    // =====================================================================
    // ESTADO DINÁMICO
    // =====================================================================
    // Mismos estados/colores que la simulación 2D y el Resumen (js/playback.js).
    const STATE_ORDER = ['EN_TRANSITO', 'ESTACIONANDO', 'CARGANDO', 'ESPERA_EN_PALA', 'DESCARGANDO', 'DETENIDO_EN_RUTA'];
    const META = Playback.STATE_META;

    const stateText = t => (t.state === 'CARGANDO' && t.pase) ? `Cargando · pase ${t.pase}` : META[t.state].label;

    function hoverOf(t) {
        const extra = (t.state === 'CARGANDO' && t.pasesTotal) ? `<br>Pase ${t.pase} de ${t.pasesTotal} de esta carga` : '';
        return `<b>${t.id}</b><br>Vel: ${t.speed.toFixed(1)} km/h<br>Elevación: ${t.z.toFixed(1)} m<br>Estado: ${stateText(t)}${extra}`;
    }

    // IMPORTANTE (bug de las etiquetas que se achicaban): el texto de un
    // scatter3d se dibuja en WebGL y Plotly guarda en caché la geometría de
    // cada texto la primera vez que lo genera, sin tener en cuenta el
    // devicePixelRatio de la pantalla. Una traza recién creada genera sus
    // textos con ratio 1; una traza que ya existía los genera divididos por
    // el ratio real (1.25, 1.5, 2 en laptops con escalado). Por eso las
    // etiquetas del primer cuadro salían bien y los camiones que "entraban"
    // después salían más chicos, y quedaban así para siempre.
    // Solución: las etiquetas de camiones y palas ahora son anotaciones de la
    // escena (SVG sobre el canvas): tamaño en píxeles fijo, nítidas, y no
    // pasan por ese caché. Los marcadores siguen siendo WebGL.
    function buildFrame(t) {
        const traces = [];
        const annotations = [];
        const selected = vehicleSelect ? vehicleSelect.value : 'ALL';
        const showLabels = isOn(toggleLabels, true);

        const surface = Playback.getCached('surface3d');
        if (surface && isOn(toggleSurface, true)) traces.push(surface);

        if (isOn(toggleZones, true)) {
            traces.push(...zoneTraces);
            if (showLabels) annotations.push(...zoneAnnotations);
        }

        if (isOn(toggleTrails, false)) {
            const trails = getTrailTraces();
            (selected !== 'ALL' ? [selected] : vehicleIds).forEach(id => { if (trails[id]) traces.push(trails[id]); });
        }

        const frame = Playback.sampleFrame(tracks, t);
        const truckList = selected === 'ALL' ? frame.trucks : frame.trucks.filter(tk => tk.id === selected);

        // Palas: posición del instante (antes quedaban fijas en su primer
        // registro; ahora coincide con la simulación 2D).
        traces.push({
            uid: 'shovels', type: 'scatter3d', mode: 'markers', name: 'Palas',
            x: frame.shovels.map(s => s.x), y: frame.shovels.map(s => s.y), z: frame.shovels.map(s => s.z),
            marker: { symbol: 'square', size: 8, color: '#6ee7b7' },
            hovertext: frame.shovels.map(s => `<b>🚜 ${s.id}</b><br>Elevación: ${s.z.toFixed(1)} m`),
            hoverinfo: 'text'
        });

        // Siempre las mismas trazas de estado (aunque estén vacías) y con uid
        // fijo: la leyenda no "salta" y Plotly reutiliza los objetos.
        STATE_ORDER.forEach(key => {
            const st = META[key];
            const list = truckList.filter(tk => tk.state === key);
            traces.push({
                uid: 'st-' + key, type: 'scatter3d', mode: 'markers', name: st.label,
                x: list.map(tk => tk.x), y: list.map(tk => tk.y), z: list.map(tk => tk.z),
                marker: {
                    symbol: st.symbol3d, size: 8, color: st.color,
                    line: { color: '#0b253c', width: 1 }
                },
                hovertext: list.map(hoverOf),
                hoverinfo: 'text'
            });
        });

        if (showLabels) {
            // Solo texto (sin marco ni fondo), igual que en 2D.
            frame.shovels.forEach(s => annotations.push({
                x: s.x, y: s.y, z: s.z, text: `<b>🚜 ${s.id}</b>`,
                showarrow: false, yshift: 16,
                font: { color: '#6ee7b7', size: 12, family: FONT }
            }));
            truckList.forEach(tk => {
                const st = META[tk.state];
                annotations.push({
                    x: tk.x, y: tk.y, z: tk.z,
                    text: `<b>${tk.id}</b><br>${tk.speed.toFixed(0)} km/h | ${stateText(tk)}`,
                    showarrow: false, xanchor: 'left', yanchor: 'bottom', xshift: 6, yshift: 4,
                    align: 'left',
                    font: { color: st.color, size: 11, family: FONT }
                });
            });
        }

        return { traces, annotations };
    }

    // =====================================================================
    // CÁMARA LIBRE DURANTE LA ANIMACIÓN
    // Plotly, en cada redibujo 3D, vuelve a posicionar la cámara según el
    // layout. La cámara solo se "guarda" en el layout al soltar el mouse, así
    // que mientras el usuario arrastraba, cada cuadro (cada ~80 ms) lo
    // devolvía al ángulo anterior: la rotación se sentía trabada.
    // Ahora, justo antes de cada cuadro se lee la cámara VIVA de la escena
    // (incluido un arrastre en curso) y esa es la que se envía.
    // =====================================================================
    const DEFAULT_CAMERA = {
        eye: { x: 0.95, y: -0.95, z: 0.6 },
        up: { x: 0, y: 0, z: 1 },
        center: { x: 0, y: 0, z: 0 }
    };

    // Segundo problema de la cámara: en modo "turntable" Plotly ejecuta en
    // CADA redibujo `camera.mode = 'turntable'`, cuyo setter programa una
    // animación de 500 ms hacia el ángulo actual; eso pisa la rotación que el
    // usuario está haciendo con el mouse (en modo Pan no ocurre, por eso ahí
    // sí se podía mover). Se parchea la escena para que solo lo haga cuando
    // el modo realmente cambia.
    function patchTurntable(gd) {
        const scene = gd && gd._fullLayout && gd._fullLayout.scene && gd._fullLayout.scene._scene;
        if (!scene || scene.__mineopsPatched || typeof scene.updateFx !== 'function') return;
        const original = scene.updateFx;
        scene.updateFx = function (dragmode, hovermode) {
            if (dragmode === 'turntable' && this.camera && this.camera.mode === 'turntable') {
                this.fullSceneLayout.hovermode = hovermode;
                return;
            }
            return original.call(this, dragmode, hovermode);
        };
        scene.__mineopsPatched = true;
    }

    function liveCamera() {
        const gd = document.getElementById(TARGET);
        const scene = gd && gd._fullLayout && gd._fullLayout.scene && gd._fullLayout.scene._scene;
        if (scene && scene.camera && typeof scene.getCamera === 'function') {
            try { return scene.getCamera(); } catch (e) { /* escena en reconstrucción */ }
        }
        return null;
    }

    const rangeX = Math.abs(bounds.maxX - bounds.minX) || 100;
    const rangeY = Math.abs(bounds.maxY - bounds.minY) || 100;
    const rangeZ = Math.abs(bounds.maxZ - bounds.minZ) || 100;
    const maxDim = Math.max(rangeX, rangeY, rangeZ) || 1;
    const aspect = {
        x: Math.max(0.2, rangeX / maxDim),
        y: Math.max(0.2, rangeY / maxDim),
        // Piso de 0.2 para exagerar levemente el relieve.
        z: Math.max(0.2, rangeZ / maxDim)
    };
    const axisStyle = (title, range) => ({
        title: { text: title, font: { color: '#9cc3dd', size: 10, family: FONT } },
        range,
        gridcolor: 'rgba(234, 244, 251, 0.08)',
        zerolinecolor: 'rgba(234, 244, 251, 0.2)',
        tickfont: { color: '#5f88a8', size: 9, family: FONT }
    });

    function getLayout3D(camera, annotations) {
        return {
            autosize: true,
            uirevision: 'sim3d', // conserva los clics en la leyenda
            paper_bgcolor: '#0b1320',
            plot_bgcolor: '#0b1320',
            margin: { l: 0, r: 0, t: 70, b: 0 },
            showlegend: true,
            legend: {
                x: 0.01, y: 0.99,
                font: { color: '#eaf4fb', family: FONT, size: 10 },
                bgcolor: 'rgba(11, 37, 60, 0.85)',
                bordercolor: 'rgba(234, 244, 251, 0.2)',
                borderwidth: 1
            },
            scene: {
                uirevision: 'sim3d',
                aspectmode: 'manual',
                aspectratio: aspect,
                dragmode: 'turntable',
                xaxis: axisStyle('Este (X) [m]', [bounds.minX - 30, bounds.maxX + 30]),
                yaxis: axisStyle('Norte (Z) [m]', [bounds.minY - 20, bounds.maxY + 20]),
                zaxis: axisStyle('Elevación (Y) [m]', [bounds.minZ - 20, bounds.maxZ + 20]),
                camera,
                annotations
            }
        };
    }

    const CONFIG = {
        responsive: true, displayModeBar: true, displaylogo: false,
        modeBarButtonsToRemove: ['resetCameraLastSave3d']
    };

    // =====================================================================
    // DIBUJO + REPRODUCTOR
    // =====================================================================
    let disposed = false;
    let firstDraw = true;

    function drawFrame(t) {
        if (disposed) return;
        const gd = document.getElementById(TARGET);
        if (!gd) return;
        hud.updateHud(t);

        const { traces, annotations } = buildFrame(t);
        const camera = firstDraw ? DEFAULT_CAMERA : (liveCamera() || DEFAULT_CAMERA);
        const done = Plotly.react(gd, traces, getLayout3D(camera, annotations), CONFIG);
        patchTurntable(gd);

        if (firstDraw) {
            firstDraw = false;
            // La cámara guardada se aplica DESPUÉS del primer dibujo, para
            // que el botón "reset camera" siga volviendo al ángulo por defecto.
            if (session.camera) {
                Promise.resolve(done).then(() => {
                    if (!disposed && document.getElementById(TARGET)) {
                        Plotly.relayout(TARGET, { 'scene.camera': session.camera });
                    }
                });
            }
        }
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
        play: 'sim3d-play-btn', pause: 'sim3d-pause-btn', timeline: 'sim3d-timeline',
        clock: 'sim3d-clock', speed: 'sim3d-speed-select'
    });

    [vehicleSelect, toggleSurface, toggleTrails, toggleZones, toggleLabels].forEach(el => {
        if (el) el.addEventListener('change', () => player.render());
    });

    function start() {
        if (disposed) return;
        if (loader) loader.style.display = 'none';
        player.render();
        hud.setPlaying(false);
        if (session.playing) player.play();
    }

    // Superficie: se interpola una sola vez por dataset (es lo más costoso de
    // la vista). Si ya existe, arranca de inmediato.
    if (Playback.getCached('surface3d') !== undefined) {
        start();
    } else {
        Terrain3DEngine.generatePitSurfaceAsync(trucks, shovels, bounds, { cellSize: 10 }, (err, surfaceTrace) => {
            if (!err && surfaceTrace) surfaceTrace.uid = 'surface';
            Playback.setCached('surface3d', (!err && surfaceTrace) ? surfaceTrace : null);
            start();
        });
    }

    // Al salir: se guarda instante, velocidad, cámara, filtros y si estaba
    // corriendo; se libera el contexto WebGL (los navegadores limitan cuántos
    // pueden coexistir). Al volver se retoma exactamente donde quedó.
    if (window.ViewLifecycle) {
        ViewLifecycle.register(() => {
            if (!firstDraw) session.camera = liveCamera() || session.camera;
            session.time = player.getTime();
            session.speed = player.getSpeed();
            session.playing = player.isPlaying();
            session.vehicle = vehicleSelect ? vehicleSelect.value : 'ALL';
            session.surface = isOn(toggleSurface, true);
            session.trails = isOn(toggleTrails, false);
            session.zones = isOn(toggleZones, true);
            session.labels = isOn(toggleLabels, true);

            disposed = true;
            player.dispose();
            hud.dispose();
            if (window.Plotly) { try { Plotly.purge(TARGET); } catch (e) { /* ya no existe */ } }
        });
    }
};