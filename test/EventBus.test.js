const EventBus = require('../utils/eventBus'); // замените путь на реальный

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  test('subscribe добавляет слушателя', () => {
    const listener = jest.fn();
    bus.subscribe('event1', listener);
    expect(bus.events['event1']).toContain(listener);
  });

  test('subscribe выбрасывает TypeError если слушатель не функция', () => {
    expect(() => bus.subscribe('event', null)).toThrow(TypeError);
    expect(() => bus.subscribe('event', 'not a fn')).toThrow(TypeError);
  });

  test('unsubscribe удаляет слушателя', () => {
    const listener = jest.fn();
    bus.subscribe('event1', listener);
    bus.unsubscribe('event1', listener);
    expect(bus.events['event1']).not.toContain(listener);
  });

  test('unsubscribe ничего не делает если событие не зарегистрировано', () => {
    expect(() => bus.unsubscribe('noEvent', () => {})).not.toThrow();
  });

  test('publish вызывает всех слушателей с переданными данными', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    bus.subscribe('e', listener1);
    bus.subscribe('e', listener2);

    bus.publish('e', 42);

    expect(listener1).toHaveBeenCalledWith(42);
    expect(listener2).toHaveBeenCalledWith(42);
  });

  test('publish обрабатывает синхронные ошибки слушателей и логирует', () => {
    const error = new Error('fail');
    const listener = jest.fn(() => { throw error; });
    bus.subscribe('e', listener);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    bus.publish('e', null);

    expect(spy).toHaveBeenCalledWith('Error in listener for "e":', error);

    spy.mockRestore();
  });

  test('publish обрабатывает асинхронные ошибки слушателей и логирует', async () => {
    const error = new Error('async fail');
    const listener = jest.fn(() => Promise.reject(error));
    bus.subscribe('e', listener);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    bus.publish('e', null);

    // Ждем асинхронный catch внутри publish
    await new Promise(r => setTimeout(r, 10));

    expect(spy).toHaveBeenCalledWith('Async error in "e":', error);

    spy.mockRestore();
  });

  test('once подписывает слушателя, который вызывается один раз и отписывается', () => {
    const listener = jest.fn(() => Promise.resolve());
    bus.once('onceEvent', listener);

    expect(bus.events['onceEvent']).toHaveLength(1);

    // Первый вызов
    bus.publish('onceEvent', 'data1');
    expect(listener).toHaveBeenCalledWith('data1');

    // Второй вызов — слушателя уже нет
    bus.publish('onceEvent', 'data2');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('clearEvent удаляет всех слушателей для события', () => {
    bus.subscribe('e', () => {});
    bus.subscribe('e', () => {});
    expect(bus.events['e'].length).toBe(2);
    bus.clearEvent('e');
    expect(bus.events['e'].length).toBe(0);
  });

  test('destroy очищает все события и слушателей', () => {
    bus.subscribe('e1', () => {});
    bus.subscribe('e2', () => {});
    bus.destroy();
    expect(Object.keys(bus.events).length).toBe(0);
  });

  test('getEvents возвращает список всех событий', () => {
    bus.subscribe('ev1', () => {});
    bus.subscribe('ev2', () => {});
    const events = bus.getEvents();
    expect(events).toContain('ev1');
    expect(events).toContain('ev2');
  });

  test('emit является псевдонимом для publish', () => {
    const listener = jest.fn();
    bus.subscribe('e', listener);
    bus.emit('e', 123);
    expect(listener).toHaveBeenCalledWith(123);
  });
});
