const { EntityFactory, ValidationError } = require('../utils/factories');
const { NotFoundError, AccessDeniedError } = require('./errors');

class GameService {
    constructor(dbManager, translationFacade, cache) {
        this.dbManager = dbManager;
        this.cache = cache;
        this.entityFactory = new EntityFactory(dbManager);
        this.CACHE_KEYS = {
            GAMES_LIST: 'games_list',
            GAME_FILES: 'game_files_',
            GAME_ANALYTICS: 'game_analytics_',
            GAME_REVIEWS: 'game_reviews_'
        };
        this.VALID_GENRES = ['Аркада', 'Стратегия', 'Головоломка'];
    }

    validateGame(game) {
        try {
            this.entityFactory.validateGameOrThrow(game);
            return true;
        } catch (e) {
            if (e instanceof ValidationError) {
                throw e;
            }
            throw new ValidationError(`Неизвестная ошибка валидации: ${e.message}`);
        }
    }

async getGames(filter = {}, sort = null, search = null, page = 1, limit = 10) {
  try {
    let query = 'SELECT * FROM games';
    const params = [];
    let paramIndex = 1;

    const conditions = [];

    if (filter.author) {
      conditions.push(`author = $${paramIndex++}`);
      params.push(filter.author);
    }

    if (filter.genre && filter.genre !== 'Все игры') {
      conditions.push(`genre ILIKE $${paramIndex++}`);
      params.push(filter.genre);
    }

    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    if (sort) {
      let sortField;
      if (sort === 'views') {
        sortField = 'views DESC';
      } else if (sort === 'rating') {
        sortField = '(SELECT AVG((r->>\'rating\')::numeric) FROM jsonb_array_elements(ratings) r) DESC NULLS LAST';
      } else {
        sortField = 'upload_date DESC';
      }
      query += ` ORDER BY ${sortField}`;
    }

    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, (page - 1) * limit);

    console.log(`[DEBUG] SQL Query: ${query}, Params: ${JSON.stringify(params)}`);

    const cacheKey = `${this.CACHE_KEYS.GAMES_LIST}_${JSON.stringify(filter)}_${sort || 'none'}_${search || 'none'}_${page}_${limit}`;
    let games = this.cache.get(cacheKey);
    if (!games) {
      const res = await this.dbManager.pool.query(query, params);
      games = res.rows.map(game => this.translateGame({
        ...game,
        title: game.title || game.name,
        name: game.name || game.title,
        ratings: this.dbManager.parseJson(game.ratings, []),
        tags: this.dbManager.parseJson(game.tags, []),
        cover: game.cover || null,
        files: this.dbManager.parseJson(game.files, []),
        genre: game.genre || '',
        frozen: game.frozen || false,
        freeze_reason: game.freeze_reason || null
      }));
      this.cache.set(cacheKey, games, 300);
    }
    return games;
  } catch (err) {
    console.error('[ERROR] Error in getGames:', err);
    throw err;
  }
}


async getGameById(id) {
    console.log('GameService.getGameById: id =', id);
    if (!id) throw new ValidationError('ID игры не указан');
    const cacheKey = `${this.CACHE_KEYS.GAMES_LIST}_${id}`;
    let game = this.cache.get(cacheKey);
    if (!game) {
        try {
            game = await this.dbManager.getGameById(id);
            if (!game) {
                console.error(`Игра не найдена по id: ${id}`);
                throw new NotFoundError('Игра не найдена');
            }
            console.log('GameService.getGameById: game from DB =', {
                id: game.id,
                title: game.title,
                path: game.path,
                files: game.files
            });
            // Проверяем, что ratings, files и tags — массивы
            game.ratings = Array.isArray(game.ratings) ? game.ratings : [];
            game.files = Array.isArray(game.files) ? game.files : [];
            game.tags = Array.isArray(game.tags) ? game.tags : [];
            this.cache.set(cacheKey, game, 600);
        } catch (err) {
            console.error(`Ошибка в getGameById для id ${id}: ${err.message}`);
            throw err;
        }
    }
    return this.translateGame(game);
}

    async saveGame(game) {
        try {
            this.validateGame(game);
            await this.dbManager.saveGame(game);
            this.clearGameCache(game.id);
        } catch (e) {
            if (e instanceof ValidationError) {
                throw e;
            }
            throw new Error(`Ошибка при сохранении игры: ${e.message}`);
        }
    }

    async deleteGame(id) {
        const game = await this.dbManager.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');
        await this.dbManager.deleteGame(id);
        this.clearGameCache(id);
    }

    async getGameAnalytics(id, user) {
        console.log('Поиск аналитики для gameId:', id);
        const game = await this.dbManager.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');
        if (user.role !== 'admin' && game.author !== user.username) throw new AccessDeniedError('Доступ запрещён');

        const cacheKey = `${this.CACHE_KEYS.GAME_ANALYTICS}_${id}`;
        let analytics = this.cache.get(cacheKey);
        if (!analytics) {
            const ratings = Array.isArray(game.ratings) ? game.ratings : [];
            analytics = {
                views: game.views || 0,
                averageRating: ratings.length ? ratings.reduce((sum, r) => sum + Number(r.rating || 0), 0) / ratings.length : 0,
                ratings: ratings.length
            };
            this.cache.set(cacheKey, analytics, 300);
        }
        console.log('Аналитика:', analytics);
        return analytics;
    }

    async getGameReviews(id, user) {
        console.log('Поиск отзывов для gameId:', id);
        const game = await this.dbManager.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');
        if (user.role !== 'admin' && game.author !== user.username) throw new AccessDeniedError('Доступ запрещён');

        const cacheKey = `${this.CACHE_KEYS.GAME_REVIEWS}_${id}`;
        let reviews = this.cache.get(cacheKey);
        if (!reviews) {
            reviews = Array.isArray(game.ratings) ? game.ratings : [];
            this.cache.set(cacheKey, reviews, 300);
        }
        console.log('Отзывы:', reviews);
        return reviews.map(review => ({
            ...review,
            comment: review.comment
        }));
    }

async rateGame(id, user, rating, comment) {
    const game = await this.dbManager.getGameById(id);
    if (!game) throw new NotFoundError('Игра не найдена');
    if (rating < 1 || rating > 5 || isNaN(Number(rating))) throw new ValidationError('Недопустимый рейтинг');

    // Гарантируем, что ratings — массив
    game.ratings = Array.isArray(game.ratings) ? game.ratings : [];
    console.log('Game ratings:', game.ratings); // Отладка

    // Проверяем, оценил ли пользователь уже
    if (game.ratings.some(r => r.user === user.username)) {
        throw new ValidationError('Игра уже оценена');
    }

    const Comment = comment ? comment : '';    
    game.ratings.push({
        user: user.username,
        rating: Number(rating),
        comment: Comment,
        date: new Date().toISOString()
    });
    game.views = (game.views || 0) + 1;
    await this.saveGame(game);
}

    async updateGame(id, user, data, coverFile) {
        const game = await this.validateGameAccess(id, user);
        const updatedGame = await this.updateGameFields(game, data, coverFile);
        await this.saveGame(updatedGame);
        return this.translateGame(updatedGame);
    }

    async validateGameAccess(id, user) {
        const game = await this.dbManager.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');
        if (user.role !== 'admin' && game.author !== user.username) throw new AccessDeniedError('Доступ запрещён');
        return game;
    }
async updateGameFields(game, data, coverFile) {
    const { title, description, genre, tags, cover } = data;

    if (genre && !this.VALID_GENRES.includes(genre)) throw new ValidationError('Недопустимый жанр');

    let parsedTags = tags
        ? await Promise.all(
              tags
                  .split(',')
                  .map(tag => tag.trim())
                  .filter(tag => tag.length > 0)
                  .map(tag => tag) // Убираем вызов translationFacade, так как он больше не используется
          )
        : game.tags || [];

    game.title = title ? title : game.title || '';
    game.name = game.title;
    game.description = description ? description : game.description || '';
    game.genre = genre ? genre : game.genre || '';
    game.tags = Array.isArray(parsedTags) && parsedTags.length > 0 ? parsedTags : game.tags || [];

    // Используем cover из data, если передан, иначе сохраняем текущий cover или null
    if (cover) {
        game.cover = cover;
    } else if (coverFile) {
        // Если coverFile передан, преобразуем его в URL (для совместимости с другими вызовами)
        game.cover = `data:${coverFile.mimetype};base64,${coverFile.buffer.toString('base64')}`;
    } else {
        game.cover = game.cover || null;
    }

    console.log(`[DEBUG] Updating game ${game.id} with cover: ${game.cover}`);

    this.clearGameCache(game.id);
    return game;
}
    async incrementGameViews(id) {
        const game = await this.dbManager.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');
        game.views = (game.views || 0) + 1;
        await this.saveGame(game);
        return game.views;
    }

    async freezeGame(id, reason) {
        console.log('GameService.freezeGame: id =', id, 'reason =', reason); // Отладка
        const game = await this.dbManager.getGameById(id);
        if (!game) {
            console.error('freezeGame: Игра не найдена по id:', id);
            throw new NotFoundError('Игра не найдена');
        }
        game.frozen = true;
        game.freeze_reason = reason;
        await this.saveGame(game);
    }

    async unfreezeGame(id) {
        console.log('GameService.unfreezeGame: id =', id); // Отладка
        const game = await this.dbManager.getGameById(id);
        if (!game) throw new NotFoundError('Игра не найдена');
        game.frozen = false;
        game.freeze_reason = null;
        await this.saveGame(game);
    }

    async freezeGamesByAuthor(author, reason) {
        console.log('GameService.freezeGamesByAuthor: author =', author, 'reason =', reason); // Отладка
        const games = await this.dbManager.getGames({ author });
        if (!games.length) throw new NotFoundError('Игры не найдены');
        for (const game of games) {
            game.frozen = true;
            game.freeze_reason = reason;
            await this.saveGame(game);
        }
    }

    async unfreezeGamesByAuthor(author) {
        console.log('GameService.unfreezeGamesByAuthor: author =', author); // Отладка
        const games = await this.dbManager.getGames({ author });
        if (!games.length) throw new NotFoundError('Игры не найдены');
        for (const game of games) {
            game.frozen = false;
            game.freeze_reason = null;
            await this.saveGame(game);
        }
    }

    clearGameCache(gameId) {
        const keys = this.cache.keys();
        keys.forEach(key => {
            if (key.includes(`_${gameId}`) || key.endsWith(`_${gameId}`) || key.startsWith(this.CACHE_KEYS.GAMES_LIST)) {
                this.cache.del(key);
            }
        });
    }
}

module.exports = GameService;