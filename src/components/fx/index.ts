/**
 * Capa de animación IVANCAR (PLAN_IVANCAR.md §7.5). Catálogo vivo en #/fx-lab.
 * Todo respeta prefers-reduced-motion y anima solo transform/opacity (o canvas).
 *
 * Nota: "Pedir taxi → cargando → check" ya lo cubre `Button` (state + morph) de components/ui.
 */
export { Splash, useSplashOnce, shouldShowSplash, markSplashShown } from './Splash';
export type { SplashProps } from './Splash';
export { RadarPulse, RadarPulseMarker } from './RadarPulse';
export type { RadarPulseProps, RadarPulseMarkerProps, RadarPulseOptions } from './RadarPulse';
export { AnimatedNumber, numberFormats } from './AnimatedNumber';
export type { AnimatedNumberProps, NumberFormat } from './AnimatedNumber';
export { Confetti, useConfetti } from './Confetti';
export type { ConfettiHandle, ConfettiProps, ConfettiFireOptions } from './Confetti';
export { StarRating, STAR_LABELS } from './StarRating';
export type { StarRatingProps } from './StarRating';
export { Stagger, StaggerItem } from './Stagger';
export type { StaggerProps, StaggerItemProps } from './Stagger';
export { SelectGlow, SelectGlowGroup, SelectCard } from './SelectGlow';
export type { SelectGlowProps, SelectCardProps } from './SelectGlow';
export { ArrivalBanner } from './ArrivalBanner';
export type { ArrivalBannerProps } from './ArrivalBanner';
export { InstallPrompt } from './InstallPrompt';
export type { InstallPromptProps, InstallResult } from './InstallPrompt';
export { PageTransition, pageMotion } from './PageTransition';
export type { PageTransitionProps, PageDirection } from './PageTransition';
export { PulseAlert } from './PulseAlert';
export type { PulseAlertProps } from './PulseAlert';
export { EnterHighlight } from './EnterHighlight';
export type { EnterHighlightProps } from './EnterHighlight';
export { prefersReducedMotion } from './reducedMotion';
