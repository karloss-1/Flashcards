# Verificación

Resultado: **17 pruebas aprobadas, 0 fallos**, incluyendo 8 escenarios de integración dentro de la suite de navegador. Algunas suites heredadas de la referencia agrupan múltiples aserciones en una sola prueba.

Entorno utilizado: Node.js 24.19.0, Playwright 1.62.1 y Google Chrome local en macOS. Perfil de navegador temporal e independiente.

## Comprobaciones realizadas

- Igualdad exacta de `study-policy.js` y FSRS 5.4.1 mediante hash de blob Git de las fuentes inspeccionadas.
- Predeterminado 5; límites 5/10/15; agotamiento de cuota; reducción de límite; día natural y días perdidos sin acumulación.
- Umbral 19/20/21, recuperación tras reducir el backlog, Learning/Relearning antes de Review y New, orden por fecha y desempates, exclusión de vencimientos futuros y tratamiento de fechas inválidas.
- Previous/Next, revelar por clic y barra espaciadora sin consumir nuevas. Calificar una New consume exactamente una; persistencia tras recarga.
- Estados FSRS y conteos independientes para decks que reutilizan IDs de tarjeta.
- Importación JSON; ZIP Store y Deflate, carpeta contenedora, `deck.json` e imágenes visibles.
- Validación de IDs, duplicados, contenido vacío, rutas remotas/traversal, archivos no admitidos y ZIP inválido.
- Reimportación conserva estado para IDs compatibles; cambio de identidad reinicia esa tarjeta; tarjetas eliminadas desaparecen; contador diario no se reinicia.
- Actualización JSON reutiliza imágenes locales. Las imágenes no utilizadas se eliminan.
- Fallo de actualización por imagen faltante revierte la transacción y conserva los datos previos.
- Calificaciones concurrentes de la misma New: una escritura válida y un único incremento.
- Eliminación de deck + imágenes + progreso, y vuelta al estado sin decks tras eliminar el último.
- Worker activo bajo una subruta, precache, recarga offline, imágenes offline y calificación persistente sin conexión. Cachés de otras apps intactas.
- Auditoría de namespaces de runtime, manifest y existencia de iconos; no contenido canónico instalado.
- Instalación Android/iOS/iPadOS/standalone y cancelación mediante eventos simulados de la lógica de instalación.
- Capturas revisadas a 390 px y 1200 px; sin desbordamiento horizontal en móvil; interfaz alineada con la fuente. Sin errores JavaScript durante los escenarios de navegador.

## Límites reales de la verificación

No se probó la instalación nativa en dispositivos físicos iOS/Android ni Safari/WebKit. La prueba móvil utiliza el viewport de Chrome; los eventos de instalación se simulan. Tampoco se simuló una expulsión real de almacenamiento por falta de espacio. La reversión por fallo se comprobó con una actualización inválida dentro de una transacción.

El funcionamiento offline se verificó en localhost con service worker real. El alojamiento definitivo debe servir los archivos mediante HTTPS con MIME correctos; este trabajo no configura un proveedor de hosting.
