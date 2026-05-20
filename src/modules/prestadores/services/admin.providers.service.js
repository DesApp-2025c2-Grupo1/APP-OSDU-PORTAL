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
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ')
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

const getProviderState = (p) => p.estado || (p.status ? 'activo' : 'baja');

const assertValidState = (estado) => {
  if (!providerStates.has(estado)) {
    throw new HttpError(422, 'Estado de prestador invalido', [{
      field: 'estado',
      message: 'Estado debe ser activo, suspendido o baja'
    }]);
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

  const existingUser = await trx('users').whereIn('email', mails).first();
  if (existingUser) throw new HttpError(409, 'Ya existe un usuario con ese email');

  if (tipoPrestador === 'centro_medico') {
    const existingCenter = await trx('prestadores')
      .whereRaw('LOWER(first_name || CASE WHEN last_name = \'\' THEN \'\' ELSE \' \' || last_name END) = ?', [nombreCompleto.toLowerCase()])
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

const providerDisplayName = (p) => `${p.first_name} ${p.last_name}`.trim();

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
    admin_user_id: adminUserId,
    action,
    reason: reason || null,
    metadata: JSON.stringify(metadata || {}),
    created_at: trx.fn.now()
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
    trx('users')
      .leftJoin('user_roles', 'users.id', 'user_roles.user_id')
      .leftJoin('roles', 'user_roles.role_id', 'roles.id')
      .where('users.id', p.user_id)
      .select('users.id', 'users.email', 'users.must_change_password', 'roles.role_name')
      .first()
  ]);

  const base = {
    id: p.id,
    userId: p.user_id,
    cuitCuil: p.cuit,
    nombreCompleto: `${p.first_name} ${p.last_name}`.trim(),
    tipoPrestador: p.tipo_prestador || 'profesional',
    estado: getProviderState(p),
    status: getProviderState(p) === 'activo',
    deactivatedAt: p.deactivated_at,
    deactivationReason: p.deactivation_reason,
    suspendedAt: p.suspended_at,
    suspensionReason: p.suspension_reason,
    telefonos: parseJsonArray(p.telefonos),
    mails: parseJsonArray(p.mails),
    emailPrincipal: p.email || parseJsonArray(p.mails)[0] || '',
    telefonoPrincipal: p.phone || parseJsonArray(p.telefonos)[0] || '',
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
      nombreCompleto: `${centro.first_name} ${centro.last_name}`.trim()
    } : null,
    cuenta: account ? {
      id: account.id,
      email: account.email,
      rol: account.role_name,
      debeCambiarPassword: !!account.must_change_password,
      credencialesEnviadasAt: p.credentials_sent_at,
      passwordReseteadaAt: p.password_reset_at
    } : null,
    createdAt: p.created_at,
    updatedAt: p.updated_at
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
    query.whereRaw("LOWER(prestadores.first_name || ' ' || prestadores.last_name) LIKE ?", [`%${String(nombre).toLowerCase()}%`]);
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
        .whereRaw("LOWER(prestadores.first_name || ' ' || prestadores.last_name) LIKE ?", [text])
        .orWhereRaw('LOWER(prestadores.email) LIKE ?', [text])
        .orWhereRaw('LOWER(especialidades.nombre) LIKE ?', [text])
        .orWhereRaw('LOWER(lugares_atencion.localidad) LIKE ?', [text]);
      if (cleanSearch) builder.orWhere('prestadores.cuit', 'like', `%${cleanSearch}%`);
    });
  }

  return query.orderBy('prestadores.created_at', 'desc').orderBy('prestadores.id', 'desc');
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
    const p = await db('prestadores').where('user_id', userId).first();
    if (!p) return res.status(404).json({ error: 'Prestador no encontrado', message: 'Prestador no encontrado' });

    const result = await serializePrestador(p, db, { includeDetail: true });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Error getOwnProfile:');
  }
};

const create = async (req, res) => {
  try {
    const validated = validateProviderPayload(req.body);
    const result = await db.transaction(async (trx) => {
      await validateDuplicatesForCreate(trx, validated);

      const centroMedicoDbId = validated.tipoPrestador === 'profesional'
        ? await resolveCentroMedicoId(trx, req.body.centroMedicoId)
        : null;
      const { first_name, last_name } = splitName(validated.nombreCompleto);
      const hash = await bcrypt.hash(validated.cleanCuit, 10);

      const [newUser] = await trx('users').insert({
        email: validated.mails[0],
        password: hash,
        must_change_password: true
      }).returning('id');
      const userId = newUser.id || newUser;

      const role = await trx('roles').where({ role_name: 'PRESTADOR' }).first();
      if (!role) throw new HttpError(422, 'Rol PRESTADOR no configurado');
      await trx('user_roles').insert({ user_id: userId, role_id: role.id });

      const [newPrestador] = await trx('prestadores').insert({
        user_id: userId,
        cuit: validated.cleanCuit,
        first_name,
        last_name,
        document_number: validated.cleanCuit.slice(2, -1),
        email: validated.mails[0],
        phone: validated.telefonos[0],
        tipo_prestador: validated.tipoPrestador,
        centro_medico_id: centroMedicoDbId,
        telefonos: JSON.stringify(validated.telefonos),
        mails: JSON.stringify(validated.mails),
        specialty: '',
        status: true,
        estado: 'activo',
        updated_at: trx.fn.now()
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
    const result = await db.transaction(async (trx) => {
      const p = await trx('prestadores').where('cuit', normalizeCuit(cuit)).first();
      if (!p) throw new HttpError(404, 'Prestador no encontrado');

      const validated = validateProviderPayload(req.body, { partial: true });
      const updateData = { updated_at: trx.fn.now() };

      if (req.body.cuitCuil !== undefined && validated.cleanCuit !== p.cuit) {
        const duplicate = await trx('prestadores').where({ cuit: validated.cleanCuit }).whereNot('id', p.id).first();
        if (duplicate) throw new HttpError(409, 'Ya existe un prestador con ese CUIT/CUIL');
        updateData.cuit = validated.cleanCuit;
        updateData.document_number = validated.cleanCuit.slice(2, -1);
      }

      if (req.body.nombreCompleto !== undefined) {
        Object.assign(updateData, splitName(validated.nombreCompleto));
      }

      if (req.body.tipoPrestador !== undefined) updateData.tipo_prestador = validated.tipoPrestador;
      if (req.body.estado !== undefined) {
        assertValidState(req.body.estado);
        updateData.estado = req.body.estado;
        updateData.status = req.body.estado === 'activo';
      }
      if (req.body.centroMedicoId !== undefined) updateData.centro_medico_id = await resolveCentroMedicoId(trx, req.body.centroMedicoId);
      if (validated.tipoPrestador === 'centro_medico') updateData.centro_medico_id = null;

      if (req.body.mails !== undefined) {
        const existingUser = await trx('users').whereIn('email', validated.mails).whereNot('id', p.user_id).first();
        if (existingUser) throw new HttpError(409, 'Ya existe un usuario con ese email');
        updateData.mails = JSON.stringify(validated.mails);
        updateData.email = validated.mails[0];
        await trx('users').where({ id: p.user_id }).update({ email: validated.mails[0], updated_at: trx.fn.now() });
      }

      if (req.body.telefonos !== undefined) {
        updateData.telefonos = JSON.stringify(validated.telefonos);
        updateData.phone = validated.telefonos[0];
      }

      await trx('prestadores').where('id', p.id).update(updateData);

      if (req.body.especialidades !== undefined) {
        const specialtyIds = [...new Set(validated.especialidades.map((e) => Number(typeof e === 'object' ? e.id : e)).filter(Boolean))];
        const currentSpecialties = await trx('prestador_especialidades')
          .where('prestador_id', p.id)
          .pluck('especialidad_id');
        const removedSpecialties = currentSpecialties.filter((id) => !specialtyIds.includes(Number(id)));
        if (removedSpecialties.length > 0 && !req.body.confirmAgendaImpact) {
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

      if (req.body.lugaresAtencion !== undefined) {
        if (!req.body.confirmAgendaImpact) {
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

      const changedFields = Object.keys(req.body).filter((field) => field !== 'confirmAgendaImpact');
      await createAuditLog(trx, {
        prestadorId: p.id,
        adminUserId: getAdminUserId(req),
        action: req.body.confirmAgendaImpact ? 'update_with_agenda_impact' : 'update',
        reason: normalizeReason(req.body.motivo) || null,
        metadata: {
          changedFields,
          confirmAgendaImpact: !!req.body.confirmAgendaImpact
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
        status: false,
        deactivated_at: trx.fn.now(),
        deactivation_reason: motivo,
        updated_at: trx.fn.now()
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
        status: false,
        suspended_at: trx.fn.now(),
        suspension_reason: motivo,
        updated_at: trx.fn.now()
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
        status: true,
        deactivated_at: null,
        deactivation_reason: null,
        suspended_at: null,
        suspension_reason: null,
        updated_at: trx.fn.now()
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
      await trx('users').where({ id: p.user_id }).update({
        must_change_password: true,
        updated_at: trx.fn.now()
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
      await trx('users').where({ id: p.user_id }).update({
        password: hash,
        must_change_password: true,
        updated_at: trx.fn.now()
      });
      await trx('prestadores').where({ id: p.id }).update({
        credentials_sent_at: trx.fn.now(),
        password_reset_at: trx.fn.now(),
        updated_at: trx.fn.now()
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
    return sendError(res, error, 'Error reset provider password:');
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
        credentials_sent_at: trx.fn.now(),
        updated_at: trx.fn.now()
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
      .leftJoin('users', 'prestador_audit_logs.admin_user_id', 'users.id')
      .where('prestador_audit_logs.prestador_id', p.id)
      .select(
        'prestador_audit_logs.id',
        'prestador_audit_logs.action',
        'prestador_audit_logs.reason',
        'prestador_audit_logs.metadata',
        'prestador_audit_logs.created_at',
        'prestador_audit_logs.admin_user_id',
        'users.email as admin_email'
      )
      .orderBy('prestador_audit_logs.created_at', 'desc')
      .orderBy('prestador_audit_logs.id', 'desc');

    return res.status(200).json(logs.map((log) => ({
      id: log.id,
      action: log.action,
      reason: log.reason,
      metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : log.metadata,
      createdAt: log.created_at,
      admin: log.admin_user_id ? {
        id: log.admin_user_id,
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
    const p = await db('prestadores').where('cuit', normalizeCuit(cuit)).first();
    if (!p) return res.status(404).json({ error: 'Prestador no encontrado', message: 'Prestador no encontrado' });

    const agendas = await db('agendas').where('prestador_id', p.id);
    return res.status(200).json({ agendas, count: agendas.length });
  } catch (error) {
    return sendError(res, error, 'Error getAgendasByPlaces:');
  }
};

module.exports = {
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
  getAgendasByPlaces
};
