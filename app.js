// 1. CONFIGURACIÓN (Tus datos reales de Supabase)
const SUPABASE_URL = 'https://vlamavpgduxorqehxbbg.supabase.co'; 
const SUPABASE_PUBLIC_KEY = 'sb_publishable_Iq9R03VlMk6Slp5-_sCnCA_SpBnO37m';

// Usamos window.supabase para asegurar la conexión
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);

const $ = id => document.getElementById(id);
const estado = mensaje => $('estado').textContent = mensaje;

const entidades = ['participantes','instructores','talleres','horarios','inscripciones'];
const cache = Object.fromEntries(entidades.map(t => [t, []]));
const nombres = {participantes:'Participantes',instructores:'Instructores',talleres:'Talleres',horarios:'Horarios',inscripciones:'Inscripciones'};
const formularios = Object.fromEntries(entidades.map(t => [t, $('form' + nombres[t])]));

const datosFormulario = f => Object.fromEntries(new FormData(f).entries());

// 2. VERIFICAR SESIÓN (Corregido para que no salga el error al inicio)
async function verificarSession() {
  const { data: { session } } = await db.auth.getSession();
  const user = session?.user;
  
  $('panelAcceso').hidden = Boolean(user);
  $('app').hidden = !user;
  $('usuarioActual').textContent = user ? 'Sesión: ' + user.email : "";
  
  if(user) {
    await cargarTodo();
  } else {
    estado(''); // Limpia mensajes al cerrar sesión o iniciar
  }
}

// 3. LOGIN (Corregido el error del botón)
$('formAcceso').addEventListener('submit', async ev => {
  ev.preventDefault();
  estado('Iniciando sesión...');
  
  // Guardamos el formulario ANTES de hacer la petición asíncrona
  const formulario = ev.currentTarget; 
  const {email, password} = datosFormulario(formulario);
  
  const {error} = await db.auth.signInWithPassword({email, password});
  
  if(error) {
    return estado('Acceso: ' + error.message);
  }
  
  formulario.reset();
  await verificarSession();
  estado('Sesión iniciada correctamente.');
});

// 4. LOGOUT
$('salir').addEventListener('click', async () => {
  await db.auth.signOut();
  entidades.forEach(t => cache[t] = []);
  await verificarSession();
});

$('actualizar').addEventListener('click', cargarTodo);

// 5. CONSULTAS A SUPABASE
async function consultar(tabla) {
  const {data, error} = await db.from(tabla).select('*').order('id', {ascending: true});
  if(error) throw Error(tabla + ': ' + error.message);
  cache[tabla] = data;
}

async function cargarTodo() {
  try {
    for(const t of entidades) await consultar(t);
    actualizarSelects(); 
    entidades.forEach(pintar);
    estado('Datos actualizados desde Supabase.');
  } catch(e) {
    estado('Error de conexión o permisos: ' + e.message);
  }
}

// 6. LLENAR SELECTS Y PINTAR LISTAS
function opciones(select, items, titulo) {
  const previo = select.value;
  select.replaceChildren(new Option(titulo, ''));
  items.forEach(x => select.add(new Option(x.etiqueta, String(x.id))));
  if([...select.options].some(o => o.value === previo)) select.value = previo;
}

function actualizarSelects() {
  opciones($('selInstructor'), cache.instructores.map(x => ({id:x.id, etiqueta:x.nombre})), 'Seleccione instructor');
  opciones($('selParticipante'), cache.participantes.map(x => ({id:x.id, etiqueta:x.nombre})), 'Seleccione participante');
  document.querySelectorAll('.selTaller').forEach(s => opciones(s, cache.talleres.map(x => ({id:x.id, etiqueta:x.nombre})), 'Seleccione taller'));
}

function descripcion(t, r) {
  const buscar = (tabla, id) => cache[tabla].find(x => x.id === id)?.nombre || 'ID ' + id;
  if(t === 'participantes') return `${r.nombre} - ${r.correo} - ${r.telefono || 'Sin teléfono'}`;
  if(t === 'instructores') return `${r.nombre} - ${r.especialidad} - ${r.correo}`;
  if(t === 'talleres') return `${r.nombre} - ${r.categoria} - ${r.cupos} cupos - ${buscar('instructores', r.instructor_id)}`;
  if(t === 'horarios') return `${buscar('talleres', r.taller_id)} - ${r.dia} ${r.hora} - ${r.ambiente}`;
  return `${buscar('participantes', r.participante_id)} - ${buscar('talleres', r.taller_id)} - ${r.fecha}`;
}

function pintar(t) {
  const contenedor = $('lista' + nombres[t]); 
  contenedor.replaceChildren();
  if(!cache[t].length) {
    contenedor.textContent = 'Sin registros.';
    return;
  }
  cache[t].forEach(r => {
    const fila = document.createElement('div'); 
    fila.className = 'registro';
    const texto = document.createElement('span'); 
    texto.textContent = descripcion(t, r);
    const botones = document.createElement('div');
    
    const editor = document.createElement('button'); 
    editor.type = 'button'; 
    editor.textContent = 'Editar';
    editor.addEventListener('click', () => cargarEdicion(t, r.id));
    
    const borrar = document.createElement('button'); 
    borrar.type = 'button'; 
    borrar.textContent = 'Eliminar';
    borrar.addEventListener('click', () => eliminar(t, r.id));
    
    botones.append(editor, borrar);
    fila.append(texto, botones);
    contenedor.append(fila);
  });
}

// 7. EDICIÓN, ELIMINACIÓN Y GUARDADO
function cargarEdicion(t, id) {
  const r = cache[t].find(x => x.id === id), f = formularios[t];
  if(!r) return;
  Object.keys(r).forEach(k => {
    if(f.elements.namedItem(k)) f.elements.namedItem(k).value = r[k] ?? '';
  });
  f.scrollIntoView({behavior:'smooth', block:'center'});
  estado(`Editando ${t} #${id}. Pulse Guardar para confirmar.`);
}

async function eliminar(t, id) {
  if(!confirm(`¿Eliminar este registro de ${t}?`)) return;
  const {error} = await db.from(t).delete().eq('id', id);
  if(error) return estado('No se pudo eliminar: ' + error.message + ' (revise relaciones)');
  await cargarTodo(); 
  estado('Registro eliminado.');
}

async function guardar(t, f) {
  const v = datosFormulario(f), id = v.id; 
  delete v.id;
  
  for(const k of Object.keys(v)) {
    if(typeof v[k] === 'string') v[k] = v[k].trim();
  }
  
  if(t === 'participantes' && v.telefono === '') v.telefono = null;
  
  for(const k of ['cupos','instructor_id','taller_id','participante_id']) {
    if(v[k] != null) v[k] = Number(v[k]);
  }

  // Control de cupos
  if(t === 'inscripciones') {
    const taller = cache.talleres.find(x => x.id == v.taller_id);
    const ocupados = cache.inscripciones.filter(x => x.taller_id == v.taller_id && String(x.id) != String(id)).length;
    if(taller && ocupados >= taller.cupos) return estado('No hay cupos disponibles.');
  }

  const consulta = id ? db.from(t).update(v).eq('id', Number(id)) : db.from(t).insert(v);
  const {error} = await consulta;
  
  if(error) return estado('Error al guardar: ' + error.message);
  
  f.reset(); 
  await cargarTodo(); 
  estado('Registro guardado correctamente.');
}

// 8. ASIGNAR EVENTOS A LOS 5 FORMULARIOS
entidades.forEach(t => {
  formularios[t].addEventListener('submit', async ev => {
    ev.preventDefault();
    if(!ev.currentTarget.reportValidity()) return;
    await guardar(t, ev.currentTarget);
  });
});

// 9. PRUEBA FETCH HTTP
$('probarFetch').addEventListener('click', async () => {
  try {
    const {data: {session}} = await db.auth.getSession();
    if(!session) throw Error('Inicie sesión primero.');
    
    const respuesta = await fetch(SUPABASE_URL + '/rest/v1/talleres?select=id,nombre,cupos', {
      headers: {'apikey': SUPABASE_PUBLIC_KEY, 'Authorization': 'Bearer ' + session.access_token}
    });
    
    if(!respuesta.ok) throw Error('HTTP ' + respuesta.status);
    const datos = await respuesta.json();
    
    console.table(datos); 
    estado('GET exitoso: ' + datos.length + ' talleres. Revise F12 > Consola y Red.');
  } catch(e) {
    estado('Fetch falló: ' + e.message);
  }
});

// INICIAR APLICACIÓN
verificarSession();