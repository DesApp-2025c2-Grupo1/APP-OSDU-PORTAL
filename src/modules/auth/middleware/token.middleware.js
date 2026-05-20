const jwt = require('jsonwebtoken');

// Mapa de rol → nombre de cookie de sesión dedicada
const ROLE_COOKIE_MAP = {
    ADMIN: 'token_admin',
    AFILIADO: 'token_affiliate',
    PRESTADOR: 'token_prestador',
};

const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        // 1. Soporte para header Authorization: Bearer (usado en tests y clientes externos)
        const bearerToken = req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.replace('Bearer ', '')
            : null;

        // 2. Buscar el token en las cookies correspondientes a los roles permitidos
        let token = bearerToken;
        if (!token) {
            // Filtrar y ordenar los roles según lo sugerido por el header x-session-allowed-roles (si existe)
            const clientAllowedRolesHeader = req.headers['x-session-allowed-roles'];
            let rolesToCheck = allowedRoles;
            if (clientAllowedRolesHeader) {
                const clientRoles = clientAllowedRolesHeader.split(',').map(r => r.trim().toUpperCase());
                rolesToCheck = allowedRoles.filter(role => clientRoles.includes(role));
            }

            for (const role of rolesToCheck) {
                const cookieName = ROLE_COOKIE_MAP[role];
                if (cookieName && req.cookies[cookieName]) {
                    token = req.cookies[cookieName];
                    break;
                }
            }
        }

        // 3. Fallback a cookie genérica legacy 'token' (compatibilidad hacia atrás)
        if (!token && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Acceso denegado' });
        }

        try {
            const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
            if (!allowedRoles.includes(decodedToken.role)) {
                return res.status(403).json({ error: 'Permisos insuficientes' });
            }

            req.user = decodedToken; // usuario decodificado disponible en controllers
            next();
        } catch (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
    };
};

module.exports = authorize;
