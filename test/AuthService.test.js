const AuthService = require('../services/AuthService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { ValidationError, NotFoundError, AccessDeniedError } = require('../services/errors');

jest.mock('jsonwebtoken');
jest.mock('bcrypt');

describe('AuthService', () => {
    let authService;
    let dbManager;
    let cache;
    const jwtSecret = 'test-secret';

    beforeEach(() => {
        dbManager = {
            getUserByUsername: jest.fn(),
            getUserById: jest.fn(),
            saveUser: jest.fn(),
            saveToken: jest.fn(),
        };
        cache = {
            get: jest.fn(),
            set: jest.fn(),
        };
        authService = new AuthService(jwtSecret, dbManager, cache);
    });

    describe('login', () => {
        it('должен выбросить ошибку, если логин или пароль отсутствуют', async () => {
            await expect(authService.login(null, 'password'))
                .rejects.toThrow('Отсутствуют учетные данные');
            await expect(authService.login('user', null))
                .rejects.toThrow('Отсутствуют учетные данные');
        });

        it('должен выбросить ошибку, если пароль слишком короткий', async () => {
            await expect(authService.login('user', '123'))
                .rejects.toThrow('Пароль слишком короткий');
        });

        it('должен выбросить ошибку, если пользователь не найден', async () => {
            dbManager.getUserByUsername.mockResolvedValue(null);
            await expect(authService.login('user', 'password'))
                .rejects.toThrow('Пользователь не найден');
        });

        it('должен выбросить ошибку, если у пользователя нет пароля', async () => {
            dbManager.getUserByUsername.mockResolvedValue({ password: null });
            await expect(authService.login('user', 'password'))
                .rejects.toThrow('Пароль не установлен');
        });

        it('должен выбросить ошибку, если пароль неверный', async () => {
            dbManager.getUserByUsername.mockResolvedValue({ password: 'hashed' });
            bcrypt.compare.mockResolvedValue(false);
            await expect(authService.login('user', 'password'))
                .rejects.toThrow('Неверные учетные данные');
        });

        it('должен выбросить ошибку, если пользователь забанен', async () => {
            const futureDate = new Date(Date.now() + 10000).toISOString();
            dbManager.getUserByUsername.mockResolvedValue({
                password: 'hashed',
                banned_until: futureDate,
                ban_reason: 'Нарушение',
            });
            bcrypt.compare.mockResolvedValue(true);
            await expect(authService.login('user', 'password'))
                .rejects.toThrow('Пользователь заблокирован');
        });

        it('должен выбросить ошибку, если пользователь приостановлен', async () => {
            const futureDate = new Date(Date.now() + 10000).toISOString();
            dbManager.getUserByUsername.mockResolvedValue({
                password: 'hashed',
                suspended_until: futureDate,
            });
            bcrypt.compare.mockResolvedValue(true);
            await expect(authService.login('user', 'password'))
                .rejects.toThrow('Пользователь приостановлен');
        });

        it('должен вернуть токен и информацию о пользователе при успешной авторизации', async () => {
            const user = {
                id: 1,
                username: 'test',
                password: 'hashed',
                role: 'admin',
                avatar: null,
            };
            dbManager.getUserByUsername.mockResolvedValue(user);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue('valid.token.here');

            const result = await authService.login('test', 'password');

            expect(result).toEqual({
                token: 'valid.token.here',
                user: {
                    id: 1,
                    username: 'test',
                    role: 'admin',
                    avatar: null
                }
            });
            expect(dbManager.saveUser).toHaveBeenCalled();
            expect(dbManager.saveToken).toHaveBeenCalledWith(1, 'valid.token.here');
        });
    });

    describe('verifyToken', () => {
        it('должен вернуть пользователя из кэша, если он есть', async () => {
            const cachedUser = { id: 1, username: 'cached' };
            cache.get.mockReturnValue(cachedUser);

            const result = await authService.verifyToken('some.token');
            expect(result).toEqual(cachedUser);
        });

        it('должен выбросить ошибку, если токен просрочен', async () => {
            cache.get.mockReturnValue(null);
            jwt.verify.mockImplementation(() => { throw { name: 'TokenExpiredError' }; });

            await expect(authService.verifyToken('expired.token'))
                .rejects.toThrow('Токен истек');
        });

        it('должен выбросить ошибку, если токен недействителен', async () => {
            cache.get.mockReturnValue(null);
            jwt.verify.mockImplementation(() => { throw { name: 'SomeError' }; });

            await expect(authService.verifyToken('bad.token'))
                .rejects.toThrow('Неверный токен');
        });

        it('должен выбросить ошибку, если пользователь не найден', async () => {
            cache.get.mockReturnValue(null);
            jwt.verify.mockReturnValue({ id: 1 });
            dbManager.getUserById.mockResolvedValue(null);

            await expect(authService.verifyToken('valid.token'))
                .rejects.toThrow('Пользователь не найден');
        });

        it('должен вернуть пользователя и сохранить его в кэш', async () => {
            const user = { id: 1, username: 'verified' };
            cache.get.mockReturnValue(null);
            jwt.verify.mockReturnValue({ id: 1 });
            dbManager.getUserById.mockResolvedValue(user);

            const result = await authService.verifyToken('valid.token');

            expect(result).toEqual(user);
            expect(cache.set).toHaveBeenCalledWith('token_valid.token', user, 300);
        });
    });

    describe('checkRole', () => {
        it('должен разрешить доступ, если роль совпадает', () => {
            const middleware = authService.checkRole(['admin']);
            const req = { user: { role: 'admin' } };
            const next = jest.fn();

            middleware(req, {}, next);
            expect(next).toHaveBeenCalled();
        });

        it('должен выбросить ошибку, если роль не совпадает', () => {
            const middleware = authService.checkRole(['admin']);
            const req = { user: { role: 'user' } };

            expect(() => middleware(req, {}, () => {})).toThrow('Доступ запрещён');
        });

        it('должен работать с одиночным значением роли', () => {
            const middleware = authService.checkRole('admin');
            const req = { user: { role: 'admin' } };
            const next = jest.fn();

            middleware(req, {}, next);
            expect(next).toHaveBeenCalled();
        });
    });
});
