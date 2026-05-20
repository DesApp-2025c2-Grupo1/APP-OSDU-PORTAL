exports.up = async function (knex) {
  await knex.schema.alterTable('afiliados', function (table) {
    table.integer('afiliado_titular_id').unsigned().references('id').inTable('afiliados').onDelete('CASCADE');
    table.string('parentesco', 50);
    table.timestamp('baja_programada_en');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('afiliados', function (table) {
    table.dropColumn('baja_programada_en');
    table.dropColumn('parentesco');
    table.dropColumn('afiliado_titular_id');
  });
};
