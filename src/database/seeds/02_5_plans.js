/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  await knex('plans').insert([
    {id: 1, plan_code: '210', plan_name: 'BRONCE'},
    {id: 2, plan_code: '310', plan_name: 'PLATA'},
    {id: 3, plan_code: '410', plan_name: 'ORO'},
    {id: 4, plan_code: '510', plan_name: 'PLATINO'}
  ]).onConflict('id').merge();
};
