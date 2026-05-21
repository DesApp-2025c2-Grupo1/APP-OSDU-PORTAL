# ─── Stage 1: instalar dependencias de producción ────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copiar solo los manifests para aprovechar cache de capas
COPY package.json package-lock.json ./

# Solo dependencias de producción
RUN npm ci --omit=dev --ignore-scripts && \
    # Limpiar cache de npm para reducir tamaño
    npm cache clean --force

# ─── Stage 2: imagen de producción ───────────────────────────────────────────
FROM node:22-alpine AS production

# Metadatos
LABEL maintainer="UNAHUR Portal" \
      org.opencontainers.image.title="ms-unahur-portal" \
      org.opencontainers.image.description="Portal Obra Social UNAHUR — API" \
      org.opencontainers.image.base.name="node:22-alpine"

# Zona horaria Argentina
ENV TZ=America/Argentina/Buenos_Aires

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone && \
    apk del tzdata

WORKDIR /app

# Copiar dependencias de producción desde la etapa anterior
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente (el .dockerignore excluye lo innecesario)
COPY . .

# Crear directorio de uploads y asignar propietario al usuario node (no root)
RUN mkdir -p public/uploads && \
    chown -R node:node /app

# Usar usuario no-root (node ya viene en la imagen oficial)
USER node

# Variables de entorno que NO son secretas
ENV NODE_ENV=production \
    PORT=5000

EXPOSE 5000

# Healthcheck: verifica que el endpoint /health responde
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Ejecutar directamente con node (más rápido que npm, señales POSIX correctas)
CMD ["node", "src/server.js"]
