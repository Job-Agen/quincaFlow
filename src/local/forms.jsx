'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CATEGORIES, EXPENSES, METHODS, today, stockDisplay } from './ledger';
import { readReceipt } from './storage';
import { Field, Select, Form, Button, Amount, Empty, formatMoney } from './ui';

export function ProductForm({ product, onSave }) {
  const initialFactor = product?.packageFactor || 1;
  const [factor, setFactor] = useState(initialFactor);
  return (
    <Form onSubmit={(values) => onSave('product.save', { ...values, id: product?.id })}>
      <Field label="Nom du produit" name="name" defaultValue={product?.name} required maxLength={300} />
      <Select label="Catégorie" name="category" defaultValue={product?.category || CATEGORIES[0]}>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </Select>
      <Field label="Unité de stock (pièce, sac, kg…)" name="baseUnit" defaultValue={product?.baseUnit || String(product?.unit || 'pièce').split(' · ')[0]} required maxLength={30} />
      <div className="local-grid-two">
        <Field label="Prix public par unité" name="retail" type="number" min="0" step="0.01" defaultValue={product ? product.retail / 100 : ''} required />
        <Field label="Prix de gros par unité" name="wholesale" type="number" min="0" step="0.01" defaultValue={product ? product.wholesale / 100 : ''} required />
      </div>
      <Field label="Coût d’achat unitaire" name="cost" type="number" min="0" step="0.01" defaultValue={product ? product.cost / 100 : ''} required />
      <div className="local-grid-two">
        <Field label="Stock actuel (unité de base)" name="stock" type="number" min="0" step="0.001" defaultValue={product?.stock ?? 0} required />
        <Field label="Seuil minimum" name="minStock" type="number" min="0" step="0.001" defaultValue={product?.minStock ?? 5} required />
      </div>
      <div className="local-card" style={{ padding: 16 }}>
        <strong>Conditionnement / vente en gros</strong>
        <p className="local-hint">Exemple : 1 carton = 40 pièces. Le stock reste toujours enregistré en pièces.</p>
        <div className="local-grid-two">
          <Field label="Nom du conditionnement" name="packageUnit" defaultValue={product?.packageUnit || 'carton'} maxLength={30} />
          <Field label="Nombre d’unités dans 1 conditionnement" name="packageFactor" type="number" min="1" step="0.001" value={factor} onChange={(e) => setFactor(e.target.value)} required />
        </div>
        {Number(factor) > 1 ? <Field label="Prix de vente du conditionnement" name="packagePrice" type="number" min="0" step="0.01" defaultValue={product?.packagePrice ? product.packagePrice / 100 : ''} required /> : null}
      </div>
      {product ? <p className="local-hint">Stock affiché : <strong>{stockDisplay(product)}</strong>. Modifier le stock corrige l’inventaire. Pour un réapprovisionnement, utilisez Achats fournisseurs.</p> : null}
    </Form>
  );
}

export function ContactForm({ contact, kind, onSave }) {
  const supplier = kind === 'supplier';
  return <Form onSubmit={(values) => onSave('contact.save', { ...values, kind, id: contact?.id })}>
    <Field label={supplier ? 'Entreprise / grossiste' : 'Nom du client'} name="name" defaultValue={contact?.name} maxLength={300} required />
    <Field label="Téléphone avec indicatif pays" type="tel" name="phone" placeholder="+228 90 12 34 56" defaultValue={contact?.phone} maxLength={40} />
    {supplier ? <><Field label="Contact / commercial" name="contact" defaultValue={contact?.contact} maxLength={300} /><Field label="Secteur d’approvisionnement" name="sector" defaultValue={contact?.sector} maxLength={300} /></> : null}
    {!contact ? <Field label={supplier ? 'Dette fournisseur initiale' : 'Solde débiteur initial'} name="openingDebt" type="number" min="0" step="0.01" defaultValue="0" required /> : null}
    {!contact ? <p className="local-hint">Solde antérieur à l’utilisation de cette boutique. Il n’est pas compté comme une nouvelle vente ou dépense.</p> : null}
  </Form>;
}
function MethodAndDate({ date } = {}) {
  return <div className="local-grid-two"><Select name="method" label="Mode de paiement">{METHODS.map((m)=><option key={m}>{m}</option>)}</Select><Field label="Date" name="date" type="date" defaultValue={date || today()} max={today()} required /></div>;
}

function defaultSaleLine(product, priceMode) {
  if (!product) return { productId:'', quantity:1, unitFactor:1, price:'' };
  return { productId:product.id, quantity:1, unitFactor:1, price:(priceMode === 'wholesale' ? product.wholesale : product.retail) / 100 };
}
export function TradeForm({ data, purchase = false, contactId = '', credit = false, onSave }) {
  const products=data.products.filter(p=>!p.archived), contacts=data[purchase?'suppliers':'customers'].filter(c=>!c.archived);
  const [lines,setLines]=useState([{productId:'',quantity:1,unitFactor:1,price:''}]);
  const [priceMode,setPriceMode]=useState('retail'), [paid,setPaid]=useState(credit?'0':'');
  const change=(index,patch)=>setLines(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));
  const selectProduct=(index,id)=>{
    const p=products.find(x=>x.id===id);
    change(index, purchase ? {productId:id,price:(p?.cost||0)/100,unitFactor:1} : defaultSaleLine(p,priceMode));
  };
  const selectFactor=(index,value)=>{
    const line=lines[index], p=products.find(x=>x.id===line.productId), factor=Number(value);
    const cents=factor>1?(p?.packagePrice || (p?.wholesale||0)*factor):(priceMode==='wholesale'?p?.wholesale:p?.retail)||0;
    change(index,{unitFactor:factor,price:cents/100});
  };
  const switchPriceMode=(mode)=>{
    setPriceMode(mode);
    setLines(rows=>rows.map(line=>{
      const p=products.find(x=>x.id===line.productId); if(!p||Number(line.unitFactor)>1)return line;
      return {...line,price:(mode==='wholesale'?p.wholesale:p.retail)/100};
    }));
  };
  const total=lines.reduce((n,line)=>n+Math.round((Number(line.price)||0)*100*(Number(line.quantity)||0)),0);
  if(!products.length) return <div className="local-form"><Empty>Ajoutez un produit dans Stock avant d’enregistrer cette opération.</Empty></div>;
  return <Form label={purchase?'Enregistrer l’achat et le stock':'Valider la vente'} onSubmit={(values)=>onSave(purchase?'purchase':'sale',{...values,lines,priceMode,paid})}>
    <Select label={purchase?'Fournisseur':'Client (obligatoire pour un crédit)'} name="contactId" defaultValue={contactId}><option value="">{purchase?'Sans fournisseur':'Client comptoir'}</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>
    {!purchase ? <Select label="Tarif par défaut" value={priceMode} onChange={(e)=>switchPriceMode(e.target.value)}><option value="retail">Prix public</option><option value="wholesale">Prix de gros</option></Select> : null}
    <div className="local-trade-lines">{lines.map((line,index)=>{
      const p=products.find(x=>x.id===line.productId), factor=Number(line.unitFactor||1), baseQty=(Number(line.quantity)||0)*factor;
      return <div className="local-trade-line" key={index}>
        <Select label={'Produit '+(index+1)} value={line.productId} required onChange={(e)=>selectProduct(index,e.target.value)}><option value="">Choisir un produit</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {stockDisplay(p)}</option>)}</Select>
        {!purchase && p && Number(p.packageFactor||1)>1 ? <Select label="Conditionnement" value={factor} onChange={(e)=>selectFactor(index,e.target.value)}><option value="1">{p.baseUnit || String(p.unit).split(' · ')[0]}</option><option value={p.packageFactor}>{p.packageUnit} ({p.packageFactor} {p.baseUnit || String(p.unit).split(' · ')[0]})</option></Select> : null}
        <div className="local-line-values">
          <Field label={'Quantité '+(index+1)} type="number" min="0.001" step="0.001" value={line.quantity} required onChange={(e)=>change(index,{quantity:e.target.value})} />
          <Field label={purchase?'Coût unitaire':'Prix unitaire modifiable'} type="number" min="0" step="0.01" value={line.price} required onChange={(e)=>change(index,{price:e.target.value})} />
          <button type="button" className="local-icon danger" aria-label={'Retirer la ligne '+(index+1)} disabled={lines.length===1} onClick={()=>setLines(rows=>rows.filter((_,i)=>i!==index))}><Trash2 size={18}/></button>
        </div>
        {!purchase && p ? <p className="local-hint">Sortie de stock : {baseQty} {p.baseUnit || String(p.unit).split(' · ')[0]} · Disponible : {stockDisplay(p)}</p> : null}
      </div>;
    })}</div>
    <Button tone="soft" onClick={()=>setLines(rows=>[...rows,{productId:'',quantity:1,unitFactor:1,price:''}])}><Plus size={19}/>Ajouter un produit</Button>
    <div className="local-total"><span>TOTAL</span><Amount value={total} currency={data.shop.currency}/></div>
    <Field label={purchase?'Montant payé maintenant':'Montant encaissé maintenant'} type="number" min="0" max={total/100} step="0.01" placeholder={'Vide = totalité ('+total/100+')'} value={paid} onChange={(e)=>setPaid(e.target.value)} />
    {paid!==''&&Number(paid)*100<total?<p className="local-notice">À crédit : {formatMoney(total-Math.round(Number(paid)*100),data.shop.currency)}</p>:null}
    <MethodAndDate/>
    {purchase?<p className="local-hint">Les quantités reçues entrent immédiatement en stock. Le montant non payé devient une dette fournisseur.</p>:null}
  </Form>;
}

export function PaymentForm({ contact, kind, balance, currency, onSave }) {
  return <Form onSubmit={(values)=>onSave('payment',{...values,kind,contactId:contact.id})} label={kind==='customer'?'Enregistrer le remboursement':'Enregistrer le paiement'}>
    <p className="local-total"><span>Solde de {contact.name}</span><Amount value={balance} currency={currency}/></p>
    <Field label="Montant" name="amount" type="number" min="0.01" max={balance/100} step="0.01" defaultValue={balance/100} required />
    <Field label="Motif du remboursement" name="reason" placeholder="Versement partiel, règlement du solde…" maxLength={300} required /><MethodAndDate/>
  </Form>;
}
export function ExpenseForm({ onSave, date }) {
  const [receipt,setReceipt]=useState(''),[processing,setProcessing]=useState(false),[error,setError]=useState('');
  async function choose(file){setProcessing(true);setError('');try{setReceipt(await readReceipt(file));}catch(e){setError(e.message);}finally{setProcessing(false);}}
  return <Form disabled={processing||Boolean(error)} onSubmit={(values)=>onSave('expense',{...values,receipt})}>
    <Select label="Catégorie de dépense" name="category">{EXPENSES.map(c=><option key={c}>{c}</option>)}</Select><Field label="Montant" name="amount" type="number" min="0.01" step="0.01" required/><Field label="Motif / description" name="reason" maxLength={300} required/><MethodAndDate date={date}/>
    <div className="local-attachment"><Field label="Justificatif depuis la galerie"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>choose(e.target.files?.[0])}/></Field><Field label="Prendre une photo"><input type="file" accept="image/*" capture="environment" onChange={(e)=>choose(e.target.files?.[0])}/></Field>{processing?<p role="status">Préparation de la photo…</p>:null}{error?<p role="alert" className="local-error">{error}</p>:null}{receipt?<><ReceiptImage src={receipt}/><Button tone="ghost" onClick={()=>{setReceipt('');setError('');}}>Retirer la photo</Button></>:null}</div>
    <p className="local-hint">Achat de stock : sortie de caisse, exclue des charges pour éviter de compter deux fois le coût des produits vendus. Pour augmenter aussi les quantités, utilisez Achats fournisseurs.</p>
  </Form>;
}
export function ReceiptImage({src}) { return <img className="local-receipt" src={src} alt="Justificatif de paiement"/>; }
export function ShopForm({data,onSave}) {
  return <Form onSubmit={(values)=>onSave('shop',{...values,name:data.shop.name,currency:data.shop.currency})}><Field label="Caisse initiale en espèces" name="openingCash" type="number" step="0.01" min="0" defaultValue={data.shop.openingCash/100} required/><Field label="Solde initial Mobile Money" name="openingMobile" type="number" step="0.01" min="0" defaultValue={data.shop.openingMobile/100} required/><p className="local-hint">Les soldes initiaux sont ceux du démarrage de votre carnet, pas les soldes actuels.</p></Form>;
}
