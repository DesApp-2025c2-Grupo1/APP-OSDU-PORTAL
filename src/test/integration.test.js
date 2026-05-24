const request = require('supertest');
const app = require('../index');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authRepository = require('../modules/auth/repository/auth.repository');
const affiliateRepository = require('../modules/affiliates/repository/affiliate.repository');
const prestadoresRepository = require('../modules/prestadores/repository/prestadores.repository');
const notificationService = require('../modules/mail/notification.service');

jest.mock('../modules/auth/repository/auth.repository');
jest.mock('../modules/affiliates/repository/affiliate.repository');
jest.mock('../modules/prestadores/repository/prestadores.repository');
jest.mock('../modules/mail/notification.service');
jest.mock('jsonwebtoken');

// ─── helpers ────────────────────────────────────────────────────────────────

const makeToken = (overrides = {}) =>
  Object.assign({ id: 1, email: 'user@example.com', role: 'AFILIADO' }, overrides);

const mockJwtValid = (payload) => {
  jwt.verify.mockReturnValue(payload);
  jwt.sign.mockReturnValue('mocked.jwt.token');
};

// ─── Suite 1: Login y estado de cuenta ──────────────────────────────────────

describe('Flujo 1: Auth ↔ Afiliados — Login y estado de cuenta', () => {
  let hashedPassword;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash('password123', 10);
    jwt.sign.mockReturnValue('mocked.jwt.token');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jwt.sign.mockReturnValue('mocked.jwt.token');
    notificationService.notify.mockResolvedValue(undefined);
  });

  const mockUser = (role = 'AFILIADO') => ({
    id: 1,
    email: 'afiliado@example.com',
    password: hashedPassword,
    role_name: role,
    must_change_password: false,
  });

  it('permite login a un afiliado con cuenta activa', async () => {
    authRepository.getUserByUsername.mockResolvedValue(mockUser());
    affiliateRepository.getAffiliateByUserId.mockResolvedValue({ status: true });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com', password: 'password123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.user.role).toBe('AFILIADO');
    expect(affiliateRepository.getAffiliateByUserId).toHaveBeenCalledWith(1);
  });

  it('rechaza login si la cuenta de afiliado está inactiva', async () => {
    authRepository.getUserByUsername.mockResolvedValue(mockUser());
    affiliateRepository.getAffiliateByUserId.mockResolvedValue({ status: false });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com', password: 'password123' });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toContain('no esta activa');
  });

  it('permite login ADMIN sin verificar estado de afiliado', async () => {
    authRepository.getUserByUsername.mockResolvedValue(mockUser('ADMIN'));

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com', password: 'password123' });

    expect(res.statusCode).toBe(200);
    expect(affiliateRepository.getAffiliateByUserId).not.toHaveBeenCalled();
  });

  it('rechaza login con contraseña incorrecta', async () => {
    authRepository.getUserByUsername.mockResolvedValue(mockUser());
    affiliateRepository.getAffiliateByUserId.mockResolvedValue({ status: true });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com', password: 'wrongpassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Credenciales inválidas');
  });

  it('rechaza login si usuario no existe', async () => {
    authRepository.getUserByUsername.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'noexiste@example.com', password: 'password123' });

    expect(res.statusCode).toBe(401);
  });

  it('retorna 400 si faltan campos', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com' });

    expect(res.statusCode).toBe(400);
  });
});

// ─── Suite 2: Acceso protegido con JWT ──────────────────────────────────────

describe('Flujo 2: Auth — Acceso protegido con JWT', () => {
  afterEach(() => jest.clearAllMocks());

  it('GET /auth/me retorna 401 sin token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('no token'); });
    const res = await request(app).get('/auth/me');
    expect(res.statusCode).toBe(401);
  });

  it('GET /auth/me retorna datos con token válido', async () => {
    mockJwtValid({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    authRepository.getUserById.mockResolvedValue({
      id: 1,
      email: 'admin@example.com',
      role_name: 'ADMIN',
      must_change_password: false,
    });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toHaveProperty('email', 'admin@example.com');
    expect(res.body.user).toHaveProperty('role', 'ADMIN');
  });

  it('GET /auth/me retorna 403 con token inválido', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token');

    expect(res.statusCode).toBe(403);
  });

  it('GET /auth/me retorna 404 si usuario del token no existe en DB', async () => {
    mockJwtValid({ id: 99, email: 'ghost@example.com', role: 'ADMIN' });
    authRepository.getUserById.mockResolvedValue(null);

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(404);
  });
});

// ─── Suite 3: Cambio de contraseña ──────────────────────────────────────────

describe('Flujo 3: Auth — Cambio de contraseña', () => {
  let currentHash;

  beforeAll(async () => {
    currentHash = await bcrypt.hash('OldPass1', 12);
    notificationService.notify.mockResolvedValue(undefined);
  });

  beforeEach(() => {
    mockJwtValid({ id: 1, email: 'user@example.com', role: 'AFILIADO' });
    authRepository.getUserByIdFull.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      password: currentHash,
      first_name: 'Juan',
      role_name: 'AFILIADO',
    });
    authRepository.updateUserPassword.mockResolvedValue(1);
  });

  afterEach(() => jest.clearAllMocks());

  it('cambia contraseña correctamente', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', 'Bearer valid.token')
      .send({ currentPassword: 'OldPass1', newPassword: 'NewPass2' });

    expect(res.statusCode).toBe(200);
    expect(authRepository.updateUserPassword).toHaveBeenCalledWith(1, expect.any(String));
    expect(notificationService.notify).toHaveBeenCalledWith('PWD_CHANGE', 'user@example.com', expect.any(Object));
  });

  it('rechaza si contraseña actual es incorrecta', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', 'Bearer valid.token')
      .send({ currentPassword: 'WrongOld1', newPassword: 'NewPass2' });

    expect(res.statusCode).toBe(401);
    expect(authRepository.updateUserPassword).not.toHaveBeenCalled();
  });

  it('rechaza si nueva contraseña tiene menos de 8 caracteres', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', 'Bearer valid.token')
      .send({ currentPassword: 'OldPass1', newPassword: 'Ab1' });

    expect(res.statusCode).toBe(400);
  });

  it('rechaza si nueva contraseña no cumple requisitos de complejidad', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', 'Bearer valid.token')
      .send({ currentPassword: 'OldPass1', newPassword: 'alllowercase1' });

    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 si faltan campos', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', 'Bearer valid.token')
      .send({ currentPassword: 'OldPass1' });

    expect(res.statusCode).toBe(400);
  });
});

// ─── Suite 4: Afiliados — listado y autorización ────────────────────────────

describe('Flujo 4: Afiliados — listado y control de acceso', () => {
  const mockAffiliate = {
    id: 1, first_name: 'Juan', last_name: 'López',
    email: 'juan@example.com', document_number: '12345678',
    document_type: 'DNI', status: true,
  };

  afterEach(() => jest.clearAllMocks());

  it('ADMIN puede listar todos los afiliados', async () => {
    mockJwtValid({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    affiliateRepository.getAllAffiliates.mockResolvedValue([mockAffiliate]);

    const res = await request(app)
      .get('/affiliates')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('AFILIADO no puede listar todos los afiliados (IDOR fix)', async () => {
    mockJwtValid({ id: 2, email: 'afiliado@example.com', role: 'AFILIADO' });

    const res = await request(app)
      .get('/affiliates')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(403);
  });

  it('ADMIN puede obtener afiliado por ID', async () => {
    mockJwtValid({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    affiliateRepository.getAffiliateById.mockResolvedValue(mockAffiliate);

    const res = await request(app)
      .get('/affiliates/1')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
  });

  it('retorna 404 si afiliado no existe', async () => {
    mockJwtValid({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    affiliateRepository.getAffiliateById.mockResolvedValue(null);

    const res = await request(app)
      .get('/affiliates/99999')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(404);
  });

  it('retorna 401 sin token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('no token'); });

    const res = await request(app).get('/affiliates/1');
    expect(res.statusCode).toBe(401);
  });

  it('ADMIN puede activar un afiliado y se envía notificación', async () => {
    mockJwtValid({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    affiliateRepository.getAffiliateById.mockResolvedValue(mockAffiliate);
    affiliateRepository.activateAffiliate.mockResolvedValue(1);
    notificationService.notify.mockResolvedValue(undefined);

    const res = await request(app)
      .put('/affiliates/1/activate')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(notificationService.notify).toHaveBeenCalledWith(
      'ACCOUNT_ON',
      mockAffiliate.email,
      expect.objectContaining({ name: 'Juan López' })
    );
  });

  it('ADMIN puede desactivar un afiliado y se envía notificación', async () => {
    mockJwtValid({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    affiliateRepository.getAffiliateById.mockResolvedValue(mockAffiliate);
    affiliateRepository.deactivateAffiliate.mockResolvedValue(1);
    notificationService.notify.mockResolvedValue(undefined);

    const res = await request(app)
      .put('/affiliates/1/deactivate')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(notificationService.notify).toHaveBeenCalledWith(
      'ACCOUNT_OFF',
      mockAffiliate.email,
      expect.objectContaining({ name: 'Juan López' })
    );
  });
});

// ─── Suite 5: Afiliados — turnos ────────────────────────────────────────────

describe('Flujo 5: Afiliados — gestión de turnos', () => {
  const mockAffiliate = {
    id: 10, first_name: 'Ana', last_name: 'García',
    email: 'ana@example.com', user_id: 2,
  };

  beforeEach(() => {
    mockJwtValid({ id: 2, email: 'ana@example.com', role: 'AFILIADO' });
    affiliateRepository.getAffiliateByUserId.mockResolvedValue(mockAffiliate);
    notificationService.notify.mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it('obtiene mis turnos', async () => {
    affiliateRepository.getAppointmentsByAffiliate.mockResolvedValue([]);

    const res = await request(app)
      .get('/affiliates/turnos')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('retorna 400 al cancelar turno sin motivo', async () => {
    affiliateRepository.getAppointmentById.mockResolvedValue({
      id: 5, affiliate_id: 10, status: 'reservado',
      appointment_date: '2099-12-31',
    });

    const res = await request(app)
      .put('/affiliates/turnos/5/cancelar')
      .set('Authorization', 'Bearer valid.token')
      .send({});

    expect(res.statusCode).toBe(400);
  });

  it('retorna 403 si el afiliado intenta cancelar turno de otro', async () => {
    affiliateRepository.getAppointmentById.mockResolvedValue({
      id: 5, affiliate_id: 999, status: 'reservado',
      appointment_date: '2099-12-31',
    });

    const res = await request(app)
      .put('/affiliates/turnos/5/cancelar')
      .set('Authorization', 'Bearer valid.token')
      .send({ motivo: 'No puedo asistir' });

    expect(res.statusCode).toBe(403);
  });

  it('retorna 422 al cancelar turno ya cancelado', async () => {
    affiliateRepository.getAppointmentById.mockResolvedValue({
      id: 5, affiliate_id: 10, status: 'cancelado',
      appointment_date: '2099-12-31',
    });

    const res = await request(app)
      .put('/affiliates/turnos/5/cancelar')
      .set('Authorization', 'Bearer valid.token')
      .send({ motivo: 'Cambio de planes' });

    expect(res.statusCode).toBe(422);
  });

  it('retorna 422 al cancelar turno pasado', async () => {
    affiliateRepository.getAppointmentById.mockResolvedValue({
      id: 5, affiliate_id: 10, status: 'reservado',
      appointment_date: '2000-01-01',
    });

    const res = await request(app)
      .put('/affiliates/turnos/5/cancelar')
      .set('Authorization', 'Bearer valid.token')
      .send({ motivo: 'Cancelación tardía' });

    expect(res.statusCode).toBe(422);
  });

  it('cancela turno y envía notificación al afiliado', async () => {
    affiliateRepository.getAppointmentById.mockResolvedValue({
      id: 5, affiliate_id: 10, status: 'reservado',
      appointment_date: '2099-12-31',
    });
    affiliateRepository.cancelAppointment.mockResolvedValue({
      id: 5, status: 'cancelado', cancellation_reason: 'No puedo asistir',
    });

    const res = await request(app)
      .put('/affiliates/turnos/5/cancelar')
      .set('Authorization', 'Bearer valid.token')
      .send({ motivo: 'No puedo asistir' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('cancelado');
    expect(notificationService.notify).toHaveBeenCalledWith(
      'APPT_CANCEL',
      mockAffiliate.email,
      expect.objectContaining({ status: 'cancelado' })
    );
  });
});

// ─── Suite 6: Prestadores — búsqueda e historia clínica ─────────────────────

describe('Flujo 6: Prestadores ↔ Afiliados — Búsqueda e historia clínica', () => {
  beforeEach(() => {
    mockJwtValid({ id: 10, email: 'prestador@example.com', role: 'PRESTADOR' });
    prestadoresRepository.getPrestadorByUserId.mockResolvedValue({
      id: 10, user_id: 10, nombre: 'Dr. García',
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('retorna 401 al buscar afiliados sin token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('no token'); });
    const res = await request(app).get('/prestadores/afiliados/search?q=Lopez');
    expect(res.statusCode).toBe(401);
  });

  it('busca afiliados con token PRESTADOR válido', async () => {
    prestadoresRepository.searchAffiliates.mockResolvedValue([
      { id: 1, first_name: 'Juan', last_name: 'López', document_number: '12345678' },
    ]);

    const res = await request(app)
      .get('/prestadores/afiliados/search?q=Lopez')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('retorna array vacío si query es vacía', async () => {
    const res = await request(app)
      .get('/prestadores/afiliados/search?q=')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retorna 401 al acceder a historia clínica sin token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('no token'); });
    const res = await request(app).get('/prestadores/historia-clinica/afiliado/1');
    expect(res.statusCode).toBe(401);
  });

  it('obtiene historia clínica con token válido', async () => {
    prestadoresRepository.getAffiliateById.mockResolvedValue({
      id: 1, first_name: 'Juan', last_name: 'López', status: true,
    });
    prestadoresRepository.hasAppointmentWithAffiliate.mockResolvedValue({ id: 1 });
    prestadoresRepository.getClinicalHistoryByAffiliate.mockResolvedValue([
      {
        id: 1, affiliate_id: 1, prestador_id: 10, appointment_id: null,
        entry_date: '2026-01-10', doctor: 'Dr. García', specialty: 'Clínica',
        modality: 'Presencial', note: 'Consulta inicial', own_note: true,
      },
    ]);

    const res = await request(app)
      .get('/prestadores/historia-clinica/afiliado/1')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
  });

  it('retorna 404 si afiliado no existe al consultar historia', async () => {
    prestadoresRepository.getAffiliateById.mockResolvedValue(null);

    const res = await request(app)
      .get('/prestadores/historia-clinica/afiliado/999')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(404);
  });

  it('retorna 403 si prestador no tiene relación con el afiliado', async () => {
    prestadoresRepository.getAffiliateById.mockResolvedValue({
      id: 1, first_name: 'Juan', last_name: 'López', status: true,
    });
    prestadoresRepository.hasAppointmentWithAffiliate.mockResolvedValue(null);

    const res = await request(app)
      .get('/prestadores/historia-clinica/afiliado/1')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(403);
  });
});

// ─── Suite 7: Seguridad — roles y rutas protegidas ──────────────────────────

describe('Flujo 7: Seguridad — control de roles', () => {
  afterEach(() => jest.clearAllMocks());

  it('AFILIADO no puede acceder a rutas de ADMIN', async () => {
    mockJwtValid({ id: 2, email: 'afiliado@example.com', role: 'AFILIADO' });

    const res = await request(app)
      .get('/prestadores')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(403);
  });

  it('PRESTADOR no puede acceder a rutas de ADMIN', async () => {
    mockJwtValid({ id: 3, email: 'prestador@example.com', role: 'PRESTADOR' });

    const res = await request(app)
      .get('/prestadores')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(403);
  });

  it('token expirado retorna 403', async () => {
    jwt.verify.mockImplementation(() => { throw Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }); });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer expired.token');

    expect(res.statusCode).toBe(403);
  });
});
