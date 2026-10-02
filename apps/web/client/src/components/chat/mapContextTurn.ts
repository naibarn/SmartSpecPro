/** Attach the reviewed map summary to exactly one user-authored chat turn. */
export function attachMapContextToUserTurn(message: string, contextText?: string): string {
  const trimmedMessage = message.trim();
  const trimmedContext = contextText?.trim();
  if (!trimmedMessage || !trimmedContext) return trimmedMessage;
  return `${trimmedMessage}\n\n${trimmedContext}`;
}
