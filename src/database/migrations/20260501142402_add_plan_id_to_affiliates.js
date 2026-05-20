/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.table('afiliados', function(table) {
        table.integer('plan_id').unsigned().references('id').inTable('planes').onDelete('RESTRICT');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.table('afiliados', function(table) {
        table.dropForeign('plan_id');
        table.dropColumn('plan_id');
    });
};
