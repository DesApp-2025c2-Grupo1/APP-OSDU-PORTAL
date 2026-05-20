
const request = require('supertest');
const app = require('../index');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


const authRepository = require('../modules/auth/repository/auth.repository');
const affiliateRepository = require('../modules/affiliates/repository/affiliate.repository');
const prestadoresRepository = require('../modules/prestadores/repository/prestadores.repository');

jest.mock('../modules/auth/repository/auth.repository');
jest.mock('../modules/affiliates/repository/affiliate.repository');
jest.mock('../modules/prestadores/repository/prestadores.repository');
jest.mock('jsonwebtoken');


describe('Flujo 1: Auth ↔ Afiliados — Login y estado de cuenta', () => {
  let hashedPassword;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash('password123', 10);
    // jwt.sign es llamado por generateToken al hacer login exitoso
    jwt.sign.mockReturnValue('mocked.jwt.token');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jwt.sign.mockReturnValue('mocked.jwt.token');
  });

  const mockUser = {
    id: 1,
    email: 'afiliado@example.com',
    password: '',
    role_name: 'AFILIADO',
    must_change_password: false
  };

  it('debería permitir login a un afiliado con cuenta activa', async () => {
    mockUser.password = hashedPassword;
    authRepository.getUserByUsername.mockResolvedValue(mockUser);
    affiliateRepository.getAffiliateByUserId.mockResolvedValue({ status: true });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com', password: 'password123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.user.role).toBe('AFILIADO');
    // Verifica que se consultó el estado del afiliado en el módulo de afiliados
    expect(affiliateRepository.getAffiliateByUserId).toHaveBeenCalledWith(mockUser.id);
  });

  it('debería rechazar login si la cuenta de afiliado está inactiva', async () => {
    mockUser.password = hashedPassword;
    authRepository.getUserByUsername.mockResolvedValue(mockUser);
    // El módulo de afiliados informa que la cuenta está inactiva
    affiliateRepository.getAffiliateByUserId.mockResolvedValue({ status: false });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com', password: 'password123' });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toContain('no esta activa');
  });

  it('debería permitir login ADMIN sin verificar estado de afiliado', async () => {
    const adminUser = { ...mockUser, role_name: 'ADMIN', password: hashedPassword };
    authRepository.getUserByUsername.mockResolvedValue(adminUser);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'afiliado@example.com', password: 'password123' });

    expect(res.statusCode).toBe(200);
    // ADMIN no consulta el módulo de afiliados
    expect(affiliateRepository.getAffiliateByUserId).not.toHaveBeenCalled();
  });
});


describe('Flujo 2: Auth — Acceso protegido con JWT', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /auth/me debería retornar 401 sin token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('no token'); });

    const res = await request(app).get('/auth/me');
    expect(res.statusCode).toBe(401);
  });

  it('GET /auth/me debería retornar datos del usuario con token válido', async () => {
    jwt.verify.mockReturnValue({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    authRepository.getUserById.mockResolvedValue({
      id: 1,
      email: 'admin@example.com',
      role_name: 'ADMIN',
      must_change_password: false
    });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toHaveProperty('email', 'admin@example.com');
    expect(res.body.user).toHaveProperty('role', 'ADMIN');
  });

  it('GET /auth/me debería retornar 403 con token inválido', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token');

    expect(res.statusCode).toBe(403);
  });
});


describe('Flujo 3: Prestadores ↔ Afiliados — Búsqueda e historia clínica', () => {
  beforeEach(() => {
    // Simula un prestador autenticado
    jwt.verify.mockReturnValue({ id: 10, email: 'prestador@example.com', role: 'PRESTADOR' });
    // El servicio busca el prestador por user_id para verificar que existe
    prestadoresRepository.getPrestadorByUserId.mockResolvedValue({
      id: 10,
      user_id: 10,
      nombre: 'Dr. García'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería retornar 401 al buscar afiliados sin token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('no token'); });

    const res = await request(app).get('/prestadores/afiliados/search?q=Lopez');
    expect(res.statusCode).toBe(401);
  });

  it('debería buscar afiliados con token de PRESTADOR válido', async () => {
    prestadoresRepository.searchAffiliates.mockResolvedValue([
      { id: 1, first_name: 'Juan', last_name: 'López', document_number: '12345678' }
    ]);

    const res = await request(app)
      .get('/prestadores/afiliados/search?q=Lopez')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('debería retornar 401 al acceder a historia clínica sin token', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('no token'); });

    const res = await request(app).get('/prestadores/historia-clinica/afiliado/1');
    expect(res.statusCode).toBe(401);
  });

  it('debería obtener historia clínica de un afiliado con token válido', async () => {
    // ensureAffiliate() verifica que el afiliado exista antes de retornar el historial
    prestadoresRepository.getAffiliateById.mockResolvedValue({
      id: 1, first_name: 'Juan', last_name: 'López', status: true
    });
    prestadoresRepository.getClinicalHistoryByAffiliate.mockResolvedValue([
      {
        id: 1,
        affiliate_id: 1,
        prestador_id: 10,
        appointment_id: null,
        entry_date: '2026-01-10',
        doctor: 'Dr. García',
        specialty: 'Clínica',
        modality: 'Presencial',
        note: 'Consulta inicial',
        own_note: true
      }
    ]);

    const res = await request(app)
      .get('/prestadores/historia-clinica/afiliado/1')
      .set('Authorization', 'Bearer valid.token');

    expect(res.statusCode).toBe(200);
  });
});
