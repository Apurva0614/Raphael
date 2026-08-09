// @ts-nocheck
import { useEffect } from 'react'
import { useDebugStore } from '../store/debugStore'

// Floating diagnostic panel. Show with ?debug=1 in the URL or press Shift+D.
export function DebugPanel() {
  const enabled = useDebugStore((s) => s.enabled)
  const setEnabled = useDebugStore((s) => s.setEnabled)
  const toggle = useDebugStore((s) => s.toggle)
  const gridVisible = useDebugStore((s) => s.gridVisible)
  const imageryVisible = useDebugStore((s) => s.imageryVisible)
  const mutedVisible = useDebugStore((s) => s.mutedVisible)
  const cesiumImageryVisible = useDebugStore((s) => s.cesiumImageryVisible)
  const showTileIndicator = useDebugStore((s) => s.showTileIndicator)
  const pendingTiles = useDebugStore((s) => s.pendingTiles)
  const tilesLoaded = useDebugStore((s) => s.tilesLoaded)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        setEnabled(!useDebugStore.getState().enabled)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setEnabled])

  if (!enabled) return null

  const Row = ({
    label,
    checked,
    onChange,
    testId,
  }: {
    label: string
    checked: boolean
    onChange: () => void
    testId: string
  }) => (
    <label className="debug-panel__row">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        data-testid={testId}
      />
      <span>{label}</span>
    </label>
  )

  return (
    <aside
      className="debug-panel"
      role="region"
      aria-label="Debug controls"
      data-testid="debug-panel"
    >
      <header className="debug-panel__header">
        <span>DEBUG</span>
        <button
          type="button"
          aria-label="Close debug panel"
          onClick={() => setEnabled(false)}
        >
          ×
        </button>
      </header>
      <Row
        label="MapLibre imagery"
        checked={imageryVisible}
        onChange={() => toggle('imageryVisible')}
        testId="dbg-imagery"
      />
      <Row
        label="MapLibre muted"
        checked={mutedVisible}
        onChange={() => toggle('mutedVisible')}
        testId="dbg-muted"
      />
      <Row
        label="MGRS grid"
        checked={gridVisible}
        onChange={() => toggle('gridVisible')}
        testId="dbg-grid"
      />
      <Row
        label="Cesium imagery"
        checked={cesiumImageryVisible}
        onChange={() => toggle('cesiumImageryVisible')}
        testId="dbg-cesium-imagery"
      />
      <Row
        label="Tile indicator"
        checked={showTileIndicator}
        onChange={() => toggle('showTileIndicator')}
        testId="dbg-tile-indicator"
      />
      {showTileIndicator && (
        <div
          className={
            tilesLoaded
              ? 'debug-panel__tiles is-idle'
              : 'debug-panel__tiles is-loading'
          }
          data-testid="dbg-tile-status"
        >
          {tilesLoaded ? `idle · ${pendingTiles} pending` : `loading · ${pendingTiles} pending`}
        </div>
      )}
      <footer className="debug-panel__hint">Shift+D to toggle</footer>
    </aside>
  )
}
