// js/zones.js
window.MineZones = (function () {

    // La caja de cada pala se calcula en DataProcessor (getShovelZones), porque
    // la clasificación de estados usa exactamente la misma caja que se dibuja.
    function computeBBox(points, paddingMeters) {
        return DataProcessor.computeBBox(points, paddingMeters);
    }

    function bboxPathShape(bbox, fillcolor, lineColor, dash, name) {
        return {
            type: 'path',
            path: `M ${bbox.minX} ${bbox.minY} L ${bbox.maxX} ${bbox.minY} L ${bbox.maxX} ${bbox.maxY} L ${bbox.minX} ${bbox.maxY} Z`,
            fillcolor,
            line: { color: lineColor, width: 2, dash: dash || 'solid' },
            name
        };
    }

    // Las zonas de pala se calculan en DataProcessor.getShovelZones (misma
    // caja que usa la clasificación de camiones, ver dataProcessor.js).
    function getShovelZones(shovels) {
        return (window.DataProcessor && window.DataProcessor.getShovelZones)
            ? window.DataProcessor.getShovelZones(shovels)
            : [];
    }

    // Holgura por el espacio de alineación/retroceso de los camiones al
    // vaciar la tolva.
    const DUMP_PADDING_METERS = 15;
    const CLUSTER_RADIUS = 250;
    // Puntos de descarga (chancadora o botadero: los datos no permiten
    // distinguirlos; el nombre se puede editar en Parámetros). En vez de
    // asumir un número fijo, se conserva cualquier grupo
    // con al menos este % de los eventos de descarga totales. Así, si otro
    // archivo tiene 1 o 3 puntos de descarga en vez de 2, se detectan igual.
    const MIN_CLUSTER_SHARE = 0.05;

    function getDumpClusters(trucks) {
        const dischargePoints = (trucks || []).filter(t => {
            const state = (t.ESTADO_OPERATIVO || t.state || '').toString().toUpperCase();
            const zone = (t.ZONA_OPERATIVA || '').toString().toUpperCase();
            const tolva = (t.Tolva || t.TOLVA || '').toString().toUpperCase();

            // Solo la descarga en sí (no la maniobra de estacionamiento previa,
            // que también lleva ZONA_DESCARGA pero ocurre fuera del punto).
            if (state === 'ESTACIONANDO') return false;
            return state === 'DESCARGANDO' || zone === 'ZONA_DESCARGA' || tolva === 'ARRIBA';
        });

        let clusters = [];

        dischargePoints.forEach(pt => {
            const { x, y } = (window.DataProcessor && window.DataProcessor.getGroundCoords)
                ? window.DataProcessor.getGroundCoords(pt)
                : { x: parseFloat(pt.X || 0), y: parseFloat(pt.Z || 0) };
            if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) return;

            let targetCluster = null;
            for (let c of clusters) {
                const dist = Math.hypot(x - c.centerX, y - c.centerY);
                if (dist <= CLUSTER_RADIUS) {
                    targetCluster = c;
                    break;
                }
            }

            if (targetCluster) {
                targetCluster.points.push({ x, y });
                targetCluster.centerX = targetCluster.points.reduce((s, p) => s + p.x, 0) / targetCluster.points.length;
                targetCluster.centerY = targetCluster.points.reduce((s, p) => s + p.y, 0) / targetCluster.points.length;
            } else {
                clusters.push({ centerX: x, centerY: y, points: [{ x, y }] });
            }
        });

        const totalPoints = dischargePoints.length || 1;
        clusters = clusters
            .filter(c => (c.points.length / totalPoints) >= MIN_CLUSTER_SHARE)
            .sort((a, b) => b.points.length - a.points.length);

        return clusters.map((cluster, idx) => {
            const bbox = computeBBox(cluster.points, DUMP_PADDING_METERS);
            return {
                id: `Descarga ${String(idx + 1).padStart(2, '0')}`,
                x: (bbox.minX + bbox.maxX) / 2,
                y: (bbox.minY + bbox.maxY) / 2,
                bbox,
                nPoints: cluster.points.length
            };
        });
    }

    function generateZonesFromData(trucks, shovels) {
        const shapes = [];
        const annotations = [];

        const shovelZones = getShovelZones(shovels);
        shovelZones.forEach(sz => {
            shapes.push(bboxPathShape(
                sz.bbox,
                'rgba(255, 210, 63, 0.12)',
                '#ffd23f',
                'dot',
                `Frente ${sz.id}`
            ));
            annotations.push({
                x: sz.x,
                y: sz.bbox.maxY + 14,
                text: `<b>FRENTE ${sz.id.toUpperCase()}</b>`,
                showarrow: false,
                font: { color: '#ffd23f', size: 11, family: 'JetBrains Mono' }
            });
        });

        const dumpClusters = getDumpClusters(trucks);
        const colors = ['#6ee7b7', '#38bdf8', '#f472b6', '#fb923c'];

        dumpClusters.forEach((dc, idx) => {
            const color = colors[idx % colors.length];
            shapes.push(bboxPathShape(
                dc.bbox,
                `${color}1F`,
                color,
                'solid',
                DataProcessor.dumpDisplayName(dc.id)
            ));
            annotations.push({
                x: dc.x,
                y: dc.bbox.maxY + 14,
                text: `<b>${DataProcessor.dumpDisplayName(dc.id).toUpperCase()}</b>`,
                showarrow: false,
                font: { color: color, size: 11, family: 'JetBrains Mono' }
            });
        });

        return { shapes, annotations, shovelZones, dumpClusters };
    }

    return { generateZonesFromData, getShovelZones, getDumpClusters };
})();