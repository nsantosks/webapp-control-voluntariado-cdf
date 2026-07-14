// ==========================================================================
// ARCHIVO: Código.gs (Infraestructura de Datos y Gobierno Centralizado)
// ==========================================================================

function doGet(e) {
  // Extraemos el parámetro de la página en minúsculas
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page.toString().toLowerCase().trim() : "";
  
  // Enrutamiento para la vista de impresión del manifiesto
  if (page === 'manifiesto' || page === 'manifiestopdf') {
    const template = HtmlService.createTemplateFromFile('manifiestoPDF'); 
    
    // CAPTURA CRÍTICA: Capturamos el id de la guardia directamente desde el servidor
    template.idGuardiaServidor = (e && e.parameter && e.parameter.id) ? e.parameter.id.toString().trim() : "";
    
    return template.evaluate()
        .setTitle('Manifiesto de Carga - Cadena de Favores')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  // Por defecto sirve la SPA principal (Index)
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Voluntariado - Cadena de Favores')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSheetData() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const ssId = scriptProperties.getProperty('SPREADSHEET_ID');
  if (!ssId) {
    throw new Error("No se ha configurado el SPREADSHEET_ID en las propiedades del script.");
  }
  return SpreadsheetApp.openById(ssId);
}

// ==========================================================================
// MÓDULO DE AUTENTICACIÓN Y SESIÓN OTP (CONTROL DE ACCESOS SEGMENTADO)
// ==========================================================================

function verificarUsuarioYEnviarCodigo(email) {
  try {
    if (!email) return { status: "ERROR", message: "Correo obligatorio." };
    const cleanEmail = email.trim().toLowerCase();
    
    const ss = getSheetData();
    const hoja = ss.getSheetByName("Maestro_Especialistas");
    const datos = hoja.getDataRange().getValues();
    datos.shift(); // Omitir cabecera
    
    const indexEmail = 7; // Columna H
    let usuario = datos.find(row => row[indexEmail] && row[indexEmail].toString().trim().toLowerCase() === cleanEmail);
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    CacheService.getScriptCache().put(cleanEmail, otp, 300); // 5 minutos de validez
    
    MailApp.sendEmail({
      to: cleanEmail,
      subject: "Código de Acceso - Cadena de Favores Vzla",
      body: "Tu código único para iniciar sesión o registrar tu perfil es: " + otp + "\n\nEste código vencerá en 5 minutos."
    });
    
    if (usuario) {
      return { status: "EXISTENTE", message: "Código enviado. Usuario registrado en el maestro." };
    } else {
      return { status: "NUEVO", message: "Código enviado. Correo nuevo detectado." };
    }
  } catch (error) {
    console.error("Error en verificarUsuarioYEnviarCodigo: " + error.toString());
    return { status: "ERROR", message: "Fallo en servidor: " + error.toString() };
  }
}

function validarCodigoEIniciarSesion(email, otpIngresado, rolSolicitado) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const otpGuardado = CacheService.getScriptCache().get(cleanEmail);
    
    if (otpGuardado && otpGuardado === otpIngresado) {
      let perfilRes = obtenerPerfilUsuario(cleanEmail);
      
      // Control de acceso estricto para Coordinación
      if (rolSolicitado === "coordinador") {
        if (perfilRes.status === "NOT_FOUND" || !perfilRes.perfil || !perfilRes.perfil.esCoordinador) {
          return { 
            status: "ERROR", 
            message: "Acceso Denegado: Su usuario no cuenta con credenciales autorizadas para operar como Coordinador." 
          };
        }
      }
      
      CacheService.getScriptCache().remove(cleanEmail);
      
      // Si el usuario NO existe, NO creamos una fila vacía aquí.
      // Simplemente le decimos al Frontend que lo envíe al formulario de registro.
      if (perfilRes.status === "NOT_FOUND" || !perfilRes.perfil) {
          return { 
            status: "REQUIRES_REGISTRATION", 
            email: cleanEmail 
          };
      }
      
      // Si ya existía, entra normal
      return { status: "SUCCESS", perfil: perfilRes.perfil };
    }
    return { status: "ERROR", message: "El código de seguridad es inválido o ha expirado." };
  } catch (error) {
    return { status: "ERROR", message: "Error interno de validación: " + error.toString() };
  }
}

// ==========================================================================
// MÓDULO DE GESTIÓN DE PERFILES Y COMPETENCIAS (TOPOLOGÍA 16 COLUMNAS)
// ==========================================================================

function obtenerPerfilUsuario(email) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const ss = getSheetData();
    const hoja = ss.getSheetByName("Maestro_Especialistas");
    const hojaPuntos = ss.getSheetByName("Maestro_Puntos_Reunion"); // <-- Referencia nueva
    
    const datos = hoja.getDataRange().getValues();
    const puntos = hojaPuntos.getDataRange().getValues();
    datos.shift();
    puntos.shift();
    
    const indexEmail = 7; 
    let usuario = datos.find(row => row[indexEmail] && row[indexEmail].toString().trim().toLowerCase() === cleanEmail);
    
    if (usuario) {
      const valorCoordinacion = usuario[9] ? usuario[9].toString().trim().toUpperCase() : "";
      const esCoordinadorReal = (valorCoordinacion === "TRUE" || valorCoordinacion === "SI" || valorCoordinacion === "SÍ" || valorCoordinacion === "VERIFICADO" || usuario[9] === true);
      const esBaneado = (usuario[13] === true || usuario[13]?.toString().toUpperCase() === "TRUE");
      
      // --- TRADUCCIÓN DE ID A NOMBRE PARA EL PUNTO DE RECOGIDA ---
      const idPunto = usuario[4] ? usuario[4].toString().trim() : "";
      const puntoObj = puntos.find(p => p[0].toString().trim() === idPunto);
      const nombrePuntoVisual = puntoObj ? puntoObj[1] : idPunto; // Si no hay ID, deja lo que esté escrito

      let fechaSegura = "";
      if (usuario[16]) {
          fechaSegura = (usuario[16] instanceof Date) ? Utilities.formatDate(usuario[16], Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss") : usuario[16].toString();
      }

      return {
        status: "SUCCESS",
        perfil: {
          id: usuario[0], nombre: usuario[1], voluntariado: usuario[2], especialidad: usuario[3], 
          puntoRecogida: nombrePuntoVisual, // Mostramos el Nombre
          puntoRecogidaID: idPunto,        // Guardamos el ID oculto para el select
          verificado: (usuario[5] === "Verificado" || usuario[5] === true),
          telefono: usuario[6], email: usuario[7], docUrl: usuario[8], Documentacion_URL: usuario[8],
          esCoordinador: esCoordinadorReal, cedula: usuario[10] || "", imagen_profile: usuario[11] || "",
          direccion: usuario[12] || "", banned: esBaneado, fechaRegistro: fechaSegura
        }
      };
    }
    return { status: "NOT_FOUND", perfil: null };
  } catch (error) { return { status: "ERROR", message: error.toString() }; }
}

/**
 * Optimización y blindaje de compatibilidad
 * Redirige el flujo al motor unificado para evitar duplicidad de lógica de escritura y mantener la topología de 12 columnas.
 */
function actualizarPerfilVoluntario(email, datosModificados) {
  try {
    const perfilPrevio = obtenerPerfilUsuario(email);
    const idExistente = (perfilPrevio.status === "SUCCESS" && perfilPrevio.perfil) ? perfilPrevio.perfil.id : "";
    
    const payloadEstandarizado = {
      ID_Voluntario: idExistente,
      Nombre_Completo: datosModificados.nombre,
      Voluntariado: datosModificados.voluntariado,
      Especialidad: datosModificados.especialidad,
      Punto_Recogida_Preferido: datosModificados.puntoRecogida,
      Telefono: datosModificados.telefono,
      Correo: email.trim().toLowerCase(),
      imagen_profile_actual: (perfilPrevio.perfil) ? perfilPrevio.perfil.imagen_profile : "",
      Documentacion_URL_actual: (perfilPrevio.perfil) ? perfilPrevio.perfil.docUrl : "",
      cedula: (perfilPrevio.perfil) ? perfilPrevio.perfil.cedula : ""
    };
    
    return registrarOActualizarVoluntario(payloadEstandarizado);
  } catch (error) {
    console.error("Error en wrapper actualizarPerfilVoluntario: " + error.toString());
    return { status: "ERROR", message: error.toString() };
  }
}

function obtenerEspecialidadesUnicasMaestro() {
  try {
    const ss = getSheetData();
    const hoja = ss.getSheetByName("Maestro_Especialistas");
    if (!hoja) return [];
    
    const datos = hoja.getDataRange().getValues();
    datos.shift();
    
    const indexEspecialidad = 3; // Columna D
    let especialidadesSet = new Set();
    
    datos.forEach(row => {
      if (row[indexEspecialidad] && row[indexEspecialidad].toString().trim() !== "") {
        especialidadesSet.add(row[indexEspecialidad].toString().trim());
      }
    });
    
    return Array.from(especialidadesSet);
  } catch (error) {
    console.error("Error en obtenerEspecialidadesUnicasMaestro: " + error.toString());
    return [];
  }
}

// ==========================================================================
// MÓDULO DE LOGÍSTICA (CALENDARIO Y ASIGNACIONES REGULADAS)
// ==========================================================================

function getDatosCalendario() {
  try {
    const ss = getSheetData();
    const sheetRegistros = ss.getSheetByName("Registro_Principal");
    const sheetDetalleReq = ss.getSheetByName("Detalle_Requerimientos");
    const sheetDetalleVol = ss.getSheetByName("Detalle_Voluntarios");
    const sheetEspecialistas = ss.getSheetByName("Maestro_Especialistas");
    const sheetPuntos = ss.getSheetByName("Maestro_Puntos_Reunion"); // <-- NUEVA REFERENCIA
    
    if (!sheetRegistros || !sheetDetalleReq || !sheetDetalleVol || !sheetEspecialistas || !sheetPuntos) {
        throw new Error("Faltan hojas críticas en la base de datos.");
    }

    const registrosData = sheetRegistros.getDataRange().getValues();
    const reqData = sheetDetalleReq.getDataRange().getValues();
    const volData = sheetDetalleVol.getDataRange().getValues();
    const specialistsData = sheetEspecialistas.getDataRange().getValues();
    const puntosData = sheetPuntos.getDataRange().getValues(); // <-- CARGAMOS PUNTOS

    registrosData.shift(); 
    reqData.shift();
    volData.shift();
    specialistsData.shift();
    puntosData.shift();

    let guardias = [];
    
    registrosData.forEach(row => {
      let idRegistro = row[0];
      if (!idRegistro) return;
      
      let fecha = new Date(row[1]);
      let idDestino = row[2]; // Esto ahora es "D001", "P001", etc.
      let idTransportista = row[3]; 

      // --- LÓGICA DE TRADUCCIÓN DE DESTINO ---
      // Buscamos el nombre del destino basado en el ID guardado
      const puntoEncontrado = puntosData.find(p => p[0].toString().trim() === idDestino.toString().trim());
      const nombreDestinoVisual = puntoEncontrado ? puntoEncontrado[1] : (idDestino || "Sin Destino");
      
      let requerimientoTotal = 0;
      let detalleRequerimientos = [];
      reqData.forEach(req => {
        if(req[1] == idRegistro) {
          requerimientoTotal += parseInt(req[3] || 0);
          detalleRequerimientos.push({ especialidad: req[2], cantidad: req[3] });
        }
      });
           
      let voluntariosInscritos = 0;
      let listaCorreosInscritos = [];
      volData.forEach(vol => {
         if(vol[1] == idRegistro) {
           voluntariosInscritos++;
           if (vol[2]) {
             const cleanEmail = vol[2].toString().trim().toLowerCase();
             const esp = specialistsData.find(e => e[7] && e[7].toString().trim().toLowerCase() === cleanEmail);
             if (esp) {
               listaCorreosInscritos.push(`${esp[1]} | ${esp[3]} | ${cleanEmail}`);
             } else {
               listaCorreosInscritos.push(`Nuevo | S/P | ${cleanEmail}`);
             }
           }
         }
      });
      
      guardias.push({
        id: idRegistro,
        fecha: fecha,
        fechaStr: Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd"),
        destino: nombreDestinoVisual, // <-- ENVIAMOS EL NOMBRE REAL AL CALENDARIO
        idTransportista: idTransportista ? idTransportista.toString().trim() : "", 
        tieneTransporte: (idTransportista && idTransportista !== ""),
        requerimientoTotal: requerimientoTotal,
        voluntariosInscritos: voluntariosInscritos,
        detallesRequeridos: detalleRequerimientos,
        correosInscritos: listaCorreosInscritos 
      });
    });
    
    return JSON.stringify({status: 'success', data: guardias});
  } catch (error) {
    return JSON.stringify({status: 'error', message: error.toString()});
  }
}

function asignarVoluntarioAGuardia(email, idGuardia) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const cleanEmail = email.trim().toLowerCase();
    const ss = getSheetData();
    const sheetVol = ss.getSheetByName("Detalle_Voluntarios");
    
    const datosVol = sheetVol.getDataRange().getValues();
    const yaInscrito = datosVol.some(row => row[1] == idGuardia && row[2].toString().trim().toLowerCase() === cleanEmail);
    
    if (yaInscrito) {
      return { status: "ERROR", message: "Ya se encuentra inscrito en esta guardia." };
    }
    
    const nuevoIdUnico = "DET-" + generarIDAlfanumericoUnico(8);
    sheetVol.appendRow([nuevoIdUnico, idGuardia, cleanEmail, new Date()]);
    return { status: "SUCCESS" };
  } catch (error) {
    return { status: "ERROR", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function removerVoluntarioDeGuardia(email, idGuardia) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const cleanEmail = email.trim().toLowerCase();
    const ss = getSheetData();
    const sheetVol = ss.getSheetByName("Detalle_Voluntarios");
    const rows = sheetVol.getDataRange().getValues();
    
    let filaAEliminar = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] == idGuardia && rows[i][2].toString().trim().toLowerCase() === cleanEmail) {
        filaAEliminar = i + 1; 
        break;
      }
    }
    
    if (filaAEliminar !== -1) {
      sheetVol.deleteRow(filaAEliminar);
      return { status: "SUCCESS" };
    }
    return { status: "ERROR", message: "No se encontró registro de inscripción activo." };
  } catch (error) {
    return { status: "ERROR", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================================================
// FUNCIONES AUXILIARES Y DE INFRAESTRUCTURA DE DATOS
// ==========================================================================

function generarIDAlfanumericoUnico(longitud = 8) {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < longitud; i++) {
    token += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return token;
}

function obtenerPuntosRecogidaMaestro() {
  try {
    const ss = getSheetData();
    const hoja = ss.getSheetByName("Maestro_Puntos_Reunion");
    if (!hoja) return []; 
    
    const datos = hoja.getDataRange().getValues();
    datos.shift(); // Omitir cabecera
    
    // Devolvemos un array de objetos con ID y Nombre
    return datos.map(row => ({
      id: row[0] ? row[0].toString().trim() : "",
      nombre: row[1] ? row[1].toString().trim() : ""
    })).filter(item => item.id !== "" && item.nombre !== "");

  } catch (error) {
    console.error("Error en obtenerPuntosRecogidaMaestro: " + error.toString());
    return [];
  }
}

// ==========================================================================
// MÓDULO EXPANSIÓN COORDINACIÓN: GESTIÓN TRANSACCIONAL AVANZADA
// ==========================================================================

function crearNuevaGuardiaCoordinador(fechaStr, datosGuardia, emailCoordinador) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = getSheetData();
    const sheetRegistros = ss.getSheetByName("Registro_Principal");
    const sheetDetalleReq = ss.getSheetByName("Detalle_Requerimientos");
    
    const idGuardiaNuevo = "GUA-" + generarIDAlfanumericoUnico(8);
    const partesFecha = fechaStr.split('-');
    const objetoFecha = new Date(partesFecha[0], partesFecha[1] - 1, partesFecha[2]);

    // NUEVO: Buscamos los datos exactos del coordinador usando su correo
    let nombreCoord = "N/D";
    let telefonoCoord = "N/D";
    let correoCoord = emailCoordinador ? emailCoordinador.trim().toLowerCase() : "N/D";

    if (correoCoord !== "N/D") {
        const perfilCoord = obtenerPerfilUsuario(correoCoord);
        if (perfilCoord && perfilCoord.status === "SUCCESS") {
            nombreCoord = perfilCoord.perfil.nombre || "N/D";
            telefonoCoord = perfilCoord.perfil.telefono || "N/D";
        }
    }

    // NUEVO: Ahora insertamos las 7 columnas solicitadas
    sheetRegistros.appendRow([
      idGuardiaNuevo,                        // A (0): ID_Registro
      objetoFecha,                           // B (1): Fecha_Guardia
      datosGuardia.destino || "Base General",// C (2): ID_Destino
      datosGuardia.idTransportista || "",    // D (3): ID_Transportista
      nombreCoord,                           // E (4): Nombre_Coordinador
      telefonoCoord,                         // F (5): Telefono_Coordinador
      correoCoord                            // G (6): Correo_Coordinador
    ]);

    if (datosGuardia.requerimientos && datosGuardia.requerimientos.length > 0) {
      datosGuardia.requerimientos.forEach(req => {
        sheetDetalleReq.appendRow([
          "REQ-" + generarIDAlfanumericoUnico(8),
          idGuardiaNuevo,
          req.especialidad,
          parseInt(req.cantidad || 0)
        ]);
      });
    }
    return { status: "SUCCESS", idGuardia: idGuardiaNuevo };
  } catch (error) {
    return { status: "ERROR", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function eliminarGuardiaCompletaCoordinador(idGuardia) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = getSheetData();
    
    ["Registro_Principal", "Detalle_Requerimientos", "Detalle_Voluntarios"].forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      const data = sheet.getDataRange().getValues();
      const colIndex = (sheetName === "Registro_Principal") ? 0 : 1;
      
      for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][colIndex] == idGuardia) {
          sheet.deleteRow(i + 1);
        }
      }
    });

    return { status: "SUCCESS" };
  } catch (error) {
    return { status: "ERROR", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function actualizarTransporteGuardia(idGuardia, idTransportista) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = getSheetData();
    const sheet = ss.getSheetByName("Registro_Principal");
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == idGuardia) {
        sheet.getRange(i + 1, 4).setValue(idTransportista); 
        return { status: "SUCCESS" };
      }
    }
    return { status: "ERROR", message: "No se localizó la guardia solicitada." };
  } catch (error) {
    return { status: "ERROR", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function actualizarRequerimientosGuardia(idGuardia, requerimientosNuevos) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = getSheetData();
    const sheet = ss.getSheetByName("Detalle_Requerimientos");
    const data = sheet.getDataRange().getValues();
    
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][1] == idGuardia) {
        sheet.deleteRow(i + 1);
      }
    }
    
    requerimientosNuevos.forEach(req => {
      sheet.appendRow([
        "REQ-" + generarIDAlfanumericoUnico(8), 
        idGuardia, 
        req.especialidad, 
        parseInt(req.cantidad || 0)
      ]);
    });

    return { status: "SUCCESS" };
  } catch (error) {
    return { status: "ERROR", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function obtenerCatalogoVoluntariosTransporte() {
  try {
    const ss = getSheetData();
    const hoja = ss.getSheetByName("Maestro_Transportistas");
    if (!hoja) return [];
    
    const datos = hoja.getDataRange().getValues();
    datos.shift();
    
    let transportistas = [];
    datos.forEach(row => {
      const id = row[0] ? row[0].toString().trim() : "";
      const nombreChofer = row[1] ? row[1].toString().trim() : "";
      const estatus = row[5] ? row[5].toString().trim().toUpperCase() : "";
      
      if (id !== "" && estatus === "VERIFICADO") {
        transportistas.push({ id: id, ...nombreChofer ? { nombre: nombreChofer } : { nombre: "Sin Nombre" } });
      }
    });
    return transportistas;
  } catch (error) {
    return [];
  }
}

function registrarNuevoTransportistaRapido(nombreEmpresa, telefono) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); 
    if (!nombreEmpresa) return { status: "ERROR", message: "El nombre de la empresa/transportista es obligatorio." };

    const ss = getSheetData();
    const hoja = ss.getSheetByName("Maestro_Transportistas");
    if (!hoja) throw new Error("No se pudo localizar la hoja Maestro_Transportistas.");

    const nuevoId = "TRA-" + generarIDAlfanumericoUnico(5);
    
    hoja.appendRow([
      nuevoId,
      nombreEmpresa.trim(),
      "",                   
      "",                   
      telefono ? telefono.trim() : "N/D",
      "VERIFICADO"         
    ]);

    return { 
      status: "SUCCESS", 
      nuevoTransportista: { id: nuevoId, nombre: nombreEmpresa.trim() } 
    };
  } catch (error) {
    console.error("Error en registrarNuevoTransportistaRapido: " + error.toString());
    return { status: "ERROR", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function generarDataManifiestoGuardia(idGuardia) {
  try {
    const ss = getSheetData();
    const sheetRegistros = ss.getSheetByName("Registro_Principal");
    const sheetVoluntarios = ss.getSheetByName("Detalle_Voluntarios");
    const sheetEspecialistas = ss.getSheetByName("Maestro_Especialistas");
    const sheetTransportistas = ss.getSheetByName("Maestro_Transportistas");
    const sheetPuntos = ss.getSheetByName("Maestro_Puntos_Reunion"); // <-- REFERENCIA AL MAESTRO

    const registros = sheetRegistros.getDataRange().getValues();
    const asignaciones = sheetVoluntarios.getDataRange().getValues();
    const especialistas = sheetEspecialistas.getDataRange().getValues();
    const transportistas = sheetTransportistas ? sheetTransportistas.getDataRange().getValues() : [];
    const puntosData = sheetPuntos.getDataRange().getValues(); // <-- CARGAR PUNTOS

    registros.shift();
    asignaciones.shift();
    especialistas.shift();
    if(transportistas.length > 0) transportistas.shift();
    puntosData.shift();

    const guardia = registros.find(r => r[0] == idGuardia);
    if (!guardia) throw new Error("Guardia inexistente en el registro operativo.");

    // --- LÓGICA DE TRADUCCIÓN DE DESTINO ---
    const idDestino = guardia[2] ? guardia[2].toString().trim() : "";
    const puntoEncontrado = puntosData.find(p => p[0].toString().trim() === idDestino);
    const nombreDestinoVisual = puntoEncontrado ? puntoEncontrado[1] : (idDestino || "No Especificado");

    const fechaOrigen = new Date(guardia[1]);
    const fechaFormateada = Utilities.formatDate(fechaOrigen, Session.getScriptTimeZone(), "dd/MM/yyyy");

    const idTransportista = guardia[3] ? guardia[3].toString().trim() : "";
    let infoChofer = { nombre: "NO ASIGNADO", telefono: "N/D", especialidad: "Transporte" };

    if (idTransportista && transportistas.length > 0) {
      const chofer = transportistas.find(t => t[0].toString().trim() === idTransportista);
      if (chofer) {
        infoChofer = { nombre: chofer[1], telefono: chofer[4] || "N/D", especialidad: "Unidad Verificada" };
      }
    }

    let tripulacion = [];
    asignaciones.forEach(asig => {
      if (asig[1] == idGuardia) {
        const correoVol = asig[2].toString().trim().toLowerCase();
        const esp = especialistas.find(e => e[7] && e[7].toString().trim().toLowerCase() === correoVol);
        if (esp) {
          tripulacion.push({
            cedula: esp[10] ? esp[10].toString().trim() : "N/D",
            nombre: esp[1] ? esp[1].toString().trim() : "Sin Nombre",
            voluntariado: esp[2] ? esp[2].toString().trim() : "General",
            especialidad: esp[3] ? esp[3].toString().trim() : "N/D",
            telefono: esp[6] ? esp[6].toString().trim() : "N/D"
          });
        }
      }
    });

    return {
      status: "SUCCESS",
      manifiesto: {
        idGuardia: idGuardia,
        logoBase64: getLogoAsBase64(),
        fecha: fechaFormateada, 
        destino: nombreDestinoVisual, // <-- ENVIAMOS EL NOMBRE REAL AL PDF
        transporte: infoChofer,
        pasajeros: tripulacion,
        totalPasajeros: tripulacion.length
      }
    };

  } catch (error) {
    console.error("Error en generarDataManifiestoGuardia: " + error.toString());
    return { status: "ERROR", message: "Falla interna en Apps Script: " + error.toString() };
  }
}

function obtenerUrlWebApp() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return "";
  }
}

function guardarLogoBase64() {
  const logoB64 = "TU_STRING_BASE64_AQUI"; 
  PropertiesService.getScriptProperties().setProperty('LOGO_B64', logoB64);
}

function getLogoAsBase64() {
  const url = PropertiesService.getScriptProperties().getProperty('LOGO_URL');
  if (!url) return "";
  
  try {
    const response = UrlFetchApp.fetch(url);
    const blob = response.getBlob();
    return "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    console.error("Error al convertir el logo desde la URL proporcionada: " + e.toString());
    return "";
  }
}

/**
 * Procesa un archivo enviado en Base64 desde el frontend, lo guarda en Drive
 * y retorna un objeto con la URL pública y el Nombre Estandarizado generado.
 */
function guardarArchivoEnDrive(base64Data, tipoPrefijo, codigoVoluntario, nombreOriginal) {
  if (!base64Data || base64Data.trim() === "") return null;

  const folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_DOCS_ID');
  if (!folderId) {
    throw new Error("La propiedad 'FOLDER_DOCS_ID' no está configurada.");
  }
  
  const folder = DriveApp.getFolderById(folderId);

  let purgaBase64 = base64Data;
  let contentType = "application/octet-stream";
  
  if (base64Data.indexOf("data:") === 0) {
    const partes = base64Data.split(",");
    contentType = partes[0].split(";")[0].split(":")[1];
    purgaBase64 = partes[1];
  }

  const extension = nombreOriginal.includes('.') ? nombreOriginal.split('.').pop() : 'bin';
  const timestamp = Utilities.formatDate(new Date(), "GMT-4", "yyyyMMdd_HHmmss");
  
  // ESTE ES EL NOMBRE QUE NECESITAMOS PARA APPSHEET
  const nombreEstandarizado = `${tipoPrefijo}_${codigoVoluntario}_${timestamp}.${extension}`;

  const datosBinarios = Utilities.base64Decode(purgaBase64);
  const blob = Utilities.newBlob(datosBinarios, contentType, nombreEstandarizado);
  const archivoCreado = folder.createFile(blob);

  archivoCreado.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // NUEVO: Retornamos ambas cosas (URL y el Nombre Físico)
  return {
    url: archivoCreado.getUrl(),
    nombreArchivo: nombreEstandarizado
  };
}

/**
 * Procesa el formulario del voluntario, guarda sus archivos si existen y persiste en la hoja.
 * Mantiene intactos los privilegios de Coordinación y Estatus como booleanos puros.
 */
function registrarOActualizarVoluntario(form) {
  try {
    const ss = getSheetData();
    const sheet = ss.getSheetByName("Maestro_Especialistas");
    if (!sheet) throw new Error("No se encontró la pestaña 'Maestro_Especialistas'");

    const data = sheet.getDataRange().getValues();
    const idVoluntario = form.ID_Voluntario || "VOL-" + generarIDAlfanumericoUnico(8); 
    
    let filaDestino = -1;
    let coordinacionActual = false; 
    let bannedActual = false; 
    let fechaRegistroActual = new Date(); 
    
    // Variables para preservar las rutas de AppSheet si no se suben nuevos archivos
    let docAppsheetActual = "";
    let imgAppsheetActual = "";
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === idVoluntario.toString()) {
        filaDestino = i + 1;
        coordinacionActual = (data[i][9] === true || data[i][9]?.toString().toUpperCase() === "TRUE");
        bannedActual = (data[i][13] === true || data[i][13]?.toString().toUpperCase() === "TRUE");
        docAppsheetActual = data[i][14] || ""; // Columna O actual
        imgAppsheetActual = data[i][15] || ""; // Columna P actual
        
        if (data[i][16] && data[i][16] !== "") {
            fechaRegistroActual = data[i][16];
        }
        break;
      }
    }

    // --- GESTIÓN DE ARCHIVOS Y RUTAS APPSHEET ---
    let urlProfile = form.imagen_profile_actual || "";
    let urlDoc = form.Documentacion_URL_actual || "";

    if (form.imagen_profile_base64 && form.imagen_profile_nombre) {
      const resProfile = guardarArchivoEnDrive(form.imagen_profile_base64, "PROFILE", idVoluntario, form.imagen_profile_nombre);
      if (resProfile) {
          urlProfile = resProfile.url;
          // Concatenación exacta solicitada para AppSheet
          imgAppsheetActual = "Documentacion/" + resProfile.nombreArchivo; 
      }
    }
    
    if (form.Documentacion_base64 && form.Documentacion_nombre) {
      const resDoc = guardarArchivoEnDrive(form.Documentacion_base64, "DOC", idVoluntario, form.Documentacion_nombre);
      if (resDoc) {
          urlDoc = resDoc.url;
          // Concatenación exacta solicitada para AppSheet
          docAppsheetActual = "Documentacion/" + resDoc.nombreArchivo; 
      }
    }

    // --- LÓGICA AUTO-VERIFICACIÓN (9 CAMPOS) ---
    const camposObligatorios = [
      idVoluntario, form.Nombre_Completo, form.Voluntariado, form.Especialidad,
      form.Punto_Recogida_Preferido, form.Telefono, form.cedula, urlDoc, urlProfile
    ];
    const estaCompleto = camposObligatorios.every(val => val && val.toString().trim() !== "");
    let estatusFinal = estaCompleto ? "Verificado" : "No Verificado";

    // --- MAPEO FINAL DE 17 COLUMNAS ---
    const filaValores = [
      idVoluntario,                       // A
      form.Nombre_Completo || "",         // B
      form.Voluntariado || "",            // C
      form.Especialidad || "",            // D
      form.Punto_Recogida_Preferido || "",// E
      estatusFinal,                       // F 
      form.Telefono || "",                // G
      form.Correo || "",                  // H
      urlDoc,                             // I
      coordinacionActual,                 // J
      form.cedula || "",                  // K
      urlProfile,                         // L
      form.direccion || "",               // M 
      bannedActual,                       // N 
      docAppsheetActual,                  // O (Formato: Documentacion/DOC_VOL...)
      imgAppsheetActual,                  // P (Formato: Documentacion/PROFILE_VOL...)
      fechaRegistroActual                 // Q 
    ];

    if (filaDestino !== -1) {
      sheet.getRange(filaDestino, 1, 1, filaValores.length).setValues([filaValores]);
    } else {
      sheet.appendRow(filaValores);
    }
    
    SpreadsheetApp.flush(); 

    return { status: "SUCCESS", perfil: obtenerPerfilUsuario(form.Correo).perfil };
  } catch (e) {
    return { status: "ERROR", message: e.toString() };
  }
}

/**
 * Conmuta de forma atómica el estatus de verificación de un voluntario por su ID.
 */
function cambiarEstatusVerificacion(idVoluntario, nuevoEstatus) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // 15 segundos máximo de retención en cola
    
    const ss = getSheetData();
    const sheet = ss.getSheetByName("Maestro_Especialistas");
    if (!sheet) throw new Error("No se localizó la pestaña 'Maestro_Especialistas'");
    
    const data = sheet.getDataRange().getValues();
    let filaIndex = -1;
    let correoVoluntario = "";
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === idVoluntario.toString().trim()) {
        filaIndex = i + 1;
        correoVoluntario = data[i][7]; // Columna H para re-indexar caché
        break;
      }
    }
    
    if (filaIndex === -1) throw new Error("El voluntario no existe en el registro maestro.");
    
    // Impactamos atómicamente la Columna F (Estatus_Verificacion)
    sheet.getRange(filaIndex, 6).setValue(nuevoEstatus);
    
    // Forzamos la obtención del perfil completo actualizado para sincronizar el cliente
    const respuestaPerfil = obtenerPerfilUsuario(correoVoluntario);
    
    return {
      status: "SUCCESS",
      message: `Estatus modificado con éxito a: ${nuevoEstatus}`,
      perfil: respuestaPerfil.perfil
    };
    
  } catch (e) {
    console.error("Error en cambiarEstatusVerificacion: " + e.toString());
    return { status: "ERROR", message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Recupera la lista completa de especialistas del maestro para el directorio del coordinador.
 */
function obtenerTodosLosVoluntarios() {
  try {
    const ss = getSheetData();
    const sheet = ss.getSheetByName("Maestro_Especialistas");
    const sheetPuntos = ss.getSheetByName("Maestro_Puntos_Reunion"); // <-- Referencia necesaria
    if (!sheet || !sheetPuntos) return [];
    
    const data = sheet.getDataRange().getValues();
    const puntosData = sheetPuntos.getDataRange().getValues();
    data.shift(); 
    puntosData.shift();
    
    return data.map(row => {
      const valorCoord = row[9] ? row[9].toString().trim().toUpperCase() : "";
      const esBanned = (row[13] === true || row[13]?.toString().toUpperCase() === "TRUE");
      
      // --- LÓGICA DE TRADUCCIÓN DE ID A NOMBRE PARA EL DIRECTORIO ---
      const idPunto = row[4] ? row[4].toString().trim() : "";
      const puntoObj = puntosData.find(p => p[0].toString().trim() === idPunto);
      const nombrePuntoVisual = puntoObj ? puntoObj[1] : (idPunto || "Sin Punto");

      // Corrección de fecha para evitar errores de envío
      let fechaSegura = "";
      if (row[16]) {
          fechaSegura = (row[16] instanceof Date) ? Utilities.formatDate(row[16], Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss") : row[16].toString();
      }

      return {
        id: row[0], 
        nombre: row[1], 
        voluntariado: row[2], 
        especialidad: row[3],
        puntoRecogida: nombrePuntoVisual, // <-- Ahora enviamos el NOMBRE (Guacara, etc.)
        puntoRecogidaID: idPunto,        // Guardamos el ID por si se necesita
        verificado: (row[5] === "Verificado" || row[5] === true),
        telefono: row[6], 
        email: row[7], 
        docUrl: row[8],
        esCoordinador: (valorCoord === "TRUE" || valorCoord === "SI"),
        cedula: row[10] || "", 
        imagen_profile: row[11] || "",
        direccion: row[12] || "", 
        banned: esBanned,
        fechaRegistro: fechaSegura
      };
    });
  } catch (e) { 
    console.error("Error al obtener directorio: " + e.toString());
    return []; 
  }
}

function cambiarEstatusBaneo(idVoluntario, esBaneado) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSheetData();
    const sheet = ss.getSheetByName("Maestro_Especialistas");
    const data = sheet.getDataRange().getValues();
    let fila = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === idVoluntario.toString()) { fila = i + 1; break; }
    }
    if (fila !== -1) {
      sheet.getRange(fila, 14).setValue(esBaneado); // Columna N
      return { status: "SUCCESS" };
    }
    return { status: "ERROR", message: "No se encontró el ID" };
  } catch (e) { return { status: "ERROR", message: e.toString() }; }
  finally { lock.releaseLock(); }
}

/**
 * Convierte un archivo de Drive a Base64 para eludir bloqueos de Hotlinking en el cliente.
 */
function obtenerImagenBase64(urlDrive) {
  try {
    if (!urlDrive || urlDrive.trim() === "") return null;
    
    // Extraer el ID del archivo de la URL
    const matchId = urlDrive.match(/\/d\/([a-zA-Z0-9_-]+)/) || urlDrive.match(/id=([a-zA-Z0-9_-]+)/);
    
    if (matchId && matchId[1]) {
      const id = matchId[1];
      const file = DriveApp.getFileById(id);
      const blob = file.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      
      // Retornar la cadena con el Data URI scheme listo para la etiqueta <img>
      return "data:" + blob.getContentType() + ";base64," + base64;
    }
    return null;
  } catch(e) {
    console.error("Error convirtiendo imagen a Base64: " + e.toString());
    return null;
  }
}

/**
 * Genera un PDF binario del manifiesto y lo retorna como un string Base64 
 * para que el navegador lo descargue automáticamente.
 */
function descargarManifiestoComoPDF(idGuardia) {
  try {
    // 1. Preparamos el template con el ID
    const template = HtmlService.createTemplateFromFile('manifiestoPDF');
    template.idGuardiaServidor = idGuardia;
    
    // 2. Evaluamos el HTML (Importante: esto dispara la lógica de generarDataManifiestoGuardia)
    const htmlContent = template.evaluate().getContent();
    
    // 3. Convertimos el HTML a PDF usando el servicio de Google
    const blob = Utilities.newBlob(htmlContent, 'text/html', 'manifiesto.html');
    const pdfBlob = blob.getAs('application/pdf');
    
    // 4. Nombre del archivo personalizado
    pdfBlob.setName("ManifiestoCF_" + idGuardia + ".pdf");
    
    // 5. Retornamos la data en Base64 para que el cliente la procese
    return {
      status: "SUCCESS",
      base64: Utilities.base64Encode(pdfBlob.getBytes()),
      fileName: pdfBlob.getName()
    };
    
  } catch (error) {
    return { status: "ERROR", message: "Error al generar PDF: " + error.toString() };
  }
}
