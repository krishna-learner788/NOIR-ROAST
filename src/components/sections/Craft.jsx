import { useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import CraftStatic from './CraftStatic'
import CraftJourney from './CraftJourney'

function webglAvailable() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // free the probe context immediately
    return !!gl
  } catch {
    return false
  }
}

// Immersive scroll-driven 3D roast journey, with the static editorial layout as the
// fallback for reduced motion, data-saver, and missing/failed WebGL.
export default function Craft() {
  const reduce = useReducedMotion()
  const [failed, setFailed] = useState(() => !webglAvailable())
  const saveData = typeof navigator !== 'undefined' && navigator.connection?.saveData
  if (reduce || failed || saveData) return <CraftStatic />
  return <CraftJourney onFail={() => setFailed(true)} />
}
