// js/map2D.js
// -----------------------------------------------------------------------------
// Render del mapa 2D (Plotly, SVG).
//
// Cambios clave respecto de la versión anterior:
//  - layout.uirevision constante: antes cada cuadro reenviaba el rango de ejes
//    fijo y Plotly deshacía el zoom/paneo del usuario ~12 veces por segundo.
//    Con uirevision, Plotly conserva lo que el usuario hizo con el mouse
//    (zoom, paneo, y también los clics en la leyenda) mientras la animación
//    corre.
//  - Paneo y zoom con rueda propios (createViewController): la animación
//    sigue corriendo mientras se mueve la vista. Doble clic: vista completa.
//  - Siempre se envía la misma cantidad de trazas, cada una con uid fijo, de
//    modo que Plotly solo actualiza datos y no recrea elementos.
// -----------------------------------------------------------------------------
window.Map2DPlotly = (function () {
    const FONT = 'JetBrains Mono';

    // Estados, colores y símbolos compartidos con la vista 3D y el Resumen
    // (definidos en js/playback.js).
    const STATE_ORDER = ['EN_TRANSITO', 'ESTACIONANDO', 'CARGANDO', 'ESPERA_EN_PALA', 'DESCARGANDO', 'DETENIDO_EN_RUTA'];
    const meta = key => (window.Playback && Playback.STATE_META[key]) || { label: key, color: '#7dd3fc', symbol2d: 'circle' };

    function defaultView(bounds) {
        return { x: [bounds.minX - 60, bounds.maxX + 60], y: [bounds.minY - 60, bounds.maxY + 60] };
    }

    function getLayout(bounds, activeZones, view) {
        const v = view || defaultView(bounds);
        return {
            autosize: true,
            // Mientras este valor no cambie, Plotly respeta zoom/paneo/leyenda
            // del usuario aunque el layout se reenvíe en cada cuadro.
            uirevision: 'sim2d',
            dragmode: 'pan',
            hovermode: 'closest',
            paper_bgcolor: '#0b1320',
            plot_bgcolor: '#0b1320',
            // Margen superior para que el HUD flotante no tape la leyenda.
            margin: { l: 56, r: 24, t: 78, b: 50 },
            showlegend: true,
            legend: {
                x: 0.01, y: 0.99,
                font: { color: '#eaf4fb', family: FONT, size: 10 },
                bgcolor: 'rgba(11, 37, 60, 0.85)',
                bordercolor: 'rgba(234, 244, 251, 0.2)',
                borderwidth: 1
            },
            xaxis: {
                title: { text: 'Coordenada Este (X) [m]', font: { color: '#9cc3dd', size: 11, family: FONT } },
                range: v.x.slice(),
                gridcolor: 'rgba(234, 244, 251, 0.06)',
                zerolinecolor: 'rgba(234, 244, 251, 0.15)',
                tickfont: { color: '#5f88a8', family: FONT, size: 10 }
            },
            yaxis: {
                title: { text: 'Coordenada Norte (Z) [m]', font: { color: '#9cc3dd', size: 11, family: FONT } },
                range: v.y.slice(),
                gridcolor: 'rgba(234, 244, 251, 0.06)',
                zerolinecolor: 'rgba(234, 244, 251, 0.15)',
                scaleanchor: 'x',
                scaleratio: 1,
                tickfont: { color: '#5f88a8', family: FONT, size: 10 }
            },
            shapes: (activeZones && activeZones.shapes) || [],
            annotations: (activeZones && activeZones.annotations) || []
        };
    }

    // Durante la carga se muestra el pase en curso (solo los pases ya hechos:
    // el total recién se conoce al terminar la carga).
    function stateText(t) {
        return (t.state === 'CARGANDO' && t.pase) ? `Cargando · pase ${t.pase}` : meta(t.state).label;
    }

    function truckLabel(t) {
        return `<b>${t.id}</b><br>${t.speed.toFixed(0)} km/h | ${stateText(t)}`;
    }

    function truckHover(t) {
        const extra = (t.state === 'CARGANDO' && t.pasesTotal) ? `<br>Pase ${t.pase} de ${t.pasesTotal} de esta carga` : '';
        return `<b>${t.id}</b><br>${t.speed.toFixed(1)} km/h<br>${stateText(t)}${extra}`;
    }

    function truckTrace(stateKey, list, showLabels) {
        const st = meta(stateKey);
        return {
            uid: 'truck-' + stateKey,
            name: st.label,
            type: 'scatter',
            mode: showLabels ? 'markers+text' : 'markers',
            x: list.map(t => t.x),
            y: list.map(t => t.y),
            text: list.map(truckLabel),
            textposition: 'top right',
            textfont: { family: FONT, size: 10, color: st.color },
            hovertext: list.map(truckHover),
            hoverinfo: 'text',
            marker: {
                symbol: st.symbol2d, size: 12, color: st.color,
                line: { color: '#0b253c', width: 1.5 }
            },
            cliponaxis: false
        };
    }

    function buildTraces(frameData, options) {
        const showLabels = !options || options.showLabels !== false;
        const trucks = (frameData && frameData.trucks) || [];
        const shovels = (frameData && frameData.shovels) || [];

        const byState = {};
        STATE_ORDER.forEach(k => { byState[k] = []; });
        trucks.forEach(t => (byState[t.state] || byState.EN_TRANSITO).push(t));

        return [
            {
                uid: 'shovels',
                name: 'Palas de Carga',
                type: 'scatter',
                mode: showLabels ? 'markers+text' : 'markers',
                x: shovels.map(s => s.x),
                y: shovels.map(s => s.y),
                text: shovels.map(s => `<b>🚜 ${s.id}</b>`),
                textposition: 'top center',
                textfont: { color: '#6ee7b7', family: FONT, size: 11 },
                hovertext: shovels.map(s => `<b>${s.id}</b>`),
                hoverinfo: 'text',
                marker: {
                    symbol: 'square', size: 15, color: '#6ee7b7',
                    line: { color: '#0b253c', width: 1.5 }
                },
                cliponaxis: false
            }
        ].concat(STATE_ORDER.map(k => truckTrace(k, byState[k], showLabels)));
    }

    const CONFIG = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        // La rueda y el paneo los maneja createViewController (abajo).
        scrollZoom: false,
        doubleClick: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

    // staticTraces (rutas habituales) se dibujan DEBAJO de los equipos.
    function render(targetId, frameData, bounds, activeZones, staticTraces, options) {
        const elem = document.getElementById(targetId);
        if (!elem || !window.Plotly) return;
        const traces = (staticTraces || []).concat(buildTraces(frameData, options));
        return Plotly.react(elem, traces, getLayout(bounds, activeZones, options && options.view), CONFIG);
    }

    // -------------------------------------------------------------------------
    // CÁMARA 2D PROPIA (paneo y zoom con rueda) para que la animación siga
    // corriendo mientras se mueve la vista.
    //
    // El paneo nativo de Plotly guarda el rango de ejes al empezar a arrastrar
    // y al final aplica "rango inicial + desplazamiento". Si en medio del
    // arrastre el gráfico se redibuja (cada cuadro de la animación), ese
    // desplazamiento se aplica sobre una vista que ya se había movido: por eso
    // la vista "se disparaba" o había que congelar la animación.
    // Aquí la vista (rango X/Y) es un estado propio: el arrastre y la rueda solo
    // modifican ese estado, y cada cuadro lo envía como rango de ejes. Así el
    // redibujo y el movimiento nunca se pisan.
    //
    // - Modo Pan (por defecto): arrastrar mueve, rueda hace zoom hacia el cursor,
    //   doble clic vuelve a la vista completa.
    // - Modo Zoom (rectángulo) y demás botones de Plotly siguen funcionando:
    //   la vista se sincroniza desde lo que Plotly aplique.
    // -------------------------------------------------------------------------
    function createViewController(targetId, homeView, initialView, requestRender) {
        const gd = document.getElementById(targetId);
        const clone = v => ({ x: v.x.slice(), y: v.y.slice() });
        let view = clone(initialView || homeView);
        let drag = null;
        let lastDown = 0;

        const axes = () => {
            const fl = gd && gd._fullLayout;
            return (fl && fl.xaxis && fl.yaxis && fl.xaxis._length) ? { fl, xa: fl.xaxis, ya: fl.yaxis } : null;
        };
        const inPlotArea = target => target && target.classList && target.classList.contains('nsewdrag');
        const localPos = e => {
            const r = gd.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        // Vista realmente mostrada (Plotly puede ajustar un eje por la escala 1:1).
        const shownView = () => {
            const a = axes();
            return a ? { x: a.xa.range.slice(), y: a.ya.range.slice() } : clone(view);
        };

        function onPointerDown(e) {
            const a = axes();
            if (!a || a.fl.dragmode !== 'pan' || e.button !== 0 || !inPlotArea(e.target)) return;
            // Evita que Plotly inicie su propio paneo (suprime su mousedown).
            e.preventDefault();
            e.stopPropagation();

            const now = performance.now();
            if (now - lastDown < 320) { // doble clic: vista completa
                lastDown = 0;
                view = clone(homeView);
                requestRender();
                return;
            }
            lastDown = now;

            const p = localPos(e);
            const start = shownView();
            drag = {
                id: e.pointerId, px: p.x, py: p.y, start,
                sx: (start.x[1] - start.x[0]) / a.xa._length,
                sy: (start.y[1] - start.y[0]) / a.ya._length
            };
            try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* opcional */ }
        }

        function onPointerMove(e) {
            if (!drag || e.pointerId !== drag.id) return;
            const p = localPos(e);
            const dx = -(p.x - drag.px) * drag.sx;
            const dy = (p.y - drag.py) * drag.sy;
            if (Math.abs(p.x - drag.px) + Math.abs(p.y - drag.py) > 3) lastDown = 0; // no fue clic
            view = {
                x: [drag.start.x[0] + dx, drag.start.x[1] + dx],
                y: [drag.start.y[0] + dy, drag.start.y[1] + dy]
            };
            requestRender();
        }

        function onPointerUp(e) {
            if (drag && e.pointerId === drag.id) drag = null;
        }

        function onWheel(e) {
            const a = axes();
            if (!a || !inPlotArea(e.target)) return;
            e.preventDefault();
            const unit = e.deltaMode === 1 ? 33 : (e.deltaMode === 2 ? 400 : 1);
            const f = Math.exp(Math.max(-300, Math.min(300, e.deltaY * unit)) * 0.0015);
            const p = localPos(e);
            const cur = shownView();
            const fx = (p.x - a.xa._offset) / a.xa._length;
            const fy = 1 - (p.y - a.ya._offset) / a.ya._length;
            const cx = cur.x[0] + fx * (cur.x[1] - cur.x[0]);
            const cy = cur.y[0] + fy * (cur.y[1] - cur.y[0]);
            view = {
                x: [cx - (cx - cur.x[0]) * f, cx + (cur.x[1] - cx) * f],
                y: [cy - (cy - cur.y[0]) * f, cy + (cur.y[1] - cy) * f]
            };
            requestRender();
        }

        // Cambios hechos por Plotly (zoom de rectángulo, botón "home",
        // autoescala): se adoptan como la nueva vista.
        function onRelayout(ev) {
            if (!ev) return;
            const touched = Object.keys(ev).some(k => /^(x|y)axis\.(range|autorange)/.test(k));
            if (touched) view = shownView();
        }

        gd.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        gd.addEventListener('wheel', onWheel, { passive: false, capture: true });
        let relayoutBound = false;

        return {
            get() { return clone(view); },
            // Se llama después del primer dibujo (gd.on existe recién ahí).
            bindPlotlyEvents() {
                if (!relayoutBound && typeof gd.on === 'function') { gd.on('plotly_relayout', onRelayout); relayoutBound = true; }
            },
            dispose() {
                gd.removeEventListener('pointerdown', onPointerDown, true);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);
                gd.removeEventListener('wheel', onWheel, { capture: true });
            }
        };
    }

    return { render, defaultView, createViewController };
})();