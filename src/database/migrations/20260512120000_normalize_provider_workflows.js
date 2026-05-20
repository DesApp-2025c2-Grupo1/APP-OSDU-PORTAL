/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('prestador_appointments', function (table) {
    table.integer('agenda_id').unsigned().references('id').inTable('agendas').onDelete('SET NULL');
    table.integer('especialidad_id').unsigned().references('id').inTable('especialidades').onDelete('SET NULL');
    table.integer('lugar_id').unsigned().references('id').inTable('lugares_atencion').onDelete('SET NULL');
    table.string('estado', 30).notNullable().defaultTo('reservado');
    table.text('motivo_cancelacion');
    table.timestamp('atendido_en');
  });

  await knex.schema.alterTable('prestador_requests', function (table) {
    table.text('motivo_estado');
    table.integer('resuelto_por_usuario_id').unsigned().references('id').inTable('usuarios').onDelete('SET NULL');
    table.timestamp('resuelto_en');
  });

  await knex.schema.alterTable('prestador_affiliate_situations', function (table) {
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('SET NULL');
    table.text('observacion');
    table.text('motivo_finalizacion');
  });

  await knex.schema.alterTable('prestador_clinical_history', function (table) {
    table.integer('turno_id').unsigned().references('id').inTable('prestador_appointments').onDelete('SET NULL');
  });

  await knex.schema.createTable('prestador_workflow_audit_logs', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('SET NULL');
    table.integer('afiliado_id').unsigned().references('id').inTable('afiliados').onDelete('SET NULL');
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('SET NULL');
    table.string('modulo', 40).notNullable();
    table.string('accion', 60).notNullable();
    table.text('motivo');
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('creado_en').defaultTo(knex.fn.now());

    table.index(['modulo', 'accion']);
    table.index(['prestador_id', 'creado_en']);
    table.index(['afiliado_id', 'creado_en']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('prestador_workflow_audit_logs');

  await knex.schema.alterTable('prestador_clinical_history', function (table) {
    table.dropColumn('turno_id');
  });

  await knex.schema.alterTable('prestador_affiliate_situations', function (table) {
    table.dropColumn('motivo_finalizacion');
    table.dropColumn('observacion');
    table.dropColumn('prestador_id');
  });

  await knex.schema.alterTable('prestador_requests', function (table) {
    table.dropColumn('resuelto_en');
    table.dropColumn('resuelto_por_usuario_id');
    table.dropColumn('motivo_estado');
  });

  await knex.schema.alterTable('prestador_appointments', function (table) {
    table.dropColumn('atendido_en');
    table.dropColumn('motivo_cancelacion');
    table.dropColumn('estado');
    table.dropColumn('lugar_id');
    table.dropColumn('especialidad_id');
    table.dropColumn('agenda_id');
  });
};
