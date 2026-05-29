const request = require('supertest');
const app = require('../index');
const affiliateRepository = require('../modules/affiliates/repository/affiliate.repository');
const notificationService = require('../modules/mail/notification.service');
const jwt = require('jsonwebtoken');

jest.mock('../modules/affiliates/repository/affiliate.repository');
jest.mock('../modules/mail/notification.service');
jest.mock('jsonwebtoken');

describe('Affiliates Endpoints', () => {
  const mockAffiliate = {
    id: 1,
    first_name: 'Juan',
    last_name: 'López',
    email: 'juan@example.com',
    document_number: '12345678',
    document_type: 'DNI',
    status: true,
    plan_type: 'Plan UNAHUR',
    plan_code: 'BASIC',
  };

  beforeEach(() => {
    jwt.verify.mockReturnValue({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
    notificationService.notify.mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /affiliates/:id', () => {
    it('retorna 200 con datos del afiliado cuando existe', async () => {
      affiliateRepository.getAffiliateById.mockResolvedValue(mockAffiliate);

      const res = await request(app)
        .get('/affiliates/1')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('email', 'juan@example.com');
    });

    it('retorna 404 cuando el afiliado no existe', async () => {
      affiliateRepository.getAffiliateById.mockResolvedValue(null);

      const res = await request(app)
        .get('/affiliates/99999')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('El afiliado no existe');
    });
  });

  describe('GET /affiliates', () => {
    it('retorna 200 con todos los afiliados para ADMIN', async () => {
      affiliateRepository.getAllAffiliates.mockResolvedValue([mockAffiliate]);

      const res = await request(app)
        .get('/affiliates')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
    });

    it('retorna 200 filtrando afiliados por status=true', async () => {
      // El filtro usa boolean true/false, no strings como "ACTIVE"
      affiliateRepository.getAffiliatesByStatus.mockResolvedValue([mockAffiliate]);

      const res = await request(app)
        .get('/affiliates?status=true')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(affiliateRepository.getAffiliatesByStatus).toHaveBeenCalledWith(true);
    });

    it('retorna 200 filtrando afiliados inactivos con status=false', async () => {
      affiliateRepository.getAffiliatesByStatus.mockResolvedValue([]);

      const res = await request(app)
        .get('/affiliates?status=false')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
      expect(affiliateRepository.getAffiliatesByStatus).toHaveBeenCalledWith(false);
    });
  });

  describe('GET /affiliates sin autenticación', () => {
    it('retorna 401 sin token', async () => {
      jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

      const res = await request(app).get('/affiliates/1');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('IDOR — AFILIADO no puede listar todos los afiliados', () => {
    it('retorna 403 cuando un AFILIADO intenta listar todos', async () => {
      jwt.verify.mockReturnValue({ id: 2, email: 'afiliado@example.com', role: 'AFILIADO' });

      const res = await request(app)
        .get('/affiliates')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /affiliates autorización y registro público', () => {
    it('retorna 401 al crear afiliado desde endpoint admin sin token', async () => {
      const res = await request(app)
        .post('/affiliates')
        .send({});

      expect(res.statusCode).toBe(401);
    });

    it('retorna 403 cuando un AFILIADO intenta crear desde endpoint admin', async () => {
      jwt.verify.mockReturnValue({ id: 2, email: 'afiliado@example.com', role: 'AFILIADO' });

      const res = await request(app)
        .post('/affiliates')
        .set('Authorization', 'Bearer faketoken')
        .send({});

      expect(res.statusCode).toBe(403);
    });

    it('permite llegar a validación en el endpoint público de registro', async () => {
      const res = await request(app)
        .post('/affiliates/register')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
    });
  });

  describe('PUT /affiliates/:id/activate', () => {
    it('activa afiliado y envía notificación de email', async () => {
      affiliateRepository.getAffiliateById.mockResolvedValue(mockAffiliate);
      affiliateRepository.activateAffiliate.mockResolvedValue(1);

      const res = await request(app)
        .put('/affiliates/1/activate')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
      expect(notificationService.notify).toHaveBeenCalledWith(
        'ACCOUNT_ON',
        mockAffiliate.email,
        expect.objectContaining({ name: 'Juan López' })
      );
    });

    it('retorna 404 si afiliado no existe al activar', async () => {
      affiliateRepository.getAffiliateById.mockResolvedValue(null);

      const res = await request(app)
        .put('/affiliates/999/activate')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(404);
    });
  });
});
