import { adminDataSource, getAdminSupabaseClient } from './dataClientBootstrap';

/**
 * Autenticação do Painel Admin — Story 10.1 (AC1, AC2, mock) + Story 3.7
 * (AC6, AC7, real).
 *
 * Local ao app Admin (`apps/admin/src`), NÃO uma port dedicada em
 * `packages/core-data` — [AUTO-DECISION] mesma decisão de "sessão local ao
 * app" já registrada em `apps/lojista/src/navigation/lojistaSession.ts`
 * (Story 9.0.4), aqui aplicada com um caminho real (Supabase Auth) em vez
 * de mock puro → (reason: (1) as 4 telas/hooks consumidoras
 * (`AdminSessionProvider`, `RequireAdminSession`, `AdminSidebarFooter`,
 * `/login`) já importam este módulo pelo shape exato `Admin { id, nome,
 * email }` + `signIn/signOut/onAdminAuthStateChange` — preservar esse
 * contrato e só trocar a implementação por trás mantém as 4 telas
 * INTOCADAS, mesmo espírito de "preservação do piloto"
 * (`docs/prd/07-plano-mvp-piloto.md`); (2) `LojistaAuthPort`/`AuthPort` em
 * `packages/core-data` são tipados no domínio de CADA papel (Cliente/
 * Lojista) — introduzir uma `AdminAuthPort` ali exigiria replicar em mock a
 * pub/sub por `MockDb` que este módulo já tem localmente (Story 10.1), sem
 * ganho real; a mission desta Story deixa a escolha entre port dedicada e
 * mecanismo local explicitamente a cargo do @dev. Revisão de @architect
 * registrada como débito para o @qa desta story).
 *
 * Modo mock (`DATA_SOURCE` ausente/≠`'supabase'`): `signIn` por e-mail
 * ignorando a senha, `sessionStorage` (sobrevive a F5, não à aba fechada) —
 * comportamento IDÊNTICO ao da Story 10.1, sem nenhuma mudança.
 *
 * Modo real (`DATA_SOURCE=supabase`): `signIn` chama
 * `supabase.auth.signInWithPassword` de verdade (AC6) e, em caso de
 * sucesso, checa `is_admin()` (RPC) — uma credencial válida de uma conta
 * SEM entrada em `admin_users` é tratada como FALHA de login (AC7: só quem
 * está em `admin_users` pode tudo; não há tela de acesso parcial), a sessão
 * do SDK é encerrada imediatamente (`supabase.auth.signOut()`) e a Promise
 * rejeita — nenhuma sessão/token de admin fica persistida (AC6). Reaproveita
 * o MESMO `SupabaseClient` de `dataClientBootstrap.ts` (não cria um
 * segundo) para que `admin.supabase.ts#pendingStores`/`pendingStoreDetail`
 * observem a sessão recém-criada aqui via o storage compartilhado
 * (`persistSession: true`, default do `supabase-js`).
 */

export type Admin = {
  id: string;
  nome: string;
  email: string;
};

// ---------------------------------------------------------------------
// Mock (Story 10.1) — inalterado.
// ---------------------------------------------------------------------

const ADMINS: Admin[] = [{ id: 'admin-keepit', nome: 'Admin Keepit', email: 'admin@keepit.com.br' }];

const SESSION_STORAGE_KEY = 'keepit.admin.session';

function findAdminByEmail(email: string): Admin | undefined {
  const normalized = email.trim().toLowerCase();
  return ADMINS.find((admin) => admin.email.toLowerCase() === normalized);
}

function findAdminById(id: string): Admin | undefined {
  return ADMINS.find((admin) => admin.id === id);
}

/**
 * Guardas para SSR: `sessionStorage` não existe no server (Next.js App
 * Router renderiza o client boundary no servidor na primeira passada).
 */
function loadSession(): Admin | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const storedId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!storedId) {
    return null;
  }
  return findAdminById(storedId) ?? null;
}

function saveSession(adminId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, adminId);
}

function clearSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Estado da "sessão atual" em memória, espelhado em `sessionStorage`. Como
 * este módulo é local ao Admin (single-admin por sessão de navegador), um
 * módulo-singleton simples é suficiente — sem necessidade de um `MockDb`.
 */
let currentAdminState: Admin | null = null;
let restored = false;
const listeners = new Set<(admin: Admin | null) => void>();

function ensureRestored(): void {
  if (restored) {
    return;
  }
  restored = true;
  currentAdminState = loadSession();
}

function notify(): void {
  listeners.forEach((listener) => listener(currentAdminState));
}

/**
 * Simula latência de rede curta, mesmo padrão adotado pelo mock do Cliente
 * (`simulateAsync`), para o botão "Entrar" ter um estado de loading real.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockSignIn(email: string, _senha: string): Promise<Admin> {
  await delay(150);
  const admin = findAdminByEmail(email);
  if (!admin) {
    throw new Error('Admin não encontrado');
  }
  currentAdminState = admin;
  restored = true;
  saveSession(admin.id);
  notify();
  return admin;
}

async function mockSignOut(): Promise<void> {
  await delay(50);
  currentAdminState = null;
  clearSession();
  notify();
}

async function mockCurrentAdmin(): Promise<Admin | null> {
  ensureRestored();
  return currentAdminState;
}

/**
 * Pub/sub de mudança de sessão — espelha `onAuthStateChange` do Cliente.
 * Chama o callback imediatamente com o estado atual (já restaurado de
 * `sessionStorage`, se houver) e depois a cada `signIn`/`signOut`.
 */
function mockOnAdminAuthStateChange(callback: (admin: Admin | null) => void): () => void {
  ensureRestored();
  listeners.add(callback);
  callback(currentAdminState);
  return () => {
    listeners.delete(callback);
  };
}

// ---------------------------------------------------------------------
// Supabase real (Story 3.7, AC6, AC7).
// ---------------------------------------------------------------------

function requireSupabaseClient() {
  const client = getAdminSupabaseClient();
  if (!client) {
    throw new Error(
      '[adminAuth] DATA_SOURCE=supabase mas o client Supabase não foi inicializado — verifique SUPABASE_URL/SUPABASE_ANON_KEY.',
    );
  }
  return client;
}

/**
 * Resolve `Admin` a partir de um usuário autenticado do Supabase Auth —
 * `null` quando a conta NÃO está em `admin_users` (AC7). Usa `is_admin()`
 * (RPC `SECURITY DEFINER`, executável por `authenticated`) em vez de tentar
 * um `SELECT` direto e interpretar `PGRST116`/lista vazia — mais explícito,
 * e é exatamente a função que a RLS de `estabelecimentos`
 * (`admin_gerencia_estab`) já usa para autorizar `pendingStores`, então o
 * gate de login espelha fielmente o gate de leitura.
 */
async function mapAuthUserToAdmin(
  supabase: ReturnType<typeof requireSupabaseClient>,
  user: { id: string; email?: string },
): Promise<Admin | null> {
  const { data: isAdmin, error: isAdminError } = await supabase.rpc('is_admin');
  if (isAdminError) {
    throw isAdminError;
  }
  if (!isAdmin) {
    return null;
  }

  const { data, error } = await supabase.from('admin_users').select('id, nome').eq('id', user.id).maybeSingle();
  if (error) {
    throw error;
  }
  // Guarda defensiva: `is_admin()` já confirmou a presença em `admin_users`
  // (mesma função, mesma tabela) — `data` nulo aqui não deveria acontecer.
  if (!data) {
    return null;
  }

  return { id: user.id, nome: data.nome, email: user.email ?? '' };
}

async function supabaseSignIn(email: string, senha: string): Promise<Admin> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new Error('[adminAuth] signIn — resposta sem usuário e sem erro do SDK.');
  }

  const admin = await mapAuthUserToAdmin(supabase, data.user);
  if (!admin) {
    // Credencial válida no Supabase Auth, mas a conta NÃO está em
    // `admin_users` (AC7) — falha de AUTORIZAÇÃO, tratada como falha de
    // login (AC6): nenhuma sessão/token de admin pode ficar persistida, daí
    // o `signOut()` imediato antes de rejeitar.
    await supabase.auth.signOut();
    throw new Error('Esta conta não tem acesso ao Admin.');
  }
  return admin;
}

async function supabaseSignOut(): Promise<void> {
  const { error } = await requireSupabaseClient().auth.signOut();
  if (error) {
    throw error;
  }
}

async function supabaseCurrentAdmin(): Promise<Admin | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return mapAuthUserToAdmin(supabase, data.user);
}

function supabaseOnAdminAuthStateChange(callback: (admin: Admin | null) => void): () => void {
  const supabase = requireSupabaseClient();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }
    const user = session.user;
    void mapAuthUserToAdmin(supabase, user)
      .then((admin) => callback(admin))
      .catch(() => callback(null));
  });
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------
// API pública — branch único por `adminDataSource` (Story 3.7).
// ---------------------------------------------------------------------

export async function signIn(email: string, senha: string): Promise<Admin> {
  return adminDataSource === 'supabase' ? supabaseSignIn(email, senha) : mockSignIn(email, senha);
}

export async function signOut(): Promise<void> {
  return adminDataSource === 'supabase' ? supabaseSignOut() : mockSignOut();
}

export async function currentAdmin(): Promise<Admin | null> {
  return adminDataSource === 'supabase' ? supabaseCurrentAdmin() : mockCurrentAdmin();
}

export function onAdminAuthStateChange(callback: (admin: Admin | null) => void): () => void {
  return adminDataSource === 'supabase' ? supabaseOnAdminAuthStateChange(callback) : mockOnAdminAuthStateChange(callback);
}
