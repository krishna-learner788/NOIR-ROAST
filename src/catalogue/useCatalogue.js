import { useContext } from 'react'
import { CatalogueContext } from './catalogueContext'

/** { products, status: 'loading' | 'ready' | 'error', source: 'local' | 'remote', getById, reload } */
export function useCatalogue() {
  const ctx = useContext(CatalogueContext)
  if (!ctx) throw new Error('useCatalogue must be used inside <CatalogueProvider>')
  return ctx
}
