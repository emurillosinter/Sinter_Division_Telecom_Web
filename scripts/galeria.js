/* ==========================================================================
   Galería Automatizada - Sinter S.A.
   ========================================================================== */

async function cargarGaleriaAutomatica() {
    const contenedor = document.getElementById('galeria-container');
    if (!contenedor) return;

    try {
        // Petición a la ruta raíz de imágenes
        const respuesta = await fetch('resources/img/');
        if (!respuesta.ok) throw new Error("Lectura de directorio bloqueada o no encontrada.");
        
        const textoHtml = await respuesta.text();

        // Parsea el HTML del directorio devuelto por el servidor
        const parser = new DOMParser();
        const doc = parser.parseFromString(textoHtml, 'text/html');
        const enlaces = Array.from(doc.querySelectorAll('a'));

        // Filtra extensiones de imagen
        const imagenes = enlaces
            .map(a => a.getAttribute('href'))
            .filter(href => href && href.match(/\.(png|jpe?g|gif|webp)$/i));

        let htmlGaleria = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px;">`;

        imagenes.forEach(imgUrl => {
            // Limpieza automática del título a partir del nombre del archivo
            const nombreArchivo = imgUrl.split('/').pop();
            const tituloLimpio = decodeURIComponent(nombreArchivo.split('.')[0])
                                  .replace(/[-_]/g, ' ')
                                  .toUpperCase();

            htmlGaleria += `
                <div class="card" style="padding: 10px; text-align: center;">
                    <img src="resources/img/${nombreArchivo}" alt="${tituloLimpio}" style="max-width: 100%; height: auto; border-radius: 8px;">
                    <h3 style="margin-top: 15px; font-size: 14px; color: var(--navy);">${tituloLimpio}</h3>
                </div>
            `;
        });

        htmlGaleria += `</div>`;
        contenedor.innerHTML = htmlGaleria;

    } catch (error) {
        console.warn("No se pudo automatizar el escaneo (¿Estás usando file://?). Generando fallback visual...", error);
        
        // Fallback en caso de que CORS/Servidor bloquee la lectura del directorio
        contenedor.innerHTML = `
            <div class="card">
                <h2>Directorio de Recursos</h2>
                <p>Las imágenes se cargarán automáticamente al levantar el sistema en el servidor de producción.</p>
                <div style="margin-top:20px; display:flex; gap:20px;">
                    <div style="border:1px solid #eee; padding:10px;"><img src="resources/img/USER IMAGE DIVISION DE TELECOM.png" width="150"><br><b>LOGO OFICIAL</b></div>
                </div>
            </div>
        `;
    }
}

document.addEventListener("DOMContentLoaded", cargarGaleriaAutomatica);