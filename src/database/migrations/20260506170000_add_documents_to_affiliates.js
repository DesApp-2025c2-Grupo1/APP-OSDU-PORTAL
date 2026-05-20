/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('affiliates', function (table) {
        table.string('dni_document_path', 500);
        table.string('payslip_document_path', 500);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('affiliates', function (table) {
        table.dropColumn('dni_document_path');
        table.dropColumn('payslip_document_path');
    });
};
