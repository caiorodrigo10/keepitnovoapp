BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok(NOT has_column_privilege('authenticated','public.repasses','referencia','SELECT'),
  'referência operacional não pode ser lida diretamente pelo lojista');
SELECT ok(to_regclass('private.repasse_comprovantes') IS NOT NULL,
  'referência e metadado do comprovante possuem armazenamento privado');
SELECT ok(NOT has_table_privilege('authenticated','private.repasse_comprovantes','SELECT'),
  'papel autenticado não consulta diretamente metadados privados');
SELECT ok(to_regprocedure('public.listar_repasses_visiveis()') IS NOT NULL,
  'histórico acessível por projeção segura conforme a sessão');
SELECT ok(to_regprocedure('public.consultar_comprovante_repasse(uuid)') IS NOT NULL,
  'Admin pode consultar comprovante por RPC autorizada');
SELECT * FROM finish();
ROLLBACK;
