/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('prestadores', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('cuit', 20).notNullable().unique();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('document_number', 10);
    table.string('email', 100).notNullable();
    table.string('phone', 20);
    table.string('specialty', 100);
    table.boolean('status').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_requests', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('affiliate_id').unsigned().references('id').inTable('affiliates').onDelete('SET NULL');
    table.string('request_number', 20).notNullable().unique();
    table.string('affiliate_name', 150).notNullable();
    table.string('type', 50).notNullable();
    table.string('status', 50).notNullable().defaultTo('Pendiente');
    table.date('request_date').notNullable();
    table.text('description');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_appointments', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('affiliate_id').unsigned().references('id').inTable('affiliates').onDelete('SET NULL');
    table.string('affiliate_name', 150).notNullable();
    table.date('appointment_date').notNullable();
    table.string('start_time', 5).notNullable();
    table.string('end_time', 5);
    table.string('reason', 255).notNullable();
    table.text('note');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_situation_types', function (table) {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_affiliate_situations', function (table) {
    table.increments('id').primary();
    table.integer('affiliate_id').unsigned().notNullable().references('id').inTable('affiliates').onDelete('CASCADE');
    table.integer('situation_type_id').unsigned().references('id').inTable('prestador_situation_types').onDelete('SET NULL');
    table.string('type', 100).notNullable();
    table.date('start_date').notNullable();
    table.date('end_date');
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_clinical_history', function (table) {
    table.increments('id').primary();
    table.integer('affiliate_id').unsigned().notNullable().references('id').inTable('affiliates').onDelete('CASCADE');
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('SET NULL');
    table.date('entry_date').notNullable();
    table.string('doctor', 150).notNullable();
    table.string('specialty', 100).notNullable();
    table.string('modality', 50).notNullable();
    table.text('note').notNullable();
    table.boolean('own_note').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('prestador_clinical_history');
  await knex.schema.dropTableIfExists('prestador_affiliate_situations');
  await knex.schema.dropTableIfExists('prestador_situation_types');
  await knex.schema.dropTableIfExists('prestador_appointments');
  await knex.schema.dropTableIfExists('prestador_requests');
  await knex.schema.dropTableIfExists('prestadores');
};
