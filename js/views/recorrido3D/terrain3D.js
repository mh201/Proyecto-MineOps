// js/views/recorrido3D/terrain3D.js
// -----------------------------------------------------------------------------
// Superficie de rampas/bancos a partir de las posiciones GPS de camiones y palas.
//
// Por qué cambió el método (antes: IDW global sobre ~70 000 puntos, grilla 36x36):
//  1) IDW GLOBAL MEZCLABA BANCOS. Cada celda promediaba TODOS los puntos del
//     turno con peso 1/d². Un punto a 100 m pesa poco, pero hay miles; sumados
//     arrastraban la cota de una rampa hacia la de los bancos vecinos (a otra
//     altura), generando bultos y hundimientos donde la vía es pareja.
//  2) PUNTOS REPETIDOS. Un camión detenido 10 min en pala son 600 puntos en el
//     mismo lugar: ese sitio "tiraba" de toda la superficie cercana.
//  3) GRILLA GRUESA (~40 m por celda con 36 divisiones). Más ancha que la propia
//     vía, así que los bordes salían en escalera y las curvas se perdían.
//
// Método nuevo:
//  a) BINNING: los puntos se agrupan en celdas de `cellSize` m y cada celda toma
//     la MEDIANA de sus elevaciones. Cuenta cada lugar una sola vez, sin
//     importar cuánto tiempo estuvo un equipo ahí, y descarta valores atípicos.
//  b) SUAVIZADO LOCAL: cada nodo de la grilla promedia solo las celdas con dato
//     dentro de un radio corto (kernel gaussiano), ponderado además por cuántos
//     puntos tiene cada celda (confianza). No hay influencia de bancos lejanos.
//  c) MÁSCARA DE CORREDOR: los nodos sin datos a menos de `maxGap` m quedan
//     vacíos (null). La superficie solo existe donde hubo tránsito real: entre
//     un banco y otro no hay mediciones, así que no se inventa talud.
// Complejidad O(nodos × kernel) en vez de O(nodos × puntos): permite una grilla
// ~4 veces más fina en menos tiempo que antes.
// -----------------------------------------------------------------------------
window.Terrain3DEngine = (function () {

    const DEFAULTS = {
        cellSize: 10,      // m por celda (resolución de la superficie)
        kernelRadius: 2,   // celdas a cada lado consideradas en el suavizado
        sigma: 1.0,        // desviación del kernel gaussiano, en celdas
        maxGap: 20,        // m: más lejos que esto de un dato => sin superficie
        dropBelowRoad: 1.5 // m: la superficie se dibuja un poco bajo la vía para que los camiones queden visibles encima
    };

    // Misma convención que trajectories3D.js: X=Este, Z=Norte, Y=Elevación.
    function extractPoint(p) {
        const DP = window.DataProcessor;
        const ground = (DP && DP.getGroundCoords) ? DP.getGroundCoords(p) : { x: parseFloat(p.X), y: parseFloat(p.Z) };
        const elevation = (DP && DP.getElevation) ? DP.getElevation(p, null) : parseFloat(p.Y);
        if (!isFinite(ground.x) || !isFinite(ground.y) || (ground.x === 0 && ground.y === 0)) return null;
        if (elevation === null || !isFinite(elevation)) return null;
        return { x: ground.x, y: ground.y, z: elevation };
    }

    function median(arr) {
        arr.sort((a, b) => a - b);
        const m = arr.length >> 1;
        return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
    }

    function buildSurface(trucks, shovels, bounds, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const C = o.cellSize;
        const pad = C * (o.kernelRadius + 1);

        const minX = bounds.minX - pad, maxX = bounds.maxX + pad;
        const minY = bounds.minY - pad, maxY = bounds.maxY + pad;
        const nx = Math.max(2, Math.ceil((maxX - minX) / C) + 1);
        const ny = Math.max(2, Math.ceil((maxY - minY) / C) + 1);

        // --- a) Binning: lista de elevaciones por celda ----------------------
        const bins = new Map(); // idx -> number[]
        let nPoints = 0;
        const addRow = row => {
            const p = extractPoint(row);
            if (!p) return;
            const i = Math.round((p.x - minX) / C);
            const j = Math.round((p.y - minY) / C);
            if (i < 0 || j < 0 || i >= nx || j >= ny) return;
            const k = j * nx + i;
            let b = bins.get(k);
            if (!b) { b = []; bins.set(k, b); }
            b.push(p.z);
            nPoints++;
        };
        (trucks || []).forEach(addRow);
        (shovels || []).forEach(addRow);
        if (nPoints === 0) return null;

        const cellZ = new Float64Array(nx * ny).fill(NaN);
        const cellW = new Float64Array(nx * ny); // confianza (log del conteo)
        bins.forEach((vals, k) => {
            cellZ[k] = median(vals);
            cellW[k] = 1 + Math.log(vals.length); // 1 punto => 1; 600 puntos => ~7.4
        });

        // --- b) + c) Suavizado gaussiano local con máscara de corredor -------
        const R = o.kernelRadius;
        const kernel = [];
        for (let dj = -R; dj <= R; dj++) {
            for (let di = -R; di <= R; di++) {
                const d2 = di * di + dj * dj;
                if (d2 > (R + 0.5) * (R + 0.5)) continue;
                kernel.push({ di, dj, w: Math.exp(-d2 / (2 * o.sigma * o.sigma)), dist: Math.sqrt(d2) * C });
            }
        }

        const xGrid = new Array(nx), yGrid = new Array(ny), zGrid = new Array(ny);
        for (let i = 0; i < nx; i++) xGrid[i] = minX + i * C;
        for (let j = 0; j < ny; j++) yGrid[j] = minY + j * C;

        let zMin = Infinity, zMax = -Infinity;
        for (let j = 0; j < ny; j++) {
            const row = new Array(nx);
            for (let i = 0; i < nx; i++) {
                let sw = 0, sz = 0, nearest = Infinity;
                for (let q = 0; q < kernel.length; q++) {
                    const kk = kernel[q];
                    const ii = i + kk.di, jj = j + kk.dj;
                    if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
                    const z = cellZ[jj * nx + ii];
                    if (z !== z) continue; // NaN: celda sin datos
                    const w = kk.w * cellW[jj * nx + ii];
                    sw += w; sz += w * z;
                    if (kk.dist < nearest) nearest = kk.dist;
                }
                if (sw > 0 && nearest <= o.maxGap) {
                    const z = sz / sw - o.dropBelowRoad;
                    row[i] = z;
                    if (z < zMin) zMin = z;
                    if (z > zMax) zMax = z;
                } else {
                    row[i] = null;
                }
            }
            zGrid[j] = row;
        }

        return {
            uid: 'surface',
            type: 'surface',
            x: xGrid,
            y: yGrid,
            z: zGrid,
            connectgaps: false,
            cmin: zMin, cmax: zMax,
            colorscale: [
                [0.0, '#241207'],
                [0.3, '#4a2b14'],
                [0.6, '#7a4a24'],
                [0.85, '#a9713e'],
                [1.0, '#d6a56a']
            ],
            showscale: false,
            opacity: 0.55,
            lighting: { ambient: 0.7, diffuse: 0.8, specular: 0.05, roughness: 0.9, fresnel: 0.1 },
            lightposition: { x: 1000, y: -1000, z: 3000 },
            hovertemplate: 'Elevación: %{z:.1f} m<extra>Superficie</extra>',
            name: 'Superficie de Rampas'
        };
    }

    // Firma compatible con la anterior: el 4.º parámetro puede ser un número
    // (resolución antigua, se ignora) o un objeto de opciones.
    function generatePitSurfaceAsync(trucks, shovels, bounds, opts, callback) {
        const options = (opts && typeof opts === 'object') ? opts : {};
        setTimeout(() => {
            try {
                const t0 = performance.now();
                const trace = buildSurface(trucks, shovels, bounds, options);
                if (trace) console.info(`Superficie 3D: ${trace.x.length}x${trace.y.length} nodos en ${(performance.now() - t0).toFixed(0)} ms`);
                callback(null, trace);
            } catch (err) {
                console.error('Error al generar superficie 3D:', err);
                callback(err, null);
            }
        }, 20);
    }

    return { generatePitSurfaceAsync, buildSurface, DEFAULTS };
})();