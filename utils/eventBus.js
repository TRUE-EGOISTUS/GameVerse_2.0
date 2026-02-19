// ------------------ EventBus ------------------
/**
 * Простая шина событий для синхронных и асинхронных слушателей.
 */
class EventBus {
    constructor() {
        /** @private @type {Record<string, Function[]>} */
        this.events = {};
    }

    /**
     * Подписаться на событие.
     * @param {string} event - имя события
     * @param {function} listener - слушатель, может возвращать Promise
     */
    subscribe(event, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener must be a function');
        }
        (this.events[event] ??= []).push(listener);
    }

    /**
     * Подписаться один раз: слушатель автоматически удалится после первого вызова.
     * @param {string} event
     * @param {function} listener
     */
    once(event, listener) {
        const wrapper = async (data) => {
            this.unsubscribe(event, wrapper); // Отписываемся до вызова слушателя
            await listener(data);
        };
        this.subscribe(event, wrapper);
    }

    /**
     * Отписаться от события.
     * @param {string} event
     * @param {function} listener
     */
    unsubscribe(event, listener) {
        const list = this.events[event];
        if (!list) return;
        this.events[event] = list.filter(l => l !== listener);
    }

    /**
     * Опубликовать событие.
     * @param {string} event
     * @param {*} [data]
     */
    publish(event, data) {
        const listeners = this.events[event] || [];
        for (const listener of [...listeners]) {
            try {
                const result = listener(data);
                // Обработка асинхронных ошибок
                if (result instanceof Promise) {
                    result.catch(err => console.error(`Async error in "${event}":`, err));
                }
            } catch (err) {
                console.error(`Error in listener for "${event}":`, err);
            }
        }
    }

    /**
     * Удалить всех слушателей для конкретного события.
     * @param {string} event
     */
    clearEvent(event) {
        this.events[event] = [];
    }

    /**
     * Удалить все события и слушатели.
     */
    destroy() {
        this.events = {};
    }

    /**
     * Получить список зарегистрированных событий.
     * @returns {string[]}
     */
    getEvents() {
        return Object.keys(this.events);
    }

    // Псевдоним для publish
    emit(event, data) {
        this.publish(event, data);
    }
}

module.exports = EventBus;