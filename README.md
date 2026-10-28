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

## Acompañamiento con el búho

- En las siete actividades, después de **50 segundos sin interacción**, el búho personalizado aparece con un mensaje de ánimo. El estudiante puede continuar cuando quiera.
- **Más de 10 clics en 8 segundos sobre zonas sin respuesta** (dentro o fuera del ejercicio, incluidos controles deshabilitados) activan una pausa con respiración automática, sin presionar un botón: tres ciclos de tomar aire suavemente y soltarlo despacio. Al terminar se puede repetir el ejercicio. El estudiante puede continuar la actividad en cualquier momento. Las opciones equivocadas y los controles disponibles no se cuentan como clics sin efecto. Es una ayuda por interacción, no una evaluación del estado emocional.
- La pausa manual también ofrece respiración. Se detienen las transiciones, la voz y la reproducción multimedia; una grabación en curso se detiene. Al continuar se conserva la pregunta y los aciertos. La grabación no se reinicia automáticamente.
- Después de continuar hay **60 segundos sin nuevas pausas por clics**. No se muestran avisos en pestañas ocultas, durante una pausa ni después de terminar.
- El espacio del estudiante incluye un **cursor grande con flecha y búho**, con el color de su mascota. El botón «Cursor grande» permite desactivarlo; la preferencia se conserva en ese navegador. No cambia el puntero del sistema ni el panel docente.

Los umbrales se pueden ajustar en `APOYO_LECTURA`, al inicio de `frontend/actividades/actividad.js`, después de observar su uso con las profesoras. Los diálogos admiten teclado, mantienen el foco y respetan la preferencia de reducir movimiento.

### Pistas de lectura y avance para la profesora

En **Formo sílabas**, **Encuentro la letra** y **Aprendo las sílabas**, una pista aparece tras **10 segundos** en la pregunta o paso actual. La opción sugerida se destaca con un borde dorado y tres movimientos suaves; deja de moverse al poner el cursor encima o enfocarla con teclado. La preferencia de reducir movimiento conserva el borde y el mensaje sin animación. La pista espera durante las pausas y se renueva al cambiar de pregunta o colocar/quitar una sílaba. No selecciona ni puntúa la respuesta por el alumno. Para ordenar palabras, indica la siguiente sílaba, cuál quitar si está fuera de orden, o el botón de revisión cuando la palabra ya está formada.

Las **siete actividades** envían al servidor el número de pregunta, las preguntas completadas, la consigna, la respuesta o situación actual y el estado de pausa. Se sincroniza después de los cambios, cada 15 segundos y al salir u ocultar la pestaña. Si la conexión falla, se muestra un aviso discreto y se reintenta al recuperarla. La profesora ve el último dato recibido y su fecha de sincronización; no es un indicador de presencia en tiempo real.

En el panel docente, abre un estudiante y despliega un intento **En progreso** para ver su barra de avance, dónde quedó y cuánto falta. Usa **Actualizar registros** para consultar el avance más reciente; los detalles abiertos se conservan. Los intentos antiguos sin estos datos muestran que aún no hay avance sincronizado. El resumen se guarda en la nueva tabla `AvanceActividad`, creada automáticamente al reiniciar el servidor, sin borrar los registros existentes. El guardado local sigue permitiendo retomar el ejercicio en el mismo navegador.

Prueba integrada: `node tests/pistas-avance.cjs` (requiere Playwright disponible, igual que la prueba siguiente). Crea una base SQLite temporal y cuentas ficticias; verifica las pistas, las pausas, la reconexión, el panel docente, la persistencia y el acceso limitado al intento del alumno. No modifica la base real.

Prueba automática de navegador (usa datos ficticios, sin tocar SQLite): instala Playwright como herramienta de desarrollo o expón su módulo mediante `NODE_PATH`, y ejecuta `node tests/acompanamiento.cjs`. Usa Edge por defecto; `BROWSER_CHANNEL=chrome` permite usar Chrome. Las capturas de la prueba se guardan en `tests/`.

## Uso en red local

El servidor escucha en todas las interfaces de red en el puerto `3000`. Desde otro computador de la misma red, abre `http://IP-LOCAL-DEL-SERVIDOR:3000`. Los navegadores solo permiten usar el micrófono en una conexión segura: usa `http://localhost:3000` en el mismo equipo o configura HTTPS para acceder desde otro dispositivo. El audio de la actividad de pronunciación se reproduce localmente y no se sube ni se guarda. Permite el puerto en el firewall solo en una red privada de confianza; SQLite guarda los datos únicamente en el computador que ejecuta Node.js.
