const jwt = require('jsonwebtoken');

const generateToken = async (user) => {
    const payload = {
        id: user.id_usuario || user.id,
        email: user.email,
        role: user.role_name
    };
    const secret = process.env.JWT_SECRET;
    return jwt.sign(payload, secret, { expiresIn: '1d' });
};


// verify token
const verifyToken = (token) => {
    const secret = process.env.JWT_SECRET;
    return jwt.verify(token, secret);
};

// extract token from header
const extractToken = (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
    }
    return authHeader.replace('Bearer ', '');
};

module.exports = {
    generateToken,
    verifyToken,
    extractToken,
};