const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { ValidationError, NotFoundError, AccessDeniedError } = require('./errors');
const dayjs = require('dayjs'); // Добавляем dayjs для форматирования даты

class AuthService {
  constructor(jwtSecret, dbManager, cache) {
    this.jwtSecret = jwtSecret; // сохраняем в поле
    this.dbManager = dbManager;
    this.cache = cache;
  }

  generateToken(payload) {
    if (!this.jwtSecret) {
      throw new Error('JWT secret is not defined');
    }
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '1h' });
  }

 async login(username, password) {
    let dateNow = new Date();
    if (!username || !password) throw new ValidationError('Отсутствуют учетные данные');
    if (password.length < 6) throw new ValidationError('Пароль слишком короткий');

    const user = await this.dbManager.getUserByUsername(username);
    if (!user) throw new NotFoundError('Пользователь не найден');
    if (!user.password) throw new ValidationError('Пароль не установлен');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new ValidationError('Неверные учетные данные');

    if (user.banned_until && new Date(user.banned_until) > dateNow) {
        const banEndFormatted = dayjs(user.banned_until).format('DD.MM.YYYY HH:mm');
        throw new AccessDeniedError('Пользователь заблокирован', {
            banEnd: banEndFormatted,
            reason: user.ban_reason || 'Причина не указана'
        });
    }
    if (user.suspended_until && new Date(user.suspended_until) > dateNow) {
        const suspendEndFormatted = dayjs(user.suspended_until).format('DD.MM.YYYY HH:mm');
        throw new AccessDeniedError('Пользователь приостановлен', {
            suspendEnd: suspendEndFormatted
        });
    }

    const payload = {
        id: user.id,
        username: user.username,
        role: user.role
    };

    const token = this.generateToken(payload);

    user.online = true;
    user.last_seen = dateNow.toISOString();
    await this.dbManager.saveUser(user);
    await this.dbManager.saveToken(user.id, token);

    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            avatar: user.avatar || null,
            favorites: Array.isArray(user.favorites) ? user.favorites : [],
            banned: user.banned || false,
            banned_until: user.banned_until || null,
            ban_reason: user.ban_reason || null,
            suspended_until: user.suspended_until || null
        }
    };
}


   async verifyToken(token) {
    const cacheKey = `token_${token}`;
    let cachedUser = this.cache.get(cacheKey);
    if (cachedUser) {
        return cachedUser; // Возвращаем пользователя из кэша
    }
    try {
        const decoded = jwt.verify(token, this.jwtSecret);  // <- исправлено здесь
        let userFromBase = await this.dbManager.getUserById(decoded.id);
        if (!userFromBase) throw new NotFoundError('Пользователь не найден');
        this.cache.set(cacheKey, userFromBase, 300);
        return userFromBase;
    } catch (err) {
        if (err.name === 'TokenExpiredError') throw new AccessDeniedError('Токен истек');
        if (err instanceof NotFoundError) throw err;
        throw new AccessDeniedError('Неверный токен');
    }
}


    checkRole(allowedRoles) {
        if (!Array.isArray(allowedRoles)) {
            allowedRoles = [allowedRoles];
        }
        return (req, res, next) => {
            if (!req.user || !allowedRoles.includes(req.user.role)) {
                throw new AccessDeniedError('Доступ запрещён');
            }
            next();
        };
    }
}

module.exports = AuthService;