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
Lenguaje visual de Apple: modo claro/oscuro automático, materiales translúcidos, símbolos de trazo regular sin etiquetas y amarillo como color de acento. Arriba: abrir, páginas, deshacer, girar, grilla y exportar. Abajo: Medir, Calibrar y Medidas. Calibrar y medir muestran un botón amarillo ✓ para terminar. Calibrar incluye velocidad (mm/s) y ganancia (mm/mV).

## 1. Calibración
**Método de 4 puntos (por defecto en imágenes y fotos).** Tocá las 4 esquinas de un cuadrado de 25 mm (5×5 cuadros grandes), en sentido horario desde arriba a la izquierda. Cada esquina se arrastra para afinarla (aparece la lupa) y una malla de verificación muestra cómo se proyecta el cuadrado sobre el papel. Al confirmar: si el cuadrado ya está recto (capturas de pantalla) solo se fija la escala por eje; si no (fotos con perspectiva o giro), la imagen se endereza por homografía y se calibra sobre la imagen corregida. Volver a calibrar parte siempre del original. Enderezar descarta medidas previas. La precisión depende de cuántos píxeles ocupe 1 mm en la foto: con ~4 px/mm el error de un clic es de ~0,5 %. Límite de salida 4096 px por lado / 12 MP.

**Detección automática en imágenes.** Al abrir una imagen la app busca la grilla (sin OpenCV, en el propio navegador): orientación de las dos familias de líneas, perspectiva por puntos de fuga, paso de las líneas gruesas de 5 mm en la imagen enderezada y un cuadrado de 25 mm sobre las líneas. Con confianza ≥ 0,7 calibra sola (aviso «Calibrado automáticamente», grilla visible para verificar); con menos, «Calibrar» coloca las 4 esquinas como sugerencia («Detección dudosa») y vos las confirmás o las arrastrás; si no encuentra nada, lo dice. El botón de destellos repite la detección. Velocidad supuesta 25 mm/s.
Precisión medida con papel analítico (rotación y perspectiva conocidas): lados de 25,00 ± 0,1 mm y esquinas a ≤ 0,4 mm de las líneas, unos 0,3 s por imagen de 900 px. Con una foto sintética realista (perspectiva fuerte, desenfoque, líneas finas) la sugerencia queda a ~1 mm de las líneas y con hasta ~3 % de error en un lado, con confianza baja: ahí conviene ajustar las esquinas. Una foto con grilla muy tenue puede no detectarse. Supuestos: si solo se ve una periodicidad se asume que son las líneas de 5 mm (un papel solo con líneas de 1 mm saldría 5× mal: la malla de verificación lo muestra); el eje del tiempo es la familia más horizontal (una foto girada 90° o boca abajo hay que girarla antes). El papel con grilla de color (rosa, rojo, verde) funciona mejor que uno gris, porque la traza y el texto son neutros y se descartan.

**PDF (automático).** Al abrir un PDF, o cambiar de página, se calibra solo: escala física del papel (1/72 in por punto) y velocidad leída del texto («25.0 mm/s»; si no aparece se supone 25 y el aviso lo dice). Si la página trae una retícula vectorial de puntos o líneas, se compara su paso con el milímetro físico y se avisa cuando difiere más de 0,5 %. Validado con un informe de tiras de Holter: 6 latidos seguidos midieron 2438 ms contra 2444 ms impresos (0,25 %). Esto asume que el PDF se imprimió al 100 %; si no es así, usá Calibrar.

**Método de grilla.** El descrito a continuación.

Elegí Tiempo ↔. Un dedo mueve la grilla; dos dedos ajustan escala horizontal y posición al mismo tiempo. Altura ↕ es independiente; Proporcional mantiene la relación actual entre los ejes.

Indicá la velocidad impresa en ESE panel, verificá líneas de 1, 5 y 25 mm, coincidencia al principio, centro y final. Listo aplica. Cancelar recupera TODO el estado anterior de calibración. Las medidas se recalculan a partir de sus coordenadas originales; no se mueven los puntos. Se permite mucha compresión (mínimo técnico 0.0001 unidades/mm). Las líneas a menos de 3 píxeles CSS se ocultan sin bloquear la escala.

No infiere escala por tamaño de página PDF ni detecta automáticamente cuadrícula. No calibra mV, no corrige perspectiva, no compara dos referencias de forma automática. La grilla debe representar una escala conocida del trazado; una mera coincidencia visual no certifica exactitud.

## 2. Navegar y medir
Fuera de calibración, dos dedos siempre navegan: zoom + desplazamiento del lienzo completo. Con Mover lienzo (Opciones), un dedo también navega. Seleccioná PR/QRS/QT y arrastrá sobre el documento para crear. Para crear otro del mismo tipo volvé a elegirlo. RR tiene acceso directo.

Tocá una medida para seleccionarla: es la única editable (las demás se atenúan y se bloquean; un toque corto sobre otra la selecciona). Con una herramienta activa (PR, QRS, QT, RR) el foco está en la medida nueva y la herramienta sigue activa para encadenar varias; «Listo» la desactiva. Las manijas están solo en los cuatro extremos de las dos líneas, para dejar libre el punto de medida: arrastradas en horizontal mueven esa línea; con un gesto vertical claro desde un extremo se pasa al modo de extensión y la línea se estira arriba o abajo (calibre para abarcar varias derivaciones, en PR, QRS, QT y RR). La edición es relativa, la manija no salta al dedo.

**Panel de medida.** Una sola fila con el valor (cifras tabulares, ancho estable), mover ±1 ms, largo ±1 ms y eliminar. Debajo, solo en QT y RR, las acciones propias: fórmula de QTc, R y R ant. (un punto indica que ya están marcadas; después de tocar el ECG se vuelve a editar), tangente y su ángulo; en RR, proyección y amplitud. En pantallas anchas todo va en una fila.

**Trazos.** Líneas de grosor constante en pantalla (2 px físicos las principales, 1 px las auxiliares: proyecciones, referencias R, base de la tangente) con un halo claro para leerse sobre papel rosado o blanco, alineadas a los píxeles físicos. En el lienzo la píldora solo muestra el valor principal; QTc, lpm y mm quedan en el panel. Un toque sobre una medida abre su panel. Dos dedos durante edición terminan la edición actual y pasan a navegación. Si el sistema cancela el gesto de un dedo, se restaura su estado previo.

Con mouse: rueda amplía el lienzo; durante calibración cambia la escala del eje elegido. Arrastrar funciona igual que con un dedo.

Pulsación prolongada (450 ms) sobre un control: lupa. Arrastrá lentamente después de activarla. Es una ampliación de datos disponibles, no superresolución. La lupa mediante SVG `<use>` y PDF rasterizado debe probarse especialmente en Safari.

Las flechas desplazan la medida seleccionada: paso horizontal de 1 ms (Shift 10 ms) y vertical 0.1 mm visuales. No modifican los valores si solo se traslada el conjunto.

En dispositivos táctiles, girar a horizontal cambia la orientación de ECG + anotaciones como grupo. En escritorio no se gira automáticamente por tener una ventana horizontal. Botones y paneles se mantienen legibles. El ajuste de vista puede cambiar el tamaño visible al rotar, pero no la calibración. El botón × Ajustar restablece la vista.

## 3. RR (calibre de tiempo y amplitud)
Al crear RR, las proyecciones aparecen durante el arrastre. Extremos cambian apertura; barra o píldora del valor mueven el conjunto.

**Amplitud.** Tirá en vertical desde un extremo para extender las mordazas: la barra horizontal es la referencia (p. ej. la isoeléctrica). Solo arriba mide de la barra al borde superior (onda R); solo abajo, de la barra al inferior (S); con ambas, de borde a borde (pico a pico). Se informa en mm (con la escala vertical `sy` de la calibración) y en mV con la ganancia: 10 mm/mV por defecto, la leída del PDF («10 mm/mV») o la elegida en Calibrar (5, 10 o 20). Volver a llevar una manija hasta la barra, o tocar × en el panel, retira la extensión. El tiempo, la frecuencia y la proyección no cambian. Las flechas y el movimiento fino trasladan también la extensión; el CSV agrega las columnas `amplitud_mm` y `amplitud_mV` y la ganancia en el encabezado. La proyección no se adapta a QRS ni detecta latidos. Si hay más de 1500 marcas potenciales se omiten por seguridad de rendimiento; ampliá la apertura.

## 4. QT y QTc
Creá un QT directo de inicio QRS a fin T. Seleccionalo y marcá R del QT y luego R anterior con sus botones; tocá el ECG para colocar cada referencia. Las referencias se dibujan por debajo del calibre y sus manijas permiten corregirlas.

QTc usa EXCLUSIVAMENTE esas referencias propias del QT. No usa el calibre RR de regularidad. Se exige que R actual sea posterior a R anterior y esté dentro del intervalo QT. Falta de referencias o intersección inválida produce QTc pendiente. La selección correcta de las dos R, incluida su consecutividad y adecuación clínica, depende del usuario: no se detecta automáticamente.

Fórmulas: Bazett, Fridericia, Framingham, Hodges. Cambiar calibración recalcula QT y RR desde coordenadas, no mezcla un RR guardado en ms con una nueva escala.

## 5. Tangente
En un QT seleccionado: Añadir recta tangente. Arrastrá su cuerpo para X/Y; extremos o ángulo para inclinación. El pivote del control angular es el centro de la recta. La base gris tiene un control independiente. El cruce determina fin de T. Recta horizontal o fin anterior al QRS: resultado inválido.

El comienzo del QRS sigue editable. Para T negativa, girá la recta a pendiente opuesta y ajustá su posición. La herramienta no decide cómo medir morfologías complejas ni su interpretación clínica. QT directo desactiva la tangente y vuelve al extremo directo guardado.

## Privacidad
No hay sesiones, guardado ni cuentas. Se abre una imagen, captura o PDF (también soltándolo o pegándolo con ⌘V), se mide y se exporta un CSV. Nada se envía ni se almacena.

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
src/App.tsx: herramientas, referencias y paneles.
src/PDFLayer.tsx: render PDF local con control de resolución.
src/documents.ts: apertura y exportación.
src/gridfinder.ts: detección automática de grilla. src/rectify.ts: enderezado por homografía. src/pdfvector.ts: escala y velocidad de PDF. src/autogrid.ts: lectura de píxeles. src/*.test.ts: cálculo, geometría y detección.

## Prueba rápida con un archivo sin datos personales
Abrí `ejemplos/ECG_sintetico.svg`. Contiene cuadriculado de 8 unidades/mm: la grilla inicial ya debe coincidir, pero confirmá 25 mm/s y tocá Listo para habilitar medidas. El período de sus complejos es 160 unidades = 800 ms con esa escala. No representa un ECG clínico.
