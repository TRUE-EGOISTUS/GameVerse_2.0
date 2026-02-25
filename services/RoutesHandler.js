// Файл: RoutesHandler.js
const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { createGame, validateGame } = require('../utils/factories');
const jwt = require('jsonwebtoken');
const { ValidationError, NotFoundError, AccessDeniedError, UnauthorizedError } = require('./errors');
const GAMES_BASE_DIR = path.resolve(__dirname, '..', 'uploads', 'games'); // путь к хранилищу
class RoutesHandler {
    constructor(app, authService, gameService, userService, fileManager, cache, eventBus) {
        this.app = app;
        this.authService = authService;
        this.gameService = gameService;
        this.userService = userService;
        this.fileManager = fileManager;
        this.cache = cache;
        this.eventBus = eventBus;
        this.dataDir = path.join(__dirname, '..', 'data');
        this.CACHE_KEYS = {
            GAMES_LIST: 'games_list',
            GAME_FILES: 'game_files_'
        };

        // Проверка наличия userService и метода updateAvatar
        if (!this.userService || typeof this.userService.updateAvatar !== 'function') {
            throw new Error('userService или метод updateAvatar отсутствует');
        }
    }

    static authMiddleware(authService) {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    throw new UnauthorizedError('Токен авторизации отсутствует или неверный формат');
                }
                const token = authHeader.split(' ')[1];
                const user = await authService.verifyToken(token);
                req.user = user;
                next();
            } catch (err) {
                next(err);
            }
        };
    }

    setupRoutes() {
        const loginSchema = Joi.object({
            username: Joi.string().max(50).required(),
            password: Joi.string().min(6).max(50).required()
        });

        const registerSchema = Joi.object({
            username: Joi.string().max(50).required(),
            password: Joi.string().min(6).max(50).required(),
            role: Joi.string().valid('user', 'developer', 'admin').optional()
        });

        const gameFilterSchema = Joi.object({
            genre: Joi.string().optional(),
            sort: Joi.string().valid('views', 'rating', 'date').optional(),
            search: Joi.string().optional(),
            page: Joi.number().integer().min(1).default(1),
            limit: Joi.number().integer().min(1).max(50).default(10)
        });

        const gameUploadSchema = Joi.object({
            title: Joi.string().required(),
            description: Joi.string().allow('').optional(), // Разрешаем пустую строку
            genre: Joi.string().valid('Аркада', 'Стратегия', 'Головоломка').optional(),
            tags: Joi.string().allow('').optional(), // На всякий случай разрешаем пустую строку для tags
            gameId: Joi.string().uuid().optional()
        });

        const rateGameSchema = Joi.object({
            rating: Joi.number().integer().min(1).max(5).required(),
            comment: Joi.string().optional()
        });

        this.app.post('/login', async (req, res, next) => {
            try {
                const { error, value } = loginSchema.validate(req.body);
                if (error) throw new ValidationError(`ValidationError: ${error.message}`);
                const { username, password } = value;
                const { token, user } = await this.authService.login(username, password);
                res.json({ token, user, notifications: [] });
            } catch (err) {
                next(err);
            }
        });
this.app.post('/register', async (req, res, next) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) throw new ValidationError(`ValidationError: ${error.message}`);
        const { username, password, role } = value;
        const user = await this.userService.register(username, password, role);
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        await this.userService.dbManager.saveToken(user.id, token);
        res.json({ token, user });
    } catch (err) {
        next(err);
    }
});
// Файл: src/services/RoutesHandler.js

this.app.post('/logout', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const user = req.user;
        await this.userService.logout(user.id); // Передаём user.id вместо user
        res.clearCookie('token');
        res.status(200).json({ success: true });
    } catch (err) {
        res.clearCookie('token');
        next(err);
    }
});

        this.app.post(
            '/user/avatar',
            RoutesHandler.authMiddleware(this.authService),
            this.fileManager.getAvatarUpload().single('avatar'),
            async (req, res, next) => {
                try {
                    if (!req.file) {
                        throw new ValidationError('Файл аватара не загружен');
                    }
                    const avatar = await this.userService.updateAvatar(req.user, req.file);
                    res.json({ success: true, avatar: { url: avatar } });
                } catch (err) {
                    next(err);
                }
            }
        );

      // Файл: RoutesHandler.js
// Файл: E:\Gaming Hub\routes\RoutesHandler.js
this.app.get('/user-data', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const user = req.user;
        const userData = {
            id: user.id,
            username: user.username,
            role: user.role,
            avatar: user.avatar,
            banned: user.banned,
            banned_until: user.banned_until,
            ban_reason: user.ban_reason,
            favorites: Array.isArray(user.favorites) ? user.favorites : []
        };
        console.log(`[DEBUG] Returning user data for ${user.username}, favorites: ${JSON.stringify(userData.favorites)}`);
        res.status(200).json(userData);
    } catch (err) {
        next(err);
    }
});
this.app.put('/user/username', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const { error, value } = Joi.object({
            newUsername: Joi.string().max(50).pattern(/^[A-Za-z0-9_]+$/).required()
        }).validate(req.body);
        if (error) throw new ValidationError(`ValidationError: ${error.message}`);

        const { newUsername } = value;
        const updatedUser = await this.userService.changeUsername(req.user.id, newUsername);

        // Создаём новый токен с обновлённым именем пользователя
        const token = jwt.sign(
            { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        await this.userService.dbManager.saveToken(updatedUser.id, token);

        res.status(200).json({ success: true, username: updatedUser.username, token });
    } catch (err) {
        next(err);
    }
});

this.app.put('/user/password', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const { error, value } = Joi.object({
            oldPassword: Joi.string().min(6).required(),
            newPassword: Joi.string().min(6).required()
        }).validate(req.body);
        if (error) throw new ValidationError(`ValidationError: ${error.message}`);

        const { oldPassword, newPassword } = value;
        await this.userService.changePassword(req.user.id, oldPassword, newPassword);

        res.status(200).json({ success: true });
    } catch (err) {
        next(err);
    }
});
// Файл: RoutesHandler.js
this.app.get('/favorites', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const favorites = await this.userService.getFavorites(req.user);
        console.log(`[DEBUG] Returning favorites for user ${req.user.username}:`, JSON.stringify(favorites));
        res.status(200).json(favorites);
    } catch (err) {
        next(err);
    }
});

this.app.post('/favorites/add/:gameId', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
            try {
                const { error, value } = Joi.string().uuid().validate(req.params.gameId);
                if (error) throw new ValidationError('Invalid gameId');
                console.log(`[DEBUG] Adding game ${value} to favorites for user ${req.user.username}`);

                await this.userService.addFavorite(req.user, value);
                console.log(`[DEBUG] Game ${value} added to favorites for user ${req.user.username}`);

                const favoritesCacheKey = `${this.userService.CACHE_KEYS.USER_FAVORITES}_${req.user.id}`;
                this.cache.del(favoritesCacheKey);
                console.log(`[DEBUG] Cleared favorites cache for key: ${favoritesCacheKey}`);

                const gamesCacheKeys = this.cache.keys().filter(key => key.startsWith(this.CACHE_KEYS.GAMES_LIST));
                gamesCacheKeys.forEach(key => this.cache.del(key));
                console.log(`[DEBUG] Cleared ${gamesCacheKeys.length} games cache keys`);

                const favorites = await this.userService.getFavorites(req.user);
                res.status(200).json({ success: true, favorites: favorites.map(game => this.gameService.translateGame(game)) });
            } catch (err) {
                next(err);
            }
        });

this.app.delete('/favorites/remove/:gameId', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
  try {
    const { error, value } = Joi.string().uuid().validate(req.params.gameId);
    if (error) throw new ValidationError('Invalid gameId');
    console.log(`[DEBUG] Removing game ${value} from favorites for user ${req.user.username}`);
    await this.userService.removeFavorite(req.user, value);
    console.log(`[DEBUG] Game ${value} removed from favorites for user ${req.user.username}`);

    // Очищаем кэш избранного и игр
    const favoritesCacheKey = `${this.userService.CACHE_KEYS.USER_FAVORITES}_${req.user.id}`;
    this.cache.del(favoritesCacheKey);
    console.log(`[DEBUG] Cleared favorites cache for key: ${favoritesCacheKey}`);

    const gamesCacheKeys = this.cache.keys().filter(key => key.startsWith(this.CACHE_KEYS.GAMES_LIST));
    gamesCacheKeys.forEach(key => this.cache.del(key));
    console.log(`[DEBUG] Cleared ${gamesCacheKeys.length} games cache keys`);

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});
this.app.post('/favorites/clear-cache', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const cacheKey = `${this.userService.CACHE_KEYS.USER_FAVORITES}_${req.user.id}`;
        this.cache.del(cacheKey);
        console.log(`[DEBUG] Cache cleared for key: ${cacheKey}`);
        res.status(200).json({ success: true });
    } catch (err) {
        next(err);
    }
});
this.app.get('/games', async (req, res, next) => {
  try {
    const { error, value } = gameFilterSchema.validate(req.query);
    if (error) throw new ValidationError('ValidationError: ' + error.message);

    const { genre, sort, search, page, limit } = value;

    // Никаких toLowerCase, пусть фильтрация делается внутри SQL через ILIKE
    const filter = genre && genre !== 'Все игры' ? { genre } : {};

    const games = await this.gameService.getGames(filter, sort, search, page, limit);
    console.log(`[DEBUG] Retrieved ${games.length} games`);

    const token = req.headers.authorization?.split(' ')[1];
    let responseGames = games;

    if (token) {
      try {
        const user = await this.authService.verifyToken(token);
        console.log(`[DEBUG] Fetched user: ${user.username}`);

        const favorites = await this.userService.getFavorites(user);
        const favoriteIds = new Set(favorites.map(g => g.id));

        responseGames = games.map(game => ({
          ...game,
          isFavorite: favoriteIds.has(game.id),
          canEdit: user.role === 'admin' || game.author === user.username,
          hasRated: Array.isArray(game.ratings) && game.ratings.some(r => r.user === user.username)
        }));
      } catch (err) {
        console.warn('[WARN] Token invalid:', err.message);
        responseGames = games.map(game => ({
          ...game,
          isFavorite: false,
          canEdit: false,
          hasRated: false
        }));
      }
    } else {
      responseGames = games.map(game => ({
        ...game,
        isFavorite: false,
        canEdit: false,
        hasRated: false
      }));
    }

    const cacheKey = `${this.CACHE_KEYS.GAMES_LIST}_${genre || 'all'}_${sort || 'none'}_${search || 'none'}_${page}_${limit}`;
    this.cache.set(cacheKey, responseGames, 300);
    console.log(`[DEBUG] Cached games for key: ${cacheKey}`);
    
    res.status(200).json(responseGames);
  } catch (err) {
    next(err);
  }
});

        this.app.get('/games/:id/reviews', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
            try {
                const { error, value } = Joi.string().uuid().validate(req.params.id);
                if (error) throw new ValidationError('Некорректный gameId');
                const reviews = await this.gameService.getGameReviews(value, req.user);
                res.status(200).json(reviews);
            } catch (err) {
                next(err);
            }
        });
this.app.post('/games/clear-cache', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const cacheKeys = this.cache.keys().filter(key => key.startsWith(this.CACHE_KEYS.GAMES_LIST));
        cacheKeys.forEach(key => this.cache.del(key));
        console.log(`[DEBUG] Cleared ${cacheKeys.length} games cache keys`);
        res.status(200).json({ success: true });
    } catch (err) {
        next(err);
    }
});
        this.app.get('/admin/users', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
            try {
                const users = await this.userService.getAdminUsers();
                res.status(200).json(users);
            } catch (err) {
                next(err);
            }
        });
this.app.delete('/admin/users/:userId', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
    try {
        const { error, value: userId } = Joi.string().uuid().validate(req.params.userId);
        if (error) throw new ValidationError('Некорректный userId');
        const user = await this.userService.getUserById(userId);
        if (!user) throw new NotFoundError('Пользователь не найден');
        console.log(`[DEBUG] Deleting user with ID: ${userId}, by admin: ${req.user.id}`);
        console.log(`[DEBUG] Found user: ${JSON.stringify(user)}`);
        // Удаляем все игры пользователя
        const games = await this.gameService.getGames({ author: user.username });
        for (const game of games) {
            const gameDir = path.join(this.dataDir, 'games', game.id);
            await fs.rm(gameDir, { recursive: true, force: true });
            await this.gameService.deleteGame(game.id);
        }
        
        await this.userService.deleteUser(userId, req.user.id);
        res.status(200).json({ success: true, message: 'Пользователь и его игры удалены' });
    } catch (err) {
        next(err);
    }
});
this.app.post('/admin/users/:username/ban', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
  try {
    const { error, value: username } = Joi.string().max(50).required().validate(req.params.username);
    if (error) throw new ValidationError('Некорректное имя пользователя');
    const { error: bodyError, value: body } = Joi.object({
      banDays: Joi.number().integer().min(1).required(),
      banReason: Joi.string().min(1).required() // Делаем banReason обязательным
    }).validate(req.body);
    if (bodyError) throw new ValidationError('Некорректные данные для бана: ' + bodyError.message);
    const { banDays, banReason } = body;
    console.log(`[DEBUG] Banning user: ${username}, days: ${banDays}, reason: '${banReason}'`);
    const user = await this.userService.getUserByUsername(username);
    if (!user) throw new NotFoundError('Пользователь не найден');
    await this.userService.banUser(user.id, banDays, banReason, req.user.id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});
this.app.post('/admin/users/:username/unban', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
  try {
    const { error: usernameError, value: username } = Joi.string().max(50).validate(req.params.username);
    if (usernameError) throw new ValidationError('Некорректное имя пользователя');
    await this.userService.unbanUser(username, req.user.id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});
this.app.post('/admin/users/:username/suspend', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
  try {
    const { error: usernameError, value: username } = Joi.string().max(50).validate(req.params.username);
    if (usernameError) throw new ValidationError('Некорректное имя пользователя');
    const { error: bodyError, value: body } = Joi.object({
      days: Joi.number().integer().min(1).required()
    }).validate(req.body);
    if (bodyError) throw new ValidationError('Некорректные данные для приостановки: ' + bodyError.message);
    const { days } = body;
    console.log(`[DEBUG] Suspending user: ${username}, days: ${days}`);
    await this.userService.suspendUser(username, days, req.user);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});
this.app.post('/admin/users/:username/unsuspend', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
  try {
    const { error: usernameError, value: username } = Joi.string().max(50).validate(req.params.username);
    if (usernameError) throw new ValidationError('Некорректное имя пользователя');
    await this.userService.unsuspendUser(username, req.user.id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});
this.app.put('/admin/users/:username/role', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
  try {
    const { error: usernameError, value: username } = Joi.string().max(50).validate(req.params.username);
    if (usernameError) throw new ValidationError('Некорректное имя пользователя');
    const { error: bodyError, value: body } = Joi.object({
      role: Joi.string().valid('user', 'developer', 'admin').required()
    }).validate(req.body);
    if (bodyError) throw new ValidationError('Некорректная роль: ' + bodyError.message);
    const { role } = body;
    console.log(`[DEBUG] Updating role for user: ${username}, new role: ${role}`);
    await this.userService.updateUserRole(username, role, req.user.id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

        this.app.post('/admin/games/:id/freeze', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
            try {
                const { error, value: id } = Joi.string().uuid().validate(req.params.id);
                if (error) throw new ValidationError('Некорректный gameId');
                const { error: bodyError, value: body } = Joi.object({
                    freezeReason: Joi.string().required()
                }).validate(req.body);
                if (bodyError) throw new ValidationError('Некорректная причина заморозки');

                const { freezeReason } = body;
                await this.gameService.freezeGame(id, freezeReason);
                res.status(200).json({ message: 'Игра заморожена' });
            } catch (err) {
                next(err);
            }
        });

        this.app.post('/admin/games/author/:author/freeze', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
            try {
                const { error, value: author } = Joi.string().max(50).validate(req.params.author);
                if (error) throw new ValidationError('Некорректное имя автора');
                const { error: bodyError, value: body } = Joi.object({
                    freezeReason: Joi.string().required()
                }).validate(req.body);
                if (bodyError) throw new ValidationError('Некорректная причина заморозки');

                const { freezeReason } = body;
                await this.gameService.freezeGamesByAuthor(author, freezeReason);
                res.status(200).json({ message: `Все игры автора ${author} заморожены` });
            } catch (err) {
                next(err);
            }
        });

        this.app.post('/admin/games/:id/unfreeze', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
            try {
                const { error, value: id } = Joi.string().uuid().validate(req.params.id);
                if (error) throw new ValidationError('Некорректный gameId');
                await this.gameService.unfreezeGame(id);
                res.status(200).json({ message: 'Игра разморожена' });
            } catch (err) {
                next(err);
            }
        });

        this.app.post('/admin/games/author/:author/unfreeze', RoutesHandler.authMiddleware(this.authService), this.authService.checkRole(['admin']), async (req, res, next) => {
            try {
                const { error, value: author } = Joi.string().max(50).validate(req.params.author);
                if (error) throw new ValidationError('Некорректное имя автора');
                await this.gameService.unfreezeGamesByAuthor(author);
                res.status(200).json({ message: `Все игры автора ${author} разморожены` });
            } catch (err) {
                next(err);
            }
        });

this.app.get('/games/:id', async (req, res, next) => {
    try {
        const { error, value } = Joi.string().uuid().validate(req.params.id);
        if (error) throw new ValidationError('Invalid gameId');
        const game = await this.gameService.getGameById(value);
        if (!game) throw new NotFoundError('Игра не найдена');

        const token = req.headers.authorization?.split(' ')[1];
        let responseGame = game;
        if (token) {
            try {
                const user = await this.authService.verifyToken(token);
                responseGame = {
                    ...game,
                    isFavorite: Array.isArray(user.favorites) && user.favorites.includes(game.id),
                    canEdit: user.role === 'admin' || game.author === user.username
                };
            } catch (err) {
                // Ignore token error
            }
        }
        res.status(200).json(responseGame);
    } catch (err) {
        next(err);
    }
});

this.app.get('/games/:id/files', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
  try {
    const { error, value } = Joi.string().uuid().validate(req.params.id);
    if (error) throw new ValidationError('Invalid gameId');

    const game = await this.gameService.dbManager.getGameById(value);
    if (!game) throw new NotFoundError('Игра не найдена');
    if (req.user.role !== 'admin' && game.author !== req.user.username) {
      throw new AccessDeniedError('Доступ запрещён');
    }

    const cacheKey = `${this.CACHE_KEYS.GAME_FILES}_${value}`;
    let files = this.cache.get(cacheKey);

    if (!files) {
      const rawFiles = Array.isArray(game.files) ? [...new Set(game.files)] : [];
      files = await Promise.all(
        rawFiles.map(async relPath => {
          const absPath = path.join(GAMES_BASE_DIR, value, relPath);
          let size = 0;
          let modified = null;

          try {
            const stat = await fs.stat(absPath);
            size = stat.size;
            modified = stat.mtime.toISOString();
          } catch {
            // Файл может быть удалён — не критично
          }

          return {
            path: relPath.replace(/\\/g, '/'),
            name: path.basename(relPath),
            size,
            modified
          };
        })
      );

      this.cache.set(cacheKey, files, 600); // 10 мин
    }

    res.status(200).json(files);
  } catch (err) {
    next(err);
  }
});

        this.app.post('/games/:id/rate', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
            try {
                const { error: idError, value: id } = Joi.string().uuid().validate(req.params.id);
                if (idError) throw new ValidationError('Invalid gameId');
                const { error, value } = rateGameSchema.validate(req.body);
                if (error) throw new ValidationError('ValidationError: ' + error.message);

                const { rating, comment } = value;
                await this.gameService.rateGame(id, req.user, rating, comment);
                this.gameService.clearGameCache(id);
                res.status(200).json({ success: true });
            } catch (err) {
                next(err);
            }
        });

        this.app.put('/games/:id', RoutesHandler.authMiddleware(this.authService), this.fileManager.getCoverUpload().single('cover'), async (req, res, next) => {
            try {
                const { error: idError, value: id } = Joi.string().uuid().validate(req.params.id);
                if (idError) throw new ValidationError('Invalid gameId');
                const { error, value } = gameUploadSchema.validate(req.body);
                if (error) throw new ValidationError('ValidationError: ' + error.message);

                const game = await this.gameService.updateGame(id, req.user, value, req.file || null);
                this.gameService.clearGameCache(id);
                res.status(200).json({ success: true, game });
            } catch (err) {
                next(err);
            }
        });

this.app.delete('/games/:id', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const { error, value: id } = Joi.string().uuid().validate(req.params.id);
        if (error) throw new ValidationError('Некорректный gameId');

        const game = await this.gameService.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');

        if (req.user.role !== 'admin' && game.author !== req.user.username) {
            throw new AccessDeniedError('Доступ запрещён');
        }

        const gameDir = path.join(this.dataDir, 'games', id);
        await fs.rm(gameDir, { recursive: true, force: true });
        await this.gameService.deleteGame(id);
        this.gameService.clearGameCache(id);
        res.status(200).json({ success: true, message: 'Игра удалена' });
    } catch (err) {
        next(err);
    }
});

        this.app.post('/games/:id/view', async (req, res, next) => {
            try {
                const { error, value } = Joi.string().uuid().validate(req.params.id);
                if (error) throw new ValidationError('Invalid gameId');
                const views = await this.gameService.incrementGameViews(value);
                this.gameService.clearGameCache(value);
                res.status(200).json({ views });
            } catch (err) {
                next(err);
            }
        });
this.app.post('/games/:id/cover', RoutesHandler.authMiddleware(this.authService), (req, res, next) => {
    console.log(`[DEBUG] Raw request headers: ${JSON.stringify(req.headers, null, 2)}`);
    console.log(`[DEBUG] Raw request body (before multer): ${req.body ? JSON.stringify(req.body) : 'undefined'}`);
    next();
}, this.fileManager.getCoverUpload().single('cover'), async (req, res, next) => {
    try {
        const { error: idError, value: id } = Joi.string().uuid().validate(req.params.id);
        if (idError) throw new ValidationError('Invalid gameId');

        console.log(`[DEBUG] Processing cover upload for gameId: ${id}`);
        console.log(`[DEBUG] Full req.file: ${JSON.stringify(req.file, null, 2)}`);
        console.log(`[DEBUG] req.body: ${JSON.stringify(req.body, null, 2)}`);

        const game = await this.gameService.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');
        if (req.user.role !== 'admin' && game.author !== req.user.username) {
            throw new AccessDeniedError('Доступ запрещён');
        }

        if (!req.file) {
            throw new ValidationError('Файл обложки не загружен');
        }

        const fs = require('fs').promises;
        const fileBuffer = await fs.readFile(req.file.path);
        if (!fileBuffer || fileBuffer.length === 0) {
            await fs.unlink(req.file.path).catch(e => console.error(`[ERROR] Failed to delete temp file: ${e.message}`));
            throw new ValidationError(`Файл обложки ${req.file.originalname} не содержит данных`);
        }

        const coverUrl = await this.fileManager.saveCoverBuffer(id, fileBuffer, path.extname(req.file.originalname).slice(1));
        console.log(`[DEBUG] Cover URL generated: ${coverUrl}`);

        await fs.unlink(req.file.path);
        console.log(`[DEBUG] Deleted temp file: ${req.file.path}`);

        const updatedGame = await this.gameService.updateGame(id, req.user, { cover: coverUrl }, null);
        console.log(`[DEBUG] Updated game with cover: ${updatedGame.cover}`);

        this.gameService.clearGameCache(id);
        res.status(200).json({ success: true, game: updatedGame });
    } catch (err) {
        if (req.file && req.file.path) {
            require('fs').promises.unlink(req.file.path).catch(e => console.error(`[ERROR] Failed to delete temp file: ${e.message}`));
        }
        next(err);
    }
});
        this.app.get('/developer/games', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
            try {
                const cacheKey = `${this.CACHE_KEYS.GAMES_LIST}_developer_${req.user.username}`;
                let userGames = this.cache.get(cacheKey);
                if (!userGames) {
                    const games = await this.gameService.getGames();
                    userGames = games.filter(game => game.author === req.user.username || req.user.role === 'admin');
                    this.cache.set(cacheKey, userGames, 300);
                }
                res.status(200).json(userGames);
            } catch (err) {
                next(err);
            }
        });

this.app.post('/games/upload',
    RoutesHandler.authMiddleware(this.authService),
    this.authService.checkRole(['developer', 'admin']), this.fileManager.getGameUpload(),

    async (req, res, next) => {
        let newGameId = null;
        try {
            const files = req.files || [];
            if (!files.length) throw new ValidationError('Файлы игры не загружены');
            const { error, value } = gameUploadSchema.validate(req.body);
            if (error) throw new ValidationError('ValidationError: ' + error.message);

            const { title, description, genre, tags, gameId } = value;
            newGameId = gameId || uuidv4();
            const existingGame = await this.gameService.dbManager.getGameById(newGameId);
            if (existingGame) throw new ValidationError('Игра с таким ID уже существует');

            // Сохраняем файлы через FileManager
            const gameFiles = await this.fileManager.saveGameFiles(req, newGameId);
            console.log(`[DEBUG] Сохраненные файлы: ${JSON.stringify(gameFiles)}`);

            // Находим файл index__*.html
            const indexFiles = gameFiles.filter(f => f.match(/simple_game[\\\/]index__.*\.html$/i));
            if (indexFiles.length === 0) {
                throw new ValidationError('Файл index.html не найден среди сохраненных файлов');
            }
            if (indexFiles.length > 1) {
                console.warn(`[WARNING] Найдено несколько файлов index__*.html: ${indexFiles.join(', ')}. Используется первый: ${indexFiles[0]}`);
            }
            const indexPath = indexFiles[0];
            const gamePath = `/games/${newGameId}/${indexPath}`;

            // Обновляем ссылки в index__*.html
            const indexFilePath = path.join(this.dataDir, 'games', newGameId, indexPath);
            let indexContent;
            try {
                indexContent = await fs.readFile(indexFilePath, 'utf8');
                if (typeof indexContent !== 'string') {
                    console.error(`[ERROR] indexContent is not a string: ${typeof indexContent}`);
                    throw new ValidationError('Содержимое файла index.html не является строкой');
                }
            } catch (err) {
                console.error(`[ERROR] Не удалось прочитать файл ${indexFilePath}: ${err.message}`);
                throw new ValidationError('Не удалось прочитать файл index.html');
            }

            const fileMap = new Map();
            gameFiles.forEach(file => {
                const originalName = path.basename(file).replace(/__[a-f0-9]{8}/, '');
                fileMap.set(originalName, path.basename(file));
            });
            indexContent = indexContent.replace(/(src|href)="([^"]+)"/g, (match, attr, url) => {
                const fileName = path.basename(url);
                const hashedName = fileMap.get(fileName);
                if (hashedName) {
                    const newUrl = url.replace(fileName, hashedName);
                    return `${attr}="${newUrl}"`;
                }
                return match;
            });
            await fs.writeFile(indexFilePath, indexContent);
            console.log(`[DEBUG] Обновлены ссылки в ${indexPath}`);

            const parsedTags = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

            const game = createGame({
                id: newGameId,
                name: title,
                title: title ? title : '',
                description: description ? description : '',
                author: req.user.username,
                path: gamePath, // Используем правильный путь
                upload_date: new Date().toISOString(),
                genre: genre ? genre : '',
                views: 0,
                cover: null,
                files: gameFiles,
                ratings: [],
                tags: parsedTags,
            });

            if (!validateGame(game)) {
                throw new ValidationError('Некорректные данные игры');
            }

            await this.gameService.saveGame(game);
            this.gameService.clearGameCache(newGameId);
            this.eventBus.publish('game_uploaded', { game });
            res.status(200).json({ success: true, gameId: newGameId });
        } catch (err) {
            if (req.files && newGameId) {
                const gameDir = path.join(this.dataDir, 'games', newGameId);
                await fs.rm(gameDir, { recursive: true, force: true });
                console.log(`[DEBUG] Удалена директория игры ${newGameId} из-за ошибки`);
            }
            next(err);
        }
    });



this.app.get('/games/:id/play', async (req, res, next) => {
    try {
        const { error, value } = Joi.string().uuid().validate(req.params.id);
        if (error) throw new ValidationError('Некорректный gameId');
        const gameId = value;

        console.log(`[DEBUG] Запрос игры: ${gameId}`);
        const result = await this.gameService.dbManager.pool.query('SELECT path, files FROM games WHERE id = $1', [gameId]);
        if (result.rows.length === 0) throw new NotFoundError('Игра не найдена');

        let gamePath = result.rows[0].path;
        const gameFiles = result.rows[0].files || [];
        console.log(`[DEBUG] Путь из базы данных: ${gamePath}`);
        console.log(`[DEBUG] Файлы игры: ${JSON.stringify(gameFiles)}`);

        const gameDir = path.join(this.dataDir, 'games', gameId);
        let absPath = path.join(this.dataDir, gamePath.replace(/^\/+/, '')); // Убираем начальные слеши
        console.log(`[DEBUG] Абсолютный путь: ${absPath}`);

        if (!absPath.startsWith(gameDir)) throw new AccessDeniedError('Доступ запрещён');

        try {
            await fs.access(absPath, fs.constants.F_OK);
            console.log(`[DEBUG] Файл найден: ${absPath}`);
        } catch {
            console.log(`[DEBUG] Файл ${absPath} не найден, ищем альтернативный index__*.html`);
            const simpleGameDir = path.join(gameDir, 'simple_game');
            let files;
            try {
                files = await fs.readdir(simpleGameDir);
                console.log(`[DEBUG] Файлы в simple_game: ${files}`);
            } catch {
                console.error(`[ERROR] Директория simple_game не найдена: ${simpleGameDir}`);
                throw new NotFoundError('Директория simple_game не найдена');
            }

            let indexFiles = files.filter(f => f.match(/^index__.*\.html$/i));
            if (indexFiles.length === 0) {
                // Проверяем files из базы данных
                indexFiles = gameFiles
                    .filter(f => f.match(/simple_game[\\\/]index__.*\.html$/i))
                    .map(f => path.basename(f));
                console.log(`[DEBUG] Index файлы из базы данных: ${indexFiles}`);
            }

            if (indexFiles.length === 0) {
                console.error(`[ERROR] Файл игры не найден для gameId: ${gameId}`);
                throw new NotFoundError('Файл игры не найден');
            }

            absPath = path.join(simpleGameDir, indexFiles[0]);
            console.log(`[DEBUG] Найден альтернативный индексный файл: ${absPath}`);

            // Проверяем существование альтернативного файла
            try {
                await fs.access(absPath, fs.constants.F_OK);
                console.log(`[DEBUG] Альтернативный файл найден: ${absPath}`);
            } catch {
                console.error(`[ERROR] Альтернативный файл не найден: ${absPath}`);
                throw new NotFoundError('Файл игры не найден');
            }
        }

        const mimeType = mime.lookup(absPath) || 'text/html';
        console.log(`[DEBUG] Отправка файла: ${absPath}, MIME: ${mimeType}`);
        res.setHeader('Content-Type', mimeType);
        res.sendFile(absPath, (err) => {
            if (err) {
                console.error(`[ERROR] Не удалось отправить файл: ${absPath}`, err);
                return next(new NotFoundError('Не удалось загрузить файл игры'));
            }
        });
    } catch (err) {
        next(err);
    }
});

this.app.get('/games/:gameId/*', async (req, res, next) => {
    try {
        const { gameId } = req.params;
        let filePath = req.originalUrl.split(`/games/${gameId}/`).pop() || '';
        console.log(`[DEBUG] Запрошен файл: ${filePath} для gameId: ${gameId}`);
        const { error, value: validatedGameId } = Joi.string().uuid().validate(gameId);
        if (error) throw new ValidationError('Некорректный gameId');

        // Получаем игру из базы данных
        const game = await this.gameService.dbManager.getGameById(validatedGameId);
        if (!game) throw new NotFoundError('Игра не найдена');

        // Нормализуем filePath, убирая начальные слеши
        filePath = filePath.replace(/^\/+/, '');

        const gameDir = path.join(this.dataDir, 'games', validatedGameId);
        const simpleGameDir = path.join(gameDir, 'simple_game');
        let absPath = path.join(simpleGameDir, filePath);
        console.log(`[DEBUG] Абсолютный путь: ${absPath}`);

        if (!absPath.startsWith(simpleGameDir)) throw new AccessDeniedError('Доступ запрещён');

        // Проверяем, является ли запрошенный файл нехэшированным
        const fileName = path.basename(filePath);
        const fileMap = new Map();
        (game.files || []).forEach(file => {
            const originalName = path.basename(file).replace(/__[a-f0-9]{8}/, '');
            fileMap.set(originalName, file);
        });
        const hashedFile = fileMap.get(fileName);
        if (hashedFile) {
            absPath = path.join(simpleGameDir, path.basename(hashedFile));
            console.log(`[DEBUG] Сопоставлено ${fileName} с ${hashedFile}`);
        }

        const cacheKey = `${this.CACHE_KEYS.GAME_FILES}_${validatedGameId}_${filePath || 'index'}`;
        const cachedFile = this.cache.get(cacheKey);
        if (cachedFile) {
            console.log(`[DEBUG] Файл ${filePath} найден в кэше`);
            res.setHeader('Content-Type', cachedFile.mimeType);
            return res.status(200).send(cachedFile.content);
        }

        try {
            const stat = await fs.stat(absPath);
            if (!stat.isFile()) {
                console.log(`[DEBUG] ${absPath} не является файлом`);
                throw new NotFoundError('Файл не найден');
            }
        } catch {
            console.log(`[DEBUG] Файл ${absPath} не найден на диске`);
            // Пробуем найти index__*.html
            let files;
            try {
                files = await fs.readdir(simpleGameDir);
            } catch {
                throw new NotFoundError('Директория simple_game не найдена');
            }
            const indexFiles = files.filter(f => f.match(/^index__.*\.html$/i));
            if (indexFiles.length === 0) {
                throw new NotFoundError('Файл игры не найден');
            }
            absPath = path.join(simpleGameDir, indexFiles[0]);
            console.log(`[DEBUG] Найден альтернативный индексный файл: ${absPath}`);
        }

        // Проверяем содержимое файла на безопасность
        const buffer = await fs.readFile(absPath);
        const mimeType = mime.lookup(absPath) || 'application/octet-stream';
        console.log(`[DEBUG] Отправка файла ${absPath} с MIME-типом: ${mimeType}`);
        this.cache.set(cacheKey, { mimeType, content: buffer }, 600);
        res.setHeader('Content-Type', mimeType);
        res.status(200).send(buffer);
    } catch (err) {
        next(err);
    }
});
this.app.get('/game-analytics/:id', RoutesHandler.authMiddleware(this.authService), async (req, res, next) => {
    try {
        const { error, value: id } = Joi.string().uuid().validate(req.params.id);
        if (error) throw new ValidationError('Некорректный gameId');
        const analytics = await this.gameService.getGameAnalytics(id, req.user);
        res.status(200).json(analytics);
    } catch (err) {
        next(err);
    }
});
        this.app.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
        });
    }
}

module.exports = RoutesHandler;