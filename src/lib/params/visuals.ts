/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  VISUALS — All hex colors and PBR material presets used across   ║
 * ║  the project. Both 2D UI and 3D scene elements pull from here.   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// COLORS — Every color used across the project
// ═══════════════════════════════════════════════════════════════════

export const COLORS = {
  // Brand / Theme
  primary: '#00ff88',
  accent: '#00d4ff',
  warning: '#ffaa00',
  error: '#ff4444',
  gold: '#fbbf24',

  // Station visuals
  stationBase: '#333',
  stationBodyInactive: '#0a0a0a',
  stationBodyEmissiveOff: '#000000',
  lightOff: '#330000',
  lightOn: '#00ff88',
  lightWarning: '#ff9500', // Orange - parameters out of range

  // Trash bin
  trashBin: '#808080',
  trashBinInside: '#000',
  trashBinGlow: '#00cc66',
  trashBinCounter: '#ff4444',

  // Second quality box (amber theme)
  secondQualityBox: '#b08030',
  secondQualityBoxInside: '#1a1000',
  secondQualityBoxGlow: '#f59e0b',
  secondQualityBoxCounter: '#f59e0b',
  secondQualityBoxLabel: '#fbbf24',

  // Shipment box
  shipmentBoxBase: '#8B6914',
  shipmentBoxBack: '#A0782C',
  shipmentBoxFront: '#A0782C',
  shipmentBoxSide: '#96701E',
  shipmentBoxCounter: '#00ff88',
  shipmentBoxLabel: '#fbbf24',

  // Conveyor
  conveyorSlat: '#222',
  conveyorJammed: '#ff4444',

  // Tiles
  tileNormal: '#e5e7eb',
  tileDefected: '#f9a8d4',
  tileLabel: 'black',

  // Production table
  tableBackground: '#0a0a0a',
  tableBorder: '#00ff88',
  tableGridLine: '#333',
  tableHeaderColor: '#fbbf24',
  tableActiveRow: '#fff',
  tableInactiveRow: '#666',
  tableActiveCell: '#00ff88',
  tableEmptyCell: '#222',
  tableCellWhite: '#ffffff',

  // Text
  textWhite: 'white',
  textOutline: '#000000',

  // Forklift
  forkliftBody: '#f5c518',          // Industrial safety yellow
  forkliftCounterweight: '#2a2a2a', // Heavy dark grey ballast block
  forkliftCab: '#e0b800',           // Slightly darker yellow for cab/pillars
  forkliftMast: '#1a1a1a',          // Near-black steel mast rails
  forkliftFork: '#555555',          // Mid-grey steel fork tines
  forkliftWheel: '#111111',         // Dark rubber tyres
  forkliftHub: '#aaaaaa',           // Silver metallic hub caps
  forkliftPallet: '#c8a96e',        // Warm wooden pallet colour
} as const;

// ═══════════════════════════════════════════════════════════════════
// MATERIAL PRESETS — Roughness, metalness, opacity configs
// ═══════════════════════════════════════════════════════════════════

/** PBR material properties for all 3D meshes */
export const MATERIALS = {
  stationBase: { roughness: 0.5, metalness: 0.8 },
  stationBody: { roughness: 0.1, metalness: 0.9, opacity: 0.95, emissiveIntensity: 0 },
  stationBodyActive: { emissiveIntensity: 0.8 },
  trashBin: { metalness: 0.6, roughness: 0.4 },
  trashBinGlow: { emissiveIntensity: 2.0 },
  trashBinStrip: { emissiveIntensity: 1.5 },
  secondQualityBox: { metalness: 0.6, roughness: 0.4 },
  secondQualityBoxGlow: { emissiveIntensity: 2.0 },
  secondQualityBoxStrip: { emissiveIntensity: 1.5 },
  shipmentBox: { roughness: 0.8, metalness: 0.1 },
  conveyorSlat: { metalness: 0.6, roughness: 0.4 },
  tile: { roughness: 0.3, metalness: 0.1 },
  tableBase: { roughness: 0.1, metalness: 0.9, opacity: 0.8 },
  tableBorderGlow: { emissiveIntensity: 0.6 },
  tableGridLine: { opacity: 0.5 },
  // Forklift PBR presets
  forkliftBody: { roughness: 0.4, metalness: 0.3 },          // Painted steel chassis
  forkliftCounterweight: { roughness: 0.6, metalness: 0.7 }, // Heavy cast iron block
  forkliftCab: { roughness: 0.4, metalness: 0.2 },           // Painted cab panels
  forkliftMast: { roughness: 0.3, metalness: 0.9 },          // Polished mast steel
  forkliftFork: { roughness: 0.3, metalness: 0.8 },          // Hardened fork steel
  forkliftWheel: { roughness: 0.9, metalness: 0.0 },         // Rubber tyre surface
  forkliftHub: { roughness: 0.2, metalness: 0.9 },           // Chrome hub disc
  forkliftPallet: { roughness: 0.85, metalness: 0.0 },       // Rough wooden pallet
} as const;
