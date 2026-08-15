# ZAMAT Control — V0.1.3

Sistema de gestión para ZAMAT.

## Plataforma
- Frontend publicado en GitHub Pages.
- Datos, autenticación, permisos y tiempo real en Supabase.
- Instalable como PWA y como APK Android.

## V0.1.3
- Se amplió de forma intencional el espacio superior para que la hora, batería, señal, Wi‑Fi, cámara o notch nunca queden sobre el nombre ZAMAT ni el logo.
- Se reserva también espacio inferior para la barra de gestos o los botones de navegación Android.
- La protección se aplica tanto en la web/PWA como en el contenedor Android.
- Incluye un margen de seguridad mínimo aunque determinados teléfonos reporten insets del sistema como 0.
- La interfaz continúa adaptándose automáticamente en orientación vertical y horizontal.
- Panel lateral, tablas, tableros y ventanas emergentes permanecen contenidos dentro del área visible.

## Seguridad
Las claves secretas de Supabase no forman parte del frontend. Las operaciones administrativas sensibles se ejecutan mediante Edge Functions.
