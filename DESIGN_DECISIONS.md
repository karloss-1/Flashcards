# Decisiones de diseño — Japanese Flashcards

## Fuentes inspeccionadas antes de escribir

- Estudio y UI: [`karloss-1/Mexican-Spanish/main`](https://github.com/karloss-1/Mexican-Spanish/tree/17f77aad4a324e5e39f239460e1e8f7809c70e0c), commit `17f77aad4a324e5e39f239460e1e8f7809c70e0c`.
- Gestión dinámica: [`karloss-1/Physio/main`](https://github.com/karloss-1/Physio/tree/9fa29e9772c6481b1dc069fb48e6bcc205dd2936), commit `9fa29e9772c6481b1dc069fb48e6bcc205dd2936`.
- Destino: `karloss-1/Flashcards/main`, commit inicial observado `a3c2062` (`Delete index.html`), árbol vacío. Había historial anterior, pero ningún archivo en el estado actual. Se trabaja sobre main y se conserva ese historial.

Las fuentes son referencias de solo lectura. Sus nombres aparecen aquí únicamente para trazabilidad, nunca como identificadores internos de la aplicación.

## Comparación de persistencia y decisión

| Aspecto | Referencia de estudio | Referencia de decks | Japanese Flashcards |
| --- | --- | --- | --- |
| Contenido | Dos colecciones fijas en JavaScript | Decks con tarjetas y FSRS en IndexedDB | Decks dinámicos con contenido en IndexedDB |
| Progreso | Un registro por colección; mapa de estados FSRS | FSRS dentro de cada tarjeta del deck | Un registro por deck, separado del contenido |
| Imágenes | Assets de aplicación | Store independiente de blobs | Store independiente con clave compuesta |
| Actualización | Sincronización de contenido canónico | Guarda deck e imágenes por separado | Una transacción para las tres stores |
| Identidad | IDs canónicos | IDs explícitos o generados | IDs explícitos y versión de identidad |
| Guardado de notas | Promesa por request | Promesa por request | Confirmación al completar la transacción |

Se combina la separación contenido/progreso de la primera con los blobs y decks locales de la segunda. Separar contenido evita reescribir imágenes o texto en cada calificación. Las transacciones conjuntas eliminan el intervalo en que una actualización parcial podría dejar un deck sin imágenes. La UI no adopta la cola de la referencia de decks (que pone New primero).

## Archivos y responsabilidades

- `index.html`: estructura, estilos y diálogos. Conserva la paleta verde, tipografía del sistema, tarjeta, toolbar, calificaciones, barra de cola, responsive y ayuda de la referencia de estudio. Gestión de decks en diálogo secundario.
- `app.js`: presentación, selección, navegación, importación interactiva, temporizadores y eventos.
- `study-policy.js`: copia exacta de la política inspeccionada.
- `storage.js`: IndexedDB, importaciones/eliminaciones atómicas y escritura de calificaciones.
- `import.js`: validación, normalización y lectura ZIP local; no ejecuta contenido importado.
- `vendor/ts-fsrs-5.4.1.umd.js` y licencia: misma librería que la fuente.
- `install.js`, `register-sw.js`, `sw.js`, `manifest.webmanifest`: instalación y aplicación offline.
- `assets/`: icono SVG original (tarjetas y círculo rojo) y tamaños PNG para PWA, favicon y Apple.
- `tests/`: política, UI de instalación, validación, identidad de fuentes, namespaces y navegador real.
- `examples/deck.json`: documentación importable manualmente; no es un deck integrado.

## IndexedDB v1

Base: `japanese-flashcards-db`.

| Store | Clave | Datos |
| --- | --- | --- |
| `decks` | `id` | `title`, `schemaVersion`, `cards` con contenido e `identityVersion`, `imagePaths`, `createdAt`, `updatedAt` |
| `progress` | `deckId` | `schedulerVersion`, mapa `cards` de estados FSRS, `dailyIntroduction: {date, count}`, `updatedAt` |
| `images` | `[deckId, path]` | `deckId`, `path`, `blob`; índice no único `deckId` |

Las claves compuestas de imágenes evitan colisiones por concatenación. Los mapas de estados se crean con `Object.fromEntries`; no interpretan IDs como propiedades heredadas. Importar, actualizar o eliminar abre una transacción readwrite sobre las tres stores. Calificar lee el estado reciente y escribe progreso en una transacción sobre `decks` y `progress`, verificando que la tarjeta siga disponible. Esto serializa escrituras entre pestañas y evita doble consumo por calificaciones simultáneas de una New.

No existe migración heredada porque la base es nueva. Futuras migraciones se implementarán explícitamente en `onupgradeneeded`, incrementando `DB_VERSION`. `onversionchange` cierra conexiones antiguas; un bloqueo pide cerrar las otras pestañas. Un scheduler desconocido no se califica ni se reinicia silenciosamente durante la carga. La compatibilidad de actualización requiere la versión del scheduler y la identidad de tarjeta.

## Política de estudio confirmada

`study-policy.js` es idéntico byte por byte al blob `efa638e554a9d8966206511b6888e564251397df` de la referencia. FSRS tiene blob `95a321081aa85b1c53da8d7a6c9a54544021ad6f`. Las pruebas comprueban ambos hashes.

- `FSRS.fsrs()` con configuración predeterminada, exactamente como la referencia, versión 5.4.1. Sin parámetros nuevos ni cambios de algoritmo.
- Estados New, Learning, Review y Relearning. Calificaciones Again=1, Hard=2, Good=3, Easy=4.
- Learning/Relearning vencidas primero; Review vencidas después; New al final. Dentro de cada grupo vencido, fecha de vencimiento ascendente y orden del deck como desempate. Fecha no válida cuenta como vencida y ordena como 0.
- Las New mantienen el orden de contenido del deck.
- Límite global configurable 5/10/15, predeterminado 5; cuota y conteo independientes por deck, como las colecciones separadas de la fuente.
- Día natural en la zona horaria local. El contador se reinicia lógicamente al cambiar la fecha. No se acumulan días perdidos.
- Una New cuenta únicamente al calificarse por primera vez, con cualquiera de los cuatro botones; revelar, seleccionar o navegar no escribe progreso.
- Si hay 20 o más tarjetas no-New vencidas en el deck seleccionado, no se ofrecen nuevas. Con 19 o menos vuelve a estar disponible la cuota restante.
- Calificar reconstruye la cola desde el estado persistido. Las tarjetas regresan cuando vencen. Previous/Next recorren circularmente la cola y no deshacen calificaciones.
- Cambio de límite no borra progreso. Reducirlo por debajo del conteo actual deja 0 nuevas disponibles.

Adaptaciones necesarias: colecciones estáticas → decks locales; escritura de FSRS y contador atómica; protección contra doble clic y cambios entre pestañas; temporizador al siguiente vencimiento o medianoche para actualizar una sesión que permanece abierta. Ninguna cambia el cálculo de la política.

## PWA, aislamiento y actualizaciones

- localStorage: `japanese-flashcards:selected-deck` y `japanese-flashcards:new-limit`. Solo preferencias; si localStorage falla, el estudio con IndexedDB sigue siendo posible.
- BroadcastChannel: `japanese-flashcards:changes`, para refrescar otras pestañas.
- Caché: `japanese-flashcards:<scope>:v3`; limpieza limitada al mismo prefijo y scope. No elimina cachés de otras apps.
- Manifest `id`, `start_url` y `scope`: `./`. Registro `./sw.js` con scope `./`. Puede instalarse bajo `/Flashcards/` sin controlar rutas hermanas.
- Precache del shell completo, incluyendo FSRS local y todos los módulos. Sin CDN, fetch de decks o fuentes externas.
- Caché de una versión coherente del shell. Cuando cambia el shell, el nuevo worker se activa de inmediato para que una instalación existente no conserve assets visuales obsoletos; la siguiente navegación usa la versión precacheada completa. Incrementar la versión de caché cuando cambie el shell.
- Los decks no van a Cache Storage: viven en IndexedDB. El worker solo atiende recursos de su origen/scope y no busca coincidencias en cachés ajenas.

El namespace IndexedDB es independiente de las otras aplicaciones, pero dos despliegues de Japanese Flashcards en el mismo origen comparten la misma base intencionadamente; no se promete aislamiento entre dos copias de esta misma aplicación.

## Validación y límites

Importación totalmente local. IDs obligatorios y únicos; contenido no interpretado como HTML; rutas restringidas; comprobación CRC, tamaños y estructura ZIP; límite de expansión durante descompresión. Un ZIP ambiguo con varios `deck.json` se rechaza. No se guardan assets no referenciados. Un fallo de validación o cuota revierte la transacción completa.

No hay garantía de conservación si el usuario borra datos, el navegador los expulsa o se usa navegación privada. No hay sincronización ni exportación de progreso. La instalación y los selectores de archivos nativos dependen del navegador y del sistema operativo.
