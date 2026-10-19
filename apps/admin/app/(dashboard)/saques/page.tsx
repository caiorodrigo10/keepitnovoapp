import { redirect } from 'next/navigation';

/** Rota legada preservada apenas para links antigos; a operação é semanal. */
export default function SaquesPage() {
  redirect('/repasses');
}
