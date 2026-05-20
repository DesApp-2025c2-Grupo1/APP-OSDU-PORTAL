/**
 * Extiende prestador_requests para soportar reintegros iniciados por afiliados.
 * - prestador_id pasa a ser nullable (los reintegros de afiliados no tienen prestador asignado inicialmente)
 * - Nuevas columnas con datos específicos del reintegro: médico, especialidad, lugar, factura, forma de pago, CBU
 * - affiliate_response: texto que el afiliado envía al responder una observación
 */
exports.up = async (knex) => {
  await knex.schema.alterTable('prestador_requests', (table) => {
    table.string('medico_nombre', 200).nullable();
    table.string('especialidad', 100).nullable();
    table.string('lugar_atencion', 200).nullable();
    table.string('factura_cuit', 20).nullable();
    table.decimal('factura_valor_total', 12, 2).nullable();
    table.string('forma_pago', 50).nullable();
    table.string('cbu', 22).nullable();
    table.text('affiliate_response').nullable();
  });

  // Hacer prestador_id nullable para reintegros iniciados por afiliados
  await knex.raw('ALTER TABLE prestador_requests ALTER COLUMN prestador_id DROP NOT NULL');
};

exports.down = async (knex) => {
  await knex.schema.alterTable('prestador_requests', (table) => {
    table.dropColumn('medico_nombre');
    table.dropColumn('especialidad');
    table.dropColumn('lugar_atencion');
    table.dropColumn('factura_cuit');
    table.dropColumn('factura_valor_total');
    table.dropColumn('forma_pago');
    table.dropColumn('cbu');
    table.dropColumn('affiliate_response');
  });

  await knex.raw('ALTER TABLE prestador_requests ALTER COLUMN prestador_id SET NOT NULL');
};
