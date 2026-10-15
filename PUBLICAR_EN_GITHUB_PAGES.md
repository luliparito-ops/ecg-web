# Complemento de publicación para ECGWeb
Este ZIP NO reemplaza la aplicación. Agregá su carpeta oculta .github a la raíz del proyecto completo ya entregado, al lado de package.json, src e index.html.

## Publicación sin instalar Node en tu Mac
1. Creá un repositorio GitHub para la app con rama principal main.
2. Subí los archivos del proyecto completos: package.json, index.html, vite.config.ts, tsconfig.json y src. No subas el ZIP sin descomprimir ni una carpeta ECGWeb que deje todo el proyecto un nivel más abajo.
3. Agregá .github/workflows/deploy.yml de este complemento. En Finder las carpetas ocultas se muestran con Cmd+Shift+punto. Alternativa desde GitHub: Add file > Create new file y escribí .github/workflows/deploy.yml como nombre, luego pegá su contenido.
4. Settings > Pages > Build and deployment > Source: GitHub Actions.
5. Actions > Publicar ECG Web en GitHub Pages > Run workflow si no se inició automáticamente.
6. Cuando finalice correctamente, Pages y la ejecución muestran la dirección del sitio.

La compilación ocurre en GitHub; no requiere tu Mac encendido para que la web siga funcionando. No envíes PDF/imágenes de pacientes ni sesiones JSON al repositorio. Los usuarios abren los ECG localmente con el botón de documento de la aplicación.

## Configuración
La raíz del repositorio DEBE contener package.json. La rama configurada es main. El flujo determina la ruta pública con configure-pages y pasa --base a Vite; sirve para repositorios de proyecto y sitios raíz/dominio propio según Pages.
Utiliza Node 22. Si existe package-lock.json usa npm ci; si no, npm install. Recomendado: generar y guardar el lockfile tras la primera instalación local para hacer reproducibles las dependencias transitivas.
El flujo ejecuta pruebas y TypeScript: si fallan, NO publica una nueva versión. Abrí el paso fallido en Actions y compartí el error completo para corregirlo. No se ha ejecutado este flujo contra un repositorio real desde aquí.

## Estructura requerida
.github/workflows/deploy.yml
package.json
index.html
vite.config.ts
tsconfig.json
src/...

No subir node_modules, sesiones clínicas, claves, certificados ni datos privados. No seleccionar Deploy from a branch para este flujo; seleccionar GitHub Actions. Publicar código TypeScript directamente como si fuera HTML estático no compila la aplicación.
