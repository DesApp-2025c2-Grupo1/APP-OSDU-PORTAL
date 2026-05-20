/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('afiliados', function (table) {
        table.increments('id').primary();
        table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        table.string('nro_credencial', 20).notNullable();
        table.string('nro_documento', 10).notNullable();
        table.string('tipo_documento', 7).notNullable();
        table.date('fecha_nacimiento').notNullable();
        table.string('nombre', 100).notNullable();
        table.string('apellido', 100).notNullable();
        table.string('telefono', 20).notNullable();
        table.string('email', 100).notNullable();
        table.string('direccion', 255);
        table.string('localidad', 100);
        table.string('provincia', 100);
        table.string('codigo_postal', 20);
        table.string('pais', 100);
        table.boolean('activo').defaultTo(false);
        table.timestamp('creado_en').defaultTo(knex.fn.now());
        table.timestamp('actualizado_en').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('afiliados');
};
