import React from 'react';
import {
    SiAstro, SiBun, SiDeno, SiNestjs, SiExpress, SiFastify, SiHono, SiKoa,
    SiNextdotjs, SiNuxt, SiRemix, SiSvelte, SiVuedotjs, SiSolid,
    SiReact, SiAngular, SiPreact, SiQwik, SiGatsby,
    SiPython, SiRust, SiNodedotjs, SiTypescript, SiJavascript, SiPhp,
    SiC, SiCplusplus, SiGo, SiKotlin, SiSwift, SiLua, SiRuby, SiR, SiElixir,
    SiHaskell, SiDart, SiElectron, SiHtml5, SiTauri,
    SiDiscord, SiTelegram, SiWhatsapp, SiOpenai, SiGodotengine,
} from 'react-icons/si';
import { FaJava, FaCode, FaCross, FaRobot, FaFile } from 'react-icons/fa';

type IconProps = { size?: number; color?: string };

const ICON_MAP: Record<string, { icon: React.ReactElement<IconProps>; color: string }> = {
    astro:      { icon: <SiAstro />,        color: '#ff5d01' },
    bun:        { icon: <SiBun />,          color: '#fbf0df' },
    deno:       { icon: <SiDeno />,         color: '#ffffff' },
    nestjs:     { icon: <SiNestjs />,       color: '#e0234e' },
    express:    { icon: <SiExpress />,      color: '#ffffff' },
    fastify:    { icon: <SiFastify />,      color: '#ffffff' },
    hono:       { icon: <SiHono />,         color: '#e36002' },
    koa:        { icon: <SiKoa />,          color: '#33333d' },
    nextjs:     { icon: <SiNextdotjs />,    color: '#ffffff' },
    nuxt:       { icon: <SiNuxt />,         color: '#00dc82' },
    remix:      { icon: <SiRemix />,        color: '#ffffff' },
    sveltekit:  { icon: <SiSvelte />,       color: '#ff3e00' },
    svelte:     { icon: <SiSvelte />,       color: '#ff3e00' },
    vue:        { icon: <SiVuedotjs />,     color: '#42b883' },
    solid:      { icon: <SiSolid />,        color: '#2c4f7c' },
    react:      { icon: <SiReact />,        color: '#61dafb' },
    angular:    { icon: <SiAngular />,      color: '#dd0031' },
    preact:     { icon: <SiPreact />,       color: '#673ab8' },
    qwik:       { icon: <SiQwik />,         color: '#ac7ef4' },
    gatsby:     { icon: <SiGatsby />,       color: '#663399' },
    python:     { icon: <SiPython />,       color: '#3776ab' },
    rust:       { icon: <SiRust />,         color: '#dea584' },
    node:       { icon: <SiNodedotjs />,    color: '#8cc84b' },
    typescript: { icon: <SiTypescript />,   color: '#3178c6' },
    js:         { icon: <SiJavascript />,   color: '#f7df1e' },
    php:        { icon: <SiPhp />,          color: '#777bb4' },
    c:          { icon: <SiC />,            color: '#a8b9cc' },
    cpp:        { icon: <SiCplusplus />,    color: '#00599c' },
    csharp:     { icon: <FaCode />,         color: '#9b4f96' },
    go:         { icon: <SiGo />,           color: '#00add8' },
    java:       { icon: <FaJava />,         color: '#f89820' },
    kotlin:     { icon: <SiKotlin />,       color: '#7f52ff' },
    swift:      { icon: <SiSwift />,        color: '#f05138' },
    lua:        { icon: <SiLua />,          color: '#5a8eff' },
    ruby:       { icon: <SiRuby />,         color: '#cc342d' },
    r:          { icon: <SiR />,            color: '#276dc3' },
    elixir:     { icon: <SiElixir />,       color: '#a779cb' },
    haskell:    { icon: <SiHaskell />,      color: '#5d4f85' },
    dart:       { icon: <SiDart />,         color: '#0175c2' },
    electron:   { icon: <SiElectron />,     color: '#47848f' },
    tauri:      { icon: <SiTauri />,        color: '#ffc131' },
    html:       { icon: <SiHtml5 />,        color: '#e34f26' },
    holyc:      { icon: <FaCross />,        color: '#ffd700' },
    discord:    { icon: <SiDiscord />,      color: '#5865f2' },
    telegram:   { icon: <SiTelegram />,     color: '#26a5e4' },
    whatsapp:   { icon: <SiWhatsapp />,     color: '#25d366' },
    openai:     { icon: <SiOpenai />,       color: '#10a37f' },
    godot:      { icon: <SiGodotengine />,  color: '#478cbf' },
    bot:        { icon: <FaRobot />,        color: '#a3a3a3' },
};

export const getTemplateIcon = (
    iconKey: string | undefined,
    language: string | undefined,
    size: number = 22,
): React.ReactNode => {
    const key = (iconKey || language || '').toLowerCase();
    const entry = ICON_MAP[key];
    if (entry) {
        return React.cloneElement(entry.icon, {
            size,
            color: entry.color,
            style: { color: entry.color, fontSize: size },
        } as IconProps & { style: React.CSSProperties });
    }
    return <FaFile size={size} color="#a9b1d6" style={{ color: '#a9b1d6', fontSize: size }} />;
};

export interface TemplateCategory {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
    { id: 'web',      label: 'Web Application',  description: 'React, Vue, Svelte, Astro and more', icon: <SiReact />,        color: '#61dafb' },
    { id: 'backend',  label: 'API / Backend',    description: 'Express, Fastify, FastAPI, Django',  icon: <SiNodedotjs />,    color: '#8cc84b' },
    { id: 'app',      label: 'Mobile / Desktop', description: 'Expo, Flutter, Electron, Tauri',     icon: <SiElectron />,     color: '#47848f' },
    { id: 'language', label: 'Language Starter', description: 'Pure C, Go, Java, Rust, Python…',    icon: <FaCode />,         color: '#FFE500' },
    { id: 'game',     label: 'Game',             description: 'Pygame, Phaser, LÖVE, Godot',        icon: <SiGodotengine />,  color: '#478cbf' },
    { id: 'aibot',    label: 'AI / Bot',         description: 'OpenAI, Discord, Telegram, WhatsApp', icon: <FaRobot />,       color: '#10a37f' },
];
