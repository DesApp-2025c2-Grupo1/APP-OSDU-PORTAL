const knex = require('knex');
const { types } = require('pg');
const knexConfig = require('../../knexfile');

// DATE columns are date-only values. Keeping them as strings avoids timezone
// shifts when Node serializes midnight through UTC.
types.setTypeParser(1082, (value) => value);

const env = process.env.NODE_ENV || 'development';
const config = knexConfig[env] || knexConfig.development;

const db = knex(config);

module.exports = db;
