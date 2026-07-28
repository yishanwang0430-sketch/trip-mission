import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const entry = path.join(rootDir, "game.js");
const modules = [];
const moduleIds = new Map();

async function collect(filename) {
  const normalized = path.normalize(filename);
  if (moduleIds.has(normalized)) return moduleIds.get(normalized);
  const id = modules.length;
  moduleIds.set(normalized, id);
  modules.push(null);
  let source = await fs.readFile(normalized, "utf8");
  const requirePattern = /require\((['"])(\.\.?\/[^'"]+)\1\)/g;
  const dependencies = [...source.matchAll(requirePattern)];
  for (const match of dependencies) {
    const target = path.resolve(path.dirname(normalized), match[2].endsWith(".js") ? match[2] : `${match[2]}.js`);
    const dependencyId = await collect(target);
    source = source.replace(match[0], `__require(${dependencyId})`);
  }
  modules[id] = source;
  return id;
}

const entryId = await collect(entry);
const wrapped = modules.map((source, id) => `${id}: function(module, exports, __require) {\n${source}\n}`).join(",\n");
const bundle = `(function(){\nconst modules={${wrapped}};\nconst cache={};\nfunction __require(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};modules[id](module,module.exports,__require);return module.exports;}\n__require(${entryId});\n})();\n`;
await fs.writeFile(path.join(rootDir, "preview", "game.bundle.js"), bundle);
console.log(`Built ${modules.length} modules into preview/game.bundle.js`);

