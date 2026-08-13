-- ============================================================
-- QOVENTO — Accesorios por defecto: fotos sin fondo negro (webp)
-- Correr en Supabase > SQL Editor > Run. Seguro (solo actualiza texto,
-- no borra nada; no afecta accesorios que el dueño haya cargado a mano).
--
-- Los 7 accesorios por defecto (AirPods Pro, AirTag, etc.) se cargaron
-- apuntando a fotos .jpg con fondo negro. Esas fotos se reemplazaron por
-- versiones .webp sin fondo (transparentes). Este UPDATE actualiza la
-- ruta guardada en cada negocio que ya los haya activado, para que se
-- vean con la foto nueva sin tener que volver a cargarlos.
-- ============================================================

update productos
set imagen_url = replace(imagen_url, '.jpg', '.webp')
where imagen_url like '/accesorios-default/%.jpg';
