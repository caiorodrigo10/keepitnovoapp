-- A RLS de estabelecimentos restringe linhas, mas nao colunas. Revogamos o
-- SELECT amplo antes de publicar uma lista fechada de atributos comerciais.
REVOKE SELECT ON public.estabelecimentos FROM PUBLIC, anon, authenticated;
GRANT SELECT (id,nome_fantasia,categoria,descricao,foto_fachada_url,endereco,
  lat,lng,raio_atendimento_km,tempo_medio_entrega_min,taxa_deslocamento_reais,
  ticket_minimo_reais,status,pausado_manualmente,excluido_em)
  ON public.estabelecimentos TO anon, authenticated;

CREATE VIEW public.estabelecimentos_publicos WITH (security_invoker=true, security_barrier=true) AS
SELECT id,nome_fantasia,categoria,descricao,foto_fachada_url,endereco,
  lat,lng,raio_atendimento_km,tempo_medio_entrega_min,taxa_deslocamento_reais,
  ticket_minimo_reais,status,pausado_manualmente
FROM public.estabelecimentos
WHERE status='ativo' AND excluido_em IS NULL;
REVOKE ALL ON public.estabelecimentos_publicos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.estabelecimentos_publicos TO anon,authenticated;

-- Um teste de ownership deve ocorrer sob credenciais privilegiadas porque
-- dono_user_id nao integra a projecao publica nem grants da tabela.
CREATE FUNCTION public.estabelecimento_pertence_ao_usuario(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.estabelecimentos e WHERE e.id=p_id AND e.dono_user_id=auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.estabelecimento_pertence_ao_usuario(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.estabelecimento_pertence_ao_usuario(uuid) TO anon,authenticated;

-- Retorno integral somente apos checagem de sessao e dono/Admin. Nao ha
-- parametro de usuario: o caller jamais escolhe qual identidade consultar.
CREATE FUNCTION public.obter_estabelecimentos_privados(p_id uuid DEFAULT NULL)
RETURNS SETOF public.estabelecimentos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid := auth.uid(); v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  v_admin := public.is_admin(v_uid);
  RETURN QUERY SELECT e.* FROM public.estabelecimentos e
  WHERE (p_id IS NULL OR e.id=p_id) AND (v_admin OR e.dono_user_id=v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.obter_estabelecimentos_privados(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.obter_estabelecimentos_privados(uuid) TO authenticated;

-- A jornada do lojista precisa sempre da propria loja, inclusive quando a
-- mesma conta tambem e Admin. A listagem administrativa acima tem escopo
-- deliberadamente diferente e nunca deve servir como "minha loja".
CREATE FUNCTION public.obter_meu_estabelecimento_privado()
RETURNS SETOF public.estabelecimentos
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT e.* FROM public.estabelecimentos e
  WHERE auth.uid() IS NOT NULL AND e.dono_user_id=auth.uid();
$$;
REVOKE ALL ON FUNCTION public.obter_meu_estabelecimento_privado() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.obter_meu_estabelecimento_privado() TO authenticated;

-- Policies das tabelas filhas nao podem depender de SELECT(dono_user_id).
DROP POLICY publico_ve_horarios ON public.estabelecimentos_horarios;
CREATE POLICY publico_ve_horarios ON public.estabelecimentos_horarios FOR SELECT
USING (EXISTS (SELECT 1 FROM public.estabelecimentos e
  WHERE e.id=estabelecimento_id AND e.status='ativo' AND e.excluido_em IS NULL)
  OR public.estabelecimento_pertence_ao_usuario(estabelecimento_id));
DROP POLICY lojista_gerencia_horarios ON public.estabelecimentos_horarios;
CREATE POLICY lojista_gerencia_horarios ON public.estabelecimentos_horarios FOR ALL
USING (public.estabelecimento_pertence_ao_usuario(estabelecimento_id))
WITH CHECK (public.estabelecimento_pertence_ao_usuario(estabelecimento_id));
DROP POLICY lojista_gerencia_produtos ON public.produtos;
CREATE POLICY lojista_gerencia_produtos ON public.produtos FOR ALL
USING (public.estabelecimento_pertence_ao_usuario(estabelecimento_id))
WITH CHECK (public.estabelecimento_pertence_ao_usuario(estabelecimento_id));
DROP POLICY participantes_leem_solicitacoes ON public.solicitacoes_pedido;
CREATE POLICY participantes_leem_solicitacoes ON public.solicitacoes_pedido FOR SELECT TO authenticated
USING (public.is_admin((select auth.uid())) OR EXISTS (
  SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND
    (p.cliente_id=(select auth.uid()) OR public.estabelecimento_pertence_ao_usuario(p.estabelecimento_id))
));
DROP POLICY participantes_leem_repasses ON public.repasses;
CREATE POLICY participantes_leem_repasses ON public.repasses FOR SELECT TO authenticated
USING (public.is_admin((select auth.uid())) OR public.estabelecimento_pertence_ao_usuario(estabelecimento_id));

-- Vistas financeiras permanecem security_invoker e consultam apenas colunas
-- publicas da loja. A checagem de dono fica no helper autorizado.
CREATE OR REPLACE VIEW public.previsoes_repasse WITH (security_invoker=true) AS
WITH creditos AS (
  SELECT l.estabelecimento_id,l.semana_inicio,SUM(l.valor_centavos)::bigint AS bruto
  FROM public.lancamentos_financeiros l
  WHERE l.tipo='merchant_credit' AND l.valor_centavos>0 AND l.status='concluido' AND l.semana_inicio IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.repasse_itens i WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL)
  GROUP BY l.estabelecimento_id,l.semana_inicio
), dividas AS (
  SELECT l.estabelecimento_id,
    COALESCE(SUM(GREATEST(0,-l.valor_centavos-COALESCE(a.consumido,0))),0)::bigint AS saldo
  FROM public.lancamentos_financeiros l LEFT JOIN LATERAL (
    SELECT -SUM(i.valor_centavos) AS consumido FROM public.repasse_itens i
    WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL
  ) a ON true
  WHERE l.tipo='merchant_credit' AND l.valor_centavos<0 AND l.status='concluido'
  GROUP BY l.estabelecimento_id
), semanas AS (
  SELECT c.*,COALESCE(d.saldo,0) AS divida,
    COALESCE(SUM(c.bruto) OVER (PARTITION BY c.estabelecimento_id ORDER BY c.semana_inicio
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS credito_anterior
  FROM creditos c LEFT JOIN dividas d ON d.estabelecimento_id=c.estabelecimento_id
)
SELECT md5(s.estabelecimento_id::text||':'||s.semana_inicio::text)::uuid AS id,
  s.estabelecimento_id,s.semana_inicio,s.semana_inicio+11 AS previsto_para,
  GREATEST(0,s.bruto-GREATEST(0,s.divida-s.credito_anterior))::bigint AS valor_centavos
FROM semanas s JOIN public.estabelecimentos e ON e.id=s.estabelecimento_id
WHERE public.is_admin((select auth.uid())) OR public.estabelecimento_pertence_ao_usuario(e.id);

CREATE OR REPLACE VIEW public.carteira_lojista WITH (security_invoker=true) AS
WITH lancamentos AS (
  SELECT l.estabelecimento_id,
    COALESCE(SUM(l.valor_centavos) FILTER (WHERE l.tipo='merchant_credit' AND l.status='concluido'
      OR l.tipo='payout' AND l.status<>'erro'),0) AS saldo_centavos,
    COALESCE(-SUM(l.valor_centavos) FILTER (WHERE l.tipo='payout' AND l.status='concluido'),0) AS pago_centavos,
    COALESCE(-SUM(l.valor_centavos) FILTER (WHERE l.tipo='merchant_credit' AND l.valor_centavos<0),0) AS debitado_centavos
  FROM public.lancamentos_financeiros l GROUP BY l.estabelecimento_id
), reservados AS (
  SELECT estabelecimento_id,COALESCE(SUM(valor_centavos),0) AS reservado_centavos
  FROM public.repasses WHERE estado IN ('pendente','em_analise') GROUP BY estabelecimento_id
)
SELECT e.id AS estabelecimento_id,
  (COALESCE(l.saldo_centavos,0)-COALESCE(r.reservado_centavos,0))/100.0 AS saldo_disponivel_reais,
  COALESCE(r.reservado_centavos,0)/100.0 AS saldo_bloqueado_reais,
  COALESCE(l.pago_centavos,0)/100.0 AS total_sacado_reais,
  COALESCE(l.debitado_centavos,0)/100.0 AS total_debitado_reais
FROM public.estabelecimentos e LEFT JOIN lancamentos l ON l.estabelecimento_id=e.id
LEFT JOIN reservados r ON r.estabelecimento_id=e.id
WHERE public.is_admin((select auth.uid())) OR public.estabelecimento_pertence_ao_usuario(e.id);
