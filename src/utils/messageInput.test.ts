import { shouldSendMessage } from './messageInput';

describe('Chinese input and message submission', () => {
  const enter = { key: 'Enter', isComposing: false, keyCode: 13, shiftKey: false };
  test('sends a committed message with Enter', () => expect(shouldSendMessage(enter)).toBe(true));
  test('does not send while confirming an IME candidate', () => {
    expect(shouldSendMessage({ ...enter, isComposing: true })).toBe(false);
    expect(shouldSendMessage({ ...enter, keyCode: 229 })).toBe(false);
  });
  test('keeps Shift+Enter for a newline and ignores ordinary typing', () => {
    expect(shouldSendMessage({ ...enter, shiftKey: true })).toBe(false);
    expect(shouldSendMessage({ ...enter, key: 'a', keyCode: 65 })).toBe(false);
  });
});
