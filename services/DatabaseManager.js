const { Pool } = require('pg');


class DatabaseManager {
    /**
     * @param {object} config
     * @param {object} config.db - pg.Pool конфиг
     * @param {number} [config.retryAttempts=3] - количество попыток подключения
     * @param {number} [config.retryDelayMs=200] - задержка между попытками, мс
     * @param {string} [config.logLevel='info'] - уровень логирования ('debug'|'info'|'warn'|'error')
     * @param {object} [config.logger] - внешний логгер с методами debug/info/warn/error (по умолчанию console)
     */
    constructor(config) {
        this.pool = new Pool(config.db);
        this.retryAttempts = config.retryAttempts ?? 3;
        this.retryDelayMs = config.retryDelayMs ?? 200;
        this.logLevel = config.logLevel ?? 'info';

        this.logger = config.logger || console;
    }

    log(level, ...args) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        if (messageLevelIndex >= currentLevelIndex) {
            if (typeof this.logger[level] === 'function') {
                this.logger[level](...args);
            } else {
                console.log(`[${level.toUpperCase()}]`, ...args);
            }
        }
    }

    async initialize() {
        try {
            this.log('info', 'Initializing database...');
            await this.createTables();
            await this.setAllUsersOffline();
            this.log('info', 'Database initialized successfully');
        } catch (err) {
            this.log('error', 'Initialization failed:', err);
            throw err;
        }
    }

    async createTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                online BOOLEAN DEFAULT FALSE,
                favorites JSONB DEFAULT '[]',
                banned BOOLEAN DEFAULT FALSE,
                suspended_until TIMESTAMP,
                banned_until TIMESTAMP,
                ban_reason TEXT,
                last_seen TIMESTAMP,
                avatar TEXT
            );`,
            `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`,

            `CREATE TABLE IF NOT EXISTS games (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                author VARCHAR(255),
                path TEXT,
                upload_date TIMESTAMP,
                genre VARCHAR(50),
                views INTEGER DEFAULT 0,
                cover TEXT,
                files JSONB DEFAULT '[]',
                ratings JSONB DEFAULT '[]',
                tags JSONB DEFAULT '[]',
                frozen BOOLEAN DEFAULT FALSE,
                freeze_reason TEXT           
            );`,
            `CREATE INDEX IF NOT EXISTS idx_games_author ON games(author);`,

            `CREATE TABLE IF NOT EXISTS tokens (
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                PRIMARY KEY (user_id, token)
            );`,

            `CREATE TABLE IF NOT EXISTS deleted_games (
                id UUID PRIMARY KEY,
                data JSONB
            );`,

            `CREATE TABLE IF NOT EXISTS translations (
                category VARCHAR(255) NOT NULL,
                en_text TEXT NOT NULL,
                ru_text TEXT NOT NULL,
                PRIMARY KEY (category, en_text)
            );`
        ];

        for (const query of queries) {
            this.log('debug', 'Executing query:', query.trim().slice(0, 50) + '...');
            await this.pool.query(query);
        }

        this.log('info', 'Tables created or already exist.');
    }

    async setAllUsersOffline() {
        try {
            await this.pool.query('UPDATE users SET online = FALSE');
            this.log('info', 'All users set offline');
        } catch (err) {
            this.log('error', 'Error in setAllUsersOffline:', err);
        }
    }

    async getUsers() {
        try {
            const res = await this.pool.query('SELECT * FROM users');
            this.log('debug', `Fetched ${res.rows.length} users`);
            return res.rows.map(user => ({
                ...user,
                favorites: this.parseJson(user.favorites, []),
                banned: user.banned || false,
                banned_until: user.banned_until || null,
                ban_reason: user.ban_reason || null,
                suspended_until: user.suspended_until || null,
                last_seen: user.last_seen || null
            }));
        } catch (err) {
            this.log('error', 'Error in getUsers:', err);
            return [];
        }
    }

async getUserById(id, client) {
  try {
    this.log('debug', `getUserById: Fetching user with id: ${id}`);
    const query = `
      SELECT id, username, password, role, online, favorites, banned, banned_until, ban_reason, 
             suspended_until, avatar, last_seen
      FROM users
      WHERE id = $1
    `;
    const poolOrClient = client || this.pool;
    const result = await poolOrClient.query(query, [id]);
    if (result.rows.length === 0) {
      this.log('warn', 'getUserById: User not found:', id);
      return null;
    }
    const user = result.rows[0];
    user.favorites = this.parseJson(user.favorites, []);
    this.log('debug', 'getUserById: User fetched:', user.username, 'favorites:', user.favorites);
    return user;
  } catch (err) {
    this.log('error', 'getUserById: Error:', err);
    throw err;
  }
}

    async getUserByUsername(username) {
        try {
            const res = await this.pool.query('SELECT * FROM users WHERE username = $1', [username]);
            const user = res.rows[0];
            if (!user) {
                this.log('warn', `User not found by username: ${username}`);
                return null;
            }
            this.log('debug', `User found by username: ${username}`);
            return {
                ...user,
                favorites: this.parseJson(user.favorites, []),
                banned: user.banned || false,
                banned_until: user.banned_until || null,
                ban_reason: user.ban_reason || null,
                suspended_until: user.suspended_until || null,
                last_seen: user.last_seen || null
            };
        } catch (err) {
            this.log('error', 'Error in getUserByUsername:', err);
            return null;
        }
    }

// Файл: src/services/DatabaseManager.js
async saveUser(user, client = null) {
    this.log('debug', `DatabaseManager.saveUser: Saving user ${user.username}, favorites: ${JSON.stringify(user.favorites)}`);
    try {
        // Если favorites не передан, загружаем текущего пользователя из базы
        let favoritesJson;
        if (user.favorites == null) {
            this.log('debug', `DatabaseManager.saveUser: Favorites not provided, fetching existing user`);
            const existingUser = await this.getUserById(user.id, client);
            if (existingUser != null) {
                favoritesJson = JSON.stringify(existingUser.favorites || []);
                this.log('debug', `DatabaseManager.saveUser: Existing favorites loaded: ${favoritesJson}`);
            }
            else {
                favoritesJson = JSON.stringify([]);
                this.log('debug', `DatabaseManager.saveUser: No existing user, default favorites set: ${favoritesJson}`);
            }
        } else {
            // Проверяем, что favorites — это массив
            favoritesJson = JSON.stringify(Array.isArray(user.favorites) ? user.favorites : []);
        }
        this.log('debug', `DatabaseManager.saveUser: Formatted favorites: ${favoritesJson}`);

        const query = `
            INSERT INTO users (
                id, username, password, role, online, last_seen, avatar, favorites,
                banned, banned_until, ban_reason, suspended_until
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id)
            DO UPDATE SET
                username = EXCLUDED.username,
                password = EXCLUDED.password,
                role = EXCLUDED.role,
                online = EXCLUDED.online,
                last_seen = EXCLUDED.last_seen,
                avatar = EXCLUDED.avatar,
                favorites = EXCLUDED.favorites,
                banned = EXCLUDED.banned,
                banned_until = EXCLUDED.banned_until,
                ban_reason = EXCLUDED.ban_reason,
                suspended_until = EXCLUDED.suspended_until
            RETURNING *;
        `;
        const values = [
            user.id,
            user.username,
            user.password,
            user.role,
            user.online,
            user.last_seen ? new Date(user.last_seen) : null,
            user.avatar,
            favoritesJson, // Используем JSON-строку
            user.banned ?? false,
            user.banned_until ? new Date(user.banned_until) : null,
            user.ban_reason,
            user.suspended_until ? new Date(user.suspended_until) : null
        ];
        const poolOrClient = client || this.pool;
        const result = await poolOrClient.query(query, values);
        this.log('debug', `DatabaseManager.saveUser: User saved, favorites: ${JSON.stringify(result.rows[0].favorites)}`);
        return result.rows[0];
    } catch (err) {
        this.log('error', `DatabaseManager.saveUser: Failed to save user ${user.username}: ${err.message}`);
        throw err;
    }
}
async updateUser(userId, updates) {
  try {
    this.log('debug', `Updating user ${userId} with ${JSON.stringify(updates)}`);
    const fields = [];
    const values = [];
    let index = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
    values.push(userId);
    this.log('debug', `Query: ${query}, Values: ${JSON.stringify(values)}`);

    const result = await this.pool.query(query, values);
    this.log('debug', `Updated user ${userId}`);
    return result.rows[0];
  } catch (err) {
    this.log('error', `Failed to update user ${userId}: ${err.message}`);
    throw err;
  }
}
async deleteUser(userId, client = null) {
    try {
        const poolOrClient = client || this.pool;
        await poolOrClient.query('DELETE FROM users WHERE id = $1', [userId]);
        this.log('info', 'User deleted with id:', userId);
    } catch (err) {
        this.log('error', 'Error in deleteUser:', err);
        throw err;
    }
}

    async getGames(filters = {}) {
    try {
                const { author } = filters;
                let query = 'SELECT * FROM games';
                const values = [];

                if (author) {
                        query += ' WHERE author = $1';
                        values.push(author);
                }

                const res = await this.pool.query(query, values);
        this.log('info', 'Games retrieved:', res.rows.length);
        return res.rows.map(row => ({
            ...row,
            ratings: this.parseJson(row.ratings, []),
            files: this.parseJson(row.files, []),
            tags: this.parseJson(row.tags, []),
            upload_date: row.upload_date || null,
            views: row.views || 0,
        }));
    } catch (err) {
        this.log('error', 'Error in getGames:', err);
        return [];
    }
}

async getGameById(id) {
    try {
        const res = await this.pool.query('SELECT * FROM games WHERE id = $1', [id]);
        const game = res.rows[0];
        if (!game) {
            this.log('warn', `Game not found by id: ${id}`);
            return null;
        }
        this.log('debug', `Game found by id: ${id}, path: ${game.path}`);
        return {
            ...game,
            title: game.title || game.name,
            name: game.name || game.title,
            ratings: this.parseJson(game.ratings, []),
            tags: this.parseJson(game.tags, []),
            cover: game.cover || null,
            files: this.parseJson(game.files, [])
        };
    } catch (err) {
        this.log('error', `Error in getGameById for id ${id}: ${err.message}`);
        throw err; // Бросаем ошибку, чтобы сервер вернул 500
    }
}

async saveGame(game) {
    try {
        const ratings = Array.isArray(game.ratings) ? game.ratings : this.parseJson(game.ratings, []);
        const files = Array.isArray(game.files) ? game.files : this.parseJson(game.files, []);
        const tags = Array.isArray(game.tags) ? game.tags :  this.parseJson(game.tags, []);
        const uploadDate = game.upload_date instanceof Date ? game.upload_date.toISOString() : new Date().toISOString();

        // Находим index__*.html в файлах
        const indexFile = files.find(f => f.match(/simple_game[\\\/]index__.*\.html$/i));
        const gamePath = indexFile ? `/games/${game.id}/${indexFile}` : game.path || `/games/${game.id}/simple_game/index.html`;

        this.log('debug', `Saving game ${game.id} with path: ${gamePath}`);
        this.log('debug', `Files: ${JSON.stringify(files)}`);

        const filesJson = JSON.stringify(files);
        const ratingsJson = JSON.stringify(ratings);
        const tagsJson = JSON.stringify(tags);

        const query = `
            INSERT INTO games (id, name, title, description, author, path, upload_date, genre, views, cover, files, ratings, tags, frozen, freeze_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                author = EXCLUDED.author,
                path = EXCLUDED.path,
                upload_date = EXCLUDED.upload_date,
                genre = EXCLUDED.genre,
                views = EXCLUDED.views,
                cover = EXCLUDED.cover,
                files = EXCLUDED.files,
                ratings = EXCLUDED.ratings,
                tags = EXCLUDED.tags,
                frozen = EXCLUDED.frozen,
                freeze_reason = EXCLUDED.freeze_reason
        `;
        await this.pool.query(query, [
            game.id,
            game.name || game.title,
            game.title || game.name,
            game.description,
            game.author,
            gamePath,
            uploadDate,
            game.genre || '',
            game.views || 0,
            game.cover,
            filesJson,
            ratingsJson,
            tagsJson,
            game.frozen || false,
            game.freeze_reason || null
        ]);

        this.log('info', 'Game saved:', game.title);
    } catch (err) {
        this.log('error', `Error in saveGame for game ${game.id}: ${err.message}`);
        throw err;
    }
}


    async deleteGame(id) {
        try {
            await this.pool.query('DELETE FROM games WHERE id = $1', [id]);
            this.log('info', 'Game deleted:', id);
        } catch (err) {
            this.log('error', 'Error in deleteGame:', err);
            throw err;
        }
    }

    async saveToken(userId, token) {
        try {
            await this.pool.query(
                `INSERT INTO tokens (user_id, token) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [userId, token]
            );
            this.log('info', 'Token saved for user:', userId);
        } catch (err) {
            this.log('error', 'Error in saveToken:', err);
            throw err;
        }
    }

    async deleteToken(userId, token) {
        try {
            await this.pool.query(`DELETE FROM tokens WHERE user_id = $1 AND token = $2`, [userId, token]);
            this.log('info', 'Token deleted for user:', userId);
        } catch (err) {
            this.log('error', 'Error in deleteToken:', err);
            throw err;
        }
    }

    parseJson(jsonString, defaultValue = {}) {
        if (!jsonString) return defaultValue;

        // Если это уже не строка, возвращаем как есть
        if (typeof jsonString !== 'string') return jsonString;

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            this.log('warn', 'Failed to parse JSON:', jsonString);
            return defaultValue;
        }
    }

    async close() {
        await this.pool.end();
        this.log('info', 'Database connection closed');
    }
}

module.exports = DatabaseManager;
