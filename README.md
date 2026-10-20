# Software Educativo Web

Aplicación educativa para practicar lectura, con frontend, backend Node.js y base de datos local SQLite.

## Estructura

- `frontend/`: páginas, estilos y actividades interactivas.
- `backend/server.js`: API y servidor web.
- `backend/database.js`: inicialización y acceso a la base local.
- `backend/sqlite/schema.sql`: esquema completo y actividades iniciales.
- `backend/data/software-educativo.sqlite`: base de datos creada automáticamente al iniciar.

## Requisitos

- Node.js 22.5.0 o superior (usa el módulo SQLite incluido en Node.js).
- No se requiere instalar SQL Server ni configurar usuarios, puertos o contraseñas de base de datos.

## Inicio

1. Instala Node.js 22.5.0 o superior.
2. En la raíz del proyecto, crea `.env` copiando `.env.example`.
3. Cambia `SESSION_SECRET` por una frase privada de al menos 24 caracteres.
4. Genera una clave de cifrado aleatoria con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y guarda el resultado en `STUDENT_DATA_KEY` dentro de `.env`. No la publiques ni la guardes en el repositorio.
5. En una terminal ubicada en la raíz del proyecto, ejecuta:

   ```bash
   npm install
   npm start
   ```

6. Abre `http://localhost:3000` e inicia sesión desde **Acceso profesor**.
7. En el panel docente, agrega cada estudiante con nombre y apellido. Después, en **Estudiantes**, aparecerá una tarjeta con su nombre para que pueda elegirla y entrar a las actividades.

Al iniciar, el backend crea automáticamente el directorio y archivo SQLite, las tablas, los índices y el catálogo de actividades. No necesitas abrir ni ejecutar scripts en SSMS.

## Datos y esquema

La base guarda los estudiantes agregados por la profesora, profesores, actividades, intentos/resultados y progreso de estudiantes. Los nombres y apellidos de los estudiantes se cifran con AES-256-GCM antes de guardarse en SQLite; el servidor los descifra solo para mostrarlos y procesarlos. La clave `STUDENT_DATA_KEY` se mantiene fuera de la base de datos. No la pierdas: sin ella no se pueden recuperar los nombres, y las copias de seguridad de la base deben conservarse junto con una copia segura de esa clave. Al iniciar con una base anterior, se cifran automáticamente los nombres que ya estaban guardados. Los nombres elegidos en la pantalla de estudiantes se cargan desde SQLite; no se pueden crear desde esa pantalla. Su ubicación predeterminada es `backend/data/software-educativo.sqlite`; se puede cambiar con `DB_FILE` en `.env`. Si la base aún no existe, se inicializa con las actividades incluidas. No borres este archivo si quieres conservar los nombres y resultados.

Si ya habías guardado información en SQL Server, permanece en esa instancia y no se copia automáticamente al nuevo archivo SQLite.

## Cuenta del profesor

Desde la raíz del proyecto, crea una cuenta docente con:

```bash
npm run crear-profesor -- profe "UsaUnaClavePrivadaLarga" "Nombre" "Apellido" "profe@escuela.cl"
```

La contraseña debe tener al menos 12 caracteres y se guarda como hash bcrypt. Usa una contraseña propia y no la compartas.

## Actividades

El recorrido de lectura tiene seis niveles progresivos: **Reconozco las letras**, **Formo sílabas**, **Uno la palabra con su imagen**, **Encuentro la letra**, **Aprendo las sílabas** y **Practico la pronunciación**. Cada nivel se desbloquea al completar el anterior; el servidor también bloquea el inicio directo de actividades que aún no están desbloqueadas. Los intentos y resultados se guardan en SQLite. La práctica de pronunciación usa las capacidades de voz del navegador cuando están disponibles y ofrece una alternativa manual.

El endpoint `GET /api/health` comprueba que la base local pueda responder.

## Uso en red local

El servidor escucha en todas las interfaces de red en el puerto `3000`. Desde otro computador de la misma red, abre `http://IP-LOCAL-DEL-SERVIDOR:3000`. Los navegadores solo permiten usar el micrófono en una conexión segura: usa `http://localhost:3000` en el mismo equipo o configura HTTPS para acceder desde otro dispositivo. El audio de la actividad de pronunciación se reproduce localmente y no se sube ni se guarda. Permite el puerto en el firewall solo en una red privada de confianza; SQLite guarda los datos únicamente en el computador que ejecuta Node.js.
