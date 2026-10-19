#!/usr/bin/env python3
"""Exercise account-deletion races only against a named disposable local stack.

The test deliberately uses independent ``psql`` processes.  It never selects a
default container and refuses a destination unless the operator has identified
the one-off Task 11 stack explicitly.
"""
import json
import os
import subprocess
import sys
import time

PROJECT = 'keepit-account-deletion-task11'
CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER', '')
DATABASE = os.environ.get('SUPABASE_DB_NAME', '')
HOST = os.environ.get('SUPABASE_DB_HOST', '')
GATEWAY = os.environ.get('SUPABASE_URL', '')
FORBIDDEN = ('keepit-dev', 'jhhbewnmnorhmsdvfppo', 'supabase.co')
USER = '76111111-1111-4111-8111-111111111111'
REQUEST = '76111111-2222-4222-8222-222222222222'


def require_disposable_stack() -> None:
    if os.environ.get('KEEPIT_DISPOSABLE_DB') != '1':
        raise SystemExit('RECUSADO: informe KEEPIT_DISPOSABLE_DB=1.')
    if os.environ.get('KEEPIT_EXTERNAL_GATEWAY_BLOCKED') != '1':
        raise SystemExit('RECUSADO: confirme KEEPIT_EXTERNAL_GATEWAY_BLOCKED=1.')
    if HOST not in ('127.0.0.1', 'localhost', '::1'):
        raise SystemExit('RECUSADO: SUPABASE_DB_HOST precisa ser local.')
    if not CONTAINER or not DATABASE or not GATEWAY:
        raise SystemExit('RECUSADO: informe container, database e URL local da stack.')
    if not CONTAINER.startswith(f'supabase_db_{PROJECT}'):
        raise SystemExit('RECUSADO: container não pertence à stack Task 11.')
    if any(value in CONTAINER.lower() or value in DATABASE.lower() for value in FORBIDDEN[:2]):
        raise SystemExit('RECUSADO: keepit-dev e o projeto cloud são proibidos.')
    if not GATEWAY.startswith(('http://127.0.0.1:', 'http://localhost:', 'http://[::1]:')) or any(value in GATEWAY.lower() for value in FORBIDDEN[2:]):
        raise SystemExit('RECUSADO: SUPABASE_URL não é gateway local.')
    inspected = subprocess.run(['docker', 'inspect', '--format', '{{.Name}}', CONTAINER], text=True, capture_output=True)
    if inspected.returncode or inspected.stdout.strip() != f'/{CONTAINER}':
        raise SystemExit('RECUSADO: container local não foi confirmado.')


def psql(sql: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run([
        'docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-v',
        'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DATABASE, '-c', sql,
    ], text=True, capture_output=True)
    if check and result.returncode:
        raise AssertionError('SQL da concorrência falhou; detalhes foram omitidos.')
    return result


def wait_for(app_name: str) -> None:
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        probe = psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='" + app_name + "' AND wait_event='PgSleep'")
        if probe.stdout.strip() == '1':
            return
        time.sleep(.05)
    raise AssertionError('barreira PostgreSQL não foi alcançada')


def process(sql: str) -> subprocess.Popen[str]:
    return subprocess.Popen([
        'docker', 'exec', CONTAINER, 'psql', '-X', '-A', '-t', '-q', '-v',
        'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DATABASE, '-c', sql,
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def setup() -> None:
    psql(f"""
      INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data)
      VALUES ('{USER}','authenticated','authenticated','task11-race@example.invalid','{{}}')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO private.politicas_retencao_cartoes(escopo,aprovada_em,aprovado_por,evidencia,versao,habilitada)
      VALUES ('cartoes_salvos',now(),'fixture-task11','fixture-task11','test-mvp',true)
      ON CONFLICT (escopo) DO UPDATE SET versao='test-mvp',habilitada=true;
      INSERT INTO public.account_deletion_requests(id,user_id,status,requested_at,delete_at)
      VALUES ('{REQUEST}','{USER}','scheduled',now()-interval '8 days',now()-interval '1 day')
      ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,status='scheduled',requested_at=EXCLUDED.requested_at,delete_at=EXCLUDED.delete_at,processing_at=NULL,completed_at=NULL,failed_at=NULL,failure_code=NULL;
      DELETE FROM private.account_deletion_executions WHERE request_id='{REQUEST}';
    """)


def cleanup() -> None:
    psql(f"""
      DELETE FROM private.account_deletion_executions WHERE request_id='{REQUEST}';
      DELETE FROM public.account_deletion_requests WHERE id='{REQUEST}';
      DELETE FROM auth.users WHERE id='{USER}';
    """, check=False)


def main() -> None:
    require_disposable_stack()
    scenarios: list[dict[str, object]] = []
    try:
        setup()
        # At the PostgreSQL deadline, cancellation has no valid row while one
        # claimant may obtain the lease.  The first process is held only to
        # synchronize the real sessions; no application response is faked.
        holder = process(f"BEGIN; SET application_name='task11_cancel_claim_barrier'; SELECT pg_sleep(1.1); COMMIT;")
        try:
            wait_for('task11_cancel_claim_barrier')
            cancel = process(f"BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM public.cancel_account_deletion_request('{USER}'); COMMIT;")
            claim = process("BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM public.claim_account_deletions(1); COMMIT;")
            cancel_out, cancel_err = cancel.communicate(timeout=10)
            claim_out, claim_err = claim.communicate(timeout=10)
            assert cancel.returncode == 0 and claim.returncode == 0, 'corrida cancel/claim não concluiu'
            assert cancel_out.strip().endswith('0'), 'cancelamento venceu após o prazo do PostgreSQL'
            assert claim_out.strip().endswith('1'), 'claim não obteve vencedor único'
            scenarios.append({'scenario': 'cancel-claim-deadline', 'result': 'one-claim', 'claimed': 1, 'cancelled': 0})
        finally:
            holder.communicate(timeout=10)

        lease = psql(f"SELECT lease_token::text || ',' || generation::text FROM private.account_deletion_executions WHERE request_id='{REQUEST}'").stdout.strip().split(',')
        assert len(lease) == 2 and lease[0], 'claim não gravou lease'
        old_token, old_generation = lease
        psql(f"UPDATE private.account_deletion_executions SET lease_until=now()-interval '1 second' WHERE request_id='{REQUEST}'")
        first = process("BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM public.claim_account_deletions(1); COMMIT;")
        second = process("BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM public.claim_account_deletions(1); COMMIT;")
        first_out, _ = first.communicate(timeout=10)
        second_out, _ = second.communicate(timeout=10)
        assert first.returncode == 0 and second.returncode == 0, 'workers concorrentes falharam'
        assert sorted([first_out.strip()[-1:], second_out.strip()[-1:]]) == ['0', '1'], 'dois workers receberam a mesma geração'
        stale = psql(f"SELECT coalesce(public.renew_account_deletion('{REQUEST}','{old_token}',{old_generation}),false)")
        assert stale.stdout.strip() == 'f', 'worker com lease antiga renovou'
        late = psql(f"SELECT public.registrar_operacao_cartao_service('{USER}',NULL,'76111111-3333-4333-8333-333333333333','perfil','sandbox',true,NULL)", check=False)
        assert late.returncode != 0, 'escrita tardia foi aceita após processing'
        scenarios.append({'scenario': 'workers-and-stale-lease', 'result': 'one-generation', 'workers': 2, 'staleRenewed': False, 'lateWriteDenied': True})
        print(json.dumps({'stack': PROJECT, 'scenarios': scenarios}, separators=(',', ':')))
    finally:
        cleanup()


if __name__ == '__main__':
    main()
