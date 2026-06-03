/**
 * Agrega columna de subtipo de autorización y ruta de adjunto a prestador_requests.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('prestador_requests', function (table) {
    table.string('subtipo_autorizacion', 100).nullable();
    table.string('adjunto_ruta', 500).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('prestador_requests', function (table) {
    table.dropColumn('subtipo_autorizacion');
    table.dropColumn('adjunto_ruta');
  });
};
