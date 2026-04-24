import { StreamLanguage, StreamParser, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { Extension } from '@codemirror/state';

const KEYWORDS = new Set([
    'module', 'import', 'export', 'from', 'as',
    'function', 'fn', 'def', 'return', 'yield', 'await', 'async',
    'if', 'else', 'elif', 'unless', 'switch', 'case', 'default', 'match', 'when',
    'for', 'while', 'do', 'loop', 'break', 'continue', 'in', 'of',
    'class', 'struct', 'enum', 'interface', 'trait', 'extends', 'implements',
    'new', 'this', 'self', 'super',
    'try', 'catch', 'finally', 'throw', 'raise',
    'use', 'using', 'with', 'let', 'var', 'const', 'val', 'mut',
    'public', 'private', 'protected', 'static', 'final', 'abstract',
    'system', 'service', 'config', 'route', 'handler', 'event', 'on', 'emit',
    'pipeline', 'stage', 'task', 'step', 'depends', 'requires', 'provides',
]);

const ATOMS = new Set(['true', 'false', 'null', 'nil', 'none', 'undefined', 'void']);
const TYPES = new Set([
    'string', 'number', 'int', 'float', 'bool', 'boolean',
    'array', 'list', 'map', 'dict', 'object', 'any', 'unknown',
    'u8', 'u16', 'u32', 'u64', 'i8', 'i16', 'i32', 'i64', 'f32', 'f64',
]);

interface ExoState {
    inString: false | '"' | "'" | '`';
    inBlockComment: boolean;
}

const exoParser: StreamParser<ExoState> = {
    startState: () => ({ inString: false, inBlockComment: false }),

    token(stream, state) {
        
        if (state.inBlockComment) {
            while (!stream.eol()) {
                if (stream.match('*/')) { state.inBlockComment = false; return 'comment'; }
                stream.next();
            }
            return 'comment';
        }

        
        if (state.inString) {
            const quote = state.inString;
            while (!stream.eol()) {
                const ch = stream.next();
                if (ch === '\\') { stream.next(); continue; }
                if (ch === quote) { state.inString = false; return 'string'; }
            }
            return 'string';
        }

        if (stream.eatSpace()) return null;

        
        if (stream.match('//')) { stream.skipToEnd(); return 'lineComment'; }
        if (stream.match('#') && !stream.match(/^![\/]/, false)) { stream.skipToEnd(); return 'lineComment'; }
        if (stream.match('--')) { stream.skipToEnd(); return 'lineComment'; }
        if (stream.match('/*')) { state.inBlockComment = true; return 'comment'; }

        
        const ch = stream.peek();
        if (ch === '"' || ch === "'" || ch === '`') {
            stream.next();
            state.inString = ch as '"' | "'" | '`';
            return 'string';
        }

        
        if (/\d/.test(ch || '')) {
            stream.eatWhile(/[0-9_]/);
            if (stream.eat('.')) stream.eatWhile(/[0-9_]/);
            stream.eatWhile(/[a-zA-Z]/); 
            return 'number';
        }

        
        if (stream.match(/^@[a-zA-Z_][\w$]*/)) return 'annotation';

        
        if (/[a-zA-Z_$]/.test(ch || '')) {
            stream.eatWhile(/[\w$]/);
            const word = stream.current();

            
            const after = stream.peek();
            if (after === ':') return 'propertyName';

            if (KEYWORDS.has(word)) return 'keyword';
            if (ATOMS.has(word)) return 'atom';
            if (TYPES.has(word)) return 'typeName';

            
            if (/^[A-Z]/.test(word)) return 'typeName';

            
            const restMatch = stream.match(/^\s*\(/, false);
            if (restMatch) return 'function';

            return 'variableName';
        }

        
        if (stream.match(/^(=>|->|::|<=|>=|==|!=|&&|\|\||\+\+|--|<<|>>|[+\-*\/%=<>!&|^~?])/)) {
            return 'operator';
        }

        
        if (/[{}()\[\];,.]/.test(ch || '')) {
            stream.next();
            return 'punctuation';
        }

        stream.next();
        return null;
    },

    languageData: {
        commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
        indentOnInput: /^\s*[\}\]\)]$/,
    },
};

export const exoStreamLanguage = StreamLanguage.define(exoParser);

const exoHighlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: 'var(--exo-keyword, #c084fc)', fontWeight: '600' },
    { tag: t.atom, color: 'var(--exo-atom, #f59e0b)' },
    { tag: t.number, color: 'var(--exo-number, #f97316)' },
    { tag: t.string, color: 'var(--exo-string, #34d399)' },
    { tag: t.comment, color: 'var(--exo-comment, #64748b)', fontStyle: 'italic' },
    { tag: t.lineComment, color: 'var(--exo-comment, #64748b)', fontStyle: 'italic' },
    { tag: t.typeName, color: 'var(--exo-type, #38bdf8)' },
    { tag: t.propertyName, color: 'var(--exo-property, #facc15)' },
    { tag: t.function(t.variableName), color: 'var(--exo-function, #60a5fa)' },
    { tag: t.variableName, color: 'var(--exo-var, #e2e8f0)' },
    { tag: t.operator, color: 'var(--exo-operator, #f472b6)' },
    { tag: t.punctuation, color: 'var(--exo-punct, #94a3b8)' },
    { tag: t.annotation, color: 'var(--exo-annotation, #fb7185)', fontWeight: '600' },
]);

export function exoLanguageExtension(): Extension[] {
    return [exoStreamLanguage, syntaxHighlighting(exoHighlightStyle)];
}
