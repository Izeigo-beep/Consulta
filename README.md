# Consulta · Doña Elena

PWA privada, rápida y *offline-first* de Endocrinología, diseñada por **Sam Lazkano** para **Doña Elena**.

## Estructura de archivos

- `index.html` — Estructura principal de la aplicación y las 4 pestañas.
- `styles.css` — Diseño minimalista mobile-first en tonos verde salvia (modo claro y oscuro).
- `app.js` — Calculadoras clínicas, búsqueda instantánea, favoritos, copia de pautas y notas locales.
- `manifest.json` — Metadatos para instalar como app en pantalla de inicio (Android / iOS).
- `service-worker.js` — Caché local para funcionar sin conexión a internet.
- `icons/` — Icono SVG e iconos PNG (`192x192` y `512x512`).

## Privacidad

- Sin servidores, sin analíticas y sin bases de datos externas.
- Solo guarda en `localStorage` del navegador el tema visual, los favoritos y sus notas personales.

## Cómo probar en local

> Importante: los Service Workers necesitan ejecutarse sobre `http://localhost` o `https://` (no abriendo `index.html` con doble clic en `file://`).

En la carpeta del proyecto, abre una terminal y ejecuta cualquiera de estas opciones:

```bash
# Opción 1: Python
python -m http.server 8080

# Opción 2: Node.js
npx serve .
```

Luego abre `http://localhost:8080` en tu navegador.

## Cómo subirla gratis a internet

1. **Netlify Drop (la más rápida):** entra en https://app.netlify.com/drop y arrastra la carpeta completa. Te dará un enlace HTTPS listo para enviar por WhatsApp.
2. **GitHub Pages:** sube estos archivos a un repositorio y activa *Settings → Pages → Deploy from a branch (main)*.
3. **Vercel:** importa el repositorio o sube la carpeta con `npx vercel`.

## Cómo instalarla en el móvil de Doña Elena

- **iPhone / iPad (Safari):** abre el enlace → pulsa el botón **Compartir** (cuadrado con flecha hacia arriba) → **«Añadir a pantalla de inicio»**.
- **Android (Chrome):** abre el enlace → pulsa **«Instalar»** en la cabecera o en el menú `⋮` → **«Añadir a pantalla de inicio» / «Instalar aplicación»**.
