# Red Operativa - Cadena de Favores Vzla
### Sistema de Gestión, Control Logístico y Registro Técnico de Personal Voluntario

Este proyecto es una aplicación web SPA (Single Page Application) desarrollada sobre la infraestructura de **Google Apps Script (GAS)**. Utiliza **Google Sheets** como base de datos relacional y **Google Drive** como almacenamiento seguro de archivos. El frontend está construido con tecnologías web estándar (HTML5, Vanilla JS, Bootstrap 5, FontAwesome 6 y Animate.css), optimizando la comunicación bidireccional mediante llamadas asíncronas con el motor del servidor.

---

## 1. Arquitectura y Estructura del Proyecto

La aplicación está dividida bajo un enfoque modular híbrido dentro del editor de Apps Script. Los archivos de interfaz se cargan dinámicamente mediante inyecciones en el DOM desde etiquetas `<template>` en tiempo de ejecución.

### Estructura de Archivos
*   **`Código.gs`**: Lógica central del servidor. Controla el enrutamiento HTTP (`doGet`), la lógica transaccional de la base de datos con Sheets, la seguridad OTP (One-Time Password) mediante caché y la gestión de archivos pesados en Drive.
*   **`Index.html`**: El "cascarón" (Shell) de la SPA. Contiene el enrutador del lado del cliente, la barra de navegación, las dependencias generales de Bootstrap/FontAwesome y las directivas de importación (`include`).
*   **`Estilos.html`**: Hoja de estilos CSS unificada que define la identidad visual del voluntariado y el comportamiento del CSS Grid del calendario.
*   **`JavaScript.html`**: Operaciones lógicas del calendario de guardias, renderizado de celdas, coordinación de turnos y llamadas AJAX del servidor.
*   **`Auth.html`**: Módulo de autenticación en dos pasos (Ingreso de correo -> Envío OTP -> Verificación -> Selección de Rol).
*   **`Perfil.html`**: Panel central de control del voluntario. Administra la Selfie obligatoria, soporte de credenciales, puntos de recogida y despliega la agenda de voluntarios para el rol de Coordinador.
*   **`Voluntarios.html`**: Componente de directorio de personal e interfaz de conmutación de estatus (Verificación y Baneo/Bloqueo).
*   **`CalendarioView.html`**: Vista limpia del componente de cuadrícula del calendario.
*   **`FormularioInscripcion.html`**: Formulario de onboarding interactivo para usuarios nuevos. Integra el módulo de aceptación de **Políticas de Privacidad**.
*   **`manifiestoPDF.html`**: Plantilla de alta fidelidad para el Manifiesto Operativo de comisión vial, integrado con la librería `html2pdf.js` para descargas asíncronas limpias.

---

## 2. Topología de la Base de Datos (Google Sheets)

Para colaborar en este proyecto, la hoja de cálculo vinculada mediante el ID de Script de Google Workspace debe respetar rigurosamente la siguiente estructura de columnas (fila 1 de encabezados):

### Hoja: `Maestro_Especialistas`
Almacena el perfil técnico e identificadores de los voluntarios (Eslabones).
*   **Columna A (1):** `ID_Voluntario` (Token alfanumérico generado de 8 dígitos).
*   **Columna B (2):** `Nombre_Completo` (Nombre y Apellido).
*   **Columna C (3):** `Voluntariado` (Área macro: Medicina, Transporte, Apoyo Logístico).
*   **Columna D (4):** `Especialidad` (Sugerido por datalist: Médico, Paramédico, Conductor, etc.).
*   **Columna E (5):** `Punto_Recogida_Preferido` (Almacena el ID del punto de reunión).
*   **Columna F (6):** `Estatus_Verificacion` (Verificado / No Verificado).
*   **Columna G (7):** `Telefono` (Formato texto con código de país opcional).
*   **Columna H (8):** `Correo` (Llave de búsqueda primaria, en minúsculas).
*   **Columna I (9):** `Documentacion_URL` (Enlace de Drive de credenciales en PDF/Imagen).
*   **Columna J (10):** `Coordinacion` (Booleano TRUE / FALSE que define privilegios administrativos).
*   **Columna K (11):** `cedula` (Documento nacional de identidad format-validado).
*   **Columna L (12):** `imagen_profile` (Enlace de Drive de la Selfie obligatoria).
*   **Columna M (13):** `direccion` (Dirección exacta de habitación).
*   **Columna N (14):** `banned` (Booleano TRUE / FALSE de bloqueo de acceso).
*   **Columna O (15):** `Documentacion_appsheet` (Ruta relativa `Documentacion/DOC_...` para AppSheet).
*   **Columna P (16):** `Imagen_appsheet` (Ruta relativa `Documentacion/PROFILE_...` para AppSheet).
*   **Columna Q (17):** `Fecha_Registro` (Timestamp de fecha y hora de creación).

### Hoja: `Registro_Principal`
Almacena la agenda de turnos u operaciones logísticas activas.
*   **Columna A:** `ID_Registro` (Token único `GUA-XXXXX`).
*   **Columna B:** `Fecha_Guardia` (Fecha).
*   **Columna C:** `ID_Destino` (ID del punto destino obtenido de la tabla de puntos).
*   **Columna D:** `ID_Transportista` (ID de transportista asignado).
*   **Columna E:** `Nombre_Coordinador` (Nombre del creador).
*   **Columna F:** `Telefono_Coordinador` (Teléfono del creador).
*   **Columna G:** `Correo_Coordinador` (Email del creador).

### Hoja: `Maestro_Puntos_Reunion`
*   **Columna A:** `ID_Punto` (Clave primaria: `D001`, `P001`, etc.).
*   **Columna B:** `Nombre_Lugar` (Nombre amigable).
*   **Columna C:** `Tipo` (Parada / Destino).
*   **Columna D:** `Coordenadas_Referencia` (Opcional).
*   **Columna E:** `Imagen_Referencia` (Opcional).

---

## 3. Flujos de Procesos y Lógica de Negocio

### A. Flujo de Autenticación y Onboarding (Eslabón Nuevo)
```
[Ingreso Correo] ➔ [Envío OTP vía MailApp] ➔ [Ingreso OTP en Pantalla]
                                                      │
                       [Verifica existencia en Maestro_Especialistas]
                                                      │
             ┌────────────────────────────────────────┴────────────────────────────────────────┐
             ▼                                                                                  ▼
       [¿Existe en DB?] ➔ SI                                                              [¿Existe en DB?] ➔ NO
             │                                                                                  │
     [Carga Perfil Normal]                                                            [Retorna REQUIRES_REGISTRATION]
             │                                                                                  │
             ▼                                                                                  ▼
    [Valida Estatus banned]                                                            [Abre Modal de Registro]
   (Si es TRUE, bloquea UI)                                                           (Muestra Formulario Nuevo)
             │                                                                                  │
             ▼                                                                                  ▼
  [Accede a Perfil / Calendar]                                                        [Exige Aceptar Políticas]
                                                                                                │
                                                                                                ▼
                                                                                       [Envía Datos al Servidor]
                                                                                      (Crea registro con ID único)
                                                                                                │
                                                                                                ▼
                                                                                      [Redirige a Mi Perfil]
                                                                                      (En Estatus: "No Verificado")
```

### B. Regla de Auto-Verificación
En `Código.gs`, la función `registrarOActualizarVoluntario` evalúa la integridad de los datos para promover automáticamente al usuario a "Verificado" sin intervención manual. La regla evalúa que los siguientes 9 campos contengan información no vacía:
$$\text{Estatus} = \begin{cases} \text{"Verificado"}, & \text{si } \{\text{ID, Nombre, Área, Especialidad, Ruta, Teléfono, Cédula, Doc\_URL, Selfie\_URL}\} \neq \emptyset \\ \text{"No Verificado"}, & \text{en caso contrario} \end{cases}$$

### C. Kill-Switch de Seguridad (Banned)
Si el coordinador marca el switch `banned` en `TRUE` desde el directorio para un voluntario, el sistema sobreescribe cualquier estatus de verificación. El voluntario verá un mensaje indicando que su perfil está bajo revisión y se ocultará por completo el acceso a la sección de guardias, evitando su postulación en turnos.

---

## 4. Configuración del Entorno de Desarrollo (Setup Colaborador)

Para comenzar a trabajar en este proyecto de forma local, sigue estos pasos:

### Prerrequisitos
1.  Instalar **Node.js** en tu equipo.
2.  Instalar la herramienta CLI oficial de Google, **Clasp** (Command Line Apps Script Projects):
    ```bash
    npm install -g @google/clasp
    ```
3.  Habilitar la API de Apps Script en las configuraciones de tu cuenta de Google Cloud/Workspace ([Script User Settings](https://script.google.com/home/usersettings)).

### Clonación y Enlace
1.  Inicia sesión con tu cuenta autorizada:
    ```bash
    clasp login
    ```
2.  Clona el repositorio de tu proyecto utilizando el ID de script del panel de configuración de GAS:
    ```bash
    clasp clone "TU_SCRIPT_ID_AQUÍ"
    ```
3.  Escribe código localmente usando tu IDE favorito (como VS Code).

### Variables de Entorno (Script Properties)
Para que las transacciones y subidas de archivos funcionen, debes declarar las siguientes propiedades en la sección de **Configuración del proyecto > Propiedades del script** en el editor web de Apps Script:
*   `SPREADSHEET_ID`: El ID de la hoja de cálculo de Google Sheets que actúa como base de datos.
*   `FOLDER_DOCS_ID`: El ID de la carpeta en Google Drive donde se almacenarán las Selfies (`PROFILE_...`) y documentos (`DOC_...`).
*   `LOGO_URL`: La URL pública de la imagen del logotipo corporativo para inyección en manifiestos PDF.

### Sincronización de Cambios
Cada vez que guardes cambios de forma local, súbelos al servidor usando:
```bash
clasp push
```
Para descargar cambios realizados directamente en el editor web:
```bash
clasp pull
```

---

## 5. Buenas Prácticas para Colaboradores

1.  **Sensibilidad a Mayúsculas/Minúsculas:** Al renderizar plantillas de HTML mediante `HtmlService.createTemplateFromFile('nombre')`, la cadena debe coincidir **exactamente** con el nombre del archivo. Por ejemplo, `manifiestoPDF` no es igual a `manifiestoPdf`.
2.  **Serialización de Datos:** Recuerda que `google.script.run` no puede transmitir objetos nativos complejos como instancias de la clase `Date` de JavaScript a través del hilo RPC. Las fechas obtenidas de Google Sheets deben ser convertidas de forma explícita a cadenas (`String`) en el servidor (usando `Utilities.formatDate`) antes de ser retornadas al cliente para evitar bloqueos y fallos de retorno silenciosos.
3.  **Prevención de Colisiones de Red:** Cualquier función que escriba en Google Sheets (`appendRow`, `setValues`) debe estar encapsulada dentro de un mecanismo de bloqueo de concurrencia (`LockService.getScriptLock().waitLock(...)`) para evitar la sobrescritura accidental de filas bajo alta demanda.



---

# Anexo al README: Registro de Actualizaciones y Mejoras del Sistema (Julio 2026)

Este documento detalla las modificaciones de arquitectura, optimizaciones de código y mejoras de experiencia de usuario (UX) implementadas para consolidar la robustez y escalabilidad de la plataforma.

---

## 1. Resumen de Cambios Técnicos e Infraestructura

### A. Normalización y Consistencia de la Base de Datos (Sheets)
*   **Mapeo Relacional por ID:** Se modificó el guardado del "Punto de Recogida Preferido" y "Destino de la Misión" para almacenar identificadores únicos (`ID_Punto` como `D001`, `P001`, etc.) en lugar de cadenas de texto plano.
*   **Traducción de Datos en el Servidor:** Se actualizaron las funciones `getDatosCalendario`, `obtenerPerfilUsuario`, `obtenerTodosLosVoluntarios` y `generarDataManifiestoGuardia` para realizar un cruce de datos (VLOOKUP del lado del servidor) con la hoja `Maestro_Puntos_Reunion`. Esto permite que el Excel almacene identificadores limpios mientras la interfaz muestra nombres amigables al usuario.
*   **Ampliación de Columnas (Planilla de Personal):** Se expandió el mapeo de `Maestro_Especialistas` a **17 columnas** para dar soporte a:
    *   `direccion` (Columna M - texto plano de habitación).
    *   `banned` (Columna N - booleano de control de acceso).
    *   `Documentacion_appsheet` e `Imagen_appsheet` (Columnas O y P - rutas relativas con el prefijo `Documentacion/` y el nombre físico del archivo).
    *   `Fecha_Registro` (Columna Q - marca de tiempo del momento exacto del registro inicial).
    *   `masive_advise` (Columna R - control de suscripción).
    *   `last_advise` (Columna S - marca de tiempo de la última convocatoria).
*   **Trazabilidad de Auditoría en Guardias:** Se amplió la estructura de `Registro_Principal` a **7 columnas** para registrar los datos del coordinador creador: `Nombre_Coordinador`, `Telefono_Coordinador` y `Correo_Coordinador` (obtenidos automáticamente en el servidor mediante su email de sesión).

### B. Robustez del Código y Prevención de Fallas de Ejecución (Anti-Crash)
*   **Tratamiento de Tipos Numéricos en Filtros:** Se corrigió un error crítico en la búsqueda local (`ejecutarFiltroAgendaLocal`) donde las cédulas o teléfonos almacenados en Sheets como números puros colapsaban la función al llamar a `.toLowerCase()`. Ahora, todos los campos de búsqueda se convierten explícitamente a cadenas de texto (`.toString()`) antes de ser procesados.
*   **Aislamiento de Errores por Fila:** Se rediseñó `obtenerTodosLosVoluntarios` para que filtre de forma preventiva las filas vacías de la base de datos y controle de forma aislada las excepciones por celda corrupta. Si una fila falla, se registra un aviso en la consola de Google, pero el directorio general se sigue cargando con éxito para el coordinador.
*   **Resolución de la Serialización de Fechas:** Las marcas de tiempo de Sheets (como `Fecha_Registro`) se leen en JavaScript como objetos `Date`. Dado que la API de Google Apps Script (`google.script.run`) falla al serializar objetos de fecha directos, se implementó una conversión a texto formateado en el servidor antes del envío al cliente.
*   **Enrutador Seguro de Enlaces (/exec):** Se optimizó la función `obtenerUrlWebApp` para verificar si la dirección recuperada termina en `/dev` y reemplazarla de forma atómica por `/exec`. Esto asegura que los enlaces dinámicos enviados por correo para registro o desuscripción sean siempre de acceso público y eludan la pantalla de "Necesitas acceso" de Google.

---

## 2. Mejoras de Experiencia de Usuario (UI/UX) y Modularidad

### A. Componente Autónomo: `FichaVoluntario.html`
*   **Desacoplamiento:** Se extrajo la estructura del panel lateral (Offcanvas) y sus funciones de control de baneo y validación de `Perfil.html` para colocarlos en un nuevo archivo independiente.
*   **Adaptador de Refresco en Vivo:** Se diseñó la función `refrescarFiltroDirectorioActivo` para detectar si el usuario se encuentra navegando en el Perfil o en la Consola de Voluntarios, ejecutando el filtro de recarga correspondiente de forma dinámica tras conmutar estatus de verificación o bloqueo.

### B. Historial de Credenciales Guardadas en Drive
*   **Tabla de Drive Scrollable:** Se reemplazó el enlace único de documentos en el perfil por una tabla Bootstrap compacta con un límite de altura fijado a 165px (con scroll de desplazamiento). Esta busca y lista en tiempo real todos los documentos físicos asociados al ID del voluntario en la carpeta de Drive.
*   **Eliminación en Cascada e Integridad:** Los usuarios o coordinadores pueden previsualizar o eliminar documentos de forma selectiva. Si un voluntario elimina su última credencial, el servidor actualiza la base de datos reajustando su estatus de verificación automáticamente a "No Verificado".

### C. Sistema de Convocatorias e Indicadores Dinámicos (Megáfono de Precisión)
*   **Ahorro de Cuota de Envío:** Se eliminó la copia automática (CC) a los coordinadores en los envíos de convocatorias (masivas e individuales), reduciendo el consumo de la cuota diaria de la API de Gmail a la mitad.
*   **Panel de Control Comparativo:** Se integró un panel superior de monitoreo que muestra, mediante semáforos de color dinámicos, la cuota diaria de correos restantes asignados por Google frente al número de voluntarios que realmente califican en el día (apto por verificación, no baneados, suscritos y sin envíos en las últimas 48 horas).
*   **Megáfono de Precisión:** Se implementó un botón con el icono de un megáfono (`fa-bullhorn`) en el extremo derecho de las tarjetas de voluntarios. Si el voluntario califica, el botón aparece activo para un envío individual rápido. Si no, se desactiva visualmente de forma automática.
*   **Siguiente Guardia Futura:** Al presionar el megáfono, un algoritmo de servidor busca de forma desatendida la guardia futura más cercana en el calendario y le envía el correo personalizado con los requerimientos específicos de ese día.

### D. Erradicación de Alertas Nativas del Navegador (Dialogs)
Se reemplazaron todos los cuadros de confirmación y alerta del navegador (`alert()` y `confirm()`) por flujos interactivos de Bootstrap integrados en el cuerpo de los modales activos:
*   **Eliminación de Guardias:** El modal se transforma en una advertencia de seguridad crítica con botones de cancelar (que restauran la vista original) o confirmar (que muestran un spinner de borrado en cascada y un gran check verde de éxito).
*   **Apertura de Guardias:** Al hacer clic en publicar, el modal pasa de forma fluida a una pantalla de éxito de confirmación automática.
*   **Asignación de Transporte y Creación de Choferes:** Los botones de "Asignar" y "Guardar" se transforman en spinners de carga y luego en estados de éxito temporal ("¡Asignado!" / "¡Registrado!") con bordes rojos dinámicos en caso de campos vacíos.
*   **Inscripción y Retiro de Voluntario:** Se configuró un sistema de alternancia inteligente de botones (Inscribirme / Darme de baja) que muestra advertencias de retiro y éxitos de postulación dinámicos con checks gigantes y auto-cierre de ventanas en 1.5 segundos.
