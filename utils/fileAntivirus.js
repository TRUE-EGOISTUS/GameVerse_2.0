const AdmZip = require('adm-zip');
const exif = require('exif-parser');
const fs = require('fs');
const path = require('path');
const FileType = require('file-type');
const acorn = require('acorn');
const walk = require('acorn-walk');
const postcss = require('postcss');
const safeParser = require('postcss-safe-parser');
const htmlparser2 = require('htmlparser2');
const crypto = require('crypto');
const { parse } = require('esprima');

class FileAntivirus {
    constructor() {
        try {
            this.config = JSON.parse(fs.readFileSync(path.join(__dirname, 'antivirus.config.json'), 'utf8'));
            if (!this.config.thresholds) {
                throw new Error('Конфигурация thresholds отсутствует в antivirus.config.json');
            }
        } catch (e) {
            console.error(`Ошибка загрузки конфигурации: ${e.message}`);
            FileAntivirus.logDetection(`Ошибка загрузки конфигурации: ${e.message}`, 'constructor');
            throw new Error('Не удалось загрузить конфигурацию антивируса');
        }

        this.TRUSTED_PUBLIC_KEY = process.env.TRUSTED_PUBLIC_KEY || '';
        this.TRUSTED_HMAC_KEY = process.env.TRUSTED_HMAC_KEY || '';
        this.JS_SCORE_PASS = Number(process.env.JS_SCORE_PASS) || this.config.thresholds.pass || 0;
        this.JS_SCORE_WARN = Number(process.env.JS_SCORE_WARN) || this.config.thresholds.warn || 50;
        this.JS_SCORE_BLOCK = Number(process.env.JS_SCORE_BLOCK) || this.config.thresholds.block || 75;
        this.ML_EVAL_WEIGHT = Number(process.env.ML_EVAL_WEIGHT) || 0.4;
        this.ML_SCRIPT_WEIGHT = Number(process.env.ML_SCRIPT_WEIGHT) || 0.3;
        this.ML_BASE64_WEIGHT = Number(process.env.ML_BASE64_WEIGHT) || 0.5;
        this.isRelaxed = process.env.RELAXED_MODE === 'true';
        if (isNaN(this.JS_SCORE_PASS) || isNaN(this.JS_SCORE_WARN) || isNaN(this.JS_SCORE_BLOCK)) {
            throw new Error('Некорректные значения порогов в конфигурации или переменных окружения');
        }

        this.EXT_MAGIC = {
            ...this.config.mimeTypes,
            js: ['application/javascript', 'text/javascript', 'text/plain'],
        };
        this.allowedFilesExt = [
            'js', 'ts', 'wasm', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico',
            'glb', 'gltf', 'fbx', 'obj', 'mtl', 'dae', 'bin', 'mp3', 'ogg', 'wav',
            'json', 'xml', 'txt', 'csv', 'ini', 'html', 'htm', 'css', 'manifest.json', 'webmanifest', 'map'
        ];
        this.stringContentCache = {};
        this.trustedHashes = new Set(process.env.TRUSTED_HASHES?.split(',') || []);
    }

    analyzeStringContent(content) {
        if (!content || typeof content !== 'string') return 0;

        // Кэш, чтобы не пересчитывать
        const cacheKey = crypto.createHash('md5').update(content).digest('hex');
        if (this.stringContentCache[cacheKey]) {
            console.log('Using cached result for string content:', cacheKey);
            return this.stringContentCache[cacheKey];
        }

        if (Object.keys(this.stringContentCache).length > 1000) {
            this.stringContentCache = {};
        }

        let totalScore = 0;

        // Разрешённые паттерны из конфигурации
        const allowPatterns = this.config.jsAllowPatterns.map(pat =>
            new RegExp(pat, 'i')
        );

        for (const allow of allowPatterns) {
            if (allow.test(content)) {
                this.stringContentCache[cacheKey] = 0;
                return 0; // Разрешённый контент — сразу пропускаем
            }
        }

        // Проверка по jsRules из конфигурации
        for (const rule of this.config.jsRules) {
            try {
                const regex = new RegExp(rule.pattern, rule.flags || 'i');
                if (regex.test(content)) {
                    totalScore += rule.weight || 0;
                }
            } catch (e) {
                console.warn(`Ошибка в jsRule: ${rule.pattern}`, e.message);
            }
        }

        // Дополнительные проверки из второго метода
        const rules = [
            { re: /document\.cookie/, weight: 30 },
            { re: /window\.location/, weight: 20 },
            { re: /document\.write/, weight: 15 },
            { re: /XMLHttpRequest/, weight: 15 },
            { re: /ActiveXObject/, weight: 15 },
            { re: /innerHTML\s*=/, weight: 15 },
            { re: /appendChild\s*\(/, weight: 10 },
            { re: /createElement\s*\(/, weight: 2 },
            { re: /location\.reload|location\.replace|window\.open/, weight: 15 },
            { re: /atob\s*\(|btoa\s*\(/, weight: 10 },
            { re: /powershell|cmd\.exe|bash|sh|shell\.application|wscript\.shell/i, weight: 20 },
            { re: /eval\s*\(/, weight: 50 },
            { re: /new\s+Function\s*\(/, weight: 12 }
        ];

        if (/fetch\s*\(/.test(content)) {
            const fetchAllowed = this.config.jsAllowPatterns.some(p => new RegExp(p, 'g').test(content));
            if (!fetchAllowed) {
                console.log('String content rule fetch matched, score += 30');
                totalScore += 30;
            } else {
                console.log('Fetch allowed by whitelist in string content');
            }
        }

        for (const { re, weight } of rules) {
            const matches = content.match(re) || [];
            const ruleScore = matches.length * weight;
            if (ruleScore > 0) {
                console.log(`String content rule ${re} matched ${matches.length} times, score += ${ruleScore}`);
            }
            totalScore += ruleScore;
        }

        if (FileAntivirus.hasSuspiciousJSObfuscator(content)) {
            console.log('Obfuscation detected in string content');
            totalScore += 15;
        }

        if (FileAntivirus.hasSuspiciousPowershellCmd(content)) {
            console.log('Suspicious PowerShell commands in string content');
            totalScore += 15;
        }

        if (FileAntivirus.hasMaliciousURL(content)) {
            console.log('Malicious URL detected in string content');
            totalScore += 50;
        }

        // Кэшируем результат
        this.stringContentCache[cacheKey] = totalScore;
        return totalScore;
    }

    static async logDetection(reason, filename, score = 0, matchedRules = []) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                filename,
                reason,
                score,
                matchedRules,
                details: matchedRules.length > 0 ? matchedRules.map(r => `Pattern: ${r.pattern}, Score: ${r.score}`).join('; ') : 'No matched rules'
            };
            await fs.promises.appendFile(
                path.join(__dirname, 'antivirus.log'),
                JSON.stringify(logEntry) + '\n'
            );
        } catch (e) {
            console.error(`Ошибка записи в лог: ${e.message}`);
        }
    }

    static hasSuspiciousUnicode(str) {
        return /[\u202e\u202d\u202a\u202b\u202c\u200e\u200f\u2066\u2067\u2068\u2069]/.test(str);
    }

    static hasMaliciousURL(text) {
        const badDomains = ['malicious.com', 'evil.com', 'badsite.net', 'phishing', 'darkweb', 'tor2web', 'onion', 'cryptolocker', 'ransomware'];
        return badDomains.some(dom => text.includes(dom)) || /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text);
    }

    static hasSuspiciousPowershellCmd(text) {
        const patterns = ['invoke-webrequest', 'wget ', 'curl ', 'nc -e', 'powershell -enc', 'bash -c', 'bash -i', 'certutil -decode', 'shell.application'];
        return patterns.some(p => text.toLowerCase().includes(p));
    }

    static hasSuspiciousJSObfuscator(text) {
        const patterns = [
            /eval\(function\(p,a,c,k,e,d\)/i, /function\(p,a,c,k,e,d\)\{/i, /_0x[a-f0-9]{4,}/i,
            /window\['eval'\]/i, /atob\(/i, /btoa\(/i, /unescape\(/i, /escape\(/i,
            /\[\s*['"][a-zA-Z0-9]+['"]\s*\]\s*\(/i, /String\.fromCharCode\s*\(/i,
            /[\u200c-\u200f\u202a-\u202e]/i,
            /new\s+obfuscator/i
        ];
        return patterns.some(r => r.test(text));
    }

    static hasSuspiciousMacros(text) {
        const patterns = ['autoopen', 'document_open', 'workbook_open', 'shell.application', 'vbscript', 'wscript.shell', 'powershell', 'cmd.exe', 'createobject'];
        return patterns.some(p => text.toLowerCase().includes(p));
    }

    checkExif(buffer, filename) {
        try {
            const parser = exif.create(buffer);
            const result = parser.parse();
            if (!result || !result.tags) return false;
            const metaStr = JSON.stringify(result.tags).toLowerCase();
            if (
                FileAntivirus.hasSuspiciousPowershellCmd(metaStr) ||
                FileAntivirus.hasMaliciousURL(metaStr) ||
                FileAntivirus.hasSuspiciousJSObfuscator(metaStr)
            ) {
                FileAntivirus.logDetection('Suspicious EXIF/metadata', filename);
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    static hasDoubleExtension(filepath) {
        const parts = filepath.split(/[\\/]/);
        return parts.some(name => /\.[a-z0-9]{2,5}\.[a-z0-9]{2,5}$/i.test(name));
    }

    static hasSuspiciousPathChars(str) {
        return /\.\.|~|%|\$|;|\||`/.test(str);
    }

    static hasRepeatingChars(str) {
        return /(.)\1{5,}/.test(str);
    }

    static hasSuspiciousExtensionAnywhere(str) {
        return /\.(exe|bat|cmd|sh|php|js|vbs|scr|jar|py|rb|dll|sys|com|msi|zip|rar)(\.|$)/i.test(str);
    }

    static hasTooManySpacesOrInvisible(str) {
        const spaceCount = (str.match(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g) || []).length;
        return spaceCount > 10;
    }

    async scanJsByRegex(src) {
        let score = 0;
        const matchedRules = [];
        for (const { pattern, weight, flags } of this.config.jsRules) {
            const re = new RegExp(pattern, flags || 'g');
            const matches = src.match(re) || [];
            const ruleScore = matches.length * weight;
            if (ruleScore > 0) {
                console.log(`Rule ${pattern} matched ${matches.length} times, score += ${ruleScore}`);
                matchedRules.push({ pattern, matches: matches.length, score: ruleScore });
            }
            score += ruleScore;
        }
        if (this.config.jsAllowPatterns.some(p => new RegExp(p, 'g').test(src))) {
            console.log('Allowed by whitelist');
            score = 0;
            matchedRules.length = 0;
            matchedRules.push({ pattern: 'whitelist', score: 0 });
        }
        await FileAntivirus.logDetection(`scanJsByRegex completed: score=${score}`, 'js_scan', score, matchedRules);
        return score;
    }

    async scanJsByAST(src) {
        console.log('scanJsByAST called with source length:', src.length);
        let score = 0;
        const matchedRules = [];

        if (this.config.jsAllowPatterns.some(p => new RegExp(p, 'g').test(src))) {
            console.log('Allowed by whitelist in AST');
            await FileAntivirus.logDetection('Allowed by whitelist in AST', 'js_scan', 0, [{ pattern: 'whitelist', score: 0 }]);
            return 0;
        }

        try {
            const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
            console.log('AST parsed successfully');

            // Привязываем методы к текущему контексту this
            const extractFunctionBody = this.extractFunctionBody.bind(this);
            const analyzeStringContent = this.analyzeStringContent.bind(this);

            walk.ancestor(ast, {
                CallExpression: (node, ancestors) => {
                    if (node.callee.type === 'Identifier') {
                        if (node.callee.name === 'eval') {
                            console.log('Found eval in AST');
                            score += 50;
                            matchedRules.push({ pattern: 'eval', score: 50 });
                            if (node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string') {
                                const contentScore = analyzeStringContent(node.arguments[0].value);
                                score += contentScore;
                                matchedRules.push({ pattern: 'eval_content', score: contentScore });
                            }
                        }
                        if (node.callee.name === 'atob') {
                            console.log('Found atob in AST');
                            score += 30;
                            matchedRules.push({ pattern: 'atob', score: 30 });
                            if (node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string') {
                                try {
                                    const decoded = Buffer.from(node.arguments[0].value, 'base64').toString('utf8');
                                    const decodedScore = analyzeStringContent(decoded);
                                    score += decodedScore;
                                    matchedRules.push({ pattern: 'atob_decoded_content', score: decodedScore });
                                    if (decoded.includes('eval') || decoded.includes('document.cookie') || FileAntivirus.hasMaliciousURL(decoded)) {
                                        score += 50;
                                        matchedRules.push({ pattern: 'atob_dangerous_content', score: 50 });
                                    }
                                } catch (e) {
                                    console.log('Error decoding base64 in AST:', e.message);
                                    score += 10;
                                    matchedRules.push({ pattern: 'atob_decode_error', score: 10 });
                                }
                            }
                        }
                        if (node.callee.name === 'setTimeout' || node.callee.name === 'setInterval') {
                            if (node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string') {
                                console.log(`Found ${node.callee.name} with string in AST`);
                                score += 5;
                                matchedRules.push({ pattern: node.callee.name, score: 5 });
                                const contentScore = analyzeStringContent(node.arguments[0].value);
                                score += contentScore;
                                matchedRules.push({ pattern: `${node.callee.name}_content`, score: contentScore });
                            } else if (
                                node.arguments[0]?.type === 'ArrowFunctionExpression' ||
                                node.arguments[0]?.type === 'FunctionExpression' ||
                                node.arguments[0]?.type === 'Identifier'
                            ) {
                                console.log(`Found safe ${node.callee.name} with function or identifier in AST`);
                                const funcBody = extractFunctionBody(node.arguments[0], src);
                                const contentScore = analyzeStringContent(funcBody);
                                score += contentScore;
                                matchedRules.push({ pattern: `${node.callee.name}_function`, score: contentScore });
                            }
                        }
                        if (node.callee.name === 'requestAnimationFrame') {
                            console.log('Found requestAnimationFrame in AST');
                            score += 3;
                            matchedRules.push({ pattern: 'requestAnimationFrame', score: 3 });
                            if (node.arguments[0]?.type === 'Identifier' || node.arguments[0]?.type === 'FunctionExpression') {
                                const funcBody = extractFunctionBody(node.arguments[0], src);
                                const contentScore = analyzeStringContent(funcBody);
                                score += contentScore;
                                matchedRules.push({ pattern: 'requestAnimationFrame_function', score: contentScore });
                            }
                        }
                        if (node.callee.name === 'Function') {
                            console.log('Found Function call in AST');
                            score += 12;
                            matchedRules.push({ pattern: 'Function', score: 12 });
                            if (node.arguments.length > 0 && node.arguments[node.arguments.length - 1]?.type === 'Literal') {
                                const contentScore = analyzeStringContent(node.arguments[node.arguments.length - 1].value);
                                score += contentScore;
                                matchedRules.push({ pattern: 'Function_content', score: contentScore });
                            }
                        }
                        if (node.callee.name === 'require') {
                            console.log('Found require in AST');
                            score += 3;
                            matchedRules.push({ pattern: 'require', score: 3 });
                        }
                        if (node.callee.name === 'import') {
                            console.log('Found import in AST');
                            score += 20;
                            matchedRules.push({ pattern: 'import', score: 20 });
                        }
                        if (node.callee.name === 'fetch' && node.arguments[0]?.value?.startsWith('http')) {
                            const url = node.arguments[0].value;
                            const allowedDomains = ['localhost', '127.0.0.1', 'api.example.com', 'api.user.com', 'cdn.yourdomain.com', 'cdnjs.cloudflare.com', 'code.jquery.com'];
                            if (!allowedDomains.some(domain => url.includes(domain))) {
                                console.log('Found external fetch in AST');
                                score += 40;
                                matchedRules.push({ pattern: 'fetch_external', score: 40 });
                                if (FileAntivirus.hasMaliciousURL(url)) {
                                    score += 20;
                                    matchedRules.push({ pattern: 'fetch_malicious_url', score: 20 });
                                }
                            }
                        }
                    }
                    const inLoop = ancestors.some(n => ['ForStatement', 'WhileStatement', 'DoWhileStatement'].includes(n.type));
                    if (inLoop && ['eval', 'setTimeout', 'setInterval', 'Function'].includes(node.callee.name)) {
                        console.log(`Found ${node.callee.name} in loop, potential risk`);
                        score += 10;
                        matchedRules.push({ pattern: `${node.callee.name}_in_loop`, score: 10 });
                    }
                },
                NewExpression: (node) => {
                    if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
                        console.log('Found new Function in AST');
                        score += 12;
                        matchedRules.push({ pattern: 'new_Function', score: 12 });
                        if (node.arguments.length > 0 && node.arguments[node.arguments.length - 1]?.type === 'Literal') {
                            const contentScore = analyzeStringContent(node.arguments[node.arguments.length - 1].value);
                            score += contentScore;
                            matchedRules.push({ pattern: 'new_Function_content', score: contentScore });
                        }
                    }
                },
                MemberExpression: (node) => {
                    if (node.object?.name === 'WebAssembly') {
                        console.log('Found WebAssembly in AST');
                        score += 15;
                        matchedRules.push({ pattern: 'WebAssembly', score: 15 });
                    }
                },
                FunctionExpression: (node) => {
                    const funcBody = extractFunctionBody(node, src);
                    const contentScore = analyzeStringContent(funcBody);
                    score += contentScore;
                    matchedRules.push({ pattern: 'FunctionExpression', score: contentScore });
                },
                ArrowFunctionExpression: (node) => {
                    const funcBody = extractFunctionBody(node, src);
                    const contentScore = analyzeStringContent(funcBody);
                    score += contentScore;
                    matchedRules.push({ pattern: 'ArrowFunctionExpression', score: contentScore });
                }
            });
        } catch (e) {
            console.error(`Ошибка парсинга JS в scanJsByAST: ${e.message}`);
            await FileAntivirus.logDetection(`Ошибка парсинга JS: ${e.message}, исходный код: ${src.slice(0, 100)}...`, 'js_scan', 10);
            score += 10;
            matchedRules.push({ pattern: 'ast_parse_error', score: 10, error: e.message });
        }
        await FileAntivirus.logDetection(`scanJsByAST completed: score=${score}`, 'js_scan', score, matchedRules);
        return score;
    }

    extractFunctionBody(node, src) {
        try {
            if (!node || !node.start || !node.end) {
                console.log('Недостаточно данных для извлечения тела функции');
                return '';
            }
            // Проверяем, есть ли body, и извлекаем его содержимое
            if (node.body && node.body.start && node.body.end) {
                return src.slice(node.body.start + 1, node.body.end - 1).trim();
            }
            // Для идентификаторов или других случаев возвращаем пустую строку
            return '';
        } catch (e) {
            console.error(`Ошибка извлечения тела функции: ${e.message}`);
            return '';
        }
    }

    async scanWasm(buffer) {
        const text = buffer.toString('latin1');
        if (/env\.exec|syscall|process\.|child_process/.test(text)) {
            await FileAntivirus.logDetection('Suspicious WASM imports', 'file.wasm');
            return true;
        }
        return false;
    }

    verifySignature(buffer, signature, publicKeyOrSecret) {
        if (!signature || !publicKeyOrSecret) return false;
        const hmac = crypto.createHmac('sha256', publicKeyOrSecret);
        hmac.update(buffer);
        const digest = hmac.digest('hex');
        return digest === signature;
    }

    static mlClassifyFile(features) {
        const weights = {
            evalCount: Number(process.env.ML_EVAL_WEIGHT) || 0.4,
            scriptTags: Number(process.env.ML_SCRIPT_WEIGHT) || 0.3,
            base64Len: Number(process.env.ML_BASE64_WEIGHT) || 0.5
        };
        let score = 0;
        if (features.evalCount > 0) score += weights.evalCount * features.evalCount;
        if (features.scriptTags > 0) score += weights.scriptTags * features.scriptTags;
        if (features.base64Len > 50) score += weights.base64Len * (features.base64Len / 50);
        return Math.min(score, 1);
    }

    static extractMetadata(buffer, filename) {
        if (/generatedBy.*neural/i.test(filename)) return { generatedBy: 'neural' };
        const text = buffer.slice(0, 2048).toString('utf8');
        const match = text.match(/"generatedBy"\s*:\s*"(\w+)"/i);
        if (match) return { generatedBy: match[1] };
        return {};
    }

    async hasDangerousHtml(html) {
        let hasIframe = false, hasMetaRefresh = false, hasBaseHref = false, hasOnEvent = false;
        let hasExternalLink = false, hasDataUri = false, scriptContent = '', scriptDepth = 0;
        let hasScript = false; // Добавляем переменную для отслеживания <script>

        const allowedOnEventFunctions = [
            'newGame', 'changeDifficulty', 'parent', 'startGame', 'toggleGame', 'restartGame', 'pauseGame', 'resumeGame', 'endGame',
            'updateScore', 'updateLevel', 'playSound', 'stopSound', 'movePlayer', 'shootEnemy',
            'handleClick', 'handleKeyPress', 'handleMouseMove', 'handleTouchStart', 'handleTouchMove', 'handleTouchEnd',
            'alert', 'confirm', 'prompt'
        ];

        const parser = new htmlparser2.Parser({
            onopentag(name, attribs) {
                const lowerName = name.toLowerCase();
                if (lowerName === 'script') scriptDepth++;
                if (lowerName === 'iframe') hasIframe = true;
                if (lowerName === 'meta' && attribs['http-equiv']?.toLowerCase() === 'refresh') hasMetaRefresh = true;
                if (lowerName === 'base' && attribs['href']) hasBaseHref = true;
                if (Object.keys(attribs).some(attr => attr.toLowerCase().startsWith('on'))) {
                    for (const [attr, value] of Object.entries(attribs)) {
                        if (attr.toLowerCase().startsWith('on')) {
                            const isSafeFunction = allowedOnEventFunctions.some(func =>
                                value.match(new RegExp(`^${func}\\s*\\(\\s*['"]?[^'"]*['"]?\\s*\\)$`))
                            );
                            if (!isSafeFunction && (value.includes('eval') || value.includes('document.') || value.includes('window.'))) {
                                hasOnEvent = true; // Исправлено: было hasSSSOnEvent
                                FileAntivirus.logDetection(`Dangerous on-event attribute: ${attr}="${value}"`, 'html_file');
                            }
                        }
                    }
                }
                const allowedDomains = [
                    'cdn.yourdomain.com', 'api.user.com', 'cdnjs.cloudflare.com', 'code.jquery.com',
                    'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', "unpkg.com"
                ];
                if (attribs['href']?.startsWith('http') || attribs['src']?.startsWith('http')) {
                    if (!allowedDomains.some(domain => (attribs['href'] || attribs['src'] || '').includes(domain))) {
                        hasExternalLink = true;
                        FileAntivirus.logDetection(`External link detected: ${attribs['href'] || attribs['src']}`, 'html_file');
                    }
                }
                if ((attribs['src'] || '').startsWith('data:') || (attribs['href'] || '').startsWith('data:')) {
                    hasDataUri = true;
                    FileAntivirus.logDetection(`Data URI detected: ${attribs['src'] || attribs['href']}`, 'html_file');
                }
            },
            ontext(text) {
                if (scriptDepth > 0 && text.trim()) scriptContent += text;
            },
            onclosetag(name) {
                if (name.toLowerCase() === 'script') scriptDepth--;
            }
        });

        parser.write(html);
        parser.end();

        // Явная проверка на наличие <script> тега
        if (scriptContent.trim()) {
            hasScript = true;
            await FileAntivirus.logDetection(`Script tag detected in ${html}`, 'html_file');
        }

        // Если есть <script> и код не в белом списке, считаем опасным
        const isWhitelisted = this.config.jsAllowPatterns.some(p => new RegExp(p, 'g').test(scriptContent));
        if (hasScript && !isWhitelisted) {
            await FileAntivirus.logDetection(`Non-whitelisted script tag detected in ${html}`, 'html_file');
            return true;
        }

        const jsScore = scriptContent.trim() ? await this.scanJsByRegex(scriptContent) + await this.scanJsByAST(scriptContent) : 0;

        await FileAntivirus.logDetection({
            hasIframe, hasMetaRefresh, hasBaseHref, hasOnEvent, hasExternalLink, hasDataUri,
            scriptContent: scriptContent ? '<script content>' : '',
            jsScore, blockThreshold: this.config.blockThreshold
        }, 'html_flags');

        return hasIframe || hasMetaRefresh || hasBaseHref || hasOnEvent || hasExternalLink || hasDataUri || jsScore >= this.config.blockThreshold;
    }

    hasScriptInSvg(svg) {
        let hasScript = false;
        const parser = new htmlparser2.Parser({
            onopentag(name) {
                if (name.toLowerCase() === 'script') hasScript = true;
            }
        }, { decodeEntities: true, xmlMode: true });
        parser.write(svg);
        parser.end();
        return hasScript;
    }

    static isTextFile(buffer) {
        try {
            buffer.toString('utf8');
            return true;
        } catch {
            return false;
        }
    }

    static hasBinaryData(buffer) {
        for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
            if (buffer[i] > 127) return true;
        }
        return false;
    }

    static async sanitizeCssWhitelist(css) {
        let root;
        try {
            root = await postcss.parse(css, { parser: safeParser });
        } catch (e) {
            await FileAntivirus.logDetection(`CSS parse error: ${e.message}`, 'css_file');
            return '';
        }
        root.walkDecls(decl => {
            if (/expression\s*\(/i.test(decl.value)) {
                FileAntivirus.logDetection(`Forbidden CSS expression: ${decl.value}`, 'css_file');
                decl.remove();
            }
        });
        return root.toString();
    }

  // Обнови метод в FileAntivirus.js
async isFileContentSafe(buffer, filename, mimeType) {
    if (!buffer || !(buffer instanceof Buffer)) {
        await FileAntivirus.logDetection(`No buffer or invalid file for ${filename}`, 'unknown_file');
        return false;
    }

    // Проверка на подозрительные символы в имени файла
    if (FileAntivirus.hasSuspiciousPathChars(filename)) {
        await FileAntivirus.logDetection(`Suspicious path characters in filename: ${filename}`, 'filename_check');
        return false;
    }

    const name = filename.toLowerCase();
    const mime = mimeType?.toLowerCase() || '';

    const isCss = name.endsWith('.css') || mime.includes('css/');
    const isHtml = /html/.test(name) || mime.includes('html');
    const isJs = name.endsWith('.js') || mime.includes('javascript');
    const isImage = /\.(png|jpe?g|gif)$/i.test(name) || /image\/(png|jpe?g|gif)/i.test(mime);
    const isMedia = /\.(mp3|wav|mp4)$/i.test(name) || /(audio|video)\//.test(mime);

    const bufferStr = (isCss || isHtml || isJs) ? buffer.toString('utf8') : '';

    console.log(`[DEBUG] FileAntivirus: Checking file ${filename}, MIME: ${mime}, isImage: ${isImage}`);

    // CSS
    if (isCss) {
        try {
            const result = await postcss([safeParser]).process(bufferStr, { from: undefined });
            if (result.css) {
                const dangerousPatterns = [
                    /expression\s*\(/i,
                    /javascript\s*:/i,
                    /eval\s*\(/i,
                    /document\./i,
                    /window\./i,
                    /behavior\s*:/i,
                    /url\s*\(\s*['"]?http/i
                ];

                for (const pattern of dangerousPatterns) {
                    if (pattern.test(bufferStr)) {
                        await FileAntivirus.logDetection(`Dangerous CSS pattern '${pattern}' in ${filename}`, 'css_file');
                        return false;
                    }
                }

                const urlRegex = /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
                let match;
                while ((match = urlRegex.exec(bufferStr)) !== null) {
                    const url = match[1].trim();
                    if (url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
                        await FileAntivirus.logDetection(`External URL in CSS: ${url} in ${filename}`, 'css_file');
                        return false;
                    }
                }

                return true;
            }
        } catch (err) {
            await FileAntivirus.logDetection(`Invalid CSS in ${filename}: ${err.message}`, 'css_file');
            return false;
        }
    }

    // HTML
    if (isHtml) {
        if (!bufferStr.trim()) {
            await FileAntivirus.logDetection(`Invalid HTML content in ${filename}`, 'html_file');
            return false;
        }
        return !(await this.hasDangerousHtml(bufferStr));
    }

    // JavaScript
    if (isJs) {
        if (!bufferStr.trim()) {
            await FileAntivirus.logDetection(`Invalid JS content in ${filename}`, 'js_file');
            return false;
        }
        // Явная блокировка для new obfuscator
        if (/new\s+obfuscator\s*\(/i.test(bufferStr)) {
            await FileAntivirus.logDetection(`Explicit new obfuscator detected in ${filename}`, 'js_file');
            return false;
        }
        let score = await this.scanJsByRegex(bufferStr) + await this.scanJsByAST(bufferStr);
        // Добавляем проверку на обфускацию
        if (FileAntivirus.hasSuspiciousJSObfuscator(bufferStr)) {
            score += 15; // Добавляем вес за обфускацию, как в analyzeStringContent
            await FileAntivirus.logDetection(`Obfuscation detected in ${filename}`, 'js_file', score);
        }
        await FileAntivirus.logDetection(`JS score for ${filename}: ${score}, blockThreshold: ${this.config.blockThreshold}`, 'js_file', score);
        return score < this.config.blockThreshold;
    }

    // Изображения (проверка расширения и MIME-типа)
    if (isImage) {
        console.log(`[DEBUG] FileAntivirus: Checking image file ${filename}, MIME: ${mime}, Allowed MIME types: ${['image/png', 'image/jpeg', 'image/gif'].join(', ')}`);
        
        // Проверяем MIME-тип
        const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/gif'];
        if (!mime || !allowedMimeTypes.includes(mime)) {
            console.log(`[DEBUG] FileAntivirus: Invalid MIME type for ${filename}: ${mime}`);
            await FileAntivirus.logDetection(`Invalid MIME type for ${filename}: ${mime}`, 'image_file');
            return false;
        }

        console.log(`[DEBUG] FileAntivirus: Allowing image file ${filename} based on extension and MIME type`);
        await FileAntivirus.logDetection(`Image ${filename} passed extension and MIME check`, 'image_file');
        return true;
    }

    // Аудио/видео
    if (isMedia) {
        try {
            const type = await FileType.fromBuffer(buffer);
            if (!type || !['mp3', 'wav', 'mp4'].includes(type.ext)) {
                await FileAntivirus.logDetection(`Invalid media type for ${filename}: ${type?.ext || 'unknown'}`, 'media_file');
                return false;
            }
            return true;
        } catch (err) {
            await FileAntivirus.logDetection(`Invalid media file ${filename}: ${err.message}`, 'media_file');
            return false;
        }
    }

    // Неподдерживаемые типы файлов
    await FileAntivirus.logDetection(`Unsupported file type for ${filename}`, 'unknown_file');
    return false;
}
}

module.exports = {
    FileAntivirus,
    isFileContentSafe: (buffer, filename, opts) => new FileAntivirus().isFileContentSafe(buffer, filename, opts)
};

if (require.main === module) {
    (async () => {
        try {
            const antivirus = new FileAntivirus();

            const scriptPath = path.join(__dirname, 'script.js');
            if (await fs.promises.access(scriptPath).then(() => true).catch(() => false)) {
                const scriptBuffer = await fs.promises.readFile(scriptPath);
                console.log('Testing script.js:', await antivirus.isFileContentSafe(scriptBuffer, 'script.js'));
            } else {
                console.error('Файл script.js не найден');
            }

            const htmlPath = path.join(__dirname, 'index.html');
            if (await fs.promises.access(htmlPath).then(() => true).catch(() => false)) {
                const htmlBuffer = await fs.promises.readFile(htmlPath);
                console.log('Testing index.html:', await antivirus.isFileContentSafe(htmlBuffer, 'index.html'));
            } else {
                console.error('Файл index.html не найден');
            }

            const safeJs = Buffer.from('function test() { console.log("Hello, world!"); }', 'utf8');
            console.log('Safe JS:', await antivirus.isFileContentSafe(safeJs, 'main.js'));

            const safeCss = Buffer.from('.game { display: flex; background: url("./bg.png"); }', 'utf8');
            console.log('Safe CSS:', await antivirus.isFileContentSafe(safeCss, 'style.css'));

            const safeHtml = Buffer.from('<!DOCTYPE html><html><body><button onclick="startGame()">Start</button></body></html>', 'utf8');
            console.log('Safe HTML:', await antivirus.isFileContentSafe(safeHtml, 'index.html'));
        } catch (e) {
            console.error(`Ошибка при тестировании: ${e.message}`);
        }
    })();
}