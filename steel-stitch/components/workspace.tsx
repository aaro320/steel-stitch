</div>
<div className="panel">
<h2 className="font-bold text-lg text-amber-700 mb-3">Low Stock Warnings</h2>{table(['Material','Stock','Supplier / Contact'],low.map(m=>[m.name+' — '+m.variant,<span className="pill">{m.current_stock} {m.unit}</span>,suppliers.find(s=>s.id===m.supplier_id)?.name+' / '+(suppliers.find(s=>s.id===m.supplier_id)?.phone||'')]))}
</div>
</>}
{tab==='inventory'&&<div className="panel">
<div className="flex justify-between mb-4">
<h2 className="font-bold">Material Inventory</h2>{admin&&<button className="btn" onClick={()=>{F({});
M('material')}}>+ New Material</button>}
</div>{table(admin?['Material','Category','Variant','Available','Minimum','Unit Price','Supplier']:['Material','Category','Variant','Available','Minimum'],materials.map(m=>[m.name,m.category,m.variant,<span className={Number(m.current_stock)<=Number(m.low_stock_level)?'pill':''}>{m.current_stock} {m.unit}</span>,m.low_stock_level,...(admin?[money(m.unit_price),suppliers.find(s=>s.id===m.supplier_id)?.name]:[])]))}
</div>}
{tab==='stock'&&<div className="grid md:grid-cols-2 gap-5">
<div className="panel">
<h2 className="font-bold text-xl mb-4">Quick Stock-In</h2>
<button className="btn w-full py-5" onClick={()=>{F({kind:'in'});
M('stock')}}>+ Receive Materials</button>
</div>
<div className="panel">
<h2 className="font-bold text-xl mb-4">Quick Stock-Out</h2>
<button className="btn w-full py-5" onClick={()=>{F({kind:'out'});
M('stock')}}>− Record Usage / Wastage</button>
</div>{admin&&<div className="panel">
<h2 className="font-bold mb-4">Stock Adjustment</h2>
<button className="btn" onClick={()=>{F({kind:'adjust'});
M('stock')}}>Create Adjustment</button>
</div>}
</div>}
{tab==='catalog'&&<div className="panel">
<button className="btn mb-4" onClick={()=>{F({});
M('service')}}>+ Add Service</button>{table(['Service','Type','Price'],services.map(s=>[s.name,s.variant,money(s.price)]))}
</div>}
{tab==='suppliers'&&<div className="panel">
<button className="btn mb-4" onClick={()=>{F({});
M('supplier')}}>+ Add Supplier</button>{table(['Supplier','Phone','Linked Materials'],suppliers.map(s=>[s.name,s.phone,materials.filter(m=>m.supplier_id===s.id).map(m=>m.name).join(', ')]))}
</div>}
{tab==='jobs'&&<div className="panel">
<button className="btn mb-4" onClick={()=>{F({});
I([]);
A([]);
M('job')}}>+ Create Job Order</button>{table(['Customer','Status','Total','Created','Action'],jobs.map(j=>[j.customer,<span className="pill">{j.status}</span>,money(j.total),new Date(j.created_at).toLocaleDateString(),<select value={j.status} onChange={e=>send('/api/operations',{action:'complete',id:j.id,status:e.target.value})}>{['Pending','In Progress','Ready for Pickup','Completed'].map(x=>
<option key={x}>{x}</option>)}</select>]))}
</div>}
{tab==='audit'&&<div className="panel">{table(['Date','Material','Action','Change','By','Reason'],audit.map(a=>[new Date(a.created_at).toLocaleString(),materials.find(m=>m.id===a.material_id)?.name,a.kind,a.delta,a.actor_name+' ('+a.actor_role+')',a.note]))}
</div>}
{tab==='reports'&&<div className="panel">
<div className="flex gap-3 mb-5">
<select className="max-w-48" value={period} onChange={e=>Period(e.target.value)}>
<option value="daily">Daily</option>
<option value="weekly">Weekly</option>
<option value="monthly">Monthly</option>
</select>
<button className="btn" onClick={csv}>Export CSV</button>
</div>
<div className="text-2xl font-bold mb-5">Revenue: {money(recent.reduce((a,j)=>a+Number(j.total),0))}
</div>{table(['Customer','Completed','Revenue'],recent.map(j=>[j.customer,new Date(j.completed_at).toLocaleDateString(),money(j.total)]))}<h3 className="font-bold mt-7">Most Used Materials (All Time)</h3>{table(['Material','Used'],materials.map(m=>[m.name,audit.filter(a=>a.material_id===m.id&&a.delta<0).reduce((a,b)=>a-Math.min(0,Number(b.delta)),0)]).sort((a:any,b:any)=>b[1]-a[1]))}
</div>}
{tab==='users'&&<div className="panel">
<button className="btn mb-4" onClick={()=>{F({role:'clerk'});
M('user')}}>+ Create Profile</button>{table(['Name','Nickname','Role','Actions'],users.map(u=>[u.full_name,u.nickname,u.role,<div className="flex items-center gap-4">{u.role==='clerk'&&<button className="text-blue-700" onClick={()=>{E('');
F({id:u.id});
M('reset_clerk')}}>Reset PIN</button>}{user.role==='owner'&&u.role!=='owner'&&<button className="text-red-700 font-semibold" onClick={()=>{E('');
F({id:u.id,nickname:u.nickname,pin:''});
M('remove_user')}}>Remove</button>}{u.role==='owner'&&<span>Protected</span>}
</div>]))}
</div>}
{modal&&<div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
<div className="panel w-full max-w-xl max-h-[90vh] overflow-y-auto">
<div className="flex justify-between mb-5">
<h2 className="font-bold text-xl capitalize">{modal.replaceAll('_',' ')}</h2>
<button onClick={()=>M('')}>✕</button>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
{modal==='material'&&<>{field('Material Name','name')}{field('Category','category','text',['Leather','Charol','Plywood','Wood/Lumber','Foam','Aluminum','Hardware/Consumables'])}{field('Type / Color / Thickness','variant')}{field('Unit','unit','text',['Meters','Pcs','Roll','Box'])}{field('Initial Stock','current_stock','number')}{field('Low Stock Level','low_stock_level','number')}{field('Unit Price PHP','unit_price','number')}{field('Supplier','supplier_id','text',suppliers)}</>}
{modal==='supplier'&&<>{field('Supplier Name','name')}{field('Phone','phone')}</>}
{modal==='service'&&<>{field('Service Name','name')}{field('Type','variant')}{field('Price PHP','price','number')}</>}
{modal==='stock'&&<>{field('Material','material','text',materials.map(m=>({...m,name:m.name+' — '+m.variant+' ('+m.current_stock+' '+m.unit+')'})))}{field('Quantity','quantity','number')}{field('Reason / Notes','note')}</>}
{modal==='user'&&<>{field('Full Name','name')}{field('Nickname','nickname')}{field('Role','role','text',['admin','clerk'])}{field('Initial PIN','pin','password')}{field('Security Question','question')}{field('Security Answer','answer')}</>}
{modal==='pin'&&<>{field('Current PIN','oldPin','password')}{field('New PIN','newPin','password')}</>}
{modal==='reset_clerk'&&field('New Clerk PIN','pin','password')}
 {modal==='remove_user'&&<div className="md:col-span-2">
<p className="mb-3 text-red-700">Deactivate {form.nickname}? This account will lose access. Historical records will be retained.</p>{field('Confirm with your Owner PIN','pin','password')}
</div>}
{modal==='job'&&<div className="md:col-span-2 space-y-3">{field('Customer Name','customer')}{field('Contact / Plate','contact')}{field('Details','details')}<div className="font-semibold">Service / Custom Line Items</div>
<div className="flex gap-2">
<select id="service-pick">
<option value="">Select service</option>{services.map(s=>
<option key={s.id} value={s.id}>{s.name} — {money(s.price)}</option>)}</select>
<button className="btn" onClick={()=>{const id=(document.getElementById('service-pick') as HTMLSelectElement).value;
const s=services.find(x=>x.id===id);
if(s)I([...items,{name:s.name,price:Number(s.price)}])}}>Add</button>
</div>
<div className="flex gap-2">
<input id="custom-name" placeholder="Custom item name"/>
<input id="custom-price" type="number" placeholder="Price"/>
<button className="btn" onClick={()=>{const n=document.getElementById('custom-name') as HTMLInputElement,p=document.getElementById('custom-price') as HTMLInputElement;
if(n.value&&Number(p.value)>=0&&p.value)I([...items,{name:n.value,price:Number(p.value)}]);
n.value='';
p.value=''}}>Add</button>
</div>{items.map((it,i)=>
<p key={i}>{it.name} — {money(it.price)} <button className="text-red-600" onClick={()=>I(items.filter((_,k)=>k!==i))}>Remove</button>
</p>)}<b>Total: {money(items.reduce((a,x)=>a+Number(x.price),0))}</b>
<div className="font-semibold mt-4">Material Allocations</div>
<div className="flex gap-2">
<select id="allocation-material">
<option value="">Select material</option>{materials.map(m=>
<option value={m.id} key={m.id}>{m.name} — {m.variant} ({m.current_stock} available)</option>)}</select>
<input id="allocation-qty" type="number" placeholder="Qty"/>
<button className="btn" onClick={()=>{const id=(document.getElementById('allocation-material') as HTMLSelectElement).value,q=Number((document.getElementById('allocation-qty') as HTMLInputElement).value);
if(id&&q>0)A([...alloc,{id,quantity:q}])}}>Add</button>
</div>{alloc.map((x,i)=>
<p key={i}>{materials.find(m=>m.id===x.id)?.name} × {x.quantity} <button className="text-red-600" onClick={()=>A(alloc.filter((_,k)=>k!==i))}>Remove</button>
</p>)}<button className="text-blue-700" onClick={()=>{M('material');
E('Create the material, then return to the job form.')}}>+ New Material</button>
</div>}
</div>{error&&<p className="text-red-600 text-sm mt-4">{error}</p>}<div className="flex justify-end gap-3 mt-6">
<button onClick={()=>M('')} className="px-4">Cancel</button>
<button disabled={busy} className="btn" onClick={()=>{if(modal==='stock')send('/api/operations',{action:form.kind==='adjust'?'adjust':'stock',...form});
else if(modal==='job')send('/api/operations',{action:'job',...form,items,materials:alloc});
else if(modal==='user'||modal==='reset_clerk')send('/api/operations',{action:modal,...form});
else if(modal==='remove_user')send('/api/operations',{action:'remove_user',id:form.id,pin:form.pin});
else if(modal==='pin')send('/api/auth',{action:'change',...form});
else send('/api/data',{table:modal==='material'?'materials':modal==='supplier'?'suppliers':'services',values:form})}}>{busy?'Saving...':'Save / Confirm'}</button>
</div>
</div>
</div>}
</main>
</div>}
