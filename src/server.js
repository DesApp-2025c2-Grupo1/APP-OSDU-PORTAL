require('dotenv').config();

// Fail-fast: variables de entorno críticas
const REQUIRED_ENV = ['JWT_SECRET'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[STARTUP ERROR] Variables de entorno requeridas no configuradas: ${missing.join(', ')}`);
  process.exit(1);
}

const app = require('./index');

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || 'development';

app.listen(PORT, () => {
  console.log(`[SERVER] Servidor iniciado en puerto ${PORT} (${ENV})`);
});
