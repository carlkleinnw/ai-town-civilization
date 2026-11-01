export function shouldSendMessage(event: {
  key: string;
  isComposing: boolean;
  keyCode: number;
  shiftKey: boolean;
}) {
  return event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 && !event.shiftKey;
}
