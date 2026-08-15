# ZAMAT Control — V0.1.1

Sistema de gestión para ZAMAT.

## Plataforma
- Frontend publicado en GitHub Pages.
- Datos, autenticación, permisos y tiempo real en Supabase.
- Instalable como PWA y como APK Android.

## V0.1.1
- La interfaz se adapta automáticamente al ancho y alto de teléfonos y pantallas pequeñas.
- Mejoras para orientación vertical y horizontal.
- Panel lateral adaptativo y desplazable.
- Tablas y tableros se desplazan dentro de su contenedor sin ampliar toda la página.
- Ventanas emergentes ajustadas al alto disponible.
- Campos con tamaño adecuado para evitar el zoom automático en móviles.
- Soporte para áreas seguras de teléfonos con notch.

## Seguridad
Las claves secretas de Supabase no forman parte del frontend. Las operaciones administrativas sensibles se ejecutan mediante Edge Functions.
