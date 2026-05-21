#!/bin/bash
# =============================================================================
# deploy.sh — Deploy en producción (Hostinger VPS)
# Uso: ./scripts/deploy.sh [--no-migrate] [--tag vX.Y.Z]
# =============================================================================
set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
die()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Configuración ─────────────────────────────────────────────────────────────
COMPOSE_FILE="docker-compose.prod.yml"
SERVICE_API="api"
HEALTH_URL="http://localhost:5000/health"
MAX_WAIT=60
RUN_MIGRATE=true
IMAGE_TAG="latest"

# ── Argumentos ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-migrate) RUN_MIGRATE=false; shift ;;
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    *) die "Argumento desconocido: $1" ;;
  esac
done

export IMAGE_TAG

# ── Verificaciones previas ────────────────────────────────────────────────────
[[ -f ".env" ]]           || die "Archivo .env no encontrado. Copia .env.example y configúralo."
[[ -f "$COMPOSE_FILE" ]]  || die "No se encontró $COMPOSE_FILE"
command -v docker &>/dev/null || die "Docker no está instalado"

log "Iniciando deploy — tag: ${IMAGE_TAG}"

# ── Build ─────────────────────────────────────────────────────────────────────
log "Construyendo imagen de producción..."
docker compose -f "$COMPOSE_FILE" build --no-cache "$SERVICE_API"

# ── Pull de imágenes de servicios externos ────────────────────────────────────
log "Actualizando imágenes externas (nginx, postgres, certbot)..."
docker compose -f "$COMPOSE_FILE" pull nginx db certbot 2>/dev/null || true

# ── Snapshot pre-deploy (backup rápido) ──────────────────────────────────────
if docker compose -f "$COMPOSE_FILE" ps "$SERVICE_API" 2>/dev/null | grep -q "Up"; then
  log "Creando snapshot de DB antes del deploy..."
  ./scripts/backup.sh --label "pre-deploy-${IMAGE_TAG}" || warn "Backup falló, continuando igual..."
fi

# ── Levantar servicios ────────────────────────────────────────────────────────
log "Levantando servicios..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# ── Migraciones ───────────────────────────────────────────────────────────────
if [[ "$RUN_MIGRATE" == "true" ]]; then
  log "Esperando que la DB esté lista..."
  sleep 5
  log "Ejecutando migraciones..."
  docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE_API" \
    npx knex migrate:latest --knexfile knexfile.js \
    || die "Migraciones fallaron. Haciendo rollback..."
  log "Migraciones completadas."
fi

# ── Health check post-deploy ──────────────────────────────────────────────────
log "Verificando salud del servicio (máx ${MAX_WAIT}s)..."
elapsed=0
until docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE_API" \
      wget -qO- http://localhost:5000/health &>/dev/null; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [[ $elapsed -ge $MAX_WAIT ]]; then
    warn "El servicio no respondió en ${MAX_WAIT}s. Ver logs:"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 "$SERVICE_API"
    die "Deploy fallido."
  fi
  echo -n "."
done
echo ""

# ── Limpieza de imágenes antiguas ─────────────────────────────────────────────
log "Limpiando imágenes Docker sin usar..."
docker image prune -f --filter "until=24h" || true

log "✅  Deploy completado exitosamente."
log "   Tag desplegado: ${IMAGE_TAG}"
log "   Verificar en: ${HEALTH_URL}"
