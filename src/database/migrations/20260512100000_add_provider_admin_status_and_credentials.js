/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('prestadores', function (table) {
    table.string('estado', 30).notNullable().defaultTo('activo');
    table.timestamp('baja_en');
    table.text('motivo_baja');
    table.timestamp('suspendido_en');
    table.text('motivo_suspension');
    table.timestamp('credenciales_enviadas_en');
    table.timestamp('contrasenia_reseteada_en');
  });

  await knex('prestadores')
    .where({ activo: false })
    .update({ estado: 'baja' });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('prestadores', function (table) {
    table.dropColumn('contrasenia_reseteada_en');
    table.dropColumn('credenciales_enviadas_en');
    table.dropColumn('motivo_suspension');
    table.dropColumn('suspendido_en');
    table.dropColumn('motivo_baja');
    table.dropColumn('baja_en');
    table.dropColumn('estado');
  });
};
