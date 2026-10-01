import { redirect } from 'next/navigation';

export default async function SaqueLegadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/repasses/${id}`);
}
