create extension if not exists pgcrypto;
create table if not exists profiles(id uuid primary key default gen_random_uuid(),full_name text not null,nickname text not null unique,role text not null check(role in ('owner','admin','clerk')),pin_hash text not null,security_question text not null,answer_hash text not null,failed_attempts int not null default 0,locked_until timestamptz,created_at timestamptz default now());
create table if not exists suppliers(id uuid primary key default gen_random_uuid(),name text unique not null,phone text not null,created_at timestamptz default now());
create table if not exists materials(id uuid primary key default gen_random_uuid(),name text not null,category text not null,variant text not null,unit text not null,current_stock numeric(14,3) not null default 0 check(current_stock>=0),low_stock_level numeric(14,3) not null default 0,unit_price numeric(14,2) not null default 0,supplier_id uuid references suppliers(id),created_at timestamptz default now(),unique(name,variant));
create table if not exists services(id uuid primary key default gen_random_uuid(),name text unique not null,variant text not null,price numeric(14,2) not null check(price>=0),created_at timestamptz default now());
create table if not exists job_orders(id uuid primary key default gen_random_uuid(),customer text not null,contact text,details text,status text not null default 'Pending' check(status in ('Pending','In Progress','Ready for Pickup','Completed')),total numeric(14,2) not null default 0,created_by uuid references profiles(id),created_at timestamptz default now(),completed_at timestamptz);
create table if not exists job_order_items(id uuid primary key default gen_random_uuid(),job_id uuid references job_orders(id),name text not null,description text,price numeric(14,2) not null,created_at timestamptz default now());
create table if not exists job_materials(id uuid primary key default gen_random_uuid(),job_id uuid references job_orders(id),material_id uuid references materials(id),quantity numeric(14,3) not null check(quantity>0),created_at timestamptz default now());
create table if not exists stock_audit(id bigint generated always as identity primary key,material_id uuid references materials(id),actor_id uuid references profiles(id),actor_name text not null,actor_role text not null,kind text not null,delta numeric(14,3) not null,note text,job_id uuid references job_orders(id),created_at timestamptz default now());
create index if not exists idx_audit_date on stock_audit(created_at desc);
create index if not exists idx_jobs_date on job_orders(created_at desc);
create index if not exists idx_material_supplier on materials(supplier_id);
create or replace view profiles_public as select id,full_name,nickname,role,security_question,created_at from profiles;
-- Public anonymous users have no table access; all app data passes through controlled RPCs.
revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
alter table profiles enable row level security;
alter table suppliers enable row level security;
alter table materials enable row level security;
alter table services enable row level security;
alter table job_orders enable row level security;
alter table job_order_items enable row level security;
alter table job_materials enable row level security;
alter table stock_audit enable row level security;
-- Access to these tables is through server-side API with service role; never expose service role to browser.
create or replace function verify_profile_pin(p_user uuid,p_pin text) returns jsonb language plpgsql security definer set search_path=public as $$declare u profiles%rowtype;begin
select * into u from profiles where id=p_user for update;
if not found then return jsonb_build_object('ok',false,'error','Invalid profile');end if;
if u.locked_until>now() then return jsonb_build_object('ok',false,'error','Too many attempts. Try again later.');end if;
if u.pin_hash=crypt(p_pin,u.pin_hash) then update profiles set failed_attempts=0,locked_until=null where id=p_user;return jsonb_build_object('ok',true,'id',u.id,'name',u.nickname,'role',u.role);end if;
update profiles set failed_attempts=case when failed_attempts>=4 then 0 else failed_attempts+1 end,locked_until=case when failed_attempts>=4 then now()+interval '60 seconds' else null end where id=p_user;
return jsonb_build_object('ok',false,'error','Incorrect PIN');end$$;
create or replace function reset_pin_with_answer(p_user uuid,p_answer text,p_new text) returns void language plpgsql security definer set search_path=public as $$declare u profiles%rowtype;begin
if p_new !~ '^[0-9]{4,8}$' then raise exception 'PIN must be 4-8 digits';end if;
select * into u from profiles where id=p_user for update;
if not found or u.locked_until>now() or u.answer_hash<>crypt(lower(trim(p_answer)),u.answer_hash) then raise exception 'Verification failed';end if;
update profiles set pin_hash=crypt(p_new,gen_salt('bf')),failed_attempts=0,locked_until=null where id=p_user;end$$;
create or replace function change_own_pin(p_user uuid,p_old text,p_new text) returns void language plpgsql security definer set search_path=public as $$begin
if p_new !~ '^[0-9]{4,8}$' then raise exception 'PIN must be 4-8 digits';end if;
update profiles set pin_hash=crypt(p_new,gen_salt('bf')) where id=p_user and pin_hash=crypt(p_old,pin_hash);
if not found then raise exception 'Current PIN incorrect';end if;end$$;
create or replace function create_profile(p_actor uuid,p_name text,p_nickname text,p_role text,p_pin text,p_question text,p_answer text) returns uuid language plpgsql security definer set search_path=public as $$declare v_id uuid;begin
if not exists(select 1 from profiles where id=p_actor and role in ('owner','admin')) then raise exception 'Unauthorized';end if;
if p_role not in ('admin','clerk') or p_pin !~ '^[0-9]{4,8}$' then raise exception 'Invalid role or PIN';end if;
insert into profiles(full_name,nickname,role,pin_hash,security_question,answer_hash) values(p_name,p_nickname,p_role,crypt(p_pin,gen_salt('bf')),p_question,crypt(lower(trim(p_answer)),gen_salt('bf'))) returning id into v_id;return v_id;end$$;
create or replace function admin_reset_clerk_pin(p_actor uuid,p_target uuid,p_pin text) returns void language plpgsql security definer set search_path=public as $$begin
if not exists(select 1 from profiles where id=p_actor and role in ('owner','admin')) or p_pin !~ '^[0-9]{4,8}$' then raise exception 'Unauthorized or invalid PIN';end if;
update profiles set pin_hash=crypt(p_pin,gen_salt('bf')),failed_attempts=0,locked_until=null where id=p_target and role='clerk';if not found then raise exception 'Clerk not found';end if;end$$;
create or replace function post_stock(p_actor uuid,p_material uuid,p_quantity numeric,p_kind text,p_note text) returns numeric language plpgsql security definer set search_path=public as $$declare v_old numeric;v_delta numeric;u profiles%rowtype;begin
select * into u from profiles where id=p_actor;if not found then raise exception 'Unauthorized';end if;
if p_quantity<=0 or p_kind not in ('in','out','adjust') then raise exception 'Invalid transaction';end if;
if p_kind='adjust' and u.role='clerk' then raise exception 'Unauthorized';end if;
select current_stock into v_old from materials where id=p_material for update;if not found then raise exception 'Material not found';end if;
v_delta:=case when p_kind='in' then p_quantity else -p_quantity end;
if v_old+v_delta<0 then raise exception 'Insufficient stock';end if;
update materials set current_stock=current_stock+v_delta where id=p_material;
insert into stock_audit(material_id,actor_id,actor_name,actor_role,kind,delta,note) values(p_material,p_actor,u.nickname,u.role,p_kind,v_delta,p_note);
return v_old+v_delta;end$$;
create or replace function create_job(p_actor uuid,p_customer text,p_contact text,p_details text,p_items jsonb,p_materials jsonb) returns uuid language plpgsql security definer set search_path=public as $$declare j uuid;item jsonb;m jsonb;v_id uuid;v_qty numeric;v_stock numeric;v_total numeric:=0;u profiles%rowtype;begin
select * into u from profiles where id=p_actor and role in ('owner','admin');if not found then raise exception 'Unauthorized';end if;
if trim(p_customer)='' then raise exception 'Customer required';end if;
for item in select value from jsonb_array_elements(p_items) loop if (item->>'price')::numeric<0 then raise exception 'Invalid price';end if;v_total:=v_total+(item->>'price')::numeric;end loop;
insert into job_orders(customer,contact,details,total,created_by) values(p_customer,p_contact,p_details,v_total,p_actor) returning id into j;
for item in select value from jsonb_array_elements(p_items) loop insert into job_order_items(job_id,name,description,price) values(j,item->>'name',coalesce(item->>'description',''),(item->>'price')::numeric);end loop;
for m in select value from jsonb_array_elements(p_materials) loop
v_id:=(m->>'id')::uuid;v_qty:=(m->>'quantity')::numeric;
if v_qty<=0 then raise exception 'Invalid quantity';end if;
select current_stock into v_stock from materials where id=v_id for update;
if v_stock is null or v_stock<v_qty then raise exception 'Insufficient material stock';end if;
update materials set current_stock=current_stock-v_qty where id=v_id;
insert into job_materials(job_id,material_id,quantity) values(j,v_id,v_qty);
insert into stock_audit(material_id,actor_id,actor_name,actor_role,kind,delta,note,job_id) values(v_id,p_actor,u.nickname,u.role,'job',-v_qty,'Job order allocation',j);
end loop;return j;end$$;
create or replace function complete_job(p_actor uuid,p_job uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$begin
if not exists(select 1 from profiles where id=p_actor and role in ('owner','admin')) then raise exception 'Unauthorized';end if;
if p_status not in ('Pending','In Progress','Ready for Pickup','Completed') then raise exception 'Invalid status';end if;
update job_orders set status=p_status,completed_at=case when p_status='Completed' then coalesce(completed_at,now()) else null end where id=p_job;if not found then raise exception 'Job not found';end if;end$$;
-- Only the Next.js server with the service-role key may execute the functions.
revoke execute on function verify_profile_pin(uuid,text),reset_pin_with_answer(uuid,text,text),change_own_pin(uuid,text,text),create_profile(uuid,text,text,text,text,text,text),admin_reset_clerk_pin(uuid,uuid,text),post_stock(uuid,uuid,numeric,text,text),create_job(uuid,text,text,text,jsonb,jsonb),complete_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function verify_profile_pin(uuid,text),reset_pin_with_answer(uuid,text,text),change_own_pin(uuid,text,text),create_profile(uuid,text,text,text,text,text,text),admin_reset_clerk_pin(uuid,uuid,text),post_stock(uuid,uuid,numeric,text,text),create_job(uuid,text,text,text,jsonb,jsonb),complete_job(uuid,uuid,text) to service_role;
insert into profiles(full_name,nickname,role,pin_hash,security_question,answer_hash) values
('Roberto Delos Santos','Boss Roberto','owner',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf'))),
('Admin Member 1','Member 1','admin',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf'))),
('Admin Member 2','Member 2','admin',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf'))),
('Admin Member 3','Member 3','admin',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf'))),
('Admin Member 4','Member 4','admin',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf'))),
('Admin Member 5','Member 5','admin',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf'))),
('Professor / Panelist','Member 6 (Panelist)','admin',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf'))),
('Renelou Delos Santos','Renelou','clerk',crypt('1234',gen_salt('bf')),'What is the shop city?',crypt('bulacan',gen_salt('bf')))
on conflict(nickname) do nothing;
insert into suppliers(name,phone) values('KMCB Trading','09424855026'),('Triple J Hardware','09753694918') on conflict(name) do nothing;
with x(name,category,variant,unit,stock,low,price,supplier) as (values
('Leather','Leather','Design 12','Meters',3,5,105,'KMCB Trading'),
('Charol','Charol','Black','Meters',30,10,75,'KMCB Trading'),
('Charol','Charol','White','Meters',9,10,75,'KMCB Trading'),
('Charol','Charol','Blue, Violet, Yellow, Pink, Cream','Meters',3,5,75,'KMCB Trading'),
('Plywood (Flywood)','Plywood','1/4','Pcs',12,5,120,'Triple J Hardware'),
('Stick','Wood/Lumber','1/2 x 6','Pcs',30,10,15,'Triple J Hardware'),
('Good Lumber','Wood/Lumber','1 x 1/2','Pcs',12,5,175,'Triple J Hardware'),
('Foam','Foam','1" and 2"','Pcs',6,5,250,'KMCB Trading'),
('Aluminum Molding','Aluminum','Standard','Pcs',12,5,85,'KMCB Trading'),
('Thread','Hardware/Consumables','Standard','Roll',1,2,50,'KMCB Trading'),
('Tacker','Hardware/Consumables','Heavy Duty','Pcs',2,1,350,'KMCB Trading'),
('Staples','Hardware/Consumables','Standard','Box',5,2,65,'KMCB Trading'))
insert into materials(name,category,variant,unit,current_stock,low_stock_level,unit_price,supplier_id) select x.name,x.category,x.variant,x.unit,x.stock,x.low,x.price,s.id from x join suppliers s on s.name=x.supplier on conflict(name,variant) do nothing;
insert into services(name,variant,price) values
('Tricycle','Standard',2500),('Trike Sidecar Only','Standard',1800),('Driver Shade','Standard',1200),('Cargo Tricycle (Kolong)','Standard',3000),('Tricycle Seat w/ Backrest (Upuan w/ sandalan)','Standard',1200),('Trapal (1 Set)','Complete Set',1200),('Trapal (Side)','Side Only',400),('Trapal (Front)','Front Only',500),('Trapal (Gutter)','Gutter Only',300),('Custom Design Addition','Per Design',300) on conflict(name) do nothing;
