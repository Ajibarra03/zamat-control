# ZAMAT Control — V0.1.4

Sistema de gestión para ZAMAT.

## Plataforma
- Frontend publicado en GitHub Pages.
- Datos, autenticación, permisos y tiempo real en Supabase.
- Instalable como PWA y como APK Android.

## V0.1.4
- Se eliminó el doble espacio superior que aparecía entre la barra de estado del teléfono y el encabezado de ZAMAT.
- El encabezado ahora comienza inmediatamente debajo de la barra del sistema y queda alineado visualmente con el panel lateral.
- Se mantienen protegidos la hora, batería, señal, Wi‑Fi, cámara/notch y demás elementos del sistema.
- Se conserva el espacio seguro inferior para barra de gestos o botones de navegación Android.
- La interfaz continúa adaptándose automáticamente en orientación vertical y horizontal.

## Seguridad
Las claves secretas de Supabase no forman parte del frontend. Las operaciones administrativas sensibles se ejecutan mediante Edge Functions.
