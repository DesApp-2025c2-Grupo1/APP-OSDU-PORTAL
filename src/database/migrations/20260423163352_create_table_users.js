/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('usuarios', function (table) {
        table.increments('id').primary();
        table.string('email').notNullable().unique();
        table.string('contrasenia').notNullable();
        table.timestamp('creado_en').defaultTo(knex.fn.now());
        table.timestamp('actualizado_en').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('usuarios');
};
