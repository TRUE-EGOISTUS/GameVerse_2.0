const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const FileManager = require('../services/FileManager');
const { ValidationError } = require('../services/errors');

// Моки для fs.promises
jest.mock('fs', () => {
    const realFs = jest.requireActual('fs');
    return {
        promises: {
            access: jest.fn(),
            mkdir: jest.fn(),
            writeFile: jest.fn(),
            readFile: jest.fn()
        },
        constants: realFs.constants
    };
});

// Мок для crypto
jest.mock('crypto', () => {
    const actualCrypto = jest.requireActual('crypto');
    return {
        ...actualCrypto,
        randomBytes: () => Buffer.from('abcd1234')
    };
});

// Мок для FileAntivirus
jest.mock('../utils/fileAntivirus', () => {
    return {
        FileAntivirus: jest.fn().mockImplementation(() => {
            return {
                isFileContentSafe: jest.fn().mockResolvedValue(true) // Всегда возвращает true для тестов
            };
        })
    };
});

describe('FileManager', () => {
    let fileManager;

    beforeEach(() => {
        fileManager = new FileManager({ dataDir: './test-data' }, {
            info: jest.fn(),
            error: jest.fn()
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('sanitizeFilename возвращает безопасное имя файла', () => {
        const input = '../../test<script>.png';
        const safe = fileManager.sanitizeFilename(input);
        expect(safe).toMatch(/^test_script_+([a-f0-9]{8})\.png$/);
    });

    test('ensureDir создает директорию при отсутствии', async () => {
        fs.access.mockRejectedValueOnce(new Error('not found'));
        await fileManager.ensureDir('/some/path');
        expect(fs.mkdir).toHaveBeenCalledWith('/some/path', { recursive: true });
    });

    test('isFileContentSafe возвращает true', async () => {
        const result = await fileManager.isFileContentSafe(Buffer.from('test'), 'file.txt');
        expect(result).toBe(true);
    });

    test('saveAvatarBuffer сохраняет файл и возвращает путь', async () => {
        const buffer = Buffer.from('avatar');
        const result = await fileManager.saveAvatarBuffer('user1', buffer, 'jpg');
        expect(fs.writeFile).toHaveBeenCalled();
        expect(result).toBe('/avatars/user1.jpg');
    });

    test('saveCoverBuffer сохраняет файл и возвращает путь', async () => {
        const buffer = Buffer.from('cover');
        const result = await fileManager.saveCoverBuffer('game123', buffer, 'jpg');
        expect(fs.writeFile).toHaveBeenCalled();
        expect(result).toBe('/covers/game123.jpg');
    });

    test('getGameUpload инициализируется корректно', () => {
        const middleware = fileManager.getGameUpload();
        expect(middleware).toBeDefined();
    });

    test('getAvatarUpload инициализируется корректно', () => {
        const middleware = fileManager.getAvatarUpload();
        expect(middleware).toBeDefined();
    });

    test('getCoverUpload инициализируется корректно', () => {
        const middleware = fileManager.getCoverUpload();
        expect(middleware).toBeDefined();
    });

    describe('Интеграционные тесты загрузки файлов', () => {
        let app;

        beforeEach(() => {
            app = express();
            app.use(express.json());
            app.use(express.urlencoded({ extended: true }));
        });

        test('Загрузка аватара (валидный файл)', async () => {
            fs.readFile.mockResolvedValueOnce(Buffer.from('fake-avatar'));

            app.post('/upload/avatar', (req, res, next) => {
                fileManager.getAvatarUpload().single('avatar')(req, res, err => {
                    if (err) return next(err);
                    res.status(200).send('OK');
                });
            });

            const res = await request(app)
                .post('/upload/avatar')
                .attach('avatar', Buffer.from('test'), {
                    filename: 'avatar.png',
                    contentType: 'image/png'
                });

            expect(res.statusCode).toBe(200);
        });

        test('Загрузка обложки (недопустимый mimetype)', async () => {
            app.post('/upload/cover', (req, res, next) => {
                fileManager.getCoverUpload().single('cover')(req, res, err => {
                    if (err) {
                        return res.status(400).send(err.message);
                    }
                    res.status(200).send('OK');
                });
            });

            const res = await request(app)
                .post('/upload/cover')
                .attach('cover', Buffer.from('test'), {
                    filename: 'cover.exe',
                    contentType: 'application/octet-stream'
                });

            expect(res.statusCode).toBe(400);
            expect(res.text).toMatch(/Недопустимый тип файла/);
        });
    });
});