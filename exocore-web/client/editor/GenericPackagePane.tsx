import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Package2, Terminal, ExternalLink, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

interface GenericPackagePaneProps {
    projectId: string;
    theme: any;
    language: string;
    runtime: string;
}

interface LangInfo {
    title: string;
    install: string;
    list: string;
    docs: string;
    note: string;
}

const LANG_INFO: Record<string, LangInfo> = {
    rust: {
        title: 'Cargo (Rust)',
        install: 'cargo add <crate>',
        list: 'cat Cargo.toml',
        docs: 'https://crates.io',
        note: 'Use the terminal to manage Rust crates with Cargo.',
    },
    go: {
        title: 'Go Modules',
        install: 'go get <module>',
        list: 'cat go.sum',
        docs: 'https://pkg.go.dev',
        note: 'Use the terminal to manage Go dependencies.',
    },
    java: {
        title: 'Maven / Gradle (Java)',
        install: 'Edit pom.xml or build.gradle',
        list: 'mvn dependency:tree',
        docs: 'https://central.sonatype.com',
        note: 'Add dependencies to your build file.',
    },
    ruby: {
        title: 'Bundler (Ruby)',
        install: 'bundle add <gem>',
        list: 'bundle list',
        docs: 'https://rubygems.org',
        note: 'Use Bundler to manage Ruby gems.',
    },
    php: {
        title: 'Composer (PHP)',
        install: 'composer require <package>',
        list: 'composer show',
        docs: 'https://packagist.org',
        note: 'Use Composer for PHP packages.',
    },
    elixir: {
        title: 'Mix (Elixir)',
        install: 'Edit mix.exs deps',
        list: 'mix deps',
        docs: 'https://hex.pm',
        note: 'Add dependencies to mix.exs and run mix deps.get.',
    },
    c: {
        title: 'C Libraries',
        install: 'apt install lib<name>-dev',
        list: 'pkg-config --list-all',
        docs: 'https://en.cppreference.com/w/c',
        note: 'C libraries are usually installed via the system package manager.',
    },
    cpp: {
        title: 'C++ Libraries',
        install: 'apt install lib<name>-dev / vcpkg install <pkg>',
        list: 'pkg-config --list-all',
        docs: 'https://en.cppreference.com',
        note: 'Use vcpkg, conan, or system packages for C++ libraries.',
    },
    csharp: {
        title: 'NuGet (.NET)',
        install: 'dotnet add package <name>',
        list: 'dotnet list package',
        docs: 'https://www.nuget.org',
        note: 'Use the dotnet CLI to manage NuGet packages.',
    },
    haskell: {
        title: 'Cabal / Stack (Haskell)',
        install: 'cabal install <package>',
        list: 'cabal list --installed',
        docs: 'https://hackage.haskell.org',
        note: 'Use Cabal or Stack to manage Haskell packages.',
    },
    swift: {
        title: 'Swift Package Manager',
        install: 'Edit Package.swift',
        list: 'swift package show-dependencies',
        docs: 'https://swiftpackageindex.com',
        note: 'Add dependencies to your Package.swift file.',
    },
    kotlin: {
        title: 'Gradle (Kotlin)',
        install: 'Edit build.gradle.kts',
        list: 'gradle dependencies',
        docs: 'https://search.maven.org',
        note: 'Add dependencies to build.gradle.kts.',
    },
    deno: {
        title: 'Deno Modules',
        install: 'import from URL or use deno.json',
        list: 'cat deno.json',
        docs: 'https://deno.land/x',
        note: 'Deno imports modules directly from URLs or via import maps.',
    },
};

interface DepInfo { name: string; version?: string; used: boolean; }

const SUPPORTED_LIST = new Set(['rust', 'go', 'java', 'ruby', 'php']);

export const GenericPackagePane: React.FC<GenericPackagePaneProps> = ({ projectId, theme, language, runtime }) => {
    const info = LANG_INFO[runtime] || LANG_INFO[language] || {
        title: `${language} packages`,
        install: '# Use the project terminal to install packages',
        list: '# Check your project files',
        docs: 'https://www.google.com',
        note: 'Package management for this language is best done from the terminal.',
    };

    const canList = SUPPORTED_LIST.has(language) || SUPPORTED_LIST.has(runtime);
    const [deps, setDeps] = useState<DepInfo[]>([]);
    const [loading, setLoading] = useState(false);

    const loadDeps = useCallback(async () => {
        if (!canList) return;
        setLoading(true);
        try {
            const { rpc } = await import('../access/rpcClient');
            const res = await rpc.call<any>('deps.list', { projectId, language, runtime });
            setDeps(res?.packages || []);
        } catch { setDeps([]); }
        finally { setLoading(false); }
    }, [projectId, language, runtime, canList]);

    useEffect(() => { loadDeps(); }, [loadDeps]);

    const used = deps.filter(d => d.used).length;
    const unused = deps.length - used;

    const cardStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    };

    return (
        <div style={{ padding: 16, color: theme.text || '#cbd5e1', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Package2 size={20} style={{ color: theme.accent }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{info.title}</h3>
            </div>

            <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 16, lineHeight: 1.5 }}>{info.note}</p>

            {canList && (
                <div style={{ ...cardStyle, padding: 0 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderBottom: `1px solid ${theme.border}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
                            <Package2 size={13} /> Installed dependencies
                            {deps.length > 0 && (
                                <>
                                    <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '2px 7px', borderRadius: 10, fontSize: 10 }}>
                                        ● {used} used
                                    </span>
                                    {unused > 0 && (
                                        <span style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '2px 7px', borderRadius: 10, fontSize: 10 }}>
                                            ○ {unused} unused
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        <button onClick={loadDeps} title="Refresh" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}>
                            <RefreshCw size={12} className={loading ? 'spin' : ''} />
                        </button>
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 18, opacity: 0.6 }}><Loader2 size={16} className="spin" /></div>
                        ) : deps.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 18, fontSize: 11, opacity: 0.6 }}>
                                No dependencies declared yet
                            </div>
                        ) : deps.map(d => (
                            <div key={d.name} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 12px', fontSize: 12, borderBottom: `1px solid ${theme.border}`,
                            }}>
                                {d.used
                                    ? <CheckCircle2 size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    : <AlertCircle size={11} style={{ color: '#fbbf24', flexShrink: 0 }} />}
                                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</strong>
                                {d.version && <span style={{ opacity: 0.55, fontSize: 10 }}>{d.version}</span>}
                                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.55 }}>
                                    {d.used ? 'in use' : 'unused'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    <Terminal size={12} /> Install a package
                </div>
                <code style={{ display: 'block', background: '#000', padding: '8px 10px', borderRadius: 4, fontSize: 12, color: '#9eff9e', overflowX: 'auto' }}>
                    {info.install}
                </code>
            </div>

            <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    <Terminal size={12} /> List packages
                </div>
                <code style={{ display: 'block', background: '#000', padding: '8px 10px', borderRadius: 4, fontSize: 12, color: '#9eff9e', overflowX: 'auto' }}>
                    {info.list}
                </code>
            </div>

            <a
                href={info.docs}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: theme.accent,
                    textDecoration: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '8px 12px',
                    border: `1px solid ${theme.accent}`,
                    borderRadius: 6,
                    marginTop: 8,
                }}
            >
                <ExternalLink size={12} /> Browse package registry
            </a>
        </div>
    );
};
