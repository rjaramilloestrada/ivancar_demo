import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Logo } from '@/components/brand/Logo';
import PassengerApp from '@/features/passenger/PassengerApp';
import { navigate, useHashPath } from '@/lib/hashRouter';

// Vistas secundarias en chunks aparte: el pasajero (móvil) carga solo lo suyo.
const DispatchPanel = lazy(() => import('@/features/central/DispatchPanel'));
const SplitDemo = lazy(() => import('@/features/demo/SplitDemo'));
const UiKit = lazy(() => import('@/features/ui-kit/UiKit'));
const MapLab = lazy(() => import('@/features/map-lab/MapLab'));
const FxLab = lazy(() => import('@/features/fx-lab/FxLab'));

/**
 * Rutas por hash (lib/hashRouter; GitHub Pages no reescribe rutas SPA):
 *   #/         app del pasajero
 *   #/central  central de despacho
 *   #/demo     teléfono + central lado a lado (presentación)
 *   #/ui       catálogo interno de componentes
 *   #/map-lab  banco de pruebas interno del mapa
 *   #/fx-lab   catálogo interno de la capa de animación
 */
export default function App() {
  const path = useHashPath();
  const known = path in ROUTES;
  // Ruta desconocida: al pasajero, sin dejar la ruta rota en el historial.
  useEffect(() => {
    if (!known) navigate('/', { replace: true });
  }, [known]);
  const View = ROUTES[path] ?? PassengerApp;
  return (
    <Suspense fallback={<RouteFallback />}>
      <View />
    </Suspense>
  );
}

const ROUTES: Record<string, ComponentType> = {
  '/': PassengerApp,
  '/central': DispatchPanel,
  '/demo': SplitDemo,
  '/ui': UiKit,
  '/map-lab': MapLab,
  '/fx-lab': FxLab,
};

function RouteFallback() {
  return (
    <div role="status" aria-label="Cargando" className="grid min-h-dvh place-items-center bg-ivancar-black">
      <Logo height={32} className="opacity-80" />
    </div>
  );
}
