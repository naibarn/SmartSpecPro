export function parseFeedbackTicketId(search: string): number | null {
  const ticketIdParam = new URLSearchParams(search).get("ticketId");
  if (!ticketIdParam) return null;

  const ticketId = Number.parseInt(ticketIdParam, 10);
  return Number.isNaN(ticketId) ? null : ticketId;
}
