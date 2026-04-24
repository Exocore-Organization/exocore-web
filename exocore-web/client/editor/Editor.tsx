import React, { useRef, useEffect } from 'react';
import MonacoEditor, { Monaco } from '@monaco-editor/react';
import { Image as ImageIcon, Video, Music, Code2 } from 'lucide-react';
import type { FileNode, FileType, EditorTheme } from '../../types/editor';
import type * as MonacoType from 'monaco-editor';

interface DiagnosticMarker {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    message: string;
    severity: number;
}

interface EditorProps {
    activeFile: FileNode | null;
    activeFileType: FileType;
    content: string;
    onChange: (val: string) => void;
    currentTheme: string;
    wordWrap: boolean;
    isMobile: boolean;
    projectId: string | null;
    theme: EditorTheme;
    markers: DiagnosticMarker[];
    onEditorMount: (editor: MonacoType.editor.IStandaloneCodeEditor) => void;
}

const LANG_MAP: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    mjs: 'javascript', cjs: 'javascript',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    json: 'json', json5: 'json',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml',
    md: 'markdown', mdx: 'markdown',
    exo: 'exo',
    py: 'python', pyw: 'python',
    php: 'php',
    java: 'java',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql',
    graphql: 'graphql', gql: 'graphql',
    kt: 'kotlin',
    swift: 'swift',
    rb: 'ruby',
    lua: 'lua',
    r: 'r',
};

export const getMonacoLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return LANG_MAP[ext] ?? 'plaintext';
};

export const Editor: React.FC<EditorProps> = ({
    activeFile, activeFileType, content, onChange,
    currentTheme, wordWrap, isMobile,
    projectId, onEditorMount,
}) => {
    const editorWrapperRef = useRef<HTMLDivElement>(null);
    const editorInstanceRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
        if (!editorWrapperRef.current || activeFileType !== 'code') return;
        const observer = new ResizeObserver(() => {
            if (editorInstanceRef.current && (editorWrapperRef.current?.clientHeight ?? 0) > 0) {
                editorInstanceRef.current.layout();
            }
        });
        observer.observe(editorWrapperRef.current);
        return () => observer.disconnect();
    }, [activeFile, activeFileType]);

    const handleMount = (editor: MonacoType.editor.IStandaloneCodeEditor) => {
        editorInstanceRef.current = editor;
        onEditorMount(editor);
        requestAnimationFrame(() => editor.layout());
        setTimeout(() => editor.layout(), 250);
    };

    const handleBeforeMount = (monaco: Monaco) => {
        const already = monaco.languages.getLanguages().some(l => l.id === 'exo');
        if (already) return;
        monaco.languages.register({ id: 'exo', extensions: ['.exo'], aliases: ['Exo', 'exo'] });
        monaco.languages.setMonarchTokensProvider('exo', {
            defaultToken: '',
            tokenPostfix: '.exo',
            keywords: [
                'module','import','export','from','as','function','fn','def','return','yield','await','async',
                'if','else','elif','unless','switch','case','default','match','when','for','while','do','loop',
                'break','continue','in','of','class','struct','enum','interface','trait','extends','implements',
                'new','this','self','super','try','catch','finally','throw','raise','use','using','with','let',
                'var','const','val','mut','public','private','protected','static','final','abstract','system',
                'service','config','route','handler','event','on','emit','pipeline','stage','task','step',
                'depends','requires','provides',
            ],
            atoms: ['true','false','null','nil','none','undefined','void'],
            types: [
                'string','number','int','float','bool','boolean','array','list','map','dict','object','any','unknown',
                'u8','u16','u32','u64','i8','i16','i32','i64','f32','f64',
            ],
            symbols: /[=><!~?:&|+\-*\/\^%]+/,
            tokenizer: {
                root: [
                    [/\[[A-Za-z_][\w-]*\]/, 'metatag'],
                    [/@[a-zA-Z_]\w*/, 'annotation'],
                    [/[A-Z][\w$]*/, 'type.identifier'],
                    [/[a-zA-Z_$][\w$]*/, {
                        cases: {
                            '@keywords': 'keyword',
                            '@atoms': 'constant',
                            '@types': 'type',
                            '@default': 'identifier',
                        },
                    }],
                    [/\d+\.\d+([eE][\-+]?\d+)?/, 'number.float'],
                    [/0[xX][0-9a-fA-F]+/, 'number.hex'],
                    [/\d+/, 'number'],
                    [/"([^"\\]|\\.)*$/, 'string.invalid'],
                    [/"/, { token: 'string.quote', next: '@string_dq' }],
                    [/'/, { token: 'string.quote', next: '@string_sq' }],
                    [/`/, { token: 'string.quote', next: '@string_bt' }],
                    [/\/\/.*$/, 'comment'],
                    [/#.*$/, 'comment'],
                    [/--.*$/, 'comment'],
                    [/\/\*/, { token: 'comment.quote', next: '@block_comment' }],
                    [/[{}()\[\]]/, '@brackets'],
                    [/[;,.]/, 'delimiter'],
                    [/@symbols/, 'operator'],
                ],
                string_dq: [
                    [/[^\\"]+/, 'string'],
                    [/\\./, 'string.escape'],
                    [/"/, { token: 'string.quote', next: '@pop' }],
                ],
                string_sq: [
                    [/[^\\']+/, 'string'],
                    [/\\./, 'string.escape'],
                    [/'/, { token: 'string.quote', next: '@pop' }],
                ],
                string_bt: [
                    [/[^\\`]+/, 'string'],
                    [/\\./, 'string.escape'],
                    [/`/, { token: 'string.quote', next: '@pop' }],
                ],
                block_comment: [
                    [/[^*]+/, 'comment'],
                    [/\*\//, { token: 'comment.quote', next: '@pop' }],
                    [/./, 'comment'],
                ],
            },
        } as MonacoType.languages.IMonarchLanguage);
        monaco.languages.setLanguageConfiguration('exo', {
            comments: { lineComment: '//', blockComment: ['/*', '*/'] },
            brackets: [['{','}'],['[',']'],['(',')']],
            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: "'", close: "'" },
                { open: '`', close: '`' },
            ],
        });
        monaco.editor.defineTheme('exo-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'metatag', foreground: 'fb7185', fontStyle: 'bold' },
                { token: 'annotation', foreground: 'fb7185', fontStyle: 'bold' },
                { token: 'keyword', foreground: 'c084fc', fontStyle: 'bold' },
                { token: 'type', foreground: '38bdf8' },
                { token: 'type.identifier', foreground: '38bdf8' },
                { token: 'constant', foreground: 'f59e0b' },
                { token: 'number', foreground: 'f97316' },
                { token: 'string', foreground: '34d399' },
                { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
                { token: 'operator', foreground: 'f472b6' },
            ],
            colors: {},
        });
    };

    if (!activeFile) {
        return (
            <div className="empty-state">
                <Code2 size={64} style={{ opacity: 0.05 }} />
                <div style={{ marginTop: 15, opacity: 0.3, fontSize: 12, letterSpacing: 2 }}>
                    SELECT A FILE
                </div>
            </div>
        );
    }

    const mediaUrl = `/exocore/api/editor/coding/media?projectId=${projectId}&filePath=${encodeURIComponent(activeFile.path)}`;

    return (
        <div className="editor-wrapper">
            <div
                ref={editorWrapperRef}
                style={{
                    flex: 1, minHeight: 0, width: '100%',
                    position: 'relative', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                {activeFileType === 'code' && (
                    <MonacoEditor
                        height="100%"
                        width="100%"
                        language={getMonacoLanguage(activeFile.name)}
                        theme={getMonacoLanguage(activeFile.name) === 'exo' ? 'exo-dark' : currentTheme}
                        value={content}
                        onChange={(val) => onChange(val ?? '')}
                        beforeMount={handleBeforeMount}
                        onMount={handleMount}
                        options={{
                            automaticLayout: false,
                            wordWrap: wordWrap ? 'on' : 'off',
                            minimap: { enabled: false },
                            lineNumbers: isMobile ? 'off' : 'on',
                            lineNumbersMinChars: 3,
                            glyphMargin: false,
                            folding: false,
                            scrollBeyondLastLine: false,
                            renderLineHighlight: 'all',
                            padding: { top: 10, bottom: 10 },
                            fontSize: isMobile ? 14 : 13,
                            lineHeight: isMobile ? 22 : 20,
                            scrollbar: {
                                verticalScrollbarSize: isMobile ? 8 : 10,
                                horizontalScrollbarSize: isMobile ? 8 : 10,
                            },
                            overviewRulerLanes: 0,
                            hideCursorInOverviewRuler: true,
                            occurrencesHighlight: 'off',
                            contextmenu: !isMobile,
                        }}
                    />
                )}
                {activeFileType === 'image' && (
                    <div style={{ width: '100%', height: '100%', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.1)' }}>
                        <img src={mediaUrl} alt={activeFile.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }} />
                    </div>
                )}
                {activeFileType === 'video' && (
                    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
                        <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                    </div>
                )}
                {activeFileType === 'audio' && (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.1)' }}>
                        <Music size={64} style={{ opacity: 0.2, marginBottom: '20px' }} />
                        <audio controls src={mediaUrl} style={{ width: '80%', maxWidth: '400px' }} />
                    </div>
                )}
            </div>
        </div>
    );
};

export { ImageIcon, Video };
