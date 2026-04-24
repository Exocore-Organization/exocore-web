export type { FileNode } from '../../types/editor';
export { useEditorStore } from './editorStore';
export { useFileStore } from './fileStore';
export { useUIStore } from './uiStore';

import { useEditorStore } from './editorStore';
import { useFileStore } from './fileStore';
import type { FileNode } from '../../types/editor';

export const useCombinedEditorStore = () => {
    const editor = useEditorStore();
    const files = useFileStore();
    return {
        ...editor,
        files: files.files,
        setFiles: files.setFiles,
    };
};

export const useLegacyEditorStore = () => {
    const editor = useEditorStore();
    const fileStore = useFileStore();
    return {
        files: fileStore.files,
        activeFile: editor.activeFile,
        content: editor.content,
        isLoading: editor.isLoading,
        isSaving: editor.isSaving,
        currentTheme: editor.currentTheme,
        wordWrap: editor.wordWrap,
        setFiles: fileStore.setFiles,
        setActiveFile: (file: FileNode | null, content: string) => editor.setActiveFile(file, content),
        setContent: editor.setContent,
        setLoading: editor.setLoading,
        setSaving: editor.setSaving,
        setTheme: editor.setTheme,
        setWordWrap: editor.setWordWrap,
    };
};
