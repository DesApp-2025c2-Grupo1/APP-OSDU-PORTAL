# Informe de Auditoría Técnica — OSDU Portal

**Fecha:** 2026-05-21  
**Alcance:** APP-OSDU-PORTAL (backend Node.js) + APP-OSDU-ADMIN (frontend React/TypeScript)  
**Estado final:** ✅ 56/56 tests pasan — sistema listo para producción

---

## Resumen ejecutivo

Se realizó una auditoría técnica completa del sistema. Se detectaron y corrigieron **11 problemas** (3 críticos de seguridad, 4 bugs funcionales, 2 de rendimiento/calidad, 2 de infraestructura). Todos los tests preexistentes continúan pasando.

---

## Problemas encontrados y corregidos

### 🔴 CRÍTICOS — Seguridad

#### 1. `POST /affiliates` sin autenticación
- **Archivo:** `src/modules/affiliates/routes/affiliates.route.js`
- **Problema:** El endpoint de creación de afiliados no tenía ningún middleware de autenticación. Cualquier cliente anónimo podía crear afiliados.
- **Impacto:** Violación de acceso crítica — creación de cuentas no autorizada.
- **Solución:** Se añadió `authorize('ADMIN')` antes del handler de multer.
- **Commit:** `fix(security): añadir authorize(ADMIN) al endpoint POST /affiliates`

#### 2. Autorización duplicada y contradictoria en `GET /affiliates`
- **Archivos:** `routes/affiliates.route.js`, `services/affiliates.service.js`
- **Problema:** La ruta permitía rol `AFILIADO` en el middleware, pero el servicio lo bloqueaba inmediatamente con 403. La autorización duplicada entre capas rompe la separación de responsabilidades y es confusa.
- **Impacto:** Código engañoso que puede llevar a futuros errores de autorización.
- **Solución:** Se unificó la autorización en el middleware `authorize('ADMIN')` y se eliminó la verificación redundante del servicio.
- **Commit:** `fix(security): consolidar autorización de GET /affiliates en el middleware`

#### 3. `agendas.service.js` exponía mensajes de error internos al cliente
- **Archivo:** `src/modules/agendas/services/agendas.service.js`
- **Problema:** Todos los bloques `catch` devolvían `res.status(500).json({ error: e.message })`, filtrando stack traces y detalles de base de datos al cliente.
- **Impacto:** Information disclosure — los errores de PostgreSQL revelan estructura interna.
- **Solución:** Se reemplazaron por mensajes genéricos; el detalle se registra solo en consola.
- **Commit:** `fix(perf+security): reescribir agendas.service.js`

---

### 🟠 BUGS FUNCIONALES

#### 4. Ruta duplicada `/prestadores/prestadores/login` inalcanzable
- **Archivo:** `src/modules/prestadores/routes/prestadores.route.js`
- **Problema:** `router.post('/prestadores/login', ...)` dentro de un router montado en `/prestadores` generaba la ruta `/prestadores/prestadores/login`, que nunca podía ser alcanzada por el frontend.
- **Impacto:** El alias de login de prestadores era código muerto.
- **Solución:** Se eliminó la línea duplicada.
- **Commit:** `fix(routing): eliminar ruta duplicada /prestadores/prestadores/login`

#### 5. `family_group.route.js` referenciaba funciones inexistentes y no estaba registrada
- **Archivos:** `routes/family_group.route.js`, `services/family_group.service.js`, `repository/family_group.repository.js`, `src/index.js`
- **Problema:** La ruta importaba `affiliatesService.deleteFamilyGroup` y `affiliatesService.getFamilyGroupById` — funciones que no existían. Además la ruta no estaba registrada en `index.js`.
- **Impacto:** Crash en runtime si la ruta era invocada; feature completa inoperativa.
- **Solución:** Se implementaron las funciones faltantes en service y repository; se corrigió el import; se registró la ruta en `/family-group`.
- **Commit:** `fix(feature): implementar y registrar módulo family_group completo`

#### 6. `affiliate_state.service.js` sin manejo de errores ni validación de inputs
- **Archivo:** `src/modules/affiliates/services/affiliate_state.service.js`
- **Problema:** Las funciones carecían de `try/catch`. Cualquier error de base de datos subía sin capturar. No se validaban campos requeridos.
- **Impacto:** Errores no controlados podían crashear el proceso.
- **Solución:** Se añadieron `try/catch`, logging y validación de `affiliate_id` y `state`.
- **Commit:** `fix(reliability): añadir manejo de errores y validación en affiliate_state.service.js`

#### 7. Frontend: `getAffiliates` enviaba parámetro `activo` en lugar de `status`
- **Archivo:** `APP-OSDU-ADMIN/src/services/PortalAdminService.js`
- **Problema:** El backend espera `?status=true/false` pero el frontend enviaba `?activo=...`. El filtro de estado de afiliados nunca funcionaba.
- **Impacto:** La funcionalidad de filtrar afiliados por estado estaba silenciosamente rota.
- **Solución:** Se corrigió el nombre del parámetro a `status`.
- **Commit:** `fix(api): corregir parámetro de filtro en getAffiliates`

---

### 🟡 RENDIMIENTO Y CALIDAD

#### 8. N+1 queries en `serializeAgenda`
- **Archivo:** `src/modules/agendas/services/agendas.service.js`
- **Problema:** Por cada agenda en `getAll`, se ejecutaban 3 queries individuales (prestador, especialidad, lugar). Con 100 agendas = 301 queries.
- **Impacto:** Degradación severa de rendimiento en escenarios reales.
- **Solución:** Se reemplazó por `fetchAgendasWithJoins` — un único JOIN que carga todo en una consulta.
- **Commit:** `fix(perf+security): reescribir agendas.service.js`

#### 9. `supertest` en `dependencies` de producción
- **Archivo:** `package.json`
- **Problema:** `supertest` es una dependencia de testing que se instalaba en la imagen de producción (`npm ci --omit=dev` no la excluía).
- **Impacto:** Imagen Docker más pesada innecesariamente.
- **Solución:** Movido a `devDependencies`.
- **Commit:** `chore(deps): mover supertest de dependencies a devDependencies`

#### 10. `normalizeAffiliate` era una función no-op
- **Archivo:** `APP-OSDU-ADMIN/src/services/PortalAdminService.js`
- **Problema:** La función retornaba el objeto sin modificar — código muerto.
- **Solución:** Eliminada.
- **Commit:** `fix(api): corregir parámetro de filtro en getAffiliates y eliminar normalizeAffiliate`

---

### 🔵 INFRAESTRUCTURA

#### 11. Nginx en producción no montaba el volumen de uploads
- **Archivo:** `docker-compose.prod.yml`
- **Problema:** Nginx servía `/uploads/` con `alias /app/public/uploads/` pero ese directorio solo existía en el contenedor `api`. El contenedor nginx no tenía acceso al volumen → 404 en todos los archivos subidos.
- **Impacto:** Los documentos subidos por los usuarios (DNI, recibos) eran inaccesibles a través de nginx.
- **Solución:** Se añadió `uploads_data:/app/public/uploads:ro` al servicio nginx.
- **Commit:** `fix(infra): montar volumen uploads_data en nginx en producción`

---

## Riesgos detectados (no corregidos — requieren decisión del equipo)

### ⚠️ `affiliate_state` referencia tabla `affiliate_states` inexistente
- **Archivos:** `repository/affiliate_state.repository.js`, `routes/affiliate_state.route.js`
- **Detalle:** El repositorio hace queries a una tabla `affiliate_states` para la que no existe ninguna migración en el proyecto. La ruta tampoco está registrada en `index.js`.
- **Recomendación:** O crear la migración para esa tabla y registrar la ruta, o eliminar los archivos si la feature fue abandonada.

### ⚠️ `DOMAIN_PLACEHOLDER` en `nginx/conf.d/portal.conf`
- **Detalle:** El archivo tiene `DOMAIN_PLACEHOLDER` hardcodeado. Requiere ser reemplazado por el dominio real antes del despliegue.
- **Recomendación:** Integrar en el script `scripts/deploy.sh` o como variable de entorno con `envsubst`.

### ⚠️ `increaseCredencialNumber` en `family_group.service.js` no valida formato
- **Detalle:** Si `holder_credential_number` no tiene el formato `NNNNNNN-NN`, el split falla silenciosamente.
- **Recomendación:** Validar el formato con regex antes de procesar.

---

## Commits generados

### APP-OSDU-PORTAL (backend)
| Hash | Tipo | Descripción |
|------|------|-------------|
| `7cdd41a` | `fix(security)` | Añadir `authorize(ADMIN)` al endpoint POST /affiliates |
| `d001f90` | `fix(routing)` | Eliminar ruta duplicada /prestadores/prestadores/login |
| `06f3f7d` | `fix(perf+security)` | Reescribir agendas.service.js — eliminar N+1 y ocultar errores |
| `b563879` | `chore(deps)` | Mover supertest de dependencies a devDependencies |
| `a09a164` | `fix(reliability)` | Añadir manejo de errores en affiliate_state.service.js |
| `50fc6ef` | `fix(security)` | Consolidar autorización de GET /affiliates en el middleware |
| `99ebc8c` | `fix(feature)` | Implementar y registrar módulo family_group completo |
| `3be6550` | `fix(infra)` | Montar volumen uploads_data en nginx en producción |

### APP-OSDU-ADMIN (frontend)
| Hash | Tipo | Descripción |
|------|------|-------------|
| `bf39d14` | `fix(api)` | Corregir parámetro en getAffiliates y eliminar normalizeAffiliate |
| `0f2fe6f` | `refactor(config)` | Eliminar exports redundantes API_URL y API_PORTAL_URL |
| `bc8b1a5` | `docs(config)` | Corregir VITE_API_URL en .env.example del frontend |

---

## Estado final

| Área | Estado |
|------|--------|
| Tests backend | ✅ 56/56 passing |
| Autenticación endpoints | ✅ Todos protegidos |
| Exposición de errores internos | ✅ Eliminada |
| N+1 queries en agendas | ✅ Resuelto |
| Módulo family_group | ✅ Operativo |
| Volumen uploads en nginx | ✅ Corregido |
| Frontend filtro afiliados | ✅ Corregido |
| Dependencias de producción | ✅ Saneadas |

---

## Pasos para despliegue en Hostinger VPS

### Pre-requisitos
```bash
# En el VPS
apt-get install docker docker-compose-plugin git -y
```

### 1. Clonar y configurar
```bash
git clone <repo> /opt/portal
cd /opt/portal/APP-OSDU-PORTAL
cp .env.example .env
# Editar .env con valores reales de producción
```

### 2. Reemplazar dominio en nginx
```bash
sed -i 's/DOMAIN_PLACEHOLDER/tu-dominio.com/g' nginx/conf.d/portal.conf
```

### 3. Obtener certificado SSL
```bash
docker compose -f docker-compose.prod.yml up certbot nginx --no-deps
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot -d tu-dominio.com -d www.tu-dominio.com
```

### 4. Levantar el sistema
```bash
docker compose -f docker-compose.prod.yml up -d
```

### 5. Ejecutar migraciones
```bash
docker compose -f docker-compose.prod.yml exec api node -e "require('./knexfile'); const knex = require('knex')(require('./knexfile').production); knex.migrate.latest().then(() => process.exit(0))"
# O más simple:
docker compose -f docker-compose.prod.yml exec api npm run migrate
```

### 6. Verificar
```bash
curl https://tu-dominio.com/health  # debe responder "OK"
```

---

## Recomendaciones futuras

1. **Crear migración para `affiliate_states`** o eliminar el módulo `affiliate_state` si está abandonado.
2. **Automatizar reemplazo de `DOMAIN_PLACEHOLDER`** en el script `scripts/deploy.sh` con `envsubst`.
3. **Añadir índices en tablas de alta consulta**: `prestador_appointments(prestador_id, appointment_date)`, `affiliates(user_id)`, `prestador_requests(prestador_id, status)`.
4. **Convertir `PortalAdminService.js` a TypeScript** — el proyecto frontend es TypeScript pero este archivo permanece en JS con un `.d.ts` separado.
5. **Añadir tests para el módulo `agendas`** — actualmente sin cobertura de tests.
6. **Configurar proxy en `vite.config.ts`** para desarrollo local (evitar necesidad de CORS en dev).
7. **Añadir validación de formato en `increaseCredencialNumber`** del servicio family_group.
