export interface DevConfig {
    user: string;
    pass: string;
}


export function defineConfig(config: DevConfig): DevConfig {
    return config;
}
