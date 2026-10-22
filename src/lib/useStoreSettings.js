import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const DEFAULTS = { shippingStatus: 'placeholder', taxStatus: 'placeholder', loaded: false }

/**
 * Public store settings that affect what we may claim. Until the owner confirms them the UI says
 * "shipping and taxes are confirmed at checkout" rather than implying a final charge.
 */
export default function useStoreSettings() {
  const [settings, setSettings] = useState(DEFAULTS)
  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.from('store_settings').select('key, value').in('key', ['shipping_status', 'tax_status']).then(({ data }) => {
      if (!active || !data) return
      const get = (k) => data.find((r) => r.key === k)?.value
      setSettings({ shippingStatus: get('shipping_status') ?? 'placeholder', taxStatus: get('tax_status') ?? 'placeholder', loaded: true })
    })
    return () => { active = false }
  }, [])
  return settings
}
