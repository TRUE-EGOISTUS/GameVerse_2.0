const { EntityFactory } = require('../utils/factories'); // Исправленный импорт
const { v4: uuidv4 } = require('uuid');

jest.mock('uuid');

describe('EntityFactory', () => {
  let dbManagerMock;
  let factory;

  beforeEach(() => {
    dbManagerMock = {
      getGameById: jest.fn()
    };
    factory = new EntityFactory(dbManagerMock);
    uuidv4.mockReturnValue('mock-uuid');
  });

  describe('constructor', () => {
    test('выбрасывает ошибку если dbManager отсутствует или нет getGameById', () => {
      expect(() => new EntityFactory(null)).toThrow(TypeError);
      expect(() => new EntityFactory({})).toThrow(TypeError);
      expect(() => new EntityFactory({ getGameById: 'not a function' })).toThrow(TypeError);
    });

    test('создаёт экземпляр с валидным dbManager', () => {
      expect(factory.dbManager).toBe(dbManagerMock);
    });
  });

  describe('createUser', () => {
    test('создаёт пользователя с переданными данными', () => {
      const data = {
        id: 'id1',
        username: 'user',
        password: 'pass123',
        role: 'admin',
        online: true,
        avatar: 'avatar.png',
        favorites: ['game1'],
        banned: true,
        banned_until: '2025-01-01',
        ban_reason: 'cheating',
        suspended_until: '2024-12-31',
        last_seen: '2025-05-22',
      };
      const extra = { extraField: 123 };

      const user = factory.createUser(data, extra);
      expect(user).toEqual(expect.objectContaining({
        ...data,
        extraField: 123
      }));
    });

    test('создаёт пользователя с дефолтными значениями', () => {
      const user = factory.createUser();
      expect(user.id).toBe('mock-uuid');
      expect(user.username).toBe('');
      expect(user.password).toBe('');
      expect(user.role).toBe('user');
      expect(user.online).toBe(false);
      expect(user.avatar).toBeNull();
      expect(user.favorites).toEqual([]);
      expect(user.banned).toBe(false);
      expect(user.banned_until).toBeNull();
      expect(user.ban_reason).toBeNull();
      expect(user.suspended_until).toBeNull();
      expect(user.last_seen).toBeNull();
    });

    test('favorites становится пустым массивом если не массив', () => {
      const user = factory.createUser({ favorites: 'not array' });
      expect(user.favorites).toEqual([]);
    });
  });

  describe('createGame', () => {
    test('создаёт игру с переданными данными', () => {
      const data = {
        id: 'game1',
        title: 'Title',
        name: 'Name',
        description: 'desc',
        author: 'author',
        path: '/games/game1',
        upload_date: '2025-01-01T00:00:00.000Z',
        genre: 'genre',
        views: '123',
        cover: 'cover.png',
        files: ['file1'],
        ratings: [5],
        tags: ['tag1']
      };
      const extra = { extraProp: 'extra' };

      const game = factory.createGame(data, extra);
      expect(game).toEqual(expect.objectContaining({
        ...data,
        views: 123,
        extraProp: 'extra'
      }));
    });

    test('создаёт игру с дефолтами и дата сейчас', () => {
      const before = new Date();
      const game = factory.createGame();
      const after = new Date();

      expect(game.id).toBe('mock-uuid');
      expect(game.title).toBe('');
      expect(game.name).toBe('');
      expect(game.description).toBe('');
      expect(game.author).toBe('');
      expect(game.path).toBe('');
      expect(new Date(game.upload_date).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(game.upload_date).getTime()).toBeLessThanOrEqual(after.getTime());
      expect(game.genre).toBe('');
      expect(game.views).toBe(0);
      expect(game.cover).toBeNull();
      expect(game.files).toEqual([]);
      expect(game.ratings).toEqual([]);
      expect(game.tags).toEqual([]);
    });

    test('если title отсутствует, берёт name, и наоборот', () => {
      let game = factory.createGame({ name: 'NameOnly' });
      expect(game.title).toBe('NameOnly');
      expect(game.name).toBe('NameOnly');

      game = factory.createGame({ title: 'TitleOnly' });
      expect(game.title).toBe('TitleOnly');
      expect(game.name).toBe('TitleOnly');
    });

    test('files, ratings и tags становятся пустыми массивами если не массивы', () => {
      const game = factory.createGame({
        files: 'no array',
        ratings: 'no array',
        tags: 'no array',
      });
      expect(game.files).toEqual([]);
      expect(game.ratings).toEqual([]);
      expect(game.tags).toEqual([]);
    });
  });

  describe('validateUser', () => {
    test('валидный пользователь возвращает {valid: true}', () => {
      const user = {
        username: 'username',
        password: '123456',
        role: 'user',
      };
      expect(factory.validateUser(user)).toEqual({ valid: true });
    });

    test('валидирует username', () => {
      const invalids = ['', 'ab', 'a'.repeat(51), 123];
      for (const username of invalids) {
        const result = factory.validateUser({ username, password: '123456', role: 'user' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('username');
      }
    });

    test('валидирует password', () => {
      const invalids = ['', '12345', 123456];
      for (const password of invalids) {
        const result = factory.validateUser({ username: 'username', password, role: 'user' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('password');
      }
    });

    test('валидирует role', () => {
      const invalidRoles = ['guest', '', null, 123];
      for (const role of invalidRoles) {
        const result = factory.validateUser({ username: 'username', password: '123456', role });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('role');
      }
    });
  });

  describe('validateGame', () => {
    test('валидная игра возвращает {valid: true}', () => {
      const game = {
        title: 'Valid Title',
        author: 'AuthorName',
        path: '/games/game1',
      };
      expect(factory.validateGame(game)).toEqual({ valid: true });
    });

    test('валидирует title', () => {
      const invalids = ['', 'a'.repeat(101), 123];
      for (const title of invalids) {
        const game = { title, author: 'AuthorName', path: '/games/game1' };
        const result = factory.validateGame(game);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('title');
      }
    });

    test('валидирует author', () => {
      const invalids = ['', 'ab', 'a'.repeat(51), 123];
      for (const author of invalids) {
        const game = { title: 'Title', author, path: '/games/game1' };
        const result = factory.validateGame(game);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('author');
      }
    });

    test('валидирует path', () => {
      const invalids = ['', 'games/game1', '/game1', '/other/path'];
      for (const path of invalids) {
        const game = { title: 'Title', author: 'AuthorName', path };
        const result = factory.validateGame(game);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('path');
      }
    });
  });

  describe('isGameIdAvailable', () => {
    test('возвращает true если игры с таким id нет', async () => {
      dbManagerMock.getGameById.mockResolvedValue(null);
      const result = await factory.isGameIdAvailable('some-id');
      expect(dbManagerMock.getGameById).toHaveBeenCalledWith('some-id');
      expect(result).toBe(true);
    });

    test('возвращает false если игра с таким id есть', async () => {
      dbManagerMock.getGameById.mockResolvedValue({ id: 'some-id' });
      const result = await factory.isGameIdAvailable('some-id');
      expect(result).toBe(false);
    });
  });

  describe('toClientUser', () => {
    test('удаляет password, banned_until, suspended_until', () => {
      const user = {
        id: 'id1',
        username: 'user',
        password: 'secret',
        banned_until: 'some-date',
        suspended_until: 'some-date',
        other: 'value'
      };
      const clientUser = factory.toClientUser(user);
      expect(clientUser).not.toHaveProperty('password');
      expect(clientUser).not.toHaveProperty('banned_until');
      expect(clientUser).not.toHaveProperty('suspended_until');
      expect(clientUser).toHaveProperty('id', 'id1');
      expect(clientUser).toHaveProperty('username', 'user');
      expect(clientUser).toHaveProperty('other', 'value');
    });
  });
});