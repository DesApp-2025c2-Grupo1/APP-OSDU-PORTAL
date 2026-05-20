/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('prestador_requests', function (table) {
    table.string('attachment_name', 255);
    table.string('attachment_type', 100);
    table.integer('attachment_size');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('prestador_requests', function (table) {
    table.dropColumn('attachment_size');
    table.dropColumn('attachment_type');
    table.dropColumn('attachment_name');
  });
};
