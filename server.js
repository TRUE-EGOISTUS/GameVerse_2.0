// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const errorHandler = require('./services/errorHandler');
const DatabaseManager = require('./services/DatabaseManager');
const AuthService = require('./services/AuthService');
const GameService = require('./services/GameService');
const UserService = require('./services/UserService');
const FileManager = require('./services/FileManager');
const RoutesHandler = require('./services/RoutesHandler');
const { Cache, NodeCacheStrategy } = require('./utils/cache');
const TranslationFacade = require('./utils/translationFacade');
const EventBus = require('./utils/eventBus');
const transliterate = require('./utils/transliterate');

class GameServer {
    constructor() {
        this.app = express();
        this.PORT = process.env.PORT || 3000;
        this.JWT_SECRET = process.env.JWT_SECRET || 'your-secure-secret-key';
        this.dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

        this._setupDatabase();
        this._setupCoreServices();
        this._setupDomainServices();
        this._setupRouting();
    }

    _setupDatabase() {
        this.dbManager = new DatabaseManager({
            db: {
                user: process.env.DB_USER,
                host: process.env.DB_HOST,
                database: process.env.DB_NAME,
                password: process.env.DB_PASSWORD,
                port: parseInt(process.env.DB_PORT, 10),
            },
            retryAttempts: 3,
            retryDelayMs: 200,
            logLevel: 'info',
        });
    }

    _setupCoreServices() {
        this.cache = new Cache(new NodeCacheStrategy());
        this.eventBus = new EventBus();
        this.translationFacade = new TranslationFacade(
            this.dbManager.pool,
            this.getOrCreateTranslation.bind(this)
        );
    }

    _setupDomainServices() {
        this.authService = new AuthService(this.JWT_SECRET, this.dbManager, this.cache);
        this.gameService = new GameService(this.dbManager, this.translationFacade, this.cache);
        this.userService = new UserService(this.dbManager, this.translationFacade, this.cache, this.eventBus);
        this.fileManager = new FileManager({ dataDir: this.dataDir });
        this.dbManager.fileManager = this.fileManager;
    }

    _setupRouting() {
        this.routesHandler = new RoutesHandler(
            this.app,
            this.authService,
            this.gameService,
            this.userService,
            this.fileManager,
            this.cache,
            this.eventBus,
            this.translationFacade
        );
    }

    async initialize() {
        await this._checkDatabaseConnection();
        await this.dbManager.initialize();
        await this.translationFacade.load();

        const games = await this.dbManager.getGames({});
        for (const game of games) {
            const gameDir = path.join(this.dataDir, 'games', game.id);
            const exists = await fs.promises.access(gameDir).then(() => true).catch(() => false);
            if (!exists) {
                await this.dbManager.deleteGame(game.id);
                console.log(`Удалена устаревшая игра из БД: ${game.id}`);
            } else {
                await this.fileManager.scanGameDirectory(game.id);
            }
        }

        this._setupMiddleware();
        this.routesHandler.setupRoutes();

        this.start();
    }

    async _checkDatabaseConnection() {
        try {
            const client = await this.dbManager.pool.connect();
            console.log('✅ Successfully connected to database');
            client.release();
        } catch (err) {
            console.error('❌ Database connection failed:', err);
            process.exit(1);
        }
    }

_setupMiddleware() {
    this.app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                'script-src': ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                'script-src-attr': ["'unsafe-inline'"],
                'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                'font-src': ["'self'", "https://fonts.gstatic.com"],
                'img-src': ["'self'", "data:", "https://via.placeholder.com", "http://localhost:3000"],
                'default-src': ["'self'"],
                'connect-src': ["'self'"]
            }
        }
    }));
    this.app.use(cors());
    this.app.use(cookieParser());

    this.app.use(express.static('public'));
    this.app.use('/scripts', express.static('scripts'));
    this.app.use('/avatars', express.static(path.join(this.dataDir, 'avatars'), {
        etag: false,
        lastModified: false,
        cacheControl: false,
        maxAge: 0
    }));
    this.app.use('/covers', express.static(path.join(this.dataDir, 'covers'), {
        etag: false,
        lastModified: false,
        cacheControl: false,
        maxAge: 0
    }));

    this.app.use((req, res, next) => {
        console.log(`[DEBUG] Middleware: ${req.method} ${req.path}, Content-Type: ${req.headers['content-type']}`);
        if (req.is('multipart/form-data')) {
            return next();
        }
        express.json()(req, res, () => {
            express.urlencoded({ extended: true })(req, res, next);
        });
    });

    this.app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    this.app.use(errorHandler);
}

    async getOrCreateTranslation(category, ruText) {
        if (!category || !ruText) return ruText;

        try {
            const selectRes = await this.dbManager.pool.query(
                `SELECT en_text FROM translations WHERE category = $1 AND ru_text = $2`,
                [category, ruText]
            );
            if (selectRes.rows.length > 0) {
                return selectRes.rows[0].en_text;
            }

            const enText = transliterate(ruText);
            await this.dbManager.pool.query(
                `INSERT INTO translations (category, en_text, ru_text)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (category, en_text) DO NOTHING`,
                [category, enText, ruText]
            );
            console.log(`🆕 Added translation: [${category}] ${ruText} → ${enText}`);
            return enText;
        } catch (err) {
            console.error(`❌ Error in getOrCreateTranslation [${category}]:`, err);
            return ruText;
        }
    }

    start() {
        process.env.PGCLIENTENCODING = 'UTF8';
        this.app.listen(this.PORT, () => {
            console.log(`🚀 Server started: http://localhost:${this.PORT}`);
        });
    }
}

module.exports = GameServer;

if (require.main === module) {
    (async () => {
        const server = new GameServer();
        await server.initialize();
    })();
}