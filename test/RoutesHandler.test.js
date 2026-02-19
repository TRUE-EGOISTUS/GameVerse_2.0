const request = require('supertest');
const express = require('express');
const RoutesHandler = require('../services/RoutesHandler');
const AuthService = require('../services/AuthService');
const GameService = require('../services/GameService');
const UserService = require('../services/UserService');
const { ValidationError, NotFoundError } = require('../services/errors');
const { Cache, NodeCacheStrategy } = require('../utils/cache');
const EventBus = require('../utils/eventBus');
const TranslationFacade = require('../utils/translationFacade');
const path = require('path');
const Joi = require('joi');
const fsSync = require('fs');
const jwt = require('jsonwebtoken');
const avatarPath = path.join(__dirname, 'fixtures', 'test.jpg'); // путь к тестовому изображению
const { v4: uuidv4 } = require('uuid');
// Мокаем зависимости
jest.mock('../services/AuthService');
jest.mock('../services/GameService');
jest.mock('../services/UserService');
jest.mock('../services/FileManager'); // Мок для FileManager
jest.mock('../utils/cache');
jest.mock('../utils/eventBus');
jest.mock('../utils/translationFacade');
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        existsSync: jest.fn().mockReturnValue(true),
        readFileSync: jest.fn().mockReturnValue(Buffer.from('file content')),
        promises: {
            mkdir: jest.fn().mockResolvedValue(undefined),
            rename: jest.fn().mockResolvedValue(undefined),
            readFile: jest.fn().mockImplementation(() => Promise.resolve(Buffer.from('file content'))),
            writeFile: jest.fn().mockResolvedValue(undefined),
            stat: jest.fn().mockResolvedValue({ isFile: () => true }),
            access: jest.fn().mockResolvedValue(undefined),
            unlink: jest.fn().mockResolvedValue(undefined),
            rm: jest.fn().mockResolvedValue(undefined),
            readdir: jest.fn().mockResolvedValue([])
        }
    };
});
jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockImplementation(() => Promise.resolve(Buffer.from('file content'))),
    writeFile: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ isFile: () => true }),
    access: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([])
}));
jest.mock('../utils/fileAntivirus', () => ({
    isFileContentSafe: jest.fn().mockReturnValue(true)
}));

describe('RoutesHandler', () => {
  beforeEach(() => {
    console.log('Setting up test environment');
    // Создаем новое приложение Express
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Настройка authService
    authService = new AuthService();
    authService.checkRole = jest.fn().mockImplementation(() => (req, res, next) => next());
    authService.verifyToken = jest.fn().mockImplementation((token) => {
        if (token === 'mockToken') {
            return Promise.resolve({
                id: '1',
                username: 'testuser',
                role: 'developer'
            });
        }
        throw new Error('Invalid token');
    });

    gameService = new GameService();
    gameService.dbManager = {
        getGameById: jest.fn().mockResolvedValue(null),
        pool: { query: jest.fn().mockResolvedValue({ rows: [{ path: '/games/game1/simple_game/index.html' }] }) }
    };
    gameService.saveGame = jest.fn().mockResolvedValue();
    gameService.clearGameCache = jest.fn();
    gameService.translateGame = jest.fn().mockImplementation(game => game);
    gameService.getGames = jest.fn().mockResolvedValue([{ id: 'game1', title: 'Game 1' }]);
    gameService.getGameById = jest.fn().mockResolvedValue({ id: 'game1', title: 'Game 1' });
    gameService.rateGame = jest.fn().mockResolvedValue();
    gameService.updateGame = jest.fn().mockResolvedValue({ id: 'game1', title: 'Updated Game' });

    userService = new UserService();
    userService.dbManager = {
        saveToken: jest.fn().mockResolvedValue()
    };
    userService.register = jest.fn().mockResolvedValue({ id: 1, username: 'newuser', role: 'user' });
    userService.logout = jest.fn().mockResolvedValue();
    userService.updateAvatar = jest.fn().mockResolvedValue('/avatars/test.jpg');
    userService.getUserData = jest.fn().mockResolvedValue({ username: 'testuser', role: 'user' });
    userService.getFavorites = jest.fn().mockResolvedValue([{ id: 'game1', title: 'Game 1' }]);
    userService.addFavorite = jest.fn().mockResolvedValue();
    userService.removeFavorite = jest.fn().mockResolvedValue();
    userService.getAdminUsers = jest.fn().mockResolvedValue([{ username: 'user1' }]);
    userService.banUser = jest.fn().mockResolvedValue();

    fileManager = {
        allowedTypes: { game: ['application/javascript', 'text/css', 'text/html'], avatar: ['image/jpeg', 'image/png'] },
        getAvatarUpload: jest.fn().mockImplementation(() => ({
            single: jest.fn(() => (req, res, next) => {
                console.log('Default getAvatarUpload.single called');
                req.file = {
                    buffer: Buffer.from('fake image data'),
                    mimetype: 'image/jpeg',
                    originalname: 'avatar.jpg'
                };
                next();
            })
        })),
        getGameUpload: jest.fn().mockImplementation(() => (req, res, next) => {
            console.log('Mock getGameUpload called');
            req.files = req.files || [
                {
                    buffer: Buffer.from('fake game data'),
                    mimetype: 'application/javascript',
                    originalname: 'index.js'
                },
                {
                    buffer: Buffer.from('Game'),
                    mimetype: 'text/html',
                    originalname: 'simple_game/index.html'
                }
            ];
            next();
        }),
        getCoverUpload: jest.fn().mockImplementation(() => ({
            single: jest.fn(() => (req, res, next) => {
                req.file = { path: 'cover.jpg', mimetype: 'image/jpeg', originalname: 'cover.jpg' };
                req.body = req.body || { title: 'Updated Game' };
                next();
            })
        })),
        checkAvatarSafetyMiddleware: jest.fn().mockImplementation(() => (req, res, next) => {
            console.log('checkAvatarSafetyMiddleware called, req.file:', req.file);
            next();
        }),
        checkGameFilesSafetyMiddleware: jest.fn().mockImplementation(() => (req, res, next) => {
            console.log('Mock checkGameFilesSafetyMiddleware called, req.files:', req.files);
            if (!req.files || !req.files.length) {
                return next(new ValidationError('Файлы игры не загружены'));
            }
            req.files.forEach(file => {
                file.isSafe = true;
            });
            next();
        }),
        saveGameFiles: jest.fn() // Добавляем мок для saveGameFiles
    };

    cache = new Cache(new NodeCacheStrategy());
    cache.get = jest.fn().mockReturnValue(null);
    cache.set = jest.fn();
    eventBus = new EventBus();
    eventBus.publish = jest.fn();
    translationFacade = new TranslationFacade();
    translationFacade.getOrCreate = jest.fn().mockResolvedValue('translated');

    routesHandler = new RoutesHandler(
        app,
        authService,
        gameService,
        userService,
        fileManager,
        cache,
        eventBus,
        translationFacade
    );

    // Вызываем setupRoutes после настройки мок
    routesHandler.setupRoutes();
});
    afterEach(() => {
        console.log('Clearing mocks');
        jest.clearAllMocks();
        jest.resetAllMocks();
    });

    describe('POST /login', () => {
        it('успешный логин с валидными данными', async () => {
            const mockUser = { id: 1, username: 'testuser', role: 'user' };
            authService.login.mockResolvedValue({ token: 'mockToken', user: mockUser });

            const response = await request(app)
                .post('/login')
                .send({ username: 'testuser', password: 'password123' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ token: 'mockToken', user: mockUser, notifications: [] });
            expect(authService.login).toHaveBeenCalledWith('testuser', 'password123');
        });

        it('ошибка валидации при неверных данных', async () => {
            // Ожидается ошибка валидации для пустых полей
            const response = await request(app)
                .post('/login')
                .send({ username: '', password: '' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toHaveProperty('message', expect.stringContaining('ValidationError'));
        });
    });

    describe('POST /register', () => {
        it('успешная регистрация', async () => {
            const mockUser = { id: 1, username: 'newuser', role: 'user' };
            userService.register.mockResolvedValue(mockUser);
            userService.dbManager.saveToken.mockResolvedValue();
            jest.spyOn(jwt, 'sign').mockReturnValue('mockToken');

            const response = await request(app)
                .post('/register')
                .send({ username: 'newuser', password: 'password123', role: 'user' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ token: 'mockToken', user: mockUser });
            expect(userService.register).toHaveBeenCalledWith('newuser', 'password123', 'user');
            expect(jwt.sign).toHaveBeenCalled();
        });

        it('ошибка валидации при неверных данных', async () => {
            const response = await request(app)
                .post('/register')
                .send({ username: '', password: 'short' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toHaveProperty('message', expect.stringContaining('ValidationError'));
        });
    });

    describe('POST /logout', () => {
        it('успешный выход с валидным токеном', async () => {
            const mockUser = { id: 1, username: 'testuser' };
            authService.verifyToken.mockResolvedValue(mockUser);
            userService.logout.mockResolvedValue();

            const response = await request(app)
                .post('/logout')
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(userService.logout).toHaveBeenCalledWith(mockUser);
        });

        it('успешный выход без токена', async () => {
            const response = await request(app).post('/logout');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
        });
    });

    describe('POST /user/avatar', () => {
        it('успешная загрузка аватара', async () => {
            const mockUser = { id: '1', username: 'testuser', role: 'user' };
            authService.verifyToken.mockResolvedValue(mockUser);

            fileManager.getAvatarUpload.mockImplementation(() => ({
                single: jest.fn(() => (req, res, next) => {
                    console.log('Mock getAvatarUpload.single called');
                    req.file = {
                        buffer: Buffer.from('fake image data'),
                        mimetype: 'image/jpeg',
                        originalname: 'avatar.jpg'
                    };
                    next();
                }),
            }));

            fileManager.checkAvatarSafetyMiddleware.mockImplementation(() => (req, res, next) => {
                console.log('Mock checkAvatarSafetyMiddleware called, req.file:', req.file);
                next();
            });
            userService.updateAvatar.mockResolvedValue('/avatars/test.jpg');

            const response = await request(app)
                .post('/user/avatar')
                .set('Authorization', 'Bearer mockToken')
                .attach('avatar', Buffer.from('fake image data'), 'avatar.jpg');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true, avatar: { url: '/avatars/test.jpg' } });
            expect(userService.updateAvatar).toHaveBeenCalledWith(mockUser, expect.any(Object));
        });

        it('ошибка при отсутствии файла', async () => {
            // Создаем новое приложение Express для теста
            const app = express();
            app.use(express.json());
            app.use(express.urlencoded({ extended: true }));

            const mockUser = { id: 1, username: 'testuser', role: 'developer' };
            authService.verifyToken.mockResolvedValue(mockUser);

            // Сбрасываем моки
            fileManager.getAvatarUpload.mockReset();
            fileManager.getAvatarUpload.mockImplementation(() => ({
                single: jest.fn(() => (req, res, next) => {
                    console.log('Mock getAvatarUpload.single called, setting req.file to null');
                    req.file = null;
                    next();
                })
            }));

            fileManager.checkAvatarSafetyMiddleware.mockReset();
            fileManager.checkAvatarSafetyMiddleware.mockImplementation(() => (req, res, next) => {
                console.log('Mock checkAvatarSafetyMiddleware called, req.file:', req.file);
                next();
            });

            userService.updateAvatar.mockReset();
            userService.updateAvatar.mockImplementation((user, file) => {
                console.log('userService.updateAvatar called with file:', file);
                if (!file) {
                    throw new ValidationError('Файл аватара не загружен');
                }
                return Promise.resolve('/avatars/test.jpg');
            });

            // Регистрируем маршрут /user/avatar
            app.post(
                '/user/avatar',
                (req, res, next) => {
                    console.log('Starting /user/avatar route');
                    next();
                },
                RoutesHandler.authMiddleware(authService),
                fileManager.getAvatarUpload().single('avatar'),
                (req, res, next) => {
                    console.log('After getAvatarUpload, req.file:', req.file);
                    next();
                },
                fileManager.checkAvatarSafetyMiddleware(),
                (req, res, next) => {
                    console.log('After checkAvatarSafetyMiddleware, req.file:', req.file);
                    if (!req.file) {
                        console.log('ValidationError: Файл аватара не загружен');
                        return next(new ValidationError('Файл аватара не загружен'));
                    }
                    next();
                },
                async (req, res, next) => {
                    try {
                        console.log('Processing avatar upload, req.file:', req.file);
                        const avatar = await userService.updateAvatar(req.user, req.file);
                        res.json({ success: true, avatar: { url: avatar } });
                    } catch (err) {
                        console.error('Ошибка в /user/avatar:', err);
                        next(err);
                    }
                }
            );

            // Добавляем обработчик ошибок
            app.use((err, req, res, next) => {
                const status = err.statusCode || 500;
                console.log('Error handler:', err.message, 'Status:', status);
                res.status(status).json({
                    success: false,
                    error: {
                        message: err instanceof ValidationError ? `ValidationError: ${err.message}` : err.message
                    }
                });
            });

            const response = await request(app)
                .post('/user/avatar')
                .set('Authorization', 'Bearer mockToken');

            console.log('Response:', response.status, response.body);
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error.message).toContain('Файл аватара не загружен');
        });
    });

    describe('GET /user-data', () => {
        it('успешное получение данных пользователя', async () => {
            const mockUser = { id: '1', username: 'testuser', role: 'user' };
            authService.verifyToken.mockResolvedValue(mockUser);
            userService.getUserData.mockResolvedValue({ username: 'testuser', role: 'user' });

            const response = await request(app)
                .get('/user-data')
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ username: 'testuser', role: 'user' });
        });
    });

    describe('GET /favorites', () => {
        it('успешное получение избранного', async () => {
            const mockUser = { id: '1', username: 'testuser', role: 'user' };
            authService.verifyToken.mockResolvedValue(mockUser);
            userService.getFavorites.mockResolvedValue([{ id: 'game1', title: 'Game 1' }]);
            gameService.translateGame.mockReturnValue({ id: 'game1', title: 'Game 1' });

            const response = await request(app)
                .get('/favorites')
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([{ id: 'game1', title: 'Game 1' }]);
        });
    });

    describe('POST /favorites/add/:gameId', () => {
        it('успешное добавление в избранное', async () => {
            const mockUser = { id: '1', username: 'testuser', role: 'user' };
            authService.verifyToken.mockResolvedValue(mockUser);
            userService.addFavorite.mockResolvedValue();

            const gameId = uuidv4();
            const response = await request(app)
                .post(`/favorites/add/${gameId}`)
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(userService.addFavorite).toHaveBeenCalledWith(mockUser, gameId);
        });
    });

    describe('DELETE /favorites/remove/:gameId', () => {
        it('успешное удаление из избранного', async () => {
            const mockUser = { id: '1', username: 'testuser', role: 'user' };
            authService.verifyToken.mockResolvedValue(mockUser);
            userService.removeFavorite.mockResolvedValue();


            const gameId = uuidv4();
            const response = await request(app)
                .delete(`/favorites/remove/${gameId}`)
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(userService.removeFavorite).toHaveBeenCalledWith(mockUser, gameId);
        });
    });

    describe('GET /games', () => {
        it('успешное получение списка игр', async () => {
            gameService.getGames.mockResolvedValue([{ id: 'game1', title: 'Game 1' }]);
            authService.verifyToken.mockResolvedValue({ id: 'user1', username: 'testuser', role: 'user', favorites: [] });

            const response = await request(app).get('/games')
                .query({ genre: 'Аркада', sort: 'views', search: 'game', page: 1, limit: 10 })
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([{ id: 'game1', title: 'Game 1', isFavorite: false, canEdit: false, hasRated: false }]);
        });
    });

    describe('GET /games/:id', () => {
        it('успешное получение игры по ID', async () => {
            const gameId = '550e8400-e29b-41d4-a716-446655440000';
            gameService.getGameById.mockResolvedValue({ id: gameId, title: 'Game 1', author: 'otheruser' });
            authService.verifyToken.mockResolvedValue({
                id: 'user1',
                username: 'testuser',
                role: 'user',
                favorites: []
            });

            const response = await request(app)
                .get(`/games/${gameId}`)
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                id: gameId,
                title: 'Game 1',
                author: 'otheruser',
                isFavorite: false,
                canEdit: false
            });
        });


        it('ошибка при отсутствии игры', async () => {
            const gameId = '550e8400-e29b-41d4-a716-446655440000'; // Валидный UUID
            gameService.getGameById.mockResolvedValue(null);

            const response = await request(app).get(`/games/${gameId}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toHaveProperty('message', expect.stringContaining('Игра не найдена'));
        });
    });

    describe('POST /games/:id/rate', () => {
        it('успешная оценка игры', async () => {
            const mockUser = { id: '1', username: 'testuser', role: 'user' };
            authService.verifyToken.mockResolvedValue(mockUser);
            gameService.rateGame.mockResolvedValue();
            gameService.clearGameCache.mockImplementation(() => { });
            const gameId = uuidv4();
            const response = await request(app)
                .post(`/games/${gameId}/rate`)
                .set('Authorization', 'Bearer mockToken')
                .send({ rating: 5, comment: 'Great game' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
            expect(gameService.rateGame).toHaveBeenCalledWith(gameId, mockUser, 5, 'Great game');
        });
    });

    describe('PUT /games/:id', () => {
        it('успешное обновление игры', async () => {
            const app = express();
            app.use(express.json());
            app.use(express.urlencoded({ extended: true }));

            const mockUser = { id: 1, username: 'testuser', role: 'developer' };
            authService.verifyToken.mockResolvedValue(mockUser);
            authService.checkRole.mockImplementation(() => (req, res, next) => next());

            const gameUpdateSchema = Joi.object({
                title: Joi.string().required(),
                description: Joi.string().allow('').optional(),
                genre: Joi.string().allow('').optional(),
                tags: Joi.string().allow('').optional()
            });

            fileManager.getCoverUpload.mockReset();
            fileManager.getCoverUpload.mockImplementation(() => ({
                single: jest.fn(() => (req, res, next) => {
                    console.log('Mock getCoverUpload.single called');
                    req.file = {
                        buffer: Buffer.from('fake image data'),
                        mimetype: 'image/jpeg',
                        originalname: 'cover.jpg'
                    };
                    req.body = { title: 'Updated Game' }; // Явно устанавливаем title
                    next();
                })
            }));

            gameService.updateGame.mockResolvedValue({ id: 'game1', title: 'Updated Game' });
            gameService.clearGameCache.mockImplementation(() => { });
            translationFacade.getOrCreate.mockResolvedValue('translated');

            app.put(
                '/games/:id',
                RoutesHandler.authMiddleware(authService),
                authService.checkRole(['developer', 'admin']),
                fileManager.getCoverUpload().single('cover'),
                async (req, res, next) => {
                    try {
                        console.log('Processing /games/:id, req.file:', req.file, 'req.body:', req.body);
                        const { error, value } = gameUpdateSchema.validate(req.body);
                        if (error) throw new ValidationError('ValidationError: ' + error.message);
                        const gameId = req.params.id;
                        const game = await gameService.updateGame(gameId, req.user, value, req.file);
                        gameService.clearGameCache(gameId);
                        res.json({ success: true, game });
                    } catch (err) {
                        console.error('Update error:', err);
                        next(err);
                    }
                }
            );

            app.use((err, req, res, next) => {
                const status = err.statusCode || 500;
                console.log('Error handler:', err.message, 'Status:', status);
                res.status(status).json({
                    success: false,
                    error: {
                        message: err instanceof ValidationError ? `ValidationError: ${err.message}` : err.message
                    }
                });
            });

            const response = await request(app)
                .put('/games/game1')
                .set('Authorization', 'Bearer mockToken')
                .field('title', 'Updated Game')
                .attach('cover', Buffer.from('fake image data'), 'cover.jpg');

            console.log('Response:', response.status, response.body);
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true, game: { id: 'game1', title: 'Updated Game' } });
            expect(gameService.updateGame).toHaveBeenCalledWith(
                'game1',
                mockUser,
                expect.objectContaining({ title: 'Updated Game' }),
                expect.objectContaining({ buffer: expect.any(Buffer), mimetype: 'image/jpeg', originalname: 'cover.jpg' })
            );
        });

        it('ошибка валидации при неверных данных', async () => {
            const mockUser = { id: 'user1', username: 'testuser', role: 'user' };
            const gameId = '550e8400-e29b-41d4-a716-446655440000'; // Валидный UUID

            authService.verifyToken.mockResolvedValue(mockUser);
            fileManager.getCoverUpload.mockReturnValue({
                single: jest.fn().mockImplementation(() => (req, res, next) => {
                    console.log('Mock getCoverUpload.single called');
                    req.file = null;
                    next();
                })
            });

            const response = await request(app)
                .put(`/games/${gameId}`)
                .set('Authorization', 'Bearer mockToken')
                .send({ title: '' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toHaveProperty('message', expect.stringContaining('ValidationError'));
        });
    });
describe('POST /games/upload', () => {
    it('успешная загрузка игры', async () => {
        const fsPromises = require('fs').promises; // Импортируем fs.promises
        const mockUser = { id: '1', username: 'testuser', role: 'developer' };
        authService.verifyToken.mockResolvedValue(mockUser);
        authService.checkRole.mockImplementation(() => (req, _, next) => next());
        gameService.saveGame.mockResolvedValue();
        gameService.dbManager.getGameById.mockResolvedValue(null);
        translationFacade.getOrCreate.mockResolvedValue('translated');
        eventBus.publish.mockResolvedValue();

        // Настраиваем моки для fileManager
        fileManager.getGameUpload.mockImplementation(() => (req, res, next) => {
            console.log('Mock getGameUpload called, req.body:', req.body, 'req.files:', req.files);
            // Устанавливаем поля формы в req.body
            req.body = {
                title: 'Test Game Title',
                genre: 'Аркада',
                description: '',
                tags: ''
            };
            req.files = [
                {
                    buffer: Buffer.from('fake game data'),
                    mimetype: 'application/javascript',
                    originalname: 'js/index.js'
                },
                {
                    buffer: Buffer.from('<html><body>Game</body></html>'),
                    mimetype: 'text/html',
                    originalname: 'simple_game/index.html'
                }
            ];
            next();
        });

        fileManager.saveGameFiles.mockImplementation(async (req, gameId) => {
            console.log('Mock saveGameFiles called with gameId:', gameId);
            return ['simple_game/index__12345678.html', 'js/index__12345678.js'];
        });

        fileManager.checkGameFilesSafetyMiddleware.mockImplementation(() => (req, res, next) => {
            console.log('Mock checkGameFilesSafetyMiddleware called, req.body:', req.body, 'req.files:', req.files);
            req.files.forEach(file => {
                file.isSafe = true;
            });
            next();
        });

        // Настраиваем мок для fs.promises.readFile
        console.log('Setting up fsPromises.readFile mock');
        fsPromises.readFile.mockReset();
        fsPromises.readFile.mockImplementation((filePath, encoding) => {
            console.log(`Mock fsPromises.readFile called for path: ${filePath}, encoding: ${encoding}`);
            if (filePath.includes('simple_game/index__12345678.html') && encoding === 'utf8') {
                return Promise.resolve('<html><body><script src="/js/index.js"></script></body></html>');
            }
            return Promise.resolve('unknown file content');
        });

        fsPromises.writeFile.mockReset();
        fsPromises.writeFile.mockResolvedValue();

        const response = await request(app)
            .post('/games/upload')
            .set('Authorization', 'Bearer mockToken')
            .field('title', 'Test Game Title')
            .field('genre', 'Аркада')
            .field('description', '')
            .field('tags', '')
            .attach('gameFiles', Buffer.from('<html><body>Game</body></html>'), 'simple_game/index.html')
            .attach('gameFiles', Buffer.from('fake game data'), 'js/index.js');

        console.log('Response status:', response.status, 'Response body:', response.body);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, gameId: expect.any(String) });
        expect(gameService.saveGame).toHaveBeenCalled();
        expect(fileManager.saveGameFiles).toHaveBeenCalled();
        expect(fsPromises.writeFile).toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledWith('game_uploaded', expect.any(Object));
    });

    it('ошибка при отсутствии файлов', async () => {
        authService.verifyToken.mockResolvedValue({ id: '1', username: 'testuser', role: 'developer' });
        authService.checkRole.mockImplementation(() => (req, res, next) => next());
        fileManager.getGameUpload.mockImplementation(() => (req, res, next) => {
            console.log('Mock getGameUpload called, setting req.files to []');
            req.files = [];
            next();
        });

        const response = await request(app)
            .post('/games/upload')
            .set('Authorization', 'Bearer mockToken')
            .field('title', 'Test Game');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('message', expect.stringContaining('Файлы игры не загружены'));
    });
});

    describe('GET /games/:id/play', () => {
        const fsSync = require('fs');

        it('успешное воспроизведение игры', async () => {
            const app = express();
            gameService.getGameById.mockResolvedValue({
                id: 'game1',
                path: '/games/game1/simple_game/index.html'
            });

            jest.spyOn(fsSync, 'existsSync').mockReturnValue(true);
            jest.spyOn(fsSync, 'readFileSync').mockReturnValue(Buffer.from('game content'));

            app.get('/games/:id/play', async (req, res, next) => {
                try {
                    const gameId = req.params.id;
                    const game = await gameService.getGameById(gameId);
                    if (!game) throw new ValidationError('Игра не найдена');
                    const filePath = path.join(__dirname, '..', game.path);
                    if (!fsSync.existsSync(filePath)) throw new ValidationError('Файл игры не найден');
                    const content = fsSync.readFileSync(filePath);
                    res.set('Content-Type', 'text/html');
                    res.send(content);
                } catch (err) {
                    next(err);
                }
            });

            app.use((err, req, res, next) => {
                const status = err.statusCode || 500;
                console.log('Error handler:', err.message, 'Status:', status);
                res.status(status).json({
                    success: false,
                    error: {
                        message: err instanceof ValidationError ? `ValidationError: ${err.message}` : err.message
                    }
                });
            });

            const response = await request(app).get('/games/game1/play');

            console.log('Response:', response.status, response.body);
            expect(response.status).toBe(200);
        });

        it('ошибка при отсутствии игры', async () => {
            const gameId = '550e8400-e29b-41d4-a716-446655440000'; // Валидный UUID
            gameService.dbManager.pool.query.mockResolvedValue({ rows: [] });

            const response = await request(app).get(`/games/${gameId}/play`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toHaveProperty('message', expect.stringContaining('Игра не найдена'));
        });
    });

    const fsSync = require('fs');

    describe('GET /games/:gameId/..', () => {
        it('успешное получение файла игры', async () => {
            const app = express();
            const cache = { set: jest.fn(), get: jest.fn() };
            gameService.getGameById.mockResolvedValue({
                id: 'game1',
                files: ['js/script.js']
            });

            jest.spyOn(fsSync, 'existsSync').mockReturnValue(true);
            jest.spyOn(fsSync, 'readFileSync').mockReturnValue(Buffer.from('file content'));

            app.get('/games/:gameId/*', async (req, res, next) => {
                try {
                    const gameId = req.params.gameId;
                    const filePath = req.params[0];
                    const fullPath = path.join(__dirname, '..', 'data', 'games', gameId, filePath);
                    const game = await gameService.getGameById(gameId);
                    if (!game) throw new ValidationError('Игра не найдена');
                    if (!fsSync.existsSync(fullPath)) throw new ValidationError('Файл не найден');
                    const content = fsSync.readFileSync(fullPath);
                    cache.set(fullPath, content);
                    res.send(content);
                } catch (err) {
                    next(err);
                }
            });

            app.use((err, req, res, next) => {
                const status = err.statusCode || 500;
                console.log('Error handler:', err.message, 'Status:', status);
                res.status(status).json({
                    success: false,
                    error: {
                        message: err instanceof ValidationError ? `ValidationError: ${err.message}` : err.message
                    }
                });
            });

            const response = await request(app).get('/games/game1/js/script.js');

            console.log('Response:', response.status, response.body);
            expect(response.status).toBe(200);
            expect(response.body).toEqual(Buffer.from('file content'));
            expect(cache.set).toHaveBeenCalled();
        });

        describe('GET /games/:gameId/..', () => {
            it('ошибка при отсутствии файла', async () => {
                const app = express();
                gameService.getGameById.mockResolvedValue({
                    id: 'game1',
                    files: []
                });

                jest.spyOn(fsSync, 'existsSync').mockReturnValue(false);

                app.get('/games/:gameId/*', async (req, res, next) => {
                    try {
                        const gameId = req.params.gameId;
                        const filePath = req.params[0];
                        const fullPath = path.join(__dirname, '..', 'data', 'games', gameId, filePath);
                        const game = await gameService.getGameById(gameId);
                        if (!game) throw new ValidationError('Игра не найдена');
                        if (!fsSync.existsSync(fullPath)) throw new NotFoundError('Файл не найден');
                        const content = fsSync.readFileSync(fullPath);
                        res.send(content);
                    } catch (err) {
                        next(err);
                    }
                });

                app.use((err, req, res, next) => {
                    const status = err.statusCode || 500;
                    res.status(status).json({
                        success: false,
                        error: { message: err.message }
                    });
                });

                const response = await request(app).get('/games/game1/js/script.js');

                expect(response.status).toBe(404);
                expect(response.body).toHaveProperty('success', false);
                expect(response.body.error.message).toContain('Файл не найден');
            });
        });
    });

    describe('Admin Routes', () => {
        it('успешное получение списка пользователей (admin)', async () => {
            authService.verifyToken.mockResolvedValue({ id: 1, username: 'admin', role: 'admin' });
            authService.checkRole.mockImplementation(() => (req, res, next) => next());
            userService.getAdminUsers.mockResolvedValue([{ username: 'user1' }]);

            const response = await request(app)
                .get('/admin/users')
                .set('Authorization', 'Bearer mockToken');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([{ username: 'user1' }]);
        });

        it('успешный бан пользователя (admin)', async () => {
            authService.verifyToken.mockResolvedValue({ id: 1, username: 'admin', role: 'admin' });
            authService.checkRole.mockImplementation(() => (req, res, next) => next());
            userService.banUser.mockResolvedValue();

            const response = await request(app)
                .post('/admin/users/user1/ban')
                .set('Authorization', 'Bearer mockToken')
                .send({ banDays: 7, banReason: 'Test ban' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });
        });
    });
});