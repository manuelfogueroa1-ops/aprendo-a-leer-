# Servidor central de Aprendo a Leer

Recibe los avances de todos los computadores de la escuela y ofrece un **panel web** donde la profesora o el administrador consultan los reportes de todos los alumnos, desde cualquier computador con internet.

## Cómo funciona

- **Con internet:** cada computador envía en segundo plano los estudiantes, intentos, avances y minijuegos. El panel central muestra cuándo se recibió el último avance de cada alumno y de cada computador.
- **Sin internet:** las actividades, imágenes, audios grabados y la fuente están dentro de la aplicación instalada, así que todo sigue funcionando. Los avances se guardan en el computador y quedan pendientes de envío.
- **Cuando vuelve la conexión:** el computador envía solo los registros pendientes (reintenta cada 5 a 60 segundos). El alumno no hace nada.
- **Sin duplicados:** cada alumno, intento y minijuego tiene un identificador único (UUID). Si un envío se corta y se repite, el servidor reconoce el registro y actualiza el mismo intento.
- **Mientras un computador siga desconectado**, lo nuevo que se haga ahí solo está en ese equipo y todavía no aparece en el reporte central. El panel lo advierte y muestra el último contacto de cada computador.

La primera instalación de la aplicación y la vinculación de cada computador necesitan internet.

## Requisitos para el alojamiento en internet

- Un servidor Linux con internet (un VPS pequeño basta: 1 CPU, 1 GB de RAM).
- Docker con Docker Compose.
- Un dominio o subdominio (por ejemplo `aprendo.miescuela.cl`) cuyo DNS apunte a la IP del servidor, y los puertos 80 y 443 abiertos.

## Instalación

Si el panel se usa únicamente en el colegio, el [modo de red interna](GUIA_PASO_A_PASO.md#parte-2--panel-dentro-de-la-red-del-colegio) permite instalarlo en un computador Windows y acceder por HTTPS desde los demás equipos del establecimiento.

La guía completa incluye [la instalación en Oracle Cloud Always Free](GUIA_PASO_A_PASO.md#usar-oracle-cloud-always-free), los pasos para otros proveedores Linux y el mantenimiento. En el servidor Linux con Docker y con el dominio ya apuntando a él:

```bash
git clone https://github.com/manuelfogueroa1-ops/aprendo-a-leer-.git
cd aprendo-a-leer-/servidor-central
DOMINIO=aprendo.miescuela.cl bash instalar.sh
```

El script genera el `.env` con claves aleatorias, inicia el servidor y obtiene el certificado HTTPS. Muestra una sola vez la contraseña del administrador y la **clave de cifrado `CENTRAL_DATA_KEY`: guárdala aparte del servidor**, porque sin ella no se pueden leer los nombres de los alumnos ni desde un respaldo. Para probar todo en tu propio computador, sin Docker: `npm run central:prueba` (o `PROBAR_SERVIDOR_CENTRAL.bat`).

## Uso del panel

- **Estudiantes:** lista con el resumen de cada alumno y la fecha del último avance recibido. Al abrir uno se ve el mismo informe del panel local (refuerzo sugerido, intentos, respuestas y avance de los intentos en progreso) indicando en qué computador se hizo cada intento.
- **Computadores:** último contacto y último envío de datos de cada equipo.
- **Administración** (solo administradores): códigos de vinculación, cuentas y estado de los respaldos.

Hay dos permisos: **Profesor/a** (ver reportes) y **Administrador/a** (además, vincular y revocar computadores, y crear o desactivar cuentas).

### Vincular un computador

1. En el panel central: **Administración → Generar código**. Muestra un **código de conexión** como `aprendo.miescuela.cl/ABCD-EFGH-JKLM` (ya incluye la dirección del servidor) con un botón para copiarlo. Se muestra una sola vez y sirve para varios computadores mientras esté vigente (1 a 30 días).
2. En cada computador: **Acceso docente → Servidor central**, pega el código y presiona **Vincular este computador**. El nombre del equipo es opcional (por defecto usa el del computador).
3. Los registros que ya existían en ese computador se envían automáticamente.

Un computador que ya estuvo vinculado a ese servidor puede revincularse pegando solo el código, sin la dirección.

Para dejar de recibir datos de un equipo perdido o reemplazado, usa **Revocar acceso** en **Computadores**.

## Respaldos

- El servidor crea una copia completa de la base cada 24 horas (`BACKUP_HOURS`) y conserva las últimas 14 (`BACKUP_KEEP`) en el volumen de datos, carpeta `respaldos/`.
- Para crear uno al instante: `docker compose exec aprendo node respaldo.js`.
- **Copia los respaldos fuera del servidor** con regularidad (por ejemplo, una tarea diaria):

  ```bash
  docker compose cp aprendo:/datos/respaldos ./respaldos-copia
  ```

  Los respaldos contienen los nombres cifrados; la clave `CENTRAL_DATA_KEY` debe guardarse aparte.
- **Restaurar:** detén el servicio (`docker compose stop aprendo`), copia el respaldo elegido sobre `/datos/central.sqlite` (borra también `central.sqlite-wal` y `central.sqlite-shm`) y vuelve a iniciarlo. Los computadores detectan la restauración y vuelven a descargar los cambios. Lo que el servidor recibió **después** de ese respaldo no está en él: para recuperarlo, en cada computador usa **Desvincular** y vuelve a vincularlo con un código nuevo. Así reenvía todo lo que tiene guardado, sin crear duplicados.

## Seguridad

- Conexión cifrada (HTTPS) entre los computadores, el panel y el servidor. La aplicación se niega a vincularse a una dirección `http://` que no sea el mismo computador.
- Nombres y apellidos de los alumnos cifrados en la base (AES-256-GCM). Las contraseñas se guardan con bcrypt.
- Cada computador tiene su propia autorización (token aleatorio guardado como hash en el servidor y cifrado en el computador). Se puede revocar.
- Límite de intentos en el inicio de sesión y en los códigos de vinculación. Sesiones con cookie `HttpOnly`, `Secure` y `SameSite=Strict`.
- Las grabaciones de voz de «Practico la pronunciación» **no** se envían: quedan solo en el computador donde se grabaron.

## Decisiones tomadas (revisar con la escuela)

- **Registros existentes:** al vincular un computador se envía todo lo que ya tenía guardado.
- **Mismo alumno en dos computadores a la vez:** cada intento se guarda por separado, con su computador. Ninguno reemplaza al otro. Los niveles se desbloquean con lo completado en cualquier equipo, una vez sincronizado. Si cambian colores o búho en dos equipos, queda el cambio más reciente.
- **Mismo alumno agregado sin conexión en dos computadores** (mismo nombre y apellido, sin importar mayúsculas): el servidor los une en un solo alumno y cada computador lo corrige al sincronizar.
- **Quitar un estudiante** en cualquier computador lo quita también del servidor y del resto de los equipos, con todos sus resultados. Para recuperarlo hay que restaurar un respaldo.
- Cada computador vinculado descarga la lista de alumnos y sus resultados para permitir el cambio de computador. Por eso conviene vincular solo equipos de la escuela.

## Limitaciones conocidas

- La preferencia «el cambio más reciente gana» usa la hora del computador; si un equipo tiene la hora muy desajustada, puede ganar un cambio antiguo.
- Los intentos que se están haciendo en un computador sin conexión no aparecen en el panel hasta que vuelva la conexión.

## Ejecutar sin Docker (pruebas)

```bash
cd servidor-central
npm install
CENTRAL_DATA_KEY=... SESSION_SECRET=... COOKIE_SECURE=0 ADMIN_USUARIO=admin ADMIN_CLAVE=... node server.js
```

Sin HTTPS, `COOKIE_SECURE=0` es necesario para iniciar sesión; úsalo solo en pruebas locales. Desde la raíz del repositorio, `node tests/sincronizacion.cjs` prueba de extremo a extremo los cortes de conexión, los envíos repetidos, el cambio de computador, el trabajo simultáneo, la eliminación, el reinicio del servidor, los respaldos y los permisos.
