# Japanese Flashcards

PWA de estudio de japonés con decks locales, imágenes y repetición espaciada FSRS 5.4.1. Sin cuentas, backend ni sincronización. Comienza sin decks.

## Usar la aplicación

Sirve este directorio por HTTPS (o localhost durante desarrollo). No abras `index.html` con `file://`. Puede alojarse en una subruta, por ejemplo `/Flashcards/`, con todos sus archivos tal como aparecen en el repositorio.

1. Abre **Manage decks → Import deck** y selecciona un JSON o ZIP desde tu ordenador o teléfono.
2. Selecciona un deck y el límite de nuevas: 5, 10 o 15 (predeterminado: 5).
3. Recuerda la respuesta, toca la tarjeta para revelarla y califica con Again, Hard, Good o Easy.
4. Previous/Next permiten navegar sin calificar. Revelar tampoco consume nuevas.

En iPhone/iPad, el botón de instalación explica **Compartir → Añadir a pantalla de inicio**. En Android se ofrece cuando el navegador permite instalar. En escritorio utiliza la opción de instalación del navegador.

La primera apertura requiere conexión para guardar la aplicación. Después, los decks importados, sus imágenes y el progreso funcionan offline. Espera a que termine la importación antes de cerrar. El navegador puede borrar almacenamiento local; conserva tus archivos originales. Borrar los datos del sitio elimina los decks y el progreso. La persistencia solicitada al navegador es una protección de mejor esfuerzo, no una copia de seguridad.

## Formato de decks

Ejemplo completo: [`examples/deck.json`](examples/deck.json). Es únicamente una referencia: nunca se instala automáticamente ni forma parte de la caché PWA.

```json
{
  "schemaVersion": 1,
  "id": "my-japanese-deck",
  "title": "Japanese basics",
  "cards": [
    {
      "id": "cat",
      "identityVersion": 1,
      "front": {"text": "Cat", "image": "images/cat.png"},
      "back": {"text": "猫 · ねこ", "example": "猫がいます。"}
    }
  ]
}
```

- `id` del deck y de cada tarjeta: obligatorio, estable, string o número; máximo 200 caracteres. Los IDs de tarjeta deben ser únicos dentro del deck. Dos decks pueden usar los mismos IDs de tarjeta.
- `title` obligatorio; se acepta `name` como alias. Máximo 300 caracteres.
- `schemaVersion` opcional, actualmente 1.
- `cards`: entre 1 y 10 000 tarjetas, en el orden deseado para introducir nuevas.
- `front` y `back`: texto/número, o un objeto con `text`, `image` y `example`. Cada lado debe contener texto o imagen. Todo texto se representa literalmente, sin HTML.
- `identityVersion` opcional (predeterminado 1): cámbialo si reutilizas un ID para un concepto diferente y quieres reiniciar esa tarjeta. Para corregir una errata sin reiniciar, conserva ID y versión.
- Se ignoran estados FSRS proporcionados en el archivo; únicamente se preserva el progreso local compatible.

Un JSON sencillo sirve para decks de texto. Para importar imágenes nuevas, crea un ZIP:

```text
my-deck.zip
├── deck.json
└── images/
    └── cat.png
```

También se acepta una carpeta contenedora; todas las imágenes se resuelven respecto a la carpeta del único `deck.json`. Formatos: PNG, JPEG, WebP, GIF y SVG, renderizados como imágenes. No se aceptan URLs remotas, rutas absolutas o `..`. Los SVG deben ser autocontenidos para funcionar offline. Un ZIP debe incluir todas las imágenes referenciadas; los archivos no utilizados no se guardan.

Compatibilidad útil del formato de referencia: texto u objetos en los lados, JSON, ZIP, `deck.json`, imágenes y `name`. Se exigen IDs explícitos para evitar que reordenar tarjetas o cambiar un título altere accidentalmente su identidad.

Límites: archivo de hasta 50 MB, ZIP expandido de hasta 100 MB, 5000 entradas. ZIP sin compresión o Deflate; no ZIP64, multipartes o cifrados. Deflate necesita un navegador que soporte `DecompressionStream("deflate-raw")`.

## Actualizar y eliminar

Reimporta un deck con el mismo `id` y acepta la actualización. Los mismos IDs con `identityVersion` compatible conservan FSRS. Las tarjetas nuevas comienzan New; las eliminadas pierden su progreso. El contador diario se conserva: actualizar no permite eludir el cupo. Un JSON actualizado puede reutilizar imágenes ya guardadas; para añadir/cambiar imágenes importa un ZIP. Se eliminan las imágenes que dejan de utilizarse.

Actualizar contenido, imágenes y progreso constituye una sola transacción: si falla, se conserva el estado anterior. **Delete** pide confirmación y elimina deck, imágenes y progreso en una sola transacción; no se puede deshacer. Otros decks no cambian.

## Desarrollo y pruebas

No hay compilación ni dependencias de producción remotas. FSRS se distribuye localmente con su licencia MIT.

```sh
python3 -m http.server 8080
# Abre http://localhost:8080/

corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm run test:browser
```

Las pruebas requieren Node.js 20 o superior. `BROWSER_EXECUTABLE` permite usar un Chrome/Chromium local en lugar del navegador de Playwright. Las pruebas de navegador abren un servidor efímero y un perfil aislado, sin tocar tus decks personales.

Consulta [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) para el esquema, la comparación de fuentes, la política exacta y el aislamiento; [`VERIFICATION.md`](VERIFICATION.md) para los resultados y límites de la verificación.
