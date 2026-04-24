import React from 'react';
import { NpmPane } from './NpmPane';
import { PyLibrary } from './PyLibrary';
import { GenericPackagePane } from './GenericPackagePane';

interface PackagesPaneProps {
    projectId: string;
    theme: any;
    language: string;
    runtime: string;
}

export const PackagesPane: React.FC<PackagesPaneProps> = ({ projectId, theme, language, runtime }) => {
    const lang = (language || '').toLowerCase();
    const rt = (runtime || '').toLowerCase();

    if (lang === 'nodejs' || lang === 'js' || lang === 'ts' || rt === 'node' || rt === 'bun') {
        return <NpmPane projectId={projectId} theme={theme} />;
    }

    if (lang === 'python' || rt === 'python') {
        return <PyLibrary projectId={projectId} theme={theme} />;
    }

    return <GenericPackagePane projectId={projectId} theme={theme} language={lang || 'unknown'} runtime={rt || lang} />;
};

export const getPackageManagerLabel = (language: string, runtime: string): string => {
    const lang = (language || '').toLowerCase();
    const rt = (runtime || '').toLowerCase();
    if (rt === 'bun') return 'Bun';
    if (rt === 'deno') return 'Deno';
    if (lang === 'nodejs' || lang === 'js' || lang === 'ts' || rt === 'node') return 'NPM';
    if (lang === 'python' || rt === 'python') return 'PyPI';
    if (lang === 'rust') return 'Cargo';
    if (lang === 'go') return 'Go';
    if (lang === 'java' || lang === 'kotlin') return 'Maven';
    if (lang === 'ruby') return 'Gems';
    if (lang === 'php') return 'Composer';
    if (lang === 'csharp') return 'NuGet';
    if (lang === 'c' || lang === 'cpp') return 'Libs';
    if (lang === 'elixir') return 'Hex';
    if (lang === 'haskell') return 'Cabal';
    if (lang === 'swift') return 'SPM';
    return 'Packages';
};
