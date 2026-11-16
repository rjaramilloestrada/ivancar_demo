import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import PassengerApp from '@/features/passenger/PassengerApp';

// Vistas secundarias en chunks aparte: el pasajero (móvil) carga solo lo suyo.
const CentralPlaceholder = lazy(() => import('@/features/central/CentralPlaceholder'));
const SplitDemo = lazy(() => import('@/features/demo/SplitDemo'));
const UiKit = lazy(() => import('@/features/ui-kit/UiKit'));
const MapLab = lazy(() => import('@/features/map-lab/MapLab'));
const FxLab = lazy(() => import('@/features/fx-lab/FxLab'));

/**
 * Rutas (HashRouter, porque GitHub Pages no reescribe rutas SPA):
 *   #/         app del pasajero
 *   #/central  central de despacho
 *   #/demo     teléfono + central lado a lado (presentación)
 *   #/ui       catálogo interno de componentes
 *   #/map-lab  banco de pruebas interno del mapa
 *   #/fx-lab   catálogo interno de la capa de animación
 */
export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<PassengerApp />} />
          <Route path="/central" element={<CentralPlaceholder />} />
          <Route path="/demo" element={<SplitDemo />} />
          <Route path="/ui" element={<UiKit />} />
          <Route path="/map-lab" element={<MapLab />} />
          <Route path="/fx-lab" element={<FxLab />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

function RouteFallback() {
  return (
    <div role="status" aria-label="Cargando" className="grid min-h-dvh place-items-center bg-ivancar-black">
      <Logo height={32} className="opacity-80" />
    </div>
  );
}
