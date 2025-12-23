export interface DebugParamsConfig {
  defaults?: DebugParamDefaults;
  configs: DebugParamEntry[];
}

export interface DebugParamDefaults {
  env?: Record<string, string>;
  program?: string;
  inputs?: InputDefinition[];
}

export interface DebugParamEntry {
  name: string;
  platform?: string | string[];
  type?: string;
  env?: Record<string, string>;
  args?: string[] | string;
  program?: string;
  inputs?: InputDefinition[];
}

export interface InputDefinition {
  id: string;
  type: 'promptString' | 'pickString' | 'pickFile' | 'pickFolder';
  description: string;
  default?: string;
  options?: string[];
  password?: boolean;
}

export interface InputCache {
  [configName: string]: {
    [inputId: string]: string;
  };
}
