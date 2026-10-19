"""Exercita a projeção pública pelo PostgREST local com cinco identidades.

Exige uma pilha local descartável já migrada; não lê arquivos de ambiente nem
possui endpoint, container, banco ou segredo padrão.
"""

import base64
import hashlib
import hmac
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


REQUIRED = (
    'SUPABASE_DB_CONTAINER',
    'SUPABASE_DB_NAME',
    'SUPABASE_REST_URL',
    'SUPABASE_JWT_SECRET',
)
missing = [name for name in REQUIRED if not os.environ.get(name)]
if os.environ.get('KEEPIT_DISPOSABLE_DB') != '1' or missing:
    raise SystemExit(
        'Informe KEEPIT_DISPOSABLE_DB=1 e ' + ', '.join(REQUIRED)
        + ' para uma pilha Supabase local descartável.'
    )

CONTAINER = os.environ['SUPABASE_DB_CONTAINER']
DATABASE = os.environ['SUPABASE_DB_NAME']
REST_URL = os.environ['SUPABASE_REST_URL'].rstrip('/')
JWT_SECRET = os.environ['SUPABASE_JWT_SECRET'].encode()

P = '68888888-0000-4000-8000-000000000'
CLIENT, OWNER, OTHER_OWNER, ADMIN = P + '001', P + '002', P + '003', P + '004'
STORE_A, STORE_B = P + '011', P + '012'

PUBLIC_FIELDS = {
    'id', 'nome_fantasia', 'categoria', 'descricao', 'foto_fachada_url',
    'endereco', 'lat', 'lng', 'raio_atendimento_km',
    'tempo_medio_entrega_min', 'taxa_deslocamento_reais',
    'ticket_minimo_reais', 'status', 'pausado_manualmente',
}


def db(sql: str) -> None:
    result = subprocess.run(
        ['docker', 'exec', CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
         '-U', 'supabase_admin', '-d', DATABASE, '-c', sql],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise AssertionError(f'SQL falhou: {result.stdout}\n{result.stderr}')


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b'=').decode()


def token(user_id: str) -> str:
    header = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    payload = b64(json.dumps({
        'aud': 'authenticated',
        'exp': int(time.time()) + 3600,
        'role': 'authenticated',
        'sub': user_id,
    }, separators=(',', ':')).encode())
    unsigned = f'{header}.{payload}'
    signature = b64(hmac.new(JWT_SECRET, unsigned.encode(), hashlib.sha256).digest())
    return f'{unsigned}.{signature}'


def request(path: str, user_id: str | None = None, payload: dict | None = None) -> tuple[int, object]:
    body = None if payload is None else json.dumps(payload).encode()
    headers = {'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if user_id:
        headers['Authorization'] = f'Bearer {token(user_id)}'
    req = urllib.request.Request(
        f'{REST_URL}/{path.lstrip("/")}', data=body, headers=headers,
        method='POST' if payload is not None else 'GET',
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        return error.code, json.loads(raw) if raw else None


def setup() -> None:
    db(f"""
      INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
      ('{CLIENT}','authenticated','authenticated','rest-client@example.invalid','{{}}','{{}}'),
      ('{OWNER}','authenticated','authenticated','rest-owner@example.invalid','{{}}','{{}}'),
      ('{OTHER_OWNER}','authenticated','authenticated','rest-other@example.invalid','{{}}','{{}}'),
      ('{ADMIN}','authenticated','authenticated','rest-admin@example.invalid','{{}}','{{}}');
      INSERT INTO public.admin_users(id,nome) VALUES ('{ADMIN}','Admin REST');
      INSERT INTO public.estabelecimentos(
        id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,
        tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,
        asaas_wallet_id,dados_receita,status
      ) VALUES
      ('{STORE_A}','{OWNER}','Loja REST A','68888888000101','Responsável A','11999990001',
       'farmacia','Rua A',20,5,'pix-a@example.invalid','email','wallet-a','{{"campo":"privado"}}','ativo'),
      ('{STORE_B}','{OTHER_OWNER}','Loja REST B','68888888000102','Responsável B','11999990002',
       'farmacia','Rua B',20,5,'pix-b@example.invalid','email','wallet-b','{{"campo":"privado"}}','ativo');
    """)


def cleanup() -> None:
    db(f"""
      DELETE FROM public.estabelecimentos WHERE id IN ('{STORE_A}','{STORE_B}');
      DELETE FROM public.admin_users WHERE id='{ADMIN}';
      DELETE FROM auth.users WHERE id IN ('{CLIENT}','{OWNER}','{OTHER_OWNER}','{ADMIN}');
    """)


def assert_public_projection(label: str, user_id: str | None) -> None:
    status, rows = request('estabelecimentos_publicos?select=*&order=id', user_id)
    assert status == 200, f'{label}: status {status}, resposta {rows}'
    assert isinstance(rows, list) and [row['id'] for row in rows] == [STORE_A, STORE_B], (
        f'{label}: lojas públicas inesperadas: {rows}'
    )
    assert all(set(row) == PUBLIC_FIELDS for row in rows), f'{label}: campos inesperados: {rows}'
    print(f'{label}: projeção pública limitada a {len(PUBLIC_FIELDS)} campos')


def main() -> None:
    try:
        setup()
        for label, user_id in (
            ('anônimo', None),
            ('cliente', CLIENT),
            ('outro dono', OTHER_OWNER),
            ('dono', OWNER),
            ('Admin', ADMIN),
        ):
            assert_public_projection(label, user_id)

        status, body = request('rpc/obter_estabelecimentos_privados', payload={'p_id': STORE_A})
        assert status in (401, 403), f'anônimo acessou RPC privada: {status}, {body}'

        status, body = request('rpc/obter_estabelecimentos_privados', CLIENT, {'p_id': STORE_A})
        assert status == 200 and body == [], f'cliente leu cadastro privado: {status}, {body}'

        status, body = request('rpc/obter_estabelecimentos_privados', OTHER_OWNER, {'p_id': STORE_A})
        assert status == 200 and body == [], f'outro dono leu Loja A: {status}, {body}'

        status, body = request('rpc/obter_estabelecimentos_privados', OWNER, {'p_id': STORE_A})
        assert status == 200 and len(body) == 1 and body[0]['cnpj'] == '68888888000101', (
            f'dono não leu cadastro próprio: {status}, {body}'
        )

        status, body = request('rpc/obter_estabelecimentos_privados', ADMIN, {'p_id': None})
        assert status == 200 and len(body) == 2, f'Admin não listou cadastros privados: {status}, {body}'
        print('RPC privada: anônimo/cliente/outro dono bloqueados; dono e Admin limitados ao escopo esperado')
    finally:
        cleanup()


if __name__ == '__main__':
    main()
