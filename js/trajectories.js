// js/trajectories.js
window.TrajectoryEngine = (function () {
    // NOTA: la Simulación 2D ya no usa buildTimelineData (ahora usa las pistas
    // interpoladas de js/playback.js). Se conserva por compatibilidad.
    function buildTimelineData(trucks, shovels) {
        const timeMap = {};

        const shovelLabelOf = (window.DataProcessor && DataProcessor.getShovelLabelResolver)
            ? DataProcessor.getShovelLabelResolver(shovels)
            : (s => s.Vehiculo || s.EQUIPO || s.id || 'PALA');

        (trucks || []).forEach(t => {
            const time = t.Tiempo || t.FECHA_HORA || t.HORA || t.TIMESTAMP || '00:00:00';
            if (!timeMap[time]) timeMap[time] = { trucks: [], shovels: [] };

            const { x, y } = (window.DataProcessor && window.DataProcessor.getGroundCoords)
                ? window.DataProcessor.getGroundCoords(t)
                : { x: parseFloat(t.X || 0), y: parseFloat(t.Z || 0) };
            if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) return;

            const speed = parseFloat(t.Velocidad || t.VELOCIDAD || t.speed || 0);
            const validSpeed = isNaN(speed) ? 0 : speed;
            const id = t.Vehiculo || t.EQUIPO || t.id || 'CAMION';
            
            const rawState = (t.ESTADO_OPERATIVO || t.state || t.ESTADO || '').toString().toUpperCase();
            const tolvaState = (t.Tolva || t.TOLVA || '').toString().toUpperCase();
            
            let state = 'EN_TRANSITO';

            if (
                rawState === 'DESCARGANDO' || 
                rawState.includes('DESCARG') || 
                rawState.includes('DUMP') || 
                rawState.includes('BOTADERO') || 
                tolvaState === 'ARRIBA'
            ) {
                state = 'DESCARGANDO';
            } else if (
                rawState === 'CARGANDO' || 
                rawState === 'ESPERA_EN_PALA' || 
                rawState.includes('CARG') || 
                rawState.includes('ESPERA')
            ) {
                state = 'CARGANDO';
            }

            timeMap[time].trucks.push({
                id: id,
                x: x,
                y: y,
                speed: validSpeed,
                state: state,
                material: t.MATERIAL || 'MINERAL',
                label: `<b>${id}</b><br>${validSpeed.toFixed(0)} km/h | ${state}`
            });
        });

        const hasShovelTime = (shovels || []).some(s => s.Tiempo || s.FECHA_HORA || s.HORA);

        if (hasShovelTime) {
            (shovels || []).forEach(s => {
                const time = s.Tiempo || s.FECHA_HORA || s.HORA || '00:00:00';
                if (!timeMap[time]) timeMap[time] = { trucks: [], shovels: [] };

                const { x, y } = (window.DataProcessor && window.DataProcessor.getGroundCoords)
                    ? window.DataProcessor.getGroundCoords(s)
                    : { x: parseFloat(s.X || 0), y: parseFloat(s.Z || 0) };
                if (isNaN(x) || isNaN(y)) return;

                const id = shovelLabelOf(s);
                timeMap[time].shovels.push({
                    id: id,
                    x: x,
                    y: y,
                    label: `<b>🚜 ${id}</b>`
                });
            });
        } else {
            const staticShovels = [];
            const uniqueShovelIds = new Set();

            (shovels || []).forEach(s => {
                const id = shovelLabelOf(s);
                const { x, y } = (window.DataProcessor && window.DataProcessor.getGroundCoords)
                    ? window.DataProcessor.getGroundCoords(s)
                    : { x: parseFloat(s.X || 0), y: parseFloat(s.Z || 0) };
                if (!isNaN(x) && !isNaN(y) && !uniqueShovelIds.has(id)) {
                    uniqueShovelIds.add(id);
                    staticShovels.push({ id, x, y, label: `<b>🚜 ${id}</b>` });
                }
            });

            Object.keys(timeMap).forEach(t => {
                timeMap[t].shovels = staticShovels;
            });
        }

        const timestamps = Object.keys(timeMap).sort();
        return { timeMap, timestamps };
    }

    // ------------------------------------------------------------------
    // RUTAS DE ACARREO (caminos habituales pala -> chancadora)
    // ------------------------------------------------------------------
    // Idea: cada vez que un camión sale de una pala/chancadora reconocida y
    // llega a otra, el tramo intermedio (ZONA=RUTA_TRANSITO) es "un viaje".
    // Se agrupan todos los viajes que van del mismo origen al mismo destino,
    // se remuestrea cada uno a N puntos según distancia recorrida (no según
    // X o tiempo, para que sirva aunque la vía tenga curvas o zigzags), y se
    // promedian punto a punto para obtener un trazado representativo único.
    // No se usan coordenadas fijas de ningún archivo en particular: todo sale
    // de las zonas ya detectadas (shovelZones/dumpClusters) y de los propios
    // recorridos, así que funciona igual con otro .xlsx de la misma mina.
    function nearestZone(x, y, zones) {
        let best = null, bestDist = Infinity;
        (zones || []).forEach(z => {
            const d = Math.hypot(x - z.x, y - z.y);
            if (d < bestDist) { bestDist = d; best = z; }
        });
        return best;
    }

    function resampleByDistance(points, n) {
        if (!points || points.length < 2) return null;
        const dists = [0];
        for (let i = 1; i < points.length; i++) {
            dists.push(dists[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
        }
        const total = dists[dists.length - 1];
        if (total <= 0) return null;

        const out = [];
        for (let k = 0; k < n; k++) {
            const target = (k / (n - 1)) * total;
            let idx = 0;
            while (idx < dists.length - 1 && dists[idx + 1] < target) idx++;
            const d0 = dists[idx];
            const d1 = dists[Math.min(idx + 1, dists.length - 1)];
            const p0 = points[idx];
            const p1 = points[Math.min(idx + 1, points.length - 1)];
            const frac = (d1 > d0) ? (target - d0) / (d1 - d0) : 0;
            out.push({ x: p0.x + (p1.x - p0.x) * frac, y: p0.y + (p1.y - p0.y) * frac });
        }
        return { points: out, totalDistance: total };
    }

    function computeHaulRoutes(trucks, shovelZones, dumpClusters, options) {
        options = options || {};
        const RESAMPLE_POINTS = options.resamplePoints || 24;
        const MIN_TRIPS_PER_ROUTE = options.minTrips || 2;

        if (!trucks || trucks.length === 0) return [];
        if (!shovelZones || shovelZones.length === 0) return [];
        if (!dumpClusters || dumpClusters.length === 0) return [];

        const byVehicle = {};
        trucks.forEach(t => {
            const id = t.Vehiculo || t.EQUIPO || t.id || 'CAMION';
            if (!byVehicle[id]) byVehicle[id] = [];
            byVehicle[id].push(t);
        });

        const tripsByRoute = {};

        const secOf = (r) => (window.DataProcessor && DataProcessor.extractSecondsFrom24HourFormat)
            ? (DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA) ?? 0)
            : 0;

        Object.values(byVehicle).forEach(rawRows => {
            // Se parsea la hora una vez por fila (antes se hacía dentro del
            // comparador del sort, dos veces por comparación).
            const rows = rawRows
                .map(r => ({ r, s: secOf(r) }))
                .sort((a, b) => a.s - b.s)
                .map(o => o.r);

            let lastPlaceId = null;
            let lastPlaceKind = null;
            let currentTrip = [];

            rows.forEach(r => {
                const zone = (r.ZONA_OPERATIVA || '').toString().toUpperCase();
                const { x, y } = (window.DataProcessor && window.DataProcessor.getGroundCoords)
                    ? window.DataProcessor.getGroundCoords(r)
                    : { x: parseFloat(r.X || 0), y: parseFloat(r.Z || 0) };
                if (isNaN(x) || isNaN(y)) return;

                if (zone === 'ZONA_CARGA' || zone === 'ZONA_DESCARGA') {
                    const kind = zone === 'ZONA_CARGA' ? 'PALA' : 'CHANCADORA';
                    const place = nearestZone(x, y, kind === 'PALA' ? shovelZones : dumpClusters);
                    const placeId = place ? place.id : null;

                    // Solo cuentan como "ruta de acarreo" los tramos que van de
                    // una pala a una chancadora (o viceversa). Un cambio de pala
                    // a otra pala (o de chancadora a otra) sin pasar por el otro
                    // extremo no es un camino de acarreo real, así que se descarta.
                    if (currentTrip.length >= 2 && lastPlaceId && placeId && lastPlaceKind !== kind) {
                        const key = `${lastPlaceId}|${placeId}`;
                        if (!tripsByRoute[key]) tripsByRoute[key] = [];
                        tripsByRoute[key].push(currentTrip);
                    }
                    currentTrip = [];
                    lastPlaceId = placeId;
                    lastPlaceKind = kind;
                } else {
                    currentTrip.push({ x, y });
                }
            });
        });

        const routes = [];
        Object.keys(tripsByRoute).forEach(key => {
            const trips = tripsByRoute[key];
            const resampled = trips.map(t => resampleByDistance(t, RESAMPLE_POINTS)).filter(Boolean);
            if (resampled.length < MIN_TRIPS_PER_ROUTE) return;

            // Descarta viajes de longitud muy atípica (desvíos, tráfico raro,
            // ruido de GPS) antes de promediar, para que el trazado quede limpio.
            const distances = resampled.map(r => r.totalDistance).sort((a, b) => a - b);
            const median = distances[Math.floor(distances.length / 2)];
            const kept = resampled.filter(r => r.totalDistance <= median * 1.6 && r.totalDistance >= median * 0.5);
            const finalSet = kept.length >= MIN_TRIPS_PER_ROUTE ? kept : resampled;

            const avgPoints = [];
            for (let k = 0; k < RESAMPLE_POINTS; k++) {
                let sx = 0, sy = 0;
                finalSet.forEach(r => { sx += r.points[k].x; sy += r.points[k].y; });
                avgPoints.push({ x: sx / finalSet.length, y: sy / finalSet.length });
            }

            const [originId, destId] = key.split('|');
            routes.push({ id: key, originId, destId, points: avgPoints, nTrips: finalSet.length });
        });

        return routes;
    }

    return { buildTimelineData, computeHaulRoutes };
})();