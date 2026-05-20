const bcrypt = require('bcryptjs');

//repositorios
const affiliateRepository = require('../../affiliates/repository/affiliate.repository');

//repositorios
const authRepository = require('../repository/auth.repository');

//utils
const { generateToken } = require('../utils/jwt.service');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Faltan datos requeridos' });
        }

        const user = await authRepository.getUserByUsername(email);

        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // si el usuario es administrador no se valida su cuenta de afiliado
        if (user.role_name !== 'ADMIN') {
            const affiliate = await affiliateRepository.getAffiliateByUserId(user.id);
            if (affiliate && !affiliate.status) {
                return res.status(401).json({ message: 'Su cuenta de afiliado no esta activa' });
            }
        }

        const isPasswordValid = await validatePassword(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const token = await generateToken(user);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 1 día
        });

        return res.status(200).json({
            message: 'OK',
            user: {
                id: user.id,
                email: user.email,
                role: user.role_name,
                must_change_password: !!user.must_change_password
            }
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const validatePassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};

const changePassword = async (req, res) => {
    try {
        const { newPassword } = req.body;
        const userId = req.user.id;

        if (!newPassword) {
            return res.status(400).json({ message: 'La nueva contraseña es requerida' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await authRepository.updateUserPassword(userId, hashedPassword);

        return res.status(200).json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error al cambiar la contraseña' });
    }
};

const me = async (req, res) => {
    try {
        const user = await authRepository.getUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        return res.status(200).json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role_name,
                must_change_password: !!user.must_change_password
            }
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const logout = async (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    });

    return res.status(200).json({ message: 'OK' });
};

const registerInternal = async (email, trx) => {
    const user = await authRepository.getUserByUsername(email, trx);

    if (user) {
        throw new Error('El usuario ya existe');
    }

    const defaultPassword = process.env.DEFAULT_USER_PASSWORD || 'clave123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const newUser = await authRepository.createUser(email, hashedPassword, trx);

    const role = await authRepository.getRoleByRoleName('AFILIADO', trx);
    await authRepository.createUserRole(newUser[0].id, role.id, trx);

    return newUser[0];
};

module.exports = {
    login,
    me,
    logout,
    registerInternal,
    changePassword
};
