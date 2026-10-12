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
4. En una terminal ubicada en la raíz del proyecto, ejecuta:

   ```bash
   npm install
   npm start
   ```

5. Abre `http://localhost:3000` e inicia sesión desde **Acceso profesor**.
6. En el panel docente, agrega cada estudiante con nombre y apellido. Después, en **Estudiantes**, aparecerá una tarjeta con su nombre para que pueda elegirla y entrar a las actividades.

Al iniciar, el backend crea automáticamente el directorio y archivo SQLite, las tablas, los índices y el catálogo de actividades. No necesitas abrir ni ejecutar scripts en SSMS.

## Datos y esquema

La base guarda los estudiantes agregados por la profesora, profesores, actividades, intentos/resultados y progreso de estudiantes. Los nombres elegidos en la pantalla de estudiantes se cargan desde SQLite; no se pueden crear desde esa pantalla. Su ubicación predeterminada es `backend/data/software-educativo.sqlite`; se puede cambiar con `DB_FILE` en `.env`. Si la base aún no existe, se inicializa con las cuatro actividades incluidas. No borres este archivo si quieres conservar los nombres y resultados.

Si ya habías guardado información en SQL Server, permanece en esa instancia y no se copia automáticamente al nuevo archivo SQLite.

## Cuenta del profesor

Desde la raíz del proyecto, crea una cuenta docente con:

```bash
npm run crear-profesor -- profe "UsaUnaClavePrivadaLarga" "Nombre" "Apellido" "profe@escuela.cl"
```

La contraseña debe tener al menos 12 caracteres y se guarda como hash bcrypt. Usa una contraseña propia y no la compartas.

## Actividades

El estudiante puede elegir las actividades de sílabas, pronunciación, letras faltantes y el cuestionario de ejemplo. Los intentos y resultados se guardan en SQLite. La práctica de pronunciación usa las capacidades de voz del navegador cuando están disponibles y ofrece una alternativa manual.

El endpoint `GET /api/health` comprueba que la base local pueda responder.

## Uso en red local

El servidor escucha en todas las interfaces de red en el puerto `3000`. Desde otro computador de la misma red, abre `http://IP-LOCAL-DEL-SERVIDOR:3000`. Permite el puerto en el firewall solo en una red privada de confianza; SQLite guarda los datos únicamente en el computador que ejecuta Node.js.
