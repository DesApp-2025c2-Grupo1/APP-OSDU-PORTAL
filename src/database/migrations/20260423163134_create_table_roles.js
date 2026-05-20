/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('roles', function (table) {
        table.increments('id').primary();
        table.string('nombre_rol').notNullable();
        table.string('descripcion_rol').notNullable();
        table.timestamp('creado_en').defaultTo(knex.fn.now());
        table.timestamp('actualizado_en').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('roles');
};
