#!/usr/bin/env bash
# Instala el servidor central en un servidor Linux que tenga Docker.
# Uso (desde la carpeta servidor-central/):   ./instalar.sh
# También sin preguntas:                       DOMINIO=aprendo.miescuela.cl ./instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

necesita() { command -v "$1" >/dev/null 2>&1 || { echo "Falta «$1». $2"; exit 1; }; }
necesita openssl "Instálalo con: sudo apt install openssl"
if [ "${SALTAR_DOCKER:-0}" != "1" ]; then
  necesita curl "Instálalo con: sudo apt install curl"
  necesita docker "Instala Docker: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || { echo "Falta el plugin «docker compose». Instálalo junto con Docker."; exit 1; }
fi

if [ -f .env ]; then
  echo "Ya existe el archivo .env: se conserva tal como está."
else
  DOMINIO="${DOMINIO:-}"
  if [ -z "$DOMINIO" ] && [ -t 0 ]; then
    read -r -p "Dominio del servidor (ej.: aprendo.miescuela.cl): " DOMINIO
  fi
  [ -n "$DOMINIO" ] || { echo "Falta el dominio. Ejecuta: DOMINIO=aprendo.miescuela.cl ./instalar.sh"; exit 1; }
  NOMBRE="${NOMBRE_SERVIDOR:-Aprendo a Leer}"
  ADMIN_USUARIO="${ADMIN_USUARIO:-admin}"
  ADMIN_CLAVE="${ADMIN_CLAVE:-$(openssl rand -hex 9)}"
  CLAVE_DATOS="$(openssl rand -hex 32)"
  umask 077
  cat > .env <<EOF
DOMINIO=$DOMINIO
NOMBRE_SERVIDOR=$NOMBRE
CENTRAL_DATA_KEY=$CLAVE_DATOS
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_USUARIO=$ADMIN_USUARIO
ADMIN_CLAVE=$ADMIN_CLAVE
ADMIN_NOMBRE=Administrador
ADMIN_APELLIDO=Escuela
TRUST_PROXY=1
COOKIE_SECURE=1
BACKUP_HOURS=24
BACKUP_KEEP=14
EOF
  echo
  echo "=============================================================="
  echo " ANOTA ESTOS DATOS AHORA (se muestran una sola vez):"
  echo
  echo "   Panel:              https://$DOMINIO"
  echo "   Usuario:            $ADMIN_USUARIO"
  echo "   Contraseña:         $ADMIN_CLAVE"
  echo
  echo "   CLAVE DE CIFRADO:   $CLAVE_DATOS"
  echo "   (guárdala en un gestor de contraseñas, aparte del servidor:"
  echo "    sin ella no se pueden leer los nombres de los alumnos)"
  echo "=============================================================="
  echo
fi

if [ "${SALTAR_DOCKER:-0}" = "1" ]; then
  echo "Configuración lista (se omitió Docker)."
  exit 0
fi

docker compose up -d --build

echo "Esperando a que el servidor responda…"
listo=0
for _ in $(seq 1 60); do
  if docker compose exec -T aprendo wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    # La cuenta de administrador ya se creó: la contraseña inicial no debe quedar en el archivo.
    sed -i '/^ADMIN_CLAVE=/d' .env
    listo=1
    break
  fi
  sleep 2
done
if [ "$listo" != "1" ]; then
  echo "El servidor no respondió a tiempo. Revisa: docker compose logs aprendo" >&2
  exit 1
fi

dominio="$(sed -n 's/^DOMINIO=//p' .env)"
url="https://$dominio"
echo "Comprobando que el panel responda por HTTPS con un certificado válido…"
for _ in $(seq 1 18); do
  if curl --proto '=https' --fail --silent --max-time 5 "$url/api/health" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
    echo "Panel disponible en $url. Entra y cambia la contraseña inicial en «Mi cuenta»."
    exit 0
  fi
  sleep 3
done
echo "El servicio local responde, pero todavía no se pudo validar $url." >&2
echo "Revisa el DNS, los puertos 80 y 443, y ejecuta: docker compose logs --tail 100 caddy" >&2
echo "Una vez corregido, vuelve a ejecutar bash instalar.sh con el mismo .env y volumen de datos." >&2
exit 1
