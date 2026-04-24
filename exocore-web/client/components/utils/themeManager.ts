import axios from 'axios';

export const initTheme = async () => {
    
    setTheme("modern", false);
};

export const setTheme = async (_theme: string, save: boolean = true) => {
    
    document.body.className = `theme-modern`;

    if (save) {
        await updateSettings({ theme: "modern" });
    }
};

export const updateSettings = async (newData: object) => {
    try {
        const current = JSON.parse(localStorage.getItem("exo_settings") || "{}");
        const merged = { ...current, ...newData };
        localStorage.setItem("exo_settings", JSON.stringify(merged));

        await axios.post('/exocore/api/settings', merged);
    } catch (e) {
        console.error("Failed to sync settings:", e);
    }
};
