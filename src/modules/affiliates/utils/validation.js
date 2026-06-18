const Joi = require('joi');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]{1,}$/;
const DNI_RE = /^\d{7,8}$/;
const PASAPORTE_RE = /^[a-zA-Z0-9]{6,9}$/;

const VALIDATION_MESSAGES = {
  nombreRequired: 'El nombre es requerido.',
  apellidoRequired: 'El apellido es requerido.',
  nameInvalid: 'Solo letras, mínimo 2 caracteres.',
  documentRequired: 'El número de documento es requerido.',
  dniInvalid: 'El DNI debe tener 7 u 8 dígitos numéricos.',
  passportInvalid: 'El pasaporte debe tener entre 6 y 9 caracteres alfanuméricos.',
  birthDateRequired: 'La fecha de nacimiento es requerida.',
  dateInvalid: 'Fecha inválida.',
  futureDate: 'La fecha no puede ser futura.',
  unrealisticBirthDate: 'Fecha de nacimiento no válida.',
};

const dateOnly = () => Joi.string().pattern(DATE_ONLY_RE).custom((value, helpers) => {
  const [yyyy, mm, dd] = value.split('-').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  if (
    date.getFullYear() !== yyyy ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return helpers.message(VALIDATION_MESSAGES.dateInvalid);
  }
  return value;
}, 'validacion de fecha civil YYYY-MM-DD').messages({
  'string.empty': VALIDATION_MESSAGES.birthDateRequired,
  'string.pattern.base': VALIDATION_MESSAGES.dateInvalid,
});

const birthDate = () => dateOnly().required().custom((value, helpers) => {
  const [yyyy, mm, dd] = value.split('-').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date > today) return helpers.message(VALIDATION_MESSAGES.futureDate);

  const age = (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (age > 120) return helpers.message(VALIDATION_MESSAGES.unrealisticBirthDate);

  return value;
}, 'validacion de fecha de nacimiento').messages({
  'any.required': VALIDATION_MESSAGES.birthDateRequired,
  'string.empty': VALIDATION_MESSAGES.birthDateRequired,
});

const personName = (field = 'nombre') => Joi.string().trim().min(2).max(100).pattern(NAME_RE).required().messages({
  'any.required': field === 'apellido' ? VALIDATION_MESSAGES.apellidoRequired : VALIDATION_MESSAGES.nombreRequired,
  'string.empty': field === 'apellido' ? VALIDATION_MESSAGES.apellidoRequired : VALIDATION_MESSAGES.nombreRequired,
  'string.min': VALIDATION_MESSAGES.nameInvalid,
  'string.max': VALIDATION_MESSAGES.nameInvalid,
  'string.pattern.base': VALIDATION_MESSAGES.nameInvalid,
});

const documentNumber = () => Joi.string().trim().required().when('tipoDocumento', {
  switch: [
    {
      is: 'DNI',
      then: Joi.string().trim().pattern(DNI_RE).required().messages({
        'any.required': VALIDATION_MESSAGES.documentRequired,
        'string.empty': VALIDATION_MESSAGES.documentRequired,
        'string.pattern.base': VALIDATION_MESSAGES.dniInvalid,
      }),
    },
    {
      is: 'Pasaporte',
      then: Joi.string().trim().pattern(PASAPORTE_RE).required().messages({
        'any.required': VALIDATION_MESSAGES.documentRequired,
        'string.empty': VALIDATION_MESSAGES.documentRequired,
        'string.pattern.base': VALIDATION_MESSAGES.passportInvalid,
      }),
    },
  ],
  otherwise: Joi.string().trim().max(10).required().messages({
    'any.required': VALIDATION_MESSAGES.documentRequired,
    'string.empty': VALIDATION_MESSAGES.documentRequired,
  }),
});

const splitFullName = (fullName = '') => {
  const parts = String(fullName).trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : ''
  };
};

const familyMemberSchema = Joi.object({
  nombreCompleto: Joi.string().trim().min(3).max(201).optional(),
  parentesco: Joi.string().required(),
  nroDocumento: documentNumber(),
  tipoDocumento: Joi.string().valid('DNI', 'Pasaporte').default('DNI'),
  fechaNacimiento: birthDate(),
  nombre: personName('nombre'),
  apellido: personName('apellido'),
  email: Joi.string().email().optional(),
  telefono: Joi.string().optional(),
  direccion: Joi.string().allow('').optional(),
  localidad: Joi.string().allow('').optional(),
  provincia: Joi.string().allow('').optional(),
  codigoPostal: Joi.string().allow('').optional(),
  situaciones: Joi.array().items(Joi.object({
    id: Joi.number().integer().optional(),
    fechaInicio: dateOnly().optional(),
    fechaFin: dateOnly().allow(null).optional()
  })).optional()
});

const affiliateSchema = Joi.object({
  idPlan: Joi.number().integer().required(),
  tipoDocumento: Joi.string().valid('DNI', 'Pasaporte').required(),
  nroDocumento: documentNumber(),
  fechaNacimiento: birthDate(),
  nombre: personName('nombre'),
  apellido: personName('apellido'),
  email: Joi.string().email().required(),
  telefono: Joi.string().max(20).required(),
  direccion: Joi.string().max(255).optional(),
  localidad: Joi.string().max(100).optional(),
  provincia: Joi.string().max(100).optional(),
  codigoPostal: Joi.string().max(20).optional(),
  pais: Joi.string().max(100).optional(),
  grupoFamiliar: Joi.array().items(familyMemberSchema).optional(),
  situaciones: Joi.array().items(Joi.object({
    id: Joi.number().integer().optional(),
    fechaInicio: dateOnly().optional(),
    fechaFin: dateOnly().allow(null).optional()
  })).optional()
});

const normalizeFamilyMember = (member = {}) => {
  const nombreCompleto = member.nombreCompleto || member.full_name || `${member.nombre || member.first_name || ''} ${member.apellido || member.last_name || ''}`.trim();
  const splitName = splitFullName(nombreCompleto);
  const nombre = member.nombre || member.first_name || splitName.firstName;
  const apellido = member.apellido || member.last_name || splitName.lastName;

  return {
    nombreCompleto: `${nombre || ''} ${apellido || ''}`.trim() || nombreCompleto,
    parentesco: member.parentesco || member.relationship,
    nroDocumento: member.nroDocumento || member.dni || member.document_number,
    tipoDocumento: member.tipoDocumento || member.document_type || 'DNI',
    fechaNacimiento: member.fechaNacimiento || member.fecha_nacimiento || member.birth_date,
    nombre,
    apellido,
    email: member.email || (Array.isArray(member.emails) ? member.emails[0]?.email : undefined),
    telefono: member.telefono || member.phone || (Array.isArray(member.telefonos) ? member.telefonos[0]?.telefono : undefined),
    direccion: member.direccion || member.address,
    localidad: member.localidad || member.city,
    provincia: member.provincia || member.province,
    codigoPostal: member.codigoPostal || member.codigo_postal || member.postal_code,
    situaciones: (member.situaciones || member.situations || []).map((situacion) => ({
      id: situacion.id,
      fechaInicio: situacion.fechaInicio || situacion.fecha_inicio,
      fechaFin: situacion.fechaFin || situacion.fecha_fin || null
    }))
  };
};

const normalizeAffiliatePayload = (body = {}) => ({
  idPlan: body.idPlan || body.plan_id,
  nroDocumento: body.nroDocumento || body.document_number,
  tipoDocumento: body.tipoDocumento || body.document_type,
  fechaNacimiento: body.fechaNacimiento || body.birth_date || body.fecha_nacimiento,
  nombre: body.nombre || body.first_name,
  apellido: body.apellido || body.last_name,
  email: body.email,
  telefono: body.telefono || body.phone,
  direccion: body.direccion || body.address,
  localidad: body.localidad || body.city,
  provincia: body.provincia || body.province,
  codigoPostal: body.codigoPostal || body.postal_code,
  pais: body.pais || body.country,
  grupoFamiliar: (body.grupoFamiliar || body.family_group || []).map(normalizeFamilyMember),
  situaciones: (body.situaciones || body.situations || []).map((situacion) => ({
    id: situacion.id,
    fechaInicio: situacion.fechaInicio || situacion.fecha_inicio,
    fechaFin: situacion.fechaFin || situacion.fecha_fin || null
  }))
});

module.exports = {
  affiliateSchema,
  familyMemberSchema,
  normalizeAffiliatePayload,
  normalizeFamilyMember,
  VALIDATION_MESSAGES
};
