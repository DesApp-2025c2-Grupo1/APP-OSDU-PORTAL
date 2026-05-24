const db = require('../../../database/db');

const getUserByUsername = async (email, trx = db) => {
    if (!email) return null;
    return trx('usuarios')
        .select(
            'usuarios.id',
            'usuarios.email',
            'usuarios.contrasenia as password',
            'usuarios.debe_cambiar_password as must_change_password',
            'roles.nombre_rol as role_name'
        )
        .join('usuarios_roles', 'usuarios.id', 'usuarios_roles.usuario_id')
        .join('roles', 'usuarios_roles.rol_id', 'roles.id')
        .where('usuarios.email', email)
        .first();
}

const getUserById = async (id, trx = db) => {
    if (!id) return null;
    return trx('usuarios')
        .select(
            'usuarios.id',
            'usuarios.email',
            'usuarios.debe_cambiar_password as must_change_password',
            'roles.nombre_rol as role_name'
        )
        .join('usuarios_roles', 'usuarios.id', 'usuarios_roles.usuario_id')
        .join('roles', 'usuarios_roles.rol_id', 'roles.id')
        .where('usuarios.id', id)
        .first();
}

// Igual que getUserById pero incluye el hash de contraseña y first_name para changePassword
const getUserByIdFull = async (id, trx = db) => {
    if (!id) return null;
    return trx('users')
        .select('users.id', 'users.email', 'users.password', 'users.first_name', 'users.must_change_password', 'roles.role_name')
        .join('user_roles', 'users.id', 'user_roles.user_id')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('users.id', id)
        .first();
}

const createUser = async (email, password, trx = db) => {
    return trx('usuarios')
        .insert({ email: email, contrasenia: password })
        .returning('*');
}

// metodos para la base de datos de roles
const getRoleByRoleName = async (roleName, trx = db) => {
    if (!roleName) return null;
    return trx('roles').where({ nombre_rol: roleName }).first();
}

// lo inserta en la tabla de usuarios y roles
const createUserRole = async (userId, roleId, trx = db) => {
    if (!userId || !roleId) return null;
    return trx('usuarios_roles').insert({ usuario_id: userId, rol_id: roleId }).returning('*');
}

const updateUserPassword = async (userId, newPassword, trx = db) => {
    return trx('usuarios')
        .where({ id: userId })
        .update({ 
            contrasenia: newPassword,
            debe_cambiar_password: false 
        });
}

module.exports = {
    getUserByUsername,
    getUserById,
    getUserByIdFull,
    createUser,
    getRoleByRoleName,
    createUserRole,
    updateUserPassword
}
