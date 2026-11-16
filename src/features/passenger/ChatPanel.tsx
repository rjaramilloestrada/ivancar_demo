import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { IconArrowRight, IconClose, IconInfo } from '@/components/ui';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { phaseProgress, rideEvents, useRide } from '@/store/rideStore';
import { driverGreeting, driverReply, QUICK_REPLIES, useChat, type ReplyContext } from './chat/chatStore';
import { Avatar } from './parts';
import { remainingText } from './screens/AssignedSheet';

const time = (t: number) => new Date(t).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Contexto actual del viaje para las respuestas del conductor. */
function replyContext(): ReplyContext | null {
  const s = useRide.getState();
  if (!s.unit || !s.ride) return null;
  const p = phaseProgress(s);
  const inTrip = s.step === 'inTrip';
  const arrived = !inTrip && (s.ride.status === 'arrived' || p >= 1);
  const total = inTrip ? (s.route?.duration_s ?? 0) : (s.approach?.duration_s ?? 0);
  const v = s.unit.vehicle;
  return {
    driver: s.unit.display_name.split(' ')[0],
    pickup: s.ride.pickup_label,
    eta: remainingText(total, p),
    arrived,
    inTrip,
    car: `${v.make} ${v.model} ${v.color.toLowerCase()}, placa ${v.plate}`,
    askedWhere: useChat.getState().askedWhere,
  };
}

/**
 * Respuestas automáticas del conductor: saludo al abrir, respuesta con contexto a cada
 * mensaje (con "escribiendo…"), y "Ya estoy afuera" al llegar aunque el chat esté cerrado
 * (suma no leídos). El chat se limpia al terminar o cancelar el viaje.
 */
function useDriverBot(open: boolean) {
  const rideId = useRide((s) => s.ride?.id ?? null);
  const step = useRide((s) => s.step);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (rideId && (step === 'assigned' || step === 'inTrip')) useChat.getState().bind(rideId);
  }, [rideId, step]);

  useEffect(
    () =>
      rideEvents.on((e) => {
        if (e.type === 'completed' || e.type === 'cancelled') useChat.getState().clear();
        if (e.type === 'reassigned') useChat.getState().clear();
        if (e.type === 'arrived') {
          const c = useChat.getState();
          if (c.arrivedSent) return;
          c.flag('arrivedSent');
          // Rápido: el pasajero tiene pocos segundos antes de subir.
          say(
            () => {
              const ctx = replyContext();
              return ctx ? `Ya estoy afuera. Busca un ${ctx.car}.` : null;
            },
            600,
            0,
          );
        }
      }),
    [],
  );

  /** Encola una respuesta con su tiempo de "escribiendo". */
  function say(make: () => string | null, delay = 1200, perChar = 12) {
    queue.current = queue.current.then(async () => {
      const text = make();
      if (!text || !alive.current) return;
      const chat = useChat.getState();
      chat.setTyping(true);
      await new Promise((r) => setTimeout(r, Math.min(2200, delay + text.length * perChar)));
      if (!alive.current) return;
      const after = useChat.getState();
      after.setTyping(false);
      const isOpen = useRide.getState().chatOpen;
      if (after.rideId) after.add('driver', text, { unread: !isOpen });
    });
  }

  // Saludo la primera vez que se abre el chat del pedido.
  useEffect(() => {
    if (!open) return;
    const c = useChat.getState();
    if (c.greeted || c.messages.length) return;
    c.flag('greeted');
    say(() => {
      const ctx = replyContext();
      return ctx ? driverGreeting(ctx) : null;
    }, 900);
  }, [open]);

  return {
    send(text: string) {
      const clean = text.trim();
      if (!clean) return;
      useChat.getState().add('me', clean);
      track('chat_message');
      say(() => {
        const ctx = replyContext();
        if (!ctx) return null;
        const r = driverReply(clean, ctx);
        if (r.asksWhere) useChat.getState().flag('askedWhere');
        return r.text;
      });
    },
  };
}

/**
 * Chat simulado con el conductor asignado (P6/P7). Se abre con el botón "Chat" del paso
 * asignado (`setChatOpen(true)`). Diálogo nativo: foco atrapado, Escape cierra, foco en el
 * campo al abrir; la conversación es un `role="log"` con anuncios discretos.
 */
export function ChatPanel() {
  const open = useRide((s) => s.chatOpen);
  const unit = useRide((s) => s.unit);
  const setOpen = useRide((s) => s.setChatOpen);
  const hasUnit = !!unit;
  const messages = useChat((s) => s.messages);
  const typing = useChat((s) => s.typing);
  const bot = useDriverBot(open);
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      useChat.getState().markRead();
      track('chat_open');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      useRide.getState().setChatOpen(false);
    };
    // Chrome puede cerrar el diálogo con Escape sin emitir 'cancel': se sincroniza al cerrar.
    const onClose = () => {
      if (useRide.getState().chatOpen) useRide.getState().setChatOpen(false);
    };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('close', onClose);
    return () => {
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('close', onClose);
    };
    // El diálogo existe solo con unidad asignada: se engancha cuando aparece.
  }, [hasUnit]);

  // Lo nuevo siempre a la vista; leído si el chat está abierto.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (open) useChat.getState().markRead();
  }, [messages.length, typing, open]);

  if (!unit) return null;
  const first = unit.display_name.split(' ')[0];

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    bot.send(draft);
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      className="iv-dialog m-0 mt-auto h-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-[420px]"
      data-testid="chat"
    >
      {open && (
        <div className="mx-2 mb-[max(8px,env(safe-area-inset-bottom))] flex h-[min(620px,86dvh)] flex-col overflow-hidden rounded-[28px] border border-line-strong bg-surface-raised shadow-sheet sm:mx-0 sm:mb-0">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Avatar unit={unit} size={42} />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-[17px] font-extrabold leading-tight">
                {unit.display_name}
              </h2>
              <p className="truncate text-[12.5px] text-fg-65">
                {unit.vehicle.make} {unit.vehicle.model} · {unit.vehicle.plate}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
              className="grid size-11 shrink-0 place-items-center rounded-full text-fg-75 transition-colors hover:bg-white/10 hover:text-fg"
              data-testid="chat-close"
            >
              <IconClose size={20} />
            </button>
          </div>

          <div ref={logRef} role="log" aria-live="polite" aria-label={`Mensajes con ${unit.display_name}`} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="chat-log">
            <p className="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-fg-65">
              <IconInfo size={13} />
              Chat de demostración · respuestas automáticas
            </p>
            <ul className="flex flex-col gap-2">
              {messages.map((m) => (
                <li key={m.id} className={cn('flex', m.from === 'me' ? 'justify-end' : 'justify-start')} data-from={m.from} data-testid="chat-message">
                  <div
                    className={cn(
                      'max-w-[80%] rounded-[20px] px-3.5 py-2 text-[15px] leading-snug',
                      m.from === 'me' ? 'rounded-br-md bg-ivancar-yellow text-on-yellow' : 'rounded-bl-md bg-white/[0.08] text-fg',
                    )}
                  >
                    <span className="sr-only">{m.from === 'me' ? 'Tú: ' : `${first}: `}</span>
                    {m.text}
                    <span className={cn('mt-0.5 block text-right text-[10.5px] tabular-nums', m.from === 'me' ? 'text-black/60' : 'text-fg-55')}>{time(m.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {typing && (
              <p className="mt-2 flex items-center gap-2 text-[12.5px] text-fg-65" data-testid="chat-typing">
                <span aria-hidden className="flex gap-1 rounded-full bg-white/[0.08] px-3 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-pulse rounded-full bg-fg-75 motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
                  ))}
                </span>
                {first} está escribiendo…
              </p>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1" role="group" aria-label="Respuestas rápidas">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  bot.send(q);
                  inputRef.current?.focus();
                }}
                className="h-9 shrink-0 rounded-full border border-line-strong px-3.5 text-[13.5px] font-semibold text-fg-80 transition-colors hover:border-ivancar-yellow hover:text-fg"
                data-testid="chat-quick"
              >
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-line px-3 py-3">
            <label htmlFor={`${titleId}-input`} className="sr-only">
              Escribe un mensaje a {first}
            </label>
            <input
              id={`${titleId}-input`}
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={280}
              autoComplete="off"
              placeholder={`Escribe a ${first}…`}
              className="h-12 min-w-0 flex-1 rounded-full border border-line-strong bg-black/40 px-4 text-[16px] text-fg outline-none placeholder:text-fg-55 focus:border-ivancar-yellow"
              data-testid="chat-input"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!draft.trim()}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-ivancar-yellow text-on-yellow transition-opacity disabled:opacity-40"
              data-testid="chat-send"
            >
              <IconArrowRight size={22} />
            </button>
          </form>
        </div>
      )}
    </dialog>
  );
}
