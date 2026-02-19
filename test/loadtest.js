const autocannon = require('autocannon');
const { faker } = require('@faker-js/faker');
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Задержка между запросами
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Конфигурация теста
const options = {
    url: 'http://localhost:3000',
    connections: 50, // Увеличиваем до 50 соединений
    duration: 60, // Длительность теста
    pipelining: 1,
    timeout: 5000,
};

// ID игры для тестирования
const gameId = '40c9c481-f232-4790-a8ca-a773debcff72';

// Хранилище пользователей
const users = [];

// Проверка переменных окружения
function validateEnv() {
    const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
    const missing = requiredVars.filter(v => !process.env[v] || typeof process.env[v] !== 'string');
    if (!process.env.DB_PORT) {
        missing.push('DB_PORT');
    }
    if (missing.length > 0) {
        throw new Error(`Missing or invalid environment variables: ${missing.join(', ')}`);
    }
    console.log('[INFO] Environment variables validated successfully');
}

// Подключение к базе данных
const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASSWORD),
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Очистка всех тестовых пользователей
async function cleanupUsers() {
    console.log('[INFO] Cleaning up test users...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const user of users) {
            console.log(`[DEBUG] Deleting user: ${user.username}`);
            await client.query('DELETE FROM users WHERE username = $1', [user.username]);
            console.log(`[INFO] Deleted user: ${user.username}`);
            await sleep(50);
        }
        console.log('[DEBUG] Deleting old test users with username length <= 10');
        const result = await client.query('DELETE FROM users WHERE LENGTH(username) <= 10 RETURNING username');
        if (result.rows.length > 0) {
            console.log(`[INFO] Deleted ${result.rows.length} old test users: ${result.rows.map(r => r.username).join(', ')}`);
        } else {
            console.log('[INFO] No old test users found');
        }
        await client.query('COMMIT');
    } catch (err) {
        console.error(`[ERROR] Failed to cleanup users: ${err.message}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
        console.log('[INFO] Cleanup completed');
    }
}

// Создание тестового пользователя
async function createTestUser() {
let username = faker.internet.username().replace(/[^A-Za-z0-9_]/g, '_');
    // Убедимся, что имя начинается с буквы или цифры
    if (!/^[A-Za-z0-9]/.test(username)) {
        username = 'User_' + username;
    }
    // Ограничиваем длину до 50 символов
    username = username.slice(0, 50);
    
    return {
        username,
        password: faker.internet.password({ length: 10, memorable: false })
    };
}

// Регистрация и авторизация пользователя
// В loadtest.js, строка ~100
async function registerAndLoginUser(user) {
    let retryCount = 3;
    while (retryCount > 0) {
        try {
            console.log(`[DEBUG] Registering user: ${user.username}, Attempt: ${4 - retryCount}, Body: ${JSON.stringify({ username: user.username, password: user.password, role: 'developer' })}`);
            const registerResponse = await axios.post(`${options.url}/register`, {
                username: user.username,
                password: user.password,
                role: 'developer'
            }, { timeout: 5000 });
            console.log(`[DEBUG] Register response: Status ${registerResponse.status}, Body: ${JSON.stringify(registerResponse.data)}`);
            if (registerResponse.status === 200 && registerResponse.data.token) {
                user.token = registerResponse.data.token;
                console.log(`[INFO] Registered user: ${user.username}`);
                return true;
            }
        } catch (err) {
            console.error(`[ERROR] Registration error for ${user.username}: ${err.message}${err.response ? `, Response: ${JSON.stringify(err.response.data)}, Status: ${err.response.status}` : ''}`);
            if (err.response?.status === 409) { // Пользователь уже существует
                break; // Переходим к авторизации
            }
            retryCount--;
            await sleep(100);
        }
    }

    try {
        console.log(`[DEBUG] Logging in user: ${user.username}, Body: ${JSON.stringify({ username: user.username, password: user.password })}`);
        const loginResponse = await axios.post(`${options.url}/login`, {
            username: user.username,
            password: user.password
        }, { timeout: 5000 });
        console.log(`[DEBUG] Login response: Status ${loginResponse.status}, Body: ${JSON.stringify(loginResponse.data)}`);
        if (loginResponse.status === 200 && loginResponse.data.token) {
            user.token = loginResponse.data.token;
            console.log(`[INFO] Logged in user: ${user.username}`);
            return true;
        }
    } catch (err) {
        console.error(`[ERROR] Login error for ${user.username}: ${err.message}${err.response ? `, Response: ${JSON.stringify(err.response.data)}, Status: ${err.response.status}` : ''}`);
    }

    return false;
}

// Подготовка пользователей перед тестом
async function prepareUsers(count = 50) {
  console.log(`[INFO] Preparing ${count} test users...`);
  const userPromises = Array.from({ length: count }, async () => {
    const user = await createTestUser();
    if (await registerAndLoginUser(user)) {
      console.log(`[INFO] User ${user.username} prepared with token`);
      return user;
    }
    console.warn(`[WARN] Failed to prepare user ${user.username}`);
    return null;
  });
  const preparedUsers = (await Promise.all(userPromises)).filter(user => user);
  users.push(...preparedUsers);
  console.log(`[INFO] Prepared ${users.length} users with tokens`);
}

// Основная функция теста
async function runTest() {
    try {
        // Проверяем переменные окружения
        validateEnv();
        // Очистка кэша
        console.log('[INFO] Clearing cache...');
        await axios.post(`${options.url}/games/clear-cache`, {}, {
            headers: { 'Authorization': `Bearer ${process.env.ADMIN_TOKEN || 'admin-token'}` },
            timeout: 5000
        }).catch(err => console.warn(`[WARN] Failed to clear cache: ${err.message}`));
        await prepareUsers(50);

        if (users.length === 0) {
            throw new Error('No users with tokens available for testing');
        }

        // Генерируем массив requests
        const requests = [];

        // 1. Запросы на авторизацию (для каждого пользователя)
        for (const user of users) {
            const loginData = {
                username: user.username,
                password: user.password
            };

            requests.push({
                method: 'POST',
                path: '/login',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(loginData)
            });
        }

        // 2. Запросы на игру (с токенами)
     // В loadtest.js, строка ~160
for (const user of users) {
    for (let i = 0; i < 5; i++) {
        requests.push({
            method: 'GET',
            path: `/games/${gameId}/play`,
            headers: {
                'Authorization': `Bearer ${user.token}`,
                'Content-Type': 'application/json'
            },
            body: null
        });
        await sleep(10); // Задержка 10 мс
    }
}

        // Запускаем autocannon
        console.log(`[INFO] Starting load test with ${requests.length} requests...`);
        const results = await new Promise((resolve, reject) => {
            const instance = autocannon(
                {
                    ...options,
                    requests
                },
                (err, results) => {
                    if (err) {
                        console.error(`[ERROR] Autocannon failed: ${err.message}`);
                        return reject(err);
                    }
                    console.log(`[INFO] Test completed: ${JSON.stringify(results, null, 2)}`);
                    resolve(results);
                }
            );

            autocannon.track(instance, { renderProgressBar: true });
        });

        return results;
    } catch (err) {
        console.error(`[ERROR] Test failed: ${err.message}`);
        throw err;
    } finally {
        // Очистка пользователей
        await cleanupUsers();
        await pool.end(); // Закрываем пул соединений
        console.log('[INFO] Database connection closed');
    }
}

// Запуск теста
runTest().catch(err => console.error('[ERROR] Failed to run test:', err.message));