/** Atendimento sem chat. Uma solicitação não altera o preparo enquanto aberta. */
export interface SupportCase {
  id: string;
  pedidoId: string;
  tipo: 'cancelamento' | 'pos_entrega' | 'cliente_ausente' | 'lojista_ausente' | 'atraso';
  estado: 'aberta' | 'aprovada' | 'negada' | 'encerrada_por_pin';
  motivo: string;
  motivoDecisao: string | null;
  criadoEm: string;
  encerradaEm: string | null;
  operacaoId: string;
}

export interface SupportPort {
  abrir(input: { pedidoId: string; tipo: SupportCase['tipo']; motivo: string; operacaoId: string }): Promise<SupportCase>;
  listar(): Promise<SupportCase[]>;
  decidir(input: { casoId: string; aprovar: boolean; motivo: string; valorCentavos?: number; responsavel?: 'keepit' | 'lojista'; operacaoId: string }): Promise<SupportCase>;
  /** Registra a execução manual já comprovada no gateway; repetir referência/operação é idempotente. */
  confirmarReembolso(input: { casoId: string; referencia: string; operacaoId: string }): Promise<void>;
}
