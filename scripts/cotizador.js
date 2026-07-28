/* ==========================================================================
   Lógica de Cotizador, Módulo de Productos, Usuarios en Supabase y Toasts
   ========================================================================== */

const SUPABASE_URL = 'https://cvgayxbxroamhbwwqcts.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2Z2F5eGJ4cm9hbWhid3dxY3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDgxMzYsImV4cCI6MjEwMDQ4NDEzNn0.V72WFps_4pcIGj2MDIKAtppGH4pJY-ewD3-nb5MDMDc';

let _supabase = null;
if (window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const $ = (id) => document.getElementById(id);
let catalog = [];
let quote = createQuote(); 
let selectedBatch = []; 
let itemMode = 'catalog';
let editingIndex = null; 
let isEditingProduct = false;
let currentUserProfile = null;

let chartTopProductsInstance = null;
let chartScopesInstance = null;

/* --- SISTEMA DE NOTIFICACIONES TOAST ELEGANTES --- */

function showToast(message, type = 'success', customTitle = null) {
    let container = $('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const defaultTitles = { success: '¡Operación Exitosa!', error: 'Atención / Error', warning: 'Advertencia', info: 'Información del Sistema' };
    const title = customTitle || defaultTitles[type] || 'Notificación';

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/* --- Modal de Confirmación Personalizado y Estilizado --- */

function showConfirmDialog(message, title = 'Confirmación de Acción') {
    return new Promise((resolve) => {
        const modal = $('confirm-modal');
        if (!modal) {
            resolve(confirm(message));
            return;
        }

        $('confirm-modal-title').textContent = title;
        $('confirm-modal-msg').textContent = message;

        const btnOk = $('btn-confirm-ok');
        const btnCancel = $('btn-confirm-cancel');

        const cleanup = () => {
            btnOk.onclick = null;
            btnCancel.onclick = null;
            modal.close();
        };

        btnOk.onclick = () => {
            cleanup();
            resolve(true);
        };

        btnCancel.onclick = () => {
            cleanup();
            resolve(false);
        };

        modal.showModal();
    });
}

/* --- Control Dinámico de Visibilidad y Validación de Carta Oferta --- */

function updatePrintButtonState() {
    const printBtn = $('print-quote');
    const autosaveBadge = $('autosave-status');
    const activeViewEl = document.querySelector('.view.active');
    const activeViewId = activeViewEl ? activeViewEl.id : 'workspace-view';
    const isWorkspace = (activeViewId === 'workspace-view');
    
    if (printBtn) printBtn.hidden = !isWorkspace;
    if (autosaveBadge) autosaveBadge.hidden = !isWorkspace;

    if (!isWorkspace) return;

    const hasProject = Boolean(quote.project && quote.project.trim());
    const hasClient = Boolean(quote.client && quote.client.trim());
    const hasItems = Boolean(quote.items && quote.items.length > 0);
    const isComplete = hasProject && hasClient && hasItems;

    if (printBtn) {
        printBtn.disabled = !isComplete;
        if (!isComplete) {
            let faltantes = [];
            if (!hasProject) faltantes.push('Nombre del Proyecto');
            if (!hasClient) faltantes.push('Cliente');
            if (!hasItems) faltantes.push('al menos 1 Recurso');
            printBtn.title = `Para habilitar, complete: ${faltantes.join(', ')}`;
        } else {
            printBtn.title = 'Generar documento oficial en PDF';
        }
    }
}

/* --- MÓDULO DE GESTIÓN DE USUARIOS Y PERMISOS --- */

async function loadUsersFromSupabase() {
    if (!_supabase) return;
    const tbody = $('users-table-body');
    if (!tbody) return;

    try {
        const { data: users, error } = await _supabase
            .from('users')
            .select('id, nombre, email, profiles(rol, permisos)')
            .order('created_at', { ascending: false });

        if (error || !users || users.length === 0) {
            const { data: fallbackProfiles } = await _supabase.from('profiles').select('*');
            if (fallbackProfiles && fallbackProfiles.length > 0) {
                renderUsersTable(fallbackProfiles.map(p => ({
                    id: p.id,
                    nombre: p.nombre || p.email?.split('@')[0] || 'Usuario Sinter',
                    email: p.email || 'usuario@sinter.com.ni',
                    profiles: { rol: p.rol, permisos: p.permisos }
                })), tbody);
                return;
            }
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--muted); padding:20px;">No hay usuarios registrados en la base de datos.</td></tr>`;
            return;
        }

        renderUsersTable(users, tbody);
    } catch (e) {
        console.error("Error consultando usuarios:", e);
    }
}

function renderUsersTable(usersList, tbody) {
    tbody.innerHTML = usersList.map(u => {
        const profile = Array.isArray(u.profiles) ? u.profiles[0] : (u.profiles || {});
        const email = (u.email || '').toLowerCase();
        const isSuperAdmin = (email === 'emurillo@sinter.com.ni') || (profile.rol === 'Super Admin');
        const rol = isSuperAdmin ? 'Super Admin' : (profile.rol || 'Cotizador');
        const p = profile.permisos || {};

        const permBadges = isSuperAdmin 
            ? '<span style="color:#6b21a8; font-weight:bold;">Acceso Total Ilimitado / Super Admin</span>'
            : ([
                p.crear_cotizaciones ? 'Cotizar' : null,
                p.editar_catalogo ? 'Catálogo' : null,
                p.gestionar_usuarios ? 'Usuarios' : null
              ].filter(Boolean).join(' · ') || 'Lectura');

        const isCurrentUser = (u.id === currentUserProfile?.id);

        let roleClass = 'visualizador';
        if (isSuperAdmin) roleClass = 'super-admin';
        else if (rol === 'Administrador') roleClass = 'admin';
        else if (rol === 'Cotizador') roleClass = 'cotizador';

        let actionHtml = '';
        if (isSuperAdmin) {
            actionHtml = `<span title="Super Usuario Protegido contra eliminación" style="font-size:16px; cursor:help;">🔒</span>`;
        } else if (isCurrentUser) {
            actionHtml = `<span style="font-size:11px; color:var(--muted); font-weight:700;">Sesión Activa</span>`;
        } else {
            actionHtml = `<button class="remove" data-delete-user="${u.id}" title="Eliminar Usuario">×</button>`;
        }

        return `
        <tr>
            <td><strong>${u.nombre || 'Sin Nombre'}</strong></td>
            <td>${u.email}</td>
            <td><span class="role-badge ${roleClass}">${rol}</span></td>
            <td><span style="font-size:12px; color:var(--muted);">${permBadges}</span></td>
            <td style="text-align: center;">${actionHtml}</td>
        </tr>`;
    }).join('');
}

async function handleCreateUser() {
    const fullname = $('new-user-fullname').value.trim();
    const email = $('new-user-email').value.trim().toLowerCase();
    const password = $('new-user-pass').value.trim();
    const role = $('new-user-role').value;
    const statusEl = $('create-user-status');

    if (!fullname || !email || !password) {
        statusEl.textContent = '⚠️ Por favor complete todos los campos obligatorios.';
        statusEl.hidden = false;
        return;
    }

    if (!email.endsWith('@sinter.com.ni')) {
        statusEl.textContent = '⚠️ Acceso denegado. Solo se permiten correos @sinter.com.ni';
        statusEl.hidden = false;
        return;
    }

    statusEl.hidden = true;

    const { data: existingUser } = await _supabase.from('users').select('id, email').eq('email', email).maybeSingle();
    if (existingUser) {
        showToast(`El correo ${email} ya está registrado en el sistema.`, 'warning', 'Usuario Duplicado');
        return;
    }

    const permisos = {
        crear_cotizaciones: $('perm-crear-cotizacion').checked,
        editar_catalogo: $('perm-editar-catalogo').checked,
        gestionar_usuarios: $('perm-gestionar-usuarios').checked,
        ver_reportes: true
    };

    let newUserId = null;
    const { data: authData } = await _supabase.auth.signUp({ email, password, options: { data: { fullname } } });
    if (authData?.user?.id) newUserId = authData.user.id;
    else newUserId = crypto.randomUUID();

    const { error: userTableError } = await _supabase.from('users').upsert([{ id: newUserId, nombre: fullname, email: email }]);
    if (userTableError) {
        showToast('Error al registrar usuario en la tabla users: ' + userTableError.message, 'error');
        return;
    }

    const { error: profileError } = await _supabase.from('profiles').upsert([{ id: newUserId, rol: role, permisos: permisos }]);
    if (profileError) {
        showToast('Error asignando perfil: ' + profileError.message, 'error');
        return;
    }

    showToast(`Usuario "${fullname}" registrado exitosamente.`, 'success', '¡Usuario Creado!');
    $('create-user-modal').close();
    await loadUsersFromSupabase();
}

async function deleteUserFromSupabase(userId) {
    if (!_supabase) return;
    const { data: targetUser } = await _supabase.from('users').select('email').eq('id', userId).single();

    if (targetUser) {
        if (targetUser.email.toLowerCase() === 'emurillo@sinter.com.ni') {
            showToast('El Super Usuario principal está protegido.', 'warning', 'Acción Bloqueada');
            return;
        }
        if (userId === currentUserProfile?.id) {
            showToast('No puede eliminar su propia cuenta activa.', 'warning', 'Acción Bloqueada');
            return;
        }
    }

    const confirmed = await showConfirmDialog('¿Está seguro de revocar el acceso a este usuario?', 'Gestión de Accesos');
    if (confirmed) {
        const { error } = await _supabase.from('users').delete().eq('id', userId);
        if (error) showToast('Error al eliminar usuario: ' + error.message, 'error');
        else {
            showToast('Usuario eliminado del sistema.', 'info');
            loadUsersFromSupabase();
        }
    }
}

/* --- Catálogo de Productos --- */

async function loadProductsCatalog() {
    if(!_supabase) return;
    try {
        const { data } = await _supabase.from('products').select('*').order('created_at', { ascending: false });
        if (data && data.length > 0) {
            catalog = data;
            renderCatalog();
        } else {
            const response = await fetch('scripts/datos.json');
            if(response.ok) {
                const json = await response.json();
                const initialCatalog = json.catalogo || [];
                if (initialCatalog.length > 0) {
                    await _supabase.from('products').upsert(initialCatalog);
                    catalog = initialCatalog;
                    renderCatalog();
                }
            }
        }
    } catch (e) {
        console.error("Error al cargar productos:", e);
    }
}

async function saveProductToSupabase() {
    const id = $('prod-id').value.trim();
    const descripcion = $('prod-desc').value.trim();
    const categoria = $('prod-cat').value.trim();
    const tipo = $('prod-type').value;
    const unidad_medida = $('prod-unit').value.trim();
    const costo_unitario = Number($('prod-cost').value);

    if (!id || !descripcion || !categoria || Number.isNaN(costo_unitario)) {
        showToast('Por favor complete todos los campos requeridos.', 'warning');
        return;
    }

    const newProduct = { id, descripcion, categoria, tipo, unidad_medida, costo_unitario };
    const { error } = await _supabase.from('products').upsert([newProduct]);

    if (error) showToast('Error al guardar producto: ' + error.message, 'error');
    else {
        showToast(`Producto "${descripcion}" guardado con éxito.`, 'success');
        $('product-modal').close();
        loadProductsCatalog();
    }
}

async function deleteProductFromSupabase(productId) {
    const confirmed = await showConfirmDialog(`¿Está seguro de eliminar el producto [${productId}]?`, 'Catálogo de Productos');
    if (confirmed) {
        const { error } = await _supabase.from('products').delete().eq('id', productId);
        if (error) showToast('Error al eliminar producto: ' + error.message, 'error');
        else {
            showToast('Producto eliminado.', 'info');
            loadProductsCatalog();
        }
    }
}

/* --- Control de Autenticación y Perfiles --- */

async function checkAuth() {
    const overlay = $('login-overlay');
    const sidebar = $('app-sidebar');
    const main = $('app-main');
    
    if (!_supabase) return;

    const { data: { session } } = await _supabase.auth.getSession();
    
    if (session && session.user) {
        const email = session.user.email || '';
        await fetchUserProfile(session.user.id, email);

        if (overlay) overlay.hidden = true;
        if (sidebar) sidebar.hidden = false;
        if (main) main.hidden = false;

        loadProductsCatalog();
        renderHistory();
    } else {
        if (sidebar) sidebar.hidden = true;
        if (main) main.hidden = true;
        if (overlay) overlay.hidden = false;
    }
}

async function fetchUserProfile(userId, email) {
    try {
        const { data: userData } = await _supabase.from('users').select('nombre, email').eq('id', userId).maybeSingle();
        const { data: profileData } = await _supabase.from('profiles').select('rol, permisos').eq('id', userId).maybeSingle();

        const isSuper = email.toLowerCase().includes('emurillo');

        currentUserProfile = {
            id: userId,
            email: email,
            nombre: userData?.nombre || (isSuper ? 'Eliezer Murillo' : email.split('@')[0].toUpperCase()),
            rol: isSuper ? 'Super Admin' : (profileData?.rol || 'Cotizador'),
            permisos: isSuper ? {
                crear_cotizaciones: true,
                editar_catalogo: true,
                gestionar_usuarios: true,
                ver_reportes: true
            } : (profileData?.permisos || {
                crear_cotizaciones: true,
                editar_catalogo: false,
                gestionar_usuarios: false,
                ver_reportes: true
            })
        };

        applyUserPermissions();
    } catch (e) {
        console.error("Error cargando perfil:", e);
    }
}

function applyUserPermissions() {
    if(!currentUserProfile) return;

    if ($('user-name-display')) $('user-name-display').textContent = currentUserProfile.nombre;
    if ($('user-role-display')) $('user-role-display').textContent = `${currentUserProfile.rol} (${currentUserProfile.email})`;

    const p = currentUserProfile.permisos || {};

    if ($('nav-usuarios')) $('nav-usuarios').hidden = !p.gestionar_usuarios;
    if ($('nav-basedatos')) $('nav-basedatos').hidden = !p.editar_catalogo;
    if ($('nav-reportes')) $('nav-reportes').hidden = !p.ver_reportes;

    if (p.gestionar_usuarios) loadUsersFromSupabase();
    if (p.ver_reportes) generateReportsAndMetrics();
    
    renderCatalog();
    updatePrintButtonState();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = $('login-user').value.trim();
    const password = $('login-pass').value.trim();
    const errorEl = $('login-error');
    const submitBtn = $('btn-submit-login');

    if (!email.toLowerCase().endsWith('@sinter.com.ni')) {
        errorEl.textContent = '⚠️ Acceso denegado. Solo se permiten correos @sinter.com.ni';
        errorEl.hidden = false;
        return;
    }

    submitBtn.textContent = 'Verificando...';
    submitBtn.disabled = true;

    const { error } = await _supabase.auth.signInWithPassword({ email, password });

    submitBtn.textContent = 'Ingresar al Cotizador';
    submitBtn.disabled = false;

    if (error) {
        errorEl.textContent = '⚠️ ' + (error.message.includes('Invalid') ? 'Correo o contraseña incorrectos' : error.message);
        errorEl.hidden = false;
    } else {
        errorEl.hidden = true;
        checkAuth();
    }
}

async function handleLogout() {
    const confirmed = await showConfirmDialog('¿Desea cerrar la sesión actual del sistema?', 'Cerrar Sesión');
    if (confirmed) {
        await _supabase.auth.signOut();
        currentUserProfile = null;
        checkAuth();
    }
}

/* --- Reportes y Métricas --- */

async function generateReportsAndMetrics() {
    if(!_supabase) return;
    try {
        const { data: allQuotes, error } = await _supabase.from('quotes').select('*');
        if (error || !allQuotes) return;

        const totalAmount = allQuotes.reduce((acc, q) => acc + (Number(q.total) || 0), 0);
        const totalCount = allQuotes.length;
        const avgMargin = totalCount ? (allQuotes.reduce((acc, q) => acc + (Number(q.margin) || 0), 0) / totalCount) : 0;
        const avgTicket = totalCount ? (totalAmount / totalCount) : 0;

        if($('kpi-total-amount')) $('kpi-total-amount').textContent = money(totalAmount);
        if($('kpi-total-quotes')) $('kpi-total-quotes').textContent = totalCount;
        if($('kpi-avg-margin')) $('kpi-avg-margin').textContent = `${avgMargin.toFixed(1)}%`;
        if($('kpi-avg-ticket')) $('kpi-avg-ticket').textContent = money(avgTicket);

        const productStats = {};
        const scopeStats = {};

        allQuotes.forEach(q => {
            const items = q.data?.items || [];
            items.forEach(it => {
                const desc = it.descripcion || 'Sin nombre';
                const qty = Number(it.qty) || 1;
                const costUnit = Number(it.costo_unitario) || 0;
                const margin = Number(it.margen) || 30;
                const totalSale = (costUnit / (1 - (margin / 100))) * qty;

                if (!productStats[desc]) {
                    productStats[desc] = { categoria: it.categoria || 'General', frequency: 0, totalQty: 0, totalAmount: 0 };
                }
                productStats[desc].frequency += 1;
                productStats[desc].totalQty += qty;
                productStats[desc].totalAmount += totalSale;

                const scope = it.alcanceAsignado || 'Sin Alcance';
                scopeStats[scope] = (scopeStats[scope] || 0) + totalSale;
            });
        });

        const sortedProducts = Object.entries(productStats).map(([name, stat]) => ({
            name, ...stat
        })).sort((a, b) => b.totalAmount - a.totalAmount);

        const tbody = $('rotation-table-body');
        if (tbody) {
            tbody.innerHTML = sortedProducts.length ? sortedProducts.map(p => `
                <tr>
                    <td><strong>${p.name}</strong></td>
                    <td><span class="item-type">${p.categoria}</span></td>
                    <td style="text-align: center;">${p.frequency} oferta(s)</td>
                    <td style="text-align: center; font-weight: 700;">${p.totalQty}</td>
                    <td style="text-align: right; color: var(--blue); font-weight: 700;">${money(p.totalAmount)}</td>
                </tr>
            `).join('') : `<tr><td colspan="5" style="text-align:center; color: var(--muted); padding:20px;">Sin cotizaciones registradas.</td></tr>`;
        }

        renderCharts(sortedProducts.slice(0, 5), scopeStats);
    } catch (e) {
        console.error("Error generando reportes:", e);
    }
}

function renderCharts(topProducts, scopeStats) {
    if (typeof Chart === 'undefined') return;

    const ctxProd = $('chart-top-products')?.getContext('2d');
    if (ctxProd) {
        if (chartTopProductsInstance) chartTopProductsInstance.destroy();
        chartTopProductsInstance = new Chart(ctxProd, {
            type: 'bar',
            data: {
                labels: topProducts.map(p => p.name.length > 20 ? p.name.substring(0, 18) + '...' : p.name),
                datasets: [{ label: 'Monto Cotizado ($)', data: topProducts.map(p => p.totalAmount), backgroundColor: '#1072e3', borderRadius: 6 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    const ctxScope = $('chart-scopes')?.getContext('2d');
    if (ctxScope) {
        if (chartScopesInstance) chartScopesInstance.destroy();
        chartScopesInstance = new Chart(ctxScope, {
            type: 'doughnut',
            data: {
                labels: Object.keys(scopeStats),
                datasets: [{ data: Object.values(scopeStats), backgroundColor: ['#051C3F', '#1072e3', '#10b981', '#f59e0b', '#6366f1', '#ec4899'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

/* --- Renderizado de Catálogo --- */

function renderCatalog(filter=''){
    const f = filter.toLowerCase();
    const bdBody = $('catalog-body');
    if(!bdBody) return;

    const canEdit = currentUserProfile?.permisos?.editar_catalogo;

    bdBody.innerHTML = catalog.filter(x => Object.values(x).join(' ').toLowerCase().includes(f)).map(x =>
        `<tr>
            <td><strong>${x.id}</strong></td>
            <td class="item-name">${x.descripcion}</td>
            <td><span class="item-type">${x.categoria}</span></td>
            <td>${x.unidad_medida}</td>
            <td>${money(x.costo_unitario)}</td>
            <td>${x.tipo || 'Material'}</td>
            <td style="text-align: center;">
                ${canEdit ? `
                <div class="action-buttons">
                    <button class="edit-btn" data-edit-prod="${x.id}" title="Editar Producto">✎</button>
                    <button class="remove" data-delete-prod="${x.id}" title="Eliminar Producto">×</button>
                </div>` : '<span style="color:var(--muted); font-size:11px;">Lectura</span>'}
            </td>
        </tr>`
    ).join('');
}

/* --- Guardar Cotización --- */

async function saveQuote(){
    const t = totals();
    const saved = {
        id: quote.id,
        project: quote.project || 'Sin Título',
        client: quote.client || 'N/A',
        contact: quote.contact || '',
        reference: quote.reference || '',
        currency: quote.currency,
        total: t.grand,
        cost_direct: t.direct,
        profit: t.profit,
        margin: t.margin,
        user_id: currentUserProfile?.id || null,
        user_email: currentUserProfile?.email || 'anon',
        data: quote,
        created_at: new Date().toISOString()
    };

    const history = JSON.parse(localStorage.getItem('sinterQuotes') || '[]');
    const index = history.findIndex(x => x.id === quote.id);
    if(index >= 0) history[index] = saved;
    else history.unshift(saved);
    localStorage.setItem('sinterQuotes', JSON.stringify(history));

    if (_supabase) {
        const { error } = await _supabase.from('quotes').upsert([saved]);
        if (error) console.error("Error respaldando cotización:", error);
    }

    showToast('¡Proyecto guardado con éxito!', 'success');
    renderHistory();
    generateReportsAndMetrics();
    updatePrintButtonState();
}

function createQuote(){ 
    return {
        id:`SINTER-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        project:'', client:'', contact:'', reference:'',
        validity:30, currency:'USD', contingency:5, tax:15, notes:'', 
        scopes: ['Comunicaciones', 'Alarma contra incendios'], 
        items:[]
    }; 
}

function autoSave() {
    try {
        localStorage.setItem('sinterActiveDraft', JSON.stringify(quote));
        const statusEl = $('autosave-status');
        if (statusEl) statusEl.innerHTML = '<span class="dot"></span> Guardado automático';
        updatePrintButtonState();
    } catch (e) {
        console.error("Error guardando borrador:", e);
    }
}

function loadDraft() {
    const saved = localStorage.getItem('sinterActiveDraft');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') quote = parsed;
        } catch (e) {
            console.error("Error cargando borrador:", e);
        }
    }
}

function money(n){
    return new Intl.NumberFormat('es-NI', { style:'currency', currency:quote.currency, minimumFractionDigits:2 }).format(Number(n)||0);
}

function syncInputs(){
    ['project','client','contact','reference','validity','currency','contingency','notes'].forEach(k=>{ 
        if($(k)) $(k).value = quote[k] ?? ''; 
    });
    if($('quote-code')) $('quote-code').textContent = quote.id;
    updatePrintButtonState();
}

function totals(){
    const direct = quote.items.reduce((a,x) => a + (x.costo_unitario * x.qty), 0);
    const sales = quote.items.reduce((a,x) => a + (x.costo_unitario * x.qty) / (1 - (x.margen/100)), 0);
    const contingency = direct * (quote.contingency/100);
    const profit = sales - direct - contingency;
    const tax = sales * (quote.tax / 100);
    return { direct, sales, contingency, profit, tax, grand: sales + tax, margin: sales ? (profit/sales) * 100 : 0 }
}

function updateGlobalTotals(){
    const t = totals();
    $('direct-cost').textContent = money(t.direct);
    $('contingency-value').textContent = money(t.contingency);
    $('gross-profit').textContent = money(t.profit);
    $('tax-value').textContent = money(t.tax);
    $('grand-total').textContent = money(t.grand);
    $('overall-margin').textContent = `Margen global promedio: ${t.margin.toFixed(1)}%`;
}

function renderScopes(){
    const body = $('scopes-body');
    if(!body) return;
    body.innerHTML = quote.scopes.map((scopeName, index) => `
        <tr style="background: white; border-bottom: 1px solid #f1f5f9;">
            <td style="color: #64748b; font-weight: 700;">Alcance ${index}</td>
            <td style="font-weight: 600; color: var(--navy);">${scopeName}</td>
            <td style="text-align: right;"><button class="remove" data-remove-scope="${index}" title="Eliminar Alcance">×</button></td>
        </tr>
    `).join('');
    $('empty-scopes').hidden = quote.scopes.length > 0;
}

function renderQuote(){
    const body = $('items-body');
    if(!body) return;
    
    let htmlContenido = '';
    quote.scopes.forEach((scopeName, sIndex) => {
        const recursosDelAlcance = quote.items
            .map((item, originalIndex) => ({ ...item, indiceReal: originalIndex }))
            .filter(item => item.alcanceAsignado === scopeName);

        htmlContenido += `
        <tr style="background-color: #e2e8f0;">
            <td style="color: #64748b; font-weight: 700; white-space: nowrap;">Alcance ${sIndex}</td>
            <td colspan="8" style="font-weight: 800; font-size: 13px; text-transform: uppercase; color: var(--navy);">${scopeName}</td>
        </tr>`;

        if(recursosDelAlcance.length === 0) {
            htmlContenido += `<tr style="background: white;"><td colspan="9" style="padding: 10px 20px; color: var(--muted); font-style: italic; font-size: 12px;">Sin recursos asignados.</td></tr>`;
        } else {
            recursosDelAlcance.forEach(x => {
                const i = x.indiceReal;
                const costoTotal = x.costo_unitario * x.qty;
                const precioUnitVenta = x.costo_unitario / (1 - (x.margen/100));
                const precioVentaTotal = precioUnitVenta * x.qty;
                
                htmlContenido += `
                <tr style="background: white; border-bottom: 1px solid #f1f5f9;">
                    <td style="font-weight: 500; color: var(--ink); padding-left: 15px;">${x.descripcion}</td>
                    <td style="color: var(--muted);">${x.unidad_medida}</td>
                    <td style="text-align: center;"><input aria-label="Cantidad" data-field="qty" data-index="${i}" type="number" min="0" step="1" value="${x.qty}"></td>
                    <td>${money(x.costo_unitario)}</td>
                    <td style="background-color: #f8fafc;"><strong data-role="costo-total">${money(costoTotal)}</strong></td>
                    <td><div style="display: flex; align-items: center; justify-content: center; gap: 4px;"><input aria-label="Margen" data-field="margen" data-index="${i}" type="number" min="0" max="99" maxlength="2" value="${x.margen}">%</div></td>
                    <td data-role="precio-unit">${money(precioUnitVenta)}</td>
                    <td style="background-color: #f0fdf4;"><strong style="color: #16a34a;" data-role="precio-venta">${money(precioVentaTotal)}</strong></td>
                    <td style="text-align: center;">
                        <div class="action-buttons">
                            <button class="edit-btn" data-edit="${i}" title="Editar">✎</button>
                            <button class="remove" data-remove="${i}" title="Eliminar">×</button>
                        </div>
                    </td>
                </tr>`;
            });
        }
    });
    
    body.innerHTML = htmlContenido;
    $('empty-items').hidden = quote.items.length > 0;
    updateGlobalTotals();
    updatePrintButtonState();
}

function updateModalScopeDropdown() {
    const select = $('modal-scope-select');
    if(!select) return;
    select.innerHTML = quote.scopes.map(s => `<option value="${s}">${s}</option>`).join('');
}

function updateEditModalScopeDropdown(currentScope) {
    const select = $('edit-modal-scope');
    if(!select) return;
    select.innerHTML = quote.scopes.map(s => `<option value="${s}" ${s === currentScope ? 'selected' : ''}>${s}</option>`).join('');
}

function renderPicker(filter=''){
    const listContainer = $('picker-list');
    if(!listContainer) return;
    const query = filter.trim().toLowerCase();
    if(!query) { listContainer.style.display = 'none'; listContainer.innerHTML = ''; return; }

    const matches = catalog.filter(x => Object.values(x).join(' ').toLowerCase().includes(query));
    listContainer.style.display = 'block';

    if(matches.length === 0) {
        listContainer.innerHTML = `<div style="padding: 15px; color: var(--muted); text-align: center; font-size: 13px;">No se encontraron recursos.</div>`;
        return;
    }

    listContainer.innerHTML = matches.map(x => {
        const isAdded = selectedBatch.some(b => b.id === x.id);
        const styleAttr = isAdded ? 'background: #f1f5f9; cursor: default; opacity: 0.75;' : '';
        const badgeLabel = isAdded ? '<span style="color: #059669; font-weight: 700; margin-left: 6px;">✓ Agregado</span>' : '';
        return `<div class="picker-option" data-picker-id="${x.id}" style="${styleAttr}"><strong>${isAdded ? '✓ ' : '+ '}${x.descripcion} ${badgeLabel}</strong><span>${x.categoria} · ${money(x.costo_unitario)} / ${x.unidad_medida}</span></div>`;
    }).join('');
}

function renderBatchTray() {
    const tray = $('batch-tray');
    const countEl = $('batch-count');
    const addBtn = $('add-selected');
    if(!tray || !countEl || !addBtn) return;
    countEl.textContent = selectedBatch.length;
    addBtn.textContent = (itemMode === 'catalog' && selectedBatch.length > 0) ? `Añadir ${selectedBatch.length} Recurso(s)` : 'Añadir al Presupuesto';

    if(selectedBatch.length === 0) {
        tray.innerHTML = '<span class="batch-empty-msg">Ningún recurso seleccionado aún. Busca y selecciona arriba.</span>';
        return;
    }

    tray.innerHTML = selectedBatch.map((item, index) => `<span class="batch-chip">${item.descripcion}<button type="button" data-remove-batch="${index}">×</button></span>`).join('');
}

function commitBatchToQuote(customMargin){
    const selectedScope = $('modal-scope-select').value;
    if(!selectedScope) return showToast('Debe seleccionar un alcance.', 'warning');
    let marginToUse = Number(customMargin);
    if(Number.isNaN(marginToUse) || marginToUse < 0) marginToUse = 30;
    if(marginToUse > 99) marginToUse = 99;

    if(itemMode === 'catalog') {
        if(selectedBatch.length === 0) return showToast('Seleccione al menos un recurso.', 'warning');
        selectedBatch.forEach(item => {
            quote.items.push({...item, qty:1, margen: marginToUse, alcanceAsignado: selectedScope});
        });
    } else {
        const desc = $('manual-name').value.trim(); 
        const costo = Number($('manual-cost').value);
        const manualMargin = Number($('manual-margin').value) || 30;
        if(!desc || Number.isNaN(costo)) return showToast('Complete la descripción y el costo.', 'warning');
        quote.items.push({ id:`MAN-${Date.now()}`, descripcion:desc, categoria:$('manual-type').value, unidad_medida:$('manual-unit').value, costo_unitario:costo, margen: manualMargin, alcanceAsignado: selectedScope, qty:1 });
    }

    selectedBatch = [];
    $('item-modal').close();
    renderQuote();
    autoSave();
}

async function initSystem() {
    checkAuth();
    loadDraft();
    syncInputs();
    renderScopes();
    renderQuote();
    updatePrintButtonState();
}

function renderHistory(){
    const history = JSON.parse(localStorage.getItem('sinterQuotes') || '[]');
    const histList = $('history-list');
    if(!histList) return;
    histList.innerHTML = history.length ? history.map(x => `
        <div class="history-entry">
            <div><strong style="color:var(--navy); display:block; font-size:15px; margin-bottom:5px;">${x.project || 'Proyecto sin título'}</strong><span style="color:var(--muted); font-size:12px;">Cliente: ${x.client || 'N/A'} · ${x.id}</span></div>
            <div><strong style="font-size:18px; color:var(--blue);">${new Intl.NumberFormat('es-NI',{style:'currency',currency:x.currency||'USD'}).format(x.total||0)}</strong></div>
        </div>
    `).join('') : '<div class="empty-state"><strong>No hay historial</strong><p>Los proyectos guardados aparecerán aquí.</p></div>';
}

/* --- Listeners --- */

if ($('btn-open-create-user-modal')) {
    $('btn-open-create-user-modal').onclick = () => {
        $('new-user-fullname').value = '';
        $('new-user-email').value = '';
        $('new-user-pass').value = '';
        $('create-user-status').hidden = true;
        $('create-user-modal').showModal();
    };
}
if ($('btn-save-new-user')) $('btn-save-new-user').onclick = handleCreateUser;
if ($('users-table-body')) {
    $('users-table-body').onclick = (e) => {
        const btn = e.target.closest('[data-delete-user]');
        if (btn) deleteUserFromSupabase(btn.dataset.deleteUser);
    };
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) setTimeout(() => updatePrintButtonState(), 50);
});

if($('login-form')) $('login-form').addEventListener('submit', handleLogin);
if($('logout-btn')) $('logout-btn').addEventListener('click', handleLogout);
if($('btn-refresh-reports')) $('btn-refresh-reports').onclick = generateReportsAndMetrics;

if($('btn-open-create-product-modal')) {
    $('btn-open-create-product-modal').onclick = () => {
        isEditingProduct = false;
        $('product-modal-title').textContent = 'Registrar Nuevo Producto';
        $('prod-id').value = `PROD-${Date.now().toString().slice(-4)}`;
        $('prod-id').disabled = false;
        $('prod-desc').value = '';
        $('prod-cat').value = '';
        $('prod-unit').value = 'c.u.';
        $('prod-cost').value = '';
        $('product-modal').showModal();
    };
}
if($('btn-save-product')) $('btn-save-product').onclick = saveProductToSupabase;

if($('catalog-body')) {
    $('catalog-body').onclick = e => {
        const editBtn = e.target.closest('[data-edit-prod]');
        if (editBtn) {
            const p = catalog.find(x => x.id === editBtn.dataset.editProd);
            if (p) {
                isEditingProduct = true;
                $('product-modal-title').textContent = 'Editar Producto';
                $('prod-id').value = p.id;
                $('prod-id').disabled = true;
                $('prod-desc').value = p.descripcion || '';
                $('prod-cat').value = p.categoria || '';
                $('prod-type').value = p.tipo || 'Material';
                $('prod-unit').value = p.unidad_medida || 'c.u.';
                $('prod-cost').value = p.costo_unitario || 0;
                $('product-modal').showModal();
            }
            return;
        }
        const deleteBtn = e.target.closest('[data-delete-prod]');
        if (deleteBtn) deleteProductFromSupabase(deleteBtn.dataset.deleteProd);
    };
}

if($('btn-forgot-pass')) {
    $('btn-forgot-pass').onclick = () => {
        $('recovery-email').value = $('login-user').value || '';
        $('recovery-status').hidden = true;
        $('forgot-modal').showModal();
    };
}

if($('btn-send-recovery')) {
    $('btn-send-recovery').onclick = async () => {
        const email = $('recovery-email').value.trim();
        if (!email.toLowerCase().endsWith('@sinter.com.ni')) return showToast('Ingrese un correo corporativo válido.', 'warning');
        const { error } = await _supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        if (error) showToast('Error: ' + error.message, 'error');
        else $('recovery-status').hidden = false;
    };
}

if($('btn-save-new-password')) {
    $('btn-save-new-password').onclick = async () => {
        const newPassword = $('new-password-input').value.trim();
        if (newPassword.length < 6) return showToast('Mínimo 6 caracteres.', 'warning');
        const { error } = await _supabase.auth.updateUser({ password: newPassword });
        if (error) showToast('Error: ' + error.message, 'error');
        else {
            showToast('Contraseña actualizada con éxito', 'success');
            $('update-pass-modal').close();
            checkAuth();
        }
    };
}

if($('btn-new-project')) {
    $('btn-new-project').addEventListener('click', async () => {
        if(quote.items.length > 0 || quote.project) {
            const confirmed = await showConfirmDialog('¿Desea iniciar una nueva cotización en blanco? Se reiniciará el borrador actual.', 'Nuevo Proyecto');
            if(confirmed) {
                localStorage.removeItem('sinterActiveDraft');
                quote = createQuote();
                syncInputs();
                renderScopes();
                renderQuote();
                autoSave();
                updatePrintButtonState();
            }
        }
    });
}

if($('add-scope-btn')) {
    $('add-scope-btn').onclick = () => {
        const input = $('new-scope-input');
        const val = input.value.trim();
        if(!val) return showToast('Escriba el nombre del alcance.', 'warning');
        quote.scopes.push(val);
        input.value = '';
        renderScopes();
        renderQuote();
        autoSave();
    };
}

if($('scopes-body')) {
    $('scopes-body').onclick = e => {
        const btn = e.target.closest('[data-remove-scope]');
        if(btn) {
            quote.scopes.splice(Number(btn.dataset.removeScope), 1);
            renderScopes();
            renderQuote();
            autoSave();
        }
    };
}

['project','client','contact','reference','validity','currency','contingency','notes'].forEach(k => {
    if($(k)) {
        $(k).addEventListener('input', e => {
            quote[k] = ['validity','contingency'].includes(k) ? Number(e.target.value) : e.target.value; 
            renderQuote();
            autoSave();
            updatePrintButtonState();
        });
        if(k === 'currency') {
            $(k).addEventListener('change', e => {
                quote.currency = e.target.value;
                renderQuote();
                autoSave();
            });
        }
    }
});

['catalog-margin', 'manual-margin'].forEach(id => {
    if($(id)) {
        $(id).addEventListener('input', e => {
            let val = e.target.value;
            if(val.length > 2) e.target.value = val.slice(0, 2);
            if(Number(e.target.value) > 99) e.target.value = 99;
            if(Number(e.target.value) < 0) e.target.value = 0;
        });
    }
});

if($('open-item-modal')) $('open-item-modal').onclick = () => {
    if(quote.scopes.length === 0) return showToast('Registre al menos un alcance primero.', 'warning');
    updateModalScopeDropdown();
    selectedBatch = []; 
    itemMode = 'catalog';
    $('catalog-picker').hidden = false; 
    $('manual-picker').hidden = true;
    $('catalog-margin').value = 30;
    document.querySelectorAll('.tab').forEach((x,i) => x.classList.toggle('active', i===0));
    $('picker-search').value = ''; 
    renderPicker(''); 
    renderBatchTray();
    $('item-modal').showModal();
};

document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    itemMode = t.dataset.itemMode;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x===t));
    $('catalog-picker').hidden = (itemMode !== 'catalog');
    $('manual-picker').hidden = (itemMode === 'catalog');
    renderBatchTray();
});

if($('picker-search')) $('picker-search').oninput = e => renderPicker(e.target.value);

if($('picker-list')) $('picker-list').onclick = e => {
    const el = e.target.closest('[data-picker-id]');
    if(el) { 
        const matchedItem = catalog.find(x => x.id === el.dataset.pickerId);
        if(matchedItem && !selectedBatch.some(x => x.id === matchedItem.id)) {
            selectedBatch.push(matchedItem);
            renderBatchTray();
            $('picker-search').value = '';
            renderPicker('');
            $('picker-search').focus();
        }
    }
};

if($('batch-tray')) $('batch-tray').onclick = e => {
    const btn = e.target.closest('[data-remove-batch]');
    if(btn) {
        selectedBatch.splice(Number(btn.dataset.removeBatch), 1);
        renderBatchTray();
        renderPicker($('picker-search').value);
    }
};

if($('add-selected')) $('add-selected').onclick = () => commitBatchToQuote($('catalog-margin').value);

if($('save-edited-item')) {
    $('save-edited-item').onclick = () => {
        if(editingIndex === null || editingIndex === undefined) return;
        const newDesc = $('edit-modal-name').value.trim();
        const newScope = $('edit-modal-scope').value;
        const newUnit = $('edit-modal-unit').value.trim();
        const newCost = Number($('edit-modal-cost').value);

        if(!newDesc || Number.isNaN(newCost)) return showToast('Complete los datos correctamente.', 'warning');

        quote.items[editingIndex].descripcion = newDesc;
        quote.items[editingIndex].alcanceAsignado = newScope;
        quote.items[editingIndex].unidad_medida = newUnit;
        quote.items[editingIndex].costo_unitario = newCost;

        $('edit-item-modal').close();
        renderQuote();
        autoSave();
    };
}

if($('items-body')) {
    $('items-body').oninput = e => {
        const input = e.target; 
        if(!input.dataset.field) return;
        const index = Number(input.dataset.index);
        const field = input.dataset.field;
        let val = Number(input.value) || 0;
        
        if(field === 'margen') {
            if(val > 99) { val = 99; input.value = 99; }
            if(val < 0) { val = 0; input.value = 0; }
        }
        
        quote.items[index][field] = val;
        const row = input.closest('tr');
        const item = quote.items[index];
        const costoTotal = item.costo_unitario * item.qty;
        const precioUnitVenta = item.costo_unitario / (1 - (item.margen / 100));
        const precioVentaTotal = precioUnitVenta * item.qty;
        
        if(row.querySelector('[data-role="costo-total"]')) row.querySelector('[data-role="costo-total"]').textContent = money(costoTotal);
        if(row.querySelector('[data-role="precio-unit"]')) row.querySelector('[data-role="precio-unit"]').textContent = money(precioUnitVenta);
        if(row.querySelector('[data-role="precio-venta"]')) row.querySelector('[data-role="precio-venta"]').textContent = money(precioVentaTotal);
        
        updateGlobalTotals();
        autoSave();
    };

    $('items-body').onclick = e => {
        const b = e.target.closest('[data-remove]'); 
        if(b) { quote.items.splice(Number(b.dataset.remove), 1); renderQuote(); autoSave(); return; }

        const editBtn = e.target.closest('[data-edit]');
        if(editBtn) {
            editingIndex = Number(editBtn.dataset.edit);
            const item = quote.items[editingIndex];
            $('edit-modal-name').value = item.descripcion || '';
            $('edit-modal-unit').value = item.unidad_medida || '';
            $('edit-modal-cost').value = item.costo_unitario || 0;
            updateEditModalScopeDropdown(item.alcanceAsignado);
            $('edit-item-modal').showModal();
        }
    };
}

if($('catalog-search')) $('catalog-search').oninput = e => renderCatalog(e.target.value);
if($('save-quote')) $('save-quote').onclick = saveQuote;

initSystem();