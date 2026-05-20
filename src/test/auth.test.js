const request = require('supertest');
const app = require('../index');
const authRepository = require('../modules/auth/repository/auth.repository');
const affiliateRepository = require('../modules/affiliates/repository/affiliate.repository');
const bcrypt = require('bcryptjs');

jest.mock('../modules/auth/repository/auth.repository');
jest.mock('../modules/affiliates/repository/affiliate.repository');

describe('Auth Module', () => {
    const testUser = {
        email: 'admin@example.com',
        password: 'password123'
    };

    const mockDbUser = {
        id: 1,
        email: 'admin@example.com',
        password: '',
        role_name: 'ADMIN',
        must_change_password: false
    };

    beforeAll(async () => {
        mockDbUser.password = await bcrypt.hash(testUser.password, 10);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /auth/login', () => {
        it('should return 200 and user data for valid ADMIN credentials', async () => {
            authRepository.getUserByUsername.mockResolvedValue(mockDbUser);

            const res = await request(app)
                .post('/auth/login')
                .send(testUser);

            expect(res.statusCode).toBe(200);
            expect(res.body.user).toHaveProperty('email', testUser.email);
            expect(res.body.user).toHaveProperty('role', 'ADMIN');
        });

        it('should return 401 for invalid password', async () => {
            authRepository.getUserByUsername.mockResolvedValue(mockDbUser);

            const res = await request(app)
                .post('/auth/login')
                .send({ email: testUser.email, password: 'wrongpassword' });

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Credenciales inválidas');
        });

        it('should return 401 when user does not exist', async () => {
            authRepository.getUserByUsername.mockResolvedValue(null);

            const res = await request(app)
                .post('/auth/login')
                .send(testUser);

            expect(res.statusCode).toBe(401);
        });

        it('should return 401 for inactive affiliate account', async () => {
            const afiliadoUser = { ...mockDbUser, role_name: 'AFILIADO' };
            authRepository.getUserByUsername.mockResolvedValue(afiliadoUser);
            affiliateRepository.getAffiliateByUserId.mockResolvedValue({ status: false });

            const res = await request(app)
                .post('/auth/login')
                .send(testUser);

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toContain('no esta activa');
        });
    });

    describe('GET /auth/me', () => {
        it('should return 401 when no token is provided', async () => {
            const res = await request(app).get('/auth/me');
            expect(res.statusCode).toBe(401);
        });
    });
});


