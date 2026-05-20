const request = require('supertest');
const app = require('../index');
const affiliateRepository = require('../modules/affiliates/repository/affiliate.repository');
const jwt = require('jsonwebtoken');

jest.mock('../modules/affiliates/repository/affiliate.repository');
jest.mock('jsonwebtoken');

describe('Affiliates Endpoints', () => {
  const mockAffiliate = {
    id: 1,
    first_name: 'Juan',
    last_name: 'López',
    email: 'juan@example.com',
    document_number: '12345678',
    document_type: 'DNI',
    status: true
  };

  beforeEach(() => {
    // Simula un token válido con rol ADMIN para rutas protegidas
    jwt.verify.mockReturnValue({ id: 1, email: 'admin@example.com', role: 'ADMIN' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /affiliates/:id', () => {
    it('should return 200 with affiliate data when affiliate exists', async () => {
      affiliateRepository.getAffiliateById.mockResolvedValue(mockAffiliate);

      const res = await request(app)
        .get('/affiliates/1')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('email', 'juan@example.com');
    });

    it('should return 404 when affiliate does not exist', async () => {
      affiliateRepository.getAffiliateById.mockResolvedValue(null);

      const res = await request(app)
        .get('/affiliates/99999')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('El afiliado no existe');
    });
  });

  describe('GET /affiliates', () => {
    it('should return 200 with all affiliates', async () => {
      affiliateRepository.getAllAffiliates.mockResolvedValue([mockAffiliate]);

      const res = await request(app)
        .get('/affiliates')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
    });

    it('should return 200 filtering affiliates by status', async () => {
      affiliateRepository.getAffiliatesByStatus.mockResolvedValue([mockAffiliate]);

      const res = await request(app)
        .get('/affiliates?status=ACTIVE')
        .set('Authorization', 'Bearer faketoken');

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /affiliates sin autenticación', () => {
    it('should return 401 when no token is provided', async () => {
      // Sobreescribimos el mock para que falle la verificación
      jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

      const res = await request(app).get('/affiliates/1');

      expect(res.statusCode).toBe(401);
    });
  });
});
