const db = require('../../../database/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mailService = require('../../mail/mail.service');

class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const providerTypes = new Set(['profesional', 'centro_medico']);
const providerStates = new Set(['activo', 'suspendido', 'baja']);

const normalizeCuit = (value) => String(value || '').replace(/\D/g, '');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const compactStrings = (values) => Array.isArray(values)
  ? values.map((value) => String(value || '').trim()).filter(Boolean)
  : [];

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const splitName = (nombreCompleto) => {
  const parts = String(nombreCompleto || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return {
    nombre: parts[0] || '',
    apellido: parts.slice(1).join(' ')
  };
};

const normalizeProviderPayload = (body = {}) => {
  const nameParts = [body.nombre || body.firstName, body.apellido || body.lastName].filter(Boolean).join(' ');
  const nombreCompleto = body.nombreCompleto || body.fullName || nameParts || undefined;

  return {
    ...body,
    cuitCuil: body.cuitCuil || body.cuit || body.cuit_cuil,
    nombreCompleto,
    tipoPrestador: body.tipoPrestador || body.tipo_prestador || body.providerType,
    centroMedicoId: body.centroMedicoId || body.centro_medico_id || body.medicalCenterId,
    mails: body.mails || body.emails || (body.email ? [body.email] : undefined),
    telefonos: body.telefonos || body.phones || (body.telefono || body.phone ? [body.telefono || body.phone] : undefined),
    especialidades: body.especialidades || body.specialties || body.specialtyIds,
    lugaresAtencion: body.lugaresAtencion || body.lugares_atencion || body.places,
  };
};

const sendError = (res, error, fallbackMessage) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: error.message,
      message: error.message,
      details: error.details
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    error: 'Error interno del servidor',
    message: 'Error interno del servidor'
  });
};

const getProviderState = (p) => p.estado || (p.activo ? 'activo' : 'baja');

const assertValidState = (estado) => {
  if (!providerStates.has(estado)) {
    throw new HttpError(422, 'Estado de prestador invalido', [{
      field: 'estado',
      message: 'Estado debe ser activo, suspendido o baja'
    }]);
  }
};

const validateOwnCuitAccess = async (req, targetCuit) => {
  const role = req.user?.role || req.user?.role_name;
  if (role === 'PRESTADOR') {
    const userId = req.user?.id || req.user?.id_usuario || req.user?.userId;
    const p = await db('prestadores').where('usuario_id', userId).first();
    if (!p || normalizeCuit(p.cuit) !== normalizeCuit(targetCuit)) {
      throw new HttpError(403, 'Acceso denegado. No tienes permisos para acceder a los datos de este prestador.');
    }
  }
};

const validateProviderPayload = (payload, { partial = false } = {}) => {
  const errors = [];
  const requiredErrors = [];
  const invalidErrors = [];
  const addRequired = (field, message) => requiredErrors.push({ field, message });
  const addInvalid = (field, message) => invalidErrors.push({ field, message });
  const cleanCuit = normalizeCuit(payload.cuitCuil);
  const mails = compactStrings(payload.mails).map(normalizeEmail);
  const telefonos = compactStrings(payload.telefonos);
  const tipoPrestador = payload.tipoPrestador || 'profesional';
  const nombreCompleto = String(payload.nombreCompleto || '').trim();
  const lugaresAtencion = Array.isArray(payload.lugaresAtencion) ? payload.lugaresAtencion : [];
  const especialidades = Array.isArray(payload.especialidades) ? payload.especialidades : [];

  if (!partial || payload.cuitCuil !== undefined) {
    if (!cleanCuit && !String(payload.cuitCuil || '').trim()) addRequired('cuitCuil', 'CUIT/CUIL es requerido');
    else if (!cleanCuit) addInvalid('cuitCuil', 'CUIT/CUIL debe contener digitos');
    else if (!/^\d{7,11}$/.test(cleanCuit)) addInvalid('cuitCuil', 'CUIT/CUIL debe tener entre 7 y 11 digitos');
  }

  if (!partial || payload.nombreCompleto !== undefined) {
    if (!nombreCompleto) addRequired('nombreCompleto', 'Nombre completo es requerido');
  }

  if (!partial || payload.tipoPrestador !== undefined) {
    if (!providerTypes.has(tipoPrestador)) addInvalid('tipoPrestador', 'Tipo de prestador invalido');
  }

  if (!partial || payload.mails !== undefined) {
    if (mails.length === 0) addRequired('mails', 'Debe informar al menos un email');
    const invalidEmail = mails.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalidEmail) addInvalid('mails', `Email invalido: ${invalidEmail}`);
  }

  if (!partial || payload.telefonos !== undefined) {
    if (telefonos.length === 0) addRequired('telefonos', 'Debe informar al menos un telefono');
    const invalidPhone = telefonos.find((phone) => !/^\d{7,15}$/.test(phone.replace(/\D/g, '')));
    if (invalidPhone) addInvalid('telefonos', `Telefono invalido: ${invalidPhone}`);
  }

  if (!partial || payload.especialidades !== undefined) {
    if (especialidades.length === 0) addRequired('especialidades', 'Debe informar al menos una especialidad');
  }

  if (!partial || payload.lugaresAtencion !== undefined) {
    if (lugaresAtencion.length === 0) addRequired('lugaresAtencion', 'Debe informar al menos un lugar de atencion');
    lugaresAtencion.forEach((place, index) => {
      if (!String(place.calle || '').trim()) addRequired(`lugaresAtencion.${index}.calle`, 'Calle es requerida');
      if (!String(place.localidad || '').trim()) addRequired(`lugaresAtencion.${index}.localidad`, 'Localidad es requerida');
      if (!String(place.provincia || '').trim()) addRequired(`lugaresAtencion.${index}.provincia`, 'Provincia es requerida');
      if (!String(place.cp || '').trim()) addRequired(`lugaresAtencion.${index}.cp`, 'Codigo postal es requerido');
    });
  }

  errors.push(...requiredErrors, ...invalidErrors);
  if (errors.length > 0) {
    const status = invalidErrors.length > 0 ? 422 : 400;
    throw new HttpError(status, status === 400 ? 'Faltan datos requeridos' : 'Datos invalidos', errors);
  }

  return {
    cleanCuit,
    mails,
    telefonos,
    tipoPrestador,
    nombreCompleto,
    lugaresAtencion,
    especialidades
  };
};

const resolveCentroMedicoId = async (trx, centroMedicoId) => {
  if (!centroMedicoId) return null;

  const value = String(centroMedicoId).trim();
  const query = trx('prestadores').where({ tipo_prestador: 'centro_medico' });
  const centro = /^\d+$/.test(value) && value.length <= 9
    ? await query.clone().andWhere('id', Number(value)).first()
    : await query.clone().andWhere('cuit', normalizeCuit(value)).first();

  if (!centro) {
    throw new HttpError(422, 'Centro medico invalido', [{ field: 'centroMedicoId', message: 'El centro medico informado no existe' }]);
  }

  return centro.id;
};

const validateDuplicatesForCreate = async (trx, { cleanCuit, mails, tipoPrestador, nombreCompleto }) => {
  const existingPrestador = await trx('prestadores').where({ cuit: cleanCuit }).first();
  if (existingPrestador) throw new HttpError(409, 'Ya existe un prestador con ese CUIT/CUIL');

  const existingUser = await trx('usuarios').whereIn('email', mails).first();
  if (existingUser) throw new HttpError(409, 'Ya existe un usuario con ese email');

  if (tipoPrestador === 'centro_medico') {
    const existingCenter = await trx('prestadores')
      .whereRaw('LOWER(nombre || CASE WHEN apellido = \'\' THEN \'\' ELSE \' \' || apellido END) = ?', [nombreCompleto.toLowerCase()])
      .andWhere({ tipo_prestador: 'centro_medico' })
      .first();
    if (existingCenter) throw new HttpError(409, 'Ya existe un centro medico con ese nombre');
  }
};

const findPrestadorByCuitOrThrow = async (trx, cuit) => {
  const p = await trx('prestadores').where('cuit', normalizeCuit(cuit)).first();
  if (!p) throw new HttpError(404, 'Prestador no encontrado');
  return p;
};

const providerDisplayName = (p) => `${p.nombre} ${p.apellido}`.trim();

const getAdminUserId = (req) => req.user?.id || req.user?.id_usuario || req.user?.userId || null;

const normalizeReason = (value) => String(value || '').trim();

const requireReason = (value, actionLabel) => {
  const motivo = normalizeReason(value);
  if (!motivo) {
    throw new HttpError(400, `El motivo es requerido para ${actionLabel}`, [{
      field: 'motivo',
      message: `El motivo es requerido para ${actionLabel}`
    }]);
  }
  return motivo;
};

const createAuditLog = async (trx, { prestadorId, adminUserId, action, reason = null, metadata = {} }) => {
  await trx('prestador_audit_logs').insert({
    prestador_id: prestadorId,
    admin_usuario_id: adminUserId,
    accion: action,
    motivo: reason || null,
    metadata: JSON.stringify(metadata || {}),
    creado_en: trx.fn.now()
  });
};

const generateTemporaryPassword = () => {
  const token = crypto.randomBytes(4).toString('hex');
  return `Medi-${token}`;
};

const sendProviderCredentialsEmail = async ({ to, providerName, cuit, temporaryPassword = '' }) => {
  if (temporaryPassword) {
    return mailService.sendEmail(to, 'Credenciales de acceso MediUNAHUR', 'provider_credentials', {
      providerName,
      cuit,
      email: to,
      temporaryPassword
    });
  }

  return mailService.sendEmail(to, 'Recordatorio de acceso MediUNAHUR', 'provider_credentials_reminder', {
    providerName,
    cuit,
    email: to
  });
};

const serializePrestador = async (p, trx = db, { includeDetail = false } = {}) => {
  const [places, specialties, centro, account] = await Promise.all([
    trx('lugares_atencion').where('prestador_id', p.id).orderBy('id'),
    trx('prestador_especialidades')
      .join('especialidades', 'prestador_especialidades.especialidad_id', 'especialidades.id')
      .where('prestador_especialidades.prestador_id', p.id)
      .select('especialidades.id', 'especialidades.nombre')
      .orderBy('especialidades.nombre'),
    p.centro_medico_id ? trx('prestadores').where('id', p.centro_medico_id).first() : Promise.resolve(null),
    trx('usuarios')
      .leftJoin('usuarios_roles', 'usuarios.id', 'usuarios_roles.usuario_id')
      .leftJoin('roles', 'usuarios_roles.rol_id', 'roles.id')
      .where('usuarios.id', p.usuario_id)
      .select('usuarios.id', 'usuarios.email', 'usuarios.debe_cambiar_password as must_change_password', 'roles.nombre_rol as role_name')
      .first()
  ]);

  const base = {
    id: p.id,
    userId: p.usuario_id,
    cuitCuil: p.cuit,
    nombreCompleto: `${p.nombre} ${p.apellido}`.trim(),
    tipoPrestador: p.tipo_prestador || 'profesional',
    estado: getProviderState(p),
    status: getProviderState(p) === 'activo',
    deactivatedAt: p.baja_en,
    deactivationReason: p.motivo_baja,
    suspendedAt: p.suspendido_en,
    suspensionReason: p.motivo_suspension,
    telefonos: parseJsonArray(p.telefonos),
    mails: parseJsonArray(p.mails),
    emailPrincipal: p.email || parseJsonArray(p.mails)[0] || '',
    telefonoPrincipal: p.telefono || parseJsonArray(p.telefonos)[0] || '',
    especialidades: specialties,
    lugaresAtencion: places.map((lugar) => ({
      idLugar: lugar.id,
      calle: lugar.calle,
      localidad: lugar.localidad,
      provincia: lugar.provincia,
      cp: lugar.cp,
      horarios: parseJsonArray(lugar.horarios)
    })),
    centroMedicoId: centro ? centro.cuit : null,
    centroMedico: centro ? {
      id: centro.id,
      cuitCuil: centro.cuit,
      nombreCompleto: `${centro.nombre} ${centro.apellido}`.trim()
    } : null,
    cuenta: account ? {
      id: account.id,
      email: account.email,
      rol: account.role_name,
      debeCambiarPassword: !!account.must_change_password,
      credencialesEnviadasAt: p.credenciales_enviadas_en,
      passwordReseteadaAt: p.contrasenia_reseteada_en
    } : null,
    createdAt: p.creado_en,
    updatedAt: p.actualizado_en
  };

  if (!includeDetail) return base;

  const agendas = await trx('agendas')
    .leftJoin('especialidades', 'agendas.especialidad_id', 'especialidades.id')
    .leftJoin('lugares_atencion', 'agendas.lugar_id', 'lugares_atencion.id')
    .where('agendas.prestador_id', p.id)
    .select(
      'agendas.id',
      'agendas.duracion_turno',
      'agendas.fecha_inicio',
      'agendas.fecha_fin',
      'agendas.esta_activo',
      'agendas.bloques',
      'especialidades.nombre as especialidad',
      'lugares_atencion.calle',
      'lugares_atencion.localidad'
    )
    .orderBy('agendas.id');

  return {
    ...base,
    agendas: agendas.map((agenda) => ({
      id: agenda.id,
      especialidad: agenda.especialidad,
      lugar: [agenda.calle, agenda.localidad].filter(Boolean).join(', '),
      duracionTurno: agenda.duracion_turno,
      fechaInicio: agenda.fecha_inicio,
      fechaFin: agenda.fecha_fin,
      estaActivo: !!agenda.esta_activo,
      bloques: parseJsonArray(agenda.bloques)
    }))
  };
};

const buildFilteredQuery = (queryParams) => {
  const {
    search,
    nombre,
    cuitCuil,
    especialidad,
    tipoPrestador,
    localidad,
    estado,
    centroMedicoId
  } = queryParams;

  const query = db('prestadores').select('prestadores.*').distinct('prestadores.id');
  const needsSpecialties = especialidad || search;
  const needsPlaces = localidad || search;

  if (needsSpecialties) {
    query.leftJoin('prestador_especialidades', 'prestadores.id', 'prestador_especialidades.prestador_id')
      .leftJoin('especialidades', 'prestador_especialidades.especialidad_id', 'especialidades.id');
  }

  if (needsPlaces) {
    query.leftJoin('lugares_atencion', 'prestadores.id', 'lugares_atencion.prestador_id');
  }

  if (nombre) {
    query.whereRaw("LOWER(prestadores.nombre || ' ' || prestadores.apellido) LIKE ?", [`%${String(nombre).toLowerCase()}%`]);
  }

  if (cuitCuil) query.where('prestadores.cuit', 'like', `%${normalizeCuit(cuitCuil)}%`);
  if (tipoPrestador && tipoPrestador !== 'todos') query.where('prestadores.tipo_prestador', tipoPrestador);
  if (estado && estado !== 'todos') query.where('prestadores.estado', estado);
  if (localidad) query.whereRaw('LOWER(lugares_atencion.localidad) LIKE ?', [`%${String(localidad).toLowerCase()}%`]);
  if (especialidad) query.whereRaw('LOWER(especialidades.nombre) LIKE ?', [`%${String(especialidad).toLowerCase()}%`]);

  if (centroMedicoId) {
    const normalized = normalizeCuit(centroMedicoId);
    query.leftJoin({ centros: 'prestadores' }, 'prestadores.centro_medico_id', 'centros.id')
      .where((builder) => {
        builder.where('centros.cuit', normalized);
        if (/^\d+$/.test(String(centroMedicoId))) builder.orWhere('prestadores.centro_medico_id', Number(centroMedicoId));
      });
  }

  if (search) {
    const text = `%${String(search).toLowerCase()}%`;
    const cleanSearch = normalizeCuit(search);
    query.where((builder) => {
      builder
        .whereRaw("LOWER(prestadores.nombre || ' ' || prestadores.apellido) LIKE ?", [text])
        .orWhereRaw('LOWER(prestadores.email) LIKE ?', [text])
        .orWhereRaw('LOWER(especialidades.nombre) LIKE ?', [text])
        .orWhereRaw('LOWER(lugares_atencion.localidad) LIKE ?', [text]);
      if (cleanSearch) builder.orWhere('prestadores.cuit', 'like', `%${cleanSearch}%`);
    });
  }

  return query.orderBy('prestadores.creado_en', 'desc').orderBy('prestadores.id', 'desc');
};

const serializeCartillaItem = async (p, trx = db) => {
  const [places, specialties] = await Promise.all([
    trx('lugares_atencion').where('prestador_id', p.id).orderBy('id'),
    trx('prestador_especialidades')
      .join('especialidades', 'prestador_especialidades.especialidad_id', 'especialidades.id')
      .where('prestador_especialidades.prestador_id', p.id)
      .select('especialidades.nombre')
      .orderBy('especialidades.nombre'),
  ]);

  const cuitRaw = String(p.cuit || '').replace(/\D/g, '');
  const cuitFormateado = cuitRaw.length === 11
    ? `${cuitRaw.slice(0, 2)}-${cuitRaw.slice(2, 10)}-${cuitRaw.slice(10)}`
    : (p.cuit || '');
  return {
    id: p.id,
    nombreCompleto: `${p.nombre} ${p.apellido}`.trim(),
    tipoPrestador: p.tipo_prestador || 'profesional',
    telefono: p.telefono || parseJsonArray(p.telefonos)[0] || '',
    cuit: cuitFormateado,
    especialidades: specialties.map((e) => e.nombre),
    lugaresAtencion: places.map((lugar) => ({
      calle: lugar.calle,
      localidad: lugar.localidad,
      provincia: lugar.provincia,
      horarios: parseJsonArray(lugar.horarios),
    })),
  };
};

const getCartilla = async (req, res) => {
  try {
    const page = Number(req.query.page || 0);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const params = { ...req.query, estado: 'activo' };
    const baseQuery = buildFilteredQuery(params);

    if (page > 0) {
      const countQuery = baseQuery.clone().clearSelect().clearOrder().countDistinct('prestadores.id as total').first();
      const [{ total }, prestadores] = await Promise.all([
        countQuery,
        baseQuery.clone().limit(limit).offset((page - 1) * limit),
      ]);
      const data = await Promise.all(prestadores.map((p) => serializeCartillaItem(p)));
      const numericTotal = Number(total || 0);
      return res.status(200).json({
        data,
        total: numericTotal,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(numericTotal / limit)),
      });
    }

    const prestadores = await baseQuery;
    const result = await Promise.all(prestadores.map((p) => serializeCartillaItem(p)));
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Error getCartilla:');
  }
};

const getAll = async (req, res) => {
  try {
    const page = Number(req.query.page || 0);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const baseQuery = buildFilteredQuery(req.query);

    if (page > 0) {
      const countQuery = baseQuery.clone().clearSelect().clearOrder().countDistinct('prestadores.id as total').first();
      const [{ total }, prestadores] = await Promise.all([
        countQuery,
        baseQuery.clone().limit(limit).offset((page - 1) * limit)
      ]);
      const data = await Promise.all(prestadores.map((p) => serializePrestador(p)));
      const numericTotal = Number(total || 0);
      return res.status(200).json({
        data,
        total: numericTotal,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(numericTotal / limit))
      });
    }

    const prestadores = await baseQuery;
    const result = await Promise.all(prestadores.map((p) => serializePrestador(p)));
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Error getAll providers:');
  }
};

const getByCuit = async (req, res) => {
  try {
    const { cuit } = req.params;
    await validateOwnCuitAccess(req, cuit);
    const p = await db('prestadores').where('cuit', normalizeCuit(cuit)).first();
    if (!p) return res.status(404).json({ error: 'Prestador no encontrado', message: 'Prestador no encontrado' });

    const result = await serializePrestador(p, db, { includeDetail: true });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Error getByCuit:');
  }
};

const getOwnProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.id_usuario || req.user?.userId;
    const p = await db('prestadores').where('usuario_id', userId).first();
    if (!p) return res.status(404).json({ error: 'Prestador no encontrado', message: 'Prestador no encontrado' });

    const result = await serializePrestador(p, db, { includeDetail: true });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Error getOwnProfile:');
  }
};

const create = async (req, res) => {
  try {
    const payload = normalizeProviderPayload(req.body);
    const validated = validateProviderPayload(payload);
    const result = await db.transaction(async (trx) => {
      await validateDuplicatesForCreate(trx, validated);

      const centroMedicoDbId = validated.tipoPrestador === 'profesional'
        ? await resolveCentroMedicoId(trx, payload.centroMedicoId)
        : null;
      const { nombre, apellido } = splitName(validated.nombreCompleto);
      const hash = await bcrypt.hash(validated.cleanCuit, 10);

      const [newUser] = await trx('usuarios').insert({
        email: validated.mails[0],
        contrasenia: hash,
        debe_cambiar_password: true
      }).returning('id');
      const userId = newUser.id || newUser;

      const role = await trx('roles').where({ nombre_rol: 'PRESTADOR' }).first();
      if (!role) throw new HttpError(422, 'Rol PRESTADOR no configurado');
      await trx('usuarios_roles').insert({ usuario_id: userId, rol_id: role.id });

      const [newPrestador] = await trx('prestadores').insert({
        usuario_id: userId,
        cuit: validated.cleanCuit,
        nombre,
        apellido,
        nro_documento: validated.cleanCuit.slice(2, -1),
        email: validated.mails[0],
        telefono: validated.telefonos[0],
        tipo_prestador: validated.tipoPrestador,
        centro_medico_id: centroMedicoDbId,
        telefonos: JSON.stringify(validated.telefonos),
        mails: JSON.stringify(validated.mails),
        especialidad: '',
        activo: true,
        estado: 'activo',
        actualizado_en: trx.fn.now()
      }).returning('*');

      const prestadorId = newPrestador.id;
      const specialtyIds = [...new Set(validated.especialidades.map((e) => Number(typeof e === 'object' ? e.id : e)).filter(Boolean))];
      if (specialtyIds.length > 0) {
        const existingSpecialties = await trx('especialidades').whereIn('id', specialtyIds).select('id');
        if (existingSpecialties.length !== specialtyIds.length) {
          throw new HttpError(422, 'Especialidad invalida', [{ field: 'especialidades', message: 'Una o mas especialidades no existen' }]);
        }
        await trx('prestador_especialidades').insert(specialtyIds.map((especialidad_id) => ({
          prestador_id: prestadorId,
          especialidad_id
        })));
      }

      await trx('lugares_atencion').insert(validated.lugaresAtencion.map((lugar) => ({
        prestador_id: prestadorId,
        calle: String(lugar.calle || '').trim(),
        localidad: String(lugar.localidad || '').trim(),
        provincia: String(lugar.provincia || '').trim(),
        cp: String(lugar.cp || '').trim(),
        horarios: JSON.stringify(parseJsonArray(lugar.horarios))
      })));

      await createAuditLog(trx, {
        prestadorId,
        adminUserId: getAdminUserId(req),
        action: 'create',
        metadata: {
          cuit: validated.cleanCuit,
          tipoPrestador: validated.tipoPrestador
        }
      });

      const created = await trx('prestadores').where('id', prestadorId).first();
      return serializePrestador(created, trx, { includeDetail: true });
    });

    return res.status(201).json(result);
  } catch (error) {
    return sendError(res, error, 'Error create provider:');
  }
};

const update = async (req, res) => {
  try {
    const { cuit } = req.params;
    const payload = normalizeProviderPayload(req.body);
    const result = await db.transaction(async (trx) => {
      const p = await trx('prestadores').where('cuit', normalizeCuit(cuit)).first();
      if (!p) throw new HttpError(404, 'Prestador no encontrado');

      const validated = validateProviderPayload(payload, { partial: true });
      const updateData = { actualizado_en: trx.fn.now() };

      if (payload.cuitCuil !== undefined && validated.cleanCuit !== p.cuit) {
        const duplicate = await trx('prestadores').where({ cuit: validated.cleanCuit }).whereNot('id', p.id).first();
        if (duplicate) throw new HttpError(409, 'Ya existe un prestador con ese CUIT/CUIL');
        updateData.cuit = validated.cleanCuit;
        updateData.nro_documento = validated.cleanCuit.slice(2, -1);
      }

      if (payload.nombreCompleto !== undefined) {
        Object.assign(updateData, splitName(validated.nombreCompleto));
      }

      if (payload.tipoPrestador !== undefined) updateData.tipo_prestador = validated.tipoPrestador;
      if (payload.estado !== undefined) {
        assertValidState(payload.estado);
        updateData.estado = payload.estado;
        updateData.activo = payload.estado === 'activo';
      }
      if (payload.centroMedicoId !== undefined) updateData.centro_medico_id = await resolveCentroMedicoId(trx, payload.centroMedicoId);
      if (validated.tipoPrestador === 'centro_medico') updateData.centro_medico_id = null;

      if (payload.mails !== undefined) {
        const existingUser = await trx('usuarios').whereIn('email', validated.mails).whereNot('id', p.usuario_id).first();
        if (existingUser) throw new HttpError(409, 'Ya existe un usuario con ese email');
        updateData.mails = JSON.stringify(validated.mails);
        updateData.email = validated.mails[0];
        await trx('usuarios').where({ id: p.usuario_id }).update({ email: validated.mails[0], actualizado_en: trx.fn.now() });
      }

      if (payload.telefonos !== undefined) {
        updateData.telefonos = JSON.stringify(validated.telefonos);
        updateData.telefono = validated.telefonos[0];
      }

      await trx('prestadores').where('id', p.id).update(updateData);

      if (payload.especialidades !== undefined) {
        const specialtyIds = [...new Set(validated.especialidades.map((e) => Number(typeof e === 'object' ? e.id : e)).filter(Boolean))];
        const currentSpecialties = await trx('prestador_especialidades')
          .where('prestador_id', p.id)
          .pluck('especialidad_id');
        const removedSpecialties = currentSpecialties.filter((id) => !specialtyIds.includes(Number(id)));
        if (removedSpecialties.length > 0 && !payload.confirmAgendaImpact) {
          const agenda = await trx('agendas')
            .where('prestador_id', p.id)
            .whereIn('especialidad_id', removedSpecialties)
            .first();
          if (agenda) {
            throw new HttpError(409, 'El cambio afecta agendas existentes', [{
              field: 'especialidades',
              message: 'Confirmá el impacto sobre agendas antes de quitar especialidades'
            }]);
          }
        }
        await trx('prestador_especialidades').where('prestador_id', p.id).del();
        if (specialtyIds.length > 0) {
          const existingSpecialties = await trx('especialidades').whereIn('id', specialtyIds).select('id');
          if (existingSpecialties.length !== specialtyIds.length) throw new HttpError(422, 'Especialidad invalida');
          await trx('prestador_especialidades').insert(specialtyIds.map((especialidad_id) => ({
            prestador_id: p.id,
            especialidad_id
          })));
        }
      }

      if (payload.lugaresAtencion !== undefined) {
        if (!payload.confirmAgendaImpact) {
          const agenda = await trx('agendas').where('prestador_id', p.id).first();
          if (agenda) {
            throw new HttpError(409, 'El cambio afecta agendas existentes', [{
              field: 'lugaresAtencion',
              message: 'Confirmá el impacto sobre agendas antes de modificar lugares de atención'
            }]);
          }
        }
        await trx('lugares_atencion').where('prestador_id', p.id).del();
        await trx('lugares_atencion').insert(validated.lugaresAtencion.map((lugar) => ({
          prestador_id: p.id,
          calle: String(lugar.calle || '').trim(),
          localidad: String(lugar.localidad || '').trim(),
          provincia: String(lugar.provincia || '').trim(),
          cp: String(lugar.cp || '').trim(),
          horarios: JSON.stringify(parseJsonArray(lugar.horarios))
        })));
      }

      const changedFields = Object.keys(payload).filter((field) => field !== 'confirmAgendaImpact');
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: payload.confirmAgendaImpact ? 'update_with_agenda_impact' : 'update',
        reason: normalizeReason(payload.motivo) || null,
        metadata: {
          changedFields,
          confirmAgendaImpact: !!payload.confirmAgendaImpact
        }
      });

      const updated = await trx('prestadores').where('id', p.id).first();
      return serializePrestador(updated, trx, { includeDetail: true });
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Error update provider:');
  }
};

const remove = async (req, res) => {
  try {
    const motivo = requireReason(req.body?.motivo, 'dar de baja un prestador');
    await db.transaction(async (trx) => {
      const p = await findPrestadorByCuitOrThrow(trx, req.params.cuit);
      await trx('prestadores').where('id', p.id).update({
        estado: 'baja',
        activo: false,
        baja_en: trx.fn.now(),
        motivo_baja: motivo,
        actualizado_en: trx.fn.now()
      });
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: 'deactivate',
        reason: motivo
      });
    });
    return res.status(204).send();
  } catch (error) {
    return sendError(res, error, 'Error remove provider:');
  }
};

const suspend = async (req, res) => {
  try {
    const motivo = requireReason(req.body?.motivo, 'suspender un prestador');
    const updated = await db.transaction(async (trx) => {
      const p = await findPrestadorByCuitOrThrow(trx, req.params.cuit);
      await trx('prestadores').where('id', p.id).update({
        estado: 'suspendido',
        activo: false,
        suspendido_en: trx.fn.now(),
        motivo_suspension: motivo,
        actualizado_en: trx.fn.now()
      });
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: 'suspend',
        reason: motivo
      });
      return trx('prestadores').where('id', p.id).first();
    });
    return res.status(200).json(await serializePrestador(updated, db, { includeDetail: true }));
  } catch (error) {
    return sendError(res, error, 'Error suspend provider:');
  }
};

const reactivate = async (req, res) => {
  try {
    const motivo = normalizeReason(req.body?.motivo);
    const updated = await db.transaction(async (trx) => {
      const p = await findPrestadorByCuitOrThrow(trx, req.params.cuit);
      await trx('prestadores').where('id', p.id).update({
        estado: 'activo',
        activo: true,
        baja_en: null,
        motivo_baja: null,
        suspendido_en: null,
        motivo_suspension: null,
        actualizado_en: trx.fn.now()
      });
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: 'reactivate',
        reason: motivo || null
      });
      return trx('prestadores').where('id', p.id).first();
    });
    return res.status(200).json(await serializePrestador(updated, db, { includeDetail: true }));
  } catch (error) {
    return sendError(res, error, 'Error reactivate provider:');
  }
};

const forcePasswordChange = async (req, res) => {
  try {
    const motivo = normalizeReason(req.body?.motivo);
    const updated = await db.transaction(async (trx) => {
      const p = await findPrestadorByCuitOrThrow(trx, req.params.cuit);
      await trx('usuarios').where({ id: p.usuario_id }).update({
        debe_cambiar_password: true,
        actualizado_en: trx.fn.now()
      });
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: 'force_password_change',
        reason: motivo || null
      });
      return trx('prestadores').where('id', p.id).first();
    });
    return res.status(200).json(await serializePrestador(updated, db, { includeDetail: true }));
  } catch (error) {
    return sendError(res, error, 'Error force password change:');
  }
};

const resetPassword = async (req, res) => {
  try {
    const p = await findPrestadorByCuitOrThrow(db, req.params.cuit);
    const temporaryPassword = generateTemporaryPassword();
    const hash = await bcrypt.hash(temporaryPassword, 10);
    const email = p.email || parseJsonArray(p.mails)[0];

    if (!email) throw new HttpError(422, 'El prestador no tiene email configurado');

    await db.transaction(async (trx) => {
      await trx('usuarios').where({ id: p.usuario_id }).update({
        contrasenia: hash,
        debe_cambiar_password: true,
        actualizado_en: trx.fn.now()
      });
      await trx('prestadores').where({ id: p.id }).update({
        credenciales_enviadas_en: trx.fn.now(),
        contrasenia_reseteada_en: trx.fn.now(),
        actualizado_en: trx.fn.now()
      });
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: 'reset_password',
        reason: normalizeReason(req.body?.motivo) || null,
        metadata: { credentialsSent: true }
      });
    });

    await sendProviderCredentialsEmail({
      to: email,
      providerName: providerDisplayName(p),
      cuit: p.cuit,
      temporaryPassword
    });

    return res.status(200).json({
      message: 'Contraseña reseteada y credenciales enviadas',
      ...(process.env.NODE_ENV === 'production' ? {} : { temporaryPassword })
    });
  } catch (error) {
    return sendError(res, error, 'Error reset provider contrasenia:');
  }
};

const resendCredentials = async (req, res) => {
  try {
    const p = await findPrestadorByCuitOrThrow(db, req.params.cuit);
    const email = p.email || parseJsonArray(p.mails)[0];

    if (!email) throw new HttpError(422, 'El prestador no tiene email configurado');

    await sendProviderCredentialsEmail({
      to: email,
      providerName: providerDisplayName(p),
      cuit: p.cuit
    });

    await db.transaction(async (trx) => {
      await trx('prestadores').where({ id: p.id }).update({
        credenciales_enviadas_en: trx.fn.now(),
        actualizado_en: trx.fn.now()
      });
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: 'resend_credentials',
        reason: normalizeReason(req.body?.motivo) || null
      });
    });

    return res.status(200).json({ message: 'Credenciales reenviadas' });
  } catch (error) {
    return sendError(res, error, 'Error resend provider credentials:');
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const p = await findPrestadorByCuitOrThrow(db, req.params.cuit);
    const logs = await db('prestador_audit_logs')
      .leftJoin('usuarios', 'prestador_audit_logs.admin_usuario_id', 'usuarios.id')
      .where('prestador_audit_logs.prestador_id', p.id)
      .select(
        'prestador_audit_logs.id',
        'prestador_audit_logs.accion',
        'prestador_audit_logs.motivo',
        'prestador_audit_logs.metadata',
        'prestador_audit_logs.creado_en',
        'prestador_audit_logs.admin_usuario_id',
        'usuarios.email as admin_email'
      )
      .orderBy('prestador_audit_logs.creado_en', 'desc')
      .orderBy('prestador_audit_logs.id', 'desc');

    return res.status(200).json(logs.map((log) => ({
      id: log.id,
      action: log.accion,
      reason: log.motivo,
      metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : log.metadata,
      createdAt: log.creado_en,
      admin: log.admin_usuario_id ? {
        id: log.admin_usuario_id,
        email: log.admin_email
      } : null
    })));
  } catch (error) {
    return sendError(res, error, 'Error get provider audit logs:');
  }
};

const getAgendasBySpecialty = async (req, res) => {
  try {
    const { cuit } = req.params;
    const { specialtyId } = req.query;
    await validateOwnCuitAccess(req, cuit);
    const p = await db('prestadores').where('cuit', normalizeCuit(cuit)).first();
    if (!p) return res.status(404).json({ error: 'Prestador no encontrado', message: 'Prestador no encontrado' });

    const agendas = await db('agendas')
      .where('prestador_id', p.id)
      .andWhere('especialidad_id', specialtyId);

    return res.status(200).json({ agendas, count: agendas.length });
  } catch (error) {
    return sendError(res, error, 'Error getAgendasBySpecialty:');
  }
};

const getAgendasByPlaces = async (req, res) => {
  try {
    const { cuit } = req.params;
    await validateOwnCuitAccess(req, cuit);
    const p = await db('prestadores').where('cuit', normalizeCuit(cuit)).first();
    if (!p) return res.status(404).json({ error: 'Prestador no encontrado', message: 'Prestador no encontrado' });

    const agendas = await db('agendas').where('prestador_id', p.id);
    return res.status(200).json({ agendas, count: agendas.length });
  } catch (error) {
    return sendError(res, error, 'Error getAgendasByPlaces:');
  }
};

module.exports = {
  getCartilla,
  getAll,
  getByCuit,
  getOwnProfile,
  create,
  update,
  remove,
  suspend,
  reactivate,
  forcePasswordChange,
  resetPassword,
  resendCredentials,
  getAuditLogs,
  getAgendasBySpecialty,
  getAgendasByPlaces,
  _private: {
    normalizeProviderPayload
  }
};
