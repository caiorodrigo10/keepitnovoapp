BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(4);

-- SECURITY DEFINER must never inherit a caller-controlled path.  pg_catalog is
-- implicit; application names therefore need qualification in every body.
SELECT extensions.is(
  (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public', 'private')
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting = 'search_path=""'
      )
  ),
  0::bigint,
  'every application SECURITY DEFINER function pins search_path to empty'
);

-- NULL proacl means PostgreSQL grants EXECUTE to PUBLIC, so it is covered as
-- well as an explicit PUBLIC entry. The two anon policy predicates are checked
-- separately below because their execution is needed by RLS evaluation.
SELECT extensions.is(
  (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public', 'private')
      AND (
        p.proacl IS NULL
        OR EXISTS (
          SELECT 1
          FROM aclexplode(p.proacl) AS acl
          WHERE acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        )
      )
  ),
  0::bigint,
  'no application SECURITY DEFINER function inherits EXECUTE from PUBLIC'
);

SELECT extensions.is(
  (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'private'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'private helpers are not executable by authenticated'
);

SELECT extensions.is(
  (
    SELECT array_agg(p.proname ORDER BY p.proname)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  ARRAY['estabelecimento_pertence_ao_usuario', 'is_admin', 'pode_ver_pedido']::name[],
  'only the auth-bound RLS predicates remain executable by anon'
);

SELECT * FROM extensions.finish(NULL);
ROLLBACK;
