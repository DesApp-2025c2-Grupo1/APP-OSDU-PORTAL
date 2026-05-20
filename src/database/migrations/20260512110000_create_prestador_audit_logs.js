/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('prestador_audit_logs', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('admin_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 60).notNullable();
    table.text('reason');
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['prestador_id', 'created_at']);
    table.index(['admin_user_id', 'created_at']);
    table.index(['action']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('prestador_audit_logs');
};
