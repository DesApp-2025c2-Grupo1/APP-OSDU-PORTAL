/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('prestadores', function (table) {
    table.string('estado', 30).notNullable().defaultTo('activo');
    table.timestamp('deactivated_at');
    table.text('deactivation_reason');
    table.timestamp('suspended_at');
    table.text('suspension_reason');
    table.timestamp('credentials_sent_at');
    table.timestamp('password_reset_at');
  });

  await knex('prestadores')
    .where({ status: false })
    .update({ estado: 'baja' });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('prestadores', function (table) {
    table.dropColumn('password_reset_at');
    table.dropColumn('credentials_sent_at');
    table.dropColumn('suspension_reason');
    table.dropColumn('suspended_at');
    table.dropColumn('deactivation_reason');
    table.dropColumn('deactivated_at');
    table.dropColumn('estado');
  });
};
