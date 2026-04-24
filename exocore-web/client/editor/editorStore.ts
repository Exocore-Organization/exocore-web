import { create } from 'zustand';
import type { FileNode } from '../../types/editor';

interface EditorStore {
    activeFile: FileNode | null;
    content: string;
    isLoading: boolean;
    isSaving: boolean;
    currentTheme: string;
    wordWrap: boolean;
    setActiveFile: (file: FileNode | null, content: string) => void;
    setContent: (content: string) => void;
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    setTheme: (theme: string) => void;
    setWordWrap: (wrap: boolean) => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
    activeFile: null,
    content: '',
    isLoading: true,
    isSaving: false,
    currentTheme: 'cursor-dark',
    wordWrap: false,
    setActiveFile: (file: FileNode | null, content: string) => set({ activeFile: file, content }),
    setContent: (content: string) => set({ content }),
    setLoading: (loading: boolean) => set({ isLoading: loading }),
    setSaving: (saving: boolean) => set({ isSaving: saving }),
    setTheme: (theme: string) => set({ currentTheme: theme }),
    setWordWrap: (wrap: boolean) => set({ wordWrap: wrap }),
}));
