const EventEmitter = require('events');
const NodeCache = require('node-cache');

const {
  Cache,
  NodeCacheStrategy,
  ICacheStrategy
} = require('../utils/cache'); // замените на реальный путь к файлу

describe('ICacheStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new ICacheStrategy();
  });

  test.each([
    'get',
    'set',
    'del',
    'flushAll',
    'keys',
    'on',
    'off',
  ])('метод %s должен выбрасывать ошибку Not implemented', (method) => {
    expect(() => strategy[method]()).toThrow('Not implemented');
  });
});

describe('NodeCacheStrategy', () => {
  let nodeCacheInstance;
  let strategy;

  beforeEach(() => {
    nodeCacheInstance = new NodeCache();
    jest.spyOn(NodeCache.prototype, 'get');
    jest.spyOn(NodeCache.prototype, 'set');
    jest.spyOn(NodeCache.prototype, 'del');
    jest.spyOn(NodeCache.prototype, 'flushAll');
    jest.spyOn(NodeCache.prototype, 'keys');
    jest.spyOn(NodeCache.prototype, 'on');
    jest.spyOn(NodeCache.prototype, 'off');

    strategy = new NodeCacheStrategy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('должен корректно создавать внутренний NodeCache', () => {
    expect(strategy.cache).toBeInstanceOf(NodeCache);
  });

  test('метод get должен делегировать вызов cache.get', () => {
    strategy.get('key1');
    expect(NodeCache.prototype.get).toHaveBeenCalledWith('key1');
  });

  test('метод set должен делегировать вызов cache.set', () => {
    strategy.set('key1', 'value1', 100);
    expect(NodeCache.prototype.set).toHaveBeenCalledWith('key1', 'value1', 100);
  });

  test('метод del должен делегировать вызов cache.del', () => {
    strategy.del('key1');
    expect(NodeCache.prototype.del).toHaveBeenCalledWith('key1');
  });

  test('метод flushAll должен делегировать вызов cache.flushAll', () => {
    strategy.flushAll();
    expect(NodeCache.prototype.flushAll).toHaveBeenCalled();
  });

  test('метод keys должен делегировать вызов cache.keys', () => {
    strategy.keys();
    expect(NodeCache.prototype.keys).toHaveBeenCalled();
  });

  test('метод on должен делегировать вызов cache.on', () => {
    const handler = jest.fn();
    strategy.on('set', handler);
    expect(NodeCache.prototype.on).toHaveBeenCalledWith('set', handler);
  });

  test('метод off должен делегировать вызов cache.off', () => {
    const handler = jest.fn();
    strategy.off('set', handler);
    expect(NodeCache.prototype.off).toHaveBeenCalledWith('set', handler);
  });
});

describe('Cache', () => {
  let fakeStrategy;
  let eventBus;
  let cache;

  beforeEach(() => {
    // Поддельная стратегия с мок-методами
    fakeStrategy = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      flushAll: jest.fn(),
      keys: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    eventBus = {
      publish: jest.fn(),
    };

    cache = new Cache(fakeStrategy, eventBus);
  });

  test('конструктор выбрасывает TypeError если отсутствует метод', () => {
    const badStrategy = {
      get: () => {},
      // set отсутствует
    };
    expect(() => new Cache(badStrategy)).toThrow(TypeError);
  });

  test('в конструкторе подписывается на события set, del, expired', () => {
    expect(fakeStrategy.on).toHaveBeenCalledTimes(3);
    expect(fakeStrategy.on).toHaveBeenCalledWith('set', expect.any(Function));
    expect(fakeStrategy.on).toHaveBeenCalledWith('del', expect.any(Function));
    expect(fakeStrategy.on).toHaveBeenCalledWith('expired', expect.any(Function));
  });

  test('метод destroy снимает все внутренние подписки', () => {
    cache.destroy();
    expect(fakeStrategy.off).toHaveBeenCalledTimes(3);
    expect(cache._subscriptions.length).toBe(0);
  });

  describe('метод get', () => {
    test('возвращает результат стратегии', () => {
      fakeStrategy.get.mockReturnValue('value');
      expect(cache.get('key')).toBe('value');
      expect(fakeStrategy.get).toHaveBeenCalledWith('key');
    });

    test('при ошибке возвращает null и логирует', () => {
      fakeStrategy.get.mockImplementation(() => { throw new Error('fail'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(cache.get('key')).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Cache get error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('метод set', () => {
    test('возвращает результат стратегии', () => {
      fakeStrategy.set.mockReturnValue(true);
      expect(cache.set('key', 'value', 100)).toBe(true);
      expect(fakeStrategy.set).toHaveBeenCalledWith('key', 'value', 100);
    });

    test('при ошибке возвращает false и логирует', () => {
      fakeStrategy.set.mockImplementation(() => { throw new Error('fail'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(cache.set('key', 'value', 100)).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Cache set error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('метод del', () => {
    test('возвращает результат стратегии', () => {
      fakeStrategy.del.mockReturnValue(1);
      expect(cache.del('key')).toBe(1);
      expect(fakeStrategy.del).toHaveBeenCalledWith('key');
    });

    test('при ошибке возвращает 0 и логирует', () => {
      fakeStrategy.del.mockImplementation(() => { throw new Error('fail'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(cache.del('key')).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('Cache delete error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('метод keys', () => {
    test('возвращает результат стратегии', () => {
      fakeStrategy.keys.mockReturnValue(['k1', 'k2']);
      expect(cache.keys()).toEqual(['k1', 'k2']);
      expect(fakeStrategy.keys).toHaveBeenCalled();
    });

    test('при ошибке возвращает пустой массив и логирует', () => {
      fakeStrategy.keys.mockImplementation(() => { throw new Error('fail'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(cache.keys()).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Cache keys error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('метод flushAll', () => {
    test('возвращает результат стратегии', () => {
      fakeStrategy.flushAll.mockReturnValue(true);
      expect(cache.flushAll()).toBe(true);
      expect(fakeStrategy.flushAll).toHaveBeenCalled();
    });

    test('при ошибке возвращает null и логирует', () => {
      fakeStrategy.flushAll.mockImplementation(() => { throw new Error('fail'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(cache.flushAll()).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Cache flushAll error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  test('при возникновении события set делается публикация в eventBus', () => {
    // Найдем подписчика на событие 'set'
    const setHandler = fakeStrategy.on.mock.calls.find(call => call[0] === 'set')[1];
    setHandler('key1', 'val1');
    expect(eventBus.publish).toHaveBeenCalledWith('cache:set', { key: 'key1', value: 'val1' });
  });

  test('при возникновении события del делается публикация в eventBus', () => {
    const delHandler = fakeStrategy.on.mock.calls.find(call => call[0] === 'del')[1];
    delHandler('key2', 'val2');
    expect(eventBus.publish).toHaveBeenCalledWith('cache:del', { key: 'key2', value: 'val2' });
  });

  test('при возникновении события expired делается публикация в eventBus', () => {
    const expiredHandler = fakeStrategy.on.mock.calls.find(call => call[0] === 'expired')[1];
    expiredHandler('key3', 'val3');
    expect(eventBus.publish).toHaveBeenCalledWith('cache:expired', { key: 'key3', value: 'val3' });
  });
});
