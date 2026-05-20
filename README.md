# 🏥 ms-unahur-portal (Backend)

Sistema de gestión para el Portal de Medicina Integral UNAHUR. Este microservicio se encarga de la autenticación, gestión de afiliados y notificaciones por correo electrónico.

## 🚀 Tecnologías
- **Runtime:** Node.js (v24+)
- **Framework:** Express.js
- **Base de Datos:** PostgreSQL
- **Query Builder:** Knex.js
- **Seguridad:** JWT (Cookies HttpOnly) & Bcrypt
- **Validación:** Joi
- **Mails:** Nodemailer + Mailpit (Docker)

## 🛠️ Instalación y Ejecución

### Requisitos previos
- Docker & Docker Compose
- Node.js instalado (para desarrollo local)

### Configuración inicial
1. Clona el repositorio.
2. Asegúrate de tener el archivo `.env` configurado.
3. Copia el archivo de ejemplo de variables de entorno si no existe:
   ```bash
   cp .env.example .env (si aplica)
   ```

### Levantar con Docker (Recomendado)
```bash
docker-compose up -d --build
```
*El sistema estará disponible en el puerto configurado (ej. 9002).*

### Migraciones y Datos de Prueba
Para inicializar la base de datos y cargar los datos iniciales:
```bash
npm run migrate  # Crea las tablas (si tienes knex global o vía script)
npm run seed     # Carga planes, roles y usuarios iniciales
```

## 📂 Organización del Proyecto
El proyecto sigue una arquitectura modular y principios de Responsabilidad Única:
- `src/config/`: Configuraciones globales (DB, Mail, Swagger).
- `src/database/`: Migraciones y seeds de Knex.
- `src/modules/`: Lógica de negocio dividida por dominio:
    - `auth/`: Autenticación, registro interno y gestión de tokens.
    - `affiliates/`: Gestión de afiliados, estados y grupos familiares. Incluye validaciones con Joi y transacciones atómicas.
    - `mail/`: Servicio de notificaciones con sistema de caché de plantillas para alto rendimiento.

## 📧 Pruebas de Correo (Mailpit)
Para visualizar los correos enviados por el sistema en desarrollo:
1. Asegúrate de que el contenedor `mailpit` esté corriendo.
2. Accede a: **`http://localhost:8025`**

## 🔒 Seguridad e Integridad
- **Transacciones SQL:** El registro de afiliados utiliza transacciones para asegurar que no se creen usuarios sin su afiliación correspondiente (o viceversa).
- **Validación de Esquema:** Todas las entradas al sistema son validadas con `Joi` antes de ser procesadas.
- **Cookies HttpOnly:** Los tokens JWT se manejan vía cookies para prevenir ataques XSS.
- **BCrypt:** Hashing de contraseñas con factor de costo 10.

## Para correr los test usar npm run test:report
- Resultados de las pruebas:

- health.test.js — 1 test
Verifica que el servidor esté vivo.

✅ GET /health devuelve 200
auth.test.js — 5 tests
Prueba el login y el acceso protegido:

✅ Login con credenciales correctas → devuelve datos del usuario
❌ Login con contraseña incorrecta → 401
❌ Login con usuario que no existe → 401
❌ Login con afiliado cuya cuenta está inactiva → 401
❌ GET /auth/me sin token → 401

- usuarios.test.js — 4 tests. Prueba los endpoints de afiliados (requieren token JWT):

✅ GET /affiliates/1 con token → devuelve el afiliado
❌ GET /affiliates/99999 con token → 404 (no existe)
✅ GET /affiliates con token → devuelve lista
✅ GET /affiliates?status=ACTIVE con token → filtra por estado
❌ GET /affiliates/1 sin token → 401

- integration.test.js — 11 tests. Prueba cómo los 3 módulos interactúan entre sí:

- Flujo Auth ↔ Afiliados:

✅ Afiliado activo puede hacer login
❌ Afiliado inactivo no puede hacer login (el módulo auth consulta al módulo afiliados)
✅ ADMIN hace login sin verificar estado de afiliado

- Flujo Auth protegido:

❌ /auth/me sin token → 401
✅ /auth/me con token válido → devuelve datos
❌ /auth/me con token inválido → 403

- Flujo Prestadores ↔ Afiliados:

❌ Buscar afiliados sin token → 401
✅ Prestador busca afiliados con token → devuelve lista
❌ Ver historia clínica sin token → 401
✅ Prestador ve historia clínica de un afiliado con token → devuelve historial