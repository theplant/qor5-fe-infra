/**
 * Type definitions for proto-gen-tool
 */

export interface HistoryRecord {
  path: string;
  timestamp: number;
  type: "file" | "directory";
}

export interface History {
  records: HistoryRecord[];
}

export interface ProtoGenConfig {
  // Output directory for generated code
  outputDir: string;
  // Directory for service wrappers (optional)
  servicesDir?: string;
  // Module name for multi-project organization (e.g., "pim", "ciam")
  moduleName?: string;
  // Root directory for RPC services (e.g., "src/lib/api/rpc-service")
  rpcServiceDir?: string;
  // History file path
  historyFile?: string;
  // Maximum history records to keep
  maxHistory?: number;
  // Custom buf.gen.yaml template (optional)
  bufGenTemplate?: string;
  // Additional buf modules to include in inputs
  additionalModules?: string[];
}

export interface ValidationResult {
  valid: boolean;
  type?: "file" | "directory";
  files?: string[];
}

export interface BufModuleInfo {
  root: string;
  modulePath?: string;
}

export interface MethodInfo {
  name: string;
  inputType: string;
  inputSchema: string;
  outputType: string;
  outputSchema: string;
}

export interface ServiceInfo {
  serviceName: string;
  importPath: string;
  methods: MethodInfo[];
  imports: Record<string, string>;
}

export interface BufGenConfig {
  version: string;
  managed: {
    enabled: boolean;
    disable?: Array<{ module: string }>;
    override?: Array<{ file_option: string; value: string }>;
  };
  inputs: Array<{ directory?: string; module?: string }>;
  plugins: Array<{
    local?: string;
    remote?: string;
    out: string;
    opt?: string[];
  }>;
}
