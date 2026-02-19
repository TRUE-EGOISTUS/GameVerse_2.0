// test/server.test.js

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const GameServer = require('../server');

jest.mock('express');
jest.mock('cors', () => jest.fn(() => (req, res, next) => next()));
jest.mock('cookie-parser', () => jest.fn(() => (req, res, next) => next()));
jest.mock('helmet', () => jest.fn(() => (req, res, next) => next()));

jest.mock('../services/DatabaseManager');
jest.mock('../services/AuthService');
jest.mock('../services/GameService');
jest.mock('../services/UserService');
jest.mock('../services/FileManager');
jest.mock('../services/RoutesHandler');
jest.mock('../utils/cache');
jest.mock('../utils/translationFacade');
jest.mock('../utils/eventBus');
jest.mock('../utils/transliterate', () => jest.fn((text) => `en-${text}`));

const DatabaseManager = require('../services/DatabaseManager');
const AuthService = require('../services/AuthService');
const GameService = require('../services/GameService');
const UserService = require('../services/UserService');
const FileManager = require('../services/FileManager');
const RoutesHandler = require('../services/RoutesHandler');
const { Cache } = require('../utils/cache');
const TranslationFacade = require('../utils/translationFacade');
const EventBus = require('../utils/eventBus');

describe('GameServer — полный тест', () => {
    let server;
    let mockApp;

    beforeEach(() => {
        jest.clearAllMocks();

        mockApp = {
            use: jest.fn(),
            listen: jest.fn((port, cb) => cb()),
        };
        express.mockReturnValue(mockApp);

        DatabaseManager.mockImplementation(() => ({
            pool: {
                connect: jest.fn().mockResolvedValue({
                    release: jest.fn(),
                }),
                query: jest.fn()
            },
            initialize: jest.fn(),
            getGames: jest.fn().mockResolvedValue([]), // Возвращаем пустой массив игр
            deleteGame: jest.fn().mockResolvedValue() // Мок для deleteGame
        }));

        TranslationFacade.mockImplementation(() => ({
            load: jest.fn()
        }));

        RoutesHandler.mockImplementation(() => ({
            setupRoutes: jest.fn()
        }));

        server = new GameServer();
    });

    test('Проверка конструктора: переменные окружения и директории', () => {
        expect(server.PORT).toBe(process.env.PORT || 3000);
        expect(server.JWT_SECRET).toBe(process.env.JWT_SECRET || 'your-secure-secret-key');
        expect(server.dataDir).toBe(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
    });

    test('getOrCreateTranslation: находит существующий перевод', async () => {
        server.dbManager.pool.query.mockResolvedValueOnce({
            rows: [{ en_text: 'Hello' }]
        });

        const result = await server.getOrCreateTranslation('ui', 'Привет');
        expect(result).toBe('Hello');
    });

    test('getOrCreateTranslation: создает и возвращает транслитерированный перевод', async () => {
        server.dbManager.pool.query
            .mockResolvedValueOnce({ rows: [] }) // Первый запрос — нет перевода
            .mockResolvedValueOnce(); // Второй — insert

        const result = await server.getOrCreateTranslation('ui', 'Привет');
        expect(result).toBe('en-Привет');
    });

    test('getOrCreateTranslation: возвращает исходный при ошибке', async () => {
        server.dbManager.pool.query.mockRejectedValueOnce(new Error('db error'));

        const result = await server.getOrCreateTranslation('ui', 'Ошибка');
        expect(result).toBe('Ошибка');
    });

    test('_checkDatabaseConnection: успешное подключение', async () => {
        await expect(server._checkDatabaseConnection()).resolves.toBeUndefined();
        expect(server.dbManager.pool.connect).toHaveBeenCalled();
    });

    test('_checkDatabaseConnection: завершение при ошибке', async () => {
        server.dbManager.pool.connect.mockRejectedValueOnce(new Error('fail'));

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit called'); });
        await expect(server._checkDatabaseConnection()).rejects.toThrow('exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
        exitSpy.mockRestore();
    });

    test('initialize: вызывает все внутренние методы', async () => {
        const checkSpy = jest.spyOn(server, '_checkDatabaseConnection');
        const middlewareSpy = jest.spyOn(server, '_setupMiddleware');
        const routingSpy = jest.spyOn(server.routesHandler, 'setupRoutes');
        const startSpy = jest.spyOn(server, 'start');

        await server.initialize();

        expect(checkSpy).toHaveBeenCalled();
        expect(server.dbManager.initialize).toHaveBeenCalled();
        expect(server.translationFacade.load).toHaveBeenCalled();
        expect(middlewareSpy).toHaveBeenCalled();
        expect(routingSpy).toHaveBeenCalled();
        expect(startSpy).toHaveBeenCalled();
    });

    test('_setupMiddleware: подключает middleware', () => {
        server._setupMiddleware();

        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // helmet
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // cors
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // cookieParser
        expect(mockApp.use).toHaveBeenCalledWith(express.json());
        expect(mockApp.use).toHaveBeenCalledWith(express.urlencoded({ extended: true }));
        expect(mockApp.use).toHaveBeenCalledWith(express.static('public'));
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // content-type middleware
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // errorHandler
    });

    test('_setupRouting создаёт routesHandler с правильными аргументами', () => {
        RoutesHandler.mockClear();

        server._setupRouting();

        expect(RoutesHandler).toHaveBeenCalledTimes(1);
        expect(RoutesHandler).toHaveBeenCalledWith(
            server.app,
            server.authService,
            server.gameService,
            server.userService,
            server.fileManager,
            server.cache,
            server.eventBus,
            server.translationFacade
        );
    });

    test('start запускает сервер', () => {
        const listenSpy = jest.spyOn(mockApp, 'listen');
        server.start();
        expect(listenSpy).toHaveBeenCalledWith(server.PORT, expect.any(Function));
    });
});