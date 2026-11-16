import '@fontsource-variable/inter';
import './index.css';

import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from '@/components/ui/Toast';
import { whenInterReady } from '@/lib/fonts';

// Pide Inter de inmediato (está precargada): el sheet espera a tenerla para medir.
void whenInterReady();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respeta prefers-reduced-motion en todas las animaciones de Motion. */}
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <App />
      </ToastProvider>
    </MotionConfig>
  </StrictMode>,
);
