exports.up = function(knex) {
  return knex.schema.createTable('prestador_notifications', (table) => {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('CASCADE');
    table.string('titulo').notNullable();
    table.string('texto').notNullable();
    table.string('clase_icono');
    table.boolean('no_leida').defaultTo(true);
    table.timestamp('creado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('prestador_notifications');
};
