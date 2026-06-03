const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.config');

const authRoute = require('./modules/auth/routes/auth.route');
const affiliatesRoute = require('./modules/affiliates/routes/affiliates.route');
const familyGroupRoute = require('./modules/affiliates/routes/family_group.route');
const prestadoresRoute = require('./modules/prestadores/routes/prestadores.route');
const agendasRoute = require('./modules/agendas/routes/agendas.route');
const plansRoute = require('./modules/plans/routes/plans.route');
const specialtiesRoute = require('./modules/specialties/routes/specialties.route');
const reportsRoute = require('./modules/reports/reports.route');
const path = require('path');

const app = express();

// Confiar en el proxy reverso de producción para interpretar correctamente
// cabeceras como X-Forwarded-For/X-Forwarded-Proto y emitir cookies seguras.
app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        // En desarrollo también acepta localhost
        if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true
}));
app.use(cookieParser());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

app.get('/health', (req, res) => {
    res.send('OK');
});

// Limitador de peticiones para la ruta de auth
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: { message: 'Demasiadas peticiones desde esta IP, inténtalo más tarde' }
});

app.use('/auth', authLimiter, authRoute);
app.use('/affiliates', affiliatesRoute);
app.use('/admin/affiliates', affiliatesRoute);
app.use('/family-group', familyGroupRoute);
app.use('/prestadores', prestadoresRoute);
// Alias temporal para no romper el frontend actual mientras migra sus URLs.
app.use('/providers', prestadoresRoute);
app.use('/agendas', agendasRoute);
app.use('/plans', plansRoute);
app.use('/specialties', specialtiesRoute);
app.use('/reports', reportsRoute);
// app.use('/admin', adminRoutes);

// Manejador global de errores — captura lo que se escape de los try/catch
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[UNHANDLED ERROR]', err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Error interno del servidor' });
});

module.exports = app;
