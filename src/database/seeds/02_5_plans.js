/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  await knex('planes').insert([
    {id: 1, codigo: '210', nombre: 'BRONCE'},
    {id: 2, codigo: '310', nombre: 'PLATA'},
    {id: 3, codigo: '410', nombre: 'ORO'},
    {id: 4, codigo: '510', nombre: 'PLATINO'}
  ]).onConflict('id').merge();
};
