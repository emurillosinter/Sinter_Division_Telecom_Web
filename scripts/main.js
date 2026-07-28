/* ==========================================================================
   Gestor de Navegación Dual (Sistema Global + Pestañas Internas)
   ========================================================================== */
   
async function cargarFooter() {
    try {
        const res = await fetch('html/footer.html');
        if (res.ok) document.getElementById('footer-container').innerHTML = await res.text();
    } catch (e) { console.error("Error footer:", e); }
}

// Navegación Sidebar
function switchMainView(viewId, title) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`${viewId}-view`);
    if(target) target.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.view === viewId);
    });
    
    const titleObj = document.getElementById('view-title');
    if(titleObj) titleObj.textContent = title;
}

// Navegación Pestañas Workspace (1. Info Cliente, 2. Alcance, 3. Presupuesto, 4. Oferta)
function switchWorkspaceTab(stepId) {
    document.querySelectorAll('.step-view').forEach(s => s.classList.remove('active'));
    const targetStep = document.getElementById(`step-${stepId}`);
    if(targetStep) targetStep.classList.add('active');
    
    document.querySelectorAll('.wk-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.step === stepId);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    cargarFooter();
    
    // Clics Menú Lateral
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const title = btn.textContent.trim();
            switchMainView(btn.dataset.view, title);
        });
    });

    // Clics Pestañas Horizontales Superior
    document.querySelectorAll('.wk-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            switchWorkspaceTab(tab.dataset.step);
        });
    });
});