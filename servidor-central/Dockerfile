# Imagen del servidor central. Se construye desde la raíz del repositorio:
#   docker compose -f servidor-central/docker-compose.yml up -d --build
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY servidor-central/package.json servidor-central/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY servidor-central/ ./
# Estilos, fuente e informe docente compartidos con la aplicación de los computadores.
COPY frontend/styles.css frontend/fuentes.css frontend/informe-docente.js ./frontend-compartido/
COPY frontend/assets/fuentes ./frontend-compartido/assets/fuentes

ENV FRONTEND_DIR=/app/frontend-compartido \
    DATA_DIR=/datos \
    PORT=8080 \
    TRUST_PROXY=1
RUN mkdir -p /datos && chown node:node /datos
USER node
VOLUME /datos
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server.js"]
