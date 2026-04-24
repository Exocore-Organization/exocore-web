import { create } from 'zustand';
import type { FileNode } from '../../types/editor';

interface FileStore {
    files: FileNode[];
    setFiles: (files: FileNode[]) => void;
    clearFiles: () => void;
}

export const useFileStore = create<FileStore>((set) => ({
    files: [],
    setFiles: (files: FileNode[]) => set({ files }),
    clearFiles: () => set({ files: [] }),
}));
