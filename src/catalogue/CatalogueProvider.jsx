import { useCallback, useEffect, useMemo, useState } from 'react'
import { PRODUCTS } from '../data/products'
import { isBackendConfigured } from '../lib/config'
import { loadSupabase } from '../lib/loadSupabase'
import { CatalogueContext } from './catalogueContext'
import { fromRow } from './mapProduct'

// Source of truth:
//   backend configured -> the database (public.products, RLS exposes active rows only).
//                         While loading, or if it fails, we show NOTHING rather than stale local
//                         placeholders, so the page can never display a price the server would
//                         not charge. (The server prices every order itself either way.)
//   no backend         -> the local seed in src/data/products.js (demo / offline development).
export default function CatalogueProvider({ children }) {
  const [state, setState] = useState(() =>
    isBackendConfigured
      ? { products: [], status: 'loading', source: 'remote' }
      : { products: PRODUCTS, status: 'ready', source: 'local' },
  )

  const load = useCallback(async () => {
    const supabase = await loadSupabase()
    if (!supabase) return
    setState((s) => ({ ...s, status: 'loading' }))
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) setState({ products: [], status: 'error', source: 'remote' })
    else setState({ products: data.map(fromRow), status: 'ready', source: 'remote' })
  }, [])

  useEffect(() => {
    // Initial fetch from the external system. load() only sets state once the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const value = useMemo(
    () => ({ ...state, getById: (id) => state.products.find((p) => p.id === id), reload: load }),
    [state, load],
  )
  return <CatalogueContext.Provider value={value}>{children}</CatalogueContext.Provider>
}
