const GameService = require('../services/GameService');
const { NotFoundError, AccessDeniedError} = require('../services/errors');
const { ValidationError } = require('../utils/factories');
describe('GameService', () => {
  let dbManager;
  let translationFacade;
  let cache;
  let service;

  beforeEach(() => {
    dbManager = {
      pool: { query: jest.fn() },
      parseJson: jest.fn((input, def) => (input ? JSON.parse(input) : def)),
      getGameById: jest.fn(),
      saveGame: jest.fn(),
      deleteGame: jest.fn(),
      getGames: jest.fn()
    };

    translationFacade = {
      translate: jest.fn((namespace, key) => `${namespace}_${key}`),
      getOrCreate: jest.fn((ns, key) => Promise.resolve(`${ns}_${key}`))
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(() => [])
    };

    service = new GameService(dbManager, translationFacade, cache);
  });

  describe('getGames', () => {
    it('должен формировать правильный SQL запрос и возвращать игры из базы с переводами и форматированием даты', async () => {
      const mockRows = [
        {
          id: 1,
          title: 'Test Game',
          name: 'Test Game Name',
          ratings: '[]',
          tags: '[]',
          cover: null,
          files: '[]',
          genre: 'Аркада',
          frozen: false,
          freeze_reason: null,
          upload_date: '2023-01-01'
        }
      ];

      dbManager.pool.query.mockResolvedValue({ rows: mockRows });
      cache.get.mockReturnValue(null);

      const games = await service.getGames({ author: 'author1' }, 'views', 'search', 1, 5);

      expect(dbManager.pool.query).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();

      expect(games).toHaveLength(1);
      expect(games[0].genre).toBe('genres_Аркада');
      expect(games[0].title).toBe('descriptions_Test Game');
      expect(games[0].upload_date).toBe('01.01.2023');
    });

    it('возвращает кешированные данные, если они есть', async () => {
      const cachedGames = [{ id: 123 }];
      cache.get.mockReturnValue(cachedGames);

      const games = await service.getGames();

      expect(cache.get).toHaveBeenCalled();
      expect(dbManager.pool.query).not.toHaveBeenCalled();
      expect(games).toBe(cachedGames);
    });
  });

  describe('getGameById', () => {
    it('возвращает игру из кеша', async () => {
      const cachedGame = { id: 1, title: 'cached' };
      cache.get.mockReturnValue(cachedGame);

      const result = await service.getGameById(1);

      expect(cache.get).toHaveBeenCalled();
      expect(result.title).toContain('cached');
    });

    it('выбрасывает NotFoundError если игра не найдена', async () => {
      cache.get.mockReturnValue(null);
      dbManager.getGameById.mockResolvedValue(null);

      await expect(service.getGameById(99)).rejects.toThrow(NotFoundError);
    });

    it('получает игру из БД и кеширует', async () => {
      cache.get.mockReturnValue(null);
      const game = { id: 1, title: 'Game1', ratings: [], tags: [], upload_date: '2023-01-01' };
      dbManager.getGameById.mockResolvedValue(game);

      const result = await service.getGameById(1);

      expect(dbManager.getGameById).toHaveBeenCalledWith(1);
      expect(cache.set).toHaveBeenCalled();
      expect(result.title).toContain('Game1');
    });
  });

  describe('saveGame', () => {
   it('выбрасывает ValidationError при невалидных данных', async () => {
    const invalidGame = {};
    await expect(service.saveGame(invalidGame)).rejects.toBeInstanceOf(ValidationError);
  });

    it('сохраняет игру и очищает кеш', async () => {
      const game = { id: 1, title: 'Title', author: 'author', path: '/games/test' };
      dbManager.saveGame.mockResolvedValue();
      cache.keys.mockReturnValue(['game_1', 'games_list']);

      await service.saveGame(game);

      expect(dbManager.saveGame).toHaveBeenCalledWith(game);
      expect(cache.keys).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledTimes(2);
      expect(cache.del).toHaveBeenCalledWith('game_1');
      expect(cache.del).toHaveBeenCalledWith('games_list');
    });
  });

  describe('deleteGame', () => {
    it('выбрасывает NotFoundError если игра не найдена', async () => {
      dbManager.getGameById.mockResolvedValue(null);
      await expect(service.deleteGame(1)).rejects.toThrow(NotFoundError);
    });

    it('удаляет игру и очищает кеш', async () => {
      const game = { id: 1 };
      dbManager.getGameById.mockResolvedValue(game);
      dbManager.deleteGame.mockResolvedValue();
      cache.keys.mockReturnValue(['game_1', 'games_list']);

      await service.deleteGame(1);

      expect(dbManager.deleteGame).toHaveBeenCalledWith(1);
      expect(cache.keys).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledTimes(2);
      expect(cache.del).toHaveBeenCalledWith('game_1');
      expect(cache.del).toHaveBeenCalledWith('games_list');
    });
  });

  describe('getGameAnalytics', () => {
    it('выбрасывает NotFoundError если игра не найдена', async () => {
      dbManager.getGameById.mockResolvedValue(null);
      await expect(service.getGameAnalytics(1, { role: 'user', username: 'u' })).rejects.toThrow(NotFoundError);
    });

    it('выбрасывает AccessDeniedError если не админ и не автор', async () => {
      dbManager.getGameById.mockResolvedValue({ author: 'author1', ratings: [] });
      await expect(service.getGameAnalytics(1, { role: 'user', username: 'other' })).rejects.toThrow(AccessDeniedError);
    });

    it('возвращает аналитику и кеширует', async () => {
      const game = {
        author: 'author1',
        ratings: [{ rating: 4 }, { rating: 2 }],
        views: 10
      };
      dbManager.getGameById.mockResolvedValue(game);
      cache.get.mockReturnValue(null);

      const analytics = await service.getGameAnalytics(1, { role: 'admin', username: 'admin' });

      expect(analytics.averageRating).toBe(3);
      expect(analytics.views).toBe(10);
      expect(cache.set).toHaveBeenCalled();
    });
  });

  describe('rateGame', () => {
    it('выбрасывает NotFoundError если игра не найдена', async () => {
      dbManager.getGameById.mockResolvedValue(null);
      await expect(service.rateGame(1, { username: 'user' }, 5, 'comment')).rejects.toThrow(NotFoundError);
    });

    it('выбрасывает ValidationError если рейтинг некорректный', async () => {
      const game = { ratings: [] };
      dbManager.getGameById.mockResolvedValue(game);

      await expect(service.rateGame(1, { username: 'user' }, 6, 'comment')).rejects.toBeInstanceOf(ValidationError);
      await expect(service.rateGame(1, { username: 'user' }, 0, 'comment')).rejects.toBeInstanceOf(ValidationError);
      await expect(service.rateGame(1, { username: 'user' }, 'abc', 'comment')).rejects.toBeInstanceOf(ValidationError);
    });

    it('выбрасывает ValidationError если пользователь уже оценил игру', async () => {
      const game = { ratings: [{ user: 'user' }] };
      dbManager.getGameById.mockResolvedValue(game);
      await expect(service.rateGame(1, { username: 'user' }, 3, '')).rejects.toBeInstanceOf(ValidationError);
    });

    it('успешно оценивает игру', async () => {
      const game = { ratings: [], views: 0, id: 1 };
      dbManager.getGameById.mockResolvedValue(game);
      translationFacade.getOrCreate.mockResolvedValue('translated comment');
      service.saveGame = jest.fn();

      await service.rateGame(1, { username: 'user' }, 4, 'comment');

      expect(game.ratings.length).toBe(1);
      expect(game.views).toBe(1);
      expect(service.saveGame).toHaveBeenCalledWith(game);
    });
  });

  describe('updateGame', () => {
    it('вызывает validateGameAccess и updateGameFields, сохраняет игру', async () => {
      const game = { id: 1, author: 'user' };
      const user = { username: 'user', role: 'user' };
      const data = { title: 'new title', genre: 'Аркада' };
      const coverFile = { mimetype: 'image/png', buffer: Buffer.from('') };

      service.validateGameAccess = jest.fn().mockResolvedValue(game);
      service.updateGameFields = jest.fn().mockResolvedValue(game);
      service.saveGame = jest.fn();
      service.translateGame = jest.fn().mockReturnValue('translated game');

      const result = await service.updateGame(1, user, data, coverFile);

      expect(service.validateGameAccess).toHaveBeenCalledWith(1, user);
      expect(service.updateGameFields).toHaveBeenCalledWith(game, data, coverFile);
      expect(service.saveGame).toHaveBeenCalledWith(game);
      expect(result).toBe('translated game');
    });
  });

  describe('validateGameAccess', () => {
    it('выбрасывает NotFoundError если игра не найдена', async () => {
      dbManager.getGameById.mockResolvedValue(null);
      await expect(service.validateGameAccess(1, { role: 'user', username: 'u' })).rejects.toThrow(NotFoundError);
    });

    it('выбрасывает AccessDeniedError если пользователь не админ и не автор', async () => {
      dbManager.getGameById.mockResolvedValue({ author: 'author1' });
      await expect(service.validateGameAccess(1, { role: 'user', username: 'other' })).rejects.toThrow(AccessDeniedError);
    });

    it('возвращает игру если пользователь админ или автор', async () => {
      const game = { author: 'user' };
      dbManager.getGameById.mockResolvedValue(game);
      const user1 = { role: 'admin', username: 'any' };
      const user2 = { role: 'user', username: 'user' };

      await expect(service.validateGameAccess(1, user1)).resolves.toEqual(game);
      await expect(service.validateGameAccess(1, user2)).resolves.toEqual(game);
    });
  });

  describe('updateGameFields', () => {
    it('обновляет поля игры и обложку', async () => {
      const game = { id: 1, cover: 'old.png' };
      const data = { title: 'New Title', genre: 'Аркада' };
      const coverFile = { mimetype: 'image/png', buffer: Buffer.from('') };

      const updatedGame = await service.updateGameFields(game, data, coverFile);

      expect(updatedGame.title).toBe('descriptions_New Title');
      expect(updatedGame.genre).toBe('genres_Аркада');
      expect(updatedGame.cover).toBeDefined();
    });

    it('без файла обложки не меняет cover', async () => {
      const game = { cover: 'old.png' };
      const data = { title: 'Title' };
      const updatedGame = await service.updateGameFields(game, data, null);
      expect(updatedGame.cover).toBe('old.png');
    });
  });

  describe('translateGame', () => {
    it('возвращает объект с переведёнными полями', () => {
      const game = {
        title: 'title',
        genre: 'genre',
        frozen: false,
        freeze_reason: '',
        ratings: [],
        tags: [],
        upload_date: '2023-01-01'
      };
      translationFacade.translate.mockImplementation((ns, key) => `${ns}_${key}`);

      const result = service.translateGame(game);

      expect(result.title).toContain('descriptions_title');
      expect(result.genre).toContain('genres_genre');
      expect(result.upload_date).toBe('01.01.2023');
    });
  });

  // Тесты для validateGame
  describe('validateGame', () => {
    it('выбрасывает ValidationError если нет title', () => {
      expect(() => service.validateGame({ author: 'author', path: '/games/test' })).toThrowError(ValidationError);
    });

    it('выбрасывает ValidationError если нет author', () => {
      expect(() => service.validateGame({ title: 'Title', path: '/games/test' })).toThrowError(ValidationError);
    });

    it('выбрасывает ValidationError если нет path', () => {
      expect(() => service.validateGame({ title: 'Title', author: 'author' })).toThrowError(ValidationError);
    });

    it('не выбрасывает если есть title, author и path', () => {
      expect(() => service.validateGame({ title: 'Title', author: 'author', path: '/games/test' })).not.toThrow();
    });
  });
});