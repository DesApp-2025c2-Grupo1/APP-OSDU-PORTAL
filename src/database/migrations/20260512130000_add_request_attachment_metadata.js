/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('prestador_requests', function (table) {
    table.string('adjunto_nombre', 255);
    table.string('adjunto_tipo', 100);
    table.integer('adjunto_tamanio');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('prestador_requests', function (table) {
    table.dropColumn('adjunto_tamanio');
    table.dropColumn('adjunto_tipo');
    table.dropColumn('adjunto_nombre');
  });
};
