// js/app.js

window.Views = window.Views || {};

const AppState = {
    truckData: null,
    shovelData: null,
    processedTrucks: null,
    processedShovels: null,
    filters: {
        timeIntervals: [
            { start: '00:00', end: '23:59' }
        ],
        excludeInactive: true,
        excludedTrucks: []
    },
    // Supuestos editables en la pestaña "Parámetros y Supuestos". Se
    // inicializan con los valores por defecto de DataProcessor para que
    // Productividad y las vistas siguientes funcionen aunque el usuario
    // nunca visite esa pestaña; materialByShovel se completa recién cuando
    // se conoce cuántas palas hay en los datos cargados.
    params: {
        truckCapacityTons: DataProcessor.DEFAULT_PARAMS.truckCapacityTons,
        bucketCapacityTons: DataProcessor.DEFAULT_PARAMS.bucketCapacityTons,
        fuelPricePerGal: DataProcessor.DEFAULT_PARAMS.fuelPricePerGal,
        energyPricePerKwh: DataProcessor.DEFAULT_PARAMS.energyPricePerKwh,
        fuelTankCapacityGal: DataProcessor.DEFAULT_PARAMS.fuelTankCapacityGal,
        shovelPowerKw: DataProcessor.DEFAULT_PARAMS.shovelPowerKw,
        speedLimitEmptyKmh: DataProcessor.DEFAULT_PARAMS.speedLimitEmptyKmh,
        speedLimitLoadedKmh: DataProcessor.DEFAULT_PARAMS.speedLimitLoadedKmh,
        speedLimitRampKmh: DataProcessor.DEFAULT_PARAMS.speedLimitRampKmh,
        rampGradePct: DataProcessor.DEFAULT_PARAMS.rampGradePct,
        defaultMaterial: DataProcessor.DEFAULT_PARAMS.defaultMaterial,
        materialByShovel: {},
        dumpNames: {}
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initThemeToggle();
    loadView('inicio');
});

function initThemeToggle() {
    const btn = document.getElementById('toggle-theme');
    if (!btn) return;

    function applyIcon() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        btn.textContent = isLight ? '☀️' : '🌙';
    }

    applyIcon();

    btn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('mineops-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('mineops-theme', 'light');
        }
        applyIcon();
    });
}

function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('disabled')) return;
            const view = btn.getAttribute('data-view');
            
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            loadView(view);
        });
    });

    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');

    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

// Ciclo de vida de las vistas: algunas (Simulación 2D, Recorrido 3D) crean
// recursos que deben liberarse al cambiar de pestaña (animación en curso y
// gráfico Plotly/WebGL). Cada vista registra aquí su función de limpieza al
// inicializarse, y loadView la ejecuta antes de montar la siguiente.
window.ViewLifecycle = {
    _cleanup: null,
    register(fn) { this._cleanup = fn; },
    run() {
        if (typeof this._cleanup === 'function') {
            try { this._cleanup(); } catch (e) { console.warn('Error al limpiar la vista anterior:', e); }
        }
        this._cleanup = null;
    }
};

function loadView(viewName) {
    ViewLifecycle.run();

    const container = document.getElementById('view-container');
    const titleHeader = document.getElementById('view-title');

    const titles = {
        inicio: "Centro de Control Operativo",
        cargar: "Carga e Indización de Datos",
        parametros: "Parámetros y Supuestos del Turno",
        simulacion: "Simulación 2D en Tiempo Real",
        recorrido3D: "Visualización 3D de Trayectorias y Superficie", 
        resumen: "Resumen Operativo del Turno",
        productividad: "Análisis de Productividad",
        eficiencia: "Eficiencia y Tiempos de Ciclo",
        costos: "Costos y Consumo Energético",
        seguridad: "Seguridad: Proximidad, Velocidad y Paradas",
        powerbi: "Exportar y Continuar en Power BI"
    };

    if (titles[viewName]) {
        titleHeader.innerText = titles[viewName];
    }

    if (typeof Views[viewName] === 'function') {
        container.innerHTML = Views[viewName]();
        
        const initFuncName = `init${viewName.charAt(0).toUpperCase() + viewName.slice(1)}Events`;
        if (typeof Views[initFuncName] === 'function') {
            Views[initFuncName]();
        }
    } else {
        container.innerHTML = `<div class="card"><h2>Vista en construcción</h2></div>`;
    }

    // El contenedor que realmente scrollea es .main-content (overflow-y: auto),
    // no la ventana -- sin esto, al cambiar de vista quedabas en el mismo
    // punto de desplazamiento que tenías en la vista anterior.
    const scrollContainer = document.querySelector('.main-content');
    if (scrollContainer) scrollContainer.scrollTop = 0;
}

function enableAnalysisModules() {
    const disabledButtons = document.querySelectorAll('.nav-btn.disabled');
    disabledButtons.forEach(btn => {
        btn.classList.remove('disabled');
        btn.removeAttribute('disabled');
    });

    const dot = document.getElementById('global-status-dot');
    const statusText = document.getElementById('global-status-text');

    if (dot) dot.classList.add('active');
    if (statusText) statusText.innerText = "Datos Listos";
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✅',
        warning: '⚠️',
        danger: '❌',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span>${icons[type] || 'ℹ️'}</span>
        <div>${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Anima los números de KPI (data-count), las barras "meter" (data-w) y las
// barras verticales (data-h) de las vistas de reportes. En vez de animar
// todo apenas se monta la vista (lo que hacía que las tarjetas más abajo ya
// aparecieran "quietas" para cuando el usuario llegaba a ellas con scroll),
// cada widget arranca su propia animación recién cuando entra en pantalla,
// una sola vez, usando IntersectionObserver.
function animateReportWidgets(container) {
    if (!container) return;

    function animateCounter(el) {
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals, 10) : 0;
        const dur = 900;
        let start = null;

        function step(ts) {
            if (!start) start = ts;
            const p = Math.min(1, (ts - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            const value = target * eased;
            el.textContent = (decimals > 0
                ? value.toFixed(decimals)
                : Math.round(value).toLocaleString('es-PE')) + suffix;
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function animateFill(el, prop) {
        const target = prop === 'width' ? el.dataset.w : el.dataset.h;
        el.style[prop] = '0%';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { el.style[prop] = target + '%'; });
        });
    }

    const targets = [];
    container.querySelectorAll('.kpi .n[data-count]').forEach(el => targets.push({ el, run: () => animateCounter(el) }));
    container.querySelectorAll('.meter-fill[data-w]').forEach(el => targets.push({ el, run: () => animateFill(el, 'width') }));
    container.querySelectorAll('.vbar[data-h]').forEach(el => targets.push({ el, run: () => animateFill(el, 'height') }));

    if (targets.length === 0) return;

    // Si el navegador no soporta IntersectionObserver, se anima todo de una
    // (comportamiento anterior) en vez de dejar los widgets sin animar.
    if (typeof IntersectionObserver === 'undefined') {
        targets.forEach(t => t.run());
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const match = targets.find(t => t.el === entry.target);
            if (match) match.run();
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.15 });

    targets.forEach(t => observer.observe(t.el));
}