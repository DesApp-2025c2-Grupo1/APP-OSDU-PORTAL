const hasTable = async (knex, tableName) => knex.schema.hasTable(tableName);
const hasColumn = async (knex, tableName, columnName) => knex.schema.hasColumn(tableName, columnName);

const renameTableIfNeeded = async (knex, from, to) => {
  if ((await hasTable(knex, from)) && !(await hasTable(knex, to))) {
    await knex.schema.renameTable(from, to);
  }
};

const renameColumnIfNeeded = async (knex, tableName, from, to) => {
  if ((await hasTable(knex, tableName)) && (await hasColumn(knex, tableName, from)) && !(await hasColumn(knex, tableName, to))) {
    await knex.schema.table(tableName, (table) => {
      table.renameColumn(from, to);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await renameTableIfNeeded(knex, 'providers', 'prestadores');
  await renameTableIfNeeded(knex, 'provider_requests', 'prestador_requests');
  await renameTableIfNeeded(knex, 'provider_appointments', 'prestador_appointments');
  await renameTableIfNeeded(knex, 'provider_situation_types', 'prestador_situation_types');
  await renameTableIfNeeded(knex, 'provider_affiliate_situations', 'prestador_affiliate_situations');
  await renameTableIfNeeded(knex, 'provider_clinical_history', 'prestador_clinical_history');

  await renameColumnIfNeeded(knex, 'prestador_requests', 'provider_id', 'prestador_id');
  await renameColumnIfNeeded(knex, 'prestador_appointments', 'provider_id', 'prestador_id');
  await renameColumnIfNeeded(knex, 'prestador_clinical_history', 'provider_id', 'prestador_id');

  await knex('roles')
    .where({ role_name: 'PROVEEDOR' })
    .update({
      role_name: 'PRESTADOR',
      role_description: 'Prestador del sistema',
      updated_at: knex.fn.now(),
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex('roles')
    .where({ role_name: 'PRESTADOR' })
    .update({
      role_name: 'PROVEEDOR',
      role_description: 'Proveedor del sistema',
      updated_at: knex.fn.now(),
    });

  await renameColumnIfNeeded(knex, 'prestador_requests', 'prestador_id', 'provider_id');
  await renameColumnIfNeeded(knex, 'prestador_appointments', 'prestador_id', 'provider_id');
  await renameColumnIfNeeded(knex, 'prestador_clinical_history', 'prestador_id', 'provider_id');

  await renameTableIfNeeded(knex, 'prestador_clinical_history', 'provider_clinical_history');
  await renameTableIfNeeded(knex, 'prestador_affiliate_situations', 'provider_affiliate_situations');
  await renameTableIfNeeded(knex, 'prestador_situation_types', 'provider_situation_types');
  await renameTableIfNeeded(knex, 'prestador_appointments', 'provider_appointments');
  await renameTableIfNeeded(knex, 'prestador_requests', 'provider_requests');
  await renameTableIfNeeded(knex, 'prestadores', 'providers');
};
