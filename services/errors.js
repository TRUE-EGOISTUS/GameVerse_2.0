class AppError extends Error {
    constructor(message = 'Ошибка приложения', statusCode = 500, code = 'APP_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Ресурс не найден', details = null) {
        super(message, 404, 'NOT_FOUND', details);
    }
}

class AccessDeniedError extends AppError {
    constructor(message = 'Доступ запрещён', details = null) {
        super(message, 403, 'ACCESS_DENIED', details);
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
    }
}

module.exports = {
    AppError,
    NotFoundError,
    AccessDeniedError,
    ValidationError
};
