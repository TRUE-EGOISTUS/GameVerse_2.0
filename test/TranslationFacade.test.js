const TranslationFacade = require('../utils/translationFacade');

describe('TranslationFacade', () => {
  let poolMock;
  let getOrCreateTranslationMock;
  let facade;

  beforeEach(() => {
    poolMock = {
      query: jest.fn(),
    };
    getOrCreateTranslationMock = jest.fn();
    facade = new TranslationFacade(poolMock, getOrCreateTranslationMock);
  });

  test('инициализирует дефолтные категории при создании', () => {
    const categories = ['genres', 'tags', 'descriptions', 'rating_comments', 'ban_reasons', 'errors'];
    for (const cat of categories) {
      expect(facade.translations).toHaveProperty(cat);
      expect(facade.translations[cat]).toEqual({});
    }
  });

  test('метод _ensureCategory создаёт категорию, если её нет', () => {
    expect(facade.translations).not.toHaveProperty('new_category');
    facade._ensureCategory('new_category');
    expect(facade.translations).toHaveProperty('new_category');
    expect(facade.translations['new_category']).toEqual({});
  });

  test('load загружает переводы из базы и сохраняет в кеш', async () => {
    const rows = [
      { category: 'genres', en_text: 'action', ru_text: 'боевик' },
      { category: 'genres', en_text: 'drama', ru_text: 'драма' },
      { category: 'tags', en_text: 'funny', ru_text: 'смешной' },
    ];
    poolMock.query.mockResolvedValue({ rows });

    await facade.load();

    expect(poolMock.query).toHaveBeenCalledWith('SELECT category, en_text, ru_text FROM translations');
    expect(facade.translations['genres']['action']).toBe('боевик');
    expect(facade.translations['genres']['drama']).toBe('драма');
    expect(facade.translations['tags']['funny']).toBe('смешной');
  });

  test('load обрабатывает ошибку загрузки и не ломается', async () => {
    poolMock.query.mockRejectedValue(new Error('DB error'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await facade.load();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Error loading translations:'), expect.any(Error));

    consoleSpy.mockRestore();
  });

  test('refresh вызывает load', async () => {
    const loadSpy = jest.spyOn(facade, 'load').mockResolvedValue();
    await facade.refresh();
    expect(loadSpy).toHaveBeenCalled();
    loadSpy.mockRestore();
  });

  test('translate возвращает перевод из кеша, если есть', () => {
    facade.translations = {
      genres: { action: 'боевик' }
    };
    expect(facade.translate('genres', 'action')).toBe('боевик');
  });

  test('translate возвращает ключ, если категория или ключ отсутствуют', () => {
    expect(facade.translate('unknown', 'key')).toBe('key');
    expect(facade.translate('', 'key')).toBe('key');
    expect(facade.translate('genres', '')).toBe('');
    expect(facade.translate(null, 'key')).toBe('key');
  });

  test('getOrCreate вызывает getOrCreateTranslation и обновляет кеш, если refresh=true', async () => {
    getOrCreateTranslationMock.mockResolvedValue('enText');
    const refreshSpy = jest.spyOn(facade, 'refresh').mockResolvedValue();

    const result = await facade.getOrCreate('genres', 'боевик', { refresh: true });

    expect(getOrCreateTranslationMock).toHaveBeenCalledWith('genres', 'боевик');
    expect(refreshSpy).toHaveBeenCalled();
    expect(result).toBe('enText');

    refreshSpy.mockRestore();
  });

  test('getOrCreate не вызывает refresh, если refresh=false', async () => {
    getOrCreateTranslationMock.mockResolvedValue('enText');
    const refreshSpy = jest.spyOn(facade, 'refresh').mockResolvedValue();

    const result = await facade.getOrCreate('genres', 'боевик', { refresh: false });

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(result).toBe('enText');

    refreshSpy.mockRestore();
  });

  test('getOrCreate возвращает ruText и логирует ошибку, если getOrCreateTranslation выбрасывает', async () => {
    getOrCreateTranslationMock.mockRejectedValue(new Error('fail'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await facade.getOrCreate('genres', 'боевик');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Error in getOrCreate for category "genres":'), expect.any(Error));
    expect(result).toBe('боевик');

    consoleSpy.mockRestore();
  });

  test('addCategory добавляет категорию, если строка валидна', () => {
    facade.addCategory('newcat');
    expect(facade.translations).toHaveProperty('newcat');
  });

 test('addCategory не добавляет категорию, если строка пустая или не строка', () => {
  facade.addCategory('');
  facade.addCategory('   ');
  facade.addCategory(null);
  facade.addCategory(123);

  expect(facade.translations).not.toHaveProperty('');
  expect(facade.translations).not.toHaveProperty('   ');
  expect(facade.translations[null]).toBeUndefined();   // <-- вместо toHaveProperty(null)
  expect(facade.translations).not.toHaveProperty('123'); // '123' как строка
});


  test('clearCache очищает кеш и восстанавливает дефолтные категории', () => {
    facade.translations = { some: { key: 'val' } };
    facade.clearCache();

    expect(facade.translations).toEqual(expect.objectContaining({
      genres: {},
      tags: {},
      descriptions: {},
      rating_comments: {},
      ban_reasons: {},
      errors: {},
    }));
  });

  test('static safeTranslate возвращает перевод или ключ по умолчанию', () => {
    const translations = {
      cat1: { key1: 'value1' }
    };
    expect(TranslationFacade.safeTranslate(translations, 'cat1', 'key1')).toBe('value1');
    expect(TranslationFacade.safeTranslate(translations, 'cat1', 'unknown')).toBe('unknown');
    expect(TranslationFacade.safeTranslate(null, 'cat1', 'key1')).toBe('key1');
  });

  test('getAllTranslations возвращает текущий кеш', () => {
    facade.translations = { testcat: { k: 'v' } };
    expect(facade.getAllTranslations()).toEqual({ testcat: { k: 'v' } });
  });

  test('has возвращает true, если перевод есть', () => {
    facade.translations = { cat: { key: 'val' } };
    expect(facade.has('cat', 'key')).toBe(true);
  });

  test('has возвращает false, если перевода нет', () => {
    facade.translations = { cat: { key: 'val' } };
    expect(facade.has('cat', 'other')).toBe(false);
    expect(facade.has('othercat', 'key')).toBe(false);
  });

  test('translate возвращает ключ, если категория или ключ отсутствуют', () => {
    expect(facade.translate('', 'key')).toBe('key');
    expect(facade.translate('cat', '')).toBe('');
  });
});
