import { describe, expect, it, vi } from 'vitest';
import { resolveCurrentStore, observeCurrentStore, type StoreIdentitySource } from './resolveCurrentStore';

function source() {
 return { getMeuEstabelecimentoId: vi.fn(async () => 'loja-real'), getMeuEstabelecimento: vi.fn(async () => ({ status: 'ativo' })) } as unknown as StoreIdentitySource;
}
describe('identidade da loja', () => {
 it('exige sessão e não consulta loja no logout', async () => {
   const store=source();
   expect(await resolveCurrentStore('supabase',null,store)).toBeNull();
   expect(store.getMeuEstabelecimentoId).not.toHaveBeenCalled();
 });
 it('resolve dono autenticado e mantém fixture apenas no mock explícito', async () => {
   expect(await resolveCurrentStore('supabase','user-a',source())).toBe('loja-real');
   expect(await resolveCurrentStore('mock','demo',source())).toBe('estab-farmacia-vida');
 });
 it('não transforma falha de backend em fixture', async () => {
   const store=source(); vi.mocked(store.getMeuEstabelecimentoId).mockRejectedValue(new Error('offline'));
   await expect(resolveCurrentStore('supabase','user-a',store)).rejects.toThrow('offline');
 });
 it('não libera Main para loja não aprovada', async () => {
   const store=source(); vi.mocked(store.getMeuEstabelecimento).mockResolvedValue({status:'em_analise',motivo_rejeicao:null});
   expect(await resolveCurrentStore('supabase','user-a',store)).toBeNull();
 });
 it('descarta resolução anterior após logout e troca de conta', async () => {
   let release!: (id: string) => void;
   const resolve=vi.fn().mockImplementationOnce(() => new Promise<string>(r => {release=r;})).mockResolvedValue('loja-b');
   const states: Array<{id:string|null;loading:boolean}> = [];
   const observer=observeCurrentStore(resolve,s => states.push(s));
   observer.change('a');
   await Promise.resolve();
   observer.change(null);
   expect(states.at(-1)).toMatchObject({id:null,loading:false});
   release('loja-a'); await Promise.resolve();
   expect(states.at(-1)).toMatchObject({id:null,loading:false});
   observer.change('b'); await Promise.resolve();
   await vi.waitFor(() => expect(states.at(-1)).toMatchObject({id:'loja-b',loading:false}));
   observer.dispose(); observer.change('a');
   expect(states.at(-1)?.id).toBe('loja-b');
 });
});

describe('eventos SIGNED_IN repetidos', () => {
 it('preserva a identidade publicada durante e após revalidar o mesmo uid e loja', async () => {
   let finishRefresh!: (id: string) => void;
   const resolve = vi.fn()
     .mockResolvedValueOnce('loja-a')
     .mockImplementationOnce(() => new Promise<string>(resolve => { finishRefresh = resolve; }));
   const published = vi.fn();
   const observer = observeCurrentStore(resolve, published);
   await observer.change('user-a');
   await vi.waitFor(() => expect(published).toHaveBeenLastCalledWith({ id: 'loja-a', loading: false, error: null }));
   published.mockClear();

   // SIGNED_IN também ocorre quando o SDK recupera foco sem mudar o usuário.
   const refresh = observer.change('user-a');
   expect(published).not.toHaveBeenCalled();
   await vi.waitFor(() => expect(finishRefresh).toBeTypeOf('function'));
   finishRefresh('loja-a');
   await refresh;
   expect(published).not.toHaveBeenCalled();
 });

 it('troca somente quando a revalidação confirma outra loja do mesmo uid', async () => {
   let finishRefresh!: (id: string) => void;
   const resolve = vi.fn().mockResolvedValueOnce('loja-a')
     .mockImplementationOnce(() => new Promise<string>(resolve => { finishRefresh = resolve; }));
   const published = vi.fn();
   const observer = observeCurrentStore(resolve, published);
   await observer.change('user-a');
   await vi.waitFor(() => expect(published).toHaveBeenLastCalledWith({ id: 'loja-a', loading: false, error: null }));
   published.mockClear();
   const refresh = observer.change('user-a');
   expect(published).not.toHaveBeenCalled();
   await vi.waitFor(() => expect(finishRefresh).toBeTypeOf('function'));
   finishRefresh('loja-b');
   await refresh;
   expect(published).toHaveBeenCalledTimes(1);
   expect(published).toHaveBeenLastCalledWith({ id: 'loja-b', loading: false, error: null });
 });

 it('não apaga a loja validada quando a revalidação da mesma sessão falha', async () => {
   const resolve = vi.fn().mockResolvedValueOnce('loja-a').mockRejectedValueOnce(new Error('offline'));
   const published = vi.fn();
   const observer = observeCurrentStore(resolve, published);
   await observer.change('user-a');
   await vi.waitFor(() => expect(published).toHaveBeenLastCalledWith({ id: 'loja-a', loading: false, error: null }));
   published.mockClear();
   await observer.change('user-a');
   expect(published).not.toHaveBeenCalled();
 });
});
