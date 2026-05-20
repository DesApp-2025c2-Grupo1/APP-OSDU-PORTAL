/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  await knex('prestador_especialidades').del();
  await knex('especialidades').del();

  await knex('especialidades').insert([
    { id: 1, nombre: 'Clínica médica' },
    { id: 2, nombre: 'Pediatría' },
    { id: 3, nombre: 'Cardiología' },
    { id: 4, nombre: 'Dermatología' },
    { id: 5, nombre: 'Ginecología' },
    { id: 6, nombre: 'Traumatología' },
    { id: 7, nombre: 'Oftalmología' },
    { id: 8, nombre: 'Otorrinolaringología' },
    { id: 9, nombre: 'Neurología' },
    { id: 10, nombre: 'Psiquiatría' },
    { id: 11, nombre: 'Nutrición' },
    { id: 12, nombre: 'Kinesiología' },
    { id: 13, nombre: 'Odontología' },
    { id: 14, nombre: 'Psicología' },
    { id: 15, nombre: 'Fonoaudiología' },
  ]);
};
