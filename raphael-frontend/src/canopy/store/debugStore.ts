// @ts-nocheck
import { create } from 'zustand'

// Lightweight UI debug toggles. Components subscribe to flip MapLibre/Cesium
// layer visibility and surface tile-load activity for manual verification.
export type DebugState = {
  enabled: boolean
  gridVisible: boolean
  imageryVisible: boolean
  mutedVisible: boolean
  cesiumImageryVisible: boolean
  showTileIndicator: boolean
  pendingTiles: number
  tilesLoaded: boolean
  setEnabled: (v: boolean) => void
  toggle: (
    key:
      | 'gridVisible'
      | 'imageryVisible'
      | 'mutedVisible'
      | 'cesiumImageryVisible'
      | 'showTileIndicator',
  ) => void
  setTileStats: (pending: number, loaded: boolean) => void
}

const initialEnabled =
  typeof window !== 'undefined' &&
  /[?&]debug=1\b/.test(window.location.search)

export const useDebugStore = create<DebugState>((set) => ({
  enabled: initialEnabled,
  gridVisible: true,
  imageryVisible: true,
  mutedVisible: false,
  cesiumImageryVisible: true,
  showTileIndicator: true,
  pendingTiles: 0,
  tilesLoaded: true,
  setEnabled: (v) => set({ enabled: v }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<DebugState>),
  setTileStats: (pendingTiles, tilesLoaded) =>
    set({ pendingTiles, tilesLoaded }),
}))
