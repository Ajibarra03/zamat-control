// ZAMAT Control · V0.1.0 · Primera publicación oficial
const SUPABASE_URL = 'https://almvdzcvbzqwxdwajsuw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jc6SKlp_L4tOAxCcY6EA6w_8jEa_61f';
const LOGIN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/login-username`;
const USER_ADMIN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/user-admin`;
const PASSWORD_RECOVERY_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/password-recovery`;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
let currentAuthProfile = null;

const SESSION_KEY = 'zamat_auth_session';
const today = () => new Date().toISOString().slice(0,10);
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2));

const DEFAULT_INVENTORY_CATEGORIES = [
  'Pulseras',
  'Collares',
  'Anillos',
  'Aretes / Pendientes',
  'Dijes',
  'Tobilleras',
  'Cadenas',
  'Sets / Juegos',
  'Accesorios',
  'Empaques'
];

const DEFAULT_MATERIAL_CATEGORIES = [
  'Perlas / Piedras',
  'Cuentas / Mostacillas',
  'Cadenas',
  'Broches / Cierres',
  'Dijes / Charms',
  'Hilos / Cordones',
  'Alambres',
  'Argollas / Conectores',
  'Resinas / Pegamentos',
  'Empaques / Presentación',
  'Otros materiales'
];

const DEFAULT_PRODUCT_CATEGORIES = [
  'Pulseras',
  'Collares',
  'Anillos',
  'Aretes / Pendientes',
  'Dijes',
  'Tobilleras',
  'Cadenas',
  'Sets / Juegos',
  'Accesorios',
  'Personalizado'
];


const DEFAULT_MOVEMENT_CATEGORIES = {
  ingreso:[
    'Venta de productos',
    'Abono de pedido',
    'Pago de pedido',
    'Ingreso por envío',
    'Devolución de proveedor',
    'Otros ingresos'
  ],
  egreso:[
    'Compra de inventario',
    'Pago a proveedores',
    'Empaques',
    'Envíos / Transporte',
    'Publicidad / Marketing',
    'Comisiones',
    'Herramientas / Materiales',
    'Servicios',
    'Gastos administrativos',
    'Impuestos / Tasas',
    'Otros gastos'
  ]
};

const defaultState = {
  settings:{businessName:'ZAMAT',currency:'COP',defaultMarkup:60,lowStock:3},
  inventoryCategories:[...DEFAULT_INVENTORY_CATEGORIES],
  materialCategories:[...DEFAULT_MATERIAL_CATEGORIES],
  productCategories:[...DEFAULT_PRODUCT_CATEGORIES],
  movementCategories:{ingreso:[],egreso:[]},
  inventory:[], materials:[], inventoryAdjustments:[], movements:[], contacts:[], products:[], orders:[], orderSequence:0, accounts:[], users:[]
};

let state = structuredClone(defaultState);

const ROLE_VIEWS = {
  Usuario:['inicio','contactos','productos','pedidos'],
  Administrador:['inicio','resumen','inventario','contabilidad','contactos','productos','pedidos','configuracion'],
  Superadministrador:['inicio','resumen','inventario','contabilidad','contactos','productos','pedidos','configuracion']
};
function normalizeRole(role){
  const value=String(role||'').trim().toLocaleLowerCase('es');
  if(value.includes('super')) return 'Superadministrador';
  if(value.includes('admin')) return 'Administrador';
  return 'Usuario';
}
function isSuperAdmin(user){return normalizeRole(user?.role)==='Superadministrador'}
function isAdministrator(user){return normalizeRole(user?.role)==='Administrador'}
function canCreateUsers(user){return isSuperAdmin(user)||isAdministrator(user)}
function roleCanAccessView(user,view){return (ROLE_VIEWS[normalizeRole(user?.role)]||ROLE_VIEWS.Usuario).includes(view)}
function migrateUserRoles(){
  state.users=Array.isArray(state.users)?state.users:[];
  let changed=false;
  state.users.forEach(u=>{
    const normalized=normalizeRole(u.role);
    if(u.role!==normalized){u.role=normalized;changed=true}
    if(!String(u.fullName||'').trim()){u.fullName=String(u.username||'Usuario').trim()||'Usuario';changed=true}
  });
  if(state.users.length&&!state.users.some(isSuperAdmin)){
    const candidate=[...state.users].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))).find(u=>isAdministrator(u))||state.users[0];
    candidate.role='Superadministrador';changed=true;
  }
  const supers=state.users.filter(isSuperAdmin).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  if(supers.length){
    const primary=supers.find(u=>u.isPrimarySuperAdmin)||supers[0];
    state.users.forEach(u=>{
      const shouldBe=String(u.id)===String(primary.id);
      if(Boolean(u.isPrimarySuperAdmin)!==shouldBe){u.isPrimarySuperAdmin=shouldBe;changed=true}
    });
    if(primary.username!=='Tripers' && !state.users.some(u=>String(u.id)!==String(primary.id)&&normalizeUsername(u.username)==='tripers')){
      primary.username='Tripers';changed=true;
    }
  }
  // Los demás usuarios adoptan el formato automático cuando el nombre contiene nombre y apellido.
  const used=new Set();
  const ordered=[...state.users].sort((a,b)=>Number(isPrimarySuperAdmin(b))-Number(isPrimarySuperAdmin(a)));
  ordered.forEach(u=>{
    const desired=isPrimarySuperAdmin(u)?'Tripers':generateUsernameFromFullName(u.fullName);
    const key=normalizeUsername(desired);
    if(desired && (!used.has(key))){
      if(u.username!==desired){u.username=desired;changed=true}
      used.add(key);
    }else{
      used.add(normalizeUsername(u.username));
    }
  });
  // Los perfiles reales provienen de Supabase; no se persisten copias locales.
}
migrateUserRoles();

function save(){ renderAll(); }

function normalizeUsername(value){return String(value||'').trim().toLocaleLowerCase('es')}
function cleanUsernamePart(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/[^a-z0-9]/g,'');
}
function generateUsernameFromFullName(fullName){
  const parts=String(fullName||'').trim().split(/\s+/).filter(Boolean);
  if(parts.length<2) return '';
  const firstName=cleanUsernamePart(parts[0]);
  const surname=cleanUsernamePart(parts[parts.length-1]);
  if(!firstName||surname.length<2) return '';
  return `${surname.slice(0,2)}.${firstName}`;
}
function isPrimarySuperAdmin(user){return Boolean(user?.isPrimarySuperAdmin)}
function usernameForUserName(fullName,user=null){return isPrimarySuperAdmin(user)?'Tripers':generateUsernameFromFullName(fullName)}
function normalizeEmail(value){return String(value||'').trim().toLocaleLowerCase('es')}
function formatLoginDate(value){
  if(!value) return 'Nunca';
  try{return new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return 'Nunca'}
}
function bytesToHex(buffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function hashPassword(password,salt){
  const enc=new TextEncoder();
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:120000,hash:'SHA-256'},material,256);
  return bytesToHex(bits);
}
async function createPasswordRecord(password){const salt=uid()+uid();return {passwordSalt:salt,passwordHash:await hashPassword(password,salt)}}
async function verifyPassword(user,password){if(!user?.passwordSalt||!user?.passwordHash)return false;return (await hashPassword(password,user.passwordSalt))===user.passwordHash}
function getCurrentUser(){
  if(currentAuthProfile) return currentAuthProfile;
  const id=sessionStorage.getItem(SESSION_KEY);
  return (state.users||[]).find(u=>String(u.id)===String(id))||null;
}
function mapProfile(profile){
  if(!profile) return null;
  return {
    id:profile.id,
    fullName:profile.full_name||profile.username||'Usuario',
    username:profile.username,
    email:profile.recovery_email||'',
    role:normalizeRole(profile.role),
    active:profile.is_active!==false,
    isPrimarySuperAdmin:Boolean(profile.is_primary_superadmin),
    lastLogin:profile.last_login_at||null,
    createdAt:profile.created_at||null
  };
}

let remoteBusinessDataLoaded=false;
let remoteInventoryCategoryRows=[];
let remoteProductCategoryRows=[];
let remotePaymentMethodRows=[];

// Sincronización automática y en tiempo real con Supabase Realtime.
let realtimeChannel=null;
let realtimeRefreshTimer=null;
let realtimeStartedForUserId=null;

function scheduleRealtimeRefresh(source='datos'){
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer=setTimeout(async()=>{
    if(!getCurrentUser()) return;
    try{
      await refreshRemoteBusinessData();
      // Los perfiles también pueden cambiar (estado/rol/último ingreso).
      if(source==='profiles'){
        await loadVisibleProfiles();
        refreshSessionUi();
        applyRolePermissions();
        renderSettings();
      }
    }catch(error){
      console.warn('No fue posible refrescar la sincronización en tiempo real:',error);
    }
  },120);
}

async function stopRealtimeSync(){
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer=null;
  if(realtimeChannel){
    try{await supabaseClient.removeChannel(realtimeChannel)}catch(error){console.warn('No fue posible cerrar el canal Realtime:',error)}
  }
  realtimeChannel=null;
  realtimeStartedForUserId=null;
}

async function startRealtimeSync(){
  const user=getCurrentUser();
  if(!user?.id) return;
  if(realtimeChannel&&realtimeStartedForUserId===String(user.id)) return;
  await stopRealtimeSync();

  const channel=supabaseClient.channel(`zamat-live-${user.id}`);
  const watch=(table,source='datos')=>channel.on(
    'postgres_changes',
    {event:'*',schema:'public',table},
    ()=>scheduleRealtimeRefresh(source)
  );

  // Contactos son visibles para los roles que utilizan Clientes/Proveedores.
  watch('contacts');

  // Inventario solo se carga para Administrador/Superadministrador, pero el
  // canal puede registrarse igualmente: RLS decide qué cambios puede recibir.
  watch('inventory_categories');
  watch('inventory_articles');
  watch('materials');
  watch('inventory_adjustments');

  // Dejamos preparados los módulos que migraremos a continuación.
  watch('product_categories');
  watch('products');
  watch('product_materials');
  watch('orders');
  watch('order_items');
  watch('finance_categories');
  watch('finance_movements');
  watch('finance_accounts');
  watch('payment_methods');
  watch('profiles','profiles');

  realtimeChannel=channel;
  realtimeStartedForUserId=String(user.id);
  channel.subscribe((status)=>{
    if(status==='SUBSCRIBED') console.info('ZAMAT Realtime conectado.');
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT') console.warn('ZAMAT Realtime:',status);
  });
}

function currentAuthUserId(){return currentAuthProfile?.id||null}
function dbUnitToUi(unit){return unit==='centimetro'?'centímetro':unit}
function uiUnitToDb(unit){return unit==='centímetro'?'centimetro':unit}
function remoteErrorMessage(error,fallback='No fue posible guardar los cambios en Supabase.'){
  console.error('Supabase:',error);
  return error?.message||fallback;
}
function categoryRow(kind,name){
  const key=String(name||'').trim().toLocaleLowerCase('es');
  return remoteInventoryCategoryRows.find(r=>r.kind===kind&&String(r.name||'').trim().toLocaleLowerCase('es')===key)||null;
}
async function ensureInventoryCategory(kind,name){
  const clean=String(name||'').trim();
  if(!clean) return null;
  const existing=categoryRow(kind,clean);
  if(existing) return existing;
  const {data,error}=await supabaseClient.from('inventory_categories').insert({kind,name:clean,is_default:false,created_by:currentAuthUserId()}).select('id,kind,name,is_default').single();
  if(error) throw error;
  remoteInventoryCategoryRows.push(data);
  return data;
}
function supplierContactById(id){return (state.contacts||[]).find(c=>String(c.id)===String(id))||null}
function mapRemoteContact(row){return {id:row.id,name:row.name,type:row.type,phone:row.phone||'',email:row.email||'',address:row.address||'',notes:row.notes||''}}
function mapRemoteArticle(row,categoryMap,contactMap){
  const supplier=contactMap.get(row.supplier_id);
  return {id:row.id,name:row.name,category:categoryMap.get(row.category_id)||'Sin categoría',categoryId:row.category_id||'',stock:Number(row.stock)||0,minStock:Number(row.min_stock)||0,unitCost:Number(row.unit_cost)||0,supplier:supplier?.name||'',supplierId:row.supplier_id||''};
}
function mapRemoteMaterial(row,categoryMap,contactMap){
  const supplier=contactMap.get(row.supplier_id);
  return {id:row.id,name:row.name,category:categoryMap.get(row.category_id)||'Sin categoría',categoryId:row.category_id||'',unit:dbUnitToUi(row.unit),quantity:Number(row.quantity)||0,minQuantity:Number(row.min_quantity)||0,unitCost:Number(row.cost_per_unit)||0,supplier:supplier?.name||'',supplierId:row.supplier_id||''};
}
function mapRemoteCatalogMaterial(row){
  return {id:row.id,name:row.name||'Material',category:'',unit:dbUnitToUi(row.unit||'unidad'),quantity:Number(row.quantity)||0,minQuantity:0,unitCost:Number(row.cost_per_unit)||0,supplier:'',supplierId:''};
}
function mapRemoteProduct(row,categoryMap,linksByProduct,materialMap){
  const materials=(linksByProduct.get(row.id)||[]).map(link=>{
    const m=materialMap.get(link.material_id)||{};
    return {materialId:link.material_id,name:m.name||'Material',quantity:Number(link.quantity_per_product)||0,unit:m.unit||'unidad',unitCost:Number(m.unitCost)||0};
  });
  return {id:row.id,name:row.name,category:categoryMap.get(row.category_id)||'Sin categoría',categoryId:row.category_id||'',purchaseCost:Number(row.purchase_cost)||0,extraCost:Number(row.extra_cost)||0,markup:Number(row.markup_percent)||0,sku:row.sku||'',materials,suggestedPrice:Number(row.suggested_price)||0,isCustom:Boolean(row.is_custom)};
}
function mapRemoteOrder(row,contactMap,paymentMap,itemsByOrder){
  const items=(itemsByOrder.get(row.id)||[]).map(i=>({
    id:i.id,productId:i.product_id||'',inventoryArticleId:i.inventory_article_id||'',name:i.product_name_snapshot||'Producto',sku:i.sku_snapshot||'',unitPrice:Number(i.unit_price)||0,quantity:Number(i.quantity)||0,subtotal:Number(i.line_total)||0,
    materials:(Array.isArray(i.materials_snapshot)?i.materials_snapshot:[]).map(m=>({materialId:m.material_id||'',name:m.name||'Material',quantity:Number(m.quantity_per_product)||0,unit:dbUnitToUi(m.unit||'unidad'),unitCost:Number(m.cost_per_unit)||0}))
  }));
  const customer=contactMap.get(row.client_id);
  const paid=Number(row.paid_amount)||0, total=Number(row.total_amount)||0, refund=Number(row.refunded_amount)||0;
  return {id:row.id,code:row.order_number,customerId:row.client_id,customer:customer?.name||'Cliente',date:row.order_date||String(row.created_at||'').slice(0,10),total,status:row.status,payment:row.payment_status,paidAmount:paid,paymentMethod:paymentMap.get(row.payment_method_id)||'Por definir',items,refundAmount:refund,refundType:refund>0&&refund<paid?'parcial':'completa',stockAllocated:Boolean(row.inventory_committed_at)&&!row.inventory_restocked_at,paymentChangedDate:String(row.updated_at||row.created_at||'').slice(0,10),statusChangedDate:String(row.updated_at||row.created_at||'').slice(0,10),refundChangedDate:String(row.updated_at||row.created_at||'').slice(0,10)};
}
function mapRemoteFinanceMovement(row,categoryMap,paymentMap){
  const source=row.source||'manual';
  return {id:row.id,type:row.movement_type,date:row.movement_date,category:categoryMap.get(row.category_id)||'General',description:row.description||'',paymentMethod:paymentMap.get(row.payment_method_id)||'Otro',amount:Number(row.amount)||0,source,generated:source!=='manual',orderId:row.order_id||''};
}
function mapRemoteFinanceAccount(row){
  return {id:row.id,kind:row.kind,party:row.party||'',amount:Number(row.amount)||0,concept:row.concept||'',dueDate:row.due_date||'',status:row.status||'pendiente'};
}
async function loadSupabaseBusinessData(){
  const user=getCurrentUser();
  if(!user) return;
  const adminAccess=isAdministrator(user)||isSuperAdmin(user);
  const contactsReq=supabaseClient.from('contacts').select('id,name,type,phone,email,address,notes,created_at,updated_at').order('name');
  const categoriesReq=adminAccess?supabaseClient.from('inventory_categories').select('id,kind,name,is_default').order('name'):Promise.resolve({data:[],error:null});
  const articlesReq=adminAccess?supabaseClient.from('inventory_articles').select('id,name,category_id,stock,min_stock,unit_cost,supplier_id,created_at,updated_at').order('name'):Promise.resolve({data:[],error:null});
  const materialsReq=adminAccess?supabaseClient.from('materials').select('id,name,category_id,unit,quantity,min_quantity,cost_per_unit,supplier_id,created_at,updated_at').order('name'):supabaseClient.rpc('zamat_catalog_material_options');
  const productCategoriesReq=supabaseClient.from('product_categories').select('id,name,is_default').order('name');
  const productsReq=supabaseClient.from('products').select('id,sku,name,category_id,is_custom,purchase_cost,extra_cost,material_cost,markup_percent,suggested_price,is_active,created_at,updated_at').eq('is_active',true).order('name');
  const productMaterialsReq=supabaseClient.from('product_materials').select('product_id,material_id,quantity_per_product');
  const paymentMethodsReq=supabaseClient.from('payment_methods').select('id,name,is_active,sort_order').eq('is_active',true).order('sort_order');
  const ordersReq=supabaseClient.from('orders').select('id,order_number,client_id,order_date,status,payment_status,payment_method_id,paid_amount,total_amount,refunded_amount,inventory_committed_at,inventory_restocked_at,created_at,updated_at').order('created_at',{ascending:false});
  const orderItemsReq=supabaseClient.from('order_items').select('id,order_id,product_id,inventory_article_id,product_name_snapshot,sku_snapshot,unit_price,quantity,line_total,materials_snapshot,created_at').order('created_at');
  const financeCategoriesReq=adminAccess?supabaseClient.from('finance_categories').select('id,movement_type,name,is_default').order('name'):Promise.resolve({data:[],error:null});
  const financeMovementsReq=adminAccess?supabaseClient.from('finance_movements').select('id,movement_date,movement_type,category_id,description,payment_method_id,amount,source,source_key,order_id,created_at').order('movement_date',{ascending:false}).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null});
  const financeAccountsReq=adminAccess?supabaseClient.from('finance_accounts').select('id,kind,party,amount,concept,due_date,status,created_at,updated_at').order('created_at',{ascending:false}):Promise.resolve({data:[],error:null});
  const [contactsRes,categoriesRes,articlesRes,materialsRes,productCategoriesRes,productsRes,productMaterialsRes,paymentMethodsRes,ordersRes,orderItemsRes,financeCategoriesRes,financeMovementsRes,financeAccountsRes]=await Promise.all([contactsReq,categoriesReq,articlesReq,materialsReq,productCategoriesReq,productsReq,productMaterialsReq,paymentMethodsReq,ordersReq,orderItemsReq,financeCategoriesReq,financeMovementsReq,financeAccountsReq]);
  for(const result of [contactsRes,productCategoriesRes,productsRes,productMaterialsRes,paymentMethodsRes,ordersRes,orderItemsRes]) if(result.error) throw result.error;
  if(adminAccess){for(const result of [financeCategoriesRes,financeMovementsRes,financeAccountsRes]) if(result.error) throw result.error;}
  state.contacts=(contactsRes.data||[]).map(mapRemoteContact);
  const contactMap=new Map(state.contacts.map(c=>[c.id,c]));
  if(adminAccess){
    if(categoriesRes.error) throw categoriesRes.error;
    if(articlesRes.error) throw articlesRes.error;
    if(materialsRes.error) throw materialsRes.error;
    remoteInventoryCategoryRows=categoriesRes.data||[];
    const categoryMap=new Map(remoteInventoryCategoryRows.map(r=>[r.id,r.name]));
    state.inventory=(articlesRes.data||[]).map(r=>mapRemoteArticle(r,categoryMap,contactMap));
    state.materials=(materialsRes.data||[]).map(r=>mapRemoteMaterial(r,categoryMap,contactMap));
    state.inventoryCategories=remoteInventoryCategoryRows.filter(r=>r.kind==='articulo').map(r=>r.name);
    state.materialCategories=remoteInventoryCategoryRows.filter(r=>r.kind==='material').map(r=>r.name);
  }else{
    state.inventory=[];state.inventoryCategories=[];state.materialCategories=[];
    if(materialsRes.error) throw materialsRes.error;
    state.materials=(materialsRes.data||[]).map(mapRemoteCatalogMaterial);
  }
  remoteProductCategoryRows=productCategoriesRes.data||[];
  state.productCategories=remoteProductCategoryRows.map(r=>r.name);
  remotePaymentMethodRows=paymentMethodsRes.data||[];
  const paymentMap=new Map(remotePaymentMethodRows.map(r=>[r.id,r.name]));
  const materialMap=new Map((state.materials||[]).map(m=>[m.id,m]));
  const linksByProduct=new Map();
  (productMaterialsRes.data||[]).forEach(link=>{if(!linksByProduct.has(link.product_id))linksByProduct.set(link.product_id,[]);linksByProduct.get(link.product_id).push(link)});
  const productCategoryMap=new Map(remoteProductCategoryRows.map(r=>[r.id,r.name]));
  state.products=(productsRes.data||[]).map(r=>mapRemoteProduct(r,productCategoryMap,linksByProduct,materialMap));
  const itemsByOrder=new Map();
  (orderItemsRes.data||[]).forEach(item=>{if(!itemsByOrder.has(item.order_id))itemsByOrder.set(item.order_id,[]);itemsByOrder.get(item.order_id).push(item)});
  state.orders=(ordersRes.data||[]).map(r=>mapRemoteOrder(r,contactMap,paymentMap,itemsByOrder));
  if(adminAccess){
    const financeCategoryRows=financeCategoriesRes.data||[];
    const financeCategoryMap=new Map(financeCategoryRows.map(r=>[r.id,r.name]));
    state.movementCategories={
      ingreso:financeCategoryRows.filter(r=>r.movement_type==='ingreso').map(r=>r.name),
      egreso:financeCategoryRows.filter(r=>r.movement_type==='egreso').map(r=>r.name)
    };
    state.movements=(financeMovementsRes.data||[]).map(r=>mapRemoteFinanceMovement(r,financeCategoryMap,paymentMap));
    state.accounts=(financeAccountsRes.data||[]).map(mapRemoteFinanceAccount);
  }else{
    state.movementCategories={ingreso:[],egreso:[]};state.movements=[];state.accounts=[];
  }
  remoteBusinessDataLoaded=true;
}

async function refreshRemoteBusinessData(){
  await loadSupabaseBusinessData();
  renderAll();
}

async function loadVisibleProfiles(){
  const {data,error}=await supabaseClient.from('profiles').select('id,full_name,username,recovery_email,role,is_active,is_primary_superadmin,last_login_at,created_at').order('full_name');
  if(error){console.warn('No fue posible cargar los perfiles visibles:',error.message);return []}
  state.users=(data||[]).map(mapProfile);
  if(currentAuthProfile){
    const fresh=state.users.find(u=>String(u.id)===String(currentAuthProfile.id));
    if(fresh) currentAuthProfile=fresh;
  }
  return state.users;
}
async function loadCurrentProfile(){
  const {data:{user},error:userError}=await supabaseClient.auth.getUser();
  if(userError||!user) return null;
  const {data,error}=await supabaseClient.from('profiles').select('id,full_name,username,recovery_email,role,is_active,is_primary_superadmin,last_login_at,created_at').eq('id',user.id).single();
  if(error||!data) return null;
  currentAuthProfile=mapProfile(data);
  sessionStorage.setItem(SESSION_KEY,currentAuthProfile.id);
  await loadVisibleProfiles();
  try{await loadSupabaseBusinessData()}catch(error){console.error('No fue posible cargar datos del negocio desde Supabase:',error)}
  return currentAuthProfile;
}
function setAuthError(id,message=''){
  const el=document.getElementById(id);if(!el)return;
  el.textContent=message;el.classList.toggle('is-hidden',!message);
}
async function invokeUserAdmin(payload){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session?.access_token) throw new Error('La sesión expiró. Iniciá sesión nuevamente.');
  const response=await fetch(USER_ADMIN_FUNCTION_URL,{method:'POST',mode:'cors',cache:'no-store',headers:{'apikey':SUPABASE_PUBLISHABLE_KEY,'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error||`Error HTTP ${response.status}`);
  return data;
}
async function requestPasswordRecovery(username,email){
  const redirectTo=`${location.origin}${location.pathname}`;
  const response=await fetch(PASSWORD_RECOVERY_FUNCTION_URL,{method:'POST',mode:'cors',cache:'no-store',headers:{'apikey':SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({username,email,redirectTo})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error||`Error HTTP ${response.status}`);
  return data;
}
function refreshSessionUi(){
  const user=getCurrentUser();
  document.getElementById('sidebarUserName').textContent=user?.fullName||user?.username||'—';
  const sidebarUsername=document.getElementById('sidebarUsername');
  if(sidebarUsername) sidebarUsername.textContent=user?.username?`@${user.username}`:'—';
  document.getElementById('sidebarUserEmail').textContent=user?.email||'—';
}
function applyRolePermissions(){
  const user=getCurrentUser();
  document.querySelectorAll('#mainNav [data-view]').forEach(button=>{button.hidden=!roleCanAccessView(user,button.dataset.view)});
  const activeView=document.querySelector('.view.active')?.id?.replace('view-','')||'inicio';
  if(!roleCanAccessView(user,activeView)) go('inicio');
}
function showLoginScreen(){
  stopRealtimeSync().catch(()=>{});
  document.getElementById('appShell').hidden=true;
  document.getElementById('authScreen').hidden=false;
  document.getElementById('authSetupPanel').hidden=true;
  document.getElementById('authLoginPanel').hidden=false;
  document.getElementById('loginForm')?.reset();
  setAuthError('loginError','');setAuthError('setupAdminError','');
}
function unlockApp(){
  const user=getCurrentUser();
  if(!user||user.active===false){sessionStorage.removeItem(SESSION_KEY);showLoginScreen();return}
  document.getElementById('authScreen').hidden=true;
  document.getElementById('appShell').hidden=false;
  refreshSessionUi();renderSettings();applyRolePermissions();
  startRealtimeSync().catch(error=>console.warn('No fue posible iniciar Realtime:',error));
}
async function loginUser(username,password){
  if(location.protocol==='file:'){
    return {ok:false,message:'Abrí ZAMAT usando INICIAR_ZAMAT.bat en lugar de abrir index.html directamente.'};
  }

  // IMPORTANTE con las nuevas sb_publishable_* de Supabase:
  // no usamos functions.invoke antes del login porque el cliente puede enviar
  // la publishable key también como Authorization: Bearer. Esa clave NO es JWT
  // y el gateway puede rechazarla. Enviamos únicamente apikey por fetch.
  let payload={};
  let response;
  try{
    response=await fetch(LOGIN_FUNCTION_URL,{
      method:'POST',
      mode:'cors',
      cache:'no-store',
      headers:{
        'apikey':SUPABASE_PUBLISHABLE_KEY,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({username,password})
    });

    const contentType=response.headers.get('content-type')||'';
    if(contentType.includes('application/json')){
      payload=await response.json();
    }else{
      const text=await response.text();
      payload={error:text||`Respuesta HTTP ${response.status}`};
    }
  }catch(error){
    console.error('Error de red/CORS al invocar login-username:',error);
    return {ok:false,message:`No fue posible comunicarse con Supabase (${error?.message||'error de red/CORS'}).`};
  }

  if(!response.ok){
    console.error('login-username HTTP error:',response.status,payload);
    return {ok:false,message:payload?.error||payload?.message||`Inicio de sesión rechazado (HTTP ${response.status}).`};
  }

  if(!payload.access_token||!payload.refresh_token){
    return {ok:false,message:'La sesión recibida desde Supabase no es válida.'};
  }

  try{
    const {error}=await supabaseClient.auth.setSession({
      access_token:payload.access_token,
      refresh_token:payload.refresh_token
    });
    if(error){
      console.error('setSession error:',error);
      return {ok:false,message:'Supabase autenticó la cuenta, pero no fue posible guardar la sesión en este navegador.'};
    }
  }catch(error){
    console.error('setSession exception:',error);
    return {ok:false,message:`No fue posible establecer la sesión (${error?.message||'error desconocido'}).`};
  }

  const profile=await loadCurrentProfile();
  if(!profile||profile.active===false){
    await supabaseClient.auth.signOut();
    return {ok:false,message:'La autenticación fue correcta, pero no se pudo leer el perfil de ZAMAT. Revisaremos las políticas RLS de profiles.'};
  }

  try{
    renderAll();
    unlockApp();
  }catch(error){
    console.error('Error cargando interfaz después del login:',error);
    return {ok:false,message:`La sesión inició, pero ocurrió un error al cargar la interfaz (${error?.message||'error de interfaz'}).`};
  }
  return {ok:true};
}
async function initAuth(){
  state.users=[];
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(session){
    const profile=await loadCurrentProfile();
    if(profile&&profile.active!==false){renderAll();unlockApp();return}
    await supabaseClient.auth.signOut();
  }
  currentAuthProfile=null;
  sessionStorage.removeItem(SESSION_KEY);
  showLoginScreen();
}
function money(value){
  const c=state.settings.currency||'COP';
  const locale=c==='COP'?'es-CO':'es-419';
  try{return new Intl.NumberFormat(locale,{style:'currency',currency:c,maximumFractionDigits:c==='COP'?0:2}).format(Number(value)||0)}catch{return `${c} ${(Number(value)||0).toFixed(2)}`}
}
function esc(v=''){return String(v).replace(/[&<>'"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s]))}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function monthMatch(date){const now=new Date(),d=new Date(`${date}T12:00:00`);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}
function empty(text){return `<div class="empty">${esc(text)}</div>`}


const motivationOpeners = [
  'Confía en tu proceso.',
  'Avanza con intención.',
  'Tu constancia está construyendo algo valioso.',
  'Recuerda por qué empezaste.',
  'Cada día cuenta.',
  'Lo que haces con dedicación deja huella.',
  'Tu visión merece paciencia y trabajo.',
  'El progreso también vive en los pequeños pasos.',
  'Sigue creando con propósito.',
  'Hoy tienes una nueva oportunidad.'
];
const motivationClosers = [
  'Una decisión bien tomada hoy puede acercarte mucho más de lo que imaginas.',
  'Lo pequeño, repetido con disciplina, termina convirtiéndose en algo grande.',
  'Tu mejor inversión sigue siendo aprender, mejorar y volver a intentarlo.',
  'No necesitas hacerlo todo hoy; necesitas seguir avanzando.',
  'Cada detalle cuidado fortalece el valor de lo que estás construyendo.',
  'La paciencia también forma parte de los grandes resultados.',
  'Haz espacio para celebrar lo que ya has logrado mientras trabajas por lo que sigue.',
  'Una buena idea crece cuando la acompañas con acción constante.',
  'Tu esfuerzo de hoy puede convertirse en la tranquilidad de mañana.',
  'A veces el siguiente gran paso empieza con una tarea sencilla bien hecha.',
  'No compares tu capítulo actual con el resultado final de otra persona.',
  'La claridad llega más rápido cuando conviertes la duda en una acción concreta.',
  'Cada cliente satisfecho comienza con atención genuina a los detalles.',
  'El crecimiento sostenible se construye con decisiones conscientes, no con prisa.',
  'Tu creatividad tiene más fuerza cuando la apoyas con organización.',
  'Un tropiezo no borra todo el camino que ya recorriste.',
  'Sigue mejorando un uno por ciento; el tiempo se encargará de multiplicarlo.',
  'La confianza se fortalece cada vez que cumples una promesa que te hiciste.',
  'Tu marca también crece cuando tú creces con ella.',
  'No subestimes el poder de terminar aquello que empezaste.',
  'Las metas grandes se vuelven alcanzables cuando les das pasos pequeños y fechas reales.',
  'Haz hoy algo que tu versión de mañana pueda agradecerte.',
  'El valor de tu trabajo no depende de que todos lo entiendan de inmediato.',
  'La disciplina mantiene en movimiento lo que la motivación inició.',
  'Cada mejora que haces en tu negocio es una señal de que estás avanzando.',
  'No esperes el momento perfecto: mejora el momento que tienes.',
  'Tu manera de resolver problemas también es parte de tu talento.',
  'Aprender de un error lo convierte en experiencia, no en derrota.',
  'Cuando tengas dudas, vuelve a lo esencial y da el siguiente paso posible.',
  'Lo que hoy parece lento puede estar construyendo una base mucho más firme.',
  'Dedicar tiempo a organizar también es una forma de crecer.',
  'Tu esfuerzo merece dirección: prioriza lo que realmente mueve tu negocio.',
  'Cada venta es importante, pero también lo es construir relaciones que quieran volver.',
  'La calidad se nota cuando haces bien incluso aquello que nadie ve.',
  'Permítete ajustar el plan sin abandonar la meta.',
  'Hay días para avanzar rápido y días para avanzar con calma; ambos cuentan.',
  'Sigue apostando por aquello que haces con amor, criterio y responsabilidad.'
];

function getDailyMotivation(){
  const now=new Date();
  const localDayNumber=Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/86400000);
  const index=((localDayNumber%365)+365)%365;
  const closerCount=motivationClosers.length;
  const openerIndex=Math.floor(index/closerCount);
  const closerIndex=index%closerCount;
  return `${motivationOpeners[openerIndex]} ${motivationClosers[closerIndex]}`;
}

function showDailyMotivation(){
  const modal=document.getElementById('motivationModal');
  document.getElementById('motivationText').textContent=getDailyMotivation();
  document.getElementById('motivationDate').textContent=new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
  if(typeof modal.showModal==='function') modal.showModal();
}

function renderHome(){
  const message=document.getElementById('homeDailyMotivation');
  const date=document.getElementById('homeDailyDate');
  if(message) message.textContent=getDailyMotivation();
  if(date) date.textContent=new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
}

const titles={inicio:'Inicio',resumen:'Resumen',inventario:'Inventario',contabilidad:'Finanzas',contactos:'Clientes / Proveedores',productos:'Catálogo',pedidos:'Pedidos',configuracion:'Configuración'};
function go(view){
  const user=getCurrentUser();
  if(user&&!roleCanAccessView(user,view)) view='inicio';
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.getElementById('pageTitle').textContent=titles[view];
  closeMenu();
  window.scrollTo({top:0,behavior:'smooth'});
}
document.getElementById('mainNav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)go(b.dataset.view)});
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)go(b.dataset.go)});

const sidebar=document.getElementById('sidebar'), overlay=document.getElementById('overlay');
function closeMenu(){sidebar.classList.remove('open');overlay.classList.remove('show')}
document.getElementById('menuBtn').onclick=()=>{sidebar.classList.add('open');overlay.classList.add('show')};overlay.onclick=closeMenu;

// V0.1.31 · Las ventanas emergentes solo se cierran mediante sus controles explícitos.
// Escape y los clics fuera del cuadro no descartan formularios accidentalmente.
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('cancel',event=>event.preventDefault());
});

function discardDialogDraft(dialog){
  if(!dialog) return;
  const form=dialog.querySelector('form');
  if(form) form.reset();

  // Limpia también estados visuales/dinámicos que no forman parte de form.reset().
  if(dialog.id==='inventoryModal'){
    document.getElementById('inventoryNewCategoryWrap')?.classList.add('is-hidden');
    const input=document.getElementById('inventoryNewCategory'); if(input) input.value='';
  }
  if(dialog.id==='materialModal'){
    document.getElementById('materialNewCategoryWrap')?.classList.add('is-hidden');
    const input=document.getElementById('materialNewCategory'); if(input) input.value='';
  }
  if(dialog.id==='movementModal'){
    document.getElementById('movementNewCategoryWrap')?.classList.add('is-hidden');
    const input=document.getElementById('movementNewCategory'); if(input) input.value='';
  }
  if(dialog.id==='inventoryAdjustModal'){
    const current=document.getElementById('inventoryAdjustCurrent'); if(current) current.value='—';
    const preview=document.querySelector('#inventoryAdjustPreview strong'); if(preview) preview.textContent='—';
  }
  if(dialog.id==='adminPasswordResetModal'){
    const id=document.getElementById('adminPasswordResetUserId'); if(id) id.value='';
    const name=document.getElementById('adminPasswordResetUserName'); if(name) name.textContent='este usuario';
    setAuthError('adminPasswordResetError','');
  }
  if(dialog.id==='contactModal'){
    const id=document.getElementById('contactId'); if(id) id.value='';
    const title=document.getElementById('contactModalTitle'); if(title) title.textContent='Nuevo contacto';
    const saveBtn=document.getElementById('contactSaveBtn'); if(saveBtn) saveBtn.textContent='Guardar';
  }
  if(dialog.id==='productModal'){
    const id=document.getElementById('productId'); if(id) id.value='';
    document.getElementById('productNewCategoryWrap')?.classList.add('is-hidden');
    document.getElementById('productMaterialsWrap')?.classList.add('is-hidden');
    const list=document.getElementById('productMaterialsList'); if(list) list.innerHTML='';
    const err=document.getElementById('productSkuError'); if(err){err.textContent='';err.classList.add('is-hidden')}
    const materialCost=document.getElementById('productMaterialsCost'); if(materialCost) materialCost.textContent=money(0);
    const materialPreview=document.getElementById('productMaterialCostPreview'); if(materialPreview) materialPreview.textContent=money(0);
    const pricePreview=document.getElementById('productPricePreview'); if(pricePreview) pricePreview.textContent=money(0);
    const title=document.getElementById('productModalTitle'); if(title) title.textContent='Nuevo producto';
    const saveBtn=document.getElementById('productSaveBtn'); if(saveBtn) saveBtn.textContent='Guardar';
  }
  if(dialog.id==='orderModal'){
    if(form) delete form.dataset.orderSequence;
    const list=document.getElementById('orderProductsList'); if(list) list.innerHTML='';
    document.getElementById('orderProductsError')?.classList.add('is-hidden');
    document.getElementById('orderPartialPaymentBox')?.classList.add('is-hidden');
    const code=document.getElementById('orderCode'); if(code) code.value='';
    const total=document.getElementById('orderTotalPreview'); if(total) total.textContent=money(0);
    const paid=document.getElementById('orderPartialPaidPreview'); if(paid) paid.textContent=money(0);
    const remaining=document.getElementById('orderPartialRemainingPreview'); if(remaining) remaining.textContent=money(0);
    const pending=document.getElementById('orderPartialPendingPreview'); if(pending) pending.textContent=`Pendiente: ${money(0)}`;
  }
  if(dialog.id==='orderDetailsModal'){
    const id=document.getElementById('orderDetailsId'); if(id) id.value='';
    const products=document.getElementById('orderDetailsProducts'); if(products) products.innerHTML='';
    document.getElementById('orderDetailsPartialPaymentBox')?.classList.add('is-hidden');
    document.getElementById('orderRefundBox')?.classList.add('is-hidden');
  }
  if(dialog.id==='accountModal'){
    const kind=document.getElementById('accountKind'); if(kind) kind.value='';
  }
  if(dialog.id==='newUserModal') setAuthError('newUserError','');
  if(dialog.id==='profileModal') setAuthError('profileError','');
  if(dialog.id==='recoveryModal') setAuthError('recoveryError','');

  dialog.close();
}

// Cancelar, Cerrar o la X descartan lo no guardado y dejan el formulario limpio.
document.addEventListener('click',event=>{
  const cancelButton=event.target.closest('dialog button[value="cancel"]');
  if(!cancelButton) return;
  event.preventDefault();
  const dialog=cancelButton.closest('dialog');
  discardDialogDraft(dialog);
});

document.getElementById('dailyMotivationBtn').addEventListener('click',showDailyMotivation);
document.getElementById('motivationClose').addEventListener('click',()=>document.getElementById('motivationModal').close());

function getInventoryCategories(){
  const combined=[...DEFAULT_INVENTORY_CATEGORIES,...(state.inventoryCategories||[]),...state.inventory.map(i=>i.category).filter(Boolean)];
  const seen=new Set();
  return combined.filter(name=>{
    const clean=String(name).trim();
    const key=clean.toLocaleLowerCase('es');
    if(!clean||seen.has(key)||clean==='Sin categoría') return false;
    seen.add(key);
    return true;
  });
}

function populateInventoryCategoryOptions(){
  const select=document.getElementById('inventoryCategory');
  const categories=getInventoryCategories();
  select.innerHTML='<option value="" disabled selected>Seleccioná una categoría</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')+'<option value="__new__">+ Agregar otra categoría…</option>';
  toggleInventoryNewCategory();
}

function populateInventorySupplierOptions(){
  const select=document.getElementById('inventorySupplier');
  const providers=state.contacts
    .filter(c=>c.type==='proveedor'||c.type==='ambos')
    .sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
  if(!providers.length){
    select.innerHTML='<option value="">Sin proveedor asignado</option><option value="" disabled>No hay proveedores registrados</option>';
    return;
  }
  select.innerHTML='<option value="">Sin proveedor asignado</option>'+providers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

function toggleInventoryNewCategory(){
  const select=document.getElementById('inventoryCategory');
  const wrap=document.getElementById('inventoryNewCategoryWrap');
  const input=document.getElementById('inventoryNewCategory');
  const adding=select.value==='__new__';
  wrap.classList.toggle('is-hidden',!adding);
  input.required=adding;
  if(!adding) input.value='';
}

document.getElementById('inventoryCategory').addEventListener('change',toggleInventoryNewCategory);
document.getElementById('inventoryForm').addEventListener('reset',()=>setTimeout(()=>{populateInventoryCategoryOptions();populateInventorySupplierOptions();},0));

function getMaterialCategories(){
  const combined=[...DEFAULT_MATERIAL_CATEGORIES,...(state.materialCategories||[]),...(state.materials||[]).map(m=>m.category).filter(Boolean)];
  const seen=new Set();
  return combined.filter(name=>{
    const clean=String(name).trim();
    const key=clean.toLocaleLowerCase('es');
    if(!clean||seen.has(key)||clean==='Sin categoría') return false;
    seen.add(key);
    return true;
  });
}

function populateMaterialCategoryOptions(){
  const select=document.getElementById('materialCategory');
  const categories=getMaterialCategories();
  select.innerHTML='<option value="" disabled selected>Seleccioná una categoría</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')+'<option value="__new__">+ Agregar otra categoría…</option>';
  toggleMaterialNewCategory();
}

function populateMaterialSupplierOptions(){
  const select=document.getElementById('materialSupplier');
  const providers=state.contacts
    .filter(c=>c.type==='proveedor'||c.type==='ambos')
    .sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
  if(!providers.length){
    select.innerHTML='<option value="">Sin proveedor asignado</option><option value="" disabled>No hay proveedores registrados</option>';
    return;
  }
  select.innerHTML='<option value="">Sin proveedor asignado</option>'+providers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

function toggleMaterialNewCategory(){
  const select=document.getElementById('materialCategory');
  const wrap=document.getElementById('materialNewCategoryWrap');
  const input=document.getElementById('materialNewCategory');
  const adding=select.value==='__new__';
  wrap.classList.toggle('is-hidden',!adding);
  input.required=adding;
  if(!adding) input.value='';
}

document.getElementById('materialCategory').addEventListener('change',toggleMaterialNewCategory);
document.getElementById('materialForm').addEventListener('reset',()=>setTimeout(()=>{populateMaterialCategoryOptions();populateMaterialSupplierOptions();},0));

function getMovementCategories(type){
  const safeType=type==='egreso'?'egreso':'ingreso';
  const saved=(state.movementCategories&&state.movementCategories[safeType])||[];
  const existing=state.movements.filter(m=>m.type===safeType).map(m=>m.category).filter(Boolean);
  const combined=[...DEFAULT_MOVEMENT_CATEGORIES[safeType],...saved,...existing];
  const seen=new Set();
  return combined.filter(name=>{
    const clean=String(name).trim();
    const key=clean.toLocaleLowerCase('es');
    if(!clean||clean==='General'||seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function populateMovementCategoryOptions(){
  const form=document.getElementById('movementForm');
  const type=form.elements.type.value==='egreso'?'egreso':'ingreso';
  const select=document.getElementById('movementCategory');
  const previous=select.value;
  const categories=getMovementCategories(type);
  select.innerHTML='<option value="" disabled selected>Seleccioná una categoría</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')+'<option value="__new__">+ Agregar otra categoría…</option>';
  if(previous && categories.includes(previous)) select.value=previous;
  toggleMovementNewCategory();
}

function toggleMovementNewCategory(){
  const select=document.getElementById('movementCategory');
  const wrap=document.getElementById('movementNewCategoryWrap');
  const input=document.getElementById('movementNewCategory');
  const adding=select.value==='__new__';
  wrap.classList.toggle('is-hidden',!adding);
  input.required=adding;
  if(!adding) input.value='';
}

document.querySelector('#movementForm [name=type]').addEventListener('change',populateMovementCategoryOptions);
document.getElementById('movementCategory').addEventListener('change',toggleMovementNewCategory);
document.getElementById('movementForm').addEventListener('reset',()=>setTimeout(populateMovementCategoryOptions,0));


function getProductCategories(){
  const combined=[...DEFAULT_PRODUCT_CATEGORIES,...(state.productCategories||[]),...state.products.map(p=>p.category).filter(Boolean)];
  const seen=new Set();
  return combined.map(name=>{
    const clean=String(name).trim();
    return clean.toLocaleLowerCase('es')==='personalizados'?'Personalizado':clean;
  }).filter(name=>{
    const clean=String(name).trim();
    const key=clean.toLocaleLowerCase('es');
    if(!clean||clean==='Sin categoría'||seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function populateProductCategoryOptions(){
  const select=document.getElementById('productCategory');
  const categories=getProductCategories();
  select.innerHTML='<option value="" disabled selected>Seleccioná una categoría</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')+'<option value="__new__">+ Agregar otra categoría…</option>';
  toggleProductNewCategory();
}

function toggleProductNewCategory(){
  const select=document.getElementById('productCategory');
  const wrap=document.getElementById('productNewCategoryWrap');
  const input=document.getElementById('productNewCategory');
  const adding=select.value==='__new__';
  wrap.classList.toggle('is-hidden',!adding);
  input.required=adding;
  if(!adding) input.value='';
  toggleProductMaterials();
}

function isPersonalizedCategory(value){
  return String(value||'').trim().toLocaleLowerCase('es').startsWith('personaliz');
}

function renderProductMaterialPicker(){
  const list=document.getElementById('productMaterialsList');
  const materials=state.materials||[];
  if(!materials.length){
    list.innerHTML='<div class="material-empty">No hay materiales registrados. Agregalos primero desde Inventario → Nuevo material.</div>';
    updateProductPreview();
    return;
  }
  list.innerHTML=materials.map(m=>`<div class="material-picker-row" data-product-material-row="${esc(m.id)}"><label class="material-picker-main"><input type="checkbox" class="product-material-check" value="${esc(m.id)}"><span><strong>${esc(m.name)}</strong><small>${esc(m.category)} · Disponible: ${formatQty(m.quantity)} ${esc(unitLabel(m.unit,m.quantity))} · ${money(m.unitCost)} / ${esc(m.unit)}</small></span></label><div class="material-qty-wrap"><input class="product-material-qty" type="number" min="0" step="0.01" value="1" disabled aria-label="Cantidad de ${esc(m.name)}"><span>${esc(m.unit)}</span></div></div>`).join('');
  updateProductPreview();
}

function setProductMaterialSelection(materials=[]){
  const selected=new Map((materials||[]).map(m=>[String(m.materialId),m]));
  document.querySelectorAll('#productMaterialsList [data-product-material-row]').forEach(row=>{
    const check=row.querySelector('.product-material-check');
    const qty=row.querySelector('.product-material-qty');
    const saved=selected.get(String(check?.value||''));
    if(saved){
      check.checked=true;
      qty.disabled=false;
      qty.value=Number(saved.quantity)||1;
    }
  });
  updateProductPreview();
}

function toggleProductMaterials(){
  const category=document.getElementById('productCategory').value;
  const wrap=document.getElementById('productMaterialsWrap');
  const show=isPersonalizedCategory(category);
  wrap.classList.toggle('is-hidden',!show);
  if(show) renderProductMaterialPicker();
  else{
    wrap.querySelectorAll('.product-material-check').forEach(c=>c.checked=false);
    wrap.querySelectorAll('.product-material-qty').forEach(i=>{i.disabled=true;i.value='1'});
    updateProductPreview();
  }
}

function getSelectedProductMaterials(){
  if(!isPersonalizedCategory(document.getElementById('productCategory').value)) return [];
  const selected=[];
  document.querySelectorAll('#productMaterialsList [data-product-material-row]').forEach(row=>{
    const check=row.querySelector('.product-material-check');
    const qtyInput=row.querySelector('.product-material-qty');
    if(!check?.checked) return;
    const material=(state.materials||[]).find(m=>String(m.id)===String(check.value));
    if(!material) return;
    const quantity=Math.max(0,Number(qtyInput?.value)||0);
    if(quantity<=0) return;
    selected.push({materialId:material.id,name:material.name,unit:material.unit||'unidad',quantity,unitCost:Number(material.unitCost)||0});
  });
  return selected;
}

function productMaterialsCost(productOrMaterials){
  const materials=Array.isArray(productOrMaterials)?productOrMaterials:(productOrMaterials?.materials||[]);
  return materials.reduce((sum,m)=>sum+(Number(m.quantity)||0)*(Number(m.unitCost)||0),0);
}

function normalizeSku(value){return String(value||'').trim().toLocaleUpperCase('es')}
function isProductSkuUsed(value){
  const sku=normalizeSku(value);
  if(!sku) return false;
  return state.products.some(p=>normalizeSku(p.sku)===sku);
}

function generateUniqueProductSku(){
  const used=new Set(state.products.map(p=>normalizeSku(p.sku)).filter(Boolean));
  let n=1, candidate='';
  do{candidate=`ZAM-P${String(n).padStart(4,'0')}`;n+=1}while(used.has(candidate));
  return candidate;
}

function clearProductSkuError(){
  const error=document.getElementById('productSkuError');
  const input=document.getElementById('productSku');
  error.textContent='';
  error.classList.add('is-hidden');
  input.classList.remove('input-error');
}

function showProductSkuError(message){
  const error=document.getElementById('productSkuError');
  const input=document.getElementById('productSku');
  error.textContent=message;
  error.classList.remove('is-hidden');
  input.classList.add('input-error');
}

function updateProductSkuMode(){
  const form=document.getElementById('productForm');
  const mode=form.elements.skuMode.value;
  const input=document.getElementById('productSku');
  const help=document.getElementById('productSkuHelp');
  clearProductSkuError();
  if(mode==='manual'){
    input.readOnly=false;
    input.value='';
    input.placeholder='Ej.: ZAM-PUL-001';
    help.textContent='Escribí un código único. No puede repetirse con otro producto.';
    setTimeout(()=>input.focus(),0);
  }else{
    input.readOnly=true;
    input.value=generateUniqueProductSku();
    input.placeholder='';
    help.textContent='Código generado automáticamente y verificado como único.';
  }
}

function validateManualProductSku(){
  const form=document.getElementById('productForm');
  if(form.elements.skuMode.value!=='manual'){clearProductSkuError();return true}
  const value=form.elements.sku.value.trim();
  if(!value){showProductSkuError('Debes escribir un código para el producto.');return false}
  if(isProductSkuUsed(value)){showProductSkuError('Este código ya fue utilizado. Elegí otro código.');return false}
  clearProductSkuError();
  return true;
}

document.getElementById('productCategory').addEventListener('change',toggleProductNewCategory);
document.getElementById('productSkuMode').addEventListener('change',updateProductSkuMode);
document.getElementById('productSku').addEventListener('input',()=>{
  const form=document.getElementById('productForm');
  if(form.elements.skuMode.value==='manual') validateManualProductSku();
});
document.getElementById('productMaterialsList').addEventListener('change',e=>{
  const row=e.target.closest('[data-product-material-row]');
  if(!row)return;
  const check=row.querySelector('.product-material-check');
  const qty=row.querySelector('.product-material-qty');
  if(e.target.classList.contains('product-material-check')){
    qty.disabled=!check.checked;
    if(check.checked&&Number(qty.value)<=0)qty.value='1';
  }
  updateProductPreview();
});
document.getElementById('productMaterialsList').addEventListener('input',e=>{if(e.target.classList.contains('product-material-qty'))updateProductPreview()});
document.getElementById('productForm').addEventListener('reset',()=>setTimeout(()=>{
  const form=document.getElementById('productForm');
  // Si el formulario ya se abrió para editar, no pisar el SKU bloqueado ni los datos cargados.
  if(form.elements.productId.value) return;
  form.elements.skuMode.disabled=false;
  document.getElementById('productSkuModeWrap').classList.remove('sku-locked-mode');
  populateProductCategoryOptions();
  form.elements.skuMode.value='auto';
  updateProductSkuMode();
  toggleProductMaterials();
},0));


function getInventoryAdjustmentOptions(){
  const articles=(state.inventory||[]).map(i=>({value:`article:${i.id}`,label:`Artículo · ${i.name}`,kind:'article',item:i}));
  const materials=(state.materials||[]).map(m=>({value:`material:${m.id}`,label:`Material · ${m.name}`,kind:'material',item:m}));
  return [...articles,...materials];
}

function populateInventoryAdjustOptions(preselect=''){
  const select=document.getElementById('inventoryAdjustTarget');
  const options=getInventoryAdjustmentOptions();
  if(!options.length){
    select.innerHTML='<option value="" selected disabled>No hay artículos ni materiales registrados</option>';
    select.disabled=true;
  }else{
    select.disabled=false;
    const articleOptions=options.filter(o=>o.kind==='article');
    const materialOptions=options.filter(o=>o.kind==='material');
    let html='<option value="" disabled>Seleccioná un artículo o material</option>';
    if(articleOptions.length)html+=`<optgroup label="Artículos">${articleOptions.map(o=>`<option value="${esc(o.value)}">${esc(o.item.name)}</option>`).join('')}</optgroup>`;
    if(materialOptions.length)html+=`<optgroup label="Materiales">${materialOptions.map(o=>`<option value="${esc(o.value)}">${esc(o.item.name)}</option>`).join('')}</optgroup>`;
    select.innerHTML=html;
    const hasPreselect=preselect&&options.some(o=>o.value===preselect);
    select.value=hasPreselect?preselect:options[0].value;
  }
  updateInventoryAdjustPreview();
}

function getInventoryAdjustSelection(){
  const value=document.getElementById('inventoryAdjustTarget').value||'';
  const [kind,id]=value.split(':');
  if(kind==='article'){
    const item=(state.inventory||[]).find(i=>i.id===id);
    return item?{kind,id,item,current:Number(item.stock)||0,unit:'unidad'}:null;
  }
  if(kind==='material'){
    const item=(state.materials||[]).find(m=>m.id===id);
    return item?{kind,id,item,current:Number(item.quantity)||0,unit:item.unit||'unidad'}:null;
  }
  return null;
}

function updateInventoryAdjustPreview(){
  const selection=getInventoryAdjustSelection();
  const currentEl=document.getElementById('inventoryAdjustCurrent');
  const amountEl=document.getElementById('inventoryAdjustAmount');
  const direction=document.getElementById('inventoryAdjustDirection').value;
  const preview=document.getElementById('inventoryAdjustPreview');
  if(!selection){
    currentEl.value='—';
    preview.querySelector('strong').textContent='—';
    return;
  }
  const isArticle=selection.kind==='article';
  amountEl.step=isArticle?'1':'0.01';
  amountEl.min=isArticle?'1':'0.01';
  if(isArticle&&amountEl.value&&Number(amountEl.value)%1!==0)amountEl.value=Math.max(1,Math.round(Number(amountEl.value)||1));
  const amount=Math.max(0,Number(amountEl.value)||0);
  const delta=direction==='decrease'?-amount:amount;
  const next=selection.current+delta;
  currentEl.value=isArticle?`${formatQty(selection.current)} unidades`:`${formatQty(selection.current)} ${unitLabel(selection.unit,selection.current)}`;
  const shown=isArticle?`${formatQty(next)} unidades`:`${formatQty(next)} ${unitLabel(selection.unit,next)}`;
  preview.querySelector('strong').textContent=shown;
  preview.classList.toggle('negative',next<0);
}

function openInventoryAdjustModal(preselect=''){
  const modal=document.getElementById('inventoryAdjustModal');
  const form=document.getElementById('inventoryAdjustForm');
  form.reset();
  document.getElementById('inventoryAdjustDirection').value='increase';
  populateInventoryAdjustOptions(preselect);
  modal.showModal();
}

function openProductEditModal(productId){
  const product=state.products.find(p=>String(p.id)===String(productId));
  if(!product){toast('No se encontró el producto');return}
  const modal=document.getElementById('productModal');
  const form=document.getElementById('productForm');
  form.reset();
  populateProductCategoryOptions();
  form.elements.productId.value=product.id;
  document.getElementById('productModalTitle').textContent='Modificar producto';
  document.getElementById('productSaveBtn').textContent='Guardar cambios';
  form.elements.name.value=product.name||'';
  const categories=getProductCategories();
  if(product.category&&!categories.includes(product.category)){
    const option=document.createElement('option');
    option.value=product.category;option.textContent=product.category;
    document.getElementById('productCategory').insertBefore(option,document.getElementById('productCategory').querySelector('option[value="__new__"]'));
  }
  form.elements.category.value=product.category||'';
  toggleProductNewCategory();
  form.elements.purchaseCost.value=Number(product.purchaseCost)||0;
  form.elements.extraCost.value=Number(product.extraCost)||0;
  form.elements.markup.value=Number(product.markup)||0;
  form.elements.skuMode.value='manual';
  form.elements.skuMode.disabled=true;
  document.getElementById('productSkuModeWrap').classList.add('sku-locked-mode');
  form.elements.sku.value=product.sku||'';
  form.elements.sku.readOnly=true;
  document.getElementById('productSkuHelp').textContent='Código bloqueado. Para reutilizar este código, primero debes eliminar el producto y cargarlo nuevamente.';
  clearProductSkuError();
  if(isPersonalizedCategory(product.category)){
    renderProductMaterialPicker();
    setProductMaterialSelection(product.materials||[]);
  }else{
    toggleProductMaterials();
  }
  updateProductPreview();
  modal.showModal();
}


function getRegisteredClients(){
  return (state.contacts||[])
    .filter(c=>c&&['cliente','ambos'].includes(String(c.type||'').toLowerCase()))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es',{sensitivity:'base'}));
}

function getProductUnitPrice(product){
  if(!product) return 0;
  const total=(Number(product.purchaseCost)||0)+(Number(product.extraCost)||0)+productMaterialsCost(product);
  return total*(1+(Number(product.markup)||0)/100);
}

function generateUniqueOrderCode(){
  const used=new Set([
    ...(state.orders||[]).map(o=>normalizeSku(o.code)),
    ...(state.products||[]).map(p=>normalizeSku(p.sku))
  ].filter(Boolean));
  let sequence=Math.max(0,Number(state.orderSequence)||0);
  for(const order of (state.orders||[])){
    const match=String(order.code||'').match(/^ZAM-ORD-(\d+)$/i);
    if(match) sequence=Math.max(sequence,Number(match[1])||0);
  }
  let code='';
  do{
    sequence+=1;
    code=`ZAM-ORD-${String(sequence).padStart(6,'0')}`;
  }while(used.has(normalizeSku(code)));
  return {code,sequence};
}

function populateOrderClientOptions(){
  const select=document.getElementById('orderCustomer');
  const clients=getRegisteredClients();
  if(!clients.length){
    select.innerHTML='<option value="" selected disabled>No hay clientes registrados</option>';
    select.disabled=true;
    return;
  }
  select.disabled=false;
  select.innerHTML='<option value="" selected disabled>Seleccionar cliente…</option>'+clients.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

function renderOrderProductsList(){
  const list=document.getElementById('orderProductsList');
  const products=[...(state.products||[])].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es',{sensitivity:'base'}));
  const error=document.getElementById('orderProductsError');
  error.classList.add('is-hidden');
  if(!products.length){
    list.innerHTML='<div class="order-products-empty">No hay productos registrados en el Catálogo. Agregá al menos uno antes de crear un pedido.</div>';
    updateOrderTotal();
    return;
  }
  list.innerHTML=products.map(p=>{
    const price=getProductUnitPrice(p);
    return `<div class="order-product-row" data-order-product-row="${esc(p.id)}"><input class="order-product-check" type="checkbox" value="${esc(p.id)}" aria-label="Agregar ${esc(p.name)}"><div class="order-product-info"><strong>${esc(p.name)}</strong><small>${esc(p.sku||'Sin código')} · ${money(price)} c/u</small></div><div class="order-product-qty"><span>Cant.</span><input class="order-product-quantity" type="number" min="1" step="1" value="1" disabled aria-label="Cantidad de ${esc(p.name)}"></div></div>`;
  }).join('');
  updateOrderTotal();
}

function normalizeInventoryName(value){
  return String(value||'').trim().toLocaleLowerCase('es').replace(/\s+/g,' ');
}

function findInventoryArticleForProduct(product){
  if(!product) return null;
  const directId=product.inventoryArticleId||'';
  if(directId){
    const direct=(state.inventory||[]).find(i=>String(i.id)===String(directId));
    if(direct) return direct;
  }
  const name=normalizeInventoryName(product.name);
  if(!name) return null;
  return (state.inventory||[]).find(i=>normalizeInventoryName(i.name)===name)||null;
}

function orderShouldUseStock(status){
  return ['preparando','entregado'].includes(String(status||''));
}

function buildOrderStockUsage(order){
  const merged=new Map();
  const add=(usage)=>{
    const key=`${usage.kind}:${usage.id}`;
    if(merged.has(key)) merged.get(key).quantity+=Number(usage.quantity)||0;
    else merged.set(key,{...usage,quantity:Number(usage.quantity)||0});
  };
  (order.items||[]).forEach(item=>{
    const orderQty=Math.max(0,Number(item.quantity)||0);
    if(!orderQty) return;
    const product=(state.products||[]).find(p=>String(p.id)===String(item.productId));
    const materialSnapshot=Array.isArray(item.materials)&&item.materials.length?item.materials:(product?.materials||[]);
    if(materialSnapshot.length){
      materialSnapshot.forEach(pm=>{
        const material=(state.materials||[]).find(m=>String(m.id)===String(pm.materialId));
        add({
          kind:'material',id:pm.materialId,name:pm.name||material?.name||'Material',
          quantity:(Number(pm.quantity)||0)*orderQty,unit:pm.unit||material?.unit||'unidad',
          unitCost:Number(pm.unitCost??material?.unitCost)||0,category:material?.category||'',supplier:material?.supplier||''
        });
      });
      return;
    }
    const article=(state.inventory||[]).find(i=>String(i.id)===String(item.inventoryArticleId))||findInventoryArticleForProduct(product||item);
    if(article){
      add({kind:'article',id:article.id,name:article.name||item.name||'Artículo',quantity:orderQty,unitCost:Number(article.unitCost)||0,category:article.category||'',supplier:article.supplier||''});
    }
  });
  return [...merged.values()].filter(u=>u.id&&u.quantity>0);
}

function checkOrderStockAvailability(usage){
  const missing=[];
  usage.forEach(u=>{
    if(u.kind==='material'){
      const item=(state.materials||[]).find(m=>String(m.id)===String(u.id));
      if(!item||Number(item.quantity)<Number(u.quantity)) missing.push(`${u.name}: necesita ${formatQty(u.quantity)} ${unitLabel(u.unit,u.quantity)}, disponible ${formatQty(item?.quantity||0)}`);
    }else{
      const item=(state.inventory||[]).find(i=>String(i.id)===String(u.id));
      if(!item||Number(item.stock)<Number(u.quantity)) missing.push(`${u.name}: necesita ${formatQty(u.quantity)}, disponible ${formatQty(item?.stock||0)}`);
    }
  });
  return missing;
}

function applyOrderStock(order){
  const unlinked=[];
  (order.items||[]).forEach(item=>{
    const product=(state.products||[]).find(p=>String(p.id)===String(item.productId));
    const materials=Array.isArray(item.materials)&&item.materials.length?item.materials:(product?.materials||[]);
    if(materials.length) return;
    const article=(state.inventory||[]).find(i=>String(i.id)===String(item.inventoryArticleId))||findInventoryArticleForProduct(product||item);
    if(!article) unlinked.push(item.name||'Producto');
  });
  if(unlinked.length){
    alert(`Antes de preparar este pedido, registrá en Inventario estos artículos con el mismo nombre que en Catálogo:

${[...new Set(unlinked)].join('\n')}

Los productos personalizados que usan materiales se descuentan directamente de Materiales.`);
    return false;
  }
  const usage=Array.isArray(order.stockUsage)&&order.stockUsage.length?order.stockUsage:buildOrderStockUsage(order);
  const missing=checkOrderStockAvailability(usage);
  if(missing.length){
    alert(`No hay existencias suficientes para preparar este pedido:\n\n${missing.join('\n')}`);
    return false;
  }
  usage.forEach(u=>{
    if(u.kind==='material'){
      const item=(state.materials||[]).find(m=>String(m.id)===String(u.id));
      if(item) item.quantity=Math.max(0,(Number(item.quantity)||0)-Number(u.quantity));
    }else{
      const item=(state.inventory||[]).find(i=>String(i.id)===String(u.id));
      if(item) item.stock=Math.max(0,(Number(item.stock)||0)-Number(u.quantity));
    }
    (state.inventoryAdjustments||(state.inventoryAdjustments=[])).push({id:uid(),date:today(),targetType:u.kind,targetId:u.id,direction:'decrease',amount:Number(u.quantity)||0,reason:'Pedido en preparación',notes:`Descuento automático · ${order.code||'Pedido'}`});
  });
  order.stockUsage=usage;
  order.stockAllocated=true;
  return true;
}

function restoreOrderStock(order){
  if(!order.stockAllocated) return true;
  const usage=Array.isArray(order.stockUsage)?order.stockUsage:[];
  usage.forEach(u=>{
    if(u.kind==='material'){
      let item=(state.materials||[]).find(m=>String(m.id)===String(u.id));
      if(!item){
        item={id:u.id,name:u.name||'Material devuelto',category:u.category||'Otros materiales',unit:u.unit||'unidad',quantity:0,minQuantity:0,unitCost:Number(u.unitCost)||0,supplier:u.supplier||''};
        (state.materials||(state.materials=[])).push(item);
      }
      item.quantity=(Number(item.quantity)||0)+Number(u.quantity);
    }else{
      let item=(state.inventory||[]).find(i=>String(i.id)===String(u.id));
      if(!item){
        item={id:u.id,name:u.name||'Artículo devuelto',category:u.category||'Sin categoría',stock:0,minStock:0,unitCost:Number(u.unitCost)||0,supplier:u.supplier||''};
        (state.inventory||(state.inventory=[])).push(item);
      }
      item.stock=(Number(item.stock)||0)+Number(u.quantity);
    }
    (state.inventoryAdjustments||(state.inventoryAdjustments=[])).push({id:uid(),date:today(),targetType:u.kind,targetId:u.id,direction:'increase',amount:Number(u.quantity)||0,reason:'Pedido cancelado/devuelto',notes:`Reposición automática · ${order.code||'Pedido'}`});
  });
  order.stockAllocated=false;
  order.stockRestoredDate=today();
  return true;
}

function syncOrderInventory(order,nextStatus){
  const shouldUse=orderShouldUseStock(nextStatus);
  const isUsing=order.stockAllocated===true;
  if(shouldUse&&!isUsing) return applyOrderStock(order);
  if(!shouldUse&&isUsing) return restoreOrderStock(order);
  return true;
}

function getSelectedOrderItems(){
  const items=[];
  document.querySelectorAll('#orderProductsList [data-order-product-row]').forEach(row=>{
    const check=row.querySelector('.order-product-check');
    if(!check?.checked) return;
    const product=(state.products||[]).find(p=>String(p.id)===String(check.value));
    if(!product) return;
    const qtyInput=row.querySelector('.order-product-quantity');
    const quantity=Math.max(1,Math.floor(Number(qtyInput?.value)||1));
    const unitPrice=getProductUnitPrice(product);
    const linkedArticle=findInventoryArticleForProduct(product);
    items.push({
      productId:product.id,
      sku:product.sku||'',
      name:product.name||'Producto',
      quantity,
      unitPrice,
      subtotal:unitPrice*quantity,
      inventoryArticleId:linkedArticle?.id||'',
      materials:(product.materials||[]).map(m=>({
        materialId:m.materialId,
        name:m.name||'',
        quantity:Number(m.quantity)||0,
        unit:m.unit||'unidad',
        unitCost:Number(m.unitCost)||0
      }))
    });
  });
  return items;
}

function getOrderPaidAmount(order){
  const total=Math.max(0,Number(order?.total)||0);
  const payment=String(order?.payment||'pendiente');
  if(payment==='pagado') return total;
  if(payment==='parcial') return Math.min(total,Math.max(0,Number(order?.paidAmount)||0));
  return 0;
}

function resolvePaidAmount(payment,total,inputValue){
  total=Math.max(0,Number(total)||0);
  if(payment==='pagado') return total;
  if(payment==='parcial') return Math.min(total,Math.max(0,Number(inputValue)||0));
  return 0;
}

function updateNewOrderPartialPayment(){
  const form=document.getElementById('orderForm');
  const box=document.getElementById('orderPartialPaymentBox');
  if(!form||!box) return;
  const payment=form.elements.payment.value||'pendiente';
  const isPartial=payment==='parcial';
  box.classList.toggle('is-hidden',!isPartial);
  if(!isPartial) return;
  const total=getSelectedOrderItems().reduce((sum,item)=>sum+(Number(item.subtotal)||0),0);
  const paid=Math.max(0,Number(form.elements.paidAmount.value)||0);
  const remaining=Math.max(0,total-paid);
  form.elements.paidAmount.max=total>0?String(total):'';
  document.getElementById('orderPartialTotalPreview').textContent=money(total);
  document.getElementById('orderPartialPaidPreview').textContent=money(paid);
  document.getElementById('orderPartialRemainingPreview').textContent=money(remaining);
  document.getElementById('orderPartialPendingPreview').textContent=`Pendiente: ${money(remaining)}`;
}

function updateOrderDetailsPartialPayment(){
  const form=document.getElementById('orderDetailsForm');
  const box=document.getElementById('orderDetailsPartialPaymentBox');
  if(!form||!box) return;
  const order=(state.orders||[]).find(o=>String(o.id)===String(form.elements.orderId.value));
  const total=Math.max(0,Number(order?.total)||0);
  const payment=form.elements.payment.value||'pendiente';
  const isPartial=payment==='parcial';
  box.classList.toggle('is-hidden',!isPartial);
  if(!isPartial) return;
  const paid=Math.max(0,Number(form.elements.paidAmount.value)||0);
  const remaining=Math.max(0,total-paid);
  form.elements.paidAmount.max=total>0?String(total):'';
  document.getElementById('orderDetailsPartialTotalPreview').textContent=money(total);
  document.getElementById('orderDetailsPartialPaidPreview').textContent=money(paid);
  document.getElementById('orderDetailsPartialRemainingPreview').textContent=money(remaining);
  document.getElementById('orderDetailsPendingPreview').textContent=`Pendiente: ${money(remaining)}`;
}

function updateOrderTotal(){
  const total=getSelectedOrderItems().reduce((sum,item)=>sum+(Number(item.subtotal)||0),0);
  const preview=document.getElementById('orderTotalPreview');
  if(preview) preview.textContent=money(total);
  updateNewOrderPartialPayment();
  return total;
}

function openOrderDetails(orderId){
  const order=(state.orders||[]).find(o=>String(o.id)===String(orderId));
  if(!order){toast('No se encontró el pedido');return}
  const modal=document.getElementById('orderDetailsModal');
  const form=document.getElementById('orderDetailsForm');
  form.elements.orderId.value=order.id;
  document.getElementById('orderDetailsTitle').textContent=order.code||'Pedido';
  document.getElementById('orderDetailsCustomer').textContent=order.customer||'Cliente';
  document.getElementById('orderDetailsDate').textContent=order.date||'—';
  document.getElementById('orderDetailsTotal').textContent=money(order.total);
  const products=document.getElementById('orderDetailsProducts');
  if(Array.isArray(order.items)&&order.items.length){
    products.innerHTML=order.items.map(item=>`<div class="order-detail-line"><div><strong>${esc(item.name||'Producto')}</strong><small>${esc(item.sku||'Sin código')} · ${Number(item.quantity)||0} × ${money(item.unitPrice)}</small></div><strong>${money(item.subtotal)}</strong></div>`).join('');
  }else if(order.detail){
    products.innerHTML=`<div class="order-detail-legacy"><strong>Detalle registrado</strong><span>${esc(order.detail)}</span></div>`;
  }else{
    products.innerHTML='<div class="order-products-empty">Este pedido antiguo no tiene productos detallados.</div>';
  }
  const status=order.status||'pendiente';
  const statusSelect=document.getElementById('orderDetailsStatus');
  const statuses=['pendiente','preparando','entregado','cancelado','devuelto'];
  const allowed=status==='pendiente'?statuses:statuses.filter(s=>s!=='pendiente');
  statusSelect.innerHTML=allowed.map(s=>`<option value="${s}" ${s===status?'selected':''}>${statusLabels[s]}</option>`).join('');
  form.elements.payment.value=order.payment||'pendiente';
  form.elements.paymentMethod.value=order.paymentMethod||'Por definir';
  form.elements.paidAmount.value=order.payment==='parcial'?(Number(order.paidAmount)||0):'';
  updateOrderDetailsPartialPayment();
  const amountReceived=getOrderPaidAmount(order);
  const savedRefund=order.refundAmount==null?(status==='devuelto'?amountReceived:0):Number(order.refundAmount)||0;
  form.elements.refundType.value=order.refundType||(savedRefund>0&&savedRefund<amountReceived?'parcial':'completa');
  form.elements.refundAmount.value=savedRefund||amountReceived||0;
  updateOrderRefundControls();
  const pending=status==='pendiente';
  document.getElementById('orderDeleteBtn').classList.toggle('is-hidden',!pending);
  document.getElementById('orderDeleteNote').textContent=pending?'Este pedido todavía puede eliminarse porque está Pendiente.':'Este pedido ya no puede eliminarse ni volver al estado Pendiente.';
  document.getElementById('orderStatusHelp').textContent=pending?'Al pasar a Preparando o a cualquier estado posterior, ya no podrá volver a Pendiente.':'El estado Pendiente quedó bloqueado para este pedido.';
  modal.showModal();
}

function showModal(id){
  const d=document.getElementById(id);
  if(id==='movementModal') {d.querySelector('[name=date]').value=today();document.getElementById('movementModalTitle').textContent='Nuevo movimiento';populateMovementCategoryOptions();}
  if(id==='orderModal') {
    const form=document.getElementById('orderForm');
    form.reset();
    form.elements.code.value='Automático al guardar';
    form.dataset.orderSequence='';
    form.elements.date.value=today();
    form.elements.payment.value='pendiente';
    form.elements.paymentMethod.value='Por definir';
    form.elements.paidAmount.value='';
    populateOrderClientOptions();
    renderOrderProductsList();
    updateNewOrderPartialPayment();
  }
  if(id==='productModal'){
    const form=document.getElementById('productForm');
    form.reset();
    form.elements.productId.value='';
    document.getElementById('productModalTitle').textContent='Nuevo producto';
    document.getElementById('productSaveBtn').textContent='Guardar';
    form.elements.skuMode.disabled=false;
    document.getElementById('productSkuModeWrap').classList.remove('sku-locked-mode');
    form.elements.sku.readOnly=false;
    populateProductCategoryOptions();
    form.elements.markup.value=state.settings.defaultMarkup;
    form.elements.skuMode.value='auto';
    updateProductSkuMode();
    toggleProductMaterials();
    updateProductPreview();
  }
  if(id==='inventoryModal') {
    populateInventoryCategoryOptions();
    populateInventorySupplierOptions();
    d.querySelector('[name=minStock]').value=state.settings.lowStock;
  }
  if(id==='materialModal') {
    populateMaterialCategoryOptions();
    populateMaterialSupplierOptions();
    d.querySelector('[name=minQuantity]').value=state.settings.lowStock;
  }
  if(id==='contactModal') {
    const form=document.getElementById('contactForm');
    form.reset();
    form.elements.contactId.value='';
    document.getElementById('contactModalTitle').textContent='Nuevo contacto';
    document.getElementById('contactSaveBtn').textContent='Guardar';
  }
  d.showModal();
}
document.addEventListener('click',e=>{
  const editProduct=e.target.closest('[data-edit-product]');
  if(editProduct){openProductEditModal(editProduct.dataset.editProduct);return}
  const openOrder=e.target.closest('[data-open-order]');
  if(openOrder){openOrderDetails(openOrder.dataset.openOrder);return}
  const b=e.target.closest('[data-modal]');if(b)showModal(b.dataset.modal)
});
document.getElementById('inventoryAdjustBtn').addEventListener('click',()=>openInventoryAdjustModal());
document.getElementById('inventoryAdjustTarget').addEventListener('change',updateInventoryAdjustPreview);
document.getElementById('inventoryAdjustDirection').addEventListener('change',updateInventoryAdjustPreview);
document.getElementById('inventoryAdjustAmount').addEventListener('input',updateInventoryAdjustPreview);

function bindDialogForm(formId, handler){
  const form=document.getElementById(formId);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const submit=form.querySelector('button[value="default"],button[type="submit"]');
    const previousText=submit?.textContent;
    if(submit){submit.disabled=true;submit.textContent='Guardando…'}
    try{
      const result=await handler(new FormData(form));
      if(result===false)return;
      form.reset();form.closest('dialog').close();save();
    }catch(error){toast(remoteErrorMessage(error))}
    finally{if(submit){submit.disabled=false;submit.textContent=previousText}}
  });
}

bindDialogForm('inventoryForm',async fd=>{
  let category=String(fd.get('category')||'').trim();
  if(category==='__new__') category=String(fd.get('newCategory')||'').trim();
  if(!category){toast('Seleccioná una categoría');return false}
  const categoryRecord=await ensureInventoryCategory('articulo',category);
  const supplierId=String(fd.get('supplier')||'').trim()||null;
  const payload={
    name:String(fd.get('name')||'').trim(),category_id:categoryRecord?.id||null,
    stock:Number(fd.get('stock'))||0,min_stock:Number(fd.get('minStock'))||0,
    unit_cost:Number(fd.get('unitCost'))||0,supplier_id:supplierId,created_by:currentAuthUserId()
  };
  const {error}=await supabaseClient.from('inventory_articles').insert(payload);
  if(error){toast(remoteErrorMessage(error,'No fue posible guardar el artículo.'));return false}
  await loadSupabaseBusinessData();toast('Artículo agregado al inventario');return true;
});
bindDialogForm('materialForm',async fd=>{
  let category=String(fd.get('category')||'').trim();
  if(category==='__new__') category=String(fd.get('newCategory')||'').trim();
  if(!category){toast('Seleccioná una categoría');return false}
  const categoryRecord=await ensureInventoryCategory('material',category);
  const supplierId=String(fd.get('supplier')||'').trim()||null;
  const payload={
    name:String(fd.get('name')||'').trim(),category_id:categoryRecord?.id||null,
    unit:uiUnitToDb(String(fd.get('unit')||'unidad')),quantity:Number(fd.get('quantity'))||0,
    min_quantity:Number(fd.get('minQuantity'))||0,cost_per_unit:Number(fd.get('unitCost'))||0,
    supplier_id:supplierId,created_by:currentAuthUserId()
  };
  const {error}=await supabaseClient.from('materials').insert(payload);
  if(error){toast(remoteErrorMessage(error,'No fue posible guardar el material.'));return false}
  await loadSupabaseBusinessData();toast('Material agregado al inventario');return true;
});
bindDialogForm('inventoryAdjustForm',async fd=>{
  const selection=getInventoryAdjustSelection();
  if(!selection){toast('Seleccioná un artículo o material');return false}
  const direction=fd.get('direction')==='decrease'?'decrease':'increase';
  const rawAmount=Number(fd.get('amount'))||0;
  const amount=selection.kind==='article'?Math.round(rawAmount):rawAmount;
  if(amount<=0){toast('La cantidad del ajuste debe ser mayor a cero');return false}
  const delta=direction==='decrease'?-amount:amount;
  if(selection.current+delta<0){toast('El ajuste no puede dejar una existencia negativa');return false}
  const {error}=await supabaseClient.rpc('zamat_adjust_inventory',{
    p_target_kind:selection.kind,p_target_id:selection.id,p_delta:delta,
    p_reason:String(fd.get('reason')||'Corrección de inventario'),p_note:String(fd.get('note')||'')||null
  });
  if(error){toast(remoteErrorMessage(error,'No fue posible guardar el ajuste.'));return false}
  await loadSupabaseBusinessData();toast(direction==='increase'?'Existencia aumentada':'Existencia reducida');return true;
});
bindDialogForm('movementForm',async fd=>{
  const type=fd.get('type')==='egreso'?'egreso':'ingreso';
  let category=String(fd.get('category')||'').trim();
  if(category==='__new__') category=String(fd.get('newCategory')||'').trim();
  if(!category){toast('Seleccioná una categoría');return false}
  const {error}=await supabaseClient.rpc('zamat_finance_add_movement',{
    p_type:type,p_date:String(fd.get('date')||today()),p_category_name:category,
    p_description:String(fd.get('description')||'').trim(),p_payment_method_name:String(fd.get('paymentMethod')||'Otro'),p_amount:Number(fd.get('amount'))||0
  });
  if(error){toast(remoteErrorMessage(error,'No fue posible registrar el movimiento.'));return false}
  await loadSupabaseBusinessData();toast('Movimiento registrado');return true;
});
bindDialogForm('contactForm',async fd=>{
  const contactId=String(fd.get('contactId')||'').trim();
  const payload={
    name:String(fd.get('name')||'').trim(),type:String(fd.get('type')||'').trim(),
    phone:String(fd.get('phone')||'').trim()||null,email:String(fd.get('email')||'').trim()||null,
    address:String(fd.get('address')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null
  };
  if(!payload.name||!payload.type){toast('Nombre y tipo son obligatorios');return false}
  if(contactId){
    const {error}=await supabaseClient.from('contacts').update(payload).eq('id',contactId);
    if(error){toast(remoteErrorMessage(error,'No fue posible actualizar el contacto.'));return false}
    toast('Contacto actualizado');
  }else{
    const {error}=await supabaseClient.from('contacts').insert({...payload,created_by:currentAuthUserId()});
    if(error){toast(remoteErrorMessage(error,'No fue posible guardar el contacto.'));return false}
    toast('Contacto guardado');
  }
  await loadSupabaseBusinessData();return true;
});
bindDialogForm('productForm',async fd=>{
  const productId=String(fd.get('productId')||'').trim();
  const existing=productId?state.products.find(p=>String(p.id)===productId):null;
  if(productId&&!existing){toast('No se encontró el producto');return false}
  let category=String(fd.get('category')||'').trim();
  if(category==='__new__') category=String(fd.get('newCategory')||'').trim();
  if(!category){toast('Seleccioná una categoría');return false}
  const materials=isPersonalizedCategory(category)?getSelectedProductMaterials():[];
  const skuMode=existing?'manual':(fd.get('skuMode')==='manual'?'manual':'auto');
  const sku=existing?.sku||String(fd.get('sku')||'').trim();
  if(!existing&&skuMode==='manual'){
    if(!sku){showProductSkuError('Debes escribir un código para el producto.');toast('Ingresá un código para continuar');return false}
    if(isProductSkuUsed(sku)){showProductSkuError('Este código ya fue utilizado. Elegí otro código.');toast('El código ya fue utilizado');return false}
  }
  const {data,error}=await supabaseClient.rpc('zamat_save_product',{
    p_product_id:existing?.id||null,
    p_name:String(fd.get('name')||'').trim(),
    p_category_name:category,
    p_purchase_cost:Number(fd.get('purchaseCost'))||0,
    p_extra_cost:Number(fd.get('extraCost'))||0,
    p_markup_percent:Number(fd.get('markup'))||0,
    p_sku_mode:skuMode,
    p_sku:sku,
    p_materials:materials.map(m=>({material_id:m.materialId,quantity:Number(m.quantity)||0}))
  });
  if(error){const msg=remoteErrorMessage(error,'No fue posible guardar el producto.');showProductSkuError(msg.includes('código')?msg:'');toast(msg);return false}
  await loadSupabaseBusinessData();
  toast(existing?'Producto actualizado':`Producto agregado${data?.[0]?.sku?` · ${data[0].sku}`:''}`);
  return true;
});
bindDialogForm('orderForm',async fd=>{
  const client=(state.contacts||[]).find(c=>String(c.id)===String(fd.get('customerId'))&&['cliente','ambos'].includes(String(c.type||'').toLowerCase()));
  if(!client){toast('Seleccioná un cliente registrado');return false}
  const items=getSelectedOrderItems();
  if(!items.length){document.getElementById('orderProductsError').classList.remove('is-hidden');toast('Seleccioná al menos un producto');return false}
  const total=items.reduce((sum,item)=>sum+(Number(item.subtotal)||0),0);
  const payment=String(fd.get('payment')||'pendiente');
  let paidAmount=resolvePaidAmount(payment,total,fd.get('paidAmount'));
  if(payment==='parcial'){
    const entered=Number(fd.get('paidAmount'))||0;
    if(entered<=0){toast('Ingresá el monto abonado por el cliente');return false}
    if(entered>=total){toast('El pago parcial debe ser menor al total. Si abonó todo, seleccioná Pagado.');return false}
    paidAmount=entered;
  }
  const {data,error}=await supabaseClient.rpc('zamat_create_order',{
    p_client_id:client.id,
    p_order_date:fd.get('date')||today(),
    p_payment_status:payment,
    p_payment_method_name:String(fd.get('paymentMethod')||'Por definir'),
    p_paid_amount:paidAmount,
    p_items:items.map(i=>({product_id:i.productId,quantity:Number(i.quantity)||1})),
    p_notes:null
  });
  if(error){toast(remoteErrorMessage(error,'No fue posible crear el pedido.'));return false}
  await loadSupabaseBusinessData();
  const created=data?.[0];
  toast(created?.order_number?`Pedido ${created.order_number} creado`:'Pedido creado');
  return true;
});

bindDialogForm('orderDetailsForm',async fd=>{
  const order=(state.orders||[]).find(o=>String(o.id)===String(fd.get('orderId')));
  if(!order){toast('No se encontró el pedido');return false}
  const previousStatus=order.status||'pendiente';
  const nextStatus=String(fd.get('status')||previousStatus);
  if(previousStatus!=='pendiente'&&nextStatus==='pendiente'){toast('Este pedido ya no puede volver a Pendiente');return false}
  const nextPayment=String(fd.get('payment')||'pendiente');
  const total=Number(order.total)||0;
  let nextPaidAmount=resolvePaidAmount(nextPayment,total,fd.get('paidAmount'));
  if(nextPayment==='parcial'){
    const entered=Number(fd.get('paidAmount'))||0;
    if(entered<=0){toast('Ingresá el monto abonado por el cliente');return false}
    if(entered>=total){toast('El pago parcial debe ser menor al total. Si abonó todo, seleccioná Pagado.');return false}
    nextPaidAmount=entered;
  }
  let refundAmount=0;
  if(nextStatus==='devuelto'&&nextPaidAmount>0){
    const refundType=String(fd.get('refundType')||'completa');
    refundAmount=refundType==='completa'?nextPaidAmount:Number(fd.get('refundAmount'))||0;
    if(refundAmount<=0){toast('Indicá el monto que se devolverá al cliente');return false}
    if(refundAmount>nextPaidAmount){toast('La devolución no puede superar el monto abonado por el cliente');return false}
  }
  const {error}=await supabaseClient.rpc('zamat_update_order',{
    p_order_id:order.id,
    p_status:nextStatus,
    p_payment_status:nextPayment,
    p_payment_method_name:String(fd.get('paymentMethod')||'Por definir'),
    p_paid_amount:nextPaidAmount,
    p_refund_amount:refundAmount
  });
  if(error){toast(remoteErrorMessage(error,'No fue posible actualizar el pedido.'));return false}
  await loadSupabaseBusinessData();
  toast(nextPayment==='parcial'?`Pedido actualizado · Pendiente ${money(total-nextPaidAmount)}`:(nextStatus==='devuelto'?'Pedido devuelto e inventario repuesto':'Pedido actualizado'));
  return true;
});
bindDialogForm('accountForm',async fd=>{
  const kind=fd.get('kind')==='pagar'?'pagar':'cobrar';
  const {error}=await supabaseClient.rpc('zamat_finance_add_account',{
    p_kind:kind,p_party:String(fd.get('party')||'').trim(),p_amount:Number(fd.get('amount'))||0,
    p_concept:String(fd.get('concept')||'').trim(),p_due_date:String(fd.get('dueDate')||'')||null
  });
  if(error){toast(remoteErrorMessage(error,'No fue posible guardar la cuenta.'));return false}
  await loadSupabaseBusinessData();toast(kind==='cobrar'?'Cuenta por cobrar agregada':'Cuenta por pagar agregada');return true;
});

document.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{const kind=b.dataset.account;document.getElementById('accountKind').value=kind;document.getElementById('accountModalTitle').textContent=kind==='cobrar'?'Nueva cuenta por cobrar':'Nueva cuenta por pagar';document.getElementById('accountModal').showModal()});

function updateProductPreview(){
  const f=document.getElementById('productForm');
  const materialCost=productMaterialsCost(getSelectedProductMaterials());
  const cost=(+f.elements.purchaseCost.value||0)+(+f.elements.extraCost.value||0)+materialCost;
  const markup=+f.elements.markup.value||0;
  document.getElementById('productMaterialCostPreview').textContent=money(materialCost);
  document.getElementById('productMaterialsCost').textContent=money(materialCost);
  document.getElementById('productPricePreview').textContent=money(cost*(1+markup/100));
}
document.getElementById('productForm').addEventListener('input',updateProductPreview);

function getOrderGeneratedMovements(){
  const generated=[];
  (state.orders||[]).forEach(o=>{
    const orderKey=o.id||o.code||uid();
    const total=Number(o.total)||0;
    const received=getOrderPaidAmount(o);
    const incomeDate=o.paymentChangedDate||o.date||today();
    // Todo abono real del pedido (parcial o completo) se refleja como ingreso.
    if(received>0){
      generated.push({
        id:`pedido-ingreso:${orderKey}`,
        type:'ingreso',
        date:incomeDate,
        category:o.payment==='parcial'?'Abono parcial de pedido':'Venta de pedido',
        description:`${o.payment==='parcial'?'Abono':'Pedido'} ${o.code||'sin código'} · ${o.customer||'Cliente'}`,
        paymentMethod:o.paymentMethod||'Por definir',
        amount:received,
        source:'pedido',generated:true,orderId:o.id||''
      });
    }
    // Si se cancela un pedido con dinero recibido, se genera el egreso por ese monto.
    if(o.status==='cancelado'&&received>0){
      generated.push({
        id:`pedido-egreso:${orderKey}`,
        type:'egreso',
        date:o.statusChangedDate||incomeDate,
        category:'Cancelación de pedido',
        description:`Cancelación de pedido ${o.code||'sin código'} · ${o.customer||'Cliente'}`,
        paymentMethod:o.paymentMethod||'Por definir',
        amount:received,
        source:'pedido',generated:true,orderId:o.id||''
      });
    }
    // En una devolución se usa el monto elegido, sin superar lo realmente abonado.
    if(o.status==='devuelto'){
      const refundAmount=Math.min(received,Math.max(0,Number(o.refundAmount)||0));
      if(refundAmount>0){
        generated.push({
          id:`pedido-egreso:${orderKey}`,
          type:'egreso',
          date:o.refundChangedDate||o.statusChangedDate||incomeDate,
          category:refundAmount>=received?'Devolución completa de pedido':'Devolución parcial de pedido',
          description:`Devolución ${refundAmount>=received?'completa':'parcial'} ${o.code||'sin código'} · ${o.customer||'Cliente'}`,
          paymentMethod:o.paymentMethod||'Por definir',
          amount:refundAmount,
          source:'pedido',generated:true,orderId:o.id||''
        });
      }
    }
  });
  return generated;
}

function getFinancialMovements(){
  return [...(state.movements||[])];
}

function renderSummary(){
  const financialMovements=getFinancialMovements();
  const mm=financialMovements.filter(m=>monthMatch(m.date)); const ins=mm.filter(m=>m.type==='ingreso'), outs=mm.filter(m=>m.type==='egreso');
  const income=ins.reduce((s,m)=>s+m.amount,0),expense=outs.reduce((s,m)=>s+m.amount,0);
  document.getElementById('kpiIncome').textContent=money(income);document.getElementById('kpiExpense').textContent=money(expense);document.getElementById('kpiProfit').textContent=money(income-expense);
  document.getElementById('kpiIncomeCount').textContent=`${ins.length} movimientos`;document.getElementById('kpiExpenseCount').textContent=`${outs.length} movimientos`;
  const open=state.orders.filter(o=>!['entregado','cancelado','devuelto'].includes(o.status));document.getElementById('kpiOrders').textContent=open.length;document.getElementById('kpiPendingAmount').textContent=`${money(open.reduce((s,o)=>s+o.total,0))} por completar`;
  const recent=[...financialMovements].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  document.getElementById('recentMovements').innerHTML=recent.length?recent.map(m=>`<div class="list-row"><div class="main"><strong>${esc(m.description)}</strong><small>${esc(m.category)} · ${esc(m.paymentMethod||'Sin medio registrado')} · ${esc(m.date)}</small></div><strong class="amount ${m.type==='ingreso'?'income':'expense'}">${m.type==='ingreso'?'+':'−'}${money(m.amount)}</strong></div>`).join(''):empty('Todavía no hay movimientos.');
  const lowArticles=state.inventory.filter(i=>i.stock<=i.minStock).map(i=>({kind:'Artículo',name:i.name,category:i.category,qty:`${formatQty(i.stock)} unidades`}));
  const lowMaterials=(state.materials||[]).filter(m=>m.quantity<=m.minQuantity).map(m=>({kind:'Material',name:m.name,category:m.category,qty:`${formatQty(m.quantity)} ${unitLabel(m.unit,m.quantity)}`}));
  const low=[...lowArticles,...lowMaterials].slice(0,6);
  document.getElementById('lowStockList').innerHTML=low.length?low.map(i=>`<div class="list-row"><div class="main"><strong>${esc(i.name)}</strong><small>${esc(i.kind)} · ${esc(i.category)}</small></div><span class="badge warn">${esc(i.qty)}</span></div>`).join(''):empty('No hay artículos ni materiales con stock bajo.');
}

function formatQty(value){return new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(Number(value)||0)}
function unitLabel(unit,quantity){
  const plural={unidad:'unidades',par:'pares',metro:'metros',centímetro:'centímetros',gramo:'gramos',kilogramo:'kilogramos',rollo:'rollos',paquete:'paquetes'};
  return Number(quantity)===1?unit:(plural[unit]||unit);
}

function renderInventory(){
  const q=document.getElementById('inventorySearch').value.toLowerCase(),filter=document.getElementById('inventoryFilter').value;
  const list=state.inventory.filter(i=>(i.name+i.category+i.supplier).toLowerCase().includes(q)&&(filter!=='low'||i.stock<=i.minStock));
  document.getElementById('inventoryBody').innerHTML=list.length?list.map(i=>`<tr><td><strong>${esc(i.name)}</strong>${i.supplier?`<small style="display:block;color:var(--muted)">${esc(i.supplier)}</small>`:''}</td><td>${esc(i.category)}</td><td>${formatQty(i.stock)}</td><td>${money(i.unitCost)}</td><td>${money(i.stock*i.unitCost)}</td><td><span class="badge ${i.stock<=i.minStock?'warn':''}">${i.stock<=i.minStock?'Stock bajo':'Disponible'}</span></td><td><div class="row-actions"><button data-open-adjust="article:${i.id}">Modificar</button><button class="delete" data-delete="inventory:${i.id}">Eliminar</button></div></td></tr>`).join(''):`<tr><td colspan="7">${empty('No hay artículos para mostrar.')}</td></tr>`;
  const materialValue=(state.materials||[]).reduce((s,m)=>s+(Number(m.quantity)||0)*(Number(m.unitCost)||0),0);
  const articleValue=state.inventory.reduce((s,i)=>s+(Number(i.stock)||0)*(Number(i.unitCost)||0),0);
  document.getElementById('invKinds').textContent=state.inventory.length;
  document.getElementById('invMaterials').textContent=(state.materials||[]).length;
  document.getElementById('invValue').textContent=money(articleValue+materialValue);
  document.getElementById('invLow').textContent=state.inventory.filter(i=>i.stock<=i.minStock).length+(state.materials||[]).filter(m=>m.quantity<=m.minQuantity).length;
}

function renderMaterials(){
  state.materials=state.materials||[];
  const q=document.getElementById('materialSearch').value.toLowerCase(),filter=document.getElementById('materialFilter').value;
  const list=state.materials.filter(m=>(m.name+m.category+(m.supplier||'')+(m.unit||'')).toLowerCase().includes(q)&&(filter!=='low'||m.quantity<=m.minQuantity));
  document.getElementById('materialBody').innerHTML=list.length?list.map(m=>`<tr><td><strong>${esc(m.name)}</strong>${m.supplier?`<small style="display:block;color:var(--muted)">${esc(m.supplier)}</small>`:''}</td><td>${esc(m.category)}</td><td>${formatQty(m.quantity)} ${esc(unitLabel(m.unit,m.quantity))}</td><td>${money(m.unitCost)} / ${esc(m.unit)}</td><td>${money(m.quantity*m.unitCost)}</td><td><span class="badge ${m.quantity<=m.minQuantity?'warn':''}">${m.quantity<=m.minQuantity?'Stock bajo':'Disponible'}</span></td><td><div class="row-actions"><button data-open-adjust="material:${m.id}">Modificar</button><button class="delete" data-delete="materials:${m.id}">Eliminar</button></div></td></tr>`).join(''):`<tr><td colspan="7">${empty('No hay materiales registrados todavía.')}</td></tr>`;
}

document.getElementById('inventorySearch').addEventListener('input',renderInventory);document.getElementById('inventoryFilter').addEventListener('change',renderInventory);
document.getElementById('materialSearch').addEventListener('input',renderMaterials);document.getElementById('materialFilter').addEventListener('change',renderMaterials);

function renderAccounting(){
  const movements=getFinancialMovements();
  const income=movements.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(Number(m.amount)||0),0),expense=movements.filter(m=>m.type==='egreso').reduce((s,m)=>s+(Number(m.amount)||0),0);
  document.getElementById('accIncome').textContent=money(income);document.getElementById('accExpense').textContent=money(expense);document.getElementById('accBalance').textContent=money(income-expense);
  const q=document.getElementById('movementSearch').value.toLowerCase().trim(),type=document.getElementById('movementTypeFilter').value,dateFilter=document.getElementById('movementDateFilter').value;
  const list=[...movements].sort((a,b)=>b.date.localeCompare(a.date)).filter(m=>{
    const searchable=[m.date,m.description,m.category,m.paymentMethod||'',m.type,m.source||''].join(' ').toLowerCase();
    return searchable.includes(q)&&(type==='all'||m.type===type)&&(!dateFilter||m.date===dateFilter);
  });
  document.getElementById('movementBody').innerHTML=list.length?list.map(m=>`<tr><td>${esc(m.date)}</td><td><span class="badge ${m.type}">${m.type}</span></td><td>${esc(m.category)}</td><td>${esc(m.description)}${m.generated?'<small style="display:block;color:var(--muted);margin-top:3px">Generado desde Pedidos</small>':''}</td><td>${esc(m.paymentMethod||'—')}</td><td><strong class="amount ${m.type}">${m.type==='ingreso'?'+':'−'}${money(m.amount)}</strong></td><td>${m.generated?'<span class="badge gold">Pedido</span>':`<div class="row-actions"><button class="delete" data-delete="movements:${m.id}">Eliminar</button></div>`}</td></tr>`).join(''):`<tr><td colspan="7">${empty('No hay movimientos para mostrar.')}</td></tr>`;
  renderAccounts('cobrar','receivableList');renderAccounts('pagar','payableList');
}
function renderAccounts(kind,target){const list=state.accounts.filter(a=>a.kind===kind&&a.status!=='resuelta');document.getElementById(target).innerHTML=list.length?list.map(a=>`<article class="account-card"><span class="badge ${kind==='cobrar'?'income':'expense'}">${kind==='cobrar'?'Por cobrar':'Por pagar'}</span><h3>${esc(a.party)}</h3><div class="amount">${money(a.amount)}</div><p>${esc(a.concept)}</p><footer><span>Vence ${esc(a.dueDate)}</span><button class="text-btn" data-delete="accounts:${a.id}">Marcar resuelta</button></footer></article>`).join(''):empty(kind==='cobrar'?'No hay cuentas por cobrar.':'No hay cuentas por pagar.');}
document.getElementById('movementSearch').addEventListener('input',renderAccounting);document.getElementById('movementDateFilter').addEventListener('change',renderAccounting);document.getElementById('movementTypeFilter').addEventListener('change',renderAccounting);

document.getElementById('accountingTabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;document.querySelectorAll('#accountingTabs button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.dataset.tabPanel===b.dataset.tab))});

function contactTypeLabel(type){return type==='cliente'?'Cliente':type==='proveedor'?'Proveedor':type==='ambos'?'Cliente y proveedor':type||'—'}
function openContactEditor(id){
  const contact=state.contacts.find(c=>c.id===id);
  if(!contact){toast('No se encontró el contacto');return}
  const form=document.getElementById('contactForm');
  form.reset();
  form.elements.contactId.value=contact.id;
  form.elements.name.value=contact.name||'';
  form.elements.type.value=contact.type||'';
  form.elements.phone.value=contact.phone||'';
  form.elements.email.value=contact.email||'';
  form.elements.address.value=contact.address||'';
  form.elements.notes.value=contact.notes||'';
  document.getElementById('contactModalTitle').textContent='Modificar contacto';
  document.getElementById('contactSaveBtn').textContent='Guardar cambios';
  document.getElementById('contactModal').showModal();
}
function renderContacts(){
  const q=document.getElementById('contactSearch').value.toLowerCase(),f=document.getElementById('contactFilter').value;
  const list=state.contacts.filter(c=>[c.name,c.phone,c.email,c.address,c.notes].join(' ').toLowerCase().includes(q)&&(f==='all'||c.type===f||(f!=='ambos'&&c.type==='ambos')));
  document.getElementById('contactBody').innerHTML=list.length?list.map(c=>`<tr class="contact-row" data-contact-edit="${c.id}" title="Abrir y modificar contacto"><td><strong>${esc(c.name)}</strong></td><td><span class="badge gold">${esc(contactTypeLabel(c.type))}</span></td><td>${esc(c.phone||'—')}</td><td>${esc(c.email||'—')}</td><td>${esc(c.address||'—')}</td><td>${esc(c.notes||'—')}</td><td><div class="row-actions"><button type="button" data-contact-edit="${c.id}">Modificar</button><button type="button" class="delete" data-delete="contacts:${c.id}">Eliminar</button></div></td></tr>`).join(''):`<tr><td colspan="7">${empty('No hay contactos para mostrar.')}</td></tr>`;
}
document.getElementById('contactSearch').addEventListener('input',renderContacts);document.getElementById('contactFilter').addEventListener('change',renderContacts);

function populateCatalogCategoryFilter(){
  const select=document.getElementById('productCategoryFilter');
  if(!select)return;
  const previous=select.value||'all';
  const categories=[];const seen=new Set();
  state.products.forEach(p=>{const c=String(p.category||'Sin categoría').trim();const k=c.toLocaleLowerCase('es');if(c&&!seen.has(k)){seen.add(k);categories.push(c)}});
  categories.sort((a,b)=>a.localeCompare(b,'es'));
  select.innerHTML='<option value="all">Todas las categorías</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  select.value=categories.includes(previous)?previous:'all';
}
function getFilteredProducts(){
  const q=(document.getElementById('productSearch')?.value||'').trim().toLocaleLowerCase('es');
  const category=document.getElementById('productCategoryFilter')?.value||'all';
  return state.products.filter(p=>{
    const haystack=[p.name,p.sku,p.category].join(' ').toLocaleLowerCase('es');
    return haystack.includes(q)&&(category==='all'||p.category===category);
  });
}
function renderProducts(){
  populateCatalogCategoryFilter();
  const grid=document.getElementById('productGrid');
  const list=getFilteredProducts();
  grid.innerHTML=list.length?list.map(p=>{const materialCost=productMaterialsCost(p),total=(Number(p.purchaseCost)||0)+(Number(p.extraCost)||0)+materialCost,price=total*(1+(Number(p.markup)||0)/100),gain=price-total;const materialSummary=(p.materials||[]).length?`<div class="product-material-summary"><strong>${p.materials.length} material${p.materials.length===1?'':'es'}:</strong> ${p.materials.map(m=>`${esc(m.name)} (${formatQty(m.quantity)} ${esc(m.unit||'u.')})`).join(' · ')}</div>`:'';return `<article class="product-card"><button class="card-delete" data-delete="products:${p.id}">×</button><p class="eyebrow">${esc(p.category)}</p><h3>${esc(p.name)}</h3><small>${esc(p.sku||'Sin código')}</small><div class="price">${money(price)}</div><small>Precio sugerido</small><div class="product-meta"><div><span>Costo total</span><strong>${money(total)}</strong></div><div><span>Recargo</span><strong>${Number(p.markup)||0}%</strong></div><div><span>Ganancia/u.</span><strong>${money(gain)}</strong></div><div><span>Materiales</span><strong>${money(materialCost)}</strong></div></div>${materialSummary}<div class="product-card-actions"><button class="btn btn-secondary product-edit-btn" data-edit-product="${p.id}">Modificar</button></div></article>`}).join(''):empty(state.products.length?'No hay productos que coincidan con la búsqueda o el filtro.':'Todavía no agregaste productos.');
}
document.getElementById('productSearch').addEventListener('input',renderProducts);
document.getElementById('productCategoryFilter').addEventListener('change',renderProducts);

const statusLabels={pendiente:'Pendiente',preparando:'Preparando',entregado:'Entregado',cancelado:'Cancelado',devuelto:'Devuelto'};
function renderOrders(){
  const statuses=['pendiente','preparando','entregado','cancelado','devuelto'];
  document.getElementById('orderBoard').innerHTML=statuses.map(s=>{
    const list=(state.orders||[]).filter(o=>(o.status||'pendiente')===s);
    return `<section class="order-column"><header><h3>${statusLabels[s]}</h3><span class="count">${list.length}</span></header>${list.map(o=>`<article class="order-card order-card-summary" data-open-order="${esc(o.id)}" tabindex="0" role="button" aria-label="Abrir pedido ${esc(o.code||'')} de ${esc(o.customer||'Cliente')}"><span class="code">${esc(o.code||'Sin número')}</span><strong>${esc(o.customer||'Cliente')}</strong></article>`).join('')||empty('Sin pedidos')}</section>`;
  }).join('');
}


let activeReportKind='inventory';

function csvCell(value){
  const text=String(value??'');
  return `"${text.replace(/"/g,'""')}"`;
}
function downloadCsv(filename,headers,rows){
  const lines=[headers,...rows].map(row=>row.map(csvCell).join(';'));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
function reportHtml(title,subtitle,summaryHtml,tableHtml){
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)} · ZAMAT</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172e26;margin:30px}h1{font-family:Georgia,serif;letter-spacing:.12em;margin:0;color:#172e26}h2{font-family:Georgia,serif;margin:8px 0 0}.brand{border-bottom:2px solid #bb9b5e;padding-bottom:14px;margin-bottom:20px}.brand small{color:#607a61}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 20px}.summary div{border:1px solid #ded9cd;border-radius:10px;padding:10px 12px;min-width:150px}.summary span{display:block;color:#718078;font-size:11px;text-transform:uppercase}.summary strong{display:block;margin-top:4px;font-size:16px}table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0 26px}th,td{border-bottom:1px solid #ded9cd;padding:8px;text-align:left;vertical-align:top}th{background:#f3efe5;text-transform:uppercase;font-size:10px;letter-spacing:.05em}.section-title{font-family:Georgia,serif;font-size:18px;margin:24px 0 8px}.muted{color:#718078}.footer{margin-top:24px;border-top:1px solid #ded9cd;padding-top:10px;color:#718078;font-size:10px}@media print{body{margin:12mm}.no-print{display:none}thead{display:table-header-group}tr{break-inside:avoid}}
  </style></head><body><div class="brand"><h1>ZAMAT</h1><h2>${esc(title)}</h2><small>${esc(subtitle)}</small></div>${summaryHtml}${tableHtml}<div class="footer">Generado el ${new Intl.DateTimeFormat('es-CO',{dateStyle:'long',timeStyle:'short'}).format(new Date())}</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`;
}
function openPrintReport(html){
  const w=window.open('','_blank','width=1100,height=800');
  if(!w){toast('Permití las ventanas emergentes para imprimir.');return}
  w.document.open();w.document.write(html);w.document.close();
}
function getFilteredInventoryForExport(){
  const q=document.getElementById('inventorySearch').value.toLowerCase();
  const filter=document.getElementById('inventoryFilter').value;
  return state.inventory.filter(i=>(i.name+i.category+(i.supplier||'')).toLowerCase().includes(q)&&(filter!=='low'||i.stock<=i.minStock));
}
function getFilteredMaterialsForExport(){
  const q=document.getElementById('materialSearch').value.toLowerCase();
  const filter=document.getElementById('materialFilter').value;
  return (state.materials||[]).filter(m=>(m.name+m.category+(m.supplier||'')+(m.unit||'')).toLowerCase().includes(q)&&(filter!=='low'||m.quantity<=m.minQuantity));
}
function getFilteredMovementsForExport(){
  const q=document.getElementById('movementSearch').value.toLowerCase().trim();
  const type=document.getElementById('movementTypeFilter').value;
  const dateFilter=document.getElementById('movementDateFilter').value;
  return [...getFinancialMovements()].sort((a,b)=>b.date.localeCompare(a.date)).filter(m=>{
    const searchable=[m.date,m.description,m.category,m.paymentMethod||'',m.type,m.source||''].join(' ').toLowerCase();
    return searchable.includes(q)&&(type==='all'||m.type===type)&&(!dateFilter||m.date===dateFilter);
  });
}
function printInventoryReport(){
  const articles=getFilteredInventoryForExport(),materials=getFilteredMaterialsForExport();
  const total=articles.reduce((s,i)=>s+(Number(i.stock)||0)*(Number(i.unitCost)||0),0)+materials.reduce((s,m)=>s+(Number(m.quantity)||0)*(Number(m.unitCost)||0),0);
  const low=articles.filter(i=>i.stock<=i.minStock).length+materials.filter(m=>m.quantity<=m.minQuantity).length;
  const summary=`<div class="summary"><div><span>Artículos</span><strong>${articles.length}</strong></div><div><span>Materiales</span><strong>${materials.length}</strong></div><div><span>Valor total</span><strong>${money(total)}</strong></div><div><span>Stock bajo</span><strong>${low}</strong></div></div>`;
  const articleRows=articles.length?articles.map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.category)}</td><td>${formatQty(i.stock)}</td><td>${money(i.unitCost)}</td><td>${money(i.stock*i.unitCost)}</td><td>${esc(i.supplier||'—')}</td><td>${i.stock<=i.minStock?'Stock bajo':'Disponible'}</td></tr>`).join(''):'<tr><td colspan="7" class="muted">Sin artículos para mostrar.</td></tr>';
  const materialRows=materials.length?materials.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${formatQty(m.quantity)} ${esc(unitLabel(m.unit,m.quantity))}</td><td>${money(m.unitCost)} / ${esc(m.unit)}</td><td>${money(m.quantity*m.unitCost)}</td><td>${esc(m.supplier||'—')}</td><td>${m.quantity<=m.minQuantity?'Stock bajo':'Disponible'}</td></tr>`).join(''):'<tr><td colspan="7" class="muted">Sin materiales para mostrar.</td></tr>';
  const tables=`<div class="section-title">Artículos</div><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Stock</th><th>Costo</th><th>Valor</th><th>Proveedor</th><th>Estado</th></tr></thead><tbody>${articleRows}</tbody></table><div class="section-title">Materiales</div><table><thead><tr><th>Material</th><th>Categoría</th><th>Cantidad</th><th>Costo / medida</th><th>Valor</th><th>Proveedor</th><th>Estado</th></tr></thead><tbody>${materialRows}</tbody></table>`;
  openPrintReport(reportHtml('Inventario','Artículos y materiales registrados',summary,tables));
}
function downloadInventoryCsv(){
  const articles=getFilteredInventoryForExport(),materials=getFilteredMaterialsForExport();
  const rows=[
    ...articles.map(i=>['Artículo',i.name,i.category,i.stock,'unidad',i.unitCost,i.stock*i.unitCost,i.supplier||'',i.stock<=i.minStock?'Stock bajo':'Disponible']),
    ...materials.map(m=>['Material',m.name,m.category,m.quantity,m.unit||'',m.unitCost,m.quantity*m.unitCost,m.supplier||'',m.quantity<=m.minQuantity?'Stock bajo':'Disponible'])
  ];
  downloadCsv(`zamat-inventario-${today()}.csv`,['Tipo','Nombre','Categoría','Cantidad','Unidad','Costo unitario','Valor total','Proveedor','Estado'],rows);
}
function printMovementsReport(){
  const list=getFilteredMovementsForExport();
  const income=list.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(Number(m.amount)||0),0),expense=list.filter(m=>m.type==='egreso').reduce((s,m)=>s+(Number(m.amount)||0),0);
  const summary=`<div class="summary"><div><span>Movimientos</span><strong>${list.length}</strong></div><div><span>Ingresos</span><strong>${money(income)}</strong></div><div><span>Egresos</span><strong>${money(expense)}</strong></div><div><span>Balance</span><strong>${money(income-expense)}</strong></div></div>`;
  const rows=list.length?list.map(m=>`<tr><td>${esc(m.date)}</td><td>${esc(m.type)}</td><td>${esc(m.category)}</td><td>${esc(m.description)}</td><td>${esc(m.paymentMethod||'—')}</td><td>${money(m.amount)}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">Sin movimientos para mostrar.</td></tr>';
  const table=`<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th>Medio de pago</th><th>Monto</th></tr></thead><tbody>${rows}</tbody></table>`;
  openPrintReport(reportHtml('Movimientos financieros','El reporte respeta los filtros activos de búsqueda, fecha y tipo.',summary,table));
}
function downloadMovementsCsv(){
  const list=getFilteredMovementsForExport();
  downloadCsv(`zamat-movimientos-${today()}.csv`,['Fecha','Tipo','Categoría','Descripción','Medio de pago','Monto'],list.map(m=>[m.date,m.type,m.category,m.description,m.paymentMethod||'',m.amount]));
}
function printCatalogReport(){
  const products=getFilteredProducts();
  const estimatedValue=products.reduce((s,p)=>{const total=(Number(p.purchaseCost)||0)+(Number(p.extraCost)||0)+productMaterialsCost(p);return s+total*(1+(Number(p.markup)||0)/100)},0);
  const summary=`<div class="summary"><div><span>Productos</span><strong>${products.length}</strong></div><div><span>Suma de precios sugeridos</span><strong>${money(estimatedValue)}</strong></div></div>`;
  const rows=products.length?products.map(p=>{const materialCost=productMaterialsCost(p),total=(Number(p.purchaseCost)||0)+(Number(p.extraCost)||0)+materialCost,price=total*(1+(Number(p.markup)||0)/100),gain=price-total;return `<tr><td>${esc(p.sku||'—')}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(materialCost)}</td><td>${money(total)}</td><td>${Number(p.markup)||0}%</td><td>${money(price)}</td><td>${money(gain)}</td></tr>`}).join(''):'<tr><td colspan="8" class="muted">Sin productos para mostrar.</td></tr>';
  const table=`<table><thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th>Materiales</th><th>Costo total</th><th>Recargo</th><th>Precio sugerido</th><th>Ganancia estimada</th></tr></thead><tbody>${rows}</tbody></table>`;
  openPrintReport(reportHtml('Catálogo','Productos y precios sugeridos',summary,table));
}
function downloadCatalogCsv(){
  const rows=getFilteredProducts().map(p=>{const materialCost=productMaterialsCost(p),total=(Number(p.purchaseCost)||0)+(Number(p.extraCost)||0)+materialCost,price=total*(1+(Number(p.markup)||0)/100),gain=price-total;const materials=(p.materials||[]).map(m=>`${m.name}: ${formatQty(m.quantity)} ${m.unit||''}`).join(' | ');return [p.sku||'',p.name,p.category,p.purchaseCost,p.extraCost,materialCost,materials,total,p.markup,price,gain]});
  downloadCsv(`zamat-catalogo-${today()}.csv`,['SKU','Producto','Categoría','Costo base','Costos extra','Costo materiales','Materiales utilizados','Costo total','Recargo %','Precio sugerido','Ganancia estimada'],rows);
}
function openReportExport(kind){
  activeReportKind=kind;
  const modal=document.getElementById('reportExportModal');
  const title=document.getElementById('reportExportTitle');
  const desc=document.getElementById('reportExportDescription');
  if(kind==='inventory'){title.textContent='Inventario';desc.textContent='Podés imprimir o guardar como PDF el inventario, o descargar sus datos en CSV. Se respetan los filtros actuales de artículos y materiales.'}
  if(kind==='movements'){title.textContent='Movimientos financieros';desc.textContent='Podés imprimir o guardar como PDF los movimientos, o descargarlos en CSV. Se respetan los filtros activos.'}
  if(kind==='catalog'){title.textContent='Catálogo';desc.textContent='Podés imprimir o guardar como PDF el catálogo, o descargar sus datos en CSV. Se respetan la búsqueda y la categoría seleccionada.'}
  modal.showModal();
}
document.getElementById('inventoryExportBtn').addEventListener('click',()=>openReportExport('inventory'));
document.getElementById('movementsExportBtn').addEventListener('click',()=>openReportExport('movements'));
document.getElementById('catalogExportBtn').addEventListener('click',()=>openReportExport('catalog'));
document.getElementById('reportExportClose').addEventListener('click',()=>document.getElementById('reportExportModal').close());
document.getElementById('reportPrintBtn').addEventListener('click',()=>{
  document.getElementById('reportExportModal').close();
  if(activeReportKind==='inventory')printInventoryReport();
  if(activeReportKind==='movements')printMovementsReport();
  if(activeReportKind==='catalog')printCatalogReport();
});
document.getElementById('reportCsvBtn').addEventListener('click',()=>{
  document.getElementById('reportExportModal').close();
  if(activeReportKind==='inventory')downloadInventoryCsv();
  if(activeReportKind==='movements')downloadMovementsCsv();
  if(activeReportKind==='catalog')downloadCatalogCsv();
});

function renderSettings(){
  state.settings={...defaultState.settings,...state.settings,businessName:'ZAMAT',currency:'COP'};
  document.getElementById('pageEyebrow').textContent='ZAMAT';
  const user=getCurrentUser();
  document.getElementById('currentUserName').textContent=user?.fullName||user?.username||'—';
  const currentUsername=document.getElementById('currentUsername');
  if(currentUsername) currentUsername.textContent=user?.username?`Usuario: ${user.username}`:'—';
  document.getElementById('currentUserEmail').textContent=user?.email||'—';
  document.getElementById('currentUserRole').textContent=normalizeRole(user?.role);
  document.getElementById('currentUserLastLogin').textContent=formatLoginDate(user?.lastLogin);
  const status=document.getElementById('currentUserStatus');
  status.textContent=user?.active===false?'Inactivo':'Activo';
  status.className=`badge ${user?.active===false?'expense':'income'}`;
  refreshSessionUi();

  const superAdmin=isSuperAdmin(user), admin=isAdministrator(user), canCreate=canCreateUsers(user);
  const newUserBtn=document.getElementById('newUserBtn');
  if(newUserBtn) newUserBtn.hidden=!canCreate;
  const help=document.getElementById('usersManagementHelp');
  if(help){
    help.textContent=superAdmin
      ?'Podés crear usuarios, bloquear o desbloquear cuentas, resetear contraseñas y eliminar cuentas desde Supabase.'
      :admin
        ?'Podés crear cuentas de tipo Usuario. Las cuentas Superadministrador y sus datos permanecen completamente ocultos.'
        :'La administración de cuentas está restringida.';
  }

  const visibleUsers=[...(state.users||[])]
    .filter(u=>superAdmin || !isSuperAdmin(u))
    .sort((a,b)=>String(a.fullName||a.username).localeCompare(String(b.fullName||b.username),'es'));
  document.getElementById('usersBody').innerHTML=visibleUsers.length?visibleUsers.map(u=>{
    const current=String(u.id)===String(user?.id);
    let action='<span class="user-current">Solo lectura</span>';
    if(superAdmin){
      if(current) action='<span class="user-current">Sesión actual</span>';
      else action=`<button class="${u.active===false?'user-toggle-on':'user-toggle-off'}" data-user-toggle="${u.id}">${u.active===false?'Desbloquear':'Bloquear'}</button><button class="user-reset" data-user-reset="${u.id}">Resetear contraseña</button><button class="user-delete" data-user-delete="${u.id}">Eliminar</button>`;
    }else if(admin){
      action=current?'<span class="user-current">Sesión actual</span>':'<span class="user-current">Sin acciones</span>';
    }
    return `<tr><td><strong>${esc(u.fullName||u.username||'—')}</strong></td><td>${esc(u.username||'—')}</td><td><span class="badge gold">${esc(normalizeRole(u.role))}</span></td><td>${esc(u.email||'—')}</td><td><span class="badge ${u.active===false?'expense':'income'}">${u.active===false?'Inactivo':'Activo'}</span></td><td>${esc(formatLoginDate(u.lastLogin))}</td><td><div class="user-actions">${action}</div></td></tr>`;
  }).join(''):`<tr><td colspan="7">${empty('No hay usuarios registrados.')}</td></tr>`;
}

document.addEventListener('click',async e=>{
  const del=e.target.closest('[data-delete]'); if(del){
    const [key,id]=del.dataset.delete.split(':');
    if(key==='orders'){const order=(state.orders||[]).find(o=>String(o.id)===String(id));if(order&&order.status!=='pendiente'){toast('Solo se pueden eliminar pedidos Pendientes');return}}
    if(key==='movements'){
      const movement=(state.movements||[]).find(m=>String(m.id)===String(id));
      if(movement?.generated){toast('Los movimientos generados por Pedidos se administran desde el pedido correspondiente.');return}
      const {error}=await supabaseClient.rpc('zamat_finance_delete_manual_movement',{p_id:id});
      if(error){toast(remoteErrorMessage(error,'No fue posible eliminar el movimiento.'));return}
      await loadSupabaseBusinessData();save();toast('Movimiento eliminado');return;
    }
    if(key==='accounts'){
      const {error}=await supabaseClient.rpc('zamat_finance_resolve_account',{p_id:id});
      if(error){toast(remoteErrorMessage(error,'No fue posible resolver la cuenta.'));return}
      await loadSupabaseBusinessData();save();toast('Cuenta resuelta');return;
    }
    if(['contacts','inventory','materials','products','orders'].includes(key)){
      const table=key==='contacts'?'contacts':key==='inventory'?'inventory_articles':key==='materials'?'materials':key==='products'?'products':'orders';
      const {error}=await supabaseClient.from(table).delete().eq('id',id);
      if(error){toast(remoteErrorMessage(error,'No fue posible eliminar el registro.'));return}
      await loadSupabaseBusinessData();save();toast(key==='orders'?'Pedido eliminado':'Registro eliminado');return;
    }
    state[key]=state[key].filter(x=>x.id!==id);save();toast(key==='accounts'?'Cuenta resuelta':'Registro eliminado');return
  }
  const contactEdit=e.target.closest('[data-contact-edit]');if(contactEdit){openContactEditor(contactEdit.dataset.contactEdit);return}
  const adjust=e.target.closest('[data-open-adjust]');if(adjust){openInventoryAdjustModal(adjust.dataset.openAdjust);return}
});
function updateOrderRefundControls(){
  const form=document.getElementById('orderDetailsForm');
  const box=document.getElementById('orderRefundBox');
  if(!form||!box) return;
  const isReturn=form.elements.status.value==='devuelto';
  const order=(state.orders||[]).find(o=>String(o.id)===String(form.elements.orderId.value));
  const total=Number(order?.total)||0;
  const selectedPayment=form.elements.payment.value||'pendiente';
  const received=resolvePaidAmount(selectedPayment,total,form.elements.paidAmount.value);
  const shouldRefund=isReturn&&received>0;
  box.classList.toggle('is-hidden',!shouldRefund);
  if(!shouldRefund) return;
  const type=form.elements.refundType.value||'completa';
  const amount=form.elements.refundAmount;
  amount.max=String(received);
  amount.readOnly=type==='completa';
  if(type==='completa') amount.value=String(received);
  else if((Number(amount.value)||0)>received) amount.value=String(received);
  document.getElementById('orderRefundPreview').textContent=money(Number(amount.value)||0);
}

document.getElementById('orderPayment').addEventListener('change',()=>{updateNewOrderPartialPayment();});
document.getElementById('orderPaidAmount').addEventListener('input',updateNewOrderPartialPayment);
document.getElementById('orderDetailsPayment').addEventListener('change',()=>{updateOrderDetailsPartialPayment();updateOrderRefundControls();});
document.getElementById('orderDetailsPaidAmount').addEventListener('input',()=>{updateOrderDetailsPartialPayment();updateOrderRefundControls();});
document.getElementById('orderDetailsStatus').addEventListener('change',updateOrderRefundControls);
document.getElementById('orderRefundType').addEventListener('change',updateOrderRefundControls);
document.getElementById('orderRefundAmount').addEventListener('input',updateOrderRefundControls);

document.getElementById('orderProductsList').addEventListener('change',e=>{
  const check=e.target.closest('.order-product-check');
  if(check){const row=check.closest('[data-order-product-row]');const qty=row?.querySelector('.order-product-quantity');if(qty)qty.disabled=!check.checked;document.getElementById('orderProductsError').classList.add('is-hidden');updateOrderTotal()}
});
document.getElementById('orderProductsList').addEventListener('input',e=>{if(e.target.closest('.order-product-quantity'))updateOrderTotal()});
document.getElementById('orderBoard').addEventListener('keydown',e=>{const card=e.target.closest('[data-open-order]');if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openOrderDetails(card.dataset.openOrder)}});
document.getElementById('orderDeleteBtn').addEventListener('click',async()=>{
  const id=document.getElementById('orderDetailsId').value;
  const order=(state.orders||[]).find(o=>String(o.id)===String(id));
  if(!order){toast('No se encontró el pedido');return}
  if((order.status||'pendiente')!=='pendiente'){toast('Solo se pueden eliminar pedidos Pendientes');return}
  if(!confirm(`¿Eliminar el pedido ${order.code||''}?`))return;
  const {error}=await supabaseClient.from('orders').delete().eq('id',id);
  if(error){toast(remoteErrorMessage(error,'No fue posible eliminar el pedido.'));return}
  document.getElementById('orderDetailsModal').close();
  await loadSupabaseBusinessData();save();toast('Pedido eliminado');
});

document.getElementById('setupAdminForm').addEventListener('submit',e=>{e.preventDefault();setAuthError('setupAdminError','La cuenta principal se administra desde Supabase.');});

document.getElementById('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();setAuthError('loginError','');
  const fd=new FormData(e.currentTarget),key=String(fd.get('username')||'').trim(),password=String(fd.get('password')||'');
  const submit=e.currentTarget.querySelector('button[type="submit"]');
  if(submit){submit.disabled=true;submit.textContent='Ingresando…'}
  const result=await loginUser(key,password);
  if(submit){submit.disabled=false;submit.textContent='Ingresar'}
  if(!result.ok)setAuthError('loginError',result.message);
});

document.getElementById('forgotPasswordBtn').addEventListener('click',()=>{
  const d=document.getElementById('recoveryModal');d.querySelector('form').reset();setAuthError('recoveryError','');d.showModal();
});

document.getElementById('recoveryForm').addEventListener('submit',async e=>{
  e.preventDefault();setAuthError('recoveryError','');
  const fd=new FormData(e.currentTarget),username=String(fd.get('username')||'').trim(),email=normalizeEmail(fd.get('email'));
  const submit=e.currentTarget.querySelector('button[type="submit"]');if(submit){submit.disabled=true;submit.textContent='Enviando…'}
  try{
    const result=await requestPasswordRecovery(username,email);
    discardDialogDraft(document.getElementById('recoveryModal'));
    alert(result?.message||'Si los datos coinciden con una cuenta activa, recibirás un correo de recuperación.');
  }catch(error){setAuthError('recoveryError',error?.message||'No fue posible solicitar la recuperación.');}
  finally{if(submit){submit.disabled=false;submit.textContent='Enviar enlace'}}
});

document.getElementById('newUserFullName')?.addEventListener('input',e=>{
  const target=document.getElementById('newUserUsername');if(target)target.value=generateUsernameFromFullName(e.target.value);
});
document.getElementById('profileFullName')?.addEventListener('input',e=>{
  const user=getCurrentUser(),target=document.getElementById('profileUsername');if(target)target.value=usernameForUserName(e.target.value,user);
});

document.getElementById('logoutBtn').addEventListener('click',async()=>{await supabaseClient.auth.signOut();currentAuthProfile=null;state.users=[];sessionStorage.removeItem(SESSION_KEY);showLoginScreen()});

document.getElementById('newUserBtn').addEventListener('click',()=>{
  const current=getCurrentUser();if(!canCreateUsers(current)){toast('No tenés permisos para crear usuarios');return}
  const d=document.getElementById('newUserModal'),form=d.querySelector('form');form.reset();setAuthError('newUserError','');
  const generatedUsername=document.getElementById('newUserUsername');if(generatedUsername)generatedUsername.value='';
  const roleSelect=document.getElementById('newUserRole'),roleHelp=document.getElementById('newUserRoleHelp');
  if(isSuperAdmin(current)){
    [...roleSelect.options].forEach(o=>o.hidden=false);roleSelect.value='Usuario';roleSelect.disabled=false;
    roleHelp.textContent='El Superadministrador puede crear Usuario, Administrador o Superadministrador.';
  }else{
    roleSelect.value='Usuario';roleSelect.disabled=true;
    roleHelp.textContent='Los administradores solo pueden crear cuentas de tipo Usuario.';
  }
  d.showModal();
});

document.getElementById('newUserForm').addEventListener('submit',async e=>{
  e.preventDefault();setAuthError('newUserError','');
  const current=getCurrentUser();if(!canCreateUsers(current)){setAuthError('newUserError','No tenés permisos para crear usuarios.');return}
  const fd=new FormData(e.currentTarget),fullName=String(fd.get('fullName')||'').trim(),email=normalizeEmail(fd.get('email')),password=String(fd.get('password')||''),confirm=String(fd.get('confirmPassword')||'');
  let requestedRole=isSuperAdmin(current)?normalizeRole(fd.get('role')):'Usuario';
  if(!fullName){setAuthError('newUserError','El nombre de la persona es obligatorio.');return}
  const username=generateUsernameFromFullName(fullName);if(!username){setAuthError('newUserError','Ingresá al menos un nombre y un apellido válidos para generar el usuario.');return}
  if(password.length<6){setAuthError('newUserError','La contraseña debe tener al menos 6 caracteres.');return}
  if(password!==confirm){setAuthError('newUserError','Las contraseñas no coinciden.');return}
  const submit=document.getElementById('newUserSaveBtn');if(submit){submit.disabled=true;submit.textContent='Creando…'}
  try{
    const result=await invokeUserAdmin({action:'create',fullName,email,password,role:requestedRole});
    await loadVisibleProfiles();renderAll();discardDialogDraft(document.getElementById('newUserModal'));toast(`Usuario ${result.username||username} creado`);
  }catch(error){setAuthError('newUserError',error?.message||'No fue posible crear el usuario.');}
  finally{if(submit){submit.disabled=false;submit.textContent='Crear usuario'}}
});

document.getElementById('usersBody').addEventListener('click',async e=>{
  const current=getCurrentUser();
  const toggle=e.target.closest('[data-user-toggle]');
  const reset=e.target.closest('[data-user-reset]');
  const del=e.target.closest('[data-user-delete]');
  if(!toggle&&!reset&&!del)return;
  if(!isSuperAdmin(current)){toast('Solo el Superadministrador puede realizar esta acción');return}
  const id=(toggle?.dataset.userToggle||reset?.dataset.userReset||del?.dataset.userDelete);
  const target=(state.users||[]).find(u=>String(u.id)===String(id));if(!target)return;
  if(String(target.id)===String(current.id)){toast('Esta acción no está disponible sobre tu propia sesión');return}
  if(toggle){
    try{await invokeUserAdmin({action:'toggle-active',userId:id,active:target.active===false});await loadVisibleProfiles();renderSettings();toast(target.active===false?'Cuenta desbloqueada':'Cuenta bloqueada')}catch(error){toast(error?.message||'No fue posible cambiar el estado')}
    return;
  }
  if(reset){
    const d=document.getElementById('adminPasswordResetModal'),form=document.getElementById('adminPasswordResetForm');form.reset();
    document.getElementById('adminPasswordResetUserId').value=target.id;
    document.getElementById('adminPasswordResetUserName').textContent=target.fullName?`${target.fullName} (${target.username})`:(target.username||'este usuario');
    setAuthError('adminPasswordResetError','');d.showModal();return;
  }
  if(del){
    if(!confirm(`¿Eliminar definitivamente la cuenta de ${target.fullName||target.username}?`))return;
    try{await invokeUserAdmin({action:'delete',userId:id});await loadVisibleProfiles();renderSettings();toast('Cuenta eliminada')}catch(error){toast(error?.message||'No fue posible eliminar la cuenta')}
  }
});

document.getElementById('adminPasswordResetForm').addEventListener('submit',async e=>{
  e.preventDefault();setAuthError('adminPasswordResetError','');
  const current=getCurrentUser();if(!isSuperAdmin(current)){setAuthError('adminPasswordResetError','Solo el Superadministrador puede resetear contraseñas.');return}
  const fd=new FormData(e.currentTarget),id=String(fd.get('userId')||''),password=String(fd.get('password')||''),confirm=String(fd.get('confirmPassword')||'');
  if(password.length<6){setAuthError('adminPasswordResetError','La contraseña debe tener al menos 6 caracteres.');return}
  if(password!==confirm){setAuthError('adminPasswordResetError','Las contraseñas no coinciden.');return}
  try{await invokeUserAdmin({action:'reset-password',userId:id,password});discardDialogDraft(document.getElementById('adminPasswordResetModal'));toast('Contraseña reseteada')}catch(error){setAuthError('adminPasswordResetError',error?.message||'No fue posible resetear la contraseña.')}
});

document.getElementById('editMyUserBtn').addEventListener('click',()=>{
  const user=getCurrentUser();if(!user)return;
  const d=document.getElementById('profileModal'),form=document.getElementById('profileForm');form.reset();form.elements.fullName.value=user.fullName||user.username||'';form.elements.username.value=user.username||'';form.elements.email.value=user.email||'';
  const help=document.getElementById('profileUsernameHelp');if(help)help.textContent=isPrimarySuperAdmin(user)?'El usuario del Superadministrador principal permanece como Tripers.':'Se actualiza automáticamente si modificás el nombre de la persona.';
  setAuthError('profileError','');d.showModal();
});

document.getElementById('profileForm').addEventListener('submit',async e=>{
  e.preventDefault();setAuthError('profileError','');
  const user=getCurrentUser();if(!user)return;
  const fd=new FormData(e.currentTarget),fullName=String(fd.get('fullName')||'').trim(),email=normalizeEmail(fd.get('email')),password=String(fd.get('password')||''),confirm=String(fd.get('confirmPassword')||'');
  if(!fullName){setAuthError('profileError','El nombre de la persona es obligatorio.');return}
  if(password&&password.length<6){setAuthError('profileError','La nueva contraseña debe tener al menos 6 caracteres.');return}
  if(password!==confirm){setAuthError('profileError','Las contraseñas no coinciden.');return}
  try{
    const result=await invokeUserAdmin({action:'update-self',fullName,email,password});
    if(result?.profile) currentAuthProfile=mapProfile(result.profile);
    await loadVisibleProfiles();renderAll();discardDialogDraft(document.getElementById('profileModal'));toast('Datos de usuario actualizados');
  }catch(error){setAuthError('profileError',error?.message||'No fue posible actualizar los datos.')}
});

document.getElementById('recoveryPasswordForm').addEventListener('submit',async e=>{
  e.preventDefault();setAuthError('recoveryPasswordError','');
  const fd=new FormData(e.currentTarget),password=String(fd.get('password')||''),confirm=String(fd.get('confirmPassword')||'');
  if(password.length<6){setAuthError('recoveryPasswordError','La contraseña debe tener al menos 6 caracteres.');return}
  if(password!==confirm){setAuthError('recoveryPasswordError','Las contraseñas no coinciden.');return}
  const {error}=await supabaseClient.auth.updateUser({password});
  if(error){setAuthError('recoveryPasswordError',error.message);return}
  discardDialogDraft(document.getElementById('recoveryPasswordModal'));
  await supabaseClient.auth.signOut();currentAuthProfile=null;sessionStorage.removeItem(SESSION_KEY);showLoginScreen();
  alert('Contraseña actualizada. Ya podés iniciar sesión con tu nueva contraseña.');
});

document.addEventListener('click',e=>{
  const logout=e.target.closest('[data-logout]');if(logout){supabaseClient.auth.signOut();currentAuthProfile=null;state.users=[];sessionStorage.removeItem(SESSION_KEY);showLoginScreen()}
});

document.getElementById('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`zamat-respaldo-${today()}.json`;a.click();URL.revokeObjectURL(a.href)};

function renderAll(){renderHome();renderSummary();renderInventory();renderMaterials();renderAccounting();renderContacts();renderProducts();renderOrders();renderSettings()}
supabaseClient.auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY'){
    document.getElementById('appShell').hidden=true;
    document.getElementById('authScreen').hidden=false;
    setTimeout(()=>{const modal=document.getElementById('recoveryPasswordModal');if(modal&&!modal.open){modal.querySelector('form')?.reset();setAuthError('recoveryPasswordError','');modal.showModal();}},0);
  }
});
renderAll();
initAuth();


// PWA · V0.1.0
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('Service Worker:', err));
  });
}
