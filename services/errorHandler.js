const { AppError } = require('./errors');

function errorHandler(err, req, res, next) {
    console.error('❌ Ошибка:', err.stack || err);

    const isAppError = err instanceof AppError;
    const statusCode = isAppError ? err.statusCode : 500;
    const code = isAppError ? err.code : 'INTERNAL_ERROR';
    const message = err.message || 'Внутренняя ошибка сервера';
    const details = isAppError && err.details ? err.details : undefined;

    res.status(statusCode).json({
        success: false,
        error: {
            code,
            message,
            ...(details && { details })
        }
    });
}

module.exports = errorHandler;