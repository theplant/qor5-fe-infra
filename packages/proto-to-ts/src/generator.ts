/**
 * Main generator logic
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { exec } from "child_process";
import { promisify } from "util";
import type { ProtoGenConfig, ValidationResult } from "./types.js";
import { generateBufGenYaml } from "./templates/buf-gen.template.js";
import {
  findBufModuleRoot,
  findProtoFiles,
  findServiceFiles,
  extractBufDependencies,
} from "./utils/proto-scanner.js";
import { applyJsonNameMappings } from "./utils/json-name.js";
import { generateServiceWrappers } from "./utils/service-wrapper.js";

const execAsync = promisify(exec);

export interface GeneratorOptions extends ProtoGenConfig {
  targetPath: string;
  validation: ValidationResult;
  workingDir: string;
}

/**
 * Main generator function
 */
export async function generateFromProto(
  options: GeneratorOptions,
): Promise<void> {
  const {
    targetPath,
    validation,
    workingDir,
    outputDir,
    servicesDir,
    moduleName,
    rpcServiceDir,
  } = options;

  console.log("\n🔄 Starting API generation workflow...\n");

  try {
    // Step 1: Find buf module root and prepare configuration
    console.log("📝 Step 1: Preparing buf configuration...");

    const protoDir =
      validation.type === "directory" ? targetPath : path.dirname(targetPath);

    // Try to find buf module root
    const bufModule = findBufModuleRoot(protoDir);
    let inputDir = protoDir;
    let bufDeps: string[] = [];

    if (bufModule) {
      if (bufModule.modulePath) {
        // Use module path as input
        inputDir = bufModule.modulePath;
        console.log(`   Found buf module at: ${bufModule.root}`);
        console.log(`   Using module path: ${inputDir}`);
      } else {
        // Use root as input
        inputDir = bufModule.root;
        console.log(`   Found buf workspace at: ${bufModule.root}`);
      }

      // Extract dependencies from buf.yaml
      const bufYamlPath = path.join(bufModule.root, "buf.yaml");
      bufDeps = extractBufDependencies(bufYamlPath);
      if (bufDeps.length > 0) {
        console.log(`   Found ${bufDeps.length} buf dependencies:`);
        bufDeps.forEach((dep) => console.log(`     - ${dep}`));
      }
    } else {
      console.log(`   No buf.yaml found, using directory: ${protoDir}`);
    }

    // Generate buf.gen.yaml content
    const bufGenContent = generateBufGenYaml(outputDir, inputDir, bufDeps);
    const tempBufConfig = path.join(workingDir, "buf.gen.temp.yaml");
    fs.writeFileSync(tempBufConfig, bufGenContent);
    console.log(`   Created temporary buf config`);

    // Step 1.5: Clean output directories to avoid stale files
    console.log("\n🧹 Step 1.5: Cleaning output directories...");
    const resolvedCleanOutputDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.join(workingDir, outputDir);

    if (fs.existsSync(resolvedCleanOutputDir)) {
      fs.rmSync(resolvedCleanOutputDir, { recursive: true, force: true });
      console.log(`   Deleted: ${resolvedCleanOutputDir}`);
    }

    if (servicesDir) {
      const resolvedCleanServicesDir = path.isAbsolute(servicesDir)
        ? servicesDir
        : path.join(workingDir, servicesDir);

      if (fs.existsSync(resolvedCleanServicesDir)) {
        fs.rmSync(resolvedCleanServicesDir, { recursive: true, force: true });
        console.log(`   Deleted: ${resolvedCleanServicesDir}`);
      }
    }

    // Step 2: Generate Connect-RPC clients from protobuf using buf
    console.log("\n📝 Step 2: Generating Connect-RPC clients from protobuf...");
    console.log(`   Processing ${validation.files!.length} proto file(s)...`);

    // Detect package manager and use appropriate command
    const { detectPackageManager } = await import("./utils/package-manager.js");
    const packageManager = detectPackageManager(workingDir);

    // Get the path to proto-to-ts node_modules for protoc-gen plugins
    // Use import.meta.url to get current module path in ES modules
    const currentFilePath = fileURLToPath(import.meta.url);
    const protoToTsPath = path.resolve(path.dirname(currentFilePath), "..");
    const pluginsPath = path.join(protoToTsPath, "node_modules", ".bin");

    let bufCommand: string;
    switch (packageManager) {
      case "pnpm":
        bufCommand = `pnpm exec buf generate --template ${tempBufConfig}`;
        break;
      case "yarn":
        bufCommand = `yarn buf generate --template ${tempBufConfig}`;
        break;
      default:
        bufCommand = `npx buf generate --template ${tempBufConfig}`;
    }

    // Add proto-to-ts plugins path to PATH
    const env = {
      ...process.env,
      PATH: `${pluginsPath}:${process.env.PATH}`,
    };

    const { stdout: stdout1, stderr: stderr1 } = await execAsync(bufCommand, {
      cwd: workingDir,
      env,
    });
    if (stdout1) console.log(stdout1);
    if (stderr1 && !stderr1.includes("deprecated")) console.error(stderr1);

    // Clean up temporary config
    fs.unlinkSync(tempBufConfig);

    // Step 2.5: Apply json_name mappings to generated files
    console.log("\n📝 Step 2.5: Applying json_name mappings...");
    const resolvedOutputDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.join(workingDir, outputDir);

    // Scan all proto files in the input directory to find json_name definitions
    console.log(`   📂 Scanning proto directory: ${inputDir}`);
    const allProtoFiles = findProtoFiles(inputDir);
    console.log(
      `   📄 Found ${allProtoFiles.length} proto file(s) to scan for json_name declarations`,
    );
    applyJsonNameMappings(resolvedOutputDir, allProtoFiles);

    // Step 3: Scan generated files and update service wrappers (if configured)
    if (servicesDir) {
      console.log("\n📝 Step 3: Scanning generated service files...");
      const serviceFiles = findServiceFiles(resolvedOutputDir);

      if (serviceFiles.length === 0) {
        console.warn(
          "⚠️  Warning: No service files found in generated directory",
        );
      } else {
        console.log(`   Found ${serviceFiles.length} service file(s):`);
        serviceFiles.forEach((file, index) => {
          console.log(`   ${index + 1}. ${path.basename(file)}`);
        });

        // Step 4: Generate service wrappers
        console.log("\n📝 Step 4: Generating service wrappers...");
        const resolvedServicesDir = path.isAbsolute(servicesDir)
          ? servicesDir
          : path.join(workingDir, servicesDir);
        await generateServiceWrappers(
          serviceFiles,
          resolvedOutputDir,
          resolvedServicesDir,
          moduleName,
        );
      }
    }

    // Step 5: Generate RPC service structure if moduleName and rpcServiceDir are provided
    if (moduleName && rpcServiceDir) {
      console.log("\n📝 Step 5: Generating RPC service structure...");
      const { generateConnectClientTemplate, generateRpcServiceIndexTemplate } =
        await import("./templates/connect-client.template.js");

      const resolvedRpcServiceDir = path.isAbsolute(rpcServiceDir)
        ? rpcServiceDir
        : path.join(workingDir, rpcServiceDir);

      // Ensure rpc-service directory exists
      if (!fs.existsSync(resolvedRpcServiceDir)) {
        fs.mkdirSync(resolvedRpcServiceDir, { recursive: true });
      }

      // Generate shared connect-client.ts if it doesn't exist
      const connectClientPath = path.join(
        resolvedRpcServiceDir,
        "connect-client.ts",
      );
      if (!fs.existsSync(connectClientPath)) {
        fs.writeFileSync(connectClientPath, generateConnectClientTemplate());
        console.log("   ✅ Generated shared connect-client.ts");
      } else {
        console.log("   ⏭️  Shared connect-client.ts already exists, skipping");
      }

      // Read existing modules from directory
      const modules: string[] = [];
      if (fs.existsSync(resolvedRpcServiceDir)) {
        const items = fs.readdirSync(resolvedRpcServiceDir);
        for (const item of items) {
          const itemPath = path.join(resolvedRpcServiceDir, item);
          if (
            fs.statSync(itemPath).isDirectory() &&
            fs.existsSync(path.join(itemPath, "services"))
          ) {
            modules.push(item);
          }
        }
      }

      // Generate top-level index.ts
      const rpcIndexPath = path.join(resolvedRpcServiceDir, "index.ts");

      // Read existing content to merge imports if needed (though template rewrites it)
      // The template generator now takes care of generating unique exports for all modules
      fs.writeFileSync(rpcIndexPath, generateRpcServiceIndexTemplate(modules));
      console.log(`   ✅ Generated index.ts (${modules.length} modules)`);
      console.log(`   📦 Registered modules: ${modules.join(", ")}`);
    }

    console.log("\n✅ Complete API generation workflow finished!");
    console.log(`📂 Generated from: ${targetPath}`);
    console.log(`📊 Total proto files: ${validation.files!.length}`);
  } catch (error: any) {
    console.error("\n❌ Error during API generation:", error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);

    // Clean up temp file if exists
    const tempBufConfig = path.join(workingDir, "buf.gen.temp.yaml");
    if (fs.existsSync(tempBufConfig)) {
      fs.unlinkSync(tempBufConfig);
    }

    throw error;
  }
}
