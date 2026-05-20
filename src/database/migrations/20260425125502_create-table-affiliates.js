/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('affiliates', function (table) {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('credencial_number', 20).notNullable();
        table.string('document_number', 10).notNullable();
        table.string('document_type', 7).notNullable();
        table.date('birth_date').notNullable();
        table.string('first_name', 100).notNullable();
        table.string('last_name', 100).notNullable();
        table.string('phone', 20).notNullable();
        table.string('email', 100).notNullable();
        table.string('address', 255);
        table.string('city', 100);
        table.string('province', 100);
        table.string('postal_code', 20);
        table.string('country', 100);
        table.boolean('status').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('affiliates');
};
