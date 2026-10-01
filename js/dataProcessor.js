// js/dataProcessor.js

window.DataProcessor = window.DataProcessor || {};

DataProcessor.parseFile = function(file, callback) {
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = function(e) {
        try {
            let data = [];
            if (isExcel) {
                const dataBuffer = new Uint8Array(e.target.result);
                const workbook = XLSX.read(dataBuffer, { type: 'array', cellDates: false });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            } else {
                const text = e.target.result;
                const workbook = XLSX.read(text, { type: 'string', cellDates: false });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            }
            callback(null, data);
        } catch (err) {
            console.error("Error al procesar archivo:", err);
            callback("Error al leer el archivo. Asegúrate de que sea un formato .xlsx o .csv válido.", null);
        }
    };

    reader.onerror = function() {
        callback("Error de lectura del archivo en el navegador.", null);
    };

    if (isExcel) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
};

DataProcessor.extractMinutesFrom24HourFormat = function(val) {
    if (val === undefined || val === null || val === '') return null;

    if (val instanceof Date) {
        if (!isNaN(val.getTime())) {
            return val.getHours() * 60 + val.getMinutes();
        }
    }

    const strVal = String(val).trim();
    const timeMatch = strVal.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);

        if (hours === 24) return 1440;
        return (hours % 24) * 60 + minutes;
    }

    const parsedDate = new Date(strVal);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate.getHours() * 60 + parsedDate.getMinutes();
    }

    return null;
};

// Igual que extractMinutesFrom24HourFormat pero con resolución de segundos
// (segundo del día, 0-86399), sin ajuste por turno nocturno.
DataProcessor.extractClockSeconds = function(val) {
    if (val === undefined || val === null || val === '') return null;

    if (val instanceof Date) {
        if (!isNaN(val.getTime())) {
            return val.getHours() * 3600 + val.getMinutes() * 60 + val.getSeconds();
        }
    }

    const strVal = String(val).trim();
    const timeMatch = strVal.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10) % 24;
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        return hours * 3600 + minutes * 60 + seconds;
    }

    return null;
};

// ---------------------------------------------------------------------------
// RELOJ DE TURNO (turnos que cruzan medianoche)
// ---------------------------------------------------------------------------
// Los registros solo traen la hora (sin fecha). En un turno de 19:00 a 07:00,
// las 02:00 vienen DESPUÉS de las 23:00, pero como segundo del día son menores.
// Si los datos cruzan medianoche, SHIFT_PIVOT_SEC guarda la hora de inicio del
// turno y toda hora anterior a ella se interpreta como del día siguiente
// (+86400 s). Así ordenar, medir duraciones y animar funciona igual que en un
// turno diurno. Se configura al cargar los archivos (configureShiftClock).
DataProcessor.SHIFT_PIVOT_SEC = null;

DataProcessor.extractSecondsFrom24HourFormat = function(val) {
    const s = DataProcessor.extractClockSeconds(val);
    if (s === null) return null;
    const pivot = DataProcessor.SHIFT_PIVOT_SEC;
    return (pivot !== null && s < pivot) ? s + 86400 : s;
};

DataProcessor.configureShiftClock = function (rowSets) {
    const range = DataProcessor.getTimeRange(rowSets);
    DataProcessor.SHIFT_PIVOT_SEC = (range && range.wraps) ? range.startSec : null;
    return range;
};

// Convierte un segundo del día (0-86399) a la escala del turno actual.
DataProcessor.toShiftSeconds = function (clockSec) {
    const pivot = DataProcessor.SHIFT_PIVOT_SEC;
    return (pivot !== null && clockSec < pivot) ? clockSec + 86400 : clockSec;
};

DataProcessor.calculateDistanceMeters = function(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
};

// ---------------------------------------------------------------------------
// SANEAMIENTO DE "Vehiculo" PARA CAMIONES.
// En vehicle_positions el nombre real del camión es del tipo "930E 17" (flota
// Komatsu 930E, con espacio antes del número de unidad). ALGUNOS archivos de
// origen guardan ese nombre sin el espacio ("930E17"), y ahí Excel lo
// autodetecta como notación científica al exportar, convirtiéndolo en un
// número gigante (930 × 10^17, etc.) -- eso fue lo que se vio en el primer
// archivo de prueba, donde los 14 valores calzaban exactos con ese patrón.
// PERO cuando el nombre SÍ trae el espacio ("930E 17"), no hay corrupción:
// hay que dejarlo tal cual.
//
// La verificación tiene que ser con Number(), no con parseFloat(): parseFloat
// es permisivo y trunca en el primer carácter inválido, así que
// parseFloat("930E 17") devuelve 930 (ignora " 17") -- con eso, CUALQUIER
// camión "930E xx" calculaba el mismo valor reconstruido y todos se
// colapsaban en un solo ID. Number() exige que el string COMPLETO sea un
// número válido: Number("930E 17") es NaN, así que con Number() el valor se
// deja intacto, y sólo se reconstruye cuando el dato realmente es 100%
// numérico (ya sea un number nativo del Excel corrupto, o un string sin
// espacio que representa exactamente esa notación).
DataProcessor.normalizeVehicleId = function(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return rawValue;
    const num = Number(rawValue);
    if (isNaN(num) || num <= 0) return rawValue;

    const nn = Math.log10(num / 930);
    const nnRounded = Math.round(nn);
    if (nnRounded >= 0 && nnRounded <= 99 && Math.abs(nn - nnRounded) < 1e-6) {
        return `930E ${String(nnRounded).padStart(2, '0')}`;
    }
    return rawValue;
};

DataProcessor.normalizeVehicleIds = function(rows) {
    (rows || []).forEach(r => {
        if (r.Vehiculo !== undefined) r.Vehiculo = DataProcessor.normalizeVehicleId(r.Vehiculo);
    });
};

// Vista previa para la UI de "Cargar y Filtrar": lista de camiones distintos
// detectados en el archivo crudo (ya con el nombre reconstruido) junto con su
// cantidad de filas, SIN mutar los datos originales -- se necesita antes de
// hacer clic en "Procesar", momento en el que recién se llama a applyFilters.
DataProcessor.getDistinctVehicleIds = function(rawData) {
    const counts = {}, first = {}, last = {};
    (rawData || []).forEach(r => {
        if (r.Vehiculo === undefined) return;
        const id = DataProcessor.normalizeVehicleId(r.Vehiculo);
        counts[id] = (counts[id] || 0) + 1;
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t !== null) {
            if (first[id] === undefined || t < first[id]) first[id] = t;
            if (last[id] === undefined || t > last[id]) last[id] = t;
        }
    });
    return Object.keys(counts)
        .map(id => ({ id, count: counts[id], firstSec: first[id] ?? null, lastSec: last[id] ?? null }))
        .sort((a, b) => b.count - a.count);
};

// ---------------------------------------------------------------------------
// CONVENCIÓN DE EJES DE LOS ARCHIVOS CRUDOS (motor tipo Unity / "Y-up"):
//   X = Este (horizontal)
//   Y = Elevación (vertical) -> rango chico (decenas de metros)
//   Z = Norte (horizontal)   -> rango grande (cientos/miles de metros)
// Es decir: el plano en planta (mapa 2D) se arma con X y Z, NO con X e Y.
// La elevación real para las vistas 3D/perfil está en la columna Y.
// Toda lectura de coordenadas de piso (2D) debe pasar por getGroundCoords.
// ---------------------------------------------------------------------------
DataProcessor.getGroundCoords = function(row) {
    if (!row) return { x: 0, y: 0 };
    const rawX = row.X ?? row.LONGITUD ?? row.lon ?? 0;
    const rawY = row.Z ?? row.LATITUD ?? row.lat ?? 0; // "Norte" real = columna Z
    const x = parseFloat(rawX);
    const y = parseFloat(rawY);
    return {
        x: (isNaN(x) || !isFinite(x)) ? 0 : x,
        y: (isNaN(y) || !isFinite(y)) ? 0 : y
    };
};

DataProcessor.getElevation = function(row, fallback = -200) {
    if (!row) return fallback;
    const rawZ = row.Y ?? row.ELEVACION ?? row.ALTITUD ?? row.COTA ?? fallback;
    const z = parseFloat(rawZ);
    return (isNaN(z) || !isFinite(z)) ? fallback : z;
};

// ---------------------------------------------------------------------------
// UTILIDADES DE GEOCERCA (compartidas entre clasificación y dibujo de zonas).
// Se centralizan aquí para que la zona usada para decidir "el camión está en
// la pala" (clasificación) sea EXACTAMENTE la misma que la que se dibuja en el
// mapa 2D — antes eran dos cosas distintas (un radio fijo de 120 m para
// clasificar vs. una caja por percentiles para dibujar), y por eso un camión
// podía verse claramente fuera del recuadro dibujado y aun así clasificarse
// como si estuviera en la pala.
// ---------------------------------------------------------------------------
DataProcessor.getPercentile = function(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

// Caja delimitadora a partir del percentil 5-95 de los puntos reales (ignora
// saltos de GPS puntuales) más una holgura fija en metros. Se adapta al
// movimiento real de cada pala/chancadora en vez de usar un tamaño fijo para
// todas, y por lo tanto funciona igual con otro archivo .xlsx donde las
// palas o chancadoras tengan otra disposición.
DataProcessor.computeBBox = function(points, paddingMeters) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
        minX: DataProcessor.getPercentile(xs, 0.05) - paddingMeters,
        maxX: DataProcessor.getPercentile(xs, 0.95) + paddingMeters,
        minY: DataProcessor.getPercentile(ys, 0.05) - paddingMeters,
        maxY: DataProcessor.getPercentile(ys, 0.95) + paddingMeters
    };
};

DataProcessor.isInsideBBox = function(x, y, bbox) {
    return !!bbox && x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY;
};

// Holgura por el radio de giro del brazo/balde de la pala y el espacio de
// maniobra de los camiones alrededor de ella.
DataProcessor.SHOVEL_PADDING_METERS = 25;

// Zonas de pala en forma de caja (bbox), usadas TANTO para dibujar el "frente"
// en el mapa COMO para decidir si un camión está en la pala al clasificar.
DataProcessor.getShovelZones = function(shovelsRaw, paddingMeters) {
    const padding = paddingMeters !== undefined ? paddingMeters : DataProcessor.SHOVEL_PADDING_METERS;
    return DataProcessor.getShovelPointGroups(shovelsRaw)
        .filter(g => g.points.length > 0)
        .map(g => {
            const bbox = DataProcessor.computeBBox(g.points, padding);
            return {
                id: g.label,
                x: (bbox.minX + bbox.maxX) / 2,
                y: (bbox.minY + bbox.maxY) / 2,
                bbox
            };
        });
};

// Agrupa las filas crudas de palas por pala física (ver nota sobre Cliente abajo)
// y devuelve, por cada una, TODOS sus puntos (no solo el promedio). Es la base
// tanto de getShovelReferencePoints (para clasificar camiones) como de las cajas
// de zona en zones.js (para dibujar el "frente" con el tamaño real de cada pala).
//
// OJO: en estos archivos "Vehiculo" NO identifica de forma única cada pala física
// (las dos palas del tajo aparecen con el mismo nombre de modelo, p.ej. "CAT 7495"),
// pero "Cliente" (el operador/turno asignado a esa máquina) sí separa correctamente
// cada pala física, porque cada una la opera un trabajador/código distinto. Por eso
// se agrupa primero por Cliente, y sólo se cae a Vehiculo/EQUIPO/id si no hay Cliente.
DataProcessor.getShovelPointGroups = function(shovelsRaw) {
    if (!shovelsRaw || shovelsRaw.length === 0) return [];

    const groups = {};
    for (let i = 0; i < shovelsRaw.length; i++) {
        const s = shovelsRaw[i];
        const displayName = s.Vehiculo || s.EQUIPO || s.id || 'Pala';
        const hasCliente = s.Cliente !== undefined && s.Cliente !== null && s.Cliente !== '';
        const groupKey = hasCliente ? `CLIENTE_${s.Cliente}` : displayName;

        const { x, y } = DataProcessor.getGroundCoords(s);
        if (isNaN(x) || isNaN(y)) continue;

        if (!groups[groupKey]) groups[groupKey] = { key: groupKey, displayName, points: [] };
        groups[groupKey].points.push({ x, y });
    }

    // Si dos o más grupos comparten el mismo nombre de máquina (mismo modelo), se
    // numeran para poder distinguirlos en la leyenda y las etiquetas del mapa.
    const entries = Object.values(groups);
    const nameCounts = {};
    entries.forEach(g => { nameCounts[g.displayName] = (nameCounts[g.displayName] || 0) + 1; });

    const usedIndex = {};
    entries.forEach(g => {
        if (nameCounts[g.displayName] > 1) {
            usedIndex[g.displayName] = (usedIndex[g.displayName] || 0) + 1;
            g.label = `${g.displayName} #${usedIndex[g.displayName]}`;
        } else {
            g.label = g.displayName;
        }
    });

    return entries;
};

// Devuelve una función (fila de pala) -> etiqueta distinguible ("CAT 7495 #1",
// "CAT 7495 #2", ...), usando el mismo agrupamiento por Cliente que las demás
// funciones de pala. Sirve para que la animación 2D/3D muestre una etiqueta
// consistente con las zonas dibujadas, en vez de repetir el mismo nombre de
// modelo para las dos palas.
DataProcessor.getShovelLabelResolver = function(shovelsRaw) {
    const groups = DataProcessor.getShovelPointGroups(shovelsRaw);
    const labelByKey = {};
    groups.forEach(g => { labelByKey[g.key] = g.label; });

    return function(row) {
        const displayName = row.Vehiculo || row.EQUIPO || row.id || 'Pala';
        const hasCliente = row.Cliente !== undefined && row.Cliente !== null && row.Cliente !== '';
        const groupKey = hasCliente ? `CLIENTE_${row.Cliente}` : displayName;
        return labelByKey[groupKey] || displayName;
    };
};

// Genera un mapa rápido de ubicaciones medias de las palas para la geocerca de carga.
DataProcessor.getShovelReferencePoints = function(shovelsRaw) {
    return DataProcessor.getShovelPointGroups(shovelsRaw).map(g => {
        const n = g.points.length;
        const sumX = g.points.reduce((s, p) => s + p.x, 0);
        const sumY = g.points.reduce((s, p) => s + p.y, 0);
        return { id: g.label, x: sumX / n, y: sumY / n };
    });
};

// Calcula, por cada camión (Vehiculo) y en orden cronológico, cuánto cambió el
// "Llenado" respecto del registro anterior. Deja el resultado en cada fila como
// __llenadoDelta, para que classifyZoneAndState pueda distinguir "está subiendo
// el llenado" (cargando) de "está bajando" (descargando) en vez de adivinarlo
// sólo por la posición. Muta las filas en el arreglo recibido.
DataProcessor.computeLlenadoTrend = function(rows) {
    if (!rows || rows.length === 0) return;

    const groups = {};
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.Llenado === undefined && r.LLENADO === undefined) continue;
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        if (!groups[id]) groups[id] = [];
        groups[id].push(r);
    }

    Object.values(groups).forEach(group => {
        group.sort((a, b) => {
            const ta = DataProcessor.extractSecondsFrom24HourFormat(a.Tiempo || a.FECHA_HORA || a.HORA || a.TIMESTAMP) ?? 0;
            const tb = DataProcessor.extractSecondsFrom24HourFormat(b.Tiempo || b.FECHA_HORA || b.HORA || b.TIMESTAMP) ?? 0;
            return ta - tb;
        });

        let prevLlenado = null;
        group.forEach(r => {
            const current = parseFloat(r.Llenado !== undefined ? r.Llenado : r.LLENADO);
            if (isNaN(current)) {
                r.__llenadoDelta = 0;
                return;
            }
            r.__llenadoDelta = (prevLlenado === null) ? 0 : (current - prevLlenado);
            prevLlenado = current;
        });
    });
};

// Clasifica cada registro de camión en una zona + estado operativo.
//
// Antes esto se decidía SOLO por geometría (distancia a la pala + velocidad),
// ignorando por completo "Tolva" y "Llenado". Eso funcionaba la mayoría de las
// veces por coincidencia (cargar ocurre cerca de la pala, descargar lejos de
// ella), pero fallaba en casos reales del propio archivo:
//   - Un camión detenido en la vía (cola, cruce, espera) quedaba marcado como
//     DESCARGANDO solo por no estar cerca de una pala y tener velocidad ~0.
//   - Un camión haciendo cola en el frente de carga (Llenado aún en 0, todavía
//     no le toca su turno) ya quedaba marcado como CARGANDO.
//
// Con los datos reales se confirma exactamente la lógica que describiste:
//   - Cargando: velocidad ~0 cerca de una pala y el Llenado SUBE progresivamente
//     (pases sucesivos del balde) hasta 100.
//   - Descargando: la Tolva pasa a "Arriba" y el Llenado CAE de ~100 a 0 en
//     pocos segundos, siempre en el mismo punto físico (chancadora/botadero).
// "Tolva" es la señal más directa y confiable para descarga (es literalmente el
// sensor de la tolva levantada), así que se prioriza sobre la geometría; la
// posición dentro de la caja de la pala sigue usando para decidir CARGANDO vs.
// ESPERA_EN_PALA.
//
// shovelZones debe venir de DataProcessor.getShovelZones (cajas por percentil),
// NO de un radio fijo: con un radio de 120 m alrededor del punto promedio de
// cada pala, ~48% de los registros "en zona de pala" caían fuera del recuadro
// que realmente se dibuja en el mapa (la vía de acarreo pasa cerca del punto
// promedio sin llegar al frente real). Usar la misma caja para clasificar y
// para dibujar elimina esa discrepancia.
DataProcessor.classifyZoneAndState = function(row, shovelZones) {
    const { x, y } = DataProcessor.getGroundCoords(row);
    const speed = parseFloat(row.Velocidad || row.VELOCIDAD || row.speed || 0);
    const tolva = (row.Tolva || row.TOLVA || '').toString().trim().toUpperCase();
    const llenadoDelta = row.__llenadoDelta || 0;

    const STOPPED_SPEED_THRESHOLD = 1;
    const LLENADO_CHANGE_THRESHOLD = 0.5; // margen para no confundir estabilidad con ruido de sensor

    let nearShovel = false;
    if (shovelZones && shovelZones.length > 0) {
        for (let i = 0; i < shovelZones.length; i++) {
            if (DataProcessor.isInsideBBox(x, y, shovelZones[i].bbox)) {
                nearShovel = true;
                break;
            }
        }
    }

    const isStopped = speed < STOPPED_SPEED_THRESHOLD;
    const tolvaArriba = tolva === 'ARRIBA';
    const isLoadingUp = llenadoDelta > LLENADO_CHANGE_THRESHOLD;
    const isDumpingDown = llenadoDelta < -LLENADO_CHANGE_THRESHOLD;

    let zone;
    let state;

    if (tolvaArriba || isDumpingDown) {
        // Tolva levantada y/o el llenado está cayendo: vaciando material.
        zone = 'ZONA_DESCARGA';
        state = 'DESCARGANDO';
    } else if (nearShovel && isStopped && isLoadingUp) {
        // Detenido en el frente y el llenado sube: pase de balde en curso.
        // (requiere estar detenido: cargar no ocurre en movimiento)
        zone = 'ZONA_CARGA';
        state = 'CARGANDO';
    } else if (nearShovel) {
        // En el frente pero el llenado no se mueve: maniobrando o en cola.
        zone = 'ZONA_CARGA';
        state = 'ESPERA_EN_PALA';
    } else if (isStopped) {
        // Detenido fuera del frente y sin señal de descarga: parado en ruta.
        zone = 'RUTA_TRANSITO';
        state = 'DETENIDO_EN_RUTA';
    } else {
        zone = 'RUTA_TRANSITO';
        state = 'EN_TRANSITO';
    }

    return { zone, state };
};

DataProcessor.generateDemoData = function() {
    const trucks = [];
    const shovels = [
        { Vehiculo: "CAT 7495", Tiempo: "17:15:00", X: -386.34, Y: 134.83, Z: -315.3, Velocidad: 0 },
        { Vehiculo: "P&H 4100", Tiempo: "17:15:00", X: -380.00, Y: 140.00, Z: -315.0, Velocidad: 0 }
    ];
    const materials = ["Mineral Alta Ley", "Mineral Baja Ley", "Desmonte"];
    const truckIds = ["930E 17", "930E 18", "930E 19", "CAT-797-01", "KOM-930-01"];

    for (let i = 0; i < 200; i++) {
        const id = truckIds[i % truckIds.length];
        const material = materials[i % materials.length];
        const speed = Math.floor(Math.random() * 30);

        const factor = (i % 20) / 20.0;
        const lat = 223.04 + (10 * factor);
        const lon = 68.17 + (10 * factor);

        const hourStr = String(17 + Math.floor(i / 60)).padStart(2, '0');
        const minStr = String(i % 60).padStart(2, '0');

        trucks.push({
            Vehiculo: id,
            Tiempo: `${hourStr}:${minStr}:00`,
            X: lon,
            Y: lat,
            Z: -205.79,
            Velocidad: speed,
            MATERIAL: material,
            Tolva: speed === 0 ? "Arriba" : "Abajo"
        });
    }

    return { trucks, shovels };
};

// ---------------------------------------------------------------------------
// TIEMPO: rango de los datos e intervalos de guardia
// ---------------------------------------------------------------------------
DataProcessor.rowTimeValue = function (r) {
    return r.Tiempo || r.FECHA_HORA || r.HORA || r.FECHA || r.TIMESTAMP || r.timestamp;
};

// ¿El minuto del día cae en alguno de los intervalos? Soporta intervalos que
// cruzan medianoche (inicio > fin, p. ej. 19:00 a 07:00).
DataProcessor.isMinuteInIntervals = function (minute, intervals) {
    if (!intervals || intervals.length === 0) return true;
    for (let k = 0; k < intervals.length; k++) {
        const it = intervals[k];
        if (!it.start || !it.end) return true;
        const [sh, sm] = it.start.split(':').map(Number);
        const [eh, em] = it.end.split(':').map(Number);
        const a = sh * 60 + sm, b = eh * 60 + em;
        if (a <= b ? (minute >= a && minute <= b) : (minute >= a || minute <= b)) return true;
    }
    return false;
};

// Rango horario real de uno o más conjuntos de registros. Busca el hueco más
// grande del día (circular): si el turno cruza medianoche (19:00 -> 07:00) el
// rango sale como 19:00 a 07:00 y no como 00:00 a 23:59.
DataProcessor.getTimeRange = function (rowSets) {
    const seen = new Uint8Array(86400);
    let total = 0;
    (rowSets || []).forEach(rows => (rows || []).forEach(r => {
        const t = DataProcessor.extractClockSeconds(DataProcessor.rowTimeValue(r));
        if (t === null) return;
        seen[t % 86400] = 1;
        total++;
    }));
    const u = [];
    for (let i = 0; i < 86400; i++) if (seen[i]) u.push(i);
    if (u.length === 0) return null;

    let gap = u[0] + 86400 - u[u.length - 1], startSec = u[0], endSec = u[u.length - 1];
    for (let i = 0; i + 1 < u.length; i++) {
        const g = u[i + 1] - u[i];
        if (g > gap) { gap = g; startSec = u[i + 1]; endSec = u[i]; }
    }
    const durationSec = endSec >= startSec ? endSec - startSec : endSec + 86400 - startSec;
    return { startSec, endSec, wraps: endSec < startSec, durationSec, records: total };
};

// Registros por minuto del día (para contar al vuelo cuántos quedan dentro de
// los intervalos mientras el usuario los edita).
DataProcessor.minuteHistogram = function (rows) {
    const h = new Uint32Array(1440);
    (rows || []).forEach(r => {
        const m = DataProcessor.extractMinutesFrom24HourFormat(DataProcessor.rowTimeValue(r));
        if (m !== null) h[((m % 1440) + 1440) % 1440]++;
    });
    return h;
};

DataProcessor.countInIntervals = function (hist, intervals) {
    let n = 0;
    for (let m = 0; m < 1440; m++) if (hist[m] && DataProcessor.isMinuteInIntervals(m, intervals)) n += hist[m];
    return n;
};

// Palas: solo se recortan por intervalo de guardia. No pasan por la
// clasificación de estados de camión (no aplica a una pala) ni por el filtro
// de "inoperativos": una pala casi no se traslada y podía quedar descartada
// por "velocidad cero".
DataProcessor.applyShovelFilters = function (data, filters) {
    if (!data || !Array.isArray(data)) return [];
    const intervals = (filters && filters.timeIntervals) || [];
    if (intervals.length === 0) return data.slice();
    return data.filter(r => {
        const m = DataProcessor.extractMinutesFrom24HourFormat(DataProcessor.rowTimeValue(r));
        return m === null || DataProcessor.isMinuteInIntervals(m, intervals);
    });
};

// El procesamiento está escrito como generador: cada `yield` informa el avance
// (0-1). applyFilters lo ejecuta de corrido; applyFiltersAsync cede el control
// al navegador entre pasos, para que la pantalla no se congele y la barra de
// progreso muestre el avance real.
DataProcessor._applyFiltersSteps = function* (data, filters) {
    if (!data || !Array.isArray(data)) return [];

    // Reconstruye IDs de camión mangled por Excel (ver nota más arriba) antes
    // de cualquier agrupación por Vehiculo, para que TODO lo que sigue (tablas,
    // KPIs por camión, animaciones) vea ya el nombre legible.
    DataProcessor.normalizeVehicleIds(data);
    yield 0.05;

    // Cajas por percentil (las mismas que se dibujan como "Frente" en el mapa),
    // no un radio fijo — ver nota en classifyZoneAndState.
    const shovelZones = DataProcessor.getShovelZones(AppState.shovelData || []);

    // Necesario para que classifyZoneAndState sepa si el Llenado está subiendo
    // (cargando) o bajando (descargando) en vez de adivinarlo solo por posición.
    DataProcessor.computeLlenadoTrend(data);
    yield 0.25;

    const truckActivity = {};
    if (filters.excludeInactive) {
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            const id = item.Vehiculo || item.EQUIPO || item.id;
            const speed = parseFloat(item.Velocidad !== undefined ? item.Velocidad : (item.VELOCIDAD || 0));

            if (!truckActivity[id]) {
                truckActivity[id] = { totalPoints: 0, movingPoints: 0, maxSpeed: 0 };
            }
            truckActivity[id].totalPoints++;
            if (speed > 1) {
                truckActivity[id].movingPoints++;
            }
            if (speed > truckActivity[id].maxSpeed) {
                truckActivity[id].maxSpeed = speed;
            }
        }
    }

    const result = [];
    // Todas las filas ya clasificadas (aunque queden fuera del intervalo de
    // tiempo), para consolidar los episodios de carga completos antes de
    // recortar: así una carga que cruza el borde del intervalo no se corta.
    const classified = [];

    const CHUNK = 5000;
    for (let i = 0; i < data.length; i++) {
        if (i > 0 && i % CHUNK === 0) yield 0.3 + 0.4 * (i / data.length);
        const item = data[i];
        const id = item.Vehiculo || item.EQUIPO || item.id;

        if (filters.excludeInactive && truckActivity[id]) {
            const stats = truckActivity[id];
            const isFullyInactive = stats.maxSpeed <= 1 || (stats.movingPoints / stats.totalPoints < 0.02);
            if (isFullyInactive) {
                continue;
            }
        }

        // classifyZoneAndState ya decide DETENIDO_EN_RUTA vs. EN_TRANSITO
        // internamente usando Tolva/Llenado, así que aquí solo se traspasa.
        const classification = DataProcessor.classifyZoneAndState(item, shovelZones);
        item.ZONA_OPERATIVA = classification.zone;
        item.ESTADO_OPERATIVO = classification.state;

        if (filters.excludedTrucks && filters.excludedTrucks.length > 0) {
            if (filters.excludedTrucks.includes(id)) continue;
        }

        if (filters.timeIntervals && filters.timeIntervals.length > 0) {
            const itemMinutes = DataProcessor.extractMinutesFrom24HourFormat(DataProcessor.rowTimeValue(item));
            if (itemMinutes !== null && !DataProcessor.isMinuteInIntervals(itemMinutes, filters.timeIntervals)) {
                classified.push(item);
                continue;
            }
        }

        classified.push(item);
        result.push(item);
    }

    // Corrige CARGANDO/ESPERA_EN_PALA con la secuencia completa de cada camión
    // (las filas se modifican en el lugar, así que `result` ya sale corregido).
    yield 0.72;
    DataProcessor.consolidateLoadingEpisodes(classified);
    yield 0.88;
    // Maniobra en reversa para cuadrarse en la pala o en la descarga.
    DataProcessor.markSpotting(classified, shovelZones);
    yield 1;

    return result;
};

DataProcessor.applyFilters = function (data, filters) {
    const it = DataProcessor._applyFiltersSteps(data, filters);
    let step = it.next();
    while (!step.done) step = it.next();
    return step.value;
};

// Igual que applyFilters, pero sin bloquear la pantalla. onProgress(0..1).
DataProcessor.applyFiltersAsync = function (data, filters, onProgress) {
    return new Promise((resolve, reject) => {
        const it = DataProcessor._applyFiltersSteps(data, filters);
        function run() {
            try {
                const t0 = performance.now();
                let step = it.next();
                // Varios pasos por tanda mientras quepan en ~30 ms.
                while (!step.done && performance.now() - t0 < 30) {
                    if (onProgress) onProgress(step.value);
                    step = it.next();
                }
                if (step.done) { if (onProgress) onProgress(1); resolve(step.value); }
                else { if (onProgress) onProgress(step.value); setTimeout(run, 0); }
            } catch (err) { reject(err); }
        }
        setTimeout(run, 0);
    });
};

// ---------------------------------------------------------------------------
// ESTACIONANDO (maniobra en reversa)
// ---------------------------------------------------------------------------
// El camión se cuadra en reversa (Direccion = "R") para quedar en posición de
// carga junto a la pala o de descarga en la chancadora. En el turno de prueba
// el ~93 % del tiempo moviéndose en reversa ocurre a menos de 80 m de una
// pala o de un punto de descarga, así que la reversa en movimiento cerca de
// esos lugares se marca como ESTACIONANDO (antes caía en "Espera en pala" o
// "En tránsito"). No se toca CARGANDO ni DESCARGANDO: un reacomodo en
// reversa entre pases sigue siendo parte de la carga.
// Las pausas cortas (<= 8 s) dentro de la misma maniobra también cuentan.
DataProcessor.SPOTTING_RULES = {
    minSpeed: 0.5,       // km/h moviéndose en reversa
    nearShovelM: 60,     // margen alrededor del recuadro de la pala
    nearDumpM: 80,       // radio alrededor de cada punto de descarga
    maxPauseSec: 8       // pausa máxima dentro de una misma maniobra
};

DataProcessor.markSpotting = function (rows, shovelZones) {
    const R = DataProcessor.SPOTTING_RULES;
    const isReverse = r => (r.Direccion || r.DIRECCION || '').toString().trim().toUpperCase().startsWith('R');
    const locked = st => st === 'CARGANDO' || st === 'DESCARGANDO';

    // Puntos de descarga: centro de cada descarga detectada (rachas de DESCARGANDO).
    const byTruck = {};
    (rows || []).forEach(r => {
        const t = DataProcessor.extractSecondsFrom24HourFormat(DataProcessor.rowTimeValue(r));
        if (t === null) return;
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        (byTruck[id] = byTruck[id] || []).push({ r, t, g: DataProcessor.getGroundCoords(r) });
    });
    const dumpSites = [];
    Object.values(byTruck).forEach(list => {
        list.sort((a, b) => a.t - b.t);
        let cur = null;
        list.forEach(p => {
            if (p.r.ESTADO_OPERATIVO === 'DESCARGANDO') {
                if (cur && p.t - cur.lastT <= 10) { cur.sx += p.g.x; cur.sy += p.g.y; cur.n++; cur.lastT = p.t; }
                else { if (cur) dumpSites.push({ x: cur.sx / cur.n, y: cur.sy / cur.n }); cur = { sx: p.g.x, sy: p.g.y, n: 1, lastT: p.t }; }
            }
        });
        if (cur) dumpSites.push({ x: cur.sx / cur.n, y: cur.sy / cur.n });
    });

    const nearShovel = g => (shovelZones || []).some(z => z.bbox &&
        g.x >= z.bbox.minX - R.nearShovelM && g.x <= z.bbox.maxX + R.nearShovelM &&
        g.y >= z.bbox.minY - R.nearShovelM && g.y <= z.bbox.maxY + R.nearShovelM);
    const nearDump = g => dumpSites.some(d => Math.hypot(d.x - g.x, d.y - g.y) <= R.nearDumpM);

    Object.values(byTruck).forEach(list => {
        const marked = [];
        list.forEach((p, k) => {
            const r = p.r;
            if (locked(r.ESTADO_OPERATIVO) || !isReverse(r)) return;
            const v = parseFloat(r.Velocidad || r.VELOCIDAD || r.speed || 0) || 0;
            if (v < R.minSpeed) return;
            let zone = null;
            if (nearShovel(p.g)) zone = 'ZONA_CARGA';
            else if (nearDump(p.g)) zone = 'ZONA_DESCARGA';
            if (!zone) return;
            r.ESTADO_OPERATIVO = 'ESTACIONANDO';
            r.ZONA_OPERATIVA = zone;
            marked.push(k);
        });
        // Pausas cortas en medio de la maniobra.
        for (let m = 1; m < marked.length; m++) {
            const a = marked[m - 1], b = marked[m];
            if (b - a < 2 || list[b].t - list[a].t > R.maxPauseSec) continue;
            for (let k = a + 1; k < b; k++) {
                const r = list[k].r;
                if (locked(r.ESTADO_OPERATIVO)) continue;
                r.ESTADO_OPERATIVO = 'ESTACIONANDO';
                r.ZONA_OPERATIVA = list[a].r.ZONA_OPERATIVA;
            }
        }
    });
};

// ---------------------------------------------------------------------------
// EPISODIOS DE CARGA Y PASES
// ---------------------------------------------------------------------------
// classifyZoneAndState mira cada registro por separado: marca CARGANDO solo en
// el segundo exacto en que el Llenado sube. Pero un pase de balde sube el
// Llenado de golpe (1 registro) y entre pase y pase pasan ~20-60 s con el
// Llenado quieto, así que el camión alternaba CARGANDO -> ESPERA_EN_PALA ->
// CARGANDO... Eso además inflaba los viajes de Productividad: cada pase se
// contaba como un viaje (142 "viajes" en el turno de prueba, cuando hubo ~55
// cargas reales).
//
// Lo que muestran los datos reales:
//   - Un pase sube el Llenado ~33.9 % (3 pases llenan un 930E con la CAT 7495).
//     A veces el sensor registra el mismo pase en 2 lecturas seguidas (p. ej.
//     14.4 + 19.5 con 1 s de diferencia): incrementos a <= 5 s son UN pase.
//   - Entre pases distintos pasan >= 18 s.
//   - Resultado en el turno de prueba: 48 cargas, 43 de ellas de 3 pases.
//
// Reglas de esta función, por camión y en orden cronológico:
//   1) CARGA = desde el primer pase hasta que el camión parte (primer registro
//      con velocidad >= 1 km/h después del último pase). Todo ese intervalo es
//      CARGANDO, aunque el Llenado esté quieto entre pases.
//   2) Los pases siguen siendo de la misma carga si no hubo descarga entre
//      ellos, no pasaron más de 10 min y el camión no se alejó más de 120 m.
//   3) Antes del primer pase, en el frente: ESPERA_EN_PALA (cola/cuadrado).
//   4) Después de partir, o si el camión ya está cargado (Llenado >= 90 %),
//      estar dentro del recuadro de la pala NO es esperar pala: se marca
//      EN_TRANSITO (o DETENIDO_EN_RUTA si está detenido).
// Cada fila de una carga recibe __pase (pases hechos hasta ese momento),
// __pasesTotal y __cargaId, que usan la animación y Productividad.
DataProcessor.LOADING_RULES = {
    riseThreshold: 0.5,     // % de Llenado: subida mínima que cuenta como pase
    passMergeSec: 5,        // subidas a <= 5 s = mismo pase (lectura partida)
    maxReadingGapSec: 60,   // subidas entre lecturas más separadas no se cuentan
    maxPassGapSec: 600,     // pases más separados que esto = cargas distintas
    maxLoadRadiusM: 120,    // si se aleja más que esto entre pases, ya partió
    stoppedSpeed: 1,        // km/h
    loadedThreshold: 90     // % de Llenado: camión ya cargado
};

DataProcessor.consolidateLoadingEpisodes = function (rows) {
    const R = DataProcessor.LOADING_RULES;
    const byTruck = {};
    (rows || []).forEach(r => {
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t === null) return;
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        if (!byTruck[id]) byTruck[id] = [];
        const g = DataProcessor.getGroundCoords(r);
        const L = parseFloat(r.Llenado !== undefined ? r.Llenado : r.LLENADO);
        byTruck[id].push({
            r, t, x: g.x, y: g.y, L: isNaN(L) ? null : L,
            v: parseFloat(r.Velocidad || r.VELOCIDAD || r.speed || 0) || 0
        });
    });

    let loadSeq = 0;
    Object.keys(byTruck).forEach(id => {
        const s = byTruck[id].sort((a, b) => a.t - b.t);
        const n = s.length;

        // --- Pases: subidas del Llenado, agrupando lecturas partidas --------
        const passes = [];
        for (let k = 1; k < n; k++) {
            if (s[k].L === null || s[k - 1].L === null) continue;
            if (s[k].L - s[k - 1].L <= R.riseThreshold) continue;
            // Subida a través de un hueco de datos (el camión se cargó mientras
            // no reportaba): no se sabe cuándo ocurrió, no se cuenta como pase.
            if (s[k].t - s[k - 1].t > R.maxReadingGapSec) continue;
            const last = passes[passes.length - 1];
            if (last && s[k].t - s[last.end].t <= R.passMergeSec) {
                last.end = k;
            } else {
                passes.push({ start: k, end: k });
            }
        }
        if (passes.length === 0) { reclassifyIdle(s, 0, n - 1); return; }

        // --- Cargas: pases consecutivos sin descarga ni alejamiento ---------
        const loads = [];
        passes.forEach(p => {
            const cur = loads[loads.length - 1];
            let sameLoad = false;
            if (cur) {
                const prevEnd = cur.passes[cur.passes.length - 1].end;
                sameLoad = (s[p.start].t - s[prevEnd].t) <= R.maxPassGapSec;
                for (let k = prevEnd + 1; sameLoad && k < p.start; k++) {
                    const dropped = s[k].L !== null && s[k - 1].L !== null && (s[k - 1].L - s[k].L) > 2;
                    const away = Math.hypot(s[k].x - cur.ax, s[k].y - cur.ay) > R.maxLoadRadiusM;
                    if (dropped || away) sameLoad = false;
                }
            }
            if (sameLoad) cur.passes.push(p);
            else loads.push({ passes: [p], ax: s[p.start].x, ay: s[p.start].y });
        });

        // --- Marcar filas ----------------------------------------------------
        let cursor = 0;
        loads.forEach(load => {
            const first = load.passes[0].start;
            let end = load.passes[load.passes.length - 1].end;
            // Después del último pase sigue cargando hasta que el camión parte.
            while (end + 1 < n && s[end + 1].v < R.stoppedSpeed && (s[end + 1].t - s[end].t) <= 30 &&
                   !(s[end + 1].L !== null && s[end].L !== null && (s[end].L - s[end + 1].L) > 2)) {
                end++;
            }

            reclassifyIdle(s, cursor, first - 1);

            const cargaId = `${id}#${++loadSeq}`;
            const total = load.passes.length;
            let pi = 0;
            for (let k = first; k <= end; k++) {
                while (pi < total && load.passes[pi].start <= k) pi++;
                const row = s[k].r;
                row.ESTADO_OPERATIVO = 'CARGANDO';
                row.ZONA_OPERATIVA = 'ZONA_CARGA';
                row.__pase = pi;
                row.__pasesTotal = total;
                row.__cargaId = cargaId;
            }
            cursor = end + 1;
        });
        reclassifyIdle(s, cursor, n - 1);
    });

    // Fuera de una carga: en el frente solo "espera pala" un camión que aún
    // no está cargado. Los demás registros (CARGANDO sueltos que no formaron
    // carga, o camiones cargados pasando/saliendo del frente) se reasignan.
    function reclassifyIdle(s, from, to) {
        if (from > to) return;
        // Tramo de salida: si el registro anterior cerró una carga, los que
        // siguen dentro del frente (sin descargar) son el camión partiendo.
        let departEnd = from - 1;
        const prev = from > 0 ? s[from - 1].r : null;
        if (prev && prev.__cargaId) {
            let k = from;
            while (k <= to && s[k].r.ZONA_OPERATIVA === 'ZONA_CARGA' &&
                   !(s[k].L !== null && s[k - 1].L !== null && (s[k - 1].L - s[k].L) > 2)) k++;
            departEnd = k - 1;
        }
        for (let k = from; k <= to; k++) {
            const row = s[k].r;
            delete row.__pase; delete row.__pasesTotal; delete row.__cargaId;
            const st = row.ESTADO_OPERATIVO;
            if (st !== 'CARGANDO' && st !== 'ESPERA_EN_PALA') continue;
            const loaded = s[k].L !== null && s[k].L >= R.loadedThreshold;
            if (st === 'CARGANDO' || loaded || k <= departEnd) {
                row.ESTADO_OPERATIVO = s[k].v < R.stoppedSpeed ? 'DETENIDO_EN_RUTA' : 'EN_TRANSITO';
                row.ZONA_OPERATIVA = 'RUTA_TRANSITO';
            }
        }
    }
};

DataProcessor.extractFleetCycles = function(processedTrucks) {
    if (!processedTrucks || processedTrucks.length === 0) return [];

    const cyclesByTruck = {};

    processedTrucks.forEach(reg => {
        const truckId = reg.Vehiculo || reg.EQUIPO || reg.id || 'DESCONOCIDO';
        if (!cyclesByTruck[truckId]) {
            cyclesByTruck[truckId] = {
                id: truckId,
                totalPoints: 0,
                zonesCount: { ZONA_CARGA: 0, ZONA_DESCARGA: 0, RUTA_TRANSITO: 0 },
                avgSpeed: 0,
                speedSum: 0
            };
        }

        const stats = cyclesByTruck[truckId];
        stats.totalPoints++;
        stats.zonesCount[reg.ZONA_OPERATIVA] = (stats.zonesCount[reg.ZONA_OPERATIVA] || 0) + 1;
        stats.speedSum += parseFloat(reg.Velocidad || reg.VELOCIDAD || 0);
    });

    Object.keys(cyclesByTruck).forEach(id => {
        const stats = cyclesByTruck[id];
        stats.avgSpeed = (stats.speedSum / stats.totalPoints).toFixed(1);
    });

    return cyclesByTruck;
};

// ---------------------------------------------------------------------------
// MÓDULO DE SEGURIDAD (proximidad, velocidad, paradas no programadas, giros)
// ---------------------------------------------------------------------------
// Columnas reales usadas de aquí en adelante (confirmadas en los .xlsx crudos):
//   Camiones: Cliente, Vehiculo, Tiempo, X, Y, Z, Rot_X, Rot_Y, Rot_Z,
//             Velocidad, RPM, Combustible, Llenado, Abasteciendo,
//             Giro_Brusco, Tolva, Direccion
//   Palas:    Cliente, Vehiculo, Tiempo, X, Y, Z, Rot_X, Rot_Y, Rot_Z,
//             Xbucket, Ybucket, Zbucket, Velocidad, Direccion, Llenado, Region
// ---------------------------------------------------------------------------

// Envolvente física de un camión 930E + margen de seguridad.
DataProcessor.PROXIMITY_THRESHOLD_METERS = 15;
// Estados del camión en los que la cercanía con la pala es parte de la operación.
DataProcessor.PROXIMITY_EXEMPT_STATES = ['ESPERA_EN_PALA', 'ESTACIONANDO', 'CARGANDO'];
// Límite de velocidad por defecto (los límites por condición se configuran en
// Parámetros: vacío, cargado y rampa).
DataProcessor.SPEED_LIMIT_KMH = 55;

DataProcessor.secondsToHMS = function (totalSeconds) {
    const s = ((Math.round(totalSeconds) % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
};

// Traduce el estado operativo interno (ESTADO_OPERATIVO) a una etiqueta de
// zona legible para reportes (Seguridad, exportación a Power BI).
DataProcessor.getOperationalZoneLabel = function (estado) {
    const e = (estado || '').toString().toUpperCase();
    if (e === 'CARGANDO') return 'Carguío (Pala)';
    if (e === 'ESPERA_EN_PALA') return 'Cola en pala';
    if (e === 'ESTACIONANDO') return 'Maniobra de estacionamiento';
    if (e === 'DETENIDO_EN_RUTA') return 'Detenido en ruta';
    if (e === 'DESCARGANDO') return 'Zona de Descarga';
    if (e === 'EN_TRANSITO') return 'Ruta / Tránsito';
    return 'Otro / Encendido';
};

// Detecta eventos de proximidad (posible colisión) entre TODOS los pares de
// vehículos presentes en cada segundo del turno (camión-camión y
// camión-pala), usando distancia 3D centro-a-centro (Este, Norte, Elevación).
// Se excluyen los pares camión-pala mientras el camión espera el primer pase,
// se estaciona o carga: en esas etapas tiene que estar junto a la pala, así
// que esa cercanía es la operación normal y no un riesgo.
// Segundos consecutivos por debajo del umbral para el mismo par se agrupan
// en un solo evento con inicio, fin, duración y distancia mínima. La "zona"
// del evento se toma del estado operativo del camión involucrado (si el par
// es camión-pala, siempre se usa el estado del camión, ya que la pala es
// estacionaria; si son dos camiones, se prioriza el estado más específico
// -distinto de "Ruta/Tránsito"- de los dos).
DataProcessor.detectProximityEvents = function (trucks, shovels, thresholdMeters) {
    thresholdMeters = thresholdMeters || DataProcessor.PROXIMITY_THRESHOLD_METERS;

    const timeMap = {};
    const shovelLabelOf = DataProcessor.getShovelLabelResolver(shovels || []);

    function addPoint(row, id, isShovel) {
        const t = DataProcessor.extractSecondsFrom24HourFormat(row.Tiempo || row.FECHA_HORA || row.HORA || row.TIMESTAMP);
        if (t === null) return;
        const { x, y } = DataProcessor.getGroundCoords(row);
        const z = DataProcessor.getElevation(row, 0);
        if (!timeMap[t]) timeMap[t] = [];
        timeMap[t].push({
            id, x, y, z, isShovel,
            estado: isShovel ? null : row.ESTADO_OPERATIVO
        });
    }

    (trucks || []).forEach(r => addPoint(r, r.Vehiculo || r.EQUIPO || r.id || 'CAMION', false));
    (shovels || []).forEach(r => addPoint(r, shovelLabelOf(r), true));

    function resolveZone(a, b) {
        if (a.isShovel && !b.isShovel) return DataProcessor.getOperationalZoneLabel(b.estado);
        if (b.isShovel && !a.isShovel) return DataProcessor.getOperationalZoneLabel(a.estado);
        const za = DataProcessor.getOperationalZoneLabel(a.estado);
        const zb = DataProcessor.getOperationalZoneLabel(b.estado);
        if (za !== 'Ruta / Tránsito') return za;
        return zb;
    }

    function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

    const times = Object.keys(timeMap).map(Number).sort((a, b) => a - b);
    const ongoing = {};
    const events = [];

    function finalize(ev) {
        return {
            v1: ev.v1, v2: ev.v2,
            startSec: ev.startT, endSec: ev.lastT,
            durationSec: ev.lastT - ev.startT,
            minDist: ev.minDist,
            zone: ev.zone
        };
    }

    times.forEach(t => {
        const points = timeMap[t];
        const activeNow = new Set();

        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const a = points[i], b = points[j];
                if (a.isShovel !== b.isShovel) {
                    const truck = a.isShovel ? b : a;
                    if (DataProcessor.PROXIMITY_EXEMPT_STATES.includes(truck.estado)) continue;
                }
                const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
                if (d > thresholdMeters) continue;

                const key = pairKey(a.id, b.id);
                activeNow.add(key);

                if (!ongoing[key]) {
                    ongoing[key] = {
                        v1: a.id, v2: b.id,
                        startT: t, lastT: t,
                        minDist: d,
                        zone: resolveZone(a, b)
                    };
                } else {
                    ongoing[key].lastT = t;
                    if (d < ongoing[key].minDist) ongoing[key].minDist = d;
                }
            }
        }

        Object.keys(ongoing).forEach(key => {
            if (!activeNow.has(key)) {
                events.push(finalize(ongoing[key]));
                delete ongoing[key];
            }
        });
    });

    Object.keys(ongoing).forEach(key => events.push(finalize(ongoing[key])));

    events.sort((a, b) => a.startSec - b.startSec);
    return events;
};

// Límites de velocidad vigentes (Parámetros). Un número como argumento
// fuerza un único límite para todas las condiciones.
DataProcessor.getSpeedLimits = function (paramsOrLimit) {
    if (typeof paramsOrLimit === 'number') {
        return { empty: paramsOrLimit, loaded: paramsOrLimit, ramp: paramsOrLimit, rampGradePct: 999 };
    }
    const p = paramsOrLimit || ((typeof AppState !== 'undefined' && AppState.params) || {});
    const d = DataProcessor.DEFAULT_PARAMS;
    const num = (v, def) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : def; };
    return {
        empty: num(p.speedLimitEmptyKmh, d.speedLimitEmptyKmh),
        loaded: num(p.speedLimitLoadedKmh, d.speedLimitLoadedKmh),
        ramp: num(p.speedLimitRampKmh, d.speedLimitRampKmh),
        rampGradePct: num(p.rampGradePct, d.rampGradePct)
    };
};

// Excesos de velocidad y velocidad máxima por camión. Cada registro se compara
// contra el límite que le corresponde: vacío o cargado (según el Llenado) y,
// si el camión va por una rampa (pendiente >= rampGradePct), el límite de
// rampa cuando es más estricto. "Exceso" = cada segundo por encima del límite
// (no se agrupa en episodios: un tramo largo pesa más que uno de un segundo).
DataProcessor.computeSpeedStatsByTruck = function (processedTrucks, paramsOrLimit) {
    const L = DataProcessor.getSpeedLimits(paramsOrLimit);
    const byTruck = {};

    (processedTrucks || []).forEach(r => {
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        const t = DataProcessor.extractSecondsFrom24HourFormat(DataProcessor.rowTimeValue(r));
        if (t === null) return;
        const g = DataProcessor.getGroundCoords(r);
        const llenado = parseFloat(r.Llenado !== undefined ? r.Llenado : r.LLENADO);
        (byTruck[id] = byTruck[id] || []).push({
            t, x: g.x, y: g.y, z: DataProcessor.getElevation(r, null),
            v: parseFloat(r.Velocidad !== undefined ? r.Velocidad : r.VELOCIDAD) || 0,
            loaded: !isNaN(llenado) && llenado > DataProcessor.CYCLE_LOADED_THRESHOLD
        });
    });

    const stats = {};
    Object.keys(byTruck).forEach(id => {
        const rows = byTruck[id].sort((a, b) => a.t - b.t);
        const st = { id, maxSpeed: 0, excessCount: 0, excessEmpty: 0, excessLoaded: 0, excessRamp: 0 };
        let back = 0;
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (r.v > st.maxSpeed) st.maxSpeed = r.v;

            // Pendiente: contra el registro más reciente que esté a >= 20 m
            // (y a <= 20 s); en distancias cortas la elevación GPS es ruido.
            let grade = 0;
            if (r.z !== null) {
                while (back < i && r.t - rows[back].t > 20) back++;
                for (let k = i - 1; k >= back; k--) {
                    const q = rows[k];
                    const dist = Math.hypot(r.x - q.x, r.y - q.y);
                    if (dist >= 20) { if (q.z !== null) grade = (r.z - q.z) / dist * 100; break; }
                }
            }
            const onRamp = Math.abs(grade) >= L.rampGradePct;
            const base = r.loaded ? L.loaded : L.empty;
            const limit = onRamp ? Math.min(base, L.ramp) : base;
            if (r.v > limit) {
                st.excessCount++;
                if (onRamp && L.ramp < base) st.excessRamp++;
                else if (r.loaded) st.excessLoaded++;
                else st.excessEmpty++;
            }
        }
        stats[id] = st;
    });

    return stats;
};

// Cuenta "paradas no programadas": episodios (no segundos sueltos) en que
// classifyZoneAndState marcó al camión como DETENIDO_EN_RUTA -- es decir,
// velocidad ~0 fuera del frente de pala y sin señal de descarga. Segundos
// consecutivos (gap <= 5 s) del mismo camión se agrupan en una sola parada.
DataProcessor.countUnscheduledStopsByTruck = function (processedTrucks) {
    const byTruck = {};

    (processedTrucks || []).forEach(r => {
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t === null) return;
        if (!byTruck[id]) byTruck[id] = [];
        byTruck[id].push({ t, stopped: r.ESTADO_OPERATIVO === 'DETENIDO_EN_RUTA' });
    });

    const counts = {};
    Object.keys(byTruck).forEach(id => {
        const rows = byTruck[id].sort((a, b) => a.t - b.t);
        let count = 0, inStop = false, lastT = null;

        rows.forEach(r => {
            if (r.stopped) {
                if (!inStop || (lastT !== null && (r.t - lastT) > 5)) count++;
                inStop = true;
                lastT = r.t;
            } else {
                inStop = false;
                lastT = null;
            }
        });

        counts[id] = count;
    });

    return counts;
};

// Cuenta ocurrencias del flag de giro brusco (columna Giro_Brusco: "Sí"/"No").
// Si el archivo no trae esa columna, devuelve 0 en vez de omitir el KPI.
DataProcessor.countSharpTurns = function (processedTrucks) {
    let total = 0;
    const byTruck = {};

    (processedTrucks || []).forEach(r => {
        const raw = (r.Giro_Brusco ?? r.GIRO_BRUSCO ?? r.GiroBrusco ?? '').toString().trim().toUpperCase();
        const flagged = raw === 'SI' || raw === 'SÍ' || raw === 'YES' || raw === 'TRUE' || raw === '1';
        if (!flagged) return;
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        byTruck[id] = (byTruck[id] || 0) + 1;
        total++;
    });

    return { total, byTruck };
};

// Velocidad angular de giro de cada pala, estimada a partir del cambio de
// Rot_Z entre lecturas consecutivas (grados por segundo), manejando el salto
// de +180/-180. Se usa Rot_Z porque, en este sistema de ejes, cuando el
// brazo/pluma está cerca de la vertical (Rot_Y ~ 90°) es el único ángulo que
// registra el barrido completo de la superestructura sin quedar en punto
// muerto por bloqueo de gimbal. Es una estimación de ingeniería, no un dato
// crudo de "velocidad de giro" del sensor -- se documenta en el KPI.
DataProcessor.computeShovelSwingStats = function (shovelsRaw) {
    if (!shovelsRaw || shovelsRaw.length === 0) return [];

    const shovelLabelOf = DataProcessor.getShovelLabelResolver(shovelsRaw);
    const byShovel = {};

    shovelsRaw.forEach(r => {
        const id = shovelLabelOf(r);
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA);
        const rotZ = parseFloat(r.Rot_Z);
        if (t === null || isNaN(rotZ)) return;
        if (!byShovel[id]) byShovel[id] = [];
        byShovel[id].push({ t, rotZ });
    });

    function angleDiffDeg(a, b) {
        let d = a - b;
        d = ((d + 180) % 360 + 360) % 360 - 180;
        return d;
    }

    return Object.keys(byShovel).map(id => {
        const rows = byShovel[id].sort((a, b) => a.t - b.t);
        let maxSwingSpeed = 0;

        for (let i = 1; i < rows.length; i++) {
            const dt = rows[i].t - rows[i - 1].t;
            if (dt <= 0 || dt > 5) continue; // salto de tiempo -> no comparable
            const dAngle = Math.abs(angleDiffDeg(rows[i].rotZ, rows[i - 1].rotZ));
            const speed = dAngle / dt;
            if (speed > maxSwingSpeed) maxSwingSpeed = speed;
        }

        return { id, maxSwingSpeed };
    });
};


// ---------------------------------------------------------------------------
// MÓDULO DE PARÁMETROS Y SUPUESTOS (capacidades, precios, material por pala)
// ---------------------------------------------------------------------------
// Estos valores no vienen en la telemetría cruda -- son supuestos de
// ingeniería que el usuario puede revisar/editar en la pestaña "Parámetros y
// Supuestos" antes de generar los reportes. Se guardan en AppState.params.
// Los valores por defecto son referenciales (flota tipo 930E + pala CAT 7495)
// y quedan documentados aquí para que quede claro de dónde salen.
// ---------------------------------------------------------------------------

DataProcessor.DEFAULT_PARAMS = {
    truckCapacityTons: 320,   // Payload nominal de un camión 930E (~290-320 t según versión)
    bucketCapacityTons: 105,  // Capacidad de cuchara de una pala CAT 7495 (~3 pases llenan un 930E, como se mide en los datos)
    fuelPricePerGal: 16.5,    // S/ por galón de diésel B5 industrial (referencial, Perú)
    energyPricePerKwh: 0.55,  // S/ por kWh industrial (referencial, Perú)
    defaultMaterial: 'Mineral',
    // Límites de velocidad (km/h). Por defecto iguales; deben reemplazarse por
    // los del PETS de tránsito de la operación.
    speedLimitEmptyKmh: 55,
    speedLimitLoadedKmh: 55,
    speedLimitRampKmh: 55,
    rampGradePct: 6           // % de pendiente a partir del cual se considera rampa
};

// Nombre visible de un punto de descarga ("Descarga 01" -> el que el usuario
// haya definido en Parámetros, p. ej. "Chancadora primaria").
DataProcessor.dumpDisplayName = function (id) {
    const names = (typeof AppState !== 'undefined' && AppState.params && AppState.params.dumpNames) || {};
    const n = names[id];
    return (n && String(n).trim()) ? String(n).trim() : id;
};

DataProcessor.MATERIAL_OPTIONS = ['Mineral', 'Mineral Alta Ley', 'Mineral Baja Ley', 'Desmonte'];

// ---------------------------------------------------------------------------
// MÓDULO DE RESUMEN OPERATIVO (KPIs generales del turno, vista de aterrizaje)
// ---------------------------------------------------------------------------

// Ventana de tiempo cubierta por un conjunto de filas (camiones, palas, o
// ambos concatenados) -- se usa para "duración del turno" y para poder
// convertir viajes/eventos en tasas por hora sin repetir esta lectura en
// cada vista.
DataProcessor.computeShiftWindow = function (rows) {
    let minT = Infinity, maxT = -Infinity;
    (rows || []).forEach(r => {
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t === null) return;
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
    });
    if (!isFinite(minT) || !isFinite(maxT) || maxT <= minT) return null;
    return { startSec: minT, endSec: maxT, hours: (maxT - minT) / 3600 };
};

// % del tiempo total de telemetría de la flota que cada camión pasó en cada
// ESTADO_OPERATIVO (Carguío, Tránsito, Descarga, Espera en pala, Detenido en
// ruta). Da una foto rápida de en qué se les fue el turno a los camiones,
// sin tener que ir a Eficiencia y Ciclos a ver el detalle por camión.
DataProcessor.computeStateDistribution = function (processedTrucks) {
    const counts = {};
    let total = 0;

    (processedTrucks || []).forEach(r => {
        const s = r.ESTADO_OPERATIVO || 'DESCONOCIDO';
        counts[s] = (counts[s] || 0) + 1;
        total++;
    });

    return Object.keys(counts)
        .map(s => ({ state: s, count: counts[s], pct: total > 0 ? (counts[s] / total * 100) : 0 }))
        .sort((a, b) => b.count - a.count);
};

// Resuelve qué material se asume para una pala dada: lo que el usuario haya
// definido en Parámetros y Supuestos, o 'Mineral' por defecto si todavía no
// se configuró nada (así Productividad funciona aunque el usuario nunca
// visite esa pestaña).
DataProcessor.getMaterialForShovel = function (shovelId) {
    // OJO: AppState se declara con `const` en app.js, y un `const` global NO se
    // convierte en propiedad de window -- `window.AppState` siempre era undefined
    // y el material elegido en Parámetros se ignoraba (siempre salía 'Mineral').
    // Con typeof se consulta el binding global real sin lanzar ReferenceError.
    const params = (typeof AppState !== 'undefined' && AppState.params) || {};
    const materials = params.materialByShovel || {};
    return materials[shovelId] || params.defaultMaterial || DataProcessor.DEFAULT_PARAMS.defaultMaterial;
};

// Detecta episodios de carga completados por camión: rachas de segundos
// consecutivos (tolerancia 5 s) con ESTADO_OPERATIVO === 'CARGANDO'. Desde
// consolidateLoadingEpisodes cada racha es UNA carga completa (del primer pase
// hasta que el camión parte) = un viaje; trae además su número de pases.
// Se guarda también la posición promedio del episodio, para poder asignarlo
// después a la pala más cercana.
DataProcessor.detectLoadEpisodesByTruck = function (processedTrucks) {
    const byTruck = {};

    (processedTrucks || []).forEach(r => {
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t === null) return;
        const { x, y } = DataProcessor.getGroundCoords(r);
        if (!byTruck[id]) byTruck[id] = [];
        byTruck[id].push({
            t, x, y, loading: r.ESTADO_OPERATIVO === 'CARGANDO',
            cargaId: r.__cargaId || null, passes: r.__pasesTotal || 0
        });
    });

    function finalizeEpisode(id, ep) {
        const n = ep.xs.length;
        return {
            truckId: id,
            startSec: ep.startT,
            endSec: ep.lastT,
            passes: ep.passes || null,
            avgX: ep.xs.reduce((s, v) => s + v, 0) / n,
            avgY: ep.ys.reduce((s, v) => s + v, 0) / n
        };
    }

    const episodes = [];
    Object.keys(byTruck).forEach(id => {
        const rows = byTruck[id].sort((a, b) => a.t - b.t);
        let current = null;

        rows.forEach(r => {
            if (r.loading) {
                if (!current || (r.t - current.lastT) > 5 || (r.cargaId && current.cargaId && r.cargaId !== current.cargaId)) {
                    if (current) episodes.push(finalizeEpisode(id, current));
                    current = { startT: r.t, lastT: r.t, xs: [r.x], ys: [r.y], cargaId: r.cargaId, passes: r.passes };
                } else {
                    current.passes = Math.max(current.passes || 0, r.passes || 0);
                    current.lastT = r.t;
                    current.xs.push(r.x);
                    current.ys.push(r.y);
                }
            } else if (current) {
                episodes.push(finalizeEpisode(id, current));
                current = null;
            }
        });
        if (current) episodes.push(finalizeEpisode(id, current));
    });

    return episodes;
};

// Asigna cada episodio de carga a la pala físicamente más cercana (usando
// las zonas de pala ya detectadas por zones.js/getShovelZones), comparando
// la posición promedio del episodio contra el centro de cada frente.
DataProcessor.attributeEpisodesToShovels = function (episodes, shovelZones) {
    return (episodes || []).map(ep => {
        let bestId = null, bestDist = Infinity;
        (shovelZones || []).forEach(z => {
            const d = Math.hypot(ep.avgX - z.x, ep.avgY - z.y);
            if (d < bestDist) { bestDist = d; bestId = z.id; }
        });
        return Object.assign({}, ep, { shovelId: bestId });
    });
};

// Agregador principal de la vista Productividad: viajes y toneladas por
// camión, y ritmo de carguío (ciclos/hora) por pala, usando la capacidad de
// tolva asumida en Parámetros y Supuestos.
DataProcessor.computeProductivityStats = function (processedTrucks, shovelsRaw, params) {
    params = params || DataProcessor.DEFAULT_PARAMS;
    const truckCapacity = parseFloat(params.truckCapacityTons) || DataProcessor.DEFAULT_PARAMS.truckCapacityTons;

    const shovelZones = DataProcessor.getShovelZones(shovelsRaw || []);
    const rawEpisodes = DataProcessor.detectLoadEpisodesByTruck(processedTrucks);
    const episodes = DataProcessor.attributeEpisodesToShovels(rawEpisodes, shovelZones);

    let minT = Infinity, maxT = -Infinity;
    (processedTrucks || []).forEach(r => {
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t === null) return;
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
    });
    const shiftHours = (isFinite(minT) && isFinite(maxT) && maxT > minT) ? (maxT - minT) / 3600 : null;

    const byTruckMap = {};
    episodes.forEach(ep => {
        if (!byTruckMap[ep.truckId]) byTruckMap[ep.truckId] = { id: ep.truckId, trips: 0 };
        byTruckMap[ep.truckId].trips++;
    });
    const byTruck = Object.values(byTruckMap)
        .map(t => ({ id: t.id, trips: t.trips, tons: t.trips * truckCapacity }))
        .sort((a, b) => b.tons - a.tons);

    const byShovelMap = {};
    const newShovelAcc = id => ({ id, trips: 0, passSum: 0, passN: 0, loadSecSum: 0 });
    shovelZones.forEach(z => { byShovelMap[z.id] = newShovelAcc(z.id); });
    episodes.forEach(ep => {
        if (!ep.shovelId) return;
        if (!byShovelMap[ep.shovelId]) byShovelMap[ep.shovelId] = newShovelAcc(ep.shovelId);
        const acc = byShovelMap[ep.shovelId];
        acc.trips++;
        acc.loadSecSum += Math.max(0, ep.endSec - ep.startSec);
        if (ep.passes) { acc.passSum += ep.passes; acc.passN++; }
    });
    const byShovel = Object.values(byShovelMap)
        .map(s => ({
            id: s.id,
            trips: s.trips,
            material: DataProcessor.getMaterialForShovel(s.id),
            cyclesPerHour: shiftHours ? (s.trips / shiftHours) : null,
            tons: s.trips * truckCapacity,
            avgPasses: s.passN ? s.passSum / s.passN : null,
            avgLoadMin: s.trips ? s.loadSecSum / s.trips / 60 : null
        }))
        .sort((a, b) => b.trips - a.trips);

    const totalTrips = episodes.length;
    const totalTons = totalTrips * truckCapacity;

    // Pases por carga (subidas del Llenado agrupadas, ver consolidateLoadingEpisodes).
    const withPasses = episodes.filter(ep => ep.passes);
    const distribution = {};
    withPasses.forEach(ep => { distribution[ep.passes] = (distribution[ep.passes] || 0) + 1; });
    const passStats = {
        loads: withPasses.length,
        avgPasses: withPasses.length ? withPasses.reduce((s, ep) => s + ep.passes, 0) / withPasses.length : null,
        distribution
    };

    return { byTruck, byShovel, totalTrips, totalTons, shiftHours, truckCapacity, passStats };
};

// ---------------------------------------------------------------------------
// MÓDULO DE COSTO Y ENERGÍA
// ---------------------------------------------------------------------------
// La columna "Combustible" del archivo crudo es el NIVEL del tanque (0-100%),
// no un contador de consumo -- baja mientras el motor gasta y sube cuando el
// camión se reabastece (columna "Abasteciendo"). Por eso el consumo real se
// obtiene sumando SOLO las caídas entre lecturas consecutivas: una subida se
// interpreta como reabastecimiento y no se resta del consumo acumulado.
// Las palas no traen ninguna columna de consumo eléctrico en la telemetría
// cruda, así que su costo de energía es una estimación (potencia asumida ×
// horas de turno), declarada como tal en la vista.
// ---------------------------------------------------------------------------

// Extiende los valores por defecto ya definidos para Productividad.
DataProcessor.DEFAULT_PARAMS.fuelTankCapacityGal = 1200; // Tanque de un 930E (~4540 L)
DataProcessor.DEFAULT_PARAMS.shovelPowerKw = 1200;        // Potencia promedio asumida de una pala CAT 7495

// Consumo real de combustible por camión, a partir de la caída del indicador
// de nivel de tanque. Ignora subidas (> 0.5% para no confundir con ruido de
// sensor) y las cuenta como reabastecimientos.
DataProcessor.computeFuelConsumptionByTruck = function (processedTrucks, tankCapacityGal) {
    tankCapacityGal = tankCapacityGal || DataProcessor.DEFAULT_PARAMS.fuelTankCapacityGal;
    const byTruck = {};

    (processedTrucks || []).forEach(r => {
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        const pct = parseFloat(r.Combustible);
        if (t === null || isNaN(pct)) return;
        if (!byTruck[id]) byTruck[id] = [];
        byTruck[id].push({ t, pct });
    });

    const result = {};
    Object.keys(byTruck).forEach(id => {
        const rows = byTruck[id].sort((a, b) => a.t - b.t);
        let consumedPct = 0;
        let refuels = 0;

        for (let i = 1; i < rows.length; i++) {
            const delta = rows[i].pct - rows[i - 1].pct;
            if (delta < 0) {
                consumedPct += -delta;
            } else if (delta > 0.5) {
                refuels++;
            }
        }

        result[id] = {
            id,
            consumedPct,
            consumedGal: consumedPct / 100 * tankCapacityGal,
            refuels
        };
    });

    return result;
};

// Agregador principal de la vista Costo y Energía. Recibe el resumen por
// camión ya calculado en Productividad (productivityByTruck) para poder
// repartir el costo de combustible entre las toneladas que cada camión
// realmente movió, sin tener que recalcular los viajes de nuevo aquí.
DataProcessor.computeCostStats = function (processedTrucks, shovelsRaw, params, productivityByTruck) {
    params = params || DataProcessor.DEFAULT_PARAMS;
    const tankCap = parseFloat(params.fuelTankCapacityGal) || DataProcessor.DEFAULT_PARAMS.fuelTankCapacityGal;
    const fuelPrice = parseFloat(params.fuelPricePerGal) || DataProcessor.DEFAULT_PARAMS.fuelPricePerGal;
    const shovelPower = parseFloat(params.shovelPowerKw) || DataProcessor.DEFAULT_PARAMS.shovelPowerKw;
    const energyPrice = parseFloat(params.energyPricePerKwh) || DataProcessor.DEFAULT_PARAMS.energyPricePerKwh;

    const fuelByTruck = DataProcessor.computeFuelConsumptionByTruck(processedTrucks, tankCap);
    const tonsByTruck = {};
    (productivityByTruck || []).forEach(t => { tonsByTruck[t.id] = t.tons; });

    const byTruck = Object.keys(fuelByTruck).map(id => {
        const f = fuelByTruck[id];
        const cost = f.consumedGal * fuelPrice;
        const tons = tonsByTruck[id] || 0;
        return {
            id,
            consumedGal: f.consumedGal,
            refuels: f.refuels,
            cost,
            tons,
            costPerTon: tons > 0 ? cost / tons : null
        };
    }).sort((a, b) => b.cost - a.cost);

    const shiftWindow = DataProcessor.computeShiftWindow(processedTrucks);
    const shiftHours = shiftWindow ? shiftWindow.hours : null;

    const shovelZones = DataProcessor.getShovelZones(shovelsRaw || []);
    const byShovel = shovelZones.map(z => {
        const kwh = shiftHours ? shovelPower * shiftHours : 0;
        return { id: z.id, powerKw: shovelPower, hours: shiftHours, kwh, cost: kwh * energyPrice };
    });

    const totalFuelGal = byTruck.reduce((s, t) => s + t.consumedGal, 0);
    const totalFuelCost = byTruck.reduce((s, t) => s + t.cost, 0);
    const totalEnergyCost = byShovel.reduce((s, t) => s + t.cost, 0);
    const totalRefuels = byTruck.reduce((s, t) => s + t.refuels, 0);

    return {
        byTruck, byShovel,
        totalFuelGal, totalFuelCost, totalEnergyCost,
        totalCost: totalFuelCost + totalEnergyCost,
        totalRefuels, shiftHours
    };
};


// ---------------------------------------------------------------------------
// MÓDULO DE EFICIENCIA Y CICLOS
// ---------------------------------------------------------------------------
// ESTADO_OPERATIVO ya distingue Carga/Espera/Descarga/Detenido, pero agrupa
// TODO el movimiento en ruta bajo un solo "EN_TRANSITO", sin decir si el
// camión va cargado (pala -> chancadora) o vacío (chancadora -> pala). Esa
// dirección no viene en ningún sensor, pero se puede inferir de la
// secuencia: el tramo de tránsito que sigue a una carga es Acarreo, y el que
// sigue a una descarga es Retorno. Se asume que el turno arranca con el
// camión vacío (RETORNO) si no hay carga/descarga previa en los datos.
// ---------------------------------------------------------------------------

DataProcessor.CYCLE_STAGE_META = {
    CARGANDO: { label: 'Carga', color: '#ffd23f' },
    ESPERA_EN_PALA: { label: 'Espera en Pala', color: '#fb923c' },
    ACARREO: { label: 'Acarreo (cargado)', color: '#7dd3fc' },
    DESCARGANDO: { label: 'Descarga', color: '#ef4444' },
    RETORNO: { label: 'Retorno (vacío)', color: '#a78bfa' },
    DETENIDO_EN_RUTA: { label: 'Detenido en Ruta', color: '#94a3b8' },
    ESTACIONANDO: { label: 'Estacionando (reversa)', color: '#e879f9' }
};
DataProcessor.CYCLE_STAGE_ORDER = ['ESPERA_EN_PALA', 'ESTACIONANDO', 'CARGANDO', 'ACARREO', 'DESCARGANDO', 'RETORNO', 'DETENIDO_EN_RUTA'];

// Recorre cronológicamente los registros de cada camión y le agrega el campo
// __CICLO_ETAPA: conserva CARGANDO/ESPERA_EN_PALA/DESCARGANDO/DETENIDO_EN_RUTA
// tal cual, y reclasifica EN_TRANSITO como ACARREO o RETORNO según cuál haya
// sido el último evento "ancla" (una carga habilita Acarreo; una descarga
// habilita Retorno). Muta las filas en el arreglo recibido, igual que
// computeLlenadoTrend con __llenadoDelta.
DataProcessor.CYCLE_LOADED_THRESHOLD = 10; // % de Llenado: por encima, el camión va cargado

DataProcessor.computeCycleStageByTruck = function (processedTrucks) {
    const byTruck = {};

    (processedTrucks || []).forEach(r => {
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t === null) return;
        if (!byTruck[id]) byTruck[id] = [];
        byTruck[id].push({ t, row: r });
    });

    Object.keys(byTruck).forEach(id => {
        const rows = byTruck[id].sort((a, b) => a.t - b.t);
        // Respaldo solo para filas sin Llenado: último evento ancla.
        let lastAnchor = 'RETORNO';

        rows.forEach(item => {
            const estado = item.row.ESTADO_OPERATIVO;
            let stage;

            if (estado === 'EN_TRANSITO') {
                // El Llenado dice directamente si el camión va cargado o vacío.
                const L = parseFloat(item.row.Llenado !== undefined ? item.row.Llenado : item.row.LLENADO);
                stage = isNaN(L) ? lastAnchor : (L > DataProcessor.CYCLE_LOADED_THRESHOLD ? 'ACARREO' : 'RETORNO');
            } else {
                stage = estado;
                if (estado === 'CARGANDO') lastAnchor = 'ACARREO';
                else if (estado === 'DESCARGANDO') lastAnchor = 'RETORNO';
            }

            item.row.__CICLO_ETAPA = stage;
        });
    });

    return processedTrucks;
};

// % de tiempo y minutos por etapa de ciclo, por camión y para toda la flota.
DataProcessor.computeCycleStageStats = function (processedTrucks) {
    DataProcessor.computeCycleStageByTruck(processedTrucks);

    const byTruck = {};
    const fleetCounts = {};
    let fleetTotal = 0;

    (processedTrucks || []).forEach(r => {
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        const stage = r.__CICLO_ETAPA || 'DESCONOCIDO';
        if (!byTruck[id]) byTruck[id] = { id, counts: {}, total: 0 };
        byTruck[id].counts[stage] = (byTruck[id].counts[stage] || 0) + 1;
        byTruck[id].total++;
        fleetCounts[stage] = (fleetCounts[stage] || 0) + 1;
        fleetTotal++;
    });

    function toPctMinutes(counts, total) {
        const pct = {}, minutes = {};
        DataProcessor.CYCLE_STAGE_ORDER.forEach(s => {
            const c = counts[s] || 0;
            pct[s] = total > 0 ? (c / total * 100) : 0;
            minutes[s] = c / 60; // 1 muestra ~= 1 segundo de telemetría
        });
        return { pct, minutes };
    }

    const byTruckArr = Object.values(byTruck).map(t => {
        const { pct, minutes } = toPctMinutes(t.counts, t.total);
        return { id: t.id, pct, minutes, totalSamples: t.total };
    });

    const fleet = toPctMinutes(fleetCounts, fleetTotal);
    return { byTruck: byTruckArr, fleetPct: fleet.pct, fleetMinutes: fleet.minutes };
};

// Duración de un ciclo completo = tiempo entre el INICIO de una carga y el
// inicio de la siguiente (reutiliza los episodios de carga que ya detecta
// Productividad, para no duplicar esa lógica).
DataProcessor.computeCycleTimesByTruck = function (processedTrucks) {
    const episodes = DataProcessor.detectLoadEpisodesByTruck(processedTrucks);
    const byTruck = {};
    episodes.forEach(ep => {
        if (!byTruck[ep.truckId]) byTruck[ep.truckId] = [];
        byTruck[ep.truckId].push(ep.startSec);
    });

    const result = {};
    Object.keys(byTruck).forEach(id => {
        const starts = byTruck[id].sort((a, b) => a - b);
        if (starts.length < 2) {
            result[id] = { avgCycleMinutes: null, cycles: starts.length };
            return;
        }
        const diffs = [];
        for (let i = 1; i < starts.length; i++) diffs.push(starts[i] - starts[i - 1]);
        const avgSec = diffs.reduce((s, v) => s + v, 0) / diffs.length;
        result[id] = { avgCycleMinutes: avgSec / 60, cycles: starts.length };
    });

    return result;
};

// Relación gradiente-velocidad: para cada par de lecturas consecutivas de un
// mismo camión EN MOVIMIENTO REAL (ACARREO o RETORNO -- se excluyen carga,
// descarga y detenido, donde el gradiente no es lo que determina la
// velocidad), calcula la pendiente local (variación de elevación / distancia
// horizontal recorrida) y la velocidad en ese tramo. Agrupa las muestras en 3
// rangos de pendiente y compara la velocidad promedio de cada uno contra el
// tramo plano, para estimar cuánto se alarga el ciclo en subida.
DataProcessor.computeGradeSpeedProfile = function (processedTrucks) {
    const byTruck = {};

    (processedTrucks || []).forEach(r => {
        const id = r.Vehiculo || r.EQUIPO || r.id || 'DESCONOCIDO';
        const t = DataProcessor.extractSecondsFrom24HourFormat(r.Tiempo || r.FECHA_HORA || r.HORA || r.TIMESTAMP);
        if (t === null) return;
        const stage = r.__CICLO_ETAPA;
        if (stage !== 'ACARREO' && stage !== 'RETORNO') return;

        const { x, y } = DataProcessor.getGroundCoords(r);
        const z = DataProcessor.getElevation(r, null);
        if (z === null) return;
        const speed = parseFloat(r.Velocidad || r.VELOCIDAD || 0) || 0;

        if (!byTruck[id]) byTruck[id] = [];
        byTruck[id].push({ t, x, y, z, speed });
    });

    const samples = [];
    Object.keys(byTruck).forEach(id => {
        const rows = byTruck[id].sort((a, b) => a.t - b.t);
        for (let i = 1; i < rows.length; i++) {
            const p0 = rows[i - 1], p1 = rows[i];
            const dt = p1.t - p0.t;
            if (dt <= 0 || dt > 5) continue; // hueco de tiempo, no comparable

            const horizDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            if (horizDist < 5) continue; // muy poco desplazamiento, ruido de pendiente

            const grade = ((p1.z - p0.z) / horizDist) * 100;
            const speed = (p0.speed + p1.speed) / 2;
            if (speed <= 0) continue;

            samples.push({ grade, speed });
        }
    });

    const buckets = [
        { key: 'bajada', label: 'Bajada (< -4%)', test: g => g < -4 },
        { key: 'plano', label: 'Plano (-4% a 4%)', test: g => g >= -4 && g <= 4 },
        { key: 'subida', label: 'Subida (> 4%)', test: g => g > 4 }
    ];

    const result = buckets.map(b => {
        const inBucket = samples.filter(s => b.test(s.grade));
        const avgSpeed = inBucket.length > 0 ? inBucket.reduce((s, x) => s + x.speed, 0) / inBucket.length : null;
        return { key: b.key, label: b.label, n: inBucket.length, avgSpeed };
    });

    const flat = result.find(r => r.key === 'plano');
    result.forEach(r => {
        r.pctSlowerThanFlat = (flat && flat.avgSpeed && r.avgSpeed && r.key !== 'plano')
            ? ((flat.avgSpeed / r.avgSpeed - 1) * 100)
            : null;
    });

    return result;
};

// Agregador principal de la vista Eficiencia y Ciclos.
DataProcessor.computeEfficiencyStats = function (processedTrucks, params) {
    params = params || DataProcessor.DEFAULT_PARAMS;
    const truckCapacity = parseFloat(params.truckCapacityTons) || DataProcessor.DEFAULT_PARAMS.truckCapacityTons;
    const bucketCapacity = parseFloat(params.bucketCapacityTons) || DataProcessor.DEFAULT_PARAMS.bucketCapacityTons;

    const stageStats = DataProcessor.computeCycleStageStats(processedTrucks); // taggea __CICLO_ETAPA
    const cycleTimes = DataProcessor.computeCycleTimesByTruck(processedTrucks);
    const gradeProfile = DataProcessor.computeGradeSpeedProfile(processedTrucks);

    const byTruck = stageStats.byTruck.map(t => {
        const ct = cycleTimes[t.id] || { avgCycleMinutes: null, cycles: 0 };
        return Object.assign({}, t, ct);
    }).sort((a, b) => (b.cycles || 0) - (a.cycles || 0));

    const cycleMinutesArr = byTruck.map(t => t.avgCycleMinutes).filter(v => v !== null && v !== undefined);
    const fleetAvgCycleMinutes = cycleMinutesArr.length > 0
        ? cycleMinutesArr.reduce((s, v) => s + v, 0) / cycleMinutesArr.length
        : null;

    const fleetQueueMinutes = byTruck.reduce((s, t) => s + (t.minutes.ESPERA_EN_PALA || 0), 0);
    const fleetTransitPct = (stageStats.fleetPct.ACARREO || 0) + (stageStats.fleetPct.RETORNO || 0);
    // Teórico: razón de capacidades (Parámetros). Observado: pases contados en
    // el Llenado (ver consolidateLoadingEpisodes), promedio por carga.
    const theoreticalPasses = bucketCapacity > 0 ? (truckCapacity / bucketCapacity) : null;
    const loadEps = DataProcessor.detectLoadEpisodesByTruck(processedTrucks).filter(ep => ep.passes);
    const observedPasses = loadEps.length ? loadEps.reduce((acc, ep) => acc + ep.passes, 0) / loadEps.length : null;
    const fleetSpottingMinutes = byTruck.reduce((acc, t) => acc + (t.minutes.ESTACIONANDO || 0), 0);

    return {
        byTruck,
        fleetPct: stageStats.fleetPct,
        fleetMinutes: stageStats.fleetMinutes,
        fleetAvgCycleMinutes,
        fleetQueueMinutes,
        fleetTransitPct,
        theoreticalPasses,
        observedPasses,
        fleetSpottingMinutes,
        gradeProfile
    };
};