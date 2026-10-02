"""Chargeback e reconciliação de refund disputam a mesma trava de pedido.

Uso:
  KEEPIT_DISPOSABLE_DB=1 SUPABASE_DB_CONTAINER=<container> SUPABASE_DB_NAME=<database> \
    python3 supabase/tests/database/chargeback_refund_concurrency.py
"""

import os
import subprocess
import time


CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER')
DATABASE = os.environ.get('SUPABASE_DB_NAME')
if os.environ.get('KEEPIT_DISPOSABLE_DB') != '1' or not CONTAINER or not DATABASE:
    raise SystemExit(
        'Informe KEEPIT_DISPOSABLE_DB=1, SUPABASE_DB_CONTAINER e SUPABASE_DB_NAME '
        'de um banco local descartável.'
    )
P = '78888888-0000-4000-8000-000000000'
CLIENT, MERCHANT, ADMIN = P + '001', P + '002', P + '003'
HUB, STORE = P + '010', P + '020'
ORDERS = [P + '101', P + '102']
ATTEMPTS = [P + '201', P + '202']
OPERATIONS = [P + '301', P + '302', P + '303', P + '304']


def command(sql: str) -> list[str]:
    return [
        'docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
        '-U', 'supabase_admin', '-d', DATABASE, '-c', sql,
    ]


def psql(sql: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command(sql), capture_output=True, text=True, check=False)
    if check and result.returncode:
        raise AssertionError(f'{result.stdout}\n{result.stderr}')
    return result


def admin(sql: str) -> str:
    return (
        "BEGIN; SET LOCAL ROLE authenticated; "
        f"SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); {sql}; COMMIT;"
    )


def wait_until_sleeping(application_name: str, process: subprocess.Popen[str]) -> None:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        sleeping = psql(
            "SELECT count(*) FROM pg_stat_activity "
            f"WHERE application_name='{application_name}' AND wait_event='PgSleep'"
        ).stdout.strip()
        if sleeping == '1':
            return
        if process.poll() is not None:
            out, err = process.communicate()
            raise AssertionError(f'sessão encerrou antes de manter a trava: {out}\n{err}')
        time.sleep(0.05)
    process.terminate()
    out, err = process.communicate(timeout=10)
    raise AssertionError(f'sessão não manteve a trava: {out}\n{err}')


def setup() -> tuple[list[str], list[str]]:
    psql(f"""
      INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
      ('{CLIENT}','authenticated','authenticated','chargeback-refund-client@example.invalid','{{}}','{{}}'),
      ('{MERCHANT}','authenticated','authenticated','chargeback-refund-merchant@example.invalid','{{}}','{{}}'),
      ('{ADMIN}','authenticated','authenticated','chargeback-refund-admin@example.invalid','{{}}','{{}}');
      INSERT INTO public.admin_users(id,nome) VALUES('{ADMIN}','Chargeback Refund Admin');
      INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES('{HUB}','Hub Race Refund','Rua',0,0);
      INSERT INTO public.estabelecimentos(
        id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,
        tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status
      ) VALUES(
        '{STORE}','{MERCHANT}','Loja Race Refund','78888888000100','Titular','11999999999',
        'farmacia','Rua',10,5,'race-refund@example.invalid','email','ativo'
      );
      INSERT INTO public.pedidos(
        id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,
        taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,
        total_pago_reais,forma_pagamento,pago_em,entregue_em
      ) VALUES
        ('{ORDERS[0]}','{CLIENT}','{STORE}','{HUB}','entregue',100,5,10,2.9,107.9,'cartao',now(),now()),
        ('{ORDERS[1]}','{CLIENT}','{STORE}','{HUB}','entregue',100,5,10,2.9,107.9,'cartao',now(),now());
      INSERT INTO public.tentativas_pagamento(
        id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id
      ) VALUES
        ('{ATTEMPTS[0]}','{ORDERS[0]}','{CLIENT}','{OPERATIONS[0]}','cartao','recebido','pay-refund-first'),
        ('{ATTEMPTS[1]}','{ORDERS[1]}','{CLIENT}','{OPERATIONS[1]}','cartao','recebido','pay-chargeback-first');
      INSERT INTO public.lancamentos_financeiros(
        estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe
      ) VALUES
        ('{STORE}','{ORDERS[0]}','merchant_credit',9500,'concluido','Crédito líquido entregue'),
        ('{STORE}','{ORDERS[1]}','merchant_credit',9500,'concluido','Crédito líquido entregue');
      INSERT INTO public.lancamentos_financeiros(
        estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe,motivo_reembolso,responsavel_reembolso
      ) VALUES
        ('{STORE}','{ORDERS[0]}','refund',-9500,'pendente','Refund disputa primeiro','pos_entrega','lojista'),
        ('{STORE}','{ORDERS[1]}','refund',-9500,'pendente','Chargeback disputa primeiro','pos_entrega','lojista');
      SELECT public.processar_evento_pagamento(
        'evt-refund-first','PAYMENT_CHARGEBACK_REQUESTED','pay-refund-first','{ATTEMPTS[0]}',10790,'cartao'
      );
      SELECT public.processar_evento_pagamento(
        'evt-chargeback-first','PAYMENT_CHARGEBACK_REQUESTED','pay-chargeback-first','{ATTEMPTS[1]}',10790,'cartao'
      );
    """)
    occurrences = [
        psql(f"SELECT id FROM public.ocorrencias_pagamento WHERE pedido_id='{order}' AND tipo='chargeback'").stdout.strip()
        for order in ORDERS
    ]
    refunds = [
        psql(f"SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='{order}' AND tipo='refund'").stdout.strip()
        for order in ORDERS
    ]
    return occurrences, refunds


def cleanup() -> None:
    psql(f"""
      BEGIN;
      ALTER TABLE public.decisoes_chargeback DISABLE TRIGGER decisoes_chargeback_imutaveis;
      DELETE FROM public.decisoes_chargeback WHERE pedido_id IN ('{ORDERS[0]}','{ORDERS[1]}');
      ALTER TABLE public.decisoes_chargeback ENABLE TRIGGER decisoes_chargeback_imutaveis;
      DELETE FROM public.ocorrencias_pagamento WHERE pedido_id IN ('{ORDERS[0]}','{ORDERS[1]}');
      DELETE FROM public.eventos_pagamento WHERE pedido_id IN ('{ORDERS[0]}','{ORDERS[1]}');
      DELETE FROM public.eventos_reembolso WHERE lancamento_id IN (
        SELECT id FROM public.lancamentos_financeiros WHERE pedido_id IN ('{ORDERS[0]}','{ORDERS[1]}')
      );
      DELETE FROM public.lancamentos_financeiros WHERE pedido_id IN ('{ORDERS[0]}','{ORDERS[1]}');
      DELETE FROM public.tentativas_pagamento WHERE pedido_id IN ('{ORDERS[0]}','{ORDERS[1]}');
      DELETE FROM public.pedidos WHERE id IN ('{ORDERS[0]}','{ORDERS[1]}');
      DELETE FROM public.estabelecimentos WHERE id='{STORE}';
      DELETE FROM public.hubs WHERE id='{HUB}';
      DELETE FROM public.admin_users WHERE id='{ADMIN}';
      DELETE FROM auth.users WHERE id IN ('{CLIENT}','{MERCHANT}','{ADMIN}');
      COMMIT;
    """)


def resolve(occurrence: str, operation: str) -> str:
    return (
        "SELECT public.resolver_chargeback_admin("
        f"'{occurrence}','lojista','Concorrência com refund','protocolo-race',10790,'{operation}')"
    )


def reconcile(refund: str, reference: str, operation: str) -> str:
    return (
        "SELECT public.registrar_execucao_reembolso("
        f"'{refund}','concluido','{reference}','{operation}',NULL)"
    )


def main() -> None:
    occurrences, refunds = setup()
    try:
        refund_first_sql = admin(
            "SET LOCAL application_name='refund_first_holds_order'; "
            f"{reconcile(refunds[0], 'refund-race-1', OPERATIONS[2])}; SELECT pg_sleep(1.5)"
        )
        refund_first = subprocess.Popen(
            command(refund_first_sql), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        wait_until_sleeping('refund_first_holds_order', refund_first)
        started = time.monotonic()
        decision_after_refund = psql(admin(resolve(occurrences[0], OPERATIONS[3])))
        waited_refund_first = time.monotonic() - started
        refund_out, refund_err = refund_first.communicate(timeout=10)
        assert refund_first.returncode == 0, f'refund concorrente falhou: {refund_out}\n{refund_err}'
        assert waited_refund_first >= 0.9, f'chargeback não aguardou refund ({waited_refund_first:.2f}s)'
        assert '"principalDebitadoCentavos": 0' in decision_after_refund.stdout
        assert psql(
            f"SELECT count(*) FROM public.lancamentos_financeiros WHERE pedido_id='{ORDERS[0]}' "
            "AND tipo='merchant_credit' AND valor_centavos=-9500 AND reembolso_origem_id IS NOT NULL"
        ).stdout.strip() == '1'

        chargeback_first_sql = (
            "BEGIN; SET LOCAL application_name='chargeback_first_holds_order'; "
            f"SELECT id FROM public.pedidos WHERE id='{ORDERS[1]}' FOR UPDATE; "
            "SET LOCAL ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); "
            f"SELECT pg_sleep(1.5); {resolve(occurrences[1], P + '305')}; COMMIT;"
        )
        chargeback_first = subprocess.Popen(
            command(chargeback_first_sql), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        wait_until_sleeping('chargeback_first_holds_order', chargeback_first)
        started = time.monotonic()
        refund_after_chargeback = psql(admin(reconcile(refunds[1], 'refund-race-2', P + '306')))
        waited_chargeback_first = time.monotonic() - started
        chargeback_out, chargeback_err = chargeback_first.communicate(timeout=10)
        assert chargeback_first.returncode != 0 and 'REEMBOLSO_LOJISTA_REQUER_CONCILIACAO' in chargeback_err, (
            f'chargeback deveria aguardar reconciliação: {chargeback_out}\n{chargeback_err}'
        )
        assert waited_chargeback_first >= 0.9, f'refund não aguardou chargeback ({waited_chargeback_first:.2f}s)'
        assert refund_after_chargeback.returncode == 0
        assert psql(f"SELECT count(*) FROM public.decisoes_chargeback WHERE pedido_id='{ORDERS[1]}'").stdout.strip() == '0'
        assert psql(
            f"SELECT count(*) FROM public.lancamentos_financeiros WHERE pedido_id='{ORDERS[1]}' "
            "AND tipo='merchant_credit' AND valor_centavos<0"
        ).stdout.strip() == '1'
        print(
            'ordens concorrentes cobertas: '
            f'refund primeiro ({waited_refund_first:.2f}s), '
            f'chargeback primeiro ({waited_chargeback_first:.2f}s); sem débito duplicado'
        )
    finally:
        cleanup()


if __name__ == '__main__':
    main()
