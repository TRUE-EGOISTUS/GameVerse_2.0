const { Pool } = require('pg');
const DatabaseManager = require('../services/DatabaseManager');

jest.mock('pg', () => {
  const mQuery = jest.fn();
  const mEnd = jest.fn();
  const mPool = jest.fn(() => ({ query: mQuery, end: mEnd }));
  return { Pool: mPool };
});

describe('DatabaseManager', () => {
  let dbManager;
  let mockQuery, mockEnd;

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    Pool.mockClear();
    mockQuery = jest.fn();
    mockEnd = jest.fn();
    Pool.mockImplementation(() => ({ query: mockQuery, end: mockEnd }));

    dbManager = new DatabaseManager({
      db: {},
      logger: mockLogger,
      logLevel: 'debug'
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('initialize вызывает createTables и setAllUsersOffline', async () => {
    dbManager.createTables = jest.fn();
    dbManager.setAllUsersOffline = jest.fn();

    await dbManager.initialize();

    expect(dbManager.createTables).toHaveBeenCalled();
    expect(dbManager.setAllUsersOffline).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Database initialized successfully');
  });

  test('initialize логирует ошибку при сбое', async () => {
    dbManager.createTables = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(dbManager.initialize()).rejects.toThrow('fail');
    expect(mockLogger.error).toHaveBeenCalledWith('Initialization failed:', expect.any(Error));
  });

  test('createTables выполняет все SQL-запросы', async () => {
    mockQuery.mockResolvedValueOnce();

    await dbManager.createTables();

    expect(mockQuery).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Tables created or already exist.');
  });

  test('setAllUsersOffline обновляет всех пользователей', async () => {
    mockQuery.mockResolvedValueOnce();
    await dbManager.setAllUsersOffline();
    expect(mockQuery).toHaveBeenCalledWith('UPDATE users SET online = FALSE');
    expect(mockLogger.info).toHaveBeenCalledWith('All users set offline');
  });

  test('getUsers возвращает список пользователей', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'test', favorites: '[]' }]
    });

    const users = await dbManager.getUsers();
    expect(users[0].username).toBe('test');
  });

  test('getUserById возвращает пользователя при успехе', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, username: 'test', favorites: '[]' }] });

    const user = await dbManager.getUserById(1);
    expect(user.username).toBe('test');
  });

  test('getUserById возвращает null, если пользователь не найден', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const user = await dbManager.getUserById(999);
    expect(user).toBeNull();
  });

  test('saveUser сохраняет нового пользователя', async () => {
    mockQuery.mockResolvedValueOnce();

    await dbManager.saveUser({
      id: 1,
      username: 'user',
      password: 'pass',
      role: 'user',
      online: false,
      favorites: [],
      avatar: null
    });

    expect(mockQuery).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('User saved:', 'user');
  });

  test('deleteUser удаляет пользователя', async () => {
    mockQuery.mockResolvedValueOnce();

    await dbManager.deleteUser('user');
    expect(mockQuery).toHaveBeenCalledWith('DELETE FROM users WHERE username = $1', ['user']);
  });

  test('getGames возвращает список игр', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Game', ratings: '[]', tags: '[]', files: '[]' }]
    });

    const games = await dbManager.getGames();
    expect(games.length).toBe(1);
    expect(games[0].name).toBe('Game');
  });

  test('getGameById возвращает игру', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'TestGame', ratings: '[]', tags: '[]', files: '[]' }]
    });

    const game = await dbManager.getGameById(1);
    expect(game.name).toBe('TestGame');
  });

  test('saveGame сохраняет игру', async () => {
    mockQuery.mockResolvedValueOnce();
    await dbManager.saveGame({
      id: 1,
      name: 'Game',
      title: 'Game',
      ratings: [],
      files: [],
      tags: []
    });

    expect(mockQuery).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Game saved:', 'Game');
  });

  test('deleteGame удаляет игру', async () => {
    mockQuery.mockResolvedValueOnce();
    await dbManager.deleteGame(1);
    expect(mockQuery).toHaveBeenCalledWith('DELETE FROM games WHERE id = $1', [1]);
  });

  test('saveToken сохраняет токен', async () => {
    mockQuery.mockResolvedValueOnce();
    await dbManager.saveToken(1, 'token123');
    expect(mockQuery).toHaveBeenCalledWith(
      `INSERT INTO tokens (user_id, token) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [1, 'token123']
    );
  });

  test('deleteToken удаляет токен', async () => {
    mockQuery.mockResolvedValueOnce();
    await dbManager.deleteToken(1, 'token123');
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM tokens WHERE user_id = $1 AND token = $2',
      [1, 'token123']
    );
  });

  test('parseJson возвращает значение по умолчанию при невалидном JSON', () => {
    const result = dbManager.parseJson('{"bad_json"', []);
    expect(result).toEqual([]);
  });

  test('close завершает соединение с БД', async () => {
    await dbManager.close();
    expect(mockEnd).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Database connection closed');
  });
});
