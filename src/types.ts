export interface DebugParamsConfig {
  configs: DebugParamEntry[];
}

export interface DebugParamEntry {
  name: string;
  platform?: string | string[];
  type?: string;
  env?: Record<string, string>;
  args?: string[] | string;
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
