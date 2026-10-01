// js/views/recorrido3D/trajectories3D.js
window.TrajectoryEngine3D = (function () {

    // ---------------------------------------------------------------------
    // IMPORTANTE: convención de ejes de los archivos crudos (ver nota
    // completa en dataProcessor.js):
    //   X = Este       -> eje horizontal "x" del gráfico 3D
    //   Z = Norte      -> eje horizontal "y" del gráfico 3D
    //   Y = Elevación  -> eje vertical "z" del gráfico 3D
    // Por eso NUNCA se leen X/Y/Z directo como x/y/z: se usan los mismos
    // helpers de DataProcessor que ya usa la simulación 2D, para que ambas
    // vistas queden siempre consistentes entre sí.
    // ---------------------------------------------------------------------
    function extractPoint3D(p) {
        const ground = (window.DataProcessor && window.DataProcessor.getGroundCoords)
            ? window.DataProcessor.getGroundCoords(p)
            : { x: parseFloat(p.X || 0), y: parseFloat(p.Z || 0) };

        const elevation = (window.DataProcessor && window.DataProcessor.getElevation)
            ? window.DataProcessor.getElevation(p, -200)
            : parseFloat(p.Y || -200);

        return { x: ground.x, y: ground.y, z: elevation };
    }

    function process3DTrajectories(trucks, shovels) {
        const timeMap = {};
        const vehicleMap = {};

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        (trucks || []).forEach(t => {
            const time = t.Tiempo || t.FECHA_HORA || t.HORA || t.TIMESTAMP || t.tiempo || '00:00:00';
            const id = t.Vehiculo || t.vehiculo || t.EQUIPO || t.id || 'CAMION';

            const { x, y, z } = extractPoint3D(t);

            if (x !== 0 || y !== 0) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            }

            const speed = parseFloat(t.Velocidad ?? t.velocidad ?? t.VELOCIDAD ?? t.speed ?? 0) || 0;
            const rawState = (t.ESTADO_OPERATIVO || t.state || t.ESTADO || '').toString().toUpperCase();
            const tolvaState = (t.Tolva || t.TOLVA || '').toString().toUpperCase();

            let state = 'EN_TRANSITO';
            if (rawState === 'DESCARGANDO' || rawState.includes('DESCARG') || rawState.includes('BOTADERO') || tolvaState === 'ARRIBA') {
                state = 'DESCARGANDO';
            } else if (rawState === 'CARGANDO' || rawState === 'ESPERA_EN_PALA' || rawState.includes('CARG') || rawState.includes('ESPERA')) {
                state = 'CARGANDO';
            }

            if (!timeMap[time]) timeMap[time] = { trucks: [], shovels: [] };

            const truckObj = {
                id, x, y, z, speed, state,
                material: t.MATERIAL || 'MINERAL',
                label: `<b>${id}</b><br>Vel: ${speed.toFixed(1)} km/h<br>Elevación: ${z.toFixed(1)} m<br>Estado: ${state}`
            };

            timeMap[time].trucks.push(truckObj);

            if (!vehicleMap[id]) vehicleMap[id] = [];
            const sec = (window.DataProcessor && DataProcessor.extractSecondsFrom24HourFormat)
                ? (DataProcessor.extractSecondsFrom24HourFormat(time) ?? 0) : 0;
            vehicleMap[id].push({ time, sec, x, y, z, speed, state });
        });

        const uniqueShovels = [];
        const shovelSet = new Set();
        const shovelLabelOf = (window.DataProcessor && DataProcessor.getShovelLabelResolver)
            ? DataProcessor.getShovelLabelResolver(shovels || [])
            : null;

        (shovels || []).forEach(s => {
            const baseId = s.Vehiculo || s.vehiculo || s.EQUIPO || s.id || 'PALA';
            const id = shovelLabelOf ? shovelLabelOf(s) : baseId;
            const { x, y, z } = extractPoint3D(s);

            if (x !== 0 || y !== 0) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            }

            if (!shovelSet.has(id)) {
                shovelSet.add(id);
                uniqueShovels.push({ id, x, y, z, label: `<b>🚜 ${id}</b><br>Elevación: ${z.toFixed(1)} m` });
            }
        });

        Object.keys(timeMap).forEach(t => {
            timeMap[t].shovels = uniqueShovels;
        });

        // Cada vehículo ahora se dibuja como una traza continua propia (ver
        // recorrido3D.js), así que sus puntos deben quedar en orden
        // cronológico real y no en el orden en que aparecen en el archivo
        // crudo, o la línea saldría en zigzag.
        // El segundo del día se calcula UNA vez por punto (arriba) en vez de
        // parsear el texto de la hora dentro del comparador del sort
        // (~2 × n·log n parseos con 50k registros).
        Object.keys(vehicleMap).forEach(id => {
            vehicleMap[id].sort((a, b) => a.sec - b.sec);
        });

        if (!isFinite(minX)) { minX = -500; maxX = 500; }
        if (!isFinite(minY)) { minY = -500; maxY = 500; }
        if (!isFinite(minZ) || minZ === maxZ) { minZ = -800; maxZ = 0; }

        const bounds = { minX, maxX, minY, maxY, minZ, maxZ };
        const timestamps = Object.keys(timeMap).sort();

        return { timeMap, timestamps, vehicleMap, uniqueShovels, bounds };
    }

    // -----------------------------------------------------------------
    // Detección simple de puntos de descarga (chancadora/botadero) en 3D.
    // Reutiliza la misma lógica de clustering por radio que zones.js usa
    // en 2D (agrupar puntos DESCARGANDO cercanos entre sí y quedarse solo
    // con los grupos que concentran una porción real de las descargas),
    // pero conservando también la elevación promedio de cada grupo para
    // poder dibujarlo en el lugar correcto del gráfico 3D. Es opcional:
    // si no hay puntos de descarga simplemente devuelve un arreglo vacío.
    // -----------------------------------------------------------------
    function computeDumpClusters3D(vehicleMap, options) {
        options = options || {};
        const CLUSTER_RADIUS = options.clusterRadius || 250;
        const MIN_CLUSTER_SHARE = options.minShare || 0.05;

        const dischargePoints = [];
        Object.values(vehicleMap || {}).forEach(points => {
            (points || []).forEach(p => {
                if (p.state === 'DESCARGANDO') dischargePoints.push(p);
            });
        });

        if (dischargePoints.length === 0) return [];

        let clusters = [];
        dischargePoints.forEach(pt => {
            let target = null;
            for (let i = 0; i < clusters.length; i++) {
                const c = clusters[i];
                if (Math.hypot(pt.x - c.cx, pt.y - c.cy) <= CLUSTER_RADIUS) { target = c; break; }
            }
            if (target) {
                target.points.push(pt);
                const n = target.points.length;
                target.cx = target.points.reduce((s, p) => s + p.x, 0) / n;
                target.cy = target.points.reduce((s, p) => s + p.y, 0) / n;
                target.cz = target.points.reduce((s, p) => s + p.z, 0) / n;
            } else {
                clusters.push({ cx: pt.x, cy: pt.y, cz: pt.z, points: [pt] });
            }
        });

        const total = dischargePoints.length;
        clusters = clusters
            .filter(c => (c.points.length / total) >= MIN_CLUSTER_SHARE)
            .sort((a, b) => b.points.length - a.points.length);

        return clusters.map((c, idx) => ({
            id: `Descarga ${String(idx + 1).padStart(2, '0')}`,
            x: c.cx,
            y: c.cy,
            z: c.cz,
            nPoints: c.points.length
        }));
    }

    return { process3DTrajectories, computeDumpClusters3D };
})();