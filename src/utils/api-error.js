class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const UNIQUE_MESSAGES = [
  { field: 'users_email_unique', message: 'El correo electrónico ya se encuentra registrado' },
  { field: 'email', message: 'El correo electrónico ya se encuentra registrado' },
  { field: 'affiliates_document_number_document_type_unique', message: 'Ya existe un afiliado con ese documento' },
  { field: 'document_number', message: 'Ya existe un afiliado con ese documento' },
  { field: 'prestadores_cuit_unique', message: 'Ya existe un prestador con ese CUIT/CUIL' },
  { field: 'cuit', message: 'Ya existe un prestador con ese CUIT/CUIL' },
  { field: 'plans_plan_code_unique', message: 'Ya existe un plan con ese código' },
  { field: 'request_number', message: 'Ya existe una solicitud con ese número' },
];

const findUniqueMessage = (error) => {
  const text = [
    error.constraint,
    error.detail,
    error.message,
    Array.isArray(error.meta?.target) ? error.meta.target.join(',') : error.meta?.target
  ].filter(Boolean).join(' ').toLowerCase();

  return UNIQUE_MESSAGES.find(({ field }) => text.includes(field.toLowerCase()))?.message
    || 'El registro ya existe';
};

const mapDatabaseError = (error) => {
  if (!error) return null;

  if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT' || error.code === 'ER_DUP_ENTRY' || error.code === 'P2002') {
    return new HttpError(409, findUniqueMessage(error));
  }

  if (error.code === '23503' || error.code === 'P2003') {
    return new HttpError(422, 'No se puede completar la operación porque referencia datos inexistentes');
  }

  if (error.code === '23502') {
    return new HttpError(400, 'Faltan datos requeridos');
  }

  if (error.code === '22P02') {
    return new HttpError(400, 'El formato de los datos enviados es inválido');
  }

  return null;
};

const sendError = (res, error, fallbackMessage = 'Error interno del servidor') => {
  const mappedError = error instanceof HttpError ? error : mapDatabaseError(error);

  if (mappedError) {
    return res.status(mappedError.status).json({
      message: mappedError.message,
      error: mappedError.message,
      details: mappedError.details
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    message: fallbackMessage,
    error: fallbackMessage
  });
};

module.exports = {
  HttpError,
  mapDatabaseError,
  sendError
};
