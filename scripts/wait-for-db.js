const { Client } = require('pg');

const attempts = Number(process.env.DB_WAIT_ATTEMPTS || 30);
const delayMs = Number(process.env.DB_WAIT_DELAY_MS || 2000);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ssl = process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : false;

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl,
};

async function main() {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new Client(config);

    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      console.log('Database is ready.');
      return;
    } catch (error) {
      await client.end().catch(() => {});
      console.log(`Database not ready (${attempt}/${attempts}): ${error.message}`);

      if (attempt === attempts) {
        throw error;
      }

      await wait(delayMs);
    }
  }
}

main().catch((error) => {
  console.error('Database wait failed:', error.message);
  process.exit(1);
});
