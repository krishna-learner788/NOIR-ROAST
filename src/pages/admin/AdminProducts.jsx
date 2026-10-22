import { useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Notice from '../../components/ui/Notice'
import { formatINR, paiseToInput, parseRupeesToPaise } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import useAsync from '../../lib/useAsync'

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const BLANK = {
  id: '', name: '', origin: '', roast_level: '', roast_label: '', tasting_notes: '', description: '',
  price: '', price_status: 'provisional', weight_grams: '250', weight_status: 'provisional',
  stock: '', track_stock: false, is_active: false, sort_order: '0',
  image_src: '', image_alt: '', image_width: '', image_height: '', image_position: '',
}

const toForm = (p) => ({
  id: p.id, name: p.name, origin: p.origin ?? '', roast_level: p.roast_level ?? '', roast_label: p.roast_label ?? '',
  tasting_notes: (p.tasting_notes ?? []).join(', '), description: p.description ?? '',
  price: paiseToInput(p.price_paise), price_status: p.price_status, weight_grams: String(p.weight_grams), weight_status: p.weight_status,
  stock: p.stock_quantity ?? '', track_stock: p.stock_quantity !== null, is_active: p.is_active, sort_order: String(p.sort_order),
  image_src: p.image_src ?? '', image_alt: p.image_alt ?? '', image_width: p.image_width ?? '', image_height: p.image_height ?? '', image_position: p.image_position ?? '',
})

export default function AdminProducts() {
  const [editing, setEditing] = useState(null) // null | { form, isNew }
  const { data: products, loading, error, reload } = useAsync(async () => {
    const { data, error: e } = await supabase.from('products').select('*').order('sort_order').order('name')
    if (e) throw e
    return data
  }, [])

  return (
    <div className="stack">
      <div className="row row--between">
        <h2 className="section-title">Products</h2>
        {!editing && <Button type="button" onClick={() => setEditing({ form: BLANK, isNew: true })}>New product</Button>}
      </div>

      {error && <Notice tone="error" title="Products could not be loaded"><p><button type="button" className="link-inline" onClick={reload}>Try again</button></p></Notice>}
      {loading && !products && <p className="muted" role="status">Loading products…</p>}

      {editing && <ProductForm key={editing.form.id || 'new'} initial={editing.form} isNew={editing.isNew} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}

      {products && !editing && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">All products</caption>
            <thead><tr><th scope="col">Product</th><th scope="col">Status</th><th scope="col">Stock</th><th scope="col" className="num">Price</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}<br /><span className="small muted">{p.id} · {p.weight_grams} g</span></td>
                  <td>
                    <span className={`badge ${p.is_active ? 'badge--good' : 'badge--neutral'}`}><i aria-hidden="true" />{p.is_active ? 'Active' : 'Hidden'}</span>
                    {(p.price_status === 'provisional' || p.weight_status === 'provisional') && <><br /><span className="small muted">provisional data</span></>}
                  </td>
                  <td>{p.stock_quantity === null ? <span className="muted">not tracked</span> : p.stock_quantity}</td>
                  <td className="num money">{formatINR(p.price_paise)}</td>
                  <td><button type="button" className="link-inline" onClick={() => setEditing({ form: toForm(p), isNew: false })} aria-label={`Edit ${p.name}`}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ProductForm({ initial, isNew, onCancel, onSaved }) {
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    const err = {}
    const price = parseRupeesToPaise(f.price)
    const weight = Number(f.weight_grams)
    if (isNew && !SLUG.test(f.id)) err.id = 'Lower-case letters, numbers and hyphens only, e.g. noir-reserve.'
    if (!f.name.trim()) err.name = 'Enter a name.'
    if (price === null || price <= 0) err.price = 'Enter a price in rupees, e.g. 899 or 899.50.'
    if (!Number.isInteger(weight) || weight <= 0) err.weight_grams = 'Enter the weight in grams.'
    if (f.track_stock && !/^\d+$/.test(String(f.stock))) err.stock = 'Enter a whole number, or untick "Track stock".'
    setErrors(err)
    setFormError('')
    if (Object.keys(err).length) return

    const num = (v) => (v === '' || v === null ? null : Number(v))
    const payload = {
      id: f.id, name: f.name.trim(), origin: f.origin.trim() || null, roast_level: num(f.roast_level), roast_label: f.roast_label.trim() || null,
      tasting_notes: f.tasting_notes.split(',').map((s) => s.trim()).filter(Boolean), description: f.description.trim() || null,
      price_paise: price, price_status: f.price_status, weight_grams: weight, weight_status: f.weight_status,
      stock_quantity: f.track_stock ? Number(f.stock) : null, is_active: f.is_active, sort_order: Number(f.sort_order) || 0,
      image_src: f.image_src.trim() || null, image_alt: f.image_alt.trim() || null, image_width: num(f.image_width), image_height: num(f.image_height),
      image_position: f.image_position.trim() || null,
    }
    setBusy(true)
    const { error } = await supabase.rpc('admin_upsert_product', { p: payload })
    setBusy(false)
    if (error) setFormError('The product could not be saved. Check the values and try again.')
    else onSaved()
  }

  return (
    <form className="form-grid form-grid--2 panel" onSubmit={onSubmit} noValidate aria-label={isNew ? 'New product' : `Edit ${initial.name}`}>
      <div className="span-2"><h3 className="section-title">{isNew ? 'New product' : `Edit ${initial.name}`}</h3></div>
      {formError && <div className="span-2"><Notice tone="error" title={formError} /></div>}
      <Field id="p-id" label="ID (used in the URL)" required value={f.id} onChange={set('id')} error={errors.id} disabled={!isNew} hint={isNew ? 'Cannot be changed later.' : undefined} />
      <Field id="p-name" label="Name" required value={f.name} onChange={set('name')} error={errors.name} />
      <Field id="p-origin" label="Origin" value={f.origin} onChange={set('origin')} />
      <Field id="p-sort" label="Sort order" inputMode="numeric" value={f.sort_order} onChange={set('sort_order')} hint="Lower numbers appear first." />
      <Field id="p-level" as="select" label="Roast level" value={f.roast_level} onChange={set('roast_level')}>
        <option value="">Not set</option>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} of 5</option>)}
      </Field>
      <Field id="p-label" label="Roast label" value={f.roast_label} onChange={set('roast_label')} hint="e.g. Light, Medium, Dark." />
      <Field className="span-2" id="p-notes" label="Tasting notes" value={f.tasting_notes} onChange={set('tasting_notes')} hint="Comma-separated. Only notes you have verified." />
      <Field className="span-2" id="p-desc" as="textarea" label="Description (optional)" value={f.description} onChange={set('description')} />

      <Field id="p-price" label="Price (₹)" inputMode="decimal" required value={f.price} onChange={set('price')} error={errors.price} />
      <Field id="p-price-status" as="select" label="Price status" value={f.price_status} onChange={set('price_status')}>
        <option value="provisional">Provisional (placeholder)</option>
        <option value="confirmed">Confirmed</option>
      </Field>
      <Field id="p-weight" label="Weight (grams)" inputMode="numeric" required value={f.weight_grams} onChange={set('weight_grams')} error={errors.weight_grams} />
      <Field id="p-weight-status" as="select" label="Weight status" value={f.weight_status} onChange={set('weight_status')}>
        <option value="provisional">Provisional (placeholder)</option>
        <option value="confirmed">Confirmed</option>
      </Field>

      <label className="check span-2"><input type="checkbox" checked={f.track_stock} onChange={set('track_stock')} /> Track stock (otherwise availability is not limited or claimed)</label>
      {f.track_stock && <Field id="p-stock" label="Units in stock" inputMode="numeric" value={f.stock} onChange={set('stock')} error={errors.stock} />}
      <label className="check span-2"><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> Visible in the shop</label>

      <Field id="p-img" label="Image path" value={f.image_src} onChange={set('image_src')} hint="A file in /public, e.g. /images/roast-noir.jpg." />
      <Field id="p-alt" label="Image description (alt text)" value={f.image_alt} onChange={set('image_alt')} />
      <Field id="p-w" label="Image width (px)" inputMode="numeric" value={f.image_width} onChange={set('image_width')} />
      <Field id="p-h" label="Image height (px)" inputMode="numeric" value={f.image_height} onChange={set('image_height')} />
      <Field className="span-2" id="p-pos" label="Image focal point (optional)" value={f.image_position} onChange={set('image_position')} hint='CSS object-position, e.g. "50% 78%".' />

      <div className="span-2 form-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</Button>
        <Button type="button" variant="link" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
