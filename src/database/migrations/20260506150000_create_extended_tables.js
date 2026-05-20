/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Especialidades
  await knex.schema.createTable('especialidades', function(table) {
    table.increments('id').primary();
    table.string('nombre', 100).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 2. Prestador_Especialidades pivot
  await knex.schema.createTable('prestador_especialidades', function(table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('especialidad_id').unsigned().notNullable().references('id').inTable('especialidades').onDelete('CASCADE');
    table.unique(['prestador_id', 'especialidad_id']);
  });

  // 3. Lugares_Atencion
  await knex.schema.createTable('lugares_atencion', function(table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.string('calle', 255).notNullable();
    table.string('localidad', 150);
    table.string('provincia', 150);
    table.string('cp', 20);
    table.jsonb('horarios').defaultTo('[]'); // { desde, hasta, dias: [] }
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 4. Modificar Prestadores para soportar arrays y tipo
  await knex.schema.alterTable('prestadores', function(table) {
    table.string('tipo_prestador', 50).defaultTo('profesional');
    table.integer('centro_medico_id').unsigned().references('id').inTable('prestadores').onDelete('SET NULL');
    table.jsonb('telefonos').defaultTo('[]');
    table.jsonb('mails').defaultTo('[]');
  });

  // Migrar los mails/telefonos simples al JSONB para los actuales y especialidades
  const prestadores = await knex('prestadores').select('id', 'email', 'phone', 'specialty');
  for (const p of prestadores) {
    const dataToUpdate = {};
    if (p.email) dataToUpdate.mails = JSON.stringify([p.email]);
    if (p.phone) dataToUpdate.telefonos = JSON.stringify([p.phone]);
    
    if (Object.keys(dataToUpdate).length > 0) {
      await knex('prestadores').where('id', p.id).update(dataToUpdate);
    }
    
    if (p.specialty) {
      // Find or create specialty
      let esp = await knex('especialidades').where({ nombre: p.specialty }).first();
      let espId;
      if (!esp) {
        const [inserted] = await knex('especialidades').insert({ nombre: p.specialty }).returning('id');
        espId = inserted.id || inserted;
      } else {
        espId = esp.id;
      }
      
      // We wrap insert in try-catch to avoid unique constraint if it already exists
      try {
        await knex('prestador_especialidades').insert({
          prestador_id: p.id,
          especialidad_id: espId
        });
      } catch (e) {}
    }
  }

  // Ahora podemos quitar 'specialty' si quisieramos, pero lo dejamos por consistencia con otros endpoints viejos si hay.

  // 5. Agendas
  await knex.schema.createTable('agendas', function(table) {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().notNullable().references('id').inTable('prestadores').onDelete('CASCADE');
    table.integer('especialidad_id').unsigned().notNullable().references('id').inTable('especialidades').onDelete('CASCADE');
    table.integer('lugar_id').unsigned().notNullable().references('id').inTable('lugares_atencion').onDelete('CASCADE');
    table.integer('duracion_turno').notNullable().defaultTo(30);
    table.date('fecha_inicio');
    table.date('fecha_fin');
    table.boolean('esta_activo').defaultTo(true);
    table.jsonb('bloques').defaultTo('[]'); // { dias: [], desde: string, hasta: string }
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('agendas');
  
  await knex.schema.alterTable('prestadores', function(table) {
    table.dropColumn('mails');
    table.dropColumn('telefonos');
    table.dropColumn('centro_medico_id');
    table.dropColumn('tipo_prestador');
  });

  await knex.schema.dropTableIfExists('lugares_atencion');
  await knex.schema.dropTableIfExists('prestador_especialidades');
  await knex.schema.dropTableIfExists('especialidades');
};
