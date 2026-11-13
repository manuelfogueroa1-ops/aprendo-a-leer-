# Guía paso a paso: levantar el servidor central

La **Parte 1** permite probarlo en tu propio computador. Sigue la **Parte 2** para instalarlo dentro del colegio o la **Parte 3** si necesitas acceso por internet.

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

## Parte 2 · Panel dentro de la red del colegio

Usa un computador Windows del colegio como servidor central. Los demás computadores se conectan por la red interna, aunque se caiga internet. Pide a informática que reserve una IP interna fija para ese computador y que compruebe que la red Wi-Fi y la red por cable se pueden comunicar con él.

1. **En el computador central**, instala Node.js 24 y Git para Windows. Abre una terminal en la carpeta del proyecto y ejecuta `npm ci` una vez para descargar las dependencias. Luego abre `INICIAR_SERVIDOR_COLEGIO.bat`. Si hay varias interfaces de red, elige la IP que usa el colegio. El servidor guarda sus datos y respaldos en `%LOCALAPPDATA%\AprendoALeerCentral`.
2. **Solo la primera vez**, el programa muestra la dirección del panel, el usuario `admin` y una contraseña inicial. Anótalos. Mantén la ventana abierta mientras se use el servicio. En reinicios, vuelve a abrir el mismo `.bat` con el mismo usuario de Windows.
3. **El encargado de informática** habilita TCP 8443 en el firewall del computador central, solo para las redes del colegio. Para una sola subred y un perfil de red privado o de dominio, puede usar este ejemplo en PowerShell como administrador y sustituir la IP por la del servidor.

   ```powershell
   New-NetFirewallRule -DisplayName 'Aprendo a Leer - panel del colegio' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -LocalAddress 192.168.1.50 -RemoteAddress LocalSubnet -Profile Domain,Private
   ```

4. **En cada computador que abra el panel o sincronice avances**, informática instala `certificado-colegio.cer` en el almacén de **Entidades de certificación raíz de confianza** de Windows. Comparte únicamente ese archivo público. Compara primero su huella SHA-256 con la mostrada en el computador central (`Get-FileHash .\certificado-colegio.cer -Algorithm SHA256`). Luego, desde PowerShell como administrador, ejecuta lo siguiente y vuelve a abrir el navegador y Aprendo a Leer.

   ```powershell
   Import-Certificate -FilePath .\certificado-colegio.cer -CertStoreLocation Cert:\LocalMachine\Root
   ```

5. Desde otro computador del colegio, abre la dirección mostrada, por ejemplo `https://192.168.1.50:8443`. Inicia sesión y cambia la contraseña en **Mi cuenta**. En **Administración** genera un código. En cada equipo de alumnos, instala Aprendo a Leer **1.2.8 o posterior** y pega el código en **Acceso docente → Servidor central**.
6. Haz una prueba con un alumno ficticio. Si un computador pierde acceso a la red interna, los avances permanecen pendientes en ese equipo. Al volver a conectarse a la red del colegio, se envían automáticamente.

Mantén el puerto 8443 dentro de la red escolar. Si usas varias subredes, informática debe permitir las subredes concretas en el firewall. Guarda los respaldos fuera del equipo central y protege `claves.json` y las claves privadas del servidor. Reserva la IP en el router para que los computadores mantengan la misma dirección de sincronización.

## Parte 3 · Servidor real en internet

### Usar Oracle Cloud Always Free

1. Crea una cuenta desde [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/). Elige la región principal en el registro, porque allí se crean las instancias gratuitas. Oracle puede pedir una tarjeta para verificar la cuenta. Para este proyecto basta con recursos **Always Free** dentro del cupo disponible. [Condiciones y capacidad de Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
2. En **Compute → Instances → Create instance**, elige **Ubuntu 24.04** y una máquina **VM.Standard.A1.Flex** con **1 OCPU y 6 GB de RAM**, si hay capacidad gratuita en tu región. Como alternativa, **VM.Standard.E2.1.Micro** tiene 1 GB de RAM. Usa el volumen de arranque predeterminado si cabe en el cupo gratuito. Selecciona una subred pública con acceso a internet, asigna una IPv4 pública y añade una clave pública SSH. Guarda la clave privada en tu computador. [Crear una instancia Linux](https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm)
3. En las reglas de entrada de la subred o del grupo de seguridad de la instancia, habilita **TCP 80 y 443** desde internet para la web y su certificado, y **TCP 22** desde tu IP de administración para SSH. Comprueba también el firewall de Ubuntu si la web no responde. Docker Compose deja el puerto 8080 del servicio dentro de su red. [Reglas de red de Oracle](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/creating-securitylist.htm)
4. Pide un subdominio del colegio, por ejemplo `aprendo.miescuela.cl`, y apunta un registro **A** a la IPv4 pública de la máquina. Usa un nombre DNS que puedas administrar. Comprueba la resolución desde Windows con `Resolve-DnsName aprendo.miescuela.cl -Type A`.
5. Conéctate desde PowerShell con `ssh -i RUTA_DE_TU_CLAVE ubuntu@IP_PUBLICA`. Instala en la máquina `git`, `curl` y `openssl` con `sudo apt update` y `sudo apt install -y git curl openssl`. Instala Docker Engine con el complemento `docker-compose-plugin` mediante el repositorio oficial para Ubuntu. Verifica con `sudo docker compose version`. [Instalar Docker en Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
6. Descarga el repositorio actualizado en la VM y ejecuta lo siguiente desde la carpeta `servidor-central`. Sustituye el dominio de ejemplo por el tuyo.

   ```bash
   git clone https://github.com/manuelfogueroa1-ops/aprendo-a-leer-.git
   cd aprendo-a-leer-/servidor-central
   sudo env DOMINIO=aprendo.miescuela.cl bash instalar.sh
   ```

   Guarda la clave de cifrado y la contraseña inicial que muestra el instalador. El script comprueba el servicio y después el certificado HTTPS. Si el DNS o el certificado aún no están listos, corrige la causa y vuelve a ejecutar `sudo bash instalar.sh` con la misma configuración. Para revisar los mensajes usa `sudo docker compose logs --tail 100 caddy aprendo`.
7. Desde otro computador, abre el panel por HTTPS, cambia la contraseña inicial y prueba una vinculación con un alumno ficticio. Sigue los pasos 7 a 11 para crear cuentas, generar un código y comprobar el avance. Usa `sudo` para los comandos de Docker del apartado de mantenimiento si instalaste Docker para administrarlo así.

Oracle puede recuperar máquinas Always Free con uso bajo. Conserva copias de la base fuera de la VM y guarda la clave de cifrado aparte. [Política de instancias inactivas](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

### Usar otro proveedor Linux

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
