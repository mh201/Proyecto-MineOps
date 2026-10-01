// js/playback.js
// -----------------------------------------------------------------------------
// Motor de reproducción compartido por la Simulación 2D y el Recorrido 3D.
//
// Reemplaza el esquema anterior (un "cuadro" por cada Tiempo distinto del
// archivo + setInterval) por:
//
//  1) PISTAS por equipo: cada camión/pala queda como arreglos ordenados por
//     tiempo (segundos del día). En cualquier instante T se obtiene la posición
//     por búsqueda binaria + interpolación lineal. Así:
//       - los camiones ya no "parpadean" cuando no reportan justo en ese
//         segundo (antes, un hueco de 2 s hacía desaparecer el camión y
//         reaparecer en el cuadro siguiente);
//       - el movimiento es continuo aunque se reproduzca a velocidad baja.
//
//  2) REPRODUCTOR basado en requestAnimationFrame y tiempo real: la velocidad
//     significa "segundos de turno por segundo real". Si el navegador no alcanza
//     a dibujar todos los cuadros, se saltan (no se acumula una cola de ticks
//     como ocurría con setInterval a 50x).
//
//  3) CACHÉ por dataset y SESIONES guardadas: los cálculos pesados (pistas,
//     zonas, rutas, superficie 3D) se hacen una sola vez por archivo cargado,
//     y el estado de cada animación (instante, velocidad, cámara, filtros) se
//     conserva al cambiar de pestaña. Si el usuario vuelve a "Cargar y Filtrar"
//     y aplica filtros nuevos, AppState.processedTrucks cambia de referencia y
//     todo se invalida solo.
// -----------------------------------------------------------------------------
window.Playback = (function () {

    // Si un equipo deja de reportar, se mantiene en su última posición durante
    // este tiempo (cubre los huecos normales de 1-2 s entre registros, para que
    // no parpadee). Pasado ese umbral, o antes de su primer registro, NO se
    // dibuja: sin reporte de posición no se inventa una ubicación.
    const HOLD_SECONDS = { truck: 15, shovel: 120 };
    // Solo se interpola entre dos registros si están a lo más a esta distancia
    // en el tiempo; con huecos mayores el equipo queda quieto en el último punto.
    const INTERP_MAX_GAP = 8;

    // =========================================================================
    // CACHÉ POR DATASET + SESIONES
    // =========================================================================
    let cache = { trucksRef: undefined, shovelsRef: undefined, store: {}, sessions: {} };

    function currentData() {
        const st = (typeof AppState !== 'undefined') ? AppState : (window.AppState || {});
        return { trucks: st.processedTrucks || [], shovels: st.processedShovels || [] };
    }

    function ensureCache() {
        const { trucks, shovels } = currentData();
        if (cache.trucksRef !== trucks || cache.shovelsRef !== shovels) {
            cache = { trucksRef: trucks, shovelsRef: shovels, store: {}, sessions: {} };
        }
        return cache;
    }

    // Devuelve store[key] y, si no existe, lo calcula una sola vez.
    function memo(key, builder) {
        const c = ensureCache();
        if (!(key in c.store)) c.store[key] = builder();
        return c.store[key];
    }

    function getCached(key) { return ensureCache().store[key]; }
    function setCached(key, value) { ensureCache().store[key] = value; }

    // Estado persistente de una vista (se pierde solo si cambian los datos).
    function session(name, defaults) {
        const c = ensureCache();
        if (!c.sessions[name]) c.sessions[name] = Object.assign({}, defaults || {});
        return c.sessions[name];
    }

    // =========================================================================
    // TIEMPO
    // =========================================================================
    function rowTime(r) {
        return r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP || r.tiempo;
    }

    function secOf(r) {
        const raw = rowTime(r);
        if (window.DataProcessor && DataProcessor.extractSecondsFrom24HourFormat) {
            return DataProcessor.extractSecondsFrom24HourFormat(raw);
        }
        const m = String(raw || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        return m ? (+m[1] % 24) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null;
    }

    function formatClock(sec) {
        const s = Math.max(0, Math.floor(sec));
        const h = Math.floor(s / 3600) % 24;
        const m = Math.floor((s % 3600) / 60);
        const ss = s % 60;
        const p = n => String(n).padStart(2, '0');
        return `${p(h)}:${p(m)}:${p(ss)}`;
    }

    // =========================================================================
    // ESTADO VISUAL (misma regla que usaban trajectories.js / trajectories3D.js)
    // =========================================================================
    // Mismos estados y colores que usa el Resumen Operativo, para que la
    // animación y los KPIs hablen el mismo idioma.
    const STATE_CODES = ['EN_TRANSITO', 'CARGANDO', 'ESPERA_EN_PALA', 'DESCARGANDO', 'DETENIDO_EN_RUTA', 'ESTACIONANDO'];
    const STATE_META = {
        EN_TRANSITO:      { label: 'En tránsito',      color: '#7dd3fc', symbol2d: 'circle',      symbol3d: 'circle' },
        CARGANDO:         { label: 'Cargando',         color: '#ffd23f', symbol2d: 'diamond',     symbol3d: 'diamond' },
        ESPERA_EN_PALA:   { label: 'Espera en pala',   color: '#fb923c', symbol2d: 'hexagon',     symbol3d: 'diamond-open' },
        DESCARGANDO:      { label: 'Descargando',      color: '#ef4444', symbol2d: 'triangle-up', symbol3d: 'circle' },
        DETENIDO_EN_RUTA: { label: 'Detenido en ruta', color: '#94a3b8', symbol2d: 'square',      symbol3d: 'square' },
        ESTACIONANDO:     { label: 'Estacionando (reversa)', color: '#e879f9', symbol2d: 'triangle-down', symbol3d: 'cross' }
    };

    function renderStateCode(row) {
        const raw = (row.ESTADO_OPERATIVO || row.state || row.ESTADO || '').toString().toUpperCase();
        const direct = STATE_CODES.indexOf(raw);
        if (direct >= 0) return direct;
        // Respaldo si la fila no pasó por classifyZoneAndState.
        const tolva = (row.Tolva || row.TOLVA || '').toString().toUpperCase();
        const speed = parseFloat(row.Velocidad ?? row.VELOCIDAD ?? 0) || 0;
        if (raw.includes('DESCARG') || raw.includes('DUMP') || raw.includes('BOTADERO') || tolva === 'ARRIBA') return 3;
        if (raw.includes('ESPERA')) return 2;
        if (raw.includes('CARG')) return 1;
        if (raw.includes('DETEN') || speed < 1) return 4;
        return 0;
    }

    // =========================================================================
    // PISTAS
    // =========================================================================
    function buildTracks(trucks, shovels) {
        const DP = window.DataProcessor;
        const groundOf = (DP && DP.getGroundCoords) ? DP.getGroundCoords : (p => ({ x: parseFloat(p.X), y: parseFloat(p.Z) }));
        const elevOf = (DP && DP.getElevation) ? (p => DP.getElevation(p, NaN)) : (p => parseFloat(p.Y));
        const shovelLabelOf = (DP && DP.getShovelLabelResolver)
            ? DP.getShovelLabelResolver(shovels || [])
            : (s => s.Vehiculo || s.EQUIPO || s.id || 'PALA');

        const raw = {}; // key -> { id, kind, pts: [] }

        function add(kind, id, row) {
            const t = secOf(row);
            if (t === null || t === undefined) return;
            const { x, y } = groundOf(row);
            if (!isFinite(x) || !isFinite(y) || (x === 0 && y === 0)) return;
            const z = elevOf(row);
            const key = kind + '|' + id;
            if (!raw[key]) raw[key] = { id, kind, pts: [] };
            raw[key].pts.push({
                t, x, y, z,
                s: kind === 'truck' ? renderStateCode(row) : 0,
                p: row.__pase || 0, pt: row.__pasesTotal || 0,
                v: parseFloat(row.Velocidad ?? row.VELOCIDAD ?? row.speed ?? 0) || 0
            });
        }

        (trucks || []).forEach(r => add('truck', r.Vehiculo || r.EQUIPO || r.id || 'CAMION', r));
        (shovels || []).forEach(r => add('shovel', shovelLabelOf(r), r));

        let tStart = Infinity, tEnd = -Infinity;
        const truckTracks = [], shovelTracks = [];

        Object.values(raw).forEach(g => {
            g.pts.sort((a, b) => a.t - b.t);
            // Un solo registro por segundo (el último), para que la
            // interpolación nunca divida por cero.
            const pts = [];
            g.pts.forEach(p => {
                if (pts.length && pts[pts.length - 1].t === p.t) pts[pts.length - 1] = p;
                else pts.push(p);
            });
            const n = pts.length;
            if (n === 0) return;

            const tr = {
                id: g.id, kind: g.kind, n,
                t: new Float64Array(n), x: new Float64Array(n), y: new Float64Array(n),
                z: new Float64Array(n), v: new Float32Array(n), s: new Uint8Array(n),
                p: new Uint8Array(n), pt: new Uint8Array(n) // pase actual / pases de la carga
            };
            let lastZ = NaN;
            for (let i = 0; i < n; i++) {
                const p = pts[i];
                tr.t[i] = p.t; tr.x[i] = p.x; tr.y[i] = p.y; tr.v[i] = p.v; tr.s[i] = p.s;
                tr.p[i] = Math.min(255, p.p); tr.pt[i] = Math.min(255, p.pt);
                if (isFinite(p.z)) lastZ = p.z;
                tr.z[i] = lastZ;
            }
            // Relleno hacia atrás de elevaciones faltantes al inicio.
            let firstZ = NaN;
            for (let i = 0; i < n; i++) { if (isFinite(tr.z[i])) { firstZ = tr.z[i]; break; } }
            for (let i = 0; i < n && !isFinite(tr.z[i]); i++) tr.z[i] = isFinite(firstZ) ? firstZ : 0;

            if (tr.t[0] < tStart) tStart = tr.t[0];
            if (tr.t[n - 1] > tEnd) tEnd = tr.t[n - 1];
            (g.kind === 'truck' ? truckTracks : shovelTracks).push(tr);
        });

        truckTracks.sort((a, b) => String(a.id).localeCompare(String(b.id), 'es', { numeric: true }));
        shovelTracks.sort((a, b) => String(a.id).localeCompare(String(b.id), 'es', { numeric: true }));

        if (!isFinite(tStart)) { tStart = 0; tEnd = 0; }
        return { trucks: truckTracks, shovels: shovelTracks, tStart, tEnd };
    }

    // Último índice con t[i] <= T (o -1).
    function indexAt(tr, T) {
        const t = tr.t;
        if (T < t[0]) return -1;
        let lo = 0, hi = tr.n - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (t[mid] <= T) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    function sampleTrack(tr, T) {
        const i = indexAt(tr, T);
        if (i < 0) return null;                          // aún no reporta
        const age = T - tr.t[i];
        if (age > HOLD_SECONDS[tr.kind]) return null;    // sin reporte: no se dibuja

        let x = tr.x[i], y = tr.y[i], z = tr.z[i], v = tr.v[i];
        const j = i + 1;
        if (j < tr.n) {
            const gap = tr.t[j] - tr.t[i];
            if (gap > 0 && gap <= INTERP_MAX_GAP) {
                const f = age / gap;
                x += (tr.x[j] - x) * f;
                y += (tr.y[j] - y) * f;
                z += (tr.z[j] - z) * f;
                v += (tr.v[j] - v) * f;
            }
        }
        return {
            id: tr.id, x, y, z, speed: v, state: STATE_CODES[tr.s[i]] || 'EN_TRANSITO',
            pase: tr.p[i], pasesTotal: tr.pt[i]
        };
    }

    function sampleFrame(tracks, T) {
        const trucks = [], shovels = [];
        tracks.trucks.forEach(tr => { const p = sampleTrack(tr, T); if (p) trucks.push(p); });
        tracks.shovels.forEach(tr => { const p = sampleTrack(tr, T); if (p) shovels.push(p); });
        return { trucks, shovels };
    }

    function trackBounds(tracks) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        tracks.trucks.concat(tracks.shovels).forEach(tr => {
            for (let i = 0; i < tr.n; i++) {
                const x = tr.x[i], y = tr.y[i], z = tr.z[i];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
        });
        if (!isFinite(minX) || minX === maxX) { minX = -500; maxX = 500; }
        if (!isFinite(minY) || minY === maxY) { minY = -400; maxY = 400; }
        if (!isFinite(minZ) || minZ === maxZ) { minZ = -800; maxZ = 0; }
        return { minX, maxX, minY, maxY, minZ, maxZ };
    }

    // Punto "típico" de un equipo (mediana), más robusto que el primer
    // registro para ubicar zonas si la pala se desplaza durante el turno.
    function trackMedian(tr) {
        const med = arr => { const a = Array.from(arr).sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
        return { id: tr.id, x: med(tr.x), y: med(tr.y), z: med(tr.z) };
    }

    // =========================================================================
    // REPRODUCTOR
    // =========================================================================
    // =========================================================================
    // TRAMOS DE TIEMPO (intervalos de guardia)
    // Si en "Cargar y Filtrar" se eligieron varios intervalos (p. ej. 17:50-18:50
    // y 19:10-21:00), entre ellos no hay datos. La animación trabaja con tramos:
    // al llegar al final de uno salta al inicio del siguiente, y la línea de
    // tiempo solo representa el tiempo con datos (el hueco no existe en ella).
    // Cada tramo se ajusta al primer y último registro real que contiene.
    // Turnos que cruzan medianoche: los tiempos vienen en la escala del turno
    // (ver DataProcessor.SHIFT_PIVOT_SEC), así que el tramo es continuo.
    // =========================================================================
    function buildSegments(tracks) {
        const st = (typeof AppState !== 'undefined') ? AppState : (window.AppState || {});
        const intervals = (st.filters && st.filters.timeIntervals) || [];
        const all = tracks.trucks.concat(tracks.shovels);

        // Se recorre el turno minuto a minuto (en la escala del turno, que
        // puede pasar de las 24:00 si cruza medianoche) y se arman los tramos
        // con los minutos que caen dentro de algún intervalo de guardia.
        const merged = [];
        const inIv = (m) => !intervals.length ||
            (window.DataProcessor && DataProcessor.isMinuteInIntervals
                ? DataProcessor.isMinuteInIntervals(((m % 1440) + 1440) % 1440, intervals) : true);
        const m0 = Math.floor(tracks.tStart / 60), m1 = Math.floor(tracks.tEnd / 60);
        let open = null;
        for (let m = m0; m <= m1; m++) {
            if (inIv(m)) {
                if (open === null) open = m;
            } else if (open !== null) {
                merged.push([open * 60, m * 60 - 1]); open = null;
            }
        }
        if (open !== null) merged.push([open * 60, m1 * 60 + 59]);
        if (merged.length === 0) merged.push([tracks.tStart, tracks.tEnd]);

        // Ajuste al primer/último registro real dentro de cada tramo.
        const segs = [];
        merged.forEach(([a, b]) => {
            let lo = Infinity, hi = -Infinity;
            all.forEach(tr => {
                const i = firstIndexAtOrAfter(tr, a);
                if (i < tr.n && tr.t[i] <= b && tr.t[i] < lo) lo = tr.t[i];
                const j = indexAt(tr, b);
                if (j >= 0 && tr.t[j] >= a && tr.t[j] > hi) hi = tr.t[j];
            });
            if (isFinite(lo) && hi >= lo) segs.push({ a: lo, b: hi });
        });
        if (segs.length === 0) segs.push({ a: tracks.tStart, b: Math.max(tracks.tStart, tracks.tEnd) });

        let off = 0;
        segs.forEach(sg => { sg.off = off; off += Math.max(0, sg.b - sg.a); });
        return segs;
    }

    function firstIndexAtOrAfter(tr, T) {
        let lo = 0, hi = tr.n;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (tr.t[mid] < T) lo = mid + 1; else hi = mid; }
        return lo;
    }

    // =========================================================================
    // REPRODUCTOR
    // =========================================================================
    function createPlayer(opts) {
        const segs = (opts.segments && opts.segments.length)
            ? opts.segments
            : [{ a: opts.tStart, b: Math.max(opts.tStart, opts.tEnd), off: 0 }];
        const last = segs[segs.length - 1];
        const virtualTotal = Math.max(1, last.off + (last.b - last.a));
        const minFrameMs = 1000 / (opts.maxFps || 30);

        let onJump = opts.onJump || null;
        let t = snap(opts.initialTime ?? segs[0].a);
        let speed = opts.speed || 10;
        let playing = false;
        let raf = null, lastTs = null, lastRender = 0, disposed = false;

        function segIndexOf(v) {
            for (let i = 0; i < segs.length; i++) if (v <= segs[i].b) return i;
            return segs.length - 1;
        }
        // Lleva un instante al tiempo con datos más cercano hacia adelante.
        function snap(v) {
            if (v <= segs[0].a) return segs[0].a;
            for (let i = 0; i < segs.length; i++) {
                if (v <= segs[i].b) return Math.max(v, segs[i].a);
            }
            return last.b;
        }
        function toVirtual(v) {
            const sg = segs[segIndexOf(v)];
            return sg.off + Math.min(Math.max(v, sg.a), sg.b) - sg.a;
        }
        function fromVirtual(x) {
            for (let i = segs.length - 1; i >= 0; i--) {
                if (x >= segs[i].off) return Math.min(segs[i].b, segs[i].a + (x - segs[i].off));
            }
            return segs[0].a;
        }

        let lastError = null;
        function render() {
            if (disposed) return;
            try { opts.onFrame(t); }
            catch (e) {
                if (!lastError || lastError.message !== e.message) console.error('Error al dibujar el cuadro:', e);
                lastError = e;
            }
        }

        function loop(ts) {
            if (disposed || !playing) return;
            if (lastTs !== null) {
                // Tope de 0.25 s: al volver de otra pestaña del navegador no
                // se "salta" un bloque grande del turno.
                const dt = Math.min(0.25, (ts - lastTs) / 1000);
                const i = segIndexOf(t);
                const next = t + dt * speed;
                if (next <= segs[i].b) {
                    t = next;
                } else if (i + 1 < segs.length) {
                    // Fin del tramo: salta al inicio del siguiente intervalo.
                    const from = segs[i].b;
                    t = segs[i + 1].a;
                    if (onJump) onJump(from, t);
                } else {
                    t = segs[0].a; // fin del último tramo: vuelve al inicio
                    if (segs.length > 1 && onJump) onJump(last.b, t);
                }
            }
            lastTs = ts;
            // Se agenda el siguiente cuadro ANTES de dibujar: si un dibujo
            // falla, la animación sigue viva en vez de quedar "colgada".
            raf = requestAnimationFrame(loop);
            if (ts - lastRender >= minFrameMs) {
                lastRender = ts;
                render();
            }
        }

        function notify() { if (opts.onStateChange) opts.onStateChange(playing); }

        return {
            play() {
                if (disposed || playing) return;
                playing = true; lastTs = null; lastRender = 0;
                notify();
                raf = requestAnimationFrame(loop);
            },
            pause() {
                if (!playing) return;
                playing = false;
                if (raf) cancelAnimationFrame(raf);
                raf = null;
                notify();
                render(); // deja dibujado el instante exacto donde se pausó
            },
            toggle() { playing ? this.pause() : this.play(); },
            seek(v) { t = snap(v); if (!playing) render(); },
            seekVirtual(x) { t = fromVirtual(x); if (!playing) render(); },
            toVirtual, virtualTotal, segments: segs,
            setOnJump(fn) { onJump = fn; },
            setSpeed(s) { speed = s; },
            getTime() { return t; },
            getSpeed() { return speed; },
            isPlaying() { return playing; },
            render,
            dispose() {
                disposed = true; playing = false;
                if (raf) cancelAnimationFrame(raf);
                raf = null;
            }
        };
    }

    // Conecta los controles comunes del HUD (play/pausa, línea de tiempo,
    // reloj, velocidad) a un reproductor. Devuelve updateHud(t) para que la
    // vista la llame en cada cuadro. La línea de tiempo es "comprimida": solo
    // recorre los tramos con datos, sin los huecos entre intervalos.
    function bindHud(player, ids) {
        const playBtn = document.getElementById(ids.play);
        const pauseBtn = document.getElementById(ids.pause);
        const timeline = document.getElementById(ids.timeline);
        const clock = document.getElementById(ids.clock);
        const speedSel = document.getElementById(ids.speed);
        let scrubbing = false;
        const endScrub = () => { scrubbing = false; };

        // Aviso breve junto al reloj cuando la animación salta entre intervalos.
        let jumpNote = null, jumpTimer = null;
        if (clock && player.segments.length > 1) {
            jumpNote = document.createElement('span');
            jumpNote.style.cssText = "margin-left: 8px; font-size: 11px; color: #ffd23f; font-family: 'JetBrains Mono', monospace; opacity: 0; transition: opacity 0.3s; white-space: nowrap;";
            clock.insertAdjacentElement('afterend', jumpNote);
            player.setOnJump((from, to) => {
                jumpNote.textContent = `⏭ ${formatClock(from).slice(0, 5)} → ${formatClock(to).slice(0, 5)}`;
                jumpNote.style.opacity = '1';
                clearTimeout(jumpTimer);
                jumpTimer = setTimeout(() => { jumpNote.style.opacity = '0'; }, 2500);
            });
        }

        if (timeline) {
            timeline.min = '0';
            timeline.max = String(Math.ceil(player.virtualTotal));
            timeline.step = '1';
            timeline.title = player.segments.length > 1
                ? 'Intervalos: ' + player.segments.map(sg => `${formatClock(sg.a).slice(0, 5)}–${formatClock(sg.b).slice(0, 5)}`).join(' · ')
                : '';
            timeline.addEventListener('pointerdown', () => { scrubbing = true; });
            window.addEventListener('pointerup', endScrub);
            timeline.addEventListener('input', e => player.seekVirtual(parseFloat(e.target.value)));
        }
        if (speedSel) {
            speedSel.value = String(player.getSpeed());
            speedSel.addEventListener('change', e => player.setSpeed(parseFloat(e.target.value)));
        }
        if (playBtn) playBtn.addEventListener('click', () => player.play());
        if (pauseBtn) pauseBtn.addEventListener('click', () => player.pause());

        return {
            updateHud(t) {
                if (clock) clock.textContent = formatClock(t);
                if (timeline && !scrubbing) timeline.value = String(Math.round(player.toVirtual(t)));
            },
            dispose() {
                window.removeEventListener('pointerup', endScrub);
                clearTimeout(jumpTimer);
                if (jumpNote) jumpNote.remove();
            },
            setPlaying(p) {
                if (playBtn) playBtn.classList.toggle('active', p);
                if (pauseBtn) pauseBtn.classList.toggle('active', !p);
            }
        };
    }

    // Plotly usa el uid dentro de selectores CSS: con espacios o "#" (como
    // "CAT 7495 #1") lanza una excepción y el gráfico deja de actualizarse.
    function safeUid(str) { return String(str).replace(/[^A-Za-z0-9_-]/g, '_'); }

    return {
        memo, getCached, setCached, session, safeUid, STATE_META,
        buildTracks, sampleFrame, sampleTrack, trackBounds, trackMedian,
        createPlayer, bindHud, buildSegments, formatClock, secOf,
        STATE_CODES
    };
})();