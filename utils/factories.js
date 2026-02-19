const { v4: uuidv4 } = require('uuid');

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class EntityFactory {
    /**
     * @param {object} dbManager - объект для работы с базой (должен иметь метод getGameById)
     */
    constructor(dbManager) {
        if (!dbManager || typeof dbManager.getGameById !== 'function') {
            throw new TypeError('dbManager должен предоставлять метод getGameById');
        }
        this.dbManager = dbManager;
    }

    /**
     * Создать объект пользователя.
     * @param {object} data - сырые данные пользователя
     * @param {object} [extra] - дополнительные поля
     * @returns {object}
     */
    createUser(data = {}, extra = {}) {
        const user = {
            id: data.id || uuidv4(),
            username: data.username || '',
            password: data.password || '',
            role: data.role || 'user',
            online: data.online || false,
            avatar: data.avatar || null,
            favorites: Array.isArray(data.favorites) ? data.favorites : [],
            banned: data.banned || false,
            banned_until: data.banned_until || null,
            ban_reason: data.ban_reason || null,
            suspended_until: data.suspended_until || null,
            last_seen: data.last_seen || null,
            ...extra
        };
        return user;
    }

    /**
     * Создать объект игры.
     * @param {object} data - сырые данные игры
     * @param {object} [extra] - дополнительные поля
     * @returns {object}
     */
    createGame(data = {}, extra = {}) {
        const now = new Date().toISOString();
        const game = {
            id: data.id || uuidv4(),
            title: data.title || data.name || '',
            name: data.name || data.title || '',
            description: data.description || '',
            author: data.author || '',
            path: data.path || '',
            upload_date: data.upload_date || now,
            genre: data.genre || '',
            views: Number(data.views) || 0,
            cover: data.cover || null,
            files: Array.isArray(data.files) ? data.files : [],
            ratings: Array.isArray(data.ratings) ? data.ratings : [],
            tags: Array.isArray(data.tags) ? data.tags : [],
            ...extra
        };
        return game;
    }

    /**
     * Валидация структуры пользователя.
     * @param {object} user
     * @returns {{valid: boolean, errors?: string[]}}
     */
    validateUser(user) {
        const errors = [];
        if (typeof user.username !== 'string' || user.username.length < 3 || user.username.length > 50) {
            errors.push('username');
        }
        if (typeof user.password !== 'string' || user.password.length < 6) {
            errors.push('password');
        }
        if (!['user', 'developer', 'admin'].includes(user.role)) {
            errors.push('role');
        }
        return errors.length ? { valid: false, errors } : { valid: true };
    }

    /**
     * Валидация структуры игры (синхронно).
     * @param {object} game
     * @returns {{valid: boolean, errors?: string[]}}
     */
    validateGame(game) {
        const errors = [];
        if (typeof game.title !== 'string' || game.title.length < 1 || game.title.length > 100) {
            errors.push('title');
        }
        if (typeof game.author !== 'string' || game.author.length < 3 || game.author.length > 50) {
            errors.push('author');
        }
        if (typeof game.path !== 'string' || !game.path.startsWith('/games/')) {
            errors.push('path');
        }
        return errors.length ? { valid: false, errors } : { valid: true };
    }

    /**
     * Валидация структуры игры с выбросом исключения ValidationError при ошибках.
     * @param {object} game
     * @throws {ValidationError}
     */
    validateGameOrThrow(game) {
        const result = this.validateGame(game);
        if (!result.valid) {
            throw new ValidationError(`Ошибки валидации: ${result.errors.join(', ')}`);
        }
        return true;
    }

    /**
     * Асинхронная проверка уникальности ID игры.
     * @param {string} id
     * @returns {Promise<boolean>} - true, если ID свободен
     */
    async isGameIdAvailable(id) {
        const existing = await this.dbManager.getGameById(id);
        return existing == null;
    }

    /**
     * Преобразование пользователя для клиента (удаление секретов).
     * @param {object} user
     * @returns {object}
     */
    toClientUser(user) {
        const { password, banned_until, suspended_until, ...safe } = user;
        return safe;
    }
}

// Экспортируем методы как отдельные функции для совместимости
const factory = new EntityFactory({ getGameById: () => null }); // Заглушка для dbManager
const createUser = factory.createUser.bind(factory);
const validateUser = factory.validateUser.bind(factory);
const toClientUser = factory.toClientUser.bind(factory);
const createGame = factory.createGame.bind(factory);
const validateGame = factory.validateGame.bind(factory);

module.exports = { EntityFactory, ValidationError, createUser, validateUser, toClientUser, createGame, validateGame };