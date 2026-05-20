const db = require('../../../database/db');

const getUserByUsername = async (email, trx = db) => {
    if (!email) return null;
    return trx('users')
        .select('users.*', 'roles.role_name')
        .join('user_roles', 'users.id', 'user_roles.user_id')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('users.email', email)
        .first();
}

const getUserById = async (id, trx = db) => {
    if (!id) return null;
    return trx('users')
        .select('users.id', 'users.email', 'users.must_change_password', 'roles.role_name')
        .join('user_roles', 'users.id', 'user_roles.user_id')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('users.id', id)
        .first();
}

const createUser = async (email, password, trx = db) => {
    return trx('users')
        .insert({ email: email, password: password })
        .returning('*');
}

// metodos para la base de datos de roles
const getRoleByRoleName = async (roleName, trx = db) => {
    if (!roleName) return null;
    return trx('roles').where({ role_name: roleName }).first();
}

// lo inserta en la tabla de usuarios y roles
const createUserRole = async (userId, roleId, trx = db) => {
    if (!userId || !roleId) return null;
    return trx('user_roles').insert({ user_id: userId, role_id: roleId }).returning('*');
}

const updateUserPassword = async (userId, newPassword, trx = db) => {
    return trx('users')
        .where({ id: userId })
        .update({ 
            password: newPassword,
            must_change_password: false 
        });
}

module.exports = {
    getUserByUsername,
    getUserById,
    createUser,
    getRoleByRoleName,
    createUserRole,
    updateUserPassword
}
