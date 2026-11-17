import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { basemap } from '@/theme/tokens';

/**
 * Estilo oscuro IVANCAR para los tiles vectoriales de OpenFreeMap (esquema OpenMapTiles).
 *
 * Criterios:
 * - Fondo casi negro (#111) un punto más claro que la UI (#050505 / #0C0C0C), para que las
 *   tarjetas y el bottom sheet se despeguen del mapa.
 * - Calles en grises escalonados por jerarquía (las avenidas más claras) y legibles a 15–17.
 * - Agua azul muy oscuro y áreas verdes con un tinte apenas perceptible: se distinguen sin
 *   competir con la ruta.
 * - Amarillo #F6C90E reservado para la ruta y la marca: nada del mapa base lo usa.
 * - Nombres en español (`name:es`, con respaldo a `name`), sin íconos (no hace falta sprite).
 *
 * Los zooms de este archivo son los de MapLibre (teselas de 512 px): equivalen al zoom de
 * Leaflet menos 1. El pasajero usa Leaflet 15–17, o sea MapLibre 14–16.
 */

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:es'], ['get', 'name']];
const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

const C = {
  land: '#111214',
  residential: '#141517',
  green: '#101a14',
  water: '#0d2030',
  waterLine: '#12283a',
  building: '#1a1b1e',
  buildingLine: '#222327',
  aeroway: '#1b1c1f',
  path: '#24262a',
  minor: '#2c2e33',
  tertiary: '#383a40',
  secondary: '#43464d',
  primary: '#50535b',
  motorway: '#5c5f68',
  casing: '#0b0b0c',
  rail: '#2a2c30',
  labelStreet: '#c4c6cc',
  labelMinor: '#9fa2a9',
  labelPlace: '#8e9199',
  labelCity: '#e4e5e8',
  labelWater: '#5d87a8',
  labelPoi: '#80838a',
  halo: '#0d0e10',
} as const;

const line = (classes: string[]): ExpressionSpecification => ['match', ['get', 'class'], classes, true, false];
const isLine: ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const isPoly: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const notTunnel: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];

/** Ancho de vía (px) por zoom, interpolado exponencialmente. */
const width = (stops: [number, number][], base = 1.5): ExpressionSpecification =>
  ['interpolate', ['exponential', base], ['zoom'], ...stops.flat()] as ExpressionSpecification;

const ROAD_LEVELS: { id: string; classes: string[]; color: string; minzoom: number; w: [number, number][] }[] = [
  { id: 'path', classes: ['path', 'track'], color: C.path, minzoom: 14, w: [[14, 0.6], [18, 2.5]] },
  { id: 'minor', classes: ['minor', 'service'], color: C.minor, minzoom: 11, w: [[11, 0.4], [13, 1], [15, 3.2], [17, 10], [19, 26]] },
  { id: 'tertiary', classes: ['tertiary'], color: C.tertiary, minzoom: 10, w: [[10, 0.6], [13, 1.6], [15, 4.4], [17, 13], [19, 32]] },
  { id: 'secondary', classes: ['secondary'], color: C.secondary, minzoom: 9, w: [[9, 0.6], [12, 1.6], [15, 5.2], [17, 15], [19, 36]] },
  { id: 'primary', classes: ['primary', 'trunk'], color: C.primary, minzoom: 7, w: [[7, 0.6], [11, 1.8], [15, 6.4], [17, 17], [19, 40]] },
  { id: 'motorway', classes: ['motorway'], color: C.motorway, minzoom: 5, w: [[5, 0.6], [10, 2], [15, 7.4], [17, 19], [19, 44]] },
];

function roadLayers(): LayerSpecification[] {
  const out: LayerSpecification[] = [];
  // Bordes oscuros finos bajo las vías mayores: separan avenidas paralelas y cruces.
  for (const r of ROAD_LEVELS.slice(2)) {
    out.push({
      id: `road-${r.id}-casing`,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', isLine, line(r.classes), notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.casing, 'line-width': width(r.w.map(([z, w]) => [z, w + 1.6])) },
    });
  }
  for (const r of ROAD_LEVELS) {
    out.push({
      id: `road-${r.id}`,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: r.minzoom,
      filter: ['all', isLine, line(r.classes)],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': r.color,
        'line-width': width(r.w),
        // Túneles más tenues.
        'line-opacity': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.5, 1],
        ...(r.id === 'path' ? { 'line-dasharray': [1.5, 1.2] } : {}),
      },
    });
  }
  return out;
}

export function ivancarStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'IVANCAR Dark',
    glyphs: basemap.glyphs,
    sources: {
      openmaptiles: { type: 'vector', url: basemap.tileJson, attribution: basemap.attribution },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': C.land } },
      {
        id: 'landuse-residential',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['all', isPoly, ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood'], true, false]],
        paint: { 'fill-color': C.residential },
      },
      {
        id: 'green',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['all', isPoly, ['match', ['get', 'class'], ['grass', 'wood', 'farmland', 'wetland'], true, false]],
        paint: { 'fill-color': C.green, 'fill-opacity': 0.8 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        filter: isPoly,
        paint: { 'fill-color': C.green },
      },
      {
        id: 'landuse-green',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['all', isPoly, ['match', ['get', 'class'], ['park', 'cemetery', 'pitch', 'stadium', 'golf_course'], true, false]],
        paint: { 'fill-color': C.green },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        filter: ['all', isPoly, notTunnel],
        paint: { 'fill-color': C.water, 'fill-antialias': true, 'fill-outline-color': C.waterLine },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        filter: ['all', isLine, notTunnel],
        paint: { 'line-color': C.water, 'line-width': width([[10, 0.6], [16, 3]], 1.4) },
      },
      {
        id: 'aeroway',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'aeroway',
        minzoom: 11,
        filter: isPoly,
        paint: { 'fill-color': C.aeroway },
      },
      {
        id: 'aeroway-runway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'aeroway',
        minzoom: 11,
        filter: ['all', isLine, ['match', ['get', 'class'], ['runway', 'taxiway'], true, false]],
        paint: { 'line-color': C.aeroway, 'line-width': width([[11, 2], [16, 30]], 1.6) },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-color': C.building,
          'fill-outline-color': C.buildingLine,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1],
        },
      },
      ...roadLayers(),
      {
        id: 'rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['all', isLine, ['==', ['get', 'class'], 'rail']],
        paint: { 'line-color': C.rail, 'line-width': 1, 'line-dasharray': [3, 2] },
      },

      /* ---------------------------------------------------------------- Etiquetas */
      {
        id: 'water-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], false, true],
        layout: {
          'text-field': NAME,
          'text-font': FONT_ITALIC,
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 14],
          'text-letter-spacing': 0.06,
          'text-max-width': 8,
        },
        paint: { 'text-color': C.labelWater, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'waterway-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        minzoom: 12,
        filter: ['all', isLine, ['has', 'name']],
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME,
          'text-font': FONT_ITALIC,
          'text-size': 12,
          'text-letter-spacing': 0.06,
          'symbol-spacing': 400,
        },
        paint: { 'text-color': C.labelWater, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'poi',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'poi',
        minzoom: 15,
        filter: [
          'all',
          ['<=', ['coalesce', ['get', 'rank'], 99], 8],
          ['match', ['get', 'class'], ['shop', 'hospital', 'college', 'school', 'stadium', 'park', 'attraction', 'museum', 'place_of_worship', 'bus', 'railway', 'aerialway', 'lodging', 'town_hall'], true, false],
        ],
        layout: {
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': 11,
          'text-max-width': 8,
          'text-padding': 6,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: { 'text-color': C.labelPoi, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'street-name-minor',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14.5,
        filter: ['all', isLine, ['match', ['get', 'class'], ['minor', 'service'], true, false]],
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 17, 13],
          'text-max-angle': 30,
          'text-padding': 4,
          'symbol-spacing': 280,
        },
        paint: { 'text-color': C.labelMinor, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'street-name-major',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 11,
        filter: ['all', isLine, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false]],
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME,
          'text-font': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], ['literal', FONT_BOLD], ['literal', FONT_REGULAR]] as unknown as string[],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 12.5, 17, 14],
          'text-max-angle': 30,
          'text-padding': 4,
          'symbol-spacing': 320,
        },
        paint: { 'text-color': C.labelStreet, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'place-neighbourhood',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 11,
        maxzoom: 17,
        filter: ['match', ['get', 'class'], ['neighbourhood', 'quarter', 'suburb', 'hamlet', 'village'], true, false],
        layout: {
          'text-field': NAME,
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9.5, 15, 12],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-max-width': 8,
          'text-padding': 10,
        },
        paint: { 'text-color': C.labelPlace, 'text-halo-color': C.halo, 'text-halo-width': 1.6 },
      },
      {
        id: 'place-town',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        maxzoom: 15,
        filter: ['match', ['get', 'class'], ['town', 'city'], true, false],
        layout: {
          'text-field': NAME,
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 12, 17],
          'text-max-width': 8,
        },
        paint: { 'text-color': C.labelCity, 'text-halo-color': C.halo, 'text-halo-width': 1.8 },
      },
    ],
  };
}
