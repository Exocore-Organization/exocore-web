import React from 'react';
import {
    SiJavascript, SiTypescript, SiReact, SiHtml5, SiSass,
    SiJson, SiYaml, SiPython, SiC, SiCplusplus,
    SiGo, SiRust, SiGnubash, SiDocker, SiVite, SiVuedotjs, SiNextdotjs,
    SiSvelte, SiMongodb, SiRedis, SiPostgresql, SiGit, SiNodedotjs,
    SiMarkdown, SiXml, SiPrisma, SiGraphql, SiKotlin, SiSwift, SiDart,
    SiLua, SiPerl, SiScala, SiElixir, SiHaskell, SiSolidity,
    SiToml, SiNginx, SiAstro, SiRemix, SiDeno, SiBun, SiNpm, SiNuxt,
    SiR
} from 'react-icons/si';
import { FaJava, FaCss3, FaPhp, FaKey, FaCube, FaCode, FaCross } from 'react-icons/fa';
import {
    VscFile, VscTerminal, VscSettingsGear, VscLock
} from 'react-icons/vsc';

export interface IconConfig {
    icon: React.ReactNode;
    color: string;
}

type IconProps = { size?: number | string; color?: string; style?: React.CSSProperties };

const ExoIcon: React.FC<IconProps> = ({ size = 14, style }) => (
    <img
        src="/exocore/exo-icon.png"
        alt=".exo"
        width={typeof size === 'number' ? size : undefined}
        height={typeof size === 'number' ? size : undefined}
        style={{ display: 'inline-block', objectFit: 'contain', ...(style || {}) }}
        draggable={false}
    />
);

const EXT_MAP: Record<string, IconConfig> = {
    js:         { icon: <SiJavascript />,  color: '#f7df1e' },
    mjs:        { icon: <SiJavascript />,  color: '#f7df1e' },
    cjs:        { icon: <SiJavascript />,  color: '#f7df1e' },
    jsx:        { icon: <SiReact />,       color: '#61dafb' },
    ts:         { icon: <SiTypescript />,  color: '#3178c6' },
    tsx:        { icon: <SiReact />,       color: '#2d79c7' },
    html:       { icon: <SiHtml5 />,       color: '#e34f26' },
    htm:        { icon: <SiHtml5 />,       color: '#e34f26' },
    css:        { icon: <FaCss3 />,        color: '#1572b6' },
    scss:       { icon: <SiSass />,        color: '#c6538c' },
    sass:       { icon: <SiSass />,        color: '#c6538c' },
    less:       { icon: <FaCss3 />,        color: '#1d365d' },
    json:       { icon: <SiJson />,        color: '#ff9e64' },
    json5:      { icon: <SiJson />,        color: '#ff9e64' },
    yaml:       { icon: <SiYaml />,        color: '#cb171e' },
    yml:        { icon: <SiYaml />,        color: '#cb171e' },
    xml:        { icon: <SiXml />,         color: '#ff6600' },
    md:         { icon: <SiMarkdown />,    color: '#a9b1d6' },
    mdx:        { icon: <SiMarkdown />,    color: '#a9b1d6' },
    php:        { icon: <FaPhp />,         color: '#777bb4' },
    py:         { icon: <SiPython />,      color: '#3776ab' },
    pyw:        { icon: <SiPython />,      color: '#3776ab' },
    java:       { icon: <FaJava />,        color: '#f89820' },
    c:          { icon: <SiC />,           color: '#a8b9cc' },
    h:          { icon: <SiC />,           color: '#a8b9cc' },
    cpp:        { icon: <SiCplusplus />,   color: '#00599c' },
    cc:         { icon: <SiCplusplus />,   color: '#00599c' },
    cxx:        { icon: <SiCplusplus />,   color: '#00599c' },
    hpp:        { icon: <SiCplusplus />,   color: '#00599c' },
    cs:         { icon: <FaCode />,        color: '#178600' },
    go:         { icon: <SiGo />,          color: '#00add8' },
    rs:         { icon: <SiRust />,        color: '#dea584' },
    sh:         { icon: <SiGnubash />,     color: '#4ebd31' },
    bash:       { icon: <SiGnubash />,     color: '#4ebd31' },
    zsh:        { icon: <SiGnubash />,     color: '#4ebd31' },
    bat:        { icon: <VscTerminal />,   color: '#c1f12e' },
    cmd:        { icon: <VscTerminal />,   color: '#c1f12e' },
    sql:        { icon: <SiPostgresql />,  color: '#4169e1' },
    kt:         { icon: <SiKotlin />,      color: '#7f52ff' },
    kts:        { icon: <SiKotlin />,      color: '#7f52ff' },
    swift:      { icon: <SiSwift />,       color: '#f05138' },
    dart:       { icon: <SiDart />,        color: '#0175c2' },
    lua:        { icon: <SiLua />,         color: '#000080' },
    pl:         { icon: <SiPerl />,        color: '#39457e' },
    pm:         { icon: <SiPerl />,        color: '#39457e' },
    r:          { icon: <SiR />,           color: '#276dc3' },
    scala:      { icon: <SiScala />,       color: '#dc322f' },
    ex:         { icon: <SiElixir />,      color: '#6e4a7e' },
    exs:        { icon: <SiElixir />,      color: '#6e4a7e' },
    hs:         { icon: <SiHaskell />,     color: '#5d4f85' },
    sol:        { icon: <SiSolidity />,    color: '#636363' },
    toml:       { icon: <SiToml />,        color: '#9c4121' },
    prisma:     { icon: <SiPrisma />,      color: '#2d3748' },
    graphql:    { icon: <SiGraphql />,     color: '#e10098' },
    gql:        { icon: <SiGraphql />,     color: '#e10098' },
    vue:        { icon: <SiVuedotjs />,    color: '#42b883' },
    svelte:     { icon: <SiSvelte />,      color: '#ff3e00' },
    hc:         { icon: <FaCross />,       color: '#ffd700' },
    lock:       { icon: <VscLock />,       color: '#565f89' },
    env:        { icon: <FaKey />,         color: '#ffeb3b' },
    log:        { icon: <VscFile />,       color: '#6b7280' },
    exo:        { icon: <ExoIcon />,       color: '#7c5cff' },
};

const FILENAME_MAP: Record<string, IconConfig> = {
    'main.hc':             { icon: <FaCross />,          color: '#ffd700' },
    'dockerfile':          { icon: <SiDocker />,         color: '#2496ed' },
    'docker-compose.yml':  { icon: <SiDocker />,         color: '#2496ed' },
    'docker-compose.yaml': { icon: <SiDocker />,         color: '#2496ed' },
    '.env':                { icon: <FaKey />,            color: '#ffeb3b' },
    '.env.local':          { icon: <FaKey />,            color: '#ffeb3b' },
    '.env.production':     { icon: <FaKey />,            color: '#ffeb3b' },
    '.env.development':    { icon: <FaKey />,            color: '#ffeb3b' },
    'package.json':        { icon: <SiNpm />,            color: '#cb3837' },
    'package-lock.json':   { icon: <SiNpm />,            color: '#cb3837' },
    'tsconfig.json':       { icon: <SiTypescript />,     color: '#3178c6' },
    'tsconfig.node.json':  { icon: <SiTypescript />,     color: '#3178c6' },
    'tsconfig.server.json':{ icon: <SiTypescript />,     color: '#3178c6' },
    'vite.config.ts':      { icon: <SiVite />,           color: '#646cff' },
    'vite.config.js':      { icon: <SiVite />,           color: '#646cff' },
    '.gitignore':          { icon: <SiGit />,            color: '#f54d27' },
    '.gitattributes':      { icon: <SiGit />,            color: '#f54d27' },
    'nginx.conf':          { icon: <SiNginx />,          color: '#009900' },
    'node_modules':        { icon: <SiNodedotjs />,      color: '#8cc84b' },
    'bun.lockb':           { icon: <SiBun />,            color: '#fbf0df' },
    'deno.json':           { icon: <SiDeno />,           color: '#70ffaf' },
    'deno.lock':           { icon: <SiDeno />,           color: '#70ffaf' },
    'astro.config.mjs':    { icon: <SiAstro />,          color: '#ff5d01' },
    'nuxt.config.ts':      { icon: <SiNuxt />,           color: '#00dc82' },
    'nuxt.config.js':      { icon: <SiNuxt />,           color: '#00dc82' },
    'remix.config.js':     { icon: <SiRemix />,          color: '#d0d0d0' },
    'svelte.config.js':    { icon: <SiSvelte />,         color: '#ff3e00' },
    'schema.prisma':       { icon: <SiPrisma />,         color: '#2d3748' },
    'next.config.js':      { icon: <SiNextdotjs />,      color: '#ffffff' },
    'next.config.ts':      { icon: <SiNextdotjs />,      color: '#ffffff' },
    'next.config.mjs':     { icon: <SiNextdotjs />,      color: '#ffffff' },
    'cargo.toml':          { icon: <SiRust />,           color: '#dea584' },
    'cargo.lock':          { icon: <SiRust />,           color: '#dea584' },
    '.eslintrc':           { icon: <VscSettingsGear />,  color: '#4b32c3' },
    '.eslintrc.json':      { icon: <VscSettingsGear />,  color: '#4b32c3' },
    '.eslintrc.js':        { icon: <VscSettingsGear />,  color: '#4b32c3' },
    '.prettierrc':         { icon: <VscSettingsGear />,  color: '#f7b93e' },
    '.prettierrc.json':    { icon: <VscSettingsGear />,  color: '#f7b93e' },
    'tailwind.config.js':  { icon: <VscSettingsGear />,  color: '#38bdf8' },
    'tailwind.config.ts':  { icon: <VscSettingsGear />,  color: '#38bdf8' },
    'jest.config.js':      { icon: <FaCube />,           color: '#c21325' },
    'jest.config.ts':      { icon: <FaCube />,           color: '#c21325' },
    'vitest.config.ts':    { icon: <SiVite />,           color: '#646cff' },
    'webpack.config.js':   { icon: <FaCube />,           color: '#8dd6f9' },
    'rollup.config.js':    { icon: <FaCube />,           color: '#ff3333' },
    'redis.conf':          { icon: <SiRedis />,          color: '#dc382d' },
    'mongo.js':            { icon: <SiMongodb />,        color: '#47a248' },
    'system.exo':          { icon: <ExoIcon />,          color: '#7c5cff' },
};

export const getLanguageIcon = (filename: string, size: number = 14): React.ReactNode => {
    const lower = filename.toLowerCase();

    const exactMatch = FILENAME_MAP[lower];
    if (exactMatch) {
        return React.cloneElement(
            exactMatch.icon as React.ReactElement<IconProps>,
            { size, color: exactMatch.color, style: { color: exactMatch.color, fontSize: size } },
        );
    }

    const extDotIdx = lower.lastIndexOf('.');
    if (extDotIdx !== -1) {
        const ext = lower.slice(extDotIdx + 1);
        const extMatch = EXT_MAP[ext];
        if (extMatch) {
            return React.cloneElement(
                extMatch.icon as React.ReactElement<IconProps>,
                { size, color: extMatch.color, style: { color: extMatch.color, fontSize: size } },
            );
        }
    }

    return <VscFile size={size} color="#a9b1d6" />;
};

export const getLanguageColor = (filename: string): string => {
    const lower = filename.toLowerCase();
    const exactMatch = FILENAME_MAP[lower];
    if (exactMatch) return exactMatch.color;
    const ext = lower.split('.').pop() ?? '';
    return EXT_MAP[ext]?.color ?? '#a9b1d6';
};
