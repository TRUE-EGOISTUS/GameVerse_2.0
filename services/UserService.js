const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const path = require('path');
const { createUser, validateUser, toClientUser } = require('../utils/factories');
const { ValidationError, NotFoundError, AccessDeniedError } = require('./errors');

class UserService {
  constructor(dbManager, cache, eventBus, fileManager) {
    this.dbManager = dbManager;
    this.cache = cache;
    this.eventBus = eventBus;
    this.fileManager = fileManager;
    this.CACHE_KEYS = {
      USER_DATA: 'user_data_',
      USER_FAVORITES: 'user_favorites_',
      ADMIN_USERS: 'admin_users'
    };
    this.VALID_ROLES = ['user', 'developer', 'admin'];
  }

  async getUserById(id) {
    try {
      console.log(`[DEBUG] UserService.getUserById: Fetching user with id: ${id}`);
      const user = await this.dbManager.getUserById(id);
      if (!user) {
        console.log(`[DEBUG] UserService.getUserById: User not found: ${id}`);
        throw new NotFoundError('Пользователь не найден');
      }
      console.log(`[DEBUG] UserService.getUserById: User fetched: ${user.username} favorites: ${JSON.stringify(user.favorites)}`);
      return user;
    } catch (err) {
      console.error(`[ERROR] UserService.getUserById: Error: ${err.message}`);
      throw err;
    }
  }

  _clearUserCache(userId) {
    console.log(`[DEBUG] Clearing cache for user ${userId}`);
    this.cache.del(this.CACHE_KEYS.ADMIN_USERS);
    this.cache.del(`${this.CACHE_KEYS.USER_DATA}_${userId}`);
    this.cache.del(`${this.CACHE_KEYS.USER_FAVORITES}_${userId}`);
  }

  _validateRole(role) {
    return this.VALID_ROLES.includes(role) ? role : 'user';
  }

  _ensureFavoritesArray(user) {
    if (!Array.isArray(user.favorites)) {
      user.favorites = [];
      console.log(`[DEBUG] Initialized favorites array for user ${user.id}`);
    }
  }

  async register(username, password, role) {
    const existingUser = await this.dbManager.getUserByUsername(username);
    if (existingUser) throw new ValidationError('Пользователь уже существует');

    if (username.length > 50 || password.length < 6) {
      throw new ValidationError('Недопустимая длина имени пользователя или пароля');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = createUser({
      id: uuidv4(),
      username,
      password: hashedPassword,
      role: this._validateRole(role),
      online: true,
      avatar: null,
      favorites: [],
      banned: false,
      banned_until: null,
      ban_reason: null,
      suspended_until: null,
      last_seen: dayjs().toISOString()
    });

    if (!validateUser(user)) throw new ValidationError('Некорректные данные пользователя');

    await this._saveUserWithTransaction(user);
    this._clearUserCache(user.id);
    this.eventBus.publish('user_registered', { user });
    return toClientUser(user);
  }

  async logout(userId) {
    try {
      if (typeof userId !== 'string') {
        console.error(`[ERROR] UserService.logout: Invalid userId: ${JSON.stringify(userId)}`);
        throw new ValidationError('Неверный формат userId');
      }

      const user = await this.dbManager.getUserById(userId);
      if (!user) {
        console.log(`[DEBUG] UserService.logout: User not found: ${userId}`);
        throw new NotFoundError('Пользователь не найден');
      }
      console.log(`[DEBUG] UserService.logout: Loaded user ${user.username}, favorites: ${JSON.stringify(user.favorites)}`);
      
      user.online = false;
      user.last_seen = dayjs().toISOString();
      
      await this._saveUserWithTransaction(user);
      this._clearUserCache(user.id);
      this.eventBus.publish('user_logout', { user });
      console.log(`[DEBUG] UserService.logout: User ${user.username} logged out, favorites preserved: ${JSON.stringify(user.favorites)}`);
    } catch (error) {
      console.error(`[ERROR] UserService.logout: Error for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  async updateAvatar(user, file) {
    if (!file) throw new ValidationError('Файл аватара не загружен');
    const ext = file.originalname
      ? path.extname(file.originalname).toLowerCase().replace('.', '')
      : (file.mimetype?.split('/')[1] || 'png');
    const avatar = await this.fileManager.saveAvatarBuffer(
      user.id,
      file.buffer,
      ext
    );
    user.avatar = avatar;
    await this._saveUserWithTransaction(user);
    this._clearUserCache(user.id);
    return avatar;
  }

  async getUserData(user) {
    const cacheKey = `${this.CACHE_KEYS.USER_DATA}_${user.id}`;
    let userData = this.cache.get(cacheKey);
    if (!userData) {
      userData = {
        id: user.id,
        username: user.username,
        role: user.role,
        online: user.online,
        last_seen: user.last_seen || null,
        avatar: user.avatar || null,
        banned: user.banned || false,
        banned_until: user.banned_until || null,
        ban_reason: user.ban_reason || null,
        suspended_until: user.suspended_until || null
      };
      this.cache.set(cacheKey, userData, 300);
    }
    return this.translateUser(userData);
  }

  async getFavorites(user) {
    const cacheKey = `${this.CACHE_KEYS.USER_FAVORITES}_${user.id}`;
    const cachedFavorites = this.cache.get(cacheKey);
    if (cachedFavorites) {
      console.log(`[DEBUG] Returning cached favorites for user ${user.id}:`, cachedFavorites.map(g => g.id));
      return cachedFavorites;
    }

    const freshUser = await this.dbManager.getUserById(user.id);
    if (!freshUser) {
      console.error(`[ERROR] User not found: ${user.id}`);
      throw new NotFoundError('Пользователь не найден');
    }
    this._ensureFavoritesArray(freshUser);
    console.log(`[DEBUG] Fetched fresh user favorites:`, freshUser.favorites);

    if (freshUser.favorites.length === 0) {
      this.cache.set(cacheKey, [], 300);
      console.log(`[DEBUG] No favorites found for user ${user.id}`);
      return [];
    }

    const resolvedGames = await Promise.all(
      freshUser.favorites.map(async (gameId) => {
        try {
          return await this.dbManager.getGameById(gameId);
        } catch (err) {
          console.warn(`[WARN] Failed to resolve favorite game ${gameId}: ${err.message}`);
          return null;
        }
      })
    );

    const validGames = [];
    const validFavoriteIds = [];

    for (const game of resolvedGames) {
      if (game) {
        validGames.push({ ...game, isFavorite: true });
        validFavoriteIds.push(game.id);
      }
    }

    if (validFavoriteIds.length !== freshUser.favorites.length) {
      freshUser.favorites = validFavoriteIds;
      await this._saveUserWithTransaction(freshUser);
      this._clearUserCache(user.id);
      console.log(`[DEBUG] Updated favorites for user ${user.id}:`, freshUser.favorites);
    }

    this.cache.set(cacheKey, validGames, 300);
    console.log(`[DEBUG] Cached favorites for user ${user.id}:`, validGames.map(g => g.id));

    const favoriteGames = validGames;
    return favoriteGames;
  }

  async addFavorite(user, gameId) {
    console.log(`[DEBUG] addFavorite: Adding game ${gameId} for user ${user.username}`);
    
    const freshUser = await this.dbManager.getUserById(user.id);
    if (!freshUser) {
      console.error(`[ERROR] addFavorite: User not found: ${user.id}`);
      throw new NotFoundError('Пользователь не найден');
    }
    
    const game = await this.dbManager.getGameById(gameId);
    if (!game) {
      console.error(`[ERROR] addFavorite: Game not found: ${gameId}`);
      throw new NotFoundError('Игра не найдена');
    }

    if (!Array.isArray(freshUser.favorites)) {
      freshUser.favorites = [];
      console.warn(`[WARN] addFavorite: User ${user.username} had no favorites array`);
    }

    if (freshUser.favorites.includes(gameId)) {
      console.log(`[DEBUG] addFavorite: Game ${gameId} already in favorites for ${user.username}`);
      return freshUser;
    }

    freshUser.favorites = [...freshUser.favorites, gameId];
    console.log(`[DEBUG] addFavorite: Updated favorites: ${JSON.stringify(freshUser.favorites)}`);

    const updatedUser = await this._saveUserWithTransaction(freshUser);
    console.log(`[DEBUG] addFavorite: User saved with favorites: ${JSON.stringify(updatedUser.favorites)}`);

    this._clearUserCache(user.id);
    return updatedUser;
  }

  async removeFavorite(user, gameId) {
    console.log(`[DEBUG] removeFavorite: Removing game ${gameId} for user ${user.username}`);
    
    const freshUser = await this.dbManager.getUserById(user.id);
    if (!freshUser) {
      console.error(`[ERROR] removeFavorite: User not found: ${user.id}`);
      throw new NotFoundError('Пользователь не найден');
    }

    if (!Array.isArray(freshUser.favorites)) {
      freshUser.favorites = [];
      console.warn(`[WARN] removeFavorite: User ${user.username} had no favorites array`);
    }

    if (!freshUser.favorites.includes(gameId)) {
      console.log(`[DEBUG] removeFavorite: Game ${gameId} not in favorites for ${user.username}`);
      return freshUser;
    }

    freshUser.favorites = freshUser.favorites.filter(id => id !== gameId);
    console.log(`[DEBUG] removeFavorite: Updated favorites: ${JSON.stringify(freshUser.favorites)}`);

    const updatedUser = await this._saveUserWithTransaction(freshUser);
    console.log(`[DEBUG] removeFavorite: User saved with favorites: ${JSON.stringify(updatedUser.favorites)}`);

    this._clearUserCache(user.id);
    return updatedUser;
  }

  async banUser(userId, days, reason, currentUserId) {
    console.log(`[DEBUG] banUser called with userId: ${userId}, days: ${days}, reason: '${reason}', currentUserId: ${currentUserId}`);
    const user = await this.getUserById(userId);
    if (!user) throw new NotFoundError('Пользователь не найден');
    if (userId === currentUserId) throw new AccessDeniedError('Нельзя забанить себя');
    const bannedUntil = new Date();
    bannedUntil.setDate(bannedUntil.getDate() + days);
    const Reason =  reason;
    const finalReason = Reason || 'Не указана';
    console.log(`[DEBUG] banUser: finalReason='${finalReason}'`);
    await this.dbManager.updateUser(userId, {
      banned: true,
      banned_until: bannedUntil,
      ban_reason: finalReason
    });
    this._clearUserCache(userId);
    this.eventBus.publish('user_banned', { userId, days, reason: finalReason, by: currentUserId });
    return true;
  }

async unbanUser(username, currentUserId) {
  console.log(`[DEBUG] unbanUser called with username: ${username}, currentUserId: ${currentUserId}`);
  const user = await this.getUserByUsername(username);
  if (!user) throw new NotFoundError('Пользователь не найден');
  if (user.id === currentUserId) throw new AccessDeniedError('Нельзя разбанить себя');
  await this.dbManager.updateUser(user.id, {
    banned: false,
    banned_until: null,
    ban_reason: null
  });
  this._clearUserCache(user.id);
  this.eventBus.publish('user_unbanned', { userId: user.id, by: currentUserId });
  return true;
}

async suspendUser(username, days, currentUser) {
  console.log(`[DEBUG] suspendUser called with username: ${username}, days: ${days}, currentUserId: ${currentUser.id}`);
  const user = await this.getUserByUsername(username);
  if (!user) throw new NotFoundError('Пользователь не найден');
  if (user.id === currentUser.id) throw new AccessDeniedError('Нельзя приостановить себя');
  const daysToSuspend = days || 7;
  user.suspended_until = dayjs().add(daysToSuspend, 'days').toISOString();
  user.online = false;
  await this._saveUserWithTransaction(user);
  this._clearUserCache(user.id);
  this.eventBus.publish('user_suspended', { user, by: currentUser.id });
  return true;
}

async unsuspendUser(username, currentUserId) {
  console.log(`[DEBUG] unsuspendUser called with username: ${username}, currentUserId: ${currentUserId}`);
  const user = await this.getUserByUsername(username);
  if (!user) throw new NotFoundError('Пользователь не найден');
  if (user.id === currentUserId) throw new AccessDeniedError('Нельзя отменить приостановку себя');
  user.suspended_until = null;
  await this._saveUserWithTransaction(user);
  this._clearUserCache(user.id);
  this.eventBus.publish('user_unsuspended', { userId: user.id, by: currentUserId });
  return true;
}

  async updateUserRole(username, role, currentUserId) {
    if (!this.VALID_ROLES.includes(role)) throw new ValidationError('Недопустимая роль');
    const user = await this.getUserByUsername(username);
    if (!user) throw new NotFoundError('Пользователь не найден');
    if (user.id === currentUserId) throw new AccessDeniedError('Нельзя изменить свою роль');
    user.role = role;
    await this._saveUserWithTransaction(user);
    this._clearUserCache(user.id);
    this.eventBus.publish('user_role_changed', { user, by: currentUserId });
    return true;
  }

  async deleteUser(userId, currentUserId) {
    const user = await this.getUserById(userId);
    if (!user) throw new NotFoundError('Пользователь не найден');
    if (user.id === currentUserId) throw new AccessDeniedError('Нельзя удалить себя');
    console.log(`[DEBUG] deleteUser: Attempting to delete user ${userId} by ${currentUserId}`);
    console.log(`[DEBUG] deleteUser: Found user ${user.username}`);
    console.log(`[DEBUG] deleteUser: Calling dbManager.deleteUser for user ${userId}`);
    const client = await this.dbManager.pool.connect();
    try {
      await client.query('BEGIN');
      if (user.avatar) {
        const avatarPath = this.dbManager.fileManager.getFullPathFromUrl(user.avatar);
        await require('fs').promises.rm(avatarPath, { force: true });
      }
      await this.dbManager.deleteUser(user.id, client);
      await client.query('COMMIT');
      this._clearUserCache(user.id);
      this.eventBus.publish('user_deleted', { user, by: currentUserId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return true;
  }

  async getUsers() {
    return await this.dbManager.getUsers();
  }

  async getUserByUsername(username) {
    return await this.dbManager.getUserByUsername(username);
  }

  async getAdminUsers() {
    const cacheKey = this.CACHE_KEYS.ADMIN_USERS;
    let cachedUsers = this.cache.get(cacheKey);
    if (cachedUsers) return cachedUsers.map(user => this.translateUser(user));
    const users = await this.dbManager.getUsers();
    const usersList = users.map(user => {
      const bannedUntil = user.banned_until ? new Date(user.banned_until).toISOString() : null;
      console.log(`[DEBUG] getAdminUsers: User ${user.username}, bannedUntil=${bannedUntil}`);
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        online: user.online || false,
        last_seen: user.last_seen ? new Date(user.last_seen).toISOString() : null,
        avatar: user.avatar || null,
        bannedUntil: bannedUntil,
        banReason: user.ban_reason || null,
        suspended_until: user.suspended_until ? new Date(user.suspended_until).toISOString() : null
      };
    });
    console.log(`[DEBUG] getAdminUsers: Total users=${usersList.length}, Banned users=${usersList.filter(u => u.bannedUntil).length}`);
    this.cache.set(cacheKey, usersList, 300);
    return usersList.map(user => this.translateUser(user));
  }

  async _saveUserWithTransaction(user, client = null) {
    console.log(`[DEBUG] _saveUserWithTransaction: Saving user ${user.username}, favorites: ${JSON.stringify(user.favorites)}, caller: ${new Error().stack.split('\n')[2]}`);
    
    if (!Array.isArray(user.favorites)) {
      console.warn(`[WARN] _saveUserWithTransaction: Favorites invalid for user ${user.username}, setting to []`);
      user.favorites = [];
    }

    const updatedUser = await this.dbManager.saveUser(user, client);
    console.log(`[DEBUG] DatabaseManager.saveUser: User saved with favorites: ${JSON.stringify(updatedUser.favorites)}`);
    return updatedUser;
  }
  async changeUsername(userId, newUsername) {
    console.log(`[DEBUG] UserService.changeUsername: Changing username for user ${userId} to ${newUsername}`);

    if (!newUsername || newUsername.length > 50 || !/^[A-Za-z0-9_]+$/.test(newUsername)) {
      throw new ValidationError('Ник может содержать только буквы, цифры и подчеркивания, длина до 50 символов');
    }

    const existingUser = await this.dbManager.getUserByUsername(newUsername);
    if (existingUser && existingUser.id !== userId) {
      throw new ValidationError('Имя пользователя уже занято');
    }

    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    user.username = newUsername;
    const updatedUser = await this._saveUserWithTransaction(user);
    this._clearUserCache(userId);
    this.eventBus.publish('user_username_changed', { user: updatedUser });

    console.log(`[DEBUG] UserService.changeUsername: Username changed to ${newUsername} for user ${userId}`);
    return updatedUser;
  }

  async changePassword(userId, oldPassword, newPassword) {
    console.log(`[DEBUG] UserService.changePassword: Changing password for user ${userId}`);

    if (!newPassword || newPassword.length < 6) {
      throw new ValidationError('Новый пароль должен быть не короче 6 символов');
    }

    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new ValidationError('Неверный старый пароль');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    const updatedUser = await this._saveUserWithTransaction(user);
    this._clearUserCache(userId);
    this.eventBus.publish('user_password_changed', { user: updatedUser });

    console.log(`[DEBUG] UserService.changePassword: Password changed for user ${userId}`);
    return updatedUser;
  }
}

module.exports = UserService;