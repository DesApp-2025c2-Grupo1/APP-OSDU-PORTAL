const request = require('supertest');
const app = require('../index');
const authRepository = require('../modules/auth/repository/auth.repository');
const affiliateRepository = require('../modules/affiliates/repository/affiliate.repository');
const notificationService = require('../modules/mail/notification.service');
const bcrypt = require('bcryptjs');

jest.mock('../modules/auth/repository/auth.repository');
jest.mock('../modules/affiliates/repository/affiliate.repository');
jest.mock('../modules/mail/notification.service');

describe('Auth Module', () => {
  const testUser = { email: 'admin@example.com', password: 'password123' };

  let mockDbUser;

  beforeAll(async () => {
    mockDbUser = {
      id: 1,
      email: 'admin@example.com',
      password: await bcrypt.hash(testUser.password, 10),
      role_name: 'ADMIN',
      must_change_password: false,
    };
    notificationService.notify.mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /auth/login', () => {
    it('retorna 200 y datos de usuario ADMIN con credenciales válidas', async () => {
      authRepository.getUserByUsername.mockResolvedValue(mockDbUser);

      const res = await request(app).post('/auth/login').send(testUser);

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toHaveProperty('email', testUser.email);
      expect(res.body.user).toHaveProperty('role', 'ADMIN');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('retorna 401 con contraseña incorrecta', async () => {
      authRepository.getUserByUsername.mockResolvedValue(mockDbUser);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' });

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toBe('Credenciales inválidas');
    });

    it('retorna 401 cuando el usuario no existe', async () => {
      authRepository.getUserByUsername.mockResolvedValue(null);

      const res = await request(app).post('/auth/login').send(testUser);

      expect(res.statusCode).toBe(401);
    });

    it('retorna 401 para cuenta de afiliado inactiva', async () => {
      const afiliadoUser = { ...mockDbUser, role_name: 'AFILIADO' };
      authRepository.getUserByUsername.mockResolvedValue(afiliadoUser);
      affiliateRepository.getAffiliateByUserId.mockResolvedValue({ status: false });

      const res = await request(app).post('/auth/login').send(testUser);

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toContain('no esta activa');
    });

    it('retorna 400 si faltan email o password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'solo@email.com' });

      expect(res.statusCode).toBe(400);
    });

    it('no expone el hash de contraseña en la respuesta', async () => {
      authRepository.getUserByUsername.mockResolvedValue(mockDbUser);

      const res = await request(app).post('/auth/login').send(testUser);

      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(mockDbUser.password);
    });
  });

  describe('GET /auth/me', () => {
    it('retorna 401 cuando no se provee token', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('retorna 200 y limpia la cookie de sesión', async () => {
      const res = await request(app).post('/auth/logout');

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('OK');
      // Verifica que se envía Set-Cookie para limpiar el token
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        expect(setCookie.some((c) => c.startsWith('token=;'))).toBe(true);
      }
    });
  });
});
