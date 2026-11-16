import { Button, ButtonLink, Dialog, IconChat, IconPhone } from '@/components/ui';
import { telHref } from '@/lib/links';
import { useRide } from '@/store/rideStore';

/**
 * Punto de enganche del chat con el conductor.
 * Se abre con `useRide.getState().setChatOpen(true)` (botón "Chat" de P6) y se monta en
 * PassengerApp. Versión provisional del Bloque 3: el Bloque 4 reemplaza este componente
 * por el chat simulado con respuestas automáticas, con la misma API (open/onClose).
 */
export function ChatPanel() {
  const open = useRide((s) => s.chatOpen);
  const unit = useRide((s) => s.unit);
  const setOpen = useRide((s) => s.setChatOpen);
  if (!unit) return null;
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      icon={<IconChat size={22} />}
      title={`Chat con ${unit.display_name}`}
      description="El chat con tu conductor llega en la siguiente versión del demo. Si necesitas algo ahora, llámanos."
      actions={
        <>
          <ButtonLink href={telHref} fullWidth size="lg" leadingIcon={<IconPhone size={20} />}>
            Llamar ahora
          </ButtonLink>
          <Button fullWidth variant="ghost" autoFocus onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </>
      }
    />
  );
}
