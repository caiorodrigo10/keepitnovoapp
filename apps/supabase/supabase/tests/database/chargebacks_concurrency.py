"""Duas decisões Admin disputam a mesma ocorrência em conexões PostgreSQL reais.

Uso:
  KEEPIT_DISPOSABLE_DB=1 SUPABASE_DB_CONTAINER=<container> SUPABASE_DB_NAME=<database> \
    python3 supabase/tests/database/chargebacks_concurrency.py
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
P = '76666666-0000-4000-8000-000000000'
CLIENT, MERCHANT, ADMIN = P + '001', P + '002', P + '003'
HUB, STORE, ORDER, ATTEMPT = P + '010', P + '020', P + '101', P + '201'
OPERATION_1, OPERATION_2 = P + '301', P + '302'


def psql(sql: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
         '-U', 'supabase_admin', '-d', DATABASE, '-c', sql],
        capture_output=True,
        text=True,
        check=False,
    )
    if check and result.returncode:
        raise AssertionError(f'{result.stdout}\n{result.stderr}')
    return result


def admin(sql: str) -> str:
    return (
        f"BEGIN; SET LOCAL ROLE authenticated; "
        f"SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); {sql}; COMMIT;"
    )


def setup() -> str:
    psql(f"""
      INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
      ('{CLIENT}','authenticated','authenticated','task3-client@example.invalid','{{}}','{{}}'),
      ('{MERCHANT}','authenticated','authenticated','task3-merchant@example.invalid','{{}}','{{}}'),
      ('{ADMIN}','authenticated','authenticated','task3-admin@example.invalid','{{}}','{{}}');
      INSERT INTO public.admin_users(id,nome) VALUES('{ADMIN}','Task 3 Admin');
      INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES('{HUB}','Hub Task 3','Rua',0,0);
      INSERT INTO public.estabelecimentos(
        id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,
        tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status
      ) VALUES(
        '{STORE}','{MERCHANT}','Loja Task 3','76666666000100','Titular','11999999999',
        'farmacia','Rua',10,5,'task3@example.invalid','email','ativo'
      );
      INSERT INTO public.pedidos(
        id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,
        taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,
        total_pago_reais,forma_pagamento,pago_em,entregue_em
      ) VALUES(
        '{ORDER}','{CLIENT}','{STORE}','{HUB}','entregue',100,5,10,2.9,107.9,
        'cartao',now(),now()
      );
      INSERT INTO public.tentativas_pagamento(
        id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id
      ) VALUES(
        '{ATTEMPT}','{ORDER}','{CLIENT}','{P}401','cartao','recebido','pay-task3-race'
      );
      INSERT INTO public.lancamentos_financeiros(
        estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe
      ) VALUES(
        '{STORE}','{ORDER}','merchant_credit',9500,'concluido','Crédito líquido entregue'
      );
      SELECT public.processar_evento_pagamento(
        'evt-task3-race','PAYMENT_CHARGEBACK_REQUESTED','pay-task3-race','{ATTEMPT}',10790,'cartao'
      );
    """)
    return psql(
        f"SELECT id FROM public.ocorrencias_pagamento WHERE pedido_id='{ORDER}' AND tipo='chargeback'"
    ).stdout.strip()


def cleanup() -> None:
    psql(f"""
      BEGIN;
      ALTER TABLE public.decisoes_chargeback DISABLE TRIGGER decisoes_chargeback_imutaveis;
      DELETE FROM public.decisoes_chargeback WHERE pedido_id='{ORDER}';
      ALTER TABLE public.decisoes_chargeback ENABLE TRIGGER decisoes_chargeback_imutaveis;
      DELETE FROM public.ocorrencias_pagamento WHERE pedido_id='{ORDER}';
      DELETE FROM public.eventos_pagamento WHERE pedido_id='{ORDER}';
      DELETE FROM public.lancamentos_financeiros WHERE pedido_id='{ORDER}';
      DELETE FROM public.tentativas_pagamento WHERE pedido_id='{ORDER}';
      DELETE FROM public.pedidos WHERE id='{ORDER}';
      DELETE FROM public.estabelecimentos WHERE id='{STORE}';
      DELETE FROM public.hubs WHERE id='{HUB}';
      DELETE FROM public.admin_users WHERE id='{ADMIN}';
      DELETE FROM auth.users WHERE id IN ('{CLIENT}','{MERCHANT}','{ADMIN}');
      COMMIT;
    """)


def decision(occurrence: str, operation: str) -> str:
    return (
        "SELECT public.resolver_chargeback_admin("
        f"'{occurrence}','lojista','Entrega não comprovada','protocolo-race',10790,'{operation}')"
    )


def main() -> None:
    occurrence = setup()
    try:
        first_sql = (
            "BEGIN; SET LOCAL application_name='task3_chargeback_hold'; "
            f"SELECT id FROM public.ocorrencias_pagamento WHERE id='{occurrence}' FOR UPDATE; "
            "SET LOCAL ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{ADMIN}',true); "
            f"SELECT pg_sleep(1.5); {decision(occurrence, OPERATION_1)}; COMMIT;"
        )
        first = subprocess.Popen(
            ['docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
             '-U', 'supabase_admin', '-d', DATABASE, '-c', first_sql],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            waiting = psql(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE application_name='task3_chargeback_hold' AND wait_event='PgSleep'"
            ).stdout.strip()
            if waiting == '1':
                break
            time.sleep(0.05)
        else:
            out, err = first.communicate(timeout=10)
            raise AssertionError(f'primeira sessão não adquiriu o lock: {out}\n{err}')

        started = time.monotonic()
        second = psql(admin(decision(occurrence, OPERATION_2)), check=False)
        waited = time.monotonic() - started
        first_out, first_err = first.communicate(timeout=10)

        assert first.returncode == 0, f'primeira decisão falhou: {first_out}\n{first_err}'
        assert second.returncode != 0 and 'OCORRENCIA_JA_DECIDIDA' in second.stderr, (
            f'segunda decisão inesperada: {second.stdout}\n{second.stderr}'
        )
        assert waited >= 0.9, f'segunda decisão não aguardou o lock ({waited:.2f}s)'
        assert psql(f"SELECT count(*) FROM public.decisoes_chargeback WHERE pedido_id='{ORDER}'").stdout.strip() == '1'
        assert psql(
            f"SELECT count(*) FROM public.lancamentos_financeiros "
            f"WHERE pedido_id='{ORDER}' AND tipo='merchant_credit' AND valor_centavos<0"
        ).stdout.strip() == '1'
        assert psql(
            f"SELECT valor_centavos FROM public.lancamentos_financeiros "
            f"WHERE pedido_id='{ORDER}' AND tipo='merchant_credit' AND valor_centavos<0"
        ).stdout.strip() == '-13500'
        print(f'decisões serializadas em {waited:.2f}s; uma decisão e um ajuste persistidos')
    finally:
        cleanup()


if __name__ == '__main__':
    main()
