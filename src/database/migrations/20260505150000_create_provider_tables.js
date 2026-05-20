/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('prestadores', function (table) {
    table.increments('id').primary();
    table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    table.string('cuit', 20).notNullable().unique();
    table.string('nombre', 100).notNullable();
    table.string('apellido', 100).notNullable();
    table.string('nro_documento', 10);
    table.string('email', 100).notNullable();
    table.string('telefono', 20);
    table.string('especialidad', 100);
    table.boolean('activo').defaultTo(true);
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_requests', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('afiliado_id').unsigned().references('id').inTable('afiliados').onDelete('SET NULL');
    table.string('nro_solicitud', 20).notNullable().unique();
    table.string('afiliado_nombre', 150).notNullable();
    table.string('tipo', 50).notNullable();
    table.string('estado', 50).notNullable().defaultTo('Pendiente');
    table.date('fecha_solicitud').notNullable();
    table.text('descripcion');
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_appointments', function (table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('afiliado_id').unsigned().references('id').inTable('afiliados').onDelete('SET NULL');
    table.string('afiliado_nombre', 150).notNullable();
    table.date('fecha_turno').notNullable();
    table.string('hora_inicio', 5).notNullable();
    table.string('hora_fin', 5);
    table.string('motivo', 255).notNullable();
    table.text('nota');
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_situation_types', function (table) {
    table.increments('id').primary();
    table.string('nombre', 100).notNullable().unique();
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_affiliate_situations', function (table) {
    table.increments('id').primary();
    table.integer('afiliado_id').unsigned().notNullable().references('id').inTable('afiliados').onDelete('CASCADE');
    table.integer('tipo_situacion_id').unsigned().references('id').inTable('prestador_situation_types').onDelete('SET NULL');
    table.string('tipo', 100).notNullable();
    table.date('fecha_inicio').notNullable();
    table.date('fecha_fin');
    table.boolean('activa').defaultTo(true);
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('prestador_clinical_history', function (table) {
    table.increments('id').primary();
    table.integer('afiliado_id').unsigned().notNullable().references('id').inTable('afiliados').onDelete('CASCADE');
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('SET NULL');
    table.date('fecha').notNullable();
    table.string('profesional', 150).notNullable();
    table.string('especialidad', 100).notNullable();
    table.string('modalidad', 50).notNullable();
    table.text('nota').notNullable();
    table.boolean('nota_propia').defaultTo(false);
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
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
