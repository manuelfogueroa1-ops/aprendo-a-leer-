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

En **Completo el cuento**, los espacios tienen colores del tema del estudiante y el seleccionado se destaca; las letras completadas se integran al texto. Cada palabra se mantiene unida al cambiar de línea, también en pantallas pequeñas y modo oscuro. `node tests/cuento-visual.cjs` comprueba los tres cuentos y genera capturas en `dist/revision-cuento/`.

## Acompañamiento con el búho

### Voz de las actividades

**Grabaciones humanas incorporadas:** cinco actividades usan las notas de WhatsApp del guion, independientemente del selector de voz sintética. Las primeras **82 notas** contienen **27 preguntas**, **27 nombres de letras**, **90 sílabas individuales** y mensajes de bienvenida, repetición, ayuda, acierto y cierre para «Reconozco las letras» y «Formo sílabas». Se agregaron **23 notas** para guiar «Uno la palabra con su imagen», «Encuentro la letra» y «Aprendo las sílabas»: **113 originales y 185 clips WAV**, incluidas las ocho sílabas adicionales recibidas después en total. La bienvenida de letras no estaba en la entrega; esa actividad comienza directamente con la pregunta grabada. El botón docente **Escuchar grabación humana** permite probar una toma.

Las tres actividades con nuevas instrucciones incluyen un botón **Escuchar instrucciones**. Las pistas grabadas respetan la espera de 10 segundos después de la instrucción y cambian según corresponda elegir, quitar o revisar sílabas. La pausa corta la reproducción y al reanudar repite la secuencia pendiente; los aciertos que avanzan automáticamente y los cierres esperan a que termine el audio. Las instrucciones nuevas son generales: no se generan nombres de palabras que no se hayan grabado.

En «Encuentro la letra» la elección reproduce primero el nombre grabado de la letra y luego el acierto o apoyo. En «Aprendo las sílabas» se escucha la sílaba al elegirla o quitarla; la última termina antes de la instrucción de revisar. Se reutilizan los clips con filtro grave, incluidas las vocales solas desde los nombres de letras. Las sílabas `llo`, `man`, `he`, `es`, `tre`, `lla`, `col` y `fan` no tienen toma humana todavía y permanecen sin pronunciación; no se sustituyen por voz sintética ni por nombres de letras unidos. La actividad conserva sus palabras y opciones.

Los originales se conservan junto a las versiones preparadas en `frontend/assets/audio/grabaciones/originales/`; la carpeta de origen no se modifica. La importación ajusta el volumen y los silencios de los bordes sin modificar tono ni velocidad. Cada familia se separó en cinco tomas, siguiendo A, E, I, O, U. El informe `informe-importacion.json` conserva los tiempos de los cortes. `frontend/grabaciones.js` relaciona cada etiqueta con su archivo y duración. No se solicitan voces generadas para los audios ya grabados de estas actividades; las demás secciones conservan el motor de voz seleccionado.

La voz grabada activa usa el perfil **grave** aprobado: −2,5 semitonos, con resonancias desplazadas y sin cambiar el ritmo. Sus 185 archivos están en `frontend/assets/audio/grabaciones/grave/`; los WAV de partida permanecen intactos en la carpeta superior. El informe `grave/informe-conversion.json` registra duración, nivel y hash de cada resultado. Las URLs incluyen el hash para renovar la caché. Este procesamiento funciona sin internet y no garantiza anonimizar a quien habla.

Las preguntas, opciones, reintentos y pausas usan el mismo reproductor; los mensajes de acierto terminan antes de avanzar y el cierre grabado se escucha antes del regreso automático. La pista de sílabas se programa después de las instrucciones para evitar que tape la bienvenida o la pregunta.

Para importar otra entrega con las mismas etiquetas:

```powershell
./.venv-piper/Scripts/python.exe -m pip install -r scripts/requirements-audios.txt
./.venv-piper/Scripts/python.exe scripts/importar-grabaciones.py 'RUTA_A_LAS_NOTAS'
./.venv-piper/Scripts/python.exe scripts/aplicar-voz-grave.py
```

Para agregar otra carpeta sin retirar las grabaciones anteriores, usa `scripts/importar-grabaciones.py 'RUTA_A_LAS_NOTAS_NUEVAS' --complementar` y vuelve a ejecutar `scripts/aplicar-voz-grave.py`. El filtro siempre parte de los WAV sin efecto, por lo que no acumula cambios de tono al repetirlo.

Las notas de familia deben tener cinco sílabas en orden A, E, I, O, U, separadas por pausas. Si no se detectan cinco segmentos, la importación se detiene para revisar esa toma. `node tests/grabaciones.cjs` prueba los archivos reales y los dos primeros niveles; `node tests/grabaciones-guia.cjs` verifica que se usen las 23 instrucciones nuevas, las pistas según la respuesta, las pausas y los cierres completos. Ambos requieren Playwright, no usan síntesis de voz, SQLite ni datos de alumnos.

**Voz local actual: Kokoro**, con las voces españolas **Dora** y **Alex**. La selección automática prefiere Dora cuando están instalados sus archivos. Se conserva Piper como alternativa mediante `LOCAL_TTS_ENGINE=piper`; `LOCAL_TTS_ENGINE=kokoro` permite seleccionarlo explícitamente. Una selección anterior de Piper en el navegador pasa a la opción automática al actualizar. El cambio modifica el motor y el timbre, no solamente la velocidad. Las muestras para comparar están en `frontend/assets/audio/kokoro/`. La naturalidad y la pronunciación de sílabas cortas deben revisarse con las profesoras.

La primera frase puede tardar unos segundos en cargar el modelo; las siguientes reutilizan el proceso y los audios que ya están en memoria. Una conexión a internet solo se necesita para la instalación inicial. Los audios se generan en el computador que ejecuta Node.js y se envían por la red local a los alumnos.

En otro equipo Windows, instala Python 3.12 y ejecuta desde la raíz del proyecto:

```powershell
./scripts/instalar-kokoro.ps1 -Python 'RUTA_AL_PYTHON_3.12/python.exe'
npm start
```

El entorno `.venv-piper` y los pesos de `backend/voices/` no se incluyen en Git. `PIPER_PYTHON` permite indicar el intérprete y `PIPER_MODEL` el modelo para el motor Piper; `PIPER_DISABLED=1` desactiva toda la generación local. El origen y las licencias se documentan en `backend/voices/`. Las muestras anteriores de Piper siguen en `frontend/assets/audio/piper/`.

La ruta `POST /api/voz/local` (también disponible como `/api/voz/piper` por compatibilidad) requiere una sesión de alumno o profesora y limita el texto a 1.000 caracteres. Mantiene una caché en memoria de hasta 32 MiB: no crea archivos con los saludos o nombres de los alumnos. La pausa y el cambio de pantalla cancelan la reproducción y descartan audios que llegan tarde. Si la generación falla, el navegador puede usar su voz habitual; el panel docente muestra ese estado. La prueba `node tests/piper.cjs`, con Playwright disponible, verifica el motor local instalado, sus voces, el audio, los permisos y las pausas usando SQLite temporal.

El búho, las instrucciones y los ejercicios comparten la selección de voz de `frontend/voz.js`. Como alternativas a la generación local se priorizan voces en español identificadas como naturales por el navegador; entre las voces de Windows se prefiere **Microsoft Laura** cuando está disponible. Las voces disponibles dependen del navegador y del equipo.

En **Acceso docente → Voz para las actividades**, la profesora puede elegir una voz en español y usar **Escuchar esta voz**, **Probar sílabas** y **Probar palabras** para compararlas. La selección se guarda en ese navegador y se aplica también al volver a las actividades del estudiante. No requiere claves ni servicios de voz externos. La prueba `node tests/voz.cjs` verifica la selección, la preferencia guardada y la carga tardía de voces.

**Pronunciación y desbloqueo:** al completar las cinco palabras se guardan sus respuestas y se desbloquea **Completo el cuento**. Si el guardado falla se puede reintentar; una práctica ya terminada en el almacenamiento local se recupera sin repetir las cinco palabras. `node tests/pronunciacion.cjs` recorre el flujo con grabaciones simuladas, un fallo temporal de guardado, recuperación y la alternativa manual, manteniendo el bloqueo de niveles activo y usando SQLite temporal.

- En las siete actividades, después de **50 segundos sin interacción**, el búho personalizado aparece con un mensaje de ánimo. El estudiante puede continuar cuando quiera.
- **Más de 10 clics en 8 segundos sobre zonas sin respuesta** (dentro o fuera del ejercicio, incluidos controles deshabilitados) activan una pausa con respiración automática, sin presionar un botón: tres ciclos de tomar aire suavemente y soltarlo despacio. Al terminar se puede repetir el ejercicio. El estudiante puede continuar la actividad en cualquier momento. Las opciones equivocadas y los controles disponibles no se cuentan como clics sin efecto. Es una ayuda por interacción, no una evaluación del estado emocional.
- La pausa manual también ofrece respiración. Se detienen las transiciones, la voz y la reproducción multimedia; una grabación en curso se detiene. Al continuar se conserva la pregunta y los aciertos. La grabación no se reinicia automáticamente.
- Después de continuar hay **60 segundos sin nuevas pausas por clics**. No se muestran avisos en pestañas ocultas, durante una pausa ni después de terminar.
- El espacio del estudiante incluye un **cursor grande con flecha y búho**, con el color de su mascota. El botón «Cursor grande» permite desactivarlo; la preferencia se conserva en ese navegador. No cambia el puntero del sistema ni el panel docente.

Los umbrales se pueden ajustar en `APOYO_LECTURA`, al inicio de `frontend/actividades/actividad.js`, después de observar su uso con las profesoras. Los diálogos admiten teclado, mantienen el foco y respetan la preferencia de reducir movimiento.

### Pistas de lectura y avance para la profesora

En **Aprendo las sílabas**, las opciones mezclan todas las sílabas de la palabra con **dos sílabas extra diferentes** que no pertenecen a ella. Solo hay espacios para las sílabas necesarias. Los distractores permanecen durante los reintentos y se conservan al retomar el avance local.

**Formo sílabas** incluye 90 sílabas de las familias P, M, L, S, T, N, D, B, F, R, V, J, C, G, Z, Ñ, Y y K con las cinco vocales. Se retiraron LL, CH, RR, H, QU, GU y GÜ tanto de las preguntas como de los distractores. El avance local del catálogo anterior se adapta al nuevo recorrido, conservando las respuestas de las familias que permanecen.

En **Formo sílabas**, **Encuentro la letra** y **Aprendo las sílabas**, una pista aparece tras **10 segundos** en la pregunta o paso actual. La opción sugerida se destaca con un borde dorado y tres movimientos suaves; deja de moverse al poner el cursor encima o enfocarla con teclado. La preferencia de reducir movimiento conserva el borde y el mensaje sin animación. La pista espera durante las pausas y se renueva al cambiar de pregunta o colocar/quitar una sílaba. No selecciona ni puntúa la respuesta por el alumno. Para ordenar palabras, indica la siguiente sílaba, cuál quitar si está fuera de orden, o el botón de revisión cuando la palabra ya está formada.

Las **siete actividades** envían al servidor el número de pregunta, las preguntas completadas, la consigna, la respuesta o situación actual y el estado de pausa. Se sincroniza después de los cambios, cada 15 segundos y al salir u ocultar la pestaña. Si la conexión falla, se muestra un aviso discreto y se reintenta al recuperarla. La profesora ve el último dato recibido y su fecha de sincronización; no es un indicador de presencia en tiempo real.

En el panel docente, abre un estudiante y despliega un intento **En progreso** para ver su barra de avance, dónde quedó y cuánto falta. Usa **Actualizar registros** para consultar el avance más reciente; los detalles abiertos se conservan. Los intentos antiguos sin estos datos muestran que aún no hay avance sincronizado. El resumen se guarda en la nueva tabla `AvanceActividad`, creada automáticamente al reiniciar el servidor, sin borrar los registros existentes. El guardado local sigue permitiendo retomar el ejercicio en el mismo navegador.

Prueba integrada: `node tests/pistas-avance.cjs` (requiere Playwright disponible, igual que la prueba siguiente). Crea una base SQLite temporal y cuentas ficticias; verifica las pistas, las pausas, la reconexión, el panel docente, la persistencia y el acceso limitado al intento del alumno. No modifica la base real.

Prueba automática de navegador (usa datos ficticios, sin tocar SQLite): instala Playwright como herramienta de desarrollo o expón su módulo mediante `NODE_PATH`, y ejecuta `node tests/acompanamiento.cjs`. Usa Edge por defecto; `BROWSER_CHANNEL=chrome` permite usar Chrome. Las capturas de la prueba se guardan en `tests/`.

## Uso en red local

El servidor escucha en todas las interfaces de red en el puerto `3000`. Desde otro computador de la misma red, abre `http://IP-LOCAL-DEL-SERVIDOR:3000`. Los navegadores solo permiten usar el micrófono en una conexión segura: usa `http://localhost:3000` en el mismo equipo o configura HTTPS para acceder desde otro dispositivo. El audio de la actividad de pronunciación se reproduce localmente y no se sube ni se guarda. Permite el puerto en el firewall solo en una red privada de confianza; SQLite guarda los datos únicamente en el computador que ejecuta Node.js.
