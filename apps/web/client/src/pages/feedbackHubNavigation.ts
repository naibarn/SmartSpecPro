export function parseFeedbackTicketId(search: string): number | null {
  const ticketIdParam = new URLSearchParams(search).get("ticketId");
  if (!ticketIdParam) return null;

  const ticketId = Number.parseInt(ticketIdParam, 10);
  return Number.isNaN(ticketId) ? null : ticketId;
}

type FeedbackTicketListItem = {
  id: number;
  createdAt?: string | Date | null;
};

export function sortFeedbackTicketsNewestFirst<T extends FeedbackTicketListItem>(
  tickets: T[],
): T[] {
  return [...tickets].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return right.id - left.id;
  });
}

export function pinSelectedFeedbackTicket<T extends FeedbackTicketListItem>(
  tickets: T[],
  selectedTicketId: number | null,
  selectedTicket?: T,
): T[] {
  if (selectedTicketId == null) return tickets;
  const selected = selectedTicket ?? tickets.find(ticket => ticket.id === selectedTicketId);
  if (!selected) return tickets;
  return [selected, ...tickets.filter(ticket => ticket.id !== selectedTicketId)];
}
