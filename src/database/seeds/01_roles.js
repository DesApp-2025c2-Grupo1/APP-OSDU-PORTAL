/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('roles').del()
  await knex('roles').insert([
    { id: 1, nombre_rol: 'ADMIN', descripcion_rol: 'Administrador del sistema' },
    { id: 2, nombre_rol: 'AFILIADO', descripcion_rol: 'Afiliado del sistema' },
    { id: 3, nombre_rol: 'PRESTADOR', descripcion_rol: 'Prestador del sistema' }
  ]);
};
