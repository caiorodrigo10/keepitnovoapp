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
