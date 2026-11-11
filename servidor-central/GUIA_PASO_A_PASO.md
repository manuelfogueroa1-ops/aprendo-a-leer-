# Guía paso a paso: levantar el servidor central

Tienes dos caminos. Empieza por la **Parte 1** (prueba en tu propio computador, 5 minutos) para ver todo funcionando; después haz la **Parte 2** para dejarlo en internet de verdad.

---

## Parte 1 · Probarlo en tu computador (sin internet, sin Docker)

1. Haz doble clic en **`PROBAR_SERVIDOR_CENTRAL.bat`** (está en la carpeta principal del proyecto).
   Si prefieres la terminal: `npm install` y luego `npm run central:prueba`.
2. Aparece una ventana con esto:

   ```
   Panel (en el navegador):  http://localhost:8080
   Usuario:                  admin
   Contraseña:               ClaveDePrueba12345

   CÓDIGO DE CONEXIÓN:  http://localhost:8080/ABCD-EFGH-JKLM
   ```

   **Copia el código de conexión.** No cierres la ventana mientras pruebas.
3. Abre la aplicación (`npm start` y entra a `http://localhost:3000`, o la aplicación de escritorio).
4. Entra a **Acceso docente → Servidor central**, pega el código en el campo **Código de conexión** y presiona **Vincular este computador**. El nombre del equipo es opcional.
5. Entra como estudiante, haz una actividad y abre `http://localhost:8080` en el navegador. Inicia sesión con el usuario y la contraseña de la ventana: el avance aparece en unos segundos.

Para empezar de cero, cierra la ventana y borra la carpeta `servidor-central/datos-prueba`. Esta prueba **no** sirve para la escuela: solo funciona en tu computador.

---

## Parte 2 · Servidor real en internet

### Lo que necesitas antes de empezar

| Qué | Para qué |
|---|---|
| Un servidor virtual (VPS) con **Ubuntu 22.04 o 24.04**, 1 CPU y 1 GB de RAM | Donde corre el servidor central, encendido siempre |
| Un **dominio o subdominio** (por ejemplo `aprendo.miescuela.cl`) | Para tener una dirección fija y un certificado HTTPS |
| 20 minutos | |

### Paso 1 · Contratar el servidor
Contrata un VPS con cualquier proveedor (DigitalOcean, Hetzner, Vultr, OVH, etc.) con Ubuntu. Anota su **dirección IP**.

### Paso 2 · Apuntar el dominio al servidor
En el panel donde administras el dominio, crea un registro **A**:

- Nombre: `aprendo` (o el subdominio que quieras)
- Valor: la IP del servidor

Espera unos minutos y comprueba desde tu computador: `ping aprendo.miescuela.cl` debe mostrar esa IP.

### Paso 3 · Conectarte al servidor
Desde PowerShell: `ssh root@LA-IP-DEL-SERVIDOR` (usa la contraseña o llave que te dio el proveedor).

### Paso 4 · Abrir los puertos y instalar Docker

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
curl -fsSL https://get.docker.com | sh
```

Los puertos 80 y 443 deben estar abiertos: Caddy los usa para obtener el certificado HTTPS.

### Paso 5 · Descargar el proyecto

```bash
git clone https://github.com/manuelfogueroa1-ops/aprendo-a-leer-.git
cd aprendo-a-leer-/servidor-central
```

### Paso 6 · Instalar con un solo comando

```bash
DOMINIO=aprendo.miescuela.cl bash instalar.sh
```

El script crea el archivo de configuración con todas las claves aleatorias, inicia el servidor y obtiene el certificado HTTPS. **Al principio muestra y no vuelve a mostrar**:

- el usuario y la contraseña del administrador;
- la **clave de cifrado**. Guárdala en un gestor de contraseñas, **fuera del servidor**. Sin ella no se pueden leer los nombres de los alumnos, ni siquiera desde un respaldo.

### Paso 7 · Entrar al panel
Abre `https://aprendo.miescuela.cl` en el navegador e inicia sesión. Ve a **Mi cuenta** y cambia la contraseña.

### Paso 8 · Crear las cuentas de las profesoras (opcional)
**Administración → Cuentas del panel**: crea una cuenta por profesora con el permiso **Profesor/a** (solo ve reportes).

### Paso 9 · Generar el código de conexión
**Administración → Generar código**. Aparece algo como:

```
aprendo.miescuela.cl/ABCD-EFGH-JKLM
```

Presiona **Copiar**. Se muestra una sola vez; vale los días que elijas (1 a 30) y sirve para varios computadores.

### Paso 10 · Vincular cada computador de la escuela
En cada computador (con internet, solo esta vez):

1. **Acceso docente → Servidor central**.
2. Pega el código en **Código de conexión**.
3. Presiona **Vincular este computador**.

Lo que ya estaba guardado en ese computador se envía solo.

### Paso 11 · Comprobar
En el panel central, pestaña **Computadores**: cada equipo vinculado debe aparecer como **Conectado**. Pestaña **Estudiantes**: aparecen los alumnos con la fecha del último avance recibido.

---

## Mantenimiento

Todos estos comandos se ejecutan en el servidor, dentro de `aprendo-a-leer-/servidor-central`.

| Qué quieres hacer | Comando |
|---|---|
| Ver si está funcionando | `docker compose ps` |
| Ver mensajes de error | `docker compose logs --tail 100 aprendo` |
| Actualizar a una versión nueva | `git pull && docker compose up -d --build` |
| Crear un respaldo ahora | `docker compose exec aprendo node respaldo.js` |
| Copiar los respaldos a otro lugar | `docker compose cp aprendo:/datos/respaldos ./respaldos-copia` |
| Crear otro administrador (por ejemplo, si olvidaste la contraseña) | `docker compose exec aprendo node crear-admin.js usuario "ContraseñaLarga"` |

El servidor hace un respaldo cada día y guarda los últimos 14. **Copia esa carpeta fuera del servidor con regularidad**: si el servidor se pierde, se pierden también sus respaldos. Para restaurar, mira la sección «Respaldos» de [README.md](README.md).

---

## Problemas frecuentes

- **La página no abre o dice que el certificado no es válido.** El dominio todavía no apunta a la IP del servidor (paso 2), o los puertos 80 y 443 están cerrados (paso 4). Revisa con `docker compose logs caddy`.
- **El computador dice «Sin conexión con el servidor central».** Puede ser internet caído en la escuela (normal: se reintenta solo) o que el código/dirección esté mal escrito. Los avances no se pierden: quedan guardados en el computador.
- **«El código de vinculación no es válido o ya venció».** Genera uno nuevo en **Administración**. Tras 10 intentos fallidos desde un mismo equipo hay que esperar 15 minutos.
- **Un computador de la escuela se perdió o se reemplazó.** En **Computadores**, presiona **Revocar acceso**.
- **El panel dice que un computador no tiene contacto reciente.** Puede estar apagado o sin internet. Lo que se haya hecho ahí todavía no aparece en los reportes; aparecerá solo cuando se reconecte.
