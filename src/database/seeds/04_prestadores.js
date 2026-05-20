/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  await knex('users')
    .where({ id: 3 })
    .update({ must_change_password: false });

  await knex('prestador_workflow_audit_logs').del();
  await knex('prestador_audit_logs').del();
  await knex('prestador_clinical_history').del();
  await knex('prestador_affiliate_situations').del();
  await knex('prestador_situation_types').del();
  await knex('prestador_appointments').del();
  await knex('prestador_requests').del();
  await knex('agendas').del();
  await knex('lugares_atencion').del();
  await knex('prestador_especialidades').del();
  await knex('prestadores').del();

  const [prestador] = await knex('prestadores')
    .insert({
      id: 1,
      user_id: 3,
      cuit: '20304050607',
      first_name: 'Hernan',
      last_name: 'Gomez',
      document_number: '30405060',
      email: 'prestador@test.com',
      phone: '11 4567 8900',
      specialty: 'Clinica medica',
      tipo_prestador: 'profesional',
      telefonos: JSON.stringify(['1145678900']),
      mails: JSON.stringify(['prestador@test.com']),
      status: true,
      estado: 'activo',
    })
    .returning('*');

  await knex('prestador_especialidades').insert({
    id: 1,
    prestador_id: prestador.id,
    especialidad_id: 1,
  });

  const [lugar] = await knex('lugares_atencion')
    .insert({
      id: 1,
      prestador_id: prestador.id,
      calle: 'Av. Vergara 2222',
      localidad: 'Hurlingham',
      provincia: 'Buenos Aires',
      cp: '1686',
      horarios: JSON.stringify([{ dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '18:00' }]),
    })
    .returning('*');

  await knex('agendas').insert({
    id: 1,
    prestador_id: prestador.id,
    especialidad_id: 1,
    lugar_id: lugar.id,
    duracion_turno: 30,
    fecha_inicio: '2026-01-01',
    fecha_fin: null,
    esta_activo: true,
    bloques: JSON.stringify([{ dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '18:00' }]),
  });

  await knex('prestador_situation_types').insert([
    { id: 1, name: 'Tratamiento psicologico' },
    { id: 2, name: 'Rehabilitacion post-operatoria' },
    { id: 3, name: 'Control nutricional' },
    { id: 4, name: 'Kinesiologia respiratoria' },
    { id: 5, name: 'Diabetes tipo II' },
  ]);

  // Reset PostgreSQL sequences after seeding with explicit IDs
  const tables = [
    'prestadores', 'prestador_requests', 'prestador_appointments',
    'prestador_situation_types', 'prestador_affiliate_situations',
    'prestador_clinical_history', 'prestador_especialidades',
    'lugares_atencion', 'agendas'
  ];
  for (const table of tables) {
    await knex.raw(`SELECT setval('${table}_id_seq', (SELECT COALESCE(MAX(id),0) FROM ${table}) + 1)`);
  }
};
