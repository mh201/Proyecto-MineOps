# MineOps Dispatch

Aplicación web para el análisis de telemetría de equipos de carguío y acarreo en minería a tajo abierto. A partir de los registros crudos de posición de camiones y palas, reconstruye los recorridos, identifica las etapas del ciclo de acarreo y calcula indicadores de productividad, eficiencia, costos y seguridad.

![Vista de la simulación 2D](animacion.png)
![Vista de un reporte](reporte.png)
![Vista de la animación 3D](animacion3D.png)

**Demo:** - No disponible

> **Proyecto académico.** Desarrollado como trabajo de Ingeniería de Minas en la Universidad Nacional de Ingeniería (UNI), Perú. No es un software de despacho para uso operativo real.

## Funcionalidades

- **Carga de datos:** lectura de archivos `.xlsx` / `.csv` de camiones y palas directamente en el navegador, con filtro por intervalos horarios y por equipo.
- **Parámetros:** configuración de capacidades, límites de velocidad (vacío, cargado, rampa), materiales y botaderos.
- **Simulación 2D:** reproducción en planta de los recorridos, con controles de reproducción.
- **Recorrido 3D:** visualización del terreno y las trayectorias con elevación.
- **Detección del ciclo de acarreo:** clasificación automática en espera en pala, estacionamiento, carguío, acarreo, descarga, retorno y detenciones en ruta.
- **Resumen y KPIs:** productividad, eficiencia, costos operativos y tiempos por etapa.
- **Seguridad:** alertas de proximidad camión–pala, exceso de velocidad, paradas no programadas y giros bruscos.
- **Exportación a Power BI:** generación de tablas listas para análisis externo.

## Formato de datos de entrada

La aplicación está construida para un formato de datos específico. Archivos con otra estructura no se procesarán correctamente.
Se requieren dos archivos (vehicle_position | pala_position)


## Tecnologías

- HTML, CSS y JavaScript sin frameworks
- [SheetJS](https://sheetjs.com/) para lectura de Excel
- [Plotly.js](https://plotly.com/javascript/) para gráficos 2D y 3D

Todo el procesamiento ocurre en el navegador; los datos no se envían a ningún servidor.

## Uso local

1. Clonar el repositorio.
2. Abrir `index.html` en un navegador moderno (o servirlo con cualquier servidor estático).
3. Ir a **Cargar datos** y subir los archivos de camiones y palas.

## Desarrollo con IA

Este proyecto fue desarrollado casi en su totalidad con la ayuda de **Claude**, el asistente de IA de Anthropic. Claude escribió la mayor parte del código: la arquitectura de la aplicación, el procesamiento de los datos crudos, la detección del ciclo de acarreo, el cálculo de KPIs, las visualizaciones 2D/3D y la interfaz.

Mi trabajo consistió en definir el problema y los requerimientos desde el criterio de ingeniería de minas, interpretar los datos de la mina, decidir qué indicadores calcular y cómo, guiar el desarrollo iterativamente, y probar y validar los resultados.

## Licencia

Ninguna
