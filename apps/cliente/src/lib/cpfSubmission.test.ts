import { describe, expect, it, vi } from 'vitest';
import { createCpfSubmissionController } from './cpfSubmission';

describe('cpfSubmission', () => {
  it('distingue CPF inválido sem persistir', async () => {
    const updateCpf = vi.fn();
    const controller = createCpfSubmissionController();
    await expect(controller.submit({ cpf: '111.444.777-36', clienteId: 'c1', updateCpf })).resolves.toEqual({ status: 'invalid' });
    expect(updateCpf).not.toHaveBeenCalled();
  });

  it('converte ausência de cliente ou rejeição em save-failed', async () => {
    const controller = createCpfSubmissionController();
    await expect(controller.submit({ cpf: '111.444.777-35', updateCpf: vi.fn() })).resolves.toEqual({ status: 'save-failed' });
    await expect(controller.submit({ cpf: '111.444.777-35', clienteId: 'c1', updateCpf: vi.fn().mockRejectedValue(new Error('offline')) })).resolves.toEqual({ status: 'save-failed' });
  });

  it('aceita somente uma persistência por vez', async () => {
    let release!: () => void;
    const updateCpf = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = createCpfSubmissionController();
    const first = controller.submit({ cpf: '111.444.777-35', clienteId: 'c1', updateCpf });
    await expect(controller.submit({ cpf: '111.444.777-35', clienteId: 'c1', updateCpf })).resolves.toEqual({ status: 'busy' });
    release();
    await expect(first).resolves.toEqual({ status: 'success', digits: '11144477735' });
    expect(updateCpf).toHaveBeenCalledTimes(1);
  });
});
