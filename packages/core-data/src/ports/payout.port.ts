/** Valor líquido devido ao lojista, em centavos inteiros. PIX é sempre manual. */
export interface Repasse {
  id: string;
  estabelecimentoId: string;
  semanaInicio: string;
  previstoPara: string;
  valorCentavos: number;
  estado: 'previsto' | 'pendente' | 'em_analise' | 'pago' | 'compensado' | 'invalidado';
  destinatarioNome: string | null;
  destinatarioResponsavel: string | null;
  chavePix: string | null;
  chavePixTipo: string | null;
  /** Legado de projeção; referência operacional é consultada por RPC Admin-only. */
  referencia: string | null;
  preparadoEm: string | null;
  confirmadoEm: string | null;
  itens?: { lancamentoId: string; pedidoId: string | null; valorCentavos: number;
    numeroPedido?: number | null; comissaoCentavos?: number | null }[];
}

/** Metadado operacional privado: somente o Admin consulta esta prova do PIX externo. */
export interface ComprovanteRepasse {
  referencia: string;
  comprovanteIdentificador: string | null;
  registradoEm: string;
}

export interface PayoutPort {
  /** Loja vê somente os próprios lotes e previsões; Admin vê todos. */
  listar(): Promise<Repasse[]>;
  preparar(input: { semanaInicio: string; operacaoId: string }): Promise<Repasse[]>;
  /** Registra confirmação de um PIX já executado fora do software. */
  confirmar(input: { repasseId: string; referencia: string; comprovanteIdentificador: string; operacaoId: string }): Promise<Repasse>;
  /** RPC Admin-only; o histórico do lojista nunca contém referência ou comprovante. */
  consultarComprovante(repasseId: string): Promise<ComprovanteRepasse | null>;
  /** Congela o lote enquanto uma execução externa incerta é conciliada. */
  marcarEmAnalise(input: { repasseId: string; motivo: string; operacaoId: string }): Promise<Repasse>;
  /** Libera alocações apenas quando nenhum PIX foi executado ou está incerto. */
  invalidar(input: { repasseId: string; motivo: string; operacaoId: string }): Promise<Repasse>;
  /** Fecha análise incerta somente após conciliação documentada que confirme ausência de PIX. */
  resolverSemPix(input: { repasseId: string; motivo: string; evidencia: string; operacaoId: string }): Promise<Repasse>;
}
