/**
 * Service wrapper generation utilities
 */
import fs from "fs";
import path from "path";
import type { ServiceInfo, MethodInfo } from "../types";

/**
 * Extract service name and methods from service file
 */
export function extractServiceInfo(
  filePath: string,
  generatedDir: string,
): ServiceInfo | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Match service definition: export const ServiceName: GenService<{ ... }> = ...
    const serviceMatch = content.match(
      /export const (\w+):\s*GenService<{([\s\S]*?)}>\s*=/,
    );

    if (serviceMatch) {
      const serviceName = serviceMatch[1];
      const methodsBody = serviceMatch[2];
      const methods: MethodInfo[] = [];

      // Extract imports mapping
      const imports: Record<string, string> = {};
      const importRegex =
        /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
      let importMatch;
      while ((importMatch = importRegex.exec(content)) !== null) {
        const symbols = importMatch[1].split(",").map((s) => s.trim());
        const source = importMatch[2];
        symbols.forEach((s) => {
          if (s) imports[s] = source;
        });
      }

      // Extract methods using regex
      // Matches: methodName: { ... input: typeof InputSchema; output: typeof OutputSchema; ... }
      const methodRegex =
        /(\w+):\s*\{\s*[\s\S]*?methodKind:\s*["']unary["'];\s*input:\s*typeof\s+(\w+)Schema;\s*output:\s*typeof\s+(\w+)Schema;/g;

      let methodMatch;
      while ((methodMatch = methodRegex.exec(methodsBody)) !== null) {
        methods.push({
          name: methodMatch[1],
          inputType: methodMatch[2], // e.g. GetBalanceRequest (without Schema)
          inputSchema: methodMatch[2] + "Schema", // e.g. GetBalanceRequestSchema
          outputType: methodMatch[3], // e.g. GetBalanceResponse (without Schema)
          outputSchema: methodMatch[3] + "Schema", // e.g. GetBalanceResponseSchema
        });
      }

      // Get relative path from generated directory
      const relativePath = path
        .relative(generatedDir, filePath)
        .replace(/\\/g, "/")
        .replace(/\.ts$/, "");

      return { serviceName, importPath: relativePath, methods, imports };
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not parse ${filePath}`, error);
  }
  return null;
}

/**
 * Generate service wrapper code
 */
export function generateServiceWrapper(
  name: string,
  serviceInfo: ServiceInfo,
  moduleName?: string,
): string {
  const { serviceName, importPath, methods } = serviceInfo;
  const camelName = name.charAt(0).toLowerCase() + name.slice(1);

  // Determine the relative path to connect-client and generated files
  const connectClientPath = moduleName
    ? "../../connect-client"
    : "../connect-client";
  const generatedPath = moduleName ? "../generated" : "../generated";

  // Collect all imports grouped by source
  const importsBySource: Record<string, Set<string>> = {};
  // Default source is the service file itself
  const defaultSource = `${generatedPath}/${importPath}`;

  const getSourceForSymbol = (symbol: string): string => {
    let source = serviceInfo.imports[symbol];

    // If not found directly, try to infer from Schema if it's a Message type
    // (Messages and their Schemas are usually in the same file)
    if (!source && !symbol.endsWith("Schema")) {
      const schemaSymbol = symbol + "Schema";
      if (serviceInfo.imports[schemaSymbol]) {
        source = serviceInfo.imports[schemaSymbol];
      }
    }

    if (source) {
      // Resolve relative path
      if (source.startsWith(".")) {
        // Construct path relative to the wrapper file
        // importPath is e.g. "pim/product/v1/service_pb"
        const serviceDir = path.dirname(importPath);
        // Resolve source relative to serviceDir
        // We use path.posix to ensure forward slashes for imports
        const resolvedPath = path.posix.join(serviceDir, source);
        return `${generatedPath}/${resolvedPath}`;
      }
      return source;
    }

    return defaultSource;
  };

  const addImport = (symbol: string, isType: boolean = false) => {
    const source = getSourceForSymbol(symbol);
    if (!importsBySource[source]) {
      importsBySource[source] = new Set();
    }
    // If it's a type, we can add "type " prefix here, but it's cleaner to do it in generation
    // However, we need to know if it's a type import or value import
    // For simplicity, we'll generate "type Symbol" for types and "Symbol" for values
    // But here we just store the symbol string.
    // Let's store metadata: { name: string, isType: boolean }
    // But Set can't store objects uniquely easily.
    // Let's just store the string "type Symbol" or "Symbol"
    importsBySource[source].add(isType ? `type ${symbol}` : symbol);
  };

  // Add Service definition import (always value)
  addImport(serviceName);

  methods.forEach((m) => {
    addImport(m.outputType, true); // Output type
    addImport(m.inputSchema, false); // Input schema (value)
  });

  // Generate import statements
  const importStatements = Object.entries(importsBySource)
    .map(([source, symbols]) => {
      const symbolList = Array.from(symbols).sort().join(",\n  ");
      return `import {\n  ${symbolList},\n} from '${source}'`;
    })
    .join("\n");

  return `// ${name} Service Client - Auto-generated
// DO NOT EDIT: This file is automatically generated

import {
  createClient,
  type Client,
  type CallOptions,
} from '@connectrpc/connect'
import type { MessageInitShape } from '@bufbuild/protobuf'
${importStatements}
import { transport } from '${connectClientPath}'

/**
 * ${name} Service Client
 * Created using Connect-RPC's createClient with configured transport
 * This provides full TypeScript type inference for all service methods.
 *
 * NOTE:
 * We explicitly declare the ${name}Client interface so that method
 * signatures are strongly typed and don't rely on complex generic inference.
 */
export interface ${name}Client extends Client<typeof ${serviceName}> {
${methods
  .map(
    (m) => `  ${m.name}(
    request: MessageInitShape<typeof ${m.inputSchema}>,
    options?: CallOptions,
  ): Promise<${m.outputType}>`,
  )
  .join("\n\n")}
}

const client = createClient(${serviceName}, transport) as ${name}Client

export const ${camelName}Client: ${name}Client = client

// Re-export all types from generated file (messages, enums, etc.)
export * as ${camelName}ClientType from '${generatedPath}/${importPath}'
`;
}

/**
 * Generate services index file
 */
export function generateServicesIndexFile(
  services: Array<{ name: string; camelName: string }>,
): string {
  return `// Services Index - Auto-generated exports
// DO NOT EDIT: This file is automatically generated

${services
  .map(
    (s) =>
      `export { ${s.camelName}Client, type ${s.name}Client } from './${s.name.toLowerCase()}.client'`,
  )
  .join("\n")}

// Re-export types namespace
${services
  .map(
    (s) =>
      `export { ${s.camelName}ClientType } from './${s.name.toLowerCase()}.client'`,
  )
  .join("\n")}
`;
}

// generateServicesTypesFile is removed as it is no longer needed

/**
 * Generate service wrappers from scanned files
 */
export async function generateServiceWrappers(
  serviceFiles: string[],
  generatedDir: string,
  servicesDir: string,
  moduleName?: string,
): Promise<void> {
  // Ensure services directory exists
  if (!fs.existsSync(servicesDir)) {
    fs.mkdirSync(servicesDir, { recursive: true });
  }

  const generatedServices: Array<{ name: string; camelName: string }> = [];

  // Generate wrapper for each service file
  for (const filePath of serviceFiles) {
    // Skip third-party services (e.g., google, buf, connect)
    if (
      filePath.includes("/google/") ||
      filePath.includes("/buf/") ||
      filePath.includes("/connect/")
    ) {
      continue;
    }

    const serviceInfo = extractServiceInfo(filePath, generatedDir);
    if (!serviceInfo) continue;

    // Extract clean name (remove "Service" suffix if present)
    const cleanName = serviceInfo.serviceName.replace(/Service$/, "");
    const camelName = cleanName.charAt(0).toLowerCase() + cleanName.slice(1);

    const code = generateServiceWrapper(cleanName, serviceInfo, moduleName);

    const outputPath = path.join(
      servicesDir,
      `${cleanName.toLowerCase()}.client.ts`,
    );
    fs.writeFileSync(outputPath, code);
    console.log(`   ✅ Generated ${cleanName} client`);

    generatedServices.push({ name: cleanName, camelName });
  }

  // Generate services index file (Clients and Types)
  if (generatedServices.length > 0) {
    const servicesIndexContent = generateServicesIndexFile(generatedServices);
    const servicesIndexPath = path.join(servicesDir, "index.ts");
    fs.writeFileSync(servicesIndexPath, servicesIndexContent);
    console.log(`   ✅ Generated services index (with types)`);

    // Removed generation of index.d.ts
  }

  console.log(`   📦 Total services generated: ${generatedServices.length}`);
}
