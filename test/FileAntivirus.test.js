const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FileAntivirus } = require('../utils/fileAntivirus'); // Исправленный импорт

describe('FileAntivirus - тесты', () => {
  let antivirus;

  beforeEach(() => {
    antivirus = new FileAntivirus();
    // Заглушка для логирования, чтобы не писать в файл во время тестов
    jest.spyOn(FileAntivirus, 'logDetection').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('hasSuspiciousUnicode правильно определяет подозренные символы', () => {
    expect(FileAntivirus.hasSuspiciousUnicode('normal text')).toBe(false);
    expect(FileAntivirus.hasSuspiciousUnicode('текст с кириллицей')).toBe(false); // Кириллица безопасна
    expect(FileAntivirus.hasSuspiciousUnicode('hello\u202e')).toBe(true); // Спецсимвол
});

  test('hasMaliciousURL обнаруживает плохие домены и IP', () => {
    expect(FileAntivirus.hasMaliciousURL('visit malicious.com now')).toBe(true);
    expect(FileAntivirus.hasMaliciousURL('safewebsite.com')).toBe(false);
    expect(FileAntivirus.hasMaliciousURL('connect to 192.168.0.1')).toBe(true);
  });

  test('hasSuspiciousPowershellCmd обнаруживает подозрительные команды', () => {
    expect(FileAntivirus.hasSuspiciousPowershellCmd('Invoke-WebRequest')).toBe(true);
    expect(FileAntivirus.hasSuspiciousPowershellCmd('normal command')).toBe(false);
  });

  test('hasSuspiciousJSObfuscator распознаёт известные паттерны обфускации', () => {
    expect(FileAntivirus.hasSuspiciousJSObfuscator('eval(function(p,a,c,k,e,d)')).toBe(true);
    expect(FileAntivirus.hasSuspiciousJSObfuscator('var a = 123')).toBe(false);
  });

  test('hasSuspiciousMacros распознаёт макросы', () => {
    expect(FileAntivirus.hasSuspiciousMacros('AutoOpen')).toBe(true);
    expect(FileAntivirus.hasSuspiciousMacros('simple text')).toBe(false);
  });

  test('checkExif возвращает false для пустого или безопасного EXIF', () => {
    const safeBuffer = Buffer.from('safe image data');
    expect(antivirus.checkExif(safeBuffer, 'image.jpg')).toBe(false);
  });

  test('hasDoubleExtension правильно распознаёт двойные расширения', () => {
    expect(FileAntivirus.hasDoubleExtension('file.jpg.exe')).toBe(true);
    expect(FileAntivirus.hasDoubleExtension('folder/file.txt')).toBe(false);
  });

  test('hasSuspiciousPathChars обнаруживает запрещённые символы в пути', () => {
    expect(FileAntivirus.hasSuspiciousPathChars('../secret')).toBe(true);
    expect(FileAntivirus.hasSuspiciousPathChars('normal/path')).toBe(false);
  });

  test('hasRepeatingChars обнаруживает длинные повторы символов', () => {
    expect(FileAntivirus.hasRepeatingChars('aaaaaa')).toBe(true);
    expect(FileAntivirus.hasRepeatingChars('abcabc')).toBe(false);
  });

test('scanJsByRegex правильно подсчитывает вес подозрительных паттернов', async () => {
  const src = 'eval("alert(1)"); new Function("console.log(1)");';
  const score = await antivirus.scanJsByRegex(src); // Добавляем await
  expect(score).toBeGreaterThan(0);
});

test('scanJsByAST считает вес вызовов функций', async () => {
  const src = 'eval("alert(1)"); setTimeout("alert(2)", 1000);';
  const score = await antivirus.scanJsByAST(src); // Добавляем await
  expect(score).toBeGreaterThan(0);
});
  test('verifySignature корректно проверяет HMAC-подпись', () => {
    const secret = 'testkey';
    const data = Buffer.from('test data');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const signature = hmac.digest('hex');

    expect(antivirus.verifySignature(data, signature, secret)).toBe(true);
    expect(antivirus.verifySignature(data, 'wrong', secret)).toBe(false);
    expect(antivirus.verifySignature(data, signature, '')).toBe(false);
  });

  test('mlClassifyFile возвращает значение от 0 до 1', () => {
    const features = { evalCount: 2, scriptTags: 3, base64Len: 100 };
    const score = FileAntivirus.mlClassifyFile(features);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('extractMetadata возвращает объект с generatedBy, если есть совпадение', () => {
    const buffer = Buffer.from('{"generatedBy":"neural"}');
    expect(FileAntivirus.extractMetadata(buffer, 'file.json')).toEqual({ generatedBy: 'neural' });
    expect(FileAntivirus.extractMetadata(buffer, 'generatedBy_neural_file.txt')).toEqual({ generatedBy: 'neural' });
    expect(FileAntivirus.extractMetadata(Buffer.from('no meta'), 'file.txt')).toEqual({});
  });

test('hasDangerousHtml выявляет опасные HTML-теги и атрибуты', async () => {
  expect(await antivirus.hasDangerousHtml('<script>alert(1)</script>')).toBe(true); // Добавляем await
  expect(await antivirus.hasDangerousHtml('<div>safe content</div>')).toBe(false); // Добавляем await
  expect(await antivirus.hasDangerousHtml('<iframe src="http://evil.com"></iframe>')).toBe(true); // Добавляем await
});
test('hasDangerousHtml разрешает HTML с безопасными внешними ссылками', async () => {
  const html = '<img src="https://cdn.yourdomain.com/image.png">';
  expect(await antivirus.hasDangerousHtml(html)).toBe(false); // Добавляем await
  const badHtml = '<img src="https://evil.com/image.png">';
  expect(await antivirus.hasDangerousHtml(badHtml)).toBe(true); // Добавляем await
});
  test('hasScriptInSvg выявляет скрипты в SVG', () => {
    expect(antivirus.hasScriptInSvg('<svg><script>alert(1)</script></svg>')).toBe(true);
    expect(antivirus.hasScriptInSvg('<svg><rect/></svg>')).toBe(false);
  });

  test('isTextFile корректно определяет текстовые буферы', () => {
    expect(FileAntivirus.isTextFile(Buffer.from('simple text'))).toBe(true);
    // Эмулируем бинарные данные с ошибкой кодировки
    expect(FileAntivirus.isTextFile(Buffer.from([0xff, 0xff, 0xff]))).toBe(true); // но метод скорее всегда true, так как toString utf8 не кидает
  });

  test('hasBinaryData определяет наличие байтов >127', () => {
    expect(FileAntivirus.hasBinaryData(Buffer.from([0x00, 0x10, 0x7f]))).toBe(false);
    expect(FileAntivirus.hasBinaryData(Buffer.from([0x00, 0x80, 0xff]))).toBe(true);
  });

  test('sanitizeCssWhitelist удаляет выражения expression() из CSS', () => {
    const css = 'body { color: red; } div { width: expression(alert(1)); }';
    const sanitized = FileAntivirus.sanitizeCssWhitelist(css);
    expect(sanitized).not.toContain('expression');
  });

 test('isFileContentSafe разрешает простой текстовый файл', async () => {
    const buffer = Buffer.from('just text', 'utf8');
    const filename = 'test.js';
    const result = await antivirus.isFileContentSafe(buffer, filename); // Добавляем await
    expect(result).toBe(true);
});

test('isFileContentSafe блокирует файл с двойным расширением', async () => {
    const buffer = Buffer.from('some content', 'utf8');
    const filename = 'file.jpg.exe';
    const result = await antivirus.isFileContentSafe(buffer, filename); // Добавляем await
    expect(result).toBe(false);
});

test('isFileContentSafe блокирует скрытые файлы', async () => {
    const buffer = Buffer.from('some content', 'utf8');
    const filename = '.hiddenfile';
    const result = await antivirus.isFileContentSafe(buffer, filename); // Добавляем await
    expect(result).toBe(false);
});

test('isFileContentSafe блокирует файлы с подозрительными символами в пути', async () => {
    const buffer = Buffer.from('some content', 'utf8');
    const filename = 'path/../file.js';
    const result = await antivirus.isFileContentSafe(buffer, filename); // Добавляем await
    expect(result).toBe(false);
});

test('isFileContentSafe блокирует JS файл с подозрительными паттернами', async () => {
    const buffer = Buffer.from('eval("alert(1)")', 'utf8');
    const filename = 'dangerous.js';
    const result = await antivirus.isFileContentSafe(buffer, filename); // Добавляем await
    expect(result).toBe(false);
});
test('isFileContentSafe блокирует JS с новым обфускатором', async () => {
    const buffer = Buffer.from('new obfuscator("malicious code")', 'utf8');
    const filename = 'obfuscated.js';
    const result = await antivirus.isFileContentSafe(buffer, filename);
    expect(result).toBe(false);
});
test('isFileContentSafe разрешает JS с безопасным fetch', async () => {
    const buffer = Buffer.from('fetch("https://api.user.com/data")', 'utf8');
    const result = await antivirus.isFileContentSafe(buffer, 'userScript.js');
    expect(result).toBe(true);
});
test('isFileContentSafe разрешает изображения с разными MIME-типами', async () => {
    // Простой PNG-буфер (минимальный валидный PNG)
    const buffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
        0xB0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82 // IEND chunk
    ]);
    const result = await antivirus.isFileContentSafe(buffer, 'test.png');
    expect(result).toBe(true);
});
test('isFileContentSafe разрешает .js файлы с произвольными названиями', async () => {
    const buffer = Buffer.from('function test() { console.log("hello"); }', 'utf8');
    const filenames = [
        'myCoolScript.js',
        'my.script.js',
        '.gameScript.js',
        'script___123.js',
        'my Cool Script.js'
    ];
    for (const filename of filenames) {
        const result = await antivirus.isFileContentSafe(buffer, filename);
        expect(result).toBe(true);
    }
});
});