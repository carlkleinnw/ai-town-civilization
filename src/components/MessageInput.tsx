import clsx from 'clsx';
import { useMutation, useQuery } from 'convex/react';
import { KeyboardEvent, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import { useLocale } from '../i18n/LocaleProvider';
import { localizeName } from '../i18n/catalog';
import { shouldSendMessage } from '../utils/messageInput';
import { toastOnError } from '../toasts';

export function MessageInput({
  worldId,
  engineId,
  humanPlayer,
  conversation,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  humanPlayer: Player;
  conversation: Conversation;
}) {
  const { locale, t } = useLocale();
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const humanName = descriptions?.playerDescriptions.find(
    (p) => p.playerId === humanPlayer.id,
  )?.name;
  const [text, setText] = useState('');
  const [isSending, setSending] = useState(false);
  const composing = useRef(false);
  const sending = useRef(false);
  const inflightUuid = useRef<string | undefined>();
  const writeMessage = useMutation(api.messages.writeMessage);
  const startTyping = useSendInput(engineId, 'startTyping');
  const currentlyTyping = conversation.isTyping;

  const announceTyping = async () => {
    if (currentlyTyping || inflightUuid.current) return;
    inflightUuid.current = crypto.randomUUID();
    try {
      await startTyping({
        playerId: humanPlayer.id,
        conversationId: conversation.id,
        messageUuid: inflightUuid.current,
      });
    } catch {
      /* Typing indicators are optional; sending still works. */
    } finally {
      inflightUuid.current = undefined;
    }
  };
  const send = async () => {
    if (!text.trim() || sending.current || composing.current) return;
    sending.current = true;
    setSending(true);
    const messageUuid =
      currentlyTyping?.playerId === humanPlayer.id
        ? currentlyTyping.messageUuid
        : crypto.randomUUID();
    try {
      await toastOnError(
        writeMessage({
          worldId,
          playerId: humanPlayer.id,
          conversationId: conversation.id,
          text: text.trim(),
          messageUuid,
        }),
      );
      setText('');
    } catch {
      /* toastOnError displays the failure; preserve the draft for retry. */
    } finally {
      sending.current = false;
      setSending(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (
      shouldSendMessage({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: composing.current || event.nativeEvent.isComposing,
        keyCode: event.nativeEvent.keyCode,
      })
    ) {
      event.preventDefault();
      void send();
    }
  };
  return (
    <div className="leading-tight mb-6 message-composer">
      <span className="uppercase">{localizeName(locale, humanName)}</span>
      <div className={clsx('bubble', 'bubble-mine')}>
        <textarea
          className="message-textarea bg-white"
          value={text}
          rows={3}
          disabled={isSending}
          aria-label={t('messageLabel')}
          placeholder={t('messagePlaceholder')}
          onChange={(event) => {
            setText(event.target.value);
            void announceTyping();
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="message-actions">
        <span>{t('sendHint')}</span>
        <button type="button" disabled={isSending || !text.trim()} onClick={() => void send()}>
          {t(isSending ? 'sending' : 'send')}
        </button>
      </div>
    </div>
  );
}
