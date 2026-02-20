// FileManager.js
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { ValidationError } = require('./errors');
const winston = require('winston');

class FileManager {
    constructor(options = {}, logger = null) {
        this.dataDir = options.dataDir || path.resolve('data');
        this.limits = {
            gameFileSize: options.limits?.gameFileSize || 10 * 1024 * 1024,
            avatarFileSize: options.limits?.avatarFileSize || 5 * 1024 * 1024,
            coverFileSize: options.limits?.coverFileSize || 5 * 1024 * 1024,
            maxGameFiles: options.limits?.maxGameFiles || 20,
        };
        this.allowedTypes = {
            game: options.allowedTypes?.game || [
                'text/html',
                'text/css',
                'application/javascript',
                'text/javascript',
                'image/png',
                'image/jpeg',
                'image/gif',
                'audio/mpeg',
                'audio/wav',
                'video/mp4',
            ],
            avatar: options.allowedTypes?.avatar || [
                'image/png',
                'image/jpeg',
                'image/gif',
            ],
            cover: options.allowedTypes?.cover || [
                'image/png',
                'image/jpeg',
            ],
        };

        this.logger = logger || winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level.toUpperCase()}] [FileManager] ${message}`)
            ),
            transports: [new winston.transports.Console()]
        });

        this.tempDir = path.join(this.dataDir, 'temp');
        this._initializeDirectories(); // Добавляем инициализацию папок

        this.upload = this.createGameUpload();
        this.avatarUpload = this.createAvatarUpload();
        this.coverUpload = this.createCoverUpload();
    }

    async _initializeDirectories() {
        try {
            await this.ensureDir(this.tempDir);
            this.log(`Temp directory ensured: ${this.tempDir}`, 'info');
        } catch (err) {
            this.log(`Failed to create temp directory: ${err.message}`, 'error');
            throw err;
        }
    }

    sanitizeFilename(filename) {
        const baseName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = path.extname(baseName);
        const name = path.basename(baseName, ext).replace(/\.+$/, '');
        const hash = Buffer.from(crypto.randomBytes(4)).toString('hex').slice(0, 8);
        return `${name}__${hash}${ext}`;
    }

    async ensureDir(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
            this.log(`Создана директория: ${dirPath}`, 'info');
        }
    }

createGameUpload() {
    const self = this;
    return multer({
        storage: multer.memoryStorage(),
        fileFilter: function (req, file, cb) {
            const seenOriginalNames = req.seenOriginalNames || new Set();
            req.seenOriginalNames = seenOriginalNames;
            const normalizedType = file.mimetype.replace('text/javascript', 'application/javascript');
            self.log(`Received file ${file.originalname} with MIME type: ${file.mimetype} (normalized: ${normalizedType})`, 'info');
            if (!self.allowedTypes.game.includes(normalizedType)) {
                return cb(new ValidationError(`Недопустимый тип файла: ${file.mimetype}`));
            }
            const originalName = path.basename(file.originalname).toLowerCase();
            if (seenOriginalNames.has(originalName)) {
                self.log(`Отклонён дублирующийся файл: ${file.originalname}`, 'warn');
                return cb(null, false);
            }
            seenOriginalNames.add(originalName);
            cb(null, true);
        },
        limits: {
            fileSize: self.limits.gameFileSize,
            files: self.limits.maxGameFiles,
        }
    }).array('gameFiles', self.limits.maxGameFiles);
}

  async saveGameFiles(req, gameId) {
    const self = this;
    const gameDir = path.join(self.dataDir, 'games', gameId, 'simple_game');
    const cssDir = path.join(gameDir, 'css');
    const jsDir = path.join(gameDir, 'js');
    await self.ensureDir(cssDir);
    await self.ensureDir(jsDir);

    const savedFiles = [];
    const seenContentHashes = new Map();

    for (const file of req.files) {
        const originalName = path.basename(file.originalname).toLowerCase();
        const contentHash = crypto.createHash('md5').update(file.buffer).digest('hex');
        
        if (seenContentHashes.has(contentHash)) {
            self.log(`Пропущен дублирующийся файл по содержимому: ${file.originalname} (хэш: ${contentHash})`, 'warn');
            continue;
        }
        seenContentHashes.set(contentHash, originalName);

        const fileName = self.sanitizeFilename(file.originalname);
        let targetPath;
        if (fileName.endsWith('.css')) {
            targetPath = path.join(cssDir, fileName);
        } else if (fileName.endsWith('.js')) {
            targetPath = path.join(jsDir, fileName);
        } else {
            targetPath = path.join(gameDir, fileName);
        }
        await fs.writeFile(targetPath, file.buffer);
        savedFiles.push(path.relative(path.join(self.dataDir, 'games', gameId), targetPath));
        self.log(`Сохранён файл игры: ${targetPath} (оригинальное имя: ${file.originalname}, хэш: ${contentHash})`, 'info');
    }
    return savedFiles;
}

    async scanGameDirectory(gameId) {
        const gameDir = path.join(this.dataDir, 'games', gameId);
        try {
            const exists = await fs.access(gameDir).then(() => true).catch(() => false);
            if (!exists) {
                this.log(`Директория ${gameDir} не существует, пропускаем сканирование`, 'info');
                return;
            }
        } catch (err) {
            this.log(`Ошибка сканирования директории ${gameDir}: ${err.message}`, 'error');
        }
    }
    createAvatarUpload() {
        const self = this;
        return multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: self.limits.avatarFileSize,
                files: 1
            },
            fileFilter: function (req, file, cb) {
                if (!self.allowedTypes.avatar.includes(file.mimetype)) {
                    return cb(new ValidationError(`Недопустимый тип файла аватара: ${file.mimetype}`));
                }
                if (!file.originalname) {
                    file.originalname = `avatar.${file.mimetype.split('/')[1] || 'png'}`;
                }
                cb(null, true);
            }
        });
    }
createCoverUpload() {
    const self = this;
    return multer({
        storage: multer.diskStorage({
            destination: async (req, file, cb) => {
                try {
                    await self.ensureDir(path.join(self.dataDir, 'temp'));
                    cb(null, path.join(self.dataDir, 'temp'));
                } catch (err) {
                    self.log(`Failed to ensure temp directory: ${err.message}`, 'error');
                    cb(err);
                }
            },
            filename: (req, file, cb) => {
                self.log(`Saving file ${file.originalname} to temp directory`, 'info');
                cb(null, file.originalname);
            }
        }),
        limits: {
            fileSize: self.limits.coverFileSize,
            files: 1
        },
        fileFilter: async function (req, file, cb) {
            try {
                self.log(`Received cover file ${file.originalname} with MIME type: ${file.mimetype}`, 'info');
                self.log(`Full file object: ${JSON.stringify(file, null, 2)}`, 'debug');
                self.log(`Request headers: ${JSON.stringify(req.headers, null, 2)}`, 'debug');
                self.log(`Request body: ${JSON.stringify(req.body, null, 2)}`, 'debug');
                if (!self.allowedTypes.cover.includes(file.mimetype)) {
                    self.log(`Invalid MIME type for cover: ${file.mimetype}. Allowed types: ${self.allowedTypes.cover.join(', ')}`, 'error');
                    return cb(new ValidationError(`Недопустимый тип файла обложки: ${file.mimetype}`));
                }
                self.log(`MIME type ${file.mimetype} is allowed`, 'info');
                cb(null, true);
            } catch (err) {
                self.log(`Error processing file ${file.originalname}: ${err.message}`, 'error');
                cb(err);
            }
        }
    });
}

getGameUpload() {
    return this.createGameUpload(); // Новая версия
}

    getAvatarUpload() {
        return this.avatarUpload;
    }

    getCoverUpload() {
        return this.coverUpload;
    }

    async saveAvatarBuffer(userId, buffer, extension) {
        try {
            const avatarDir = path.join(this.dataDir, 'avatars');
            await this.ensureDir(avatarDir);

            const filename = `${userId}.${extension}`;
            const filePath = path.join(avatarDir, filename);

            await fs.writeFile(filePath, buffer);
            this.log(`Сохранен аватар для userId ${userId}: ${filePath}`, 'info');
            return `/avatars/${filename}`;
        } catch (err) {
            this.log(`Ошибка сохранения аватара для userId ${userId}: ${err.message}`, 'error');
            throw err;
        }
    }

 async saveCoverBuffer(gameId, buffer, extension = 'png') {
    const coverDir = path.join(this.dataDir, 'covers');
    await this.ensureDir(coverDir);
    const safeGameId = gameId.toString().replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${safeGameId}.${extension}`;
    const filePath = path.join(coverDir, filename);
    await fs.writeFile(filePath, buffer);
    this.log(`Сохранена обложка для gameId ${gameId}: ${filePath}`, 'info');
    return `/covers/${filename}`;
}

    log(message, level = 'info') {
        this.logger[level](message);
    }
}

module.exports = FileManager;