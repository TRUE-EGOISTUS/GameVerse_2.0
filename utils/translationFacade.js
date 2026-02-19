class TranslationFacade {
    /**
     * @param {Pool} pool — PostgreSQL пул
     * @param {function(category: string, ruText: string): Promise<string>} getOrCreateTranslation
     * @param {string[]} [defaultCategories]
     */
    constructor(pool, getOrCreateTranslation, defaultCategories = [
        'genres', 'tags', 'descriptions', 'rating_comments', 'ban_reasons', 'errors'
    ]) {
        this.pool = pool;
        this.getOrCreateTranslation = getOrCreateTranslation;
        this.defaultCategories = defaultCategories;
        this.translations = Object.create(null);
        this._initDefaultCategories();
    }

    _initDefaultCategories() {
        for (const category of this.defaultCategories) {
            this.translations[category] = Object.create(null);
        }
    }

    _ensureCategory(category) {
        if (!this.translations[category]) {
            this.translations[category] = Object.create(null);
        }
    }

    async load() {
        try {
            const res = await this.pool.query(
                'SELECT category, en_text, ru_text FROM translations'
            );
            const freshCache = Object.create(null);
            for (const { category, en_text, ru_text } of res.rows) {
                if (!freshCache[category]) {
                    freshCache[category] = Object.create(null);
                }
                freshCache[category][en_text] = ru_text;
            }
            this.translations = freshCache;
        } catch (err) {
            console.error('❌ Error loading translations:', err);
        }
    }

    async refresh() {
        return this.load();
    }

    translate(category, key) {
        if (!category || !key) return key;
        return this.translations?.[category]?.[key] ?? key;
    }

    async getOrCreate(category, ruText, { refresh = true } = {}) {
        if (!category || !ruText) return ruText;
        this._ensureCategory(category);
        try {
            const enText = await this.getOrCreateTranslation(category, ruText);
            if (refresh) await this.refresh(); // можно отключить для batch-операций
            return enText;
        } catch (err) {
            console.error(`❌ Error in getOrCreate for category "${category}":`, err);
            return ruText;
        }
    }

    addCategory(category) {
        if (typeof category === 'string' && category.trim()) {
            this._ensureCategory(category);
        }
    }

    clearCache() {
        this.translations = Object.create(null);
        this._initDefaultCategories();
    }

    static safeTranslate(translations, category, key) {
        return translations?.[category]?.[key] ?? key;
    }

    getAllTranslations() {
        return this.translations;
    }

    has(category, key) {
        return !!this.translations?.[category]?.[key];
    }
}

module.exports = TranslationFacade;
