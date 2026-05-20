const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.config');

const authRoute = require('./modules/auth/routes/auth.route');
const affiliatesRoute = require('./modules/affiliates/routes/affiliates.route');
const prestadoresRoute = require('./modules/prestadores/routes/prestadores.route');
const agendasRoute = require('./modules/agendas/routes/agendas.route');
const plansRoute = require('./modules/plans/routes/plans.route');
const specialtiesRoute = require('./modules/specialties/routes/specialties.route');
const path = require('path');

const app = express();

app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
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
app.use('/prestadores', prestadoresRoute);
// Alias temporal para no romper el frontend actual mientras migra sus URLs.
app.use('/providers', prestadoresRoute);
app.use('/agendas', agendasRoute);
app.use('/plans', plansRoute);
app.use('/specialties', specialtiesRoute);
// app.use('/admin', adminRoutes);

module.exports = app;
