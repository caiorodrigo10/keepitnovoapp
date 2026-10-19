import { apenasDigitosCpf, isCpfValido } from './cpf';

export interface CpfSubmitInput {
  cpf: string;
  clienteId?: string;
  updateCpf(clienteId: string, digits: string): Promise<void>;
}

export type CpfSubmitResult =
  | { status: 'success'; digits: string }
  | { status: 'invalid' }
  | { status: 'save-failed' }
  | { status: 'busy' };

export function createCpfSubmissionController() {
  let pending = false;
  return {
    isPending: () => pending,
    async submit({ cpf, clienteId, updateCpf }: CpfSubmitInput): Promise<CpfSubmitResult> {
      if (pending) return { status: 'busy' };
      const digits = apenasDigitosCpf(cpf);
      if (!isCpfValido(digits)) return { status: 'invalid' };
      if (!clienteId) return { status: 'save-failed' };
      pending = true;
      try {
        await updateCpf(clienteId, digits);
        return { status: 'success', digits };
      } catch {
        return { status: 'save-failed' };
      } finally {
        pending = false;
      }
    },
  };
}
