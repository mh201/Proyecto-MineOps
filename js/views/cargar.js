// js/views/cargar.js

Views = window.Views || {};

// ---------------------------------------------------------------------------
// Rango horario de los datos e intervalos de guardia
// ---------------------------------------------------------------------------
const pad2 = n => String(n).padStart(2, '0');
const secToHHMM = sec => `${pad2(Math.floor(sec / 3600) % 24)}:${pad2(Math.floor((sec % 3600) / 60))}`;
const secToHHMMSS = sec => `${secToHHMM(sec)}:${pad2(sec % 60)}`;
const DEFAULT_INTERVAL = { start: '00:00', end: '23:59' };

// Histograma por minuto de los camiones (para la vista previa de registros
// dentro de los intervalos). Se recalcula solo si cambia el archivo.
let cargarHistCache = { ref: null, hist: null };
function getTruckMinuteHistogram() {
    if (!AppState.truckData) return null;
    if (cargarHistCache.ref !== AppState.truckData) {
        cargarHistCache = { ref: AppState.truckData, hist: DataProcessor.minuteHistogram(AppState.truckData) };
    }
    return cargarHistCache.hist;
}

// Rango horario de los archivos cargados. También configura el "reloj de
// turno": si los datos cruzan medianoche, las horas posteriores a las 00:00
// se interpretan como del día siguiente (ver DataProcessor.configureShiftClock).
function getLoadedDataRange() {
    const sets = [AppState.truckData, AppState.shovelData].filter(Boolean);
    return sets.length ? DataProcessor.configureShiftClock(sets) : null;
}

function dataRangeAsInterval(range) {
    return range ? { start: secToHHMM(range.startSec), end: secToHHMM(range.endSec) } : { ...DEFAULT_INTERVAL };
}

// Los intervalos "no tocados" (el 00:00-23:59 por defecto, o uno que ya se
// autocompletó con el rango de los datos) se pueden reemplazar al cargar un
// archivo nuevo. Si el usuario editó algo, se respeta lo suyo.
function intervalsAreUntouched() {
    if (AppState.filters.intervalsAuto === true) return true;
    if (AppState.filters.intervalsAuto === false) return false;
    const iv = AppState.filters.timeIntervals || [];
    return iv.length === 0 || (iv.length === 1 && iv[0].start === DEFAULT_INTERVAL.start && iv[0].end === DEFAULT_INTERVAL.end);
}

function intervalRowHtml(inv, hideRemove) {
    return `
        <div class="time-interval-row" style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <input type="time" class="input-time-start" value="${inv.start || '00:00'}">
            <span style="color: var(--ink-dim); font-size: 12px;">a</span>
            <input type="time" class="input-time-end" value="${inv.end || '23:59'}">
            <button type="button" class="btn-remove-interval" style="background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger); border-radius: 4px; width: 28px; height: 28px; cursor: pointer; font-weight: bold; ${hideRemove ? 'display:none;' : ''}">✕</button>
            <span class="interval-note" style="color: var(--ink-faint); font-size: 11px; font-family: 'JetBrains Mono', monospace;"></span>
        </div>
    `;
}

function renderIntervalRows(intervals) {
    const container = document.getElementById('intervals-container');
    if (!container) return;
    container.innerHTML = intervals.map(inv => intervalRowHtml(inv, intervals.length === 1)).join('');
    refreshIntervalPreview();
}

// Guarda lo que hay en pantalla en AppState (borrador): si el usuario cambia
// de pestaña antes de procesar, al volver encuentra sus intervalos tal cual.
function saveIntervalDraft(markEdited) {
    AppState.filters.timeIntervals = getSelectedTimeIntervals();
    if (markEdited) AppState.filters.intervalsAuto = false;
}

function refreshDataRangeInfo() {
    const info = document.getElementById('data-time-range');
    const btn = document.getElementById('btn-use-data-range');
    const range = getLoadedDataRange();
    if (!info) return range;
    if (!range) {
        info.innerHTML = 'Cargue un archivo para detectar el rango horario registrado.';
        if (btn) btn.style.display = 'none';
        return range;
    }
    const h = Math.floor(range.durationSec / 3600), m = Math.round((range.durationSec % 3600) / 60);
    info.innerHTML = `Datos registrados: <b style="color: var(--ink);">${secToHHMMSS(range.startSec)}</b> → <b style="color: var(--ink);">${secToHHMMSS(range.endSec)}</b>` +
        ` (${h} h ${pad2(m)} min${range.wraps ? ', cruza medianoche' : ''})`;
    if (btn) btn.style.display = 'inline-block';
    return range;
}

// Al cargar un archivo: actualiza el rango y, si el usuario no editó los
// intervalos, los completa con la hora mínima y máxima registradas.
function autofillIntervalsFromData() {
    const range = refreshDataRangeInfo();
    if (!range || !intervalsAreUntouched()) { refreshIntervalPreview(); return; }
    const iv = dataRangeAsInterval(range);
    AppState.filters.timeIntervals = [iv];
    AppState.filters.intervalsAuto = true;
    renderIntervalRows([iv]);
}

// Cuántos registros de camiones quedan dentro de los intervalos actuales.
function refreshIntervalPreview() {
    const el = document.getElementById('interval-preview');
    const hist = getTruckMinuteHistogram();
    const intervals = getSelectedTimeIntervals();

    // Nota por fila: intervalo de 0 min o que cruza medianoche.
    document.querySelectorAll('#intervals-container .time-interval-row').forEach(row => {
        const a = row.querySelector('.input-time-start').value, b = row.querySelector('.input-time-end').value;
        const note = row.querySelector('.interval-note');
        if (!note) return;
        note.textContent = (a && b && a > b) ? 'cruza medianoche' : '';
    });

    if (!el) return;
    if (!hist) { el.innerHTML = ''; return; }
    const total = AppState.truckData.length;
    const inside = DataProcessor.countInIntervals(hist, intervals);
    const pct = total ? (inside / total * 100) : 0;
    const color = inside === 0 ? 'var(--danger)' : (pct < 50 ? 'var(--warn, #ffd23f)' : 'var(--ok)');
    el.innerHTML = `Dentro de los intervalos: <b style="color: ${color};">${inside.toLocaleString('es-PE')}</b> de ` +
        `${total.toLocaleString('es-PE')} registros de camiones (${pct.toFixed(1)} %)` +
        (inside === 0 ? ' — ningún registro cae en estos horarios' : '');
}

// Sección de checkboxes por camión -- se recalcula tanto en el render inicial
// como cada vez que se carga/reemplaza el archivo de camiones (ver
// processUploadedFile), sin tocar el resto del formulario.
function buildTruckFilterHtml() {
    if (!AppState.truckData) {
        return `<p style="color: var(--ink-faint); font-size: 0.85rem;">Cargue el archivo de camiones para poder elegir cuáles incluir.</p>`;
    }

    const vehicles = DataProcessor.getDistinctVehicleIds(AppState.truckData);
    const excluded = new Set(AppState.filters.excludedTrucks || []);

    const checkboxes = vehicles.map(v => `
        <label class="checkbox-group" style="font-size: 12.5px;">
            <input type="checkbox" class="truck-filter-checkbox" data-truck-id="${v.id}" ${excluded.has(v.id) ? '' : 'checked'}>
            <span>${v.id} <span style="color: var(--ink-faint);">(${v.count.toLocaleString('es-PE')} reg${v.firstSec !== null ? ` · ${secToHHMM(v.firstSec)}–${secToHHMM(v.lastSec)}` : ''})</span></span>
        </label>
    `).join('');

    return `
        <div style="display: flex; gap: 14px; margin-bottom: 10px;">
            <a href="#" class="truck-filter-select-all" style="color: var(--accent); font-size: 11px; font-family: 'JetBrains Mono', monospace;">Seleccionar todos</a>
            <a href="#" class="truck-filter-select-none" style="color: var(--ink-dim); font-size: 11px; font-family: 'JetBrains Mono', monospace;">Ninguno</a>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px 16px;">
            ${checkboxes}
        </div>
    `;
}

Views.cargar = function() {
    const truckStatus = AppState.truckData 
        ? `<b style="color: var(--ok);">✔ Datos Cargados (${AppState.truckData.length} registros)</b>`
        : `Arrastra vehicle_positions.xlsx o .csv aquí`;

    const shovelStatus = AppState.shovelData 
        ? `<b style="color: var(--ok);">✔ Datos Cargados (${AppState.shovelData.length} registros)</b>`
        : `Arrastra pala_positions.xlsx o .csv aquí`;

    const truckClass = AppState.truckData ? 'drop-zone loaded' : 'drop-zone';
    const shovelClass = AppState.shovelData ? 'drop-zone loaded' : 'drop-zone';

    const intervals = (AppState.filters.timeIntervals && AppState.filters.timeIntervals.length)
        ? AppState.filters.timeIntervals : [{ ...DEFAULT_INTERVAL }];
    const intervalsHtml = intervals.map(inv => intervalRowHtml(inv, intervals.length === 1)).join('');

    return `
        <div class="card">
            <h2>1. Seleccionar Archivos Crudos (.XLSX o .CSV)</h2>
            <p style="color: var(--ink-dim); font-size: 0.9rem; margin-top: 6px; margin-bottom: 16px;">
                Arrastre o seleccione los archivos de telemetría de la flota. Puede reemplazar los archivos actuales cargando nuevos registros en cualquier momento.
            </p>

            <div class="upload-grid">
                <div class="${truckClass}" id="drop-zone-trucks">
                    <div class="drop-icon">🚛</div>
                    <h3>Telemetría de Camiones</h3>
                    <p style="color: var(--ink-dim); font-size: 0.8rem; margin-top: 6px;" id="status-trucks">
                        ${truckStatus}
                    </p>
                    <input type="file" id="file-trucks" accept=".csv, .xlsx, .xls" style="display: none;">
                </div>

                <div class="${shovelClass}" id="drop-zone-shovels">
                    <div class="drop-icon">🚜</div>
                    <h3>Telemetría de Palas</h3>
                    <p style="color: var(--ink-dim); font-size: 0.8rem; margin-top: 6px;" id="status-shovels">
                        ${shovelStatus}
                    </p>
                    <input type="file" id="file-shovels" accept=".csv, .xlsx, .xls" style="display: none;">
                </div>
            </div>
        </div>

        <div class="card">
            <h2>2. Parámetros Operativos y Filtros de Guardia</h2>
            <div class="filter-grid" style="align-items: flex-start;">
                
                <div class="filter-group" style="grid-column: span 2;">
                    <label>Intervalos de Horas de Guardia (Formato 24 Horas)</label>
                    <p style="color: var(--ink-dim); font-size: 0.8rem; margin: 4px 0 10px; font-family: 'JetBrains Mono', monospace;">
                        <span id="data-time-range"></span>
                        <a href="#" id="btn-use-data-range" style="color: var(--accent); margin-left: 10px; display: none;">↺ Usar rango de los datos</a>
                    </p>
                    <div id="intervals-container">
                        ${intervalsHtml}
                    </div>
                    <button type="button" id="btn-add-interval" style="background: var(--surface-2); border: 1px dashed var(--accent); color: var(--accent); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-top: 4px; width: fit-content;">
                        ＋ Agregar otro intervalo
                    </button>
                    <p id="interval-preview" style="color: var(--ink-dim); font-size: 0.8rem; margin-top: 10px; font-family: 'JetBrains Mono', monospace;"></p>
                </div>
            </div>

            <div style="margin-top: 18px;">
                <label class="checkbox-group">
                    <input type="checkbox" id="filter-exclude-inactive" ${AppState.filters.excludeInactive ? 'checked' : ''}>
                    <span><strong>Excluir camiones inoperativos / sin movimiento</strong> (Descarta equipos estacionados o con velocidad cero en ruta)</span>
                </label>
            </div>

            <div style="margin-top: 20px;">
                <label style="font-size: 11px; text-transform: uppercase; color: var(--ink-dim); letter-spacing: 0.05em;">Filtrar por Camión</label>
                <p style="color: var(--ink-faint); font-size: 0.8rem; margin: 4px 0 10px;">
                    Desmarque un camión para excluirlo por completo del análisis (por ejemplo, uno en mantenimiento o con datos evidentemente corruptos).
                </p>
                <div id="truck-filter-section">${buildTruckFilterHtml()}</div>
            </div>
        </div>

        <div class="card" style="text-align: center;">
            <button class="btn-primary" id="btn-process-data" style="padding: 14px 40px; font-size: 1rem;">
                ⚙️ Procesar e Indizar Registros
            </button>

            <div class="progress-bar-container" id="progress-container">
                <div class="progress-bar-fill" id="progress-fill"></div>
            </div>
            <p id="process-status-text" style="color: var(--ink-dim); font-size: 0.85rem; margin-top: 10px; display: none; font-family: 'JetBrains Mono', monospace;">
                Procesando registros...
            </p>
        </div>
    `;
};

Views.initCargarEvents = function() {
    const dropTrucks = document.getElementById('drop-zone-trucks');
    const fileTrucks = document.getElementById('file-trucks');
    const dropShovels = document.getElementById('drop-zone-shovels');
    const fileShovels = document.getElementById('file-shovels');
    const btnProcess = document.getElementById('btn-process-data');
    const btnAddInterval = document.getElementById('btn-add-interval');
    const intervalsContainer = document.getElementById('intervals-container');
    const truckFilterSection = document.getElementById('truck-filter-section');

    setupDropZone(dropTrucks, fileTrucks, 'trucks');
    setupDropZone(dropShovels, fileShovels, 'shovels');

    if (btnAddInterval) {
        btnAddInterval.addEventListener('click', () => {
            // El nuevo intervalo arranca con el rango de los datos (o el día
            // completo si aún no hay archivo); se edita a partir de ahí.
            const iv = dataRangeAsInterval(getLoadedDataRange());
            intervalsContainer.insertAdjacentHTML('beforeend', intervalRowHtml(iv, false));
            updateRemoveButtonsVisibility();
            saveIntervalDraft(true);
            refreshIntervalPreview();
        });
    }

    if (intervalsContainer) {
        intervalsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-interval')) {
                e.target.closest('.time-interval-row').remove();
                updateRemoveButtonsVisibility();
                saveIntervalDraft(true);
                refreshIntervalPreview();
            }
        });
        intervalsContainer.addEventListener('input', () => {
            saveIntervalDraft(true);
            refreshIntervalPreview();
        });
    }

    const btnUseRange = document.getElementById('btn-use-data-range');
    if (btnUseRange) {
        btnUseRange.addEventListener('click', (e) => {
            e.preventDefault();
            AppState.filters.intervalsAuto = true;
            autofillIntervalsFromData();
        });
    }

    const excludeInactiveCb = document.getElementById('filter-exclude-inactive');
    if (excludeInactiveCb) {
        excludeInactiveCb.addEventListener('change', () => { AppState.filters.excludeInactive = excludeInactiveCb.checked; });
    }

    // Estado inicial: si ya hay archivos y los intervalos siguen sin tocar,
    // se autocompletan; si no, solo se muestra el rango y la vista previa.
    autofillIntervalsFromData();

    // Delegado sobre el contenedor (no sobre cada checkbox), porque la lista
    // se reemplaza por completo cada vez que se carga un archivo de camiones.
    if (truckFilterSection) {
        truckFilterSection.addEventListener('click', (e) => {
            if (e.target.classList.contains('truck-filter-select-all') || e.target.classList.contains('truck-filter-select-none')) {
                e.preventDefault();
                const checked = e.target.classList.contains('truck-filter-select-all');
                truckFilterSection.querySelectorAll('.truck-filter-checkbox').forEach(cb => { cb.checked = checked; });
                saveTruckSelectionDraft();
            }
        });
        truckFilterSection.addEventListener('change', (e) => {
            if (e.target.classList.contains('truck-filter-checkbox')) saveTruckSelectionDraft();
        });
    }


    btnProcess.addEventListener('click', () => {
        if (!AppState.truckData && !AppState.shovelData) {
            showToast("Debes cargar al menos un archivo (.xlsx o .csv) antes de procesar.", "warning");
            return;
        }

        const excludedTrucks = [];
        document.querySelectorAll('.truck-filter-checkbox').forEach(cb => {
            if (!cb.checked) excludedTrucks.push(cb.dataset.truckId);
        });

        const timeIntervals = getSelectedTimeIntervals();
        const hist = getTruckMinuteHistogram();
        if (hist && DataProcessor.countInIntervals(hist, timeIntervals) === 0) {
            showToast("Ningún registro de camiones cae dentro de los intervalos de guardia. Revise los horarios.", "warning", 6000);
            return;
        }
        if (AppState.truckData && document.querySelectorAll('.truck-filter-checkbox').length > 0 &&
            excludedTrucks.length === document.querySelectorAll('.truck-filter-checkbox').length) {
            showToast("Se desmarcaron todos los camiones: no quedaría nada para analizar.", "warning", 6000);
            return;
        }

        AppState.filters = {
            timeIntervals,
            intervalsAuto: AppState.filters.intervalsAuto,
            excludeInactive: document.getElementById('filter-exclude-inactive').checked,
            excludedTrucks: excludedTrucks
        };

        startProcessingAnimation();
    });
};

function saveTruckSelectionDraft() {
    const excluded = [];
    document.querySelectorAll('.truck-filter-checkbox').forEach(cb => { if (!cb.checked) excluded.push(cb.dataset.truckId); });
    AppState.filters.excludedTrucks = excluded;
}

function getSelectedTimeIntervals() {
    const rows = document.querySelectorAll('#intervals-container .time-interval-row');
    const intervals = [];
    rows.forEach(row => {
        const start = row.querySelector('.input-time-start').value;
        const end = row.querySelector('.input-time-end').value;
        if (start && end) {
            intervals.push({ start, end });
        }
    });
    return intervals.length > 0 ? intervals : [{ start: '00:00', end: '23:59' }];
}

function updateRemoveButtonsVisibility() {
    const buttons = document.querySelectorAll('#intervals-container .btn-remove-interval');
    buttons.forEach(btn => {
        btn.style.display = buttons.length === 1 ? 'none' : 'inline-block';
    });
}

function setupDropZone(dropZone, fileInput, type) {
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processUploadedFile(e.target.files[0], type, dropZone);
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processUploadedFile(files[0], type, dropZone);
        }
    });
}

function processUploadedFile(file, type, dropZoneElement) {
    const statusElement = document.getElementById(`status-${type}`);
    statusElement.innerText = "Leyendo archivo...";

    DataProcessor.parseFile(file, (err, data) => {
        if (err) {
            statusElement.innerHTML = `<span style="color: var(--danger);">${err}</span>`;
            showToast(err, "danger");
            return;
        }

        if (type === 'trucks') {
            AppState.truckData = data;
            statusElement.innerHTML = `<b style="color: var(--ok);">✔ ${file.name} (${data.length} filas)</b>`;

            // El archivo de camiones cambió -> la lista de checkboxes de la
            // sección 2 tiene que reflejar los IDs del nuevo archivo. Se
            // reemplaza solo ese bloque, no el formulario entero, para no
            // perder los intervalos de horas que el usuario ya haya tocado.
            const truckFilterSection = document.getElementById('truck-filter-section');
            if (truckFilterSection) {
                AppState.filters.excludedTrucks = [];
                truckFilterSection.innerHTML = buildTruckFilterHtml();
            }
        } else {
            AppState.shovelData = data;
            statusElement.innerHTML = `<b style="color: var(--ok);">✔ ${file.name} (${data.length} filas)</b>`;
        }

        // Rango horario registrado -> autocompleta los intervalos de guardia
        // (solo si el usuario no los había editado).
        autofillIntervalsFromData();

        dropZoneElement.classList.add('loaded');
        showToast(`Archivo ${file.name} cargado correctamente.`, "success");
    });
}

// Procesa por tandas (DataProcessor.applyFiltersAsync): la pantalla sigue
// respondiendo y la barra muestra el avance real del procesamiento.
async function startProcessingAnimation() {
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const statusText = document.getElementById('process-status-text');
    const btnProcess = document.getElementById('btn-process-data');

    btnProcess.disabled = true;
    progressFill.style.transition = 'width 0.15s linear';
    progressFill.style.width = '0%';
    progressContainer.style.display = 'block';
    statusText.style.display = 'block';
    statusText.style.color = 'var(--ink-dim)';

    const setProgress = (pct, text) => {
        progressFill.style.width = `${Math.round(pct)}%`;
        if (text) statusText.innerText = text;
    };

    try {
        getLoadedDataRange(); // reloj de turno (por si cruza medianoche)

        const rawTrucksCount = AppState.truckData ? AppState.truckData.length : 0;
        const rawShovelsCount = AppState.shovelData ? AppState.shovelData.length : 0;
        const totalRawCount = rawTrucksCount + rawShovelsCount;

        setProgress(2, `Clasificando ${rawTrucksCount.toLocaleString('es-PE')} registros de camiones...`);
        AppState.processedTrucks = AppState.truckData
            ? await DataProcessor.applyFiltersAsync(AppState.truckData, AppState.filters, f => {
                const stage = f < 0.25 ? 'Ordenando registros y calculando tendencia de llenado'
                    : f < 0.72 ? 'Clasificando estados operativos'
                    : f < 0.88 ? 'Detectando cargas y pases'
                    : 'Detectando maniobras de estacionamiento';
                setProgress(2 + f * 90, `${stage}... ${Math.round(f * 100)} %`);
            })
            : [];

        setProgress(94, 'Aplicando intervalos de guardia a las palas...');
        await new Promise(r => setTimeout(r, 0));
        AppState.processedShovels = AppState.shovelData
            ? DataProcessor.applyShovelFilters(AppState.shovelData, AppState.filters)
            : [];

        const processedTrucksCount = AppState.processedTrucks.length;
        const processedShovelsCount = AppState.processedShovels.length;
        const totalProcessedCount = processedTrucksCount + processedShovelsCount;
        const retentionPct = totalRawCount > 0 ? ((totalProcessedCount / totalRawCount) * 100).toFixed(1) : 0;
        const detailText = `(Camiones: ${processedTrucksCount}/${rawTrucksCount} | Palas: ${processedShovelsCount}/${rawShovelsCount})`;

        setProgress(100, `¡Procesamiento completo! ${totalProcessedCount} de ${totalRawCount} registros retenidos ${detailText} - ${retentionPct}%`);
        statusText.style.color = "var(--ok)";
        enableAnalysisModules();
        showToast(`Telemetría procesada: ${totalProcessedCount} de ${totalRawCount} registros retenidos (${retentionPct}%).`, "success", 6000);
    } catch (err) {
        console.error(err);
        statusText.style.color = 'var(--danger)';
        statusText.innerText = `Error al procesar: ${err.message || err}`;
        showToast('Ocurrió un error al procesar los datos. Revise el formato de los archivos.', 'danger', 6000);
    } finally {
        btnProcess.disabled = false;
    }
}