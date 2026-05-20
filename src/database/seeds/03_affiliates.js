/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
    // Deletes ALL existing entries
    await knex('affiliates').del()
    await knex('affiliates').insert([
        {
            id: 1,
            user_id: 2,
            credencial_number: '01-00000001',
            document_type: 'DNI',
            document_number: '12345678',
            birth_date: '1990-01-01',
            first_name: 'Juan',
            last_name: 'Perez',
            email: 'afiliado@test.com',
            phone: '123456789',
            address: 'Calle 123',
            city: 'Hurlingham',
            province: 'Buenos Aires',
            postal_code: '1686',
            country: 'Argentina',
            status: true,
            plan_id: 1,
            created_at: new Date(),
            updated_at: new Date()
        }
    ]);
};
