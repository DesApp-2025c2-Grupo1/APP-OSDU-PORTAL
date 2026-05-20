/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('prestador_audit_logs', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('admin_usuario_id').unsigned().references('id').inTable('usuarios').onDelete('SET NULL');
    table.string('accion', 60).notNullable();
    table.text('motivo');
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('creado_en').defaultTo(knex.fn.now());

    table.index(['prestador_id', 'creado_en']);
    table.index(['admin_usuario_id', 'creado_en']);
    table.index(['accion']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('prestador_audit_logs');
};
