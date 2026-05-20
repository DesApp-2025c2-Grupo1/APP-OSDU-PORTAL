exports.up = function(knex) {
  return knex.schema.createTable('prestador_notifications', (table) => {
    table.increments('id').primary();
    table.integer('prestador_id').unsigned().references('id').inTable('prestadores').onDelete('CASCADE');
    table.string('title').notNullable();
    table.string('text').notNullable();
    table.string('icon_class');
    table.boolean('unread').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('prestador_notifications');
};
