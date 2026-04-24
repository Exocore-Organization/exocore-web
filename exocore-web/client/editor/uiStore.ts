import { create } from 'zustand';
import type { SidebarTab, BottomPanel } from '../../types/editor';

interface UIStore {
    sidebarVisible: boolean;
    sidebarWidth: number;
    activeSidebarTab: SidebarTab;
    bottomPanel: BottomPanel;
    showSettings: boolean;
    showWebview: boolean;
    isMobile: boolean;
    webviewUrl: string | null;
    tunnelUrl: string | null;
    setSidebarVisible: (visible: boolean) => void;
    setSidebarWidth: (width: number) => void;
    setActiveSidebarTab: (tab: SidebarTab) => void;
    setBottomPanel: (panel: BottomPanel) => void;
    setShowSettings: (show: boolean) => void;
    setShowWebview: (show: boolean) => void;
    setIsMobile: (mobile: boolean) => void;
    setWebviewUrl: (url: string | null) => void;
    setTunnelUrl: (url: string | null) => void;
    togglePanel: (panel: Exclude<BottomPanel, 'none'>) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
    sidebarVisible: window.innerWidth > 768,
    sidebarWidth: 260,
    activeSidebarTab: 'explorer',
    bottomPanel: 'none',
    showSettings: false,
    showWebview: false,
    isMobile: window.innerWidth <= 768,
    webviewUrl: null,
    tunnelUrl: null,
    setSidebarVisible: (visible: boolean) => set({ sidebarVisible: visible }),
    setSidebarWidth: (width: number) => set({ sidebarWidth: width }),
    setActiveSidebarTab: (tab: SidebarTab) => set({ activeSidebarTab: tab }),
    setBottomPanel: (panel: BottomPanel) => set({ bottomPanel: panel }),
    setShowSettings: (show: boolean) => set({ showSettings: show }),
    setShowWebview: (show: boolean) => set({ showWebview: show }),
    setIsMobile: (mobile: boolean) => set({ isMobile: mobile }),
    setWebviewUrl: (url: string | null) => set({ webviewUrl: url }),
    setTunnelUrl: (url: string | null) => set({ tunnelUrl: url }),
    togglePanel: (panel: Exclude<BottomPanel, 'none'>) => {
        const { bottomPanel, isMobile, setSidebarVisible } = get();
        set({ bottomPanel: bottomPanel === panel ? 'none' : panel });
        if (isMobile) setSidebarVisible(false);
    },
}));
