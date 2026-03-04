const NodeCache = require('node-cache');

// ---------------- Интерфейс стратегии (duck-typing реализуем через проверки) ----------------
class ICacheStrategy {
    get(key) { throw new Error('Not implemented'); }
    set(key, value, ttl) { throw new Error('Not implemented'); }
    del(key) { throw new Error('Not implemented'); }
    flushAll() { throw new Error('Not implemented'); }
    keys() { throw new Error('Not implemented'); }
    on(event, handler) { throw new Error('Not implemented'); }
    off(event, handler) { throw new Error('Not implemented'); }
}

// ----------- Конкретная стратегия: Node-Cache ---------
class NodeCacheStrategy extends ICacheStrategy {
    constructor(options = { stdTTL: 300, checkperiod: 120 }) {
        super();
        this.cache = new NodeCache(options);
    }

    get(key)               { return this.cache.get(key); }
    set(key, value, ttl)   { return this.cache.set(key, value, ttl); }
    del(key)               { return this.cache.del(key); }
    flushAll()             { return this.cache.flushAll(); }
    keys()                 { return this.cache.keys(); }
    on(event, handler)     { this.cache.on(event, handler); }
    off(event, handler) {
        if (typeof this.cache.off === 'function') {
            this.cache.off(event, handler);
            return;
        }
        if (typeof this.cache.removeListener === 'function') {
            this.cache.removeListener(event, handler);
        }
    }
}

// ------------------ Обёртка Cache ---------------------
class Cache {
    /**
     * @param {*} strategy  – реализация кэш-стратегии
     * @param {EventBus|null}  eventBus  – внешний EventBus (опционально)
     */
    constructor(strategy, eventBus = null) {
        // Duck-typing проверки
        ['get','set','del','keys','flushAll','on','off'].forEach(fn => {
            if (typeof strategy[fn] !== 'function') {
                throw new TypeError(`Cache strategy must implement method ${fn}()`);
            }
        });

        this.strategy = strategy;
        this.eventBus = eventBus;
        this._subscriptions = [];
        this._bindInternalEvents();
    }

    _bindInternalEvents() {
        ['set', 'del', 'expired'].forEach(ev => {
            const handler = (key, value) => {
                if (this.eventBus) {
                    this.eventBus.publish(`cache:${ev}`, { key, value });
                }
            };
            this.strategy.on(ev, handler);
            this._subscriptions.push({ ev, handler });
        });
    }

    /**
     * Отключает все внутренние подписки. Вызывать при завершении работы.
     */
    destroy() {
        this._subscriptions.forEach(({ ev, handler }) => {
            this.strategy.off(ev, handler);
        });
        this._subscriptions = [];
    }

    get(key) {
        try {
            return this.strategy.get(key);
        } catch (err) {
            console.error('Cache get error:', err);
            return null;
        }
    }

    set(key, value, ttl) {
        try {
            return this.strategy.set(key, value, ttl);
        } catch (err) {
            console.error('Cache set error:', err);
            return false;
        }
    }

    del(key) {
        try {
            return this.strategy.del(key);
        } catch (err) {
            console.error('Cache delete error:', err);
            return 0;
        }
    }

    keys() {
        try {
            return this.strategy.keys();
        } catch (err) {
            console.error('Cache keys error:', err);
            return [];
        }
    }

    flushAll() {
        try {
            return this.strategy.flushAll();
        } catch (err) {
            console.error('Cache flushAll error:', err);
            return null;
        }
    }
}

module.exports = {
    Cache,
    NodeCacheStrategy,
    ICacheStrategy
};
