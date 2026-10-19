"""Duas aprovações reais disputam o lock do mesmo pedido no Supabase local.

Uso: python3 supabase/tests/database/reembolsos_concorrencia.py
"""

import os
import subprocess
import time


CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER', 'supabase_db_jhhbewnmnorhmsdvfppo')
P = '78999999-0000-4000-8000-000000000'
CLIENT, MERCHANT, ADMIN = P + '001', P + '002', P + '003'
HUB, STORE, ORDER = P + '010', P + '020', P + '101'
CASE1, CASE2 = P + '201', P + '202'


def psql(sql: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    command = ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if check and result.returncode:
        raise AssertionError(f'{result.stdout}\n{result.stderr}')
    return result


def setup() -> None:
    psql(f"""
      INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
      ('{CLIENT}','authenticated','authenticated','task9-client@example.invalid','{{}}','{{}}'),
      ('{MERCHANT}','authenticated','authenticated','task9-merchant@example.invalid','{{}}','{{}}'),
      ('{ADMIN}','authenticated','authenticated','task9-admin@example.invalid','{{}}','{{}}');
      INSERT INTO public.admin_users(id,nome) VALUES('{ADMIN}','Admin');
      INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES('{HUB}','Hub','Rua',0,0);
      INSERT INTO public.estabelecimentos(id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status)
      VALUES('{STORE}','{MERCHANT}','Loja','78999999000100','Lojista','11999999999','farmacia','Rua',10,5,'refund-concurrency@example.invalid','email','ativo');
      INSERT INTO public.pedidos(id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em)
      VALUES('{ORDER}','{CLIENT}','{STORE}','{HUB}','entregue',10,5,1,2.9,17.9,'pix',now());
      INSERT INTO public.solicitacoes_pedido(id,pedido_id,operacao_id,tipo,estado,motivo,solicitante_id)
      VALUES('{CASE1}','{ORDER}','{P}301','pos_entrega','aberta','Item faltou','{CLIENT}'),
            ('{CASE2}','{ORDER}','{P}302','pos_entrega','aberta','Outro item faltou','{CLIENT}');
    """)


def cleanup() -> None:
    psql(f"""
      BEGIN;
      DELETE FROM public.eventos_reembolso WHERE lancamento_id IN (SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='{ORDER}');
      DELETE FROM public.despesas_reembolso WHERE lancamento_id IN (SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='{ORDER}');
      DELETE FROM public.lancamentos_financeiros WHERE pedido_id='{ORDER}';
      ALTER TABLE public.decisoes_solicitacao DISABLE TRIGGER decisoes_solicitacao_imutaveis;
      DELETE FROM public.decisoes_solicitacao WHERE solicitacao_id IN ('{CASE1}','{CASE2}');
      DELETE FROM public.solicitacoes_pedido WHERE id IN ('{CASE1}','{CASE2}');
      ALTER TABLE public.decisoes_solicitacao ENABLE TRIGGER decisoes_solicitacao_imutaveis;
      DELETE FROM public.pedidos WHERE id='{ORDER}';
      DELETE FROM public.estabelecimentos WHERE id='{STORE}';
      DELETE FROM public.hubs WHERE id='{HUB}';
      DELETE FROM public.admin_users WHERE id='{ADMIN}';
      DELETE FROM auth.users WHERE id IN ('{CLIENT}','{MERCHANT}','{ADMIN}');
      COMMIT;
    """)


def decision(case: str, operation: str) -> str:
    return f"SELECT public.decidir_solicitacao_pedido('{case}',true,'Procede',1200,'lojista','{operation}');"


def main() -> None:
    setup()
    try:
        first_sql = f"BEGIN; SET LOCAL application_name='task9_refund_hold'; SELECT id FROM public.pedidos WHERE id='{ORDER}' FOR UPDATE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); SELECT pg_sleep(1.5); {decision(CASE1, P + '401')} COMMIT;"
        command = ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', first_sql]
        first = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='task9_refund_hold' AND wait_event='PgSleep'").stdout.strip() == '1':
                break
            time.sleep(0.05)
        else:
            raise AssertionError('Primeira aprovação não adquiriu o lock')
        second_sql = f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); {decision(CASE2, P + '402')} COMMIT;"
        started = time.monotonic()
        second = psql(second_sql, check=False)
        waited = time.monotonic() - started
        first_out, first_err = first.communicate(timeout=10)
        assert first.returncode == 0, f'Primeira aprovação falhou: {first_out}\n{first_err}'
        assert second.returncode != 0 and 'REEMBOLSO_EXCEDIDO' in second.stderr, f'Segunda aprovação inesperada: {second.stdout}\n{second.stderr}'
        assert waited >= 0.9, f'Segunda aprovação não aguardou o lock: {waited:.2f}s'
        assert psql(f"SELECT COALESCE(sum(-valor_centavos),0) FROM public.lancamentos_financeiros WHERE pedido_id='{ORDER}' AND tipo='refund'").stdout.strip() == '1200'
        print(f'Concorrência serializada em {waited:.2f}s; somente 1200 centavos reservados.')
    finally:
        cleanup()


if __name__ == '__main__':
    main()
