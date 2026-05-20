/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries in dependent tables first
  await knex('user_roles').del()
  await knex('users').del()

  await knex('users').insert([
    {
      id: 1,
      email: 'admin@mediunahur.com',
      password: '$2a$12$TCWUqRe9RYYBiAiO5kk8.uryyCnIFVKymY7Jm41Lu8RC2tpWB0ij.'
    },
    {
      id: 2,
      email: 'afiliado@test.com',
      password: '$2a$12$TCWUqRe9RYYBiAiO5kk8.uryyCnIFVKymY7Jm41Lu8RC2tpWB0ij.'
    },
    {
      id: 3,
      email: 'prestador@test.com',
      password: '$2a$12$TCWUqRe9RYYBiAiO5kk8.uryyCnIFVKymY7Jm41Lu8RC2tpWB0ij.'
    }
  ]);

  await knex('user_roles').insert([
    { user_id: 1, role_id: 1 },
    { user_id: 2, role_id: 2 },
    { user_id: 3, role_id: 3 }
  ]);

  await knex.raw(`
    SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM users),
      true
    )
  `);
};
