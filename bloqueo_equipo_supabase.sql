-- Tipo de bloqueo del equipo recibido en Servicio Técnico: hasta ahora solo
-- existía `codigo_desbloqueo` (texto libre único, sin distinguir PIN de
-- contraseña ni soportar un patrón gráfico). Se agrega el tipo (ninguno por
-- defecto, opcional) y una columna aparte para el patrón — se guarda como
-- texto simple con la secuencia de puntos tocados (ej. "1,5,9,7,3", grilla
-- de 3x3 numerada del 1 al 9 fila por fila), no como imagen.
--
-- codigo_desbloqueo se sigue usando tal cual para PIN y contraseña — no
-- hace falta una columna nueva para eso, solo para el patrón.
alter table reparaciones add column if not exists tipo_bloqueo text;
alter table reparaciones add column if not exists patron_desbloqueo text;
