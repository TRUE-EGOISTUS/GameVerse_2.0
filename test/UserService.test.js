const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const { ValidationError, NotFoundError, AccessDeniedError } = require('../services/errors');
const UserService = require('../services/UserService');

jest.mock('bcrypt');

describe('UserService', () => {
  let service;
  let dbManagerMock;
  let translationFacadeMock;
  let cacheMock;
  let eventBusMock;

  beforeEach(() => {
    dbManagerMock = {
      getUserByUsername: jest.fn(),
      saveUser: jest.fn(),
      getGames: jest.fn(),
      getGameById: jest.fn(),
      deleteUser: jest.fn(),
      getUsers: jest.fn(),
      pool: {
        connect: jest.fn(() => ({
          query: jest.fn(),
          release: jest.fn()
        })),
      },
      fileManager: {
        saveAvatarBuffer: jest.fn(),
      }
    };
    translationFacadeMock = {
      getOrCreate: jest.fn((category, reason) => Promise.resolve(reason)),
      translate: jest.fn((category, key) => `translated_${key}`)
    };
    cacheMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };
    eventBusMock = {
      publish: jest.fn()
    };

    service = new UserService(dbManagerMock, translationFacadeMock, cacheMock, eventBusMock);
  });

  describe('register', () => {
    it('успешная регистрация пользователя', async () => {
      dbManagerMock.getUserByUsername.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed_pass');
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });

      const user = await service.register('testuser', 'password123', 'admin');

      expect(dbManagerMock.getUserByUsername).toHaveBeenCalledWith('testuser');
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(dbManagerMock.saveUser).toHaveBeenCalled();
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
      expect(eventBusMock.publish).toHaveBeenCalledWith('user_registered', expect.any(Object));
      expect(user).toHaveProperty('id');
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('admin');
    });

    it('ошибка при существующем пользователе', async () => {
      dbManagerMock.getUserByUsername.mockResolvedValue({ username: 'testuser' });

      await expect(service.register('testuser', 'password123', 'user')).rejects.toThrow(ValidationError);
    });

    it('ошибка при некорректной длине', async () => {
      await expect(service.register('a'.repeat(51), 'pass', 'user')).rejects.toThrow(ValidationError);
      await expect(service.register('user', '123', 'user')).rejects.toThrow(ValidationError);
    });
  });

  describe('logout', () => {
    it('корректно обновляет онлайн-статус', async () => {
      const user = { id: '1', online: true, last_seen: null };
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });

      await service.logout(user);

      expect(user.online).toBe(false);
      expect(user.last_seen).toBeDefined();
      expect(dbManagerMock.saveUser).toHaveBeenCalledWith(user);
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
    });
  });

  describe('updateAvatar', () => {
    it('успешное обновление аватара', async () => {
      const user = { id: '1', avatar: null };
      const file = { buffer: Buffer.from('data'), mimetype: 'image/png' };
      dbManagerMock.fileManager.saveAvatarBuffer.mockResolvedValue('avatar123');
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });

      const result = await service.updateAvatar(user, file);

      expect(dbManagerMock.fileManager.saveAvatarBuffer).toHaveBeenCalledWith('1', file.buffer, 'png');
      expect(user.avatar).toBe('avatar123');
      expect(dbManagerMock.saveUser).toHaveBeenCalledWith(user);
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
      expect(result).toBe('avatar123');
    });

    it('ошибка при отсутствии файла', async () => {
      const user = { id: '1' };
      await expect(service.updateAvatar(user, null)).rejects.toThrow(ValidationError);
    });
  });

  describe('getUserData', () => {
    it('возвращает данные из кеша, если есть', async () => {
      const user = { id: '1', username: 'u1', role: 'user' };
      const cachedData = { id: '1', username: 'u1', role: 'user' };
      cacheMock.get.mockReturnValue(cachedData);

      const result = await service.getUserData(user);

      expect(cacheMock.get).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ id: '1', username: 'u1' }));
    });

    it('записывает в кеш, если данных нет', async () => {
      const user = {
        id: '1', username: 'u1', role: 'user', online: true,
        last_seen: null, avatar: null, banned: false,
        banned_until: null, ban_reason: null, suspended_until: null
      };
      cacheMock.get.mockReturnValue(null);
      cacheMock.set.mockImplementation(() => {});

      const result = await service.getUserData(user);

      expect(cacheMock.set).toHaveBeenCalled();
      expect(result).toHaveProperty('id', '1');
    });
  });

  describe('getFavorites', () => {
    it('возвращает избранные игры из кеша', async () => {
      const user = { id: '1', favorites: ['game1'] };
      const cachedGames = [{ id: 'game1' }];
      cacheMock.get.mockReturnValue(cachedGames);

      const result = await service.getFavorites(user);

      expect(cacheMock.get).toHaveBeenCalled();
      expect(result).toEqual(cachedGames);
    });

    it('получает избранные игры из базы при отсутствии кеша', async () => {
      const user = { id: '1', favorites: ['game1'] };
      const allGames = [
        { id: 'game1' },
        { id: 'game2' }
      ];
      cacheMock.get.mockReturnValue(null);
      dbManagerMock.getGames.mockResolvedValue(allGames);

      const result = await service.getFavorites(user);

      expect(dbManagerMock.getGames).toHaveBeenCalled();
      expect(cacheMock.set).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'game1' }]);
    });
  });

  describe('addFavorite', () => {
    it('добавляет игру в избранное', async () => {
      const user = { id: '1', favorites: [] };
      dbManagerMock.getGameById.mockResolvedValue({ id: 'game1' });
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });

      await service.addFavorite(user, 'game1');

      expect(user.favorites).toContain('game1');
      expect(dbManagerMock.saveUser).toHaveBeenCalledWith(user);
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
    });

    it('ошибка если игра не найдена', async () => {
      const user = { favorites: [] };
      dbManagerMock.getGameById.mockResolvedValue(null);

      await expect(service.addFavorite(user, 'game1')).rejects.toThrow(NotFoundError);
    });

    it('ошибка если игра уже в избранном', async () => {
      const user = { favorites: ['game1'] };
      dbManagerMock.getGameById.mockResolvedValue({ id: 'game1' });

      await expect(service.addFavorite(user, 'game1')).rejects.toThrow(ValidationError);
    });
  });

  describe('removeFavorite', () => {
    it('удаляет игру из избранного', async () => {
      const user = { favorites: ['game1', 'game2'] };
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });

      await service.removeFavorite(user, 'game1');

      expect(user.favorites).not.toContain('game1');
      expect(user.favorites).toContain('game2');
      expect(dbManagerMock.saveUser).toHaveBeenCalledWith(user);
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
    });
  });

  describe('banUser', () => {
    it('успешный бан пользователя', async () => {
      const userToBan = { username: 'victim', banned: false, banned_until: null, ban_reason: null, online: true };
      const currentUser = { username: 'admin' };
      dbManagerMock.getUserByUsername.mockResolvedValue(userToBan);
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });
      translationFacadeMock.getOrCreate.mockResolvedValue('Reason translated');

      await service.banUser('victim', 3, 'reason', currentUser);

      expect(userToBan.banned).toBe(true);
      expect(userToBan.banned_until).toBeDefined();
      expect(userToBan.ban_reason).toBe('Reason translated');
      expect(userToBan.online).toBe(false);
      expect(dbManagerMock.saveUser).toHaveBeenCalledWith(userToBan);
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
      expect(eventBusMock.publish).toHaveBeenCalledWith('user_banned', { user: userToBan, by: 'admin' });
    });

    it('ошибка баня себя', async () => {
      const user = { username: 'admin' };
      dbManagerMock.getUserByUsername.mockResolvedValue(user);

      await expect(service.banUser('admin', 3, 'reason', user)).rejects.toThrow(AccessDeniedError);
    });

    it('ошибка пользователя не найден', async () => {
      dbManagerMock.getUserByUsername.mockResolvedValue(null);
      const adminUser = { username: 'admin' };

      await expect(service.banUser('unknown', 3, 'reason', adminUser)).rejects.toThrow(NotFoundError);
    });
  });

  describe('suspendUser', () => {
    it('успешное временное приостановление', async () => {
      const userToSuspend = { username: 'user1', suspended_until: null, online: true };
      const adminUser = { username: 'admin' };
      dbManagerMock.getUserByUsername.mockResolvedValue(userToSuspend);
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });

      await service.suspendUser('user1', 2, adminUser);

      expect(userToSuspend.suspended_until).toBeDefined();
      expect(userToSuspend.online).toBe(false);
      expect(dbManagerMock.saveUser).toHaveBeenCalledWith(userToSuspend);
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
      expect(eventBusMock.publish).toHaveBeenCalledWith('user_suspended', { user: userToSuspend, by: 'admin' });
    });

    it('ошибка приостановки себя', async () => {
      const user = { username: 'admin' };
      dbManagerMock.getUserByUsername.mockResolvedValue(user);

      await expect(service.suspendUser('admin', 2, user)).rejects.toThrow(AccessDeniedError);
    });

    it('ошибка если пользователь не найден', async () => {
      dbManagerMock.getUserByUsername.mockResolvedValue(null);
      const adminUser = { username: 'admin' };

      await expect(service.suspendUser('unknown', 2, adminUser)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteUser', () => {
    it('успешное удаление пользователя', async () => {
      const userToDelete = { username: 'victim' };
      const adminUser = { username: 'admin' };
      dbManagerMock.getUserByUsername.mockResolvedValue(userToDelete);
      dbManagerMock.pool.connect.mockReturnValue({
        query: jest.fn(),
        release: jest.fn()
      });

      await service.deleteUser('victim', adminUser);

      expect(dbManagerMock.deleteUser).toHaveBeenCalledWith('victim');
      expect(cacheMock.del).toHaveBeenCalledTimes(3);
      expect(eventBusMock.publish).toHaveBeenCalledWith('user_deleted', { user: userToDelete, by: 'admin' });
    });

    it('ошибка удаления себя', async () => {
      const user = { username: 'admin' };
      dbManagerMock.getUserByUsername.mockResolvedValue(user);

      await expect(service.deleteUser('admin', user)).rejects.toThrow(AccessDeniedError);
    });

    it('ошибка если пользователь не найден', async () => {
      dbManagerMock.getUserByUsername.mockResolvedValue(null);
      const adminUser = { username: 'admin' };

      await expect(service.deleteUser('unknown', adminUser)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUsers', () => {
    it('возвращает список пользователей', async () => {
      const users = [{ username: 'user1' }, { username: 'user2' }];
      dbManagerMock.getUsers.mockResolvedValue(users);

      const result = await service.getUsers();

      expect(dbManagerMock.getUsers).toHaveBeenCalled();
      expect(result).toEqual(users);
    });
  });

  describe('getUserByUsername', () => {
    it('возвращает пользователя по имени', async () => {
      const user = { username: 'user1' };
      dbManagerMock.getUserByUsername.mockResolvedValue(user);

      const result = await service.getUserByUsername('user1');

      expect(dbManagerMock.getUserByUsername).toHaveBeenCalledWith('user1');
      expect(result).toEqual(user);
    });

    it('возвращает null если не найден', async () => {
      dbManagerMock.getUserByUsername.mockResolvedValue(null);

      const result = await service.getUserByUsername('unknown');

      expect(result).toBeNull();
    });
  });
});
