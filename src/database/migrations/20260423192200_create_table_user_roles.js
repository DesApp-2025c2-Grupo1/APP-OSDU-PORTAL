/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('usuarios_roles', function (table) {
        table.increments('id').primary();
        table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        table.integer('rol_id').unsigned().notNullable().references('id').inTable('roles').onDelete('CASCADE');
        table.timestamp('creado_en').defaultTo(knex.fn.now());
        table.timestamp('actualizado_en').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('usuarios_roles');
};
