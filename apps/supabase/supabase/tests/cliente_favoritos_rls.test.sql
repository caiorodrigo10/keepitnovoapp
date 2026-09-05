-- Story 12.11 — prova transacional de isolamento dos favoritos do cliente.
-- Executar como o role que aplica migrations (BYPASSRLS); os blocos abaixo
-- alternam explicitamente para authenticated/anon para testar a Data API.
BEGIN;

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'story-12-11-user-a@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Story 12.11 User A"}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'story-12-11-user-b@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Story 12.11 User B"}'::jsonb,
    NOW(),
    NOW()
  );

INSERT INTO public.hubs (
  id,
  nome,
  endereco,
  lat,
  lng,
  ativo
)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  'Hub favorito de teste',
  'Endereco de teste',
  -19.916681,
  -43.934493,
  false
);

INSERT INTO public.hubs_horarios (
  hub_id,
  dia_semana,
  aberto,
  hora_abre,
  hora_fecha
)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  1,
  true,
  '08:00',
  '18:00'
);

INSERT INTO public.estabelecimentos (
  id,
  dono_user_id,
  nome_fantasia,
  cnpj,
  responsavel_nome,
  telefone,
  categoria,
  endereco,
  tempo_medio_entrega_min,
  chave_pix,
  chave_pix_tipo,
  status
)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'Loja favorita de teste',
  '12110000000100',
  'Responsavel de teste',
  '+5531999999999',
  'alimentacao',
  'Endereco de teste',
  30,
  'story-12-11@example.invalid',
  'email',
  'ativo'
);

-- user_a pode inserir e listar somente as próprias linhas.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

INSERT INTO public.clientes_hubs_favoritos (cliente_id, hub_id)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333'
);

INSERT INTO public.clientes_estabelecimentos_favoritos (
  cliente_id,
  estabelecimento_id
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444'
);

-- A PK composta torna o comando idempotente quando o consumidor usa
-- ON CONFLICT DO NOTHING.
INSERT INTO public.clientes_hubs_favoritos (cliente_id, hub_id)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.clientes_estabelecimentos_favoritos (
  cliente_id,
  estabelecimento_id
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444'
)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  hub_count bigint;
  estabelecimento_count bigint;
BEGIN
  SELECT count(*) INTO hub_count
  FROM public.clientes_hubs_favoritos;

  SELECT count(*) INTO estabelecimento_count
  FROM public.clientes_estabelecimentos_favoritos;

  IF hub_count <> 1 OR estabelecimento_count <> 1 THEN
    RAISE EXCEPTION
      'user_a esperava 1 favorito de cada tipo, recebeu hubs=% lojas=%',
      hub_count,
      estabelecimento_count;
  END IF;
END;
$$;

-- Um hub inativo e seu horário ficam visíveis ao cliente que o favoritou.
DO $$
DECLARE
  hub_count bigint;
  horario_count bigint;
BEGIN
  SELECT count(*) INTO hub_count
  FROM public.hubs
  WHERE id = '33333333-3333-4333-8333-333333333333';

  SELECT count(*) INTO horario_count
  FROM public.hubs_horarios
  WHERE hub_id = '33333333-3333-4333-8333-333333333333';

  IF hub_count <> 1 OR horario_count <> 1 THEN
    RAISE EXCEPTION
      'user_a deveria ver hub inativo favorito e horario, recebeu hubs=% horarios=%',
      hub_count,
      horario_count;
  END IF;
END;
$$;

-- Não existe caminho de UPDATE para favoritos.
DO $$
BEGIN
  UPDATE public.clientes_hubs_favoritos
  SET criado_em = criado_em
  WHERE cliente_id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'UPDATE de favorito de hub deveria falhar';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  UPDATE public.clientes_estabelecimentos_favoritos
  SET criado_em = criado_em
  WHERE cliente_id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'UPDATE de favorito de estabelecimento deveria falhar';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

-- user_a consegue apagar e recriar somente as próprias linhas.
DELETE FROM public.clientes_hubs_favoritos
WHERE cliente_id = '11111111-1111-4111-8111-111111111111';

DELETE FROM public.clientes_estabelecimentos_favoritos
WHERE cliente_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.clientes_hubs_favoritos (cliente_id, hub_id)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333'
);

INSERT INTO public.clientes_estabelecimentos_favoritos (
  cliente_id,
  estabelecimento_id
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444'
);

-- user_b não vê nem apaga linhas de user_a e não pode atribuí-las a user_a.
SELECT set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

DO $$
DECLARE
  hub_count bigint;
  estabelecimento_count bigint;
  hub_visivel_count bigint;
  horario_visivel_count bigint;
BEGIN
  SELECT count(*) INTO hub_count
  FROM public.clientes_hubs_favoritos;

  SELECT count(*) INTO estabelecimento_count
  FROM public.clientes_estabelecimentos_favoritos;

  SELECT count(*) INTO hub_visivel_count
  FROM public.hubs
  WHERE id = '33333333-3333-4333-8333-333333333333';

  SELECT count(*) INTO horario_visivel_count
  FROM public.hubs_horarios
  WHERE hub_id = '33333333-3333-4333-8333-333333333333';

  IF hub_count <> 0
    OR estabelecimento_count <> 0
    OR hub_visivel_count <> 0
    OR horario_visivel_count <> 0 THEN
    RAISE EXCEPTION
      'user_b viu dados de user_a: hubs favoritos=% lojas favoritas=% hubs=% horarios=%',
      hub_count,
      estabelecimento_count,
      hub_visivel_count,
      horario_visivel_count;
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.clientes_hubs_favoritos (cliente_id, hub_id)
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333'
  );
  RAISE EXCEPTION 'user_b conseguiu inserir favorito de hub para user_a';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.clientes_estabelecimentos_favoritos (
    cliente_id,
    estabelecimento_id
  )
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444'
  );
  RAISE EXCEPTION 'user_b conseguiu inserir favorito de loja para user_a';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DELETE FROM public.clientes_hubs_favoritos
WHERE cliente_id = '11111111-1111-4111-8111-111111111111';

DELETE FROM public.clientes_estabelecimentos_favoritos
WHERE cliente_id = '11111111-1111-4111-8111-111111111111';

-- O isolamento mantém as linhas e a visibilidade privada do hub para user_a.
SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

DO $$
DECLARE
  hub_favorito_count bigint;
  estabelecimento_favorito_count bigint;
  hub_visivel_count bigint;
BEGIN
  SELECT count(*) INTO hub_favorito_count
  FROM public.clientes_hubs_favoritos;

  SELECT count(*) INTO estabelecimento_favorito_count
  FROM public.clientes_estabelecimentos_favoritos;

  SELECT count(*) INTO hub_visivel_count
  FROM public.hubs
  WHERE id = '33333333-3333-4333-8333-333333333333';

  IF hub_favorito_count <> 1
    OR estabelecimento_favorito_count <> 1
    OR hub_visivel_count <> 1 THEN
    RAISE EXCEPTION
      'isolamento foi violado: hubs favoritos=% lojas favoritas=% hubs visiveis=%',
      hub_favorito_count,
      estabelecimento_favorito_count,
      hub_visivel_count;
  END IF;
END;
$$;

-- A descoberta pública continua mostrando hub ativo e horário, sem usar a
-- relação privada de favoritos.
RESET ROLE;
UPDATE public.hubs
SET ativo = true
WHERE id = '33333333-3333-4333-8333-333333333333';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  hub_count bigint;
  horario_count bigint;
BEGIN
  SELECT count(*) INTO hub_count
  FROM public.hubs
  WHERE id = '33333333-3333-4333-8333-333333333333';

  SELECT count(*) INTO horario_count
  FROM public.hubs_horarios
  WHERE hub_id = '33333333-3333-4333-8333-333333333333';

  IF hub_count <> 1 OR horario_count <> 1 THEN
    RAISE EXCEPTION
      'anon deveria ver hub ativo e horario, recebeu hubs=% horarios=%',
      hub_count,
      horario_count;
  END IF;
END;
$$;

-- Ao desativar, o hub e seu horário voltam a ficar ocultos de anon.
RESET ROLE;
UPDATE public.hubs
SET ativo = false
WHERE id = '33333333-3333-4333-8333-333333333333';

SET LOCAL ROLE anon;

DO $$
DECLARE
  hub_count bigint;
  horario_count bigint;
BEGIN
  SELECT count(*) INTO hub_count
  FROM public.hubs
  WHERE id = '33333333-3333-4333-8333-333333333333';

  SELECT count(*) INTO horario_count
  FROM public.hubs_horarios
  WHERE hub_id = '33333333-3333-4333-8333-333333333333';

  IF hub_count <> 0 OR horario_count <> 0 THEN
    RAISE EXCEPTION
      'anon viu hub inativo ou horario: hubs=% horarios=%',
      hub_count,
      horario_count;
  END IF;
END;
$$;

-- anon não recebe privilégio de SELECT, INSERT ou DELETE nas relações.

DO $$
BEGIN
  PERFORM count(*) FROM public.clientes_hubs_favoritos;
  RAISE EXCEPTION 'anon conseguiu selecionar favoritos de hub';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.clientes_hubs_favoritos (cliente_id, hub_id)
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333'
  );
  RAISE EXCEPTION 'anon conseguiu inserir favorito de hub';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  DELETE FROM public.clientes_hubs_favoritos
  WHERE cliente_id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'anon conseguiu apagar favorito de hub';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM count(*) FROM public.clientes_estabelecimentos_favoritos;
  RAISE EXCEPTION 'anon conseguiu selecionar favoritos de loja';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.clientes_estabelecimentos_favoritos (
    cliente_id,
    estabelecimento_id
  )
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444'
  );
  RAISE EXCEPTION 'anon conseguiu inserir favorito de loja';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  DELETE FROM public.clientes_estabelecimentos_favoritos
  WHERE cliente_id = '11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'anon conseguiu apagar favorito de loja';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END;
$$;

RESET ROLE;
ROLLBACK;
