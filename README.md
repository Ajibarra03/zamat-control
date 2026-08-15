# ZAMAT Control — V0.1.5

Sistema de gestión para ZAMAT.

## Plataforma
- Frontend publicado en GitHub Pages.
- Datos, autenticación, permisos y tiempo real en Supabase.
- Instalable como PWA y como APK Android.

## V0.1.5
- La APK usa la misma composición responsive que la versión móvil de la página.
- Android mantiene la barra de estado y la barra de navegación fuera del WebView, evitando que hora, batería, señal, Wi‑Fi o controles del sistema se superpongan al encabezado.
- Se eliminó el padding nativo artificial que alteraba la altura del encabezado y del panel lateral.
- El WebView usa el ancho real del teléfono, zoom de texto al 100 % y el mismo viewport responsive de la web.
- El teclado virtual redimensiona el área visible como en un navegador móvil.
- La web/PWA conserva sus áreas seguras estándar mediante CSS, sin márgenes artificiales.

## Seguridad
Las claves secretas de Supabase no forman parte del frontend. Las operaciones administrativas sensibles se ejecutan mediante Edge Functions.
