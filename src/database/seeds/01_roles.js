/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('roles').del()
  await knex('roles').insert([
    { id: 1, role_name: 'ADMIN', role_description: 'Administrador del sistema' },
    { id: 2, role_name: 'AFILIADO', role_description: 'Afiliado del sistema' },
    { id: 3, role_name: 'PRESTADOR', role_description: 'Prestador del sistema' }
  ]);
};
