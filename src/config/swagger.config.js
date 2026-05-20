const swaggerJsdoc = require('swagger-jsdoc');
const dotenv = require('dotenv');

dotenv.config();

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API UNAHUR',
            version: '1.0.0',
            description: 'Documentación de la API de la UNAHUR'
        },
        servers: [{ url: `http://localhost:${process.env.PORT}` }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: ['./src/modules/**/*.js', './src/routes/**/*.js'],
};

module.exports = swaggerJsdoc(options);