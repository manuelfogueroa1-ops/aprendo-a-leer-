#!/usr/bin/env bash
# Instala el servidor central en un servidor Linux que tenga Docker.
# Uso (desde la carpeta servidor-central/):   ./instalar.sh
# También sin preguntas:                       DOMINIO=aprendo.miescuela.cl ./instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

necesita() { command -v "$1" >/dev/null 2>&1 || { echo "Falta «$1». $2"; exit 1; }; }
necesita openssl "Instálalo con: sudo apt install openssl"
if [ "${SALTAR_DOCKER:-0}" != "1" ]; then
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
for _ in $(seq 1 60); do
  if docker compose exec -T aprendo wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    # La cuenta de administrador ya se creó: la contraseña inicial no debe quedar en el archivo.
    sed -i '/^ADMIN_CLAVE=/d' .env
    echo
    echo "Listo. Abre https://$(grep '^DOMINIO=' .env | cut -d= -f2) e inicia sesión."
    echo "(La contraseña inicial ya se quitó del archivo .env. Cámbiala en «Mi cuenta».)"
    exit 0
  fi
  sleep 2
done
echo "El servidor no respondió a tiempo. Revisa los mensajes con: docker compose logs"
exit 1
