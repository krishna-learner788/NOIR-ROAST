import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async loader whenever `deps` change and tracks { data, error, loading }.
 * Results of superseded runs are ignored (fast navigation). `reload()` re-runs the loader and keeps
 * the current data on screen meanwhile. The loader should throw on failure.
 * State is only set from promise callbacks, never synchronously inside the effect.
 */
export default function useAsync(loader, deps = []) {
  const key = deps.join('|')
  const [result, setResult] = useState({ key: null, data: undefined, error: null })
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)

  useEffect(() => {
    loaderRef.current = loader
  })

  useEffect(() => {
    let active = true
    loaderRef.current().then(
      (data) => active && setResult({ key, data, error: null }),
      (error) => active && setResult({ key, data: undefined, error }),
    )
    return () => {
      active = false
    }
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const current = result.key === key
  return {
    data: current ? result.data : undefined,
    error: current ? result.error : null,
    loading: !current,
    reload,
  }
}
