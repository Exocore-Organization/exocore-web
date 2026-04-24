"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExoConfig = parseExoConfig;
exports.serializeExoConfig = serializeExoConfig;
exports.createDefaultExoConfig = createDefaultExoConfig;
const DEFAULTS = {
    project: {
        name: "unnamed",
        author: "Unknown",
        description: "No description",
        language: "nodejs",
        runtime: "node",
    },
    runtime: {
        run: "npm start",
        port: 3001,
        autoStart: false,
    },
    state: {
        status: "stopped",
    },
};
function parseBlock(content, blockName) {
    const blockRegex = new RegExp(`${blockName}\\s*\\{([^}]*)\\}`, "s");
    const match = content.match(blockRegex);
    if (!match)
        return {};
    const result = {};
    const lines = match[1].split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        result[key] = value;
    }
    return result;
}
function parseExoConfig(content) {
    const projectBlock = parseBlock(content, "project");
    const runtimeBlock = parseBlock(content, "runtime");
    const stateBlock = parseBlock(content, "state");
    const status = (stateBlock.status ?? DEFAULTS.state.status);
    const validStatuses = ["running", "stopped", "error", "building"];
    const resolvedStatus = validStatuses.includes(status)
        ? status
        : "stopped";
    return {
        project: {
            name: projectBlock.name ?? DEFAULTS.project.name,
            author: projectBlock.author ?? DEFAULTS.project.author,
            description: projectBlock.description ?? DEFAULTS.project.description,
            language: projectBlock.language ?? DEFAULTS.project.language,
            runtime: projectBlock.runtime ?? DEFAULTS.project.runtime,
            icon: projectBlock.icon || undefined,
        },
        runtime: {
            run: runtimeBlock.run ?? DEFAULTS.runtime.run,
            port: runtimeBlock.port ? parseInt(runtimeBlock.port, 10) : DEFAULTS.runtime.port,
            autoStart: runtimeBlock.autoStart === "true",
        },
        state: {
            status: resolvedStatus,
        },
    };
}
function serializeExoConfig(config) {
    return `project {
  name = ${config.project.name}
  author = ${config.project.author}
  description = ${config.project.description}
  language = ${config.project.language}
  runtime = ${config.project.runtime}${config.project.icon ? `\n  icon = ${config.project.icon}` : ''}
}

runtime {
  run = ${config.runtime.run}
  port = ${config.runtime.port}
  autoStart = ${config.runtime.autoStart}
}

state {
  status = ${config.state.status}
}
`;
}
function createDefaultExoConfig(name, author = "Developer") {
    return {
        ...DEFAULTS,
        project: {
            ...DEFAULTS.project,
            name,
            author,
        },
    };
}
