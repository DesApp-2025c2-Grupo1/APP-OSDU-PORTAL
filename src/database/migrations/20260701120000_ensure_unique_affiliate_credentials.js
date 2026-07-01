exports.up = async function (knex) {
  await knex.raw(`
    CREATE SEQUENCE IF NOT EXISTS afiliado_credencial_base_seq
      AS BIGINT
      START WITH 1
      INCREMENT BY 1
      NO MINVALUE
      NO MAXVALUE
      CACHE 1
  `);

  await knex.raw(`
    DO $$
    DECLARE
      max_base BIGINT;
    BEGIN
      SELECT COALESCE(MAX(split_part(nro_credencial, '-', 1)::BIGINT), 0)
      INTO max_base
      FROM afiliados
      WHERE nro_credencial ~ '^[0-9]+-[0-9]+$';

      IF max_base > 0 THEN
        PERFORM setval('afiliado_credencial_base_seq', max_base, true);
      ELSE
        PERFORM setval('afiliado_credencial_base_seq', 1, false);
      END IF;
    END
    $$;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'afiliados_nro_credencial_unique'
          AND conrelid = 'afiliados'::regclass
      ) THEN
        ALTER TABLE afiliados
          ADD CONSTRAINT afiliados_nro_credencial_unique UNIQUE (nro_credencial);
      END IF;
    END
    $$;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    ALTER TABLE afiliados
    DROP CONSTRAINT IF EXISTS afiliados_nro_credencial_unique
  `);

  await knex.raw('DROP SEQUENCE IF EXISTS afiliado_credencial_base_seq');
};
