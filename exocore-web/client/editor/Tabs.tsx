import React from 'react';
import {
    Image as ImageIcon, Video, Music, ChevronRight
} from 'lucide-react';
import type { FileNode, FileType, EditorTheme } from '../../types/editor';
import { getLanguageIcon } from '../shared/components/IconLanguage';

interface TabsProps {
    activeFile: FileNode | null;
    activeFileType: FileType;
    theme: EditorTheme;
    projectId: string | null;
}

export const Tabs: React.FC<TabsProps> = ({ activeFile, activeFileType, theme: active, projectId }) => {
    if (!activeFile) return null;

    const iconNode = activeFileType === 'code'
        ? getLanguageIcon(activeFile.name, 14)
        : activeFileType === 'image'
            ? <ImageIcon size={14} style={{ color: '#00e676' }} />
            : activeFileType === 'video'
                ? <Video size={14} style={{ color: '#ff5555' }} />
                : <Music size={14} style={{ color: '#bd93f9' }} />;

    return (
        <div
            className="file-header"
            style={{ background: active.bg }}
        >
            <div className="tab-pill" style={{ color: active.textMain }}>
                {iconNode}
                <span className="notranslate" translate="no">{activeFile.name}</span>
            </div>
            <div className="breadcrumb-path notranslate" translate="no">
                {projectId ?? 'exocore'}
                <ChevronRight size={11} style={{ margin: '0 4px', opacity: 0.5 }} />
                {activeFile.path}
            </div>
        </div>
    );
};
