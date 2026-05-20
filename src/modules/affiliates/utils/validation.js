const Joi = require('joi');

const affiliateSchema = Joi.object({
  idPlan: Joi.number().integer().required(),
  nroDocumento: Joi.string().max(10).required(),
  tipoDocumento: Joi.string().valid('DNI', 'Pasaporte').required(),
  fechaNacimiento: Joi.date().iso().required(),
  nombre: Joi.string().max(100).required(),
  apellido: Joi.string().max(100).required(),
  email: Joi.string().email().required(),
  telefono: Joi.string().max(20).required(),
  direccion: Joi.string().max(255).optional(),
  localidad: Joi.string().max(100).optional(),
  provincia: Joi.string().max(100).optional(),
  codigoPostal: Joi.string().max(20).optional(),
  pais: Joi.string().max(100).optional(),
  grupoFamiliar: Joi.array().items(Joi.object({
    nombreCompleto: Joi.string().required(),
    parentesco: Joi.string().required(),
    nroDocumento: Joi.string().required(),
    tipoDocumento: Joi.string().optional(),
    fechaNacimiento: Joi.date().iso().optional(),
    nombre: Joi.string().optional(),
    apellido: Joi.string().optional(),
    email: Joi.string().email().optional(),
    telefono: Joi.string().optional(),
    direccion: Joi.string().allow('').optional(),
    localidad: Joi.string().allow('').optional(),
    provincia: Joi.string().allow('').optional(),
    codigoPostal: Joi.string().allow('').optional(),
    situaciones: Joi.array().items(Joi.object({
      id: Joi.number().integer().optional(),
      fechaInicio: Joi.date().iso().optional(),
      fechaFin: Joi.date().iso().allow(null).optional()
    })).optional()
  })).optional(),
  situaciones: Joi.array().items(Joi.object({
    id: Joi.number().integer().optional(),
    fechaInicio: Joi.date().iso().optional(),
    fechaFin: Joi.date().iso().allow(null).optional()
  })).optional()
});

const normalizeFamilyMember = (member = {}) => ({
  nombreCompleto: member.nombreCompleto || member.full_name || `${member.nombre || member.first_name || ''} ${member.apellido || member.last_name || ''}`.trim(),
  parentesco: member.parentesco || member.relationship,
  nroDocumento: member.nroDocumento || member.document_number,
  tipoDocumento: member.tipoDocumento || member.document_type,
  fechaNacimiento: member.fechaNacimiento || member.birth_date,
  nombre: member.nombre || member.first_name,
  apellido: member.apellido || member.last_name,
  email: member.email,
  telefono: member.telefono || member.phone,
  direccion: member.direccion || member.address,
  localidad: member.localidad || member.city,
  provincia: member.provincia || member.province,
  codigoPostal: member.codigoPostal || member.postal_code,
  situaciones: (member.situaciones || member.situations || []).map((situacion) => ({
    id: situacion.id,
    fechaInicio: situacion.fechaInicio || situacion.fecha_inicio,
    fechaFin: situacion.fechaFin || situacion.fecha_fin || null
  }))
});

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
  normalizeAffiliatePayload
};
