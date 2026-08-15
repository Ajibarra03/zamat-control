# ZAMAT Control — V0.1.0

Primera versión pública de ZAMAT Control, sistema de gestión para el emprendimiento ZAMAT.

## Funciones principales

- Inicio con mensaje motivacional diario.
- Roles: Usuario, Administrador y Superadministrador.
- Clientes / Proveedores.
- Inventario de artículos y materiales.
- Catálogo de productos, incluidos productos personalizados con materiales.
- Pedidos con pagos parciales, estados, devoluciones y reposición automática de inventario.
- Finanzas con movimientos manuales y movimientos automáticos de pedidos.
- Datos centralizados en Supabase y sincronización en tiempo real.
- Aplicación web instalable en teléfonos y computadoras compatibles (PWA).

## Seguridad

La aplicación usa una clave pública de Supabase en el navegador. Las operaciones administrativas sensibles se ejecutan mediante Edge Functions del lado servidor. Las claves privadas/secretas no deben incluirse en este repositorio.

## Versión

**V0.1.0** — primera publicación oficial.
