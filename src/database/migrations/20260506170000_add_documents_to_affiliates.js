/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('afiliados', function (table) {
        table.string('ruta_documento_dni', 500);
        table.string('ruta_recibo_sueldo', 500);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('afiliados', function (table) {
        table.dropColumn('ruta_documento_dni');
        table.dropColumn('ruta_recibo_sueldo');
    });
};
