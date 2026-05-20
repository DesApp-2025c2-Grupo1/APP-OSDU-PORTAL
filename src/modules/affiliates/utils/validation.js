const Joi = require('joi');

const affiliateSchema = Joi.object({
  plan_id: Joi.number().integer().required(),
  document_number: Joi.string().max(10).required(),
  document_type: Joi.string().valid('DNI', 'Pasaporte').required(),
  birth_date: Joi.date().iso().required(),
  first_name: Joi.string().max(100).required(),
  last_name: Joi.string().max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().max(20).required(),
  address: Joi.string().max(255).optional(),
  city: Joi.string().max(100).optional(),
  province: Joi.string().max(100).optional(),
  postal_code: Joi.string().max(20).optional(),
  country: Joi.string().max(100).optional(),
  family_group: Joi.array().items(Joi.object({
    full_name: Joi.string().required(),
    relationship: Joi.string().required(),
    document_number: Joi.string().required()
  })).optional()
});

module.exports = {
  affiliateSchema
};
