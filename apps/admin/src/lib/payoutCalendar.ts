/** Semana de vendas já encerrada, com corte à segunda 00h em São Paulo. */
export function previousClosedWeek(now: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const localDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  localDay.setUTCDate(localDay.getUTCDate() - (localDay.getUTCDay() + 6) % 7 - 7);
  return localDay.toISOString().slice(0, 10);
}
