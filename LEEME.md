# ECG Web · 0.5 — Aplicación móvil

Código fuente React + TypeScript + Vite, React Aria, PDF.js y SVG. Sin backend ni envío de documentos. No es un HTML aislado: necesita instalar dependencias y arrancar un servidor web.

## Estado de esta entrega
- Se analizaron sintácticamente los archivos TS/TSX con Babel.
- Se ejecutaron los 10 casos del motor mediante un arnés de aserciones Node sobre el TypeScript transpilado (no mediante Vitest en este entorno), más dos rechazos de sesiones inválidas y 1500 casos adicionales de transformación.
- Se comprobó la sintaxis de los scripts de shell.
- NO se ejecutó `npm install` del proyecto completo, `tsc`, Vite ni pruebas de interfaz en iPhone/Android en este entorno. La compilación integrada y las pruebas táctiles quedan pendientes en el equipo del usuario.
- Beta no validada clínicamente. No presentar como exactitud garantizada.

## Iniciar en tu Mac
Requiere Node.js 22 LTS o posterior compatible, además de npm. Xcode por sí solo no instala Node.js.

Descomprimí. En Terminal escribí `cd `, arrastrá la carpeta ECGWeb, Enter. Ejecutá:

```bash
npm install
npm run dev
```

O ejecutá `bash INICIAR.command`. La primera instalación requiere internet. No incluye node_modules ni lockfile; las dependencias directas están fijadas y npm creará el lockfile para conservar posteriormente.

El servidor muestra direcciones Local y Network. En el Mac abrí la dirección Local. En el celular conectado a la misma Wi-Fi abrí la dirección Network (la IP del Mac; NO localhost del teléfono). Si no conecta, revisá permiso del firewall y aislamiento entre clientes Wi-Fi. El servidor es para desarrollo local, no para publicar un servicio clínico en internet. El identificador de medida tiene un fallback para HTTP de la red local.

## Publicar

```bash
npm test
npm run build
```

Publicá el contenido de `dist` en un alojamiento estático HTTPS. La aplicación utiliza una única página y `base: './'`. No requiere servidor de archivos clínicos. El script `COMPILAR.command` ejecuta pruebas y compilación. Revisá y actualizá dependencias y sus avisos de seguridad antes de despliegues reales.

Esta versión NO incluye service worker, instalación PWA ni funcionamiento offline garantizado. No utiliza analítica, fuentes externas ni CDN de bibliotecas en ejecución; el worker PDF se distribuye con la app.

## Interfaz
- Documento + arriba a la izquierda: abrir imagen/PDF, abrir sesión, recuperar sesión local y cambiar página.
- Arriba derecha: deshacer, guardar/exportar y opciones.
- Cápsula inferior izquierda: registros, RR y selección PR/QRS/QT.
- Regla inferior derecha: calibración separada.
- ECG como fondo; sin título de archivo permanente. Controles inspirados en la referencia visual del usuario, iconos SVG propios (no recursos oficiales SF Symbols).

## 1. Calibración
Elegí Tiempo ↔. Un dedo mueve la grilla; dos dedos ajustan escala horizontal y posición al mismo tiempo. Altura ↕ es independiente; Proporcional mantiene la relación actual entre los ejes.

Indicá la velocidad impresa en ESE panel, verificá líneas de 1, 5 y 25 mm, coincidencia al principio, centro y final. Listo aplica. Cancelar recupera TODO el estado anterior de calibración. Las medidas se recalculan a partir de sus coordenadas originales; no se mueven los puntos. Se permite mucha compresión (mínimo técnico 0.0001 unidades/mm). Las líneas a menos de 3 píxeles CSS se ocultan sin bloquear la escala.

No infiere escala por tamaño de página PDF ni detecta automáticamente cuadrícula. No calibra mV, no corrige perspectiva, no compara dos referencias de forma automática. La grilla debe representar una escala conocida del trazado; una mera coincidencia visual no certifica exactitud.

## 2. Navegar y medir
Fuera de calibración, dos dedos siempre navegan: zoom + desplazamiento del lienzo completo. Con Mover lienzo (Opciones), un dedo también navega. Seleccioná PR/QRS/QT y arrastrá sobre el documento para crear. Para crear otro del mismo tipo volvé a elegirlo. RR tiene acceso directo.

Tocá una medida para seleccionarla: aparecen controles. Arrastrá extremos, barra o etiqueta. Un toque sobre una medida abre su panel. Dos dedos durante edición terminan la edición actual y pasan a navegación. Si el sistema cancela el gesto de un dedo, se restaura su estado previo.

Con mouse: rueda amplía el lienzo; durante calibración cambia la escala del eje elegido. Arrastrar funciona igual que con un dedo.

Pulsación prolongada (450 ms) sobre un control: lupa. Arrastrá lentamente después de activarla. Es una ampliación de datos disponibles, no superresolución. La lupa mediante SVG `<use>` y PDF rasterizado debe probarse especialmente en Safari.

Las flechas desplazan la medida seleccionada: paso horizontal de 1 ms (Shift 10 ms) y vertical 0.1 mm visuales. No modifican los valores si solo se traslada el conjunto.

En dispositivos táctiles, girar a horizontal cambia la orientación de ECG + anotaciones como grupo. En escritorio no se gira automáticamente por tener una ventana horizontal. Botones y paneles se mantienen legibles. El ajuste de vista puede cambiar el tamaño visible al rotar, pero no la calibración. El botón × Ajustar restablece la vista.

## 3. RR
Al crear RR, las proyecciones aparecen durante el arrastre. Extremos cambian apertura; barra mueve conjunto. La proyección no se adapta a QRS ni detecta latidos. Si hay más de 1500 marcas potenciales se omiten por seguridad de rendimiento; ampliá la apertura.

## 4. QT y QTc
Creá un QT directo de inicio QRS a fin T. Seleccionalo y marcá R del QT y luego R anterior con sus botones; tocá el ECG para colocar cada referencia. Los controles celestes permiten corregir ambas marcas.

QTc usa EXCLUSIVAMENTE esas referencias propias del QT. No usa el calibre RR de regularidad. Se exige que R actual sea posterior a R anterior y esté dentro del intervalo QT. Falta de referencias o intersección inválida produce QTc pendiente. La selección correcta de las dos R, incluida su consecutividad y adecuación clínica, depende del usuario: no se detecta automáticamente.

Fórmulas: Bazett, Fridericia, Framingham, Hodges. Cambiar calibración recalcula QT y RR desde coordenadas, no mezcla un RR guardado en ms con una nueva escala.

## 5. Tangente
En un QT seleccionado: Añadir recta tangente. Arrastrá su cuerpo para X/Y; extremos o ángulo para inclinación. El pivote del control angular es el centro de la recta. La base gris tiene un control independiente. El cruce determina fin de T. Recta horizontal o fin anterior al QRS: resultado inválido.

El comienzo del QRS sigue editable. Para T negativa, girá la recta a pendiente opuesta y ajustá su posición. La herramienta no decide cómo medir morfologías complejas ni su interpretación clínica. QT directo desactiva la tangente y vuelve al extremo directo guardado.

## Sesiones y privacidad
Una página activa por sesión: cambiar página o archivo reinicia medidas/calibración tras advertencia. Guardá antes. Sesión JSON incluye el PDF/imagen original (puede contener datos personales). Guardado local en IndexedDB es opcional, no automático, y puede borrarse en Opciones. Navegador privado/cuotas pueden impedir guardar; descargar sesión es alternativa. No hay cifrado propio del almacenamiento local.

CSV incluye intervalos, calibración y QTc de las cuatro fórmulas. No incluye exportación gráfica del documento anotado ni PDF de informe en esta versión. Medidas y documento no se envían al alojamiento. El acceso a un sitio web sí genera las solicitudes normales de descarga de la app.

## Límites de imagen/PDF
Imagen hasta 60 MB/80 megapíxeles. Render PDF de página completa limitado a 4096 píxeles por lado y 12 millones de píxeles por bitmap. Tras el zoom se vuelve a renderizar con PDF.js; bajo el límite de memoria esto mejora nitidez. A zoom extremo no se promete recuperar detalle adicional. No implementa mosaicos ni extracción de señal vectorial PDF. PDF protegido por contraseña no incluye diálogo específico.

No guardar sesiones antes de cargar una página completamente renderizada. El archivo original se preserva independientemente de la resolución del render.

## Verificación manual obligatoria
1. Intervalo conocido idéntico con zoom, pan, rotación y otras pantallas.
2. Altura de grilla no cambia tiempos; cambiar X o velocidad sí los recalcula.
3. Cancelar calibración restaura valores.
4. Trasladar calibre conserva apertura; editar extremo actualiza proyección.
5. Marcas R de cada QT no se mezclan con las de otro QT ni con RR de regularidad.
6. Tangente/base cambian final T; recta paralela muestra pendiente.
7. Sesión se restaura con archivo, página, calibración y referencias originales.
8. Probar Safari iPhone y Chrome Android, incluido cambio de orientación y cancelación de gestos.

## Estructura
src/model.ts: cálculos puros y transformaciones de grilla.
src/Stage.tsx: lienzo, gestos, grilla, calibres y lupa.
src/App.tsx: herramientas, referencias, sesiones y paneles.
src/PDFLayer.tsx: render PDF local con control de resolución.
src/documents.ts: apertura y exportación.
src/session.ts: validación del formato y recuperación.
src/storage.ts: IndexedDB.
src/model.test.ts: casos de cálculo y geometría.

## Prueba rápida con un archivo sin datos personales
Abrí `ejemplos/ECG_sintetico.svg`. Contiene cuadriculado de 8 unidades/mm: la grilla inicial ya debe coincidir, pero confirmá 25 mm/s y tocá Listo para habilitar medidas. El período de sus complejos es 160 unidades = 800 ms con esa escala. No representa un ECG clínico.
