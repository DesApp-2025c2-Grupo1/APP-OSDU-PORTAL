/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
    // Deletes ALL existing entries
    await knex('afiliados').del()
    await knex('afiliados').insert([
        {
            id: 1,
            usuario_id: 2,
            nro_credencial: '01-00000001',
            tipo_documento: 'DNI',
            nro_documento: '12345678',
            fecha_nacimiento: '1990-01-01',
            nombre: 'Juan',
            apellido: 'Perez',
            email: 'afiliado@test.com',
            telefono: '123456789',
            direccion: 'Calle 123',
            localidad: 'Hurlingham',
            provincia: 'Buenos Aires',
            codigo_postal: '1686',
            pais: 'Argentina',
            activo: true,
            plan_id: 1,
            creado_en: new Date(),
            actualizado_en: new Date()
        }
    ]);

    await knex.raw(`
      SELECT setval(
        pg_get_serial_sequence('afiliados', 'id'),
        (SELECT COALESCE(MAX(id), 1) FROM afiliados),
        true
      )
    `);
};
