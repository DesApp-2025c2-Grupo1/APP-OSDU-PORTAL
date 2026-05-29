exports.up = async function (knex) {
  await knex.schema.alterTable('afiliados', function (table) {
    table.timestamp('alta_programada_en');
  });

  await knex.schema.alterTable('prestador_requests', function (table) {
    table.string('medicamento_nombre', 200).nullable();
    table.string('medicamento_presentacion', 80).nullable();
    table.integer('medicamento_cantidad').nullable();
    table.date('fecha_emision').nullable();
    table.date('fecha_prevista').nullable();
    table.integer('dias_internacion').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('prestador_requests', function (table) {
    table.dropColumn('dias_internacion');
    table.dropColumn('fecha_prevista');
    table.dropColumn('fecha_emision');
    table.dropColumn('medicamento_cantidad');
    table.dropColumn('medicamento_presentacion');
    table.dropColumn('medicamento_nombre');
  });

  await knex.schema.alterTable('afiliados', function (table) {
    table.dropColumn('alta_programada_en');
  });
};
