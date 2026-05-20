/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('prestador_appointments', function (table) {
    table.integer('agenda_id').unsigned().references('id').inTable('agendas').onDelete('SET NULL');
    table.integer('especialidad_id').unsigned().references('id').inTable('especialidades').onDelete('SET NULL');
    table.integer('lugar_id').unsigned().references('id').inTable('lugares_atencion').onDelete('SET NULL');
    table.string('status', 30).notNullable().defaultTo('reservado');
    table.text('cancellation_reason');
    table.timestamp('attended_at');
  });

  await knex.schema.alterTable('prestador_requests', function (table) {
    table.text('status_reason');
    table.integer('resolved_by_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('resolved_at');
  });

  await knex.schema.alterTable('prestador_affiliate_situations', function (table) {
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('SET NULL');
    table.text('observation');
    table.text('end_reason');
  });

  await knex.schema.alterTable('prestador_clinical_history', function (table) {
    table.integer('appointment_id').unsigned().references('id').inTable('prestador_appointments').onDelete('SET NULL');
  });

  await knex.schema.createTable('prestador_workflow_audit_logs', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('SET NULL');
    table.integer('affiliate_id').unsigned().references('id').inTable('affiliates').onDelete('SET NULL');
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.string('module', 40).notNullable();
    table.string('action', 60).notNullable();
    table.text('reason');
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['module', 'action']);
    table.index(['prestador_id', 'created_at']);
    table.index(['affiliate_id', 'created_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('prestador_workflow_audit_logs');

  await knex.schema.alterTable('prestador_clinical_history', function (table) {
    table.dropColumn('appointment_id');
  });

  await knex.schema.alterTable('prestador_affiliate_situations', function (table) {
    table.dropColumn('end_reason');
    table.dropColumn('observation');
    table.dropColumn('prestador_id');
  });

  await knex.schema.alterTable('prestador_requests', function (table) {
    table.dropColumn('resolved_at');
    table.dropColumn('resolved_by_user_id');
    table.dropColumn('status_reason');
  });

  await knex.schema.alterTable('prestador_appointments', function (table) {
    table.dropColumn('attended_at');
    table.dropColumn('cancellation_reason');
    table.dropColumn('status');
    table.dropColumn('lugar_id');
    table.dropColumn('especialidad_id');
    table.dropColumn('agenda_id');
  });
};
