const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
  const defaultPassword = process.env.DEFAULT_USER_PASSWORD || 'ClaveTemporal123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  // Deletes ALL existing entries in dependent tables first
  await knex('usuarios_roles').del()
  await knex('usuarios').del()

  await knex('usuarios').insert([
    {
      id: 1,
      email: 'admin@mediunahur.com',
      contrasenia: hashedPassword
    },
    {
      id: 2,
      email: 'afiliado@test.com',
      contrasenia: hashedPassword
    },
    {
      id: 3,
      email: 'prestador@test.com',
      contrasenia: hashedPassword
    }
  ]);

  await knex('usuarios_roles').insert([
    { usuario_id: 1, rol_id: 1 },
    { usuario_id: 2, rol_id: 2 },
    { usuario_id: 3, rol_id: 3 }
  ]);

  await knex.raw(`
    SELECT setval(
      pg_get_serial_sequence('usuarios', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM usuarios),
      true
    )
  `);
};
